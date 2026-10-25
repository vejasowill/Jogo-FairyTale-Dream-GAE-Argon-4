import React, { useRef, useState } from 'react';
import {
  Backpack,
  Check,
  Compass,
  Flame,
  FlipHorizontal,
  Hand,
  Hammer,
  Maximize2,
  Minimize2,
  Moon,
  Move,
  Pause,
  RotateCcw,
  Shield,
  Sliders,
  Sun,
  Swords,
  User,
  Users,
  Utensils,
  Wifi,
} from 'lucide-react';
import { CONSTRUCTION_BLUEPRINTS, ITEMS } from '../game/core/ItemRegistry';
import {
  BiomeType,
  CreatureKind,
  GameSettings,
  HOTBAR_SIZE,
  HudElementKey,
  ItemCategory,
  MOUNT_STORAGE_SIZE,
} from '../game/core/types';
import { GameEngine, HudSnapshot } from '../game/loop/GameEngine';
import { SaveManager } from '../game/persistence/SaveManager';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';

interface MobileHudProps {
  engine: GameEngine;
  snapshot: HudSnapshot;
  settings: GameSettings;
  isFullscreen: boolean;
  isEditingHud: boolean;
  onUpdateSettings: (s: GameSettings) => void;
  onFinishEditingHud: () => void;
  onToggleFullscreen: () => void;
  onOpenMap: () => void;
  onOpenHandCraftAndInventory: () => void;
  onOpenCharacter: () => void;
  onOpenOnlineInvite: () => void;
  onOpenPause: () => void;
  onMountSaddlebagToggle?: (open: boolean) => void;
}

const ELEMENT_LABELS: Record<HudElementKey, string> = {
  joystick: 'Analógico de Movimento',
  attackBtn: 'Botão Principal (Atacar/Usar)',
  interactBtn: 'Botão de Interação (Alvo)',
  placeBtn: 'Botão Colocar / Consumir',
  hotbar: 'Barra de 8 Slots (Mão)',
  statusPlaque: 'Placa de Status (Vida/Fome)',
  topMenu: 'Menu Rápido Superior',
};

