import { ClothingColorId, PlaceableType, RarityTier } from './types';

export interface RecipeIngredient {
  itemId: string;
  count: number;
  flowerColor?: ClothingColorId;
}

export interface RecipeMaterialOption {
  id: string;
  label: string;
  iconItemId?: string;
  ingredients: RecipeIngredient[];
}

export interface CraftingRecipe {
  id: string;
  resultItemId: string;
  resultCount: number;
  requiredStation: PlaceableType | null; // null = Mão Livre | WORKBENCH = Bancada | CAMPFIRE = Fogueira | FURNACE = Fornalha | WEAVING_TABLE = Mesa de Tecelagem
  craftTimeSec?: number; // 0 / undefined = Instantâneo (Mão / Bancada) | > 0 = Tempo de preparo
  rarity: RarityTier;
  ingredients: RecipeIngredient[];
  materialOptions?: RecipeMaterialOption[];
}


export const RECIPES: CraftingRecipe[] = [
  // ==========================================================================
  // 1. CRAFT À MÃO (requiredStation: null — Sobrevivência Básica 2x2 Instantânea)
  // Assim como no Minecraft, à mão você cria apenas o essencial inicial (Bancada,
  // Fogueira, Tochas, Curativo Básico, Adubo e Sementes). Ferramentas, armas,
  // baús e construções exigem posicionar uma Bancada de Trabalho!
  // ==========================================================================
  {
    id: 'craft_workbench',
    resultItemId: 'workbench',
    resultCount: 1,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_campfire',
    resultItemId: 'campfire',
    resultCount: 1,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'stone', count: 3 },
    ],
  },
  {
    id: 'craft_torch_charcoal',
    resultItemId: 'torch',
    resultCount: 4,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 1 },
      { itemId: 'charcoal', count: 1 },
    ],
  },
  {
    id: 'craft_torch',
    resultItemId: 'torch',
    resultCount: 2,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_wool_bandage',
    resultItemId: 'wool_bandage',
    resultCount: 2,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 2 },
      { itemId: 'berry', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_bone_fertilizer',
    resultItemId: 'bone_fertilizer',
    resultCount: 3,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'fiber', count: 2 },
      { itemId: 'stone', count: 1 },
      { itemId: 'berry', count: 1 },
    ],
  },
  {
    id: 'craft_wheat_seeds',
    resultItemId: 'wheat_seeds',
    resultCount: 2,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wheat', count: 1 }],
  },
  {
    id: 'craft_berry_seeds',
    resultItemId: 'berry_seeds',
    resultCount: 2,
    requiredStation: null,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'berry', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },

  // ==========================================================================
  // 2. BANCADA DE TRABALHO (requiredStation: WORKBENCH — Criação Instantânea)
  // Ferramentas de Pedra e Ferro (usando Barras fundidas), Armas, Armaduras,
  // Baús, Fornalha, Bote, Sela e Arquitetura de Madeira/Pedra.
  // ==========================================================================
  // --- FERRAMENTAS & UTILITÁRIOS (BANCADA) ---
  {
    id: 'craft_stone_axe',
    resultItemId: 'stone_axe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'stone', count: 3 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_stone_pickaxe',
    resultItemId: 'stone_pickaxe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'stone', count: 4 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_stone_hoe',
    resultItemId: 'stone_hoe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'stone', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_stone_shovel',
    resultItemId: 'stone_shovel',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 2 },
      { itemId: 'stone', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_watering_can',
    resultItemId: 'watering_can',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'stone', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_fishing_rod',
    resultItemId: 'fishing_rod',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_wood_boat',
    resultItemId: 'wood_boat',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 12 },
      { itemId: 'fiber', count: 6 },
    ],
  },
  {
    id: 'craft_drilling_stake',
    resultItemId: 'drilling_stake',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 10 },
      { itemId: 'stone', count: 20 },
      { itemId: 'wood', count: 6 },
    ],
  },
  {
    id: 'craft_saddle',
    resultItemId: 'saddle',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'wool', count: 4 },
      { itemId: 'fiber', count: 6 },
      { itemId: 'wood', count: 4 },
    ],
  },
  {
    id: 'craft_shears',
    resultItemId: 'shears',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 2 },
      { itemId: 'wood', count: 1 },
    ],
  },
  {
    id: 'craft_iron_axe',
    resultItemId: 'iron_axe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_iron_pickaxe',
    resultItemId: 'iron_pickaxe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_iron_hoe',
    resultItemId: 'iron_hoe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 2 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_iron_shovel',
    resultItemId: 'iron_shovel',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 2 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },

  // --- ARMAS DE COMBATE (BANCADA) ---
  {
    id: 'craft_wood_sword',
    resultItemId: 'wood_sword',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'flint', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_flint_spear',
    resultItemId: 'flint_spear',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 5 },
      { itemId: 'flint', count: 3 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_ogre_club',
    resultItemId: 'ogre_club',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'ogre_hide', count: 2 },
      { itemId: 'hardwood', count: 4 },
      { itemId: 'stone', count: 6 },
    ],
  },
  {
    id: 'craft_iron_sword',
    resultItemId: 'iron_sword',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'hardwood', count: 2 },
    ],
  },
  {
    id: 'craft_shadow_blade',
    resultItemId: 'shadow_blade',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'dark_essence', count: 4 },
      { itemId: 'hardwood', count: 2 },
    ],
  },
  {
    id: 'craft_scorpion_dagger',
    resultItemId: 'scorpion_dagger',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'scorpion_stinger', count: 2 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'spider_silk', count: 2 },
    ],
  },

  // --- ARMADURAS & VESTIMENTAS (BANCADA) ---
  {
    id: 'craft_leather_hood',
    resultItemId: 'leather_hood',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 2 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_leather_tunic',
    resultItemId: 'leather_tunic',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 3 },
      { itemId: 'fiber', count: 4 },
      { itemId: 'wood', count: 2 },
    ],
  },
  {
    id: 'craft_leather_pants',
    resultItemId: 'leather_pants',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 2 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'craft_leather_boots',
    resultItemId: 'leather_boots',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 2 },
      { itemId: 'fiber', count: 2 },
      { itemId: 'wood', count: 2 },
    ],
  },
  {
    id: 'craft_iron_helmet',
    resultItemId: 'iron_helmet',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_iron_armor',
    resultItemId: 'iron_armor',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 5 },
      { itemId: 'ogre_hide', count: 2 },
      { itemId: 'wool', count: 3 },
    ],
  },
  {
    id: 'craft_iron_greaves',
    resultItemId: 'iron_greaves',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_iron_boots',
    resultItemId: 'iron_boots',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'wool', count: 1 },
    ],
  },

  // --- ESTAÇÕES, BAÚS & ARQUITETURA (BANCADA) ---
  {
    id: 'craft_furnace',
    resultItemId: 'furnace',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 10 },
      { itemId: 'flint', count: 2 },
    ],
  },
  {
    id: 'craft_chest',
    resultItemId: 'chest',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 8 },
      { itemId: 'stone', count: 2 },
    ],
  },
  {
    id: 'craft_wood_floor',
    resultItemId: 'wood_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wood', count: 3 }],
  },
  {
    id: 'craft_dark_oak_floor',
    resultItemId: 'dark_oak_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'dark_oak_wood', count: 3 }],
  },
  {
    id: 'craft_pine_floor',
    resultItemId: 'pine_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'pine_wood', count: 3 }],
  },
  {
    id: 'craft_palm_floor',
    resultItemId: 'palm_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'palm_wood', count: 3 }],
  },
  {
    id: 'craft_stone_floor',
    resultItemId: 'stone_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'stone', count: 4 }],
  },
  {
    id: 'craft_wood_wall',
    resultItemId: 'wood_wall',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wood', count: 4 }],
  },
  {
    id: 'craft_dark_oak_wall',
    resultItemId: 'dark_oak_wall',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'dark_oak_wood', count: 4 }],
  },
  {
    id: 'craft_pine_wall',
    resultItemId: 'pine_wall',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'pine_wood', count: 4 }],
  },
  {
    id: 'craft_palm_wall',
    resultItemId: 'palm_wall',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'palm_wood', count: 4 }],
  },
  {
    id: 'craft_wood_window',
    resultItemId: 'wood_window',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'glass', count: 1 },
    ],
  },
  {
    id: 'craft_dark_oak_window',
    resultItemId: 'dark_oak_window',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dark_oak_wood', count: 4 },
      { itemId: 'glass', count: 1 },
    ],
  },
  {
    id: 'craft_pine_window',
    resultItemId: 'pine_window',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'pine_wood', count: 4 },
      { itemId: 'glass', count: 1 },
    ],
  },
  {
    id: 'craft_palm_window',
    resultItemId: 'palm_window',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'palm_wood', count: 4 },
      { itemId: 'glass', count: 1 },
    ],
  },
  {
    id: 'craft_wood_door',
    resultItemId: 'wood_door',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 5 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_dark_oak_door',
    resultItemId: 'dark_oak_door',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dark_oak_wood', count: 5 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_pine_door',
    resultItemId: 'pine_door',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'pine_wood', count: 5 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_palm_door',
    resultItemId: 'palm_door',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'palm_wood', count: 5 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_wood_fence',
    resultItemId: 'wood_fence',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_fence_gate',
    resultItemId: 'fence_gate',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_wood_bridge',
    resultItemId: 'wood_bridge',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_spike_trap',
    resultItemId: 'spike_trap',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'flint', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_royal_carpet',
    resultItemId: 'royal_carpet',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'wool', count: 2 },
      { itemId: 'berry', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_explorer_tent',
    resultItemId: 'explorer_tent',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'wool', count: 4 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'hardwood', count: 3 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'craft_bed',
    resultItemId: 'bed',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 5 },
      { itemId: 'wool', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_weaving_table',
    resultItemId: 'weaving_table',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 6 },
      { itemId: 'wood', count: 4 },
      { itemId: 'wool', count: 10 },
    ],
  },
  {
    id: 'craft_market_stall',
    resultItemId: 'market_stall',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'hardwood', count: 4 },
      { itemId: 'spider_silk', count: 2 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_village_well',
    resultItemId: 'village_well',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 10 },
      { itemId: 'wood', count: 4 },
      { itemId: 'golem_core', count: 1 },
    ],
  },
  {
    id: 'craft_royal_banner',
    resultItemId: 'royal_banner',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'spider_silk', count: 2 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'gold_coin', count: 2 },
    ],
  },
  {
    id: 'craft_iron_gate',
    resultItemId: 'iron_gate',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 1 },
      { itemId: 'stone', count: 3 },
    ],
  },
  {
    id: 'craft_iron_lantern',
    resultItemId: 'iron_lantern',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 1 },
      { itemId: 'charcoal', count: 1 },
    ],
  },

  // --- CORANTES (BANCADA DE TRABALHO) ---
  {
    id: 'craft_dye_preto',
    resultItemId: 'dye_preto',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'squid', count: 1 }],
  },
  {
    id: 'craft_dye_cinza',
    resultItemId: 'dye_cinza',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_preto', count: 1 },
      { itemId: 'dye_branco', count: 1 },
    ],
  },
  {
    id: 'craft_dye_cinza_claro',
    resultItemId: 'dye_cinza_claro',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_cinza', count: 1 },
      { itemId: 'dye_branco', count: 1 },
    ],
  },
  {
    id: 'craft_dye_branco',
    resultItemId: 'dye_branco',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'branco' }],
    materialOptions: [
      {
        id: 'tulip_branco',
        label: 'Tulipa Branca',
        ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'branco' }],
      },
      {
        id: 'lily_branco',
        label: 'Lírio-do-Vale Branco',
        ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'branco' }],
      },
    ],
  },
  {
    id: 'craft_dye_vermelho',
    resultItemId: 'dye_vermelho',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'vermelho' }],
    materialOptions: [
      {
        id: 'tulip_vermelho',
        label: 'Tulipa Vermelha',
        ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'vermelho' }],
      },
      {
        id: 'lily_vermelho',
        label: 'Lírio-do-Vale Vermelho',
        ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'vermelho' }],
      },
    ],
  },
  {
    id: 'craft_dye_laranja',
    resultItemId: 'dye_laranja',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'laranja' }],
    materialOptions: [
      {
        id: 'tulip_laranja',
        label: 'Tulipa Laranja',
        ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'laranja' }],
      },
      {
        id: 'lily_laranja',
        label: 'Lírio-do-Vale Laranja',
        ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'laranja' }],
      },
    ],
  },
  {
    id: 'craft_dye_amarelo',
    resultItemId: 'dye_amarelo',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_sunflower', count: 1, flowerColor: 'amarelo' }],
    materialOptions: [
      {
        id: 'sunflower',
        label: 'Girassol',
        ingredients: [{ itemId: 'flower_sunflower', count: 1, flowerColor: 'amarelo' }],
      },
      {
        id: 'tulip_amarelo',
        label: 'Tulipa Amarela',
        ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'amarelo' }],
      },
      {
        id: 'lily_amarelo',
        label: 'Lírio-do-Vale Amarelo',
        ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'amarelo' }],
      },
    ],
  },
  {
    id: 'craft_dye_verde_lima',
    resultItemId: 'dye_verde_lima',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_verde', count: 1 },
      { itemId: 'dye_branco', count: 1 },
    ],
  },
  {
    id: 'craft_dye_verde',
    resultItemId: 'dye_verde',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'fiber', count: 1 }],
  },
  {
    id: 'craft_dye_ciano',
    resultItemId: 'dye_ciano',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_verde', count: 1 },
      { itemId: 'dye_azul', count: 1 },
    ],
  },
  {
    id: 'craft_dye_azul_claro',
    resultItemId: 'dye_azul_claro',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_azul', count: 1 },
      { itemId: 'dye_branco', count: 1 },
    ],
  },
  {
    id: 'craft_dye_azul',
    resultItemId: 'dye_azul',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'azul' }],
  },
  {
    id: 'craft_dye_roxo',
    resultItemId: 'dye_roxo',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'roxo' }],
    materialOptions: [
      {
        id: 'tulip_roxo',
        label: 'Tulipa Roxa',
        ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'roxo' }],
      },
      {
        id: 'lily_roxo',
        label: 'Lírio-do-Vale Roxo',
        ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'roxo' }],
      },
    ],
  },
  {
    id: 'craft_dye_magenta',
    resultItemId: 'dye_magenta',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'magenta' }],
  },
  {
    id: 'craft_dye_rosa',
    resultItemId: 'dye_rosa',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'rosa' }],
    materialOptions: [
      {
        id: 'lily_rosa',
        label: 'Lírio-do-Vale Rosa',
        ingredients: [{ itemId: 'flower_lily', count: 1, flowerColor: 'rosa' }],
      },
      {
        id: 'tulip_rosa',
        label: 'Tulipa Rosa',
        ingredients: [{ itemId: 'flower_tulip', count: 1, flowerColor: 'rosa' }],
      },
    ],
  },
  {
    id: 'craft_dye_marrom',
    resultItemId: 'dye_marrom',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_laranja', count: 1 },
      { itemId: 'dye_preto', count: 1 },
    ],
  },
  {
    id: 'craft_dye_bege',
    resultItemId: 'dye_bege',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'dye_marrom', count: 1 },
      { itemId: 'dye_branco', count: 1 },
    ],
  },

  // ==========================================================================
  // 3. FOGUEIRA (requiredStation: CAMPFIRE — Processamento Direto de 1 Item + Combustível)
  // ==========================================================================
  {
    id: 'campfire_charcoal',
    resultItemId: 'charcoal',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 6,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wood', count: 1 }],
  },
  {
    id: 'campfire_charcoal_hardwood',
    resultItemId: 'charcoal',
    resultCount: 2,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 7,
    rarity: RarityTier.RARE,
    ingredients: [{ itemId: 'hardwood', count: 1 }],
  },
  {
    id: 'cook_fish_tilapia',
    resultItemId: 'cooked_fish',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'fish_tilapia', count: 1 }],
  },
  {
    id: 'cook_fish_salmon',
    resultItemId: 'cooked_fish',
    resultCount: 2,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 6,
    rarity: RarityTier.RARE,
    ingredients: [{ itemId: 'fish_salmon', count: 1 }],
  },
  {
    id: 'bake_fresh_bread',
    resultItemId: 'fresh_bread',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 6,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wheat', count: 1 }],
  },
  {
    id: 'cook_lamb_campfire',
    resultItemId: 'cooked_lamb',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 6,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'raw_lamb', count: 1 }],
  },
  {
    id: 'cook_pork_campfire',
    resultItemId: 'cooked_pork',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 6,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'raw_pork', count: 1 }],
  },
  {
    id: 'cook_beef_campfire',
    resultItemId: 'cooked_beef',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    craftTimeSec: 6,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'raw_beef', count: 1 }],
  },

  // --- CULINÁRIA COMPOSTA, ELIXIRES & ALVENARIA (BANCADA DE TRABALHO) ---
  {
    id: 'cook_vegetable_stew',
    resultItemId: 'vegetable_stew',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'carrot', count: 2 },
      { itemId: 'wheat', count: 1 },
      { itemId: 'berry', count: 2 },
    ],
  },
  {
    id: 'cook_warrior_feast',
    resultItemId: 'warrior_feast',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'apple', count: 2 },
      { itemId: 'coconut', count: 2 },
      { itemId: 'ogre_hide', count: 1 },
    ],
  },
  {
    id: 'craft_coconut_elixir',
    resultItemId: 'coconut_elixir',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'coconut', count: 2 },
      { itemId: 'cactus_fruit', count: 2 },
    ],
  },
  {
    id: 'brew_healing_salve',
    resultItemId: 'healing_salve',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'berry', count: 3 },
      { itemId: 'cactus_fruit', count: 2 },
      { itemId: 'medic_herb', count: 1 },
    ],
  },
  {
    id: 'craft_herbal_poultice',
    resultItemId: 'herbal_poultice',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'medic_herb', count: 2 },
      { itemId: 'wool', count: 1 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'brew_shadow_elixir',
    resultItemId: 'shadow_elixir',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'dark_essence', count: 2 },
      { itemId: 'berry', count: 2 },
      { itemId: 'coconut', count: 1 },
    ],
  },
  {
    id: 'craft_taming_treat',
    resultItemId: 'taming_treat',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'berry', count: 2 },
      { itemId: 'apple', count: 1 },
      { itemId: 'coconut', count: 1 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_farm_feed',
    resultItemId: 'farm_feed',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wheat', count: 2 },
      { itemId: 'carrot', count: 1 },
      { itemId: 'berry', count: 1 },
    ],
  },
  {
    id: 'craft_brick_floor',
    resultItemId: 'brick_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 2 },
      { itemId: 'flint', count: 1 },
    ],
  },
  {
    id: 'craft_brick_wall',
    resultItemId: 'brick_wall',
    resultCount: 3,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 4 },
      { itemId: 'iron_bar', count: 1 },
      { itemId: 'flint', count: 1 },
    ],
  },
  {
    id: 'craft_stone_wall',
    resultItemId: 'stone_wall',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 5 },
      { itemId: 'iron_bar', count: 1 },
    ],
  },
  {
    id: 'craft_stone_window',
    resultItemId: 'stone_window',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 4 },
      { itemId: 'glass', count: 1 },
    ],
  },
  {
    id: 'craft_fire_bomb',
    resultItemId: 'fire_bomb',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'flint', count: 2 },
      { itemId: 'iron_ore', count: 1 },
      { itemId: 'charcoal', count: 2 },
    ],
  },

  // ==========================================================================
  // 4. FORNALHA (requiredStation: FURNACE — Processamento Direto de 1 Item + Combustível)
  // ==========================================================================
  {
    id: 'smelt_charcoal_wood',
    resultItemId: 'charcoal',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wood', count: 1 }],
  },
  {
    id: 'smelt_charcoal_hardwood',
    resultItemId: 'charcoal',
    resultCount: 3,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 7,
    rarity: RarityTier.RARE,
    ingredients: [{ itemId: 'hardwood', count: 1 }],
  },
  {
    id: 'smelt_glass',
    resultItemId: 'glass',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 6,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'sand', count: 1 }],
  },
  {
    id: 'smelt_iron_bar',
    resultItemId: 'iron_bar',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 8,
    rarity: RarityTier.RARE,
    ingredients: [{ itemId: 'iron_ore', count: 1 }],
  },
  {
    id: 'smelt_gold_bar',
    resultItemId: 'gold_bar',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 10,
    rarity: RarityTier.RARE,
    ingredients: [{ itemId: 'gold_ore', count: 1 }],
  },
  {
    id: 'cook_lamb_furnace',
    resultItemId: 'cooked_lamb',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'raw_lamb', count: 1 }],
  },
  {
    id: 'cook_pork_furnace',
    resultItemId: 'cooked_pork',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'raw_pork', count: 1 }],
  },
  {
    id: 'cook_beef_furnace',
    resultItemId: 'cooked_beef',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'raw_beef', count: 1 }],
  },
  {
    id: 'cook_fish_tilapia_furnace',
    resultItemId: 'cooked_fish',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'fish_tilapia', count: 1 }],
  },
  {
    id: 'cook_fish_salmon_furnace',
    resultItemId: 'cooked_fish',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.RARE,
    ingredients: [{ itemId: 'fish_salmon', count: 1 }],
  },
  {
    id: 'bake_fresh_bread_furnace',
    resultItemId: 'fresh_bread',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    craftTimeSec: 5,
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'wheat', count: 1 }],
  },

  // ==========================================================================
  // 5. EQUIPAMENTOS DE OURO & RELÍQUIAS RARAS (requiredStation: WORKBENCH)
  // ==========================================================================
  {
    id: 'craft_recall_crystal',
    resultItemId: 'recall_crystal',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'gold_bar', count: 2 },
      { itemId: 'dark_essence', count: 2 },
    ],
  },
  {
    id: 'craft_primordial_ambrosia',
    resultItemId: 'primordial_ambrosia',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'primordial_essence', count: 2 },
      { itemId: 'abyssal_pearl', count: 1 },
      { itemId: 'apple', count: 3 },
      { itemId: 'coconut', count: 2 },
    ],
  },
  {
    id: 'craft_primordial_axe',
    resultItemId: 'primordial_axe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'primordial_essence', count: 3 },
      { itemId: 'hardwood', count: 5 },
      { itemId: 'gold_bar', count: 3 },
    ],
  },
  {
    id: 'craft_primordial_pickaxe',
    resultItemId: 'primordial_pickaxe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'gold_bar', count: 3 },
    ],
  },
  {
    id: 'craft_abyssal_trident',
    resultItemId: 'abyssal_trident',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 3 },
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'hardwood', count: 3 },
      { itemId: 'coconut', count: 2 },
    ],
  },
  {
    id: 'craft_astral_sword',
    resultItemId: 'astral_sword',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'primordial_essence', count: 2 },
      { itemId: 'iron_bar', count: 5 },
      { itemId: 'gold_bar', count: 3 },
    ],
  },
  {
    id: 'craft_astral_crown',
    resultItemId: 'astral_crown',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 1 },
      { itemId: 'gold_bar', count: 2 },
    ],
  },
  {
    id: 'craft_astral_armor',
    resultItemId: 'astral_armor',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'ogre_hide', count: 3 },
      { itemId: 'dark_essence', count: 3 },
      { itemId: 'gold_bar', count: 3 },
    ],
  },
  {
    id: 'craft_astral_leggings',
    resultItemId: 'astral_leggings',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'ogre_hide', count: 2 },
      { itemId: 'gold_bar', count: 2 },
    ],
  },
  {
    id: 'craft_astral_boots',
    resultItemId: 'astral_boots',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'dark_essence', count: 2 },
      { itemId: 'wool', count: 2 },
      { itemId: 'gold_bar', count: 2 },
    ],
  },
  {
    id: 'craft_guardian_totem',
    resultItemId: 'guardian_totem',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'primordial_essence', count: 2 },
      { itemId: 'gold_bar', count: 4 },
      { itemId: 'hardwood', count: 4 },
    ],
  },
  {
    id: 'craft_peace_treaty',
    resultItemId: 'peace_treaty',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    craftTimeSec: 0,
    rarity: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'royal_wax_seal', count: 1 },
      { itemId: 'gold_coin', count: 5 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'gold_bar', count: 2 },
      { itemId: 'spider_silk', count: 2 },
      { itemId: 'wool', count: 2 },
    ],
  },

  // ==========================================================================
  // 6. MESA DE TECELAGEM (requiredStation: WEAVING_TABLE — Confecção de Roupas)
  // Categorias: Cabeça, Superior, Inferior, Pés (Com tempo de confecção)
  // ==========================================================================
  // --- CABEÇA ---
  {
    id: 'weave_fiber_hat',
    resultItemId: 'fiber_hat',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 180, // 3 min
    rarity: RarityTier.BASIC,
    ingredients: [{ itemId: 'fiber', count: 12 }],
  },
  {
    id: 'weave_leather_hat',
    resultItemId: 'leather_hat',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 360, // 6 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'leather', count: 6 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'weave_solar_necklace',
    resultItemId: 'solar_necklace',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 300, // 5 min
    rarity: RarityTier.RARE,
    ingredients: [
      { itemId: 'fiber', count: 3 },
      { itemId: 'gold_bar', count: 2 },
    ],
  },
  {
    id: 'weave_blacksmith_bandana',
    resultItemId: 'blacksmith_bandana',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 180, // 3 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 4 },
      { itemId: 'leather', count: 2 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'weave_merchant_cap',
    resultItemId: 'merchant_cap',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 240, // 4 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 6 },
      { itemId: 'feather', count: 2 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'weave_elder_mitre',
    resultItemId: 'elder_mitre',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 240, // 4 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 6 },
      { itemId: 'fiber', count: 4 },
      { itemId: 'gold_coin', count: 2 },
    ],
  },
  {
    id: 'weave_wanderer_hood',
    resultItemId: 'wanderer_hood',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 210, // 3.5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 5 },
      { itemId: 'leather', count: 2 },
      { itemId: 'fiber', count: 4 },
    ],
  },

  // --- SUPERIOR ---
  {
    id: 'weave_tank_top',
    resultItemId: 'white_tank_top',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 120, // 2 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 4 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'weave_sweater',
    resultItemId: 'sweater',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 240, // 4 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 8 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'weave_short_dress',
    resultItemId: 'short_dress',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 240, // 4 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 7 },
      { itemId: 'fiber', count: 5 },
    ],
  },
  {
    id: 'weave_long_dress',
    resultItemId: 'long_dress',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 300, // 5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 10 },
      { itemId: 'fiber', count: 6 },
    ],
  },
  {
    id: 'weave_blacksmith_apron',
    resultItemId: 'blacksmith_apron',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 270, // 4.5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'leather', count: 6 },
      { itemId: 'wool', count: 5 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'weave_merchant_doublet',
    resultItemId: 'merchant_doublet',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 300, // 5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 9 },
      { itemId: 'leather', count: 2 },
      { itemId: 'fiber', count: 5 },
    ],
  },
  {
    id: 'weave_elder_robe',
    resultItemId: 'elder_robe',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 330, // 5.5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 11 },
      { itemId: 'fiber', count: 6 },
      { itemId: 'gold_coin', count: 2 },
    ],
  },
  {
    id: 'weave_wanderer_poncho',
    resultItemId: 'wanderer_poncho',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 270, // 4.5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 8 },
      { itemId: 'leather', count: 3 },
      { itemId: 'fiber', count: 4 },
    ],
  },

  // --- INFERIOR ---
  {
    id: 'weave_shorts',
    resultItemId: 'shorts',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 120, // 2 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 4 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'weave_pants',
    resultItemId: 'pants',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 180, // 3 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 6 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'weave_overalls',
    resultItemId: 'overalls',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 300, // 5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 8 },
      { itemId: 'fiber', count: 4 },
      { itemId: 'leather', count: 2 },
    ],
  },
  {
    id: 'weave_merchant_slacks',
    resultItemId: 'merchant_slacks',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 210, // 3.5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 7 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'weave_wanderer_leggings',
    resultItemId: 'wanderer_leggings',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 210, // 3.5 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 5 },
      { itemId: 'leather', count: 3 },
      { itemId: 'fiber', count: 3 },
    ],
  },

  // --- PÉS ---
  {
    id: 'weave_sandals',
    resultItemId: 'sandals',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 120, // 2 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'leather', count: 3 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'weave_cowboy_boots',
    resultItemId: 'cowboy_boots',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 240, // 4 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'leather', count: 5 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'weave_blacksmith_boots',
    resultItemId: 'blacksmith_boots',
    resultCount: 1,
    requiredStation: PlaceableType.WEAVING_TABLE,
    craftTimeSec: 240, // 4 min
    rarity: RarityTier.BASIC,
    ingredients: [
      { itemId: 'leather', count: 6 },
      { itemId: 'fiber', count: 3 },
    ],
  },
];

