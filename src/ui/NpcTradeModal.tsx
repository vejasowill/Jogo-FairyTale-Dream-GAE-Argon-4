import React, { useState } from 'react';
import {
  ArrowRight,
  Gift,
  Heart,
  Lock,
  ShieldAlert,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import { CreatureEntity, PlayerState } from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';

interface NpcTradeModalProps {
  engine: GameEngine;
  npcId: string;
  player: PlayerState;
  onClose: () => void;
}

const GIFT_OPTIONS: { itemId: string; affinityGain: number; note: string }[] = [
  {
    itemId: 'gold_coin',
    affinityGain: 18,
    note: 'Moeda Real valorizada por toda a vila',
  },
  {
    itemId: 'warrior_feast',
    affinityGain: 20,
    note: 'Banquete nobre que conquista qualquer habitante',
  },
  {
    itemId: 'solar_crystal',
    affinityGain: 14,
    note: 'Gema luminosa apreciada por artesãos e sábios',
  },
  {
    itemId: 'apple',
    affinityGain: 10,
    note: 'Presente cordial de boas-vindas',
  },
  {
    itemId: 'coconut',
    affinityGain: 8,
    note: 'Refresco tropical para os trabalhadores',
  },
];

export const NpcTradeModal: React.FC<NpcTradeModalProps> = ({
  engine,
  npcId,
  onClose,
}) => {
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [tab, setTab] = useState<'trades' | 'diplomacy'>('trades');

  const npc: CreatureEntity | undefined = engine.entities.creatures.find(
    (c) => c.id === npcId
  );

  if (!npc) {
    return null;
  }

  const affinity = Math.round(npc.affinity ?? 55);
  const isHostile = npc.isHostile;

  const affinityTier = isHostile
    ? {
        label: 'INIMIGO HOSTIL',
        color: 'text-rose-400 border-rose-500/50 bg-rose-950/60',
        barColor: 'bg-rose-500',
        desc: 'Você atacou, roubou ou vandalizou a vila! Os habitantes estão em combate contra você.',
      }
    : affinity >= 75
    ? {
        label: 'ALIADO DEVOTO DA VILA',
        color: 'text-amber-300 border-amber-400/60 bg-amber-950/50',
        barColor: 'bg-amber-400',
        desc: 'Trocas especiais desbloqueadas, guardas protegem você e o Cofre da Vila está liberado!',
      }
    : affinity >= 40
    ? {
        label: 'CIDADÃO AMIGÁVEL',
        color: 'text-emerald-300 border-emerald-500/50 bg-emerald-950/40',
        barColor: 'bg-emerald-500',
        desc: 'Comércio aberto. Faça trocas ou dê presentes para alcançar ♥75 (Aliado Devoto).',
      }
    : {
        label: 'DESCONFIADO',
        color: 'text-orange-300 border-orange-500/50 bg-orange-950/40',
        barColor: 'bg-orange-500',
        desc: 'A vila desconfia das suas ações. Ofereça presentes ou trocas básicas para recuperar confiança.',
      };

  const handleTrade = (tradeId: string) => {
    const res = engine.executeNpcTrade(npc.id, tradeId);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleGift = (itemId: string) => {
    const res = engine.giveNpcGift(npc.id, itemId);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handlePeaceTribute = () => {
    const res = engine.payPeaceTribute(npc.id);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleSettleWanderer = () => {
    const found =
      engine.findAvailableHouseNear(npc.x, npc.y, 420) ||
      engine.findAvailableHouseNear(engine.player.x, engine.player.y, 420);
    if (!found) {
      setFeedback({
        ok: false,
        text: 'Nenhuma casa com vaga disponível (máx. 2 aldeões por casa) foi encontrada por perto!',
      });
      return;
    }
    engine.settleWandererIntoHouse(npc, found.house);
    const residents = engine.getHouseResidents(found.house.id).length;
    setFeedback({
      ok: true,
      text: `🏠 ${npc.name} deixou de ser andarilho e tornou-se ${npc.npcProfessionLabel} (${residents}/2 moradores na casa)!`,
    });
  };

  const handleProvoke = () => {
    engine.provokeVillage(
      npc.villageId,
      npc,
      45,
      `⚔ Você desafiou ${npc.name}! A vila inteira tornou-se hostil!`
    );
    setFeedback({
      ok: false,
      text: `${npc.name} sacou as armas! Os guardas da vila agora são seus inimigos!`,
    });
  };

  const goldCoinsOwned = engine.getItemCount('gold_coin');
  const peaceTreatyOwned = engine.getItemCount('peace_treaty');
  const holdingPeaceItem = engine.isPlayerHoldingPeaceItem();
  const peaceDebtCoins = isHostile ? engine.getNpcPeaceDebtCoins(npc) : 0;
  const canPayPeaceDebt =
    isHostile &&
    holdingPeaceItem &&
    peaceTreatyOwned >= 1 &&
    goldCoinsOwned >= peaceDebtCoins;
  const isWanderer = npc.kind === 'WANDERER';
  const homeResidentCount = npc.homeHouseId
    ? engine.getHouseResidents(npc.homeHouseId).length
    : 0;
  const nearbyOpenHouse = isWanderer
    ? engine.findAvailableHouseNear(npc.x, npc.y, 420) ||
      engine.findAvailableHouseNear(engine.player.x, engine.player.y, 420)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-3xl max-h-[94dvh] medieval-panel flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-3.5 py-2.5 border-b-2 border-[#4a301e] bg-[#1c120b] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 mc-slot-active flex items-center justify-center shrink-0">
              <img
                src={spriteAtlas.getItemIconUrl('gold_coin')}
                alt={npc.name}
                className="w-7 h-7 pixelated"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                  {npc.name}
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 border ${affinityTier.color}`}
                >
                  {affinityTier.label}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 border ${
                    isWanderer
                      ? 'text-sky-300 border-sky-500/50 bg-sky-950/50'
                      : 'text-emerald-300 border-emerald-500/50 bg-emerald-950/40'
                  }`}
                >
                  {isWanderer
                    ? '🧭 ANDARILHO NÔMADE'
                    : npc.homeHouseId
                    ? `🏠 MORADOR (${homeResidentCount}/2 NA CASA)`
                    : '🏠 ALDEÃO'}
                </span>
              </div>
              <p className="text-[11px] text-[#c4ab7d] truncate">
                {npc.npcProfessionLabel || 'Habitante do Vilarejo'} · Facção: Aldeões (Pacífico / Rival de Monstros) · Suas Moedas:{' '}
                <strong className="text-amber-300">{goldCoinsOwned}x Ouro</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] medieval-btn-crimson flex items-center justify-center shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Affinity & Dialogue Banner */}
        <div className="px-3.5 py-2.5 bg-[#160e08] border-b border-[#3b2516] space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="italic text-[#f3e5c8]">
              "{isHostile
                ? `Você causou hostilidade contra o nosso povo! Como você traz o Tratado da Paz Real em mãos, nossa cobrança para perdoar sua dívida é de ${peaceDebtCoins} Moedas de Ouro Antigas.`
                : npc.dialogueLine ||
                  'Bem-vindo ao nosso vilarejo, viajante da Fronteira.'}"
            </span>
          </div>

          {/* Wanderer Housing Settlement Banner */}
          {isWanderer && !isHostile && (
            <div className="medieval-inset p-2.5 border border-sky-500/40 bg-sky-950/25 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="text-xs text-sky-200">
                <strong>🧭 Andarilho em Busca de Lar:</strong> Caminha pelo mundo até encontrar uma casa de vila ou construída pelo jogador (até <strong>2 aldeões por casa</strong>) para fixar moradia.
              </div>
              {nearbyOpenHouse && (
                <button
                  type="button"
                  onClick={handleSettleWanderer}
                  className="px-3 min-h-[34px] medieval-btn-emerald font-pixel text-[10px] font-bold shrink-0"
                >
                  🏠 CONVIDAR PARA MORAR AQUI
                </button>
              )}
            </div>
          )}

          {/* Affinity Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-bold text-amber-200">
                <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                <span>Afinidade com {npc.name}: {affinity} / 100</span>
              </span>
              <span className="text-[#c4ab7d]">{affinityTier.desc}</span>
            </div>
            <div className="w-full h-2.5 bg-[#0d0805] border border-[#4a301e] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${affinityTier.barColor}`}
                style={{ width: `${Math.max(4, Math.min(100, affinity))}%` }}
              />
            </div>
          </div>

          {/* Hostile Village Peace Treaty & Coin Debt Forgiveness Banner */}
          {isHostile && (
            <div className="medieval-inset p-3 border-2 border-amber-500/60 bg-rose-950/40 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-pixel text-xs font-bold text-amber-300">
                      AUDIÊNCIA DE PERDÃO — COBRANÇA DA VILA HOSTIL
                    </div>
                    <p className="text-xs text-rose-100 leading-relaxed">
                      Para perdoar a hostilidade que você causou, {npc.name} exige o pagamento de{' '}
                      <strong className="text-amber-300">{peaceDebtCoins}x Moedas de Ouro Antigas</strong> e a entrega do{' '}
                      <strong className="text-amber-300">1x Tratado da Paz Real</strong> que você está segurando.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {/* Requirement 1: Coin Charge */}
                <div className="p-2 bg-[#140c07] border border-[#4a301e] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 mc-slot flex items-center justify-center shrink-0">
                      <img
                        src={spriteAtlas.getItemIconUrl('gold_coin')}
                        alt="Moeda de Ouro"
                        className="w-5 h-5 pixelated"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-200 truncate">
                        Cobrança em Moedas: {peaceDebtCoins}x Ouro
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          goldCoinsOwned >= peaceDebtCoins
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        Suas Moedas: {goldCoinsOwned} / {peaceDebtCoins}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Requirement 2: Held Peace Item (Consumed on Payment) */}
                <div className="p-2 bg-[#140c07] border border-[#4a301e] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 mc-slot-active flex items-center justify-center shrink-0">
                      <img
                        src={spriteAtlas.getItemIconUrl('peace_treaty')}
                        alt="Tratado da Paz Real"
                        className="w-5 h-5 pixelated"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-200 truncate">
                        1x Tratado da Paz Real (Consumido)
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          holdingPeaceItem
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {holdingPeaceItem
                          ? '✓ Segurando na mão (Pronto)'
                          : '✗ Segure o Tratado da Paz na mão!'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  disabled={!canPayPeaceDebt}
                  onClick={handlePeaceTribute}
                  className={`w-full sm:w-auto px-4 min-h-[38px] font-pixel text-xs font-bold flex items-center justify-center gap-2 ${
                    canPayPeaceDebt
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span>
                    🕊️ PAGAR {peaceDebtCoins} MOEDAS & CONSUMIR TRATADO DA PAZ
                  </span>
                </button>
              </div>
            </div>
          )}

          {feedback && (
            <div
              className={`px-3 py-1.5 text-xs font-bold border ${
                feedback.ok
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="px-3.5 pt-2 bg-[#1a110a] border-b border-[#3b2516] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTab('trades')}
            className={`px-3.5 py-1.5 font-pixel text-xs font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              tab === 'trades'
                ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>TROCA DE ITENS ({npc.trades?.length || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('diplomacy')}
            className={`px-3.5 py-1.5 font-pixel text-xs font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              tab === 'diplomacy'
                ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>PRESENTES & RELAÇÃO</span>
          </button>
        </div>

        {/* Main Scrollable Content */}
        <div className="p-3.5 overflow-y-auto flex-1 space-y-2.5">
          {tab === 'trades' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(npc.trades || []).map((offer) => {
                const giveDef = ITEMS[offer.giveItemId];
                const recDef = ITEMS[offer.receiveItemId];
                const ownedCount = engine.getItemCount(offer.giveItemId);
                const hasEnoughItems = ownedCount >= offer.giveCount;
                const meetsAffinity = affinity >= offer.minAffinity && !isHostile;
                const canTrade = hasEnoughItems && meetsAffinity;

                return (
                  <div
                    key={offer.id}
                    className={`medieval-inset p-3 border flex flex-col justify-between gap-2.5 ${
                      canTrade
                        ? 'border-amber-500/50 bg-[#23160d]'
                        : 'border-[#3b2516] bg-[#160e08]/80 opacity-85'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[#3b2516] pb-1.5">
                      <span className="font-pixel text-[11px] font-bold text-amber-200 truncate">
                        {offer.label || recDef?.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-600/40 shrink-0">
                        +{offer.affinityGain}♥ Afinidade
                      </span>
                    </div>

                    {/* Barter Exchange Row */}
                    <div className="flex items-center justify-between gap-2">
                      {/* Player Gives */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-9 h-9 mc-slot flex items-center justify-center shrink-0 relative">
                          <img
                            src={spriteAtlas.getItemIconUrl(offer.giveItemId)}
                            alt={giveDef?.name}
                            className="w-6 h-6 pixelated"
                          />
                          <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-white">
                            x{offer.giveCount}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#f3e5c8] truncate">
                            {giveDef?.name || offer.giveItemId}
                          </div>
                          <div
                            className={`text-[10px] font-bold ${
                              hasEnoughItems ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            Você tem: {ownedCount}/{offer.giveCount}
                          </div>
                        </div>
                      </div>

                      <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />

                      {/* Player Receives */}
                      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-amber-300 truncate">
                            {recDef?.name || offer.receiveItemId}
                          </div>
                          <div className="text-[10px] text-[#c4ab7d] truncate">
                            Recebe x{offer.receiveCount}
                          </div>
                        </div>
                        <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0 relative">
                          <img
                            src={spriteAtlas.getItemIconUrl(offer.receiveItemId)}
                            alt={recDef?.name}
                            className="w-6 h-6 pixelated"
                          />
                          <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-amber-300">
                            x{offer.receiveCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button or Affinity Lock */}
                    {offer.minAffinity > affinity ? (
                      <div className="w-full min-h-[34px] px-2.5 bg-[#120b07] border border-[#4a301e] text-[#c4ab7d] text-[11px] flex items-center justify-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          Requer ♥{offer.minAffinity} Afinidade (Atual: ♥{affinity})
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canTrade}
                        onClick={() => handleTrade(offer.id)}
                        className={`w-full min-h-[36px] font-pixel text-xs font-bold flex items-center justify-center gap-1.5 ${
                          canTrade
                            ? 'medieval-btn-gold'
                            : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span>
                          {isHostile
                            ? 'VILA HOSTIL (PAGUE TRIBUTO)'
                            : hasEnoughItems
                            ? 'REALIZAR TROCA'
                            : 'ITENS INSUFICIENTES'}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="medieval-inset p-3 space-y-2">
                <h3 className="font-pixel text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-amber-400" />
                  <span>OFERECER PRESENTE (ELEVAR AFINIDADE)</span>
                </h3>
                <p className="text-xs text-[#e5d5b5]">
                  Presentear um habitante aumenta sua Afinidade com ele e com todo o vilarejo, desbloqueando trocas de Aliado Devoto (♥75+) e acesso livre ao Cofre da Vila.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {GIFT_OPTIONS.map((g) => {
                    const def = ITEMS[g.itemId];
                    const owned = engine.getItemCount(g.itemId);
                    return (
                      <div
                        key={g.itemId}
                        className="p-2.5 bg-[#1a110a] border border-[#4a301e] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 mc-slot flex items-center justify-center shrink-0">
                            <img
                              src={spriteAtlas.getItemIconUrl(g.itemId)}
                              alt={def?.name}
                              className="w-5 h-5 pixelated"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-amber-200 truncate">
                              {def?.name} (+{g.affinityGain}♥)
                            </div>
                            <div className="text-[10px] text-[#c4ab7d] truncate">
                              Na mochila: {owned}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={owned < 1}
                          onClick={() => handleGift(g.itemId)}
                          className={`px-2.5 min-h-[32px] font-pixel text-[10px] font-bold shrink-0 ${
                            owned >= 1
                              ? 'medieval-btn-gold'
                              : 'medieval-btn-wood opacity-45 cursor-not-allowed'
                          }`}
                        >
                          Presentear
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Situational Conflict / Provocation Panel */}
              <div className="medieval-inset p-3 border border-rose-500/30 space-y-2">
                <h3 className="font-pixel text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <Swords className="w-4 h-4 text-rose-400" />
                  <span>REGRAS DE CONDUTA & HOSTILIDADE DA VILA</span>
                </h3>
                <p className="text-xs text-[#e5d5b5] leading-relaxed">
                  Os NPCs da vila recordam suas escolhas: atacar qualquer aldeão, quebrar estruturas da vila ou abrir o <strong>Cofre da Guilda</strong> sem ser um Aliado Devoto (♥75+) fará com que todos os habitantes e guardas se tornem <strong>inimigos hostis</strong>!
                </p>
                {!isHostile && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleProvoke}
                      className="px-3 min-h-[34px] medieval-btn-crimson font-pixel text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>DESAFIAR VILA PARA COMBATE</span>
                    </button>
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
