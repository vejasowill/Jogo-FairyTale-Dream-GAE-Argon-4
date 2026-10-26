export enum BiomeType {
  OCEAN = 'OCEAN',
  PLAINS = 'PLAINS',
  DESERT = 'DESERT',
}

export enum EcologicalZone {
  MEADOW_CLEARING = 'MEADOW_CLEARING',
  OVERGROWN_SHRUBLAND = 'OVERGROWN_SHRUBLAND',
  DENSE_WOODLAND = 'DENSE_WOODLAND',
  ANCIENT_GROVE = 'ANCIENT_GROVE',
  ROCKY_HIGHLANDS = 'ROCKY_HIGHLANDS',
  OPEN_SAND_DUNES = 'OPEN_SAND_DUNES',
  CACTUS_SCRUBLAND = 'CACTUS_SCRUBLAND',
  CRYSTAL_BADLANDS = 'CRYSTAL_BADLANDS',
  DESERT_OASIS = 'DESERT_OASIS',
  COASTAL_TROPICS = 'COASTAL_TROPICS',
  SHALLOW_REEF = 'SHALLOW_REEF',
  DEEP_OCEAN = 'DEEP_OCEAN',
}

export enum RarityTier {
  BASIC = 'BASIC',
  RARE = 'RARE',
  VERY_RARE = 'VERY_RARE',
}

export enum ItemCategory {
  RESOURCE = 'RESOURCE',
  TOOL = 'TOOL',
  WEAPON = 'WEAPON',
  CONSUMABLE = 'CONSUMABLE',
  PLACEABLE = 'PLACEABLE',
  ARMOR = 'ARMOR',
}

export enum ToolType {
  NONE = 'NONE',
  AXE = 'AXE',
  PICKAXE = 'PICKAXE',
  SWORD = 'SWORD',
  HOE = 'HOE',
  WATERING_CAN = 'WATERING_CAN',
  FISHING_ROD = 'FISHING_ROD',
}

export type Direction = 'down' | 'up' | 'left' | 'right';

export type EquipmentSlot = 'head' | 'body' | 'legs' | 'feet';

export type CropType = 'wheat' | 'carrot' | 'medic_herb' | 'solar_bloom' | 'berry';

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  purposeSummary?: string;
  category: ItemCategory;
  rarity: RarityTier;
  maxStack: number;
  toolType?: ToolType;
  toolTier?: number; // 1 = Basic (Wood/Stone), 2 = Iron/Rare, 3 = Astral/Primordial
  attackDamage?: number;
  attackRange?: number;
  harvestPower?: number;
  lifesteal?: number;
  knockbackMult?: number;
  hungerRestore?: number;
  hpRestore?: number;
  staminaRestore?: number;
  buffType?: 'strength' | 'speed';
  buffDuration?: number;
  permanentMaxHpBonus?: number;
  specialUse?: 'bomb' | 'recall' | 'peace_treaty';
  equipSlot?: EquipmentSlot;
  defenseBonus?: number;
  speedBonus?: number;
  maxHpBonus?: number;
  placeableType?: PlaceableType;
  seedCropType?: CropType;
  waterCharges?: number;
  maxWaterCharges?: number;
  basePrice?: number; // Official market reference price in Gold Coins (Moeda de Ouro Antiga)
}

export type BuildLayer = 'GROUND' | 'WALL' | 'FURNITURE';

export type BuildRole =
  | 'CHAO'
  | 'PAREDE'
  | 'PORTA'
  | 'JANELA'
  | 'CERCA'
  | 'PONTE'
  | 'ILUMINACAO'
  | 'ESTACAO'
  | 'MOBILIA'
  | 'DEFESA';

export type HitboxBehavior =
  | 'NONE'
  | 'SOLID_FULL'
  | 'SOLID_COMPACT'
  | 'DYNAMIC_DOOR';

export type ContinuityMode =
  | 'WALL_16'
  | 'FENCE_16'
  | 'DOOR_AUTO'
  | 'FLOOR_BORDER'
  | 'BRIDGE_AUTO'
  | 'STANDALONE';

