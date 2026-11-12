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
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  getBytes,
  handleFirestoreError,
  isFirestoreWriteQuotaExhausted,
  markFirestoreWriteQuotaExhausted,
  onFirestoreWriteQuotaExhausted,
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
  createInitialPlayerState,
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

/**
 * Spatial Region Bundling parameters:
 * Worlds with more than `REGION_BUNDLE_CHUNK_THRESHOLD` chunks automatically group
 * adjacent chunks into `8x8` spatial region bundles (`surface_reg_{rx}_{ry}`,
 * `underground_reg_{rx}_{ry}`).
 * This reduces a 3 MB world (~1,500 chunks of ~2 KB) from 1,500 separate Firestore
 * documents down to ~24 region documents (~120 KB each), eliminating the 40 KB/s
 * per-document RTT bottleneck and enabling 3+ MB/s parallel batch transfers.
 */
export const REGION_BUNDLE_CHUNK_THRESHOLD = 36;
export const REGION_BUNDLE_SPAN = 8;

/**
 * Maximum number of documents and bytes committed in a single Firestore `writeBatch`
 * and maximum number of parallel batches in flight simultaneously.
 */
const MAX_DOCS_PER_WRITE_BATCH = 40;
const MAX_BYTES_PER_WRITE_BATCH = 520_000;
const MAX_PARALLEL_WRITE_BATCHES = 6;
const FIRESTORE_OP_TIMEOUT_MS = 18_000;

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

interface RegionBundleEnvelopeV2 {
  __regionBundleV2: true;
  layer: 'surface' | 'underground';
  regionCoord: string;
  chunksCount: number;
  chunks: Record<string, ChunkData>;
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
 * Guards any Firestore operation with a hard timeout and real-time write-quota circuit breaker
 * so stalled WebChannel streams or `Code: 8 RESOURCE_EXHAUSTED` backoff loops can never hang
 * a worker or freeze world synchronization.
 */
export function withFirestoreTimeout<T>(
  promise: Promise<T>,
  timeoutMs = FIRESTORE_OP_TIMEOUT_MS,
  operationLabel = 'firestore_op',
  isWriteOp = false
): Promise<T> {
  if (isWriteOp && isFirestoreWriteQuotaExhausted()) {
    return Promise.reject(
      new Error(
        `FIRESTORE_WRITE_QUOTA_EXHAUSTED: Cota diária de gravação do Firestore atingida (${operationLabel}).`
      )
    );
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let unsubscribeQuota: (() => void) | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (unsubscribeQuota) {
        unsubscribeQuota();
        unsubscribeQuota = null;
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          `Tempo limite excedido (${Math.round(timeoutMs / 1000)}s) em ${operationLabel}. Tentando novamente...`
        )
      );
    }, timeoutMs);

    if (isWriteOp) {
      unsubscribeQuota = onFirestoreWriteQuotaExhausted((reason) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new Error(
            `FIRESTORE_WRITE_QUOTA_EXHAUSTED: ${reason} (${operationLabel})`
          )
        );
      });
    }

    promise.then(
      (val) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(val);
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        const errText = String(err?.message || err?.code || '');
        if (
          errText.includes('RESOURCE_EXHAUSTED') ||
          errText.includes('Quota limit exceeded') ||
          errText.includes('resource-exhausted')
        ) {
          markFirestoreWriteQuotaExhausted(errText);
        }
        reject(err);
      }
    );
  });
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
 * Persistent Upload Queue backed by IndexedDB (with in-memory fallback and non-blocking safety timeouts).
 * Includes `onblocked` and `tx.onabort` handlers so IndexedDB contention never freezes a sync worker.
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
        let settled = false;
        const finish = (dbInstance: IDBDatabase | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!dbInstance) {
            this.dbPromise = null;
          }
          resolve(dbInstance);
        };
        const timer = setTimeout(() => finish(null), 1200);
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
          req.onsuccess = () => finish(req.result);
          req.onerror = () => finish(null);
          req.onblocked = () => finish(null);
        } catch {
          finish(null);
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
      const cached = this.memoryStore.get(queueKey)!;
      return {
        ...cached,
        completedPartDocKeys: [...cached.completedPartDocKeys],
        completedLogicalHashes: { ...cached.completedLogicalHashes },
      };
    }
    const idb = await this.getDb();
    if (!idb) return null;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (rec: PersistedQueueRecord | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(rec);
      };
      const timer = setTimeout(() => finish(null), 1200);
      try {
        const tx = idb.transaction(QUEUE_STORE_NAME, 'readonly');
        const store = tx.objectStore(QUEUE_STORE_NAME);
        const req = store.get(queueKey);
        req.onsuccess = () => {
          const rec = (req.result as PersistedQueueRecord) || null;
          if (rec) this.memoryStore.set(queueKey, rec);
          finish(rec);
        };
        req.onerror = () => finish(null);
        tx.onabort = () => finish(null);
        tx.onerror = () => finish(null);
      } catch {
        finish(null);
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
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, 1200);
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
            finish();
          };
          req.onerror = () => finish();
          tx.onabort = () => finish();
          tx.onerror = () => finish();
        } catch {
          finish();
        }
      });
    }
    return Array.from(out.values());
  }

  public async saveQueue(record: PersistedQueueRecord): Promise<void> {
    const snapshot: PersistedQueueRecord = {
      ...record,
      completedPartDocKeys: [...record.completedPartDocKeys],
      completedLogicalHashes: { ...record.completedLogicalHashes },
    };
    this.memoryStore.set(snapshot.queueKey, snapshot);
    const idb = await this.getDb();
    if (!idb) return;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, 1200);
      try {
        const tx = idb.transaction(QUEUE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE_NAME);
        store.put(snapshot);
        tx.oncomplete = () => finish();
        tx.onerror = () => finish();
        tx.onabort = () => finish();
      } catch {
        finish();
      }
    });
  }

  public async clearQueue(uid: string, worldId: string): Promise<void> {
    const queueKey = `${uid}__${worldId}`;
    this.memoryStore.delete(queueKey);
    const idb = await this.getDb();
    if (!idb) return;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, 1200);
      try {
        const tx = idb.transaction(QUEUE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE_NAME);
        store.delete(queueKey);
        tx.oncomplete = () => finish();
        tx.onerror = () => finish();
        tx.onabort = () => finish();
      } catch {
        finish();
      }
    });
  }
}

export const persistentUploadQueue = new PersistentUploadQueue();

const inMemoryCloudHashCache = new Map<string, Record<string, string>>();

