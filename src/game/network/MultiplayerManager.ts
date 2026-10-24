import {
  ChunkData,
  CreatureEntity,
  DroppedItem,
  OnlinePeerSummary,
  OnlineSessionInfo,
  PlayerState,
  RemotePlayerState,
  WorldSaveData,
} from '../core/types';

export interface MultiplayerCallbacks {
  onSessionChanged: (session: OnlineSessionInfo) => void;
  onRemotePlayersChanged: () => void;
  onRequestHostSnapshot: (targetPeerId?: string) => WorldSaveData;
  onWorldSnapshotReceived: (snapshot: WorldSaveData) => void;
  onChunkSyncReceived: (chunkKey: string, chunkData: ChunkData) => void;
  onSpawnDropReceived: (drop: DroppedItem) => void;
  onPickupDropReceived: (dropId: string) => void;
  onDropsSyncReceived: (drops: DroppedItem[]) => void;
  onCreaturesSyncReceived: (creatures: CreatureEntity[]) => void;
  onCreatureHitReceived: (
    creatureId: string,
    damage: number,
    sourceX: number,
    sourceY: number,
    knockbackMult: number
  ) => void;
  onTimeSyncReceived: (timeOfDay: number, dayCount: number) => void;
  onPlayerEventNotification: (text: string, color?: string) => void;
  onRoomClosedByHost: (reason: string) => void;
}

export class MultiplayerManager {
  public peerId: string;
  public role: 'HOST' | 'GUEST' | 'OFFLINE' = 'OFFLINE';
  public isOnline = false;
  public inviteCode: string | null = null;
  public worldName = '';
  public hostName = '';
  public localPlayerName = 'Aventureiro';
  public statusMessage: string | null = null;
  public connectedPeers: OnlinePeerSummary[] = [];
  public remotePlayers = new Map<string, RemotePlayerState>();

  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks | null = null;
  private customServerUrl = '';
  private destroyed = false;

