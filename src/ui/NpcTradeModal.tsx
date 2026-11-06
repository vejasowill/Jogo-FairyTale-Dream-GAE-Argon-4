import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BedDouble,
  Check,
  Gift,
  Heart,
  Lock,
  MapPin,
  ShieldAlert,
  Sparkles,
  Swords,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import {
  BiomeType,
  CreatureEntity,
  PlaceableType,
  PlayerState,
} from '../game/core/types';
import { EntityManager } from '../game/entities/EntityManager';
import { GameEngine } from '../game/loop/GameEngine';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import { CHUNK_SIZE, TILE_SIZE, WorldManager } from '../game/world/WorldManager';
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

  // Super-Expanded Rest Point Delegation Mini-Map Modal State
  const [showRestPointMap, setShowRestPointMap] = useState(false);
  const [selectedRestPointId, setSelectedRestPointId] = useState<string | null>(
    null
  );
  const [mapZoom, setMapZoom] = useState<number>(1.35);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const npc: CreatureEntity | undefined = engine.entities.creatures.find(
    (c) => c.id === npcId
  );

  const nearbyRestPoints =
    npc && npc.kind === 'WANDERER'
      ? engine.getNearbyRestPointsForInvite(npc.id, 768)
      : [];
  const delegatableRestPoints = nearbyRestPoints.filter((r) => r.canDelegate);

  useEffect(() => {
    if (!showRestPointMap || !npc) return;
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Center camera between player and NPC
    const centerWorldX = (engine.player.x + npc.x) * 0.5;
    const centerWorldY = (engine.player.y + npc.y) * 0.5;
    const centerTileX = Math.floor(centerWorldX / TILE_SIZE);
    const centerTileY = Math.floor(centerWorldY / TILE_SIZE);

    const pxPerTile = Math.max(6, Math.round(9 * mapZoom));
    const halfTilesX = Math.ceil(W / (2 * pxPerTile)) + 1;
    const halfTilesY = Math.ceil(H / (2 * pxPerTile)) + 1;

    // 1. Draw Terrain Tiles
    for (let dy = -halfTilesY; dy <= halfTilesY; dy++) {
      for (let dx = -halfTilesX; dx <= halfTilesX; dx++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        const screenX = Math.round(
          W / 2 + (tx * TILE_SIZE - centerWorldX) * (pxPerTile / TILE_SIZE)
        );
        const screenY = Math.round(
          H / 2 + (ty * TILE_SIZE - centerWorldY) * (pxPerTile / TILE_SIZE)
        );

        const biome = engine.world.getTileBiomeFast(tx, ty);
        let tileColor = '#2e5a27';
        if (biome === BiomeType.OCEAN) tileColor = '#0c4a6e';
        else if (biome === BiomeType.ISLAND) tileColor = '#fde047';
        else if (biome === BiomeType.DESERT) tileColor = '#d97706';
        else if (biome === BiomeType.FOREST) tileColor = '#166534';
        else if (biome === BiomeType.TEMPERATE_FOREST) tileColor = '#15803d';
        else if (biome === BiomeType.TAIGA_FOREST) tileColor = '#115e59';

        ctx.fillStyle = tileColor;
        ctx.fillRect(screenX, screenY, pxPerTile + 1, pxPerTile + 1);
      }
    }

    // 2. Draw Nearby Structures (Walls, Floors, Doors) for clear architectural context
    const minChunkX = Math.floor((centerTileX - halfTilesX) / CHUNK_SIZE);
    const maxChunkX = Math.floor((centerTileX + halfTilesX) / CHUNK_SIZE);
    const minChunkY = Math.floor((centerTileY - halfTilesY) / CHUNK_SIZE);
    const maxChunkY = Math.floor((centerTileY + halfTilesY) / CHUNK_SIZE);

    for (let cy = minChunkY; cy <= maxChunkY; cy++) {
      for (let cx = minChunkX; cx <= maxChunkX; cx++) {
        const chunk = engine.world.chunks[WorldManager.chunkKey(cx, cy)];
        if (!chunk) continue;
        for (const st of chunk.structures) {
          const sx = Math.round(
            W / 2 +
              (st.tileX * TILE_SIZE - centerWorldX) * (pxPerTile / TILE_SIZE)
          );
          const sy = Math.round(
            H / 2 +
              (st.tileY * TILE_SIZE - centerWorldY) * (pxPerTile / TILE_SIZE)
          );
          if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;

          if (
            st.type === PlaceableType.WOOD_FLOOR ||
            st.type === PlaceableType.DARK_OAK_FLOOR ||
            st.type === PlaceableType.PINE_FLOOR ||
            st.type === PlaceableType.PALM_FLOOR ||
            st.type === PlaceableType.STONE_FLOOR ||
            st.type === PlaceableType.BRICK_FLOOR ||
            st.type === PlaceableType.WOOD_BRIDGE
          ) {
            ctx.fillStyle = 'rgba(180, 125, 72, 0.72)';
            ctx.fillRect(sx, sy, pxPerTile, pxPerTile);
          } else if (
            st.type !== PlaceableType.BED &&
            st.type !== PlaceableType.EXPLORER_TENT &&
            st.type !== PlaceableType.VILLAGE_HOUSE
          ) {
            ctx.fillStyle = '#3b2516';
            ctx.fillRect(sx, sy, pxPerTile, pxPerTile);
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 0.5, sy + 0.5, pxPerTile - 1, pxPerTile - 1);
          }
        }
      }
    }

    // Subtle coordinate grid overlay
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += pxPerTile * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += pxPerTile * 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const toScreen = (wx: number, wy: number) => ({
      x: Math.round(W / 2 + (wx - centerWorldX) * (pxPerTile / TILE_SIZE)),
      y: Math.round(H / 2 + (wy - centerWorldY) * (pxPerTile / TILE_SIZE)),
    });

    const npcPos = toScreen(npc.x, npc.y);
    const playerPos = toScreen(engine.player.x, engine.player.y);

    // 3. If a Rest Point is selected, draw a dashed delegation path line from the NPC to that bed!
    const selectedRp = nearbyRestPoints.find(
      (r) => r.id === selectedRestPointId
    );
    if (selectedRp) {
      const rpPos = toScreen(selectedRp.worldX, selectedRp.worldY);
      ctx.save();
      ctx.strokeStyle = selectedRp.canDelegate ? '#34d399' : '#f87171';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(npcPos.x, npcPos.y);
      ctx.lineTo(rpPos.x, rpPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 4. Draw all nearby Rest Points (Beds, Tents, Houses) as interactive markers
    for (const rp of nearbyRestPoints) {
      const pos = toScreen(rp.worldX, rp.worldY);
      const isSelected = rp.id === selectedRestPointId;
      const radius = isSelected ? 13 : 10;

      ctx.save();
      if (isSelected) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = rp.canDelegate
        ? isSelected
          ? '#059669'
          : '#065f46'
        : '#450a0a';
      ctx.strokeStyle = rp.canDelegate
        ? isSelected
          ? '#fef08a'
          : '#34d399'
        : '#f87171';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw pixel bed icon inside the marker
      ctx.fillStyle = '#78350f';
      ctx.fillRect(pos.x - 6, pos.y - 3, 12, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pos.x - 5, pos.y - 2, 3, 4);
      ctx.fillStyle = rp.canDelegate ? '#ef4444' : '#64748b';
      ctx.fillRect(pos.x - 1, pos.y - 2, 6, 4);

      // Small occupancy tag under bed marker
      ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#090d16';
      ctx.fillText(
        `${rp.currentResidents}/${rp.maxCapacity}`,
        pos.x + 1,
        pos.y + radius + 10
      );
      ctx.fillStyle = rp.canDelegate ? '#a7f3d0' : '#fca5a5';
      ctx.fillText(
        `${rp.currentResidents}/${rp.maxCapacity}`,
        pos.x,
        pos.y + radius + 9
      );
      ctx.restore();
    }

    // 5. Draw Player Head Marker
    const playerSprite = spriteAtlas.getPlayerSprite(
      'down',
      0,
      engine.player,
      'none'
    );
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(playerPos.x, playerPos.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(
      playerSprite,
      8,
      0,
      32,
      16,
      playerPos.x - 9,
      playerPos.y - 8,
      18,
      14
    );
    ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('Você', playerPos.x, playerPos.y - 13);
    ctx.restore();

    // 6. Draw Invited Wanderer NPC Head Marker
    EntityManager.ensureNpcHumanAppearance(npc);
    const npcSprite = spriteAtlas.getPlayerSprite(
      'down',
      0,
      {
        appearance: npc.appearance!,
        equippedBySlot: npc.equippedBySlot!,
      } as PlayerState,
      'none'
    );
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(npcPos.x, npcPos.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(npcSprite, 8, 0, 32, 16, npcPos.x - 9, npcPos.y - 8, 18, 14);
    ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(npc.name, npcPos.x, npcPos.y - 13);
    ctx.restore();
  }, [
    showRestPointMap,
    selectedRestPointId,
    mapZoom,
    npc,
    engine,
    nearbyRestPoints,
  ]);

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

  const handleOpenRestPointDelegationMap = () => {
    const firstValid = delegatableRestPoints[0] || nearbyRestPoints[0] || null;
    setSelectedRestPointId(firstValid ? firstValid.id : null);
    setShowRestPointMap(true);
  };

  const handleConfirmRestPointDelegation = () => {
    if (!selectedRestPointId) return;
    const res = engine.inviteWandererToSpecificRestPoint(
      npc.id,
      selectedRestPointId
    );
    setFeedback({
      ok: res.ok,
      text: res.message,
    });
    if (res.ok) {
      setShowRestPointMap(false);
    }
  };

  const handleMapCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const W = canvas.width;
    const H = canvas.height;
    const centerWorldX = (engine.player.x + npc.x) * 0.5;
    const centerWorldY = (engine.player.y + npc.y) * 0.5;
    const pxPerTile = Math.max(6, Math.round(9 * mapZoom));

    let closestId: string | null = null;
    let closestDist = 26;
    for (const rp of nearbyRestPoints) {
      const sx =
        W / 2 + (rp.worldX - centerWorldX) * (pxPerTile / TILE_SIZE);
      const sy =
        H / 2 + (rp.worldY - centerWorldY) * (pxPerTile / TILE_SIZE);
      const d = Math.hypot(clickX - sx, clickY - sy);
      if (d <= closestDist) {
        closestDist = d;
        closestId = rp.id;
      }
    }

    if (closestId) {
      setSelectedRestPointId(closestId);
    }
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

  EntityManager.ensureNpcHumanAppearance(npc);
  const npcPortraitUrl = spriteAtlas
    .getPlayerSprite(
      'down',
      0,
      {
        appearance: npc.appearance!,
        equippedBySlot: npc.equippedBySlot!,
      } as PlayerState,
      'none'
    )
    .toDataURL();

  const selectedRestPointObj =
    nearbyRestPoints.find((r) => r.id === selectedRestPointId) || null;

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
            <div className="w-10 h-10 mc-slot-active flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={npcPortraitUrl}
                alt={npc.name}
                className="w-10 h-10 object-contain pixelated"
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

          {isWanderer && !isHostile && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-sky-200">
                {delegatableRestPoints.length > 0
                  ? `${delegatableRestPoints.length} ponto(s) de descanso disponível(is) na região:`
                  : 'Delegar cama ou abrigo próximo para este andarilho:'}
              </span>
              <button
                type="button"
                onClick={handleOpenRestPointDelegationMap}
                className="px-2.5 min-h-[28px] medieval-btn-emerald font-pixel text-[9px] font-bold flex items-center gap-1"
              >
                <BedDouble className="w-3.5 h-3.5" />
                <span>Convidar para Morar</span>
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

      {/* Super-Expanded Mini-Map Modal for Delegating Rest Point to Invited Wanderer */}
      {showRestPointMap && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-2 sm:p-4"
          onClick={() => setShowRestPointMap(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[94dvh] medieval-panel flex flex-col overflow-hidden border-2 border-amber-500/80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2 bg-[#1c120b] border-b-2 border-[#4a301e] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <BedDouble className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                    Delegar Ponto de Descanso — {npc.name}
                  </h3>
                  <p className="text-[10px] text-[#c4ab7d] truncate">
                    Clique na cama desejada no mini-mapa expandido e confirme a
                    delegação
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setMapZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))
                  }
                  className="min-h-[30px] min-w-[30px] medieval-btn-wood flex items-center justify-center"
                  title="Reduzir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMapZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))
                  }
                  className="min-h-[30px] min-w-[30px] medieval-btn-wood flex items-center justify-center"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowRestPointMap(false)}
                  className="min-h-[30px] min-w-[30px] medieval-btn-crimson flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body: Interactive Super-Expanded Mini-Map Canvas + Clickable List */}
            <div className="p-3 overflow-y-auto flex-1 space-y-3 bg-[#140d08]">
              <div className="relative w-full border-2 border-[#4a301e] bg-[#0b131e] overflow-hidden">
                <canvas
                  ref={mapCanvasRef}
                  width={540}
                  height={320}
                  onClick={handleMapCanvasClick}
                  className="w-full h-[230px] sm:h-[290px] block cursor-pointer select-none"
                />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/75 border border-[#4a301e] text-[9px] text-[#e5d5b5] flex flex-wrap items-center gap-2 pointer-events-none">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block border border-amber-200" />
                    Disponível
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-800 inline-block border border-rose-400" />
                    Ocupado
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                    Você
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-300 inline-block" />
                    {npc.name}
                  </span>
                </div>
              </div>

              {/* Selected Rest Point Details Card */}
              {selectedRestPointObj ? (
                <div
                  className={`p-2.5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
                    selectedRestPointObj.canDelegate
                      ? 'bg-emerald-950/35 border-emerald-500/60'
                      : 'bg-rose-950/35 border-rose-500/60'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span className="font-pixel text-[11px] font-bold text-amber-200">
                        {selectedRestPointObj.label}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-black/50 border border-[#4a301e] text-[#c4ab7d]">
                        Tile ({selectedRestPointObj.tileX},{' '}
                        {selectedRestPointObj.tileY})
                      </span>
                    </div>
                    <p className="text-[10px] text-[#e5d5b5]">
                      {selectedRestPointObj.statusReason} · Ocupação:{' '}
                      <strong>
                        {selectedRestPointObj.currentResidents}/
                        {selectedRestPointObj.maxCapacity}
                      </strong>{' '}
                      · Distância:{' '}
                      <strong>
                        {Math.round(selectedRestPointObj.distFromNpc / 32)}m
                      </strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 border border-[#4a301e] bg-[#1a110a] text-[11px] text-[#c4ab7d] text-center">
                  {nearbyRestPoints.length === 0
                    ? 'Nenhuma cama ou ponto de descanso encontrado nas proximidades. Construa e coloque uma Cama primeiro!'
                    : 'Toque em uma cama no mapa acima para selecioná-la.'}
                </div>
              )}

              {/* Quick Selector Pills for Nearby Rest Points */}
              {nearbyRestPoints.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {nearbyRestPoints.map((rp) => {
                    const isSel = rp.id === selectedRestPointId;
                    return (
                      <button
                        key={rp.id}
                        type="button"
                        onClick={() => setSelectedRestPointId(rp.id)}
                        className={`p-2 text-left border flex items-center justify-between gap-2 transition-colors ${
                          isSel
                            ? 'bg-[#2a1b10] border-amber-400 text-amber-200'
                            : 'bg-[#180f09] border-[#3b2516] text-[#c4ab7d]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold truncate">
                            {rp.label} ({rp.tileX}, {rp.tileY})
                          </div>
                          <div
                            className={`text-[9px] truncate ${
                              rp.canDelegate
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {rp.statusReason}
                          </div>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-black/40 border border-[#4a301e] shrink-0">
                          {rp.currentResidents}/{rp.maxCapacity}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Confirm / Cancel Actions */}
            <div className="px-3 py-2.5 bg-[#1c120b] border-t-2 border-[#4a301e] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowRestPointMap(false)}
                className="px-4 min-h-[36px] medieval-btn-crimson font-pixel text-[10px] font-bold flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>CANCELAR</span>
              </button>
              <button
                type="button"
                disabled={
                  !selectedRestPointObj || !selectedRestPointObj.canDelegate
                }
                onClick={handleConfirmRestPointDelegation}
                className={`px-4 min-h-[36px] font-pixel text-[10px] font-bold flex items-center gap-1.5 ${
                  selectedRestPointObj?.canDelegate
                    ? 'medieval-btn-emerald'
                    : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>CONFIRMAR CAMA</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
              title: '2. Andarilhos e Delegação de Cama no Mini-Mapa',
              body: 'Andarilhos nômades podem ser convidados para morar. Ao clicar em Convidar para Morar, abre-se o mini-mapa expandido de pontos de descanso próximos para que você clique na cama desejada e confirme a delegação.',
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
