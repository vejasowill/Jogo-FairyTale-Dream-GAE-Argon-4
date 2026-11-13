import 'dotenv/config';
import express from 'express';
import { cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// FIREBASE ADMIN SDK INITIALIZATION (SERVER-ONLY — NEVER EXPOSED TO CLIENT)
// ============================================================================
let firebaseAdminInitialized = false;
let firebaseAdminInitError: string | null = null;

function normalizePrivateKey(rawKey?: string): string {
  if (!rawKey) return '';
  let cleaned = rawKey.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.replace(/\\n/g, '\n');
}

function initFirebaseAdminIfConfigured() {
  if (firebaseAdminInitialized || getApps().length > 0) {
    firebaseAdminInitialized = true;
    return;
  }
  const projectId = (
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'fairytale-dream'
  ).trim();
  const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  try {
    if (projectId && clientEmail && privateKey) {
      initializeAdminApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
    } else {
      initializeAdminApp({
        projectId,
      });
    }
    firebaseAdminInitialized = true;
    firebaseAdminInitError = null;
  } catch (err: any) {
    firebaseAdminInitialized = false;
    firebaseAdminInitError =
      err?.message || 'Falha ao inicializar Firebase Admin SDK.';
    console.warn('Firebase Admin SDK initialization warning:', firebaseAdminInitError);
  }
}

initFirebaseAdminIfConfigured();

const DATA_DIR = path.join(__dirname, 'server_data');
const WORLDS_FILE = path.join(DATA_DIR, 'worlds.json');
const CLOUD_OBJECTS_DIR = path.join(DATA_DIR, 'cloud_objects');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CLOUD_OBJECTS_DIR)) {
  fs.mkdirSync(CLOUD_OBJECTS_DIR, { recursive: true });
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
  playerPublicId?: string;
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
    playerPublicId: p.playerPublicId || p.lastState?.playerPublicId || undefined,
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

function mergeServerChunkData(prevChunk: any, incomingChunk: any): any {
  if (!prevChunk || !Array.isArray(prevChunk.structures) || !Array.isArray(incomingChunk.structures)) {
    return incomingChunk;
  }
  const now = Date.now();
  const removedIds = new Set<string>(
    Array.isArray(incomingChunk.removedObjectIds) ? incomingChunk.removedObjectIds : []
  );

  for (const incSt of incomingChunk.structures) {
    if (!incSt) continue;
    const prevSt = prevChunk.structures.find(
      (s: any) =>
        s &&
        (s.id === incSt.id ||
          (s.type === incSt.type && s.tileX === incSt.tileX && s.tileY === incSt.tileY))
    );
    if (!prevSt) continue;

    // 1. Preserve newer Chest storage
    if (incSt.type === 'CHEST') {
      const prevRev = prevSt.storageRevision || 0;
      const incRev = incSt.storageRevision || 0;
      if (
        prevRev > incRev ||
        (prevRev === incRev && (prevSt.storageUpdatedAt || 0) > (incSt.storageUpdatedAt || 0))
      ) {
        incSt.storageSlots = prevSt.storageSlots;
        incSt.storageRevision = prevSt.storageRevision;
        incSt.storageUpdatedAt = prevSt.storageUpdatedAt;
        incSt.customName = prevSt.customName;
        incSt.lootItems = prevSt.lootItems;
      }
    }

    // 2. Preserve newer Thermal / Weaving Station state (Campfire, Furnace, Weaving Table)
    if (
      incSt.type === 'CAMPFIRE' ||
      incSt.type === 'FURNACE' ||
      incSt.type === 'WEAVING_TABLE'
    ) {
      const prevRev = prevSt.thermalRevision || 0;
      const incRev = incSt.thermalRevision || 0;
      if (
        prevRev > incRev ||
        (prevRev === incRev && (prevSt.thermalUpdatedAt || 0) > (incSt.thermalUpdatedAt || 0))
      ) {
        incSt.fuelItemId = prevSt.fuelItemId;
        incSt.fuelCount = prevSt.fuelCount;
        incSt.fuelBurnRemaining = prevSt.fuelBurnRemaining;
        incSt.fuelBurnMax = prevSt.fuelBurnMax;
        incSt.cookingRecipeId = prevSt.cookingRecipeId;
        incSt.cookingMaterialOptionId = prevSt.cookingMaterialOptionId;
        incSt.cookingInputCount = prevSt.cookingInputCount;
        incSt.cookingProgress = prevSt.cookingProgress;
        incSt.cookingDuration = prevSt.cookingDuration;
        incSt.outputItemId = prevSt.outputItemId;
        incSt.outputCount = prevSt.outputCount;
        incSt.weavingTargetItemId = prevSt.weavingTargetItemId;
        incSt.weavingDyeItemId = prevSt.weavingDyeItemId;
        incSt.thermalRevision = prevSt.thermalRevision;
        incSt.thermalUpdatedAt = prevSt.thermalUpdatedAt;
      }
    }
  }

  // 3. Preserve recently placed structures (< 10s old) from concurrent players in the same chunk
  for (const prevSt of prevChunk.structures) {
    if (!prevSt || !prevSt.id || removedIds.has(prevSt.id)) continue;
    const placedAge = now - (prevSt.placedAt || 0);
    if (placedAge >= 0 && placedAge < 10000) {
      const existsInInc = incomingChunk.structures.some(
        (s: any) =>
          s &&
          (s.id === prevSt.id ||
            (s.tileX === prevSt.tileX &&
              s.tileY === prevSt.tileY &&
              s.type === prevSt.type))
      );
      if (!existsInInc) {
        incomingChunk.structures.push(prevSt);
      }
    }
  }

  return incomingChunk;
}

function pushEventToPeer(
  room: OnlineWorldRoom,
  peer: ConnectedPeer,
  payload: any
) {
  const isHighFreqEphemeral =
    payload.type === 'remote_player_state' ||
    payload.type === 'creatures_sync' ||
    payload.type === 'drops_sync' ||
    payload.type === 'time_sync';
  const enriched =
    payload.type === 'remote_player_state'
      ? payload
      : {
          ...payload,
          _eventId: payload._eventId || ++room.nextEventId,
        };

  let wsSent = false;
  if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
    try {
      peer.ws.send(JSON.stringify(enriched));
      wsSent = true;
    } catch {
      wsSent = false;
    }
  }

  // If WebSocket is open and delivered an ephemeral broadcast, do NOT duplicate it into the HTTP queue
  if (wsSent && isHighFreqEphemeral) {
    return;
  }

  // Queue critical world events for HTTP sync (deduplicated by type/chunkKey)
  if (payload.type !== 'remote_player_state') {
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
    if (peer.pendingEvents.length > 220) {
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
      const mergedChunk = mergeServerChunkData(
        room.worldSnapshot.chunks[chunkKey],
        chunkData
      );
      room.worldSnapshot.chunks[chunkKey] = mergedChunk;
      room.worldRevision = (room.worldRevision || 1) + 1;
      broadcastToRoom(
        room,
        {
          type: 'chunk_sync',
          peerId,
          chunkKey,
          chunkData: mergedChunk,
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

  if (msg.type === 'player_hit') {
    broadcastToRoom(
      room,
      {
        type: 'player_hit',
        peerId,
        targetPeerId: msg.targetPeerId,
        damage: msg.damage,
        sourceX: msg.sourceX,
        sourceY: msg.sourceY,
        knockbackMult: msg.knockbackMult,
        attackerName: msg.attackerName || senderPeer.name,
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

  app.use(express.json({ limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      activeOnlineRooms: activeRooms.size,
      firebaseAdminReady: firebaseAdminInitialized,
    });
  });

  // Helper to resolve a valid Firestore Database ID (handling "default" -> applet database or "(default)")
  function resolveFirestoreDatabaseId(
    envDbId: string | undefined,
    appletDbId: string | undefined
  ): string {
    const raw = (envDbId || '').trim();
    if (!raw || raw.toLowerCase() === 'default' || raw === '(default)') {
      return (
        appletDbId ||
        'ai-studio-remix2pixelsurvi-82a1c441-67e6-40f5-b2fb-00c7ebfba58d'
      );
    }
    return raw;
  }

  // Firebase Environment & Admin SDK Security Diagnostics (Never exposes secret values!)
  app.get('/api/firebase/diagnostics', async (_req, res) => {
    initFirebaseAdminIfConfigured();
    let appletConfig: Record<string, string> = {};
    try {
      const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
      if (fs.existsSync(cfgPath)) {
        appletConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) || {};
      }
    } catch {
      appletConfig = {};
    }

    const clientVars = {
      VITE_FIREBASE_API_KEY: Boolean(
        process.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey
      ),
      VITE_FIREBASE_AUTH_DOMAIN: Boolean(
        process.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain
      ),
      VITE_FIREBASE_PROJECT_ID: Boolean(
        process.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId
      ),
      VITE_FIREBASE_STORAGE_BUCKET: Boolean(
        process.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket
      ),
      VITE_FIREBASE_MESSAGING_SENDER_ID: Boolean(
        process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
          appletConfig.messagingSenderId
      ),
      VITE_FIREBASE_APP_ID: Boolean(
        process.env.VITE_FIREBASE_APP_ID || appletConfig.appId
      ),
      VITE_FIREBASE_FIRESTORE_DATABASE_ID: Boolean(
        process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
          appletConfig.firestoreDatabaseId
      ),
    };

    const rawPrivKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
    const adminVars = {
      FIREBASE_ADMIN_PROJECT_ID: Boolean(process.env.FIREBASE_ADMIN_PROJECT_ID),
      FIREBASE_ADMIN_CLIENT_EMAIL: Boolean(
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL
      ),
      FIREBASE_ADMIN_PRIVATE_KEY: Boolean(rawPrivKey),
      privateKeyPemFormatValid:
        rawPrivKey.includes('BEGIN PRIVATE KEY') &&
        rawPrivKey.includes('END PRIVATE KEY'),
    };

    // Security check: confirm no admin variable is prefixed with VITE_
    const leakedAdminKeys = Object.keys(process.env).filter(
      (k) =>
        k.startsWith('VITE_') &&
        (k.includes('PRIVATE_KEY') ||
          k.includes('CLIENT_EMAIL') ||
          k.includes('ADMIN'))
    );

    const effectiveDatabaseId = resolveFirestoreDatabaseId(
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
      appletConfig.firestoreDatabaseId
    );

    let adminFirestoreConnected = false;
    let adminAuthConnected = false;
    let firebaseStorageBucketProvisioned = false;
    let firebaseStorageNote: string | null = null;
    let liveDiagnosticsError: string | null = null;

    const configuredBucketName = (
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      appletConfig.storageBucket ||
      'fairytale-dream.firebasestorage.app'
    ).trim();

    if (firebaseAdminInitialized) {
      try {
        // 1. Test Admin Auth service reachability
        await getAdminAuth().listUsers(1);
        adminAuthConnected = true;
      } catch (err: any) {
        liveDiagnosticsError = `Admin Auth: ${err?.message || String(err)}`;
      }

      try {
        // 2. Test Admin Firestore service reachability on effectiveDatabaseId
        const adminDb = getAdminFirestore(undefined as any, effectiveDatabaseId);
        await adminDb.collection('users').limit(1).get();
        adminFirestoreConnected = true;
      } catch (err: any) {
        liveDiagnosticsError =
          (liveDiagnosticsError ? liveDiagnosticsError + ' | ' : '') +
          `Admin Firestore: ${err?.message || String(err)}`;
      }

      try {
        // 3. Check if Firebase Storage default bucket is provisioned in the project
        const bucket = getAdminStorage().bucket(configuredBucketName);
        const [exists] = await bucket.exists();
        firebaseStorageBucketProvisioned = Boolean(exists);
        if (!exists) {
          firebaseStorageNote =
            'O bucket Firebase Storage (' +
            configuredBucketName +
            ') ainda não foi inicializado no Firebase Console (requer ativação em Build -> Storage / plano Blaze). O motor híbrido segmentado (Firestore Chunks + Object Storage) está ativo automaticamente sem perda de capacidade.';
        }
      } catch (err: any) {
        firebaseStorageBucketProvisioned = false;
        firebaseStorageNote =
          err?.message ||
          'Bucket Firebase Storage aguardando inicialização no Firebase Console.';
      }
    }

    res.json({
      ok: true,
      projectId:
        process.env.VITE_FIREBASE_PROJECT_ID ||
        appletConfig.projectId ||
        'fairytale-dream',
      rawEnvDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || null,
      firestoreDatabaseId: effectiveDatabaseId,
      storageBucket: configuredBucketName,
      firebaseStorageBucketProvisioned,
      firebaseStorageMode: firebaseStorageBucketProvisioned
        ? 'FIREBASE_STORAGE_NATIVE'
        : 'HYBRID_SEGMENTED_CLOUD_STORAGE',
      firebaseStorageNote,
      clientVars,
      adminVars,
      firebaseAdminInitialized,
      firebaseAdminStatus: firebaseAdminInitialized
        ? 'ACTIVE'
        : 'STANDBY_AWAITING_HOST_ENV',
      firebaseAdminNote: firebaseAdminInitError,
      adminSdk: {
        initialized: firebaseAdminInitialized,
        authConnected: adminAuthConnected,
        firestoreConnected: adminFirestoreConnected,
        storageBucketProvisioned: firebaseStorageBucketProvisioned,
        error: liveDiagnosticsError,
      },
      security: {
        adminCredentialsIsolatedToServer: leakedAdminKeys.length === 0,
      },
      securityAudit: {
        adminSecretsIsolatedFromFrontend: leakedAdminKeys.length === 0,
        leakedViteKeysCount: leakedAdminKeys.length,
      },
    });
  });

  // Server-side Firebase ID Token & Entitlements verification using Firebase Admin SDK
  app.post('/api/firebase/verify-session', async (req, res) => {
    initFirebaseAdminIfConfigured();
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

    if (!token) {
      res.status(401).json({
        ok: false,
        error: 'Token Bearer ausente no cabeçalho Authorization.',
      });
      return;
    }

    if (!firebaseAdminInitialized) {
      res.json({
        ok: true,
        verifiedBy: 'CLIENT_SDK_FIRESTORE_RULES',
        adminSdkActive: false,
        message:
          'Sessão ativa via Firebase Web SDK + Firestore Security Rules (Admin SDK entrará em ação automaticamente na hospedagem com FIREBASE_ADMIN_*).',
      });
      return;
    }

    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      let appletDbId =
        'ai-studio-remix2pixelsurvi-82a1c441-67e6-40f5-b2fb-00c7ebfba58d';
      try {
        const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
        if (fs.existsSync(cfgPath)) {
          const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) || {};
          if (parsed.firestoreDatabaseId) {
            appletDbId = parsed.firestoreDatabaseId;
          }
        }
      } catch {
        // ignore
      }
      const dbId = resolveFirestoreDatabaseId(
        process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
        appletDbId
      );
      const adminDb = getAdminFirestore(undefined as any, dbId);
      const entSnap = await adminDb
        .collection('users')
        .doc(decoded.uid)
        .collection('entitlements')
        .where('ownerId', '==', decoded.uid)
        .get();

      res.json({
        ok: true,
        verifiedBy: 'FIREBASE_ADMIN_SDK',
        adminSdkActive: true,
        uid: decoded.uid,
        emailVerified: Boolean(decoded.email_verified),
        entitlementsCount: entSnap.size,
      });
    } catch (err: any) {
      res.status(401).json({
        ok: false,
        error: err?.message || 'Falha ao validar ID Token no Firebase Admin SDK.',
      });
    }
  });

  // ==========================================================================
  // AUTHENTICATED CLOUD OBJECT STORAGE ENDPOINTS (Per-UID Isolated Chunk/Snapshot Storage)
  // ==========================================================================
  async function verifyStorageRequestUid(req: express.Request): Promise<{
    ok: boolean;
    uid?: string;
    error?: string;
  }> {
    initFirebaseAdminIfConfigured();
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

    if (!token) {
      return { ok: false, error: 'Missing Authorization Bearer token.' };
    }

    if (firebaseAdminInitialized) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        if (!decoded.uid) {
          return { ok: false, error: 'Invalid Firebase UID.' };
        }
        return { ok: true, uid: decoded.uid };
      } catch {
        // Fall through to official Firebase Auth REST lookup below
      }
    }

    // Fallback verification via official Firebase Auth IdentityToolkit REST API
    try {
      let apiKey = (process.env.VITE_FIREBASE_API_KEY || '').trim();
      if (!apiKey) {
        const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
        if (fs.existsSync(cfgPath)) {
          const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) || {};
          apiKey = String(parsed.apiKey || '').trim();
        }
      }
      if (apiKey) {
        const lookupRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: token }),
          }
        );
        if (lookupRes.ok) {
          const data: any = await lookupRes.json();
          const userObj = Array.isArray(data?.users) ? data.users[0] : null;
          if (userObj && userObj.localId) {
            return { ok: true, uid: String(userObj.localId) };
          }
        }
      }
    } catch {
      // ignore
    }

    return { ok: false, error: 'Invalid or expired Firebase ID token.' };
  }

  function resolveSafeCloudObjectFilePath(
    verifiedUid: string,
    rawObjectPath: string
  ): string | null {
    const normalized = String(rawObjectPath || '')
      .trim()
      .replace(/^\/+/, '');
    const expectedPrefix = `users/${verifiedUid}/`;
    if (!normalized.startsWith(expectedPrefix)) {
      return null;
    }
    const segments = normalized.split('/');
    for (const seg of segments) {
      if (!seg || seg === '.' || seg === '..' || !/^[a-zA-Z0-9_\-.]+$/.test(seg)) {
        return null;
      }
    }
    const resolved = path.resolve(CLOUD_OBJECTS_DIR, ...segments);
    if (!resolved.startsWith(path.resolve(CLOUD_OBJECTS_DIR) + path.sep)) {
      return null;
    }
    return resolved;
  }

  app.put('/api/storage/object', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const objectPath = String(req.body?.objectPath || '');
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const expectedHash = String(req.body?.hash || '');

    const diskPath = resolveSafeCloudObjectFilePath(authResult.uid, objectPath);
    if (!diskPath) {
      res.status(403).json({
        ok: false,
        error: 'Access denied: objectPath must belong to the authenticated UID.',
      });
    } else {
      try {
        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
        fs.writeFileSync(diskPath, content, 'utf-8');
        res.json({
          ok: true,
          objectPath,
          sizeBytes: Buffer.byteLength(content, 'utf-8'),
          hash: expectedHash,
        });
      } catch (err: any) {
        res.status(500).json({
          ok: false,
          error: err?.message || 'Failed to store cloud object.',
        });
      }
    }
  });

  app.get('/api/storage/object', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const objectPath = String(req.query.objectPath || '');
    const diskPath = resolveSafeCloudObjectFilePath(authResult.uid, objectPath);
    if (!diskPath) {
      res.status(403).json({
        ok: false,
        error: 'Access denied: objectPath must belong to the authenticated UID.',
      });
      return;
    }

    if (!fs.existsSync(diskPath)) {
      res.status(404).json({ ok: false, error: 'Object not found.' });
      return;
    }

    try {
      const content = fs.readFileSync(diskPath, 'utf-8');
      res.json({
        ok: true,
        objectPath,
        content,
        sizeBytes: Buffer.byteLength(content, 'utf-8'),
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to read cloud object.',
      });
    }
  });

  app.delete('/api/storage/object', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const objectPath = String(req.query.objectPath || req.body?.objectPath || '');
    const diskPath = resolveSafeCloudObjectFilePath(authResult.uid, objectPath);
    if (!diskPath) {
      res.status(403).json({
        ok: false,
        error: 'Access denied: objectPath must belong to the authenticated UID.',
      });
      return;
    }

    try {
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
      res.json({ ok: true, objectPath });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to delete cloud object.',
      });
    }
  });

  // ==========================================================================
  // AUTHENTICATED CLOUD WORLD VAULT (/api/cloud-worlds)
  // High-speed authenticated server cloud storage per UID (used alongside Firestore
  // and as an instant zero-data-loss fallback when Firestore's 20k/day free write quota is full)
  // ==========================================================================
  app.get('/api/cloud-worlds/list', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const userVaultDir = path.resolve(
      CLOUD_OBJECTS_DIR,
      'users',
      authResult.uid,
      'worlds_vault'
    );
    if (!fs.existsSync(userVaultDir)) {
      res.json({ ok: true, worlds: [] });
      return;
    }
    try {
      const deletedSet = new Set<string>();
      const deletedFile = path.join(userVaultDir, 'deleted_worlds.json');
      if (fs.existsSync(deletedFile)) {
        try {
          const parsedDel = JSON.parse(fs.readFileSync(deletedFile, 'utf-8'));
          if (Array.isArray(parsedDel)) {
            for (const id of parsedDel) deletedSet.add(String(id));
          }
        } catch {
          // ignore
        }
      }
      const files = fs
        .readdirSync(userVaultDir)
        .filter((f) => f.endsWith('.meta.json'));
      const worlds: any[] = [];
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(userVaultDir, f), 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.worldId && !deletedSet.has(parsed.worldId)) {
            worlds.push(parsed);
          }
        } catch {
          // ignore
        }
      }
      res.json({ ok: true, worlds, deletedWorldIds: Array.from(deletedSet) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'List error' });
    }
  });

  app.post('/api/cloud-worlds/save', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const rawWorldId = String(req.body?.worldId || '').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const metadataDocFields = req.body?.metadataDocFields;
    const saveData = req.body?.saveData;
    if (!rawWorldId || !metadataDocFields || !saveData) {
      res.status(400).json({ ok: false, error: 'Missing worldId or saveData' });
      return;
    }
    const userVaultDir = path.resolve(
      CLOUD_OBJECTS_DIR,
      'users',
      authResult.uid,
      'worlds_vault'
    );
    try {
      fs.mkdirSync(userVaultDir, { recursive: true });
      const metaPath = path.join(userVaultDir, `${rawWorldId}.meta.json`);
      const dataPath = path.join(userVaultDir, `${rawWorldId}.data.json`);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          ...metadataDocFields,
          worldId: rawWorldId,
          ownerId: authResult.uid,
          updatedAtMs: Date.now(),
        }),
        'utf-8'
      );
      fs.writeFileSync(dataPath, JSON.stringify(saveData), 'utf-8');
      res.json({
        ok: true,
        worldId: rawWorldId,
        revisionId: metadataDocFields.activeRevisionId,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Save error' });
    }
  });

  app.get('/api/cloud-worlds/:worldId', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const rawWorldId = String(req.params.worldId || '').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const dataPath = path.resolve(
      CLOUD_OBJECTS_DIR,
      'users',
      authResult.uid,
      'worlds_vault',
      `${rawWorldId}.data.json`
    );
    if (!fs.existsSync(dataPath)) {
      res.status(404).json({ ok: false, error: 'World not found in vault' });
      return;
    }
    try {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      res.json({ ok: true, saveData: JSON.parse(raw) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Read error' });
    }
  });

  app.delete('/api/cloud-worlds/:worldId', async (req, res) => {
    const authResult = await verifyStorageRequestUid(req);
    if (!authResult.ok || !authResult.uid) {
      res.status(403).json({ ok: false, error: authResult.error || 'Forbidden' });
      return;
    }
    const rawWorldId = String(req.params.worldId || '').replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    const userVaultDir = path.resolve(
      CLOUD_OBJECTS_DIR,
      'users',
      authResult.uid,
      'worlds_vault'
    );
    try {
      fs.mkdirSync(userVaultDir, { recursive: true });
      const metaPath = path.join(userVaultDir, `${rawWorldId}.meta.json`);
      const dataPath = path.join(userVaultDir, `${rawWorldId}.data.json`);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);

      const deletedFile = path.join(userVaultDir, 'deleted_worlds.json');
      const deletedSet = new Set<string>();
      if (fs.existsSync(deletedFile)) {
        try {
          const arr = JSON.parse(fs.readFileSync(deletedFile, 'utf-8'));
          if (Array.isArray(arr)) {
            for (const item of arr) deletedSet.add(String(item));
          }
        } catch {
          // ignore
        }
      }
      deletedSet.add(rawWorldId);
      fs.writeFileSync(
        deletedFile,
        JSON.stringify(Array.from(deletedSet)),
        'utf-8'
      );

      // Also delete legacy worlds_data chunk folder if present
      const chunksDir = path.resolve(
        CLOUD_OBJECTS_DIR,
        'users',
        authResult.uid,
        'worlds_data',
        rawWorldId
      );
      if (fs.existsSync(chunksDir)) {
        fs.rmSync(chunksDir, { recursive: true, force: true });
      }

      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  // ==========================================================================
  // SOCIAL, PLAYER IDENTIFICATION, FRIENDS & JOIN REQUESTS (/api/social/*)
  // ==========================================================================
  const SOCIAL_PROFILES_FILE = path.join(DATA_DIR, 'social_profiles.json');

  interface ServerSocialProfile {
    uid?: string | null;
    playerPublicId: string;
    username: string;
    appearanceSlots?: any[];
    activeAppearanceSlotIndex?: number;
    accountAppearance?: any;
    friendsList: { playerPublicId: string; username: string; addedAt: number }[];
    deletedWorldIds: string[];
    presence?: {
      isOnline: boolean;
      inOpenWorld: boolean;
      worldId?: string | null;
      worldName?: string | null;
      inviteCode?: string | null;
      updatedAt: number;
    };
    updatedAt: number;
  }

  interface SocialStoreData {
    profilesByPublicId: Record<string, ServerSocialProfile>;
    publicIdByUid: Record<string, string>;
  }

  let socialStoreCache: SocialStoreData | null = null;

  function readSocialStore(): SocialStoreData {
    if (socialStoreCache) return socialStoreCache;
    try {
      if (fs.existsSync(SOCIAL_PROFILES_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(SOCIAL_PROFILES_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          socialStoreCache = {
            profilesByPublicId: parsed.profilesByPublicId || {},
            publicIdByUid: parsed.publicIdByUid || {},
          };
          return socialStoreCache;
        }
      }
    } catch {
      // ignore
    }
    socialStoreCache = { profilesByPublicId: {}, publicIdByUid: {} };
    return socialStoreCache;
  }

  function writeSocialStore(store: SocialStoreData): void {
    socialStoreCache = store;
    try {
      fs.writeFileSync(SOCIAL_PROFILES_FILE, JSON.stringify(store), 'utf-8');
    } catch {
      // ignore
    }
  }

  interface ServerJoinRequest {
    requestId: string;
    requesterPublicId: string;
    requesterName: string;
    targetPublicId: string;
    worldId: string;
    worldName: string;
    inviteCode: string;
    status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
    createdAt: number;
  }

  const activeJoinRequests = new Map<string, ServerJoinRequest>();

  function computeLiveStatusForPublicId(
    store: SocialStoreData,
    publicId: string,
    fallbackUsername = 'Aventureiro'
  ) {
    const cleanId = String(publicId || '').trim().toUpperCase();
    const prof = store.profilesByPublicId[cleanId];
    const now = Date.now();
    const username = prof?.username || fallbackUsername;
    const pres = prof?.presence;
    const isRecent = Boolean(pres && now - (pres.updatedAt || 0) < 45000);
    if (!isRecent || !pres?.isOnline) {
      return {
        playerPublicId: cleanId,
        username,
        isOnline: false,
        inOpenWorld: false,
        worldName: null,
        inviteCode: null,
        lastSeenAt: pres?.updatedAt || prof?.updatedAt || 0,
      };
    }

    const code = String(pres.inviteCode || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const activeRoom = code ? activeRooms.get(code) : undefined;
    const inOpenWorld = Boolean(pres.inOpenWorld && activeRoom);

    return {
      playerPublicId: cleanId,
      username,
      isOnline: true,
      inOpenWorld,
      worldName: inOpenWorld
        ? activeRoom?.worldName || pres.worldName || 'Mundo Online'
        : null,
      inviteCode: inOpenWorld ? code : null,
      lastSeenAt: pres.updatedAt,
    };
  }

  app.post('/api/social/sync-profile', (req, res) => {
    try {
      const store = readSocialStore();
      const {
        uid,
        playerPublicId: rawPubId,
        username: rawUsername,
        appearanceSlots,
        activeAppearanceSlotIndex,
        accountAppearance,
        friendsList,
        deletedWorldIds,
        presence,
      } = req.body || {};

      const cleanPubId = String(rawPubId || '')
        .trim()
        .toUpperCase();
      if (!cleanPubId) {
        res.status(400).json({ ok: false, error: 'Missing playerPublicId' });
        return;
      }

      if (uid && typeof uid === 'string') {
        store.publicIdByUid[uid] = cleanPubId;
      }

      const existing = store.profilesByPublicId[cleanPubId];
      const cleanUsername =
        String(rawUsername || existing?.username || 'Aventureiro')
          .trim()
          .slice(0, 22) || 'Aventureiro';

      // Merge friends lists
      const friendMap = new Map<
        string,
        { playerPublicId: string; username: string; addedAt: number }
      >();
      if (Array.isArray(existing?.friendsList)) {
        for (const f of existing.friendsList) {
          if (f && f.playerPublicId) {
            const fId = String(f.playerPublicId).trim().toUpperCase();
            const targetProf = store.profilesByPublicId[fId];
            friendMap.set(fId, {
              playerPublicId: fId,
              username: targetProf?.username || f.username || 'Aventureiro',
              addedAt: f.addedAt || Date.now(),
            });
          }
        }
      }
      if (Array.isArray(friendsList)) {
        for (const f of friendsList) {
          if (f && f.playerPublicId) {
            const fId = String(f.playerPublicId).trim().toUpperCase();
            if (fId === cleanPubId) continue;
            const targetProf = store.profilesByPublicId[fId];
            friendMap.set(fId, {
              playerPublicId: fId,
              username: targetProf?.username || f.username || 'Aventureiro',
              addedAt: f.addedAt || Date.now(),
            });
          }
        }
      }

      // Merge deletedWorldIds
      const delSet = new Set<string>(
        Array.isArray(existing?.deletedWorldIds) ? existing.deletedWorldIds : []
      );
      if (Array.isArray(deletedWorldIds)) {
        for (const wId of deletedWorldIds) {
          if (wId && typeof wId === 'string') delSet.add(wId);
        }
      }

      const mergedProfile: ServerSocialProfile = {
        uid: uid || existing?.uid || null,
        playerPublicId: cleanPubId,
        username: cleanUsername,
        appearanceSlots:
          Array.isArray(appearanceSlots) && appearanceSlots.length > 0
            ? appearanceSlots
            : existing?.appearanceSlots,
        activeAppearanceSlotIndex:
          typeof activeAppearanceSlotIndex === 'number'
            ? activeAppearanceSlotIndex
            : existing?.activeAppearanceSlotIndex ?? 0,
        accountAppearance: accountAppearance || existing?.accountAppearance,
        friendsList: Array.from(friendMap.values()),
        deletedWorldIds: Array.from(delSet),
        presence: presence
          ? {
              isOnline: Boolean(presence.isOnline),
              inOpenWorld: Boolean(presence.inOpenWorld),
              worldId: presence.worldId || null,
              worldName: presence.worldName || null,
              inviteCode: presence.inviteCode || null,
              updatedAt: Date.now(),
            }
          : existing?.presence,
        updatedAt: Date.now(),
      };

      store.profilesByPublicId[cleanPubId] = mergedProfile;
      writeSocialStore(store);

      const friendsStatus = mergedProfile.friendsList.map((f) =>
        computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
      );

      res.json({
        ok: true,
        profile: mergedProfile,
        friendsStatus,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Sync error' });
    }
  });

  function normalizePublicPlayerId(raw: string): string {
    const clean = String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
    if (!clean) return '';
    const alnum = clean.replace(/-/g, '');
    if (alnum.startsWith('SE') && alnum.length === 10) {
      return `SE-${alnum.slice(2, 6)}-${alnum.slice(6, 10)}`;
    }
    if (alnum.length === 8) {
      return `SE-${alnum.slice(0, 4)}-${alnum.slice(4, 8)}`;
    }
    return clean;
  }

  function syncActiveRoomsIntoSocialStore(store: SocialStoreData): boolean {
    let dirty = false;
    const now = Date.now();
    for (const room of activeRooms.values()) {
      for (const peer of room.peers.values()) {
        const pubId = normalizePublicPlayerId(
          peer.playerPublicId || peer.lastState?.playerPublicId || ''
        );
        if (!pubId) continue;
        let prof = store.profilesByPublicId[pubId];
        if (!prof) {
          prof = {
            playerPublicId: pubId,
            username: peer.name || 'Aventureiro',
            friendsList: [],
            deletedWorldIds: [],
            updatedAt: now,
          };
          store.profilesByPublicId[pubId] = prof;
          dirty = true;
        } else if (peer.name && prof.username !== peer.name) {
          prof.username = peer.name;
          dirty = true;
        }
      }
    }
    return dirty;
  }

  app.get('/api/social/search', (req, res) => {
    try {
      const store = readSocialStore();
      if (syncActiveRoomsIntoSocialStore(store)) {
        writeSocialStore(store);
      }

      const rawQ = String(req.query.q || '').trim();
      const playerIdQuery = String(req.query.playerId || rawQ)
        .trim()
        .toUpperCase();
      const usernameQuery = String(req.query.username || rawQ)
        .trim()
        .toLowerCase();
      const excludeId = normalizePublicPlayerId(String(req.query.excludeId || ''));

      const resultsMap = new Map<
        string,
        {
          playerPublicId: string;
          username: string;
          isOnline?: boolean;
          inOpenWorld?: boolean;
          worldName?: string | null;
        }
      >();

      const all = Object.values(store.profilesByPublicId);
      const normalizedIdQuery = normalizePublicPlayerId(playerIdQuery);
      const strippedIdQuery = playerIdQuery.replace(/[^A-Z0-9]/g, '');

      // 1. Check ID matches (exact normalized or partial alphanumeric match)
      if (playerIdQuery && !req.query.username) {
        const exact =
          store.profilesByPublicId[normalizedIdQuery] ||
          store.profilesByPublicId[playerIdQuery];
        if (exact && exact.playerPublicId !== excludeId) {
          const st = computeLiveStatusForPublicId(
            store,
            exact.playerPublicId,
            exact.username
          );
          resultsMap.set(exact.playerPublicId, {
            playerPublicId: exact.playerPublicId,
            username: exact.username,
            isOnline: st.isOnline,
            inOpenWorld: st.inOpenWorld,
            worldName: st.worldName,
          });
        }
        if (strippedIdQuery.length >= 3) {
          for (const p of all) {
            if (!p || !p.playerPublicId || p.playerPublicId === excludeId)
              continue;
            const pStripped = p.playerPublicId.replace(/[^A-Z0-9]/g, '');
            if (pStripped.includes(strippedIdQuery)) {
              const st = computeLiveStatusForPublicId(
                store,
                p.playerPublicId,
                p.username
              );
              resultsMap.set(p.playerPublicId, {
                playerPublicId: p.playerPublicId,
                username: p.username,
                isOnline: st.isOnline,
                inOpenWorld: st.inOpenWorld,
                worldName: st.worldName,
              });
            }
          }
        }
      }

      // 2. Check Username matches (or unified query)
      if (usernameQuery && !req.query.playerId) {
        const matches = all.filter(
          (p) =>
            p &&
            p.playerPublicId &&
            p.playerPublicId !== excludeId &&
            ((p.username || '').toLowerCase().includes(usernameQuery) ||
              p.playerPublicId.toLowerCase().includes(usernameQuery))
        );
        matches.sort((a, b) => {
          const aExact = a.username.toLowerCase() === usernameQuery ? 0 : 1;
          const bExact = b.username.toLowerCase() === usernameQuery ? 0 : 1;
          if (aExact !== bExact) return aExact - bExact;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        for (const m of matches.slice(0, 25)) {
          const st = computeLiveStatusForPublicId(
            store,
            m.playerPublicId,
            m.username
          );
          resultsMap.set(m.playerPublicId, {
            playerPublicId: m.playerPublicId,
            username: m.username,
            isOnline: st.isOnline,
            inOpenWorld: st.inOpenWorld,
            worldName: st.worldName,
          });
        }
      }

      res.json({ ok: true, results: Array.from(resultsMap.values()) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Search error' });
    }
  });

  app.post('/api/social/friends/add', (req, res) => {
    try {
      const store = readSocialStore();
      syncActiveRoomsIntoSocialStore(store);

      const myPublicId = normalizePublicPlayerId(
        String(req.body?.myPublicId || '')
      );
      const myUsername =
        String(req.body?.myUsername || 'Aventureiro')
          .trim()
          .slice(0, 22) || 'Aventureiro';
      const targetPublicId = normalizePublicPlayerId(
        String(req.body?.targetPublicId || '')
      );
      const targetUsernameHint = String(req.body?.targetUsername || '')
        .trim()
        .slice(0, 22);

      if (!myPublicId || !targetPublicId || targetPublicId.length < 4) {
        res.status(400).json({ ok: false, error: 'ID de jogador inválido.' });
        return;
      }
      if (myPublicId === targetPublicId) {
        res
          .status(400)
          .json({ ok: false, error: 'Você não pode adicionar seu próprio ID.' });
        return;
      }

      const now = Date.now();
      let targetProfile = store.profilesByPublicId[targetPublicId];
      if (!targetProfile) {
        // Create placeholder entry so cross-device / P2P / direct ID friends can always be added immediately
        targetProfile = {
          playerPublicId: targetPublicId,
          username:
            targetUsernameHint || `Jogador ${targetPublicId.slice(-4)}`,
          friendsList: [],
          deletedWorldIds: [],
          updatedAt: now,
        };
        store.profilesByPublicId[targetPublicId] = targetProfile;
      } else if (
        targetUsernameHint &&
        targetProfile.username.startsWith('Jogador ')
      ) {
        targetProfile.username = targetUsernameHint;
      }

      let myProfile = store.profilesByPublicId[myPublicId];
      if (!myProfile) {
        myProfile = {
          playerPublicId: myPublicId,
          username: myUsername,
          friendsList: [],
          deletedWorldIds: [],
          updatedAt: now,
        };
        store.profilesByPublicId[myPublicId] = myProfile;
      }

      if (
        !myProfile.friendsList.some((f) => f.playerPublicId === targetPublicId)
      ) {
        myProfile.friendsList.push({
          playerPublicId: targetPublicId,
          username: targetProfile.username,
          addedAt: now,
        });
      }
      if (
        !targetProfile.friendsList.some((f) => f.playerPublicId === myPublicId)
      ) {
        targetProfile.friendsList.push({
          playerPublicId: myPublicId,
          username: myProfile.username,
          addedAt: now,
        });
      }

      writeSocialStore(store);

      const friendsStatus = myProfile.friendsList.map((f) =>
        computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
      );

      res.json({
        ok: true,
        friendsList: myProfile.friendsList,
        friendsStatus,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Erro ao adicionar amigo.' });
    }
  });

  app.post('/api/social/friends/remove', (req, res) => {
    try {
      const store = readSocialStore();
      const myPublicId = String(req.body?.myPublicId || '')
        .trim()
        .toUpperCase();
      const targetPublicId = String(req.body?.targetPublicId || '')
        .trim()
        .toUpperCase();

      const myProfile = store.profilesByPublicId[myPublicId];
      if (myProfile) {
        myProfile.friendsList = myProfile.friendsList.filter(
          (f) => f.playerPublicId !== targetPublicId
        );
      }
      const targetProfile = store.profilesByPublicId[targetPublicId];
      if (targetProfile) {
        targetProfile.friendsList = targetProfile.friendsList.filter(
          (f) => f.playerPublicId !== myPublicId
        );
      }
      writeSocialStore(store);

      const friendsList = myProfile?.friendsList || [];
      const friendsStatus = friendsList.map((f) =>
        computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
      );
      res.json({ ok: true, friendsList, friendsStatus });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Remove error' });
    }
  });

  app.post('/api/social/presence', (req, res) => {
    try {
      const store = readSocialStore();
      const {
        playerPublicId: rawPubId,
        username: rawUsername,
        isOnline,
        inOpenWorld,
        worldId,
        worldName,
        inviteCode,
      } = req.body || {};

      const cleanPubId = String(rawPubId || '')
        .trim()
        .toUpperCase();
      if (!cleanPubId) {
        res.status(400).json({ ok: false, error: 'Missing playerPublicId' });
        return;
      }

      const now = Date.now();
      let prof = store.profilesByPublicId[cleanPubId];
      if (!prof) {
        prof = {
          playerPublicId: cleanPubId,
          username:
            String(rawUsername || 'Aventureiro')
              .trim()
              .slice(0, 22) || 'Aventureiro',
          friendsList: [],
          deletedWorldIds: [],
          updatedAt: now,
        };
        store.profilesByPublicId[cleanPubId] = prof;
      } else if (rawUsername && String(rawUsername).trim()) {
        prof.username = String(rawUsername).trim().slice(0, 22);
      }

      prof.presence = {
        isOnline: Boolean(isOnline),
        inOpenWorld: Boolean(inOpenWorld),
        worldId: worldId || null,
        worldName: worldName || null,
        inviteCode: inviteCode || null,
        updatedAt: now,
      };
      prof.updatedAt = now;

      // Refresh friend usernames
      for (const f of prof.friendsList) {
        const fProf = store.profilesByPublicId[f.playerPublicId];
        if (fProf?.username) {
          f.username = fProf.username;
        }
      }

      const friendsStatus = prof.friendsList.map((f) =>
        computeLiveStatusForPublicId(store, f.playerPublicId, f.username)
      );

      // Clean expired join requests (> 90s) and collect pending requests for this host
      const pendingJoinRequests: ServerJoinRequest[] = [];
      for (const [reqId, jr] of activeJoinRequests.entries()) {
        if (now - jr.createdAt > 90000) {
          activeJoinRequests.delete(reqId);
          continue;
        }
        if (jr.targetPublicId === cleanPubId && jr.status === 'PENDING') {
          pendingJoinRequests.push(jr);
        }
      }

      res.json({
        ok: true,
        friendsList: prof.friendsList,
        friendsStatus,
        pendingJoinRequests,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Presence error' });
    }
  });

  app.post('/api/social/join-request', (req, res) => {
    try {
      const store = readSocialStore();
      const requesterPublicId = String(req.body?.requesterPublicId || '')
        .trim()
        .toUpperCase();
      const requesterName =
        String(req.body?.requesterName || 'Amigo')
          .trim()
          .slice(0, 22) || 'Amigo';
      const targetPublicId = String(req.body?.targetPublicId || '')
        .trim()
        .toUpperCase();

      if (!requesterPublicId || !targetPublicId) {
        res.status(400).json({ ok: false, error: 'Dados de solicitação inválidos.' });
        return;
      }

      const targetStatus = computeLiveStatusForPublicId(store, targetPublicId);
      if (!targetStatus.inOpenWorld || !targetStatus.inviteCode) {
        res.status(400).json({
          ok: false,
          error:
            'Este amigo não está em um mundo com disponibilidade online ativada no momento.',
        });
        return;
      }

      // Reuse existing pending request if present
      for (const existing of activeJoinRequests.values()) {
        if (
          existing.requesterPublicId === requesterPublicId &&
          existing.targetPublicId === targetPublicId &&
          existing.status === 'PENDING'
        ) {
          res.json({ ok: true, request: existing });
          return;
        }
      }

      const requestId = `jreq_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const joinReq: ServerJoinRequest = {
        requestId,
        requesterPublicId,
        requesterName,
        targetPublicId,
        worldId:
          store.profilesByPublicId[targetPublicId]?.presence?.worldId || 'world',
        worldName: targetStatus.worldName || 'Mundo Online',
        inviteCode: targetStatus.inviteCode,
        status: 'PENDING',
        createdAt: Date.now(),
      };

      activeJoinRequests.set(requestId, joinReq);

      // Push real-time notification directly to the host peer in the active room if connected
      const room = activeRooms.get(targetStatus.inviteCode);
      if (room) {
        const hostPeer = room.peers.get(room.hostPeerId);
        if (hostPeer) {
          pushEventToPeer(room, hostPeer, {
            type: 'join_request_received',
            request: joinReq,
          });
        }
      }

      res.json({ ok: true, request: joinReq });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Join request error' });
    }
  });

  app.get('/api/social/join-request/:requestId', (req, res) => {
    const reqId = String(req.params.requestId || '').trim();
    const joinReq = activeJoinRequests.get(reqId);
    if (!joinReq) {
      res.status(404).json({
        ok: false,
        error: 'Solicitação expirada ou não encontrada.',
      });
      return;
    }
    res.json({ ok: true, request: joinReq });
  });

  app.post('/api/social/join-request/respond', (req, res) => {
    const reqId = String(req.body?.requestId || '').trim();
    const accept = Boolean(req.body?.accept);
    const joinReq = activeJoinRequests.get(reqId);
    if (!joinReq) {
      res.status(404).json({
        ok: false,
        error: 'Solicitação não encontrada.',
      });
      return;
    }
    joinReq.status = accept ? 'ACCEPTED' : 'DECLINED';
    res.json({ ok: true, request: joinReq });
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
      const hostPublicId =
        normalizePublicPlayerId(
          String(
            req.body?.playerPublicId || playerState?.playerPublicId || ''
          )
        ) || undefined;
      const hostPeer: ConnectedPeer = {
        peerId: hostPeerId,
        playerPublicId: hostPublicId,
        name: hostName,
        isHost: true,
        ws: existingHostPeer?.ws || null,
        lastSeenAt: Date.now(),
        pendingEvents: existingHostPeer?.pendingEvents || [],
        lastState: {
          ...(playerState || {}),
          peerId: hostPeerId,
          playerPublicId: hostPublicId,
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
      const guestPublicId =
        normalizePublicPlayerId(
          String(
            req.body?.playerPublicId || playerState?.playerPublicId || ''
          )
        ) || undefined;
      const guestPeer: ConnectedPeer = {
        peerId: guestPeerId,
        playerPublicId: guestPublicId,
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
          playerPublicId: guestPublicId,
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
        wsActive,
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
      const isWsHealthy = Boolean(
        wsActive || (peer.ws && peer.ws.readyState === WebSocket.OPEN)
      );
      const sendFullEntityLists =
        !peer.isHost && (!isWsHealthy || autoRejoined || requestFullSnapshot);

      res.json({
        ok: true,
        inviteCode: room.inviteCode,
        worldRevision: room.worldRevision || 1,
        peers: getRoomPeersSummary(room),
        remoteStates: getRoomRemoteStates(room, peer.peerId),
        events: drainedEvents,
        creatures: sendFullEntityLists
          ? room.worldSnapshot?.creatures
          : undefined,
        droppedItems: sendFullEntityLists
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
    const worldData = req.body?.world || req.body?.data || req.body;
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
