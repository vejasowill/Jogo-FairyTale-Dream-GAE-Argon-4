import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const WORLDS_FILE = path.join(DATA_DIR, 'worlds.json');
const WORLDS_TMP_FILE = path.join(DATA_DIR, 'worlds.json.tmp');
const WORLDS_BAK_FILE = path.join(DATA_DIR, 'worlds.json.bak');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function computeChecksum(payload: string): string {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readWorldsSafe(): Record<string, any> {
  ensureDataDir();
  const tryRead = (filePath: string) => {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.worlds) {
        return parsed.worlds;
      }
      return null;
    } catch {
      return null;
    }
  };

  return tryRead(WORLDS_FILE) ?? tryRead(WORLDS_BAK_FILE) ?? {};
}

function writeWorldsAtomic(worlds: Record<string, any>): void {
  ensureDataDir();
  const envelope = {
    updatedAt: Date.now(),
    worlds,
  };
  const serialized = JSON.stringify(envelope);
  // Write to temporary file first
  fs.writeFileSync(WORLDS_TMP_FILE, serialized, 'utf-8');
  // Backup existing valid file before replacing
  if (fs.existsSync(WORLDS_FILE)) {
    try {
      fs.copyFileSync(WORLDS_FILE, WORLDS_BAK_FILE);
    } catch {
      // ignore backup copy issues
    }
  }
  // Atomic rename
  fs.renameSync(WORLDS_TMP_FILE, WORLDS_FILE);
}

// ============================================================================
// REAL-TIME ONLINE MULTIPLAYER ROOMS (INVITE CODE SYSTEM)
// ============================================================================

interface ConnectedPeer {
  peerId: string;
  name: string;
  isHost: boolean;
  ws: WebSocket;
  lastState: any;
}

interface OnlineWorldRoom {
  inviteCode: string;
  worldId: string;
  worldName: string;
  hostPeerId: string;
  hostName: string;
  createdAt: number;
  worldSnapshot: any;
  peers: Map<string, ConnectedPeer>;
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
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sendJson(ws: WebSocket, data: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // ignore send error
    }
  }
}

function broadcastToRoom(
  room: OnlineWorldRoom,
  data: any,
  excludePeerId?: string
): void {
  if (room.peers.size === 0) return;
  let serialized: string | null = null;
  for (const [peerId, peer] of room.peers.entries()) {
    if (excludePeerId && peerId === excludePeerId) continue;
    if (peer.ws.readyState === WebSocket.OPEN) {
      if (serialized === null) {
        serialized = JSON.stringify(data);
      }
      try {
        peer.ws.send(serialized);
      } catch {
        // ignore send error
      }
    }
  }
}