export type ConnectionGroup =
  | 'wall'
  | 'fence'
  | 'wood_floor'
  | 'stone_floor'
  | 'brick_floor'
  | 'carpet'
  | 'bridge'
  | 'chest'
  | 'none';

export interface ConstructionBlueprint {
  type: PlaceableType;
  role: BuildRole;
  roleLabel: string;
  layer: BuildLayer;
  layerLabel: string;
  hasHitbox: boolean;
  hitboxBehavior: HitboxBehavior;
  hitboxLabel: string;
  hitboxRadius?: number; // px radius for SOLID_COMPACT
  continuityMode: ContinuityMode;
  continuityLabel: string;
  connectionGroup: ConnectionGroup;
  connectsToGroups: ConnectionGroup[];
  maxHp: number;
  lightRadius: number;
  speedMultiplier?: number;
  isInteractive?: boolean;
  materialKind?: MaterialKind;
  requiredTool?: ToolType;
  requiredTier?: number;
}

export enum NatureNodeType {
  // Basic
  OAK_TREE = 'OAK_TREE',
  BERRY_BUSH = 'BERRY_BUSH',
  BOULDER = 'BOULDER',
  CACTUS = 'CACTUS',
  PALM_TREE = 'PALM_TREE',
  // Rare
  IRON_OUTCROP = 'IRON_OUTCROP',
  HARDWOOD_TREE = 'HARDWOOD_TREE',
  DESERT_CRYSTAL = 'DESERT_CRYSTAL',
  // Very Rare
  SUNSTONE_OBELISK = 'SUNSTONE_OBELISK',
  PEARL_CLAM = 'PEARL_CLAM',
  ANCIENT_WORLD_TREE = 'ANCIENT_WORLD_TREE',
}

export enum PlaceableType {
  WORKBENCH = 'WORKBENCH',
  CAMPFIRE = 'CAMPFIRE',
  FURNACE = 'FURNACE',
  SOLAR_ALTAR = 'SOLAR_ALTAR',
  WOOD_WALL = 'WOOD_WALL',
  STONE_WALL = 'STONE_WALL',
  BRICK_WALL = 'BRICK_WALL',
  WOOD_WINDOW = 'WOOD_WINDOW',
  STONE_WINDOW = 'STONE_WINDOW',
  WOOD_DOOR = 'WOOD_DOOR',
  IRON_GATE = 'IRON_GATE',
  WOOD_FENCE = 'WOOD_FENCE',
  WOOD_FLOOR = 'WOOD_FLOOR',
  STONE_FLOOR = 'STONE_FLOOR',
  BRICK_FLOOR = 'BRICK_FLOOR',
  ROYAL_CARPET = 'ROYAL_CARPET',
  WOOD_BRIDGE = 'WOOD_BRIDGE',
  TORCH = 'TORCH',
  IRON_LANTERN = 'IRON_LANTERN',
  CHEST = 'CHEST',
  GUARDIAN_TOTEM = 'GUARDIAN_TOTEM',
  SPIKE_TRAP = 'SPIKE_TRAP',
  EXPLORER_TENT = 'EXPLORER_TENT',
  HEALING_FOUNTAIN = 'HEALING_FOUNTAIN',
  VILLAGE_HOUSE = 'VILLAGE_HOUSE',
  MARKET_STALL = 'MARKET_STALL',
  VILLAGE_WELL = 'VILLAGE_WELL',
  ROYAL_BANNER = 'ROYAL_BANNER',
  TILLED_SOIL = 'TILLED_SOIL',
}

export interface NatureNode {
  id: string;
  type: NatureNodeType;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  rarity: RarityTier;
  requiredTool: ToolType;
  requiredTier: number;
  hitFlashTimer: number;
  animOffset: number;
}

