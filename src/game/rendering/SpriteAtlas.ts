import {
  BiomeType,
  ClothingColorId,
  CreatureKind,
  Direction,
  EyeStyleId,
  HairStyleId,
  NatureNodeType,
  PlaceableType,
  PlayerAppearance,
  PlayerEquipment,
  PlayerState,
  SkinMarkId,
} from '../core/types';
import {
  CLOTHING_COLOR_MAP,
  ClothingColorDefinition,
  ITEMS,
} from '../core/ItemRegistry';

export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  gender: 'masculino',
  skinColor: '#fdba74',
  skinMark: 'none',
  hairColor: '#451a03',
  hairStyle: 'adventurer',
  eyeStyle: 'classic',
  eyeColor: '#0f172a',
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

  public getItemCanvas(
    itemId: string,
    flowerColor?: ClothingColorId
  ): HTMLCanvasElement {
    this.ensureInitialized();
    const def = ITEMS[itemId];

    if (def?.isFlower) {
      const colorId: ClothingColorId =
        flowerColor || def.allowedFlowerColors?.[0] || 'branco';
      const cacheKey = `${itemId}__${colorId}`;
      const existingFlower = this.itemCanvases.get(cacheKey);
      if (existingFlower) return existingFlower;
      const c = this.createFlowerIconCanvas(itemId, colorId);
      this.itemCanvases.set(cacheKey, c);
      return c;
    }

    if (def?.isDye && def.dyeColorId) {
      const existingDye = this.itemCanvases.get(itemId);
      if (existingDye) return existingDye;
      const colorDef =
        CLOTHING_COLOR_MAP[def.dyeColorId] || CLOTHING_COLOR_MAP.branco;
      const c = this.createDyeIconCanvas(colorDef);
      this.itemCanvases.set(itemId, c);
      return c;
    }

    const existing = this.itemCanvases.get(itemId);
    if (existing) return existing;

    if (def?.garmentBaseId) {
      const colorId: ClothingColorId = def.garmentColorId || 'branco';
      const colorDef =
        CLOTHING_COLOR_MAP[colorId] || CLOTHING_COLOR_MAP.branco;
      const c = this.createGarmentIconCanvas(def.garmentBaseId, colorDef);
      this.itemCanvases.set(itemId, c);
      return c;
    }

    return this.itemCanvases.get('wood')!;
  }

  public getItemIconUrl(
    itemId: string,
    flowerColor?: ClothingColorId
  ): string {
    this.ensureInitialized();
    const def = ITEMS[itemId];
    const cacheKey =
      def?.isFlower && flowerColor ? `${itemId}__${flowerColor}` : itemId;
    if (!this.itemDataUrls.has(cacheKey)) {
      const c = this.getItemCanvas(itemId, flowerColor);
      this.itemDataUrls.set(cacheKey, c.toDataURL());
    }
    return this.itemDataUrls.get(cacheKey)!;
  }

  private createFlowerIconCanvas(
    itemId: string,
    colorId: ClothingColorId
  ): HTMLCanvasElement {
    const c = createPixelCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    const colorDef =
      CLOTHING_COLOR_MAP[colorId] || CLOTHING_COLOR_MAP.branco;
    const m = colorDef.hex;
    const d = colorDef.darkHex;
    const l = colorDef.lightHex;
    const o = '#0f172a';
    const g = '#15803d';
    const G = '#22c55e';
    const s = '#052e16';

    if (itemId === 'flower_tulip') {
      // Tulipa: Classic 3-pointed cup blossom with curved leaf & stem
      drawPixelMatrix(
        ctx,
        [
          '................',
          '....oo.oo.oo....',
          '...olmolmolmo...',
          '...olmmmmmmmo...',
          '...odlmmmmmdo...',
          '...odlmmmmmdo...',
          '....oddddddo....',
          '.....oosgoo.....',
          '......osgo.oo...',
          '......osgoGGso..',
          '......osgGGso...',
          '......osggso....',
          '......osgo......',
          '......oooo......',
          '................',
          '................',
        ],
        { o, m, d, l, g, G, s }
      );
    } else if (itemId === 'flower_lily') {
      // Lírio-do-Vale: Arching green stem with delicate hanging bell blossoms
      drawPixelMatrix(
        ctx,
        [
          '................',
          '......ooooo.....',
          '.....oGGggso....',
          '....oGgo..oso...',
          '...oGgo..oolmo..',
          '...ogo...odmmdo.',
          '...ogo....o.o...',
          '..oGgo.oolmo....',
          '..ogo..odmmdo...',
          '..ogo...o.o.....',
          '..oGgo..oo......',
          '...ogooGGso.....',
          '....osGGso......',
          '.....oooo.......',
          '................',
          '................',
        ],
        { o, m, d, l, g, G, s }
      );
    } else if (itemId === 'flower_sunflower') {
      // Girassol: Radiant golden-yellow petals around a rich dark-brown seed disk
      drawPixelMatrix(
        ctx,
        [
          '................',
          '....oo.oo.oo....',
          '..oolyyllyyllo..',
          '.olybbbbbbbbylo.',
          '.oybbddddddbbylo',
          '.olbddddddddbylo',
          '.oybbddddddbbylo',
          '.olybbbbbbbbylo.',
          '..oolyyllyyllo..',
          '....oo.osgo.oo..',
          '....oo.osgoGGso.',
          '...oGGgosgGGso..',
          '....osggsgso....',
          '......osgo......',
          '......oooo......',
          '................',
        ],
        {
          o: '#1c1008',
          y: '#f59e0b',
          l: '#fde047',
          b: '#78350f',
          d: '#451a03',
          g: '#15803d',
          G: '#22c55e',
          s: '#052e16',
        }
      );
    } else {
      // Gota Solar (flower_solar_drop): Luminous golden-amber teardrop blossom with radiant core
      drawPixelMatrix(
        ctx,
        [
          '.......oo.......',
          '......owwo......',
          '.....oywwyo.....',
          '....ooywwyoo....',
          '...ooywwwwyoo...',
          '...oyywwwwyyo...',
          '...ooyyyyyyoo...',
          '....oooooooo....',
          '......osgo......',
          '....ooosgooo....',
          '...oGGgsgGGso...',
          '....osggsgso....',
          '......osgo......',
          '......oooo......',
          '................',
          '................',
        ],
        {
          o: '#78350f',
          w: '#ffffff',
          y: '#fde047',
          g: '#15803d',
          G: '#4ade80',
          s: '#052e16',
        }
      );
    }
    return c;
  }

  private createDyeIconCanvas(
    colorDef: ClothingColorDefinition
  ): HTMLCanvasElement {
    const c = createPixelCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    const m = colorDef.hex;
    const d = colorDef.darkHex;
    const l = colorDef.lightHex;
    // Corked glass pigment flask filled with vibrant dye
    drawPixelMatrix(
      ctx,
      [
        '................',
        '......oooo......',
        '.....occcco.....',
        '.....obbbbo.....',
        '....ooggggoo....',
        '....og....go....',
        '...oogllllgoo...',
        '..ooglmmmmmdgo..',
        '..oglmmmmmmdgo..',
        '..oglmmmmmmdgo..',
        '..ogddddddddgo..',
        '...ooggggggoo...',
        '....oooooooo....',
        '................',
        '................',
        '................',
      ],
      {
        o: '#0f172a',
        c: '#d97706',
        b: '#92400e',
        g: '#cbd5e1',
        m,
        d,
        l,
      }
    );
    return c;
  }

  private createGarmentIconCanvas(
    baseId: string,
    colorDef: ClothingColorDefinition
  ): HTMLCanvasElement {
    const c = createPixelCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    const m = colorDef.hex;
    const d = colorDef.darkHex;
    const l = colorDef.lightHex;
    const o = '#0f172a';

    if (baseId === 'leather_hat') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '.....oooooo.....',
          '....odllllmo....',
          '...odlmmmmmdo...',
          '...odmmmmmmmo...',
          '...odyyyyyydo...',
          '.oooddddddddooo.',
          'odllmmmmmmmmmdo.',
          'odmmmmmmmmmmmddo',
          '.oooooooooooooo.',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fbbf24' }
      );
    } else if (baseId === 'white_tank_top') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '...ooo....ooo...',
          '...olmo..omlo...',
          '...olmmoommlo...',
          '..oodlllllldoo..',
          '..odlmmmmmmmdo..',
          '..odlmmddmmmdo..',
          '..odlmmddmmmdo..',
          '..odlmmmmmmmdo..',
          '..odmmmmmmmmdo..',
          '..oddddddddddo..',
          '...oooooooooo...',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l }
      );
    } else if (baseId === 'sweater') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '....oooooooo....',
          '..oooddddddooo..',
          '.odllmmmmmmlldo.',
          'odlmmmdllmmmlmdo',
          'odmmmdmmmmmmmdmo',
          'odmmmdmddmmmmdmo',
          'odmmmdmddmmmmdmo',
          'odddoommmmmmoodd',
          '.ooo.oddddddo.oo',
          '.....oooooooo...',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l }
      );
    } else if (baseId === 'short_dress') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '....oo....oo....',
          '....olooooMo....',
          '...odlmmmmmdo...',
          '...odmmmmmmmo...',
          '...odyyyyyydo...',
          '..odlmmmmmmmldo.',
          '.odlmmmdmmdmmmdo',
          '.odmmmmdmmdmmmmo',
          '.odddddddddddddo',
          '..ooooooooooooo.',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, M: m, y: d }
      );
    } else if (baseId === 'long_dress') {
      drawPixelMatrix(
        ctx,
        [
          '....oo....oo....',
          '....oloooomo....',
          '...odlmmmmmdo...',
          '...odmmmmmmmo...',
          '...oddddddddo...',
          '..odlmmmmmmmldo.',
          '..odmmmdmmdmmmo.',
          '.odlmmmdmmdmmmdo',
          '.odmmmmdmmdmmmmo',
          'odlmmmmdmmdmmmmd',
          'odmmmmmdmmdmmmmd',
          'oddddddddddddddo',
          '.oooooooooooooo.',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l }
      );
    } else if (baseId === 'shorts') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '..oooooooooooo..',
          '.obbbyyyyybbbo..',
          '.odllmmmmmmmdo..',
          '.odlmmmmmmmmdo..',
          '.odlmmmoommmmo..',
          '.odmmmmoommmmo..',
          '.odddddooddddo..',
          '..ooooo..ooooo..',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, b: '#451a03', y: '#fbbf24' }
      );
    } else if (baseId === 'pants') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '..oooooooooooo..',
          '.obbbyyyyybbbo..',
          '.odllmmmmmmmdo..',
          '.odlmmmmmmmmdo..',
          '.odlmmmoommmmo..',
          '.odlmmmoommmmo..',
          '.odmmmmoommmmo..',
          '.odmmmmoommmmo..',
          '.odmmmmoommmmo..',
          '.odddddooddddo..',
          '..ooooo..ooooo..',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, b: '#451a03', y: '#fbbf24' }
      );
    } else if (baseId === 'overalls') {
      drawPixelMatrix(
        ctx,
        [
          '...ooo....ooo...',
          '...odmo..omdo...',
          '...oymooommyo...',
          '..oodlmmmmmdoo..',
          '..odlmmdddmmmo..',
          '..odlmmmmmmmmo..',
          '..oddddddddddo..',
          '..odlmmmoommmo..',
          '..odmmmmoommmo..',
          '..odmmmmoommmo..',
          '..odddddoodddo..',
          '...ooooo..oooo..',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fbbf24' }
      );
    } else if (baseId === 'sandals') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '................',
          '................',
          '..ooooo..ooooo..',
          '.odmmmd..odmmmd.',
          '.oymmmd..oymmmd.',
          '.oddddo..oddddo.',
          '.odmmmd..odmmmd.',
          '.osssso..osssso.',
          '..ooooo..ooooo..',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fbbf24', s: '#291305' }
      );
    } else if (baseId === 'cowboy_boots') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '..oo.oo..oo.oo..',
          '.odmodm..odmodm.',
          '.odlmmmo.odlmmmo',
          '.odmydmo.odmydmo',
          '.odmmmmo.odmmmmo',
          '.odmmmmo.odmmmmo',
          'oodmmmmddodmmmmd',
          'osssssssoossssss',
          '.ooooooo..oooooo',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fde047', s: '#1c0d04' }
      );
    } else if (baseId === 'blacksmith_bandana') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '....oooooooo....',
          '..oodlllllldoo..',
          '.odmmmmmmmmmmddo',
          '.odmyymmmmmyymdo',
          '.odddddddddddddo',
          '..oooooooooooodo',
          '............odmo',
          '...........odmmo',
          '...........odoo.',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fbbf24' }
      );
    } else if (baseId === 'blacksmith_apron') {
      drawPixelMatrix(
        ctx,
        [
          '....oo....oo....',
          '...oddo..oddo...',
          '..oooooooooooo..',
          '.osllmddddmllso.',
          '.oslmddddddmlso.',
          '..oo.odlyldo.oo.',
          '....odmmmmmdo...',
          '...odlmmmmmldo..',
          '...odmyyyyymdo..',
          '...odlmmmmmldo..',
          '...odmmmmmmmdo..',
          '...odddddddddo..',
          '....ooooooooo...',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fbbf24', s: '#cbd5e1' }
      );
    } else if (baseId === 'blacksmith_boots') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '..ooooo..ooooo..',
          '.odmmmmo.odmmmmo',
          '.odlmmmo.odlmmmo',
          '.odmymmo.odmymmo',
          '.odddddo.odddddo',
          'ooiimmmdooiimmmd',
          'oiiimmmdoiiimmmd',
          'osssssssoossssss',
          '.ooooooo..oooooo',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fbbf24', i: '#cbd5e1', s: '#0f172a' }
      );
    } else if (baseId === 'merchant_cap') {
      drawPixelMatrix(
        ctx,
        [
          '..........ooo...',
          '.........offfo..',
          '....ooooofffo...',
          '..oodlllmmffo...',
          '.odllmmmmmmmmdo.',
          '.odmmmmmmmyymdo.',
          '..odddddddddddo.',
          '...ooooooooooo..',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fde047', f: '#f8fafc' }
      );
    } else if (baseId === 'merchant_doublet') {
      drawPixelMatrix(
        ctx,
        [
          '...oooo..oooo...',
          '..odllmoomlldo..',
          '.odlmmmyymmmldo.',
          '.odmmymmmmymmmdo',
          '.odmmmybbymmmmdo',
          '.odddmmmmmmddddo',
          '..ooodmyymdooo..',
          '....odssssdo....',
          '....odmyymdo....',
          '....oddddddo....',
          '.....oooooo.....',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fde047', b: '#f8fafc', s: '#78350f' }
      );
    } else if (baseId === 'merchant_slacks') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '...oooooooooo...',
          '..odyyyyyyyydo..',
          '..odlmmmmmmldo..',
          '..odlmmddmmldo..',
          '..odlmmoommdo...',
          '..odlmmoommdo...',
          '..odlmmoommdo...',
          '..odmmmoommdo...',
          '..odyyyooyyydo..',
          '..oddddo.odddo..',
          '...oooo...oooo..',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fde047' }
      );
    } else if (baseId === 'elder_mitre') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '......oooo......',
          '....oodyyddo....',
          '..oodlmyyymloo..',
          '.odllmmccmmlldo.',
          '.odmmmmyyymmmmdo',
          '.odddddddddddddo',
          '..ooooooooooooo.',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fde047', c: '#38bdf8' }
      );
    } else if (baseId === 'elder_robe') {
      drawPixelMatrix(
        ctx,
        [
          '...oooo..oooo...',
          '..odllmoomlldo..',
          '.odlmmmyymmmldo.',
          '.odmmmmyymmmmmdo',
          '.odddmmyymmddddo',
          '..ooodmyymdooo..',
          '....odmyymdo....',
          '...odlmyymldo...',
          '..odlmmyymmldo..',
          '..odmmmyymmmmdo.',
          '.odlyyyyyyyyldo.',
          '.oddddddddddddo.',
          '..oooooooooooo..',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, y: '#fde047' }
      );
    } else if (baseId === 'wanderer_hood') {
      drawPixelMatrix(
        ctx,
        [
          '....oooooooo....',
          '..oodlllllldoo..',
          '.odlmmmmmmmmldo.',
          '.odmmmooooommdo.',
          '.odmmo....ommdo.',
          '.odmmddddddmmdo.',
          '..odssssssssdo..',
          '..odssyyyyssdo..',
          '...oooooooooo...',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, s: '#78350f', y: '#fbbf24' }
      );
    } else if (baseId === 'wanderer_poncho') {
      drawPixelMatrix(
        ctx,
        [
          '....oooooooo....',
          '..oodssssssdoo..',
          '.odllmmccmmlldo.',
          '.odlmmmmmmmmldo.',
          'odlmmmmmmmmmmldo',
          'odmmmyyyyyymmmmd',
          '.odmmmmmmmmmmmdo',
          '..odmmyyyymmmdo.',
          '...odddddddddo..',
          '...o.o.oo.o.o...',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, s: '#78350f', c: '#fde047', y: '#fef08a' }
      );
    } else if (baseId === 'wanderer_leggings') {
      drawPixelMatrix(
        ctx,
        [
          '................',
          '................',
          '...oooooooooo...',
          '..odssssssssco..',
          '..odlmmmmmmldo..',
          '..odlmmddmmldo..',
          '..odlmmoommdo...',
          '..odsssoossso...',
          '..odlmmoommdo...',
          '..odsssoossso...',
          '..oddddo.odddo..',
          '...oooo...oooo..',
          '................',
          '................',
          '................',
          '................',
        ],
        { o, m, d, l, s: '#78350f', c: '#fbbf24' }
      );
    }
    return c;
  }

  public getPlayerSprite(
    dir: Direction,
    frame: number,
    playerOrArmor: PlayerState | string | null,
    mountPose: 'none' | 'horse' | 'boat' = 'none'
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
      return this.getCompositePlayerSprite(
        dir,
        f,
        eq,
        DEFAULT_PLAYER_APPEARANCE,
        mountPose
      );
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
    return this.getCompositePlayerSprite(dir, f, eq, app, mountPose);
  }

  public getCreatureSprite(
    kind: CreatureKind,
    frame: number,
    isAttacking: boolean,
    dir: Direction = 'down'
  ): HTMLCanvasElement {
    this.ensureInitialized();
    const perspective =
      dir === 'up'
        ? 'up'
        : dir === 'left' || dir === 'right'
        ? 'side'
        : 'down';
    const suffix = isAttacking ? 'atk' : `${frame % 4}`;
    const dirKey = `${kind}_${perspective}_${suffix}`;
    if (this.creatureSprites.has(dirKey)) {
      return this.creatureSprites.get(dirKey)!;
    }
    const key = `${kind}_${suffix}`;
    return (
      this.creatureSprites.get(key) ||
      this.creatureSprites.get(`${kind}_down_0`) ||
      this.creatureSprites.get(`${kind}_0`)!
    );
  }

  private buildTiles(): void {
    // 32x32 Minimalist, Smooth, Anti-Serrilhado Tiles with 3 progressive sub-zones and 4 subtle variants per biome
    const plainsPalettes = [
      // SubZone 0: Lush Emerald Meadow
      {
        base: '#34783d',
        soft: '#307038',
        accent: '#3e8747',
        tip: '#529e5a',
      },
      // SubZone 1: Sunlit Heartland Plains
      {
        base: '#41853c',
        soft: '#3b7b36',
        accent: '#4d9447',
        tip: '#64ad5b',
      },
      // SubZone 2: Warm Steppe Ecotone
      {
        base: '#618a39',
        soft: '#598033',
        accent: '#6f9943',
        tip: '#86b055',
      },
    ];

    const desertPalettes = [
      // SubZone 0: Savannah Scrub Border
      {
        base: '#cfa95e',
        soft: '#c7a055',
        crest: '#d9b66c',
        grain: '#b89047',
      },
      // SubZone 1: Sculpted Golden Sand
      {
        base: '#dfc072',
        soft: '#d7b667',
        crest: '#e8cc82',
        grain: '#c9a455',
      },
      // SubZone 2: Warm Sandstone Basin
      {
        base: '#d4a459',
        soft: '#cb9a4f',
        crest: '#dfb268',
        grain: '#bd8a42',
      },
    ];

    const oceanPalettes = [
      // SubZone 0: Shallow Turquoise Lagoon
      {
        base: '#1986ab',
        soft: '#167b9e',
        swell: '#2398bf',
        crest: '#7dd3fc',
      },
      // SubZone 1: Coastal Azure Sea
      {
        base: '#156596',
        soft: '#125b88',
        swell: '#1e76ab',
        crest: '#38bdf8',
      },
      // SubZone 2: Deep Abyssal Ocean
      {
        base: '#0e4670',
        soft: '#0b3d63',
        swell: '#145485',
        crest: '#0284c7',
      },
    ];

    const drawOrganicBlob = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      color: string
    ) => {
      ctx.fillStyle = color;
      // Seamless wrapping across 32x32 tile edges so patches flow naturally between cells
      for (let oy = -32; oy <= 32; oy += 32) {
        for (let ox = -32; ox <= 32; ox += 32) {
          const bx = cx + ox;
          const by = cy + oy;
          if (bx + rx < 0 || bx - rx > 32 || by + ry < 0 || by - ry > 32) {
            continue;
          }
          ctx.fillRect(bx - rx + 1, by - ry, (rx - 1) * 2, ry * 2);
          ctx.fillRect(bx - rx, by - ry + 1, rx * 2, (ry - 1) * 2);
        }
      }
    };

    for (let z = 0; z < 3; z++) {
      for (let v = 0; v < 4; v++) {
        for (let f = 0; f < 4; f++) {
          // =================================================================
          // 1. PLAINS ORGANIC 32x32 TILE (Soft, seamless, natural meadow)
          // =================================================================
          const pPal = plainsPalettes[z];
          const pCanvas = createPixelCanvas(32, 32);
          const pCtx = pCanvas.getContext('2d')!;
          pCtx.fillStyle = pPal.base;
          pCtx.fillRect(0, 0, 32, 32);

          // Seamless edge-wrapping organic ground patches so cell X -> cell Y flows organically
          const patchX1 = (v * 9 + z * 5) % 32;
          const patchY1 = (v * 7 + z * 11) % 32;
          drawOrganicBlob(pCtx, patchX1, patchY1, 6, 4, pPal.soft);

          const patchX2 = (patchX1 + 17) % 32;
          const patchY2 = (patchY1 + 15) % 32;
          drawOrganicBlob(pCtx, patchX2, patchY2, 5, 3, pPal.soft);

          const patchX3 = (patchX1 + 9) % 32;
          const patchY3 = (patchY1 + 23) % 32;
          drawOrganicBlob(pCtx, patchX3, patchY3, 4, 3, pPal.accent);

          // Natural grass tuft accents per tile (varies by variant v)
          const tuftCount = v === 0 ? 2 : v === 3 ? 3 : 2;
          const sway = f === 1 ? 1 : 0;
          for (let i = 0; i < tuftCount; i++) {
            const gx = ((v * 9 + i * 13 + z * 5) % 24) + 4;
            const gy = ((v * 11 + i * 15 + z * 3) % 24) + 5;
            pCtx.fillStyle = pPal.accent;
            pCtx.fillRect(gx, gy, 3, 2);
            pCtx.fillRect(gx + 1, gy - 1, 2, 1);
            if (i === 0) {
              pCtx.fillStyle = pPal.tip;
              pCtx.fillRect(gx + 1 + sway, gy - 1, 1, 1);
            }
          }

          this.tileSprites.set(`${BiomeType.PLAINS}_${z}_${v}_${f}`, pCanvas);

          // =================================================================
          // 2. DESERT ORGANIC 32x32 TILE (Wind-swept dunes with seamless curves)
          // =================================================================
          const dPal = desertPalettes[z];
          const dCanvas = createPixelCanvas(32, 32);
          const dCtx = dCanvas.getContext('2d')!;
          dCtx.fillStyle = dPal.base;
          dCtx.fillRect(0, 0, 32, 32);

          // Seamless organic sand swell patches
          drawOrganicBlob(dCtx, patchX1, patchY1, 7, 3, dPal.soft);
          drawOrganicBlob(dCtx, patchX2, patchY2, 5, 2, dPal.crest);

          // Smooth sand ripple curve (varies by variant v)
          const rippleX = (v * 6 + z * 4) % 16 + 3;
          const rippleY = (v * 7 + z * 3) % 18 + 6;
          dCtx.fillStyle = dPal.soft;
          dCtx.fillRect(rippleX, rippleY + 1, 10, 2);
          dCtx.fillStyle = dPal.crest;
          dCtx.fillRect(rippleX + 1, rippleY, 8, 1);

          if (v % 2 === 1) {
            const r2x = (rippleX + 11) % 18 + 4;
            const r2y = (rippleY + 11) % 20 + 5;
            dCtx.fillStyle = dPal.grain;
            dCtx.fillRect(r2x, r2y, 3, 1);
          }

          this.tileSprites.set(`${BiomeType.DESERT}_${z}_${v}_${f}`, dCanvas);

          // =================================================================
          // 3. OCEAN ORGANIC 32x32 TILE (Calm water swells)
          // =================================================================
          const oPal = oceanPalettes[z];
          const oCanvas = createPixelCanvas(32, 32);
          const oCtx = oCanvas.getContext('2d')!;
          oCtx.fillStyle = oPal.base;
          oCtx.fillRect(0, 0, 32, 32);

          const waveShift = f;
          const wx1 = (4 + waveShift + v * 6) % 20 + 2;
          const wy1 = 7 + (v % 2) * 5;
          drawOrganicBlob(oCtx, (wx1 + 10) % 32, (wy1 + 8) % 32, 6, 3, oPal.soft);
          oCtx.fillStyle = oPal.soft;
          oCtx.fillRect(wx1, wy1 + 1, 8, 2);
          oCtx.fillStyle = oPal.swell;
          oCtx.fillRect(wx1 + 1, wy1, 6, 1);

          if (v % 2 === 0) {
            oCtx.fillStyle = oPal.crest;
            oCtx.fillRect(wx1 + 2, wy1, 3, 1);
          }

          const wx2 = (14 - waveShift + v * 5 + 20) % 20 + 4;
          const wy2 = 20 + (v % 2) * 4;
          oCtx.fillStyle = oPal.swell;
          oCtx.fillRect(wx2, wy2, 5, 1);

          this.tileSprites.set(`${BiomeType.OCEAN}_${z}_${v}_${f}`, oCanvas);

          // =================================================================
          // 4. ISLAND ORGANIC 32x32 TILE
          // =================================================================
          this.tileSprites.set(
            `${BiomeType.ISLAND}_${z}_${v}_${f}`,
            z === 1 ? dCanvas : pCanvas
          );

          // =================================================================
          // 5. FOREST (Floresta Comum) ORGANIC 32x32 TILE (Mossy woodland floor)
          // =================================================================
          const forestPalettes = [
            { base: '#3d7a37', soft: '#356d30', accent: '#2c5c27', leaf: '#7c5329' },
            { base: '#43833c', soft: '#3a7534', accent: '#30642b', leaf: '#8a5d2e' },
            { base: '#498b42', soft: '#3f7c39', accent: '#346b2f', leaf: '#6e4923' },
          ];
          const fPal = forestPalettes[z];
          const fCanvas = createPixelCanvas(32, 32);
          const fCtx = fCanvas.getContext('2d')!;
          fCtx.fillStyle = fPal.base;
          fCtx.fillRect(0, 0, 32, 32);
          drawOrganicBlob(fCtx, patchX1, patchY1, 6, 4, fPal.soft);
          drawOrganicBlob(fCtx, patchX2, patchY2, 5, 3, fPal.soft);
          drawOrganicBlob(fCtx, patchX3, patchY3, 4, 3, fPal.accent);
          for (let i = 0; i < 2; i++) {
            const lx = ((v * 9 + i * 13 + z * 5) % 24) + 4;
            const ly = ((v * 11 + i * 15 + z * 3) % 24) + 5;
            fCtx.fillStyle = i === 0 ? fPal.accent : fPal.leaf;
            fCtx.fillRect(lx, ly, 3, 2);
          }
          this.tileSprites.set(`${BiomeType.FOREST}_${z}_${v}_${f}`, fCanvas);

          // =================================================================
          // 6. TEMPERATE_FOREST (Floresta Temperada) 32x32 TILE (Dark deep forest floor)
          // =================================================================
          const tempForestPalettes = [
            { base: '#275332', soft: '#20472a', accent: '#193b21', humus: '#3b2b1d' },
            { base: '#2b5b37', soft: '#244e2e', accent: '#1c4025', humus: '#423020' },
            { base: '#31643d', soft: '#295634', accent: '#20462a', humus: '#493624' },
          ];
          const tfPal = tempForestPalettes[z];
          const tfCanvas = createPixelCanvas(32, 32);
          const tfCtx = tfCanvas.getContext('2d')!;
          tfCtx.fillStyle = tfPal.base;
          tfCtx.fillRect(0, 0, 32, 32);
          drawOrganicBlob(tfCtx, patchX1, patchY1, 6, 4, tfPal.soft);
          drawOrganicBlob(tfCtx, patchX2, patchY2, 5, 3, tfPal.soft);
          drawOrganicBlob(tfCtx, patchX3, patchY3, 4, 3, tfPal.accent);
          for (let i = 0; i < 2; i++) {
            const gx = ((v * 7 + i * 15 + z * 5) % 24) + 4;
            const gy = ((v * 13 + i * 11 + z * 3) % 24) + 5;
            tfCtx.fillStyle = i === 0 ? tfPal.accent : tfPal.humus;
            tfCtx.fillRect(gx, gy, 3, 2);
          }
          this.tileSprites.set(
            `${BiomeType.TEMPERATE_FOREST}_${z}_${v}_${f}`,
            tfCanvas
          );

          // =================================================================
          // 7. TAIGA_FOREST (Floresta de Taiga) 32x32 TILE (Boreal pine-needle & cool moss floor)
          // =================================================================
          const taigaPalettes = [
            { base: '#2d574c', soft: '#264b41', accent: '#1e3e36', needle: '#4e3b29' },
            { base: '#325f53', soft: '#2a5247', accent: '#22443b', needle: '#57422e' },
            { base: '#38685b', soft: '#305a4f', accent: '#264b41', needle: '#614a34' },
          ];
          const tgPal = taigaPalettes[z];
          const tgCanvas = createPixelCanvas(32, 32);
          const tgCtx = tgCanvas.getContext('2d')!;
          tgCtx.fillStyle = tgPal.base;
          tgCtx.fillRect(0, 0, 32, 32);
          drawOrganicBlob(tgCtx, patchX1, patchY1, 6, 4, tgPal.soft);
          drawOrganicBlob(tgCtx, patchX2, patchY2, 5, 3, tgPal.soft);
          drawOrganicBlob(tgCtx, patchX3, patchY3, 4, 3, tgPal.accent);
          for (let i = 0; i < 2; i++) {
            const nx = ((v * 11 + i * 13 + z * 7) % 24) + 4;
            const ny = ((v * 9 + i * 17 + z * 5) % 24) + 5;
            tgCtx.fillStyle = i === 0 ? tgPal.needle : tgPal.accent;
            tgCtx.fillRect(nx, ny, 3, 1);
          }
          this.tileSprites.set(
            `${BiomeType.TAIGA_FOREST}_${z}_${v}_${f}`,
            tgCanvas
          );
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

    // Wood (Madeira de Carvalho)
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

    // Dark Oak Wood (Madeira de Carvalho Escuro)
    registerItem(
      'dark_oak_wood',
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
      { b: '#2b180c', l: '#4a2c16', d: '#8c6239' }
    );

    // Pine Wood (Madeira de Pinheiro)
    registerItem(
      'pine_wood',
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
      { b: '#4a2e1b', l: '#73482b', d: '#e6c896' }
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

    // Sand (Areia)
    registerItem(
      'sand',
      [
        '................',
        '.......ll.......',
        '......lssl......',
        '.....lssssl.....',
        '....lssllssl....',
        '...lssssssssd...',
        '..lssssssssssd..',
        '.ddssssssssssdd.',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { l: '#fef08a', s: '#f59e0b', d: '#b45309' }
    );

    // Glass (Vidro)
    registerItem(
      'glass',
      [
        '................',
        '..bbbbbbbbbbbb..',
        '..bggggggggggb..',
        '..bgwwgggggggb..',
        '..bgwggggwgggb..',
        '..bgggggwggggb..',
        '..bggggwgggggb..',
        '..bgggwggggggb..',
        '..bggggggggwwb..',
        '..bggggggggggb..',
        '..bbbbbbbbbbbb..',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { b: '#0284c7', g: '#7dd3fc', w: '#f0f9ff' }
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

    // Charcoal (Carvão Vegetal — dark carbon chunks with warm glowing ember cracks)
    registerItem(
      'charcoal',
      [
        '................',
        '.....dddddd.....',
        '...ddccccccdd...',
        '..dccccyrrcccd..',
        '.dccssccrcccccd.',
        '.dccsccccccssdd.',
        '..ddccryycccdd..',
        '...dddddddddd...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#09090b', c: '#27272a', s: '#52525b', r: '#ea580c', y: '#facc15' }
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
    // Starter Equipped Clothing: White Tank Top & Brown Shorts
    registerItem(
      'white_tank_top',
      [
        '................',
        '....oo....oo....',
        '...owwo..owwo...',
        '...owwwoowwwo...',
        '...owwwwwwwwo...',
        '...owwswwswwo...',
        '...owwswwswwo...',
        '...owwwwwwwwo...',
        '...owwswwswwo...',
        '...owwswwswwo...',
        '...owwwwwwwwo...',
        '...oooooooooo...',
        '................',
        '................',
        '................',
        '................',
      ],
      { o: '#334155', w: '#f8fafc', s: '#cbd5e1' }
    );
    registerItem(
      'brown_shorts',
      [
        '................',
        '................',
        '................',
        '...oooooooooo...',
        '..obbbbyybbbbo..',
        '..oooooooooooo..',
        '..ommmmmmmmmmo..',
        '..ommmmsmmmmmo..',
        '..ommmmoommmmo..',
        '..ommmmoommmmo..',
        '..ossso..ossso..',
        '..ooooo..ooooo..',
        '................',
        '................',
        '................',
        '................',
      ],
      { o: '#0f172a', b: '#451a03', y: '#fbbf24', m: '#78350f', s: '#92400e' }
    );

    // =========================================================================
    // TIER 1: ROBUST STUDDED LEATHER & WOOL ARMOR SET
    // =========================================================================
    registerItem(
      'leather_hood',
      [
        '....oooooooo....',
        '..ooddddddddoo..',
        '.odmmmmmmmmmmdd.',
        '.odmllllllllmdo.',
        '.odmwwwwwwwwmdo.',
        '.odmwwoooowwmdo.',
        '.odmwwo..owwmdo.',
        '.odmrro..orrmdo.',
        '..odddo..odddo..',
        '..ooooo..ooooo..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#1c1008',
        d: '#451a03',
        m: '#78350f',
        l: '#b45309',
        w: '#fef3c7',
        r: '#fbbf24',
      }
    );
    registerItem(
      'leather_tunic',
      [
        '.ooooo....ooooo.',
        'opppppo..opppppo',
        'oprrrpooooprrrpo',
        'oppppwwwwwwppppo',
        '.oooommmmmmoooo.',
        '..oommsbbsmmoo..',
        '..oommbbbbmmoo..',
        '..oommrbbrmmoo..',
        '..oommmbbmmmoo..',
        '..ooddrbbrddoo..',
        '..oommmmmmmmoo..',
        '...oooooooooo...',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#1c1008',
        p: '#78350f',
        r: '#fbbf24',
        w: '#fef3c7',
        m: '#92400e',
        s: '#b45309',
        b: '#451a03',
        d: '#5c2808',
      }
    );
    registerItem(
      'leather_pants',
      [
        '................',
        '..oooooooooooo..',
        '.obbbbrrrrbbbbo.',
        '.oooooooooooooo.',
        '.oommmmmmmmmmoo.',
        '.oommddoommddoo.',
        '.oommrroommrroo.',
        '.ookkkkookkkkoo.',
        '.ookrrkookrrkoo.',
        '.oommmmoommmmoo.',
        '.ooddddoo.dddoo.',
        '..ooooo..ooooo..',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#1c1008',
        b: '#451a03',
        r: '#fbbf24',
        m: '#854d0e',
        d: '#713f12',
        k: '#a16207',
      }
    );
    registerItem(
      'leather_boots',
      [
        '................',
        '................',
        '..oooooo..oooooo',
        '.owwwwwwoowwwwwwo',
        '.oooooooo.oooooo',
        '.ommrrmo..ommrrm',
        '.ommmmmo..ommmmm',
        '.oddrrdo..oddrrd',
        'oommmmmmooommmmm',
        'osssssssoossssss',
        'oooooooo..oooooo',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#1c1008',
        w: '#fef3c7',
        m: '#78350f',
        d: '#451a03',
        r: '#fbbf24',
        s: '#291305',
      }
    );

    // =========================================================================
    // TIER 2: HEAVY FORGED IRON & OGRE PLATE SET
    // =========================================================================
    registerItem(
      'iron_helmet',
      [
        '.....cccccc.....',
        'oo..cccccccc..oo',
        'ohhoooooooooohho',
        '.ohossssssssoho.',
        '.ooosllllllsooo.',
        '.osssggggggssso.',
        '.osssoooooossso.',
        '.osgdookkoodgso.',
        '.osgdo.oo.odgso.',
        '..oooo.oo.oooo..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#0f172a',
        c: '#dc2626',
        h: '#fef3c7',
        s: '#94a3b8',
        l: '#f8fafc',
        g: '#cbd5e1',
        d: '#475569',
        k: '#1e293b',
      }
    );
    registerItem(
      'iron_armor',
      [
        'oooooo....oooooo',
        'olllllooooillllo',
        'osssggssssggssso',
        'ooddssssssssddoo',
        '.ooosllllllsooo.',
        '..ooslgggglsoo..',
        '..oosssggsssoo..',
        '..oosddggddsoo..',
        '..oosrrrrrrsoo..',
        '..oosddggddsoo..',
        '..ooddddddddoo..',
        '...oooooooooo...',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#0f172a',
        l: '#f8fafc',
        i: '#e2e8f0',
        s: '#94a3b8',
        g: '#cbd5e1',
        d: '#475569',
        r: '#fbbf24',
      }
    );
    registerItem(
      'iron_greaves',
      [
        '................',
        '..oooooooooooo..',
        '.oddddrrrrddddo.',
        '.oooooooooooooo.',
        '.oossllllllssoo.',
        '.oossddoossddoo.',
        '.oossggoossggoo.',
        '.oollllooollllo.',
        '.oolrrloolrrloo.',
        '.oossggoossggoo.',
        '.ooddddoo.dddoo.',
        '..ooooo..ooooo..',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#0f172a',
        d: '#334155',
        r: '#fbbf24',
        s: '#64748b',
        l: '#f8fafc',
        g: '#94a3b8',
      }
    );
    registerItem(
      'iron_boots',
      [
        '................',
        '................',
        '..oooooo..oooooo',
        '.ollllllo.olllll',
        '.osssrsso.osssrs',
        '.osssssso.osssss',
        '.oddddddo.oddddd',
        'oollllllooolllll',
        'osssssssoossssss',
        'odddddddoodddddd',
        'oooooooo..oooooo',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#0f172a',
        l: '#f8fafc',
        s: '#94a3b8',
        r: '#fbbf24',
        d: '#334155',
      }
    );

    // =========================================================================
    // TIER 3: SOVEREIGN ASTRAL CELESTIAL PLATE SET
    // =========================================================================
    registerItem(
      'astral_crown',
      [
        '......oooo......',
        '..oo.oggcgo.oo..',
        '.owwoogccgoowwo.',
        'owwwooggcgoowwwo',
        'owwggggccggggwwo',
        '.oogbggggggbgoo.',
        '.oobbbbbbbbbboo.',
        '.oobcbo..obcboo.',
        '..oooo....oooo..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#082f49',
        g: '#fde047',
        c: '#38bdf8',
        w: '#ffffff',
        b: '#0284c7',
      }
    );
    registerItem(
      'astral_armor',
      [
        'owwwwo....owwwwo',
        'owgggwoooowgggwo',
        'oggbbbbccbbbbggo',
        '.oobbbccccbbboo.',
        '..oobbcwwcbboo..',
        '..ooggccccggoo..',
        '..oobbbggbbboo..',
        '..oobbggggbboo..',
        '..ooggbbbbggoo..',
        '..ooddbggbddoo..',
        '..ooggddddggoo..',
        '...oooooooooo...',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#082f49',
        w: '#fef9c3',
        g: '#fde047',
        b: '#0284c7',
        c: '#38bdf8',
        d: '#0369a1',
      }
    );
    registerItem(
      'astral_leggings',
      [
        '................',
        '..oooooooooooo..',
        '.oggggccccggggo.',
        '.oooooooooooooo.',
        '.oobbccccccbboo.',
        '.oobbddoobbddoo.',
        '.oobbgghhggbboo.',
        '.ooggccooggccoo.',
        '.oogwwgoogwwgoo.',
        '.oobbddoobbddoo.',
        '.ooggddoo.ggdoo.',
        '..ooooo..ooooo..',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#082f49',
        g: '#fde047',
        c: '#38bdf8',
        b: '#0284c7',
        d: '#0369a1',
        h: '#0c4a6e',
        w: '#ffffff',
      }
    );
    registerItem(
      'astral_boots',
      [
        '................',
        '................',
        'owwooooo..owwooo',
        'owwggggo..owwggg',
        '.owgbbbo...owgbb',
        '..obbcco....obbc',
        '..obbbbo....obbb',
        '.oobggggoo.oobgg',
        '.oobbbbbbo.oobbb',
        '.ooggggggo.ooggg',
        '..ooooooo...oooo',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#082f49',
        w: '#ffffff',
        g: '#fde047',
        b: '#0284c7',
        c: '#38bdf8',
      }
    );

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

    // Parede de Carvalho (Warm golden oak planks with iron straps)
    registerItem(
      'wood_wall',
      [
        '.dddddddddddddd.',
        '.dttttttttttttd.',
        '.dddddddddddddd.',
        '.dbllbbllbbllbd.',
        '.dssddddddddssd.',
        '.dbllbbllbbllbd.',
        '.dbllbbllbbllbd.',
        '.dssddddddddssd.',
        '.dbllbbllbbllbd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', t: '#d97706', b: '#78350f', l: '#b45309', s: '#475569' }
    );

    // Parede de Carvalho Escuro (Deep chocolate vertical panels with bronze trim)
    registerItem(
      'dark_oak_wall',
      [
        '.dddddddddddddd.',
        '.dggggggggggggd.',
        '.dddddddddddddd.',
        '.dbmmdbmmdbmmd..',
        '.dbppdbppdbppd..',
        '.dbppdbppdbppd..',
        '.dbmmdbmmdbmmd..',
        '.dggggggggggggd.',
        '.dbmmdbmmdbmmd..',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#140904', g: '#b45309', b: '#2b170b', m: '#3d2312', p: '#5c3a21' }
    );

    // Parede de Pinheiro (Pale Nordic spruce horizontal logs with notched cabin corners)
    registerItem(
      'pine_wall',
      [
        '.dddddddddddddd.',
        '.deeeeeeeeeeeed.',
        '.dddddddddddddd.',
        '.dcllllllllllcd.',
        '.dcmmmmmmmmmmcd.',
        '.dddddddddddddd.',
        '.dcllllllllllcd.',
        '.dcmmmmmmmmmmcd.',
        '.dddddddddddddd.',
        '.dcllllllllllcd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#3d2410', e: '#f3d9a4', l: '#e2be8a', m: '#b88c56', c: '#6b4226' }
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
        '..bllllbbllllb..',
        '..bbbbbbbbbbbb..',
        '..bbllllllbllb..',
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
      ],
      { b: '#78350f', l: '#d97706' }
    );

    registerItem(
      'dark_oak_floor',
      [
        '................',
        '..dddddddddddd..',
        '..dmmmddmmmmmd..',
        '..dpppddpppppd..',
        '..dddddddddddd..',
        '..dmmmmmddmmmd..',
        '..dpppppddpppd..',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1f0e06', m: '#3d2312', p: '#5c3a21' }
    );

    registerItem(
      'pine_floor',
      [
        '................',
        '..cccccccccccc..',
        '..clllllcllllc..',
        '..ceeeeeceeeec..',
        '..cccccccccccc..',
        '..clllcllllllc..',
        '..ceeeceeeeeec..',
        '..cccccccccccc..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { c: '#6b4226', l: '#c49a62', e: '#f3d9a4' }
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
    // Porta de Carvalho Icon (Warm golden oak door with iron hinges)
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

    // Porta de Carvalho Escuro Icon (Deep chocolate manor door with recessed panels & bronze ring)
    registerItem(
      'dark_oak_door',
      [
        '....dddddddd....',
        '...dbbbbbbbbd...',
        '..dbmddddddmbd..',
        '..dbmdppppdmbd..',
        '..dbmdppppdmbd..',
        '..dbbbbbbbbbbd..',
        '..dbmddddddmbd..',
        '..dbmdppggdmbd..',
        '..dbmdppppdmbd..',
        '..dbmddddddmbd..',
        '..dbbbbbbbbbbd..',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#120804', b: '#2b170b', m: '#4a2c16', p: '#6b4226', g: '#f59e0b' }
    );

    // Porta de Pinheiro Icon (Pale amber spruce cabin door with diagonal Z-brace)
    registerItem(
      'pine_door',
      [
        '....dddddddd....',
        '...dmmmmmmmmd...',
        '..dmzzzzzzzzmd..',
        '..dmzllllzllmd..',
        '..dmzllzllllmd..',
        '..dmzzllllllmd..',
        '..dmzzzzzzzzmd..',
        '..dmllllllccmd..',
        '..dmllllllllmd..',
        '..dmzzzzzzzzmd..',
        '..dmmmmmmmmd....',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#3d2410', m: '#8c6239', l: '#e2be8a', z: '#5c3a21', c: '#ea580c' }
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

    // Fence Gate Icon (Porteira de Madeira)
    registerItem(
      'fence_gate',
      [
        '................',
        '.dddd......dddd.',
        '.dbbd......dbbd.',
        '.dbbddggggddbbd.',
        '.dbbllllllllbbd.',
        '.dbbldldldldbbd.',
        '.dbbdldldlddbbd.',
        '.dbbllllllllbbd.',
        '.dbbddddddddbbd.',
        '.dbbd......dbbd.',
        '.dddd......dddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', b: '#78350f', l: '#d97706', g: '#fbbf24' }
    );

    // Parede de Carvalho com Janela Icon
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

    // Parede de Carvalho Escuro com Janela Icon (Dark espresso timber & diamond/cross bronze mullion)
    registerItem(
      'dark_oak_window',
      [
        '.dddddddddddddd.',
        '.dggggggggggggd.',
        '.dbmddddddddmbd.',
        '.dbmdccggccdmbd.',
        '.dbmdcgwwgcdmbd.',
        '.dbmdggggggdmbd.',
        '.dbmdcgwwgcdmbd.',
        '.dbmdccggccdmbd.',
        '.dbmddddddddmbd.',
        '.dbbbbbbbbbbbbd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#140904', b: '#2b170b', m: '#4a2c16', g: '#d97706', c: '#0284c7', w: '#fef08a' }
    );

    // Parede de Pinheiro com Janela Icon (Pale Nordic spruce log wall with alpine shutters)
    registerItem(
      'pine_window',
      [
        '.dddddddddddddd.',
        '.dlllllllllllld.',
        '.dmmsddddddsmmd.',
        '.dmmscceeccsmmd.',
        '.dmmscceeccsmmd.',
        '.dmmsddddddsmmd.',
        '.dmmscceeccsmmd.',
        '.dmmsddddddsmmd.',
        '.dlllllllllllld.',
        '.dmmmmmmmmmmmmd.',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#3d2410', l: '#e2be8a', m: '#b88c56', s: '#5c3a21', c: '#38bdf8', e: '#e0f2fe' }
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

    // Stone Shovel Icon (Pá de Pedra)
    registerItem(
      'stone_shovel',
      [
        '.........ssss...',
        '........sdddds..',
        '.......sddlllds.',
        '.......sdddddds.',
        '........ssddss..',
        '........wbss....',
        '.......wb.......',
        '......wb........',
        '.....wb.........',
        '....wb..........',
        '...wb...........',
        '..wwb...........',
        '.wbb............',
        '................',
        '................',
        '................',
      ],
      { s: '#1e293b', d: '#64748b', l: '#cbd5e1', w: '#451a03', b: '#b45309' }
    );

    // Iron Shovel Icon (Pá de Ferro Forjado)
    registerItem(
      'iron_shovel',
      [
        '.........iiii...',
        '........immmmi..',
        '.......imwwwwmi.',
        '.......immmmmmi.',
        '........iimmii..',
        '........dbii....',
        '.......db.......',
        '......db........',
        '.....db.........',
        '....db..........',
        '...db...........',
        '..ddb...........',
        '.dbb............',
        '................',
        '................',
        '................',
      ],
      { i: '#0f172a', m: '#94a3b8', w: '#f8fafc', d: '#451a03', b: '#d97706' }
    );

    // Dirt Path Icon (Caminho de Solo Batido)
    registerItem(
      'dirt_path',
      [
        '................',
        '..dddddddddddd..',
        '.dmmmmmmmmmmmmd.',
        '.dmmllmmmmppmmd.',
        '.dmmmmmmmmmmmmd.',
        '.dmmpplllmmmmmd.',
        '.dmmmmmmmmmmmmd.',
        '..dddddddddddd..',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#5c4028', m: '#9a714c', l: '#b88c62', p: '#785538' }
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

    // Lula (Ocean-only Squid with mantle, fins, eyes, and tentacles)
    registerItem(
      'squid',
      [
        '......oooo......',
        '....ooppppoo....',
        '...opplllpppo...',
        '..opplmmmmpppo..',
        '...opmmmmmmpo...',
        '....opmmmmpo....',
        '....opwppwpo....',
        '....ooppppoo....',
        '...op.op.po.po..',
        '..op..op.po..po.',
        '..op..op.po..po.',
        '...o..o...o..o..',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        o: '#0f172a',
        p: '#312e81',
        m: '#4f46e5',
        l: '#818cf8',
        w: '#fef08a',
      }
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

    // Carne de Cordeiro Crua (raw_lamb) — Lamb chop with bone & marbling
    registerItem(
      'raw_lamb',
      [
        '................',
        '.........dddd...',
        '........dwwwwd..',
        '.......dwwdddd..',
        '....ddddwwd.....',
        '..ddrrrrrrdd....',
        '.drrpppppprrd...',
        '.drppwwpppprd...',
        '.drrpppppprrd...',
        '..ddrrrrrrdd....',
        '....dddddd......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#450a0a', w: '#f8fafc', r: '#dc2626', p: '#fda4af' }
    );

    // Carne de Cordeiro Assada (cooked_lamb) — Roasted golden-brown lamb chop
    registerItem(
      'cooked_lamb',
      [
        '....ss..ss......',
        '.....ss..ss.....',
        '........dwwwwd..',
        '.......dwwdddd..',
        '....ddddwwd.....',
        '..ddbbbbbbdd....',
        '.dbbllllllbbd...',
        '.dbllyyylllbd...',
        '.dbbllllllbbd...',
        '..ddbbbbbbdd....',
        '....dddddd......',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', w: '#f1f5f9', b: '#78350f', l: '#b45309', y: '#fbbf24', s: '#cbd5e1' }
    );

    // Carne Suína Crua (raw_pork) — Raw pork loin cut with fat cap
    registerItem(
      'raw_pork',
      [
        '................',
        '....dddddddd....',
        '..ddwwwwwwwwdd..',
        '.dwwrrrrrrrrwwd.',
        '.dwrpppppppprwd.',
        '.dwrppwwwwpprwd.',
        '.dwrpppppppprwd.',
        '..ddrrrrrrrrdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#450a0a', w: '#fef2f2', r: '#e11d48', p: '#fb7185' }
    );

    // Carne Suína Assada (cooked_pork) — Seared golden pork roast with grill marks
    registerItem(
      'cooked_pork',
      [
        '....ss....ss....',
        '.....ss..ss.....',
        '....dddddddd....',
        '..ddyyyyyyyydd..',
        '.dyylllllllllyd.',
        '.dylbbllllbblyd.',
        '.dyllllbbllllyd.',
        '..ddbbbbbbbbdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#2a1205', y: '#f59e0b', l: '#b45309', b: '#78350f', s: '#e2e8f0' }
    );

    // Carne Bovina Crua (raw_beef) — Thick T-bone / sirloin red beef cut with white marbling
    registerItem(
      'raw_beef',
      [
        '................',
        '....dddddddd....',
        '..ddrrrrrrrrdd..',
        '.drrRwwwwwwRrrd.',
        '.drrRwwRRwwRrrd.',
        '.drrRRRRRRRRrrd.',
        '.drrRRwwwwRRrrd.',
        '..ddrrrrrrrrdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#3b0707', r: '#991b1b', R: '#dc2626', w: '#fecdd3' }
    );

    // Carne Bovina Assada (cooked_beef) — Char-grilled juicy steak with sear marks
    registerItem(
      'cooked_beef',
      [
        '....ss....ss....',
        '.....ss..ss.....',
        '....dddddddd....',
        '..ddbbbbbbbbdd..',
        '.dbbmddmmddmbbd.',
        '.dbbmmddddmmbbd.',
        '.dbbmddmmddmbbd.',
        '..ddbbbbbbbbdd..',
        '....dddddddd....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#1c0a04', b: '#5c2d16', m: '#9a3412', s: '#e2e8f0' }
    );

    // Muda de Carvalho (oak_sapling) — Young oak sprout with bright green leaves & root ball
    registerItem(
      'oak_sapling',
      [
        '......dddd......',
        '....ddggggdd....',
        '...dggllllggd...',
        '...dggllllggd...',
        '....ddggggdd....',
        '......dbbd......',
        '......dbbd......',
        '.....ddbbdd.....',
        '....dssssssd....',
        '.....dddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#052e16', g: '#16a34a', l: '#4ade80', b: '#78350f', s: '#5c3a1e' }
    );

    // Muda de Carvalho Escuro (dark_oak_sapling) — Deep emerald temperate sprout with thick dark stem
    registerItem(
      'dark_oak_sapling',
      [
        '.....dddddd.....',
        '...ddggggggdd...',
        '..dggllllllggd..',
        '..dggggggggggd..',
        '...ddggggggdd...',
        '.....ddbbdd.....',
        '.....ddbbdd.....',
        '....ddbbbbdd....',
        '....dssssssd....',
        '.....dddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#022c22', g: '#065f46', l: '#10b981', b: '#3b1d0a', s: '#4a2c16' }
    );

    // Muda de Pinheiro (pine_sapling) — Conical boreal spruce sprout with tiered teal-green needles
    registerItem(
      'pine_sapling',
      [
        '.......dd.......',
        '......dggd......',
        '.....dgllgd.....',
        '....ddggggdd....',
        '....dgllllgd....',
        '...ddggggggdd...',
        '......dbbd......',
        '......dbbd......',
        '....ddssssdd....',
        '.....dddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#042f2e', g: '#0f766e', l: '#2dd4bf', b: '#5c3a21', s: '#431407' }
    );

    // Muda de Palmeira (palm_sapling) — Tropical palm sprout with arching fronds & coconut seed base
    registerItem(
      'palm_sapling',
      [
        '....ddd..ddd....',
        '..ddggddddggdd..',
        '.dgllggggggllgd.',
        '..dd..dbbd..dd..',
        '......dbbd......',
        '......dbbd......',
        '.....dccccd.....',
        '....dccccccd....',
        '.....dddddd.....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      { d: '#052e16', g: '#15803d', l: '#84cc16', b: '#b45309', c: '#78350f' }
    );

    // Cama de Madeira (bed) — Cozy oak bed with carved headboard, white wool pillow & crimson/gold blanket
    registerItem(
      'bed',
      [
        '................',
        '..ddd...........',
        '..dbdddddddd..dd',
        '..dblwwwwwwdddd.',
        '..dbwwwwwwwwrrd.',
        '..dbddddddrrrrd.',
        '..dbbyyyyrrrrrd.',
        '..dbbyyyyRRRRrd.',
        '..dbbyyyyrrrrrd.',
        '..dbddddddddddbd',
        '..dbb........dbb',
        '..ddd........ddd',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        d: '#2a1205',
        b: '#78350f',
        l: '#b45309',
        w: '#f8fafc',
        r: '#dc2626',
        R: '#ef4444',
        y: '#fde047',
      }
    );

    // Couro (leather) — Supple tanned boar hide pelt with stitched edges
    registerItem(
      'leather',
      [
        '................',
        '...ddd....ddd...',
        '..dbbbddddbbbd..',
        '.dbllllllllllbd.',
        '.dblmmmmmmmmlbd.',
        '..dbmmmmmmmmbd..',
        '..dbmmmmmmmmbd..',
        '.dblmmmmmmmmlbd.',
        '.dbllllllllllbd.',
        '..dbbbddddbbbd..',
        '...ddd....ddd...',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        d: '#2a1205',
        b: '#78350f',
        m: '#9a5b25',
        l: '#c27d38',
      }
    );

    // Mesa de Tecelagem (weaving_table) — Tailor & loom station with iron frame, fabric roll & spools
    registerItem(
      'weaving_table',
      [
        '................',
        '..dddddddddddd..',
        '.dwwwwrrrrbbbbd.',
        '.dwwwwrrrrbbbbd.',
        '.dddddddddddddd.',
        '.dmmmmmmmmmmmmd.',
        '.dlllllllllllld.',
        '.dddddddddddddd.',
        '..diiid..diiid..',
        '..diiid..diiid..',
        '..diiid..diiid..',
        '..ddddd..ddddd..',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        d: '#1e293b',
        w: '#f8fafc',
        r: '#ef4444',
        b: '#38bdf8',
        m: '#92400e',
        l: '#d97706',
        i: '#94a3b8',
      }
    );

    // Chapéu de Fibras (fiber_hat) — Woven golden straw sun hat with braided cord band
    registerItem(
      'fiber_hat',
      [
        '................',
        '.....dddddd.....',
        '....dyyyyyyd....',
        '...dyllllllyd...',
        '...dyyyyyyyyd...',
        '...dbbbbbbbbd...',
        '.dddddddddddddd.',
        'dyyllllllllllyyd',
        'dyyyyyyyyyyyyyyd',
        '.dddddddddddddd.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        d: '#451a03',
        y: '#eab308',
        l: '#fef08a',
        b: '#92400e',
      }
    );

    // Colar Solar (solar_necklace) — Braided fiber collar with radiant solar crystal pendants
    registerItem(
      'solar_necklace',
      [
        '................',
        '....ddd..ddd....',
        '...dfffddfffd...',
        '..dff......ffd..',
        '..df........fd..',
        '..df........fd..',
        '...df..dd..fd...',
        '...dfooyyoofd...',
        '....doywwyod....',
        '....doywwyod....',
        '.....doooood....',
        '......ddddd.....',
        '................',
        '................',
        '................',
        '................',
      ],
      {
        d: '#451a03',
        f: '#ca8a04',
        o: '#ea580c',
        y: '#fde047',
        w: '#ffffff',
      }
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

    // 6B. SAND DUNE (36x28 canvas) — Subtle, low-profile wind-sculpted sand mound almost camouflaged into the sand floor
    registerNatureVariants(NatureNodeType.SAND_DUNE, 36, 28, (ctx, _f, v) => {
      // Soft translucent base blending seamlessly into the underlying sand tile
      ctx.fillStyle = 'rgba(180, 83, 9, 0.16)';
      if (v === 1) {
        ctx.fillRect(4, 18, 28, 6);
        ctx.fillRect(7, 15, 22, 4);
      } else if (v === 2) {
        ctx.fillRect(5, 17, 26, 6);
        ctx.fillRect(9, 14, 18, 4);
      } else {
        ctx.fillRect(4, 17, 28, 6);
        ctx.fillRect(8, 14, 20, 4);
      }

      // Warm golden sand slope (subtle mid-tone)
      ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
      if (v === 1) {
        ctx.fillRect(6, 16, 24, 5);
        ctx.fillRect(10, 13, 16, 3);
      } else if (v === 2) {
        ctx.fillRect(7, 15, 22, 5);
        ctx.fillRect(11, 12, 14, 3);
      } else {
        ctx.fillRect(6, 15, 24, 5);
        ctx.fillRect(10, 12, 16, 3);
      }

      // Wind-swept sunlit crest line (almost camouflaged highlight)
      ctx.fillStyle = 'rgba(253, 224, 71, 0.32)';
      if (v === 1) {
        ctx.fillRect(8, 14, 18, 2);
        ctx.fillRect(12, 12, 11, 2);
        ctx.fillRect(9, 18, 14, 1);
      } else if (v === 2) {
        ctx.fillRect(9, 13, 16, 2);
        ctx.fillRect(12, 11, 10, 2);
        ctx.fillRect(11, 17, 12, 1);
      } else {
        ctx.fillRect(8, 13, 18, 2);
        ctx.fillRect(11, 11, 12, 2);
        ctx.fillRect(10, 17, 15, 1);
      }

      // Delicate silica grain glints
      ctx.fillStyle = 'rgba(254, 249, 195, 0.38)';
      ctx.fillRect(13, 12, 2, 1);
      ctx.fillRect(20, 15, 2, 1);
      ctx.fillRect(10, 16, 1, 1);
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

    // 12. TEMPERATE_TREE (72x96 canvas — Large, tall, dark-colored Temperate Forest tree)
    registerNatureVariants(
      NatureNodeType.TEMPERATE_TREE,
      72,
      96,
      (ctx, f, v) => {
        const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
        const darkForestColors = {
          outline: '#05140b',
          deep: '#0b2e19',
          mid: '#114627',
          bright: '#186036',
          spec: '#27824c',
        };

        // Ground shadow
        ctx.fillStyle = 'rgba(5, 12, 8, 0.42)';
        ctx.fillRect(16, 87, 40, 6);

        // Tall, thick dark-bark trunk (anchored at y=90)
        const trunkW = v === 2 ? 14 : 12;
        const trunkTop = 36;
        const tx = 36 - Math.floor(trunkW / 2);

        ctx.fillStyle = '#140b06';
        ctx.fillRect(tx - 1, trunkTop, trunkW + 2, 91 - trunkTop);
        ctx.fillRect(tx - 5, 85, trunkW + 10, 6);
        ctx.fillRect(tx - 7, 88, trunkW + 14, 3);

        ctx.fillStyle = '#3b2313';
        ctx.fillRect(tx, trunkTop, trunkW, 90 - trunkTop);
        ctx.fillRect(tx - 3, 86, trunkW + 6, 4);

        ctx.fillStyle = '#52321b';
        ctx.fillRect(tx + 2, trunkTop + 2, Math.max(3, trunkW - 5), 88 - trunkTop);
        ctx.fillStyle = '#29170b';
        ctx.fillRect(tx + trunkW - 3, trunkTop + 8, 2, 32);

        // Massive, tall, dark-foliage tiered crown
        drawFoliageLobe(ctx, 20 + sway, 46, 15, 13, darkForestColors);
        drawFoliageLobe(ctx, 52 + sway, 46, 15, 13, darkForestColors);
        drawFoliageLobe(ctx, 36 + sway, 48, 21, 15, darkForestColors);
        drawFoliageLobe(ctx, 23 + sway, 32, 16, 14, darkForestColors);
        drawFoliageLobe(ctx, 49 + sway, 32, 16, 14, darkForestColors);
        drawFoliageLobe(ctx, 36 + sway, 28, 19, 16, darkForestColors);
        drawFoliageLobe(ctx, 36 + sway, 15, 14, 12, darkForestColors);
      }
    );

    // 13. PINE_TREE (64x92 canvas — Taiga Conifer: v=0,2 Tall Pine; v=1 Small Pine)
    registerNatureVariants(NatureNodeType.PINE_TREE, 64, 92, (ctx, f, v) => {
      const sway = f === 1 ? 1 : f === 3 ? -1 : 0;
      const isSmall = v === 1;

      // Ground shadow
      ctx.fillStyle = 'rgba(6, 14, 12, 0.38)';
      if (isSmall) {
        ctx.fillRect(20, 84, 24, 5);
      } else {
        ctx.fillRect(15, 84, 34, 6);
      }

      // Conifer Trunk
      const trunkW = isSmall ? 6 : 8;
      const trunkTop = isSmall ? 54 : 28;
      const tx = 32 - Math.floor(trunkW / 2);
      ctx.fillStyle = '#170d07';
      ctx.fillRect(tx - 1, trunkTop, trunkW + 2, 88 - trunkTop);
      ctx.fillRect(tx - 3, 84, trunkW + 6, 4);
      ctx.fillStyle = '#472916';
      ctx.fillRect(tx, trunkTop, trunkW, 87 - trunkTop);
      ctx.fillStyle = '#633a20';
      ctx.fillRect(tx + 1, trunkTop + 2, 2, 84 - trunkTop);

      // Helper for conical pine tier
      const drawPineTier = (
        cy: number,
        halfW: number,
        tierH: number,
        shiftX: number
      ) => {
        const cx = 32 + shiftX;
        // Outer dark boreal needle silhouette
        ctx.fillStyle = '#071c18';
        for (let row = 0; row < tierH; row++) {
          const t = row / Math.max(1, tierH - 1);
          const rw = Math.max(2, Math.round(2 + t * (halfW * 2)));
          ctx.fillRect(cx - Math.floor(rw / 2), cy + row, rw, 1);
        }
        // Deep spruce body
        ctx.fillStyle = '#0f3930';
        for (let row = 1; row < tierH - 1; row++) {
          const t = row / Math.max(1, tierH - 1);
          const rw = Math.max(2, Math.round(1 + t * (halfW * 2 - 2)));
          ctx.fillRect(cx - Math.floor(rw / 2), cy + row, rw, 1);
        }
        // Mid boreal pine needle tone
        ctx.fillStyle = '#185447';
        for (let row = 1; row < tierH - 2; row++) {
          const t = row / Math.max(1, tierH - 1);
          const rw = Math.max(2, Math.round(1 + t * (halfW * 2 - 5)));
          ctx.fillRect(cx - Math.floor(rw / 2), cy + row, rw, 1);
        }
        // Sunlit upper needle ridges
        ctx.fillStyle = '#257362';
        for (let row = 2; row < Math.max(3, Math.floor(tierH * 0.65)); row++) {
          const t = row / Math.max(1, tierH - 1);
          const rw = Math.max(1, Math.round(t * (halfW * 1.3)));
          ctx.fillRect(cx - Math.floor(rw / 2), cy + row, rw, 1);
        }
      };

      if (isSmall) {
        // Pinheiro Pequeno (compact young taiga pine)
        drawPineTier(52, 14, 18, sway);
        drawPineTier(41, 11, 16, sway);
        drawPineTier(31, 8, 14, sway);
      } else {
        // Pinheiro Alto (towering multi-tiered boreal conifer)
        drawPineTier(52, 21, 20, sway);
        drawPineTier(39, 18, 18, sway);
        drawPineTier(27, 15, 16, sway);
        drawPineTier(16, 11, 14, sway);
        drawPineTier(6, 7, 12, sway);
      }
    });

    // 14. SHORT_GRASS (32x32 canvas — Static 0-animation low grass tufts, 3 natural variants)
    registerNatureVariants(NatureNodeType.SHORT_GRASS, 32, 32, (ctx, _f, v) => {
      // Base subtle shadow tuft
      ctx.fillStyle = 'rgba(12, 32, 16, 0.25)';
      ctx.fillRect(10, 22, 12, 2);

      if (v === 0) {
        // Variant 0: Crisp three-blade meadow cluster
        ctx.fillStyle = '#14532d';
        ctx.fillRect(10, 18, 2, 5);
        ctx.fillRect(14, 16, 3, 7);
        ctx.fillRect(19, 18, 2, 5);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(9, 16, 2, 4);
        ctx.fillRect(14, 14, 2, 6);
        ctx.fillRect(20, 16, 2, 4);
        ctx.fillStyle = '#86efac';
        ctx.fillRect(14, 13, 2, 2);
        ctx.fillRect(9, 15, 1, 2);
        ctx.fillRect(21, 15, 1, 2);
      } else if (v === 1) {
        // Variant 1: Dual low wild grass clumps
        ctx.fillStyle = '#14532d';
        ctx.fillRect(8, 19, 3, 4);
        ctx.fillRect(12, 17, 2, 6);
        ctx.fillRect(18, 18, 3, 5);
        ctx.fillRect(22, 19, 2, 4);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(8, 17, 2, 4);
        ctx.fillRect(12, 15, 2, 5);
        ctx.fillRect(18, 16, 2, 4);
        ctx.fillRect(22, 17, 2, 3);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(12, 14, 2, 2);
        ctx.fillRect(19, 15, 2, 2);
      } else {
        // Variant 2: Asymmetrical low sprout tuft
        ctx.fillStyle = '#14532d';
        ctx.fillRect(11, 18, 3, 5);
        ctx.fillRect(15, 17, 3, 6);
        ctx.fillRect(19, 19, 2, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(10, 16, 2, 4);
        ctx.fillRect(15, 14, 2, 6);
        ctx.fillRect(18, 16, 2, 4);
        ctx.fillStyle = '#a3e635';
        ctx.fillRect(15, 13, 2, 2);
        ctx.fillRect(10, 15, 2, 1);
      }
    });

    // 15. TALL_GRASS (32x32 canvas — Static 0-animation tall lush grass blades, 3 natural variants)
    registerNatureVariants(NatureNodeType.TALL_GRASS, 32, 32, (ctx, _f, v) => {
      // Ground root shadow
      ctx.fillStyle = 'rgba(10, 28, 14, 0.32)';
      ctx.fillRect(7, 24, 18, 3);

      if (v === 0) {
        // Variant 0: Dense tall wild prairie grass
        ctx.fillStyle = '#0f3d20';
        ctx.fillRect(8, 14, 3, 11);
        ctx.fillRect(12, 10, 3, 15);
        ctx.fillRect(16, 9, 3, 16);
        ctx.fillRect(20, 13, 3, 12);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(7, 11, 2, 10);
        ctx.fillRect(12, 8, 2, 13);
        ctx.fillRect(16, 7, 2, 14);
        ctx.fillRect(21, 10, 2, 11);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(7, 9, 2, 4);
        ctx.fillRect(12, 6, 2, 4);
        ctx.fillRect(17, 5, 2, 4);
        ctx.fillRect(22, 8, 2, 4);
        ctx.fillStyle = '#bbf7d0';
        ctx.fillRect(12, 5, 1, 2);
        ctx.fillRect(17, 4, 1, 2);
      } else if (v === 1) {
        // Variant 1: Fanning tall meadow grass with seed-head tips
        ctx.fillStyle = '#0f3d20';
        ctx.fillRect(7, 15, 3, 10);
        ctx.fillRect(11, 11, 3, 14);
        ctx.fillRect(15, 10, 3, 15);
        ctx.fillRect(19, 12, 3, 13);
        ctx.fillRect(23, 16, 2, 9);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(6, 12, 2, 9);
        ctx.fillRect(11, 8, 2, 12);
        ctx.fillRect(15, 7, 2, 13);
        ctx.fillRect(19, 9, 2, 11);
        ctx.fillRect(23, 13, 2, 8);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(6, 10, 2, 4);
        ctx.fillRect(10, 6, 2, 4);
        ctx.fillRect(15, 5, 2, 4);
        ctx.fillRect(20, 7, 2, 4);
        ctx.fillStyle = '#a3e635';
        ctx.fillRect(10, 5, 2, 2);
        ctx.fillRect(15, 4, 2, 2);
        ctx.fillRect(20, 6, 2, 2);
      } else {
        // Variant 2: Layered tall bush-grass cluster
        ctx.fillStyle = '#0f3d20';
        ctx.fillRect(9, 12, 3, 13);
        ctx.fillRect(13, 9, 4, 16);
        ctx.fillRect(18, 11, 3, 14);
        ctx.fillRect(22, 15, 2, 10);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(8, 9, 2, 11);
        ctx.fillRect(13, 7, 3, 14);
        ctx.fillRect(18, 9, 2, 12);
        ctx.fillRect(22, 12, 2, 9);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(8, 7, 2, 4);
        ctx.fillRect(14, 5, 2, 4);
        ctx.fillRect(19, 7, 2, 4);
        ctx.fillStyle = '#86efac';
        ctx.fillRect(14, 4, 2, 2);
        ctx.fillRect(8, 6, 1, 2);
      }
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

    // WOOD WALL (Parede de Carvalho — Warm golden oak beams & forged iron straps)
    this.structureSprites.set(
      PlaceableType.WOOD_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(2, 2, 20, 1);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(2, 4, 20, 2);
        const logX = [1, 6, 11, 16, 20];
        for (let i = 0; i < logX.length; i++) {
          const lx = logX[i];
          const lw = i === logX.length - 1 ? 3 : 4;
          ctx.fillStyle = i % 2 === 0 ? '#78350f' : '#653716';
          ctx.fillRect(lx, 7, lw, 15);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(lx + 1, 7, Math.max(1, lw - 2), 14);
        }
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 9, 24, 2);
        ctx.fillRect(0, 17, 24, 2);
        ctx.fillStyle = '#94a3b8';
        for (const rx of [3, 9, 15, 20]) {
          ctx.fillRect(rx, 9, 1, 1);
          ctx.fillRect(rx, 17, 1, 1);
        }
      })
    );

    // DARK OAK WALL (Parede de Carvalho Escuro — Deep espresso vertical paneling with antique bronze molding)
    this.structureSprites.set(
      PlaceableType.DARK_OAK_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#120804';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(2, 2, 20, 1);
        ctx.fillStyle = '#3d2312';
        ctx.fillRect(2, 4, 20, 2);
        ctx.fillStyle = '#2b170b';
        ctx.fillRect(1, 7, 22, 15);
        for (const px of [2, 9, 16]) {
          ctx.fillStyle = '#3d2312';
          ctx.fillRect(px, 8, 5, 13);
          ctx.fillStyle = '#5c3a21';
          ctx.fillRect(px + 1, 9, 3, 11);
        }
        ctx.fillStyle = '#b45309';
        ctx.fillRect(0, 7, 24, 1);
        ctx.fillRect(0, 20, 24, 1);
      })
    );

    // PINE WALL (Parede de Pinheiro — Pale Nordic spruce horizontal rounded logs with notched cabin corners)
    this.structureSprites.set(
      PlaceableType.PINE_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#2e1a0b';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#e2be8a';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#f8e7c9';
        ctx.fillRect(2, 2, 20, 1);
        ctx.fillStyle = '#c49a62';
        ctx.fillRect(2, 4, 20, 2);
        for (const ly of [7, 12, 17]) {
          ctx.fillStyle = '#b88c56';
          ctx.fillRect(1, ly, 22, 4);
          ctx.fillStyle = '#e2be8a';
          ctx.fillRect(1, ly, 22, 2);
          ctx.fillStyle = '#6b4226';
          ctx.fillRect(1, ly, 3, 4);
          ctx.fillRect(20, ly, 3, 4);
        }
      })
    );

    // STONE WALL — Bevelled medieval castle ashlar masonry wall with top coping ledge
    this.structureSprites.set(
      PlaceableType.STONE_WALL,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 1, 24, 22);
        // Top dressed stone coping cap
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(2, 2, 20, 1);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(2, 4, 20, 2);
        // Ashlar stone courses
        const bricks = [
          [1, 7, 10, 5],
          [12, 7, 11, 5],
          [1, 13, 6, 4],
          [8, 13, 9, 4],
          [18, 13, 5, 4],
          [1, 18, 11, 4],
          [13, 18, 10, 4],
        ];
        for (const [bx, by, bw, bh] of bricks) {
          ctx.fillStyle = '#475569';
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(bx, by, bw - 1, bh - 1);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(bx + 1, by, Math.max(1, bw - 3), 1);
        }
      })
    );

    // WOOD FLOOR (Piso de Carvalho)
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

    // DARK OAK FLOOR (Piso de Carvalho Escuro — Rich dark espresso planks with bronze dowels)
    this.structureSprites.set(
      PlaceableType.DARK_OAK_FLOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#140904';
        ctx.fillRect(0, 0, 24, 24);
        const rows = [1, 7, 13, 19];
        for (let i = 0; i < rows.length; i++) {
          const ry = rows[i];
          ctx.fillStyle = i % 2 === 0 ? '#2b170b' : '#3d2312';
          ctx.fillRect(1, ry, 22, 5);
          ctx.fillStyle = '#5c3a21';
          ctx.fillRect(1, ry, 22, 2);
          const jx = i % 2 === 0 ? 9 : 15;
          ctx.fillStyle = '#140904';
          ctx.fillRect(jx, ry, 1, 5);
          ctx.fillStyle = '#92400e';
          ctx.fillRect(3, ry + 2, 1, 1);
          ctx.fillRect(20, ry + 2, 1, 1);
        }
      })
    );

    // PINE FLOOR (Piso de Pinheiro — Pale Nordic spruce planks with warm honey grain)
    this.structureSprites.set(
      PlaceableType.PINE_FLOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(0, 0, 24, 24);
        const rows = [1, 7, 13, 19];
        for (let i = 0; i < rows.length; i++) {
          const ry = rows[i];
          ctx.fillStyle = i % 2 === 0 ? '#b88c56' : '#c49a62';
          ctx.fillRect(1, ry, 22, 5);
          ctx.fillStyle = '#e2be8a';
          ctx.fillRect(1, ry, 22, 2);
          const jx = i % 2 === 0 ? 12 : 8;
          ctx.fillStyle = '#5c3a21';
          ctx.fillRect(jx, ry, 1, 5);
          ctx.fillStyle = '#78350f';
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
    // WOOD DOOR (Porta de Carvalho)
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

    // DARK OAK DOOR (Porta de Carvalho Escuro)
    this.structureSprites.set(
      PlaceableType.DARK_OAK_DOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#120804';
        ctx.fillRect(0, 3, 24, 18);
        ctx.fillStyle = '#2b170b';
        ctx.fillRect(0, 4, 4, 16);
        ctx.fillRect(20, 4, 4, 16);
        ctx.fillStyle = '#3d2312';
        ctx.fillRect(4, 5, 16, 14);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(6, 6, 5, 12);
        ctx.fillRect(13, 6, 5, 12);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(4, 5, 16, 2);
        ctx.fillRect(4, 17, 16, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(15, 11, 3, 3);
      })
    );

    // PINE DOOR (Porta de Pinheiro)
    this.structureSprites.set(
      PlaceableType.PINE_DOOR,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#2e1a0b';
        ctx.fillRect(0, 3, 24, 18);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(0, 4, 4, 16);
        ctx.fillRect(20, 4, 4, 16);
        ctx.fillStyle = '#b88c56';
        ctx.fillRect(4, 5, 16, 14);
        ctx.fillStyle = '#e2be8a';
        ctx.fillRect(5, 6, 14, 12);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(5, 6, 14, 2);
        ctx.fillRect(5, 16, 14, 2);
        ctx.fillRect(9, 8, 6, 8);
        ctx.fillStyle = '#ea580c';
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

    // FENCE GATE (Porteira de Madeira)
    this.structureSprites.set(
      PlaceableType.FENCE_GATE,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#1f1209';
        ctx.fillRect(1, 3, 6, 19);
        ctx.fillRect(17, 3, 6, 19);
        ctx.fillRect(5, 6, 14, 13);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(2, 4, 4, 17);
        ctx.fillRect(18, 4, 4, 17);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(6, 7, 12, 3);
        ctx.fillRect(6, 14, 12, 3);
        ctx.fillRect(8, 7, 3, 10);
        ctx.fillRect(13, 7, 3, 10);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(11, 10, 2, 3);
      })
    );

    // WOOD WINDOW (Parede de Carvalho com Janela)
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

    // DARK OAK WINDOW (Parede de Carvalho Escuro com Janela)
    this.structureSprites.set(
      PlaceableType.DARK_OAK_WINDOW,
      createFrames(24, 24, (ctx, f) => {
        ctx.fillStyle = '#120804';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#2b170b';
        ctx.fillRect(1, 2, 22, 20);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#140904';
        ctx.fillRect(5, 6, 14, 11);
        ctx.fillStyle = f % 2 === 0 ? '#0284c7' : '#38bdf8';
        ctx.fillRect(6, 7, 12, 9);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(8, 8, 8, 5);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(11, 7, 2, 9);
        ctx.fillRect(6, 11, 12, 2);
      })
    );

    // PINE WINDOW (Parede de Pinheiro com Janela)
    this.structureSprites.set(
      PlaceableType.PINE_WINDOW,
      createFrames(24, 24, (ctx, f) => {
        ctx.fillStyle = '#2e1a0b';
        ctx.fillRect(0, 1, 24, 22);
        ctx.fillStyle = '#b88c56';
        ctx.fillRect(1, 2, 22, 20);
        ctx.fillStyle = '#e2be8a';
        ctx.fillRect(1, 2, 22, 4);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(3, 6, 18, 11);
        ctx.fillStyle = f % 2 === 0 ? '#38bdf8' : '#bae6fd';
        ctx.fillRect(6, 7, 12, 9);
        ctx.fillStyle = '#6b4226';
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

    // DIRT PATH — Beaten earth road tile preview sprite
    this.structureSprites.set(
      PlaceableType.DIRT_PATH,
      createFrames(24, 24, (ctx) => {
        ctx.fillStyle = '#6b4c30';
        ctx.fillRect(0, 0, 24, 24);
        ctx.fillStyle = '#8c6642';
        ctx.fillRect(2, 2, 20, 20);
        ctx.fillStyle = '#a87e53';
        ctx.fillRect(4, 4, 16, 16);
        ctx.fillStyle = '#735336';
        ctx.fillRect(5, 6, 3, 2);
        ctx.fillRect(15, 14, 4, 2);
      })
    );

    // OAK_SAPLING default preview sprite
    this.structureSprites.set(
      PlaceableType.OAK_SAPLING,
      createFrames(24, 28, (ctx, f) => {
        const sway = f % 2 === 0 ? 0 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(6, 23, 12, 3);
        ctx.fillStyle = '#5c3a1e';
        ctx.fillRect(8, 21, 8, 3);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(11, 14, 2, 8);
        ctx.fillStyle = '#052e16';
        ctx.fillRect(6 + sway, 6, 12, 10);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(7 + sway, 7, 10, 8);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(8 + sway, 8, 6, 4);
      })
    );

    // PALM_SAPLING default preview sprite
    this.structureSprites.set(
      PlaceableType.PALM_SAPLING,
      createFrames(24, 28, (ctx, f) => {
        const sway = f % 2 === 0 ? 0 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(6, 23, 12, 3);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, 20, 8, 4);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(11, 13, 2, 8);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(4 + sway, 8, 16, 4);
        ctx.fillRect(8 + sway, 5, 8, 6);
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(5 + sway, 8, 14, 2);
      })
    );

    // DARK_OAK_SAPLING default preview sprite
    this.structureSprites.set(
      PlaceableType.DARK_OAK_SAPLING,
      createFrames(24, 28, (ctx, f) => {
        const sway = f % 2 === 0 ? 0 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(6, 23, 12, 3);
        ctx.fillStyle = '#4a2c16';
        ctx.fillRect(8, 21, 8, 3);
        ctx.fillStyle = '#3b1d0a';
        ctx.fillRect(10, 13, 4, 9);
        ctx.fillStyle = '#022c22';
        ctx.fillRect(5 + sway, 5, 14, 11);
        ctx.fillStyle = '#065f46';
        ctx.fillRect(6 + sway, 6, 12, 9);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(7 + sway, 7, 7, 4);
      })
    );

    // PINE_SAPLING default preview sprite
    this.structureSprites.set(
      PlaceableType.PINE_SAPLING,
      createFrames(24, 28, (ctx, f) => {
        const sway = f % 2 === 0 ? 0 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(6, 23, 12, 3);
        ctx.fillStyle = '#431407';
        ctx.fillRect(8, 21, 8, 3);
        ctx.fillStyle = '#5c3a21';
        ctx.fillRect(11, 15, 2, 7);
        ctx.fillStyle = '#042f2e';
        ctx.fillRect(5 + sway, 12, 14, 5);
        ctx.fillRect(7 + sway, 8, 10, 5);
        ctx.fillRect(9 + sway, 4, 6, 5);
        ctx.fillStyle = '#0d9488';
        ctx.fillRect(6 + sway, 12, 12, 3);
        ctx.fillRect(8 + sway, 8, 8, 3);
        ctx.fillStyle = '#2dd4bf';
        ctx.fillRect(10 + sway, 5, 4, 3);
      })
    );

    // BED (Cama de Madeira — Carved oak frame, fluffy wool pillow & crimson-gold quilted blanket)
    this.structureSprites.set(
      PlaceableType.BED,
      createFrames(30, 26, (ctx) => {
        // Soft ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(2, 21, 26, 4);
        // Dark timber frame outline
        ctx.fillStyle = '#2a1205';
        ctx.fillRect(2, 2, 26, 20);
        // Oak headboard (top/north) & corner posts
        ctx.fillStyle = '#78350f';
        ctx.fillRect(3, 3, 24, 5);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(4, 3, 22, 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(6, 4, 2, 2);
        ctx.fillRect(22, 4, 2, 2);
        // White wool mattress & fluffy pillow
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(4, 7, 22, 11);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(6, 7, 18, 4);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(6, 10, 18, 1);
        // Crimson & gold quilted blanket covering lower 2/3 of bed
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(4, 11, 22, 8);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(5, 12, 20, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(6, 13, 18, 3);
        // Golden trim band across blanket fold
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(4, 11, 22, 1);
        ctx.fillRect(14, 12, 2, 6);
        // Oak footboard & legs
        ctx.fillStyle = '#78350f';
        ctx.fillRect(3, 19, 24, 2);
        ctx.fillRect(3, 21, 3, 2);
        ctx.fillRect(24, 21, 3, 2);
      })
    );

    // WEAVING_TABLE (Mesa de Tecelagem — 38x32 wooden loom & tailoring table with forged iron legs, colorful wool rolls & dye pots)
    this.structureSprites.set(
      PlaceableType.WEAVING_TABLE,
      createFrames(38, 32, (ctx) => {
        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        ctx.fillRect(3, 26, 32, 5);
        // Dark silhouette outline
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(3, 7, 32, 22);
        // Forged iron legs & crossbar
        ctx.fillStyle = '#475569';
        ctx.fillRect(5, 18, 4, 10);
        ctx.fillRect(29, 18, 4, 10);
        ctx.fillRect(9, 22, 20, 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(6, 18, 2, 9);
        ctx.fillRect(30, 18, 2, 9);
        // Oak tailor tabletop
        ctx.fillStyle = '#78350f';
        ctx.fillRect(4, 9, 30, 10);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(5, 9, 28, 7);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(6, 10, 26, 3);
        // Raised wooden loom rack at the back
        ctx.fillStyle = '#451a03';
        ctx.fillRect(6, 4, 16, 6);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(8, 5, 12, 4);
        // Woven cloth bolt unrolled on the table (white & crimson/blue dye stripes)
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(7, 10, 13, 6);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(7, 15, 13, 1);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(9, 11, 9, 1);
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(9, 13, 9, 1);
        // Colorful thread spools & golden tailor shears on the right
        ctx.fillStyle = '#eab308';
        ctx.fillRect(22, 9, 3, 4);
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(26, 9, 3, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(30, 10, 3, 4);
        // Iron shears
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(23, 14, 6, 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(22, 14, 2, 2);
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
          {
            head: null,
            body: 'white_tank_top',
            legs: 'brown_shorts',
            feet: null,
          },
          DEFAULT_PLAYER_APPEARANCE,
          'none'
        );
      }
    }
  }

  private shadeHexColor(hex: string, percent: number): string {
    const clean = (hex || '#fdba74').replace('#', '');
    if (clean.length !== 6) return hex;
    const num = parseInt(clean, 16);
    if (Number.isNaN(num)) return hex;
    const r = Math.min(
      255,
      Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent))
    );
    const g = Math.min(
      255,
      Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent))
    );
    const b = Math.min(
      255,
      Math.max(0, (num & 0xff) + Math.round(2.55 * percent))
    );
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  public getSkinMarkPreviewUrl(mark: SkinMarkId, skinColor: string): string {
    this.ensureInitialized();
    const key = `preview_mark_${mark}_${skinColor}`;
    const existing = this.itemDataUrls.get(key);
    if (existing) return existing;

    const c = createPixelCanvas(24, 24);
    const ctx = c.getContext('2d')!;
    const skinBase = skinColor || '#fdba74';
    const skinLight = this.shadeHexColor(skinBase, 10);
    const skinShadow = this.shadeHexColor(skinBase, -12);
    const freckleColor = this.shadeHexColor(skinBase, -30);

    // Face oval frame
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(4, 3, 16, 18);
    ctx.fillStyle = skinBase;
    ctx.fillRect(5, 4, 14, 16);
    ctx.fillStyle = skinLight;
    ctx.fillRect(6, 5, 12, 3);
    ctx.fillStyle = skinShadow;
    ctx.fillRect(5, 18, 14, 2);

    // Subtle reference eyes
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(7, 10, 3, 2);
    ctx.fillRect(14, 10, 3, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 10, 1, 1);
    ctx.fillRect(14, 10, 1, 1);

    if (mark === 'freckles' || mark === 'freckles_and_scar') {
      ctx.fillStyle = freckleColor;
      ctx.fillRect(6, 13, 1, 1);
      ctx.fillRect(8, 14, 1, 1);
      ctx.fillRect(10, 13, 1, 1);
      ctx.fillRect(11, 12, 2, 1);
      ctx.fillRect(13, 13, 1, 1);
      ctx.fillRect(15, 14, 1, 1);
      ctx.fillRect(17, 13, 1, 1);
    }

    if (mark === 'eye_scar' || mark === 'freckles_and_scar') {
      ctx.fillStyle = '#9f1239';
      ctx.fillRect(15, 6, 1, 3);
      ctx.fillRect(15, 12, 1, 4);
      ctx.fillRect(14, 15, 1, 2);
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(16, 7, 1, 2);
      ctx.fillRect(16, 12, 1, 3);
    }

    if (mark === 'beard_stubble') {
      // Barba Cerrada: Jawline & chin 5 o'clock shadow
      ctx.fillStyle = 'rgba(30, 41, 59, 0.42)';
      ctx.fillRect(5, 14, 14, 5);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(6, 17, 12, 2);
      ctx.fillRect(9, 14, 6, 1);
      ctx.fillStyle = skinBase;
      ctx.fillRect(10, 15, 4, 2);
    } else if (mark === 'elder_wrinkles') {
      // Rugas Sábias: Forehead wisdom creases & cheek lines
      ctx.fillStyle = this.shadeHexColor(skinBase, -28);
      ctx.fillRect(8, 6, 8, 1);
      ctx.fillRect(9, 8, 6, 1);
      ctx.fillRect(6, 13, 2, 2);
      ctx.fillRect(16, 13, 2, 2);
    }

    const url = c.toDataURL();
    this.itemDataUrls.set(key, url);
    return url;
  }

  public getHairStylePreviewUrl(
    style: HairStyleId,
    hairColor: string,
    skinColor: string
  ): string {
    this.ensureInitialized();
    const key = `preview_hair_${style}_${hairColor}_${skinColor}`;
    const existing = this.itemDataUrls.get(key);
    if (existing) return existing;

    const full = this.getCompositePlayerSprite(
      'down',
      0,
      { head: null, body: 'white_tank_top', legs: 'brown_shorts', feet: null },
      {
        ...DEFAULT_PLAYER_APPEARANCE,
        skinColor: skinColor || '#fdba74',
        hairColor: hairColor || '#451a03',
        hairStyle: style,
      },
      'none'
    );
    const c = createPixelCanvas(24, 24);
    const ctx = c.getContext('2d')!;
    // Crop upper head & shoulders region (x=4..28, y=0..20) into 24x24 preview
    ctx.drawImage(full, 4, 0, 24, 20, 0, 2, 24, 20);
    const url = c.toDataURL();
    this.itemDataUrls.set(key, url);
    return url;
  }

  public getEyeStylePreviewUrl(
    style: EyeStyleId,
    eyeColor: string,
    skinColor: string
  ): string {
    this.ensureInitialized();
    const key = `preview_eye_${style}_${eyeColor}_${skinColor}`;
    const existing = this.itemDataUrls.get(key);
    if (existing) return existing;

    const full = this.getCompositePlayerSprite(
      'down',
      0,
      { head: null, body: 'white_tank_top', legs: 'brown_shorts', feet: null },
      {
        ...DEFAULT_PLAYER_APPEARANCE,
        skinColor: skinColor || '#fdba74',
        hairColor: '#451a03',
        hairStyle: 'SamuraiPreview' as unknown as HairStyleId,
        eyeStyle: style,
        eyeColor: eyeColor || '#0f172a',
      },
      'none'
    );
    const c = createPixelCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    // Crop the face & eye region (x=8..24, y=3..15) so the eye shape fills the slot clearly
    ctx.drawImage(full, 8, 2, 16, 12, 0, 2, 16, 12);
    const url = c.toDataURL();
    this.itemDataUrls.set(key, url);
    return url;
  }

  private getCompositePlayerSprite(
    dir: Direction,
    frame: number,
    eq: PlayerEquipment,
    app: PlayerAppearance,
    mountPose: 'none' | 'horse' | 'boat' = 'none'
  ): HTMLCanvasElement {
    const f = frame % 4;
    const gender = app.gender || 'masculino';
    const skinMark: SkinMarkId = app.skinMark || 'none';
    const eyeStyle: EyeStyleId = app.eyeStyle || 'classic';
    const hStyle = app.hairStyle || 'adventurer';

    const key = [
      'v3_slim',
      dir,
      f,
      mountPose,
      gender,
      eq.head || 'none',
      eq.body || 'none',
      eq.legs || 'none',
      eq.feet || 'none',
      app.skinColor,
      skinMark,
      app.hairColor,
      hStyle,
      eyeStyle,
      app.eyeColor,
    ].join('|');

    const cached = this.playerSprites.get(key);
    if (cached) return cached;

    if (this.playerSprites.size > 800) {
      this.playerSprites.clear();
    }

    // Separate Head (1.0x) and Body (1.5x) canvases so the head keeps its exact size while the body is 1.5x larger!
    const bodyCanvas = createPixelCanvas(32, 32);
    const bodyCtx = bodyCanvas.getContext('2d')!;
    const headCanvas = createPixelCanvas(32, 32);
    const headCtx = headCanvas.getContext('2d')!;
    let ctx: CanvasRenderingContext2D = bodyCtx;

    const stepL = mountPose === 'none' ? (f === 1 ? -1 : f === 3 ? 1 : 0) : 0;
    const stepR = -stepL;
    const isFeminine = gender === 'feminino';

    // Multi-tone skin palette
    const skinBase = app.skinColor || '#fdba74';
    const skinLight = this.shadeHexColor(skinBase, 11);
    const skinShadow = this.shadeHexColor(skinBase, -12);
    const skinDeep = this.shadeHexColor(skinBase, -24);
    const freckleTone = this.shadeHexColor(skinBase, -32);

    // Multi-tone hair palette
    const hairMain = app.hairColor || '#451a03';
    const hairHighlight = this.shadeHexColor(hairMain, 18);
    const hairShadow = this.shadeHexColor(hairMain, -15);
    const hairDeep = this.shadeHexColor(hairMain, -28);

    // Multi-tone eye palette
    const eyeMain = app.eyeColor || '#0f172a';
    const eyeLight = this.shadeHexColor(eyeMain, 24);
    const eyeDark = this.shadeHexColor(eyeMain, -20);

    // Resolve Body / Torso equipment state
    const bodyId = eq.body || null;
    let capeColor: string | null = null;
    if (bodyId === 'leather_tunic') capeColor = '#451a03';
    else if (bodyId === 'iron_armor') capeColor = '#991b1b';
    else if (bodyId === 'astral_armor') capeColor = '#7e22ce';

    const legsId = eq.legs || null;
    const feetId = eq.feet || null;
    const headId = eq.head || null;
    const headDef = headId ? ITEMS[headId] : null;
    const headBaseId = headDef?.garmentBaseId || headId;

    // 1. Ground Shadow (on bodyCtx)
    ctx = bodyCtx;
    if (mountPose === 'none') {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(8, 28, 16, 3);
    }

    // 2. Back Hair Layer (drawn on headCtx)
    ctx = headCtx;
    if (
      !headId ||
      headId === 'astral_crown' ||
      headBaseId === 'elder_mitre' ||
      headBaseId === 'blacksmith_bandana'
    ) {
      if (hStyle === 'long_mane' || hStyle === 'elder_sage') {
        ctx.fillStyle = hairDeep;
        ctx.fillRect(8, 7, 16, 11);
        ctx.fillStyle = hairShadow;
        ctx.fillRect(9, 8, 14, 9);
      } else if (hStyle === 'twin_tails') {
        ctx.fillStyle = hairDeep;
        if (dir !== 'left') ctx.fillRect(5, 6, 4, 11);
        if (dir !== 'right') ctx.fillRect(23, 6, 4, 11);
        ctx.fillStyle = hairMain;
        if (dir !== 'left') ctx.fillRect(6, 6, 3, 9);
        if (dir !== 'right') ctx.fillRect(23, 6, 3, 9);
      } else if (hStyle === 'ponytail' && dir === 'down') {
        ctx.fillStyle = hairShadow;
        ctx.fillRect(13, 1, 6, 3);
      }
    }

    // Back Cape for Armors (drawn on bodyCtx)
    ctx = bodyCtx;
    if (capeColor && (dir === 'up' || dir === 'left' || dir === 'right')) {
      ctx.fillStyle = capeColor;
      const capeH = mountPose === 'boat' ? 8 : 12;
      if (dir === 'up') {
        ctx.fillRect(8, 14, 16, capeH);
      } else if (dir === 'left') {
        ctx.fillRect(19, 14, 5, capeH - 1);
      } else if (dir === 'right') {
        ctx.fillRect(8, 14, 5, capeH - 1);
      }
    }

    // 3. Dark Character Silhouette Outline & Base Anatomy
    // Head & Neck outline on headCtx
    headCtx.fillStyle = '#0f172a';
    headCtx.fillRect(9, 2, 14, 12);
    headCtx.fillRect(13, 13, 6, 2);

    // Body silhouette outline on bodyCtx
    ctx = bodyCtx;
    ctx.fillStyle = '#0f172a';
    if (mountPose === 'boat') {
      // Seated in Boat: Upper torso & arms resting on gunwales
      ctx.fillRect(6, 14, 20, 9);
    } else if (mountPose === 'horse') {
      // Astride Mount
      ctx.fillRect(7, 14, 18, 9);
      if (dir === 'left' || dir === 'right') {
        ctx.fillRect(10, 22, 12, 7);
      } else {
        ctx.fillRect(6, 22, 6, 7);
        ctx.fillRect(20, 22, 6, 7);
      }
    } else {
      // Standing / Walking
      const torsoW = isFeminine ? 10 : 12;
      const torsoX = isFeminine ? 11 : 10;
      ctx.fillRect(torsoX - 1, 14, torsoW + 2, 9); // Torso outline
      // Arms outline (directional: 2 side arms in front/back view; far + near arm in side profile)
      if (dir === 'left') {
        ctx.fillRect(8 + Math.round(stepR * 0.5), 14 + stepR, 4, 8); // Far arm outline
        ctx.fillRect(13 - Math.round(stepL * 0.5), 14 + stepL, 5, 8); // Near arm outline
      } else if (dir === 'right') {
        ctx.fillRect(20 - Math.round(stepL * 0.5), 14 + stepL, 4, 8); // Far arm outline
        ctx.fillRect(14 + Math.round(stepR * 0.5), 14 + stepR, 5, 8); // Near arm outline
      } else {
        ctx.fillRect(7, 14 + stepL, 4, 8);
        ctx.fillRect(21, 14 + stepR, 4, 8);
      }
      // Hips / Pelvis outline
      ctx.fillRect(10, 21, 12, 4);
      // Legs outline
      ctx.fillRect(10, 23, 5, 7);
      ctx.fillRect(17, 23, 5, 7);
    }

    // 4. Base Body Skin, Built-in White Underwear (Cueca Branca & Sutiã Branco Feminino) & Bare Feet
    if (mountPose === 'boat') {
      // Seated Torso & Arms skin
      ctx.fillStyle = skinBase;
      ctx.fillRect(11, 14, 10, 8);
      if (dir === 'down' || dir === 'up') {
        ctx.fillRect(7, 15, 4, 6);
        ctx.fillRect(21, 15, 4, 6);
        ctx.fillStyle = skinShadow;
        ctx.fillRect(7, 19, 3, 2);
        ctx.fillRect(22, 19, 3, 2);
      }
    } else if (mountPose === 'horse') {
      ctx.fillStyle = skinBase;
      ctx.fillRect(11, 14, 10, 8);
      if (dir === 'left' || dir === 'right') {
        ctx.fillRect(11, 22, 9, 5);
      } else {
        ctx.fillRect(7, 15, 4, 6);
        ctx.fillRect(21, 15, 4, 6);
        ctx.fillRect(7, 22, 4, 5);
        ctx.fillRect(21, 22, 4, 5);
      }
    } else {
      // Standing / Walking: If facing left/right, draw FAR arm behind torso first
      if (dir === 'left') {
        const farX = 9 + Math.round(stepR * 0.5);
        ctx.fillStyle = skinShadow;
        ctx.fillRect(farX, 15 + stepR, 2, 5);
        ctx.fillStyle = skinDeep;
        ctx.fillRect(farX, 20 + stepR, 2, 1);
      } else if (dir === 'right') {
        const farX = 21 - Math.round(stepL * 0.5);
        ctx.fillStyle = skinShadow;
        ctx.fillRect(farX, 15 + stepL, 2, 5);
        ctx.fillStyle = skinDeep;
        ctx.fillRect(farX, 20 + stepL, 2, 1);
      }

      // Standing / Walking Base Skin Torso
      const torsoW = 10;
      const torsoX = 11;
      ctx.fillStyle = skinBase;
      ctx.fillRect(torsoX, 14, torsoW, 8);
      // Clavicle & chest/back shading
      ctx.fillStyle = skinLight;
      ctx.fillRect(12, 14, 8, 1);
      ctx.fillStyle = skinShadow;
      if (isFeminine) {
        // Feminine waist taper
        ctx.fillRect(11, 18, 1, 3);
        ctx.fillRect(20, 18, 1, 3);
      } else if (dir === 'down') {
        // Subtle masculine pectoral & abdominal shading
        ctx.fillRect(12, 17, 3, 1);
        ctx.fillRect(17, 17, 3, 1);
        ctx.fillRect(15, 17, 2, 3);
      }

      // Bare Side Arms & Hands for front/back views (side-profile near arm is drawn after torso/outfit so it layers cleanly)
      if (dir === 'down' || dir === 'up') {
        ctx.fillStyle = skinBase;
        ctx.fillRect(8, 15 + stepL, 2, 6);
        ctx.fillRect(22, 15 + stepR, 2, 6);
        ctx.fillStyle = skinLight;
        ctx.fillRect(8, 15 + stepL, 1, 4);
        ctx.fillRect(23, 15 + stepR, 1, 4);
        ctx.fillStyle = skinShadow;
        ctx.fillRect(8, 20 + stepL, 2, 1);
        ctx.fillRect(22, 20 + stepR, 2, 1);
      }

      // Bare Legs & Bare Feet (before pants/shorts/boots overlays)
      const leftFootY = 27 + Math.max(0, stepL);
      const rightFootY = 27 + Math.max(0, stepR);

      ctx.fillStyle = skinBase;
      ctx.fillRect(11, 24, 3, 4);
      ctx.fillRect(18, 24, 3, 4);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(13, 24, 1, 4);
      ctx.fillRect(18, 24, 1, 4);

      // Bare feet
      ctx.fillStyle = skinBase;
      ctx.fillRect(11, leftFootY, 3, 2);
      ctx.fillRect(18, rightFootY, 3, 2);
      ctx.fillStyle = skinDeep;
      ctx.fillRect(11, leftFootY + 1, 3, 1);
      ctx.fillRect(18, rightFootY + 1, 3, 1);

      // BUILT-IN WHITE BRIEFS / UNDERWEAR (Cueca Branca embutida quando sem calça/bermuda)
      if (!legsId) {
        // Elastic waistband
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(11, 21, 10, 1);
        // White briefs body
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(11, 22, 10, 2);
        ctx.fillRect(13, 24, 6, 1);
        // Subtle seam shading
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(11, 23, 2, 1);
        ctx.fillRect(19, 23, 2, 1);
      }
    }

    // Resolve base IDs and dye colors for equipped garments
    const bodyDef = bodyId ? ITEMS[bodyId] : null;
    const bodyBaseId = bodyDef?.garmentBaseId || bodyId;
    const bodyColorDef =
      CLOTHING_COLOR_MAP[bodyDef?.garmentColorId || 'branco'] ||
      CLOTHING_COLOR_MAP.branco;
    const isBodyArmor =
      bodyId === 'leather_tunic' ||
      bodyId === 'iron_armor' ||
      bodyId === 'astral_armor';

    const legsDef = legsId ? ITEMS[legsId] : null;
    const legsBaseId = legsDef?.garmentBaseId || legsId;
    const legsColorDef =
      CLOTHING_COLOR_MAP[
        legsDef?.garmentColorId ||
          (legsId === 'overalls'
            ? 'bege'
            : legsId === 'brown_shorts'
            ? 'marrom'
            : 'branco')
      ] || CLOTHING_COLOR_MAP.branco;
    const isLegsArmor =
      legsId === 'leather_pants' ||
      legsId === 'iron_greaves' ||
      legsId === 'astral_leggings';

    const feetDef = feetId ? ITEMS[feetId] : null;
    const feetBaseId = feetDef?.garmentBaseId || feetId;
    const feetColorDef =
      CLOTHING_COLOR_MAP[feetDef?.garmentColorId || 'marrom'] ||
      CLOTHING_COLOR_MAP.marrom;

    // Helper to draw Overalls upper torso bib & suspenders (drawn over clothing tops, or under body armor)
    const drawOverallsUpperTorso = () => {
      const m = legsColorDef.hex;
      const d = legsColorDef.darkHex;
      const l = legsColorDef.lightHex;
      if (dir === 'down') {
        // Suspender straps over shoulders
        ctx.fillStyle = d;
        ctx.fillRect(12, 14, 2, 3);
        ctx.fillRect(18, 14, 2, 3);
        // Chest bib
        ctx.fillStyle = m;
        ctx.fillRect(12, 16, 8, 6);
        ctx.fillStyle = l;
        ctx.fillRect(13, 17, 6, 3);
        // Center bib pocket & stitching
        ctx.fillStyle = d;
        ctx.fillRect(14, 18, 4, 3);
        ctx.fillStyle = m;
        ctx.fillRect(15, 19, 2, 1);
        // Brass suspender buttons
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(12, 16, 1, 1);
        ctx.fillRect(19, 16, 1, 1);
      } else if (dir === 'up') {
        // Crossed back suspender straps & high waist back
        ctx.fillStyle = d;
        ctx.fillRect(12, 14, 2, 3);
        ctx.fillRect(18, 14, 2, 3);
        ctx.fillRect(14, 16, 4, 3);
        ctx.fillStyle = m;
        ctx.fillRect(11, 18, 10, 4);
      } else {
        // Side profile bib & shoulder strap
        ctx.fillStyle = d;
        ctx.fillRect(14, 14, 3, 3);
        ctx.fillStyle = m;
        ctx.fillRect(11, 17, 10, 5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(14, 17, 1, 1);
      }
    };

    // Helper to draw Dress skirt on lower body (for short_dress & long_dress)
    const drawDressLowerSkirt = (isLong: boolean) => {
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      const skirtH = isLong ? 6 : 4; // short_dress: y=22..25 (knees), long_dress: y=22..27 (ankles)
      if (mountPose === 'none') {
        // Waist sash
        ctx.fillStyle = d;
        ctx.fillRect(11, 21, 10, 1);
        // Flared pleated skirt
        ctx.fillStyle = m;
        ctx.fillRect(10, 22, 12, skirtH);
        if (isLong) {
          ctx.fillRect(9, 24, 14, 4);
        }
        // Vertical pleat highlights & shadow folds
        ctx.fillStyle = l;
        ctx.fillRect(11, 22, 2, skirtH - 1);
        ctx.fillRect(15, 22, 2, skirtH - 1);
        ctx.fillRect(19, 22, 2, skirtH - 1);
        ctx.fillStyle = d;
        ctx.fillRect(13, 23, 1, skirtH - 1);
        ctx.fillRect(18, 23, 1, skirtH - 1);
        // Bottom hem trim
        ctx.fillRect(isLong ? 9 : 10, 22 + skirtH - 1, isLong ? 14 : 12, 1);
      } else if (mountPose === 'horse') {
        ctx.fillStyle = m;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 22, 9, isLong ? 5 : 3);
        } else {
          ctx.fillRect(7, 22, 4, isLong ? 5 : 3);
          ctx.fillRect(21, 22, 4, isLong ? 5 : 3);
        }
      }
    };

    // BUILT-IN FEMALE WHITE BRA (Sutiã Branco embutido quando personagem feminino está sem camisa/armadura e sem macacão)
    if (!bodyId && legsBaseId !== 'overalls' && isFeminine) {
      ctx.fillStyle = '#cbd5e1';
      if (dir === 'down') {
        ctx.fillRect(12, 14, 1, 2);
        ctx.fillRect(19, 14, 1, 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(11, 16, 4, 3);
        ctx.fillRect(17, 16, 4, 3);
        ctx.fillRect(15, 17, 2, 1);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(11, 18, 10, 1);
      } else if (dir === 'up') {
        ctx.fillRect(12, 14, 1, 3);
        ctx.fillRect(19, 14, 1, 3);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(11, 17, 10, 1);
      } else if (dir === 'left') {
        ctx.fillRect(14, 14, 1, 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(11, 16, 6, 3);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(11, 18, 8, 1);
      } else if (dir === 'right') {
        ctx.fillRect(17, 14, 1, 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(15, 16, 6, 3);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(13, 18, 8, 1);
      }
    }

    // If wearing Overalls AND a body Armor, draw Overalls upper torso BEFORE body armor so armor overrides it!
    if (legsBaseId === 'overalls' && isBodyArmor) {
      drawOverallsUpperTorso();
    }

    // 5. Equipped BODY Garments (Clothing or Robust Armors)
    if (
      bodyBaseId === 'white_tank_top' ||
      bodyBaseId === 'short_dress' ||
      bodyBaseId === 'long_dress'
    ) {
      // Sleeveless Tank Top or Dress Bodice (uses 17-color palette)
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      if (dir === 'down') {
        ctx.fillStyle = d;
        ctx.fillRect(12, 14, 2, 2);
        ctx.fillRect(18, 14, 2, 2);
        ctx.fillStyle = m;
        ctx.fillRect(11, 16, 10, 6);
        ctx.fillStyle = l;
        ctx.fillRect(12, 16, 8, 4);
        ctx.fillStyle = d;
        ctx.fillRect(11, 16, 1, 6);
        ctx.fillRect(20, 16, 1, 6);
        ctx.fillRect(14, 15, 4, 1);
      } else if (dir === 'up') {
        ctx.fillStyle = d;
        ctx.fillRect(12, 14, 2, 2);
        ctx.fillRect(18, 14, 2, 2);
        ctx.fillRect(14, 15, 4, 1);
        ctx.fillStyle = m;
        ctx.fillRect(11, 16, 10, 6);
        ctx.fillStyle = d;
        ctx.fillRect(11, 16, 1, 6);
        ctx.fillRect(20, 16, 1, 6);
        ctx.fillRect(15, 16, 2, 5);
      } else {
        ctx.fillStyle = m;
        ctx.fillRect(11, 15, 10, 7);
        ctx.fillStyle = d;
        ctx.fillRect(14, 14, 4, 2);
        ctx.fillRect(11, 16, 1, 6);
        ctx.fillRect(20, 16, 1, 6);
      }
    } else if (bodyBaseId === 'sweater') {
      // Suéter: Cozy knit sweater that covers the entire torso and full arms (leaves only hands bare)
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      // Torso knit body
      ctx.fillStyle = m;
      ctx.fillRect(11, 14, 10, 8);
      ctx.fillStyle = l;
      ctx.fillRect(12, 15, 8, 5);
      // Ribbed collar & bottom hem
      ctx.fillStyle = d;
      ctx.fillRect(12, 14, 8, 1);
      ctx.fillRect(11, 21, 10, 1);
      if (dir === 'down' || dir === 'up') {
        // Subtle knit vertical cable lines
        ctx.fillRect(14, 16, 1, 5);
        ctx.fillRect(17, 16, 1, 5);
        // Full long sleeves covering both arms (y=15..19, leaving hand at y=20 skin-colored)
        const sL = mountPose === 'none' ? stepL : 0;
        const sR = mountPose === 'none' ? stepR : 0;
        if (mountPose === 'boat') {
          ctx.fillStyle = m;
          ctx.fillRect(7, 15, 4, 4);
          ctx.fillRect(21, 15, 4, 4);
          ctx.fillStyle = d;
          ctx.fillRect(7, 18, 4, 1);
          ctx.fillRect(21, 18, 4, 1);
        } else {
          ctx.fillStyle = m;
          ctx.fillRect(8, 14 + sL, 3, 6);
          ctx.fillRect(21, 14 + sR, 3, 6);
          ctx.fillStyle = l;
          ctx.fillRect(8, 15 + sL, 2, 4);
          ctx.fillRect(22, 15 + sR, 2, 4);
          ctx.fillStyle = d;
          ctx.fillRect(8, 19 + sL, 3, 1);
          ctx.fillRect(21, 19 + sR, 3, 1);
        }
      } else if (dir === 'left' && mountPose === 'none') {
        // Far arm sleeve in side profile
        const farX = 9 + Math.round(stepR * 0.5);
        ctx.fillStyle = d;
        ctx.fillRect(farX, 15 + stepR, 2, 5);
      } else if (dir === 'right' && mountPose === 'none') {
        const farX = 21 - Math.round(stepL * 0.5);
        ctx.fillStyle = d;
        ctx.fillRect(farX, 15 + stepL, 2, 5);
      }
    } else if (bodyBaseId === 'blacksmith_apron') {
      // Avental de Ferreiro: Charcoal workshop undershirt + heavy leather forge apron with chest strap & hammer loop
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      // Charcoal linen workshop shirt under the apron
      ctx.fillStyle = '#334155';
      ctx.fillRect(11, 14, 10, 8);
      // Rolled-up short sleeves on arms
      if (dir === 'down' || dir === 'up') {
        const sL = mountPose === 'none' ? stepL : 0;
        const sR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = '#475569';
        ctx.fillRect(8, 14 + sL, 3, 3);
        ctx.fillRect(21, 14 + sR, 3, 3);
      }
      if (dir === 'down') {
        // Leather neck/shoulder straps
        ctx.fillStyle = d;
        ctx.fillRect(12, 14, 2, 3);
        ctx.fillRect(18, 14, 2, 3);
        // Heavy forge apron bib & body
        ctx.fillStyle = m;
        ctx.fillRect(12, 16, 8, 6);
        ctx.fillStyle = l;
        ctx.fillRect(13, 17, 6, 3);
        // Brass rivets & blacksmith belt with iron buckle
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(12, 16, 1, 1);
        ctx.fillRect(19, 16, 1, 1);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(11, 19, 10, 1);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(15, 19, 2, 1);
        // Tongs / hammer pocket on apron front
        ctx.fillStyle = d;
        ctx.fillRect(14, 20, 4, 2);
      } else if (dir === 'up') {
        // Crossed leather straps on back
        ctx.fillStyle = d;
        ctx.fillRect(12, 14, 2, 4);
        ctx.fillRect(18, 14, 2, 4);
        ctx.fillRect(14, 17, 4, 2);
        ctx.fillRect(11, 19, 10, 2);
      } else {
        ctx.fillStyle = d;
        ctx.fillRect(14, 14, 3, 3);
        ctx.fillStyle = m;
        ctx.fillRect(11, 16, 10, 6);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(11, 19, 10, 1);
      }
    } else if (bodyBaseId === 'merchant_doublet') {
      // Gibão de Mercador: Noble tailored doublet with gold lapel trim, puffed shoulders, and coin pouch belt
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      ctx.fillStyle = m;
      ctx.fillRect(11, 14, 10, 8);
      ctx.fillStyle = l;
      ctx.fillRect(12, 15, 8, 5);
      // Leather merchant belt & gold coin pouch
      ctx.fillStyle = '#451a03';
      ctx.fillRect(11, 20, 10, 1);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(15, 20, 2, 1);
      if (dir === 'down') {
        // White silk cravat & golden V-lapels
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(15, 14, 2, 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(13, 14, 2, 4);
        ctx.fillRect(17, 14, 2, 4);
        ctx.fillRect(15, 17, 2, 3);
        // Bulging gold coin pouch at right hip
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(18, 20, 3, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(19, 20, 1, 1);
      } else if (dir === 'up') {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(12, 14, 8, 1);
        ctx.fillRect(15, 15, 2, 5);
        ctx.fillStyle = d;
        ctx.fillRect(11, 21, 10, 1);
      } else {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(14, 14, 4, 1);
        ctx.fillRect(15, 15, 2, 5);
      }
      if (dir === 'down' || dir === 'up') {
        const sL = mountPose === 'none' ? stepL : 0;
        const sR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = m;
        ctx.fillRect(7, 14 + sL, 4, 5);
        ctx.fillRect(21, 14 + sR, 4, 5);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(7, 14 + sL, 4, 1);
        ctx.fillRect(21, 14 + sR, 4, 1);
        ctx.fillStyle = d;
        ctx.fillRect(8, 18 + sL, 3, 1);
        ctx.fillRect(21, 18 + sR, 3, 1);
      }
    } else if (bodyBaseId === 'elder_robe') {
      // Manto do Ancião: Flowing sage tunic with wide ceremonial sleeves and golden runic stole
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      ctx.fillStyle = m;
      ctx.fillRect(11, 14, 10, 8);
      ctx.fillStyle = l;
      ctx.fillRect(12, 15, 8, 5);
      // Golden runic stole & sash
      ctx.fillStyle = '#fde047';
      ctx.fillRect(11, 20, 10, 2);
      if (dir === 'down') {
        ctx.fillRect(13, 14, 2, 7);
        ctx.fillRect(17, 14, 2, 7);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(15, 15, 2, 2);
      } else if (dir === 'up') {
        ctx.fillRect(13, 14, 6, 3);
        ctx.fillRect(15, 17, 2, 4);
      } else {
        ctx.fillRect(14, 14, 4, 7);
      }
      if (dir === 'down' || dir === 'up') {
        const sL = mountPose === 'none' ? stepL : 0;
        const sR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = m;
        ctx.fillRect(7, 14 + sL, 4, 6);
        ctx.fillRect(21, 14 + sR, 4, 6);
        ctx.fillStyle = d;
        ctx.fillRect(7, 18 + sL, 4, 2);
        ctx.fillRect(21, 18 + sR, 4, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(7, 19 + sL, 4, 1);
        ctx.fillRect(21, 19 + sR, 4, 1);
      }
    } else if (bodyBaseId === 'wanderer_poncho') {
      // Poncho de Andarilho: Layered frontier traveler poncho with fringed hem, compass clasp, and satchel strap
      const m = bodyColorDef.hex;
      const d = bodyColorDef.darkHex;
      const l = bodyColorDef.lightHex;
      ctx.fillStyle = m;
      ctx.fillRect(10, 14, 12, 8);
      ctx.fillStyle = l;
      ctx.fillRect(11, 15, 10, 5);
      // Leather collar & golden compass clasp
      ctx.fillStyle = '#78350f';
      ctx.fillRect(12, 14, 8, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(15, 14, 2, 2);
      // Poncho geometric border & lower fringe
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(10, 19, 12, 1);
      ctx.fillStyle = d;
      ctx.fillRect(10, 20, 12, 2);
      if (dir === 'down' || dir === 'up') {
        const sL = mountPose === 'none' ? stepL : 0;
        const sR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = m;
        ctx.fillRect(7, 14 + sL, 4, 5);
        ctx.fillRect(21, 14 + sR, 4, 5);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(7, 18 + sL, 4, 1);
        ctx.fillRect(21, 18 + sR, 4, 1);
      }
    } else if (bodyId === 'leather_tunic') {
      // ROBUST STUDDED LEATHER CUIRASS: Reinforced brown hide, sheep-wool collar, diagonal chest baldric & brass rivets
      ctx.fillStyle = '#92400e';
      ctx.fillRect(10, 14, 12, 8);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(10, 18, 12, 4);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(11, 14, 10, 1);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(10, 20, 12, 2);
      if (dir === 'down') {
        ctx.fillRect(12, 15, 2, 2);
        ctx.fillRect(14, 17, 2, 2);
        ctx.fillRect(16, 19, 2, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(11, 16, 1, 1);
        ctx.fillRect(20, 16, 1, 1);
        ctx.fillRect(11, 19, 1, 1);
        ctx.fillRect(20, 19, 1, 1);
        ctx.fillRect(15, 20, 2, 2);
      } else if (dir === 'up') {
        ctx.fillRect(15, 15, 2, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(13, 16, 1, 1);
        ctx.fillRect(18, 16, 1, 1);
      }
      if (dir === 'down' || dir === 'up') {
        const pL = mountPose === 'none' ? stepL : 0;
        const pR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = '#78350f';
        ctx.fillRect(7, 14 + pL, 4, 4);
        ctx.fillRect(21, 14 + pR, 4, 4);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(7, 14 + pL, 4, 2);
        ctx.fillRect(21, 14 + pR, 4, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(8, 15 + pL, 1, 1);
        ctx.fillRect(23, 15 + pR, 1, 1);
      }
    } else if (bodyId === 'iron_armor') {
      // HEAVY FORGED IRON BREASTPLATE
      ctx.fillStyle = '#64748b';
      ctx.fillRect(10, 14, 12, 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(11, 14, 10, 6);
      ctx.fillStyle = '#e2e8f0';
      if (dir === 'down') {
        ctx.fillRect(11, 15, 4, 3);
        ctx.fillRect(17, 15, 4, 3);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(12, 15, 2, 2);
        ctx.fillRect(18, 15, 2, 2);
        ctx.fillStyle = '#334155';
        ctx.fillRect(11, 18, 10, 1);
        ctx.fillRect(11, 20, 10, 1);
        ctx.fillRect(15, 15, 2, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(15, 19, 2, 2);
      } else if (dir === 'up') {
        ctx.fillRect(12, 15, 8, 3);
        ctx.fillStyle = '#334155';
        ctx.fillRect(15, 14, 2, 8);
        ctx.fillRect(11, 19, 10, 1);
      } else {
        ctx.fillRect(12, 15, 8, 3);
        ctx.fillStyle = '#334155';
        ctx.fillRect(11, 19, 10, 1);
      }
      if (dir === 'down' || dir === 'up') {
        const pL = mountPose === 'none' ? stepL : 0;
        const pR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = '#475569';
        ctx.fillRect(6, 13 + pL, 5, 5);
        ctx.fillRect(21, 13 + pR, 5, 5);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(7, 13 + pL, 4, 3);
        ctx.fillRect(21, 13 + pR, 4, 3);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(7, 13 + pL, 3, 1);
        ctx.fillRect(22, 13 + pR, 3, 1);
      }
    } else if (bodyId === 'astral_armor') {
      // SOVEREIGN ASTRAL CUIRASS
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(10, 14, 12, 8);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(11, 14, 10, 7);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(11, 14, 10, 1);
      ctx.fillRect(10, 20, 12, 2);
      if (dir === 'down') {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(14, 15, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(15, 16, 2, 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(11, 17, 3, 2);
        ctx.fillRect(18, 17, 3, 2);
      } else if (dir === 'up') {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(14, 15, 4, 5);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(15, 14, 2, 7);
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(13, 16, 6, 3);
      }
      if (dir === 'down' || dir === 'up') {
        const pL = mountPose === 'none' ? stepL : 0;
        const pR = mountPose === 'none' ? stepR : 0;
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(6, 12 + pL, 5, 5);
        ctx.fillRect(21, 12 + pR, 5, 5);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(6, 12 + pL, 4, 3);
        ctx.fillRect(22, 12 + pR, 4, 3);
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(6, 12 + pL, 2, 2);
        ctx.fillRect(24, 12 + pR, 2, 2);
      }
    }

    // If wearing Overalls AND NOT wearing body armor, Overalls upper bib & straps override the clothing top!
    if (legsBaseId === 'overalls' && !isBodyArmor) {
      drawOverallsUpperTorso();
    }

    // 5B. Side-Profile Foreground Arm (drawn AFTER torso/outfit so the character always has strictly 2 arms: 1 far + 1 near)
    if (dir === 'left' || dir === 'right') {
      const nearStep = mountPose === 'none' ? (dir === 'left' ? stepL : stepR) : 0;
      const nearX =
        dir === 'left'
          ? 14 - Math.round(nearStep * 0.5)
          : 15 + Math.round(nearStep * 0.5);

      // Base bare arm & hand in foreground
      ctx.fillStyle = skinBase;
      ctx.fillRect(nearX, 15 + nearStep, 3, 6);
      ctx.fillStyle = skinLight;
      ctx.fillRect(nearX + (dir === 'left' ? 0 : 1), 15 + nearStep, 2, 4);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(nearX, 20 + nearStep, 3, 1);

      if (
        bodyBaseId === 'sweater' ||
        bodyBaseId === 'merchant_doublet' ||
        bodyBaseId === 'elder_robe' ||
        bodyBaseId === 'wanderer_poncho'
      ) {
        // Full/draped sleeve covers the foreground arm in side profile
        ctx.fillStyle = bodyColorDef.hex;
        ctx.fillRect(nearX, 14 + nearStep, 3, 6);
        ctx.fillStyle = bodyColorDef.lightHex;
        ctx.fillRect(nearX + (dir === 'left' ? 0 : 1), 15 + nearStep, 2, 4);
        ctx.fillStyle =
          bodyBaseId === 'merchant_doublet' || bodyBaseId === 'elder_robe'
            ? '#fde047'
            : bodyBaseId === 'wanderer_poncho'
            ? '#fef08a'
            : bodyColorDef.darkHex;
        ctx.fillRect(nearX, 19 + nearStep, 3, 1);
      } else if (bodyBaseId === 'blacksmith_apron') {
        // Rolled-up workshop shirt sleeve on upper arm + bare muscular forearm
        ctx.fillStyle = '#475569';
        ctx.fillRect(nearX, 14 + nearStep, 3, 3);
      } else if (bodyId === 'leather_tunic') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(nearX - 1, 14 + nearStep, 5, 4);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(nearX, 14 + nearStep, 3, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(nearX + 1, 15 + nearStep, 1, 1);
      } else if (bodyId === 'iron_armor') {
        ctx.fillStyle = '#475569';
        ctx.fillRect(nearX - 1, 13 + nearStep, 5, 5);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(nearX, 13 + nearStep, 3, 3);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(nearX, 13 + nearStep, 2, 1);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(nearX, 18 + nearStep, 3, 2);
      } else if (bodyId === 'astral_armor') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(nearX - 1, 12 + nearStep, 5, 5);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(nearX, 12 + nearStep, 4, 3);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(nearX, 17 + nearStep, 3, 3);
      }
    }

    // If wearing Short Dress, Long Dress, or Elder Robe, draw the lower skirt/robe BEFORE leg armor so leg armor overrides it if equipped!
    if (bodyBaseId === 'short_dress') {
      drawDressLowerSkirt(false);
    } else if (bodyBaseId === 'long_dress' || bodyBaseId === 'elder_robe') {
      drawDressLowerSkirt(true);
      if (bodyBaseId === 'elder_robe' && mountPose === 'none') {
        // Golden ceremonial center stole & bottom hem border on Elder Robe
        ctx.fillStyle = '#fde047';
        ctx.fillRect(15, 22, 2, 5);
        ctx.fillRect(9, 27, 14, 1);
      }
    }

    // 6. Equipped LEGS Garments (Bermuda, Calça, Macacão, Calça de Alfaiataria, Perneiras, or Robust Armor Greaves/Pants)
    if (legsBaseId === 'shorts') {
      // Bermuda (any of the 17 colors, including brown_shorts): knee-length shorts leaving lower calves bare
      const m = legsColorDef.hex;
      const d = legsColorDef.darkHex;
      const l = legsColorDef.lightHex;
      if (mountPose === 'none') {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(11, 21, 10, 1);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(15, 21, 2, 1);
        ctx.fillStyle = m;
        ctx.fillRect(11, 22, 10, 2);
        ctx.fillRect(11, 24, 4, 2);
        ctx.fillRect(17, 24, 4, 2);
        ctx.fillStyle = l;
        ctx.fillRect(12, 22, 2, 3);
        ctx.fillRect(18, 22, 2, 3);
        ctx.fillStyle = d;
        ctx.fillRect(11, 25, 4, 1);
        ctx.fillRect(17, 25, 4, 1);
      } else if (mountPose === 'horse') {
        ctx.fillStyle = m;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 22, 8, 3);
        } else {
          ctx.fillRect(7, 22, 4, 3);
          ctx.fillRect(21, 22, 4, 3);
        }
      }
    } else if (
      legsBaseId === 'pants' ||
      legsBaseId === 'overalls' ||
      legsBaseId === 'merchant_slacks' ||
      legsBaseId === 'wanderer_leggings'
    ) {
      // Calça, Macacão, Calça de Alfaiataria or Perneiras de Caminhante: full-length pants covering legs down to ankles (y=21..27)
      const m = legsColorDef.hex;
      const d = legsColorDef.darkHex;
      const l = legsColorDef.lightHex;
      if (mountPose === 'none') {
        if (legsBaseId === 'overalls') {
          // Overalls waist seam & brass side buttons
          ctx.fillStyle = d;
          ctx.fillRect(11, 21, 10, 1);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(11, 21, 1, 1);
          ctx.fillRect(20, 21, 1, 1);
        } else if (legsBaseId === 'merchant_slacks') {
          ctx.fillStyle = '#fde047';
          ctx.fillRect(11, 21, 10, 1);
        } else {
          ctx.fillStyle = '#451a03';
          ctx.fillRect(11, 21, 10, 1);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(15, 21, 2, 1);
        }
        ctx.fillStyle = m;
        ctx.fillRect(11, 22, 10, 2);
        ctx.fillRect(11, 24, 4, 3);
        ctx.fillRect(17, 24, 4, 3);
        ctx.fillStyle = l;
        ctx.fillRect(12, 22, 2, 4);
        ctx.fillRect(18, 22, 2, 4);
        ctx.fillStyle = d;
        ctx.fillRect(14, 24, 1, 3);
        ctx.fillRect(17, 24, 1, 3);
        if (legsBaseId === 'merchant_slacks') {
          // Gold-trimmed cuffs
          ctx.fillStyle = '#fde047';
          ctx.fillRect(11, 26, 4, 1);
          ctx.fillRect(17, 26, 4, 1);
        } else if (legsBaseId === 'wanderer_leggings') {
          // Strapped leather knee & shin wraps
          ctx.fillStyle = '#78350f';
          ctx.fillRect(11, 24, 4, 1);
          ctx.fillRect(17, 24, 4, 1);
          ctx.fillRect(11, 26, 4, 1);
          ctx.fillRect(17, 26, 4, 1);
        } else {
          ctx.fillRect(11, 26, 4, 1);
          ctx.fillRect(17, 26, 4, 1);
        }
      } else if (mountPose === 'horse') {
        ctx.fillStyle = m;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 22, 9, 4);
        } else {
          ctx.fillRect(7, 22, 4, 4);
          ctx.fillRect(21, 22, 4, 4);
        }
      }
    } else if (isLegsArmor) {
      let legsMain = '#854d0e';
      let legsShadow = '#713f12';
      let legsKnee = '#ca8a04';
      let kneeRivet = '#fef08a';
      let beltColor = '#451a03';
      let buckleColor = '#fbbf24';
      if (legsId === 'iron_greaves') {
        legsMain = '#64748b';
        legsShadow = '#334155';
        legsKnee = '#e2e8f0';
        kneeRivet = '#ffffff';
        beltColor = '#1e293b';
        buckleColor = '#fbbf24';
      } else if (legsId === 'astral_leggings') {
        legsMain = '#0284c7';
        legsShadow = '#0369a1';
        legsKnee = '#fde047';
        kneeRivet = '#38bdf8';
        beltColor = '#082f49';
        buckleColor = '#fde047';
      }

      if (mountPose === 'none') {
        ctx.fillStyle = beltColor;
        ctx.fillRect(10, 21, 12, 2);
        ctx.fillStyle = buckleColor;
        ctx.fillRect(14, 21, 4, 2);
        ctx.fillStyle = legsMain;
        ctx.fillRect(11, 23, 10, 1);
        ctx.fillRect(10, 24, 5, 3);
        ctx.fillRect(17, 24, 5, 3);
        ctx.fillStyle = legsShadow;
        ctx.fillRect(14, 24, 1, 3);
        ctx.fillRect(17, 24, 1, 3);
        ctx.fillStyle = legsKnee;
        ctx.fillRect(11, 24, 3, 2);
        ctx.fillRect(18, 24, 3, 2);
        ctx.fillStyle = kneeRivet;
        ctx.fillRect(12, 24, 1, 1);
        ctx.fillRect(19, 24, 1, 1);
      } else if (mountPose === 'horse') {
        ctx.fillStyle = legsMain;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 22, 9, 4);
          ctx.fillStyle = legsKnee;
          ctx.fillRect(16, 23, 3, 2);
        } else {
          ctx.fillRect(7, 22, 4, 4);
          ctx.fillRect(21, 22, 4, 4);
          ctx.fillStyle = legsKnee;
          ctx.fillRect(7, 23, 3, 2);
          ctx.fillRect(22, 23, 3, 2);
        }
      }
    }

    // 7. Equipped FEET / Boots (Sandália, Bota de Vaqueiro, or Robust Armored Sabatons)
    if (feetBaseId === 'sandals') {
      const m = feetColorDef.hex;
      const d = feetColorDef.darkHex;
      if (mountPose === 'none') {
        const leftFootY = 27 + Math.max(0, stepL);
        const rightFootY = 27 + Math.max(0, stepR);
        // Leather sandal sole
        ctx.fillStyle = d;
        ctx.fillRect(10, leftFootY + 1, 4, 1);
        ctx.fillRect(18, rightFootY + 1, 4, 1);
        // Open-toe leather straps (leaving bare toes visible)
        ctx.fillStyle = m;
        ctx.fillRect(11, leftFootY, 2, 1);
        ctx.fillRect(18, rightFootY, 2, 1);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(11, leftFootY, 1, 1);
        ctx.fillRect(19, rightFootY, 1, 1);
      } else if (mountPose === 'horse') {
        ctx.fillStyle = m;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 27, 4, 1);
        } else {
          ctx.fillRect(7, 27, 3, 1);
          ctx.fillRect(22, 27, 3, 1);
        }
      }
    } else if (feetBaseId === 'cowboy_boots' || feetBaseId === 'blacksmith_boots') {
      const m = feetColorDef.hex;
      const d = feetColorDef.darkHex;
      const l = feetColorDef.lightHex;
      if (mountPose === 'none') {
        const leftBootY = 25 + Math.max(0, stepL);
        const rightBootY = 25 + Math.max(0, stepR);
        // Tall boot shaft
        ctx.fillStyle = m;
        ctx.fillRect(10, leftBootY, 5, 4);
        ctx.fillRect(17, rightBootY, 5, 4);
        ctx.fillStyle = l;
        ctx.fillRect(10, leftBootY, 2, 3);
        ctx.fillRect(19, rightBootY, 2, 3);
        if (feetBaseId === 'blacksmith_boots') {
          // Iron-plated toe caps & brass cuff rivet for Botas de Forja
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(10, leftBootY + 2, 3, 1);
          ctx.fillRect(19, rightBootY + 2, 3, 1);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(12, leftBootY, 1, 1);
          ctx.fillRect(19, rightBootY, 1, 1);
        } else {
          // Western golden embroidery stitch & spur stud
          ctx.fillStyle = '#fde047';
          ctx.fillRect(12, leftBootY + 1, 1, 1);
          ctx.fillRect(19, rightBootY + 1, 1, 1);
        }
        // Dark angled riding/forge heel & sole
        ctx.fillStyle = d;
        ctx.fillRect(10, leftBootY + 3, 5, 1);
        ctx.fillRect(17, rightBootY + 3, 5, 1);
      } else if (mountPose === 'horse') {
        ctx.fillStyle = m;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 25, 5, 3);
          ctx.fillStyle = d;
          ctx.fillRect(11, 27, 5, 1);
        } else {
          ctx.fillRect(7, 25, 4, 3);
          ctx.fillRect(21, 25, 4, 3);
        }
      }
    } else if (
      feetId === 'leather_boots' ||
      feetId === 'iron_boots' ||
      feetId === 'astral_boots'
    ) {
      let bootsMain = '#78350f';
      let bootsTrim = '#fef3c7';
      let bootsSole = '#291305';
      let bootsBuckle = '#fbbf24';
      let bootsWing: string | null = null;
      if (feetId === 'iron_boots') {
        bootsMain = '#94a3b8';
        bootsTrim = '#f8fafc';
        bootsSole = '#1e293b';
        bootsBuckle = '#cbd5e1';
      } else if (feetId === 'astral_boots') {
        bootsMain = '#0284c7';
        bootsTrim = '#fde047';
        bootsSole = '#b45309';
        bootsBuckle = '#38bdf8';
        bootsWing = '#fef9c3';
      }

      if (mountPose === 'none') {
        const leftBootY = 26 + Math.max(0, stepL);
        const rightBootY = 26 + Math.max(0, stepR);
        ctx.fillStyle = bootsMain;
        ctx.fillRect(10, leftBootY, 5, 3);
        ctx.fillRect(17, rightBootY, 5, 3);
        ctx.fillStyle = bootsTrim;
        ctx.fillRect(10, leftBootY, 5, 1);
        ctx.fillRect(17, rightBootY, 5, 1);
        ctx.fillStyle = bootsBuckle;
        ctx.fillRect(11, leftBootY + 1, 2, 1);
        ctx.fillRect(19, rightBootY + 1, 2, 1);
        ctx.fillStyle = bootsSole;
        ctx.fillRect(10, leftBootY + 2, 5, 1);
        ctx.fillRect(17, rightBootY + 2, 5, 1);
        if (bootsWing) {
          ctx.fillStyle = bootsWing;
          ctx.fillRect(8, leftBootY - 1, 2, 3);
          ctx.fillRect(22, rightBootY - 1, 2, 3);
        }
      } else if (mountPose === 'horse') {
        ctx.fillStyle = bootsMain;
        if (dir === 'left' || dir === 'right') {
          ctx.fillRect(11, 26, 5, 2);
          ctx.fillStyle = bootsTrim;
          ctx.fillRect(11, 26, 5, 1);
        } else {
          ctx.fillRect(7, 26, 4, 2);
          ctx.fillRect(21, 26, 4, 2);
          ctx.fillStyle = bootsTrim;
          ctx.fillRect(7, 26, 4, 1);
          ctx.fillRect(21, 26, 4, 1);
        }
      }
    }

    // 8. Head, Ears & Multi-tone Facial Skin (drawn on headCtx so head stays 1.0x)
    ctx = headCtx;
    ctx.fillStyle = skinBase;
    ctx.fillRect(10, 4, 12, 9);
    // Forehead highlight & jawline shadow
    ctx.fillStyle = skinLight;
    ctx.fillRect(11, 4, 10, 2);
    ctx.fillStyle = skinShadow;
    ctx.fillRect(11, 12, 10, 1);

    // Ears
    if (dir === 'down' || dir === 'up') {
      ctx.fillStyle = skinBase;
      ctx.fillRect(8, 7, 2, 3);
      ctx.fillRect(22, 7, 2, 3);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(8, 8, 1, 2);
      ctx.fillRect(23, 8, 1, 2);
    } else if (dir === 'left') {
      ctx.fillStyle = skinBase;
      ctx.fillRect(16, 7, 2, 3);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(17, 8, 1, 2);
    } else if (dir === 'right') {
      ctx.fillStyle = skinBase;
      ctx.fillRect(14, 7, 2, 3);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(14, 8, 1, 2);
    }

    // Subtle nose / cheek blush
    if (dir === 'down') {
      ctx.fillStyle = skinShadow;
      ctx.fillRect(15, 9, 2, 1); // nose tip shadow
      if (isFeminine) {
        ctx.fillStyle = 'rgba(244, 114, 182, 0.35)';
        ctx.fillRect(10, 10, 2, 1);
        ctx.fillRect(20, 10, 2, 1);
      }
    }

    // 9. SKIN MARKS: Freckles (Sardas) & Eye Scar (Cicatriz no Olho)
    if (skinMark === 'freckles' || skinMark === 'freckles_and_scar') {
      ctx.fillStyle = freckleTone;
      if (dir === 'down') {
        // Freckles across cheeks and nose bridge
        ctx.fillRect(11, 10, 1, 1);
        ctx.fillRect(13, 11, 1, 1);
        ctx.fillRect(15, 9, 1, 1);
        ctx.fillRect(16, 10, 1, 1);
        ctx.fillRect(18, 11, 1, 1);
        ctx.fillRect(20, 10, 1, 1);
      } else if (dir === 'left') {
        ctx.fillRect(10, 10, 1, 1);
        ctx.fillRect(12, 11, 1, 1);
        ctx.fillRect(14, 10, 1, 1);
      } else if (dir === 'right') {
        ctx.fillRect(17, 10, 1, 1);
        ctx.fillRect(19, 11, 1, 1);
        ctx.fillRect(21, 10, 1, 1);
      }
    }

    if (skinMark === 'eye_scar' || skinMark === 'freckles_and_scar') {
      if (dir === 'down') {
        // Vertical battle scar over viewer-right eye (x=19..20)
        ctx.fillStyle = '#9f1239';
        ctx.fillRect(19, 5, 1, 2);
        ctx.fillRect(19, 10, 1, 3);
        ctx.fillStyle = '#fda4af';
        ctx.fillRect(20, 5, 1, 2);
        ctx.fillRect(20, 10, 1, 2);
      } else if (dir === 'right') {
        ctx.fillStyle = '#9f1239';
        ctx.fillRect(19, 5, 1, 2);
        ctx.fillRect(19, 10, 1, 3);
        ctx.fillStyle = '#fda4af';
        ctx.fillRect(18, 10, 1, 2);
      }
    }

    if (skinMark === 'beard_stubble') {
      // Barba Cerrada: Jawline & chin 5 o'clock shadow
      ctx.fillStyle = 'rgba(30, 41, 59, 0.42)';
      if (dir === 'down') {
        ctx.fillRect(10, 10, 12, 3);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fillRect(11, 12, 10, 1);
        ctx.fillRect(14, 10, 4, 1);
        ctx.fillStyle = skinBase;
        ctx.fillRect(14, 11, 4, 1);
      } else if (dir === 'left') {
        ctx.fillRect(10, 10, 6, 3);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fillRect(10, 12, 5, 1);
      } else if (dir === 'right') {
        ctx.fillRect(16, 10, 6, 3);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fillRect(17, 12, 5, 1);
      }
    } else if (skinMark === 'elder_wrinkles') {
      // Rugas Sábias: Forehead wisdom lines & cheek creases
      ctx.fillStyle = skinDeep;
      if (dir === 'down') {
        ctx.fillRect(13, 5, 6, 1);
        ctx.fillRect(11, 10, 1, 2);
        ctx.fillRect(20, 10, 1, 2);
      } else if (dir === 'left') {
        ctx.fillRect(11, 5, 3, 1);
        ctx.fillRect(12, 10, 1, 2);
      } else if (dir === 'right') {
        ctx.fillRect(18, 5, 3, 1);
        ctx.fillRect(19, 10, 1, 2);
      }
    }

    // 10. EYES: 8 Distinct Shape Variants (classic, sharp, large, calm, fierce, mystic, wise, veteran)
    const drawEyePairDown = () => {
      // Left eye at x=11..13, Right eye at x=18..20, y=7..9
      if (eyeStyle === 'sharp') {
        // Narrow hunter eyes with sharp outer wing
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(10, 7, 4, 1);
        ctx.fillRect(18, 7, 4, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 8, 3, 2);
        ctx.fillRect(18, 8, 3, 2);
        ctx.fillStyle = eyeMain;
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 8, 1, 1);
        ctx.fillRect(18, 8, 1, 1);
      } else if (eyeStyle === 'large') {
        // Large expressive anime/RPG eyes (3x4) with dual glints
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 6, 3, 1);
        ctx.fillRect(18, 6, 3, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 7, 3, 3);
        ctx.fillRect(18, 7, 3, 3);
        ctx.fillStyle = eyeDark;
        ctx.fillRect(12, 7, 2, 3);
        ctx.fillRect(18, 7, 2, 3);
        ctx.fillStyle = eyeMain;
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);
        ctx.fillStyle = eyeLight;
        ctx.fillRect(13, 9, 1, 1);
        ctx.fillRect(19, 9, 1, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 7, 1, 1);
        ctx.fillRect(18, 7, 1, 1);
      } else if (eyeStyle === 'calm') {
        // Gentle half-lidded serene eyes
        ctx.fillStyle = skinShadow;
        ctx.fillRect(11, 6, 3, 1);
        ctx.fillRect(18, 6, 3, 1);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 7, 3, 1);
        ctx.fillRect(18, 7, 3, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 8, 3, 2);
        ctx.fillRect(18, 8, 3, 2);
        ctx.fillStyle = eyeMain;
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);
        ctx.fillStyle = eyeLight;
        ctx.fillRect(12, 9, 2, 1);
        ctx.fillRect(18, 9, 2, 1);
      } else if (eyeStyle === 'fierce') {
        // Determined warrior eyes with angled inner brows
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 6, 2, 1);
        ctx.fillRect(13, 7, 1, 1);
        ctx.fillRect(18, 7, 1, 1);
        ctx.fillRect(19, 6, 2, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 8, 3, 2);
        ctx.fillRect(18, 8, 3, 2);
        ctx.fillStyle = eyeDark;
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);
        ctx.fillStyle = eyeLight;
        ctx.fillRect(12, 8, 1, 1);
        ctx.fillRect(18, 8, 1, 1);
      } else if (eyeStyle === 'mystic') {
        // Arcane eyes with glowing center pupil
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 6, 3, 1);
        ctx.fillRect(18, 6, 3, 1);
        ctx.fillStyle = eyeDark;
        ctx.fillRect(11, 7, 3, 3);
        ctx.fillRect(18, 7, 3, 3);
        ctx.fillStyle = eyeMain;
        ctx.fillRect(11, 8, 3, 2);
        ctx.fillRect(18, 8, 3, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 7, 1, 2);
        ctx.fillRect(19, 7, 1, 2);
        ctx.fillStyle = eyeLight;
        ctx.fillRect(12, 9, 1, 1);
        ctx.fillRect(19, 9, 1, 1);
      } else if (eyeStyle === 'wise') {
        // Sábio: Expressive arched sage brows & warm deep gaze
        ctx.fillStyle = hairMain;
        ctx.fillRect(10, 6, 4, 1);
        ctx.fillRect(18, 6, 4, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 7, 3, 2);
        ctx.fillRect(18, 7, 3, 2);
        ctx.fillStyle = eyeMain;
        ctx.fillRect(12, 7, 2, 2);
        ctx.fillRect(18, 7, 2, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(12, 7, 1, 1);
        ctx.fillRect(18, 7, 1, 1);
        ctx.fillStyle = skinShadow;
        ctx.fillRect(11, 9, 3, 1);
        ctx.fillRect(18, 9, 3, 1);
      } else if (eyeStyle === 'veteran') {
        // Veterano: Heavy stern guardian brow & focused steel iris
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(10, 6, 4, 2);
        ctx.fillRect(18, 6, 4, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 8, 3, 2);
        ctx.fillRect(18, 8, 3, 2);
        ctx.fillStyle = eyeDark;
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(13, 8, 1, 1);
        ctx.fillRect(19, 8, 1, 1);
      } else {
        // 'classic': Balanced 3x3 RPG eyes
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(11, 6, 3, 1);
        ctx.fillRect(18, 6, 3, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 7, 3, 3);
        ctx.fillRect(18, 7, 3, 3);
        ctx.fillStyle = eyeDark;
        ctx.fillRect(12, 7, 2, 3);
        ctx.fillRect(18, 7, 2, 3);
        ctx.fillStyle = eyeMain;
        ctx.fillRect(12, 8, 2, 2);
        ctx.fillRect(18, 8, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(12, 7, 1, 1);
        ctx.fillRect(18, 7, 1, 1);
      }
      if (isFeminine) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(10, 7, 1, 1);
        ctx.fillRect(21, 7, 1, 1);
      }
    };

    if (dir === 'down') {
      drawEyePairDown();
    } else if (dir === 'left') {
      const eyeH = eyeStyle === 'large' ? 3 : 2;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(10, 6, 3, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, 7, 3, eyeH);
      ctx.fillStyle = eyeMain;
      ctx.fillRect(10, 7, 2, eyeH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, 7, 1, 1);
      if (isFeminine) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(13, 7, 1, 1);
      }
    } else if (dir === 'right') {
      const eyeH = eyeStyle === 'large' ? 3 : 2;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(19, 6, 3, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(19, 7, 3, eyeH);
      ctx.fillStyle = eyeMain;
      ctx.fillRect(20, 7, 2, eyeH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(21, 7, 1, 1);
      if (isFeminine) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(18, 7, 1, 1);
      }
    }

    // 11. HAIRSTYLES: 10 Detailed Multi-Tone Styles Responsive to Every Direction (down, up, left, right)
    if ((hStyle as string) !== 'SamuraiPreview') {
      // Base crown & directional skull coverage
      ctx.fillStyle = hairMain;
      ctx.fillRect(9, 2, 14, 3);
      ctx.fillStyle = hairHighlight;
      ctx.fillRect(11, 2, 10, 1);

      if (dir === 'up') {
        // Full back-of-head hair coverage with vertical strand shading
        ctx.fillStyle = hairMain;
        ctx.fillRect(9, 3, 14, 10);
        ctx.fillStyle = hairShadow;
        ctx.fillRect(9, 9, 14, 4);
        ctx.fillRect(11, 4, 1, 8);
        ctx.fillRect(15, 4, 2, 8);
        ctx.fillRect(20, 4, 1, 8);
        ctx.fillStyle = hairHighlight;
        ctx.fillRect(11, 3, 10, 2);
      } else if (dir === 'left') {
        // Back & crown coverage on right side of head (x=14..23)
        ctx.fillStyle = hairMain;
        ctx.fillRect(14, 3, 9, 9);
        ctx.fillStyle = hairShadow;
        ctx.fillRect(17, 6, 6, 6);
        ctx.fillStyle = hairHighlight;
        ctx.fillRect(12, 3, 8, 1);
      } else if (dir === 'right') {
        // Back & crown coverage on left side of head (x=9..18)
        ctx.fillStyle = hairMain;
        ctx.fillRect(9, 3, 9, 9);
        ctx.fillStyle = hairShadow;
        ctx.fillRect(9, 6, 6, 6);
        ctx.fillStyle = hairHighlight;
        ctx.fillRect(12, 3, 8, 1);
      }

      // Style-specific directional sculpting
      if (hStyle === 'warrior_crest') {
        // Tall spartan/warrior mohawk crest
        ctx.fillStyle = hairDeep;
        if (dir === 'down' || dir === 'up') {
          ctx.fillRect(13, 0, 6, 3);
          ctx.fillStyle = hairMain;
          ctx.fillRect(14, 0, 4, 5);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(15, 0, 2, 3);
          if (dir === 'up') {
            ctx.fillStyle = hairDeep;
            ctx.fillRect(14, 4, 4, 10);
          }
        } else {
          // Sweeping side crest profile!
          ctx.fillRect(10, 0, 12, 3);
          ctx.fillStyle = hairMain;
          ctx.fillRect(11, 0, 10, 3);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(12, 0, 7, 1);
        }
      } else if (hStyle === 'long_mane') {
        if (dir === 'down') {
          // Side bangs & long shoulder-draping locks
          ctx.fillStyle = hairMain;
          ctx.fillRect(8, 3, 3, 13);
          ctx.fillRect(21, 3, 3, 13);
          ctx.fillRect(10, 4, 3, 2);
          ctx.fillRect(19, 4, 3, 2);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(8, 10, 2, 6);
          ctx.fillRect(22, 10, 2, 6);
        } else if (dir === 'up') {
          // Long flowing cape of hair down the back
          ctx.fillStyle = hairDeep;
          ctx.fillRect(8, 4, 16, 15);
          ctx.fillStyle = hairMain;
          ctx.fillRect(9, 3, 14, 14);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(11, 7, 2, 10);
          ctx.fillRect(15, 8, 2, 9);
          ctx.fillRect(19, 7, 2, 10);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(11, 4, 10, 2);
        } else if (dir === 'left') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(9, 4, 3, 2); // Front temple bang
          ctx.fillRect(14, 3, 10, 15); // Long mane cascading down right/back
          ctx.fillStyle = hairShadow;
          ctx.fillRect(16, 9, 7, 9);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(14, 4, 6, 2);
        } else if (dir === 'right') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(20, 4, 3, 2);
          ctx.fillRect(8, 3, 10, 15);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(9, 9, 7, 9);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(12, 4, 6, 2);
        }
      } else if (hStyle === 'braided') {
        // Nordic braids with golden clasps
        if (dir === 'down') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(8, 3, 3, 6);
          ctx.fillRect(21, 3, 3, 6);
          // Braided segments over shoulders
          ctx.fillRect(7, 8, 3, 9);
          ctx.fillRect(22, 8, 3, 9);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(7, 9, 3, 1);
          ctx.fillRect(7, 11, 3, 1);
          ctx.fillRect(7, 13, 3, 1);
          ctx.fillRect(22, 9, 3, 1);
          ctx.fillRect(22, 11, 3, 1);
          ctx.fillRect(22, 13, 3, 1);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(7, 15, 3, 1);
          ctx.fillRect(22, 15, 3, 1);
        } else if (dir === 'up') {
          ctx.fillStyle = hairShadow;
          ctx.fillRect(15, 3, 2, 9); // Center parting
          ctx.fillStyle = hairMain;
          ctx.fillRect(8, 8, 4, 10);
          ctx.fillRect(20, 8, 4, 10);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(8, 16, 4, 1);
          ctx.fillRect(20, 16, 4, 1);
        } else if (dir === 'left') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(15, 6, 4, 11);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(15, 8, 4, 1);
          ctx.fillRect(15, 10, 4, 1);
          ctx.fillRect(15, 12, 4, 1);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(15, 15, 4, 1);
        } else if (dir === 'right') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(13, 6, 4, 11);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(13, 8, 4, 1);
          ctx.fillRect(13, 10, 4, 1);
          ctx.fillRect(13, 12, 4, 1);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(13, 15, 4, 1);
        }
      } else if (hStyle === 'ponytail') {
        if (dir === 'down') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(9, 3, 4, 3);
          ctx.fillRect(19, 3, 4, 3);
          ctx.fillRect(13, 3, 6, 2);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(14, 1, 4, 1);
        } else if (dir === 'up') {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(14, 5, 4, 2);
          ctx.fillStyle = hairDeep;
          ctx.fillRect(12, 7, 8, 10);
          ctx.fillStyle = hairMain;
          ctx.fillRect(13, 7, 6, 9);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(15, 7, 2, 6);
        } else if (dir === 'left') {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(22, 4, 2, 3);
          ctx.fillStyle = hairMain;
          ctx.fillRect(24, 4, 4, 4);
          ctx.fillRect(25, 7, 4, 6);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(25, 10, 3, 3);
        } else if (dir === 'right') {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(8, 4, 2, 3);
          ctx.fillStyle = hairMain;
          ctx.fillRect(4, 4, 4, 4);
          ctx.fillRect(3, 7, 4, 6);
          ctx.fillStyle = hairShadow;
          ctx.fillRect(4, 10, 3, 3);
        }
      } else if (hStyle === 'twin_tails') {
        // Dual high pigtails with crimson ribbons
        ctx.fillStyle = '#f43f5e';
        if (dir !== 'left') ctx.fillRect(7, 4, 2, 2);
        if (dir !== 'right') ctx.fillRect(23, 4, 2, 2);
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(9, 3, 14, 2);
          ctx.fillRect(11, 5, 3, 1);
          ctx.fillRect(18, 5, 3, 1);
        } else if (dir === 'left') {
          ctx.fillRect(19, 5, 5, 11);
          ctx.fillStyle = '#f43f5e';
          ctx.fillRect(19, 4, 3, 2);
        } else if (dir === 'right') {
          ctx.fillRect(8, 5, 5, 11);
          ctx.fillStyle = '#f43f5e';
          ctx.fillRect(10, 4, 3, 2);
        }
      } else if (hStyle === 'curly_crown') {
        // Voluminous textured curly halo
        ctx.fillStyle = hairDeep;
        ctx.fillRect(7, 0, 18, 5);
        ctx.fillRect(6, 3, 4, 8);
        ctx.fillRect(22, 3, 4, 8);
        ctx.fillStyle = hairMain;
        ctx.fillRect(8, 1, 16, 4);
        ctx.fillRect(7, 3, 3, 6);
        ctx.fillRect(22, 3, 3, 6);
        ctx.fillStyle = hairHighlight;
        ctx.fillRect(10, 1, 3, 2);
        ctx.fillRect(15, 1, 3, 2);
        ctx.fillRect(20, 2, 2, 2);
        if (dir === 'up') {
          ctx.fillStyle = hairDeep;
          ctx.fillRect(6, 2, 20, 12);
          ctx.fillStyle = hairMain;
          ctx.fillRect(7, 2, 18, 10);
        }
      } else if (hStyle === 'samurai_bun') {
        // Topknot bun bound with gold cord + sharp temple locks
        ctx.fillStyle = hairDeep;
        ctx.fillRect(13, 0, 6, 3);
        ctx.fillStyle = hairMain;
        ctx.fillRect(14, 0, 4, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(13, 2, 6, 1);
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(9, 4, 2, 6);
          ctx.fillRect(21, 4, 2, 6);
        } else if (dir === 'left') {
          ctx.fillRect(16, 0, 5, 3);
          ctx.fillRect(10, 4, 2, 5);
        } else if (dir === 'right') {
          ctx.fillRect(11, 0, 5, 3);
          ctx.fillRect(20, 4, 2, 5);
        }
      } else if (hStyle === 'noble_waves') {
        // Side-parted royal waves
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(9, 3, 8, 3);
          ctx.fillRect(11, 5, 4, 1);
          ctx.fillRect(20, 3, 3, 8);
          ctx.fillRect(8, 4, 2, 6);
        } else if (dir === 'left') {
          ctx.fillRect(9, 3, 6, 3);
          ctx.fillRect(15, 3, 8, 10);
        } else if (dir === 'right') {
          ctx.fillRect(17, 3, 6, 3);
          ctx.fillRect(9, 3, 8, 10);
        }
      } else if (hStyle === 'valkyrie_bangs') {
        // Straight fringe + golden crown braid + long side framing locks
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(10, 3, 12, 3);
          ctx.fillRect(13, 5, 6, 1);
          ctx.fillRect(8, 4, 2, 12);
          ctx.fillRect(22, 4, 2, 12);
        } else if (dir === 'left') {
          ctx.fillRect(9, 3, 4, 3);
          ctx.fillRect(12, 5, 2, 10);
        } else if (dir === 'right') {
          ctx.fillRect(19, 3, 4, 3);
          ctx.fillRect(18, 5, 2, 10);
        }
        ctx.fillStyle = '#fde047';
        ctx.fillRect(10, 3, 12, 1);
      } else if (hStyle === 'blacksmith_beard') {
        // Barba de Forja: Swept forge hair + thick braided smith beard with brass ring
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(9, 3, 14, 3);
          ctx.fillRect(9, 6, 2, 6);
          ctx.fillRect(21, 6, 2, 6);
          // Full smith mustache & braided beard
          ctx.fillStyle = hairShadow;
          ctx.fillRect(10, 10, 12, 4);
          ctx.fillStyle = hairMain;
          ctx.fillRect(11, 11, 10, 4);
          ctx.fillRect(13, 14, 6, 3);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(14, 15, 4, 1);
        } else if (dir === 'left') {
          ctx.fillRect(9, 3, 5, 2);
          ctx.fillRect(10, 10, 6, 5);
          ctx.fillRect(9, 12, 4, 4);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(10, 14, 3, 1);
        } else if (dir === 'right') {
          ctx.fillRect(18, 3, 5, 2);
          ctx.fillRect(16, 10, 6, 5);
          ctx.fillRect(19, 12, 4, 4);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(19, 14, 3, 1);
        }
      } else if (hStyle === 'elder_sage') {
        // Sábio Ancião: Venerable flowing temple locks & long sage beard
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(8, 3, 3, 12);
          ctx.fillRect(21, 3, 3, 12);
          // Flowing mustache & long venerable beard
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(11, 10, 10, 2);
          ctx.fillStyle = hairMain;
          ctx.fillRect(11, 11, 10, 5);
          ctx.fillRect(12, 15, 8, 3);
          ctx.fillRect(14, 17, 4, 2);
        } else if (dir === 'up') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(8, 3, 16, 14);
          ctx.fillStyle = hairHighlight;
          ctx.fillRect(11, 4, 10, 3);
        } else if (dir === 'left') {
          ctx.fillRect(14, 3, 9, 13);
          ctx.fillRect(9, 10, 6, 6);
          ctx.fillRect(8, 13, 5, 5);
        } else if (dir === 'right') {
          ctx.fillRect(9, 3, 9, 13);
          ctx.fillRect(17, 10, 6, 6);
          ctx.fillRect(19, 13, 5, 5);
        }
      } else if (hStyle === 'merchant_crown') {
        // Trança Mercante: Elegant braided crown updo with golden hairpins & curled side locks
        ctx.fillStyle = hairDeep;
        ctx.fillRect(10, 0, 12, 3);
        ctx.fillStyle = hairMain;
        ctx.fillRect(9, 1, 14, 4);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(11, 2, 2, 1);
        ctx.fillRect(15, 1, 2, 1);
        ctx.fillRect(19, 2, 2, 1);
        if (dir === 'down') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(8, 4, 2, 8);
          ctx.fillRect(22, 4, 2, 8);
        } else if (dir === 'left') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(10, 4, 2, 7);
        } else if (dir === 'right') {
          ctx.fillStyle = hairMain;
          ctx.fillRect(20, 4, 2, 7);
        }
      } else if (hStyle === 'nomad_wind') {
        // Vento Nômade: Wind-swept frontier locks with leather brow band
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(8, 2, 16, 4);
          ctx.fillRect(7, 4, 3, 7);
          ctx.fillRect(21, 4, 4, 6);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(9, 5, 14, 1);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(15, 5, 2, 1);
        } else if (dir === 'left') {
          ctx.fillRect(9, 2, 15, 4);
          ctx.fillRect(16, 5, 9, 7);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(10, 5, 12, 1);
        } else if (dir === 'right') {
          ctx.fillRect(8, 2, 15, 4);
          ctx.fillRect(7, 5, 9, 7);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(10, 5, 12, 1);
        }
      } else {
        // 'adventurer': Classic layered spiky fringe
        ctx.fillStyle = hairMain;
        if (dir === 'down') {
          ctx.fillRect(9, 3, 3, 4);
          ctx.fillRect(20, 3, 3, 4);
          ctx.fillRect(11, 3, 4, 3);
          ctx.fillRect(17, 3, 4, 3);
          ctx.fillRect(13, 5, 2, 1);
          ctx.fillRect(18, 5, 2, 1);
        } else if (dir === 'left') {
          ctx.fillRect(8, 3, 5, 3);
          ctx.fillRect(9, 5, 3, 1);
          ctx.fillRect(21, 5, 3, 4);
        } else if (dir === 'right') {
          ctx.fillRect(19, 3, 5, 3);
          ctx.fillRect(20, 5, 3, 1);
          ctx.fillRect(8, 5, 3, 4);
        }
      }
    }

    // 12. Equipped HEAD Slot Overlay (Chapéus, Bandana, Boina, Tiara, Capuz, Colar Solar, or Robust Armors)
    const headColorDef =
      CLOTHING_COLOR_MAP[headDef?.garmentColorId || 'marrom'] ||
      CLOTHING_COLOR_MAP.marrom;

    if (headBaseId === 'fiber_hat') {
      // Chapéu de Fibras: Wide-brimmed woven golden straw sun hat with dark braided band
      ctx.fillStyle = '#451a03';
      ctx.fillRect(5, 3, 22, 2);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(9, 0, 14, 4);
      ctx.fillRect(6, 3, 20, 2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(10, 0, 12, 2);
      ctx.fillRect(7, 3, 18, 1);
      // Braided fiber band
      ctx.fillStyle = '#92400e';
      ctx.fillRect(9, 2, 14, 1);
    } else if (headBaseId === 'leather_hat') {
      // Chapéu de Couro: Wide-brimmed leather hat in any of the 17 colors with brass buckle band
      const m = headColorDef.hex;
      const d = headColorDef.darkHex;
      const l = headColorDef.lightHex;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(5, 3, 22, 2);
      ctx.fillStyle = m;
      ctx.fillRect(9, 0, 14, 4);
      ctx.fillRect(6, 3, 20, 2);
      ctx.fillStyle = l;
      ctx.fillRect(10, 0, 12, 2);
      ctx.fillRect(7, 3, 18, 1);
      ctx.fillStyle = d;
      ctx.fillRect(9, 2, 14, 1);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(15, 2, 2, 1);
    } else if (headBaseId === 'blacksmith_bandana') {
      // Bandana de Forja: Tied artisan headband across brow with side/back knot tails
      const m = headColorDef.hex;
      const d = headColorDef.darkHex;
      const l = headColorDef.lightHex;
      ctx.fillStyle = d;
      ctx.fillRect(9, 3, 14, 3);
      ctx.fillStyle = m;
      ctx.fillRect(9, 3, 14, 2);
      ctx.fillStyle = l;
      ctx.fillRect(11, 3, 10, 1);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(12, 4, 1, 1);
      ctx.fillRect(19, 4, 1, 1);
      if (dir === 'down' || dir === 'up') {
        ctx.fillStyle = m;
        ctx.fillRect(23, 4, 2, 4);
        ctx.fillStyle = d;
        ctx.fillRect(24, 6, 2, 3);
      } else if (dir === 'left') {
        ctx.fillStyle = m;
        ctx.fillRect(22, 4, 3, 4);
      } else if (dir === 'right') {
        ctx.fillStyle = m;
        ctx.fillRect(7, 4, 3, 4);
      }
    } else if (headBaseId === 'merchant_cap') {
      // Boina de Mercador: Puffed velvet beret with gold brooch & white feather plume
      const m = headColorDef.hex;
      const d = headColorDef.darkHex;
      const l = headColorDef.lightHex;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(7, 1, 18, 5);
      ctx.fillStyle = m;
      ctx.fillRect(8, 1, 16, 4);
      ctx.fillStyle = l;
      ctx.fillRect(9, 1, 12, 2);
      ctx.fillStyle = d;
      ctx.fillRect(9, 4, 14, 1);
      // Golden brooch & white feather plume
      ctx.fillStyle = '#fde047';
      ctx.fillRect(19, 3, 2, 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(21, 0, 3, 3);
      ctx.fillRect(23, 0, 2, 2);
    } else if (headBaseId === 'elder_mitre') {
      // Tiara do Ancião: Ceremonial sage diadem/mitre with radiant solar crystal emblem
      const m = headColorDef.hex;
      const d = headColorDef.darkHex;
      const l = headColorDef.lightHex;
      ctx.fillStyle = d;
      ctx.fillRect(9, 2, 14, 3);
      ctx.fillStyle = m;
      ctx.fillRect(9, 3, 14, 2);
      ctx.fillRect(13, 1, 6, 3);
      ctx.fillStyle = l;
      ctx.fillRect(14, 1, 4, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(10, 4, 12, 1);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(15, 2, 2, 2);
    } else if (headBaseId === 'wanderer_hood') {
      // Capuz de Andarilho: Nomad traveler cowl with integrated neck scarf
      const m = headColorDef.hex;
      const d = headColorDef.darkHex;
      const l = headColorDef.lightHex;
      ctx.fillStyle = d;
      ctx.fillRect(7, 1, 18, 5);
      ctx.fillStyle = m;
      ctx.fillRect(8, 1, 16, 4);
      ctx.fillStyle = l;
      ctx.fillRect(10, 1, 12, 2);
      // Integrated neck scarf at chin/collar
      ctx.fillStyle = '#78350f';
      ctx.fillRect(10, 12, 12, 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(15, 13, 2, 1);
      if (dir === 'down') {
        ctx.fillStyle = m;
        ctx.fillRect(8, 5, 2, 8);
        ctx.fillRect(22, 5, 2, 8);
        ctx.fillStyle = d;
        ctx.fillRect(9, 5, 1, 7);
        ctx.fillRect(22, 5, 1, 7);
      } else if (dir === 'up') {
        ctx.fillStyle = m;
        ctx.fillRect(8, 5, 16, 9);
        ctx.fillStyle = d;
        ctx.fillRect(14, 3, 4, 10);
      } else if (dir === 'left') {
        ctx.fillStyle = m;
        ctx.fillRect(13, 4, 11, 9);
        ctx.fillStyle = d;
        ctx.fillRect(13, 5, 2, 7);
      } else if (dir === 'right') {
        ctx.fillStyle = m;
        ctx.fillRect(8, 4, 11, 9);
        ctx.fillStyle = d;
        ctx.fillRect(17, 5, 2, 7);
      }
    } else if (headBaseId === 'solar_necklace') {
      // Colar Solar: Drawn on bodyCtx so it fits the 1.5x chest/collarbone seamlessly
      ctx = bodyCtx;
      if (dir === 'down') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(12, 14, 8, 1);
        ctx.fillRect(11, 15, 2, 1);
        ctx.fillRect(19, 15, 2, 1);
        // Radiant solar crystals along chest neckline
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(13, 15, 6, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(13, 15, 1, 2);
        ctx.fillRect(15, 15, 2, 2);
        ctx.fillRect(18, 15, 1, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(15, 15, 1, 1);
      } else if (dir === 'up') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(12, 14, 8, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(15, 14, 2, 2);
      } else {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(13, 14, 6, 2);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(dir === 'left' ? 12 : 18, 15, 2, 2);
      }
      ctx = headCtx;
    } else if (headId === 'leather_hood') {
      // Reinforced Ranger Leather Cowl with sheep-wool brow lining & brass rivets
      ctx.fillStyle = '#451a03';
      ctx.fillRect(7, 1, 18, 5);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 1, 16, 4);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(10, 1, 12, 2);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(9, 5, 14, 1);
      if (dir === 'down') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, 5, 2, 7);
        ctx.fillRect(22, 5, 2, 7);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(8, 8, 1, 1);
        ctx.fillRect(23, 8, 1, 1);
      } else if (dir === 'up') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, 5, 16, 9);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(15, 3, 2, 10);
      } else if (dir === 'left') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(13, 4, 11, 9);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(14, 8, 1, 1);
      } else if (dir === 'right') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(8, 4, 11, 9);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(17, 8, 1, 1);
      }
    } else if (headId === 'iron_helmet') {
      // Heavy Forged Steel Greathelm with Crimson Plume, Horns, Nasal Guard & Cheek Plates
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(13, 0, 6, 2);
      ctx.fillStyle = '#475569';
      ctx.fillRect(8, 1, 16, 5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(9, 2, 14, 3);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(11, 2, 10, 2);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(5, 2, 3, 3);
      ctx.fillRect(4, 1, 2, 2);
      ctx.fillRect(24, 2, 3, 3);
      ctx.fillRect(26, 1, 2, 2);
      if (dir === 'down') {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(9, 5, 14, 1);
        ctx.fillRect(15, 6, 2, 4);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(8, 6, 2, 6);
        ctx.fillRect(22, 6, 2, 6);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(15, 5, 2, 1);
      } else if (dir === 'up') {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(8, 5, 16, 8);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(14, 2, 4, 9);
      } else if (dir === 'left') {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(13, 5, 11, 8);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(9, 5, 6, 2);
        ctx.fillRect(9, 6, 2, 3);
      } else if (dir === 'right') {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(8, 5, 11, 8);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(17, 5, 6, 2);
        ctx.fillRect(21, 6, 2, 3);
      }
    } else if (headId === 'astral_crown') {
      // Sovereign Astral Winged Diadem with Glowing Starlight Sapphire Gem
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(8, 2, 16, 3);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(9, 2, 14, 2);
      ctx.fillRect(10, 0, 2, 3);
      ctx.fillRect(14, 0, 4, 3);
      ctx.fillRect(20, 0, 2, 3);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(6, 1, 2, 3);
      ctx.fillRect(5, 0, 2, 2);
      ctx.fillRect(24, 1, 2, 3);
      ctx.fillRect(25, 0, 2, 2);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(14, 1, 4, 3);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(15, 1, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(15, 1, 1, 1);
    }

    // Composite onto 48x42 canvas:
    // - Body height stays 1.5x (27px), while body width is reduced by 1.5x in front/back (48 / 1.5 = 32px) and by 2x in side view (48 / 2 = 24px)
    // - Head (32x32 headCanvas) stays at 1.0x -> width 32, height 32 centered at (dx=8, dy=1)
    const c = createPixelCanvas(48, 42);
    const finalCtx = c.getContext('2d')!;
    finalCtx.imageSmoothingEnabled = false;
    const isSideView = dir === 'left' || dir === 'right';
    const bodyDrawW = isSideView ? 24 : 32;
    const bodyDrawX = Math.round((48 - bodyDrawW) / 2);
    finalCtx.drawImage(bodyCanvas, 0, 13, 32, 18, bodyDrawX, 13, bodyDrawW, 27);
    finalCtx.drawImage(headCanvas, 0, 0, 32, 32, 8, 1, 32, 32);

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

    // COW (30x22 — Pasture Dairy Cow with black/brown spots, horns, pink muzzle, udder & hooves)
    buildCreature(CreatureKind.COW, 30, 22, (ctx, f) => {
      const leg = f % 2;
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(3, 18, 23, 3);
      // Dark outline
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(3, 4, 19, 12);
      ctx.fillRect(20, 3, 8, 10);
      // Tail
      ctx.fillRect(1, 6, 2, 7);
      // Four Legs & Dark Hooves
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(5, 15 + leg, 3, 4);
      ctx.fillRect(10, 16 - leg, 2, 3);
      ctx.fillRect(15, 15 + leg, 2, 3);
      ctx.fillRect(18, 16 - leg, 3, 4);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 18 + leg, 3, 2);
      ctx.fillRect(18, 18 - leg, 3, 2);
      // Pink Udder
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(11, 15, 4, 2);
      // White Coat Body
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(4, 5, 17, 10);
      // Classic Dark Holstein/Pasture Patches
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 5, 6, 5);
      ctx.fillRect(13, 6, 5, 6);
      ctx.fillRect(9, 11, 4, 3);
      // Head, Horns, Ears & Pink Muzzle
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(21, 4, 6, 7);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(21, 4, 4, 4);
      ctx.fillRect(19, 4, 2, 2); // Ear
      // Small Curved Ivory Horns
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(21, 2, 2, 2);
      ctx.fillRect(24, 2, 2, 2);
      // Pink Snout / Muzzle
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(25, 8, 3, 4);
      ctx.fillStyle = '#881337';
      ctx.fillRect(27, 9, 1, 1);
      // Eye
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(24, 6, 1, 2);
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
    buildCreature(CreatureKind.CAMEL, 36, 36, (ctx, f, isAtk) => {
      const leg = f % 2;
      const neckLunge = isAtk ? 3 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(5, 31, 25, 3);
      // Dark outline
      ctx.fillStyle = '#2a1205';
      ctx.fillRect(6, 12, 20, 12);
      ctx.fillRect(10, 6, 11, 7);
      ctx.fillRect(24 + neckLunge, 4, 8, 15);
      // Long Slender Camel Legs (front kick when attacking)
      ctx.fillStyle = '#78350f';
      ctx.fillRect(8, 23 + leg, 3, 9);
      ctx.fillRect(13, 24 - leg, 2, 8);
      ctx.fillRect(19, 23 + leg, 2, 8);
      if (isAtk) {
        ctx.fillRect(24, 21, 5, 4);
      } else {
        ctx.fillRect(22, 24 - leg, 3, 9);
      }
      // Golden Dromedary Coat, Hump & Curved Neck
      ctx.fillStyle = '#d97706';
      ctx.fillRect(7, 13, 18, 10);
      ctx.fillRect(11, 7, 9, 7);
      ctx.fillRect(25 + neckLunge, 5, 6, 13);
      ctx.fillRect(28 + neckLunge, 5, 4, 5);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(12, 7, 7, 4);
      ctx.fillRect(26 + neckLunge, 5, 4, 4);
      if (isAtk) {
        // Open jaw & desert spit droplet
        ctx.fillStyle = '#78350f';
        ctx.fillRect(29 + neckLunge, 9, 4, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(33, 7, 2, 2);
      }
      // Natural furry hump shading (saddle is drawn dynamically when cr.hasSaddle is true)
      ctx.fillStyle = '#b45309';
      ctx.fillRect(11, 12, 9, 3);
      // Eye
      ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
      ctx.fillRect(29 + neckLunge, 6, 1, 2);
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

    const buildDirectionalCreature = (
      kind: CreatureKind,
      w: number,
      h: number,
      drawer: (
        ctx: CanvasRenderingContext2D,
        frame: number,
        isAtk: boolean,
        perspective: 'down' | 'up' | 'side'
      ) => void
    ) => {
      const perspectives: Array<'down' | 'up' | 'side'> = [
        'down',
        'up',
        'side',
      ];
      for (const p of perspectives) {
        for (let f = 0; f < 4; f++) {
          const c = createPixelCanvas(w, h);
          drawer(c.getContext('2d')!, f, false, p);
          this.creatureSprites.set(`${kind}_${p}_${f}`, c);
          if (p === 'down') {
            this.creatureSprites.set(`${kind}_${f}`, c);
          }
        }
        const atkC = createPixelCanvas(w, h);
        drawer(atkC.getContext('2d')!, 1, true, p);
        this.creatureSprites.set(`${kind}_${p}_atk`, atkC);
        if (p === 'down') {
          this.creatureSprites.set(`${kind}_atk`, atkC);
        }
      }
    };

    // ZOMBIE (22x26 — Humanoid undead night walker with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.ZOMBIE,
      22,
      26,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(5, 22, 12, 2);

        if (p === 'up') {
          // Back view (Cima): back of necrotic skull, exposed spine ribs on purple tunic, arms raised forward
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 10, 8);
          ctx.fillRect(5, 10, 12, 8);
          ctx.fillStyle = '#365314';
          ctx.fillRect(7, 3, 8, 6);
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(8, 3, 6, 3);
          // Back of tattered tunic & exposed spine vertebrae
          ctx.fillStyle = '#4c1d95';
          ctx.fillRect(7, 10, 8, 7);
          ctx.fillStyle = '#d9f99d';
          ctx.fillRect(10, 11, 2, 5);
          // Arms reaching up/north when attacking
          ctx.fillStyle = '#65a30d';
          ctx.fillRect(3, isAtk ? 5 : 9, 4, 4);
          ctx.fillRect(15, isAtk ? 5 : 9, 4, 4);
          // Legs
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): hunched undead profile, outstretched Zombie arms to the right
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 9, 8);
          ctx.fillRect(5, 10, 10, 8);
          // Side head & jaw
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(7, 3, 7, 6);
          ctx.fillStyle = '#84cc16';
          ctx.fillRect(8, 3, 5, 2);
          // Single glowing red eye on side profile
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(12, 5, 2, 2);
          // Side tattered purple tunic
          ctx.fillStyle = '#4c1d95';
          ctx.fillRect(6, 10, 8, 7);
          ctx.fillStyle = '#7e22ce';
          ctx.fillRect(7, 11, 6, 4);
          // Both undead arms reaching forward to the right (lunging further on attack)
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(12, isAtk ? 8 : 9, isAtk ? 9 : 7, 2);
          ctx.fillStyle = '#84cc16';
          ctx.fillRect(13, isAtk ? 11 : 11, isAtk ? 8 : 6, 3);
          if (isAtk) {
            ctx.fillStyle = '#a3e635';
            ctx.fillRect(19, 7, 2, 6);
          }
          // Striding profile legs
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7 - step, 17, 3, 5);
          ctx.fillRect(11 + step, 17, 3, 5);
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 10, 8);
          ctx.fillRect(5, 10, 12, 8);
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(7, 3, 8, 6);
          ctx.fillStyle = '#84cc16';
          ctx.fillRect(8, 3, 6, 2);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(8, 5, 2, 2);
          ctx.fillRect(12, 5, 2, 2);
          ctx.fillStyle = '#4c1d95';
          ctx.fillRect(7, 10, 8, 7);
          ctx.fillStyle = '#7e22ce';
          ctx.fillRect(8, 10, 6, 4);
          ctx.fillStyle = '#65a30d';
          ctx.fillRect(2, isAtk ? 12 : 10, 5, isAtk ? 5 : 3);
          ctx.fillRect(15, isAtk ? 12 : 10, 5, isAtk ? 5 : 3);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        }
      }
    );

    // OGRE (42x46 — Towering Colossal Brute with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.OGRE,
      42,
      46,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.44)';
        ctx.fillRect(5, 39, 32, 5);

        if (p === 'up') {
          // Back view (Cima): massive muscular back, rear of bull horns, fur pelt across shoulders, club raised/slammed
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(7, 11, 26, 22);
          ctx.fillRect(12, 2, 16, 11);
          ctx.fillStyle = '#365314';
          ctx.fillRect(8, 12, 24, 19);
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(10, 12, 20, 14);
          // Back of head & curved horns
          ctx.fillStyle = '#365314';
          ctx.fillRect(13, 3, 14, 9);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(9, 1, 4, 5);
          ctx.fillRect(27, 1, 4, 5);
          // Rear fur belt & crossed hide strap
          ctx.fillStyle = '#78350f';
          ctx.fillRect(9, 26, 22, 7);
          ctx.fillRect(11, 13, 18, 4);
          // Colossal War Club on right side
          ctx.fillStyle = '#2a1205';
          const clubY = isAtk ? 1 : 5;
          ctx.fillRect(31, clubY, 9, 22);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(32, clubY + 1, 7, 20);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(30, clubY + 3, 3, 3);
          ctx.fillRect(38, clubY + 8, 3, 3);
          // Legs
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(11, 32 + step, 6, 8);
          ctx.fillRect(23, 33 - step, 6, 8);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): hulking brute side profile, forward horn & tusk, club swinging right
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(9, 11, 20, 22);
          ctx.fillRect(13, 2, 14, 11);
          // Muscular side torso & shoulder
          ctx.fillStyle = '#365314';
          ctx.fillRect(10, 12, 18, 19);
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(12, 12, 15, 15);
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(15, 15, 8, 2);
          // Side head, forward horn, red eye & jutting ivory tusk
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(14, 3, 12, 9);
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(22, 1, 5, 4);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(23, 6, 3, 2);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(25, 9, 3, 3);
          // Fur loincloth
          ctx.fillStyle = '#78350f';
          ctx.fillRect(10, 27, 18, 6);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(24, 27, 4, 4);
          // Spiked War Club (slammed horizontally forward when attacking, held upright otherwise)
          ctx.fillStyle = '#2a1205';
          if (isAtk) {
            ctx.fillRect(24, 16, 17, 9);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(25, 17, 15, 7);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(34, 14, 3, 3);
            ctx.fillRect(37, 24, 3, 3);
          } else {
            ctx.fillRect(28, 4, 9, 23);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(29, 5, 7, 21);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(35, 8, 3, 3);
            ctx.fillRect(35, 14, 3, 3);
          }
          // Striding trunk legs
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(12 - step * 2, 32, 6, 8);
          ctx.fillRect(20 + step * 2, 32, 6, 8);
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(7, 11, 26, 22);
          ctx.fillRect(12, 2, 16, 11);
          ctx.fillStyle = '#365314';
          ctx.fillRect(8, 12, 24, 19);
          ctx.fillStyle = '#4d7c0f';
          ctx.fillRect(10, 12, 20, 15);
          ctx.fillStyle = '#65a30d';
          ctx.fillRect(12, 13, 16, 8);
          ctx.fillStyle = '#b91c1c';
          ctx.fillRect(13, 15, 5, 2);
          ctx.fillRect(22, 15, 5, 2);
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
          ctx.fillStyle = '#78350f';
          ctx.fillRect(9, 27, 22, 6);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(17, 27, 6, 4);
          ctx.fillStyle = '#2a1205';
          if (isAtk) {
            ctx.fillRect(27, 18, 14, 10);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(28, 19, 12, 8);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(36, 16, 3, 3);
            ctx.fillRect(36, 27, 3, 3);
          } else {
            ctx.fillRect(31, 3, 9, 24);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(32, 4, 7, 22);
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(30, 6, 3, 3);
            ctx.fillRect(38, 11, 3, 3);
            ctx.fillRect(30, 16, 3, 3);
          }
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(11, 32 + step, 6, 8);
          ctx.fillRect(23, 33 - step, 6, 8);
        }
      }
    );

    // FOREST_STALKER (36x24 — Giant woodland spider with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.FOREST_STALKER,
      36,
      24,
      (ctx, f, isAtk, p) => {
        const legShift = f % 2 === 0 ? 1 : -1;
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        ctx.fillRect(5, 19, 26, 3);

        if (p === 'up') {
          // Back view (Cima): fangs pointing UP (north), large abdomen in the foreground (south) with hourglass & spinnerets
          ctx.fillStyle = '#0f172a';
          for (let i = 0; i < 4; i++) {
            const ly = 6 + i * 4 + (i % 2 === 0 ? legShift : -legShift);
            ctx.fillRect(1, ly, 10, 2);
            ctx.fillRect(1, ly + 1, 3, 3);
            ctx.fillRect(25, ly, 10, 2);
            ctx.fillRect(32, ly + 1, 3, 3);
          }
          // Fangs reaching north
          ctx.fillStyle = isAtk ? '#4ade80' : '#e2e8f0';
          ctx.fillRect(14, isAtk ? 1 : 2, 2, 4);
          ctx.fillRect(20, isAtk ? 1 : 2, 2, 4);
          // Front cephalothorax (north) & bulbous abdomen (south)
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(12, 4, 12, 6);
          ctx.fillRect(9, 8, 18, 11);
          ctx.fillStyle = '#312e81';
          ctx.fillRect(10, 9, 16, 9);
          // Dorsal hourglass & silk spinnerets at the rear
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(14, 11, 8, 5);
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(16, 12, 4, 3);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(16, 18, 4, 2);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): raised abdomen on left, cephalothorax & venomous fangs lunging right
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(4, 4, 15, 12); // Rear abdomen
          ctx.fillRect(17, 7, 11, 10); // Front cephalothorax
          ctx.fillStyle = '#312e81';
          ctx.fillRect(5, 5, 13, 10);
          ctx.fillRect(18, 8, 9, 8);
          // Side violet/emerald marking on abdomen
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(8, 7, 7, 5);
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(10, 8, 3, 3);
          // Side red eye cluster & forward fangs on the right
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(24, 9, 3, 3);
          ctx.fillStyle = isAtk ? '#4ade80' : '#e2e8f0';
          ctx.fillRect(27, isAtk ? 10 : 12, isAtk ? 6 : 4, 2);
          ctx.fillRect(27, isAtk ? 14 : 15, isAtk ? 6 : 4, 2);
          // Articulated side legs striding along bottom
          ctx.fillStyle = '#0f172a';
          for (let i = 0; i < 4; i++) {
            const lx = 7 + i * 5 + (i % 2 === 0 ? legShift : -legShift);
            ctx.fillRect(lx, 14, 3, 5);
            ctx.fillRect(lx - 1, 18, 3, 3);
          }
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          for (let i = 0; i < 4; i++) {
            const ly = 6 + i * 4 + (i % 2 === 0 ? legShift : -legShift);
            ctx.fillRect(1, ly, 10, 2);
            ctx.fillRect(1, ly + 1, 3, 3);
            ctx.fillRect(25, ly, 10, 2);
            ctx.fillRect(32, ly + 1, 3, 3);
          }
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(10, 3, 16, 15);
          ctx.fillStyle = '#312e81';
          ctx.fillRect(11, 4, 14, 12);
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(14, 5, 8, 5);
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(16, 6, 4, 3);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(13, 13, 3, 2);
          ctx.fillRect(20, 13, 3, 2);
          ctx.fillStyle = isAtk ? '#4ade80' : '#e2e8f0';
          ctx.fillRect(13, isAtk ? 17 : 16, 3, isAtk ? 5 : 4);
          ctx.fillRect(20, isAtk ? 17 : 16, 3, isAtk ? 5 : 4);
        }
      }
    );

    // DESERT_SCORPION (36x30 — Golden emperor scorpion with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.DESERT_SCORPION,
      36,
      30,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        ctx.fillRect(4, 24, 28, 3);

        if (p === 'up') {
          // Back view (Cima): pincers reaching UP (north), segmented tail curving from rear (south) up overhead
          ctx.fillStyle = '#78350f';
          ctx.fillRect(2, isAtk ? 2 : 5, 8, 6);
          ctx.fillRect(26, isAtk ? 2 : 5, 8, 6);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(3, isAtk ? 2 : 5, 6, 4);
          ctx.fillRect(27, isAtk ? 2 : 5, 6, 4);
          // Carapace
          ctx.fillStyle = '#451a03';
          ctx.fillRect(9, 9, 18, 11);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(10, 10, 16, 9);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(12, 11, 12, 6);
          // Rear-mounted segmented tail whipping forward/upward
          const tailY = isAtk ? 2 : 6 + step;
          ctx.fillStyle = '#78350f';
          ctx.fillRect(14, tailY, 8, 14);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(15, tailY + 2, 6, 11);
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(16, tailY - 1, 4, 4);
          // Legs
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7, 20 + step, 3, 5);
          ctx.fillRect(26, 21 - step, 3, 5);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): tail arched on left curving overhead to right, pincers snapping right
          // Segmented carapace
          ctx.fillStyle = '#451a03';
          ctx.fillRect(9, 13, 17, 9);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(10, 14, 15, 7);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(12, 14, 12, 4);
          // Arched scorpion tail rising from left rear (x=4..12) and whipping right (x=12..25)
          ctx.fillStyle = '#78350f';
          ctx.fillRect(4, 6, 6, 10);
          ctx.fillRect(8, 2 + step, isAtk ? 18 : 13, 5);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(5, 7, 4, 8);
          ctx.fillRect(9, 3 + step, isAtk ? 16 : 11, 3);
          // Glowing purple/gold venom stinger tip pointing right
          const stingX = isAtk ? 25 : 20;
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(stingX, isAtk ? 5 : 2 + step, 4, 4);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(stingX + 1, isAtk ? 6 : 3 + step, 2, 2);
          // Heavy Pincers reaching right
          ctx.fillStyle = '#78350f';
          ctx.fillRect(24, isAtk ? 10 : 12, isAtk ? 11 : 9, 7);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(25, isAtk ? 11 : 13, isAtk ? 9 : 7, 2);
          ctx.fillRect(25, isAtk ? 15 : 16, isAtk ? 9 : 7, 2);
          // Side legs
          ctx.fillStyle = '#451a03';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(10 + i * 4, 21 + ((i + step) % 2), 3, 5);
          }
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#451a03';
          ctx.fillRect(9, 12, 18, 10);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(10, 13, 16, 8);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(12, 13, 12, 4);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(1, isAtk ? 16 : 14, 8, 6);
          ctx.fillRect(27, isAtk ? 16 : 14, 8, 6);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(2, isAtk ? 16 : 14, 6, 4);
          ctx.fillRect(28, isAtk ? 16 : 14, 6, 4);
          const tailY = isAtk ? 6 : 2 + step;
          ctx.fillStyle = '#78350f';
          ctx.fillRect(14, tailY, 8, 10);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(15, tailY + 1, 6, 8);
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(16, isAtk ? tailY + 7 : tailY - 1, 4, 4);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(17, isAtk ? tailY + 8 : tailY, 2, 2);
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7, 21 + step, 3, 5);
          ctx.fillRect(13, 22 - step, 3, 5);
          ctx.fillRect(20, 21 + step, 3, 5);
          ctx.fillRect(26, 22 - step, 3, 5);
        }
      }
    );

    // STONE_GOLEM (44x48 — Colossal ancient runic monolith guardian with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.STONE_GOLEM,
      44,
      48,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.46)';
        ctx.fillRect(4, 41, 36, 5);

        if (p === 'up') {
          // Back view (Cima): ancient carved granite back, dorsal runic spine, mossy shoulders
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 5, 32, 30);
          ctx.fillStyle = '#475569';
          ctx.fillRect(7, 6, 30, 27);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(9, 7, 26, 21);
          // Mossy shoulders
          ctx.fillStyle = '#15803d';
          ctx.fillRect(8, 6, 8, 4);
          ctx.fillRect(28, 6, 8, 4);
          // Glowing dorsal rune spine
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(19, 10, 6, 18);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(20, 12, 4, 14);
          // Stone Pillar Fists
          ctx.fillStyle = '#334155';
          ctx.fillRect(1, isAtk ? 6 : 12 + step, 7, 17);
          ctx.fillRect(36, isAtk ? 6 : 12 - step, 7, 17);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(10, 34 + step, 9, 8);
          ctx.fillRect(25, 35 - step, 9, 8);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): thick granite monolith profile, side core & golden eye, massive fist slamming right
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(10, 5, 22, 30);
          ctx.fillStyle = '#475569';
          ctx.fillRect(11, 6, 20, 27);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(13, 7, 17, 21);
          // Moss on top shoulder
          ctx.fillStyle = '#15803d';
          ctx.fillRect(12, 6, 10, 3);
          // Side Golden Eye & Glowing Cyan Runic Chest Core on the right face
          ctx.fillStyle = '#fde047';
          ctx.fillRect(26, 10, 4, 3);
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(23, 16, 8, 10);
          ctx.fillStyle = f % 2 === 0 ? '#e0f2fe' : '#38bdf8';
          ctx.fillRect(25, 18, 6, 6);
          // Massive Articulated Stone Fist swinging forward to the right
          ctx.fillStyle = '#334155';
          if (isAtk) {
            ctx.fillRect(25, 18, 17, 12);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(27, 19, 14, 7);
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(36, 21, 4, 4);
          } else {
            ctx.fillRect(18, 13 + step, 10, 17);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(19, 14 + step, 8, 9);
          }
          // Striding monolith legs
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(12 - step * 2, 34, 8, 8);
          ctx.fillRect(21 + step * 2, 34, 8, 8);
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 5, 32, 30);
          ctx.fillStyle = '#475569';
          ctx.fillRect(7, 6, 30, 27);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(9, 7, 26, 21);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(10, 7, 24, 8);
          ctx.fillStyle = '#15803d';
          ctx.fillRect(8, 6, 6, 3);
          ctx.fillRect(30, 6, 6, 3);
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(16, 16, 12, 11);
          ctx.fillStyle = f % 2 === 0 ? '#e0f2fe' : '#38bdf8';
          ctx.fillRect(18, 18, 8, 7);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(14, 10, 4, 3);
          ctx.fillRect(26, 10, 4, 3);
          ctx.fillStyle = '#334155';
          ctx.fillRect(1, isAtk ? 22 : 12 + step, 7, 17);
          ctx.fillRect(36, isAtk ? 22 : 12 - step, 7, 17);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(2, isAtk ? 23 : 13 + step, 5, 9);
          ctx.fillRect(37, isAtk ? 23 : 13 - step, 5, 9);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(10, 34 + step, 9, 8);
          ctx.fillRect(25, 35 - step, 9, 8);
        }
      }
    );

    // BANDIT (22x26 — Humanoid highway raider with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.BANDIT,
      22,
      26,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(5, 22, 12, 2);

        if (p === 'up') {
          // Back view (Cima): dark hood & crimson cape back, crossed scabbard strap
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 10, 8);
          ctx.fillRect(4, 10, 14, 8);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 3, 8, 6);
          ctx.fillStyle = '#7f1d1d';
          ctx.fillRect(6, 10, 10, 7);
          ctx.fillStyle = '#991b1b';
          ctx.fillRect(7, 10, 8, 5);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(8, 11, 6, 1);
          // Cutlass raised north
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(16, isAtk ? 1 : 5, 3, 8);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): hooded highwayman profile, red mask on right, cutlass thrusting right
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 9, 8);
          ctx.fillRect(5, 10, 10, 8);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 3, 7, 6);
          ctx.fillStyle = '#991b1b';
          ctx.fillRect(9, 6, 6, 3);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(12, 5, 2, 1);
          // Side brigandine vest
          ctx.fillStyle = '#334155';
          ctx.fillRect(6, 10, 8, 7);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(7, 10, 6, 4);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(12, 15, 2, 2);
          // Steel Cutlass slashing forward to the right
          ctx.fillStyle = '#e2e8f0';
          if (isAtk) {
            ctx.fillRect(14, 9, 8, 3);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(13, 8, 2, 5);
          } else {
            ctx.fillRect(15, 5, 3, 8);
          }
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7 - step, 17, 3, 5);
          ctx.fillRect(11 + step, 17, 3, 5);
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 10, 8);
          ctx.fillRect(4, 10, 14, 8);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 3, 8, 6);
          ctx.fillStyle = '#991b1b';
          ctx.fillRect(7, 6, 8, 3);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(8, 5, 2, 1);
          ctx.fillRect(12, 5, 2, 1);
          ctx.fillStyle = '#334155';
          ctx.fillRect(6, 10, 10, 7);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(7, 10, 8, 4);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(10, 15, 2, 2);
          ctx.fillStyle = '#e2e8f0';
          if (isAtk) {
            ctx.fillRect(15, 11, 7, 3);
          } else {
            ctx.fillRect(16, 6, 3, 8);
          }
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        }
      }
    );

    // VILLAGER (22x26 — Village NPC with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.VILLAGER,
      22,
      26,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(5, 22, 12, 2);

        if (p === 'up') {
          // Back view (Cima): emerald cap & hair back, guild cloak back with gold trim
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 10, 8);
          ctx.fillRect(4, 10, 14, 8);
          ctx.fillStyle = '#065f46';
          ctx.fillRect(6, 3, 10, 4);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(7, 6, 8, 3);
          ctx.fillStyle = '#047857';
          ctx.fillRect(6, 10, 10, 7);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(7, 10, 8, 5);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(8, 15, 6, 2);
          if (isAtk) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(16, 2, 3, 8);
          }
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): merchant cap in profile, side face & eye, lantern or guard spear/blade pointing right
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 9, 8);
          ctx.fillRect(5, 10, 10, 8);
          ctx.fillStyle = '#065f46';
          ctx.fillRect(6, 3, 9, 3);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(7, 4, 7, 1);
          ctx.fillStyle = '#fdba74';
          ctx.fillRect(8, 5, 6, 4);
          ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
          ctx.fillRect(12, 6, 2, 2);
          // Side guild tunic
          ctx.fillStyle = '#047857';
          ctx.fillRect(6, 10, 8, 7);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(7, 10, 6, 4);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(10, 10, 3, 6);
          if (isAtk) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(14, 9, 7, 3);
          } else {
            ctx.fillStyle = '#fde047';
            ctx.fillRect(14, 11, 3, 4);
          }
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7 - step, 17, 3, 5);
          ctx.fillRect(11 + step, 17, 3, 5);
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 2, 10, 8);
          ctx.fillRect(4, 10, 14, 8);
          ctx.fillStyle = '#065f46';
          ctx.fillRect(6, 3, 10, 3);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(7, 4, 8, 1);
          ctx.fillStyle = '#fdba74';
          ctx.fillRect(7, 5, 8, 4);
          ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
          ctx.fillRect(8, 6, 2, 2);
          ctx.fillRect(12, 6, 2, 2);
          ctx.fillStyle = '#047857';
          ctx.fillRect(6, 10, 10, 7);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(7, 10, 8, 4);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(9, 10, 4, 6);
          if (isAtk) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(15, 10, 6, 3);
          } else {
            ctx.fillStyle = '#fde047';
            ctx.fillRect(15, 11, 3, 4);
          }
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        }
      }
    );

    // WANDERER (22x26 — Nomadic frontier traveler with 'down', 'up', and 'side' perspectives)
    buildDirectionalCreature(
      CreatureKind.WANDERER,
      22,
      26,
      (ctx, f, isAtk, p) => {
        const step = f % 2;
        ctx.fillStyle = 'rgba(0,0,0,0.34)';
        ctx.fillRect(5, 22, 12, 2);

        if (p === 'up') {
          // Back view (Cima): wide explorer hat from behind, full leather backpack & bedroll centered on back
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(5, 2, 12, 8);
          ctx.fillRect(4, 10, 14, 8);
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(4, 2, 14, 4);
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(6, 2, 10, 2);
          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(6, 10, 10, 7);
          // Prominent traveler backpack & rolled bedroll on the back
          ctx.fillStyle = '#78350f';
          ctx.fillRect(6, 9, 9, 8);
          ctx.fillStyle = '#d97706';
          ctx.fillRect(7, 10, 7, 5);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(8, 12, 5, 1);
          // Staff on right
          ctx.fillStyle = '#92400e';
          ctx.fillRect(16, isAtk ? 2 : 4, 2, 15);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(15, isAtk ? 2 : 4, 3, 3);
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        } else if (p === 'side') {
          // Side profile (Lados - facing right): backpack strapped on left back, explorer hat profile, staff held in front on right
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(5, 2, 11, 8);
          ctx.fillRect(4, 10, 11, 8);
          // Backpack on left side of torso
          ctx.fillStyle = '#78350f';
          ctx.fillRect(2, 9, 5, 8);
          ctx.fillStyle = '#d97706';
          ctx.fillRect(3, 10, 3, 6);
          // Explorer hat & side face
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(4, 2, 13, 3);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(6, 4, 9, 1);
          ctx.fillStyle = '#fdba74';
          ctx.fillRect(8, 5, 6, 4);
          ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
          ctx.fillRect(12, 6, 2, 2);
          // Indigo cloak in side profile
          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(6, 10, 8, 7);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(8, 10, 5, 4);
          if (isAtk) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(14, 9, 7, 3);
          } else {
            ctx.fillStyle = '#92400e';
            ctx.fillRect(16, 4, 2, 16);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(15, 4, 3, 3);
          }
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7 - step, 17, 3, 5);
          ctx.fillRect(11 + step, 17, 3, 5);
        } else {
          // Front view (Baixo)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(5, 2, 12, 8);
          ctx.fillRect(4, 10, 14, 8);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(2, 9, 4, 7);
          ctx.fillStyle = '#d97706';
          ctx.fillRect(2, 10, 3, 5);
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(4, 2, 14, 3);
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(7, 2, 8, 2);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(6, 4, 10, 1);
          ctx.fillStyle = '#fdba74';
          ctx.fillRect(7, 5, 8, 4);
          ctx.fillStyle = isAtk ? '#ef4444' : '#0f172a';
          ctx.fillRect(8, 6, 2, 2);
          ctx.fillRect(12, 6, 2, 2);
          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(6, 10, 10, 7);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(7, 10, 8, 4);
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(9, 10, 4, 6);
          if (isAtk) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(15, 10, 6, 3);
          } else {
            ctx.fillStyle = '#92400e';
            ctx.fillRect(16, 4, 2, 16);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(15, 4, 3, 3);
          }
          ctx.fillStyle = '#451a03';
          ctx.fillRect(7, 17 + step, 3, 5);
          ctx.fillRect(12, 18 - step, 3, 5);
        }
      }
    );
  }
}

export const spriteAtlas = new SpriteAtlasManager();


