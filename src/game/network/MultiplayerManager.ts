import {
  ChunkData,
  CreatureEntity,
  DroppedItem,
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
  public transportMode: 'WEBSOCKET' | 'HTTP_SYNC' | 'NONE' = 'NONE';
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
   * Opens the current world for online multiplayer as HOST with a fast,
   * transparent step-by-step activation checklist and hybrid HTTP + WebSocket sync.
   */
  public async hostWorld(
    worldSnapshot: WorldSaveData,
    localPlayer: PlayerState,
    preferredCode?: string
  ): Promise<boolean> {
    this.stopHttpSyncLoop();
    this.closeSocketInternal();
    this.intentionalClose = false;
    this.role = 'HOST';
    this.worldName = worldSnapshot.metadata?.name || 'Mundo Online';
    this.hostName = this.localPlayerName;
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
        label: '4. Sincronizando canal em tempo real',
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

    // STEP 2: Ping server health / latency
    this.setStepStatus(
      'server_check',
      'loading',
      'Testando rota /api/mp/ping...'
    );
    const pingStart = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const pingRes = await fetch(`${baseUrl}/api/mp/ping`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!pingRes.ok) {
        throw new Error(`Servidor respondeu HTTP ${pingRes.status}`);
      }
      const pingData = await pingRes.json();
      if (!pingData || !pingData.ok) {
        throw new Error('Resposta inválida do endpoint /api/mp/ping');
      }
      const latencyMs = Math.max(1, Math.round(performance.now() - pingStart));
      this.setStepStatus(
        'server_check',
        'success',
        `Servidor ativo (${latencyMs} ms)`
      );
    } catch (err: any) {
      const detail =
        err?.name === 'AbortError'
          ? 'Tempo limite excedido (5s) ao contatar o servidor.'
          : err?.message || 'Servidor inacessível.';
      this.setStepStatus('server_check', 'error', detail);
      this.activationState = 'ERROR';
      this.isOnline = false;
      this.role = 'OFFLINE';
      this.lastError = `Erro de conexão com o servidor: ${detail}`;
      this.statusMessage = this.lastError;
      this.emitSessionChange();
      return false;
    }

    // STEP 3: Register room & generate Invite Code via HTTP POST /api/mp/host
    this.setStepStatus(
      'register_room',
      'loading',
      'Solicitando Código de Convite...'
    );
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      const hostRes = await fetch(`${baseUrl}/api/mp/host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId: this.peerId,
          playerName: this.localPlayerName,
          preferredCode: preferredCode ?? this.inviteCode ?? '',
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
          hostData?.error ||
            `Falha ao registrar sala (HTTP ${hostRes.status})`
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

    // Start HTTP Realtime Sync loop immediately so the room stays alive & synced
    this.startHttpSyncLoop();

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
        'WebSocket Tempo Real + HTTP Backup ativos'
      );
    } else {
      this.transportMode = 'HTTP_SYNC';
      this.setStepStatus(
        'realtime_channel',
        'success',
        'Sincronização HTTP Tempo Real ativa (Modo Compatível)'
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
          if (this.isOnline) {
            // Fallback seamlessly to HTTP sync without dropping the online room!
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
   * Uses HTTP POST /api/mp/join first (guaranteed to work across proxies and large snapshots),
   * then upgrades to WebSocket + HTTP sync.
   */
  public static async joinWorldByCode(
    inviteCode: string,
    playerName: string,
    customServerUrl = ''
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
    manager.statusMessage = 'Conectando ao mundo online...';

    const baseUrl = MultiplayerManager.resolveHttpBaseUrl(customServerUrl);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 9000);
      const res = await fetch(`${baseUrl}/api/mp/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode: cleanCode,
          peerId: manager.peerId,
          playerName: manager.localPlayerName,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data || !data.ok || !data.worldSnapshot) {
        return {
          ok: false,
          error:
            data?.error ||
            `Não foi possível entrar no mundo com o código ${cleanCode} (HTTP ${res.status}).`,
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
      // Also attach WebSocket in background for low-latency updates if supported
      manager.tryAttachWebSocket(1800);

      return {
        ok: true,
        manager,
        worldSave: data.worldSnapshot as WorldSaveData,
      };
    } catch (err: any) {
      return {
        ok: false,
        error:
          err?.name === 'AbortError'
            ? 'Tempo limite esgotado ao conectar ao mundo online.'
            : err?.message ||
              'Erro de conexão com o servidor ao entrar no mundo.',
      };
    }
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
          if (this.role === 'GUEST') {
            this.handleServerMessage({
              type: 'room_closed',
              reason:
                errData.error || 'O anfitrião encerrou a sessão online.',
            });
          } else if (this.role === 'HOST') {
            // Host room was cleared (e.g. server restarted) -> re-host automatically if possible
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

      // Update connected peers list if changed
      if (Array.isArray(data.peers)) {
        const prevCount = this.connectedPeers.length;
        this.connectedPeers = data.peers;
        if (prevCount !== this.connectedPeers.length) {
          this.emitSessionChange();
        }
      }

      // Sync remote player positions/animations when WS is not active (or to keep states fresh)
      if (Array.isArray(data.remoteStates)) {
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

      // Process queued server events
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(payload);
      return;
    }

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

    if (notifyServer && wasOnline && prevCode) {
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

    this.closeSocketInternal();
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
      if (Math.hypot(existing.targetX - existing.x, existing.targetY - existing.y) > 96) {
        existing.x = existing.targetX;
        existing.y = existing.targetY;
      }
      existing.direction = st.direction || st.facing || existing.direction;
      existing.hp = typeof st.hp === 'number' ? st.hp : existing.hp;
      existing.maxHp = typeof st.maxHp === 'number' ? st.maxHp : existing.maxHp;
      existing.level = typeof st.level === 'number' ? st.level : existing.level;
      existing.isMoving = Boolean(st.isMoving);
      existing.swingTimer = Math.max(prevSwing, incomingSwing);
      existing.swingDuration = st.swingDuration ?? existing.swingDuration ?? 0.25;
      existing.heldItemId = st.heldItemId ?? null;
      existing.equippedArmorId = st.equippedArmorId ?? existing.equippedArmorId;
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
      this.queueOrSendEvent(
        {
          type: 'update_player_name',
          name: clean,
        },
        'update_player_name'
      );
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
