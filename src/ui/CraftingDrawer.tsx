import React, { useEffect, useMemo, useState } from 'react';
import {
  Anvil,
  ArrowRight,
  Backpack,
  Clock,
  Compass,
  Flame,
  Hammer,
  Hand,
  Heart,
  Layers,
  Palette,
  Scissors,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Trash2,
  Utensils,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  CLOTHING_COLORS,
  CONSTRUCTION_BLUEPRINTS,
  FUEL_ITEM_ORDER,
  FUEL_ITEMS,
  getDyedGarmentItemId,
  getDyeItemIdForColor,
  getFlowerColorHex,
  getFlowerColorLabel,
  getItemBasePrice,
  ITEMS,
} from '../game/core/ItemRegistry';
import {
  CraftingRecipe,
  isCommonWoodItem,
  RECIPES,
} from '../game/core/RecipeRegistry';
import {
  ClothingColorId,
  EquipmentSlot,
  HOTBAR_SIZE,
  ItemCategory,
  PlaceableType,
  PlayerState,
  RarityTier,
  TOTAL_INVENTORY_SIZE,
} from '../game/core/types';
import { GameEngine, HudSnapshot } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import { WindowHelpButton, WindowHelpModal } from './UiTooltipAndHelp';

interface CraftingDrawerProps {
  engine: GameEngine;
  player?: PlayerState;
  snapshot?: HudSnapshot;
  isOpen?: boolean;
  stationContext: PlaceableType | null;
  initialTab?: 'craft' | 'inventory';
  onClose: () => void;
}

type CategoryFilter =
  | 'ALL'
  | 'TOOL'
  | 'WEAPON'
  | 'ARMOR'
  | 'CONSUMABLE'
  | 'PLACEABLE'
  | 'RESOURCE';

interface StationThemeConfig {
  id: string;
  title: string;
  subtitle: string;
  badgeText: string;
  outerPanelClass: string;
  headerBgClass: string;
  accentTextClass: string;
  accentBorderClass: string;
  slotActiveClass: string;
  primaryBtnClass: string;
  matrixTitle: string;
  emptyHint: string;
}

function getStationTheme(station: PlaceableType | null): StationThemeConfig {
  switch (station) {
    case PlaceableType.WORKBENCH:
      return {
        id: 'WORKBENCH',
        title: 'BANCADA DE TRABALHO DO ARTESÃO',
        subtitle:
          'Carpintaria & Forja Tática 3x3 · Criação Instantânea de Ferramentas, Armas, Armaduras e Estruturas',
        badgeText: 'CRIAÇÃO INSTANTÂNEA (3x3)',
        outerPanelClass:
          'bg-[#111827] border-2 border-amber-500/80 shadow-[0_0_35px_rgba(245,158,11,0.28)]',
        headerBgClass:
          'bg-gradient-to-r from-[#1e293b] via-[#291d12] to-[#0f172a] border-b-2 border-amber-500/60',
        accentTextClass: 'text-amber-300',
        accentBorderClass: 'border-amber-500/50',
        slotActiveClass:
          'bg-[#1e293b] border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.35)]',
        primaryBtnClass: 'medieval-btn-gold',
        matrixTitle: 'MATRIZ DE OFICINA 3x3 (INSTANTÂNEO)',
        emptyHint:
          'Nenhuma receita desta categoria na Bancada de Trabalho.',
      };
    case PlaceableType.CAMPFIRE:
      return {
        id: 'CAMPFIRE',
        title: 'FOGUEIRA DE ACAMPAMENTO & CULINÁRIA',
        subtitle:
          'Grelha & Caldeirão Rústico · Abasteça com Lenha ou Carvão para assar comidas, pães, rações e elixires com tempo de preparo',
        badgeText: 'REQUER LENHA & TEMPO DE PREPARO',
        outerPanelClass:
          'bg-[#1f0d07] border-2 border-orange-500/85 shadow-[0_0_38px_rgba(249,115,22,0.35)]',
        headerBgClass:
          'bg-gradient-to-r from-[#431407] via-[#2e1008] to-[#1a0905] border-b-2 border-orange-500/70',
        accentTextClass: 'text-orange-300',
        accentBorderClass: 'border-orange-500/55',
        slotActiveClass:
          'bg-[#3b150a] border-2 border-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.45)]',
        primaryBtnClass: 'medieval-btn-gold',
        matrixTitle: 'GRELHA TÉRMICA & SLOT DE LENHA',
        emptyHint:
          'A Fogueira prepara exclusivamente comidas, elixires, rações e Carvão Vegetal na brasa.',
      };
    case PlaceableType.FURNACE:
      return {
        id: 'FURNACE',
        title: 'ALTO-FORNO & FORNALHA DE FUNDIÇÃO',
        subtitle:
          'Metalurgia & Pirólise · Queime Madeira para obter Carvão Vegetal (5x mais eficiente) e funda Minério de Ferro e alvenaria pesada',
        badgeText: 'FUNDIÇÃO TÉRMICA COM LENHA/CARVÃO',
        outerPanelClass:
          'bg-[#141418] border-2 border-red-500/85 shadow-[0_0_40px_rgba(239,68,68,0.35)]',
        headerBgClass:
          'bg-gradient-to-r from-[#27272a] via-[#45120a] to-[#18181b] border-b-2 border-red-500/70',
        accentTextClass: 'text-red-300',
        accentBorderClass: 'border-red-500/55',
        slotActiveClass:
          'bg-[#2d1210] border-2 border-red-400 shadow-[0_0_12px_rgba(248,113,113,0.45)]',
        primaryBtnClass: 'medieval-btn-crimson',
        matrixTitle: 'CÂMARA DE FUNDIÇÃO & COMBUSTÍVEL',
        emptyHint:
          'A Fornalha funde exclusivamente minérios, Carvão Vegetal, muralhas e artefatos térmicos.',
      };
    case PlaceableType.SOLAR_ALTAR:
      return {
        id: 'SOLAR_ALTAR',
        title: 'ALTAR ALQUÍMICO SOLAR & ASTRAL',
        subtitle:
          'Santuário Cósmico de Hélio · Consagra Relíquias Muito Raras, Armas Primordiais, Armaduras Astrais e Santuários Divinos',
        badgeText: 'CONSAGRAÇÃO SOLAR & ITENS RAROS',
        outerPanelClass:
          'bg-[#090d1e] border-2 border-cyan-400/85 shadow-[0_0_42px_rgba(56,189,248,0.38)]',
        headerBgClass:
          'bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#083344] border-b-2 border-cyan-400/70',
        accentTextClass: 'text-cyan-300',
        accentBorderClass: 'border-cyan-400/55',
        slotActiveClass:
          'bg-[#0f2942] border-2 border-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.5)]',
        primaryBtnClass: 'medieval-btn-emerald',
        matrixTitle: 'CÍRCULO RÚNICO DE TRANSMUTAÇÃO SOLAR',
        emptyHint:
          'O Altar Solar cria apenas relíquias astrais, equipamentos primordiais e santuários sagrados.',
      };
    case PlaceableType.WEAVING_TABLE:
      return {
        id: 'WEAVING_TABLE',
        title: 'MESA DE TECELAGEM & ALFAIATARIA',
        subtitle:
          'Confecção de Roupas (Cabeça, Superior, Inferior, Pés) & Tingimento de Peças de Costura e Couro em 17 Cores',
        badgeText: 'CONFECÇÃO & TINGIMENTO',
        outerPanelClass:
          'bg-[#1c1226] border-2 border-fuchsia-400/80 shadow-[0_0_38px_rgba(217,70,239,0.3)]',
        headerBgClass:
          'bg-gradient-to-r from-[#2e1035] via-[#3b1730] to-[#1e1024] border-b-2 border-fuchsia-400/65',
        accentTextClass: 'text-fuchsia-300',
        accentBorderClass: 'border-fuchsia-400/50',
        slotActiveClass:
          'bg-[#3b1542] border-2 border-fuchsia-300 shadow-[0_0_12px_rgba(232,121,249,0.45)]',
        primaryBtnClass: 'medieval-btn-gold',
        matrixTitle: 'TEAR DE COSTURA & TINGIMENTO',
        emptyHint:
          'Nenhuma peça de roupa encontrada nesta categoria.',
      };
    default:
      return {
        id: 'HAND',
        title: 'CRIAÇÃO À MÃO LIVRE (SOBREVIVÊNCIA 2x2)',
        subtitle:
          'Grade Manual Básica · Crie sua Bancada de Artesão, Fogueira, Tochas e Curativos para iniciar sua jornada',
        badgeText: 'CRAFT MANUAL BÁSICO (2x2)',
        outerPanelClass:
          'medieval-panel border-2 border-amber-700/80 shadow-[0_0_30px_rgba(180,83,9,0.28)]',
        headerBgClass:
          'bg-gradient-to-r from-[#28180e] via-[#362012] to-[#1c110a] border-b-2 border-[#5c3a21]',
        accentTextClass: 'text-amber-300',
        accentBorderClass: 'border-[#5c3a21]',
        slotActiveClass: 'mc-slot-active',
        primaryBtnClass: 'medieval-btn-gold',
        matrixTitle: 'GRADE DE MÃO LIVRE (2x2)',
        emptyHint:
          'À mão livre você cria apenas itens essenciais de sobrevivência. Posicione uma Bancada de Artesão para ferramentas, armas e construções!',
      };
  }
}

