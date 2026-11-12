import {
  collection,
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
  fallbackDefaultDb,
  googleProvider,
  handleFirestoreError,
  onAuthStateChanged,
  OperationType,
  signInWithPopup,
  signOut,
  User,
} from '../../firebase';
import {
  CURRENT_WORLD_GEN_VERSION,
  GAME_VERSION,
  PlayerAppearance,
  PlayerState,
  WorldMetadata,
  WorldSaveData,
} from '../core/types';
import {
  CloudPublishTelemetry,
  CloudTransferProgress,
  cloudWorldStorageEngine,
  persistentUploadQueue,
} from './CloudWorldStorageEngine';
import {
  computeChecksum,
  getOrCreateLocalDevicePlayerUid,
  SaveManager,
} from './SaveManager';

const LEGACY_UID_STORAGE_KEY = 'wildborn_legacy_local_uid_v1';

export interface UserEntitlementRecord {
  entitlementId: string;
  ownerId: string;
  sku: string;
  category:
    | 'cosmetic'
    | 'expansion'
    | 'supporter_pack'
    | 'currency_bundle'
    | 'exclusive_reward';
  status: 'active' | 'revoked';
  grantedAt?: unknown;
}

export type DetailedWorldSyncStatus =
  | 'LOCAL_ONLY'
  | 'PENDING_UPLOAD'
  | 'UPLOADING'
  | 'SYNCED'
  | 'DOWNLOADING'
  | 'RECONSTRUCTING'
  | 'VERIFYING_INTEGRITY'
  | 'SYNC_ERROR'
  | 'VERSION_CONFLICT';

export const DETAILED_WORLD_SYNC_LABELS: Record<
  DetailedWorldSyncStatus,
  string
> = {
  LOCAL_ONLY: 'Apenas local',
  PENDING_UPLOAD: 'Aguardando envio',
  UPLOADING: 'Enviando para a nuvem',
  SYNCED: 'Sincronizado',
  DOWNLOADING: 'Baixando da nuvem',
  RECONSTRUCTING: 'Reconstruindo',
  VERIFYING_INTEGRITY: 'Verificando integridade',
  SYNC_ERROR: 'Falha na sincronização',
  VERSION_CONFLICT: 'Conflito de versões',
};

export interface WorldCloudSyncState {
  worldId: string;
  worldName?: string;
  status: 'SYNCED' | 'PENDING' | 'SYNCING' | 'ERROR';
  detailedStatus: DetailedWorldSyncStatus;
  detailedLabel: string;
  error?: string | null;
  updatedAt: number;
  lastRevisionId?: string | null;
  lastChunksUploaded?: number;
  lastUnchangedChunksSkipped?: number;
}

export interface CloudSyncBatchSummary {
  completedAt: number;
  unchangedSkippedWorldIds: string[];
  incrementalUploadedWorldIds: string[];
  newUploadedWorldIds: string[];
  downloadedWorldIds: string[];
  conflictPreservedWorldIds: string[];
  failedWorldIds: string[];
  totalChunksUploaded: number;
  totalChunksSkipped: number;
  durationMs: number;
}

export interface ReconciliationProgressState {
  active: boolean;
  showModal: boolean;
  dismissedByUser: boolean;
  canDismissToPlayLocal: boolean;
  stageNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  stageLabel: string;
  microDetail: string;
  progressPercent: number;
  completedUnits: number;
  totalUnits: number;
  worldsIdentifiedInCloud: number;
  worldsIdentifiedLocally: number;
  worldsSyncedCount: number;
  worldsTotalToProcess: number;
  currentWorldId: string | null;
  currentWorldName: string | null;
  hasErrors: boolean;
  errorSummary: string | null;
}

export interface CloudSyncGlobalDiagnostics {
  localWorldsCount: number;
  cloudWorldsCount: number;
  syncedWorldsCount: number;
  pendingWorldsCount: number;
  downloadedWorldsCount: number;
  completedOperationsCount: number;
  failedOperationsCount: number;
}

export interface CloudSyncDiagnosticLogEntry {
  id: string;
  timestamp: number;
  stage: string;
  worldId: string | null;
  worldName: string | null;
  operation: string;
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  message: string;
}

export interface CloudSyncSnapshot {
  user: {
    uid: string;
    displayName: string;
    email: string | null;
    photoURL: string | null;
    emailVerified: boolean;
  } | null;
  isAuthReady: boolean;
  syncStatus: 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR' | 'OFFLINE';
  statusMessage: string | null;
  lastSyncedAt: number | null;
  cloudWorldsCount: number;
  entitlements: UserEntitlementRecord[];
  transferProgress: CloudTransferProgress | null;
  worldSyncStates: Record<string, WorldCloudSyncState>;
  pendingUploadsCount: number;
  lastSyncSummary: CloudSyncBatchSummary | null;
  reconciliation: ReconciliationProgressState;
  diagnostics: CloudSyncGlobalDiagnostics;
  diagnosticLogs: CloudSyncDiagnosticLogEntry[];
}

type CloudSyncListener = (snapshot: CloudSyncSnapshot) => void;

const STAGE_LABELS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, string> = {
  1: 'Autenticando conta Google',
  2: 'Consultando mundos disponíveis na nuvem',
  3: 'Consultando mundos salvos neste dispositivo',
  4: 'Comparando os mundos e identificando alterações',
  5: 'Enviando mundos novos ou modificados',
  6: 'Baixando mundos existentes na nuvem',
  7: 'Reconstruindo os mundos no armazenamento local',
  8: 'Validando integridade dos arquivos e manifestos',
  9: 'Finalizando a sincronização',
};

/**
 * Recursively strips `undefined` values and non-finite numbers so Firestore native maps/lists
 * never throw serialization errors and always satisfy strict security rules.
 */
function sanitizeForFirestore<T>(val: T): T {
  if (val === null || val === undefined) {
    return null as unknown as T;
  }
  if (typeof val === 'number') {
    return (Number.isFinite(val) ? val : 0) as unknown as T;
  }
  if (typeof val === 'string' || typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out as unknown as T;
  }
  return null as unknown as T;
}

