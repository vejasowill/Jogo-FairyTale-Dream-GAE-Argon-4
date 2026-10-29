import { PlaceableType, PlacedStructure } from '../core/types';
import { CHUNK_SIZE, TILE_SIZE, WorldManager } from './WorldManager';

export type RoofMaterialStyle = 'WOOD' | 'STONE' | 'BRICK';

export interface BuildingRoomInfo {
  id: string;
  tiles: Set<string>;
}

export interface BuildingRoof {
  id: string;
  minTx: number;
  maxTx: number;
  minTy: number;
  maxTy: number;
  footprintSet: Set<string>;
  interiorSet: Set<string>;
  perimeterWallSet: Set<string>;
  internalWallSet: Set<string>;
  doorwaySet: Set<string>;
  rooms: BuildingRoomInfo[];
  style: RoofMaterialStyle;
  canvas: HTMLCanvasElement;
  canvasWorldX: number;
  canvasWorldY: number;
  canvasWidth: number;
  canvasHeight: number;
}

interface RoofPalette {
  baseSlopeN: string;
  baseSlopeS: string;
  baseSlopeW: string;
  baseSlopeE: string;
  shingleDark: string;
  shingleLight: string;
  shingleAccent: string;
  eaveBorder: string;
  eaveTrim: string;
  ridgeMain: string;
  ridgeHighlight: string;
}

const ROOF_PALETTES: Record<RoofMaterialStyle, RoofPalette> = {
  WOOD: {
    baseSlopeN: '#7c2d12',
    baseSlopeS: '#b45309',
    baseSlopeW: '#9a3412',
    baseSlopeE: '#854d0e',
    shingleDark: '#431407',
    shingleLight: '#d97706',
    shingleAccent: '#c2410c',
    eaveBorder: '#291105',
    eaveTrim: '#78350f',
    ridgeMain: '#d97706',
    ridgeHighlight: '#fde047',
  },
  STONE: {
    baseSlopeN: '#1e293b',
    baseSlopeS: '#475569',
    baseSlopeW: '#334155',
    baseSlopeE: '#273549',
    shingleDark: '#0f172a',
    shingleLight: '#64748b',
    shingleAccent: '#3b495e',
    eaveBorder: '#090d16',
    eaveTrim: '#334155',
    ridgeMain: '#94a3b8',
    ridgeHighlight: '#e2e8f0',
  },
  BRICK: {
    baseSlopeN: '#7f1d1d',
    baseSlopeS: '#b91c1c',
    baseSlopeW: '#991b1b',
    baseSlopeE: '#881337',
    shingleDark: '#450a0a',
    shingleLight: '#ef4444',
    shingleAccent: '#dc2626',
    eaveBorder: '#2a0404',
    eaveTrim: '#7f1d1d',
    ridgeMain: '#eab308',
    ridgeHighlight: '#fef08a',
  },
};

export function isRoofEnclosureStructure(type: PlaceableType): boolean {
  return (
    type === PlaceableType.WOOD_WALL ||
    type === PlaceableType.STONE_WALL ||
    type === PlaceableType.BRICK_WALL ||
    type === PlaceableType.WOOD_WINDOW ||
    type === PlaceableType.STONE_WINDOW ||
    type === PlaceableType.WOOD_DOOR ||
    type === PlaceableType.IRON_GATE
  );
}

function isPrimaryRoofWall(type: PlaceableType): boolean {
  return (
    type === PlaceableType.WOOD_WALL ||
    type === PlaceableType.STONE_WALL ||
    type === PlaceableType.BRICK_WALL ||
    type === PlaceableType.WOOD_WINDOW ||
    type === PlaceableType.STONE_WINDOW
  );
}

function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

export class RoofSystem {
  private lastSignature = '';
  private lastMinCx = 0;
  private lastMaxCx = -1;
  private lastMinCy = 0;
  private lastMaxCy = -1;
  private cachedRoofs: BuildingRoof[] = [];
  private cachedTileMap = new Map<string, BuildingRoof>();
  private regionCache = new Map<
    string,
    {
      sig: string;
      roofs: BuildingRoof[];
      tileMap: Map<string, BuildingRoof>;
    }
  >();
  private roofCanvasCache = new Map<
    string,
    {
      canvas: HTMLCanvasElement;
      worldX: number;
      worldY: number;
      width: number;
      height: number;
    }
  >();
  private roofAlphaMap = new Map<string, number>();

  public invalidate(): void {
    this.lastSignature = '';
    this.regionCache.clear();
  }