export interface PlacedStructure {
  id: string;
  type: PlaceableType;
  itemId: string;
  tileX: number;
  tileY: number;
  hp: number;
  maxHp: number;
  solid: boolean;
  isBridge?: boolean;
  isOpen?: boolean; // For WOOD_DOOR & IRON_GATE (true = open/no hitbox, false = closed/solid hitbox)
  orientation?: 'auto' | 'horizontal' | 'vertical';
  lightRadius?: number;
  hitFlashTimer: number;
  lootItems?: { itemId: string; count: number }[];
  storageSlots?: (InventorySlot | null)[]; // 24-slot persistent interactive storage for CHEST
  customName?: string;
  landmarkName?: string;
  villageId?: string;
  // Agriculture & Crop Progression
  cropType?: CropType;
  growthStage?: number; // 0 = Semente recém-plantada, 1 = Broto jovem, 2 = Planta desenvolvida, 3 = Madura/Colheita
  growthProgress?: number; // 0..1 progresso até o próximo estágio
  isWatered?: boolean; // Solo regado/irrigado
  waterLevel?: number; // Nível de umidade no solo 0..1
  fertilized?: boolean; // Adubado com adubo orgânico (crescimento acelerado)
  lastWateredDay?: number;
  // Market Stall Ownership, Merchandise & Customer Offers
  ownerType?: 'PLAYER' | 'VILLAGER';
  ownerId?: string;
  ownerName?: string;
  stallOpen?: boolean;
  stallSlots?: (MarketStallSlot | null)[]; // 8-slot merchandise display for MARKET_STALL
  pendingCustomerOffer?: MarketPurchaseOffer | null;
  stallSalesCount?: number;
  stallTotalGoldEarned?: number;
  stallUnclaimedGold?: number;
  // Thermal Station Processing (CAMPFIRE & FURNACE — Minecraft-inspired Fuel + Timed Prep)
  fuelItemId?: string | null;
  fuelCount?: number;
  fuelBurnRemaining?: number; // Seconds of active fire remaining from current fuel unit
  fuelBurnMax?: number; // Total burn seconds of the currently burning fuel unit
  cookingRecipeId?: string | null;
  cookingInputCount?: number; // Number of recipe batches queued in the input slot
  cookingProgress?: number; // Elapsed preparation seconds for current batch
  cookingDuration?: number; // Required preparation seconds per batch
  outputItemId?: string | null;
  outputCount?: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  tiles: BiomeType[]; // 16 x 16 = 256
  tileVariants: number[]; // visual sub-variant 0..3
  explored: number[]; // 256 flags (0 = unexplored, 1 = explored by player)
  nodes: NatureNode[];
  structures: PlacedStructure[];
  ecologicalZones?: EcologicalZone[]; // 16 x 16 = 256 (v2+ worldGen)
  landmarkName?: string;
  villageId?: string;
  mobsPopulated?: boolean;
  // Saved-World Chunk Preservation & Versioning (Explored chunks are frozen; only new unexplored chunks use newer worldGen)
  genVersion?: number; // World generator version used when this chunk was originally generated
  generatedGameVersion?: string; // Beta version string (e.g., '0.4.3-beta', '0.4.4-beta') when this chunk was generated
  preserved?: boolean; // True once explored or modified by the player — prevents future updates from altering this chunk
  compactTiles?: string; // 256-char compact encoding of tiles ('O' | 'P' | 'D') so exact terrain is preserved in localStorage
  compactZones?: string; // 256-char compact encoding of ecologicalZones ('0'..'B')
  compactVariants?: string; // 256-char compact encoding of tileVariants ('0'..'3')
}

export enum CreatureKind {
  // Animals (Domesticable & Mountable)
  SHEEP = 'SHEEP',
  BOAR = 'BOAR',
  CAMEL = 'CAMEL',
  HORSE = 'HORSE',
  // Water Mount / Vessel
  BOAT = 'BOAT',
  // Classic Enemies
  ZOMBIE = 'ZOMBIE',
  OGRE = 'OGRE',
  // Complex Biome Mobs & Raiders
  FOREST_STALKER = 'FOREST_STALKER',
  DESERT_SCORPION = 'DESERT_SCORPION',
  STONE_GOLEM = 'STONE_GOLEM',
  BANDIT = 'BANDIT',
  // Intelligent Village NPCs & Wanderers
  VILLAGER = 'VILLAGER',
  WANDERER = 'WANDERER',
}

