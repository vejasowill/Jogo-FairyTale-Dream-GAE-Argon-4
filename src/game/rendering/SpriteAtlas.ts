import {
  BiomeType,
  CreatureKind,
  Direction,
  NatureNodeType,
  PlaceableType,
  PlayerAppearance,
  PlayerEquipment,
  PlayerState,
} from '../core/types';

export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  skinColor: '#fdba74',
  hairColor: '#451a03',
  hairStyle: 'adventurer',
  eyeColor: '#0f172a',
  shirtColor: '#2563eb',
  pantsColor: '#334155',
};

type PixelGrid = string[];

function createPixelCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function drawPixelMatrix(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  palette: Record<string, string>,
  offsetX = 0,
  offsetY = 0
) {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== '.' && ch !== ' ' && palette[ch]) {
        ctx.fillStyle = palette[ch];
        ctx.fillRect(offsetX + x, offsetY + y, 1, 1);
      }
    }
  }
}

class SpriteAtlasManager {
  private initialized = false;
  private tileSprites: Map<string, HTMLCanvasElement> = new Map();
  private natureSprites: Map<string, HTMLCanvasElement[]> = new Map();
  private structureSprites: Map<string, HTMLCanvasElement[]> = new Map();
  private itemCanvases: Map<string, HTMLCanvasElement> = new Map();
  private itemDataUrls: Map<string, string> = new Map();
  private playerSprites: Map<string, HTMLCanvasElement> = new Map();
  private creatureSprites: Map<string, HTMLCanvasElement> = new Map();

  public ensureInitialized(): void {
    if (this.initialized || typeof document === 'undefined') return;
    this.initialized = true;
    this.buildTiles();
    this.buildItems();
    this.buildNatureNodes();
    this.buildStructures();
    this.buildPlayerSprites();
    this.buildCreatureSprites();
  }

  public getTileSprite(
    biome: BiomeType,
    variant: number,
    animFrame: number,
    subZone = 1
  ): HTMLCanvasElement {
    this.ensureInitialized();
    const z = Math.max(0, Math.min(2, subZone));
    const key = `${biome}_${z}_${variant % 4}_${animFrame % 4}`;
    return (
      this.tileSprites.get(key) ||
      this.tileSprites.get(`${biome}_1_${variant % 4}_${animFrame % 4}`) ||
      this.tileSprites.get(`${biome}_1_0_0`)!
    );
  }

  public getNatureSprite(
    type: NatureNodeType,
    animFrame: number,
    variant = 0
  ): HTMLCanvasElement {
    this.ensureInitialized();
    const vKey = `${type}_${Math.abs(variant) % 3}`;
    const frames =
      this.natureSprites.get(vKey) ||
      this.natureSprites.get(`${type}_0`) ||
      this.natureSprites.get(type);
    if (!frames) {
      const fallback =
        this.natureSprites.get(`${NatureNodeType.OAK_TREE}_0`) ||
        this.natureSprites.get(NatureNodeType.OAK_TREE)!;
      return fallback[0];
    }
    return frames[Math.abs(animFrame) % frames.length];
  }

  public getStructureSprite(type: PlaceableType, animFrame: number): HTMLCanvasElement {
    this.ensureInitialized();
    const frames = this.structureSprites.get(type);
    if (!frames) return this.structureSprites.get(PlaceableType.WORKBENCH)![0];
    return frames[animFrame % frames.length];
  }

  public getItemCanvas(itemId: string): HTMLCanvasElement {
    this.ensureInitialized();
    return this.itemCanvases.get(itemId) || this.itemCanvases.get('wood')!;
  }

  public getItemIconUrl(itemId: string): string {
    this.ensureInitialized();
    if (!this.itemDataUrls.has(itemId)) {
      const c = this.getItemCanvas(itemId);
      this.itemDataUrls.set(itemId, c.toDataURL());
    }
    return this.itemDataUrls.get(itemId)!;
  }

  public getPlayerSprite(
    dir: Direction,
    frame: number,
    playerOrArmor: PlayerState | string | null
  ): HTMLCanvasElement {
    this.ensureInitialized();
    const f = frame % 4;

    if (!playerOrArmor || typeof playerOrArmor === 'string') {
      const legacyBody = playerOrArmor || null;
      const eq: PlayerEquipment = {
        head: null,
        body: legacyBody,
        legs: null,
        feet: null,
      };
      return this.getCompositePlayerSprite(dir, f, eq, DEFAULT_PLAYER_APPEARANCE);
    }

    const eq: PlayerEquipment = playerOrArmor.equippedBySlot || {
      head: null,
      body: playerOrArmor.equippedArmorId || null,
      legs: null,
      feet: null,
    };
    const app: PlayerAppearance = {
      ...DEFAULT_PLAYER_APPEARANCE,
      ...(playerOrArmor.appearance || {}),
    };
    return this.getCompositePlayerSprite(dir, f, eq, app);
  }

  public getCreatureSprite(
    kind: CreatureKind,
    frame: number,
    isAttacking: boolean
  ): HTMLCanvasElement {
    this.ensureInitialized();
    const key = `${kind}_${isAttacking ? 'atk' : frame % 4}`;
    return this.creatureSprites.get(key) || this.creatureSprites.get(`${kind}_0`)!;
  }

  private buildTiles(): void {
    // 16x16 HD pixel-art tiles scaled to 32x32 in world with 3 progressive sub-zones per biome
    const plainsPalettes = [
      // SubZone 0: Lush Emerald Clover Meadow
      {
        base: '#2d6e36',
        dark: '#22582a',
        mid: '#398241',
        light: '#4d9b52',
        tip: '#6ec068',
        soil: '#3e522c',
      },
      // SubZone 1: Sunlit Heartland Plains
      {
        base: '#3a7b36',
        dark: '#2c6329',
        mid: '#478f40',
        light: '#5ea850',
        tip: '#80c665',
        soil: '#4a5c2f',
      },
      // SubZone 2: Warm Golden Steppe (Progressive Ecotone near Desert)
      {
        base: '#5c8434',
        dark: '#486b27',
        mid: '#72983c',
        light: '#8eae49',
        tip: '#b8c45e',
        soil: '#787039',
      },
    ];

    const desertPalettes = [
      // SubZone 0: Savannah Scrub Border (Progressive Ecotone near Plains)
      {
        base: '#cba75b',
        shadow: '#b08b42',
        mid: '#d7b66b',
        highlight: '#e8cc84',
        pebble: '#8d733f',
        tuft: '#76883b',
      },
      // SubZone 1: Sculpted Golden Sand Dunes
      {
        base: '#deb868',
        shadow: '#c09648',
        mid: '#e7c679',
        highlight: '#f5dc96',
        pebble: '#a37934',
        tuft: '#988b42',
      },
      // SubZone 2: Sunbaked Terracotta / Oasis Sandstone Basin
      {
        base: '#d19f54',
        shadow: '#b37e38',
        mid: '#deaef60'.slice(0, 7) === '#deaef6' ? '#deae63' : '#deae63',
        highlight: '#efd08b',
        pebble: '#8c5828',
        tuft: '#8a7238',
      },
    ];

    const oceanPalettes = [
      // SubZone 0: Shallow Turquoise Crystal Lagoon (1 tile from shore)
      {
        base: '#1782a6',
        trough: '#126b8c',
        swell: '#229cc2',
        crest: '#67e8f9',
        foam: '#e0f2fe',
        reef: '#1d96b3',
      },
      // SubZone 1: Coastal Azure Sea (2 tiles from shore)
      {
        base: '#146291',
        trough: '#0f4e77',
        swell: '#1d78ad',
        crest: '#38bdf8',
        foam: '#bae6fd',
        reef: '#175a85',
      },
      // SubZone 2: Deep Abyssal Ocean
      {
        base: '#0d436b',
        trough: '#082f4f',
        swell: '#135585',
        crest: '#0284c7',
        foam: '#7dd3fc',
        reef: '#0a385c',
      },
    ];

    for (let z = 0; z < 3; z++) {
      for (let v = 0; v < 4; v++) {
        for (let f = 0; f < 4; f++) {
          // =================================================================
          // 1. PLAINS HD PIXEL TILE
          // =================================================================
          const pPal = plainsPalettes[z];
          const pCanvas = createPixelCanvas(16, 16);
          const pCtx = pCanvas.getContext('2d')!;
          pCtx.fillStyle = pPal.base;
          pCtx.fillRect(0, 0, 16, 16);

          // Organic dithered ground patches (no harsh lines)
          pCtx.fillStyle = pPal.soil;
          for (let i = 0; i < 10; i++) {
            const px = (i * 5 + v * 3 + z * 2) % 15;
            const py = (i * 9 + v * 7 + z * 3) % 15;
            pCtx.fillRect(px, py, 2, 1);
          }

          // Multi-layered grass blades with dark base, mid body, and sunlit tips
          for (let i = 0; i < 14; i++) {
            const gx = (i * 7 + v * 5 + z * 3) % 14 + 1;
            const gy = (i * 11 + v * 3 + z * 5) % 13 + 2;
            const sway = (i + v) % 3 === 0 && (f === 1 || f === 2) ? 1 : 0;

            // Shadow root
            pCtx.fillStyle = pPal.dark;
            pCtx.fillRect(gx, gy, 2, 1);
            // Mid blade
            pCtx.fillStyle = i % 2 === 0 ? pPal.mid : pPal.light;
            pCtx.fillRect(gx, gy - 1, 1, 1);
            pCtx.fillRect(gx + 1, gy - 1, 1, 1);
            // Sunlit grass tip
            if (i % 3 === 0) {
              pCtx.fillStyle = pPal.tip;
              pCtx.fillRect(gx + sway, gy - 2, 1, 1);
            }
          }

          // Clover clusters & Wildflowers with gentle wind sway
          const windSway = f === 1 ? 1 : f === 3 ? -1 : 0;
          if (v === 1 || (z === 0 && v === 3)) {
            const fx = 5 + v * 2;
            const fy = 6 + (v % 2) * 3;
            // Stem & Leaves
            pCtx.fillStyle = pPal.dark;
            pCtx.fillRect(fx, fy + 1, 2, 2);
            // Blossom petals
            pCtx.fillStyle = z === 0 ? '#e0f2fe' : '#fde047';
            pCtx.fillRect(fx + windSway, fy - 1, 2, 2);
            pCtx.fillStyle = z === 0 ? '#38bdf8' : '#f59e0b';
            pCtx.fillRect(fx + windSway, fy, 1, 1);
          } else if (v === 2) {
            const fx = 9;
            const fy = 8;
            pCtx.fillStyle = pPal.dark;
            pCtx.fillRect(fx, fy + 1, 2, 2);
            pCtx.fillStyle = z === 2 ? '#fb923c' : '#f472b6';
            pCtx.fillRect(fx + windSway, fy - 1, 2, 2);
            pCtx.fillStyle = '#fef08a';
            pCtx.fillRect(fx + windSway, fy, 1, 1);
          }

          this.tileSprites.set(`${BiomeType.PLAINS}_${z}_${v}_${f}`, pCanvas);

          // =================================================================
          // 2. DESERT HD PIXEL TILE
          // =================================================================
          const dPal = desertPalettes[z];
          const dCanvas = createPixelCanvas(16, 16);
          const dCtx = dCanvas.getContext('2d')!;
          dCtx.fillStyle = dPal.base;
          dCtx.fillRect(0, 0, 16, 16);

          // Sculpted horizontal wind-blown sand ripples across tile
          for (let ry = 2; ry < 15; ry += 4) {
            const rowOffset = (ry * 3 + v * 4 + z * 2) % 6;
            // Shaded trough under dune ridge
            dCtx.fillStyle = dPal.shadow;
            dCtx.fillRect(rowOffset, ry + 1, 8, 1);
            dCtx.fillRect((rowOffset + 9) % 14, ry + 2, 4, 1);
            // Sunlit dune crest
            dCtx.fillStyle = dPal.highlight;
            dCtx.fillRect(rowOffset, ry, 7, 1);
            dCtx.fillRect((rowOffset + 9) % 14, ry + 1, 4, 1);
          }

          // Micro sand grains & pebbles
          for (let i = 0; i < 12; i++) {
            const sx = (i * 7 + v * 3) % 15;
            const sy = (i * 5 + v * 6) % 15;
            dCtx.fillStyle = i % 3 === 0 ? dPal.pebble : dPal.mid;
            dCtx.fillRect(sx, sy, 1, 1);
          }

          // Savannah scrub tuft in SubZone 0 or sparkling quartz in SubZone 1/2
          if (z === 0 && (v === 1 || v === 3)) {
            dCtx.fillStyle = dPal.tuft;
            dCtx.fillRect(6 + v, 9, 2, 2);
            dCtx.fillRect(5 + v + (f % 2), 8, 1, 1);
            dCtx.fillRect(8 + v, 8, 1, 1);
          } else if (v === 2 && f % 2 === 0) {
            // Subtle sunlit sand sparkle
            dCtx.fillStyle = '#fef9c3';
            dCtx.fillRect(5 + f, 6, 1, 1);
          }

          this.tileSprites.set(`${BiomeType.DESERT}_${z}_${v}_${f}`, dCanvas);

          // =================================================================
          // 3. OCEAN HD PIXEL TILE
          // =================================================================
          const oPal = oceanPalettes[z];
          const oCanvas = createPixelCanvas(16, 16);
          const oCtx = oCanvas.getContext('2d')!;
          oCtx.fillStyle = oPal.base;
          oCtx.fillRect(0, 0, 16, 16);

          // Underwater reef/trough bands
          oCtx.fillStyle = oPal.trough;
          for (let wy = 1; wy < 15; wy += 4) {
            const wx = (wy * 3 + v * 3 + f) % 12;
            oCtx.fillRect(wx, wy + 1, 5, 1);
          }

          // Swell body
          oCtx.fillStyle = oPal.swell;
          for (let wy = 2; wy < 15; wy += 4) {
            const wx = (wy * 2 + v * 4 + f) % 11;
            oCtx.fillRect(wx, wy, 5, 1);
          }

          // Animated wave crests & caustic glints
          const waveShift = f;
          oCtx.fillStyle = oPal.crest;
          oCtx.fillRect((2 + waveShift + v * 3) % 12, 3 + (v % 2) * 2, 4, 1);
          oCtx.fillRect((8 - waveShift + v * 2 + 12) % 12, 10 + (v % 2), 3, 1);

          // Specular white-foam highlight
          oCtx.fillStyle = oPal.foam;
          oCtx.fillRect((3 + waveShift + v * 3) % 12, 3 + (v % 2) * 2, 2, 1);
          if (z === 0 && (f + v) % 2 === 0) {
            oCtx.fillRect((9 - waveShift + v * 2 + 12) % 12, 10 + (v % 2), 1, 1);
          }

          this.tileSprites.set(`${BiomeType.OCEAN}_${z}_${v}_${f}`, oCanvas);
        }
      }
    }
  }

