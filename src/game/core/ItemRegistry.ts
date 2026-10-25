import {
  ConstructionBlueprint,
  ItemCategory,
  ItemDefinition,
  MaterialKind,
  NatureNodeType,
  PlaceableType,
  RarityTier,
  ToolType,
} from './types';

export const ITEMS: Record<string, ItemDefinition> = {
  // === BASIC RESOURCES ===
  wood: {
    id: 'wood',
    name: 'Madeira Rústica',
    description:
      'Tronco básico cortado de carvalhos e palmeiras. Base estrutural para ferramentas, estações, pontes, armadilhas e combustível de fundição.',
    purposeSummary:
      'Cria Bancada, Fogueira, Tochas, Ferramentas Iniciais, Pontes Costeiras, Muros, Pisos, Armadilhas de Espinhos e funde Minério de Ferro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  stone: {
    id: 'stone',
    name: 'Pedra Bruta',
    description:
      'Fragmento de rocha resistente das planícies e desertos. Essencial para alvenaria, fornalhas, calçadas de velocidade e fontes.',
    purposeSummary:
      'Cria Machado/Picareta de Pedra, Fogueira, Fornalha de Fundição, Calçada de Pedra Real (+22% Velocidade), Muralhas e Fonte Abissal.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  fiber: {
    id: 'fiber',
    name: 'Fibra Vegetal',
    description:
      'Fibras trançadas de arbustos e cactos. Indispensável para amarras de armas, tecidos de cura, armaduras e tendas.',
    purposeSummary:
      'Cria Bandagem Real de Lã, Lança de Sílex, Armadilha de Espinhos, Túnica, Pontes, Ração Aromática e Tenda do Aventureiro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  flint: {
    id: 'flint',
    name: 'Sílex Afiado',
    description:
      'Lasca mineral pontiaguda e inflamável extraída de rochas e drusas. Usada em lâminas perfurantes, armadilhas e explosivos.',
    purposeSummary:
      'Cria Espada de Sílex, Lança de Sílex (Longo Alcance), Armadilha de Espinhos, Fornalha de Fundição e Bomba Solar Explosiva.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  wool: {
    id: 'wool',
    name: 'Lã Macia',
    description:
      'Fibra térmica macia produzida periodicamente por Ovelhas domesticadas. Usada para curativos de emergência, armaduras acolchoadas e tendas de descanso.',
    purposeSummary:
      'Cria Bandagem Real de Lã (+45 HP), Tenda de Lã & Couro (Dormir/Avançar a Noite), Túnica de Lã e Couraça de Ferro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },

  // === CONSUMABLES / TAMING FOODS & POTIONS ===
  berry: {
    id: 'berry',
    name: 'Frutas Silvestres',
    description:
      'Frutas doces da planície. Restaura fome rapidamente, domestica Ovelhas e serve de base para elixires e bandagens.',
    purposeSummary:
      'Consumir (+18 Fome, +6 HP), Domesticar Ovelha da Planície, ou criar Bandagem Real, Ração Aromática e Elixir de Ervas.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hungerRestore: 18,
    hpRestore: 6,
    staminaRestore: 15,
  },
  apple: {
    id: 'apple',
    name: 'Maçã Dourada do Bosque',
    description:
      'Fruta nutritiva colhida de carvalhos e árvores douradas. Favorita de Cavalos da Planície e Javalis Silvestres.',
    purposeSummary:
      'Consumir (+25 Fome, +12 HP), Domesticar Cavalo da Planície e Javali Silvestre, ou cozinhar Banquete do Guerreiro.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hungerRestore: 25,
    hpRestore: 12,
    staminaRestore: 20,
  },
  cactus_fruit: {
    id: 'cactus_fruit',
    name: 'Fruto de Cacto',
    description:
      'Fruto suculento do deserto. Favorito de Camelos para domesticação e reagente para elixires de velocidade e cura.',
    purposeSummary:
      'Consumir (+22 Fome, +30 Energia), Domesticar Camelo do Deserto, ou criar Elixir Tropical de Coco (+30% Velocidade) e Elixir de Ervas.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hungerRestore: 22,
    hpRestore: 10,
    staminaRestore: 30,
  },
  coconut: {
    id: 'coconut',
    name: 'Coco Costeiro',
    description:
      'Colhido de palmeiras costeiras. Hidrata profundamente, auxilia na domesticação de animais e é base do Elixir Tropical e Banquete do Guerreiro.',
    purposeSummary:
      'Consumir (+24 Fome, +35 Energia), Domesticar Animais, ou preparar Elixir Tropical de Coco (+30% Velocidade), Banquete do Guerreiro e Ração.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hungerRestore: 24,
    hpRestore: 8,
    staminaRestore: 35,
  },
  wool_bandage: {
    id: 'wool_bandage',
    name: 'Bandagem Real de Lã',
    description:
      'Curativo rápido de combate embebido em suco de frutas silvestres. Estanca ferimentos instantaneamente.',
    purposeSummary:
      'Use na mão (Botão Consumir) para restaurar +45 Vida e +20 Energia imediatamente.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    hungerRestore: 5,
    hpRestore: 45,
    staminaRestore: 20,
  },
  taming_treat: {
    id: 'taming_treat',
    name: 'Ração Aromática Real',
    description:
      'Mistura gourmet de frutas e fibras que domestica qualquer animal selvagem com 1 único uso (100% imediato).',
    purposeSummary:
      'Domestica Ovelhas, Javalis ou Camelos instantaneamente ao interagir, ou pode ser consumida (+45 Fome, +30 HP).',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 25,
    hungerRestore: 45,
    hpRestore: 30,
    staminaRestore: 50,
  },
  coconut_elixir: {
    id: 'coconut_elixir',
    name: 'Elixir Tropical de Coco',
    description:
      'Tônico refrescante preparado com Coco Costeiro e Fruto de Cacto. Concede o efeito Passos de Vento (+30% Velocidade por 45s).',
    purposeSummary:
      'Restaura +40 Fome, +25 HP, +80 Energia e concede +30% Velocidade de Movimento por 45 segundos.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 25,
    hungerRestore: 40,
    hpRestore: 25,
    staminaRestore: 80,
    buffType: 'speed',
    buffDuration: 45,
  },
  healing_salve: {
    id: 'healing_salve',
    name: 'Elixir de Ervas & Âmbar',
    description:
      'Bálsamo regenerador destilado na Fornalha com Cristal Solar e frutas medicinais.',
    purposeSummary:
      'Restaura +65 Vida, +40 Energia e +15 Fome em situações críticas de combate.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 25,
    hungerRestore: 15,
    hpRestore: 65,
    staminaRestore: 40,
  },
  warrior_feast: {
    id: 'warrior_feast',
    name: 'Banquete Real do Guerreiro',
    description:
      'Refeição revigorante assada na Fornalha com Maçã Dourada, Coco e Couro/Essência. Concede Fúria de Combate (+35% Dano e Coleta por 50s).',
    purposeSummary:
      'Restaura +75 Fome, +45 HP, +60 Energia e aumenta seu Dano e Coleta em +35% por 50 segundos!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 20,
    hungerRestore: 75,
    hpRestore: 45,
    staminaRestore: 60,
    buffType: 'strength',
    buffDuration: 50,
  },
  shadow_elixir: {
    id: 'shadow_elixir',
    name: 'Elixir da Sombra Noturna',
    description:
      'Poção alquímica sintetizada com Essência Sombria de Zumbi. Restaura vida e concede Velocidade Sombria (+30% Velocidade por 60s).',
    purposeSummary:
      'Transforma Essência Sombria em cura (+50 HP, +70 Energia) e super velocidade por 60 segundos.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 20,
    hungerRestore: 25,
    hpRestore: 50,
    staminaRestore: 70,
    buffType: 'speed',
    buffDuration: 60,
  },
  fire_bomb: {
    id: 'fire_bomb',
    name: 'Bomba Solar de Sílex',
    description:
      'Carga explosiva de Sílex Afiado, Minério de Ferro e Cristal Solar. Detona ao redor do herói causando 65 de dano em área e quebrando rochas!',
    purposeSummary:
      'Segure na mão e aperte Consumir/Usar para detonar uma explosão que causa 65 de dano a inimigos e 90 de dano a recursos próximos!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 20,
    specialUse: 'bomb',
  },
  recall_crystal: {
    id: 'recall_crystal',
    name: 'Cristal Astral de Retorno',
    description:
      'Artefato dimensional forjado com Fragmento Astral. Teletransporta instantaneamente você e seus pets de volta ao Acampamento Inicial e cura +50 HP.',
    purposeSummary:
      'Segure na mão e aperte Consumir/Usar para se teletransportar de volta à Base Inicial com seus animais e restaurar +50 HP!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 15,
    hpRestore: 50,
    staminaRestore: 100,
    specialUse: 'recall',
  },
  primordial_ambrosia: {
    id: 'primordial_ambrosia',
    name: 'Ambrosia da Árvore-Coração',
    description:
      'Néctar divino preparado no Altar Solar com Essência Primordial, Pérola Abissal e Maçã Dourada. Aumenta PERMANENTEMENTE sua Vida Máxima em +20 HP!',
    purposeSummary:
      'Concede +20 de Vida Máxima PERMANENTE ao seu herói e restaura 100% da Vida, Fome e Energia!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 10,
    hungerRestore: 100,
    hpRestore: 200,
    staminaRestore: 100,
    permanentMaxHpBonus: 20,
  },

  // === AGRICULTURE: CROPS, SEEDS & DISHES ===
  wheat: {
    id: 'wheat',
    name: 'Trigo Dourado da Fronteira',
    description:
      'Feixes de trigo colhidos de canteiros agrícolas. Base de pães nutritivos na fornalha e de ração concentrada para animais.',
    purposeSummary:
      'Asse Pão Rústico (+35 Fome, +25 Energia), faça Ração Concentrada ou debulhe para obter Sementes de Trigo.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  carrot: {
    id: 'carrot',
    name: 'Cenoura Fresca da Horta',
    description:
      'Raiz doce e crocante colhida de canteiros bem irrigados. Alimento favorito de Javalis e Ovelhas e base do Ensopado da Horta.',
    purposeSummary:
      'Consumir (+22 Fome, +14 HP, +15 Energia), domesticar/alimentar animais ou cozinhar Ensopado Nutritivo da Horta.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hungerRestore: 22,
    hpRestore: 14,
    staminaRestore: 15,
  },
  medic_herb: {
    id: 'medic_herb',
    name: 'Folha de Erva-da-Vida',
    description:
      'Planta medicinal cultivada com seiva regeneradora. Matéria-prima nobre para emplastros curativos e elixires avançados.',
    purposeSummary:
      'Cria Emplastro Herbal Puro (+75 HP instantâneo) e elixires medicinais na bancada.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  solar_bloom: {
    id: 'solar_bloom',
    name: 'Flor Solar Flamejante',
    description:
      'Flor radiante que absorve calor do sol nos canteiros da fronteira. Usada para sintetizar essências de calor, bombas e elixires solares.',
    purposeSummary:
      'Reagente alquímico avançado para o Altar Solar, Bombas Solares e Elixires de Calor.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 50,
  },
  wheat_seeds: {
    id: 'wheat_seeds',
    name: 'Sementes de Trigo Dourado',
    description:
      'Grãos selecionados para plantio em terra arada. Cresce em 4 fases sob luz solar e solo irrigado.',
    purposeSummary:
      'Plante em Canteiro de Terra Arada (botão Usar). Requer água e sol para produzir Trigo Dourado.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    seedCropType: 'wheat',
  },
  carrot_seeds: {
    id: 'carrot_seeds',
    name: 'Sementes de Cenoura',
    description:
      'Pequenas sementes de cenoura de rápido desenvolvimento em solo úmido e fofo.',
    purposeSummary:
      'Plante em Canteiro de Terra Arada (botão Usar). Produz Cenouras Frescas ricas em nutrientes.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    seedCropType: 'carrot',
  },
  herb_seeds: {
    id: 'herb_seeds',
    name: 'Sementes da Erva-da-Vida',
    description:
      'Sementes medicinais raras. Exigem solo bem irrigado para desenvolver suas propriedades curativas.',
    purposeSummary:
      'Plante em Canteiro de Terra Arada (botão Usar). Produz Folhas de Erva-da-Vida para curativos potentes.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 50,
    seedCropType: 'medic_herb',
  },
  solar_seeds: {
    id: 'solar_seeds',
    name: 'Sementes da Flor Solar',
    description:
      'Sementes térmicas que prosperam sob calor intenso do sol. Produz a Flor Solar Flamejante.',
    purposeSummary:
      'Plante em Canteiro de Terra Arada (botão Usar). Necessita de sol pleno para florescer.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 50,
    seedCropType: 'solar_bloom',
  },
  berry_seeds: {
    id: 'berry_seeds',
    name: 'Sementes de Arbusto de Bagas',
    description:
      'Cultivo de arbusto perene de frutas silvestres. Uma vez maduro, pode ser colhido repetidamente sem morrer!',
    purposeSummary:
      'Plante em Canteiro de Terra Arada. Arbusto perene: colha frutas sem precisar replantar!',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    seedCropType: 'berry',
  },
  bone_fertilizer: {
    id: 'bone_fertilizer',
    name: 'Adubo Orgânico & Mineral',
    description:
      'Composto enriquecido com fibras e minerais. Enriquece a terra arada e acelera dramaticamente o crescimento das plantas.',
    purposeSummary:
      'Aplique na plantação para acelerar o crescimento ou avançar um estágio imediatamente!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
  },
  fresh_bread: {
    id: 'fresh_bread',
    name: 'Pão Rústico de Fornalha',
    description:
      'Pão macio assado na brasa com trigo dourado moído. Restaura a fome e fornece energia duradoura.',
    purposeSummary:
      'Consumir (+35 Fome, +15 HP, +25 Energia). O alimento mais prático e eficiente de sobrevivência.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    hungerRestore: 35,
    hpRestore: 15,
    staminaRestore: 25,
  },
  vegetable_stew: {
    id: 'vegetable_stew',
    name: 'Ensopado Nutritivo da Horta',
    description:
      'Refeição quente cozida na fogueira com cenoura fresca, trigo da fronteira e frutas silvestres.',
    purposeSummary:
      'Consumir (+55 Fome, +35 HP, +30 Energia). Recupera vitalidade em longas jornadas.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 20,
    hungerRestore: 55,
    hpRestore: 35,
    staminaRestore: 30,
  },
  herbal_poultice: {
    id: 'herbal_poultice',
    name: 'Emplastro Herbal Puro',
    description:
      'Curativo medicinal avançado feito com Folha de Erva-da-Vida fresca, lã macia e fibras trançadas.',
    purposeSummary:
      'Uso em emergências: restaura +75 HP instantaneamente e estanca qualquer sangramento.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 25,
    hungerRestore: 10,
    hpRestore: 75,
    staminaRestore: 30,
  },
  farm_feed: {
    id: 'farm_feed',
    name: 'Ração Concentrada da Fazenda',
    description:
      'Farinha de cereais e cenouras que nutre profundamente os animais e acelera a domesticação.',
    purposeSummary:
      'Restaura saúde de animais domesticados (+80 HP no Pet) ou fornece +40% de progresso de domesticação.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    hungerRestore: 30,
    hpRestore: 25,
    staminaRestore: 40,
  },

  // === AGRICULTURE: TOOLS & SOIL ===
  stone_hoe: {
    id: 'stone_hoe',
    name: 'Enxada de Pedra',
    description:
      'Ferramenta agrícola que ara o solo fértil de planícies e clareiras, preparando canteiros prontos para o plantio.',
    purposeSummary:
      'Use na mão (Botão Usar) mirando no solo para arar a terra em Canteiros Férteis de plantio.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.HOE,
    toolTier: 1,
    attackDamage: 10,
    attackRange: 46,
    harvestPower: 18,
  },
  iron_hoe: {
    id: 'iron_hoe',
    name: 'Enxada de Ferro Forjado',
    description:
      'Enxada de lâmina larga e durável de ferro. Ara o solo com extrema facilidade e permite cultivar em qualquer bioma terrestre.',
    purposeSummary:
      'Ferramenta Agrícola Nv.2: Ara o solo rapidamente e prepara canteiros com retenção de umidade superior.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.HOE,
    toolTier: 2,
    attackDamage: 18,
    attackRange: 50,
    harvestPower: 35,
  },
  watering_can: {
    id: 'watering_can',
    name: 'Regador Rústico (Vazio)',
    description:
      'Recipiente leve para irrigação agrícola. Encha-o aproximando-se de oceanos, rios, lagos ou do Poço da Vila.',
    purposeSummary:
      'Aproxime-se da água ou Poço Central da Vila e aperte Usar/Interagir para enchê-lo com água fresca!',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.WATERING_CAN,
    toolTier: 1,
    waterCharges: 0,
    maxWaterCharges: 12,
  },
  watering_can_full: {
    id: 'watering_can_full',
    name: 'Regador com Água Fresca',
    description:
      'Regador cheio com 12 cargas de água fresca. Essencial para manter o solo úmido e permitir que as plantas cresçam.',
    purposeSummary:
      'Use no solo arado para irrigá-lo (12 cargas). Plantas bem regadas crescem rapidamente a cada fase!',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.WATERING_CAN,
    toolTier: 1,
    waterCharges: 12,
    maxWaterCharges: 12,
  },
  tilled_soil: {
    id: 'tilled_soil',
    name: 'Canteiro de Terra Arada',
    description:
      'Solo fofo e arejado preparado para receber sementes de trigo, cenoura, ervas medicinais ou flores solares.',
    purposeSummary:
      'Canteiro agrícola onde plantas crescem através de 4 fases (Semente -> Broto -> Crescimento -> Madura).',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.TILLED_SOIL,
  },

  // === FISHING SYSTEM: ROD & FISH (FEW CURATED SPECIES) ===
  fishing_rod: {
    id: 'fishing_rod',
    name: 'Vara de Pesca Rústica',
    description:
      'Vara flexível de madeira com linha de fibra e boia flutuante. Lance a linha na água e puxe quando o peixe fisgar!',
    purposeSummary:
      'Segure na mão perto da água e aperte o botão de Usar/Atacar para lançar a boia e puxar quando fisgar (!).',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.FISHING_ROD,
    toolTier: 1,
    attackDamage: 8,
    attackRange: 96,
  },
  fish_tilapia: {
    id: 'fish_tilapia',
    name: 'Tilápia Prateada',
    description:
      'Peixe fresco de escamas prateadas muito comum nas costas e lagoas. Pode ser consumido cru ou assado na brasa.',
    purposeSummary:
      'Consumir (+20 Fome, +8 HP, +15 Energia) ou assar na Fogueira/Bancada para fazer Peixe Assado na Brasa.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hungerRestore: 20,
    hpRestore: 8,
    staminaRestore: 15,
  },
  fish_salmon: {
    id: 'fish_salmon',
    name: 'Salmão Real',
    description:
      'Peixe nobre de carne rosada e nutritiva encontrado nas águas da fronteira. Excelente para assar ou vender.',
    purposeSummary:
      'Consumir (+34 Fome, +20 HP, +30 Energia), assar em dobro ou vender por bom preço em tendas.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 50,
    hungerRestore: 34,
    hpRestore: 20,
    staminaRestore: 30,
  },
  fish_golden: {
    id: 'fish_golden',
    name: 'Peixe-Sol Dourado',
    description:
      'Espécie rara de escamas reluzentes como ouro solar. Concede vigor extraordinário e velocidade ao ser consumido.',
    purposeSummary:
      'Consumir (+55 Fome, +45 HP, +60 Energia e +30% Velocidade por 35s) ou vender por alto valor em moedas.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 30,
    hungerRestore: 55,
    hpRestore: 45,
    staminaRestore: 60,
    buffType: 'speed',
    buffDuration: 35,
  },
  cooked_fish: {
    id: 'cooked_fish',
    name: 'Peixe Assado na Brasa',
    description:
      'Filé de peixe grelhado no calor da fogueira com aroma defumado. Restaura bastante fome, vida e energia.',
    purposeSummary:
      'Refeição de Pesca (+48 Fome, +30 HP, +35 Energia). Pode ser assado interagindo com uma Fogueira ou no menu de criação.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 40,
    hungerRestore: 48,
    hpRestore: 30,
    staminaRestore: 35,
  },
  saddle: {
    id: 'saddle',
    name: 'Sela de Montaria',
    description:
      'Sela reforçada com alforjes laterais. Equipe em um Cavalo ou Camelo domesticado para liberar montaria, botão de Cavalgar e 8 slots de inventário.',
    purposeSummary:
      'Segure na mão e interaja com um Cavalo ou Camelo domesticado para selá-lo (habilita Montaria + 8 Slots de Alforje).',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 5,
  },
  wood_boat: {
    id: 'wood_boat',
    name: 'Bote de Madeira',
    description:
      'Embarcação leve e veloz para rios, lagos e oceanos. Só pode ser colocado na água, ignora a correnteza e comporta até 2 assentos (outro jogador ou pet seguindo).',
    purposeSummary:
      'Segure na mão e posicione sobre a água para lançar o Bote (2 Assentos, Rápido na Água, Imune à Correnteza, 0 Slots).',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 5,
  },

  // === RARE RESOURCES ===
  iron_ore: {
    id: 'iron_ore',
    name: 'Minério de Ferro',
    description:
      'Metal bruto extraído de veios ferrosos com picareta de pedra ou superior, ou saqueado de Ogros derrotados.',
    purposeSummary:
      'Funda na Fornalha para criar Barras de Ferro Forjado ou combine com Sílex para fabricar Bombas Solares Explosivas.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  iron_bar: {
    id: 'iron_bar',
    name: 'Barra de Ferro Forjado',
    description:
      'Lingote metálico purificado na Fornalha. Base de todas as armas, ferramentas e armaduras de nível médio e avançado.',
    purposeSummary:
      'Forja Espada/Machado/Picareta de Ferro, Foice Sombria, Tridente Abissal, Couraça de Ferro, Muralhas, Altar Solar e Lâmina Astral.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  hardwood: {
    id: 'hardwood',
    name: 'Madeira Nobre Ancestral',
    description:
      'Madeira densa de fibras douradas colhida de Árvores Ancestrais e Árvores-Coração com Machado de Pedra+.',
    purposeSummary:
      'Cria Equipamentos de Ferro, Clava Brutal de Ogro, Tridente Abissal, Tenda do Aventureiro, Altar Solar, Machado Primordial e Totem Guardião.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  solar_crystal: {
    id: 'solar_crystal',
    name: 'Cristal Solar',
    description:
      'Gema luminosa que armazena energia térmica do deserto. Catalisador para alquimia, explosivos, fontes mágicas e armas.',
    purposeSummary:
      'Cria Espada de Ferro, Elixir de Ervas, Bomba Solar, Fonte Abissal de Cura, Cristal de Retorno, Altar Solar e Totem Guardião.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  dark_essence: {
    id: 'dark_essence',
    name: 'Essência Sombria',
    description:
      'Núcleo místico deixado por Zumbis derrotados. Essencial para armas vampíricas, elixires de velocidade noturna e transmutação astral.',
    purposeSummary:
      'Forja a Foice Sombria (Dreno de Vida por golpe), prepara Elixir da Sombra Noturna (+Velocidade), Armadura Astral e Transmutação Astral.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  ogre_hide: {
    id: 'ogre_hide',
    name: 'Couro Grosso de Ogro',
    description:
      'Pele colossal obtida ao derrotar Ogros Brutamontes. Proporciona resistência extrema para armaduras, clavas pesadas e tendas.',
    purposeSummary:
      'Cria Clava Brutal de Ogro (Alto Dano + Empurrão), Couraça de Ferro & Ogro, Tenda de Lã & Couro, Banquete do Guerreiro e Armadura Astral.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 50,
  },

  // === VERY RARE RESOURCES ===
  astral_shard: {
    id: 'astral_shard',
    name: 'Fragmento Astral de Hélio',
    description:
      'Relíquia muito rara extraída de Obeliscos Solares no deserto profundo com Picareta de Ferro+ (ou transmutada no Altar Solar).',
    purposeSummary:
      'Forja Lâmina Astral do Hélio, Picareta Astral, Armadura Soberana Astral, Totem do Guardião Solar e Cristal Astral de Retorno.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 50,
  },
  abyssal_pearl: {
    id: 'abyssal_pearl',
    name: 'Pérola Abissal',
    description:
      'Jóia iridescente muito rara colhida de Ostras Gigantes no Oceano usando Pontes Costeiras e Picareta de Ferro+.',
    purposeSummary:
      'Forja Tridente Abissal dos Mares, Fonte Abissal de Cura, Ambrosia da Árvore-Coração (+20 HP Máx), Lâmina Astral e Armadura Astral.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 50,
  },
  primordial_essence: {
    id: 'primordial_essence',
    name: 'Essência da Árvore-Coração',
    description:
      'Seiva sagrada muito rara extraída das Árvores-Coração Primordiais da planície com Machado de Ferro+.',
    purposeSummary:
      'Cria Ambrosia da Árvore-Coração (+20 HP Máx Permanente), Machado Primordial, Lâmina Astral, Fonte Abissal de Cura e Totem Guardião.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 50,
  },

  // === TOOLS & WEAPONS: TIER 1 (BASIC) ===
  stone_axe: {
    id: 'stone_axe',
    name: 'Machado de Pedra',
    description:
      'Corta carvalhos, palmeiras, cactos e desbloqueia a extração de Árvores Ancestrais de Madeira Nobre.',
    purposeSummary:
      'Ferramenta Nv.1: Corta árvores comuns rapidamente e permite colher Madeira Nobre Ancestral.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.AXE,
    toolTier: 1,
    attackDamage: 14,
    attackRange: 46,
    harvestPower: 22,
  },
  stone_pickaxe: {
    id: 'stone_pickaxe',
    name: 'Picareta de Pedra',
    description:
      'Quebra rochas comuns rapidamente e desbloqueia a mineração de Minério de Ferro e Cristais Solares.',
    purposeSummary:
      'Ferramenta Nv.1: Extrai Pedra, Sílex, Minério de Ferro e Drusas de Cristal Solar.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.PICKAXE,
    toolTier: 1,
    attackDamage: 12,
    attackRange: 46,
    harvestPower: 22,
  },
  wood_sword: {
    id: 'wood_sword',
    name: 'Espada de Sílex & Madeira',
    description: 'Arma leve de defesa inicial com lâmina serrilhada de sílex.',
    purposeSummary:
      'Arma Nv.1: Causa 22 de dano base em ataques rápidos contra Zumbis.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 1,
    attackDamage: 22,
    attackRange: 54,
    harvestPower: 8,
  },
  flint_spear: {
    id: 'flint_spear',
    name: 'Lança de Sílex Caçadora',
    description:
      'Lança longa feita com Sílex Afiado e Fibra. Possui alcance estendido (66px) para atingir inimigos mantendo distância segura.',
    purposeSummary:
      'Arma Tática Nv.1: Alcance longo (66px) e 28 de dano para combater sem ser atingido.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 1,
    attackDamage: 28,
    attackRange: 66,
    harvestPower: 10,
  },

  // === TOOLS & WEAPONS: TIER 2 (RARE) ===
  iron_axe: {
    id: 'iron_axe',
    name: 'Machado de Ferro Forjado',
    description:
      'Corta Árvores Ancestrais de Madeira Nobre e desbloqueia a colheita das raras Árvores-Coração Primordiais.',
    purposeSummary:
      'Ferramenta Nv.2: Necessária para extrair Essência da Árvore-Coração Primordial.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.AXE,
    toolTier: 2,
    attackDamage: 24,
    attackRange: 50,
    harvestPower: 42,
  },
  iron_pickaxe: {
    id: 'iron_pickaxe',
    name: 'Picareta de Ferro Forjado',
    description:
      'Capaz de minerar Cristais Solares e desbloquear a extração de Ostras Abissais e Obeliscos Astrais.',
    purposeSummary:
      'Ferramenta Nv.2: Necessária para extrair Fragmento Astral e Pérola Abissal.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.PICKAXE,
    toolTier: 2,
    attackDamage: 21,
    attackRange: 50,
    harvestPower: 42,
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Espada Longa de Ferro',
    description:
      'Lâmina balanceada de alto impacto forjada com Cristal Solar para enfrentar Zumbis e Ogros.',
    purposeSummary: 'Arma Nv.2: Causa 42 de dano base com alcance de 62px.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 42,
    attackRange: 62,
    harvestPower: 12,
  },
  shadow_blade: {
    id: 'shadow_blade',
    name: 'Foice Sombria Vampírica',
    description:
      'Lâmina curva forjada com Essência Sombria de Zumbi. Drena +6 de Vida para o seu herói a cada golpe acertado em inimigos!',
    purposeSummary:
      'Arma Rara Vampírica: Causa 48 de dano e regenera +6 HP por golpe acertado em combate.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 48,
    attackRange: 64,
    harvestPower: 15,
    lifesteal: 6,
  },
  ogre_club: {
    id: 'ogre_club',
    name: 'Clava Brutal de Ogro',
    description:
      'Arma colossal revestida com Couro Grosso de Ogro e Madeira Nobre. Causa dano esmagador (56 ATQ) e empurra os inimigos para longe!',
    purposeSummary:
      'Arma Pesada Nv.2: 56 de dano base e super repulsão (Knockback 2.2x) contra Ogros e Zumbis.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 56,
    attackRange: 60,
    harvestPower: 28,
    knockbackMult: 2.2,
  },

  // === TOOLS & WEAPONS: TIER 3 (VERY RARE / ENDGAME V1) ===
  primordial_axe: {
    id: 'primordial_axe',
    name: 'Machado Primordial do Bosque',
    description:
      'Obra-prima imbuída com Essência Primordial. Corta qualquer árvore em instantes e serve como arma devastadora.',
    purposeSummary: 'Ferramenta Nv.3 Máxima: Poder de coleta 85 e 45 de dano.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.AXE,
    toolTier: 3,
    attackDamage: 45,
    attackRange: 58,
    harvestPower: 85,
  },
  primordial_pickaxe: {
    id: 'primordial_pickaxe',
    name: 'Picareta Astral de Hélio',
    description:
      'Perfura até os Obeliscos mais antigos e Ostras Abissais com energia solar concentrada.',
    purposeSummary: 'Ferramenta Nv.3 Máxima: Poder de mineração 85 e 40 de dano.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.PICKAXE,
    toolTier: 3,
    attackDamage: 40,
    attackRange: 58,
    harvestPower: 85,
  },
  abyssal_trident: {
    id: 'abyssal_trident',
    name: 'Tridente Abissal dos Mares',
    description:
      'Relíquia oceânica forjada com Pérolas Abissais. Possui o maior alcance do jogo (78px), drena +4 HP por golpe e aumenta velocidade na costa.',
    purposeSummary:
      'Arma Muito Rara: 70 de dano, alcance extremo (78px) e +4 HP de regeneração por golpe.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 3,
    attackDamage: 70,
    attackRange: 78,
    harvestPower: 22,
    lifesteal: 4,
  },
  astral_sword: {
    id: 'astral_sword',
    name: 'Lâmina Astral do Hélio',
    description:
      'Espada lendária forjada com Fragmento Astral, Pérola Abissal e Essência Primordial. Devasta Ogros e drena +8 HP por golpe.',
    purposeSummary:
      'Arma Suprema Nv.3: 84 de dano base, alcance de 74px e +8 HP de regeneração por golpe.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 3,
    attackDamage: 84,
    attackRange: 74,
    harvestPower: 25,
    lifesteal: 8,
  },

  // === ARMORS & GARMENTS (4-SLOT SYSTEM: HEAD, BODY, LEGS, FEET) ===
  // --- CONJUNTO Nv.1: LÃ, COURO & FIBRA (BANCADA) ---
  leather_hood: {
    id: 'leather_hood',
    name: 'Capuz de Lã & Caçador',
    description:
      'Capuz térmico costurado com Lã Macia e Fibra Vegetal. Protege a cabeça contra o frio e reduz o dano recebido em 5%.',
    purposeSummary:
      'Slot: Cabeça · Reduz o dano sofrido em 5% e concede +10 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.05,
    maxHpBonus: 10,
  },
  leather_tunic: {
    id: 'leather_tunic',
    name: 'Túnica de Lã & Fibra',
    description:
      'Veste peitoral acolchoada de lã e fibras trançadas com ombreiras de couro. Reduz o dano recebido em 9% e amplia a vitalidade.',
    purposeSummary:
      'Slot: Parte Superior · Reduz o dano sofrido em 9% e concede +15 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.09,
    maxHpBonus: 15,
  },
  leather_pants: {
    id: 'leather_pants',
    name: 'Calças de Fibra & Couro',
    description:
      'Calças reforçadas nos joelhos com fibras trançadas para explorar matas densas e desertos. Reduz o dano recebido em 6%.',
    purposeSummary:
      'Slot: Parte Inferior · Reduz o dano sofrido em 6% e concede +8 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.06,
    maxHpBonus: 8,
  },
  leather_boots: {
    id: 'leather_boots',
    name: 'Botas de Trilha de Fibra',
    description:
      'Botas leves de caminhada com solado macio. Reduzem o dano recebido em 4% e aumentam a velocidade de movimento em +8%!',
    purposeSummary:
      'Slot: Pés · Reduz o dano em 4% e aumenta sua Velocidade de Movimento em +8%.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'feet',
    defenseBonus: 0.04,
    speedBonus: 0.08,
  },

  // --- CONJUNTO Nv.2: FERRO FORJADO & OGRO (FORNALHA) ---
  iron_helmet: {
    id: 'iron_helmet',
    name: 'Elmo de Ferro & Presas',
    description:
      'Elmo fechado de ferro forjado adornado com presas de Ogro e forro de lã. Reduz o dano recebido em 10%.',
    purposeSummary:
      'Slot: Cabeça · Reduz o dano sofrido em 10% e concede +20 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.RARE,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.1,
    maxHpBonus: 20,
  },
  iron_armor: {
    id: 'iron_armor',
    name: 'Couraça de Ferro & Ogro',
    description:
      'Peitoral pesado de placas de ferro forjado com capa carmesim e Couro de Ogro. Reduz o dano recebido em 18%.',
    purposeSummary:
      'Slot: Parte Superior · Reduz o dano sofrido em 18% e concede +30 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.RARE,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.18,
    maxHpBonus: 30,
  },
  iron_greaves: {
    id: 'iron_greaves',
    name: 'Grevas de Placas de Ferro',
    description:
      'Proteção articulada para as pernas forjada em ferro e couro grosso de Ogro. Reduz o dano recebido em 11%.',
    purposeSummary:
      'Slot: Parte Inferior · Reduz o dano sofrido em 11% e concede +15 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.RARE,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.11,
    maxHpBonus: 15,
  },
  iron_boots: {
    id: 'iron_boots',
    name: 'Botas Blindadas de Ferro',
    description:
      'Sabatons de ferro forjado com esporas de marcha. Reduzem o dano em 8% e garantem +10% de Velocidade de Movimento.',
    purposeSummary:
      'Slot: Pés · Reduz o dano sofrido em 8% e concede +10% Velocidade de Movimento.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.RARE,
    maxStack: 1,
    equipSlot: 'feet',
    defenseBonus: 0.08,
    speedBonus: 0.1,
  },

  // --- CONJUNTO Nv.3: SOBERANO ASTRAL (ALTAR SOLAR) ---
  astral_crown: {
    id: 'astral_crown',
    name: 'Diadema Soberano Astral',
    description:
      'Coroa radiante cravejada com Fragmento Astral de Hélio e Pérola Abissal. Reduz o dano em 15% e ilumina o portador.',
    purposeSummary:
      'Slot: Cabeça · Reduz o dano em 15% e concede +35 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.15,
    maxHpBonus: 35,
  },
  astral_armor: {
    id: 'astral_armor',
    name: 'Peitoral Soberano Astral',
    description:
      'Relíquia suprema da Fronteira forjada para o torso com manto real astral. Reduz o dano em 26% e concede +50 Vida Máxima.',
    purposeSummary:
      'Slot: Parte Superior · Reduz o dano sofrido em 26% e concede +50 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.26,
    maxHpBonus: 50,
  },
  astral_leggings: {
    id: 'astral_leggings',
    name: 'Perneiras Astrais de Hélio',
    description:
      'Grevas celestiais imbuídas com Essência Sombria e Pérola Abissal. Reduzem o dano recebido em 16%.',
    purposeSummary:
      'Slot: Parte Inferior · Reduz o dano sofrido em 16% e concede +25 Vida Máxima.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.16,
    maxHpBonus: 25,
  },
  astral_boots: {
    id: 'astral_boots',
    name: 'Botas Aladas Astrais',
    description:
      'Botas reluzentes que deixam um rastro luminoso ao caminhar. Reduzem o dano em 13% e aumentam a Velocidade em +18%!',
    purposeSummary:
      'Slot: Pés · Reduz o dano em 13% e aumenta a Velocidade de Movimento em +18%.',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    equipSlot: 'feet',
    defenseBonus: 0.13,
    speedBonus: 0.18,
  },

  // === PLACEABLE STRUCTURES ===
  workbench: {
    id: 'workbench',
    name: 'Bancada de Artesão',
    description:
      'Estação de carpintaria com base arquitetônica adaptativa e rotação de eixo (H/V). Interaja para criar armas táticas, pisos, muros, portas, janelas, cercas e a Fornalha.',
    purposeSummary:
      'Estação Nv.1 (Hitbox Compacta 9px · Rotacionável): Desbloqueia toda a arquitetura de madeira/pedra e equipamentos básicos.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 10,
    placeableType: PlaceableType.WORKBENCH,
  },
  campfire: {
    id: 'campfire',
    name: 'Fogueira de Acampamento',
    description:
      'Lareira circular de pedra sem bloqueio físico. Ilumina a noite (190px), regenera vida/energia passivamente ao redor e permite aquecer-se ao interagir.',
    purposeSummary:
      'Lareira Interativa (Sem Hitbox · Luz 190px): Cura passivamente ao redor e restaura +18 HP + Energia Cheia ao interagir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 20,
    placeableType: PlaceableType.CAMPFIRE,
  },
  furnace: {
    id: 'furnace',
    name: 'Fornalha de Fundição',
    description:
      'Forja de alvenaria com chaminé térmica e alinhamento rotacionável (H/V). Interaja para fundir Ferro, forjar muralhas, portões, vitrais, armas raras e o Altar Solar.',
    purposeSummary:
      'Estação Nv.2 (Hitbox Compacta 10px · Luz 150px): Funde Minério de Ferro e desbloqueia arquitetura pesada e armas raras.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.FURNACE,
  },
  solar_altar: {
    id: 'solar_altar',
    name: 'Altar Alquímico Solar',
    description:
      'Santuário astral com pedestal rúnico que se integra a pisos imperiais e tapetes. Interaja para forjar relíquias muito raras, armas astrais e Ambrosia Primordial.',
    purposeSummary:
      'Estação Nv.3 Máxima (Hitbox Compacta 10px · Luz 210px): Cria equipamentos supremos, Fonte Abissal e Totem Guardião.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 5,
    placeableType: PlaceableType.SOLAR_ALTAR,
  },
  explorer_tent: {
    id: 'explorer_tent',
    name: 'Tenda Real de Lã & Couro',
    description:
      'Pavilhão acolchoado rotacionável (H/V) que pode ser evoluído diretamente para Cabana Medieval. Interaja à noite para DORMIR até o amanhecer (06:00) com 100% de Vida!',
    purposeSummary:
      'Abrigo Interativo (Hitbox Compacta 11px · Luz 165px): Dormir avança a noite para 06:00 e restaura 100% de Vida e Energia.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.EXPLORER_TENT,
  },
  spike_trap: {
    id: 'spike_trap',
    name: 'Armadilha de Espinhos de Sílex',
    description:
      'Mecanismo retrátil de piso que pode ser instalado sobre calçadas e até sob Portas e Portões! Você e seus pets passam livremente, mas inimigos sofrem 18 de dano/s.',
    purposeSummary:
      'Defesa de Piso & Portões (Sem Hitbox): Coexiste com pisos/portas e causa 18 de dano contínuo a monstros invasores.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.SPIKE_TRAP,
  },
  wood_wall: {
    id: 'wood_wall',
    name: 'Muro de Madeira',
    description:
      'Parede estrutural de toras com ligações automáticas em 16 estados (cantos, junções em T, cruzamentos e pilares). Conecta-se perfeitamente a portas, janelas e cercas.',
    purposeSummary:
      'Parede Contínua (140 HP · Hitbox Sólida): Liga-se em 4 direções com paredes, portas e janelas.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_WALL,
  },
  stone_wall: {
    id: 'stone_wall',
    name: 'Muralha de Pedra & Ferro',
    description:
      'Muralha fortificada com adaptação de continuidade em 16 estados e pilares de canto. Pode substituir Muros de Madeira diretamente no lugar!',
    purposeSummary:
      'Muralha Contínua (260 HP · Hitbox Sólida): Conecta-se automaticamente a muralhas, vitrais e portões.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 99,
    placeableType: PlaceableType.STONE_WALL,
  },
  wood_floor: {
    id: 'wood_floor',
    name: 'Piso de Tábuas',
    description:
      'Camada de Chão com adaptação de bordas contínuas. Permite construir paredes, portas, baús e estações por cima e concede +15% de Velocidade de Movimento (Sem Hitbox).',
    purposeSummary:
      'Chão Contínuo (Sem Hitbox · +15% Velocidade): Une tábuas sem costuras e aceita móveis/paredes sobre ele.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_FLOOR,
  },
  stone_floor: {
    id: 'stone_floor',
    name: 'Calçada de Pedra Real',
    description:
      'Camada de Chão pavimentada com meio-fio adaptativo nas bordas externas. Concede +25% de Velocidade de Movimento e aceita qualquer construção por cima (Sem Hitbox).',
    purposeSummary:
      'Chão Contínuo (Sem Hitbox · +25% Velocidade): Adapta bordas automaticamente e aceita estruturas sobre ele.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.STONE_FLOOR,
  },
  wood_bridge: {
    id: 'wood_bridge',
    name: 'Ponte Costeira Flutuante',
    description:
      'Estrutura marítima com guarda-corpos adaptativos que se abrem automaticamente ao conectar pontes vizinhas no Oceano (Sem Hitbox de bloqueio).',
    purposeSummary:
      'Ponte Conectável (Sem Hitbox): Travessia sobre o Oceano com guarda-corpos inteligentes e suporte a construções.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_BRIDGE,
  },
  torch: {
    id: 'torch',
    name: 'Tocha de Resina',
    description:
      'Arandela / tocha de iluminação (140px) sem hitbox física. Fixa-se automaticamente com suporte metálico em paredes e cercas adjacentes e pode ser evoluída para Lampião!',
    purposeSummary:
      'Iluminação Adaptativa (Sem Hitbox · Luz 140px): Fixa-se em muros/cercas vizinhos ou no chão sem bloquear passagem.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.TORCH,
  },
  chest: {
    id: 'chest',
    name: 'Baú de Armazenamento Real',
    description:
      'Cofre colocável e interativo de 24 slots com ferragens de ferro, rotação (H/V) e conexão lateral em Baú Duplo! Coloque na sua base e interaja para guardar, organizar e retirar seus itens.',
    purposeSummary:
      'Cofre Interativo (24 Slots · Guardar & Retirar Itens): Armazena itens com transferência rápida, organização automática e renomeação!',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 20,
    placeableType: PlaceableType.CHEST,
  },
  healing_fountain: {
    id: 'healing_fountain',
    name: 'Fonte Abissal de Cura',
    description:
      'Santuário cristalino monumental com pedestal octogonal. Ilumina a fortaleza (230px) e regenera continuamente a vida do herói (+5 HP/s) e de todos os pets próximos!',
    purposeSummary:
      'Santuário de Cura (Hitbox Compacta 10px · Luz 230px): Regenera +5 HP/s passivamente e cura 100% ao interagir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 10,
    placeableType: PlaceableType.HEALING_FOUNTAIN,
  },
  guardian_totem: {
    id: 'guardian_totem',
    name: 'Totem do Guardião Solar',
    description:
      'Torreta obelisco muito rara que se integra a muralhas e pátios: ilumina 290px, aquece aliados e dispara Raios Solares automáticos (25 Dano) contra invasores!',
    purposeSummary:
      'Torreta Mágica Solar (Hitbox Compacta 9px · Luz 290px): Dispara raios de 25 de dano contra monstros próximos.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 10,
    placeableType: PlaceableType.GUARDIAN_TOTEM,
  },
  // === VILLAGE & COMPLEX MOB RESOURCES, WEAPONS & STRUCTURES ===
  gold_coin: {
    id: 'gold_coin',
    name: 'Moeda de Ouro Antiga',
    description:
      'Cunhada pelos antigos reinos da Fronteira. Saqueada de Saqueadores Renegados ou obtida vendendo mercadorias nos Vilarejos. Muito valorizada por todos os NPCs!',
    purposeSummary:
      'Moeda de Troca & Diplomacia: Usada para comprar itens raros nos Vilarejos, elevar Afinidade (+18♥) ou pagar dívidas de perdão.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 9999,
  },
  royal_wax_seal: {
    id: 'royal_wax_seal',
    name: 'Selo de Cera Real',
    description:
      'Insígnia diplomática lacrada em cera carmesim e ouro pelos emissários das vilas. NÃO pode ser fabricado nem achado na natureza — só pode ser adquirido comprando de um Aldeão ou Andarilho!',
    purposeSummary:
      'Requisito Exclusivo de Aldeão: Ingrediente obrigatório para confeccionar o Tratado da Paz Real na Bancada ou Altar Solar.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 20,
  },
  peace_treaty: {
    id: 'peace_treaty',
    name: 'Tratado da Paz Real',
    description:
      'Pergaminho diplomático de alta nobreza tecido com Seda Sombria, Lã, Ouro, Ferro, Cristais Solares e autenticado com um Selo de Cera Real comprado de um Aldeão. Segure-o na mão para conseguir falar com aldeões de uma vila hostil, ver a cobrança em moedas e pagar pelo perdão!',
    purposeSummary:
      'Item da Paz (Segure na Mão): Permite dialogar com vilas hostis e ver a cobrança em moedas. Ao pagar a dívida, as moedas são pagas e o Tratado da Paz é consumido.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 5,
    specialUse: 'peace_treaty',
  },
  spider_silk: {
    id: 'spider_silk',
    name: 'Seda Sombria da Mata',
    description:
      'Fio ultrarresistente colhido ao derrotar Aranhas Tecelãs nas florestas densas. Essencial para estandartes reais, tendas de mercado e empunhaduras.',
    purposeSummary:
      'Forja Adaga Imperial de Ferrão, Tenda de Comércio Real, Estandarte da Fronteira ou troca com Mercadores da Vila.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  scorpion_stinger: {
    id: 'scorpion_stinger',
    name: 'Ferrão Imperial Dourado',
    description:
      'Aguilhão cristalizado extraído do Escorpião Rei do Deserto. Perfura armaduras pesadas e canaliza veneno solar.',
    purposeSummary:
      'Forja a letal Adaga Imperial de Ferrão (62 ATQ + Dreno de Vida) ou pode ser vendido por alto valor nos Vilarejos.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 50,
  },
  golem_core: {
    id: 'golem_core',
    name: 'Núcleo Rúnico de Colosso',
    description:
      'Coração mineral pulsante deixado por Colossos Rúnicos de Pedra nas terras altas. Irradia força telúrica ancestral.',
    purposeSummary:
      'Cria Poço de Pedra da Vila, Totem Guardião, equipamentos rúnicos ou troca por relíquias com o Ancião da Vila.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 50,
  },
  scorpion_dagger: {
    id: 'scorpion_dagger',
    name: 'Lâmina Imperial de Ferrão',
    description:
      'Arma ágil forjada com Ferrão Imperial de Escorpião, Seda Sombria e Ferro. Causa golpes velozes de 62 de dano e drena +5 HP por acerto!',
    purposeSummary:
      'Arma Rara Veloz: 62 de dano base, alcance de 60px e +5 HP regenerado por golpe.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 62,
    attackRange: 60,
    harvestPower: 18,
    lifesteal: 5,
  },
  village_well: {
    id: 'village_well',
    name: 'Poço de Pedra da Vila',
    description:
      'Fonte arquitetônica de alvenaria e madeira com água cristalina subterrânea. Interaja para beber água fresca e restaurar +20 Vida, +20 Fome e +55 Energia!',
    purposeSummary:
      'Estrutura Interativa (Hitbox Compacta 10px): Restaura +20 HP, +20 Fome e +55 Energia ao interagir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.VILLAGE_WELL,
  },
  market_stall: {
    id: 'market_stall',
    name: 'Tenda de Comércio Real',
    description:
      'Barraca mercante rotacionável (H/V) com toldo de seda imperial que pode substituir uma Bancada diretamente no lugar. Abre a Bancada de Artesão ao interagir!',
    purposeSummary:
      'Estação Nobre (Hitbox Compacta 11px · Rotacionável): Decora pátios e abre a Bancada de Artesão ao interagir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.MARKET_STALL,
  },
  village_house: {
    id: 'village_house',
    name: 'Cabana Medieval (Casa)',
    description:
      'Residência enxaimel rotacionável (H/V) de madeira e pedra com lareira acesa (175px). Serve de moradia para até 2 Aldeões — Andarilhos que passarem perto deixam de vagar e se mudam para cá como Aldeões!',
    purposeSummary:
      'Moradia de até 2 Aldeões (240 HP · Luz 175px): Atrai Andarilhos sem teto para virarem Aldeões na sua base e permite dormir até o amanhecer.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.VILLAGE_HOUSE,
  },
  royal_banner: {
    id: 'royal_banner',
    name: 'Estandarte da Fronteira',
    description:
      'Flâmula heráldica bordada com Seda Sombria e Ouro. Fixa-se automaticamente em muros/portões adjacentes e ilumina os arredores (160px) sem bloquear passagem!',
    purposeSummary:
      'Insígnia Adaptativa (Sem Hitbox · Luz 160px): Conecta-se a paredes/portões e ilumina salões sem obstruir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 20,
    placeableType: PlaceableType.ROYAL_BANNER,
  },

  // === NEW PROFESSIONAL ARCHITECTURAL & BUILDING SYSTEM ITEMS ===
  wood_door: {
    id: 'wood_door',
    name: 'Porta de Carvalho Reforçada',
    description:
      'Porta articulada com batentes de madeira e ferragens. Alinha-se automaticamente na horizontal ou vertical entre paredes e abre/fecha ao interagir!',
    purposeSummary:
      'Porta Interativa (160 HP · Hitbox Dinâmica): Bloqueia monstros quando fechada e libera passagem total quando aberta.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    placeableType: PlaceableType.WOOD_DOOR,
  },
  iron_gate: {
    id: 'iron_gate',
    name: 'Portão de Ferro de Fortaleza',
    description:
      'Portão blindado de barras de ferro forjado e pedra. Conecta-se a muralhas e cercas, suporta cercos pesados e abre/fecha ao interagir.',
    purposeSummary:
      'Portão Pesado (280 HP · Hitbox Dinâmica): Alinhamento automático N-S/L-O com controle de acesso.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 30,
    placeableType: PlaceableType.IRON_GATE,
  },
  wood_fence: {
    id: 'wood_fence',
    name: 'Cerca Rústica de Pastoreio',
    description:
      'Cerca modular com postes e travessas que se conectam automaticamente em 16 direções a outras cercas, portões e muros. Ideal para currais de animais e jardins!',
    purposeSummary:
      'Cerca Conectável (110 HP · Hitbox de Contenção): Mantém animais seguros e conecta-se a portões.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_FENCE,
  },
  wood_window: {
    id: 'wood_window',
    name: 'Parede com Janela Enxaimel',
    description:
      'Parede de madeira nobre com janela emoldurada que se conecta continuamente aos muros adjacentes e irradia luz suave (95px).',
    purposeSummary:
      'Parede com Janela (145 HP · Hitbox Sólida): Liga-se a muros e portas enquanto ilumina o ambiente.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 60,
    placeableType: PlaceableType.WOOD_WINDOW,
  },
  stone_window: {
    id: 'stone_window',
    name: 'Muralha com Vitral Gótico',
    description:
      'Muralha de pedra com vitral arqueado de Cristal Solar. Conecta-se continuamente a muralhas e portões de ferro, iluminando 120px.',
    purposeSummary:
      'Muralha com Vitral (260 HP · Hitbox Sólida): Alta proteção com iluminação arquitetônica e conexão 4-lados.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 60,
    placeableType: PlaceableType.STONE_WINDOW,
  },
  brick_floor: {
    id: 'brick_floor',
    name: 'Piso de Tijolo Imperial',
    description:
      'Pavimento nobre em espinha-de-peixe com meio-fio dourado adaptativo nas bordas. Concede +30% de Velocidade de Movimento e aceita estruturas por cima (Sem Hitbox).',
    purposeSummary:
      'Chão Imperial (Sem Hitbox · +30% Velocidade): O piso mais veloz e elegante para fortalezas e estradas.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 99,
    placeableType: PlaceableType.BRICK_FLOOR,
  },
  brick_wall: {
    id: 'brick_wall',
    name: 'Muralha de Alvenaria Imperial',
    description:
      'Muralha soberana de tijolos maciços, pedra e ferro forjado com ameias e pilares de canto automáticos (320 HP).',
    purposeSummary:
      'Muralha Suprema (320 HP · Hitbox Sólida): Máxima resistência estrutural com continuidade de 16 estados.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 99,
    placeableType: PlaceableType.BRICK_WALL,
  },
  royal_carpet: {
    id: 'royal_carpet',
    name: 'Tapete Carmesim Real',
    description:
      'Tapete de lã macia e fios dourados que une suas peças sem costuras e desenha franjas douradas nas bordas externas (Sem Hitbox · +20% Velocidade).',
    purposeSummary:
      'Tapete Modular (Sem Hitbox · +20% Velocidade): Decoração contínua de salões que não bloqueia passagem.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 99,
    placeableType: PlaceableType.ROYAL_CARPET,
  },
  iron_lantern: {
    id: 'iron_lantern',
    name: 'Lampião de Ferro Forjado',
    description:
      'Luminária suspensa de ferro e cristal solar que ilumina uma ampla área (215px) sem possuir hitbox física, permitindo caminhar livremente!',
    purposeSummary:
      'Luminária Real (Sem Hitbox · Luz 215px): Iluminação intensa para ruas, pontes e salões sem obstruir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 50,
    placeableType: PlaceableType.IRON_LANTERN,
  },
};

export const CONSTRUCTION_BLUEPRINTS: Record<PlaceableType, ConstructionBlueprint> = {
  // === LAYER 1: GROUND (CHÃO, PISOS, TAPETES E PONTES — SEM HITBOX) ===
  [PlaceableType.WOOD_FLOOR]: {
    type: PlaceableType.WOOD_FLOOR,
    role: 'CHAO',
    roleLabel: 'Chão / Piso',
    layer: 'GROUND',
    layerLabel: 'Camada de Chão (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Bordas Adaptativas & União Contínua',
    connectionGroup: 'wood_floor',
    connectsToGroups: ['wood_floor'],
    maxHp: 90,
    lightRadius: 0,
    speedMultiplier: 1.15,
  },
  [PlaceableType.STONE_FLOOR]: {
    type: PlaceableType.STONE_FLOOR,
    role: 'CHAO',
    roleLabel: 'Chão / Calçada',
    layer: 'GROUND',
    layerLabel: 'Camada de Chão (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Meio-Fio Adaptativo & União Contínua',
    connectionGroup: 'stone_floor',
    connectsToGroups: ['stone_floor'],
    maxHp: 130,
    lightRadius: 0,
    speedMultiplier: 1.25,
  },
  [PlaceableType.BRICK_FLOOR]: {
    type: PlaceableType.BRICK_FLOOR,
    role: 'CHAO',
    roleLabel: 'Chão Imperial',
    layer: 'GROUND',
    layerLabel: 'Camada de Chão (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Bordas Imperiais & Espinha-de-Peixe Contínua',
    connectionGroup: 'brick_floor',
    connectsToGroups: ['brick_floor'],
    maxHp: 170,
    lightRadius: 0,
    speedMultiplier: 1.3,
  },
  [PlaceableType.ROYAL_CARPET]: {
    type: PlaceableType.ROYAL_CARPET,
    role: 'CHAO',
    roleLabel: 'Tapete / Piso Nobre',
    layer: 'GROUND',
    layerLabel: 'Camada de Chão (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Franjas Douradas Adaptativas nas Bordas',
    connectionGroup: 'carpet',
    connectsToGroups: ['carpet'],
    maxHp: 85,
    lightRadius: 0,
    speedMultiplier: 1.2,
  },
  [PlaceableType.WOOD_BRIDGE]: {
    type: PlaceableType.WOOD_BRIDGE,
    role: 'PONTE',
    roleLabel: 'Ponte / Píer Marítimo',
    layer: 'GROUND',
    layerLabel: 'Fundação Aquática (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Travessia Livre sobre Água)',
    continuityMode: 'BRIDGE_AUTO',
    continuityLabel: 'Guarda-Corpos Adaptativos N/S/L/O',
    connectionGroup: 'bridge',
    connectsToGroups: ['bridge', 'wood_floor', 'stone_floor', 'brick_floor'],
    maxHp: 110,
    lightRadius: 0,
    speedMultiplier: 1.12,
  },

  // === LAYER 2: WALLS, WINDOWS, DOORS, GATES & FENCES ===
  [PlaceableType.WOOD_WALL]: {
    type: PlaceableType.WOOD_WALL,
    role: 'PAREDE',
    roleLabel: 'Parede Estrutural',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Bloqueio Total)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados (Cantos, T, + e Portas)',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 140,
    lightRadius: 0,
  },
  [PlaceableType.STONE_WALL]: {
    type: PlaceableType.STONE_WALL,
    role: 'PAREDE',
    roleLabel: 'Muralha Pesada',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Bloqueio Total)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados (Cantos, T, + e Portões)',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 260,
    lightRadius: 0,
  },
  [PlaceableType.BRICK_WALL]: {
    type: PlaceableType.BRICK_WALL,
    role: 'PAREDE',
    roleLabel: 'Muralha Imperial',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Bloqueio Total)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados com Ameias Imperiais',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 320,
    lightRadius: 0,
  },
  [PlaceableType.WOOD_WINDOW]: {
    type: PlaceableType.WOOD_WINDOW,
    role: 'JANELA',
    roleLabel: 'Parede com Janela',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Passagem de Luz)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados Integrada a Muros',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 145,
    lightRadius: 95,
  },
  [PlaceableType.STONE_WINDOW]: {
    type: PlaceableType.STONE_WINDOW,
    role: 'JANELA',
    roleLabel: 'Muralha com Vitral',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Luz Solar 120px)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados Integrada a Muralhas',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 260,
    lightRadius: 120,
  },
  [PlaceableType.WOOD_DOOR]: {
    type: PlaceableType.WOOD_DOOR,
    role: 'PORTA',
    roleLabel: 'Porta Articulada',
    layer: 'WALL',
    layerLabel: 'Camada de Parede / Acesso',
    hasHitbox: true,
    hitboxBehavior: 'DYNAMIC_DOOR',
    hitboxLabel: 'Hitbox Dinâmica (Fechada: Sólida | Aberta: Livre)',
    continuityMode: 'DOOR_AUTO',
    continuityLabel: 'Rotação & Encaixe Automático N-S / L-O',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 160,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.IRON_GATE]: {
    type: PlaceableType.IRON_GATE,
    role: 'PORTA',
    roleLabel: 'Portão de Fortaleza',
    layer: 'WALL',
    layerLabel: 'Camada de Parede / Acesso',
    hasHitbox: true,
    hitboxBehavior: 'DYNAMIC_DOOR',
    hitboxLabel: 'Hitbox Dinâmica (Fechado: Sólido | Aberto: Livre)',
    continuityMode: 'DOOR_AUTO',
    continuityLabel: 'Rotação & Encaixe Automático N-S / L-O',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 280,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.WOOD_FENCE]: {
    type: PlaceableType.WOOD_FENCE,
    role: 'CERCA',
    roleLabel: 'Cerca / Balaustrada',
    layer: 'WALL',
    layerLabel: 'Camada de Contorno (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox de Contenção (Bloqueia Passagem)',
    hitboxRadius: 10,
    continuityMode: 'FENCE_16',
    continuityLabel: 'Postes & Travessas Conectáveis em 4 Direções',
    connectionGroup: 'fence',
    connectsToGroups: ['fence', 'wall'],
    maxHp: 110,
    lightRadius: 0,
  },

  // === LAYER 3: LIGHTING, TRAPS, STATIONS & FURNITURE ===
  [PlaceableType.TORCH]: {
    type: PlaceableType.TORCH,
    role: 'ILUMINACAO',
    roleLabel: 'Arandela / Tocha',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Iluminação (Fixa em Paredes/Chão)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Fixação Automática em Muros/Cercas ou Piso',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 60,
    lightRadius: 140,
  },
  [PlaceableType.IRON_LANTERN]: {
    type: PlaceableType.IRON_LANTERN,
    role: 'ILUMINACAO',
    roleLabel: 'Luminária Real',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Iluminação (Substitui Tocha no Lugar)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Suporte de Ferro em Paredes/Cercas ou Poste',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 110,
    lightRadius: 215,
  },
  [PlaceableType.ROYAL_BANNER]: {
    type: PlaceableType.ROYAL_BANNER,
    role: 'ILUMINACAO',
    roleLabel: 'Insígnia & Luz',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Decoração (Fixa em Muralhas/Piso)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Brasão de Muralha ou Estandarte de Salão',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 110,
    lightRadius: 160,
  },
  [PlaceableType.CAMPFIRE]: {
    type: PlaceableType.CAMPFIRE,
    role: 'ILUMINACAO',
    roleLabel: 'Lareira & Descanso',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Acampamento (Sobre Chão/Terra)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Base de Pedra Adaptativa ao Piso',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 100,
    lightRadius: 190,
    isInteractive: true,
  },
  [PlaceableType.SPIKE_TRAP]: {
    type: PlaceableType.SPIKE_TRAP,
    role: 'DEFESA',
    roleLabel: 'Armadilha de Piso & Portão',
    layer: 'FURNITURE',
    layerLabel: 'Camada Tática (Coexiste com Pisos, Portas e Portões)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Fere apenas Inimigos)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Encaixe em Corredores, Portas e Muralhas',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 95,
    lightRadius: 0,
  },
  [PlaceableType.WORKBENCH]: {
    type: PlaceableType.WORKBENCH,
    role: 'ESTACAO',
    roleLabel: 'Estação de Ofício Nv.1',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Estação (Sobre Chão/Terra · Rotacionável)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (9px · Contorno Fluido)',
    hitboxRadius: 9,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Alinhamento H/V & Plinto de Oficina',
    connectionGroup: 'none',
    connectsToGroups: ['wall'],
    maxHp: 120,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.FURNACE]: {
    type: PlaceableType.FURNACE,
    role: 'ESTACAO',
    roleLabel: 'Estação de Fundição Nv.2',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Estação (Sobre Chão/Terra · Rotacionável)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (10px · Contorno Fluido)',
    hitboxRadius: 10,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Alinhamento H/V & Base Térmica de Pedra',
    connectionGroup: 'none',
    connectsToGroups: ['wall'],
    maxHp: 160,
    lightRadius: 150,
    isInteractive: true,
  },
  [PlaceableType.SOLAR_ALTAR]: {
    type: PlaceableType.SOLAR_ALTAR,
    role: 'ESTACAO',
    roleLabel: 'Santuário Alquímico Nv.3',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Estação (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (10px · Contorno Fluido)',
    hitboxRadius: 10,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Pedestal Rúnico Integrado ao Piso',
    connectionGroup: 'none',
    connectsToGroups: ['carpet', 'brick_floor'],
    maxHp: 180,
    lightRadius: 210,
    isInteractive: true,
  },
  [PlaceableType.CHEST]: {
    type: PlaceableType.CHEST,
    role: 'MOBILIA',
    roleLabel: 'Baú Interativo (24 Slots)',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Armazenamento (Sobre Chão/Terra · Rotacionável)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (8px · Abre ao Interagir)',
    hitboxRadius: 8,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Rotação H/V & Conexão em Baú Duplo Lateral',
    connectionGroup: 'chest',
    connectsToGroups: ['chest'],
    maxHp: 160,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.EXPLORER_TENT]: {
    type: PlaceableType.EXPLORER_TENT,
    role: 'MOBILIA',
    roleLabel: 'Abrigo de Descanso',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Abrigo (Evolui p/ Cabana Medieval)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (11px)',
    hitboxRadius: 11,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Pavilhão Rotacionável H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wood_floor', 'stone_floor'],
    maxHp: 140,
    lightRadius: 165,
    isInteractive: true,
  },
  [PlaceableType.HEALING_FOUNTAIN]: {
    type: PlaceableType.HEALING_FOUNTAIN,
    role: 'DEFESA',
    roleLabel: 'Santuário de Cura',
    layer: 'FURNITURE',
    layerLabel: 'Camada Monumental (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (10px)',
    hitboxRadius: 10,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Bacia Octogonal Integrada à Calçada',
    connectionGroup: 'none',
    connectsToGroups: ['stone_floor', 'brick_floor'],
    maxHp: 200,
    lightRadius: 230,
    isInteractive: true,
  },
  [PlaceableType.GUARDIAN_TOTEM]: {
    type: PlaceableType.GUARDIAN_TOTEM,
    role: 'DEFESA',
    roleLabel: 'Torreta Solar Automática',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Defesa (Sobre Chão/Muralha)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (9px)',
    hitboxRadius: 9,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Obelisco Defensivo Integrado a Muralhas',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 220,
    lightRadius: 290,
  },
  [PlaceableType.VILLAGE_WELL]: {
    type: PlaceableType.VILLAGE_WELL,
    role: 'MOBILIA',
    roleLabel: 'Poço de Água Fresca',
    layer: 'FURNITURE',
    layerLabel: 'Camada Monumental (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (10px)',
    hitboxRadius: 10,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Base de Alvenaria Circular Integrada',
    connectionGroup: 'none',
    connectsToGroups: ['stone_floor', 'brick_floor'],
    maxHp: 200,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.MARKET_STALL]: {
    type: PlaceableType.MARKET_STALL,
    role: 'ESTACAO',
    roleLabel: 'Tenda de Artesão & Mercado',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Estação (Substitui Bancada no Lugar)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (11px)',
    hitboxRadius: 11,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Balcão Mercante Rotacionável H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wood_floor', 'stone_floor', 'brick_floor'],
    maxHp: 170,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.VILLAGE_HOUSE]: {
    type: PlaceableType.VILLAGE_HOUSE,
    role: 'MOBILIA',
    roleLabel: 'Cabana Medieval',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Edifício (Substitui Tenda no Lugar)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (12px)',
    hitboxRadius: 12,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Fachada Enxaimel Rotacionável H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'stone_floor', 'brick_floor'],
    maxHp: 240,
    lightRadius: 175,
    isInteractive: true,
  },
  [PlaceableType.TILLED_SOIL]: {
    type: PlaceableType.TILLED_SOIL,
    role: 'CHAO',
    roleLabel: 'Canteiro de Terra Arada',
    layer: 'GROUND',
    layerLabel: 'Camada de Solo Agrícola',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Passagem Livre',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Borda Furrow Agrícola Automática',
    connectionGroup: 'wood_floor',
    connectsToGroups: [],
    maxHp: 80,
    lightRadius: 0,
    isInteractive: true,
  },
};

