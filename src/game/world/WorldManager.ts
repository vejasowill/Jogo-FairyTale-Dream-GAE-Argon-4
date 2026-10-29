import {
  CONSTRUCTION_BLUEPRINTS,
  getItemBasePrice,
  NATURE_BLUEPRINTS,
} from '../core/ItemRegistry';
import {
  BiomeType,
  CHEST_STORAGE_SIZE,
  ChunkData,
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
} from '../core/types';

export const TILE_SIZE = 32;
export const CHUNK_SIZE = 16;
export const CHUNK_WORLD_SIZE = TILE_SIZE * CHUNK_SIZE;

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

function hash2D(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
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
  public chunks: Record<string, ChunkData> = {};

  constructor(
    seed: number,
    existingChunks?: Record<string, ChunkData>,
    legacyWorldGenVersion = CURRENT_WORLD_GEN_VERSION
  ) {
    this.seed = seed;
    this.legacyChunkGenVersion = legacyWorldGenVersion;
    this.worldGenVersion = CURRENT_WORLD_GEN_VERSION;

    if (existingChunks) {
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
        this.chunks[key] = this.hydrateChunk(chunk);
      }
    }
  }

  /**
   * Returns true if a chunk has been explored by the player (at least 1 revealed tile)
   * or contains player-built / modified structures.
   */
  public static isChunkExploredOrModified(chunk: ChunkData): boolean {
    if (!chunk) return false;
    if (chunk.preserved) return true;
    const hasExplored =
      Array.isArray(chunk.explored) && chunk.explored.some((v) => v > 0);
    if (hasExplored) return true;
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
    return hasPlayerOrCustomStruct;
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
          const biome = needsTiles
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
            chunk.ecologicalZones[idx] = this.computeEcologicalZoneAtTile(
              tx,
              ty,
              biome
            );
          }
        }
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

    // Restore static blueprint properties on NatureNodes WITHOUT deleting or altering existing nodes!
    if (Array.isArray(chunk.nodes)) {
      for (let i = 0; i < chunk.nodes.length; i++) {
        const n = chunk.nodes[i];
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

  public getOrCreateChunk(cx: number, cy: number): ChunkData {
    const key = WorldManager.chunkKey(cx, cy);
    if (!this.chunks[key]) {
      // Unexplored chunk: generate fresh using the current latest worldGenVersion for this seed!
      const generated = this.generateChunkV2(cx, cy);
      generated.genVersion = this.worldGenVersion;
      generated.generatedGameVersion = GAME_VERSION;
      generated.compactTiles = WorldManager.encodeCompactTiles(generated.tiles);
      generated.compactZones = WorldManager.encodeCompactZones(
        generated.ecologicalZones
      );
      generated.compactVariants = WorldManager.encodeCompactVariants(
        generated.tileVariants
      );
      this.chunks[key] = generated;
    } else if (
      !Array.isArray(this.chunks[key].tiles) ||
      this.chunks[key].tiles.length !== CHUNK_SIZE * CHUNK_SIZE
    ) {
      this.hydrateChunk(this.chunks[key]);
    }
    return this.chunks[key];
  }

  /**
   * Evaluates raw hydrological features at `(tx, ty)`:
   * - Predominant dry land continent (`~84%+` of the world)
   * - Immense Oceans very far apart (`continentalElev < 0.312` at low frequency `0.0038`)
   * - Oceanic Islands inside the oceans (`islandNoise > 0.605`)
   * - Rare meandering Rivers that flow downhill and empty directly into the Ocean (`waterKind === 'river'`)
   * - Localized inland Lakes & Desert Oases (`waterKind === 'lake'`)
   */
  private getRawWaterAtTile(
    tx: number,
    ty: number
  ): {
    waterKind: 'none' | 'ocean' | 'river' | 'lake';
    isIslandLand: boolean;
    continentalElev: number;
    riverMeander: number;
    climate: number;
  } {
    const distFromOrigin = Math.hypot(tx, ty);

    // Organic domain warping for natural coastlines, bays, and peninsulas
    const warpX =
      (smoothNoise(tx * 0.018, ty * 0.018, this.seed + 101) - 0.5) * 24;
    const warpY =
      (smoothNoise(tx * 0.018, ty * 0.018, this.seed + 202) - 0.5) * 24;
    const wx = tx + warpX;
    const wy = ty + warpY;

    // Low-frequency continental elevation so dry land is predominant and oceans are immense and very far apart
    let continentalElev = fbm(wx * 0.0038, wy * 0.0038, this.seed, 4);
    if (distFromOrigin < 36) {
      const boost = Math.max(0, (36 - distFromOrigin) / 36) * 0.25;
      continentalElev += boost;
    }

    const climate = fbm(
      wx * 0.016 + 150,
      wy * 0.016 - 120,
      this.seed + 777,
      3
    );
    const riverMeander =
      fbm(wx * 0.0078 + 310, wy * 0.0078 - 240, this.seed + 4409, 3) - 0.48;

    const OCEAN_LEVEL = 0.312;

    // 1. Immense Ocean Basins & Oceanic Islands
    if (continentalElev < OCEAN_LEVEL) {
      if (continentalElev < OCEAN_LEVEL - 0.016 && continentalElev > 0.12) {
        const islandNoise = fbm(
          tx * 0.025 + warpX * 0.25,
          ty * 0.025 + warpY * 0.25,
          this.seed + 1901,
          3
        );
        if (islandNoise > 0.605) {
          return {
            waterKind: 'none',
            isIslandLand: true,
            continentalElev,
            riverMeander,
            climate,
          };
        }
      }
      return {
        waterKind: 'ocean',
        isIslandLand: false,
        continentalElev,
        riverMeander,
        climate,
      };
    }

    // Guarantee starter heartland around (0, 0) is open dry land
    if (distFromOrigin < 16) {
      return {
        waterKind: 'none',
        isIslandLand: false,
        continentalElev,
        riverMeander,
        climate,
      };
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
      const halfWidth = 0.0145 * (1 - 0.52 * riverProgress);
      if (Math.abs(riverMeander) < halfWidth) {
        return {
          waterKind: 'river',
          isIslandLand: false,
          continentalElev,
          riverMeander,
          climate,
        };
      }
    }

    // 3. Localized Inland Lakes & Desert Oases (keeping dry land strongly predominant)
    if (climate < 0.445) {
      const oasisPotential = smoothNoise(
        tx * 0.065,
        ty * 0.065,
        this.seed + 3307
      );
      if (
        distFromOrigin > 20 &&
        continentalElev > 0.37 &&
        oasisPotential > 0.875
      ) {
        return {
          waterKind: 'lake',
          isIslandLand: false,
          continentalElev,
          riverMeander,
          climate,
        };
      }
    } else {
      const lakeNoise = smoothNoise(tx * 0.052, ty * 0.052, this.seed + 2801);
      if (distFromOrigin > 20 && continentalElev > 0.38 && lakeNoise > 0.858) {
        return {
          waterKind: 'lake',
          isIslandLand: false,
          continentalElev,
          riverMeander,
          climate,
        };
      }
    }

    return {
      waterKind: 'none',
      isIslandLand: false,
      continentalElev,
      riverMeander,
      climate,
    };
  }

  /**
   * Checks whether a dry-land tile `(tx, ty)` is surrounded by water in all 8 directions
   * (either an oceanic island or an inland/coastal island surrounded by rivers, lakes, or sea).
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
    if (baseRaw.isIslandLand) return true;

    const OCEAN_LEVEL = 0.312;
    // Fast early-out for deep continental interior far from oceans and river channels
    if (
      baseRaw.continentalElev >= OCEAN_LEVEL + 0.075 &&
      Math.abs(baseRaw.riverMeander) > 0.045
    ) {
      return false;
    }

    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    const maxIslandRadius = 12;

    for (let d = 0; d < dirs.length; d++) {
      const [dx, dy] = dirs[d];
      let foundWaterInDir = false;
      for (let step = 1; step <= maxIslandRadius; step++) {
        if (
          this.getRawWaterAtTile(tx + dx * step, ty + dy * step).waterKind !==
          'none'
        ) {
          foundWaterInDir = true;
          break;
        }
      }
      if (!foundWaterInDir) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns complete hydrological & coastal beach classification at `(tx, ty)`.
   * Every Ocean border (both mainland and oceanic islands) has a wide sandy beach (`isOceanBeach = true`).
   */
  public getHydrologyAtTile(tx: number, ty: number): {
    waterKind: 'none' | 'ocean' | 'river' | 'lake';
    isOceanBeach: boolean;
    isIslandLand: boolean;
    continentalElev: number;
    riverMeander: number;
    climate: number;
  } {
    const raw = this.getRawWaterAtTile(tx, ty);
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

    const isIsland = this.isLandSurroundedByWater(tx, ty, raw);

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

    // Wide sandy beach belt along the ocean coast (4 to 6 tiles wide)
    const beachNoise =
      smoothNoise(tx * 0.08, ty * 0.08, this.seed + 601) * 0.011;
    if (
      !isIsland &&
      raw.continentalElev < OCEAN_LEVEL + 0.025 + beachNoise
    ) {
      return {
        waterKind: 'none',
        isOceanBeach: true,
        isIslandLand: false,
        continentalElev: raw.continentalElev,
        riverMeander: raw.riverMeander,
        climate: raw.climate,
      };
    }

    // Check up to 4 tiles around (tx, ty) so every ocean coast & island shore has a wide sandy beach
    const beachProbeOffsets: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [2, 2],
      [-2, 2],
      [2, -2],
      [-2, -2],
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
      [3, 2],
      [-3, 2],
      [3, -2],
      [-3, -2],
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
      [3, 3],
      [-3, 3],
      [3, -3],
      [-3, -3],
    ];

    for (let i = 0; i < beachProbeOffsets.length; i++) {
      const [dx, dy] = beachProbeOffsets[i];
      if (this.getRawWaterAtTile(tx + dx, ty + dy).waterKind === 'ocean') {
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
    return this.computeBiomeAtTileV2(tx, ty);
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

  private computeBiomeAtTileV2(tx: number, ty: number): BiomeType {
    const distFromOrigin = Math.hypot(tx, ty);
    if (distFromOrigin < 11) {
      return BiomeType.PLAINS;
    }

    const hydro = this.getHydrologyAtTile(tx, ty);
    if (hydro.waterKind !== 'none') {
      return BiomeType.OCEAN;
    }

    // Todo e qualquer solo que seja rodeado por água é definido como bioma ILHA (BiomeType.ISLAND)
    if (hydro.isIslandLand) {
      return BiomeType.ISLAND;
    }

    // Ocean borders on mainland are wide sandy beaches
    if (hydro.isOceanBeach) {
      return BiomeType.DESERT;
    }

    // Arid Desert Continent with fertile Oasis Springs
    if (hydro.climate < 0.445) {
      const oasisPotential = smoothNoise(
        tx * 0.065,
        ty * 0.065,
        this.seed + 3307
      );
      if (
        distFromOrigin > 20 &&
        hydro.continentalElev > 0.37 &&
        oasisPotential > 0.835
      ) {
        return BiomeType.PLAINS;
      }
      return BiomeType.DESERT;
    }

    return BiomeType.PLAINS;
  }

  /**
   * Computes the specific EcologicalZone (sub-biome) at (tx, ty) for terrain diversity,
   * foliage clustering, ground micro-details, and habitat-based mob spawning.
   */
  public computeEcologicalZoneAtTile(
    tx: number,
    ty: number,
    biome?: BiomeType
  ): EcologicalZone {
    const hydro = this.getHydrologyAtTile(tx, ty);
    const b = biome ?? (hydro.waterKind !== 'none' ? BiomeType.OCEAN : this.computeBiomeAtTile(tx, ty));
    const distFromOrigin = Math.hypot(tx, ty);

    if (b === BiomeType.OCEAN) {
      if (hydro.waterKind === 'river' || hydro.waterKind === 'lake') {
        return EcologicalZone.SHALLOW_REEF;
      }
      const n = this.computeBiomeAtTile(tx, ty - 1);
      const s = this.computeBiomeAtTile(tx, ty + 1);
      const e = this.computeBiomeAtTile(tx + 1, ty);
      const w = this.computeBiomeAtTile(tx - 1, ty);
      if (
        n !== BiomeType.OCEAN ||
        s !== BiomeType.OCEAN ||
        e !== BiomeType.OCEAN ||
        w !== BiomeType.OCEAN ||
        this.computeBiomeAtTile(tx + 2, ty) !== BiomeType.OCEAN ||
        this.computeBiomeAtTile(tx - 2, ty) !== BiomeType.OCEAN
      ) {
        return EcologicalZone.SHALLOW_REEF;
      }
      return EcologicalZone.DEEP_OCEAN;
    }

    // Immediate starter clearing so the player begins in a clean, open meadow
    if (distFromOrigin < 7.5) {
      return EcologicalZone.MEADOW_CLEARING;
    }

    // Wide sandy Ocean Beach (both mainland and oceanic islands) -> Costa de Coqueiros
    if (hydro.isOceanBeach) {
      return EcologicalZone.COASTAL_TROPICS;
    }

    const n = this.computeBiomeAtTile(tx, ty - 1);
    const s = this.computeBiomeAtTile(tx, ty + 1);
    const e = this.computeBiomeAtTile(tx + 1, ty);
    const w = this.computeBiomeAtTile(tx - 1, ty);

    const vegNoise = fbm(tx * 0.055 + 40, ty * 0.055 + 40, this.seed + 511, 3);
    const rockNoise = fbm(tx * 0.065 - 80, ty * 0.065 + 90, this.seed + 883, 3);
    const sacredNoise = smoothNoise(tx * 0.038, ty * 0.038, this.seed + 1409);

    const nearWater =
      n === BiomeType.OCEAN ||
      s === BiomeType.OCEAN ||
      e === BiomeType.OCEAN ||
      w === BiomeType.OCEAN;

    if (b === BiomeType.PLAINS || b === BiomeType.ISLAND) {
      if (b === BiomeType.ISLAND && nearWater) {
        return EcologicalZone.COASTAL_TROPICS;
      }
      if (nearWater && hydro.climate < 0.46) {
        return EcologicalZone.DESERT_OASIS;
      }

      if (rockNoise > 0.64) {
        return EcologicalZone.ROCKY_HIGHLANDS;
      }

      if (vegNoise < 0.37) {
        return EcologicalZone.MEADOW_CLEARING;
      }
      if (vegNoise < 0.58) {
        return EcologicalZone.OVERGROWN_SHRUBLAND;
      }
      if (distFromOrigin > 32 && sacredNoise > 0.7) {
        return EcologicalZone.ANCIENT_GROVE;
      }
      return EcologicalZone.DENSE_WOODLAND;
    }

    // DESERT ecological sub-zones (inland desert)
    if (nearWater) {
      return EcologicalZone.DESERT_OASIS;
    }
    if (
      n === BiomeType.PLAINS ||
      s === BiomeType.PLAINS ||
      e === BiomeType.PLAINS ||
      w === BiomeType.PLAINS
    ) {
      const oasisCheck = smoothNoise(tx * 0.065, ty * 0.065, this.seed + 3307);
      if (oasisCheck > 0.76) {
        return EcologicalZone.DESERT_OASIS;
      }
    }

    if (rockNoise > 0.61 && distFromOrigin > 15) {
      return EcologicalZone.CRYSTAL_BADLANDS;
    }

    if (vegNoise < 0.45) {
      return EcologicalZone.OPEN_SAND_DUNES;
    }

    return EcologicalZone.CACTUS_SCRUBLAND;
  }

  public getEcologicalZoneAtTile(tx: number, ty: number): EcologicalZone {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const chunk = this.chunks[`${cx},${cy}`];
    if (chunk && chunk.ecologicalZones) {
      const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      return chunk.ecologicalZones[ly * CHUNK_SIZE + lx];
    }
    const biome = chunk
      ? chunk.tiles[
          (((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE) * CHUNK_SIZE +
            (((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE)
        ]
      : this.computeBiomeAtTile(tx, ty);
    return this.computeEcologicalZoneAtTile(tx, ty, biome);
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
    return this.computeBiomeAtTile(tx, ty);
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
   */
  public getTileSubZone(tx: number, ty: number, biome: BiomeType): number {
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
    if (true) {
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
          zone === EcologicalZone.DENSE_WOODLAND ||
          zone === EcologicalZone.ANCIENT_GROVE ||
          zone === EcologicalZone.OVERGROWN_SHRUBLAND
        ) {
          return 0; // Deep Lush Clover / Forest tone
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

    // Legacy v1 sub-zone calculation
    if (biome === BiomeType.PLAINS) {
      if (
        n === BiomeType.DESERT ||
        s === BiomeType.DESERT ||
        e === BiomeType.DESERT ||
        w === BiomeType.DESERT
      ) {
        return 2;
      }
      const micro = smoothNoise(tx * 0.14, ty * 0.14, this.seed + 503);
      return micro > 0.52 ? 0 : 1;
    }

    if (
      n === BiomeType.PLAINS ||
      s === BiomeType.PLAINS ||
      e === BiomeType.PLAINS ||
      w === BiomeType.PLAINS
    ) {
      return 0;
    }
    const duneNoise = smoothNoise(tx * 0.12, ty * 0.12, this.seed + 809);
    return duneNoise > 0.56 ? 2 : 1;
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
  // V2 REALISTIC BIOME, ECOLOGICAL ZONE, TRUE RARITY & STRUCTURE GENERATOR
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

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const tx = cx * CHUNK_SIZE + lx;
        const ty = cy * CHUNK_SIZE + ly;
        const idx = ly * CHUNK_SIZE + lx;

        const biome = this.computeBiomeAtTileV2(tx, ty);
        const zone = this.computeEcologicalZoneAtTile(tx, ty, biome);
        tiles[idx] = biome;
        ecologicalZones[idx] = zone;

        const r = hash2D(tx, ty, this.seed + 31);
        tileVariants[idx] = Math.floor(r * 4);

        const distFromSpawn = Math.hypot(tx, ty);
        // Keep immediate starter clearing around (0,0) open and welcoming
        if (distFromSpawn < 4.5) continue;

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

        if (nodeType) {
          nodes.push(this.createNatureNode(nodeType, tx, ty, r));
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
  private tryGenerateChunkLandmark(chunk: ChunkData): void {
    const { cx, cy } = chunk;
    // Never place landmarks on the origin chunk (0,0) so the player's own base spot stays clean
    if (cx === 0 && cy === 0) return;

    const isGuaranteedVillageChunk =
      (cx === 1 && cy === 0) ||
      (cx === -1 && cy === 0) ||
      (cx === 0 && cy === 1);

    const landmarkRoll = hash2D(cx, cy, this.seed + 9421);
    // ~24% of chunks are eligible (or guaranteed frontier village candidate)
    if (!isGuaranteedVillageChunk && landmarkRoll > 0.24) return;

    const neighborHasLandmark =
      hash2D(cx + 1, cy, this.seed + 9421) <= 0.21 ||
      hash2D(cx - 1, cy, this.seed + 9421) <= 0.21 ||
      hash2D(cx, cy + 1, this.seed + 9421) <= 0.21 ||
      hash2D(cx, cy - 1, this.seed + 9421) <= 0.21;
    if (!isGuaranteedVillageChunk && neighborHasLandmark && landmarkRoll > 0.11) return;

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

    // 0. FRONTIER VILLAGE / DESERT OASIS VILLAGE (Vilarejo da Fronteira / Vila Mercante do Oásis)
    const shouldGenerateVillage =
      (cx === 1 && cy === 0 && isBoxAllLand(4, 4, 12, 12)) ||
      (cx === -1 &&
        cy === 0 &&
        !this.isChunkAllLand(1, 0) &&
        isBoxAllLand(4, 4, 12, 12)) ||
      (cx === 0 &&
        cy === 1 &&
        !this.isChunkAllLand(1, 0) &&
        !this.isChunkAllLand(-1, 0) &&
        isBoxAllLand(4, 4, 12, 12)) ||
      (chunkDist >= 1.8 &&
        landmarkRoll < 0.058 &&
        isBoxAllLand(4, 4, 12, 12));

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
      const isDesertVillage = centerBiome === BiomeType.DESERT;
      chunk.villageId = villageId;
      chunk.landmarkName = isDesertVillage
        ? 'Vila Mercante do Oásis'
        : 'Vilarejo de Carvalho';

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

      // 1. Central Village Plaza & Cobblestone Pathways around the Well at (8, 8)
      for (let ly = 6; ly <= 9; ly++) {
        for (let lx = 6; lx <= 9; lx++) {
          addStruct(
            lx,
            ly,
            PlaceableType.STONE_FLOOR,
            'stone_floor',
            undefined,
            undefined,
            villageId
          );
        }
      }
      // Connecting stone paths from the central plaza to each of the 4 houses
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
          PlaceableType.STONE_FLOOR,
          'stone_floor',
          undefined,
          undefined,
          villageId
        );
      }

      // Central Village Well at (8, 8)
      addStruct(
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
        floorType: PlaceableType.WOOD_FLOOR | PlaceableType.STONE_FLOOR | PlaceableType.BRICK_FLOOR;
        floorItemId: string;
        wallType: PlaceableType.WOOD_WALL | PlaceableType.STONE_WALL | PlaceableType.BRICK_WALL;
        wallItemId: string;
        windowType: PlaceableType.WOOD_WINDOW | PlaceableType.STONE_WINDOW;
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

        // B. Place Perimeter Walls, Windows, and Door
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
                PlaceableType.WOOD_DOOR,
                'wood_door',
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
        floorType: PlaceableType.WOOD_FLOOR,
        floorItemId: 'wood_floor',
        wallType: PlaceableType.WOOD_WALL,
        wallItemId: 'wood_wall',
        windowType: PlaceableType.WOOD_WINDOW,
        windowItemId: 'wood_window',
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
      // Market Stall in front of the Merchant's House at (13, 6)
      addStruct(
        13,
        5,
        PlaceableType.WOOD_FLOOR,
        'wood_floor',
        undefined,
        undefined,
        villageId
      );
      addStruct(
        13,
        6,
        PlaceableType.WOOD_FLOOR,
        'wood_floor',
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
      buildCompactVillageHouse({
        houseIdx: 2,
        role: 'anciao',
        houseTitle: 'Casa do Ancião',
        minLx: 1,
        minLy: 11,
        maxLx: 4,
        maxLy: 14,
        floorType: PlaceableType.WOOD_FLOOR,
        floorItemId: 'wood_floor',
        wallType: PlaceableType.WOOD_WALL,
        wallItemId: 'wood_wall',
        windowType: PlaceableType.WOOD_WINDOW,
        windowItemId: 'wood_window',
        doorCoord: [3, 11],
        windowCoords: [
          [2, 14],
          [1, 13],
        ],
        bed1Coord: [2, 13],
        bed2Coord: [2, 12],
        carpetCoord: [3, 12],
      });
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
      return;
    }

    if (isGuaranteedVillageChunk && landmarkRoll > 0.21) return;

    // 1. COASTAL PIER (Píer dos Navegadores) — If chunk has a horizontal transition from Land to Ocean
    if (centerBiome !== BiomeType.OCEAN) {
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
            clearNodesInBox(lx - 1, ly - 1, lx + 4, ly + 1);
            chunk.landmarkName = 'Píer dos Navegadores';
            addStruct(lx, ly - 1, PlaceableType.WOOD_FLOOR, 'wood_floor');
            addStruct(lx, ly, PlaceableType.WOOD_FLOOR, 'wood_floor');
            addStruct(lx, ly + 1, PlaceableType.WOOD_FLOOR, 'wood_floor');
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

    if (!isBoxAllLand(5, 5, 11, 11)) return;

    // 2. PRIMORDIAL GROVE SHRINE (Santuário Primordial) — Distant Ancient Grove in Plains
    if (
      centerBiome === BiomeType.PLAINS &&
      centerZone === EcologicalZone.ANCIENT_GROVE &&
      chunkDist >= 2.5
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
      chunkDist >= 1.7 &&
      (centerZone === EcologicalZone.ROCKY_HIGHLANDS ||
        centerZone === EcologicalZone.CRYSTAL_BADLANDS) &&
      landmarkRoll < 0.13
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
      chunkDist >= 1.4 &&
      (centerZone === EcologicalZone.OVERGROWN_SHRUBLAND ||
        centerZone === EcologicalZone.DENSE_WOODLAND ||
        centerZone === EcologicalZone.CACTUS_SCRUBLAND) &&
      landmarkRoll > 0.12 &&
      landmarkRoll < 0.19
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

    // 3. WATCHTOWER RUINS (Ruínas da Torre de Vigia) — Plains Highlands / Forests (chunkDist >= 1.8)
    if (
      centerBiome === BiomeType.PLAINS &&
      chunkDist >= 1.8 &&
      (centerZone === EcologicalZone.ROCKY_HIGHLANDS ||
        centerZone === EcologicalZone.DENSE_WOODLAND ||
        landmarkRoll < 0.09)
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Ruínas da Torre de Vigia';
      // Cobblestone & Brick floor courtyard
      for (let ly = 6; ly <= 10; ly++) {
        for (let lx = 6; lx <= 10; lx++) {
          if (lx >= 7 && lx <= 9 && ly >= 7 && ly <= 9) {
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

    // 4. ABANDONED EXPLORER CAMP (Acampamento de Explorador) — Plains Clearings & Shrubland
    if (centerBiome === BiomeType.PLAINS) {
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

    // 5. DESERT SUN SHRINE (Santuário Solar Antigo) — Desert Badlands / Deep Desert
    if (
      centerBiome === BiomeType.DESERT &&
      chunkDist >= 2.0 &&
      (centerZone === EcologicalZone.CRYSTAL_BADLANDS || landmarkRoll < 0.1)
    ) {
      clearNodesInBox(5, 5, 11, 11);
      chunk.landmarkName = 'Santuário Solar Antigo';
      for (let ly = 6; ly <= 10; ly++) {
        for (let lx = 6; lx <= 10; lx++) {
          if (lx >= 7 && lx <= 9 && ly >= 7 && ly <= 9) {
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

    // 6. DESERT CARAVAN POST (Posto de Caravana do Deserto — only in true inland desert, not ocean beaches)
    if (
      centerBiome === BiomeType.DESERT &&
      centerZone !== EcologicalZone.COASTAL_TROPICS
    ) {
      clearNodesInBox(6, 6, 10, 10);
      chunk.landmarkName = 'Posto da Caravana';
      for (let ly = 7; ly <= 9; ly++) {
        for (let lx = 7; lx <= 9; lx++) {
          addStruct(lx, ly, PlaceableType.WOOD_FLOOR, 'wood_floor');
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

  private createNatureNode(
    nodeType: NatureNodeType,
    tx: number,
    ty: number,
    r: number
  ): NatureNode {
    const bp = NATURE_BLUEPRINTS[nodeType];
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
      animOffset: Math.floor(r * 10),
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
          chunk.explored[tileIdx] = 1;
          touchedChunks.add(chunk);
          if (
            !wasExplored &&
            !chunk.islandMobsPopulated &&
            chunk.tiles[tileIdx] === BiomeType.ISLAND
          ) {
            newlyDiscoveredIslandChunks.add(chunk);
          }
        }
      }
    }
    // Once a chunk has explored tiles, mark it preserved and lock its terrain snapshot!
    for (const chunk of touchedChunks) {
      if (!chunk.preserved) {
        WorldManager.lockChunkTerrainSnapshot(
          chunk,
          chunk.genVersion ?? this.worldGenVersion,
          chunk.generatedGameVersion ?? GAME_VERSION
        );
      }
    }
    return Array.from(newlyDiscoveredIslandChunks);
  }

  /**
   * Authoritative check for whether a PlacedStructure currently blocks physical movement (has an active Hitbox).
   * Ensures floors, carpets, bridges, torches, lanterns, banners, campfires, traps, and OPEN doors/gates
   * NEVER block the player or creatures — even in legacy saved worlds!
   */
  public static isStructureCurrentlySolid(st: PlacedStructure): boolean {
    const bp = CONSTRUCTION_BLUEPRINTS[st.type];
    if (!bp) return Boolean(st.solid);
    if (!bp.hasHitbox) return false;
    if (bp.hitboxBehavior === 'DYNAMIC_DOOR') {
      return !st.isOpen;
    }
    return true;
  }

  /**
   * Returns true if tile `(tx, ty)` is open water (`BiomeType.OCEAN` without a Bridge or Ground Floor structure),
   * meaning any entity or player on this tile is swimming.
   */
  public isTileSwimmableWater(tx: number, ty: number): boolean {
    const biome = this.getTileBiomeFast(tx, ty);
    if (biome !== BiomeType.OCEAN) return false;

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return true;

    for (const st of chunk.structures) {
      if (st.tileX === tx && st.tileY === ty) {
        if (
          st.isBridge ||
          st.type === PlaceableType.WOOD_BRIDGE ||
          CONSTRUCTION_BLUEPRINTS[st.type]?.layer === 'GROUND'
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Returns true if world coordinate `(wx, wy)` is in open swimmable water (`BiomeType.OCEAN` without a bridge).
   */
  public isWorldPosInWater(wx: number, wy: number): boolean {
    const { tx, ty } = this.worldToTile(wx, wy);
    return this.isTileSwimmableWater(tx, ty);
  }

  /**
   * Computes the active water current vector `(vx, vy)` at tile `(tx, ty)`:
   * - `river`: River current that follows the winding river channel downstream toward the Ocean mouth.
   * - `ocean_shore`: Coastal surf waves along the Ocean edge that push swimmers toward the sandy Beach (`o mar empurra para a areia`).
   * - `none`: Calm inland lakes or deep open ocean far from shore.
   */
  public getWaterCurrentAtTile(
    tx: number,
    ty: number,
    globalTime = 0
  ): { vx: number; vy: number; kind: 'none' | 'river' | 'ocean_shore' } {
    if (!this.isTileSwimmableWater(tx, ty)) {
      return { vx: 0, vy: 0, kind: 'none' };
    }

    const raw = this.getRawWaterAtTile(tx, ty);

    // 1. River Current: flows along the meandering channel downstream into the Ocean
    if (raw.waterKind === 'river') {
      const rE = this.getRawWaterAtTile(tx + 2, ty);
      const rW = this.getRawWaterAtTile(tx - 2, ty);
      const rS = this.getRawWaterAtTile(tx, ty + 2);
      const rN = this.getRawWaterAtTile(tx, ty - 2);

      const dMx = rE.riverMeander - rW.riverMeander;
      const dMy = rS.riverMeander - rN.riverMeander;
      const dEx = rE.continentalElev - rW.continentalElev;
      const dEy = rS.continentalElev - rN.continentalElev;

      let txVec = -dMy;
      let tyVec = dMx;
      // Orient tangent downstream toward decreasing continentalElev (toward the Ocean)
      if (txVec * -dEx + tyVec * -dEy < 0) {
        txVec = -txVec;
        tyVec = -tyVec;
      }

      const tMag = Math.hypot(txVec, tyVec);
      if (tMag > 0.00001) {
        txVec /= tMag;
        tyVec /= tMag;
      }

      const eMag = Math.hypot(dEx, dEy);
      const downX = eMag > 0.00001 ? -dEx / eMag : 0;
      const downY = eMag > 0.00001 ? -dEy / eMag : 0;

      const fx = txVec * 0.76 + downX * 0.24;
      const fy = tyVec * 0.76 + downY * 0.24;
      const fMag = Math.hypot(fx, fy);
      if (fMag > 0.001) {
        const riverSpeed = 28;
        return {
          vx: (fx / fMag) * riverSpeed,
          vy: (fy / fMag) * riverSpeed,
          kind: 'river',
        };
      }
    }

    // 2. Ocean Coast Current: the sea pushes swimmers toward the sandy beach
    if (raw.waterKind === 'ocean') {
      let pushX = 0;
      let pushY = 0;
      let minDist = Infinity;

      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (dx === 0 && dy === 0) continue;
          const d = Math.hypot(dx, dy);
          if (d > 4.2) continue;
          if (this.getTileBiomeFast(tx + dx, ty + dy) !== BiomeType.OCEAN) {
            const weight = (4.6 - d) / d;
            pushX += dx * weight;
            pushY += dy * weight;
            if (d < minDist) minDist = d;
          }
        }
      }

      const pMag = Math.hypot(pushX, pushY);
      if (pMag > 0.01 && minDist <= 4.2) {
        const waveSurge =
          0.84 + 0.26 * Math.sin(globalTime * 2.6 + (tx * 0.6 + ty * 0.5));
        const proximityFactor = 0.55 + Math.max(0, (4.2 - minDist) / 4.2) * 0.45;
        const shoreSpeed = 26 * waveSurge * proximityFactor;
        return {
          vx: (pushX / pMag) * shoreSpeed,
          vy: (pushY / pMag) * shoreSpeed,
          kind: 'ocean_shore',
        };
      }
    }

    return { vx: 0, vy: 0, kind: 'none' };
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

  public isTileWalkable(tx: number, ty: number, allowWater = true): boolean {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    const biome = chunk.tiles[ly * CHUNK_SIZE + lx];

    let hasBridge = false;
    for (const st of chunk.structures) {
      if (st.tileX === tx && st.tileY === ty) {
        if (
          st.isBridge ||
          st.type === PlaceableType.WOOD_BRIDGE ||
          CONSTRUCTION_BLUEPRINTS[st.type]?.layer === 'GROUND'
        ) {
          hasBridge = true;
        }
        if (WorldManager.isStructureCurrentlySolid(st)) {
          return false;
        }
      }
    }

    if (!allowWater && biome === BiomeType.OCEAN && !hasBridge) {
      return false;
    }

    // Only NatureNodes with hasHitbox: true block tile walkability (e.g. Berry Bushes do NOT block!)
    const hasSolidNode = chunk.nodes.some(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        (NATURE_BLUEPRINTS[n.type]?.hasHitbox ?? true)
    );
    if (hasSolidNode) return false;

    return true;
  }

  /**
   * Sub-tile accurate world-space collision check for Player & Creatures.
   * - Respects passable objects (bushes, floors, carpets, torches, lanterns, banners, campfires, traps, open doors).
   * - Allows swimming in water (`allowWater = true` by default) while supporting dry-land checks (`allowWater = false`).
   * - Uses full tile collision for continuous Walls & closed Doors.
   * - Uses compact radial collision for Trees, Boulders, Fences, and Furniture/Stations so movement never snags on corners.
   */
  public canEntityOccupyWorldCircle(
    wx: number,
    wy: number,
    entityRadius = 6.2,
    allowWater = true
  ): boolean {
    // 1. Optional dry-land check at the 4 footprint corners when water is disallowed
    if (!allowWater) {
      const footMargin = 5.5;
      const corners = [
        { x: wx - footMargin, y: wy - footMargin },
        { x: wx + footMargin, y: wy - footMargin },
        { x: wx - footMargin, y: wy + footMargin },
        { x: wx + footMargin, y: wy + footMargin },
      ];
      for (const pt of corners) {
        const { tx, ty } = this.worldToTile(pt.x, pt.y);
        if (this.isTileSwimmableWater(tx, ty)) {
          return false;
        }
      }
    }

    // 2. Check nearby tiles (3x3 around entity center) for solid structures & nature nodes
    const centerTile = this.worldToTile(wx, wy);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = centerTile.tx + dx;
        const ty = centerTile.ty + dy;
        const { cx, cy } = this.tileToChunk(tx, ty);
        const chunk = this.getOrCreateChunk(cx, cy);

        // Check Nature Nodes on (tx, ty)
        for (const node of chunk.nodes) {
          if (node.tileX !== tx || node.tileY !== ty) continue;
          const nbp = NATURE_BLUEPRINTS[node.type];
          if (!nbp || !nbp.hasHitbox || nbp.hitboxRadius <= 0) {
            continue; // e.g., BERRY_BUSH has no hitbox!
          }
          const nx = tx * TILE_SIZE + TILE_SIZE / 2;
          const ny = ty * TILE_SIZE + TILE_SIZE * 0.58;
          if (Math.hypot(wx - nx, wy - ny) < entityRadius + nbp.hitboxRadius) {
            return false;
          }
        }

        // Check Structures on (tx, ty)
        for (const st of chunk.structures) {
          if (st.tileX !== tx || st.tileY !== ty) continue;
          if (!WorldManager.isStructureCurrentlySolid(st)) continue;

          const bp = CONSTRUCTION_BLUEPRINTS[st.type];
          if (bp && bp.hitboxBehavior === 'SOLID_COMPACT' && bp.hitboxRadius) {
            const sx = tx * TILE_SIZE + TILE_SIZE / 2;
            const sy = ty * TILE_SIZE + TILE_SIZE * 0.55;
            if (Math.hypot(wx - sx, wy - sy) < entityRadius + bp.hitboxRadius) {
              return false;
            }
          } else {
            // SOLID_FULL (Walls, Windows) or closed DYNAMIC_DOOR: AABB vs Circle
            // Side-viewed (vertical / North-South) walls & doors have a thinner X profile
            const isVerticalSideWall = this.isWallOrDoorSideProfileAt(tx, ty, st);
            const padX = isVerticalSideWall ? 9 : 1;
            const boxMinX = tx * TILE_SIZE + padX;
            const boxMaxX = (tx + 1) * TILE_SIZE - padX;
            const boxMinY = ty * TILE_SIZE + 1;
            const boxMaxY = (ty + 1) * TILE_SIZE - 1;
            const closestX = Math.max(boxMinX, Math.min(wx, boxMaxX));
            const closestY = Math.max(boxMinY, Math.min(wy, boxMaxY));
            if (Math.hypot(wx - closestX, wy - closestY) < entityRadius) {
              return false;
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
    entityRadius = 6.2
  ): { x: number; y: number } {
    if (this.canEntityOccupyWorldCircle(wx, wy, entityRadius)) {
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
        const { cx, cy } = this.tileToChunk(tx, ty);
        const chunk = this.getOrCreateChunk(cx, cy);

        for (const node of chunk.nodes) {
          if (node.tileX !== tx || node.tileY !== ty) continue;
          const nbp = NATURE_BLUEPRINTS[node.type];
          if (!nbp || !nbp.hasHitbox || nbp.hitboxRadius <= 0) continue;
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

        for (const st of chunk.structures) {
          if (st.tileX !== tx || st.tileY !== ty) continue;
          if (!WorldManager.isStructureCurrentlySolid(st)) continue;
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

    const repulseMag = Math.hypot(repulseX, repulseY);
    const normRx = repulseMag > 0.01 ? repulseX / repulseMag : 0;
    const normRy = repulseMag > 0.01 ? repulseY / repulseMag : 1;

    // First try stepping directly along the repulsion vector for immediate edge ejection
    if (repulseMag > 0.01) {
      for (let d = 2; d <= 36; d += 2) {
        const testX = wx + normRx * d;
        const testY = wy + normRy * d;
        if (this.canEntityOccupyWorldCircle(testX, testY, entityRadius)) {
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

        if (this.canEntityOccupyWorldCircle(candX, candY, entityRadius)) {
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

    const connectsAt = (nx: number, ny: number): boolean => {
      // Special rule for Bridges: connect to neighboring bridges/floors OR to shoreline land tiles!
      if (bp.continuityMode === 'BRIDGE_AUTO') {
        if (this.getTileBiomeFast(nx, ny) !== BiomeType.OCEAN) {
          return true;
        }
      }
      const { cx, cy } = this.tileToChunk(nx, ny);
      const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
      if (!chunk) return false;

      for (const s of chunk.structures) {
        if (s.tileX === nx && s.tileY === ny) {
          const nbp = CONSTRUCTION_BLUEPRINTS[s.type];
          if (nbp && bp.connectsToGroups.includes(nbp.connectionGroup)) {
            return true;
          }
        }
      }
      return false;
    };

    let mask = 0;
    if (connectsAt(tx, ty - 1)) mask |= 1; // North
    if (connectsAt(tx + 1, ty)) mask |= 2; // East
    if (connectsAt(tx, ty + 1)) mask |= 4; // South
    if (connectsAt(tx - 1, ty)) mask |= 8; // West
    return mask;
  }

  /**
   * Determines whether a Door or Gate at (tx, ty) should align horizontally (East-West wall)
   * or vertically (North-South wall).
   */
  public getDoorOrientationAt(
    tx: number,
    ty: number,
    placeableType: PlaceableType,
    preferred?: 'auto' | 'horizontal' | 'vertical'
  ): 'horizontal' | 'vertical' {
    if (preferred === 'horizontal' || preferred === 'vertical') {
      return preferred;
    }
    const mask = this.getStructureConnectionMask(tx, ty, placeableType);
    const hasNS = (mask & 5) !== 0; // North (1) or South (4)
    const hasEW = (mask & 10) !== 0; // East (2) or West (8)
    if (hasNS && !hasEW) {
      return 'vertical';
    }
    return 'horizontal';
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

    // Cannot build on top of an unharvested Nature Node (except Berry Bushes can be cleared automatically when building!)
    const hasBlockingNode = chunk.nodes.some(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        n.type !== NatureNodeType.BERRY_BUSH
    );
    if (hasBlockingNode) {
      return false;
    }

    const existingOnTile = chunk.structures.filter(
      (s) => s.tileX === tx && s.tileY === ty
    );

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

    // 1. Placing a WOOD_BRIDGE (requires Ocean without an existing bridge)
    if (placeableType === PlaceableType.WOOD_BRIDGE) {
      return (
        biome === BiomeType.OCEAN &&
        !existingOnTile.some(
          (s) => s.isBridge || s.type === PlaceableType.WOOD_BRIDGE
        )
      );
    }

    // 2. Building over Ocean requires an existing WOOD_BRIDGE on that tile
    if (biome === BiomeType.OCEAN) {
      const hasBridge = existingOnTile.some(
        (s) => s.isBridge || s.type === PlaceableType.WOOD_BRIDGE
      );
      if (!hasBridge) return false;
    }

    // 3. Layer-based coexistence & in-place upgrade rules
    if (bp.layer === 'GROUND') {
      const existingFloor = existingOnTile.find((s) => {
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return (
          sbp?.layer === 'GROUND' &&
          !s.isBridge &&
          s.type !== PlaceableType.WOOD_BRIDGE
        );
      });
      if (!existingFloor) return true;
      // Allow replacing/upgrading to a DIFFERENT floor/carpet if not village-protected
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
      // Allow SPIKE_TRAP and Doors/Gates (WOOD_DOOR, IRON_GATE) to coexist on the same tile
      const isDoorType = (t: PlaceableType) =>
        t === PlaceableType.WOOD_DOOR || t === PlaceableType.IRON_GATE;
      if (
        placeableType === PlaceableType.SPIKE_TRAP &&
        existingUppers.length === 1 &&
        isDoorType(wallOnTile.type)
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
    const isDoorType = (t: PlaceableType) =>
      t === PlaceableType.WOOD_DOOR || t === PlaceableType.IRON_GATE;
    if (
      isDoorType(placeableType) &&
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
   * Returns true if `type` is a tree sapling structure (OAK_SAPLING or PALM_SAPLING).
   */
  public static isSaplingStructure(type: PlaceableType): boolean {
    return (
      type === PlaceableType.OAK_SAPLING ||
      type === PlaceableType.PALM_SAPLING
    );
  }

  /**
   * Returns true if `type` is a solid wall or window structure that supports mounting a Torch.
   */
  public static isWallMountableStructure(type: PlaceableType): boolean {
    return (
      type === PlaceableType.WOOD_WALL ||
      type === PlaceableType.STONE_WALL ||
      type === PlaceableType.BRICK_WALL ||
      type === PlaceableType.WOOD_WINDOW ||
      type === PlaceableType.STONE_WINDOW
    );
  }

  /**
   * Returns the wall-mountable structure at (tx, ty), if any.
   */
  public hasWallStructureAtTile(
    tx: number,
    ty: number
  ): PlacedStructure | undefined {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return undefined;
    return chunk.structures.find(
      (s) =>
        s.tileX === tx &&
        s.tileY === ty &&
        WorldManager.isWallMountableStructure(s.type)
    );
  }

  /**
   * Returns true when a wall, window, or door at `(tx, ty)` is oriented vertically (North-South side profile)
   * rather than horizontally (East-West front elevation).
   */
  public isWallOrDoorSideProfileAt(
    tx: number,
    ty: number,
    st: PlacedStructure
  ): boolean {
    if (
      st.type === PlaceableType.WOOD_DOOR ||
      st.type === PlaceableType.IRON_GATE
    ) {
      return (
        this.getDoorOrientationAt(tx, ty, st.type, st.orientation) ===
        'vertical'
      );
    }
    if (!WorldManager.isWallMountableStructure(st.type)) {
      return false;
    }
    if (st.orientation === 'vertical') return true;
    if (st.orientation === 'horizontal') return false;
    const mask = this.getStructureConnectionMask(tx, ty, st.type);
    const hasNS = (mask & 5) !== 0; // North (1) or South (4)
    const hasEW = (mask & 10) !== 0; // East (2) or West (8)
    return hasNS && !hasEW;
  }

  /**
   * Returns the Ground-layer structure (Floor / Carpet / Bridge) at (tx, ty), if any.
   */
  public getGroundStructureAtTile(tx: number, ty: number): PlacedStructure | undefined {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return undefined;
    return chunk.structures.find(
      (s) =>
        s.tileX === tx &&
        s.tileY === ty &&
        CONSTRUCTION_BLUEPRINTS[s.type]?.layer === 'GROUND' &&
        !s.isBridge &&
        s.type !== PlaceableType.WOOD_BRIDGE
    );
  }

  /**
   * Returns the top-most structure at (tx, ty) (preferring WALL/FURNITURE over SPIKE_TRAP and GROUND floors).
   */
  public getStructureAtTile(tx: number, ty: number): PlacedStructure | undefined {
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return undefined;
    const matches = chunk.structures.filter(
      (s) => s.tileX === tx && s.tileY === ty
    );
    if (matches.length === 0) return undefined;
    return (
      matches.find(
        (s) =>
          CONSTRUCTION_BLUEPRINTS[s.type]?.layer === 'WALL'
      ) ||
      matches.find(
        (s) =>
          CONSTRUCTION_BLUEPRINTS[s.type]?.layer !== 'GROUND' &&
          s.type !== PlaceableType.SPIKE_TRAP
      ) ||
      matches.find(
        (s) => CONSTRUCTION_BLUEPRINTS[s.type]?.layer !== 'GROUND'
      ) ||
      matches[matches.length - 1]
    );
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
    orientation: 'auto' | 'horizontal' | 'vertical' = 'auto'
  ): { placed: boolean; replacedItemId?: string; attachedToWall?: boolean } {
    if (!this.canPlaceStructureAt(tx, ty, placeableType)) {
      return { placed: false };
    }
    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    const bp = CONSTRUCTION_BLUEPRINTS[placeableType];

    // If there is a passable Berry Bush on the tile, clear it cleanly
    const bushIdx = chunk.nodes.findIndex(
      (n) =>
        n.tileX === tx &&
        n.tileY === ty &&
        n.type === NatureNodeType.BERRY_BUSH
    );
    if (bushIdx !== -1) {
      chunk.nodes.splice(bushIdx, 1);
    }

    let replacedItemId: string | undefined;
    const wallOnTile = this.hasWallStructureAtTile(tx, ty);
    const isMountingTorchOnWall =
      placeableType === PlaceableType.TORCH && Boolean(wallOnTile);

    if (bp.layer === 'GROUND' && placeableType !== PlaceableType.WOOD_BRIDGE) {
      const existingFloorIdx = chunk.structures.findIndex((s) => {
        if (s.tileX !== tx || s.tileY !== ty) return false;
        const sbp = CONSTRUCTION_BLUEPRINTS[s.type];
        return (
          sbp?.layer === 'GROUND' &&
          !s.isBridge &&
          s.type !== PlaceableType.WOOD_BRIDGE
        );
      });
      if (existingFloorIdx !== -1) {
        replacedItemId = chunk.structures[existingFloorIdx].itemId;
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

    chunk.structures.push({
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
      orientation,
      lightRadius: bp.lightRadius,
      hitFlashTimer: 0,
      attachedToWall: isMountingTorchOnWall ? true : undefined,
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
        placeableType === PlaceableType.WOOD_DOOR ||
        placeableType === PlaceableType.IRON_GATE
          ? 'PLAYER'
          : undefined,
      ownerId:
        placeableType === PlaceableType.MARKET_STALL ||
        placeableType === PlaceableType.EXPLORER_TENT ||
        placeableType === PlaceableType.VILLAGE_HOUSE ||
        placeableType === PlaceableType.WOOD_DOOR ||
        placeableType === PlaceableType.IRON_GATE
          ? 'player'
          : undefined,
      ownerName:
        placeableType === PlaceableType.MARKET_STALL
          ? 'Você (Mercador)'
          : placeableType === PlaceableType.EXPLORER_TENT ||
            placeableType === PlaceableType.VILLAGE_HOUSE ||
            placeableType === PlaceableType.WOOD_DOOR ||
            placeableType === PlaceableType.IRON_GATE
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
    });

    if (!chunk.preserved) {
      WorldManager.lockChunkTerrainSnapshot(
        chunk,
        chunk.genVersion ?? this.worldGenVersion,
        chunk.generatedGameVersion ?? GAME_VERSION
      );
    }

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
      if (chunk.explored.some((v) => v === 1)) {
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
   * Checks whether a tile can be tilled into arable farmland using a Hoe.
   */
  public canTillTileAt(tx: number, ty: number): boolean {
    // Water tiles cannot be tilled
    if (this.getTileBiomeFast(tx, ty) === BiomeType.OCEAN) {
      return false;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.chunks[WorldManager.chunkKey(cx, cy)];
    if (!chunk) return true;

    // Solid nature nodes prevent tilling (passable berry bushes are allowed to be cleared)
    const node = chunk.nodes.find((n) => n.tileX === tx && n.tileY === ty);
    if (node && node.type !== NatureNodeType.BERRY_BUSH) {
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
  public tillSoilAt(tx: number, ty: number): PlacedStructure | null {
    if (!this.canTillTileAt(tx, ty)) {
      return null;
    }

    const { cx, cy } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);

    // Clear any berry bush on tile
    const bushIdx = chunk.nodes.findIndex(
      (n) => n.tileX === tx && n.tileY === ty && n.type === NatureNodeType.BERRY_BUSH
    );
    if (bushIdx !== -1) {
      chunk.nodes.splice(bushIdx, 1);
    }

    const hydrated = this.isTileNearWater(tx, ty, 3);
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
    return structure;
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
      const targetNodeType =
        sapling.type === PlaceableType.PALM_SAPLING
          ? NatureNodeType.PALM_TREE
          : NatureNodeType.OAK_TREE;
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
    return true;
  }

  /**
   * Updates agriculture state (moisture evaporation, crop growth, and tree sapling 3-stage growth).
   * Called during each tick for active chunks.
   */
  public updateAgriculture(dt: number, isRaining = false): void {
    const stageDuration = 22; // ~22s per stage watered, or ~11s with fertilizer

    for (const chunk of Object.values(this.chunks)) {
      for (let i = chunk.structures.length - 1; i >= 0; i--) {
        const st = chunk.structures[i];
        if (!st) continue;

        // A. Tree Sapling 3-stage growth:
        // Stage 0 (Muda) -> Stage 1 (Árvore/Palmeira Pequena) -> Stage 2 (Árvore/Palmeira Adulta)
        // Oak Sapling total = 180s (3 minutes -> 90s per stage transition)
        // Palm Sapling total = 300s (5 minutes -> 150s per stage transition)
        if (WorldManager.isSaplingStructure(st.type)) {
          const saplingStageDuration =
            st.type === PlaceableType.PALM_SAPLING ? 150 : 90;
          const fertBoost = st.fertilized ? 2.0 : 1.0;
          const progressSpeed = (1 / saplingStageDuration) * fertBoost;
          st.growthStage = st.growthStage ?? 0;
          st.growthProgress = (st.growthProgress || 0) + dt * progressSpeed;

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

        // 1. Water & Hydration logic
        const nearWater = this.isTileNearWater(st.tileX, st.tileY, 3);
        if (isRaining || nearWater) {
          st.isWatered = true;
          st.waterLevel = 100;
        } else if (st.waterLevel !== undefined && st.waterLevel > 0) {
          st.waterLevel = Math.max(0, st.waterLevel - dt * 2.2);
          if (st.waterLevel <= 0) {
            st.isWatered = false;
          }
        }

        // 2. Crop Growth logic
        if (st.cropType && st.growthStage !== undefined && st.growthStage < 3) {
          if (st.isWatered) {
            const fertBoost = st.fertilized ? 2.0 : 1.0;
            const progressSpeed = (1 / stageDuration) * fertBoost;
            st.growthProgress = (st.growthProgress || 0) + dt * progressSpeed;

            if (st.growthProgress >= 1) {
              st.growthProgress = 0;
              st.growthStage += 1;
            }
          }
        }
      }
    }
  }
}

