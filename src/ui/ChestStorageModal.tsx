import React, { useEffect, useState } from 'react';
import { Check, Edit3, X } from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import {
  CHEST_STORAGE_SIZE,
  HOTBAR_SIZE,
  PlayerState,
  TOTAL_INVENTORY_SIZE,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import {
  HoldIconButton,
  WindowHelpButton,
  WindowHelpModal,
} from './UiTooltipAndHelp';
import {
  StackDragFloatingHud,
  useStackQuantityGesture,
} from './useStackQuantityGesture';

interface ChestStorageModalProps {
  engine: GameEngine;
  chestId: string;
  player: PlayerState;
  onSelectChestId?: (newId: string) => void;
  onClose: () => void;
}

export const ChestStorageModal: React.FC<ChestStorageModalProps> = ({
  engine,
  chestId,
  player,
  onClose,
}) => {
  const chest = engine.getChestById(chestId);
  const [selectedSlot, setSelectedSlot] = useState<{
    container: 'chest' | 'player';
    index: number;
    count?: number;
  } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(
    chest?.customName || 'Baú de Madeira'
  );
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (chest) {
      setNameInput(chest.customName || 'Baú de Madeira');
      setSelectedSlot(null);
    }
  }, [chest?.id, chest?.customName]);

  const chestSlots = chest ? engine.ensureChestStorageInitialized(chest) : [];

  const handleSlotClick = (container: 'chest' | 'player', index: number) => {
    if (!chest) return;
    const clickedSlot =
      container === 'chest' ? chestSlots[index] : player.inventory[index];

    if (!selectedSlot) {
      if (clickedSlot && clickedSlot.count > 0) {
        setSelectedSlot({ container, index, count: clickedSlot.count });
      }
      return;
    }

    if (
      selectedSlot.container === container &&
      selectedSlot.index === index
    ) {
      setSelectedSlot(null);
      return;
    }

    const srcSlot =
      selectedSlot.container === 'chest'
        ? chestSlots[selectedSlot.index]
        : player.inventory[selectedSlot.index];

    if (!srcSlot || srcSlot.count <= 0) {
      if (clickedSlot && clickedSlot.count > 0) {
        setSelectedSlot({ container, index, count: clickedSlot.count });
      } else {
        setSelectedSlot(null);
      }
      return;
    }

    const moveCount =
      typeof selectedSlot.count === 'number'
        ? Math.max(1, Math.min(srcSlot.count, selectedSlot.count))
        : srcSlot.count;

    engine.moveOrSwapChestAndPlayerSlot(
      chest.id,
      { container: selectedSlot.container, index: selectedSlot.index },
      { container, index },
      moveCount
    );
    setSelectedSlot(null);
  };

  const { activeDrag, getSlotGestureProps } = useStackQuantityGesture<string>({
    onSelectWithCount: (slotKey, count) => {
      const [cType, idxStr] = slotKey.split(':');
      const container = cType === 'chest' ? 'chest' : 'player';
      const index = Number(idxStr);
      if (Number.isInteger(index) && index >= 0) {
        setSelectedSlot({ container, index, count });
      }
    },
    onSlotTap: (slotKey) => {
      const [cType, idxStr] = slotKey.split(':');
      const container = cType === 'chest' ? 'chest' : 'player';
      const index = Number(idxStr);
      if (Number.isInteger(index) && index >= 0) {
        handleSlotClick(container, index);
      }
    },
  });

  if (!chest) {
    return null;
  }

  const usedChestSlots = chestSlots.filter(
    (s) => s !== null && s.count > 0
  ).length;
  const usedPlayerSlots = player.inventory.filter(
    (s) => s !== null && s.count > 0
  ).length;

  const activeSlot =
    selectedSlot === null
      ? null
      : selectedSlot.container === 'chest'
      ? chestSlots[selectedSlot.index] || null
      : player.inventory[selectedSlot.index] || null;
  const activeItemDef = activeSlot ? ITEMS[activeSlot.itemId] : null;
  const activeSelectedCount = activeSlot
    ? Math.max(
        1,
        Math.min(activeSlot.count, selectedSlot?.count ?? activeSlot.count)
      )
    : 0;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    engine.renameChest(chest.id, nameInput);
    setEditingName(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3"
      onClick={onClose}
    >
      <StackDragFloatingHud drag={activeDrag} />
      <div
        className="w-full max-w-5xl medieval-panel flex flex-col max-h-[96dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 mc-slot-active flex items-center justify-center shrink-0">
              <img
                src={spriteAtlas.getItemIconUrl('wood_chest')}
                alt="Baú"
                className="w-6 h-6 pixelated"
              />
            </div>

            {editingName ? (
              <form
                onSubmit={handleSaveName}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  maxLength={24}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  autoFocus
                  className="h-7 px-2 mc-slot text-xs text-white focus:outline-none w-40 sm:w-52"
                />
                <button
                  type="submit"
                  className="min-h-[28px] px-2 medieval-btn-gold text-[10px] font-bold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar</span>
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-pixel text-[11px] sm:text-xs font-bold text-amber-400">
                      {chest.customName || 'BAÚ DE MADEIRA'}
                    </h2>
                    <button
                      onClick={() => setEditingName(true)}
                      className="p-1 text-[#c4ab7d] hover:text-amber-300"
                      title="Renomear"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-[9px] text-[#c4ab7d] font-mono-tabular">
                    ({chest.tileX}, {chest.tileY}) · {usedChestSlots}/
                    {CHEST_STORAGE_SIZE} Slots
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions + Help (?) + Close */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <HoldIconButton
              onClick={() => {
                engine.takeAllFromChest(chest.id);
                setSelectedSlot(null);
              }}
              tooltipTitle="Retirar Tudo"
              tooltipDesc="Retira todos os itens do baú para a sua mochila."
              className="min-h-[32px] px-2 medieval-btn-wood text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <span>Retirar Tudo</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => {
                engine.depositBackpackToChest(chest.id);
                setSelectedSlot(null);
              }}
              tooltipTitle="Guardar Tudo"
              tooltipDesc="Guarda os itens da mochila dentro do baú."
              className="min-h-[32px] px-2 medieval-btn-wood text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <span>Guardar Tudo</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => {
                engine.quickStackToChest(chest.id);
                setSelectedSlot(null);
              }}
              tooltipTitle="Semelhantes"
              tooltipDesc="Guarda apenas os itens que já estão presentes neste baú, empilhando ou ocupando espaços livres até a capacidade máxima."
              className="min-h-[32px] px-2 medieval-btn-emerald text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <span>Semelhantes</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => {
                engine.sortChestStorage(chest.id);
                setSelectedSlot(null);
              }}
              tooltipTitle="Organizar"
              tooltipDesc="Agrupa pilhas iguais e organiza os itens do baú."
              className="min-h-[32px] px-2 medieval-btn-gold text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <span>Organizar</span>
            </HoldIconButton>

            <WindowHelpButton onClick={() => setShowHelp(true)} />

            <button
              onClick={onClose}
              className="min-h-[32px] min-w-[32px] medieval-btn-crimson flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
          {/* LEFT COLUMN (6 cols): PLAYER BACKPACK (24) + HOTBAR (8) */}
          <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-[#3d281a] pb-1">
              <span className="font-pixel text-[10px] font-bold text-[#e5d5b5]">
                MOCHILA ({usedPlayerSlots}/{TOTAL_INVENTORY_SIZE})
              </span>
              <span className="text-[9px] text-amber-300">
                {selectedSlot
                  ? 'Clique no destino p/ mover'
                  : 'Toque ou segure + arraste ◀ ▶'}
              </span>
            </div>

            <div className="grid grid-cols-8 gap-1">
              {player.inventory
                .slice(HOTBAR_SIZE, TOTAL_INVENTORY_SIZE)
                .map((slot, offset) => {
                  const idx = offset + HOTBAR_SIZE;
                  const def = slot ? ITEMS[slot.itemId] : null;
                  const isSel =
                    selectedSlot?.container === 'player' &&
                    selectedSlot.index === idx;
                  const canQuantize =
                    Boolean(slot && slot.count > 1) &&
                    (!selectedSlot || isSel);
                  const gestureProps = getSlotGestureProps(
                    `player:${idx}`,
                    slot?.count || 0,
                    canQuantize
                  );
                  return (
                    <button
                      key={idx}
                      type="button"
                      {...gestureProps}
                      className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 touch-none ${
                        isSel
                          ? 'mc-slot-active ring-2 ring-amber-400'
                          : selectedSlot
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
                            <span
                              className={`absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold ${
                                isSel && activeSelectedCount < slot.count
                                  ? 'text-cyan-300 bg-black/80 px-0.5 rounded-sm'
                                  : 'text-[#fef08a]'
                              }`}
                            >
                              {isSel && activeSelectedCount < slot.count
                                ? `${activeSelectedCount}/${slot.count}`
                                : slot.count}
                            </span>
                          )}
                        </>
                      ) : null}
                    </button>
                  );
                })}
            </div>

            {/* 1x8 Hotbar */}
            <div className="space-y-1 pt-1.5 border-t border-[#3d281a]">
              <div className="flex items-center justify-between text-[9px]">
                <span className="font-pixel text-amber-400">
                  MÃO ATIVA (8 SLOTS)
                </span>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {player.inventory.slice(0, HOTBAR_SIZE).map((slot, idx) => {
                  const def = slot ? ITEMS[slot.itemId] : null;
                  const isSel =
                    selectedSlot?.container === 'player' &&
                    selectedSlot.index === idx;
                  const canQuantize =
                    Boolean(slot && slot.count > 1) &&
                    (!selectedSlot || isSel);
                  const gestureProps = getSlotGestureProps(
                    `player:${idx}`,
                    slot?.count || 0,
                    canQuantize
                  );
                  return (
                    <button
                      key={idx}
                      type="button"
                      {...gestureProps}
                      className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 touch-none ${
                        isSel
                          ? 'mc-slot-active ring-2 ring-amber-400'
                          : selectedSlot
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
                            <span
                              className={`absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold ${
                                isSel && activeSelectedCount < slot.count
                                  ? 'text-cyan-300 bg-black/80 px-0.5 rounded-sm'
                                  : 'text-[#fef08a]'
                              }`}
                            >
                              {isSel && activeSelectedCount < slot.count
                                ? `${activeSelectedCount}/${slot.count}`
                                : slot.count}
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

          {/* RIGHT COLUMN (6 cols): CHEST 24-SLOT GRID (3x8) */}
          <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-[#3d281a] pb-1">
              <span className="font-pixel text-[10px] font-bold text-amber-400">
                BAÚ ({usedChestSlots}/{CHEST_STORAGE_SIZE})
              </span>
              <span className="text-[9px] text-[#c4ab7d]">
                {selectedSlot
                  ? 'Clique no destino p/ mover'
                  : 'Toque ou segure + arraste ◀ ▶'}
              </span>
            </div>

            <div className="grid grid-cols-8 gap-1">
              {chestSlots.slice(0, CHEST_STORAGE_SIZE).map((slot, idx) => {
                const def = slot ? ITEMS[slot.itemId] : null;
                const isSel =
                  selectedSlot?.container === 'chest' &&
                  selectedSlot.index === idx;
                const canQuantize =
                  Boolean(slot && slot.count > 1) &&
                  (!selectedSlot || isSel);
                const gestureProps = getSlotGestureProps(
                  `chest:${idx}`,
                  slot?.count || 0,
                  canQuantize
                );
                return (
                  <button
                    key={idx}
                    type="button"
                    {...gestureProps}
                    className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 transition-transform touch-none ${
                      isSel
                        ? 'mc-slot-active ring-2 ring-amber-400'
                        : selectedSlot
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
                          <span
                            className={`absolute bottom-0 right-0.5 text-[8px] sm:text-[9px] font-mono-tabular font-extrabold ${
                              isSel && activeSelectedCount < slot.count
                                ? 'text-cyan-300 bg-black/80 px-0.5 rounded-sm'
                                : 'text-[#fef08a]'
                            }`}
                          >
                            {isSel && activeSelectedCount < slot.count
                              ? `${activeSelectedCount}/${slot.count}`
                              : slot.count}
                          </span>
                        )}
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Selected Slot Info Strip */}
            <div className="mc-slot p-2 flex items-center justify-between gap-2 min-h-[50px]">
              {activeSlot && activeItemDef ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={spriteAtlas.getItemIconUrl(activeItemDef.id)}
                      alt={activeItemDef.name}
                      className="w-6 h-6 pixelated shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-pixel text-[10px] font-bold text-amber-300 truncate">
                        Selecionado: {activeItemDef.name} (x{activeSelectedCount}
                        {activeSelectedCount < activeSlot.count
                          ? ` de ${activeSlot.count}`
                          : ''}
                        )
                      </div>
                      <div className="text-[9px] text-[#c4ab7d] truncate">
                        Clique no slot de destino para mover a quantidade selecionada.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSlot(null)}
                    className="px-2 py-1 medieval-btn-wood text-[9px] font-bold shrink-0"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <div className="text-[10px] text-[#8c6d46] w-full text-center">
                  Toque em um item para selecioná-lo (ou segure e arraste ◀ ▶ para escolher a quantidade) e toque no destino.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Baú de Madeira"
          subtitle="Como mover, dividir pilhas e organizar itens entre a Mochila e o Baú"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Selecionar e Mover',
              body: 'Toque primeiro sobre o item que deseja mover (na Mochila ou no Baú) e depois toque no slot de destino.',
            },
            {
              title: '2. Quantizar Pilhas (Segurar e Arrastar ◀ ▶)',
              body: 'Segure o dedo sobre um item empilhável e arraste para a esquerda ou para a direita para escolher exatamente quantos itens serão movidos. Ao soltar o dedo, toque no slot de destino para transferir essa quantidade.',
            },
            {
              title: '3. Semelhantes, Guardar, Retirar e Organizar',
              body: 'O botão Semelhantes guarda apenas os itens da sua mochila que já existem naquele baú, empilhando ou usando espaços vazios até a capacidade máxima.',
            },
          ]}
        />
      )}
    </div>
  );
};