export function getConstructionBlueprint(
  type: PlaceableType
): ConstructionBlueprint {
  return CONSTRUCTION_BLUEPRINTS[type];
}

export interface NatureNodeBlueprint {
  type: NatureNodeType;
  name: string;
  rarity: RarityTier;
  maxHp: number;
  materialKind: MaterialKind;
  requiredTool: ToolType;
  requiredTier: number;
  xpReward: number;
  hasHitbox: boolean;
  hitboxRadius: number; // 0 = passable (no hitbox), >0 = compact trunk/core radius in px
  drops: { itemId: string; min: number; max: number; chance: number }[];
}

export const NATURE_BLUEPRINTS: Record<NatureNodeType, NatureNodeBlueprint> = {
  [NatureNodeType.OAK_TREE]: {
    type: NatureNodeType.OAK_TREE,
    name: 'Carvalho da Planície',
    rarity: RarityTier.BASIC,
    maxHp: 55,
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 12,
    hasHitbox: true,
    hitboxRadius: 7,
    drops: [
      { itemId: 'wood', min: 3, max: 5, chance: 1.0 },
      { itemId: 'fiber', min: 1, max: 2, chance: 0.65 },
      { itemId: 'apple', min: 1, max: 2, chance: 0.45 },
      { itemId: 'wheat_seeds', min: 1, max: 2, chance: 0.4 },
      { itemId: 'carrot_seeds', min: 1, max: 2, chance: 0.25 },
    ],
  },
  [NatureNodeType.BERRY_BUSH]: {
    type: NatureNodeType.BERRY_BUSH,
    name: 'Arbusto de Frutas',
    rarity: RarityTier.BASIC,
    maxHp: 25,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 8,
    hasHitbox: false, // Bushes do not block player/creature movement!
    hitboxRadius: 0,
    drops: [
      { itemId: 'berry', min: 2, max: 4, chance: 1.0 },
      { itemId: 'fiber', min: 2, max: 3, chance: 0.9 },
      { itemId: 'berry_seeds', min: 1, max: 1, chance: 0.5 },
      { itemId: 'herb_seeds', min: 1, max: 1, chance: 0.3 },
    ],
  },
  [NatureNodeType.BOULDER]: {
    type: NatureNodeType.BOULDER,
    name: 'Rocha Cinzenta',
    rarity: RarityTier.BASIC,
    maxHp: 60,
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 0,
    xpReward: 14,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'stone', min: 3, max: 5, chance: 1.0 },
      { itemId: 'flint', min: 1, max: 3, chance: 0.75 },
    ],
  },
  [NatureNodeType.CACTUS]: {
    type: NatureNodeType.CACTUS,
    name: 'Cacto Gigante',
    rarity: RarityTier.BASIC,
    maxHp: 40,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 11,
    hasHitbox: true,
    hitboxRadius: 7,
    drops: [
      { itemId: 'wood', min: 2, max: 3, chance: 0.8 },
      { itemId: 'fiber', min: 2, max: 4, chance: 1.0 },
      { itemId: 'cactus_fruit', min: 2, max: 3, chance: 1.0 },
      { itemId: 'solar_seeds', min: 1, max: 2, chance: 0.45 },
    ],
  },
  [NatureNodeType.PALM_TREE]: {
    type: NatureNodeType.PALM_TREE,
    name: 'Palmeira Costeira',
    rarity: RarityTier.BASIC,
    maxHp: 50,
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 12,
    hasHitbox: true,
    hitboxRadius: 6,
    drops: [
      { itemId: 'wood', min: 2, max: 4, chance: 1.0 },
      { itemId: 'coconut', min: 1, max: 2, chance: 0.75 },
    ],
  },
  [NatureNodeType.IRON_OUTCROP]: {
    type: NatureNodeType.IRON_OUTCROP,
    name: 'Veio de Minério de Ferro',
    rarity: RarityTier.RARE,
    maxHp: 110,
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    xpReward: 28,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'iron_ore', min: 2, max: 4, chance: 1.0 },
      { itemId: 'stone', min: 1, max: 3, chance: 0.8 },
    ],
  },
  [NatureNodeType.HARDWOOD_TREE]: {
    type: NatureNodeType.HARDWOOD_TREE,
    name: 'Árvore Ancestral Dourada',
    rarity: RarityTier.RARE,
    maxHp: 120,
    materialKind: 'HARDWOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 1,
    xpReward: 30,
    hasHitbox: true,
    hitboxRadius: 8,
    drops: [
      { itemId: 'hardwood', min: 2, max: 4, chance: 1.0 },
      { itemId: 'wood', min: 2, max: 3, chance: 0.8 },
      { itemId: 'apple', min: 1, max: 2, chance: 0.5 },
    ],
  },
  [NatureNodeType.DESERT_CRYSTAL]: {
    type: NatureNodeType.DESERT_CRYSTAL,
    name: 'Drusa de Cristal Solar',
    rarity: RarityTier.RARE,
    maxHp: 135,
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    xpReward: 35,
    hasHitbox: true,
    hitboxRadius: 8,
    drops: [
      { itemId: 'solar_crystal', min: 2, max: 3, chance: 1.0 },
      { itemId: 'flint', min: 1, max: 2, chance: 0.65 },
    ],
  },
  [NatureNodeType.SUNSTONE_OBELISK]: {
    type: NatureNodeType.SUNSTONE_OBELISK,
    name: 'Obelisco Astral de Hélio',
    rarity: RarityTier.VERY_RARE,
    maxHp: 220,
    materialKind: 'ASTRAL_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 2,
    xpReward: 75,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'astral_shard', min: 1, max: 3, chance: 1.0 },
      { itemId: 'solar_crystal', min: 2, max: 3, chance: 0.9 },
    ],
  },
  [NatureNodeType.PEARL_CLAM]: {
    type: NatureNodeType.PEARL_CLAM,
    name: 'Ostra Abissal Gigante',
    rarity: RarityTier.VERY_RARE,
    maxHp: 190,
    materialKind: 'ASTRAL_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 2,
    xpReward: 70,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'abyssal_pearl', min: 1, max: 2, chance: 1.0 },
      { itemId: 'stone', min: 2, max: 3, chance: 0.7 },
    ],
  },
  [NatureNodeType.ANCIENT_WORLD_TREE]: {
    type: NatureNodeType.ANCIENT_WORLD_TREE,
    name: 'Árvore-Coração Primordial',
    rarity: RarityTier.VERY_RARE,
    maxHp: 240,
    materialKind: 'PRIMORDIAL_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 2,
    xpReward: 80,
    hasHitbox: true,
    hitboxRadius: 10,
    drops: [
      { itemId: 'primordial_essence', min: 1, max: 3, chance: 1.0 },
      { itemId: 'hardwood', min: 3, max: 5, chance: 1.0 },
    ],
  },
};

