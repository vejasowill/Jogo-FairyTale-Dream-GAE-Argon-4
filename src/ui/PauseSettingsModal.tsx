import React, { useState } from 'react';
import {
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
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import { GAME_VERSION, GameSettings } from '../game/core/types';
import { GameEngine } from '../game/loop/GameEngine';
import { SaveManager } from '../game/persistence/SaveManager';

interface PauseSettingsModalProps {
  engine: GameEngine;
  settings: GameSettings;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenHudEditor: () => void;
  onOpenOnlineInvite?: () => void;
  onUpdateSettings: (s: GameSettings) => void;
  onResume: () => void;
  onExitToMenu: () => void;
}

export const PauseSettingsModal: React.FC<PauseSettingsModalProps> = ({
  engine,
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

  const handleManualSave = async () => {
    setSaveFeedback('Salvando mundo com verificação Checksum FNV-1a...');
    await engine.saveGame(false);
    setSaveFeedback(`Salvo com segurança (${engine.lastSaveStatus})`);
  };

  const handleDownloadFile = () => {
    const saveData = engine.buildSaveData();
    SaveManager.saveWorldLocal(saveData);
    SaveManager.downloadWorldFile(saveData);
    setSaveFeedback('Arquivo .wildborn.json baixado com sucesso!');
  };

  const handleSaveAndExit = async () => {
    await engine.saveGame(false);
    onExitToMenu();
  };

  const hudScale = settings.hudScale || 1.0;
  const hudOpacity = settings.hudOpacity || 0.96;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-3xl medieval-panel flex flex-col max-h-[94dvh] overflow-hidden">
        {/* Compact Widescreen Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#1a110b] border-b-2 border-[#4a301e]">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-2">
              <span>PAUSA, CONTROLES & CONFIGURAÇÕES DA HUD</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/40 text-[9px] font-mono text-amber-300">
                v{GAME_VERSION}
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
          {/* LEFT COLUMN (7 cols): HUD Size, Control Layout Editor, Camera Zoom & Audio */}
          <div className="sm:col-span-7 space-y-2.5">
            {/* Highlighted Manual Control Position & Size Editor Launcher */}
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

              {/* Audio & Ambient Music */}
              <div className="medieval-inset p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {settings.soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-[#8c6d46]" />
                    )}
                    <span className="text-[11px] font-bold text-white">
                      Efeitos Sonoros
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-[11px] font-bold text-amber-300">
                      {Math.round(settings.soundVolume * 100)}%
                    </span>
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
                      {settings.soundEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
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

                {/* Ambient Music Volume (Day & Night — Default 20%) */}
                <div className="pt-1.5 border-t border-[#3d281a] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">
                      Volume da Música (Dia / Noite)
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
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (5 cols): Fullscreen, Server Config, Save, Download & Exit */}
          <div className="sm:col-span-5 space-y-2.5">
            {saveFeedback && (
              <div className="medieval-inset px-3 py-2 text-[11px] text-emerald-400 font-bold">
                {saveFeedback}
              </div>
            )}

            {/* World Seed & Explored Chunk Preservation Status */}
            <div className="medieval-inset p-2.5 space-y-1 border border-sky-500/35 bg-[#0f1722]/75">
              <div className="flex items-center justify-between text-[11px] font-bold text-sky-300">
                <span>Preservação de Mundo Ativa</span>
                <span className="font-mono text-[10px] text-amber-300">
                  Seed #{engine.metadata.seed}
                </span>
              </div>
              <p className="text-[10px] text-[#c4ab7d] leading-snug">
                <strong>{engine.world.getExploredChunksCount()} chunks explorados</strong> congelados e preservados. Novas atualizações (<strong>v{GAME_VERSION}</strong>) geram terreno apenas em áreas ainda inexploradas desta seed.
              </p>
            </div>

            {onOpenOnlineInvite && (() => {
              const onlineInfo = engine.multiplayer.getSessionInfo();
              return (
                <div className="medieval-inset p-2.5 space-y-1.5 border border-emerald-500/40 bg-[#132419]/60">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Modo Online (Convite)</span>
                    </span>
                    {onlineInfo.isOnline && (
                      <span className="font-mono-tabular text-amber-300 font-bold">
                        {onlineInfo.inviteCode}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#c4ab7d]">
                    {onlineInfo.isOnline
                      ? onlineInfo.role === 'HOST'
                        ? `Sala ativa! Código ${onlineInfo.inviteCode} válido enquanto este mundo estiver aberto.`
                        : `Conectado ao mundo de ${onlineInfo.hostName}.`
                      : 'Abra o painel online para ativar ou copiar seu código de convite.'}
                  </p>
                  <button
                    type="button"
                    onClick={onOpenOnlineInvite}
                    className="w-full min-h-[36px] medieval-btn-emerald font-pixel text-[10px] font-bold flex items-center justify-center gap-1.5"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>CONVIDAR JOGADORES / SALA ONLINE</span>
                  </button>
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

            {/* Server Sync */}
            <div className="medieval-inset p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white">
                  Auto-Save no Servidor
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
              </div>
              <input
                type="text"
                value={settings.customServerUrl}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    customServerUrl: e.target.value,
                  })
                }
                placeholder="URL (vazio = servidor padrão)"
                className="w-full h-8 px-2 mc-slot text-[11px] text-white font-mono-tabular focus:outline-none"
              />
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
                  <span>Baixar .JSON</span>
                </button>
              </div>

              <button
                onClick={handleSaveAndExit}
                className="w-full min-h-[40px] medieval-btn-crimson text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Salvar e Sair para Mundos</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