export type CreatureFaction =
  | 'VILLAGER'
  | 'MONSTER'
  | 'WILDLIFE'
  | 'PLAYER_ALLY';

export type NpcRole = 'ferreiro' | 'mercador' | 'guardiao' | 'anciao' | 'andarilho';

export interface NpcTradeOffer {
  id: string;
  giveItemId: string;
  giveCount: number;
  receiveItemId: string;
  receiveCount: number;
  minAffinity: number; // e.g., 0, 35, 65, 80
  affinityGain: number;
  label?: string;
}

export interface CreatureEntity {
  id: string;
  kind: CreatureKind;
  name: string;
  isHostile: boolean;
  faction?: CreatureFaction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  hp: number;
  maxHp: number;
  attackDamage: number;
  moveSpeed: number;
  swimSpeed?: number;
  isSwimming?: boolean;
  // Mount, Saddle & Boat properties
  hasSaddle?: boolean;
  mountSpeed?: number; // Individual mount speed for Horse & Camel, or water speed for Boat
  mountStamina?: number; // Current gallop stamina for Horse (max 100) & Camel (max 165)
  mountMaxStamina?: number;
  mountInventory?: (InventorySlot | null)[]; // 8-slot saddlebag inventory when equipped with a saddle
  riderPlayerId?: string | null; // Primary driver/rider ID ('LOCAL' or peerId)
  passengerPlayerId?: string | null; // 2nd seat player ID on a Boat ('LOCAL' or peerId)
  passengerPetId?: string | null; // 2nd seat following pet ID on a Boat
  ownerId?: string | null; // Persistent owner player ID for tamed pets/mounts (Horse, Camel, Sheep, Boar)
  ownerName?: string | null; // Display name of the unique player who tamed/owns this pet/mount
  // Animation states
  animFrame: number;
  animTimer: number;
  attackTimer: number;
  attackCooldown: number;
  hitFlashTimer: number;
  // AI & Taming
  aiState: 'idle' | 'wander' | 'chase' | 'follow' | 'stay' | 'graze' | 'flee';
  aiTimer: number;
  targetX: number;
  targetY: number;
  tamed: boolean;
  tameProgress: number; // 0 to 100
  favoriteFoodIds: string[];
  produceTimer: number;
  isElite?: boolean;
  homeX?: number;
  homeY?: number;
  homeHouseId?: string;
  isInsideHouse?: boolean;
  outsideNightTimer?: number;
  wanderAngle?: number;
  navWaypointX?: number;
  navWaypointY?: number;
  navRecalcTimer?: number;
  orbitSign?: number;
  retaliateTargetId?: string;
  combatTargetId?: string | null;
  specialCooldown?: number;
  // Village NPC Affinity, Role & Trading
  npcRole?: NpcRole;
  npcProfessionLabel?: string;
  affinity?: number; // 0 to 100 (55 default, <20 or provoked = hostile enemy!)
  provokedTimer?: number;
  villageId?: string;
  trades?: NpcTradeOffer[];
  dialogueLine?: string;
  // Market Stall Shopping Behavior (1 purchase per day, reset upon sleeping in house)
  hasBoughtToday?: boolean;
  attractedStallId?: string;
  stallInspectCooldown?: number;
  stallInspectionsToday?: Record<string, number>;
  // Hostility Forgiveness Debt (in Gold Coins) demanded when player holds the Peace Item
  peaceDebtCoins?: number;
}

export interface DroppedItem {
  id: string;
  itemId: string;
  count: number;
  x: number;
  y: number;
  bobTimer: number;
  pickupDelay: number;
  claimedBy?: string | null;
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  timer: number;
  maxTimer: number;
}

