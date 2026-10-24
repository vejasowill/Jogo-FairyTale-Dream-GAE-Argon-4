import {
  CONSTRUCTION_BLUEPRINTS,
  NATURE_BLUEPRINTS,
} from '../core/ItemRegistry';
import {
  BiomeType,
  CHEST_STORAGE_SIZE,
  ChunkData,
  EcologicalZone,
  InventorySlot,
  MARKET_STALL_SIZE,
  NatureNode,
  NatureNodeType,
  PlaceableType,
  PlacedStructure,
} from '../core/types';

export const TILE_SIZE = 32;
export const CHUNK_SIZE = 16;
export const CHUNK_WORLD_SIZE = TILE_SIZE * CHUNK_SIZE;

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
  public worldGenVersion: number;
  public chunks: Record<string, ChunkData> = {};

  constructor(
    seed: number,
    existingChunks?: Record<string, ChunkData>,
    worldGenVersion = 1
  ) {
    this.seed = seed;
    this.worldGenVersion = worldGenVersion;
    if (existingChunks) {
      this.chunks = existingChunks;
    }
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
      this.chunks[key] =
        this.worldGenVersion >= 2
          ? this.generateChunkV2(cx, cy)
          : this.generateChunkV1(cx, cy);
    }
    return this.chunks[key];
  }

  /**
   * Computes the macro BiomeType at a tile.
   * Preserves v1 formula 100% intact for existing worlds (worldGenVersion === 1),
   * while using coherent domain-warped continental & oasis geography for new worlds (v2).
   */
  public computeBiomeAtTile(tx: number, ty: number): BiomeType {
    if (this.worldGenVersion <= 1) {
      return this.computeBiomeAtTileV1(tx, ty);
    }
    return this.computeBiomeAtTileV2(tx, ty);
  }

  private computeBiomeAtTileV1(tx: number, ty: number): BiomeType {
    const distFromOrigin = Math.hypot(tx, ty);
    if (distFromOrigin < 9) {
      return BiomeType.PLAINS;
    }

    const elevation = fbm(tx * 0.032, ty * 0.032, this.seed);
    const moisture = fbm(tx * 0.025 + 100, ty * 0.025 + 100, this.seed + 777);

    if (elevation < 0.36) {
      return BiomeType.OCEAN;
    }
    if (moisture < 0.45) {
      return BiomeType.DESERT;
    }
    return BiomeType.PLAINS;
  }

  private computeBiomeAtTileV2(tx: number, ty: number): BiomeType {
    const distFromOrigin = Math.hypot(tx, ty);

    // Guarantee a welcoming starting heartland around (0, 0) with organic edges
    if (distFromOrigin < 11) {
      return BiomeType.PLAINS;
    }

    // Domain warping for natural peninsulas, bays, and continental curves
    const warpX = (smoothNoise(tx * 0.04, ty * 0.04, this.seed + 101) - 0.5) * 14;
    const warpY = (smoothNoise(tx * 0.04, ty * 0.04, this.seed + 202) - 0.5) * 14;
    const wx = tx + warpX;
    const wy = ty + warpY;

    // Continental elevation + island archipelago peaks
    let elevation = fbm(wx * 0.022, wy * 0.022, this.seed, 4);
    if (distFromOrigin < 20) {
      // Smoothly boost elevation near starting island so player isn't boxed in by tiny ocean strips
      const boost = Math.max(0, (20 - distFromOrigin) / 20) * 0.18;
      elevation += boost;
    }

    // Climate temperature/moisture gradient (smooth regional transitions)
    const climate = fbm(wx * 0.017 + 150, wy * 0.017 - 120, this.seed + 777, 3);

    // Ocean & Archipelago Islands
    if (elevation < 0.345) {
      // Occasional tropical island chains in the ocean
      const islandPeak = smoothNoise(tx * 0.075, ty * 0.075, this.seed + 1901);
      if (elevation > 0.27 && islandPeak > 0.78) {
        return climate < 0.43 ? BiomeType.DESERT : BiomeType.PLAINS;
      }
      return BiomeType.OCEAN;
    }

    // Arid Desert Continent with rare fertile Oasis Springs
    if (climate < 0.445) {
      const oasisPotential = smoothNoise(tx * 0.065, ty * 0.065, this.seed + 3307);
      if (distFromOrigin > 20 && elevation > 0.44 && oasisPotential > 0.835) {
        // Center of an oasis has a shallow lagoon spring surrounded by fertile green border
        if (oasisPotential > 0.875) {
          return BiomeType.OCEAN;
        }
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
    const b = biome ?? this.computeBiomeAtTile(tx, ty);
    const distFromOrigin = Math.hypot(tx, ty);

    const n = this.computeBiomeAtTile(tx, ty - 1);
    const s = this.computeBiomeAtTile(tx, ty + 1);
    const e = this.computeBiomeAtTile(tx + 1, ty);
    const w = this.computeBiomeAtTile(tx - 1, ty);

    if (b === BiomeType.OCEAN) {
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

    const vegNoise = fbm(tx * 0.055 + 40, ty * 0.055 + 40, this.seed + 511, 3);
    const rockNoise = fbm(tx * 0.065 - 80, ty * 0.065 + 90, this.seed + 883, 3);
    const sacredNoise = smoothNoise(tx * 0.038, ty * 0.038, this.seed + 1409);

    const nearOcean =
      n === BiomeType.OCEAN ||
      s === BiomeType.OCEAN ||
      e === BiomeType.OCEAN ||
      w === BiomeType.OCEAN;

    if (b === BiomeType.PLAINS) {
      if (nearOcean) {
        // Check if this is an inland desert oasis ring
        const nearDesert =
          this.computeBiomeAtTile(tx + 2, ty) === BiomeType.DESERT ||
          this.computeBiomeAtTile(tx - 2, ty) === BiomeType.DESERT ||
          this.computeBiomeAtTile(tx, ty + 2) === BiomeType.DESERT ||
          this.computeBiomeAtTile(tx, ty - 2) === BiomeType.DESERT;
        if (nearDesert) {
          return EcologicalZone.DESERT_OASIS;
        }
        return EcologicalZone.COASTAL_TROPICS;
      }

      if (rockNoise > 0.64) {
        return EcologicalZone.ROCKY_HIGHLANDS;
      }

      // Clean open meadows vs Overgrown shrubland vs Dense forest vs Ancient grove
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

    // DESERT ecological sub-zones
    if (
      nearOcean ||
      n === BiomeType.PLAINS ||
      s === BiomeType.PLAINS ||
      e === BiomeType.PLAINS ||
      w === BiomeType.PLAINS
    ) {
      const oasisCheck = smoothNoise(tx * 0.065, ty * 0.065, this.seed + 3307);
      if (oasisCheck > 0.76 || nearOcean) {
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

    if (this.worldGenVersion >= 2) {
      const zone = this.getEcologicalZoneAtTile(tx, ty);
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

      // DESERT (v2)
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

        const spawnRoll = hash2D(tx, ty, this.seed + 911);
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
            // Sandy palm beaches
            if (spawnRoll < 0.11) {
              nodeType =
                rarityRoll < 0.8
                  ? NatureNodeType.PALM_TREE
                  : NatureNodeType.BERRY_BUSH;
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

      chunk.structures.push({
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
        customName: landmarkName,
        landmarkName,
        villageId,
        ownerType:
          type === PlaceableType.MARKET_STALL ? 'VILLAGER' : undefined,
        ownerName:
          type === PlaceableType.MARKET_STALL
            ? 'Mercador da Vila'
            : undefined,
        stallOpen:
          type === PlaceableType.MARKET_STALL ? true : undefined,
      });
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
      clearNodesInBox(4, 4, 12, 12);
      const villageId = `village_${cx}_${cy}`;
      const isDesertVillage = centerBiome === BiomeType.DESERT;
      chunk.villageId = villageId;
      chunk.landmarkName = isDesertVillage
        ? 'Vila Mercante do Oásis'
        : 'Vilarejo de Carvalho';

      // Paved Cobblestone Plaza, Brick Forge Patio & Timber Decks
      for (let ly = 5; ly <= 11; ly++) {
        for (let lx = 5; lx <= 11; lx++) {
          if ((lx === 10 || lx === 11) && ly === 10) {
            addStruct(
              lx,
              ly,
              PlaceableType.BRICK_FLOOR,
              'brick_floor',
              undefined,
              undefined,
              villageId
            );
          } else if (
            (lx >= 7 && lx <= 9 && ly >= 6 && ly <= 10) ||
            ly === 8 ||
            lx === 8
          ) {
            addStruct(
              lx,
              ly,
              PlaceableType.STONE_FLOOR,
              'stone_floor',
              undefined,
              undefined,
              villageId
            );
          } else if (
            (lx === 5 || lx === 6 || lx === 10 || lx === 11) &&
            (ly === 6 || ly === 7 || ly === 9 || ly === 10)
          ) {
            addStruct(
              lx,
              ly,
              PlaceableType.WOOD_FLOOR,
              'wood_floor',
              undefined,
              undefined,
              villageId
            );
          }
        }
      }

      // Royal Carpet under the Guild Treasury & Elder Porch
      addStruct(
        5,
        9,
        PlaceableType.ROYAL_CARPET,
        'royal_carpet',
        undefined,
        undefined,
        villageId
      );
      addStruct(
        6,
        9,
        PlaceableType.ROYAL_CARPET,
        'royal_carpet',
        undefined,
        undefined,
        villageId
      );

      // Decorative Wooden Fence Perimeter Posts on Village Corners
      addStruct(5, 5, PlaceableType.WOOD_FENCE, 'wood_fence', undefined, undefined, villageId);
      addStruct(6, 5, PlaceableType.WOOD_FENCE, 'wood_fence', undefined, undefined, villageId);
      addStruct(10, 5, PlaceableType.WOOD_FENCE, 'wood_fence', undefined, undefined, villageId);
      addStruct(11, 5, PlaceableType.WOOD_FENCE, 'wood_fence', undefined, undefined, villageId);

      // Central Village Well
      addStruct(
        8,
        8,
        PlaceableType.VILLAGE_WELL,
        'village_well',
        undefined,
        'Poço Central da Vila',
        villageId
      );

      // Three Medieval Timber Cottages (North-West, North-Center & North-East — up to 2 Villagers each)
      addStruct(
        5,
        6,
        PlaceableType.VILLAGE_HOUSE,
        'village_house',
        undefined,
        'Cabana do Ancião',
        villageId
      );
      addStruct(
        8,
        6,
        PlaceableType.VILLAGE_HOUSE,
        'village_house',
        undefined,
        'Chalé da Guarda & Viajantes',
        villageId
      );
      addStruct(
        11,
        6,
        PlaceableType.VILLAGE_HOUSE,
        'village_house',
        undefined,
        'Residência do Ferreiro',
        villageId
      );

      // Market Stall & Artisan Stations (South-West & South-East)
      addStruct(
        6,
        10,
        PlaceableType.MARKET_STALL,
        'market_stall',
        undefined,
        'Tenda de Trocas da Vila',
        villageId
      );
      addStruct(
        10,
        10,
        PlaceableType.WORKBENCH,
        'workbench',
        undefined,
        'Oficina da Vila',
        villageId
      );
      addStruct(
        11,
        10,
        PlaceableType.FURNACE,
        'furnace',
        undefined,
        'Forja do Vilarejo',
        villageId
      );

      // Heraldic Royal Banners, Wrought-Iron Street Lanterns & Torches
      addStruct(
        7,
        5,
        PlaceableType.ROYAL_BANNER,
        'royal_banner',
        undefined,
        'Estandarte do Vilarejo',
        villageId
      );
      addStruct(
        9,
        5,
        PlaceableType.ROYAL_BANNER,
        'royal_banner',
        undefined,
        'Estandarte do Vilarejo',
        villageId
      );
      addStruct(6, 7, PlaceableType.IRON_LANTERN, 'iron_lantern', undefined, undefined, villageId);
      addStruct(10, 7, PlaceableType.IRON_LANTERN, 'iron_lantern', undefined, undefined, villageId);
      addStruct(7, 11, PlaceableType.TORCH, 'torch', undefined, undefined, villageId);
      addStruct(9, 11, PlaceableType.TORCH, 'torch', undefined, undefined, villageId);

      // Guarded Village Treasury Chest (Opening when affinity < 75 is considered theft!)
      addStruct(
        5,
        9,
        PlaceableType.CHEST,
        'chest',
        [
          { itemId: 'gold_coin', count: 5 },
          { itemId: 'iron_bar', count: 3 },
          { itemId: 'warrior_feast', count: 1 },
          { itemId: 'healing_salve', count: 2 },
        ],
        'Cofre da Guilda da Vila (Protegido)',
        villageId
      );
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

    // 6. DESERT CARAVAN POST (Posto de Caravana do Deserto)
    if (centerBiome === BiomeType.DESERT) {
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
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    return chunk.tiles[ly * CHUNK_SIZE + lx];
  }

  public revealAround(wx: number, wy: number, radiusTiles = 9): void {
    const center = this.worldToTile(wx, wy);
    const r2 = radiusTiles * radiusTiles;
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        if (dx * dx + dy * dy <= r2) {
          const tx = center.tx + dx;
          const ty = center.ty + dy;
          const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
          const chunk = this.getOrCreateChunk(cx, cy);
          chunk.explored[ly * CHUNK_SIZE + lx] = 1;
        }
      }
    }
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

  public isTileWalkable(tx: number, ty: number): boolean {
    const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
    const chunk = this.getOrCreateChunk(cx, cy);
    const biome = chunk.tiles[ly * CHUNK_SIZE + lx];

    let hasBridge = false;
    for (const st of chunk.structures) {
      if (st.tileX === tx && st.tileY === ty) {
        if (st.isBridge || st.type === PlaceableType.WOOD_BRIDGE) {
          hasBridge = true;
        }
        if (WorldManager.isStructureCurrentlySolid(st)) {
          return false;
        }
      }
    }

    if (biome === BiomeType.OCEAN && !hasBridge) {
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
   * - Uses full tile collision for continuous Walls & closed Doors.
   * - Uses compact radial collision for Trees, Boulders, Fences, and Furniture/Stations so movement never snags on corners.
   */
  public canEntityOccupyWorldCircle(
    wx: number,
    wy: number,
    entityRadius = 6.2
  ): boolean {
    // 1. Check Ocean vs Bridge at the 4 footprint corners of the entity
    const footMargin = 5.5;
    const corners = [
      { x: wx - footMargin, y: wy - footMargin },
      { x: wx + footMargin, y: wy - footMargin },
      { x: wx - footMargin, y: wy + footMargin },
      { x: wx + footMargin, y: wy + footMargin },
    ];
    for (const pt of corners) {
      const { tx, ty } = this.worldToTile(pt.x, pt.y);
      const { cx, cy, lx, ly } = this.tileToChunk(tx, ty);
      const chunk = this.getOrCreateChunk(cx, cy);
      const biome = chunk.tiles[ly * CHUNK_SIZE + lx];
      if (biome === BiomeType.OCEAN) {
        const hasBridge = chunk.structures.some(
          (s) =>
            s.tileX === tx &&
            s.tileY === ty &&
            (s.isBridge || s.type === PlaceableType.WOOD_BRIDGE)
        );
        if (!hasBridge) return false;
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
            const boxMinX = tx * TILE_SIZE + 1;
            const boxMaxX = (tx + 1) * TILE_SIZE - 1;
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

    // Allow SPIKE_TRAP and Doors/Gates (WOOD_DOOR, IRON_GATE) to coexist on the same tile!
    const isDoorType = (t: PlaceableType) =>
      t === PlaceableType.WOOD_DOOR || t === PlaceableType.IRON_GATE;

    if (
      placeableType === PlaceableType.SPIKE_TRAP &&
      existingUppers.length === 1 &&
      isDoorType(existingUppers[0].type)
    ) {
      return true;
    }
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

    // Allow in-place upgrading/converting between WALL-layer pieces (e.g. Wood Wall -> Stone Wall / Window / Door)
    const existingUpperBp = CONSTRUCTION_BLUEPRINTS[existingUpper.type];
    if (bp.layer === 'WALL' && existingUpperBp?.layer === 'WALL') {
      return true;
    }

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
   * Returns `{ placed: boolean; replacedItemId?: string }` so in-place upgrades refund the old piece.
   */
  public placeStructureWithUpgrade(
    tx: number,
    ty: number,
    placeableType: PlaceableType,
    itemId: string,
    orientation: 'auto' | 'horizontal' | 'vertical' = 'auto'
  ): { placed: boolean; replacedItemId?: string } {
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
      placeableType !== PlaceableType.SPIKE_TRAP
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
      storageSlots:
        placeableType === PlaceableType.CHEST
          ? new Array(CHEST_STORAGE_SIZE).fill(null)
          : undefined,
      ownerType:
        placeableType === PlaceableType.MARKET_STALL ? 'PLAYER' : undefined,
      ownerId:
        placeableType === PlaceableType.MARKET_STALL ? 'player' : undefined,
      ownerName:
        placeableType === PlaceableType.MARKET_STALL
          ? 'Você (Mercador)'
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

    return { placed: true, replacedItemId };
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
        if (this.computeBiomeAtTileV2(baseTx + lx, baseTy + ly) === BiomeType.OCEAN) {
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
        if (this.computeBiomeAtTile(nx, ny) === BiomeType.OCEAN) {
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
    if (this.computeBiomeAtTile(tx, ty) === BiomeType.OCEAN) {
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
        if (st.type === PlaceableType.TILLED_SOIL) {
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
   * Updates agriculture state (moisture evaporation & crop growth progression).
   * Called during each tick for active chunks.
   */
  public updateAgriculture(dt: number, isRaining = false): void {
    const stageDuration = 22; // ~22s per stage watered, or ~11s with fertilizer

    for (const chunk of Object.values(this.chunks)) {
      for (const st of chunk.structures) {
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

