import {
  BiomeType,
  CHEST_STORAGE_SIZE,
  ChunkData,
  CURRENT_WORLD_GEN_VERSION,
  GAME_VERSION,
  GameSettings,
  HOTBAR_SIZE,
  NatureNode,
  PlaceableType,
  PlayerState,
  TOTAL_INVENTORY_SIZE,
  WorldMetadata,
  WorldSaveData,
} from '../core/types';
import { WorldManager } from '../world/WorldManager';

const INDEX_KEY = 'wildborn_worlds_index_v1';
const SETTINGS_KEY = 'wildborn_settings_v1';
const WORLD_PREFIX = 'wildborn_world_v1_';
const PLAYER_UID_KEY = 'wildborn_player_uid_v1';

export const CURRENT_SAVE_VERSION = 3;

export function getOrCreatePersistentPlayerUid(): string {
  try {
    const existing = localStorage.getItem(PLAYER_UID_KEY);
    if (existing && existing.trim().length >= 6) {
      return existing.trim();
    }
    const generated =
      'player_' +
      Math.random().toString(36).slice(2, 10) +
      '_' +
      Date.now().toString(36).slice(-5);
    localStorage.setItem(PLAYER_UID_KEY, generated);
    return generated;
  } catch {
    return 'player_local_default';
  }
}

export interface SaveEnvelope {
  checksum: string;
  savedAt: number;
  data: WorldSaveData;
}

