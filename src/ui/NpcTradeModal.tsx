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
import { WindowHelpButton, WindowHelpModal } from './UiTooltipAndHelp';

interface NpcTradeModalProps {
  engine: GameEngine;
  npcId: string;
  player: PlayerState;
  onClose: () => void;
}

const GIFT_OPTIONS: { itemId: string; affinityGain: number }[] = [
  { itemId: 'gold_coin', affinityGain: 18 },
  { itemId: 'warrior_feast', affinityGain: 20 },
  { itemId: 'solar_crystal', affinityGain: 14 },
  { itemId: 'apple', affinityGain: 10 },
  { itemId: 'coconut', affinityGain: 8 },
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
  const [showHelp, setShowHelp] = useState(false);

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
        label: 'HOSTIL',
        color: 'text-rose-400 border-rose-500/50 bg-rose-950/60',
        barColor: 'bg-rose-500',
      }
    : affinity >= 75
    ? {
        label: 'ALIADO',
        color: 'text-amber-300 border-amber-400/60 bg-amber-950/50',
        barColor: 'bg-amber-400',
      }
    : affinity >= 40
    ? {
        label: 'AMIGÁVEL',
        color: 'text-emerald-300 border-emerald-500/50 bg-emerald-950/40',
        barColor: 'bg-emerald-500',
      }
    : {
        label: 'DESCONFIADO',
        color: 'text-orange-300 border-orange-500/50 bg-orange-950/40',
        barColor: 'bg-orange-500',
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
        text: 'Nenhuma casa com vaga por perto!',
      });
      return;
    }
    engine.settleWandererIntoHouse(npc, found.house);
    const residents = engine.getHouseResidents(found.house.id).length;
    setFeedback({
      ok: true,
      text: `🏠 ${npc.name} fixou moradia (${residents}/2)!`,
    });
  };

  const handleProvoke = () => {
    engine.provokeVillage(
      npc.villageId,
      npc,
      45,
      `⚔ Você desafiou ${npc.name}!`
    );
    setFeedback({
      ok: false,
      text: `${npc.name} tornou-se hostil!`,
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
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[94dvh] medieval-panel flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-3 py-2 border-b-2 border-[#4a301e] bg-[#1c120b] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0">
              <img
                src={spriteAtlas.getItemIconUrl('gold_coin')}
                alt={npc.name}
                className="w-6 h-6 pixelated"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                  {npc.name}
                </h2>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 border ${affinityTier.color}`}
                >
                  {affinityTier.label}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 border border-[#4a301e] bg-[#120b07] text-[#c4ab7d]">
                  {isWanderer
                    ? 'Andarilho'
                    : npc.homeHouseId
                    ? `Casa (${homeResidentCount}/2)`
                    : 'Aldeão'}
                </span>
              </div>
              <p className="text-[10px] text-[#c4ab7d] truncate">
                {npc.npcProfessionLabel || 'Mercador'} · Ouro:{' '}
                <strong className="text-amber-300">{goldCoinsOwned}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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

        {/* Compact Status & Dialogue Strip */}
        <div className="px-3 py-2 bg-[#160e08] border-b border-[#3b2516] space-y-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="italic text-[#f3e5c8] truncate">
              "
              {isHostile
                ? `Pague ${peaceDebtCoins} Moedas com o Tratado da Paz em mãos!`
                : npc.dialogueLine || 'Bem-vindo, viajante.'}
              "
            </span>
            <span className="flex items-center gap-1 font-bold text-amber-200 shrink-0">
              <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />
              <span>{affinity}/100</span>
            </span>
          </div>

          <div className="w-full h-2 bg-[#0d0805] border border-[#4a301e] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${affinityTier.barColor}`}
              style={{ width: `${Math.max(4, Math.min(100, affinity))}%` }}
            />
          </div>

          {isWanderer && !isHostile && nearbyOpenHouse && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-sky-200">
                Casa disponível por perto:
              </span>
              <button
                type="button"
                onClick={handleSettleWanderer}
                className="px-2.5 min-h-[28px] medieval-btn-emerald font-pixel text-[9px] font-bold"
              >
                Convidar
              </button>
            </div>
          )}

          {isHostile && (
            <div className="p-2 border border-amber-500/60 bg-rose-950/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[10px] text-rose-100 truncate">
                  Tributo: <strong>{peaceDebtCoins} Ouro</strong> +{' '}
                  <strong>Tratado na mão</strong>
                </span>
              </div>
              <button
                type="button"
                disabled={!canPayPeaceDebt}
                onClick={handlePeaceTribute}
                className={`px-3 min-h-[30px] font-pixel text-[10px] font-bold shrink-0 ${
                  canPayPeaceDebt
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                }`}
              >
                Pagar
              </button>
            </div>
          )}

          {feedback && (
            <div
              className={`px-2.5 py-1 text-[10px] font-bold border ${
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
        <div className="px-3 pt-1.5 bg-[#1a110a] border-b border-[#3b2516] flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setTab('trades')}
            className={`px-3 py-1 font-pixel text-[10px] font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              tab === 'trades'
                ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Trocas ({npc.trades?.length || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('diplomacy')}
            className={`px-3 py-1 font-pixel text-[10px] font-bold flex items-center gap-1.5 border-t-2 border-x-2 ${
              tab === 'diplomacy'
                ? 'bg-[#2a1b10] border-amber-500 text-amber-300'
                : 'bg-[#120b07] border-[#3b2516] text-[#a38b65]'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Presentes</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="p-3 overflow-y-auto flex-1 space-y-2.5">
          {tab === 'trades' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(npc.trades || []).map((offer) => {
                const giveDef = ITEMS[offer.giveItemId];
                const recDef = ITEMS[offer.receiveItemId];
                const ownedCount = engine.getItemCount(offer.giveItemId);
                const hasEnoughItems = ownedCount >= offer.giveCount;
                const meetsAffinity =
                  affinity >= offer.minAffinity && !isHostile;
                const canTrade = hasEnoughItems && meetsAffinity;

                return (
                  <div
                    key={offer.id}
                    className={`medieval-inset p-2.5 border flex flex-col justify-between gap-2 ${
                      canTrade
                        ? 'border-amber-500/50 bg-[#23160d]'
                        : 'border-[#3b2516] bg-[#160e08]/80 opacity-85'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[#3b2516] pb-1">
                      <span className="font-pixel text-[10px] font-bold text-amber-200 truncate">
                        {offer.label || recDef?.name}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-600/40 shrink-0">
                        +{offer.affinityGain}♥
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-8 h-8 mc-slot flex items-center justify-center shrink-0 relative">
                          <img
                            src={spriteAtlas.getItemIconUrl(offer.giveItemId)}
                            alt={giveDef?.name}
                            className="w-5 h-5 pixelated"
                          />
                          <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-white">
                            x{offer.giveCount}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-[#f3e5c8] truncate">
                            {giveDef?.name || offer.giveItemId}
                          </div>
                          <div
                            className={`text-[9px] font-bold ${
                              hasEnoughItems
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {ownedCount}/{offer.giveCount}
                          </div>
                        </div>
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />

                      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-amber-300 truncate">
                            {recDef?.name || offer.receiveItemId}
                          </div>
                          <div className="text-[9px] text-[#c4ab7d]">
                            x{offer.receiveCount}
                          </div>
                        </div>
                        <div className="w-8 h-8 mc-slot-active flex items-center justify-center shrink-0 relative">
                          <img
                            src={spriteAtlas.getItemIconUrl(
                              offer.receiveItemId
                            )}
                            alt={recDef?.name}
                            className="w-5 h-5 pixelated"
                          />
                          <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-amber-300">
                            x{offer.receiveCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {offer.minAffinity > affinity ? (
                      <div className="w-full min-h-[30px] px-2 bg-[#120b07] border border-[#4a301e] text-[#c4ab7d] text-[10px] flex items-center justify-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" />
                        <span>♥{offer.minAffinity}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canTrade}
                        onClick={() => handleTrade(offer.id)}
                        className={`w-full min-h-[32px] font-pixel text-[10px] font-bold flex items-center justify-center ${
                          canTrade
                            ? 'medieval-btn-gold'
                            : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                        }`}
                      >
                        Trocar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GIFT_OPTIONS.map((g) => {
                  const def = ITEMS[g.itemId];
                  const owned = engine.getItemCount(g.itemId);
                  return (
                    <div
                      key={g.itemId}
                      className="p-2 bg-[#1a110a] border border-[#4a301e] flex items-center justify-between gap-2"
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
                          <div className="text-[10px] text-[#c4ab7d]">
                            Mochila: {owned}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={owned < 1}
                        onClick={() => handleGift(g.itemId)}
                        className={`px-2.5 min-h-[30px] font-pixel text-[10px] font-bold shrink-0 ${
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

              {!isHostile && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleProvoke}
                    className="px-3 min-h-[32px] medieval-btn-crimson font-pixel text-[10px] font-bold flex items-center gap-1.5"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>Desafiar</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Comércio & Diplomacia"
          subtitle="Como negociar com aldeões, oferecer presentes e fazer acordos"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Trocas e Afinidade (♥)',
              body: 'Realizar trocas ou entregar presentes na aba Presentes aumenta sua Afinidade com a vila. Ao atingir ♥75 (Aliado), trocas especiais e o Cofre da Vila são liberados.',
            },
            {
              title: '2. Andarilhos e Moradias',
              body: 'Andarilhos nômades podem ser convidados para morar em casas vazias ou com 1 morador (máximo de 2 aldeões por casa).',
            },
            {
              title: '3. Hostilidade e Tratado da Paz',
              body: 'Atacar aldeões ou roubar a vila torna os guardas hostis. Para restaurar a paz, segure um Tratado da Paz Real na mão e pague as moedas exigidas.',
            },
          ]}
        />
      )}
    </div>
  );
};
