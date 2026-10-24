import React, { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Backpack,
  Check,
  Edit3,
  Hammer,
  Layers,
  Package,
  Sparkles,
  X,
} from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import {
  CHEST_STORAGE_SIZE,
  HOTBAR_SIZE,
  InventorySlot,
  ItemCategory,
  PlacedStructure,
  PlayerState,
  RarityTier,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';

interface ChestStorageModalProps {
  engine: GameEngine;
  chestId: string;
  player: PlayerState;
  onSelectChestId: (newChestId: string) => void;
  onClose: () => void;
}

type SelectedSlotRef =
  | { container: 'chest'; index: number }
  | { container: 'player'; index: number }
  | null;

const RARITY_BORDER_COLORS: Record<RarityTier, string> = {
  [RarityTier.BASIC]: 'border-[#5c3e23]',
  [RarityTier.RARE]: 'border-sky-400/90',
  [RarityTier.VERY_RARE]: 'border-amber-400',
};

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  [ItemCategory.TOOL]: 'Ferramenta',
  [ItemCategory.WEAPON]: 'Arma',
  [ItemCategory.ARMOR]: 'Armadura',
  [ItemCategory.CONSUMABLE]: 'Consumível',
  [ItemCategory.RESOURCE]: 'Recurso / Material',
  [ItemCategory.PLACEABLE]: 'Estrutura de Construção',
};