export function computeChecksum(payload: string): string {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function seedFromText(text: string): number {
  const clean = text.trim();
  if (!clean) {
    return Math.floor(Math.random() * 899999 + 100000);
  }
  const asNum = Number(clean);
  if (!Number.isNaN(asNum) && Number.isFinite(asNum)) {
    return Math.abs(Math.floor(asNum)) % 99999999;
  }
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 99999999;
}

export function createInitialPlayerState(): PlayerState {
  // Ao iniciar o jogo, o jogador começa sem nenhum item
  const inventory = new Array(TOTAL_INVENTORY_SIZE).fill(null);

  return {
    persistentPlayerId: getOrCreatePersistentPlayerUid(),
    x: 16,
    y: 16,
    vx: 0,
    vy: 0,
    direction: 'down',
    hp: 100,
    maxHp: 100,
    hunger: 100,
    maxHunger: 100,
    stamina: 100,
    maxStamina: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    attributePoints: 0,
    attributes: {
      vitality: 1,
      strength: 1,
      agility: 1,
      survival: 1,
    },
    goldCoins: 0,
    inventory,
    selectedHotbarIndex: 0,
    equippedArmorId: null,
    equippedBySlot: {
      head: null,
      body: null,
      legs: null,
      feet: null,
    },
    appearance: {
      skinColor: '#fdba74',
      hairColor: '#451a03',
      hairStyle: 'adventurer',
      eyeColor: '#0f172a',
      shirtColor: '#2563eb',
      pantsColor: '#334155',
    },
    respawnX: 16,
    respawnY: 16,
    respawnLabel: 'Acampamento Inicial',
    isMoving: false,
    animFrame: 0,
    animTimer: 0,
    swingTimer: 0,
    swingDuration: 0.28,
    hitFlashTimer: 0,
  };
}

/**
 * Backward-compatible migration: upgrades v1 saves (6 hotbar + 18 backpack = 24 slots)
 * or any older save format to v2 (8 hotbar + 24 backpack = 32 slots + waypoints + interactive chests + 4-slot equipment) without losing data.
 */
export function migrateSaveData(rawSave: WorldSaveData): WorldSaveData {
  const originalWorldGenVersion =
    rawSave.metadata?.createdWorldGenVersion ??
    rawSave.metadata?.worldGenVersion ??
    2;
  const originalGameVersion =
    rawSave.metadata?.createdGameVersion ??
    rawSave.metadata?.gameVersion ??
    '0.4.3-beta';

  const migrated: WorldSaveData = {
    ...rawSave,
    version: CURRENT_SAVE_VERSION,
    metadata: {
      ...rawSave.metadata,
      // Keep original creation version metadata so existing explored chunks stay 100% preserved,
      // while upgrading active worldGenVersion to CURRENT_WORLD_GEN_VERSION for newly explored chunks!
      createdWorldGenVersion: originalWorldGenVersion,
      worldGenVersion: CURRENT_WORLD_GEN_VERSION,
      createdGameVersion: originalGameVersion,
      gameVersion: GAME_VERSION,
    },
    waypoints: Array.isArray(rawSave.waypoints) ? rawSave.waypoints : [],
    droppedItems: Array.isArray(rawSave.droppedItems) ? rawSave.droppedItems : [],
    creatures: Array.isArray(rawSave.creatures) ? rawSave.creatures : [],
    deathBags: Array.isArray(rawSave.deathBags) ? rawSave.deathBags : [],
  };

  if (!migrated.player.persistentPlayerId) {
    migrated.player.persistentPlayerId = getOrCreatePersistentPlayerUid();
  }

  // Ensure any pre-existing tamed animals in a saved world have their ownerId assigned
  if (Array.isArray(migrated.creatures)) {
    for (const cr of migrated.creatures) {
      if (cr && cr.tamed && cr.kind !== 'BOAT' && !cr.ownerId) {
        cr.ownerId = migrated.player.persistentPlayerId;
        if (!cr.ownerName) {
          cr.ownerName = 'Anfitrião';
        }
      }
    }
  }

  if (
    typeof migrated.player.respawnX !== 'number' ||
    !Number.isFinite(migrated.player.respawnX)
  ) {
    migrated.player.respawnX = 16;
  }
  if (
    typeof migrated.player.respawnY !== 'number' ||
    !Number.isFinite(migrated.player.respawnY)
  ) {
    migrated.player.respawnY = 16;
  }
  if (!migrated.player.respawnLabel) {
    migrated.player.respawnLabel = 'Acampamento Inicial';
  }

  if (!migrated.player.equippedBySlot || typeof migrated.player.equippedBySlot !== 'object') {
    migrated.player.equippedBySlot = {
      head: null,
      body: migrated.player.equippedArmorId || null,
      legs: null,
      feet: null,
    };
  } else {
    migrated.player.equippedBySlot = {
      head: migrated.player.equippedBySlot.head || null,
      body: migrated.player.equippedBySlot.body || migrated.player.equippedArmorId || null,
      legs: migrated.player.equippedBySlot.legs || null,
      feet: migrated.player.equippedBySlot.feet || null,
    };
  }
  migrated.player.equippedArmorId = migrated.player.equippedBySlot.body;

  const defaultApp = createInitialPlayerState().appearance;
  migrated.player.appearance = {
    ...defaultApp,
    ...(migrated.player.appearance || {}),
  };

  if (!migrated.player.inventory || !Array.isArray(migrated.player.inventory)) {
    migrated.player.inventory = createInitialPlayerState().inventory;
  } else if (migrated.player.inventory.length < TOTAL_INVENTORY_SIZE) {
    // v1 had 6 hotbar slots (0..5) and 18 backpack slots (6..23).
    // Preserve v1 hotbar items in 0..5, leave 6..7 empty on hotbar, and shift old backpack (6..23) into new backpack (8..25)!
    const oldInv = migrated.player.inventory;
    const newInv = new Array(TOTAL_INVENTORY_SIZE).fill(null);
    if (oldInv.length === 24 && (rawSave.version || 1) === 1) {
      for (let i = 0; i < 6; i++) {
        newInv[i] = oldInv[i] || null;
      }
      for (let i = 6; i < 24; i++) {
        newInv[i + 2] = oldInv[i] || null;
      }
    } else {
      for (let i = 0; i < oldInv.length; i++) {
        newInv[i] = oldInv[i] || null;
      }
    }
    migrated.player.inventory = newInv;
  }

  // Ensure goldCoins is a valid status attribute and migrate any legacy gold_coin inventory slots into player.goldCoins
  migrated.player.goldCoins =
    typeof migrated.player.goldCoins === 'number' &&
    Number.isFinite(migrated.player.goldCoins)
      ? Math.max(0, Math.floor(migrated.player.goldCoins))
      : 0;

  for (let i = 0; i < migrated.player.inventory.length; i++) {
    const slot = migrated.player.inventory[i];
    if (slot && slot.itemId === 'gold_coin') {
      if (slot.count > 0) {
        migrated.player.goldCoins += Math.floor(slot.count);
      }
      migrated.player.inventory[i] = null;
    }
  }

  if (
    typeof migrated.player.selectedHotbarIndex !== 'number' ||
    migrated.player.selectedHotbarIndex < 0 ||
    migrated.player.selectedHotbarIndex >= HOTBAR_SIZE
  ) {
    migrated.player.selectedHotbarIndex = 0;
  }

  // Reconstruct & freeze explored chunk terrain arrays, prune untouched unexplored chunks so new updates generate them fresh,
  // and ensure all placed/generated Chests have a 24-slot storageSlots array.
  if (migrated.chunks && typeof migrated.chunks === 'object') {
    const hydrationMgr = new WorldManager(
      migrated.metadata?.seed || 123456,
      undefined,
      originalWorldGenVersion
    );
    const preservedChunks: Record<string, ChunkData> = {};

    for (const [key, chunk] of Object.entries(migrated.chunks)) {
      if (!chunk) continue;
      if (!WorldManager.isChunkExploredOrModified(chunk)) {
        // Untouched unexplored chunk: do not lock it, so future exploration generates it with CURRENT_WORLD_GEN_VERSION
        continue;
      }

      if (typeof chunk.genVersion !== 'number') {
        chunk.genVersion = originalWorldGenVersion;
      }
      if (!chunk.generatedGameVersion) {
        chunk.generatedGameVersion = originalGameVersion;
      }
      chunk.preserved = true;

      hydrationMgr.hydrateChunk(chunk);

      if (Array.isArray(chunk.structures)) {
        for (const st of chunk.structures) {
          if (st.type === PlaceableType.CHEST) {
            if (
              !Array.isArray(st.storageSlots) ||
              st.storageSlots.length < CHEST_STORAGE_SIZE
            ) {
              const slots = new Array(CHEST_STORAGE_SIZE).fill(null);
              if (Array.isArray(st.storageSlots)) {
                for (
                  let i = 0;
                  i < Math.min(st.storageSlots.length, CHEST_STORAGE_SIZE);
                  i++
                ) {
                  slots[i] = st.storageSlots[i] || null;
                }
              } else if (
                Array.isArray(st.lootItems) &&
                st.lootItems.length > 0
              ) {
                for (
                  let i = 0;
                  i < Math.min(st.lootItems.length, CHEST_STORAGE_SIZE);
                  i++
                ) {
                  slots[i] = {
                    itemId: st.lootItems[i].itemId,
                    count: st.lootItems[i].count,
                  };
                }
              }
              st.storageSlots = slots;
            }
            if (!st.customName && st.landmarkName) {
              st.customName = st.landmarkName;
            }
          }
        }
      }

      preservedChunks[key] = chunk;
    }

    migrated.chunks = preservedChunks;
  }

  return migrated;
}

export class SaveManager {
  public static getDefaultControlLayout() {
    return {
      joystick: { offsetX: 0, offsetY: 0, scale: 1.0 },
      attackBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      interactBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      placeBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      mountBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      hotbar: { offsetX: 0, offsetY: 0, scale: 1.0 },
      statusPlaque: { offsetX: 0, offsetY: 0, scale: 1.0 },
      topMenu: { offsetX: 0, offsetY: 0, scale: 1.0 },
    };
  }

  public static getDefaultSettings(): GameSettings {
    return {
      soundEnabled: true,
      soundVolume: 0.35,
      autoSaveIntervalSec: 20,
      serverSyncEnabled: true,
      customServerUrl: '',
      showTouchControls: true,
      cameraZoom: 1.15,
      hudScale: 1.0,
      hudOpacity: 0.96,
      controlLayout: this.getDefaultControlLayout(),
    };
  }

  public static loadSettings(): GameSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return this.getDefaultSettings();
      const parsed = JSON.parse(raw);
      const defaults = this.getDefaultSettings();
      let resolvedZoom =
        typeof parsed.cameraZoom === 'number' ? parsed.cameraZoom : defaults.cameraZoom;
      if (!parsed._wideCamMigrated && resolvedZoom >= 1.8) {
        resolvedZoom = 1.15;
        try {
          localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({ ...parsed, cameraZoom: 1.15, _wideCamMigrated: true })
          );
        } catch {
          // ignore
        }
      }
      return {
        ...defaults,
        ...parsed,
        cameraZoom: Math.max(0.55, Math.min(2.5, resolvedZoom)),
        controlLayout: {
          ...defaults.controlLayout,
          ...(parsed.controlLayout || {}),
        },
      };
    } catch {
      return this.getDefaultSettings();
    }
  }

  public static saveSettings(settings: GameSettings): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ ...settings, _wideCamMigrated: true })
      );
    } catch {
      // ignore storage quota errors
    }
  }

  public static listWorlds(): WorldMetadata[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw) as WorldMetadata[];
      return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
    } catch {
      return [];
    }
  }

  private static saveWorldIndex(list: WorldMetadata[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }

  public static createNewWorld(
    name: string,
    seedInput: string,
    difficulty: 'normal' | 'survival' | 'hardcore'
  ): WorldSaveData {
    const seed = seedFromText(seedInput);
    const now = Date.now();
    const id = `world_${now}_${Math.floor(Math.random() * 9999)}`;
    const player = createInitialPlayerState();
    const worldMgr = new WorldManager(
      seed,
      undefined,
      CURRENT_WORLD_GEN_VERSION
    );
    worldMgr.revealAround(player.x, player.y, 11);

    const metadata: WorldMetadata = {
      id,
      name: name.trim() || 'Fronteira Selvagem',
      seed,
      seedText: seedInput.trim() || String(seed),
      difficulty,
      createdAt: now,
      updatedAt: now,
      dayCount: 1,
      timeOfDay: 8.0,
      playerLevel: 1,
      exploredChunksCount: worldMgr.getExploredChunksCount(),
      worldGenVersion: CURRENT_WORLD_GEN_VERSION,
      createdWorldGenVersion: CURRENT_WORLD_GEN_VERSION,
      gameVersion: GAME_VERSION,
      createdGameVersion: GAME_VERSION,
    };

    const saveData: WorldSaveData = {
      version: CURRENT_SAVE_VERSION,
      metadata,
      player,
      chunks: worldMgr.chunks,
      creatures: [],
      droppedItems: [],
      waypoints: [
        {
          id: 'wp_origin',
          label: 'Acampamento Inicial',
          tileX: 0,
          tileY: 0,
          color: '#f59e0b',
        },
      ],
      deathBags: [],
    };

    this.saveWorldLocal(saveData);
    return saveData;
  }

  /**
   * Produces a compact copy of `WorldSaveData` for `localStorage` persistence without mutating
   * the live in-memory world state:
   * - Preserves exact chunk terrain via ultra-compact 256-char strings (`compactTiles`, `compactZones`, `compactVariants`)
   *   and `genVersion` / `generatedGameVersion` / `preserved = true` so explored chunks are NEVER altered by future world updates.
   * - Skips untouched, unexplored chunks so newly explored areas always generate with the latest world generation version.
   * - Strips static blueprint properties from `NatureNode` entries.
   */
  private static compactSaveDataForStorage(
    saveData: WorldSaveData,
    strictPrune = false
  ): WorldSaveData {
    const compactChunks: Record<string, ChunkData> = {};
    const playerChunkX = Math.floor((saveData.player?.x || 0) / (32 * 16));
    const playerChunkY = Math.floor((saveData.player?.y || 0) / (32 * 16));

    if (saveData.chunks && typeof saveData.chunks === 'object') {
      for (const [key, chunk] of Object.entries(saveData.chunks)) {
        if (!chunk) continue;
        const hasExplored =
          Array.isArray(chunk.explored) && chunk.explored.some((v) => v > 0);
        const hasPlayerOrCustomStruct =
          Array.isArray(chunk.structures) &&
          chunk.structures.some(
            (s) =>
              s.ownerType === 'PLAYER' ||
              Boolean(s.cropType) ||
              s.type === PlaceableType.TILLED_SOIL ||
              (Array.isArray(s.storageSlots) && s.storageSlots.some(Boolean)) ||
              (Array.isArray(s.stallSlots) && s.stallSlots.some(Boolean))
          );

        if (!hasExplored && !hasPlayerOrCustomStruct) {
          continue;
        }

        if (strictPrune && !hasPlayerOrCustomStruct) {
          const dist = Math.hypot(
            chunk.cx - playerChunkX,
            chunk.cy - playerChunkY
          );
          if (dist > 8 && (!chunk.structures || chunk.structures.length === 0)) {
            continue;
          }
        }

        const allExplored =
          hasExplored &&
          chunk.explored.length === 256 &&
          chunk.explored.every((v) => v > 0);

        const compactNodes = Array.isArray(chunk.nodes)
          ? chunk.nodes.map(
              (n) =>
                ({
                  id: n.id,
                  type: n.type,
                  tileX: n.tileX,
                  tileY: n.tileY,
                  hp: n.hp,
                }) as NatureNode
            )
          : [];

        const compactTiles =
          chunk.compactTiles && chunk.compactTiles.length === 256
            ? chunk.compactTiles
            : WorldManager.encodeCompactTiles(chunk.tiles);
        const compactZones =
          chunk.compactZones && chunk.compactZones.length === 256
            ? chunk.compactZones
            : WorldManager.encodeCompactZones(chunk.ecologicalZones);
        const compactVariants =
          chunk.compactVariants && chunk.compactVariants.length === 256
            ? chunk.compactVariants
            : WorldManager.encodeCompactVariants(chunk.tileVariants);

        compactChunks[key] = {
          cx: chunk.cx,
          cy: chunk.cy,
          ...(chunk.landmarkName ? { landmarkName: chunk.landmarkName } : {}),
          ...(chunk.villageId ? { villageId: chunk.villageId } : {}),
          ...(chunk.mobsPopulated ? { mobsPopulated: true } : {}),
          genVersion:
            typeof chunk.genVersion === 'number'
              ? chunk.genVersion
              : saveData.metadata?.createdWorldGenVersion ??
                saveData.metadata?.worldGenVersion ??
                CURRENT_WORLD_GEN_VERSION,
          generatedGameVersion:
            chunk.generatedGameVersion ||
            saveData.metadata?.gameVersion ||
            GAME_VERSION,
          preserved: true,
          ...(compactTiles ? { compactTiles } : {}),
          ...(compactZones ? { compactZones } : {}),
          ...(compactVariants ? { compactVariants } : {}),
          tiles: [] as unknown as BiomeType[],
          tileVariants: [],
          explored: allExplored ? [1] : hasExplored ? chunk.explored : [],
          nodes: compactNodes,
          structures: chunk.structures || [],
        };
      }
    }

    return {
      ...saveData,
      chunks: compactChunks,
    };
  }

  /**
   * Frees up `localStorage` space by removing legacy `*_bak` keys and compacting any older
   * uncompacted world saves already stored in the browser.
   */
  private static reclaimLocalStorageSpace(excludeWorldId?: string): void {
    try {
      const keysToRemove: string[] = [];
      const worldKeysToCompact: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith(WORLD_PREFIX) && k.endsWith('_bak')) {
          keysToRemove.push(k);
        } else if (
          k.startsWith(WORLD_PREFIX) &&
          (!excludeWorldId || k !== `${WORLD_PREFIX}${excludeWorldId}`)
        ) {
          worldKeysToCompact.push(k);
        }
      }

      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }

      for (const k of worldKeysToCompact) {
        try {
          const raw = localStorage.getItem(k);
          if (!raw || raw.length < 120000) continue; // Already compact
          const env = JSON.parse(raw) as SaveEnvelope;
          if (env && env.data && env.data.chunks) {
            const compacted = this.compactSaveDataForStorage(env.data, true);
            const serialized = JSON.stringify(compacted);
            const newEnv: SaveEnvelope = {
              checksum: computeChecksum(serialized),
              savedAt: env.savedAt || Date.now(),
              data: compacted,
            };
            localStorage.setItem(k, JSON.stringify(newEnv));
          }
        } catch {
          // ignore individual world compaction errors
        }
      }
    } catch {
      // ignore storage iteration errors
    }
  }

  public static saveWorldLocal(saveData: WorldSaveData): boolean {
    try {
      saveData.version = CURRENT_SAVE_VERSION;
      saveData.metadata.updatedAt = Date.now();

      const primaryKey = `${WORLD_PREFIX}${saveData.metadata.id}`;
      const backupKey = `${WORLD_PREFIX}${saveData.metadata.id}_bak`;

      // Remove legacy duplicate _bak entry to avoid doubling localStorage usage
      try {
        localStorage.removeItem(backupKey);
      } catch {
        // ignore
      }

      const compactData = this.compactSaveDataForStorage(saveData, false);
      const serialized = JSON.stringify(compactData);
      const checksum = computeChecksum(serialized);
      const envelope: SaveEnvelope = {
        checksum,
        savedAt: Date.now(),
        data: compactData,
      };
      const envelopeStr = JSON.stringify(envelope);

      try {
        localStorage.setItem(primaryKey, envelopeStr);
      } catch {
        // Reclaim space by removing any _bak keys and compacting other stored worlds, then retry
        this.reclaimLocalStorageSpace(saveData.metadata.id);
        try {
          localStorage.setItem(primaryKey, envelopeStr);
        } catch {
          // Final fallback with strict pruning of distant unmodified chunks
          const strictCompact = this.compactSaveDataForStorage(saveData, true);
          const strictSer = JSON.stringify(strictCompact);
          const strictEnv: SaveEnvelope = {
            checksum: computeChecksum(strictSer),
            savedAt: Date.now(),
            data: strictCompact,
          };
          localStorage.setItem(primaryKey, JSON.stringify(strictEnv));
        }
      }

      const list = this.listWorlds().filter((w) => w.id !== saveData.metadata.id);
      list.unshift(saveData.metadata);
      this.saveWorldIndex(list);
      return true;
    } catch (e) {
      console.warn('Local storage quota reached; world remains active in memory:', e);
      return false;
    }
  }

  public static loadWorldLocal(worldId: string): WorldSaveData | null {
    const primaryKey = `${WORLD_PREFIX}${worldId}`;
    const backupKey = `${WORLD_PREFIX}${worldId}_bak`;

    const tryParseEnvelope = (raw: string | null): WorldSaveData | null => {
      if (!raw) return null;
      try {
        const env = JSON.parse(raw) as SaveEnvelope;
        if (!env || !env.data || !env.checksum) return null;
        const verify = computeChecksum(JSON.stringify(env.data));
        if (verify !== env.checksum) {
          console.warn('Save checksum mismatch, attempting recovery...');
          return null;
        }
        return migrateSaveData(env.data);
      } catch {
        return null;
      }
    };

    const primary = tryParseEnvelope(localStorage.getItem(primaryKey));
    if (primary) return primary;

    const backup = tryParseEnvelope(localStorage.getItem(backupKey));
    if (backup) {
      this.saveWorldLocal(backup);
      return backup;
    }

    return null;
  }

  public static updateWorldMetadata(
    worldId: string,
    newName: string,
    newDifficulty: 'normal' | 'survival' | 'hardcore'
  ): WorldMetadata | null {
    const data = this.loadWorldLocal(worldId);
    if (!data) return null;
    data.metadata.name = newName.trim() || data.metadata.name;
    data.metadata.difficulty = newDifficulty;
    data.metadata.updatedAt = Date.now();
    this.saveWorldLocal(data);
    return data.metadata;
  }

  public static deleteWorld(worldId: string, settings?: GameSettings): void {
    localStorage.removeItem(`${WORLD_PREFIX}${worldId}`);
    localStorage.removeItem(`${WORLD_PREFIX}${worldId}_bak`);
    const list = this.listWorlds().filter((w) => w.id !== worldId);
    this.saveWorldIndex(list);

    const cfg = settings || this.loadSettings();
    if (cfg.serverSyncEnabled) {
      const base = cfg.customServerUrl.trim().replace(/\/$/, '');
      fetch(`${base}/api/worlds/${encodeURIComponent(worldId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }

  public static async syncWorldToServer(
    saveData: WorldSaveData,
    settings?: GameSettings
  ): Promise<{ ok: boolean; message: string }> {
    const cfg = settings || this.loadSettings();
    if (!cfg.serverSyncEnabled) {
      return { ok: false, message: 'Sincronização com servidor desativada.' };
    }
    const base = cfg.customServerUrl.trim().replace(/\/$/, '');
    const url = `${base}/api/worlds`;
    try {
      const checksum = computeChecksum(JSON.stringify(saveData));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: saveData, checksum }),
      });
      if (!res.ok) {
        return { ok: false, message: `Erro HTTP ${res.status}` };
      }
      return { ok: true, message: 'Salvo no servidor com sucesso.' };
    } catch {
      return { ok: false, message: 'Servidor offline (salvo localmente com segurança).' };
    }
  }

  public static async fetchWorldsFromServer(settings?: GameSettings): Promise<WorldMetadata[]> {
    const cfg = settings || this.loadSettings();
    if (!cfg.serverSyncEnabled) return this.listWorlds();
    const base = cfg.customServerUrl.trim().replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/worlds`);
      if (!res.ok) return this.listWorlds();
      const json = await res.json();
      if (Array.isArray(json.worlds)) {
        const localIds = new Set(this.listWorlds().map((w) => w.id));
        for (const serverWorld of json.worlds as WorldSaveData[]) {
          if (serverWorld && serverWorld.metadata && !localIds.has(serverWorld.metadata.id)) {
            this.saveWorldLocal(migrateSaveData(serverWorld));
          }
        }
      }
    } catch {
      // ignore offline
    }
    return this.listWorlds();
  }

  public static downloadWorldFile(saveData: WorldSaveData): void {
    const serialized = JSON.stringify(saveData);
    const envelope: SaveEnvelope = {
      checksum: computeChecksum(serialized),
      savedAt: Date.now(),
      data: saveData,
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = saveData.metadata.name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '_')
      .slice(0, 30);
    a.href = url;
    a.download = `${safeName || 'mundo'}_${saveData.metadata.seed}.wildborn.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public static importWorldFromJson(rawJson: string): {
    ok: boolean;
    world?: WorldSaveData;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(rawJson);
      let saveData: WorldSaveData;

      if (parsed.checksum && parsed.data) {
        const verify = computeChecksum(JSON.stringify(parsed.data));
        if (verify !== parsed.checksum) {
          return {
            ok: false,
            error: 'Arquivo corrompido: falha na verificação de checksum.',
          };
        }
        saveData = parsed.data;
      } else if (parsed.metadata && parsed.player && parsed.chunks) {
        saveData = parsed;
      } else {
        return { ok: false, error: 'Formato de arquivo de mundo inválido.' };
      }

      const migrated = migrateSaveData(saveData);
      this.saveWorldLocal(migrated);
      return { ok: true, world: migrated };
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo JSON.' };
    }
  }
}
