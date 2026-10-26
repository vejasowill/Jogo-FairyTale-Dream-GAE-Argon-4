import {
  BiomeType,
  ChunkData,
  CreatureEntity,
  CreatureFaction,
  CreatureKind,
  Direction,
  EcologicalZone,
  NpcRole,
  NpcTradeOffer,
  PlaceableType,
} from '../core/types';
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
    names: ['Capitão Thorne', 'Sentinela Garrick', 'Valéria Escudo-Solar', 'Comandante Roland'],
    professionLabel: 'Guardião Juramentado da Vila',
    dialogues: [
      'Mantenha a paz em nosso vilarejo e minha lâmina protegerá você contra qualquer monstro.',
      'Pagamos recompensas em ouro para quem eliminar Zumbis, Ogros e Saqueadores!',
    ],
    hp: 220,
    attackDamage: 36,
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
        label: 'Arsenal Solar de Aliado',
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
      'Núcleos de Colosso e Cristais Solares guardam a memória do mundo antigo.',
    ],
    hp: 145,
    attackDamage: 24,
    moveSpeed: 38,
    trades: [
      {
        id: 'elder_solar_coin',
        giveItemId: 'solar_crystal',
        giveCount: 2,
        receiveItemId: 'gold_coin',
        receiveCount: 90,
        minAffinity: 0,
        affinityGain: 10,
        label: 'Tributo de Cristal Solar',
      },
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
        id: 'elder_golem_astral',
        giveItemId: 'golem_core',
        giveCount: 2,
        receiveItemId: 'astral_shard',
        receiveCount: 1,
        minAffinity: 65,
        affinityGain: 16,
        label: 'Transmutação de Colosso',
      },
      {
        id: 'elder_ambrosia',
        giveItemId: 'gold_coin',
        giveCount: 1150,
        receiveItemId: 'primordial_ambrosia',
        receiveCount: 1,
        minAffinity: 80,
        affinityGain: 20,
        label: 'Bênção Suprema da Vila (+20 HP Máx)',
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
        label: 'Bússola Astral do Viajante',
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

    // Spawn a small flock of Sheep, a Horse in the starter plains, and a Boar near the shrubland edge
    this.trySpawnCreatureAt(world, CreatureKind.SHEEP, px + 135, py + 85);
    this.trySpawnCreatureAt(world, CreatureKind.SHEEP, px + 165, py + 105);
    this.trySpawnCreatureAt(world, CreatureKind.HORSE, px - 135, py - 115);
    this.trySpawnCreatureAt(world, CreatureKind.BOAR, px - 175, py + 115);
    this.trySpawnCreatureAt(world, CreatureKind.SHEEP, px + 105, py - 155);

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
      isElite?: boolean;
      customName?: string;
      homeX?: number;
      homeY?: number;
      homeHouseId?: string;
      wanderAngle?: number;
      npcRole?: NpcRole;
      villageId?: string;
      nameIndex?: number;
    }
  ): CreatureEntity | null {
    const { tx, ty } = world.worldToTile(wx, wy);
    if (kind === CreatureKind.BOAT) {
      if (!world.isTileSwimmableWater(tx, ty)) return null;
    } else {
      if (!world.isTileWalkable(tx, ty, false)) return null;
    }

    const isElite = Boolean(options?.isElite);
    const hpMult = isElite ? 1.4 : 1.0;
    const dmgMult = isElite ? 1.25 : 1.0;

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
            hp: Math.round(65 * hpMult),
            maxHp: Math.round(65 * hpMult),
            attackDamage: Math.round(14 * dmgMult),
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
            hp: Math.round(190 * hpMult),
            maxHp: Math.round(190 * hpMult),
            attackDamage: Math.round(32 * dmgMult),
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
            hp: Math.round(82 * hpMult),
            maxHp: Math.round(82 * hpMult),
            attackDamage: Math.round(17 * dmgMult),
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
            hp: Math.round(115 * hpMult),
            maxHp: Math.round(115 * hpMult),
            attackDamage: Math.round(22 * dmgMult),
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
            hp: Math.round(235 * hpMult),
            maxHp: Math.round(235 * hpMult),
            attackDamage: Math.round(36 * dmgMult),
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
            hp: Math.round(95 * hpMult),
            maxHp: Math.round(95 * hpMult),
            attackDamage: Math.round(19 * dmgMult),
            moveSpeed: isElite ? 60 : 55,
            swimSpeed: isElite ? 37 : 34,
            favoriteFoodIds: [],
            specialCooldown: 6.0,
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
            favoriteFoodIds: ['gold_coin', 'apple', 'solar_crystal', 'warrior_feast'],
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
            favoriteFoodIds: ['gold_coin', 'apple', 'solar_crystal', 'warrior_feast'],
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
      id: `cr_${kind}_${Date.now()}_${Math.floor(Math.random() * 99999)}`,
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
      homeX: options?.homeX,
      homeY: options?.homeY,
      homeHouseId: options?.homeHouseId,
      wanderAngle:
        kind === CreatureKind.WANDERER
          ? options?.wanderAngle ?? Math.random() * Math.PI * 2
          : undefined,
    };
    entity.faction = EntityManager.getFaction(entity);

    this.creatures.push(entity);
    return entity;
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
            st.type === PlaceableType.HEALING_FOUNTAIN ||
            st.type === PlaceableType.VILLAGE_WELL ||
            st.type === PlaceableType.VILLAGE_HOUSE ||
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
   * Populates newly discovered chunks that contain procedural World Landmarks (Villages, Ruins, Shrines, Strongholds, Oases)
   * with appropriate NPCs, guardians, or wildlife herds once per chunk.
   */
  private populateNearbyLandmarkChunks(
    world: WorldManager,
    playerX: number,
    playerY: number
  ): void {
    if (world.worldGenVersion < 2) return;
    const pTile = world.worldToTile(playerX, playerY);
    const pChunk = world.tileToChunk(pTile.tx, pTile.ty);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = world.chunks[WorldManager.chunkKey(pChunk.cx + dx, pChunk.cy + dy)];
        if (!chunk || chunk.mobsPopulated) continue;
        if (!chunk.explored.some((e) => e === 1)) continue;

        chunk.mobsPopulated = true;
        this.spawnChunkLandmarkMobs(world, chunk);
      }
    }
  }

  private spawnChunkLandmarkMobs(world: WorldManager, chunk: ChunkData): void {
    const centerWx = (chunk.cx * CHUNK_SIZE + 8) * TILE_SIZE + 16;
    const centerWy = (chunk.cy * CHUNK_SIZE + 8) * TILE_SIZE + 16;
    const nameSeed = Math.abs(chunk.cx * 31 + chunk.cy * 17);

    // 0. VILLAGE LANDMARKS — Populate with 4 named NPCs (Ferreiro, Mercadora, Guardião, Ancião) bound to Village Houses (up to 2 per house)
    if (
      chunk.landmarkName === 'Vilarejo de Carvalho' ||
      chunk.landmarkName === 'Vila Mercante do Oásis'
    ) {
      const villageId = chunk.villageId || `village_${chunk.cx}_${chunk.cy}`;
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
        // Assign at most 2 villagers per house (House 0 gets 2, House 1 gets 1, House 2 gets 1 -> leaving 2 open beds in the village!)
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

    if (chunk.landmarkName === 'Santuário Solar Antigo') {
      this.trySpawnCreatureAt(
        world,
        CreatureKind.DESERT_SCORPION,
        centerWx + 52,
        centerWy + 40,
        {
          isElite: true,
          customName: 'Escorpião Imperador Solar',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
      this.trySpawnCreatureAt(
        world,
        CreatureKind.STONE_GOLEM,
        centerWx - 52,
        centerWy + 36,
        {
          isElite: true,
          customName: 'Colosso Solar',
          homeX: centerWx,
          homeY: centerWy,
        }
      );
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

  public updateSpawning(
    dt: number,
    world: WorldManager,
    playerX: number,
    playerY: number,
    isNight: boolean
  ): void {
    // 1. Despawn untamed non-villager creatures very far from player to keep mobile memory low
    this.creatures = this.creatures.filter((c) => {
      if (c.tamed || c.kind === CreatureKind.VILLAGER || c.kind === CreatureKind.BOAT) return true;
      const dist = Math.hypot(c.x - playerX, c.y - playerY);
      return dist < 1480;
    });

    // 2. Populate any newly revealed Landmark/Village chunks near the player
    this.populateNearbyLandmarkChunks(world, playerX, playerY);

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = isNight ? 2.8 : 3.5;

    const wildCount = this.creatures.filter(
      (c) => !c.tamed && c.kind !== CreatureKind.VILLAGER && c.kind !== CreatureKind.BOAT
    ).length;
    const maxWild = isNight ? 24 : 19;
    if (wildCount >= maxWild) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 330 + Math.random() * 440;
    const sx = playerX + Math.cos(angle) * dist;
    const sy = playerY + Math.sin(angle) * dist;

    const biome = world.getBiomeAtWorld(sx, sy);
    if (biome === BiomeType.OCEAN) return;

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
          if (roll < 0.54) {
            kind = CreatureKind.SHEEP;
            groupSize = Math.random() < 0.55 ? 2 : 1;
          } else if (roll < 0.78) {
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
          if (roll < 0.42) {
            kind = CreatureKind.BOAR;
            groupSize = Math.random() < 0.4 ? 2 : 1;
          } else if (roll < 0.64) {
            kind = CreatureKind.SHEEP;
          } else if (roll < 0.78) {
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
      // Pick a walking direction that roughly passes near the player's general region so the player can cross paths with them
      const dirToPlayer = Math.atan2(playerY - sy, playerX - sx);
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
      this.trySpawnCreatureAt(world, kind, sx + offsetX, sy + offsetY, {
        isElite: i === 0 && isElite,
      });
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