function getRoomPeerList(room: OnlineWorldRoom) {
  return Array.from(room.peers.values()).map((p) => ({
    peerId: p.peerId,
    name: p.name,
    isHost: p.isHost,
    state: p.lastState,
  }));
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // CORS and Fullscreen Permissions-Policy headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Permissions-Policy', 'fullscreen=*');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      storage: 'atomic-json-v1',
      activeOnlineRooms: activeRooms.size,
    });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '')
      .trim()
      .toUpperCase();
    const room = activeRooms.get(code);
    if (!room) {
      res.status(404).json({
        ok: false,
        error:
          'Código de convite não encontrado ou o mundo não está aberto e online no momento.',
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

  app.get('/api/worlds', (_req, res) => {
    const worlds = readWorldsSafe();
    res.json({ worlds: Object.values(worlds) });
  });

  app.post('/api/worlds', (req, res) => {
    try {
      const { world, checksum } = req.body;
      if (!world || !world.id || !world.name) {
        res.status(400).json({ error: 'Dados do mundo inválidos.' });
        return;
      }
      if (checksum) {
        const verify = computeChecksum(JSON.stringify(world));
        if (verify !== checksum) {
          res.status(422).json({ error: 'Falha na verificação de integridade (checksum).' });
          return;
        }
      }
      const worlds = readWorldsSafe();
      worlds[world.id] = {
        ...world,
        serverSavedAt: Date.now(),
      };
      writeWorldsAtomic(worlds);
      res.json({ ok: true, id: world.id, savedAt: Date.now() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao salvar mundo no servidor.' });
    }
  });

  app.delete('/api/worlds/:id', (req, res) => {
    try {
      const { id } = req.params;
      const worlds = readWorldsSafe();
      if (worlds[id]) {
        delete worlds[id];
        writeWorldsAtomic(worlds);
      }
      res.json({ ok: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao excluir mundo.' });
    }
  });

  const httpServer = http.createServer(app);

  // Attach WebSocketServer on /ws-game so it never collides with Vite HMR
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/ws-game')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoomCode: string | null = null;
    let currentPeerId: string | null = null;

    ws.on('message', (rawData) => {
      let msg: any;
      try {
        msg = JSON.parse(String(rawData));
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      // 1. HOST CREATES / OPENS AN ONLINE SESSION FOR THEIR ACTIVE WORLD
      if (msg.type === 'host_room') {
        const peerId = String(msg.peerId || `host_${Date.now()}`);
        const hostName = String(msg.playerName || 'Anfitrião').slice(0, 24);
        const worldSnapshot = msg.worldSnapshot;
        if (!worldSnapshot || !worldSnapshot.metadata) {
          sendJson(ws, {
            type: 'error',
            message: 'Dados do mundo inválidos para abrir sala online.',
          });
          return;
        }

        // If this connection was already in a room, clean it up first
        if (currentRoomCode && activeRooms.has(currentRoomCode)) {
          const prevRoom = activeRooms.get(currentRoomCode)!;
          if (prevRoom.hostPeerId === currentPeerId) {
            broadcastToRoom(
              prevRoom,
              {
                type: 'room_closed',
                reason: 'O anfitrião fechou a sessão anterior.',
              },
              currentPeerId || undefined
            );
            activeRooms.delete(currentRoomCode);
          }
        }

        // Reuse preferred code if still free, or generate a new 6-char code
        const preferred = msg.preferredCode
          ? String(msg.preferredCode).trim().toUpperCase()
          : '';
        const inviteCode =
          preferred.length === 6 && !activeRooms.has(preferred)
            ? preferred
            : generateInviteCode();

        const room: OnlineWorldRoom = {
          inviteCode,
          worldId: worldSnapshot.metadata.id || 'world',
          worldName: worldSnapshot.metadata.name || 'Mundo Online',
          hostPeerId: peerId,
          hostName,
          createdAt: Date.now(),
          worldSnapshot,
          peers: new Map(),
        };

        room.peers.set(peerId, {
          peerId,
          name: hostName,
          isHost: true,
          ws,
          lastState: msg.playerState || null,
        });

        activeRooms.set(inviteCode, room);
        currentRoomCode = inviteCode;
        currentPeerId = peerId;

        sendJson(ws, {
          type: 'room_hosted',
          inviteCode,
          worldName: room.worldName,
          peers: getRoomPeerList(room),
        });
        return;
      }

      // 2. GUEST JOINS AN OPEN WORLD USING THE INVITE CODE
      if (msg.type === 'join_room') {
        const code = String(msg.inviteCode || '')
          .trim()
          .toUpperCase();
        const room = activeRooms.get(code);
        if (!room) {
          sendJson(ws, {
            type: 'join_error',
            message:
              'Código de convite inválido ou o mundo não está aberto e online no momento.',
          });
          return;
        }

        const hostPeer = room.peers.get(room.hostPeerId);
        if (!hostPeer || hostPeer.ws.readyState !== WebSocket.OPEN) {
          activeRooms.delete(code);
          sendJson(ws, {
            type: 'join_error',
            message: 'O anfitrião deste mundo não está mais online.',
          });
          return;
        }

        const peerId = String(
          msg.peerId || `guest_${Date.now()}_${Math.floor(Math.random() * 999)}`
        );
        const guestName = String(msg.playerName || 'Viajante').slice(0, 24);

        currentRoomCode = code;
        currentPeerId = peerId;

        room.peers.set(peerId, {
          peerId,
          name: guestName,
          isHost: false,
          ws,
          lastState: msg.playerState || null,
        });

        // Send initial world snapshot & peer list immediately to the joining guest
        sendJson(ws, {
          type: 'room_joined',
          inviteCode: room.inviteCode,
          worldName: room.worldName,
          hostName: room.hostName,
          hostPeerId: room.hostPeerId,
          worldSnapshot: room.worldSnapshot,
          peers: getRoomPeerList(room),
        });

        // Notify the Host and other peers that a new player joined, and ask Host for a fresh world sync
        broadcastToRoom(
          room,
          {
            type: 'peer_joined',
            peerId,
            name: guestName,
            isHost: false,
            state: msg.playerState || null,
            peers: getRoomPeerList(room),
          },
          peerId
        );

        sendJson(hostPeer.ws, {
          type: 'request_host_snapshot',
          targetPeerId: peerId,
        });
        return;
      }

      //All subsequent messages require an active room
      if (!currentRoomCode || !currentPeerId) return;
      const room = activeRooms.get(currentRoomCode);
      if (!room) return;
      const sender = room.peers.get(currentPeerId);
      if (!sender) return;

      // 3. HOST UPDATES FULL SNAPSHOT (for newly joined guest or periodic checkpoint)
      if (msg.type === 'host_snapshot' && sender.isHost) {
        if (msg.worldSnapshot) {
          room.worldSnapshot = msg.worldSnapshot;
        }
        if (msg.targetPeerId) {
          const targetPeer = room.peers.get(String(msg.targetPeerId));
          if (targetPeer) {
            sendJson(targetPeer.ws, {
              type: 'world_snapshot_sync',
              worldSnapshot: room.worldSnapshot,
            });
          }
        } else {
          broadcastToRoom(
            room,
            {
              type: 'world_snapshot_sync',
              worldSnapshot: room.worldSnapshot,
            },
            currentPeerId
          );
        }
        return;
      }

      // 4. REAL-TIME PLAYER STATE (Position, Direction, Animation, HP, Appearance, Equipment, Held Item)
      if (msg.type === 'player_state') {
        if (msg.name) {
          sender.name = String(msg.name).slice(0, 24);
        }
        sender.lastState = msg.state;
        broadcastToRoom(
          room,
          {
            type: 'player_state',
            peerId: currentPeerId,
            name: sender.name,
            isHost: sender.isHost,
            state: msg.state,
          },
          currentPeerId
        );
        return;
      }

      // 5. CHUNK / STRUCTURE / NODE MUTATION SYNC
      if (msg.type === 'chunk_sync') {
        const { chunkKey, chunkData } = msg;
        if (
          chunkKey &&
          chunkData &&
          room.worldSnapshot &&
          room.worldSnapshot.chunks
        ) {
          room.worldSnapshot.chunks[chunkKey] = chunkData;
        }
        broadcastToRoom(
          room,
          {
            type: 'chunk_sync',
            peerId: currentPeerId,
            chunkKey,
            chunkData,
          },
          currentPeerId
        );
        return;
      }

      // 6. DROPPED ITEMS SYNC
      if (
        msg.type === 'drops_sync' ||
        msg.type === 'spawn_drop' ||
        msg.type === 'pickup_drop'
      ) {
        if (
          msg.type === 'drops_sync' &&
          Array.isArray(msg.droppedItems) &&
          room.worldSnapshot
        ) {
          room.worldSnapshot.droppedItems = msg.droppedItems;
        } else if (
          msg.type === 'spawn_drop' &&
          msg.drop &&
          room.worldSnapshot &&
          Array.isArray(room.worldSnapshot.droppedItems)
        ) {
          room.worldSnapshot.droppedItems.push(msg.drop);
        } else if (
          msg.type === 'pickup_drop' &&
          msg.dropId &&
          room.worldSnapshot &&
          Array.isArray(room.worldSnapshot.droppedItems)
        ) {
          room.worldSnapshot.droppedItems =
            room.worldSnapshot.droppedItems.filter(
              (d: any) => d.id !== msg.dropId
            );
        }
        broadcastToRoom(
          room,
          {
            ...msg,
            peerId: currentPeerId,
          },
          currentPeerId
        );
        return;
      }

      // 7. CREATURES SYNC (Host -> Guests) & CREATURE HIT / ACTION (Guest -> Host & Peers)
      if (
        msg.type === 'creatures_sync' ||
        msg.type === 'creature_hit' ||
        msg.type === 'time_sync' ||
        msg.type === 'visual_fx' ||
        msg.type === 'player_chat'
      ) {
        if (
          msg.type === 'creatures_sync' &&
          sender.isHost &&
          Array.isArray(msg.creatures) &&
          room.worldSnapshot
        ) {
          room.worldSnapshot.creatures = msg.creatures;
        }
        if (
          msg.type === 'time_sync' &&
          room.worldSnapshot &&
          room.worldSnapshot.metadata
        ) {
          if (typeof msg.timeOfDay === 'number') {
            room.worldSnapshot.metadata.timeOfDay = msg.timeOfDay;
          }
          if (typeof msg.dayCount === 'number') {
            room.worldSnapshot.metadata.dayCount = msg.dayCount;
          }
        }
        broadcastToRoom(
          room,
          {
            ...msg,
            peerId: currentPeerId,
            playerName: sender.name,
          },
          currentPeerId
        );
        return;
      }

      // 8. EXPLICIT LEAVE / CLOSE ROOM
      if (msg.type === 'leave_room') {
        handleDisconnect();
      }
    });

    const handleDisconnect = () => {
      if (!currentRoomCode || !currentPeerId) return;
      const room = activeRooms.get(currentRoomCode);
      const leavingPeerId = currentPeerId;
      const leavingRoomCode = currentRoomCode;
      currentRoomCode = null;
      currentPeerId = null;

      if (!room) return;
      const leavingPeer = room.peers.get(leavingPeerId);
      room.peers.delete(leavingPeerId);

      // If the Host closed the world or disconnected, the invite code is no longer valid and the session closes!
      if (room.hostPeerId === leavingPeerId) {
        broadcastToRoom(room, {
          type: 'room_closed',
          reason:
            'O anfitrião fechou o mundo ou desconectou. A sessão online foi encerrada.',
        });
        activeRooms.delete(leavingRoomCode);
      } else {
        broadcastToRoom(room, {
          type: 'peer_left',
          peerId: leavingPeerId,
          name: leavingPeer?.name || 'Viajante',
          peers: getRoomPeerList(room),
        });
      }
    };

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Wildborn server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

