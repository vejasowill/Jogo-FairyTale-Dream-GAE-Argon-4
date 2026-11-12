import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  type Firestore,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  getBytes,
  handleFirestoreError,
  OperationType,
  storage,
  storageRef,
  uploadBytesResumable,
} from '../../firebase';
import {
  ChunkData,
  CURRENT_WORLD_GEN_VERSION,
  GAME_VERSION,
  WorldSaveData,
} from '../core/types';
import {
  computeChecksum,
  computeDeterministicHash256,
  ensureWorldLineageMetadata,
  migrateSaveData,
  SaveManager,
  stripWorldCopySuffix,
} from './SaveManager';

export { computeChecksum, computeDeterministicHash256 };

/**
 * Maximum payload size per part (320 KB) to guarantee every part stays well below
 * Firestore's 1,048,576-byte document limit and transfers fast on mobile connections.
 */
export const MAX_CLOUD_PART_BYTES = 320_000;
export const DEFAULT_UPLOAD_CONCURRENCY = 12;

export interface CloudPublishTelemetry {
  preparationMs: number;
  hashingMs: number;
  serializationMs: number;
  uploadMs: number;
  verificationMs: number;
  publishMs: number;
  totalDurationMs: number;
  chunksAnalyzed: number;
  chunksUploaded: number;
  unchangedChunksSkipped: number;
  bytesTransferred: number;
  totalWorldBytes: number;
  noNewRevisionCreated: boolean;
}

export interface CloudTransferProgress {
  phase:
    | 'IDLE'
    | 'IDENTIFYING_CHANGES'
    | 'UPLOADING_CHUNKS'
    | 'VERIFYING_INTEGRITY'
    | 'COMMITTING_MANIFEST'
    | 'DOWNLOADING_CHUNKS'
    | 'RECONSTRUCTING_WORLD'
    | 'MIGRATING_LEGACY_WORLD'
    | 'COMPLETED'
    | 'PAUSED_INTERRUPTED'
    | 'ERROR';
  worldId: string | null;
  worldName: string | null;
  revisionId: string | null;
  chunksUploaded: number;
  chunksPending: number;
  chunksTotal: number;
  unchangedChunksSkipped: number;
  bytesTransferred: number;
  totalBytesToTransfer: number;
  totalWorldBytes: number;
  transferSpeedBytesPerSec: number;
  activeConcurrency: number;
  maxConcurrency: number;
  canResume: boolean;
  lastError: string | null;
  storageBackendUsed: 'firebase_storage' | 'hybrid_segmented' | 'server_storage';
  telemetry?: CloudPublishTelemetry;
}

export interface CloudChunkDescriptor {
  logicalKey: string;
  layer: 'surface' | 'underground' | 'entities' | 'manifest' | 'snapshot';
  rawCoordinateKey: string;
  hash: string;
  sizeBytes: number;
  partsCount: number;
  partKeys: string[];
  storagePaths: string[];
  updatedAt: number;
}

export interface CloudWorldManifest {
  manifestVersion: 2;
  worldId: string;
  ownerId: string;
  revisionId: string;
  previousRevisionId: string;
  createdAtMs: number;
  totalWorldBytes: number;
  totalChunksCount: number;
  manifestHash: string;
  contentHash?: string;
  gameplayHash?: string;
  entitiesDescriptor: CloudChunkDescriptor;
  chunks: Record<string, CloudChunkDescriptor>;
}

export interface CloudPartUnit {
  partDocKey: string;
  logicalKey: string;
  layer: 'surface' | 'underground' | 'entities' | 'manifest' | 'snapshot';
  partIndex: number;
  totalParts: number;
  hash: string;
  sizeBytes: number;
  storagePath: string;
  revisionId: string;
  serializedSlice: string;
}

export interface DecomposedCloudWorld {
  worldId: string;
  ownerId: string;
  revisionId: string;
  previousRevisionId: string;
  totalWorldBytes: number;
  totalChunksCount: number;
  contentHash: string;
  gameplayHash: string;
  preparationMs: number;
  hashingMs: number;
  serializationMs: number;
  manifest: CloudWorldManifest;
  allLogicalUnits: Map<
    string,
    {
      descriptor: CloudChunkDescriptor;
      parts: CloudPartUnit[];
    }
  >;
  metadataDocFields: Record<string, unknown>;
}

interface PersistedQueueRecord {
  queueKey: string;
  uid: string;
  worldId: string;
  worldName: string;
  revisionId: string;
  createdAt: number;
  completedPartDocKeys: string[];
  completedLogicalHashes: Record<string, string>;
  totalParts: number;
  totalBytes: number;
}

const QUEUE_DB_NAME = 'fairytale_cloud_upload_queue_v1';
const QUEUE_STORE_NAME = 'upload_queues';
const HASH_CACHE_STORAGE_PREFIX = 'wildborn_cloud_chunk_hashes_v2_';