  private buildItems(): void {
    const registerItem = (id: string, grid: PixelGrid, palette: Record<string, string>) => {
      const c = createPixelCanvas(16, 16);
      const ctx = c.getContext('2d')!;
      drawPixelMatrix(ctx, grid, palette, 0, 0);
      this.itemCanvases.set(id, c);
    };

    // Wood
    registerItem(
      'wood',
      [
        '................',
        '..........bbbb..',
        '........bbllbb..',
        '.......bbllbb...',
        '......bbllbb....',
        '.....bbllbb.....',
        '....bbllbb......',
        '...bbllbb.......',
        '..bbllbb........',
        '.bbddbb.........',
        '.bddbb..........',
        '..bbb...........',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#5c3a21', l: '#8b5a2b', d: '#d2a679' }
    );

    // Hardwood
    registerItem(
      'hardwood',
      [
        '................',
        '..........gggg..',
        '........ggyygg..',
        '.......ggyygg...',
        '......ggyygg....',
        '.....ggyygg.....',
        '....ggyygg......',
        '...ggyygg.......',
        '..ggyygg........',
        '.ggwwgg.........',
        '.gwwgg..........',
        '..ggg...........',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#78350f', y: '#d97706', w: '#fde68a' }
    );

    // Stone
    registerItem(
      'stone',
      [
        '................',
        '................',
        '.....dddddd.....',
        '...ddlllllldd...',
        '..dllfffffflld..',
        '.dllfflllllllld.',
        '.dllllllllllmmmd',
        '.dlllllllllmmmmd',
        '..dmmmmmmmmmmmd.',
        '...ddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#334155', l: '#94a3b8', f: '#cbd5e1', m: '#64748b' }
    );

    // Fiber
    registerItem(
      'fiber',
      [
        '................',
        '....gg....gg....',
        '...gllg..gllg...',
        '...glg..gglg....',
        '....glggglg.....',
        '....yyyyyyyy....',
        '...gggggggggg...',
        '..ggllggggllgg..',
        '..gglgggggglgg..',
        '...gg......gg...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#15803d', l: '#4ade80', y: '#ca8a04' }
    );

    // Flint
    registerItem(
      'flint',
      [
        '................',
        '.......dd.......',
        '......dssd......',
        '.....dsslsd.....',
        '....dsssslsd....',
        '...dsssssslsd...',
        '..dssssssssssd..',
        '...ddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', s: '#334155', l: '#94a3b8' }
    );

    // Wool
    registerItem(
      'wool',
      [
        '................',
        '....wwwwwwww....',
        '..wwwwwwwwwwww..',
        '.wwwffffffffwww.',
        '.wwffffffffffww.',
        '.wwffffffffffww.',
        '..wwwffffffwww..',
        '...wwwwwwwwww...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { w: '#cbd5e1', f: '#f8fafc' }
    );

    // Berry
    registerItem(
      'berry',
      [
        '................',
        '......gggg......',
        '.....gllllg.....',
        '....rrrrrrrr....',
        '...rrffffffrr...',
        '..rrrffffffrrr..',
        '..rrrrrrrrrrrr..',
        '...rrrrrrrrrr...',
        '....rrrrrrrr....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#166534', l: '#4ade80', r: '#dc2626', f: '#fca5a5' }
    );

    // Apple
    registerItem(
      'apple',
      [
        '.......bb.......',
        '......bgggy.....',
        '....rrrrrrrr....',
        '...rrwrrrrrrr...',
        '..rrwwrrrrrrrr..',
        '..rrrrrrrrrrrr..',
        '..rrrrrrrrrrrr..',
        '...rrrrrrrrrr...',
        '....rrr..rrr....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#78350f', g: '#22c55e', y: '#86efac', r: '#ef4444', w: '#fef08a' }
    );

    // Cactus fruit
    registerItem(
      'cactus_fruit',
      [
        '................',
        '......gggg......',
        '....mmmmmmmm....',
        '...mmffffffmm...',
        '..mmmffffffmmm..',
        '..mmmmmmmmmmmm..',
        '...mmmmmmmmmm...',
        '....mmmmmmmm....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#22c55e', m: '#db2777', f: '#f9a8d4' }
    );

    // Coconut
    registerItem(
      'coconut',
      [
        '................',
        '....bbbbbbbb....',
        '..bbddddddddbb..',
        '.bbddffffffddbb.',
        '.bbdffffffffdbb.',
        '.bbddffffffddbb.',
        '..bbddddddddbb..',
        '....bbbbbbbb....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#451a03', d: '#78350f', f: '#f8fafc' }
    );

    // Taming Treat
    registerItem(
      'taming_treat',
      [
        '................',
        '...rrr....rrr...',
        '..rpppr..rpppr..',
        '.rppppprrpppppr.',
        '.rppppppppppppr.',
        '..rpppppppppyr..',
        '...rpppppppyr...',
        '....rpppppyr....',
        '.....rpppyr.....',
        '......rpyr......',
        '.......rr.......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { r: '#9d174d', p: '#f43f5e', y: '#fde047' }
    );

    // Healing Salve
    registerItem(
      'healing_salve',
      [
        '......bbbb......',
        '......bllb......',
        '.....gggggg.....',
        '....gffffffg....',
        '...gffrrrrffg...',
        '...gfrrrrrrfg...',
        '...gffrrrrffg...',
        '....gffffffg....',
        '.....gggggg.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#78350f', l: '#d97706', g: '#059669', f: '#6ee7b7', r: '#ef4444' }
    );

    // Iron Ore
    registerItem(
      'iron_ore',
      [
        '................',
        '....dddddddd....',
        '..ddssiiiissdd..',
        '.ddssiiiiiissdd.',
        '.dsssiisssiiisd.',
        '.dssssssiiisssd.',
        '..ddssssiissdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', s: '#64748b', i: '#f97316' }
    );

    // Iron Bar
    registerItem(
      'iron_bar',
      [
        '................',
        '................',
        '.....dddddddd...',
        '...ddffffffffdd.',
        '..dffllllllllffd',
        '.dffllllllllllfd',
        '.dmmmmmmmmmmmmmd',
        '..dddddddddddddd',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', f: '#f8fafc', l: '#cbd5e1', m: '#64748b' }
    );

    // Solar Crystal
    registerItem(
      'solar_crystal',
      [
        '.......yy.......',
        '......yyyy......',
        '.....yywwyy.....',
        '....yywwwwyy....',
        '...yywwwwwwyy...',
        '....yywwwwyy....',
        '.....yyyyyy.....',
        '......yyyy......',
        '.......yy.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#f59e0b', w: '#fef08a' }
    );

    // Dark Essence
    registerItem(
      'dark_essence',
      [
        '......pppp......',
        '....ppddddpp....',
        '...pddmmmmddp...',
        '..pddmmwwmmddp..',
        '..pddmmwwmmddp..',
        '...pddmmmmddp...',
        '....ppddddpp....',
        '......pppp......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { p: '#581c87', d: '#7e22ce', m: '#c084fc', w: '#f3e8ff' }
    );

    // Ogre Hide
    registerItem(
      'ogre_hide',
      [
        '................',
        '..gggg....gggg..',
        '.gllllggggllllg.',
        '.gllllllllllllg.',
        '..gllllllllllg..',
        '..gllllllllllg..',
        '.gllllllllllllg.',
        '..gggggggggggg..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#14532d', l: '#4d7c0f' }
    );

    // Astral Shard
    registerItem(
      'astral_shard',
      [
        '.......cc.......',
        '......cwwc......',
        '.....cwwwwc.....',
        '...ccwwyywwcc...',
        '..cwwwwyywwwwc..',
        '...ccwwyywwcc...',
        '.....cwwwwc.....',
        '......cwwc......',
        '.......cc.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { c: '#0284c7', w: '#7dd3fc', y: '#fef08a' }
    );

    // Abyssal Pearl
    registerItem(
      'abyssal_pearl',
      [
        '................',
        '....cccccccc....',
        '..ccbbbbbbbbcc..',
        '.ccbffffffffbcc.',
        '.ccbfffwwfffbcc.',
        '.ccbffffffffbcc.',
        '..ccbbbbbbbbcc..',
        '....cccccccc....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { c: '#0f172a', b: '#38bdf8', f: '#e0f2fe', w: '#ffffff' }
    );

    // Primordial Essence
    registerItem(
      'primordial_essence',
      [
        '.......gg.......',
        '.....ggllgg.....',
        '....gllwwllg....',
        '...gllwwwwllg...',
        '...gllwwwwllg...',
        '....gllwwllg....',
        '.....ggllgg.....',
        '.......gg.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#047857', l: '#34d399', w: '#ecfdf5' }
    );

    // TOOLS & WEAPONS (Designed cleanly on 16x16 so they look awesome in HUD & when swung in game!)
    const buildAxe = (id: string, bladeColor: string, edgeColor: string, handleColor: string) => {
      registerItem(
        id,
        [
          '........eeee....',
          '.......ebbbbe...',
          '......ebbbbbbe..',
          '......ebbbhhbe..',
          '.......eebhhb...',
          '.........hh.....',
          '........hh......',
          '.......hh.......',
          '......hh........',
          '.....hh.........',
          '....hh..........',
          '...hh...........',
          '..hh............',
          '................',
          '................',
          '................',
        ],
        { b: bladeColor, e: edgeColor, h: handleColor }
      );
    };

    const buildPickaxe = (id: string, headColor: string, tipColor: string, handleColor: string) => {
      registerItem(
        id,
        [
          '.....ttttttt....',
          '....thhhhhhht...',
          '...thh...hhht...',
          '.........hh.tt..',
          '........hh..t...',
          '.......hh.......',
          '......hh........',
          '.....hh.........',
          '....hh..........',
          '...hh...........',
          '..hh............',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { h: handleColor, t: tipColor, b: headColor }
      );
    };

    const buildSword = (id: string, bladeColor: string, coreColor: string, hiltColor: string) => {
      registerItem(
        id,
        [
          '............bb..',
          '...........bccb.',
          '..........bccb..',
          '.........bccb...',
          '........bccb....',
          '.......bccb.....',
          '......bccb......',
          '...hhhbcb.......',
          '....hhhh........',
          '...sshh.........',
          '..ss..h.........',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { b: bladeColor, c: coreColor, h: hiltColor, s: '#78350f' }
      );
    };

    buildAxe('stone_axe', '#64748b', '#cbd5e1', '#8b5a2b');
    buildAxe('iron_axe', '#cbd5e1', '#ffffff', '#92400e');
    buildAxe('primordial_axe', '#10b981', '#a7f3d0', '#fbbf24');

    buildPickaxe('stone_pickaxe', '#64748b', '#94a3b8', '#8b5a2b');
    buildPickaxe('iron_pickaxe', '#e2e8f0', '#38bdf8', '#92400e');
    buildPickaxe('primordial_pickaxe', '#f59e0b', '#fef08a', '#0284c7');

    buildSword('wood_sword', '#94a3b8', '#cbd5e1', '#8b5a2b');
    buildSword('iron_sword', '#e2e8f0', '#ffffff', '#f59e0b');
    buildSword('astral_sword', '#38bdf8', '#fef08a', '#d97706');

    // Armors & Garments (Head, Body, Legs, Feet)
    const buildHelmet = (id: string, main: string, trim: string, crest?: string) => {
      registerItem(
        id,
        [
          '......cccc......',
          '....tttttttt....',
          '...tmmmmmmmmt...',
          '..tmmmmmmmmmmt..',
          '..tmttttttttmt..',
          '..tmt..tt..tmt..',
          '..tmt..tt..tmt..',
          '...tt......tt...',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { m: main, t: trim, c: crest || trim }
      );
    };

    const buildArmor = (id: string, main: string, trim: string) => {
      registerItem(
        id,
        [
          '..tttt....tttt..',
          '.tmmmmttttmmmmt.',
          '.tmmmmmmmmmmmmt.',
          '..ttmmmmmmmmtt..',
          '....tmmmmmmt....',
          '....tmmmmmmt....',
          '....tmmmmmmt....',
          '....tttttttt....',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { m: main, t: trim }
      );
    };

    const buildLegs = (id: string, main: string, trim: string, belt: string) => {
      registerItem(
        id,
        [
          '................',
          '...bbbbbbbbbb...',
          '...tmmmmmmmmt...',
          '...tmmmmmmmmt...',
          '...tmmm..mmmt...',
          '...tmmm..mmmt...',
          '...ttrt..trtt...',
          '...tmmm..mmmt...',
          '...tttt..tttt...',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { m: main, t: trim, r: belt, b: belt }
      );
    };

    const buildBoots = (id: string, main: string, sole: string, wing?: string) => {
      registerItem(
        id,
        [
          '................',
          '................',
          '..wwww....wwww..',
          '...mmmm..mmmm...',
          '...mmmm..mmmm...',
          '...mmmm..mmmm...',
          '..mmmmmm.mmmmmm.',
          '..ssssss.ssssss.',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { m: main, s: sole, w: wing || main }
      );
    };

    // Tier 1: Leather & Wool Set
    buildHelmet('leather_hood', '#92400e', '#fde68a', '#78350f');
    buildArmor('leather_tunic', '#a16207', '#fde047');
    buildLegs('leather_pants', '#854d0e', '#ca8a04', '#fde047');
    buildBoots('leather_boots', '#78350f', '#451a03', '#b45309');

    // Tier 2: Iron & Ogre Set
    buildHelmet('iron_helmet', '#94a3b8', '#f8fafc', '#dc2626');
    buildArmor('iron_armor', '#94a3b8', '#f8fafc');
    buildLegs('iron_greaves', '#64748b', '#cbd5e1', '#fbbf24');
    buildBoots('iron_boots', '#94a3b8', '#334155', '#e2e8f0');

    // Tier 3: Sovereign Astral Set
    buildHelmet('astral_crown', '#0284c7', '#fde047', '#38bdf8');
    buildArmor('astral_armor', '#0284c7', '#fde047');
    buildLegs('astral_leggings', '#0369a1', '#38bdf8', '#fde047');
    buildBoots('astral_boots', '#0284c7', '#f59e0b', '#fef08a');

    // Placeables icons
    registerItem(
      'workbench',
      [
        '................',
        '..tttttttttttt..',
        '.tllllllllllllt.',
        '.tttttttttttttt.',
        '..bb........bb..',
        '..bb.bbbbbb.bb..',
        '..bb........bb..',
        '..bb........bb..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { t: '#451a03', l: '#b45309', b: '#78350f' }
    );

    registerItem(
      'campfire',
      [
        '.......rr.......',
        '......ryyr......',
        '.....ryyyyr.....',
        '....ryyyyyyr....',
        '...bbbbbbbbbb...',
        '..ssssssssssss..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { r: '#ea580c', y: '#fde047', b: '#78350f', s: '#64748b' }
    );

    registerItem(
      'furnace',
      [
        '...dddddddddd...',
        '..dssssssssssd..',
        '.dssssssssssssd.',
        '.dssrrrrrrrrssd.',
        '.dssryyyyyyrssd.',
        '.dssryyyyyyrssd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', s: '#64748b', r: '#ea580c', y: '#fde047' }
    );

    registerItem(
      'solar_altar',
      [
        '......yyyy......',
        '.....ywwwwy.....',
        '......yyyy......',
        '..gggggggggggg..',
        '...gccccccccg...',
        '....gccccccg....',
        '..gggggggggggg..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#f59e0b', w: '#fef08a', g: '#d97706', c: '#0284c7' }
    );

    registerItem(
      'wood_wall',
      [
        '.bbbbbbbbbbbbbb.',
        '.bllbbllbbllbbl.',
        '.bllbbllbbllbbl.',
        '.bbbbbbbbbbbbbb.',
        '.bllbbllbbllbbl.',
        '.bllbbllbbllbbl.',
        '.bbbbbbbbbbbbbb.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#451a03', l: '#92400e' }
    );

    registerItem(
      'stone_wall',
      [
        '.dddddddddddddd.',
        '.dssddssssddssd.',
        '.dddddddddddddd.',
        '.dssssddssssddd.',
        '.dddddddddddddd.',
        '.dssddssssddssd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', s: '#94a3b8' }
    );

    registerItem(
      'wood_floor',
      [
        '................',
        '..bbbbbbbbbbbb..',
        '..bllllllllllb..',
        '..bbbbbbbbbbbb..',
        '..bllllllllllb..',
        '..bbbbbbbbbbbb..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#78350f', l: '#b45309' }
    );

    registerItem(
      'wood_bridge',
      [
        '................',
        '.cccccccccccccc.',
        '.bbbbbbbbbbbbbb.',
        '.bllbbllbbllbbl.',
        '.bbbbbbbbbbbbbb.',
        '.cccccccccccccc.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#78350f', l: '#d97706', c: '#38bdf8' }
    );

    registerItem(
      'torch',
      [
        '.......yy.......',
        '......ryyr......',
        '......ryyr......',
        '.......bb.......',
        '.......bb.......',
        '.......bb.......',
        '.......bb.......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#fef08a', r: '#f97316', b: '#78350f' }
    );

    registerItem(
      'guardian_totem',
      [
        '......yyyy......',
        '....yywwwwyy....',
        '.....yyccyy.....',
        '.....gggggg.....',
        '.....gccccg.....',
        '.....gggggg.....',
        '....gggggggg....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#f59e0b', w: '#fef08a', c: '#38bdf8', g: '#b45309' }
    );

    // === NEW CRAFTABLE ITEMS PIXEL SPRITES ===
    // Flint Spear
    registerItem(
      'flint_spear',
      [
        '...........fff..',
        '..........fllf..',
        '.........fllf...',
        '........rrrr....',
        '.......hhrr.....',
        '......hh........',
        '.....hh.........',
        '....hh..........',
        '...hh...........',
        '..hh............',
        '.hh.............',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { f: '#334155', l: '#cbd5e1', r: '#22c55e', h: '#8b5a2b' }
    );

    // Ogre Club
    registerItem(
      'ogre_club',
      [
        '........gggg....',
        '......ggbbbbgg..',
        '.....gbbbbbbbbg.',
        '.....gbbssssbbg.',
        '......ggbbbbgg..',
        '.......hhhhgg...',
        '......hh........',
        '.....hh.........',
        '....hh..........',
        '...hh...........',
        '..hh............',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#3f6212', b: '#78350f', s: '#cbd5e1', h: '#b45309' }
    );

    // Shadow Blade (Vampiric Scythe)
    registerItem(
      'shadow_blade',
      [
        '......pppppp....',
        '....ppmmmmmmpp..',
        '...pmmwwwwwwmmp.',
        '..pmww....hhhh..',
        '..pmw....hh.....',
        '........hh......',
        '.......hh.......',
        '......hh........',
        '.....hh.........',
        '....hh..........',
        '...pp...........',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { p: '#581c87', m: '#a855f7', w: '#f3e8ff', h: '#334155' }
    );

    // Abyssal Trident
    registerItem(
      'abyssal_trident',
      [
        '........cc..cc..',
        '.......cwwccwwc.',
        '......cwwwwwwwwc',
        '.......cccccccc.',
        '........gggg....',
        '.......hhgg.....',
        '......hh........',
        '.....hh.........',
        '....hh..........',
        '...hh...........',
        '..cc............',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { c: '#0284c7', w: '#e0f2fe', g: '#fbbf24', h: '#0369a1' }
    );

    // Wool Bandage
    registerItem(
      'wool_bandage',
      [
        '................',
        '....wwwwwwww....',
        '..wwffffffffww..',
        '.wffffrrrrffffw.',
        '.wffrrrrrrrrffw.',
        '.wffffrrrrffffw.',
        '..wwffffffffww..',
        '....wwwwwwww....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { w: '#cbd5e1', f: '#ffffff', r: '#ef4444' }
    );

    // Coconut Elixir
    registerItem(
      'coconut_elixir',
      [
        '.......gg.......',
        '......gllg......',
        '....bbbbbbbb....',
        '..bbccccccccbb..',
        '.bbccwwwwwwccbb.',
        '.bbccwwwwwwccbb.',
        '..bbddddddddbb..',
        '....bbbbbbbb....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#22c55e', l: '#86efac', b: '#451a03', d: '#78350f', c: '#38bdf8', w: '#e0f2fe' }
    );

    // Warrior Feast
    registerItem(
      'warrior_feast',
      [
        '................',
        '.....rrrrrr.....',
        '...rrffffffrr...',
        '..rffyyyyyyffr..',
        '.gggggggggggggg.',
        '..sbbbbbbbbbbbs.',
        '...sssssssssss..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { r: '#b91c1c', f: '#f97316', y: '#fef08a', g: '#22c55e', b: '#78350f', s: '#94a3b8' }
    );

    // Shadow Elixir
    registerItem(
      'shadow_elixir',
      [
        '......yyyy......',
        '......pppp......',
        '.....pddddp.....',
        '....pdmmmmmdp...',
        '...pdmmwwwwmdp..',
        '...pdmmmmmmmdp..',
        '....pdddddddp...',
        '.....ppppppp....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#f59e0b', p: '#3b0764', d: '#7e22ce', m: '#c084fc', w: '#f3e8ff' }
    );

    // Fire Bomb
    registerItem(
      'fire_bomb',
      [
        '........yy......',
        '.......ryyr.....',
        '......bb........',
        '....dddddddd....',
        '..ddssrrrrssdd..',
        '.ddssrryyrrssdd.',
        '.ddssrrrrrrssdd.',
        '..ddssssssssdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#fef08a', r: '#f97316', b: '#a16207', d: '#0f172a', s: '#334155' }
    );

    // Recall Crystal
    registerItem(
      'recall_crystal',
      [
        '......yyyy......',
        '....yyccccyy....',
        '...yccwwwwccy...',
        '..ycwwwwwwwwcy..',
        '..ycwwwwwwwwcy..',
        '...yccwwwwccy...',
        '....yyccccyy....',
        '......yyyy......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#f59e0b', c: '#0284c7', w: '#e0f2fe' }
    );

    // Primordial Ambrosia
    registerItem(
      'primordial_ambrosia',
      [
        '......yyyy......',
        '....yyggggyy....',
        '...yggllllggy...',
        '..ygllwwwwllgy..',
        '..ygllwwwwllgy..',
        '...yggllllggy...',
        '....yyyyyyyy....',
        '.....yyyyyy.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#fbbf24', g: '#059669', l: '#34d399', w: '#ffffff' }
    );

    // Stone Floor Icon
    registerItem(
      'stone_floor',
      [
        '................',
        '..dddddddddddd..',
        '..dllllddlllld..',
        '..dddddddddddd..',
        '..ddlllllldddd..',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#334155', l: '#94a3b8' }
    );

    // Spike Trap Icon
    registerItem(
      'spike_trap',
      [
        '................',
        '...ww..ww..ww...',
        '..sswwsswwssww..',
        '..ssssssssssss..',
        '.bbbbbbbbbbbbbb.',
        '.bddddddddddddb.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { w: '#f8fafc', s: '#94a3b8', b: '#451a03', d: '#78350f' }
    );

    // Explorer Tent Icon
    registerItem(
      'explorer_tent',
      [
        '.......yy.......',
        '......wwww......',
        '.....wwllww.....',
        '....wwllllww....',
        '...wwllbbllww...',
        '..wwllbbbbllww..',
        '.bbbbbbbbbbbbbb.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#f59e0b', w: '#f8fafc', l: '#cbd5e1', b: '#451a03' }
    );

    // Healing Fountain Icon
    registerItem(
      'healing_fountain',
      [
        '......wwww......',
        '.....cccccc.....',
        '....ccwwwwcc....',
        '..ssssssssssss..',
        '.ssccccccccccss.',
        '..ssssssssssss..',
        '....ssssssss....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { w: '#e0f2fe', c: '#38bdf8', s: '#94a3b8' }
    );

    // Chest Icon
    registerItem(
      'chest',
      [
        '................',
        '..dddddddddddd..',
        '.diiwwwwwwwwiid.',
        '.diwllllllllwid.',
        '.ddddggyyggdddd.',
        '.diwwwwgygwwwid.',
        '.diwwwwwwwwwwid.',
        '.diwwwwwwwwwwid.',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', w: '#92400e', l: '#d97706', i: '#64748b', g: '#f59e0b', y: '#fef08a' }
    );

    // Gold Coin Icon
    registerItem(
      'gold_coin',
      [
        '................',
        '.....dddddd.....',
        '...ddggggggdd...',
        '..dgghyyyyhggd..',
        '..dgyyggggyygd..',
        '.dghygddddgyhgd.',
        '.dgygddyyddgygd.',
        '.dgygdyyyyddyggd',
        '.dgygddyyddgygd.',
        '.dghygddddgyhgd.',
        '..dgyyggggyygd..',
        '..dgghyyyyhggd..',
        '...ddggggggdd...',
        '.....dddddd.....',
        '................',
        '................',
      ],
      { d: '#78350f', g: '#f59e0b', y: '#fde047', h: '#ffffff' }
    );

    // Spider Silk Icon
    registerItem(
      'spider_silk',
      [
        '................',
        '....dddddddd....',
        '..ddssssssssdd..',
        '.dsswwwwwwwwssd.',
        '.dswsssssssswsd.',
        '.dswswwwwwwswsd.',
        '.dswswsssswswsd.',
        '.dswswwwwwwswsd.',
        '.dswsssssssswsd.',
        '.dsswwwwwwwwssd.',
        '..ddssssssssdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#312e81', s: '#cbd5e1', w: '#f8fafc' }
    );

    // Scorpion Stinger Icon
    registerItem(
      'scorpion_stinger',
      [
        '................',
        '..........dddd..',
        '........ddggggd.',
        '.......dggyyyygd',
        '......dggydddd..',
        '.....dggyd......',
        '....dggyd.......',
        '...dgggyd.......',
        '...dgggyd.......',
        '....dgggyd......',
        '.....dggggd.....',
        '......ddppdd....',
        '........dppd....',
        '................',
        '................',
        '................',
      ],
      { d: '#451a03', g: '#d97706', y: '#fde047', p: '#a855f7' }
    );

    // Golem Core Icon
    registerItem(
      'golem_core',
      [
        '................',
        '....dddddddd....',
        '..ddssssssssdd..',
        '.dssccccccccssd.',
        '.dscbbbbbbbbcscd',
        '.dscbwwwwwwbcscd',
        '.dscbwwwwwwbcscd',
        '.dscbbbbbbbbcscd',
        '.dssccccccccssd.',
        '..ddssssssssdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', s: '#64748b', c: '#0284c7', b: '#38bdf8', w: '#e0f2fe' }
    );

    // Scorpion Dagger Icon
    registerItem(
      'scorpion_dagger',
      [
        '...........dddd.',
        '.........ddgggd.',
        '........dgyyygd.',
        '.......dgyyygd..',
        '......dgyyygd...',
        '.....dgyyygd....',
        '....dgyyygd.....',
        '...ddpppgd......',
        '..dpppppd.......',
        '...dwwwd........',
        '..dwwd..........',
        '.dwwd...........',
        '.ddd............',
        '................',
        '................',
        '................',
      ],
      { d: '#1e1b4b', g: '#d97706', y: '#fef08a', p: '#9333ea', w: '#cbd5e1' }
    );

    // Village Well Icon
    registerItem(
      'village_well',
      [
        '....dddddddd....',
        '..ddwwwwwwwwdd..',
        '.dwwwwwwwwwwwwd.',
        '..ddsddddddssd..',
        '...ds......sd...',
        '...ds..ww..sd...',
        '..dddddddddddd..',
        '.dssssssssssssd.',
        '.dsbbbbbbbbbbbsd',
        '.dssssssssssssd.',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', w: '#b45309', s: '#94a3b8', b: '#38bdf8' }
    );

    // Market Stall Icon
    registerItem(
      'market_stall',
      [
        '................',
        '..dddddddddddd..',
        '.drrwwrrwwrrwwd.',
        '.drrwwrrwwrrwwd.',
        '..dddddddddddd..',
        '..dw........wd..',
        '..dw..ggyy..wd..',
        '..dwwwwwwwwwwd..',
        '..dwwwwwwwwwwd..',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', r: '#dc2626', w: '#f8fafc', g: '#d97706', y: '#fde047' }
    );

    // Village House Icon
    registerItem(
      'village_house',
      [
        '......dddd......',
        '....ddrrrrdd....',
        '..ddrrrrrrrrdd..',
        '.drrrrrrrrrrrrd.',
        '.dddddddddddddd.',
        '..dwwyyyyyywwd..',
        '..dwwyggggywwd..',
        '..dwwyyyyyywwd..',
        '..dwwwwddwwwwd..',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1f1209', r: '#b45309', w: '#78350f', y: '#fef3c7', g: '#fde047' }
    );

    // Royal Banner Icon
    registerItem(
      'royal_banner',
      [
        '.....dddddd.....',
        '....dggggggd....',
        '....drrrrrrd....',
        '....drgggggrd...',
        '....drgyygrd....',
        '....drgggggrd...',
        '....drrrrrrd....',
        '....drrddrdd....',
        '......dwwd......',
        '......dwwd......',
        '.....dddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e1b4b', g: '#f59e0b', r: '#b91c1c', y: '#fef08a', w: '#92400e' }
    );

    // === NEW ARCHITECTURAL & BUILDING SYSTEM ITEM ICONS ===
    // Wood Door Icon
    registerItem(
      'wood_door',
      [
        '....dddddddd....',
        '...dbbbbbbbbd...',
        '..dbllllllllbd..',
        '..dblbbddbllbd..',
        '..dblbbddbllbd..',
        '..dbbbbbbbbbbd..',
        '..dbllllllllbd..',
        '..dbllllllggbd..',
        '..dbllllllllbd..',
        '..dbllllllllbd..',
        '..dbbbbbbbbbbd..',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1f1209', b: '#78350f', l: '#b45309', g: '#fde047' }
    );

    // Iron Gate Icon
    registerItem(
      'iron_gate',
      [
        '....dddddddd....',
        '..ddssssssssdd..',
        '.dssddddddddssd.',
        '.dsdii.ii.iidsd.',
        '.dsdii.ii.iidsd.',
        '.dsdddddddddsd..',
        '.dsdii.gg.iidsd.',
        '.dsdii.gg.iidsd.',
        '.dsdii.ii.iidsd.',
        '.dsdddddddddsd..',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', s: '#64748b', i: '#cbd5e1', g: '#fbbf24' }
    );

    // Wood Fence Icon
    registerItem(
      'wood_fence',
      [
        '................',
        '..dddd....dddd..',
        '..dbbd....dbbd..',
        '.ddbbddddddbbdd.',
        '.dlllllllllllld.',
        '.dddddddddddddd.',
        '..dbbd....dbbd..',
        '.ddbbddddddbbdd.',
        '.dlllllllllllld.',
        '.dddddddddddddd.',
        '..dbbd....dbbd..',
        '..dddd....dddd..',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', b: '#78350f', l: '#d97706' }
    );

    // Wood Window Icon
    registerItem(
      'wood_window',
      [
        '.dddddddddddddd.',
        '.dbbbbbbbbbbbbd.',
        '.dblddddddddldd.',
        '.dbldccccccdldd.',
        '.dbldccwwccdldd.',
        '.dblddddddddldd.',
        '.dbldccwwccdldd.',
        '.dbldccccccdldd.',
        '.dblddddddddldd.',
        '.dbbbbbbbbbbbbd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1f1209', b: '#78350f', l: '#b45309', c: '#38bdf8', w: '#fef08a' }
    );

    // Stone Window Icon
    registerItem(
      'stone_window',
      [
        '.dddddddddddddd.',
        '.dssssssssssssd.',
        '.dssddddddddssd.',
        '.dssdccccccdssd.',
        '.dssdcgyygcdssd.',
        '.dssdccccccdssd.',
        '.dssdcgyygcdssd.',
        '.dssdccccccdssd.',
        '.dssddddddddssd.',
        '.dssssssssssssd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', s: '#64748b', c: '#0284c7', g: '#f59e0b', y: '#fef08a' }
    );

    // Brick Floor Icon
    registerItem(
      'brick_floor',
      [
        '................',
        '..dddddddddddd..',
        '.dggggggggggggd.',
        '.dgbbddbbddbbgd.',
        '.dgddddddddddgd.',
        '.dgbddbbddbbggd.',
        '.dgddddddddddgd.',
        '.dgbbddbbddbbgd.',
        '.dggggggggggggd.',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', g: '#fbbf24', b: '#b91c1c' }
    );

    // Brick Wall Icon
    registerItem(
      'brick_wall',
      [
        '.dddddddddddddd.',
        '.dggddggggddggd.',
        '.dddddddddddddd.',
        '.drrrrddrrrrrrd.',
        '.dddddddddddddd.',
        '.drrddrrrrddrrd.',
        '.dddddddddddddd.',
        '.drrrrddrrrrrrd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e1b4b', g: '#cbd5e1', r: '#991b1b' }
    );

    // Royal Carpet Icon
    registerItem(
      'royal_carpet',
      [
        '................',
        '..yyyyyyyyyyyy..',
        '.yddddddddddddy.',
        '.ydrrrrrrrrrrdy.',
        '.ydrggggggggrdy.',
        '.ydrgwwwwwwgrdy.',
        '.ydrggggggggrdy.',
        '.ydrrrrrrrrrrdy.',
        '.yddddddddddddy.',
        '..yyyyyyyyyyyy..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#fde047', d: '#450a0a', r: '#dc2626', g: '#f59e0b', w: '#fef3c7' }
    );

    // Iron Lantern Icon
    registerItem(
      'iron_lantern',
      [
        '......dddd......',
        '.....dssssd.....',
        '....dddddddd....',
        '....dgyyyyyd....',
        '....dywwwwyd....',
        '....dywwwwyd....',
        '....dgyyyyyd....',
        '....dddddddd....',
        '.....dssssd.....',
        '......dddd......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', s: '#64748b', g: '#f59e0b', y: '#fde047', w: '#ffffff' }
    );

    // Stone Hoe Icon
    registerItem(
      'stone_hoe',
      [
        '.....ssssss.....',
        '....sdddddds....',
        '....sds..ww.....',
        '....ss..wbbw....',
        '.......wb..bw...',
        '......wb....bw..',
        '.....wb......bw.',
        '....wb..........',
        '...wb...........',
        '..wb............',
        '.wb.............',
        'wb..............',
        '................',
        '................',
        '................',
        '................',
      ],
      { s: '#1e293b', d: '#94a3b8', w: '#78350f', b: '#b45309' }
    );

    // Iron Hoe Icon
    registerItem(
      'iron_hoe',
      [
        '.....iiiiii.....',
        '....iwwwwwdi....',
        '....iwi..dd.....',
        '....ii..dbbd....',
        '.......db..bd...',
        '......db....bd..',
        '.....db......bd.',
        '....db..........',
        '...db...........',
        '..db............',
        '.db.............',
        'db..............',
        '................',
        '................',
        '................',
        '................',
      ],
      { i: '#0f172a', w: '#cbd5e1', d: '#451a03', b: '#92400e' }
    );

    // Watering Can (Empty)
    registerItem(
      'watering_can',
      [
        '................',
        '....dddddd......',
        '...dssssssd.....',
        '..ds......sd....',
        '..ds.dddd.sd....',
        '..dsdssssdsd..s.',
        '...dssssssd..ss.',
        '...dssssssd.ss..',
        '...dssssssdss...',
        '...dssssssds....',
        '...dddddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', s: '#64748b' }
    );

    // Watering Can Full (With Water)
    registerItem(
      'watering_can_full',
      [
        '................',
        '....dddddd......',
        '...dssssssd.....',
        '..ds......sd....',
        '..ds.wwww.sd....',
        '..dsdccccdsd..c.',
        '...dccccssd..cc.',
        '...dccccssd.cc..',
        '...dssssssdss...',
        '...dssssssds....',
        '...dddddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', s: '#64748b', c: '#0284c7', w: '#38bdf8' }
    );

    // Bone Fertilizer Icon
    registerItem(
      'bone_fertilizer',
      [
        '................',
        '.....bbbb.......',
        '....bggggb......',
        '...bgwwwwgb.....',
        '..bgggwwgggb....',
        '..bgwyyyywgb....',
        '..bgwyyyywgb....',
        '..bgggwwgggb....',
        '..bggggggggb....',
        '...bbbbbbbb.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#2a1a08', g: '#15803d', w: '#fef08a', y: '#84cc16' }
    );

    // Wheat Sheaf Icon
    registerItem(
      'wheat',
      [
        '................',
        '....yy....yy....',
        '...yyyy..yyyy...',
        '..yyddyyyyddyy..',
        '...yyddddddyy...',
        '....yyddddyy....',
        '.....ybbbbgy....',
        '......ybbgy.....',
        '.......ygy......',
        '.......ygy......',
        '.......ygy......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { y: '#fde047', d: '#ca8a04', b: '#b45309', g: '#65a30d' }
    );

    // Carrot Icon
    registerItem(
      'carrot',
      [
        '..........gg....',
        '.........gggg...',
        '........gggg....',
        '......ooog......',
        '.....ooooo......',
        '....oooooo......',
        '...ooooooo......',
        '..dddooo........',
        '..dddoo.........',
        '.ddddo..........',
        '.dddd...........',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#16a34a', o: '#f97316', d: '#ea580c' }
    );

    // Medic Herb Icon
    registerItem(
      'medic_herb',
      [
        '................',
        '......gggg......',
        '....gggggggg....',
        '...ggggccgggg...',
        '..ggggccccgggg..',
        '..gggccccccggg..',
        '..ggggccccgggg..',
        '...ggggccgggg...',
        '....gggggggg....',
        '......gggg......',
        '.......gg.......',
        '.......gg.......',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#059669', c: '#67e8f9' }
    );

    // Solar Bloom Icon
    registerItem(
      'solar_bloom',
      [
        '................',
        '.....rr..rr.....',
        '....rooo..oor...',
        '...rooyyyyroor..',
        '...rooywwwyoor..',
        '...rooyyyyroor..',
        '....rooo..oor...',
        '.....rr..rr.....',
        '.......gg.......',
        '.......gg.......',
        '......gggg......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { r: '#b91c1c', o: '#ea580c', y: '#fde047', w: '#ffffff', g: '#15803d' }
    );

    // Seeds Packets
    const seedDrawer = (accentColor: string) => [
      '................',
      '.....bbbbbb.....',
      '....bwwwwwwb....',
      '...bwwwwwwwwb...',
      '..bwwwwwwwwwwb..',
      '..bwwwwaawwwb..',
      '..bwwwaaaawwwb..',
      '..bwwwwaawwwb..',
      '..bwwwwwwwwwwb..',
      '..bwwwwwwwwwwb..',
      '...bbbbbbbbbb...',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
    registerItem('wheat_seeds', seedDrawer('#ca8a04'), { b: '#3d2510', w: '#fef3c7', a: '#eab308' });
    registerItem('carrot_seeds', seedDrawer('#ea580c'), { b: '#3d2510', w: '#fef3c7', a: '#f97316' });
    registerItem('herb_seeds', seedDrawer('#0d9488'), { b: '#3d2510', w: '#fef3c7', a: '#14b8a6' });
    registerItem('solar_seeds', seedDrawer('#d97706'), { b: '#3d2510', w: '#fef3c7', a: '#f59e0b' });
    registerItem('berry_seeds', seedDrawer('#be123c'), { b: '#3d2510', w: '#fef3c7', a: '#f43f5e' });

    // Fresh Bread Icon
    registerItem(
      'fresh_bread',
      [
        '................',
        '.....bbbbbb.....',
        '...bbddddddbb...',
        '..bddwwwwwwddb..',
        '.bddwbbwwbbwddb.',
        '.bddwbbwwbbwddb.',
        '.bddwwwwwwwwddb.',
        '..bddddddddddb..',
        '...bbbbbbbbbb...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#451a03', d: '#92400e', w: '#fde047' }
    );

    // Vegetable Stew Icon
    registerItem(
      'vegetable_stew',
      [
        '................',
        '....ss....ss....',
        '.....ss..ss.....',
        '...bbbbbbbbbb...',
        '..boooggroorob..',
        '.booggoorgoooob.',
        '.bbbbbbbbbbbbbb.',
        '..bbbbbbbbbbbb..',
        '...bbbbbbbbbb...',
        '....bbbbbbbb....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#5c381e', o: '#ea580c', g: '#16a34a', r: '#be123c', s: '#e2e8f0' }
    );

    // Herbal Poultice Icon
    registerItem(
      'herbal_poultice',
      [
        '................',
        '....wwwwwwww....',
        '...wddddddddw...',
        '..wdggggggggdw..',
        '..wdggccccggdw..',
        '..wdggccccggdw..',
        '..wdggggggggdw..',
        '...wddddddddw...',
        '....wwwwwwww....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { w: '#f1f5f9', d: '#cbd5e1', g: '#059669', c: '#67e8f9' }
    );

    // Farm Feed Icon
    registerItem(
      'farm_feed',
      [
        '................',
        '.....bbbbbb.....',
        '....bddddddb....',
        '...bdyyyyyydb...',
        '..bdyyoooyyydb..',
        '..bdyyoooyyydb..',
        '..bdyyyyyyyydb..',
        '..bddddddddddb..',
        '...bbbbbbbbbb...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#3d2510', d: '#78350f', y: '#fde047', o: '#f97316' }
    );

    // Tilled Soil Icon
    registerItem(
      'tilled_soil',
      [
        '................',
        '.dddddddddddddd.',
        '.dssssddssssddd.',
        '.dddddddddddddd.',
        '.dssssddssssddd.',
        '.dddddddddddddd.',
        '.dssssddssssddd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#382314', s: '#5c3a1e' }
    );

    // Royal Wax Seal (Selo de Cera Real) — Crimson wax emblem with golden crown imprint & ribbon
    registerItem(
      'royal_wax_seal',
      [
        '.....gggggg.....',
        '...ggGyyyyGgg...',
        '..grrrrrrrrrrg..',
        '.grrRRRRRRRRrrg.',
        '.grRRy..y..yRRg.',
        'grRRyyyyyyyyRRrg',
        'grRRyGyyyyGyRRrg',
        'grRRyyyyyyyyRRrg',
        'grRRRGGGGGGGGGrr',
        '.grRRRRRRRRRRrg.',
        '.grrrrrrrrrrrrg.',
        '..gddrrrrrrddg..',
        '...bb.gggg.bb...',
        '..bb........bb..',
        '.bb..........bb.',
        '................',
      ],
      {
        g: '#b45309',
        G: '#f59e0b',
        y: '#fef08a',
        r: '#991b1b',
        R: '#dc2626',
        d: '#450a0a',
        b: '#7f1d1d',
      }
    );

    // Royal Peace Treaty (Tratado da Paz Real) — Ornate parchment scroll with golden rollers, olive branch & crimson wax seal
    registerItem(
      'peace_treaty',
      [
        '..GGggggggggGG..',
        '.GyyppppppppyyG.',
        '..dppppppppppd..',
        '..ppLppppppppp..',
        '..pLLLpppppppp..',
        '..ppLpppttttpp..',
        '..pppppppppppp..',
        '..ppptttpppppp..',
        '..ppppppttttpp..',
        '..ppppprrrrppp..',
        '..ppppprYYrppp..',
        '..ppppprrrrppp..',
        '..dppppbbpbppd..',
        '.Gyyppppb.bpyyG.',
        '..GGggggggggGG..',
        '................',
      ],
      {
        G: '#fef08a',
        g: '#d97706',
        y: '#f59e0b',
        d: '#78350f',
        p: '#fef3c7',
        t: '#92400e',
        L: '#22c55e',
        r: '#dc2626',
        Y: '#fde047',
        b: '#991b1b',
      }
    );

    // === FISHING SYSTEM SPRITES ===
    // Fishing Rod (Vara de Pesca Rústica)
    registerItem(
      'fishing_rod',
      [
        '...........bbb..',
        '..........bbwb..',
        '.........bb..w..',
        '........bb...w..',
        '.......bb....w..',
        '......bb.....w..',
        '.....bb......r..',
        '....bb......rrr.',
        '...bb.......www.',
        '..hbb........r..',
        '.hhb............',
        '.hh.............',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#b45309', h: '#451a03', w: '#e2e8f0', r: '#ef4444' }
    );

    // Tilápia Prateada (Basic Fish)
    registerItem(
      'fish_tilapia',
      [
        '................',
        '......dddddd....',
        '....ddssssssdd..',
        '...dsswwwwwwssd.',
        '..dswsswwwwsedd.',
        '.ddssssssssssdd.',
        'dd.dsswwwwwwssd.',
        'd...ddssssssdd..',
        '......dddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1e293b', s: '#94a3b8', w: '#e2e8f0', e: '#0f172a' }
    );

    // Salmão Real (Rare Fish)
    registerItem(
      'fish_salmon',
      [
        '................',
        '......dddddd....',
        '....ddttttttdd..',
        '...dttrrrrrrttd.',
        '..dtrrrppprrted.',
        '.ddttrrrrrrrrdd.',
        'dd.dttppppppttd.',
        'd...ddttttttdd..',
        '......dddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#0f172a', t: '#0f766e', r: '#fb7185', p: '#fda4af', e: '#fef08a' }
    );

    // Peixe-Sol Dourado (Very Rare Golden Fish)
    registerItem(
      'fish_golden',
      [
        '.......gggg.....',
        '.....ggyyyygg...',
        '...ggyywwwwyygg.',
        '..gyywwyyyywwyg.',
        '.ggywwwwyyyyzeg.',
        'gg.gyywwwwwwyyg.',
        'g...ggyyyyyygg..',
        '......gggggg....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { g: '#b45309', y: '#f59e0b', w: '#fef08a', z: '#ffffff', e: '#0284c7' }
    );

    // Peixe Assado na Brasa (Cooked Fish)
    registerItem(
      'cooked_fish',
      [
        '.....ss..ss.....',
        '......ss..ss....',
        '......dddddd....',
        '....ddbbbbbbdd..',
        '...dbbllllllbbd.',
        '..dblbbllllbedd.',
        '.ddbbbbbbbbbbdd.',
        'dd.dbbllllllbbd.',
        'd...ddbbbbbbdd..',
        '......dddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', b: '#92400e', l: '#d97706', e: '#fef08a', s: '#cbd5e1' }
    );

    registerItem(
      'saddle',
      [
        '................',
        '....ddd..ddd....',
        '...dlllddllld...',
        '..dlbbbbbbbbld..',
        '..dbbbggggbbbd..',
        '..dbbbllllbbbd..',
        '...ddddbbdddd...',
        '....d.dbbd.d....',
        '....d..dd..d....',
        '...gsg....gsg...',
        '...ggg....ggg...',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', b: '#78350f', l: '#b45309', g: '#fbbf24', s: '#cbd5e1' }
    );

    registerItem(
      'wood_boat',
      [
        '................',
        '.......dd.......',
        '......dbbd......',
        '......dbbd......',
        '..dddddbbddddd..',
        '.dlllllllllllld.',
        'dlbbbbbbbbbbbbld',
        'dbbbddddddddbbbd',
        '.dbbbbbbbbbbbbd.',
        '..dddddddddddd..',
        '...wwwwwwwwww...',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', b: '#78350f', l: '#b45309', w: '#38bdf8' }
    );
  }

  private buildNatureNodes(): void {
    // High-resolution proportional pixel-art canvases with 3 morphological variants (0, 1, 2) and 4 animation frames each
    const registerNatureVariants = (
      type: NatureNodeType,
      width: number,
      height: number,
      drawer: (ctx: CanvasRenderingContext2D, frame: number, variant: number) => void
    ) => {
      for (let v = 0; v < 3; v++) {
        const frames: HTMLCanvasElement[] = [];
        for (let f = 0; f < 4; f++) {
          const c = createPixelCanvas(width, height);
          const ctx = c.getContext('2d')!;
          drawer(ctx, f, v);
          frames.push(c);
        }
        this.natureSprites.set(`${type}_${v}`, frames);
        if (v === 0) {
          this.natureSprites.set(type, frames);
        }
      }
    };

    const drawFoliageLobe = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      colors: {
        outline: string;
        deep: string;
        mid: string;
        bright: string;
        spec: string;
      }
    ) => {
      // Dark outer silhouette
      ctx.fillStyle = colors.outline;
      ctx.fillRect(cx - rx, cy - ry + 2, rx * 2, ry * 2 - 4);
      ctx.fillRect(cx - rx + 2, cy - ry, rx * 2 - 4, ry * 2);
      // Deep shadow base
      ctx.fillStyle = colors.deep;
      ctx.fillRect(cx - rx + 1, cy - ry + 2, rx * 2 - 2, ry * 2 - 3);
      ctx.fillRect(cx - rx + 3, cy - ry + 1, rx * 2 - 6, ry * 2 - 2);
      // Mid foliage body
      ctx.fillStyle = colors.mid;
      ctx.fillRect(cx - rx + 2, cy - ry + 2, rx * 2 - 4, ry * 2 - 6);
      ctx.fillRect(cx - rx + 4, cy - ry + 1, rx * 2 - 8, ry * 2 - 5);
      // Sunlit upper crown
      ctx.fillStyle = colors.bright;
      ctx.fillRect(cx - rx + 3, cy - ry + 2, rx * 2 - 6, Math.max(3, ry - 1));
      ctx.fillRect(cx - rx + 5, cy - ry + 1, rx * 2 - 10, Math.max(2, ry - 2));
      // Specular leaf clusters
      ctx.fillStyle = colors.spec;
      ctx.fillRect(cx - Math.floor(rx * 0.5), cy - ry + 2, Math.max(3, rx - 2), 2);
      ctx.fillRect(cx - Math.floor(rx * 0.3), cy - ry + 4, Math.max(2, Math.floor(rx * 0.6)), 1);
    };

    // 1. OAK TREE (64x80 canvas) — 3 distinct morphological archetypes:
    // v0: Mature Classic Broad Oak with Apples
    // v1: Tall Slender Woodland Oak (taller, narrower crown)
    // v2: Ancient Patriarch Oak (gnarled wide trunk + wide spreading boughs)
    registerNatureVariants(NatureNodeType.OAK_TREE, 64, 80, (ctx, f, v) => {
      const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
      const oakColors = {
        outline: '#092212',
        deep: '#14532d',
        mid: '#15803d',
        bright: '#22c55e',
        spec: '#86efac',
      };

      // Ground contact shadow
      ctx.fillStyle = 'rgba(8, 16, 10, 0.34)';
      const shW = v === 2 ? 36 : v === 1 ? 24 : 30;
      ctx.fillRect(32 - shW / 2, 72, shW, 5);

      // Trunk & Root Buttresses (anchored at y=74)
      const trunkW = v === 2 ? 14 : v === 1 ? 8 : 11;
      const trunkTop = v === 1 ? 34 : 38;
      const tx = 32 - Math.floor(trunkW / 2);

      // Outer bark outline
      ctx.fillStyle = '#1c1008';
      ctx.fillRect(tx - 1, trunkTop, trunkW + 2, 75 - trunkTop);
      ctx.fillRect(tx - 4, 70, trunkW + 8, 5);
      ctx.fillRect(tx - 6, 72, trunkW + 12, 3);
      // Spread branches under canopy
      ctx.fillRect(tx - 6, trunkTop + 2, trunkW + 12, 5);

      // Main bark fill
      ctx.fillStyle = '#5c381e';
      ctx.fillRect(tx, trunkTop, trunkW, 74 - trunkTop);
      ctx.fillRect(tx - 3, 71, trunkW + 6, 3);
      // Bark vertical ridges & sunlit side
      ctx.fillStyle = '#7c4d2b';
      ctx.fillRect(tx + 1, trunkTop + 1, Math.max(3, trunkW - 4), 73 - trunkTop);
      ctx.fillRect(tx - 4, 72, 4, 2);
      ctx.fillRect(tx + trunkW, 72, 4, 2);
      ctx.fillStyle = '#a16638';
      ctx.fillRect(tx + 2, trunkTop + 3, 2, 68 - trunkTop);
      // Dark bark hollow / texture
      ctx.fillStyle = '#3b2210';
      ctx.fillRect(tx + trunkW - 3, trunkTop + 10, 2, 14);
      if (v === 2) {
        ctx.fillRect(tx + 4, 56, 3, 5);
      }

      // Multi-sphere Layered Canopy
      if (v === 1) {
        // Variant 1: Tall Spire / Slender Woodland Oak
        drawFoliageLobe(ctx, 24 + sway, 38, 12, 10, oakColors);
        drawFoliageLobe(ctx, 40 + sway, 38, 12, 10, oakColors);
        drawFoliageLobe(ctx, 32 + sway, 28, 15, 13, oakColors);
        drawFoliageLobe(ctx, 32 + sway, 16, 12, 11, oakColors);
      } else if (v === 2) {
        // Variant 2: Wide Spreading Ancient Oak
        drawFoliageLobe(ctx, 17 + sway, 38, 14, 11, oakColors);
        drawFoliageLobe(ctx, 47 + sway, 38, 14, 11, oakColors);
        drawFoliageLobe(ctx, 25 + sway, 26, 16, 13, oakColors);
        drawFoliageLobe(ctx, 39 + sway, 26, 16, 13, oakColors);
        drawFoliageLobe(ctx, 32 + sway, 18, 17, 12, oakColors);
      } else {
        // Variant 0: Classic Balanced Lush Oak
        drawFoliageLobe(ctx, 20 + sway, 36, 13, 11, oakColors);
        drawFoliageLobe(ctx, 44 + sway, 36, 13, 11, oakColors);
        drawFoliageLobe(ctx, 32 + sway, 30, 18, 14, oakColors);
        drawFoliageLobe(ctx, 32 + sway, 18, 14, 11, oakColors);
      }

      // Glossy Red Apples hanging in canopy
      const drawApple = (ax: number, ay: number) => {
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(ax - 1, ay - 1, 5, 5);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(ax, ay, 3, 3);
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(ax, ay, 1, 1);
      };
      if (v === 1) {
        drawApple(25 + sway, 33);
        drawApple(37 + sway, 24);
        drawApple(30 + sway, 18);
      } else if (v === 2) {
        drawApple(15 + sway, 36);
        drawApple(28 + sway, 27);
        drawApple(44 + sway, 34);
        drawApple(36 + sway, 19);
      } else {
        drawApple(21 + sway, 34);
        drawApple(40 + sway, 31);
        drawApple(31 + sway, 22);
      }
    });

    // 2. HARDWOOD TREE (Rare — 64x80 canvas) — Majestic Golden-Crimson Autumn Hardwood
    registerNatureVariants(NatureNodeType.HARDWOOD_TREE, 64, 80, (ctx, f, v) => {
      const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
      const autumnColors =
        v === 1
          ? {
              outline: '#3b0a0a',
              deep: '#7f1d1d',
              mid: '#dc2626',
              bright: '#f97316',
              spec: '#fde047',
            }
          : {
              outline: '#3b1106',
              deep: '#9a3412',
              mid: '#ea580c',
              bright: '#f59e0b',
              spec: '#fef08a',
            };

      ctx.fillStyle = 'rgba(15, 10, 5, 0.36)';
      ctx.fillRect(14, 72, 36, 5);

      // Thick Mahogany Trunk & Flared Roots
      const trunkW = v === 2 ? 16 : 13;
      const tx = 32 - Math.floor(trunkW / 2);
      ctx.fillStyle = '#261005';
      ctx.fillRect(tx - 1, 34, trunkW + 2, 41);
      ctx.fillRect(tx - 5, 69, trunkW + 10, 6);
      ctx.fillRect(tx - 8, 35, trunkW + 16, 6);

      ctx.fillStyle = '#6b2c0e';
      ctx.fillRect(tx, 35, trunkW, 39);
      ctx.fillRect(tx - 4, 70, trunkW + 8, 4);
      ctx.fillStyle = '#9a4416';
      ctx.fillRect(tx + 2, 36, Math.max(4, trunkW - 5), 37);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(tx + 3, 38, 3, 32);

      if (v === 2) {
        // Wide Twin-Crown Patriarch
        drawFoliageLobe(ctx, 16 + sway, 36, 15, 12, autumnColors);
        drawFoliageLobe(ctx, 48 + sway, 36, 15, 12, autumnColors);
        drawFoliageLobe(ctx, 25 + sway, 24, 17, 13, autumnColors);
        drawFoliageLobe(ctx, 39 + sway, 24, 17, 13, autumnColors);
        drawFoliageLobe(ctx, 32 + sway, 15, 16, 11, autumnColors);
      } else if (v === 1) {
        // Towering Crimson-Gold Spire
        drawFoliageLobe(ctx, 22 + sway, 38, 13, 11, autumnColors);
        drawFoliageLobe(ctx, 42 + sway, 38, 13, 11, autumnColors);
        drawFoliageLobe(ctx, 32 + sway, 27, 17, 14, autumnColors);
        drawFoliageLobe(ctx, 32 + sway, 14, 13, 11, autumnColors);
      } else {
        // Classic Broad Golden-Amber Canopy
        drawFoliageLobe(ctx, 18 + sway, 36, 14, 12, autumnColors);
        drawFoliageLobe(ctx, 46 + sway, 36, 14, 12, autumnColors);
        drawFoliageLobe(ctx, 32 + sway, 28, 19, 14, autumnColors);
        drawFoliageLobe(ctx, 32 + sway, 16, 15, 11, autumnColors);
      }

      // Drifting autumn leaves
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(16 + f * 6, 48 + (f % 3) * 4, 2, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(44 - f * 4, 52 + ((f + 1) % 3) * 3, 2, 2);
    });

    // 3. ANCIENT WORLD TREE (Very Rare — 80x96 canvas) — Colossal Sacred Yggdrasil Monument
    registerNatureVariants(NatureNodeType.ANCIENT_WORLD_TREE, 80, 96, (ctx, f, v) => {
      const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
      const pulse = f % 2 === 0;
      const sacredColors = {
        outline: '#022c22',
        deep: '#065f46',
        mid: '#059669',
        bright: '#10b981',
        spec: pulse ? '#ecfdf5' : '#6ee7b7',
      };

      // Radiant Ground Aura
      ctx.fillStyle = 'rgba(16, 185, 129, 0.36)';
      ctx.fillRect(14, 85, 52, 7);

      // Colossal Golden-Ivory Trunk & Roots (anchored at y=88)
      ctx.fillStyle = '#3b1806';
      ctx.fillRect(29, 38, 22, 50);
      ctx.fillRect(21, 81, 38, 8);
      ctx.fillRect(17, 85, 46, 5);
      ctx.fillRect(19, 38, 42, 8);

      ctx.fillStyle = '#b45309';
      ctx.fillRect(31, 39, 18, 48);
      ctx.fillRect(23, 82, 34, 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(33, 40, 14, 46);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(35, 41, 10, 44);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(38, 44, 4, 38);

      // Glowing Heart-Rune in Center of Trunk
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(37, 58, 6, 10);
      ctx.fillStyle = pulse ? '#ffffff' : '#67e8f9';
      ctx.fillRect(38, 60, 4, 6);

      // Multi-tiered Celestial Canopy
      drawFoliageLobe(ctx, 18 + sway, 42, 16, 13, sacredColors);
      drawFoliageLobe(ctx, 62 + sway, 42, 16, 13, sacredColors);
      drawFoliageLobe(ctx, 28 + sway, 29, 19, 15, sacredColors);
      drawFoliageLobe(ctx, 52 + sway, 29, 19, 15, sacredColors);
      drawFoliageLobe(ctx, 40 + sway, 18 + (v === 1 ? -2 : 0), 22, 15, sacredColors);

      // Hanging Bioluminescent Vines & Spirit Orbs
      ctx.fillStyle = '#34d399';
      for (const vx of [14, 22, 56, 64]) {
        ctx.fillRect(vx + sway, 50, 2, 9 + (vx % 4));
        ctx.fillStyle = '#a7f3d0';
        ctx.fillRect(vx + sway, 58 + (vx % 4), 2, 2);
        ctx.fillStyle = '#34d399';
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 64 - f * 2, 2, 2);
      ctx.fillRect(62, 60 + (f % 3) * 2, 2, 2);
    });

    // 4. PALM TREE (64x80 canvas) — Tall Arching Coastal & Oasis Coconut Palms
    // v0: Curved Classic Coastal Palm
    // v1: Tall Straight Imperial Oasis Palm
    // v2: Leaning Lagoon Palm with wide frond crown
    registerNatureVariants(NatureNodeType.PALM_TREE, 64, 80, (ctx, f, v) => {
      const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(20, 72, 24, 4);

      const segments = v === 1 ? 15 : 13;
      let crownX = 32;
      let crownY = 22;

      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const curve =
          v === 1
            ? Math.sin(t * Math.PI * 0.5) * 2
            : v === 2
            ? -Math.pow(t, 1.4) * 9
            : Math.pow(t, 1.35) * 8;
        const tx = Math.round(30 + curve + (t > 0.6 ? sway : 0));
        const ty = Math.round(71 - i * 3.6);
        const segW = Math.max(5, Math.round(8 - t * 2.5));

        ctx.fillStyle = '#2a1205';
        ctx.fillRect(tx - 1, ty, segW + 2, 5);
        ctx.fillStyle = i % 2 === 0 ? '#78350f' : '#92400e';
        ctx.fillRect(tx, ty + 1, segW, 3);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(tx + 1, ty + 1, Math.max(1, segW - 3), 2);

        crownX = tx + Math.floor(segW / 2);
        crownY = ty;
      }

      // Arching Tropical Palm Fronds
      const cx = crownX + sway;
      const cy = crownY;

      const drawFrond = (dx: number, dy: number, len: number, drop: number) => {
        for (let s = 0; s <= len; s++) {
          const p = s / len;
          const fx = Math.round(cx + dx * s);
          const fy = Math.round(cy + dy * s + p * p * drop);
          ctx.fillStyle = '#052e16';
          ctx.fillRect(fx - 2, fy - 1, 5, 5);
          ctx.fillStyle = p < 0.4 ? '#15803d' : '#22c55e';
          ctx.fillRect(fx - 1, fy, 3, 3);
          if (p > 0.2 && p < 0.85) {
            ctx.fillStyle = '#86efac';
            ctx.fillRect(fx, fy - 1, 2, 1);
          }
        }
      };

      drawFrond(-1.3, -0.35, 15, 7);
      drawFrond(1.3, -0.35, 15, 7);
      drawFrond(-1.1, 0.15, 14, 9);
      drawFrond(1.1, 0.15, 14, 9);
      drawFrond(-0.5, -0.7, 11, 3);
      drawFrond(0.5, -0.7, 11, 3);

      // Hanging Coconuts under crown
      ctx.fillStyle = '#2a1205';
      ctx.fillRect(cx - 6, cy + 2, 5, 5);
      ctx.fillRect(cx + 1, cy + 2, 5, 5);
      ctx.fillRect(cx - 2, cy + 4, 5, 5);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(cx - 5, cy + 3, 3, 3);
      ctx.fillRect(cx + 2, cy + 3, 3, 3);
      ctx.fillRect(cx - 1, cy + 5, 3, 3);
    });

    // 5. CACTUS (48x64 canvas) — 3 distinct desert forms:
    // v0: Towering Saguaro Giant with asymmetric arms
    // v1: Wide Multi-Arm Candelabra Cactus
    // v2: Stout Twin Barrel/Column Cactus Cluster
    registerNatureVariants(NatureNodeType.CACTUS, 48, 64, (ctx, f, v) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(14, 56, 20, 4);

      const drawColumn = (x: number, yTop: number, yBot: number, w: number, hasFlower: boolean) => {
        ctx.fillStyle = '#052e16';
        ctx.fillRect(x - 1, yTop, w + 2, yBot - yTop);
        ctx.fillRect(x, yTop - 1, w, 2);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(x, yTop, w, yBot - yTop - 1);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(x + 1, yTop + 1, Math.max(2, Math.floor(w * 0.5)), yBot - yTop - 3);
        ctx.fillStyle = '#86efac';
        ctx.fillRect(x + 2, yTop + 2, 1, yBot - yTop - 6);

        // Pixel spines
        ctx.fillStyle = '#fef08a';
        for (let sy = yTop + 4; sy < yBot - 4; sy += 7) {
          ctx.fillRect(x - 2, sy, 1, 1);
          ctx.fillRect(x + w + 1, sy + 3, 1, 1);
        }

        if (hasFlower) {
          ctx.fillStyle = '#831843';
          ctx.fillRect(x + 1, yTop - 4, w - 2, 4);
          ctx.fillStyle = f % 2 === 0 ? '#ec4899' : '#f472b6';
          ctx.fillRect(x + 2, yTop - 4, Math.max(2, w - 4), 3);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(x + Math.floor(w / 2) - 1, yTop - 3, 2, 2);
        }
      };

      if (v === 1) {
        // Wide Candelabra Cactus
        drawColumn(20, 12, 58, 8, true);
        // Left wide arm
        ctx.fillStyle = '#052e16';
        ctx.fillRect(9, 28, 12, 6);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(10, 29, 11, 4);
        drawColumn(8, 16, 33, 6, true);
        // Right wide arm
        ctx.fillStyle = '#052e16';
        ctx.fillRect(27, 24, 12, 6);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(27, 25, 11, 4);
        drawColumn(34, 13, 29, 6, false);
      } else if (v === 2) {
        // Twin Stout Cactus Cluster
        drawColumn(14, 22, 58, 9, true);
        drawColumn(25, 28, 58, 8, true);
      } else {
        // Towering Saguaro
        drawColumn(19, 8, 58, 10, true);
        // Left arm
        ctx.fillStyle = '#052e16';
        ctx.fillRect(10, 26, 10, 6);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(11, 27, 9, 4);
        drawColumn(10, 16, 31, 6, false);
        // Right arm
        ctx.fillStyle = '#052e16';
        ctx.fillRect(28, 32, 9, 6);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(28, 33, 8, 4);
        drawColumn(31, 20, 37, 6, true);
      }
    });

    // 6. BERRY BUSH (36x32 canvas) — Waist-high thorny bramble bush (smaller than player!)
    registerNatureVariants(NatureNodeType.BERRY_BUSH, 36, 32, (ctx, f, v) => {
      const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
      const bushColors = {
        outline: '#092212',
        deep: '#14532d',
        mid: '#16a34a',
        bright: '#4ade80',
        spec: '#bbf7d0',
      };

      ctx.fillStyle = 'rgba(10, 18, 12, 0.30)';
      ctx.fillRect(6, 26, 24, 4);

      if (v === 1) {
        // Wide Sprawling Bramble
        drawFoliageLobe(ctx, 12 + sway, 20, 9, 7, bushColors);
        drawFoliageLobe(ctx, 24 + sway, 20, 9, 7, bushColors);
        drawFoliageLobe(ctx, 18 + sway, 17, 10, 8, bushColors);
      } else if (v === 2) {
        // Compact Round Shrub
        drawFoliageLobe(ctx, 18 + sway, 19, 10, 9, bushColors);
      } else {
        // Classic Layered Berry Bush
        drawFoliageLobe(ctx, 14 + sway, 20, 9, 7, bushColors);
        drawFoliageLobe(ctx, 22 + sway, 20, 9, 7, bushColors);
        drawFoliageLobe(ctx, 18 + sway, 16, 9, 7, bushColors);
      }

      const berries =
        v === 2
          ? [
              [13, 18],
              [18, 15],
              [22, 19],
              [16, 22],
            ]
          : [
              [10, 19],
              [16, 15],
              [23, 17],
              [14, 22],
              [21, 22],
            ];
      for (const [bx, by] of berries) {
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(bx + sway - 1, by - 1, 4, 4);
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(bx + sway, by, 2, 2);
        ctx.fillStyle = '#ffe4e6';
        ctx.fillRect(bx + sway, by, 1, 1);
      }
    });

    // 7. BOULDER (48x48 canvas) — 3 distinct rock formations:
    // v0: Wide Mossy Granite Boulder
    // v1: Tall Jagged Monolith Crag
    // v2: Multi-Rock Outcrop Cluster
    registerNatureVariants(NatureNodeType.BOULDER, 48, 48, (ctx, _f, v) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(6, 39, 36, 5);

      const drawRock = (rx: number, ry: number, rw: number, rh: number) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(rx, ry + 3, rw, rh - 3);
        ctx.fillRect(rx + 2, ry + 1, rw - 4, rh - 1);
        ctx.fillRect(rx + 5, ry, rw - 10, rh);

        ctx.fillStyle = '#334155';
        ctx.fillRect(rx + 1, ry + 4, rw - 2, rh - 5);
        ctx.fillRect(rx + 3, ry + 2, rw - 6, rh - 3);

        ctx.fillStyle = '#64748b';
        ctx.fillRect(rx + 2, ry + 3, rw - 5, rh - 7);
        ctx.fillRect(rx + 5, ry + 1, rw - 10, rh - 6);

        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(rx + 4, ry + 2, rw - 9, Math.max(4, Math.floor(rh * 0.42)));

        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(rx + 6, ry + 2, Math.max(4, Math.floor(rw * 0.35)), 2);

        // Chiseled crack
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(rx + Math.floor(rw * 0.55), ry + 6, 1, Math.floor(rh * 0.45));
      };

      if (v === 1) {
        // Tall Jagged Crag
        drawRock(11, 8, 26, 34);
        drawRock(7, 25, 14, 17);
      } else if (v === 2) {
        // Wide Multi-Rock Cluster
        drawRock(6, 18, 24, 24);
        drawRock(23, 21, 19, 21);
      } else {
        // Classic Heavy Granite Boulder
        drawRock(7, 14, 34, 28);
      }

      // Moss patches at base
      ctx.fillStyle = '#15803d';
      ctx.fillRect(10, 39, 7, 3);
      ctx.fillRect(28, 38, 8, 4);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(11, 39, 4, 2);
    });

    // 8. IRON OUTCROP (Rare — 48x48 canvas) — Dark Basalt Crag with Glowing Copper-Gold Iron Veins
    registerNatureVariants(NatureNodeType.IRON_OUTCROP, 48, 48, (ctx, f, v) => {
      const glint = f % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(6, 39, 36, 5);

      const topY = v === 1 ? 7 : 12;
      const rockW = v === 2 ? 38 : 32;
      const rx = 24 - Math.floor(rockW / 2);
      const rh = 42 - topY;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(rx, topY + 3, rockW, rh - 3);
      ctx.fillRect(rx + 3, topY, rockW - 6, rh);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(rx + 1, topY + 4, rockW - 2, rh - 5);
      ctx.fillRect(rx + 4, topY + 1, rockW - 8, rh - 2);

      ctx.fillStyle = '#475569';
      ctx.fillRect(rx + 4, topY + 3, rockW - 9, Math.floor(rh * 0.6));

      // Shimmering metallic ore veins
      const veins = [
        [rx + 6, topY + 7, 8, 6],
        [rx + rockW - 15, topY + 10, 9, 7],
        [rx + 11, topY + 18, 10, 6],
      ];
      for (const [vx, vy, vw, vh] of veins) {
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(vx, vy, vw, vh);
        ctx.fillStyle = glint ? '#f97316' : '#ea580c';
        ctx.fillRect(vx + 1, vy + 1, vw - 2, vh - 2);
        ctx.fillStyle = glint ? '#ffffff' : '#fed7aa';
        ctx.fillRect(vx + 2, vy + 1, Math.max(2, vw - 5), 2);
      }
    });

    // 9. DESERT CRYSTAL (Rare — 48x56 canvas) — Towering Translucent Solar Quartz Spire Cluster
    registerNatureVariants(NatureNodeType.DESERT_CRYSTAL, 48, 56, (ctx, f, v) => {
      const glint = f % 2 === 0;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.34)';
      ctx.fillRect(8, 47, 32, 6);

      const drawSpire = (sx: number, sy: number, sw: number, sh: number) => {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(sx - 1, sy, sw + 2, sh);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(sx, sy + 1, sw, sh - 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(sx + 2, sy + 2, Math.max(2, sw - 4), sh - 6);
        ctx.fillStyle = glint ? '#ffffff' : '#fef9c3';
        ctx.fillRect(sx + 2, sy + 3, Math.max(1, Math.floor(sw * 0.35)), sh - 10);
      };

      drawSpire(10, 22, 9, 28);
      drawSpire(29, 19, 10, 31);
      drawSpire(18, v === 1 ? 6 : 9, 12, v === 1 ? 44 : 41);
      if (v === 2) {
        drawSpire(6, 30, 7, 20);
        drawSpire(36, 28, 7, 22);
      }
    });

    // 10. SUNSTONE OBELISK (Very Rare — 48x72 canvas) — Monumental Levitating Celestial Monolith
    registerNatureVariants(NatureNodeType.SUNSTONE_OBELISK, 48, 72, (ctx, f) => {
      const hover = f === 1 || f === 2 ? -2 : 0;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.38)';
      ctx.fillRect(8, 62, 32, 6);

      // Stepped Ancient Stone Pedestal
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 52, 32, 13);
      ctx.fillRect(11, 48, 26, 6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(9, 53, 30, 11);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(12, 49, 24, 4);
      ctx.fillRect(10, 53, 28, 2);

      // Towering Levitating Azure-Gold Monolith
      const oy = 6 + hover;
      ctx.fillStyle = '#082f49';
      ctx.fillRect(15, oy, 18, 40);
      ctx.fillRect(17, oy - 3, 14, 4);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(16, oy + 1, 16, 38);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(18, oy + 2, 12, 35);
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(20, oy + 3, 8, 32);

      // Glowing Solar Rune Conduit
      ctx.fillStyle = f % 2 === 0 ? '#ffffff' : '#fde047';
      ctx.fillRect(23, oy + 6, 2, 26);
      ctx.fillRect(19, oy + 13, 10, 2);
      ctx.fillRect(20, oy + 23, 8, 2);

      // Orbiting Celestial Rings / Motes
      ctx.fillStyle = '#fde047';
      ctx.fillRect(10, oy + 12 + (f % 3) * 4, 3, 3);
      ctx.fillRect(35, oy + 24 - (f % 3) * 4, 3, 3);
    });

    // 11. PEARL CLAM (Very Rare — 48x40 canvas) — Giant Iridescent Reef Clam
    registerNatureVariants(NatureNodeType.PEARL_CLAM, 48, 40, (ctx, f) => {
      const open = f === 1 || f === 2 ? 2 : 0;
      ctx.fillStyle = 'rgba(8, 47, 73, 0.42)';
      ctx.fillRect(6, 31, 36, 5);

      // Bottom fluted shell
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 20, 36, 13);
      ctx.fillStyle = '#334155';
      ctx.fillRect(8, 21, 32, 11);
      ctx.fillStyle = '#64748b';
      for (let x = 10; x <= 36; x += 5) {
        ctx.fillRect(x, 22, 3, 8);
      }

      // Velvet Mantle & Giant Radiant Pearl
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(10, 15 - open, 28, 8);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(18, 12 - open, 12, 10);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(19, 13 - open, 10, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(21, 14 - open, 5, 4);

      // Top fluted shell
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 7 - open, 36, 9);
      ctx.fillStyle = '#475569';
      ctx.fillRect(8, 8 - open, 32, 7);
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(11, 9 - open, 26, 3);
    });
  }

  private buildStructures(): void {
    const createFrames = (
      w: number,
      h: number,
      drawer: (ctx: CanvasRenderingContext2D, frame: number) => void
    ) => {
      const frames: HTMLCanvasElement[] = [];
      for (let f = 0; f < 4; f++) {
        const c = createPixelCanvas(w, h);
        const ctx = c.getContext('2d')!;
        drawer(ctx, f);
        frames.push(c);
      }
      return frames;
    };

    // WORKBENCH (40x32 — Wide carpenter's workbench with heavy oak legs, vise, saw & blueprint)
    this.structureSprites.set(
      PlaceableType.WORKBENCH,
      createFrames(40, 32, (ctx) => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(3, 25, 34, 5);
        // Outline
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(3, 8, 34, 21);
        // Heavy Legs & Stretcher Bar
        ctx.fillStyle = '#451a03';
        ctx.fillRect(5, 17, 5, 11);
        ctx.fillRect(30, 17, 5, 11);
        ctx.fillRect(10, 21, 20, 3);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(6, 17, 3, 10);
        ctx.fillRect(31, 17, 3, 10);
        // Wide Tabletop Planks
        ctx.fillStyle = '#92400e';
        ctx.fillRect(4, 9, 32, 9);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(5, 9, 30, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(6, 10, 12, 2);
        // Plank joints
        ctx.fillStyle = '#451a03';
        ctx.fillRect(4, 13, 32, 1);
        // Side Iron Vise
        ctx.fillStyle = '#334155';
        ctx.fillRect(1, 11, 4, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(2, 12, 2, 3);
        // Unrolled Parchment Blueprint & Carpenter Saw on tabletop
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(21, 10, 11, 6);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(23, 11, 7, 4);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(8, 11, 9, 3);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(7, 11, 3, 4);
      })
    );

    // CAMPFIRE (28x28 — Compact low stone hearth ring, crossed split logs & dancing 4-frame fire)
    this.structureSprites.set(
      PlaceableType.CAMPFIRE,
      createFrames(28, 28, (ctx, f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(4, 20, 20, 6);
        // Stone ring cobbles
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(4, 17, 20, 8);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(5, 18, 18, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(6, 18, 4, 3);
        ctx.fillRect(12, 20, 4, 3);
        ctx.fillRect(18, 18, 4, 3);
        // Crossed firewood logs & glowing red coals
        ctx.fillStyle = '#451a03';
        ctx.fillRect(6, 15, 16, 4);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, 16, 12, 2);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(9, 17, 10, 3);
        // Multi-layered dancing flame
        const h = f % 2 === 0 ? 11 : 13;
        const shift = f === 1 ? 1 : f === 3 ? -1 : 0;
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(8 + shift, 19 - h, 12, h);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(9 + shift, 20 - h, 10, h - 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(11 + shift, 21 - h, 6, h - 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(13, 15, 2, 4);
      })
    );

    // FURNACE (40x48 — Tall stone blast-smelter with tapered chimney flue & roaring molten forge arch)
    this.structureSprites.set(
      PlaceableType.FURNACE,
      createFrames(40, 48, (ctx, f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(4, 41, 32, 6);
        // Tapered Chimney Stack
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 2, 18, 14);
        ctx.fillStyle = '#334155';
        ctx.fillRect(12, 3, 16, 12);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(10, 2, 20, 4);
        // Warm glow inside top flue
        ctx.fillStyle = f % 2 === 0 ? '#f97316' : '#fbbf24';
        ctx.fillRect(15, 1, 10, 2);
        // Main Arched Stone Masonry Body
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(5, 14, 30, 31);
        ctx.fillStyle = '#475569';
        ctx.fillRect(6, 15, 28, 29);
        // Stone brick courses & iron tie-bands
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(8, 17, 10, 5);
        ctx.fillRect(20, 17, 12, 5);
        ctx.fillRect(7, 24, 7, 5);
        ctx.fillRect(26, 24, 7, 5);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(5, 14, 30, 3);
        ctx.fillRect(5, 31, 30, 2);
        // Molten Forge Archway & Ingot Tray
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 25, 18, 19);
        ctx.fillStyle = f % 2 === 0 ? '#ea580c' : '#f97316';
        ctx.fillRect(13, 27, 14, 15);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(15, 30, 10, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(18, 33, 4, 5);
      })
    );

    // SOLAR ALTAR (48x52 — Grand stepped golden sanctuary dais with twin obelisk pillars & levitating sun-prism)
    this.structureSprites.set(
      PlaceableType.SOLAR_ALTAR,
      createFrames(48, 52, (ctx, f) => {
        const bob = f % 2 === 0 ? 0 : -2;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.36)';
        ctx.fillRect(4, 44, 40, 6);
        // Stepped Golden Temple Pedestal
        ctx.fillStyle = '#451a03';
        ctx.fillRect(4, 34, 40, 14);
        ctx.fillRect(9, 26, 30, 10);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(5, 35, 38, 12);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(10, 27, 28, 8);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(6, 35, 36, 2);
        ctx.fillRect(11, 27, 26, 2);
        // Side Runic Pillars
        ctx.fillStyle = '#78350f';
        ctx.fillRect(7, 16, 6, 19);
        ctx.fillRect(35, 16, 6, 19);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(8, 17, 4, 16);
        ctx.fillRect(36, 17, 4, 16);
        // Azure Astral Altar Drape
        ctx.fillStyle = '#0369a1';
        ctx.fillRect(16, 27, 16, 17);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(18, 28, 12, 14);
        // Levitating Radiant Sun-Prism
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(17, 6 + bob, 14, 14);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(19, 8 + bob, 10, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(22, 10 + bob, 4, 6);
      })
    );

    // WOOD WALL — Fortified timber palisade wall with iron bands
    this.structureSprites.set(
      PlaceableType.WOOD_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(0, 1, 24, 22);
        const logX = [1, 7, 13, 19];
        for (const lx of logX) {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(lx, 2, 4, 20);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(lx + 1, 2, 2, 20);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(lx + 1, 2, 2, 2);
        }
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 7, 24, 2);
        ctx.fillRect(0, 16, 24, 2);
      })
    );

    // STONE WALL — Bevelled medieval castle masonry wall
    this.structureSprites.set(
      PlaceableType.STONE_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 1, 24, 22);
        const bricks = [
          [1, 2, 10, 6],
          [13, 2, 10, 6],
          [1, 9, 6, 6],
          [9, 9, 14, 6],
          [1, 16, 12, 6],
          [15, 16, 8, 6],
        ];
        for (const [bx, by, bw, bh] of bricks) {
          ctx.fillStyle = '#64748b';
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(bx, by, bw - 1, bh - 2);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(bx + 1, cyClamp(by + 1), bw - 3, 1);
        }
        function cyClamp(v: number) {
          return v;
        }
      })
    );

    // WOOD FLOOR
    this.structureSprites.set(
      PlaceableType.WOOD_FLOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(0, 0, 24, 24);
        const rows = [1, 7, 13, 19];
        for (let i = 0; i < rows.length; i++) {
          const ry = rows[i];
          ctx.fillStyle = i % 2 === 0 ? '#92400e' : '#a16207';
          ctx.fillRect(1, ry, 22, 5);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(1, ry, 22, 2);
          const jx = i % 2 === 0 ? 11 : 15;
          ctx.fillStyle = '#451a03';
          ctx.fillRect(jx, ry, 1, 5);
          ctx.fillRect(3, ry + 2, 1, 1);
          ctx.fillRect(20, ry + 2, 1, 1);
        }
      })
    );

    // STONE FLOOR
    this.structureSprites.set(
      PlaceableType.STONE_FLOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 24, 24);
        const cobbles = [
          [1, 1, 10, 7],
          [12, 1, 11, 7],
          [1, 9, 7, 7],
          [9, 9, 8, 7],
          [18, 9, 5, 7],
          [1, 17, 11, 6],
          [13, 17, 10, 6],
        ];
        for (const [cx, cy, cw, ch] of cobbles) {
          ctx.fillStyle = '#64748b';
          ctx.fillRect(cx, cy, cw, ch);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(cx, cy, cw - 1, ch - 1);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(cx + 1, cy + 1, cw - 3, 1);
        }
      })
    );

    // WOOD BRIDGE
    this.structureSprites.set(
      PlaceableType.WOOD_BRIDGE,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(0, 1, 24, 3);
        ctx.fillRect(0, 20, 24, 3);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(0, 2, 24, 1);
        ctx.fillRect(0, 21, 24, 1);
        for (let x = 1; x < 23; x += 4) {
          ctx.fillStyle = '#92400e';
          ctx.fillRect(x, 4, 3, 16);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(x, 4, 2, 16);
        }
      })
    );

    // TORCH (18x28 — Slender standing/mounted wooden torch with iron collar & flickering flame)
    this.structureSprites.set(
      PlaceableType.TORCH,
      createFrames(18, 28, (ctx, f) => {
        const shift = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(5, 23, 8, 3);
        ctx.fillStyle = '#2a1205';
        ctx.fillRect(7, 11, 4, 14);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, 12, 2, 12);
        // Iron pitch cup
        ctx.fillStyle = '#475569';
        ctx.fillRect(6, 10, 6, 3);
        // Flame
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(5, 3 + shift, 8, 8);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(6, 4 + shift, 6, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(8, 6 + shift, 2, 3);
      })
    );

    // SPIKE TRAP
    this.structureSprites.set(
      PlaceableType.SPIKE_TRAP,
      createFrames(24, 24, (ctx, f) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(2, 13, 20, 8);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(3, 14, 18, 6);
        const glint = f % 2 === 0 ? '#ffffff' : '#cbd5e1';
        for (let x = 4; x <= 18; x += 4) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(x - 1, 7, 4, 8);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(x, 7, 2, 7);
          ctx.fillStyle = glint;
          ctx.fillRect(x, 5, 1, 4);
        }
      })
    );

    // EXPLORER TENT (48x44 — Wide ridge-pole expedition pavilion large enough for a person to sleep inside)
    this.structureSprites.set(
      PlaceableType.EXPLORER_TENT,
      createFrames(48, 44, (ctx, f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(3, 36, 42, 6);
        // Guy-ropes & wooden stakes
        ctx.fillStyle = '#78350f';
        ctx.fillRect(2, 34, 3, 5);
        ctx.fillRect(43, 34, 3, 5);
        // Pitched Canvas Pavilion Body
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(5, 12, 38, 27);
        ctx.fillRect(9, 7, 30, 8);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(6, 14, 36, 23);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(10, 8, 28, 26);
        // Decorative Crimson & Gold Expedition Stripes
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(11, 14, 5, 20);
        ctx.fillRect(32, 14, 5, 20);
        // Timber Ridge Pole & Banner Finial
        ctx.fillStyle = '#451a03';
        ctx.fillRect(8, 5, 32, 3);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(14, 4, 20, 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(16, 4, 16, 2);
        // Open Tent Flap Entrance & Hanging Warm Camp Lantern
        ctx.fillStyle = '#27170b';
        ctx.fillRect(18, 17, 12, 21);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(20, 19, 8, 19);
        ctx.fillStyle = f % 2 === 0 ? '#fde047' : '#f59e0b';
        ctx.fillRect(23, 14, 3, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(24, 15, 1, 2);
      })
    );

    // HEALING FOUNTAIN (48x56 — Grand two-tier marble sanctuary fountain with cascading crystal water)
    this.structureSprites.set(
      PlaceableType.HEALING_FOUNTAIN,
      createFrames(48, 56, (ctx, f) => {
        const ripple = f % 2;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.fillRect(4, 47, 40, 6);
        // Wide Octagonal Marble Lower Basin
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(4, 32, 40, 18);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(5, 33, 38, 15);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(6, 33, 36, 4);
        // Luminous Healing Pool Water
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(8, 37, 32, 9);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(10 + ripple, 38, 28, 6);
        // Sculpted Central Pedestal & Upper Bowl
        ctx.fillStyle = '#64748b';
        ctx.fillRect(19, 17, 10, 21);
        ctx.fillRect(12, 20, 24, 6);
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(21, 17, 6, 19);
        ctx.fillRect(13, 20, 22, 3);
        // High Cascading Water Spout & Falling Sheets
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(20, 5 + ripple, 8, 15);
        ctx.fillRect(14, 23, 3, 14);
        ctx.fillRect(31, 23, 3, 14);
        ctx.fillStyle = ripple ? '#ffffff' : '#bae6fd';
        ctx.fillRect(22, 3 + ripple, 4, 16);
        ctx.fillRect(15, 24 + ripple, 2, 11);
        ctx.fillRect(31, 25 - ripple, 2, 11);
      })
    );

    // GUARDIAN TOTEM (36x64 — Towering carved sacred totem pole with outstretched wings & solar eye)
    this.structureSprites.set(
      PlaceableType.GUARDIAN_TOTEM,
      createFrames(36, 64, (ctx, f) => {
        const glow = f % 2;
        ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
        ctx.fillRect(6, 56, 24, 5);
        // Stone Plinth Base
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(7, 48, 22, 11);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(8, 49, 20, 9);
        // Outstretched Totem Wings
        ctx.fillStyle = '#451a03';
        ctx.fillRect(1, 18, 34, 10);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(2, 19, 32, 7);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(3, 19, 30, 3);
        // Tall Carved Timber & Gold Column
        ctx.fillStyle = '#451a03';
        ctx.fillRect(10, 6, 16, 44);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(11, 7, 14, 41);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(12, 8, 12, 38);
        // Glowing Cyan Runic Carvings along shaft
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(14, 28, 8, 14);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(15, 29, 6, 4);
        ctx.fillRect(15, 36, 6, 4);
        // Radiant Solar Crest & Eye at Summit
        ctx.fillStyle = glow ? '#ffffff' : '#fde047';
        ctx.fillRect(9, 4 + glow, 18, 11);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(14, 7 + glow, 8, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16, 8 + glow, 4, 3);
      })
    );

    // CHEST (28x24 — Compact waist-high oak & iron treasure chest)
    this.structureSprites.set(
      PlaceableType.CHEST,
      createFrames(28, 24, (ctx, f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(3, 19, 22, 4);
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(3, 5, 22, 16);
        // Vaulted lid
        ctx.fillStyle = '#92400e';
        ctx.fillRect(4, 6, 20, 6);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(5, 6, 18, 4);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(6, 6, 16, 1);
        // Lower chest box
        ctx.fillStyle = '#78350f';
        ctx.fillRect(4, 13, 20, 7);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(5, 14, 18, 5);
        // Iron straps
        ctx.fillStyle = '#475569';
        ctx.fillRect(6, 6, 3, 14);
        ctx.fillRect(19, 6, 3, 14);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(6, 6, 1, 13);
        ctx.fillRect(19, 6, 1, 13);
        // Seam & Golden Lock
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(4, 12, 20, 1);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(12, 10, 4, 5);
        ctx.fillStyle = f % 2 === 0 ? '#ffffff' : '#fde047';
        ctx.fillRect(13, 11, 2, 3);
      })
    );

    // VILLAGE WELL (48x56 — Tall covered stone village well with timber posts, winch & pitched shingle roof)
    this.structureSprites.set(
      PlaceableType.VILLAGE_WELL,
      createFrames(48, 56, (ctx, f) => {
        const ripple = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(5, 48, 38, 6);
        // Support Timber Posts
        ctx.fillStyle = '#27170b';
        ctx.fillRect(9, 14, 5, 24);
        ctx.fillRect(34, 14, 5, 24);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(10, 14, 3, 23);
        ctx.fillRect(35, 14, 3, 23);
        // Winch Spindle, Rope & Hanging Oak Bucket
        ctx.fillStyle = '#451a03';
        ctx.fillRect(13, 19, 22, 3);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(23, 21, 2, 11 + ripple);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(21, 30 + ripple, 6, 5);
        // Pitched Cedar-Shingle Canopy Roof
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(5, 8, 38, 9);
        ctx.fillRect(9, 4, 30, 5);
        ctx.fillRect(15, 1, 18, 4);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(6, 9, 36, 7);
        ctx.fillRect(10, 5, 28, 5);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(11, 5, 26, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(16, 2, 16, 3);
        // Circular Cobblestone Well Curb
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(7, 33, 34, 18);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(8, 34, 32, 16);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(9, 34, 30, 4);
        // Sparkling Deep Water inside Well
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(11, 38, 26, 7);
        ctx.fillStyle = ripple ? '#e0f2fe' : '#38bdf8';
        ctx.fillRect(14, 39, 20, 4);
      })
    );

    // MARKET STALL (52x48 — Wide striped merchant bazaar booth with timber frame, crates & displayed wares)
    this.structureSprites.set(
      PlaceableType.MARKET_STALL,
      createFrames(52, 48, (ctx, f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.fillRect(3, 40, 46, 6);
        // Timber corner posts
        ctx.fillStyle = '#27170b';
        ctx.fillRect(5, 14, 4, 29);
        ctx.fillRect(43, 14, 4, 29);
        // Wide Wooden Merchant Counter
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(4, 27, 44, 17);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(5, 28, 42, 15);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(6, 28, 40, 6);
        // Striped Crimson & Warm Ivory Awning Roof
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(3, 4, 46, 15);
        for (let col = 0; col < 7; col++) {
          ctx.fillStyle = col % 2 === 0 ? '#dc2626' : '#fef3c7';
          ctx.fillRect(4 + col * 6, 5, 6, 12);
          ctx.fillStyle = col % 2 === 0 ? '#ef4444' : '#ffffff';
          ctx.fillRect(4 + col * 6, 5, 6, 4);
        }
        // Gold scalloped fringe
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(4, 17, 44, 2);
        // Displayed Wares on Counter (Potions, Gold Scales, Fruit Basket)
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(11, 22, 5, 6);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(12, 23, 2, 3);
        ctx.fillStyle = f % 2 === 0 ? '#fde047' : '#f59e0b';
        ctx.fillRect(23, 23, 6, 5);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(35, 22, 6, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(36, 23, 2, 2);
      })
    );

    // VILLAGE HOUSE (64x64 — Grand multi-tile half-timbered medieval cottage with stone chimney, steeply pitched terracotta roof, arched oak door & paned lantern windows)
    this.structureSprites.set(
      PlaceableType.VILLAGE_HOUSE,
      createFrames(64, 64, (ctx, f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.44)';
        ctx.fillRect(3, 55, 58, 7);
        // Stone Masonry Chimney Stack on right roof slope
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(45, 3, 10, 22);
        ctx.fillStyle = '#475569';
        ctx.fillRect(46, 4, 8, 20);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(44, 3, 12, 3);
        // Steeply Pitched Terracotta & Timber Gable Roof
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(3, 18, 58, 12);
        ctx.fillRect(7, 11, 50, 9);
        ctx.fillRect(13, 5, 38, 8);
        ctx.fillStyle = '#9a3412';
        ctx.fillRect(4, 19, 56, 10);
        ctx.fillRect(8, 12, 48, 8);
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(9, 12, 46, 6);
        ctx.fillRect(14, 6, 36, 7);
        ctx.fillStyle = '#fb923c';
        ctx.fillRect(15, 6, 34, 3);
        // Timber Gable Ridge & Finial
        ctx.fillStyle = '#451a03';
        ctx.fillRect(29, 3, 6, 26);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(30, 2, 4, 4);
        // Half-Timbered Cream Plaster Walls & Stone Foundation
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(6, 29, 52, 30);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(8, 30, 48, 24);
        // Cobblestone plinth base
        ctx.fillStyle = '#475569';
        ctx.fillRect(7, 51, 50, 7);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(8, 51, 48, 2);
        // Heavy Oak Timber Framing Beams
        ctx.fillStyle = '#5c2d16';
        ctx.fillRect(7, 29, 4, 28);
        ctx.fillRect(53, 29, 4, 28);
        ctx.fillRect(29, 29, 4, 28);
        ctx.fillRect(7, 29, 50, 3);
        ctx.fillRect(7, 42, 50, 2);
        // Arched Solid Oak Entrance Door (Human-scaled: 12x19 px on 64x64 canvas -> ~15x24 px rendered)
        ctx.fillStyle = '#27170b';
        ctx.fillRect(14, 38, 12, 20);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(15, 39, 10, 18);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(16, 40, 8, 15);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(22, 48, 2, 2);
        // Glowing Warm Hearth Window with Wooden Shutters & Flowerbox
        ctx.fillStyle = '#27170b';
        ctx.fillRect(36, 34, 14, 12);
        ctx.fillStyle = f % 2 === 0 ? '#fde047' : '#fbbf24';
        ctx.fillRect(38, 36, 10, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(39, 37, 3, 3);
        // Window mullions & flowerbox
        ctx.fillStyle = '#451a03';
        ctx.fillRect(42, 36, 2, 8);
        ctx.fillRect(38, 39, 10, 2);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(36, 46, 14, 3);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(38, 45, 2, 2);
        ctx.fillRect(45, 45, 2, 2);
      })
    );

    // ROYAL BANNER (24x48 — Tall heraldic standard pole with waving crimson-gold sun tapestry)
    this.structureSprites.set(
      PlaceableType.ROYAL_BANNER,
      createFrames(24, 48, (ctx, f) => {
        const wave = f % 2 === 0 ? 0 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(6, 42, 12, 4);
        // Tall Gilded Pole & Crossbar
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(10, 2, 4, 43);
        ctx.fillRect(3, 6, 18, 4);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(11, 3, 2, 41);
        ctx.fillRect(4, 7, 16, 2);
        // Long Waving Crimson-Gold Heraldic Tapestry
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(5 + wave, 10, 14, 27);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(6 + wave, 11, 12, 24);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(6 + wave, 33, 4, 4);
        ctx.fillRect(14 + wave, 33, 4, 4);
        // Golden Sun Crest Emblem
        ctx.fillStyle = '#fde047';
        ctx.fillRect(9 + wave, 16, 6, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11 + wave, 18, 2, 4);
      })
    );

    // === NEW ARCHITECTURAL & BUILDING SYSTEM STRUCTURE SPRITES ===
    // WOOD DOOR (Default closed preview sprite)
    this.structureSprites.set(
      PlaceableType.WOOD_DOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(0, 3, 24, 18);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(0, 4, 4, 16);
        ctx.fillRect(20, 4, 4, 16);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(4, 5, 16, 14);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(5, 6, 14, 10);
        ctx.fillStyle = '#334155';
        ctx.fillRect(4, 7, 16, 2);
        ctx.fillRect(4, 15, 16, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(15, 11, 3, 3);
      })
    );

    // IRON GATE (Default closed preview sprite)
    this.structureSprites.set(
      PlaceableType.IRON_GATE,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 2, 24, 20);
        ctx.fillStyle = '#475569';
        ctx.fillRect(0, 3, 5, 18);
        ctx.fillRect(19, 3, 5, 18);
        ctx.fillStyle = '#94a3b8';
        for (let x = 6; x <= 17; x += 3) {
          ctx.fillRect(x, 4, 2, 16);
        }
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(5, 7, 14, 2);
        ctx.fillRect(5, 14, 14, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(11, 10, 2, 3);
      })
    );

    // WOOD FENCE
    this.structureSprites.set(
      PlaceableType.WOOD_FENCE,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(8, 3, 8, 19);
        ctx.fillRect(0, 7, 24, 4);
        ctx.fillRect(0, 14, 24, 4);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(9, 4, 6, 17);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(0, 8, 24, 2);
        ctx.fillRect(0, 15, 24, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(10, 4, 4, 2);
      })
    );

    // WOOD WINDOW
    this.structureSprites.set(
      PlaceableType.WOOD_WINDOW,
      createFrames(24, 24, (ctx, f) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(1, 2, 22, 20);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#2a1205';
        ctx.fillRect(5, 6, 14, 11);
        ctx.fillStyle = f % 2 === 0 ? '#38bdf8' : '#7dd3fc';
        ctx.fillRect(6, 7, 12, 9);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(8, 8, 8, 5);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(11, 7, 2, 9);
        ctx.fillRect(6, 11, 12, 2);
      })
    );

    // STONE WINDOW
    this.structureSprites.set(
      PlaceableType.STONE_WINDOW,
      createFrames(24, 24, (ctx, f) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(1, 2, 22, 20);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(6, 5, 12, 12);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(7, 6, 10, 10);
        ctx.fillStyle = f % 2 === 0 ? '#fde047' : '#f59e0b';
        ctx.fillRect(9, 7, 6, 6);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(11, 6, 2, 10);
        ctx.fillRect(7, 10, 10, 2);
      })
    );

    // BRICK FLOOR
    this.structureSprites.set(
      PlaceableType.BRICK_FLOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(0, 0, 24, 24);
        const bricks = [
          [1, 1, 7, 5],
          [9, 1, 7, 5],
          [17, 1, 6, 5],
          [1, 7, 4, 5],
          [6, 7, 7, 5],
          [14, 7, 9, 5],
          [1, 13, 7, 5],
          [9, 13, 7, 5],
          [17, 13, 6, 5],
          [1, 19, 5, 4],
          [7, 19, 8, 4],
          [16, 19, 7, 4],
        ];
        for (const [bx, by, bw, bh] of bricks) {
          ctx.fillStyle = '#991b1b';
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(bx, by, bw - 1, bh - 1);
          ctx.fillStyle = '#f87171';
          ctx.fillRect(bx + 1, by, bw - 2, 1);
        }
      })
    );

    // BRICK WALL
    this.structureSprites.set(
      PlaceableType.BRICK_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(2, 2, 20, 1);
        const rows = [7, 12, 17];
        for (let r = 0; r < rows.length; r++) {
          const y = rows[r];
          ctx.fillStyle = '#991b1b';
          ctx.fillRect(1, y, 22, 4);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(1, y, 22, 2);
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(r % 2 === 0 ? 11 : 7, y, 1, 4);
          ctx.fillRect(r % 2 === 0 ? 18 : 15, y, 1, 4);
        }
      })
    );

    // ROYAL CARPET
    this.structureSprites.set(
      PlaceableType.ROYAL_CARPET,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(0, 0, 24, 24);
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(1, 1, 22, 22);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(3, 3, 18, 18);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(9, 9, 6, 6);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(10, 10, 4, 4);
      })
    );

    // IRON LANTERN (20x36 — Slender wrought-iron lamp post with radiant solar crystal cage)
    this.structureSprites.set(
      PlaceableType.IRON_LANTERN,
      createFrames(20, 36, (ctx, f) => {
        const glow = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(5, 31, 10, 3);
        // Wrought iron post & lantern cage
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(8, 15, 4, 18);
        ctx.fillRect(4, 4, 12, 12);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(9, 16, 2, 15);
        ctx.fillRect(5, 4, 10, 2);
        // Radiant Solar Crystal Core
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(6, 6, 8, 8);
        ctx.fillStyle = glow ? '#ffffff' : '#fde047';
        ctx.fillRect(7, 7, 6, 6);
      })
    );

    // TILLED SOIL — Furrowed agricultural soil block
    this.structureSprites.set(
      PlaceableType.TILLED_SOIL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#3d2514';
        ctx.fillRect(0, 0, 24, 24);
        ctx.fillStyle = '#27170b';
        ctx.fillRect(0, 3, 24, 3);
        ctx.fillRect(0, 9, 24, 3);
        ctx.fillRect(0, 15, 24, 3);
        ctx.fillRect(0, 21, 24, 3);
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(0, 0, 24, 3);
        ctx.fillRect(0, 6, 24, 3);
        ctx.fillRect(0, 12, 24, 3);
        ctx.fillRect(0, 18, 24, 3);
      })
    );
  }

  private buildPlayerSprites(): void {
    // Warm up default appearance sprite cache
    const dirs: Direction[] = ['down', 'up', 'left', 'right'];
    for (const dir of dirs) {
      for (let f = 0; f < 4; f++) {
        this.getCompositePlayerSprite(
          dir,
          f,
          { head: null, body: null, legs: null, feet: null },
          DEFAULT_PLAYER_APPEARANCE
        );
      }
    }
  }

  private getCompositePlayerSprite(
    dir: Direction,
    frame: number,
    eq: PlayerEquipment,
    app: PlayerAppearance
  ): HTMLCanvasElement {
    const f = frame % 4;
    const key = [
      dir,
      f,
      eq.head || 'none',
      eq.body || 'none',
      eq.legs || 'none',
      eq.feet || 'none',
      app.skinColor,
      app.hairColor,
      app.hairStyle,
      app.eyeColor,
      app.shirtColor,
      app.pantsColor,
    ].join('|');

    const cached = this.playerSprites.get(key);
    if (cached) return cached;

    if (this.playerSprites.size > 400) {
      this.playerSprites.clear();
    }

    const c = createPixelCanvas(20, 20);
    const ctx = c.getContext('2d')!;
    const stepL = f === 1 ? -1 : f === 3 ? 1 : 0;
    const stepR = -stepL;

    // Resolve Torso / Body Garment visual palette
    let torsoMain = app.shirtColor || '#2563eb';
    let torsoTrim = '#e2e8f0';
    let capeColor: string | null = null;
    let hasPauldrons = false;

    if (eq.body === 'leather_tunic') {
      torsoMain = '#a16207';
      torsoTrim = '#fde047';
      capeColor = '#451a03';
      hasPauldrons = true;
    } else if (eq.body === 'iron_armor') {
      torsoMain = '#94a3b8';
      torsoTrim = '#f8fafc';
      capeColor = '#991b1b';
      hasPauldrons = true;
    } else if (eq.body === 'astral_armor') {
      torsoMain = '#0284c7';
      torsoTrim = '#fde047';
      capeColor = '#7e22ce';
      hasPauldrons = true;
    }

    // Resolve Legs visual palette
    let legsMain = app.pantsColor || '#334155';
    let legsKnee: string | null = null;
    let beltColor = '#451a03';
    let buckleColor = '#fbbf24';

    if (eq.legs === 'leather_pants') {
      legsMain = '#854d0e';
      legsKnee = '#ca8a04';
      beltColor = '#451a03';
      buckleColor = '#fde047';
    } else if (eq.legs === 'iron_greaves') {
      legsMain = '#64748b';
      legsKnee = '#e2e8f0';
      beltColor = '#1e293b';
      buckleColor = '#f8fafc';
    } else if (eq.legs === 'astral_leggings') {
      legsMain = '#0369a1';
      legsKnee = '#38bdf8';
      beltColor = '#581c87';
      buckleColor = '#fde047';
    }

    // Resolve Feet / Boots visual palette
    let bootsMain = '#1e293b';
    let bootsTrim = '#475569';
    let bootsWing: string | null = null;

    if (eq.feet === 'leather_boots') {
      bootsMain = '#78350f';
      bootsTrim = '#d97706';
    } else if (eq.feet === 'iron_boots') {
      bootsMain = '#94a3b8';
      bootsTrim = '#f8fafc';
    } else if (eq.feet === 'astral_boots') {
      bootsMain = '#0284c7';
      bootsTrim = '#fde047';
      bootsWing = '#fef08a';
    }

    // 1. Ground Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(5, 17, 10, 2);

    // 2. Back Cape (when wearing body armor)
    if (capeColor && (dir === 'up' || dir === 'left' || dir === 'right')) {
      ctx.fillStyle = capeColor;
      if (dir === 'up') {
        ctx.fillRect(5, 8, 10, 8);
      } else if (dir === 'left') {
        ctx.fillRect(12, 8, 3, 7);
      } else if (dir === 'right') {
        ctx.fillRect(5, 8, 3, 7);
      }
    }

    // 3. Dark Character Silhouette Outline
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(5, 1, 10, 8); // Head outline
    ctx.fillRect(4, 8, 12, 7); // Torso/Arms outline
    ctx.fillRect(5, 14, 4, 4); // Left leg/boot outline
    ctx.fillRect(11, 14, 4, 4); // Right leg/boot outline

    // 4. Skin & Hair Base
    ctx.fillStyle = app.skinColor;
    ctx.fillRect(6, 3, 8, 5);

    ctx.fillStyle = app.hairColor;
    ctx.fillRect(6, 2, 8, 2);
    if (app.hairStyle === 'warrior_crest') {
      ctx.fillRect(8, 0, 4, 2);
    } else if (app.hairStyle === 'long_mane') {
      ctx.fillRect(5, 3, 1, 5);
      ctx.fillRect(14, 3, 1, 5);
    } else if (app.hairStyle === 'braided') {
      ctx.fillRect(5, 3, 2, 2);
      ctx.fillRect(13, 3, 2, 2);
      ctx.fillRect(4, 5, 1, 4);
      ctx.fillRect(15, 5, 1, 4);
    } else {
      // 'adventurer'
      ctx.fillRect(6, 3, 2, 1);
      ctx.fillRect(12, 3, 2, 1);
    }

    // 5. Directional Eyes (or back of hair when facing UP)
    if (dir === 'down') {
      ctx.fillStyle = app.eyeColor || '#0f172a';
      ctx.fillRect(7, 5, 2, 2);
      ctx.fillRect(11, 5, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7, 5, 1, 1);
      ctx.fillRect(11, 5, 1, 1);
    } else if (dir === 'left') {
      ctx.fillStyle = app.eyeColor || '#0f172a';
      ctx.fillRect(6, 5, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 5, 1, 1);
      ctx.fillStyle = app.hairColor;
      ctx.fillRect(11, 3, 3, 4);
    } else if (dir === 'right') {
      ctx.fillStyle = app.eyeColor || '#0f172a';
      ctx.fillRect(12, 5, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(13, 5, 1, 1);
      ctx.fillStyle = app.hairColor;
      ctx.fillRect(6, 3, 3, 4);
    } else {
      // Facing UP -> Full back hair
      ctx.fillStyle = app.hairColor;
      ctx.fillRect(6, 2, 8, 6);
      if (app.hairStyle === 'long_mane') {
        ctx.fillRect(6, 8, 8, 2);
      }
    }

    // 6. Equipped HEAD Slot Overlay (Hood, Iron Helmet, Astral Crown)
    if (eq.head === 'leather_hood') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(5, 1, 10, 3);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(6, 1, 8, 2);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(6, 3, 8, 1);
      if (dir !== 'down') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(5, 3, 2, 4);
        ctx.fillRect(13, 3, 2, 4);
      }
    } else if (eq.head === 'iron_helmet') {
      // Steel helm with nasal guard & ivory Ogre horns
      ctx.fillStyle = '#64748b';
      ctx.fillRect(5, 1, 10, 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, 1, 8, 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(9, 0, 2, 2); // Crimson plume crest
      // Side ivory tusks/horns
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(3, 1, 2, 2);
      ctx.fillRect(15, 1, 2, 2);
      if (dir === 'down') {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(9, 4, 2, 2); // Nasal guard
      } else if (dir === 'up') {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(6, 3, 8, 4);
      }
    } else if (eq.head === 'astral_crown') {
      // Golden Sovereign Diadem with glowing Astral Gem
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(5, 1, 10, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(6, 0, 2, 2);
      ctx.fillRect(9, 0, 2, 2);
      ctx.fillRect(12, 0, 2, 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(9, 1, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(9, 1, 1, 1);
    }

    // 7. Equipped BODY / Torso Slot (Base Shirt or Tunic / Iron Cuirass / Astral Breastplate)
    ctx.fillStyle = torsoMain;
    ctx.fillRect(6, 8, 8, 5);
    ctx.fillStyle = torsoTrim;
    ctx.fillRect(7, 8, 6, 1);
    if (hasPauldrons) {
      ctx.fillStyle = torsoTrim;
      ctx.fillRect(4, 8, 2, 2);
      ctx.fillRect(14, 8, 2, 2);
      ctx.fillRect(9, 9, 2, 4);
    }

    // Swinging Arms & Hands
    ctx.fillStyle = torsoMain;
    ctx.fillRect(4, 9 + stepL, 2, 2);
    ctx.fillRect(14, 9 + stepR, 2, 2);
    ctx.fillStyle = app.skinColor;
    ctx.fillRect(4, 11 + stepL, 2, 2);
    ctx.fillRect(14, 11 + stepR, 2, 2);

    // 8. Equipped LEGS Slot (Belt + Pants / Greaves / Astral Leggings)
    ctx.fillStyle = beltColor;
    ctx.fillRect(6, 13, 8, 1);
    ctx.fillStyle = buckleColor;
    ctx.fillRect(9, 13, 2, 1);

    const leftLegY = 14 + Math.max(0, stepL);
    const rightLegY = 14 + Math.max(0, stepR);

    ctx.fillStyle = legsMain;
    ctx.fillRect(6, 14, 3, 2);
    ctx.fillRect(11, 14, 3, 2);
    if (legsKnee) {
      ctx.fillStyle = legsKnee;
      ctx.fillRect(6, 14, 2, 1);
      ctx.fillRect(11, 14, 2, 1);
    }

    // 9. Equipped FEET Slot (Base Shoes / Leather Trail Boots / Iron Sabatons / Winged Astral Boots)
    ctx.fillStyle = bootsMain;
    ctx.fillRect(6, leftLegY + 1, 3, 2);
    ctx.fillRect(11, rightLegY + 1, 3, 2);
    ctx.fillStyle = bootsTrim;
    ctx.fillRect(6, leftLegY + 1, 2, 1);
    ctx.fillRect(11, rightLegY + 1, 2, 1);

    if (bootsWing) {
      ctx.fillStyle = bootsWing;
      ctx.fillRect(4, leftLegY + 1, 2, 1);
      ctx.fillRect(14, rightLegY + 1, 2, 1);
    }

    this.playerSprites.set(key, c);
    return c;
  }

  private buildCreatureSprites(): void {
    const buildCreature = (
      kind: CreatureKind,
      w: number,
      h: number,
      drawer: (ctx: CanvasRenderingContext2D, frame: number, isAtk: boolean) => void
    ) => {
      for (let f = 0; f < 4; f++) {
        const c = createPixelCanvas(w, h);
        drawer(c.getContext('2d')!, f, false);
        this.creatureSprites.set(`${kind}_${f}`, c);
      }
      const atkC = createPixelCanvas(w, h);
      drawer(atkC.getContext('2d')!, 1, true);
      this.creatureSprites.set(`${kind}_atk`, atkC);
    };

    // SHEEP (26x20 — Horizontal quadruped silhouette: longer than tall, waist-high to player)
    buildCreature(CreatureKind.SHEEP, 26, 20, (ctx, f) => {
      const leg = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(3, 16, 19, 3);
      // Dark outline
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(2, 4, 17, 11);
      ctx.fillRect(17, 4, 7, 8);
      // Four Hooves
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 14 + leg, 3, 4);
      ctx.fillRect(9, 15 - leg, 2, 3);
      ctx.fillRect(13, 14 + leg, 2, 3);
      ctx.fillRect(16, 15 - leg, 3, 4);
      // Fluffy Wool Coat
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(3, 5, 15, 9);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(3, 5, 14, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(5, 5, 10, 4);
      // Head & Ears
      ctx.fillStyle = '#334155';
      ctx.fillRect(18, 5, 5, 6);
      ctx.fillRect(16, 6, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(21, 6, 1, 1);
    });

    // BOAR (28x20 — Low, stocky muscular forest boar with hunched shoulders & curved ivory tusks)
    buildCreature(CreatureKind.BOAR, 28, 20, (ctx, f, isAtk) => {
      const leg = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(3, 16, 21, 3);
      // Outline
      ctx.fillStyle = '#1a0a03';
      ctx.fillRect(2, 4, 20, 11);
      ctx.fillRect(19, 6, 6, 8);
      // Trotters
      ctx.fillRect(5, 14 + leg, 3, 4);
      ctx.fillRect(10, 15 - leg, 2, 3);
      ctx.fillRect(15, 14 + leg, 3, 4);
      // Bristled Hide & Dorsal Ridge
      ctx.fillStyle = '#451a03';
      ctx.fillRect(5, 3, 12, 2);
      ctx.fillStyle = '#5c2d16';
      ctx.fillRect(3, 5, 18, 9);
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(4, 5, 14, 5);
      // Snout & Curved Ivory Tusks
      ctx.fillStyle = '#78350f';
      ctx.fillRect(20, 7, 4, 6);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(22, isAtk ? 9 : 10, 4, 2);
      ctx.fillRect(24, isAtk ? 7 : 8, 2, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(19, 7, 2, 2);
    });

    // CAMEL (36x36 — Tall, long-legged desert dromedary towering slightly above the player's head)
    buildCreature(CreatureKind.CAMEL, 36, 36, (ctx, f) => {
      const leg = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(5, 31, 25, 3);
      // Dark outline
      ctx.fillStyle = '#2a1205';
      ctx.fillRect(6, 12, 20, 12);
      ctx.fillRect(10, 6, 11, 7);
      ctx.fillRect(24, 4, 8, 15);
      // Long Slender Camel Legs
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 23 + leg, 3, 9);
      ctx.fillRect(13, 24 - leg, 2, 8);
      ctx.fillRect(19, 23 + leg, 2, 8);
      ctx.fillRect(22, 24 - leg, 3, 9);
      // Golden Dromedary Coat, Hump & Curved Neck
      ctx.fillStyle = '#d97706';
      ctx.fillRect(7, 13, 18, 10);
      ctx.fillRect(11, 7, 9, 7);
      ctx.fillRect(25, 5, 6, 13);
      ctx.fillRect(28, 5, 4, 5);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(12, 7, 7, 4);
      ctx.fillRect(26, 5, 4, 4);
      // Natural furry hump shading (saddle is drawn dynamically when cr.hasSaddle is true)
      ctx.fillStyle = '#b45309';
      ctx.fillRect(11, 12, 9, 3);
      // Eye
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(29, 6, 1, 2);
    });

    // HORSE (36x32 — Sleek Plains Horse with flowing mane, tail, and muscular stride)
    buildCreature(CreatureKind.HORSE, 36, 32, (ctx, f) => {
      const leg = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(5, 28, 25, 3);
      // Dark outline
      ctx.fillStyle = '#1c1008';
      ctx.fillRect(6, 11, 20, 10);
      ctx.fillRect(22, 4, 9, 12);
      // Flowing dark tail
      ctx.fillStyle = '#27170c';
      ctx.fillRect(2, 12 + leg, 5, 8);
      ctx.fillRect(1, 15 + leg, 3, 6);
      // Agile Legs & Hooves
      ctx.fillStyle = '#5c2d16';
      ctx.fillRect(8, 20 + leg, 3, 9);
      ctx.fillRect(13, 21 - leg, 2, 8);
      ctx.fillRect(20, 20 + leg, 2, 8);
      ctx.fillRect(23, 21 - leg, 3, 9);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, 28 + leg, 3, 2);
      ctx.fillRect(23, 28 - leg, 3, 2);
      // Chestnut Coat, Neck & Head
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(7, 12, 18, 8);
      ctx.fillRect(23, 5, 6, 10);
      ctx.fillRect(26, 6, 5, 5);
      // Coat highlight & white blaze
      ctx.fillStyle = '#a16207';
      ctx.fillRect(8, 12, 15, 4);
      ctx.fillRect(24, 6, 4, 5);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(29, 6, 2, 3);
      // Dark Mane & Ears
      ctx.fillStyle = '#27170c';
      ctx.fillRect(21, 5, 3, 8);
      ctx.fillRect(25, 3, 2, 3);
      // Eye
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(27, 7, 1, 2);
    });

    // BOAT (40x24 — Sturdy Twin-Seat Wooden Rowboat with curved prow, benches, and oars)
    buildCreature(CreatureKind.BOAT, 40, 24, (ctx, f) => {
      const oarShift = f % 2 === 0 ? 0 : 2;
      // Water wake shadow
      ctx.fillStyle = 'rgba(14, 116, 144, 0.45)';
      ctx.fillRect(3, 17, 34, 5);
      // Hull outer dark rim
      ctx.fillStyle = '#2a1205';
      ctx.fillRect(4, 8, 32, 10);
      ctx.fillRect(2, 10, 36, 6);
      // Warm oak hull planks
      ctx.fillStyle = '#92400e';
      ctx.fillRect(5, 9, 30, 8);
      ctx.fillRect(3, 11, 34, 4);
      // Hull gunwale highlight
      ctx.fillStyle = '#d97706';
      ctx.fillRect(5, 9, 30, 2);
      // Interior dark deck & 2 wooden bench seats
      ctx.fillStyle = '#451a03';
      ctx.fillRect(8, 11, 24, 4);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(12, 10, 4, 6); // Rear passenger/pet seat
      ctx.fillRect(23, 10, 4, 6); // Front rower seat
      // Side oars dipping in water
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(19 - oarShift, 4, 2, 5);
      ctx.fillRect(19 + oarShift, 16, 2, 6);
    });

    // ZOMBIE (22x26 — Humanoid undead night walker matching player height)
    buildCreature(CreatureKind.ZOMBIE, 22, 26, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(5, 22, 12, 2);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 2, 10, 8);
      ctx.fillRect(5, 10, 12, 8);
      // Head
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(7, 3, 8, 6);
      ctx.fillStyle = '#84cc16';
      ctx.fillRect(8, 3, 6, 2);
      // Glowing red eyes
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(8, 5, 2, 2);
      ctx.fillRect(12, 5, 2, 2);
      // Tattered tunic
      ctx.fillStyle = '#4c1d95';
      ctx.fillRect(7, 10, 8, 7);
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(8, 10, 6, 4);
      // Outstretched claws
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(2, isAtk ? 8 : 10, 5, 3);
      ctx.fillRect(15, isAtk ? 8 : 10, 5, 3);
      // Legs
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(7, 17 + step, 3, 5);
      ctx.fillRect(12, 18 - step, 3, 5);
    });

    // OGRE (42x46 — Towering Colossal Brute almost 2x the player's bulk & height with horned brow & war club)
    buildCreature(CreatureKind.OGRE, 42, 46, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.44)';
      ctx.fillRect(5, 39, 32, 5);
      // Dark outline
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(7, 11, 26, 22);
      ctx.fillRect(12, 2, 16, 11);
      // Massive Muscular Green-Olive Torso & Broad Shoulders
      ctx.fillStyle = '#365314';
      ctx.fillRect(8, 12, 24, 19);
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(10, 12, 20, 15);
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(12, 13, 16, 8);
      // Crimson War-Paint across chest & brow
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(13, 15, 5, 2);
      ctx.fillRect(22, 15, 5, 2);
      // Head, Curved Bull Horns & Lower Ivory Tusks
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(13, 3, 14, 9);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(9, 1, 4, 5);
      ctx.fillRect(27, 1, 4, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(15, 6, 3, 2);
      ctx.fillRect(22, 6, 3, 2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(14, 10, 3, 3);
      ctx.fillRect(23, 10, 3, 3);
      // Heavy Fur Loincloth & Skull Belt Buckle
      ctx.fillStyle = '#78350f';
      ctx.fillRect(9, 27, 22, 6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(17, 27, 6, 4);
      // Colossal Iron-Studded War Club
      ctx.fillStyle = '#2a1205';
      if (isAtk) {
        ctx.fillRect(28, 15, 13, 9);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(29, 16, 11, 7);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(36, 13, 3, 3);
        ctx.fillRect(36, 23, 3, 3);
      } else {
        ctx.fillRect(31, 3, 9, 24);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(32, 4, 7, 22);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(30, 6, 3, 3);
        ctx.fillRect(38, 11, 3, 3);
        ctx.fillRect(30, 16, 3, 3);
      }
      // Trunk-like Legs
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(11, 32 + step, 6, 8);
      ctx.fillRect(23, 33 - step, 6, 8);
    });

    // FOREST_STALKER (36x24 — Wide, low-slung giant woodland spider with 8 articulated legs)
    buildCreature(CreatureKind.FOREST_STALKER, 36, 24, (ctx, f, isAtk) => {
      const legShift = f % 2 === 0 ? 1 : -1;
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      ctx.fillRect(5, 19, 26, 3);
      // 8 wide-splayed articulated arachnid legs
      ctx.fillStyle = '#0f172a';
      for (let i = 0; i < 4; i++) {
        const ly = 6 + i * 4 + (i % 2 === 0 ? legShift : -legShift);
        ctx.fillRect(1, ly, 10, 2);
        ctx.fillRect(1, ly + 1, 3, 3);
        ctx.fillRect(25, ly, 10, 2);
        ctx.fillRect(32, ly + 1, 3, 3);
      }
      // Bulbous Abdomen & Cephalothorax
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(10, 3, 16, 15);
      ctx.fillStyle = '#312e81';
      ctx.fillRect(11, 4, 14, 12);
      // Venomous Violet/Emerald Hourglass Marking
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(14, 5, 8, 5);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(16, 6, 4, 3);
      // Multi-Eye Cluster & Dripping Chelicerae Fangs
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(13, 13, 3, 2);
      ctx.fillRect(20, 13, 3, 2);
      ctx.fillStyle = isAtk ? '#4ade80' : '#e2e8f0';
      ctx.fillRect(14, isAtk ? 17 : 16, 2, 4);
      ctx.fillRect(20, isAtk ? 17 : 16, 2, 4);
    });

    // DESERT_SCORPION (36x30 — Wide armored golden emperor scorpion with heavy pincers & arched stinger tail)
    buildCreature(CreatureKind.DESERT_SCORPION, 36, 30, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.36)';
      ctx.fillRect(4, 24, 28, 3);
      // Wide Segmented Chitin Carapace
      ctx.fillStyle = '#451a03';
      ctx.fillRect(9, 12, 18, 10);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(10, 13, 16, 8);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(12, 13, 12, 4);
      // Outstretched Heavy Pincers (Claws)
      ctx.fillStyle = '#78350f';
      ctx.fillRect(1, isAtk ? 11 : 14, 8, 6);
      ctx.fillRect(27, isAtk ? 11 : 14, 8, 6);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(2, isAtk ? 11 : 14, 6, 4);
      ctx.fillRect(28, isAtk ? 11 : 14, 6, 4);
      // Arched Segmented Stinger Tail overhead
      const tailY = isAtk ? 4 : 2 + step;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(14, tailY, 8, 10);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(15, tailY + 1, 6, 8);
      // Glowing Venomous Stinger Barb
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(16, tailY - 1, 4, 4);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(17, tailY, 2, 2);
      // Chitin Legs
      ctx.fillStyle = '#451a03';
      ctx.fillRect(7, 21 + step, 3, 5);
      ctx.fillRect(13, 22 - step, 3, 5);
      ctx.fillRect(20, 21 + step, 3, 5);
      ctx.fillRect(26, 22 - step, 3, 5);
    });

    // STONE_GOLEM (44x48 — Colossal ancient runic monolith guardian with massive boulder shoulders & fists)
    buildCreature(CreatureKind.STONE_GOLEM, 44, 48, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.46)';
      ctx.fillRect(4, 41, 36, 5);
      // Dark monolith silhouette
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 5, 32, 30);
      // Craggy Granite Torso & Stepped Shoulder Pauldrons
      ctx.fillStyle = '#475569';
      ctx.fillRect(7, 6, 30, 27);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(9, 7, 26, 21);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(10, 7, 24, 8);
      // Moss patches on ancient shoulders
      ctx.fillStyle = '#15803d';
      ctx.fillRect(8, 6, 6, 3);
      ctx.fillRect(30, 6, 6, 3);
      // Glowing Astral Runic Core & Piercing Golden Eyes
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(16, 16, 12, 11);
      ctx.fillStyle = f % 2 === 0 ? '#e0f2fe' : '#38bdf8';
      ctx.fillRect(18, 18, 8, 7);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(14, 10, 4, 3);
      ctx.fillRect(26, 10, 4, 3);
      // Massive Articulated Stone Pillar Fists
      ctx.fillStyle = '#334155';
      ctx.fillRect(1, isAtk ? 20 : 12 + step, 7, 17);
      ctx.fillRect(36, isAtk ? 20 : 12 - step, 7, 17);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(2, isAtk ? 21 : 13 + step, 5, 9);
      ctx.fillRect(37, isAtk ? 21 : 13 - step, 5, 9);
      // Heavy Monolith Legs
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 34 + step, 9, 8);
      ctx.fillRect(25, 35 - step, 9, 8);
    });

    // BANDIT (22x26 — Humanoid highway raider matching player proportions)
    buildCreature(CreatureKind.BANDIT, 22, 26, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(5, 22, 12, 2);
      // Outline
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 2, 10, 8);
      ctx.fillRect(4, 10, 14, 8);
      // Hood & Bandit Mask
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(7, 3, 8, 6);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(7, 6, 8, 3);
      // Piercing eyes
      ctx.fillStyle = '#fde047';
      ctx.fillRect(8, 5, 2, 1);
      ctx.fillRect(12, 5, 2, 1);
      // Brigandine Vest & Gold Buckle
      ctx.fillStyle = '#334155';
      ctx.fillRect(6, 10, 10, 7);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(7, 10, 8, 4);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(10, 15, 2, 2);
      // Steel Cutlass / Blade
      ctx.fillStyle = '#e2e8f0';
      if (isAtk) {
        ctx.fillRect(16, 8, 6, 3);
      } else {
        ctx.fillRect(16, 6, 3, 8);
      }
      // Boots
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(7, 17 + step, 3, 5);
      ctx.fillRect(12, 18 - step, 3, 5);
    });

    // VILLAGER (22x26 — Friendly medieval townsperson/merchant/smith matching player proportions)
    buildCreature(CreatureKind.VILLAGER, 22, 26, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(5, 22, 12, 2);
      // Dark outline
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, 2, 10, 8);
      ctx.fillRect(4, 10, 14, 8);
      // Hair / Merchant Cap & Warm Face
      ctx.fillStyle = '#065f46';
      ctx.fillRect(6, 3, 10, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(7, 4, 8, 1);
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(7, 5, 8, 4);
      // Expressive eyes
      ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
      ctx.fillRect(8, 6, 2, 2);
      ctx.fillRect(12, 6, 2, 2);
      // Emerald & Gold Merchant/Guild Tunic
      ctx.fillStyle = '#047857';
      ctx.fillRect(6, 10, 10, 7);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(7, 10, 8, 4);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(9, 10, 4, 6);
      // Guard blade when provoked, or warm lantern/ledger
      if (isAtk) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(16, 6, 5, 4);
      } else {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(15, 11, 3, 4);
      }
      // Boots
      ctx.fillStyle = '#451a03';
      ctx.fillRect(7, 17 + step, 3, 5);
      ctx.fillRect(12, 18 - step, 3, 5);
    });

    // WANDERER (22x26 — Nomadic frontier traveler matching player proportions with hat, backpack & staff)
    buildCreature(CreatureKind.WANDERER, 22, 26, (ctx, f, isAtk) => {
      const step = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(5, 22, 12, 2);
      // Dark outline
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(5, 2, 12, 8);
      ctx.fillRect(4, 10, 14, 8);
      // Traveler's Backpack & Bedroll
      ctx.fillStyle = '#78350f';
      ctx.fillRect(2, 9, 4, 7);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(2, 10, 3, 5);
      // Wide-brimmed Explorer Hat
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(4, 2, 14, 3);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(7, 2, 8, 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(6, 4, 10, 1);
      // Warm Face & Eyes
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(7, 5, 8, 4);
      ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
      ctx.fillRect(8, 6, 2, 2);
      ctx.fillRect(12, 6, 2, 2);
      // Indigo & Amber Wayfarer Cloak
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(6, 10, 10, 7);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(7, 10, 8, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(9, 10, 4, 6);
      // Walking Staff with Lantern (or Defensive Blade when attacking)
      if (isAtk) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(16, 7, 5, 3);
      } else {
        ctx.fillStyle = '#92400e';
        ctx.fillRect(16, 4, 2, 16);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(15, 4, 3, 3);
      }
      // Trail Boots
      ctx.fillStyle = '#451a03';
      ctx.fillRect(7, 17 + step, 3, 5);
      ctx.fillRect(12, 18 - step, 3, 5);
    });
  }
}

export const spriteAtlas = new SpriteAtlasManager();


