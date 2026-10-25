import Peer, { DataConnection } from 'peerjs';
import {
  ChunkData,
  CreatureEntity,
  DroppedItem,
  GAME_VERSION,
  OnlineActivationStep,
  OnlinePeerSummary,
  OnlineSessionInfo,
  PlayerState,
  RemotePlayerState,
  WorldSaveData,
} from '../core/types';

export interface MultiplayerCallbacks {
  onSessionChanged?: (session: OnlineSessionInfo) => void;
  onRemotePlayersChanged?: () => void;
  onWorldSnapshotReceived?: (snapshot: WorldSaveData) => void;
  onChunkSyncReceived?: (chunkKey: string, chunkData: ChunkData) => void;
  onSpawnDropReceived?: (drop: DroppedItem) => void;
  onPickupDropReceived?: (dropId: string, peerId: string) => void;
  onDropsSyncReceived?: (drops: DroppedItem[]) => void;
  onCreaturesSyncReceived?: (creatures: CreatureEntity[]) => void;
  onCreatureHitReceived?: (
    creatureId: string,
    damage: number,
    sourceX: number,
    sourceY: number,
    knockbackMult?: number
  ) => void;
  onTimeSyncReceived?: (timeOfDay: number, dayCount: number) => void;
  onPlayerEventNotification?: (text: string, color?: string) => void;
  onRoomClosedByHost?: (reason: string) => void;
  onRequestHostSnapshot?: () => WorldSaveData | null;
  onPeerLeft?: (peerId: string, peerName?: string) => void;
  onGuestMountEventReceived?: (peerId: string, event: any) => void;
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const P2P_ROOM_PREFIX = 'wildborn-mp-room-';
const SNAPSHOT_CHUNK_SIZE = 20 * 1024; // 20 KB per WebRTC DataChannel frame to prevent SCTP buffer stalls

const RTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export class MultiplayerManager {
  public peerId: string;
  public localPlayerName: string;
  public isOnline = false;
  public role: 'HOST' | 'GUEST' | 'OFFLINE' = 'OFFLINE';
  public inviteCode: string | null = null;
  public worldName = '';
  public hostName = '';
  public statusMessage: string | null = null;
  public lastError: string | null = null;
  public activationState: 'IDLE' | 'ACTIVATING' | 'ACTIVE' | 'ERROR' = 'IDLE';
  public activationSteps: OnlineActivationStep[] = [];
  public transportMode: 'WEBSOCKET' | 'HTTP_SYNC' | 'P2P_WEBRTC' | 'NONE' =
    'NONE';
  public syncStatus: 'SYNCED' | 'RESYNCING' | 'DEGRADED' = 'SYNCED';
  public worldRevision = 1;
  public connectedPeers: OnlinePeerSummary[] = [];
  public remotePlayers = new Map<string, RemotePlayerState>();

  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks = {};
  private customServerUrl = '';
  private intentionalClose = false;
  private httpSyncInterval: number | null = null;
  private isHttpSyncInFlight = false;
  private latestLocalPlayerState: any = null;
  private outgoingHttpEvents: any[] = [];
  private pendingFullSnapshotRequest = false;
  private consecutiveHttpFailures = 0;

  // Event deduplication & revision tracking
  private processedEventIds = new Set<string>();
  private processedEventOrder: string[] = [];
  private localEventCounter = 0;
  private lastPacketReceivedAt = 0;
  private peerLastPacketAt = new Map<string, number>();
  private lastWsReconnectAttemptAt = 0;
  private lastResyncRequestAt = 0;

  // P2P WebRTC (PeerJS) state for serverless / GitHub static deployments
  private p2pPeer: Peer | null = null;
  private p2pHostConn: DataConnection | null = null; // Used when role === 'GUEST'
  private p2pGuestConnections = new Map<string, DataConnection>(); // Used when role === 'HOST'
  private p2pKeepAliveInterval: number | null = null;
  private isP2PReconnecting = false;
  private p2pReconnectFailures = 0;
  private lastHostBrokerCheckAt = 0;
  private initialHostSnapshot: WorldSaveData | null = null;
  private incomingSnapshotChunks: string[] = [];
  private incomingSnapshotTotal = 0;
  private incomingFramedPayloads = new Map<
    string,
    { chunks: string[]; total: number; createdAt: number }
  >();

  constructor(localPlayerName = 'Aventureiro', customServerUrl = '') {
    this.peerId =
      'peer_' +
      Math.random().toString(36).slice(2, 9) +
      '_' +
      Date.now().toString(36).slice(-4);
    this.localPlayerName = (localPlayerName || 'Aventureiro')
      .trim()
      .slice(0, 22);
    this.customServerUrl = customServerUrl;
  }

  public static generateRandomInviteCode(length = 6): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(Math.random() * INVITE_ALPHABET.length);
      code += INVITE_ALPHABET[idx];
    }
    return code;
  }

  public static buildRoomPeerId(inviteCode: string): string {
    const clean = inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `${P2P_ROOM_PREFIX}${clean}`;
  }

  public setCallbacks(cb: MultiplayerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  public setCustomServerUrl(url: string): void {
    this.customServerUrl = url;
  }

  public getSessionInfo(): OnlineSessionInfo {
    return {
      isOnline: this.isOnline,
      role: this.role,
      inviteCode: this.inviteCode,
      worldName: this.worldName,
      hostName: this.hostName,
      localPlayerName: this.localPlayerName,
      connectedPeers: [...this.connectedPeers],
      gameVersion: GAME_VERSION,
      statusMessage: this.statusMessage,
      activationState: this.activationState,
      activationSteps: this.activationSteps.map((s) => ({ ...s })),
      transportMode: this.transportMode,
      syncStatus: this.syncStatus,
      worldRevision: this.worldRevision,
      lastError: this.lastError,
    };
  }

  public static resolveHttpBaseUrl(customServerUrl?: string): string {
    const cleanCustom = (customServerUrl || '').trim().replace(/\/+$/, '');
    if (
      cleanCustom &&
      (cleanCustom.startsWith('http://') || cleanCustom.startsWith('https://'))
    ) {
      return cleanCustom;
    }
    return '';
  }

  public static resolveWebSocketUrl(customServerUrl?: string): string {
    const cleanCustom = (customServerUrl || '').trim().replace(/\/+$/, '');
    if (cleanCustom) {
      if (cleanCustom.startsWith('ws://') || cleanCustom.startsWith('wss://')) {
        return `${cleanCustom}/ws-game`;
      }
      if (cleanCustom.startsWith('https://')) {
        return `wss://${cleanCustom.slice('https://'.length)}/ws-game`;
      }
      if (cleanCustom.startsWith('http://')) {
        return `ws://${cleanCustom.slice('http://'.length)}/ws-game`;
      }
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws-game`;
  }

  private markEventProcessed(eventKey: string | number | undefined): boolean {
    if (eventKey === undefined || eventKey === null) return false;
    const key = String(eventKey);
    if (this.processedEventIds.has(key)) {
      return true;
    }
    this.processedEventIds.add(key);
    this.processedEventOrder.push(key);
    if (this.processedEventOrder.length > 450) {
      const oldest = this.processedEventOrder.shift();
      if (oldest) {
        this.processedEventIds.delete(oldest);
      }
    }
    return false;
  }

  private nextClientEventId(): string {
    this.localEventCounter += 1;
    return `${this.peerId}_${Date.now().toString(36)}_${this.localEventCounter}`;
  }

  private setStepStatus(
    id: string,
    status: 'pending' | 'loading' | 'success' | 'error',
    detail?: string
  ): void {
    const step = this.activationSteps.find((s) => s.id === id);
    if (step) {
      step.status = status;
      if (detail !== undefined) {
        step.detail = detail;
      }
    }
    this.emitSessionChange();
  }

  private serializeLocalPlayerState(player: PlayerState) {
    const heldSlot = player.inventory[player.selectedHotbarIndex];
    return {
      x: Math.round(player.x * 10) / 10,
      y: Math.round(player.y * 10) / 10,
      vx: Math.round(player.vx * 10) / 10,
      vy: Math.round(player.vy * 10) / 10,
      direction: player.direction,
      hp: player.hp,
      maxHp: player.maxHp,
      level: player.level,
      isMoving: player.isMoving,
      isSwimming: Boolean(player.isSwimming),
      mountedEntityId: player.mountedEntityId || null,
      isGalloping: Boolean(player.isGalloping),
      mountedCreatureData: player.mountedCreatureData || null,
      swingTimer: player.swingTimer,
      swingDuration: player.swingDuration,
      heldItemId: heldSlot?.itemId || null,
      equippedArmorId: player.equippedArmorId,
      equippedBySlot: player.equippedBySlot,
      appearance: player.appearance,
    };
  }

  /**
   * Strips heavy static arrays (`trades`, `favoriteFoodIds`) when broadcasting frequent creature sync frames
   * so WebRTC DataChannels and WebSockets never suffer buffer bloat or congestion.
   */
  private serializeCreaturesForSync(creatures: CreatureEntity[]): any[] {
    return creatures.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      x: Math.round(c.x * 10) / 10,
      y: Math.round(c.y * 10) / 10,
      vx: Math.round(c.vx * 10) / 10,
      vy: Math.round(c.vy * 10) / 10,
      direction: c.direction,
      hp: c.hp,
      maxHp: c.maxHp,
      isHostile: c.isHostile,
      tamed: c.tamed,
      tameProgress: c.tameProgress,
      aiState: c.aiState,
      animFrame: c.animFrame,
      hitFlashTimer: c.hitFlashTimer,
      attackDamage: c.attackDamage,
      attackTimer: c.attackTimer,
      attackCooldown: c.attackCooldown,
      isElite: c.isElite,
      moveSpeed: c.moveSpeed,
      swimSpeed: c.swimSpeed,
      isSwimming: c.isSwimming,
      hasSaddle: c.hasSaddle,
      mountSpeed: c.mountSpeed,
      mountStamina: c.mountStamina,
      mountMaxStamina: c.mountMaxStamina,
      mountInventory: c.mountInventory,
      riderPlayerId: c.riderPlayerId ?? null,
      passengerPlayerId: c.passengerPlayerId ?? null,
      passengerPetId: c.passengerPetId ?? null,
      npcRole: c.npcRole,
      npcProfessionLabel: c.npcProfessionLabel,
      villageId: c.villageId,
      homeX: c.homeX,
      homeY: c.homeY,
      homeHouseId: c.homeHouseId,
      isInsideHouse: c.isInsideHouse,
      affinity: c.affinity,
      hasBoughtToday: c.hasBoughtToday,
      attractedStallId: c.attractedStallId,
      stallInspectionsToday: c.stallInspectionsToday,
      peaceDebtCoins: c.peaceDebtCoins,
    }));
  }

  /**
   * Opens the current world for online multiplayer as HOST.
   * Automatically uses the dedicated backend API if available, or seamlessly switches
   * to Serverless P2P WebRTC (PeerJS) when running on static hosts (GitHub Pages, Vercel, Netlify, etc.).
   */
  public async hostWorld(
    worldSnapshot: WorldSaveData,
    localPlayer: PlayerState,
    preferredCode?: string
  ): Promise<boolean> {
    this.stopHttpSyncLoop();
    this.closeSocketInternal();
    this.closeP2PInternal();
    this.intentionalClose = false;
    this.role = 'HOST';
    this.worldName = worldSnapshot.metadata?.name || 'Mundo Online';
    this.hostName = this.localPlayerName;
    this.initialHostSnapshot = worldSnapshot;
    this.lastError = null;
    this.syncStatus = 'SYNCED';
    this.worldRevision = 1;
    this.lastPacketReceivedAt = Date.now();
    this.activationState = 'ACTIVATING';
    this.statusMessage = 'Iniciando ativação do mundo online...';

    this.activationSteps = [
      {
        id: 'snapshot',
        label: '1. Preparando snapshot do mundo e herói',
        status: 'loading',
        detail: 'Serializando chunks e entidades...',
      },
      {
        id: 'server_check',
        label: '2. Verificando comunicação com o servidor',
        status: 'pending',
        detail: 'Aguardando...',
      },
      {
        id: 'register_room',
        label: '3. Registrando sala e gerando Código de Convite',
        status: 'pending',
        detail: 'Aguardando...',
      },
      {
        id: 'realtime_channel',
        label: '4. Sincronizando canal de pareamento em tempo real',
        status: 'pending',
        detail: 'Aguardando...',
      },
    ];
    this.emitSessionChange();

    const baseUrl = MultiplayerManager.resolveHttpBaseUrl(this.customServerUrl);

    // STEP 1: Prepare & validate snapshot
    let playerStatePayload: any;
    let payloadKb = 0;
    try {
      playerStatePayload = this.serializeLocalPlayerState(localPlayer);
      this.latestLocalPlayerState = playerStatePayload;
      const chunkCount = Object.keys(worldSnapshot.chunks || {}).length;
      const rawJson = JSON.stringify({
        metadata: worldSnapshot.metadata,
        chunksCount: chunkCount,
      });
      payloadKb = Math.max(
        1,
        Math.round(
          (JSON.stringify(worldSnapshot).length || rawJson.length) / 1024
        )
      );
      this.setStepStatus(
        'snapshot',
        'success',
        `OK (${chunkCount} chunks · ~${payloadKb} KB)`
      );
    } catch (err: any) {
      const msg =
        err?.message || 'Erro ao preparar dados do mundo para envio.';
      this.setStepStatus('snapshot', 'error', msg);
      this.activationState = 'ERROR';
      this.lastError = msg;
      this.statusMessage = `Falha na etapa 1: ${msg}`;
      this.emitSessionChange();
      return false;
    }

    // STEP 2: Check dedicated backend API first; if HTTP 404 / static host, switch to P2P WebRTC Broker
    this.setStepStatus(
      'server_check',
      'loading',
      'Verificando rota de rede...'
    );
    const pingStart = performance.now();
    let hasDedicatedBackend = false;

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 2200);
      const pingRes = await fetch(`${baseUrl}/api/mp/ping`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (pingRes.ok) {
        const pingData = await pingRes.json().catch(() => null);
        if (pingData && pingData.ok) {
          hasDedicatedBackend = true;
          const latencyMs = Math.max(
            1,
            Math.round(performance.now() - pingStart)
          );
          this.setStepStatus(
            'server_check',
            'success',
            `Servidor dedicado ativo (${latencyMs} ms)`
          );
        }
      }
    } catch {
      hasDedicatedBackend = false;
    }

    // PATH A: Serverless P2P WebRTC Mode (Automatic when deployed on GitHub / Static Host)
    if (!hasDedicatedBackend) {
      this.setStepStatus(
        'server_check',
        'loading',
        'Ativando Rede Global P2P WebRTC...'
      );

      const p2pStart = performance.now();
      const desiredCode = (preferredCode || this.inviteCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

      const p2pResult = await this.openP2PHostRoom(
        desiredCode.length >= 4 ? desiredCode : undefined,
        localPlayer.level,
        p2pStart
      );

      if (!p2pResult.ok || !p2pResult.inviteCode) {
        const errMsg =
          p2pResult.error ||
          'Não foi possível conectar ao servidor de pareamento P2P.';
        this.setStepStatus('server_check', 'error', errMsg);
        this.setStepStatus('register_room', 'error', 'Cancelado');
        this.activationState = 'ERROR';
        this.isOnline = false;
        this.role = 'OFFLINE';
        this.lastError = errMsg;
        this.statusMessage = errMsg;
        this.emitSessionChange();
        return false;
      }

      this.isOnline = true;
      this.role = 'HOST';
      this.inviteCode = p2pResult.inviteCode;
      this.transportMode = 'P2P_WEBRTC';
      this.syncStatus = 'SYNCED';
      this.connectedPeers = [
        {
          peerId: this.peerId,
          name: this.localPlayerName,
          isHost: true,
          level: localPlayer.level,
        },
      ];

      this.setStepStatus(
        'register_room',
        'success',
        `Sala P2P aberta! Código: ${this.inviteCode}`
      );
      this.setStepStatus(
        'realtime_channel',
        'success',
        'Pareamento Direto P2P WebRTC ativo'
      );

      this.startSyncWatchdogLoop();
      this.activationState = 'ACTIVE';
      this.lastError = null;
      this.statusMessage =
        'Mundo online ativo via P2P! Compartilhe o código de convite com outros jogadores.';
      this.emitSessionChange();
      return true;
    }

    // PATH B: Dedicated Express Server Mode (+ Parallel P2P Bridge for universal compatibility)
    this.setStepStatus(
      'register_room',
      'loading',
      'Solicitando Código de Convite...'
    );
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6000);
      const hostRes = await fetch(`${baseUrl}/api/mp/host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId: this.peerId,
          playerName: this.localPlayerName,
          preferredCode: preferredCode ?? this.inviteCode ?? '',
          gameVersion: GAME_VERSION,
          worldSnapshot,
          playerState: playerStatePayload,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      let hostData: any = null;
      try {
        hostData = await hostRes.json();
      } catch {
        hostData = null;
      }

      if (!hostRes.ok || !hostData || !hostData.ok || !hostData.inviteCode) {
        throw new Error(
          hostData?.error || `Falha ao registrar sala (HTTP ${hostRes.status})`
        );
      }

      this.isOnline = true;
      this.role = 'HOST';
      this.inviteCode = hostData.inviteCode;
      this.worldName = hostData.worldName || this.worldName;
      this.hostName = hostData.hostName || this.localPlayerName;
      this.worldRevision = hostData.worldRevision || 1;
      this.connectedPeers = hostData.peers || [
        {
          peerId: this.peerId,
          name: this.localPlayerName,
          isHost: true,
          level: localPlayer.level,
        },
      ];
      this.transportMode = 'HTTP_SYNC';
      this.syncStatus = 'SYNCED';

      this.setStepStatus(
        'register_room',
        'success',
        `Sala aberta! Código: ${this.inviteCode}`
      );
    } catch (err: any) {
      // If POST /api/mp/host failed for any reason, fallback to P2P WebRTC automatically!
      const p2pFallback = await this.openP2PHostRoom(
        undefined,
        localPlayer.level,
        performance.now()
      );
      if (p2pFallback.ok && p2pFallback.inviteCode) {
        this.isOnline = true;
        this.role = 'HOST';
        this.inviteCode = p2pFallback.inviteCode;
        this.transportMode = 'P2P_WEBRTC';
        this.syncStatus = 'SYNCED';
        this.connectedPeers = [
          {
            peerId: this.peerId,
            name: this.localPlayerName,
            isHost: true,
            level: localPlayer.level,
          },
        ];
        this.setStepStatus(
          'register_room',
          'success',
          `Sala P2P aberta! Código: ${this.inviteCode}`
        );
        this.setStepStatus(
          'realtime_channel',
          'success',
          'Pareamento Direto P2P WebRTC ativo'
        );
        this.startSyncWatchdogLoop();
        this.activationState = 'ACTIVE';
        this.lastError = null;
        this.statusMessage =
          'Mundo online ativo via P2P! Compartilhe o código de convite.';
        this.emitSessionChange();
        return true;
      }

      const detail =
        err?.name === 'AbortError'
          ? 'Tempo limite excedido ao enviar snapshot do mundo.'
          : err?.message || 'Erro ao criar sala online.';
      this.setStepStatus('register_room', 'error', detail);
      this.activationState = 'ERROR';
      this.isOnline = false;
      this.role = 'OFFLINE';
      this.lastError = `Falha ao abrir sala: ${detail}`;
      this.statusMessage = this.lastError;
      this.emitSessionChange();
      return false;
    }

    // Start HTTP Realtime Sync loop + Continuous Sync Watchdog
    this.startHttpSyncLoop();
    this.startSyncWatchdogLoop();

    // Also open P2P listener on the same inviteCode in the background so cross-origin/mobile players can pair via P2P too!
    if (this.inviteCode) {
      void this.openP2PHostRoom(
        this.inviteCode,
        localPlayer.level,
        performance.now(),
        true
      );
    }

    // STEP 4: Connect WebSocket (/ws-game) for low-latency streaming (with automatic HTTP fallback)
    this.setStepStatus(
      'realtime_channel',
      'loading',
      'Conectando canal de sincronização...'
    );
    const wsAttached = await this.tryAttachWebSocket(1400);

    if (wsAttached) {
      this.transportMode = 'WEBSOCKET';
      this.setStepStatus(
        'realtime_channel',
        'success',
        'WebSocket + HTTP + P2P Tempo Real ativos'
      );
    } else {
      this.transportMode = 'HTTP_SYNC';
      this.setStepStatus(
        'realtime_channel',
        'success',
        'Sincronização Contínua HTTP + P2P ativos'
      );
    }

    this.activationState = 'ACTIVE';
    this.lastError = null;
    this.statusMessage =
      'Mundo online ativo! Compartilhe o código de convite com outros jogadores.';
    this.emitSessionChange();
    return true;
  }

  /**
   * Registers a deterministic PeerJS room ID (`wildborn-mp-room-XXXXXX`) so any player
   * on the internet can join using only the 6-character invite code without a custom backend.
   */
  private openP2PHostRoom(
    preferredCode: string | undefined,
    hostLevel: number,
    startTimeMs: number,
    silentBackground = false
  ): Promise<{ ok: boolean; inviteCode?: string; error?: string }> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 4;
      let settled = false;

      const finish = (res: {
        ok: boolean;
        inviteCode?: string;
        error?: string;
      }) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };

      const tryCreatePeer = (candidateCode: string) => {
        attempts++;
        if (!silentBackground) {
          this.setStepStatus(
            'register_room',
            'loading',
            `Registrando código ${candidateCode} na rede P2P...`
          );
        }

        const roomPeerId = MultiplayerManager.buildRoomPeerId(candidateCode);
        let peer: Peer;
        try {
          peer = new Peer(roomPeerId, {
            debug: 0,
            config: {
              iceServers: RTC_ICE_SERVERS,
            },
          });
        } catch (err: any) {
          finish({
            ok: false,
            error: err?.message || 'Falha ao inicializar WebRTC no navegador.',
          });
          return;
        }

        const timeoutId = window.setTimeout(() => {
          try {
            peer.destroy();
          } catch {
            // ignore
          }
          finish({
            ok: false,
            error:
              'Tempo limite excedido (8s) ao conectar ao servidor de pareamento P2P.',
          });
        }, 8500);

        peer.on('open', () => {
          window.clearTimeout(timeoutId);
          this.p2pPeer = peer;

          if (!silentBackground) {
            const latencyMs = Math.max(
              1,
              Math.round(performance.now() - startTimeMs)
            );
            this.setStepStatus(
              'server_check',
              'success',
              `Broker P2P Global conectado (${latencyMs} ms)`
            );
          }

          peer.on('connection', (conn) => {
            this.handleIncomingP2PGuestConnection(conn, hostLevel);
          });

          peer.on('disconnected', () => {
            if (
              !this.intentionalClose &&
              this.p2pPeer &&
              !this.p2pPeer.destroyed
            ) {
              try {
                this.p2pPeer.reconnect();
              } catch {
                // ignore
              }
            }
          });

          finish({ ok: true, inviteCode: candidateCode });
        });

        peer.on('error', (err: any) => {
          window.clearTimeout(timeoutId);
          const errType = err?.type || '';
          if (
            errType === 'unavailable-id' &&
            attempts < maxAttempts &&
            !silentBackground
          ) {
            try {
              peer.destroy();
            } catch {
              // ignore
            }
            const nextCode = MultiplayerManager.generateRandomInviteCode(6);
            tryCreatePeer(nextCode);
            return;
          }

          if (!this.isOnline && !silentBackground) {
            finish({
              ok: false,
              error:
                err?.message ||
                `Erro no pareamento P2P (${errType || 'desconhecido'}).`,
            });
          } else {
            finish({ ok: false, error: errType });
          }
        });
      };

      const initialCode =
        preferredCode && preferredCode.length >= 4
          ? preferredCode
          : MultiplayerManager.generateRandomInviteCode(6);

      tryCreatePeer(initialCode);
    });
  }

  /**
   * Sends a full world snapshot over a P2P DataChannel in safe 20 KB chunks.
   */
  private sendChunkedWorldSnapshotToGuest(
    conn: DataConnection,
    guestPeerId: string,
    isResync = false
  ): void {
    const freshSnapshot =
      this.callbacks.onRequestHostSnapshot?.() || this.initialHostSnapshot;
    if (!freshSnapshot) return;

    const serializedSnapshot = JSON.stringify(freshSnapshot);
    const totalChunks = Math.max(
      1,
      Math.ceil(serializedSnapshot.length / SNAPSHOT_CHUNK_SIZE)
    );

    for (let i = 0; i < totalChunks; i++) {
      const slice = serializedSnapshot.slice(
        i * SNAPSHOT_CHUNK_SIZE,
        (i + 1) * SNAPSHOT_CHUNK_SIZE
      );
      this.safeSendConn(
        conn,
        {
          type: 'p2p_snapshot_chunk',
          index: i,
          total: totalChunks,
          chunk: slice,
        },
        true
      );
    }

    const remoteStates = this.collectAllPlayerStatesForPeer(guestPeerId);

    this.safeSendConn(
      conn,
      {
        type: isResync ? 'p2p_resync_completed' : 'p2p_join_accepted',
        inviteCode: this.inviteCode,
        worldName: this.worldName,
        hostName: this.hostName,
        gameVersion: GAME_VERSION,
        worldRevision: this.worldRevision,
        peers: this.connectedPeers,
        remoteStates,
      },
      true
    );
  }

  private collectAllPlayerStatesForPeer(excludePeerId?: string): any[] {
    const remoteStates: any[] = [];
    if (this.latestLocalPlayerState && this.peerId !== excludePeerId) {
      remoteStates.push({
        ...this.latestLocalPlayerState,
        peerId: this.peerId,
        name: this.localPlayerName,
        isHost: this.role === 'HOST',
      });
    }
    for (const rp of this.remotePlayers.values()) {
      if (rp.peerId !== excludePeerId) {
        remoteStates.push({
          peerId: rp.peerId,
          name: rp.name,
          isHost: rp.isHost,
          x: rp.targetX,
          y: rp.targetY,
          vx: rp.vx,
          vy: rp.vy,
          direction: rp.direction,
          hp: rp.hp,
          maxHp: rp.maxHp,
          level: rp.level,
          isMoving: rp.isMoving,
          isSwimming: Boolean(rp.isSwimming),
          mountedEntityId: rp.mountedEntityId || null,
          isGalloping: Boolean(rp.isGalloping),
          mountedCreatureData: rp.mountedCreatureData || null,
          swingTimer: rp.swingTimer,
          swingDuration: rp.swingDuration,
          heldItemId: rp.heldItemId,
          equippedArmorId: rp.equippedArmorId,
          equippedBySlot: rp.equippedBySlot,
          appearance: rp.appearance,
        });
      }
    }
    return remoteStates;
  }

  /**
   * Handles a new or reconnecting Guest connecting to the Host via WebRTC DataChannel.
   */
  private handleIncomingP2PGuestConnection(
    conn: DataConnection,
    hostLevel: number
  ): void {
    let registeredPeerId: string | null = null;
    let registeredName = 'Viajante';

    conn.on('data', (raw: any) => {
      const msg = typeof raw === 'string' ? this.safeJsonParse(raw) : raw;
      if (!msg || typeof msg.type !== 'string') return;

      this.lastPacketReceivedAt = Date.now();
      if (registeredPeerId) {
        this.peerLastPacketAt.set(registeredPeerId, Date.now());
      }

      // Reassemble framed large messages if sent in slices
      if (msg.type === 'p2p_framed_chunk') {
        const reassembled = this.handleIncomingFramedChunk(msg);
        if (reassembled && registeredPeerId) {
          this.handleP2PMessageFromGuest(
            registeredPeerId,
            registeredName,
            reassembled
          );
        }
        return;
      }

      if (msg.type === 'p2p_join_request') {
        const guestPeerId = String(
          msg.peerId || 'guest_' + Math.random().toString(36).slice(2, 8)
        );
        const guestName =
          String(msg.playerName || 'Viajante')
            .trim()
            .slice(0, 22) || 'Viajante';
        const guestVersion = String(msg.gameVersion || '').trim();
        const isResync = Boolean(msg.isResync);

        // Enforce strict game version match between Host and Guest
        if (guestVersion !== GAME_VERSION) {
          const guestVerLabel = guestVersion || 'anterior/desatualizada';
          this.safeSendConn(
            conn,
            {
              type: 'p2p_join_rejected',
              code: 'VERSION_MISMATCH',
              hostVersion: GAME_VERSION,
              guestVersion: guestVerLabel,
              error: `Versão incompatível! O mundo do anfitrião está na versão v${GAME_VERSION}, mas o seu jogo está na versão v${guestVerLabel}. Atualize o jogo para jogar na mesma versão.`,
            },
            true
          );
          return;
        }

        // If this guest had a previous stale DataConnection, close and replace it cleanly
        const oldConn = this.p2pGuestConnections.get(guestPeerId);
        if (oldConn && oldConn !== conn) {
          try {
            oldConn.close();
          } catch {
            // ignore
          }
        }

        registeredPeerId = guestPeerId;
        registeredName = guestName;
        this.p2pGuestConnections.set(guestPeerId, conn);
        this.peerLastPacketAt.set(guestPeerId, Date.now());

        if (msg.playerState) {
          this.upsertRemotePlayer({
            ...msg.playerState,
            peerId: guestPeerId,
            name: guestName,
            isHost: false,
          });
        }

        // Add or update in connectedPeers
        const existingPeerIdx = this.connectedPeers.findIndex(
          (p) => p.peerId === guestPeerId
        );
        const guestSummary: OnlinePeerSummary = {
          peerId: guestPeerId,
          name: guestName,
          isHost: false,
          level: msg.playerState?.level || 1,
        };
        if (existingPeerIdx >= 0) {
          this.connectedPeers[existingPeerIdx] = guestSummary;
        } else {
          if (!this.connectedPeers.some((p) => p.peerId === this.peerId)) {
            this.connectedPeers.unshift({
              peerId: this.peerId,
              name: this.localPlayerName,
              isHost: true,
              level: hostLevel,
            });
          }
          this.connectedPeers.push(guestSummary);
        }

        this.sendChunkedWorldSnapshotToGuest(conn, guestPeerId, isResync);

        if (!isResync && existingPeerIdx < 0) {
          this.callbacks.onPlayerEventNotification?.(
            `🌐 ${guestName} entrou no mundo!`,
            '#4ade80'
          );
        }
        this.broadcastToP2PGuests(
          {
            type: 'peer_joined',
            peer: guestSummary,
            peers: this.connectedPeers,
          },
          guestPeerId
        );
        this.emitSessionChange();
        this.callbacks.onRemotePlayersChanged?.();
        return;
      }

      const senderId = registeredPeerId || msg.peerId;
      if (!senderId) return;
      this.peerLastPacketAt.set(senderId, Date.now());

      if (msg.type === 'p2p_ping') {
        if (msg.state) {
          const enrichedState = {
            ...msg.state,
            peerId: senderId,
            name: msg.name || registeredName,
            isHost: false,
          };
          this.upsertRemotePlayer(enrichedState);
          this.broadcastToP2PGuests(
            {
              type: 'remote_player_state',
              state: enrichedState,
            },
            senderId
          );
        }
        this.safeSendConn(
          conn,
          {
            type: 'p2p_pong',
            t: msg.t || Date.now(),
            worldRevision: this.worldRevision,
            state: this.latestLocalPlayerState
              ? {
                  ...this.latestLocalPlayerState,
                  peerId: this.peerId,
                  name: this.localPlayerName,
                  isHost: true,
                }
              : undefined,
            peers: this.connectedPeers,
            remoteStates: this.collectAllPlayerStatesForPeer(senderId),
          },
          true
        );
        return;
      }

      if (msg.type === 'p2p_pong') {
        if (msg.state) {
          const enrichedState = {
            ...msg.state,
            peerId: senderId,
            name: msg.name || registeredName,
            isHost: false,
          };
          this.upsertRemotePlayer(enrichedState);
        }
        return;
      }

      if (msg.type === 'p2p_request_resync') {
        this.sendChunkedWorldSnapshotToGuest(conn, senderId, true);
        return;
      }

      this.handleP2PMessageFromGuest(senderId, registeredName, msg);
    });

    const handleGuestDisconnect = () => {
      if (!registeredPeerId) return;
      const leavingId = registeredPeerId;
      const leavingName = registeredName;
      registeredPeerId = null;

      // Only remove if this specific `conn` is still the active connection for `leavingId`
      // (prevents race condition when a Guest auto-reconnects with a new `conn` before the old one closes)
      if (this.p2pGuestConnections.get(leavingId) !== conn) {
        return;
      }

      this.p2pGuestConnections.delete(leavingId);
      this.peerLastPacketAt.delete(leavingId);
      this.connectedPeers = this.connectedPeers.filter(
        (p) => p.peerId !== leavingId
      );
      this.remotePlayers.delete(leavingId);
      this.callbacks.onPeerLeft?.(leavingId, leavingName);

      if (this.isOnline) {
        this.callbacks.onPlayerEventNotification?.(
          `👋 ${leavingName} saiu do mundo.`,
          '#fbbf24'
        );
        this.broadcastToP2PGuests({
          type: 'peer_left',
          peerId: leavingId,
          name: leavingName,
          peers: this.connectedPeers,
        });
        this.emitSessionChange();
        this.callbacks.onRemotePlayersChanged?.();
      }
    };

    conn.on('close', handleGuestDisconnect);
    conn.on('error', handleGuestDisconnect);
  }

  /**
   * Processes messages sent from a P2P Guest to the Host, updating Host state
   * and relaying to any other connected Guests.
   */
  private handleP2PMessageFromGuest(
    guestPeerId: string,
    defaultGuestName: string,
    msg: any
  ): void {
    switch (msg.type) {
      case 'player_state': {
        if (!msg.state) break;
        const peerEntry = this.connectedPeers.find(
          (p) => p.peerId === guestPeerId
        );
        const guestName = peerEntry?.name || msg.name || defaultGuestName;
        if (peerEntry && typeof msg.state.level === 'number') {
          peerEntry.level = msg.state.level;
        }
        const enrichedState = {
          ...msg.state,
          peerId: guestPeerId,
          name: guestName,
          isHost: false,
        };
        this.upsertRemotePlayer(enrichedState);
        this.broadcastToP2PGuests(
          {
            type: 'remote_player_state',
            state: enrichedState,
          },
          guestPeerId
        );
        break;
      }

      case 'update_player_name': {
        const cleanName =
          String(msg.name || defaultGuestName)
            .trim()
            .slice(0, 22) || defaultGuestName;
        const peerEntry = this.connectedPeers.find(
          (p) => p.peerId === guestPeerId
        );
        if (peerEntry) {
          peerEntry.name = cleanName;
        }
        const rp = this.remotePlayers.get(guestPeerId);
        if (rp) {
          rp.name = cleanName;
        }
        this.emitSessionChange();
        this.callbacks.onRemotePlayersChanged?.();
        this.broadcastToP2PGuests({
          type: 'peers_updated',
          peers: this.connectedPeers,
        });
        break;
      }

      case 'player_chat': {
        const peerEntry = this.connectedPeers.find(
          (p) => p.peerId === guestPeerId
        );
        const senderName = peerEntry?.name || defaultGuestName;
        const chatPayload = {
          type: 'player_chat',
          _clientEventId: msg._clientEventId || this.nextClientEventId(),
          peerId: guestPeerId,
          name: senderName,
          text: String(msg.text || '').slice(0, 80),
        };
        this.handleServerMessage(chatPayload);
        this.broadcastToP2PGuests(chatPayload, guestPeerId);
        break;
      }

      case 'chunk_sync': {
        this.worldRevision += 1;
        const syncedPayload = {
          ...msg,
          worldRevision: this.worldRevision,
        };
        this.handleServerMessage(syncedPayload);
        this.broadcastToP2PGuests(syncedPayload, guestPeerId);
        break;
      }

      case 'spawn_drop': {
        this.worldRevision += 1;
        const dropPayload = {
          ...msg,
          worldRevision: this.worldRevision,
        };
        this.handleServerMessage(dropPayload);
        this.broadcastToP2PGuests(dropPayload, guestPeerId);
        break;
      }

      case 'pickup_drop': {
        this.worldRevision += 1;
        const pickupPayload = {
          type: 'pickup_drop',
          _clientEventId: msg._clientEventId || this.nextClientEventId(),
          dropId: msg.dropId,
          peerId: guestPeerId,
          worldRevision: this.worldRevision,
        };
        this.handleServerMessage(pickupPayload);
        this.broadcastToP2PGuests(pickupPayload, guestPeerId);
        break;
      }

      case 'creature_hit': {
        this.handleServerMessage(msg);
        break;
      }

      case 'guest_mount_event': {
        this.handleServerMessage({
          ...msg,
          peerId: guestPeerId,
        });
        break;
      }

      case 'leave_room': {
        const conn = this.p2pGuestConnections.get(guestPeerId);
        if (conn) {
          try {
            conn.close();
          } catch {
            // ignore
          }
        }
        break;
      }
    }
  }

  private getRtcDataChannel(conn: DataConnection | null): RTCDataChannel | null {
    if (!conn) return null;
    return (conn as any).dataChannel || (conn as any)._dc || null;
  }

  private isConnOpenAndHealthy(
    conn: DataConnection | null,
    isCritical = false
  ): boolean {
    if (!conn || !conn.open) return false;
    const dc = this.getRtcDataChannel(conn);
    if (dc) {
      if (dc.readyState !== 'open') return false;
      // Backpressure guard: prevent overflowing the WebRTC SCTP buffer with ephemeral movement frames
      if (
        !isCritical &&
        typeof dc.bufferedAmount === 'number' &&
        dc.bufferedAmount > 48 * 1024
      ) {
        return false;
      }
    }
    return true;
  }

  private broadcastToP2PGuests(
    payload: any,
    excludePeerId?: string,
    isCritical = false
  ): void {
    if (this.p2pGuestConnections.size === 0) return;
    for (const [peerId, conn] of this.p2pGuestConnections.entries()) {
      if (excludePeerId && peerId === excludePeerId) continue;
      this.safeSendConn(conn, payload, isCritical);
    }
  }

  private safeSendConn(
    conn: DataConnection | null,
    payload: any,
    isCritical = false
  ): void {
    if (!this.isConnOpenAndHealthy(conn, isCritical)) return;
    try {
      // Automatically slice large payloads (> 22 KB) so WebRTC DataChannel never drops or closes
      if (
        payload &&
        payload.type !== 'p2p_snapshot_chunk' &&
        payload.type !== 'p2p_framed_chunk'
      ) {
        const serialized = JSON.stringify(payload);
        if (serialized.length > SNAPSHOT_CHUNK_SIZE) {
          const frameId = `fr_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 7)}`;
          const total = Math.ceil(serialized.length / SNAPSHOT_CHUNK_SIZE);
          for (let i = 0; i < total; i++) {
            conn!.send({
              type: 'p2p_framed_chunk',
              frameId,
              index: i,
              total,
              chunk: serialized.slice(
                i * SNAPSHOT_CHUNK_SIZE,
                (i + 1) * SNAPSHOT_CHUNK_SIZE
              ),
            });
          }
          return;
        }
      }
      conn!.send(payload);
    } catch {
      // If send threw an error, the channel may have stalled; watchdog will resync
    }
  }

  private handleIncomingFramedChunk(msg: any): any | null {
    const frameId = String(msg.frameId || '');
    const index = Number(msg.index) || 0;
    const total = Number(msg.total) || 1;
    if (!frameId || total <= 0) return null;

    let entry = this.incomingFramedPayloads.get(frameId);
    if (!entry) {
      entry = { chunks: [], total, createdAt: Date.now() };
      this.incomingFramedPayloads.set(frameId, entry);
    }
    entry.chunks[index] = String(msg.chunk || '');

    const receivedCount = entry.chunks.filter(
      (c) => typeof c === 'string'
    ).length;
    if (receivedCount >= total) {
      this.incomingFramedPayloads.delete(frameId);
      const fullJson = entry.chunks.join('');
      return this.safeJsonParse(fullJson);
    }
    return null;
  }

  private safeJsonParse(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Continuous Synchronization & Self-Healing Watchdog Loop (runs every 1.0s):
   * - Sends bi-directional heartbeats (`p2p_ping` / `ws_ping`) carrying live player state & worldRevision.
   * - Detects frozen/desynchronized connections within 3.5s and automatically triggers reconnection & full state resync.
   */
  private startSyncWatchdogLoop(): void {
    this.stopSyncWatchdogLoop();
    this.lastPacketReceivedAt = Date.now();
    this.p2pKeepAliveInterval = window.setInterval(() => {
      this.runSyncWatchdogTick();
    }, 1000);
  }

  private stopSyncWatchdogLoop(): void {
    if (this.p2pKeepAliveInterval !== null) {
      window.clearInterval(this.p2pKeepAliveInterval);
      this.p2pKeepAliveInterval = null;
    }
  }

  private runSyncWatchdogTick(): void {
    if (!this.isOnline || this.intentionalClose) return;
    const now = Date.now();

    // Clean up old partial framed payloads (> 20s)
    for (const [fid, entry] of this.incomingFramedPayloads.entries()) {
      if (now - entry.createdAt > 20000) {
        this.incomingFramedPayloads.delete(fid);
      }
    }

    // 1. WebSocket heartbeat & auto-reattachment if on Dedicated Server
    if (this.transportMode !== 'P2P_WEBRTC') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendRaw({
          type: 'ws_ping',
          t: now,
          worldRevision: this.worldRevision,
        });
      } else if (now - this.lastWsReconnectAttemptAt > 5000) {
        this.lastWsReconnectAttemptAt = now;
        void this.tryAttachWebSocket(1500);
      }
    }

    // 2. HOST Watchdog: Keep P2P Broker registered, send heartbeats + player states to Guests, prune dead sockets
    if (this.role === 'HOST') {
      // Ensure PeerJS signaling broker stays connected so Guests can always reconnect
      if (now - this.lastHostBrokerCheckAt > 3000 && this.inviteCode) {
        this.lastHostBrokerCheckAt = now;
        if (!this.p2pPeer || this.p2pPeer.destroyed) {
          void this.openP2PHostRoom(
            this.inviteCode,
            this.latestLocalPlayerState?.level || 1,
            performance.now(),
            true
          );
        } else if (this.p2pPeer.disconnected) {
          try {
            this.p2pPeer.reconnect();
          } catch {
            // ignore
          }
        }
      }

      if (this.p2pGuestConnections.size > 0) {
        this.broadcastToP2PGuests(
          {
            type: 'p2p_ping',
            t: now,
            worldRevision: this.worldRevision,
            state: this.latestLocalPlayerState
              ? {
                  ...this.latestLocalPlayerState,
                  peerId: this.peerId,
                  name: this.localPlayerName,
                  isHost: true,
                }
              : undefined,
            peers: this.connectedPeers,
            remoteStates: this.collectAllPlayerStatesForPeer(),
          },
          undefined,
          true
        );

        // Check for zombie guest DataChannels that haven't responded in > 18s
        for (const [guestId, conn] of Array.from(
          this.p2pGuestConnections.entries()
        )) {
          const lastSeen = this.peerLastPacketAt.get(guestId) || now;
          if (
            now - lastSeen > 18000 ||
            !this.isConnOpenAndHealthy(conn, true)
          ) {
            try {
              conn.close();
            } catch {
              // ignore
            }
          }
        }
      }
      return;
    }

    // 3. GUEST Watchdog: Send heartbeat to Host, verify worldRevision, and auto-reconnect if stalled!
    if (this.role === 'GUEST') {
      if (this.isConnOpenAndHealthy(this.p2pHostConn, true)) {
        this.safeSendConn(
          this.p2pHostConn,
          {
            type: 'p2p_ping',
            t: now,
            peerId: this.peerId,
            name: this.localPlayerName,
            worldRevision: this.worldRevision,
            state: this.latestLocalPlayerState,
          },
          true
        );
      }

      const silenceMs = now - this.lastPacketReceivedAt;

      // If P2P Guest hasn't received any packet for > 3.5s or DataChannel closed, trigger automatic P2P reconnection & resync!
      if (
        this.transportMode === 'P2P_WEBRTC' &&
        (silenceMs > 3500 || !this.isConnOpenAndHealthy(this.p2pHostConn, true))
      ) {
        if (!this.isP2PReconnecting) {
          void this.attemptP2PGuestAutoReconnect();
        }
      } else if (
        this.transportMode !== 'P2P_WEBRTC' &&
        silenceMs > 4000
      ) {
        // On HTTP/WS server mode, request a full world snapshot on the next HTTP sync tick
        this.pendingFullSnapshotRequest = true;
        if (this.syncStatus !== 'RESYNCING') {
          this.syncStatus = 'RESYNCING';
          this.statusMessage = 'Ressincronizando estado do mundo...';
          this.emitSessionChange();
        }
      } else if (silenceMs <= 2500 && this.syncStatus !== 'SYNCED') {
        this.syncStatus = 'SYNCED';
        this.statusMessage = `Conectado e sincronizado com ${this.hostName}!`;
        this.emitSessionChange();
      }
    }
  }

  /**
   * Automatically reconnects a Guest to the Host's P2P room and resynchronizes the world
   * whenever the WebRTC DataChannel stalls or drops, without kicking the player out of the game!
   */
  private async attemptP2PGuestAutoReconnect(): Promise<void> {
    if (
      this.isP2PReconnecting ||
      this.intentionalClose ||
      !this.isOnline ||
      this.role !== 'GUEST' ||
      !this.inviteCode
    ) {
      return;
    }

    this.isP2PReconnecting = true;
    this.p2pReconnectFailures += 1;

    if (this.syncStatus !== 'RESYNCING') {
      this.syncStatus = 'RESYNCING';
      this.statusMessage = 'Reconectando e ressincronizando com o anfitrião...';
      this.emitSessionChange();
      if (this.p2pReconnectFailures === 1) {
        this.callbacks.onPlayerEventNotification?.(
          '🔄 Sincronizando conexão com o mundo...',
          '#38bdf8'
        );
      }
    }

    const code = this.inviteCode;

    try {
      // Ensure our PeerJS instance is open and connected to the signaling server
      const peer = await this.ensureGuestP2PPeerReady();
      if (!peer || this.intentionalClose || !this.isOnline) {
        this.isP2PReconnecting = false;
        return;
      }

      const reconnected = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        const timeoutId = window.setTimeout(() => {
          finish(false);
        }, 6500);

        const hostPeerId = MultiplayerManager.buildRoomPeerId(code);
        let conn: DataConnection;
        try {
          conn = peer.connect(hostPeerId, { reliable: true });
        } catch {
          window.clearTimeout(timeoutId);
          finish(false);
          return;
        }

        conn.on('open', () => {
          // Close old broken connection if different
          if (this.p2pHostConn && this.p2pHostConn !== conn) {
            try {
              this.p2pHostConn.close();
            } catch {
              // ignore
            }
          }
          this.p2pHostConn = conn;
          this.incomingSnapshotChunks = [];
          this.incomingSnapshotTotal = 0;

          this.bindGuestP2PConnHandlers(conn, () => {
            window.clearTimeout(timeoutId);
            finish(true);
          });

          this.safeSendConn(
            conn,
            {
              type: 'p2p_join_request',
              isResync: true,
              peerId: this.peerId,
              playerName: this.localPlayerName,
              gameVersion: GAME_VERSION,
              playerState: this.latestLocalPlayerState,
            },
            true
          );
        });

        conn.on('error', () => {
          window.clearTimeout(timeoutId);
          finish(false);
        });
      });

      if (reconnected) {
        this.p2pReconnectFailures = 0;
        this.lastPacketReceivedAt = Date.now();
        this.syncStatus = 'SYNCED';
        this.statusMessage = `Conectado e sincronizado com ${this.hostName}!`;
        this.callbacks.onPlayerEventNotification?.(
          '✅ Mundo ressincronizado!',
          '#4ade80'
        );
        this.emitSessionChange();
      } else if (this.p2pReconnectFailures >= 10) {
        // After ~10 consecutive failed reconnection attempts (~45+ seconds), the host truly closed the world
        this.handleServerMessage({
          type: 'room_closed',
          reason:
            'O anfitrião fechou o mundo ou ficou sem conexão por muito tempo.',
        });
      }
    } finally {
      this.isP2PReconnecting = false;
    }
  }

  private ensureGuestP2PPeerReady(): Promise<Peer | null> {
    return new Promise((resolve) => {
      if (
        this.p2pPeer &&
        !this.p2pPeer.destroyed &&
        !this.p2pPeer.disconnected &&
        this.p2pPeer.open
      ) {
        resolve(this.p2pPeer);
        return;
      }

      if (this.p2pPeer && !this.p2pPeer.destroyed && this.p2pPeer.disconnected) {
        try {
          this.p2pPeer.reconnect();
        } catch {
          // ignore
        }
      }

      try {
        if (this.p2pPeer) {
          try {
            this.p2pPeer.destroy();
          } catch {
            // ignore
          }
        }
        const peer = new Peer({
          debug: 0,
          config: { iceServers: RTC_ICE_SERVERS },
        });
        const timer = window.setTimeout(() => {
          resolve(null);
        }, 5000);

        peer.on('open', () => {
          window.clearTimeout(timer);
          this.p2pPeer = peer;
          resolve(peer);
        });
        peer.on('error', () => {
          window.clearTimeout(timer);
          resolve(null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Attaches live packet listeners on the Guest's DataConnection to the Host.
   */
  private bindGuestP2PConnHandlers(
    conn: DataConnection,
    onResyncCompleted?: () => void
  ): void {
    conn.on('data', (raw: any) => {
      const msg = typeof raw === 'string' ? this.safeJsonParse(raw) : raw;
      if (!msg || typeof msg.type !== 'string') return;

      this.lastPacketReceivedAt = Date.now();
      if (this.syncStatus !== 'SYNCED') {
        this.syncStatus = 'SYNCED';
        this.emitSessionChange();
      }

      if (msg.type === 'p2p_framed_chunk') {
        const reassembled = this.handleIncomingFramedChunk(msg);
        if (reassembled) {
          this.handleServerMessage(reassembled);
        }
        return;
      }

      if (msg.type === 'p2p_snapshot_chunk') {
        const idx = Number(msg.index) || 0;
        const total = Number(msg.total) || 1;
        this.incomingSnapshotTotal = total;
        this.incomingSnapshotChunks[idx] = String(msg.chunk || '');
        return;
      }

      if (
        msg.type === 'p2p_resync_completed' ||
        msg.type === 'p2p_join_accepted'
      ) {
        try {
          const fullJson = this.incomingSnapshotChunks.join('');
          const worldSnapshot = (
            fullJson ? JSON.parse(fullJson) : msg.worldSnapshot
          ) as WorldSaveData;
          this.incomingSnapshotChunks = [];

          if (worldSnapshot && worldSnapshot.metadata) {
            this.worldRevision = msg.worldRevision || this.worldRevision;
            this.callbacks.onWorldSnapshotReceived?.(worldSnapshot);
          }
          if (Array.isArray(msg.peers)) {
            this.connectedPeers = msg.peers;
          }
          if (Array.isArray(msg.remoteStates)) {
            this.reconcileRemotePlayersList(msg.remoteStates);
          }
          this.emitSessionChange();
          onResyncCompleted?.();
        } catch {
          // ignore malformed resync snapshot
        }
        return;
      }

      if (msg.type === 'p2p_ping' || msg.type === 'p2p_pong') {
        if (msg.state && msg.state.peerId && msg.state.peerId !== this.peerId) {
          this.upsertRemotePlayer(msg.state);
        }
        if (Array.isArray(msg.remoteStates)) {
          this.reconcileRemotePlayersList(msg.remoteStates);
        }
        if (Array.isArray(msg.peers)) {
          this.connectedPeers = msg.peers;
        }
        if (
          typeof msg.worldRevision === 'number' &&
          msg.worldRevision > this.worldRevision &&
          Date.now() - this.lastResyncRequestAt > 2500
        ) {
          this.lastResyncRequestAt = Date.now();
          this.safeSendConn(
            conn,
            {
              type: 'p2p_request_resync',
              peerId: this.peerId,
              worldRevision: this.worldRevision,
            },
            true
          );
        }
        if (msg.type === 'p2p_ping') {
          this.safeSendConn(
            conn,
            {
              type: 'p2p_pong',
              t: msg.t || Date.now(),
              peerId: this.peerId,
              name: this.localPlayerName,
              worldRevision: this.worldRevision,
              state: this.latestLocalPlayerState,
            },
            true
          );
        }
        return;
      }

      this.handleServerMessage(msg);
    });

    conn.on('close', () => {
      if (this.p2pHostConn === conn && this.isOnline && !this.intentionalClose) {
        // Trigger immediate background auto-reconnect instead of disconnecting the player!
        void this.attemptP2PGuestAutoReconnect();
      }
    });

    conn.on('error', () => {
      if (this.p2pHostConn === conn && this.isOnline && !this.intentionalClose) {
        void this.attemptP2PGuestAutoReconnect();
      }
    });
  }

  /**
   * Public method to force an immediate resynchronization of players & world state.
   */
  public forceResyncNow(): void {
    if (!this.isOnline) return;
    this.syncStatus = 'RESYNCING';
    this.statusMessage = 'Ressincronizando mundo e jogadores...';
    this.emitSessionChange();

    if (this.role === 'HOST') {
      const freshSnapshot = this.callbacks.onRequestHostSnapshot?.();
      if (freshSnapshot) {
        this.worldRevision += 1;
        for (const [guestId, conn] of this.p2pGuestConnections.entries()) {
          this.sendChunkedWorldSnapshotToGuest(conn, guestId, true);
        }
        if (this.transportMode !== 'P2P_WEBRTC') {
          this.queueOrSendEvent(
            {
              type: 'host_snapshot',
              worldSnapshot: freshSnapshot,
            },
            'host_snapshot'
          );
        }
      }
      this.syncStatus = 'SYNCED';
      this.statusMessage = 'Mundo sincronizado com todos os jogadores!';
      this.callbacks.onPlayerEventNotification?.(
        '🔄 Mundo sincronizado com todos os jogadores!',
        '#4ade80'
      );
      this.emitSessionChange();
      return;
    }

    // Guest: request fresh snapshot from Host/Server
    if (this.transportMode === 'P2P_WEBRTC') {
      if (this.isConnOpenAndHealthy(this.p2pHostConn, true)) {
        this.safeSendConn(
          this.p2pHostConn,
          {
            type: 'p2p_request_resync',
            peerId: this.peerId,
            worldRevision: this.worldRevision,
          },
          true
        );
      } else {
        void this.attemptP2PGuestAutoReconnect();
      }
    } else {
      this.pendingFullSnapshotRequest = true;
      this.queueOrSendEvent(
        {
          type: 'request_world_resync',
        },
        'request_world_resync'
      );
      void this.performHttpSyncTick();
    }
  }

  private closeP2PInternal(): void {
    this.stopSyncWatchdogLoop();
    for (const conn of this.p2pGuestConnections.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.p2pGuestConnections.clear();
    this.peerLastPacketAt.clear();
    this.incomingFramedPayloads.clear();

    if (this.p2pHostConn) {
      try {
        this.p2pHostConn.close();
      } catch {
        // ignore
      }
      this.p2pHostConn = null;
    }

    if (this.p2pPeer) {
      try {
        this.p2pPeer.destroy();
      } catch {
        // ignore
      }
      this.p2pPeer = null;
    }
  }

  /**
   * Attaches a WebSocket connection to an already-registered HTTP room peer
   * for ultra-low latency updates. Never breaks the session if WS is blocked by a proxy.
   */
  private tryAttachWebSocket(timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isOnline || !this.inviteCode) {
        resolve(false);
        return;
      }

      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      const timer = window.setTimeout(() => {
        finish(false);
      }, timeoutMs);

      try {
        this.closeSocketInternal();
        const wsUrl = MultiplayerManager.resolveWebSocketUrl(
          this.customServerUrl
        );
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          this.sendRaw({
            type: 'attach_socket',
            inviteCode: this.inviteCode,
            peerId: this.peerId,
          });
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.lastPacketReceivedAt = Date.now();
            if (msg.type === 'socket_attached') {
              window.clearTimeout(timer);
              this.transportMode = 'WEBSOCKET';
              if (Array.isArray(msg.peers)) {
                this.connectedPeers = msg.peers;
              }
              finish(true);
              this.emitSessionChange();
              return;
            }
            if (msg.type === 'ws_pong') {
              if (
                this.role === 'GUEST' &&
                typeof msg.worldRevision === 'number' &&
                msg.worldRevision > this.worldRevision
              ) {
                this.pendingFullSnapshotRequest = true;
              }
              return;
            }
            this.handleServerMessage(msg);
          } catch {
            // ignore malformed
          }
        };

        ws.onerror = () => {
          window.clearTimeout(timer);
          finish(false);
        };

        ws.onclose = () => {
          window.clearTimeout(timer);
          if (this.ws === ws) {
            this.ws = null;
          }
          if (this.isOnline && this.transportMode === 'WEBSOCKET') {
            this.transportMode = 'HTTP_SYNC';
            this.emitSessionChange();
          }
          finish(false);
        };
      } catch {
        window.clearTimeout(timer);
        finish(false);
      }
    });
  }

  /**
   * Connects to an existing online world using a 6-character Invite Code.
   * Automatically tries dedicated HTTP endpoint first (if present) and seamlessly pairs
   * via Serverless P2P WebRTC (PeerJS) on static GitHub/Vercel/Netlify hosts!
   */
  public static async joinWorldByCode(
    inviteCode: string,
    playerName: string,
    customServerUrl = '',
    onProgress?: (statusText: string) => void
  ): Promise<{
    ok: boolean;
    manager?: MultiplayerManager;
    worldSave?: WorldSaveData;
    error?: string;
  }> {
    const cleanCode = (inviteCode || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 4) {
      return {
        ok: false,
        error: 'Digite um código de convite válido (ex: K7M4P2).',
      };
    }

    const manager = new MultiplayerManager(playerName, customServerUrl);
    manager.role = 'GUEST';
    manager.statusMessage = 'Procurando sala online...';
    onProgress?.(`Procurando sala ${cleanCode}...`);

    const baseUrl = MultiplayerManager.resolveHttpBaseUrl(customServerUrl);

    // 1. Fast check on local/custom HTTP server if available
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 2400);
      const res = await fetch(`${baseUrl}/api/mp/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: cleanCode,
          peerId: manager.peerId,
          playerName: manager.localPlayerName,
          gameVersion: GAME_VERSION,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (res.status === 409) {
        const errData = await res.json().catch(() => null);
        return {
          ok: false,
          error:
            errData?.error ||
            `Versão incompatível! Todos os jogadores devem estar na versão v${GAME_VERSION} para jogar juntos.`,
        };
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.ok && data.worldSnapshot) {
          const hostVersion = String(
            data.gameVersion ||
              data.worldSnapshot?.metadata?.gameVersion ||
              ''
          ).trim();
          if (hostVersion && hostVersion !== GAME_VERSION) {
            return {
              ok: false,
              error: `Versão incompatível! O mundo do anfitrião está na versão v${hostVersion}, mas o seu jogo está na versão v${GAME_VERSION}. Ambos precisam estar na mesma versão.`,
            };
          }

          manager.isOnline = true;
          manager.role = 'GUEST';
          manager.inviteCode = data.inviteCode || cleanCode;
          manager.worldName = data.worldName || 'Mundo Online';
          manager.hostName = data.hostName || 'Anfitrião';
          manager.connectedPeers = data.peers || [];
          manager.transportMode = 'HTTP_SYNC';
          manager.syncStatus = 'SYNCED';
          manager.lastPacketReceivedAt = Date.now();
          manager.activationState = 'ACTIVE';
          manager.statusMessage = `Conectado ao mundo de ${manager.hostName}!`;

          if (Array.isArray(data.remoteStates)) {
            manager.reconcileRemotePlayersList(data.remoteStates);
          }

          manager.startHttpSyncLoop();
          manager.startSyncWatchdogLoop();
          void manager.tryAttachWebSocket(1800);

          return {
            ok: true,
            manager,
            worldSave: data.worldSnapshot as WorldSaveData,
          };
        }
      }
    } catch {
      // Dedicated server not present or static host -> proceed immediately to P2P WebRTC pairing
    }

    // 2. Connect via Global P2P WebRTC (PeerJS) using the 6-char invite code
    onProgress?.(`Conectando via P2P WebRTC à sala ${cleanCode}...`);
    return MultiplayerManager.joinViaP2PWebRTC(
      manager,
      cleanCode,
      onProgress
    );
  }

  private static joinViaP2PWebRTC(
    manager: MultiplayerManager,
    cleanCode: string,
    onProgress?: (statusText: string) => void
  ): Promise<{
    ok: boolean;
    manager?: MultiplayerManager;
    worldSave?: WorldSaveData;
    error?: string;
  }> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (res: {
        ok: boolean;
        manager?: MultiplayerManager;
        worldSave?: WorldSaveData;
        error?: string;
      }) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };

      let peer: Peer;
      try {
        peer = new Peer({
          debug: 0,
          config: {
            iceServers: RTC_ICE_SERVERS,
          },
        });
      } catch (err: any) {
        finish({
          ok: false,
          error:
            err?.message ||
            'Falha ao iniciar cliente WebRTC neste navegador.',
        });
        return;
      }

      const overallTimeout = window.setTimeout(() => {
        manager.closeP2PInternal();
        finish({
          ok: false,
          error: `Tempo esgotado ao conectar à sala ${cleanCode}. Verifique se o anfitrião está com o mundo aberto e online.`,
        });
      }, 14000);

      peer.on('open', () => {
        manager.p2pPeer = peer;
        onProgress?.(`Pareando com o anfitrião da sala ${cleanCode}...`);

        const hostPeerId = MultiplayerManager.buildRoomPeerId(cleanCode);
        const conn = peer.connect(hostPeerId, {
          reliable: true,
        });
        manager.p2pHostConn = conn;

        conn.on('open', () => {
          onProgress?.(
            `Canal P2P aberto! Verificando versão (v${GAME_VERSION}) e solicitando mundo...`
          );
          manager.incomingSnapshotChunks = [];
          manager.incomingSnapshotTotal = 0;
          manager.safeSendConn(
            conn,
            {
              type: 'p2p_join_request',
              peerId: manager.peerId,
              playerName: manager.localPlayerName,
              gameVersion: GAME_VERSION,
            },
            true
          );
        });

        conn.on('data', (raw: any) => {
          const msg =
            typeof raw === 'string' ? manager.safeJsonParse(raw) : raw;
          if (!msg || typeof msg.type !== 'string') return;

          manager.lastPacketReceivedAt = Date.now();

          if (msg.type === 'p2p_framed_chunk') {
            const reassembled = manager.handleIncomingFramedChunk(msg);
            if (reassembled) {
              manager.handleServerMessage(reassembled);
            }
            return;
          }

          if (msg.type === 'p2p_join_rejected') {
            window.clearTimeout(overallTimeout);
            manager.closeP2PInternal();
            finish({
              ok: false,
              error:
                msg.error || 'O anfitrião recusou a conexão no momento.',
            });
            return;
          }

          if (msg.type === 'p2p_snapshot_chunk') {
            const idx = Number(msg.index) || 0;
            const total = Number(msg.total) || 1;
            manager.incomingSnapshotTotal = total;
            manager.incomingSnapshotChunks[idx] = String(msg.chunk || '');
            const receivedCount = manager.incomingSnapshotChunks.filter(
              (c) => typeof c === 'string'
            ).length;
            const pct = Math.min(
              99,
              Math.round((receivedCount / Math.max(1, total)) * 100)
            );
            onProgress?.(`Sincronizando mundo do anfitrião (${pct}%)...`);
            return;
          }

          if (
            msg.type === 'p2p_join_accepted' ||
            msg.type === 'p2p_resync_completed'
          ) {
            window.clearTimeout(overallTimeout);
            try {
              const hostVersion = String(msg.gameVersion || '').trim();
              if (hostVersion !== GAME_VERSION) {
                const hostVerLabel = hostVersion || 'anterior/desatualizada';
                manager.closeP2PInternal();
                finish({
                  ok: false,
                  error: `Versão incompatível! Seu jogo está na versão v${GAME_VERSION}, mas o mundo do anfitrião está na versão v${hostVerLabel}. Todos os jogadores precisam estar na mesma versão.`,
                });
                return;
              }

              const fullJson = manager.incomingSnapshotChunks.join('');
              const worldSnapshot = (
                fullJson ? JSON.parse(fullJson) : msg.worldSnapshot
              ) as WorldSaveData;

              if (!worldSnapshot || !worldSnapshot.metadata) {
                throw new Error('Snapshot do mundo incompleto.');
              }

              manager.incomingSnapshotChunks = [];
              manager.worldRevision = msg.worldRevision || 1;

              // If already settled (i.e. this was an in-game resync on the initial connection), apply snapshot directly!
              if (settled) {
                manager.callbacks.onWorldSnapshotReceived?.(worldSnapshot);
                if (Array.isArray(msg.remoteStates)) {
                  manager.reconcileRemotePlayersList(msg.remoteStates);
                }
                return;
              }

              manager.isOnline = true;
              manager.role = 'GUEST';
              manager.inviteCode = msg.inviteCode || cleanCode;
              manager.worldName =
                msg.worldName ||
                worldSnapshot.metadata.name ||
                'Mundo Online';
              manager.hostName = msg.hostName || 'Anfitrião';
              manager.connectedPeers = Array.isArray(msg.peers)
                ? msg.peers
                : [];
              manager.transportMode = 'P2P_WEBRTC';
              manager.syncStatus = 'SYNCED';
              manager.activationState = 'ACTIVE';
              manager.statusMessage = `Conectado via P2P ao mundo de ${manager.hostName}!`;

              if (Array.isArray(msg.remoteStates)) {
                manager.reconcileRemotePlayersList(msg.remoteStates);
              }

              manager.startSyncWatchdogLoop();
              finish({
                ok: true,
                manager,
                worldSave: worldSnapshot,
              });
            } catch (parseErr: any) {
              if (!settled) {
                manager.closeP2PInternal();
                finish({
                  ok: false,
                  error:
                    parseErr?.message ||
                    'Erro ao reconstruir o mapa recebido do anfitrião.',
                });
              }
            }
            return;
          }

          if (msg.type === 'p2p_ping' || msg.type === 'p2p_pong') {
            if (
              msg.state &&
              msg.state.peerId &&
              msg.state.peerId !== manager.peerId
            ) {
              manager.upsertRemotePlayer(msg.state);
            }
            if (Array.isArray(msg.remoteStates)) {
              manager.reconcileRemotePlayersList(msg.remoteStates);
            }
            if (Array.isArray(msg.peers)) {
              manager.connectedPeers = msg.peers;
            }
            if (
              typeof msg.worldRevision === 'number' &&
              msg.worldRevision > manager.worldRevision &&
              Date.now() - manager.lastResyncRequestAt > 2500
            ) {
              manager.lastResyncRequestAt = Date.now();
              manager.safeSendConn(
                conn,
                {
                  type: 'p2p_request_resync',
                  peerId: manager.peerId,
                  worldRevision: manager.worldRevision,
                },
                true
              );
            }
            if (msg.type === 'p2p_ping') {
              manager.safeSendConn(
                conn,
                {
                  type: 'p2p_pong',
                  t: msg.t || Date.now(),
                  peerId: manager.peerId,
                  name: manager.localPlayerName,
                  worldRevision: manager.worldRevision,
                  state: manager.latestLocalPlayerState,
                },
                true
              );
            }
            return;
          }

          // Standard live multiplayer events received after joining
          manager.handleServerMessage(msg);
        });

        conn.on('close', () => {
          if (!settled) {
            window.clearTimeout(overallTimeout);
            manager.closeP2PInternal();
            finish({
              ok: false,
              error:
                'A conexão com o anfitrião foi fechada antes de concluir o pareamento.',
            });
            return;
          }
          if (
            manager.p2pHostConn === conn &&
            manager.isOnline &&
            !manager.intentionalClose
          ) {
            void manager.attemptP2PGuestAutoReconnect();
          }
        });
      });

      peer.on('error', (err: any) => {
        if (!settled) {
          window.clearTimeout(overallTimeout);
          const errType = err?.type || '';
          manager.closeP2PInternal();

          if (errType === 'peer-unavailable') {
            finish({
              ok: false,
              error: `Código "${cleanCode}" não encontrado ou mundo offline. Peça ao anfitrião confirmar que o Modo Online está ativo dentro do mundo.`,
            });
            return;
          }

          finish({
            ok: false,
            error:
              err?.message ||
              `Não foi possível parear com o código ${cleanCode} (${errType || 'erro de rede'}).`,
          });
        }
      });
    });
  }

  private startHttpSyncLoop(): void {
    this.stopHttpSyncLoop();
    this.httpSyncInterval = window.setInterval(() => {
      void this.performHttpSyncTick();
    }, 240);
  }

  private stopHttpSyncLoop(): void {
    if (this.httpSyncInterval !== null) {
      window.clearInterval(this.httpSyncInterval);
      this.httpSyncInterval = null;
    }
  }

  private async performHttpSyncTick(): Promise<void> {
    if (
      !this.isOnline ||
      !this.inviteCode ||
      this.transportMode === 'P2P_WEBRTC' ||
      this.isHttpSyncInFlight
    ) {
      return;
    }
    this.isHttpSyncInFlight = true;

    const baseUrl = MultiplayerManager.resolveHttpBaseUrl(this.customServerUrl);
    const eventsToSend = this.outgoingHttpEvents.splice(
      0,
      this.outgoingHttpEvents.length
    );
    const requestFullSnapshot = this.pendingFullSnapshotRequest;
    this.pendingFullSnapshotRequest = false;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`${baseUrl}/api/mp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: this.inviteCode,
          peerId: this.peerId,
          playerName: this.localPlayerName,
          playerState: this.latestLocalPlayerState,
          events: eventsToSend,
          requestFullSnapshot,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (res.status === 404) {
        this.consecutiveHttpFailures += 1;
        const errData = await res.json().catch(() => ({}));

        if (this.role === 'HOST') {
          // Host automatically re-registers the room with the same inviteCode if the server restarted!
          const freshSnap = this.callbacks.onRequestHostSnapshot?.();
          if (freshSnap && this.latestLocalPlayerState) {
            await fetch(`${baseUrl}/api/mp/host`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                peerId: this.peerId,
                playerName: this.localPlayerName,
                preferredCode: this.inviteCode,
                gameVersion: GAME_VERSION,
                worldSnapshot: freshSnap,
                playerState: this.latestLocalPlayerState,
              }),
            }).catch(() => {});
            void this.tryAttachWebSocket(1200);
          }
        } else if (this.role === 'GUEST') {
          // Give the Host up to ~8 retries (~2.5 seconds) to re-host before closing or falling back to P2P
          if (this.consecutiveHttpFailures >= 10 && errData?.roomClosed) {
            this.handleServerMessage({
              type: 'room_closed',
              reason:
                errData.error || 'O anfitrião encerrou a sessão online.',
            });
          } else {
            this.syncStatus = 'RESYNCING';
            this.emitSessionChange();
          }
        }
        return;
      }

      if (!res.ok) {
        this.consecutiveHttpFailures += 1;
        return;
      }

      const data = await res.json();
      if (!data || !data.ok) return;

      this.consecutiveHttpFailures = 0;
      this.lastPacketReceivedAt = Date.now();
      if (this.syncStatus !== 'SYNCED') {
        this.syncStatus = 'SYNCED';
        this.statusMessage =
          this.role === 'HOST'
            ? 'Mundo online ativo e sincronizado!'
            : `Conectado e sincronizado com ${this.hostName}!`;
        this.emitSessionChange();
      }

      if (Array.isArray(data.peers)) {
        const prevCount = this.connectedPeers.length;
        this.connectedPeers = data.peers;
        if (prevCount !== this.connectedPeers.length) {
          this.emitSessionChange();
        }
      }

      if (Array.isArray(data.remoteStates)) {
        this.reconcileRemotePlayersList(data.remoteStates);
      }

      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          if (ev && typeof ev.type === 'string') {
            this.handleServerMessage(ev);
          }
        }
      }

      if (this.role === 'GUEST') {
        if (data.worldSnapshot && data.worldSnapshot.metadata) {
          this.worldRevision = data.worldRevision || this.worldRevision;
          this.callbacks.onWorldSnapshotReceived?.(data.worldSnapshot);
        } else if (
          typeof data.worldRevision === 'number' &&
          data.worldRevision > this.worldRevision
        ) {
          this.worldRevision = data.worldRevision;
          this.pendingFullSnapshotRequest = true;
        }

        if (Array.isArray(data.creatures)) {
          this.callbacks.onCreaturesSyncReceived?.(data.creatures);
        }
        if (Array.isArray(data.droppedItems)) {
          this.callbacks.onDropsSyncReceived?.(data.droppedItems);
        }
        if (
          typeof data.timeOfDay === 'number' &&
          typeof data.dayCount === 'number'
        ) {
          this.callbacks.onTimeSyncReceived?.(data.timeOfDay, data.dayCount);
        }
      }
    } catch {
      window.clearTimeout(timeoutId);
      this.consecutiveHttpFailures += 1;
      // Restore unsent critical events so they aren't lost on transient network timeout
      if (eventsToSend.length > 0) {
        const criticalEvents = eventsToSend.filter(
          (e) =>
            e.type === 'chunk_sync' ||
            e.type === 'spawn_drop' ||
            e.type === 'pickup_drop' ||
            e.type === 'host_snapshot'
        );
        this.outgoingHttpEvents.unshift(...criticalEvents);
      }
    } finally {
      this.isHttpSyncInFlight = false;
    }
  }

  private reconcileRemotePlayersList(remoteStates: any[]): void {
    const activeRemoteIds = new Set<string>();
    let changed = false;
    for (const st of remoteStates) {
      if (!st || !st.peerId || st.peerId === this.peerId) continue;
      activeRemoteIds.add(st.peerId);
      this.upsertRemotePlayer(st);
      changed = true;
    }
    // Only prune remote players not in `remoteStates` if they aren't directly connected via an active P2P channel
    for (const existingId of Array.from(this.remotePlayers.keys())) {
      if (
        !activeRemoteIds.has(existingId) &&
        !this.p2pGuestConnections.has(existingId)
      ) {
        const leavingPlayer = this.remotePlayers.get(existingId);
        this.remotePlayers.delete(existingId);
        this.callbacks.onPeerLeft?.(existingId, leavingPlayer?.name);
        changed = true;
      }
    }
    if (changed) {
      this.callbacks.onRemotePlayersChanged?.();
    }
  }

  private queueOrSendEvent(payload: any, dedupeKey?: string): void {
    if (!this.isOnline) return;

    const isEphemeralHighFreq =
      payload.type === 'creatures_sync' ||
      payload.type === 'time_sync' ||
      payload.type === 'drops_sync';

    const enriched = isEphemeralHighFreq
      ? payload
      : {
          ...payload,
          _clientEventId: payload._clientEventId || this.nextClientEventId(),
        };

    if (enriched._clientEventId) {
      this.markEventProcessed(enriched._clientEventId);
    }

    // 1. Send over P2P WebRTC if active
    if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
      this.broadcastToP2PGuests(enriched, undefined, !isEphemeralHighFreq);
    } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
      this.safeSendConn(
        this.p2pHostConn,
        {
          ...enriched,
          peerId: this.peerId,
        },
        !isEphemeralHighFreq
      );
    }

    // If pure P2P mode, no need to send over WS/HTTP
    if (this.transportMode === 'P2P_WEBRTC') {
      return;
    }

    // 2. Send over WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(enriched);
      // For high-frequency ephemeral syncs, WS is sufficient
      if (isEphemeralHighFreq) {
        return;
      }
    }

    // 3. Also queue world mutations for HTTP Sync so even if WS stalls, 100% of world interactions arrive!
    if (dedupeKey) {
      const idx = this.outgoingHttpEvents.findIndex(
        (e) => e._dedupeKey === dedupeKey
      );
      if (idx !== -1) {
        this.outgoingHttpEvents[idx] = { ...enriched, _dedupeKey: dedupeKey };
        return;
      }
    }
    this.outgoingHttpEvents.push(
      dedupeKey ? { ...enriched, _dedupeKey: dedupeKey } : enriched
    );
    if (this.outgoingHttpEvents.length > 90) {
      this.outgoingHttpEvents.shift();
    }
  }

  public disconnect(notifyServer = true): void {
    this.intentionalClose = true;
    const prevCode = this.inviteCode;
    const prevPeerId = this.peerId;
    const wasOnline = this.isOnline;

    this.stopHttpSyncLoop();
    this.stopSyncWatchdogLoop();
    this.outgoingHttpEvents = [];

    if (notifyServer && wasOnline) {
      if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
        this.broadcastToP2PGuests(
          {
            type: 'room_closed',
            reason: 'O anfitrião encerrou a sessão online.',
          },
          undefined,
          true
        );
      } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
        this.safeSendConn(
          this.p2pHostConn,
          {
            type: 'leave_room',
            peerId: this.peerId,
          },
          true
        );
      }

      if (this.transportMode !== 'P2P_WEBRTC' && prevCode) {
        this.sendRaw({ type: 'leave_room' });
        const baseUrl = MultiplayerManager.resolveHttpBaseUrl(
          this.customServerUrl
        );
        fetch(`${baseUrl}/api/mp/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteCode: prevCode,
            peerId: prevPeerId,
          }),
        }).catch(() => {});
      }
    }

    this.closeSocketInternal();
    this.closeP2PInternal();
    this.isOnline = false;
    this.role = 'OFFLINE';
    this.inviteCode = null;
    this.transportMode = 'NONE';
    this.syncStatus = 'SYNCED';
    this.activationState = 'IDLE';
    this.activationSteps = [];
    this.lastError = null;
    this.connectedPeers = [];
    this.remotePlayers.clear();
    this.statusMessage = 'Modo Offline (Convite desativado)';
    this.emitSessionChange();
    this.callbacks.onRemotePlayersChanged?.();
  }

  private closeSocketInternal(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private handleServerMessage(msg: any): void {
    if (!msg || typeof msg.type !== 'string') return;

    // Deduplicate events that carry `_eventId` or `_clientEventId` across WS + HTTP + P2P
    if (msg._eventId && this.markEventProcessed(`srv_${msg._eventId}`)) {
      return;
    }
    if (
      msg._clientEventId &&
      this.markEventProcessed(`cli_${msg._clientEventId}`)
    ) {
      return;
    }

    if (
      typeof msg.worldRevision === 'number' &&
      msg.worldRevision > this.worldRevision
    ) {
      this.worldRevision = msg.worldRevision;
    }

    switch (msg.type) {
      case 'room_hosted': {
        this.isOnline = true;
        this.role = 'HOST';
        this.inviteCode = msg.inviteCode;
        this.worldName = msg.worldName || this.worldName;
        this.connectedPeers = msg.peers || [];
        this.activationState = 'ACTIVE';
        this.statusMessage = 'Mundo aberto para convites online!';
        this.emitSessionChange();
        break;
      }

      case 'peer_joined': {
        if (msg.peers) {
          this.connectedPeers = msg.peers;
        }
        if (msg.state && msg.state.peerId !== this.peerId) {
          this.upsertRemotePlayer(msg.state);
        }
        if (msg.peer?.name) {
          this.callbacks.onPlayerEventNotification?.(
            `🌐 ${msg.peer.name} entrou no mundo!`,
            '#4ade80'
          );
        }
        if (
          this.role === 'HOST' &&
          this.transportMode !== 'P2P_WEBRTC' &&
          this.callbacks.onRequestHostSnapshot &&
          msg.peer?.peerId
        ) {
          const freshSnapshot = this.callbacks.onRequestHostSnapshot();
          if (freshSnapshot) {
            this.queueOrSendEvent({
              type: 'host_snapshot',
              targetPeerId: msg.peer.peerId,
              worldSnapshot: freshSnapshot,
            });
          }
        }
        this.emitSessionChange();
        this.callbacks.onRemotePlayersChanged?.();
        break;
      }

      case 'request_host_snapshot': {
        if (this.role === 'HOST' && this.callbacks.onRequestHostSnapshot) {
          const freshSnapshot = this.callbacks.onRequestHostSnapshot();
          if (freshSnapshot) {
            this.queueOrSendEvent(
              {
                type: 'host_snapshot',
                targetPeerId: msg.targetPeerId,
                worldSnapshot: freshSnapshot,
              },
              'host_snapshot'
            );
          }
        }
        break;
      }

      case 'peer_left': {
        if (msg.peers) {
          this.connectedPeers = msg.peers;
        }
        if (msg.peerId) {
          this.remotePlayers.delete(msg.peerId);
          this.callbacks.onPeerLeft?.(msg.peerId, msg.name);
        }
        if (msg.name) {
          this.callbacks.onPlayerEventNotification?.(
            `👋 ${msg.name} saiu do mundo.`,
            '#fbbf24'
          );
        }
        this.emitSessionChange();
        this.callbacks.onRemotePlayersChanged?.();
        break;
      }

      case 'peers_updated': {
        if (msg.peers) {
          this.connectedPeers = msg.peers;
          for (const p of this.connectedPeers) {
            const rp = this.remotePlayers.get(p.peerId);
            if (rp) {
              rp.name = p.name;
            }
          }
          this.emitSessionChange();
          this.callbacks.onRemotePlayersChanged?.();
        }
        break;
      }

      case 'remote_player_state': {
        const st = msg.state;
        if (!st || !st.peerId || st.peerId === this.peerId) break;
        this.upsertRemotePlayer(st);
        break;
      }

      case 'player_chat': {
        const rp = this.remotePlayers.get(msg.peerId);
        if (rp) {
          rp.chatMessage = msg.text;
          rp.chatTimer = 5.5;
        }
        if (msg.name && msg.text) {
          this.callbacks.onPlayerEventNotification?.(
            `💬 ${msg.name}: ${msg.text}`,
            '#fde047'
          );
        }
        break;
      }

      case 'world_snapshot_sync': {
        if (msg.worldSnapshot && this.role === 'GUEST') {
          this.callbacks.onWorldSnapshotReceived?.(msg.worldSnapshot);
        }
        break;
      }

      case 'chunk_sync': {
        if (msg.chunkKey && msg.chunkData) {
          this.callbacks.onChunkSyncReceived?.(msg.chunkKey, msg.chunkData);
        }
        break;
      }

      case 'spawn_drop': {
        if (msg.drop) {
          this.callbacks.onSpawnDropReceived?.(msg.drop);
        }
        break;
      }

      case 'pickup_drop': {
        if (msg.dropId) {
          this.callbacks.onPickupDropReceived?.(msg.dropId, msg.peerId);
        }
        break;
      }

      case 'drops_sync': {
        if (Array.isArray(msg.droppedItems) && this.role === 'GUEST') {
          this.callbacks.onDropsSyncReceived?.(msg.droppedItems);
        }
        break;
      }

      case 'creatures_sync': {
        if (Array.isArray(msg.creatures) && this.role === 'GUEST') {
          this.callbacks.onCreaturesSyncReceived?.(msg.creatures);
        }
        break;
      }

      case 'creature_hit': {
        if (msg.creatureId && typeof msg.damage === 'number') {
          this.callbacks.onCreatureHitReceived?.(
            msg.creatureId,
            msg.damage,
            msg.sourceX ?? 0,
            msg.sourceY ?? 0,
            msg.knockbackMult
          );
        }
        break;
      }

      case 'guest_mount_event': {
        if (msg.peerId && msg.event) {
          this.callbacks.onGuestMountEventReceived?.(msg.peerId, msg.event);
        }
        break;
      }

      case 'time_sync': {
        if (this.role === 'GUEST') {
          this.callbacks.onTimeSyncReceived?.(msg.timeOfDay, msg.dayCount);
        }
        break;
      }

      case 'room_closed': {
        const reason =
          msg.reason || 'O anfitrião fechou o mundo e a sessão terminou.';
        this.disconnect(false);
        this.callbacks.onRoomClosedByHost?.(reason);
        break;
      }
    }
  }

  private upsertRemotePlayer(st: any): void {
    const existing = this.remotePlayers.get(st.peerId);
    const prevSwing = existing?.swingTimer ?? 0;
    const incomingSwing = st.swingTimer ?? 0;

    if (existing) {
      existing.name = st.name || existing.name;
      existing.isHost = Boolean(st.isHost);
      existing.targetX = typeof st.x === 'number' ? st.x : existing.targetX;
      existing.targetY = typeof st.y === 'number' ? st.y : existing.targetY;
      existing.vx = typeof st.vx === 'number' ? st.vx : existing.vx;
      existing.vy = typeof st.vy === 'number' ? st.vy : existing.vy;
      if (
        Math.hypot(existing.targetX - existing.x, existing.targetY - existing.y) >
        96
      ) {
        existing.x = existing.targetX;
        existing.y = existing.targetY;
      }
      existing.direction = st.direction || st.facing || existing.direction;
      existing.hp = typeof st.hp === 'number' ? st.hp : existing.hp;
      existing.maxHp = typeof st.maxHp === 'number' ? st.maxHp : existing.maxHp;
      existing.level = typeof st.level === 'number' ? st.level : existing.level;
      existing.isMoving = Boolean(st.isMoving);
      existing.isSwimming = Boolean(st.isSwimming);
      existing.mountedEntityId =
        st.mountedEntityId !== undefined
          ? st.mountedEntityId
          : existing.mountedEntityId;
      existing.isGalloping =
        st.isGalloping !== undefined
          ? Boolean(st.isGalloping)
          : existing.isGalloping;
      existing.mountedCreatureData =
        st.mountedCreatureData !== undefined
          ? st.mountedCreatureData
          : existing.mountedCreatureData;
      existing.swingTimer = Math.max(prevSwing, incomingSwing);
      existing.swingDuration =
        st.swingDuration ?? existing.swingDuration ?? 0.25;
      existing.heldItemId = st.heldItemId ?? null;
      existing.equippedArmorId =
        st.equippedArmorId ?? existing.equippedArmorId;
      if (st.equippedBySlot) {
        existing.equippedBySlot = st.equippedBySlot;
      }
      if (st.appearance) {
        existing.appearance = st.appearance;
      }
    } else {
      const rx = typeof st.x === 'number' ? st.x : 0;
      const ry = typeof st.y === 'number' ? st.y : 0;
      this.remotePlayers.set(st.peerId, {
        peerId: st.peerId,
        name: st.name || 'Viajante',
        isHost: Boolean(st.isHost),
        x: rx,
        y: ry,
        targetX: rx,
        targetY: ry,
        vx: st.vx ?? 0,
        vy: st.vy ?? 0,
        direction: st.direction || st.facing || 'down',
        hp: st.hp ?? 100,
        maxHp: st.maxHp ?? 100,
        level: st.level ?? 1,
        isMoving: Boolean(st.isMoving),
        isSwimming: Boolean(st.isSwimming),
        mountedEntityId: st.mountedEntityId ?? null,
        isGalloping: Boolean(st.isGalloping),
        mountedCreatureData: st.mountedCreatureData ?? null,
        animFrame: 0,
        animTimer: 0,
        swingTimer: incomingSwing,
        swingDuration: st.swingDuration ?? 0.25,
        hitFlashTimer: 0,
        heldItemId: st.heldItemId ?? null,
        equippedArmorId: st.equippedArmorId ?? null,
        equippedBySlot: st.equippedBySlot || {
          head: null,
          body: null,
          legs: null,
          feet: null,
        },
        appearance: st.appearance || {
          skinColor: '#f5cfa0',
          hairColor: '#3b2416',
          hairStyle: 'adventurer',
          eyeColor: '#2563eb',
          shirtColor: '#2563eb',
          pantsColor: '#1e293b',
        },
      });
      this.callbacks.onRemotePlayersChanged?.();
    }
  }

  public sendPlayerState(player: PlayerState): void {
    const state = this.serializeLocalPlayerState(player);
    this.latestLocalPlayerState = state;
    if (!this.isOnline) return;

    // 1. Send over P2P WebRTC if active (with SCTP backpressure guard)
    if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
      this.broadcastToP2PGuests(
        {
          type: 'remote_player_state',
          state: {
            ...state,
            peerId: this.peerId,
            name: this.localPlayerName,
            isHost: true,
          },
        },
        undefined,
        false
      );
    } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
      this.safeSendConn(
        this.p2pHostConn,
        {
          type: 'player_state',
          peerId: this.peerId,
          name: this.localPlayerName,
          state,
        },
        false
      );
    }

    // 2. Send over WebSocket if active
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw({
        type: 'player_state',
        state,
      });
    }
  }

  public updateLocalPlayerName(newName: string, player?: PlayerState): void {
    const clean = (newName || 'Aventureiro').trim().slice(0, 22);
    if (!clean) return;
    this.localPlayerName = clean;
    if (this.role === 'HOST') {
      this.hostName = clean;
    }
    const selfPeer = this.connectedPeers.find((p) => p.peerId === this.peerId);
    if (selfPeer) {
      selfPeer.name = clean;
    }
    if (this.isOnline) {
      if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
        this.broadcastToP2PGuests(
          {
            type: 'peers_updated',
            peers: this.connectedPeers,
          },
          undefined,
          true
        );
      } else {
        this.queueOrSendEvent(
          {
            type: 'update_player_name',
            name: clean,
          },
          'update_player_name'
        );
      }
      if (player) {
        this.sendPlayerState(player);
      }
    }
    this.emitSessionChange();
  }

  public sendChatMessage(text: string): void {
    if (!this.isOnline) return;
    const clean = text.trim().slice(0, 80);
    if (!clean) return;
    if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
      this.broadcastToP2PGuests(
        {
          type: 'player_chat',
          _clientEventId: this.nextClientEventId(),
          peerId: this.peerId,
          name: this.localPlayerName,
          text: clean,
        },
        undefined,
        true
      );
      if (this.transportMode === 'P2P_WEBRTC') return;
    }
    this.queueOrSendEvent({
      type: 'player_chat',
      text: clean,
    });
  }

  public sendChunkSync(chunkKey: string, chunkData: ChunkData): void {
    if (!this.isOnline) return;
    this.worldRevision += 1;
    this.queueOrSendEvent(
      {
        type: 'chunk_sync',
        chunkKey,
        chunkData,
        worldRevision: this.worldRevision,
      },
      `chunk_${chunkKey}`
    );
  }

  public sendSpawnDrop(drop: DroppedItem): void {
    if (!this.isOnline) return;
    this.worldRevision += 1;
    this.queueOrSendEvent({
      type: 'spawn_drop',
      drop,
      worldRevision: this.worldRevision,
    });
  }

  public sendPickupDrop(dropId: string): void {
    if (!this.isOnline) return;
    this.worldRevision += 1;
    this.queueOrSendEvent({
      type: 'pickup_drop',
      dropId,
      peerId: this.peerId,
      worldRevision: this.worldRevision,
    });
  }

  public sendDropsSync(droppedItems: DroppedItem[]): void {
    if (!this.isOnline || this.role !== 'HOST') return;
    this.queueOrSendEvent(
      {
        type: 'drops_sync',
        droppedItems,
      },
      'drops_sync'
    );
  }

  public sendCreaturesSync(creatures: CreatureEntity[]): void {
    if (
      !this.isOnline ||
      this.role !== 'HOST' ||
      this.remotePlayers.size === 0
    ) {
      return;
    }
    const compactCreatures = this.serializeCreaturesForSync(creatures);
    this.queueOrSendEvent(
      {
        type: 'creatures_sync',
        creatures: compactCreatures,
      },
      'creatures_sync'
    );
  }

  public sendCreatureHit(
    creatureId: string,
    damage: number,
    sourceX: number,
    sourceY: number,
    knockbackMult?: number
  ): void {
    if (!this.isOnline) return;
    this.queueOrSendEvent({
      type: 'creature_hit',
      creatureId,
      damage,
      sourceX,
      sourceY,
      knockbackMult,
    });
  }

  public sendGuestMountEvent(event: any): void {
    if (!this.isOnline || this.role !== 'GUEST') return;
    this.queueOrSendEvent({
      type: 'guest_mount_event',
      peerId: this.peerId,
      event,
    });
  }

  public sendTimeSync(timeOfDay: number, dayCount: number): void {
    if (
      !this.isOnline ||
      this.role !== 'HOST' ||
      this.remotePlayers.size === 0
    ) {
      return;
    }
    this.queueOrSendEvent(
      {
        type: 'time_sync',
        timeOfDay,
        dayCount,
      },
      'time_sync'
    );
  }

  private sendRaw(payload: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private emitSessionChange(): void {
    this.callbacks.onSessionChanged?.(this.getSessionInfo());
  }
}
