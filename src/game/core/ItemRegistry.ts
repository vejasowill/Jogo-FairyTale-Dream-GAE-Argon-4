import {
  ClothingColorId,
  ConstructionBlueprint,
  EquipmentSlot,
  ItemCategory,
  ItemDefinition,
  MaterialKind,
  NatureNodeType,
  PlaceableType,
  RarityTier,
  ToolType,
} from './types';

export interface ClothingColorDefinition {
  id: ClothingColorId;
  label: string;
  hex: string;
  darkHex: string;
  lightHex: string;
}

export const CLOTHING_COLORS: ClothingColorDefinition[] = [
  { id: 'preto', label: 'Preto', hex: '#232730', darkHex: '#11141a', lightHex: '#3b4252' },
  { id: 'cinza', label: 'Cinza', hex: '#64748b', darkHex: '#334155', lightHex: '#94a3b8' },
  { id: 'cinza_claro', label: 'Cinza-Claro', hex: '#cbd5e1', darkHex: '#94a3b8', lightHex: '#e2e8f0' },
  { id: 'branco', label: 'Branco', hex: '#f1f5f9', darkHex: '#cbd5e1', lightHex: '#ffffff' },
  { id: 'vermelho', label: 'Vermelho', hex: '#dc2626', darkHex: '#991b1b', lightHex: '#f87171' },
  { id: 'laranja', label: 'Laranja', hex: '#ea580c', darkHex: '#9a3412', lightHex: '#fb923c' },
  { id: 'amarelo', label: 'Amarelo', hex: '#eab308', darkHex: '#a16207', lightHex: '#fde047' },
  { id: 'bege', label: 'Bege', hex: '#d6b88a', darkHex: '#9c7c50', lightHex: '#ead7b7' },
  { id: 'verde_lima', label: 'Verde-Lima', hex: '#84cc16', darkHex: '#4d7c0f', lightHex: '#bef264' },
  { id: 'verde', label: 'Verde', hex: '#16a34a', darkHex: '#14532d', lightHex: '#4ade80' },
  { id: 'ciano', label: 'Ciano', hex: '#06b6d4', darkHex: '#0e7490', lightHex: '#67e8f9' },
  { id: 'azul_claro', label: 'Azul-Claro', hex: '#38bdf8', darkHex: '#0284c7', lightHex: '#bae6fd' },
  { id: 'azul', label: 'Azul', hex: '#2563eb', darkHex: '#1e3a8a', lightHex: '#60a5fa' },
  { id: 'roxo', label: 'Roxo', hex: '#7c3aed', darkHex: '#4c1d95', lightHex: '#a78bfa' },
  { id: 'magenta', label: 'Magenta', hex: '#c026d3', darkHex: '#86198f', lightHex: '#e879f9' },
  { id: 'rosa', label: 'Rosa', hex: '#f472b6', darkHex: '#be185d', lightHex: '#fbcfe8' },
  { id: 'marrom', label: 'Marrom', hex: '#8b5a2b', darkHex: '#5c3a18', lightHex: '#b07943' },
];

export const CLOTHING_COLOR_MAP: Record<ClothingColorId, ClothingColorDefinition> =
  CLOTHING_COLORS.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {} as Record<ClothingColorId, ClothingColorDefinition>);