/**
 * TABELA OFICIAL DE VALORES SUGERIDOS (em Moedas de Ouro Antigas por unidade).
 * Lógica de precificação construída da base (itens mais baratos e abundantes = 1 Ouro)
 * escalando sem teto máximo de acordo estritamente com a raridade, o risco/dificuldade
 * de obtenção no mundo e o custo acumulado dos ingredientes + complexidade de criação (craft).
 */
export const ITEM_BASE_PRICES: Record<string, number> = {
  // === TIER 1: RECURSOS BÁSICOS ABUNDANTES (PONTO DE PARTIDA) ===
  wood: 1,
  fiber: 1,
  berry: 1,
  gold_coin: 1,
  stone: 2,
  tilled_soil: 2,

  // === TIER 1.5: SEMENTES INICIAIS, FRUTAS DE BIOMA, SAFRA AGRÍCOLA & SUBPRODUTOS ===
  wheat_seeds: 3,
  berry_seeds: 3,
  carrot_seeds: 3,
  bone_fertilizer: 3,
  flint: 4,
  cactus_fruit: 4,
  coconut: 5,
  wheat: 5,
  apple: 6,
  carrot: 7,
  wool: 8,

  // === TIER 2: CONSTRUÇÕES BÁSICAS, CULINÁRIA INICIAL, FERRAMENTAS & ARMADURAS NV.1 ===
  // Construções Nv.0 / Nv.1 (Calculadas pelo custo das matérias-primas + carpintaria)
  wood_floor: 1,
  wood_fence: 1,
  wood_wall: 2,
  wood_bridge: 2,
  torch: 2,
  wood_window: 3,
  stone_floor: 4,
  wood_door: 5,
  spike_trap: 7,
  royal_carpet: 7,
  workbench: 12,
  chest: 14,
  campfire: 15,
  furnace: 45,

  // Consumíveis & Culinária Inicial
  fish_tilapia: 6,
  wool_bandage: 8,
  fresh_bread: 10,
  farm_feed: 11,
  cooked_fish: 14,
  fish_salmon: 16,
  vegetable_stew: 26,
  fish_golden: 65,

  // Ferramentas & Armas Nv.1
  fishing_rod: 10,
  stone_hoe: 12,
  watering_can: 12,
  watering_can_full: 14,
  stone_axe: 15,
  stone_pickaxe: 18,
  wood_sword: 20,
  flint_spear: 30,

  // Armaduras Nv.1 (Conjunto de Lã, Couro & Fibra — Bancada)
  leather_hood: 25,
  leather_boots: 26,
  leather_pants: 28,
  leather_tunic: 38,

  // === TIER 3: RECURSOS RAROS (FERRAMENTAS NV.1+, CULTIVO RARO & COMBATE A MONSTROS) ===
  herb_seeds: 12,
  solar_seeds: 18,
  hardwood: 18,
  iron_ore: 20,
  medic_herb: 22,
  dark_essence: 28,
  spider_silk: 32,
  solar_bloom: 35,
  solar_crystal: 45,
  iron_bar: 48, // 2x Minério de Ferro (40) + 1x Madeira (1) + Fundição na Fornalha
  scorpion_stinger: 55,
  ogre_hide: 75,

  // === TIER 3.5: ALQUIMIA RARA, ARQUITETURA PESADA, FERRAMENTAS/ARMAS & ARMADURAS NV.2 ===
  // Consumíveis & Alquimia Rara
  coconut_elixir: 16,
  taming_treat: 18,
  herbal_poultice: 34,
  fire_bomb: 34,
  healing_salve: 36,
  shadow_elixir: 40,
  warrior_feast: 60,

  // Arquitetura & Estruturas Nv.2
  brick_floor: 5,
  stone_wall: 18,
  stone_window: 18,
  brick_wall: 24,
  iron_lantern: 55,
  village_house: 55,
  royal_banner: 60,
  iron_gate: 62,
  market_stall: 145,
  explorer_tent: 195,
  saddle: 75,
  wood_boat: 60,
  solar_altar: 540, // 4x Barra de Ferro (192) + 4x Cristal Solar (180) + 4x Madeira Nobre (72) + Consagração

  // Ferramentas & Armas Nv.2 (Ferro Forjado & Monstros)
  iron_hoe: 160,
  iron_axe: 220,
  iron_pickaxe: 275,
  ogre_club: 290,
  iron_sword: 330,
  shadow_blade: 360,
  scorpion_dagger: 420,

  // Armaduras Nv.2 (Conjunto de Ferro Forjado & Ogro — Fornalha)
  iron_helmet: 270,
  iron_boots: 270,
  iron_greaves: 325,
  iron_armor: 485,

  // === TIER 4: DIPLOMACIA REAL & RELÍQUIAS MUITO RARAS (COLOSSOS, MAR ABISSAL & DESERTO PROFUNDO) ===
  royal_wax_seal: 180, // Exclusivo de compra com Aldeão/Andarilho
  golem_core: 220,
  abyssal_pearl: 260,
  primordial_essence: 280,
  village_well: 290, // 10x Pedra (20) + 4x Madeira (4) + 1x Núcleo de Colosso (220) + Alvenaria
  astral_shard: 300, // Obelisco Astral ou Transmutação (4x Essência Sombria + 3x Cristal Solar)
  peace_treaty: 600, // 1x Selo Real (180) + 5x Ouro (5) + 3x Barra Ferro (144) + 2x Cristal Solar (90) + 2x Seda (64) + 2x Lã (16) + Diplomacia

  // === TIER 5: EQUIPAMENTOS SUPREMOS, SANTUÁRIOS & RELÍQUIAS DO ALTAR SOLAR (SEM TETO DE PREÇO) ===
  recall_crystal: 270, // (1x Fragmento Astral + 2x Cristal Solar + 2x Essência Sombria) / 2 + Encantamento
  astral_boots: 840, // 2x Fragmento Astral (600) + 2x Essência Sombria (56) + 2x Lã (16) + Forja Astral
  healing_fountain: 1100, // 2x Pérola Abissal (520) + 1x Essência Primordial (280) + 10x Pedra (20) + 2x Cristal Solar (90) + Santuário
  primordial_ambrosia: 1150, // 2x Essência Primordial (560) + 1x Pérola Abissal (260) + 3x Maçã (18) + 2x Coco (10) + Alquimia Divina (+20 HP Perm.)
  astral_crown: 1180, // 2x Fragmento Astral (600) + 1x Pérola Abissal (260) + 2x Cristal Solar (90) + Forja Astral
  abyssal_trident: 1300, // 3x Pérola Abissal (780) + 4x Barra Ferro (192) + 3x Madeira Nobre (54) + 2x Coco (10) + Forja Abissal
  primordial_axe: 1320, // 3x Essência Primordial (840) + 5x Madeira Nobre (90) + 3x Cristal Solar (135) + Forja Primordial
  astral_leggings: 1580, // 2x Fragmento Astral (600) + 2x Pérola Abissal (520) + 2x Couro de Ogro (150) + Forja Astral
  guardian_totem: 1750, // 2x Essência Primordial (560) + 2x Fragmento Astral (600) + 4x Cristal Solar (180) + 4x Madeira Nobre (72) + Torreta Solar
  primordial_pickaxe: 1980, // 3x Fragmento Astral (900) + 2x Pérola Abissal (520) + 4x Barra Ferro (192) + Forja Astral
  astral_armor: 2150, // 3x Fragmento Astral (900) + 2x Pérola Abissal (520) + 3x Couro Ogro (225) + 3x Essência Sombria (84) + Forja Soberana
  astral_sword: 2750, // 3x Fragmento Astral (900) + 2x Pérola Abissal (520) + 2x Essência Primordial (560) + 5x Barra Ferro (240) + Obra-Prima Suprema
};

