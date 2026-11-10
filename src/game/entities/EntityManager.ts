import {
  BiomeType,
  ChunkData,
  CreatureEntity,
  CreatureFaction,
  CreatureKind,
  Direction,
  EcologicalZone,
  EyeStyleId,
  HairStyleId,
  NpcRole,
  NpcTradeOffer,
  PlaceableType,
  PlayerAppearance,
  PlayerEquipment,
  PlayerGender,
  SkinMarkId,
} from '../core/types';
import { getDyedGarmentItemId, ITEMS } from '../core/ItemRegistry';
import { CHUNK_SIZE, TILE_SIZE, WorldManager } from '../world/WorldManager';

export const MAX_VILLAGERS_PER_HOUSE = 2;

const VILLAGER_PROFILES: Record<
  NpcRole,
  {
    names: string[];
    professionLabel: string;
    dialogues: string[];
    hp: number;
    attackDamage: number;
    moveSpeed: number;
    trades: NpcTradeOffer[];
  }
> = {
  ferreiro: {
    names: ['Mestre Borin', 'Ferreiro Kaelen', 'Durgan da Forja', 'Thrain Martelo-Forte'],
    professionLabel: 'Mestre Ferreiro da Vila',
    dialogues: [
      'Bom aço exige fogo alto! Traga recursos ou moedas antigas para negociarmos.',
      'Minha forja está sempre acesa para viajantes honrados.',
    ],
    hp: 165,
    attackDamage: 28,
    moveSpeed: 42,
    trades: [
      {
        id: 'smith_wood_coin',
        giveItemId: 'wood',
        giveCount: 20,
        receiveItemId: 'gold_coin',
        receiveCount: 15,
        minAffinity: 0,
        affinityGain: 8,
        label: 'Lenha para a Forja',
      },
      {
        id: 'smith_iron_bars',
        giveItemId: 'gold_coin',
        giveCount: 96,
        receiveItemId: 'iron_bar',
        receiveCount: 2,
        minAffinity: 0,
        affinityGain: 10,
        label: 'Lingotes Purificados',
      },
      {
        id: 'smith_iron_sword',
        giveItemId: 'gold_coin',
        giveCount: 330,
        receiveItemId: 'iron_sword',
        receiveCount: 1,
        minAffinity: 45,
        affinityGain: 12,
        label: 'Espada Longa Real',
      },
      {
        id: 'smith_scorpion_dagger',
        giveItemId: 'scorpion_stinger',
        giveCount: 6,
        receiveItemId: 'scorpion_dagger',
        receiveCount: 1,
        minAffinity: 70,
        affinityGain: 16,
        label: 'Forja Especial de Aliado',
      },
      {
        id: 'smith_royal_wax_seal',
        giveItemId: 'gold_coin',
        giveCount: 180,
        receiveItemId: 'royal_wax_seal',
        receiveCount: 1,
        minAffinity: 0,
        affinityGain: 12,
        label: 'Selo de Cera Real (Requisito da Paz)',
      },
    ],
  },
  mercador: {
    names: ['Mercadora Lyra', 'Mercadora Selene', 'Boticária Elara', 'Mercador Vaen'],
    professionLabel: 'Mercadora & Boticária Real',
    dialogues: [
      'Tenho especiarias, rações e elixires raros! Amigos da vila recebem nossas melhores ofertas.',
      'Troco seda da floresta, frutas frescas e moedas antigas!',
    ],
    hp: 130,
    attackDamage: 18,
    moveSpeed: 44,
    trades: [
      {
        id: 'merch_berries_coin',
        giveItemId: 'berry',
        giveCount: 15,
        receiveItemId: 'gold_coin',
        receiveCount: 12,
        minAffinity: 0,
        affinityGain: 8,
        label: 'Colheita Silvestre',
      },
      {
        id: 'merch_silk_coin',
        giveItemId: 'spider_silk',
        giveCount: 2,
        receiveItemId: 'gold_coin',
        receiveCount: 60,
        minAffinity: 0,
        affinityGain: 12,
        label: 'Encomenda de Seda Sombria',
      },
      {
        id: 'merch_taming_treat',
        giveItemId: 'gold_coin',
        giveCount: 36,
        receiveItemId: 'taming_treat',
        receiveCount: 2,
        minAffinity: 35,
        affinityGain: 10,
        label: 'Ração Aromática Real',
      },
      {
        id: 'merch_warrior_feast',
        giveItemId: 'gold_coin',
        giveCount: 120,
        receiveItemId: 'warrior_feast',
        receiveCount: 2,
        minAffinity: 65,
        affinityGain: 14,
        label: 'Banquete de Aliado',
      },
      {
        id: 'merch_royal_wax_seal',
        giveItemId: 'gold_coin',
        giveCount: 180,
        receiveItemId: 'royal_wax_seal',
        receiveCount: 1,
        minAffinity: 0,
        affinityGain: 12,
        label: 'Selo de Cera Real (Requisito da Paz)',
      },
    ],
  },
  guardiao: {
    names: ['Capitão Thorne', 'Sentinela Garrick', 'Valéria Escudo de Ouro', 'Comandante Roland'],
    professionLabel: 'Guardião Juramentado da Vila',
    dialogues: [
      'Com minha Armadura de Ferro e Espada Longa de Ferro, protegerei este vilarejo contra qualquer monstro!',
      'Pagamos recompensas em ouro para quem eliminar Zumbis, Ogros e Saqueadores!',
    ],
    hp: 285,
    attackDamage: 61,
    moveSpeed: 54,
    trades: [
      {
        id: 'guard_bounty_zombie',
        giveItemId: 'dark_essence',
        giveCount: 2,
        receiveItemId: 'gold_coin',
        receiveCount: 55,
        minAffinity: 0,
        affinityGain: 10,
        label: 'Recompensa: Caça a Zumbis',
      },
      {
        id: 'guard_bounty_ogre',
        giveItemId: 'ogre_hide',
        giveCount: 1,
        receiveItemId: 'gold_coin',
        receiveCount: 75,
        minAffinity: 0,
        affinityGain: 14,
        label: 'Recompensa: Troféu de Ogro',
      },
      {
        id: 'guard_iron_armor',
        giveItemId: 'gold_coin',
        giveCount: 485,
        receiveItemId: 'iron_armor',
        receiveCount: 1,
        minAffinity: 55,
        affinityGain: 14,
        label: 'Couraça da Guarda Real',
      },
      {
        id: 'guard_fire_bombs',
        giveItemId: 'gold_coin',
        giveCount: 102,
        receiveItemId: 'fire_bomb',
        receiveCount: 3,
        minAffinity: 75,
        affinityGain: 15,
        label: 'Arsenal do Guardião',
      },
      {
        id: 'guard_royal_wax_seal',
        giveItemId: 'gold_coin',
        giveCount: 180,
        receiveItemId: 'royal_wax_seal',
        receiveCount: 1,
        minAffinity: 0,
        affinityGain: 12,
        label: 'Selo de Cera Real (Requisito da Paz)',
      },
    ],
  },
  anciao: {
    names: ['Ancião Aldric', 'Sábio Vaelen', 'Matriarca Aurelia', 'Oráculo Orion'],
    professionLabel: 'Ancião & Guardião das Relíquias',
    dialogues: [
      'A confiança é o tesouro mais raro da Fronteira. Alcance alta afinidade conosco e compartilharei segredos ancestrais.',
      'Núcleos de Colosso e relíquias antigas guardam a memória do mundo.',
    ],
    hp: 145,
    attackDamage: 24,
    moveSpeed: 38,
    trades: [
      {
        id: 'elder_recall_crystal',
        giveItemId: 'gold_coin',
        giveCount: 540,
        receiveItemId: 'recall_crystal',
        receiveCount: 2,
        minAffinity: 45,
        affinityGain: 12,
        label: 'Cristal de Teleporte',
      },
      {
        id: 'elder_ambrosia',
        giveItemId: 'gold_coin',
        giveCount: 1150,
        receiveItemId: 'primordial_ambrosia',
        receiveCount: 1,
        minAffinity: 80,
        affinityGain: 20,
        label: 'Essência da Vida (+20 HP Máx)',
      },
      {
        id: 'elder_royal_wax_seal',
        giveItemId: 'gold_coin',
        giveCount: 180,
        receiveItemId: 'royal_wax_seal',
        receiveCount: 1,
        minAffinity: 0,
        affinityGain: 14,
        label: 'Selo de Cera Real (Requisito da Paz)',
      },
    ],
  },
  andarilho: {
    names: [
      'Andarilho Kael',
      'Peregrina Mira',
      'Viajante Doran',
      'Nômade Lyris',
      'Caminhante Tomas',
      'Exploradora Vesper',
    ],
    professionLabel: 'Andarilho Nômade (Buscando Moradia)',
    dialogues: [
      'Sigo caminhando pela Fronteira... Se eu encontrar uma Casa de Vila com vaga (até 2 moradores), deixarei de ser andarilho e me tornarei um Aldeão!',
      'Trago suprimentos de viagem! Respeito as casas dos aventureiros e busco apenas moradias comunitárias nas vilas.',
    ],
    hp: 150,
    attackDamage: 24,
    moveSpeed: 46,
    trades: [
      {
        id: 'wand_wood_coin',
        giveItemId: 'wood',
        giveCount: 15,
        receiveItemId: 'gold_coin',
        receiveCount: 12,
        minAffinity: 0,
        affinityGain: 10,
        label: 'Lenha de Acampamento',
      },
      {
        id: 'wand_bandage',
        giveItemId: 'gold_coin',
        giveCount: 16,
        receiveItemId: 'wool_bandage',
        receiveCount: 2,
        minAffinity: 0,
        affinityGain: 10,
        label: 'Suprimento de Primeiros Socorros',
      },
      {
        id: 'wand_apple',
        giveItemId: 'gold_coin',
        giveCount: 18,
        receiveItemId: 'apple',
        receiveCount: 3,
        minAffinity: 0,
        affinityGain: 10,
        label: 'Provisões de Estrada',
      },
      {
        id: 'wand_recall',
        giveItemId: 'gold_coin',
        giveCount: 270,
        receiveItemId: 'recall_crystal',
        receiveCount: 1,
        minAffinity: 35,
        affinityGain: 14,
        label: 'Bússola do Viajante',
      },
      {
        id: 'wand_royal_wax_seal',
        giveItemId: 'gold_coin',
        giveCount: 180,
        receiveItemId: 'royal_wax_seal',
        receiveCount: 1,
        minAffinity: 0,
        affinityGain: 12,
        label: 'Selo de Cera Real (Requisito da Paz)',
      },
    ],
  },
};

