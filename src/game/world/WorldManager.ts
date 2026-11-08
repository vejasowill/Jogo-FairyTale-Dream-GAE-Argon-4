import {
  CONSTRUCTION_BLUEPRINTS,
  getItemBasePrice,
  NATURE_BLUEPRINTS,
} from '../core/ItemRegistry';
import {
  BiomeType,
  CHEST_STORAGE_SIZE,
  ChunkData,
  ClothingColorId,
  CURRENT_WORLD_GEN_VERSION,
  EcologicalZone,
  GAME_VERSION,
  InventorySlot,
  MARKET_STALL_SIZE,
  MarketStallSlot,
  NatureNode,
  NatureNodeType,
  NpcRole,
  PlaceableType,
  PlacedStructure,
  RainPuddle,
} from '../core/types';

export const TILE_SIZE = 32;
export const CHUNK_SIZE = 16;
export const CHUNK_WORLD_SIZE = TILE_SIZE * CHUNK_SIZE;

const TULIP_FLOWER_COLORS: ClothingColorId[] = [
  'branco',
  'vermelho',
  'laranja',
  'amarelo',
  'azul',
  'roxo',
  'magenta',
  'rosa',
];

const LILY_FLOWER_COLORS: ClothingColorId[] = [
  'branco',
  'vermelho',
  'laranja',
  'amarelo',
  'roxo',
  'rosa',
];

const COMPACT_ZONE_LIST: EcologicalZone[] = [
  EcologicalZone.MEADOW_CLEARING,
  EcologicalZone.OVERGROWN_SHRUBLAND,
  EcologicalZone.DENSE_WOODLAND,
  EcologicalZone.ANCIENT_GROVE,
  EcologicalZone.ROCKY_HIGHLANDS,
  EcologicalZone.OPEN_SAND_DUNES,
  EcologicalZone.CACTUS_SCRUBLAND,
  EcologicalZone.CRYSTAL_BADLANDS,
  EcologicalZone.DESERT_OASIS,
  EcologicalZone.COASTAL_TROPICS,
  EcologicalZone.SHALLOW_REEF,
  EcologicalZone.DEEP_OCEAN,
];

const COMPACT_NODE_TYPE_LIST: NatureNodeType[] = [
  NatureNodeType.OAK_TREE,
  NatureNodeType.BERRY_BUSH,
  NatureNodeType.SAND_DUNE,
  NatureNodeType.BOULDER,
  NatureNodeType.CACTUS,
  NatureNodeType.PALM_TREE,
  NatureNodeType.IRON_OUTCROP,
  NatureNodeType.HARDWOOD_TREE,
  NatureNodeType.DESERT_CRYSTAL,
  NatureNodeType.SUNSTONE_OBELISK,
  NatureNodeType.PEARL_CLAM,
  NatureNodeType.ANCIENT_WORLD_TREE,
  NatureNodeType.TEMPERATE_TREE,
  NatureNodeType.PINE_TREE,
  NatureNodeType.SHORT_GRASS,
  NatureNodeType.TALL_GRASS,
  NatureNodeType.FLOWER_TULIP,
  NatureNodeType.FLOWER_LILY,
  NatureNodeType.FLOWER_SUNFLOWER,
  NatureNodeType.FLOWER_SOLAR_DROP,
  NatureNodeType.UNDERGROUND_DIRT,
  NatureNodeType.UNDERGROUND_COAL,
  NatureNodeType.UNDERGROUND_IRON,
];

const COMPACT_FLOWER_COLOR_LIST: ClothingColorId[] = [
  'preto',
  'cinza',
  'cinza_claro',
  'branco',
  'vermelho',
  'laranja',
  'amarelo',
  'bege',
  'verde_lima',
  'verde',
  'ciano',
  'azul_claro',
  'azul',
  'roxo',
  'magenta',
  'rosa',
  'marrom',
];

function hash2D(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const PERLIN_GRADIENTS_2D: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.70710678, 0.70710678],
  [-0.70710678, 0.70710678],
  [0.70710678, -0.70710678],
  [-0.70710678, -0.70710678],
];

/**
 * True 2D Gradient Perlin Noise in range [-1, 1] using quintic fade curve.
 * Used to generate organic flowerbeds (peaks = one species, valleys = another, zero-crossings = open grass)
 * and smooth low-frequency color dominance waves across flower patches.
 */
function perlin2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = x - x0;
  const sy = y - y0;

  // Quintic Perlin fade: 6t^5 - 15t^4 + 10t^3
  const u = sx * sx * sx * (sx * (sx * 6 - 15) + 10);
  const v = sy * sy * sy * (sy * (sy * 6 - 15) + 10);

  const gradDot = (gx: number, gy: number, dx: number, dy: number): number => {
    const h = Math.floor(hash2D(gx, gy, seed) * 8) & 7;
    const g = PERLIN_GRADIENTS_2D[h];
    return g[0] * dx + g[1] * dy;
  };

  const n00 = gradDot(x0, y0, sx, sy);
  const n10 = gradDot(x1, y0, sx - 1, sy);
  const n01 = gradDot(x0, y1, sx, sy - 1);
  const n11 = gradDot(x1, y1, sx - 1, sy - 1);

  const ix0 = n00 + u * (n10 - n00);
  const ix1 = n01 + u * (n11 - n01);
  return Math.max(-1, Math.min(1, (ix0 + v * (ix1 - ix0)) * 1.4142));
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy, seed);
  const b = hash2D(ix + 1, iy, seed);
  const c = hash2D(ix, iy + 1, seed);
  const d = hash2D(ix + 1, iy + 1, seed);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq, seed + i * 97);
    freq *= 2.05;
    amp *= 0.45;
  }
  return value;
}


export const ECOLOGICAL_ZONE_LABELS: Record<EcologicalZone, string> = {
  [EcologicalZone.MEADOW_CLEARING]: 'Clareira dos Campos',
  [EcologicalZone.OVERGROWN_SHRUBLAND]: 'Matagal Silvestre',
  [EcologicalZone.DENSE_WOODLAND]: 'Floresta Fechada',
  [EcologicalZone.ANCIENT_GROVE]: 'Bosque Primordial',
  [EcologicalZone.ROCKY_HIGHLANDS]: 'Colinas Rochosas',
  [EcologicalZone.OPEN_SAND_DUNES]: 'Dunas Abertas',
  [EcologicalZone.CACTUS_SCRUBLAND]: 'Caatinga de Cactos',
  [EcologicalZone.CRYSTAL_BADLANDS]: 'Cânion de Cristais',
  [EcologicalZone.DESERT_OASIS]: 'Oásis do Deserto',
  [EcologicalZone.COASTAL_TROPICS]: 'Costa de Coqueiros',
  [EcologicalZone.SHALLOW_REEF]: 'Lagoa & Recife Raso',
  [EcologicalZone.DEEP_OCEAN]: 'Mar Abissal',
};

export class WorldManager {
  public seed: number;
  /**
   * Active world generator version used ONLY for newly explored chunks (`getOrCreateChunk` when chunk was not yet explored).
   * Always set to `CURRENT_WORLD_GEN_VERSION` so new updates take effect on unexplored areas of the seed.
   */
  public worldGenVersion: number;
  /**
   * Original world generator version of a loaded save, used only as a fallback when hydrating legacy chunks
   * that predate compact terrain snapshots (`compactTiles`).
   */
  public legacyChunkGenVersion: number;
  public surfaceChunks: Record<string, ChunkData> = {};
  public undergroundChunks: Record<string, ChunkData> = {};
  public isUnderground = false;
  public chunks: Record<string, ChunkData> = {};
  public activeAgricultureChunkKeys = new Set<string>();

  private static readonly NO_WATER_CURRENT: {
    vx: number;
    vy: number;
    kind: 'none' | 'river' | 'ocean_shore';
  } = { vx: 0, vy: 0, kind: 'none' };

  private rawWaterCache = new Map<
    number,
    {
      waterKind: 'none' | 'ocean' | 'river' | 'lake';
      isIslandLand: boolean;
      continentalElev: number;
      riverMeander: number;
      climate: number;
    }
  >();
  private tileSubZoneCache = new Map<number, number>();
  private unloadedBiomeCache = new Map<number, BiomeType>();
  private unloadedZoneCache = new Map<number, EcologicalZone>();
  private waterCurrentBaseCache = new Map<
    number,
    {
      kind: 'none' | 'river' | 'ocean_shore';
      dirX: number;
      dirY: number;
      minDist: number;
    }
  >();

  public static packTileCoord(tx: number, ty: number): number {
    return (tx + 500000) * 1048576 + (ty + 500000);
  }

  public setActiveLayer(layer: 'surface' | 'underground'): void {
    this.isUnderground = layer === 'underground';
    this.chunks = this.isUnderground ? this.undergroundChunks : this.surfaceChunks;
  }

  public static isUndergroundBlockNode(type: NatureNodeType): boolean {
    return (
      type === NatureNodeType.UNDERGROUND_DIRT ||
      type === NatureNodeType.UNDERGROUND_COAL ||
      type === NatureNodeType.UNDERGROUND_IRON
    );
  }

  public markChunkDirty(chunk: ChunkData | undefined | null): void {
    if (!chunk) return;
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
  }

  public markTileChunkDirty(tx: number, ty: number): void {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (chunk) {
      chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
    }
  }

  public syncChunkAgricultureIndex(chunk: ChunkData | undefined | null): void {
    if (!chunk) return;
    const key = WorldManager.chunkKey(chunk.cx, chunk.cy);
    const hasAgri =
      (Array.isArray(chunk.structures) &&
        chunk.structures.some(
          (s) =>
            s &&
            (s.type === PlaceableType.TILLED_SOIL ||
              WorldManager.isSaplingStructure(s.type))
        )) ||
      (Array.isArray(chunk.puddles) && chunk.puddles.length > 0);
    if (hasAgri) {
      this.activeAgricultureChunkKeys.add(key);
    } else {
      this.activeAgricultureChunkKeys.delete(key);
    }
  }

  /**
   * Removes completely unexplored and unmodified border chunks (created by AI/collision queries)
   * that are far from all active players so RAM never leaks during multi-hour exploration.
   */
  public pruneUnexploredDistantChunks(
    activePositions: Array<{ x: number; y: number }>,
    minRadiusChunks = 5
  ): number {
    let pruned = 0;
    const anchors =
      activePositions.length > 0 ? activePositions : [{ x: 0, y: 0 }];
    const anchorChunks = anchors.map((p) => ({
      cx: Math.floor(p.x / (TILE_SIZE * CHUNK_SIZE)),
      cy: Math.floor(p.y / (TILE_SIZE * CHUNK_SIZE)),
    }));

    for (const [key, chunk] of Object.entries(this.chunks)) {
      if (!chunk) {
        delete this.chunks[key];
        continue;
      }
      if (WorldManager.isChunkExploredOrModified(chunk)) {
        continue;
      }
      const isNearAnyPlayer = anchorChunks.some(
        (ac) =>
          Math.abs(chunk.cx - ac.cx) <= minRadiusChunks &&
          Math.abs(chunk.cy - ac.cy) <= minRadiusChunks
      );
      if (!isNearAnyPlayer) {
        this.activeAgricultureChunkKeys.delete(key);
        delete this.chunks[key];
        pruned++;
      }
    }
    return pruned;
  }

  constructor(
    seed: number,
    existingChunks?: Record<string, ChunkData>,
    legacyWorldGenVersion = CURRENT_WORLD_GEN_VERSION,
    existingUndergroundChunks?: Record<string, ChunkData>
  ) {
    this.seed = seed;
    this.legacyChunkGenVersion = legacyWorldGenVersion;
    this.worldGenVersion = CURRENT_WORLD_GEN_VERSION;
    this.surfaceChunks = {};
    this.undergroundChunks = {};
    this.isUnderground = false;
    this.chunks = this.surfaceChunks;

    if (existingChunks) {
      // Pass 1: Decode compact terrain & explored snapshots and register all preserved chunks in this.surfaceChunks
      // so neighbor lookups during Pass 2 hydration see all preserved chunks immediately.
      const keysToHydrate: string[] = [];
      for (const [key, chunk] of Object.entries(existingChunks)) {
        if (!chunk) continue;
        // Only preserve chunks that have been explored or modified by the player!
        // Any untouched, unexplored chunk is left out so that when explored in the future,
        // it will be generated fresh using the latest world generation version for this seed.
        if (!WorldManager.isChunkExploredOrModified(chunk)) {
          continue;
        }
        chunk.preserved = true;
        if (typeof chunk.genVersion !== 'number') {
          chunk.genVersion = this.legacyChunkGenVersion;
        }
        const totalTiles = CHUNK_SIZE * CHUNK_SIZE;
        if (!Array.isArray(chunk.tiles) || chunk.tiles.length !== totalTiles) {
          const decodedTiles = WorldManager.decodeCompactTiles(chunk.compactTiles);
          if (decodedTiles) {
            chunk.tiles = decodedTiles;
          }
        }
        if (
          !Array.isArray(chunk.ecologicalZones) ||
          chunk.ecologicalZones.length !== totalTiles
        ) {
          const decodedZones = WorldManager.decodeCompactZones(chunk.compactZones);
          if (decodedZones) {
            chunk.ecologicalZones = decodedZones;
          }
        }
        this.surfaceChunks[key] = chunk;
        keysToHydrate.push(key);
      }

      // Pass 2: Full hydration of each preserved chunk
      for (const key of keysToHydrate) {
        this.surfaceChunks[key] = this.hydrateChunk(this.surfaceChunks[key]);
      }
    }

    if (existingUndergroundChunks) {
      for (const [key, chunk] of Object.entries(existingUndergroundChunks)) {
        if (!chunk) continue;
        if (!WorldManager.isChunkExploredOrModified(chunk)) {
          continue;
        }
        chunk.isUnderground = true;
        chunk.preserved = true;
        this.undergroundChunks[key] = this.hydrateChunk(chunk);
      }
    }
  }

  /**
   * Returns true if a chunk has been explored by the player (at least 1 revealed tile)
   * or contains player-built / modified structures.
   */
  public static isChunkExploredOrModified(chunk: ChunkData): boolean {
    if (!chunk) return false;
    const hasExploredArray =
      Array.isArray(chunk.explored) && chunk.explored.some((v) => v > 0);
    if (hasExploredArray) return true;
    const hasCompactExplored =
      typeof chunk.compactExplored === 'string' &&
      chunk.compactExplored.length > 0 &&
      !/^0+$/.test(chunk.compactExplored);
    if (hasCompactExplored) return true;
    if (
      chunk.preserved &&
      typeof chunk.compactTiles === 'string' &&
      chunk.compactTiles.length === CHUNK_SIZE * CHUNK_SIZE
    ) {
      return true;
    }
    const hasPlayerOrCustomStruct =
      Array.isArray(chunk.structures) &&
      chunk.structures.some(
        (s) =>
          s.ownerType === 'PLAYER' ||
          s.type === PlaceableType.DRILLING_STAKE ||
          s.type === PlaceableType.LEVEL_STAIRS ||
          Boolean(s.cropType) ||
          s.type === PlaceableType.TILLED_SOIL ||
          (Array.isArray(s.storageSlots) && s.storageSlots.some(Boolean)) ||
          (Array.isArray(s.stallSlots) && s.stallSlots.some(Boolean))
      );
    return hasPlayerOrCustomStruct;
  }

  public static encodeCompactExplored(explored?: number[]): string | undefined {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (!Array.isArray(explored) || explored.length === 0) return undefined;
    if (explored.length === 1) {
      return explored[0] ? 'F'.repeat(total / 4) : undefined;
    }
    if (explored.length !== total) return undefined;
    let hasAny = false;
    let out = '';
    for (let i = 0; i < total; i += 4) {
      const b0 = explored[i] ? 1 : 0;
      const b1 = explored[i + 1] ? 2 : 0;
      const b2 = explored[i + 2] ? 4 : 0;
      const b3 = explored[i + 3] ? 8 : 0;
      const nibble = b0 | b1 | b2 | b3;
      if (nibble !== 0) hasAny = true;
      out += nibble.toString(16).toUpperCase();
    }
    return hasAny ? out : undefined;
  }

  public static decodeCompactExplored(compact?: string): number[] | null {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    const hexLen = total / 4; // 64 hex chars for 256 tiles
    if (typeof compact !== 'string' || compact.length !== hexLen) return null;
    const out = new Array<number>(total);
    for (let i = 0; i < hexLen; i++) {
      const nibble = parseInt(compact[i], 16);
      const val = Number.isNaN(nibble) ? 0 : nibble;
      const base = i * 4;
      out[base] = val & 1 ? 1 : 0;
      out[base + 1] = val & 2 ? 1 : 0;
      out[base + 2] = val & 4 ? 1 : 0;
      out[base + 3] = val & 8 ? 1 : 0;
    }
    return out;
  }

  public static encodeCompactTiles(tiles: BiomeType[]): string {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (!Array.isArray(tiles) || tiles.length !== total) return '';
    let out = '';
    for (let i = 0; i < total; i++) {
      const t = tiles[i];
      out +=
        t === BiomeType.OCEAN
          ? 'O'
          : t === BiomeType.DESERT
          ? 'D'
          : t === BiomeType.ISLAND
          ? 'I'
          : t === BiomeType.FOREST
          ? 'F'
          : t === BiomeType.TEMPERATE_FOREST
          ? 'T'
          : t === BiomeType.TAIGA_FOREST
          ? 'G'
          : 'P';
    }
    return out;
  }

  public static decodeCompactTiles(compact?: string): BiomeType[] | null {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (typeof compact !== 'string' || compact.length !== total) return null;
    const tiles = new Array<BiomeType>(total);
    for (let i = 0; i < total; i++) {
      const ch = compact[i];
      tiles[i] =
        ch === 'O'
          ? BiomeType.OCEAN
          : ch === 'D'
          ? BiomeType.DESERT
          : ch === 'I'
          ? BiomeType.ISLAND
          : ch === 'F'
          ? BiomeType.FOREST
          : ch === 'T'
          ? BiomeType.TEMPERATE_FOREST
          : ch === 'G'
          ? BiomeType.TAIGA_FOREST
          : BiomeType.PLAINS;
    }
    return tiles;
  }

  public static encodeCompactZones(
    zones?: EcologicalZone[]
  ): string | undefined {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (!Array.isArray(zones) || zones.length !== total) return undefined;
    let out = '';
    for (let i = 0; i < total; i++) {
      const idx = COMPACT_ZONE_LIST.indexOf(zones[i]);
      out += idx >= 0 ? idx.toString(16).toUpperCase() : '0';
    }
    return out;
  }

  public static decodeCompactZones(compact?: string): EcologicalZone[] | null {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (typeof compact !== 'string' || compact.length !== total) return null;
    const zones = new Array<EcologicalZone>(total);
    for (let i = 0; i < total; i++) {
      const idx = parseInt(compact[i], 16);
      zones[i] =
        !Number.isNaN(idx) && idx >= 0 && idx < COMPACT_ZONE_LIST.length
          ? COMPACT_ZONE_LIST[idx]
          : EcologicalZone.MEADOW_CLEARING;
    }
    return zones;
  }

  public static encodeCompactVariants(variants: number[]): string {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (!Array.isArray(variants) || variants.length !== total) return '';
    let out = '';
    for (let i = 0; i < total; i++) {
      out += String((variants[i] || 0) & 3);
    }
    return out;
  }

  public static decodeCompactVariants(compact?: string): number[] | null {
    const total = CHUNK_SIZE * CHUNK_SIZE;
    if (typeof compact !== 'string' || compact.length !== total) return null;
    const variants = new Array<number>(total);
    for (let i = 0; i < total; i++) {
      const v = compact.charCodeAt(i) - 48;
      variants[i] = v >= 0 && v <= 3 ? v : 0;
    }
    return variants;
  }

  /**
   * Encodes `NatureNode[]` into an ultra-compact semicolon-delimited string (~6 bytes per node instead of ~65 bytes)
   * so large explored worlds with thousands of grass/tree/flower nodes never exceed localStorage's 5MB quota.
   */
  public static encodeCompactNodes(
    nodes: NatureNode[] | undefined,
    cx: number,
    cy: number
  ): string | undefined {
    if (!Array.isArray(nodes) || nodes.length === 0) return '';
    const baseTx = cx * CHUNK_SIZE;
    const baseTy = cy * CHUNK_SIZE;
    const parts: string[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      const typeIdx = COMPACT_NODE_TYPE_LIST.indexOf(n.type);
      const typeCode =
        typeIdx >= 0 ? typeIdx.toString(36).toUpperCase() : String(n.type);
      const lx = n.tileX - baseTx;
      const ly = n.tileY - baseTy;
      const posCode =
        lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE
          ? (ly * CHUNK_SIZE + lx).toString(16).toUpperCase().padStart(2, '0')
          : `${n.tileX},${n.tileY}`;
      const varCode = typeof n.variant === 'number' ? String(n.variant & 3) : '0';
      const hasDamagedHp =
        typeof n.hp === 'number' &&
        typeof n.maxHp === 'number' &&
        n.hp < n.maxHp;
      const hpCode = hasDamagedHp ? String(Math.max(1, Math.round(n.hp))) : '';
      let colorCode = '';
      if (n.flowerColor) {
        const cIdx = COMPACT_FLOWER_COLOR_LIST.indexOf(n.flowerColor);
        colorCode = cIdx >= 0 ? cIdx.toString(36).toUpperCase() : n.flowerColor;
      }
      if (colorCode) {
        parts.push(`${typeCode}:${posCode}:${varCode}:${hpCode}:${colorCode}`);
      } else if (hpCode) {
        parts.push(`${typeCode}:${posCode}:${varCode}:${hpCode}`);
      } else {
        parts.push(`${typeCode}:${posCode}:${varCode}`);
      }
    }
    return parts.join(';');
  }