  constructor(playerName?: string, customServerUrl?: string) {
    this.peerId = `peer_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    if (playerName && playerName.trim()) {
      this.localPlayerName = playerName.trim().slice(0, 22);
    }
    if (customServerUrl) {
      this.customServerUrl = customServerUrl.trim();
    }
  }

  public setCallbacks(cb: MultiplayerCallbacks): void {
    this.callbacks = cb;
  }

  public static resolveWsUrl(customServerUrl?: string): string {
    const trimmed = (customServerUrl || '').trim().replace(/\/+$/, '');
    if (trimmed) {
      if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
        return `${trimmed}/ws-game`;
      }
      if (trimmed.startsWith('https://')) {
        return `${trimmed.replace(/^https:\/\//, 'wss://')}/ws-game`;
      }
      if (trimmed.startsWith('http://')) {
        return `${trimmed.replace(/^http:\/\//, 'ws://')}/ws-game`;
      }
    }
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws-game`;
    }
    return 'ws://localhost:3000/ws-game';
  }

  /**
   * Static helper used on WorldSelectScreen when a Guest enters a friend's Invite Code.
   * Connects to the room, fetches the live WorldSaveData from the Host/Server, and returns both
   * the active MultiplayerManager (already connected as GUEST) and the initial WorldSaveData.
   */
  public static joinWorldByCode(
    rawCode: string,
    playerName: string,
    customServerUrl?: string
  ): Promise<{
    ok: boolean;
    error?: string;
    manager?: MultiplayerManager;
    worldSave?: WorldSaveData;
    inviteCode?: string;
    hostName?: string;
  }> {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      return Promise.resolve({
        ok: false,
        error: 'Digite um código de convite válido (ex: A7K9M2).',
      });
    }

    return new Promise((resolve) => {
      const manager = new MultiplayerManager(playerName, customServerUrl);
      const wsUrl = MultiplayerManager.resolveWsUrl(customServerUrl);
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        manager.disconnect();
        resolve({
          ok: false,
          error:
            'Tempo esgotado ao conectar na sala online. Verifique se o mundo do anfitrião está aberto.',
        });
      }, 8000);

      try {
        const ws = new WebSocket(wsUrl);
        manager.ws = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'join_room',
              inviteCode: code,
              peerId: manager.peerId,
              playerName: manager.localPlayerName,
            })
          );
        };

        ws.onmessage = (event) => {
          let msg: any;
          try {
            msg = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (!msg || typeof msg.type !== 'string') return;

          if (!settled) {
            if (msg.type === 'join_error' || msg.type === 'error') {
              settled = true;
              clearTimeout(timeout);
              manager.disconnect();
              resolve({
                ok: false,
                error:
                  msg.message ||
                  'Código de convite inválido ou o mundo não está aberto no momento.',
              });
              return;
            }

            if (msg.type === 'room_joined' && msg.worldSnapshot) {
              settled = true;
              clearTimeout(timeout);
              manager.role = 'GUEST';
              manager.isOnline = true;
              manager.inviteCode = msg.inviteCode || code;
              manager.worldName =
                msg.worldName ||
                msg.worldSnapshot.metadata?.name ||
                'Mundo Online';
              manager.hostName = msg.hostName || 'Anfitrião';
              manager.statusMessage = `Conectado ao mundo de ${manager.hostName}`;
              manager.syncPeersList(msg.peers || []);

              // Switch message handler to normal runtime loop
              ws.onmessage = (ev) => manager.handleMessage(ev);
              ws.onclose = () => manager.handleSocketClose();
              ws.onerror = () => {};

              resolve({
                ok: true,
                manager,
                worldSave: msg.worldSnapshot as WorldSaveData,
                inviteCode: manager.inviteCode || code,
                hostName: manager.hostName,
              });
            }
          }
        };

        ws.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          manager.disconnect();
          resolve({
            ok: false,
            error: 'Não foi possível conectar ao servidor online.',
          });
        };

        ws.onclose = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({
            ok: false,
            error: 'Conexão encerrada antes de entrar no mundo.',
          });
        };
      } catch (err: any) {
        clearTimeout(timeout);
        resolve({
          ok: false,
          error: err?.message || 'Erro ao iniciar conexão WebSocket.',
        });
      }
    });
  }

  /**
   * Opens an online session as HOST for the currently open world.
   * Generates a 6-character Invite Code valid for as long as the Host keeps this world open.
   */
  public hostWorld(
    worldSnapshot: WorldSaveData,
    playerState: PlayerState,
    preferredCode?: string
  ): void {
    this.disconnect(false);
    this.destroyed = false;
    this.role = 'HOST';
    this.worldName = worldSnapshot.metadata.name;
    this.hostName = this.localPlayerName;
    this.statusMessage = 'Abrindo sala online e gerando código de convite...';
    this.notifySessionChanged();

    const wsUrl = MultiplayerManager.resolveWsUrl(this.customServerUrl);
    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            type: 'host_room',
            peerId: this.peerId,
            playerName: this.localPlayerName,
            preferredCode: preferredCode || this.inviteCode || undefined,
            worldSnapshot,
            playerState: this.serializeLocalPlayerState(playerState),
          })
        );
      };

      ws.onmessage = (ev) => this.handleMessage(ev);
      ws.onclose = () => this.handleSocketClose();
      ws.onerror = () => {
        this.statusMessage = 'Erro na conexão online.';
        this.notifySessionChanged();
      };
    } catch {
      this.statusMessage = 'Falha ao conectar ao servidor WebSocket.';
      this.notifySessionChanged();
    }
  }

  private handleMessage(event: MessageEvent): void {
    let msg: any;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'room_hosted': {
        this.isOnline = true;
        this.role = 'HOST';
        this.inviteCode = msg.inviteCode;
        this.worldName = msg.worldName || this.worldName;
        this.statusMessage = `Mundo aberto online! Código: ${this.inviteCode}`;
        this.syncPeersList(msg.peers || []);
        this.notifySessionChanged();
        break;
      }

      case 'peer_joined': {
        this.syncPeersList(msg.peers || []);
        if (msg.peerId && msg.peerId !== this.peerId && msg.state) {
          this.upsertRemotePlayer(
            msg.peerId,
            msg.name || 'Viajante',
            Boolean(msg.isHost),
            msg.state
          );
        }
        this.callbacks?.onPlayerEventNotification(
          `🌐 ${msg.name || 'Viajante'} entrou no mundo!`,
          '#4ade80'
        );
        this.notifySessionChanged();
        break;
      }

      case 'peer_left': {
        this.syncPeersList(msg.peers || []);
        if (msg.peerId) {
          this.remotePlayers.delete(msg.peerId);
          this.callbacks?.onRemotePlayersChanged();
        }
        this.callbacks?.onPlayerEventNotification(
          `👋 ${msg.name || 'Viajante'} saiu do mundo.`,
          '#fbbf24'
        );
        this.notifySessionChanged();
        break;
      }

      case 'request_host_snapshot': {
        if (this.role === 'HOST' && this.callbacks) {
          const freshSnapshot = this.callbacks.onRequestHostSnapshot(
            msg.targetPeerId
          );
          this.sendRaw({
            type: 'host_snapshot',
            targetPeerId: msg.targetPeerId,
            worldSnapshot: freshSnapshot,
          });
        }
        break;
      }

      case 'world_snapshot_sync': {
        if (this.role === 'GUEST' && msg.worldSnapshot && this.callbacks) {
          this.callbacks.onWorldSnapshotReceived(msg.worldSnapshot);
        }
        break;
      }

      case 'player_state': {
        if (msg.peerId && msg.peerId !== this.peerId && msg.state) {
          this.upsertRemotePlayer(
            msg.peerId,
            msg.name || 'Viajante',
            Boolean(msg.isHost),
            msg.state
          );
        }
        break;
      }

      case 'chunk_sync': {
        if (
          msg.peerId !== this.peerId &&
          msg.chunkKey &&
          msg.chunkData &&
          this.callbacks
        ) {
          this.callbacks.onChunkSyncReceived(msg.chunkKey, msg.chunkData);
        }
        break;
      }

      case 'spawn_drop': {
        if (msg.peerId !== this.peerId && msg.drop && this.callbacks) {
          this.callbacks.onSpawnDropReceived(msg.drop);
        }
        break;
      }

      case 'pickup_drop': {
        if (msg.peerId !== this.peerId && msg.dropId && this.callbacks) {
          this.callbacks.onPickupDropReceived(msg.dropId);
        }
        break;
      }

      case 'drops_sync': {
        if (
          msg.peerId !== this.peerId &&
          Array.isArray(msg.droppedItems) &&
          this.callbacks
        ) {
          this.callbacks.onDropsSyncReceived(msg.droppedItems);
        }
        break;
      }

      case 'creatures_sync': {
        if (
          this.role === 'GUEST' &&
          Array.isArray(msg.creatures) &&
          this.callbacks
        ) {
          this.callbacks.onCreaturesSyncReceived(msg.creatures);
        }
        break;
      }

      case 'creature_hit': {
        if (
          msg.peerId !== this.peerId &&
          msg.creatureId &&
          typeof msg.damage === 'number' &&
          this.callbacks
        ) {
          this.callbacks.onCreatureHitReceived(
            msg.creatureId,
            msg.damage,
            msg.sourceX ?? 0,
            msg.sourceY ?? 0,
            msg.knockbackMult ?? 1.0
          );
        }
        break;
      }

      case 'time_sync': {
        if (msg.peerId !== this.peerId && this.callbacks) {
          this.callbacks.onTimeSyncReceived(msg.timeOfDay, msg.dayCount);
        }
        break;
      }

      case 'player_chat': {
        const text = String(msg.text || '').trim().slice(0, 80);
        if (!text) break;
        const rp = this.remotePlayers.get(msg.peerId);
        if (rp) {
          rp.chatMessage = text;
          rp.chatTimer = 6.0;
        }
        this.callbacks?.onPlayerEventNotification(
          `💬 ${msg.playerName || rp?.name || 'Jogador'}: ${text}`,
          '#fde047'
        );
        break;
      }

      case 'room_closed': {
        const reason =
          msg.reason ||
          'O anfitrião fechou o mundo. O código de convite foi encerrado.';
        this.isOnline = false;
        this.role = 'OFFLINE';
        this.remotePlayers.clear();
        this.connectedPeers = [];
        this.statusMessage = reason;
        this.notifySessionChanged();
        this.callbacks?.onRoomClosedByHost(reason);
        break;
      }
    }
  }

  private handleSocketClose(): void {
    const wasGuest = this.role === 'GUEST' && this.isOnline && !this.destroyed;
    this.isOnline = false;
    this.remotePlayers.clear();
    this.connectedPeers = [];
    if (!this.destroyed) {
      this.statusMessage = 'Sessão online desconectada.';
      this.notifySessionChanged();
      if (wasGuest) {
        this.callbacks?.onRoomClosedByHost(
          'A conexão com o mundo do anfitrião foi encerrada.'
        );
      }
    }
  }

  private syncPeersList(rawPeers: any[]): void {
    const nextPeers: OnlinePeerSummary[] = [];
    const activeRemoteIds = new Set<string>();

    for (const p of rawPeers) {
      if (!p || !p.peerId) continue;
      nextPeers.push({
        peerId: p.peerId,
        name: p.name || 'Viajante',
        isHost: Boolean(p.isHost),
        level: p.state?.level || 1,
      });

      if (p.peerId !== this.peerId) {
        activeRemoteIds.add(p.peerId);
        if (p.state) {
          this.upsertRemotePlayer(
            p.peerId,
            p.name || 'Viajante',
            Boolean(p.isHost),
            p.state
          );
        }
      }
    }

    for (const existingId of Array.from(this.remotePlayers.keys())) {
      if (!activeRemoteIds.has(existingId)) {
        this.remotePlayers.delete(existingId);
      }
    }

    this.connectedPeers = nextPeers;
    this.callbacks?.onRemotePlayersChanged();
  }

  private upsertRemotePlayer(
    peerId: string,
    name: string,
    isHost: boolean,
    s: any
  ): void {
    const existing = this.remotePlayers.get(peerId);
    const heldItemId = s.heldItemId || null;
    const defaultAppearance = {
      skinColor: '#fdba74',
      hairColor: '#451a03',
      hairStyle: 'adventurer' as const,
      eyeColor: '#0f172a',
      shirtColor: '#2563eb',
      pantsColor: '#334155',
    };

    if (!existing) {
      this.remotePlayers.set(peerId, {
        peerId,
        name,
        isHost,
        x: typeof s.x === 'number' ? s.x : 16,
        y: typeof s.y === 'number' ? s.y : 16,
        targetX: typeof s.x === 'number' ? s.x : 16,
        targetY: typeof s.y === 'number' ? s.y : 16,
        vx: s.vx || 0,
        vy: s.vy || 0,
        direction: s.direction || 'down',
        hp: s.hp ?? 100,
        maxHp: s.maxHp ?? 100,
        level: s.level ?? 1,
        isMoving: Boolean(s.isMoving),
        animFrame: s.animFrame || 0,
        animTimer: 0,
        swingTimer: s.swingTimer || 0,
        swingDuration: s.swingDuration || 0.25,
        hitFlashTimer: s.hitFlashTimer || 0,
        heldItemId,
        equippedArmorId: s.equippedArmorId || null,
        equippedBySlot: s.equippedBySlot || {
          head: null,
          body: s.equippedArmorId || null,
          legs: null,
          feet: null,
        },
        appearance: s.appearance || defaultAppearance,
      });
    } else {
      existing.name = name;
      existing.isHost = isHost;
      if (typeof s.x === 'number' && typeof s.y === 'number') {
        const dist = Math.hypot(s.x - existing.x, s.y - existing.y);
        if (dist > 96) {
          existing.x = s.x;
          existing.y = s.y;
        }
        existing.targetX = s.x;
        existing.targetY = s.y;
      }
      existing.vx = s.vx || 0;
      existing.vy = s.vy || 0;
      existing.direction = s.direction || existing.direction;
      if (typeof s.hp === 'number' && s.hp < existing.hp) {
        existing.hitFlashTimer = 0.2;
      }
      existing.hp = s.hp ?? existing.hp;
      existing.maxHp = s.maxHp ?? existing.maxHp;
      existing.level = s.level ?? existing.level;
      existing.isMoving = Boolean(s.isMoving);
      if (s.swingTimer && s.swingTimer > 0 && existing.swingTimer <= 0.02) {
        existing.swingDuration = s.swingDuration || 0.25;
        existing.swingTimer = existing.swingDuration;
      }
      existing.heldItemId = heldItemId;
      existing.equippedArmorId = s.equippedArmorId || null;
      if (s.equippedBySlot) existing.equippedBySlot = s.equippedBySlot;
      if (s.appearance) existing.appearance = s.appearance;
    }

    // Also keep peer level updated in connectedPeers summary
    const peerSummary = this.connectedPeers.find((p) => p.peerId === peerId);
    if (peerSummary && typeof s.level === 'number') {
      peerSummary.level = s.level;
    }
  }

  public serializeLocalPlayerState(player: PlayerState): any {
    const heldSlot = player.inventory[player.selectedHotbarIndex];
    return {
      x: Math.round(player.x * 10) / 10,
      y: Math.round(player.y * 10) / 10,
      vx: Math.round(player.vx),
      vy: Math.round(player.vy),
      direction: player.direction,
      hp: Math.round(player.hp),
      maxHp: Math.round(player.maxHp),
      level: player.level,
      isMoving: player.isMoving,
      animFrame: player.animFrame,
      swingTimer: Number(player.swingTimer.toFixed(2)),
      swingDuration: Number(player.swingDuration.toFixed(2)),
      hitFlashTimer: Number(player.hitFlashTimer.toFixed(2)),
      heldItemId: heldSlot ? heldSlot.itemId : null,
      equippedArmorId: player.equippedArmorId,
      equippedBySlot: player.equippedBySlot,
      appearance: player.appearance,
    };
  }

  public sendPlayerState(player: PlayerState): void {
    if (!this.isOnline) return;
    this.sendRaw({
      type: 'player_state',
      name: this.localPlayerName,
      state: this.serializeLocalPlayerState(player),
    });
  }

  public sendChunkSync(chunkKey: string, chunkData: ChunkData): void {
    if (!this.isOnline) return;
    this.sendRaw({
      type: 'chunk_sync',
      chunkKey,
      chunkData,
    });
  }

  public sendSpawnDrop(drop: DroppedItem): void {
    if (!this.isOnline) return;
    this.sendRaw({
      type: 'spawn_drop',
      drop,
    });
  }

  public sendPickupDrop(dropId: string): void {
    if (!this.isOnline) return;
    this.sendRaw({
      type: 'pickup_drop',
      dropId,
    });
  }

  public sendCreaturesSync(creatures: CreatureEntity[]): void {
    if (!this.isOnline || this.role !== 'HOST') return;
    if (this.remotePlayers.size === 0) return;
    this.sendRaw({
      type: 'creatures_sync',
      creatures,
    });
  }

  public sendCreatureHit(
    creatureId: string,
    damage: number,
    sourceX: number,
    sourceY: number,
    knockbackMult = 1.0
  ): void {
    if (!this.isOnline) return;
    this.sendRaw({
      type: 'creature_hit',
      creatureId,
      damage,
      sourceX,
      sourceY,
      knockbackMult,
    });
  }

  public sendTimeSync(timeOfDay: number, dayCount: number): void {
    if (!this.isOnline) return;
    this.sendRaw({
      type: 'time_sync',
      timeOfDay,
      dayCount,
    });
  }

  public sendChatMessage(text: string): void {
    const clean = text.trim().slice(0, 80);
    if (!clean || !this.isOnline) return;
    this.sendRaw({
      type: 'player_chat',
      text: clean,
    });
  }

  public updateLocalPlayerName(newName: string, player: PlayerState): void {
    const clean = newName.trim().slice(0, 22) || 'Aventureiro';
    this.localPlayerName = clean;
    if (this.role === 'HOST') {
      this.hostName = clean;
    }
    const selfPeer = this.connectedPeers.find((p) => p.peerId === this.peerId);
    if (selfPeer) {
      selfPeer.name = clean;
    }
    if (this.isOnline) {
      this.sendPlayerState(player);
    }
    this.notifySessionChanged();
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
    };
  }

  private notifySessionChanged(): void {
    if (this.callbacks) {
      this.callbacks.onSessionChanged(this.getSessionInfo());
    }
  }

  private sendRaw(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        // ignore send errors
      }
    }
  }

  public disconnect(notify = true): void {
    this.destroyed = true;
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'leave_room' }));
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.isOnline = false;
    this.role = 'OFFLINE';
    this.inviteCode = null;
    this.remotePlayers.clear();
    this.connectedPeers = [];
    this.statusMessage = 'Modo Offline (Single-player)';
    if (notify) {
      this.notifySessionChanged();
    }
  }
}
