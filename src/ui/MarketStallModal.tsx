import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  Coins,
  Crown,
  Edit3,
  Eye,
  EyeOff,
  Hammer,
  Home,
  Minus,
  Package,
  Plus,
  RotateCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
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
import {
  CreatureKind,
  HOTBAR_SIZE,
  ItemCategory,
  MARKET_STALL_SIZE,
  PlaceableType,
  PlayerState,
  RarityTier,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import { TILE_SIZE } from '../game/world/WorldManager';

interface MarketStallModalProps {
  engine: GameEngine;
  stallId: string;
  player: PlayerState;
  onSelectStallId: (id: string) => void;
  onOpenNpcTrade: (npcId: string) => void;
  onOpenWorkbench: () => void;
  onClose: () => void;
}

type StallTab = 'counter' | 'price_table' | 'settings';

const CATEGORY_LABELS: Record<string, string> = {
  ALL: 'Todos',
  [ItemCategory.RESOURCE]: 'Recursos',
  [ItemCategory.CONSUMABLE]: 'Consumíveis',
  [ItemCategory.TOOL]: 'Ferramentas',
  [ItemCategory.WEAPON]: 'Armas',
  [ItemCategory.ARMOR]: 'Armaduras',
  [ItemCategory.PLACEABLE]: 'Construções',
};

export const MarketStallModal: React.FC<MarketStallModalProps> = ({
  engine,
  stallId,
  player,
  onSelectStallId,
  onOpenNpcTrade,
  onOpenWorkbench,
  onClose,
}) => {
  const stall = engine.getMarketStallById(stallId);
  const nearbyStalls = engine.getNearbyMarketStalls();

  const [activeTab, setActiveTab] = useState<StallTab>('counter');
  const [selectedStallSlot, setSelectedStallSlot] = useState<number>(0);
  const [selectedPlayerSlot, setSelectedPlayerSlot] = useState<number | null>(
    null
  );
  const [transferMode, setTransferMode] = useState<'ALL' | 'HALF' | 'ONE'>(
    'ALL'
  );
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(stall?.customName || '');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Price Table filters
  const [priceSearch, setPriceSearch] = useState<string>('');
  const [priceCategory, setPriceCategory] = useState<string>('ALL');

  const itemIcons = useMemo(() => {
    const map: Record<string, string> = {};
    for (const id of Object.keys(ITEMS)) {
      map[id] = spriteAtlas.getItemIconUrl(id);
    }
    return map;
  }, []);

  const allItemsSorted = useMemo(() => {
    return Object.values(ITEMS).sort((a, b) => {
      const pa = getItemBasePrice(a.id);
      const pb = getItemBasePrice(b.id);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, []);

  const filteredPriceTable = useMemo(() => {
    const q = priceSearch.trim().toLowerCase();
    return allItemsSorted.filter((item) => {
      if (priceCategory !== 'ALL' && item.category !== priceCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [allItemsSorted, priceSearch, priceCategory]);

  if (!stall) {
    return null;
  }

  const slots = engine.ensureMarketStallInitialized(stall);
  const isPlayerOwner = stall.ownerType === 'PLAYER';
  const isOpen = stall.stallOpen !== false;
  const offer = stall.pendingCustomerOffer || null;

  const stallWorldX = stall.tileX * TILE_SIZE + TILE_SIZE / 2;
  const stallWorldY = stall.tileY * TILE_SIZE + TILE_SIZE / 2;

  // Nearby Villagers & Wanderers within ~340px for customer status & owner assignment
  const nearbyNpcs = engine.entities.creatures
    .filter(
      (c) =>
        (c.kind === CreatureKind.VILLAGER ||
          c.kind === CreatureKind.WANDERER) &&
        c.hp > 0 &&
        Math.hypot(c.x - stallWorldX, c.y - stallWorldY) <= 360
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - stallWorldX, a.y - stallWorldY) -
        Math.hypot(b.x - stallWorldX, b.y - stallWorldY)
    );

  const ownerVillager =
    stall.ownerType === 'VILLAGER' && stall.ownerId
      ? engine.entities.creatures.find(
          (c) => c.id === stall.ownerId && c.hp > 0
        ) || null
      : null;

  const playerGold = engine.getItemCount('gold_coin');
  const activeSlotCount = slots.filter(
    (s) => s !== null && s.count > 0 && s.enabled
  ).length;

  const showFeedback = (ok: boolean, text: string) => {
    setFeedbackBanner({ ok, text });
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.text === text ? null : prev));
    }, 4200);
  };

  const resolveTransferCount = (maxAvailable: number): number => {
    if (transferMode === 'ONE') return 1;
    if (transferMode === 'HALF') return Math.max(1, Math.ceil(maxAvailable / 2));
    return maxAvailable;
  };

  const handleSaveName = () => {
    engine.renameMarketStall(stall.id, nameDraft);
    setIsRenaming(false);
  };

  const handlePlayerSlotClick = (playerIdx: number) => {
    if (!isPlayerOwner) {
      setSelectedPlayerSlot(playerIdx);
      return;
    }
    const pSlot = player.inventory[playerIdx];
    if (!pSlot) {
      setSelectedPlayerSlot(null);
      return;
    }
    if (pSlot.itemId === 'gold_coin') {
      showFeedback(
        false,
        'Moedas de Ouro Antigas são a moeda recebida nas vendas!'
      );
      return;
    }
    const amount = resolveTransferCount(pSlot.count);
    const basePrice = getItemBasePrice(pSlot.itemId);
    const ok = engine.transferPlayerToStall(
      stall.id,
      playerIdx,
      amount,
      basePrice,
      slots[selectedStallSlot] === null ? selectedStallSlot : undefined
    );
    if (ok) {
      const def = ITEMS[pSlot.itemId];
      showFeedback(
        true,
        `Colocado à venda: ${amount}x ${def?.name || pSlot.itemId} (${basePrice} Ouro/un.)`
      );
    }
  };

  const currentStallSlot = slots[selectedStallSlot] || null;
  const currentStallItem = currentStallSlot
    ? ITEMS[currentStallSlot.itemId]
    : null;
  const currentDealEval = currentStallSlot
    ? evaluateStallPriceDeal(
        currentStallSlot.itemId,
        currentStallSlot.unitPrice
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3 select-none">
      <div className="w-full max-w-5xl max-h-[95dvh] medieval-panel flex flex-col overflow-hidden shadow-2xl border-2 border-[#6b4423]">
        {/* Top Header */}
        <div className="px-3 py-2 bg-[#1c110a] border-b-2 border-[#4a301e] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0">
              <img
                src={itemIcons['market_stall']}
                alt="Tenda"
                className="w-6 h-6 pixelated"
              />
            </div>
            <div className="min-w-0">
              {isRenaming ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={nameDraft}
                    maxLength={28}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Nome da Tenda..."
                    className="bg-[#120b07] border border-amber-500/60 px-2 py-0.5 text-xs text-amber-200 font-pixel w-40 sm:w-52 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    className="px-2 py-1 medieval-btn-gold text-[10px] font-bold flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Salvar</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400 truncate">
                    {stall.customName ||
                      stall.landmarkName ||
                      (isPlayerOwner
                        ? 'Sua Tenda de Vendas'
                        : 'Tenda de Trocas da Vila')}
                  </h2>
                  {isPlayerOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(
                          stall.customName || 'Tenda do Explorador'
                        );
                        setIsRenaming(true);
                      }}
                      title="Renomear Tenda"
                      className="p-1 text-[#c4ab7d] hover:text-amber-300"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#c4ab7d]">
                <span className="inline-flex items-center gap-1 font-semibold text-amber-200">
                  {isPlayerOwner ? (
                    <>
                      <Crown className="w-3 h-3 text-amber-400" />
                      <span>Dono: Você (Mercador)</span>
                    </>
                  ) : (
                    <>
                      <Store className="w-3 h-3 text-sky-400" />
                      <span>
                        Dono: {stall.ownerName || 'Mercador da Vila'}
                      </span>
                    </>
                  )}
                </span>
                <span>•</span>
                <span
                  className={
                    isOpen
                      ? 'text-emerald-400 font-semibold'
                      : 'text-rose-400 font-semibold'
                  }
                >
                  {isOpen ? '🟢 Tenda Aberta' : '🔴 Tenda Fechada'}
                </span>
                {isPlayerOwner && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300">
                      Vendas: <strong>{stall.stallSalesCount || 0}</strong> (
                      {stall.stallTotalGoldEarned || 0} Ouro)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Header Controls: Gold Balance, Nearby Stall Switcher, Workbench & Close */}
          <div className="flex items-center gap-1.5">
            <div className="medieval-inset px-2.5 py-1 flex items-center gap-1.5 border border-amber-500/30">
              <img
                src={itemIcons['gold_coin']}
                alt="Ouro"
                className="w-4 h-4 pixelated"
              />
              <span className="font-mono text-xs font-bold text-amber-300">
                {playerGold}
              </span>
              <span className="text-[10px] text-[#c4ab7d] hidden sm:inline">
                Ouro
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenWorkbench}
              className="px-2.5 min-h-[34px] medieval-btn-wood text-[10px] font-bold flex items-center gap-1 text-amber-200"
              title="Abrir Receitas da Bancada de Artesão"
            >
              <Hammer className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Bancada</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Nearby Stalls Switcher Bar (if multiple stalls are nearby) */}
        {nearbyStalls.length > 1 && (
          <div className="px-3 py-1 bg-[#160d08] border-b border-[#3a2416] flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-[#c4ab7d] shrink-0">
              Tendas Próximas:
            </span>
            {nearbyStalls.map((st, idx) => {
              const active = st.id === stall.id;
              const hasOffer = Boolean(st.pendingCustomerOffer);
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onSelectStallId(st.id)}
                  className={`px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 shrink-0 border ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-[#22150d] border-[#4a301e] text-[#c4ab7d]'
                  }`}
                >
                  <span>
                    {st.customName ||
                      (st.ownerType === 'PLAYER'
                        ? `Sua Tenda #${idx + 1}`
                        : `Tenda da Vila`)}
                  </span>
                  {hasOffer && (
                    <span className="px-1 bg-rose-600 text-yellow-200 font-pixel text-[9px]">
                      !
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Customer Purchase Offer Alert Banner (`!`) */}
        {offer && (
          <div className="mx-3 mt-2.5 p-2.5 sm:p-3 bg-gradient-to-r from-amber-950/95 via-red-950/90 to-amber-950/95 border-2 border-amber-400 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-rose-600 border-2 border-yellow-300 flex items-center justify-center shrink-0 animate-bounce">
                <span className="font-pixel text-lg font-bold text-yellow-200">
                  !
                </span>
              </div>
              <img
                src={itemIcons[offer.itemId]}
                alt={offer.itemId}
                className="w-9 h-9 pixelated bg-[#140c08] p-1 border border-amber-400/50 shrink-0"
              />
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-pixel text-xs font-bold text-yellow-300">
                    PROPOSTA DE COMPRA NA TENDA!
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-black/50 text-amber-200 border border-amber-500/30">
                    Expira em {Math.max(1, Math.ceil(offer.expiresTimer))}s
                  </span>
                </div>
                <p className="text-xs text-[#f5e7c6] mt-0.5">
                  <strong className="text-amber-300">{offer.buyerName}</strong>{' '}
                  ({offer.buyerProfession || 'Aldeão'}) quer comprar{' '}
                  <strong className="text-emerald-300">
                    {offer.quantity}x{' '}
                    {ITEMS[offer.itemId]?.name || offer.itemId}
                  </strong>{' '}
                  por{' '}
                  <strong className="text-yellow-300">
                    {offer.totalPrice} Moeda(s) de Ouro
                  </strong>{' '}
                  <span className="text-[11px] text-[#c4ab7d]">
                    ({offer.unitPrice} Ouro/un. · Tabela:{' '}
                    {offer.baseUnitPrice} Ouro/un.)
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  const res = engine.acceptStallCustomerOffer(stall.id);
                  showFeedback(res.ok, res.message);
                }}
                className="flex-1 sm:flex-initial px-3.5 min-h-[38px] medieval-btn-gold font-pixel text-[11px] font-bold flex items-center justify-center gap-1.5"
              >
                <Coins className="w-4 h-4" />
                <span>VENDER (+{offer.totalPrice} OURO)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = engine.declineStallCustomerOffer(stall.id);
                  showFeedback(false, res.message);
                }}
                className="px-3 min-h-[38px] medieval-btn-crimson text-[11px] font-bold flex items-center justify-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Recusar</span>
              </button>
            </div>
          </div>
        )}

        {/* Feedback Toast Banner */}
        {feedbackBanner && (
          <div
            className={`mx-3 mt-2 px-3 py-1.5 text-xs font-semibold border flex items-center justify-between ${
              feedbackBanner.ok
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500/60 text-rose-200'
            }`}
          >
            <span>{feedbackBanner.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs opacity-75 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-3 pt-2 bg-[#180f09] border-b-2 border-[#4a301e] flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('counter')}
            className={`px-3 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              activeTab === 'counter'
                ? 'bg-[#2b1b10] border-amber-500 text-amber-300'
                : 'bg-[#140c07] border-[#3b2415] text-[#a38960] hover:text-[#e5d5b5]'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>
              {isPlayerOwner
                ? `Balcão de Vendas (${activeSlotCount}/${MARKET_STALL_SIZE})`
                : 'Balcão do Mercador'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('price_table')}
            className={`px-3 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              activeTab === 'price_table'
                ? 'bg-[#2b1b10] border-amber-500 text-amber-300'
                : 'bg-[#140c07] border-[#3b2415] text-[#a38960] hover:text-[#e5d5b5]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tabela de Preços ({allItemsSorted.length} Itens)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 font-pixel text-[10px] sm:text-xs font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              activeTab === 'settings'
                ? 'bg-[#2b1b10] border-amber-500 text-amber-300'
                : 'bg-[#140c07] border-[#3b2415] text-[#a38960] hover:text-[#e5d5b5]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configurações & Clientes ({nearbyNpcs.length})</span>
          </button>
        </div>

        {/* Main Tab Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* TAB 1: COUNTER & SALES MANAGEMENT */}
          {activeTab === 'counter' && (
            <>
              {!isPlayerOwner ? (
                /* VILLAGER-OWNED STALL VIEW */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="medieval-inset p-3.5 space-y-3 border border-[#4a301e]">
                    <div className="flex items-center justify-between border-b border-[#3a2416] pb-2">
                      <div className="flex items-center gap-2">
                        <Store className="w-5 h-5 text-amber-400" />
                        <div>
                          <h3 className="font-pixel text-xs font-bold text-amber-300">
                            TENDA DE ALDEÃO (MERCADO DA VILA)
                          </h3>
                          <p className="text-[11px] text-[#c4ab7d]">
                            Proprietário:{' '}
                            <strong className="text-white">
                              {stall.ownerName || 'Mercador da Vila'}
                            </strong>
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 border border-amber-400/50 text-amber-300 font-bold">
                        Dono: Aldeão
                      </span>
                    </div>

                    <p className="text-xs text-[#e5d5b5] leading-relaxed">
                      Esta tenda pertence a um habitante do vilarejo. Para
                      negociar com as ofertas exclusivas dele, fale diretamente
                      com o dono ou construa sua própria{' '}
                      <strong className="text-amber-300">
                        Tenda de Mercador
                      </strong>{' '}
                      para você se tornar o mercador e vender seus itens para os
                      aldeões e andarilhos!
                    </p>

                    {ownerVillager ? (
                      <div className="p-2.5 bg-[#160d08] border border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-200">
                            {ownerVillager.name} (
                            {ownerVillager.npcProfessionLabel || 'Mercador'})
                          </span>
                          <span className="text-[11px] text-emerald-300">
                            Afinidade: ♥{Math.round(ownerVillager.affinity ?? 55)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#c4ab7d]">
                          Status:{' '}
                          {ownerVillager.isInsideHouse
                            ? '🏠 Dormindo em Casa (Bata na porta para chamá-lo)'
                            : '🟢 Presente na Vila'}
                        </div>
                        {!ownerVillager.isInsideHouse && (
                          <button
                            type="button"
                            onClick={() => onOpenNpcTrade(ownerVillager.id)}
                            className="w-full min-h-[38px] medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <Coins className="w-4 h-4" />
                            <span>
                              NEGOCIAR COM {ownerVillager.name.toUpperCase()}
                            </span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-[#160d08] border border-[#3a2416] text-xs text-[#c4ab7d]">
                        O mercador responsável não está próximo no momento. Você
                        pode assumir a administração desta tenda na aba de
                        Configurações se desejar.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={onOpenWorkbench}
                        className="flex-1 min-h-[38px] medieval-btn-wood text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Hammer className="w-4 h-4 text-amber-400" />
                        <span>Usar Bancada de Artesão</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('price_table')}
                        className="flex-1 min-h-[38px] medieval-btn-wood text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <BookOpen className="w-4 h-4 text-sky-400" />
                        <span>Ver Tabela de Preços</span>
                      </button>
                    </div>
                  </div>

                  {/* How Player Stalls Work Info Box */}
                  <div className="medieval-inset p-3.5 space-y-2.5 border border-[#4a301e]">
                    <h3 className="font-pixel text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>COMO FUNCIONA SUA TENDA DE VENDAS</span>
                    </h3>
                    <ul className="text-xs text-[#e5d5b5] space-y-2 list-disc list-inside leading-relaxed">
                      <li>
                        Ao posicionar uma{' '}
                        <strong className="text-amber-300">
                          Tenda de Mercador
                        </strong>
                        , você se torna o dono e pode expor até{' '}
                        <strong>8 lotes de itens</strong> com preços livremente
                        editáveis.
                      </li>
                      <li>
                        Aldeões e Andarilhos que passam perto têm chance de
                        serem atraídos para avaliar suas ofertas.
                      </li>
                      <li>
                        <strong className="text-emerald-300">
                          Itens baratos e com desconto
                        </strong>{' '}
                        em relação à Tabela de Preços vendem com muito mais
                        facilidade; itens caros ou superfaturados são raros de
                        vender.
                      </li>
                      <li>
                        Cada NPC realiza apenas{' '}
                        <strong className="text-amber-300">
                          1 compra por dia
                        </strong>{' '}
                        (independente da quantidade levada) e só volta a comprar
                        após <strong>dormir em sua casa</strong> à noite!
                      </li>
                      <li>
                        Quando um NPC decide comprar, um{' '}
                        <strong className="text-yellow-300">
                          ponto de exclamação (!)
                        </strong>{' '}
                        surge acima da tenda para você aprovar ou recusar a
                        venda.
                      </li>
                    </ul>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const res = engine.setMarketStallOwner(
                            stall.id,
                            'PLAYER'
                          );
                          showFeedback(res.ok, res.message);
                        }}
                        className="w-full min-h-[38px] medieval-btn-gold font-pixel text-[11px] font-bold flex items-center justify-center gap-1.5"
                      >
                        <Crown className="w-4 h-4" />
                        <span>ASSUMIR ESTA TENDA COMO MERCADOR</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* PLAYER-OWNED STALL: FULL MERCHANDISE & PRICING EDITOR */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  {/* Left Column (7 cols): 8 Stall Display Slots + Selected Slot Price Configurator */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="medieval-inset p-3 space-y-2.5 border border-[#4a301e]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Store className="w-4 h-4 text-amber-400" />
                          <span className="font-pixel text-xs font-bold text-amber-300">
                            BALCÃO DE EXPOSIÇÃO (8 SLOTS)
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              engine.setAllStallPricesToPreset(stall.id, 0.75);
                              showFeedback(
                                true,
                                'Todos os itens ajustados para Preço de Pechincha (-25%)!'
                              );
                            }}
                            className="px-2 py-0.5 text-[10px] bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 font-bold hover:bg-emerald-900"
                          >
                            Pechincha (-25%)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              engine.setAllStallPricesToPreset(stall.id, 1.0);
                              showFeedback(
                                true,
                                'Todos os itens ajustados para o Preço Oficial de Tabela!'
                              );
                            }}
                            className="px-2 py-0.5 text-[10px] bg-sky-950/90 border border-sky-500/50 text-sky-300 font-bold hover:bg-sky-900"
                          >
                            Preço Tabela
                          </button>
                        </div>
                      </div>

                      {/* 8 Stall Slots Grid */}
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                        {slots.map((sl, idx) => {
                          const isSelected = selectedStallSlot === idx;
                          const hasOfferHere =
                            offer && offer.slotIndex === idx;
                          const evalInfo = sl
                            ? evaluateStallPriceDeal(sl.itemId, sl.unitPrice)
                            : null;

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedStallSlot(idx)}
                              className={`relative aspect-square p-1 flex flex-col items-center justify-center transition-transform ${
                                isSelected
                                  ? 'mc-slot-active ring-2 ring-amber-400 scale-[1.03]'
                                  : 'mc-slot hover:border-amber-500/50'
                              } ${sl && !sl.enabled ? 'opacity-50' : ''}`}
                            >
                              <span className="absolute top-0.5 left-1 text-[8px] font-mono text-[#8c7355]">
                                #{idx + 1}
                              </span>

                              {hasOfferHere && (
                                <span className="absolute -top-1 -right-1 z-10 w-4 h-4 bg-rose-600 border border-yellow-300 font-pixel text-[9px] text-yellow-200 flex items-center justify-center animate-bounce">
                                  !
                                </span>
                              )}

                              {sl ? (
                                <>
                                  <img
                                    src={itemIcons[sl.itemId]}
                                    alt={sl.itemId}
                                    className="w-7 h-7 pixelated"
                                  />
                                  <span className="absolute bottom-3.5 right-1 font-mono text-[10px] font-bold text-white drop-shadow">
                                    {sl.count}
                                  </span>
                                  <div
                                    className="w-full mt-0.5 px-0.5 bg-black/75 text-[9px] font-mono font-bold flex items-center justify-center gap-0.5 truncate"
                                    style={{
                                      color:
                                        evalInfo?.dealBadgeColor || '#fde047',
                                    }}
                                  >
                                    <span>{sl.unitPrice}</span>
                                    <span className="text-[8px] text-amber-300">
                                      ●
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <span className="text-[9px] text-[#6e563a]">
                                  Vazio
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Stall Slot Editor Panel */}
                      {currentStallSlot && currentStallItem && currentDealEval ? (
                        <div className="p-3 bg-[#140c08] border border-[#4a301e] space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#342014] pb-2">
                            <div className="flex items-center gap-2">
                              <img
                                src={itemIcons[currentStallSlot.itemId]}
                                alt={currentStallItem.name}
                                className="w-8 h-8 pixelated bg-[#22150d] p-1 border border-[#4a301e]"
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h4 className="font-pixel text-xs font-bold text-amber-300">
                                    {currentStallItem.name}
                                  </h4>
                                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-200 font-mono font-bold">
                                    Estoque: {currentStallSlot.count}x
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#c4ab7d]">
                                  Preço Oficial de Tabela:{' '}
                                  <strong className="text-amber-300">
                                    {currentDealEval.basePrice} Ouro/un.
                                  </strong>{' '}
                                  · Valor Total do Lote:{' '}
                                  <strong className="text-yellow-300">
                                    {currentStallSlot.count *
                                      currentStallSlot.unitPrice}{' '}
                                    Ouro
                                  </strong>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  engine.toggleStallSlotEnabled(
                                    stall.id,
                                    selectedStallSlot
                                  )
                                }
                                className={`px-2.5 min-h-[30px] text-[10px] font-bold flex items-center gap-1 border ${
                                  currentStallSlot.enabled
                                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                                    : 'bg-slate-900 border-slate-600 text-slate-400'
                                }`}
                              >
                                {currentStallSlot.enabled ? (
                                  <>
                                    <Eye className="w-3 h-3" />
                                    <span>À Venda</span>
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3 h-3" />
                                    <span>Pausado</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const amount = resolveTransferCount(
                                    currentStallSlot.count
                                  );
                                  engine.transferStallToPlayer(
                                    stall.id,
                                    selectedStallSlot,
                                    amount
                                  );
                                }}
                                className="px-2.5 min-h-[30px] medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                              >
                                <Package className="w-3 h-3" />
                                <span>Retirar ({transferMode})</span>
                              </button>
                            </div>
                          </div>

                          {/* Price Editor Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="text-[10px] font-bold text-[#e5d5b5]">
                                Preço Unitário Cobrado (Valor Sugerido:{' '}
                                <span className="text-amber-300 font-mono">
                                  {currentDealEval.basePrice}g
                                </span>
                                ):
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const step = Math.max(
                                      5,
                                      Math.round(currentDealEval.basePrice * 0.1)
                                    );
                                    engine.updateStallSlotPrice(
                                      stall.id,
                                      selectedStallSlot,
                                      currentStallSlot.unitPrice - step
                                    );
                                  }}
                                  className="px-2 min-h-[30px] medieval-btn-wood text-[10px] font-mono font-bold"
                                >
                                  -
                                  {Math.max(
                                    5,
                                    Math.round(currentDealEval.basePrice * 0.1)
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    engine.updateStallSlotPrice(
                                      stall.id,
                                      selectedStallSlot,
                                      currentStallSlot.unitPrice - 1
                                    )
                                  }
                                  className="min-h-[30px] min-w-[30px] medieval-btn-wood flex items-center justify-center"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>

                                <input
                                  type="number"
                                  min={1}
                                  value={currentStallSlot.unitPrice}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val)) {
                                      engine.updateStallSlotPrice(
                                        stall.id,
                                        selectedStallSlot,
                                        val
                                      );
                                    }
                                  }}
                                  className="w-20 min-h-[30px] bg-[#0d0805] border border-amber-500/60 text-center font-mono text-xs font-bold text-amber-300 focus:outline-none"
                                />

                                <button
                                  type="button"
                                  onClick={() =>
                                    engine.updateStallSlotPrice(
                                      stall.id,
                                      selectedStallSlot,
                                      currentStallSlot.unitPrice + 1
                                    )
                                  }
                                  className="min-h-[30px] min-w-[30px] medieval-btn-wood flex items-center justify-center"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const step = Math.max(
                                      5,
                                      Math.round(currentDealEval.basePrice * 0.1)
                                    );
                                    engine.updateStallSlotPrice(
                                      stall.id,
                                      selectedStallSlot,
                                      currentStallSlot.unitPrice + step
                                    );
                                  }}
                                  className="px-2 min-h-[30px] medieval-btn-wood text-[10px] font-mono font-bold"
                                >
                                  +
                                  {Math.max(
                                    5,
                                    Math.round(currentDealEval.basePrice * 0.1)
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Quick Preset Buttons for this slot */}
                            <div className="flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  engine.updateStallSlotPrice(
                                    stall.id,
                                    selectedStallSlot,
                                    Math.max(
                                      1,
                                      Math.floor(currentDealEval.basePrice * 0.7)
                                    )
                                  )
                                }
                                className="px-2 py-1 text-[10px] bg-emerald-950 border border-emerald-500/50 text-emerald-300 font-bold"
                              >
                                Barato (
                                {Math.max(
                                  1,
                                  Math.floor(currentDealEval.basePrice * 0.7)
                                )}
                                )
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  engine.updateStallSlotPrice(
                                    stall.id,
                                    selectedStallSlot,
                                    currentDealEval.basePrice
                                  )
                                }
                                className="px-2 py-1 text-[10px] bg-sky-950 border border-sky-500/50 text-sky-300 font-bold"
                              >
                                Sugerido ({currentDealEval.basePrice})
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  engine.updateStallSlotPrice(
                                    stall.id,
                                    selectedStallSlot,
                                    Math.max(
                                      currentDealEval.basePrice + 1,
                                      Math.round(currentDealEval.basePrice * 1.25)
                                    )
                                  )
                                }
                                className="px-2 py-1 text-[10px] bg-amber-950 border border-amber-500/50 text-amber-300 font-bold"
                              >
                                Caro (
                                {Math.max(
                                  currentDealEval.basePrice + 1,
                                  Math.round(currentDealEval.basePrice * 1.25)
                                )}
                                )
                              </button>
                            </div>
                          </div>

                          {/* Live Deal Evaluation & Buy Probability Meter */}
                          <div className="p-2 bg-[#1c120b] border border-[#3a2416] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp
                                className="w-3.5 h-3.5 shrink-0"
                                style={{
                                  color: currentDealEval.dealBadgeColor,
                                }}
                              />
                              <span className="text-[#c4ab7d]">Avaliação:</span>
                              <strong
                                style={{
                                  color: currentDealEval.dealBadgeColor,
                                }}
                              >
                                {currentDealEval.dealLabel}
                              </strong>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[#c4ab7d]">
                                Chance de Compra ao Inspecionar:{' '}
                                <strong className="text-white font-mono">
                                  {Math.round(currentDealEval.buyChance * 100)}%
                                </strong>
                              </span>
                              <span className="text-[#c4ab7d]">
                                Qtd. por Compra:{' '}
                                <strong className="text-amber-300 font-mono">
                                  1 a {currentDealEval.maxBuyQty}x
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-[#140c08] border border-[#3a2416] text-center text-xs text-[#a38960]">
                          Slot #{selectedStallSlot + 1} está vazio. Toque em
                          qualquer item da sua <strong>Mochila</strong> ao lado
                          para colocá-lo à venda neste slot!
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column (5 cols): Player Inventory (32 slots) to stock the stall */}
                  <div className="lg:col-span-5 medieval-inset p-3 space-y-2.5 border border-[#4a301e]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-pixel text-xs font-bold text-amber-300">
                        SUA MOCHILA (TOQUE PARA EXPOR)
                      </span>
                      <div className="flex items-center gap-1">
                        {(['ONE', 'HALF', 'ALL'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTransferMode(m)}
                            className={`px-2 py-0.5 text-[10px] font-mono font-bold border ${
                              transferMode === m
                                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                                : 'bg-[#140c07] border-[#3b2415] text-[#a38960]'
                            }`}
                          >
                            {m === 'ONE'
                              ? '1x'
                              : m === 'HALF'
                              ? 'Metade'
                              : 'Tudo'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] text-[#c4ab7d]">
                      Cinto Rápido (1–8) & Mochila (9–32):
                    </div>

                    <div className="grid grid-cols-8 gap-1">
                      {player.inventory.map((slot, idx) => {
                        const basePrice = slot
                          ? getItemBasePrice(slot.itemId)
                          : 0;
                        const isHotbar = idx < HOTBAR_SIZE;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handlePlayerSlotClick(idx)}
                            title={
                              slot
                                ? `${ITEMS[slot.itemId]?.name} · Preço Base: ${basePrice} Ouro`
                                : `Slot ${idx + 1}`
                            }
                            className={`relative aspect-square p-0.5 flex flex-col items-center justify-center ${
                              selectedPlayerSlot === idx
                                ? 'mc-slot-active'
                                : isHotbar
                                ? 'mc-slot border-amber-700/60'
                                : 'mc-slot'
                            }`}
                          >
                            {slot ? (
                              <>
                                <img
                                  src={itemIcons[slot.itemId]}
                                  alt={slot.itemId}
                                  className="w-6 h-6 pixelated"
                                />
                                <span className="absolute bottom-0.5 right-1 font-mono text-[9px] font-bold text-white drop-shadow">
                                  {slot.count}
                                </span>
                                {slot.itemId !== 'gold_coin' && (
                                  <span className="absolute top-0 left-0.5 font-mono text-[8px] text-amber-300">
                                    {basePrice}g
                                  </span>
                                )}
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-2 bg-[#140c08] border border-[#3a2416] text-[10px] text-[#c4ab7d] leading-relaxed">
                      💡 <strong>Dica de Mercador:</strong> O número no topo de
                      cada ícone (<span className="text-amber-300">ex: 4g</span>
                      ) é o preço base da <strong>Tabela de Preços</strong>.
                      Itens baratos (1g a 5g) atraem compradores rapidamente!
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: OFFICIAL PRICE TABLE FOR ALL ITEMS IN THE GAME */}
          {activeTab === 'price_table' && (
            <div className="space-y-3">
              <div className="medieval-inset p-3 space-y-2.5 border border-[#4a301e]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-pixel text-xs font-bold text-amber-300">
                      TABELA DE VALORES SUGERIDOS (POR RARIDADE E DIFICULDADE)
                    </h3>
                    <p className="text-[11px] text-[#c4ab7d]">
                      Valores sugeridos calculados a partir dos recursos mais
                      básicos (1g) até relíquias lendárias, considerando
                      exclusivamente a raridade e dificuldade de obtenção ou
                      criação.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-60">
                    <Search className="w-3.5 h-3.5 text-[#a38960] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={priceSearch}
                      onChange={(e) => setPriceSearch(e.target.value)}
                      placeholder="Buscar item na tabela..."
                      className="w-full bg-[#120b07] border border-[#4a301e] pl-8 pr-2.5 py-1 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {Object.entries(CATEGORY_LABELS).map(([catKey, label]) => (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setPriceCategory(catKey)}
                      className={`px-2.5 py-1 text-[10px] font-bold shrink-0 border ${
                        priceCategory === catKey
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-[#140c07] border-[#3b2415] text-[#a38960]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Items Price Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[52dvh] overflow-y-auto pr-1">
                  {filteredPriceTable.map((item) => {
                    const base = getItemBasePrice(item.id);
                    const evalAtBase = evaluateStallPriceDeal(item.id, base);
                    const cheapPrice = Math.max(1, Math.floor(base * 0.75));
                    const demandLabel =
                      base <= 5
                        ? 'Alta Saída (Básico)'
                        : base <= 35
                        ? 'Saída Moderada (Oficina)'
                        : base <= 250
                        ? 'Venda Rara (Avançado)'
                        : 'Muito Raro (Relíquia)';
                    const demandColor =
                      base <= 5
                        ? 'text-emerald-400'
                        : base <= 35
                        ? 'text-sky-400'
                        : base <= 250
                        ? 'text-amber-400'
                        : 'text-purple-400';

                    return (
                      <div
                        key={item.id}
                        className="p-2 bg-[#140c08] border border-[#3a2416] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={itemIcons[item.id]}
                            alt={item.name}
                            className="w-7 h-7 pixelated bg-[#21140c] p-1 border border-[#4a301e] shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#f5e7c6] truncate">
                              {item.name}
                            </div>
                            <div className={`text-[10px] ${demandColor}`}>
                              {demandLabel} · Chance Base:{' '}
                              {Math.round(evalAtBase.buyChance * 100)}%
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono text-xs font-bold text-amber-300 flex items-center justify-end gap-1">
                            <span title="Valor Sugerido">{base}</span>
                            <img
                              src={itemIcons['gold_coin']}
                              alt="Ouro"
                              className="w-3.5 h-3.5 pixelated"
                            />
                          </div>
                          <div className="text-[9px] text-emerald-300 font-mono">
                            Bom negócio: ≤{cheapPrice}g
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STALL CONFIGURATION, OWNERSHIP & NEARBY CUSTOMERS */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Stall Settings & Ownership Control */}
              <div className="medieval-inset p-3.5 space-y-3 border border-[#4a301e]">
                <h3 className="font-pixel text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-amber-400" />
                  <span>CONFIGURAÇÕES & SUPORTE DE EDIÇÃO DA TENDA</span>
                </h3>

                {/* Stall Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#e5d5b5]">
                    Nome Personalizado da Tenda:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={nameDraft}
                      maxLength={28}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Ex: Empório da Fronteira"
                      className="flex-1 bg-[#120b07] border border-[#4a301e] px-2.5 py-1.5 text-xs text-amber-200 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        engine.renameMarketStall(stall.id, nameDraft);
                        showFeedback(true, 'Nome da tenda atualizado!');
                      }}
                      className="px-3 min-h-[34px] medieval-btn-gold text-xs font-bold"
                    >
                      Salvar
                    </button>
                  </div>
                </div>

                {/* Quick Toggles: Open/Closed & Orientation */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      engine.toggleMarketStallOpen(stall.id);
                      showFeedback(
                        true,
                        stall.stallOpen
                          ? 'Tenda aberta para clientes!'
                          : 'Tenda fechada temporariamente.'
                      );
                    }}
                    className={`min-h-[38px] px-2.5 text-xs font-bold flex items-center justify-center gap-1.5 border ${
                      isOpen
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                        : 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    <span>{isOpen ? 'Aberta p/ Vendas' : 'Tenda Fechada'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => engine.rotateMarketStall(stall.id)}
                    className="min-h-[38px] px-2.5 medieval-btn-wood text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <RotateCw className="w-4 h-4 text-amber-400" />
                    <span>
                      Eixo:{' '}
                      {stall.orientation === 'vertical'
                        ? 'Vertical'
                        : 'Horizontal'}
                    </span>
                  </button>
                </div>

                {/* Ownership Selector */}
                <div className="space-y-1.5 pt-2 border-t border-[#3a2416]">
                  <div className="text-[11px] font-bold text-[#e5d5b5]">
                    Dono Definido da Tenda:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const res = engine.setMarketStallOwner(
                          stall.id,
                          'PLAYER'
                        );
                        showFeedback(res.ok, res.message);
                      }}
                      className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 border ${
                        isPlayerOwner
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-[#140c07] border-[#3b2415] text-[#c4ab7d]'
                      }`}
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Você (Mercador)</span>
                    </button>

                    {nearbyNpcs
                      .filter((n) => n.kind === CreatureKind.VILLAGER)
                      .slice(0, 3)
                      .map((npc) => {
                        const isThisOwner =
                          stall.ownerType === 'VILLAGER' &&
                          stall.ownerId === npc.id;
                        return (
                          <button
                            key={npc.id}
                            type="button"
                            onClick={() => {
                              const res = engine.setMarketStallOwner(
                                stall.id,
                                'VILLAGER',
                                npc.id
                              );
                              showFeedback(res.ok, res.message);
                            }}
                            className={`px-2.5 py-1.5 text-xs font-bold flex items-center gap-1 border ${
                              isThisOwner
                                ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                                : 'bg-[#140c07] border-[#3b2415] text-[#c4ab7d]'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                            <span>Aldeão: {npc.name}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Pickup / Dismantle Player Stall */}
                {!stall.villageId && !stall.id.startsWith('world_struct_') && (
                  <div className="pt-2 border-t border-[#3a2416]">
                    <button
                      type="button"
                      onClick={() => {
                        const ok = engine.pickupMarketStallStructure(stall.id);
                        if (ok) {
                          onClose();
                        }
                      }}
                      className="w-full min-h-[38px] medieval-btn-crimson text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>
                        Recolher Tenda p/ Mochila (Devolve Mercadorias)
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Nearby Villagers & Wanderers Daily Purchase Status */}
              <div className="medieval-inset p-3.5 space-y-2.5 border border-[#4a301e]">
                <div className="flex items-center justify-between">
                  <h3 className="font-pixel text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>CLIENTES PRÓXIMOS & LIMITE DIÁRIO</span>
                  </h3>
                  <span className="text-[10px] text-[#c4ab7d]">
                    1 compra/dia (Reseta ao dormir em casa)
                  </span>
                </div>

                {nearbyNpcs.length === 0 ? (
                  <div className="p-4 bg-[#140c08] border border-[#3a2416] text-center text-xs text-[#a38960]">
                    Nenhum Aldeão ou Andarilho próximo a esta tenda no momento.
                    Construa sua tenda perto de uma vila ou estrada para atrair
                    clientes!
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[44dvh] overflow-y-auto pr-1">
                    {nearbyNpcs.map((npc) => {
                      const boughtToday = Boolean(npc.hasBoughtToday);
                      const isAttracted = npc.attractedStallId === stall.id;
                      const isOfferBuyer = offer?.buyerId === npc.id;

                      return (
                        <div
                          key={npc.id}
                          className="p-2 bg-[#140c08] border border-[#3a2416] flex items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-[#f5e7c6] flex items-center gap-1.5">
                              <span>{npc.name}</span>
                              <span className="text-[10px] text-[#c4ab7d] font-normal">
                                (
                                {npc.kind === CreatureKind.WANDERER
                                  ? 'Andarilho'
                                  : npc.npcProfessionLabel || 'Aldeão'}
                                )
                              </span>
                            </div>
                            <div className="text-[10px] text-[#c4ab7d] flex items-center gap-2 mt-0.5">
                              <span>
                                Afinidade: ♥{Math.round(npc.affinity ?? 55)}
                              </span>
                              {npc.isInsideHouse && (
                                <span className="text-amber-300 flex items-center gap-0.5">
                                  <Home className="w-3 h-3" /> Dormindo em Casa
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {isOfferBuyer ? (
                              <span className="px-2 py-0.5 bg-rose-600/30 border border-yellow-400 text-yellow-300 text-[10px] font-bold">
                                ❗ Quer Comprar!
                              </span>
                            ) : boughtToday ? (
                              <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 text-slate-400 text-[10px] font-semibold">
                                💤 Já comprou hoje (Aguardando dormir)
                              </span>
                            ) : isAttracted ? (
                              <span className="px-2 py-0.5 bg-sky-950 border border-sky-400 text-sky-300 text-[10px] font-bold">
                                👀 Olhando a Tenda
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold">
                                🟢 Pode Comprar Hoje
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
