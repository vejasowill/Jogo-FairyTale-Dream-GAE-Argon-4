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
  PlayerAppearance,
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

export const DEFAULT_ACCOUNT_APPEARANCE: PlayerAppearance = {
  gender: 'masculino',
  skinColor: '#fdba74',
  skinMark: 'none',
  hairColor: '#451a03',
  hairStyle: 'adventurer',
  eyeStyle: 'classic',
  eyeColor: '#0f172a',
};

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
      vitality: 0,
      strength: 0,
      agility: 0,
      survival: 0,
      attackSpeed: 0,
      defense: 0,
    },
    goldCoins: 0,
    inventory,
    selectedHotbarIndex: 0,
    equippedArmorId: 'white_tank_top',
    equippedBySlot: {
      head: null,
      body: 'white_tank_top',
      legs: 'brown_shorts',
      feet: null,
    },
    appearance: SaveManager.getAccountAppearance(),
    respawnX: 16,
    respawnY: 16,
    respawnLabel: 'Acampamento Inicial',
    isMoving: false,
    animFrame: 0,
    animTimer: 0,
    swingTimer: 0,
    swingDuration: 0.42,
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

  const rawAttrs = (migrated.player.attributes || {}) as Partial<
    PlayerState['attributes']
  >;
  const isLegacyOneBased = typeof rawAttrs.attackSpeed !== 'number';
  migrated.player.attributes = {
    vitality: Math.max(
      0,
      Math.floor((rawAttrs.vitality ?? (isLegacyOneBased ? 1 : 0)) - (isLegacyOneBased ? 1 : 0))
    ),
    strength: Math.max(
      0,
      Math.floor((rawAttrs.strength ?? (isLegacyOneBased ? 1 : 0)) - (isLegacyOneBased ? 1 : 0))
    ),
    agility: Math.max(
      0,
      Math.floor((rawAttrs.agility ?? (isLegacyOneBased ? 1 : 0)) - (isLegacyOneBased ? 1 : 0))
    ),
    survival: Math.max(
      0,
      Math.floor((rawAttrs.survival ?? (isLegacyOneBased ? 1 : 0)) - (isLegacyOneBased ? 1 : 0))
    ),
    attackSpeed: Math.max(0, Math.floor(rawAttrs.attackSpeed ?? 0)),
    defense: Math.max(0, Math.floor(rawAttrs.defense ?? 0)),
  };

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

  // Universal Account Appearance: all worlds point to the account's universal appearance
  const universalApp = SaveManager.getAccountAppearance(migrated.player.appearance);
  migrated.player.appearance = {
    ...DEFAULT_ACCOUNT_APPEARANCE,
    ...universalApp,
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
    for (const chunk of Object.values(migrated.chunks)) {
      if (!chunk) continue;
      if (typeof chunk.genVersion !== 'number') {
        chunk.genVersion = originalWorldGenVersion;
      }
      if (!chunk.generatedGameVersion) {
        chunk.generatedGameVersion = originalGameVersion;
      }
    }

    const hydrationMgr = new WorldManager(
      migrated.metadata?.seed || 123456,
      migrated.chunks,
      originalWorldGenVersion
    );
    const preservedChunks: Record<string, ChunkData> = {};

    for (const [key, chunk] of Object.entries(hydrationMgr.chunks)) {
      if (!chunk) continue;
      chunk.preserved = true;

      if (Array.isArray(chunk.structures)) {
        for (const st of chunk.structures) {
          if (
            (st.type as string) === 'TREE_SAPLING' ||
            (st.type as string) === 'SAPLING' ||
            st.itemId === 'tree_sapling' ||
            st.itemId === 'generic_sapling' ||
            st.itemId === 'sapling'
          ) {
            st.type = PlaceableType.OAK_SAPLING;
            st.itemId = 'oak_sapling';
          }
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
            if (Array.isArray(st.storageSlots)) {
              for (const s of st.storageSlots) {
                if (
                  s &&
                  (s.itemId === 'tree_sapling' ||
                    s.itemId === 'generic_sapling' ||
                    s.itemId === 'sapling')
                ) {
                  s.itemId = 'oak_sapling';
                }
              }
            }
            if (!st.customName && st.landmarkName) {
              st.customName = st.landmarkName;
            }
          }
          if (Array.isArray(st.stallSlots)) {
            for (const s of st.stallSlots) {
              if (
                s &&
                (s.itemId === 'tree_sapling' ||
                  s.itemId === 'generic_sapling' ||
                  s.itemId === 'sapling')
              ) {
                s.itemId = 'oak_sapling';
              }
            }
          }
        }
      }

      preservedChunks[key] = chunk;
    }

    migrated.chunks = preservedChunks;
  }

  // Migrate any legacy generic sapling item IDs in inventories, mounts, death bags, or dropped items to oak_sapling (Muda de Carvalho)
  const migrateLegacyItemId = (id: string): string =>
    id === 'tree_sapling' || id === 'generic_sapling' || id === 'sapling'
      ? 'oak_sapling'
      : id;

  if (Array.isArray(migrated.player?.inventory)) {
    for (const s of migrated.player.inventory) {
      if (s && s.itemId) s.itemId = migrateLegacyItemId(s.itemId);
    }
  }
  if (migrated.guestPlayers && typeof migrated.guestPlayers === 'object') {
    for (const gp of Object.values(migrated.guestPlayers)) {
      if (gp && Array.isArray(gp.inventory)) {
        for (const s of gp.inventory) {
          if (s && s.itemId) s.itemId = migrateLegacyItemId(s.itemId);
        }
      }
    }
  }
  if (Array.isArray(migrated.creatures)) {
    for (const cr of migrated.creatures) {
      if (cr && Array.isArray(cr.mountInventory)) {
        for (const s of cr.mountInventory) {
          if (s && s.itemId) s.itemId = migrateLegacyItemId(s.itemId);
        }
      }
    }
  }
  if (Array.isArray(migrated.droppedItems)) {
    for (const d of migrated.droppedItems) {
      if (d && d.itemId) d.itemId = migrateLegacyItemId(d.itemId);
    }
  }
  if (Array.isArray(migrated.deathBags)) {
    for (const db of migrated.deathBags) {
      if (db && Array.isArray(db.items)) {
        for (const s of db.items) {
          if (s && s.itemId) s.itemId = migrateLegacyItemId(s.itemId);
        }
      }
    }
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
      musicVolume: 0.2,
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
      let resolvedMusicVolume =
        typeof parsed.musicVolume === 'number' && Number.isFinite(parsed.musicVolume)
          ? Math.max(0, Math.min(1, parsed.musicVolume))
          : defaults.musicVolume;
      if (!parsed._musicVol20Migrated && Math.abs(resolvedMusicVolume - 0.3) < 0.001) {
        resolvedMusicVolume = 0.2;
        try {
          localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({
              ...parsed,
              musicVolume: 0.2,
              _wideCamMigrated: true,
              _musicVol20Migrated: true,
            })
          );
        } catch {
          // ignore
        }
      }
      return {
        ...defaults,
        ...parsed,
        musicVolume: resolvedMusicVolume,
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
        JSON.stringify({
          ...settings,
          _wideCamMigrated: true,
          _musicVol20Migrated: true,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }

  /**
   * Returns the universal account appearance shared across all worlds and the start screen.
   * If not yet initialized in settings, migrates from `fallbackWorldAppearance` or the most recent saved world.
   */
  public static getAccountAppearance(
    fallbackWorldAppearance?: Partial<PlayerAppearance>
  ): PlayerAppearance {
    try {
      const settings = this.loadSettings();
      if (settings.accountAppearance && settings.accountAppearance.skinColor) {
        return {
          ...DEFAULT_ACCOUNT_APPEARANCE,
          ...settings.accountAppearance,
        };
      }
      if (fallbackWorldAppearance && fallbackWorldAppearance.skinColor) {
        const adopted: PlayerAppearance = {
          ...DEFAULT_ACCOUNT_APPEARANCE,
          ...fallbackWorldAppearance,
        };
        this.saveSettings({
          ...settings,
          accountAppearance: adopted,
        });
        return adopted;
      }
      const worlds = this.listWorlds();
      if (worlds.length > 0) {
        const raw = localStorage.getItem(`${WORLD_PREFIX}${worlds[0].id}`);
        if (raw) {
          const env = JSON.parse(raw) as SaveEnvelope;
          const worldApp = env?.data?.player?.appearance;
          if (worldApp && worldApp.skinColor) {
            const adopted: PlayerAppearance = {
              ...DEFAULT_ACCOUNT_APPEARANCE,
              ...worldApp,
            };
            this.saveSettings({
              ...settings,
              accountAppearance: adopted,
            });
            return adopted;
          }
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_ACCOUNT_APPEARANCE };
  }

  /**
   * Updates and persists the universal account appearance in settings and propagates it to saved guest profiles.
   */
  public static saveAccountAppearance(
    partial: Partial<PlayerAppearance>
  ): PlayerAppearance {
    const current = this.getAccountAppearance();
    const updated: PlayerAppearance = {
      ...DEFAULT_ACCOUNT_APPEARANCE,
      ...current,
      ...partial,
    };
    const settings = this.loadSettings();
    this.saveSettings({
      ...settings,
      accountAppearance: updated,
    });
    // Also update any cached guest profiles so online sessions reflect the universal appearance
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wildborn_guest_player_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') {
              p.appearance = { ...updated };
              localStorage.setItem(key, JSON.stringify(p));
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return updated;
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

    // Find a valid, collision-free natural dry-land spawn point without molding a circular Plains clearing
    const initialSpawn = worldMgr.findInitialPlayerSpawnPoint();
    player.x = initialSpawn.x;
    player.y = initialSpawn.y;
    player.respawnX = initialSpawn.x;
    player.respawnY = initialSpawn.y;

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
          tileX: initialSpawn.tileX,
          tileY: initialSpawn.tileY,
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
   * - Preserves 100% of all explored chunks (both natural terrain and structures) via ultra-compact
   *   strings (`compactTiles`, `compactZones`, `compactVariants`, `compactExplored`) and `genVersion` / `preserved = true`
   *   so previously explored natural areas are NEVER lost or altered by future world updates.
   * - Skips only untouched, completely unexplored chunks so newly explored areas generate with the latest world generation version.
   * - Strips static blueprint properties from `NatureNode` entries.
   */
  private static compactSaveDataForStorage(
    saveData: WorldSaveData,
    strictNodePrune = false,
    maxFullNodeRadius = 18
  ): WorldSaveData {
    const compactChunks: Record<string, ChunkData> = {};
    const playerChunkX = Math.floor((saveData.player?.x || 0) / (32 * 16));
    const playerChunkY = Math.floor((saveData.player?.y || 0) / (32 * 16));

    if (saveData.chunks && typeof saveData.chunks === 'object') {
      for (const [key, chunk] of Object.entries(saveData.chunks)) {
        if (!chunk) continue;
        const hasExploredArray =
          Array.isArray(chunk.explored) && chunk.explored.some((v) => v > 0);
        const hasCompactExplored =
          typeof chunk.compactExplored === 'string' &&
          chunk.compactExplored.length > 0 &&
          !/^0+$/.test(chunk.compactExplored);
        const hasExplored = hasExploredArray || hasCompactExplored;

        const hasPlayerOrCustomStruct =
          Array.isArray(chunk.structures) &&
          chunk.structures.some(
            (s) =>
              s.ownerType === 'PLAYER' ||
              Boolean(s.cropType) ||
              s.type === PlaceableType.TILLED_SOIL ||
              s.type === PlaceableType.CHEST ||
              (Array.isArray(s.storageSlots) && s.storageSlots.some(Boolean)) ||
              (Array.isArray(s.stallSlots) && s.stallSlots.some(Boolean)) ||
              (typeof s.storageRevision === 'number' && s.storageRevision > 0)
          );

        if (!hasExplored && !hasPlayerOrCustomStruct) {
          continue;
        }

        const allExplored =
          (hasExploredArray &&
             ((chunk.explored.length === 1 && chunk.explored[0] > 0) ||
              (chunk.explored.length === 256 &&
                chunk.explored.every((v) => v > 0)))) ||
          chunk.compactExplored === 'F'.repeat(64);

        const compactExplored = allExplored
          ? undefined
          : hasExploredArray
          ? WorldManager.encodeCompactExplored(chunk.explored)
          : chunk.compactExplored;

        const dist = Math.hypot(
          chunk.cx - playerChunkX,
          chunk.cy - playerChunkY
        );
        const skipUndamagedCommonNodes =
          strictNodePrune &&
          dist > maxFullNodeRadius &&
          !hasPlayerOrCustomStruct;

        const compactNodes = Array.isArray(chunk.nodes)
          ? chunk.nodes
              .filter(
                (n) =>
                  !skipUndamagedCommonNodes ||
                  (typeof n.hp === 'number' &&
                    typeof n.maxHp === 'number' &&
                    n.hp < n.maxHp)
              )
              .map(
                (n) =>
                  ({
                    type: n.type,
                    tileX: n.tileX,
                    tileY: n.tileY,
                    ...(typeof n.hp === 'number' &&
                    typeof n.maxHp === 'number' &&
                    n.hp < n.maxHp
                      ? { hp: n.hp }
                      : {}),
                    ...(typeof n.variant === 'number'
                      ? { variant: n.variant }
                      : {}),
                    ...(n.flowerColor ? { flowerColor: n.flowerColor } : {}),
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
          ...(chunk.islandMobsPopulated ? { islandMobsPopulated: true } : {}),
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
          ...(compactExplored ? { compactExplored } : {}),
          tiles: [] as unknown as BiomeType[],
          tileVariants: [],
          explored: allExplored ? [1] : [],
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
   * uncompacted world saves already stored in the browser without deleting explored chunks.
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
            const compacted = this.compactSaveDataForStorage(env.data, false);
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
    const primaryKey = `${WORLD_PREFIX}${saveData.metadata.id}`;
    const backupKey = `${WORLD_PREFIX}${saveData.metadata.id}_bak`;
    let previousPrimaryRaw: string | null = null;
    try {
      previousPrimaryRaw = localStorage.getItem(primaryKey);
    } catch {
      previousPrimaryRaw = null;
    }

    try {
      saveData.version = CURRENT_SAVE_VERSION;
      saveData.metadata.updatedAt = Date.now();

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
        // CRITICAL: Browsers check (existingPrimaryKeySize + newEnvelopeStrSize <= 5MB) when overwriting!
        // Remove primaryKey temporarily in-memory so the old save doesn't occupy half the 5MB quota during the write!
        try {
          localStorage.removeItem(primaryKey);
        } catch {
          // ignore
        }
        this.reclaimLocalStorageSpace(saveData.metadata.id);
        try {
          localStorage.setItem(primaryKey, envelopeStr);
        } catch {
          // Fallback 1: Keep 100% of explored chunks & terrain, compact distant undamaged nodes (> 18 chunks away)
          try {
            const strictCompact = this.compactSaveDataForStorage(saveData, true, 18);
            const strictSer = JSON.stringify(strictCompact);
            const strictEnv: SaveEnvelope = {
              checksum: computeChecksum(strictSer),
              savedAt: Date.now(),
              data: strictCompact,
            };
            localStorage.setItem(primaryKey, JSON.stringify(strictEnv));
          } catch {
            // Fallback 2: Keep 100% of explored chunks & terrain, compact distant undamaged nodes (> 8 chunks away)
            const ultraCompact = this.compactSaveDataForStorage(saveData, true, 8);
            const ultraSer = JSON.stringify(ultraCompact);
            const ultraEnv: SaveEnvelope = {
              checksum: computeChecksum(ultraSer),
              savedAt: Date.now(),
              data: ultraCompact,
            };
            localStorage.setItem(primaryKey, JSON.stringify(ultraEnv));
          }
        }
      }

      const list = this.listWorlds().filter((w) => w.id !== saveData.metadata.id);
      list.unshift(saveData.metadata);
      this.saveWorldIndex(list);
      return true;
    } catch (e) {
      // Restore previous save if all writes failed so existing progress is never lost
      if (previousPrimaryRaw && !localStorage.getItem(primaryKey)) {
        try {
          localStorage.setItem(primaryKey, previousPrimaryRaw);
        } catch {
          // ignore
        }
      }
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
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2500);
    try {
      const checksum = computeChecksum(JSON.stringify(saveData));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: saveData, checksum }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      if (!res.ok) {
        return { ok: false, message: `Erro HTTP ${res.status}` };
      }
      return { ok: true, message: 'Salvo no servidor com sucesso.' };
    } catch {
      window.clearTimeout(timeoutId);
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