export const ITEMS: Record<string, ItemDefinition> = {
  // === BASIC RESOURCES ===
  wood: {
    id: 'wood',
    name: 'Madeira de Carvalho',
    description:
      'Tronco de carvalho cortado de Árvores de Carvalho e palmeiras. Base estrutural para ferramentas, estações, pontes, armadilhas e combustível de fundição.',
    purposeSummary:
      'Cria Bancada, Fogueira, Tochas, Ferramentas Iniciais, Pontes Costeiras, Muros, Pisos, Armadilhas de Espinhos e funde Minério de Ferro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  dark_oak_wood: {
    id: 'dark_oak_wood',
    name: 'Madeira de Carvalho Escuro',
    description:
      'Toras densas e escuras extraídas de Carvalhos Escuros na Floresta Temperada. Pode ser escolhida como madeira em qualquer receita ou usada como combustível.',
    purposeSummary:
      'Substitui qualquer madeira nas receitas de criação e serve como combustível.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  pine_wood: {
    id: 'pine_wood',
    name: 'Madeira de Pinheiro',
    description:
      'Toras resinosas e aromáticas cortadas de Pinheiros na Floresta de Taiga. Pode ser escolhida como madeira em qualquer receita ou usada como combustível.',
    purposeSummary:
      'Substitui qualquer madeira nas receitas de criação e serve como combustível.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  palm_wood: {
    id: 'palm_wood',
    name: 'Madeira de Coqueiro',
    description:
      'Troncos cilíndricos anelados e fibrosos extraídos de Coqueiros nas costas tropicais, ilhas e oásis do deserto. Pode ser escolhida como madeira em qualquer receita, usada em construções de troncos enfileirados ou como combustível.',
    purposeSummary:
      'Cria Pisos, Paredes, Janelas e Portas de Coqueiro (troncos inteiros enfileirados), substitui madeira comum e serve como combustível.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  stone: {
    id: 'stone',
    name: 'Pedra Bruta',
    description:
      'Fragmento de rocha resistente das planícies e desertos. Essencial para alvenaria, fornalhas, calçadas de velocidade e poços.',
    purposeSummary:
      'Cria Machado/Picareta de Pedra, Fogueira, Fornalha de Fundição, Calçada de Pedra Real (+22% Velocidade), Muralhas e Poço da Vila.',
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
      'Lasca mineral pontiaguda e inflamável extraída de rochas. Usada em lâminas perfurantes, armadilhas e explosivos.',
    purposeSummary:
      'Cria Espada de Sílex, Lança de Sílex (Longo Alcance), Armadilha de Espinhos, Fornalha de Fundição e Bomba de Sílex.',
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
  charcoal: {
    id: 'charcoal',
    name: 'Carvão',
    description:
      'Minério energético extraído de veios no subsolo ou obtido ao queimar madeira na Fogueira ou Fornalha. Possui 5x mais eficiência energética que a madeira comum como lenha!',
    purposeSummary:
      'Combustível Nobre (60s de queima no Slot de Lenha — 5x mais eficiente que Madeira!), além de criar Tochas, Lampiões e Bombas de Sílex.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  sand: {
    id: 'sand',
    name: 'Areia',
    description:
      'Grãos finos de sílica coletados ao quebrar Dunas de Areia nos solos de areia do deserto e das praias. Pode ser fundida na Fornalha para produzir Vidro.',
    purposeSummary:
      'Funda 1x Areia na Fornalha de Fundição (6s) para produzir 1x Vidro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  glass: {
    id: 'glass',
    name: 'Vidro',
    description:
      'Painel cristalino translúcido produzido na Fornalha a partir da Areia (6s). Indispensável na construção de Paredes com Janela.',
    purposeSummary:
      'Usado na Bancada/Fornalha para criar Parede de Madeira com Janela e Parede de Pedra com Janela.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
  },
  leather: {
    id: 'leather',
    name: 'Couro',
    description:
      'Couro curtido resistente e flexível obtido ao caçar Vacas (80% de chance) ou Javalis (50% de chance). Matéria-prima essencial para chapéus de couro, macacões, sandálias e botas na Mesa de Tecelagem.',
    purposeSummary:
      'Obtido de Vacas (80%) e Javalis (50%): Usado na Mesa de Tecelagem para produzir Chapéu de Couro, Macacão, Sandália e Bota de Vaqueiro.',
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
      'Colhido de palmeiras costeiras. Hidrata profundamente, remove todos os efeitos ativos sobre o personagem e auxilia na domesticação de animais.',
    purposeSummary:
      'Consumir (+24 Fome, +35 Energia, remove todos os efeitos ativos), Domesticar Animais, ou preparar Elixir Tropical de Coco e Banquete do Guerreiro.',
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
      'Tônico refrescante preparado com Coco Costeiro e Fruto de Cacto. Purifica o organismo, removendo todos os efeitos aplicados sobre o personagem.',
    purposeSummary:
      'Restaura +40 Fome, +25 HP, +80 Energia e remove todos os efeitos aplicados sobre o personagem.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 25,
    hungerRestore: 40,
    hpRestore: 25,
    staminaRestore: 80,
  },
  healing_salve: {
    id: 'healing_salve',
    name: 'Elixir de Ervas & Âmbar',
    description:
      'Bálsamo regenerador preparado na Bancada de Trabalho com Folha de Erva-da-Vida e frutas medicinais. Remove todos os efeitos aplicados sobre o personagem.',
    purposeSummary:
      'Restaura +65 Vida, +40 Energia, +15 Fome e remove todos os efeitos aplicados sobre o personagem.',
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
      'Refeição revigorante preparada na Bancada com Maçã Dourada, Coco e Couro. Concede Fúria de Combate (+35% Dano de Ataque por 50s).',
    purposeSummary:
      'Restaura +75 Fome, +45 HP, +60 Energia e aumenta seu Dano de Ataque em +35% por 50 segundos!',
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
    name: 'Bomba de Sílex',
    description:
      'Carga explosiva de Sílex Afiado, Minério de Ferro e Carvão. Detona ao redor do herói causando 65 de dano em área e quebrando rochas!',
    purposeSummary:
      'Segure na mão e aperte Consumir/Usar para detonar uma explosão que causa 65 de dano a inimigos e 90 de dano a recursos próximos!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 20,
    specialUse: 'bomb',
  },
  recall_crystal: {
    id: 'recall_crystal',
    name: 'Cristal de Retorno',
    description:
      'Artefato de retorno forjado com Ouro e Essência Sombria. Teletransporta instantaneamente você e seus pets de volta ao Acampamento Inicial e cura +50 HP.',
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
    name: 'Essência da Vida',
    description:
      'Elixir concentrado preparado na Bancada de Trabalho com Essência da Árvore-Coração, Pérola Abissal, Maçã Dourada e Coco. Aumenta PERMANENTEMENTE sua Vida Máxima em +20 HP!',
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
  wheat_seeds: {
    id: 'wheat_seeds',
    name: 'Sementes de Trigo Dourado',
    description:
      'Grãos selecionados para plantio em terra arada. Cresce em 4 fases sob luz natural e solo irrigado.',
    purposeSummary:
      'Plante em Canteiro de Terra Arada (botão Usar). Requer água para produzir Trigo Dourado.',
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
      'Composto enriquecido com fibras e minerais. Acelera o crescimento de plantações e mudas ou pode ser usado com "Adubar Chão" para fazer brotar vegetação natural irregular num raio de 60px.',
    purposeSummary:
      'Aplique na plantação/muda para avançar 1 estágio imediatamente, ou use "Adubar Chão" para gerar vegetação natural do bioma (raio 60px)!',
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
    attackDelivery: 'melee',
    attackTargetScope: 'single',
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
    attackDelivery: 'melee',
    attackTargetScope: 'single',
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
      'Solo fofo e arejado preparado para receber sementes de trigo, cenoura, ervas medicinais ou bagas.',
    purposeSummary:
      'Canteiro agrícola onde plantas crescem através de 4 fases (Semente -> Broto -> Crescimento -> Madura).',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.TILLED_SOIL,
  },
  stone_shovel: {
    id: 'stone_shovel',
    name: 'Pá de Pedra',
    description:
      'Ferramenta de terraplenagem que compacta o solo em Caminho de Solo Batido (+18% de Velocidade de Movimento, com bordas adaptativas e conectivas entre biomas). Não causa dano de combate.',
    purposeSummary:
      'Ferramenta de Caminho Nv.1 (0 de Dano): Cria ou desfaz Caminho de Solo Batido (+18% Velocidade) em qualquer bioma terrestre.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.SHOVEL,
    toolTier: 1,
    attackDamage: 0,
    attackRange: 46,
    harvestPower: 0,
  },
  iron_shovel: {
    id: 'iron_shovel',
    name: 'Pá de Ferro Forjado',
    description:
      'Pá reforçada de ferro forjado com alcance ampliado para abrir ou desfazer estradas e Caminhos de Solo Batido (+18% de Velocidade de Movimento) entre vilas e biomas. Não causa dano de combate.',
    purposeSummary:
      'Ferramenta de Caminho Nv.2 (0 de Dano): Cria ou desfaz Caminho de Solo Batido (+18% Velocidade) com maior alcance.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SHOVEL,
    toolTier: 2,
    attackDamage: 0,
    attackRange: 52,
    harvestPower: 0,
  },
  dirt_path: {
    id: 'dirt_path',
    name: 'Caminho de Solo Batido',
    description:
      'Trilha de terra compactada feita com a Pá. Possui bordas adaptativas e conectivas (inclusive entre biomas) e aumenta a velocidade de locomoção em +18%, sem propriedades de plantio.',
    purposeSummary:
      'Caminho Adaptativo (Sem Hitbox · +18% Velocidade): Criado e removido apenas com a Pá.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.DIRT_PATH,
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
    attackDelivery: 'melee',
    attackTargetScope: 'single',
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
    name: 'Peixe Dourado',
    description:
      'Espécie rara de escamas reluzentes como ouro. Concede vigor extraordinário e velocidade ao ser consumido.',
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
  squid: {
    id: 'squid',
    name: 'Lula',
    description:
      'Cefalópode marinho de tinta escura intensa. Só pode ser pescado nas águas salgadas do Oceano.',
    purposeSummary:
      'Pescado exclusivamente no Oceano. Ingrediente essencial para produzir Corante Preto na Bancada de Trabalho (ou consumir: +22 Fome, +10 HP, +15 Energia).',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.RARE,
    maxStack: 50,
    hungerRestore: 22,
    hpRestore: 10,
    staminaRestore: 15,
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
      'Funda na Fornalha para criar Barras de Ferro Forjado ou combine com Sílex para fabricar Bombas de Sílex.',
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
      'Forja Espada/Machado/Picareta de Ferro, Foice Sombria, Tridente Abissal, Couraça de Ferro, Muralhas, Picareta de Ouro e Espada de Ouro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  gold_ore: {
    id: 'gold_ore',
    name: 'Minério de Ouro',
    description:
      'Minério nobre e reluzente extraído de veios raros nas profundezas do subsolo (mais raro que o ferro e o carvão).',
    purposeSummary:
      'Funda na Fornalha de Pedra com combustível para produzir Ouro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  gold_bar: {
    id: 'gold_bar',
    name: 'Ouro',
    description:
      'Ouro de alta pureza refinado na Fornalha a partir do Minério de Ouro.',
    purposeSummary:
      'Material nobre de fabricação usado na Bancada de Trabalho e na Mesa de Tecelagem para equipamentos, armaduras e estruturas especiais.',
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
      'Cria Equipamentos de Ferro, Clava Brutal de Ogro, Tridente Abissal, Tenda do Aventureiro, Machado Primordial e Totem de Defesa.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 99,
  },
  dark_essence: {
    id: 'dark_essence',
    name: 'Essência Sombria',
    description:
      'Núcleo sombrio deixado por Zumbis derrotados. Essencial para armas vampíricas, elixires de velocidade noturna, Cristal de Retorno e armaduras de ouro.',
    purposeSummary:
      'Forja a Foice Sombria (Dreno de Vida por golpe), prepara Elixir da Sombra Noturna (+Velocidade), Cristal de Retorno e Armadura de Ouro.',
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
      'Cria Clava Brutal de Ogro (Alto Dano + Empurrão), Couraça de Ferro & Ogro, Tenda de Lã & Couro, Banquete do Guerreiro e Armadura de Ouro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 50,
  },

  // === VERY RARE RESOURCES ===
  abyssal_pearl: {
    id: 'abyssal_pearl',
    name: 'Pérola Abissal',
    description:
      'Jóia iridescente muito rara colhida de Ostras Gigantes no Oceano usando Pontes Costeiras e Picareta de Ferro+.',
    purposeSummary:
      'Forja Tridente Abissal dos Mares, Essência da Vida (+20 HP Máx), Picareta de Ouro, Espada de Ouro e Armadura de Ouro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 50,
  },
  primordial_essence: {
    id: 'primordial_essence',
    name: 'Essência da Árvore-Coração',
    description:
      'Seiva ancestral muito rara extraída das Árvores-Coração Primordiais da planície com Machado de Ferro+.',
    purposeSummary:
      'Cria Essência da Vida (+20 HP Máx Permanente), Machado Primordial, Espada de Ouro e Totem de Defesa.',
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
      'Ferramenta Nv.1 (Corpo-a-corpo · Individual): 10 de dano, alcance de 33px e poder de coleta 10.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.AXE,
    toolTier: 1,
    attackDamage: 10,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 33,
    harvestPower: 10,
  },
  stone_pickaxe: {
    id: 'stone_pickaxe',
    name: 'Picareta de Pedra',
    description:
      'Quebra rochas comuns rapidamente e desbloqueia a mineração de Minério de Carvão, Minério de Ferro e Minério de Ouro.',
    purposeSummary:
      'Ferramenta Nv.1 (Corpo-a-corpo · Individual): 8 de dano, alcance de 33px e poder de coleta 10.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.PICKAXE,
    toolTier: 1,
    attackDamage: 8,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 33,
    harvestPower: 10,
  },
  wood_sword: {
    id: 'wood_sword',
    name: 'Espada de Sílex & Madeira',
    description:
      'Arma leve de defesa inicial com lâmina serrilhada de sílex (corpo-a-corpo, alvo individual, 44px de alcance).',
    purposeSummary:
      'Arma Nv.1 (Corpo-a-corpo · Individual): Causa 15 de dano base com alcance de 44px.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 1,
    attackDamage: 15,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 44,
    harvestPower: 8,
  },
  flint_spear: {
    id: 'flint_spear',
    name: 'Lança de Sílex Caçadora',
    description:
      'Lança longa feita com Sílex Afiado e Fibra. Possui alcance estendido (66px) para atingir inimigos mantendo distância segura.',
    purposeSummary:
      'Arma Tática Nv.1 (Corpo-a-corpo · Individual): Alcance longo (66px) e 13 de dano para combater à distância segura.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 1,
    attackDamage: 13,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
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
      'Ferramenta Nv.2 (Corpo-a-corpo · Individual): 15 de dano, alcance de 33px e poder de coleta 20.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.AXE,
    toolTier: 2,
    attackDamage: 15,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 33,
    harvestPower: 20,
  },
  iron_pickaxe: {
    id: 'iron_pickaxe',
    name: 'Picareta de Ferro Forjado',
    description:
      'Minera rochas e veios subterrâneos rapidamente e desbloqueia a extração de Ostras Abissais.',
    purposeSummary:
      'Ferramenta Nv.2 (Corpo-a-corpo · Individual): 12 de dano, alcance de 33px e poder de coleta 20.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.PICKAXE,
    toolTier: 2,
    attackDamage: 12,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 33,
    harvestPower: 20,
  },
  shears: {
    id: 'shears',
    name: 'Tesoura',
    description:
      'Ferramenta de lâminas articuladas. Use para tosquiar Ovelhas (domesticadas ou selvagens) obtendo de 1 a 2 Lãs, e garante 100% de chance de obter 1 Fibra ao quebrar grama!',
    purposeSummary:
      'Ferramenta de Tosquia & Poda: Interaja com Ovelha para tosquiar 1–2 Lãs e quebre grama com 100% de chance de 1 Fibra.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SHEARS,
    toolTier: 2,
    attackDamage: 8,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 34,
    harvestPower: 18,
  },
  iron_sword: {
    id: 'iron_sword',
    name: 'Espada Longa de Ferro',
    description:
      'Lâmina balanceada de alto impacto forjada com Ferro Forjado, Madeira Nobre e Ouro para enfrentar Zumbis e Ogros.',
    purposeSummary:
      'Arma Nv.2 (Corpo-a-corpo · Individual): Causa 25 de dano base com alcance de 55px.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 25,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 55,
    harvestPower: 12,
  },
  shadow_blade: {
    id: 'shadow_blade',
    name: 'Foice Sombria Vampírica',
    description:
      'Lâmina curva forjada com Essência Sombria de Zumbi. Desfere corte em área (55px) e recupera +6 de Vida por golpe acertado!',
    purposeSummary:
      'Arma Rara Nv.2 (Corpo-a-corpo · Em Área): Causa 30 de dano em todos os mobs na área apontada (55px) e recupera +6 HP por golpe.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 30,
    attackDelivery: 'melee',
    attackTargetScope: 'area',
    attackRange: 55,
    harvestPower: 15,
    lifesteal: 6,
  },
  ogre_club: {
    id: 'ogre_club',
    name: 'Clava Brutal de Ogro',
    description:
      'Arma colossal revestida com Couro Grosso de Ogro e Madeira Nobre. Causa 45 de dano em área (60px) com empurrão de 2,2×, porém possui velocidade de ataque -100%.',
    purposeSummary:
      'Arma Pesada Nv.2 (Corpo-a-corpo · Em Área): 45 de dano, alcance 60px, empurrão 2,2× e velocidade de ataque -100%.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 45,
    attackDelivery: 'melee',
    attackTargetScope: 'area',
    attackRange: 60,
    harvestPower: 28,
    knockbackMult: 2.2,
    attackSpeedMod: -1.0,
  },

  // === TOOLS & WEAPONS: TIER 3 (VERY RARE / ENDGAME V1) ===
  primordial_axe: {
    id: 'primordial_axe',
    name: 'Machado Primordial do Bosque',
    description:
      'Obra-prima imbuída com Essência da Árvore-Coração, Madeira Nobre e Ouro. Corta qualquer árvore rapidamente e serve como arma confiável.',
    purposeSummary:
      'Ferramenta Nv.3 (Corpo-a-corpo · Individual): 20 de dano, alcance de 33px e poder de coleta 30.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.AXE,
    toolTier: 3,
    attackDamage: 20,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 33,
    harvestPower: 30,
  },
  primordial_pickaxe: {
    id: 'primordial_pickaxe',
    name: 'Picareta de Ouro',
    description:
      'Picareta de alta resistência forjada com Ouro, Pérolas Abissais e Ferro Forjado. Escava rochas, veios profundos e Ostras Abissais com máxima eficiência.',
    purposeSummary:
      'Ferramenta Nv.3 (Corpo-a-corpo · Individual): 18 de dano, alcance de 33px e poder de coleta 30.',
    category: ItemCategory.TOOL,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.PICKAXE,
    toolTier: 3,
    attackDamage: 18,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 33,
    harvestPower: 30,
  },
  abyssal_trident: {
    id: 'abyssal_trident',
    name: 'Tridente Abissal dos Mares',
    description:
      'Relíquia oceânica forjada com Pérolas Abissais, Ferro Forjado e Madeira Nobre. Possui longo alcance (77px), recupera +4 HP por golpe e concede bônus de velocidade na costa.',
    purposeSummary:
      'Arma Nv.3 (Corpo-a-corpo · Individual): 40 de dano, alcance de 77px, recupera +4 HP por golpe e bônus de velocidade na costa.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 3,
    attackDamage: 40,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 77,
    harvestPower: 22,
    lifesteal: 4,
    coastalSpeedBonus: 0.22,
  },
  astral_sword: {
    id: 'astral_sword',
    name: 'Espada de Ouro',
    description:
      'Espada de elite forjada com Ouro, Pérola Abissal, Essência da Árvore-Coração e Ferro Forjado. Causa 45 de dano (alcance 66px) e recupera +8 HP por golpe.',
    purposeSummary:
      'Arma Suprema Nv.3 (Corpo-a-corpo · Individual): 45 de dano base, alcance de 66px e recupera +8 HP por golpe.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.VERY_RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 3,
    attackDamage: 45,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 66,
    harvestPower: 25,
    lifesteal: 8,
  },

  // === ARMORS & GARMENTS (4-SLOT SYSTEM: HEAD, BODY, LEGS, FEET) ===
  // --- VESTIMENTAS E ROUPAS DE CUSTOMIZAÇÃO (MESA DE TECELAGEM · -1% DANO) ---
  fiber_hat: {
    id: 'fiber_hat',
    name: 'Chapéu de Fibras',
    description:
      'Chapéu trançado artesanalmente com fibras vegetais secas. Leve e arejado para caminhadas no campo e no deserto. Não pode ser tingido.',
    purposeSummary:
      'Slot: Cabeça · Roupa de customização (-1% Dano sofrido · Cor natural fixa).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'fiber_hat',
    canBeDyed: false,
  },
  leather_hat: {
    id: 'leather_hat',
    name: 'Chapéu de Couro',
    description:
      'Chapéu de aba larga costurado com couro legítimo e fibras firmes. Elegante e personalizável na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Cabeça · Roupa de couro tingível (-1% Dano sofrido · Padrão: Marrom).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'leather_hat',
    garmentColorId: 'marrom',
    garmentColorHex: '#8b5a2b',
    canBeDyed: true,
  },
  solar_necklace: {
    id: 'solar_necklace',
    name: 'Colar Dourado',
    description:
      'Adorno elegante entrelaçado com fibras e Ouro que repousa sobre o colarinho. Não pode ser tingido.',
    purposeSummary:
      'Slot: Cabeça · Adorno dourado de customização (-1% Dano sofrido · Cor natural fixa).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.RARE,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'solar_necklace',
    canBeDyed: false,
  },
  white_tank_top: {
    id: 'white_tank_top',
    name: 'Regata',
    description:
      'Camisa regata leve sem mangas tecida na Mesa de Tecelagem. Veste inicial confortável que pode ser tingida em 17 cores.',
    purposeSummary:
      'Slot: Superior · Roupa de costura tingível (-1% Dano sofrido · Padrão: Branco).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'white_tank_top',
    garmentColorId: 'branco',
    garmentColorHex: '#f1f5f9',
    canBeDyed: true,
  },
  sweater: {
    id: 'sweater',
    name: 'Suéter',
    description:
      'Suéter de malha macia com mangas compridas que cobrem todo o braço. Confeccionado e tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Superior · Cobre todo o braço · Tingível (-1% Dano sofrido · Padrão: Branco).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'sweater',
    garmentColorId: 'branco',
    garmentColorHex: '#f1f5f9',
    canBeDyed: true,
  },
  short_dress: {
    id: 'short_dress',
    name: 'Vestido Curto',
    description:
      'Vestido leve sem mangas que se estende até a parte inferior. Não pode ser equipado junto com Macacão, e armaduras sempre sobrepõem seu visual.',
    purposeSummary:
      'Slot: Superior (Estende ao Inferior) · Sem mangas · Tingível (-1% Dano sofrido · Padrão: Branco).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'short_dress',
    garmentColorId: 'branco',
    garmentColorHex: '#f1f5f9',
    canBeDyed: true,
    extendsToLegs: true,
  },
  long_dress: {
    id: 'long_dress',
    name: 'Vestido Longo',
    description:
      'Vestido elegante sem mangas com saia fluida que se estende até os tornozelos. Não pode ser equipado junto com Macacão, e armaduras sempre sobrepõem seu visual.',
    purposeSummary:
      'Slot: Superior (Estende ao Inferior) · Sem mangas · Tingível (-1% Dano sofrido · Padrão: Branco).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'long_dress',
    garmentColorId: 'branco',
    garmentColorHex: '#f1f5f9',
    canBeDyed: true,
    extendsToLegs: true,
  },
  shorts: {
    id: 'shorts',
    name: 'Bermuda',
    description:
      'Bermuda confortável na altura dos joelhos confeccionada na Mesa de Tecelagem. Pode ser tingida em 17 cores.',
    purposeSummary:
      'Slot: Inferior · Roupa de costura tingível (-1% Dano sofrido · Padrão: Branco).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'legs',
    garmentBaseId: 'shorts',
    garmentColorId: 'branco',
    garmentColorHex: '#f1f5f9',
    canBeDyed: true,
  },
  brown_shorts: {
    id: 'brown_shorts',
    name: 'Bermuda (Marrom)',
    description:
      'Bermuda de linho rústico marrom na altura dos joelhos. Veste inicial leve que também pode ser tingida na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Inferior · Roupa de costura tingível (-1% Dano sofrido · Cor: Marrom).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'legs',
    garmentBaseId: 'shorts',
    garmentColorId: 'marrom',
    garmentColorHex: '#8b5a2b',
    canBeDyed: true,
  },
  pants: {
    id: 'pants',
    name: 'Calça',
    description:
      'Calça comprida de alfaiataria rústica que cobre toda a perna. Confeccionada e tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Inferior · Roupa de costura tingível (-1% Dano sofrido · Padrão: Branco).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'legs',
    garmentBaseId: 'pants',
    garmentColorId: 'branco',
    garmentColorHex: '#f1f5f9',
    canBeDyed: true,
  },
  overalls: {
    id: 'overalls',
    name: 'Macacão',
    description:
      'Macacão completo com suspensórios e peitilho que sobe até a parte superior, sobrepondo camisas/suéteres (mas nunca sobrepõe armaduras nem pode ser usado com vestidos).',
    purposeSummary:
      'Slot: Inferior (Estende ao Superior) · Tingível (-1% Dano sofrido · Padrão: Bege).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'legs',
    garmentBaseId: 'overalls',
    garmentColorId: 'bege',
    garmentColorHex: '#d6b88a',
    canBeDyed: true,
    extendsToBody: true,
  },
  sandals: {
    id: 'sandals',
    name: 'Sandália',
    description:
      'Sandália leve de tiras de couro curtido com solado confortável. Pode ser tingida na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Pés · Calçado de couro tingível (-1% Dano sofrido · Padrão: Marrom).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'feet',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'feet',
    garmentBaseId: 'sandals',
    garmentColorId: 'marrom',
    garmentColorHex: '#8b5a2b',
    canBeDyed: true,
  },
  cowboy_boots: {
    id: 'cowboy_boots',
    name: 'Bota de Vaqueiro',
    description:
      'Bota de cano médio em couro pespontado com salto firme de cavaleiro. Pode ser tingida na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Pés · Calçado de couro tingível (-1% Dano sofrido · Padrão: Marrom).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'feet',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'feet',
    garmentBaseId: 'cowboy_boots',
    garmentColorId: 'marrom',
    garmentColorHex: '#8b5a2b',
    canBeDyed: true,
  },
  // --- ROUPAS TRADICIONAIS DE OFÍCIO DOS ALDEÕES E ANDARILHOS (MESA DE TECELAGEM · -1% DANO) ---
  blacksmith_bandana: {
    id: 'blacksmith_bandana',
    name: 'Bandana de Forja',
    description:
      'Bandana reforçada de artesão amarrada na testa para conter o suor junto à fornalha. Traje tradicional dos Ferreiros das vilas, tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Cabeça · Roupa de Ferreiro tingível (-1% Dano sofrido · Padrão: Vermelho).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'blacksmith_bandana',
    garmentColorId: 'vermelho',
    garmentColorHex: '#dc2626',
    canBeDyed: true,
  },
  blacksmith_apron: {
    id: 'blacksmith_apron',
    name: 'Avental de Ferreiro',
    description:
      'Avental espesso de couro curtido sobre camisa de oficina, com alça peitoral e cinto porta-ferramentas. Veste oficial dos Ferreiros, confeccionável na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Superior · Roupa de Ferreiro tingível (-1% Dano sofrido · Padrão: Marrom).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'blacksmith_apron',
    garmentColorId: 'marrom',
    garmentColorHex: '#8b5a2b',
    canBeDyed: true,
  },
  blacksmith_boots: {
    id: 'blacksmith_boots',
    name: 'Botas de Forja',
    description:
      'Botas robustas de couro pesado com biqueira reforçada contra fagulhas e brasas. Calçado tradicional dos Ferreiros, confeccionável na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Pés · Calçado de Ferreiro tingível (-1% Dano sofrido · Padrão: Preto).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'feet',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'feet',
    garmentBaseId: 'blacksmith_boots',
    garmentColorId: 'preto',
    garmentColorHex: '#1e293b',
    canBeDyed: true,
  },
  merchant_cap: {
    id: 'merchant_cap',
    name: 'Boina de Mercador',
    description:
      'Boina de veludo nobre adornada com broche dourado e pluma lateral. Cobertura clássica dos Mercadores das vilas, tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Cabeça · Roupa de Mercador tingível (-1% Dano sofrido · Padrão: Roxo).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'merchant_cap',
    garmentColorId: 'roxo',
    garmentColorHex: '#7e22ce',
    canBeDyed: true,
  },
  merchant_doublet: {
    id: 'merchant_doublet',
    name: 'Gibão de Mercador',
    description:
      'Gibão de alfaiataria fina com lapelas bordadas a ouro, mangas bufantes e algibeira de moedas na cintura. Traje de gala dos Mercadores, tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Superior · Roupa de Mercador tingível (-1% Dano sofrido · Padrão: Vermelho).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'merchant_doublet',
    garmentColorId: 'vermelho',
    garmentColorHex: '#dc2626',
    canBeDyed: true,
  },
  merchant_slacks: {
    id: 'merchant_slacks',
    name: 'Calça de Alfaiataria',
    description:
      'Calça de corte nobre com barras debruadas em fio dourado, usada pelos Mercadores prósperos. Confeccionável e tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Inferior · Roupa de Mercador tingível (-1% Dano sofrido · Padrão: Preto).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'legs',
    garmentBaseId: 'merchant_slacks',
    garmentColorId: 'preto',
    garmentColorHex: '#1e293b',
    canBeDyed: true,
  },
  elder_mitre: {
    id: 'elder_mitre',
    name: 'Tiara do Ancião',
    description:
      'Diadema cerimonial tecido com fios dourados e insígnia central. Símbolo de sabedoria usado pelos Anciões das vilas, tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Cabeça · Roupa de Ancião tingível (-1% Dano sofrido · Padrão: Amarelo).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'elder_mitre',
    garmentColorId: 'amarelo',
    garmentColorHex: '#eab308',
    canBeDyed: true,
  },
  elder_robe: {
    id: 'elder_robe',
    name: 'Manto do Ancião',
    description:
      'Túnica cerimonial longa com estola dourada e mangas amplas que se estende até os tornozelos. Veste solene dos Anciões das vilas, tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Superior (Estende ao Inferior) · Roupa de Ancião tingível (-1% Dano sofrido · Padrão: Azul).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'elder_robe',
    garmentColorId: 'azul',
    garmentColorHex: '#2563eb',
    canBeDyed: true,
    extendsToLegs: true,
  },
  wanderer_hood: {
    id: 'wanderer_hood',
    name: 'Capuz de Andarilho',
    description:
      'Capuz de viagem com cachecol integrado para proteger contra ventos, areia e chuva nas estradas. Usado pelos Andarilhos Nômades e confeccionável na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Cabeça · Roupa de Andarilho tingível (-1% Dano sofrido · Padrão: Ciano).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'head',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'head',
    garmentBaseId: 'wanderer_hood',
    garmentColorId: 'ciano',
    garmentColorHex: '#0891b2',
    canBeDyed: true,
  },
  wanderer_poncho: {
    id: 'wanderer_poncho',
    name: 'Poncho de Andarilho',
    description:
      'Poncho de tecelagem dupla com fivela de bússola e bolsa tiracolo para longas jornadas. Traje característico dos Andarilhos Nômades, tingível na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Superior · Roupa de Andarilho tingível (-1% Dano sofrido · Padrão: Azul-Claro).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'body',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'body',
    garmentBaseId: 'wanderer_poncho',
    garmentColorId: 'azul_claro',
    garmentColorHex: '#38bdf8',
    canBeDyed: true,
  },
  wanderer_leggings: {
    id: 'wanderer_leggings',
    name: 'Perneiras de Caminhante',
    description:
      'Calças reforçadas com faixas de couro nos joelhos e canelas para enfrentar trilhas selvagens. Usadas pelos Andarilhos e confeccionáveis na Mesa de Tecelagem.',
    purposeSummary:
      'Slot: Inferior · Roupa de Andarilho tingível (-1% Dano sofrido · Padrão: Bege).',
    category: ItemCategory.ARMOR,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    equipSlot: 'legs',
    defenseBonus: 0.01,
    isClothing: true,
    clothingCategory: 'legs',
    garmentBaseId: 'wanderer_leggings',
    garmentColorId: 'bege',
    garmentColorHex: '#d6b88a',
    canBeDyed: true,
  },
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

  // --- CONJUNTO Nv.2: FERRO FORJADO & OGRO (BANCADA) ---
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

  // --- CONJUNTO Nv.3: ARMADURA DE OURO (BANCADA) ---
  astral_crown: {
    id: 'astral_crown',
    name: 'Capacete de Ouro',
    description:
      'Capacete reluzente forjado com Ouro e Pérola Abissal. Reduz o dano em 15%, concede +35 Vida Máxima e ilumina o portador.',
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
    name: 'Peitoral de Ouro',
    description:
      'Armadura pesada de elite forjada em Ouro, Pérola Abissal, Couro de Ogro e Essência Sombria. Reduz o dano em 26% e concede +50 Vida Máxima.',
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
    name: 'Calças de Ouro',
    description:
      'Proteção articulada para as pernas forjada com Ouro, Pérola Abissal e Couro de Ogro. Reduz o dano recebido em 16% e concede +25 Vida Máxima.',
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
    name: 'Botas de Ouro',
    description:
      'Botas reluzentes forjadas com Ouro, Essência Sombria e Lã Macia. Reduzem o dano em 13% e aumentam a Velocidade em +18%!',
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
      'Estação de carpintaria e forja com base arquitetônica adaptativa e rotação de eixo (H/V). Interaja para criar ferramentas, armas, armaduras, estruturas, relíquias e a Fornalha.',
    purposeSummary:
      'Estação de Criação (Hitbox Compacta 9px · Rotacionável): Desbloqueia toda a arquitetura, equipamentos e itens especiais.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 10,
    placeableType: PlaceableType.WORKBENCH,
  },
  campfire: {
    id: 'campfire',
    name: 'Fogueira de Acampamento',
    description:
      'Estação culinária de acampamento (Luz 200px · 100%). Interaja para abrir a Grelha da Fogueira: adicione lenha (Madeira ou Carvão) para assar alimentos, pães e produzir Carvão.',
    purposeSummary:
      'Estação Culinária (Sem Hitbox · Luz 200px 100%): Prepara comidas e ingredientes no fogo com Slot de Combustível.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 20,
    placeableType: PlaceableType.CAMPFIRE,
  },
  furnace: {
    id: 'furnace',
    name: 'Fornalha de Fundição',
    description:
      'Alto-forno metalúrgico de pedra e sílex (emite Luz 80px · 50% apenas quando em uso). Interaja para abastecer o combustível e fundir Minério de Ferro, Minério de Ouro, Areia em Vidro e queimar madeira em Carvão.',
    purposeSummary:
      'Estação de Fundição Nv.2 (Hitbox Compacta 10px · Luz 80px 50% em uso): Funde Minério de Ferro, Minério de Ouro, Vidro e produz Carvão.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.FURNACE,
  },
  explorer_tent: {
    id: 'explorer_tent',
    name: 'Tenda Real de Lã & Couro',
    description:
      'Pavilhão acolchoado rotacionável (H/V). Só é permitido dormir à noite: ao concluir o sono (5s), recupera 100% de Energia (Stamina), salva o Ponto de Renascimento e avança o tempo para 6h30!',
    purposeSummary:
      'Ponto de Descanso Noturno (Hitbox Compacta 11px): Dormir à noite recupera 100% Energia, salva renascimento e avança para 6h30.',
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
    name: 'Parede de Carvalho',
    description:
      'Parede estrutural de tábuas e vigas de Carvalho Dourado com ferragens de ardósia e ligações automáticas em 16 estados. Conecta-se perfeitamente a paredes, portas, janelas e cercas.',
    purposeSummary:
      'Parede de Carvalho (140 HP · Hitbox Sólida): Liga-se em 4 direções com paredes, portas e janelas.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_WALL,
  },
  dark_oak_wall: {
    id: 'dark_oak_wall',
    name: 'Parede de Carvalho Escuro',
    description:
      'Parede nobre entalhada em painéis verticais de Carvalho Escuro da Floresta Temperada com detalhes em bronze envelhecido e continuidade em 16 estados.',
    purposeSummary:
      'Parede de Carvalho Escuro (140 HP · Hitbox Sólida): Liga-se em 4 direções com design entalhado escuro.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.DARK_OAK_WALL,
  },
  pine_wall: {
    id: 'pine_wall',
    name: 'Parede de Pinheiro',
    description:
      'Parede de cabana boreal construída com toras horizontais claras de Pinheiro da Taiga e encaixes entalhados nos cantos em 16 estados.',
    purposeSummary:
      'Parede de Pinheiro (140 HP · Hitbox Sólida): Liga-se em 4 direções com estilo de cabana de toras claras.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.PINE_WALL,
  },
  palm_wall: {
    id: 'palm_wall',
    name: 'Parede de Coqueiro',
    description:
      'Parede tropical construída com troncos inteiros cilíndricos de Coqueiro enfileirados lado a lado e amarrados com cordas de fibra em continuidade de 16 estados.',
    purposeSummary:
      'Parede de Coqueiro (140 HP · Hitbox Sólida): Troncos inteiros de coqueiro enfileirados com conexão automática em 4 direções.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.PALM_WALL,
  },
  stone_wall: {
    id: 'stone_wall',
    name: 'Parede de Pedra',
    description:
      'Parede fortificada de pedra e ferro com adaptação de continuidade em 16 estados e pilares de canto. Pode substituir Paredes de Madeira diretamente no lugar!',
    purposeSummary:
      'Parede Contínua (260 HP · Hitbox Sólida): Conecta-se automaticamente a paredes, janelas e portões.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 99,
    placeableType: PlaceableType.STONE_WALL,
  },
  wood_floor: {
    id: 'wood_floor',
    name: 'Piso de Carvalho',
    description:
      'Piso de tábuas de Carvalho Dourado com adaptação de bordas contínuas e opção de rotação das tábuas. Permite construir paredes, portas, baús e estações por cima e concede +15% de Velocidade de Movimento (Sem Hitbox).',
    purposeSummary:
      'Piso de Carvalho (Sem Hitbox · +15% Velocidade): Une tábuas de carvalho sem costuras e aceita móveis/paredes sobre ele.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_FLOOR,
  },
  dark_oak_floor: {
    id: 'dark_oak_floor',
    name: 'Piso de Carvalho Escuro',
    description:
      'Assoalho nobre entalhado em tábuas escuras de Carvalho Escuro da Floresta Temperada com adaptação de bordas contínuas e rotação de tábuas. Concede +15% de Velocidade de Movimento (Sem Hitbox).',
    purposeSummary:
      'Piso de Carvalho Escuro (Sem Hitbox · +15% Velocidade): Assoalho nobre escuro que aceita paredes e móveis por cima.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.DARK_OAK_FLOOR,
  },
  pine_floor: {
    id: 'pine_floor',
    name: 'Piso de Pinheiro',
    description:
      'Piso claro de cabana alpina feito com tábuas de Pinheiro da Taiga, com bordas contínuas e opção de rotação. Concede +15% de Velocidade de Movimento (Sem Hitbox).',
    purposeSummary:
      'Piso de Pinheiro (Sem Hitbox · +15% Velocidade): Assoalho boreal claro que aceita estruturas por cima.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.PINE_FLOOR,
  },
  palm_floor: {
    id: 'palm_floor',
    name: 'Piso de Coqueiro',
    description:
      'Piso tropical formado por troncos inteiros cilíndricos de Coqueiro enfileirados lado a lado, com anéis naturais da casca e opção de rotação. Concede +15% de Velocidade de Movimento e aceita construções por cima (Sem Hitbox).',
    purposeSummary:
      'Piso de Coqueiro (Sem Hitbox · +15% Velocidade): Troncos inteiros de coqueiro enfileirados que aceitam paredes e móveis por cima.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.PALM_FLOOR,
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
    name: 'Plataforma Flutuante',
    description:
      'Plataforma estrutural de troncos cilíndricos enfileirados e amarrados juntos. Único piso que pode ser colocado sobre o mar e águas profundas, funcionando também como piso em terra firme e possibilitando construir paredes e estruturas sobre ela (Sem Hitbox).',
    purposeSummary:
      'Plataforma Flutuante (Sem Hitbox · +15% Velocidade): Troncos cilíndricos enfileirados que servem de piso na água ou em terra e permitem construir por cima.',
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
  guardian_totem: {
    id: 'guardian_totem',
    name: 'Totem de Defesa',
    description:
      'Torreta defensiva muito rara que se integra a muralhas e pátios: ilumina 300px (80% de força) e dispara raios automáticos (25 Dano) contra invasores!',
    purposeSummary:
      'Torreta de Defesa (Hitbox Compacta 9px · Luz 300px 80%): Dispara raios de 25 de dano contra monstros próximos.',
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
      'Requisito Exclusivo de Aldeão: Ingrediente obrigatório para confeccionar o Tratado da Paz Real na Bancada de Trabalho.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.RARE,
    maxStack: 20,
  },
  peace_treaty: {
    id: 'peace_treaty',
    name: 'Tratado da Paz Real',
    description:
      'Pergaminho diplomático de alta nobreza tecido com Seda Sombria, Lã, Moedas de Ouro, Ferro Forjado, Ouro e autenticado com um Selo de Cera Real comprado de um Aldeão. Segure-o na mão para conseguir falar com aldeões de uma vila hostil, ver a cobrança em moedas e pagar pelo perdão!',
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
      'Aguilhão cristalizado extraído do Escorpião Rei do Deserto. Perfura armaduras pesadas e concentra toxina letal.',
    purposeSummary:
      'Forja a letal Lâmina Imperial de Ferrão (30 ATQ + Dreno de Vida) ou pode ser vendido por alto valor nos Vilarejos.',
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
      'Cria Poço de Pedra da Vila, equipamentos rúnicos ou troca por relíquias com o Ancião da Vila.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.VERY_RARE,
    maxStack: 50,
  },
  scorpion_dagger: {
    id: 'scorpion_dagger',
    name: 'Lâmina Imperial de Ferrão',
    description:
      'Arma ágil forjada com Ferrão Imperial de Escorpião, Seda Sombria e Ferro. Causa 30 de dano (alcance 55px) e recupera +5 HP por golpe!',
    purposeSummary:
      'Arma Rara Nv.2 (Corpo-a-corpo · Individual): 30 de dano base, alcance de 55px e recupera +5 HP por golpe.',
    category: ItemCategory.WEAPON,
    rarity: RarityTier.RARE,
    maxStack: 1,
    toolType: ToolType.SWORD,
    toolTier: 2,
    attackDamage: 30,
    attackDelivery: 'melee',
    attackTargetScope: 'single',
    attackRange: 55,
    harvestPower: 18,
    lifesteal: 5,
  },
  village_well: {
    id: 'village_well',
    name: 'Poço de Pedra da Vila',
    description:
      'Fonte arquitetônica de alvenaria e madeira com água cristalina subterrânea. Interaja (1 vez por dia) para beber água fresca e restaurar +20 Vida, +20 Fome e +55 Energia! Se quebrado, é destruído e não pode ser coletado.',
    purposeSummary:
      'Estrutura Interativa (Hitbox Compacta 10px · 1 uso/dia): Restaura +20 HP, +20 Fome e +55 Energia ao beber. Destruído se quebrado.',
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
    name: 'Casinha de Fada',
    description:
      'Pequena casinha encantada decorativa com iluminação mágica intensa (alcance: 175px · força da luz: 100%). Puramente ornamental, não possui função ou efeito interativo.',
    purposeSummary:
      'Decoração Luminosa (240 HP · Luz 175px 100%): Ilumina os arredores com brilho feérico ornamental.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.VILLAGE_HOUSE,
  },
  royal_banner: {
    id: 'royal_banner',
    name: 'Estandarte da Fronteira',
    description:
      'Flâmula heráldica bordada com Seda Sombria e Ouro. Fixa-se automaticamente em muros/portões adjacentes sem bloquear passagem!',
    purposeSummary:
      'Insígnia Adaptativa (Sem Hitbox): Conecta-se a paredes/portões e decora salões sem obstruir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 20,
    placeableType: PlaceableType.ROYAL_BANNER,
  },

  // === NEW PROFESSIONAL ARCHITECTURAL & BUILDING SYSTEM ITEMS ===
  wood_door: {
    id: 'wood_door',
    name: 'Porta de Carvalho',
    description:
      'Porta clássica de tábuas de Carvalho Dourado com ferragens forjadas e maçaneta dourada. Alinha-se automaticamente entre paredes e abre/fecha ao interagir!',
    purposeSummary:
      'Porta de Carvalho (160 HP · Hitbox Dinâmica): Bloqueia monstros quando fechada e libera passagem quando aberta.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    placeableType: PlaceableType.WOOD_DOOR,
  },
  dark_oak_door: {
    id: 'dark_oak_door',
    name: 'Porta de Carvalho Escuro',
    description:
      'Porta senhorial de Carvalho Escuro maciço com almofadas entalhadas e puxador em anel de bronze antigo. Alinha-se automaticamente entre paredes e abre/fecha ao interagir!',
    purposeSummary:
      'Porta de Carvalho Escuro (160 HP · Hitbox Dinâmica): Design nobre escuro com controle de acesso.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    placeableType: PlaceableType.DARK_OAK_DOOR,
  },
  pine_door: {
    id: 'pine_door',
    name: 'Porta de Pinheiro',
    description:
      'Porta alpina de Pinheiro da Taiga com travamento diagonal em Z e ferrolho rústico de cobre. Alinha-se automaticamente entre paredes e abre/fecha ao interagir!',
    purposeSummary:
      'Porta de Pinheiro (160 HP · Hitbox Dinâmica): Estilo cabana boreal clara com abertura interativa.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    placeableType: PlaceableType.PINE_DOOR,
  },
  palm_door: {
    id: 'palm_door',
    name: 'Porta de Coqueiro',
    description:
      'Porta tropical confeccionada com troncos inteiros cilíndricos de Coqueiro enfileirados e amarrados com travessas de fibra. Alinha-se automaticamente entre paredes, forma porta dupla e abre/fecha ao interagir!',
    purposeSummary:
      'Porta de Coqueiro (160 HP · Hitbox Dinâmica): Troncos inteiros de coqueiro enfileirados com abertura interativa.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 30,
    placeableType: PlaceableType.PALM_DOOR,
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
      'Cerca modular com postes e travessas que se conectam automaticamente em 16 direções a outras cercas, porteiras, portões e muros. Ideal para currais de animais e jardins!',
    purposeSummary:
      'Cerca Conectável (110 HP · Hitbox de Contenção): Mantém animais seguros e conecta-se a porteiras e portões.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.WOOD_FENCE,
  },
  fence_gate: {
    id: 'fence_gate',
    name: 'Porteira de Madeira',
    description:
      'Porteira articulada complementar à cerca. Abre e fecha ao interagir (inclusive em par duplo), mas mesmo aberta mantém hitbox sólida para todos os animais e monstros, permitindo a passagem apenas de humanos (jogador, aldeões e viajantes)!',
    purposeSummary:
      'Porteira de Curral (115 HP · Abre/Fecha): Mesmo aberta, bloqueia animais e mobs; apenas humanos passam livremente.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 60,
    placeableType: PlaceableType.FENCE_GATE,
  },
  wood_window: {
    id: 'wood_window',
    name: 'Parede de Carvalho com Janela',
    description:
      'Parede de Carvalho Dourado com batente arqueado e janela de vidro translúcido que se conecta continuamente às paredes adjacentes.',
    purposeSummary:
      'Parede de Carvalho c/ Janela (145 HP · Hitbox Sólida): Liga-se a paredes e portas com vidro translúcido.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 60,
    placeableType: PlaceableType.WOOD_WINDOW,
  },
  dark_oak_window: {
    id: 'dark_oak_window',
    name: 'Parede de Carvalho Escuro com Janela',
    description:
      'Parede de Carvalho Escuro com caixilho cruzado em losango e vidro translúcido que se conecta continuamente às paredes adjacentes.',
    purposeSummary:
      'Parede de Carvalho Escuro c/ Janela (145 HP · Hitbox Sólida): Design nobre escuro com vitral cruzado.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 60,
    placeableType: PlaceableType.DARK_OAK_WINDOW,
  },
  pine_window: {
    id: 'pine_window',
    name: 'Parede de Pinheiro com Janela',
    description:
      'Parede de toras de Pinheiro da Taiga com janela de chalé alpino e venezianas laterais que se conecta continuamente às paredes adjacentes.',
    purposeSummary:
      'Parede de Pinheiro c/ Janela (145 HP · Hitbox Sólida): Estilo chalé boreal claro com vidro translúcido.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 60,
    placeableType: PlaceableType.PINE_WINDOW,
  },
  palm_window: {
    id: 'palm_window',
    name: 'Parede de Coqueiro com Janela',
    description:
      'Parede de troncos inteiros cilíndricos de Coqueiro enfileirados com moldura tropical amarrada e janela de vidro translúcido que se conecta continuamente às paredes adjacentes.',
    purposeSummary:
      'Parede de Coqueiro c/ Janela (145 HP · Hitbox Sólida): Troncos de coqueiro enfileirados com vidro translúcido.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 60,
    placeableType: PlaceableType.PALM_WINDOW,
  },
  stone_window: {
    id: 'stone_window',
    name: 'Parede de Pedra com Janela',
    description:
      'Parede de pedra fortificada com janela de vidro translúcido (33% de transparência). Conecta-se continuamente a paredes e portões.',
    purposeSummary:
      'Parede com Janela (260 HP · Hitbox Sólida): Alta proteção com janela translúcida e conexão 4-lados.',
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
    name: 'Parede de Tijolo',
    description:
      'Parede soberana de tijolos maciços, pedra e ferro forjado com ameias e pilares de canto automáticos (320 HP).',
    purposeSummary:
      'Parede Suprema (320 HP · Hitbox Sólida): Máxima resistência estrutural com continuidade de 16 estados.',
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
      'Luminária suspensa de ferro forjado e carvão que ilumina uma ampla área (200px · 100% de força) sem possuir hitbox física, permitindo caminhar livremente!',
    purposeSummary:
      'Luminária Real (Sem Hitbox · Luz 200px 100%): Iluminação intensa para ruas, pontes e salões sem obstruir.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 50,
    placeableType: PlaceableType.IRON_LANTERN,
  },

  // === NOVOS ALIMENTOS DE CAÇA (CORDEIRO & CARNE SUÍNA) E MUDAS DE REFLORESTAMENTO ===
  raw_lamb: {
    id: 'raw_lamb',
    name: 'Carne de Cordeiro Crua',
    description:
      'Corte macio de carne obtido de ovelhas. Pode ser consumido cru em emergências ou assado na Fogueira ou Fornalha.',
    purposeSummary:
      'Alimento Cru (+14 Fome, +5 HP, +10 Energia): Asse na Fogueira ou Fornalha para preparar Carne de Cordeiro Assada!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hpRestore: 5,
    hungerRestore: 14,
    staminaRestore: 10,
  },
  cooked_lamb: {
    id: 'cooked_lamb',
    name: 'Carne de Cordeiro Assada',
    description:
      'Costeleta de cordeiro suculenta assada lentamente na brasa. Excelente fonte de energia e vitalidade.',
    purposeSummary:
      'Refeição Assada (+42 Fome, +26 HP, +30 Energia): Sustento nutritivo preparado na Fogueira ou Fornalha.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hpRestore: 26,
    hungerRestore: 42,
    staminaRestore: 30,
  },
  raw_pork: {
    id: 'raw_pork',
    name: 'Carne Suína Crua',
    description:
      'Corte robusto de carne obtido de javalis selvagens. Pode ser assado na Fogueira ou Fornalha para liberar todo seu sabor.',
    purposeSummary:
      'Alimento Cru (+16 Fome, +6 HP, +12 Energia): Asse na Fogueira ou Fornalha para preparar Carne Suína Assada!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hpRestore: 6,
    hungerRestore: 16,
    staminaRestore: 12,
  },
  cooked_pork: {
    id: 'cooked_pork',
    name: 'Carne Suína Assada',
    description:
      'Lombo suíno dourado na brasa, muito nutritivo para longas expedições e combates.',
    purposeSummary:
      'Refeição Assada (+48 Fome, +30 HP, +35 Energia): Sustento vigoroso preparado na Fogueira ou Fornalha.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hpRestore: 30,
    hungerRestore: 48,
    staminaRestore: 35,
  },
  raw_beef: {
    id: 'raw_beef',
    name: 'Carne Bovina Crua',
    description:
      'Corte nobre e suculento de carne bovina obtido de vacas da planície. Pode ser assado na Fogueira ou Fornalha para uma refeição altamente nutritiva.',
    purposeSummary:
      'Alimento Cru (+18 Fome, +7 HP, +14 Energia): Asse na Fogueira ou Fornalha para preparar Carne Bovina Assada!',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hpRestore: 7,
    hungerRestore: 18,
    staminaRestore: 14,
  },
  cooked_beef: {
    id: 'cooked_beef',
    name: 'Carne Bovina Assada',
    description:
      'Bife bovino grelhado no ponto ideal na brasa, suculento e revigorante para grandes jornadas.',
    purposeSummary:
      'Refeição Assada (+54 Fome, +34 HP, +38 Energia): Sustento robusto preparado na Fogueira ou Fornalha.',
    category: ItemCategory.CONSUMABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    hpRestore: 34,
    hungerRestore: 54,
    staminaRestore: 38,
  },
  oak_sapling: {
    id: 'oak_sapling',
    name: 'Muda de Carvalho',
    description:
      'Brote vivo de Árvore de Carvalho. Plante no solo: possui 3 estágios (Muda → Carvalho Pequeno → Árvore de Carvalho em 3 min, sem hitbox enquanto cresce e aceita Adubo Orgânico). Se quebrada antes de adulta, devolve apenas a muda.',
    purposeSummary:
      'Reflorestamento (Sem Hitbox · 3 min p/ Crescer · Aceita Adubo): Cresce em 3 estágios até virar uma Árvore de Carvalho adulta.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    placeableType: PlaceableType.OAK_SAPLING,
  },
  dark_oak_sapling: {
    id: 'dark_oak_sapling',
    name: 'Muda de Carvalho Escuro',
    description:
      'Brote frondoso de Carvalho Escuro da Floresta Temperada. Plante no solo: possui 3 estágios (Muda → Carvalho Escuro Jovem → Carvalho Escuro Adulto em 3 min, sem hitbox enquanto cresce e aceita Adubo Orgânico). Se quebrada antes de adulta, devolve apenas a muda.',
    purposeSummary:
      'Reflorestamento (Sem Hitbox · 3 min p/ Crescer · Aceita Adubo): Cresce em 3 estágios até virar um Carvalho Escuro adulto.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    placeableType: PlaceableType.DARK_OAK_SAPLING,
  },
  pine_sapling: {
    id: 'pine_sapling',
    name: 'Muda de Pinheiro',
    description:
      'Brote conífero de Pinheiro da Taiga. Plante no solo: possui 3 estágios (Muda → Pinheiro Jovem → Pinheiro Adulto em 3 min, sem hitbox enquanto cresce e aceita Adubo Orgânico). Se quebrada antes de adulta, devolve apenas a muda.',
    purposeSummary:
      'Reflorestamento (Sem Hitbox · 3 min p/ Crescer · Aceita Adubo): Cresce em 3 estágios até virar um Pinheiro adulto.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    placeableType: PlaceableType.PINE_SAPLING,
  },
  palm_sapling: {
    id: 'palm_sapling',
    name: 'Muda de Coqueiro',
    description:
      'Brote tropical de Coqueiro. Plante no solo: possui 3 estágios (Muda → Coqueiro Jovem → Coqueiro Adulto em 5 min, sem hitbox enquanto cresce e aceita Adubo Orgânico). Ao crescer, fornece Madeira de Coqueiro, Cocos e novas mudas.',
    purposeSummary:
      'Reflorestamento (Sem Hitbox · 5 min p/ Crescer · Aceita Adubo): Cresce em 3 estágios até virar um Coqueiro adulto.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 50,
    placeableType: PlaceableType.PALM_SAPLING,
  },
  bed: {
    id: 'bed',
    name: 'Cama de Madeira',
    description:
      'Cama aconchegante de carvalho com travesseiro de lã e coberta macia. Só é permitido dormir à noite: ao concluir o sono (5s), recupera 100% da Energia, salva o Ponto de Renascimento e avança o tempo para 6h30, além de definir o Dono de uma Estrutura fechada com telhado!',
    purposeSummary:
      'Ponto de Descanso & Dono de Estrutura (Rotacionável H/V · 110 HP): Dormir à noite recupera 100% de Energia, salva renascimento e avança para 6h30.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 10,
    placeableType: PlaceableType.BED,
  },
  weaving_table: {
    id: 'weaving_table',
    name: 'Mesa de Tecelagem',
    description:
      'Estação de alfaiataria, costura e tinturaria construída com 6 Barras de Ferro, 4 Madeiras e 10 Lãs. Possui a janela de Confecção (Cabeça, Superior, Inferior e Pés) e a janela de Tingimento em 17 cores.',
    purposeSummary:
      'Estação de Roupas (Hitbox Compacta 10px · Interativa): Confecciona vestimentas e tinge peças de costura e couro.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.WEAVING_TABLE,
  },

  // === FLORES SELVAGENS COLETÁVEIS E COLOCÁVEIS (SEM HITBOX · AGRUPADAS POR ESPÉCIE NO INVENTÁRIO) ===
  flower_tulip: {
    id: 'flower_tulip',
    name: 'Tulipa',
    description:
      'Flor de cálice clássico encontrada em canteiros naturais. Coletável e colocável no chão (sem hitbox). Agrupa todas as cores de Tulipa no mesmo slot; clique no slot para escolher a cor!',
    purposeSummary:
      'Flor Ornamental & Tinturaria (Cores: Branco, Vermelho, Laranja, Amarelo, Azul, Roxo, Magenta, Rosa): Usada para criar corantes na Bancada de Trabalho ou decorar o chão.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.FLOWER_TULIP,
    isFlower: true,
    flowerSpecies: 'tulip',
    allowedFlowerColors: [
      'branco',
      'vermelho',
      'laranja',
      'amarelo',
      'azul',
      'roxo',
      'magenta',
      'rosa',
    ],
  },
  flower_lily: {
    id: 'flower_lily',
    name: 'Lírio-do-Vale',
    description:
      'Flor delicada de sinos pendentes encontrada em manchas naturais pelo mundo. Coletável e colocável no chão (sem hitbox). Agrupa todas as cores de Lírio-do-Vale no mesmo slot; clique no slot para escolher a cor!',
    purposeSummary:
      'Flor Ornamental & Tinturaria (Cores: Branco, Vermelho, Laranja, Amarelo, Roxo, Rosa): Usada para criar corantes na Bancada de Trabalho ou decorar o chão.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.FLOWER_LILY,
    isFlower: true,
    flowerSpecies: 'lily',
    allowedFlowerColors: [
      'branco',
      'vermelho',
      'laranja',
      'amarelo',
      'roxo',
      'rosa',
    ],
  },
  flower_sunflower: {
    id: 'flower_sunflower',
    name: 'Girassol',
    description:
      'Flor radiante de coroa dourada e centro escuro (cor única: Amarelo). Coletável e colocável no chão sem hitbox.',
    purposeSummary:
      'Flor Ornamental & Tinturaria (Cor única: Amarelo): Usada para criar Corante Amarelo na Bancada de Trabalho ou decorar jardins.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.BASIC,
    maxStack: 99,
    placeableType: PlaceableType.FLOWER_SUNFLOWER,
    isFlower: true,
    flowerSpecies: 'sunflower',
    allowedFlowerColors: ['amarelo'],
  },
  flower_solar_drop: {
    id: 'flower_solar_drop',
    name: 'Flor Gota Solar',
    description:
      'Flor rara bioluminescente em formato de gota dourada que nasce em qualquer bioma (5% de chance). Emite luz suave (66% de força num raio de 60px) e não possui hitbox!',
    purposeSummary:
      'Flor Luminosa Rara (Sem Hitbox · Luz 66% em 60px de raio): Ilumina caminhos e jardins naturalmente quando plantada no chão.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 99,
    placeableType: PlaceableType.FLOWER_SOLAR_DROP,
    isFlower: true,
    flowerSpecies: 'solar_drop',
    allowedFlowerColors: ['amarelo'],
  },

  // === CORANTES (MATERIAIS NÃO AGRUPÁVEIS CRIADOS NA BANCADA DE TRABALHO) ===
  dye_preto: {
    id: 'dye_preto',
    name: 'Corante Preto',
    description:
      'Pigmento escuro concentrado extraído da tinta de Lula na Bancada de Trabalho. Material não agrupável usado na Mesa de Tecelagem.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Preto (ou misturar outros corantes).',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'preto',
  },
  dye_cinza: {
    id: 'dye_cinza',
    name: 'Corante Cinza',
    description:
      'Pigmento neutro obtido na Bancada de Trabalho combinando Corante Preto + Corante Branco. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Cinza.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'cinza',
  },
  dye_cinza_claro: {
    id: 'dye_cinza_claro',
    name: 'Corante Cinza-Claro',
    description:
      'Pigmento prateado suave obtido na Bancada de Trabalho combinando Corante Cinza + Corante Branco. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Cinza-Claro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'cinza_claro',
  },
  dye_branco: {
    id: 'dye_branco',
    name: 'Corante Branco',
    description:
      'Pigmento alvo extraído na Bancada de Trabalho a partir de Tulipa Branca ou Lírio-do-Vale Branco. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Branco (ou clarear outros corantes).',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'branco',
  },
  dye_vermelho: {
    id: 'dye_vermelho',
    name: 'Corante Vermelho',
    description:
      'Pigmento carmesim extraído na Bancada de Trabalho a partir de Tulipa Vermelha ou Lírio-do-Vale Vermelho. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Vermelho.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'vermelho',
  },
  dye_laranja: {
    id: 'dye_laranja',
    name: 'Corante Laranja',
    description:
      'Pigmento cítrico extraído na Bancada de Trabalho a partir de Tulipa Laranja ou Lírio-do-Vale Laranja. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Laranja.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'laranja',
  },
  dye_amarelo: {
    id: 'dye_amarelo',
    name: 'Corante Amarelo',
    description:
      'Pigmento solar extraído na Bancada de Trabalho a partir de Girassol, Tulipa Amarela ou Lírio-do-Vale Amarelo. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Amarelo.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'amarelo',
  },
  dye_verde_lima: {
    id: 'dye_verde_lima',
    name: 'Corante Verde-Lima',
    description:
      'Pigmento cítrico vibrante obtido na Bancada de Trabalho combinando Corante Verde + Corante Branco. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Verde-Lima.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'verde_lima',
  },
  dye_verde: {
    id: 'dye_verde',
    name: 'Corante Verde',
    description:
      'Pigmento botânico extraído de Fibras vegetais na Bancada de Trabalho. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Verde.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'verde',
  },
  dye_ciano: {
    id: 'dye_ciano',
    name: 'Corante Ciano',
    description:
      'Pigmento turquesa obtido na Bancada de Trabalho combinando Corante Verde + Corante Azul. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Ciano.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'ciano',
  },
  dye_azul_claro: {
    id: 'dye_azul_claro',
    name: 'Corante Azul-Claro',
    description:
      'Pigmento celeste obtido na Bancada de Trabalho combinando Corante Azul + Corante Branco. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Azul-Claro.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'azul_claro',
  },
  dye_azul: {
    id: 'dye_azul',
    name: 'Corante Azul',
    description:
      'Pigmento safira extraído na Bancada de Trabalho a partir de Tulipa Azul. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Azul.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'azul',
  },
  dye_roxo: {
    id: 'dye_roxo',
    name: 'Corante Roxo',
    description:
      'Pigmento ametista extraído na Bancada de Trabalho a partir de Tulipa Roxa ou Lírio-do-Vale Roxo. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Roxo.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'roxo',
  },
  dye_magenta: {
    id: 'dye_magenta',
    name: 'Corante Magenta',
    description:
      'Pigmento púrpura intenso extraído na Bancada de Trabalho a partir de Tulipa Magenta. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Magenta.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'magenta',
  },
  dye_rosa: {
    id: 'dye_rosa',
    name: 'Corante Rosa',
    description:
      'Pigmento rosado extraído na Bancada de Trabalho a partir de Lírio-do-Vale Rosa ou Tulipa Rosa. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Rosa.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'rosa',
  },
  dye_marrom: {
    id: 'dye_marrom',
    name: 'Corante Marrom',
    description:
      'Pigmento terroso obtido na Bancada de Trabalho combinando Corante Laranja + Corante Preto. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Marrom.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'marrom',
  },
  dye_bege: {
    id: 'dye_bege',
    name: 'Corante Bege',
    description:
      'Pigmento areia suave obtido na Bancada de Trabalho combinando Corante Marrom + Corante Branco. Material não agrupável.',
    purposeSummary:
      'Corante de Alfaiataria (Não Agrupável): Exigido na Mesa de Tecelagem para confeccionar ou tingir roupas na cor Bege.',
    category: ItemCategory.RESOURCE,
    rarity: RarityTier.BASIC,
    maxStack: 1,
    isDye: true,
    dyeColorId: 'bege',
  },
  drilling_stake: {
    id: 'drilling_stake',
    name: 'Estaca de Perfuração',
    description:
      'Estrutura pesada de ferro, pedra e madeira projetada para abrir passagem até o subsolo. Quebre-a com a mão livre ou qualquer ferramenta (exceto picareta) para coletá-la de volta, ou quebre-a com uma Picareta para perfurar o chão e criar uma Escada de Nível permanente para o subsolo!',
    purposeSummary:
      'Perfuração do Subsolo (Hitbox Sólida): Quebre com Picareta para criar uma Escada de Nível indestrutível para o subsolo; quebre com outro item/mão para recolher.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 10,
    placeableType: PlaceableType.DRILLING_STAKE,
  },
  level_stairs: {
    id: 'level_stairs',
    name: 'Escada de Nível',
    description:
      'Passagem vertical indestrutível que conecta a superfície ao subsolo na mesma coordenada.',
    purposeSummary:
      'Acesso Subterrâneo Indestrutível: Permite descer para o subsolo ou subir de volta para a superfície.',
    category: ItemCategory.PLACEABLE,
    rarity: RarityTier.RARE,
    maxStack: 1,
    placeableType: PlaceableType.LEVEL_STAIRS,
  },
};

export function getDyeItemIdForColor(colorId: ClothingColorId): string {
  return `dye_${colorId}`;
}

export function getFlowerColorLabel(colorId?: ClothingColorId): string {
  if (!colorId) return 'Amarelo';
  const found = CLOTHING_COLORS.find((c) => c.id === colorId);
  return found ? found.label : colorId;
}

export function getFlowerColorHex(colorId?: ClothingColorId): string {
  if (!colorId) return '#eab308';
  const found = CLOTHING_COLORS.find((c) => c.id === colorId);
  return found ? found.hex : '#eab308';
}

export const DYEABLE_GARMENT_BASE_IDS = [
  'leather_hat',
  'white_tank_top',
  'sweater',
  'short_dress',
  'long_dress',
  'shorts',
  'pants',
  'overalls',
  'sandals',
  'cowboy_boots',
  'blacksmith_bandana',
  'blacksmith_apron',
  'blacksmith_boots',
  'merchant_cap',
  'merchant_doublet',
  'merchant_slacks',
  'elder_mitre',
  'elder_robe',
  'wanderer_hood',
  'wanderer_poncho',
  'wanderer_leggings',
] as const;

export function getDyedGarmentItemId(
  itemOrBaseId: string,
  colorId: ClothingColorId
): string {
  const existing = ITEMS[itemOrBaseId];
  const baseId = existing?.garmentBaseId || itemOrBaseId;
  const baseDef = ITEMS[baseId];
  if (!baseDef || !baseDef.canBeDyed) return itemOrBaseId;
  if (baseId === 'shorts' && colorId === 'marrom') {
    return 'brown_shorts';
  }
  if (baseDef.garmentColorId === colorId) {
    return baseId;
  }
  return `${baseId}__${colorId}`;
}

// Auto-generate all 17 color variants for dyeable garments in ITEMS
for (const baseId of DYEABLE_GARMENT_BASE_IDS) {
  const baseDef = ITEMS[baseId];
  if (!baseDef) continue;
  const baseDisplayName = baseDef.name.replace(/\s*\([^)]+\)\s*$/, '');
  for (const colorDef of CLOTHING_COLORS) {
    const variantId = getDyedGarmentItemId(baseId, colorDef.id);
    if (ITEMS[variantId]) {
      // Ensure default/canonical entry also has color label clarity when needed
      ITEMS[variantId].garmentBaseId = baseId;
      ITEMS[variantId].garmentColorId = colorDef.id;
      ITEMS[variantId].garmentColorHex = colorDef.hex;
      continue;
    }
    ITEMS[variantId] = {
      ...baseDef,
      id: variantId,
      name: `${baseDisplayName} (${colorDef.label})`,
      garmentBaseId: baseId,
      garmentColorId: colorDef.id,
      garmentColorHex: colorDef.hex,
      canBeDyed: true,
      isClothing: true,
    };
  }
}

export const CONSTRUCTION_BLUEPRINTS: Record<PlaceableType, ConstructionBlueprint> = {
  // === LAYER 1: GROUND (CHÃO, PISOS, TAPETES E PONTES — SEM HITBOX) ===
  [PlaceableType.WOOD_FLOOR]: {
    type: PlaceableType.WOOD_FLOOR,
    role: 'CHAO',
    roleLabel: 'Piso de Carvalho',
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
  [PlaceableType.DARK_OAK_FLOOR]: {
    type: PlaceableType.DARK_OAK_FLOOR,
    role: 'CHAO',
    roleLabel: 'Piso de Carvalho Escuro',
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
  [PlaceableType.PINE_FLOOR]: {
    type: PlaceableType.PINE_FLOOR,
    role: 'CHAO',
    roleLabel: 'Piso de Pinheiro',
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
  [PlaceableType.PALM_FLOOR]: {
    type: PlaceableType.PALM_FLOOR,
    role: 'CHAO',
    roleLabel: 'Piso de Coqueiro',
    layer: 'GROUND',
    layerLabel: 'Camada de Chão (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Troncos Cilíndricos de Coqueiro Enfileirados',
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
    roleLabel: 'Plataforma Flutuante',
    layer: 'GROUND',
    layerLabel: 'Plataforma / Piso (Água ou Terra · Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Piso Flutuante sobre Água ou Terra)',
    continuityMode: 'BRIDGE_AUTO',
    continuityLabel: 'Troncos Cilíndricos Enfileirados & Conectáveis',
    connectionGroup: 'bridge',
    connectsToGroups: ['bridge', 'wood_floor', 'stone_floor', 'brick_floor', 'dirt_path'],
    maxHp: 110,
    lightRadius: 0,
    speedMultiplier: 1.15,
  },

  // === LAYER 2: WALLS, WINDOWS, DOORS, GATES & FENCES ===
  [PlaceableType.WOOD_WALL]: {
    type: PlaceableType.WOOD_WALL,
    role: 'PAREDE',
    roleLabel: 'Parede de Carvalho',
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
  [PlaceableType.DARK_OAK_WALL]: {
    type: PlaceableType.DARK_OAK_WALL,
    role: 'PAREDE',
    roleLabel: 'Parede de Carvalho Escuro',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Bloqueio Total)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados (Painéis de Carvalho Escuro)',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 140,
    lightRadius: 0,
  },
  [PlaceableType.PINE_WALL]: {
    type: PlaceableType.PINE_WALL,
    role: 'PAREDE',
    roleLabel: 'Parede de Pinheiro',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Bloqueio Total)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados (Toras de Pinheiro)',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 140,
    lightRadius: 0,
  },
  [PlaceableType.PALM_WALL]: {
    type: PlaceableType.PALM_WALL,
    role: 'PAREDE',
    roleLabel: 'Parede de Coqueiro',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Bloqueio Total)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados (Troncos Inteiros de Coqueiro)',
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
    roleLabel: 'Parede de Carvalho com Janela',
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
    lightRadius: 0,
  },
  [PlaceableType.DARK_OAK_WINDOW]: {
    type: PlaceableType.DARK_OAK_WINDOW,
    role: 'JANELA',
    roleLabel: 'Parede de Carvalho Escuro com Janela',
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
    lightRadius: 0,
  },
  [PlaceableType.PINE_WINDOW]: {
    type: PlaceableType.PINE_WINDOW,
    role: 'JANELA',
    roleLabel: 'Parede de Pinheiro com Janela',
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
    lightRadius: 0,
  },
  [PlaceableType.PALM_WINDOW]: {
    type: PlaceableType.PALM_WINDOW,
    role: 'JANELA',
    roleLabel: 'Parede de Coqueiro com Janela',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Passagem de Luz)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados (Troncos de Coqueiro c/ Janela)',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 145,
    lightRadius: 0,
  },
  [PlaceableType.STONE_WINDOW]: {
    type: PlaceableType.STONE_WINDOW,
    role: 'JANELA',
    roleLabel: 'Muralha com Vitral',
    layer: 'WALL',
    layerLabel: 'Camada de Parede (Sobre Chão/Terra)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_FULL',
    hitboxLabel: 'Hitbox Sólida (Vitral Gótico)',
    continuityMode: 'WALL_16',
    continuityLabel: 'Continuidade 16-Estados Integrada a Muralhas',
    connectionGroup: 'wall',
    connectsToGroups: ['wall', 'fence'],
    maxHp: 260,
    lightRadius: 0,
  },
  [PlaceableType.WOOD_DOOR]: {
    type: PlaceableType.WOOD_DOOR,
    role: 'PORTA',
    roleLabel: 'Porta de Carvalho',
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
  [PlaceableType.DARK_OAK_DOOR]: {
    type: PlaceableType.DARK_OAK_DOOR,
    role: 'PORTA',
    roleLabel: 'Porta de Carvalho Escuro',
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
  [PlaceableType.PINE_DOOR]: {
    type: PlaceableType.PINE_DOOR,
    role: 'PORTA',
    roleLabel: 'Porta de Pinheiro',
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
  [PlaceableType.PALM_DOOR]: {
    type: PlaceableType.PALM_DOOR,
    role: 'PORTA',
    roleLabel: 'Porta de Coqueiro',
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
  [PlaceableType.FENCE_GATE]: {
    type: PlaceableType.FENCE_GATE,
    role: 'PORTA',
    roleLabel: 'Porteira de Curral',
    layer: 'WALL',
    layerLabel: 'Camada de Contorno / Acesso de Cerca',
    hasHitbox: true,
    hitboxBehavior: 'DYNAMIC_DOOR',
    hitboxLabel: 'Hitbox Seletiva (Aberta: Livre p/ Humanos, Bloqueia Animais e Mobs)',
    continuityMode: 'DOOR_AUTO',
    continuityLabel: 'Encaixe em Cercas/Muros & Porteira Dupla Automática',
    connectionGroup: 'fence',
    connectsToGroups: ['fence', 'wall'],
    maxHp: 115,
    lightRadius: 0,
    isInteractive: true,
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
    lightRadius: 200,
  },
  [PlaceableType.ROYAL_BANNER]: {
    type: PlaceableType.ROYAL_BANNER,
    role: 'MOBILIA',
    roleLabel: 'Insígnia Real',
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
    lightRadius: 0,
  },
  [PlaceableType.CAMPFIRE]: {
    type: PlaceableType.CAMPFIRE,
    role: 'ILUMINACAO',
    roleLabel: 'Culinária & Iluminação',
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
    lightRadius: 200,
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
    lightRadius: 80,
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
    layerLabel: 'Camada de Abrigo (Ponto de Descanso Noturno)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (11px)',
    hitboxRadius: 11,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Pavilhão Rotacionável H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wood_floor', 'stone_floor'],
    maxHp: 140,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.GUARDIAN_TOTEM]: {
    type: PlaceableType.GUARDIAN_TOTEM,
    role: 'DEFESA',
    roleLabel: 'Torreta Defensiva Automática',
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
    lightRadius: 300,
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
    role: 'ILUMINACAO',
    roleLabel: 'Casinha de Fada (Decorativa)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Decorativa (Luz 175px 100%)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (12px)',
    hitboxRadius: 12,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Casinha de Fada Rotacionável H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'stone_floor', 'brick_floor'],
    maxHp: 240,
    lightRadius: 175,
    isInteractive: false,
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
    continuityLabel: 'Bordas Progressivas & União Adaptativa de Terra Arada',
    connectionGroup: 'tilled_soil',
    connectsToGroups: ['tilled_soil'],
    maxHp: 40,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.DIRT_PATH]: {
    type: PlaceableType.DIRT_PATH,
    role: 'CHAO',
    roleLabel: 'Caminho de Solo Batido',
    layer: 'GROUND',
    layerLabel: 'Camada de Chão / Estrada (Aceita Estruturas Acima)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'FLOOR_BORDER',
    continuityLabel: 'Bordas Progressivas Adaptativas & União Entre Biomas',
    connectionGroup: 'dirt_path',
    connectsToGroups: ['dirt_path', 'wood_floor', 'stone_floor', 'brick_floor', 'bridge'],
    maxHp: 40,
    lightRadius: 0,
    speedMultiplier: 1.18,
    isInteractive: false,
  },
  [PlaceableType.OAK_SAPLING]: {
    type: PlaceableType.OAK_SAPLING,
    role: 'MOBILIA',
    roleLabel: 'Muda de Carvalho (3 Estágios · 3 min)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Não Pode Ser Sobreposta)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem até Fase Adulta)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Muda → Carvalho Pequeno → Árvore de Carvalho',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 30,
    lightRadius: 0,
  },
  [PlaceableType.DARK_OAK_SAPLING]: {
    type: PlaceableType.DARK_OAK_SAPLING,
    role: 'MOBILIA',
    roleLabel: 'Muda de Carvalho Escuro (3 Estágios · 3 min)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Não Pode Ser Sobreposta)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem até Fase Adulta)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Muda → Carvalho Escuro Jovem → Carvalho Escuro',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 30,
    lightRadius: 0,
  },
  [PlaceableType.PINE_SAPLING]: {
    type: PlaceableType.PINE_SAPLING,
    role: 'MOBILIA',
    roleLabel: 'Muda de Pinheiro (3 Estágios · 3 min)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Não Pode Ser Sobreposta)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem até Fase Adulta)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Muda → Pinheiro Jovem → Pinheiro Adulto',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 30,
    lightRadius: 0,
  },
  [PlaceableType.PALM_SAPLING]: {
    type: PlaceableType.PALM_SAPLING,
    role: 'MOBILIA',
    roleLabel: 'Muda de Palmeira (3 Estágios · 5 min)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Não Pode Ser Sobreposta)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem até Fase Adulta)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Muda → Palmeira Pequena → Palmeira Adulta',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 30,
    lightRadius: 0,
  },
  [PlaceableType.BED]: {
    type: PlaceableType.BED,
    role: 'MOBILIA',
    roleLabel: 'Ponto de Descanso (Cama)',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Mobília (Define Dono de Estrutura com Telhado · Rotacionável)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (9px · Dormir & Posse)',
    hitboxRadius: 9,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Cama Rotacionável H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wood_floor', 'stone_floor', 'brick_floor', 'carpet'],
    maxHp: 110,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.WEAVING_TABLE]: {
    type: PlaceableType.WEAVING_TABLE,
    role: 'ESTACAO',
    roleLabel: 'Estação de Costura & Tingimento',
    layer: 'FURNITURE',
    layerLabel: 'Camada de Estação (Sobre Chão/Terra · Rotacionável)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (10px · Contorno Fluido)',
    hitboxRadius: 10,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Mesa de Tecelagem & Tinturaria H/V',
    connectionGroup: 'none',
    connectsToGroups: ['wall', 'wood_floor', 'stone_floor', 'brick_floor', 'carpet'],
    maxHp: 140,
    lightRadius: 0,
    isInteractive: true,
  },
  [PlaceableType.FLOWER_TULIP]: {
    type: PlaceableType.FLOWER_TULIP,
    role: 'MOBILIA',
    roleLabel: 'Flor Ornamental (Tulipa)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Sem Hitbox)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Flor Colocável no Chão',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 10,
    lightRadius: 0,
  },
  [PlaceableType.FLOWER_LILY]: {
    type: PlaceableType.FLOWER_LILY,
    role: 'MOBILIA',
    roleLabel: 'Flor Ornamental (Lírio-do-Vale)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Sem Hitbox)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Flor Colocável no Chão',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 10,
    lightRadius: 0,
  },
  [PlaceableType.FLOWER_SUNFLOWER]: {
    type: PlaceableType.FLOWER_SUNFLOWER,
    role: 'MOBILIA',
    roleLabel: 'Flor Ornamental (Girassol)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica (Sem Hitbox)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Flor Colocável no Chão',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 10,
    lightRadius: 0,
  },
  [PlaceableType.FLOWER_SOLAR_DROP]: {
    type: PlaceableType.FLOWER_SOLAR_DROP,
    role: 'ILUMINACAO',
    roleLabel: 'Flor Luminosa (Gota Solar)',
    layer: 'FURNITURE',
    layerLabel: 'Camada Botânica Luminosa (Luz 66% em 60px)',
    hasHitbox: false,
    hitboxBehavior: 'NONE',
    hitboxLabel: 'Sem Hitbox (Livre Passagem)',
    continuityMode: 'STANDALONE',
    continuityLabel: 'Flor Luminosa Colocável no Chão',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 12,
    lightRadius: 60,
  },
  [PlaceableType.DRILLING_STAKE]: {
    type: PlaceableType.DRILLING_STAKE,
    role: 'ESTACAO',
    roleLabel: 'Estaca de Perfuração',
    layer: 'FURNITURE',
    layerLabel: 'Equipamento de Perfuração (Hitbox Sólida)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox Compacta (11px)',
    hitboxRadius: 11,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Quebre com Picareta para abrir Escada de Nível ao Subsolo',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 60,
    lightRadius: 0,
  },
  [PlaceableType.LEVEL_STAIRS]: {
    type: PlaceableType.LEVEL_STAIRS,
    role: 'ESTACAO',
    roleLabel: 'Escada de Nível',
    layer: 'FURNITURE',
    layerLabel: 'Passagem de Nível (Indestrutível)',
    hasHitbox: true,
    hitboxBehavior: 'SOLID_COMPACT',
    hitboxLabel: 'Hitbox na Superfície (Descer) · Sem Hitbox no Subsolo (Subir)',
    hitboxRadius: 11,
    continuityMode: 'STANDALONE',
    continuityLabel: 'Passagem Indestrutível entre Superfície e Subsolo',
    connectionGroup: 'none',
    connectsToGroups: [],
    maxHp: 999999,
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
    name: 'Árvore de Carvalho',
    rarity: RarityTier.BASIC,
    maxHp: 70,
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 10,
    hasHitbox: true,
    hitboxRadius: 7,
    drops: [
      { itemId: 'wood', min: 3, max: 5, chance: 1.0 },
      { itemId: 'oak_sapling', min: 1, max: 2, chance: 1.0 },
      { itemId: 'apple', min: 1, max: 2, chance: 0.45 },
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
    ],
  },
  [NatureNodeType.SAND_DUNE]: {
    type: NatureNodeType.SAND_DUNE,
    name: 'Duna de Areia',
    rarity: RarityTier.BASIC,
    maxHp: 25,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 6,
    hasHitbox: false, // Sand dunes have no hitbox and blend subtly into sandy soil!
    hitboxRadius: 0,
    drops: [
      { itemId: 'sand', min: 1, max: 2, chance: 1.0 },
    ],
  },
  [NatureNodeType.BOULDER]: {
    type: NatureNodeType.BOULDER,
    name: 'Rocha Cinzenta',
    rarity: RarityTier.BASIC,
    maxHp: 70,
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 0,
    xpReward: 10,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'stone', min: 3, max: 5, chance: 1.0 },
      { itemId: 'flint', min: 1, max: 2, chance: 0.2 },
    ],
  },
  [NatureNodeType.CACTUS]: {
    type: NatureNodeType.CACTUS,
    name: 'Cacto Gigante',
    rarity: RarityTier.BASIC,
    maxHp: 50,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 10,
    hasHitbox: true,
    hitboxRadius: 7,
    drops: [
      { itemId: 'fiber', min: 2, max: 4, chance: 0.8 },
      { itemId: 'cactus_fruit', min: 2, max: 3, chance: 1.0 },
    ],
  },
  [NatureNodeType.PALM_TREE]: {
    type: NatureNodeType.PALM_TREE,
    name: 'Coqueiro Costeiro',
    rarity: RarityTier.BASIC,
    maxHp: 70,
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 12,
    hasHitbox: true,
    hitboxRadius: 6,
    drops: [
      { itemId: 'palm_wood', min: 2, max: 4, chance: 1.0 },
      { itemId: 'palm_sapling', min: 1, max: 2, chance: 1.0 },
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
    xpReward: 25,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'iron_ore', min: 1, max: 4, chance: 1.0 },
    ],
  },
  [NatureNodeType.HARDWOOD_TREE]: {
    type: NatureNodeType.HARDWOOD_TREE,
    name: 'Árvore Ancestral Dourada',
    rarity: RarityTier.RARE,
    maxHp: 110,
    materialKind: 'HARDWOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 1,
    xpReward: 25,
    hasHitbox: true,
    hitboxRadius: 8,
    drops: [
      { itemId: 'hardwood', min: 2, max: 4, chance: 1.0 },
      { itemId: 'apple', min: 1, max: 2, chance: 0.5 },
    ],
  },
  [NatureNodeType.PEARL_CLAM]: {
    type: NatureNodeType.PEARL_CLAM,
    name: 'Ostra Abissal Gigante',
    rarity: RarityTier.VERY_RARE,
    maxHp: 160,
    materialKind: 'ASTRAL_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 2,
    xpReward: 80,
    hasHitbox: true,
    hitboxRadius: 9,
    drops: [
      { itemId: 'abyssal_pearl', min: 1, max: 1, chance: 1.0 },
    ],
  },
  [NatureNodeType.ANCIENT_WORLD_TREE]: {
    type: NatureNodeType.ANCIENT_WORLD_TREE,
    name: 'Árvore-Coração Primordial',
    rarity: RarityTier.VERY_RARE,
    maxHp: 280,
    materialKind: 'PRIMORDIAL_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 2,
    xpReward: 140,
    hasHitbox: true,
    hitboxRadius: 10,
    drops: [
      { itemId: 'primordial_essence', min: 1, max: 1, chance: 1.0 },
      { itemId: 'hardwood', min: 4, max: 8, chance: 1.0 },
    ],
  },
  [NatureNodeType.FLOWER_TULIP]: {
    type: NatureNodeType.FLOWER_TULIP,
    name: 'Tulipa',
    rarity: RarityTier.BASIC,
    maxHp: 10,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 4,
    hasHitbox: false,
    hitboxRadius: 0,
    drops: [{ itemId: 'flower_tulip', min: 1, max: 1, chance: 1.0 }],
  },
  [NatureNodeType.FLOWER_LILY]: {
    type: NatureNodeType.FLOWER_LILY,
    name: 'Lírio-do-Vale',
    rarity: RarityTier.BASIC,
    maxHp: 10,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 4,
    hasHitbox: false,
    hitboxRadius: 0,
    drops: [{ itemId: 'flower_lily', min: 1, max: 1, chance: 1.0 }],
  },
  [NatureNodeType.FLOWER_SUNFLOWER]: {
    type: NatureNodeType.FLOWER_SUNFLOWER,
    name: 'Girassol',
    rarity: RarityTier.BASIC,
    maxHp: 10,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 4,
    hasHitbox: false,
    hitboxRadius: 0,
    drops: [{ itemId: 'flower_sunflower', min: 1, max: 1, chance: 1.0 }],
  },
  [NatureNodeType.FLOWER_SOLAR_DROP]: {
    type: NatureNodeType.FLOWER_SOLAR_DROP,
    name: 'Flor Gota Solar',
    rarity: RarityTier.RARE,
    maxHp: 12,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 10,
    hasHitbox: false,
    hitboxRadius: 0,
    drops: [{ itemId: 'flower_solar_drop', min: 1, max: 1, chance: 1.0 }],
  },
  [NatureNodeType.TEMPERATE_TREE]: {
    type: NatureNodeType.TEMPERATE_TREE,
    name: 'Carvalho Escuro',
    rarity: RarityTier.BASIC,
    maxHp: 95,
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 14,
    hasHitbox: true,
    hitboxRadius: 8,
    drops: [
      { itemId: 'dark_oak_wood', min: 4, max: 6, chance: 1.0 },
      { itemId: 'hardwood', min: 1, max: 2, chance: 0.35 },
      { itemId: 'dark_oak_sapling', min: 1, max: 2, chance: 1.0 },
    ],
  },
  [NatureNodeType.PINE_TREE]: {
    type: NatureNodeType.PINE_TREE,
    name: 'Pinheiro',
    rarity: RarityTier.BASIC,
    maxHp: 80,
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    xpReward: 12,
    hasHitbox: true,
    hitboxRadius: 7,
    drops: [
      { itemId: 'pine_wood', min: 3, max: 5, chance: 1.0 },
      { itemId: 'pine_sapling', min: 1, max: 2, chance: 1.0 },
    ],
  },
  [NatureNodeType.SHORT_GRASS]: {
    type: NatureNodeType.SHORT_GRASS,
    name: 'Grama Baixa',
    rarity: RarityTier.BASIC,
    maxHp: 1,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 0,
    hasHitbox: false,
    hitboxRadius: 0,
    drops: [],
  },
  [NatureNodeType.TALL_GRASS]: {
    type: NatureNodeType.TALL_GRASS,
    name: 'Grama Alta',
    rarity: RarityTier.BASIC,
    maxHp: 1,
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    xpReward: 0,
    hasHitbox: false,
    hitboxRadius: 0,
    drops: [],
  },
  [NatureNodeType.UNDERGROUND_DIRT]: {
    type: NatureNodeType.UNDERGROUND_DIRT,
    name: 'Parede de Terra do Subsolo',
    rarity: RarityTier.BASIC,
    maxHp: 50,
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    xpReward: 3,
    hasHitbox: true,
    hitboxRadius: 15,
    drops: [
      { itemId: 'stone', min: 1, max: 2, chance: 0.35 },
    ],
  },
  [NatureNodeType.UNDERGROUND_COAL]: {
    type: NatureNodeType.UNDERGROUND_COAL,
    name: 'Veio de Carvão',
    rarity: RarityTier.BASIC,
    maxHp: 75,
    materialKind: 'ROUGH_STONE',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    xpReward: 12,
    hasHitbox: true,
    hitboxRadius: 15,
    drops: [
      { itemId: 'charcoal', min: 1, max: 3, chance: 1.0 },
      { itemId: 'stone', min: 1, max: 1, chance: 0.6 },
    ],
  },
  [NatureNodeType.UNDERGROUND_IRON]: {
    type: NatureNodeType.UNDERGROUND_IRON,
    name: 'Veio de Ferro Subterrâneo',
    rarity: RarityTier.RARE,
    maxHp: 110,
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    xpReward: 25,
    hasHitbox: true,
    hitboxRadius: 15,
    drops: [
      { itemId: 'iron_ore', min: 1, max: 3, chance: 1.0 },
      { itemId: 'stone', min: 1, max: 1, chance: 0.7 },
    ],
  },
  [NatureNodeType.UNDERGROUND_GOLD]: {
    type: NatureNodeType.UNDERGROUND_GOLD,
    name: 'Veio de Ouro Subterrâneo',
    rarity: RarityTier.RARE,
    maxHp: 145,
    materialKind: 'IRON_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 1,
    xpReward: 40,
    hasHitbox: true,
    hitboxRadius: 15,
    drops: [
      { itemId: 'gold_ore', min: 1, max: 2, chance: 1.0 },
      { itemId: 'stone', min: 1, max: 1, chance: 0.7 },
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
  dark_oak_wood: 1,
  pine_wood: 1,
  palm_wood: 1,
  fiber: 1,
  berry: 1,
  gold_coin: 1,
  stone: 2,
  tilled_soil: 2,
  oak_sapling: 2,
  dark_oak_sapling: 2,
  pine_sapling: 2,
  palm_sapling: 3,
  flower_tulip: 3,
  flower_lily: 3,
  flower_sunflower: 4,
  flower_solar_drop: 18,
  squid: 14,
  dye_verde: 3,
  dye_branco: 5,
  dye_vermelho: 5,
  dye_laranja: 5,
  dye_amarelo: 5,
  dye_azul: 6,
  dye_roxo: 6,
  dye_magenta: 6,
  dye_rosa: 6,
  dye_preto: 16,
  dye_cinza: 22,
  dye_cinza_claro: 28,
  dye_verde_lima: 9,
  dye_ciano: 10,
  dye_azul_claro: 12,
  dye_marrom: 22,
  dye_bege: 28,
  raw_lamb: 7,
  raw_pork: 8,
  raw_beef: 9,
  cooked_lamb: 15,
  cooked_pork: 16,
  cooked_beef: 18,

  // === TIER 1.5: SEMENTES INICIAIS, FRUTAS DE BIOMA, SAFRA AGRÍCOLA & SUBPRODUTOS ===
  wheat_seeds: 3,
  berry_seeds: 3,
  carrot_seeds: 3,
  bone_fertilizer: 3,
  sand: 2,
  glass: 5,
  charcoal: 4,
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
  dark_oak_floor: 1,
  pine_floor: 1,
  palm_floor: 1,
  wood_fence: 1,
  fence_gate: 3,
  wood_wall: 2,
  dark_oak_wall: 2,
  pine_wall: 2,
  palm_wall: 2,
  wood_bridge: 2,
  torch: 2,
  wood_window: 3,
  dark_oak_window: 3,
  pine_window: 3,
  palm_window: 3,
  stone_floor: 4,
  wood_door: 5,
  dark_oak_door: 5,
  pine_door: 5,
  palm_door: 5,
  spike_trap: 7,
  royal_carpet: 7,
  workbench: 12,
  chest: 14,
  campfire: 15,
  bed: 28,
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
  stone_shovel: 12,
  watering_can: 12,
  watering_can_full: 14,
  stone_axe: 15,
  stone_pickaxe: 18,
  wood_sword: 20,
  flint_spear: 30,

  // Vestimentas Iniciais, Trajes de Ofício & Armaduras Nv.1 (Mesa de Tecelagem / Bancada)
  white_tank_top: 6,
  brown_shorts: 6,
  fiber_hat: 12,
  leather_hat: 22,
  solar_necklace: 95,
  sweater: 24,
  short_dress: 24,
  long_dress: 30,
  shorts: 14,
  pants: 20,
  overalls: 28,
  sandals: 14,
  cowboy_boots: 22,
  blacksmith_bandana: 18,
  blacksmith_apron: 32,
  blacksmith_boots: 26,
  merchant_cap: 28,
  merchant_doublet: 38,
  merchant_slacks: 26,
  elder_mitre: 34,
  elder_robe: 42,
  wanderer_hood: 24,
  wanderer_poncho: 32,
  wanderer_leggings: 24,
  leather_hood: 25,
  leather_boots: 26,
  leather_pants: 28,
  leather_tunic: 38,

  // === TIER 3: RECURSOS RAROS (FERRAMENTAS NV.1+, CULTIVO RARO & COMBATE A MONSTROS) ===
  herb_seeds: 12,
  hardwood: 18,
  iron_ore: 20,
  medic_herb: 22,
  dark_essence: 28,
  spider_silk: 32,
  iron_bar: 48,
  gold_ore: 42,
  gold_bar: 92,
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
  drilling_stake: 525,
  level_stairs: 525,

  // Ferramentas & Armas Nv.2 (Ferro Forjado & Monstros)
  iron_hoe: 160,
  iron_shovel: 155,
  shears: 115,
  iron_axe: 220,
  iron_pickaxe: 275,
  ogre_club: 290,
  iron_sword: 330,
  shadow_blade: 360,
  scorpion_dagger: 420,

  // Armaduras Nv.2 (Conjunto de Ferro Forjado & Ogro — Bancada)
  iron_helmet: 270,
  iron_boots: 270,
  iron_greaves: 325,
  iron_armor: 485,

  // === TIER 4: DIPLOMACIA REAL & RELÍQUIAS MUITO RARAS (COLOSSOS & MAR ABISSAL) ===
  royal_wax_seal: 180, // Exclusivo de compra com Aldeão/Andarilho
  golem_core: 220,
  abyssal_pearl: 260,
  primordial_essence: 280,
  village_well: 290,
  peace_treaty: 600,

  // === TIER 5: EQUIPAMENTOS DE OURO & RELÍQUIAS SUPREMAS (SEM TETO DE PREÇO) ===
  recall_crystal: 270,
  astral_boots: 840,
  primordial_ambrosia: 1150,
  astral_crown: 1180,
  abyssal_trident: 1300,
  primordial_axe: 1320,
  astral_leggings: 1580,
  guardian_totem: 1750,
  primordial_pickaxe: 1980,
  astral_armor: 2150,
  astral_sword: 2750,
};

export function getItemBasePrice(itemId: string): number {
  if (ITEM_BASE_PRICES[itemId] !== undefined) {
    return ITEM_BASE_PRICES[itemId];
  }
  const def = ITEMS[itemId];
  if (def?.garmentBaseId && ITEM_BASE_PRICES[def.garmentBaseId] !== undefined) {
    return ITEM_BASE_PRICES[def.garmentBaseId];
  }
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
  // Itens básicos/baratos vendem com facilidade; relíquias caras vendem um pouco mais devagar a menos que estejam em pechincha.
  let affordabilityFactor = 1.0;
  if (safePrice <= 15) {
    affordabilityFactor = 1.18;
  } else if (safePrice <= 45) {
    affordabilityFactor = 1.05;
  } else if (safePrice <= 120) {
    affordabilityFactor = 0.92;
  } else if (safePrice <= 350) {
    affordabilityFactor = 0.78;
  } else if (safePrice <= 900) {
    affordabilityFactor = 0.64;
  } else {
    affordabilityFactor = 0.5;
  }

  // Se o jogador colocou preço de Pechincha ou Barato (<= 85% do valor sugerido), o comprador aproveita a oportunidade!
  if (ratio <= 0.85) {
    affordabilityFactor = Math.max(0.9, affordabilityFactor);
  }

  // 2. Fator de avaliação de negócio (comparado ao Valor Sugerido)
  let dealMultiplier = 0;
  let dealLabel = 'Valor Sugerido (Justo)';
  let dealBadgeColor = '#38bdf8';

  if (ratio <= 0.6) {
    dealMultiplier = 0.96;
    dealLabel = 'Pechincha Imperdível!';
    dealBadgeColor = '#4ade80';
  } else if (ratio <= 0.85) {
    dealMultiplier = 0.85;
    dealLabel = 'Barato (Ótimo Negócio)';
    dealBadgeColor = '#86efac';
  } else if (ratio <= 1.05) {
    dealMultiplier = 0.68;
    dealLabel = 'Valor Sugerido (Justo)';
    dealBadgeColor = '#38bdf8';
  } else if (ratio <= 1.3) {
    dealMultiplier = 0.32;
    dealLabel = 'Caro (Pouco Interesse)';
    dealBadgeColor = '#fbbf24';
  } else if (ratio <= 1.65) {
    dealMultiplier = 0.12;
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
      : Math.min(0.97, Math.max(0.05, dealMultiplier * affordabilityFactor));

  // Quantidade máxima que o aldeão pode querer levar numa única compra (itens baratos saem em lotes maiores)
  let maxBuyQty = 1;
  if (safePrice <= 5 && ratio <= 1.05) {
    maxBuyQty = 10;
  } else if (safePrice <= 15 && ratio <= 1.1) {
    maxBuyQty = 6;
  } else if (safePrice <= 40 && ratio <= 1.1) {
    maxBuyQty = 4;
  } else if (safePrice <= 100 && ratio <= 1.05) {
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
  SOFT_WOOD: 'Madeira de Carvalho / Pinheiro',
  ROUGH_STONE: 'Rocha & Alvenaria Básica',
  HARDWOOD: 'Madeira Nobre Ancestral',
  IRON_MINERAL: 'Minério de Ferro & Ouro',
  PRIMORDIAL_WOOD: 'Madeira-Coração Primordial',
  ASTRAL_MINERAL: 'Rocha Densa & Abissal',
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
    requiredTier: 1,
    requirementLabel: 'Apenas Enxada quebra a Terra Arada',
  },
  [PlaceableType.DIRT_PATH]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.SHOVEL,
    requiredTier: 1,
    requirementLabel: 'Apenas a Pá desfaz o Solo Batido',
  },
  [PlaceableType.OAK_SAPLING]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },
  [PlaceableType.DARK_OAK_SAPLING]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },
  [PlaceableType.PINE_SAPLING]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },
  [PlaceableType.PALM_SAPLING]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado',
  },
  [PlaceableType.FLOWER_TULIP]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Qualquer Ferramenta',
  },
  [PlaceableType.FLOWER_LILY]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Qualquer Ferramenta',
  },
  [PlaceableType.FLOWER_SUNFLOWER]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Qualquer Ferramenta',
  },
  [PlaceableType.FLOWER_SOLAR_DROP]: {
    materialKind: 'FIBER_FOLIAGE',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Qualquer Ferramenta',
  },

  // === MADEIRA DE CARVALHO, CARVALHO ESCURO & PINHEIRO (Quebrável com a Mão; ideal com Machado) ===
  [PlaceableType.WOOD_FLOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.DARK_OAK_FLOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PINE_FLOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PALM_FLOOR]: {
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
  [PlaceableType.DARK_OAK_WALL]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PINE_WALL]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PALM_WALL]: {
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
  [PlaceableType.DARK_OAK_WINDOW]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PINE_WINDOW]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PALM_WINDOW]: {
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
  [PlaceableType.DARK_OAK_DOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PINE_DOOR]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.PALM_DOOR]: {
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
  [PlaceableType.FENCE_GATE]: {
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
  [PlaceableType.BED]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
  },
  [PlaceableType.WEAVING_TABLE]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 0,
    requirementLabel: 'Mão Livre ou Machado (Ideal: Machado)',
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

  // === FERRO FORJADO ===
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

  // === ESTRUTURAS PRIMORDIAIS & DEFENSIVAS ===
  [PlaceableType.GUARDIAN_TOTEM]: {
    materialKind: 'PRIMORDIAL_WOOD',
    requiredTool: ToolType.AXE,
    requiredTier: 2,
    requirementLabel: 'Requer Machado de Ferro+ (Nv.2+)',
  },
  [PlaceableType.DRILLING_STAKE]: {
    materialKind: 'SOFT_WOOD',
    requiredTool: ToolType.NONE,
    requiredTier: 0,
    requirementLabel: 'Mão/Qualquer Item (Coletar) ou Picareta (Perfurar Subsolo)',
  },
  [PlaceableType.LEVEL_STAIRS]: {
    materialKind: 'ASTRAL_MINERAL',
    requiredTool: ToolType.PICKAXE,
    requiredTier: 99,
    requirementLabel: 'Indestrutível (Escada de Nível)',
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
      FIBER_FOLIAGE: 5, // Quebra Arbusto (25 HP) em 5 golpes e Cacto (50 HP) em 10 golpes
      SOFT_WOOD: 5, // Quebra Carvalho (70 HP) e Palmeira (70 HP) em 14 golpes
      ROUGH_STONE: 5, // Quebra Rocha Cinzenta (70 HP) em 14 golpes para obter as primeiras pedras
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
      FIBER_FOLIAGE: 10,
      SOFT_WOOD: 10, // Poder de coleta 10 (Carvalho/Palmeira 70 HP -> 7 golpes)
      ROUGH_STONE: 5, // Fraco contra rocha
      HARDWOOD: 10, // Desbloqueia Árvore Ancestral Dourada (110 HP -> 11 golpes)
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
      FIBER_FOLIAGE: 20,
      SOFT_WOOD: 20, // Poder de coleta 20 (Carvalho/Palmeira 70 HP -> 4 golpes)
      ROUGH_STONE: 8,
      HARDWOOD: 20, // Poder de coleta 20 (Árvore Ancestral 110 HP -> 6 golpes)
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 20, // Desbloqueia Árvore-Coração Primordial (280 HP -> 14 golpes)
      ASTRAL_MINERAL: 0,
    },
  },
  primordial_axe: {
    label: 'Machado Primordial do Bosque (Nv.3)',
    toolType: ToolType.AXE,
    toolTier: 3,
    forceByMaterial: {
      FIBER_FOLIAGE: 30,
      SOFT_WOOD: 30, // Poder de coleta 30 (Carvalho/Palmeira 70 HP -> 3 golpes)
      ROUGH_STONE: 10,
      HARDWOOD: 30, // Poder de coleta 30 (Árvore Ancestral 110 HP -> 4 golpes)
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 30, // Poder de coleta 30 (Árvore-Coração Primordial 280 HP -> 10 golpes)
      ASTRAL_MINERAL: 0,
    },
  },

  // === PICARETAS (Especializadas em ROUGH_STONE, IRON_MINERAL e ASTRAL_MINERAL) ===
  stone_pickaxe: {
    label: 'Picareta de Pedra (Nv.1)',
    toolType: ToolType.PICKAXE,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 5,
      SOFT_WOOD: 5, // Fraca contra madeira
      ROUGH_STONE: 10, // Poder de coleta 10 (Rocha Cinzenta 70 HP -> 7 golpes)
      HARDWOOD: 0,
      IRON_MINERAL: 10, // Desbloqueia Minério de Ferro (110 HP -> 11 golpes)
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  iron_pickaxe: {
    label: 'Picareta de Ferro Forjado (Nv.2)',
    toolType: ToolType.PICKAXE,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 10,
      SOFT_WOOD: 8,
      ROUGH_STONE: 20, // Poder de coleta 20 (Rocha Cinzenta 70 HP -> 4 golpes)
      HARDWOOD: 0,
      IRON_MINERAL: 20, // Poder de coleta 20 (Minério de Ferro 110 HP -> 6 golpes)
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 20, // Desbloqueia Ostra Abissal (160 HP -> 8 golpes)
    },
  },
  primordial_pickaxe: {
    label: 'Picareta de Ouro (Nv.3)',
    toolType: ToolType.PICKAXE,
    toolTier: 3,
    forceByMaterial: {
      FIBER_FOLIAGE: 15,
      SOFT_WOOD: 10,
      ROUGH_STONE: 30, // Poder de coleta 30 (Rocha Cinzenta 70 HP -> 3 golpes)
      HARDWOOD: 0,
      IRON_MINERAL: 30, // Poder de coleta 30 (Minério de Ferro 110 HP -> 4 golpes)
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 30, // Poder de coleta 30 (Ostra Abissal 160 HP -> 6 golpes)
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
  stone_shovel: {
    label: 'Pá de Pedra (Nv.1)',
    toolType: ToolType.SHOVEL,
    toolTier: 1,
    forceByMaterial: {
      FIBER_FOLIAGE: 40,
      SOFT_WOOD: 0,
      ROUGH_STONE: 0,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  iron_shovel: {
    label: 'Pá de Ferro Forjado (Nv.2)',
    toolType: ToolType.SHOVEL,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 40,
      SOFT_WOOD: 0,
      ROUGH_STONE: 0,
      HARDWOOD: 0,
      IRON_MINERAL: 0,
      PRIMORDIAL_WOOD: 0,
      ASTRAL_MINERAL: 0,
    },
  },
  shears: {
    label: 'Tesoura (Nv.2)',
    toolType: ToolType.SHEARS,
    toolTier: 2,
    forceByMaterial: {
      FIBER_FOLIAGE: 35,
      SOFT_WOOD: 5,
      ROUGH_STONE: 0,
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
    label: 'Adaga de Ferrão do Deserto (Nv.2)',
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
    label: 'Espada de Ouro (Nv.3)',
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
      : req.requiredTool === ToolType.SHOVEL
      ? 'Pá'
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
          : requiredTool === ToolType.HOE
          ? 'Enxada'
          : requiredTool === ToolType.SHOVEL
          ? 'Pá'
          : 'Ferramenta';
      const tierName =
        requiredTier >= 3
          ? 'Primordial/de Ouro (Nv.3)'
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

  // Harvest power is strictly the equipment's own material force (never summed/multiplied with player Strength attribute)
  void playerStrengthMult;
  const finalForce = Math.max(1, Math.round(baseMaterialForce));

  return {
    canBreak: true,
    force: finalForce,
    baseMaterialForce,
    blockReason: null,
    actorLabel: entry.label,
    materialLabel,
  };
}

// ============================================================================
// SISTEMA DE COMBUSTÍVEL / SLOT DE LENHA (FOGUEIRA & FORNALHA — ESTILO MINECRAFT)
// ============================================================================

export interface FuelDefinition {
  itemId: string;
  name: string;
  burnTimeSec: number;
  efficiencyLabel: string;
  smeltCapacityHint: string;
}

/**
 * Poucos itens básicos selecionados que podem ser usados como Lenha (Combustível)
 * no Slot de Lenha da Fogueira e da Fornalha.
 * O Carvão Vegetal possui muito mais eficiência (60s = 5x a Madeira Rústica).
 */
export const FUEL_ITEMS: Record<string, FuelDefinition> = {
  fiber: {
    itemId: 'fiber',
    name: 'Fibra Vegetal',
    burnTimeSec: 4,
    efficiencyLabel: 'Graveto Rápido (4s)',
    smeltCapacityHint: '0.5x preparo (Fogo curto)',
  },
  wood: {
    itemId: 'wood',
    name: 'Madeira de Carvalho',
    burnTimeSec: 12,
    efficiencyLabel: 'Lenha Básica (12s)',
    smeltCapacityHint: '1.5x preparos por tora',
  },
  dark_oak_wood: {
    itemId: 'dark_oak_wood',
    name: 'Madeira de Carvalho Escuro',
    burnTimeSec: 12,
    efficiencyLabel: 'Lenha Básica (12s)',
    smeltCapacityHint: '1.5x preparos por tora',
  },
  pine_wood: {
    itemId: 'pine_wood',
    name: 'Madeira de Pinheiro',
    burnTimeSec: 12,
    efficiencyLabel: 'Lenha Básica (12s)',
    smeltCapacityHint: '1.5x preparos por tora',
  },
  palm_wood: {
    itemId: 'palm_wood',
    name: 'Madeira de Coqueiro',
    burnTimeSec: 12,
    efficiencyLabel: 'Lenha Básica (12s)',
    smeltCapacityHint: '1.5x preparos por tora',
  },
  hardwood: {
    itemId: 'hardwood',
    name: 'Madeira Nobre',
    burnTimeSec: 24,
    efficiencyLabel: 'Lenha Densa (24s)',
    smeltCapacityHint: '3x preparos por tora',
  },
  charcoal: {
    itemId: 'charcoal',
    name: 'Carvão',
    burnTimeSec: 60,
    efficiencyLabel: 'Alta Eficiência (60s · 5x Madeira!)',
    smeltCapacityHint: 'Até 10–12 preparos por unidade!',
  },
};

export const FUEL_ITEM_ORDER: string[] = [
  'charcoal',
  'hardwood',
  'wood',
  'dark_oak_wood',
  'pine_wood',
  'palm_wood',
  'fiber',
];

export function isFuelItem(itemId: string): boolean {
  return Boolean(FUEL_ITEMS[itemId]);
}

export function getFuelBurnTimeSec(itemId: string): number {
  return FUEL_ITEMS[itemId]?.burnTimeSec || 0;
}

/**
 * Classifica o modo de rotação de cada elemento colocável no mundo:
 * - 'dir4': Possui 4 vistas direcionais distintas (0 = Sul/Frente, 1 = Leste/Direita, 2 = Norte/Costas, 3 = Oeste/Esquerda).
 * - 'axis2': Possui 2 eixos (0 = Horizontal / Frontal, 1 = Vertical / Lateral). Em paredes/portas/janelas/cercas, a conexão com vizinhos tem prioridade sobre a rotação manual.
 * - 'none': Elemento radialmente simétrico ou natural/orgânico que não utiliza botão de rotação.
 */
export function getPlaceableRotationMode(
  type?: PlaceableType
): 'none' | 'axis2' | 'dir4' {
  if (!type) return 'none';
  switch (type) {
    case PlaceableType.BED:
    case PlaceableType.CHEST:
    case PlaceableType.WORKBENCH:
    case PlaceableType.FURNACE:
    case PlaceableType.WEAVING_TABLE:
    case PlaceableType.MARKET_STALL:
    case PlaceableType.EXPLORER_TENT:
    case PlaceableType.VILLAGE_HOUSE:
      return 'dir4';

    case PlaceableType.WOOD_WALL:
    case PlaceableType.DARK_OAK_WALL:
    case PlaceableType.PINE_WALL:
    case PlaceableType.PALM_WALL:
    case PlaceableType.STONE_WALL:
    case PlaceableType.BRICK_WALL:
    case PlaceableType.WOOD_WINDOW:
    case PlaceableType.DARK_OAK_WINDOW:
    case PlaceableType.PINE_WINDOW:
    case PlaceableType.PALM_WINDOW:
    case PlaceableType.STONE_WINDOW:
    case PlaceableType.WOOD_DOOR:
    case PlaceableType.DARK_OAK_DOOR:
    case PlaceableType.PINE_DOOR:
    case PlaceableType.PALM_DOOR:
    case PlaceableType.IRON_GATE:
    case PlaceableType.WOOD_FENCE:
    case PlaceableType.FENCE_GATE:
    case PlaceableType.WOOD_BRIDGE:
    case PlaceableType.WOOD_FLOOR:
    case PlaceableType.DARK_OAK_FLOOR:
    case PlaceableType.PINE_FLOOR:
    case PlaceableType.PALM_FLOOR:
    case PlaceableType.BRICK_FLOOR:
      return 'axis2';

    default:
      return 'none';
  }
}

export function isRotatablePlaceable(type?: PlaceableType): boolean {
  return getPlaceableRotationMode(type) !== 'none';
}
