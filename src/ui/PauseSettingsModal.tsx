import React, { useState } from 'react';
import {
  Check,
  Download,
  LogOut,
  Maximize2,
  Minimize2,
  Move,
  Play,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import {
  FriendProfileEntry,
  GameSettings,
  OnlinePeerSummary,
} from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { firebaseCloudSync } from '../game/persistence/FirebaseCloudSync';
import { SaveManager } from '../game/persistence/SaveManager';

interface PauseSettingsModalProps {
  engine?: GameEngine | null;
  mode?: 'in_world' | 'global_only';
  settings: GameSettings;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenHudEditor: () => void;
  onOpenOnlineInvite?: () => void;
  onUpdateSettings: (s: GameSettings) => void;
  onResume: () => void;
  onExitToMenu?: () => void;
}

export const PauseSettingsModal: React.FC<PauseSettingsModalProps> = ({
  engine = null,
  mode = 'in_world',
  settings,
  isFullscreen,
  onToggleFullscreen,
  onOpenHudEditor,
  onOpenOnlineInvite,
  onUpdateSettings,
  onResume,
  onExitToMenu,
}) => {
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [onlineRuleWarning, setOnlineRuleWarning] = useState<string | null>(
    null
  );
  const [, setForceTick] = useState(0);
  const [friendsList, setFriendsList] = useState<FriendProfileEntry[]>(() =>
    SaveManager.getFriendsList()
  );
  const [addingPeerId, setAddingPeerId] = useState<string | null>(null);

  const isGlobalOnly = mode === 'global_only' || !engine;
  const myPublicId = SaveManager.getPlayerPublicId();
  const myUsername = SaveManager.getEffectiveUsername();

  const handleManualSave = async () => {
    if (!engine) return;
    setSaveFeedback('Salvando mundo...');
    await engine.saveGame(false);
    setSaveFeedback(`Salvo com segurança (${engine.lastSaveStatus})`);
  };

  const handleDownloadFile = () => {
    if (!engine) return;
    const saveData = engine.buildSaveData();
    SaveManager.saveWorldLocal(saveData);
    SaveManager.downloadWorldFile(saveData);
    setSaveFeedback('Arquivo de mundo baixado com sucesso!');
  };

  const handleSaveAndExit = () => {
    onExitToMenu?.();
  };

  const handleSetOnlineAvailability = (enabled: boolean) => {
    if (!engine) return;
    const res = engine.setWorldOnlineAvailability(enabled);
    if (!res.ok && res.message) {
      setOnlineRuleWarning(res.message);
    } else {
      setOnlineRuleWarning(null);
    }
    setForceTick((t) => t + 1);
  };

  const handleAddPeerInWorldAsFriend = async (peer: OnlinePeerSummary) => {
    const targetPublicId = (peer.playerPublicId || peer.peerId || '')
      .trim()
      .toUpperCase();
    if (!targetPublicId || targetPublicId === myPublicId) return;

    setAddingPeerId(peer.peerId);
    try {
      let updatedList: FriendProfileEntry[] | null = null;
      try {
        const res = await fetch('/api/social/friends/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            myPublicId,
            myUsername,
            targetPublicId,
            targetUsername: peer.name || 'Aventureiro',
          }),
        });
        const json = await res.json();
        if (res.ok && json?.ok && Array.isArray(json.friendsList)) {
          updatedList = json.friendsList;
        }
      } catch {
        // Fallback to local addition
      }

      if (!updatedList) {
        const current = SaveManager.getFriendsList();
        const exists = current.some((f) => f.playerPublicId === targetPublicId);
        updatedList = exists
          ? current
          : [
              ...current,
              {
                playerPublicId: targetPublicId,
                username: peer.name || 'Aventureiro',
                addedAt: Date.now(),
              },
            ];
      }

      SaveManager.setFriendsList(updatedList);
      setFriendsList(updatedList);
      void firebaseCloudSync.ensureUserProfileSynced(undefined, true);
      setSaveFeedback(`${peer.name} adicionado aos seus amigos!`);
    } finally {
      setAddingPeerId(null);
    }
  };

  const hudScale = settings.hudScale || 1.0;
  const hudOpacity = settings.hudOpacity || 0.96;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-3xl medieval-panel flex flex-col max-h-[94dvh] overflow-hidden">
        {/* Compact Widescreen Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a110b] border-b-2 border-[#4a301e]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-2 uppercase">
              <span>
                {isGlobalOnly
                  ? 'Opções Gerais do Jogo'
                  : 'Pausa, Controles & Configurações'}
              </span>
            </h2>
          </div>
          <button
            onClick={onResume}
            className="min-h-[36px] min-w-[36px] medieval-btn-crimson flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal-First 2-Column Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
          {/* LEFT COLUMN: HUD Size, Control Layout Editor, Camera Zoom & Audio */}
          <div
            className={`${
              isGlobalOnly ? 'sm:col-span-12' : 'sm:col-span-7'
            } space-y-2.5`}
          >
            {/* Highlighted Manual Control Position & Size Editor Launcher (In-World) */}
            {!isGlobalOnly && (
              <div className="medieval-inset p-3 border-2 border-amber-500/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-pixel text-xs font-bold text-amber-400">
                      EDIÇÃO MANUAL DE CONTROLES NA TELA
                    </div>
                    <div className="text-[11px] text-[#e5d5b5]">
                      Arraste e redimensione cada botão (Analógico, Atacar, Interagir, Colocar, Hotbar) livremente na tela horizontal.
                    </div>
                  </div>
                </div>
                <button
                  onClick={onOpenHudEditor}
                  className="w-full min-h-[42px] medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Move className="w-4 h-4" />
                  <span>ABRIR EDITOR MANUAL DE CONTROLES</span>
                </button>
              </div>
            )}

            {/* HUD Size & Opacity Sliders */}
            <div className="medieval-inset p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-bold text-white">
                    Tamanho Global da HUD
                  </span>
                </div>
                <span className="font-mono-tabular text-xs font-bold text-amber-400">
                  {Math.round(hudScale * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.7}
                  max={1.35}
                  step={0.05}
                  value={hudScale}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      hudScale: Number(e.target.value),
                    })
                  }
                  className="flex-1 accent-amber-500 h-4"
                />
                <button
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      hudScale: 1.0,
                      hudOpacity: 0.96,
                      controlLayout: SaveManager.getDefaultControlLayout(),
                    })
                  }
                  title="Resetar tamanho e posição da HUD"
                  className="px-2 py-1 medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Padrão</span>
                </button>
              </div>

              {/* Opacity Slider */}
              <div className="flex items-center justify-between pt-1 border-t border-[#3d281a]">
                <span className="text-[11px] text-[#c4ab7d]">
                  Opacidade / Transparência da HUD:
                </span>
                <span className="font-mono-tabular text-[11px] font-bold text-sky-300">
                  {Math.round(hudOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.45}
                max={1.0}
                step={0.05}
                value={hudOpacity}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    hudOpacity: Number(e.target.value),
                  })
                }
                className="w-full accent-sky-400 h-4"
              />
            </div>

            {/* Camera Field of View / Zoom & Sound Row */}
            <div className="space-y-2.5">
              {/* Camera Zoom / Field of View */}
              <div className="medieval-inset p-3 space-y-2 border border-amber-500/30">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-amber-300 block">
                      Campo de Visão / Distância da Câmera
                    </span>
                    <span className="text-[10px] text-[#c4ab7d]">
                      Menor zoom = vê uma área muito maior do mundo (~
                      {Math.round(28 / settings.cameraZoom)}×
                      {Math.round(16 / settings.cameraZoom)} blocos)
                    </span>
                  </div>
                  <span className="font-mono-tabular text-xs font-extrabold text-amber-400">
                    {settings.cameraZoom.toFixed(2)}x
                  </span>
                </div>

                {/* Continuous Slider */}
                <div className="flex items-center gap-2 text-[10px] text-[#c4ab7d]">
                  <span>Amplo</span>
                  <input
                    type="range"
                    min={0.55}
                    max={2.5}
                    step={0.05}
                    value={settings.cameraZoom}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        cameraZoom: Number(e.target.value),
                      })
                    }
                    className="flex-1 accent-amber-500 h-4"
                  />
                  <span>Próximo</span>
                </div>

                {/* 5 Quick Presets */}
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { z: 0.65, label: '0.65x Ultra' },
                    { z: 0.85, label: '0.85x Amplo' },
                    { z: 1.15, label: '1.15x Ideal' },
                    { z: 1.5, label: '1.5x Médio' },
                    { z: 2.0, label: '2.0x Perto' },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.z}
                      onClick={() =>
                        onUpdateSettings({ ...settings, cameraZoom: preset.z })
                      }
                      className={`min-h-[32px] px-1 text-[9px] sm:text-[10px] font-bold ${
                        Math.abs(settings.cameraZoom - preset.z) < 0.06
                          ? 'medieval-btn-gold'
                          : 'medieval-btn-wood'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio: Separate Music, Ambient & Sound Effects Controls */}
              <div className="medieval-inset p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {settings.soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-[#8c6d46]" />
                    )}
                    <span className="text-[11px] font-bold text-amber-300">
                      Áudio do Jogo
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        soundEnabled: !settings.soundEnabled,
                      })
                    }
                    className={`px-2 py-0.5 text-[10px] font-bold ${
                      settings.soundEnabled
                        ? 'medieval-btn-gold'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    {settings.soundEnabled ? 'SOM: ON' : 'SOM: OFF'}
                  </button>
                </div>

                {/* 1. Volume da Música */}
                <div className="space-y-1 pt-1 border-t border-[#3d281a]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">
                      Volume da Música
                    </span>
                    <span className="font-mono-tabular text-[11px] font-bold text-amber-300">
                      {Math.round((settings.musicVolume ?? 0.2) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={!settings.soundEnabled}
                    value={settings.musicVolume ?? 0.2}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        musicVolume: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500 h-4"
                  />
                </div>

                {/* 2. Volume de Ambiente (Chuva & Clima) */}
                <div className="space-y-1 pt-1 border-t border-[#3d281a]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">
                      Volume de Ambiente
                    </span>
                    <span className="font-mono-tabular text-[11px] font-bold text-sky-300">
                      {Math.round((settings.ambientVolume ?? 0.45) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={!settings.soundEnabled}
                    value={settings.ambientVolume ?? 0.45}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        ambientVolume: Number(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400 h-4"
                  />
                </div>

                {/* 3. Volume de Efeitos Sonoros */}
                <div className="space-y-1 pt-1 border-t border-[#3d281a]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">
                      Volume de Efeitos Sonoros
                    </span>
                    <span className="font-mono-tabular text-[11px] font-bold text-amber-300">
                      {Math.round(settings.soundVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={!settings.soundEnabled}
                    value={settings.soundVolume}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        soundVolume: Number(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500 h-4"
                  />
                </div>
              </div>
            </div>

            {isGlobalOnly && (
              <div className="medieval-inset p-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-white">Tela Cheia</div>
                  <div className="text-[10px] text-[#c4ab7d]">
                    Ideal para jogar na horizontal
                  </div>
                </div>
                <button
                  type="button"
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    onToggleFullscreen();
                  }}
                  onClick={onToggleFullscreen}
                  className="min-h-[38px] px-3 medieval-btn-gold text-xs font-bold flex items-center gap-1.5 shrink-0 touch-manipulation"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isFullscreen ? 'Sair' : 'Ativar'}</span>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (5 cols): In-World Controls, Online Availability, Players in World, Save & Exit */}
          {!isGlobalOnly && engine && (
            <div className="sm:col-span-5 space-y-2.5">
              {saveFeedback && (
                <div className="medieval-inset px-3 py-2 text-[11px] text-emerald-400 font-bold">
                  {saveFeedback}
                </div>
              )}

              {/* In-World Online Availability Control (Section 5.4) */}
              {(() => {
                const onlineInfo = engine.multiplayer.getSessionInfo();
                const isGuest = onlineInfo.role === 'GUEST';
                const isOnlineEnabled = Boolean(
                  engine.metadata.onlineEnabled || onlineInfo.isOnline
                );
                const hasGuestsPresent = engine.hasConnectedNetworkPlayers();
                const otherPeers = onlineInfo.connectedPeers.filter(
                  (p) =>
                    p.peerId !== engine.multiplayer.peerId &&
                    (!p.playerPublicId || p.playerPublicId !== myPublicId)
                );

                return (
                  <div className="medieval-inset p-3 space-y-2 border border-emerald-500/40 bg-[#132419]/60">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                      <span className="flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Disponibilidade Online</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-pixel uppercase border ${
                          isOnlineEnabled
                            ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                            : 'bg-[#1c120b] border-[#5c3c24] text-[#c4ab7d]'
                        }`}
                      >
                        {isOnlineEnabled ? 'Online ativado' : 'Online desativado'}
                      </span>
                    </div>

                    {!isGuest && (
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleSetOnlineAvailability(true)}
                          className={`py-2 px-2 text-[10px] font-pixel font-bold uppercase ${
                            isOnlineEnabled
                              ? 'medieval-btn-emerald'
                              : 'medieval-btn-wood'
                          }`}
                        >
                          Online ativado
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetOnlineAvailability(false)}
                          className={`py-2 px-2 text-[10px] font-pixel font-bold uppercase ${
                            !isOnlineEnabled
                              ? 'medieval-btn-gold'
                              : 'medieval-btn-wood'
                          }`}
                        >
                          Online desativado
                        </button>
                      </div>
                    )}

                    {(onlineRuleWarning ||
                      (engine.pendingOfflineDeactivation &&
                        hasGuestsPresent)) && (
                      <div className="p-2 bg-amber-950/80 border border-amber-500/50 text-[10px] text-amber-200 leading-snug">
                        {onlineRuleWarning ||
                          'O mundo precisa estar vazio de outros jogadores para que a disponibilidade online seja desativada.'}
                      </div>
                    )}

                    {onlineInfo.isOnline && onlineInfo.inviteCode && (
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-[11px]">
                        <span className="text-[#c4ab7d]">
                          Código de convite:
                        </span>
                        <span className="font-mono-tabular font-bold text-amber-300">
                          {onlineInfo.inviteCode}
                        </span>
                      </div>
                    )}

                    {/* Players in the same world — 1-click Add Friend */}
                    {otherPeers.length > 0 && (
                      <div className="pt-1.5 border-t border-emerald-500/20 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-pixel font-bold text-amber-300 uppercase">
                          <Users className="w-3 h-3" />
                          <span>Jogadores neste Mundo ({otherPeers.length})</span>
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {otherPeers.map((peer) => {
                            const targetId = (
                              peer.playerPublicId ||
                              peer.peerId ||
                              ''
                            )
                              .trim()
                              .toUpperCase();
                            const alreadyFriend = friendsList.some(
                              (f) => f.playerPublicId === targetId
                            );
                            return (
                              <div
                                key={peer.peerId}
                                className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0e0905]/90 border border-[#3d2616] text-[11px]"
                              >
                                <span className="font-bold text-[#f3e5c8] truncate">
                                  {peer.name}
                                </span>
                                {alreadyFriend ? (
                                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                                    <Check className="w-3 h-3" />
                                    <span>Amigo</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAddPeerInWorldAsFriend(peer)
                                    }
                                    disabled={addingPeerId === peer.peerId}
                                    className="px-2 py-0.5 medieval-btn-emerald text-[10px] font-pixel font-bold uppercase flex items-center gap-1 shrink-0"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    <span>+ Amigo</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {onOpenOnlineInvite && isOnlineEnabled && (
                      <button
                        type="button"
                        onClick={onOpenOnlineInvite}
                        className="w-full min-h-[34px] medieval-btn-wood font-pixel text-[10px] font-bold flex items-center justify-center gap-1.5"
                      >
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        <span>SALA ONLINE / JOGADORES & CONVITE</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Fullscreen Toggle */}
              <div className="medieval-inset p-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-white">Tela Cheia</div>
                  <div className="text-[10px] text-[#c4ab7d]">
                    Ideal para celular na horizontal
                  </div>
                </div>
                <button
                  type="button"
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    onToggleFullscreen();
                  }}
                  onClick={onToggleFullscreen}
                  className="min-h-[38px] px-3 medieval-btn-gold text-xs font-bold flex items-center gap-1.5 shrink-0 touch-manipulation"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isFullscreen ? 'Sair' : 'Ativar'}</span>
                </button>
              </div>

              {/* Primary Resume & Save Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={onResume}
                  className="w-full min-h-[42px] medieval-btn-emerald font-pixel text-xs font-bold flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>CONTINUAR JOGO</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleManualSave}
                    className="min-h-[40px] px-2 medieval-btn-wood text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5 text-sky-300" />
                    <span>Salvar</span>
                  </button>

                  <button
                    onClick={handleDownloadFile}
                    className="min-h-[40px] px-2 medieval-btn-wood text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Baixar Mundo</span>
                  </button>
                </div>

                {onExitToMenu && (
                  <button
                    onClick={handleSaveAndExit}
                    className="w-full min-h-[40px] medieval-btn-crimson text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Salvar e Sair para Mundos</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