export function getItemBasePrice(itemId: string): number {
  if (ITEM_BASE_PRICES[itemId] !== undefined) {
    return ITEM_BASE_PRICES[itemId];
  }
  const def = ITEMS[itemId];
  if (!def) return 2;
  if (def.rarity === RarityTier.VERY_RARE) return 500;
  if (def.rarity === RarityTier.RARE) return 60;
  return 2;
}

// Populate basePrice (Valor Sugerido) onto every ItemDefinition in ITEMS
for (const key of Object.keys(ITEMS)) {
  ITEMS[key].basePrice = getItemBasePrice(key);
}

export interface StallDealEvaluation {
  basePrice: number;
  unitPrice: number;
  priceRatio: number; // unitPrice / basePrice
  dealLabel: string;
  dealBadgeColor: string;
  buyChance: number; // 0..0.95 probability that an inspecting NPC decides to purchase
  maxBuyQty: number;
}

/**
 * Avalia quão vantajoso é o preço configurado pelo jogador na Tenda de Vendas em relação ao Valor Sugerido:
 * - Itens baratos (baixo valor sugerido) têm muito mais facilidade de saída e vendem em maior quantidade; itens caros/lendários são mais raros de vender.
 * - Preços abaixo do Valor Sugerido aumentam drasticamente a chance do aldeão comprar; preços caros reduzem ou zeram o interesse.
 * - Sem teto máximo de preço para o item.
 */
