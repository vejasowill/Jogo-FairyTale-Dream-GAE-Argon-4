import {
  BiomeType,
  CHEST_STORAGE_SIZE,
  ChunkData,
  CreatureKind,
  CURRENT_WORLD_GEN_VERSION,
  GAME_VERSION,
  GameSettings,
  HOTBAR_SIZE,
  InventorySlot,
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

  // Migrate any legacy generic sapling item IDs or temporary gold tools, and purge removed narrative items
  const REMOVED_ITEM_IDS = new Set([
    'solar_crystal',
    'astral_shard',
    'solar_bloom',
    'solar_seeds',
    'solar_altar',
    'healing_fountain',
  ]);
  const migrateLegacyItemId = (id: string | undefined | null): string | null => {
    if (!id || typeof id !== 'string') return null;
    if (REMOVED_ITEM_IDS.has(id)) return null;
    if (id === 'tree_sapling' || id === 'generic_sapling' || id === 'sapling') {
      return 'oak_sapling';
    }
    if (id === 'gold_pickaxe') return 'primordial_pickaxe';
    if (id === 'gold_sword') return 'astral_sword';
    if (id === 'gold_axe') return 'primordial_axe';
    return id;
  };

  const cleanInventoryArray = (arr: (InventorySlot | null)[]) => {
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (s && s.itemId) {
        const mapped = migrateLegacyItemId(s.itemId);
        if (!mapped) {
          arr[i] = null;
        } else {
          s.itemId = mapped;
        }
      }
    }
  };

  const sanitizeCreatureEntity = (cr: any) => {
    if (!cr || typeof cr !== 'object') return;
    if (
      cr.customName === 'Escorpião Imperador Solar' ||
      cr.customName === 'Escorpião Rei Solar'
    ) {
      cr.customName = 'Escorpião Rei';
    } else if (cr.customName === 'Colosso Solar') {
      cr.customName = 'Colosso Rúnico';
    } else if (cr.customName === 'Valéria Escudo Solar') {
      cr.customName = 'Valéria Escudo Dourado';
    }
    if (
      typeof cr.dialogueLine === 'string' &&
      /hélio|solar|astral|santuário/i.test(cr.dialogueLine)
    ) {
      cr.dialogueLine =
        'Que os ventos guiem sua jornada pelas terras selvagens!';
    }
    if (Array.isArray(cr.favoriteFoodIds)) {
      cr.favoriteFoodIds = cr.favoriteFoodIds
        .map((id: string) =>
          id === 'solar_bloom' || id === 'solar_seeds'
            ? 'sunflower'
            : migrateLegacyItemId(id)
        )
        .filter((id: string | null): id is string => Boolean(id));
    }
    if (Array.isArray(cr.mountInventory)) {
      cleanInventoryArray(cr.mountInventory);
    }
    if (Array.isArray(cr.trades)) {
      cr.trades = cr.trades
        .map((tr: any) => {
          if (!tr || typeof tr !== 'object') return null;
          if (tr.costItemId === 'solar_seeds') {
            tr.costItemId = 'herb';
          } else if (tr.costItemId === 'solar_crystal') {
            tr.costItemId = 'gold_bar';
          } else if (tr.costItemId === 'astral_shard') {
            tr.costItemId = 'gold_ore';
          } else if (tr.costItemId) {
            const mappedCost = migrateLegacyItemId(tr.costItemId);
            if (!mappedCost) return null;
            tr.costItemId = mappedCost;
          }

          if (tr.rewardItemId === 'solar_seeds') {
            tr.rewardItemId = 'sunflower_seed';
          } else if (tr.rewardItemId === 'solar_crystal') {
            tr.rewardItemId = 'gold_bar';
          } else if (tr.rewardItemId === 'astral_shard') {
            tr.rewardItemId = 'gold_ore';
          } else if (tr.rewardItemId) {
            const mappedReward = migrateLegacyItemId(tr.rewardItemId);
            if (!mappedReward) return null;
            tr.rewardItemId = mappedReward;
          }

          if (typeof tr.label === 'string') {
            tr.label = tr.label
              .replace(/Arsenal Solar/g, 'Arsenal Real')
              .replace(/Bússola Solar/g, 'Bússola Real')
              .replace(/Ambrósia Primordial/g, 'Elixir Vital')
              .replace(/Sementes Solares/g, 'Sementes de Girassol')
              .replace(/Cristal Solar/g, 'Barra de Ouro')
              .replace(/Fragmento Raro/g, 'Minério de Ouro');
          }
          return tr;
        })
        .filter(Boolean);
    }
  };

  const sanitizePlayerState = (p: any) => {
    if (!p || typeof p !== 'object') return;
    if (Array.isArray(p.inventory)) {
      cleanInventoryArray(p.inventory);
    }
    if (p.equippedArmorId) {
      p.equippedArmorId = migrateLegacyItemId(p.equippedArmorId);
    }
    if (p.equippedBySlot && typeof p.equippedBySlot === 'object') {
      for (const slotKey of ['head', 'body', 'legs', 'feet'] as const) {
        if (p.equippedBySlot[slotKey]) {
          p.equippedBySlot[slotKey] = migrateLegacyItemId(
            p.equippedBySlot[slotKey]
          );
        }
      }
    }
    if (p.mountedCreatureData) {
      sanitizeCreatureEntity(p.mountedCreatureData);
    }
  };

  const cleanChunkObjects = (chunksMap?: Record<string, ChunkData>) => {
    if (!chunksMap || typeof chunksMap !== 'object') return;
    for (const chunk of Object.values(chunksMap)) {
      if (!chunk) continue;
      if (Array.isArray(chunk.nodes)) {
        chunk.nodes = chunk.nodes.filter(
          (n) =>
            n &&
            (n.type as string) !== 'DESERT_CRYSTAL' &&
            (n.type as string) !== 'SUNSTONE_OBELISK'
        );
      }
      const isSolarSanctuaryChunk =
        chunk.landmarkName === 'Santuário Solar Antigo' ||
        (Array.isArray(chunk.structures) &&
          chunk.structures.some(
            (st) =>
              st &&
              (st.landmarkName === 'Relicário do Templo Solar' ||
                st.customName === 'Relicário do Templo Solar' ||
                st.landmarkName === 'Santuário Solar Antigo')
          ));
      if (isSolarSanctuaryChunk) {
        delete chunk.landmarkName;
      }

      if (Array.isArray(chunk.structures)) {
        chunk.structures = chunk.structures.filter((st) => {
          if (!st) return false;
          if (
            (st.type as string) === 'SOLAR_ALTAR' ||
            (st.type as string) === 'HEALING_FOUNTAIN' ||
            st.itemId === 'solar_altar' ||
            st.itemId === 'healing_fountain'
          ) {
            return false;
          }
          if (isSolarSanctuaryChunk) {
            const isPlayerBuilt =
              Boolean(st.placedAt) || st.ownerType === 'PLAYER';
            if (
              !isPlayerBuilt ||
              st.landmarkName === 'Relicário do Templo Solar' ||
              st.customName === 'Relicário do Templo Solar'
            ) {
              return false;
            }
          }
          return true;
        });

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
          if ((st.cropType as string) === 'solar_bloom') {
            st.cropType = undefined;
            st.growthStage = 0;
            st.growthProgress = 0;
          }
          if (Array.isArray(st.lootItems)) {
            st.lootItems = st.lootItems.filter((li) => {
              if (!li || !li.itemId) return false;
              const mapped = migrateLegacyItemId(li.itemId);
              if (!mapped) return false;
              li.itemId = mapped;
              return true;
            });
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
            if (!st.customName && st.landmarkName) {
              st.customName = st.landmarkName;
            }
          }
          if (Array.isArray(st.storageSlots)) {
            cleanInventoryArray(st.storageSlots);
          }
          if (Array.isArray(st.stallSlots)) {
            cleanInventoryArray(st.stallSlots);
          }
          if (st.pendingCustomerOffer && st.pendingCustomerOffer.itemId) {
            const mappedOffer = migrateLegacyItemId(
              st.pendingCustomerOffer.itemId
            );
            if (!mappedOffer) {
              st.pendingCustomerOffer = null;
            } else {
              st.pendingCustomerOffer.itemId = mappedOffer;
            }
          }
          if (st.cookingRecipeId) {
            const mappedInput = migrateLegacyItemId(st.cookingRecipeId);
            if (!mappedInput) {
              st.cookingRecipeId = undefined;
              st.cookingInputCount = 0;
              st.cookingProgress = 0;
            } else {
              st.cookingRecipeId = mappedInput;
            }
          }
          if (st.outputItemId) {
            const mappedOut = migrateLegacyItemId(st.outputItemId);
            if (!mappedOut) {
              st.outputItemId = undefined;
              st.outputCount = 0;
            } else {
              st.outputItemId = mappedOut;
            }
          }
          if (st.fuelItemId) {
            const mappedFuel = migrateLegacyItemId(st.fuelItemId);
            if (!mappedFuel) {
              st.fuelItemId = undefined;
              st.fuelCount = 0;
            } else {
              st.fuelItemId = mappedFuel;
            }
          }
          if (st.weavingTargetItemId) {
            const mappedTarget = migrateLegacyItemId(st.weavingTargetItemId);
            if (!mappedTarget) {
              st.weavingTargetItemId = undefined;
            } else {
              st.weavingTargetItemId = mappedTarget;
            }
          }
          if (st.weavingDyeItemId) {
            const mappedDye = migrateLegacyItemId(st.weavingDyeItemId);
            if (!mappedDye) {
              st.weavingDyeItemId = undefined;
            } else {
              st.weavingDyeItemId = mappedDye;
            }
          }
        }
      }
      chunk.dirtyRev = (chunk.dirtyRev || 1) + 1;
    }
  };

  // Pre-clean raw chunks before WorldManager hydration
  cleanChunkObjects(migrated.chunks);
  cleanChunkObjects(migrated.undergroundChunks);

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
    if (
      migrated.undergroundChunks &&
      typeof migrated.undergroundChunks === 'object'
    ) {
      for (const uChunk of Object.values(migrated.undergroundChunks)) {
        if (!uChunk) continue;
        uChunk.isUnderground = true;
        if (typeof uChunk.genVersion !== 'number') {
          uChunk.genVersion = originalWorldGenVersion;
        }
        if (!uChunk.generatedGameVersion) {
          uChunk.generatedGameVersion = originalGameVersion;
        }
      }
    }

    const hydrationMgr = new WorldManager(
      migrated.metadata?.seed || 123456,
      migrated.chunks,
      originalWorldGenVersion,
      migrated.undergroundChunks
    );
    const preservedChunks: Record<string, ChunkData> = {};

    for (const [key, chunk] of Object.entries(hydrationMgr.chunks)) {
      if (!chunk) continue;
      chunk.preserved = true;
      preservedChunks[key] = chunk;
    }

    migrated.chunks = preservedChunks;
    if (
      hydrationMgr.undergroundChunks &&
      Object.keys(hydrationMgr.undergroundChunks).length > 0
    ) {
      migrated.undergroundChunks = hydrationMgr.undergroundChunks;
    }
  }

  // Post-clean hydrated chunks & entities
  cleanChunkObjects(migrated.chunks);
  cleanChunkObjects(migrated.undergroundChunks);

  // Ensure default world spawn and default respawn (when no bed/tent checkpoint is set)
  // always use the seed's valid deterministic initial spawn point instead of (16, 16)
  const originWp = Array.isArray(migrated.waypoints)
    ? migrated.waypoints.find((w) => w && w.id === 'wp_origin')
    : undefined;
  let defaultSeedSpawn: {
    x: number;
    y: number;
    tileX: number;
    tileY: number;
  } | null = null;
  if (typeof migrated.metadata?.seed === 'number') {
    const spawnProbeMgr = new WorldManager(
      migrated.metadata.seed,
      undefined,
      migrated.metadata.createdWorldGenVersion ??
        migrated.metadata.worldGenVersion ??
        CURRENT_WORLD_GEN_VERSION
    );
    defaultSeedSpawn = spawnProbeMgr.getSeedDefaultSpawnPoint();
    if (originWp) {
      originWp.tileX = defaultSeedSpawn.tileX;
      originWp.tileY = defaultSeedSpawn.tileY;
    }
  }

  const syncDefaultRespawnToSeed = (p: PlayerState | undefined) => {
    if (!p || !defaultSeedSpawn) return;
    const isDefaultLabel =
      !p.respawnLabel || p.respawnLabel === 'Acampamento Inicial';
    const hasInvalidRespawnCoords =
      typeof p.respawnX !== 'number' ||
      !Number.isFinite(p.respawnX) ||
      typeof p.respawnY !== 'number' ||
      !Number.isFinite(p.respawnY);
    if (isDefaultLabel || hasInvalidRespawnCoords) {
      p.respawnX = defaultSeedSpawn.x;
      p.respawnY = defaultSeedSpawn.y;
      p.respawnLabel = 'Acampamento Inicial';
      p.respawnIsUnderground = false;
    }
  };

  sanitizePlayerState(migrated.player);
  syncDefaultRespawnToSeed(migrated.player);
  if (migrated.guestPlayers && typeof migrated.guestPlayers === 'object') {
    for (const gp of Object.values(migrated.guestPlayers)) {
      sanitizePlayerState(gp);
      syncDefaultRespawnToSeed(gp);
    }
  }
  if (Array.isArray(migrated.creatures)) {
    for (const cr of migrated.creatures) {
      sanitizeCreatureEntity(cr);
    }
  }
  if (Array.isArray(migrated.droppedItems)) {
    migrated.droppedItems = migrated.droppedItems.filter((d) => {
      if (!d || !d.itemId) return false;
      const mapped = migrateLegacyItemId(d.itemId);
      if (!mapped) return false;
      d.itemId = mapped;
      return true;
    });
  }
  if (Array.isArray(migrated.deathBags)) {
    for (const db of migrated.deathBags) {
      if (db && Array.isArray(db.items)) {
        db.items = db.items.filter((s) => {
          if (!s || !s.itemId) return false;
          const mapped = migrateLegacyItemId(s.itemId);
          if (!mapped) return false;
          s.itemId = mapped;
          return true;
        });
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
      rotateBtn: { offsetX: 0, offsetY: 0, scale: 1.0 },
      hotbar: { offsetX: 0, offsetY: 0, scale: 1.0 },
      statusPlaque: { offsetX: 0, offsetY: 0, scale: 1.0 },
      topMenu: { offsetX: 0, offsetY: 0, scale: 1.0 },
    };
  }

  public static getDefaultSettings(): GameSettings {
    return {
      soundEnabled: true,
      soundVolume: 0.35,
      ambientVolume: 0.45,
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
      const resolvedAmbientVolume =
        typeof parsed.ambientVolume === 'number' && Number.isFinite(parsed.ambientVolume)
          ? Math.max(0, Math.min(1, parsed.ambientVolume))
          : defaults.ambientVolume;
      return {
        ...defaults,
        ...parsed,
        ambientVolume: resolvedAmbientVolume,
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

  private static memoryWorlds = new Map<string, WorldSaveData>();
  private static memoryWorldIndex = new Map<string, WorldMetadata>();
  private static compactChunkCache = new Map<
    string,
    Map<string, { rev: number; compact: ChunkData }>
  >();
  private static idbPromise: Promise<IDBDatabase | null> | null = null;
  private static idbHydrationPromise: Promise<WorldMetadata[]> | null = null;
  private static idbWriteChain: Promise<boolean> = Promise.resolve(true);

  private static getSaveTimestamp(data?: WorldSaveData | null): number {
    if (!data) return 0;
    return Math.max(
      Number(data.metadata?.updatedAt) || 0,
      Number(data.player?.savedAt) || 0
    );
  }

  private static openIdb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return Promise.resolve(null);
    }
    if (this.idbPromise) return this.idbPromise;
    this.idbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open('wildborn_idb_v1', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('worlds')) {
            db.createObjectStore('worlds', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.idbPromise;
  }

  private static async writeWorldToIdb(saveData: WorldSaveData): Promise<boolean> {
    if (!saveData?.metadata?.id) return false;
    const nextOp = this.idbWriteChain
      .catch(() => false)
      .then(async () => {
        const db = await this.openIdb();
        if (!db || !saveData?.metadata?.id) return false;
        const latestInMemory =
          this.memoryWorlds.get(saveData.metadata.id) || saveData;
        return new Promise<boolean>((resolve) => {
          try {
            const tx = db.transaction('worlds', 'readwrite');
            const store = tx.objectStore('worlds');
            store.put({
              id: latestInMemory.metadata.id,
              savedAt: this.getSaveTimestamp(latestInMemory) || Date.now(),
              data: latestInMemory,
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          } catch {
            resolve(false);
          }
        });
      });
    this.idbWriteChain = nextOp;
    return nextOp;
  }

  private static async readWorldFromIdb(
    worldId: string
  ): Promise<WorldSaveData | null> {
    const db = await this.openIdb();
    if (!db || !worldId) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('worlds', 'readonly');
        const store = tx.objectStore('worlds');
        const req = store.get(worldId);
        req.onsuccess = () => {
          const rec = req.result;
          if (rec && rec.data && rec.data.metadata) {
            resolve(rec.data as WorldSaveData);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private static async deleteWorldFromIdb(worldId: string): Promise<void> {
    const db = await this.openIdb();
    if (!db || !worldId) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('worlds', 'readwrite');
        const store = tx.objectStore('worlds');
        store.delete(worldId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Hydrates in-memory cache and world index from IndexedDB so worlds that exceeded
   * localStorage's 5MB cap in previous sessions are immediately available with 100% of their latest progress.
   */
  public static async hydrateFromIndexedDB(): Promise<WorldMetadata[]> {
    if (this.idbHydrationPromise) return this.idbHydrationPromise;
    this.idbHydrationPromise = (async () => {
      const db = await this.openIdb();
      if (!db) return this.listWorlds();
      const records: { id: string; savedAt: number; data: WorldSaveData }[] =
        await new Promise((resolve) => {
          try {
            const tx = db.transaction('worlds', 'readonly');
            const store = tx.objectStore('worlds');
            const req = store.getAll();
            req.onsuccess = () =>
              resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        });

      for (const rec of records) {
        if (!rec || !rec.data || !rec.data.metadata?.id) continue;
        const id = rec.data.metadata.id;
        const idbTs = this.getSaveTimestamp(rec.data);
        const memExisting = this.memoryWorlds.get(id);
        const memTs = this.getSaveTimestamp(memExisting);
        if (idbTs >= memTs) {
          this.memoryWorlds.set(id, rec.data);
          this.memoryWorldIndex.set(id, { ...rec.data.metadata });
        }
      }

      const merged = this.listWorlds();
      this.saveWorldIndex(merged);
      return merged;
    })();
    try {
      return await this.idbHydrationPromise;
    } finally {
      this.idbHydrationPromise = null;
    }
  }

  public static listWorlds(): WorldMetadata[] {
    const byId = new Map<string, WorldMetadata>();
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (raw) {
        const list = JSON.parse(raw) as WorldMetadata[];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id) {
              byId.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // ignore
    }

    for (const [id, meta] of this.memoryWorldIndex.entries()) {
      const existing = byId.get(id);
      if (!existing || (meta.updatedAt || 0) >= (existing.updatedAt || 0)) {
        byId.set(id, { ...meta });
      }
    }

    for (const [id, world] of this.memoryWorlds.entries()) {
      if (!world?.metadata) continue;
      const existing = byId.get(id);
      if (
        !existing ||
        (world.metadata.updatedAt || 0) >= (existing.updatedAt || 0)
      ) {
        byId.set(id, { ...world.metadata });
      }
    }

    return Array.from(byId.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
  }

  private static saveWorldIndex(list: WorldMetadata[]): void {
    for (const item of list) {
      if (item && item.id) {
        this.memoryWorldIndex.set(item.id, { ...item });
      }
    }
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    } catch {
      // ignore if localStorage is full; memoryWorldIndex & IndexedDB remain authoritative
    }
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
   * Produces a compact copy of `WorldSaveData` for storage persistence without mutating
   * the live in-memory world state:
   * - Preserves 100% of all explored chunks (both natural terrain, nodes, and structures) via ultra-compact
   *   strings (`compactTiles`, `compactZones`, `compactVariants`, `compactExplored`, `compactNodes`) and `genVersion` / `preserved = true`
   *   so previously explored natural areas are NEVER lost or altered by future world updates.
   * - Skips only untouched, completely unexplored chunks so newly explored areas generate with the latest world generation version.
   */
  public static compactChunkForNetwork(chunk: ChunkData): ChunkData {
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
    const compactNodesStr =
      Array.isArray(chunk.nodes) && chunk.nodes.length > 0
        ? WorldManager.encodeCompactNodes(chunk.nodes, chunk.cx, chunk.cy)
        : typeof chunk.compactNodes === 'string'
        ? chunk.compactNodes
        : '';

    const compactExplored = chunk.isUnderground
      ? Array.isArray(chunk.explored) && chunk.explored.some((v) => v > 0)
        ? WorldManager.encodeCompactExplored(chunk.explored)
        : chunk.compactExplored
      : undefined;

    return {
      cx: chunk.cx,
      cy: chunk.cy,
      ...(chunk.isUnderground ? { isUnderground: true } : {}),
      ...(chunk.landmarkName ? { landmarkName: chunk.landmarkName } : {}),
      ...(chunk.villageId ? { villageId: chunk.villageId } : {}),
      ...(chunk.mobsPopulated ? { mobsPopulated: true } : {}),
      ...(chunk.villagePopulatedV2 ? { villagePopulatedV2: true } : {}),
      ...(chunk.islandMobsPopulated ? { islandMobsPopulated: true } : {}),
      genVersion:
        typeof chunk.genVersion === 'number'
          ? chunk.genVersion
          : CURRENT_WORLD_GEN_VERSION,
      generatedGameVersion: chunk.generatedGameVersion || GAME_VERSION,
      preserved: true,
      dirtyRev: chunk.dirtyRev || 1,
      ...(compactTiles ? { compactTiles } : {}),
      ...(compactZones ? { compactZones } : {}),
      ...(compactVariants ? { compactVariants } : {}),
      ...(compactExplored ? { compactExplored } : {}),
      ...(typeof compactNodesStr === 'string'
        ? { compactNodes: compactNodesStr }
        : {}),
      tiles: [] as unknown as BiomeType[],
      tileVariants: [],
      explored: [],
      nodes: [],
      structures: Array.isArray(chunk.structures) ? chunk.structures : [],
      ...(Array.isArray(chunk.puddles) && chunk.puddles.length > 0
        ? { puddles: chunk.puddles }
        : {}),
    };
  }

  public static compactSaveDataForStorage(
    saveData: WorldSaveData,
    strictNodePrune = false,
    maxFullNodeRadius = 18,
    pruneDistantWildCreatures = false
  ): WorldSaveData {
    const compactChunks: Record<string, ChunkData> = {};
    const playerX = saveData.player?.x || 0;
    const playerY = saveData.player?.y || 0;
    const playerChunkX = Math.floor(playerX / (32 * 16));
    const playerChunkY = Math.floor(playerY / (32 * 16));
    const worldId = saveData.metadata?.id || '';
    let worldCache =
      !strictNodePrune && worldId
        ? this.compactChunkCache.get(worldId)
        : undefined;
    if (!strictNodePrune && worldId && !worldCache) {
      worldCache = new Map<string, { rev: number; compact: ChunkData }>();
      this.compactChunkCache.set(worldId, worldCache);
    }

    if (saveData.chunks && typeof saveData.chunks === 'object') {
      for (const [key, chunk] of Object.entries(saveData.chunks)) {
        if (!chunk) continue;

        const chunkRev = chunk.dirtyRev || 0;
        if (!strictNodePrune && worldCache && chunkRev > 0) {
          const cachedEntry = worldCache.get(key);
          if (cachedEntry && cachedEntry.rev === chunkRev) {
            compactChunks[key] = cachedEntry.compact;
            continue;
          }
        }

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
              Boolean(s.placedAt) ||
              Boolean(s.cropType) ||
              s.type === PlaceableType.TILLED_SOIL ||
              s.type === PlaceableType.CHEST ||
              s.type === PlaceableType.CAMPFIRE ||
              s.type === PlaceableType.FURNACE ||
              s.type === PlaceableType.WEAVING_TABLE ||
              (Array.isArray(s.storageSlots) && s.storageSlots.some(Boolean)) ||
              (Array.isArray(s.stallSlots) && s.stallSlots.some(Boolean)) ||
              (typeof s.storageRevision === 'number' && s.storageRevision > 0) ||
              (typeof s.thermalRevision === 'number' && s.thermalRevision > 0)
          );

        if (!hasExplored && !hasPlayerOrCustomStruct) {
          if (worldCache) {
            worldCache.delete(key);
          }
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

        let compactNodesStr: string | undefined;
        if (Array.isArray(chunk.nodes) && chunk.nodes.length > 0) {
          const filteredNodes = skipUndamagedCommonNodes
            ? chunk.nodes.filter(
                (n) =>
                  typeof n.hp === 'number' &&
                  typeof n.maxHp === 'number' &&
                  n.hp < n.maxHp
              )
            : chunk.nodes;
          compactNodesStr = WorldManager.encodeCompactNodes(
            filteredNodes,
            chunk.cx,
            chunk.cy
          );
        } else if (
          (!Array.isArray(chunk.nodes) || chunk.nodes.length === 0) &&
          typeof chunk.compactNodes === 'string'
        ) {
          if (skipUndamagedCommonNodes) {
            const decoded =
              WorldManager.decodeCompactNodes(
                chunk.compactNodes,
                chunk.cx,
                chunk.cy
              ) || [];
            const filtered = decoded.filter(
              (n) =>
                typeof n.hp === 'number' &&
                typeof n.maxHp === 'number' &&
                n.hp < n.maxHp
            );
            compactNodesStr = WorldManager.encodeCompactNodes(
              filtered,
              chunk.cx,
              chunk.cy
            );
          } else {
            compactNodesStr = chunk.compactNodes;
          }
        } else {
          compactNodesStr = '';
        }

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

        const compactedChunk: ChunkData = {
          cx: chunk.cx,
          cy: chunk.cy,
          ...(chunk.landmarkName ? { landmarkName: chunk.landmarkName } : {}),
          ...(chunk.villageId ? { villageId: chunk.villageId } : {}),
          ...(chunk.mobsPopulated ? { mobsPopulated: true } : {}),
          ...(chunk.villagePopulatedV2 ? { villagePopulatedV2: true } : {}),
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
          dirtyRev: chunkRev || 1,
          ...(compactTiles ? { compactTiles } : {}),
          ...(compactZones ? { compactZones } : {}),
          ...(compactVariants ? { compactVariants } : {}),
          ...(compactExplored ? { compactExplored } : {}),
          ...(typeof compactNodesStr === 'string'
            ? { compactNodes: compactNodesStr }
            : {}),
          tiles: [] as unknown as BiomeType[],
          tileVariants: [],
          explored: allExplored ? [1] : [],
          nodes: [],
          structures: Array.isArray(chunk.structures)
            ? JSON.parse(JSON.stringify(chunk.structures))
            : [],
          ...(Array.isArray(chunk.puddles) && chunk.puddles.length > 0
            ? { puddles: JSON.parse(JSON.stringify(chunk.puddles)) }
            : {}),
        };

        compactChunks[key] = compactedChunk;
        if (!strictNodePrune && worldCache) {
          if (!chunk.dirtyRev) {
            chunk.dirtyRev = 1;
          }
          worldCache.set(key, {
            rev: chunk.dirtyRev,
            compact: compactedChunk,
          });
        }
      }
    }

    const rawCreatures = Array.isArray(saveData.creatures)
      ? saveData.creatures
      : [];
    const compactCreatures = rawCreatures
      .filter((cr) => {
        if (!cr) return false;
        if (!pruneDistantWildCreatures) return true;
        if (
          cr.tamed ||
          cr.hasSaddle ||
          cr.ownerId ||
          cr.kind === CreatureKind.VILLAGER ||
          cr.kind === CreatureKind.WANDERER ||
          cr.kind === CreatureKind.BOAT ||
          cr.kind === CreatureKind.HORSE ||
          cr.kind === CreatureKind.CAMEL ||
          cr.isInsideHouse ||
          cr.homeHouseId ||
          cr.villageId
        ) {
          return true;
        }
        return Math.hypot((cr.x || 0) - playerX, (cr.y || 0) - playerY) <= 1800;
      })
      .map((cr) => ({
        ...cr,
        x: Math.round((cr.x || 0) * 10) / 10,
        y: Math.round((cr.y || 0) * 10) / 10,
        vx: Math.round((cr.vx || 0) * 10) / 10,
        vy: Math.round((cr.vy || 0) * 10) / 10,
        aiTimer: Math.round((cr.aiTimer || 0) * 10) / 10,
        animTimer: 0,
        hitFlashTimer: 0,
        interactingPlayerId: undefined,
        interactingPlayerName: undefined,
      }));

    let compactUndergroundChunks: Record<string, ChunkData> | undefined;
    if (
      saveData.undergroundChunks &&
      typeof saveData.undergroundChunks === 'object'
    ) {
      compactUndergroundChunks = {};
      for (const [key, uChunk] of Object.entries(saveData.undergroundChunks)) {
        if (!uChunk) continue;
        const hasExploredArray =
          Array.isArray(uChunk.explored) && uChunk.explored.some((v) => v > 0);
        const hasCompactExplored =
          typeof uChunk.compactExplored === 'string' &&
          uChunk.compactExplored.length > 0 &&
          !/^0+$/.test(uChunk.compactExplored);
        const hasStairsOrPlayerStruct =
          Array.isArray(uChunk.structures) &&
          uChunk.structures.some(
            (s) =>
              s.type === PlaceableType.LEVEL_STAIRS ||
              Boolean(s.placedAt) ||
              s.ownerType === 'PLAYER'
          );
        if (!hasExploredArray && !hasCompactExplored && !hasStairsOrPlayerStruct) {
          continue;
        }
        const compactExplored = hasExploredArray
          ? WorldManager.encodeCompactExplored(uChunk.explored)
          : uChunk.compactExplored;
        const compactNodesStr =
          Array.isArray(uChunk.nodes) && uChunk.nodes.length > 0
            ? WorldManager.encodeCompactNodes(uChunk.nodes, uChunk.cx, uChunk.cy)
            : typeof uChunk.compactNodes === 'string'
            ? uChunk.compactNodes
            : '';
        compactUndergroundChunks[key] = {
          cx: uChunk.cx,
          cy: uChunk.cy,
          isUnderground: true,
          ...(uChunk.mobsPopulated ? { mobsPopulated: true } : {}),
          genVersion: uChunk.genVersion || CURRENT_WORLD_GEN_VERSION,
          generatedGameVersion: uChunk.generatedGameVersion || GAME_VERSION,
          preserved: true,
          dirtyRev: uChunk.dirtyRev || 1,
          ...(compactExplored ? { compactExplored } : {}),
          ...(typeof compactNodesStr === 'string'
            ? { compactNodes: compactNodesStr }
            : {}),
          tiles: [] as unknown as BiomeType[],
          tileVariants: [],
          explored: [],
          nodes: [],
          structures: Array.isArray(uChunk.structures)
            ? JSON.parse(JSON.stringify(uChunk.structures))
            : [],
        };
      }
      if (Object.keys(compactUndergroundChunks).length === 0) {
        compactUndergroundChunks = undefined;
      }
    }

    return {
      ...saveData,
      metadata: { ...saveData.metadata },
      player: JSON.parse(JSON.stringify(saveData.player)),
      guestPlayers: saveData.guestPlayers
        ? JSON.parse(JSON.stringify(saveData.guestPlayers))
        : undefined,
      chunks: compactChunks,
      undergroundChunks: compactUndergroundChunks,
      creatures: JSON.parse(JSON.stringify(compactCreatures)),
      droppedItems: Array.isArray(saveData.droppedItems)
        ? JSON.parse(JSON.stringify(saveData.droppedItems))
        : [],
      waypoints: Array.isArray(saveData.waypoints)
        ? JSON.parse(JSON.stringify(saveData.waypoints))
        : [],
      deathBags: Array.isArray(saveData.deathBags)
        ? JSON.parse(JSON.stringify(saveData.deathBags))
        : [],
    };
  }

  /**
   * Frees up `localStorage` space by removing legacy `*_bak` keys and compacting any older
   * uncompacted world saves already stored in the browser without deleting explored chunks.
   */
  private static reclaimLocalStorageSpace(
    excludeWorldId?: string,
    evictOldestOtherWorldIfNecessary = false
  ): void {
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

      const otherWorldsByAge: { key: string; savedAt: number }[] = [];

      for (const k of worldKeysToCompact) {
        try {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          const env = JSON.parse(raw) as SaveEnvelope;
          if (env && env.data && env.data.chunks) {
            otherWorldsByAge.push({
              key: k,
              savedAt: env.savedAt || env.data.metadata?.updatedAt || 0,
            });
            // Ensure other world is backed up in memory & IndexedDB before compacting
            if (env.data.metadata?.id && !this.memoryWorlds.has(env.data.metadata.id)) {
              this.memoryWorlds.set(env.data.metadata.id, env.data);
              void this.writeWorldToIdb(env.data);
            }
            if (raw.length >= 60000) {
              const compacted = this.compactSaveDataForStorage(
                env.data,
                true,
                12,
                true
              );
              const serialized = JSON.stringify(compacted);
              const newEnv: SaveEnvelope = {
                checksum: computeChecksum(serialized),
                savedAt: env.savedAt || Date.now(),
                data: compacted,
              };
              localStorage.setItem(k, JSON.stringify(newEnv));
            }
          }
        } catch {
          // ignore individual world compaction errors
        }
      }

      if (evictOldestOtherWorldIfNecessary && otherWorldsByAge.length > 0) {
        otherWorldsByAge.sort((a, b) => a.savedAt - b.savedAt);
        const oldest = otherWorldsByAge[0];
        if (oldest) {
          localStorage.removeItem(oldest.key);
        }
      }
    } catch {
      // ignore storage iteration errors
    }
  }

  public static saveWorldLocal(saveData: WorldSaveData): boolean {
    if (!saveData || !saveData.metadata || !saveData.metadata.id) {
      return false;
    }

    const now = Date.now();
    saveData.version = CURRENT_SAVE_VERSION;
    saveData.metadata.updatedAt = now;
    if (saveData.player) {
      saveData.player.savedAt = now;
    }

    // 1. Authoritative compact snapshot (preserves 100% of explored chunks, nodes, structures, inventory, chests)
    const fullCompactData = this.compactSaveDataForStorage(
      saveData,
      false,
      18,
      false
    );

    // 2. IMMEDIATELY commit to in-memory cache and IndexedDB so progress is NEVER lost even if localStorage is full!
    this.memoryWorlds.set(saveData.metadata.id, fullCompactData);
    this.memoryWorldIndex.set(saveData.metadata.id, {
      ...fullCompactData.metadata,
    });
    void this.writeWorldToIdb(fullCompactData);

    const list = this.listWorlds().filter((w) => w.id !== saveData.metadata.id);
    list.unshift({ ...fullCompactData.metadata });
    this.saveWorldIndex(list);

    // 3. Persist to localStorage with multi-stage compaction fallbacks
    const primaryKey = `${WORLD_PREFIX}${saveData.metadata.id}`;
    const backupKey = `${WORLD_PREFIX}${saveData.metadata.id}_bak`;
    let previousPrimaryRaw: string | null = null;
    try {
      previousPrimaryRaw = localStorage.getItem(primaryKey);
    } catch {
      previousPrimaryRaw = null;
    }

    try {
      try {
        localStorage.removeItem(backupKey);
      } catch {
        // ignore
      }

      const writeEnvelope = (dataToWrite: WorldSaveData) => {
        const ser = JSON.stringify(dataToWrite);
        const env: SaveEnvelope = {
          checksum: computeChecksum(ser),
          savedAt: now,
          data: dataToWrite,
        };
        localStorage.setItem(primaryKey, JSON.stringify(env));
      };

      try {
        writeEnvelope(fullCompactData);
      } catch {
        // Free primaryKey temporarily so browser quota check doesn't count old + new simultaneously
        try {
          localStorage.removeItem(primaryKey);
        } catch {
          // ignore
        }
        this.reclaimLocalStorageSpace(saveData.metadata.id, false);
        try {
          writeEnvelope(fullCompactData);
        } catch {
          try {
            // Fallback 1: Compact distant undamaged nodes (> 16 chunks away)
            const fb1 = this.compactSaveDataForStorage(saveData, true, 16, false);
            writeEnvelope(fb1);
          } catch {
            try {
              // Fallback 2: Compact distant undamaged nodes (> 6 chunks away) + distant wild creatures
              const fb2 = this.compactSaveDataForStorage(saveData, true, 6, true);
              writeEnvelope(fb2);
            } catch {
              // Fallback 3: Reclaim space from oldest other world in localStorage (already backed up in IDB & memory) + ultra compact
              this.reclaimLocalStorageSpace(saveData.metadata.id, true);
              const fb3 = this.compactSaveDataForStorage(saveData, true, 2, true);
              writeEnvelope(fb3);
            }
          }
        }
      }
      return true;
    } catch (e) {
      if (previousPrimaryRaw && !localStorage.getItem(primaryKey)) {
        try {
          localStorage.setItem(primaryKey, previousPrimaryRaw);
        } catch {
          // ignore
        }
      }
      console.warn(
        'localStorage quota exceeded; latest world save is safely stored in IndexedDB and memory cache:',
        e
      );
      // Return true because the save IS safely committed in memoryWorlds and IndexedDB!
      return true;
    }
  }

  /**
   * Guaranteed asynchronous save used during periodic auto-saves and exit-to-menu:
   * commits synchronously to `memoryWorlds` + `localStorage` AND awaits `IndexedDB` disk completion.
   */
  public static async saveWorldGuaranteed(
    saveData: WorldSaveData
  ): Promise<boolean> {
    const okSync = this.saveWorldLocal(saveData);
    const cached = this.memoryWorlds.get(saveData.metadata.id) || saveData;
    const okIdb = await this.writeWorldToIdb(cached);
    return okSync || okIdb;
  }

  private static parseRawLocalWorld(worldId: string): WorldSaveData | null {
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
        return env.data;
      } catch {
        return null;
      }
    };

    const primary = tryParseEnvelope(localStorage.getItem(primaryKey));
    if (primary) return primary;

    const backup = tryParseEnvelope(localStorage.getItem(backupKey));
    if (backup) return backup;

    return null;
  }

  public static loadWorldLocal(worldId: string): WorldSaveData | null {
    const memWorld = this.memoryWorlds.get(worldId) || null;
    const localWorld = this.parseRawLocalWorld(worldId);

    const memTs = this.getSaveTimestamp(memWorld);
    const localTs = this.getSaveTimestamp(localWorld);

    const best =
      memWorld && memTs >= localTs
        ? JSON.parse(JSON.stringify(memWorld))
        : localWorld
        ? JSON.parse(JSON.stringify(localWorld))
        : null;

    if (!best) return null;
    this.compactChunkCache.delete(worldId);
    const migrated = migrateSaveData(best);
    if (!memWorld || localTs > memTs) {
      this.memoryWorlds.set(
        worldId,
        this.compactSaveDataForStorage(migrated, false)
      );
    }
    return migrated;
  }

  /**
   * Loads the newest version of a world across In-Memory Cache, IndexedDB, and localStorage.
   * Ensures that even if a long session exceeded localStorage's 5MB limit, re-entering the world
   * or downloading the `.wildborn.json` file ALWAYS gets the exact latest progress.
   */
  public static async loadWorldGuaranteed(
    worldId: string
  ): Promise<WorldSaveData | null> {
    const memWorld = this.memoryWorlds.get(worldId) || null;
    const localWorld = this.parseRawLocalWorld(worldId);
    const idbWorld = await this.readWorldFromIdb(worldId);

    const candidates = [memWorld, idbWorld, localWorld].filter(
      (c): c is WorldSaveData => Boolean(c && c.metadata)
    );
    if (candidates.length === 0) return null;

    candidates.sort(
      (a, b) => this.getSaveTimestamp(b) - this.getSaveTimestamp(a)
    );
    const newest = JSON.parse(JSON.stringify(candidates[0])) as WorldSaveData;
    this.compactChunkCache.delete(worldId);
    const migrated = migrateSaveData(newest);
    this.memoryWorlds.set(
      worldId,
      this.compactSaveDataForStorage(migrated, false)
    );
    this.memoryWorldIndex.set(worldId, { ...migrated.metadata });
    return migrated;
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
    this.memoryWorlds.delete(worldId);
    this.memoryWorldIndex.delete(worldId);
    this.compactChunkCache.delete(worldId);
    void this.deleteWorldFromIdb(worldId);
    try {
      localStorage.removeItem(`${WORLD_PREFIX}${worldId}`);
      localStorage.removeItem(`${WORLD_PREFIX}${worldId}_bak`);
    } catch {
      // ignore
    }
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
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);
    try {
      const compactPayload =
        this.memoryWorlds.get(saveData.metadata.id) ||
        this.compactSaveDataForStorage(saveData, false);
      const checksum = computeChecksum(JSON.stringify(compactPayload));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ world: compactPayload, checksum }),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      if (!res.ok) {
        return { ok: false, message: `Erro HTTP ${res.status}` };
      }
      return { ok: true, message: 'Salvo no servidor com sucesso.' };
    } catch {
      window.clearTimeout(timeoutId);
      return {
        ok: false,
        message: 'Servidor offline (salvo localmente com segurança).',
      };
    }
  }

  public static async fetchWorldsFromServer(
    settings?: GameSettings
  ): Promise<WorldMetadata[]> {
    await this.hydrateFromIndexedDB();
    const cfg = settings || this.loadSettings();
    if (!cfg.serverSyncEnabled) return this.listWorlds();
    const base = cfg.customServerUrl.trim().replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/api/worlds`);
      if (!res.ok) return this.listWorlds();
      const json = await res.json();
      if (Array.isArray(json.worlds)) {
        const localById = new Map(this.listWorlds().map((w) => [w.id, w]));
        for (const entry of json.worlds as any[]) {
          if (entry && entry.metadata && entry.metadata.id) {
            const localMeta = localById.get(entry.metadata.id);
            if (
              !localMeta ||
              (entry.metadata.updatedAt || 0) > (localMeta.updatedAt || 0)
            ) {
              await this.saveWorldGuaranteed(migrateSaveData(entry));
            }
          } else if (entry && entry.id && entry.name && typeof entry.seed === 'number') {
            // Metadata entry from GET /api/worlds: fetch full world if newer than local
            const localMeta = localById.get(entry.id);
            if (
              !localMeta ||
              (entry.updatedAt || 0) > (localMeta.updatedAt || 0)
            ) {
              try {
                const detailRes = await fetch(
                  `${base}/api/worlds/${encodeURIComponent(entry.id)}`
                );
                if (detailRes.ok) {
                  const detailJson = await detailRes.json();
                  if (detailJson?.world?.metadata) {
                    await this.saveWorldGuaranteed(
                      migrateSaveData(detailJson.world)
                    );
                  }
                }
              } catch {
                // ignore individual fetch error
              }
            }
          }
        }
      }
    } catch {
      // ignore offline
    }
    return this.listWorlds();
  }

  public static downloadWorldFile(saveData: WorldSaveData): void {
    const compactForExport = this.compactSaveDataForStorage(
      saveData,
      false,
      18,
      false
    );
    const serialized = JSON.stringify(compactForExport);
    const envelope: SaveEnvelope = {
      checksum: computeChecksum(serialized),
      savedAt: Date.now(),
      data: compactForExport,
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