export const CraftingDrawer: React.FC<CraftingDrawerProps> = ({
  engine,
  player: playerProp,
  snapshot,
  isOpen = true,
  stationContext,
  initialTab = 'craft',
  onClose,
}) => {
  const player = playerProp || snapshot?.player || engine.player;
  const nearbyStations = useMemo(
    () => snapshot?.nearbyStations || engine.getNearbyStations(),
    [snapshot?.nearbyStations, engine, player.x, player.y]
  );

  const [activeTab, setActiveTab] = useState<'craft' | 'inventory'>(initialTab);
  const [activeStation, setActiveStation] = useState<PlaceableType | null>(
    stationContext
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(
    RECIPES[0]?.id || ''
  );
  const [selectedInvIndex, setSelectedInvIndex] = useState<number | null>(
    null
  );
  const [campfireBannerMsg, setCampfireBannerMsg] = useState<string | null>(
    null
  );
  const [showHelp, setShowHelp] = useState(false);

  // Mesa de Tecelagem state: Janela de Confecção vs Janela de Tingimento
  const [weavingWindow, setWeavingWindow] = useState<'confeccao' | 'tingimento'>(
    'confeccao'
  );
  const [weavingCategory, setWeavingCategory] = useState<EquipmentSlot>('head');
  const [craftColorId, setCraftColorId] = useState<ClothingColorId>('branco');
  const [selectedDyeSource, setSelectedDyeSource] = useState<
    | { kind: 'equipped'; equipSlot: EquipmentSlot }
    | { kind: 'inventory'; slotIndex: number }
    | null
  >(null);
  const [targetDyeColorId, setTargetDyeColorId] =
    useState<ClothingColorId>('vermelho');
  const [selectedMaterialOptionId, setSelectedMaterialOptionId] =
    useState<string>('');
  const [weavingOpenGuard, setWeavingOpenGuard] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setActiveStation(stationContext);
      setCategoryFilter('ALL');
      setSelectedInvIndex(null);
      setCampfireBannerMsg(null);
      setWeavingWindow('confeccao');
    }
  }, [isOpen, initialTab, stationContext]);

  // 0,2s (200ms) protection when opening or switching to Mesa de Tecelagem
  useEffect(() => {
    if (isOpen && activeStation === PlaceableType.WEAVING_TABLE) {
      engine.weavingTableOpenedAtMs = performance.now();
      setWeavingOpenGuard(true);
      const timer = window.setTimeout(() => {
        setWeavingOpenGuard(false);
      }, 200);
      return () => window.clearTimeout(timer);
    } else {
      setWeavingOpenGuard(false);
    }
  }, [isOpen, activeStation, engine]);

  const theme = getStationTheme(activeStation);

  // Available stations the player can switch between (Hand + any nearby placed station + the station that opened the modal)
  const availableStations = useMemo(() => {
    const list: (PlaceableType | null)[] = [null];
    const order: PlaceableType[] = [
      PlaceableType.WORKBENCH,
      PlaceableType.WEAVING_TABLE,
      PlaceableType.CAMPFIRE,
      PlaceableType.FURNACE,
      PlaceableType.SOLAR_ALTAR,
    ];
    for (const st of order) {
      if (nearbyStations.includes(st) || stationContext === st) {
        list.push(st);
      }
    }
    return list;
  }, [nearbyStations, stationContext]);

  // Strictly separate recipes by the active crafting station!
  const stationRecipes = useMemo(() => {
    return RECIPES.filter((r) => r.requiredStation === activeStation);
  }, [activeStation]);

  // Category counts for the current station so only relevant category pills are highlighted
  const filteredRecipes = useMemo(() => {
    return stationRecipes
      .filter((r) => {
        const out = ITEMS[r.resultItemId];
        if (activeStation === PlaceableType.WEAVING_TABLE) {
          const cat = out?.clothingCategory || out?.equipSlot || 'body';
          return cat === weavingCategory;
        }
        if (categoryFilter === 'ALL') return true;
        return out?.category === categoryFilter;
      })
      .sort((a, b) => {
        const aCan = engine.getMaxCraftableCount(a) > 0 ? 1 : 0;
        const bCan = engine.getMaxCraftableCount(b) > 0 ? 1 : 0;
        if (aCan !== bCan) return bCan - aCan;
        return 0;
      });
  }, [
    stationRecipes,
    activeStation,
    weavingCategory,
    categoryFilter,
    player.inventory,
    engine,
  ]);

  useEffect(() => {
    if (
      filteredRecipes.length > 0 &&
      !filteredRecipes.some((r) => r.id === selectedRecipeId)
    ) {
      setSelectedRecipeId(filteredRecipes[0].id);
    }
  }, [filteredRecipes, selectedRecipeId]);

  const selectedRecipe: CraftingRecipe | undefined =
    filteredRecipes.find((r) => r.id === selectedRecipeId) ||
    filteredRecipes[0] ||
    stationRecipes[0];

  // Sync default craft color when selecting a clothing recipe in Mesa de Tecelagem,
  // and sync default materialOptionId when selecting a dye recipe with multiple material options
  useEffect(() => {
    if (activeStation === PlaceableType.WEAVING_TABLE && selectedRecipe) {
      const def = ITEMS[selectedRecipe.resultItemId];
      if (def?.garmentColorId) {
        setCraftColorId(def.garmentColorId);
      } else {
        setCraftColorId('branco');
      }
    }
    if (selectedRecipe?.materialOptions && selectedRecipe.materialOptions.length > 0) {
      const firstAvailable = selectedRecipe.materialOptions.find((opt) =>
        opt.ingredients.every(
          (ing) => engine.getIngredientAvailableCount(ing) >= ing.count
        )
      );
      setSelectedMaterialOptionId(
        firstAvailable?.id || selectedRecipe.materialOptions[0].id
      );
    } else {
      setSelectedMaterialOptionId('');
    }
  }, [activeStation, selectedRecipe?.id, engine]);

  const selectedSlot =
    selectedInvIndex !== null ? player.inventory[selectedInvIndex] || null : null;
  const selectedSlotItem = selectedSlot ? ITEMS[selectedSlot.itemId] : null;

  // Find all recipes where the selected inventory item is used as an ingredient
  const usedInRecipes = useMemo(() => {
    if (!selectedSlotItem) return [];
    return RECIPES.filter(
      (r) =>
        r.ingredients.some((ing) => ing.itemId === selectedSlotItem.id) ||
        r.materialOptions?.some((opt) =>
          opt.ingredients.some((ing) => ing.itemId === selectedSlotItem.id)
        )
    ).map((r) => ({
      recipe: r,
      resultName: ITEMS[r.resultItemId]?.name || r.resultItemId,
    }));
  }, [selectedSlotItem]);

  if (!isOpen) return null;

  const isThermalStation =
    activeStation === PlaceableType.CAMPFIRE ||
    activeStation === PlaceableType.FURNACE;

  const isWeavingStation = activeStation === PlaceableType.WEAVING_TABLE;

  const thermalState = isThermalStation
    ? engine.getActiveThermalStation(
        activeStation as PlaceableType.CAMPFIRE | PlaceableType.FURNACE
      )
    : null;

  const weavingState = isWeavingStation
    ? engine.getActiveWeavingStation()
    : null;

  const formatCraftDuration = (sec?: number) => {
    if (!sec || sec <= 0) return 'Instantâneo';
    if (sec >= 60 && sec % 60 === 0) {
      return `${Math.round(sec / 60)}min`;
    }
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      const s = Math.ceil(sec % 60);
      return `${m}m ${s}s`;
    }
    return `${Math.ceil(sec)}s`;
  };

  const stationShortName = (st: PlaceableType | null) => {
    if (!st) return 'Mão Livre';
    if (st === PlaceableType.WORKBENCH) return 'Bancada';
    if (st === PlaceableType.WEAVING_TABLE) return 'Mesa de Tecelagem';
    if (st === PlaceableType.CAMPFIRE) return 'Fogueira';
    if (st === PlaceableType.FURNACE) return 'Fornalha';
    if (st === PlaceableType.SOLAR_ALTAR) return 'Altar Solar';
    return 'Estação';
  };

  const rarityBadge = (rarity: RarityTier) => {
    switch (rarity) {
      case RarityTier.BASIC:
        return {
          text: 'Básico',
          color: 'text-stone-200 bg-stone-800 border-stone-600',
        };
      case RarityTier.RARE:
        return {
          text: 'Raro',
          color: 'text-amber-300 bg-amber-950/90 border-amber-500/60',
        };
      case RarityTier.VERY_RARE:
        return {
          text: 'Muito Raro',
          color: 'text-cyan-300 bg-cyan-950/90 border-cyan-400/60',
        };
    }
  };

  const categoryName = (cat: ItemCategory) => {
    switch (cat) {
      case ItemCategory.RESOURCE:
        return 'Recurso / Combustível';
      case ItemCategory.TOOL:
        return 'Ferramenta';
      case ItemCategory.WEAPON:
        return 'Arma de Combate';
      case ItemCategory.ARMOR:
        return 'Armadura';
      case ItemCategory.CONSUMABLE:
        return 'Alimento / Elixir';
      case ItemCategory.PLACEABLE:
        return 'Estrutura / Estação';
    }
  };

  const equipSlotLabel = (slot?: EquipmentSlot) => {
    switch (slot) {
      case 'head':
        return 'Cabeça';
      case 'body':
        return 'Peitoral';
      case 'legs':
        return 'Pernas';
      case 'feet':
        return 'Pés';
      default:
        return 'Corpo';
    }
  };

  const handleInventorySlotClick = (idx: number) => {
    const clickedSlot = player.inventory[idx];
    if (selectedInvIndex === null) {
      if (clickedSlot && clickedSlot.count > 0) {
        setSelectedInvIndex(idx);
      }
      return;
    }

    if (selectedInvIndex === idx) {
      setSelectedInvIndex(null);
      return;
    }

    if (!player.inventory[selectedInvIndex]) {
      if (clickedSlot && clickedSlot.count > 0) {
        setSelectedInvIndex(idx);
      } else {
        setSelectedInvIndex(null);
      }
      return;
    }

    engine.swapInventorySlots(selectedInvIndex, idx);
    setSelectedInvIndex(null);
  };

  const resultItem = selectedRecipe
    ? ITEMS[selectedRecipe.resultItemId]
    : undefined;
  const activeRecipeIngredients = selectedRecipe
    ? engine.getRecipeActiveIngredients(selectedRecipe, selectedMaterialOptionId)
    : [];
  const maxCraftCount = selectedRecipe
    ? engine.getMaxCraftableCount(selectedRecipe, selectedMaterialOptionId)
    : 0;
  const playerPreviewUrl = spriteAtlas
    .getPlayerSprite('down', 0, player)
    .toDataURL();

  // Thermal station live values
  const fuelItemDef =
    thermalState?.fuelItemId && ITEMS[thermalState.fuelItemId]
      ? ITEMS[thermalState.fuelItemId]
      : null;
  const fuelBurnRem = thermalState?.fuelBurnRemaining || 0;
  const fuelBurnMax = Math.max(1, thermalState?.fuelBurnMax || 12);
  const fuelFlamePct = Math.min(
    100,
    Math.max(0, (fuelBurnRem / fuelBurnMax) * 100)
  );

  const activeCookingRecipe = thermalState?.cookingRecipeId
    ? RECIPES.find((r) => r.id === thermalState.cookingRecipeId) || null
    : null;
  const activeCookingOutDef = activeCookingRecipe
    ? ITEMS[activeCookingRecipe.resultItemId]
    : null;
  const cookingInputCount = thermalState?.cookingInputCount || 0;
  const cookingProgress = thermalState?.cookingProgress || 0;
  const cookingDuration = Math.max(
    1,
    thermalState?.cookingDuration || activeCookingRecipe?.craftTimeSec || 6
  );
  const cookingPct =
    cookingInputCount > 0
      ? Math.min(100, Math.max(0, (cookingProgress / cookingDuration) * 100))
      : 0;

  const outputItemDef =
    thermalState?.outputItemId && ITEMS[thermalState.outputItemId]
      ? ITEMS[thermalState.outputItemId]
      : null;
  const outputCount = thermalState?.outputCount || 0;

  const hasAnyFuelInStationOrBurn =
    fuelBurnRem > 0 || (Boolean(thermalState?.fuelItemId) && (thermalState?.fuelCount || 0) > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3 select-none">
      <div
        className={`w-full max-w-5xl h-[95vh] max-h-[660px] flex flex-col overflow-hidden rounded-sm ${theme.outerPanelClass}`}
      >
        {/* ================================================================= */}
        {/* UNIQUE STATION HEADER BAR + STATION SWITCHER + TABS               */}
        {/* ================================================================= */}
        <div
          className={`px-3 py-2 flex flex-col gap-2 shrink-0 ${theme.headerBgClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Station Icon + Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 flex items-center justify-center rounded-sm border ${theme.accentBorderClass} bg-black/40 shrink-0`}
              >
                {activeStation === PlaceableType.WORKBENCH ? (
                  <img
                    src={spriteAtlas.getItemIconUrl('workbench')}
                    alt="Bancada"
                    className="w-6 h-6 pixelated"
                  />
                ) : activeStation === PlaceableType.CAMPFIRE ? (
                  <img
                    src={spriteAtlas.getItemIconUrl('campfire')}
                    alt="Fogueira"
                    className="w-6 h-6 pixelated"
                  />
                ) : activeStation === PlaceableType.FURNACE ? (
                  <img
                    src={spriteAtlas.getItemIconUrl('furnace')}
                    alt="Fornalha"
                    className="w-6 h-6 pixelated"
                  />
                ) : activeStation === PlaceableType.SOLAR_ALTAR ? (
                  <img
                    src={spriteAtlas.getItemIconUrl('solar_altar')}
                    alt="Altar Solar"
                    className="w-6 h-6 pixelated"
                  />
                ) : activeStation === PlaceableType.WEAVING_TABLE ? (
                  <img
                    src={spriteAtlas.getItemIconUrl('weaving_table')}
                    alt="Mesa de Tecelagem"
                    className="w-6 h-6 pixelated"
                  />
                ) : (
                  <Hand className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    className={`font-pixel text-xs sm:text-sm font-bold tracking-wide truncate ${theme.accentTextClass}`}
                  >
                    {theme.title}
                  </h2>
                  <span
                    className={`px-1.5 py-0.5 text-[9px] font-pixel font-bold border rounded-sm bg-black/50 ${theme.accentTextClass} ${theme.accentBorderClass}`}
                  >
                    {theme.badgeText}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Controls: Craft vs Inventory Tab + Help (?) + Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setActiveTab('craft')}
                className={`px-2.5 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 ${
                  activeTab === 'craft'
                    ? theme.primaryBtnClass
                    : 'medieval-btn-wood opacity-80'
                }`}
              >
                {activeStation === PlaceableType.CAMPFIRE ? (
                  <Flame className="w-3.5 h-3.5" />
                ) : activeStation === PlaceableType.FURNACE ? (
                  <Anvil className="w-3.5 h-3.5" />
                ) : activeStation === PlaceableType.SOLAR_ALTAR ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : activeStation === PlaceableType.WEAVING_TABLE ? (
                  <Scissors className="w-3.5 h-3.5" />
                ) : activeStation === PlaceableType.WORKBENCH ? (
                  <Hammer className="w-3.5 h-3.5" />
                ) : (
                  <Hand className="w-3.5 h-3.5" />
                )}
                <span>
                  {activeStation === PlaceableType.WEAVING_TABLE
                    ? 'Tecelagem'
                    : 'Criar'}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('inventory')}
                className={`px-2.5 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 ${
                  activeTab === 'inventory'
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood opacity-80'
                }`}
              >
                <Backpack className="w-3.5 h-3.5" />
                <span>Mochila</span>
              </button>

              <WindowHelpButton onClick={() => setShowHelp(true)} />

              <button
                onClick={onClose}
                className="w-8 h-8 medieval-btn-crimson flex items-center justify-center"
                title="Fechar (ESC / E)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Station Switcher Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {availableStations.map((st) => {
                const isCurr = activeStation === st && activeTab === 'craft';
                const label =
                  st === null
                    ? '✋ Mão (2x2)'
                    : st === PlaceableType.WORKBENCH
                    ? '🔨 Bancada'
                    : st === PlaceableType.WEAVING_TABLE
                    ? '🧵 Tecelagem'
                    : st === PlaceableType.CAMPFIRE
                    ? '🔥 Fogueira'
                    : st === PlaceableType.FURNACE
                    ? '🧱 Fornalha'
                    : '✦ Altar';
                return (
                  <button
                    key={st || 'HAND'}
                    onClick={() => {
                      setActiveStation(st);
                      setCategoryFilter('ALL');
                      setActiveTab('craft');
                    }}
                    className={`px-2 py-1 text-[10px] font-pixel font-bold rounded-sm border transition-all shrink-0 ${
                      isCurr
                        ? `${theme.slotActiveClass} text-white`
                        : 'bg-black/40 border-white/15 text-[#c4ab7d] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: STATION-SPECIFIC CRAFTING HUD                              */}
        {/* ================================================================= */}
        {activeTab === 'craft' && isWeavingStation ? (
          <div
            className={`flex-1 overflow-y-auto p-2.5 sm:p-3.5 flex flex-col gap-3 ${
              weavingOpenGuard ? 'pointer-events-none select-none' : ''
            }`}
          >
            {/* TOP BAR OF WEAVING TABLE: Switch between Janela de Confecção & Janela de Tingimento */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-black/45 border border-fuchsia-400/35 p-2 rounded-sm">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setWeavingWindow('confeccao');
                    setCampfireBannerMsg(null);
                  }}
                  className={`px-3 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 rounded-sm border transition-all ${
                    weavingWindow === 'confeccao'
                      ? `${theme.slotActiveClass} text-white`
                      : 'bg-black/40 border-white/15 text-[#c4ab7d] hover:text-white'
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Janela de Confecção</span>
                </button>
                <button
                  onClick={() => {
                    setWeavingWindow('tingimento');
                    setCampfireBannerMsg(null);
                  }}
                  className={`px-3 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 rounded-sm border transition-all ${
                    weavingWindow === 'tingimento'
                      ? `${theme.slotActiveClass} text-white`
                      : 'bg-black/40 border-white/15 text-[#c4ab7d] hover:text-white'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Janela de Tingimento</span>
                </button>
              </div>

              {campfireBannerMsg && (
                <span className="text-[10px] font-bold text-amber-300 bg-black/60 px-2 py-1 border border-amber-400/40 rounded-sm">
                  {campfireBannerMsg}
                </span>
              )}
            </div>

            {weavingWindow === 'confeccao' ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                {/* LEFT COLUMN (7 cols): 4 Clothing Categories + Recipes + Active Loom Progress */}
                <div className="sm:col-span-7 bg-black/35 border border-white/10 p-2.5 space-y-2.5 flex flex-col">
                  {/* 4 Clothing Categories: Cabeça, Superior, Inferior, Pés */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'head' as EquipmentSlot, label: '1. Cabeça' },
                          { id: 'body' as EquipmentSlot, label: '2. Superior' },
                          { id: 'legs' as EquipmentSlot, label: '3. Inferior' },
                          { id: 'feet' as EquipmentSlot, label: '4. Pés' },
                        ] as const
                      ).map((cat) => {
                        const count = stationRecipes.filter((r) => {
                          const out = ITEMS[r.resultItemId];
                          return (out?.clothingCategory || out?.equipSlot) === cat.id;
                        }).length;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setWeavingCategory(cat.id)}
                            className={`px-2.5 py-1 text-[10px] font-pixel font-bold border rounded-sm transition-all ${
                              weavingCategory === cat.id
                                ? `${theme.slotActiveClass} text-white`
                                : 'bg-black/40 border-white/15 text-[#c4ab7d] hover:text-white'
                            }`}
                          >
                            {cat.label} ({count})
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-fuchsia-300 font-pixel">
                      Roupas (-1% Dano)
                    </span>
                  </div>

                  {/* Clothing Recipe Grid */}
                  <div className="max-h-[260px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 content-start auto-rows-max">
                      {filteredRecipes.map((recipe) => {
                        const baseItem = ITEMS[recipe.resultItemId];
                        if (!baseItem) return null;
                        const isSelected = selectedRecipe?.id === recipe.id;
                        const previewItemId =
                          isSelected && baseItem.canBeDyed
                            ? getDyedGarmentItemId(baseItem.id, craftColorId)
                            : baseItem.id;
                        const canCraft = engine.getMaxCraftableCount(recipe) > 0;
                        const isWeavingThis =
                          weavingState?.cookingRecipeId === recipe.id &&
                          (weavingState?.cookingInputCount || 0) > 0;

                        return (
                          <button
                            key={recipe.id}
                            onClick={() => setSelectedRecipeId(recipe.id)}
                            className={`relative h-[64px] w-full p-1.5 flex flex-col items-center justify-center transition-transform rounded-sm ${
                              isSelected ? theme.slotActiveClass : 'mc-slot'
                            } ${!canCraft && !isWeavingThis ? 'opacity-60' : ''}`}
                            title={baseItem.name}
                          >
                            <img
                              src={spriteAtlas.getItemIconUrl(previewItemId)}
                              alt={baseItem.name}
                              className="w-7 h-7 pixelated"
                            />
                            <span className="mt-1 text-[9px] text-white font-bold truncate max-w-full">
                              {baseItem.name}
                            </span>
                            <span className="absolute top-0.5 left-0.5 px-1 bg-black/75 text-[8px] font-mono-tabular text-fuchsia-300 rounded-sm">
                              {formatCraftDuration(recipe.craftTimeSec)}
                            </span>
                            {isWeavingThis ? (
                              <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-fuchsia-400 animate-ping" />
                            ) : (
                              <span
                                className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                                  canCraft ? 'bg-emerald-400' : 'bg-stone-600'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Loom / Weaving Queue & Output Box */}
                  {weavingState && (
                    <div className="mt-2 p-2.5 bg-[#24112e] border border-fuchsia-400/50 rounded-sm space-y-2">
                      <div className="flex items-center justify-between border-b border-white/10 pb-1">
                        <span className="font-pixel text-[10px] font-bold text-fuchsia-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          ANDAMENTO DA CONFECÇÃO & SAÍDA DO TEAR
                        </span>
                        <span className="text-[9px] font-mono-tabular text-[#c4ab7d]">
                          {(weavingState.cookingInputCount || 0) > 0
                            ? '🧵 Confeccionando peça...'
                            : (weavingState.outputCount || 0) > 0
                            ? '✨ Peça pronta para recolher!'
                            : 'Tear livre'}
                        </span>
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-center bg-black/40 p-2 rounded-sm border border-white/10">
                        {/* Active Weaving Slot */}
                        <div className="col-span-5 flex items-center gap-2">
                          <div className="w-10 h-10 mc-slot flex items-center justify-center shrink-0">
                            {weavingState.cookingRecipeId &&
                            (weavingState.cookingInputCount || 0) > 0 ? (
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  weavingState.weavingTargetItemId ||
                                    RECIPES.find(
                                      (r) => r.id === weavingState.cookingRecipeId
                                    )?.resultItemId ||
                                    'wool'
                                )}
                                alt="Em confecção"
                                className="w-6 h-6 pixelated"
                              />
                            ) : (
                              <Scissors className="w-4 h-4 text-stone-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] text-fuchsia-300 font-pixel">
                              NO TEAR:
                            </div>
                            <div className="text-[10px] font-bold text-white truncate">
                              {weavingState.cookingRecipeId &&
                              (weavingState.cookingInputCount || 0) > 0
                                ? ITEMS[
                                    weavingState.weavingTargetItemId || ''
                                  ]?.name || 'Confeccionando...'
                                : 'Nenhuma peça'}
                            </div>
                            {(weavingState.cookingInputCount || 0) > 0 && (
                              <button
                                onClick={() => engine.cancelWeavingStationQueue()}
                                className="text-[9px] text-rose-400 hover:underline font-bold"
                              >
                                Cancelar e devolver itens
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="col-span-4 flex flex-col items-center gap-1">
                          {(() => {
                            const wCount = weavingState.cookingInputCount || 0;
                            const wProg = weavingState.cookingProgress || 0;
                            const wDur = Math.max(
                              1,
                              weavingState.cookingDuration || 120
                            );
                            const wPct =
                              wCount > 0
                                ? Math.min(100, Math.max(0, (wProg / wDur) * 100))
                                : 0;
                            const remSec = Math.max(0, Math.ceil(wDur - wProg));
                            return (
                              <>
                                <div className="text-[9px] font-mono-tabular text-fuchsia-200 font-bold">
                                  {wCount > 0
                                    ? `Restante: ${formatCraftDuration(remSec)}`
                                    : 'Aguardando'}
                                </div>
                                <div className="w-full h-2.5 bg-stone-900 border border-stone-600 rounded-sm overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-fuchsia-500 via-pink-400 to-emerald-400 transition-all duration-150"
                                    style={{ width: `${wPct}%` }}
                                  />
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {/* Output Slot */}
                        <div className="col-span-3 flex flex-col items-center justify-center gap-1">
                          {weavingState.outputItemId &&
                          (weavingState.outputCount || 0) > 0 ? (
                            <button
                              onClick={() => engine.collectWeavingStationOutput()}
                              className="w-full py-1.5 px-2 medieval-btn-emerald font-pixel text-[9px] font-bold flex items-center justify-center gap-1 animate-pulse"
                            >
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  weavingState.outputItemId
                                )}
                                alt=""
                                className="w-4 h-4 pixelated"
                              />
                              <span>Recolher</span>
                            </button>
                          ) : (
                            <span className="text-[9px] text-stone-400">
                              Saída vazia
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN (5 cols): Selected Clothing Recipe + 17-Color Picker + Craft Button */}
                <div className="sm:col-span-5 space-y-2.5">
                  {selectedRecipe && resultItem ? (
                    <div className="bg-black/40 border border-white/15 p-3 rounded-sm space-y-2.5">
                      {(() => {
                        const targetPreviewId = resultItem.canBeDyed
                          ? getDyedGarmentItemId(resultItem.id, craftColorId)
                          : resultItem.id;
                        const targetPreviewItem =
                          ITEMS[targetPreviewId] || resultItem;

                        return (
                          <>
                            <div className="flex items-start gap-2.5 border-b border-white/10 pb-2">
                              <div
                                className={`w-12 h-12 flex items-center justify-center shrink-0 rounded-sm ${theme.slotActiveClass}`}
                              >
                                <img
                                  src={spriteAtlas.getItemIconUrl(
                                    targetPreviewItem.id
                                  )}
                                  alt={targetPreviewItem.name}
                                  className="w-8 h-8 pixelated"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="font-pixel text-xs font-bold text-white">
                                  {targetPreviewItem.name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9px]">
                                  <span className="px-1.5 py-0.5 bg-fuchsia-950/90 text-fuchsia-200 border border-fuchsia-400/50 font-bold">
                                    Slot: {equipSlotLabel(resultItem.equipSlot)}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-sky-950/80 border border-sky-500/40 text-sky-300 font-bold">
                                    🛡 -1% de Dano
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-orange-950/90 text-orange-300 border border-orange-500/50 flex items-center gap-1 font-bold">
                                    <Clock className="w-3 h-3" />
                                    <span>
                                      Tempo:{' '}
                                      {formatCraftDuration(
                                        selectedRecipe.craftTimeSec
                                      )}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            <p className="text-[10px] text-[#e5d5b5] leading-snug">
                              {targetPreviewItem.description}
                            </p>

                            {/* Color Picker at Crafting Time (only for costura/couro pieces!) */}
                            {resultItem.canBeDyed ? (
                              <div className="space-y-1.5 pt-1 border-t border-white/10">
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="font-pixel text-fuchsia-300">
                                    COR DA PEÇA (17 CORES DE TINGIMENTO):
                                  </span>
                                  <span className="text-white font-bold">
                                    {
                                      CLOTHING_COLORS.find(
                                        (c) => c.id === craftColorId
                                      )?.label
                                    }
                                    {craftColorId ===
                                    (resultItem.garmentColorId || 'branco') ? (
                                      <span className="ml-1 text-emerald-300 text-[8px]">
                                        (Padrão · Sem Corante)
                                      </span>
                                    ) : (
                                      <span className="ml-1 text-fuchsia-300 text-[8px]">
                                        (Requer Corante)
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="grid grid-cols-9 gap-1">
                                  {CLOTHING_COLORS.map((col) => {
                                    const active = craftColorId === col.id;
                                    const isDefault =
                                      col.id ===
                                      (resultItem.garmentColorId || 'branco');
                                    const dyeId = getDyeItemIdForColor(col.id);
                                    const hasDye =
                                      isDefault || engine.getItemCount(dyeId) > 0;
                                    return (
                                      <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => setCraftColorId(col.id)}
                                        title={
                                          isDefault
                                            ? `${col.label} (Cor Padrão - Não requer corante)`
                                            : `${col.label} (${
                                                hasDye
                                                  ? 'Corante disponível'
                                                  : 'Requer 1x ' +
                                                    (ITEMS[dyeId]?.name ||
                                                      'Corante')
                                              })`
                                        }
                                        className={`relative h-5 rounded-sm border transition-transform ${
                                          active
                                            ? 'border-white ring-2 ring-fuchsia-400 scale-110 z-10'
                                            : 'border-black/60 hover:scale-105'
                                        }`}
                                        style={{ backgroundColor: col.hex }}
                                      >
                                        {!isDefault && hasDye && (
                                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-black" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="p-2 bg-stone-900/80 border border-stone-600/60 rounded-sm text-[9px] text-amber-200">
                                ✦ Esta peça não é de costura/couro e{' '}
                                <b>não pode ser tingida</b>.
                              </div>
                            )}

                            {/* Ingredients List + Optional Dye Requirement */}
                            {(() => {
                              const defaultColor: ClothingColorId =
                                resultItem.garmentColorId || 'branco';
                              const requiresDye = Boolean(
                                resultItem.canBeDyed &&
                                  craftColorId !== defaultColor
                              );
                              const requiredDyeId = requiresDye
                                ? getDyeItemIdForColor(craftColorId)
                                : null;
                              const requiredDyeDef = requiredDyeId
                                ? ITEMS[requiredDyeId]
                                : null;
                              const haveDye = requiredDyeId
                                ? engine.getItemCount(requiredDyeId)
                                : 1;
                              const enoughDye = !requiresDye || haveDye >= 1;
                              const canWeaveNow =
                                !weavingOpenGuard &&
                                maxCraftCount > 0 &&
                                enoughDye &&
                                !(
                                  weavingState?.cookingInputCount &&
                                  weavingState.cookingInputCount > 0
                                );

                              return (
                                <>
                                  <div className="space-y-1 pt-1 border-t border-white/10">
                                    <span className="text-[9px] font-pixel text-[#c4ab7d] block">
                                      MATERIAIS DE CONFECÇÃO:
                                    </span>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {selectedRecipe.ingredients.map((ing) => {
                                        const ingDef = ITEMS[ing.itemId];
                                        const have = engine.getItemCount(
                                          ing.itemId
                                        );
                                        const enough = have >= ing.count;
                                        return (
                                          <div
                                            key={ing.itemId}
                                            className={`p-1.5 rounded-sm border flex items-center justify-between gap-1.5 ${
                                              enough
                                                ? 'bg-black/45 border-emerald-500/40'
                                                : 'bg-rose-950/30 border-rose-500/40'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <img
                                                src={spriteAtlas.getItemIconUrl(
                                                  ing.itemId
                                                )}
                                                alt={ingDef?.name || ing.itemId}
                                                className="w-5 h-5 pixelated shrink-0"
                                              />
                                              <span className="text-[10px] text-white truncate">
                                                {ingDef?.name || ing.itemId}
                                              </span>
                                            </div>
                                            <span
                                              className={`text-[10px] font-mono-tabular font-bold shrink-0 ${
                                                enough
                                                  ? 'text-emerald-400'
                                                  : 'text-rose-400'
                                              }`}
                                            >
                                              {have}/{ing.count}
                                            </span>
                                          </div>
                                        );
                                      })}

                                      {requiresDye && requiredDyeId && (
                                        <div
                                          className={`col-span-2 p-1.5 rounded-sm border flex items-center justify-between gap-1.5 ${
                                            enoughDye
                                              ? 'bg-fuchsia-950/35 border-emerald-500/50'
                                              : 'bg-rose-950/40 border-rose-500/50'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <img
                                              src={spriteAtlas.getItemIconUrl(
                                                requiredDyeId
                                              )}
                                              alt={
                                                requiredDyeDef?.name ||
                                                requiredDyeId
                                              }
                                              className="w-5 h-5 pixelated shrink-0"
                                            />
                                            <span className="text-[10px] text-fuchsia-200 font-bold truncate">
                                              {requiredDyeDef?.name ||
                                                requiredDyeId}{' '}
                                              (Cor escolhida)
                                            </span>
                                          </div>
                                          <span
                                            className={`text-[10px] font-mono-tabular font-bold shrink-0 ${
                                              enoughDye
                                                ? 'text-emerald-400'
                                                : 'text-rose-400'
                                            }`}
                                          >
                                            {haveDye}/1
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    disabled={!canWeaveNow}
                                    onClick={() => {
                                      if (weavingOpenGuard) return;
                                      const res = engine.startWeavingTableCraft(
                                        selectedRecipe.id,
                                        resultItem.canBeDyed
                                          ? craftColorId
                                          : undefined
                                      );
                                      setCampfireBannerMsg(res.message);
                                    }}
                                    className={`w-full min-h-[38px] px-3 py-1.5 font-pixel text-[11px] font-bold flex items-center justify-center gap-1.5 ${
                                      canWeaveNow
                                        ? theme.primaryBtnClass
                                        : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                                    }`}
                                  >
                                    <Scissors className="w-4 h-4" />
                                    <span>
                                      {weavingState?.cookingInputCount &&
                                      weavingState.cookingInputCount > 0
                                        ? 'Tear Ocupado...'
                                        : !enoughDye
                                        ? `Falta ${
                                            requiredDyeDef?.name || 'Corante'
                                          }`
                                        : 'Confeccionar'}
                                    </span>
                                  </button>
                                </>
                              );
                            })()}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              /* ============================================================= */
              /* JANELA DE TINGIMENTO (TINGIR ROUPAS DE COSTURA E COURO)       */
              /* ============================================================= */
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                {/* LEFT COLUMN (7 cols): Select Garment from Equipped or Inventory */}
                <div className="sm:col-span-7 bg-black/35 border border-white/10 p-2.5 space-y-3">
                  <div className="space-y-1.5">
                    <span className="font-pixel text-[10px] text-fuchsia-300 block">
                      ROUPAS EQUIPADAS NO PERSONAGEM:
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          { slot: 'head' as EquipmentSlot, label: 'Cabeça' },
                          { slot: 'body' as EquipmentSlot, label: 'Superior' },
                          { slot: 'legs' as EquipmentSlot, label: 'Inferior' },
                          { slot: 'feet' as EquipmentSlot, label: 'Pés' },
                        ] as const
                      ).map(({ slot, label }) => {
                        const eqId =
                          player.equippedBySlot?.[slot] ??
                          (slot === 'body' ? player.equippedArmorId : null);
                        const itemDef = eqId ? ITEMS[eqId] : null;
                        const isClothing = Boolean(itemDef?.isClothing);
                        const canDye = Boolean(itemDef?.canBeDyed);
                        const isSel =
                          selectedDyeSource?.kind === 'equipped' &&
                          selectedDyeSource.equipSlot === slot;

                        return (
                          <button
                            key={slot}
                            disabled={!isClothing}
                            onClick={() => {
                              setSelectedDyeSource({
                                kind: 'equipped',
                                equipSlot: slot,
                              });
                              if (itemDef?.garmentColorId) {
                                setTargetDyeColorId(itemDef.garmentColorId);
                              }
                            }}
                            className={`p-2 rounded-sm border flex flex-col items-center gap-1 transition-all ${
                              isSel
                                ? theme.slotActiveClass
                                : isClothing
                                ? 'mc-slot hover:border-fuchsia-400/70'
                                : 'mc-slot opacity-45 cursor-not-allowed'
                            }`}
                          >
                            <span className="text-[8px] font-pixel text-[#c4ab7d]">
                              {label}
                            </span>
                            {itemDef ? (
                              <>
                                <img
                                  src={spriteAtlas.getItemIconUrl(itemDef.id)}
                                  alt={itemDef.name}
                                  className="w-6 h-6 pixelated"
                                />
                                <span className="text-[9px] font-bold text-white truncate max-w-full">
                                  {itemDef.name}
                                </span>
                                <span
                                  className={`text-[8px] ${
                                    canDye
                                      ? 'text-emerald-300'
                                      : 'text-amber-300'
                                  }`}
                                >
                                  {canDye
                                    ? 'Pode tingir'
                                    : isClothing
                                    ? 'Não tingível'
                                    : 'Armadura'}
                                </span>
                              </>
                            ) : (
                              <span className="text-[9px] text-stone-500 py-3">
                                Vazio
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-white/10">
                    <span className="font-pixel text-[10px] text-fuchsia-300 block">
                      ROUPAS NA MOCHILA:
                    </span>
                    {(() => {
                      const invClothing = player.inventory
                        .map((slot, idx) => ({
                          slot,
                          idx,
                          def: slot ? ITEMS[slot.itemId] : null,
                        }))
                        .filter((entry) => entry.slot && entry.def?.isClothing);

                      if (invClothing.length === 0) {
                        return (
                          <div className="py-6 text-center text-[10px] text-[#c4ab7d]">
                            Nenhuma roupa guardada na mochila no momento.
                          </div>
                        );
                      }

                      return (
                        <div className="max-h-[210px] overflow-y-auto pr-1">
                          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 content-start auto-rows-max">
                            {invClothing.map(({ slot, idx, def }) => {
                              if (!slot || !def) return null;
                              const isSel =
                                selectedDyeSource?.kind === 'inventory' &&
                                selectedDyeSource.slotIndex === idx;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    setSelectedDyeSource({
                                      kind: 'inventory',
                                      slotIndex: idx,
                                    });
                                    if (def.garmentColorId) {
                                      setTargetDyeColorId(def.garmentColorId);
                                    }
                                  }}
                                  className={`h-[64px] w-full p-1.5 rounded-sm border flex flex-col items-center justify-center gap-1 relative ${
                                    isSel ? theme.slotActiveClass : 'mc-slot'
                                  }`}
                                >
                                  <img
                                    src={spriteAtlas.getItemIconUrl(def.id)}
                                    alt={def.name}
                                    className="w-6 h-6 pixelated"
                                  />
                                  <span className="text-[9px] text-white font-bold truncate max-w-full">
                                    {def.name}
                                  </span>
                                  <span
                                    className={`text-[8px] ${
                                      def.canBeDyed
                                        ? 'text-emerald-300'
                                        : 'text-amber-300'
                                    }`}
                                  >
                                    {def.canBeDyed
                                      ? 'Tingível'
                                      : 'Não tingível'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* RIGHT COLUMN (5 cols): Dye Palette & Apply Button */}
                <div className="sm:col-span-5 bg-black/40 border border-white/15 p-3 rounded-sm space-y-3">
                  {(() => {
                    let currentItemDef = null;
                    if (selectedDyeSource?.kind === 'equipped') {
                      const eqId =
                        player.equippedBySlot?.[selectedDyeSource.equipSlot] ??
                        (selectedDyeSource.equipSlot === 'body'
                          ? player.equippedArmorId
                          : null);
                      if (eqId) currentItemDef = ITEMS[eqId] || null;
                    } else if (selectedDyeSource?.kind === 'inventory') {
                      const st = player.inventory[selectedDyeSource.slotIndex];
                      if (st) currentItemDef = ITEMS[st.itemId] || null;
                    }

                    if (!currentItemDef || !currentItemDef.isClothing) {
                      return (
                        <div className="py-10 text-center text-xs text-[#c4ab7d]">
                          Selecione uma peça de roupa equipada ou da mochila ao
                          lado para tingi-la.
                        </div>
                      );
                    }

                    const previewDyedId = currentItemDef.canBeDyed
                      ? getDyedGarmentItemId(
                          currentItemDef.id,
                          targetDyeColorId
                        )
                      : currentItemDef.id;
                    const previewDyedDef =
                      ITEMS[previewDyedId] || currentItemDef;

                    return (
                      <>
                        <div className="flex items-center gap-3 border-b border-white/10 pb-2.5">
                          <div
                            className={`w-12 h-12 flex items-center justify-center rounded-sm shrink-0 ${theme.slotActiveClass}`}
                          >
                            <img
                              src={spriteAtlas.getItemIconUrl(
                                previewDyedDef.id
                              )}
                              alt={previewDyedDef.name}
                              className="w-8 h-8 pixelated"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] text-fuchsia-300 font-pixel">
                              RESULTADO DO TINGIMENTO:
                            </div>
                            <div className="font-pixel text-xs font-bold text-white truncate">
                              {previewDyedDef.name}
                            </div>
                            <div className="text-[10px] text-[#c4ab7d]">
                              Atual: {currentItemDef.name}
                            </div>
                          </div>
                        </div>

                        {currentItemDef.canBeDyed ? (
                          <>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[9px]">
                                <span className="font-pixel text-fuchsia-300">
                                  ESCOLHA A COR (17 TONALIDADES):
                                </span>
                                <span className="font-bold text-white">
                                  {
                                    CLOTHING_COLORS.find(
                                      (c) => c.id === targetDyeColorId
                                    )?.label
                                  }
                                </span>
                              </div>
                                <div className="grid grid-cols-6 gap-1.5">
                                  {CLOTHING_COLORS.map((col) => {
                                    const active = targetDyeColorId === col.id;
                                    const dyeId = getDyeItemIdForColor(col.id);
                                    const hasDye =
                                      engine.getItemCount(dyeId) >= 1;
                                    return (
                                      <button
                                        key={col.id}
                                        type="button"
                                        onClick={() =>
                                          setTargetDyeColorId(col.id)
                                        }
                                        className={`relative p-1 rounded-sm border flex flex-col items-center gap-0.5 transition-all ${
                                          active
                                            ? 'border-white bg-white/15 ring-1 ring-fuchsia-300'
                                            : 'border-white/15 bg-black/40 hover:border-white/40'
                                        }`}
                                      >
                                        <span
                                          className="w-5 h-3.5 rounded-sm border border-black/60"
                                          style={{ backgroundColor: col.hex }}
                                        />
                                        <span className="text-[7px] text-white truncate max-w-full">
                                          {col.label}
                                        </span>
                                        {hasDye && (
                                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-black" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {(() => {
                                const requiredDyeId =
                                  getDyeItemIdForColor(targetDyeColorId);
                                const requiredDyeDef = ITEMS[requiredDyeId];
                                const haveDye =
                                  engine.getItemCount(requiredDyeId);
                                const enoughDye = haveDye >= 1;
                                const isSameColor =
                                  previewDyedId === currentItemDef.id;
                                const canDyeNow =
                                  !weavingOpenGuard &&
                                  !isSameColor &&
                                  enoughDye;

                                return (
                                  <>
                                    <div className="space-y-1 pt-1 border-t border-white/10">
                                      <span className="text-[9px] font-pixel text-[#c4ab7d] block">
                                        CORANTE NECESSÁRIO:
                                      </span>
                                      <div
                                        className={`p-1.5 rounded-sm border flex items-center justify-between gap-2 ${
                                          enoughDye
                                            ? 'bg-black/45 border-emerald-500/50'
                                            : 'bg-rose-950/40 border-rose-500/50'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <img
                                            src={spriteAtlas.getItemIconUrl(
                                              requiredDyeId
                                            )}
                                            alt={
                                              requiredDyeDef?.name ||
                                              requiredDyeId
                                            }
                                            className="w-5 h-5 pixelated shrink-0"
                                          />
                                          <span className="text-[10px] text-white font-bold truncate">
                                            {requiredDyeDef?.name ||
                                              requiredDyeId}
                                          </span>
                                        </div>
                                        <span
                                          className={`text-[10px] font-mono-tabular font-bold shrink-0 ${
                                            enoughDye
                                              ? 'text-emerald-400'
                                              : 'text-rose-400'
                                          }`}
                                        >
                                          {haveDye}/1
                                        </span>
                                      </div>
                                    </div>

                                    <button
                                      disabled={!canDyeNow}
                                      onClick={() => {
                                        if (
                                          weavingOpenGuard ||
                                          !selectedDyeSource
                                        )
                                          return;
                                        const res = engine.dyeClothingItem(
                                          selectedDyeSource,
                                          targetDyeColorId
                                        );
                                        setCampfireBannerMsg(res.message);
                                      }}
                                      className={`w-full min-h-[38px] px-3 py-1.5 font-pixel text-[11px] font-bold flex items-center justify-center gap-1.5 ${
                                        canDyeNow
                                          ? 'medieval-btn-gold'
                                          : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                                      }`}
                                    >
                                      <Palette className="w-4 h-4" />
                                      <span>
                                        {isSameColor
                                          ? 'Já está nesta cor'
                                          : !enoughDye
                                          ? `Falta ${
                                              requiredDyeDef?.name || 'Corante'
                                            }`
                                          : 'Tingir Peça'}
                                      </span>
                                    </button>
                                  </>
                                );
                              })()}
                            </>
                        ) : (
                          <div className="p-3 bg-stone-900/90 border border-amber-500/40 rounded-sm text-[10px] text-amber-200 leading-relaxed">
                            ✦ <b>{currentItemDef.name}</b> não é uma peça de
                            costura ou de couro, portanto{' '}
                            <b>não pode ser tingido</b>.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'craft' && isThermalStation ? (
          /* ================================================================= */
          /* CAMPFIRE & FURNACE: 2-COLUMN DIRECT INTERFACE                     */
          /* LEFT = PLAYER INVENTORY | RIGHT = 3 INTERACTIVE THERMAL FIELDS    */
          /* ================================================================= */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            {/* LEFT COLUMN (7 cols): Player Inventory (Backpack 24 + Hotbar 8) */}
            <div className="sm:col-span-7 medieval-inset p-2.5 space-y-2.5">
              {/* 3x8 Backpack */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-pixel text-[#c4ab7d]">
                    MOCHILA (24 SLOTS · 3x8)
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
                          draggable={Boolean(slot && slot.count > 0)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(idx));
                            setSelectedInvIndex(idx);
                          }}
                          onClick={() => handleInventorySlotClick(idx)}
                          className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 ${
                            isSel
                              ? 'mc-slot-active ring-2 ring-amber-400'
                              : selectedInvIndex !== null
                              ? 'mc-slot hover:border-amber-400/70'
                              : 'mc-slot'
                          }`}
                          title={def ? `${def.name} (x${slot?.count})` : undefined}
                        >
                          {slot && def ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  slot.itemId,
                                  slot.selectedColor
                                )}
                                alt={def.name}
                                className="w-5 h-5 sm:w-6 sm:h-6 pixelated pointer-events-none"
                              />
                              {slot.count > 1 && (
                                <span className="absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold text-[#fef08a] pointer-events-none">
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
                        draggable={Boolean(slot && slot.count > 0)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(idx));
                          setSelectedInvIndex(idx);
                        }}
                        onClick={() => handleInventorySlotClick(idx)}
                        className={`relative aspect-square min-h-[38px] sm:min-h-[44px] flex flex-col items-center justify-center p-0.5 ${
                          isSel
                            ? 'mc-slot-active ring-2 ring-amber-400'
                            : selectedInvIndex !== null
                            ? 'mc-slot hover:border-amber-400/70'
                            : 'mc-slot'
                        }`}
                        title={def ? `${def.name} (x${slot?.count})` : undefined}
                      >
                        <span className="absolute top-0 left-0.5 text-[7px] font-mono-tabular text-amber-400/80 pointer-events-none">
                          {idx + 1}
                        </span>
                        {slot && def ? (
                          <>
                            <img
                              src={spriteAtlas.getItemIconUrl(
                                slot.itemId,
                                slot.selectedColor
                              )}
                              alt={def.name}
                              className="w-5 h-5 sm:w-6 sm:h-6 pixelated pointer-events-none"
                            />
                            {slot.count > 1 && (
                              <span className="absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold text-[#fef08a] pointer-events-none">
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

            {/* RIGHT COLUMN (5 cols): Station-Themed 3-Slot Processing Chamber */}
            <div className="sm:col-span-5 flex items-center justify-center">
              {(() => {
                const stationType = activeStation as
                  | PlaceableType.CAMPFIRE
                  | PlaceableType.FURNACE;
                const isCampfire = stationType === PlaceableType.CAMPFIRE;

                const selectedInvSlot =
                  selectedInvIndex !== null
                    ? player.inventory[selectedInvIndex]
                    : null;
                const selectedCanBeInput = Boolean(
                  selectedInvSlot &&
                    engine.canItemBeProcessedInThermalStation(
                      stationType,
                      selectedInvSlot.itemId
                    )
                );
                const selectedCanBeFuel = Boolean(
                  selectedInvSlot && FUEL_ITEMS[selectedInvSlot.itemId]
                );

                const activeInputItemId = activeCookingRecipe
                  ? thermalState?.cookingMaterialOptionId ||
                    engine.getRecipeActiveIngredients(
                      activeCookingRecipe,
                      thermalState?.cookingMaterialOptionId || undefined
                    )[0]?.itemId ||
                    activeCookingRecipe.resultItemId
                  : null;
                const activeInputDef = activeInputItemId
                  ? ITEMS[activeInputItemId] || null
                  : null;

                const handleInputSlotInteract = (slotIdxOverride?: number) => {
                  const targetInvIdx =
                    slotIdxOverride !== undefined
                      ? slotIdxOverride
                      : selectedInvIndex;
                  if (targetInvIdx !== null) {
                    const deposited = engine.depositInventorySlotToThermalInput(
                      stationType,
                      targetInvIdx
                    );
                    if (
                      deposited &&
                      !engine.player.inventory[targetInvIdx]
                    ) {
                      setSelectedInvIndex(null);
                    }
                    return;
                  }
                  if (cookingInputCount > 0) {
                    engine.cancelThermalStationQueue(stationType);
                  }
                };

                const handleFuelSlotInteract = (slotIdxOverride?: number) => {
                  const targetInvIdx =
                    slotIdxOverride !== undefined
                      ? slotIdxOverride
                      : selectedInvIndex;
                  if (targetInvIdx !== null) {
                    const deposited = engine.depositInventorySlotToThermalFuel(
                      stationType,
                      targetInvIdx
                    );
                    if (
                      deposited &&
                      !engine.player.inventory[targetInvIdx]
                    ) {
                      setSelectedInvIndex(null);
                    }
                    return;
                  }
                  if ((thermalState?.fuelCount || 0) > 0) {
                    engine.removeFuelFromThermalStation(stationType);
                  }
                };

                const handleOutputSlotInteract = () => {
                  if (outputItemDef && outputCount > 0) {
                    engine.collectThermalStationOutput(stationType);
                  }
                };

                return (
                  <div
                    className={`w-full py-7 px-5 rounded-sm border-2 flex items-center justify-center relative overflow-hidden ${
                      isCampfire
                        ? 'bg-gradient-to-b from-[#2c1207] via-[#1c0b05] to-[#120603] border-orange-500/80 shadow-[inset_0_0_36px_rgba(249,115,22,0.22)]'
                        : 'bg-gradient-to-b from-[#252229] via-[#18161c] to-[#0f0d12] border-red-500/80 shadow-[inset_0_0_36px_rgba(239,68,68,0.25)]'
                    }`}
                  >
                    {/* Subtle Station Watermark Identity */}
                    <img
                      src={spriteAtlas.getItemIconUrl(
                        isCampfire ? 'campfire' : 'furnace'
                      )}
                      alt=""
                      className="w-24 h-24 pixelated opacity-[0.07] absolute -bottom-3 -right-3 pointer-events-none"
                    />

                    <div className="flex items-center justify-center gap-5 sm:gap-7 relative z-10">
                      {/* Left Stack: [1] Input Slot (Top) -> Flame Indicator -> [2] Fuel Slot (Bottom) */}
                      <div className="flex flex-col items-center gap-3">
                        {/* FIELD 1: Item a ser processado (Input) */}
                        <button
                          type="button"
                          onClick={() => handleInputSlotInteract()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const idx = Number(
                              e.dataTransfer.getData('text/plain')
                            );
                            if (Number.isInteger(idx) && idx >= 0) {
                              handleInputSlotInteract(idx);
                            }
                          }}
                          className={`w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-sm flex items-center justify-center relative transition-all ${
                            selectedCanBeInput
                              ? isCampfire
                                ? 'bg-[#3b1709] border-2 border-orange-400 ring-2 ring-orange-400/50 shadow-[0_0_14px_rgba(251,146,60,0.45)]'
                                : 'bg-[#2f1414] border-2 border-red-400 ring-2 ring-red-400/50 shadow-[0_0_14px_rgba(248,113,113,0.45)]'
                              : activeInputDef && cookingInputCount > 0
                              ? isCampfire
                                ? 'bg-[#2b1107] border-2 border-orange-500/80'
                                : 'bg-[#261619] border-2 border-red-500/80'
                              : isCampfire
                              ? 'bg-[#170904] border-2 border-orange-900/70 hover:border-orange-500/60'
                              : 'bg-[#121015] border-2 border-stone-700 hover:border-red-500/60'
                          }`}
                        >
                          {activeInputDef && cookingInputCount > 0 ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  activeInputDef.id
                                )}
                                alt={activeInputDef.name}
                                className="w-9 h-9 pixelated pointer-events-none"
                              />
                              <span className="absolute bottom-0.5 right-1 text-[11px] font-mono-tabular font-extrabold text-[#fef08a] drop-shadow pointer-events-none">
                                x{cookingInputCount}
                              </span>
                            </>
                          ) : null}
                        </button>

                        {/* Active Flame Gauge between Input and Fuel */}
                        <div className="flex flex-col items-center gap-1">
                          <div className="relative w-7 h-7 flex items-center justify-center">
                            <Flame
                              className="w-6 h-6 text-stone-700/70"
                              strokeWidth={2}
                            />
                            {fuelBurnRem > 0 && (
                              <div
                                className="absolute bottom-0 left-0 right-0 overflow-hidden flex items-end justify-center transition-all duration-150"
                                style={{ height: `${fuelFlamePct}%` }}
                              >
                                <Flame
                                  className={`w-6 h-6 shrink-0 ${
                                    isCampfire
                                      ? 'text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.85)]'
                                      : 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.85)]'
                                  }`}
                                  strokeWidth={2}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* FIELD 2: Combustível (Fuel) — Opaque simple fire icon when empty */}
                        <button
                          type="button"
                          onClick={() => handleFuelSlotInteract()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const idx = Number(
                              e.dataTransfer.getData('text/plain')
                            );
                            if (Number.isInteger(idx) && idx >= 0) {
                              handleFuelSlotInteract(idx);
                            }
                          }}
                          className={`w-16 h-16 sm:w-[68px] sm:h-[68px] rounded-sm flex items-center justify-center relative transition-all ${
                            selectedCanBeFuel
                              ? 'bg-[#3b1c08] border-2 border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
                              : fuelItemDef && (thermalState?.fuelCount || 0) > 0
                              ? 'bg-[#291307] border-2 border-orange-500/80'
                              : isCampfire
                              ? 'bg-[#170904] border-2 border-orange-900/70 hover:border-orange-500/60'
                              : 'bg-[#121015] border-2 border-stone-700 hover:border-red-500/60'
                          }`}
                        >
                          {fuelItemDef && (thermalState?.fuelCount || 0) > 0 ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(fuelItemDef.id)}
                                alt={fuelItemDef.name}
                                className="w-9 h-9 pixelated pointer-events-none"
                              />
                              <span className="absolute bottom-0.5 right-1 text-[11px] font-mono-tabular font-extrabold text-[#fef08a] drop-shadow pointer-events-none">
                                x{thermalState?.fuelCount}
                              </span>
                            </>
                          ) : (
                            <Flame
                              className="w-7 h-7 text-orange-400/20 pointer-events-none"
                              strokeWidth={1.75}
                            />
                          )}
                        </button>
                      </div>

                      {/* Center Progress Bar & Arrow */}
                      <div className="flex flex-col items-center justify-center gap-1.5 w-16 sm:w-20">
                        <div className="w-full h-3 bg-black/70 border border-white/15 rounded-sm overflow-hidden">
                          <div
                            className={`h-full transition-all duration-150 ${
                              isCampfire
                                ? 'bg-gradient-to-r from-orange-600 via-amber-400 to-yellow-300'
                                : 'bg-gradient-to-r from-red-600 via-orange-500 to-amber-300'
                            }`}
                            style={{ width: `${cookingPct}%` }}
                          />
                        </div>
                        <ArrowRight
                          className={`w-6 h-6 ${
                            cookingInputCount > 0 && fuelBurnRem > 0
                              ? isCampfire
                                ? 'text-orange-400 animate-pulse'
                                : 'text-red-400 animate-pulse'
                              : 'text-stone-600'
                          }`}
                        />
                      </div>

                      {/* FIELD 3: Produto (Output) — Only shows processed item for collection on click */}
                      <button
                        type="button"
                        onClick={handleOutputSlotInteract}
                        disabled={!outputItemDef || outputCount <= 0}
                        className={`w-20 h-20 sm:w-[82px] sm:h-[82px] rounded-sm flex items-center justify-center relative transition-all ${
                          outputItemDef && outputCount > 0
                            ? 'bg-emerald-950/75 border-2 border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)] cursor-pointer hover:scale-105'
                            : isCampfire
                            ? 'bg-[#170904] border-2 border-orange-900/70 cursor-default'
                            : 'bg-[#121015] border-2 border-stone-700 cursor-default'
                        }`}
                      >
                        {outputItemDef && outputCount > 0 ? (
                          <>
                            <img
                              src={spriteAtlas.getItemIconUrl(outputItemDef.id)}
                              alt={outputItemDef.name}
                              className="w-10 h-10 pixelated pointer-events-none"
                            />
                            <span className="absolute bottom-1 right-1.5 text-xs font-mono-tabular font-extrabold text-emerald-300 drop-shadow pointer-events-none">
                              x{outputCount}
                            </span>
                          </>
                        ) : null}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : activeTab === 'craft' ? (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {/* LEFT COLUMN (7 cols): Category Filter + Station Recipe Grid */}
            <div className="sm:col-span-7 bg-black/35 border border-white/10 p-2.5 space-y-2.5 flex flex-col">
              {/* Category Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 pb-2">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'ALL', label: 'Todos' },
                      { id: 'TOOL', label: 'Ferram.' },
                      { id: 'WEAPON', label: 'Armas' },
                      { id: 'ARMOR', label: 'Armad.' },
                      { id: 'CONSUMABLE', label: 'Comida/Elixir' },
                      { id: 'PLACEABLE', label: 'Construção' },
                      { id: 'RESOURCE', label: 'Carvão/Minério' },
                    ] as { id: CategoryFilter; label: string }[]
                  ).map((cat) => {
                    const countInCat =
                      cat.id === 'ALL'
                        ? stationRecipes.length
                        : stationRecipes.filter(
                            (r) => ITEMS[r.resultItemId]?.category === cat.id
                          ).length;
                    if (cat.id !== 'ALL' && countInCat === 0) return null;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`px-2 py-1 text-[10px] font-bold border rounded-sm ${
                          categoryFilter === cat.id
                            ? `${theme.slotActiveClass} text-white`
                            : 'bg-black/40 border-white/15 text-[#c4ab7d] hover:text-white'
                        }`}
                      >
                        {cat.label} ({countInCat})
                      </button>
                    );
                  })}
                </div>

                <span className="text-[10px] font-mono-tabular text-[#c4ab7d]">
                  <strong className={theme.accentTextClass}>
                    {stationShortName(activeStation)}
                  </strong>
                </span>
              </div>

              {/* Recipe Slot Grid with Fixed Spacing & Natural Vertical Scroll */}
              <div className="max-h-[340px] overflow-y-auto pr-1">
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 content-start auto-rows-max">
                  {filteredRecipes.map((recipe) => {
                    const item = ITEMS[recipe.resultItemId];
                    if (!item) return null;
                    const maxPossible = engine.getMaxCraftableCount(recipe);
                    const canCraft = maxPossible > 0;
                    const isSelected = selectedRecipe?.id === recipe.id;

                    return (
                      <button
                        key={recipe.id}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                        className={`relative h-[56px] w-full p-1 flex flex-col items-center justify-center transition-transform rounded-sm ${
                          isSelected ? theme.slotActiveClass : 'mc-slot'
                        } ${!canCraft ? 'opacity-55' : ''}`}
                        title={item.name}
                      >
                        <img
                          src={spriteAtlas.getItemIconUrl(recipe.resultItemId)}
                          alt={item.name}
                          className="w-7 h-7 pixelated"
                        />

                        {recipe.resultCount > 1 && (
                          <span className="absolute bottom-0.5 right-1 text-[9px] font-mono-tabular font-extrabold text-white drop-shadow">
                            x{recipe.resultCount}
                          </span>
                        )}

                        {(recipe.craftTimeSec || 0) > 0 && (
                          <span className="absolute top-0.5 left-0.5 px-1 bg-black/75 text-[8px] font-mono-tabular text-orange-300 rounded-sm">
                            {recipe.craftTimeSec}s
                          </span>
                        )}

                        <span
                          className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                            canCraft ? 'bg-emerald-400' : 'bg-stone-600'
                          }`}
                        />
                      </button>
                    );
                  })}

                  {filteredRecipes.length === 0 && (
                    <div className="col-span-6 py-8 text-center text-xs text-[#c4ab7d]">
                      {theme.emptyHint}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (5 cols): Unique Station Apparatus & Recipe Inspector */}
            <div className="sm:col-span-5 space-y-2.5">
              {/* ============================================================= */}
              {/* SELECTED RECIPE DETAILS & UNIQUE STATION CRAFTING MATRIX      */}
              {/* ============================================================= */}
              {selectedRecipe && resultItem ? (
                <div className="bg-black/40 border border-white/15 p-3 rounded-sm space-y-2.5">
                  {/* Item Header */}
                  <div className="flex items-start gap-2.5 border-b border-white/10 pb-2">
                    <div
                      className={`w-12 h-12 flex items-center justify-center shrink-0 rounded-sm ${theme.slotActiveClass}`}
                    >
                      <img
                        src={spriteAtlas.getItemIconUrl(resultItem.id)}
                        alt={resultItem.name}
                        className="w-8 h-8 pixelated"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-pixel text-xs font-bold text-white">
                          {resultItem.name}
                        </h3>
                        {selectedRecipe.resultCount > 1 && (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-sm">
                            Produz x{selectedRecipe.resultCount}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[9px]">
                        <span
                          className={`px-1.5 py-0.5 border font-bold ${
                            rarityBadge(resultItem.rarity).color
                          }`}
                        >
                          {rarityBadge(resultItem.rarity).text}
                        </span>
                        <span className="px-1.5 py-0.5 bg-black/50 text-[#c4ab7d] border border-white/10">
                          {categoryName(resultItem.category)}
                        </span>
                        {(selectedRecipe.craftTimeSec || 0) > 0 ? (
                          <span className="px-1.5 py-0.5 bg-orange-950/90 text-orange-300 border border-orange-500/50 flex items-center gap-1 font-bold">
                            <Clock className="w-3 h-3" />
                            <span>
                              Preparo: {selectedRecipe.craftTimeSec}s
                            </span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold">
                            ⚡ Instantâneo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unique Visual Crafting Diagram for Non-Thermal Stations (2x2 Hand, 3x3 Workbench, Runic Solar Altar) */}
                  {!isThermalStation && (
                    <div className="bg-black/45 p-2 border border-white/10 rounded-sm flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {activeStation === null ? (
                          /* 2x2 Hand Crafting Grid */
                          <div className="grid grid-cols-2 gap-1 p-1 bg-[#1a0f08] border border-amber-700/60 rounded-sm">
                            {[0, 1, 2, 3].map((slotIdx) => {
                              const ing = activeRecipeIngredients[slotIdx];
                              return (
                                <div
                                  key={slotIdx}
                                  className="w-7 h-7 mc-slot flex items-center justify-center relative"
                                >
                                  {ing ? (
                                    <>
                                      <img
                                        src={spriteAtlas.getItemIconUrl(
                                          ing.itemId,
                                          ing.flowerColor
                                        )}
                                        alt=""
                                        className="w-4 h-4 pixelated"
                                      />
                                      <span className="absolute bottom-0 right-0.5 text-[7px] font-mono font-bold text-amber-300">
                                        {ing.count}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : activeStation === PlaceableType.WORKBENCH ? (
                          /* 3x3 Workbench Blueprint Grid */
                          <div className="grid grid-cols-3 gap-0.5 p-1 bg-[#0f172a] border border-amber-500/60 rounded-sm">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((slotIdx) => {
                              const ing = activeRecipeIngredients[slotIdx];
                              return (
                                <div
                                  key={slotIdx}
                                  className="w-6 h-6 bg-[#1e293b] border border-amber-500/30 flex items-center justify-center relative"
                                >
                                  {ing ? (
                                    <>
                                      <img
                                        src={spriteAtlas.getItemIconUrl(
                                          ing.itemId,
                                          ing.flowerColor
                                        )}
                                        alt=""
                                        className="w-4 h-4 pixelated"
                                      />
                                      <span className="absolute bottom-0 right-0.5 text-[7px] font-mono font-bold text-amber-300">
                                        {ing.count}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Solar Altar Runic Matrix */
                          <div className="flex items-center gap-1 p-1.5 bg-[#091526] border border-cyan-400/60 rounded-sm">
                            {activeRecipeIngredients.map((ing, i) => (
                              <div
                                key={i}
                                className="w-7 h-7 bg-[#0c2540] border border-cyan-400/50 rounded-full flex items-center justify-center relative"
                              >
                                <img
                                  src={spriteAtlas.getItemIconUrl(
                                    ing.itemId,
                                    ing.flowerColor
                                  )}
                                  alt=""
                                  className="w-4 h-4 pixelated"
                                />
                                <span className="absolute -bottom-0.5 right-0 text-[7px] font-mono font-bold text-cyan-200">
                                  {ing.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-[9px] text-[#c4ab7d]">
                          <div
                            className={`font-pixel font-bold ${theme.accentTextClass}`}
                          >
                            {theme.matrixTitle}
                          </div>
                          <div>
                            {activeStation === null
                              ? 'Criação rápida na palma da mão'
                              : activeStation === PlaceableType.WORKBENCH
                              ? 'Montagem imediata sem gasto de lenha'
                              : 'Transmutação astral imediata'}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className={`w-4 h-4 ${theme.accentTextClass}`} />
                    </div>
                  )}

                  {/* Description & Stats */}
                  <p className="text-[10px] text-[#e5d5b5] leading-snug">
                    {resultItem.description}
                  </p>

                  {/* Stats Badges */}
                  <div className="flex flex-wrap gap-1.5 text-[9px] font-mono-tabular">
                    {resultItem.toolTier !== undefined && (
                      <span className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-500/40 text-amber-200">
                        ★ Nível: <b>{resultItem.toolTier}</b>
                      </span>
                    )}
                    {resultItem.attackDamage && (
                      <span className="px-1.5 py-0.5 bg-rose-950/80 border border-rose-500/40 text-rose-300">
                        ⚔ ATQ: <b>{resultItem.attackDamage}</b>
                      </span>
                    )}
                    {resultItem.attackDamage && (
                      <span className="px-1.5 py-0.5 bg-slate-900/90 border border-slate-500/40 text-slate-200">
                        {resultItem.attackDelivery === 'ranged'
                          ? '🏹 À Distância'
                          : '🗡 Corpo-a-corpo'}
                      </span>
                    )}
                    {resultItem.attackDamage && (
                      <span
                        className={`px-1.5 py-0.5 border ${
                          resultItem.attackTargetScope === 'area'
                            ? 'bg-purple-950/80 border-purple-500/50 text-purple-200'
                            : 'bg-sky-950/80 border-sky-500/40 text-sky-200'
                        }`}
                      >
                        {resultItem.attackTargetScope === 'area'
                          ? '💥 Em Área'
                          : '🎯 Individual'}
                      </span>
                    )}
                    {resultItem.attackRange && (
                      <span className="px-1.5 py-0.5 bg-indigo-950/80 border border-indigo-500/40 text-indigo-200">
                        📏 Alcance: <b>{resultItem.attackRange} px</b>
                      </span>
                    )}
                    {resultItem.lifesteal && (
                      <span className="px-1.5 py-0.5 bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300">
                        🩸 Cura/Golpe: <b>+{resultItem.lifesteal} HP</b>
                      </span>
                    )}
                    {resultItem.knockbackMult && resultItem.knockbackMult !== 1 && (
                      <span className="px-1.5 py-0.5 bg-orange-950/80 border border-orange-500/40 text-orange-300">
                        💨 Empurrão: <b>{resultItem.knockbackMult}×</b>
                      </span>
                    )}
                    {resultItem.attackSpeedMod !== undefined &&
                      resultItem.attackSpeedMod !== 0 && (
                        <span className="px-1.5 py-0.5 bg-red-950/80 border border-red-500/40 text-red-300">
                          ⏱ Vel. ATK:{' '}
                          <b>
                            {resultItem.attackSpeedMod > 0 ? '+' : ''}
                            {Math.round(resultItem.attackSpeedMod * 100)}%
                          </b>
                        </span>
                      )}
                    {resultItem.coastalSpeedBonus && (
                      <span className="px-1.5 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-200">
                        🌊 Bônus na Costa: <b>+{Math.round(resultItem.coastalSpeedBonus * 100)}% Vel.</b>
                      </span>
                    )}
                    {resultItem.harvestPower && (
                      <span className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-500/40 text-amber-300">
                        ⛏ Coleta: <b>{resultItem.harvestPower}</b>
                      </span>
                    )}
                    {resultItem.defenseBonus && (
                      <span className="px-1.5 py-0.5 bg-sky-950/80 border border-sky-500/40 text-sky-300">
                        🛡 DEF: <b>+{Math.round(resultItem.defenseBonus * 100)}%</b>
                      </span>
                    )}
                    {resultItem.hpRestore && (
                      <span className="px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                        ♥ Vida: <b>+{resultItem.hpRestore} HP</b>
                      </span>
                    )}
                    {resultItem.hungerRestore && (
                      <span className="px-1.5 py-0.5 bg-orange-950/80 border border-orange-500/40 text-orange-300">
                        🍖 Fome: <b>+{resultItem.hungerRestore}</b>
                      </span>
                    )}
                    {FUEL_ITEMS[resultItem.id] && (
                      <span className="px-1.5 py-0.5 bg-amber-950/90 border border-amber-400 text-amber-200 font-bold">
                        🔥 Combustível: <b>{FUEL_ITEMS[resultItem.id].burnTimeSec}s de fogo</b>
                      </span>
                    )}
                  </div>

                  {/* Material Option Selector for Multi-Source Dye or Wood Recipes */}
                  {selectedRecipe.materialOptions &&
                    selectedRecipe.materialOptions.length > 1 && (
                      <div className="space-y-1.5 pt-1 border-t border-white/10">
                        <span className="text-[9px] font-pixel text-amber-300 block">
                          {resultItem.isDye
                            ? 'ESCOLHA O MATERIAL PARA PRODUZIR O CORANTE:'
                            : 'ESCOLHA QUAL MADEIRA USAR:'}
                        </span>
                        <div className="grid grid-cols-1 gap-1">
                          {selectedRecipe.materialOptions.map((opt) => {
                            const isSelectedOpt =
                              (selectedMaterialOptionId ||
                                selectedRecipe.materialOptions![0].id) ===
                              opt.id;
                            const matIng =
                              opt.ingredients.find((ing) =>
                                opt.iconItemId
                                  ? ing.itemId === opt.iconItemId
                                  : isCommonWoodItem(ing.itemId)
                              ) || opt.ingredients[0];
                            const have = matIng
                              ? engine.getIngredientAvailableCount(matIng)
                              : 0;
                            const need = matIng?.count || 1;
                            const enough = have >= need;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  setSelectedMaterialOptionId(opt.id)
                                }
                                className={`p-1.5 rounded-sm border flex items-center justify-between gap-2 text-left transition-all ${
                                  isSelectedOpt
                                    ? 'bg-amber-950/60 border-amber-400 ring-1 ring-amber-400/60'
                                    : 'bg-black/45 border-white/15 hover:border-amber-400/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {matIng && (
                                    <img
                                      src={spriteAtlas.getItemIconUrl(
                                        opt.iconItemId || matIng.itemId,
                                        matIng.flowerColor
                                      )}
                                      alt={opt.label}
                                      className="w-5 h-5 pixelated shrink-0"
                                    />
                                  )}
                                  <span className="text-[10px] font-bold text-white truncate">
                                    {opt.label}
                                  </span>
                                </div>
                                <span
                                  className={`text-[10px] font-mono-tabular font-bold shrink-0 ${
                                    enough
                                      ? 'text-emerald-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {have}/{need}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Ingredients List */}
                  <div className="space-y-1 pt-1 border-t border-white/10">
                    <span className="text-[9px] font-pixel text-[#c4ab7d] block">
                      INGREDIENTES NECESSÁRIOS:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeRecipeIngredients.map((ing, idx) => {
                        const ingDef = ITEMS[ing.itemId];
                        const have = engine.getIngredientAvailableCount(ing);
                        const enough = have >= ing.count;
                        const isWoodChoice = isCommonWoodItem(ing.itemId);
                        const ingName = isWoodChoice
                          ? 'Madeira'
                          : ing.flowerColor
                          ? `${ingDef?.name || ing.itemId} (${getFlowerColorLabel(
                              ing.flowerColor
                            )})`
                          : ingDef?.name || ing.itemId;
                        return (
                          <div
                            key={`${ing.itemId}_${ing.flowerColor || idx}`}
                            className={`p-1.5 rounded-sm border flex items-center justify-between gap-1.5 ${
                              enough
                                ? 'bg-black/45 border-emerald-500/40'
                                : 'bg-rose-950/30 border-rose-500/40'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  ing.itemId,
                                  ing.flowerColor
                                )}
                                alt={ingName}
                                className="w-5 h-5 pixelated shrink-0"
                              />
                              <span className="text-[10px] text-white truncate">
                                {ingName}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-mono-tabular font-bold shrink-0 ${
                                enough ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {have}/{ing.count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons (1-word labels) */}
                  <div className="flex items-center gap-2 pt-1.5">
                    <button
                      disabled={maxCraftCount <= 0}
                      onClick={() =>
                        engine.craftRecipe(
                          selectedRecipe.id,
                          activeStation,
                          1,
                          selectedMaterialOptionId || undefined
                        )
                      }
                      className={`flex-1 min-h-[38px] px-3 py-1.5 font-pixel text-[11px] font-bold flex items-center justify-center gap-1.5 ${
                        maxCraftCount > 0
                          ? theme.primaryBtnClass
                          : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {isThermalStation ? (
                        <>
                          <Flame className="w-4 h-4" />
                          <span>
                            {activeStation === PlaceableType.CAMPFIRE
                              ? 'Assar'
                              : 'Fundir'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Hammer className="w-4 h-4" />
                          <span>Criar</span>
                        </>
                      )}
                    </button>

                    {maxCraftCount > 1 && (
                      <button
                        onClick={() =>
                          engine.craftRecipe(
                            selectedRecipe.id,
                            activeStation,
                            Math.min(5, maxCraftCount),
                            selectedMaterialOptionId || undefined
                          )
                        }
                        className="min-h-[38px] px-3 py-1.5 font-pixel text-[11px] font-bold medieval-btn-emerald flex items-center justify-center gap-1"
                      >
                        <Layers className="w-4 h-4" />
                        <span>x{Math.min(5, maxCraftCount)}</span>
                      </button>
                    )}
                  </div>
                </div>
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
                    {selectedInvIndex !== null
                      ? 'Clique no slot de destino para mover/trocar'
                      : 'Clique em um item para selecionar'}
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
                          onClick={() => handleInventorySlotClick(idx)}
                          className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 ${
                            isSel
                              ? 'mc-slot-active ring-2 ring-amber-400'
                              : selectedInvIndex !== null
                              ? 'mc-slot hover:border-amber-400/70'
                              : 'mc-slot'
                          }`}
                        >
                          {slot && def ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(
                                  slot.itemId,
                                  slot.selectedColor
                                )}
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
                        onClick={() => handleInventorySlotClick(idx)}
                        className={`relative aspect-square min-h-[38px] sm:min-h-[44px] flex flex-col items-center justify-center p-0.5 ${
                          isSel
                            ? 'mc-slot-active ring-2 ring-amber-400'
                            : selectedInvIndex !== null
                            ? 'mc-slot hover:border-amber-400/70'
                            : 'mc-slot'
                        }`}
                      >
                        <span className="absolute top-0 left-0.5 text-[7px] font-mono-tabular text-amber-400/80">
                          {idx + 1}
                        </span>
                        {slot && def ? (
                          <>
                            <img
                              src={spriteAtlas.getItemIconUrl(
                                slot.itemId,
                                slot.selectedColor
                              )}
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
                          src={spriteAtlas.getItemIconUrl(
                            selectedSlotItem.id,
                            selectedSlot.selectedColor
                          )}
                          alt={selectedSlotItem.name}
                          className="w-6 h-6 pixelated"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-pixel text-[11px] font-bold text-white truncate">
                          {selectedSlotItem.name}
                          {selectedSlotItem.isFlower &&
                          selectedSlot.selectedColor
                            ? ` · ${getFlowerColorLabel(
                                selectedSlot.selectedColor
                              )}`
                            : ''}{' '}
                          (x{selectedSlot.count})
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

                    {/* Flower Species Color Breakdown & Active Color Selector */}
                    {selectedSlotItem.isFlower && selectedInvIndex !== null && (
                      <div className="bg-[#120b07] p-2 border border-amber-500/40 rounded-sm space-y-1.5">
                        <div className="flex items-center justify-between text-[9px]">
                          <span className="font-pixel text-amber-300">
                            CORES DESTA ESPÉCIE NO SLOT:
                          </span>
                          <span className="text-[#c4ab7d]">
                            Toque para escolher a cor de uso
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {(() => {
                            const defaultCol =
                              selectedSlotItem.allowedFlowerColors?.[0] ||
                              'amarelo';
                            const countsMap: Partial<
                              Record<ClothingColorId, number>
                            > =
                              selectedSlot.colorCounts &&
                              Object.keys(selectedSlot.colorCounts).length > 0
                                ? selectedSlot.colorCounts
                                : {
                                    [selectedSlot.selectedColor || defaultCol]:
                                      selectedSlot.count,
                                  };
                            const entries = (
                              Object.entries(countsMap) as [
                                ClothingColorId,
                                number
                              ][]
                            ).filter(([, c]) => (c || 0) > 0);
                            const activeCol =
                              selectedSlot.selectedColor ||
                              entries[0]?.[0] ||
                              defaultCol;

                            return entries.map(([colorId, count]) => {
                              const isActiveColor = activeCol === colorId;
                              return (
                                <button
                                  key={colorId}
                                  type="button"
                                  onClick={() =>
                                    engine.selectInventoryFlowerColor(
                                      selectedInvIndex,
                                      colorId
                                    )
                                  }
                                  className={`p-1.5 rounded-sm border flex items-center justify-between gap-1.5 transition-all ${
                                    isActiveColor
                                      ? 'bg-amber-950/70 border-amber-400 ring-1 ring-amber-400/70'
                                      : 'bg-black/50 border-white/15 hover:border-amber-400/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <img
                                      src={spriteAtlas.getItemIconUrl(
                                        selectedSlotItem.id,
                                        colorId
                                      )}
                                      alt={getFlowerColorLabel(colorId)}
                                      className="w-4 h-4 pixelated shrink-0"
                                    />
                                    <span
                                      className="w-2.5 h-2.5 rounded-full border border-black/80 shrink-0"
                                      style={{
                                        backgroundColor:
                                          getFlowerColorHex(colorId),
                                      }}
                                    />
                                    <span className="text-[10px] font-bold text-white truncate">
                                      {getFlowerColorLabel(colorId)}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono-tabular font-bold text-amber-300 shrink-0">
                                    x{count}
                                  </span>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {(selectedSlotItem.attackDamage ||
                      selectedSlotItem.defenseBonus ||
                      selectedSlotItem.hpRestore ||
                      selectedSlotItem.hungerRestore) && (
                      <div className="flex flex-wrap gap-1 text-[9px] font-mono-tabular">
                        {selectedSlotItem.toolTier !== undefined && (
                          <span className="px-1.5 py-0.5 bg-amber-950/80 border border-amber-500/40 text-amber-200">
                            ★ Nível: <b>{selectedSlotItem.toolTier}</b>
                          </span>
                        )}
                        {selectedSlotItem.attackDamage && (
                          <span className="px-1.5 py-0.5 bg-rose-950/80 border border-rose-500/40 text-rose-300">
                            ⚔ ATQ: <b>{selectedSlotItem.attackDamage}</b>
                          </span>
                        )}
                        {selectedSlotItem.attackDamage && (
                          <span className="px-1.5 py-0.5 bg-slate-900/90 border border-slate-500/40 text-slate-200">
                            {selectedSlotItem.attackDelivery === 'ranged'
                              ? '🏹 À Distância'
                              : '🗡 Corpo-a-corpo'}
                          </span>
                        )}
                        {selectedSlotItem.attackDamage && (
                          <span
                            className={`px-1.5 py-0.5 border ${
                              selectedSlotItem.attackTargetScope === 'area'
                                ? 'bg-purple-950/80 border-purple-500/50 text-purple-200'
                                : 'bg-sky-950/80 border-sky-500/40 text-sky-200'
                            }`}
                          >
                            {selectedSlotItem.attackTargetScope === 'area'
                              ? '💥 Em Área'
                              : '🎯 Individual'}
                          </span>
                        )}
                        {selectedSlotItem.attackRange && (
                          <span className="px-1.5 py-0.5 bg-indigo-950/80 border border-indigo-500/40 text-indigo-200">
                            📏 Alcance: <b>{selectedSlotItem.attackRange} px</b>
                          </span>
                        )}
                        {selectedSlotItem.lifesteal && (
                          <span className="px-1.5 py-0.5 bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300">
                            🩸 Cura/Golpe: <b>+{selectedSlotItem.lifesteal} HP</b>
                          </span>
                        )}
                        {selectedSlotItem.knockbackMult &&
                          selectedSlotItem.knockbackMult !== 1 && (
                            <span className="px-1.5 py-0.5 bg-orange-950/80 border border-orange-500/40 text-orange-300">
                              💨 Empurrão: <b>{selectedSlotItem.knockbackMult}×</b>
                            </span>
                          )}
                        {selectedSlotItem.attackSpeedMod !== undefined &&
                          selectedSlotItem.attackSpeedMod !== 0 && (
                            <span className="px-1.5 py-0.5 bg-red-950/80 border border-red-500/40 text-red-300">
                              ⏱ Vel. ATK:{' '}
                              <b>
                                {selectedSlotItem.attackSpeedMod > 0 ? '+' : ''}
                                {Math.round(selectedSlotItem.attackSpeedMod * 100)}%
                              </b>
                            </span>
                          )}
                        {selectedSlotItem.coastalSpeedBonus && (
                          <span className="px-1.5 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-200">
                            🌊 Costa: <b>+{Math.round(selectedSlotItem.coastalSpeedBonus * 100)}% Vel.</b>
                          </span>
                        )}
                      </div>
                    )}

                    {FUEL_ITEMS[selectedSlotItem.id] && (
                      <div className="bg-orange-950/60 p-1.5 border border-orange-500/50 text-[10px] text-orange-200 flex items-center justify-between">
                        <span>
                          🔥 <b>Combustível de Fogueira/Fornalha:</b>
                        </span>
                        <span className="font-mono font-bold text-amber-300">
                          {FUEL_ITEMS[selectedSlotItem.id].efficiencyLabel}
                        </span>
                      </div>
                    )}

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
                          {usedInRecipes.map(({ recipe, resultName }) => {
                            const stationAccessible =
                              recipe.requiredStation === null ||
                              availableStations.includes(recipe.requiredStation);
                            return (
                              <button
                                key={recipe.id}
                                onClick={() => {
                                  if (stationAccessible) {
                                    setActiveStation(recipe.requiredStation);
                                    setCategoryFilter('ALL');
                                    setSelectedRecipeId(recipe.id);
                                    setActiveTab('craft');
                                  }
                                }}
                                className={`mc-slot px-1.5 py-0.5 flex items-center gap-1 text-[9px] text-[#f3e5c8] ${
                                  stationAccessible
                                    ? 'hover:border-amber-400 cursor-pointer'
                                    : 'opacity-65 cursor-default'
                                }`}
                                title={`Estação exigida: ${stationShortName(
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
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {selectedSlotItem.category === ItemCategory.CONSUMABLE &&
                        selectedInvIndex !== null && (
                          <button
                            onClick={() => {
                              engine.consumeSlotItem(selectedInvIndex);
                              if (!engine.player.inventory[selectedInvIndex]) {
                                setSelectedInvIndex(null);
                              }
                            }}
                            className="col-span-2 min-h-[34px] px-2 py-1 medieval-btn-emerald text-[10px] font-bold flex items-center justify-center gap-1"
                          >
                            <Utensils className="w-3.5 h-3.5" />
                            <span>Usar</span>
                          </button>
                        )}

                      {selectedSlotItem.category === ItemCategory.ARMOR &&
                        selectedInvIndex !== null && (
                          <button
                            onClick={() => {
                              engine.equipArmorFromSlot(selectedInvIndex);
                              setSelectedInvIndex(null);
                            }}
                            className="col-span-2 min-h-[34px] px-2 py-1 medieval-btn-gold text-[10px] font-bold flex items-center justify-center gap-1"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>Equipar</span>
                          </button>
                        )}

                      {selectedSlot.count > 1 && selectedInvIndex !== null && (
                        <button
                          onClick={() => {
                            engine.splitInventorySlot(selectedInvIndex);
                            setSelectedInvIndex(null);
                          }}
                          className="min-h-[34px] px-2 py-1 medieval-btn-wood text-[10px] font-bold flex items-center justify-center gap-1"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Dividir</span>
                        </button>
                      )}

                      {selectedInvIndex !== null && (
                        <button
                          onClick={() => {
                            engine.dropInventorySlot(selectedInvIndex, true);
                            setSelectedInvIndex(null);
                          }}
                          className="min-h-[34px] px-2 py-1 medieval-btn-crimson text-[10px] font-bold flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Soltar</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-5 text-center text-[11px] text-[#8c6d46]">
                    Clique em um item para selecioná-lo e depois clique no local de destino para movê-lo ou trocar de posição.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Criação & Mochila"
          subtitle="Como usar cada estação de criação e organizar seu inventário"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Criação à Mão Livre (2x2)',
              body: 'Sem nenhuma estação, você cria itens essenciais de sobrevivência (Bancada, Fogueira, Tochas e Curativos) usando Madeira, Pedra e Fibra.',
            },
            {
              title: '2. Bancada de Trabalho (3x3 Instantâneo)',
              body: 'Aproxime-se de uma Bancada posicionada para criar instantaneamente Ferramentas, Armas, Armaduras, Baús, Botes, Selas, Fornalha e Altar Solar.',
            },
            {
              title: '3. Fogueira & Fornalha (3 Campos Interativos)',
              body: 'Na esquerda fica seu Inventário e na direita ficam os 3 campos: (1) Campo superior esquerdo: Item a ser processado (alimentos crus ou madeira na Fogueira; minério de ferro, areia ou madeira na Fornalha); (2) Campo inferior esquerdo (com ícone de fogo): Combustível (Madeiras ou Carvão Vegetal); (3) Campo da direita: Produto pronto — clique nele para coletar o item quando houver espaço no inventário.',
            },
            {
              title: '4. Altar Solar (Itens Raros)',
              body: 'Canaliza cristais solares, fragmentos astrais e pérolas para forjar equipamentos lendários.',
            },
          ]}
        />
      )}
    </div>
  );
};
