import React, { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Edit3,
  Layers,
  Package,
  Trash2,
  X,
} from 'lucide-react';
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
  const [selectedSource, setSelectedSource] = useState<'chest' | 'player'>(
    'player'
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(
    player.selectedHotbarIndex
  );
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(
    chest?.customName || 'Baú de Madeira'
  );
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (chest) {
      setNameInput(chest.customName || 'Baú de Madeira');
    }
  }, [chest?.id, chest?.customName]);

  if (!chest) {
    return null;
  }

  const chestSlots = engine.ensureChestStorageInitialized(chest);
  const usedChestSlots = chestSlots.filter(
    (s) => s !== null && s.count > 0
  ).length;
  const usedPlayerSlots = player.inventory.filter(
    (s) => s !== null && s.count > 0
  ).length;

  const activeSlot =
    selectedSource === 'chest'
      ? chestSlots[selectedIndex] || null
      : player.inventory[selectedIndex] || null;
  const activeItemDef = activeSlot ? ITEMS[activeSlot.itemId] : null;

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

          {/* Quick Actions + Help (?) + Close */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <HoldIconButton
              onClick={() => engine.quickStackToChest(chest.id)}
              tooltipTitle="Empilhar Iguais"
              tooltipDesc="Guarda apenas itens que já existem neste baú."
              className="min-h-[32px] px-2 medieval-btn-gold text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Empilhar</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => engine.depositBackpackToChest(chest.id)}
              tooltipTitle="Guardar Mochila"
              tooltipDesc="Transfere os itens da mochila (preserva a mão ativa)."
              className="min-h-[32px] px-2 medieval-btn-wood text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5 text-amber-300" />
              <span>Guardar</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => engine.takeAllFromChest(chest.id)}
              tooltipTitle="Retirar Tudo"
              tooltipDesc="Puxa todos os itens do baú para a sua mochila."
              className="min-h-[32px] px-2 medieval-btn-emerald text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>Retirar</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => engine.sortChestStorage(chest.id)}
              tooltipTitle="Organizar Baú"
              tooltipDesc="Agrupa pilhas e ordena por categoria."
              className="min-h-[32px] px-2 medieval-btn-wood text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <Package className="w-3.5 h-3.5 text-amber-300" />
              <span>Organizar</span>
            </HoldIconButton>

            <HoldIconButton
              onClick={() => {
                if (engine.pickupChestStructure(chest.id)) {
                  onClose();
                }
              }}
              tooltipTitle="Recolher Baú"
              tooltipDesc="Desmonta o baú e devolve os itens."
              className="min-h-[32px] px-2 medieval-btn-crimson text-[9px] sm:text-[10px] font-pixel font-bold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Recolher</span>
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
          {/* LEFT COLUMN (6 cols): CHEST 24-SLOT GRID (3x8) */}
          <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-[#3d281a] pb-1">
              <span className="font-pixel text-[10px] font-bold text-amber-400">
                BAÚ ({usedChestSlots}/{CHEST_STORAGE_SIZE})
              </span>
              <span className="text-[9px] text-[#c4ab7d]">
                Toque p/ retirar
              </span>
            </div>

            <div className="grid grid-cols-8 gap-1">
              {chestSlots.slice(0, CHEST_STORAGE_SIZE).map((slot, idx) => {
                const def = slot ? ITEMS[slot.itemId] : null;
                const isSel =
                  selectedSource === 'chest' && selectedIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (slot) {
                        engine.transferChestToPlayer(chest.id, idx);
                        setSelectedSource('chest');
                        setSelectedIndex(idx);
                      } else {
                        setSelectedSource('chest');
                        setSelectedIndex(idx);
                      }
                    }}
                    className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 transition-transform ${
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

            {/* Selected Slot Action Strip */}
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
                      <div className="font-pixel text-[10px] font-bold text-white truncate">
                        {activeItemDef.name} (x{activeSlot.count})
                      </div>
                      <div className="text-[9px] text-[#c4ab7d] truncate">
                        {activeItemDef.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {selectedSource === 'chest' ? (
                      <>
                        <button
                          onClick={() =>
                            engine.transferChestToPlayer(
                              chest.id,
                              selectedIndex,
                              1
                            )
                          }
                          className="px-2 py-1 medieval-btn-wood text-[9px] font-bold"
                        >
                          -1
                        </button>
                        {activeSlot.count > 1 && (
                          <button
                            onClick={() =>
                              engine.transferChestToPlayer(
                                chest.id,
                                selectedIndex,
                                Math.ceil(activeSlot.count / 2)
                              )
                            }
                            className="px-2 py-1 medieval-btn-wood text-[9px] font-bold"
                          >
                            50%
                          </button>
                        )}
                        <button
                          onClick={() =>
                            engine.transferChestToPlayer(
                              chest.id,
                              selectedIndex
                            )
                          }
                          className="px-2 py-1 medieval-btn-emerald text-[9px] font-bold"
                        >
                          Retirar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            engine.transferPlayerToChest(
                              chest.id,
                              selectedIndex,
                              1
                            )
                          }
                          className="px-2 py-1 medieval-btn-wood text-[9px] font-bold"
                        >
                          +1
                        </button>
                        {activeSlot.count > 1 && (
                          <button
                            onClick={() =>
                              engine.transferPlayerToChest(
                                chest.id,
                                selectedIndex,
                                Math.ceil(activeSlot.count / 2)
                              )
                            }
                            className="px-2 py-1 medieval-btn-wood text-[9px] font-bold"
                          >
                            50%
                          </button>
                        )}
                        <button
                          onClick={() =>
                            engine.transferPlayerToChest(
                              chest.id,
                              selectedIndex
                            )
                          }
                          className="px-2 py-1 medieval-btn-gold text-[9px] font-bold"
                        >
                          Guardar
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-[#8c6d46] w-full text-center">
                  Toque em qualquer item para transferir.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (6 cols): PLAYER BACKPACK (24) + HOTBAR (8) */}
          <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2">
            <div className="flex items-center justify-between border-b border-[#3d281a] pb-1">
              <span className="font-pixel text-[10px] font-bold text-[#e5d5b5]">
                MOCHILA ({usedPlayerSlots}/{TOTAL_INVENTORY_SIZE})
              </span>
              <span className="text-[9px] text-amber-300">
                Toque p/ guardar
              </span>
            </div>

            <div className="grid grid-cols-8 gap-1">
              {player.inventory
                .slice(HOTBAR_SIZE, TOTAL_INVENTORY_SIZE)
                .map((slot, offset) => {
                  const idx = offset + HOTBAR_SIZE;
                  const def = slot ? ITEMS[slot.itemId] : null;
                  const isSel =
                    selectedSource === 'player' && selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (slot) {
                          engine.transferPlayerToChest(chest.id, idx);
                          setSelectedSource('player');
                          setSelectedIndex(idx);
                        } else {
                          setSelectedSource('player');
                          setSelectedIndex(idx);
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
                    selectedSource === 'player' && selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (slot) {
                          engine.transferPlayerToChest(chest.id, idx);
                          setSelectedSource('player');
                          setSelectedIndex(idx);
                        } else {
                          setSelectedSource('player');
                          setSelectedIndex(idx);
                        }
                      }}
                      className={`relative aspect-square min-h-[36px] sm:min-h-[42px] flex flex-col items-center justify-center p-0.5 ${
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
        </div>
      </div>

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Baú de Madeira"
          subtitle="Transferência rápida e organização de estoque"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Guardar e Retirar c/ 1 Toque',
              body: 'Toque em qualquer item da sua Mochila (à direita) para guardá-lo no baú, ou toque em um item do Baú (à esquerda) para puxá-lo para a mochila.',
            },
            {
              title: '2. Empilhar & Guardar Tudo',
              body: 'O botão Empilhar envia para o baú apenas os itens da sua mochila que já possuem pilha igual dentro do baú. O botão Guardar envia toda a mochila de uma vez.',
            },
            {
              title: '3. Renomear & Recolher',
              body: 'Toque no ícone de lápis ao lado do título para dar um nome ao baú (ex: Minérios, Comidas), ou use Recolher para desmontar o baú.',
            },
          ]}
        />
      )}
    </div>
  );
};
