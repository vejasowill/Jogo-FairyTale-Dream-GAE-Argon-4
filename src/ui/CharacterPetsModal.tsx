import React, { useState } from 'react';
import {
  Heart,
  Palette,
  Plus,
  RotateCw,
  Shield,
  Swords,
  User,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import {
  CreatureEntity,
  CreatureKind,
  Direction,
  EquipmentSlot,
  EyeStyleId,
  HairStyleId,
  ItemCategory,
  PlayerAppearance,
  PlayerAttributes,
  PlayerGender,
  PlayerState,
  SkinMarkId,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { SaveManager } from '../game/persistence/SaveManager';
import {
  DEFAULT_PLAYER_APPEARANCE,
  spriteAtlas,
} from '../game/rendering/SpriteAtlas';
import { WindowHelpButton, WindowHelpModal } from './UiTooltipAndHelp';

interface CharacterPetsModalProps {
  engine: GameEngine;
  player: PlayerState;
  tamedAnimals: CreatureEntity[];
  onClose: () => void;
}

const SLOT_META: {
  slot: EquipmentSlot;
  label: string;
  shortLabel: string;
  emptyHint: string;
}[] = [
  {
    slot: 'head',
    label: 'Cabeça',
    shortLabel: 'Cabeça',
    emptyHint: 'Elmo / Capuz',
  },
  {
    slot: 'body',
    label: 'Superior',
    shortLabel: 'Superior',
    emptyHint: 'Túnica / Regata',
  },
  {
    slot: 'legs',
    label: 'Inferior',
    shortLabel: 'Inferior',
    emptyHint: 'Calça / Bermuda',
  },
  {
    slot: 'feet',
    label: 'Pés',
    shortLabel: 'Pés',
    emptyHint: 'Botas',
  },
];

const GENDERS: { id: PlayerGender; label: string; symbol: string }[] = [
  { id: 'masculino', label: 'Masculino', symbol: '♂' },
  { id: 'feminino', label: 'Feminino', symbol: '♀' },
];

const SKIN_MARKS: { id: SkinMarkId; label: string; desc: string }[] = [
  { id: 'none', label: 'Sem Marcas', desc: 'Pele natural sem marcas' },
  { id: 'freckles', label: 'Sardas', desc: 'Sardas suaves nas bochechas e nariz' },
  { id: 'eye_scar', label: 'Cicatriz', desc: 'Cicatriz de batalha sobre o olho' },
  {
    id: 'freckles_and_scar',
    label: 'Ambos',
    desc: 'Sardas nas bochechas + Cicatriz no olho',
  },
];

const SKIN_TONES: {
  label: string;
  group: string;
  color: string;
  subTone: string;
}[] = [
  { label: 'Alabastro', group: 'Claríssima', color: '#fff1e6', subTone: '#f3d5c0' },
  { label: 'Porcelana', group: 'Clara Fria', color: '#ffedd5', subTone: '#e8c4a2' },
  { label: 'Marfim Rosado', group: 'Clara Rosada', color: '#fde2d2', subTone: '#e2b59e' },
  { label: 'Claro Solar', group: 'Clara Dourada', color: '#fde68a', subTone: '#dfc05c' },
  { label: 'Pêssego Suave', group: 'Média Clara', color: '#fed7aa', subTone: '#dfa974' },
  { label: 'Trigo Solar', group: 'Média Quente', color: '#fdba74', subTone: '#d98f48' },
  { label: 'Areia Dourada', group: 'Média Oliva', color: '#eab676', subTone: '#c48d4c' },
  { label: 'Amêndoa', group: 'Média Neutra', color: '#e0ac69', subTone: '#b88242' },
  { label: 'Mel Tostado', group: 'Bronze Clara', color: '#d49454', subTone: '#aa6c2f' },
  { label: 'Bronze Dourado', group: 'Bronze Quente', color: '#d97706', subTone: '#a85703' },
  { label: 'Canela', group: 'Morena Quente', color: '#b45309', subTone: '#873b05' },
  { label: 'Castanho Médio', group: 'Morena Dourada', color: '#a16207', subTone: '#754604' },
  { label: 'Terra Queimada', group: 'Morena Escura', color: '#8c4318', subTone: '#612b0c' },
  { label: 'Cacau', group: 'Escura Quente', color: '#78350f', subTone: '#522207' },
  { label: 'Mogno', group: 'Escura Profunda', color: '#5c2d16', subTone: '#3d1b0b' },
  { label: 'Ébano Noturno', group: 'Escura Fria', color: '#3f2014', subTone: '#261109' },
];

const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: 'adventurer', label: 'Aventureiro' },
  { id: 'warrior_crest', label: 'Crista' },
  { id: 'long_mane', label: 'Longo' },
  { id: 'braided', label: 'Tranças' },
  { id: 'ponytail', label: 'Rabo Cavalo' },
  { id: 'twin_tails', label: 'Chiquinha' },
  { id: 'curly_crown', label: 'Cacheado' },
  { id: 'samurai_bun', label: 'Coque' },
  { id: 'noble_waves', label: 'Ondulado' },
  { id: 'valkyrie_bangs', label: 'Valquíria' },
];

const HAIR_COLORS: {
  label: string;
  group: string;
  color: string;
  subTone: string;
}[] = [
  // Pretos & Escuros
  { label: 'Preto Corvo', group: 'Preto', color: '#0f172a', subTone: '#020617' },
  { label: 'Ébano Azulado', group: 'Preto Frio', color: '#1e293b', subTone: '#0f172a' },
  // Castanhos
  { label: 'Castanho Escuro', group: 'Castanho', color: '#451a03', subTone: '#290f02' },
  { label: 'Chocolate', group: 'Castanho Médio', color: '#78350f', subTone: '#451a03' },
  { label: 'Avelã', group: 'Castanho Claro', color: '#92400e', subTone: '#6b2e08' },
  { label: 'Caramelo Tostado', group: 'Castanho Dourado', color: '#b45309', subTone: '#7c3705' },
  // Loiros
  { label: 'Loiro Mel', group: 'Loiro Escuro', color: '#ca8a04', subTone: '#966502' },
  { label: 'Loiro Solar', group: 'Loiro Dourado', color: '#facc15', subTone: '#ca8a04' },
  { label: 'Loiro Trigo', group: 'Loiro Claro', color: '#fde047', subTone: '#d4b116' },
  { label: 'Loiro Platinado', group: 'Loiro Frio', color: '#fef08a', subTone: '#d6c45c' },
  // Ruivos
  { label: 'Ruivo Cobre', group: 'Ruivo Claro', color: '#ea580c', subTone: '#b03e06' },
  { label: 'Ruivo Brasa', group: 'Ruivo Intenso', color: '#c2410c', subTone: '#8a2b06' },
  { label: 'Ruivo Carmim', group: 'Ruivo Escuro', color: '#991b1b', subTone: '#630f0f' },
  { label: 'Vinho Borgonha', group: 'Ruivo Rubi', color: '#7f1d1d', subTone: '#4c0d0d' },
  // Grisalhos & Prata
  { label: 'Cinza Lobo', group: 'Grisalho', color: '#64748b', subTone: '#334155' },
  { label: 'Prata Ancestral', group: 'Prateado', color: '#e2e8f0', subTone: '#94a3b8' },
  // Fantasia / Místicos
  { label: 'Azul Astral', group: 'Safira', color: '#0284c7', subTone: '#03537d' },
  { label: 'Turquesa Abissal', group: 'Turquesa', color: '#0d9488', subTone: '#085e56' },
  { label: 'Verde Bosque', group: 'Esmeralda', color: '#15803d', subTone: '#0c4f24' },
  { label: 'Violeta Místico', group: 'Ametista', color: '#7e22ce', subTone: '#4f1285' },
  { label: 'Rosa Sakura', group: 'Quartzo', color: '#db2777', subTone: '#991550' },
];