export const HOTBAR_SIZE = 8;
export const BACKPACK_SIZE = 24;
export const TOTAL_INVENTORY_SIZE = HOTBAR_SIZE + BACKPACK_SIZE; // 32 slots (8 hotbar + 3x8 backpack)
export const CHEST_STORAGE_SIZE = 24; // 24 slots (3x8 chest storage grid)
export const MARKET_STALL_SIZE = 8; // 8 display slots on a Market Stall counter
export const MOUNT_STORAGE_SIZE = 8; // 8 slots in a saddled Horse or Camel saddlebag

export interface InventorySlot {
  itemId: string;
  count: number;
}

export interface MarketStallSlot {
  itemId: string;
  count: number;
  unitPrice: number; // Price in Gold Coins per 1 unit
  enabled: boolean; // Whether listed for active sale
}

export interface MarketPurchaseOffer {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerKind: CreatureKind;
  buyerProfession?: string;
  slotIndex: number;
  itemId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  baseUnitPrice: number;
  expiresTimer: number;
}

export type MaterialKind =
  | 'FIBER_FOLIAGE'
  | 'SOFT_WOOD'
  | 'ROUGH_STONE'
  | 'HARDWOOD'
  | 'IRON_MINERAL'
  | 'PRIMORDIAL_WOOD'
  | 'ASTRAL_MINERAL';

export interface DeathBag {
  id: string;
  ownerId?: string | null;
  ownerName: string;
  x: number;
  y: number;
  items: InventorySlot[];
  goldCoins: number;
  createdAt: number;
  expiresTimer: number; // Countdown in seconds (600s = 10 minutes)
  maxTimer: number; // 600
  claimedBy?: string | null;
}

export interface MapWaypoint {
  id: string;
  label: string;
  tileX: number;
  tileY: number;
  color: string;
  isDeathBag?: boolean;
  expiresTimer?: number;
}

export interface PlayerAttributes {
  vitality: number; // +18 Max HP per point
  strength: number; // +12% Melee & Harvest Damage per point
  agility: number; // +6% Move & Attack Speed per point
  survival: number; // -8% Hunger drain & +10% resource bonus chance per point
}

export type PlayerEquipment = Record<EquipmentSlot, string | null>;

export type HairStyleId = 'adventurer' | 'warrior_crest' | 'long_mane' | 'braided';

export interface PlayerAppearance {
  skinColor: string;
  hairColor: string;
  hairStyle: HairStyleId;
  eyeColor: string;
  shirtColor: string;
  pantsColor: string;
}

export interface FishingState {
  active: boolean;
  bobberX: number;
  bobberY: number;
  phase: 'waiting' | 'biting';
  timer: number;
  biteWindowTimer: number;
  rippleTimer: number;
}

export interface PlayerState {
  persistentPlayerId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  direction: Direction;
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  xpToNext: number;
  attributePoints: number;
  attributes: PlayerAttributes;
  goldCoins: number;
  inventory: (InventorySlot | null)[]; // 32 slots (0..7 hotbar, 8..31 backpack)
  selectedHotbarIndex: number;
  equippedArmorId: string | null; // Legacy chest/primary armor ID synced for backward compatibility
  equippedBySlot: PlayerEquipment; // 4-slot equipment: head, body, legs, feet
  appearance: PlayerAppearance; // Custom visual appearance (skin, hair, base clothes)
  strengthBuffTimer?: number;
  speedBuffTimer?: number;
  fishingState?: FishingState | null;
  mountedEntityId?: string | null;
  mountedCreatureData?: CreatureEntity | null;
  isGalloping?: boolean;
  // Respawn point defined by the last rest point interacted with or used
  respawnX?: number;
  respawnY?: number;
  respawnLabel?: string;
  // Animation state
  isMoving: boolean;
  isSwimming?: boolean;
  swimSpeed?: number;
  animFrame: number;
  animTimer: number;
  swingTimer: number;
  swingDuration: number;
  hitFlashTimer: number;
}