export const WOOD_ITEM_IDS = [
  'wood',
  'dark_oak_wood',
  'pine_wood',
  'palm_wood',
] as const;

export function isCommonWoodItem(itemId: string): boolean {
  return (
    itemId === 'wood' ||
    itemId === 'dark_oak_wood' ||
    itemId === 'pine_wood' ||
    itemId === 'palm_wood'
  );
}

// Em todas as receitas que precisam de madeira genérica ('wood'), permite ao jogador escolher qual madeira usar:
// Madeira de Carvalho, Madeira de Carvalho Escuro, Madeira de Pinheiro ou Madeira de Coqueiro.
// (Exceto paredes, janelas, pisos e portas de madeira, que possuem variantes próprias para cada tipo de madeira).
const WOOD_VARIANT_SPECIFIC_RECIPES = new Set([
  'craft_wood_floor',
  'craft_wood_wall',
  'craft_wood_window',
  'craft_wood_door',
]);

for (const recipe of RECIPES) {
  if (
    !recipe.materialOptions &&
    !WOOD_VARIANT_SPECIFIC_RECIPES.has(recipe.id) &&
    recipe.ingredients.some((ing) => ing.itemId === 'wood')
  ) {
    recipe.materialOptions = [
      {
        id: 'wood_oak',
        label: 'Madeira de Carvalho',
        iconItemId: 'wood',
        ingredients: recipe.ingredients.map((ing) =>
          ing.itemId === 'wood' ? { ...ing, itemId: 'wood' } : { ...ing }
        ),
      },
      {
        id: 'wood_dark_oak',
        label: 'Madeira de Carvalho Escuro',
        iconItemId: 'dark_oak_wood',
        ingredients: recipe.ingredients.map((ing) =>
          ing.itemId === 'wood'
            ? { ...ing, itemId: 'dark_oak_wood' }
            : { ...ing }
        ),
      },
      {
        id: 'wood_pine',
        label: 'Madeira de Pinheiro',
        iconItemId: 'pine_wood',
        ingredients: recipe.ingredients.map((ing) =>
          ing.itemId === 'wood' ? { ...ing, itemId: 'pine_wood' } : { ...ing }
        ),
      },
      {
        id: 'wood_palm',
        label: 'Madeira de Coqueiro',
        iconItemId: 'palm_wood',
        ingredients: recipe.ingredients.map((ing) =>
          ing.itemId === 'wood' ? { ...ing, itemId: 'palm_wood' } : { ...ing }
        ),
      },
    ];
  }
}