export function evaluateStallPriceDeal(
  itemId: string,
  unitPrice: number
): StallDealEvaluation {
  const basePrice = Math.max(1, getItemBasePrice(itemId));
  const safePrice = Math.max(1, Math.round(unitPrice));
  const ratio = safePrice / basePrice;

  // 1. Fator de acessibilidade pelo patamar de valor do item:
  // Itens básicos/baratos vendem com facilidade; relíquias e equipamentos lendários têm compradores mais raros.
  let affordabilityFactor = 1.0;
  if (safePrice <= 5) {
    affordabilityFactor = 1.25;
  } else if (safePrice <= 20) {
    affordabilityFactor = 1.05;
  } else if (safePrice <= 65) {
    affordabilityFactor = 0.8;
  } else if (safePrice <= 250) {
    affordabilityFactor = 0.5;
  } else if (safePrice <= 800) {
    affordabilityFactor = 0.28;
  } else {
    affordabilityFactor = 0.14;
  }

  // 2. Fator de avaliação de negócio (comparado ao Valor Sugerido)
  let dealMultiplier = 0;
  let dealLabel = 'Valor Sugerido (Justo)';
  let dealBadgeColor = '#38bdf8';

  if (ratio <= 0.6) {
    dealMultiplier = 0.92;
    dealLabel = 'Pechincha Imperdível!';
    dealBadgeColor = '#4ade80';
  } else if (ratio <= 0.85) {
    dealMultiplier = 0.74;
    dealLabel = 'Barato (Ótimo Negócio)';
    dealBadgeColor = '#86efac';
  } else if (ratio <= 1.05) {
    dealMultiplier = 0.5;
    dealLabel = 'Valor Sugerido (Justo)';
    dealBadgeColor = '#38bdf8';
  } else if (ratio <= 1.3) {
    dealMultiplier = 0.22;
    dealLabel = 'Caro (Pouco Interesse)';
    dealBadgeColor = '#fbbf24';
  } else if (ratio <= 1.65) {
    dealMultiplier = 0.07;
    dealLabel = 'Muito Caro (Raro)';
    dealBadgeColor = '#fb923c';
  } else {
    dealMultiplier = 0;
    dealLabel = 'Abusivo (Ninguém Compra)';
    dealBadgeColor = '#f43f5e';
  }

  const buyChance =
    dealMultiplier <= 0
      ? 0
      : Math.min(0.95, Math.max(0.03, dealMultiplier * affordabilityFactor));

  // Quantidade máxima que o aldeão pode querer levar numa única compra (itens baratos saem em lotes maiores)
  let maxBuyQty = 1;
  if (safePrice <= 3 && ratio <= 1.05) {
    maxBuyQty = 10;
  } else if (safePrice <= 10 && ratio <= 1.1) {
    maxBuyQty = 6;
  } else if (safePrice <= 30 && ratio <= 1.1) {
    maxBuyQty = 4;
  } else if (safePrice <= 80 && ratio <= 1.05) {
    maxBuyQty = 2;
  }

  return {
    basePrice,
    unitPrice: safePrice,
    priceRatio: ratio,
    dealLabel,
    dealBadgeColor,
    buyChance,
    maxBuyQty,
  };
}