export interface RemotePlayerState {
  peerId: string;
  persistentPlayerId?: string;
  name: string;
  isHost: boolean;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  direction: Direction;
  hp: number;
  maxHp: number;
  level: number;
  isMoving: boolean;
  isSwimming?: boolean;
  mountedEntityId?: string | null;
  mountedCreatureData?: CreatureEntity | null;
  isGalloping?: boolean;
  animFrame: number;
  animTimer: number;
  swingTimer: number;
  swingDuration: number;
  hitFlashTimer: number;
  heldItemId: string | null;
  equippedArmorId: string | null;
  equippedBySlot: PlayerEquipment;
  appearance: PlayerAppearance;
  chatMessage?: string;
  chatTimer?: number;
}

export interface OnlinePeerSummary {
  peerId: string;
  name: string;
  isHost: boolean;
  level?: number;
}

export interface OnlineActivationStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  detail?: string;
}

// REGRA PERMANENTE: A cada nova atualização do jogo, incremente a versão para o número seguinte da beta (ex: 0.4.4-beta -> 0.4.5-beta).
export const GAME_VERSION = '0.4.8-beta';
export const CURRENT_WORLD_GEN_VERSION = 3;

export interface OnlineSessionInfo {
  isOnline: boolean;
  role: 'HOST' | 'GUEST' | 'OFFLINE';
  inviteCode: string | null;
  worldName: string;
  hostName: string;
  localPlayerName: string;
  connectedPeers: OnlinePeerSummary[];
  gameVersion?: string;
  statusMessage?: string | null;
  activationState?: 'IDLE' | 'ACTIVATING' | 'ACTIVE' | 'ERROR';
  activationSteps?: OnlineActivationStep[];
  transportMode?: 'WEBSOCKET' | 'HTTP_SYNC' | 'P2P_WEBRTC' | 'NONE';
  syncStatus?: 'SYNCED' | 'RESYNCING' | 'DEGRADED';
  worldRevision?: number;
  lastError?: string | null;
}

export interface WorldMetadata {
  id: string;
  name: string;
  seed: number;
  seedText: string;
  difficulty: 'normal' | 'survival' | 'hardcore';
  createdAt: number;
  updatedAt: number;
  dayCount: number;
  timeOfDay: number; // 0 to 24 (e.g. 8.0 = 08:00)
  playerLevel: number;
  exploredChunksCount: number;
  worldGenVersion?: number; // Active generator version for newly explored chunks
  createdWorldGenVersion?: number; // Original generator version when the world save was created
  gameVersion?: string; // Current beta version last saved
  createdGameVersion?: string; // Original beta version when the world save was created
}

export interface WorldSaveData {
  version: number;
  metadata: WorldMetadata;
  player: PlayerState;
  chunks: Record<string, ChunkData>;
  creatures: CreatureEntity[];
  droppedItems: DroppedItem[];
  waypoints?: MapWaypoint[];
  deathBags?: DeathBag[];
}

export interface HudElementPlacement {
  offsetX: number; // px offset from default ergonomic anchor
  offsetY: number; // px offset from default ergonomic anchor
  scale: number; // individual control size multiplier (0.6 to 1.6)
}

export type HudElementKey =
  | 'joystick'
  | 'attackBtn'
  | 'interactBtn'
  | 'placeBtn'
  | 'mountBtn'
  | 'hotbar'
  | 'statusPlaque'
  | 'topMenu';

export type HudControlLayout = Record<HudElementKey, HudElementPlacement>;

export interface GameSettings {
  playerName?: string;
  soundEnabled: boolean;
  soundVolume: number;
  autoSaveIntervalSec: number;
  serverSyncEnabled: boolean;
  customServerUrl: string;
  showTouchControls: boolean;
  cameraZoom: number;
  hudScale: number; // Global HUD size multiplier (0.7 to 1.35)
  hudOpacity: number; // Global HUD opacity (0.45 to 1.0)
  controlLayout: HudControlLayout;
}