  public static decodeCompactNodes(
    compact: string | undefined,
    cx: number,
    cy: number
  ): NatureNode[] | null {
    if (typeof compact !== 'string') return null;
    if (compact.length === 0) return [];
    const baseTx = cx * CHUNK_SIZE;
    const baseTy = cy * CHUNK_SIZE;
    const tokens = compact.split(';');
    const out: NatureNode[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok) continue;
      const fields = tok.split(':');
      if (fields.length < 2) continue;
      const [typeField, posField, varField, hpField, colorField] = fields;
      let nodeType: NatureNodeType = NatureNodeType.OAK_TREE;
      if (typeField.length === 1) {
        const tIdx = parseInt(typeField, 36);
        if (
          !Number.isNaN(tIdx) &&
          tIdx >= 0 &&
          tIdx < COMPACT_NODE_TYPE_LIST.length
        ) {
          nodeType = COMPACT_NODE_TYPE_LIST[tIdx];
        }
      } else {
        nodeType = typeField as NatureNodeType;
      }

      let tileX = baseTx;
      let tileY = baseTy;
      if (posField.includes(',')) {
        const [txStr, tyStr] = posField.split(',');
        tileX = parseInt(txStr, 10) || baseTx;
        tileY = parseInt(tyStr, 10) || baseTy;
      } else {
        const flat = parseInt(posField, 16);
        if (!Number.isNaN(flat) && flat >= 0 && flat < CHUNK_SIZE * CHUNK_SIZE) {
          tileX = baseTx + (flat % CHUNK_SIZE);
          tileY = baseTy + Math.floor(flat / CHUNK_SIZE);
        }
      }

      const variant = varField ? parseInt(varField, 10) || 0 : 0;
      const bp = NATURE_BLUEPRINTS[nodeType];
      const maxHp = bp ? bp.maxHp : 40;
      const hp =
        hpField && hpField.length > 0
          ? Math.min(maxHp, Math.max(1, parseInt(hpField, 10) || maxHp))
          : maxHp;

      let flowerColor: ClothingColorId | undefined;
      if (colorField && colorField.length > 0) {
        if (colorField.length === 1) {
          const cIdx = parseInt(colorField, 36);
          if (
            !Number.isNaN(cIdx) &&
            cIdx >= 0 &&
            cIdx < COMPACT_FLOWER_COLOR_LIST.length
          ) {
            flowerColor = COMPACT_FLOWER_COLOR_LIST[cIdx];
          }
        } else {
          flowerColor = colorField as ClothingColorId;
        }
      }

      out.push({
        id: `node_${tileX}_${tileY}`,
        type: nodeType,
        tileX,
        tileY,
        hp,
        maxHp,
        variant,
        rarity: bp ? bp.rarity : ('basic' as any),
        requiredTool: bp ? bp.requiredTool : ('axe' as any),
        requiredTier: bp ? bp.requiredTier : 1,
        hitFlashTimer: 0,
        animOffset: 0,
        ...(flowerColor ? { flowerColor } : {}),
      });
    }
    return out;
  }

  /**
   * Freezes and locks a chunk's terrain arrays into compact strings so future world generation
   * updates NEVER alter already-explored chunks.
   */
  public static lockChunkTerrainSnapshot(
    chunk: ChunkData,
    fallbackGenVersion = CURRENT_WORLD_GEN_VERSION,
    fallbackGameVersion = GAME_VERSION
  ): void {
    if (!chunk) return;
    chunk.preserved = true;
    if (typeof chunk.genVersion !== 'number') {
      chunk.genVersion = fallbackGenVersion;
    }
    if (!chunk.generatedGameVersion) {
      chunk.generatedGameVersion = fallbackGameVersion;
    }
    if (
      Array.isArray(chunk.tiles) &&
      chunk.tiles.length === CHUNK_SIZE * CHUNK_SIZE
    ) {
      chunk.compactTiles = WorldManager.encodeCompactTiles(chunk.tiles);
    }
    if (
      Array.isArray(chunk.ecologicalZones) &&
      chunk.ecologicalZones.length === CHUNK_SIZE * CHUNK_SIZE
    ) {
      chunk.compactZones = WorldManager.encodeCompactZones(
        chunk.ecologicalZones
      );
    }
    if (
      Array.isArray(chunk.tileVariants) &&
      chunk.tileVariants.length === CHUNK_SIZE * CHUNK_SIZE
    ) {
      chunk.compactVariants = WorldManager.encodeCompactVariants(
        chunk.tileVariants
      );
    }
    const encodedExplored = WorldManager.encodeCompactExplored(chunk.explored);
    if (encodedExplored) {
      chunk.compactExplored = encodedExplored;
    }
  }

  /**
   * Reconstructs terrain arrays (`tiles`, `tileVariants`, `ecologicalZones`),
   * full 256-tile `explored` array, and static `NatureNode` blueprint properties when loading
   * compact chunk saves from storage or network sync.
   * CRITICAL RULE: Never mutates or deletes `chunk.nodes`, `chunk.structures`, or preserved terrain of an explored chunk!
   */
  public hydrateChunk(chunk: ChunkData): ChunkData {
    const totalTiles = CHUNK_SIZE * CHUNK_SIZE;
    const chunkGenVer =
      typeof chunk.genVersion === 'number'
        ? chunk.genVersion
        : this.legacyChunkGenVersion;

    // 1. Restore preserved tiles from compactTiles first, before any fallback computation
    if (!Array.isArray(chunk.tiles) || chunk.tiles.length !== totalTiles) {
      const decodedTiles = WorldManager.decodeCompactTiles(chunk.compactTiles);
      if (decodedTiles) {
        chunk.tiles = decodedTiles;
      }
    }
    if (
      !Array.isArray(chunk.tileVariants) ||
      chunk.tileVariants.length !== totalTiles
    ) {
      const decodedVariants = WorldManager.decodeCompactVariants(
        chunk.compactVariants
      );
      if (decodedVariants) {
        chunk.tileVariants = decodedVariants;
      }
    }
    if (
      !Array.isArray(chunk.ecologicalZones) ||
      chunk.ecologicalZones.length !== totalTiles
    ) {
      const decodedZones = WorldManager.decodeCompactZones(chunk.compactZones);
      if (decodedZones) {
        chunk.ecologicalZones = decodedZones;
      }
    }

    const needsTiles =
      !Array.isArray(chunk.tiles) || chunk.tiles.length !== totalTiles;
    const needsVariants =
      !Array.isArray(chunk.tileVariants) ||
      chunk.tileVariants.length !== totalTiles;
    const needsZones =
      !Array.isArray(chunk.ecologicalZones) ||
      chunk.ecologicalZones.length !== totalTiles;

    if (needsTiles) chunk.tiles = new Array(totalTiles);
    if (needsVariants) chunk.tileVariants = new Array(totalTiles);
    if (needsZones) chunk.ecologicalZones = new Array(totalTiles);

    if (needsTiles || needsVariants || needsZones) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const tx = chunk.cx * CHUNK_SIZE + lx;
          const ty = chunk.cy * CHUNK_SIZE + ly;
          const idx = ly * CHUNK_SIZE + lx;
          const biome = chunk.isUnderground
            ? BiomeType.PLAINS
            : needsTiles
            ? this.computeBiomeAtTileForVersion(tx, ty, chunkGenVer)
            : chunk.tiles[idx];
          if (needsTiles) {
            chunk.tiles[idx] = biome;
          }
          if (needsVariants) {
            const r = hash2D(tx, ty, this.seed + 31);
            chunk.tileVariants[idx] = Math.floor(r * 4);
          }
          if (needsZones && chunk.ecologicalZones) {
            chunk.ecologicalZones[idx] = chunk.isUnderground
              ? EcologicalZone.MEADOW_CLEARING
              : this.computeEcologicalZoneAtTile(tx, ty, biome, chunkGenVer);
          }
        }
      }
    } else if (!chunk.isUnderground && chunk.ecologicalZones) {
      // One-time upgrade for legacy saved chunks so ocean coasts always have beach (COASTAL_TROPICS)
      // without ever running getHydrologyAtTile during per-frame rendering
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if (
            chunk.tiles[idx] !== BiomeType.OCEAN &&
            chunk.ecologicalZones[idx] !== EcologicalZone.COASTAL_TROPICS
          ) {
            const tx = chunk.cx * CHUNK_SIZE + lx;
            const ty = chunk.cy * CHUNK_SIZE + ly;
            if (this.getHydrologyAtTile(tx, ty, chunkGenVer).isOceanBeach) {
              chunk.ecologicalZones[idx] = EcologicalZone.COASTAL_TROPICS;
            }
          }
        }
      }
    }

    // Restore 256-tile explored array from compactExplored or legacy explored array
    if (
      (!Array.isArray(chunk.explored) || chunk.explored.length === 0) &&
      chunk.compactExplored
    ) {
      const decodedExplored = WorldManager.decodeCompactExplored(
        chunk.compactExplored
      );
      if (decodedExplored) {
        chunk.explored = decodedExplored;
      }
    }

    if (!Array.isArray(chunk.explored)) {
      chunk.explored = new Array(totalTiles).fill(0);
    } else if (chunk.explored.length === 1) {
      chunk.explored = new Array(totalTiles).fill(chunk.explored[0] ? 1 : 0);
    } else if (chunk.explored.length === 0) {
      chunk.explored = new Array(totalTiles).fill(0);
    } else if (chunk.explored.length < totalTiles) {
      const full = new Array(totalTiles).fill(0);
      for (let i = 0; i < chunk.explored.length; i++) {
        full[i] = chunk.explored[i] ? 1 : 0;
      }
      chunk.explored = full;
    }

    // Restore compactNodes if chunk.nodes is empty and compactNodes is present
    if (
      (!Array.isArray(chunk.nodes) || chunk.nodes.length === 0) &&
      typeof chunk.compactNodes === 'string'
    ) {
      const decodedNodes = WorldManager.decodeCompactNodes(
        chunk.compactNodes,
        chunk.cx,
        chunk.cy
      );
      if (decodedNodes) {
        chunk.nodes = decodedNodes;
      }
      // Clear compactNodes on the live hydrated chunk so in-game node harvesting/chopping is always authoritative
      delete chunk.compactNodes;
    }

    // Restore static blueprint properties on NatureNodes WITHOUT deleting or altering existing nodes!
    if (Array.isArray(chunk.nodes)) {
      for (let i = 0; i < chunk.nodes.length; i++) {
        const n = chunk.nodes[i];
        if (!n.id) {
          n.id = `node_${n.tileX}_${n.tileY}`;
        }
        const bp = NATURE_BLUEPRINTS[n.type];
        if (bp) {
          if (typeof n.maxHp !== 'number') n.maxHp = bp.maxHp;
          if (typeof n.hp !== 'number') n.hp = bp.maxHp;
          if (!n.rarity) n.rarity = bp.rarity;
          if (!n.requiredTool) n.requiredTool = bp.requiredTool;
          if (typeof n.requiredTier !== 'number')
            n.requiredTier = bp.requiredTier;
          if (typeof n.hitFlashTimer !== 'number') n.hitFlashTimer = 0;
          if (typeof n.animOffset !== 'number') {
            const r = hash2D(n.tileX, n.tileY, this.seed + 31);
            n.animOffset = Math.floor(r * 10);
          }
          if (
            (n.type === NatureNodeType.FLOWER_TULIP ||
              n.type === NatureNodeType.FLOWER_LILY ||
              n.type === NatureNodeType.FLOWER_SUNFLOWER ||
              n.type === NatureNodeType.FLOWER_SOLAR_DROP) &&
            !n.flowerColor
          ) {
            n.flowerColor = this.resolveFlowerColorForSpecies(
              n.type,
              n.tileX,
              n.tileY
            );
          }
        }
      }
    } else {
      chunk.nodes = [];
    }

    if (!Array.isArray(chunk.structures)) {
      chunk.structures = [];
    }

    // Lock the hydrated chunk's terrain snapshot if it is explored or modified
    if (WorldManager.isChunkExploredOrModified(chunk)) {
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunkGenVer,
        chunk.generatedGameVersion || GAME_VERSION
      );
    }

    if (!chunk.dirtyRev) {
      chunk.dirtyRev = 1;
    }
    this.syncChunkAgricultureIndex(chunk);

    return chunk;
  }

  public static chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public worldToTile(wx: number, wy: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(wx / TILE_SIZE),
      ty: Math.floor(wy / TILE_SIZE),
    };
  }

  public tileToChunk(tx: number, ty: number): { cx: number; cy: number; lx: number; ly: number } {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return { cx, cy, lx, ly };
  }

  public getOrCreateSurfaceChunk(cx: number, cy: number): ChunkData {
    const key = WorldManager.chunkKey(cx, cy);
    if (!this.surfaceChunks[key]) {
      const prevChunks = this.chunks;
      this.chunks = this.surfaceChunks;
      const generated = this.generateChunkV2(cx, cy);
      this.chunks = prevChunks;
      generated.genVersion = this.worldGenVersion;
      generated.generatedGameVersion = GAME_VERSION;
      generated.compactTiles = WorldManager.encodeCompactTiles(generated.tiles);
      generated.compactZones = WorldManager.encodeCompactZones(
        generated.ecologicalZones
      );
      generated.compactVariants = WorldManager.encodeCompactVariants(
        generated.tileVariants
      );
      generated.dirtyRev = 1;
      this.surfaceChunks[key] = generated;
      this.syncChunkAgricultureIndex(generated);
    } else if (
      !Array.isArray(this.surfaceChunks[key].tiles) ||
      this.surfaceChunks[key].tiles.length !== CHUNK_SIZE * CHUNK_SIZE
    ) {
      this.hydrateChunk(this.surfaceChunks[key]);
    }
    return this.surfaceChunks[key];
  }

  public getOrCreateUndergroundChunk(cx: number, cy: number): ChunkData {
    const key = WorldManager.chunkKey(cx, cy);
    if (!this.undergroundChunks[key]) {
      const generated = this.generateUndergroundChunk(cx, cy);
      generated.isUnderground = true;
      generated.genVersion = this.worldGenVersion;
      generated.generatedGameVersion = GAME_VERSION;
      generated.compactTiles = WorldManager.encodeCompactTiles(generated.tiles);
      generated.compactVariants = WorldManager.encodeCompactVariants(
        generated.tileVariants
      );
      generated.dirtyRev = 1;
      this.undergroundChunks[key] = generated;
    } else if (
      !Array.isArray(this.undergroundChunks[key].tiles) ||
      this.undergroundChunks[key].tiles.length !== CHUNK_SIZE * CHUNK_SIZE
    ) {
      this.undergroundChunks[key].isUnderground = true;
      this.hydrateChunk(this.undergroundChunks[key]);
    }
    return this.undergroundChunks[key];
  }

  public getOrCreateChunk(cx: number, cy: number): ChunkData {
    if (this.isUnderground) {
      return this.getOrCreateUndergroundChunk(cx, cy);
    }
    return this.getOrCreateSurfaceChunk(cx, cy);
  }

  /**
   * Generates a procedural Underground (Subsolo) chunk at `(cx, cy)`.
   * - Completely filled with solid `UNDERGROUND_DIRT` blocks except inside rare organic Air Pockets (`Bolsões de Ar`).
   * - Embeds Coal (`UNDERGROUND_COAL`) and Iron (`UNDERGROUND_IRON`) single blocks and clusters with strict cluster size caps.
   * - Inside Air Pockets: spawns a Chest with cave loot and mounts Torches onto the surrounding dirt walls.
   * - All tiles start with `explored[idx] = 0` (completely dark/undiscovered) until discovered by the player.
   */
  private generateUndergroundChunk(cx: number, cy: number): ChunkData {
    const totalTiles = CHUNK_SIZE * CHUNK_SIZE;
    const tiles: BiomeType[] = new Array(totalTiles).fill(BiomeType.PLAINS);
    const tileVariants: number[] = new Array(totalTiles);
    const explored: number[] = new Array(totalTiles).fill(0);
    const nodes: NatureNode[] = [];
    const structures: PlacedStructure[] = [];

    const baseTx = cx * CHUNK_SIZE;
    const baseTy = cy * CHUNK_SIZE;

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        const r = hash2D(baseTx + lx, baseTy + ly, this.seed + 7001);
        tileVariants[idx] = Math.floor(r * 4);
      }
    }

    // Track which local tiles (0..255) are open air pocket vs solid block type
    const blockGrid: (NatureNodeType | null)[] = new Array(totalTiles).fill(
      NatureNodeType.UNDERGROUND_DIRT
    );

    // 1. Air Pocket (Bolsão de Ar) generation (~26% chance per underground chunk)
    const pocketRoll = hash2D(cx, cy, this.seed + 7109);
    const hasAirPocket = pocketRoll < 0.26;
    let pocketCenterLx = 8;
    let pocketCenterLy = 8;
    const pocketOpenSet = new Set<number>();

    if (hasAirPocket) {
      pocketCenterLx =
        6 + Math.floor(hash2D(cx, cy, this.seed + 7121) * 4); // 6..9
      pocketCenterLy =
        6 + Math.floor(hash2D(cx, cy, this.seed + 7127) * 4); // 6..9
      const rx = 2.6 + hash2D(cx, cy, this.seed + 7151) * 1.1; // 2.6..3.7
      const ry = 2.4 + hash2D(cx, cy, this.seed + 7159) * 1.1; // 2.4..3.5

      for (let ly = 2; ly < CHUNK_SIZE - 2; ly++) {
        for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
          const dx = (lx - pocketCenterLx) / rx;
          const dy = (ly - pocketCenterLy) / ry;
          const wobble =
            (hash2D(baseTx + lx, baseTy + ly, this.seed + 7177) - 0.5) * 0.28;
          if (dx * dx + dy * dy + wobble <= 1.0) {
            const idx = ly * CHUNK_SIZE + lx;
            blockGrid[idx] = null;
            pocketOpenSet.add(idx);
          }
        }
      }
    }

    // 2. Mineral Veins: Coal (Carvão) and Iron (Ferro) — avulsos (1) or agrupamentos (clusters with strict max limit)
    // Helper to grow a cluster of size `maxClusterSize` (1..limit) inside dirt tiles
    const placeMineralVein = (
      mineralType: NatureNodeType,
      seedLx: number,
      seedLy: number,
      targetSize: number,
      salt: number
    ) => {
      const startIdx = seedLy * CHUNK_SIZE + seedLx;
      if (blockGrid[startIdx] !== NatureNodeType.UNDERGROUND_DIRT) return;

      // Keep a minimum 2-tile separation from existing veins of the same mineral so clusters never merge past the cap
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = seedLx + dx;
          const ny = seedLy + dy;
          if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE) {
            if (blockGrid[ny * CHUNK_SIZE + nx] === mineralType) {
              return;
            }
          }
        }
      }

      const clusterIndices: number[] = [startIdx];
      blockGrid[startIdx] = mineralType;

      const dirs: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];

      let attempts = 0;
      while (clusterIndices.length < targetSize && attempts < 16) {
        attempts++;
        const pickIdx =
          clusterIndices[
            Math.floor(
              hash2D(cx * 31 + attempts, cy * 17 + salt, this.seed + salt) *
                clusterIndices.length
            )
          ];
        const curLx = pickIdx % CHUNK_SIZE;
        const curLy = Math.floor(pickIdx / CHUNK_SIZE);
        const dirOffset = Math.floor(
          hash2D(curLx + attempts, curLy + salt, this.seed + salt + 19) * 4
        );

        let added = false;
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = dirs[(dirOffset + d) % 4];
          const nx = curLx + dx;
          const ny = curLy + dy;
          if (nx < 1 || nx >= CHUNK_SIZE - 1 || ny < 1 || ny >= CHUNK_SIZE - 1) {
            continue;
          }
          const nIdx = ny * CHUNK_SIZE + nx;
          if (blockGrid[nIdx] === NatureNodeType.UNDERGROUND_DIRT) {
            blockGrid[nIdx] = mineralType;
            clusterIndices.push(nIdx);
            added = true;
            break;
          }
        }
        if (!added) break;
      }
    };

    // 2A. Carvão (UNDERGROUND_COAL): Common — 5 to 7 veins per chunk; avulso (1 tile, 40%) or cluster of 2..5 tiles max (60%)
    const coalVeinCount =
      5 + Math.floor(hash2D(cx, cy, this.seed + 7307) * 3); // 5..7
    for (let v = 0; v < coalVeinCount; v++) {
      const salt = 7331 + v * 97;
      const lx = 1 + Math.floor(hash2D(cx, cy, this.seed + salt) * (CHUNK_SIZE - 2));
      const ly =
        1 + Math.floor(hash2D(cx, cy, this.seed + salt + 13) * (CHUNK_SIZE - 2));
      const sizeRoll = hash2D(cx, cy, this.seed + salt + 29);
      // 40% avulso (1), 60% agrupamento limitado (2 a 5 blocos no máximo)
      const clusterSize =
        sizeRoll < 0.40
          ? 1
          : 2 + Math.floor(hash2D(cx, cy, this.seed + salt + 43) * 4); // 2..5
      placeMineralVein(NatureNodeType.UNDERGROUND_COAL, lx, ly, clusterSize, salt);
    }

    // 2B. Ferro (UNDERGROUND_IRON): Rarer — 2 to 4 veins per chunk; avulso (1 tile, 45%) or cluster of 2..4 tiles max (55%)
    const ironVeinCount =
      2 + Math.floor(hash2D(cx, cy, this.seed + 7603) * 3); // 2..4
    for (let v = 0; v < ironVeinCount; v++) {
      const salt = 7639 + v * 109;
      const lx = 1 + Math.floor(hash2D(cx, cy, this.seed + salt) * (CHUNK_SIZE - 2));
      const ly =
        1 + Math.floor(hash2D(cx, cy, this.seed + salt + 17) * (CHUNK_SIZE - 2));
      const sizeRoll = hash2D(cx, cy, this.seed + salt + 31);
      // 45% avulso (1), 55% agrupamento limitado (2 a 4 blocos no máximo)
      const clusterSize =
        sizeRoll < 0.45
          ? 1
          : 2 + Math.floor(hash2D(cx, cy, this.seed + salt + 53) * 3); // 2..4
      placeMineralVein(NatureNodeType.UNDERGROUND_IRON, lx, ly, clusterSize, salt);
    }

    // 3. Populate Air Pocket structures: 1 Chest in the center + 2 to 3 Torches mounted on the surrounding dirt walls
    if (hasAirPocket && pocketOpenSet.size >= 9) {
      const chestTx = baseTx + pocketCenterLx;
      const chestTy = baseTy + pocketCenterLy;
      const lootRoll = hash2D(cx, cy, this.seed + 7817);
      const lootItems: { itemId: string; count: number }[] = [
        { itemId: 'charcoal', count: 6 + Math.floor(lootRoll * 7) },
        { itemId: 'iron_ore', count: 3 + Math.floor(lootRoll * 5) },
        { itemId: 'torch', count: 4 + Math.floor(lootRoll * 5) },
        { itemId: 'gold_coin', count: 18 + Math.floor(lootRoll * 30) },
      ];
      if (lootRoll > 0.45) {
        lootItems.push({ itemId: 'iron_bar', count: 2 + Math.floor(lootRoll * 3) });
      }
      if (lootRoll > 0.72) {
        lootItems.push({ itemId: 'wool_bandage', count: 2 });
      }

      const storageSlots = new Array(CHEST_STORAGE_SIZE).fill(null);
      for (let i = 0; i < lootItems.length && i < CHEST_STORAGE_SIZE; i++) {
        storageSlots[i] = {
          itemId: lootItems[i].itemId,
          count: lootItems[i].count,
        };
      }

      structures.push({
        id: `ug_chest_${chestTx}_${chestTy}`,
        type: PlaceableType.CHEST,
        itemId: 'chest',
        tileX: chestTx,
        tileY: chestTy,
        hp: 150,
        maxHp: 150,
        solid: true,
        isOpen: false,
        orientation: 'horizontal',
        lightRadius: 0,
        hitFlashTimer: 0,
        customName: 'Baú do Subsolo',
        lootItems,
        storageSlots,
      });

      // Find dirt wall tiles immediately bordering the air pocket to mount 2..3 Torches
      const wallCandidates: { lx: number; ly: number }[] = [];
      for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
        for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if (blockGrid[idx] === null) continue;
          const touchesPocket =
            pocketOpenSet.has((ly - 1) * CHUNK_SIZE + lx) ||
            pocketOpenSet.has((ly + 1) * CHUNK_SIZE + lx) ||
            pocketOpenSet.has(ly * CHUNK_SIZE + (lx - 1)) ||
            pocketOpenSet.has(ly * CHUNK_SIZE + (lx + 1));
          if (touchesPocket) {
            wallCandidates.push({ lx, ly });
          }
        }
      }

      if (wallCandidates.length > 0) {
        const torchCount = Math.min(
          wallCandidates.length,
          2 + (hash2D(cx, cy, this.seed + 7853) > 0.45 ? 1 : 0)
        );
        const step = Math.max(1, Math.floor(wallCandidates.length / torchCount));
        for (let t = 0; t < torchCount; t++) {
          const cand = wallCandidates[(t * step) % wallCandidates.length];
          const tTx = baseTx + cand.lx;
          const tTy = baseTy + cand.ly;
          structures.push({
            id: `ug_torch_${tTx}_${tTy}`,
            type: PlaceableType.TORCH,
            itemId: 'torch',
            tileX: tTx,
            tileY: tTy,
            hp: 40,
            maxHp: 40,
            solid: false,
            isOpen: false,
            orientation: 'auto',
            lightRadius: 140,
            hitFlashTimer: 0,
            attachedToWall: true,
          });
        }
      }
    }

    // 4. Create NatureNodes for all non-open tiles in blockGrid
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        const nodeType = blockGrid[idx];
        if (!nodeType) continue;
        const tx = baseTx + lx;
        const ty = baseTy + ly;
        const r = hash2D(tx, ty, this.seed + 7901);
        nodes.push(this.createNatureNode(nodeType, tx, ty, r, undefined, tileVariants[idx]));
      }
    }

    return {
      cx,
      cy,
      isUnderground: true,
      tiles,
      tileVariants,
      explored,
      nodes,
      structures,
    };
  }

  /**
   * Returns the living underground dirt/ore block (`UNDERGROUND_DIRT`, `UNDERGROUND_COAL`, `UNDERGROUND_IRON`)
   * at tile `(tx, ty)` in the underground layer, if any.
   */
  public getUndergroundBlockNodeAtTile(
    tx: number,
    ty: number,
    chunkOverride?: ChunkData
  ): NatureNode | undefined {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = chunkOverride || this.getOrCreateUndergroundChunk(cx, cy);
    return chunk.nodes.find(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        n.hp > 0 &&
        WorldManager.isUndergroundBlockNode(n.type)
    );
  }

  /**
   * Returns true if tile `(tx, ty)` in the underground currently has an unexcavated dirt/ore block.
   */
  public hasUndergroundDirtBlockAtTile(
    tx: number,
    ty: number,
    chunkOverride?: ChunkData
  ): boolean {
    return Boolean(this.getUndergroundBlockNodeAtTile(tx, ty, chunkOverride));
  }

  /**
   * Returns true if tile `(tx, ty)` in the underground has been discovered (`explored[idx] === 1`).
   */
  public isUndergroundTileDiscovered(tx: number, ty: number): boolean {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.undergroundChunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || !Array.isArray(chunk.explored)) return false;
    return chunk.explored[ly * CHUNK_SIZE + lx] === 1;
  }

  /**
   * Flood-fills discovery in the underground starting from an open (non-dirt) tile `(startTx, startTy)`.
   * - Marks all contiguous open tiles reachable from `(startTx, startTy)` as `explored = 1` (including Air Pockets when broken into!).
   * - Marks the 1-tile layer of adjacent dirt/ore blocks around those open tiles as `explored = 1` so only adjacent blocks are visible.
   * - Returns any underground chunks whose Air Pockets were newly discovered so cave enemies can be populated.
   */
  public revealUndergroundFromTile(
    startTx: number,
    startTy: number
  ): ChunkData[] {
    const queue: [number, number][] = [[startTx, startTy]];
    const visitedOpen = new Set<string>([`${startTx},${startTy}`]);
    const touchedChunks = new Set<ChunkData>();
    const newlyDiscoveredChunks = new Set<ChunkData>();

    let processed = 0;
    const maxFloodTiles = 512;

    while (queue.length > 0 && processed < maxFloodTiles) {
      const [tx, ty] = queue.shift()!;
      processed++;

      const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
      const chunk = this.getOrCreateUndergroundChunk(cx, cy);
      const idx = ly * CHUNK_SIZE + lx;
      if (chunk.explored[idx] !== 1) {
        chunk.explored[idx] = 1;
        touchedChunks.add(chunk);
        newlyDiscoveredChunks.add(chunk);
      }

      // If this tile itself still has a solid dirt/ore block, do not expand beyond it
      if (this.getUndergroundBlockNodeAtTile(tx, ty, chunk)) {
        continue;
      }

      // Reveal all 8 immediate neighbors (orthogonal + diagonal walls) and enqueue open neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ntx = tx + dx;
          const nty = ty + dy;
          const nCoords = this.tileToChunk(ntx, nty);
          const nChunk = this.getOrCreateUndergroundChunk(nCoords.cx, nCoords.cy);
          const nIdx = nCoords.ly * CHUNK_SIZE + nCoords.lx;

          if (nChunk.explored[nIdx] !== 1) {
            nChunk.explored[nIdx] = 1;
            touchedChunks.add(nChunk);
            newlyDiscoveredChunks.add(nChunk);
          }

          // Flood-fill continues through orthogonal open (non-dirt) tiles
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            const key = `${ntx},${nty}`;
            if (!visitedOpen.has(key)) {
              const blockingNode = this.getUndergroundBlockNodeAtTile(
                ntx,
                nty,
                nChunk
              );
              if (!blockingNode) {
                visitedOpen.add(key);
                queue.push([ntx, nty]);
              }
            }
          }
        }
      }
    }

    for (const chunk of touchedChunks) {
      chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunk.genVersion ?? this.worldGenVersion,
        chunk.generatedGameVersion ?? GAME_VERSION
      );
    }

    return Array.from(newlyDiscoveredChunks);
  }

  /**
   * Queries coordinate `(tx, ty)` in the underground BEFORE allowing a Drilling Stake to drill into a Level Stairs.
   * Blocks drilling if there is an ore (`UNDERGROUND_COAL` or `UNDERGROUND_IRON`), a structure, or a dropped item at `(tx, ty)`.
   */
  public canDrillAtCoordinate(
    tx: number,
    ty: number,
    droppedItems?: Array<{ x: number; y: number; isUnderground?: boolean }>
  ): { canDrill: boolean; reason?: string } {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const ugChunk = this.getOrCreateUndergroundChunk(cx, cy);

    // 1. Check if there is an ore vein (Coal or Iron) at (tx, ty) in the underground
    const ugNode = ugChunk.nodes.find(
      (n) => n.tileX === tx && n.tileY === ty && n.hp > 0
    );
    if (
      ugNode &&
      (ugNode.type === NatureNodeType.UNDERGROUND_COAL ||
        ugNode.type === NatureNodeType.UNDERGROUND_IRON)
    ) {
      return {
        canDrill: false,
        reason:
          '⚠️ Não é possível perfurar aqui: há um veio de minério exatamente abaixo no subsolo!',
      };
    }

    // 2. Check if there is any structure (e.g., Chest, Torch, or existing Stairs) at (tx, ty) in the underground
    const ugStruct = ugChunk.structures.find(
      (s) => s.tileX === tx && s.tileY === ty && s.hp > 0
    );
    if (ugStruct) {
      return {
        canDrill: false,
        reason:
          '⚠️ Não é possível perfurar aqui: há uma estrutura exatamente abaixo no subsolo!',
      };
    }

    // 3. Check if there is any dropped item at (tx, ty) in the underground
    if (Array.isArray(droppedItems)) {
      const hasItemBelow = droppedItems.some((item) => {
        if (!item.isUnderground) return false;
        const itx = Math.floor(item.x / TILE_SIZE);
        const ity = Math.floor(item.y / TILE_SIZE);
        return itx === tx && ity === ty;
      });
      if (hasItemBelow) {
        return {
          canDrill: false,
          reason:
            '⚠️ Não é possível perfurar aqui: há um item no chão nesta coordenada do subsolo!',
        };
      }
    }

    return { canDrill: true };
  }

  /**
   * Creates the paired indestructible "Escada de Nível" (`PlaceableType.LEVEL_STAIRS`) at `(tx, ty)`
   * on both the surface (`solid: true`, action "Descer") and the underground (`solid: false`, action "Subir"),
   * clearing the underground dirt block at `(tx, ty)` and revealing the adjacent underground walls.
   */
  public createLevelStairsAt(
    tx: number,
    ty: number
  ): {
    surfaceStairs: PlacedStructure;
    undergroundStairs: PlacedStructure;
    newlyDiscoveredUndergroundChunks: ChunkData[];
  } {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const surfChunk = this.getOrCreateSurfaceChunk(cx, cy);
    const ugChunk = this.getOrCreateUndergroundChunk(cx, cy);

    // Remove Drilling Stake (or any existing furniture) at (tx, ty) on the surface
    for (let i = surfChunk.structures.length - 1; i >= 0; i--) {
      const s = surfChunk.structures[i];
      if (
        s.tileX === tx &&
        s.tileY === ty &&
        (s.type === PlaceableType.DRILLING_STAKE ||
          s.type === PlaceableType.LEVEL_STAIRS)
      ) {
        surfChunk.structures.splice(i, 1);
      }
    }

    const surfaceStairs: PlacedStructure = {
      id: `stairs_surf_${tx}_${ty}`,
      type: PlaceableType.LEVEL_STAIRS,
      itemId: 'level_stairs',
      tileX: tx,
      tileY: ty,
      hp: 999999,
      maxHp: 999999,
      solid: true, // Surface Level Stairs (Descer) HAS hitbox
      isOpen: false,
      orientation: 'horizontal',
      lightRadius: 0,
      hitFlashTimer: 0,
    };
    surfChunk.structures.push(surfaceStairs);
    surfChunk.dirtyRev = (surfChunk.dirtyRev || 0) + 1;
    WorldManager.lockChunkTerrainSnapshot(
      surfChunk,
      surfChunk.genVersion ?? this.worldGenVersion,
      surfChunk.generatedGameVersion ?? GAME_VERSION
    );

    // Clear the underground dirt block at (tx, ty) so the player stands on open ground at the stairs
    for (let i = ugChunk.nodes.length - 1; i >= 0; i--) {
      const n = ugChunk.nodes[i];
      if (n.tileX === tx && n.tileY === ty) {
        ugChunk.nodes.splice(i, 1);
      }
    }

    // Remove any duplicate stairs at (tx, ty) in the underground
    for (let i = ugChunk.structures.length - 1; i >= 0; i--) {
      const s = ugChunk.structures[i];
      if (s.tileX === tx && s.tileY === ty && s.type === PlaceableType.LEVEL_STAIRS) {
        ugChunk.structures.splice(i, 1);
      }
    }

    const undergroundStairs: PlacedStructure = {
      id: `stairs_ug_${tx}_${ty}`,
      type: PlaceableType.LEVEL_STAIRS,
      itemId: 'level_stairs',
      tileX: tx,
      tileY: ty,
      hp: 999999,
      maxHp: 999999,
      solid: false, // Underground Level Stairs (Subir) DOES NOT have hitbox
      isOpen: true,
      orientation: 'horizontal',
      lightRadius: 0,
      hitFlashTimer: 0,
    };
    ugChunk.structures.push(undergroundStairs);
    ugChunk.dirtyRev = (ugChunk.dirtyRev || 0) + 1;

    const newlyDiscoveredUndergroundChunks = this.revealUndergroundFromTile(tx, ty);
    return {
      surfaceStairs,
      undergroundStairs,
      newlyDiscoveredUndergroundChunks,
    };
  }

  /**
   * Deterministic Cellular Organic Island Generator:
   * - Evaluates a macro grid (`ISLAND_CELL_SIZE = 96` tiles per cell) inside deep ocean basins.
   * - Each qualifying cell spawns at most ONE medium-to-large island (`radius = 15..26` tiles, i.e., `30..52` tiles across)
   *   with a smooth, rounded organic circumference modulated by low-order polar harmonics.
   * - Eliminates thin island slivers, fragmented archipelagos, and tiny 1–4 tile "pingados" in the sea.
   */
  private isOceanicIslandAtTile(
    tx: number,
    ty: number,
    continentalElev: number,
    oceanLevel: number
  ): boolean {
    // Keep a wide open ocean channel between the mainland coast and any oceanic island
    if (continentalElev > oceanLevel - 0.024) {
      return false;
    }

    const ISLAND_CELL_SIZE = 96;
    const icx = Math.floor(tx / ISLAND_CELL_SIZE);
    const icy = Math.floor(ty / ISLAND_CELL_SIZE);

    // Only ~38% of ocean macro-cells contain an island so islands are well-spaced and never overcrowded
    const cellRoll = hash2D(icx, icy, this.seed + 1901);
    if (cellRoll >= 0.38) {
      return false;
    }

    // Place the island center well inside the 96x96 cell (margin 30..66) so adjacent cells never merge into thin strips
    const centerX =
      icx * ISLAND_CELL_SIZE +
      30 +
      hash2D(icx, icy, this.seed + 1903) * (ISLAND_CELL_SIZE - 60);
    const centerY =
      icy * ISLAND_CELL_SIZE +
      30 +
      hash2D(icx, icy, this.seed + 1907) * (ISLAND_CELL_SIZE - 60);

    // Medium-to-large base radius: 15 to 25 tiles (diameter 30 to 50 tiles)
    const baseRadius = 15 + hash2D(icx, icy, this.seed + 1913) * 10;

    const dx = tx - centerX;
    const dy = ty - centerY;
    // Fast bounding-box reject before hypot/atan2
    if (Math.abs(dx) > baseRadius * 1.3 || Math.abs(dy) > baseRadius * 1.3) {
      return false;
    }

    // Verify the island's center itself sits well inside the ocean basin
    const centerWarpX =
      (smoothNoise(centerX * 0.0065, centerY * 0.0065, this.seed + 101) - 0.5) *
      18;
    const centerWarpY =
      (smoothNoise(centerX * 0.0065, centerY * 0.0065, this.seed + 202) - 0.5) *
      18;
    const centerElev = fbm(
      (centerX + centerWarpX) * 0.0034,
      (centerY + centerWarpY) * 0.0034,
      this.seed,
      2
    );
    if (centerElev > oceanLevel - 0.042) {
      return false;
    }

    const dist = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    const phase1 = hash2D(icx, icy, this.seed + 1931) * Math.PI * 2;
    const phase2 = hash2D(icx, icy, this.seed + 1949) * Math.PI * 2;

    // Smooth, organic rounded contour (never thin, pinched, or jagged)
    const organicFactor =
      1 +
      0.13 * Math.sin(2 * theta + phase1) +
      0.08 * Math.cos(3 * theta + phase2);
    const effectiveRadius = baseRadius * organicFactor;

    return dist <= effectiveRadius;
  }

  /**
   * Evaluates raw hydrological features at `(tx, ty)`:
   * - Predominant dry land continent (`~84%+` of the world)
   * - Immense Oceans very far apart (`continentalElev < 0.312` at low frequency `0.0034`)
   * - Medium-to-large rounded Oceanic Islands inside the oceans (`isOceanicIslandAtTile`)
   * - Rare meandering Rivers that flow downhill and empty directly into the Ocean (`waterKind === 'river'`)
   * - Cohesive rounded inland Lakes (`waterKind === 'lake'`) without 1-tile speckles
   */
  private getRawWaterAtTile(
    tx: number,
    ty: number,
    version = this.worldGenVersion
  ): {
    waterKind: 'none' | 'ocean' | 'river' | 'lake';
    isIslandLand: boolean;
    continentalElev: number;
    riverMeander: number;
    climate: number;
  } {
    const useCache = version === this.worldGenVersion;
    const packedKey = useCache ? WorldManager.packTileCoord(tx, ty) : 0;
    if (useCache) {
      const cached = this.rawWaterCache.get(packedKey);
      if (cached !== undefined) {
        return cached;
      }
      if (this.rawWaterCache.size > 32768) {
        this.rawWaterCache.clear();
      }
    }

    const useLegacyOriginCircle = version <= 4;
    const distFromOrigin = useLegacyOriginCircle ? Math.hypot(tx, ty) : 0;

    // Smooth low-frequency domain warping for sweeping, organic coastlines and biome contours
    const warpX =
      (smoothNoise(tx * 0.0065, ty * 0.0065, this.seed + 101) - 0.5) * 18;
    const warpY =
      (smoothNoise(tx * 0.0065, ty * 0.0065, this.seed + 202) - 0.5) * 18;
    const wx = tx + warpX;
    const wy = ty + warpY;

    // Smooth 2-octave continental elevation so dry land is predominant and coastlines have zero tiny fragments
    let continentalElev = fbm(wx * 0.0034, wy * 0.0034, this.seed, 2);
    if (useLegacyOriginCircle && distFromOrigin < 38) {
      const boost = Math.max(0, (38 - distFromOrigin) / 38) * 0.25;
      continentalElev += boost;
    }

    // Ultra-smooth macro climate continuum (wavelength ~280 tiles) for large, progressive biomes
    const c1 = smoothNoise(
      wx * 0.0032 + 150,
      wy * 0.0032 - 120,
      this.seed + 777
    );
    const c2 = smoothNoise(
      wx * 0.0064 - 80,
      wy * 0.0064 + 90,
      this.seed + 1777
    );
    const climate = c1 * 0.82 + c2 * 0.18;

    const riverMeander =
      fbm(wx * 0.0068 + 310, wy * 0.0068 - 240, this.seed + 4409, 2) - 0.48;

    const OCEAN_LEVEL = 0.312;

    // 1. Immense Ocean Basins & Medium/Large Organic Oceanic Islands
    if (continentalElev < OCEAN_LEVEL) {
      const isIsland = this.isOceanicIslandAtTile(
        tx,
        ty,
        continentalElev,
        OCEAN_LEVEL
      );
      const res = {
        waterKind: (isIsland ? 'none' : 'ocean') as 'none' | 'ocean',
        isIslandLand: isIsland,
        continentalElev,
        riverMeander,
        climate,
      };
      if (useCache) this.rawWaterCache.set(packedKey, res);
      return res;
    }

    // Legacy v2-v4 only: starter heartland around (0, 0) forced dry
    if (useLegacyOriginCircle && distFromOrigin < 18) {
      const res = {
        waterKind: 'none' as const,
        isIslandLand: false,
        continentalElev,
        riverMeander,
        climate,
      };
      if (useCache) this.rawWaterCache.set(packedKey, res);
      return res;
    }

    // 2. Rare Winding Rivers that empty into the Ocean
    const riverGate = smoothNoise(
      wx * 0.0032 - 90,
      wy * 0.0032 + 140,
      this.seed + 5503
    );
    const maxRiverElev =
      OCEAN_LEVEL + Math.max(0, (riverGate - 0.535) * 0.62);
    if (continentalElev < maxRiverElev) {
      const riverProgress =
        (continentalElev - OCEAN_LEVEL) /
        Math.max(0.01, maxRiverElev - OCEAN_LEVEL);
      // Widens at the estuary mouth where it meets the ocean, tapers at inland headwaters
      const halfWidth = 0.0155 * (1 - 0.48 * riverProgress);
      if (Math.abs(riverMeander) < halfWidth) {
        const res = {
          waterKind: 'river' as const,
          isIslandLand: false,
          continentalElev,
          riverMeander,
          climate,
        };
        if (useCache) this.rawWaterCache.set(packedKey, res);
        return res;
      }
    }

    // 3. Cohesive, rounded Inland Lakes (low frequency 0.015 so lakes are medium/large and never 1-tile speckles)
    const lakeNoise = smoothNoise(wx * 0.015, wy * 0.015, this.seed + 2801);
    if (
      (!useLegacyOriginCircle || distFromOrigin > 26) &&
      continentalElev > 0.385 &&
      climate >= 0.32 &&
      lakeNoise > 0.875
    ) {
      const res = {
        waterKind: 'lake' as const,
        isIslandLand: false,
        continentalElev,
        riverMeander,
        climate,
      };
      if (useCache) this.rawWaterCache.set(packedKey, res);
      return res;
    }

    const res = {
      waterKind: 'none' as const,
      isIslandLand: false,
      continentalElev,
      riverMeander,
      climate,
    };
    if (useCache) this.rawWaterCache.set(packedKey, res);
    return res;
  }

  /**
   * Checks whether a dry-land tile `(tx, ty)` belongs to an oceanic island.
   */
  private isLandSurroundedByWater(
    tx: number,
    ty: number,
    raw?: {
      waterKind: 'none' | 'ocean' | 'river' | 'lake';
      isIslandLand: boolean;
      continentalElev: number;
      riverMeander: number;
      climate: number;
    }
  ): boolean {
    const baseRaw = raw ?? this.getRawWaterAtTile(tx, ty);
    if (baseRaw.waterKind !== 'none') return false;
    return baseRaw.isIslandLand;
  }

  /**
   * Returns complete hydrological & coastal beach classification at `(tx, ty)`.
   * Every Ocean border (both mainland and oceanic islands) has a wide sandy beach (`isOceanBeach = true`).
   * Respects preserved chunks in `this.chunks` first so updates never contradict explored terrain.
   */
  public getHydrologyAtTile(
    tx: number,
    ty: number,
    version = this.worldGenVersion
  ): {
    waterKind: 'none' | 'ocean' | 'river' | 'lake';
    isOceanBeach: boolean;
    isIslandLand: boolean;
    continentalElev: number;
    riverMeander: number;
    climate: number;
  } {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const existingChunk = this.chunks[`${cx},${cy}`];
    const effectiveVer = existingChunk?.genVersion ?? version;
    const raw = this.getRawWaterAtTile(tx, ty, effectiveVer);

    if (
      existingChunk &&
      Array.isArray(existingChunk.tiles) &&
      existingChunk.tiles.length === CHUNK_SIZE * CHUNK_SIZE
    ) {
      const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const idx = ly * CHUNK_SIZE + lx;
      const preservedBiome = existingChunk.tiles[idx];
      const preservedZone = existingChunk.ecologicalZones?.[idx];

      if (preservedBiome === BiomeType.OCEAN) {
        return {
          waterKind: raw.waterKind !== 'none' ? raw.waterKind : 'ocean',
          isOceanBeach: false,
          isIslandLand: false,
          continentalElev: raw.continentalElev,
          riverMeander: raw.riverMeander,
          climate: raw.climate,
        };
      }

      if (preservedBiome) {
        const isIsland = preservedBiome === BiomeType.ISLAND;
        const OCEAN_LEVEL = 0.312;
        let isOceanBeach =
          preservedZone === EcologicalZone.COASTAL_TROPICS ||
          (!isIsland && raw.continentalElev < OCEAN_LEVEL + 0.028);
        if (!isOceanBeach && (isIsland || raw.continentalElev < OCEAN_LEVEL + 0.056)) {
          for (let dy = -3; dy <= 3 && !isOceanBeach; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (dx * dx + dy * dy > 11) continue;
              if (
                this.getRawWaterAtTile(tx + dx, ty + dy, effectiveVer).waterKind ===
                'ocean'
              ) {
                isOceanBeach = true;
                break;
              }
            }
          }
        }
        return {
          waterKind: 'none',
          isOceanBeach,
          isIslandLand: isIsland,
          continentalElev: raw.continentalElev,
          riverMeander: raw.riverMeander,
          climate: raw.climate,
        };
      }
    }

    if (raw.waterKind !== 'none') {
      return {
        waterKind: raw.waterKind,
        isOceanBeach: false,
        isIslandLand: false,
        continentalElev: raw.continentalElev,
        riverMeander: raw.riverMeander,
        climate: raw.climate,
      };
    }

    const isIsland = raw.isIslandLand;
    const OCEAN_LEVEL = 0.312;

    // Fast O(1) early-out for inland continent tiles far from any ocean
    if (!isIsland && raw.continentalElev >= OCEAN_LEVEL + 0.056) {
      return {
        waterKind: 'none',
        isOceanBeach: false,
        isIslandLand: false,
        continentalElev: raw.continentalElev,
        riverMeander: raw.riverMeander,
        climate: raw.climate,
      };
    }

    // Smooth coastal beach belt along the entire ocean coast
    if (!isIsland && raw.continentalElev < OCEAN_LEVEL + 0.028) {
      return {
        waterKind: 'none',
        isOceanBeach: true,
        isIslandLand: false,
        continentalElev: raw.continentalElev,
        riverMeander: raw.riverMeander,
        climate: raw.climate,
      };
    }

    // Check up to 3 tiles around (tx, ty) (including diagonals) for island shores and ocean beaches
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (dx * dx + dy * dy > 11) continue;
        if (
          this.getRawWaterAtTile(tx + dx, ty + dy, effectiveVer).waterKind ===
          'ocean'
        ) {
          return {
            waterKind: 'none',
            isOceanBeach: true,
            isIslandLand: isIsland,
            continentalElev: raw.continentalElev,
            riverMeander: raw.riverMeander,
            climate: raw.climate,
          };
        }
      }
    }

    return {
      waterKind: 'none',
      isOceanBeach: false,
      isIslandLand: isIsland,
      continentalElev: raw.continentalElev,
      riverMeander: raw.riverMeander,
      climate: raw.climate,
    };
  }

  /**
   * Computes the macro BiomeType at a tile.
   * If the chunk at `(tx, ty)` already exists in `this.chunks` (e.g., an explored/preserved chunk),
   * returns the preserved tile biome directly from `chunk.tiles` so updates never alter existing chunks.
   */
  public computeBiomeAtTile(tx: number, ty: number): BiomeType {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const existingChunk = this.chunks[`${cx},${cy}`];
    if (
      existingChunk &&
      Array.isArray(existingChunk.tiles) &&
      existingChunk.tiles.length === CHUNK_SIZE * CHUNK_SIZE
    ) {
      const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const preservedBiome = existingChunk.tiles[ly * CHUNK_SIZE + lx];
      if (preservedBiome) return preservedBiome;
    }
    return this.computeBiomeAtTileForVersion(tx, ty, this.worldGenVersion);
  }

  public computeBiomeAtTileForVersion(
    tx: number,
    ty: number,
    version: number
  ): BiomeType {
    if (version <= 1) {
      return this.computeBiomeAtTileV1(tx, ty);
    }
    return this.computeBiomeAtTileV2(tx, ty, version);
  }

  private computeBiomeAtTileV1(tx: number, ty: number): BiomeType {
    const distFromOrigin = Math.hypot(tx, ty);
    if (distFromOrigin < 8) {
      return BiomeType.PLAINS;
    }
    const elev = fbm(tx * 0.032, ty * 0.032, this.seed, 3);
    const temp = fbm(tx * 0.024 + 100, ty * 0.024 - 100, this.seed + 777, 3);
    if (elev < 0.34) {
      return BiomeType.OCEAN;
    }
    if (temp > 0.56 || elev < 0.37) {
      return BiomeType.DESERT;
    }
    return BiomeType.PLAINS;
  }

  /**
   * Evaluates the raw terrestrial/aquatic macro biome using ultra-low-frequency
   * domain-warped climate and woodland fields (`0.0032`–`0.0035`, wavelength ~280 tiles).
   * Terrestrial biomes are arranged along a progressive continuum:
   *   DESERT <-> PLAINS <-> FOREST <-> TEMPERATE_FOREST <-> TAIGA_FOREST
   * so biomes always form large, organic regions and transition progressively without small pockets.
   * Note: In v5+, the world NEVER molds a circular Plains clearing around (0,0); (0,0) uses 100% natural seed noise.
   */
  private computeRawBiomeAtTileV2(
    tx: number,
    ty: number,
    version = this.worldGenVersion
  ): {
    biome: BiomeType;
    nearThreshold: boolean;
  } {
    const raw = this.getRawWaterAtTile(tx, ty, version);
    if (raw.waterKind !== 'none') {
      return { biome: BiomeType.OCEAN, nearThreshold: false };
    }

    if (raw.isIslandLand) {
      return { biome: BiomeType.ISLAND, nearThreshold: false };
    }

    const useLegacyOriginCircle = version <= 4;
    const distFromOrigin = Math.hypot(tx, ty);
    const originPlainsBias =
      useLegacyOriginCircle && distFromOrigin < 26
        ? Math.max(0, (26 - distFromOrigin) / 26)
        : 0;

    const climate =
      raw.climate * (1 - originPlainsBias) + 0.44 * originPlainsBias;

    // 1. DESERT: Rarest biome, occupying large arid macro-basins (climate < 0.258)
    //    Always surrounded by a wide PLAINS buffer (0.258 <= climate < 0.36) for progressive transition.
    const DESERT_THRESHOLD = 0.258;
    if (climate < DESERT_THRESHOLD) {
      return {
        biome: BiomeType.DESERT,
        nearThreshold: DESERT_THRESHOLD - climate < 0.018,
      };
    }

    // 2. FOREST MASSIFS: Rare, large, organic forest regions (Floresta Comum, Temperada, Taiga)
    const warpX =
      (smoothNoise(tx * 0.0045, ty * 0.0045, this.seed + 301) - 0.5) * 32;
    const warpY =
      (smoothNoise(tx * 0.0045, ty * 0.0045, this.seed + 401) - 0.5) * 32;
    const mx = tx + warpX;
    const my = ty + warpY;

    const f1 = smoothNoise(
      mx * 0.0034 - 220,
      my * 0.0034 + 190,
      this.seed + 6211
    );
    const f2 = smoothNoise(
      mx * 0.0068 + 110,
      my * 0.0068 - 140,
      this.seed + 7211
    );
    const forestMacro = (f1 * 0.84 + f2 * 0.16) * (1 - originPlainsBias * 0.85);

    const FOREST_THRESHOLD = 0.605;
    if (climate >= 0.35 && forestMacro > FOREST_THRESHOLD) {
      const nearForestEdge = forestMacro - FOREST_THRESHOLD < 0.02;
      // Inside a large forest massif, transition progressively by macro latitude/climate
      const t1 = smoothNoise(
        mx * 0.0028 + 340,
        my * 0.0028 - 280,
        this.seed + 8191
      );
      const t2 = smoothNoise(
        mx * 0.0056 - 190,
        my * 0.0056 + 210,
        this.seed + 9191
      );
      const forestTypeAxis = t1 * 0.85 + t2 * 0.15;

      // Progressive ordering: FOREST (< 0.39) <-> TEMPERATE_FOREST (0.39..0.63) <-> TAIGA_FOREST (>= 0.63)
      if (forestTypeAxis < 0.39) {
        return {
          biome: BiomeType.FOREST,
          nearThreshold: nearForestEdge || 0.39 - forestTypeAxis < 0.02,
        };
      }
      if (forestTypeAxis < 0.63) {
        return {
          biome: BiomeType.TEMPERATE_FOREST,
          nearThreshold:
            nearForestEdge ||
            forestTypeAxis - 0.39 < 0.02 ||
            0.63 - forestTypeAxis < 0.02,
        };
      }
      return {
        biome: BiomeType.TAIGA_FOREST,
        nearThreshold: nearForestEdge || forestTypeAxis - 0.63 < 0.02,
      };
    }

    // 3. PLAINS: Most common default biome of the world
    const nearAnyBorder =
      climate - DESERT_THRESHOLD < 0.018 ||
      (climate >= 0.33 && FOREST_THRESHOLD - forestMacro < 0.02);
    return { biome: BiomeType.PLAINS, nearThreshold: nearAnyBorder };
  }

  private computeBiomeAtTileV2(
    tx: number,
    ty: number,
    version = this.worldGenVersion
  ): BiomeType {
    const center = this.computeRawBiomeAtTileV2(tx, ty, version);
    if (
      !center.nearThreshold ||
      center.biome === BiomeType.OCEAN ||
      center.biome === BiomeType.ISLAND
    ) {
      return center.biome;
    }

    // Radius-5 morphological majority filter near biome boundaries:
    // Guarantees that any tiny cap/tip of a noise contour (< 12 tiles wide) is smoothly absorbed
    // into the surrounding biome so "pingados" (small isolated biome pieces) can never form.
    const probeOffsets: [number, number][] = [
      [5, 0],
      [-5, 0],
      [0, 5],
      [0, -5],
      [4, 4],
      [-4, 4],
      [4, -4],
      [-4, -4],
    ];

    let sameCount = 0;
    let bestAltBiome = BiomeType.PLAINS;
    let bestAltCount = 0;
    const counts: Partial<Record<BiomeType, number>> = {};

    for (let i = 0; i < probeOffsets.length; i++) {
      const [dx, dy] = probeOffsets[i];
      const nb = this.computeRawBiomeAtTileV2(tx + dx, ty + dy, version).biome;
      if (nb === BiomeType.OCEAN || nb === BiomeType.ISLAND) {
        continue;
      }
      if (nb === center.biome) {
        sameCount++;
      } else {
        const c = (counts[nb] || 0) + 1;
        counts[nb] = c;
        if (c > bestAltCount) {
          bestAltCount = c;
          bestAltBiome = nb;
        }
      }
    }

    if (sameCount < 3 && bestAltCount > sameCount) {
      return bestAltBiome;
    }

    return center.biome;
  }

  /**
   * Computes the specific EcologicalZone (sub-biome) at (tx, ty) for terrain diversity,
   * foliage clustering, ground micro-details, and habitat-based mob spawning.
   */
  public computeEcologicalZoneAtTile(
    tx: number,
    ty: number,
    biome?: BiomeType,
    version = this.worldGenVersion,
    localChunkTiles?: BiomeType[],
    localChunkCx?: number,
    localChunkCy?: number
  ): EcologicalZone {
    const getNeighborBiome = (ntx: number, nty: number): BiomeType => {
      if (
        localChunkTiles &&
        localChunkCx !== undefined &&
        localChunkCy !== undefined &&
        Math.floor(ntx / CHUNK_SIZE) === localChunkCx &&
        Math.floor(nty / CHUNK_SIZE) === localChunkCy
      ) {
        const nlx = ((ntx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const nly = ((nty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return localChunkTiles[nly * CHUNK_SIZE + nlx];
      }
      return this.computeBiomeAtTile(ntx, nty);
    };

    const hydro = this.getHydrologyAtTile(tx, ty, version);
    const b =
      biome ??
      (hydro.waterKind !== 'none'
        ? BiomeType.OCEAN
        : getNeighborBiome(tx, ty));
    const distFromOrigin = Math.hypot(tx, ty);

    if (b === BiomeType.OCEAN) {
      if (hydro.waterKind === 'river' || hydro.waterKind === 'lake') {
        return EcologicalZone.SHALLOW_REEF;
      }
      const n = getNeighborBiome(tx, ty - 1);
      const s = getNeighborBiome(tx, ty + 1);
      const e = getNeighborBiome(tx + 1, ty);
      const w = getNeighborBiome(tx - 1, ty);
      if (
        n !== BiomeType.OCEAN ||
        s !== BiomeType.OCEAN ||
        e !== BiomeType.OCEAN ||
        w !== BiomeType.OCEAN ||
        getNeighborBiome(tx + 2, ty) !== BiomeType.OCEAN ||
        getNeighborBiome(tx - 2, ty) !== BiomeType.OCEAN
      ) {
        return EcologicalZone.SHALLOW_REEF;
      }
      return EcologicalZone.DEEP_OCEAN;
    }

    // Legacy v2-v4 only: immediate starter clearing
    if (version <= 4 && distFromOrigin < 7.5) {
      return EcologicalZone.MEADOW_CLEARING;
    }

    // Regra: Toda costa do bioma mar/oceano deve possuir praia (COASTAL_TROPICS), independentemente do bioma terrestre adjacente!
    if (hydro.isOceanBeach) {
      return EcologicalZone.COASTAL_TROPICS;
    }

    const n = getNeighborBiome(tx, ty - 1);
    const s = getNeighborBiome(tx, ty + 1);
    const e = getNeighborBiome(tx + 1, ty);
    const w = getNeighborBiome(tx - 1, ty);

    // Smooth low-frequency sub-biome fields (wavelength ~60 tiles) so sub-zones never form tiny speckles
    const vegNoise = smoothNoise(tx * 0.018 + 40, ty * 0.018 + 40, this.seed + 511);
    const rockNoise = smoothNoise(tx * 0.016 - 80, ty * 0.016 + 90, this.seed + 883);
    const sacredNoise = smoothNoise(tx * 0.015, ty * 0.015, this.seed + 1409);

    const nearWater =
      n === BiomeType.OCEAN ||
      s === BiomeType.OCEAN ||
      e === BiomeType.OCEAN ||
      w === BiomeType.OCEAN;

    // If immediately adjacent to a blended ocean tile at coastal elevation, ensure it is also beach
    if (nearWater && (b === BiomeType.ISLAND || hydro.continentalElev < 0.365)) {
      return EcologicalZone.COASTAL_TROPICS;
    }

    if (
      b === BiomeType.FOREST ||
      b === BiomeType.TEMPERATE_FOREST ||
      b === BiomeType.TAIGA_FOREST
    ) {
      return EcologicalZone.DENSE_WOODLAND;
    }

    if (b === BiomeType.PLAINS || b === BiomeType.ISLAND) {
      if (b === BiomeType.ISLAND && nearWater) {
        return EcologicalZone.COASTAL_TROPICS;
      }

      if (rockNoise > 0.72) {
        return EcologicalZone.ROCKY_HIGHLANDS;
      }

      if (vegNoise < 0.42) {
        return EcologicalZone.MEADOW_CLEARING;
      }
      if (vegNoise < 0.64) {
        return EcologicalZone.OVERGROWN_SHRUBLAND;
      }
      if (distFromOrigin > 32 && sacredNoise > 0.74) {
        return EcologicalZone.ANCIENT_GROVE;
      }
      return EcologicalZone.DENSE_WOODLAND;
    }

    // DESERT ecological sub-zones (inland desert)
    if (nearWater) {
      return EcologicalZone.DESERT_OASIS;
    }

    if (rockNoise > 0.68 && distFromOrigin > 15) {
      return EcologicalZone.CRYSTAL_BADLANDS;
    }

    if (vegNoise < 0.48) {
      return EcologicalZone.OPEN_SAND_DUNES;
    }

    return EcologicalZone.CACTUS_SCRUBLAND;
  }

  public getEcologicalZoneAtTile(tx: number, ty: number): EcologicalZone {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const chunk = this.surfaceChunks[`${cx},${cy}`] ?? this.chunks[`${cx},${cy}`];
    if (chunk && chunk.ecologicalZones) {
      const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.ecologicalZones[ly * CHUNK_SIZE + lx];
    }
    const packedKey = WorldManager.packTileCoord(tx, ty);
    const cached = this.unloadedZoneCache.get(packedKey);
    if (cached !== undefined) {
      return cached;
    }
    if (this.unloadedZoneCache.size > 16384) {
      this.unloadedZoneCache.clear();
    }
    const biome = chunk
      ? chunk.tiles[
          (((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE) * CHUNK_SIZE +
            (((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE)
        ]
      : this.getTileBiomeFast(tx, ty);
    const computed = this.computeEcologicalZoneAtTile(tx, ty, biome);
    this.unloadedZoneCache.set(packedKey, computed);
    return computed;
  }

  public getEcologicalZoneAtWorld(wx: number, wy: number): EcologicalZone {
    const { tx, ty } = this.worldToTile(wx, wy);
    return this.getEcologicalZoneAtTile(tx, ty);
  }

  /**
   * Fast non-allocating biome lookup for auto-tiling neighbors and shoreline transitions.
   */
  public getTileBiomeFast(tx: number, ty: number): BiomeType {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const chunk = this.chunks[`${cx},${cy}`];
    if (chunk) {
      const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.tiles[ly * CHUNK_SIZE + lx];
    }
    const packedKey = WorldManager.packTileCoord(tx, ty);
    const cached = this.unloadedBiomeCache.get(packedKey);
    if (cached !== undefined) {
      return cached;
    }
    if (this.unloadedBiomeCache.size > 16384) {
      this.unloadedBiomeCache.clear();
    }
    const computed = this.computeBiomeAtTile(tx, ty);
    this.unloadedBiomeCache.set(packedKey, computed);
    return computed;
  }

  /**
   * Deterministic [0..1] hash for tile micro-details, flowers, pebbles, and foliage.
   */
  public getTileDetailHash(tx: number, ty: number, salt = 0): number {
    return hash2D(tx, ty, this.seed + salt);
  }

  /**
   * Computes a progressive visual sub-zone (0, 1, or 2) within a biome so terrain
   * transitions smoothly and progressively across elevation, moisture, and coastlines.
   * Cached per tile in O(1) so rendering never repeats neighbor/noise evaluations.
   */
  public getTileSubZone(tx: number, ty: number, biome: BiomeType): number {
    const packedKey = WorldManager.packTileCoord(tx, ty);
    const cached = this.tileSubZoneCache.get(packedKey);
    if (cached !== undefined) {
      return cached;
    }
    if (this.tileSubZoneCache.size > 32768) {
      this.tileSubZoneCache.clear();
    }

    const subZone = this.computeTileSubZoneUncached(tx, ty, biome);
    this.tileSubZoneCache.set(packedKey, subZone);
    return subZone;
  }

  private computeTileSubZoneUncached(
    tx: number,
    ty: number,
    biome: BiomeType
  ): number {
    const n = this.getTileBiomeFast(tx, ty - 1);
    const s = this.getTileBiomeFast(tx, ty + 1);
    const e = this.getTileBiomeFast(tx + 1, ty);
    const w = this.getTileBiomeFast(tx - 1, ty);

    if (biome === BiomeType.OCEAN) {
      if (
        n !== BiomeType.OCEAN ||
        s !== BiomeType.OCEAN ||
        e !== BiomeType.OCEAN ||
        w !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx + 1, ty - 1) !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx - 1, ty - 1) !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx + 1, ty + 1) !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx - 1, ty + 1) !== BiomeType.OCEAN
      ) {
        return 0;
      }
      if (
        this.getTileBiomeFast(tx, ty - 2) !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx, ty + 2) !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx + 2, ty) !== BiomeType.OCEAN ||
        this.getTileBiomeFast(tx - 2, ty) !== BiomeType.OCEAN
      ) {
        return 1;
      }
      return 2;
    }

    const zone = this.getEcologicalZoneAtTile(tx, ty);
    if (biome === BiomeType.ISLAND) {
      if (
        n === BiomeType.OCEAN ||
        s === BiomeType.OCEAN ||
        e === BiomeType.OCEAN ||
        w === BiomeType.OCEAN ||
        zone === EcologicalZone.COASTAL_TROPICS
      ) {
        return 1; // Golden Tropical Island Shore
      }
      if (zone === EcologicalZone.ROCKY_HIGHLANDS) {
        return 2; // Island Rocky Highland
      }
      return 0; // Lush Tropical Island Interior
    }

    if (
      biome === BiomeType.FOREST ||
      biome === BiomeType.TEMPERATE_FOREST ||
      biome === BiomeType.TAIGA_FOREST
    ) {
      const borderDiff =
        n !== biome || s !== biome || e !== biome || w !== biome;
      if (borderDiff) {
        return 2; // Forest edge transition tone
      }
      const canopyMacro = smoothNoise(tx * 0.022, ty * 0.022, this.seed + 709);
      return canopyMacro > 0.5 ? 0 : 1;
    }

    if (biome === BiomeType.PLAINS) {
      if (
        n === BiomeType.DESERT ||
        s === BiomeType.DESERT ||
        e === BiomeType.DESERT ||
        w === BiomeType.DESERT ||
        zone === EcologicalZone.ROCKY_HIGHLANDS
      ) {
        return 2; // Frontier Steppe / Highlands tone
      }
      if (
        n === BiomeType.FOREST ||
        s === BiomeType.FOREST ||
        e === BiomeType.FOREST ||
        w === BiomeType.FOREST ||
        n === BiomeType.TEMPERATE_FOREST ||
        s === BiomeType.TEMPERATE_FOREST ||
        e === BiomeType.TEMPERATE_FOREST ||
        w === BiomeType.TEMPERATE_FOREST ||
        n === BiomeType.TAIGA_FOREST ||
        s === BiomeType.TAIGA_FOREST ||
        e === BiomeType.TAIGA_FOREST ||
        w === BiomeType.TAIGA_FOREST ||
        zone === EcologicalZone.DENSE_WOODLAND ||
        zone === EcologicalZone.ANCIENT_GROVE ||
        zone === EcologicalZone.OVERGROWN_SHRUBLAND
      ) {
        return 0; // Deep Lush Clover / Forest border tone
      }
      return 1; // Sunlit Meadow Clearing tone
    }

    // DESERT / BEACH (v2)
    if (zone === EcologicalZone.COASTAL_TROPICS) {
      return 1; // Bright Golden Beach Sand on all ocean beaches
    }
    if (
      n === BiomeType.PLAINS ||
      s === BiomeType.PLAINS ||
      e === BiomeType.PLAINS ||
      w === BiomeType.PLAINS ||
      zone === EcologicalZone.DESERT_OASIS ||
      zone === EcologicalZone.CACTUS_SCRUBLAND
    ) {
      return 0; // Savannah Scrub / Oasis border
    }
    if (zone === EcologicalZone.CRYSTAL_BADLANDS) {
      return 2; // Red-Gold Sandstone Basin
    }
    return 1; // Sculpted Golden Sand Dunes
  }

  /**
   * Resolves a progressive intermediate biome along a seam between an older preserved chunk's
   * edge biome (`anchorBiome`) and a newly generated chunk's raw biome (`targetBiome`).
   * Guarantees smooth, natural ecotone progressions instead of abrupt jumps.
   */
  private resolveProgressiveSeamBiome(
    anchorBiome: BiomeType,
    targetBiome: BiomeType,
    normalizedProgress: number
  ): BiomeType {
    if (anchorBiome === targetBiome) return anchorBiome;
    // Inner band closest to the preserved chunk border adopts the preserved chunk's biome
    if (normalizedProgress < 0.56) {
      return anchorBiome;
    }

    // Outer band (0.56..1.0): insert natural intermediate biome when transitioning between non-adjacent biomes
    const isForest = (b: BiomeType) =>
      b === BiomeType.FOREST ||
      b === BiomeType.TEMPERATE_FOREST ||
      b === BiomeType.TAIGA_FOREST;

    // Desert <-> Any Forest transitions progressively through Plains
    if (
      (anchorBiome === BiomeType.DESERT && isForest(targetBiome)) ||
      (isForest(anchorBiome) && targetBiome === BiomeType.DESERT)
    ) {
      return BiomeType.PLAINS;
    }

    // Common Forest <-> Taiga Forest transitions progressively through Temperate Forest
    if (
      (anchorBiome === BiomeType.FOREST &&
        targetBiome === BiomeType.TAIGA_FOREST) ||
      (anchorBiome === BiomeType.TAIGA_FOREST &&
        targetBiome === BiomeType.FOREST)
    ) {
      return BiomeType.TEMPERATE_FOREST;
    }

    // Ocean <-> Dense Forests transitions through a natural Plains coastal margin
    if (
      (anchorBiome === BiomeType.OCEAN && isForest(targetBiome)) ||
      (isForest(anchorBiome) && targetBiome === BiomeType.OCEAN)
    ) {
      return BiomeType.PLAINS;
    }

    return anchorBiome;
  }

  /**
   * Organically blends the terrain tiles of a newly generated chunk `(cx, cy)` with any
   * already-explored / preserved neighboring chunks in `this.chunks`.
   * Prevents straight, rectilinear, quadratic, or unnatural chunk-border seams when the world
   * generator is updated across game versions.
   */
  private blendChunkTilesWithPreservedNeighbors(
    cx: number,
    cy: number,
    tiles: BiomeType[]
  ): void {
    const neighborOffsets: Array<[number, number]> = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];

    const preservedNeighbors: Array<{
      dx: number;
      dy: number;
      chunk: ChunkData;
    }> = [];

    for (const [dx, dy] of neighborOffsets) {
      const nb = this.chunks[WorldManager.chunkKey(cx + dx, cy + dy)];
      if (
        nb &&
        (nb.preserved || WorldManager.isChunkExploredOrModified(nb)) &&
        Array.isArray(nb.tiles) &&
        nb.tiles.length === CHUNK_SIZE * CHUNK_SIZE
      ) {
        preservedNeighbors.push({ dx, dy, chunk: nb });
      }
    }

    if (preservedNeighbors.length === 0) return;

    const blended = tiles.slice();
    const wasBlended = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = cx * CHUNK_SIZE + lx;
        const ty = cy * CHUNK_SIZE + ly;
        const idx = ly * CHUNK_SIZE + lx;
        const rawBiome = tiles[idx];

        // Multi-frequency domain-warped organic wave so the blend contour curves naturally
        const w1 =
          (perlin2D(tx * 0.13, ty * 0.13, this.seed + 15131) + 1) * 0.5;
        const w2 = smoothNoise(tx * 0.065, ty * 0.065, this.seed + 15733);
        const w3 = perlin2D(tx * 0.27, ty * 0.27, this.seed + 16007) * 0.7;
        const waveFactor = 0.36 + 0.64 * (w1 * 0.62 + w2 * 0.38);
        const wobble = Math.round(
          perlin2D(tx * 0.19, ty * 0.19, this.seed + 16301) * 1.5
        );

        let bestT = 1.0;
        let bestAnchorBiome: BiomeType = rawBiome;

        for (let i = 0; i < preservedNeighbors.length; i++) {
          const { dx, dy, chunk: nb } = preservedNeighbors[i];
          const distX = dx < 0 ? lx : dx > 0 ? CHUNK_SIZE - 1 - lx : 0;
          const distY = dy < 0 ? ly : dy > 0 ? CHUNK_SIZE - 1 - ly : 0;
          const isCorner = dx !== 0 && dy !== 0;
          const d = isCorner ? Math.hypot(distX, distY) : distX + distY;

          const maxReach = isCorner ? 5.6 : 7.2;
          const organicReach = Math.max(
            1.6,
            maxReach * waveFactor + w3
          );

          if (d < organicReach) {
            const t = d / organicReach;
            if (t < bestT) {
              const nbLx =
                dx < 0
                  ? CHUNK_SIZE - 1
                  : dx > 0
                  ? 0
                  : Math.max(0, Math.min(CHUNK_SIZE - 1, lx + wobble));
              const nbLy =
                dy < 0
                  ? CHUNK_SIZE - 1
                  : dy > 0
                  ? 0
                  : Math.max(0, Math.min(CHUNK_SIZE - 1, ly + wobble));
              const edgeBiome = nb.tiles[nbLy * CHUNK_SIZE + nbLx];
              if (edgeBiome) {
                bestT = t;
                bestAnchorBiome = edgeBiome;
              }
            }
          }
        }

        if (bestT < 1.0 && bestAnchorBiome !== rawBiome) {
          blended[idx] = this.resolveProgressiveSeamBiome(
            bestAnchorBiome,
            rawBiome,
            bestT
          );
          wasBlended[idx] = 1;
        }
      }
    }

    // Cellular smoothing pass on the blended seam zone so contours are 100% rounded and organic
    const getEffectiveTile = (lx: number, ly: number): BiomeType => {
      if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
        return blended[ly * CHUNK_SIZE + lx];
      }
      return this.getTileBiomeFast(cx * CHUNK_SIZE + lx, cy * CHUNK_SIZE + ly);
    };

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        if (!wasBlended[idx]) {
          tiles[idx] = blended[idx];
          continue;
        }
        const current = blended[idx];
        const n = getEffectiveTile(lx, ly - 1);
        const s = getEffectiveTile(lx, ly + 1);
        const e = getEffectiveTile(lx + 1, ly);
        const w = getEffectiveTile(lx - 1, ly);

        let sameCardinals = 0;
        if (n === current) sameCardinals++;
        if (s === current) sameCardinals++;
        if (e === current) sameCardinals++;
        if (w === current) sameCardinals++;

        if (sameCardinals <= 1) {
          if (n === s || n === e || n === w) {
            tiles[idx] = n;
          } else if (s === e || s === w) {
            tiles[idx] = s;
          } else if (e === w) {
            tiles[idx] = e;
          } else {
            tiles[idx] = current;
          }
        } else {
          tiles[idx] = current;
        }
      }
    }
  }

  // =========================================================================
  // LEGACY V1 CHUNK GENERATOR (100% preserved for existing saved games)
  // =========================================================================
  private generateChunkV1(cx: number, cy: number): ChunkData {
    const tiles: BiomeType[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const tileVariants: number[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const explored: number[] = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
    const nodes: NatureNode[] = [];
    const structures: PlacedStructure[] = [];

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = cx * CHUNK_SIZE + lx;
        const ty = cy * CHUNK_SIZE + ly;
        const idx = ly * CHUNK_SIZE + lx;

        const biome = this.computeBiomeAtTileV1(tx, ty);
        tiles[idx] = biome;

        const r = hash2D(tx, ty, this.seed + 31);
        tileVariants[idx] = Math.floor(r * 4);

        if (Math.hypot(tx, ty) < 3.5) continue;

        const spawnRoll = hash2D(tx, ty, this.seed + 911);
        const rarityRoll = hash2D(tx, ty, this.seed + 4099);
        const distFromSpawn = Math.hypot(tx, ty);

        let nodeType: NatureNodeType | null = null;

        if (biome === BiomeType.PLAINS) {
          const nearOcean =
            this.computeBiomeAtTileV1(tx + 1, ty) === BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx - 1, ty) === BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx, ty + 1) === BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx, ty - 1) === BiomeType.OCEAN;

          if (nearOcean && spawnRoll < 0.12) {
            nodeType = NatureNodeType.PALM_TREE;
          } else if (spawnRoll < 0.095) {
            if (distFromSpawn > 26 && rarityRoll < 0.045) {
              nodeType = NatureNodeType.ANCIENT_WORLD_TREE;
            } else if (distFromSpawn > 14 && rarityRoll < 0.18) {
              nodeType =
                rarityRoll < 0.1
                  ? NatureNodeType.IRON_OUTCROP
                  : NatureNodeType.HARDWOOD_TREE;
            } else if (rarityRoll < 0.42) {
              nodeType = NatureNodeType.OAK_TREE;
            } else if (rarityRoll < 0.72) {
              nodeType = NatureNodeType.BERRY_BUSH;
            } else {
              nodeType = NatureNodeType.BOULDER;
            }
          }
        } else if (biome === BiomeType.DESERT) {
          if (spawnRoll < 0.085) {
            if (distFromSpawn > 24 && rarityRoll < 0.055) {
              nodeType = NatureNodeType.SUNSTONE_OBELISK;
            } else if (distFromSpawn > 12 && rarityRoll < 0.24) {
              nodeType =
                rarityRoll < 0.13
                  ? NatureNodeType.DESERT_CRYSTAL
                  : NatureNodeType.IRON_OUTCROP;
            } else if (rarityRoll < 0.65) {
              nodeType = NatureNodeType.CACTUS;
            } else {
              nodeType = NatureNodeType.BOULDER;
            }
          } else if (hash2D(tx, ty, this.seed + 6173) < 0.068) {
            nodeType = NatureNodeType.SAND_DUNE;
          }
        } else if (biome === BiomeType.OCEAN) {
          const nearShore =
            this.computeBiomeAtTileV1(tx + 1, ty) !== BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx - 1, ty) !== BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx, ty + 1) !== BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx, ty - 1) !== BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx + 2, ty) !== BiomeType.OCEAN ||
            this.computeBiomeAtTileV1(tx - 2, ty) !== BiomeType.OCEAN;

          if (nearShore && spawnRoll < 0.055) {
            nodeType = NatureNodeType.PEARL_CLAM;
          }
        }

        if (nodeType) {
          nodes.push(this.createNatureNode(nodeType, tx, ty, r));
        }
      }
    }

    return {
      cx,
      cy,
      tiles,
      tileVariants,
      explored,
      nodes,
      structures,
    };
  }

  // =========================================================================
  // V2+ REALISTIC BIOME, ECOLOGICAL ZONE, TRUE RARITY & STRUCTURE GENERATOR
  // =========================================================================
  private generateChunkV2(cx: number, cy: number): ChunkData {
    const tiles: BiomeType[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const tileVariants: number[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const ecologicalZones: EcologicalZone[] = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const explored: number[] = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0);
    const nodes: NatureNode[] = [];
    const structures: PlacedStructure[] = [];

    // True Rarity Gate: At most 1 Very Rare Relic can naturally spawn per chunk,
    // and only in distant chunks that pass the chunk relic roll
    const chunkCenterDist = Math.hypot(
      (cx + 0.5) * CHUNK_SIZE,
      (cy + 0.5) * CHUNK_SIZE
    );
    const chunkRelicRoll = hash2D(cx, cy, this.seed + 7717);
    let relicSpawnedInChunk = false;
    let rareCountInChunk = 0;

    // Pass 1: Compute raw natural biome and visual variant for each tile in the chunk
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = cx * CHUNK_SIZE + lx;
        const ty = cy * CHUNK_SIZE + ly;
        const idx = ly * CHUNK_SIZE + lx;
        tiles[idx] = this.computeBiomeAtTileV2(tx, ty, this.worldGenVersion);
        const r = hash2D(tx, ty, this.seed + 31);
        tileVariants[idx] = Math.floor(r * 4);
      }
    }

    // Pass 2: Organically blend chunk edges with any adjacent already-explored/preserved chunks
    // so updates to world generation never produce straight, quadratic, or rectilinear seams!
    this.blendChunkTilesWithPreservedNeighbors(cx, cy, tiles);

    // Pass 3: Compute ecological zones and populate natural flora/minerals matching the blended terrain
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = cx * CHUNK_SIZE + lx;
        const ty = cy * CHUNK_SIZE + ly;
        const idx = ly * CHUNK_SIZE + lx;

        const biome = tiles[idx];
        const zone = this.computeEcologicalZoneAtTile(
          tx,
          ty,
          biome,
          this.worldGenVersion,
          tiles,
          cx,
          cy
        );
        ecologicalZones[idx] = zone;

        const r = hash2D(tx, ty, this.seed + 31);
        const distFromSpawn = Math.hypot(tx, ty);
        if (this.worldGenVersion <= 4 && distFromSpawn < 4.5) continue;

        // Winding natural animal/explorer trails stay clear even inside dense woods
        const trailVal = Math.abs(
          smoothNoise(tx * 0.11, ty * 0.11, this.seed + 619) - 0.5
        );
        const isNaturalTrail = trailVal < 0.042;
        if (isNaturalTrail) continue;

        // No bioma ILHA (BiomeType.ISLAND), a chance de geração natural na descoberta é 30% maior (* 1.3)
        const rawSpawnRoll = hash2D(tx, ty, this.seed + 911);
        const spawnRoll =
          biome === BiomeType.ISLAND ? rawSpawnRoll / 1.3 : rawSpawnRoll;
        const rarityRoll = hash2D(tx, ty, this.seed + 4099);
        const clusterNoise = smoothNoise(tx * 0.22, ty * 0.22, this.seed + 1291);

        let nodeType: NatureNodeType | null = null;
        let nodeVariant: number | undefined;

        if (
          zone !== EcologicalZone.COASTAL_TROPICS &&
          (biome === BiomeType.FOREST ||
            biome === BiomeType.TEMPERATE_FOREST ||
            biome === BiomeType.TAIGA_FOREST)
        ) {
          // Florestas densas: alta densidade de árvores próprias de cada floresta, sem novos ecossistemas
          const forestDensity = clusterNoise > 0.42 ? 0.42 : 0.28;
          if (spawnRoll < forestDensity) {
            if (biome === BiomeType.FOREST) {
              if (
                distFromSpawn > 18 &&
                rareCountInChunk < 4 &&
                rarityRoll < 0.14
              ) {
                nodeType = NatureNodeType.HARDWOOD_TREE;
                rareCountInChunk++;
              } else {
                nodeType = NatureNodeType.OAK_TREE;
              }
            } else if (biome === BiomeType.TEMPERATE_FOREST) {
              nodeType = NatureNodeType.TEMPERATE_TREE;
            } else {
              nodeType = NatureNodeType.PINE_TREE;
              // Pinheiros altos (variant 0) e pequenos (variant 1)
              nodeVariant = rarityRoll < 0.55 ? 0 : 1;
            }
          }
        } else {
          switch (zone) {
            case EcologicalZone.MEADOW_CLEARING: {
              // Very clean, open grassland with occasional berry bush or lone oak tree
              if (spawnRoll < 0.022) {
                nodeType =
                  rarityRoll < 0.65
                    ? NatureNodeType.BERRY_BUSH
                    : NatureNodeType.OAK_TREE;
              }
              break;
            }

          case EcologicalZone.OVERGROWN_SHRUBLAND: {
            // Lush thicket with abundant berry bushes, fibers, and scattered oaks
            if (spawnRoll < 0.115) {
              if (rarityRoll < 0.68) {
                nodeType = NatureNodeType.BERRY_BUSH;
              } else if (rarityRoll < 0.92) {
                nodeType = NatureNodeType.OAK_TREE;
              } else {
                nodeType = NatureNodeType.BOULDER;
              }
            }
            break;
          }

          case EcologicalZone.DENSE_WOODLAND: {
            // Dense forest canopy with clustered Oak trees, forest berries, and rare Hardwood trees
            const densityThreshold = clusterNoise > 0.45 ? 0.21 : 0.11;
            if (spawnRoll < densityThreshold) {
              if (
                distFromSpawn > 18 &&
                rareCountInChunk < 3 &&
                rarityRoll < 0.095
              ) {
                nodeType = NatureNodeType.HARDWOOD_TREE;
                rareCountInChunk++;
              } else if (rarityRoll < 0.82) {
                nodeType = NatureNodeType.OAK_TREE;
              } else {
                nodeType = NatureNodeType.BERRY_BUSH;
              }
            }
            break;
          }

          case EcologicalZone.ANCIENT_GROVE: {
            // Sacred forest grove: home to Hardwood Trees and (rarely) the Ancient World Tree
            if (
              !relicSpawnedInChunk &&
              chunkCenterDist > 36 &&
              chunkRelicRoll < 0.22 &&
              lx >= 5 &&
              lx <= 10 &&
              ly >= 5 &&
              ly <= 10 &&
              spawnRoll < 0.18
            ) {
              nodeType = NatureNodeType.ANCIENT_WORLD_TREE;
              relicSpawnedInChunk = true;
            } else if (spawnRoll < 0.15) {
              if (rareCountInChunk < 4 && rarityRoll < 0.28) {
                nodeType = NatureNodeType.HARDWOOD_TREE;
                rareCountInChunk++;
              } else if (rarityRoll < 0.78) {
                nodeType = NatureNodeType.OAK_TREE;
              } else {
                nodeType = NatureNodeType.BERRY_BUSH;
              }
            }
            break;
          }

          case EcologicalZone.ROCKY_HIGHLANDS: {
            // Craggy stone outcrops and genuine Iron Ore mineral veins
            const rockThreshold = clusterNoise > 0.48 ? 0.16 : 0.08;
            if (spawnRoll < rockThreshold) {
              if (
                distFromSpawn > 16 &&
                rareCountInChunk < 3 &&
                rarityRoll < 0.22
              ) {
                nodeType = NatureNodeType.IRON_OUTCROP;
                rareCountInChunk++;
              } else if (rarityRoll < 0.88) {
                nodeType = NatureNodeType.BOULDER;
              } else {
                nodeType = NatureNodeType.OAK_TREE;
              }
            }
            break;
          }

          case EcologicalZone.COASTAL_TROPICS: {
            // Wide sandy ocean beaches & island shores populated with Coconut Palm Trees (Coqueiros)
            const immediateShore =
              this.computeBiomeAtTileV2(tx + 1, ty) === BiomeType.OCEAN ||
              this.computeBiomeAtTileV2(tx - 1, ty) === BiomeType.OCEAN ||
              this.computeBiomeAtTileV2(tx, ty + 1) === BiomeType.OCEAN ||
              this.computeBiomeAtTileV2(tx, ty - 1) === BiomeType.OCEAN;
            const palmChance = immediateShore ? 0.065 : 0.145;
            if (spawnRoll < palmChance) {
              nodeType =
                rarityRoll < 0.92
                  ? NatureNodeType.PALM_TREE
                  : NatureNodeType.BOULDER;
            }
            break;
          }

          case EcologicalZone.OPEN_SAND_DUNES: {
            // Clean, wind-sculpted golden dunes with very sparse obstacles
            if (spawnRoll < 0.016) {
              nodeType =
                rarityRoll < 0.72
                  ? NatureNodeType.CACTUS
                  : NatureNodeType.BOULDER;
            }
            break;
          }

          case EcologicalZone.CACTUS_SCRUBLAND: {
            // Thorny desert scrubland with cactus clusters and weathered boulders
            if (spawnRoll < 0.105) {
              if (rarityRoll < 0.74) {
                nodeType = NatureNodeType.CACTUS;
              } else {
                nodeType = NatureNodeType.BOULDER;
              }
            }
            break;
          }

          case EcologicalZone.CRYSTAL_BADLANDS: {
            // Red-gold sandstone canyon with Solar Crystals, Iron veins, and rare Sunstone Obelisks
            if (
              !relicSpawnedInChunk &&
              chunkCenterDist > 36 &&
              chunkRelicRoll < 0.18 &&
              lx >= 5 &&
              lx <= 10 &&
              ly >= 5 &&
              ly <= 10 &&
              spawnRoll < 0.16
            ) {
              nodeType = NatureNodeType.SUNSTONE_OBELISK;
              relicSpawnedInChunk = true;
            } else if (spawnRoll < 0.13) {
              if (
                distFromSpawn > 18 &&
                rareCountInChunk < 3 &&
                rarityRoll < 0.26
              ) {
                nodeType =
                  rarityRoll < 0.15
                    ? NatureNodeType.DESERT_CRYSTAL
                    : NatureNodeType.IRON_OUTCROP;
                rareCountInChunk++;
              } else if (rarityRoll < 0.72) {
                nodeType = NatureNodeType.BOULDER;
              } else {
                nodeType = NatureNodeType.CACTUS;
              }
            }
            break;
          }

          case EcologicalZone.DESERT_OASIS: {
            // Lush palm & berry pocket around desert water springs
            if (spawnRoll < 0.14) {
              nodeType =
                rarityRoll < 0.7
                  ? NatureNodeType.PALM_TREE
                  : NatureNodeType.BERRY_BUSH;
            }
            break;
          }

          case EcologicalZone.SHALLOW_REEF: {
            // Shallow coastal lagoon: only spawns Very Rare Pearl Clams in rare distant reefs
            if (
              !relicSpawnedInChunk &&
              chunkCenterDist > 30 &&
              chunkRelicRoll < 0.24 &&
              spawnRoll < 0.045
            ) {
              nodeType = NatureNodeType.PEARL_CLAM;
              relicSpawnedInChunk = true;
            }
            break;
          }

          case EcologicalZone.DEEP_OCEAN:
          default:
            break;
          }
        }

        // Duna de Areia: elemento natural sem hitbox, tão comum quanto arbustos, exclusivo de solo de areia
        if (
          !nodeType &&
          (biome === BiomeType.DESERT ||
            zone === EcologicalZone.COASTAL_TROPICS)
        ) {
          const rawDuneRoll = hash2D(tx, ty, this.seed + 6173);
          const duneRoll =
            biome === BiomeType.ISLAND ? rawDuneRoll / 1.3 : rawDuneRoll;
          if (duneRoll < 0.068) {
            nodeType = NatureNodeType.SAND_DUNE;
          }
        }

        // Regra 1: 10% de chance de, no lugar de um arbusto (BERRY_BUSH), ser gerada uma flor
        let flowerColor: ClothingColorId | undefined;
        const isForestBiome =
          biome === BiomeType.FOREST ||
          biome === BiomeType.TEMPERATE_FOREST ||
          biome === BiomeType.TAIGA_FOREST;
        if (!isForestBiome && nodeType === NatureNodeType.BERRY_BUSH) {
          const bushFlowerRoll = hash2D(tx, ty, this.seed + 5381);
          if (bushFlowerRoll < 0.1) {
            const resolved = this.resolveFlowerAtTile(
              tx,
              ty,
              biome,
              zone,
              true
            );
            if (resolved) {
              nodeType = resolved.type;
              flowerColor = resolved.flowerColor;
            }
          }
        } else if (!isForestBiome && !nodeType && biome !== BiomeType.OCEAN) {
          // Regra 2: Canteiros e manchas naturais controlados por Ruído de Perlin 2D (e 5% Gota Solar em qualquer bioma)
          const resolved = this.resolveFlowerAtTile(
            tx,
            ty,
            biome,
            zone,
            false
          );
          if (resolved) {
            nodeType = resolved.type;
            flowerColor = resolved.flowerColor;
          }
        }

        let nodeOffsetX: number | undefined;
        let nodeOffsetY: number | undefined;

        if (
          !nodeType &&
          biome !== BiomeType.OCEAN &&
          zone !== EcologicalZone.COASTAL_TROPICS
        ) {
          const canGrowNaturalGrass =
            biome === BiomeType.PLAINS ||
            biome === BiomeType.FOREST ||
            biome === BiomeType.TEMPERATE_FOREST ||
            biome === BiomeType.TAIGA_FOREST ||
            biome === BiomeType.ISLAND ||
            (biome === BiomeType.DESERT &&
              zone === EcologicalZone.DESERT_OASIS);

          if (canGrowNaturalGrass) {
            const grassPatchWave =
              (perlin2D(tx * 0.095, ty * 0.095, this.seed + 6823) + 1) * 0.5;
            const grassMicroWave = smoothNoise(
              tx * 0.21,
              ty * 0.21,
              this.seed + 6917
            );
            const grassBlend = grassPatchWave * 0.68 + grassMicroWave * 0.32;

            let baseGrassChance = 0.34;
            if (biome === BiomeType.PLAINS) {
              if (
                zone === EcologicalZone.MEADOW_CLEARING ||
                zone === EcologicalZone.OVERGROWN_SHRUBLAND
              ) {
                baseGrassChance = 0.44;
              } else if (zone === EcologicalZone.ROCKY_HIGHLANDS) {
                baseGrassChance = 0.24;
              } else {
                baseGrassChance = 0.38;
              }
            } else if (
              biome === BiomeType.FOREST ||
              biome === BiomeType.TEMPERATE_FOREST
            ) {
              baseGrassChance = 0.33;
            } else if (biome === BiomeType.TAIGA_FOREST) {
              baseGrassChance = 0.25;
            } else if (biome === BiomeType.ISLAND) {
              baseGrassChance = 0.32;
            } else if (zone === EcologicalZone.DESERT_OASIS) {
              baseGrassChance = 0.28;
            }

            const effectiveGrassChance =
              baseGrassChance * (0.45 + 0.95 * grassBlend);
            const grassRoll = hash2D(tx, ty, this.seed + 7043);

            if (grassRoll < effectiveGrassChance) {
              const tallRoll = hash2D(tx, ty, this.seed + 7129);
              const tallThreshold =
                0.28 +
                Math.max(0, grassPatchWave - 0.4) * 0.42 +
                (zone === EcologicalZone.OVERGROWN_SHRUBLAND ? 0.12 : 0);
              nodeType =
                tallRoll < tallThreshold
                  ? NatureNodeType.TALL_GRASS
                  : NatureNodeType.SHORT_GRASS;
              nodeVariant = Math.floor(hash2D(tx, ty, this.seed + 7219) * 3);
              nodeOffsetX = Math.round(
                (hash2D(tx, ty, this.seed + 7307) - 0.5) * 12
              );
              nodeOffsetY = Math.round(
                (hash2D(tx, ty, this.seed + 7393) - 0.5) * 12
              );
            }
          }
        }

        if (nodeType) {
          nodes.push(
            this.createNatureNode(
              nodeType,
              tx,
              ty,
              r,
              flowerColor,
              nodeVariant,
              nodeOffsetX,
              nodeOffsetY
            )
          );
        }
      }
    }

    const chunkData: ChunkData = {
      cx,
      cy,
      tiles,
      tileVariants,
      ecologicalZones,
      explored,
      nodes,
      structures,
    };

    // Deterministically generate realistic World Structures & Landmarks (POIs)
    this.tryGenerateChunkLandmark(chunkData);

    return chunkData;
  }

  /**
   * Generates realistic procedural World Structures & Landmarks (Camps, Watchtower Ruins,
   * Solar Shrines, Caravan Oases, Coastal Piers, Primordial Sanctuaries) in qualifying v2 chunks.
   */
  /**
   * Deterministic rare village layout resolver using 8x8 chunk super-regions (64 chunks per region).
   * Supports two distinct village generation modes:
   * 1. Vila Independente (single standalone rare village)
   * 2. Vilas Vizinhas (2 neighboring villages generated in adjacent chunks and connected plaza-to-plaza by a Dirt Path)
   */
  private getRareVillageRoleForChunk(
    cx: number,
    cy: number
  ): {
    isVillage: boolean;
    isNeighborPair: boolean;
    roadDir: 'none' | 'east' | 'west' | 'south' | 'north';
  } {
    const REGION_SIZE = 8;
    const regX = Math.floor(cx / REGION_SIZE);
    const regY = Math.floor(cy / REGION_SIZE);

    // Villages are rare: only ~34% of 8x8 chunk super-regions contain a village
    const regionRoll = hash2D(regX, regY, this.seed + 18433);
    if (regionRoll >= 0.34) {
      return { isVillage: false, isNeighborPair: false, roadDir: 'none' };
    }

    // Pick a primary anchor chunk inside the inner [2..4, 2..4] area of the 8x8 region
    // so villages from different super-regions are always at least 5–8 chunks apart
    const localX = 2 + Math.floor(hash2D(regX, regY, this.seed + 19501) * 3);
    const localY = 2 + Math.floor(hash2D(regX, regY, this.seed + 20719) * 3);
    const anchorCx = regX * REGION_SIZE + localX;
    const anchorCy = regY * REGION_SIZE + localY;

    // Never spawn a village on or immediately adjacent to the origin chunk (0,0)
    if (Math.hypot(anchorCx, anchorCy) < 1.9) {
      return { isVillage: false, isNeighborPair: false, roadDir: 'none' };
    }

    if (!this.isChunkAllLand(anchorCx, anchorCy)) {
      return { isVillage: false, isNeighborPair: false, roadDir: 'none' };
    }

    // Decide between:
    // - Vila Independente (~62% of village regions)
    // - Vilas Vizinhas (~38% of village regions: 2 adjacent villages linked by a Dirt Path)
    const pairRoll = hash2D(regX, regY, this.seed + 22193);
    if (pairRoll < 0.38) {
      const isHorizontal = hash2D(regX, regY, this.seed + 23917) < 0.5;
      const secondCx = isHorizontal ? anchorCx + 1 : anchorCx;
      const secondCy = isHorizontal ? anchorCy : anchorCy + 1;

      if (
        Math.hypot(secondCx, secondCy) >= 1.9 &&
        this.isChunkAllLand(secondCx, secondCy)
      ) {
        if (cx === anchorCx && cy === anchorCy) {
          return {
            isVillage: true,
            isNeighborPair: true,
            roadDir: isHorizontal ? 'east' : 'south',
          };
        }
        if (cx === secondCx && cy === secondCy) {
          return {
            isVillage: true,
            isNeighborPair: true,
            roadDir: isHorizontal ? 'west' : 'north',
          };
        }
        return { isVillage: false, isNeighborPair: false, roadDir: 'none' };
      }
    }

    if (cx === anchorCx && cy === anchorCy) {
      return { isVillage: true, isNeighborPair: false, roadDir: 'none' };
    }
    return { isVillage: false, isNeighborPair: false, roadDir: 'none' };
  }

  private tryGenerateChunkLandmark(chunk: ChunkData): void {
    const { cx, cy } = chunk;
    // Never place landmarks on the origin chunk (0,0) so the player's own base spot stays clean
    if (cx === 0 && cy === 0) return;

    const villageRole = this.getRareVillageRoleForChunk(cx, cy);
    const landmarkRoll = hash2D(cx, cy, this.seed + 9421);

    const baseTx = cx * CHUNK_SIZE;
    const baseTy = cy * CHUNK_SIZE;
    const centerLx = 8;
    const centerLy = 8;
    const centerIdx = centerLy * CHUNK_SIZE + centerLx;
    const centerBiome = chunk.tiles[centerIdx];
    const centerZone =
      chunk.ecologicalZones?.[centerIdx] ?? EcologicalZone.MEADOW_CLEARING;
    const chunkDist = Math.hypot(cx, cy);

    // Helper to check if a local box [minLx..maxLx, minLy..maxLy] is all land
    const isBoxAllLand = (
      minLx: number,
      minLy: number,
      maxLx: number,
      maxLy: number
    ): boolean => {
      for (let ly = minLy; ly <= maxLy; ly++) {
        for (let lx = minLx; lx <= maxLx; lx++) {
          if (chunk.tiles[ly * CHUNK_SIZE + lx] === BiomeType.OCEAN) {
            return false;
          }
        }
      }
      return true;
    };

    // Helper to clear nature nodes in a local box so structures aren't blocked by trees/rocks
    const clearNodesInBox = (
      minLx: number,
      minLy: number,
      maxLx: number,
      maxLy: number
    ) => {
      const minTx = baseTx + minLx;
      const maxTx = baseTx + maxLx;
      const minTy = baseTy + minLy;
      const maxTy = baseTy + maxLy;
      for (let i = chunk.nodes.length - 1; i >= 0; i--) {
        const n = chunk.nodes[i];
        if (
          n.tileX >= minTx &&
          n.tileX <= maxTx &&
          n.tileY >= minTy &&
          n.tileY <= maxTy
        ) {
          chunk.nodes.splice(i, 1);
        }
      }
    };

    // Helper to add a structure inside the chunk using authoritative CONSTRUCTION_BLUEPRINTS
    const addStruct = (
      lx: number,
      ly: number,
      type: PlaceableType,
      itemId: string,
      lootItems?: { itemId: string; count: number }[],
      landmarkName?: string,
      villageId?: string,
      orientation: 'auto' | 'horizontal' | 'vertical' = 'auto'
    ) => {
      const tx = baseTx + lx;
      const ty = baseTy + ly;
      const bp = CONSTRUCTION_BLUEPRINTS[type];
      const solid = bp ? bp.hasHitbox : false;
      const lightRadius = bp ? bp.lightRadius : 0;
      const maxHp = bp ? bp.maxHp : 100;

      let storageSlots: (InventorySlot | null)[] | undefined;
      if (type === PlaceableType.CHEST) {
        storageSlots = new Array(CHEST_STORAGE_SIZE).fill(null);
        if (lootItems && lootItems.length > 0) {
          for (let i = 0; i < Math.min(lootItems.length, CHEST_STORAGE_SIZE); i++) {
            storageSlots[i] = {
              itemId: lootItems[i].itemId,
              count: lootItems[i].count,
            };
          }
        }
      }

      let stallSlots: (MarketStallSlot | null)[] | undefined;
      if (type === PlaceableType.MARKET_STALL) {
        stallSlots = new Array(MARKET_STALL_SIZE).fill(null);
        const defaultGoods: Array<{ itemId: string; count: number }> = [
          { itemId: 'healing_salve', count: 3 },
          { itemId: 'rope', count: 4 },
          { itemId: 'apple', count: 6 },
          { itemId: 'saddle', count: 1 },
          { itemId: 'iron_bar', count: 3 },
          { itemId: 'torch', count: 5 },
        ];
        for (let i = 0; i < Math.min(defaultGoods.length, MARKET_STALL_SIZE); i++) {
          const g = defaultGoods[i];
          stallSlots[i] = {
            itemId: g.itemId,
            count: g.count,
            unitPrice: Math.max(1, getItemBasePrice(g.itemId)),
            enabled: true,
          };
        }
      }

      const createdStruct: PlacedStructure = {
        id: `world_struct_${tx}_${ty}_${type}`,
        type,
        itemId,
        tileX: tx,
        tileY: ty,
        hp: maxHp,
        maxHp,
        solid,
        isBridge: type === PlaceableType.WOOD_BRIDGE,
        isOpen: false,
        orientation,
        lightRadius,
        hitFlashTimer: 0,
        lootItems,
        storageSlots,
        stallSlots,
        customName: landmarkName,
        landmarkName,
        villageId,
        ownerType:
          type === PlaceableType.MARKET_STALL ||
          ((type === PlaceableType.VILLAGE_HOUSE || type === PlaceableType.BED) &&
            Boolean(villageId))
            ? 'VILLAGER'
            : undefined,
        ownerName:
          type === PlaceableType.MARKET_STALL
            ? 'Mercador da Vila'
            : (type === PlaceableType.VILLAGE_HOUSE || type === PlaceableType.BED) &&
              Boolean(villageId)
            ? 'Moradores da Vila'
            : undefined,
        stallOpen:
          type === PlaceableType.MARKET_STALL ? true : undefined,
        ownerSleeping: false,
      };
      chunk.structures.push(createdStruct);
      return createdStruct;
    };

    // 0. FRONTIER VILLAGE / DESERT OASIS VILLAGE (Rare Independent Village or Neighboring Villages linked by Dirt Path)
    const shouldGenerateVillage =
      villageRole.isVillage && isBoxAllLand(4, 4, 12, 12);

    if (shouldGenerateVillage && centerBiome !== BiomeType.OCEAN) {
      // Ensure the full 1..14 village square is dry land and clear of trees/rocks
      for (let ly = 1; ly <= 14; ly++) {
        for (let lx = 1; lx <= 14; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if (chunk.tiles[idx] === BiomeType.OCEAN) {
            chunk.tiles[idx] = centerBiome;
          }
        }
      }
      clearNodesInBox(1, 1, 14, 14);

      const villageId = `village_${cx}_${cy}`;
      const isDesertVillage =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND;
      chunk.villageId = villageId;
      chunk.landmarkName = isDesertVillage
        ? villageRole.isNeighborPair
          ? 'Vilas Gêmeas do Oásis'
          : 'Vila Mercante do Oásis'
        : villageRole.isNeighborPair
        ? 'Vilarejos Vizinhos da Fronteira'
        : centerBiome === BiomeType.TAIGA_FOREST
        ? 'Vilarejo de Pinheiros'
        : centerBiome === BiomeType.TEMPERATE_FOREST
        ? 'Vilarejo de Carvalho Escuro'
        : 'Vilarejo de Carvalho';

      // Resolve biome-specific wood materials for village houses
      const villageWoodFloorType =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? PlaceableType.PALM_FLOOR
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? PlaceableType.DARK_OAK_FLOOR
          : centerBiome === BiomeType.TAIGA_FOREST
          ? PlaceableType.PINE_FLOOR
          : PlaceableType.WOOD_FLOOR;
      const villageWoodFloorItemId =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? 'palm_floor'
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? 'dark_oak_floor'
          : centerBiome === BiomeType.TAIGA_FOREST
          ? 'pine_floor'
          : 'wood_floor';

      const villageWoodWallType =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? PlaceableType.PALM_WALL
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? PlaceableType.DARK_OAK_WALL
          : centerBiome === BiomeType.TAIGA_FOREST
          ? PlaceableType.PINE_WALL
          : PlaceableType.WOOD_WALL;
      const villageWoodWallItemId =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? 'palm_wall'
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? 'dark_oak_wall'
          : centerBiome === BiomeType.TAIGA_FOREST
          ? 'pine_wall'
          : 'wood_wall';

      const villageWoodWindowType =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? PlaceableType.PALM_WINDOW
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? PlaceableType.DARK_OAK_WINDOW
          : centerBiome === BiomeType.TAIGA_FOREST
          ? PlaceableType.PINE_WINDOW
          : PlaceableType.WOOD_WINDOW;
      const villageWoodWindowItemId =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? 'palm_window'
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? 'dark_oak_window'
          : centerBiome === BiomeType.TAIGA_FOREST
          ? 'pine_window'
          : 'wood_window';

      const villageWoodDoorType =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? PlaceableType.PALM_DOOR
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? PlaceableType.DARK_OAK_DOOR
          : centerBiome === BiomeType.TAIGA_FOREST
          ? PlaceableType.PINE_DOOR
          : PlaceableType.WOOD_DOOR;
      const villageWoodDoorItemId =
        centerBiome === BiomeType.DESERT || centerBiome === BiomeType.ISLAND
          ? 'palm_door'
          : centerBiome === BiomeType.TEMPERATE_FOREST
          ? 'dark_oak_door'
          : centerBiome === BiomeType.TAIGA_FOREST
          ? 'pine_door'
          : 'wood_door';

      const roleNamePools: Record<NpcRole, string[]> = {
        ferreiro: [
          'Mestre Borin',
          'Ferreiro Kaelen',
          'Durgan da Forja',
          'Thrain Martelo-Forte',
        ],
        mercador: [
          'Mercadora Lyra',
          'Mercadora Selene',
          'Mercador Vaen',
          'Boticária Elara',
        ],
        anciao: [
          'Ancião Aldric',
          'Sábio Vaelen',
          'Matriarca Aurelia',
          'Oráculo Orion',
        ],
        guardiao: [
          'Capitão Thorne',
          'Sentinela Garrick',
          'Valéria Escudo-Solar',
          'Comandante Roland',
        ],
        andarilho: [
          'Andarilho Kael',
          'Peregrina Mira',
          'Viajante Doran',
          'Nômade Lyris',
        ],
      };

      const nameSeed = Math.abs(cx * 7 + cy * 13);

      // 1. Central Village Plaza & Beaten Earth Pathways around the Well at (8, 8)
      for (let ly = 6; ly <= 9; ly++) {
        for (let lx = 6; lx <= 9; lx++) {
          addStruct(
            lx,
            ly,
            PlaceableType.DIRT_PATH,
            'dirt_path',
            undefined,
            undefined,
            villageId
          );
        }
      }
      // Connecting beaten earth paths (solo batido) from the central plaza to each of the 4 houses
      const plazaPaths: Array<[number, number]> = [
        [3, 5],
        [4, 5],
        [5, 6], // To NW Blacksmith House
        [12, 5],
        [11, 5],
        [10, 6], // To NE Merchant House
        [3, 10],
        [4, 10],
        [5, 9],
        [2, 9], // To SW Elder House & Campfire
        [12, 10],
        [11, 10],
        [10, 9], // To SE Guardian House
      ];
      for (const [px, py] of plazaPaths) {
        addStruct(
          px,
          py,
          PlaceableType.DIRT_PATH,
          'dirt_path',
          undefined,
          undefined,
          villageId
        );
      }

      // Central Village Well at (8, 8)
      const wellSt = addStruct(
        8,
        8,
        PlaceableType.VILLAGE_WELL,
        'village_well',
        undefined,
        'Poço Central da Vila',
        villageId
      );

      // Helper to build a real compact 4x4 house (floor, walls, windows, door, 1-2 beds with owners, and interior station/chest)
      const buildCompactVillageHouse = (cfg: {
        houseIdx: number;
        role: NpcRole;
        houseTitle: string;
        minLx: number;
        minLy: number;
        maxLx: number;
        maxLy: number;
        floorType:
          | PlaceableType.WOOD_FLOOR
          | PlaceableType.DARK_OAK_FLOOR
          | PlaceableType.PINE_FLOOR
          | PlaceableType.PALM_FLOOR
          | PlaceableType.STONE_FLOOR
          | PlaceableType.BRICK_FLOOR;
        floorItemId: string;
        wallType:
          | PlaceableType.WOOD_WALL
          | PlaceableType.DARK_OAK_WALL
          | PlaceableType.PINE_WALL
          | PlaceableType.PALM_WALL
          | PlaceableType.STONE_WALL
          | PlaceableType.BRICK_WALL;
        wallItemId: string;
        windowType:
          | PlaceableType.WOOD_WINDOW
          | PlaceableType.DARK_OAK_WINDOW
          | PlaceableType.PINE_WINDOW
          | PlaceableType.PALM_WINDOW
          | PlaceableType.STONE_WINDOW;
        windowItemId: string;
        doorCoord: [number, number];
        windowCoords: Array<[number, number]>;
        bed1Coord: [number, number];
        bed2Coord: [number, number];
        carpetCoord?: [number, number];
      }): { primaryOwnerId: string; primaryOwnerName: string } => {
        const bedCount =
          hash2D(
            cx * 19 + cfg.houseIdx * 7,
            cy * 31 + cfg.houseIdx * 11,
            this.seed + 7103
          ) < 0.5
            ? 2
            : 1;
        const pool = roleNamePools[cfg.role];
        const primaryOwnerName = pool[(nameSeed + cfg.houseIdx * 2) % pool.length];
        const primaryOwnerId = `villager_${villageId}_${cfg.role}_0`;

        // A. Place Floor across the entire 4x4 footprint
        for (let ly = cfg.minLy; ly <= cfg.maxLy; ly++) {
          for (let lx = cfg.minLx; lx <= cfg.maxLx; lx++) {
            if (
              cfg.carpetCoord &&
              lx === cfg.carpetCoord[0] &&
              ly === cfg.carpetCoord[1]
            ) {
              addStruct(
                lx,
                ly,
                PlaceableType.ROYAL_CARPET,
                'royal_carpet',
                undefined,
                undefined,
                villageId
              );
            } else {
              addStruct(
                lx,
                ly,
                cfg.floorType,
                cfg.floorItemId,
                undefined,
                undefined,
                villageId
              );
            }
          }
        }

        // B. Place Perimeter Walls, Windows, and Biome-Specific Wooden Door
        for (let ly = cfg.minLy; ly <= cfg.maxLy; ly++) {
          for (let lx = cfg.minLx; lx <= cfg.maxLx; lx++) {
            const isBorder =
              lx === cfg.minLx ||
              lx === cfg.maxLx ||
              ly === cfg.minLy ||
              ly === cfg.maxLy;
            if (!isBorder) continue;

            let borderSt: PlacedStructure;
            if (lx === cfg.doorCoord[0] && ly === cfg.doorCoord[1]) {
              borderSt = addStruct(
                lx,
                ly,
                villageWoodDoorType,
                villageWoodDoorItemId,
                undefined,
                cfg.houseTitle,
                villageId,
                'horizontal'
              );
            } else if (
              cfg.windowCoords.some(([wx, wy]) => wx === lx && wy === ly)
            ) {
              borderSt = addStruct(
                lx,
                ly,
                cfg.windowType,
                cfg.windowItemId,
                undefined,
                cfg.houseTitle,
                villageId
              );
            } else {
              borderSt = addStruct(
                lx,
                ly,
                cfg.wallType,
                cfg.wallItemId,
                undefined,
                cfg.houseTitle,
                villageId
              );
            }
            borderSt.ownerType = 'VILLAGER';
            borderSt.ownerId = primaryOwnerId;
            borderSt.ownerName = primaryOwnerName;
            borderSt.npcRole = cfg.role;
          }
        }

        // C. Place 1 to 2 Beds inside with their respective Villager owners
        const bedCoords =
          bedCount === 2 ? [cfg.bed1Coord, cfg.bed2Coord] : [cfg.bed1Coord];
        for (let bIdx = 0; bIdx < bedCoords.length; bIdx++) {
          const [bx, by] = bedCoords[bIdx];
          const vName = pool[(nameSeed + cfg.houseIdx * 2 + bIdx) % pool.length];
          const vId = `villager_${villageId}_${cfg.role}_${bIdx}`;
          const bedSt = addStruct(
            bx,
            by,
            PlaceableType.BED,
            'bed',
            undefined,
            `Cama de ${vName} (${cfg.houseTitle})`,
            villageId,
            'horizontal'
          );
          bedSt.ownerType = 'VILLAGER';
          bedSt.ownerId = vId;
          bedSt.ownerName = vName;
          bedSt.npcRole = cfg.role;
          bedSt.isPrimaryStructureOwner = bIdx === 0;
          bedSt.ownerAssignedAt = bIdx + 1;
        }

        return { primaryOwnerId, primaryOwnerName };
      };

      // 1. CASA DO FERREIRO(A) (North-West: lx 1..4, ly 1..4) — Fornalha dentro
      buildCompactVillageHouse({
        houseIdx: 0,
        role: 'ferreiro',
        houseTitle: 'Casa do Ferreiro',
        minLx: 1,
        minLy: 1,
        maxLx: 4,
        maxLy: 4,
        floorType: PlaceableType.STONE_FLOOR,
        floorItemId: 'stone_floor',
        wallType: PlaceableType.STONE_WALL,
        wallItemId: 'stone_wall',
        windowType: PlaceableType.STONE_WINDOW,
        windowItemId: 'stone_window',
        doorCoord: [3, 4],
        windowCoords: [
          [2, 1],
          [1, 2],
        ],
        bed1Coord: [2, 2],
        bed2Coord: [2, 3],
      });
      // Furnace inside the Blacksmith's House at (3, 2)
      addStruct(
        3,
        2,
        PlaceableType.FURNACE,
        'furnace',
        undefined,
        'Fornalha do Ferreiro',
        villageId
      );

      // 2. CASA DO MERCANTE (North-East: lx 11..14, ly 1..4) — Baú restrito dentro + Tenda de Vendas na frente
      const merchantHouse = buildCompactVillageHouse({
        houseIdx: 1,
        role: 'mercador',
        houseTitle: 'Casa do Mercante',
        minLx: 11,
        minLy: 1,
        maxLx: 14,
        maxLy: 4,
        floorType: villageWoodFloorType,
        floorItemId: villageWoodFloorItemId,
        wallType: villageWoodWallType,
        wallItemId: villageWoodWallItemId,
        windowType: villageWoodWindowType,
        windowItemId: villageWoodWindowItemId,
        doorCoord: [12, 4],
        windowCoords: [
          [13, 1],
          [14, 2],
        ],
        bed1Coord: [13, 2],
        bed2Coord: [13, 3],
        carpetCoord: [12, 3],
      });
      // Restricted Chest inside the Merchant's House at (12, 2)
      addStruct(
        12,
        2,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'gold_coin', count: 8 },
          { itemId: 'healing_salve', count: 2 },
          { itemId: 'saddle', count: 1 },
        ],
        'Baú Restrito do Mercante',
        villageId
      );
      // Market Stall in front of the Merchant's House at (13, 6) over beaten earth paths
      addStruct(
        13,
        5,
        PlaceableType.DIRT_PATH,
        'dirt_path',
        undefined,
        undefined,
        villageId
      );
      addStruct(
        13,
        6,
        PlaceableType.DIRT_PATH,
        'dirt_path',
        undefined,
        undefined,
        villageId
      );
      const merchantStall = addStruct(
        13,
        6,
        PlaceableType.MARKET_STALL,
        'market_stall',
        undefined,
        'Tenda de Vendas da Vila',
        villageId
      );
      merchantStall.ownerType = 'VILLAGER';
      merchantStall.ownerId = merchantHouse.primaryOwnerId;
      merchantStall.ownerName = merchantHouse.primaryOwnerName;

      // 3. CASA DO ANCIÃO (South-West: lx 1..4, ly 11..14) — Baú da Vila dentro + Fogueira na frente
      const elderHouse = buildCompactVillageHouse({
        houseIdx: 2,
        role: 'anciao',
        houseTitle: 'Casa do Ancião',
        minLx: 1,
        minLy: 11,
        maxLx: 4,
        maxLy: 14,
        floorType: villageWoodFloorType,
        floorItemId: villageWoodFloorItemId,
        wallType: villageWoodWallType,
        wallItemId: villageWoodWallItemId,
        windowType: villageWoodWindowType,
        windowItemId: villageWoodWindowItemId,
        doorCoord: [3, 11],
        windowCoords: [
          [2, 14],
          [1, 13],
        ],
        bed1Coord: [2, 13],
        bed2Coord: [2, 12],
        carpetCoord: [3, 12],
      });
      // Em vilas geradas naturalmente, apenas o Ancião é o líder da vila e dono do Poço Central
      wellSt.ownerType = 'VILLAGER';
      wellSt.ownerId = elderHouse.primaryOwnerId;
      wellSt.ownerName = elderHouse.primaryOwnerName;
      wellSt.npcRole = 'anciao';
      // Village Chest inside the Elder's House at (3, 13)
      addStruct(
        3,
        13,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'gold_coin', count: 6 },
          { itemId: 'iron_bar', count: 3 },
          { itemId: 'warrior_feast', count: 1 },
          { itemId: 'healing_salve', count: 2 },
        ],
        'Baú da Vila (Casa do Ancião)',
        villageId
      );
      // Campfire in front of the Elder's House at (2, 9)
      addStruct(
        2,
        9,
        PlaceableType.CAMPFIRE,
        'campfire',
        undefined,
        'Fogueira da Casa do Ancião',
        villageId
      );

      // 4. CASA DO GUARDIÃO (South-East: lx 11..14, ly 11..14) — Mesa de Trabalho dentro
      buildCompactVillageHouse({
        houseIdx: 3,
        role: 'guardiao',
        houseTitle: 'Casa do Guardião',
        minLx: 11,
        minLy: 11,
        maxLx: 14,
        maxLy: 14,
        floorType: PlaceableType.STONE_FLOOR,
        floorItemId: 'stone_floor',
        wallType: PlaceableType.STONE_WALL,
        wallItemId: 'stone_wall',
        windowType: PlaceableType.STONE_WINDOW,
        windowItemId: 'stone_window',
        doorCoord: [12, 11],
        windowCoords: [
          [13, 14],
          [14, 13],
        ],
        bed1Coord: [13, 13],
        bed2Coord: [13, 12],
      });
      // Workbench inside the Guardian's House at (12, 13)
      addStruct(
        12,
        13,
        PlaceableType.WORKBENCH,
        'workbench',
        undefined,
        'Mesa de Trabalho do Guardião',
        villageId
      );

      // Plaza Lanterns & Banners around the central Well
      addStruct(6, 6, PlaceableType.IRON_LANTERN, 'iron_lantern', undefined, undefined, villageId);
      addStruct(9, 6, PlaceableType.IRON_LANTERN, 'iron_lantern', undefined, undefined, villageId);
      addStruct(6, 9, PlaceableType.IRON_LANTERN, 'iron_lantern', undefined, undefined, villageId);
      addStruct(9, 9, PlaceableType.IRON_LANTERN, 'iron_lantern', undefined, undefined, villageId);

      // If this village is part of a "Vilas Vizinhas" pair, connect the two neighboring villages' central plazas
      // with a 2-tile-wide beaten earth road (PlaceableType.DIRT_PATH) across the shared chunk border!
      if (villageRole.isNeighborPair && villageRole.roadDir !== 'none') {
        const placeRoadTile = (rx: number, ry: number) => {
          const rIdx = ry * CHUNK_SIZE + rx;
          if (chunk.tiles[rIdx] === BiomeType.OCEAN) {
            chunk.tiles[rIdx] = centerBiome;
          }
          clearNodesInBox(rx, ry, rx, ry);
          addStruct(
            rx,
            ry,
            PlaceableType.DIRT_PATH,
            'dirt_path',
            undefined,
            undefined,
            villageId
          );
        };

        if (villageRole.roadDir === 'east') {
          for (let lx = 10; lx <= 15; lx++) {
            placeRoadTile(lx, 7);
            placeRoadTile(lx, 8);
          }
        } else if (villageRole.roadDir === 'west') {
          for (let lx = 0; lx <= 5; lx++) {
            placeRoadTile(lx, 7);
            placeRoadTile(lx, 8);
          }
        } else if (villageRole.roadDir === 'south') {
          for (let ly = 10; ly <= 15; ly++) {
            placeRoadTile(7, ly);
            placeRoadTile(8, ly);
          }
        } else if (villageRole.roadDir === 'north') {
          for (let ly = 0; ly <= 5; ly++) {
            placeRoadTile(7, ly);
            placeRoadTile(8, ly);
          }
        }
      }
      return;
    }

    if (villageRole.isVillage) return;

    // 1. COASTAL PIER (Píer dos Navegadores)
    // Only generated in the Sea or Large Lakes, and ONLY when there is a Village nearby (within 3 chunks)!
    let hasNearbyVillage = false;
    for (let vdy = -3; vdy <= 3 && !hasNearbyVillage; vdy++) {
      for (let vdx = -3; vdx <= 3; vdx++) {
        if (vdx === 0 && vdy === 0) continue;
        if (this.getRareVillageRoleForChunk(cx + vdx, cy + vdy).isVillage) {
          hasNearbyVillage = true;
          break;
        }
      }
    }

    if (hasNearbyVillage && centerBiome !== BiomeType.OCEAN && landmarkRoll < 0.35) {
      for (let ly = 5; ly <= 10; ly++) {
        for (let lx = 4; lx <= 9; lx++) {
          const t0 = chunk.tiles[ly * CHUNK_SIZE + lx];
          const t1 = chunk.tiles[ly * CHUNK_SIZE + (lx + 1)];
          const t2 = chunk.tiles[ly * CHUNK_SIZE + (lx + 2)];
          const t3 = chunk.tiles[ly * CHUNK_SIZE + (lx + 3)];
          if (
            t0 !== BiomeType.OCEAN &&
            t1 === BiomeType.OCEAN &&
            t2 === BiomeType.OCEAN &&
            t3 === BiomeType.OCEAN
          ) {
            // Verify that the water body is either the Sea ('ocean') or a Large Lake ('lake' with wide open water expanse, never a river)
            const h1 = this.getHydrologyAtTile(baseTx + lx + 1, baseTy + ly);
            const h2 = this.getHydrologyAtTile(baseTx + lx + 2, baseTy + ly);
            const h3 = this.getHydrologyAtTile(baseTx + lx + 3, baseTy + ly);
            const isSea =
              h1.waterKind === 'ocean' ||
              h2.waterKind === 'ocean' ||
              h3.waterKind === 'ocean';
            let isLargeLake =
              !isSea &&
              h1.waterKind === 'lake' &&
              h2.waterKind === 'lake' &&
              h3.waterKind === 'lake';
            if (isLargeLake) {
              // Confirm the lake is genuinely large (extends at least 6 tiles out and 5 tiles vertically)
              for (let checkDx = 4; checkDx <= 6; checkDx++) {
                const hk = this.getHydrologyAtTile(
                  baseTx + lx + checkDx,
                  baseTy + ly
                );
                if (hk.waterKind !== 'lake') {
                  isLargeLake = false;
                  break;
                }
              }
              if (isLargeLake) {
                const hkNorth = this.getHydrologyAtTile(
                  baseTx + lx + 3,
                  baseTy + ly - 2
                );
                const hkSouth = this.getHydrologyAtTile(
                  baseTx + lx + 3,
                  baseTy + ly + 2
                );
                if (hkNorth.waterKind !== 'lake' || hkSouth.waterKind !== 'lake') {
                  isLargeLake = false;
                }
              }
            }

            if (!isSea && !isLargeLake) {
              continue;
            }

            clearNodesInBox(lx - 1, ly - 1, lx + 4, ly + 1);
            chunk.landmarkName = 'Píer dos Navegadores';
            addStruct(lx, ly - 1, PlaceableType.WOOD_BRIDGE, 'wood_bridge');
            addStruct(lx, ly, PlaceableType.WOOD_BRIDGE, 'wood_bridge');
            addStruct(lx, ly + 1, PlaceableType.WOOD_BRIDGE, 'wood_bridge');
            addStruct(lx, ly - 1, PlaceableType.IRON_LANTERN, 'iron_lantern');
            addStruct(
              lx,
              ly + 1,
              PlaceableType.CHEST,
              'chest',
              [
                { itemId: 'coconut', count: 3 },
                { itemId: 'wood_bridge', count: 6 },
                { itemId: 'wool_bandage', count: 2 },
                ...(chunkDist >= 2.2
                  ? [{ itemId: 'abyssal_pearl', count: 1 }]
                  : [{ itemId: 'taming_treat', count: 1 }]),
              ],
              'Baú dos Navegadores'
            );
            addStruct(lx + 1, ly, PlaceableType.WOOD_BRIDGE, 'wood_bridge');
            addStruct(lx + 2, ly, PlaceableType.WOOD_BRIDGE, 'wood_bridge');
            addStruct(lx + 3, ly, PlaceableType.WOOD_BRIDGE, 'wood_bridge');
            if (chunkDist >= 1.8) {
              chunk.nodes.push(
                this.createNatureNode(
                  NatureNodeType.PEARL_CLAM,
                  baseTx + lx + 3,
                  baseTy + ly + 1,
                  0.5
                )
              );
            }
            return;
          }
        }
      }
    }

    // =========================================================================
    // ULTRA-RARE NON-VILLAGE LANDMARK GATE
    // Only 1 candidate chunk per 7x7 chunk super-region (49 chunks), and only ~22% of those
    // regions actually spawn a landmark (~1 landmark per ~220 chunks), keeping the world wild and uncrowded.
    // =========================================================================
    const LANDMARK_REGION_SIZE = 7;
    const regX = Math.floor(cx / LANDMARK_REGION_SIZE);
    const regY = Math.floor(cy / LANDMARK_REGION_SIZE);
    const regionSpawnRoll = hash2D(regX, regY, this.seed + 19421);
    if (regionSpawnRoll >= 0.22) return;

    const candCx =
      regX * LANDMARK_REGION_SIZE +
      1 +
      Math.floor(hash2D(regX, regY, this.seed + 19753) * (LANDMARK_REGION_SIZE - 2));
    const candCy =
      regY * LANDMARK_REGION_SIZE +
      1 +
      Math.floor(hash2D(regX, regY, this.seed + 20117) * (LANDMARK_REGION_SIZE - 2));
    if (cx !== candCx || cy !== candCy) return;

    // Never place a wilderness landmark right next to a village
    for (let vdy = -2; vdy <= 2; vdy++) {
      for (let vdx = -2; vdx <= 2; vdx++) {
        if (this.getRareVillageRoleForChunk(cx + vdx, cy + vdy).isVillage) {
          return;
        }
      }
    }

    if (!isBoxAllLand(5, 5, 11, 11)) return;

    const typeRoll = hash2D(cx, cy, this.seed + 20899);

    // 2. PRIMORDIAL GROVE SHRINE (Santuário Primordial) — Very rare distant Ancient Grove in Plains
    if (
      centerBiome === BiomeType.PLAINS &&
      centerZone === EcologicalZone.ANCIENT_GROVE &&
      chunkDist >= 3.2 &&
      typeRoll < 0.28
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Santuário Primordial';
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) <= 1 || Math.abs(dy) <= 1 || (Math.abs(dx) === 2 && Math.abs(dy) === 2)) {
            addStruct(8 + dx, 8 + dy, PlaceableType.STONE_FLOOR, 'stone_floor');
          }
        }
      }
      addStruct(8, 7, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(8, 9, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(6, 6, PlaceableType.STONE_WALL, 'stone_wall');
      addStruct(10, 6, PlaceableType.STONE_WALL, 'stone_wall');
      addStruct(7, 6, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(9, 6, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(6, 10, PlaceableType.HEALING_FOUNTAIN, 'healing_fountain');
      addStruct(
        10,
        10,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'primordial_essence', count: 2 },
          { itemId: 'hardwood', count: 6 },
          { itemId: 'warrior_feast', count: 1 },
          { itemId: 'recall_crystal', count: 1 },
        ],
        'Arca do Bosque Primordial'
      );
      chunk.nodes.push(
        this.createNatureNode(
          NatureNodeType.ANCIENT_WORLD_TREE,
          baseTx + 8,
          baseTy + 8,
          0.2
        )
      );
      return;
    }

    // 2B. GOLEM MONOLITH CIRCLE (Círculo Rúnico dos Golens) — Rocky Highlands & Crystal Badlands
    if (
      chunkDist >= 2.5 &&
      (centerZone === EcologicalZone.ROCKY_HIGHLANDS ||
        centerZone === EcologicalZone.CRYSTAL_BADLANDS) &&
      typeRoll < 0.25
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Círculo Rúnico dos Golens';
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
            addStruct(8 + dx, 8 + dy, PlaceableType.BRICK_FLOOR, 'brick_floor');
          } else if (Math.abs(dx) === 2 && Math.abs(dy) === 2) {
            addStruct(8 + dx, 8 + dy, PlaceableType.STONE_FLOOR, 'stone_floor');
          }
        }
      }
      addStruct(8, 8, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(6, 6, PlaceableType.STONE_WALL, 'stone_wall');
      addStruct(10, 6, PlaceableType.STONE_WALL, 'stone_wall');
      addStruct(6, 10, PlaceableType.STONE_WALL, 'stone_wall');
      addStruct(10, 10, PlaceableType.STONE_WALL, 'stone_wall');
      addStruct(7, 6, PlaceableType.STONE_WINDOW, 'stone_window');
      addStruct(9, 6, PlaceableType.STONE_WINDOW, 'stone_window');
      addStruct(8, 6, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(8, 10, PlaceableType.TORCH, 'torch');
      addStruct(
        8,
        8,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'golem_core', count: 2 },
          { itemId: 'iron_bar', count: 3 },
          { itemId: 'solar_crystal', count: 2 },
          { itemId: 'gold_coin', count: 3 },
        ],
        'Arca Monolítica dos Golens'
      );
      chunk.nodes.push(
        this.createNatureNode(
          NatureNodeType.IRON_OUTCROP,
          baseTx + 6,
          baseTy + 8,
          0.4
        )
      );
      return;
    }

    // 2C. BANDIT RAIDER STRONGHOLD (Reduto dos Saqueadores) — Fortified wooden palisade camp
    if (
      chunkDist >= 2.2 &&
      (centerZone === EcologicalZone.OVERGROWN_SHRUBLAND ||
        centerZone === EcologicalZone.DENSE_WOODLAND ||
        centerZone === EcologicalZone.CACTUS_SCRUBLAND) &&
      typeRoll >= 0.25 &&
      typeRoll < 0.48
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Reduto dos Saqueadores';
      for (let ly = 6; ly <= 10; ly++) {
        for (let lx = 6; lx <= 10; lx++) {
          addStruct(lx, ly, PlaceableType.WOOD_FLOOR, 'wood_floor');
        }
      }
      // Wooden Palisade Perimeter with Windows, South Wood Door & Spike Trap
      const palisade = [
        [6, 6],
        [7, 6],
        [8, 6],
        [9, 6],
        [10, 6],
        [6, 7],
        [10, 7],
        [6, 9],
        [10, 9],
        [6, 10],
        [7, 10],
        [9, 10],
        [10, 10],
      ];
      for (const [wx, wy] of palisade) {
        addStruct(wx, wy, PlaceableType.WOOD_WALL, 'wood_wall');
      }
      addStruct(6, 8, PlaceableType.WOOD_WINDOW, 'wood_window');
      addStruct(10, 8, PlaceableType.WOOD_WINDOW, 'wood_window');
      addStruct(8, 10, PlaceableType.WOOD_DOOR, 'wood_door', undefined, undefined, undefined, 'horizontal');
      addStruct(8, 10, PlaceableType.SPIKE_TRAP, 'spike_trap');
      addStruct(7, 11, PlaceableType.ROYAL_BANNER, 'royal_banner');
      addStruct(9, 11, PlaceableType.TORCH, 'torch');
      addStruct(8, 8, PlaceableType.CAMPFIRE, 'campfire');
      addStruct(7, 7, PlaceableType.EXPLORER_TENT, 'explorer_tent');
      addStruct(
        9,
        7,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'gold_coin', count: 6 },
          { itemId: 'iron_bar', count: 2 },
          { itemId: 'fire_bomb', count: 2 },
          { itemId: 'wool_bandage', count: 3 },
        ],
        'Espólio dos Saqueadores'
      );
      return;
    }

    // 3. WATCHTOWER RUINS (Ruínas da Torre de Vigia) — Plains Highlands / Forests (chunkDist >= 2.4)
    if (
      (centerBiome === BiomeType.PLAINS ||
        centerBiome === BiomeType.FOREST ||
        centerBiome === BiomeType.TEMPERATE_FOREST ||
        centerBiome === BiomeType.TAIGA_FOREST) &&
      chunkDist >= 2.4 &&
      typeRoll >= 0.48 &&
      typeRoll < 0.72
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Ruínas da Torre de Vigia';
      // Cobblestone & Brick floor courtyard
      for (let ly = 6; ly <= 10; ly++) {
        for (let lx = 6; lx <= 10; lx++) {
          if (lx >= 7 && lx <= 9 && ly >= 7 && ly >= 9) {
            addStruct(lx, ly, PlaceableType.BRICK_FLOOR, 'brick_floor');
          } else if ((lx + ly) % 2 === 0 || ly === 10 || ly === 6) {
            addStruct(lx, ly, PlaceableType.STONE_FLOOR, 'stone_floor');
          }
        }
      }
      // Medieval stone walls with arrow-slit windows and South Iron Gate
      const wallCoords = [
        [6, 6],
        [7, 6],
        [9, 6],
        [10, 6],
        [6, 7],
        [10, 7],
        [6, 9],
        [6, 10],
        [7, 10],
        [9, 10],
        [10, 10],
      ];
      for (const [wx, wy] of wallCoords) {
        addStruct(wx, wy, PlaceableType.STONE_WALL, 'stone_wall');
      }
      addStruct(6, 8, PlaceableType.STONE_WINDOW, 'stone_window');
      addStruct(8, 10, PlaceableType.IRON_GATE, 'iron_gate', undefined, undefined, undefined, 'horizontal');
      addStruct(8, 10, PlaceableType.SPIKE_TRAP, 'spike_trap');
      addStruct(8, 6, PlaceableType.FURNACE, 'furnace');
      addStruct(9, 9, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(
        7,
        7,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'iron_ore', count: 4 },
          { itemId: 'iron_bar', count: 2 },
          { itemId: 'healing_salve', count: 2 },
          { itemId: 'flint', count: 5 },
        ],
        'Baú da Fortaleza em Ruínas'
      );
      return;
    }

    // 4. ABANDONED EXPLORER CAMP (Acampamento de Explorador) — Rare camp in Plains/Forests
    if (
      (centerBiome === BiomeType.PLAINS ||
        centerBiome === BiomeType.FOREST ||
        centerBiome === BiomeType.TEMPERATE_FOREST ||
        centerBiome === BiomeType.TAIGA_FOREST) &&
      typeRoll >= 0.72
    ) {
      clearNodesInBox(6, 6, 10, 10);
      chunk.landmarkName = 'Acampamento de Explorador';
      for (let ly = 7; ly <= 9; ly++) {
        for (let lx = 7; lx <= 9; lx++) {
          addStruct(lx, ly, PlaceableType.WOOD_FLOOR, 'wood_floor');
        }
      }
      addStruct(6, 7, PlaceableType.WOOD_FENCE, 'wood_fence');
      addStruct(6, 8, PlaceableType.WOOD_FENCE, 'wood_fence');
      addStruct(8, 8, PlaceableType.CAMPFIRE, 'campfire');
      addStruct(7, 7, PlaceableType.EXPLORER_TENT, 'explorer_tent');
      addStruct(9, 7, PlaceableType.WORKBENCH, 'workbench');
      addStruct(7, 9, PlaceableType.TORCH, 'torch');
      addStruct(
        9,
        9,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'apple', count: 3 },
          { itemId: 'wool_bandage', count: 2 },
          { itemId: 'taming_treat', count: 1 },
          { itemId: 'torch', count: 3 },
          { itemId: 'wood', count: 8 },
        ],
        'Baú do Acampamento'
      );
      return;
    }

    // 5. DESERT SUN SHRINE (Santuário Solar Antigo) — Rare Desert Badlands / Deep Desert
    if (
      centerBiome === BiomeType.DESERT &&
      chunkDist >= 2.6 &&
      typeRoll < 0.38
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Santuário Solar Antigo';
      for (let ly = 6; ly <= 10; ly++) {
        for (let lx = 6; lx <= 10; lx++) {
          if (lx >= 7 && lx <= 9 && ly >= 7 && ly >= 9) {
            addStruct(lx, ly, PlaceableType.BRICK_FLOOR, 'brick_floor');
          } else {
            addStruct(lx, ly, PlaceableType.STONE_FLOOR, 'stone_floor');
          }
        }
      }
      addStruct(8, 8, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(8, 9, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(6, 6, PlaceableType.BRICK_WALL, 'brick_wall');
      addStruct(10, 6, PlaceableType.BRICK_WALL, 'brick_wall');
      addStruct(6, 10, PlaceableType.BRICK_WALL, 'brick_wall');
      addStruct(10, 10, PlaceableType.BRICK_WALL, 'brick_wall');
      addStruct(6, 8, PlaceableType.STONE_WINDOW, 'stone_window');
      addStruct(10, 8, PlaceableType.STONE_WINDOW, 'stone_window');
      addStruct(7, 6, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(9, 6, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(8, 7, PlaceableType.SOLAR_ALTAR, 'solar_altar');
      addStruct(
        8,
        9,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'solar_crystal', count: 3 },
          { itemId: 'fire_bomb', count: 2 },
          { itemId: 'coconut_elixir', count: 2 },
          ...(chunkDist >= 2.8 ? [{ itemId: 'astral_shard', count: 1 }] : []),
        ],
        'Relicário do Templo Solar'
      );
      return;
    }

    // 6. DESERT CARAVAN POST (Posto de Caravana do Deserto — rare inland desert outpost)
    if (
      centerBiome === BiomeType.DESERT &&
      centerZone !== EcologicalZone.COASTAL_TROPICS &&
      typeRoll >= 0.65
    ) {
      clearNodesInBox(6, 6, 10, 10);
      chunk.landmarkName = 'Posto da Caravana';
      for (let ly = 7; ly <= 9; ly++) {
        for (let lx = 7; lx <= 9; lx++) {
          addStruct(lx, ly, PlaceableType.PALM_FLOOR, 'palm_floor');
        }
      }
      addStruct(9, 8, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(9, 9, PlaceableType.ROYAL_CARPET, 'royal_carpet');
      addStruct(7, 9, PlaceableType.WOOD_FENCE, 'wood_fence');
      addStruct(8, 8, PlaceableType.CAMPFIRE, 'campfire');
      addStruct(7, 7, PlaceableType.EXPLORER_TENT, 'explorer_tent');
      addStruct(9, 7, PlaceableType.IRON_LANTERN, 'iron_lantern');
      addStruct(
        9,
        9,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'cactus_fruit', count: 4 },
          { itemId: 'coconut', count: 3 },
          { itemId: 'coconut_elixir', count: 1 },
          { itemId: 'taming_treat', count: 2 },
        ],
        'Baú do Mercador do Deserto'
      );
      chunk.nodes.push(
        this.createNatureNode(NatureNodeType.PALM_TREE, baseTx + 6, baseTy + 8, 0.3)
      );
    }
  }

  public static isPassableGroundNode(type: NatureNodeType): boolean {
    return (
      type === NatureNodeType.BERRY_BUSH ||
      type === NatureNodeType.SAND_DUNE ||
      type === NatureNodeType.SHORT_GRASS ||
      type === NatureNodeType.TALL_GRASS ||
      type === NatureNodeType.FLOWER_TULIP ||
      type === NatureNodeType.FLOWER_LILY ||
      type === NatureNodeType.FLOWER_SUNFLOWER ||
      type === NatureNodeType.FLOWER_SOLAR_DROP
    );
  }

  /**
   * Resolves the predominant color of a flower at (tx, ty) using a low-frequency 2D Perlin wave
   * so that each flowerbed patch has a single dominant color that smoothly shifts across space.
   */
  public resolveFlowerColorForSpecies(
    species: NatureNodeType,
    tx: number,
    ty: number
  ): ClothingColorId {
    if (
      species === NatureNodeType.FLOWER_SUNFLOWER ||
      species === NatureNodeType.FLOWER_SOLAR_DROP
    ) {
      return 'amarelo';
    }
    const palette =
      species === NatureNodeType.FLOWER_LILY
        ? LILY_FLOWER_COLORS
        : TULIP_FLOWER_COLORS;
    // Low-frequency Perlin wave creates large contiguous color regions within a flowerbed
    const wave = (perlin2D(tx * 0.042, ty * 0.042, this.seed + 4517) + 1) * 0.5;
    // Tiny local jitter (±0.025) keeps ~90%+ of a patch the exact same predominant color
    const jitter = (hash2D(tx, ty, this.seed + 4591) - 0.5) * 0.05;
    const clamped = Math.max(0, Math.min(0.9999, wave + jitter));
    const idx = Math.floor(clamped * palette.length);
    return palette[idx] || 'branco';
  }

  /**
   * Minecraft-inspired hierarchical Flower Generator:
   * 1. Governed first by Biome & Temperature (including 5% Gota Solar across ANY land biome).
   * 2. Spatial layout & density controlled by 2D Gradient Perlin Noise (`perlin2D`):
   *    - Peaks of the wave spawn one species (Tulipa or Girassol in warm sunny meadows),
   *    - Valleys of the wave spawn another species (Lírio-do-Vale),
   *    - Transitions near zero remain open grass.
   * 3. Within each flowerbed patch, color variety is low: one color dominates and transitions smoothly further ahead.
   */
  private resolveFlowerAtTile(
    tx: number,
    ty: number,
    biome: BiomeType,
    zone: EcologicalZone,
    forceSpawn: boolean
  ): { type: NatureNodeType; flowerColor: ClothingColorId } | null {
    if (biome === BiomeType.OCEAN) return null;

    // 2D Perlin wave that forms invisible hills/valleys for flowerbed patches
    const patchWave = perlin2D(tx * 0.085, ty * 0.085, this.seed + 4337);
    const speciesWave = perlin2D(tx * 0.055, ty * 0.055, this.seed + 4229);
    const tempWave = perlin2D(tx * 0.028, ty * 0.028, this.seed + 4111);

    if (!forceSpawn) {
      const absWave = Math.abs(patchWave);
      // Transitions between peaks and valleys remain open ground
      const minWaveThreshold =
        biome === BiomeType.DESERT
          ? 0.48
          : zone === EcologicalZone.MEADOW_CLEARING ||
            zone === EcologicalZone.OVERGROWN_SHRUBLAND
          ? 0.34
          : 0.41;
      if (absWave < minWaveThreshold) {
        return null;
      }

      const intensity =
        (absWave - minWaveThreshold) / (1 - minWaveThreshold);
      const densityRoll = hash2D(tx, ty, this.seed + 5449);
      const maxDensity =
        biome === BiomeType.DESERT
          ? 0.12
          : zone === EcologicalZone.MEADOW_CLEARING
          ? 0.28
          : 0.22;
      if (densityRoll > intensity * maxDensity) {
        return null;
      }
    }

    // Gota Solar: 5% chance to be the generated flower in ANY land biome (Plains, Desert, Island)
    const solarRoll = hash2D(tx, ty, this.seed + 5779);
    if (solarRoll < 0.05) {
      return {
        type: NatureNodeType.FLOWER_SOLAR_DROP,
        flowerColor: 'amarelo',
      };
    }

    // In Desert outside of Oasis, only Gota Solar (above) or oasis-edge flowers appear
    if (
      biome === BiomeType.DESERT &&
      zone !== EcologicalZone.DESERT_OASIS &&
      !forceSpawn
    ) {
      return null;
    }

    // Determine species from Biome + Temperature + Perlin wave crest/valley:
    // - Peak of wave in warm/open meadows -> Girassol or Tulipa
    // - Valley of wave -> Lírio-do-Vale
    let species: NatureNodeType;
    if (
      patchWave > 0.22 &&
      tempWave > 0.18 &&
      speciesWave > 0.24 &&
      (zone === EcologicalZone.MEADOW_CLEARING ||
        zone === EcologicalZone.COASTAL_TROPICS ||
        zone === EcologicalZone.DESERT_OASIS)
    ) {
      species = NatureNodeType.FLOWER_SUNFLOWER;
    } else if (patchWave >= 0) {
      species = NatureNodeType.FLOWER_TULIP;
    } else {
      species = NatureNodeType.FLOWER_LILY;
    }

    const flowerColor = this.resolveFlowerColorForSpecies(species, tx, ty);
    return { type: species, flowerColor };
  }

  private createNatureNode(
    nodeType: NatureNodeType,
    tx: number,
    ty: number,
    r: number,
    flowerColor?: ClothingColorId,
    variant?: number,
    offsetX?: number,
    offsetY?: number
  ): NatureNode {
    const bp = NATURE_BLUEPRINTS[nodeType];
    const isGrass =
      nodeType === NatureNodeType.SHORT_GRASS ||
      nodeType === NatureNodeType.TALL_GRASS;
    return {
      id: `node_${tx}_${ty}`,
      type: nodeType,
      tileX: tx,
      tileY: ty,
      hp: bp.maxHp,
      maxHp: bp.maxHp,
      rarity: bp.rarity,
      requiredTool: bp.requiredTool,
      requiredTier: bp.requiredTier,
      hitFlashTimer: 0,
      animOffset: isGrass ? 0 : Math.floor(r * 10),
      flowerColor:
        flowerColor ??
        (nodeType === NatureNodeType.FLOWER_TULIP ||
        nodeType === NatureNodeType.FLOWER_LILY ||
        nodeType === NatureNodeType.FLOWER_SUNFLOWER ||
        nodeType === NatureNodeType.FLOWER_SOLAR_DROP
          ? this.resolveFlowerColorForSpecies(nodeType, tx, ty)
          : undefined),
      variant:
        variant ??
        (nodeType === NatureNodeType.PINE_TREE
          ? Math.abs(tx * 31 + ty * 17) % 2
          : isGrass
          ? Math.abs(tx * 19 + ty * 29) % 3
          : undefined),
      offsetX,
      offsetY,
    };
  }

  public getBiomeAtWorld(wx: number, wy: number): BiomeType {
    const { tx, ty } = this.worldToTile(wx, wy);
    return this.getTileBiomeFast(tx, ty);
  }

  public revealAround(wx: number, wy: number, radiusTiles = 9): ChunkData[] {
    const center = this.worldToTile(wx, wy);
    const r2 = radiusTiles * radiusTiles;
    const touchedChunks = new Set<ChunkData>();
    const newlyDiscoveredIslandChunks = new Set<ChunkData>();
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const tx = center.tx + dx;
          const ty = center.ty + dy;
          const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
          const chunk = this.getOrCreateChunk(cx, cy);
          const tileIdx = ly * CHUNK_SIZE + lx;
          const wasExplored = chunk.explored[tileIdx] === 1;
          if (!wasExplored) {
            chunk.explored[tileIdx] = 1;
            touchedChunks.add(chunk);
            if (
              !chunk.islandMobsPopulated &&
              chunk.tiles[tileIdx] === BiomeType.ISLAND
            ) {
              newlyDiscoveredIslandChunks.add(chunk);
            }
          }
        }
      }
    }
    // Lock terrain snapshot and update compactExplored bitmask ONLY on chunks that actually had new tiles revealed
    for (const chunk of touchedChunks) {
      chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
      if (!chunk.preserved) {
        WorldManager.lockChunkTerrainSnapshot(
          chunk,
          chunk.genVersion ?? this.worldGenVersion,
          chunk.generatedGameVersion ?? GAME_VERSION
        );
      } else {
        const encodedExplored = WorldManager.encodeCompactExplored(
          chunk.explored
        );
        if (encodedExplored) {
          chunk.compactExplored = encodedExplored;
        }
      }
    }
    return Array.from(newlyDiscoveredIslandChunks);
  }

  /**
   * Finds a natural, valid initial spawn point for the player on a new world without molding
   * or altering the surrounding biome (no forced circular Plains clearing).
   * Guarantees the player spawns on solid dry land with a walkable neighborhood and zero
   * collision overlap with physical world elements (trees, rocks, cacti, structures, or water).
   */
  public findInitialPlayerSpawnPoint(): {
    x: number;
    y: number;
    tileX: number;
    tileY: number;
  } {
    const isSolidLandmassAnchor = (
      tx: number,
      ty: number,
      allowIsland: boolean
    ): boolean => {
      const centerBiome = this.computeBiomeAtTile(tx, ty);
      if (centerBiome === BiomeType.OCEAN) return false;
      if (!allowIsland && centerBiome === BiomeType.ISLAND) return false;

      let dryNeighbors = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const b = this.computeBiomeAtTile(tx + dx, ty + dy);
          if (b !== BiomeType.OCEAN && (allowIsland || b !== BiomeType.ISLAND)) {
            dryNeighbors++;
          }
        }
      }
      return dryNeighbors >= 18;
    };

    const tryFindWalkableTileNearAnchor = (
      anchorTx: number,
      anchorTy: number
    ): { x: number; y: number; tileX: number; tileY: number } | null => {
      for (let r = 0; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const tx = anchorTx + dx;
            const ty = anchorTy + dy;
            if (!this.isTileWalkable(tx, ty, false)) continue;

            // Ensure at least 2 cardinal neighbor tiles are also walkable dry land so the player isn't boxed in
            let freeCardinals = 0;
            if (this.isTileWalkable(tx + 1, ty, false)) freeCardinals++;
            if (this.isTileWalkable(tx - 1, ty, false)) freeCardinals++;
            if (this.isTileWalkable(tx, ty + 1, false)) freeCardinals++;
            if (this.isTileWalkable(tx, ty - 1, false)) freeCardinals++;
            if (freeCardinals < 2) continue;

            const wx = tx * TILE_SIZE + TILE_SIZE / 2;
            const wy = ty * TILE_SIZE + TILE_SIZE / 2;
            if (this.canEntityOccupyWorldCircle(wx, wy, 7.2, false)) {
              return { x: wx, y: wy, tileX: tx, tileY: ty };
            }
          }
        }
      }
      return null;
    };

    const cleanupUnexploredProbedChunks = () => {
      for (const [k, c] of Object.entries(this.chunks)) {
        if (!WorldManager.isChunkExploredOrModified(c)) {
          delete this.chunks[k];
        }
      }
    };

    // Pass 1: Search outward from (0, 0) for a natural mainland dry-land position
    // Pass 2: Fallback allowing large islands if the origin region is an ocean archipelago
    for (const allowIsland of [false, true]) {
      if (isSolidLandmassAnchor(0, 0, allowIsland)) {
        const hit = tryFindWalkableTileNearAnchor(0, 0);
        if (hit) {
          cleanupUnexploredProbedChunks();
          return hit;
        }
      }

      for (let rad = 2; rad <= 320; rad += 3) {
        const steps = Math.max(8, Math.min(48, Math.floor(rad * 1.5)));
        for (let i = 0; i < steps; i++) {
          const angle = (i / steps) * Math.PI * 2;
          const tx = Math.round(Math.cos(angle) * rad);
          const ty = Math.round(Math.sin(angle) * rad);
          if (!isSolidLandmassAnchor(tx, ty, allowIsland)) continue;

          const hit = tryFindWalkableTileNearAnchor(tx, ty);
          if (hit) {
            cleanupUnexploredProbedChunks();
            return hit;
          }
        }
      }
    }

    cleanupUnexploredProbedChunks();
    const fallbackSafe = this.findNearestSafePosition(16, 16, 7.2);
    return {
      x: fallbackSafe.x,
      y: fallbackSafe.y,
      tileX: Math.floor(fallbackSafe.x / TILE_SIZE),
      tileY: Math.floor(fallbackSafe.y / TILE_SIZE),
    };
  }

  /**
   * Authoritative check for whether a PlacedStructure currently blocks physical movement (has an active Hitbox).
   * - Floors, carpets, bridges, torches, lanterns, banners, campfires, traps, and OPEN doors/gates do not block.
   * - Exception (`PlaceableType.FENCE_GATE` / Porteira): when OPEN (`st.isOpen === true`), it STILL has a solid
   *   hitbox for all animals and mobs (`isHumanEntity === false`), and only has no hitbox for humans
   *   (Player on foot, Villagers, and Wanderers/Travelers: `isHumanEntity === true`)!
   */
  public static isStructureCurrentlySolid(
    st: PlacedStructure,
    isHumanEntity = false
  ): boolean {
    if (st.type === PlaceableType.LEVEL_STAIRS) {
      return Boolean(st.solid);
    }
    const bp = CONSTRUCTION_BLUEPRINTS[st.type];
    if (!bp) return Boolean(st.solid);
    if (!bp.hasHitbox) return false;
    if (st.type === PlaceableType.FENCE_GATE) {
      if (!st.isOpen) return true;
      return !isHumanEntity;
    }
    if (bp.hitboxBehavior === 'DYNAMIC_DOOR') {
      return !st.isOpen;
    }
    return true;
  }

  /**
   * Per-chunk O(1) spatial index for structures and nature nodes on each of the 256 tiles (16x16),
   * plus a precomputed roof-enclosure signature for RoofSystem.
   * Automatically rebuilds in O(N_chunk) only when a chunk's structures/nodes or dirtyRev change.
   */
  private chunkSpatialIndexMap = new WeakMap<
    ChunkData,
    {
      dirtyRev: number;
      structLen: number;
      nodeLen: number;
      firstStruct: PlacedStructure | undefined;
      lastStruct: PlacedStructure | undefined;
      firstNode: NatureNode | undefined;
      lastNode: NatureNode | undefined;
      nodeAtTile: (NatureNode | undefined)[];
      structuresAtTile: (PlacedStructure[] | undefined)[];
      groundAtTile: (PlacedStructure | undefined)[];
      wallAtTile: (PlacedStructure | undefined)[];
      doorAtTile: (PlacedStructure | undefined)[];
      topAtTile: (PlacedStructure | undefined)[];
      roofWallSig: string;
    }
  >();

  private connMaskByType = new Map<PlaceableType, Map<number, number>>();

  private getChunkSpatialIndex(chunk: ChunkData) {
    const sLen = chunk.structures.length;
    const nLen = chunk.nodes.length;
    const dirtyRev = chunk.dirtyRev || 0;
    const firstStruct = sLen > 0 ? chunk.structures[0] : undefined;
    const lastStruct = sLen > 0 ? chunk.structures[sLen - 1] : undefined;
    const firstNode = nLen > 0 ? chunk.nodes[0] : undefined;
    const lastNode = nLen > 0 ? chunk.nodes[nLen - 1] : undefined;

    const existing = this.chunkSpatialIndexMap.get(chunk);
    if (
      existing &&
      existing.dirtyRev === dirtyRev &&
      existing.structLen === sLen &&
      existing.nodeLen === nLen &&
      existing.firstStruct === firstStruct &&
      existing.lastStruct === lastStruct &&
      existing.firstNode === firstNode &&
      existing.lastNode === lastNode
    ) {
      return existing;
    }

    // Invalidate connection mask cache whenever any chunk's structure layout changes
    if (
      !existing ||
      existing.structLen !== sLen ||
      existing.dirtyRev !== dirtyRev ||
      existing.lastStruct !== lastStruct
    ) {
      this.connMaskByType.clear();
    }

    const nodeAtTile = new Array<NatureNode | undefined>(256);
    const structuresAtTile = new Array<PlacedStructure[] | undefined>(256);
    const groundAtTile = new Array<PlacedStructure | undefined>(256);
    const wallAtTile = new Array<PlacedStructure | undefined>(256);
    const doorAtTile = new Array<PlacedStructure | undefined>(256);
    const topAtTile = new Array<PlacedStructure | undefined>(256);

    for (let i = 0; i < nLen; i++) {
      const n = chunk.nodes[i];
      const lx = ((n.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((n.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      nodeAtTile[ly * CHUNK_SIZE + lx] = n;
    }

    const sigParts: string[] = [];
    for (let i = 0; i < sLen; i++) {
      const s = chunk.structures[i];
      const lx = ((s.tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((s.tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const idx = ly * CHUNK_SIZE + lx;

      let list = structuresAtTile[idx];
      if (!list) {
        list = [s];
        structuresAtTile[idx] = list;
      } else {
        list.push(s);
      }

      const bp = CONSTRUCTION_BLUEPRINTS[s.type];
      if (
        s.isBridge ||
        s.type === PlaceableType.WOOD_BRIDGE ||
        bp?.layer === 'GROUND'
      ) {
        groundAtTile[idx] = s;
      }
      if (WorldManager.isWallMountableStructure(s.type)) {
        wallAtTile[idx] = s;
      }
      if (WorldManager.isDoorOrGateStructure(s.type)) {
        doorAtTile[idx] = s;
      }

      if (
        (bp &&
          bp.layer === 'WALL' &&
          s.type !== PlaceableType.WOOD_FENCE &&
          s.type !== PlaceableType.FENCE_GATE) ||
        s.type === PlaceableType.VILLAGE_HOUSE ||
        s.type === PlaceableType.EXPLORER_TENT
      ) {
        sigParts.push(`${s.tileX},${s.tileY},${s.type}`);
      }
    }

    for (let idx = 0; idx < 256; idx++) {
      const matches = structuresAtTile[idx];
      if (!matches || matches.length === 0) continue;
      if (matches.length === 1) {
        topAtTile[idx] = matches[0];
      } else {
        topAtTile[idx] =
          matches.find(
            (s) => CONSTRUCTION_BLUEPRINTS[s.type]?.layer === 'WALL'
          ) ||
          matches.find(
            (s) =>
              CONSTRUCTION_BLUEPRINTS[s.type]?.layer !== 'GROUND' &&
              s.type !== PlaceableType.SPIKE_TRAP
          ) ||
          matches.find(
            (s) => CONSTRUCTION_BLUEPRINTS[s.type]?.layer !== 'GROUND'
          ) ||
          matches[matches.length - 1];
      }
    }

    const built = {
      dirtyRev,
      structLen: sLen,
      nodeLen: nLen,
      firstStruct,
      lastStruct,
      firstNode,
      lastNode,
      nodeAtTile,
      structuresAtTile,
      groundAtTile,
      wallAtTile,
      doorAtTile,
      topAtTile,
      roofWallSig: sigParts.join(';'),
    };
    this.chunkSpatialIndexMap.set(chunk, built);
    return built;
  }

  /**
   * Returns the precomputed roof-enclosure signature string for chunk `(cx, cy)` in O(1).
   */
  public getChunkRoofWallSig(cx: number, cy: number): string {
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) return '';
    return this.getChunkSpatialIndex(chunk).roofWallSig;
  }

  /**
   * Returns true if tile `(tx, ty)` is open water (`BiomeType.OCEAN` without a Bridge or Ground Floor structure),
   * meaning any entity or player on this tile is swimming.
   */
  public isTileSwimmableWater(tx: number, ty: number): boolean {
    const biome = this.getTileBiomeFast(tx, ty);
    if (biome !== BiomeType.OCEAN) return false;

    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) return true;

    const spatial = this.getChunkSpatialIndex(chunk);
    return !spatial.groundAtTile[ly * CHUNK_SIZE + lx];
  }

  /**
   * Returns true if world coordinate `(wx, wy)` is in open swimmable water (`BiomeType.OCEAN` without a bridge).
   */
  public isWorldPosInWater(wx: number, wy: number): boolean {
    const { tx, ty } = this.worldToTile(wx, wy);
    return this.isTileSwimmableWater(tx, ty);
  }

  private riverFlowCache = new Map<
    string,
    { connectedToOcean: boolean; dirX: number; dirY: number }
  >();

  /**
   * Verifies whether a river tile `(tx, ty)` is continuously connected along its channel
   * to a sea/ocean (`waterKind === 'ocean'`) and returns the exact unit flow vector
   * following the river's path toward the sea.
   */
  private getConnectedRiverFlowAtTile(
    tx: number,
    ty: number
  ): { connectedToOcean: boolean; dirX: number; dirY: number } {
    const key = `${tx},${ty}`;
    const cached = this.riverFlowCache.get(key);
    if (cached) return cached;

    if (this.riverFlowCache.size > 6000) {
      this.riverFlowCache.clear();
    }

    const r0 = this.getRawWaterAtTile(tx, ty);
    if (r0.waterKind !== 'river') {
      const res = { connectedToOcean: false, dirX: 0, dirY: 0 };
      this.riverFlowCache.set(key, res);
      return res;
    }

    const sampleChannelTangent = (px: number, py: number) => {
      const ix = Math.round(px);
      const iy = Math.round(py);
      const rE = this.getRawWaterAtTile(ix + 3, iy);
      const rW = this.getRawWaterAtTile(ix - 3, iy);
      const rS = this.getRawWaterAtTile(ix, iy + 3);
      const rN = this.getRawWaterAtTile(ix, iy - 3);
      const gMx = (rE.riverMeander - rW.riverMeander) / 6;
      const gMy = (rS.riverMeander - rN.riverMeander) / 6;
      const gMag = Math.hypot(gMx, gMy);
      if (gMag < 1e-6) {
        return { tx: 0, ty: 0, gMx: 0, gMy: 0, gMag: 0 };
      }
      return {
        tx: -gMy / gMag,
        ty: gMx / gMag,
        gMx,
        gMy,
        gMag,
      };
    };

    const initTan = sampleChannelTangent(tx, ty);
    if (initTan.gMag < 1e-6) {
      const res = { connectedToOcean: false, dirX: 0, dirY: 0 };
      this.riverFlowCache.set(key, res);
      return res;
    }

    // Trace a branch (+1 or -1 along the river channel tangent) to see if it continuously reaches the Ocean
    const traceBranchToOcean = (
      sign: 1 | -1
    ): {
      reachesOcean: boolean;
      steps: number;
      firstDx: number;
      firstDy: number;
    } => {
      let px = tx;
      let py = ty;
      let prevDirX = initTan.tx * sign;
      let prevDirY = initTan.ty * sign;
      let firstDx = prevDirX;
      let firstDy = prevDirY;
      const stepDist = 3.0;
      const maxSteps = 55;

      for (let step = 1; step <= maxSteps; step++) {
        px += prevDirX * stepDist;
        py += prevDirY * stepDist;

        const r = this.getRawWaterAtTile(Math.round(px), Math.round(py));
        if (r.waterKind === 'ocean') {
          return { reachesOcean: true, steps: step, firstDx, firstDy };
        }

        const tan = sampleChannelTangent(px, py);
        if (tan.gMag > 1e-6) {
          // Gently recenter onto the river thalweg (riverMeander = 0) so the trace never drifts off a curved bank
          const pull = Math.max(-2.2, Math.min(2.2, -r.riverMeander / tan.gMag));
          px += (tan.gMx / tan.gMag) * pull;
          py += (tan.gMy / tan.gMag) * pull;
        }

        const rCentered = this.getRawWaterAtTile(Math.round(px), Math.round(py));
        if (rCentered.waterKind === 'ocean') {
          return { reachesOcean: true, steps: step, firstDx, firstDy };
        }
        if (rCentered.waterKind !== 'river') {
          // Channel pinched off on dry land or hit an inland lake without reaching the ocean
          return { reachesOcean: false, steps: step, firstDx, firstDy };
        }

        if (step === 2) {
          const d1x = px - tx;
          const d1y = py - ty;
          const d1Mag = Math.hypot(d1x, d1y);
          if (d1Mag > 0.1) {
            firstDx = d1x / d1Mag;
            firstDy = d1y / d1Mag;
          }
        }

        if (tan.gMag > 1e-6) {
          // Keep consistent forward orientation along the winding curve
          if (tan.tx * prevDirX + tan.ty * prevDirY >= 0) {
            prevDirX = tan.tx;
            prevDirY = tan.ty;
          } else {
            prevDirX = -tan.tx;
            prevDirY = -tan.ty;
          }
        }
      }

      return { reachesOcean: false, steps: maxSteps, firstDx, firstDy };
    };

    // Prefer checking the branch that goes toward lower macro continental elevation first
    const rMacroE = this.getRawWaterAtTile(tx + 8, ty);
    const rMacroW = this.getRawWaterAtTile(tx - 8, ty);
    const rMacroS = this.getRawWaterAtTile(tx, ty + 8);
    const rMacroN = this.getRawWaterAtTile(tx, ty - 8);
    const macroDownX = rMacroW.continentalElev - rMacroE.continentalElev;
    const macroDownY = rMacroN.continentalElev - rMacroS.continentalElev;

    const primarySign: 1 | -1 =
      initTan.tx * macroDownX + initTan.ty * macroDownY >= 0 ? 1 : -1;
    const secondarySign: 1 | -1 = primarySign === 1 ? -1 : 1;

    const branchA = traceBranchToOcean(primarySign);
    const branchB = traceBranchToOcean(secondarySign);

    let chosen: {
      reachesOcean: boolean;
      steps: number;
      firstDx: number;
      firstDy: number;
    } | null = null;
    if (branchA.reachesOcean && branchB.reachesOcean) {
      chosen = branchA.steps <= branchB.steps ? branchA : branchB;
    } else if (branchA.reachesOcean) {
      chosen = branchA;
    } else if (branchB.reachesOcean) {
      chosen = branchB;
    }

    if (!chosen) {
      const res = { connectedToOcean: false, dirX: 0, dirY: 0 };
      this.riverFlowCache.set(key, res);
      return res;
    }

    const centerPull = Math.max(-0.35, Math.min(0.35, -r0.riverMeander * 22));
    const bankNx = initTan.gMx / initTan.gMag;
    const bankNy = initTan.gMy / initTan.gMag;
    const fx = chosen.firstDx + bankNx * centerPull * 0.22;
    const fy = chosen.firstDy + bankNy * centerPull * 0.22;
    const fMag = Math.hypot(fx, fy);

    const res =
      fMag > 0.001
        ? { connectedToOcean: true, dirX: fx / fMag, dirY: fy / fMag }
        : { connectedToOcean: false, dirX: 0, dirY: 0 };
    this.riverFlowCache.set(key, res);
    return res;
  }

  /**
   * Computes the active water current vector `(vx, vy)` at tile `(tx, ty)`:
   * - `river`: River current ONLY for rivers that genuinely connect to the Sea/Ocean, flowing strictly along the river's path toward the Sea.
   * - `ocean_shore`: Coastal surf waves along the Ocean edge that push swimmers toward the adjacent Beach.
   * - `none`: Calm inland lakes, disconnected water bodies, or deep open ocean far from shore.
   */
  public getWaterCurrentAtTile(
    tx: number,
    ty: number,
    globalTime = 0
  ): { vx: number; vy: number; kind: 'none' | 'river' | 'ocean_shore' } {
    if (this.isUnderground || this.getTileBiomeFast(tx, ty) !== BiomeType.OCEAN) {
      return WorldManager.NO_WATER_CURRENT;
    }

    const packedKey = WorldManager.packTileCoord(tx, ty);
    let base = this.waterCurrentBaseCache.get(packedKey);
    if (!base) {
      if (this.waterCurrentBaseCache.size > 16384) {
        this.waterCurrentBaseCache.clear();
      }
      const raw = this.getRawWaterAtTile(tx, ty);
      if (raw.waterKind === 'river') {
        const flow = this.getConnectedRiverFlowAtTile(tx, ty);
        base = flow.connectedToOcean
          ? {
              kind: 'river',
              dirX: flow.dirX,
              dirY: flow.dirY,
              minDist: 0,
            }
          : { kind: 'none', dirX: 0, dirY: 0, minDist: Infinity };
      } else if (raw.waterKind === 'ocean') {
        let pushX = 0;
        let pushY = 0;
        let minDist = Infinity;

        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (dx === 0 && dy === 0) continue;
            const dSq = dx * dx + dy * dy;
            if (dSq > 17.64) continue;
            if (this.getTileBiomeFast(tx + dx, ty + dy) !== BiomeType.OCEAN) {
              const d = Math.sqrt(dSq);
              const weight = (4.6 - d) / d;
              pushX += dx * weight;
              pushY += dy * weight;
              if (d < minDist) minDist = d;
            }
          }
        }

        const pMag = Math.hypot(pushX, pushY);
        if (pMag > 0.01 && minDist <= 4.2) {
          base = {
            kind: 'ocean_shore',
            dirX: pushX / pMag,
            dirY: pushY / pMag,
            minDist,
          };
        } else {
          base = { kind: 'none', dirX: 0, dirY: 0, minDist: Infinity };
        }
      } else {
        base = { kind: 'none', dirX: 0, dirY: 0, minDist: Infinity };
      }
      this.waterCurrentBaseCache.set(packedKey, base);
    }

    if (base.kind === 'none') {
      return WorldManager.NO_WATER_CURRENT;
    }

    if (!this.isTileSwimmableWater(tx, ty)) {
      return WorldManager.NO_WATER_CURRENT;
    }

    if (base.kind === 'river') {
      const riverSpeed = 28;
      return {
        vx: base.dirX * riverSpeed,
        vy: base.dirY * riverSpeed,
        kind: 'river',
      };
    }

    const waveSurge =
      0.84 + 0.26 * Math.sin(globalTime * 2.6 + (tx * 0.6 + ty * 0.5));
    const proximityFactor = 0.55 + Math.max(0, (4.2 - base.minDist) / 4.2) * 0.45;
    const shoreSpeed = 26 * waveSurge * proximityFactor;
    return {
      vx: base.dirX * shoreSpeed,
      vy: base.dirY * shoreSpeed,
      kind: 'ocean_shore',
    };
  }

  /**
   * Computes the active water current vector `(vx, vy)` at world coordinates `(wx, wy)`.
   */
  public getWaterCurrentAtWorld(
    wx: number,
    wy: number,
    globalTime = 0
  ): { vx: number; vy: number; kind: 'none' | 'river' | 'ocean_shore' } {
    const { tx, ty } = this.worldToTile(wx, wy);
    return this.getWaterCurrentAtTile(tx, ty, globalTime);
  }

  public isTileWalkable(
    tx: number,
    ty: number,
    allowWater = true,
    isHumanEntity = true
  ): boolean {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    const tileIdx = ly * CHUNK_SIZE + lx;
    const biome = chunk.tiles[tileIdx];
    const spatial = this.getChunkSpatialIndex(chunk);

    const hasBridge = Boolean(spatial.groundAtTile[tileIdx]);
    const stList = spatial.structuresAtTile[tileIdx];
    if (stList) {
      for (let i = 0; i < stList.length; i++) {
        if (WorldManager.isStructureCurrentlySolid(stList[i], isHumanEntity)) {
          return false;
        }
      }
    }

    if (!allowWater && biome === BiomeType.OCEAN && !hasBridge) {
      return false;
    }

    // Only NatureNodes with hasHitbox: true block tile walkability (e.g. Berry Bushes do NOT block!)
    const node = spatial.nodeAtTile[tileIdx];
    if (node && node.hp > 0 && (NATURE_BLUEPRINTS[node.type]?.hasHitbox ?? true)) {
      return false;
    }

    return true;
  }

  /**
   * Sub-tile accurate world-space collision check for Player & Creatures.
   * - Respects passable objects (bushes, grass, floors, carpets, torches, lanterns, banners, campfires, traps, open doors).
   * - Respects FENCE_GATE selective hitbox (open gate is passable ONLY for humans: `isHumanEntity === true`).
   * - Allows swimming in water (`allowWater = true` by default) while supporting dry-land checks (`allowWater = false`).
   * - Uses full tile collision for continuous Walls & closed Doors.
   * - Uses compact radial collision for Trees, Boulders, Fences, and Furniture/Stations so movement never snags on corners.
   */
  public canEntityOccupyWorldCircle(
    wx: number,
    wy: number,
    entityRadius = 6.2,
    allowWater = true,
    isHumanEntity = true
  ): boolean {
    // 1. Optional dry-land check at the 4 footprint corners when water is disallowed
    if (!allowWater) {
      const footMargin = 5.5;
      if (
        this.isTileSwimmableWater(
          Math.floor((wx - footMargin) / TILE_SIZE),
          Math.floor((wy - footMargin) / TILE_SIZE)
        ) ||
        this.isTileSwimmableWater(
          Math.floor((wx + footMargin) / TILE_SIZE),
          Math.floor((wy - footMargin) / TILE_SIZE)
        ) ||
        this.isTileSwimmableWater(
          Math.floor((wx - footMargin) / TILE_SIZE),
          Math.floor((wy + footMargin) / TILE_SIZE)
        ) ||
        this.isTileSwimmableWater(
          Math.floor((wx + footMargin) / TILE_SIZE),
          Math.floor((wy + footMargin) / TILE_SIZE)
        )
      ) {
        return false;
      }
    }

    // 2. Check nearby tiles (3x3 around entity center) for solid structures & nature nodes using O(1) spatial index
    const centerTx = Math.floor(wx / TILE_SIZE);
    const centerTy = Math.floor(wy / TILE_SIZE);

    for (let dy = -1; dy <= 1; dy++) {
      const ty = centerTy + dy;
      const cy = Math.floor(ty / CHUNK_SIZE);
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const rowOffset = ly * CHUNK_SIZE;

      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTx + dx;
        const cx = Math.floor(tx / CHUNK_SIZE);
        const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const chunk = this.getOrCreateChunk(cx, cy);
        const spatial = this.getChunkSpatialIndex(chunk);
        const tileIdx = rowOffset + lx;

        // Check Nature Node on (tx, ty) in O(1)
        const node = spatial.nodeAtTile[tileIdx];
        if (node && node.hp > 0) {
          if (WorldManager.isUndergroundBlockNode(node.type)) {
            const boxMinX = tx * TILE_SIZE;
            const boxMaxX = (tx + 1) * TILE_SIZE;
            const boxMinY = ty * TILE_SIZE;
            const boxMaxY = (ty + 1) * TILE_SIZE;
            const closestX = Math.max(boxMinX, Math.min(wx, boxMaxX));
            const closestY = Math.max(boxMinY, Math.min(wy, boxMaxY));
            const cdx = wx - closestX;
            const cdy = wy - closestY;
            if (cdx * cdx + cdy * cdy < entityRadius * entityRadius) {
              return false;
            }
          } else {
            const nbp = NATURE_BLUEPRINTS[node.type];
            if (nbp && nbp.hasHitbox && nbp.hitboxRadius > 0) {
              const nx = tx * TILE_SIZE + TILE_SIZE / 2;
              const ny = ty * TILE_SIZE + TILE_SIZE * 0.58;
              const cdx = wx - nx;
              const cdy = wy - ny;
              const minR = entityRadius + nbp.hitboxRadius;
              if (cdx * cdx + cdy * cdy < minR * minR) {
                return false;
              }
            }
          }
        }

        // Check Structures on (tx, ty) in O(1)
        const stList = spatial.structuresAtTile[tileIdx];
        if (stList) {
          for (let i = 0; i < stList.length; i++) {
            const st = stList[i];
            if (!WorldManager.isStructureCurrentlySolid(st, isHumanEntity)) continue;

            const bp = CONSTRUCTION_BLUEPRINTS[st.type];
            if (bp && bp.hitboxBehavior === 'SOLID_COMPACT' && bp.hitboxRadius) {
              const sx = tx * TILE_SIZE + TILE_SIZE / 2;
              const sy = ty * TILE_SIZE + TILE_SIZE * 0.55;
              const cdx = wx - sx;
              const cdy = wy - sy;
              const minR = entityRadius + bp.hitboxRadius;
              if (cdx * cdx + cdy * cdy < minR * minR) {
                return false;
              }
            } else {
              // SOLID_FULL (Walls, Windows) or solid DYNAMIC_DOOR / FENCE_GATE: AABB vs Circle
              const isVerticalSideWall = this.isWallOrDoorSideProfileAt(tx, ty, st);
              const padX = isVerticalSideWall ? 9 : 1;
              const boxMinX = tx * TILE_SIZE + padX;
              const boxMaxX = (tx + 1) * TILE_SIZE - padX;
              const boxMinY = ty * TILE_SIZE + 1;
              const boxMaxY = (ty + 1) * TILE_SIZE - 1;
              const closestX = Math.max(boxMinX, Math.min(wx, boxMaxX));
              const closestY = Math.max(boxMinY, Math.min(wy, boxMaxY));
              const cdx = wx - closestX;
              const cdy = wy - closestY;
              if (cdx * cdx + cdy * cdy < entityRadius * entityRadius) {
                return false;
              }
            }
          }
        }
      }
    }

    return true;
  }

  /**
   * Finds the nearest collision-free world position `(x, y)` when an entity or player
   * is stuck inside a solid hitbox (e.g. spawning inside a newly built structure,
   * having a wall/furniture placed on top of them, or closing a door while overlapping).
   * Uses collider center repulsion bias so the entity is always pushed out toward the nearest edge.
   */
  public findNearestSafePosition(
    wx: number,
    wy: number,
    entityRadius = 6.2,
    isHumanEntity = true
  ): { x: number; y: number } {
    if (this.canEntityOccupyWorldCircle(wx, wy, entityRadius, true, isHumanEntity)) {
      return { x: wx, y: wy };
    }

    // 1. Compute outward repulsion vector from all overlapping colliders in the 3x3 tile neighborhood
    let repulseX = 0;
    let repulseY = 0;
    const centerTile = this.worldToTile(wx, wy);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTile.tx + dx;
        const ty = centerTile.ty + dy;
        const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
        const chunk = this.getOrCreateChunk(cx, cy);
        const spatial = this.getChunkSpatialIndex(chunk);
        const tileIdx = ly * CHUNK_SIZE + lx;

        const node = spatial.nodeAtTile[tileIdx];
        if (node) {
          const nbp = NATURE_BLUEPRINTS[node.type];
          if (nbp && nbp.hasHitbox && nbp.hitboxRadius > 0) {
            const nx = tx * TILE_SIZE + TILE_SIZE / 2;
            const ny = ty * TILE_SIZE + TILE_SIZE * 0.58;
            const dist = Math.hypot(wx - nx, wy - ny);
            const minDist = entityRadius + nbp.hitboxRadius;
            if (dist < minDist) {
              const ux = dist > 0.001 ? (wx - nx) / dist : 0;
              const uy = dist > 0.001 ? (wy - ny) / dist : 1;
              const weight = minDist - dist + 2;
              repulseX += ux * weight;
              repulseY += uy * weight;
            }
          }
        }

        const stList = spatial.structuresAtTile[tileIdx];
        if (stList) {
          for (let i = 0; i < stList.length; i++) {
            const st = stList[i];
            if (!WorldManager.isStructureCurrentlySolid(st, isHumanEntity)) continue;
            const sx = tx * TILE_SIZE + TILE_SIZE / 2;
            const sy = ty * TILE_SIZE + TILE_SIZE * 0.54;
            const dist = Math.hypot(wx - sx, wy - sy);
            if (dist < TILE_SIZE * 0.85) {
              const ux = dist > 0.001 ? (wx - sx) / dist : 0;
              const uy = dist > 0.001 ? (wy - sy) / dist : 1;
              const weight = TILE_SIZE * 0.85 - dist + 2;
              repulseX += ux * weight;
              repulseY += uy * weight;
            }
          }
        }
      }
    }

    const repulseMag = Math.hypot(repulseX, repulseY);
    const normRx = repulseMag > 0.01 ? repulseX / repulseMag : 0;
    const normRy = repulseMag > 0.01 ? repulseY / repulseMag : 1;

    // First try stepping directly along the repulsion vector for immediate edge ejection
    if (repulseMag > 0.01) {
      for (let d = 2; d <= 36; d += 2) {
        const testX = wx + normRx * d;
        const testY = wy + normRy * d;
        if (
          this.canEntityOccupyWorldCircle(
            testX,
            testY,
            entityRadius,
            true,
            isHumanEntity
          )
        ) {
          return { x: testX, y: testY };
        }
      }
    }

    // 2. Radial ring search around (wx, wy), favoring directions aligned with the repulsion vector
    const radii = [
      2, 4, 6, 8, 10, 13, 16, 20, 24, 28, 32, 38, 44, 52, 64, 80, 96, 112, 128,
      160, 192, 224, 256,
    ];

    for (const r of radii) {
      const steps = r <= 24 ? 16 : 24;
      let bestCandidate: { x: number; y: number } | null = null;
      let bestAlignment = -Infinity;

      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const candX = wx + dirX * r;
        const candY = wy + dirY * r;

        if (
          this.canEntityOccupyWorldCircle(
            candX,
            candY,
            entityRadius,
            true,
            isHumanEntity
          )
        ) {
          const alignment =
            repulseMag > 0.01 ? dirX * normRx + dirY * normRy : -Math.abs(dirX) * 0.01 + dirY * 0.02;
          if (alignment > bestAlignment) {
            bestAlignment = alignment;
            bestCandidate = { x: candX, y: candY };
          }
        }
      }

      if (bestCandidate) {
        return bestCandidate;
      }
    }

    // 3. Fallback spiral tile search up to 16 tiles away
    for (let rad = 1; rad <= 16; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue;
          const tx = centerTile.tx + dx;
          const ty = centerTile.ty + dy;
          if (this.isTileWalkable(tx, ty)) {
            const cx = tx * TILE_SIZE + TILE_SIZE / 2;
            const cy = ty * TILE_SIZE + TILE_SIZE / 2;
            if (this.canEntityOccupyWorldCircle(cx, cy, entityRadius)) {
              return { x: cx, y: cy };
            }
          }
        }
      }
    }

    return { x: wx, y: wy };
  }

  /**
   * Computes the 4-directional continuity bitmask (N=1, E=2, S=4, W=8 => 0..15)
   * for any structure at (tx, ty) based on its ConstructionBlueprint connection rules.
   */
  public getStructureConnectionMask(
    tx: number,
    ty: number,
    placeableType: PlaceableType
  ): number {
    const bp = CONSTRUCTION_BLUEPRINTS[placeableType];
    if (!bp || bp.connectsToGroups.length === 0) return 0;

    // Ensure the center chunk's spatial index is validated first (which clears connMaskByType if any structure changed)
    const centerChunk = this.chunks[
      WorldManager.chunkKey(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE))
    ];
    if (centerChunk) {
      this.getChunkSpatialIndex(centerChunk);
    }

    const packedCoord = WorldManager.packTileCoord(tx, ty);
    let typeCache = this.connMaskByType.get(placeableType);
    if (typeCache) {
      const cachedMask = typeCache.get(packedCoord);
      if (cachedMask !== undefined) {
        return cachedMask;
      }
    }

    const connectsAt = (nx: number, ny: number): boolean => {
      // Special rule for Bridges: connect to neighboring bridges/floors OR to shoreline land tiles!
      if (bp.continuityMode === 'BRIDGE_AUTO') {
        if (this.getTileBiomeFast(nx, ny) !== BiomeType.OCEAN) {
          return true;
        }
      }
      const ncx = Math.floor(nx / CHUNK_SIZE);
      const ncy = Math.floor(ny / CHUNK_SIZE);
      const chunk = this.chunks[WorldManager.chunkKey(ncx, ncy)];
      if (!chunk || chunk.structures.length === 0) return false;

      const spatial = this.getChunkSpatialIndex(chunk);
      const nlx = ((nx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const nly = ((ny % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const stList = spatial.structuresAtTile[nly * CHUNK_SIZE + nlx];
      if (!stList) return false;

      for (let i = 0; i < stList.length; i++) {
        const nbp = CONSTRUCTION_BLUEPRINTS[stList[i].type];
        if (nbp && bp.connectsToGroups.includes(nbp.connectionGroup)) {
          return true;
        }
      }
      return false;
    };

    let mask = 0;
    if (connectsAt(tx, ty - 1)) mask |= 1; // North
    if (connectsAt(tx + 1, ty)) mask |= 2; // East
    if (connectsAt(tx, ty + 1)) mask |= 4; // South
    if (connectsAt(tx - 1, ty)) mask |= 8; // West

    if (!typeCache) {
      typeCache = new Map<number, number>();
      this.connMaskByType.set(placeableType, typeCache);
    } else if (typeCache.size > 8192) {
      typeCache.clear();
    }
    typeCache.set(packedCoord, mask);
    return mask;
  }

  /**
   * Determines whether a Door or Gate at (tx, ty) should align horizontally (East-West wall)
   * or vertically (North-South wall).
   * Connected wall/door neighbors take priority over manual standalone rotation.
   */
  public getDoorOrientationAt(
    tx: number,
    ty: number,
    placeableType: PlaceableType,
    preferred?: 'auto' | 'horizontal' | 'vertical',
    rotation?: 0 | 1 | 2 | 3
  ): 'horizontal' | 'vertical' {
    const mask = this.getStructureConnectionMask(tx, ty, placeableType);
    const hasNS = (mask & 5) !== 0; // North (1) or South (4)
    const hasEW = (mask & 10) !== 0; // East (2) or West (8)
    if (hasNS && !hasEW) {
      return 'vertical';
    }
    if (hasEW && !hasNS) {
      return 'horizontal';
    }
    if (rotation !== undefined) {
      return rotation % 2 === 1 ? 'vertical' : 'horizontal';
    }
    if (preferred === 'horizontal' || preferred === 'vertical') {
      return preferred;
    }
    return 'horizontal';
  }

  /**
   * Returns the door or gate structure at (tx, ty), if any.
   */
  public getDoorStructureAtTile(
    tx: number,
    ty: number
  ): PlacedStructure | undefined {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) return undefined;
    return this.getChunkSpatialIndex(chunk).doorAtTile[ly * CHUNK_SIZE + lx];
  }

  /**
   * Detects if a door/gate at (tx, ty) is connected to an adjacent door/gate along its axis
   * to form a Double Door (Porta Dupla).
   * Returns the partner door structure, whether `(tx, ty)` is the second leaf (Right leaf for horizontal, Bottom leaf for vertical),
   * and the shared orientation.
   */
  public getPartnerDoubleDoor(
    tx: number,
    ty: number,
    door?: PlacedStructure
  ): {
    partner: PlacedStructure;
    isSecondLeaf: boolean;
    orient: 'horizontal' | 'vertical';
  } | null {
    const st = door || this.getDoorStructureAtTile(tx, ty);
    if (!st || !WorldManager.isDoorOrGateStructure(st.type)) return null;

    const orient = this.getDoorOrientationAt(
      tx,
      ty,
      st.type,
      st.orientation,
      st.rotation
    );

    if (orient === 'horizontal') {
      // Count consecutive horizontal doors to the West to pair deterministically in 2-door units
      let westRun = 0;
      let checkX = tx - 1;
      while (westRun < 8) {
        const wDoor = this.getDoorStructureAtTile(checkX, ty);
        if (
          !wDoor ||
          this.getDoorOrientationAt(
            checkX,
            ty,
            wDoor.type,
            wDoor.orientation,
            wDoor.rotation
          ) !== 'horizontal'
        ) {
          break;
        }
        westRun++;
        checkX--;
      }

      if (westRun % 2 === 1) {
        const partner = this.getDoorStructureAtTile(tx - 1, ty);
        if (partner) {
          return { partner, isSecondLeaf: true, orient: 'horizontal' };
        }
      } else {
        const eDoor = this.getDoorStructureAtTile(tx + 1, ty);
        if (
          eDoor &&
          this.getDoorOrientationAt(
            tx + 1,
            ty,
            eDoor.type,
            eDoor.orientation,
            eDoor.rotation
          ) === 'horizontal'
        ) {
          return { partner: eDoor, isSecondLeaf: false, orient: 'horizontal' };
        }
      }
    } else {
      // Vertical orientation: pair North-South doors in 2-door units
      let northRun = 0;
      let checkY = ty - 1;
      while (northRun < 8) {
        const nDoor = this.getDoorStructureAtTile(tx, checkY);
        if (
          !nDoor ||
          this.getDoorOrientationAt(
            tx,
            checkY,
            nDoor.type,
            nDoor.orientation,
            nDoor.rotation
          ) !== 'vertical'
        ) {
          break;
        }
        northRun++;
        checkY--;
      }

      if (northRun % 2 === 1) {
        const partner = this.getDoorStructureAtTile(tx, ty - 1);
        if (partner) {
          return { partner, isSecondLeaf: true, orient: 'vertical' };
        }
      } else {
        const sDoor = this.getDoorStructureAtTile(tx, ty + 1);
        if (
          sDoor &&
          this.getDoorOrientationAt(
            tx,
            ty + 1,
            sDoor.type,
            sDoor.orientation,
            sDoor.rotation
          ) === 'vertical'
        ) {
          return { partner: sDoor, isSecondLeaf: false, orient: 'vertical' };
        }
      }
    }

    return null;
  }

  /**
   * Checks if a structure of `placeableType` can be placed or upgraded at `(tx, ty)`.
   * Supports multi-layer building (GROUND layer coexists with WALL/FURNITURE layers)
   * and in-place structural upgrades (e.g., Wood Floor -> Stone/Brick Floor, Wood Wall -> Stone/Brick Wall or Door/Window).
   */
  public canPlaceStructureAt(
    tx: number,
    ty: number,
    placeableType: PlaceableType
  ): boolean {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    const biome = chunk.tiles[ly * CHUNK_SIZE + lx];
    const bp = CONSTRUCTION_BLUEPRINTS[placeableType];
    if (!bp) return false;

    const existingOnTile = chunk.structures.filter(
      (s) => s.tileX === tx && s.tileY === ty
    );

    // Escada de Nível is indestructible and cannot be built over or replaced
    if (existingOnTile.some((s) => s.type === PlaceableType.LEVEL_STAIRS)) {
      return false;
    }

    // === UNDERGROUND BUILDING RULES ===
    if (this.isUnderground) {
      // Cannot build in undiscovered pitch-black tiles
      if (chunk.explored[ly * CHUNK_SIZE + lx] !== 1) {
        return false;
      }
      // No walls of any kind (nor drilling stakes / saplings) can be placed in the underground
      if (
        bp.layer === 'WALL' ||
        placeableType === PlaceableType.DRILLING_STAKE ||
        placeableType === PlaceableType.LEVEL_STAIRS ||
        WorldManager.isSaplingStructure(placeableType)
      ) {
        return false;
      }
      // Check if there is an underground dirt/ore block on this tile
      const ugBlock = chunk.nodes.find(
        (n) =>
          n.tileX === tx &&
          n.tileY === ty &&
          n.hp > 0 &&
          WorldManager.isUndergroundBlockNode(n.type)
      );
      if (ugBlock) {
        // ONLY Torches can be placed onto dirt/ore blocks in the underground!
        if (placeableType === PlaceableType.TORCH) {
          return !existingOnTile.some((s) => s.type === PlaceableType.TORCH);
        }
        return false;
      }
    } else {
      // On surface: LEVEL_STAIRS is only created by drilling a DRILLING_STAKE with a pickaxe
      if (placeableType === PlaceableType.LEVEL_STAIRS) {
        return false;
      }
    }

    // Rain puddles on empty soil make the soil unusable until the puddle evaporates
    if (!this.isUnderground && this.hasRainPuddleAtTile(tx, ty)) {
      return false;
    }

    // Cannot build on top of an unharvested Nature Node (except passable Berry Bushes, Sand Dunes, and Flowers can be cleared automatically when building!)
    const hasBlockingNode = chunk.nodes.some(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        n.hp > 0 &&
        !WorldManager.isPassableGroundNode(n.type) &&
        !(this.isUnderground && placeableType === PlaceableType.TORCH)
    );
    if (hasBlockingNode) {
      return false;
    }

    // 0. Sapling non-overlapping rules:
    // - Nothing can be placed on top of an existing Sapling (no floor, wall, furniture, or trap)
    if (existingOnTile.some((s) => WorldManager.isSaplingStructure(s.type))) {
      return false;
    }
    // - A Sapling can only be planted on natural land with no existing structures or nature nodes on that tile
    if (WorldManager.isSaplingStructure(placeableType)) {
      if (biome === BiomeType.OCEAN) return false;
      if (existingOnTile.length > 0) return false;
      if (chunk.nodes.some((n) => n.tileX === tx && n.tileY === ty)) return false;
      return true;
    }

    // 1. Placing a WOOD_BRIDGE (Plataforma Flutuante):
    // - On water (OCEAN), it is the ONLY floor allowed and requires no existing WOOD_BRIDGE on that tile.
    // - On dry land, it can also be used as a platform/floor (or replace another non-protected ground floor).
    if (placeableType === PlaceableType.WOOD_BRIDGE) {
      if (biome === BiomeType.OCEAN) {
        return !existingOnTile.some(
          (s) => s.isBridge || s.type === PlaceableType.WOOD_BRIDGE
        );
      }
      const existingFloor = existingOnTile.find((s) => {
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return sbp?.layer === 'GROUND';
      });
      if (!existingFloor) return true;
      return existingFloor.type !== placeableType && !existingFloor.villageId;
    }

    // 2. Over water (OCEAN):
    // - NO floor other than WOOD_BRIDGE (Plataforma Flutuante) can EVER be placed over the sea!
    // - Upper structures ('WALL' / 'FURNITURE') require an existing WOOD_BRIDGE on that water tile.
    if (biome === BiomeType.OCEAN) {
      if (bp.layer === 'GROUND') {
        return false;
      }
      const hasBridge = existingOnTile.some(
        (s) => s.isBridge || s.type === PlaceableType.WOOD_BRIDGE
      );
      if (!hasBridge) return false;
    }

    // 3. Layer-based coexistence & in-place upgrade rules on dry land
    if (bp.layer === 'GROUND') {
      const existingFloor = existingOnTile.find((s) => {
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return sbp?.layer === 'GROUND';
      });
      if (!existingFloor) return true;
      // Allow replacing/upgrading to a DIFFERENT floor/carpet/platform if not village-protected
      return existingFloor.type !== placeableType && !existingFloor.villageId;
    }

    // Upper layers ('WALL' or 'FURNITURE') coexist freely with any 'GROUND' floor or bridge!
    const existingUppers = existingOnTile.filter((s) => {
      const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
      return sbp && sbp.layer !== 'GROUND';
    });

    if (existingUppers.length === 0) return true;

    // Wall-mounted item rule: ONLY PlaceableType.TORCH can be placed onto a Wall!
    const wallOnTile = existingUppers.find(
      (s) => CONSTRUCTION_BLUEPRINTS[s.type]?.layer === 'WALL'
    );
    if (wallOnTile) {
      if (placeableType === PlaceableType.TORCH) {
        const alreadyHasTorch = existingUppers.some(
          (s) => s.type === PlaceableType.TORCH
        );
        return (
          WorldManager.isWallMountableStructure(wallOnTile.type) &&
          !alreadyHasTorch
        );
      }
      // Allow SPIKE_TRAP and Doors/Gates (WOOD_DOOR, DARK_OAK_DOOR, PINE_DOOR, IRON_GATE) to coexist on the same tile
      if (
        placeableType === PlaceableType.SPIKE_TRAP &&
        existingUppers.length === 1 &&
        WorldManager.isDoorOrGateStructure(wallOnTile.type)
      ) {
        return true;
      }
      // Allow in-place upgrading/converting between WALL-layer pieces (e.g. Wood Wall -> Stone Wall / Window / Door)
      if (bp.layer === 'WALL') {
        return !wallOnTile.villageId && wallOnTile.type !== placeableType;
      }
      // Block any other item from being placed on a wall!
      return false;
    }

    // Allow Doors/Gates to be placed on a tile that currently only has a SPIKE_TRAP
    if (
      WorldManager.isDoorOrGateStructure(placeableType) &&
      existingUppers.length === 1 &&
      existingUppers[0].type === PlaceableType.SPIKE_TRAP
    ) {
      return true;
    }

    const existingUpper =
      existingUppers.find((s) => s.type !== PlaceableType.SPIKE_TRAP) ||
      existingUppers[0];

    if (existingUpper.villageId || existingUpper.type === placeableType) {
      return false;
    }

    const existingUpperBp = CONSTRUCTION_BLUEPRINTS[existingUpper.type];

    // Allow in-place upgrading between compatible FURNITURE-layer structure families:
    // - Lighting/Banners: Torch <-> Iron Lantern <-> Royal Banner
    // - Shelters: Explorer Tent <-> Village House
    // - Crafting/Commerce: Workbench <-> Market Stall
    // - Water/Sanctuary: Village Well <-> Healing Fountain
    if (bp.layer === 'FURNITURE' && existingUpperBp?.layer === 'FURNITURE') {
      const lightingGroup = [
        PlaceableType.TORCH,
        PlaceableType.IRON_LANTERN,
        PlaceableType.ROYAL_BANNER,
      ];
      const shelterGroup = [
        PlaceableType.EXPLORER_TENT,
        PlaceableType.VILLAGE_HOUSE,
      ];
      const workshopGroup = [
        PlaceableType.WORKBENCH,
        PlaceableType.MARKET_STALL,
      ];
      const fountainGroup = [
        PlaceableType.VILLAGE_WELL,
        PlaceableType.HEALING_FOUNTAIN,
      ];

      if (
        (lightingGroup.includes(placeableType) &&
          lightingGroup.includes(existingUpper.type)) ||
        (shelterGroup.includes(placeableType) &&
          shelterGroup.includes(existingUpper.type)) ||
        (workshopGroup.includes(placeableType) &&
          workshopGroup.includes(existingUpper.type)) ||
        (fountainGroup.includes(placeableType) &&
          fountainGroup.includes(existingUpper.type))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns true if `type` is a tree sapling structure (OAK_SAPLING, DARK_OAK_SAPLING, PINE_SAPLING, or PALM_SAPLING).
   */
  public static isSaplingStructure(type: PlaceableType): boolean {
    return (
      type === PlaceableType.OAK_SAPLING ||
      type === PlaceableType.DARK_OAK_SAPLING ||
      type === PlaceableType.PINE_SAPLING ||
      type === PlaceableType.PALM_SAPLING
    );
  }

  /**
   * Returns true if `type` is a solid wall or window structure that supports mounting a Torch.
   */
  public static isWallMountableStructure(type: PlaceableType): boolean {
    return (
      type === PlaceableType.WOOD_WALL ||
      type === PlaceableType.DARK_OAK_WALL ||
      type === PlaceableType.PINE_WALL ||
      type === PlaceableType.PALM_WALL ||
      type === PlaceableType.STONE_WALL ||
      type === PlaceableType.BRICK_WALL ||
      type === PlaceableType.WOOD_WINDOW ||
      type === PlaceableType.DARK_OAK_WINDOW ||
      type === PlaceableType.PINE_WINDOW ||
      type === PlaceableType.PALM_WINDOW ||
      type === PlaceableType.STONE_WINDOW
    );
  }

  /**
   * Returns true if `type` is a door or gate structure.
   */
  public static isDoorOrGateStructure(type: PlaceableType): boolean {
    return (
      type === PlaceableType.WOOD_DOOR ||
      type === PlaceableType.DARK_OAK_DOOR ||
      type === PlaceableType.PINE_DOOR ||
      type === PlaceableType.PALM_DOOR ||
      type === PlaceableType.IRON_GATE ||
      type === PlaceableType.FENCE_GATE
    );
  }

  public static getStructureLayerCategory(
    type: PlaceableType
  ): 'GROUND' | 'WALL' | 'FURNITURE' {
    return CONSTRUCTION_BLUEPRINTS[type]?.layer || 'FURNITURE';
  }

  /**
   * Returns the wall-mountable structure at (tx, ty), if any.
   */
  public hasWallStructureAtTile(
    tx: number,
    ty: number
  ): PlacedStructure | undefined {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) return undefined;
    return this.getChunkSpatialIndex(chunk).wallAtTile[ly * CHUNK_SIZE + lx];
  }

  /**
   * Returns true when a wall, window, or door at `(tx, ty)` is oriented vertically (North-South side profile)
   * rather than horizontally (East-West front elevation).
   * When connected to neighbors (mask !== 0), the connection design takes priority over manual rotation.
   */
  public isWallOrDoorSideProfileAt(
    tx: number,
    ty: number,
    st: PlacedStructure
  ): boolean {
    if (WorldManager.isDoorOrGateStructure(st.type)) {
      return (
        this.getDoorOrientationAt(
          tx,
          ty,
          st.type,
          st.orientation,
          st.rotation
        ) === 'vertical'
      );
    }
    if (!WorldManager.isWallMountableStructure(st.type)) {
      return false;
    }
    const mask = this.getStructureConnectionMask(tx, ty, st.type);
    const hasNS = (mask & 5) !== 0; // North (1) or South (4)
    const hasEW = (mask & 10) !== 0; // East (2) or West (8)
    if (mask !== 0) {
      return hasNS && !hasEW;
    }
    if (st.rotation !== undefined) {
      return st.rotation % 2 === 1;
    }
    if (st.orientation === 'vertical') return true;
    return false;
  }

  /**
   * Returns the Ground-layer structure (Floor / Carpet / Floating Platform) at (tx, ty), if any.
   */
  public getGroundStructureAtTile(tx: number, ty: number): PlacedStructure | undefined {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) return undefined;
    return this.getChunkSpatialIndex(chunk).groundAtTile[ly * CHUNK_SIZE + lx];
  }

  /**
   * Returns the top-most structure at (tx, ty) (preferring WALL/FURNITURE over SPIKE_TRAP and GROUND floors).
   */
  public getStructureAtTile(tx: number, ty: number): PlacedStructure | undefined {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || chunk.structures.length === 0) return undefined;
    return this.getChunkSpatialIndex(chunk).topAtTile[ly * CHUNK_SIZE + lx];
  }

  /**
   * Places or upgrades a structure at (tx, ty).
   * Returns `{ placed: boolean; replacedItemId?: string; attachedToWall?: boolean }` so in-place upgrades refund the old piece.
   */
  public placeStructureWithUpgrade(
    tx: number,
    ty: number,
    placeableType: PlaceableType,
    itemId: string,
    orientation: 'auto' | 'horizontal' | 'vertical' = 'auto',
    flowerColor?: ClothingColorId,
    rotation?: 0 | 1 | 2 | 3
  ): { placed: boolean; replacedItemId?: string; attachedToWall?: boolean } {
    if (!this.canPlaceStructureAt(tx, ty, placeableType)) {
      return { placed: false };
    }
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    const bp = CONSTRUCTION_BLUEPRINTS[placeableType];

    // If there is a passable Berry Bush, Sand Dune, or natural Flower on the tile, clear it cleanly
    const bushIdx = chunk.nodes.findIndex(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        WorldManager.isPassableGroundNode(n.type)
    );
    if (bushIdx !== -1) {
      chunk.nodes.splice(bushIdx, 1);
    }

    let replacedItemId: string | undefined;
    const wallOnTile = this.hasWallStructureAtTile(tx, ty);
    const ugDirtOnTile =
      this.isUnderground &&
      chunk.nodes.some(
        (n) =>
          n.tileX === tx &&
          n.tileY === ty &&
          n.hp > 0 &&
          WorldManager.isUndergroundBlockNode(n.type)
      );
    const isMountingTorchOnWall =
      placeableType === PlaceableType.TORCH &&
      (Boolean(wallOnTile) || Boolean(ugDirtOnTile));

    if (bp.layer === 'GROUND') {
      const existingFloorIdx = chunk.structures.findIndex((s) => {
        if (s.tileX !== tx || s.tileY !== ty) return false;
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return sbp?.layer === 'GROUND';
      });
      if (existingFloorIdx !== -1) {
        if (
          chunk.structures[existingFloorIdx].type !== PlaceableType.TILLED_SOIL &&
          chunk.structures[existingFloorIdx].type !== PlaceableType.DIRT_PATH
        ) {
          replacedItemId = chunk.structures[existingFloorIdx].itemId;
        }
        chunk.structures.splice(existingFloorIdx, 1);
      }
    } else if (bp.layer === 'WALL') {
      const existingWallIdx = chunk.structures.findIndex((s) => {
        if (s.tileX !== tx || s.tileY !== ty) return false;
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return sbp?.layer === 'WALL';
      });
      if (existingWallIdx !== -1) {
        replacedItemId = chunk.structures[existingWallIdx].itemId;
        chunk.structures.splice(existingWallIdx, 1);
      }
    } else if (
      bp.layer === 'FURNITURE' &&
      placeableType !== PlaceableType.SPIKE_TRAP &&
      !isMountingTorchOnWall
    ) {
      const existingFurnIdx = chunk.structures.findIndex((s) => {
        if (s.tileX !== tx || s.tileY !== ty) return false;
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return sbp?.layer === 'FURNITURE' && s.type !== PlaceableType.SPIKE_TRAP;
      });
      if (existingFurnIdx !== -1) {
        replacedItemId = chunk.structures[existingFurnIdx].itemId;
        chunk.structures.splice(existingFurnIdx, 1);
      }
    }

    const resolvedOrientation: 'auto' | 'horizontal' | 'vertical' =
      rotation !== undefined
        ? rotation % 2 === 1
          ? 'vertical'
          : 'horizontal'
        : orientation;

    const newStruct: PlacedStructure = {
      id: `struct_${tx}_${ty}_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      type: placeableType,
      itemId,
      tileX: tx,
      tileY: ty,
      hp: bp.maxHp,
      maxHp: bp.maxHp,
      solid: bp.hasHitbox,
      isBridge: placeableType === PlaceableType.WOOD_BRIDGE,
      isOpen: false,
      orientation: resolvedOrientation,
      rotation,
      lightRadius: bp.lightRadius,
      hitFlashTimer: 0,
      attachedToWall: isMountingTorchOnWall ? true : undefined,
      flowerColor,
      growthStage: WorldManager.isSaplingStructure(placeableType)
        ? 0
        : undefined,
      growthProgress: WorldManager.isSaplingStructure(placeableType)
        ? 0
        : undefined,
      fertilized: WorldManager.isSaplingStructure(placeableType)
        ? false
        : undefined,
      storageSlots:
        placeableType === PlaceableType.CHEST
          ? new Array(CHEST_STORAGE_SIZE).fill(null)
          : undefined,
      ownerType:
        placeableType === PlaceableType.MARKET_STALL ||
        placeableType === PlaceableType.EXPLORER_TENT ||
        placeableType === PlaceableType.VILLAGE_HOUSE ||
        WorldManager.isDoorOrGateStructure(placeableType)
          ? 'PLAYER'
          : undefined,
      ownerId:
        placeableType === PlaceableType.MARKET_STALL ||
        placeableType === PlaceableType.EXPLORER_TENT ||
        placeableType === PlaceableType.VILLAGE_HOUSE ||
        WorldManager.isDoorOrGateStructure(placeableType)
          ? 'player'
          : undefined,
      ownerName:
        placeableType === PlaceableType.MARKET_STALL
          ? 'Você (Mercador)'
          : placeableType === PlaceableType.EXPLORER_TENT ||
            placeableType === PlaceableType.VILLAGE_HOUSE ||
            WorldManager.isDoorOrGateStructure(placeableType)
          ? 'Você'
          : undefined,
      stallOpen:
        placeableType === PlaceableType.MARKET_STALL ? true : undefined,
      stallSlots:
        placeableType === PlaceableType.MARKET_STALL
          ? new Array(MARKET_STALL_SIZE).fill(null)
          : undefined,
      stallSalesCount:
        placeableType === PlaceableType.MARKET_STALL ? 0 : undefined,
      stallTotalGoldEarned:
        placeableType === PlaceableType.MARKET_STALL ? 0 : undefined,
    };

    chunk.structures.push(newStruct);

    // If this is a Door/Gate that connects into a Double Door, synchronize its open state with its partner
    if (WorldManager.isDoorOrGateStructure(placeableType)) {
      const dbl = this.getPartnerDoubleDoor(tx, ty, newStruct);
      if (dbl) {
        newStruct.isOpen = Boolean(dbl.partner.isOpen);
      }
    }

    if (!chunk.preserved) {
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunk.genVersion ?? this.worldGenVersion,
        chunk.generatedGameVersion ?? GAME_VERSION
      );
    }
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
    this.syncChunkAgricultureIndex(chunk);

    return { placed: true, replacedItemId, attachedToWall: isMountingTorchOnWall };
  }

  public placeStructure(
    tx: number,
    ty: number,
    placeableType: PlaceableType,
    itemId: string
  ): boolean {
    return this.placeStructureWithUpgrade(tx, ty, placeableType, itemId).placed;
  }

  private isChunkAllLand(cx: number, cy: number): boolean {
    const baseTx = cx * CHUNK_SIZE;
    const baseTy = cy * CHUNK_SIZE;
    for (let ly = 4; ly <= 12; ly++) {
      for (let lx = 4; lx <= 12; lx++) {
        if (this.getTileBiomeFast(baseTx + lx, baseTy + ly) === BiomeType.OCEAN) {
          return false;
        }
      }
    }
    return true;
  }

  public getExploredChunksCount(): number {
    let count = 0;
    for (const chunk of Object.values(this.chunks)) {
      if (!chunk) continue;
      if (
        (Array.isArray(chunk.explored) && chunk.explored.some((v) => v > 0)) ||
        (typeof chunk.compactExplored === 'string' &&
          chunk.compactExplored.length > 0 &&
          !/^0+$/.test(chunk.compactExplored))
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Checks whether a tile is within `radius` tiles of natural water (Ocean/Lake)
   * or an artificial water source (Village Well / Healing Fountain).
   */
  public isTileNearWater(tx: number, ty: number, radius = 3): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.hypot(dx, dy) > radius) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (this.getTileBiomeFast(nx, ny) === BiomeType.OCEAN) {
          return true;
        }
        const st = this.getStructureAtTile(nx, ny);
        if (
          st &&
          (st.type === PlaceableType.VILLAGE_WELL ||
            st.type === PlaceableType.HEALING_FOUNTAIN)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the given biome can receive rain (Deserts never receive rain).
   */
  public canBiomeReceiveRain(biome: BiomeType): boolean {
    return biome !== BiomeType.DESERT;
  }

  /**
   * Returns true if rain is valid at tile `(tx, ty)` (not in the Desert biome).
   */
  public isRainValidAtTile(tx: number, ty: number): boolean {
    const biome = this.getTileBiomeFast(tx, ty);
    return this.canBiomeReceiveRain(biome);
  }

  /**
   * Returns the active RainPuddle at `(tx, ty)`, if one exists.
   */
  public getRainPuddleAtTile(tx: number, ty: number): RainPuddle | undefined {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk || !Array.isArray(chunk.puddles) || chunk.puddles.length === 0) {
      return undefined;
    }
    return chunk.puddles.find((p) => p.tileX === tx && p.tileY === ty && p.decayTimer > 0);
  }

  /**
   * Returns true if there is an active rain puddle on `(tx, ty)`.
   */
  public hasRainPuddleAtTile(tx: number, ty: number): boolean {
    return Boolean(this.getRainPuddleAtTile(tx, ty));
  }

  /**
   * Checks whether a rain puddle can form on empty soil at `(tx, ty)` during a long rain.
   */
  public canSpawnRainPuddleAtTile(tx: number, ty: number): boolean {
    if (!this.isRainValidAtTile(tx, ty)) return false;
    const biome = this.getTileBiomeFast(tx, ty);
    if (biome === BiomeType.OCEAN || this.isTileSwimmableWater(tx, ty)) {
      return false;
    }
    if (this.getEcologicalZoneAtTile(tx, ty) === EcologicalZone.COASTAL_TROPICS) {
      return false;
    }
    if (this.hasRainPuddleAtTile(tx, ty)) {
      return false;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return false;

    // Enforce spacing between puddles so they remain sparse and natural
    if (
      Array.isArray(chunk.puddles) &&
      chunk.puddles.some(
        (p) => p.decayTimer > 0 && Math.hypot(p.tileX - tx, p.tileY - ty) < 5
      )
    ) {
      return false;
    }

    // Must be empty soil: no structures (floors, paths, tilled soil, walls, furniture)
    if (
      Array.isArray(chunk.structures) &&
      chunk.structures.some((s) => s.tileX === tx && s.tileY === ty && s.hp > 0)
    ) {
      return false;
    }

    // Must not have any nature node on that tile
    if (
      Array.isArray(chunk.nodes) &&
      chunk.nodes.some((n) => n.tileX === tx && n.tileY === ty && n.hp > 0)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Spawns a temporary rain puddle on empty soil at `(tx, ty)` with a determined evaporation timer.
   */
  public spawnRainPuddleAtTile(
    tx: number,
    ty: number,
    decaySeconds = 85
  ): RainPuddle | null {
    if (!this.canSpawnRainPuddleAtTile(tx, ty)) return null;
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    if (!Array.isArray(chunk.puddles)) {
      chunk.puddles = [];
    }
    const variant = Math.abs((tx * 37 + ty * 73) % 4);
    const puddle: RainPuddle = {
      tileX: tx,
      tileY: ty,
      decayTimer: decaySeconds,
      maxDecayTimer: decaySeconds,
      variant,
    };
    chunk.puddles.push(puddle);
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
    this.activeAgricultureChunkKeys.add(WorldManager.chunkKey(cx, cy));
    return puddle;
  }

  /**
   * Checks whether a tile can be tilled into arable farmland using a Hoe.
   */
  public canTillTileAt(tx: number, ty: number): boolean {
    // Water tiles or tiles covered by a rain puddle cannot be tilled
    if (
      this.getTileBiomeFast(tx, ty) === BiomeType.OCEAN ||
      this.hasRainPuddleAtTile(tx, ty)
    ) {
      return false;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return true;

    // Solid nature nodes prevent tilling (passable berry bushes, sand dunes, and flowers are allowed to be cleared)
    const node = chunk.nodes.find((n) => n.tileX === tx && n.tileY === ty);
    if (node && !WorldManager.isPassableGroundNode(node.type)) {
      return false;
    }

    // Check existing structures on the tile
    for (const st of chunk.structures) {
      if (st.tileX === tx && st.tileY === ty) {
        if (
          st.type === PlaceableType.TILLED_SOIL ||
          WorldManager.isSaplingStructure(st.type)
        ) {
          return false;
        }
        const bp = CONSTRUCTION_BLUEPRINTS[st.type];
        if (bp?.hasHitbox || bp?.layer === 'GROUND' || bp?.layer === 'WALL') {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Tills the soil at (tx, ty), creating a TILLED_SOIL ground structure.
   */
  public tillSoilAt(tx: number, ty: number, isRainingNow = false): PlacedStructure | null {
    if (!this.canTillTileAt(tx, ty)) {
      return null;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);

    // Clear any passable ground node (berry bush, sand dune, or flower) on tile
    const bushIdx = chunk.nodes.findIndex(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        WorldManager.isPassableGroundNode(n.type)
    );
    if (bushIdx !== -1) {
      chunk.nodes.splice(bushIdx, 1);
    }

    const rainHydrated = isRainingNow && this.isRainValidAtTile(tx, ty);
    const hydrated = rainHydrated || this.isTileNearWater(tx, ty, 3);
    const structure: PlacedStructure = {
      id: `tilled_${tx}_${ty}_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      type: PlaceableType.TILLED_SOIL,
      itemId: 'tilled_soil',
      tileX: tx,
      tileY: ty,
      hp: 40,
      maxHp: 40,
      solid: false,
      isOpen: false,
      isWatered: hydrated,
      waterLevel: hydrated ? 100 : 0,
      growthStage: 0,
      growthProgress: 0,
      fertilized: false,
      hitFlashTimer: 0,
    };

    chunk.structures.push(structure);
    if (!chunk.preserved) {
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunk.genVersion ?? this.worldGenVersion,
        chunk.generatedGameVersion ?? GAME_VERSION
      );
    }
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
    this.activeAgricultureChunkKeys.add(WorldManager.chunkKey(cx, cy));
    return structure;
  }

  /**
   * Checks whether a tile can be compacted into a Beaten Earth Path (PlaceableType.DIRT_PATH) using a Shovel.
   */
  public canMakeDirtPathAt(tx: number, ty: number): boolean {
    if (
      this.getTileBiomeFast(tx, ty) === BiomeType.OCEAN ||
      this.hasRainPuddleAtTile(tx, ty)
    ) {
      return false;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return true;

    // Solid nature nodes prevent making a path (passable berry bushes, grass, and flowers are cleared automatically)
    const node = chunk.nodes.find((n) => n.tileX === tx && n.tileY === ty);
    if (node && !WorldManager.isPassableGroundNode(node.type)) {
      return false;
    }

    for (const st of chunk.structures) {
      if (st.tileX === tx && st.tileY === ty) {
        if (
          st.type === PlaceableType.DIRT_PATH ||
          st.type === PlaceableType.TILLED_SOIL ||
          WorldManager.isSaplingStructure(st.type)
        ) {
          return false;
        }
        const bp = CONSTRUCTION_BLUEPRINTS[st.type];
        if (bp?.hasHitbox || bp?.layer === 'GROUND' || bp?.layer === 'WALL') {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Compacts the ground at (tx, ty) with a Shovel, creating a PlaceableType.DIRT_PATH structure (+18% walk speed).
   */
  public makeDirtPathAt(tx: number, ty: number): PlacedStructure | null {
    if (!this.canMakeDirtPathAt(tx, ty)) {
      return null;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);

    // Clear any passable ground node (berry bush, grass, sand dune, or flower) on the tile
    const bushIdx = chunk.nodes.findIndex(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        WorldManager.isPassableGroundNode(n.type)
    );
    if (bushIdx !== -1) {
      chunk.nodes.splice(bushIdx, 1);
    }

    const structure: PlacedStructure = {
      id: `dirt_path_${tx}_${ty}_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      type: PlaceableType.DIRT_PATH,
      itemId: 'dirt_path',
      tileX: tx,
      tileY: ty,
      hp: 40,
      maxHp: 40,
      solid: false,
      isOpen: false,
      hitFlashTimer: 0,
    };

    chunk.structures.push(structure);
    if (!chunk.preserved) {
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunk.genVersion ?? this.worldGenVersion,
        chunk.generatedGameVersion ?? GAME_VERSION
      );
    }
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
    return structure;
  }

  /**
   * Returns true if the given tile has fertile natural soil suitable for ground fertilization
   * (not water, ocean, desert sand, coastal beach sand, rain puddle, or occupied by a floor/structure).
   */
  public isTileFertileSoilForGroundFertilizer(tx: number, ty: number): boolean {
    if (this.isTileSwimmableWater(tx, ty) || this.hasRainPuddleAtTile(tx, ty)) {
      return false;
    }
    const biome = this.getTileBiomeFast(tx, ty);
    if (biome === BiomeType.OCEAN || biome === BiomeType.DESERT) return false;
    // Exclude sandy beach strips on islands and all ocean coastlines
    if (this.getEcologicalZoneAtTile(tx, ty) === EcologicalZone.COASTAL_TROPICS) {
      return false;
    }
    const subZone = this.getTileSubZone(tx, ty, biome);
    if (biome === BiomeType.ISLAND && subZone === 1) return false;

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    // Cannot fertilize over structures, floors, paths, tilled soil, or bridges
    for (let i = 0; i < chunk.structures.length; i++) {
      const s = chunk.structures[i];
      if (s.hp <= 0) continue;
      if (s.tileX === tx && s.tileY === ty) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns true if a tile is fertile soil AND currently has no living NatureNode on it.
   */
  public canFertilizeGroundAtTile(tx: number, ty: number): boolean {
    if (!this.isTileFertileSoilForGroundFertilizer(tx, ty)) return false;
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    for (let i = 0; i < chunk.nodes.length; i++) {
      const n = chunk.nodes[i];
      if (n.hp > 0 && n.tileX === tx && n.tileY === ty) {
        return false;
      }
    }
    return true;
  }

  /**
   * Applies ground fertilizer centered at (worldX, worldY) within radiusPx (default 60px).
   * Each valid empty fertile cell within radiusPx has an 80% chance to spawn irregular
   * natural simple vegetation (short grass, tall grass, and local biome flowers).
   */
  public fertilizeGroundAtWorldPos(
    worldX: number,
    worldY: number,
    radiusPx = 60
  ): {
    hasValidSoilInRadius: boolean;
    spawnedNodes: NatureNode[];
    modifiedChunkKeys: Set<string>;
  } {
    const minTx = Math.floor((worldX - radiusPx) / TILE_SIZE);
    const maxTx = Math.floor((worldX + radiusPx) / TILE_SIZE);
    const minTy = Math.floor((worldY - radiusPx) / TILE_SIZE);
    const maxTy = Math.floor((worldY + radiusPx) / TILE_SIZE);
    const radiusSq = radiusPx * radiusPx;

    let hasValidSoilInRadius = false;
    const spawnedNodes: NatureNode[] = [];
    const modifiedChunkKeys = new Set<string>();

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        // Check if tile center or nearest point on tile is within radiusPx
        const tileCenterX = tx * TILE_SIZE + TILE_SIZE * 0.5;
        const tileCenterY = ty * TILE_SIZE + TILE_SIZE * 0.5;
        const dx = tileCenterX - worldX;
        const dy = tileCenterY - worldY;
        if (dx * dx + dy * dy > radiusSq) continue;

        if (!this.isTileFertileSoilForGroundFertilizer(tx, ty)) continue;
        hasValidSoilInRadius = true;

        if (!this.canFertilizeGroundAtTile(tx, ty)) continue;

        // 80% chance per valid cell to generate simple natural irregular vegetation
        if (Math.random() >= 0.80) continue;

        const biome = this.getTileBiomeFast(tx, ty);
        const roll = Math.random();
        let nodeType: NatureNodeType = NatureNodeType.SHORT_GRASS;

        if (biome === BiomeType.TAIGA_FOREST) {
          if (roll < 0.14) {
            nodeType = NatureNodeType.FLOWER_LILY;
          } else if (roll < 0.44) {
            nodeType = NatureNodeType.TALL_GRASS;
          } else {
            nodeType = NatureNodeType.SHORT_GRASS;
          }
        } else if (biome === BiomeType.TEMPERATE_FOREST) {
          if (roll < 0.10) {
            nodeType = NatureNodeType.FLOWER_LILY;
          } else if (roll < 0.18) {
            nodeType = NatureNodeType.FLOWER_TULIP;
          } else if (roll < 0.68) {
            nodeType = NatureNodeType.TALL_GRASS;
          } else {
            nodeType = NatureNodeType.SHORT_GRASS;
          }
        } else if (biome === BiomeType.FOREST) {
          if (roll < 0.09) {
            nodeType = NatureNodeType.FLOWER_TULIP;
          } else if (roll < 0.17) {
            nodeType = NatureNodeType.FLOWER_LILY;
          } else if (roll < 0.62) {
            nodeType = NatureNodeType.TALL_GRASS;
          } else {
            nodeType = NatureNodeType.SHORT_GRASS;
          }
        } else if (biome === BiomeType.ISLAND) {
          if (roll < 0.10) {
            nodeType = NatureNodeType.FLOWER_SOLAR_DROP;
          } else if (roll < 0.18) {
            nodeType = NatureNodeType.FLOWER_SUNFLOWER;
          } else if (roll < 0.54) {
            nodeType = NatureNodeType.TALL_GRASS;
          } else {
            nodeType = NatureNodeType.SHORT_GRASS;
          }
        } else {
          // PLAINS and default fertile land
          if (roll < 0.06) {
            nodeType = NatureNodeType.FLOWER_TULIP;
          } else if (roll < 0.11) {
            nodeType = NatureNodeType.FLOWER_SUNFLOWER;
          } else if (roll < 0.15) {
            nodeType = NatureNodeType.FLOWER_LILY;
          } else if (roll < 0.18) {
            nodeType = NatureNodeType.FLOWER_SOLAR_DROP;
          } else if (roll < 0.56) {
            nodeType = NatureNodeType.TALL_GRASS;
          } else {
            nodeType = NatureNodeType.SHORT_GRASS;
          }
        }

        // Irregular natural offset within the cell
        const ox = Math.round((Math.random() - 0.5) * 18);
        const oy = Math.round((Math.random() - 0.5) * 18);
        const flowerColors: ClothingColorId[] = [
          'vermelho',
          'amarelo',
          'azul',
          'branco',
          'roxo',
          'rosa',
          'laranja',
        ];
        const isFlowerNode =
          nodeType === NatureNodeType.FLOWER_TULIP ||
          nodeType === NatureNodeType.FLOWER_LILY ||
          nodeType === NatureNodeType.FLOWER_SUNFLOWER ||
          nodeType === NatureNodeType.FLOWER_SOLAR_DROP;
        const flowerColor: ClothingColorId | undefined = isFlowerNode
          ? nodeType === NatureNodeType.FLOWER_SUNFLOWER ||
            nodeType === NatureNodeType.FLOWER_SOLAR_DROP
            ? 'amarelo'
            : flowerColors[Math.floor(Math.random() * flowerColors.length)]
          : undefined;
        const node = this.createNatureNode(
          nodeType,
          tx,
          ty,
          Math.random(),
          flowerColor,
          Math.floor(Math.random() * 3),
          ox,
          oy
        );

        const { cx, cy } = this.tileToChunk(tx, ty);
        const chunk = this.getOrCreateChunk(cx, cy);
        chunk.nodes.push(node);
        if (!chunk.preserved) {
          WorldManager.lockChunkTerrainSnapshot(
            chunk,
            chunk.genVersion ?? this.worldGenVersion,
            chunk.generatedGameVersion ?? GAME_VERSION
          );
        }
        chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
        spawnedNodes.push(node);
        modifiedChunkKeys.add(`${cx},${cy}`);
      }
    }

    return {
      hasValidSoilInRadius,
      spawnedNodes,
      modifiedChunkKeys,
    };
  }

  /**
   * Converts a fully grown sapling (Stage 3 = Adult Tree) into a mature NatureNode on its tile.
   */
  public MatureSaplingIntoTree(
    chunk: ChunkData,
    sapling: PlacedStructure
  ): boolean {
    const idx = chunk.structures.indexOf(sapling);
    if (idx !== -1) {
      chunk.structures.splice(idx, 1);
    }
    const alreadyHasNode = chunk.nodes.some(
      (n) => n.tileX === sapling.tileX && n.tileY === sapling.tileY
    );
    if (!alreadyHasNode) {
      let targetNodeType = NatureNodeType.OAK_TREE;
      if (sapling.type === PlaceableType.PALM_SAPLING) {
        targetNodeType = NatureNodeType.PALM_TREE;
      } else if (sapling.type === PlaceableType.DARK_OAK_SAPLING) {
        targetNodeType = NatureNodeType.TEMPERATE_TREE;
      } else if (sapling.type === PlaceableType.PINE_SAPLING) {
        targetNodeType = NatureNodeType.PINE_TREE;
      }
      const r = hash2D(sapling.tileX, sapling.tileY, this.seed + 31);
      chunk.nodes.push(
        this.createNatureNode(targetNodeType, sapling.tileX, sapling.tileY, r)
      );
    }
    if (!chunk.preserved) {
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunk.genVersion ?? this.worldGenVersion,
        chunk.generatedGameVersion ?? GAME_VERSION
      );
    }
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
    this.syncChunkAgricultureIndex(chunk);
    return true;
  }

  /**
   * Updates agriculture state (moisture evaporation, crop growth, tree sapling 3-stage growth, and rain puddle evaporation).
   * Iterates ONLY over `activeAgricultureChunkKeys` so marathon exploration (3,000+ chunks) has O(1) cost.
   */
  public updateAgriculture(dt: number, isRaining = false): void {
    if (this.activeAgricultureChunkKeys.size === 0) return;
    const stageDuration = 22; // ~22s per stage watered, or ~11s with fertilizer

    for (const chunkKey of Array.from(this.activeAgricultureChunkKeys)) {
      const chunk = this.chunks[chunkKey];
      if (!chunk || !Array.isArray(chunk.structures)) {
        this.activeAgricultureChunkKeys.delete(chunkKey);
        continue;
      }

      let hasAnyAgriInChunk = false;
      let chunkModified = false;

      // Update temporary Rain Puddles in this chunk:
      // While it is raining on valid biome tiles, puddles remain full; once rain passes, they count down and evaporate.
      if (Array.isArray(chunk.puddles) && chunk.puddles.length > 0) {
        for (let pi = chunk.puddles.length - 1; pi >= 0; pi--) {
          const puddle = chunk.puddles[pi];
          if (!puddle) {
            chunk.puddles.splice(pi, 1);
            continue;
          }
          const rainingOnPuddle =
            isRaining && this.isRainValidAtTile(puddle.tileX, puddle.tileY);
          if (rainingOnPuddle) {
            puddle.decayTimer = Math.min(
              puddle.maxDecayTimer || 85,
              puddle.decayTimer + dt * 0.6
            );
            hasAnyAgriInChunk = true;
          } else {
            puddle.decayTimer -= dt;
            chunkModified = true;
            if (puddle.decayTimer <= 0) {
              chunk.puddles.splice(pi, 1);
            } else {
              hasAnyAgriInChunk = true;
            }
          }
        }
      }

      for (let i = chunk.structures.length - 1; i >= 0; i--) {
        const st = chunk.structures[i];
        if (!st) continue;

        // A. Tree Sapling 3-stage growth:
        // Stage 0 (Muda) -> Stage 1 (Árvore/Palmeira Pequena) -> Stage 2 (Árvore/Palmeira Adulta)
        // Oak Sapling total = 180s (3 minutes -> 90s per stage transition)
        // Palm Sapling total = 300s (5 minutes -> 150s per stage transition)
        if (WorldManager.isSaplingStructure(st.type)) {
          hasAnyAgriInChunk = true;
          const saplingStageDuration =
            st.type === PlaceableType.PALM_SAPLING ? 150 : 90;
          const fertBoost = st.fertilized ? 2.0 : 1.0;
          const progressSpeed = (1 / saplingStageDuration) * fertBoost;
          st.growthStage = st.growthStage ?? 0;
          st.growthProgress = (st.growthProgress || 0) + dt * progressSpeed;
          chunkModified = true;

          if (st.growthProgress >= 1) {
            st.growthProgress = 0;
            st.growthStage += 1;
            if (st.growthStage >= 2) {
              this.MatureSaplingIntoTree(chunk, st);
            }
          }
          continue;
        }

        if (st.type !== PlaceableType.TILLED_SOIL) continue;
        hasAnyAgriInChunk = true;

        // 1. Water & Hydration logic (Rain naturally waters all tilled soil where rain is valid, i.e., outside the Desert)
        const nearWater = this.isTileNearWater(st.tileX, st.tileY, 3);
        const rainedOnTile =
          isRaining && this.isRainValidAtTile(st.tileX, st.tileY);
        if (rainedOnTile || nearWater) {
          if (!st.isWatered || st.waterLevel !== 100) {
            st.isWatered = true;
            st.waterLevel = 100;
            chunkModified = true;
          }
        } else if (st.waterLevel !== undefined && st.waterLevel > 0) {
          st.waterLevel = Math.max(0, st.waterLevel - dt * 2.2);
          if (st.waterLevel <= 0) {
            st.isWatered = false;
          }
          chunkModified = true;
        }

        // 2. Crop Growth logic
        if (st.cropType && st.growthStage !== undefined && st.growthStage < 3) {
          if (st.isWatered) {
            const fertBoost = st.fertilized ? 2.0 : 1.0;
            const progressSpeed = (1 / stageDuration) * fertBoost;
            st.growthProgress = (st.growthProgress || 0) + dt * progressSpeed;
            chunkModified = true;

            if (st.growthProgress >= 1) {
              st.growthProgress = 0;
              st.growthStage += 1;
            }
          }
        }
      }

      if (chunkModified) {
        chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
      }
      if (!hasAnyAgriInChunk) {
        this.activeAgricultureChunkKeys.delete(chunkKey);
      }
    }
  }
}