export class EntityManager {
  public creatures: CreatureEntity[] = [];
  private spawnTimer = 0;
  public isPositionIlluminatedCheck?: (wx: number, wy: number) => boolean;

  constructor(initialCreatures?: CreatureEntity[]) {
    if (initialCreatures) {
      this.creatures = initialCreatures;
    }
  }

  public static getDefaultTradesForRole(role?: NpcRole): NpcTradeOffer[] {
    const validRole: NpcRole =
      role && VILLAGER_PROFILES[role] ? role : 'mercador';
    return VILLAGER_PROFILES[validRole].trades.map((t) => ({ ...t }));
  }

  public static isMonsterKind(kind: CreatureKind): boolean {
    return (
      kind === CreatureKind.ZOMBIE ||
      kind === CreatureKind.OGRE ||
      kind === CreatureKind.FOREST_STALKER ||
      kind === CreatureKind.DESERT_SCORPION ||
      kind === CreatureKind.STONE_GOLEM ||
      kind === CreatureKind.BANDIT
    );
  }

  /**
   * Only Camel and Boar allies can attack enemies or be targeted as combat allies.
   */
  public static isCombatAllyKind(kind: CreatureKind): boolean {
    return kind === CreatureKind.CAMEL || kind === CreatureKind.BOAR;
  }

  /**
   * Peaceful animals (Horse, Sheep, Boat) never attack and are never targeted/attacked by hostile monsters.
   */
  public static isPeacefulAnimalKind(kind: CreatureKind): boolean {
    return (
      kind === CreatureKind.HORSE ||
      kind === CreatureKind.SHEEP ||
      kind === CreatureKind.COW ||
      kind === CreatureKind.BOAT
    );
  }

  public static isWildAnimalKind(kind: CreatureKind): boolean {
    return (
      kind === CreatureKind.SHEEP ||
      kind === CreatureKind.BOAR ||
      kind === CreatureKind.COW ||
      kind === CreatureKind.CAMEL ||
      kind === CreatureKind.HORSE
    );
  }

  /**
   * Alimento específico para reprodução de cada animal já domesticado:
   * - Ovelha: Frutas Silvestres ('berry')
   * - Javali: Maçã Dourada do Bosque ('apple')
   * - Vaca: Trigo ('wheat')
   * - Camelo: Fruto de Cacto ('cactus_fruit')
   * - Cavalo: Maçã Dourada do Bosque ('apple')
   */
  public static getBreedingFoodId(kind: CreatureKind): string | null {
    switch (kind) {
      case CreatureKind.SHEEP:
        return 'berry';
      case CreatureKind.BOAR:
        return 'apple';
      case CreatureKind.COW:
        return 'wheat';
      case CreatureKind.CAMEL:
        return 'cactus_fruit';
      case CreatureKind.HORSE:
        return 'apple';
      default:
        return null;
    }
  }

  public static getBabyName(kind: CreatureKind): string {
    switch (kind) {
      case CreatureKind.SHEEP:
        return 'Filhote de Ovelha';
      case CreatureKind.BOAR:
        return 'Filhote de Javali';
      case CreatureKind.COW:
        return 'Filhote de Vaca';
      case CreatureKind.CAMEL:
        return 'Filhote de Camelo';
      case CreatureKind.HORSE:
        return 'Filhote de Cavalo';
      default:
        return 'Filhote';
    }
  }

  public static getAdultName(kind: CreatureKind): string {
    switch (kind) {
      case CreatureKind.SHEEP:
        return 'Ovelha da Planície';
      case CreatureKind.BOAR:
        return 'Javali Silvestre';
      case CreatureKind.COW:
        return 'Vaca da Planície';
      case CreatureKind.CAMEL:
        return 'Camelo do Deserto';
      case CreatureKind.HORSE:
        return 'Cavalo da Planície';
      default:
        return 'Animal';
    }
  }

