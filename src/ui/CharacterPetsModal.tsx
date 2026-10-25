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
  PlayerState,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import {
  DEFAULT_PLAYER_APPEARANCE,
  spriteAtlas,
} from '../game/rendering/SpriteAtlas';

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
    emptyHint: 'Capuz, Elmo ou Diadema',
  },
  {
    slot: 'body',
    label: 'Parte Superior',
    shortLabel: 'Superior',
    emptyHint: 'Túnica, Couraça ou Peitoral',
  },
  {
    slot: 'legs',
    label: 'Parte Inferior',
    shortLabel: 'Inferior',
    emptyHint: 'Calças, Grevas ou Perneiras',
  },
  {
    slot: 'feet',
    label: 'Pés',
    shortLabel: 'Pés',
    emptyHint: 'Botas de Trilha, Ferro ou Astrais',
  },
];

const SKIN_TONES = [
  { label: 'Claro Rosado', color: '#fde68a' },
  { label: 'Trigo Solar', color: '#fdba74' },
  { label: 'Bronze Dourado', color: '#d97706' },
  { label: 'Castanho Médio', color: '#a16207' },
  { label: 'Ébano Profundo', color: '#5c2d16' },
  { label: 'Cinza Élfico', color: '#94a3b8' },
];

const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: 'adventurer', label: 'Aventureiro' },
  { id: 'warrior_crest', label: 'Crista Guerreira' },
  { id: 'long_mane', label: 'Crina Longa' },
  { id: 'braided', label: 'Tranças Reais' },
];

const HAIR_COLORS = [
  { label: 'Castanho', color: '#451a03' },
  { label: 'Preto Corvo', color: '#0f172a' },
  { label: 'Loiro Solar', color: '#facc15' },
  { label: 'Ruivo Brasa', color: '#c2410c' },
  { label: 'Prata Ancestral', color: '#e2e8f0' },
  { label: 'Azul Astral', color: '#0284c7' },
  { label: 'Verde Bosque', color: '#15803d' },
];

const EYE_COLORS = [
  { label: 'Ônix', color: '#0f172a' },
  { label: 'Safira', color: '#0284c7' },
  { label: 'Esmeralda', color: '#10b981' },
  { label: 'Âmbar', color: '#d97706' },
  { label: 'Rubi', color: '#e11d48' },
];

const SHIRT_COLORS = [
  { label: 'Azul Real', color: '#2563eb' },
  { label: 'Verde Caçador', color: '#15803d' },
  { label: 'Carmesim', color: '#b91c1c' },
  { label: 'Ocre Couro', color: '#a16207' },
  { label: 'Roxo Sombrio', color: '#6b21a8' },
  { label: 'Carvão', color: '#334155' },
];

const PANTS_COLORS = [
  { label: 'Ardósia', color: '#334155' },
  { label: 'Marrom Terra', color: '#5c3416' },
  { label: 'Azul Noite', color: '#1e3a8a' },
  { label: 'Verde Musgo', color: '#14532d' },
  { label: 'Vinho Escuro', color: '#7f1d1d' },
  { label: 'Areia Escura', color: '#854d0e' },
];

