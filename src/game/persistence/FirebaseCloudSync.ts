import {
  collection,
  deleteDoc,
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
  GameSettings,
  PlayerAppearance,
  PlayerState,
  WorldMetadata,
  WorldSaveData,
} from '../core/types';
import {
  computeChecksum,
  getOrCreateLocalDevicePlayerUid,
  migrateSaveData,
  SaveManager,
} from './SaveManager';

import {
  CloudPublishTelemetry,
  CloudTransferProgress,
  cloudWorldStorageEngine,
  persistentUploadQueue,
} from './CloudWorldStorageEngine';

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

export interface WorldCloudSyncState {
  worldId: string;
  status: 'SYNCED' | 'PENDING' | 'SYNCING' | 'ERROR';
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
  totalChunksUploaded: number;
  totalChunksSkipped: number;
  durationMs: number;
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
}

type CloudSyncListener = (snapshot: CloudSyncSnapshot) => void;

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
  private pendingWorldSyncReasons = new Map<string, string>();
  private worldSyncStates = new Map<string, WorldCloudSyncState>();
  private isProcessingQueue = false;
  private lastSyncSummary: CloudSyncBatchSummary | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Preserve the original local device UID before any login occurs
      this.getOrStoreLegacyLocalUid();

      onAuthStateChanged(auth, async (user) => {
        this.currentUser = user;
        this.isAuthReady = true;
        this.profileReadyForUid = null;

        if (user) {
          this.syncStatus = 'SYNCING';
          this.statusMessage = 'Sincronizando conta e mundos com o Firebase...';
          this.notifyListeners();

          try {
            await this.ensureUserProfileSynced(user);
            await this.fetchUserEntitlements(user.uid);
            await this.syncAllWorldsWithCloud();
            await this.syncAllGuestProfilesWithCloud();
            void this.processPendingWorldSyncQueue();
            this.syncStatus = 'SYNCED';
            this.lastSyncedAt = Date.now();
            this.statusMessage = 'Conta e mundos sincronizados na nuvem!';
          } catch (err: any) {
            console.warn('Initial Firebase cloud sync warning:', err);
            this.syncStatus = 'ERROR';
            this.statusMessage =
              'Autenticado. Alguns dados serão sincronizados na próxima conexão.';
          }
        } else {
          this.syncStatus = 'IDLE';
          this.statusMessage = null;
          this.cloudWorldsCount = 0;
          this.entitlements = [];
          this.transferProgress = null;
        }
        this.notifyListeners();
      });
    }
  }

  private updateTransferProgress(progress: CloudTransferProgress): void {
    this.transferProgress = { ...progress };
    if (progress.phase === 'PAUSED_INTERRUPTED' || progress.phase === 'ERROR') {
      this.syncStatus = 'ERROR';
      if (progress.lastError) {
        this.statusMessage = progress.lastError;
      }
    } else if (progress.phase === 'COMPLETED') {
      if (this.pendingWorldSyncReasons.size === 0 && this.activeWorldUploads.size <= 1) {
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
    if (meta) {
      if (
        meta.syncPending === false &&
        Boolean(meta.lastSyncedRevisionId || meta.lastSyncedContentHash)
      ) {
        return {
          worldId,
          status: 'SYNCED',
          error: null,
          updatedAt: meta.lastSyncedAt || meta.updatedAt || Date.now(),
          lastRevisionId: meta.lastSyncedRevisionId || null,
        };
      }
    }
    return {
      worldId,
      status: 'PENDING',
      error: null,
      updatedAt: meta?.updatedAt || Date.now(),
      lastRevisionId: meta?.lastSyncedRevisionId || null,
    };
  }

  public getSnapshot(): CloudSyncSnapshot {
    const u = this.currentUser || auth.currentUser;
    const statesRecord: Record<string, WorldCloudSyncState> = {};
    for (const w of SaveManager.listWorlds()) {
      statesRecord[w.id] = this.getWorldSyncState(w.id);
    }
    for (const [id, st] of this.worldSyncStates.entries()) {
      statesRecord[id] = { ...st };
    }
    const pendingUploadsCount =
      this.pendingWorldSyncReasons.size + this.activeWorldUploads.size;

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
   * repeatedly never starts concurrent uploads for the same world.
   */
  public enqueueWorldSync(worldId: string, reason = 'background'): void {
    if (!worldId) return;
    const cleanWorldId = sanitizeValidId(worldId);
    this.pendingWorldSyncReasons.set(cleanWorldId, reason);
    const current = this.worldSyncStates.get(cleanWorldId);
    if (!current || current.status !== 'SYNCING') {
      this.worldSyncStates.set(cleanWorldId, {
        worldId: cleanWorldId,
        status: 'PENDING',
        error: null,
        updatedAt: Date.now(),
        lastRevisionId: current?.lastRevisionId || null,
      });
    }
    this.notifyListeners();

    const user = this.currentUser || auth.currentUser;
    if (user && user.uid && user.emailVerified) {
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
        const [worldId] = nextEntry;
        this.pendingWorldSyncReasons.delete(worldId);

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
          this.worldSyncStates.set(worldId, {
            worldId,
            status: 'SYNCED',
            error: null,
            updatedAt: Date.now(),
            lastRevisionId: compactLocal.metadata.lastSyncedRevisionId,
          });
          this.notifyListeners();
          continue;
        }

        try {
          await this.uploadWorldToCloud(compactLocal);
        } catch (err: any) {
          this.worldSyncStates.set(worldId, {
            worldId,
            status: 'ERROR',
            error: err?.message || 'Falha ao sincronizar mundo em segundo plano.',
            updatedAt: Date.now(),
          });
          this.notifyListeners();
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
      this.notifyListeners();

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

      await this.ensureUserProfileSynced(user);
      await this.fetchUserEntitlements(user.uid);
      await this.syncAllWorldsWithCloud();
      await this.syncAllGuestProfilesWithCloud();
      void this.processPendingWorldSyncQueue();

      this.syncStatus = 'SYNCED';
      this.lastSyncedAt = Date.now();
      this.statusMessage = `Bem-vindo(a), ${user.displayName || 'Aventureiro'}! Seus mundos estão sincronizados.`;
      this.notifyListeners();

      return {
        ok: true,
        message: this.statusMessage,
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
      this.notifyListeners();
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
      this.notifyListeners();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }

  /**
   * Ensures `/users/{userId}` and `/users/{userId}/private/account` exist and are up to date.
   * Must complete before writing to subcollections so `parentUserExists(userId)` in `firestore.rules` passes.
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

      if (!existingSnap.exists()) {
        try {
          await setDoc(userRef, {
            uid,
            displayName,
            photoURL,
            legacyLocalUid,
            appearance: cleanAppearance,
            settings: cleanSettings,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, userPath);
        }
      } else {
        const remoteData = existingSnap.data();
        // If the user already had a custom appearance stored in the cloud and local is still default, adopt cloud appearance
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
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, userPath);
        }
      }

      // Sync isolated PII record (/users/{uid}/private/account)
      if (user.email && user.email.trim().length >= 3) {
        const privPath = `users/${uid}/private/account`;
        const privRef = doc(db, 'users', uid, 'private', 'account');
        const cleanEmail = sanitizeString(user.email, 3, 254, 'user@example.com');
        let privSnap;
        try {
          privSnap = await getDoc(privRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, privPath);
        }
        if (!privSnap.exists()) {
          try {
            await setDoc(privRef, {
              uid,
              email: cleanEmail,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, privPath);
          }
        } else {
          try {
            await updateDoc(privRef, {
              email: cleanEmail,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, privPath);
          }
        }
      }

      this.profileReadyForUid = uid;
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
   * Prepares a world save for Cloud Firestore storage, migrating ownership from any pre-login
   * local UID to the authenticated Firebase UID and keeping document size well below Firestore's 1MB limit.
   */
  private buildCloudWorldPayload(
    saveData: WorldSaveData,
    uid: string
  ): {
    worldId: string;
    docFields: Record<string, unknown>;
  } {
    const legacyUid = this.getOrStoreLegacyLocalUid();
    const worldId = sanitizeValidId(
      saveData.metadata?.id || `world_${Date.now()}`,
      `world_${Date.now()}`
    );

    // Compact world data for cloud storage
    let compacted = SaveManager.compactSaveDataForStorage(
      saveData,
      false,
      18,
      false
    );
    let serialized = JSON.stringify(compacted);

    // If serialized payload exceeds 700 KB, apply stricter distant-node compaction so Firestore 1MB limit is never hit
    if (serialized.length > 700_000) {
      compacted = SaveManager.compactSaveDataForStorage(
        saveData,
        true,
        10,
        true
      );
      serialized = JSON.stringify(compacted);
    }
    if (serialized.length > 850_000) {
      compacted = SaveManager.compactSaveDataForStorage(
        saveData,
        true,
        4,
        true
      );
      serialized = JSON.stringify(compacted);
    }

    // Link host player & any pre-login tamed animals to the authenticated Firebase UID
    if (compacted.player) {
      compacted.player.persistentPlayerId = uid;
    }
    if (Array.isArray(compacted.creatures)) {
      for (const cr of compacted.creatures) {
        if (
          cr &&
          cr.tamed &&
          (!cr.ownerId || cr.ownerId === legacyUid)
        ) {
          cr.ownerId = uid;
        }
      }
    }

    const checksum = computeChecksum(serialized).slice(0, 32);
    const meta = compacted.metadata;
    const rawDifficulty = meta.difficulty;
    const difficulty: 'normal' | 'survival' | 'hardcore' =
      rawDifficulty === 'survival' || rawDifficulty === 'hardcore'
        ? rawDifficulty
        : 'normal';

    const savePayload = sanitizeForFirestore({
      version: Number(compacted.version || 3),
      metadata: {
        ...meta,
        id: worldId,
      },
      player: compacted.player,
      ...(compacted.guestPlayers ? { guestPlayers: compacted.guestPlayers } : {}),
      chunks: compacted.chunks || {},
      ...(compacted.undergroundChunks
        ? { undergroundChunks: compacted.undergroundChunks }
        : {}),
      creatures: Array.isArray(compacted.creatures) ? compacted.creatures : [],
      droppedItems: Array.isArray(compacted.droppedItems)
        ? compacted.droppedItems
        : [],
      waypoints: Array.isArray(compacted.waypoints) ? compacted.waypoints : [],
      deathBags: Array.isArray(compacted.deathBags) ? compacted.deathBags : [],
    });

    const seedInt = Math.max(
      0,
      Math.min(999999999, Math.floor(Math.abs(Number(meta.seed) || 123456)))
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
        Math.floor(Number(compacted.player?.level || meta.playerLevel) || 1)
      )
    );
    const exploredChunksInt = Math.max(
      0,
      Math.min(
        100000,
        Math.floor(
          Number(meta.exploredChunksCount) ||
            Object.keys(compacted.chunks || {}).length ||
            1
        )
      )
    );
    const worldGenVersionInt = Math.max(
      1,
      Math.min(
        1000,
        Math.floor(
          Number(meta.worldGenVersion) || CURRENT_WORLD_GEN_VERSION
        )
      )
    );
    const clientUpdatedAtInt = Math.max(
      0,
      Math.floor(
        Number(meta.updatedAt || compacted.player?.savedAt || Date.now())
      )
    );

    const docFields: Record<string, unknown> = {
      worldId,
      ownerId: uid,
      name: sanitizeString(meta.name, 1, 64, 'Fronteira Selvagem'),
      seed: seedInt,
      seedText: sanitizeString(
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
      gameVersion: sanitizeString(
        meta.gameVersion || GAME_VERSION,
        1,
        32,
        GAME_VERSION
      ),
      worldGenVersion: worldGenVersionInt,
      checksum: sanitizeString(checksum, 1, 32, '00000000'),
      clientUpdatedAt: clientUpdatedAtInt,
      savePayload,
    };

    return { worldId, docFields };
  }

  /**
   * Uploads a world save incrementally using the v2 Hybrid Cloud Storage Engine with single-flight deduplication:
   * - Never runs two concurrent uploads for the same `worldId`.
   * - Only modified chunks are uploaded to independent chunk/Storage objects.
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

    // Single-flight deduplication per worldId
    const existingUpload = this.activeWorldUploads.get(worldId);
    if (existingUpload) {
      return existingUpload;
    }

    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) {
      this.pendingWorldSyncReasons.set(worldId, 'unauthenticated_retry');
      this.worldSyncStates.set(worldId, {
        worldId,
        status: 'PENDING',
        error: null,
        updatedAt: Date.now(),
      });
      this.notifyListeners();
      return { ok: false, message: 'Usuário não autenticado no Firebase.' };
    }

    const uploadPromise = (async () => {
      const uid = sanitizeValidId(user.uid);
      this.worldSyncStates.set(worldId, {
        worldId,
        status: 'SYNCING',
        error: null,
        updatedAt: Date.now(),
      });
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
            ? SaveManager.compactSaveDataForStorage(saveDataOrWorldId, true, 14, true)
            : null);

        if (!latestCompact) {
          throw new Error(`Mundo local ${worldId} não encontrado para sincronização.`);
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
          await SaveManager.markWorldCloudSynced(worldId, {
            revisionId: result.revisionId,
            manifestHash: result.manifestHash,
            contentHash: result.contentHash,
          });
          this.worldSyncStates.set(worldId, {
            worldId,
            status: 'SYNCED',
            error: null,
            updatedAt: Date.now(),
            lastRevisionId: result.revisionId,
            lastChunksUploaded: result.chunksUploaded,
            lastUnchangedChunksSkipped: result.unchangedChunksSkipped,
          });
        }

        this.lastSyncedAt = Date.now();
        if (this.pendingWorldSyncReasons.size === 0 && this.activeWorldUploads.size <= 1) {
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
        const errMsg =
          err?.message || 'Erro durante sincronização incremental do mundo.';
        this.worldSyncStates.set(worldId, {
          worldId,
          status: 'ERROR',
          error: errMsg,
          updatedAt: Date.now(),
        });
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
    return uploadPromise;
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

    let snap;
    try {
      snap = await getDoc(chunkRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, chunkPath);
    }

    if (!snap.exists()) {
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
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, chunkPath);
      }
    } else {
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
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, chunkPath);
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
    this.worldSyncStates.delete(cleanWorldId);

    await cloudWorldStorageEngine.deleteWorldAndChunksFromCloud(
      uid,
      cleanWorldId
    );
    this.cloudWorldsCount = Math.max(0, this.cloudWorldsCount - 1);
    this.lastSyncedAt = Date.now();
    this.notifyListeners();
  }

  /**
   * Performs intelligent, non-destructive 4-case synchronization between local storage (IndexedDB/localStorage)
   * and Cloud Firestore + Storage (`/users/{uid}/worlds/{worldId}` + `/chunks/{chunkKey}`):
   * - Case A (Already Synced & Unchanged): Recognizes identical content/revision immediately with 0 chunk transfers and no new revision.
   * - Case B (Synced with Local Changes): Uploads ONLY modified chunks + updated entities/manifest.
   * - Case C (New Local World): Uploads all initial units and registers cloud revision.
   * - Case D (Cloud-Only World): Downloads & reconstructs locally without overwriting any local world.
   * - Conflict (Divergent Local & Cloud Changes): Preserves both versions safely via `SaveManager.saveDivergentWorldAsCopy`.
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
        totalChunksUploaded: 0,
        totalChunksSkipped: 0,
        durationMs: 0,
      };

      const uid = sanitizeValidId(user.uid);
      this.syncStatus = 'SYNCING';
      this.statusMessage = 'Verificando mundos locais e na nuvem...';
      this.notifyListeners();

      await SaveManager.hydrateFromIndexedDB();
      await this.ensureUserProfileSynced(user);

      // Check for any interrupted upload queues for this user
      const interruptedQueues = await persistentUploadQueue.listAllQueuesForUser(uid);
      const interruptedWorldIds = new Set(interruptedQueues.map((q) => q.worldId));

      const worldsPath = `users/${uid}/worlds`;
      const worldsCol = collection(db, 'users', uid, 'worlds');
      const q = query(worldsCol, where('ownerId', '==', uid));

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
      }

      let cloudDocs: CloudWorldSummaryDoc[] = [];

      try {
        const snap = await getDocs(q);
        cloudDocs = snap.docs.map((d) => {
          const data = d.data();
          const summaryMap =
            (data.chunkIndexSummary as Record<string, unknown> | undefined) || {};
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
            originWorldId: String(summaryMap.originWorldId || data.worldId || d.id),
            isCopy: Boolean(summaryMap.isCopy),
            copyNumber: Math.max(0, Math.floor(Number(summaryMap.copyNumber || 0))),
          };
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, worldsPath);
      }

      const cloudById = new Map(cloudDocs.map((c) => [c.id, c]));
      const localList = SaveManager.listWorlds();
      const localById = new Map(localList.map((w) => [w.id, w]));

      // 1. Handle Cloud-Only Worlds (Case D) and Bi-Directional Comparison (Cases A, B, and Conflict)
      for (const cloudEntry of cloudDocs) {
        const localMeta = localById.get(cloudEntry.id);

        if (!localMeta) {
          // CASE D: World exists only in the cloud — download & reconstruct safely
          const reconstructed =
            await cloudWorldStorageEngine.downloadAndReconstructWorld(
              uid,
              cloudEntry.id,
              (prog) => this.updateTransferProgress(prog)
            );
          if (reconstructed && reconstructed.metadata) {
            reconstructed.player.persistentPlayerId = uid;
            await SaveManager.saveWorldGuaranteed(reconstructed, true);
            const canonicalHash = SaveManager.computeCanonicalSyncHash(reconstructed);
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
            this.worldSyncStates.set(reconstructed.metadata.id, {
              worldId: reconstructed.metadata.id,
              status: 'SYNCED',
              error: null,
              updatedAt: Date.now(),
              lastRevisionId:
                reconstructed.metadata.lastSyncedRevisionId ||
                cloudEntry.activeRevisionId,
            });
            summary.downloadedWorldIds.push(reconstructed.metadata.id);

            // If legacy v1 format in cloud, migrate to v2 chunked format
            if (cloudEntry.storageVersion !== 2) {
              const upRes = await this.uploadWorldToCloud(reconstructed);
              summary.totalChunksUploaded += upRes.chunksUploaded || 0;
              summary.totalChunksSkipped += upRes.unchangedChunksSkipped || 0;
            }
          }
          continue;
        }

        // Both Local and Cloud exist for `cloudEntry.id`
        const fullLocal = await SaveManager.getCompactWorldForCloud(localMeta.id);
        if (!fullLocal) continue;

        const localContentHash = SaveManager.computeCanonicalSyncHash(fullLocal);
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

        // CASE A: World is already synchronized and unchanged
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
              cloudEntry.manifestHash || localMeta.lastSyncedManifestHash || '',
            contentHash: localContentHash,
          });
          this.worldSyncStates.set(localMeta.id, {
            worldId: localMeta.id,
            status: 'SYNCED',
            error: null,
            updatedAt: Date.now(),
            lastRevisionId: cloudActiveRev || localSyncedRev,
            lastChunksUploaded: 0,
            lastUnchangedChunksSkipped: Object.keys(fullLocal.chunks || {}).length,
          });
          summary.unchangedSkippedWorldIds.push(localMeta.id);
          summary.totalChunksSkipped +=
            Object.keys(fullLocal.chunks || {}).length +
            Object.keys(fullLocal.undergroundChunks || {}).length;
          continue;
        }

        // DIVERGENCE CONFLICT: Both Local and Cloud were modified independently!
        if (localModifiedSinceLastSync && cloudModifiedSinceLastSync) {
          const cloudReconstructed =
            await cloudWorldStorageEngine.downloadAndReconstructWorld(
              uid,
              cloudEntry.id,
              (prog) => this.updateTransferProgress(prog)
            );
          if (cloudReconstructed && cloudReconstructed.metadata) {
            cloudReconstructed.player.persistentPlayerId = uid;
            const localUpdatedAt = Number(localMeta.updatedAt || 0);
            const cloudUpdatedAt = Number(cloudEntry.clientUpdatedAt || 0);

            if (localUpdatedAt >= cloudUpdatedAt) {
              // Keep local as primary, preserve cloud version as a safe copy instance
              const preservedCopy = await SaveManager.saveDivergentWorldAsCopy(
                cloudReconstructed,
                localMeta.id,
                'cloud_conflict'
              );
              const primaryRes = await this.uploadWorldToCloud(fullLocal);
              const copyRes = await this.uploadWorldToCloud(preservedCopy);
              summary.conflictPreservedWorldIds.push(preservedCopy.metadata.id);
              summary.incrementalUploadedWorldIds.push(localMeta.id);
              summary.newUploadedWorldIds.push(preservedCopy.metadata.id);
              summary.totalChunksUploaded +=
                (primaryRes.chunksUploaded || 0) + (copyRes.chunksUploaded || 0);
              summary.totalChunksSkipped +=
                (primaryRes.unchangedChunksSkipped || 0) +
                (copyRes.unchangedChunksSkipped || 0);
            } else {
              // Keep newer cloud version as primary, preserve local version as a safe copy instance
              const preservedLocalCopy = await SaveManager.saveDivergentWorldAsCopy(
                fullLocal,
                localMeta.id,
                'local_conflict'
              );
              await SaveManager.saveWorldGuaranteed(cloudReconstructed, true);
              await SaveManager.markWorldCloudSynced(cloudReconstructed.metadata.id, {
                revisionId: cloudActiveRev,
                manifestHash: cloudEntry.manifestHash,
                contentHash:
                  cloudEntry.contentHash ||
                  SaveManager.computeCanonicalSyncHash(cloudReconstructed),
              });
              const copyRes = await this.uploadWorldToCloud(preservedLocalCopy);
              summary.conflictPreservedWorldIds.push(preservedLocalCopy.metadata.id);
              summary.downloadedWorldIds.push(localMeta.id);
              summary.newUploadedWorldIds.push(preservedLocalCopy.metadata.id);
              summary.totalChunksUploaded += copyRes.chunksUploaded || 0;
              summary.totalChunksSkipped += copyRes.unchangedChunksSkipped || 0;
            }
            continue;
          }
        }

        // Cloud is strictly newer and local had no unsynced edits
        if (!localModifiedSinceLastSync && cloudModifiedSinceLastSync) {
          const reconstructed =
            await cloudWorldStorageEngine.downloadAndReconstructWorld(
              uid,
              cloudEntry.id,
              (prog) => this.updateTransferProgress(prog)
            );
          if (reconstructed && reconstructed.metadata) {
            reconstructed.player.persistentPlayerId = uid;
            await SaveManager.saveWorldGuaranteed(reconstructed, true);
            await SaveManager.markWorldCloudSynced(reconstructed.metadata.id, {
              revisionId: cloudActiveRev,
              manifestHash: cloudEntry.manifestHash,
              contentHash:
                cloudEntry.contentHash ||
                SaveManager.computeCanonicalSyncHash(reconstructed),
            });
            this.worldSyncStates.set(reconstructed.metadata.id, {
              worldId: reconstructed.metadata.id,
              status: 'SYNCED',
              error: null,
              updatedAt: Date.now(),
              lastRevisionId: cloudActiveRev,
            });
            summary.downloadedWorldIds.push(reconstructed.metadata.id);
          }
          continue;
        }

        // CASE B: Synced world with local changes (or needs v1->v2 migration / interrupted upload resume)
        const upRes = await this.uploadWorldToCloud(fullLocal);
        if (upRes.noNewRevisionCreated) {
          summary.unchangedSkippedWorldIds.push(localMeta.id);
        } else {
          summary.incrementalUploadedWorldIds.push(localMeta.id);
        }
        summary.totalChunksUploaded += upRes.chunksUploaded || 0;
        summary.totalChunksSkipped += upRes.unchangedChunksSkipped || 0;
      }

      // 2. Handle New Local Worlds not yet in Cloud (Case C)
      const currentLocalList = SaveManager.listWorlds();
      let totalInCloud = cloudById.size;

      for (const localMeta of currentLocalList) {
        if (cloudById.has(localMeta.id)) continue;
        // Skip if already uploaded during conflict resolution above
        if (summary.newUploadedWorldIds.includes(localMeta.id)) {
          totalInCloud += 1;
          continue;
        }

        const fullLocal = await SaveManager.getCompactWorldForCloud(localMeta.id);
        if (fullLocal) {
          const upRes = await this.uploadWorldToCloud(fullLocal);
          summary.newUploadedWorldIds.push(localMeta.id);
          summary.totalChunksUploaded += upRes.chunksUploaded || 0;
          summary.totalChunksSkipped += upRes.unchangedChunksSkipped || 0;
          totalInCloud += 1;
        }
      }

      summary.durationMs = Math.round(performance.now() - batchStartMs);
      summary.completedAt = Date.now();
      this.lastSyncSummary = summary;
      this.cloudWorldsCount = totalInCloud;
      this.lastSyncedAt = Date.now();
      this.syncStatus = 'SYNCED';

      const partsSummary: string[] = [];
      if (summary.unchangedSkippedWorldIds.length > 0) {
        partsSummary.push(
          `${summary.unchangedSkippedWorldIds.length} já sincronizado(s)`
        );
      }
      if (summary.incrementalUploadedWorldIds.length > 0) {
        partsSummary.push(
          `${summary.incrementalUploadedWorldIds.length} atualizado(s) (${summary.totalChunksUploaded} partes)`
        );
      }
      if (summary.newUploadedWorldIds.length > 0) {
        partsSummary.push(`${summary.newUploadedWorldIds.length} novo(s) enviado(s)`);
      }
      if (summary.downloadedWorldIds.length > 0) {
        partsSummary.push(`${summary.downloadedWorldIds.length} baixado(s)`);
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

    let snap;
    try {
      snap = await getDoc(guestRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, guestPath);
    }

    if (!snap.exists()) {
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
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, guestPath);
      }
    } else {
      try {
        await updateDoc(guestRef, {
          playerLevel: playerLevelInt,
          clientUpdatedAt: clientUpdatedAtInt,
          playerPayload,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, guestPath);
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
        const localParsed = localRaw ? (JSON.parse(localRaw) as PlayerState) : null;
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
   * Prepared for future microtransactions, expansions, and exclusive items.
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