export const ChestStorageModal: React.FC<ChestStorageModalProps> = ({
  engine,
  chestId,
  player,
  onSelectChestId,
  onClose,
}) => {
  const [quickTransferMode, setQuickTransferMode] = useState<boolean>(true);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlotRef>(null);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>('');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [, setRenderTick] = useState<number>(0);

  const activeChest: PlacedStructure | null = engine.getChestById(chestId);
  const nearbyChests: PlacedStructure[] = engine.getNearbyChests();

  useEffect(() => {
    if (activeChest) {
      setNameDraft(
        activeChest.customName ||
          activeChest.landmarkName ||
          'Baú de Suprimentos Real'
      );
    }
  }, [chestId, activeChest?.customName, activeChest?.landmarkName]);

  const showFeedback = (msg: string) => {
    setStatusFeedback(msg);
    setRenderTick((t) => t + 1);
    window.setTimeout(() => {
      setStatusFeedback((prev) => (prev === msg ? null : prev));
    }, 2200);
  };

  if (!activeChest) {
    return null;
  }

  const chestSlots: (InventorySlot | null)[] =
    engine.ensureChestStorageInitialized(activeChest);
  const occupiedChestCount = chestSlots.filter(
    (s) => s !== null && s.count > 0
  ).length;
  const occupiedPlayerCount = player.inventory.filter(
    (s) => s !== null && s.count > 0
  ).length;

  const connMask = engine.world.getStructureConnectionMask(
    activeChest.tileX,
    activeChest.tileY,
    activeChest.type
  );
  const isDoubleChest = (connMask & 2) !== 0 || (connMask & 8) !== 0;
  const hasFloorUnder = Boolean(
    engine.world.getGroundStructureAtTile(activeChest.tileX, activeChest.tileY)
  );

  const selectedSlotData: InventorySlot | null =
    selectedSlot?.container === 'chest'
      ? chestSlots[selectedSlot.index] || null
      : selectedSlot?.container === 'player'
      ? player.inventory[selectedSlot.index] || null
      : null;

  const selectedItemDef = selectedSlotData
    ? ITEMS[selectedSlotData.itemId] || null
    : null;

  const handleSaveRename = () => {
    engine.renameChest(activeChest.id, nameDraft);
    setIsRenaming(false);
    showFeedback('Nome do baú atualizado!');
  };

  const handleChestSlotClick = (idx: number) => {
    const clickedSlot = chestSlots[idx];

    if (quickTransferMode) {
      if (clickedSlot && clickedSlot.count > 0) {
        const def = ITEMS[clickedSlot.itemId];
        const ok = engine.transferChestToPlayer(activeChest.id, idx);
        if (ok) {
          setSelectedSlot({ container: 'chest', index: idx });
          showFeedback(`Retirado: ${def?.name || clickedSlot.itemId}`);
        } else {
          showFeedback('Mochila cheia!');
        }
      } else {
        setSelectedSlot({ container: 'chest', index: idx });
      }
      return;
    }

    // Inspect / Organize Mode
    if (!selectedSlot) {
      if (clickedSlot) {
        setSelectedSlot({ container: 'chest', index: idx });
      }
      return;
    }

    if (selectedSlot.container === 'chest') {
      if (selectedSlot.index === idx) {
        setSelectedSlot(null);
      } else {
        engine.swapChestSlots(activeChest.id, selectedSlot.index, idx);
        setSelectedSlot({ container: 'chest', index: idx });
      }
    } else {
      // Selected slot was in Player inventory -> Move to this specific chest slot!
      const pSlot = player.inventory[selectedSlot.index];
      if (pSlot) {
        engine.transferPlayerToChest(
          activeChest.id,
          selectedSlot.index,
          pSlot.count,
          idx
        );
        setSelectedSlot({ container: 'chest', index: idx });
      } else {
        setSelectedSlot(
          clickedSlot ? { container: 'chest', index: idx } : null
        );
      }
    }
    setRenderTick((t) => t + 1);
  };

  const handlePlayerSlotClick = (idx: number) => {
    const clickedSlot = player.inventory[idx];

    if (quickTransferMode) {
      if (clickedSlot && clickedSlot.count > 0) {
        const def = ITEMS[clickedSlot.itemId];
        const ok = engine.transferPlayerToChest(activeChest.id, idx);
        if (ok) {
          setSelectedSlot({ container: 'player', index: idx });
          showFeedback(`Guardado no Baú: ${def?.name || clickedSlot.itemId}`);
        } else {
          showFeedback('Baú cheio!');
        }
      } else {
        setSelectedSlot({ container: 'player', index: idx });
      }
      return;
    }

    // Inspect / Organize Mode
    if (!selectedSlot) {
      if (clickedSlot) {
        setSelectedSlot({ container: 'player', index: idx });
      }
      return;
    }

    if (selectedSlot.container === 'player') {
      if (selectedSlot.index === idx) {
        setSelectedSlot(null);
      } else {
        engine.swapInventorySlots(selectedSlot.index, idx);
        setSelectedSlot({ container: 'player', index: idx });
      }
    } else {
      // Selected slot was in Chest -> Withdraw into this specific player slot!
      const cSlot = chestSlots[selectedSlot.index];
      if (cSlot) {
        engine.transferChestToPlayer(
          activeChest.id,
          selectedSlot.index,
          cSlot.count,
          idx
        );
        setSelectedSlot({ container: 'player', index: idx });
      } else {
        setSelectedSlot(
          clickedSlot ? { container: 'player', index: idx } : null
        );
      }
    }
    setRenderTick((t) => t + 1);
  };

  const handleTransferSelectedAmount = (amountMode: 'ONE' | 'HALF' | 'ALL') => {
    if (!selectedSlot || !selectedSlotData) return;
    const total = selectedSlotData.count;
    const count =
      amountMode === 'ONE'
        ? 1
        : amountMode === 'HALF'
        ? Math.max(1, Math.floor(total / 2))
        : total;

    if (selectedSlot.container === 'player') {
      const ok = engine.transferPlayerToChest(
        activeChest.id,
        selectedSlot.index,
        count
      );
      if (ok) {
        showFeedback(`Guardado ${count}x ${selectedItemDef?.name || ''}`);
      }
    } else {
      const ok = engine.transferChestToPlayer(
        activeChest.id,
        selectedSlot.index,
        count
      );
      if (ok) {
        showFeedback(`Retirado ${count}x ${selectedItemDef?.name || ''}`);
      }
    }
    setRenderTick((t) => t + 1);
  };

  const handlePickupChest = () => {
    const ok = engine.pickupChestStructure(activeChest.id);
    if (ok) {
      onClose();
    }
  };

  const renderSlotCell = (
    slot: InventorySlot | null,
    index: number,
    container: 'chest' | 'player',
    isHotbar = false
  ) => {
    const isSelected =
      selectedSlot?.container === container && selectedSlot?.index === index;
    const itemDef = slot ? ITEMS[slot.itemId] : null;
    const iconUrl = itemDef
      ? spriteAtlas.getItemIconUrl(itemDef.id)
      : undefined;
    const rarityBorder = itemDef
      ? RARITY_BORDER_COLORS[itemDef.rarity]
      : 'border-[#4a301a]';

    return (
      <button
        key={`${container}_${index}`}
        type="button"
        onClick={() =>
          container === 'chest'
            ? handleChestSlotClick(index)
            : handlePlayerSlotClick(index)
        }
        className={`relative aspect-square min-h-[42px] sm:min-h-[46px] flex items-center justify-center transition-transform active:scale-95 ${
          isSelected
            ? 'mc-slot-active ring-2 ring-amber-400'
            : `mc-slot ${rarityBorder}`
        }`}
        title={
          itemDef
            ? `${itemDef.name} (${slot?.count}x)`
            : container === 'chest'
            ? `Slot ${index + 1} do Baú`
            : isHotbar
            ? `Barra Rápida #${index + 1}`
            : `Mochila #${index - HOTBAR_SIZE + 1}`
        }
      >
        {/* Slot index micro-badge */}
        <span className="absolute top-0.5 left-1 text-[8px] font-mono text-[#8c7355] leading-none">
          {container === 'player' && isHotbar ? index + 1 : index + 1}
        </span>

        {slot && itemDef && iconUrl && (
          <>
            <img
              src={iconUrl}
              alt={itemDef.name}
              className="w-7 h-7 sm:w-8 sm:h-8 pixelated object-contain pointer-events-none"
            />
            {slot.count > 1 && (
              <span className="absolute bottom-0.5 right-1 px-1 py-[1px] bg-black/80 text-[10px] font-mono font-bold text-amber-300 leading-none rounded-xs">
                {slot.count}
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-1.5 sm:p-3 select-none">
      <div className="w-full max-w-5xl max-h-[96dvh] medieval-panel flex flex-col overflow-hidden shadow-2xl">
        {/* TOP HEADER BAR */}
        <div className="px-3 py-2 bg-[#1c110a] border-b-2 border-[#4e331c] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0">
              <img
                src={spriteAtlas.getItemIconUrl('chest')}
                alt="Baú"
                className="w-7 h-7 pixelated"
              />
            </div>
            <div className="min-w-0">
              {isRenaming ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={nameDraft}
                    maxLength={28}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename();
                    }}
                    className="px-2 py-1 bg-[#120b06] border border-amber-500/80 text-xs font-pixel text-amber-200 w-44 sm:w-56 focus:outline-none"
                    placeholder="Nome do Baú..."
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveRename}
                    className="px-2 py-1 medieval-btn-emerald text-[10px] font-bold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    OK
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                    {activeChest.customName ||
                      activeChest.landmarkName ||
                      'BAÚ DE SUPRIMENTOS REAL'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsRenaming(true)}
                    className="p-1 text-[#c4ab7d] hover:text-amber-300 transition-colors"
                    title="Renomear Baú"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[#c4ab7d]">
                <span>
                  Posição ({activeChest.tileX}, {activeChest.tileY})
                </span>
                <span>·</span>
                <span className="text-amber-300 font-semibold">
                  {occupiedChestCount}/{CHEST_STORAGE_SIZE} Slots
                </span>
                {isDoubleChest && (
                  <span className="px-1.5 py-0.2 bg-amber-500/20 border border-amber-400/50 text-amber-300 font-semibold">
                    ✦ Baú Duplo Conectado
                  </span>
                )}
                {hasFloorUnder && (
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                    Sobre Piso Construído
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Transfer Mode Toggle + Pickup Chest + Close */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQuickTransferMode((prev) => !prev)}
              className={`px-2.5 py-1.5 text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all ${
                quickTransferMode
                  ? 'medieval-btn-gold text-amber-100'
                  : 'medieval-btn-wood text-[#e5d5b5]'
              }`}
              title="Alternar entre transferência com 1 toque ou seleção/organização manual"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>
                {quickTransferMode
                  ? 'Modo: 1-Toque Transfere'
                  : 'Modo: Selecionar / Mover'}
              </span>
            </button>

            {!activeChest.villageId && (
              <button
                type="button"
                onClick={handlePickupChest}
                className="px-2.5 py-1.5 medieval-btn-wood text-[10px] sm:text-xs font-bold text-amber-300 flex items-center gap-1"
                title="Recolher o baú para a mochila (os itens dentro são transferidos automaticamente)"
              >
                <Hammer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Recolher Baú</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 medieval-btn-crimson flex items-center justify-center text-white"
              aria-label="Fechar Baú"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NEARBY CHESTS SWITCHER BAR (If multiple chests are placed near the player) */}
        {nearbyChests.length > 1 && (
          <div className="px-3 py-1.5 bg-[#160d07] border-b border-[#3d2613] flex items-center gap-1.5 overflow-x-auto shrink-0">
            <span className="text-[10px] font-bold text-[#a88d67] uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Package className="w-3 h-3 text-amber-400" />
              Baús Próximos ({nearbyChests.length}):
            </span>
            {nearbyChests.map((c, idx) => {
              const count = Array.isArray(c.storageSlots)
                ? c.storageSlots.filter((s) => s !== null && s.count > 0).length
                : 0;
              const isCurrent = c.id === activeChest.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    engine.closeChest(activeChest.id);
                    c.isOpen = true;
                    onSelectChestId(c.id);
                    setSelectedSlot(null);
                  }}
                  className={`px-2 py-1 text-[10px] font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                    isCurrent
                      ? 'medieval-btn-gold text-amber-200'
                      : 'medieval-btn-wood text-[#d5c19f]'
                  }`}
                >
                  <span>
                    {c.customName || c.landmarkName || `Baú #${idx + 1}`}
                  </span>
                  <span className="px-1 bg-black/50 text-amber-300 font-mono text-[9px]">
                    {count}/{CHEST_STORAGE_SIZE}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* MAIN DUAL-GRID BODY */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* LEFT PANEL: CHEST 24-SLOT STORAGE GRID */}
          <div className="bg-[#180f09]/95 border-2 border-[#4a301a] p-2.5 sm:p-3 flex flex-col justify-between space-y-2.5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-400" />
                  <h3 className="font-pixel text-xs font-bold text-amber-300">
                    COMPARTIMENTO DO BAÚ (24 SLOTS)
                  </h3>
                </div>
                <span className="text-[10px] text-[#c4ab7d]">
                  {quickTransferMode
                    ? 'Toque num item para retirar'
                    : 'Toque para inspecionar/mover'}
                </span>
              </div>

              {/* Quick Chest Management Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const moved = engine.quickStackToChest(activeChest.id);
                    showFeedback(
                      moved > 0
                        ? `Empilhado ${moved}x itens iguais no baú!`
                        : 'Nenhum item igual na mochila para empilhar'
                    );
                  }}
                  className="px-2 py-1.5 medieval-btn-emerald text-[10px] font-bold flex items-center justify-center gap-1"
                  title="Transfere automaticamente itens da mochila que já existem neste baú"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Empilhar Iguais</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const moved = engine.depositBackpackToChest(activeChest.id);
                    showFeedback(
                      moved > 0
                        ? `Guardado ${moved}x itens da mochila!`
                        : 'Mochila vazia ou baú sem espaço'
                    );
                  }}
                  className="px-2 py-1.5 medieval-btn-wood text-[10px] font-bold text-sky-200 flex items-center justify-center gap-1"
                  title="Guarda todos os itens da mochila (preservando os 8 slots da barra rápida)"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Guardar Mochila</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const taken = engine.takeAllFromChest(activeChest.id);
                    showFeedback(
                      taken > 0
                        ? `Retirado ${taken}x itens do baú!`
                        : 'Baú vazio ou mochila cheia'
                    );
                  }}
                  className="px-2 py-1.5 medieval-btn-gold text-[10px] font-bold flex items-center justify-center gap-1"
                  title="Retira todos os itens do baú para o seu inventário"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Retirar Tudo</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    engine.sortChestStorage(activeChest.id);
                    showFeedback('Baú organizado por categoria!');
                  }}
                  className="px-2 py-1.5 medieval-btn-wood text-[10px] font-bold text-amber-200 flex items-center justify-center gap-1"
                  title="Agrupa pilhas iguais e ordena os itens por categoria"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Organizar</span>
                </button>
              </div>

              {/* 24 Chest Slots (8 columns x 3 rows) */}
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 pt-1">
                {chestSlots.map((slot, idx) =>
                  renderSlotCell(slot, idx, 'chest', false)
                )}
              </div>
            </div>

            <div className="pt-1 border-t border-[#3b2514] flex items-center justify-between text-[10px] text-[#a88d67]">
              <span>
                Dica: Coloque 2 baús lado a lado para formar um{' '}
                <strong className="text-amber-300">Baú Duplo</strong> e alternar
                entre eles acima!
              </span>
              {statusFeedback && (
                <span className="text-emerald-400 font-bold shrink-0 ml-2">
                  ✦ {statusFeedback}
                </span>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: PLAYER INVENTORY (8 HOTBAR + 24 BACKPACK) */}
          <div className="bg-[#180f09]/95 border-2 border-[#4a301a] p-2.5 sm:p-3 flex flex-col justify-between space-y-2.5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Backpack className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-pixel text-xs font-bold text-emerald-300">
                    INVENTÁRIO DO HERÓI ({occupiedPlayerCount}/32)
                  </h3>
                </div>
                <span className="text-[10px] text-[#c4ab7d]">
                  {quickTransferMode
                    ? 'Toque num item para guardar'
                    : 'Toque para inspecionar/mover'}
                </span>
              </div>

              {/* Hotbar 8 Slots */}
              <div>
                <div className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wider mb-1">
                  Barra de Ação Rápida (Slots 1–8)
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {player.inventory
                    .slice(0, HOTBAR_SIZE)
                    .map((slot, idx) =>
                      renderSlotCell(slot, idx, 'player', true)
                    )}
                </div>
              </div>

              {/* Backpack 24 Slots */}
              <div>
                <div className="text-[10px] font-bold text-[#c4ab7d] uppercase tracking-wider mb-1">
                  Mochila de Viagem (24 Slots)
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                  {player.inventory
                    .slice(HOTBAR_SIZE)
                    .map((slot, idx) =>
                      renderSlotCell(slot, idx + HOTBAR_SIZE, 'player', false)
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ITEM INSPECTOR & GRANULAR TRANSFER BAR */}
        <div className="px-3 py-2 bg-[#160d07] border-t-2 border-[#4e331c] flex flex-wrap items-center justify-between gap-2 shrink-0">
          {selectedSlotData && selectedItemDef ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 mc-slot-active flex items-center justify-center shrink-0">
                  <img
                    src={spriteAtlas.getItemIconUrl(selectedItemDef.id)}
                    alt={selectedItemDef.name}
                    className="w-7 h-7 pixelated"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-pixel text-xs font-bold text-amber-300 truncate">
                      {selectedItemDef.name}
                    </span>
                    <span className="px-1.5 py-0.5 bg-black/60 border border-[#5c3e23] text-[10px] font-mono text-amber-200">
                      {selectedSlotData.count}x
                    </span>
                    <span className="text-[10px] text-[#a88d67] hidden sm:inline">
                      ({CATEGORY_LABELS[selectedItemDef.category]})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#e5d5b5] truncate max-w-xl">
                    {selectedItemDef.purposeSummary ||
                      selectedItemDef.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#c4ab7d] mr-1">
                  {selectedSlot?.container === 'player'
                    ? 'Guardar no Baú:'
                    : 'Retirar p/ Mochila:'}
                </span>
                <button
                  type="button"
                  onClick={() => handleTransferSelectedAmount('ONE')}
                  className="px-2.5 py-1 medieval-btn-wood text-[10px] font-bold text-amber-200"
                >
                  1x
                </button>
                {selectedSlotData.count > 1 && (
                  <button
                    type="button"
                    onClick={() => handleTransferSelectedAmount('HALF')}
                    className="px-2.5 py-1 medieval-btn-wood text-[10px] font-bold text-sky-200"
                  >
                    Metade ({Math.max(1, Math.floor(selectedSlotData.count / 2))}
                    x)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleTransferSelectedAmount('ALL')}
                  className="px-3 py-1 medieval-btn-gold text-[10px] font-bold"
                >
                  Tudo ({selectedSlotData.count}x)
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between text-[11px] text-[#c4ab7d]">
              <span>
                Toque em qualquer item do <strong>Baú</strong> ou da{' '}
                <strong>Mochila</strong> para transferir ou inspecionar.
              </span>
              <span className="hidden sm:inline text-amber-300/90">
                Os itens guardados permanecem salvos neste bloco do mapa!
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