export const MobileHud: React.FC<MobileHudProps> = ({
  engine,
  snapshot,
  settings,
  isFullscreen,
  isEditingHud,
  onUpdateSettings,
  onFinishEditingHud,
  onToggleFullscreen,
  onOpenMap,
  onOpenHandCraftAndInventory,
  onOpenCharacter,
  onOpenOnlineInvite,
  onOpenPause,
  onMountSaddlebagToggle,
}) => {
  const {
    player,
    metadata,
    currentBiome,
    currentZoneName,
    currentLandmarkName,
    aimedTarget,
    activeMount,
  } = snapshot;

  const [showMountSaddlebag, setShowMountSaddlebag] = useState(false);

  const toggleMountSaddlebag = (nextOpen: boolean) => {
    setShowMountSaddlebag(nextOpen);
    onMountSaddlebagToggle?.(nextOpen);
  };

  // Virtual Joystick state (Play Mode)
  const joyContainerRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joyActiveRef = useRef(false);

  // Manual HUD Editor state (Edit Mode)
  const [selectedKey, setSelectedKey] = useState<HudElementKey>('attackBtn');
  const dragStateRef = useRef<{
    active: boolean;
    key: HudElementKey;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  } | null>(null);

  const layout = settings.controlLayout || SaveManager.getDefaultControlLayout();
  const globalScale = settings.hudScale || 1.0;
  const globalOpacity = settings.hudOpacity || 0.96;

  // Helper to get CSS transform for any customizable HUD element
  const getElementStyle = (
    key: HudElementKey,
    transformOrigin: string
  ): React.CSSProperties => {
    const cfg = layout[key] || { offsetX: 0, offsetY: 0, scale: 1.0 };
    const totalScale = Number((cfg.scale * globalScale).toFixed(3));
    return {
      transform: `translate3d(${cfg.offsetX}px, ${cfg.offsetY}px, 0) scale(${totalScale})`,
      transformOrigin,
      opacity: isEditingHud ? 1 : globalOpacity,
    };
  };

  // Drag handlers for Manual HUD Editor Mode
  const startElementDrag = (
    key: HudElementKey,
    e: React.PointerEvent<HTMLElement>
  ) => {
    if (!isEditingHud) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedKey(key);
    const cfg = layout[key] || { offsetX: 0, offsetY: 0, scale: 1.0 };
    dragStateRef.current = {
      active: true,
      key,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: cfg.offsetX,
      origOffsetY: cfg.offsetY,
    };
  };

  const moveElementDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!isEditingHud || !dragStateRef.current?.active) return;
    e.stopPropagation();
    const { key, startX, startY, origOffsetX, origOffsetY } = dragStateRef.current;
    const dx = Math.round(e.clientX - startX);
    const dy = Math.round(e.clientY - startY);

    const currentCfg = layout[key] || { offsetX: 0, offsetY: 0, scale: 1.0 };
    onUpdateSettings({
      ...settings,
      controlLayout: {
        ...layout,
        [key]: {
          ...currentCfg,
          offsetX: Math.max(-600, Math.min(600, origOffsetX + dx)),
          offsetY: Math.max(-360, Math.min(360, origOffsetY + dy)),
        },
      },
    });
  };

  const endElementDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!isEditingHud) return;
    e.stopPropagation();
    dragStateRef.current = null;
  };

  const updateSelectedScale = (newScale: number) => {
    const currentCfg = layout[selectedKey] || {
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,
    };
    onUpdateSettings({
      ...settings,
      controlLayout: {
        ...layout,
        [selectedKey]: {
          ...currentCfg,
          scale: Number(newScale.toFixed(2)),
        },
      },
    });
  };

  const nudgeSelectedOffset = (dx: number, dy: number) => {
    const currentCfg = layout[selectedKey] || {
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,
    };
    onUpdateSettings({
      ...settings,
      controlLayout: {
        ...layout,
        [selectedKey]: {
          ...currentCfg,
          offsetX: currentCfg.offsetX + dx,
          offsetY: currentCfg.offsetY + dy,
        },
      },
    });
  };

  const applyLeftHandedPreset = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 800;
    const shift = Math.round(w - 150);
    onUpdateSettings({
      ...settings,
      controlLayout: {
        ...SaveManager.getDefaultControlLayout(),
        joystick: { offsetX: shift, offsetY: 0, scale: 1.0 },
        attackBtn: { offsetX: -shift, offsetY: 0, scale: 1.0 },
        interactBtn: { offsetX: -shift + 190, offsetY: 0, scale: 1.0 },
        placeBtn: { offsetX: -shift, offsetY: 0, scale: 1.0 },
      },
    });
  };

  const resetAllHudSettings = () => {
    onUpdateSettings({
      ...settings,
      hudScale: 1.0,
      hudOpacity: 0.96,
      controlLayout: SaveManager.getDefaultControlLayout(),
    });
  };

  // Virtual Joystick Play Mode handlers
  const handleJoyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditingHud) {
      startElementDrag('joystick', e);
      return;
    }
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    joyActiveRef.current = true;
    updateJoystickFromEvent(e);
  };

  const handleJoyPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditingHud) {
      moveElementDrag(e);
      return;
    }
    if (!joyActiveRef.current) return;
    e.stopPropagation();
    updateJoystickFromEvent(e);
  };

  const handleJoyPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditingHud) {
      endElementDrag(e);
      return;
    }
    e.stopPropagation();
    joyActiveRef.current = false;
    setJoyKnob({ x: 0, y: 0 });
    engine.input.setJoystick(0, 0);
  };

  const updateJoystickFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = joyContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width / 2 - 12;

    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;
    setJoyKnob({ x: kx, y: ky });

    engine.input.setJoystick(kx / maxRadius, ky / maxRadius);
  };

  const formatClock = (time: number) => {
    const h = Math.floor(time) % 24;
    const m = Math.floor((time % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const biomeName = (b: BiomeType) => {
    switch (b) {
      case BiomeType.PLAINS:
        return 'Planície';
      case BiomeType.DESERT:
        return 'Deserto';
      case BiomeType.OCEAN:
        return 'Oceano';
    }
  };

  const isNight = metadata.timeOfDay >= 20 || metadata.timeOfDay < 5.5;
  const heldSlot = player.inventory[player.selectedHotbarIndex];
  const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;

  const canPlaceOrConsume =
    heldItem &&
    (heldItem.category === ItemCategory.PLACEABLE ||
      heldItem.category === ItemCategory.CONSUMABLE ||
      heldItem.category === ItemCategory.ARMOR ||
      heldItem.id === 'saddle' ||
      heldItem.id === 'wood_boat');

  const placeButtonLabel = () => {
    if (!heldItem) return 'Colocar';
    if (heldItem.id === 'saddle') return 'Selar';
    if (heldItem.id === 'wood_boat') return 'Lançar Bote';
    if (heldItem.specialUse === 'bomb') return 'Detonar';
    if (heldItem.specialUse === 'recall') return 'Teleportar';
    if (heldItem.category === ItemCategory.PLACEABLE) {
      return snapshot.buildDemolishMode ? 'Recolher' : 'Construir';
    }
    if (heldItem.category === ItemCategory.CONSUMABLE) return 'Consumir';
    if (heldItem.category === ItemCategory.ARMOR) return 'Equipar';
    return 'Colocar';
  };

  const interactButtonLabel = () => {
    if (!aimedTarget) return 'Interagir';
    if (aimedTarget.kind === 'station') return aimedTarget.actionHint;
    if (aimedTarget.kind === 'wild_animal') return 'Domesticar';
    if (aimedTarget.kind === 'tamed_animal') return aimedTarget.actionHint;
    return 'Inspecionar';
  };

  const editHighlightClass = (key: HudElementKey) => {
    if (!isEditingHud) return '';
    return selectedKey === key
      ? 'ring-2 ring-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.65)] cursor-move'
      : 'ring-1 ring-dashed ring-sky-400/80 cursor-move';
  };

  const selectedCfg = layout[selectedKey] || {
    offsetX: 0,
    offsetY: 0,
    scale: 1.0,
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none">
      {/* =================================================================== */}
      {/* INTERACTIVE MANUAL HUD EDITOR OVERLAY & FLOATING INSPECTOR          */}
      {/* =================================================================== */}
      {isEditingHud && (
        <div
          className="pointer-events-auto fixed inset-0 bg-black/55 z-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(245, 158, 11, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(245, 158, 11, 0.1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {/* Compact Top-Center Control Customizer Toolbar (Designed for Landscape Mobile) */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[94vw] max-w-xl medieval-panel p-2.5 sm:p-3 z-50 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#4a301e] pb-1.5">
              <div className="flex items-center gap-1.5">
                <Move className="w-4 h-4 text-amber-400" />
                <span className="font-pixel text-[10px] sm:text-xs font-bold text-amber-400">
                  EDITOR MANUAL DE CONTROLES & HUD
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={applyLeftHandedPreset}
                  className="px-2 py-1 medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                  title="Inverter Joystick e Botões para Canhotos"
                >
                  <FlipHorizontal className="w-3 h-3 text-sky-300" />
                  <span>Canhoto</span>
                </button>
                <button
                  onClick={resetAllHudSettings}
                  className="px-2 py-1 medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span>Padrão</span>
                </button>
                <button
                  onClick={onFinishEditingHud}
                  className="px-3 py-1 medieval-btn-emerald font-pixel text-[10px] font-bold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>CONCLUIR</span>
                </button>
              </div>
            </div>

            {/* Selected Control & Sliders Row */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-[11px]">
              {/* Element Selector Dropdown / Cycle */}
              <div className="sm:col-span-5 flex flex-col gap-1">
                <span className="text-[10px] text-[#c4ab7d]">
                  Arraste na tela ou escolha o controle:
                </span>
                <select
                  value={selectedKey}
                  onChange={(e) =>
                    setSelectedKey(e.target.value as HudElementKey)
                  }
                  className="h-8 px-2 medieval-inset text-amber-300 font-bold text-xs focus:outline-none"
                >
                  {(Object.keys(ELEMENT_LABELS) as HudElementKey[]).map((k) => (
                    <option key={k} value={k} className="bg-[#160e09] text-white">
                      {ELEMENT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Control Size Slider */}
              <div className="sm:col-span-4 flex flex-col gap-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#e5d5b5]">Tamanho deste Controle:</span>
                  <span className="font-mono-tabular text-amber-400 font-bold">
                    {Math.round(selectedCfg.scale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={selectedCfg.scale}
                  onChange={(e) => updateSelectedScale(Number(e.target.value))}
                  className="w-full accent-amber-500 h-4"
                />
              </div>

              {/* Global HUD Scale + Fine Nudge */}
              <div className="sm:col-span-3 flex flex-col gap-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#e5d5b5]">Escala Geral HUD:</span>
                  <span className="font-mono-tabular text-sky-300 font-bold">
                    {Math.round(globalScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.35}
                  step={0.05}
                  value={globalScale}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      hudScale: Number(e.target.value),
                    })
                  }
                  className="w-full accent-sky-400 h-4"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#c4ab7d] pt-0.5">
              <span>
                Posição de <strong className="text-white">{ELEMENT_LABELS[selectedKey]}</strong>: X{' '}
                {selectedCfg.offsetX}px, Y {selectedCfg.offsetY}px
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => nudgeSelectedOffset(-8, 0)}
                  className="px-1.5 py-0.5 mc-slot text-white"
                >
                  ←
                </button>
                <button
                  onClick={() => nudgeSelectedOffset(8, 0)}
                  className="px-1.5 py-0.5 mc-slot text-white"
                >
                  →
                </button>
                <button
                  onClick={() => nudgeSelectedOffset(0, -8)}
                  className="px-1.5 py-0.5 mc-slot text-white"
                >
                  ↑
                </button>
                <button
                  onClick={() => nudgeSelectedOffset(0, 8)}
                  className="px-1.5 py-0.5 mc-slot text-white"
                >
                  ↓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. TOP-LEFT: HORIZONTAL-OPTIMIZED STATUS PLAQUE                     */}
      {/* =================================================================== */}
      <div
        onPointerDown={(e) => startElementDrag('statusPlaque', e)}
        onPointerMove={moveElementDrag}
        onPointerUp={endElementDrag}
        style={getElementStyle('statusPlaque', 'top left')}
        className={`pointer-events-auto fixed top-2 left-2.5 z-40 medieval-panel px-2.5 py-1.5 flex flex-col gap-1 min-w-[185px] sm:min-w-[225px] ${editHighlightClass(
          'statusPlaque'
        )}`}
      >
        {/* Row 1: Level, Armor, XP & Clock/Biome inline for horizontal efficiency */}
        <div className="space-y-1 border-b border-[#4a301e] pb-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="font-pixel text-[10px] text-amber-400 font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                NV.{player.level}
              </span>
              <div className="flex items-center gap-0.5">
                {(['head', 'body', 'legs', 'feet'] as const).map((slotKey) => {
                  const eqId =
                    player.equippedBySlot?.[slotKey] ??
                    (slotKey === 'body' ? player.equippedArmorId : null);
                  if (!eqId) return null;
                  return (
                    <img
                      key={slotKey}
                      src={spriteAtlas.getItemIconUrl(eqId)}
                      alt={slotKey}
                      className="w-3.5 h-3.5 pixelated"
                    />
                  );
                })}
              </div>
              <span className="text-[9px] text-[#c4ab7d] font-mono-tabular">
                XP {player.xp}/{player.xpToNext}
              </span>
              <span
                title="Moedas de Ouro (Status do Personagem)"
                className="flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-950/80 border border-amber-500/50 text-[9px] font-mono-tabular font-bold text-amber-300"
              >
                <img
                  src={spriteAtlas.getItemIconUrl('gold_coin')}
                  alt="Ouro"
                  className="w-3 h-3 pixelated"
                />
                <span>{player.goldCoins ?? 0}</span>
              </span>
            </div>

            <div className="flex items-center gap-1 text-[9px] font-mono-tabular text-[#f3e5c8]">
              {isNight ? (
                <Moon className="w-3 h-3 text-indigo-300" />
              ) : (
                <Sun className="w-3 h-3 text-amber-400" />
              )}
              <span>D{metadata.dayCount}</span>
              <span>·</span>
              <span>{formatClock(metadata.timeOfDay)}</span>
            </div>
          </div>

          {/* Slim XP progress bar with golden shimmer */}
          <div className="w-full h-1 bg-[#120b07] border border-[#3d281a] overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (player.xp / Math.max(1, player.xpToNext)) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Row 2: Compact 3-Column Bars (HP, Fome, Energia) with specular top highlight */}
        <div className="grid grid-cols-3 gap-1.5">
          {/* HP */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[8px] font-mono-tabular">
              <span
                className={`font-bold ${
                  player.hp / Math.max(1, player.maxHp) < 0.35
                    ? 'text-rose-300 animate-pulse'
                    : 'text-rose-400'
                }`}
              >
                VIDA
              </span>
              <span className="text-[#f3e5c8]">{Math.ceil(player.hp)}</span>
            </div>
            <div
              className={`w-full h-2.5 medieval-inset overflow-hidden p-[1px] ${
                player.hp / Math.max(1, player.maxHp) < 0.35
                  ? 'border-rose-500/80'
                  : ''
              }`}
            >
              <div
                className="relative h-full bg-rose-600 transition-all duration-150"
                style={{
                  width: `${Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))}%`,
                }}
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-rose-300/60" />
              </div>
            </div>
          </div>

          {/* Hunger */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[8px] font-mono-tabular">
              <span className="text-amber-400 font-bold">FOME</span>
              <span className="text-[#f3e5c8]">{Math.ceil(player.hunger)}%</span>
            </div>
            <div className="w-full h-2.5 medieval-inset overflow-hidden p-[1px]">
              <div
                className="relative h-full bg-amber-500 transition-all duration-150"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (player.hunger / player.maxHunger) * 100)
                  )}%`,
                }}
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-200/65" />
              </div>
            </div>
          </div>

          {/* Stamina */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[8px] font-mono-tabular">
              <span className="text-sky-400 font-bold">ENERG</span>
              <span className="text-[#f3e5c8]">{Math.ceil(player.stamina)}%</span>
            </div>
            <div className="w-full h-2.5 medieval-inset overflow-hidden p-[1px]">
              <div
                className="relative h-full bg-sky-500 transition-all duration-150"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (player.stamina / player.maxStamina) * 100)
                  )}%`,
                }}
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-sky-200/65" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Ecological Biome & Landmark Readout */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5 border-t border-[#4a301e]/70 text-[8px] font-mono-tabular">
          <span className="text-emerald-300 font-bold truncate">
            {biomeName(currentBiome)} · {currentZoneName}
          </span>
          {currentLandmarkName && (
            <span className="px-1 py-0.2 rounded bg-amber-950/90 border border-amber-500/60 text-amber-300 font-bold truncate">
              ✦ {currentLandmarkName}
            </span>
          )}
        </div>

        {/* Row 4: Active Buffs (when active) */}
        {((player.strengthBuffTimer || 0) > 0 || (player.speedBuffTimer || 0) > 0) && (
          <div className="flex items-center gap-1.5 pt-0.5 border-t border-[#4a301e]/80 text-[8px] font-mono-tabular">
            {(player.strengthBuffTimer || 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/60 text-rose-300 font-bold">
                ⚔️ Fúria +35% ({Math.ceil(player.strengthBuffTimer || 0)}s)
              </span>
            )}
            {(player.speedBuffTimer || 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-500/60 text-purple-300 font-bold">
                💨 Sombra +30% ({Math.ceil(player.speedBuffTimer || 0)}s)
              </span>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 2. TOP-RIGHT: COMPACT QUICK MENU BAR                                */}
      {/* =================================================================== */}
      <div
        onPointerDown={(e) => startElementDrag('topMenu', e)}
        onPointerMove={moveElementDrag}
        onPointerUp={endElementDrag}
        style={getElementStyle('topMenu', 'top right')}
        className={`pointer-events-auto fixed top-2 right-2.5 z-40 flex items-center gap-1 sm:gap-1.5 ${editHighlightClass(
          'topMenu'
        )}`}
      >
        <div className="hidden md:flex items-center gap-1.5 medieval-panel px-2.5 py-1.5 text-[10px] font-mono-tabular">
          <span className="text-emerald-400 font-bold">
            {biomeName(currentBiome)} ({currentZoneName})
          </span>
          <span className="text-[#5c3d28]">|</span>
          <span className="text-[#c4ab7d]">{snapshot.lastSaveStatus}</span>
        </div>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            if (!isEditingHud) {
              e.stopPropagation();
              onToggleFullscreen();
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!isEditingHud) onToggleFullscreen();
          }}
          title={isFullscreen ? 'Sair da Tela Cheia' : 'Jogar em Tela Cheia'}
          className={`min-h-[40px] px-2.5 flex items-center justify-center gap-1 touch-manipulation ${
            isFullscreen ? 'medieval-btn-gold' : 'medieval-btn-wood'
          }`}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-[#1c1008]" />
          ) : (
            <Maximize2 className="w-4 h-4 text-amber-300" />
          )}
          <span className="text-[10px] font-bold hidden sm:inline">
            {isFullscreen ? 'Tela Normal' : 'Tela Cheia'}
          </span>
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onClick={() => !isEditingHud && onOpenOnlineInvite()}
          title="Modo Online & Código de Convite deste Mundo"
          className={`min-h-[40px] px-2.5 flex items-center justify-center gap-1.5 ${
            snapshot.onlineSession?.isOnline
              ? 'medieval-btn-emerald'
              : 'medieval-btn-wood'
          }`}
        >
          <Wifi
            className={`w-4 h-4 ${
              snapshot.onlineSession?.isOnline
                ? 'text-emerald-300 animate-pulse'
                : 'text-amber-300'
            }`}
          />
          <span className="text-[10px] font-bold">
            {snapshot.onlineSession?.isOnline &&
            snapshot.onlineSession?.inviteCode
              ? `Convite: ${snapshot.onlineSession.inviteCode}`
              : 'Online'}
          </span>
          {snapshot.onlineSession?.isOnline && (
            <span className="px-1 py-0.5 rounded bg-black/45 border border-emerald-400/50 text-[9px] font-mono-tabular font-bold text-amber-300 flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />
              <span>
                {Math.max(1, snapshot.onlineSession.connectedPeers.length)}
              </span>
            </span>
          )}
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onClick={() => !isEditingHud && onOpenMap()}
          title="Mapa de Chunks"
          className="min-h-[40px] px-2.5 medieval-btn-wood flex items-center justify-center gap-1"
        >
          <Compass className="w-4 h-4 text-amber-400" />
          <span className="text-[10px] font-bold hidden sm:inline">Mapa</span>
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onClick={() => !isEditingHud && onOpenHandCraftAndInventory()}
          title="Mochila & Craft à Mão Livre"
          className="min-h-[40px] px-2.5 medieval-btn-gold flex items-center justify-center gap-1"
        >
          <Backpack className="w-4 h-4" />
          <span className="text-[10px] font-extrabold">Mochila</span>
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onClick={() => !isEditingHud && onOpenCharacter()}
          title="Herói RPG & Pets"
          className="relative min-h-[40px] px-2.5 medieval-btn-wood flex items-center justify-center gap-1"
        >
          <User className="w-4 h-4 text-sky-300" />
          <span className="text-[10px] font-bold hidden sm:inline">Herói</span>
          {player.attributePoints > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-[#1c1008] border border-[#1c1008] text-[9px] font-extrabold flex items-center justify-center">
              {player.attributePoints}
            </span>
          )}
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onClick={() => !isEditingHud && engine.toggleInnocentFire()}
          title={
            snapshot.innocentFireEnabled
              ? 'Fogo Inocente ATIVO: Seus ataques podem ferir aldeões e NPCs pacíficos. Clique para ativar trava de segurança.'
              : 'Trava de Segurança ATIVA: Aldeões e NPCs pacíficos estão protegidos. Clique para ativar Fogo Inocente.'
          }
          className={`min-h-[40px] px-2.5 flex items-center justify-center gap-1 transition-colors border ${
            snapshot.innocentFireEnabled
              ? 'bg-rose-950/95 border-rose-500 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.45)]'
              : 'medieval-btn-wood text-emerald-300'
          }`}
        >
          {snapshot.innocentFireEnabled ? (
            <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
          ) : (
            <Shield className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-[10px] font-extrabold leading-tight">
            Fogo Inocente
          </span>
          <span
            className={`text-[9px] font-mono-tabular px-1 py-0.5 rounded font-bold ${
              snapshot.innocentFireEnabled
                ? 'bg-rose-600 text-white'
                : 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60'
            }`}
          >
            {snapshot.innocentFireEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          onPointerDown={(e) => {
            if (!isEditingHud) e.stopPropagation();
          }}
          onClick={() => !isEditingHud && onOpenPause()}
          title="Pausa & Configurações"
          className="min-h-[40px] min-w-[40px] medieval-btn-wood flex items-center justify-center"
        >
          <Pause className="w-4 h-4 text-[#f3e5c8]" />
        </button>
      </div>

      {/* =================================================================== */}
      {/* 3. BOTTOM-LEFT: ANALOG VIRTUAL JOYSTICK                             */}
      {/* =================================================================== */}
      <div
        ref={joyContainerRef}
        onPointerDown={handleJoyPointerDown}
        onPointerMove={handleJoyPointerMove}
        onPointerUp={handleJoyPointerUp}
        onPointerCancel={handleJoyPointerUp}
        style={getElementStyle('joystick', 'bottom left')}
        className={`pointer-events-auto fixed bottom-3 left-4 z-40 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-[#1a110b]/85 border-[3px] transition-colors duration-150 ${
          joyKnob.x !== 0 || joyKnob.y !== 0
            ? 'border-amber-400 shadow-[inset_0_0_16px_rgba(245,158,11,0.28),0_0_14px_rgba(245,158,11,0.28),0_4px_0_#0d0805]'
            : 'border-[#6e4930] shadow-[inset_0_0_12px_rgba(0,0,0,0.8),0_4px_0_#0d0805]'
        } flex items-center justify-center touch-none select-none ${editHighlightClass(
          'joystick'
        )}`}
      >
        <div className="absolute inset-2.5 border border-dashed border-[#5c3d28]/70 rounded-full pointer-events-none" />
        {/* Cardinal directional ticks */}
        <div className="absolute top-1.5 w-1.5 h-1.5 rotate-45 bg-[#8c6239]/70 pointer-events-none" />
        <div className="absolute bottom-1.5 w-1.5 h-1.5 rotate-45 bg-[#8c6239]/70 pointer-events-none" />
        <div className="absolute left-1.5 w-1.5 h-1.5 rotate-45 bg-[#8c6239]/70 pointer-events-none" />
        <div className="absolute right-1.5 w-1.5 h-1.5 rotate-45 bg-[#8c6239]/70 pointer-events-none" />
        <div className="w-2.5 h-2.5 rotate-45 bg-[#6e4930] pointer-events-none" />
        <div
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full medieval-btn-gold flex items-center justify-center pointer-events-none shadow-[0_3px_8px_rgba(0,0,0,0.75)]"
          style={{
            transform: `translate3d(${joyKnob.x}px, ${joyKnob.y}px, 0)`,
          }}
        >
          <div className="w-2.5 h-2.5 rotate-45 bg-[#452309]/65" />
        </div>
      </div>

      {/* =================================================================== */}
      {/* 4. BOTTOM-CENTER: 8-SLOT MODULAR HOTBAR                             */}
      {/* =================================================================== */}
      <div
        onPointerDown={(e) => startElementDrag('hotbar', e)}
        onPointerMove={moveElementDrag}
        onPointerUp={endElementDrag}
        style={getElementStyle('hotbar', 'bottom center')}
        className={`pointer-events-auto fixed bottom-2 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1 ${editHighlightClass(
          'hotbar'
        )}`}
      >
        {/* Contextual Info & Build Mode Strip above Hotbar */}
        <div className="flex flex-col items-center gap-1">
          {heldItem?.category === ItemCategory.PLACEABLE &&
            heldItem.placeableType &&
            CONSTRUCTION_BLUEPRINTS[heldItem.placeableType] && (
              <div className="medieval-panel px-2 py-1 flex flex-wrap items-center justify-center gap-1.5 text-[9px]">
                {(() => {
                  const bp = CONSTRUCTION_BLUEPRINTS[heldItem.placeableType!];
                  const layerBadge =
                    bp.layer === 'GROUND'
                      ? 'CHÃO'
                      : bp.layer === 'WALL'
                      ? 'PAREDE'
                      : 'MOBÍLIA';
                  return (
                    <>
                      <span className="px-1.5 py-0.5 bg-[#120b07] border border-[#4a301e] text-amber-300 font-bold">
                        {layerBadge}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 bg-[#120b07] border border-[#4a301e] font-bold ${
                          bp.hitboxBehavior === 'DYNAMIC_DOOR'
                            ? 'text-sky-300'
                            : bp.hasHitbox
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {bp.hitboxBehavior === 'DYNAMIC_DOOR'
                          ? 'PORTA ABRE/FECHA'
                          : bp.hasHitbox
                          ? 'COM HITBOX'
                          : 'SEM HITBOX'}
                      </span>
                      {bp.continuityMode !== 'STANDALONE' && (
                        <span className="hidden sm:inline px-1.5 py-0.5 bg-[#120b07] border border-[#4a301e] text-sky-300 font-bold">
                          AUTO-CONEXÃO
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          engine.cycleBuildOrientation();
                        }}
                        className="px-1.5 py-0.5 medieval-btn-wood text-[8px] font-bold text-[#f3e5c8]"
                        title="Alternar Orientação da Peça (Auto / Horizontal / Vertical)"
                      >
                        Eixo:{' '}
                        {snapshot.buildOrientation === 'auto'
                          ? 'Auto'
                          : snapshot.buildOrientation === 'horizontal'
                          ? 'Horiz'
                          : 'Vert'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          engine.toggleHitboxPreview();
                        }}
                        className={`px-1.5 py-0.5 text-[8px] font-bold ${
                          snapshot.showHitboxPreview
                            ? 'medieval-btn-gold'
                            : 'medieval-btn-wood'
                        }`}
                        title="Exibir ou Ocultar Hitboxes no Mundo"
                      >
                        Hitboxes: {snapshot.showHitboxPreview ? 'ON' : 'OFF'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          engine.toggleBuildDemolishMode();
                        }}
                        className={`px-1.5 py-0.5 text-[8px] font-bold ${
                          snapshot.buildDemolishMode
                            ? 'medieval-btn-crimson'
                            : 'medieval-btn-wood'
                        }`}
                        title="Modo Recolher/Demolir Peça Construída"
                      >
                        {snapshot.buildDemolishMode
                          ? '🔨 Recolher: ATIVO'
                          : '🔨 Recolher'}
                      </button>
                    </>
                  );
                })()}
              </div>
            )}

          <div className="flex items-center justify-center gap-1.5">
            {heldItem && (
              <div className="medieval-panel px-2 py-0.5 text-[9px] sm:text-[10px] flex items-center gap-1 whitespace-nowrap">
                <span className="font-bold text-amber-300">{heldItem.name}</span>
                {heldItem.attackDamage && (
                  <span className="text-[#c4ab7d] font-mono-tabular">
                    · ATQ {heldItem.attackDamage}
                  </span>
                )}
                {heldItem.hungerRestore && (
                  <span className="text-emerald-400 font-mono-tabular">
                    · +{heldItem.hungerRestore} Fome
                  </span>
                )}
              </div>
            )}

            {aimedTarget && (
              <div className="medieval-panel-stone px-2 py-0.5 text-[9px] sm:text-[10px] flex items-center gap-1 whitespace-nowrap">
                <span className="text-amber-400 font-bold">
                  Alvo: {aimedTarget.label}
                </span>
              </div>
            )}
          </div>

          {/* ACTIVE MOUNT BAR (Horse / Camel with Stamina, Cavalgar & 8-Slot Saddlebag, OR 2-Seat Boat) */}
          {activeMount && (
            <div className="medieval-panel px-2.5 py-1.5 flex flex-wrap items-center justify-center gap-2 border-amber-500/70 shadow-[0_0_16px_rgba(0,0,0,0.75)]">
              {activeMount.kind === CreatureKind.BOAT ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <img
                      src={spriteAtlas.getItemIconUrl('wood_boat')}
                      alt="Bote"
                      className="w-4 h-4 pixelated"
                    />
                    <span className="font-pixel text-[9px] sm:text-[10px] text-sky-300 font-bold">
                      {activeMount.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-950/90 border border-sky-500/50 text-[8px] font-mono-tabular text-sky-200 font-bold">
                      Assentos:{' '}
                      {(activeMount.riderPlayerId ? 1 : 0) +
                        (activeMount.passengerPlayerId ||
                        activeMount.passengerPetId
                          ? 1
                          : 0)}
                      /2
                    </span>
                    <span className="hidden sm:inline text-[8px] text-emerald-300 font-semibold">
                      · Imune à Correnteza · 0 Slots
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.dismountCreature();
                      }}
                      className="px-2 py-1 medieval-btn-wood text-[9px] font-bold text-amber-200"
                    >
                      Desembarcar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        engine.pickupBoat(activeMount.id);
                      }}
                      className="px-2 py-1 medieval-btn-gold text-[9px] font-bold"
                    >
                      Recolher Bote
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <img
                      src={spriteAtlas.getItemIconUrl('saddle')}
                      alt="Sela"
                      className="w-4 h-4 pixelated"
                    />
                    <span className="font-pixel text-[9px] sm:text-[10px] text-amber-300 font-bold">
                      {activeMount.name}
                    </span>
                    <span className="px-1 py-0.5 rounded bg-[#120b07] border border-[#4a301e] text-[8px] font-mono-tabular text-emerald-300 font-bold">
                      Vel {activeMount.mountSpeed || 145}
                    </span>
                  </div>

                  {/* Mount Stamina (Fôlego) Bar */}
                  <div className="flex items-center gap-1 min-w-[95px] sm:min-w-[115px]">
                    <span className="text-[8px] font-mono-tabular font-bold text-amber-400">
                      FÔLEGO
                    </span>
                    <div className="flex-1 h-2.5 medieval-inset overflow-hidden p-[1px]">
                      <div
                        className="h-full bg-amber-400 transition-all duration-100"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              ((activeMount.mountStamina ?? 100) /
                                Math.max(1, activeMount.mountMaxStamina || 100)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[8px] font-mono-tabular text-[#f3e5c8]">
                      {Math.ceil(activeMount.mountStamina ?? 100)}/
                      {activeMount.mountMaxStamina || 100}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        engine.toggleGalloping();
                      }}
                      className={`px-2.5 py-1 font-pixel text-[9px] font-bold flex items-center gap-1 ${
                        player.isGalloping
                          ? 'medieval-btn-gold shadow-[0_0_12px_rgba(251,191,36,0.75)]'
                          : 'medieval-btn-emerald'
                      }`}
                      title="Gasta fôlego da montaria para correr mais rápido"
                    >
                      <span>🐎 {player.isGalloping ? 'Cavalgando!' : 'Cavalgar'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMountSaddlebag(!showMountSaddlebag);
                      }}
                      className="px-2 py-1 medieval-btn-wood text-[9px] font-bold text-amber-300"
                      title="Abrir inventário de 8 slots da sela"
                    >
                      🎒 Alforje (8)
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMountSaddlebag(false);
                        engine.dismountCreature();
                      }}
                      className="px-2 py-1 medieval-btn-crimson text-[9px] font-bold"
                    >
                      Desmontar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 8 Slots Row (Sized to fit comfortably on 667x375 horizontal phones) */}
        <div className="medieval-panel p-1 flex items-center gap-1">
          {player.inventory.slice(0, HOTBAR_SIZE).map((slot, index) => {
            const isSelected = player.selectedHotbarIndex === index;
            const def = slot ? ITEMS[slot.itemId] : null;
            return (
              <button
                key={index}
                onClick={() => !isEditingHud && engine.selectHotbarSlot(index)}
                className={`relative w-9 h-9 sm:w-11 sm:h-11 flex flex-col items-center justify-center shrink-0 ${
                  isSelected ? 'mc-slot-active' : 'mc-slot'
                }`}
              >
                <span className="absolute top-0.5 left-1 text-[8px] font-mono-tabular text-[#8c6d46] leading-none">
                  {index + 1}
                </span>
                {slot && def ? (
                  <>
                    <img
                      src={spriteAtlas.getItemIconUrl(slot.itemId)}
                      alt={def.name}
                      className="w-5 h-5 sm:w-6 sm:h-6 pixelated"
                    />
                    {slot.count > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold text-[#fef08a] drop-shadow-[0_1px_1px_rgba(0,0,0,1)] leading-none">
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

      {/* =================================================================== */}
      {/* 5. BOTTOM-RIGHT BUTTON 1: BOTÃO PRINCIPAL (ATAQUE / FERRAMENTA)     */}
      {/* =================================================================== */}
      <button
        onPointerDown={(e) => {
          if (isEditingHud) {
            startElementDrag('attackBtn', e);
            return;
          }
          e.stopPropagation();
          engine.performAttackOrHarvestAction();
        }}
        onPointerMove={moveElementDrag}
        onPointerUp={endElementDrag}
        style={getElementStyle('attackBtn', 'bottom right')}
        title="Botão Principal: Atacar inimigo ou coletar recurso com a ferramenta na mão"
        className={`pointer-events-auto fixed bottom-3 right-4 z-40 w-18 h-18 sm:w-20 sm:h-20 medieval-btn-crimson flex flex-col items-center justify-center gap-0.5 select-none touch-none ${editHighlightClass(
          'attackBtn'
        )}`}
      >
        {heldSlot &&
        (heldItem?.category === ItemCategory.TOOL ||
          heldItem?.category === ItemCategory.WEAPON) ? (
          <img
            src={spriteAtlas.getItemIconUrl(heldSlot.itemId)}
            alt="Arma/Ferramenta"
            className="w-8 h-8 pixelated"
          />
        ) : (
          <Swords className="w-7 h-7 text-amber-200" />
        )}
        <span className="font-pixel text-[9px] font-bold tracking-tight">
          {player.fishingState?.active
            ? player.fishingState.phase === 'biting'
              ? 'Fisgar!'
              : 'Recolher'
            : heldItem?.id === 'fishing_rod'
            ? 'Pescar'
            : heldItem?.category === ItemCategory.TOOL
            ? 'Usar'
            : 'Atacar'}
        </span>
      </button>

      {/* =================================================================== */}
      {/* 6. BOTTOM-RIGHT BUTTON 2: INTERAÇÃO (BANCADA / FORNALHA / ANIMAL)   */}
      {/* =================================================================== */}
      <button
        onPointerDown={(e) => {
          if (isEditingHud) {
            startElementDrag('interactBtn', e);
            return;
          }
          e.stopPropagation();
          engine.performInteractAction();
        }}
        onPointerMove={moveElementDrag}
        onPointerUp={endElementDrag}
        style={getElementStyle('interactBtn', 'bottom right')}
        title="Botão de Interação: Interagir com o que está sendo mirado (Bancada, Fornalha, Altar, Animal)"
        className={`pointer-events-auto fixed bottom-3 right-26 sm:right-28 z-40 min-h-[52px] min-w-[96px] sm:min-h-[56px] sm:min-w-[108px] px-2.5 py-1 flex flex-col items-center justify-center gap-0.5 select-none touch-none transition-shadow duration-150 ${
          aimedTarget
            ? aimedTarget.kind === 'station'
              ? 'medieval-btn-gold shadow-[0_0_14px_rgba(245,158,11,0.45)]'
              : aimedTarget.kind === 'wild_animal'
              ? 'medieval-btn-crimson shadow-[0_0_14px_rgba(244,63,94,0.45)]'
              : 'medieval-btn-emerald shadow-[0_0_14px_rgba(74,222,128,0.45)]'
            : 'medieval-btn-wood opacity-90'
        } ${editHighlightClass('interactBtn')}`}
      >
        <div className="flex items-center gap-1">
          {aimedTarget?.iconItemId ? (
            <img
              src={spriteAtlas.getItemIconUrl(aimedTarget.iconItemId)}
              alt="Alvo"
              className="w-4 h-4 sm:w-5 sm:h-5 pixelated"
            />
          ) : (
            <Hand className="w-4 h-4 text-amber-300" />
          )}
          <span className="font-pixel text-[9px] sm:text-[10px] font-bold">
            Interagir
          </span>
        </div>
        <span className="text-[8px] sm:text-[9px] font-semibold truncate max-w-[92px]">
          {interactButtonLabel()}
        </span>
      </button>

      {/* =================================================================== */}
      {/* 7. BOTTOM-RIGHT BUTTON 3: COLOCAR / CONSUMIR (ITEM NA MÃO)          */}
      {/* =================================================================== */}
      <button
        onPointerDown={(e) => {
          if (isEditingHud) {
            startElementDrag('placeBtn', e);
            return;
          }
          e.stopPropagation();
          engine.performUseOrPlaceHeldItemAction();
        }}
        onPointerMove={moveElementDrag}
        onPointerUp={endElementDrag}
        style={getElementStyle('placeBtn', 'bottom right')}
        title="Botão Colocar/Consumir: Coloca construção na mão, consome alimento ou equipa armadura"
        className={`pointer-events-auto fixed bottom-24 right-4 z-40 min-h-[46px] min-w-[96px] sm:min-h-[50px] sm:min-w-[106px] px-2.5 py-1 flex items-center justify-center gap-1.5 select-none touch-none transition-shadow duration-150 ${
          canPlaceOrConsume
            ? heldItem?.category === ItemCategory.CONSUMABLE
              ? 'medieval-btn-emerald shadow-[0_0_12px_rgba(74,222,128,0.35)]'
              : 'medieval-btn-gold shadow-[0_0_12px_rgba(245,158,11,0.35)]'
            : 'medieval-btn-wood opacity-80'
        } ${editHighlightClass('placeBtn')}`}
      >
        {heldItem && canPlaceOrConsume ? (
          <img
            src={spriteAtlas.getItemIconUrl(heldItem.id)}
            alt={heldItem.name}
            className="w-5 h-5 pixelated shrink-0"
          />
        ) : heldItem?.category === ItemCategory.CONSUMABLE ? (
          <Utensils className="w-4 h-4 shrink-0" />
        ) : heldItem?.category === ItemCategory.ARMOR ? (
          <Shield className="w-4 h-4 shrink-0" />
        ) : (
          <Hammer className="w-4 h-4 shrink-0 text-[#c4ab7d]" />
        )}
        <div className="flex flex-col items-start leading-tight">
          <span className="font-pixel text-[9px] font-bold">
            {placeButtonLabel()}
          </span>
          <span className="text-[8px] opacity-85 truncate max-w-[60px]">
            {canPlaceOrConsume && heldItem ? heldItem.name : 'Item na Mão'}
          </span>
        </div>
      </button>

      {/* =================================================================== */}
      {/* 8. DEDICATED CAVALGAR BUTTON (RIGHT SIDE WHEN MOUNTED ON HORSE/CAMEL)*/}
      {/* =================================================================== */}
      {activeMount &&
        (activeMount.kind === CreatureKind.HORSE ||
          activeMount.kind === CreatureKind.CAMEL) && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              engine.setGalloping(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              engine.setGalloping(false);
            }}
            onPointerCancel={() => engine.setGalloping(false)}
            className={`pointer-events-auto fixed bottom-38 right-4 z-40 min-h-[46px] min-w-[98px] sm:min-h-[50px] sm:min-w-[108px] px-2.5 py-1 flex flex-col items-center justify-center gap-0.5 select-none touch-none ${
              player.isGalloping
                ? 'medieval-btn-gold shadow-[0_0_16px_rgba(251,191,36,0.75)]'
                : 'medieval-btn-emerald shadow-[0_0_12px_rgba(16,185,129,0.4)]'
            }`}
          >
            <span className="font-pixel text-[9px] sm:text-[10px] font-bold">
              🐎 Cavalgar
            </span>
            <span className="text-[8px] font-mono-tabular">
              Fôlego {Math.ceil(activeMount.mountStamina ?? 100)}/
              {activeMount.mountMaxStamina || 100}
            </span>
          </button>
        )}

      {/* =================================================================== */}
      {/* 9. 8-SLOT MOUNT SADDLEBAG MODAL (ALFORJE DE 8 SLOTS)                */}
      {/* =================================================================== */}
      {showMountSaddlebag &&
        activeMount &&
        activeMount.hasSaddle &&
        (activeMount.kind === CreatureKind.HORSE ||
          activeMount.kind === CreatureKind.CAMEL) && (
          <div
            onClick={() => toggleMountSaddlebag(false)}
            className="pointer-events-auto fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-2"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl medieval-panel p-3 space-y-3 max-h-[92dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-[#4a301e] pb-2">
                <div className="flex items-center gap-2">
                  <img
                    src={spriteAtlas.getItemIconUrl('saddle')}
                    alt="Sela"
                    className="w-5 h-5 pixelated"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-pixel text-xs font-bold text-amber-400">
                        ALFORJE DE {activeMount.name.toUpperCase()} (8 SLOTS)
                      </h3>
                      <span
                        className={`px-1.5 py-0.5 text-[8px] font-bold border ${
                          snapshot.isPaused
                            ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                            : 'bg-sky-950/80 border-sky-500/60 text-sky-300'
                        }`}
                      >
                        {snapshot.isPaused
                          ? '⏸ JOGO PAUSADO'
                          : '🌐 MULTIPLAYER ATIVO (SEM PAUSA)'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#c4ab7d]">
                      Velocidade Individual: {activeMount.mountSpeed} · Fôlego Máximo:{' '}
                      {activeMount.mountMaxStamina || 100}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleMountSaddlebag(false)}
                  className="px-2.5 py-1 medieval-btn-crimson text-[10px] font-bold"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 8 Mount Slots */}
                <div className="medieval-inset p-2.5 space-y-2">
                  <div className="text-[10px] font-pixel text-amber-300 font-bold">
                    INVENTÁRIO DA MONTARIA (8 SLOTS) — Clique para retirar
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: MOUNT_STORAGE_SIZE }).map((_, idx) => {
                      const mSlot = activeMount.mountInventory?.[idx] || null;
                      const def = mSlot ? ITEMS[mSlot.itemId] : null;
                      return (
                        <button
                          key={idx}
                          onClick={() =>
                            mSlot &&
                            engine.transferMountSlotToInventory(
                              activeMount.id,
                              idx,
                              true
                            )
                          }
                          className="h-12 mc-slot flex flex-col items-center justify-center relative"
                          title={
                            def
                              ? `${def.name} (${mSlot?.count}x) — Clique para mover para sua mochila`
                              : `Slot ${idx + 1} vazio`
                          }
                        >
                          {mSlot && def ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(mSlot.itemId)}
                                alt={def.name}
                                className="w-6 h-6 pixelated"
                              />
                              <span className="absolute bottom-0.5 right-1 text-[9px] font-mono-tabular font-bold text-amber-300">
                                {mSlot.count}
                              </span>
                            </>
                          ) : (
                            <span className="text-[8px] text-[#5c3d28]">
                              {idx + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Player Inventory Slots to Store into Mount */}
                <div className="medieval-inset p-2.5 space-y-2">
                  <div className="text-[10px] font-pixel text-emerald-300 font-bold">
                    SUA MOCHILA — Clique em um item para guardar no Alforje
                  </div>
                  <div className="grid grid-cols-8 gap-1 max-h-[160px] overflow-y-auto">
                    {player.inventory.map((pSlot, pIdx) => {
                      const def = pSlot ? ITEMS[pSlot.itemId] : null;
                      return (
                        <button
                          key={pIdx}
                          onClick={() =>
                            pSlot &&
                            engine.transferInventorySlotToMount(
                              activeMount.id,
                              pIdx,
                              true
                            )
                          }
                          className="h-9 mc-slot flex flex-col items-center justify-center relative"
                          title={
                            def
                              ? `Guardar ${def.name} (${pSlot?.count}x) no Alforje`
                              : 'Vazio'
                          }
                        >
                          {pSlot && def ? (
                            <>
                              <img
                                src={spriteAtlas.getItemIconUrl(pSlot.itemId)}
                                alt={def.name}
                                className="w-5 h-5 pixelated"
                              />
                              {pSlot.count > 1 && (
                                <span className="absolute bottom-0 right-0.5 text-[8px] font-mono-tabular font-bold text-amber-200">
                                  {pSlot.count}
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
            </div>
          </div>
        )}
    </div>
  );
};
