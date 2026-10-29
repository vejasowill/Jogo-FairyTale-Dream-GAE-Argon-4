import React, { useEffect, useRef, useState } from 'react';
import {
  Backpack,
  BoxSelect,
  Check,
  CloudRain,
  Compass,
  Flame,
  Hand,
  Heart,
  Maximize2,
  Minimize2,
  Moon,
  Move,
  Package,
  Pause,
  RotateCcw,
  RotateCw,
  Skull,
  Sun,
  Swords,
  User,
  Users,
  Utensils,
  Wind,
  X,
} from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import { RECIPES } from '../game/core/RecipeRegistry';
import {
  GameSettings,
  HOTBAR_SIZE,
  HudControlLayout,
  HudElementKey,
  MOUNT_STORAGE_SIZE,
  PlaceableType,
  TOTAL_INVENTORY_SIZE,
} from '../game/core/types';
import { GameEngine, HudSnapshot } from '../game/loop/GameEngine';
import { SaveManager } from '../game/persistence/SaveManager';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import {
  HoldIconButton,
  WindowHelpButton,
  WindowHelpModal,
} from './UiTooltipAndHelp';

interface MobileHudProps {
  engine: GameEngine;
  snapshot: HudSnapshot;
  settings: GameSettings;
  isFullscreen?: boolean;
  isEditingHud?: boolean;
  onToggleFullscreen?: () => void;
  onUpdateSettings?: (newSettings: GameSettings) => void;
  onFinishEditingHud?: () => void;
  onOpenMap: () => void;
  onOpenHandCraftAndInventory: () => void;
  onOpenCharacter: () => void;
  onOpenStatusEffects?: () => void;
  onOpenOnlineInvite?: () => void;
  onOpenPause: () => void;
  onMountSaddlebagToggle?: (open: boolean) => void;
}

const HUD_ELEMENT_NAMES: Record<HudElementKey, string> = {
  joystick: 'Analógico',
  attackBtn: '1. Ataque/Quebrar',
  interactBtn: '2. Interação',
  placeBtn: '3. Colocar/Consumir',
  mountBtn: '4. Cavalgar',
  hotbar: 'Hotbar',
  statusPlaque: 'Status',
  topMenu: 'Menu Topo',
};

