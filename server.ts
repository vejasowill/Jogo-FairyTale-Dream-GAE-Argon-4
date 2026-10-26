import express from 'express';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'server_data');
const WORLDS_FILE = path.join(DATA_DIR, 'worlds.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredWorldsMap {
  [worldId: string]: any;
}

function readStoredWorlds(): StoredWorldsMap {
  try {
    if (!fs.existsSync(WORLDS_FILE)) return {};
    const raw = fs.readFileSync(WORLDS_FILE, 'utf-8');
    return JSON.parse(raw) || {};
  } catch (err) {
    console.error('Error reading worlds file:', err);
    return {};
  }
}

function writeStoredWorlds(worlds: StoredWorldsMap): void {
  try {
    fs.writeFileSync(WORLDS_FILE, JSON.stringify(worlds), 'utf-8');
  } catch (err) {
    console.error('Error writing worlds file:', err);
  }
}

// ============================================================================
// REAL-TIME ONLINE MULTIPLAYER ROOMS (INVITE CODE SYSTEM - WS + HTTP HYBRID)
// ============================================================================

interface ConnectedPeer {
  peerId: string;
  name: string;
  isHost: boolean;
  ws: WebSocket | null;
  lastState: any;
  lastSeenAt: number;
  pendingEvents: any[];
}

interface OnlineWorldRoom {
  inviteCode: string;
  worldId: string;
  worldName: string;
  hostPeerId: string;
  hostName: string;
  gameVersion: string;
  worldRevision: number;
  nextEventId: number;
  worldSnapshot: any;
  peers: Map<string, ConnectedPeer>;
  createdAt: number;
  updatedAt: number;
}

const activeRooms = new Map<string, OnlineWorldRoom>();

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
    }
    if (!activeRooms.has(code)) {
      return code;
    }
  }
  return 'WB' + Math.floor(1000 + Math.random() * 9000);
}

function getRoomPeersSummary(room: OnlineWorldRoom) {
  return Array.from(room.peers.values()).map((p) => ({
    peerId: p.peerId,
    name: p.name,
    isHost: p.isHost,
    level: p.lastState?.level ?? 1,
    x: p.lastState?.x ?? 0,
    y: p.lastState?.y ?? 0,
  }));
}

function getRoomRemoteStates(room: OnlineWorldRoom, excludePeerId?: string) {
  const states: any[] = [];
  for (const peer of room.peers.values()) {
    if (peer.peerId === excludePeerId) continue;
    if (peer.lastState) {
      states.push({
        ...peer.lastState,
        peerId: peer.peerId,
        name: peer.name,
        isHost: peer.isHost,
      });
    }
  }
  return states;
}

function pushEventToPeer(
  room: OnlineWorldRoom,
  peer: ConnectedPeer,
  payload: any
) {
  const isHighFreqEphemeral = payload.type === 'remote_player_state';
  const enriched = isHighFreqEphemeral
    ? payload
    : {
        ...payload,
        _eventId: payload._eventId || ++room.nextEventId,
      };

  if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
    try {
      peer.ws.send(JSON.stringify(enriched));
    } catch {
      // ignore ws send error; HTTP sync queue below guarantees delivery
    }
  }

  // Always queue state/world events for HTTP sync (deduplicated by type/chunkKey)
  // so even if WebSocket is stalled/half-open, HTTP sync delivers 100% of world interactions!
  if (!isHighFreqEphemeral) {
    if (enriched.type === 'chunk_sync' && enriched.chunkKey) {
      const idx = peer.pendingEvents.findIndex(
        (e) => e.type === 'chunk_sync' && e.chunkKey === enriched.chunkKey
      );
      if (idx !== -1) {
        peer.pendingEvents[idx] = enriched;
        return;
      }
    } else if (
      enriched.type === 'creatures_sync' ||
      enriched.type === 'drops_sync' ||
      enriched.type === 'death_bags_sync' ||
      enriched.type === 'time_sync' ||
      enriched.type === 'world_snapshot_sync'
    ) {
      const idx = peer.pendingEvents.findIndex((e) => e.type === enriched.type);
      if (idx !== -1) {
        peer.pendingEvents[idx] = enriched;
        return;
      }
    }

    peer.pendingEvents.push(enriched);
    if (peer.pendingEvents.length > 160) {
      peer.pendingEvents.shift();
    }
  }
}

