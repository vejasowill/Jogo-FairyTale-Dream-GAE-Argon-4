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
  private listeners = new Set<CloudSyncListener>();
  private profileReadyForUid: string | null = null;
  private activeProfileSyncPromise: Promise<boolean> | null = null;
  private activeWorldsSyncPromise: Promise<WorldMetadata[]> | null = null;

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
        }
        this.notifyListeners();
      });
    }
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

  public getSnapshot(): CloudSyncSnapshot {
    const u = this.currentUser || auth.currentUser;
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
   * Uploads a single world save to `/users/{uid}/worlds/{worldId}`.
   */
  public async uploadWorldToCloud(
    saveData: WorldSaveData
  ): Promise<{ ok: boolean; message: string }> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) {
      return { ok: false, message: 'Usuário não autenticado no Firebase.' };
    }

    const uid = sanitizeValidId(user.uid);
    const profileOk = await this.ensureUserProfileSynced(user);
    if (!profileOk) {
      return { ok: false, message: 'Perfil Firebase ainda não sincronizado.' };
    }

    const { worldId, docFields } = this.buildCloudWorldPayload(saveData, uid);
    const worldPath = `users/${uid}/worlds/${worldId}`;
    const worldRef = doc(db, 'users', uid, 'worlds', worldId);

    let existingSnap;
    try {
      existingSnap = await getDoc(worldRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, worldPath);
    }

    if (!existingSnap.exists()) {
      try {
        await setDoc(worldRef, {
          ...docFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, worldPath);
      }
    } else {
      // Update mutable fields only (preserving immutable worldId, ownerId, seed, createdAt)
      const {
        worldId: _w,
        ownerId: _o,
        seed: _s,
        ...mutableFields
      } = docFields;
      try {
        await updateDoc(worldRef, {
          ...mutableFields,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, worldPath);
      }
    }

    this.lastSyncedAt = Date.now();
    this.syncStatus = 'SYNCED';
    this.notifyListeners();
    return { ok: true, message: 'Mundo salvo no Cloud Firestore!' };
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

    const sanitizedChunkData = sanitizeForFirestore(chunkPayload);
    const clientUpdatedAtInt = Math.max(0, Math.floor(Number(clientUpdatedAt) || Date.now()));

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
          chunkData: sanitizedChunkData,
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
          chunkData: sanitizedChunkData,
          clientUpdatedAt: clientUpdatedAtInt,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, chunkPath);
      }
    }
  }

  /**
   * Deletes a world save from `/users/{uid}/worlds/{worldId}` when deleted locally by the user.
   */
  public async deleteWorldFromCloud(worldId: string): Promise<void> {
    const user = this.currentUser || auth.currentUser;
    if (!user || !user.uid || !user.emailVerified) return;
    const uid = sanitizeValidId(user.uid);
    const cleanWorldId = sanitizeValidId(worldId);
    const worldPath = `users/${uid}/worlds/${cleanWorldId}`;
    const worldRef = doc(db, 'users', uid, 'worlds', cleanWorldId);

    try {
      const snap = await getDoc(worldRef);
      if (snap.exists()) {
        await deleteDoc(worldRef);
        this.cloudWorldsCount = Math.max(0, this.cloudWorldsCount - 1);
        this.lastSyncedAt = Date.now();
        this.notifyListeners();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, worldPath);
    }
  }

  /**
   * Performs a non-destructive bi-directional migration & sync between local storage (IndexedDB/localStorage)
   * and Cloud Firestore (`/users/{uid}/worlds`):
   * - Local worlds that are not yet in Firestore (or have a newer timestamp locally) are uploaded to Firestore.
   * - Cloud worlds that are not on this device (or have a newer timestamp in Firestore) are downloaded and saved locally.
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
      const uid = sanitizeValidId(user.uid);
      await SaveManager.hydrateFromIndexedDB();
      await this.ensureUserProfileSynced(user);

      const worldsPath = `users/${uid}/worlds`;
      const worldsCol = collection(db, 'users', uid, 'worlds');
      // Rule-compliant query: explicitly filters by ownerId == uid
      const q = query(worldsCol, where('ownerId', '==', uid));

      let cloudDocs: {
        id: string;
        clientUpdatedAt: number;
        savePayload: WorldSaveData | null;
      }[] = [];

      try {
        const snap = await getDocs(q);
        cloudDocs = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.worldId || d.id),
            clientUpdatedAt: Number(data.clientUpdatedAt || 0),
            savePayload: (data.savePayload as WorldSaveData) || null,
          };
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, worldsPath);
      }

      const cloudById = new Map(cloudDocs.map((c) => [c.id, c]));
      const localList = SaveManager.listWorlds();
      const localById = new Map(localList.map((w) => [w.id, w]));

      // 1. Download any Cloud worlds that are missing locally or newer in Cloud
      for (const cloudEntry of cloudDocs) {
        if (!cloudEntry.savePayload || !cloudEntry.savePayload.metadata) {
          continue;
        }
        const localMeta = localById.get(cloudEntry.id);
        const localUpdatedAt = Number(localMeta?.updatedAt || 0);
        if (!localMeta || cloudEntry.clientUpdatedAt > localUpdatedAt) {
          const migrated = migrateSaveData(cloudEntry.savePayload);
          migrated.player.persistentPlayerId = uid;
          await SaveManager.saveWorldGuaranteed(migrated, true);
        }
      }

      // 2. Upload any Local worlds that are missing in Cloud or newer locally (Non-destructive migration!)
      const updatedLocalList = SaveManager.listWorlds();
      let totalInCloud = cloudById.size;

      for (const localMeta of updatedLocalList) {
        const cloudEntry = cloudById.get(localMeta.id);
        const localUpdatedAt = Number(localMeta.updatedAt || 0);
        const cloudUpdatedAt = Number(cloudEntry?.clientUpdatedAt || 0);

        if (!cloudEntry || localUpdatedAt > cloudUpdatedAt) {
          const fullLocal =
            (await SaveManager.loadWorldGuaranteed(localMeta.id)) ||
            SaveManager.loadWorldLocal(localMeta.id);
          if (fullLocal) {
            await this.uploadWorldToCloud(fullLocal);
            if (!cloudEntry) {
              totalInCloud += 1;
            }
          }
        }
      }

      this.cloudWorldsCount = totalInCloud;
      this.lastSyncedAt = Date.now();
      this.syncStatus = 'SYNCED';
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
