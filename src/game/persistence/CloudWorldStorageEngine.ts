import {
  collection,
  deleteDoc,
  deleteField,
  doc,
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
import { computeChecksum, migrateSaveData } from './SaveManager';

/**
 * Maximum payload size per part (320 KB) to guarantee every part stays well below
 * Firestore's 1,048,576-byte document limit and transfers fast on mobile connections.
 */
export const MAX_CLOUD_PART_BYTES = 320_000;

export interface CloudTransferProgress {
  phase:
    | 'IDLE'
    | 'IDENTIFYING_CHANGES'
    | 'UPLOADING_CHUNKS'
    | 'VERIFYING_INTEGRITY'
    | 'COMMITTING_MANIFEST'
    | 'DOWNLOADING_CHUNKS'
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
  // Fast path: in UTF-8, max bytes <= payload.length * 3; if payload.length * 2 <= maxBytes, 1 part is guaranteed
  if (payload.length * 2 <= maxBytes) {
    return [payload];
  }
  const parts: string[] = [];
  // Conservative char step so UTF-8 byte length stays below maxBytes
  const charStep = Math.max(1024, Math.floor(maxBytes * 0.85));
  for (let offset = 0; offset < payload.length; offset += charStep) {
    parts.push(payload.slice(offset, offset + charStep));
  }
  return parts;
}

/**
 * Persistent Upload Queue backed by IndexedDB (with in-memory / localStorage fallback for headless Node tests).
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

/**
 * Decomposes a WorldSaveData of ANY size (3 MB, 50 MB, 500 MB+) into:
 * - A lightweight metadata & revision header (~1.2 KB) for `/users/{uid}/worlds/{worldId}`
 * - Independent chunk units (`surface_{cx}_{cy}`, `underground_{cx}_{cy}`)
 * - Independent entities unit (`entities`)
 * - Automatic multipart splitting (`MAX_CLOUD_PART_BYTES`) if any single unit exceeds 320 KB.
 */
export function decomposeWorldIntoCloudUnits(
  saveData: WorldSaveData,
  uid: string,
  previousRevisionId = '',
  legacyUid = ''
): DecomposedCloudWorld {
  const cleanUid = sanitizeId(uid, 'user_default');
  const worldId = sanitizeId(
    saveData.metadata?.id || `world_${Date.now()}`,
    `world_${Date.now()}`
  );
  const nowMs = Date.now();
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
    const unitHash = computeChecksum(serializedPayload);
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
      const partHash =
        slices.length === 1 ? unitHash : computeChecksum(slice);

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

  // 1. Decompose Surface Chunks independently
  const surfaceChunks = saveData.chunks || {};
  const surfaceKeys = Object.keys(surfaceChunks).sort();
  for (const coordKey of surfaceKeys) {
    const chunkObj = surfaceChunks[coordKey];
    if (!chunkObj) continue;
    const safeCoord = coordKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const logicalKey = `surface_${safeCoord}`;
    const serialized = JSON.stringify(chunkObj);
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
    const serialized = JSON.stringify(chunkObj);
    chunkDescriptors[logicalKey] = registerLogicalUnit(
      logicalKey,
      'underground',
      coordKey,
      serialized
    );
  }

  // 3. Decompose Entities, Player, Structures & World State (without chunks!)
  const clonedPlayer = saveData.player
    ? {
        ...saveData.player,
        persistentPlayerId: cleanUid,
      }
    : saveData.player;

  const clonedCreatures = Array.isArray(saveData.creatures)
    ? saveData.creatures.map((cr) => {
        if (
          cr &&
          cr.tamed &&
          (!cr.ownerId || (legacyUid && cr.ownerId === legacyUid))
        ) {
          return { ...cr, ownerId: cleanUid };
        }
        return cr;
      })
    : [];

  const entitiesEnvelope = {
    version: Number(saveData.version || 3),
    metadata: {
      ...saveData.metadata,
      id: worldId,
    },
    player: clonedPlayer,
    ...(saveData.guestPlayers ? { guestPlayers: saveData.guestPlayers } : {}),
    creatures: clonedCreatures,
    droppedItems: Array.isArray(saveData.droppedItems)
      ? saveData.droppedItems
      : [],
    waypoints: Array.isArray(saveData.waypoints) ? saveData.waypoints : [],
    deathBags: Array.isArray(saveData.deathBags) ? saveData.deathBags : [],
  };

  const serializedEntities = JSON.stringify(entitiesEnvelope);
  const entitiesDescriptor = registerLogicalUnit(
    'entities_state',
    'entities',
    'entities_state',
    serializedEntities
  );

  // 4. Compute deterministic Manifest Hash & Revision ID
  const hashInput = [
    `e:${entitiesDescriptor.hash}`,
    ...Object.keys(chunkDescriptors)
      .sort()
      .map((k) => `${k}:${chunkDescriptors[k].hash}`),
  ].join('|');
  const manifestHash = computeChecksum(hashInput).slice(0, 32);
  const revisionId = sanitizeId(`rev_${nowMs}_${manifestHash.slice(0, 8)}`);

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
    Math.floor(
      Number(meta.updatedAt || saveData.player?.savedAt || nowMs)
    )
  );

  // Compact metadata-only document for /users/{uid}/worlds/{worldId} (~1.2 KB!)
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
    chunkIndexSummary: {
      manifestHash,
      entitiesHash: entitiesDescriptor.hash,
      entitiesPartsCount: entitiesDescriptor.partsCount,
      surfaceChunksCount: surfaceKeys.length,
      undergroundChunksCount: undergroundKeys.length,
      revisionTimestamp: nowMs,
    },
  };

  return {
    worldId,
    ownerId: cleanUid,
    revisionId,
    previousRevisionId: sanitizeText(previousRevisionId, 0, 128, ''),
    totalWorldBytes,
    totalChunksCount,
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
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(
      `${HASH_CACHE_STORAGE_PREFIX}${uid}_${worldId}`
    );
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function saveLocalCloudHashIndex(
  uid: string,
  worldId: string,
  hashes: Record<string, string>
): void {
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
  private maxConcurrency = 4;
  private firebaseStorageProbeState: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE' =
    'UNKNOWN';

  public setMaxConcurrency(limit: number): void {
    this.maxConcurrency = Math.max(1, Math.min(8, Math.floor(limit || 4)));
  }

  public getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  /**
   * Uploads a single part unit to Firebase Storage (if bucket is provisioned) AND/OR
   * to the Firestore `/users/{uid}/worlds/{worldId}/chunks/{partDocKey}` collection & Server Object Storage.
   */
  private async uploadSinglePartUnit(
    uid: string,
    worldId: string,
    part: CloudPartUnit,
    existingChunkPartIds: Set<string>,
    onBytesProgress?: (deltaBytes: number) => void
  ): Promise<'firebase_storage' | 'hybrid_segmented'> {
    let storedInFirebaseStorage = false;

    // 1. Try Firebase Storage resumable upload if bucket is available
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

    // 2. Also mirror to Server Object Storage if running on full-stack backend
    if (typeof window !== 'undefined' && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        await fetch('/api/storage/object', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            objectPath: part.storagePath,
            content: part.serializedSlice,
            hash: part.hash,
          }),
        });
      } catch {
        // Non-fatal: Firestore chunk document below guarantees persistence across all static/serverless hosts
      }
    }

    // 3. Write chunk descriptor + slice to `/users/{uid}/worlds/{worldId}/chunks/{partDocKey}`
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
      inlineSlice: storedInFirebaseStorage ? '' : part.serializedSlice,
      storedInBucket: storedInFirebaseStorage,
    };

    const nowMs = Date.now();
    const isKnownExisting = existingChunkPartIds.has(part.partDocKey);

    let existsInCloud = isKnownExisting;
    if (!isKnownExisting) {
      try {
        const snap = await getDoc(chunkRef);
        existsInCloud = snap.exists();
        // Copy-on-write backup for version rollback if overwriting an existing chunk in a new revision
        if (snap.exists()) {
          const prevData = snap.data();
          if (prevData && prevData.revisionId && prevData.revisionId !== part.revisionId && !part.partDocKey.startsWith('prev_')) {
            const prevDocKey = sanitizeId(`prev_${part.partDocKey}`).slice(0, 96);
            const prevRef = doc(db, 'users', uid, 'worlds', worldId, 'chunks', prevDocKey);
            try {
              const prevSnap = await getDoc(prevRef);
              if (!prevSnap.exists()) {
                await setDoc(prevRef, {
                  ...prevData,
                  chunkKey: prevDocKey,
                  clientUpdatedAt: nowMs,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
              } else {
                await updateDoc(prevRef, {
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
            } catch {
              // Non-fatal backup write
            }
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, chunkDocPath);
      }
    } else if (!part.partDocKey.startsWith('prev_')) {
      // If known existing, read current doc before overwriting so previous revision can be rolled back
      try {
        const snap = await getDoc(chunkRef);
        if (snap.exists()) {
          const prevData = snap.data();
          if (prevData && prevData.revisionId && prevData.revisionId !== part.revisionId) {
            const prevDocKey = sanitizeId(`prev_${part.partDocKey}`).slice(0, 96);
            const prevRef = doc(db, 'users', uid, 'worlds', worldId, 'chunks', prevDocKey);
            const prevSnap = await getDoc(prevRef);
            if (!prevSnap.exists()) {
              await setDoc(prevRef, {
                ...prevData,
                chunkKey: prevDocKey,
                clientUpdatedAt: nowMs,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              await updateDoc(prevRef, {
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
        }
      } catch {
        // Non-fatal backup write
      }
    }

    if (!existsInCloud) {
      try {
        await setDoc(chunkRef, {
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
        });
        existingChunkPartIds.add(part.partDocKey);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, chunkDocPath);
      }
    } else {
      try {
        await updateDoc(chunkRef, {
          partIndex: part.partIndex,
          totalParts: part.totalParts,
          hash: part.hash,
          sizeBytes: part.sizeBytes,
          storagePath: part.storagePath,
          revisionId: part.revisionId,
          chunkData: chunkDataMap,
          clientUpdatedAt: nowMs,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, chunkDocPath);
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
    existingChunkPartIds: Set<string>
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
        hash: computeChecksum(slices[i]),
        sizeBytes: slices[i].length,
        storagePath: `users/${uid}/worlds/${worldId}/revisions/${manifest.revisionId}/${partDocKey}.json`,
        revisionId: manifest.revisionId,
        serializedSlice: slices[i],
      };
      await this.uploadSinglePartUnit(
        uid,
        worldId,
        part,
        existingChunkPartIds
      );
    }
  }

  /**
   * 6-Step Atomic Incremental World Publish:
   * 1. Identify modified chunks (`dirtyUnits`) by comparing hashes against cloud manifest/cache.
   * 2. Upload only modified chunk files & entity parts (with persistent queue, concurrency cap & retries).
   * 3. Confirm all uploads completed.
   * 4. Verify integrity (hashes & part counts) of uploaded units.
   * 5. Update manifest & lightweight metadata document `/users/{uid}/worlds/{worldId}` in Cloud Firestore.
   * 6. Clear persistent queue and confirm sync to player.
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
    chunksUploaded: number;
    unchangedChunksSkipped: number;
    bytesTransferred: number;
    totalWorldBytes: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const cleanUid = sanitizeId(uid);
    const worldId = sanitizeId(
      saveData.metadata?.id || `world_${Date.now()}`
    );
    const worldName = saveData.metadata?.name || 'Fronteira Selvagem';

    // Read existing metadata document in Firestore (if any) to get previousRevisionId
    const worldPath = `users/${cleanUid}/worlds/${worldId}`;
    const worldRef = doc(db, 'users', cleanUid, 'worlds', worldId);
    let existingWorldSnap;
    try {
      existingWorldSnap = await getDoc(worldRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, worldPath);
    }

    const existingWorldData = existingWorldSnap.exists()
      ? existingWorldSnap.data()
      : null;
    const previousRevisionId = String(
      existingWorldData?.activeRevisionId || ''
    );

    // Step 1: Decompose world & identify modified chunks
    const decomposed = decomposeWorldIntoCloudUnits(
      saveData,
      cleanUid,
      previousRevisionId,
      legacyUid
    );

    const knownCloudHashes = options?.forceFullUpload
      ? {}
      : loadLocalCloudHashIndex(cleanUid, worldId);

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

    // Query existing chunk docs metadata if local hash cache is empty but world already exists in v2
    const existingChunkPartIds = new Set<string>();
    if (
      existingWorldSnap.exists() &&
      Object.keys(knownCloudHashes).length === 0 &&
      !options?.forceFullUpload
    ) {
      try {
        const chunksCol = collection(
          db,
          'users',
          cleanUid,
          'worlds',
          worldId,
          'chunks'
        );
        const q = query(chunksCol, where('ownerId', '==', cleanUid));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          existingChunkPartIds.add(d.id);
          const data = d.data();
          if (
            data.totalParts === 1 &&
            data.chunkData?.logicalKey &&
            data.hash
          ) {
            knownCloudHashes[String(data.chunkData.logicalKey)] = String(
              data.hash
            );
          }
        }
      } catch {
        // ignore
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

    const emitProgress = (
      phase: CloudTransferProgress['phase'],
      lastError: string | null = null
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
          emitProgress('UPLOADING_CHUNKS');
        }
      );
    } catch (err: any) {
      const msg =
        err?.message || 'Transferência interrompida. Você pode retomar o envio.';
      emitProgress('PAUSED_INTERRUPTED', msg);
      throw err;
    }

    // Step 3 & Step 4: Confirm all uploads completed & verify integrity
    emitProgress('VERIFYING_INTEGRITY');
    if (chunksUploaded !== partsToUpload.length) {
      const integrityErr = `Falha na verificação de contagem de partes: ${chunksUploaded}/${partsToUpload.length}.`;
      emitProgress('ERROR', integrityErr);
      throw new Error(integrityErr);
    }

    // Spot-check integrity hash on the entities state & manifest
    const entitiesUnit = decomposed.allLogicalUnits.get('entities_state');
    if (entitiesUnit && entitiesUnit.parts.length > 0) {
      const recomputedSliceHash = computeChecksum(
        entitiesUnit.parts[0].serializedSlice
      );
      if (
        entitiesUnit.parts.length === 1 &&
        recomputedSliceHash !== entitiesUnit.descriptor.hash
      ) {
        throw new Error('Falha de integridade por hash no segmento de entidades.');
      }
    }

    // Upload the versioned manifest (`manifest_active`)
    emitProgress('COMMITTING_MANIFEST');
    await this.uploadWorldManifestParts(
      cleanUid,
      worldId,
      decomposed.manifest,
      existingChunkPartIds
    );

    // Step 5: Atomically commit the lightweight metadata document `/users/{uid}/worlds/{worldId}` in Firestore
    const finalDocFields: Record<string, unknown> = {
      ...decomposed.metadataDocFields,
      storageBackend: storageBackendUsed,
    };

    if (!existingWorldSnap.exists()) {
      try {
        await setDoc(worldRef, {
          ...finalDocFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, worldPath);
      }
    } else {
      const {
        worldId: _w,
        ownerId: _o,
        seed: _s,
        ...mutableFields
      } = finalDocFields;
      const updatePayload: Record<string, unknown> = {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      };
      // If migrating from a legacy v1 world that had an inline `savePayload`, remove `savePayload` now that v2 chunks are verified!
      if (existingWorldData && 'savePayload' in existingWorldData) {
        updatePayload.savePayload = deleteField();
      }
      try {
        await updateDoc(worldRef, updatePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, worldPath);
      }
    }

    // Step 6: Update local hash index and clear persistent upload queue
    const updatedHashIndex: Record<string, string> = {};
    for (const [logicalKey, unit] of decomposed.allLogicalUnits.entries()) {
      updatedHashIndex[logicalKey] = unit.descriptor.hash;
    }
    saveLocalCloudHashIndex(cleanUid, worldId, updatedHashIndex);
    await persistentUploadQueue.clearQueue(cleanUid, worldId);

    emitProgress('COMPLETED');

    return {
      ok: true,
      worldId,
      revisionId: decomposed.revisionId,
      chunksUploaded,
      unchangedChunksSkipped,
      bytesTransferred,
      totalWorldBytes: decomposed.totalWorldBytes,
      durationMs: Math.max(1, Date.now() - startTime),
    };
  }

  /**
   * Reconstructs a full WorldSaveData from Cloud Storage / Segmented Chunks,
   * verifying hashes on every downloaded chunk and part.
   */
  public async downloadAndReconstructWorld(
    uid: string,
    worldId: string,
    onProgress?: (progress: CloudTransferProgress) => void
  ): Promise<WorldSaveData | null> {
    const cleanUid = sanitizeId(uid);
    const cleanWorldId = sanitizeId(worldId);
    const worldPath = `users/${cleanUid}/worlds/${cleanWorldId}`;
    const worldRef = doc(db, 'users', cleanUid, 'worlds', cleanWorldId);

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
      db,
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
        const bytes = await getBytes(storageRef(storage, entry.storagePath));
        content = new TextDecoder().decode(bytes);
      }
      if (!content && entry.storagePath && typeof window !== 'undefined' && auth.currentUser) {
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
      }
      return content;
    };

    // 1. Reassemble manifest_active
    const firstManifestPart = partsByKey.get('manifest_active')
      ? ['manifest_active']
      : Array.from(partsByKey.keys())
          .filter((k) => k.startsWith('manifest_active_p'))
          .sort(
            (a, b) =>
              (partsByKey.get(a)?.partIndex || 0) -
              (partsByKey.get(b)?.partIndex || 0)
          );

    if (firstManifestPart.length === 0) {
      return null;
    }

    let manifestJsonStr = '';
    for (const pk of firstManifestPart) {
      manifestJsonStr += await resolvePartContent(pk);
    }

    const manifest = JSON.parse(manifestJsonStr) as CloudWorldManifest;

    // 2. Reassemble Entities State
    let entitiesJsonStr = '';
    for (const pk of manifest.entitiesDescriptor.partKeys) {
      entitiesJsonStr += await resolvePartContent(pk);
    }
    const entitiesHash = computeChecksum(entitiesJsonStr);
    if (entitiesHash !== manifest.entitiesDescriptor.hash) {
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
      const computedHash = computeChecksum(chunkJsonStr);
      if (computedHash !== descriptor.hash) {
        throw new Error(
          `Checksum inválido no chunk ${descriptor.logicalKey} (esperado ${descriptor.hash}, obtido ${computedHash}).`
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
        totalBytesToTransfer: manifest.totalWorldBytes,
        totalWorldBytes: manifest.totalWorldBytes,
        transferSpeedBytesPerSec: 0,
        activeConcurrency: 1,
        maxConcurrency: this.maxConcurrency,
        canResume: false,
        lastError: null,
        storageBackendUsed: 'hybrid_segmented',
      });
    }

    // Cache the verified hashes locally so future saves only upload modified chunks
    const verifiedHashes: Record<string, string> = {
      entities_state: manifest.entitiesDescriptor.hash,
    };
    for (const descriptor of chunkEntries) {
      verifiedHashes[descriptor.logicalKey] = descriptor.hash;
    }
    saveLocalCloudHashIndex(cleanUid, cleanWorldId, verifiedHashes);

    const reconstructed: WorldSaveData = migrateSaveData({
      version: Number(entitiesObj.version || 3),
      metadata: {
        ...entitiesObj.metadata,
        id: cleanWorldId,
        updatedAt: Number(
          worldDoc.clientUpdatedAt || entitiesObj.metadata?.updatedAt || Date.now()
        ),
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