export const MobileHud: React.FC<MobileHudProps> = ({
  engine,
  snapshot,
  settings,
  isFullscreen = false,
  isEditingHud = false,
  onToggleFullscreen,
  onUpdateSettings,
  onFinishEditingHud,
  onOpenMap,
  onOpenHandCraftAndInventory,
  onOpenCharacter,
  onOpenStatusEffects,
  onOpenOnlineInvite,
  onOpenPause,
  onMountSaddlebagToggle,
}) => {
  const {
    player,
    metadata,
    onlineSession,
    activeMount,
    nearbyTamedAnimal,
    buildDemolishMode,
    buildOrientation,
    showHitboxPreview,
    innocentFireEnabled,
  } = snapshot;
  const dayCount = metadata.dayCount;
  const timeOfDay = metadata.timeOfDay;

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const [joystickActive, setJoystickActive] = useState(false);
  const [itemToast, setItemToast] = useState<string | null>(null);
  const [saddlebagMountId, setSaddlebagMountId] = useState<string | null>(null);
  const [selectedSaddleSlot, setSelectedSaddleSlot] = useState<{
    container: 'mount' | 'player';
    index: number;
  } | null>(null);
  const [showSaddlebagHelp, setShowSaddlebagHelp] = useState(false);

  const [selectedEditKey, setSelectedEditKey] =
    useState<HudElementKey>('attackBtn');
  const editDragRef = useRef<{
    key: HudElementKey;
    startX: number;
    startY: number;
    initialOffsetX: number;
    initialOffsetY: number;
  } | null>(null);

  const selectedSlot = player.inventory[player.selectedHotbarIndex];
  const selectedItem = selectedSlot ? ITEMS[selectedSlot.itemId] : null;

  useEffect(() => {
    if (!selectedItem) {
      setItemToast(null);
      return;
    }
    setItemToast(selectedItem.name);
    const timer = window.setTimeout(() => setItemToast(null), 1500);
    return () => window.clearTimeout(timer);
  }, [player.selectedHotbarIndex, selectedItem?.id]);

  useEffect(() => {
    if (onMountSaddlebagToggle) {
      onMountSaddlebagToggle(Boolean(saddlebagMountId));
    }
  }, [saddlebagMountId]);

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditingHud) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setJoystickActive(true);
    updateJoystick(e);
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joystickActive || isEditingHud) return;
    updateJoystick(e);
  };

  const handleJoystickEnd = () => {
    setJoystickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    engine.input.setJoystick(0, 0);
  };

  const updateJoystick = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const maxRadius = rect.width * 0.36;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;
    setKnobOffset({ x: kx, y: ky });

    if (dist > 5) {
      engine.input.setJoystick(kx / maxRadius, ky / maxRadius);
    } else {
      engine.input.setJoystick(0, 0);
    }
  };

  const formatClock = (t: number) => {
    const hours = Math.floor(t);
    const mins = Math.floor((t - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}`;
  };

  const isNight = timeOfDay >= 19.5 || timeOfDay < 5.5;
  const armorHpBonus = engine.getTotalEquipmentMaxHpBonus();
  const baseStatusMaxHp =
    engine.getPlayerStatusMaxHp() +
    Math.max(0, Math.floor(player.bonusMaxHpFromItems || 0));
  const hpPercent = Math.max(
    0,
    Math.min(100, (player.hp / player.maxHp) * 100)
  );
  const hungerPercent = Math.max(
    0,
    Math.min(100, (player.hunger / player.maxHunger) * 100)
  );

  const canPlaceOrEat =
    selectedItem &&
    (selectedItem.placeableType !== undefined ||
      selectedItem.seedCropType !== undefined ||
      selectedItem.id === 'organic_compost' ||
      selectedItem.id === 'bone_fertilizer' ||
      selectedItem.id === 'wood_boat' ||
      selectedItem.id === 'saddle' ||
      selectedItem.specialUse !== undefined ||
      selectedItem.hpRestore !== undefined ||
      selectedItem.hungerRestore !== undefined ||
      selectedItem.category === 'ARMOR');

  const craftableNowCount = RECIPES.filter(
    (r) => !r.requiredStation && engine.getMaxCraftableCount(r) > 0
  ).length;

  const isOrientableItem =
    selectedItem?.placeableType === PlaceableType.WOOD_WALL ||
    selectedItem?.placeableType === PlaceableType.STONE_WALL ||
    selectedItem?.placeableType === PlaceableType.WOOD_DOOR ||
    selectedItem?.placeableType === PlaceableType.BED ||
    selectedItem?.placeableType === PlaceableType.VILLAGE_HOUSE ||
    selectedItem?.placeableType === PlaceableType.MARKET_STALL;

  const nearbySaddledMount =
    !activeMount && nearbyTamedAnimal?.hasSaddle ? nearbyTamedAnimal : null;
  const nearbyMountTarget = activeMount || nearbySaddledMount;

  const nearbyPrimalMountCandidate =
    activeMount ||
    (nearbyTamedAnimal &&
    (nearbyTamedAnimal.kind === 'HORSE' ||
      nearbyTamedAnimal.kind === 'CAMEL' ||
      nearbyTamedAnimal.kind === 'BOAT')
      ? nearbyTamedAnimal
      : null);

  const hudScale = settings.hudScale ?? 1.0;
  const hudOpacity = settings.hudOpacity ?? 0.95;
  const defaultLayout = SaveManager.getDefaultControlLayout();
  const layout: HudControlLayout = {
    ...defaultLayout,
    ...(settings.controlLayout || {}),
  };

  const updateControlPlacement = (
    key: HudElementKey,
    patch: Partial<{ offsetX: number; offsetY: number; scale: number }>
  ) => {
    if (!onUpdateSettings) return;
    const current = layout[key] || { offsetX: 0, offsetY: 0, scale: 1 };
    onUpdateSettings({
      ...settings,
      controlLayout: {
        ...layout,
        [key]: {
          offsetX:
            patch.offsetX !== undefined
              ? Math.round(patch.offsetX)
              : current.offsetX,
          offsetY:
            patch.offsetY !== undefined
              ? Math.round(patch.offsetY)
              : current.offsetY,
          scale:
            patch.scale !== undefined
              ? Number(Math.max(0.6, Math.min(1.6, patch.scale)).toFixed(2))
              : current.scale,
        },
      },
    });
  };

  const handleEditPointerDown = (
    key: HudElementKey,
    e: React.PointerEvent<HTMLElement>
  ) => {
    if (!isEditingHud) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedEditKey(key);
    const current = layout[key] || { offsetX: 0, offsetY: 0, scale: 1 };
    editDragRef.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      initialOffsetX: current.offsetX || 0,
      initialOffsetY: current.offsetY || 0,
    };
  };

  const handleEditPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isEditingHud || !editDragRef.current) return;
    const { key, startX, startY, initialOffsetX, initialOffsetY } =
      editDragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    updateControlPlacement(key, {
      offsetX: initialOffsetX + dx,
      offsetY: initialOffsetY + dy,
    });
  };

  const handleEditPointerUp = () => {
    editDragRef.current = null;
  };

  const getControlTransformStyle = (
    key: HudElementKey,
    origin: string = 'center center'
  ): React.CSSProperties => {
    const item = layout[key] || { offsetX: 0, offsetY: 0, scale: 1 };
    const totalScale = Number((hudScale * (item.scale ?? 1)).toFixed(3));
    return {
      transform: `translate3d(${item.offsetX || 0}px, ${
        item.offsetY || 0
      }px, 0) scale(${totalScale})`,
      transformOrigin: origin,
      opacity: isEditingHud ? 1 : hudOpacity,
    };
  };

  const saddlebagCreature = saddlebagMountId
    ? engine.entities.creatures.find((c) => c.id === saddlebagMountId) || null
    : null;
  if (saddlebagCreature) {
    engine.ensureMountInventoryInitialized(saddlebagCreature);
  }
  const saddlebagSlots = saddlebagCreature?.mountInventory || [];

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-1.5 sm:p-2.5 select-none overflow-hidden">
      {/* ================================================================= */}
      {/* TOP BAR: Compact Status Plaque (Left) & Icon-Only Quick Bar (Right) */}
      {/* ================================================================= */}
      <div className="flex items-start justify-between gap-1.5 w-full">
        {/* Top-Left Compact Status Plaque + Active Status Effects Bar directly below */}
        <div
          style={getControlTransformStyle('statusPlaque', 'top left')}
          onPointerDown={(e) => handleEditPointerDown('statusPlaque', e)}
          onPointerMove={handleEditPointerMove}
          onPointerUp={handleEditPointerUp}
          className="flex flex-col items-start gap-1 max-w-[54vw]"
        >
          <div
            className={`pointer-events-auto medieval-panel px-2 py-1.5 flex flex-col gap-1 min-w-[165px] sm:min-w-[195px] w-full ${
              isEditingHud
                ? selectedEditKey === 'statusPlaque'
                  ? 'ring-2 ring-amber-400 cursor-move'
                  : 'ring-1 ring-amber-500/40 cursor-move'
                : ''
            }`}
          >
            {/* Row 1: Clock, Weather, Gold & Level */}
            <div className="flex items-center justify-between gap-1.5 border-b border-[#4a301e] pb-1">
              <div className="flex items-center gap-1">
                {isNight ? (
                  <Moon className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="font-pixel text-[9px] sm:text-[10px] font-bold text-amber-300">
                  D{dayCount}
                </span>
                <span className="text-[9px] font-mono-tabular text-[#e5d5b5]">
                  {formatClock(timeOfDay)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 px-1 py-0.5 bg-[#120b07] border border-amber-500/40 rounded">
                  <img
                    src={spriteAtlas.getItemIconUrl('gold_coin')}
                    alt="Ouro"
                    className="w-3 h-3 pixelated"
                  />
                  <span className="text-[9px] font-mono-tabular font-bold text-amber-300">
                    {player.goldCoins ?? 0}
                  </span>
                </div>
                <span className="text-[9px] font-pixel text-amber-400 bg-[#120b07] px-1 py-0.5 border border-[#4a301e]">
                  Nv.{player.level}
                </span>
              </div>
            </div>

            {/* Row 2: HP & Hunger Bars */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[8px] font-bold">
                  <span className="flex items-center gap-0.5 text-rose-300">
                    <Heart className="w-2.5 h-2.5 fill-rose-500 text-rose-500" />
                    HP
                  </span>
                  <span className="font-mono-tabular text-white">
                    {Math.ceil(player.hp)}/{baseStatusMaxHp}
                    {armorHpBonus > 0 && (
                      <span className="text-sky-300"> (+{armorHpBonus})</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#120b07] border border-[#4a301e] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-700 to-rose-500 transition-all duration-200"
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[8px] font-bold">
                  <span className="flex items-center gap-0.5 text-amber-300">
                    <Utensils className="w-2.5 h-2.5 text-amber-400" />
                    Fome
                  </span>
                  <span className="font-mono-tabular text-white">
                    {Math.ceil(player.hunger)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#120b07] border border-[#4a301e] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-700 to-yellow-500 transition-all duration-200"
                    style={{ width: `${hungerPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Mount Stamina Bar */}
            {activeMount && (
              <div className="pt-0.5 border-t border-[#3b2516] flex items-center gap-1.5">
                <span className="text-[8px] font-pixel text-amber-300 truncate max-w-[70px]">
                  {activeMount.kind === 'BOAT' ? '⛵' : '🐎'} {activeMount.name}
                </span>
                <div className="flex-1 h-1.5 bg-[#120b07] border border-[#4a301e] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-100 ${
                      (activeMount.mountStamina ?? 100) <= 5
                        ? 'bg-rose-600'
                        : 'bg-gradient-to-r from-sky-600 to-cyan-400'
                    }`}
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          ((activeMount.mountStamina ?? 100) /
                            (activeMount.mountMaxStamina || 100)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Character Active Status Effects Bar (Hidden when no effects are active; max 4 icons + '+N' overflow icon) */}
          {player.statusEffects && player.statusEffects.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!isEditingHud && onOpenStatusEffects) {
                  onOpenStatusEffects();
                }
              }}
              className="pointer-events-auto medieval-panel px-1.5 py-1 flex items-center gap-1.5 border border-[#5c3c24] hover:border-amber-400 active:scale-95 transition-transform"
              title="Toque para ver detalhes dos efeitos ativos"
            >
              {player.statusEffects.slice(0, 4).map((eff) => {
                const isNegative = eff.polarity === 'negative';
                return (
                  <div
                    key={eff.id}
                    className={`relative w-7 h-7 rounded flex flex-col items-center justify-center border ${
                      isNegative
                        ? 'bg-[#231026] border-purple-500/80 text-purple-300'
                        : 'bg-[#102419] border-emerald-500/80 text-emerald-300'
                    }`}
                  >
                    {eff.id === 'poison_1' || eff.id === 'poison_2' ? (
                      <div className="flex items-center justify-center">
                        <Skull className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-[7px] font-pixel font-bold text-purple-200 ml-0.5">
                          {eff.id === 'poison_2' ? '2' : '1'}
                        </span>
                      </div>
                    ) : eff.id === 'strength' ? (
                      <Swords className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Wind className="w-3.5 h-3.5 text-cyan-300" />
                    )}
                    <span className="text-[7px] font-mono-tabular leading-none mt-0.5 text-white/90">
                      {Math.ceil(eff.duration)}s
                    </span>
                  </div>
                );
              })}

              {player.statusEffects.length > 4 && (
                <div className="w-7 h-7 rounded bg-[#1a110b] border border-amber-400/80 flex items-center justify-center text-[9px] font-pixel font-bold text-amber-300">
                  +{player.statusEffects.length - 4}
                </div>
              )}
            </button>
          )}
        </div>

        {/* Top-Right Compact Icon Bar (Hold any icon to see description) */}
        <div
          style={getControlTransformStyle('topMenu', 'top right')}
          onPointerDown={(e) => handleEditPointerDown('topMenu', e)}
          onPointerMove={handleEditPointerMove}
          onPointerUp={handleEditPointerUp}
          className={`pointer-events-auto flex items-center gap-1 flex-wrap justify-end ${
            isEditingHud
              ? selectedEditKey === 'topMenu'
                ? 'ring-2 ring-amber-400 p-1 cursor-move'
                : 'ring-1 ring-amber-500/40 p-1 cursor-move'
              : ''
          }`}
        >
          {/* Fullscreen Icon Button */}
          {onToggleFullscreen && (
            <HoldIconButton
              onClick={() => !isEditingHud && onToggleFullscreen()}
              tooltipTitle={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
              tooltipDesc="Alterna o modo de tela cheia."
              tooltipAlign="right"
              className="min-h-[34px] min-w-[34px] medieval-btn-wood flex items-center justify-center"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
              )}
            </HoldIconButton>
          )}

          {/* Online Co-op Icon Button */}
          {onOpenOnlineInvite && (
            <HoldIconButton
              onClick={() => !isEditingHud && onOpenOnlineInvite()}
              tooltipTitle="Multiplayer Online"
              tooltipDesc={
                onlineSession?.isOnline
                  ? `Conectado (${onlineSession.connectedPeers.length} jogadores)`
                  : 'Hospedar ou entrar em mundo online.'
              }
              tooltipAlign="right"
              className={`min-h-[34px] px-2 flex items-center justify-center gap-1 relative ${
                onlineSession?.isOnline
                  ? 'medieval-btn-emerald'
                  : 'medieval-btn-wood'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-amber-300" />
              {onlineSession?.isOnline && (
                <span className="text-[9px] font-mono-tabular font-extrabold text-white">
                  {onlineSession.connectedPeers.length}
                </span>
              )}
            </HoldIconButton>
          )}

          {/* World Map Icon Button */}
          <HoldIconButton
            onClick={() => !isEditingHud && onOpenMap()}
            tooltipTitle="Mapa Mundial (M)"
            tooltipDesc="Veja biomas explorados, marcos e espólios."
            tooltipAlign="right"
            className="min-h-[34px] min-w-[34px] medieval-btn-wood flex items-center justify-center"
          >
            <Compass className="w-4 h-4 text-amber-300" />
          </HoldIconButton>

          {/* Backpack & Hand Crafting Icon Button */}
          <HoldIconButton
            onClick={() => !isEditingHud && onOpenHandCraftAndInventory()}
            tooltipTitle="Mochila & Criação (E)"
            tooltipDesc="Inventário e criação rápida 2x2 à mão."
            tooltipAlign="right"
            className="min-h-[34px] min-w-[34px] medieval-btn-wood flex items-center justify-center relative"
          >
            <Backpack className="w-4 h-4 text-amber-300" />
            {craftableNowCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute top-1 right-1" />
            )}
          </HoldIconButton>

          {/* Hero & Pets Icon Button */}
          <HoldIconButton
            onClick={() => !isEditingHud && onOpenCharacter()}
            tooltipTitle="Herói & Pets (C)"
            tooltipDesc="Equipamentos, aparência, atributos e animais."
            tooltipAlign="right"
            className="min-h-[34px] min-w-[34px] medieval-btn-wood flex items-center justify-center relative"
          >
            <User className="w-4 h-4 text-amber-300" />
            {player.attributePoints > 0 && (
              <span className="px-1 bg-emerald-500 text-black text-[8px] font-extrabold rounded absolute -top-1 -right-1">
                +{player.attributePoints}
              </span>
            )}
          </HoldIconButton>

          {/* Friendly Fire Compact Icon + ON/OFF */}
          <HoldIconButton
            onClick={() => !isEditingHud && engine.toggleInnocentFire()}
            tooltipTitle={`Fogo Amigo: ${innocentFireEnabled ? 'ON' : 'OFF'}`}
            tooltipDesc={
              innocentFireEnabled
                ? 'Ativo: seus golpes atingem aldeões, animais e construções.'
                : 'Protegido: seus golpes ignoram aldeões, pets e estruturas.'
            }
            tooltipAlign="right"
            className={`min-h-[34px] px-2 text-[9px] font-pixel font-bold flex items-center gap-1 ${
              innocentFireEnabled
                ? 'medieval-btn-crimson animate-pulse'
                : 'medieval-btn-wood opacity-90'
            }`}
          >
            <Flame
              className={`w-3.5 h-3.5 ${
                innocentFireEnabled ? 'text-amber-300' : 'text-emerald-400'
              }`}
            />
            <span>{innocentFireEnabled ? 'ON' : 'OFF'}</span>
          </HoldIconButton>

          {/* Pause / Settings Icon Button */}
          <HoldIconButton
            onClick={() => !isEditingHud && onOpenPause()}
            tooltipTitle="Pausa & Opções (ESC)"
            tooltipDesc="Salvar mundo, ajustar HUD, áudio e controles."
            tooltipAlign="right"
            className="min-h-[34px] min-w-[34px] medieval-btn-wood flex items-center justify-center"
          >
            <Pause className="w-4 h-4 text-amber-300" />
          </HoldIconButton>
        </div>
      </div>

      {/* ================================================================= */}
      {/* HUD LAYOUT EDITOR OVERLAY (WHEN EDITING HUD)                      */}
      {/* ================================================================= */}
      {isEditingHud && (
        <div className="pointer-events-auto self-center medieval-panel p-2.5 border-2 border-amber-400 flex flex-col gap-2 max-w-lg w-full z-40">
          <div className="flex items-center justify-between border-b border-[#4a301e] pb-1">
            <span className="font-pixel text-[10px] font-bold text-amber-300 flex items-center gap-1">
              <Move className="w-3.5 h-3.5" />
              EDITAR HUD ({HUD_ELEMENT_NAMES[selectedEditKey]})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!onUpdateSettings) return;
                  onUpdateSettings({
                    ...settings,
                    controlLayout: SaveManager.getDefaultControlLayout(),
                  });
                }}
                className="px-2 py-0.5 medieval-btn-wood text-[9px] font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Padrão</span>
              </button>
              <button
                type="button"
                onClick={onFinishEditingHud}
                className="px-2.5 py-0.5 medieval-btn-gold text-[9px] font-bold flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Pronto</span>
              </button>
            </div>
          </div>

          {/* Quick selector chips for all HUD elements & all 4 primal buttons */}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(HUD_ELEMENT_NAMES) as HudElementKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedEditKey(k)}
                className={`px-1.5 py-0.5 text-[8px] font-pixel font-bold transition-all ${
                  selectedEditKey === k
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood opacity-80'
                }`}
              >
                {HUD_ELEMENT_NAMES[k]}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="text-[#c4ab7d]">Tamanho:</span>
            <input
              type="range"
              min={0.6}
              max={1.5}
              step={0.05}
              value={layout[selectedEditKey]?.scale ?? 1}
              onChange={(e) =>
                updateControlPlacement(selectedEditKey, {
                  scale: parseFloat(e.target.value),
                })
              }
              className="flex-1 accent-amber-500"
            />
            <span className="font-mono-tabular text-amber-300 w-10 text-right">
              {Math.round((layout[selectedEditKey]?.scale ?? 1) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* BOTTOM AREA: Thumb Joystick (Left), Hotbar (Center), Actions (Right) */}
      {/* ================================================================= */}
      <div className="relative w-full flex items-end justify-between gap-2 pb-0.5">
        {/* Bottom-Left Virtual Thumbstick */}
        {settings.showTouchControls ? (
          <div
            ref={joystickRef}
            style={getControlTransformStyle('joystick', 'bottom left')}
            onPointerDown={(e) => {
              if (isEditingHud) {
                handleEditPointerDown('joystick', e);
              } else {
                handleJoystickStart(e);
              }
            }}
            onPointerMove={(e) => {
              if (isEditingHud) {
                handleEditPointerMove(e);
              } else {
                handleJoystickMove(e);
              }
            }}
            onPointerUp={() => {
              if (isEditingHud) {
                handleEditPointerUp();
              } else {
                handleJoystickEnd();
              }
            }}
            onPointerCancel={handleJoystickEnd}
            className={`pointer-events-auto relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#1a110b]/75 border-2 border-[#6e4930] shadow-[inset_0_0_16px_rgba(0,0,0,0.85)] flex items-center justify-center touch-none shrink-0 ${
              isEditingHud
                ? selectedEditKey === 'joystick'
                  ? 'ring-2 ring-amber-400 cursor-move'
                  : 'ring-1 ring-amber-500/40 cursor-move'
                : ''
            }`}
          >
            <div className="w-12 h-12 rounded-full border border-[#4a301e] pointer-events-none" />
            <div
              style={{
                transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-b from-[#d97706] to-[#78350f] border-2 border-[#fde68a] shadow-lg pointer-events-none"
            />
          </div>
        ) : (
          <div className="w-6" />
        )}

        {/* Bottom-Center Hotbar & Context Strips */}
        <div
          style={getControlTransformStyle('hotbar', 'bottom center')}
          onPointerDown={(e) => handleEditPointerDown('hotbar', e)}
          onPointerMove={handleEditPointerMove}
          onPointerUp={handleEditPointerUp}
          className={`pointer-events-auto flex flex-col items-center gap-1 max-w-[60vw] sm:max-w-none ${
            isEditingHud
              ? selectedEditKey === 'hotbar'
                ? 'ring-2 ring-amber-400 p-1 cursor-move'
                : 'ring-1 ring-amber-500/40 p-1 cursor-move'
              : ''
          }`}
        >
          {/* Compact Claim Unowned Rest Point / House Strip ("Tomar Posse") */}
          {snapshot.aimedTarget?.canClaimOwnership && !isEditingHud && (
            <div className="flex items-center gap-1 medieval-panel px-2 py-1 border border-emerald-500/60">
              <HoldIconButton
                onClick={() =>
                  engine.claimRestPointOwnership(
                    snapshot.aimedTarget?.structureId
                  )
                }
                tooltipTitle="Tomar Posse do Ponto de Descanso"
                tooltipDesc="Define você como dono desta casa/ponto de descanso para que NPCs não a invadam."
                tooltipAlign="top"
                className="min-h-[28px] px-2.5 text-[10px] font-pixel font-bold medieval-btn-emerald flex items-center gap-1"
              >
                <span>🏠 Tomar Posse</span>
              </HoldIconButton>
            </div>
          )}

          {/* Compact Mount Strip */}
          {nearbyMountTarget && !isEditingHud && (
            <div className="flex items-center gap-1 medieval-panel px-2 py-1 border border-amber-500/60">
              <HoldIconButton
                onClick={() => {
                  if (activeMount) {
                    engine.dismountCreature();
                  } else {
                    engine.mountCreature(nearbyMountTarget.id);
                  }
                }}
                tooltipTitle={
                  nearbyMountTarget.kind === 'BOAT'
                    ? activeMount
                      ? 'Desembarcar (R)'
                      : 'Embarcar (R)'
                    : activeMount
                    ? 'Desmontar (R)'
                    : 'Cavalgar (R)'
                }
                tooltipDesc={
                  nearbyMountTarget.kind === 'BOAT'
                    ? `Embarcar ou desembarcar de ${nearbyMountTarget.name}.`
                    : `Montar ou sair de ${nearbyMountTarget.name}.`
                }
                tooltipAlign="top"
                className={`min-h-[28px] px-2.5 text-[10px] font-pixel font-bold flex items-center gap-1 ${
                  activeMount ? 'medieval-btn-crimson' : 'medieval-btn-gold'
                }`}
              >
                <span>
                  {nearbyMountTarget.kind === 'BOAT'
                    ? `⛵ ${activeMount ? 'Desembarcar' : 'Embarcar'}`
                    : `🐎 ${activeMount ? 'Sair' : 'Cavalgar'}`}
                </span>
              </HoldIconButton>

              {nearbyMountTarget.kind !== 'BOAT' && (
                <HoldIconButton
                  onClick={() => setSaddlebagMountId(nearbyMountTarget.id)}
                  tooltipTitle="Alforje (8 Slots)"
                  tooltipDesc="Abre a bolsa de carga da montaria."
                  tooltipAlign="top"
                  className="min-h-[28px] px-2 medieval-btn-wood text-[10px] font-pixel font-bold flex items-center gap-1"
                >
                  <Package className="w-3 h-3 text-amber-300" />
                  <span>Alforje</span>
                </HoldIconButton>
              )}
            </div>
          )}

          {/* Compact Build Strip */}
          {(isOrientableItem ||
            selectedItem?.placeableType !== undefined ||
            buildDemolishMode) &&
            !isEditingHud && (
              <div className="flex items-center gap-1 medieval-panel px-1.5 py-0.5">
                {isOrientableItem && (
                  <HoldIconButton
                    onClick={() => engine.cycleBuildOrientation()}
                    tooltipTitle="Girar Construção (R)"
                    tooltipDesc={`Direção atual: ${
                      buildOrientation === 'vertical'
                        ? 'Vertical'
                        : buildOrientation === 'horizontal'
                        ? 'Horizontal'
                        : 'Automático'
                    }`}
                    tooltipAlign="top"
                    className="min-h-[26px] px-2 medieval-btn-wood text-[9px] font-pixel font-bold flex items-center gap-1"
                  >
                    <RotateCw className="w-3 h-3 text-amber-300" />
                    <span>Eixo</span>
                  </HoldIconButton>
                )}

                <HoldIconButton
                  onClick={() => engine.toggleHitboxPreview()}
                  tooltipTitle="Mostrar Hitbox (B)"
                  tooltipDesc="Exibe ou oculta os limites de colisão."
                  tooltipAlign="top"
                  className={`min-h-[26px] px-2 text-[9px] font-pixel font-bold flex items-center gap-1 ${
                    showHitboxPreview
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  <BoxSelect className="w-3 h-3" />
                  <span>Hitbox</span>
                </HoldIconButton>

                <HoldIconButton
                  onClick={() => engine.toggleBuildDemolishMode()}
                  tooltipTitle="Modo Recolher"
                  tooltipDesc="Ativa ou desativa o modo de desmontar estruturas."
                  tooltipAlign="top"
                  className={`min-h-[26px] px-2 text-[9px] font-pixel font-bold flex items-center gap-1 ${
                    buildDemolishMode
                      ? 'medieval-btn-crimson animate-pulse'
                      : 'medieval-btn-wood'
                  }`}
                >
                  <Package className="w-3 h-3" />
                  <span>Recolher</span>
                </HoldIconButton>
              </div>
            )}

          {/* Brief Item Toast */}
          {itemToast && !isEditingHud && (
            <div className="px-2 py-0.5 bg-[#120b07]/90 border border-[#5c3d28] text-[9px] font-bold text-amber-200 truncate max-w-[200px]">
              {itemToast}
            </div>
          )}

          {/* 8-Slot Hotbar */}
          <div className="medieval-panel p-1 flex items-center gap-1 overflow-x-auto max-w-full">
            {player.inventory.slice(0, 8).map((slot, idx) => {
              const isSelected = player.selectedHotbarIndex === idx;
              const itemDef = slot ? ITEMS[slot.itemId] : null;
              return (
                <button
                  key={idx}
                  onClick={() => !isEditingHud && engine.selectHotbarSlot(idx)}
                  className={`relative w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center transition-transform shrink-0 ${
                    isSelected ? 'mc-slot-active -translate-y-0.5' : 'mc-slot'
                  }`}
                >
                  <span className="absolute top-0.5 left-1 text-[7px] font-mono-tabular text-[#c4ab7d]">
                    {idx + 1}
                  </span>
                  {slot && itemDef && (
                    <>
                      <img
                        src={spriteAtlas.getItemIconUrl(slot.itemId)}
                        alt={itemDef.name}
                        className="w-6 h-6 sm:w-7 sm:h-7 pixelated"
                      />
                      <span className="absolute bottom-0 right-1 text-[9px] font-mono-tabular font-extrabold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                        {slot.count}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom-Right 4 Primal Buttons Cluster:
            1. Ataque/Quebrar (attackBtn)
            2. Interação (interactBtn)
            3. Colocar/Consumir (placeBtn - appears when holding a placeable/consumable/usable item, or in HUD editor)
            4. Cavalgar (mountBtn - appears when mounted or near a mountable Horse/Camel/Boat, or in HUD editor)
        */}
        {settings.showTouchControls || isEditingHud ? (
          <div className="pointer-events-auto flex items-end gap-1.5 shrink-0">
            <div className="flex flex-col gap-1.5 items-end">
              {/* PRIMAL BUTTON 4: CAVALGAR (mountBtn) */}
              {(Boolean(nearbyPrimalMountCandidate) || isEditingHud) && (
                <button
                  style={getControlTransformStyle('mountBtn', 'bottom right')}
                  onPointerDown={(e) => {
                    if (isEditingHud) {
                      handleEditPointerDown('mountBtn', e);
                      return;
                    }
                    e.stopPropagation();
                    if (activeMount) {
                      if (
                        (activeMount.kind === 'HORSE' ||
                          activeMount.kind === 'CAMEL') &&
                        player.isMoving
                      ) {
                        engine.toggleGalloping();
                      } else {
                        engine.dismountCreature();
                      }
                    } else if (nearbyPrimalMountCandidate) {
                      if (
                        (nearbyPrimalMountCandidate.kind === 'HORSE' ||
                          nearbyPrimalMountCandidate.kind === 'CAMEL') &&
                        !nearbyPrimalMountCandidate.hasSaddle &&
                        engine.getItemCount('saddle') > 0
                      ) {
                        engine.equipSaddleOnCreature(
                          nearbyPrimalMountCandidate.id
                        );
                      }
                      engine.mountCreature(nearbyPrimalMountCandidate.id);
                    }
                  }}
                  onPointerMove={handleEditPointerMove}
                  onPointerUp={handleEditPointerUp}
                  className={`min-h-[40px] px-3 text-[10px] font-pixel font-bold flex items-center gap-1 active:scale-95 ${
                    activeMount && player.isGalloping
                      ? 'medieval-btn-crimson animate-pulse'
                      : 'medieval-btn-gold'
                  } ${
                    isEditingHud
                      ? selectedEditKey === 'mountBtn'
                        ? 'ring-2 ring-amber-400 cursor-move'
                        : 'ring-1 ring-amber-500/40 cursor-move'
                      : ''
                  }`}
                >
                  <span>
                    {(activeMount?.kind || nearbyPrimalMountCandidate?.kind) ===
                    'BOAT' ? (
                      <>⛵ {activeMount ? 'Desembarcar' : 'Embarcar'}</>
                    ) : (
                      <>
                        🐎{' '}
                        {activeMount
                          ? player.isMoving &&
                            (activeMount.kind === 'HORSE' ||
                              activeMount.kind === 'CAMEL')
                            ? player.isGalloping
                              ? 'Trote'
                              : 'Galope'
                            : 'Desmontar'
                          : 'Cavalgar'}
                      </>
                    )}
                  </span>
                </button>
              )}

              {/* PRIMAL BUTTON 3: COLOCAR / CONSUMIR (placeBtn) */}
              {(canPlaceOrEat || isEditingHud) && (
                <button
                  style={getControlTransformStyle('placeBtn', 'bottom right')}
                  onPointerDown={(e) => {
                    if (isEditingHud) {
                      handleEditPointerDown('placeBtn', e);
                      return;
                    }
                    e.stopPropagation();
                    engine.performUseOrPlaceHeldItemAction();
                  }}
                  onPointerMove={handleEditPointerMove}
                  onPointerUp={handleEditPointerUp}
                  className={`min-h-[42px] px-3 medieval-btn-emerald text-[10px] font-pixel font-bold flex items-center gap-1 active:scale-95 ${
                    isEditingHud
                      ? selectedEditKey === 'placeBtn'
                        ? 'ring-2 ring-amber-400 cursor-move'
                        : 'ring-1 ring-amber-500/40 cursor-move'
                      : ''
                  }`}
                >
                  <span>
                    {selectedItem?.placeableType !== undefined ||
                    selectedItem?.seedCropType !== undefined ||
                    selectedItem?.id === 'wood_boat'
                      ? 'Colocar'
                      : selectedItem?.category === 'ARMOR' ||
                        selectedItem?.id === 'saddle'
                      ? 'Equipar'
                      : 'Consumir'}
                  </span>
                </button>
              )}

              {/* PRIMAL BUTTON 2: INTERAÇÃO (interactBtn) */}
              <button
                style={getControlTransformStyle('interactBtn', 'bottom right')}
                onPointerDown={(e) => {
                  if (isEditingHud) {
                    handleEditPointerDown('interactBtn', e);
                    return;
                  }
                  e.stopPropagation();
                  engine.performInteractAction();
                }}
                onPointerMove={handleEditPointerMove}
                onPointerUp={handleEditPointerUp}
                className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full medieval-btn-gold flex flex-col items-center justify-center active:scale-90 ${
                  snapshot.aimedTarget
                    ? 'ring-2 ring-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
                    : ''
                } ${
                  isEditingHud
                    ? selectedEditKey === 'interactBtn'
                      ? 'ring-2 ring-amber-400 cursor-move'
                      : 'ring-1 ring-amber-500/40 cursor-move'
                    : ''
                }`}
              >
                <Hand className="w-4 h-4" />
                <span className="text-[7px] font-pixel font-bold mt-0.5">
                  {(selectedItem?.id === 'watering_can' ||
                    selectedItem?.id === 'watering_can_full') &&
                  snapshot.aimedTarget
                    ? snapshot.aimedTarget.kind === 'water_source' ||
                      snapshot.aimedTarget.stationType ===
                        PlaceableType.VILLAGE_WELL ||
                      snapshot.aimedTarget.stationType ===
                        PlaceableType.HEALING_FOUNTAIN
                      ? 'Encher'
                      : snapshot.aimedTarget.kind === 'crop' &&
                        snapshot.aimedTarget.cropStage !== 3
                      ? 'Regar'
                      : 'Interagir'
                    : 'Interagir'}
                </span>
              </button>
            </div>

            {/* PRIMAL BUTTON 1: ATAQUE / QUEBRAR (attackBtn) */}
            <button
              style={getControlTransformStyle('attackBtn', 'bottom right')}
              onPointerDown={(e) => {
                if (isEditingHud) {
                  handleEditPointerDown('attackBtn', e);
                  return;
                }
                e.stopPropagation();
                engine.performAttackOrHarvestAction();
              }}
              onPointerMove={handleEditPointerMove}
              onPointerUp={handleEditPointerUp}
              className={`w-15 h-15 sm:w-18 sm:h-18 rounded-full medieval-btn-crimson flex flex-col items-center justify-center active:scale-90 shadow-[0_6px_18px_rgba(0,0,0,0.85)] ${
                isEditingHud
                  ? selectedEditKey === 'attackBtn'
                    ? 'ring-2 ring-amber-400 cursor-move'
                    : 'ring-1 ring-amber-500/40 cursor-move'
                  : ''
              }`}
            >
              <Swords className="w-6 h-6 sm:w-7 sm:h-7 text-amber-200" />
              <span className="text-[8px] font-pixel font-bold mt-0.5">
                Atacar
              </span>
            </button>
          </div>
        ) : (
          <div className="w-6" />
        )}
      </div>

      {/* ================================================================= */}
      {/* MOUNT 8-SLOT SADDLEBAG MODAL                                      */}
      {/* ================================================================= */}
      {saddlebagCreature && (
        <div
          className="pointer-events-auto fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4"
          onClick={() => {
            setSelectedSaddleSlot(null);
            setSaddlebagMountId(null);
          }}
        >
          <div
            className="w-full max-w-3xl medieval-panel flex flex-col max-h-[92dvh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 bg-[#1a110b] border-b-2 border-[#4a301e] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 mc-slot-active flex items-center justify-center shrink-0">
                  <img
                    src={spriteAtlas.getItemIconUrl('saddle')}
                    alt="Alforje"
                    className="w-5 h-5 pixelated"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="font-pixel text-xs font-bold text-amber-300 truncate">
                    ALFORJE — {saddlebagCreature.name}
                  </h3>
                  <p className="text-[10px] text-[#c4ab7d] font-mono-tabular">
                    8 Slots · Vel. {saddlebagCreature.mountSpeed || 145}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <HoldIconButton
                  onClick={() => {
                    engine.takeAllFromMount(saddlebagCreature.id);
                    setSelectedSaddleSlot(null);
                  }}
                  tooltipTitle="Retirar Tudo"
                  tooltipDesc="Retira todos os itens do alforje para a sua mochila."
                  className="min-h-[32px] px-2 medieval-btn-wood text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
                >
                  <span>Retirar Tudo</span>
                </HoldIconButton>

                <HoldIconButton
                  onClick={() => {
                    engine.depositAllToMount(saddlebagCreature.id);
                    setSelectedSaddleSlot(null);
                  }}
                  tooltipTitle="Guardar Tudo"
                  tooltipDesc="Guarda os itens da mochila dentro do alforje."
                  className="min-h-[32px] px-2 medieval-btn-wood text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
                >
                  <span>Guardar Tudo</span>
                </HoldIconButton>

                <HoldIconButton
                  onClick={() => {
                    engine.sortMountStorage(saddlebagCreature.id);
                    setSelectedSaddleSlot(null);
                  }}
                  tooltipTitle="Organizar"
                  tooltipDesc="Agrupa pilhas iguais e organiza os itens do alforje."
                  className="min-h-[32px] px-2 medieval-btn-gold text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
                >
                  <span>Organizar</span>
                </HoldIconButton>

                <WindowHelpButton onClick={() => setShowSaddlebagHelp(true)} />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSaddleSlot(null);
                    setSaddlebagMountId(null);
                  }}
                  className="min-h-[32px] min-w-[32px] medieval-btn-crimson flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Left 5 cols: 8 Saddlebag slots */}
              <div className="sm:col-span-5 medieval-inset p-2.5 space-y-2">
                <div className="flex items-center justify-between border-b border-[#3d281a] pb-1">
                  <span className="font-pixel text-[10px] font-bold text-amber-400">
                    ALFORJE ({MOUNT_STORAGE_SIZE})
                  </span>
                  <span className="text-[9px] text-[#c4ab7d]">
                    {selectedSaddleSlot
                      ? 'Clique no destino'
                      : 'Clique p/ selecionar'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {saddlebagSlots.map((slot, idx) => {
                    const def = slot ? ITEMS[slot.itemId] : null;
                    const isSel =
                      selectedSaddleSlot?.container === 'mount' &&
                      selectedSaddleSlot.index === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (!selectedSaddleSlot) {
                            if (slot && slot.count > 0) {
                              setSelectedSaddleSlot({
                                container: 'mount',
                                index: idx,
                              });
                            }
                            return;
                          }
                          if (
                            selectedSaddleSlot.container === 'mount' &&
                            selectedSaddleSlot.index === idx
                          ) {
                            setSelectedSaddleSlot(null);
                            return;
                          }
                          engine.moveOrSwapMountAndPlayerSlot(
                            saddlebagCreature.id,
                            selectedSaddleSlot,
                            { container: 'mount', index: idx }
                          );
                          setSelectedSaddleSlot(null);
                        }}
                        className={`aspect-square min-h-[44px] flex items-center justify-center relative ${
                          isSel
                            ? 'mc-slot-active ring-2 ring-amber-400'
                            : selectedSaddleSlot
                            ? 'mc-slot hover:border-amber-400/70'
                            : 'mc-slot'
                        }`}
                      >
                        {slot && def && (
                          <>
                            <img
                              src={spriteAtlas.getItemIconUrl(slot.itemId)}
                              alt={def.name}
                              className="w-6 h-6 pixelated"
                            />
                            <span className="absolute bottom-0 right-0.5 text-[9px] font-mono-tabular font-extrabold text-[#fef08a]">
                              {slot.count}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right 7 cols: Player Backpack */}
              <div className="sm:col-span-7 medieval-inset p-2.5 space-y-2">
                <div className="flex items-center justify-between border-b border-[#3d281a] pb-1">
                  <span className="font-pixel text-[10px] font-bold text-[#e5d5b5]">
                    MOCHILA
                  </span>
                  <span className="text-[9px] text-amber-300">
                    {selectedSaddleSlot
                      ? 'Clique no destino p/ mover ou trocar'
                      : 'Clique no item p/ selecionar'}
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {player.inventory
                    .slice(0, TOTAL_INVENTORY_SIZE)
                    .map((slot, idx) => {
                      const def = slot ? ITEMS[slot.itemId] : null;
                      const isSel =
                        selectedSaddleSlot?.container === 'player' &&
                        selectedSaddleSlot.index === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (!selectedSaddleSlot) {
                              if (slot && slot.count > 0) {
                                setSelectedSaddleSlot({
                                  container: 'player',
                                  index: idx,
                                });
                              }
                              return;
                            }
                            if (
                              selectedSaddleSlot.container === 'player' &&
                              selectedSaddleSlot.index === idx
                            ) {
                              setSelectedSaddleSlot(null);
                              return;
                            }
                            engine.moveOrSwapMountAndPlayerSlot(
                              saddlebagCreature.id,
                              selectedSaddleSlot,
                              { container: 'player', index: idx }
                            );
                            setSelectedSaddleSlot(null);
                          }}
                          className={`aspect-square min-h-[36px] flex items-center justify-center relative ${
                            isSel
                              ? 'mc-slot-active ring-2 ring-amber-400'
                              : selectedSaddleSlot
                              ? 'mc-slot hover:border-amber-400/70'
                              : 'mc-slot'
                          } ${idx < HOTBAR_SIZE ? 'border-amber-500/40' : ''}`}
                        >
                          {slot && def && (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(slot.itemId)}
                                alt={def.name}
                                className="w-5 h-5 pixelated"
                              />
                              <span className="absolute bottom-0 right-0.5 text-[8px] font-mono-tabular font-extrabold text-[#fef08a]">
                                {slot.count}
                              </span>
                            </>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          {showSaddlebagHelp && (
            <WindowHelpModal
              title="Ajuda — Alforje da Montaria"
              subtitle="Como usar os 8 espaços extras do seu Cavalo ou Camelo"
              onClose={() => setShowSaddlebagHelp(false)}
              sections={[
                {
                  title: '1. Selecionar e Mover (Estilo Minecraft)',
                  body: 'Clique em um item (no Alforje ou na Mochila) para selecioná-lo e depois clique no slot de destino. Se o destino tiver outro item, eles trocam de posição e o item é desselecionado.',
                },
                {
                  title: '2. Posse Exclusiva',
                  body: 'Apenas o dono da montaria pode abrir seu Alforje ou cavalgar nela.',
                },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
};