  /**
   * Computes a fast structural signature of all wall/window/door tiles in the active chunk neighborhood.
   * Ignores door open/close state so opening a door never triggers roof rebuilding.
   */
  private computeRegionSignature(
    world: WorldManager,
    minCx: number,
    maxCx: number,
    minCy: number,
    maxCy: number
  ): string {
    const parts: string[] = [`${minCx}:${maxCx}:${minCy}:${maxCy}`];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk || !chunk.structures || chunk.structures.length === 0) continue;
        for (const st of chunk.structures) {
          if (isRoofEnclosureStructure(st.type)) {
            parts.push(`${st.tileX},${st.tileY},${st.type}`);
          }
        }
      }
    }
    return parts.join(';');
  }

  /**
   * Returns all active BuildingRoofs in the chunk neighborhood, rebuilding only when wall topology changes.
   */
  public getRoofsForRegion(
    world: WorldManager,
    minCx: number,
    maxCx: number,
    minCy: number,
    maxCy: number
  ): BuildingRoof[] {
    const padMinCx = minCx - 1;
    const padMaxCx = maxCx + 1;
    const padMinCy = minCy - 1;
    const padMaxCy = maxCy + 1;

    const sig = this.computeRegionSignature(
      world,
      padMinCx,
      padMaxCx,
      padMinCy,
      padMaxCy
    );
    if (sig === this.lastSignature) {
      return this.cachedRoofs;
    }

    this.lastSignature = sig;
    this.lastMinCx = minCx;
    this.lastMaxCx = maxCx;
    this.lastMinCy = minCy;
    this.lastMaxCy = maxCy;
    this.cachedRoofs = this.buildRoofsInRegion(
      world,
      padMinCx,
      padMaxCx,
      padMinCy,
      padMaxCy
    );
    this.cachedTileMap.clear();
    for (let i = 0; i < this.cachedRoofs.length; i++) {
      const b = this.cachedRoofs[i];
      for (const k of b.footprintSet) {
        this.cachedTileMap.set(k, b);
      }
    }
    return this.cachedRoofs;
  }

  /**
   * Returns the enclosed `BuildingRoof` structure that contains tile `(tx, ty)`
   * (either in its interior, doorway, internal wall, or perimeter wall footprint),
   * or `null` if `(tx, ty)` is not part of an enclosed roofed structure.
   * Uses O(1) Map lookup and per-region caching so querying multiple chunks in the same frame never rebuilds roofs.
   */
  public getBuildingAtTile(
    world: WorldManager,
    tx: number,
    ty: number
  ): BuildingRoof | null {
    const key = tileKey(tx, ty);
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);

    // Fast path: if (cx, cy) is inside the active rendered camera region, use the O(1) cachedTileMap directly!
    if (
      this.lastSignature &&
      cx >= this.lastMinCx &&
      cx <= this.lastMaxCx &&
      cy >= this.lastMinCy &&
      cy <= this.lastMaxCy
    ) {
      return this.cachedTileMap.get(key) || null;
    }

    const regionKey = `${cx},${cy}`;
    const padMinCx = cx - 1;
    const padMaxCx = cx + 1;
    const padMinCy = cy - 1;
    const padMaxCy = cy + 1;

    const sig = this.computeRegionSignature(
      world,
      padMinCx,
      padMaxCx,
      padMinCy,
      padMaxCy
    );
    let entry = this.regionCache.get(regionKey);
    if (!entry || entry.sig !== sig) {
      const roofs = this.buildRoofsInRegion(
        world,
        padMinCx,
        padMaxCx,
        padMinCy,
        padMaxCy
      );
      const tileMap = new Map<string, BuildingRoof>();
      for (let i = 0; i < roofs.length; i++) {
        const b = roofs[i];
        for (const k of b.footprintSet) {
          tileMap.set(k, b);
        }
      }
      if (this.regionCache.size > 36) {
        this.regionCache.clear();
      }
      entry = { sig, roofs, tileMap };
      this.regionCache.set(regionKey, entry);
    }

    return entry.tileMap.get(key) || null;
  }

  /**
   * Checks whether world position `(wx, wy)` is currently inside the given building
   * (either on an interior room floor tile, an internal partition wall/door, or stepping through an outer doorway).
   */
  public isWorldPosInsideBuilding(
    wx: number,
    wy: number,
    building: BuildingRoof
  ): boolean {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (
      tx < building.minTx - 1 ||
      tx > building.maxTx + 1 ||
      ty < building.minTy - 1 ||
      ty > building.maxTy + 1
    ) {
      return false;
    }

    const key = tileKey(tx, ty);
    if (
      building.interiorSet.has(key) ||
      building.internalWallSet.has(key) ||
      building.doorwaySet.has(key)
    ) {
      return true;
    }

    // Sub-tile doorway / threshold tolerance (e.g. player body center slightly North or South of interior floor)
    const txLeft = Math.floor((wx - 4) / TILE_SIZE);
    const txRight = Math.floor((wx + 4) / TILE_SIZE);
    const tyUp = Math.floor((wy - 5) / TILE_SIZE);
    const tyDown = Math.floor((wy + 4) / TILE_SIZE);

    if (
      building.interiorSet.has(tileKey(txLeft, ty)) ||
      building.interiorSet.has(tileKey(txRight, ty)) ||
      building.interiorSet.has(tileKey(tx, tyUp)) ||
      building.interiorSet.has(tileKey(tx, tyDown))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Smoothly updates and returns the roof rendering opacity for `building`:
   * - Outside the building: 1.0 (100% solid roof)
   * - Inside the building: 0.20 (20% translucent roof so everything below is clearly visible)
   */
  public getUpdatedRoofAlpha(
    building: BuildingRoof,
    isInside: boolean,
    dt: number
  ): number {
    const target = isInside ? 0.2 : 1.0;
    const prev = this.roofAlphaMap.get(building.id);
    if (prev === undefined) {
      this.roofAlphaMap.set(building.id, target);
      return target;
    }
    const speed = 9.5;
    const next =
      Math.abs(target - prev) <= 0.015
        ? target
        : prev + (target - prev) * Math.min(1, dt * speed);
    this.roofAlphaMap.set(building.id, next);
    return next;
  }

  /**
   * Topological Room & Building Enclosure Analyzer:
   * 1. Collects all wall/window/door structures in the region.
   * 2. Groups walls into spatial clusters so distant buildings are analyzed independently.
   * 3. For each cluster, runs a 4-directional flood fill from the exterior margin to identify
   *    true enclosed interior tiles (`cellState = 3`).
   * 4. Identifies perimeter walls, corner walls, and internal partition / nested room walls (`cellState = 4`),
   *    while excluding stray/open walls sticking out from the building.
   * 5. Unifies adjacent rooms (`cômodos`) and nested rooms (`estrutura dentro de outra`) into a single
   *    non-duplicated `BuildingRoof` and pre-renders its responsive pixel-art roof sprite canvas.
   */
  private buildRoofsInRegion(
    world: WorldManager,
    minCx: number,
    maxCx: number,
    minCy: number,
    maxCy: number
  ): BuildingRoof[] {
    const wallMap = new Map<string, PlacedStructure>();

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk || !chunk.structures) continue;
        for (const st of chunk.structures) {
          if (isRoofEnclosureStructure(st.type)) {
            wallMap.set(tileKey(st.tileX, st.tileY), st);
          }
        }
      }
    }

    if (wallMap.size < 4) return [];

    // Group walls into spatial clusters (within 10 tiles of each other) so separate buildings far apart
    // use compact local grids while nested rooms inside a building stay in the same grid.
    const allWalls = Array.from(wallMap.values());
    const visitedWall = new Uint8Array(allWalls.length);
    const clusters: PlacedStructure[][] = [];

    for (let i = 0; i < allWalls.length; i++) {
      if (visitedWall[i]) continue;
      visitedWall[i] = 1;
      const cluster: PlacedStructure[] = [allWalls[i]];
      let head = 0;
      while (head < cluster.length) {
        const cur = cluster[head++];
        for (let j = 0; j < allWalls.length; j++) {
          if (visitedWall[j]) continue;
          const cand = allWalls[j];
          if (
            Math.abs(cand.tileX - cur.tileX) <= 10 &&
            Math.abs(cand.tileY - cur.tileY) <= 10
          ) {
            visitedWall[j] = 1;
            cluster.push(cand);
          }
        }
      }
      if (cluster.length >= 4) {
        clusters.push(cluster);
      }
    }

    const roofs: BuildingRoof[] = [];

    for (const cluster of clusters) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const st of cluster) {
        if (st.tileX < minX) minX = st.tileX;
        if (st.tileX > maxX) maxX = st.tileX;
        if (st.tileY < minY) minY = st.tileY;
        if (st.tileY > maxY) maxY = st.tileY;
      }

      const originX = minX - 1;
      const originY = minY - 1;
      const spanW = maxX - minX + 3;
      const spanH = maxY - minY + 3;
      if (spanW < 4 || spanH < 4 || spanW * spanH > 32000) continue;

      const totalCells = spanW * spanH;
      // 0 = unvisited non-wall, 1 = wall, 2 = true exterior, 3 = enclosed interior, 4 = building wall
      const cellState = new Uint8Array(totalCells);
      const clusterWallMap = new Map<string, PlacedStructure>();

      for (const st of cluster) {
        const gx = st.tileX - originX;
        const gy = st.tileY - originY;
        cellState[gy * spanW + gx] = 1;
        clusterWallMap.set(tileKey(st.tileX, st.tileY), st);
      }

      // Step 1: 4-directional BFS from the outer 1-tile margin to mark True Exterior (2)
      const queue = new Int32Array(totalCells);
      let qHead = 0;
      let qTail = 0;

      for (let gx = 0; gx < spanW; gx++) {
        const topIdx = gx;
        const botIdx = (spanH - 1) * spanW + gx;
        if (cellState[topIdx] === 0) {
          cellState[topIdx] = 2;
          queue[qTail++] = topIdx;
        }
        if (cellState[botIdx] === 0) {
          cellState[botIdx] = 2;
          queue[qTail++] = botIdx;
        }
      }
      for (let gy = 1; gy < spanH - 1; gy++) {
        const leftIdx = gy * spanW;
        const rightIdx = gy * spanW + (spanW - 1);
        if (cellState[leftIdx] === 0) {
          cellState[leftIdx] = 2;
          queue[qTail++] = leftIdx;
        }
        if (cellState[rightIdx] === 0) {
          cellState[rightIdx] = 2;
          queue[qTail++] = rightIdx;
        }
      }

      const dirs4 = [-spanW, spanW, -1, 1];
      while (qHead < qTail) {
        const idx = queue[qHead++];
        const gx = idx % spanW;
        const gy = (idx / spanW) | 0;

        if (gy > 0 && cellState[idx - spanW] === 0) {
          cellState[idx - spanW] = 2;
          queue[qTail++] = idx - spanW;
        }
        if (gy + 1 < spanH && cellState[idx + spanW] === 0) {
          cellState[idx + spanW] = 2;
          queue[qTail++] = idx + spanW;
        }
        if (gx > 0 && cellState[idx - 1] === 0) {
          cellState[idx - 1] = 2;
          queue[qTail++] = idx - 1;
        }
        if (gx + 1 < spanW && cellState[idx + 1] === 0) {
          cellState[idx + 1] = 2;
          queue[qTail++] = idx + 1;
        }
      }

      // Step 2: Validate enclosed non-wall components (0 -> 3 if <= 900 tiles, else 2)
      let hasAnyInterior = false;
      for (let i = 0; i < totalCells; i++) {
        if (cellState[i] !== 0) continue;
        const comp: number[] = [i];
        cellState[i] = 3;
        let cHead = 0;
        while (cHead < comp.length) {
          const cur = comp[cHead++];
          const cx = cur % spanW;
          const cy = (cur / spanW) | 0;
          if (cy > 0 && cellState[cur - spanW] === 0) {
            cellState[cur - spanW] = 3;
            comp.push(cur - spanW);
          }
          if (cy + 1 < spanH && cellState[cur + spanW] === 0) {
            cellState[cur + spanW] = 3;
            comp.push(cur + spanW);
          }
          if (cx > 0 && cellState[cur - 1] === 0) {
            cellState[cur - 1] = 3;
            comp.push(cur - 1);
          }
          if (cx + 1 < spanW && cellState[cur + 1] === 0) {
            cellState[cur + 1] = 3;
            comp.push(cur + 1);
          }
        }

        if (comp.length > 900) {
          for (const cIdx of comp) {
            cellState[cIdx] = 2;
          }
        } else {
          hasAnyInterior = true;
        }
      }

      if (!hasAnyInterior) continue;

      // Step 3A: Direct orthogonal boundary walls (4-adjacent to enclosed interior 3)
      for (let gy = 1; gy < spanH - 1; gy++) {
        for (let gx = 1; gx < spanW - 1; gx++) {
          const idx = gy * spanW + gx;
          if (cellState[idx] !== 1) continue;
          if (
            cellState[idx - spanW] === 3 ||
            cellState[idx + spanW] === 3 ||
            cellState[idx - 1] === 3 ||
            cellState[idx + 1] === 3
          ) {
            cellState[idx] = 4;
          }
        }
      }

      // Step 3B: Corner boundary walls (diagonally adjacent to 3 and orthogonally connected to 4)
      for (let gy = 1; gy < spanH - 1; gy++) {
        for (let gx = 1; gx < spanW - 1; gx++) {
          const idx = gy * spanW + gx;
          if (cellState[idx] !== 1) continue;
          const nw =
            cellState[idx - spanW - 1] === 3 &&
            (cellState[idx - spanW] === 4 || cellState[idx - 1] === 4);
          const ne =
            cellState[idx - spanW + 1] === 3 &&
            (cellState[idx - spanW] === 4 || cellState[idx + 1] === 4);
          const sw =
            cellState[idx + spanW - 1] === 3 &&
            (cellState[idx + spanW] === 4 || cellState[idx - 1] === 4);
          const se =
            cellState[idx + spanW + 1] === 3 &&
            (cellState[idx + spanW] === 4 || cellState[idx + 1] === 4);
          if (nw || ne || sw || se) {
            cellState[idx] = 4;
          }
        }
      }

      // Step 3C: Absorb any internal/nested walls that cannot reach True Exterior (2) without crossing 3 or 4
      const extReachable = new Uint8Array(totalCells);
      qHead = 0;
      qTail = 0;
      for (let i = 0; i < totalCells; i++) {
        if (cellState[i] === 2) {
          extReachable[i] = 1;
          queue[qTail++] = i;
        }
      }
      while (qHead < qTail) {
        const idx = queue[qHead++];
        const gx = idx % spanW;
        const gy = (idx / spanW) | 0;
        for (const d of dirs4) {
          if (d === -1 && gx === 0) continue;
          if (d === 1 && gx === spanW - 1) continue;
          if (d === -spanW && gy === 0) continue;
          if (d === spanW && gy === spanH - 1) continue;
          const nIdx = idx + d;
          if (extReachable[nIdx]) continue;
          if (cellState[nIdx] === 1 || cellState[nIdx] === 2) {
            extReachable[nIdx] = 1;
            queue[qTail++] = nIdx;
          }
        }
      }
      for (let i = 0; i < totalCells; i++) {
        if (cellState[i] === 1 && !extReachable[i]) {
          cellState[i] = 4;
        }
      }

      // Step 4: Extract connected Building footprints (cellState === 3 || cellState === 4)
      // Each connected component produces ONE unified BuildingRoof (preventing any duplicate roofs on nested rooms!)
      const visitedBuilding = new Uint8Array(totalCells);
      for (let i = 0; i < totalCells; i++) {
        if (visitedBuilding[i]) continue;
        if (cellState[i] !== 3 && cellState[i] !== 4) continue;

        const bCells: number[] = [i];
        visitedBuilding[i] = 1;
        let bHead = 0;
        let hasInteriorInComp = false;

        while (bHead < bCells.length) {
          const cur = bCells[bHead++];
          if (cellState[cur] === 3) hasInteriorInComp = true;
          const cx = cur % spanW;
          const cy = (cur / spanW) | 0;

          if (
            cy > 0 &&
            !visitedBuilding[cur - spanW] &&
            (cellState[cur - spanW] === 3 || cellState[cur - spanW] === 4)
          ) {
            visitedBuilding[cur - spanW] = 1;
            bCells.push(cur - spanW);
          }
          if (
            cy + 1 < spanH &&
            !visitedBuilding[cur + spanW] &&
            (cellState[cur + spanW] === 3 || cellState[cur + spanW] === 4)
          ) {
            visitedBuilding[cur + spanW] = 1;
            bCells.push(cur + spanW);
          }
          if (
            cx > 0 &&
            !visitedBuilding[cur - 1] &&
            (cellState[cur - 1] === 3 || cellState[cur - 1] === 4)
          ) {
            visitedBuilding[cur - 1] = 1;
            bCells.push(cur - 1);
          }
          if (
            cx + 1 < spanW &&
            !visitedBuilding[cur + 1] &&
            (cellState[cur + 1] === 3 || cellState[cur + 1] === 4)
          ) {
            visitedBuilding[cur + 1] = 1;
            bCells.push(cur + 1);
          }
        }

        if (!hasInteriorInComp) continue;

        const footprintSet = new Set<string>();
        const interiorSet = new Set<string>();
        const perimeterWallSet = new Set<string>();
        const internalWallSet = new Set<string>();
        const doorwaySet = new Set<string>();
        const inThisBuilding = new Uint8Array(totalCells);

        let bMinTx = Infinity;
        let bMaxTx = -Infinity;
        let bMinTy = Infinity;
        let bMaxTy = -Infinity;

        let woodCount = 0;
        let stoneCount = 0;
        let brickCount = 0;
        let primaryWallCount = 0;

        for (const cIdx of bCells) {
          inThisBuilding[cIdx] = 1;
          const gx = cIdx % spanW;
          const gy = (cIdx / spanW) | 0;
          const tx = originX + gx;
          const ty = originY + gy;
          const k = tileKey(tx, ty);
          footprintSet.add(k);

          if (tx < bMinTx) bMinTx = tx;
          if (tx > bMaxTx) bMaxTx = tx;
          if (ty < bMinTy) bMinTy = ty;
          if (ty > bMaxTy) bMaxTy = ty;

          if (cellState[cIdx] === 3) {
            interiorSet.add(k);
          } else {
            const st = clusterWallMap.get(k);
            if (st) {
              if (isPrimaryRoofWall(st.type)) {
                primaryWallCount++;
              }
              if (
                st.type === PlaceableType.BRICK_WALL
              ) {
                brickCount++;
              } else if (
                st.type === PlaceableType.STONE_WALL ||
                st.type === PlaceableType.STONE_WINDOW
              ) {
                stoneCount++;
              } else {
                woodCount++;
              }
              if (
                st.type === PlaceableType.WOOD_DOOR ||
                st.type === PlaceableType.IRON_GATE
              ) {
                doorwaySet.add(k);
              }
            }
          }
        }

        if (primaryWallCount === 0) continue;

        // Classify walls into Perimeter Walls vs Internal Partition / Nested Room Walls
        for (const cIdx of bCells) {
          if (cellState[cIdx] !== 4) continue;
          const gx = cIdx % spanW;
          const gy = (cIdx / spanW) | 0;
          const k = tileKey(originX + gx, originY + gy);

          let touchesOutside = false;
          for (let dy = -1; dy <= 1 && !touchesOutside; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = gx + dx;
              const ny = gy + dy;
              if (
                nx < 0 ||
                nx >= spanW ||
                ny < 0 ||
                ny >= spanH ||
                !inThisBuilding[ny * spanW + nx]
              ) {
                touchesOutside = true;
                break;
              }
            }
          }

          if (touchesOutside) {
            perimeterWallSet.add(k);
          } else {
            internalWallSet.add(k);
          }
        }

        // Identify individual Rooms ("cômodos") inside this building
        const rooms: BuildingRoomInfo[] = [];
        const visitedRoom = new Uint8Array(totalCells);
        for (const cIdx of bCells) {
          if (cellState[cIdx] !== 3 || visitedRoom[cIdx]) continue;
          visitedRoom[cIdx] = 1;
          const rQueue = [cIdx];
          const roomTiles = new Set<string>();
          let rHead = 0;
          while (rHead < rQueue.length) {
            const cur = rQueue[rHead++];
            const rx = cur % spanW;
            const ry = (cur / spanW) | 0;
            roomTiles.add(tileKey(originX + rx, originY + ry));
            for (const d of dirs4) {
              const nIdx = cur + d;
              if (
                nIdx >= 0 &&
                nIdx < totalCells &&
                !visitedRoom[nIdx] &&
                inThisBuilding[nIdx] &&
                cellState[nIdx] === 3
              ) {
                visitedRoom[nIdx] = 1;
                rQueue.push(nIdx);
              }
            }
          }
          rooms.push({
            id: `room_${originX + (cIdx % spanW)}_${originY + ((cIdx / spanW) | 0)}`,
            tiles: roomTiles,
          });
        }

        const style: RoofMaterialStyle =
          brickCount > stoneCount && brickCount > woodCount
            ? 'BRICK'
            : stoneCount > woodCount
            ? 'STONE'
            : 'WOOD';

        const buildingId = `roof_${bMinTx}_${bMinTy}_${bMaxTx}_${bMaxTy}`;
        const rendered = this.renderRoofCanvas(
          bMinTx,
          bMaxTx,
          bMinTy,
          bMaxTy,
          footprintSet,
          style
        );

        roofs.push({
          id: buildingId,
          minTx: bMinTx,
          maxTx: bMaxTx,
          minTy: bMinTy,
          maxTy: bMaxTy,
          footprintSet,
          interiorSet,
          perimeterWallSet,
          internalWallSet,
          doorwaySet,
          rooms,
          style,
          canvas: rendered.canvas,
          canvasWorldX: rendered.worldX,
          canvasWorldY: rendered.worldY,
          canvasWidth: rendered.width,
          canvasHeight: rendered.height,
        });
      }
    }

    return roofs;
  }

  /**
   * Pre-renders the responsive pixel-art pitched roof for a unified Building footprint onto an offscreen canvas.
   * Adapts automatically to any wall shape (rectangles, L, T, U, crosses, stepped walls, thin vertical side walls,
   * and multi-room interiors) without ever duplicating roof layers.
   */
  private renderRoofCanvas(
    minTx: number,
    maxTx: number,
    minTy: number,
    maxTy: number,
    footprintSet: Set<string>,
    style: RoofMaterialStyle
  ): {
    canvas: HTMLCanvasElement;
    worldX: number;
    worldY: number;
    width: number;
    height: number;
  } {
    const padTop = 20;
    const padBot = 8;
    const padLeft = 4;
    const padRight = 4;

    const worldX = minTx * TILE_SIZE - padLeft;
    const worldY = minTy * TILE_SIZE - padTop;
    const width = (maxTx - minTx + 1) * TILE_SIZE + padLeft + padRight;
    const height = (maxTy - minTy + 1) * TILE_SIZE + padTop + padBot;

    const footprintKeyParts: string[] = [];
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (footprintSet.has(tileKey(tx, ty))) {
          footprintKeyParts.push(`${tx - minTx},${ty - minTy}`);
        }
      }
    }
    const canvasCacheKey = `${style}:${minTx},${minTy},${maxTx},${maxTy}:${footprintKeyParts.join(';')}`;
    const existingCanvas = this.roofCanvasCache.get(canvasCacheKey);
    if (existingCanvas) {
      return existingCanvas;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const CELL = 2; // 2x2 pixel-art cell resolution
    const gw = Math.ceil(width / CELL);
    const gh = Math.ceil(height / CELL);
    const mask = new Uint8Array(gw * gh);

    // 1. Rasterize each tile in footprintSet onto the 2px roof mask, respecting thin 8px vertical walls & concave corners
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!footprintSet.has(tileKey(tx, ty))) continue;

        const hasN = footprintSet.has(tileKey(tx, ty - 1));
        const hasS = footprintSet.has(tileKey(tx, ty + 1));
        const hasW = footprintSet.has(tileKey(tx - 1, ty));
        const hasE = footprintSet.has(tileKey(tx + 1, ty));

        const lx = tx * TILE_SIZE - worldX;
        const ly = ty * TILE_SIZE - worldY;

        // Horizontal bounds aligned with thin 8px vertical walls (wx + 12..20 -> 3px eave overhang at wx + 9 and wx + 23)
        const rx0 = hasW ? lx : lx + 8;
        const rx1 = hasE ? lx + TILE_SIZE : lx + 24;

        // Vertical bounds aligned with elevated 2.5D walls (North wall top cap at wy - 14 -> wy - 16 eave; South wall top cap -> wy - 1 eave)
        const ry0 = hasN ? ly - 14 : ly - 16;
        const ry1 = hasS ? ly + 18 : ly;

        const hasSW = footprintSet.has(tileKey(tx - 1, ty + 1));
        const hasSE = footprintSet.has(tileKey(tx + 1, ty + 1));

        const gx0 = Math.max(0, Math.floor(rx0 / CELL));
        const gx1 = Math.min(gw, Math.ceil(rx1 / CELL));
        const gy0 = Math.max(0, Math.floor(ry0 / CELL));
        const gy1 = Math.min(gh, Math.ceil(ry1 / CELL));

        const swCutX = Math.floor((lx + 8) / CELL);
        const seCutX = Math.ceil((lx + 24) / CELL);
        const southEaveCutY = Math.ceil(ly / CELL);

        for (let gy = gy0; gy < gy1; gy++) {
          for (let gx = gx0; gx < gx1; gx++) {
            // Clip concave South-West / South-East turn notches so L/T/U corners fit the wall miter cleanly
            if (hasW && hasS && !hasSW && gy >= southEaveCutY && gx < swCutX) {
              continue;
            }
            if (hasE && hasS && !hasSE && gy >= southEaveCutY && gx >= seCutX) {
              continue;
            }
            mask[gy * gw + gx] = 1;
          }
        }
      }
    }

    // 2. Compute directional ray distances (dN, dS, dW, dE) across the 2px roof polygon mask
    const total = gw * gh;
    const dN = new Uint16Array(total);
    const dS = new Uint16Array(total);
    const dW = new Uint16Array(total);
    const dE = new Uint16Array(total);

    for (let gy = 0; gy < gh; gy++) {
      const rowOff = gy * gw;
      for (let gx = 0; gx < gw; gx++) {
        const idx = rowOff + gx;
        if (!mask[idx]) continue;
        dN[idx] = gy > 0 && mask[idx - gw] ? dN[idx - gw] + 1 : 1;
        dW[idx] = gx > 0 && mask[idx - 1] ? dW[idx - 1] + 1 : 1;
      }
    }

    for (let gy = gh - 1; gy >= 0; gy--) {
      const rowOff = gy * gw;
      for (let gx = gw - 1; gx >= 0; gx--) {
        const idx = rowOff + gx;
        if (!mask[idx]) continue;
        dS[idx] = gy + 1 < gh && mask[idx + gw] ? dS[idx + gw] + 1 : 1;
        dE[idx] = gx + 1 < gw && mask[idx + 1] ? dE[idx + 1] + 1 : 1;
      }
    }

    const pal = ROOF_PALETTES[style];

    // 3. Render eave drop shadow just below the Southern eave lips
    ctx.fillStyle = 'rgba(8, 12, 18, 0.34)';
    for (let gy = 1; gy < gh; gy++) {
      const rowOff = gy * gw;
      for (let gx = 0; gx < gw; gx++) {
        const idx = rowOff + gx;
        if (mask[idx]) continue;
        if (mask[idx - gw] || (gy >= 2 && mask[idx - gw * 2])) {
          ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
        }
      }
    }

    // 4. Render responsive pitched roof shingles, hip/valley diagonals, eave fascia, and ridge beams
    for (let gy = 0; gy < gh; gy++) {
      const rowOff = gy * gw;
      for (let gx = 0; gx < gw; gx++) {
        const idx = rowOff + gx;
        if (!mask[idx]) continue;

        const dn = dN[idx] - 1;
        const ds = dS[idx] - 1;
        const dw = dW[idx] - 1;
        const de = dE[idx] - 1;

        const minNS = dn < ds ? dn : ds;
        const minEW = dw < de ? dw : de;
        const edgeDist = minNS < minEW ? minNS : minEW;

        let color = pal.baseSlopeS;

        if (edgeDist === 0) {
          // Outer eave outline
          color = pal.eaveBorder;
        } else if (edgeDist === 1) {
          // Inner eave fascia board (brighter on South/West sunlit lip)
          color = ds === 1 || dw === 1 ? pal.shingleLight : pal.eaveTrim;
        } else {
          const isHorizRidge =
            minNS <= minEW && Math.abs(dn - ds) <= 1 && minEW >= 2;
          const isVertRidge =
            minEW <= minNS && Math.abs(dw - de) <= 1 && minNS >= 2;

          if (isHorizRidge || isVertRidge) {
            // Central Roof Ridge Beam (Cumeeira)
            const isCenterCrest =
              (isHorizRidge && dn <= ds) || (isVertRidge && dw <= de);
            const isFinialEnd =
              (isHorizRidge && minEW === 2) || (isVertRidge && minNS === 2);
            color = isFinialEnd
              ? pal.ridgeHighlight
              : isCenterCrest
              ? pal.ridgeHighlight
              : pal.ridgeMain;
          } else if (Math.abs(minNS - minEW) === 0) {
            // 45° Hip / Valley Diagonal Rib Seam (Espigão / Água-Furtada)
            color = edgeDist % 3 === 0 ? pal.shingleDark : pal.ridgeMain;
          } else if (minNS < minEW) {
            // North or South Pitched Slope (Horizontal Overlapping Scalloped Shingle Courses)
            const isSouthSlope = ds <= dn;
            const courseIdx = (minNS / 4) | 0;
            const inCourse = minNS % 4;
            const staggerX = (gx + (courseIdx & 1) * 3) % 6;

            if (inCourse === 0) {
              color = pal.shingleDark;
            } else if (inCourse === 1 && staggerX === 0) {
              color = pal.shingleDark;
            } else if (inCourse === 1) {
              color = isSouthSlope ? pal.shingleLight : pal.shingleAccent;
            } else if (staggerX === 0) {
              color = pal.shingleDark;
            } else {
              color = isSouthSlope ? pal.baseSlopeS : pal.baseSlopeN;
            }
          } else {
            // West or East Pitched Slope (Vertical Overlapping Shingle Courses)
            const isWestSlope = dw <= de;
            const courseIdx = (minEW / 4) | 0;
            const inCourse = minEW % 4;
            const staggerY = (gy + (courseIdx & 1) * 3) % 6;

            if (inCourse === 0) {
              color = pal.shingleDark;
            } else if (inCourse === 1 && staggerY === 0) {
              color = pal.shingleDark;
            } else if (inCourse === 1) {
              color = isWestSlope ? pal.shingleLight : pal.shingleAccent;
            } else if (staggerY === 0) {
              color = pal.shingleDark;
            } else {
              color = isWestSlope ? pal.baseSlopeW : pal.baseSlopeE;
            }
          }
        }

        ctx.fillStyle = color;
        ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }

    const renderedResult = {
      canvas,
      worldX,
      worldY,
      width,
      height,
    };
    if (this.roofCanvasCache.size > 160) {
      this.roofCanvasCache.clear();
    }
    this.roofCanvasCache.set(canvasCacheKey, renderedResult);
    return renderedResult;
  }
}