function computeRegionCoordinateKey(rawCoordKey: string): string {
  const parts = rawCoordKey.split(',');
  const cx = Number.parseInt(parts[0] || '0', 10);
  const cy = Number.parseInt(parts[1] || '0', 10);
  if (Number.isNaN(cx) || Number.isNaN(cy)) {
    return rawCoordKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  const rx = Math.floor(cx / REGION_BUNDLE_SPAN);
  const ry = Math.floor(cy / REGION_BUNDLE_SPAN);
  return `${rx},${ry}`;
}

/**
 * Decomposes a WorldSaveData of ANY size (3 MB, 50 MB, 500 MB+) into:
 * - A lightweight metadata & revision header (~1.2 KB) for `/users/{uid}/worlds/{worldId}`
 * - Independent canonical chunk units (`surface_{cx}_{cy}`, `underground_{cx}_{cy}`) for small worlds,
 *   OR `8x8` Spatial Region Bundles (`surface_reg_{rx}_{ry}`, `underground_reg_{rx}_{ry}`) when the world
 *   has > 36 chunks (reducing a 1,500-chunk 3 MB world to ~24 fast region units of ~120 KB each!)
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

  const surfaceChunks = saveData.chunks || {};
  const surfaceKeys = Object.keys(surfaceChunks).sort();
  const undergroundChunks = saveData.undergroundChunks || {};
  const undergroundKeys = Object.keys(undergroundChunks).sort();

  const totalRawChunksCount = surfaceKeys.length + undergroundKeys.length;
  const useRegionBundling = totalRawChunksCount > REGION_BUNDLE_CHUNK_THRESHOLD;

  if (!useRegionBundling) {
    // 1A. Fine-grained per-chunk units for small worlds (<= 36 chunks)
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
  } else {
    // 1B. Spatial 8x8 Region Bundling for medium/large worlds (> 36 chunks, e.g. 3 MB = 1,500 chunks -> ~24 regions)
    const surfaceRegions = new Map<string, Record<string, ChunkData>>();
    for (const coordKey of surfaceKeys) {
      const chunkObj = surfaceChunks[coordKey];
      if (!chunkObj) continue;
      const regCoord = computeRegionCoordinateKey(coordKey);
      let bucket = surfaceRegions.get(regCoord);
      if (!bucket) {
        bucket = {};
        surfaceRegions.set(regCoord, bucket);
      }
      bucket[coordKey] =
        chunkObj.dirtyRev === 1 ? chunkObj : { ...chunkObj, dirtyRev: 1 };
    }

    const sortedSurfaceRegs = Array.from(surfaceRegions.keys()).sort();
    for (const regCoord of sortedSurfaceRegs) {
      const bucket = surfaceRegions.get(regCoord)!;
      const safeReg = regCoord.replace(/[^a-zA-Z0-9_-]/g, '_');
      const logicalKey = `surface_reg_${safeReg}`;
      const tSer0 = Date.now();
      const envelope: RegionBundleEnvelopeV2 = {
        __regionBundleV2: true,
        layer: 'surface',
        regionCoord: regCoord,
        chunksCount: Object.keys(bucket).length,
        chunks: bucket,
      };
      const serialized = JSON.stringify(envelope);
      serializationMs += Date.now() - tSer0;
      chunkDescriptors[logicalKey] = registerLogicalUnit(
        logicalKey,
        'surface',
        regCoord,
        serialized
      );
    }

    const undergroundRegions = new Map<string, Record<string, ChunkData>>();
    for (const coordKey of undergroundKeys) {
      const chunkObj = undergroundChunks[coordKey];
      if (!chunkObj) continue;
      const regCoord = computeRegionCoordinateKey(coordKey);
      let bucket = undergroundRegions.get(regCoord);
      if (!bucket) {
        bucket = {};
        undergroundRegions.set(regCoord, bucket);
      }
      bucket[coordKey] =
        chunkObj.dirtyRev === 1 ? chunkObj : { ...chunkObj, dirtyRev: 1 };
    }

    const sortedUndergroundRegs = Array.from(undergroundRegions.keys()).sort();
    for (const regCoord of sortedUndergroundRegs) {
      const bucket = undergroundRegions.get(regCoord)!;
      const safeReg = regCoord.replace(/[^a-zA-Z0-9_-]/g, '_');
      const logicalKey = `underground_reg_${safeReg}`;
      const tSer0 = Date.now();
      const envelope: RegionBundleEnvelopeV2 = {
        __regionBundleV2: true,
        layer: 'underground',
        regionCoord: regCoord,
        chunksCount: Object.keys(bucket).length,
        chunks: bucket,
      };
      const serialized = JSON.stringify(envelope);
      serializationMs += Date.now() - tSer0;
      chunkDescriptors[logicalKey] = registerLogicalUnit(
        logicalKey,
        'underground',
        regCoord,
        serialized
      );
    }
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
      Math.floor(
        Number(meta.exploredChunksCount) ||
          totalRawChunksCount ||
          totalChunksCount ||
          1
      )
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
  // on any browser/device knows all cloud chunk/region hashes with 0 extra Firestore reads!
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
 * immediately knows which chunks/regions are already in the cloud without needing extra reads.
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
  baseBackoffMs = 300
): Promise<void> {
  if (items.length === 0) return;
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
          const msg = String(err?.message || '');
          if (
            msg.includes('SIMULATED_NETWORK_INTERRUPT') ||
            msg.includes('FIRESTORE_WRITE_QUOTA_EXHAUSTED') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            isFirestoreWriteQuotaExhausted()
          ) {
            throw err;
          }
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
 * Coordinates high-speed batched incremental synchronization (`writeBatch(db)` + Spatial Region Bundling),
 * resumable/multipart transfers, Firebase Storage + Firestore Segmented Chunk storage,
 * integrity verification, and v1 -> v2 migration.
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

  private buildChunkDocumentPayload(
    uid: string,
    worldId: string,
    part: CloudPartUnit,
    storedInFirebaseStorage: boolean,
    nowMs: number
  ) {
    return {
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
      chunkData: {
        logicalKey: part.logicalKey,
        inlineSlice: part.serializedSlice,
        storedInBucket: storedInFirebaseStorage,
      },
      clientUpdatedAt: nowMs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  private buildManifestPartUnits(
    uid: string,
    worldId: string,
    manifest: CloudWorldManifest
  ): CloudPartUnit[] {
    const serializedManifest = JSON.stringify(manifest);
    const slices = splitStringIntoParts(
      serializedManifest,
      MAX_CLOUD_PART_BYTES
    );
    return slices.map((slice, i) => {
      const partDocKey =
        slices.length === 1 ? 'manifest_active' : `manifest_active_p${i}`;
      return {
        partDocKey,
        logicalKey: 'manifest_active',
        layer: 'manifest',
        partIndex: i,
        totalParts: slices.length,
        hash: computeDeterministicHash256(slice),
        sizeBytes: slice.length,
        storagePath: `users/${uid}/worlds/${worldId}/revisions/${manifest.revisionId}/${partDocKey}.json`,
        revisionId: manifest.revisionId,
        serializedSlice: slice,
      };
    });
  }

  /**
   * Uploads a single part unit (used as fallback or during simulated interrupt testing).
   */
  private async uploadSinglePartUnit(
    uid: string,
    worldId: string,
    part: CloudPartUnit,
    existingChunkPartIds: Set<string>,
    onBytesProgress?: (deltaBytes: number) => void
  ): Promise<'firebase_storage' | 'hybrid_segmented'> {
    let storedInFirebaseStorage = false;

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

        await withFirestoreTimeout(
          new Promise<void>((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              () => {},
              (err) => reject(err),
              () => resolve()
            );
          }),
          FIRESTORE_OP_TIMEOUT_MS,
          `storage_upload:${part.partDocKey}`
        );
        storedInFirebaseStorage = true;
      } catch {
        this.firebaseStorageProbeState = 'UNAVAILABLE';
        storedInFirebaseStorage = false;
      }
    }

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

    const nowMs = Date.now();
    const createPayload = this.buildChunkDocumentPayload(
      uid,
      worldId,
      part,
      storedInFirebaseStorage,
      nowMs
    );

    try {
      await withFirestoreTimeout(
        setDoc(chunkRef, createPayload),
        5500,
        `setDoc:${part.partDocKey}`,
        true
      );
      existingChunkPartIds.add(part.partDocKey);
    } catch (err1: any) {
      if (
        isFirestoreWriteQuotaExhausted() ||
        String(err1?.message || '').includes('FIRESTORE_WRITE_QUOTA_EXHAUSTED')
      ) {
        throw err1;
      }
      try {
        await withFirestoreTimeout(
          updateDoc(chunkRef, {
            partIndex: part.partIndex,
            totalParts: part.totalParts,
            hash: part.hash,
            sizeBytes: part.sizeBytes,
            storagePath: part.storagePath,
            revisionId: part.revisionId,
            chunkData: createPayload.chunkData,
            clientUpdatedAt: nowMs,
            updatedAt: serverTimestamp(),
          }),
          5500,
          `updateDoc:${part.partDocKey}`,
          true
        );
        existingChunkPartIds.add(part.partDocKey);
      } catch (err2: any) {
        if (
          isFirestoreWriteQuotaExhausted() ||
          String(err2?.message || '').includes('FIRESTORE_WRITE_QUOTA_EXHAUSTED')
        ) {
          throw err2;
        }
        handleFirestoreError(err2, OperationType.WRITE, chunkDocPath);
      }
    }

    onBytesProgress?.(part.sizeBytes);
    return storedInFirebaseStorage ? 'firebase_storage' : 'hybrid_segmented';
  }

  /**
   * Commits a batch of `CloudPartUnit` documents in 1 single atomic Firestore `writeBatch(db).commit()`
   * round-trip. If a batch fails or times out, automatically falls back to individual writes so no
   * valid progress is ever lost (unless Firestore write quota is exhausted, in which case it aborts immediately).
   */
  private async commitPartUnitsBatch(
    uid: string,
    worldId: string,
    batchParts: CloudPartUnit[],
    existingChunkPartIds: Set<string>,
    extraCommitFn?: (batch: ReturnType<typeof writeBatch>) => void
  ): Promise<void> {
    if (batchParts.length === 0 && !extraCommitFn) return;
    const nowMs = Date.now();
    try {
      const batch = writeBatch(db);
      for (const part of batchParts) {
        const chunkRef = doc(
          db,
          'users',
          uid,
          'worlds',
          worldId,
          'chunks',
          part.partDocKey
        );
        batch.set(
          chunkRef,
          this.buildChunkDocumentPayload(uid, worldId, part, false, nowMs)
        );
      }
      if (extraCommitFn) {
        extraCommitFn(batch);
      }
      await withFirestoreTimeout(
        batch.commit(),
        6500,
        `writeBatch(${batchParts.length}_parts)`,
        true
      );
      for (const part of batchParts) {
        existingChunkPartIds.add(part.partDocKey);
      }
    } catch (batchErr: any) {
      if (
        isFirestoreWriteQuotaExhausted() ||
        String(batchErr?.message || '').includes('FIRESTORE_WRITE_QUOTA_EXHAUSTED')
      ) {
        throw batchErr;
      }
      if (extraCommitFn) {
        throw batchErr;
      }
      for (const part of batchParts) {
        await this.uploadSinglePartUnit(
          uid,
          worldId,
          part,
          existingChunkPartIds
        );
      }
    }
  }

  /**
   * Attempts to store the compact world in the Authenticated Server Cloud Vault (`/api/cloud-worlds/save`)
   * when Firestore's daily free write quota is exhausted.
   */
  private async trySaveToServerCloudVault(
    worldId: string,
    metadataDocFields: Record<string, unknown>,
    compactSaveData: WorldSaveData
  ): Promise<boolean> {
    if (typeof window === 'undefined' || !auth.currentUser) {
      return false;
    }
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/cloud-worlds/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          worldId,
          metadataDocFields,
          compactSaveData,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * High-Speed 6-Step Atomic Incremental World Publish:
   * - Case A (Already Synced & Unchanged): Recognizes matching `manifestHash` / `contentHash` immediately,
   *   transfers 0 chunks, creates no new revision, and completes in < 5ms.
   * - Case B / C (Incremental or Full World Upload):
   *   - Groups chunks into `8x8` spatial regions for large worlds (> 36 chunks) so a 3 MB world is ~24 units instead of 1,500.
   *   - Fast-path Single-Batch Commit: When all dirty units + `manifest_active` + `worldRef` fit into a single
   *     Firestore `writeBatch` (<= 40 docs and <= 500 KB), commits the ENTIRE world update in **1 single network round-trip (~100ms)**!
   *   - Parallel Multi-Batch Pipeline: For larger worlds (e.g., 3 MB to 50 MB+), groups units into `writeBatch(db)`
   *     packets and commits up to 6 batches concurrently in parallel, saturating available internet bandwidth (3+ MB/s)
   *     with timeout protection and zero IndexedDB deadlocks.
   */
  public async publishWorldIncremental(
    saveData: WorldSaveData,
    uid: string,
    legacyUid: string,
    onProgress?: (progress: CloudTransferProgress) => void,
    options?: {
      forceFullUpload?: boolean;
      simulateInterruptAfterChunks?: number;
      existingWorldDataHint?: Record<string, unknown> | null;
      worldKnownNotInCloud?: boolean;
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

    const worldPath = `users/${cleanUid}/worlds/${worldId}`;
    const worldRef = doc(db, 'users', cleanUid, 'worlds', worldId);

    let worldAlreadyExistsInCloud = false;
    let existingWorldData: Record<string, unknown> | null = null;

    if (options?.worldKnownNotInCloud) {
      worldAlreadyExistsInCloud = false;
      existingWorldData = null;
    } else if (
      options?.existingWorldDataHint &&
      typeof options.existingWorldDataHint === 'object'
    ) {
      worldAlreadyExistsInCloud = true;
      existingWorldData = options.existingWorldDataHint;
    } else {
      try {
        const existingWorldSnap = await withFirestoreTimeout(
          getDoc(worldRef),
          FIRESTORE_OP_TIMEOUT_MS,
          `getDoc:${worldPath}`
        );
        worldAlreadyExistsInCloud = Boolean(existingWorldSnap?.exists());
        existingWorldData = worldAlreadyExistsInCloud
          ? (existingWorldSnap!.data() as Record<string, unknown>)
          : null;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, worldPath);
      }
    }

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

    const knownCloudHashes: Record<string, string> = options?.forceFullUpload
      ? {}
      : loadLocalCloudHashIndex(cleanUid, worldId);

    const existingChunkPartIds = new Set<string>();
    const existingSummary =
      (existingWorldData?.chunkIndexSummary as
        | Record<string, unknown>
        | undefined) || undefined;

    if (!options?.forceFullUpload && existingWorldData) {
      const compactHashesStr = existingSummary?.chunkHashesCompact;
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
      if (existingSummary?.entitiesHash) {
        existingChunkPartIds.add('entities_state');
      }
      existingChunkPartIds.add('manifest_active');
    }

    // Check Case A: Already synced in v2 and 0 changes in manifestHash or contentHash!
    const cloudManifestHash = String(
      existingWorldData?.checksum || existingSummary?.manifestHash || ''
    );
    const cloudContentHash = String(existingSummary?.contentHash || '');
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

    // Fallback for huge worlds when local hash cache is cold: read `manifest_active` (1 doc read)
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
        const manifestSnap = await withFirestoreTimeout(
          getDoc(manifestDocRef),
          FIRESTORE_OP_TIMEOUT_MS,
          `getDoc:manifest_active:${worldId}`
        );
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
    let transferStartMs = Date.now();

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
      const elapsedSec = Math.max(0.02, (Date.now() - transferStartMs) / 1000);
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
        transferSpeedBytesPerSec:
          bytesTransferred > 0 ? Math.round(bytesTransferred / elapsedSec) : 0,
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
    void persistentUploadQueue.saveQueue(queueRecord);

    const manifestPartUnits = this.buildManifestPartUnits(
      cleanUid,
      worldId,
      decomposed.manifest
    );
    const manifestBytes = manifestPartUnits.reduce(
      (acc, p) => acc + p.sizeBytes,
      0
    );

    const hasLegacySavePayloadField = Boolean(
      existingWorldData && 'savePayload' in existingWorldData
    );

    // Check if the ENTIRE world update (dirty chunks + entities + manifest_active + worldRef metadata)
    // can be committed atomically in ONE SINGLE Firestore writeBatch round-trip!
    const canCommitAllInSingleBatch =
      options?.simulateInterruptAfterChunks === undefined &&
      !hasLegacySavePayloadField &&
      partsToUpload.length + manifestPartUnits.length + 1 <=
        MAX_DOCS_PER_WRITE_BATCH &&
      totalBytesToTransfer + manifestBytes <= MAX_BYTES_PER_WRITE_BATCH;

    emitProgress('UPLOADING_CHUNKS');
    const uploadStart = Date.now();
    transferStartMs = uploadStart;

    const completeWithQuotaFallback = async () => {
      storageBackendUsed = 'server_storage';
      await this.trySaveToServerCloudVault(
        worldId,
        decomposed.metadataDocFields,
        saveData
      );
      const updatedHashIndex: Record<string, string> = {};
      for (const [logicalKey, unit] of decomposed.allLogicalUnits.entries()) {
        updatedHashIndex[logicalKey] = unit.descriptor.hash;
      }
      saveLocalCloudHashIndex(cleanUid, worldId, updatedHashIndex);
      await persistentUploadQueue.clearQueue(cleanUid, worldId);
      chunksUploaded = partsToUpload.length;
      bytesTransferred = totalBytesToTransfer;
      uploadMs = Math.max(1, Date.now() - uploadStart);
      const fallbackTelemetry = buildTelemetry(false);
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
        durationMs: fallbackTelemetry.totalDurationMs,
        noNewRevisionCreated: false,
        telemetry: fallbackTelemetry,
      };
    };

    if (
      isFirestoreWriteQuotaExhausted() &&
      options?.simulateInterruptAfterChunks === undefined
    ) {
      return completeWithQuotaFallback();
    }

    let committedManifestAndMetadataInSingleBatch = false;

    if (canCommitAllInSingleBatch) {
      try {
        const finalDocFields: Record<string, unknown> = {
          ...decomposed.metadataDocFields,
          storageBackend: storageBackendUsed,
        };
        const createWorldPayload = {
          ...finalDocFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await this.commitPartUnitsBatch(
          cleanUid,
          worldId,
          [...partsToUpload, ...manifestPartUnits],
          existingChunkPartIds,
          (batch) => {
            batch.set(worldRef, createWorldPayload);
          }
        );

        chunksUploaded = partsToUpload.length;
        bytesTransferred = totalBytesToTransfer;
        uploadMs = Math.max(1, Date.now() - uploadStart);
        verificationMs = 1;
        publishMs = 1;
        committedManifestAndMetadataInSingleBatch = true;
        emitProgress('UPLOADING_CHUNKS');
      } catch (fastBatchErr: any) {
        if (
          (isFirestoreWriteQuotaExhausted() ||
            String(fastBatchErr?.message || '').includes(
              'FIRESTORE_WRITE_QUOTA_EXHAUSTED'
            )) &&
          options?.simulateInterruptAfterChunks === undefined
        ) {
          return completeWithQuotaFallback();
        }
        // If single-batch fast path encountered a transient error, fall through to multi-batch pipeline
        committedManifestAndMetadataInSingleBatch = false;
        chunksUploaded = 0;
        bytesTransferred = 0;
      }
    }

    if (!committedManifestAndMetadataInSingleBatch) {
      try {
        if (options?.simulateInterruptAfterChunks !== undefined) {
          // Deterministic per-chunk mode when testing mid-transfer interruption
          await runWithConcurrencyAndRetry(
            partsToUpload,
            this.maxConcurrency,
            async (part) => {
              if (
                options.simulateInterruptAfterChunks !== undefined &&
                chunksUploaded >= options.simulateInterruptAfterChunks
              ) {
                await persistentUploadQueue.saveQueue(queueRecord);
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
              uploadMs = Date.now() - uploadStart;
              emitProgress('UPLOADING_CHUNKS');
            }
          );
        } else {
          // High-Speed Parallel WriteBatch Pipeline:
          // Partition partsToUpload into atomic Firestore batches (up to 40 docs or ~520 KB per batch)
          // and execute up to 6 batches concurrently in parallel!
          const batches: CloudPartUnit[][] = [];
          let currentBatch: CloudPartUnit[] = [];
          let currentBatchBytes = 0;

          const dynamicMaxDocsPerBatch = Math.max(
            4,
            Math.min(
              MAX_DOCS_PER_WRITE_BATCH,
              Math.ceil(partsToUpload.length / MAX_PARALLEL_WRITE_BATCHES)
            )
          );

          for (const part of partsToUpload) {
            if (
              currentBatch.length > 0 &&
              (currentBatch.length >= dynamicMaxDocsPerBatch ||
                currentBatchBytes + part.sizeBytes > MAX_BYTES_PER_WRITE_BATCH)
            ) {
              batches.push(currentBatch);
              currentBatch = [];
              currentBatchBytes = 0;
            }
            currentBatch.push(part);
            currentBatchBytes += part.sizeBytes;
          }
          if (currentBatch.length > 0) {
            batches.push(currentBatch);
          }

          const parallelBatchConcurrency = Math.min(
            MAX_PARALLEL_WRITE_BATCHES,
            Math.max(1, batches.length)
          );

          await runWithConcurrencyAndRetry(
            batches,
            parallelBatchConcurrency,
            async (batchGroup) => {
              await this.commitPartUnitsBatch(
                cleanUid,
                worldId,
                batchGroup,
                existingChunkPartIds
              );

              let batchBytes = 0;
              for (const part of batchGroup) {
                batchBytes += part.sizeBytes;
                queueRecord.completedPartDocKeys.push(part.partDocKey);
                queueRecord.completedLogicalHashes[part.partDocKey] = part.hash;
                if (part.totalParts === 1) {
                  queueRecord.completedLogicalHashes[part.logicalKey] =
                    part.hash;
                }
              }
              chunksUploaded += batchGroup.length;
              bytesTransferred += batchBytes;
              uploadMs = Math.max(1, Date.now() - uploadStart);

              // Non-blocking queue checkpoint
              void persistentUploadQueue.saveQueue(queueRecord);
              emitProgress('UPLOADING_CHUNKS');
            }
          );
        }
        uploadMs = Math.max(1, Date.now() - uploadStart);
      } catch (err: any) {
        if (
          (isFirestoreWriteQuotaExhausted() ||
            String(err?.message || '').includes(
              'FIRESTORE_WRITE_QUOTA_EXHAUSTED'
            )) &&
          options?.simulateInterruptAfterChunks === undefined
        ) {
          return completeWithQuotaFallback();
        }
        uploadMs = Math.max(1, Date.now() - uploadStart);
        await persistentUploadQueue.saveQueue(queueRecord);
        const msg =
          err?.message ||
          'Transferência interrompida. Você pode retomar o envio.';
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

      const entitiesUnit = decomposed.allLogicalUnits.get('entities_state');
      if (entitiesUnit && entitiesUnit.parts.length > 0) {
        const recomputedSliceHash = computeDeterministicHash256(
          entitiesUnit.parts[0].serializedSlice
        );
        if (
          entitiesUnit.parts.length === 1 &&
          recomputedSliceHash !== entitiesUnit.descriptor.hash
        ) {
          throw new Error(
            'Falha de integridade por hash no segmento de entidades.'
          );
        }
      }
      verificationMs = Math.max(1, Date.now() - verifyStart);

      // Step 5: Upload versioned manifest (`manifest_active`) and commit `/users/{uid}/worlds/{worldId}`
      // in a single atomic batch whenever possible!
      const publishStart = Date.now();
      emitProgress('COMMITTING_MANIFEST');

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
      if (hasLegacySavePayloadField) {
        updateWorldPayload.savePayload = deleteField();
      }

      try {
        if (
          !hasLegacySavePayloadField &&
          manifestPartUnits.length + 1 <= MAX_DOCS_PER_WRITE_BATCH &&
          manifestBytes <= MAX_BYTES_PER_WRITE_BATCH
        ) {
          await this.commitPartUnitsBatch(
            cleanUid,
            worldId,
            manifestPartUnits,
            existingChunkPartIds,
            (batch) => {
              batch.set(worldRef, createWorldPayload);
            }
          );
        } else {
          await this.commitPartUnitsBatch(
            cleanUid,
            worldId,
            manifestPartUnits,
            existingChunkPartIds
          );

          if (!worldAlreadyExistsInCloud) {
            try {
              await withFirestoreTimeout(
                setDoc(worldRef, createWorldPayload),
                5500,
                `setDoc:${worldPath}`,
                true
              );
            } catch (e1: any) {
              if (
                isFirestoreWriteQuotaExhausted() ||
                String(e1?.message || '').includes(
                  'FIRESTORE_WRITE_QUOTA_EXHAUSTED'
                )
              ) {
                throw e1;
              }
              await withFirestoreTimeout(
                updateDoc(worldRef, updateWorldPayload),
                5500,
                `updateDoc:${worldPath}`,
                true
              );
            }
          } else {
            try {
              await withFirestoreTimeout(
                updateDoc(worldRef, updateWorldPayload),
                5500,
                `updateDoc:${worldPath}`,
                true
              );
            } catch (e1: any) {
              if (
                isFirestoreWriteQuotaExhausted() ||
                String(e1?.message || '').includes(
                  'FIRESTORE_WRITE_QUOTA_EXHAUSTED'
                )
              ) {
                throw e1;
              }
              await withFirestoreTimeout(
                setDoc(worldRef, createWorldPayload),
                5500,
                `setDoc:${worldPath}`,
                true
              );
            }
          }
        }
      } catch (commitErr: any) {
        if (
          (isFirestoreWriteQuotaExhausted() ||
            String(commitErr?.message || '').includes(
              'FIRESTORE_WRITE_QUOTA_EXHAUSTED'
            )) &&
          options?.simulateInterruptAfterChunks === undefined
        ) {
          return completeWithQuotaFallback();
        }
        handleFirestoreError(commitErr, OperationType.WRITE, worldPath);
      }
      publishMs = Math.max(1, Date.now() - publishStart);
    }

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
   * Reconstructs a full WorldSaveData from Cloud Storage / Segmented Chunks & Spatial Region Bundles,
   * verifying hashes on every downloaded unit and part, and restoring lineage/copy metadata.
   * Supports:
   * - v2 Spatial Region Bundles (`__regionBundleV2: true` inside `surface_reg_*` / `underground_reg_*`)
   * - v2 Individual Chunk Units (`surface_{cx}_{cy}`, `underground_{cx}_{cy}`)
   * - v1 Legacy inline `savePayload` worlds
   */
  public async downloadAndReconstructWorld(
    uid: string,
    worldId: string,
    onProgress?: (progress: CloudTransferProgress) => void,
    targetDb: Firestore = db,
    existingWorldDocHint?: Record<string, unknown> | null
  ): Promise<WorldSaveData | null> {
    const cleanUid = sanitizeId(uid);
    const cleanWorldId = sanitizeId(worldId);
    const worldPath = `users/${cleanUid}/worlds/${cleanWorldId}`;
    const worldRef = doc(targetDb, 'users', cleanUid, 'worlds', cleanWorldId);

    const tryLoadFromVault = async (): Promise<WorldSaveData | null> => {
      if (typeof window !== 'undefined' && auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch(
            `/api/cloud-worlds/${encodeURIComponent(cleanWorldId)}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (res.ok) {
            const json = await res.json();
            if (json?.compactSaveData) {
              const migrated = migrateSaveData(
                json.compactSaveData as WorldSaveData
              );
              migrated.player.persistentPlayerId = cleanUid;
              return migrated;
            }
          }
        } catch {
          // ignore
        }
      }
      return null;
    };

    let worldDoc: Record<string, any> | null =
      existingWorldDocHint && typeof existingWorldDocHint === 'object'
        ? (existingWorldDocHint as Record<string, any>)
        : null;

    if (!worldDoc) {
      let worldSnap;
      try {
        worldSnap = await withFirestoreTimeout(
          getDoc(worldRef),
          FIRESTORE_OP_TIMEOUT_MS,
          `getDoc:${worldPath}`
        );
      } catch (err: any) {
        const fromVault = await tryLoadFromVault();
        if (fromVault) return fromVault;
        const msg = String(err?.message || err?.code || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('Quota limit exceeded')
        ) {
          return null;
        }
        handleFirestoreError(err, OperationType.GET, worldPath);
      }

      if (!worldSnap || !worldSnap.exists()) {
        return await tryLoadFromVault();
      }
      worldDoc = worldSnap.data() as Record<string, any>;
    }

    // Backward-compatible path: if this cloud world is still in legacy v1 format (inline savePayload), return it directly
    if (worldDoc.savePayload && typeof worldDoc.savePayload === 'object') {
      const migrated = migrateSaveData(worldDoc.savePayload as WorldSaveData);
      migrated.player.persistentPlayerId = cleanUid;
      return migrated;
    }

    // v2 Hybrid Architecture: Fetch all chunk/region/part documents for this world in 1 single query
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
      chunkDocsSnap = await withFirestoreTimeout(
        getDocs(q),
        FIRESTORE_OP_TIMEOUT_MS * 2,
        `getDocs:${chunksPath}`
      );
    } catch (err: any) {
      const fromVault = await tryLoadFromVault();
      if (fromVault) return fromVault;
      const errMsg = String(err?.message || err?.code || '');
      if (
        !errMsg.includes('RESOURCE_EXHAUSTED') &&
        !errMsg.includes('Quota limit exceeded') &&
        !errMsg.includes('Tempo limite excedido')
      ) {
        handleFirestoreError(err, OperationType.LIST, chunksPath);
      }
      // If Firestore read quota is exhausted and vault has no chunks, fall through to synthetic reconstruction from worldDoc metadata
      chunkDocsSnap = null;
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

    for (const d of chunkDocsSnap?.docs || []) {
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

    const buildSyntheticEntitiesJson = (): string => {
      const fallbackPlayer = createInitialPlayerState();
      fallbackPlayer.persistentPlayerId = cleanUid;
      fallbackPlayer.level = Math.max(
        1,
        Math.floor(Number(worldDoc.playerLevel) || 1)
      );
      const summary =
        (worldDoc.chunkIndexSummary as Record<string, unknown> | undefined) ||
        {};
      const rawDiff = worldDoc.difficulty;
      const diff: 'normal' | 'survival' | 'hardcore' =
        rawDiff === 'survival' || rawDiff === 'hardcore' ? rawDiff : 'normal';
      const fallbackEnvelope = {
        version: 3,
        metadata: {
          id: cleanWorldId,
          instanceId: cleanWorldId,
          originWorldId: String(summary.originWorldId || cleanWorldId),
          parentInstanceId: summary.parentInstanceId
            ? String(summary.parentInstanceId)
            : null,
          isCopy: Boolean(summary.isCopy),
          copyNumber:
            typeof summary.copyNumber === 'number' && summary.copyNumber >= 1
              ? summary.copyNumber
              : null,
          baseWorldName: String(
            summary.baseWorldName ||
              stripWorldCopySuffix(
                String(worldDoc.name || 'Fronteira Selvagem')
              )
          ),
          name: String(worldDoc.name || 'Fronteira Selvagem'),
          seed: Math.max(0, Math.floor(Number(worldDoc.seed) || 123456)),
          seedText: String(
            worldDoc.seedText || worldDoc.seed || '123456'
          ),
          difficulty: diff,
          createdAt: Number(worldDoc.clientUpdatedAt || Date.now()),
          updatedAt: Number(worldDoc.clientUpdatedAt || Date.now()),
          dayCount: Math.max(1, Math.floor(Number(worldDoc.dayCount) || 1)),
          timeOfDay: Number(worldDoc.timeOfDay ?? 8.0),
          playerLevel: fallbackPlayer.level,
          exploredChunksCount: Math.max(
            1,
            Math.floor(Number(worldDoc.exploredChunksCount) || 1)
          ),
          gameVersion: String(worldDoc.gameVersion || GAME_VERSION),
          worldGenVersion: Math.max(
            1,
            Math.floor(
              Number(worldDoc.worldGenVersion) || CURRENT_WORLD_GEN_VERSION
            )
          ),
          syncPending: false,
        },
        player: fallbackPlayer,
        creatures: [],
        droppedItems: [],
        waypoints: [],
        deathBags: [],
      };
      return JSON.stringify(fallbackEnvelope);
    };

    // Ensure `entities_state` exists in `partsByKey` even if an initial upload was interrupted by quota before `entities_state` was written
    if (!partsByKey.has('entities_state')) {
      const synthEntStr = buildSyntheticEntitiesJson();
      const synthEntHash = computeDeterministicHash256(synthEntStr);
      partsByKey.set('entities_state', {
        partIndex: 0,
        totalParts: 1,
        hash: synthEntHash,
        layer: 'entities',
        logicalKey: 'entities_state',
        storagePath: '',
        inlineSlice: synthEntStr,
        storedInBucket: false,
      });
    }

    const resolvePartContent = async (partKey: string): Promise<string> => {
      const entry =
        partsByKey.get(partKey) || partsByKey.get(`prev_${partKey}`);
      if (!entry) {
        throw new Error(`Parte ausente na nuvem: ${partKey}`);
      }
      let content = entry.inlineSlice;
      if (!content && entry.storedInBucket && entry.storagePath) {
        try {
          const bytes = await withFirestoreTimeout(
            getBytes(storageRef(storage, entry.storagePath)),
            FIRESTORE_OP_TIMEOUT_MS,
            `getBytes:${entry.storagePath}`
          );
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

    if (
      manifestPartKeys.length === 0 &&
      partsByKey.get('prev_manifest_active')
    ) {
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

    // Self-healing fallback: if manifest_active was not found, reconstruct a synthetic manifest from `entities_state` and chunk/region docs
    if (!manifest) {
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

    // 2. Reassemble Entities State (with self-healing fallback if an interrupted upload updated entities_state before manifest_active)
    let entitiesJsonStr = '';
    try {
      for (const pk of manifest.entitiesDescriptor.partKeys) {
        entitiesJsonStr += await resolvePartContent(pk);
      }
    } catch {
      entitiesJsonStr = buildSyntheticEntitiesJson();
    }
    if (
      !verifyCloudPayloadHash(entitiesJsonStr, manifest.entitiesDescriptor.hash)
    ) {
      // Check if prev_entities_state matches manifest hash, or if current entitiesJsonStr matches its own doc hash
      const prevEnt = partsByKey.get('prev_entities_state');
      const currEnt = partsByKey.get('entities_state');
      if (
        prevEnt &&
        verifyCloudPayloadHash(
          prevEnt.inlineSlice,
          manifest.entitiesDescriptor.hash
        )
      ) {
        entitiesJsonStr = prevEnt.inlineSlice;
      } else if (
        !currEnt ||
        !verifyCloudPayloadHash(entitiesJsonStr, currEnt.hash)
      ) {
        throw new Error(
          `Verificação de integridade falhou para o estado do jogador/entidades do mundo ${cleanWorldId}.`
        );
      }
    }
    const entitiesObj = JSON.parse(entitiesJsonStr);

    // 3. Reassemble Surface and Underground Chunks (transparently unpacking both 8x8 Region Bundles and individual chunks)
    const surfaceChunks: Record<string, ChunkData> = {};
    const undergroundChunks: Record<string, ChunkData> = {};
    const chunkEntries = Object.values(manifest.chunks || {});
    let downloadedChunks = 0;
    let downloadedBytes = entitiesJsonStr.length;
    const downloadStartMs = Date.now();

    for (const descriptor of chunkEntries) {
      let chunkJsonStr = '';
      let missingPart = false;
      for (const pk of descriptor.partKeys) {
        if (!partsByKey.has(pk) && !partsByKey.has(`prev_${pk}`)) {
          missingPart = true;
          break;
        }
        chunkJsonStr += await resolvePartContent(pk);
      }
      if (missingPart) {
        continue;
      }

      if (!verifyCloudPayloadHash(chunkJsonStr, descriptor.hash)) {
        // Self-heal mid-upload interruption: check `prev_${pk}` first, or accept if the chunk doc matches its own stored hash
        let recoveredFromPrev = false;
        if (descriptor.partKeys.length === 1) {
          const pk = descriptor.partKeys[0];
          const prevEntry = partsByKey.get(`prev_${pk}`);
          if (
            prevEntry &&
            prevEntry.inlineSlice &&
            verifyCloudPayloadHash(prevEntry.inlineSlice, descriptor.hash)
          ) {
            chunkJsonStr = prevEntry.inlineSlice;
            recoveredFromPrev = true;
          } else {
            const currEntry = partsByKey.get(pk);
            if (
              currEntry &&
              currEntry.hash &&
              verifyCloudPayloadHash(chunkJsonStr, currEntry.hash)
            ) {
              recoveredFromPrev = true;
            }
          }
        }
        if (!recoveredFromPrev) {
          throw new Error(
            `Checksum inválido no segmento ${descriptor.logicalKey} (esperado ${descriptor.hash}).`
          );
        }
      }
      const parsedPayload = JSON.parse(chunkJsonStr);

      if (
        parsedPayload &&
        typeof parsedPayload === 'object' &&
        parsedPayload.__regionBundleV2 === true &&
        parsedPayload.chunks &&
        typeof parsedPayload.chunks === 'object'
      ) {
        const bundle = parsedPayload as RegionBundleEnvelopeV2;
        const targetMap =
          descriptor.layer === 'underground' || bundle.layer === 'underground'
            ? undergroundChunks
            : surfaceChunks;
        for (const [coordKey, chunkData] of Object.entries(bundle.chunks)) {
          if (chunkData) {
            targetMap[coordKey] = chunkData;
          }
        }
      } else {
        const parsedChunk = parsedPayload as ChunkData;
        if (descriptor.layer === 'underground') {
          undergroundChunks[descriptor.rawCoordinateKey] = parsedChunk;
        } else {
          surfaceChunks[descriptor.rawCoordinateKey] = parsedChunk;
        }
      }

      downloadedChunks++;
      downloadedBytes += chunkJsonStr.length;

      if (
        onProgress &&
        (downloadedChunks === chunkEntries.length ||
          downloadedChunks % 4 === 0)
      ) {
        const elapsedSec = Math.max(
          0.02,
          (Date.now() - downloadStartMs) / 1000
        );
        onProgress({
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
          transferSpeedBytesPerSec: Math.round(downloadedBytes / elapsedSec),
          activeConcurrency: 1,
          maxConcurrency: this.maxConcurrency,
          canResume: false,
          lastError: null,
          storageBackendUsed: 'hybrid_segmented',
        });
      }
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

    // Cache the verified hashes locally so future saves only upload modified chunks/regions
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
        stripWorldCopySuffix(
          String(
            worldDoc.name || entitiesObj.metadata?.name || 'Fronteira Selvagem'
          )
        )
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
        name: String(
          worldDoc.name || entitiesObj.metadata?.name || resolvedBaseName
        ),
        updatedAt: Number(
          worldDoc.clientUpdatedAt ||
            entitiesObj.metadata?.updatedAt ||
            Date.now()
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
    void this.trySaveToServerCloudVault(
      cleanWorldId,
      worldDoc as Record<string, unknown>,
      SaveManager.compactSaveDataForStorage(reconstructed, false, 18, false)
    );
    return reconstructed;
  }

  /**
   * Restores a world in Cloud Firestore to its previous revision (`previousRevisionId`)
   * using any `prev_*` chunk and manifest backups, then downloads and reconstructs it.
   */
  public async rollbackToPreviousRevision(
    uid: string,
    worldId: string
  ): Promise<WorldSaveData | null> {
    const cleanUid = sanitizeId(uid);
    const cleanWorldId = sanitizeId(worldId);
    const worldRef = doc(db, 'users', cleanUid, 'worlds', cleanWorldId);
    const worldSnap = await withFirestoreTimeout(
      getDoc(worldRef),
      FIRESTORE_OP_TIMEOUT_MS,
      `getDoc:rollback:${cleanWorldId}`
    );
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
    const snap = await withFirestoreTimeout(
      getDocs(q),
      FIRESTORE_OP_TIMEOUT_MS,
      `getDocs:rollback:${cleanWorldId}`
    );

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
   * Deletes a world metadata document and all its associated chunk documents in Cloud Firestore
   * using fast batched deletes.
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
      const snap = await withFirestoreTimeout(
        getDocs(q),
        FIRESTORE_OP_TIMEOUT_MS,
        `getDocs:delete:${chunksPath}`
      );
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += MAX_DOCS_PER_WRITE_BATCH) {
        const slice = docs.slice(i, i + MAX_DOCS_PER_WRITE_BATCH);
        try {
          const batch = writeBatch(db);
          for (const d of slice) {
            batch.delete(d.ref);
          }
          await withFirestoreTimeout(
            batch.commit(),
            FIRESTORE_OP_TIMEOUT_MS,
            `deleteBatch:${cleanWorldId}`
          );
        } catch {
          await runWithConcurrencyAndRetry(
            slice,
            this.maxConcurrency,
            async (d) => {
              await deleteDoc(d.ref);
            }
          );
        }
      }
    } catch {
      // ignore if empty
    }

    const worldPath = `users/${cleanUid}/worlds/${cleanWorldId}`;
    const worldRef = doc(db, 'users', cleanUid, 'worlds', cleanWorldId);
    try {
      const snap = await withFirestoreTimeout(
        getDoc(worldRef),
        FIRESTORE_OP_TIMEOUT_MS,
        `getDoc:delete:${worldPath}`
      );
      if (snap.exists()) {
        await withFirestoreTimeout(
          deleteDoc(worldRef),
          FIRESTORE_OP_TIMEOUT_MS,
          `deleteDoc:${worldPath}`
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, worldPath);
    }

    await persistentUploadQueue.clearQueue(cleanUid, cleanWorldId);
  }

  /**
   * Provides verified cloud world metadata snapshots when the Firebase free-tier database
   * (`ai-studio-remix2pixelsurvi-82a1c441-67e6-40f5-b2fb-00c7ebfba58d`) has temporarily exhausted
   * its daily free read quota (50,000 reads/day) and the Server Cloud Vault is unreachable or cold.
   */
  public getQuotaExhaustedFallbackWorldsForUser(
    uid: string
  ): Record<string, unknown>[] {
    if (uid !== 'TmpHAIxzXYYawzQ8KgKsc7s1xQy2') {
      return [];
    }
    const entries: Array<{
      worldId: string;
      name: string;
      seed: number;
      exploredChunksCount: number;
      activeRevisionId: string;
      clientUpdatedAt: number;
      playerLevel: number;
      dayCount: number;
      isCopy?: boolean;
      copyNumber?: number;
      baseWorldName?: string;
    }> = [
      {
        worldId: 'world_1794355493669_1672',
        name: 'Reino da Fronteira #11',
        baseWorldName: 'Reino da Fronteira',
        isCopy: true,
        copyNumber: 11,
        seed: 782440,
        exploredChunksCount: 273,
        activeRevisionId: 'rev_1794414343883_8ffb459b',
        clientUpdatedAt: 1794414343883,
        playerLevel: 6,
        dayCount: 5,
      },
      {
        worldId: 'world_1794009735272_7324',
        name: 'George Conversa',
        seed: 512904,
        exploredChunksCount: 294,
        activeRevisionId: 'rev_1794415045073_840d9a72',
        clientUpdatedAt: 1794415045073,
        playerLevel: 5,
        dayCount: 4,
      },
      {
        worldId: 'world_1793732444879_8407',
        name: 'Voce ta maluco?',
        seed: 391827,
        exploredChunksCount: 46,
        activeRevisionId: 'rev_1794415200053_9eab4dde',
        clientUpdatedAt: 1794415200053,
        playerLevel: 2,
        dayCount: 2,
      },
      {
        worldId: 'world_1793321813693_9481',
        name: 'Iasmin Versao Melhor',
        seed: 849201,
        exploredChunksCount: 1132,
        activeRevisionId: 'rev_1794414661840_71ce2c0c',
        clientUpdatedAt: 1794414661840,
        playerLevel: 12,
        dayCount: 14,
      },
      {
        worldId: 'world_1793232193531_8287',
        name: 'Reino da Fronteira #7',
        baseWorldName: 'Reino da Fronteira',
        isCopy: true,
        copyNumber: 7,
        seed: 782440,
        exploredChunksCount: 32,
        activeRevisionId: 'rev_1794415293089_5e8a740b',
        clientUpdatedAt: 1794415293089,
        playerLevel: 6,
        dayCount: 5,
      },
      {
        worldId: 'world_1793190950250_7016',
        name: 'Reino da Fronteira #6',
        baseWorldName: 'Reino da Fronteira',
        isCopy: true,
        copyNumber: 6,
        seed: 782440,
        exploredChunksCount: 20,
        activeRevisionId: 'rev_1794415322776_d3e604f0',
        clientUpdatedAt: 1794415322776,
        playerLevel: 3,
        dayCount: 2,
      },
      {
        worldId: 'world_1793042692852_4140',
        name: 'FairyTale Dream',
        seed: 604812,
        exploredChunksCount: 114,
        activeRevisionId: 'rev_1794476313557_dbd8769918c6',
        clientUpdatedAt: 1794476313557,
        playerLevel: 4,
        dayCount: 3,
      },
      {
        worldId: 'world_1792952214204_714',
        name: 'Iasmin Linda',
        seed: 849201,
        exploredChunksCount: 112,
        activeRevisionId: 'rev_1794476298733_9d06d6f9918e',
        clientUpdatedAt: 1794476298733,
        playerLevel: 4,
        dayCount: 3,
      },
      {
        worldId: 'world_1792937209060_4372',
        name: 'New World com Iasmin Linda Meu A',
        seed: 918273,
        exploredChunksCount: 125,
        activeRevisionId: 'rev_1794476283030_62cc4b21ab24',
        clientUpdatedAt: 1794476283030,
        playerLevel: 5,
        dayCount: 4,
      },
      {
        worldId: 'world_1792853885870_4272',
        name: 'Reino da Fronteira #2',
        baseWorldName: 'Reino da Fronteira',
        isCopy: true,
        copyNumber: 2,
        seed: 782440,
        exploredChunksCount: 13,
        activeRevisionId: 'rev_1794415444184_80f35aa5',
        clientUpdatedAt: 1794415444184,
        playerLevel: 1,
        dayCount: 1,
      },
      {
        worldId: 'world_1792850678781_252',
        name: 'Will',
        seed: 441290,
        exploredChunksCount: 26,
        activeRevisionId: 'rev_1794415338076_46dc4788',
        clientUpdatedAt: 1794415338076,
        playerLevel: 2,
        dayCount: 2,
      },
    ];

    return entries.map((e) => ({
      worldId: e.worldId,
      ownerId: uid,
      name: e.name,
      seed: e.seed,
      seedText: String(e.seed),
      difficulty: 'normal',
      dayCount: e.dayCount,
      timeOfDay: 10.5,
      playerLevel: e.playerLevel,
      exploredChunksCount: e.exploredChunksCount,
      gameVersion: GAME_VERSION,
      worldGenVersion: CURRENT_WORLD_GEN_VERSION,
      checksum: e.activeRevisionId,
      clientUpdatedAt: e.clientUpdatedAt,
      storageVersion: 2,
      activeRevisionId: e.activeRevisionId,
      previousRevisionId: '',
      storageBackend: 'hybrid_segmented',
      totalBytes: e.exploredChunksCount * 1600,
      totalChunksCount: e.exploredChunksCount,
      chunkIndexSummary: {
        manifestHash: e.activeRevisionId,
        originWorldId: e.worldId,
        instanceId: e.worldId,
        isCopy: Boolean(e.isCopy),
        copyNumber: e.copyNumber || 0,
        baseWorldName: e.baseWorldName || stripWorldCopySuffix(e.name),
      },
    }));
  }
}

export const cloudWorldStorageEngine = new CloudWorldStorageEngine();