  /**
   * Counts living hostile mobs and untamed wild animals currently inside chunk `(cx, cy)`.
   * Used to enforce the global natural spawn cap of max 3 hostile mobs and max 3 wild animals per chunk separately.
   */
  public getChunkNaturalCreatureCounts(
    world: WorldManager,
    cx: number,
    cy: number
  ): { hostileMobs: number; wildAnimals: number } {
    let hostileMobs = 0;
    let wildAnimals = 0;
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      if (!c || c.hp <= 0) continue;
      const { tx, ty } = world.worldToTile(c.x, c.y);
      const cChunk = world.tileToChunk(tx, ty);
      if (cChunk.cx !== cx || cChunk.cy !== cy) continue;
      if (EntityManager.isMonsterKind(c.kind)) {
        hostileMobs++;
      } else if (!c.tamed && EntityManager.isWildAnimalKind(c.kind)) {
        wildAnimals++;
      }
    }
    return { hostileMobs, wildAnimals };
  }

  public static getFaction(cr: CreatureEntity): CreatureFaction {
    if (cr.tamed) return 'PLAYER_ALLY';
    if (
      cr.kind === CreatureKind.VILLAGER ||
      cr.kind === CreatureKind.WANDERER
    ) {
      return 'VILLAGER';
    }
    if (EntityManager.isMonsterKind(cr.kind)) {
      return 'MONSTER';
    }
    return 'WILDLIFE';
  }

  /**
   * Returns the specific swimming speed (`swimSpeed`) for a creature when in water,
   * distinct from its normal land `moveSpeed`.
   */
  public static getCreatureSwimSpeed(cr: CreatureEntity): number {
    if (typeof cr.swimSpeed === 'number' && cr.swimSpeed > 0) {
      return cr.swimSpeed;
    }
    const eliteMult = cr.isElite ? 1.1 : 1.0;
    switch (cr.kind) {
      case CreatureKind.SHEEP:
        return 22;
      case CreatureKind.COW:
        return 26;
      case CreatureKind.BOAR:
        return 32;
      case CreatureKind.CAMEL:
        return 30;
      case CreatureKind.HORSE:
        return 34;
      case CreatureKind.BOAT:
        return 152;
      case CreatureKind.ZOMBIE:
        return Math.round(28 * eliteMult);
      case CreatureKind.OGRE:
        return Math.round(25 * eliteMult);
      case CreatureKind.FOREST_STALKER:
        return Math.round(35 * eliteMult);
      case CreatureKind.DESERT_SCORPION:
        return Math.round(27 * eliteMult);
      case CreatureKind.STONE_GOLEM:
        return Math.round(19 * eliteMult);
      case CreatureKind.BANDIT:
        return Math.round(34 * eliteMult);
      case CreatureKind.VILLAGER:
      case CreatureKind.WANDERER:
      default:
        return Math.max(22, Math.round((cr.moveSpeed || 44) * 0.6));
    }
  }

  public spawnInitialAroundPlayer(world: WorldManager, px: number, py: number): void {
    if (this.creatures.length > 0) return;

    // Spawn a small flock of Sheep, a Cow, a Horse in the starter plains, and a Boar near the shrubland edge
    this.trySpawnCreatureAt(world, CreatureKind.SHEEP, px + 135, py + 85);
    this.trySpawnCreatureAt(world, CreatureKind.COW, px + 165, py + 105);
    this.trySpawnCreatureAt(world, CreatureKind.HORSE, px - 135, py - 115);
    this.trySpawnCreatureAt(world, CreatureKind.BOAR, px - 175, py + 115);
    this.trySpawnCreatureAt(world, CreatureKind.COW, px + 105, py - 155);

    // Spawn a friendly Wanderer traveling near the starter area so the player can meet them or build a house for them
    this.trySpawnCreatureAt(world, CreatureKind.WANDERER, px - 190, py - 95, {
      wanderAngle: 0.35,
      nameIndex: 0,
    });

    // Spawn a Zombie & Forest Stalker at a safe exploration distance
    this.trySpawnCreatureAt(world, CreatureKind.ZOMBIE, px + 420, py - 310);
    this.trySpawnCreatureAt(world, CreatureKind.FOREST_STALKER, px - 460, py + 340);
    this.trySpawnCreatureAt(world, CreatureKind.OGRE, px - 580, py - 480);
  }

  public trySpawnCreatureAt(
    world: WorldManager,
    kind: CreatureKind,
    wx: number,
    wy: number,
    options?: {
      customId?: string;
      isElite?: boolean;
      customName?: string;
      homeX?: number;
      homeY?: number;
      homeHouseId?: string;
      wanderAngle?: number;
      npcRole?: NpcRole;
      villageId?: string;
      nameIndex?: number;
      ignoreNaturalChunkCap?: boolean;
      forceWalkable?: boolean;
      isUnderground?: boolean;
    }
  ): CreatureEntity | null {
    const { tx, ty } = world.worldToTile(wx, wy);
    if (kind === CreatureKind.BOAT) {
      if (!world.isTileSwimmableWater(tx, ty)) return null;
    } else if (!options?.forceWalkable) {
      if (!world.isTileWalkable(tx, ty, false)) return null;
    }

    // Regra global de limite de spawn por geração natural:
    // - Mobs não spawnam naturalmente onde tem luz
    // - Máximo de 3 mobs hostis e 3 animais selvagens por chunk (contados separadamente)
    if (!options?.ignoreNaturalChunkCap) {
      const isHostileMob = EntityManager.isMonsterKind(kind);
      if (isHostileMob && this.isPositionIlluminatedCheck?.(wx, wy)) {
        return null;
      }
      const { cx, cy } = world.tileToChunk(tx, ty);
      const isWildAnimal = EntityManager.isWildAnimalKind(kind);
      if (isHostileMob || isWildAnimal) {
        const counts = this.getChunkNaturalCreatureCounts(world, cx, cy);
        if (isHostileMob && counts.hostileMobs >= 3) {
          return null;
        }
        if (isWildAnimal && counts.wildAnimals >= 3) {
          return null;
        }
      }
    }

    const isElite = Boolean(options?.isElite);

    const createConfig = (): Omit<
      CreatureEntity,
      | 'id'
      | 'x'
      | 'y'
      | 'vx'
      | 'vy'
      | 'direction'
      | 'animFrame'
      | 'animTimer'
      | 'attackTimer'
      | 'attackCooldown'
      | 'hitFlashTimer'
      | 'aiState'
      | 'aiTimer'
      | 'targetX'
      | 'targetY'
      | 'tamed'
      | 'tameProgress'
      | 'produceTimer'
    > => {
      switch (kind) {
        case CreatureKind.SHEEP:
          return {
            kind,
            name: options?.customName || 'Ovelha da Planície',
            isHostile: false,
            hp: 45,
            maxHp: 45,
            attackDamage: 8,
            moveSpeed: 38,
            swimSpeed: 22,
            favoriteFoodIds: ['berry', 'coconut', 'taming_treat'],
          };
        case CreatureKind.BOAR:
          return {
            kind,
            name: options?.customName || 'Javali Silvestre',
            isHostile: false,
            hp: 75,
            maxHp: 75,
            attackDamage: 14,
            moveSpeed: 52,
            swimSpeed: 32,
            favoriteFoodIds: ['apple', 'coconut', 'taming_treat'],
          };
        case CreatureKind.COW:
          return {
            kind,
            name: options?.customName || 'Vaca da Planície',
            isHostile: false,
            hp: 70,
            maxHp: 70,
            attackDamage: 8,
            moveSpeed: 36,
            swimSpeed: 26,
            favoriteFoodIds: ['wheat', 'apple', 'carrot', 'taming_treat'],
          };
        case CreatureKind.CAMEL:
          return {
            kind,
            name: options?.customName || 'Camelo do Deserto',
            isHostile: false,
            hp: 95,
            maxHp: 95,
            attackDamage: 12,
            moveSpeed: 58,
            swimSpeed: 30,
            favoriteFoodIds: ['cactus_fruit', 'coconut', 'taming_treat'],
            hasSaddle: false,
            mountSpeed: 132 + Math.floor(Math.random() * 28), // 132..159 px/s individual speed
            mountStamina: 165,
            mountMaxStamina: 165, // Higher gallop stamina than Horse
          };
        case CreatureKind.HORSE:
          return {
            kind,
            name: options?.customName || 'Cavalo da Planície',
            isHostile: false,
            hp: 90,
            maxHp: 90,
            attackDamage: 12,
            moveSpeed: 60,
            swimSpeed: 34,
            favoriteFoodIds: ['apple', 'taming_treat'],
            hasSaddle: false,
            mountSpeed: 136 + Math.floor(Math.random() * 34), // 136..169 px/s individual speed
            mountStamina: 100,
            mountMaxStamina: 100,
          };
        case CreatureKind.BOAT:
          return {
            kind,
            name: options?.customName || 'Bote de Madeira',
            isHostile: false,
            hp: 120,
            maxHp: 120,
            attackDamage: 0,
            moveSpeed: 152,
            swimSpeed: 152,
            favoriteFoodIds: [],
            mountSpeed: 152,
            isSwimming: true,
          };
        case CreatureKind.ZOMBIE:
          return {
            kind,
            name:
              options?.customName ||
              (isElite ? 'Zumbi Ancião' : 'Zumbi Errante'),
            isHostile: true,
            hp: isElite ? Math.round(65 * 2) : 65,
            maxHp: isElite ? Math.round(65 * 2) : 65,
            attackDamage: isElite ? Math.round(10 * 1.5) : 10,
            moveSpeed: isElite ? 52 : 48,
            swimSpeed: isElite ? 31 : 28,
            favoriteFoodIds: [],
          };
        case CreatureKind.OGRE:
          return {
            kind,
            name:
              options?.customName ||
              (isElite ? 'Ogro Brutal Alfa' : 'Ogro Brutamontes'),
            isHostile: true,
            hp: isElite ? Math.round(195 * 2) : 195,
            maxHp: isElite ? Math.round(195 * 2) : 195,
            attackDamage: isElite ? Math.round(40 * 1.5) : 40,
            moveSpeed: isElite ? 43 : 40,
            swimSpeed: isElite ? 28 : 25,
            favoriteFoodIds: [],
          };
        case CreatureKind.FOREST_STALKER:
          return {
            kind,
            name:
              options?.customName ||
              (isElite ? 'Aranha Rainha Sombria' : 'Aranha Tecelã da Mata'),
            isHostile: true,
            hp: isElite ? Math.round(85 * 2) : 85,
            maxHp: isElite ? Math.round(85 * 2) : 85,
            attackDamage: isElite ? Math.round(10 * 1.5) : 10,
            moveSpeed: isElite ? 64 : 58,
            swimSpeed: isElite ? 39 : 35,
            favoriteFoodIds: [],
            specialCooldown: 3.5,
          };
        case CreatureKind.DESERT_SCORPION:
          return {
            kind,
            name:
              options?.customName ||
              (isElite ? 'Escorpião Imperador Dourado' : 'Escorpião Rei da Areia'),
            isHostile: true,
            hp: isElite ? Math.round(100 * 2) : 100,
            maxHp: isElite ? Math.round(100 * 2) : 100,
            attackDamage: isElite ? Math.round(15 * 1.5) : 15,
            moveSpeed: isElite ? 56 : 52,
            swimSpeed: isElite ? 30 : 27,
            favoriteFoodIds: [],
            specialCooldown: 4.0,
          };
        case CreatureKind.STONE_GOLEM:
          return {
            kind,
            name:
              options?.customName ||
              (isElite ? 'Colosso Rúnico Ancestral' : 'Colosso Rúnico de Pedra'),
            isHostile: true,
            hp: isElite ? Math.round(300 * 2) : 300,
            maxHp: isElite ? Math.round(300 * 2) : 300,
            attackDamage: isElite ? Math.round(60 * 1.5) : 60,
            moveSpeed: isElite ? 39 : 35,
            swimSpeed: isElite ? 22 : 19,
            favoriteFoodIds: [],
            specialCooldown: 5.0,
          };
        case CreatureKind.BANDIT:
          return {
            kind,
            name:
              options?.customName ||
              (isElite ? 'Líder Saqueador Corvo' : 'Saqueador Renegado'),
            isHostile: true,
            hp: isElite ? Math.round(110 * 1.4) : 110,
            maxHp: isElite ? Math.round(110 * 1.4) : 110,
            attackDamage: isElite ? Math.round(15 * 1.25) : 15,
            moveSpeed: isElite ? 60 : 55,
            swimSpeed: isElite ? 37 : 34,
            favoriteFoodIds: [],
            specialCooldown: 0,
          };
        case CreatureKind.VILLAGER: {
          const role: NpcRole =
            options?.npcRole && options.npcRole !== 'andarilho'
              ? options.npcRole
              : 'mercador';
          const prof = VILLAGER_PROFILES[role];
          const idx = (options?.nameIndex ?? 0) % prof.names.length;
          return {
            kind,
            name: options?.customName || prof.names[idx],
            isHostile: false,
            faction: 'VILLAGER',
            hp: prof.hp,
            maxHp: prof.hp,
            attackDamage: prof.attackDamage,
            moveSpeed: prof.moveSpeed,
            swimSpeed: Math.round(prof.moveSpeed * 0.6),
            favoriteFoodIds: ['gold_coin', 'apple', 'warrior_feast'],
            npcRole: role,
            npcProfessionLabel: prof.professionLabel,
            affinity: 55,
            provokedTimer: 0,
            villageId: options?.villageId,
            trades: prof.trades.map((t) => ({ ...t })),
            dialogueLine: prof.dialogues[idx % prof.dialogues.length],
          };
        }
        case CreatureKind.WANDERER: {
          const prof = VILLAGER_PROFILES.andarilho;
          const idx =
            (options?.nameIndex ?? Math.floor(Math.random() * prof.names.length)) %
            prof.names.length;
          return {
            kind,
            name: options?.customName || prof.names[idx],
            isHostile: false,
            faction: 'VILLAGER',
            hp: prof.hp,
            maxHp: prof.hp,
            attackDamage: prof.attackDamage,
            moveSpeed: prof.moveSpeed,
            swimSpeed: Math.round(prof.moveSpeed * 0.6),
            favoriteFoodIds: ['gold_coin', 'apple', 'warrior_feast'],
            npcRole: 'andarilho',
            npcProfessionLabel: prof.professionLabel,
            affinity: 55,
            provokedTimer: 0,
            trades: prof.trades.map((t) => ({ ...t })),
            dialogueLine: prof.dialogues[idx % prof.dialogues.length],
          };
        }
      }
    };

    const cfg = createConfig();
    const spawnWorldX = tx * TILE_SIZE + TILE_SIZE / 2;
    const spawnWorldY = ty * TILE_SIZE + TILE_SIZE / 2;

    const entity: CreatureEntity = {
      ...cfg,
      id:
        options?.customId ||
        `cr_${kind}_${Date.now()}_${Math.floor(Math.random() * 99999)}`,
      x: spawnWorldX,
      y: spawnWorldY,
      vx: 0,
      vy: 0,
      direction: 'down',
      animFrame: 0,
      animTimer: 0,
      attackTimer: 0,
      attackCooldown: 0,
      hitFlashTimer: 0,
      aiState: kind === CreatureKind.BOAT ? 'stay' : 'wander',
      aiTimer: 2 + Math.random() * 3,
      targetX: options?.homeX ?? spawnWorldX,
      targetY: options?.homeY ?? spawnWorldY,
      tamed: kind === CreatureKind.BOAT,
      tameProgress: kind === CreatureKind.BOAT ? 100 : 0,
      produceTimer: 35,
      isElite,
      isUnderground: options?.isUnderground ?? Boolean(world.isUnderground),
      homeX: options?.homeX,
      homeY: options?.homeY,
      homeHouseId: options?.homeHouseId,
      wanderAngle:
        kind === CreatureKind.WANDERER
          ? options?.wanderAngle ?? Math.random() * Math.PI * 2
          : undefined,
    };
    entity.faction = EntityManager.getFaction(entity);
    if (
      entity.kind === CreatureKind.VILLAGER ||
      entity.kind === CreatureKind.WANDERER
    ) {
      EntityManager.ensureNpcHumanAppearance(entity);
    }

    this.creatures.push(entity);
    return entity;
  }

  /**
   * Garante que qualquer Aldeão (VILLAGER) ou Andarilho (WANDERER) possua aparência humana completa
   * (olhos, cabelos, pele, marcas faciais) e o traje específico da sua função, além da Armadura de Ferro
   * e Espada de Ferro para o Guardião da Vila.
   */
  public static ensureNpcHumanAppearance(cr: CreatureEntity): void {
    if (
      cr.kind !== CreatureKind.VILLAGER &&
      cr.kind !== CreatureKind.WANDERER
    ) {
      return;
    }

    const role: NpcRole =
      cr.kind === CreatureKind.WANDERER
        ? 'andarilho'
        : cr.npcRole || 'mercador';

    // Deterministic hash from ID + Name so each NPC has a persistent phenotype
    const seedStr = `${cr.id || ''}|${cr.name || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      hash ^= seedStr.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const h = Math.abs(hash);

    const lowerName = (cr.name || '').toLowerCase();
    const isFemaleName =
      lowerName.includes('lyra') ||
      lowerName.includes('selene') ||
      lowerName.includes('elara') ||
      lowerName.includes('valéria') ||
      lowerName.includes('valeria') ||
      lowerName.includes('aurelia') ||
      lowerName.includes('mira') ||
      lowerName.includes('lyris') ||
      lowerName.includes('vesper') ||
      lowerName.includes('nyx') ||
      lowerName.includes('mercadora') ||
      lowerName.includes('matriarca') ||
      lowerName.includes('peregrina') ||
      lowerName.includes('exploradora');

    if (!cr.appearance || !cr.appearance.hairStyle || !cr.appearance.eyeStyle) {
      const skinPalette = [
        '#fde68a',
        '#fdba74',
        '#e09f67',
        '#c68642',
        '#d97706',
        '#9c5221',
        '#92400e',
        '#5c2d16',
      ];
      const gender: PlayerGender = isFemaleName ? 'feminino' : 'masculino';
      let skinColor = skinPalette[h % skinPalette.length];
      let skinMark: SkinMarkId = 'none';
      let hairStyle: HairStyleId = 'adventurer';
      let hairColor = '#451a03';
      let eyeStyle: EyeStyleId = 'classic';
      let eyeColor = '#0f172a';

      if (role === 'ferreiro') {
        const smithSkins = ['#c68642', '#9c5221', '#d97706', '#fdba74', '#92400e'];
        const smithHairs = ['#451a03', '#1e293b', '#9a3412', '#b45309'];
        const smithEyes = ['#d97706', '#0f172a', '#16a34a'];
        skinColor = smithSkins[h % smithSkins.length];
        hairColor = smithHairs[(h >> 3) % smithHairs.length];
        eyeColor = smithEyes[(h >> 5) % smithEyes.length];
        hairStyle = isFemaleName
          ? (['ponytail', 'braided'][h % 2] as HairStyleId)
          : (['blacksmith_beard', 'warrior_crest', 'samurai_bun'][
              h % 3
            ] as HairStyleId);
        skinMark = isFemaleName
          ? 'freckles'
          : (['beard_stubble', 'eye_scar', 'none'][h % 3] as SkinMarkId);
        eyeStyle = (['fierce', 'veteran', 'sharp'][h % 3] as EyeStyleId);
      } else if (role === 'mercador') {
        const merchSkins = ['#fdba74', '#fde68a', '#e09f67', '#c68642', '#92400e'];
        const merchHairs = ['#9a3412', '#eab308', '#451a03', '#7e22ce', '#1e293b'];
        const merchEyes = ['#16a34a', '#2563eb', '#9333ea', '#14b8a6'];
        skinColor = merchSkins[h % merchSkins.length];
        hairColor = merchHairs[(h >> 3) % merchHairs.length];
        eyeColor = merchEyes[(h >> 5) % merchEyes.length];
        hairStyle = isFemaleName
          ? (['merchant_crown', 'valkyrie_bangs', 'noble_waves', 'twin_tails'][
              h % 4
            ] as HairStyleId)
          : (['noble_waves', 'merchant_crown', 'curly_crown'][
              h % 3
            ] as HairStyleId);
        skinMark = (['none', 'freckles'][h % 2] as SkinMarkId);
        eyeStyle = (['large', 'classic', 'calm'][h % 3] as EyeStyleId);
      } else if (role === 'guardiao') {
        const guardSkins = ['#e09f67', '#c68642', '#fdba74', '#9c5221', '#92400e'];
        const guardHairs = ['#1e293b', '#451a03', '#eab308', '#dc2626'];
        const guardEyes = ['#2563eb', '#94a3b8', '#d97706', '#0f172a'];
        skinColor = guardSkins[h % guardSkins.length];
        hairColor = guardHairs[(h >> 3) % guardHairs.length];
        eyeColor = guardEyes[(h >> 5) % guardEyes.length];
        hairStyle = isFemaleName
          ? (['valkyrie_bangs', 'ponytail', 'braided'][h % 3] as HairStyleId)
          : (['warrior_crest', 'samurai_bun', 'blacksmith_beard'][
              h % 3
            ] as HairStyleId);
        skinMark = (['eye_scar', 'freckles_and_scar', 'beard_stubble'][
          h % 3
        ] as SkinMarkId);
        eyeStyle = (['veteran', 'fierce', 'sharp'][h % 3] as EyeStyleId);
      } else if (role === 'anciao') {
        const elderSkins = ['#e09f67', '#fdba74', '#c68642', '#92400e'];
        const elderHairs = ['#f8fafc', '#cbd5e1', '#eab308'];
        const elderEyes = ['#94a3b8', '#14b8a6', '#9333ea', '#2563eb'];
        skinColor = elderSkins[h % elderSkins.length];
        hairColor = elderHairs[(h >> 3) % elderHairs.length];
        eyeColor = elderEyes[(h >> 5) % elderEyes.length];
        hairStyle = isFemaleName
          ? (['merchant_crown', 'long_mane', 'noble_waves'][
              h % 3
            ] as HairStyleId)
          : (['elder_sage', 'long_mane'][h % 2] as HairStyleId);
        skinMark = 'elder_wrinkles';
        eyeStyle = (['wise', 'mystic', 'calm'][h % 3] as EyeStyleId);
      } else {
        // andarilho (Wanderer)
        const wandHairs = [
          '#451a03',
          '#1e293b',
          '#9a3412',
          '#eab308',
          '#cbd5e1',
          '#0d9488',
        ];
        const wandEyes = [
          '#14b8a6',
          '#16a34a',
          '#d97706',
          '#2563eb',
          '#0f172a',
        ];
        skinColor = skinPalette[h % skinPalette.length];
        hairColor = wandHairs[(h >> 3) % wandHairs.length];
        eyeColor = wandEyes[(h >> 5) % wandEyes.length];
        hairStyle = isFemaleName
          ? (['nomad_wind', 'ponytail', 'braided', 'valkyrie_bangs'][
              h % 4
            ] as HairStyleId)
          : (['nomad_wind', 'adventurer', 'braided', 'samurai_bun'][
              h % 4
            ] as HairStyleId);
        skinMark = (['none', 'freckles', 'eye_scar', 'beard_stubble'][
          h % 4
        ] as SkinMarkId);
        if (isFemaleName && skinMark === 'beard_stubble') {
          skinMark = 'freckles';
        }
        eyeStyle = (['sharp', 'calm', 'classic', 'wise'][h % 4] as EyeStyleId);
      }

      cr.appearance = {
        gender,
        skinColor,
        skinMark,
        hairColor,
        hairStyle,
        eyeStyle,
        eyeColor,
      };
    }

    // Equip role-specific clothing/armor & held weapon
    if (role === 'guardiao') {
      cr.equippedBySlot = {
        head: 'iron_helmet',
        body: 'iron_armor',
        legs: 'iron_greaves',
        feet: 'iron_boots',
      };
      cr.heldItemId = 'iron_sword';
      // Ensure Guardian stats include Iron Armor (+65 HP) & Iron Sword (+25 ATQ)
      if (cr.maxHp < 285) {
        const hpRatio = cr.maxHp > 0 ? cr.hp / cr.maxHp : 1;
        cr.maxHp = 285;
        cr.hp = Math.max(1, Math.round(285 * hpRatio));
      }
      if (cr.attackDamage < 61) {
        cr.attackDamage = 61;
      }
    } else if (role === 'ferreiro') {
      const bandanaColors = ['vermelho', 'laranja', 'marrom', 'preto'] as const;
      const apronColors = ['marrom', 'preto', 'cinza', 'vermelho'] as const;
      const bandanaColor = bandanaColors[h % bandanaColors.length];
      const apronColor = apronColors[(h >> 2) % apronColors.length];
      cr.equippedBySlot = {
        head: getDyedGarmentItemId('blacksmith_bandana', bandanaColor),
        body: getDyedGarmentItemId('blacksmith_apron', apronColor),
        legs: getDyedGarmentItemId('pants', 'cinza'),
        feet: 'blacksmith_boots',
      };
      cr.heldItemId = 'iron_pickaxe';
    } else if (role === 'mercador') {
      const capColors = ['roxo', 'vermelho', 'azul', 'verde', 'magenta'] as const;
      const doubletColors = ['vermelho', 'roxo', 'azul', 'verde', 'laranja'] as const;
      const capColor = capColors[h % capColors.length];
      const doubletColor = doubletColors[(h >> 2) % doubletColors.length];
      cr.equippedBySlot = {
        head: getDyedGarmentItemId('merchant_cap', capColor),
        body: getDyedGarmentItemId('merchant_doublet', doubletColor),
        legs: 'merchant_slacks',
        feet: 'cowboy_boots',
      };
      cr.heldItemId = null;
    } else if (role === 'anciao') {
      const mitreColors = ['amarelo', 'branco', 'azul_claro', 'roxo'] as const;
      const robeColors = ['azul', 'branco', 'roxo', 'ciano'] as const;
      const mitreColor = mitreColors[h % mitreColors.length];
      const robeColor = robeColors[(h >> 2) % robeColors.length];
      cr.equippedBySlot = {
        head: getDyedGarmentItemId('elder_mitre', mitreColor),
        body: getDyedGarmentItemId('elder_robe', robeColor),
        legs: getDyedGarmentItemId('pants', 'branco'),
        feet: 'sandals',
      };
      cr.heldItemId = null;
    } else {
      // andarilho (Wanderer)
      const hoodColors = ['ciano', 'verde', 'marrom', 'azul', 'cinza'] as const;
      const ponchoColors = [
        'azul_claro',
        'ciano',
        'verde',
        'laranja',
        'bege',
      ] as const;
      const legColors = ['bege', 'marrom', 'cinza'] as const;
      const hoodColor = hoodColors[h % hoodColors.length];
      const ponchoColor = ponchoColors[(h >> 2) % ponchoColors.length];
      const legColor = legColors[(h >> 4) % legColors.length];
      cr.equippedBySlot = {
        head: getDyedGarmentItemId('wanderer_hood', hoodColor),
        body: getDyedGarmentItemId('wanderer_poncho', ponchoColor),
        legs: getDyedGarmentItemId('wanderer_leggings', legColor),
        feet: 'cowboy_boots',
      };
      cr.heldItemId = h % 2 === 0 ? 'wood_sword' : 'flint_spear';
    }
  }

  /**
   * Calcula a redução percentual de dano (0.0 a 0.75) conferida pelas roupas ou armaduras equipadas pelo NPC humano.
   * No caso do Guardião da Vila (Armadura de Ferro completa), concede 47% de redução de dano (0.10 + 0.18 + 0.11 + 0.08).
   */
  public static getCreatureDefenseReduction(cr: CreatureEntity): number {
    if (
      cr.kind !== CreatureKind.VILLAGER &&
      cr.kind !== CreatureKind.WANDERER
    ) {
      return 0;
    }
    EntityManager.ensureNpcHumanAppearance(cr);
    const eq: PlayerEquipment | undefined = cr.equippedBySlot;
    if (!eq) return 0;
    let totalDef = 0;
    const slots: Array<keyof PlayerEquipment> = ['head', 'body', 'legs', 'feet'];
    for (const slot of slots) {
      const itemId = eq[slot];
      if (itemId && ITEMS[itemId]?.defenseBonus) {
        totalDef += ITEMS[itemId].defenseBonus!;
      }
    }
    return Math.min(0.75, Math.max(0, totalDef));
  }

  /**
   * Converts a nomadic WANDERER into a settled VILLAGER when they find an available House (max 2 villagers per house).
   */
  public convertWandererToVillager(
    cr: CreatureEntity,
    houseId: string,
    houseX: number,
    houseY: number,
    villageId?: string
  ): void {
    if (cr.kind !== CreatureKind.WANDERER) return;

    const settledRoles: NpcRole[] = ['mercador', 'ferreiro', 'guardiao', 'anciao'];
    const rolePick =
      settledRoles[
        Math.abs(Math.floor(houseX + houseY + cr.x)) % settledRoles.length
      ];
    const prof = VILLAGER_PROFILES[rolePick];
    const baseName = cr.name
      .replace(/^(Andarilho|Peregrina|Viajante|Nômade|Caminhante|Exploradora)\s+/i, '')
      .trim();

    cr.kind = CreatureKind.VILLAGER;
    cr.faction = 'VILLAGER';
    cr.isHostile = false;
    cr.npcRole = rolePick;
    cr.name = `Aldeão ${baseName || 'Kael'}`;
    cr.npcProfessionLabel = `${prof.professionLabel} (Morador)`;
    cr.maxHp = prof.hp;
    cr.hp = prof.hp;
    cr.attackDamage = prof.attackDamage;
    cr.moveSpeed = prof.moveSpeed;
    cr.swimSpeed = Math.round(prof.moveSpeed * 0.6);
    cr.trades = prof.trades.map((t) => ({ ...t }));
    cr.dialogueLine =
      'Encontrei um lar seguro nesta casa! Agora sou um Aldeão e ajudarei a defender nossa moradia contra monstros.';
    cr.homeHouseId = houseId;
    cr.homeX = houseX;
    cr.homeY = houseY;
    cr.villageId = villageId || cr.villageId;
    cr.wanderAngle = undefined;
    cr.aiState = 'wander';
    cr.aiTimer = 1.5;
    EntityManager.ensureNpcHumanAppearance(cr);
  }

  /**
   * Checks if a world position is inside a safe lit base sanctuary (Campfire, Torch, Totem, Fountain, Tent, Workbench, Village).
   * Hostile mobs never spawn inside the player's protected base perimeter or inside a peaceful Village.
   */
  public isNearSafeSanctuary(world: WorldManager, wx: number, wy: number): boolean {
    const { tx, ty } = world.worldToTile(wx, wy);
    const { cx, cy } = world.tileToChunk(tx, ty);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = world.chunks[WorldManager.chunkKey(cx + dx, cy + dy)];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          if (
            st.type === PlaceableType.GUARDIAN_TOTEM ||
            st.type === PlaceableType.VILLAGE_WELL ||
            st.type === PlaceableType.VILLAGE_HOUSE ||
            st.type === PlaceableType.BED ||
            st.type === PlaceableType.ROYAL_BANNER ||
            st.type === PlaceableType.CAMPFIRE ||
            st.type === PlaceableType.WORKBENCH ||
            st.type === PlaceableType.EXPLORER_TENT ||
            st.type === PlaceableType.TORCH
          ) {
            const sx = st.tileX * TILE_SIZE + TILE_SIZE / 2;
            const sy = st.tileY * TILE_SIZE + TILE_SIZE / 2;
            const safeRad =
              st.type === PlaceableType.GUARDIAN_TOTEM ||
              st.type === PlaceableType.VILLAGE_WELL
                ? 320
                : 190;
            if (Math.hypot(wx - sx, wy - sy) < safeRad) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the given chunk is a procedural Village landmark chunk
   * (covers all 6 village variants: Vilarejo de Carvalho, Vilarejo de Carvalho Escuro,
   * Vilarejo de Pinheiros, Vilarejos Vizinhos da Fronteira, Vila Mercante do Oásis, Vilas Gêmeas do Oásis).
   */
  public static isVillageLandmarkChunk(chunk: ChunkData): boolean {
    if (!chunk) return false;
    if (chunk.villageId) return true;
    if (
      chunk.landmarkName &&
      (chunk.landmarkName.includes('Vilarejo') ||
        chunk.landmarkName.includes('Vila'))
    ) {
      return true;
    }
    return chunk.structures.some(
      (s) =>
        s.type === PlaceableType.VILLAGE_WELL &&
        s.id.startsWith('world_struct_')
    );
  }

  /**
   * Populates newly discovered chunks that contain procedural World Landmarks (Villages, Ruins, Shrines, Strongholds, Oases)
   * with appropriate NPCs, guardians, or wildlife herds once per chunk.
   * Also repairs any previously discovered village chunk that was left empty prior to v0.7.7-beta.
   */
  public populateNearbyLandmarkChunks(
    world: WorldManager,
    playerX: number,
    playerY: number,
    forUnderground?: boolean
  ): void {
    if (world.worldGenVersion < 2) return;
    const isUg =
      forUnderground !== undefined
        ? Boolean(forUnderground)
        : Boolean(world.isUnderground);
    const chunkMap = isUg ? world.undergroundChunks : world.surfaceChunks;
    const pTile = world.worldToTile(playerX, playerY);
    const pChunk = world.tileToChunk(pTile.tx, pTile.ty);

    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const chunk =
          chunkMap[WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy)];
        if (!chunk) continue;
        if (!chunk.explored.some((e) => e === 1)) continue;

        if (isUg || chunk.isUnderground) {
          if (!chunk.mobsPopulated) {
            this.populateUndergroundAirPocketMobs(world, chunk);
          }
          continue;
        }

        const isVillage = EntityManager.isVillageLandmarkChunk(chunk);
        if (!chunk.mobsPopulated) {
          chunk.mobsPopulated = true;
          if (isVillage) {
            chunk.villagePopulatedV2 = true;
          }
          chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
          this.spawnChunkLandmarkMobs(world, chunk);
        } else if (isVillage && !chunk.villagePopulatedV2) {
          const villageId =
            chunk.villageId || `village_${chunk.cx}_${chunk.cy}`;
          const centerWx = (chunk.cx * CHUNK_SIZE + 8) * TILE_SIZE + 16;
          const centerWy = (chunk.cy * CHUNK_SIZE + 8) * TILE_SIZE + 16;
          const hasExistingVillagers = this.creatures.some(
            (c) =>
              c.kind === CreatureKind.VILLAGER &&
              c.hp > 0 &&
              (c.villageId === villageId ||
                Math.hypot(c.x - centerWx, c.y - centerWy) <= 420)
          );
          const wellClaimedByPlayer = chunk.structures.some(
            (s) =>
              s.type === PlaceableType.VILLAGE_WELL && s.ownerType === 'PLAYER'
          );
          chunk.villagePopulatedV2 = true;
          chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;
          if (!hasExistingVillagers && !wellClaimedByPlayer) {
            this.spawnChunkLandmarkMobs(world, chunk);
          }
        }
      }
    }
  }

  /**
   * Populates an underground Air Pocket (Bolsão de Ar) with cave enemies:
   * ONLY Spider (`CreatureKind.FOREST_STALKER`) and Zombie (`CreatureKind.ZOMBIE`).
   * Triggered when the air pocket is discovered by the player.
   */
  public populateUndergroundAirPocketMobs(
    world: WorldManager,
    chunk: ChunkData
  ): void {
    if (!chunk || chunk.mobsPopulated) return;
    const chest = chunk.structures.find(
      (s) => s.type === PlaceableType.CHEST && s.id.startsWith('ug_chest_')
    );
    if (!chest) {
      chunk.mobsPopulated = true;
      return;
    }

    // Only spawn once the air pocket itself has been discovered (explored === 1 at or near the chest)
    const { lx: chestLx, ly: chestLy } = world.tileToChunk(
      chest.tileX,
      chest.tileY
    );
    if (chunk.explored[chestLy * CHUNK_SIZE + chestLx] !== 1) {
      return;
    }

    chunk.mobsPopulated = true;
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;

    const centerWx = chest.tileX * TILE_SIZE + TILE_SIZE / 2;
    const centerWy = chest.tileY * TILE_SIZE + TILE_SIZE / 2;

    // Collect open tiles inside the air pocket around the chest
    const openSpots: Array<{ wx: number; wy: number }> = [];
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = chest.tileX + dx;
        const ty = chest.tileY + dy;
        if (!world.getUndergroundBlockNodeAtTile(tx, ty, chunk)) {
          openSpots.push({
            wx: tx * TILE_SIZE + TILE_SIZE / 2,
            wy: ty * TILE_SIZE + TILE_SIZE / 2,
          });
        }
      }
    }

    if (openSpots.length === 0) return;

    // Spawn 1 Aranha (FOREST_STALKER) and 1 Zumbi (ZOMBIE) inside the air pocket
    const kinds: CreatureKind[] = [
      CreatureKind.FOREST_STALKER,
      CreatureKind.ZOMBIE,
    ];
    for (let i = 0; i < kinds.length; i++) {
      const spot =
        openSpots[(i * 3 + Math.abs(chunk.cx + chunk.cy)) % openSpots.length];
      this.trySpawnCreatureAt(world, kinds[i], spot.wx, spot.wy, {
        homeX: centerWx,
        homeY: centerWy,
        ignoreNaturalChunkCap: true,
        forceWalkable: true,
        isUnderground: true,
      });
    }
  }

  private spawnChunkLandmarkMobs(world: WorldManager, chunk: ChunkData): void {
    const centerWx = (chunk.cx * CHUNK_SIZE + 8) * TILE_SIZE + 16;
    const centerWy = (chunk.cy * CHUNK_SIZE + 8) * TILE_SIZE + 16;
    const nameSeed = Math.abs(chunk.cx * 31 + chunk.cy * 17);

    // 0. VILLAGE LANDMARKS — Populate with Villagers bound to their owned Beds inside the 4 Village Houses (or legacy Village Houses)
    if (EntityManager.isVillageLandmarkChunk(chunk)) {
      const villageId = chunk.villageId || `village_${chunk.cx}_${chunk.cy}`;
      chunk.villageId = villageId;
      chunk.villagePopulatedV2 = true;

      const defaultRoles: NpcRole[] = [
        'ferreiro',
        'mercador',
        'anciao',
        'guardiao',
      ];
      const villageBeds = chunk.structures.filter(
        (s) =>
          s.type === PlaceableType.BED &&
          s.ownerType !== 'PLAYER' &&
          (s.ownerType === 'VILLAGER' ||
            Boolean(s.npcRole) ||
            s.id.startsWith('world_struct_'))
      );

      if (villageBeds.length > 0) {
        for (let i = 0; i < villageBeds.length; i++) {
          const bed = villageBeds[i];
          const role: NpcRole =
            bed.npcRole || defaultRoles[i % defaultRoles.length];
          bed.npcRole = role;
          const hx = bed.tileX * TILE_SIZE + TILE_SIZE / 2;
          const hy = bed.tileY * TILE_SIZE + TILE_SIZE / 2;

          // Skip if this bed already has a living resident in the world
          const existingResident = this.creatures.find(
            (c) =>
              c.kind === CreatureKind.VILLAGER &&
              c.hp > 0 &&
              (c.homeHouseId === bed.id ||
                (bed.ownerId && c.id === bed.ownerId))
          );
          if (existingResident) {
            bed.ownerType = 'VILLAGER';
            bed.ownerId = existingResident.id;
            bed.ownerName = existingResident.name;
            bed.villageId = villageId;
            bed.structureOwnerClearedAfterLoss = false;
            continue;
          }

          // Candidate walkable plaza/path offsets around the central well and house doors
          const candidateWorldPositions: Array<[number, number]> = [
            [
              (chunk.cx * CHUNK_SIZE +
                (role === 'ferreiro' || role === 'anciao' ? 4 : 11)) *
                TILE_SIZE +
                16,
              (chunk.cy * CHUNK_SIZE +
                (role === 'ferreiro' || role === 'mercador' ? 5 : 10)) *
                TILE_SIZE +
                16,
            ],
            [
              (chunk.cx * CHUNK_SIZE +
                (role === 'ferreiro' || role === 'anciao' ? 6 : 9)) *
                TILE_SIZE +
                16,
              (chunk.cy * CHUNK_SIZE +
                (role === 'ferreiro' || role === 'mercador' ? 7 : 8)) *
                TILE_SIZE +
                16,
            ],
            [centerWx + (i % 2 === 0 ? -32 : 32), centerWy + (i < 2 ? -32 : 32)],
            [centerWx - 48, centerWy],
            [centerWx + 48, centerWy],
            [centerWx, centerWy - 48],
            [centerWx, centerWy + 48],
          ];

          let spawned: CreatureEntity | null = null;
          for (const [candWx, candWy] of candidateWorldPositions) {
            spawned = this.trySpawnCreatureAt(
              world,
              CreatureKind.VILLAGER,
              candWx,
              candWy,
              {
                customId: bed.ownerId,
                customName: bed.ownerName,
                npcRole: role,
                villageId,
                nameIndex: nameSeed + i,
                homeX: hx,
                homeY: hy,
                homeHouseId: bed.id,
                ignoreNaturalChunkCap: true,
              }
            );
            if (spawned) break;
          }

          // Guaranteed fallback so no village bed ever fails to spawn its Villager
          if (!spawned) {
            spawned = this.trySpawnCreatureAt(
              world,
              CreatureKind.VILLAGER,
              centerWx + (i % 2 === 0 ? -28 : 28),
              centerWy + (i < 2 ? -28 : 28),
              {
                customId: bed.ownerId,
                customName: bed.ownerName,
                npcRole: role,
                villageId,
                nameIndex: nameSeed + i,
                homeX: hx,
                homeY: hy,
                homeHouseId: bed.id,
                ignoreNaturalChunkCap: true,
                forceWalkable: true,
              }
            );
          }

          if (spawned) {
            bed.ownerType = 'VILLAGER';
            bed.ownerId = spawned.id;
            bed.ownerName = spawned.name;
            bed.villageId = villageId;
            bed.structureOwnerClearedAfterLoss = false;
            if (role === 'anciao') {
              const well = chunk.structures.find(
                (s) =>
                  s.type === PlaceableType.VILLAGE_WELL &&
                  s.ownerType !== 'PLAYER'
              );
              if (well) {
                well.ownerType = 'VILLAGER';
                well.ownerId = spawned.id;
                well.ownerName = spawned.name;
                well.npcRole = 'anciao';
                well.villageId = villageId;
                well.structureOwnerClearedAfterLoss = false;
              }
            }
          }
        }
        return;
      }

      // Legacy fallback for pre-existing saves with single-tile VILLAGE_HOUSE
      const villageHouses = chunk.structures.filter(
        (s) => s.type === PlaceableType.VILLAGE_HOUSE
      );
      const roles: { role: NpcRole; dx: number; dy: number }[] = [
        { role: 'mercador', dx: -48, dy: 48 },
        { role: 'anciao', dx: -48, dy: -48 },
        { role: 'ferreiro', dx: 48, dy: 48 },
        { role: 'guardiao', dx: 0, dy: 64 },
      ];
      for (let i = 0; i < roles.length; i++) {
        const r = roles[i];
        const assignedHouse =
          villageHouses.length >= 3
            ? villageHouses[i === 0 || i === 1 ? 0 : i === 2 ? 1 : 2]
            : villageHouses.length > 0
            ? villageHouses[Math.floor(i / MAX_VILLAGERS_PER_HOUSE) % villageHouses.length]
            : undefined;
        const hx = assignedHouse
          ? assignedHouse.tileX * TILE_SIZE + TILE_SIZE / 2
          : centerWx + r.dx * 0.6;
        const hy = assignedHouse
          ? assignedHouse.tileY * TILE_SIZE + TILE_SIZE / 2
          : centerWy + r.dy * 0.6;

        this.trySpawnCreatureAt(
          world,
          CreatureKind.VILLAGER,
          centerWx + r.dx,
          centerWy + r.dy,
          {
            npcRole: r.role,
            villageId,
            nameIndex: nameSeed + i,
            homeX: hx,
            homeY: hy,
            homeHouseId: assignedHouse?.id,
          }
        );
      }
      return;
    }

    if (chunk.landmarkName === 'Círculo Rúnico dos Golens') {
      this.trySpawnCreatureAt(
        world,
        CreatureKind.STONE_GOLEM,
        centerWx + 48,
        centerWy,
        {
          isElite: true,
          customName: 'Colosso Rúnico Ancestral',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      this.trySpawnCreatureAt(
        world,
        CreatureKind.STONE_GOLEM,
        centerWx - 48,
        centerWy + 32,
        {
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      return;
    }

    if (chunk.landmarkName === 'Reduto dos Saqueadores') {
      this.trySpawnCreatureAt(
        world,
        CreatureKind.BANDIT,
        centerWx,
        centerWy + 36,
        {
          isElite: true,
          customName: 'Líder Saqueador Corvo',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      this.trySpawnCreatureAt(
        world,
        CreatureKind.BANDIT,
        centerWx - 42,
        centerWy + 68,
        {
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      this.trySpawnCreatureAt(
        world,
        CreatureKind.BANDIT,
        centerWx + 42,
        centerWy + 68,
        {
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      return;
    }

    if (chunk.landmarkName === 'Ruínas da Torre de Vigia') {
      this.trySpawnCreatureAt(
        world,
        CreatureKind.ZOMBIE,
        centerWx + 48,
        centerWy + 32,
        {
          isElite: true,
          customName: 'Zumbi Sentinela',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      if (Math.hypot(chunk.cx, chunk.cy) >= 2.3) {
        this.trySpawnCreatureAt(
          world,
          CreatureKind.STONE_GOLEM,
          centerWx - 48,
          centerWy + 48,
          {
            isElite: true,
            customName: 'Colosso das Ruínas',
            homeX: centerWx,
            homeY: centerWy,
          }
        );
      } else {
        this.trySpawnCreatureAt(
          world,
          CreatureKind.BANDIT,
          centerWx - 48,
          centerWy - 32,
          {
            customName: 'Saqueador das Ruínas',
            homeX: centerWx,
            homeY: centerWy,
          }
        );
      }
      return;
    }

    if (chunk.landmarkName === 'Posto da Caravana') {
      // Camels are rare even at Caravan Outposts
      if (Math.random() < 0.25) {
        this.trySpawnCreatureAt(
          world,
          CreatureKind.CAMEL,
          centerWx - 44,
          centerWy + 38,
          { homeX: centerWx, homeY: centerWy }
        );
      }
      return;
    }

    if (chunk.landmarkName === 'Acampamento de Explorador') {
      this.trySpawnCreatureAt(
        world,
        CreatureKind.SHEEP,
        centerWx - 48,
        centerWy + 36,
        { homeX: centerWx, homeY: centerWy }
      );
      this.trySpawnCreatureAt(
        world,
        CreatureKind.HORSE,
        centerWx + 52,
        centerWy - 40,
        { homeX: centerWx, homeY: centerWy }
      );
      return;
    }

    if (chunk.landmarkName === 'Acampamento de Ogro') {
      const benches = chunk.structures.filter((s) =>
        WorldManager.isBenchStructure(s.type)
      );
      const ogreCount =
        ((Math.abs(chunk.cx * 73856093) ^
          Math.abs(chunk.cy * 19349663) ^
          world.seed) >>>
          0) %
          2 ===
        0
          ? 4
          : 3;

      for (let i = 0; i < Math.min(ogreCount, Math.max(4, benches.length)); i++) {
        const bench = benches[i];
        const bx = bench
          ? bench.tileX * TILE_SIZE + TILE_SIZE / 2
          : centerWx + (i === 0 ? 0 : i === 1 ? 64 : i === 2 ? 0 : -64);
        const by = bench
          ? bench.tileY * TILE_SIZE + TILE_SIZE / 2
          : centerWy + (i === 0 ? -64 : i === 1 ? 0 : i === 2 ? 64 : 0);
        const isElite = i === 0;
        const ogre = this.trySpawnCreatureAt(world, CreatureKind.OGRE, bx, by, {
          isElite,
          customName: isElite ? 'Ogro de Elite' : 'Ogro',
          homeX: centerWx,
          homeY: centerWy,
          ignoreNaturalChunkCap: true,
          forceWalkable: true,
        });
        if (ogre && bench) {
          ogre.x = bx;
          ogre.y = by;
          ogre.vx = 0;
          ogre.vy = 0;
          ogre.isSitting = true;
          ogre.sittingStructureId = bench.id;
          ogre.direction = WorldManager.getStructureFacingDirection(bench);
        }
      }
      return;
    }

    if (chunk.landmarkName === 'Santuário Primordial') {
      this.trySpawnCreatureAt(
        world,
        CreatureKind.OGRE,
        centerWx + 56,
        centerWy,
        {
          isElite: true,
          customName: 'Ogro Primordial Alfa',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      this.trySpawnCreatureAt(
        world,
        CreatureKind.FOREST_STALKER,
        centerWx - 52,
        centerWy + 42,
        {
          isElite: true,
          customName: 'Aranha Guardiã do Bosque',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
    }
  }

  private landmarkCheckTimer = 0;

  public updateSpawning(
    dt: number,
    world: WorldManager,
    playerX: number,
    playerY: number,
    isNight: boolean,
    additionalPlayerPositions?: Array<{
      x: number;
      y: number;
      isUnderground?: boolean;
    }>
  ): void {
    const activePlayers: Array<{
      x: number;
      y: number;
      isUnderground?: boolean;
    }> = [
      { x: playerX, y: playerY, isUnderground: Boolean(world.isUnderground) },
      ...(Array.isArray(additionalPlayerPositions)
        ? additionalPlayerPositions
        : []),
    ];

    this.landmarkCheckTimer -= dt;
    if (this.landmarkCheckTimer <= 0) {
      this.landmarkCheckTimer = 0.45;
      // Populate any newly revealed Landmark/Village/AirPocket chunks near any active player in their respective layer
      const prevLayer = world.isUnderground ? 'underground' : 'surface';
      try {
        for (const pPos of activePlayers) {
          const pUg = Boolean(pPos.isUnderground);
          world.setActiveLayer(pUg ? 'underground' : 'surface');
          this.populateNearbyLandmarkChunks(world, pPos.x, pPos.y, pUg);
        }
      } finally {
        world.setActiveLayer(prevLayer);
      }
    }

    // Filter to surface players for surface wildlife & night monster spawning
    const surfacePlayers = activePlayers.filter((p) => !p.isUnderground);
    if (surfacePlayers.length === 0) {
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = isNight ? 2.8 : 3.5;

    // Despawn untamed non-villager surface creatures very far from ALL surface players to keep memory low
    this.creatures = this.creatures.filter((c) => {
      if (
        c.isUnderground ||
        c.tamed ||
        c.kind === CreatureKind.VILLAGER ||
        c.kind === CreatureKind.BOAT
      ) {
        return true;
      }
      return surfacePlayers.some(
        (pPos) => Math.hypot(c.x - pPos.x, c.y - pPos.y) < 1480
      );
    });

    const wildCount = this.creatures.filter(
      (c) =>
        !c.isUnderground &&
        !c.tamed &&
        c.kind !== CreatureKind.VILLAGER &&
        c.kind !== CreatureKind.BOAT
    ).length;
    const maxWildPerPlayer = isNight ? 24 : 19;
    const maxWild = Math.min(48, maxWildPerPlayer * surfacePlayers.length);
    if (wildCount >= maxWild) return;

    const chosenAnchor =
      surfacePlayers[Math.floor(Math.random() * surfacePlayers.length)] ||
      surfacePlayers[0];
    const angle = Math.random() * Math.PI * 2;
    const dist = 330 + Math.random() * 440;
    const sx = chosenAnchor.x + Math.cos(angle) * dist;
    const sy = chosenAnchor.y + Math.sin(angle) * dist;

    const prevWorldLayer = world.isUnderground ? 'underground' : 'surface';
    world.setActiveLayer('surface');
    try {
      const biome = world.getBiomeAtWorld(sx, sy);
      // Ilha (BiomeType.ISLAND) só possui spawn de mobs/animais no momento de sua descoberta
      if (biome === BiomeType.OCEAN || biome === BiomeType.ISLAND) return;

      const zone = world.getEcologicalZoneAtWorld(sx, sy);
    const distFromOriginTiles = Math.hypot(sx / TILE_SIZE, sy / TILE_SIZE);
    const roll = Math.random();

    // Determine species & group size based on EcologicalZone, Day/Night, and Distance from Origin
    let kind: CreatureKind | null = null;
    let groupSize = 1;
    let isElite = false;

    if (isNight) {
      // Nighttime Ecosystem: Zombies, Forest Stalkers, Desert Scorpions, Bandits & Ogres roam
      if (
        biome === BiomeType.DESERT &&
        zone !== EcologicalZone.COASTAL_TROPICS &&
        roll < 0.34
      ) {
        kind = CreatureKind.DESERT_SCORPION;
        isElite = distFromOriginTiles > 36 && Math.random() < 0.25;
      } else if (
        (zone === EcologicalZone.DENSE_WOODLAND ||
          zone === EcologicalZone.OVERGROWN_SHRUBLAND) &&
        roll < 0.36
      ) {
        kind = CreatureKind.FOREST_STALKER;
        groupSize = Math.random() < 0.35 ? 2 : 1;
      } else if (roll < 0.62) {
        kind = CreatureKind.ZOMBIE;
        groupSize = Math.random() < 0.45 ? 2 : 1;
        isElite = distFromOriginTiles > 38 && Math.random() < 0.25;
      } else if (roll < 0.78 && distFromOriginTiles > 18) {
        kind =
          zone === EcologicalZone.ROCKY_HIGHLANDS ||
          zone === EcologicalZone.CRYSTAL_BADLANDS
            ? CreatureKind.STONE_GOLEM
            : CreatureKind.OGRE;
        isElite = distFromOriginTiles > 44 && Math.random() < 0.22;
      } else if (roll < 0.9 && distFromOriginTiles > 16) {
        kind = CreatureKind.BANDIT;
        groupSize = Math.random() < 0.4 ? 2 : 1;
      } else {
        kind =
          biome === BiomeType.DESERT && zone !== EcologicalZone.COASTAL_TROPICS
            ? Math.random() < 0.08
              ? CreatureKind.CAMEL
              : CreatureKind.DESERT_SCORPION
            : Math.random() < 0.25
              ? CreatureKind.HORSE
              : CreatureKind.SHEEP;
      }
    } else {
      // Daytime Ecological Habitat Spawning
      switch (zone) {
        case EcologicalZone.MEADOW_CLEARING:
        case EcologicalZone.COASTAL_TROPICS: {
          if (roll < 0.36) {
            kind = CreatureKind.SHEEP;
            groupSize = Math.random() < 0.55 ? 2 : 1;
          } else if (roll < 0.64) {
            kind = CreatureKind.COW;
            groupSize = Math.random() < 0.45 ? 2 : 1;
          } else if (roll < 0.82) {
            kind = CreatureKind.HORSE;
            groupSize = Math.random() < 0.25 ? 2 : 1;
          } else if (roll < 0.95 || distFromOriginTiles < 18) {
            kind = CreatureKind.BOAR;
          } else {
            kind = CreatureKind.BANDIT;
          }
          break;
        }

        case EcologicalZone.OVERGROWN_SHRUBLAND: {
          if (roll < 0.36) {
            kind = CreatureKind.BOAR;
            groupSize = Math.random() < 0.4 ? 2 : 1;
          } else if (roll < 0.54) {
            kind = CreatureKind.SHEEP;
          } else if (roll < 0.7) {
            kind = CreatureKind.COW;
          } else if (roll < 0.8) {
            kind = CreatureKind.HORSE;
          } else if (roll < 0.9 && distFromOriginTiles > 14) {
            kind = CreatureKind.FOREST_STALKER;
          } else if (distFromOriginTiles > 18) {
            kind = CreatureKind.BANDIT;
          } else {
            kind = CreatureKind.BOAR;
          }
          break;
        }

        case EcologicalZone.DENSE_WOODLAND:
        case EcologicalZone.ANCIENT_GROVE: {
          if (roll < 0.34) {
            kind = CreatureKind.BOAR;
            groupSize = Math.random() < 0.35 ? 2 : 1;
          } else if (roll < 0.64) {
            kind = CreatureKind.FOREST_STALKER;
            isElite =
              zone === EcologicalZone.ANCIENT_GROVE && Math.random() < 0.3;
          } else if (roll < 0.82) {
            kind = CreatureKind.ZOMBIE;
          } else if (distFromOriginTiles > 20) {
            kind = CreatureKind.OGRE;
            isElite = distFromOriginTiles > 42 && Math.random() < 0.25;
          } else {
            kind = CreatureKind.SHEEP;
          }
          break;
        }

        case EcologicalZone.ROCKY_HIGHLANDS: {
          if (roll < 0.34 && distFromOriginTiles > 16) {
            kind = CreatureKind.STONE_GOLEM;
            isElite = distFromOriginTiles > 38 && Math.random() < 0.25;
          } else if (roll < 0.58 && distFromOriginTiles > 16) {
            kind = CreatureKind.OGRE;
          } else if (roll < 0.78 && distFromOriginTiles > 15) {
            kind = CreatureKind.BANDIT;
          } else {
            kind = CreatureKind.BOAR;
          }
          break;
        }

        case EcologicalZone.OPEN_SAND_DUNES:
        case EcologicalZone.DESERT_OASIS: {
          // Camels are now very rare in the desert (~7% chance)
          if (roll < 0.07) {
            kind = CreatureKind.CAMEL;
            groupSize = 1;
          } else if (roll < 0.64) {
            kind = CreatureKind.DESERT_SCORPION;
          } else if (distFromOriginTiles > 18) {
            kind = CreatureKind.BANDIT;
          } else {
            kind = CreatureKind.DESERT_SCORPION;
          }
          break;
        }

        case EcologicalZone.CACTUS_SCRUBLAND:
        case EcologicalZone.CRYSTAL_BADLANDS:
        default: {
          // Camels are very rare (~5% chance)
          if (roll < 0.05) {
            kind = CreatureKind.CAMEL;
            groupSize = 1;
          } else if (roll < 0.62) {
            kind = CreatureKind.DESERT_SCORPION;
            isElite =
              zone === EcologicalZone.CRYSTAL_BADLANDS && Math.random() < 0.28;
          } else if (roll < 0.84 && distFromOriginTiles > 18) {
            kind =
              zone === EcologicalZone.CRYSTAL_BADLANDS
                ? CreatureKind.STONE_GOLEM
                : CreatureKind.OGRE;
            isElite = distFromOriginTiles > 36 && Math.random() < 0.25;
          } else {
            kind = CreatureKind.BANDIT;
          }
          break;
        }
      }
    }

      // Random chance to spawn a nomadic WANDERER anywhere on land if fewer than 3 Wanderers are currently roaming
      const activeWanderers = this.creatures.filter(
        (c) => c.kind === CreatureKind.WANDERER && c.hp > 0
      ).length;
      if (activeWanderers < 3 && Math.random() < (isNight ? 0.08 : 0.14)) {
        // Pick a walking direction that roughly passes near the anchor player's general region so the player can cross paths with them
        const dirToPlayer = Math.atan2(
          chosenAnchor.y - sy,
          chosenAnchor.x - sx
        );
        const wanderAngle = dirToPlayer + (Math.random() - 0.5) * 1.1;
        this.trySpawnCreatureAt(world, CreatureKind.WANDERER, sx, sy, {
          wanderAngle,
          nameIndex: Math.floor(Math.random() * 10),
        });
        return;
      }

      if (!kind) return;

      const isHostileKind = EntityManager.isMonsterKind(kind);
      if (isHostileKind && this.isNearSafeSanctuary(world, sx, sy)) {
        return;
      }

      for (let i = 0; i < groupSize; i++) {
        const offsetX = i === 0 ? 0 : (Math.random() - 0.5) * 48;
        const offsetY = i === 0 ? 0 : (Math.random() - 0.5) * 48;
        const candX = sx + offsetX;
        const candY = sy + offsetY;
        if (world.getBiomeAtWorld(candX, candY) === BiomeType.ISLAND) continue;
        this.trySpawnCreatureAt(world, kind, candX, candY, {
          isElite: i === 0 && isElite,
        });
      }
    } finally {
      world.setActiveLayer(prevWorldLayer);
    }
  }

  /**
   * Realiza o spawn único de mobs e animais selvagens no bioma ILHA (`BiomeType.ISLAND`)
   * exatamente no momento de sua descoberta, com chance de spawn 30% maior (`* 1.3`)
   * e respeitando o limite global por chunk (máx 3 mobs hostis e 3 animais selvagens).
   */
  public spawnIslandDiscoveryCreatures(
    world: WorldManager,
    chunk: ChunkData,
    isNight: boolean
  ): void {
    if (!chunk || chunk.islandMobsPopulated) return;
    chunk.islandMobsPopulated = true;
    chunk.dirtyRev = (chunk.dirtyRev || 0) + 1;

    const islandTiles: { tx: number; ty: number; zone: EcologicalZone }[] = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        if (chunk.tiles[idx] === BiomeType.ISLAND) {
          const tx = chunk.cx * CHUNK_SIZE + lx;
          const ty = chunk.cy * CHUNK_SIZE + ly;
          if (world.isTileWalkable(tx, ty, false)) {
            const zone =
              chunk.ecologicalZones?.[idx] ??
              world.getEcologicalZoneAtTile(tx, ty);
            islandTiles.push({ tx, ty, zone });
          }
        }
      }
    }

    if (islandTiles.length === 0) return;

    // Chance de spawn de qualquer tipo 30% maior (* 1.3) na descoberta da Ilha
    const ISLAND_SPAWN_BOOST = 1.3;
    const baseAttemptChance = 0.48 * ISLAND_SPAWN_BOOST; // ~62.4% por tentativa
    const maxAttempts = Math.min(6, Math.max(2, Math.ceil(islandTiles.length / 18)));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Math.random() > baseAttemptChance) continue;

      const pick =
        islandTiles[Math.floor(Math.random() * islandTiles.length)];
      const wx = pick.tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = pick.ty * TILE_SIZE + TILE_SIZE / 2;
      const distFromOriginTiles = Math.hypot(pick.tx, pick.ty);
      const roll = Math.random();

      // Decide entre animal selvagem e mob hostil na descoberta da ilha
      const animalRollThreshold = isNight ? 0.42 : 0.62;
      if (roll < animalRollThreshold) {
        const subRoll = Math.random();
        const animalKind =
          subRoll < 0.3
            ? CreatureKind.SHEEP
            : subRoll < 0.56
            ? CreatureKind.COW
            : subRoll < 0.8
            ? CreatureKind.BOAR
            : subRoll < 0.94
            ? CreatureKind.HORSE
            : CreatureKind.CAMEL;
        this.trySpawnCreatureAt(world, animalKind, wx, wy);
      } else {
        if (this.isNearSafeSanctuary(world, wx, wy)) continue;
        const subRoll = Math.random();
        let mobKind: CreatureKind = CreatureKind.ZOMBIE;
        if (
          pick.zone === EcologicalZone.ROCKY_HIGHLANDS &&
          subRoll < 0.45
        ) {
          mobKind = CreatureKind.STONE_GOLEM;
        } else if (
          (pick.zone === EcologicalZone.DENSE_WOODLAND ||
            pick.zone === EcologicalZone.ANCIENT_GROVE ||
            pick.zone === EcologicalZone.OVERGROWN_SHRUBLAND) &&
          subRoll < 0.48
        ) {
          mobKind = CreatureKind.FOREST_STALKER;
        } else if (subRoll < 0.35) {
          mobKind = CreatureKind.BANDIT;
        } else if (subRoll < 0.58 && distFromOriginTiles > 18) {
          mobKind = CreatureKind.OGRE;
        } else if (subRoll < 0.72) {
          mobKind = CreatureKind.DESERT_SCORPION;
        } else {
          mobKind = CreatureKind.ZOMBIE;
        }
        const isElite =
          distFromOriginTiles > 24 &&
          Math.random() < 0.18 * ISLAND_SPAWN_BOOST;
        this.trySpawnCreatureAt(world, mobKind, wx, wy, { isElite });
      }
    }
  }

  public static vectorToDirection(
    vx: number,
    vy: number,
    fallback: Direction
  ): Direction {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return fallback;
    if (Math.abs(vx) > Math.abs(vy)) {
      return vx > 0 ? 'right' : 'left';
    }
    return vy > 0 ? 'down' : 'up';
  }
}