// ============================================================================
// SISTEMA DE REQUISITOS DE QUEBRA E MATRIZ DE FORÇA POR MATERIAL (MÃO & FERRAMENTAS)
// ============================================================================

export const MATERIAL_LABELS: Record<MaterialKind, string> = {
  FIBER_FOLIAGE: 'Fibra & Folhagem',
  SOFT_WOOD: 'Madeira Rústica',
  ROUGH_STONE: 'Rocha & Alvenaria Básica',
  HARDWOOD: 'Madeira Nobre Ancestral',
  IRON_MINERAL: 'Minério de Ferro & Cristal Solar',
  PRIMORDIAL_WOOD: 'Madeira-Coração Primordial',
  ASTRAL_MINERAL: 'Rocha Astral & Abissal',
};

export interface ElementBreakRequirement {
  materialKind: MaterialKind;
  materialLabel: string;
  requiredTool: ToolType;
  requiredTier: number;
  requirementLabel: string;
  recommendedToolLabel: string;
}

export const STRUCTURE_MATERIAL_REQUIREMENTS: Record<
  PlaceableType,
  {
    materialKind: MaterialKind;
    requiredTool: ToolType;
    requiredTier: number;
    requirementLabel: string;
  }
> = {
  // === FOLHAGEM, TECIDO & SOLO (Quebrável com a Mão ou Qualquer Ferramenta) ===
  [PlaceableType.TORCH]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Qualquer Ferramenta',
  },
  [PlaceableType.ROYAL_CARPET]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Qualquer Ferramenta',
  },
  [PlaceableType.ROYAL_BANNER]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },
  [PlaceableType.EXPLORER_TENT]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },
  [PlaceableType.TILLED_SOIL]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.HOE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Enxada',
  },

  // === MADEIRA RÚSTICA (Quebrável com a Mão com força menor; ideal com Machado) ===
  [PlaceableType.WOOD_FLOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WOOD_BRIDGE]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WOOD_WALL]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WOOD_WINDOW]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WOOD_DOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WOOD_FENCE]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WORKBENCH]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.CHEST]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre, Arma ou Machado (Ideal: Machado)',
  },
  [PlaceableType.MARKET_STALL]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre, Arma ou Machado (Ideal: Machado)',
  },
  [PlaceableType.SPIKE_TRAP]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },

  // === ROCHA & ALVENARIA BÁSICA (Quebrável com a Mão lentamente; ideal com Picareta) ===
  [PlaceableType.CAMPFIRE]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Picareta (Ideal: Picareta)',
  },
  [PlaceableType.STONE_FLOOR]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Picareta (Ideal: Picareta)',
  },
  [PlaceableType.FURNACE]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.STONE_WALL]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.STONE_WINDOW]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.BRICK_FLOOR]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.BRICK_WALL]: {
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.VILLAGE_WELL]: {
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },

  // === MADEIRA NOBRE & EDIFICAÇÕES REFORÇADAS ===
  [PlaceableType.VILLAGE_HOUSE]: {
    materialKind: 'HARDWOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 1,
    requirementLabel: 'Requer Machado de Pedra+ (Nv.1+)',
  },

  // === FERRO FORJADO & CRISTAL SOLAR ===
  [PlaceableType.IRON_GATE]: {
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.IRON_LANTERN]: {
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    requirementLabel: 'Requer Picareta de Pedra+ (Nv.1+)',
  },
  [PlaceableType.SOLAR_ALTAR]: {
    materialKind: 'ASTRAL_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 2,
    requirementLabel: 'Requer Picareta de Ferro+ (Nv.2+)',
  },

  // === ESTRUTURAS PRIMORDIAIS & ASTRAIS ===
  [PlaceableType.GUARDIAN_TOTEM]: {
    materialKind: 'PRIMORDIAL_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 2,
    requirementLabel: 'Requer Machado de Ferro+ (Nv.2+)',
  },
  [PlaceableType.HEALING_FOUNTAIN]: {
    materialKind: 'ASTRAL_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 2,
    requirementLabel: 'Requer Picareta de Ferro+ (Nv.2+)',
  },
};