const EYE_STYLES: { id: EyeStyleId; label: string; desc: string }[] = [
  { id: 'classic', label: 'Clássico', desc: 'Olhar equilibrado e expressivo' },
  { id: 'sharp', label: 'Afiado', desc: 'Olhar estreito e focado de caçador' },
  { id: 'large', label: 'Grande', desc: 'Olhos amplos com duplo brilho estelar' },
  { id: 'calm', label: 'Sereno', desc: 'Pálpebras suaves e expressão tranquila' },
  { id: 'fierce', label: 'Feroz', desc: 'Sobrancelha angulada e olhar determinado' },
  { id: 'mystic', label: 'Místico', desc: 'Pupila luminosa de brilho ancestral' },
];

const EYE_COLORS: {
  label: string;
  group: string;
  color: string;
  subTone: string;
}[] = [
  // Escuros & Castanhos
  { label: 'Ônix Profundo', group: 'Preto', color: '#0f172a', subTone: '#334155' },
  { label: 'Café Escuro', group: 'Castanho Escuro', color: '#451a03', subTone: '#78350f' },
  { label: 'Castanho Mel', group: 'Castanho Claro', color: '#78350f', subTone: '#b45309' },
  { label: 'Avelã Dourado', group: 'Avelã', color: '#a16207', subTone: '#eab308' },
  // Âmbar & Ouro
  { label: 'Âmbar Quente', group: 'Âmbar', color: '#d97706', subTone: '#fbbf24' },
  { label: 'Ouro Solar', group: 'Dourado', color: '#facc15', subTone: '#fef08a' },
  // Verdes
  { label: 'Verde Musgo', group: 'Verde Escuro', color: '#15803d', subTone: '#22c55e' },
  { label: 'Esmeralda Viva', group: 'Esmeralda', color: '#10b981', subTone: '#6ee7b7' },
  { label: 'Jade Místico', group: 'Verde Água', color: '#0d9488', subTone: '#5eead4' },
  // Azuis
  { label: 'Azul Oceano', group: 'Azul Escuro', color: '#1d4ed8', subTone: '#60a5fa' },
  { label: 'Safira Real', group: 'Safira', color: '#0284c7', subTone: '#38bdf8' },
  { label: 'Gelo Celeste', group: 'Azul Claro', color: '#38bdf8', subTone: '#bae6fd' },
  // Violetas, Rubi & Prata
  { label: 'Ametista', group: 'Violeta', color: '#9333ea', subTone: '#d8b4fe' },
  { label: 'Lilás Lunar', group: 'Lavanda', color: '#a855f7', subTone: '#f3e8ff' },
  { label: 'Rubi Carmesim', group: 'Rubi', color: '#e11d48', subTone: '#fda4af' },
  { label: 'Prata Cinzento', group: 'Cinza', color: '#64748b', subTone: '#cbd5e1' },
];

