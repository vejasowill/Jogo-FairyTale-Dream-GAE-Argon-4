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
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const P2P_ROOM_PREFIX = 'wildborn-mp-room-';
const SNAPSHOT_CHUNK_SIZE = 28 * 1024; // 28 KB per WebRTC DataChannel frame for 100% mobile compatibility

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

  // P2P WebRTC (PeerJS) state for serverless / GitHub static deployments
  private p2pPeer: Peer | null = null;
  private p2pHostConn: DataConnection | null = null; // Used when role === 'GUEST'
  private p2pGuestConnections = new Map<string, DataConnection>(); // Used when role === 'HOST'
  private p2pKeepAliveInterval: number | null = null;
  private initialHostSnapshot: WorldSaveData | null = null;
  private incomingSnapshotChunks: string[] = [];
  private incomingSnapshotTotal = 0;

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
      swingTimer: player.swingTimer,
      swingDuration: player.swingDuration,
      heldItemId: heldSlot?.itemId || null,
      equippedArmorId: player.equippedArmorId,
      equippedBySlot: player.equippedBySlot,
      appearance: player.appearance,
    };
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

      this.startP2PKeepAliveLoop();
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
      this.connectedPeers = hostData.peers || [
        {
          peerId: this.peerId,
          name: this.localPlayerName,
          isHost: true,
          level: localPlayer.level,
        },
      ];
      this.transportMode = 'HTTP_SYNC';

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
        this.startP2PKeepAliveLoop();
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

    // Start HTTP Realtime Sync loop
    this.startHttpSyncLoop();

    // Also open P2P listener on the same inviteCode in the background so cross-origin/mobile players can pair via P2P too!
    if (this.inviteCode) {
      void this.openP2PHostRoom(this.inviteCode, localPlayer.level, performance.now(), true);
      this.startP2PKeepAliveLoop();
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
        'WebSocket + P2P Tempo Real ativos'
      );
    } else {
      this.transportMode = 'HTTP_SYNC';
      this.setStepStatus(
        'realtime_channel',
        'success',
        'Sincronização HTTP + P2P Tempo Real ativos'
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
          if (errType === 'unavailable-id' && attempts < maxAttempts) {
            try {
              peer.destroy();
            } catch {
              // ignore
            }
            const nextCode = MultiplayerManager.generateRandomInviteCode(6);
            tryCreatePeer(nextCode);
            return;
          }

          if (!this.isOnline) {
            finish({
              ok: false,
              error:
                err?.message ||
                `Erro no pareamento P2P (${errType || 'desconhecido'}).`,
            });
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
   * Handles a new Guest connecting to the Host via WebRTC DataChannel.
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

      if (msg.type === 'p2p_join_request') {
        const guestPeerId = String(
          msg.peerId || 'guest_' + Math.random().toString(36).slice(2, 8)
        );
        const guestName =
          String(msg.playerName || 'Viajante')
            .trim()
            .slice(0, 22) || 'Viajante';
        const guestVersion = String(msg.gameVersion || '').trim();

        // Enforce strict game version match between Host and Guest
        if (guestVersion !== GAME_VERSION) {
          const guestVerLabel = guestVersion || 'anterior/desatualizada';
          this.safeSendConn(conn, {
            type: 'p2p_join_rejected',
            code: 'VERSION_MISMATCH',
            hostVersion: GAME_VERSION,
            guestVersion: guestVerLabel,
            error: `Versão incompatível! O mundo do anfitrião está na versão v${GAME_VERSION}, mas o seu jogo está na versão v${guestVerLabel}. Atualize o jogo para jogar na mesma versão.`,
          });
          return;
        }

        registeredPeerId = guestPeerId;
        registeredName = guestName;
        this.p2pGuestConnections.set(guestPeerId, conn);

        // Add or update in connectedPeers
        const existingPeerIdx = this.connectedPeers.findIndex(
          (p) => p.peerId === guestPeerId
        );
        const guestSummary: OnlinePeerSummary = {
          peerId: guestPeerId,
          name: guestName,
          isHost: false,
          level: 1,
        };
        if (existingPeerIdx >= 0) {
          this.connectedPeers[existingPeerIdx] = guestSummary;
        } else {
          // Ensure Host is in connectedPeers
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

        // Obtain the latest live world snapshot from GameEngine
        const freshSnapshot =
          this.callbacks.onRequestHostSnapshot?.() || this.initialHostSnapshot;

        if (!freshSnapshot) {
          this.safeSendConn(conn, {
            type: 'p2p_join_rejected',
            error: 'O mundo do anfitrião ainda está carregando.',
          });
          return;
        }

        // Send worldSnapshot in safe 28 KB chunks over WebRTC DataChannel
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
          this.safeSendConn(conn, {
            type: 'p2p_snapshot_chunk',
            index: i,
            total: totalChunks,
            chunk: slice,
          });
        }

        // Gather all current player states (Host + other Guests) so the new Guest sees everyone immediately
        const remoteStates: any[] = [];
        if (this.latestLocalPlayerState) {
          remoteStates.push({
            ...this.latestLocalPlayerState,
            peerId: this.peerId,
            name: this.localPlayerName,
            isHost: true,
          });
        }
        for (const rp of this.remotePlayers.values()) {
          if (rp.peerId !== guestPeerId) {
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
              swingTimer: rp.swingTimer,
              swingDuration: rp.swingDuration,
              heldItemId: rp.heldItemId,
              equippedArmorId: rp.equippedArmorId,
              equippedBySlot: rp.equippedBySlot,
              appearance: rp.appearance,
            });
          }
        }

        this.safeSendConn(conn, {
          type: 'p2p_join_accepted',
          inviteCode: this.inviteCode,
          worldName: this.worldName,
          hostName: this.hostName,
          gameVersion: GAME_VERSION,
          peers: this.connectedPeers,
          remoteStates,
        });

        // Notify Host locally & broadcast peer_joined to other Guests
        this.callbacks.onPlayerEventNotification?.(
          `🌐 ${guestName} entrou no mundo!`,
          '#4ade80'
        );
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

      // Forward & process in-game events from this Guest
      const senderId = registeredPeerId || msg.peerId;
      if (!senderId) return;

      this.handleP2PMessageFromGuest(senderId, registeredName, msg);
    });

    const handleGuestDisconnect = () => {
      if (!registeredPeerId) return;
      const leavingId = registeredPeerId;
      const leavingName = registeredName;
      registeredPeerId = null;

      this.p2pGuestConnections.delete(leavingId);
      this.connectedPeers = this.connectedPeers.filter(
        (p) => p.peerId !== leavingId
      );
      this.remotePlayers.delete(leavingId);

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
          peerId: guestPeerId,
          name: senderName,
          text: String(msg.text || '').slice(0, 80),
        };
        this.handleServerMessage(chatPayload);
        this.broadcastToP2PGuests(chatPayload, guestPeerId);
        break;
      }

      case 'chunk_sync': {
        this.handleServerMessage(msg);
        this.broadcastToP2PGuests(msg, guestPeerId);
        break;
      }

      case 'spawn_drop': {
        this.handleServerMessage(msg);
        this.broadcastToP2PGuests(msg, guestPeerId);
        break;
      }

      case 'pickup_drop': {
        const pickupPayload = {
          type: 'pickup_drop',
          dropId: msg.dropId,
          peerId: guestPeerId,
        };
        this.handleServerMessage(pickupPayload);
        this.broadcastToP2PGuests(pickupPayload, guestPeerId);
        break;
      }

      case 'creature_hit': {
        this.handleServerMessage(msg);
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

  private broadcastToP2PGuests(payload: any, excludePeerId?: string): void {
    if (this.p2pGuestConnections.size === 0) return;
    for (const [peerId, conn] of this.p2pGuestConnections.entries()) {
      if (excludePeerId && peerId === excludePeerId) continue;
      this.safeSendConn(conn, payload);
    }
  }

  private safeSendConn(conn: DataConnection | null, payload: any): void {
    if (!conn || !conn.open) return;
    try {
      conn.send(payload);
    } catch {
      // ignore transient channel buffer error
    }
  }

  private safeJsonParse(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private startP2PKeepAliveLoop(): void {
    this.stopP2PKeepAliveLoop();
    this.p2pKeepAliveInterval = window.setInterval(() => {
      if (!this.isOnline) return;
      if (this.role === 'HOST') {
        this.broadcastToP2PGuests({ type: 'p2p_ping', t: Date.now() });
      } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
        this.safeSendConn(this.p2pHostConn, { type: 'p2p_ping', t: Date.now() });
      }
    }, 3000);
  }

  private stopP2PKeepAliveLoop(): void {
    if (this.p2pKeepAliveInterval !== null) {
      window.clearInterval(this.p2pKeepAliveInterval);
      this.p2pKeepAliveInterval = null;
    }
  }

  private closeP2PInternal(): void {
    this.stopP2PKeepAliveLoop();
    for (const conn of this.p2pGuestConnections.values()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    this.p2pGuestConnections.clear();

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
          manager.activationState = 'ACTIVE';
          manager.statusMessage = `Conectado ao mundo de ${manager.hostName}!`;

          if (Array.isArray(data.remoteStates)) {
            for (const st of data.remoteStates) {
              if (st && st.peerId && st.peerId !== manager.peerId) {
                manager.upsertRemotePlayer(st);
              }
            }
          }

          manager.startHttpSyncLoop();
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
    onProgress?.(
      `Conectando via P2P WebRTC à sala ${cleanCode}...`
    );
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
        onProgress?.(
          `Pareando com o anfitrião da sala ${cleanCode}...`
        );

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
          manager.safeSendConn(conn, {
            type: 'p2p_join_request',
            peerId: manager.peerId,
            playerName: manager.localPlayerName,
            gameVersion: GAME_VERSION,
          });
        });

        conn.on('data', (raw: any) => {
          const msg =
            typeof raw === 'string' ? manager.safeJsonParse(raw) : raw;
          if (!msg || typeof msg.type !== 'string') return;

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
            onProgress?.(
              `Sincronizando mundo do anfitrião (${pct}%)...`
            );
            return;
          }

          if (msg.type === 'p2p_join_accepted') {
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
              manager.activationState = 'ACTIVE';
              manager.statusMessage = `Conectado via P2P ao mundo de ${manager.hostName}!`;

              if (Array.isArray(msg.remoteStates)) {
                for (const st of msg.remoteStates) {
                  if (st && st.peerId && st.peerId !== manager.peerId) {
                    manager.upsertRemotePlayer(st);
                  }
                }
              }

              manager.startP2PKeepAliveLoop();
              finish({
                ok: true,
                manager,
                worldSave: worldSnapshot,
              });
            } catch (parseErr: any) {
              manager.closeP2PInternal();
              finish({
                ok: false,
                error:
                  parseErr?.message ||
                  'Erro ao reconstruir o mapa recebido do anfitrião.',
              });
            }
            return;
          }

          // Standard live multiplayer events received after joining
          if (msg.type !== 'p2p_ping') {
            manager.handleServerMessage(msg);
          }
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
          if (manager.isOnline && !manager.intentionalClose) {
            manager.handleServerMessage({
              type: 'room_closed',
              reason: 'A conexão P2P com o anfitrião foi encerrada.',
            });
          }
        });
      });

      peer.on('error', (err: any) => {
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
      });
    });
  }

  private startHttpSyncLoop(): void {
    this.stopHttpSyncLoop();
    this.httpSyncInterval = window.setInterval(() => {
      this.performHttpSyncTick();
    }, 240);
  }

  private stopHttpSyncLoop(): void {
    if (this.httpSyncInterval !== null) {
      window.clearInterval(this.httpSyncInterval);
      this.httpSyncInterval = null;
    }
  }

  private async performHttpSyncTick(): Promise<void> {
    if (!this.isOnline || !this.inviteCode || this.isHttpSyncInFlight) return;
    this.isHttpSyncInFlight = true;

    const baseUrl = MultiplayerManager.resolveHttpBaseUrl(this.customServerUrl);
    const eventsToSend = this.outgoingHttpEvents.splice(
      0,
      this.outgoingHttpEvents.length
    );

    try {
      const res = await fetch(`${baseUrl}/api/mp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: this.inviteCode,
          peerId: this.peerId,
          playerState: this.latestLocalPlayerState,
          events: eventsToSend,
        }),
      });

      if (res.status === 404) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.roomClosed) {
          if (this.role === 'GUEST' && this.transportMode !== 'P2P_WEBRTC') {
            this.handleServerMessage({
              type: 'room_closed',
              reason:
                errData.error || 'O anfitrião encerrou a sessão online.',
            });
          } else if (this.role === 'HOST') {
            const freshSnap = this.callbacks.onRequestHostSnapshot?.();
            if (freshSnap && this.latestLocalPlayerState) {
              await fetch(`${baseUrl}/api/mp/host`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  peerId: this.peerId,
                  playerName: this.localPlayerName,
                  preferredCode: this.inviteCode,
                  worldSnapshot: freshSnap,
                  playerState: this.latestLocalPlayerState,
                }),
              }).catch(() => {});
            }
          }
        }
        return;
      }

      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.ok) return;

      if (Array.isArray(data.peers) && this.p2pGuestConnections.size === 0) {
        const prevCount = this.connectedPeers.length;
        this.connectedPeers = data.peers;
        if (prevCount !== this.connectedPeers.length) {
          this.emitSessionChange();
        }
      }

      if (
        Array.isArray(data.remoteStates) &&
        this.p2pGuestConnections.size === 0
      ) {
        const activeRemoteIds = new Set<string>();
        let changed = false;
        for (const st of data.remoteStates) {
          if (!st || !st.peerId || st.peerId === this.peerId) continue;
          activeRemoteIds.add(st.peerId);
          this.upsertRemotePlayer(st);
          changed = true;
        }
        for (const existingId of Array.from(this.remotePlayers.keys())) {
          if (!activeRemoteIds.has(existingId)) {
            this.remotePlayers.delete(existingId);
            changed = true;
          }
        }
        if (changed) {
          this.callbacks.onRemotePlayersChanged?.();
        }
      }

      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          if (ev && typeof ev.type === 'string') {
            this.handleServerMessage(ev);
          }
        }
      }

      if (
        this.role === 'GUEST' &&
        typeof data.timeOfDay === 'number' &&
        typeof data.dayCount === 'number'
      ) {
        this.callbacks.onTimeSyncReceived?.(data.timeOfDay, data.dayCount);
      }
    } catch {
      // Transient network hiccup; next tick will retry
    } finally {
      this.isHttpSyncInFlight = false;
    }
  }

  private queueOrSendEvent(payload: any, dedupeKey?: string): void {
    if (!this.isOnline) return;

    // 1. Send over P2P WebRTC if active
    if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
      this.broadcastToP2PGuests(payload);
    } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
      this.safeSendConn(this.p2pHostConn, {
        ...payload,
        peerId: this.peerId,
      });
    }

    // If pure P2P mode, no need to queue HTTP events
    if (this.transportMode === 'P2P_WEBRTC') {
      return;
    }

    // 2. Send over WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(payload);
      return;
    }

    // 3. Queue for HTTP Sync fallback
    if (dedupeKey) {
      const idx = this.outgoingHttpEvents.findIndex(
        (e) => e._dedupeKey === dedupeKey
      );
      if (idx !== -1) {
        this.outgoingHttpEvents[idx] = { ...payload, _dedupeKey: dedupeKey };
        return;
      }
    }
    this.outgoingHttpEvents.push(
      dedupeKey ? { ...payload, _dedupeKey: dedupeKey } : payload
    );
    if (this.outgoingHttpEvents.length > 80) {
      this.outgoingHttpEvents.shift();
    }
  }

  public disconnect(notifyServer = true): void {
    this.intentionalClose = true;
    const prevCode = this.inviteCode;
    const prevPeerId = this.peerId;
    const wasOnline = this.isOnline;

    this.stopHttpSyncLoop();
    this.outgoingHttpEvents = [];

    if (notifyServer && wasOnline) {
      if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
        this.broadcastToP2PGuests({
          type: 'room_closed',
          reason: 'O anfitrião encerrou a sessão online.',
        });
      } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
        this.safeSendConn(this.p2pHostConn, {
          type: 'leave_room',
          peerId: this.peerId,
        });
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

      case 'peer_left': {
        if (msg.peers) {
          this.connectedPeers = msg.peers;
        }
        if (msg.peerId) {
          this.remotePlayers.delete(msg.peerId);
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

    // 1. Send over P2P WebRTC if active
    if (this.role === 'HOST' && this.p2pGuestConnections.size > 0) {
      this.broadcastToP2PGuests({
        type: 'remote_player_state',
        state: {
          ...state,
          peerId: this.peerId,
          name: this.localPlayerName,
          isHost: true,
        },
      });
    } else if (this.role === 'GUEST' && this.p2pHostConn?.open) {
      this.safeSendConn(this.p2pHostConn, {
        type: 'player_state',
        peerId: this.peerId,
        name: this.localPlayerName,
        state,
      });
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
        this.broadcastToP2PGuests({
          type: 'peers_updated',
          peers: this.connectedPeers,
        });
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
      this.broadcastToP2PGuests({
        type: 'player_chat',
        peerId: this.peerId,
        name: this.localPlayerName,
        text: clean,
      });
      if (this.transportMode === 'P2P_WEBRTC') return;
    }
    this.queueOrSendEvent({
      type: 'player_chat',
      text: clean,
    });
  }

  public sendChunkSync(chunkKey: string, chunkData: ChunkData): void {
    if (!this.isOnline) return;
    this.queueOrSendEvent(
      {
        type: 'chunk_sync',
        chunkKey,
        chunkData,
      },
      `chunk_${chunkKey}`
    );
  }

  public sendSpawnDrop(drop: DroppedItem): void {
    if (!this.isOnline) return;
    this.queueOrSendEvent({
      type: 'spawn_drop',
      drop,
    });
  }

  public sendPickupDrop(dropId: string): void {
    if (!this.isOnline) return;
    this.queueOrSendEvent({
      type: 'pickup_drop',
      dropId,
      peerId: this.peerId,
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
    this.queueOrSendEvent(
      {
        type: 'creatures_sync',
        creatures,
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
