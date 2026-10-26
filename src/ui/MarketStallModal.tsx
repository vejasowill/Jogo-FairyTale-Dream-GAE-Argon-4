import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Coins,
  Edit3,
  Eye,
  EyeOff,
  Package,
  RotateCw,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  evaluateStallPriceDeal,
  getItemBasePrice,
  ITEMS,
} from '../game/core/ItemRegistry';
import { PlacedStructure, PlayerState } from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import {
  HoldIconButton,
  WindowHelpButton,
  WindowHelpModal,
} from './UiTooltipAndHelp';

interface MarketStallModalProps {
  engine: GameEngine;
  stallId: string;
  player: PlayerState;
  onSelectStallId?: (newId: string) => void;
  onOpenNpcTrade?: (npcId: string) => void;
  onOpenWorkbench?: () => void;
  onClose: () => void;
}

export const MarketStallModal: React.FC<MarketStallModalProps> = ({
  engine,
  stallId,
  player,
  onClose,
}) => {
  const stall: PlacedStructure | null = engine.getMarketStallById(stallId);
  const [activeTab, setActiveTab] = useState<'counter' | 'catalog' | 'settings'>(
    'counter'
  );
  const [selectedBagSlot, setSelectedBagSlot] = useState<number | null>(null);
  const [transferQty, setTransferQty] = useState<number>(1);
  const [customPriceInput, setCustomPriceInput] = useState<number>(8);
  const [nameDraft, setNameDraft] = useState<string>(stall?.customName || '');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [showHelp, setShowHelp] = useState(false);

  if (!stall) return null;

  const stallSlots = engine.ensureMarketStallInitialized(stall);
  const isPlayerOwner = stall.ownerType === 'PLAYER';
  const isOpen = stall.stallOpen !== false;
  const offer = stall.pendingCustomerOffer || null;
  const goldCoinsInBag = engine.getItemCount('gold_coin');
  const unclaimedGold = Math.max(0, Math.floor(stall.stallUnclaimedGold || 0));

  const occupiedSlotsCount = stallSlots.filter(
    (s) => s !== null && s.count > 0
  ).length;

  const nearbyVillagers = engine.entities.creatures.filter(
    (c) =>
      (c.kind === 'VILLAGER' || c.kind === 'WANDERER') &&
      c.hp > 0 &&
      !c.isHostile
  );

  const selectedBagItem =
    selectedBagSlot !== null ? player.inventory[selectedBagSlot] : null;
  const selectedBagDef = selectedBagItem ? ITEMS[selectedBagItem.itemId] : null;

  const handleSelectBagSlot = (idx: number) => {
    const sl = player.inventory[idx];
    if (!sl || sl.itemId === 'gold_coin') return;
    setSelectedBagSlot(idx);
    setTransferQty(sl.count);
    setCustomPriceInput(getItemBasePrice(sl.itemId));
  };

  const handlePutSelectedOnStall = (targetStallIdx?: number) => {
    if (selectedBagSlot === null) return;
    const sl = player.inventory[selectedBagSlot];
    if (!sl) {
      setSelectedBagSlot(null);
      return;
    }
    const ok = engine.transferPlayerToStall(
      stall.id,
      selectedBagSlot,
      transferQty,
      customPriceInput,
      targetStallIdx
    );
    if (ok) {
      setFeedback('Item exposto!');
      const remaining = engine.player.inventory[selectedBagSlot];
      if (!remaining) setSelectedBagSlot(null);
    }
  };

  const handleClaimGold = () => {
    const res = engine.claimMarketStallGold(stall.id);
    setFeedback(res.message);
  };

  const allCatalogItems = Object.values(ITEMS)
    .filter((it) => it.id !== 'gold_coin')
    .filter((it) =>
      catalogSearch.trim() === ''
        ? true
        : it.name.toLowerCase().includes(catalogSearch.trim().toLowerCase())
    );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[95dvh] medieval-panel flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* COMPACT HEADER */}
        <div className="px-3 py-2 bg-[#1c110a] border-b-2 border-[#4a301e] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0">
              <img
                src={spriteAtlas.getItemIconUrl('market_stall')}
                alt="Tenda"
                className="w-6 h-6 pixelated"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                  {stall.customName || 'Tenda de Vendas'}
                </h2>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 border ${
                    isPlayerOwner
                      ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                      : 'bg-sky-950/70 border-sky-500/60 text-sky-300'
                  }`}
                >
                  {isPlayerOwner ? 'Sua Tenda' : stall.ownerName || 'Aldeão'}
                </span>
              </div>
              <div className="text-[10px] text-[#c4ab7d] flex items-center gap-2 font-mono-tabular">
                <span>Balcão: {occupiedSlotsCount}/8</span>
                <span>·</span>
                <span className="text-amber-300 font-bold">
                  Bolso: {goldCoinsInBag} Ouro
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isPlayerOwner && (
              <HoldIconButton
                onClick={() => engine.toggleMarketStallOpen(stall.id)}
                tooltipTitle={isOpen ? 'Tenda Aberta' : 'Tenda Fechada'}
                tooltipDesc="Toque para abrir ou fechar as vendas para NPCs."
                tooltipAlign="right"
                className={`min-h-[34px] px-2.5 font-pixel text-[10px] font-bold flex items-center gap-1 ${
                  isOpen ? 'medieval-btn-emerald' : 'medieval-btn-wood'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>{isOpen ? 'ON' : 'OFF'}</span>
              </HoldIconButton>
            )}
            <WindowHelpButton onClick={() => setShowHelp(true)} />
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CAIXINHA DE MOEDAS DO JOGADOR (EXCLUSIVA PARA TENDAS DO JOGADOR) */}
        {isPlayerOwner && (
          <div className="px-3 py-2 bg-[#160e08] border-b border-[#3b2516] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 flex items-center justify-center shrink-0 border-2 ${
                  unclaimedGold > 0
                    ? 'bg-amber-950/70 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                    : 'mc-slot border-[#4a301e]'
                }`}
              >
                <img
                  src={spriteAtlas.getItemIconUrl('gold_coin')}
                  alt="Caixinha"
                  className="w-6 h-6 pixelated"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-[10px] font-bold text-amber-300">
                    CAIXINHA DA TENDA:
                  </span>
                  <span className="font-mono-tabular text-xs sm:text-sm font-extrabold text-amber-200">
                    {unclaimedGold} Moedas
                  </span>
                </div>
                <div className="text-[10px] text-[#c4ab7d] font-mono-tabular">
                  Vendas: {stall.stallSalesCount || 0} · Total Acumulado:{' '}
                  {stall.stallTotalGoldEarned || 0} Ouro
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={unclaimedGold <= 0}
              onClick={handleClaimGold}
              className={`min-h-[34px] px-3 font-pixel text-[10px] font-bold flex items-center gap-1.5 shrink-0 ${
                unclaimedGold > 0
                  ? 'medieval-btn-gold animate-pulse'
                  : 'medieval-btn-wood opacity-45 cursor-not-allowed'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Resgatar</span>
            </button>
          </div>
        )}

        {/* COMPACT NAVIGATION TABS */}
        <div className="px-3 pt-1.5 bg-[#160e08] border-b border-[#3b2516] flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('counter')}
              className={`px-3 py-1 font-pixel text-[10px] font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
                activeTab === 'counter'
                  ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                  : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Balcão</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1 font-pixel text-[10px] font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
                activeTab === 'catalog'
                  ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                  : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Preços</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1 font-pixel text-[10px] font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
                activeTab === 'settings'
                  ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                  : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Ajustes</span>
            </button>
          </div>

          {feedback && (
            <span className="text-[10px] font-bold text-amber-300 truncate pr-1">
              {feedback}
            </span>
          )}
        </div>

        {/* ACTIVE CUSTOMER BANNER (IF ANY) */}
        {offer && (
          <div className="px-3 py-2 bg-amber-950/60 border-b border-amber-500/70 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <div className="text-xs text-amber-100 truncate">
                <strong>{offer.buyerName}:</strong> {offer.quantity}x{' '}
                {ITEMS[offer.itemId]?.name || offer.itemId} por{' '}
                <strong className="text-amber-300">
                  {offer.totalPrice} Moedas
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const res = engine.acceptStallCustomerOffer(stall.id);
                  setFeedback(res.message);
                }}
                className="px-2.5 min-h-[30px] medieval-btn-gold font-pixel text-[10px] font-bold"
              >
                Vender
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = engine.declineStallCustomerOffer(stall.id);
                  setFeedback(res.message);
                }}
                className="px-2.5 min-h-[30px] medieval-btn-crimson font-pixel text-[10px] font-bold"
              >
                Recusar
              </button>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <div className="p-2.5 sm:p-3 overflow-y-auto flex-1">
          {activeTab === 'counter' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              {/* LEFT 7 COLS: 8 STALL SLOTS */}
              <div className="lg:col-span-7 medieval-inset p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-[#3d281a] pb-1.5">
                  <span className="font-pixel text-[10px] font-bold text-amber-400">
                    VITRINE ({occupiedSlotsCount}/8)
                  </span>

                  {isPlayerOwner && occupiedSlotsCount > 0 && (
                    <div className="flex items-center gap-1">
                      <HoldIconButton
                        onClick={() =>
                          engine.setAllStallPricesToPreset(stall.id, 0.75)
                        }
                        tooltipTitle="Preço Barato (-25%)"
                        tooltipDesc="Aplica desconto em todos os itens para vender rápido."
                        className="px-2 py-0.5 medieval-btn-emerald text-[9px] font-bold"
                      >
                        Barato
                      </HoldIconButton>
                      <HoldIconButton
                        onClick={() =>
                          engine.setAllStallPricesToPreset(stall.id, 1.0)
                        }
                        tooltipTitle="Preço Base (100%)"
                        tooltipDesc="Restaura o valor sugerido em todos os itens."
                        className="px-2 py-0.5 medieval-btn-wood text-[9px] font-bold"
                      >
                        Base
                      </HoldIconButton>
                      <HoldIconButton
                        onClick={() =>
                          engine.setAllStallPricesToPreset(stall.id, 1.25)
                        }
                        tooltipTitle="Preço Caro (+25%)"
                        tooltipDesc="Aumenta o lucro por venda, mas reduz a chance de compra."
                        className="px-2 py-0.5 medieval-btn-gold text-[9px] font-bold"
                      >
                        Caro
                      </HoldIconButton>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stallSlots.map((slot, sIdx) => {
                    const def = slot ? ITEMS[slot.itemId] : null;
                    const deal = slot
                      ? evaluateStallPriceDeal(slot.itemId, slot.unitPrice)
                      : null;

                    return (
                      <div
                        key={sIdx}
                        onClick={() => {
                          if (!slot && selectedBagSlot !== null && isPlayerOwner) {
                            handlePutSelectedOnStall(sIdx);
                          }
                        }}
                        className={`p-2 border-2 flex flex-col justify-between gap-1.5 transition-all ${
                          slot
                            ? 'bg-[#22150c] border-[#5c3d28]'
                            : selectedBagSlot !== null && isPlayerOwner
                            ? 'bg-[#1c1209] border-dashed border-amber-500/60 cursor-pointer'
                            : 'bg-[#120b07]/80 border-[#362215]'
                        }`}
                      >
                        {slot && def && deal ? (
                          <>
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 mc-slot flex items-center justify-center relative shrink-0">
                                  <img
                                    src={spriteAtlas.getItemIconUrl(slot.itemId)}
                                    alt={def.name}
                                    className="w-6 h-6 pixelated"
                                  />
                                  <span className="absolute -bottom-0.5 right-0.5 text-[9px] font-mono-tabular font-extrabold text-white">
                                    {slot.count}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-white truncate">
                                    {def.name}
                                  </div>
                                  <span
                                    className="text-[9px] font-bold px-1 py-0.2 border inline-block"
                                    style={{
                                      color: deal.dealBadgeColor,
                                      borderColor: `${deal.dealBadgeColor}55`,
                                    }}
                                  >
                                    {Math.round(deal.buyChance * 100)}% Chance
                                  </span>
                                </div>
                              </div>

                              {isPlayerOwner && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <HoldIconButton
                                    onClick={() =>
                                      engine.toggleStallSlotEnabled(
                                        stall.id,
                                        sIdx
                                      )
                                    }
                                    tooltipTitle={
                                      slot.enabled ? 'Em Venda' : 'Pausado'
                                    }
                                    tooltipDesc="Ativa ou pausa a venda deste slot."
                                    className={`min-h-[26px] min-w-[26px] flex items-center justify-center border ${
                                      slot.enabled
                                        ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                                        : 'bg-zinc-900 border-zinc-600 text-zinc-400'
                                    }`}
                                  >
                                    {slot.enabled ? (
                                      <Eye className="w-3.5 h-3.5" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    )}
                                  </HoldIconButton>
                                  <HoldIconButton
                                    onClick={() =>
                                      engine.transferStallToPlayer(
                                        stall.id,
                                        sIdx
                                      )
                                    }
                                    tooltipTitle="Retirar"
                                    tooltipDesc="Devolve o item para sua mochila."
                                    className="px-1.5 min-h-[26px] medieval-btn-wood text-[9px] font-bold"
                                  >
                                    Retirar
                                  </HoldIconButton>
                                </div>
                              )}
                            </div>

                            {/* Price Adjuster */}
                            <div className="pt-1 border-t border-[#3b2516] flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                <img
                                  src={spriteAtlas.getItemIconUrl('gold_coin')}
                                  alt="Ouro"
                                  className="w-3.5 h-3.5 pixelated"
                                />
                                <span className="text-[11px] font-mono-tabular font-bold text-amber-300">
                                  {slot.unitPrice}
                                </span>
                                <span className="text-[9px] text-[#a38b65]">
                                  (Base {deal.basePrice})
                                </span>
                              </div>

                              {isPlayerOwner && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      engine.updateStallSlotPrice(
                                        stall.id,
                                        sIdx,
                                        Math.max(1, slot.unitPrice - 1)
                                      )
                                    }
                                    className="w-6 h-6 medieval-btn-wood flex items-center justify-center"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={slot.unitPrice}
                                    onChange={(e) =>
                                      engine.updateStallSlotPrice(
                                        stall.id,
                                        sIdx,
                                        Math.max(
                                          1,
                                          parseInt(e.target.value || '1', 10)
                                        )
                                      )
                                    }
                                    className="w-11 h-6 bg-[#120b07] border border-[#5c3d28] text-center font-mono-tabular text-[10px] font-bold text-amber-200"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      engine.updateStallSlotPrice(
                                        stall.id,
                                        sIdx,
                                        slot.unitPrice + 1
                                      )
                                    }
                                    className="w-6 h-6 medieval-btn-wood flex items-center justify-center"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="h-[64px] flex flex-col items-center justify-center text-center">
                            <Tag className="w-3.5 h-3.5 text-[#6e4930]" />
                            <span className="text-[9px] font-pixel text-[#8c6d46]">
                              Vazio #{sIdx + 1}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT 5 COLS: PLAYER BACKPACK */}
              <div className="lg:col-span-5 medieval-inset p-2.5 space-y-2">
                <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5">
                  <span className="font-pixel text-[10px] font-bold text-amber-400">
                    MOCHILA
                  </span>
                  <span className="text-[9px] text-[#c4ab7d]">
                    {isPlayerOwner ? 'Toque para expor' : 'Somente leitura'}
                  </span>
                </div>

                {selectedBagItem && selectedBagDef && isPlayerOwner && (
                  <div className="p-2 bg-[#23160d] border border-amber-500/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={spriteAtlas.getItemIconUrl(
                            selectedBagItem.itemId
                          )}
                          alt={selectedBagDef.name}
                          className="w-6 h-6 pixelated shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-amber-200 truncate">
                            {selectedBagDef.name} (x{selectedBagItem.count})
                          </div>
                          <div className="text-[9px] text-[#c4ab7d]">
                            Base: {getItemBasePrice(selectedBagItem.itemId)} Ouro
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedBagSlot(null)}
                        className="text-[10px] text-[#a38b65] hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="p-1 bg-[#140c07] border border-[#4a301e] flex items-center justify-between">
                        <span className="text-[#c4ab7d]">Qtd:</span>
                        <input
                          type="number"
                          min={1}
                          max={selectedBagItem.count}
                          value={transferQty}
                          onChange={(e) =>
                            setTransferQty(
                              Math.max(
                                1,
                                Math.min(
                                  selectedBagItem.count,
                                  parseInt(e.target.value || '1', 10)
                                )
                              )
                            )
                          }
                          className="w-12 h-5 bg-[#22150c] border border-[#5c3d28] text-center font-mono-tabular text-white font-bold"
                        />
                      </div>

                      <div className="p-1 bg-[#140c07] border border-[#4a301e] flex items-center justify-between">
                        <span className="text-[#c4ab7d]">Preço:</span>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={customPriceInput}
                          onChange={(e) =>
                            setCustomPriceInput(
                              Math.max(1, parseInt(e.target.value || '1', 10))
                            )
                          }
                          className="w-12 h-5 bg-[#22150c] border border-[#5c3d28] text-center font-mono-tabular text-amber-300 font-bold"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePutSelectedOnStall()}
                      className="w-full min-h-[30px] medieval-btn-gold font-pixel text-[10px] font-bold"
                    >
                      Expor
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-8 sm:grid-cols-8 lg:grid-cols-6 gap-1 max-h-[250px] overflow-y-auto p-0.5">
                  {player.inventory.map((slot, pIdx) => {
                    const def = slot ? ITEMS[slot.itemId] : null;
                    const baseVal = slot ? getItemBasePrice(slot.itemId) : 0;
                    const isSelected = selectedBagSlot === pIdx;

                    return (
                      <button
                        key={pIdx}
                        type="button"
                        disabled={!slot || slot.itemId === 'gold_coin'}
                        onClick={() => handleSelectBagSlot(pIdx)}
                        onDoubleClick={() => {
                          if (!slot || !isPlayerOwner) return;
                          engine.transferPlayerToStall(stall.id, pIdx);
                        }}
                        className={`aspect-square relative flex items-center justify-center ${
                          isSelected ? 'mc-slot-active' : 'mc-slot'
                        } ${!slot ? 'opacity-40 cursor-default' : ''}`}
                      >
                        {slot && def && (
                          <>
                            <img
                              src={spriteAtlas.getItemIconUrl(slot.itemId)}
                              alt={def.name}
                              className="w-6 h-6 pixelated"
                            />
                            <span className="absolute bottom-0 right-0.5 text-[9px] font-mono-tabular font-extrabold text-white">
                              {slot.count}
                            </span>
                            {slot.itemId !== 'gold_coin' && (
                              <span className="absolute top-0 left-0.5 text-[8px] font-mono-tabular font-bold text-amber-300">
                                ${baseVal}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : activeTab === 'catalog' ? (
            /* TAB 2: PRICE CATALOG */
            <div className="medieval-inset p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-[#3d281a] pb-1.5">
                <span className="font-pixel text-[10px] font-bold text-amber-400">
                  TABELA DE PREÇOS ({allCatalogItems.length})
                </span>
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Buscar item..."
                  className="px-2 py-1 bg-[#120b07] border border-[#5c3d28] text-xs text-white w-44"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-[340px] overflow-y-auto pr-0.5">
                {allCatalogItems.map((it) => {
                  const base = getItemBasePrice(it.id);
                  const cheap = Math.max(1, Math.round(base * 0.75));
                  const expensive = Math.max(base + 1, Math.round(base * 1.3));
                  return (
                    <div
                      key={it.id}
                      className="p-2 bg-[#1a110a] border border-[#4a301e] flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 mc-slot flex items-center justify-center shrink-0">
                          <img
                            src={spriteAtlas.getItemIconUrl(it.id)}
                            alt={it.name}
                            className="w-5 h-5 pixelated"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-white truncate">
                            {it.name}
                          </div>
                          <div className="text-[9px] text-[#c4ab7d] font-mono-tabular">
                            Barato {cheap} ·Caro {expensive}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono-tabular text-xs font-extrabold text-amber-300 shrink-0">
                        {base}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 3: SETTINGS & OWNERSHIP */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="medieval-inset p-3 space-y-2.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400 flex items-center gap-1.5 border-b border-[#3d281a] pb-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>CONFIGURAÇÃO</span>
                </h3>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={28}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Nome da Tenda..."
                    className="flex-1 px-2.5 py-1.5 bg-[#120b07] border border-[#5c3d28] text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      engine.renameMarketStall(stall.id, nameDraft);
                      setFeedback('Salvo!');
                    }}
                    className="px-3 min-h-[32px] medieval-btn-gold font-pixel text-[10px] font-bold"
                  >
                    Salvar
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => engine.rotateMarketStall(stall.id)}
                    className="flex-1 min-h-[34px] medieval-btn-wood font-pixel text-[10px] font-bold flex items-center justify-center gap-1.5"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-300" />
                    <span>Girar</span>
                  </button>

                  {isPlayerOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        const ok = engine.pickupMarketStallStructure(stall.id);
                        if (ok) onClose();
                      }}
                      className="flex-1 min-h-[34px] medieval-btn-crimson font-pixel text-[10px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Recolher</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="medieval-inset p-3 space-y-2.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400 flex items-center gap-1.5 border-b border-[#3d281a] pb-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>POSSE DA TENDA</span>
                </h3>

                <button
                  type="button"
                  onClick={() => {
                    const res = engine.setMarketStallOwner(stall.id, 'PLAYER');
                    setFeedback(res.message);
                  }}
                  className={`w-full p-2 border text-left flex items-center justify-between ${
                    isPlayerOwner
                      ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                      : 'bg-[#140c07] border-[#4a301e] text-[#e5d5b5]'
                  }`}
                >
                  <span className="text-xs font-bold">Você (Mercador)</span>
                  <span className="text-[10px] font-pixel font-bold text-amber-300">
                    {isPlayerOwner ? 'DONO' : 'Assumir'}
                  </span>
                </button>

                {isPlayerOwner && nearbyVillagers.length > 0 && (
                  <div className="space-y-1 max-h-[140px] overflow-y-auto">
                    {nearbyVillagers.slice(0, 6).map((npc) => (
                      <button
                        key={npc.id}
                        type="button"
                        onClick={() => {
                          const res = engine.setMarketStallOwner(
                            stall.id,
                            'VILLAGER',
                            npc.id
                          );
                          setFeedback(res.message);
                        }}
                        className="w-full p-1.5 border border-[#4a301e] bg-[#140c07] flex items-center justify-between text-xs text-white"
                      >
                        <span className="truncate">{npc.name}</span>
                        <span className="text-[9px] text-sky-300 font-bold">
                          Ceder
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Tenda de Vendas"
          subtitle="Como vender mercadorias e resgatar suas moedas"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Expor Mercadorias',
              body: 'Toque em qualquer item da sua Mochila à direita, escolha a quantidade e o preço em Moedas de Ouro, e clique em Expor para colocá-lo na vitrine.',
            },
            {
              title: '2. Caixinha de Moedas (Resgatar)',
              body: 'Sempre que um aldeão ou viajante compra um item da sua tenda, o ouro da venda fica guardado na Caixinha da Tenda no topo da janela. Toque em Resgatar para transferir as moedas para a sua carteira.',
            },
            {
              title: '3. Preços e Clientes',
              body: 'Preços menores que o valor Base atraem compras rápidas. Preços muito altos diminuem a chance de venda. Cada aldeão faz até 1 compra por dia antes de dormir em sua casa.',
            },
            {
              title: '4. Botões Rápidos',
              body: 'Use Barato, Base ou Caro para reajustar todos os preços de uma só vez, ou toque no ícone de olho para pausar a venda de um slot.',
            },
          ]}
        />
      )}
    </div>
  );
};