export const CharacterPetsModal: React.FC<CharacterPetsModalProps> = ({
  engine,
  player,
  tamedAnimals,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'stats' | 'pets'>('custom');
  const [previewDir, setPreviewDir] = useState<Direction>('down');
  const [selectedSlotFilter, setSelectedSlotFilter] = useState<EquipmentSlot | 'ALL'>('ALL');

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

  const playerPreviewUrl = (() => {
    const c = spriteAtlas.getPlayerSprite(previewDir, 0, player);
    return c.toDataURL();
  })();

  const cyclePreviewDir = () => {
    const order: Direction[] = ['down', 'right', 'up', 'left'];
    const idx = order.indexOf(previewDir);
    setPreviewDir(order[(idx + 1) % order.length]);
  };

  // Find all equippable armor items currently in the player's 32-slot inventory
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
      desc: '+18 Vida Máx. por ponto.',
      bonusText: `HP Máx: ${player.maxHp}`,
      icon: <Heart className="w-4 h-4 text-rose-400" />,
    },
    {
      key: 'strength',
      name: 'Força Bruta',
      desc: '+12% Dano e Coleta.',
      bonusText: `Bônus: +${Math.round((player.attributes.strength - 1) * 12)}%`,
      icon: <Swords className="w-4 h-4 text-amber-400" />,
    },
    {
      key: 'agility',
      name: 'Agilidade',
      desc: '+6% Velocidade e Golpe.',
      bonusText: `Bônus: +${Math.round((player.attributes.agility - 1) * 6)}%`,
      icon: <Wind className="w-4 h-4 text-sky-400" />,
    },
    {
      key: 'survival',
      name: 'Sobrevivência',
      desc: '-8% Fome e +10% Drop Extra.',
      bonusText: `Extra: +${Math.round((player.attributes.survival - 1) * 10)}%`,
      icon: <Shield className="w-4 h-4 text-emerald-400" />,
    },
  ];

  const petBonusDescription = (pet: CreatureEntity) => {
    switch (pet.kind) {
      case 'SHEEP':
        return 'Produz Lã Macia e regenera sua vida ao redor.';
      case 'BOAR':
        return 'Ataca Zumbis e Ogros próximos para defender você!';
      case 'HORSE':
        return pet.hasSaddle
          ? `Selado · Vel. Individual ${pet.mountSpeed || 148} · Fôlego ${
              pet.mountMaxStamina || 100
            } · Alforje 8 Slots`
          : `Sem Sela (Vel. ${pet.mountSpeed || 148}) — Equipe uma Sela para montar e ter 8 Slots!`;
      case 'CAMEL':
        return pet.hasSaddle
          ? `Selado · Vel. Individual ${pet.mountSpeed || 142} · Fôlego Maior ${
              pet.mountMaxStamina || 165
            } · Alforje 8 Slots`
          : `Sem Sela (Vel. ${pet.mountSpeed || 142}, Fôlego Maior) — Equipe uma Sela para montar e ter 8 Slots!`;
      default:
        return 'Companheiro fiel.';
    }
  };

  const tamingGuide = [
    {
      kind: CreatureKind.HORSE,
      name: 'Cavalo da Planície',
      foodId: 'apple',
      biome: 'Planície',
      perk: 'Montável com Sela · 8 Slots · Botão Cavalgar',
    },
    {
      kind: CreatureKind.CAMEL,
      name: 'Camelo do Deserto (Muito Raro)',
      foodId: 'cactus_fruit',
      biome: 'Deserto',
      perk: 'Montável com Sela · 8 Slots · Fôlego Maior (165)',
    },
    {
      kind: CreatureKind.SHEEP,
      name: 'Ovelha da Planície',
      foodId: 'berry',
      biome: 'Planície',
      perk: 'Lã Macia & Cura Passiva',
    },
    {
      kind: CreatureKind.BOAR,
      name: 'Javali Silvestre',
      foodId: 'apple',
      biome: 'Planície',
      perk: 'Guardião (14 Dano)',
    },
  ];

  const heldSlot = player.inventory[player.selectedHotbarIndex];
  const heldItem = heldSlot ? ITEMS[heldSlot.itemId] : null;
  const strengthMult = 1 + (player.attributes.strength - 1) * 0.12;
  const totalAttack = Math.round((heldItem?.attackDamage || 8) * strengthMult);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-1.5 sm:p-3">
      <div className="w-full max-w-4xl medieval-panel flex flex-col max-h-[96dvh] overflow-hidden">
        {/* Compact Horizontal-Friendly Top Bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('custom')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-pixel font-bold flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'custom' ? 'medieval-btn-gold' : 'medieval-btn-wood'
              }`}
            >
              <Palette className="w-3.5 h-3.5 text-amber-300" />
              <span>Trajes & Aparência (4 Slots)</span>
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-pixel font-bold flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'stats' ? 'medieval-btn-gold' : 'medieval-btn-wood'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Atributos RPG</span>
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

          <div className="flex items-center gap-2 shrink-0">
            <div
              title="Saldo de Moedas de Ouro do Personagem (não ocupa espaço na mochila)"
              className="flex items-center gap-1.5 px-2.5 py-1 mc-slot border-amber-500/50 bg-[#120b07]"
            >
              <img
                src={spriteAtlas.getItemIconUrl('gold_coin')}
                alt="Ouro"
                className="w-4 h-4 pixelated"
              />
              <span className="text-[10px] font-mono-tabular font-bold text-amber-300">
                {player.goldCoins ?? 0} Ouro
              </span>
            </div>
            <button
              onClick={onClose}
              className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: 4-SLOT EQUIPMENT (HEAD, BODY, LEGS, FEET) & CUSTOMIZATION  */}
        {/* ================================================================= */}
        {activeTab === 'custom' ? (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {/* LEFT COLUMN (6 cols): 4-Slot Equipment Paper-Doll + Quick Equip from Backpack */}
            <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  EQUIPAMENTOS DO HERÓI (4 ESPAÇOS)
                </h3>
                <div className="flex items-center gap-2 text-[10px] font-mono-tabular">
                  <span className="text-sky-300 font-bold">
                    DEF -{totalDefPct}%
                  </span>
                  {totalSpeedPct > 0 && (
                    <span className="text-emerald-400 font-bold">
                      VEL +{totalSpeedPct}%
                    </span>
                  )}
                </div>
              </div>

              {/* Paper-Doll + Live Pixel Character Preview */}
              <div className="grid grid-cols-12 gap-2 items-center bg-[#120b07] p-2.5 border border-[#4a301e]">
                {/* Live Rotatable Character Preview */}
                <div className="col-span-5 flex flex-col items-center justify-center gap-1.5 border-r border-[#3d281a] pr-2">
                  <div className="w-20 h-20 bg-[#1a110b] border-2 border-[#6e4930] flex items-center justify-center relative shadow-inner">
                    <img
                      src={playerPreviewUrl}
                      alt="Herói"
                      className="w-16 h-16 pixelated"
                    />
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-mono-tabular text-[#c4ab7d] uppercase">
                      {previewDir === 'down'
                        ? 'Frente'
                        : previewDir === 'up'
                        ? 'Costas'
                        : previewDir === 'left'
                        ? 'Esq.'
                        : 'Dir.'}
                    </span>
                  </div>
                  <button
                    onClick={cyclePreviewDir}
                    className="w-full py-1 medieval-btn-wood text-[9px] font-bold flex items-center justify-center gap-1"
                  >
                    <RotateCw className="w-3 h-3 text-amber-300" />
                    <span>Girar Herói</span>
                  </button>
                </div>

                {/* 4 Equipment Slots (Head, Upper, Lower, Feet) */}
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
                          <div className="w-8 h-8 bg-[#120b07] border border-[#4a301e] flex items-center justify-center shrink-0">
                            {itemDef ? (
                              <img
                                src={spriteAtlas.getItemIconUrl(itemDef.id)}
                                alt={itemDef.name}
                                className="w-6 h-6 pixelated"
                              />
                            ) : (
                              <Shield className="w-3.5 h-3.5 text-[#5c3d28]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-pixel text-amber-400 uppercase">
                                {meta.label}
                              </span>
                            </div>
                            {itemDef ? (
                              <div className="text-[10px] font-bold text-white truncate">
                                {itemDef.name}
                              </div>
                            ) : (
                              <div className="text-[9px] text-[#8c6d46] truncate">
                                {meta.emptyHint}
                              </div>
                            )}
                          </div>
                        </div>

                        {itemDef ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              engine.unequipArmorSlot(meta.slot);
                            }}
                            className="px-2 py-1 medieval-btn-crimson text-[9px] font-bold shrink-0"
                            title="Desequipar para a mochila"
                          >
                            Tirar
                          </button>
                        ) : (
                          <span className="text-[8px] text-[#8c6d46] pr-1">
                            Vazio
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick-Equip List of Armors in Player's Inventory */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-pixel text-[#c4ab7d]">
                    PEÇAS NA MOCHILA PARA EQUIPAR ({inventoryArmorItems.length})
                  </span>
                  {selectedSlotFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedSlotFilter('ALL')}
                      className="text-amber-400 underline text-[9px]"
                    >
                      Mostrar Todos Slots
                    </button>
                  )}
                </div>

                {inventoryArmorItems.length === 0 ? (
                  <div className="mc-slot p-2.5 text-center text-[10px] text-[#8c6d46]">
                    Nenhuma veste/armadura disponível na mochila para este espaço. Crie peças de Cabeça, Superior, Inferior e Pés na Bancada, Fornalha ou Altar Solar!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-[135px] overflow-y-auto pr-0.5">
                    {inventoryArmorItems.map(({ index, def }) => {
                      const slotName =
                        SLOT_META.find((s) => s.slot === (def.equipSlot || 'body'))
                          ?.label || 'Parte Superior';
                      return (
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
                                <span className="text-amber-300">[{slotName}]</span>
                                {def.defenseBonus && (
                                  <span className="text-sky-300">
                                    -{Math.round(def.defenseBonus * 100)}% Dano
                                  </span>
                                )}
                                {def.speedBonus && (
                                  <span className="text-emerald-400">
                                    +{Math.round(def.speedBonus * 100)}% Vel
                                  </span>
                                )}
                                {def.maxHpBonus && (
                                  <span className="text-rose-300">
                                    +{def.maxHpBonus} HP
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
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN (6 cols): Character Appearance Customization */}
            <div className="sm:col-span-6 medieval-inset p-2.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#3d281a] pb-1.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  CUSTOMIZAÇÃO VISUAL DO PERSONAGEM
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

              {/* 1. Hair Style */}
              <div className="space-y-1">
                <span className="text-[10px] text-[#e5d5b5] font-bold block">
                  Estilo de Cabelo:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                  {HAIR_STYLES.map((st) => (
                    <button
                      key={st.id}
                      onClick={() =>
                        engine.updatePlayerAppearance({ hairStyle: st.id })
                      }
                      className={`py-1 px-1.5 text-[9px] font-bold truncate ${
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

              {/* 2. Skin Tone */}
              <div className="space-y-1">
                <span className="text-[10px] text-[#e5d5b5] font-bold block">
                  Tom de Pele:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SKIN_TONES.map((tone) => (
                    <button
                      key={tone.color}
                      onClick={() =>
                        engine.updatePlayerAppearance({ skinColor: tone.color })
                      }
                      title={tone.label}
                      className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-transform ${
                        app.skinColor === tone.color
                          ? 'border-amber-400 scale-110 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                          : 'border-[#4a301e]'
                      }`}
                      style={{ backgroundColor: tone.color }}
                    />
                  ))}
                </div>
              </div>

              {/* 3. Hair Color & Eye Color */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-[#e5d5b5] font-bold block">
                    Cor do Cabelo:
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
                    Cor dos Olhos:
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

              {/* 4. Base Tunic & Base Pants Colors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[#3d281a]">
                <div className="space-y-1">
                  <span className="text-[10px] text-[#e5d5b5] font-bold block">
                    Veste Superior Base:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SHIRT_COLORS.map((sc) => (
                      <button
                        key={sc.color}
                        onClick={() =>
                          engine.updatePlayerAppearance({ shirtColor: sc.color })
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
                    Calça Base (Inferior):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PANTS_COLORS.map((pc) => (
                      <button
                        key={pc.color}
                        onClick={() =>
                          engine.updatePlayerAppearance({ pantsColor: pc.color })
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

              <div className="bg-[#120b07] p-2 border border-[#3d281a] text-[10px] text-[#c4ab7d] leading-snug">
                <strong className="text-amber-300">Como funciona:</strong> Sua
                aparência e cada peça equipada nos 4 slots (Cabeça, Superior,
                Inferior e Pés) alteram em tempo real o visual do seu personagem
                no mapa!
              </div>
            </div>
          </div>
        ) : activeTab === 'stats' ? (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2.5">
            {/* Hero Summary Banner */}
            <div className="medieval-inset p-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Nível & XP</div>
                <div className="font-pixel text-[11px] text-amber-400 font-bold">
                  NV.{player.level} ({player.xp}/{player.xpToNext})
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Moedas de Ouro</div>
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
                <div className="text-[9px] text-[#c4ab7d]">Dano Atual</div>
                <div className="font-mono-tabular text-[11px] text-rose-400 font-bold">
                  {totalAttack} ATQ
                </div>
              </div>
              <div className="mc-slot p-1.5">
                <div className="text-[9px] text-[#c4ab7d]">Defesa Total (4 Slots)</div>
                <div className="font-mono-tabular text-[11px] text-sky-300 font-bold truncate">
                  {totalDefPct > 0 ? `-${totalDefPct}% Dano` : '0% (Sem Armadura)'}
                </div>
              </div>
              <div className="mc-slot p-1.5 col-span-2 sm:col-span-1">
                <div className="text-[9px] text-[#c4ab7d]">Pontos Livres</div>
                <div className="font-pixel text-[11px] text-emerald-400 font-bold">
                  {player.attributePoints} PTS
                </div>
              </div>
            </div>

            {/* Attributes Upgrade 2x2 Grid for Horizontal Screens */}
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
                    <p className="text-[10px] text-[#e5d5b5] truncate">{attr.desc}</p>
                    <div className="text-[10px] font-mono-tabular text-emerald-400 font-bold">
                      {attr.bonusText}
                    </div>
                  </div>

                  <button
                    disabled={player.attributePoints <= 0}
                    onClick={() => engine.upgradeAttribute(attr.key)}
                    className={`min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0 ${
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
          /* TAB 3: PETS & TAMING GUIDE — Side-by-Side on Horizontal Mobile */
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            {/* Active Tamed Companions (Left 7 cols) */}
            <div className="sm:col-span-7 medieval-inset p-2.5 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[#3d281a] pb-1.5">
                <h3 className="font-pixel text-[10px] font-bold text-amber-400">
                  SEUS COMPANHEIROS ({tamedAnimals.length})
                </h3>
                {tamedAnimals.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => engine.setAllTamedAnimalsState('follow')}
                      className="px-2 py-0.5 medieval-btn-emerald text-[9px] font-bold"
                    >
                      Seguir
                    </button>
                    <button
                      onClick={() => engine.setAllTamedAnimalsState('stay')}
                      className="px-2 py-0.5 medieval-btn-wood text-[9px] font-bold"
                    >
                      Ficar Base
                    </button>
                  </div>
                )}
              </div>

              {tamedAnimals.length === 0 ? (
                <div className="mc-slot p-4 text-center space-y-1 my-auto">
                  <p className="text-xs font-bold text-white">
                    Nenhum animal domesticado ainda
                  </p>
                  <p className="text-[10px] text-[#c4ab7d]">
                    Chegue perto de Ovelha, Javali ou Camelo com a comida favorita ou Petisco e use o botão Interagir!
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
                  {tamedAnimals.map((pet) => {
                    const isMountableSpecies =
                      pet.kind === CreatureKind.HORSE ||
                      pet.kind === CreatureKind.CAMEL;
                    const hasSaddleInBag = player.inventory.some(
                      (s) => s !== null && s.itemId === 'saddle' && s.count > 0
                    );
                    const isCurrentlyMounted = player.mountedEntityId === pet.id;

                    return (
                      <div
                        key={pet.id}
                        className="mc-slot p-2 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-rose-400 text-xs">♥</span>
                              <span className="font-pixel text-[11px] font-bold text-white truncate">
                                {pet.name}
                              </span>
                              <span className="text-[10px] font-mono-tabular text-emerald-400">
                                {Math.round(pet.hp)}/{pet.maxHp}
                              </span>
                              {pet.hasSaddle && (
                                <span className="px-1 py-0.2 rounded bg-amber-950/90 border border-amber-500/60 text-[8px] font-bold text-amber-300">
                                  Selado (8 Slots)
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-[#c4ab7d] truncate">
                              {petBonusDescription(pet)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isMountableSpecies && !pet.hasSaddle && (
                              <button
                                disabled={!hasSaddleInBag}
                                onClick={() => engine.equipSaddleOnCreature(pet.id)}
                                className={`min-h-[32px] px-2 py-1 text-[9px] font-bold ${
                                  hasSaddleInBag
                                    ? 'medieval-btn-gold'
                                    : 'medieval-btn-wood opacity-45 cursor-not-allowed'
                                }`}
                                title="Requer 1x Sela de Montaria na mochila"
                              >
                                Equipar Sela
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
                                className="min-h-[32px] px-2.5 py-1 text-[9px] font-bold medieval-btn-gold"
                              >
                                {isCurrentlyMounted ? 'Desmontar' : 'Montar'}
                              </button>
                            )}

                            <button
                              onClick={() => engine.toggleTamedAnimalState(pet.id)}
                              className={`min-h-[32px] px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${
                                pet.aiState === 'follow'
                                  ? 'medieval-btn-emerald'
                                  : 'medieval-btn-wood'
                              }`}
                            >
                              {pet.aiState === 'follow' ? 'Seguindo' : 'Na Base'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Taming Encyclopedia (Right 5 cols) */}
            <div className="sm:col-span-5 medieval-inset p-2.5 space-y-2">
              <h3 className="font-pixel text-[10px] font-bold text-amber-400 border-b border-[#3d281a] pb-1.5">
                GUIA DE DOMESTICAÇÃO
              </h3>
              <div className="space-y-1.5">
                {tamingGuide.map((g) => (
                  <div key={g.kind} className="mc-slot p-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-white">
                        {g.name}
                      </span>
                      <span className="text-[9px] text-amber-300">
                        {g.biome}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#e5d5b5]">
                      <img
                        src={spriteAtlas.getItemIconUrl(g.foodId)}
                        alt=""
                        className="w-3.5 h-3.5 pixelated"
                      />
                      <span>Comida: {ITEMS[g.foodId]?.name}</span>
                    </div>
                    <div className="text-[9px] text-emerald-400 font-semibold">
                      {g.perk}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