// Populate materialKind, requiredTool, and requiredTier onto CONSTRUCTION_BLUEPRINTS
for (const key of Object.keys(CONSTRUCTION_BLUEPRINTS) as PlaceableType[]) {
  const req = STRUCTURE_MATERIAL_REQUIREMENTS[key];
  if (req && CONSTRUCTION_BLUEPRINTS[key]) {
    CONSTRUCTION_BLUEPRINTS[key].materialKind = req.materialKind;
    CONSTRUCTION_BLUEPRINTS[key].requiredTool = req.requiredTool;
    CONSTRUCTION_BLUEPRINTS[key].requiredTier = req.requiredTier;
  }
}

/**
 * TABELA EXPLÍCITA DE FORÇA DE QUEBRA POR MATERIAL (Mão Livre e cada Ferramenta/Arma).
 * Define exatamente quanta força base cada item (ou a mão livre) exerce contra cada tipo de material.
 */
export const HAND_AND_TOOL_MATERIAL_STRENGTH: Record<
  string,
  {
    label: string;
    toolType: ToolType;
    toolTier: number;
    forceByMaterial: Record<MaterialKind, number>;
  }
> = {
  // === MÃO LIVRE (Tier 0) — Permite coletar recursos básicos iniciais sem itens ===
  bare_hand: {
    label: 'Mão Livre (Desarmado)',
    toolType: ToolType.NONE,
    toolTier: 0,
    forceByMaterial: {
      FIBER_FOLIAGE: 9, // Quebra Arbusto (25 HP) em 3 golpes e Cacto (40 HP) em 5 golpes
      SOFT_WOOD: 7, // Quebra Carvalho (55 HP) em 8 golpes e Palmeira (50 HP) em 8 golpes
      ROUGH_STONE: 6, // Quebra Rocha Cinzenta (60 HP) em 10 golpes para obter as primeiras pedras
      HARDWOOD: 0, // Bloqueado (Requer Machado de Pedra Nv.1+)
      IRON_MINERAL: 0, // Bloqueado (Requer Picareta de Pedra Nv.1+)
      PRIMORDIAL_WOOD: 0, // Bloqueado (Requer Machado de Ferro Nv.2+)
      ASTRAL_MINERAL: 0, // Bloqueado (Requer Picareta de Ferro Nv.2+)
    },
  },

  // === MACHADOS (Especializados em FIBER_FOLIAGE, SOFT_WOOD, HARDWOOD e PRIMORDIAL_WOOD) ===
  stone_axe: {
    label: 'Machado de Pedra (Nv.1)',
    toolType: ToolType.AXE,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 22,
      SOFT_WOOD: 24, // Derruba Carvalho (55 HP) em 3 golpes
      ROUGH_STONE: 7, // Fraco contra rocha
      HARDWOOD: 22, // Desbloqueia Árvore Ancestral Dourada (120 HP -> 6 golpes)
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  iron_axe: {
    label: 'Machado de Ferro Forjado (Nv.2)',
    toolType: ToolType.AXE,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 42,
      SOFT_WOOD: 46, // Derruba Carvalho em 2 golpes
      ROUGH_STONE: 12,
      HARDWOOD: 42, // Derruba Árvore Ancestral em 3 golpes
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 40, // Desbloqueia Árvore-Coração Primordial (240 HP -> 6 golpes)
      ASTRAL_MINERAL: 0,
    },
  },
  primordial_axe: {
    label: 'Machado Primordial do Bosque (Nv.3)',
    toolType: ToolType.AXE,
    toolTier: 3,
    forceByMaterial: {
      FIBER_FOLIAGE: 85,
      SOFT_WOOD: 90, // Derruba Carvalho em 1 golpe
      ROUGH_STONE: 20,
      HARDWOOD: 85, // Derruba Árvore Ancestral em 2 golpes
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 85, // Derruba Árvore-Coração Primordial em 3 golpes
      ASTRAL_MINERAL: 0,
    },
  },

  // === PICARETAS (Especializadas em ROUGH_STONE, IRON_MINERAL e ASTRAL_MINERAL) ===
  stone_pickaxe: {
    label: 'Picareta de Pedra (Nv.1)',
    toolType: ToolType.PICKAXE,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 12,
      SOFT_WOOD: 7, // Fraca contra madeira
      ROUGH_STONE: 24, // Quebra Rocha Cinzenta (60 HP) em 3 golpes
      HARDWOOD: 0,
      IRON_MINERAL: 22, // Desbloqueia Minério de Ferro (110 HP -> 5 golpes) e Cristal Solar (135 HP -> 7 golpes)
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  iron_pickaxe: {
    label: 'Picareta de Ferro Forjado (Nv.2)',
    toolType: ToolType.PICKAXE,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 20,
      SOFT_WOOD: 12,
      ROUGH_STONE: 46, // Quebra Rocha Cinzenta em 2 golpes
      HARDWOOD: 0,
      IRON_MINERAL: 44, // Quebra Minério de Ferro em 3 golpes
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 42, // Desbloqueia Obelisco Astral (220 HP -> 6 golpes) e Ostra Abissal (190 HP -> 5 golpes)
    },
  },
  primordial_pickaxe: {
    label: 'Picareta Astral de Hélio (Nv.3)',
    toolType: ToolType.PICKAXE,
    toolTier: 3,
    forceByMaterial: {
      FIBER_FOLIAGE: 36,
      SOFT_WOOD: 20,
      ROUGH_STONE: 90, // Quebra Rocha Cinzenta em 1 golpe
      HARDWOOD: 0,
      IRON_MINERAL: 86, // Quebra Minério de Ferro em 2 golpes
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 85, // Quebra Obelisco Astral e Ostra Abissal em 3 golpes
    },
  },

  // === ENXADAS (Especializadas em Solo Agrícola e FIBER_FOLIAGE) ===
  stone_hoe: {
    label: 'Enxada de Pedra (Nv.1)',
    toolType: ToolType.HOE,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 18,
      SOFT_WOOD: 8,
      ROUGH_STONE: 7,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  iron_hoe: {
    label: 'Enxada de Ferro Forjado (Nv.2)',
    toolType: ToolType.HOE,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 34,
      SOFT_WOOD: 14,
      ROUGH_STONE: 11,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },

  // === ARMAS DE COMBATE (Cortam Folhagem rapidamente e causam dano moderado em Madeira/Estruturas básicas) ===
  wood_sword: {
    label: 'Espada de Sílex & Madeira (Nv.1)',
    toolType: ToolType.SWORD,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 18,
      SOFT_WOOD: 10,
      ROUGH_STONE: 6,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  flint_spear: {
    label: 'Lança de Sílex Caçadora (Nv.1)',
    toolType: ToolType.SWORD,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 19,
      SOFT_WOOD: 10,
      ROUGH_STONE: 7,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  iron_sword: {
    label: 'Espada Longa de Ferro (Nv.2)',
    toolType: ToolType.SWORD,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 28,
      SOFT_WOOD: 15,
      ROUGH_STONE: 9,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  shadow_blade: {
    label: 'Foice Sombria Vampírica (Nv.2)',
    toolType: ToolType.SWORD,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 35,
      SOFT_WOOD: 16,
      ROUGH_STONE: 9,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  scorpion_dagger: {
    label: 'Adaga de Ferrão Solar (Nv.2)',
    toolType: ToolType.SWORD,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 30,
      SOFT_WOOD: 14,
      ROUGH_STONE: 8,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  ogre_club: {
    label: 'Clava Brutal de Ogro (Nv.2)',
    toolType: ToolType.SWORD,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 26,
      SOFT_WOOD: 24,
      ROUGH_STONE: 20,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  abyssal_trident: {
    label: 'Tridente Abissal dos Mares (Nv.3)',
    toolType: ToolType.SWORD,
    toolTier: 3,
    forceByMaterial: {
      FIBER_FOLIAGE: 38,
      SOFT_WOOD: 22,
      ROUGH_STONE: 16,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  astral_sword: {
    label: 'Lâmina Astral do Hélio (Nv.3)',
    toolType: ToolType.SWORD,
    toolTier: 3,
    forceByMaterial: {
      FIBER_FOLIAGE: 45,
      SOFT_WOOD: 26,
      ROUGH_STONE: 18,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
};

export function getNatureBreakRequirement(
  type: NatureNodeType
): ElementBreakRequirement {
  const bp = NATURE_BLUEPRINTS[type];
  const materialKind = bp.materialKind || 'SOFT_WOOD';
  const materialLabel = MATERIAL_LABELS[materialKind];
  const recommendedToolLabel =
    bp.requiredTool === ToolType.PICKAXE
      ? 'Picareta'
      : bp.requiredTool === ToolType.AXE
      ? 'Machado'
      : 'Mão Livre / Qualquer';

  let requirementLabel = 'Mão Livre ou Qualquer Ferramenta';
  if (bp.requiredTier >= 2) {
    requirementLabel =
      bp.requiredTool === ToolType.PICKAXE
        ? 'Requer Picareta de Ferro+ (Nv.2+)'
        : 'Requer Machado de Ferro+ (Nv.2+)';
  } else if (bp.requiredTier === 1) {
    requirementLabel =
      bp.requiredTool === ToolType.PICKAXE
        ? 'Requer Picareta de Pedra+ (Nv.1+)'
        : 'Requer Machado de Pedra+ (Nv.1+)';
  } else if (bp.requiredTool === ToolType.AXE) {
    requirementLabel = 'Quebrável à Mão (Força 7) · Ideal: Machado (Força 24+)';
  } else if (bp.requiredTool === ToolType.PICKAXE) {
    requirementLabel = 'Quebrável à Mão (Força 6) · Ideal: Picareta (Força 24+)';
  }

  return {
    materialKind,
    materialLabel,
    requiredTool: bp.requiredTool,
    requiredTier: bp.requiredTier,
    requirementLabel,
    recommendedToolLabel,
  };
}

export function getStructureBreakRequirement(
  type: PlaceableType
): ElementBreakRequirement {
  const req = STRUCTURE_MATERIAL_REQUIREMENTS[type] || {
    materialKind: 'SOFT_WOOD' as MaterialKind,
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  };
  const recommendedToolLabel =
    req.requiredTool === ToolType.PICKAXE
      ? 'Picareta'
      : req.requiredTool === ToolType.AXE
      ? 'Machado'
      : req.requiredTool === ToolType.HOE
      ? 'Enxada'
      : 'Mão Livre';

  return {
    materialKind: req.materialKind,
    materialLabel: MATERIAL_LABELS[req.materialKind],
    requiredTool: req.requiredTool,
    requiredTier: req.requiredTier,
    requirementLabel: req.requirementLabel,
    recommendedToolLabel,
  };
}

export interface MaterialBreakEvaluation {
  canBreak: boolean;
  force: number;
  baseMaterialForce: number;
  blockReason: string | null;
  actorLabel: string;
  materialLabel: string;
}

/**
 * Calcula se o jogador pode quebrar um elemento (recurso natural ou estrutura) com a mão ou ferramenta equipada,
 * e retorna a força exata aplicada contra o material específico daquele elemento.
 */
export function evaluateMaterialBreak(
  heldItemId: string | null,
  toolType: ToolType,
  toolTier: number,
  playerStrengthMult: number,
  materialKind: MaterialKind,
  requiredTool: ToolType,
  requiredTier: number
): MaterialBreakEvaluation {
  const materialLabel = MATERIAL_LABELS[materialKind] || 'Material';
  const entry =
    heldItemId && HAND_AND_TOOL_MATERIAL_STRENGTH[heldItemId]
      ? HAND_AND_TOOL_MATERIAL_STRENGTH[heldItemId]
      : HAND_AND_TOOL_MATERIAL_STRENGTH.bare_hand;

  // 1. Verificar requisito estrito de ferramenta e nível (requiredTier >= 1)
  if (requiredTier > 0) {
    const toolMatches =
      requiredTool === ToolType.NONE || toolType === requiredTool;
    const tierMatches = toolTier >= requiredTier;
    if (!toolMatches || !tierMatches) {
      const toolName =
        requiredTool === ToolType.PICKAXE
          ? 'Picareta'
          : requiredTool === ToolType.AXE
          ? 'Machado'
          : 'Ferramenta';
      const tierName =
        requiredTier >= 3
          ? 'Primordial/Astral (Nv.3)'
          : requiredTier === 2
          ? 'de Ferro+ (Nv.2+)'
          : 'de Pedra+ (Nv.1+)';
      return {
        canBreak: false,
        force: 0,
        baseMaterialForce: 0,
        blockReason: `Requer ${toolName} ${tierName} (${materialLabel})`,
        actorLabel: entry.label,
        materialLabel,
      };
    }
  }

  // 2. Obter a força específica da mão ou ferramenta contra este material
  let baseMaterialForce = entry.forceByMaterial[materialKind] ?? 0;

  // Fallback seguro caso um item customizado tenha toolType/toolTier compatível
  if (baseMaterialForce <= 0 && requiredTier === 0) {
    baseMaterialForce =
      HAND_AND_TOOL_MATERIAL_STRENGTH.bare_hand.forceByMaterial[materialKind] || 6;
  }

  if (baseMaterialForce <= 0) {
    return {
      canBreak: false,
      force: 0,
      baseMaterialForce: 0,
      blockReason: `Força insuficiente contra ${materialLabel}`,
      actorLabel: entry.label,
      materialLabel,
    };
  }

  const finalForce = Math.max(
    1,
    Math.round(baseMaterialForce * Math.max(1, playerStrengthMult))
  );

  return {
    canBreak: true,
    force: finalForce,
    baseMaterialForce,
    blockReason: null,
    actorLabel: entry.label,
    materialLabel,
  };
}