function sanitizeValidId(rawId: string, fallback = 'id_default'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function sanitizeString(
  raw: string | null | undefined,
  minLen: number,
  maxLen: number,
  fallback: string
): string {
  const trimmed = String(raw ?? '').trim();
  const base = trimmed.length >= minLen ? trimmed : fallback;
  return base.slice(0, maxLen);
}

class FirebaseCloudSyncService {
  private currentUser: User | null = null;
  private isAuthReady = false;
  private syncStatus: CloudSyncSnapshot['syncStatus'] = 'IDLE';
  private statusMessage: string | null = null;
  private lastSyncedAt: number | null = null;
  private cloudWorldsCount = 0;
  private entitlements: UserEntitlementRecord[] = [];
  private transferProgress: CloudTransferProgress | null = null;
  private listeners = new Set<CloudSyncListener>();
  private profileReadyForUid: string | null = null;
  private activeProfileSyncPromise: Promise<boolean> | null = null;
  private activeWorldsSyncPromise: Promise<WorldMetadata[]> | null = null;
  private activeReconciliationPromise: Promise<void> | null = null;
  private activeWorldUploads = new Map<
    string,
    Promise<{
      ok: boolean;
      message: string;
      noNewRevisionCreated?: boolean;
      chunksUploaded?: number;
      unchangedChunksSkipped?: number;
      telemetry?: CloudPublishTelemetry;
    }>
  >();
  private dirtyDuringUploadWorldIds = new Set<string>();
  private pendingWorldSyncReasons = new Map<string, string>();
  private worldSyncStates = new Map<string, WorldCloudSyncState>();
  private isProcessingQueue = false;
  private lastSyncSummary: CloudSyncBatchSummary | null = null;

  private sessionDownloadedCount = 0;
  private sessionCompletedOpsCount = 0;
  private sessionFailedOpsCount = 0;
  private diagnosticLogs: CloudSyncDiagnosticLogEntry[] = [];

  private reconciliation: ReconciliationProgressState = {
    active: false,
    showModal: false,
    dismissedByUser: false,
    canDismissToPlayLocal: false,
    stageNumber: 1,
    stageLabel: STAGE_LABELS[1],
    microDetail: 'Aguardando autenticação...',
    progressPercent: 0,
    completedUnits: 0,
    totalUnits: 1,
    worldsIdentifiedInCloud: 0,
    worldsIdentifiedLocally: 0,
    worldsSyncedCount: 0,
    worldsTotalToProcess: 0,
    currentWorldId: null,
    currentWorldName: null,
    hasErrors: false,
    errorSummary: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      // Preserve the original local device UID before any login occurs
      this.getOrStoreLegacyLocalUid();

      onAuthStateChanged(auth, async (user) => {
        this.currentUser = user;
        this.isAuthReady = true;
        this.profileReadyForUid = null;

        if (user) {
          this.appendLog(
            'AUTH',
            null,
            null,
            'onAuthStateChanged',
            'INFO',
            `Sessão Google ativa detectada para UID ${user.uid}.`
          );
          await this.runPostLoginReconciliation(user, 'auth_state_changed');
        } else {
          this.syncStatus = 'IDLE';
          this.statusMessage = null;
          this.cloudWorldsCount = 0;
          this.entitlements = [];
          this.transferProgress = null;
          this.reconciliation = {
            ...this.reconciliation,
            active: false,
            showModal: false,
            dismissedByUser: false,
            progressPercent: 0,
          };
          this.notifyListeners();
        }
      });
    }
  }

  private appendLog(
    stage: string,
    worldId: string | null,
    worldName: string | null,
    operation: string,
    level: CloudSyncDiagnosticLogEntry['level'],
    message: string
  ): void {
    const entry: CloudSyncDiagnosticLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      stage,
      worldId,
      worldName,
      operation,
      level,
      message,
    };
    this.diagnosticLogs.unshift(entry);
    if (this.diagnosticLogs.length > 120) {
      this.diagnosticLogs.length = 120;
    }
    if (level === 'ERROR') {
      console.error(
        `[CloudSync:${stage}] (${operation}${worldId ? ` world=${worldId}` : ''}) ${message}`
      );
    } else if (level === 'WARN') {
      console.warn(
        `[CloudSync:${stage}] (${operation}${worldId ? ` world=${worldId}` : ''}) ${message}`
      );
    }
  }

  public clearDiagnosticLogs(): void {
    this.diagnosticLogs = [];
    this.notifyListeners();
  }

  public dismissReconciliationModal(): void {
    if (this.reconciliation.canDismissToPlayLocal || !this.reconciliation.active) {
      this.reconciliation = {
        ...this.reconciliation,
        showModal: false,
        dismissedByUser: true,
      };
      this.notifyListeners();
    }
  }

  public openReconciliationModal(): void {
    this.reconciliation = {
      ...this.reconciliation,
      showModal: true,
      dismissedByUser: false,
    };
    this.notifyListeners();
  }

  private updateReconciliation(
    patch: Partial<ReconciliationProgressState>
  ): void {
    const nextStage = patch.stageNumber ?? this.reconciliation.stageNumber;
    const nextCompleted =
      patch.completedUnits ?? this.reconciliation.completedUnits;
    const nextTotal = Math.max(
      1,
      patch.totalUnits ?? this.reconciliation.totalUnits
    );
    const computedPercent =
      patch.progressPercent !== undefined
        ? patch.progressPercent
        : Math.min(99, Math.max(0, Math.round((nextCompleted / nextTotal) * 100)));

    this.reconciliation = {
      ...this.reconciliation,
      ...patch,
      stageNumber: nextStage,
      stageLabel: patch.stageLabel ?? STAGE_LABELS[nextStage],
      completedUnits: nextCompleted,
      totalUnits: nextTotal,
      progressPercent: computedPercent,
    };
    this.notifyListeners();
  }

  private setWorldDetailedState(
    worldId: string,
    detailedStatus: DetailedWorldSyncStatus,
    options?: {
      worldName?: string;
      error?: string | null;
      lastRevisionId?: string | null;
      lastChunksUploaded?: number;
      lastUnchangedChunksSkipped?: number;
    }
  ): void {
    const prev = this.worldSyncStates.get(worldId);
    let legacyStatus: WorldCloudSyncState['status'] = 'PENDING';
    if (detailedStatus === 'SYNCED') {
      legacyStatus = 'SYNCED';
    } else if (
      detailedStatus === 'UPLOADING' ||
      detailedStatus === 'DOWNLOADING' ||
      detailedStatus === 'RECONSTRUCTING' ||
      detailedStatus === 'VERIFYING_INTEGRITY'
    ) {
      legacyStatus = 'SYNCING';
    } else if (detailedStatus === 'SYNC_ERROR') {
      legacyStatus = 'ERROR';
    } else {
      legacyStatus = 'PENDING';
    }

    this.worldSyncStates.set(worldId, {
      worldId,
      worldName: options?.worldName ?? prev?.worldName,
      status: legacyStatus,
      detailedStatus,
      detailedLabel: DETAILED_WORLD_SYNC_LABELS[detailedStatus],
      error: options?.error !== undefined ? options.error : null,
      updatedAt: Date.now(),
      lastRevisionId:
        options?.lastRevisionId !== undefined
          ? options.lastRevisionId
          : prev?.lastRevisionId ?? null,
      lastChunksUploaded:
        options?.lastChunksUploaded !== undefined
          ? options.lastChunksUploaded
          : prev?.lastChunksUploaded,
      lastUnchangedChunksSkipped:
        options?.lastUnchangedChunksSkipped !== undefined
          ? options.lastUnchangedChunksSkipped
          : prev?.lastUnchangedChunksSkipped,
    });
    this.notifyListeners();
  }

  /**
   * Unified single-flight post-login reconciliation coordinator.
   * Ensures `onAuthStateChanged` and `signInWithGoogle` never race or duplicate execution.
   */
  public async runPostLoginReconciliation(
    userOverride?: User | null,
    trigger: 'google_login' | 'auth_state_changed' | 'manual_sync' = 'manual_sync'
  ): Promise<void> {
    const user = userOverride || this.currentUser || auth.currentUser;
    if (!user || !user.uid) return;

    if (this.activeReconciliationPromise) {
      if (trigger === 'google_login' || trigger === 'manual_sync') {
        this.reconciliation = {
          ...this.reconciliation,
          showModal: true,
          dismissedByUser: false,
        };
        this.notifyListeners();
      }
      return this.activeReconciliationPromise;
    }

    this.activeReconciliationPromise = (async () => {
      const localInitialCount = SaveManager.listWorlds().length;
      this.syncStatus = 'SYNCING';
      this.statusMessage = 'Sincronizando seus mundos com a nuvem...';

      this.reconciliation = {
        active: true,
        showModal: true,
        dismissedByUser: false,
        canDismissToPlayLocal: false,
        stageNumber: 1,
        stageLabel: STAGE_LABELS[1],
        microDetail: `Conta conectada: ${user.displayName || user.email || user.uid.slice(0, 8)}`,
        progressPercent: 4,
        completedUnits: 1,
        totalUnits: 20,
        worldsIdentifiedInCloud: 0,
        worldsIdentifiedLocally: localInitialCount,
        worldsSyncedCount: 0,
        worldsTotalToProcess: localInitialCount,
        currentWorldId: null,
        currentWorldName: null,
        hasErrors: false,
        errorSummary: null,
      };
      this.notifyListeners();

      try {
        await this.ensureUserProfileSynced(user);
        this.sessionCompletedOpsCount++;

        await this.fetchUserEntitlements(user.uid);
        this.sessionCompletedOpsCount++;

        await this.syncAllWorldsWithCloud();
        await this.syncAllGuestProfilesWithCloud();
        await this.processPendingWorldSyncQueue();

        const hasAnyError = Array.from(this.worldSyncStates.values()).some(
          (st) => st.detailedStatus === 'SYNC_ERROR'
        );
        const hasPending =
          this.pendingWorldSyncReasons.size > 0 ||
          this.activeWorldUploads.size > 0;

        if (hasAnyError) {
          this.syncStatus = 'ERROR';
          this.updateReconciliation({
            active: false,
            canDismissToPlayLocal: true,
            stageNumber: 9,
            stageLabel: STAGE_LABELS[9],
            microDetail:
              'Sincronização finalizada com alertas em alguns mundos. Verifique o diagnóstico.',
            progressPercent: 100,
            hasErrors: true,
          });
        } else if (hasPending) {
          this.syncStatus = 'SYNCING';
          this.updateReconciliation({
            active: true,
            canDismissToPlayLocal: true,
            stageNumber: 5,
            stageLabel: STAGE_LABELS[5],
            microDetail: 'Concluindo envios pendentes em segundo plano...',
          });
        } else {
          this.syncStatus = 'SYNCED';
          this.lastSyncedAt = Date.now();
          const finalWorldsCount = SaveManager.listWorlds().length;
          this.updateReconciliation({
            active: false,
            canDismissToPlayLocal: true,
            stageNumber: 9,
            stageLabel: STAGE_LABELS[9],
            microDetail: `Mundos sincronizados: ${finalWorldsCount} de ${finalWorldsCount}`,
            progressPercent: 100,
            completedUnits: this.reconciliation.totalUnits,
            worldsSyncedCount: finalWorldsCount,
            worldsTotalToProcess: finalWorldsCount,
          });
          // Automatically close the post-login sync screen once 100% complete
          setTimeout(() => {
            if (!this.reconciliation.active && !this.reconciliation.hasErrors) {
              this.reconciliation = {
                ...this.reconciliation,
                showModal: false,
              };
              this.notifyListeners();
            }
          }, 550);
        }
      } catch (err: any) {
        this.sessionFailedOpsCount++;
        const errMsg =
          err?.message || 'Erro durante a reconciliação com a nuvem.';
        this.appendLog(
          'RECONCILIATION',
          null,
          null,
          'runPostLoginReconciliation',
          'ERROR',
          errMsg
        );
        this.syncStatus = 'ERROR';
        this.statusMessage = `Falha na sincronização: ${errMsg}`;
        this.updateReconciliation({
          active: false,
          canDismissToPlayLocal: true,
          hasErrors: true,
          errorSummary: errMsg,
          microDetail: errMsg,
        });
      } finally {
        this.notifyListeners();
      }
    })();

    try {
      await this.activeReconciliationPromise;
    } finally {
      this.activeReconciliationPromise = null;
    }
  }

  private updateTransferProgress(progress: CloudTransferProgress): void {
    this.transferProgress = { ...progress };
    const wId = progress.worldId;
    const wName = progress.worldName || 'Mundo';

    if (progress.phase === 'PAUSED_INTERRUPTED' || progress.phase === 'ERROR') {
      this.syncStatus = 'ERROR';
      if (progress.lastError) {
        this.statusMessage = progress.lastError;
      }
      if (wId) {
        this.setWorldDetailedState(wId, 'SYNC_ERROR', {
          worldName: wName,
          error: progress.lastError,
        });
      }
    } else if (progress.phase === 'UPLOADING_CHUNKS') {
      this.syncStatus = 'SYNCING';
      if (wId) {
        this.setWorldDetailedState(wId, 'UPLOADING', { worldName: wName });
      }
      if (this.reconciliation.active) {
        this.updateReconciliation({
          stageNumber: 5,
          stageLabel: STAGE_LABELS[5],
          currentWorldId: wId,
          currentWorldName: wName,
          microDetail: `Enviando mundo: ${wName} · Enviando chunks: ${progress.chunksUploaded} de ${Math.max(1, progress.chunksTotal)}`,
        });
      }
    } else if (progress.phase === 'DOWNLOADING_CHUNKS') {
      this.syncStatus = 'SYNCING';
      if (wId) {
        this.setWorldDetailedState(wId, 'DOWNLOADING', { worldName: wName });
      }
      if (this.reconciliation.active) {
        this.updateReconciliation({
          stageNumber: 6,
          stageLabel: STAGE_LABELS[6],
          currentWorldId: wId,
          currentWorldName: wName,
          microDetail: `Baixando mundo: ${wName} · Baixando partes: ${progress.chunksUploaded} de ${Math.max(1, progress.chunksTotal)}`,
        });
      }
    } else if (progress.phase === 'RECONSTRUCTING_WORLD') {
      this.syncStatus = 'SYNCING';
      if (wId) {
        this.setWorldDetailedState(wId, 'RECONSTRUCTING', { worldName: wName });
      }
      if (this.reconciliation.active) {
        this.updateReconciliation({
          stageNumber: 7,
          stageLabel: STAGE_LABELS[7],
          currentWorldId: wId,
          currentWorldName: wName,
          microDetail: `Reconstruindo no armazenamento local: ${wName} (${progress.chunksTotal} partes)`,
        });
      }
    } else if (
      progress.phase === 'VERIFYING_INTEGRITY' ||
      progress.phase === 'COMMITTING_MANIFEST'
    ) {
      this.syncStatus = 'SYNCING';
      if (wId) {
        this.setWorldDetailedState(wId, 'VERIFYING_INTEGRITY', {
          worldName: wName,
        });
      }
      if (this.reconciliation.active) {
        this.updateReconciliation({
          stageNumber: 8,
          stageLabel: STAGE_LABELS[8],
          currentWorldId: wId,
          currentWorldName: wName,
          microDetail: `Validando integridade: ${progress.chunksUploaded} de ${Math.max(1, progress.chunksTotal)} partes (${wName})`,
        });
      }
    } else if (progress.phase === 'COMPLETED') {
      if (
        this.pendingWorldSyncReasons.size === 0 &&
        this.activeWorldUploads.size <= 1 &&
        !this.reconciliation.active
      ) {
        this.syncStatus = 'SYNCED';
      }
    } else if (progress.phase !== 'IDLE') {
      this.syncStatus = 'SYNCING';
    }
    this.notifyListeners();
  }

  public setMaxUploadConcurrency(limit: number): void {
    cloudWorldStorageEngine.setMaxConcurrency(limit);
    if (this.transferProgress) {
      this.transferProgress = {
        ...this.transferProgress,
        maxConcurrency: cloudWorldStorageEngine.getMaxConcurrency(),
      };
      this.notifyListeners();
    }
  }

  public getMaxUploadConcurrency(): number {
    return cloudWorldStorageEngine.getMaxConcurrency();
  }

  public getOrStoreLegacyLocalUid(): string {
    try {
      const existing = localStorage.getItem(LEGACY_UID_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_-]{1,128}$/.test(existing)) {
        return existing;
      }
      const localUid = sanitizeValidId(
        getOrCreateLocalDevicePlayerUid(),
        'player_local_default'
      );
      localStorage.setItem(LEGACY_UID_STORAGE_KEY, localUid);
      return localUid;
    } catch {
      return 'player_local_default';
    }
  }

  public getAuthenticatedUid(): string | null {
    const uid = this.currentUser?.uid || auth.currentUser?.uid || null;
    if (uid && /^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      return uid;
    }
    return null;
  }

  /**
   * Returns true if `candidateOwnerId` matches either the authenticated Firebase UID
   * or the player's pre-login local device UID (so tamed mounts and structures created
   * offline before signing in remain owned by the player).
   */
  public isOwnedByCurrentPlayer(candidateOwnerId?: string | null): boolean {
    if (!candidateOwnerId) return false;
    const authUid = this.getAuthenticatedUid();
    if (authUid && candidateOwnerId === authUid) return true;
    const legacyUid = this.getOrStoreLegacyLocalUid();
    if (legacyUid && candidateOwnerId === legacyUid) return true;
    const currentDeviceUid = getOrCreateLocalDevicePlayerUid();
    return candidateOwnerId === currentDeviceUid;
  }

  public getWorldSyncState(worldId: string): WorldCloudSyncState {
    const existing = this.worldSyncStates.get(worldId);
    if (existing) return { ...existing };

    const meta = SaveManager.listWorlds().find((w) => w.id === worldId);
    const isUserLoggedIn = Boolean(this.currentUser || auth.currentUser);

    if (!isUserLoggedIn) {
      return {
        worldId,
        worldName: meta?.name,
        status: 'PENDING',
        detailedStatus: 'LOCAL_ONLY',
        detailedLabel: DETAILED_WORLD_SYNC_LABELS.LOCAL_ONLY,
        error: null,
        updatedAt: meta?.updatedAt || Date.now(),
        lastRevisionId: meta?.lastSyncedRevisionId || null,
      };
    }

    if (meta) {
      if (meta.conflictInfo) {
        return {
          worldId,
          worldName: meta.name,
          status: 'SYNCED',
          detailedStatus: 'VERSION_CONFLICT',
          detailedLabel: DETAILED_WORLD_SYNC_LABELS.VERSION_CONFLICT,
          error: null,
          updatedAt: meta.lastSyncedAt || meta.updatedAt || Date.now(),
          lastRevisionId: meta.lastSyncedRevisionId || null,
        };
      }
      if (
        meta.syncPending === false &&
        Boolean(meta.lastSyncedRevisionId || meta.lastSyncedContentHash)
      ) {
        return {
          worldId,
          worldName: meta.name,
          status: 'SYNCED',
          detailedStatus: 'SYNCED',
          detailedLabel: DETAILED_WORLD_SYNC_LABELS.SYNCED,
          error: null,
          updatedAt: meta.lastSyncedAt || meta.updatedAt || Date.now(),
          lastRevisionId: meta.lastSyncedRevisionId || null,
        };
      }
    }
    return {
      worldId,
      worldName: meta?.name,
      status: 'PENDING',
      detailedStatus: 'PENDING_UPLOAD',
      detailedLabel: DETAILED_WORLD_SYNC_LABELS.PENDING_UPLOAD,
      error: null,
      updatedAt: meta?.updatedAt || Date.now(),
      lastRevisionId: meta?.lastSyncedRevisionId || null,
    };
  }

  public getSnapshot(): CloudSyncSnapshot {
    const u = this.currentUser || auth.currentUser;
    const localWorlds = SaveManager.listWorlds();
    const statesRecord: Record<string, WorldCloudSyncState> = {};

    let syncedWorldsCount = 0;
    let pendingWorldsCount = 0;

    for (const w of localWorlds) {
      const st = this.getWorldSyncState(w.id);
      statesRecord[w.id] = st;
      if (
        st.detailedStatus === 'SYNCED' ||
        st.detailedStatus === 'VERSION_CONFLICT'
      ) {
        syncedWorldsCount++;
      } else {
        pendingWorldsCount++;
      }
    }
    for (const [id, st] of this.worldSyncStates.entries()) {
      if (!statesRecord[id]) {
        statesRecord[id] = { ...st };
        if (
          st.detailedStatus === 'DOWNLOADING' ||
          st.detailedStatus === 'RECONSTRUCTING' ||
          st.detailedStatus === 'VERIFYING_INTEGRITY' ||
          st.detailedStatus === 'UPLOADING'
        ) {
          pendingWorldsCount++;
        }
      }
    }

    const pendingUploadsCount =
      this.pendingWorldSyncReasons.size + this.activeWorldUploads.size;

    const diagnostics: CloudSyncGlobalDiagnostics = {
      localWorldsCount: localWorlds.length,
      cloudWorldsCount: this.cloudWorldsCount,
      syncedWorldsCount,
      pendingWorldsCount,
      downloadedWorldsCount: this.sessionDownloadedCount,
      completedOperationsCount: this.sessionCompletedOpsCount,
      failedOperationsCount: this.sessionFailedOpsCount,
    };

    return {
      user: u
        ? {
            uid: u.uid,
            displayName: u.displayName || 'Aventureiro',
            email: u.email || null,
            photoURL: u.photoURL || null,
            emailVerified: Boolean(u.emailVerified),
          }
        : null,
      isAuthReady: this.isAuthReady,
      syncStatus: this.syncStatus,
      statusMessage: this.statusMessage,
      lastSyncedAt: this.lastSyncedAt,
      cloudWorldsCount: this.cloudWorldsCount,
      entitlements: [...this.entitlements],
      transferProgress: this.transferProgress
        ? { ...this.transferProgress }
        : null,
      worldSyncStates: statesRecord,
      pendingUploadsCount,
      lastSyncSummary: this.lastSyncSummary
        ? { ...this.lastSyncSummary }
        : null,
      reconciliation: { ...this.reconciliation },
      diagnostics,
      diagnosticLogs: this.diagnosticLogs.slice(0, 50),
    };
  }

  public subscribe(listener: CloudSyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch {
        // ignore listener errors
      }
    }
  }

  /**
   * Enqueues a world for non-blocking background cloud synchronization.
   * Deduplicates multiple requests for the same world so exiting a world or saving
   * repeatedly never starts concurrent uploads for the same world, and marks `dirtyDuringUploadWorldIds`
   * if an upload is already in flight so newer edits are automatically uploaded right after!
   */
  public enqueueWorldSync(worldId: string, reason = 'background'): void {
    if (!worldId) return;
    const cleanWorldId = sanitizeValidId(worldId);
    this.pendingWorldSyncReasons.set(cleanWorldId, reason);

    if (this.activeWorldUploads.has(cleanWorldId)) {
      this.dirtyDuringUploadWorldIds.add(cleanWorldId);
    } else {
      const current = this.worldSyncStates.get(cleanWorldId);
      if (!current || current.status !== 'SYNCING') {
        const user = this.currentUser || auth.currentUser;
        this.setWorldDetailedState(
          cleanWorldId,
          user ? 'PENDING_UPLOAD' : 'LOCAL_ONLY',
          {
            lastRevisionId: current?.lastRevisionId || null,
          }
        );
      }
    }
    this.notifyListeners();

    const user = this.currentUser || auth.currentUser;
    if (user && user.uid && user.emailVerified && !this.activeWorldsSyncPromise) {
      void this.processPendingWorldSyncQueue();
    }
  }

  /**
   * Processes queued per-world background uploads one by one without blocking UI navigation.
   */
  public async processPendingWorldSyncQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) return;

    this.isProcessingQueue = true;
    try {
      while (this.pendingWorldSyncReasons.size > 0) {
        const nextEntry = this.pendingWorldSyncReasons.entries().next().value;
        if (!nextEntry) break;
        const [worldId, reason] = nextEntry;
        this.pendingWorldSyncReasons.delete(worldId);

        // Wait if an upload is currently in flight for this worldId
        const existingInFlight = this.activeWorldUploads.get(worldId);
        if (existingInFlight) {
          try {
            await existingInFlight;
          } catch {
            // ignore, we will re-evaluate below
          }
        }

        const compactLocal = await SaveManager.getCompactWorldForCloud(worldId);
        if (!compactLocal) {
          this.worldSyncStates.delete(worldId);
          continue;
        }

        const canonicalHash = SaveManager.computeCanonicalSyncHash(compactLocal);
        if (
          compactLocal.metadata.syncPending === false &&
          compactLocal.metadata.lastSyncedContentHash === canonicalHash &&
          compactLocal.metadata.lastSyncedRevisionId
        ) {
          this.setWorldDetailedState(worldId, 'SYNCED', {
            worldName: compactLocal.metadata.name,
            lastRevisionId: compactLocal.metadata.lastSyncedRevisionId,
          });
          continue;
        }

        try {
          this.appendLog(
            'QUEUE_UPLOAD',
            worldId,
            compactLocal.metadata.name,
            `enqueue:${reason}`,
            'INFO',
            `Iniciando envio em segundo plano do mundo "${compactLocal.metadata.name}".`
          );
          await this.uploadWorldToCloud(compactLocal);
        } catch (err: any) {
          this.sessionFailedOpsCount++;
          const msg =
            err?.message || 'Falha ao sincronizar mundo em segundo plano.';
          this.setWorldDetailedState(worldId, 'SYNC_ERROR', {
            worldName: compactLocal.metadata.name,
            error: msg,
          });
          this.appendLog(
            'QUEUE_UPLOAD',
            worldId,
            compactLocal.metadata.name,
            `enqueue:${reason}`,
            'ERROR',
            msg
          );
        }
      }
    } finally {
      this.isProcessingQueue = false;
      this.notifyListeners();
    }
  }

  public async signInWithGoogle(): Promise<{
    ok: boolean;
    message: string;
    user?: User;
  }> {
    try {
      this.syncStatus = 'SYNCING';
      this.statusMessage = 'Abrindo login seguro do Google...';
      this.updateReconciliation({
        active: true,
        showModal: true,
        dismissedByUser: false,
        canDismissToPlayLocal: false,
        stageNumber: 1,
        stageLabel: STAGE_LABELS[1],
        microDetail: 'Aguardando confirmação na janela do Google...',
        progressPercent: 2,
      });

      const credential = await signInWithPopup(auth, googleProvider);
      const user = credential.user;
      this.currentUser = user;

      // Migrate local player UID reference in settings if displayName wasn't customized yet
      const settings = SaveManager.loadSettings();
      if (
        user.displayName &&
        (!settings.playerName || settings.playerName === 'Viajante')
      ) {
        SaveManager.saveSettings({
          ...settings,
          playerName: user.displayName.trim().slice(0, 18),
        });
      }

      await this.runPostLoginReconciliation(user, 'google_login');

      return {
        ok: (this.syncStatus as string) !== 'ERROR',
        message:
          this.statusMessage ||
          `Bem-vindo(a), ${user.displayName || 'Aventureiro'}! Seus mundos estão sincronizados.`,
        user,
      };
    } catch (err: any) {
      const code = String(err?.code || '');
      let friendlyMsg = 'Não foi possível concluir o login com Google.';
      if (code === 'auth/popup-closed-by-user') {
        friendlyMsg = 'Janela de login fechada antes de concluir.';
      } else if (code === 'auth/popup-blocked') {
        friendlyMsg =
          'O navegador bloqueou o pop-up de login. Permita pop-ups ou abra o jogo em uma nova guia.';
      } else if (code === 'auth/unauthorized-domain') {
        friendlyMsg =
          'Domínio ainda não autorizado no Firebase Authentication. Adicione este domínio em Authentication → Settings → Authorized domains no Firebase Console.';
      } else if (err?.message) {
        friendlyMsg = err.message;
      }
      this.syncStatus = this.currentUser ? 'SYNCED' : 'IDLE';
      this.statusMessage = friendlyMsg;
      this.updateReconciliation({
        active: false,
        showModal: false,
        progressPercent: 0,
      });
      return { ok: false, message: friendlyMsg };
    }
  }

  public async signOutUser(): Promise<void> {
    try {
      await signOut(auth);
      this.currentUser = null;
      this.profileReadyForUid = null;
      this.syncStatus = 'IDLE';
      this.statusMessage =
        'Você saiu da conta Google. Seus mundos locais permanecem salvos neste dispositivo.';
      this.cloudWorldsCount = 0;
      this.entitlements = [];
      this.worldSyncStates.clear();
      this.reconciliation = {
        ...this.reconciliation,
        active: false,
        showModal: false,
        progressPercent: 0,
      };
      this.notifyListeners();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }

  /**
   * Ensures `/users/{userId}` and `/users/{userId}/private/account` exist and are up to date.
   */
  public async ensureUserProfileSynced(
    userOverride?: User | null
  ): Promise<boolean> {
    const user = userOverride || this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) return false;
    const uid = sanitizeValidId(user.uid);
    if (this.profileReadyForUid === uid) return true;
    if (this.activeProfileSyncPromise) return this.activeProfileSyncPromise;

    this.activeProfileSyncPromise = (async () => {
      const userPath = `users/${uid}`;
      const userRef = doc(db, 'users', uid);

      const settings = SaveManager.loadSettings();
      const appearance = SaveManager.getAccountAppearance();

      const cleanAppearance = sanitizeForFirestore({
        gender: appearance.gender || 'masculino',
        skinColor: String(appearance.skinColor || '#fdba74').slice(0, 32),
        skinMark: String(appearance.skinMark || 'none').slice(0, 32),
        hairColor: String(appearance.hairColor || '#451a03').slice(0, 32),
        hairStyle: String(appearance.hairStyle || 'adventurer').slice(0, 32),
        eyeStyle: String(appearance.eyeStyle || 'classic').slice(0, 32),
        eyeColor: String(appearance.eyeColor || '#0f172a').slice(0, 32),
      });

      const cleanSettings = sanitizeForFirestore({
        soundEnabled: Boolean(settings.soundEnabled),
        soundVolume: Number(settings.soundVolume ?? 0.35),
        ambientVolume: Number(settings.ambientVolume ?? 0.45),
        musicVolume: Number(settings.musicVolume ?? 0.2),
        autoSaveIntervalSec: Number(settings.autoSaveIntervalSec ?? 20),
        serverSyncEnabled: Boolean(settings.serverSyncEnabled),
        showTouchControls: Boolean(settings.showTouchControls),
        cameraZoom: Number(settings.cameraZoom ?? 1.15),
        hudScale: Number(settings.hudScale ?? 1.0),
        hudOpacity: Number(settings.hudOpacity ?? 0.96),
        playerName: sanitizeString(
          settings.playerName || user.displayName,
          1,
          32,
          'Viajante'
        ),
      });

      const displayName = sanitizeString(
        user.displayName || settings.playerName,
        1,
        64,
        'Aventureiro'
      );
      const photoURL = sanitizeString(user.photoURL, 0, 512, '');
      const legacyLocalUid = sanitizeValidId(
        this.getOrStoreLegacyLocalUid(),
        'player_local_default'
      );

      let existingSnap;
      try {
        existingSnap = await getDoc(userRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, userPath);
      }

      const profilePayload = {
        uid,
        displayName,
        photoURL,
        legacyLocalUid,
        appearance: cleanAppearance,
        settings: cleanSettings,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!existingSnap.exists()) {
        try {
          await setDoc(userRef, profilePayload);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, userPath);
        }
      } else {
        const remoteData = existingSnap.data();
        if (
          remoteData?.appearance &&
          typeof remoteData.appearance === 'object' &&
          !settings.accountAppearance
        ) {
          SaveManager.saveAccountAppearance(
            remoteData.appearance as Partial<PlayerAppearance>
          );
        }
        try {
          await updateDoc(userRef, {
            displayName,
            photoURL,
            legacyLocalUid,
            appearance: cleanAppearance,
            settings: cleanSettings,
            updatedAt: serverTimestamp(),
          });
        } catch {
          try {
            await setDoc(userRef, profilePayload);
          } catch (err2) {
            handleFirestoreError(err2, OperationType.UPDATE, userPath);
          }
        }
      }

      // Sync isolated PII record (/users/{uid}/private/account)
      if (user.email && user.email.trim().length >= 3) {
        const privPath = `users/${uid}/private/account`;
        const privRef = doc(db, 'users', uid, 'private', 'account');
        const cleanEmail = sanitizeString(user.email, 3, 254, 'user@example.com');
        try {
          await setDoc(privRef, {
            uid,
            email: cleanEmail,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          try {
            await updateDoc(privRef, {
              email: cleanEmail,
              updatedAt: serverTimestamp(),
            });
          } catch (err2) {
            handleFirestoreError(err2, OperationType.WRITE, privPath);
          }
        }
      }

      this.profileReadyForUid = uid;
      this.appendLog(
        'PROFILE',
        null,
        null,
        'ensureUserProfileSynced',
        'SUCCESS',
        `Perfil da conta Google (${uid}) sincronizado no Cloud Firestore.`
      );
      return true;
    })();

    try {
      return await this.activeProfileSyncPromise;
    } finally {
      this.activeProfileSyncPromise = null;
    }
  }

  /**
   * Synchronizes the player's universal appearance & settings to `/users/{uid}` when modified in the UI.
   */
  public async syncProfileAppearanceAndSettings(): Promise<void> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.emailVerified) return;
    this.profileReadyForUid = null;
    try {
      await this.ensureUserProfileSynced(user);
    } catch {
      // ignore offline
    }
  }

  /**
   * Uploads a world save incrementally using the v2 Hybrid Cloud Storage Engine with single-flight deduplication:
   * - Never runs two concurrent uploads for the same `worldId`.
   * - If `dirtyDuringUploadWorldIds` is flagged while an upload is running, automatically runs a follow-up
   *   incremental upload right after so edits made during gameplay/exit are never dropped!
   * - Marks the local world as synced (`SaveManager.markWorldCloudSynced`) ONLY AFTER the Cloud Firestore
   *   revision is confirmed.
   */
  public async uploadWorldToCloud(
    saveDataOrWorldId: WorldSaveData | string
  ): Promise<{
    ok: boolean;
    message: string;
    noNewRevisionCreated?: boolean;
    chunksUploaded?: number;
    unchangedChunksSkipped?: number;
    telemetry?: CloudPublishTelemetry;
  }> {
    const rawId =
      typeof saveDataOrWorldId === 'string'
        ? saveDataOrWorldId
        : saveDataOrWorldId.metadata?.id;
    const worldId = sanitizeValidId(rawId || `world_${Date.now()}`);

    // Single-flight deduplication per worldId: if already uploading, flag dirty and chain follow-up!
    const existingUpload = this.activeWorldUploads.get(worldId);
    if (existingUpload) {
      this.dirtyDuringUploadWorldIds.add(worldId);
      await existingUpload.catch(() => {});
      if (this.dirtyDuringUploadWorldIds.has(worldId)) {
        this.dirtyDuringUploadWorldIds.delete(worldId);
        return this.uploadWorldToCloud(worldId);
      }
      return existingUpload;
    }

    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) {
      this.pendingWorldSyncReasons.set(worldId, 'unauthenticated_retry');
      this.setWorldDetailedState(worldId, 'LOCAL_ONLY');
      return { ok: false, message: 'Usuário não autenticado no Firebase.' };
    }

    const uploadPromise = (async () => {
      const uid = sanitizeValidId(user.uid);
      this.setWorldDetailedState(worldId, 'UPLOADING');
      this.syncStatus = 'SYNCING';
      this.notifyListeners();

      try {
        const profileOk = await this.ensureUserProfileSynced(user);
        if (!profileOk) {
          throw new Error('Perfil Firebase ainda não sincronizado.');
        }

        // Always read the latest compact local state so coalesced saves upload the freshest snapshot
        const latestCompact =
          (await SaveManager.getCompactWorldForCloud(worldId)) ||
          (typeof saveDataOrWorldId !== 'string'
            ? SaveManager.compactSaveDataForStorage(
                saveDataOrWorldId,
                false,
                18,
                false
              )
            : null);

        if (!latestCompact) {
          throw new Error(
            `Mundo local ${worldId} não encontrado para sincronização.`
          );
        }

        const legacyUid = this.getOrStoreLegacyLocalUid();
        const result = await cloudWorldStorageEngine.publishWorldIncremental(
          latestCompact,
          uid,
          legacyUid,
          (prog) => this.updateTransferProgress(prog)
        );

        // CRITICAL: Only mark the world as synced AFTER the revision is confirmed in Cloud Firestore
        if (result.ok) {
          const updatedMeta = await SaveManager.markWorldCloudSynced(worldId, {
            revisionId: result.revisionId,
            manifestHash: result.manifestHash,
            contentHash: result.contentHash,
          });
          const stillDirty =
            updatedMeta?.syncPending === true ||
            this.dirtyDuringUploadWorldIds.has(worldId);

          this.setWorldDetailedState(
            worldId,
            stillDirty ? 'PENDING_UPLOAD' : 'SYNCED',
            {
              worldName: latestCompact.metadata.name,
              lastRevisionId: result.revisionId,
              lastChunksUploaded: result.chunksUploaded,
              lastUnchangedChunksSkipped: result.unchangedChunksSkipped,
            }
          );
          this.sessionCompletedOpsCount++;
          this.appendLog(
            'UPLOAD',
            worldId,
            latestCompact.metadata.name,
            'publishWorldIncremental',
            'SUCCESS',
            result.noNewRevisionCreated
              ? `Mundo "${latestCompact.metadata.name}" verificado (0 alterações pendentes).`
              : `Mundo "${latestCompact.metadata.name}" publicado na nuvem (revisão ${result.revisionId}, ${result.chunksUploaded} partes enviadas, ${result.unchangedChunksSkipped} intactas).`
          );
        }

        this.lastSyncedAt = Date.now();
        if (
          this.pendingWorldSyncReasons.size === 0 &&
          this.activeWorldUploads.size <= 1 &&
          !this.reconciliation.active
        ) {
          this.syncStatus = 'SYNCED';
        }
        this.notifyListeners();

        const msg = result.noNewRevisionCreated
          ? `Mundo "${latestCompact.metadata.name}" já estava idêntico na nuvem (0 partes enviadas).`
          : `Mundo sincronizado (${result.chunksUploaded} parte(s) enviada(s), ${result.unchangedChunksSkipped} inalterada(s))!`;

        return {
          ok: result.ok,
          message: msg,
          noNewRevisionCreated: result.noNewRevisionCreated,
          chunksUploaded: result.chunksUploaded,
          unchangedChunksSkipped: result.unchangedChunksSkipped,
          telemetry: result.telemetry,
        };
      } catch (err: any) {
        this.sessionFailedOpsCount++;
        const errMsg =
          err?.message || 'Erro durante sincronização incremental do mundo.';
        this.setWorldDetailedState(worldId, 'SYNC_ERROR', {
          error: errMsg,
        });
        this.appendLog(
          'UPLOAD',
          worldId,
          null,
          'publishWorldIncremental',
          'ERROR',
          errMsg
        );
        this.syncStatus = 'ERROR';
        this.statusMessage = errMsg;
        this.notifyListeners();
        throw err;
      } finally {
        this.activeWorldUploads.delete(worldId);
        this.notifyListeners();
      }
    })();

    this.activeWorldUploads.set(worldId, uploadPromise);
    const res = await uploadPromise;

    // If local changes occurred while this upload was in flight, immediately run a follow-up upload!
    if (this.dirtyDuringUploadWorldIds.has(worldId)) {
      this.dirtyDuringUploadWorldIds.delete(worldId);
      return this.uploadWorldToCloud(worldId);
    }

    return res;
  }

  /**
   * Synchronizes an individual modified chunk document to `/users/{uid}/worlds/{worldId}/chunks/{chunkKey}`.
   */
  public async syncWorldChunkToCloud(
    worldId: string,
    rawChunkKey: string,
    layer: 'surface' | 'underground',
    chunkPayload: Record<string, unknown>,
    clientUpdatedAt = Date.now()
  ): Promise<void> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) return;

    const uid = sanitizeValidId(user.uid);
    const cleanWorldId = sanitizeValidId(worldId);
    const cleanChunkKey = sanitizeValidId(`${layer}_${rawChunkKey}`);
    const chunkPath = `users/${uid}/worlds/${cleanWorldId}/chunks/${cleanChunkKey}`;
    const chunkRef = doc(
      db,
      'users',
      uid,
      'worlds',
      cleanWorldId,
      'chunks',
      cleanChunkKey
    );

    const serialized = JSON.stringify(chunkPayload);
    const hash = computeChecksum(serialized);
    const storagePath = `users/${uid}/worlds/${cleanWorldId}/chunks/${cleanChunkKey}.json`;
    const revisionId = `rev_${Date.now()}`;
    const clientUpdatedAtInt = Math.max(
      0,
      Math.floor(Number(clientUpdatedAt) || Date.now())
    );

    const chunkDataMap = {
      logicalKey: cleanChunkKey,
      inlineSlice: serialized,
      storedInBucket: false,
    };

    try {
      await setDoc(chunkRef, {
        chunkKey: cleanChunkKey,
        worldId: cleanWorldId,
        ownerId: uid,
        layer,
        partIndex: 0,
        totalParts: 1,
        hash,
        sizeBytes: serialized.length,
        storagePath,
        revisionId,
        chunkData: chunkDataMap,
        clientUpdatedAt: clientUpdatedAtInt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      try {
        await updateDoc(chunkRef, {
          partIndex: 0,
          totalParts: 1,
          hash,
          sizeBytes: serialized.length,
          storagePath,
          revisionId,
          chunkData: chunkDataMap,
          clientUpdatedAt: clientUpdatedAtInt,
          updatedAt: serverTimestamp(),
        });
      } catch (err2) {
        handleFirestoreError(err2, OperationType.WRITE, chunkPath);
      }
    }
  }

  /**
   * Deletes a world save and all its associated chunk objects from Cloud Firestore / Storage.
   */
  public async deleteWorldFromCloud(worldId: string): Promise<void> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) return;
    const uid = sanitizeValidId(user.uid);
    const cleanWorldId = sanitizeValidId(worldId);

    this.pendingWorldSyncReasons.delete(cleanWorldId);
    this.dirtyDuringUploadWorldIds.delete(cleanWorldId);
    this.worldSyncStates.delete(cleanWorldId);

    await cloudWorldStorageEngine.deleteWorldAndChunksFromCloud(
      uid,
      cleanWorldId
    );
    this.cloudWorldsCount = Math.max(0, this.cloudWorldsCount - 1);
    this.lastSyncedAt = Date.now();
    this.appendLog(
      'DELETE',
      cleanWorldId,
      null,
      'deleteWorldFromCloud',
      'INFO',
      `Mundo ${cleanWorldId} e seus chunks foram removidos da nuvem.`
    );
    this.notifyListeners();
  }

  /**
   * Performs intelligent, non-destructive 5-case reconciliation between local storage (IndexedDB/localStorage)
   * and Cloud Firestore + Storage (`/users/{uid}/worlds/{worldId}` + `/chunks/{chunkKey}`),
   * updating real-time stage and micro-progress across all 9 stages:
   * - Case A (Local-Only World): Uploads all initial units and registers cloud revision.
   * - Case B (Cloud-Only World): Downloads, verifies hashes, reconstructs, and registers locally.
   * - Case C (Already Synced & Unchanged): Recognizes identical content/revision immediately with 0 chunk transfers.
   * - Case D (Synced with Local Changes): Uploads ONLY modified chunks + updated entities/manifest.
   * - Case E (Divergent Local & Cloud Changes): Preserves both versions safely via `SaveManager.saveDivergentWorldAsCopy`.
   */
  public async syncAllWorldsWithCloud(): Promise<WorldMetadata[]> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) {
      return SaveManager.listWorlds();
    }
    if (this.activeWorldsSyncPromise) {
      return this.activeWorldsSyncPromise;
    }

    this.activeWorldsSyncPromise = (async () => {
      const batchStartMs = performance.now();
      const summary: CloudSyncBatchSummary = {
        completedAt: Date.now(),
        unchangedSkippedWorldIds: [],
        incrementalUploadedWorldIds: [],
        newUploadedWorldIds: [],
        downloadedWorldIds: [],
        conflictPreservedWorldIds: [],
        failedWorldIds: [],
        totalChunksUploaded: 0,
        totalChunksSkipped: 0,
        durationMs: 0,
      };

      const uid = sanitizeValidId(user.uid);
      this.syncStatus = 'SYNCING';
      this.statusMessage = 'Consultando mundos disponíveis na nuvem...';

      // Stage 2: Querying Cloud Worlds
      this.updateReconciliation({
        active: true,
        stageNumber: 2,
        stageLabel: STAGE_LABELS[2],
        microDetail: 'Consultando coleção /users/{uid}/worlds no Cloud Firestore...',
        progressPercent: 12,
      });

      await this.ensureUserProfileSynced(user);

      // Check for any interrupted upload queues for this user
      const interruptedQueues =
        await persistentUploadQueue.listAllQueuesForUser(uid);
      const interruptedWorldIds = new Set(
        interruptedQueues.map((q) => q.worldId)
      );

      interface CloudWorldSummaryDoc {
        id: string;
        name: string;
        clientUpdatedAt: number;
        storageVersion: number;
        manifestHash: string;
        activeRevisionId: string;
        previousRevisionId: string;
        contentHash: string;
        gameplayHash: string;
        originWorldId: string;
        isCopy: boolean;
        copyNumber: number;
        sourceDb: Firestore;
      }

      const queryWorldsFromDb = async (
        targetDb: Firestore
      ): Promise<CloudWorldSummaryDoc[]> => {
        const worldsCol = collection(targetDb, 'users', uid, 'worlds');
        const q = query(worldsCol, where('ownerId', '==', uid));
        const snap = await getDocs(q);
        return snap.docs.map((d) => {
          const data = d.data();
          const summaryMap =
            (data.chunkIndexSummary as Record<string, unknown> | undefined) ||
            {};
          return {
            id: String(data.worldId || d.id),
            name: String(data.name || 'Mundo'),
            clientUpdatedAt: Number(data.clientUpdatedAt || 0),
            storageVersion: Number(data.storageVersion || 1),
            manifestHash: String(data.checksum || ''),
            activeRevisionId: String(data.activeRevisionId || ''),
            previousRevisionId: String(data.previousRevisionId || ''),
            contentHash: String(summaryMap.contentHash || ''),
            gameplayHash: String(summaryMap.gameplayHash || ''),
            originWorldId: String(
              summaryMap.originWorldId || data.worldId || d.id
            ),
            isCopy: Boolean(summaryMap.isCopy),
            copyNumber: Math.max(
              0,
              Math.floor(Number(summaryMap.copyNumber || 0))
            ),
            sourceDb: targetDb,
          };
        });
      };

      const worldsPath = `users/${uid}/worlds`;
      let cloudDocs: CloudWorldSummaryDoc[] = [];

      try {
        cloudDocs = await queryWorldsFromDb(db);
        // If primary named database has 0 worlds and fallbackDefaultDb is available, also probe fallbackDefaultDb
        if (cloudDocs.length === 0 && fallbackDefaultDb) {
          try {
            const fallbackDocs = await queryWorldsFromDb(fallbackDefaultDb);
            if (fallbackDocs.length > 0) {
              cloudDocs = fallbackDocs;
              this.appendLog(
                'CLOUD_DISCOVERY',
                null,
                null,
                'queryFallbackDefaultDb',
                'INFO',
                `Encontrados ${fallbackDocs.length} mundo(s) no banco (default); serão migrados automaticamente.`
              );
            }
          } catch {
            // ignore fallback db probe if rules on (default) deny access
          }
        }
        this.appendLog(
          'CLOUD_DISCOVERY',
          null,
          null,
          'listCloudWorlds',
          'SUCCESS',
          `Consultando mundos na nuvem: ${cloudDocs.length} de ${cloudDocs.length} identificados.`
        );
      } catch (err) {
        this.sessionFailedOpsCount++;
        this.appendLog(
          'CLOUD_DISCOVERY',
          null,
          null,
          'listCloudWorlds',
          'ERROR',
          err instanceof Error ? err.message : String(err)
        );
        handleFirestoreError(err, OperationType.LIST, worldsPath);
      }

      this.updateReconciliation({
        stageNumber: 2,
        stageLabel: STAGE_LABELS[2],
        worldsIdentifiedInCloud: cloudDocs.length,
        microDetail: `Consultando mundos: ${cloudDocs.length} de ${cloudDocs.length} identificados na nuvem`,
        progressPercent: 22,
      });

      // Stage 3: Hydrating & Querying Local Worlds
      this.updateReconciliation({
        stageNumber: 3,
        stageLabel: STAGE_LABELS[3],
        microDetail: 'Hidratando mundos salvos no IndexedDB e localStorage...',
        progressPercent: 28,
      });

      await SaveManager.hydrateFromIndexedDB();
      const localList = SaveManager.listWorlds();
      const localById = new Map(localList.map((w) => [w.id, w]));
      const cloudById = new Map(cloudDocs.map((c) => [c.id, c]));

      const allUniqueWorldIds = new Set<string>([
        ...cloudDocs.map((c) => c.id),
        ...localList.map((l) => l.id),
      ]);
      const totalUniqueWorlds = Math.max(1, allUniqueWorldIds.size);

      // Stage 4: Comparing Local vs Cloud Worlds
      this.updateReconciliation({
        stageNumber: 4,
        stageLabel: STAGE_LABELS[4],
        worldsIdentifiedLocally: localList.length,
        worldsTotalToProcess: allUniqueWorldIds.size,
        canDismissToPlayLocal: localList.length > 0 && cloudDocs.every((c) => localById.has(c.id)),
        microDetail: `Comparando ${localList.length} mundo(s) local(is) com ${cloudDocs.length} mundo(s) na nuvem...`,
        progressPercent: 34,
      });

      let processedWorldsCount = 0;

      const advanceWorldProgress = (
        stageNum: 4 | 5 | 6 | 7 | 8 | 9,
        detail: string
      ) => {
        const basePct = 35;
        const spanPct = 60;
        const pct = Math.min(
          96,
          basePct +
            Math.round((processedWorldsCount / totalUniqueWorlds) * spanPct)
        );
        this.updateReconciliation({
          stageNumber: stageNum,
          stageLabel: STAGE_LABELS[stageNum],
          worldsSyncedCount: processedWorldsCount,
          microDetail: detail,
          progressPercent: pct,
          completedUnits: 4 + processedWorldsCount,
          totalUnits: 5 + totalUniqueWorlds,
        });
      };

      // 1. Process Cloud Worlds (Cloud-Only Downloads & Bi-Directional Comparisons)
      for (const cloudEntry of cloudDocs) {
        const localMeta = localById.get(cloudEntry.id);

        if (!localMeta) {
          // CASE B (Cloud-Only World): Download, Verify, Reconstruct & Register Locally
          try {
            this.setWorldDetailedState(cloudEntry.id, 'DOWNLOADING', {
              worldName: cloudEntry.name,
            });
            advanceWorldProgress(
              6,
              `Baixando mundo da nuvem: ${cloudEntry.name}...`
            );

            const reconstructed =
              await cloudWorldStorageEngine.downloadAndReconstructWorld(
                uid,
                cloudEntry.id,
                (prog) => this.updateTransferProgress(prog),
                cloudEntry.sourceDb
              );

            if (!reconstructed || !reconstructed.metadata) {
              throw new Error(
                `Manifesto ou dados de reconstrução ausentes para o mundo "${cloudEntry.name}" (${cloudEntry.id}).`
              );
            }

            reconstructed.player.persistentPlayerId = uid;
            await SaveManager.saveWorldGuaranteed(reconstructed, true);
            const canonicalHash =
              SaveManager.computeCanonicalSyncHash(reconstructed);
            await SaveManager.markWorldCloudSynced(reconstructed.metadata.id, {
              revisionId:
                reconstructed.metadata.lastSyncedRevisionId ||
                cloudEntry.activeRevisionId ||
                'rev_cloud',
              manifestHash:
                reconstructed.metadata.lastSyncedManifestHash ||
                cloudEntry.manifestHash,
              contentHash: cloudEntry.contentHash || canonicalHash,
            });

            this.setWorldDetailedState(reconstructed.metadata.id, 'SYNCED', {
              worldName: reconstructed.metadata.name,
              lastRevisionId:
                reconstructed.metadata.lastSyncedRevisionId ||
                cloudEntry.activeRevisionId,
            });

            summary.downloadedWorldIds.push(reconstructed.metadata.id);
            this.sessionDownloadedCount++;
            this.sessionCompletedOpsCount++;

            this.appendLog(
              'DOWNLOAD',
              reconstructed.metadata.id,
              reconstructed.metadata.name,
              'downloadAndReconstructWorld',
              'SUCCESS',
              `Mundo "${reconstructed.metadata.name}" baixado, verificado e reconstruído localmente com sucesso.`
            );

            // If legacy v1 format in cloud or from fallbackDefaultDb, migrate to v2 chunked format in primary db
            if (cloudEntry.storageVersion !== 2 || cloudEntry.sourceDb !== db) {
              const upRes = await this.uploadWorldToCloud(reconstructed);
              summary.totalChunksUploaded += upRes.chunksUploaded || 0;
              summary.totalChunksSkipped += upRes.unchangedChunksSkipped || 0;
            }
          } catch (err: any) {
            this.sessionFailedOpsCount++;
            const errMsg =
              err?.message ||
              `Falha ao baixar e reconstruir o mundo "${cloudEntry.name}".`;
            summary.failedWorldIds.push(cloudEntry.id);
            this.setWorldDetailedState(cloudEntry.id, 'SYNC_ERROR', {
              worldName: cloudEntry.name,
              error: errMsg,
            });
            this.appendLog(
              'DOWNLOAD',
              cloudEntry.id,
              cloudEntry.name,
              'downloadAndReconstructWorld',
              'ERROR',
              errMsg
            );
          }

          processedWorldsCount++;
          advanceWorldProgress(
            8,
            `Mundos sincronizados: ${processedWorldsCount} de ${allUniqueWorldIds.size}`
          );
          continue;
        }

        // Both Local and Cloud exist for `cloudEntry.id`
        try {
          const fullLocal = await SaveManager.getCompactWorldForCloud(
            localMeta.id
          );
          if (!fullLocal) {
            processedWorldsCount++;
            continue;
          }

          const localContentHash =
            SaveManager.computeCanonicalSyncHash(fullLocal);
          const cloudContentHash = cloudEntry.contentHash || '';
          const hasInterruptedQueue = interruptedWorldIds.has(localMeta.id);

          const contentIdentical =
            !hasInterruptedQueue &&
            cloudEntry.storageVersion === 2 &&
            Boolean(cloudContentHash && localContentHash === cloudContentHash);

          const localSyncedRev = localMeta.lastSyncedRevisionId || '';
          const cloudActiveRev = cloudEntry.activeRevisionId || '';

          const localModifiedSinceLastSync =
            hasInterruptedQueue ||
            localMeta.syncPending !== false ||
            (Boolean(localMeta.lastSyncedContentHash) &&
              localMeta.lastSyncedContentHash !== localContentHash);

          const cloudModifiedSinceLastSync =
            Boolean(
              cloudActiveRev &&
                localSyncedRev &&
                cloudActiveRev !== localSyncedRev
            ) && !contentIdentical;

          // CASE C: World is already synchronized and unchanged
          if (
            contentIdentical ||
            (!hasInterruptedQueue &&
              cloudEntry.storageVersion === 2 &&
              !localModifiedSinceLastSync &&
              !cloudModifiedSinceLastSync &&
              Boolean(localSyncedRev && localSyncedRev === cloudActiveRev))
          ) {
            await SaveManager.markWorldCloudSynced(localMeta.id, {
              revisionId: cloudActiveRev || localSyncedRev || 'rev_synced',
              manifestHash:
                cloudEntry.manifestHash ||
                localMeta.lastSyncedManifestHash ||
                '',
              contentHash: localContentHash,
            });
            this.setWorldDetailedState(localMeta.id, 'SYNCED', {
              worldName: localMeta.name,
              lastRevisionId: cloudActiveRev || localSyncedRev,
              lastChunksUploaded: 0,
              lastUnchangedChunksSkipped: Object.keys(fullLocal.chunks || {})
                .length,
            });
            summary.unchangedSkippedWorldIds.push(localMeta.id);
            summary.totalChunksSkipped +=
              Object.keys(fullLocal.chunks || {}).length +
              Object.keys(fullLocal.undergroundChunks || {}).length;
            this.sessionCompletedOpsCount++;
            processedWorldsCount++;
            advanceWorldProgress(
              4,
              `Mundos sincronizados: ${processedWorldsCount} de ${allUniqueWorldIds.size} (${localMeta.name} intacto)`
            );
            continue;
          }

          // CASE E (Divergence Conflict): Both Local and Cloud were modified independently!
          if (localModifiedSinceLastSync && cloudModifiedSinceLastSync) {
            this.setWorldDetailedState(localMeta.id, 'VERSION_CONFLICT', {
              worldName: localMeta.name,
            });
            const cloudReconstructed =
              await cloudWorldStorageEngine.downloadAndReconstructWorld(
                uid,
                cloudEntry.id,
                (prog) => this.updateTransferProgress(prog),
                cloudEntry.sourceDb
              );
            if (cloudReconstructed && cloudReconstructed.metadata) {
              cloudReconstructed.player.persistentPlayerId = uid;
              const localUpdatedAt = Number(localMeta.updatedAt || 0);
              const cloudUpdatedAt = Number(cloudEntry.clientUpdatedAt || 0);

              if (localUpdatedAt >= cloudUpdatedAt) {
                const preservedCopy =
                  await SaveManager.saveDivergentWorldAsCopy(
                    cloudReconstructed,
                    localMeta.id,
                    'cloud_conflict'
                  );
                const primaryRes = await this.uploadWorldToCloud(fullLocal);
                const copyRes = await this.uploadWorldToCloud(preservedCopy);
                this.setWorldDetailedState(
                  preservedCopy.metadata.id,
                  'VERSION_CONFLICT',
                  {
                    worldName: preservedCopy.metadata.name,
                    lastRevisionId: copyRes.telemetry ? 'rev_conflict' : null,
                  }
                );
                summary.conflictPreservedWorldIds.push(
                  preservedCopy.metadata.id
                );
                summary.incrementalUploadedWorldIds.push(localMeta.id);
                summary.newUploadedWorldIds.push(preservedCopy.metadata.id);
                summary.totalChunksUploaded +=
                  (primaryRes.chunksUploaded || 0) +
                  (copyRes.chunksUploaded || 0);
                summary.totalChunksSkipped +=
                  (primaryRes.unchangedChunksSkipped || 0) +
                  (copyRes.unchangedChunksSkipped || 0);
              } else {
                const preservedLocalCopy =
                  await SaveManager.saveDivergentWorldAsCopy(
                    fullLocal,
                    localMeta.id,
                    'local_conflict'
                  );
                await SaveManager.saveWorldGuaranteed(cloudReconstructed, true);
                await SaveManager.markWorldCloudSynced(
                  cloudReconstructed.metadata.id,
                  {
                    revisionId: cloudActiveRev,
                    manifestHash: cloudEntry.manifestHash,
                    contentHash:
                      cloudEntry.contentHash ||
                      SaveManager.computeCanonicalSyncHash(cloudReconstructed),
                  }
                );
                const copyRes =
                  await this.uploadWorldToCloud(preservedLocalCopy);
                this.setWorldDetailedState(
                  preservedLocalCopy.metadata.id,
                  'VERSION_CONFLICT',
                  {
                    worldName: preservedLocalCopy.metadata.name,
                  }
                );
                summary.conflictPreservedWorldIds.push(
                  preservedLocalCopy.metadata.id
                );
                summary.downloadedWorldIds.push(localMeta.id);
                summary.newUploadedWorldIds.push(
                  preservedLocalCopy.metadata.id
                );
                summary.totalChunksUploaded += copyRes.chunksUploaded || 0;
                summary.totalChunksSkipped +=
                  copyRes.unchangedChunksSkipped || 0;
              }
              this.appendLog(
                'CONFLICT',
                localMeta.id,
                localMeta.name,
                'resolveDivergentConflict',
                'WARN',
                `Conflito de versões detectado em "${localMeta.name}". Ambas as versões foram preservadas com segurança.`
              );
              processedWorldsCount++;
              advanceWorldProgress(
                8,
                `Mundos sincronizados: ${processedWorldsCount} de ${allUniqueWorldIds.size}`
              );
              continue;
            }
          }

          // Cloud is strictly newer and local had no unsynced edits
          if (!localModifiedSinceLastSync && cloudModifiedSinceLastSync) {
            this.setWorldDetailedState(localMeta.id, 'DOWNLOADING', {
              worldName: localMeta.name,
            });
            const reconstructed =
              await cloudWorldStorageEngine.downloadAndReconstructWorld(
                uid,
                cloudEntry.id,
                (prog) => this.updateTransferProgress(prog),
                cloudEntry.sourceDb
              );
            if (reconstructed && reconstructed.metadata) {
              reconstructed.player.persistentPlayerId = uid;
              await SaveManager.saveWorldGuaranteed(reconstructed, true);
              await SaveManager.markWorldCloudSynced(
                reconstructed.metadata.id,
                {
                  revisionId: cloudActiveRev,
                  manifestHash: cloudEntry.manifestHash,
                  contentHash:
                    cloudEntry.contentHash ||
                    SaveManager.computeCanonicalSyncHash(reconstructed),
                }
              );
              this.setWorldDetailedState(reconstructed.metadata.id, 'SYNCED', {
                worldName: reconstructed.metadata.name,
                lastRevisionId: cloudActiveRev,
              });
              summary.downloadedWorldIds.push(reconstructed.metadata.id);
              this.sessionDownloadedCount++;
              this.sessionCompletedOpsCount++;
            }
            processedWorldsCount++;
            advanceWorldProgress(
              8,
              `Mundos sincronizados: ${processedWorldsCount} de ${allUniqueWorldIds.size}`
            );
            continue;
          }

          // CASE D: Synced world with local changes (or needs v1->v2 migration / interrupted upload resume)
          advanceWorldProgress(
            5,
            `Enviando alterações do mundo: ${localMeta.name}...`
          );
          const upRes = await this.uploadWorldToCloud(fullLocal);
          if (upRes.noNewRevisionCreated) {
            summary.unchangedSkippedWorldIds.push(localMeta.id);
          } else {
            summary.incrementalUploadedWorldIds.push(localMeta.id);
          }
          summary.totalChunksUploaded += upRes.chunksUploaded || 0;
          summary.totalChunksSkipped += upRes.unchangedChunksSkipped || 0;
        } catch (err: any) {
          this.sessionFailedOpsCount++;
          summary.failedWorldIds.push(localMeta.id);
          const errMsg =
            err?.message || `Erro ao reconciliar mundo "${localMeta.name}".`;
          this.setWorldDetailedState(localMeta.id, 'SYNC_ERROR', {
            worldName: localMeta.name,
            error: errMsg,
          });
          this.appendLog(
            'RECONCILE_WORLD',
            localMeta.id,
            localMeta.name,
            'syncWorld',
            'ERROR',
            errMsg
          );
        }

        processedWorldsCount++;
        advanceWorldProgress(
          8,
          `Mundos sincronizados: ${processedWorldsCount} de ${allUniqueWorldIds.size}`
        );
      }

      // All cloud downloads are now finished; if local worlds exist, allow dismissing while local uploads finish
      if (SaveManager.listWorlds().length > 0) {
        this.updateReconciliation({
          canDismissToPlayLocal: true,
        });
      }

      // 2. Handle Local-Only Worlds not yet in Cloud (Case A)
      const currentLocalList = SaveManager.listWorlds();
      let totalInCloud = cloudById.size;

      for (const localMeta of currentLocalList) {
        if (cloudById.has(localMeta.id)) continue;
        if (summary.newUploadedWorldIds.includes(localMeta.id)) {
          totalInCloud += 1;
          continue;
        }

        try {
          const fullLocal = await SaveManager.getCompactWorldForCloud(
            localMeta.id
          );
          if (fullLocal) {
            advanceWorldProgress(
              5,
              `Enviando novo mundo local: ${localMeta.name}...`
            );
            const upRes = await this.uploadWorldToCloud(fullLocal);
            summary.newUploadedWorldIds.push(localMeta.id);
            summary.totalChunksUploaded += upRes.chunksUploaded || 0;
            summary.totalChunksSkipped += upRes.unchangedChunksSkipped || 0;
            totalInCloud += 1;
          }
        } catch (err: any) {
          this.sessionFailedOpsCount++;
          summary.failedWorldIds.push(localMeta.id);
          const errMsg =
            err?.message || `Falha ao enviar novo mundo "${localMeta.name}".`;
          this.setWorldDetailedState(localMeta.id, 'SYNC_ERROR', {
            worldName: localMeta.name,
            error: errMsg,
          });
        }

        processedWorldsCount++;
        advanceWorldProgress(
          8,
          `Mundos sincronizados: ${processedWorldsCount} de ${allUniqueWorldIds.size}`
        );
      }

      summary.durationMs = Math.round(performance.now() - batchStartMs);
      summary.completedAt = Date.now();
      this.lastSyncSummary = summary;
      this.cloudWorldsCount = Math.max(
        totalInCloud,
        SaveManager.listWorlds().filter(
          (w) => this.getWorldSyncState(w.id).detailedStatus === 'SYNCED'
        ).length
      );
      this.lastSyncedAt = Date.now();
      this.syncStatus = summary.failedWorldIds.length > 0 ? 'ERROR' : 'SYNCED';

      const partsSummary: string[] = [];
      if (summary.downloadedWorldIds.length > 0) {
        partsSummary.push(`${summary.downloadedWorldIds.length} baixado(s)`);
      }
      if (summary.newUploadedWorldIds.length > 0) {
        partsSummary.push(
          `${summary.newUploadedWorldIds.length} novo(s) enviado(s)`
        );
      }
      if (summary.incrementalUploadedWorldIds.length > 0) {
        partsSummary.push(
          `${summary.incrementalUploadedWorldIds.length} atualizado(s) (${summary.totalChunksUploaded} partes)`
        );
      }
      if (summary.unchangedSkippedWorldIds.length > 0) {
        partsSummary.push(
          `${summary.unchangedSkippedWorldIds.length} já sincronizado(s)`
        );
      }
      if (summary.failedWorldIds.length > 0) {
        partsSummary.push(`${summary.failedWorldIds.length} com falha`);
      }

      this.statusMessage =
        partsSummary.length > 0
          ? `Sincronização concluída: ${partsSummary.join(', ')}.`
          : 'Todos os mundos estão sincronizados na nuvem!';

      this.notifyListeners();
      return SaveManager.listWorlds();
    })();

    try {
      return await this.activeWorldsSyncPromise;
    } finally {
      this.activeWorldsSyncPromise = null;
    }
  }

  /**
   * Saves a player's Guest Character state for a multiplayer world to `/users/{uid}/guestProfiles/{worldId}`.
   */
  public async saveGuestProfileToCloud(
    worldId: string,
    guestPlayer: PlayerState
  ): Promise<void> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified || !worldId) return;

    const uid = sanitizeValidId(user.uid);
    await this.ensureUserProfileSynced(user);

    const cleanWorldId = sanitizeValidId(worldId);
    const guestPath = `users/${uid}/guestProfiles/${cleanWorldId}`;
    const guestRef = doc(db, 'users', uid, 'guestProfiles', cleanWorldId);

    const playerPayload = sanitizeForFirestore({
      ...guestPlayer,
      persistentPlayerId: uid,
    });
    const playerLevelInt = Math.max(
      1,
      Math.min(9999, Math.floor(Number(guestPlayer.level) || 1))
    );
    const clientUpdatedAtInt = Math.max(
      0,
      Math.floor(Number(guestPlayer.savedAt || Date.now()))
    );

    try {
      await setDoc(guestRef, {
        worldId: cleanWorldId,
        ownerId: uid,
        playerLevel: playerLevelInt,
        clientUpdatedAt: clientUpdatedAtInt,
        playerPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      try {
        await updateDoc(guestRef, {
          playerLevel: playerLevelInt,
          clientUpdatedAt: clientUpdatedAtInt,
          playerPayload,
          updatedAt: serverTimestamp(),
        });
      } catch (err2) {
        handleFirestoreError(err2, OperationType.WRITE, guestPath);
      }
    }
  }

  /**
   * Synchronizes all local `wildborn_guest_player_*` profiles with `/users/{uid}/guestProfiles`.
   */
  public async syncAllGuestProfilesWithCloud(): Promise<void> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) return;

    const uid = sanitizeValidId(user.uid);
    await this.ensureUserProfileSynced(user);

    const guestColPath = `users/${uid}/guestProfiles`;
    const guestCol = collection(db, 'users', uid, 'guestProfiles');
    const q = query(guestCol, where('ownerId', '==', uid));

    let cloudProfiles: {
      worldId: string;
      clientUpdatedAt: number;
      playerPayload: PlayerState | null;
    }[] = [];

    try {
      const snap = await getDocs(q);
      cloudProfiles = snap.docs.map((d) => {
        const data = d.data();
        return {
          worldId: String(data.worldId || d.id),
          clientUpdatedAt: Number(data.clientUpdatedAt || 0),
          playerPayload: (data.playerPayload as PlayerState) || null,
        };
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, guestColPath);
    }

    const cloudMap = new Map(cloudProfiles.map((p) => [p.worldId, p]));

    // 1. Download newer cloud guest profiles to localStorage
    for (const cp of cloudProfiles) {
      if (!cp.playerPayload) continue;
      const key = `wildborn_guest_player_${cp.worldId}`;
      try {
        const localRaw = localStorage.getItem(key);
        const localParsed = localRaw
          ? (JSON.parse(localRaw) as PlayerState)
          : null;
        const localTs = Number(localParsed?.savedAt || 0);
        if (!localParsed || cp.clientUpdatedAt > localTs) {
          cp.playerPayload.persistentPlayerId = uid;
          localStorage.setItem(key, JSON.stringify(cp.playerPayload));
        }
      } catch {
        // ignore
      }
    }

    // 2. Upload local guest profiles that are missing or newer than cloud
    try {
      const localGuestKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('wildborn_guest_player_')) {
          localGuestKeys.push(k);
        }
      }
      for (const k of localGuestKeys) {
        const worldId = k.slice('wildborn_guest_player_'.length);
        const raw = localStorage.getItem(k);
        if (!raw || !worldId) continue;
        const localPlayer = JSON.parse(raw) as PlayerState;
        if (!localPlayer || typeof localPlayer !== 'object') continue;
        const localTs = Number(localPlayer.savedAt || 0);
        const cloudEntry = cloudMap.get(worldId);
        if (!cloudEntry || localTs > cloudEntry.clientUpdatedAt) {
          await this.saveGuestProfileToCloud(worldId, localPlayer);
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Fetches server-granted entitlements (`/users/{uid}/entitlements`) linked to the authenticated UID.
   */
  public async fetchUserEntitlements(
    uidOverride?: string
  ): Promise<UserEntitlementRecord[]> {
    const uid = uidOverride || this.getAuthenticatedUid();
    if (!uid) {
      this.entitlements = [];
      return [];
    }

    const entPath = `users/${uid}/entitlements`;
    const entCol = collection(db, 'users', uid, 'entitlements');
    const q = query(entCol, where('ownerId', '==', uid));

    try {
      const snap = await getDocs(q);
      const list: UserEntitlementRecord[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            entitlementId: String(data.entitlementId || d.id),
            ownerId: String(data.ownerId || uid),
            sku: String(data.sku || ''),
            category: data.category || 'exclusive_reward',
            status: data.status || 'active',
            grantedAt: data.grantedAt,
          } as UserEntitlementRecord;
        })
        .filter((e) => e.status === 'active');
      this.entitlements = list;
      this.notifyListeners();
      return list;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, entPath);
    }
  }
}

export const firebaseCloudSync = new FirebaseCloudSyncService();