function broadcastToRoom(
  room: OnlineWorldRoom,
  payload: any,
  excludePeerId?: string
) {
  const isHighFreqEphemeral = payload.type === 'remote_player_state';
  const sharedPayload = isHighFreqEphemeral
    ? payload
    : {
        ...payload,
        _eventId: payload._eventId || ++room.nextEventId,
      };
  for (const peer of room.peers.values()) {
    if (excludePeerId && peer.peerId === excludePeerId) continue;
    pushEventToPeer(room, peer, sharedPayload);
  }
}

function applyRoomEvent(
  room: OnlineWorldRoom,
  senderPeer: ConnectedPeer,
  msg: any
) {
  const peerId = senderPeer.peerId;
  room.updatedAt = Date.now();
  senderPeer.lastSeenAt = Date.now();

  if (msg.type === 'player_state') {
    const state = msg.state || {};
    senderPeer.lastState = {
      ...state,
      peerId,
      name: senderPeer.name,
      isHost: senderPeer.isHost,
    };
    broadcastToRoom(
      room,
      {
        type: 'remote_player_state',
        state: senderPeer.lastState,
      },
      peerId
    );
    return;
  }

  if (msg.type === 'update_player_name') {
    const newName = String(msg.name || senderPeer.name)
      .trim()
      .slice(0, 22);
    if (newName) {
      senderPeer.name = newName;
      if (senderPeer.isHost) {
        room.hostName = newName;
      }
      if (senderPeer.lastState) {
        senderPeer.lastState.name = newName;
      }
      broadcastToRoom(room, {
        type: 'peers_updated',
        peers: getRoomPeersSummary(room),
      });
    }
    return;
  }

  if (msg.type === 'player_chat') {
    const text = String(msg.text || '')
      .trim()
      .slice(0, 80);
    if (!text) return;
    broadcastToRoom(
      room,
      {
        type: 'player_chat',
        peerId,
        name: senderPeer.name,
        text,
      },
      peerId
    );
    return;
  }

  if (msg.type === 'chunk_sync') {
    const { chunkKey, chunkData } = msg;
    if (chunkKey && chunkData) {
      if (!room.worldSnapshot.chunks) {
        room.worldSnapshot.chunks = {};
      }
      room.worldSnapshot.chunks[chunkKey] = chunkData;
      room.worldRevision = (room.worldRevision || 1) + 1;
      broadcastToRoom(
        room,
        {
          type: 'chunk_sync',
          peerId,
          chunkKey,
          chunkData,
          worldRevision: room.worldRevision,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'spawn_drop') {
    const drop = msg.drop;
    if (drop && drop.id) {
      if (!Array.isArray(room.worldSnapshot.droppedItems)) {
        room.worldSnapshot.droppedItems = [];
      }
      const exists = room.worldSnapshot.droppedItems.some(
        (d: any) => d.id === drop.id
      );
      if (!exists) {
        room.worldSnapshot.droppedItems.push(drop);
      }
      room.worldRevision = (room.worldRevision || 1) + 1;
      broadcastToRoom(
        room,
        {
          type: 'spawn_drop',
          drop,
          worldRevision: room.worldRevision,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'pickup_drop') {
    const dropId = msg.dropId;
    if (dropId && Array.isArray(room.worldSnapshot.droppedItems)) {
      room.worldSnapshot.droppedItems =
        room.worldSnapshot.droppedItems.filter((d: any) => d.id !== dropId);
      room.worldRevision = (room.worldRevision || 1) + 1;
      broadcastToRoom(
        room,
        {
          type: 'pickup_drop',
          dropId,
          peerId,
          worldRevision: room.worldRevision,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'drops_sync' && senderPeer.isHost) {
    if (Array.isArray(msg.droppedItems)) {
      room.worldSnapshot.droppedItems = msg.droppedItems;
      broadcastToRoom(
        room,
        {
          type: 'drops_sync',
          droppedItems: msg.droppedItems,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'death_bags_sync') {
    if (Array.isArray(msg.deathBags)) {
      room.worldSnapshot.deathBags = msg.deathBags;
      room.worldRevision = (room.worldRevision || 1) + 1;
      broadcastToRoom(
        room,
        {
          type: 'death_bags_sync',
          deathBags: msg.deathBags,
          worldRevision: room.worldRevision,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'world_interact_request') {
    const hostPeer = room.peers.get(room.hostPeerId);
    if (hostPeer && hostPeer.peerId !== peerId) {
      pushEventToPeer(room, hostPeer, {
        type: 'world_interact_request',
        peerId,
        request: msg.request,
      });
    }
    return;
  }

  if (msg.type === 'world_interact_resolved' && senderPeer.isHost) {
    room.worldRevision = (room.worldRevision || 1) + 1;
    broadcastToRoom(
      room,
      {
        type: 'world_interact_resolved',
        result: msg.result,
        worldRevision: room.worldRevision,
      },
      peerId
    );
    return;
  }

  if (msg.type === 'creatures_sync' && senderPeer.isHost) {
    if (Array.isArray(msg.creatures)) {
      room.worldSnapshot.creatures = msg.creatures;
      broadcastToRoom(
        room,
        {
          type: 'creatures_sync',
          creatures: msg.creatures,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'creature_hit') {
    broadcastToRoom(
      room,
      {
        type: 'creature_hit',
        peerId,
        creatureId: msg.creatureId,
        damage: msg.damage,
        sourceX: msg.sourceX,
        sourceY: msg.sourceY,
        knockbackMult: msg.knockbackMult,
      },
      peerId
    );
    return;
  }

  if (msg.type === 'guest_mount_event') {
    broadcastToRoom(
      room,
      {
        type: 'guest_mount_event',
        peerId,
        event: msg.event,
      },
      peerId
    );
    return;
  }

  if (msg.type === 'time_sync' && senderPeer.isHost) {
    if (room.worldSnapshot.metadata) {
      room.worldSnapshot.metadata.timeOfDay = msg.timeOfDay;
      room.worldSnapshot.metadata.dayCount = msg.dayCount;
    }
    broadcastToRoom(
      room,
      {
        type: 'time_sync',
        timeOfDay: msg.timeOfDay,
        dayCount: msg.dayCount,
      },
      peerId
    );
    return;
  }

  if (msg.type === 'host_snapshot' && senderPeer.isHost && msg.worldSnapshot) {
    room.worldSnapshot = msg.worldSnapshot;
    room.worldRevision = (room.worldRevision || 1) + 1;
    if (msg.targetPeerId) {
      const targetPeer = room.peers.get(msg.targetPeerId);
      if (targetPeer) {
        pushEventToPeer(room, targetPeer, {
          type: 'world_snapshot_sync',
          worldSnapshot: room.worldSnapshot,
          worldRevision: room.worldRevision,
        });
      }
    } else {
      broadcastToRoom(
        room,
        {
          type: 'world_snapshot_sync',
          worldSnapshot: room.worldSnapshot,
          worldRevision: room.worldRevision,
        },
        peerId
      );
    }
    return;
  }

  if (msg.type === 'request_world_resync') {
    const hostPeer = room.peers.get(room.hostPeerId);
    if (hostPeer && hostPeer.peerId !== peerId) {
      pushEventToPeer(room, hostPeer, {
        type: 'request_host_snapshot',
        targetPeerId: peerId,
      });
    }
    pushEventToPeer(room, senderPeer, {
      type: 'world_snapshot_sync',
      worldSnapshot: room.worldSnapshot,
      worldRevision: room.worldRevision,
    });
    return;
  }
}

function removePeerFromRoom(inviteCode: string, peerId: string) {
  const room = activeRooms.get(inviteCode);
  if (!room) return;

  const peer = room.peers.get(peerId);
  if (!peer) return;

  room.peers.delete(peerId);

  if (peer.isHost) {
    broadcastToRoom(room, {
      type: 'room_closed',
      reason: `O anfitrião (${room.hostName}) fechou o mundo ou ficou offline.`,
    });
    for (const guest of room.peers.values()) {
      if (guest.ws) {
        try {
          guest.ws.close();
        } catch {
          // ignore
        }
      }
    }
    activeRooms.delete(inviteCode);
  } else {
    const leavingMountedId = peer.lastState?.mountedEntityId;
    if (Array.isArray(room.worldSnapshot?.creatures)) {
      room.worldSnapshot.creatures = room.worldSnapshot.creatures.filter(
        (c: any) =>
          c.riderPlayerId !== peerId &&
          (!leavingMountedId || c.id !== leavingMountedId)
      );
      for (const c of room.worldSnapshot.creatures) {
        if (c.passengerPlayerId === peerId) {
          c.passengerPlayerId = null;
        }
      }
    }
    broadcastToRoom(room, {
      type: 'peer_left',
      peerId,
      name: peer.name,
      peers: getRoomPeersSummary(room),
    });
  }
}

// Periodic cleanup of stale peers/rooms (e.g. closed browser tab without explicit leave)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of activeRooms.entries()) {
    for (const [peerId, peer] of room.peers.entries()) {
      // If a peer hasn't sent any WS or HTTP packet for > 45 seconds, close any half-open WS
      if (now - peer.lastSeenAt > 45000 && peer.ws) {
        try {
          peer.ws.close();
        } catch {
          // ignore
        }
        peer.ws = null;
      }
      const wsOpen = peer.ws && peer.ws.readyState === WebSocket.OPEN;
      if (!wsOpen && now - peer.lastSeenAt > 55000) {
        removePeerFromRoom(code, peerId);
      }
    }
    if (activeRooms.has(code) && room.peers.size === 0) {
      activeRooms.delete(code);
    }
  }
}, 8000);

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      activeOnlineRooms: activeRooms.size,
    });
  });

  // ==========================================================================
  // MULTIPLAYER HTTP ENDPOINTS (Fast activation + HTTP Realtime Sync Fallback)
  // ==========================================================================

  // 1. Ping / Diagnostics endpoint
  app.get('/api/mp/ping', (_req, res) => {
    res.json({
      ok: true,
      serverTime: Date.now(),
      activeRoomsCount: activeRooms.size,
    });
  });

  // 2. Host / Open an Online World Room and generate Invite Code
  app.post('/api/mp/host', (req, res) => {
    try {
      const {
        peerId,
        playerName,
        preferredCode,
        gameVersion,
        worldSnapshot,
        playerState,
      } = req.body || {};

      if (!worldSnapshot || !worldSnapshot.metadata) {
        res.status(400).json({
          ok: false,
          error: 'Dados do mundo ausentes ou inválidos para abrir sessão online.',
        });
        return;
      }

      const hostPeerId =
        String(peerId || '').trim() ||
        'host_' + Math.random().toString(36).slice(2, 10);
      const hostName = String(playerName || 'Anfitrião')
        .trim()
        .slice(0, 22);
      const roomVersion = String(
        gameVersion || worldSnapshot.metadata?.gameVersion || '0.4.2-beta'
      ).trim();

      const cleanPreferred = String(preferredCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);

      // Check if this host already owns the preferred room
      let inviteCode = '';
      if (cleanPreferred.length >= 4) {
        const existing = activeRooms.get(cleanPreferred);
        if (!existing || existing.hostPeerId === hostPeerId) {
          inviteCode = cleanPreferred;
        }
      }
      if (!inviteCode) {
        inviteCode = generateInviteCode();
      }

      const existingRoom = activeRooms.get(inviteCode);
      const peersMap = existingRoom
        ? existingRoom.peers
        : new Map<string, ConnectedPeer>();

      const existingHostPeer = peersMap.get(hostPeerId);
      const hostPeer: ConnectedPeer = {
        peerId: hostPeerId,
        name: hostName,
        isHost: true,
        ws: existingHostPeer?.ws || null,
        lastSeenAt: Date.now(),
        pendingEvents: existingHostPeer?.pendingEvents || [],
        lastState: {
          ...(playerState || {}),
          peerId: hostPeerId,
          name: hostName,
          isHost: true,
        },
      };

      peersMap.set(hostPeerId, hostPeer);

      const room: OnlineWorldRoom = {
        inviteCode,
        worldId: worldSnapshot.metadata.id || 'world',
        worldName: worldSnapshot.metadata.name || 'Mundo Online',
        hostPeerId,
        hostName,
        gameVersion: roomVersion,
        worldRevision: (existingRoom?.worldRevision || 0) + 1,
        nextEventId: existingRoom?.nextEventId || 1,
        worldSnapshot,
        peers: peersMap,
        createdAt: existingRoom?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      activeRooms.set(inviteCode, room);

      res.json({
        ok: true,
        inviteCode,
        peerId: hostPeerId,
        worldName: room.worldName,
        hostName: room.hostName,
        gameVersion: room.gameVersion,
        worldRevision: room.worldRevision,
        peers: getRoomPeersSummary(room),
        serverTime: Date.now(),
      });
    } catch (err: any) {
      console.error('Error in POST /api/mp/host:', err);
      res.status(500).json({
        ok: false,
        error: err?.message || 'Erro interno no servidor ao criar sala online.',
      });
    }
  });

  // 3. Join an Online World Room by Invite Code
  app.post('/api/mp/join', (req, res) => {
    try {
      const {
        inviteCode: rawCode,
        peerId: rawPeerId,
        playerName,
        gameVersion,
        playerState,
      } = req.body || {};

      const code = String(rawCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

      const room = activeRooms.get(code);
      if (!room) {
        res.status(404).json({
          ok: false,
          error: `Nenhum mundo online ativo encontrado com o código "${code}". Verifique se o anfitrião está dentro do mundo com o Modo Online ativado.`,
        });
        return;
      }

      const guestVersion = String(gameVersion || '').trim();
      if (guestVersion !== room.gameVersion) {
        const guestVerLabel = guestVersion || 'anterior/desatualizada';
        res.status(409).json({
          ok: false,
          versionMismatch: true,
          hostVersion: room.gameVersion,
          guestVersion: guestVerLabel,
          error: `Versão incompatível! O mundo do anfitrião está na versão v${room.gameVersion}, mas o seu jogo está na versão v${guestVerLabel}. Todos os jogadores precisam estar na mesma versão.`,
        });
        return;
      }

      const guestPeerId =
        String(rawPeerId || '').trim() ||
        'guest_' + Math.random().toString(36).slice(2, 10);
      const guestName = String(playerName || 'Viajante')
        .trim()
        .slice(0, 22);

      const existingPeer = room.peers.get(guestPeerId);
      const guestPeer: ConnectedPeer = {
        peerId: guestPeerId,
        name: guestName,
        isHost: false,
        ws: existingPeer?.ws || null,
        lastSeenAt: Date.now(),
        pendingEvents: existingPeer?.pendingEvents || [],
        lastState: {
          ...(playerState || {
            x: (room.worldSnapshot?.player?.x ?? 16) + 24,
            y: room.worldSnapshot?.player?.y ?? 16,
            facing: 'down',
            hp: 100,
            maxHp: 100,
            level: 1,
            isMoving: false,
            swingTimer: 0,
            heldItemId: null,
            appearance: {
              skinColor: '#f5cfa0',
              hairColor: '#3b2416',
              shirtColor: '#059669',
              pantsColor: '#1e293b',
            },
          }),
          peerId: guestPeerId,
          name: guestName,
          isHost: false,
        },
      };

      room.peers.set(guestPeerId, guestPeer);
      room.updatedAt = Date.now();

      // Notify all peers in room that guest joined
      broadcastToRoom(
        room,
        {
          type: 'peer_joined',
          peer: {
            peerId: guestPeerId,
            name: guestName,
            isHost: false,
          },
          state: guestPeer.lastState,
          peers: getRoomPeersSummary(room),
        },
        guestPeerId
      );

      res.json({
        ok: true,
        inviteCode: room.inviteCode,
        peerId: guestPeerId,
        worldName: room.worldName,
        hostName: room.hostName,
        hostPeerId: room.hostPeerId,
        gameVersion: room.gameVersion,
        worldSnapshot: room.worldSnapshot,
        peers: getRoomPeersSummary(room),
        remoteStates: getRoomRemoteStates(room, guestPeerId),
      });
    } catch (err: any) {
      console.error('Error in POST /api/mp/join:', err);
      res.status(500).json({
        ok: false,
        error: err?.message || 'Erro interno ao entrar na sala online.',
      });
    }
  });

  // 4. Real-time HTTP Sync (Heartbeat + State + Queued Events + Auto-Recovery)
  app.post('/api/mp/sync', (req, res) => {
    try {
      const {
        inviteCode: rawCode,
        peerId,
        playerName,
        playerState,
        events,
        requestFullSnapshot,
      } = req.body || {};
      const code = String(rawCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

      const room = activeRooms.get(code);
      if (!room) {
        res.status(404).json({
          ok: false,
          roomClosed: true,
          error: 'A sessão online deste mundo foi encerrada.',
        });
        return;
      }

      const cleanPeerId = String(peerId || '').trim();
      if (!cleanPeerId) {
        res.status(400).json({ ok: false, error: 'peerId ausente.' });
        return;
      }

      let peer = room.peers.get(cleanPeerId);
      let autoRejoined = false;

      // Self-healing: if the room is still open, and a peer reconnected after a temporary network drop,
      // automatically restore them to `room.peers` instead of kicking them out!
      if (!peer) {
        const isHostPeer = cleanPeerId === room.hostPeerId;
        const cleanName = String(
          playerName ||
            playerState?.name ||
            (isHostPeer ? room.hostName : 'Viajante')
        )
          .trim()
          .slice(0, 22);
        peer = {
          peerId: cleanPeerId,
          name: cleanName,
          isHost: isHostPeer,
          ws: null,
          lastSeenAt: Date.now(),
          pendingEvents: [],
          lastState: {
            ...(playerState || {}),
            peerId: cleanPeerId,
            name: cleanName,
            isHost: isHostPeer,
          },
        };
        room.peers.set(cleanPeerId, peer);
        autoRejoined = true;

        broadcastToRoom(
          room,
          {
            type: 'peers_updated',
            peers: getRoomPeersSummary(room),
          },
          cleanPeerId
        );
      }

      peer.lastSeenAt = Date.now();
      room.updatedAt = Date.now();

      if (playerState) {
        applyRoomEvent(room, peer, {
          type: 'player_state',
          state: playerState,
        });
      }

      if (Array.isArray(events)) {
        for (const ev of events) {
          if (ev && typeof ev.type === 'string') {
            applyRoomEvent(room, peer, ev);
          }
        }
      }

      const drainedEvents = peer.pendingEvents.splice(
        0,
        peer.pendingEvents.length
      );

      res.json({
        ok: true,
        inviteCode: room.inviteCode,
        worldRevision: room.worldRevision || 1,
        peers: getRoomPeersSummary(room),
        remoteStates: getRoomRemoteStates(room, peer.peerId),
        events: drainedEvents,
        creatures: !peer.isHost ? room.worldSnapshot?.creatures : undefined,
        droppedItems: !peer.isHost
          ? room.worldSnapshot?.droppedItems
          : undefined,
        worldSnapshot:
          autoRejoined || requestFullSnapshot ? room.worldSnapshot : undefined,
        timeOfDay: room.worldSnapshot?.metadata?.timeOfDay,
        dayCount: room.worldSnapshot?.metadata?.dayCount,
        serverTime: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Erro ao sincronizar estado da sala.',
      });
    }
  });

  // 5. Leave / Close Online Room
  app.post('/api/mp/leave', (req, res) => {
    try {
      const { inviteCode: rawCode, peerId } = req.body || {};
      const code = String(rawCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (code && peerId) {
        removePeerFromRoom(code, String(peerId));
      }
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  // Lookup active online room by invite code
  app.get('/api/online-rooms/:code', (req, res) => {
    const code = (req.params.code || '').toUpperCase().trim();
    const room = activeRooms.get(code);
    if (!room) {
      res.status(404).json({
        ok: false,
        error: 'Nenhum mundo online encontrado com este código de convite.',
      });
      return;
    }
    res.json({
      ok: true,
      inviteCode: room.inviteCode,
      worldName: room.worldName,
      hostName: room.hostName,
      playerCount: room.peers.size,
    });
  });

  // List all saved worlds metadata
  app.get('/api/worlds', (_req, res) => {
    const worlds = readStoredWorlds();
    const metadataList = Object.values(worlds)
      .map((w: any) => w.metadata)
      .filter(Boolean)
      .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ worlds: metadataList });
  });

  // Load a specific world save
  app.get('/api/worlds/:id', (req, res) => {
    const worlds = readStoredWorlds();
    const world = worlds[req.params.id];
    if (!world) {
      res.status(404).json({ error: 'World not found' });
      return;
    }
    res.json({ world });
  });

  // Save or update a world
  app.post('/api/worlds', (req, res) => {
    const worldData = req.body;
    if (!worldData || !worldData.metadata || !worldData.metadata.id) {
      res.status(400).json({ error: 'Invalid world save payload' });
      return;
    }
    const worlds = readStoredWorlds();
    worlds[worldData.metadata.id] = worldData;
    writeStoredWorlds(worlds);
    res.json({
      status: 'saved',
      id: worldData.metadata.id,
      updatedAt: worldData.metadata.updatedAt,
    });
  });

  // Delete a world
  app.delete('/api/worlds/:id', (req, res) => {
    const worlds = readStoredWorlds();
    if (worlds[req.params.id]) {
      delete worlds[req.params.id];
      writeStoredWorlds(worlds);
    }
    res.json({ status: 'deleted', id: req.params.id });
  });

  // ==========================================================================
  // WEBSOCKET SERVER (/ws-game) FOR LOW-LATENCY REALTIME STREAMING
  // ==========================================================================
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = request.url || '';
    if (reqUrl.startsWith('/ws-game')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoomCode: string | null = null;
    let currentPeerId: string | null = null;

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        if (!msg || typeof msg.type !== 'string') return;

        // 0. ATTACH SOCKET TO EXISTING HTTP-CREATED ROOM PEER
        if (msg.type === 'attach_socket') {
          const code = String(msg.inviteCode || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          const room = activeRooms.get(code);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'join_error',
                error: 'Sala online não encontrada para anexar WebSocket.',
              })
            );
            return;
          }
          const peer = room.peers.get(String(msg.peerId || ''));
          if (!peer) {
            ws.send(
              JSON.stringify({
                type: 'join_error',
                error: 'Jogador não registrado nesta sala.',
              })
            );
            return;
          }
          peer.ws = ws;
          peer.lastSeenAt = Date.now();
          currentRoomCode = code;
          currentPeerId = peer.peerId;

          ws.send(
            JSON.stringify({
              type: 'socket_attached',
              inviteCode: code,
              peerId: peer.peerId,
              peers: getRoomPeersSummary(room),
            })
          );
          return;
        }

        // 1. HOST CREATES / OPENS AN ONLINE ROOM directly via WS
        if (msg.type === 'host_room') {
          const peerId =
            msg.peerId || 'host_' + Math.random().toString(36).slice(2, 10);
          const hostName = (msg.playerName || 'Anfitrião')
            .trim()
            .slice(0, 22);
          const worldSnapshot = msg.worldSnapshot;
          if (!worldSnapshot || !worldSnapshot.metadata) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Dados do mundo inválidos para hospedar.',
              })
            );
            return;
          }

          const requestedCode = (msg.preferredCode || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          const inviteCode =
            requestedCode.length === 6 && !activeRooms.has(requestedCode)
              ? requestedCode
              : generateInviteCode();

          currentRoomCode = inviteCode;
          currentPeerId = peerId;

          const room: OnlineWorldRoom = {
            inviteCode,
            worldId: worldSnapshot.metadata.id || 'world',
            worldName: worldSnapshot.metadata.name || 'Mundo Online',
            hostPeerId: peerId,
            hostName,
            gameVersion: String(
              msg.gameVersion ||
                worldSnapshot.metadata?.gameVersion ||
                '0.4.2-beta'
            ).trim(),
            worldRevision: 1,
            nextEventId: 1,
            worldSnapshot,
            peers: new Map(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          room.peers.set(peerId, {
            peerId,
            name: hostName,
            isHost: true,
            ws,
            lastSeenAt: Date.now(),
            pendingEvents: [],
            lastState: {
              ...(msg.playerState || {}),
              peerId,
              name: hostName,
              isHost: true,
            },
          });

          activeRooms.set(inviteCode, room);

          ws.send(
            JSON.stringify({
              type: 'room_hosted',
              inviteCode,
              peerId,
              worldName: room.worldName,
              gameVersion: room.gameVersion,
              peers: getRoomPeersSummary(room),
            })
          );
          return;
        }

        // 2. GUEST JOINS AN EXISTING ROOM BY INVITE CODE directly via WS
        if (msg.type === 'join_room') {
          const code = (msg.inviteCode || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
          const room = activeRooms.get(code);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'join_error',
                error:
                  'Código de convite inválido ou o anfitrião não está com o mundo aberto no momento.',
              })
            );
            return;
          }

          const guestVersion = String(msg.gameVersion || '').trim();
          if (guestVersion !== room.gameVersion) {
            const guestVerLabel = guestVersion || 'anterior/desatualizada';
            ws.send(
              JSON.stringify({
                type: 'join_error',
                error: `Versão incompatível! O mundo do anfitrião está na versão v${room.gameVersion}, mas o seu jogo está na versão v${guestVerLabel}.`,
              })
            );
            return;
          }

          const peerId =
            msg.peerId || 'guest_' + Math.random().toString(36).slice(2, 10);
          const guestName = (msg.playerName || 'Viajante')
            .trim()
            .slice(0, 22);

          currentRoomCode = code;
          currentPeerId = peerId;

          const initialGuestState = {
            x: (room.worldSnapshot?.player?.x ?? 16) + 24,
            y: room.worldSnapshot?.player?.y ?? 16,
            facing: 'down',
            hp: 100,
            maxHp: 100,
            level: 1,
            isMoving: false,
            swingTimer: 0,
            heldItemId: null,
            appearance: msg.appearance || {
              skinColor: '#f5cfa0',
              hairColor: '#3b2416',
              shirtColor: '#059669',
              pantsColor: '#1e293b',
            },
            peerId,
            name: guestName,
            isHost: false,
          };

          room.peers.set(peerId, {
            peerId,
            name: guestName,
            isHost: false,
            ws,
            lastSeenAt: Date.now(),
            pendingEvents: [],
            lastState: initialGuestState,
          });
          room.updatedAt = Date.now();

          ws.send(
            JSON.stringify({
              type: 'room_joined',
              inviteCode: room.inviteCode,
              peerId,
              worldName: room.worldName,
              hostName: room.hostName,
              hostPeerId: room.hostPeerId,
              worldSnapshot: room.worldSnapshot,
              peers: getRoomPeersSummary(room),
              remoteStates: getRoomRemoteStates(room, peerId),
            })
          );

          broadcastToRoom(
            room,
            {
              type: 'peer_joined',
              peer: {
                peerId,
                name: guestName,
                isHost: false,
              },
              state: initialGuestState,
              peers: getRoomPeersSummary(room),
            },
            peerId
          );
          return;
        }

        // All subsequent messages require an active room membership
        if (!currentRoomCode || !currentPeerId) return;
        const room = activeRooms.get(currentRoomCode);
        if (!room) return;
        const senderPeer = room.peers.get(currentPeerId);
        if (!senderPeer) return;

        if (msg.type === 'ws_ping') {
          senderPeer.lastSeenAt = Date.now();
          ws.send(
            JSON.stringify({
              type: 'ws_pong',
              t: msg.t || Date.now(),
              worldRevision: room.worldRevision || 1,
              peersCount: room.peers.size,
            })
          );
          return;
        }

        if (msg.type === 'leave_room') {
          removePeerFromRoom(currentRoomCode, currentPeerId);
          currentRoomCode = null;
          currentPeerId = null;
          return;
        }

        applyRoomEvent(room, senderPeer, msg);
      } catch (err) {
        console.error('WS message error:', err);
      }
    });

    ws.on('close', () => {
      if (currentRoomCode && currentPeerId) {
        const room = activeRooms.get(currentRoomCode);
        const peer = room?.peers.get(currentPeerId);
        if (peer && peer.ws === ws) {
          // Detach WS reference; if client is still active via HTTP sync, room remains alive!
          peer.ws = null;
        }
      }
      currentRoomCode = null;
      currentPeerId = null;
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
