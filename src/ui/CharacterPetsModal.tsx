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
} from 'lucide-react';
import { ITEMS } from '../game/core/ItemRegistry';
import {
  CreatureEntity,
  CreatureKind,
  Direction,
  EquipmentSlot,
  HairStyleId,
  ItemCategory,
  PlayerAttributes,
  PlayerGender,
  PlayerState,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
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
    emptyHint: 'Túnica / Peitoral',
  },
  {
    slot: 'legs',
    label: 'Inferior',
    shortLabel: 'Inferior',
    emptyHint: 'Calça / Grevas',
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

const SKIN_TONES = [
  { label: 'Porcelana', color: '#ffedd5' },
  { label: 'Claro Rosado', color: '#fde68a' },
  { label: 'Pêssego Suave', color: '#fed7aa' },
  { label: 'Trigo Solar', color: '#fdba74' },
  { label: 'Amêndoa', color: '#e0ac69' },
  { label: 'Bronze Dourado', color: '#d97706' },
  { label: 'Canela', color: '#b45309' },
  { label: 'Castanho Médio', color: '#a16207' },
  { label: 'Cacau', color: '#78350f' },
  { label: 'Ébano Profundo', color: '#5c2d16' },
  { label: 'Cinza Élfico', color: '#94a3b8' },
  { label: 'Brisa Lunar', color: '#cbd5e1' },
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

const HAIR_COLORS = [
  { label: 'Castanho', color: '#451a03' },
  { label: 'Chocolate', color: '#78350f' },
  { label: 'Preto Corvo', color: '#0f172a' },
  { label: 'Loiro Solar', color: '#facc15' },
  { label: 'Loiro Platinado', color: '#fef08a' },
  { label: 'Ruivo Brasa', color: '#c2410c' },
  { label: 'Ruivo Carmim', color: '#991b1b' },
  { label: 'Prata Ancestral', color: '#e2e8f0' },
  { label: 'Cinza Lobo', color: '#64748b' },
  { label: 'Azul Astral', color: '#0284c7' },
  { label: 'Turquesa', color: '#0d9488' },
  { label: 'Verde Bosque', color: '#15803d' },
  { label: 'Violeta Místico', color: '#7e22ce' },
  { label: 'Rosa Sakura', color: '#db2777' },
];

const EYE_COLORS = [
  { label: 'Ônix', color: '#0f172a' },
  { label: 'Castanho Mel', color: '#78350f' },
  { label: 'Safira', color: '#0284c7' },
  { label: 'Gelo Celeste', color: '#38bdf8' },
  { label: 'Esmeralda', color: '#10b981' },
  { label: 'Jade', color: '#15803d' },
  { label: 'Âmbar', color: '#d97706' },
  { label: 'Ouro Solar', color: '#facc15' },
  { label: 'Ametista', color: '#9333ea' },
  { label: 'Rubi', color: '#e11d48' },
];

const SHIRT_COLORS = [
  { label: 'Azul Real', color: '#2563eb' },
  { label: 'Celeste', color: '#0284c7' },
  { label: 'Turquesa', color: '#0d9488' },
  { label: 'Verde Caçador', color: '#15803d' },
  { label: 'Verde Musgo', color: '#4d7c0f' },
  { label: 'Carmesim', color: '#b91c1c' },
  { label: 'Coral Brasa', color: '#ea580c' },
  { label: 'Ocre Couro', color: '#a16207' },
  { label: 'Dourado Nobre', color: '#ca8a04' },
  { label: 'Roxo Sombrio', color: '#6b21a8' },
  { label: 'Rosa Real', color: '#be185d' },
  { label: 'Carvão', color: '#334155' },
  { label: 'Marfim', color: '#e2e8f0' },
];

const PANTS_COLORS = [
  { label: 'Ardósia', color: '#334155' },
  { label: 'Noite Escura', color: '#0f172a' },
  { label: 'Marrom Terra', color: '#5c3416' },
  { label: 'Couro Curtido', color: '#78350f' },
  { label: 'Areia Escura', color: '#854d0e' },
  { label: 'Azul Noite', color: '#1e3a8a' },
  { label: 'Verde Musgo', color: '#14532d' },
  { label: 'Vinho Escuro', color: '#7f1d1d' },
  { label: 'Roxo Umbral', color: '#4c1d95' },
  { label: 'Cinza Pedra', color: '#57534e' },
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
      bonusText: `+${Math.round((player.attributes.strength - 1) * 12)}%`,
      icon: <Swords className="w-4 h-4 text-amber-400" />,
    },
    {
      key: 'agility',
      name: 'Agilidade',
      desc: '+6% Velocidade',
      bonusText: `+${Math.round((player.attributes.agility - 1) * 6)}%`,
      icon: <Wind className="w-4 h-4 text-sky-400" />,
    },
    {
      key: 'survival',
      name: 'Sobrevivência',
      desc: '-8% Fome / +10% Drop',
      bonusText: `+${Math.round((player.attributes.survival - 1) * 10)}%`,
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

  const heldSlot = player.inventory[player.selectedHotbarIndex];
  const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
  const strengthMult = 1 + (player.attributes.strength - 1) * 0.12;
  const totalAttack = Math.round((heldItem?.attackDamage || 8) * strengthMult);

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

            {/* RIGHT COLUMN (6 cols): Appearance */}
            <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  APARÊNCIA
                </h3>
                <button
                  onClick={() =>
                    engine.updatePlayerAppearance(DEFAULT_PLAYER_APPEARANCE)
                  }
                  className="text-[9px] text-[#c4ab7d] hover:text-amber-300 underline"
                >
                  Padrão
                </button>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#e5d5b5] font-bold block">
                  Gênero:
                </span>
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
                          isSelected
                            ? 'medieval-btn-gold'
                            : 'medieval-btn-wood'
                        }`}
                      >
                        <span>{g.symbol}</span>
                        <span>{g.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#e5d5b5] font-bold block">
                  Cabelo ({HAIR_STYLES.length} estilos):
                </span>
                <div className="grid grid-cols-5 gap-1">
                  {HAIR_STYLES.map((st) => (
                    <button
                      key={st.id}
                      onClick={() =>
                        engine.updatePlayerAppearance({ hairStyle: st.id })
                      }
                      className={`py-1 px-1 text-[9px] font-bold truncate ${
                        app.hairStyle === st.id
                          ? 'medieval-btn-gold'
                          : 'medieval-btn-wood'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#e5d5b5] font-bold block">
                  Pele:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SKIN_TONES.map((tone) => (
                    <button
                      key={tone.color}
                      onClick={() =>
                        engine.updatePlayerAppearance({ skinColor: tone.color })
                      }
                      title={tone.label}
                      className={`w-6 h-6 rounded border-2 ${
                        app.skinColor === tone.color
                          ? 'border-amber-400 scale-110'
                          : 'border-[#4a301e]'
                      }`}
                      style={{ backgroundColor: tone.color }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-[#e5d5b5] font-bold block">
                    Cor Cabelo:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {HAIR_COLORS.map((hc) => (
                      <button
                        key={hc.color}
                        onClick={() =>
                          engine.updatePlayerAppearance({ hairColor: hc.color })
                        }
                        title={hc.label}
                        className={`w-6 h-6 rounded border-2 ${
                          app.hairColor === hc.color
                            ? 'border-amber-400 scale-110'
                            : 'border-[#4a301e]'
                        }`}
                        style={{ backgroundColor: hc.color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-[#e5d5b5] font-bold block">
                    Olhos:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {EYE_COLORS.map((ec) => (
                      <button
                        key={ec.color}
                        onClick={() =>
                          engine.updatePlayerAppearance({ eyeColor: ec.color })
                        }
                        title={ec.label}
                        className={`w-6 h-6 rounded border-2 ${
                          app.eyeColor === ec.color
                            ? 'border-amber-400 scale-110'
                            : 'border-[#4a301e]'
                        }`}
                        style={{ backgroundColor: ec.color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#3d281a]">
                <div className="space-y-1">
                  <span className="text-[10px] text-[#e5d5b5] font-bold block">
                    Camisa:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SHIRT_COLORS.map((sc) => (
                      <button
                        key={sc.color}
                        onClick={() =>
                          engine.updatePlayerAppearance({
                            shirtColor: sc.color,
                          })
                        }
                        title={sc.label}
                        className={`w-6 h-6 rounded border-2 ${
                          app.shirtColor === sc.color
                            ? 'border-amber-400 scale-110'
                            : 'border-[#4a301e]'
                        }`}
                        style={{ backgroundColor: sc.color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-[#e5d5b5] font-bold block">
                    Calça:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PANTS_COLORS.map((pc) => (
                      <button
                        key={pc.color}
                        onClick={() =>
                          engine.updatePlayerAppearance({
                            pantsColor: pc.color,
                          })
                        }
                        title={pc.label}
                        className={`w-6 h-6 rounded border-2 ${
                          app.pantsColor === pc.color
                            ? 'border-amber-400 scale-110'
                            : 'border-[#4a301e]'
                        }`}
                        style={{ backgroundColor: pc.color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'stats' ? (
          /* TAB 2: ATTRIBUTES */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2.5">
            <div className="medieval-inset p-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
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
                  {totalAttack} ATQ
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Defesa</div>
                <div className="font-mono-tabular text-[11px] text-sky-300 font-bold">
                  -{totalDefPct}%
                </div>
              </div>
              <div className="mc-slot p-1.5 col-span-2 sm:col-span-1">
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
                        Nv.{player.attributes[attr.key]}
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
              title: '1. Trajes & Aparência (4 Slots)',
              body: 'Equipe peças de Cabeça, Superior, Inferior e Pés para reduzir o dano recebido e ganhar velocidade. Tudo altera o visual do seu personagem em tempo real.',
            },
            {
              title: '2. Atributos RPG',
              body: 'Ao subir de nível você ganha Pontos de Atributo para elevar Vitalidade (+Vida), Força (+Dano/Coleta), Agilidade (+Velocidade) ou Sobrevivência (-Fome/+Drop).',
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
