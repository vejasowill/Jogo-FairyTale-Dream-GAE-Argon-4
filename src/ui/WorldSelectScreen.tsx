import React, { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Edit3,
  FolderUp,
  Globe,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { GameSettings, WorldMetadata, WorldSaveData } from '../game/core/types';
import { MultiplayerManager } from '../game/network/MultiplayerManager';
import { SaveManager } from '../game/persistence/SaveManager';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';

interface WorldSelectScreenProps {
  settings: GameSettings;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onUpdateSettings: (s: GameSettings) => void;
  onStartWorld: (saveData: WorldSaveData) => void;
  onJoinOnlineWorld: (
    saveData: WorldSaveData,
    mpManager: MultiplayerManager
  ) => void;
}

const SEED_PRESETS = [
  { label: 'Vale dos Carvalhos', seed: '774120' },
  { label: 'Deserto de Hélio', seed: '902418' },
  { label: 'Arquipélago Abissal', seed: '318509' },
];

export const WorldSelectScreen: React.FC<WorldSelectScreenProps> = ({
  settings,
  isFullscreen,
  onToggleFullscreen,
  onUpdateSettings,
  onStartWorld,
  onJoinOnlineWorld,
}) => {
  const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDiff, setFilterDiff] = useState<
    'ALL' | 'normal' | 'survival' | 'hardcore'
  >('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWorld, setEditingWorld] = useState<WorldMetadata | null>(null);
  const [deletingWorldId, setDeletingWorldId] = useState<string | null>(null);
  const [showServerModal, setShowServerModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Online Join by Invite Code states
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [playerNameInput, setPlayerNameInput] = useState(
    settings.playerName || 'Viajante'
  );
  const [isJoiningOnline, setIsJoiningOnline] = useState(false);

  // Create / Edit Form states
  const [worldName, setWorldName] = useState('Fronteira Dourada');
  const [seedInput, setSeedInput] = useState(() =>
    String(Math.floor(Math.random() * 899999 + 100000))
  );
  const [difficulty, setDifficulty] = useState<'normal' | 'survival' | 'hardcore'>(
    'normal'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    spriteAtlas.ensureInitialized();
    const localList = SaveManager.listWorlds();
    setWorlds(localList);

    SaveManager.fetchWorldsFromServer(settings).then((merged) => {
      setWorlds(merged);
    });
  }, [settings]);

  const handleCreateWorld = (e: React.FormEvent) => {
    e.preventDefault();
    const newSave = SaveManager.createNewWorld(worldName, seedInput, difficulty);
    if (settings.serverSyncEnabled) {
      SaveManager.syncWorldToServer(newSave, settings);
    }
    setShowCreateModal(false);
    onStartWorld(newSave);
  };

  const handleLoadWorld = (id: string) => {
    const loaded = SaveManager.loadWorldLocal(id);
    if (loaded) {
      onStartWorld(loaded);
    } else {
      setStatusMessage('Não foi possível carregar este mundo.');
    }
  };

  const handleJoinByInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inviteCodeInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (cleanCode.length < 4) {
      setStatusMessage(
        'Digite um código de convite válido (ex: K7M4P2) de um mundo aberto.'
      );
      return;
    }

    const cleanName = (playerNameInput || 'Viajante').trim().slice(0, 18);
    if (cleanName !== settings.playerName) {
      onUpdateSettings({ ...settings, playerName: cleanName });
    }

    setIsJoiningOnline(true);
    setStatusMessage(
      `Conectando ao mundo com código ${cleanCode}... Aguardando resposta do anfitrião.`
    );

    const res = await MultiplayerManager.joinWorldByCode(
      cleanCode,
      cleanName,
      settings.customServerUrl,
      (progressText) => {
        setStatusMessage(progressText);
      }
    );

    setIsJoiningOnline(false);

    if (!res.ok || !res.manager || !res.worldSave) {
      setStatusMessage(
        res.error ||
          'Não foi possível entrar no mundo. Verifique se o jogador anfitrião está dentro do mundo e online.'
      );
      return;
    }

    setStatusMessage(null);
    onJoinOnlineWorld(res.worldSave, res.manager);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorld) return;
    SaveManager.updateWorldMetadata(editingWorld.id, worldName, difficulty);
    const updated = SaveManager.loadWorldLocal(editingWorld.id);
    if (updated && settings.serverSyncEnabled) {
      SaveManager.syncWorldToServer(updated, settings);
    }
    setWorlds(SaveManager.listWorlds());
    setEditingWorld(null);
    setStatusMessage('Crônica do mundo atualizada com sucesso.');
  };

  const handleConfirmDelete = (id: string) => {
    SaveManager.deleteWorld(id, settings);
    setWorlds(SaveManager.listWorlds());
    setDeletingWorldId(null);
    setStatusMessage('Mundo excluído permanentemente.');
  };

  const handleExportWorld = (id: string) => {
    const data = SaveManager.loadWorldLocal(id);
    if (data) {
      SaveManager.downloadWorldFile(data);
      setStatusMessage('Arquivo (.wildborn.json) baixado com sucesso.');
    }
  };

  const handleCopySeed = (seed: number) => {
    navigator.clipboard?.writeText(String(seed)).catch(() => {});
    setStatusMessage(`Semente ${seed} copiada para a área de transferência!`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const res = SaveManager.importWorldFromJson(raw);
      if (res.ok && res.world) {
        setWorlds(SaveManager.listWorlds());
        if (settings.serverSyncEnabled) {
          SaveManager.syncWorldToServer(res.world, settings);
        }
        setStatusMessage(
          `Mundo "${res.world.metadata.name}" importado (Compatível v1/v2)!`
        );
      } else {
        setStatusMessage(res.error || 'Falha ao importar arquivo.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openEditModal = (w: WorldMetadata) => {
    setEditingWorld(w);
    setWorldName(w.name);
    setDifficulty(w.difficulty);
  };

  const openNewWorldModal = () => {
    setWorldName(`Reino da Fronteira #${worlds.length + 1}`);
    setSeedInput(String(Math.floor(Math.random() * 899999 + 100000)));
    setDifficulty('normal');
    setShowCreateModal(true);
  };

  const formatTime = (timeOfDay: number) => {
    const h = Math.floor(timeOfDay) % 24;
    const m = Math.floor((timeOfDay % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const filteredWorlds = worlds.filter((w) => {
    if (filterDiff !== 'ALL' && w.difficulty !== filterDiff) return false;
    if (
      searchQuery.trim() &&
      !w.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !String(w.seed).includes(searchQuery.trim())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="h-dvh w-screen overflow-y-auto bg-[#120c08] text-[#f3e5c8] flex flex-col">
      {/* Compact Horizontal-Friendly Top Bar */}
      <header className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2 bg-[#1a110b] border-b-4 border-[#4a301e] sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 mc-slot-active flex items-center justify-center shrink-0">
            <img
              src={spriteAtlas.getItemIconUrl('astral_sword')}
              alt="Wildborn"
              className="w-6 h-6 pixelated"
            />
          </div>
          <div>
            <span className="font-pixel text-xs sm:text-base font-bold text-amber-400 block leading-none">
              WILDBORN: FRONTEIRA PIXEL
            </span>
            <span className="text-[10px] text-[#c4ab7d] hidden sm:inline">
              RPG 2D Mobile Horizontal · Sobrevivência & Mundo Aberto Procedural
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onTouchEnd={(e) => {
              e.stopPropagation();
              onToggleFullscreen();
            }}
            onClick={onToggleFullscreen}
            className={`min-h-[38px] px-2.5 py-1.5 ${
              isFullscreen ? 'medieval-btn-gold' : 'medieval-btn-wood'
            } text-xs font-bold flex items-center gap-1.5 whitespace-nowrap touch-manipulation`}
            title="Alternar Tela Cheia"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-[#1c1008]" />
            ) : (
              <Maximize2 className="w-4 h-4 text-amber-300" />
            )}
            <span>{isFullscreen ? 'Sair' : 'Tela Cheia'}</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[38px] px-2.5 py-1.5 medieval-btn-wood text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderUp className="w-4 h-4 text-amber-400" />
            <span>Importar Save</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />

          <button
            onClick={() => setShowServerModal(true)}
            className="min-h-[38px] px-2.5 py-1.5 medieval-btn-wood text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sliders className="w-4 h-4 text-sky-300" />
            <span className="hidden sm:inline">HUD & Servidor</span>
          </button>
        </div>
      </header>

      {/* Main Content — Compact Vertical Spacing for Horizontal Mobile */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5 flex flex-col gap-4">
        {/* Widescreen Medieval Hero Banner */}
        <section className="medieval-panel p-3.5 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2 text-[10px] text-amber-400 font-pixel">
              <span>CRÔNICAS DA FRONTEIRA</span>
              <span>·</span>
              <span>MODO HORIZONTAL MOBILE</span>
            </div>
            <h1 className="font-pixel text-sm sm:text-xl font-bold text-white leading-snug">
              Forje seu Destino em Terras Procedurais
            </h1>
            <p className="text-[11px] sm:text-xs text-[#e5d5b5] leading-relaxed">
              Explore Planícies, Desertos e Oceanos. Construa sua Bancada, Fornalha e Altar Solar, domestique animais e customize sua HUD e controles em tempo real.
            </p>
          </div>

          <button
            onClick={openNewWorldModal}
            className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>CRIAR NOVO MUNDO</span>
          </button>
        </section>

        {/* Online Multiplayer Join by Invite Code Section */}
        <section className="medieval-panel p-3.5 sm:p-4 border-2 border-emerald-500/40 bg-[#17120c]">
          <form
            onSubmit={handleJoinByInviteCode}
            className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                <h2 className="font-pixel text-xs sm:text-sm font-bold text-emerald-300">
                  JOGAR ONLINE · ENTRAR COM CÓDIGO DE CONVITE
                </h2>
              </div>
              <p className="text-[11px] text-[#c4ab7d] leading-snug">
                Digite o código de 6 letras do seu amigo (ele precisa estar <strong>dentro do mundo aberto e online</strong> para o convite funcionar):
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
              <div className="w-full sm:w-36">
                <label className="block text-[9px] text-[#c4ab7d] font-bold uppercase mb-0.5">
                  Seu Apelido
                </label>
                <input
                  type="text"
                  maxLength={18}
                  value={playerNameInput}
                  onChange={(e) => setPlayerNameInput(e.target.value)}
                  placeholder="Seu Nome"
                  className="w-full h-10 px-2.5 medieval-inset text-xs text-white font-bold focus:outline-none"
                />
              </div>

              <div className="w-full sm:w-36">
                <label className="block text-[9px] text-amber-300 font-bold uppercase mb-0.5">
                  Código do Convite
                </label>
                <input
                  type="text"
                  maxLength={8}
                  value={inviteCodeInput}
                  onChange={(e) =>
                    setInviteCodeInput(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                    )
                  }
                  placeholder="EX: K7M4P2"
                  className="w-full h-10 px-2.5 medieval-inset text-sm font-pixel tracking-widest text-amber-300 uppercase placeholder-[#6e5233] text-center focus:outline-none border border-amber-500/40"
                />
              </div>

              <div className="w-full sm:w-auto sm:pt-3.5">
                <button
                  type="submit"
                  disabled={isJoiningOnline}
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 medieval-btn-emerald font-pixel text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <Users className="w-4 h-4" />
                  <span>
                    {isJoiningOnline ? 'CONECTANDO...' : 'ENTRAR NO MUNDO'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {statusMessage && (
          <div className="medieval-panel px-3.5 py-2 flex items-center justify-between text-xs text-amber-300">
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="p-1 text-[#c4ab7d] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Worlds Filter & Search Bar */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
              MUNDOS SALVOS ({filteredWorlds.length})
            </h2>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative w-44 sm:w-52">
                <Search className="w-3.5 h-3.5 text-[#8c6d46] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar nome ou seed..."
                  className="w-full h-8 pl-8 pr-2.5 medieval-inset text-xs text-[#f3e5c8] placeholder-[#8c6d46] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'normal', label: 'Normal' },
                    { id: 'survival', label: 'Sobrev.' },
                    { id: 'hardcore', label: 'Hardcore' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterDiff(tab.id)}
                    className={`min-h-[32px] px-2 py-0.5 text-[10px] font-bold ${
                      filterDiff === tab.id
                        ? 'medieval-btn-gold'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredWorlds.length === 0 ? (
            <div className="medieval-panel p-6 text-center space-y-3">
              <Globe className="w-8 h-8 text-[#8c6d46] mx-auto" />
              <div className="space-y-1">
                <p className="font-pixel text-xs font-bold text-white">
                  Nenhum mundo encontrado
                </p>
                <p className="text-[11px] text-[#c4ab7d] max-w-md mx-auto">
                  Crie um novo mundo procedural ou importe um arquivo salvo (.wildborn.json).
                </p>
              </div>
              <button
                onClick={openNewWorldModal}
                className="min-h-[40px] px-4 py-2 medieval-btn-gold font-pixel text-xs font-bold inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Criar Primeiro Mundo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredWorlds.map((w) => (
                <div
                  key={w.id}
                  className="medieval-panel p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-pixel text-xs sm:text-sm font-bold text-white truncate">
                        {w.name}
                      </h3>
                      <span className="text-[11px] text-amber-400 font-pixel shrink-0">
                        NV.{w.playerLevel || 1}
                      </span>
                    </div>

                    <div className="medieval-inset p-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[#e5d5b5]">
                      <div className="flex items-center gap-1">
                        <span className="text-[#c4ab7d]">Seed:</span>
                        <span className="text-amber-300 font-bold">{w.seed}</span>
                        <button
                          onClick={() => handleCopySeed(w.seed)}
                          title="Copiar Seed"
                          className="p-0.5 text-[#c4ab7d] hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div>
                        Dia {w.dayCount} ({formatTime(w.timeOfDay)})
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#c4ab7d]">
                      <span
                        className={
                          w.difficulty === 'hardcore'
                            ? 'text-rose-400 font-bold'
                            : w.difficulty === 'survival'
                            ? 'text-amber-300 font-bold'
                            : 'text-emerald-400 font-bold'
                        }
                      >
                        Modo:{' '}
                        {w.difficulty === 'hardcore'
                          ? 'Hardcore'
                          : w.difficulty === 'survival'
                          ? 'Sobrevivência'
                          : 'Normal'}
                      </span>
                      <span>·</span>
                      <span>{w.exploredChunksCount || 1} Chunks Explorados</span>
                    </div>
                  </div>

                  {deletingWorldId === w.id ? (
                    <div className="pt-2 border-t border-[#4a301e] flex items-center justify-between gap-2">
                      <span className="text-xs text-rose-400 font-bold">
                        Apagar este mundo?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleConfirmDelete(w.id)}
                          className="min-h-[36px] px-2.5 py-1 medieval-btn-crimson text-xs font-bold"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setDeletingWorldId(null)}
                          className="min-h-[36px] px-2.5 py-1 medieval-btn-wood text-xs font-bold"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-[#4a301e] flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => handleLoadWorld(w.id)}
                        className="flex-1 min-h-[38px] px-3 py-1.5 medieval-btn-emerald font-pixel text-[11px] font-bold flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>JOGAR</span>
                      </button>

                      <button
                        onClick={() => openEditModal(w)}
                        title="Editar Nome ou Modo"
                        className="min-h-[38px] min-w-[38px] medieval-btn-wood flex items-center justify-center"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleExportWorld(w.id)}
                        title="Baixar Arquivo do Mundo (.json)"
                        className="min-h-[38px] min-w-[38px] medieval-btn-wood text-amber-300 flex items-center justify-center"
                      >
                        <Download className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setDeletingWorldId(w.id)}
                        title="Excluir Mundo"
                        className="min-h-[38px] min-w-[38px] medieval-btn-crimson flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Create World Modal — Horizontal 2-Column on Landscape Mobile */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2">
          <form
            onSubmit={handleCreateWorld}
            className="w-full max-w-xl medieval-panel p-3.5 sm:p-5 space-y-3 max-h-[95dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#4a301e] pb-2">
              <h3 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
                CRIAR NOVO MUNDO PROCEDURAL
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#e5d5b5] mb-1">
                    Nome do Reino / Mundo
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={worldName}
                    onChange={(e) => setWorldName(e.target.value)}
                    className="w-full h-9 px-2.5 medieval-inset text-white text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#e5d5b5] mb-1">
                    Semente Procedural (Seed)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      placeholder="Ex: 849201"
                      className="flex-1 h-9 px-2.5 medieval-inset text-amber-300 text-xs font-mono-tabular focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSeedInput(
                          String(Math.floor(Math.random() * 899999 + 100000))
                        )
                      }
                      className="min-h-[36px] px-2.5 medieval-btn-wood text-amber-300 flex items-center gap-1 text-xs font-bold"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Girar</span>
                    </button>
                  </div>

                  {/* Preset Seeds */}
                  <div className="pt-1.5 flex flex-wrap items-center gap-1">
                    {SEED_PRESETS.map((p) => (
                      <button
                        type="button"
                        key={p.seed}
                        onClick={() => setSeedInput(p.seed)}
                        className="px-2 py-0.5 mc-slot text-[10px] text-amber-200 hover:text-white"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#e5d5b5] mb-1">
                  Dificuldade da Jornada
                </label>
                <div className="space-y-1.5">
                  {(
                    [
                      { id: 'normal', label: 'Normal', desc: 'Fome e combate equilibrados' },
                      {
                        id: 'survival',
                        label: 'Sobrevivência',
                        desc: 'Inimigos mais fortes e clima exigente',
                      },
                      { id: 'hardcore', label: 'Hardcore', desc: 'Morte única permanente' },
                    ] as const
                  ).map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setDifficulty(opt.id)}
                      className={`w-full p-2 text-left flex items-center justify-between ${
                        difficulty === opt.id ? 'mc-slot-active' : 'mc-slot'
                      }`}
                    >
                      <span className="text-xs font-bold text-white">
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-[#c4ab7d]">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 min-h-[38px] medieval-btn-wood text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[38px] medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>GERAR MUNDO</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit World Modal */}
      {editingWorld && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md medieval-panel p-4 space-y-3.5 max-h-[95dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#4a301e] pb-2">
              <h3 className="font-pixel text-sm font-bold text-amber-400">
                EDITAR MUNDO
              </h3>
              <button
                type="button"
                onClick={() => setEditingWorld(null)}
                className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#e5d5b5] mb-1">
                  Nome do Mundo
                </label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  className="w-full h-9 px-3 medieval-inset text-white text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#e5d5b5] mb-1">
                  Modo de Sobrevivência
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'normal', label: 'Normal' },
                      { id: 'survival', label: 'Sobrevivência' },
                      { id: 'hardcore', label: 'Hardcore' },
                    ] as const
                  ).map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setDifficulty(opt.id)}
                      className={`min-h-[38px] p-1.5 text-center text-xs font-bold ${
                        difficulty === opt.id ? 'mc-slot-active' : 'mc-slot'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setEditingWorld(null)}
                className="flex-1 min-h-[38px] medieval-btn-wood text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[38px] medieval-btn-gold font-pixel text-xs font-bold"
              >
                SALVAR
              </button>
            </div>
          </form>
        </div>
      )}

      {/* HUD Size & Server Config Modal */}
      {showServerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2">
          <div className="w-full max-w-lg medieval-panel p-4 space-y-3.5 max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#4a301e] pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <h3 className="font-pixel text-xs font-bold text-amber-400">
                  TAMANHO DA HUD & SERVIDOR
                </h3>
              </div>
              <button
                onClick={() => setShowServerModal(false)}
                className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* HUD Scale & Opacity */}
              <div className="medieval-inset p-3 space-y-2.5">
                <div className="font-pixel text-[10px] text-amber-400 font-bold">
                  ESCALA GLOBAL DA HUD
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#e5d5b5]">Tamanho da HUD</span>
                    <span className="font-mono-tabular text-amber-300 font-bold">
                      {Math.round((settings.hudScale || 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={1.35}
                    step={0.05}
                    value={settings.hudScale || 1}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        hudScale: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#e5d5b5]">Opacidade da HUD</span>
                    <span className="font-mono-tabular text-amber-300 font-bold">
                      {Math.round((settings.hudOpacity || 0.95) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.45}
                    max={1.0}
                    step={0.05}
                    value={settings.hudOpacity || 0.95}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        hudOpacity: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>
                <div className="space-y-1 pt-1 border-t border-[#3d281a]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#e5d5b5] font-bold">
                      Campo de Visão (Zoom da Câmera)
                    </span>
                    <span className="font-mono-tabular text-amber-300 font-bold">
                      {(settings.cameraZoom || 1.15).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.55}
                    max={2.5}
                    step={0.05}
                    value={settings.cameraZoom || 1.15}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        cameraZoom: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-[#c4ab7d]">
                    <span>0.55x (Área Muito Maior)</span>
                    <span>1.15x (Padrão)</span>
                    <span>2.50x (Perto)</span>
                  </div>
                </div>
                <p className="text-[10px] text-[#c4ab7d]">
                  Dentro do mundo, abra Pausa → Editor Manual de Controles para arrastar cada botão livremente.
                </p>
              </div>

              {/* Server Sync */}
              <div className="medieval-inset p-3 space-y-2.5">
                <div className="font-pixel text-[10px] text-amber-400 font-bold">
                  SINCRONIZAÇÃO DE SAVES
                </div>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-bold text-white">
                    Backup no Servidor (/api/worlds)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.serverSyncEnabled}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        serverSyncEnabled: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                </label>

                <div>
                  <label className="block text-[10px] font-bold text-[#c4ab7d] mb-1">
                    URL do Servidor (vazio = padrão)
                  </label>
                  <input
                    type="text"
                    value={settings.customServerUrl}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        customServerUrl: e.target.value,
                      })
                    }
                    placeholder="https://meu-servidor.com"
                    className="w-full h-8 px-2 mc-slot text-white text-[11px] font-mono-tabular focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowServerModal(false)}
              className="w-full min-h-[38px] medieval-btn-gold font-pixel text-xs font-bold"
            >
              CONCLUIR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
