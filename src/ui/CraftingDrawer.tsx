import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Backpack,
  Flame,
  Hammer,
  Hand,
  Layers,
  Shield,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {
  CONSTRUCTION_BLUEPRINTS,
  getItemBasePrice,
  ITEMS,
} from '../game/core/ItemRegistry';
import {
  CraftingRecipe,
  getRecipesUsingIngredient,
  RECIPES,
} from '../game/core/RecipeRegistry';
import {
  EquipmentSlot,
  HOTBAR_SIZE,
  ItemCategory,
  ItemDefinition,
  PlaceableType,
  PlayerState,
  RarityTier,
  TOTAL_INVENTORY_SIZE,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';

interface CraftingDrawerProps {
  engine: GameEngine;
  player: PlayerState;
  stationContext: PlaceableType | null;
  initialTab?: 'craft' | 'inventory';
  onClose: () => void;
}

export const CraftingDrawer: React.FC<CraftingDrawerProps> = ({
  engine,
  player,
  stationContext,
  initialTab = 'craft',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'craft' | 'inventory'>(initialTab);
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | 'TOOLS' | 'BUILD' | 'SURVIVAL'
  >('ALL');
  const [includeHandRecipesInStation, setIncludeHandRecipesInStation] =
    useState(false);

  const availableRecipes = RECIPES.filter((r) => {
    if (stationContext === null) {
      if (r.requiredStation !== null) return false;
    } else {
      if (includeHandRecipesInStation) {
        if (r.requiredStation !== stationContext && r.requiredStation !== null) {
          return false;
        }
      } else {
        if (r.requiredStation !== stationContext) return false;
      }
    }

    const out = ITEMS[r.resultItemId];
    if (!out) return false;
    if (categoryFilter === 'TOOLS') {
      return (
        out.category === ItemCategory.TOOL ||
        out.category === ItemCategory.WEAPON
      );
    }
    if (categoryFilter === 'BUILD') {
      return out.category === ItemCategory.PLACEABLE;
    }
    if (categoryFilter === 'SURVIVAL') {
      return (
        out.category === ItemCategory.CONSUMABLE ||
        out.category === ItemCategory.ARMOR ||
        out.category === ItemCategory.RESOURCE
      );
    }
    return true;
  });

  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(
    () => availableRecipes[0]?.id || RECIPES[0].id
  );
  const [selectedInvIndex, setSelectedInvIndex] = useState<number>(
    player.selectedHotbarIndex
  );

  useEffect(() => {
    if (
      availableRecipes.length > 0 &&
      !availableRecipes.some((r) => r.id === selectedRecipeId)
    ) {
      setSelectedRecipeId(availableRecipes[0].id);
    }
  }, [stationContext, categoryFilter, includeHandRecipesInStation]);

  const selectedRecipe: CraftingRecipe | undefined =
    availableRecipes.find((r) => r.id === selectedRecipeId) ||
    availableRecipes[0];
  const selectedRecipeItem: ItemDefinition | undefined = selectedRecipe
    ? ITEMS[selectedRecipe.resultItemId]
    : undefined;

  const selectedSlot = player.inventory[selectedInvIndex] || null;
  const selectedSlotItem = selectedSlot ? ITEMS[selectedSlot.itemId] : null;
  const usedInRecipes = selectedSlotItem
    ? getRecipesUsingIngredient(selectedSlotItem.id)
    : [];

  const stationTitle = () => {
    if (!stationContext) return 'Criação à Mão Livre';
    switch (stationContext) {
      case PlaceableType.WORKBENCH:
        return 'Bancada de Artesão';
      case PlaceableType.FURNACE:
        return 'Fornalha de Fundição';
      case PlaceableType.SOLAR_ALTAR:
        return 'Altar Alquímico Solar';
      default:
        return 'Estação de Criação';
    }
  };

  const stationShortName = (st: PlaceableType | null) => {
    if (!st) return 'Mão Livre';
    if (st === PlaceableType.WORKBENCH) return 'Bancada';
    if (st === PlaceableType.FURNACE) return 'Fornalha';
    if (st === PlaceableType.SOLAR_ALTAR) return 'Altar Solar';
    return 'Estação';
  };

  const rarityBadge = (r: RarityTier) => {
    switch (r) {
      case RarityTier.BASIC:
        return { text: 'Comum', color: 'text-[#c4ab7d]' };
      case RarityTier.RARE:
        return { text: 'Raro', color: 'text-amber-400' };
      case RarityTier.VERY_RARE:
        return { text: 'Muito Raro', color: 'text-sky-300' };
    }
  };

  const categoryName = (c: ItemCategory) => {
    switch (c) {
      case ItemCategory.RESOURCE:
        return 'Recurso';
      case ItemCategory.TOOL:
        return 'Ferramenta';
      case ItemCategory.WEAPON:
        return 'Arma';
      case ItemCategory.CONSUMABLE:
        return 'Consumível / Usável';
      case ItemCategory.PLACEABLE:
        return 'Construção';
      case ItemCategory.ARMOR:
        return 'Armadura';
    }
  };

  const handleInventorySlotClick = (idx: number) => {
    if (selectedInvIndex === idx) return;
    const currentSlot = player.inventory[selectedInvIndex];
    const targetSlot = player.inventory[idx];

    if (currentSlot && targetSlot === null) {
      engine.swapInventorySlots(selectedInvIndex, idx);
      setSelectedInvIndex(idx);
    } else {
      setSelectedInvIndex(idx);
    }
  };

  const handleSwapWithHotbarActive = () => {
    if (selectedInvIndex === player.selectedHotbarIndex) return;
    engine.swapInventorySlots(selectedInvIndex, player.selectedHotbarIndex);
    setSelectedInvIndex(player.selectedHotbarIndex);
  };

  const playerPreviewUrl = (() => {
    const c = spriteAtlas.getPlayerSprite('down', 0, player);
    return c.toDataURL();
  })();

  const equipSlotLabel = (slot?: EquipmentSlot) => {
    if (slot === 'head') return 'Cabeça';
    if (slot === 'body') return 'Parte Superior';
    if (slot === 'legs') return 'Parte Inferior';
    if (slot === 'feet') return 'Pés';
    return 'Parte Superior';
  };

  const maxCraftCount = selectedRecipe
    ? engine.getMaxCraftableCount(selectedRecipe)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3">
      <div className="w-full max-w-4xl medieval-panel flex flex-col max-h-[95dvh] overflow-hidden">
        {/* COMPACT HORIZONTAL HEADER BAR */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#1a110b] border-b-2 border-[#4a301e]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('craft')}
              className={`min-h-[36px] px-3 py-1 text-xs font-pixel font-bold flex items-center gap-1.5 ${
                activeTab === 'craft'
                  ? 'medieval-btn-gold'
                  : 'medieval-btn-wood'
              }`}
            >
              {stationContext === PlaceableType.FURNACE ? (
                <Flame className="w-3.5 h-3.5" />
              ) : stationContext === PlaceableType.SOLAR_ALTAR ? (
                <Sparkles className="w-3.5 h-3.5" />
              ) : stationContext === PlaceableType.WORKBENCH ? (
                <Hammer className="w-3.5 h-3.5" />
              ) : (
                <Hand className="w-3.5 h-3.5" />
              )}
              <span>{stationTitle()}</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`min-h-[36px] px-3 py-1 text-xs font-pixel font-bold flex items-center gap-1.5 ${
                activeTab === 'inventory'
                  ? 'medieval-btn-gold'
                  : 'medieval-btn-wood'
              }`}
            >
              <Backpack className="w-3.5 h-3.5" />
              <span>Inventário ({TOTAL_INVENTORY_SIZE})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'craft' && stationContext !== null && (
              <button
                onClick={() => setIncludeHandRecipesInStation((v) => !v)}
                className={`min-h-[34px] px-2.5 py-1 text-[10px] font-bold hidden sm:inline-flex items-center ${
                  includeHandRecipesInStation
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood'
                }`}
              >
                {includeHandRecipesInStation
                  ? '+ Mão Livre Ativo'
                  : 'Incluir Mão Livre'}
              </button>
            )}

            <button
              onClick={onClose}
              className="min-h-[36px] min-w-[36px] medieval-btn-crimson flex items-center justify-center"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: HORIZONTAL WIDESCREEN MODULAR CRAFTING (sm:grid-cols-12)   */}
        {/* ================================================================= */}
        {activeTab === 'craft' ? (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {/* LEFT COLUMN (5 cols on horizontal mobile): Category Tabs + Recipe Book Grid */}
            <div className="sm:col-span-5 medieval-inset p-2.5 space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'TOOLS', label: 'Armas/Ferr.' },
                    { id: 'BUILD', label: 'Construção' },
                    { id: 'SURVIVAL', label: 'Suprimentos' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`min-h-[30px] px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                      categoryFilter === cat.id
                        ? 'medieval-btn-gold'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-5 gap-1.5 max-h-[210px] sm:max-h-[250px] overflow-y-auto pr-0.5">
                {availableRecipes.map((recipe) => {
                  const outDef = ITEMS[recipe.resultItemId];
                  if (!outDef) return null;
                  const craftable = engine.getMaxCraftableCount(recipe) > 0;
                  const isSelected = selectedRecipe?.id === recipe.id;

                  return (
                    <button
                      key={recipe.id}
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      className={`relative aspect-square min-h-[44px] flex flex-col items-center justify-center p-1 ${
                        isSelected ? 'mc-slot-active' : 'mc-slot'
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-1.5 h-1.5 ${
                          craftable ? 'bg-emerald-400' : 'bg-rose-500/70'
                        }`}
                      />
                      <img
                        src={spriteAtlas.getItemIconUrl(outDef.id)}
                        alt={outDef.name}
                        className="w-6 h-6 sm:w-7 sm:h-7 pixelated"
                      />
                      {recipe.resultCount > 1 && (
                        <span className="absolute bottom-0.5 right-1 text-[9px] font-mono-tabular font-extrabold text-[#fef08a]">
                          x{recipe.resultCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] text-[#c4ab7d] leading-tight pt-1 border-t border-[#3d281a]">
                {stationContext === null
                  ? 'Dica: Coloque e interaja com uma Bancada, Fornalha ou Altar no mundo para mais receitas.'
                  : `Estação Ativa: ${stationTitle()} (${availableRecipes.length} receitas)`}
              </div>
            </div>

            {/* RIGHT COLUMN (7 cols on horizontal mobile): Crafting Matrix & Item Details */}
            <div className="sm:col-span-7 medieval-inset p-3 space-y-2">
              {selectedRecipe && selectedRecipeItem ? (
                <>
                  {/* Item Header + Stats inline */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#3d281a] pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-12 mc-slot-active flex items-center justify-center shrink-0 relative">
                        <img
                          src={spriteAtlas.getItemIconUrl(selectedRecipeItem.id)}
                          alt={selectedRecipeItem.name}
                          className="w-8 h-8 pixelated"
                        />
                        {selectedRecipe.resultCount > 1 && (
                          <span className="absolute bottom-0 right-1 text-[10px] font-mono-tabular font-extrabold text-amber-300">
                            x{selectedRecipe.resultCount}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-pixel text-xs sm:text-sm font-bold text-white">
                          {selectedRecipeItem.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-[#c4ab7d]">
                            {categoryName(selectedRecipeItem.category)}
                          </span>
                          <span>·</span>
                          <span
                            className={`font-bold ${
                              rarityBadge(selectedRecipeItem.rarity).color
                            }`}
                          >
                            {rarityBadge(selectedRecipeItem.rarity).text}
                          </span>
                          <span>·</span>
                          <span className="font-mono font-bold text-amber-300">
                            Valor Sugerido: {getItemBasePrice(selectedRecipeItem.id)}g
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Stat Badges */}
                    <div className="flex flex-wrap gap-1 justify-end text-[10px] font-mono-tabular">
                      {selectedRecipeItem.attackDamage !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-rose-400 font-bold">
                          ATQ {selectedRecipeItem.attackDamage}
                        </span>
                      )}
                      {selectedRecipeItem.harvestPower !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-amber-400 font-bold">
                          COL {selectedRecipeItem.harvestPower}
                        </span>
                      )}
                      {selectedRecipeItem.lifesteal !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-purple-300 font-bold">
                          DRENO +{selectedRecipeItem.lifesteal} HP
                        </span>
                      )}
                      {selectedRecipeItem.equipSlot && (
                        <span className="mc-slot px-2 py-0.5 text-amber-300 font-bold">
                          SLOT: {equipSlotLabel(selectedRecipeItem.equipSlot)}
                        </span>
                      )}
                      {selectedRecipeItem.defenseBonus !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-sky-400 font-bold">
                          DEF -{Math.round(selectedRecipeItem.defenseBonus * 100)}%
                        </span>
                      )}
                      {selectedRecipeItem.speedBonus !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-emerald-300 font-bold">
                          VEL +{Math.round(selectedRecipeItem.speedBonus * 100)}%
                        </span>
                      )}
                      {selectedRecipeItem.maxHpBonus !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-rose-300 font-bold">
                          +{selectedRecipeItem.maxHpBonus} HP MÁX
                        </span>
                      )}
                      {selectedRecipeItem.hpRestore !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-rose-300 font-bold">
                          +{selectedRecipeItem.hpRestore} HP
                        </span>
                      )}
                      {selectedRecipeItem.hungerRestore !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-emerald-400 font-bold">
                          +{selectedRecipeItem.hungerRestore} Fome
                        </span>
                      )}
                      {selectedRecipeItem.permanentMaxHpBonus !== undefined && (
                        <span className="mc-slot px-2 py-0.5 text-amber-300 font-bold">
                          +{selectedRecipeItem.permanentMaxHpBonus} HP MÁX PERM.
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-[#e5d5b5] leading-snug">
                    {selectedRecipeItem.description}
                  </p>

                  {selectedRecipeItem.purposeSummary && (
                    <div className="bg-[#1a110b] px-2.5 py-1.5 border border-[#4a301e] text-[10px] text-amber-300">
                      <strong className="text-amber-400">Função: </strong>
                      {selectedRecipeItem.purposeSummary}
                    </div>
                  )}

                  {/* Architectural & Hitbox Attributes Box for Construction Items */}
                  {selectedRecipeItem.placeableType &&
                    CONSTRUCTION_BLUEPRINTS[selectedRecipeItem.placeableType] && (
                      <div className="bg-[#120b07] p-2 border border-[#4a301e] grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                        {(() => {
                          const bp =
                            CONSTRUCTION_BLUEPRINTS[
                              selectedRecipeItem.placeableType!
                            ];
                          const layerLabel =
                            bp.layer === 'GROUND'
                              ? 'Chão / Piso'
                              : bp.layer === 'WALL'
                              ? 'Parede / Divisória'
                              : 'Mobília / Estação';
                          return (
                            <>
                              <div className="mc-slot px-2 py-1">
                                <div className="text-[8px] text-[#c4ab7d] uppercase">
                                  Camada
                                </div>
                                <div className="font-bold text-amber-300 truncate">
                                  {layerLabel}
                                </div>
                              </div>
                              <div className="mc-slot px-2 py-1">
                                <div className="text-[8px] text-[#c4ab7d] uppercase">
                                  Colisão (Hitbox)
                                </div>
                                <div
                                  className={`font-bold truncate ${
                                    bp.hitboxBehavior === 'DYNAMIC_DOOR'
                                      ? 'text-sky-300'
                                      : bp.hasHitbox
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {bp.hitboxBehavior === 'DYNAMIC_DOOR'
                                    ? 'Abre / Fecha'
                                    : bp.hasHitbox
                                    ? 'Com Hitbox'
                                    : 'Sem Hitbox (Livre)'}
                                </div>
                              </div>
                              <div className="mc-slot px-2 py-1">
                                <div className="text-[8px] text-[#c4ab7d] uppercase">
                                  Continuidade
                                </div>
                                <div className="font-bold text-sky-300 truncate">
                                  {bp.continuityMode === 'STANDALONE'
                                    ? 'Peça Única'
                                    : 'Auto-Conectável'}
                                </div>
                              </div>
                              <div className="mc-slot px-2 py-1">
                                <div className="text-[8px] text-[#c4ab7d] uppercase">
                                  Atributo Extra
                                </div>
                                <div className="font-bold text-[#f3e5c8] truncate">
                                  {bp.speedMultiplier && bp.speedMultiplier > 1
                                    ? `+${Math.round(
                                        (bp.speedMultiplier - 1) * 100
                                      )}% Velocidade`
                                    : bp.lightRadius
                                    ? `Luz ${bp.lightRadius}px`
                                    : `HP ${bp.maxHp}`}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                  {/* Minecraft-Style Ingredients -> Output Matrix */}
                  <div className="bg-[#120b07] p-2.5 border border-[#3d281a] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedRecipe.ingredients.map((ing) => {
                        const ingDef = ITEMS[ing.itemId];
                        const have = engine.getItemCount(ing.itemId);
                        const enough = have >= ing.count;
                        return (
                          <div
                            key={ing.itemId}
                            className="flex items-center gap-1.5 mc-slot px-2 py-1"
                          >
                            <img
                              src={spriteAtlas.getItemIconUrl(ing.itemId)}
                              alt={ingDef?.name || ing.itemId}
                              className="w-5 h-5 pixelated"
                            />
                            <div className="leading-none">
                              <div className="text-[10px] font-bold text-[#f3e5c8]">
                                {ingDef?.name || ing.itemId}
                              </div>
                              <div
                                className={`text-[10px] font-mono-tabular font-bold ${
                                  enough ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {have}/{ing.count}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <ArrowRight className="w-4 h-4 text-amber-400" />
                      <div className="mc-slot-active w-10 h-10 flex items-center justify-center relative">
                        <img
                          src={spriteAtlas.getItemIconUrl(selectedRecipeItem.id)}
                          alt={selectedRecipeItem.name}
                          className="w-7 h-7 pixelated"
                        />
                        <span className="absolute bottom-0 right-0.5 text-[9px] font-mono-tabular font-extrabold text-amber-300">
                          x{selectedRecipe.resultCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Craft Buttons */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      disabled={maxCraftCount <= 0}
                      onClick={() =>
                        engine.craftRecipe(
                          selectedRecipe.id,
                          stationContext,
                          1
                        )
                      }
                      className={`flex-1 min-h-[42px] px-3 py-1.5 font-pixel text-xs font-bold flex items-center justify-center gap-1.5 ${
                        maxCraftCount > 0
                          ? 'medieval-btn-gold'
                          : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Hammer className="w-4 h-4" />
                      <span>
                        Criar 1x ({selectedRecipe.resultCount} un.)
                      </span>
                    </button>

                    {maxCraftCount > 1 && (
                      <button
                        onClick={() =>
                          engine.craftRecipe(
                            selectedRecipe.id,
                            stationContext,
                            Math.min(10, maxCraftCount)
                          )
                        }
                        className="min-h-[42px] px-3 py-1.5 font-pixel text-xs font-bold medieval-btn-emerald flex items-center justify-center gap-1"
                      >
                        <Layers className="w-4 h-4" />
                        <span>x{Math.min(10, maxCraftCount)}</span>
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          /* ================================================================= */
          /* TAB 2: HORIZONTAL WIDESCREEN MODULAR INVENTORY (sm:grid-cols-12)  */
          /* ================================================================= */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {/* LEFT COLUMN (7 cols on horizontal mobile): 24-Slot Backpack + 8-Slot Hotbar */}
            <div className="sm:col-span-7 medieval-inset p-2.5 space-y-2.5">
              {/* 3x8 Backpack */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-pixel text-[#c4ab7d]">
                    MOCHILA (24 SLOTS · 3x8)
                  </span>
                  <span className="text-[#8c6d46]">
                    Toque para inspecionar função ou mover
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {player.inventory
                    .slice(HOTBAR_SIZE, TOTAL_INVENTORY_SIZE)
                    .map((slot, offset) => {
                      const idx = offset + HOTBAR_SIZE;
                      const def = slot ? ITEMS[slot.itemId] : null;
                      const isSel = selectedInvIndex === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (
                              selectedInvIndex !== idx &&
                              player.inventory[selectedInvIndex] &&
                              !slot
                            ) {
                              engine.swapInventorySlots(selectedInvIndex, idx);
                              setSelectedInvIndex(idx);
                            } else {
                              handleInventorySlotClick(idx);
                            }
                          }}
                          className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 ${
                            isSel ? 'mc-slot-active' : 'mc-slot'
                          }`}
                        >
                          {slot && def ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(slot.itemId)}
                                alt={def.name}
                                className="w-5 h-5 sm:w-6 sm:h-6 pixelated"
                              />
                              {slot.count > 1 && (
                                <span className="absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold text-[#fef08a]">
                                  {slot.count}
                                </span>
                              )}
                            </>
                          ) : null}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* 1x8 Hotbar */}
              <div className="space-y-1 pt-1.5 border-t border-[#3d281a]">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-pixel text-amber-400">
                    MÃO ATIVA (8 SLOTS)
                  </span>
                  <span className="text-[#c4ab7d]">Teclas 1–8</span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {player.inventory.slice(0, HOTBAR_SIZE).map((slot, idx) => {
                    const def = slot ? ITEMS[slot.itemId] : null;
                    const isSel = selectedInvIndex === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          if (
                            selectedInvIndex !== idx &&
                            player.inventory[selectedInvIndex] &&
                            !slot
                          ) {
                            engine.swapInventorySlots(selectedInvIndex, idx);
                            setSelectedInvIndex(idx);
                          } else {
                            handleInventorySlotClick(idx);
                          }
                          engine.selectHotbarSlot(idx);
                        }}
                        className={`relative aspect-square min-h-[38px] sm:min-h-[44px] flex flex-col items-center justify-center p-0.5 ${
                          isSel ? 'mc-slot-active' : 'mc-slot'
                        }`}
                      >
                        <span className="absolute top-0 left-0.5 text-[7px] font-mono-tabular text-amber-400/80">
                          {idx + 1}
                        </span>
                        {slot && def ? (
                          <>
                            <img
                              src={spriteAtlas.getItemIconUrl(slot.itemId)}
                              alt={def.name}
                              className="w-5 h-5 sm:w-6 sm:h-6 pixelated"
                            />
                            {slot.count > 1 && (
                              <span className="absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold text-[#fef08a]">
                                {slot.count}
                              </span>
                            )}
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (5 cols on horizontal mobile): Paper-Doll + Complete Item Inspector */}
            <div className="sm:col-span-5 space-y-2">
              {/* Compact Hero 4-Slot Paper-Doll Box */}
              <div className="medieval-inset p-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-14 bg-[#120b07] border border-[#4a301e] flex flex-col items-center justify-center shrink-0">
                    <img
                      src={playerPreviewUrl}
                      alt="Herói"
                      className="w-10 h-10 pixelated"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { slot: 'head' as EquipmentSlot, short: 'Cab.' },
                        { slot: 'body' as EquipmentSlot, short: 'Sup.' },
                        { slot: 'legs' as EquipmentSlot, short: 'Inf.' },
                        { slot: 'feet' as EquipmentSlot, short: 'Pés' },
                      ] as const
                    ).map(({ slot, short }) => {
                      const eqId =
                        player.equippedBySlot?.[slot] ??
                        (slot === 'body' ? player.equippedArmorId : null);
                      return (
                        <button
                          key={slot}
                          onClick={() => engine.unequipArmorSlot(slot)}
                          title={`${equipSlotLabel(slot)} (toque para desequipar)`}
                          className={`w-9 h-10 mc-slot flex flex-col items-center justify-center ${
                            eqId ? 'border-amber-500/80' : ''
                          }`}
                        >
                          {eqId ? (
                            <img
                              src={spriteAtlas.getItemIconUrl(eqId)}
                              alt={short}
                              className="w-5 h-5 pixelated"
                            />
                          ) : (
                            <Shield className="w-3.5 h-3.5 text-[#5c3d28]" />
                          )}
                          <span className="text-[7px] text-[#c4ab7d] leading-none mt-0.5">
                            {short}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="text-[9px] font-mono-tabular space-y-0.5 text-[#e5d5b5] text-right shrink-0">
                  <div>
                    HP:{' '}
                    <b className="text-rose-400">
                      {Math.ceil(player.hp)}/{player.maxHp}
                    </b>
                  </div>
                  <div>
                    DEF:{' '}
                    <b className="text-sky-300">
                      {Math.round(engine.getTotalDefenseBonus() * 100)}%
                    </b>
                  </div>
                  {engine.getTotalEquipmentSpeedBonus() > 0 && (
                    <div>
                      VEL:{' '}
                      <b className="text-emerald-300">
                        +{Math.round(engine.getTotalEquipmentSpeedBonus() * 100)}%
                      </b>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Item Complete Details, Purpose & Recipe Uses */}
              <div className="medieval-inset p-2.5 space-y-2">
                {selectedSlot && selectedSlotItem ? (
                  <>
                    <div className="flex items-center gap-2 border-b border-[#3d281a] pb-1.5">
                      <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0">
                        <img
                          src={spriteAtlas.getItemIconUrl(selectedSlotItem.id)}
                          alt={selectedSlotItem.name}
                          className="w-6 h-6 pixelated"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-pixel text-[11px] font-bold text-white truncate">
                          {selectedSlotItem.name} (x{selectedSlot.count})
                        </div>
                        <div className="text-[10px] text-[#c4ab7d]">
                          {categoryName(selectedSlotItem.category)} ·{' '}
                          <span
                            className={
                              rarityBadge(selectedSlotItem.rarity).color
                            }
                          >
                            {rarityBadge(selectedSlotItem.rarity).text}
                          </span>
                          {' · '}
                          <span className="font-mono font-bold text-amber-300">
                            Valor Sugerido: {getItemBasePrice(selectedSlotItem.id)}g
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-[#e5d5b5] leading-snug">
                      {selectedSlotItem.description}
                    </p>

                    {selectedSlotItem.purposeSummary && (
                      <div className="bg-[#120b07] p-2 border border-[#3d281a] text-[10px] text-amber-300 leading-snug">
                        <span className="font-bold text-amber-400 block mb-0.5">
                          MOTIVO & FUNÇÃO DO ITEM:
                        </span>
                        {selectedSlotItem.purposeSummary}
                      </div>
                    )}

                    {selectedSlotItem.placeableType &&
                      CONSTRUCTION_BLUEPRINTS[selectedSlotItem.placeableType] && (
                        <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1 text-[9px]">
                          {(() => {
                            const bp =
                              CONSTRUCTION_BLUEPRINTS[
                                selectedSlotItem.placeableType!
                              ];
                            return (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-[#c4ab7d]">Camada:</span>
                                  <span className="font-bold text-amber-300">
                                    {bp.layer === 'GROUND'
                                      ? 'Chão / Piso (Aceita parede/mobília acima)'
                                      : bp.layer === 'WALL'
                                      ? 'Parede / Divisória'
                                      : 'Mobília / Estação'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[#c4ab7d]">Hitbox:</span>
                                  <span
                                    className={`font-bold ${
                                      bp.hitboxBehavior === 'DYNAMIC_DOOR'
                                        ? 'text-sky-300'
                                        : bp.hasHitbox
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                    }`}
                                  >
                                    {bp.hitboxLabel}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[#c4ab7d]">
                                    Ligação / Continuidade:
                                  </span>
                                  <span className="font-bold text-sky-300">
                                    {bp.continuityLabel}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                    {/* Recipes that use this item as an ingredient */}
                    {usedInRecipes.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-pixel text-[#c4ab7d] block">
                          USADO PARA CRIAR ({usedInRecipes.length} ITENS):
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-[68px] overflow-y-auto pr-0.5">
                          {usedInRecipes.map(({ recipe, resultName }) => (
                            <button
                              key={recipe.id}
                              onClick={() => {
                                if (
                                  recipe.requiredStation === null ||
                                  recipe.requiredStation === stationContext
                                ) {
                                  setCategoryFilter('ALL');
                                  setIncludeHandRecipesInStation(true);
                                  setSelectedRecipeId(recipe.id);
                                  setActiveTab('craft');
                                }
                              }}
                              className="mc-slot px-1.5 py-0.5 flex items-center gap-1 text-[9px] text-[#f3e5c8] hover:border-amber-400"
                              title={`Estação: ${stationShortName(
                                recipe.requiredStation
                              )}`}
                            >
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  recipe.resultItemId
                                )}
                                alt=""
                                className="w-3.5 h-3.5 pixelated"
                              />
                              <span className="truncate max-w-[95px]">
                                {resultName}
                              </span>
                              <span className="text-[8px] text-amber-400/90">
                                [{stationShortName(recipe.requiredStation)}]
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {selectedSlotItem.category === ItemCategory.CONSUMABLE && (
                        <button
                          onClick={() => engine.consumeSlotItem(selectedInvIndex)}
                          className="col-span-2 min-h-[34px] px-2 py-1 medieval-btn-emerald text-[10px] font-bold flex items-center justify-center gap-1"
                        >
                          <Utensils className="w-3.5 h-3.5" />
                          <span>
                            {selectedSlotItem.specialUse === 'bomb'
                              ? 'Detonar Bomba Solar (65 Dano Área)'
                              : selectedSlotItem.specialUse === 'recall'
                              ? 'Teleportar para a Base (+50 HP)'
                              : `Consumir / Usar (${selectedSlotItem.name})`}
                          </span>
                        </button>
                      )}

                      {selectedSlotItem.category === ItemCategory.ARMOR && (
                        <button
                          onClick={() =>
                            engine.equipArmorFromSlot(selectedInvIndex)
                          }
                          className="col-span-2 min-h-[34px] px-2 py-1 medieval-btn-gold text-[10px] font-bold flex items-center justify-center gap-1"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>
                            Equipar em {equipSlotLabel(selectedSlotItem.equipSlot)}
                          </span>
                        </button>
                      )}

                      {selectedInvIndex >= HOTBAR_SIZE && (
                        <button
                          onClick={handleSwapWithHotbarActive}
                          className="min-h-[34px] px-2 py-1 medieval-btn-gold text-[10px] font-bold flex items-center justify-center gap-1"
                        >
                          <Hand className="w-3 h-3" />
                          <span>P/ Mão #{player.selectedHotbarIndex + 1}</span>
                        </button>
                      )}

                      {selectedSlot.count > 1 && (
                        <button
                          onClick={() =>
                            engine.splitInventorySlot(selectedInvIndex)
                          }
                          className="min-h-[34px] px-2 py-1 medieval-btn-wood text-[10px] font-bold flex items-center justify-center gap-1"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Dividir 50%</span>
                        </button>
                      )}

                      <button
                        onClick={() =>
                          engine.dropInventorySlot(selectedInvIndex, true)
                        }
                        className="min-h-[34px] px-2 py-1 medieval-btn-crimson text-[10px] font-bold flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Soltar</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-5 text-center text-[11px] text-[#8c6d46]">
                    Toque em um item na mochila ou hotbar para ver sua função, receitas e ações.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
