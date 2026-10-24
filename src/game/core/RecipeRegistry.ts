import { ITEMS } from './ItemRegistry';
import { PlaceableType, RarityTier } from './types';

export interface CraftingRecipe {
  id: string;
  resultItemId: string;
  resultCount: number;
  requiredStation: PlaceableType | null; // null = Hand craftable anywhere
  tier: RarityTier;
  ingredients: { itemId: string; count: number }[];
}

export const RECIPES: CraftingRecipe[] = [
  // =========================================================================
  // TIER 0: HAND CRAFTING (MÃO LIVRE — SEM ESTAÇÃO)
  // =========================================================================
  {
    id: 'craft_workbench',
    resultItemId: 'workbench',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_campfire',
    resultItemId: 'campfire',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'stone', count: 4 },
    ],
  },
  {
    id: 'craft_stone_axe',
    resultItemId: 'stone_axe',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
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
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'stone', count: 4 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_wood_sword',
    resultItemId: 'wood_sword',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'flint', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_wool_bandage',
    resultItemId: 'wool_bandage',
    resultCount: 2,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wool', count: 1 },
      { itemId: 'fiber', count: 2 },
      { itemId: 'berry', count: 2 },
    ],
  },
  {
    id: 'craft_torch',
    resultItemId: 'torch',
    resultCount: 2,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 2 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_chest_hand',
    resultItemId: 'chest',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'stone', count: 2 },
    ],
  },

  // =========================================================================
  // TIER 1: WORKBENCH RECIPES (BANCADA DE ARTESÃO)
  // =========================================================================
  {
    id: 'craft_flint_spear',
    resultItemId: 'flint_spear',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'flint', count: 4 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_ogre_club',
    resultItemId: 'ogre_club',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'hardwood', count: 4 },
      { itemId: 'ogre_hide', count: 2 },
      { itemId: 'stone', count: 6 },
    ],
  },
  {
    id: 'craft_leather_hood',
    resultItemId: 'leather_hood',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
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
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'fiber', count: 5 },
      { itemId: 'wool', count: 3 },
    ],
  },
  {
    id: 'craft_leather_pants',
    resultItemId: 'leather_pants',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'fiber', count: 4 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_leather_boots',
    resultItemId: 'leather_boots',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'fiber', count: 3 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_taming_treat',
    resultItemId: 'taming_treat',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'berry', count: 2 },
      { itemId: 'apple', count: 1 },
      { itemId: 'coconut', count: 1 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_coconut_elixir',
    resultItemId: 'coconut_elixir',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'coconut', count: 2 },
      { itemId: 'cactus_fruit', count: 2 },
    ],
  },
  {
    id: 'craft_wood_bridge',
    resultItemId: 'wood_bridge',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_spike_trap',
    resultItemId: 'spike_trap',
    resultCount: 3,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'flint', count: 3 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_explorer_tent',
    resultItemId: 'explorer_tent',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'wool', count: 4 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'hardwood', count: 3 },
      { itemId: 'fiber', count: 4 },
    ],
  },
  {
    id: 'craft_wood_wall',
    resultItemId: 'wood_wall',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [{ itemId: 'wood', count: 5 }],
  },
  {
    id: 'craft_wood_floor',
    resultItemId: 'wood_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [{ itemId: 'wood', count: 3 }],
  },
  {
    id: 'craft_stone_floor',
    resultItemId: 'stone_floor',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'stone', count: 4 },
      { itemId: 'flint', count: 1 },
    ],
  },
  {
    id: 'craft_furnace',
    resultItemId: 'furnace',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 10 },
      { itemId: 'flint', count: 4 },
    ],
  },
  {
    id: 'craft_chest',
    resultItemId: 'chest',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 6 },
      { itemId: 'stone', count: 2 },
    ],
  },

  // =========================================================================
  // TIER 2: FURNACE RECIPES (FORNALHA DE FUNDIÇÃO)
  // =========================================================================
  {
    id: 'craft_iron_bar',
    resultItemId: 'iron_bar',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_ore', count: 2 },
      { itemId: 'wood', count: 1 },
    ],
  },
  {
    id: 'craft_iron_axe',
    resultItemId: 'iron_axe',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_iron_pickaxe',
    resultItemId: 'iron_pickaxe',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'fiber', count: 3 },
    ],
  },
  {
    id: 'craft_iron_sword',
    resultItemId: 'iron_sword',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'hardwood', count: 2 },
      { itemId: 'solar_crystal', count: 1 },
    ],
  },
  {
    id: 'craft_shadow_blade',
    resultItemId: 'shadow_blade',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'dark_essence', count: 4 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'hardwood', count: 2 },
    ],
  },
  {
    id: 'craft_iron_helmet',
    resultItemId: 'iron_helmet',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'wool', count: 1 },
    ],
  },
  {
    id: 'craft_iron_armor',
    resultItemId: 'iron_armor',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 5 },
      { itemId: 'ogre_hide', count: 2 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_iron_greaves',
    resultItemId: 'iron_greaves',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
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
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'ogre_hide', count: 1 },
      { itemId: 'wool', count: 1 },
    ],
  },
  {
    id: 'craft_warrior_feast',
    resultItemId: 'warrior_feast',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'apple', count: 2 },
      { itemId: 'coconut', count: 2 },
      { itemId: 'ogre_hide', count: 1 },
    ],
  },
  {
    id: 'craft_shadow_elixir',
    resultItemId: 'shadow_elixir',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'dark_essence', count: 2 },
      { itemId: 'berry', count: 2 },
      { itemId: 'cactus_fruit', count: 1 },
    ],
  },
  {
    id: 'craft_fire_bomb',
    resultItemId: 'fire_bomb',
    resultCount: 3,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'flint', count: 3 },
      { itemId: 'iron_ore', count: 1 },
      { itemId: 'solar_crystal', count: 1 },
    ],
  },
  {
    id: 'craft_healing_salve',
    resultItemId: 'healing_salve',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'cactus_fruit', count: 2 },
      { itemId: 'berry', count: 2 },
      { itemId: 'solar_crystal', count: 1 },
    ],
  },
  {
    id: 'craft_stone_wall',
    resultItemId: 'stone_wall',
    resultCount: 4,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 6 },
      { itemId: 'iron_bar', count: 1 },
    ],
  },
  {
    id: 'craft_solar_altar',
    resultItemId: 'solar_altar',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'solar_crystal', count: 4 },
      { itemId: 'hardwood', count: 4 },
    ],
  },

  // =========================================================================
  // TIER 3: SOLAR ALTAR RECIPES (ALTAR ALQUÍMICO SOLAR — MUITO RARO)
  // =========================================================================
  {
    id: 'craft_astral_sword',
    resultItemId: 'astral_sword',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 3 },
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'primordial_essence', count: 2 },
      { itemId: 'iron_bar', count: 5 },
    ],
  },
  {
    id: 'craft_abyssal_trident',
    resultItemId: 'abyssal_trident',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 3 },
      { itemId: 'iron_bar', count: 4 },
      { itemId: 'hardwood', count: 3 },
      { itemId: 'coconut', count: 2 },
    ],
  },
  {
    id: 'craft_primordial_axe',
    resultItemId: 'primordial_axe',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'primordial_essence', count: 3 },
      { itemId: 'hardwood', count: 5 },
      { itemId: 'solar_crystal', count: 3 },
    ],
  },
  {
    id: 'craft_primordial_pickaxe',
    resultItemId: 'primordial_pickaxe',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 3 },
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'iron_bar', count: 4 },
    ],
  },
  {
    id: 'craft_astral_crown',
    resultItemId: 'astral_crown',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 2 },
      { itemId: 'abyssal_pearl', count: 1 },
      { itemId: 'solar_crystal', count: 2 },
    ],
  },
  {
    id: 'craft_astral_armor',
    resultItemId: 'astral_armor',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 3 },
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'ogre_hide', count: 3 },
      { itemId: 'dark_essence', count: 3 },
    ],
  },
  {
    id: 'craft_astral_leggings',
    resultItemId: 'astral_leggings',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 2 },
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'ogre_hide', count: 2 },
    ],
  },
  {
    id: 'craft_astral_boots',
    resultItemId: 'astral_boots',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 2 },
      { itemId: 'dark_essence', count: 2 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_primordial_ambrosia',
    resultItemId: 'primordial_ambrosia',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'primordial_essence', count: 2 },
      { itemId: 'abyssal_pearl', count: 1 },
      { itemId: 'apple', count: 3 },
      { itemId: 'coconut', count: 2 },
    ],
  },
  {
    id: 'craft_recall_crystal',
    resultItemId: 'recall_crystal',
    resultCount: 2,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'astral_shard', count: 1 },
      { itemId: 'solar_crystal', count: 2 },
      { itemId: 'dark_essence', count: 2 },
    ],
  },
  {
    id: 'craft_healing_fountain',
    resultItemId: 'healing_fountain',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'abyssal_pearl', count: 2 },
      { itemId: 'primordial_essence', count: 1 },
      { itemId: 'stone', count: 10 },
      { itemId: 'solar_crystal', count: 2 },
    ],
  },
  {
    id: 'craft_guardian_totem',
    resultItemId: 'guardian_totem',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'primordial_essence', count: 2 },
      { itemId: 'astral_shard', count: 2 },
      { itemId: 'solar_crystal', count: 4 },
      { itemId: 'hardwood', count: 4 },
    ],
  },
  // Alchemical Transmutation: lets players convert surplus Dark Essence + Solar Crystal into Astral Shard!
  {
    id: 'transmute_astral_shard',
    resultItemId: 'astral_shard',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'dark_essence', count: 4 },
      { itemId: 'solar_crystal', count: 3 },
    ],
  },
  // === VILLAGE & COMPLEX MOB RECIPES ===
  {
    id: 'craft_scorpion_dagger',
    resultItemId: 'scorpion_dagger',
    resultCount: 1,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'scorpion_stinger', count: 2 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'spider_silk', count: 3 },
    ],
  },
  {
    id: 'craft_market_stall',
    resultItemId: 'market_stall',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'wood', count: 8 },
      { itemId: 'spider_silk', count: 3 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_village_well',
    resultItemId: 'village_well',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 10 },
      { itemId: 'wood', count: 4 },
      { itemId: 'golem_core', count: 1 },
    ],
  },
  {
    id: 'craft_village_house',
    resultItemId: 'village_house',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'wood', count: 10 },
      { itemId: 'stone', count: 6 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_royal_banner',
    resultItemId: 'royal_banner',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'hardwood', count: 2 },
      { itemId: 'spider_silk', count: 2 },
      { itemId: 'gold_coin', count: 1 },
    ],
  },
  // === NEW ARCHITECTURAL & BUILDING SYSTEM RECIPES ===
  {
    id: 'craft_wood_door',
    resultItemId: 'wood_door',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 5 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_wood_fence',
    resultItemId: 'wood_fence',
    resultCount: 6,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 4 },
      { itemId: 'fiber', count: 1 },
    ],
  },
  {
    id: 'craft_wood_window',
    resultItemId: 'wood_window',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 5 },
      { itemId: 'flint', count: 1 },
    ],
  },
  {
    id: 'craft_royal_carpet',
    resultItemId: 'royal_carpet',
    resultCount: 4,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'wool', count: 2 },
      { itemId: 'fiber', count: 2 },
      { itemId: 'berry', count: 2 },
    ],
  },
  {
    id: 'craft_iron_gate',
    resultItemId: 'iron_gate',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 2 },
      { itemId: 'stone', count: 4 },
    ],
  },
  {
    id: 'craft_stone_window',
    resultItemId: 'stone_window',
    resultCount: 4,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 6 },
      { itemId: 'solar_crystal', count: 1 },
    ],
  },
  {
    id: 'craft_brick_floor',
    resultItemId: 'brick_floor',
    resultCount: 6,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 5 },
      { itemId: 'flint', count: 2 },
      { itemId: 'wood', count: 1 },
    ],
  },
  {
    id: 'craft_brick_wall',
    resultItemId: 'brick_wall',
    resultCount: 4,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'stone', count: 6 },
      { itemId: 'iron_bar', count: 1 },
      { itemId: 'hardwood', count: 1 },
    ],
  },
  {
    id: 'craft_iron_lantern',
    resultItemId: 'iron_lantern',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'iron_bar', count: 1 },
      { itemId: 'solar_crystal', count: 1 },
    ],
  },

  // =========================================================================
  // AGRICULTURE: TOOLS, IRRIGATION, SEEDS & FARM PRODUCE DISHES
  // =========================================================================
  {
    id: 'craft_stone_hoe',
    resultItemId: 'stone_hoe',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'stone', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_watering_can',
    resultItemId: 'watering_can',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wood', count: 3 },
      { itemId: 'stone', count: 2 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_bone_fertilizer',
    resultItemId: 'bone_fertilizer',
    resultCount: 2,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'fiber', count: 3 },
      { itemId: 'wood', count: 1 },
    ],
  },
  {
    id: 'craft_farm_feed',
    resultItemId: 'farm_feed',
    resultCount: 2,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wheat', count: 2 },
      { itemId: 'carrot', count: 1 },
    ],
  },
  {
    id: 'craft_wheat_seeds',
    resultItemId: 'wheat_seeds',
    resultCount: 2,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wheat', count: 1 },
    ],
  },
  {
    id: 'craft_berry_seeds',
    resultItemId: 'berry_seeds',
    resultCount: 1,
    requiredStation: null,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'berry', count: 2 },
    ],
  },
  {
    id: 'craft_iron_hoe',
    resultItemId: 'iron_hoe',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'hardwood', count: 2 },
      { itemId: 'iron_bar', count: 2 },
    ],
  },
  {
    id: 'craft_herbal_poultice',
    resultItemId: 'herbal_poultice',
    resultCount: 2,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.RARE,
    ingredients: [
      { itemId: 'medic_herb', count: 2 },
      { itemId: 'wool', count: 1 },
      { itemId: 'fiber', count: 2 },
    ],
  },
  {
    id: 'craft_fresh_bread',
    resultItemId: 'fresh_bread',
    resultCount: 2,
    requiredStation: PlaceableType.CAMPFIRE,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wheat', count: 3 },
    ],
  },
  {
    id: 'craft_fresh_bread_furnace',
    resultItemId: 'fresh_bread',
    resultCount: 2,
    requiredStation: PlaceableType.FURNACE,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'wheat', count: 3 },
    ],
  },
  {
    id: 'craft_vegetable_stew',
    resultItemId: 'vegetable_stew',
    resultCount: 1,
    requiredStation: PlaceableType.CAMPFIRE,
    tier: RarityTier.BASIC,
    ingredients: [
      { itemId: 'carrot', count: 2 },
      { itemId: 'wheat', count: 1 },
      { itemId: 'berry', count: 2 },
    ],
  },
  // === DIPLOMACY & PEACE ITEM (Requires villager-exclusive royal_wax_seal + rare materials) ===
  {
    id: 'craft_peace_treaty_workbench',
    resultItemId: 'peace_treaty',
    resultCount: 1,
    requiredStation: PlaceableType.WORKBENCH,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'royal_wax_seal', count: 1 },
      { itemId: 'gold_coin', count: 5 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'solar_crystal', count: 2 },
      { itemId: 'spider_silk', count: 2 },
      { itemId: 'wool', count: 2 },
    ],
  },
  {
    id: 'craft_peace_treaty_altar',
    resultItemId: 'peace_treaty',
    resultCount: 1,
    requiredStation: PlaceableType.SOLAR_ALTAR,
    tier: RarityTier.VERY_RARE,
    ingredients: [
      { itemId: 'royal_wax_seal', count: 1 },
      { itemId: 'gold_coin', count: 5 },
      { itemId: 'iron_bar', count: 3 },
      { itemId: 'solar_crystal', count: 2 },
      { itemId: 'spider_silk', count: 2 },
      { itemId: 'wool', count: 2 },
    ],
  },
];

/**
 * Returns all recipes where the given itemId is used as an ingredient,
 * so the UI can show the exact crafting utility of every item in the game!
 */
export function getRecipesUsingIngredient(itemId: string): {
  recipe: CraftingRecipe;
  resultName: string;
}[] {
  return RECIPES.filter((r) =>
    r.ingredients.some((ing) => ing.itemId === itemId)
  ).map((recipe) => ({
    recipe,
    resultName: ITEMS[recipe.resultItemId]?.name || recipe.resultItemId,
  }));
}