function sanitizeId(raw: string, fallback = 'id_default'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function sanitizeText(
  raw: string | null | undefined,
  minLen: number,
  maxLen: number,
  fallback: string
): string {
  const trimmed = String(raw ?? '').trim();
  const base = trimmed.length >= minLen ? trimmed : fallback;
  return base.slice(0, maxLen);
}

/**
 * Splits an arbitrary string into UTF-8 safe slices where each slice is <= maxBytes.
 */
export function splitStringIntoParts(
  payload: string,
  maxBytes = MAX_CLOUD_PART_BYTES
): string[] {
  if (payload.length === 0) return [''];
  if (payload.length * 2 <= maxBytes) {
    return [payload];
  }
  const parts: string[] = [];
  const charStep = Math.max(1024, Math.floor(maxBytes * 0.85));
  for (let offset = 0; offset < payload.length; offset += charStep) {
    parts.push(payload.slice(offset, offset + charStep));
  }
  return parts;
}

/**
 * Verifies a payload against an expected hash (supports 64-char deterministic 256-bit hex,
 * 32-char truncated manifest hashes, and legacy 8-char FNV-1a checksums).
 */
export function verifyCloudPayloadHash(
  payload: string,
  expectedHash: string
): boolean {
  if (!expectedHash) return true;
  if (expectedHash.length === 8) {
    return computeChecksum(payload) === expectedHash;
  }
  if (expectedHash.length === 32) {
    return (
      computeDeterministicHash256(payload).slice(0, 32) === expectedHash ||
      computeChecksum(payload).slice(0, 32) === expectedHash
    );
  }
  return (
    computeDeterministicHash256(payload) === expectedHash ||
    computeChecksum(payload) === expectedHash
  );
}

/**
 * Persistent Upload Queue backed by IndexedDB (with in-memory / localStorage fallback).
 */
export class PersistentUploadQueue {
  private memoryStore = new Map<string, PersistedQueueRecord>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(QUEUE_DB_NAME, 1);
          req.onupgradeneeded = () => {
            const dbInstance = req.result;
            if (!dbInstance.objectStoreNames.contains(QUEUE_STORE_NAME)) {
              dbInstance.createObjectStore(QUEUE_STORE_NAME, {
                keyPath: 'queueKey',
              });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  public async loadQueue(
    uid: string,
    worldId: string
  ): Promise<PersistedQueueRecord | null> {
    const queueKey = `${uid}__${worldId}`;
    if (this.memoryStore.has(queueKey)) {
      return this.memoryStore.get(queueKey)!;
    }
    const idb = await this.getDb();
    if (!idb) return null;
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(QUEUE_STORE_NAME, 'readonly');
        const store = tx.objectStore(QUEUE_STORE_NAME);
        const req = store.get(queueKey);
        req.onsuccess = () => {
          const rec = (req.result as PersistedQueueRecord) || null;
          if (rec) this.memoryStore.set(queueKey, rec);
          resolve(rec);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async listAllQueuesForUser(
    uid: string
  ): Promise<PersistedQueueRecord[]> {
    const cleanPrefix = `${uid}__`;
    const out = new Map<string, PersistedQueueRecord>();
    for (const [k, v] of this.memoryStore.entries()) {
      if (k.startsWith(cleanPrefix)) {
        out.set(k, v);
      }
    }
    const idb = await this.getDb();
    if (idb) {
      await new Promise<void>((resolve) => {
        try {
          const tx = idb.transaction(QUEUE_STORE_NAME, 'readonly');
          const store = tx.objectStore(QUEUE_STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => {
            const list = Array.isArray(req.result)
              ? (req.result as PersistedQueueRecord[])
              : [];
            for (const rec of list) {
              if (rec && rec.queueKey && rec.queueKey.startsWith(cleanPrefix)) {
                out.set(rec.queueKey, rec);
                this.memoryStore.set(rec.queueKey, rec);
              }
            }
            resolve();
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
    return Array.from(out.values());
  }

  public async saveQueue(record: PersistedQueueRecord): Promise<void> {
    this.memoryStore.set(record.queueKey, record);
    const idb = await this.getDb();
    if (!idb) return;
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(QUEUE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE_NAME);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async clearQueue(uid: string, worldId: string): Promise<void> {
    const queueKey = `${uid}__${worldId}`;
    this.memoryStore.delete(queueKey);
    const idb = await this.getDb();
    if (!idb) return;
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction(QUEUE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE_NAME);
        store.delete(queueKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const persistentUploadQueue = new PersistentUploadQueue();

const inMemoryCloudHashCache = new Map<string, Record<string, string>>();

/**
 * Decomposes a WorldSaveData of ANY size (3 MB, 50 MB, 500 MB+) into:
 * - A lightweight metadata & revision header (~1.2 KB) for `/users/{uid}/worlds/{worldId}`
 * - Independent canonical chunk units (`surface_{cx}_{cy}`, `underground_{cx}_{cy}`)
 * - Independent canonical entities unit (`entities_state`)
 * - Automatic multipart splitting (`MAX_CLOUD_PART_BYTES`) if any single unit exceeds 320 KB.
 */
export function decomposeWorldIntoCloudUnits(
  rawSaveData: WorldSaveData,
  uid: string,
  previousRevisionId = '',
  legacyUid = ''
): DecomposedCloudWorld {
  const prepStart = Date.now();
  const cleanUid = sanitizeId(uid, 'user_default');

  // Always compact and normalize saveData first so hydrated runtime arrays or volatile dirtyRev
  // counters never cause false-positive hash differences!
  const isAlreadyCompact = (() => {
    const firstChunk = Object.values(rawSaveData.chunks || {})[0];
    if (!firstChunk) return true;
    return (
      typeof firstChunk.compactTiles === 'string' &&
      Array.isArray(firstChunk.tiles) &&
      firstChunk.tiles.length === 0
    );
  })();

  const saveData = isAlreadyCompact
    ? rawSaveData
    : SaveManager.compactSaveDataForStorage(rawSaveData, false, 18, false);

  ensureWorldLineageMetadata(saveData.metadata);

  const worldId = sanitizeId(
    saveData.metadata?.id || `world_${Date.now()}`,
    `world_${Date.now()}`
  );
  const nowMs = Date.now();
  const preparationMs = Math.max(0, nowMs - prepStart);

  let serializationMs = 0;
  let hashingMs = 0;

  const allLogicalUnits = new Map<
    string,
    {
      descriptor: CloudChunkDescriptor;
      parts: CloudPartUnit[];
    }
  >();

  let totalWorldBytes = 0;
  const chunkDescriptors: Record<string, CloudChunkDescriptor> = {};
  const placeholderRevisionId = `rev_${nowMs}`;

  const registerLogicalUnit = (
    logicalKey: string,
    layer: 'surface' | 'underground' | 'entities',
    rawCoordKey: string,
    serializedPayload: string
  ): CloudChunkDescriptor => {
    const tHash0 = Date.now();
    const unitHash = computeDeterministicHash256(serializedPayload);
    hashingMs += Date.now() - tHash0;

    const unitBytes = serializedPayload.length;
    totalWorldBytes += unitBytes;

    const slices = splitStringIntoParts(serializedPayload, MAX_CLOUD_PART_BYTES);
    const partKeys: string[] = [];
    const storagePaths: string[] = [];
    const parts: CloudPartUnit[] = [];

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const partDocKey =
        slices.length === 1
          ? sanitizeId(logicalKey)
          : sanitizeId(`${logicalKey}_p${i}`);
      const storagePath =
        layer === 'entities'
          ? `users/${cleanUid}/worlds/${worldId}/revisions/${placeholderRevisionId}/${partDocKey}.json`
          : `users/${cleanUid}/worlds/${worldId}/chunks/${partDocKey}.json`;
      const tPartHash = Date.now();
      const partHash =
        slices.length === 1 ? unitHash : computeDeterministicHash256(slice);
      hashingMs += Date.now() - tPartHash;

      partKeys.push(partDocKey);
      storagePaths.push(storagePath);
      parts.push({
        partDocKey,
        logicalKey,
        layer,
        partIndex: i,
        totalParts: slices.length,
        hash: partHash,
        sizeBytes: slice.length,
        storagePath,
        revisionId: placeholderRevisionId,
        serializedSlice: slice,
      });
    }

    const descriptor: CloudChunkDescriptor = {
      logicalKey,
      layer,
      rawCoordinateKey: rawCoordKey,
      hash: unitHash,
      sizeBytes: unitBytes,
      partsCount: slices.length,
      partKeys,
      storagePaths,
      updatedAt: nowMs,
    };

    allLogicalUnits.set(logicalKey, { descriptor, parts });
    return descriptor;
  };

  // 1. Decompose Surface Chunks independently (normalizing dirtyRev = 1 so hashes depend strictly on chunk content)
  const surfaceChunks = saveData.chunks || {};
  const surfaceKeys = Object.keys(surfaceChunks).sort();
  for (const coordKey of surfaceKeys) {
    const chunkObj = surfaceChunks[coordKey];
    if (!chunkObj) continue;
    const safeCoord = coordKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const logicalKey = `surface_${safeCoord}`;
    const tSer0 = Date.now();
    const canonicalChunk =
      chunkObj.dirtyRev === 1 ? chunkObj : { ...chunkObj, dirtyRev: 1 };
    const serialized = JSON.stringify(canonicalChunk);
    serializationMs += Date.now() - tSer0;
    chunkDescriptors[logicalKey] = registerLogicalUnit(
      logicalKey,
      'surface',
      coordKey,
      serialized
    );
  }

  // 2. Decompose Underground Chunks independently
  const undergroundChunks = saveData.undergroundChunks || {};
  const undergroundKeys = Object.keys(undergroundChunks).sort();
  for (const coordKey of undergroundKeys) {
    const chunkObj = undergroundChunks[coordKey];
    if (!chunkObj) continue;
    const safeCoord = coordKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const logicalKey = `underground_${safeCoord}`;
    const tSer0 = Date.now();
    const canonicalChunk =
      chunkObj.dirtyRev === 1 ? chunkObj : { ...chunkObj, dirtyRev: 1 };
    const serialized = JSON.stringify(canonicalChunk);
    serializationMs += Date.now() - tSer0;
    chunkDescriptors[logicalKey] = registerLogicalUnit(
      logicalKey,
      'underground',
      coordKey,
      serialized
    );
  }

  // 3. Decompose Entities, Player, Structures & World State (without chunks and without volatile timestamps)
  const tHashMeta0 = Date.now();
  const gameplayHash = SaveManager.computeCanonicalGameplayHash(saveData);
  const contentHash = SaveManager.computeCanonicalSyncHash(saveData);
  hashingMs += Date.now() - tHashMeta0;

  const clonedPlayer = saveData.player
    ? {
        ...saveData.player,
        persistentPlayerId: cleanUid,
        savedAt: 0,
        animFrame: 0,
        animTimer: 0,
        swingTimer: 0,
        hitFlashTimer: 0,
      }
    : saveData.player;

  const clonedCreatures = Array.isArray(saveData.creatures)
    ? saveData.creatures.map((cr) => {
        if (
          cr &&
          cr.tamed &&
          (!cr.ownerId || (legacyUid && cr.ownerId === legacyUid))
        ) {
          return { ...cr, ownerId: cleanUid, animTimer: 0, hitFlashTimer: 0 };
        }
        return cr ? { ...cr, animTimer: 0, hitFlashTimer: 0 } : cr;
      })
    : [];

  const canonicalMetadataForEntities = {
    ...saveData.metadata,
    id: worldId,
    instanceId: worldId,
    originWorldId: saveData.metadata?.originWorldId || worldId,
    baseWorldName:
      saveData.metadata?.baseWorldName ||
      stripWorldCopySuffix(saveData.metadata?.name || 'Fronteira Selvagem'),
    isCopy: Boolean(saveData.metadata?.isCopy),
    copyNumber: saveData.metadata?.copyNumber ?? null,
    contentHash,
    // Normalize volatile sync/save timestamps inside entities_state so its hash only changes when real state changes
    updatedAt: 0,
    lastSyncedAt: null,
    lastSyncedRevisionId: null,
    lastSyncedManifestHash: null,
    lastSyncedContentHash: null,
    syncPending: false,
    conflictInfo: null,
  };

  const entitiesEnvelope = {
    version: Number(saveData.version || 3),
    metadata: canonicalMetadataForEntities,
    player: clonedPlayer,
    ...(saveData.guestPlayers ? { guestPlayers: saveData.guestPlayers } : {}),
    creatures: clonedCreatures,
    droppedItems: Array.isArray(saveData.droppedItems)
      ? saveData.droppedItems
      : [],
    waypoints: Array.isArray(saveData.waypoints) ? saveData.waypoints : [],
    deathBags: Array.isArray(saveData.deathBags) ? saveData.deathBags : [],
  };

  const tSerEnt = Date.now();
  const serializedEntities = JSON.stringify(entitiesEnvelope);
  serializationMs += Date.now() - tSerEnt;

  const entitiesDescriptor = registerLogicalUnit(
    'entities_state',
    'entities',
    'entities_state',
    serializedEntities
  );

  // 4. Compute deterministic Manifest Hash & Revision ID
  const tManifestHash = Date.now();
  const hashInput = [
    `e:${entitiesDescriptor.hash}`,
    ...Object.keys(chunkDescriptors)
      .sort()
      .map((k) => `${k}:${chunkDescriptors[k].hash}`),
  ].join('|');
  const manifestHash = computeDeterministicHash256(hashInput);
  hashingMs += Date.now() - tManifestHash;

  const revisionId = sanitizeId(`rev_${nowMs}_${manifestHash.slice(0, 12)}`);

  // Patch revisionId into all generated parts & paths
  for (const unit of allLogicalUnits.values()) {
    unit.descriptor.storagePaths = unit.descriptor.storagePaths.map((p) =>
      p.replace(placeholderRevisionId, revisionId)
    );
    for (const part of unit.parts) {
      part.revisionId = revisionId;
      part.storagePath = part.storagePath.replace(
        placeholderRevisionId,
        revisionId
      );
    }
  }

  const totalChunksCount = Object.keys(chunkDescriptors).length;

  const manifest: CloudWorldManifest = {
    manifestVersion: 2,
    worldId,
    ownerId: cleanUid,
    revisionId,
    previousRevisionId: sanitizeText(previousRevisionId, 0, 128, ''),
    createdAtMs: nowMs,
    totalWorldBytes,
    totalChunksCount,
    manifestHash,
    contentHash,
    gameplayHash,
    entitiesDescriptor,
    chunks: chunkDescriptors,
  };

  const meta = saveData.metadata || ({} as WorldSaveData['metadata']);
  const rawDifficulty = meta.difficulty;
  const difficulty: 'normal' | 'survival' | 'hardcore' =
    rawDifficulty === 'survival' || rawDifficulty === 'hardcore'
      ? rawDifficulty
      : 'normal';

  const seedInt = Math.max(
    0,
    Math.min(2147483647, Math.floor(Math.abs(Number(meta.seed) || 123456)))
  );
  const dayCountInt = Math.max(
    1,
    Math.min(1000000, Math.floor(Number(meta.dayCount) || 1))
  );
  const timeOfDayNum = Math.max(
    0,
    Math.min(24, Number(meta.timeOfDay) || 8.0)
  );
  const playerLevelInt = Math.max(
    1,
    Math.min(
      9999,
      Math.floor(Number(saveData.player?.level || meta.playerLevel) || 1)
    )
  );
  const exploredChunksInt = Math.max(
    0,
    Math.min(
      1000000,
      Math.floor(Number(meta.exploredChunksCount) || totalChunksCount || 1)
    )
  );
  const worldGenVersionInt = Math.max(
    1,
    Math.min(
      1000,
      Math.floor(Number(meta.worldGenVersion) || CURRENT_WORLD_GEN_VERSION)
    )
  );
  const clientUpdatedAtInt = Math.max(
    0,
    Math.floor(Number(meta.updatedAt || saveData.player?.savedAt || nowMs))
  );

  // Build compact hash map for chunkIndexSummary (when <= 120 KB) so incremental sync
  // on any browser/device knows all cloud chunk hashes with 0 extra Firestore reads!
  const allUnitHashes: Record<string, string> = {
    entities_state: entitiesDescriptor.hash,
  };
  for (const [k, desc] of Object.entries(chunkDescriptors)) {
    allUnitHashes[k] = desc.hash;
  }
  const serializedHashMap = JSON.stringify(allUnitHashes);

  const chunkIndexSummary: Record<string, unknown> = {
    manifestHash,
    contentHash,
    gameplayHash,
    entitiesHash: entitiesDescriptor.hash,
    entitiesPartsCount: entitiesDescriptor.partsCount,
    surfaceChunksCount: surfaceKeys.length,
    undergroundChunksCount: undergroundKeys.length,
    revisionTimestamp: nowMs,
    originWorldId: sanitizeText(meta.originWorldId || worldId, 1, 128, worldId),
    instanceId: worldId,
    parentInstanceId: sanitizeText(meta.parentInstanceId || '', 0, 128, ''),
    isCopy: Boolean(meta.isCopy),
    copyNumber:
      typeof meta.copyNumber === 'number' && meta.copyNumber >= 1
        ? Math.floor(meta.copyNumber)
        : 0,
    baseWorldName: sanitizeText(
      meta.baseWorldName || stripWorldCopySuffix(meta.name),
      1,
      64,
      'Fronteira Selvagem'
    ),
    ...(serializedHashMap.length <= 120_000
      ? { chunkHashesCompact: serializedHashMap }
      : {}),
  };

  // Compact metadata-only document for /users/{uid}/worlds/{worldId}
  const metadataDocFields: Record<string, unknown> = {
    worldId,
    ownerId: cleanUid,
    name: sanitizeText(meta.name, 1, 64, 'Fronteira Selvagem'),
    seed: seedInt,
    seedText: sanitizeText(
      meta.seedText || String(seedInt),
      1,
      64,
      String(seedInt)
    ),
    difficulty,
    dayCount: dayCountInt,
    timeOfDay: timeOfDayNum,
    playerLevel: playerLevelInt,
    exploredChunksCount: exploredChunksInt,
    gameVersion: sanitizeText(
      meta.gameVersion || GAME_VERSION,
      1,
      32,
      GAME_VERSION
    ),
    worldGenVersion: worldGenVersionInt,
    checksum: manifestHash,
    clientUpdatedAt: clientUpdatedAtInt,
    storageVersion: 2,
    activeRevisionId: revisionId,
    previousRevisionId: sanitizeText(previousRevisionId, 0, 128, ''),
    storageBackend: 'hybrid_segmented',
    totalBytes: totalWorldBytes,
    totalChunksCount,
    chunkIndexSummary,
  };

  return {
    worldId,
    ownerId: cleanUid,
    revisionId,
    previousRevisionId: sanitizeText(previousRevisionId, 0, 128, ''),
    totalWorldBytes,
    totalChunksCount,
    contentHash,
    gameplayHash,
    preparationMs,
    hashingMs,
    serializationMs,
    manifest,
    allLogicalUnits,
    metadataDocFields,
  };
}

/**
 * Loads and saves the local known cloud chunk hash map for `(uid, worldId)` so incremental sync
 * immediately knows which chunks are already in the cloud without needing extra reads.
 */
export function loadLocalCloudHashIndex(
  uid: string,
  worldId: string
): Record<string, string> {
  const memKey = `${uid}__${worldId}`;
  const inMem = inMemoryCloudHashCache.get(memKey);
  if (inMem && Object.keys(inMem).length > 0) {
    return { ...inMem };
  }
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(
      `${HASH_CACHE_STORAGE_PREFIX}${uid}_${worldId}`
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) || {};
    inMemoryCloudHashCache.set(memKey, parsed);
    return { ...parsed };
  } catch {
    return {};
  }
}

export function saveLocalCloudHashIndex(
  uid: string,
  worldId: string,
  hashes: Record<string, string>
): void {
  const memKey = `${uid}__${worldId}`;
  inMemoryCloudHashCache.set(memKey, { ...hashes });
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      `${HASH_CACHE_STORAGE_PREFIX}${uid}_${worldId}`,
      JSON.stringify(hashes)
    );
  } catch {
    // ignore quota
  }
}

/**
 * Executes an async task list with a strict concurrency cap (`maxConcurrency`)
 * and exponential backoff retry per task.
 */
export async function runWithConcurrencyAndRetry<T>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  maxRetries = 4,
  baseBackoffMs = 350
): Promise<void> {
  const concurrency = Math.max(1, Math.min(16, Math.floor(maxConcurrency || 4)));
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIdx = nextIndex++;
      const item = items[currentIdx];
      let attempt = 0;
      while (true) {
        try {
          await worker(item, currentIdx);
          break;
        } catch (err: any) {
          attempt++;
          if (attempt > maxRetries) {
            throw err;
          }
          const jitter = Math.floor(Math.random() * 120);
          const delayMs = baseBackoffMs * Math.pow(2, attempt - 1) + jitter;
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
  };

  const workers: Promise<void>[] = [];
  const count = Math.min(concurrency, items.length);
  for (let i = 0; i < count; i++) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
}

/**
 * Cloud World Storage Engine:
 * Coordinates incremental chunk synchronization, resumable/multipart transfers,
 * Firebase Storage + Firestore Segmented Chunk storage, integrity verification,
 * and v1 -> v2 migration.
 */
export class CloudWorldStorageEngine {
  private maxConcurrency = DEFAULT_UPLOAD_CONCURRENCY;
  private firebaseStorageProbeState: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE' =
    'UNKNOWN';

  public setMaxConcurrency(limit: number): void {
    this.maxConcurrency = Math.max(
      1,
      Math.min(16, Math.floor(limit || DEFAULT_UPLOAD_CONCURRENCY))
    );
  }

  public getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  /**
   * Uploads a single part unit to Firebase Storage (if bucket is provisioned) AND
   * to the Firestore `/users/{uid}/worlds/{worldId}/chunks/{partDocKey}` collection.
   * Always includes `inlineSlice` inside the Firestore chunk document (<= 320 KB, well under the 1 MB limit)
   * so reconstruction on any device is 100% self-contained and never fails even if Storage CORS is blocked.
   */
  private async uploadSinglePartUnit(
    uid: string,
    worldId: string,
    part: CloudPartUnit,
    existingChunkPartIds: Set<string>,
    worldAlreadyExistsInCloud: boolean,
    onBytesProgress?: (deltaBytes: number) => void
  ): Promise<'firebase_storage' | 'hybrid_segmented'> {
    let storedInFirebaseStorage = false;

    // 1. Try Firebase Storage resumable upload if bucket is explicitly marked AVAILABLE
    if (this.firebaseStorageProbeState === 'AVAILABLE') {
      try {
        const fileRef = storageRef(storage, part.storagePath);
        const bytes = new TextEncoder().encode(part.serializedSlice);
        const uploadTask = uploadBytesResumable(fileRef, bytes, {
          contentType: 'application/json',
          customMetadata: {
            ownerId: uid,
            worldId,
            logicalKey: part.logicalKey,
            hash: part.hash,
            revisionId: part.revisionId,
          },
        });

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            () => {},
            (err) => reject(err),
            () => resolve()
          );
        });
        storedInFirebaseStorage = true;
      } catch {
        this.firebaseStorageProbeState = 'UNAVAILABLE';
        storedInFirebaseStorage = false;
      }
    }

    // 2. Write chunk descriptor + slice to `/users/{uid}/worlds/{worldId}/chunks/{partDocKey}`
    // Note: Always store `inlineSlice: part.serializedSlice` in Firestore (each part is <= 320 KB)
    // so multi-device reconstruction always succeeds immediately without external bucket dependencies.
    const chunkDocPath = `users/${uid}/worlds/${worldId}/chunks/${part.partDocKey}`;
    const chunkRef = doc(
      db,
      'users',
      uid,
      'worlds',
      worldId,
      'chunks',
      part.partDocKey
    );

    const chunkDataMap: Record<string, unknown> = {
      logicalKey: part.logicalKey,
      inlineSlice: part.serializedSlice,
      storedInBucket: storedInFirebaseStorage,
    };

    const nowMs = Date.now();
    const isKnownExisting =
      worldAlreadyExistsInCloud && existingChunkPartIds.has(part.partDocKey);

    const createPayload = {
      chunkKey: part.partDocKey,
      worldId,
      ownerId: uid,
      layer: part.layer,
      partIndex: part.partIndex,
      totalParts: part.totalParts,
      hash: part.hash,
      sizeBytes: part.sizeBytes,
      storagePath: part.storagePath,
      revisionId: part.revisionId,
      chunkData: chunkDataMap,
      clientUpdatedAt: nowMs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const updatePayload = {
      partIndex: part.partIndex,
      totalParts: part.totalParts,
      hash: part.hash,
      sizeBytes: part.sizeBytes,
      storagePath: part.storagePath,
      revisionId: part.revisionId,
      chunkData: chunkDataMap,
      clientUpdatedAt: nowMs,
      updatedAt: serverTimestamp(),
    };

    if (!isKnownExisting) {
      // Fast path for initial upload and newly explored chunks: 1 single setDoc call!
      try {
        await setDoc(chunkRef, createPayload);
        existingChunkPartIds.add(part.partDocKey);
      } catch {
        try {
          await updateDoc(chunkRef, updatePayload);
          existingChunkPartIds.add(part.partDocKey);
        } catch (err2) {
          handleFirestoreError(err2, OperationType.CREATE, chunkDocPath);
        }
      }
    } else {
      // Updating a modified chunk in an existing world: back up previous revision (`prev_*`) and update in parallel
      if (!part.partDocKey.startsWith('prev_')) {
        try {
          const snap = await getDoc(chunkRef);
          if (snap.exists()) {
            const prevData = snap.data();
            if (
              prevData &&
              prevData.revisionId &&
              prevData.revisionId !== part.revisionId
            ) {
              const prevDocKey = sanitizeId(`prev_${part.partDocKey}`).slice(
                0,
                96
              );
              const prevRef = doc(
                db,
                'users',
                uid,
                'worlds',
                worldId,
                'chunks',
                prevDocKey
              );
              const writePrevPromise = setDoc(prevRef, {
                chunkKey: prevDocKey,
                worldId,
                ownerId: uid,
                layer: prevData.layer || part.layer,
                partIndex: Number(prevData.partIndex || 0),
                totalParts: Number(prevData.totalParts || 1),
                hash: String(prevData.hash || part.hash),
                sizeBytes: Number(prevData.sizeBytes || 0),
                storagePath: String(prevData.storagePath || part.storagePath),
                revisionId: String(prevData.revisionId || 'rev_prev'),
                chunkData: prevData.chunkData || chunkDataMap,
                clientUpdatedAt: nowMs,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }).catch(() =>
                updateDoc(prevRef, {
                  partIndex: Number(prevData.partIndex || 0),
                  totalParts: Number(prevData.totalParts || 1),
                  hash: String(prevData.hash || part.hash),
                  sizeBytes: Number(prevData.sizeBytes || 0),
                  storagePath: String(prevData.storagePath || part.storagePath),
                  revisionId: String(prevData.revisionId || 'rev_prev'),
                  chunkData: prevData.chunkData || chunkDataMap,
                  clientUpdatedAt: nowMs,
                  updatedAt: serverTimestamp(),
                }).catch(() => {})
              );
              await Promise.all([
                writePrevPromise,
                setDoc(chunkRef, createPayload).catch(() =>
                  updateDoc(chunkRef, updatePayload)
                ),
              ]);
              onBytesProgress?.(part.sizeBytes);
              return storedInFirebaseStorage
                ? 'firebase_storage'
                : 'hybrid_segmented';
            }
          }
        } catch {
          // Non-fatal backup read; proceed with direct update/create below
        }
      }

      try {
        await setDoc(chunkRef, createPayload);
        existingChunkPartIds.add(part.partDocKey);
      } catch {
        try {
          await updateDoc(chunkRef, updatePayload);
          existingChunkPartIds.add(part.partDocKey);
        } catch (err2) {
          handleFirestoreError(err2, OperationType.UPDATE, chunkDocPath);
        }
      }
    }

    onBytesProgress?.(part.sizeBytes);
    return storedInFirebaseStorage ? 'firebase_storage' : 'hybrid_segmented';
  }

  /**
   * Builds and uploads the versioned Manifest (`manifest_active` and copy-on-write `prev_manifest_active`)
   * so the world's chunk index is always recoverable and verifiable.
   */
  private async uploadWorldManifestParts(
    uid: string,
    worldId: string,
    manifest: CloudWorldManifest,
    existingChunkPartIds: Set<string>,
    worldAlreadyExistsInCloud: boolean
  ): Promise<void> {
    const serializedManifest = JSON.stringify(manifest);
    const slices = splitStringIntoParts(
      serializedManifest,
      MAX_CLOUD_PART_BYTES
    );

    for (let i = 0; i < slices.length; i++) {
      const partDocKey =
        slices.length === 1 ? 'manifest_active' : `manifest_active_p${i}`;
      const part: CloudPartUnit = {
        partDocKey,
        logicalKey: 'manifest_active',
        layer: 'manifest',
        partIndex: i,
        totalParts: slices.length,
        hash: computeDeterministicHash256(slices[i]),
        sizeBytes: slices[i].length,
        storagePath: `users/${uid}/worlds/${worldId}/revisions/${manifest.revisionId}/${partDocKey}.json`,
        revisionId: manifest.revisionId,
        serializedSlice: slices[i],
      };
      await this.uploadSinglePartUnit(
        uid,
        worldId,
        part,
        existingChunkPartIds,
        worldAlreadyExistsInCloud
      );
    }
  }

  /**
   * 6-Step Atomic Incremental World Publish:
   * - Case A (Already Synced & Unchanged): Immediately recognizes matching `manifestHash` / `contentHash`,
   *   transfers 0 chunks, creates no new revision, and completes in < 5ms.
   * - Case B (Synced with Local Changes): Identifies only modified chunks via deterministic 256-bit hashes,
   *   uploads only dirty chunks + `entities_state` + `manifest_active`, and commits the new revision atomically.
   * - Case C (New Local World): Uploads all chunks with high concurrency (1 single write per chunk) and commits metadata.
   */
  public async publishWorldIncremental(
    saveData: WorldSaveData,
    uid: string,
    legacyUid: string,
    onProgress?: (progress: CloudTransferProgress) => void,
    options?: {
      forceFullUpload?: boolean;
      simulateInterruptAfterChunks?: number;
    }
  ): Promise<{
    ok: boolean;
    worldId: string;
    revisionId: string;
    manifestHash: string;
    contentHash: string;
    chunksUploaded: number;
    unchangedChunksSkipped: number;
    bytesTransferred: number;
    totalWorldBytes: number;
    durationMs: number;
    noNewRevisionCreated: boolean;
    telemetry: CloudPublishTelemetry;
  }> {
    const startTime = Date.now();
    const cleanUid = sanitizeId(uid);
    const worldId = sanitizeId(
      saveData.metadata?.id || `world_${Date.now()}`
    );
    const worldName = saveData.metadata?.name || 'Fronteira Selvagem';

    // Read existing metadata document in Firestore (if any) to get previousRevisionId & cloud hashes
    const worldPath = `users/${cleanUid}/worlds/${worldId}`;
    const worldRef = doc(db, 'users', cleanUid, 'worlds', worldId);
    let existingWorldSnap;
    try {
      existingWorldSnap = await getDoc(worldRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, worldPath);
    }

    const worldAlreadyExistsInCloud = Boolean(existingWorldSnap?.exists());
    const existingWorldData = worldAlreadyExistsInCloud
      ? existingWorldSnap!.data()
      : null;
    const previousRevisionId = String(
      existingWorldData?.activeRevisionId || ''
    );

    // Step 1: Decompose world & compute deterministic hashes
    const decomposed = decomposeWorldIntoCloudUnits(
      saveData,
      cleanUid,
      previousRevisionId,
      legacyUid
    );

    // Populate known cloud hashes from:
    // (1) local hash index cache,
    // (2) `existingWorldData.chunkIndexSummary.chunkHashesCompact` (0 extra Firestore reads!),
    // (3) `manifest_active` doc (1 single read fallback for very large worlds if cache is empty).
    const knownCloudHashes: Record<string, string> = options?.forceFullUpload
      ? {}
      : loadLocalCloudHashIndex(cleanUid, worldId);

    const existingChunkPartIds = new Set<string>();

    if (!options?.forceFullUpload && existingWorldData) {
      const compactHashesStr =
        existingWorldData.chunkIndexSummary?.chunkHashesCompact;
      if (
        typeof compactHashesStr === 'string' &&
        compactHashesStr.length > 2
      ) {
        try {
          const parsedCloudHashes = JSON.parse(compactHashesStr) as Record<
            string,
            string
          >;
          if (parsedCloudHashes && typeof parsedCloudHashes === 'object') {
            for (const [k, h] of Object.entries(parsedCloudHashes)) {
              if (typeof h === 'string') {
                knownCloudHashes[k] = h;
                existingChunkPartIds.add(sanitizeId(k));
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (existingWorldData.chunkIndexSummary?.entitiesHash) {
        existingChunkPartIds.add('entities_state');
      }
      existingChunkPartIds.add('manifest_active');
    }

    // Check Case A: Already synced in v2 and 0 changes in manifestHash or contentHash!
    const cloudManifestHash = String(
      existingWorldData?.checksum ||
        existingWorldData?.chunkIndexSummary?.manifestHash ||
        ''
    );
    const cloudContentHash = String(
      existingWorldData?.chunkIndexSummary?.contentHash || ''
    );
    const isAlreadySyncedAndUnchanged =
      !options?.forceFullUpload &&
      worldAlreadyExistsInCloud &&
      Number(existingWorldData?.storageVersion) === 2 &&
      Boolean(previousRevisionId) &&
      ((cloudManifestHash &&
        cloudManifestHash === decomposed.manifest.manifestHash) ||
        (cloudContentHash && cloudContentHash === decomposed.contentHash));

    if (isAlreadySyncedAndUnchanged) {
      const allHashes: Record<string, string> = {};
      for (const [logicalKey, unit] of decomposed.allLogicalUnits.entries()) {
        allHashes[logicalKey] = unit.descriptor.hash;
      }
      saveLocalCloudHashIndex(cleanUid, worldId, allHashes);
      await persistentUploadQueue.clearQueue(cleanUid, worldId);

      const totalDurationMs = Math.max(1, Date.now() - startTime);
      const telemetry: CloudPublishTelemetry = {
        preparationMs: decomposed.preparationMs,
        hashingMs: decomposed.hashingMs,
        serializationMs: decomposed.serializationMs,
        uploadMs: 0,
        verificationMs: 0,
        publishMs: 0,
        totalDurationMs,
        chunksAnalyzed: decomposed.allLogicalUnits.size,
        chunksUploaded: 0,
        unchangedChunksSkipped: decomposed.allLogicalUnits.size,
        bytesTransferred: 0,
        totalWorldBytes: decomposed.totalWorldBytes,
        noNewRevisionCreated: true,
      };

      onProgress?.({
        phase: 'COMPLETED',
        worldId,
        worldName,
        revisionId: previousRevisionId,
        chunksUploaded: 0,
        chunksPending: 0,
        chunksTotal: 0,
        unchangedChunksSkipped: decomposed.allLogicalUnits.size,
        bytesTransferred: 0,
        totalBytesToTransfer: 0,
        totalWorldBytes: decomposed.totalWorldBytes,
        transferSpeedBytesPerSec: 0,
        activeConcurrency: 0,
        maxConcurrency: this.maxConcurrency,
        canResume: false,
        lastError: null,
        storageBackendUsed: 'hybrid_segmented',
        telemetry,
      });

      return {
        ok: true,
        worldId,
        revisionId: previousRevisionId,
        manifestHash: decomposed.manifest.manifestHash,
        contentHash: decomposed.contentHash,
        chunksUploaded: 0,
        unchangedChunksSkipped: decomposed.allLogicalUnits.size,
        bytesTransferred: 0,
        totalWorldBytes: decomposed.totalWorldBytes,
        durationMs: totalDurationMs,
        noNewRevisionCreated: true,
        telemetry,
      };
    }

    // Check if there is an interrupted upload queue in IndexedDB for this world
    const persistedQueue = await persistentUploadQueue.loadQueue(
      cleanUid,
      worldId
    );
    const completedPartKeysFromQueue = new Set<string>(
      persistedQueue?.completedPartDocKeys || []
    );
    const completedLogicalHashesFromQueue =
      persistedQueue?.completedLogicalHashes || {};

    // Fallback for huge worlds (>1,200 chunks) when local hash cache is cold: read `manifest_active` (1 doc read)
    // instead of scanning the entire chunks collection!
    if (
      worldAlreadyExistsInCloud &&
      Object.keys(knownCloudHashes).length === 0 &&
      !options?.forceFullUpload
    ) {
      try {
        const manifestDocRef = doc(
          db,
          'users',
          cleanUid,
          'worlds',
          worldId,
          'chunks',
          'manifest_active'
        );
        const manifestSnap = await getDoc(manifestDocRef);
        if (manifestSnap.exists()) {
          const mData = manifestSnap.data();
          const inlineSlice = String(mData?.chunkData?.inlineSlice || '');
          if (inlineSlice) {
            const parsedManifest = JSON.parse(
              inlineSlice
            ) as CloudWorldManifest;
            if (parsedManifest?.entitiesDescriptor?.hash) {
              knownCloudHashes.entities_state =
                parsedManifest.entitiesDescriptor.hash;
              for (const pk of parsedManifest.entitiesDescriptor.partKeys || []) {
                existingChunkPartIds.add(pk);
              }
            }
            for (const [lk, desc] of Object.entries(
              parsedManifest?.chunks || {}
            )) {
              if (desc?.hash) {
                knownCloudHashes[lk] = desc.hash;
                for (const pk of desc.partKeys || []) {
                  existingChunkPartIds.add(pk);
                }
              }
            }
          }
        }
      } catch {
        // ignore fallback read error
      }
    }

    const partsToUpload: CloudPartUnit[] = [];
    let unchangedChunksSkipped = 0;

    for (const [logicalKey, unit] of decomposed.allLogicalUnits.entries()) {
      const targetHash = unit.descriptor.hash;
      const alreadyInCloud = knownCloudHashes[logicalKey] === targetHash;
      const alreadyInResumedQueue =
        completedLogicalHashesFromQueue[logicalKey] === targetHash;

      if (alreadyInCloud || alreadyInResumedQueue) {
        unchangedChunksSkipped++;
        for (const p of unit.parts) {
          existingChunkPartIds.add(p.partDocKey);
        }
        continue;
      }

      if (knownCloudHashes[logicalKey]) {
        for (const p of unit.parts) {
          existingChunkPartIds.add(p.partDocKey);
        }
      }

      for (const part of unit.parts) {
        if (
          completedPartKeysFromQueue.has(part.partDocKey) &&
          completedLogicalHashesFromQueue[part.partDocKey] === part.hash
        ) {
          existingChunkPartIds.add(part.partDocKey);
          continue;
        }
        partsToUpload.push(part);
      }
    }

    const totalBytesToTransfer = partsToUpload.reduce(
      (acc, p) => acc + p.sizeBytes,
      0
    );
    let bytesTransferred = 0;
    let chunksUploaded = 0;
    let storageBackendUsed:
      | 'firebase_storage'
      | 'hybrid_segmented'
      | 'server_storage' = 'hybrid_segmented';

    let uploadMs = 0;
    let verificationMs = 0;
    let publishMs = 0;

    const buildTelemetry = (noNewRev = false): CloudPublishTelemetry => ({
      preparationMs: decomposed.preparationMs,
      hashingMs: decomposed.hashingMs,
      serializationMs: decomposed.serializationMs,
      uploadMs,
      verificationMs,
      publishMs,
      totalDurationMs: Math.max(1, Date.now() - startTime),
      chunksAnalyzed: decomposed.allLogicalUnits.size,
      chunksUploaded,
      unchangedChunksSkipped,
      bytesTransferred,
      totalWorldBytes: decomposed.totalWorldBytes,
      noNewRevisionCreated: noNewRev,
    });

    const emitProgress = (
      phase: CloudTransferProgress['phase'],
      lastError: string | null = null,
      noNewRev = false
    ) => {
      if (!onProgress) return;
      const elapsedSec = Math.max(0.05, (Date.now() - startTime) / 1000);
      onProgress({
        phase,
        worldId,
        worldName,
        revisionId: decomposed.revisionId,
        chunksUploaded,
        chunksPending: Math.max(0, partsToUpload.length - chunksUploaded),
        chunksTotal: partsToUpload.length,
        unchangedChunksSkipped,
        bytesTransferred,
        totalBytesToTransfer,
        totalWorldBytes: decomposed.totalWorldBytes,
        transferSpeedBytesPerSec: Math.round(bytesTransferred / elapsedSec),
        activeConcurrency: Math.min(
          this.maxConcurrency,
          Math.max(0, partsToUpload.length - chunksUploaded)
        ),
        maxConcurrency: this.maxConcurrency,
        canResume: phase === 'PAUSED_INTERRUPTED' || phase === 'ERROR',
        lastError,
        storageBackendUsed,
        telemetry: buildTelemetry(noNewRev),
      });
    };

    emitProgress('IDENTIFYING_CHANGES');

    // Persist initial queue before starting transfers
    const queueRecord: PersistedQueueRecord = {
      queueKey: `${cleanUid}__${worldId}`,
      uid: cleanUid,
      worldId,
      worldName,
      revisionId: decomposed.revisionId,
      createdAt: startTime,
      completedPartDocKeys: Array.from(completedPartKeysFromQueue),
      completedLogicalHashes: { ...completedLogicalHashesFromQueue },
      totalParts: partsToUpload.length,
      totalBytes: totalBytesToTransfer,
    };
    await persistentUploadQueue.saveQueue(queueRecord);

    // Step 2: Upload only modified chunks & entity parts with concurrency & backoff
    emitProgress('UPLOADING_CHUNKS');
    const uploadStart = Date.now();

    try {
      await runWithConcurrencyAndRetry(
        partsToUpload,
        this.maxConcurrency,
        async (part) => {
          if (
            options?.simulateInterruptAfterChunks !== undefined &&
            chunksUploaded >= options.simulateInterruptAfterChunks
          ) {
            throw new Error(
              'SIMULATED_NETWORK_INTERRUPT: Transferência interrompida para teste de retomada.'
            );
          }

          const backend = await this.uploadSinglePartUnit(
            cleanUid,
            worldId,
            part,
            existingChunkPartIds,
            worldAlreadyExistsInCloud,
            (delta) => {
              bytesTransferred += delta;
            }
          );
          storageBackendUsed = backend;
          chunksUploaded++;

          queueRecord.completedPartDocKeys.push(part.partDocKey);
          queueRecord.completedLogicalHashes[part.partDocKey] = part.hash;
          if (part.totalParts === 1) {
            queueRecord.completedLogicalHashes[part.logicalKey] = part.hash;
          }
          await persistentUploadQueue.saveQueue(queueRecord);
          uploadMs = Date.now() - uploadStart;
          emitProgress('UPLOADING_CHUNKS');
        }
      );
      uploadMs = Date.now() - uploadStart;
    } catch (err: any) {
      uploadMs = Date.now() - uploadStart;
      const msg =
        err?.message || 'Transferência interrompida. Você pode retomar o envio.';
      emitProgress('PAUSED_INTERRUPTED', msg);
      throw err;
    }

    // Step 3 & Step 4: Confirm all uploads completed & verify integrity
    const verifyStart = Date.now();
    emitProgress('VERIFYING_INTEGRITY');
    if (chunksUploaded !== partsToUpload.length) {
      const integrityErr = `Falha na verificação de contagem de partes: ${chunksUploaded}/${partsToUpload.length}.`;
      emitProgress('ERROR', integrityErr);
      throw new Error(integrityErr);
    }

    // Spot-check integrity hash on the entities state & manifest
    const entitiesUnit = decomposed.allLogicalUnits.get('entities_state');
    if (entitiesUnit && entitiesUnit.parts.length > 0) {
      const recomputedSliceHash = computeDeterministicHash256(
        entitiesUnit.parts[0].serializedSlice
      );
      if (
        entitiesUnit.parts.length === 1 &&
        recomputedSliceHash !== entitiesUnit.descriptor.hash
      ) {
        throw new Error('Falha de integridade por hash no segmento de entidades.');
      }
    }
    verificationMs = Date.now() - verifyStart;

    // Upload the versioned manifest (`manifest_active`)
    const publishStart = Date.now();
    emitProgress('COMMITTING_MANIFEST');
    await this.uploadWorldManifestParts(
      cleanUid,
      worldId,
      decomposed.manifest,
      existingChunkPartIds,
      worldAlreadyExistsInCloud
    );

    // Step 5: Atomically commit the lightweight metadata document `/users/{uid}/worlds/{worldId}` in Firestore
    // Using resilient setDoc <-> updateDoc fallback so it succeeds whether the world doc is new or existing.
    const finalDocFields: Record<string, unknown> = {
      ...decomposed.metadataDocFields,
      storageBackend: storageBackendUsed,
    };

    const createWorldPayload = {
      ...finalDocFields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const {
      worldId: _w,
      ownerId: _o,
      ...mutableFields
    } = finalDocFields;
    const updateWorldPayload: Record<string, unknown> = {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    };
    if (existingWorldData && 'savePayload' in existingWorldData) {
      updateWorldPayload.savePayload = deleteField();
    }

    if (!worldAlreadyExistsInCloud) {
      try {
        await setDoc(worldRef, createWorldPayload);
      } catch {
        try {
          await updateDoc(worldRef, updateWorldPayload);
        } catch (err2) {
          handleFirestoreError(err2, OperationType.CREATE, worldPath);
        }
      }
    } else {
      try {
        await updateDoc(worldRef, updateWorldPayload);
      } catch {
        try {
          await setDoc(worldRef, createWorldPayload);
        } catch (err2) {
          handleFirestoreError(err2, OperationType.UPDATE, worldPath);
        }
      }
    }
    publishMs = Date.now() - publishStart;

    // Step 6: Update local hash index and clear persistent upload queue
    const updatedHashIndex: Record<string, string> = {};
    for (const [logicalKey, unit] of decomposed.allLogicalUnits.entries()) {
      updatedHashIndex[logicalKey] = unit.descriptor.hash;
    }
    saveLocalCloudHashIndex(cleanUid, worldId, updatedHashIndex);
    await persistentUploadQueue.clearQueue(cleanUid, worldId);

    const finalTelemetry = buildTelemetry(false);
    emitProgress('COMPLETED', null, false);

    return {
      ok: true,
      worldId,
      revisionId: decomposed.revisionId,
      manifestHash: decomposed.manifest.manifestHash,
      contentHash: decomposed.contentHash,
      chunksUploaded,
      unchangedChunksSkipped,
      bytesTransferred,
      totalWorldBytes: decomposed.totalWorldBytes,
      durationMs: finalTelemetry.totalDurationMs,
      noNewRevisionCreated: false,
      telemetry: finalTelemetry,
    };
  }

  /**
   * Reconstructs a full WorldSaveData from Cloud Storage / Segmented Chunks,
   * verifying hashes on every downloaded chunk and part, and restoring lineage/copy metadata.
   * Includes self-healing recovery from `prev_manifest_active` or direct chunk documents if needed.
   */
  public async downloadAndReconstructWorld(
    uid: string,
    worldId: string,
    onProgress?: (progress: CloudTransferProgress) => void,
    targetDb: Firestore = db
  ): Promise<WorldSaveData | null> {
    const cleanUid = sanitizeId(uid);
    const cleanWorldId = sanitizeId(worldId);
    const worldPath = `users/${cleanUid}/worlds/${cleanWorldId}`;
    const worldRef = doc(targetDb, 'users', cleanUid, 'worlds', cleanWorldId);

    let worldSnap;
    try {
      worldSnap = await getDoc(worldRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, worldPath);
    }

    if (!worldSnap.exists()) return null;
    const worldDoc = worldSnap.data();

    // Backward-compatible path: if this cloud world is still in legacy v1 format (inline savePayload), return it directly
    if (worldDoc.savePayload && typeof worldDoc.savePayload === 'object') {
      const migrated = migrateSaveData(worldDoc.savePayload as WorldSaveData);
      migrated.player.persistentPlayerId = cleanUid;
      return migrated;
    }

    // v2 Hybrid Architecture: Fetch all chunk/part documents for this world
    const chunksPath = `users/${cleanUid}/worlds/${cleanWorldId}/chunks`;
    const chunksCol = collection(
      targetDb,
      'users',
      cleanUid,
      'worlds',
      cleanWorldId,
      'chunks'
    );
    const q = query(chunksCol, where('ownerId', '==', cleanUid));

    let chunkDocsSnap;
    try {
      chunkDocsSnap = await getDocs(q);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, chunksPath);
    }

    const partsByKey = new Map<
      string,
      {
        partIndex: number;
        totalParts: number;
        hash: string;
        layer: string;
        logicalKey: string;
        storagePath: string;
        inlineSlice: string;
        storedInBucket: boolean;
      }
    >();

    for (const d of chunkDocsSnap.docs) {
      const data = d.data();
      partsByKey.set(d.id, {
        partIndex: Number(data.partIndex || 0),
        totalParts: Number(data.totalParts || 1),
        hash: String(data.hash || ''),
        layer: String(data.layer || 'surface'),
        logicalKey: String(data.chunkData?.logicalKey || d.id),
        storagePath: String(data.storagePath || ''),
        inlineSlice: String(data.chunkData?.inlineSlice ?? ''),
        storedInBucket: Boolean(data.chunkData?.storedInBucket),
      });
    }

    const resolvePartContent = async (partKey: string): Promise<string> => {
      const entry = partsByKey.get(partKey);
      if (!entry) {
        throw new Error(`Parte ausente na nuvem: ${partKey}`);
      }
      let content = entry.inlineSlice;
      if (!content && entry.storedInBucket && entry.storagePath) {
        try {
          const bytes = await getBytes(storageRef(storage, entry.storagePath));
          content = new TextDecoder().decode(bytes);
        } catch {
          // fall through to API proxy fallback
        }
      }
      if (
        !content &&
        entry.storagePath &&
        typeof window !== 'undefined' &&
        auth.currentUser
      ) {
        try {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch(
            `/api/storage/object?objectPath=${encodeURIComponent(entry.storagePath)}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (res.ok) {
            const json = await res.json();
            content = String(json.content || '');
          }
        } catch {
          // ignore
        }
      }
      return content;
    };

    // 1. Reassemble manifest_active (with automatic fallback to prev_manifest_active)
    let manifestPartKeys = partsByKey.get('manifest_active')
      ? ['manifest_active']
      : Array.from(partsByKey.keys())
          .filter((k) => k.startsWith('manifest_active_p'))
          .sort(
            (a, b) =>
              (partsByKey.get(a)?.partIndex || 0) -
              (partsByKey.get(b)?.partIndex || 0)
          );

    if (manifestPartKeys.length === 0 && partsByKey.get('prev_manifest_active')) {
      manifestPartKeys = ['prev_manifest_active'];
    }

    let manifest: CloudWorldManifest | null = null;
    if (manifestPartKeys.length > 0) {
      try {
        let manifestJsonStr = '';
        for (const pk of manifestPartKeys) {
          manifestJsonStr += await resolvePartContent(pk);
        }
        if (manifestJsonStr) {
          manifest = JSON.parse(manifestJsonStr) as CloudWorldManifest;
        }
      } catch {
        manifest = null;
      }
    }

    // Self-healing fallback: if manifest_active was not found, reconstruct a synthetic manifest from `entities_state` and chunk docs
    if (!manifest) {
      if (!partsByKey.has('entities_state')) {
        return null;
      }
      const entPart = partsByKey.get('entities_state')!;
      const synthChunks: Record<string, CloudChunkDescriptor> = {};
      for (const [docKey, partInfo] of partsByKey.entries()) {
        if (
          docKey === 'entities_state' ||
          docKey.startsWith('manifest_') ||
          docKey.startsWith('prev_')
        ) {
          continue;
        }
        if (
          partInfo.layer === 'surface' ||
          partInfo.layer === 'underground'
        ) {
          const prefix = `${partInfo.layer}_`;
          const rawCoord = docKey.startsWith(prefix)
            ? docKey.slice(prefix.length).replace(/_/g, ',')
            : docKey;
          synthChunks[docKey] = {
            logicalKey: docKey,
            layer: partInfo.layer as 'surface' | 'underground',
            rawCoordinateKey: rawCoord,
            hash: partInfo.hash,
            sizeBytes: partInfo.inlineSlice.length,
            partsCount: 1,
            partKeys: [docKey],
            storagePaths: [partInfo.storagePath],
            updatedAt: Date.now(),
          };
        }
      }
      manifest = {
        manifestVersion: 2,
        worldId: cleanWorldId,
        ownerId: cleanUid,
        revisionId: String(worldDoc.activeRevisionId || 'rev_recovered'),
        previousRevisionId: String(worldDoc.previousRevisionId || ''),
        createdAtMs: Date.now(),
        totalWorldBytes: Number(worldDoc.totalBytes || 0),
        totalChunksCount: Object.keys(synthChunks).length,
        manifestHash: String(worldDoc.checksum || ''),
        entitiesDescriptor: {
          logicalKey: 'entities_state',
          layer: 'entities',
          rawCoordinateKey: 'entities_state',
          hash: entPart.hash,
          sizeBytes: entPart.inlineSlice.length,
          partsCount: 1,
          partKeys: ['entities_state'],
          storagePaths: [entPart.storagePath],
          updatedAt: Date.now(),
        },
        chunks: synthChunks,
      };
    }

    // 2. Reassemble Entities State
    let entitiesJsonStr = '';
    for (const pk of manifest.entitiesDescriptor.partKeys) {
      entitiesJsonStr += await resolvePartContent(pk);
    }
    if (
      !verifyCloudPayloadHash(entitiesJsonStr, manifest.entitiesDescriptor.hash)
    ) {
      throw new Error(
        `Verificação de integridade falhou para o estado do jogador/entidades do mundo ${cleanWorldId}.`
      );
    }
    const entitiesObj = JSON.parse(entitiesJsonStr);

    // 3. Reassemble Surface and Underground Chunks
    const surfaceChunks: Record<string, ChunkData> = {};
    const undergroundChunks: Record<string, ChunkData> = {};
    const chunkEntries = Object.values(manifest.chunks || {});
    let downloadedChunks = 0;
    let downloadedBytes = entitiesJsonStr.length;

    for (const descriptor of chunkEntries) {
      let chunkJsonStr = '';
      for (const pk of descriptor.partKeys) {
        chunkJsonStr += await resolvePartContent(pk);
      }
      if (!verifyCloudPayloadHash(chunkJsonStr, descriptor.hash)) {
        throw new Error(
          `Checksum inválido no chunk ${descriptor.logicalKey} (esperado ${descriptor.hash}).`
        );
      }
      const parsedChunk = JSON.parse(chunkJsonStr) as ChunkData;
      if (descriptor.layer === 'underground') {
        undergroundChunks[descriptor.rawCoordinateKey] = parsedChunk;
      } else {
        surfaceChunks[descriptor.rawCoordinateKey] = parsedChunk;
      }
      downloadedChunks++;
      downloadedBytes += chunkJsonStr.length;

      onProgress?.({
        phase: 'DOWNLOADING_CHUNKS',
        worldId: cleanWorldId,
        worldName: String(worldDoc.name || 'Mundo'),
        revisionId: manifest.revisionId,
        chunksUploaded: downloadedChunks,
        chunksPending: chunkEntries.length - downloadedChunks,
        chunksTotal: chunkEntries.length,
        unchangedChunksSkipped: 0,
        bytesTransferred: downloadedBytes,
        totalBytesToTransfer: manifest.totalWorldBytes || downloadedBytes,
        totalWorldBytes: manifest.totalWorldBytes || downloadedBytes,
        transferSpeedBytesPerSec: 0,
        activeConcurrency: 1,
        maxConcurrency: this.maxConcurrency,
        canResume: false,
        lastError: null,
        storageBackendUsed: 'hybrid_segmented',
      });
    }

    onProgress?.({
      phase: 'VERIFYING_INTEGRITY',
      worldId: cleanWorldId,
      worldName: String(worldDoc.name || 'Mundo'),
      revisionId: manifest.revisionId,
      chunksUploaded: chunkEntries.length,
      chunksPending: 0,
      chunksTotal: chunkEntries.length,
      unchangedChunksSkipped: 0,
      bytesTransferred: downloadedBytes,
      totalBytesToTransfer: manifest.totalWorldBytes || downloadedBytes,
      totalWorldBytes: manifest.totalWorldBytes || downloadedBytes,
      transferSpeedBytesPerSec: 0,
      activeConcurrency: 1,
      maxConcurrency: this.maxConcurrency,
      canResume: false,
      lastError: null,
      storageBackendUsed: 'hybrid_segmented',
    });

    // Cache the verified hashes locally so future saves only upload modified chunks
    const verifiedHashes: Record<string, string> = {
      entities_state: manifest.entitiesDescriptor.hash,
    };
    for (const descriptor of chunkEntries) {
      verifiedHashes[descriptor.logicalKey] = descriptor.hash;
    }
    saveLocalCloudHashIndex(cleanUid, cleanWorldId, verifiedHashes);

    onProgress?.({
      phase: 'RECONSTRUCTING_WORLD',
      worldId: cleanWorldId,
      worldName: String(worldDoc.name || 'Mundo'),
      revisionId: manifest.revisionId,
      chunksUploaded: chunkEntries.length,
      chunksPending: 0,
      chunksTotal: chunkEntries.length,
      unchangedChunksSkipped: 0,
      bytesTransferred: downloadedBytes,
      totalBytesToTransfer: manifest.totalWorldBytes || downloadedBytes,
      totalWorldBytes: manifest.totalWorldBytes || downloadedBytes,
      transferSpeedBytesPerSec: 0,
      activeConcurrency: 1,
      maxConcurrency: this.maxConcurrency,
      canResume: false,
      lastError: null,
      storageBackendUsed: 'hybrid_segmented',
    });

    const summary = worldDoc.chunkIndexSummary || {};
    const resolvedOriginId = String(
      summary.originWorldId ||
        entitiesObj.metadata?.originWorldId ||
        cleanWorldId
    );
    const resolvedIsCopy = Boolean(
      summary.isCopy ?? entitiesObj.metadata?.isCopy ?? false
    );
    const resolvedCopyNum =
      typeof summary.copyNumber === 'number' && summary.copyNumber >= 1
        ? summary.copyNumber
        : typeof entitiesObj.metadata?.copyNumber === 'number' &&
          entitiesObj.metadata.copyNumber >= 1
        ? entitiesObj.metadata.copyNumber
        : null;
    const resolvedBaseName = String(
      summary.baseWorldName ||
        entitiesObj.metadata?.baseWorldName ||
        stripWorldCopySuffix(String(worldDoc.name || entitiesObj.metadata?.name || 'Fronteira Selvagem'))
    );

    const reconstructed: WorldSaveData = migrateSaveData({
      version: Number(entitiesObj.version || 3),
      metadata: {
        ...entitiesObj.metadata,
        id: cleanWorldId,
        instanceId: cleanWorldId,
        originWorldId: resolvedOriginId,
        parentInstanceId:
          summary.parentInstanceId ||
          entitiesObj.metadata?.parentInstanceId ||
          null,
        isCopy: resolvedIsCopy,
        copyNumber: resolvedIsCopy ? resolvedCopyNum : null,
        baseWorldName: resolvedBaseName,
        name: String(worldDoc.name || entitiesObj.metadata?.name || resolvedBaseName),
        updatedAt: Number(
          worldDoc.clientUpdatedAt || entitiesObj.metadata?.updatedAt || Date.now()
        ),
        lastSyncedRevisionId: String(
          worldDoc.activeRevisionId || manifest.revisionId || ''
        ),
        lastSyncedManifestHash: String(
          worldDoc.checksum || manifest.manifestHash || ''
        ),
        lastSyncedContentHash: String(
          summary.contentHash || manifest.contentHash || ''
        ),
        lastSyncedAt: Date.now(),
        syncPending: false,
      },
      player: entitiesObj.player,
      ...(entitiesObj.guestPlayers
        ? { guestPlayers: entitiesObj.guestPlayers }
        : {}),
      chunks: surfaceChunks,
      ...(Object.keys(undergroundChunks).length > 0
        ? { undergroundChunks }
        : {}),
      creatures: Array.isArray(entitiesObj.creatures)
        ? entitiesObj.creatures
        : [],
      droppedItems: Array.isArray(entitiesObj.droppedItems)
        ? entitiesObj.droppedItems
        : [],
      waypoints: Array.isArray(entitiesObj.waypoints)
        ? entitiesObj.waypoints
        : [],
      deathBags: Array.isArray(entitiesObj.deathBags)
        ? entitiesObj.deathBags
        : [],
    });

    reconstructed.player.persistentPlayerId = cleanUid;
    return reconstructed;
  }

  /**
   * Restores a world in Cloud Firestore to its previous revision (`previousRevisionId`)
   * using the copy-on-write `prev_*` chunk and manifest backups, then downloads and reconstructs it.
   */
  public async rollbackToPreviousRevision(
    uid: string,
    worldId: string
  ): Promise<WorldSaveData | null> {
    const cleanUid = sanitizeId(uid);
    const cleanWorldId = sanitizeId(worldId);
    const worldRef = doc(db, 'users', cleanUid, 'worlds', cleanWorldId);
    const worldSnap = await getDoc(worldRef);
    if (!worldSnap.exists()) return null;

    const worldData = worldSnap.data();
    const prevRevId = String(worldData.previousRevisionId || '');
    if (!prevRevId) return null;

    const chunksCol = collection(
      db,
      'users',
      cleanUid,
      'worlds',
      cleanWorldId,
      'chunks'
    );
    const q = query(chunksCol, where('ownerId', '==', cleanUid));
    const snap = await getDocs(q);

    const nowMs = Date.now();
    for (const d of snap.docs) {
      if (d.id.startsWith('prev_')) {
        const targetPartKey = d.id.slice('prev_'.length);
        const prevData = d.data();
        const targetRef = doc(
          db,
          'users',
          cleanUid,
          'worlds',
          cleanWorldId,
          'chunks',
          targetPartKey
        );
        await updateDoc(targetRef, {
          partIndex: prevData.partIndex,
          totalParts: prevData.totalParts,
          hash: prevData.hash,
          sizeBytes: prevData.sizeBytes,
          storagePath: prevData.storagePath,
          revisionId: prevData.revisionId,
          chunkData: prevData.chunkData,
          clientUpdatedAt: nowMs,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await updateDoc(worldRef, {
      activeRevisionId: prevRevId,
      previousRevisionId: '',
      updatedAt: serverTimestamp(),
    });

    return this.downloadAndReconstructWorld(cleanUid, cleanWorldId);
  }

  /**
   * Deletes a world metadata document and all its associated chunk documents in Cloud Firestore.
   */
  public async deleteWorldAndChunksFromCloud(
    uid: string,
    worldId: string
  ): Promise<void> {
    const cleanUid = sanitizeId(uid);
    const cleanWorldId = sanitizeId(worldId);

    const chunksPath = `users/${cleanUid}/worlds/${cleanWorldId}/chunks`;
    const chunksCol = collection(
      db,
      'users',
      cleanUid,
      'worlds',
      cleanWorldId,
      'chunks'
    );
    const q = query(chunksCol, where('ownerId', '==', cleanUid));

    try {
      const snap = await getDocs(q);
      await runWithConcurrencyAndRetry(
        snap.docs,
        this.maxConcurrency,
        async (d) => {
          await deleteDoc(d.ref);
        }
      );
    } catch {
      // ignore if empty
    }

    const worldPath = `users/${cleanUid}/worlds/${cleanWorldId}`;
    const worldRef = doc(db, 'users', cleanUid, 'worlds', cleanWorldId);
    try {
      const snap = await getDoc(worldRef);
      if (snap.exists()) {
        await deleteDoc(worldRef);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, worldPath);
    }

    await persistentUploadQueue.clearQueue(cleanUid, cleanWorldId);
  }
}

export const cloudWorldStorageEngine = new CloudWorldStorageEngine();