export const CharacterPetsModal: React.FC<CharacterPetsModalProps> = ({
  engine,
  player,
  tamedAnimals,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'stats' | 'pets'>(
    'custom'
  );
  const [appearanceCat, setAppearanceCat] = useState<'skin' | 'hair' | 'eyes'>(
    'skin'
  );
  const [previewDir, setPreviewDir] = useState<Direction>('down');
  const [selectedSlotFilter, setSelectedSlotFilter] = useState<
    EquipmentSlot | 'ALL'
  >('ALL');
  const [showHelp, setShowHelp] = useState(false);

  const eq = player.equippedBySlot || {
    head: null,
    body: player.equippedArmorId || null,
    legs: null,
    feet: null,
  };
  const app = {
    ...DEFAULT_PLAYER_APPEARANCE,
    ...(player.appearance || {}),
  };

  const totalDefPct = Math.round(engine.getTotalDefenseBonus() * 100);
  const totalSpeedPct = Math.round(engine.getTotalEquipmentSpeedBonus() * 100);
  const armorHpBonus = engine.getTotalEquipmentMaxHpBonus();
  const baseStatusMaxHp =
    engine.getPlayerStatusMaxHp() +
    Math.max(0, Math.floor(player.bonusMaxHpFromItems || 0));

  const playerPreviewUrl = (() => {
    const c = spriteAtlas.getPlayerSprite(previewDir, 0, player);
    return c.toDataURL();
  })();

  const cyclePreviewDir = () => {
    const order: Direction[] = ['down', 'right', 'up', 'left'];
    const idx = order.indexOf(previewDir);
    setPreviewDir(order[(idx + 1) % order.length]);
  };

  const inventoryArmorItems = player.inventory
    .map((slot, index) => {
      if (!slot) return null;
      const def = ITEMS[slot.itemId];
      if (!def || def.category !== ItemCategory.ARMOR) return null;
      return { index, slot, def };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) =>
      selectedSlotFilter === 'ALL'
        ? true
        : (entry.def.equipSlot || 'body') === selectedSlotFilter
    );

  const strengthLv = Math.max(0, Math.floor(player.attributes.strength ?? 0));
  const agilityLv = Math.max(0, Math.floor(player.attributes.agility ?? 0));
  const survivalLv = Math.max(0, Math.floor(player.attributes.survival ?? 0));
  const attackSpeedLv = Math.max(
    0,
    Math.floor(player.attributes.attackSpeed ?? 0)
  );
  const defenseLv = Math.max(0, Math.floor(player.attributes.defense ?? 0));
  const statusDefPct = Math.round(engine.getStatusDefenseBonus() * 100);
  const equipDefPct = Math.round(engine.getEquipmentDefenseBonus() * 100);
  const attackCooldownSec = engine.getPlayerAttackCooldownSec();

  const heldSlot = player.inventory[player.selectedHotbarIndex];
  const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
  const strengthMult = 1 + strengthLv * 0.12;
  const statusBaseAttack = Math.round(4 * strengthMult);
  const totalAttack = Math.round((heldItem?.attackDamage || 4) * strengthMult);

  const attributesList: {
    key: keyof PlayerAttributes;
    name: string;
    desc: string;
    bonusText: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'vitality',
      name: 'Vitalidade',
      desc: '+18 Vida Máx.',
      bonusText: `HP: ${baseStatusMaxHp}${
        armorHpBonus > 0 ? ` (+${armorHpBonus})` : ''
      }`,
      icon: <Heart className="w-4 h-4 text-rose-400" />,
    },
    {
      key: 'strength',
      name: 'Força',
      desc: '+12% Dano/Coleta',
      bonusText: `ATQ Base: ${statusBaseAttack} (+${Math.round(
        strengthLv * 12
      )}%)`,
      icon: <Swords className="w-4 h-4 text-amber-400" />,
    },
    {
      key: 'attackSpeed',
      name: 'Vel. ATK',
      desc: '+8% Vel. Ataque/Quebra',
      bonusText: `${attackCooldownSec.toFixed(2)}s (+${Math.round(
        attackSpeedLv * 8
      )}%)`,
      icon: <Zap className="w-4 h-4 text-yellow-400" />,
    },
    {
      key: 'defense',
      name: 'Defesa',
      desc: '+3% Redução de Dano',
      bonusText: `-${statusDefPct}% Status${
        equipDefPct > 0 ? ` (-${equipDefPct}% Armadura)` : ''
      }`,
      icon: <Shield className="w-4 h-4 text-indigo-400" />,
    },
    {
      key: 'agility',
      name: 'Agilidade',
      desc: '+6% Velocidade Mov.',
      bonusText: `+${Math.round(agilityLv * 6)}%`,
      icon: <Wind className="w-4 h-4 text-sky-400" />,
    },
    {
      key: 'survival',
      name: 'Sobrevivência',
      desc: '-8% Fome / +10% Drop',
      bonusText: `+${Math.round(survivalLv * 10)}%`,
      icon: <Shield className="w-4 h-4 text-emerald-400" />,
    },
  ];

  const petBonusDescription = (pet: CreatureEntity) => {
    switch (pet.kind) {
      case 'SHEEP':
        return 'Lã Macia & Cura Passiva';
      case 'BOAR':
        return 'Guardião de Combate';
      case 'HORSE':
      case 'CAMEL':
        return pet.hasSaddle
          ? `Vel. ${pet.mountSpeed || 145} · Fôlego ${
              pet.mountMaxStamina || 100
            } · 8 Slots`
          : 'Requer Sela para montar';
      default:
        return 'Companheiro fiel';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl medieval-panel flex flex-col max-h-[96dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('custom')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-pixel font-bold flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'custom'
                  ? 'medieval-btn-gold'
                  : 'medieval-btn-wood'
              }`}
            >
              <Palette className="w-3.5 h-3.5 text-amber-300" />
              <span>Trajes</span>
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-pixel font-bold flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'stats'
                  ? 'medieval-btn-gold'
                  : 'medieval-btn-wood'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Atributos</span>
              {player.attributePoints > 0 && (
                <span className="px-1 bg-emerald-500 text-black text-[9px] font-extrabold rounded">
                  +{player.attributePoints}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pets')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-pixel font-bold flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'pets' ? 'medieval-btn-gold' : 'medieval-btn-wood'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span>Pets ({tamedAnimals.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1 px-2 py-1 mc-slot border-amber-500/50 bg-[#120b07]">
              <img
                src={spriteAtlas.getItemIconUrl('gold_coin')}
                alt="Ouro"
                className="w-4 h-4 pixelated"
              />
              <span className="text-[10px] font-mono-tabular font-bold text-amber-300">
                {player.goldCoins ?? 0}
              </span>
            </div>
            <WindowHelpButton onClick={() => setShowHelp(true)} />
            <button
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TAB 1: EQUIPMENT & CUSTOMIZATION */}
        {activeTab === 'custom' ? (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  EQUIPAMENTOS (4 SLOTS)
                </h3>
                <div className="flex items-center gap-2 text-[10px] font-mono-tabular">
                  <span className="text-sky-300 font-bold">
                    DEF -{totalDefPct}%
                  </span>
                  {armorHpBonus > 0 && (
                    <span className="text-rose-300 font-bold">
                      HP +{armorHpBonus}
                    </span>
                  )}
                  {totalSpeedPct > 0 && (
                    <span className="text-emerald-400 font-bold">
                      VEL +{totalSpeedPct}%
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 items-center bg-[#120b07] p-2.5 border border-[#4a301e]">
                <div className="col-span-5 flex flex-col items-center justify-center gap-1.5 border-r border-[#3d281a] pr-2">
                  <span className="px-1.5 py-0.5 bg-[#2a1b10] border border-[#6e4930] text-[9px] font-bold text-amber-300 rounded">
                    {(app.gender ?? 'masculino') === 'feminino' ? '♀ Feminino' : '♂ Masculino'}
                  </span>
                  <div className="w-20 h-20 bg-[#1a110b] border-2 border-[#6e4930] flex items-center justify-center relative shadow-inner">
                    <img
                      src={playerPreviewUrl}
                      alt="Herói"
                      className="w-16 h-16 pixelated"
                    />
                  </div>
                  <button
                    onClick={cyclePreviewDir}
                    className="w-full py-1 medieval-btn-wood text-[9px] font-bold flex items-center justify-center gap-1"
                  >
                    <RotateCw className="w-3 h-3 text-amber-300" />
                    <span>Girar</span>
                  </button>
                </div>

                <div className="col-span-7 space-y-1.5">
                  {SLOT_META.map((meta) => {
                    const equippedId = eq[meta.slot];
                    const itemDef = equippedId ? ITEMS[equippedId] : null;
                    const isFiltered = selectedSlotFilter === meta.slot;

                    return (
                      <div
                        key={meta.slot}
                        onClick={() =>
                          setSelectedSlotFilter((prev) =>
                            prev === meta.slot ? 'ALL' : meta.slot
                          )
                        }
                        className={`mc-slot p-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isFiltered ? 'border-amber-400 bg-[#2a1b10]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 bg-[#120b07] border border-[#4a301e] flex items-center justify-center shrink-0">
                            {itemDef ? (
                              <img
                                src={spriteAtlas.getItemIconUrl(itemDef.id)}
                                alt={itemDef.name}
                                className="w-5 h-5 pixelated"
                              />
                            ) : (
                              <Shield className="w-3.5 h-3.5 text-[#5c3d28]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[9px] font-pixel text-amber-400 uppercase block">
                              {meta.label}
                            </span>
                            <div className="text-[10px] font-bold text-white truncate">
                              {itemDef ? itemDef.name : meta.emptyHint}
                            </div>
                          </div>
                        </div>

                        {itemDef && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.unequipArmorSlot(meta.slot);
                            }}
                            className="px-2 py-0.5 medieval-btn-crimson text-[9px] font-bold shrink-0"
                          >
                            Tirar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-pixel text-[#c4ab7d]">
                    NA MOCHILA ({inventoryArmorItems.length})
                  </span>
                  {selectedSlotFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedSlotFilter('ALL')}
                      className="text-amber-400 underline text-[9px]"
                    >
                      Todos
                    </button>
                  )}
                </div>

                {inventoryArmorItems.length === 0 ? (
                  <div className="mc-slot p-2.5 text-center text-[10px] text-[#8c6d46]">
                    Sem armaduras na mochila.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-[135px] overflow-y-auto pr-0.5">
                    {inventoryArmorItems.map(({ index, def }) => (
                      <div
                        key={`${def.id}_${index}`}
                        className="mc-slot p-1.5 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={spriteAtlas.getItemIconUrl(def.id)}
                            alt={def.name}
                            className="w-6 h-6 pixelated shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold text-white truncate">
                              {def.name}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-mono-tabular">
                              {def.defenseBonus && (
                                <span className="text-sky-300">
                                  -{Math.round(def.defenseBonus * 100)}% Dano
                                </span>
                              )}
                              {def.maxHpBonus && (
                                <span className="text-rose-300">
                                  +{def.maxHpBonus} HP Máx
                                </span>
                              )}
                              {def.speedBonus && (
                                <span className="text-emerald-400">
                                  +{Math.round(def.speedBonus * 100)}% Vel
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => engine.equipArmorFromSlot(index)}
                          className="px-2.5 py-1 medieval-btn-gold text-[10px] font-bold shrink-0"
                        >
                          Equipar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN (6 cols): Inventory-Style Appearance Window by Category */}
            <div className="sm:col-span-6 medieval-inset p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  APARÊNCIA UNIVERSAL DA CONTA
                </h3>
                <button
                  onClick={() =>
                    engine.updatePlayerAppearance(DEFAULT_PLAYER_APPEARANCE)
                  }
                  className="text-[9px] text-[#c4ab7d] hover:text-amber-300 underline"
                >
                  Restaurar Padrão
                </button>
              </div>

              {/* Gender Toggle Row */}
              <div className="grid grid-cols-2 gap-1.5">
                {GENDERS.map((g) => {
                  const isSelected = (app.gender ?? 'masculino') === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() =>
                        engine.updatePlayerAppearance({ gender: g.id })
                      }
                      className={`py-1 px-2 text-[10px] font-bold flex items-center justify-center gap-1.5 ${
                        isSelected ? 'medieval-btn-gold' : 'medieval-btn-wood'
                      }`}
                    >
                      <span>{g.symbol}</span>
                      <span>{g.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category Tabs: Pele | Cabelos | Olhos */}
              <div className="grid grid-cols-3 gap-1.5 bg-[#120b07] p-1 border border-[#4a301e]">
                <button
                  onClick={() => setAppearanceCat('skin')}
                  className={`py-1.5 px-2 text-[10px] font-pixel font-bold transition-colors ${
                    appearanceCat === 'skin'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  Pele
                </button>
                <button
                  onClick={() => setAppearanceCat('hair')}
                  className={`py-1.5 px-2 text-[10px] font-pixel font-bold transition-colors ${
                    appearanceCat === 'hair'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  Cabelos
                </button>
                <button
                  onClick={() => setAppearanceCat('eyes')}
                  className={`py-1.5 px-2 text-[10px] font-pixel font-bold transition-colors ${
                    appearanceCat === 'eyes'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  Olhos
                </button>
              </div>

              {/* Inventory Container for Selected Category (Vertical Scroll) */}
              <div className="max-h-[305px] overflow-y-auto pr-1 space-y-2.5">
                {appearanceCat === 'skin' && (
                  <>
                    {/* Top Inventory Section: Marcas de Pele (1 selectable) */}
                    <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[9px] text-amber-400 uppercase">
                          Marcas de Pele (1 ativa)
                        </span>
                        <span className="text-[9px] text-[#c4ab7d]">
                          {SKIN_MARKS.find(
                            (m) => m.id === (app.skinMark || 'none')
                          )?.label || 'Sem Marcas'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {SKIN_MARKS.map((mark) => {
                          const isSelected =
                            (app.skinMark || 'none') === mark.id;
                          return (
                            <button
                              key={mark.id}
                              onClick={() =>
                                engine.updatePlayerAppearance({
                                  skinMark: mark.id,
                                })
                              }
                              title={`${mark.label} — ${mark.desc}`}
                              className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 transition-transform ${
                                isSelected
                                  ? 'mc-slot-active ring-1 ring-amber-400'
                                  : 'hover:border-[#8c6d46]'
                              }`}
                            >
                              <img
                                src={spriteAtlas.getSkinMarkPreviewUrl(
                                  mark.id,
                                  app.skinColor
                                )}
                                alt={mark.label}
                                className="w-7 h-7 pixelated"
                              />
                              <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                                {mark.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom Inventory Section: Tonalidades de Pele (1 selectable) */}
                    <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[9px] text-amber-400 uppercase">
                          Cor & Sub-tonalidades ({SKIN_TONES.length})
                        </span>
                        <span className="text-[9px] text-[#c4ab7d]">
                          {SKIN_TONES.find((t) => t.color === app.skinColor)
                            ?.label || 'Personalizada'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {SKIN_TONES.map((tone) => {
                          const isSelected = app.skinColor === tone.color;
                          return (
                            <button
                              key={tone.color}
                              onClick={() =>
                                engine.updatePlayerAppearance({
                                  skinColor: tone.color,
                                })
                              }
                              title={`${tone.label} (${tone.group})`}
                              className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 ${
                                isSelected
                                  ? 'mc-slot-active ring-1 ring-amber-400'
                                  : 'hover:border-[#8c6d46]'
                              }`}
                            >
                              <svg
                                viewBox="0 0 16 16"
                                className="w-6 h-6 pixelated shrink-0"
                              >
                                <rect
                                  x="1"
                                  y="1"
                                  width="14"
                                  height="14"
                                  fill="#0f172a"
                                />
                                <rect
                                  x="2"
                                  y="2"
                                  width="12"
                                  height="12"
                                  fill={tone.color}
                                />
                                <rect
                                  x="2"
                                  y="9"
                                  width="12"
                                  height="5"
                                  fill={tone.subTone}
                                />
                                <rect
                                  x="3"
                                  y="3"
                                  width="5"
                                  height="2"
                                  fill="#ffffff"
                                  fillOpacity="0.35"
                                />
                              </svg>
                              <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                                {tone.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {appearanceCat === 'hair' && (
                  <>
                    {/* Top Inventory Section: Tipos de Cabelo (1 selectable) */}
                    <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[9px] text-amber-400 uppercase">
                          Tipos de Cabelo ({HAIR_STYLES.length})
                        </span>
                        <span className="text-[9px] text-[#c4ab7d]">
                          {HAIR_STYLES.find((h) => h.id === app.hairStyle)
                            ?.label || 'Aventureiro'}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {HAIR_STYLES.map((st) => {
                          const isSelected = app.hairStyle === st.id;
                          return (
                            <button
                              key={st.id}
                              onClick={() =>
                                engine.updatePlayerAppearance({
                                  hairStyle: st.id,
                                })
                              }
                              title={st.label}
                              className={`mc-slot p-1 flex flex-col items-center justify-center gap-0.5 ${
                                isSelected
                                  ? 'mc-slot-active ring-1 ring-amber-400'
                                  : 'hover:border-[#8c6d46]'
                              }`}
                            >
                              <img
                                src={spriteAtlas.getHairStylePreviewUrl(
                                  st.id,
                                  app.hairColor,
                                  app.skinColor
                                )}
                                alt={st.label}
                                className="w-7 h-7 pixelated"
                              />
                              <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                                {st.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom Inventory Section: Cores & Sub-tonalidades de Cabelo */}
                    <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[9px] text-amber-400 uppercase">
                          Cores & Sub-tonalidades ({HAIR_COLORS.length})
                        </span>
                        <span className="text-[9px] text-[#c4ab7d]">
                          {HAIR_COLORS.find((hc) => hc.color === app.hairColor)
                            ?.label || 'Personalizada'}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {HAIR_COLORS.map((hc) => {
                          const isSelected = app.hairColor === hc.color;
                          return (
                            <button
                              key={hc.color}
                              onClick={() =>
                                engine.updatePlayerAppearance({
                                  hairColor: hc.color,
                                })
                              }
                              title={`${hc.label} (${hc.group})`}
                              className={`mc-slot p-1 flex flex-col items-center justify-center gap-0.5 ${
                                isSelected
                                  ? 'mc-slot-active ring-1 ring-amber-400'
                                  : 'hover:border-[#8c6d46]'
                              }`}
                            >
                              <svg
                                viewBox="0 0 16 16"
                                className="w-6 h-6 pixelated shrink-0"
                              >
                                <rect
                                  x="1"
                                  y="1"
                                  width="14"
                                  height="14"
                                  fill="#0f172a"
                                />
                                <rect
                                  x="2"
                                  y="2"
                                  width="12"
                                  height="12"
                                  fill={hc.color}
                                />
                                <rect
                                  x="2"
                                  y="9"
                                  width="12"
                                  height="5"
                                  fill={hc.subTone}
                                />
                                <rect
                                  x="3"
                                  y="3"
                                  width="8"
                                  height="2"
                                  fill="#ffffff"
                                  fillOpacity="0.28"
                                />
                              </svg>
                              <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                                {hc.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {appearanceCat === 'eyes' && (
                  <>
                    {/* Top Inventory Section: Tipos de Olhos (6 Variantes) */}
                    <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[9px] text-amber-400 uppercase">
                          Formatos de Olhos (6 Variantes)
                        </span>
                        <span className="text-[9px] text-[#c4ab7d]">
                          {EYE_STYLES.find(
                            (es) => es.id === (app.eyeStyle || 'classic')
                          )?.label || 'Clássico'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                        {EYE_STYLES.map((es) => {
                          const isSelected =
                            (app.eyeStyle || 'classic') === es.id;
                          return (
                            <button
                              key={es.id}
                              onClick={() =>
                                engine.updatePlayerAppearance({
                                  eyeStyle: es.id,
                                })
                              }
                              title={`${es.label} — ${es.desc}`}
                              className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 ${
                                isSelected
                                  ? 'mc-slot-active ring-1 ring-amber-400'
                                  : 'hover:border-[#8c6d46]'
                              }`}
                            >
                              <img
                                src={spriteAtlas.getEyeStylePreviewUrl(
                                  es.id,
                                  app.eyeColor,
                                  app.skinColor
                                )}
                                alt={es.label}
                                className="w-7 h-7 pixelated"
                              />
                              <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                                {es.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom Inventory Section: Cores & Sub-tonalidades dos Olhos */}
                    <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-pixel text-[9px] text-amber-400 uppercase">
                          Cores & Sub-tonalidades ({EYE_COLORS.length})
                        </span>
                        <span className="text-[9px] text-[#c4ab7d]">
                          {EYE_COLORS.find((ec) => ec.color === app.eyeColor)
                            ?.label || 'Personalizada'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {EYE_COLORS.map((ec) => {
                          const isSelected = app.eyeColor === ec.color;
                          return (
                            <button
                              key={ec.color}
                              onClick={() =>
                                engine.updatePlayerAppearance({
                                  eyeColor: ec.color,
                                })
                              }
                              title={`${ec.label} (${ec.group})`}
                              className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 ${
                                isSelected
                                  ? 'mc-slot-active ring-1 ring-amber-400'
                                  : 'hover:border-[#8c6d46]'
                              }`}
                            >
                              <svg
                                viewBox="0 0 16 16"
                                className="w-6 h-6 pixelated shrink-0"
                              >
                                <rect
                                  x="1"
                                  y="1"
                                  width="14"
                                  height="14"
                                  fill="#0f172a"
                                />
                                <rect
                                  x="2"
                                  y="2"
                                  width="12"
                                  height="12"
                                  fill={ec.color}
                                />
                                <rect
                                  x="4"
                                  y="8"
                                  width="8"
                                  height="5"
                                  fill={ec.subTone}
                                />
                                <rect
                                  x="5"
                                  y="5"
                                  width="4"
                                  height="4"
                                  fill="#020617"
                                />
                                <rect
                                  x="3"
                                  y="3"
                                  width="3"
                                  height="3"
                                  fill="#ffffff"
                                />
                              </svg>
                              <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                                {ec.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'stats' ? (
          /* TAB 2: ATTRIBUTES */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2.5">
            <div className="medieval-inset p-2 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Nível</div>
                <div className="font-pixel text-[11px] text-amber-400 font-bold">
                  NV.{player.level} ({player.xp}/{player.xpToNext})
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Ouro</div>
                <div className="font-mono-tabular text-[11px] text-amber-300 font-bold flex items-center justify-center gap-1">
                  <img
                    src={spriteAtlas.getItemIconUrl('gold_coin')}
                    alt="Ouro"
                    className="w-3.5 h-3.5 pixelated"
                  />
                  <span>{player.goldCoins ?? 0}</span>
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Ataque</div>
                <div className="font-mono-tabular text-[11px] text-rose-400 font-bold">
                  {statusBaseAttack} ATQ
                  {heldItem?.attackDamage
                    ? ` (${totalAttack} Arma)`
                    : ''}
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Vel. ATK</div>
                <div className="font-mono-tabular text-[11px] text-yellow-300 font-bold">
                  {attackCooldownSec.toFixed(2)}s
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Defesa</div>
                <div className="font-mono-tabular text-[11px] text-sky-300 font-bold">
                  -{totalDefPct}%
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Pontos</div>
                <div className="font-pixel text-[11px] text-emerald-400 font-bold">
                  {player.attributePoints} PTS
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attributesList.map((attr) => (
                <div
                  key={attr.key}
                  className="medieval-inset p-2.5 flex items-center justify-between gap-2.5"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {attr.icon}
                      <span className="font-pixel text-[11px] font-bold text-white truncate">
                        {attr.name}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-amber-400 font-bold">
                        Nv.{player.attributes[attr.key] ?? 0}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#e5d5b5] truncate">
                      {attr.desc} ({attr.bonusText})
                    </p>
                  </div>

                  <button
                    disabled={player.attributePoints <= 0}
                    onClick={() => engine.upgradeAttribute(attr.key)}
                    className={`min-h-[36px] min-w-[36px] flex items-center justify-center shrink-0 ${
                      player.attributePoints > 0
                        ? 'medieval-btn-gold'
                        : 'medieval-btn-wood opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* TAB 3: PETS */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2.5">
            <div className="medieval-inset p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1.5 border-b border-[#3d281a] pb-1.5 flex-wrap">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  SEUS COMPANHEIROS ({tamedAnimals.length})
                </h3>
                {tamedAnimals.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => engine.setAllTamedAnimalsState('stay')}
                      className="px-2 py-0.5 medieval-btn-wood text-[9px] font-bold"
                    >
                      Base
                    </button>
                    <button
                      onClick={() => engine.setAllTamedAnimalsState('follow')}
                      className="px-2 py-0.5 medieval-btn-emerald text-[9px] font-bold"
                    >
                      Seguindo
                    </button>
                    <button
                      onClick={() => engine.setAllTamedAnimalsState('graze')}
                      className="px-2 py-0.5 medieval-btn-gold text-[9px] font-bold"
                    >
                      Pastar
                    </button>
                  </div>
                )}
              </div>

              {tamedAnimals.length === 0 ? (
                <div className="mc-slot p-5 text-center space-y-1">
                  <p className="text-xs font-bold text-white">
                    Nenhum pet domesticado
                  </p>
                  <p className="text-[10px] text-[#c4ab7d]">
                    Toque no botão ? no topo para ver a comida favorita de cada animal.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-0.5">
                  {tamedAnimals.map((pet) => {
                    const isMountableSpecies =
                      pet.kind === CreatureKind.HORSE ||
                      pet.kind === CreatureKind.CAMEL;
                    const hasSaddleInBag = player.inventory.some(
                      (s) => s !== null && s.itemId === 'saddle' && s.count > 0
                    );
                    const isCurrentlyMounted =
                      player.mountedEntityId === pet.id;
                    const currentPetState: 'stay' | 'follow' | 'graze' =
                      pet.aiState === 'stay'
                        ? 'stay'
                        : pet.aiState === 'graze'
                        ? 'graze'
                        : 'follow';

                    return (
                      <div
                        key={pet.id}
                        className="mc-slot p-2 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-rose-400 text-xs">♥</span>
                              <span className="font-pixel text-[11px] font-bold text-white truncate">
                                {pet.name}
                              </span>
                              <span className="text-[10px] font-mono-tabular text-emerald-400">
                                {Math.round(pet.hp)}/{pet.maxHp}
                              </span>
                              {pet.hasSaddle && (
                                <span className="px-1 py-0.2 rounded bg-amber-950/90 border border-amber-500/60 text-[8px] font-bold text-amber-300">
                                  Selado
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] text-[#c4ab7d] truncate">
                              {petBonusDescription(pet)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isMountableSpecies && !pet.hasSaddle && (
                              <button
                                disabled={!hasSaddleInBag}
                                onClick={() =>
                                  engine.equipSaddleOnCreature(pet.id)
                                }
                                className={`min-h-[28px] px-2 text-[9px] font-bold ${
                                  hasSaddleInBag
                                    ? 'medieval-btn-gold'
                                    : 'medieval-btn-wood opacity-45 cursor-not-allowed'
                                }`}
                              >
                                Selar
                              </button>
                            )}

                            {isMountableSpecies && pet.hasSaddle && (
                              <button
                                onClick={() => {
                                  if (isCurrentlyMounted) {
                                    engine.dismountCreature();
                                  } else {
                                    engine.mountCreature(pet.id);
                                    onClose();
                                  }
                                }}
                                className="min-h-[28px] px-2 text-[9px] font-bold medieval-btn-gold"
                              >
                                {isCurrentlyMounted ? 'Sair' : 'Montar'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 3-State Selector: Base | Seguindo | Pastar */}
                        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[#3d281a]/70">
                          <button
                            onClick={() =>
                              engine.setTamedAnimalState(pet.id, 'stay')
                            }
                            className={`min-h-[26px] text-[9px] font-bold ${
                              currentPetState === 'stay'
                                ? 'medieval-btn-gold'
                                : 'medieval-btn-wood opacity-75'
                            }`}
                          >
                            Base
                          </button>
                          <button
                            onClick={() =>
                              engine.setTamedAnimalState(pet.id, 'follow')
                            }
                            className={`min-h-[26px] text-[9px] font-bold ${
                              currentPetState === 'follow'
                                ? 'medieval-btn-emerald'
                                : 'medieval-btn-wood opacity-75'
                            }`}
                          >
                            Seguindo
                          </button>
                          <button
                            onClick={() =>
                              engine.setTamedAnimalState(pet.id, 'graze')
                            }
                            className={`min-h-[26px] text-[9px] font-bold ${
                              currentPetState === 'graze'
                                ? 'medieval-btn-gold'
                                : 'medieval-btn-wood opacity-75'
                            }`}
                          >
                            Pastar
                          </button>
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

      {showHelp && (
        <WindowHelpModal
          title="Ajuda — Herói, Atributos & Pets"
          subtitle="Como equipar armaduras, evoluir atributos e comandar seus aliados"
          onClose={() => setShowHelp(false)}
          sections={[
            {
              title: '1. Trajes & Aparência Universal',
              body: 'A aparência do seu personagem é universal para todos os seus mundos. Equipe peças de Cabeça, Superior, Inferior e Pés para reduzir o dano recebido e ganhar velocidade.',
            },
            {
              title: '2. Atributos RPG (Nv. 0+)',
              body: 'Ao subir de nível você ganha Pontos de Atributo para evoluir Vitalidade (+Vida), Força (+Dano/Coleta, iniciando com 4 de ATQ no Nv. 0), Vel. ATK (+Velocidade de Ataque/Quebra), Defesa (+Redução de Dano), Agilidade (+Velocidade de Movimento) ou Sobrevivência (-Fome/+Drop).',
            },
            {
              title: '3. Estados dos Pets (Base, Seguindo e Pastar)',
              body: 'Base: o pet fica parado no local. Seguindo: acompanha você como aliado de combate (ataca quem você atacar ou quem atacar você, focando em 1 inimigo por vez, e recua se você se afastar da área de batalha). Pastar: anda livremente pelo terreno mantendo-se domesticado.',
            },
            {
              title: '4. Sela & Posse Exclusiva',
              body: 'Cada pet pertence unicamente ao jogador que o domesticou. Cavalos e Camelos selados têm 1 único assento e um Alforje de 8 slots.',
            },
          ]}
        />
      )}
    </div>
  );
};

interface AccountAppearanceModalProps {
  onClose: () => void;
  onAppearanceSaved?: (updated: PlayerAppearance) => void;
}

export const AccountAppearanceModal: React.FC<AccountAppearanceModalProps> = ({
  onClose,
  onAppearanceSaved,
}) => {
  const [app, setApp] = useState<PlayerAppearance>(() =>
    SaveManager.getAccountAppearance()
  );
  const [appearanceCat, setAppearanceCat] = useState<'skin' | 'hair' | 'eyes'>(
    'skin'
  );
  const [previewDir, setPreviewDir] = useState<Direction>('down');

  const updateAccountAppearance = (partial: Partial<PlayerAppearance>) => {
    const updated = SaveManager.saveAccountAppearance(partial);
    setApp({ ...updated });
    onAppearanceSaved?.(updated);
  };

  const previewPlayerState = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    hunger: 100,
    maxHunger: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    attributePoints: 0,
    attributes: {
      vitality: 0,
      strength: 0,
      agility: 0,
      survival: 0,
      attackSpeed: 0,
      defense: 0,
    },
    equippedArmorId: 'white_tank_top',
    equippedBySlot: {
      head: null,
      body: 'white_tank_top',
      legs: 'brown_shorts',
      feet: null,
    },
    equippedColorsBySlot: {
      head: null,
      body: 'white',
      legs: 'brown',
      feet: null,
    },
    appearance: app,
    goldCoins: 0,
    direction: previewDir,
    isMoving: false,
    animFrame: 0,
    animTimer: 0,
    selectedHotbarIndex: 0,
    inventory: [],
    swingTimer: 0,
    swingDuration: 0.25,
    hitFlashTimer: 0,
  } as unknown as PlayerState;

  const playerPreviewUrl = (() => {
    const c = spriteAtlas.getPlayerSprite(previewDir, 0, previewPlayerState);
    return c.toDataURL();
  })();

  const cyclePreviewDir = () => {
    const order: Direction[] = ['down', 'right', 'up', 'left'];
    const idx = order.indexOf(previewDir);
    setPreviewDir(order[(idx + 1) % order.length]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl medieval-panel flex flex-col max-h-[94dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="font-pixel text-xs font-bold text-amber-400 uppercase">
                Aparência do Personagem
              </h2>
              <p className="text-[10px] text-[#c4ab7d]">
                Aparência universal da sua conta para todos os mundos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
          {/* Preview Column */}
          <div className="sm:col-span-4 medieval-inset p-3 flex flex-col items-center justify-center gap-2.5">
            <span className="px-2 py-0.5 bg-[#2a1b10] border border-[#6e4930] text-[10px] font-bold text-amber-300 rounded">
              {(app.gender ?? 'masculino') === 'feminino'
                ? '♀ Feminino'
                : '♂ Masculino'}
            </span>
            <div className="w-28 h-28 bg-[#120b07] border-2 border-[#6e4930] flex items-center justify-center relative shadow-inner">
              <img
                src={playerPreviewUrl}
                alt="Herói"
                className="w-24 h-24 pixelated"
              />
            </div>
            <button
              onClick={cyclePreviewDir}
              className="w-full py-1.5 medieval-btn-wood text-[10px] font-bold flex items-center justify-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5 text-amber-300" />
              <span>Girar Direção</span>
            </button>
            <button
              onClick={() => updateAccountAppearance(DEFAULT_PLAYER_APPEARANCE)}
              className="text-[10px] text-[#c4ab7d] hover:text-amber-300 underline pt-1"
            >
              Restaurar Padrão
            </button>
          </div>

          {/* Customization Controls Column */}
          <div className="sm:col-span-8 medieval-inset p-2.5 flex flex-col gap-2">
            {/* Gender Toggle Row */}
            <div className="grid grid-cols-2 gap-1.5">
              {GENDERS.map((g) => {
                const isSelected = (app.gender ?? 'masculino') === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => updateAccountAppearance({ gender: g.id })}
                    className={`py-1.5 px-2 text-[10px] font-bold flex items-center justify-center gap-1.5 ${
                      isSelected ? 'medieval-btn-gold' : 'medieval-btn-wood'
                    }`}
                  >
                    <span>{g.symbol}</span>
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Tabs: Pele | Cabelos | Olhos */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#120b07] p-1 border border-[#4a301e]">
              <button
                onClick={() => setAppearanceCat('skin')}
                className={`py-1.5 px-2 text-[10px] font-pixel font-bold transition-colors ${
                  appearanceCat === 'skin'
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood'
                }`}
              >
                Pele
              </button>
              <button
                onClick={() => setAppearanceCat('hair')}
                className={`py-1.5 px-2 text-[10px] font-pixel font-bold transition-colors ${
                  appearanceCat === 'hair'
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood'
                }`}
              >
                Cabelos
              </button>
              <button
                onClick={() => setAppearanceCat('eyes')}
                className={`py-1.5 px-2 text-[10px] font-pixel font-bold transition-colors ${
                  appearanceCat === 'eyes'
                    ? 'medieval-btn-gold'
                    : 'medieval-btn-wood'
                }`}
              >
                Olhos
              </button>
            </div>

            <div className="max-h-[305px] overflow-y-auto pr-1 space-y-2.5">
              {appearanceCat === 'skin' && (
                <>
                  <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[9px] text-amber-400 uppercase">
                        Marcas de Pele (1 ativa)
                      </span>
                      <span className="text-[9px] text-[#c4ab7d]">
                        {SKIN_MARKS.find(
                          (m) => m.id === (app.skinMark || 'none')
                        )?.label || 'Sem Marcas'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {SKIN_MARKS.map((mark) => {
                        const isSelected = (app.skinMark || 'none') === mark.id;
                        return (
                          <button
                            key={mark.id}
                            onClick={() =>
                              updateAccountAppearance({ skinMark: mark.id })
                            }
                            title={`${mark.label} — ${mark.desc}`}
                            className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 transition-transform ${
                              isSelected
                                ? 'mc-slot-active ring-1 ring-amber-400'
                                : 'hover:border-[#8c6d46]'
                            }`}
                          >
                            <img
                              src={spriteAtlas.getSkinMarkPreviewUrl(
                                mark.id,
                                app.skinColor
                              )}
                              alt={mark.label}
                              className="w-7 h-7 pixelated"
                            />
                            <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                              {mark.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[9px] text-amber-400 uppercase">
                        Cor & Sub-tonalidades ({SKIN_TONES.length})
                      </span>
                      <span className="text-[9px] text-[#c4ab7d]">
                        {SKIN_TONES.find((t) => t.color === app.skinColor)
                          ?.label || 'Personalizada'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {SKIN_TONES.map((tone) => {
                        const isSelected = app.skinColor === tone.color;
                        return (
                          <button
                            key={tone.color}
                            onClick={() =>
                              updateAccountAppearance({ skinColor: tone.color })
                            }
                            title={`${tone.label} (${tone.group})`}
                            className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 ${
                              isSelected
                                ? 'mc-slot-active ring-1 ring-amber-400'
                                : 'hover:border-[#8c6d46]'
                            }`}
                          >
                            <svg
                              viewBox="0 0 16 16"
                              className="w-6 h-6 pixelated shrink-0"
                            >
                              <rect
                                x="1"
                                y="1"
                                width="14"
                                height="14"
                                fill="#0f172a"
                              />
                              <rect
                                x="2"
                                y="2"
                                width="12"
                                height="12"
                                fill={tone.color}
                              />
                              <rect
                                x="2"
                                y="9"
                                width="12"
                                height="5"
                                fill={tone.subTone}
                              />
                              <rect
                                x="3"
                                y="3"
                                width="5"
                                height="2"
                                fill="#ffffff"
                                fillOpacity="0.35"
                              />
                            </svg>
                            <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                              {tone.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {appearanceCat === 'hair' && (
                <>
                  <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[9px] text-amber-400 uppercase">
                        Tipos de Cabelo ({HAIR_STYLES.length})
                      </span>
                      <span className="text-[9px] text-[#c4ab7d]">
                        {HAIR_STYLES.find((h) => h.id === app.hairStyle)
                          ?.label || 'Aventureiro'}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {HAIR_STYLES.map((st) => {
                        const isSelected = app.hairStyle === st.id;
                        return (
                          <button
                            key={st.id}
                            onClick={() =>
                              updateAccountAppearance({ hairStyle: st.id })
                            }
                            title={st.label}
                            className={`mc-slot p-1 flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'mc-slot-active ring-1 ring-amber-400'
                                : 'hover:border-[#8c6d46]'
                            }`}
                          >
                            <img
                              src={spriteAtlas.getHairStylePreviewUrl(
                                st.id,
                                app.hairColor,
                                app.skinColor
                              )}
                              alt={st.label}
                              className="w-7 h-7 pixelated"
                            />
                            <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                              {st.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[9px] text-amber-400 uppercase">
                        Cores & Sub-tonalidades ({HAIR_COLORS.length})
                      </span>
                      <span className="text-[9px] text-[#c4ab7d]">
                        {HAIR_COLORS.find((hc) => hc.color === app.hairColor)
                          ?.label || 'Personalizada'}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {HAIR_COLORS.map((hc) => {
                        const isSelected = app.hairColor === hc.color;
                        return (
                          <button
                            key={hc.color}
                            onClick={() =>
                              updateAccountAppearance({ hairColor: hc.color })
                            }
                            title={`${hc.label} (${hc.group})`}
                            className={`mc-slot p-1 flex flex-col items-center justify-center gap-0.5 ${
                              isSelected
                                ? 'mc-slot-active ring-1 ring-amber-400'
                                : 'hover:border-[#8c6d46]'
                            }`}
                          >
                            <svg
                              viewBox="0 0 16 16"
                              className="w-6 h-6 pixelated shrink-0"
                            >
                              <rect
                                x="1"
                                y="1"
                                width="14"
                                height="14"
                                fill="#0f172a"
                              />
                              <rect
                                x="2"
                                y="2"
                                width="12"
                                height="12"
                                fill={hc.color}
                              />
                              <rect
                                x="2"
                                y="9"
                                width="12"
                                height="5"
                                fill={hc.subTone}
                              />
                              <rect
                                x="3"
                                y="3"
                                width="8"
                                height="2"
                                fill="#ffffff"
                                fillOpacity="0.28"
                              />
                            </svg>
                            <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                              {hc.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {appearanceCat === 'eyes' && (
                <>
                  <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[9px] text-amber-400 uppercase">
                        Formatos de Olhos (6 Variantes)
                      </span>
                      <span className="text-[9px] text-[#c4ab7d]">
                        {EYE_STYLES.find(
                          (es) => es.id === (app.eyeStyle || 'classic')
                        )?.label || 'Clássico'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {EYE_STYLES.map((es) => {
                        const isSelected =
                          (app.eyeStyle || 'classic') === es.id;
                        return (
                          <button
                            key={es.id}
                            onClick={() =>
                              updateAccountAppearance({ eyeStyle: es.id })
                            }
                            title={`${es.label} — ${es.desc}`}
                            className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 ${
                              isSelected
                                ? 'mc-slot-active ring-1 ring-amber-400'
                                : 'hover:border-[#8c6d46]'
                            }`}
                          >
                            <img
                              src={spriteAtlas.getEyeStylePreviewUrl(
                                es.id,
                                app.eyeColor,
                                app.skinColor
                              )}
                              alt={es.label}
                              className="w-7 h-7 pixelated"
                            />
                            <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                              {es.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-[#120b07] p-2 border border-[#4a301e] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[9px] text-amber-400 uppercase">
                        Cores & Sub-tonalidades ({EYE_COLORS.length})
                      </span>
                      <span className="text-[9px] text-[#c4ab7d]">
                        {EYE_COLORS.find((ec) => ec.color === app.eyeColor)
                          ?.label || 'Personalizada'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {EYE_COLORS.map((ec) => {
                        const isSelected = app.eyeColor === ec.color;
                        return (
                          <button
                            key={ec.color}
                            onClick={() =>
                              updateAccountAppearance({ eyeColor: ec.color })
                            }
                            title={`${ec.label} (${ec.group})`}
                            className={`mc-slot p-1.5 flex flex-col items-center justify-center gap-1 ${
                              isSelected
                                ? 'mc-slot-active ring-1 ring-amber-400'
                                : 'hover:border-[#8c6d46]'
                            }`}
                          >
                            <svg
                              viewBox="0 0 16 16"
                              className="w-6 h-6 pixelated shrink-0"
                            >
                              <rect
                                x="1"
                                y="1"
                                width="14"
                                height="14"
                                fill="#0f172a"
                              />
                              <rect
                                x="2"
                                y="2"
                                width="12"
                                height="12"
                                fill={ec.color}
                              />
                              <rect
                                x="4"
                                y="8"
                                width="8"
                                height="5"
                                fill={ec.subTone}
                              />
                              <rect
                                x="5"
                                y="5"
                                width="4"
                                height="4"
                                fill="#020617"
                              />
                              <rect
                                x="3"
                                y="3"
                                width="3"
                                height="3"
                                fill="#ffffff"
                              />
                            </svg>
                            <span className="text-[8px] font-bold text-[#e5d5b5] truncate w-full text-center">
                              {ec.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

