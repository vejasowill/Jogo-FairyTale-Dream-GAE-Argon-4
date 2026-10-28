import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { GameSettings, PlaceableType, WorldSaveData } from './game/core/types';
import { GameEngine, HudSnapshot } from './game/loop/GameEngine';
import { MultiplayerManager } from './game/network/MultiplayerManager';
import { SaveManager } from './game/persistence/SaveManager';
import { CharacterPetsModal } from './ui/CharacterPetsModal';
import { ChestStorageModal } from './ui/ChestStorageModal';
import { CraftingDrawer } from './ui/CraftingDrawer';
import { MarketStallModal } from './ui/MarketStallModal';
import { MobileHud } from './ui/MobileHud';
import { NpcTradeModal } from './ui/NpcTradeModal';
import { OnlineInviteModal } from './ui/OnlineInviteModal';
import { PauseSettingsModal } from './ui/PauseSettingsModal';
import { WorldMapModal } from './ui/WorldMapModal';
import { WorldSelectScreen } from './ui/WorldSelectScreen';

type ActiveModal =
  | 'NONE'
  | 'MAP'
  | 'CRAFT'
  | 'CHARACTER'
  | 'PAUSE'
  | 'NPC_TRADE'
  | 'CHEST'
  | 'MARKET_STALL'
  | 'ONLINE_INVITE';

function getNativeFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as any;
  return (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.webkitCurrentFullScreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    null
  );
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((window.navigator as any)?.standalone)
  );
}

function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPod|iPad/i.test(navigator.userAgent);
}

export default function App() {
  const [settings, setSettings] = useState<GameSettings>(() =>
    SaveManager.loadSettings()
  );
  const [activeWorldSave, setActiveWorldSave] = useState<WorldSaveData | null>(
    null
  );
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>('NONE');
  const [isEditingHud, setIsEditingHud] = useState<boolean>(false);
  const [isMountSaddlebagOpen, setIsMountSaddlebagOpen] =
    useState<boolean>(false);
  const [transitionState, setTransitionState] = useState<{
    active: boolean;
    title: string;
    subtitle: string;
    stepLabel: string;
    progress: number;
  } | null>(null);
  const [stationContext, setStationContext] = useState<PlaceableType | null>(
    null
  );
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null);
  const [activeChestId, setActiveChestId] = useState<string | null>(null);
  const [activeStallId, setActiveStallId] = useState<string | null>(null);
  const [craftInitialTab, setCraftInitialTab] = useState<'craft' | 'inventory'>(
    'craft'
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    Boolean(getNativeFullscreenElement() || isStandalonePwa())
  );
  const [fullscreenToast, setFullscreenToast] = useState<string | null>(null);
  const [showFullscreenModal, setShowFullscreenModal] =
    useState<boolean>(false);
  const [needsAutoFsTap, setNeedsAutoFsTap] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('autofs') === '1' &&
      !getNativeFullscreenElement() &&
      !isStandalonePwa()
    );
  });
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(false);
  const [dismissedPortraitHint, setDismissedPortraitHint] =
    useState<boolean>(false);
  const [statusBannerVisible, setStatusBannerVisible] =
    useState<boolean>(false);

  const appRootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const guestMultiplayerRef = useRef<MultiplayerManager | null>(null);

  const showToast = (msg: string) => {
    setFullscreenToast(msg);
    window.setTimeout(() => {
      setFullscreenToast((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  // Auto-disappear after 5 seconds for Pause / Active Multiplayer visual status banner
  const isOverlayOpen =
    activeModal !== 'NONE' || isEditingHud || isMountSaddlebagOpen;
  useEffect(() => {
    if (!isOverlayOpen) {
      setStatusBannerVisible(false);
      return;
    }
    setStatusBannerVisible(true);
    const timer = window.setTimeout(() => {
      setStatusBannerVisible(false);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [isOverlayOpen, snapshot?.isPaused]);

  // Auto-disappear after 5 seconds for Portrait orientation helper pill
  useEffect(() => {
    if (!isPortraitMobile || dismissedPortraitHint) return;
    const timer = window.setTimeout(() => {
      setDismissedPortraitHint(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [isPortraitMobile, dismissedPortraitHint]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const active = Boolean(getNativeFullscreenElement() || isStandalonePwa());
      setIsFullscreen(active);
      if (active) {
        setNeedsAutoFsTap(false);
        setShowFullscreenModal(false);
      }
      window.dispatchEvent(new Event('resize'));
    };

    const checkOrientation = () => {
      setIsPortraitMobile(
        window.innerHeight > window.innerWidth && window.innerWidth < 560
      );
    };

    checkOrientation();
    syncFullscreenState();

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    document.addEventListener('mozfullscreenchange', syncFullscreenState);
    document.addEventListener('MSFullscreenChange', syncFullscreenState);
    window.addEventListener('resize', checkOrientation);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener(
        'webkitfullscreenchange',
        syncFullscreenState
      );
      document.removeEventListener('mozfullscreenchange', syncFullscreenState);
      document.removeEventListener('MSFullscreenChange', syncFullscreenState);
      window.removeEventListener('resize', checkOrientation);
    };
  }, []);

  /**
   * Synchronous Native Fullscreen Activator for Mobile & Desktop Browsers.
   * Must be invoked directly inside a user gesture handler (`onClick` / `onPointerUp`)
   * without any prior state updates or DOM layout mutations so mobile transient activation stays valid.
   */
  const requestNativeFullscreen = () => {
    const docEl = document.documentElement as any;
    const bodyEl = document.body as any;

    const lockLandscape = () => {
      try {
        if ((screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch {
        // Ignore if orientation lock is unsupported
      }
    };

    const onSuccess = () => {
      lockLandscape();
      setIsFullscreen(true);
      setNeedsAutoFsTap(false);
      setShowFullscreenModal(false);
      window.dispatchEvent(new Event('resize'));
      showToast('Tela Cheia Ativada!');
    };

    const onFailure = () => {
      // Check if native fullscreen actually succeeded despite promise state
      if (getNativeFullscreenElement()) {
        onSuccess();
        return;
      }
      // If blocked because we are inside a preview iframe or on iOS Safari, open the Mobile Fullscreen Solution Modal
      setShowFullscreenModal(true);
    };

    try {
      if (typeof docEl.requestFullscreen === 'function') {
        const promise = docEl.requestFullscreen({ navigationUI: 'hide' });
        if (promise && typeof promise.then === 'function') {
          promise.then(onSuccess).catch(() => {
            // Try fallback without options or on body
            try {
              const p2 = bodyEl.requestFullscreen
                ? bodyEl.requestFullscreen()
                : docEl.requestFullscreen();
              if (p2 && typeof p2.then === 'function') {
                p2.then(onSuccess).catch(onFailure);
              } else {
                onFailure();
              }
            } catch {
              onFailure();
            }
          });
        } else {
          window.setTimeout(() => {
            if (getNativeFullscreenElement()) onSuccess();
            else onFailure();
          }, 150);
        }
        return;
      }

      if (typeof docEl.webkitRequestFullscreen === 'function') {
        docEl.webkitRequestFullscreen();
        window.setTimeout(() => {
          if (getNativeFullscreenElement()) onSuccess();
          else onFailure();
        }, 150);
        return;
      }

      if (typeof bodyEl.webkitRequestFullscreen === 'function') {
        bodyEl.webkitRequestFullscreen();
        window.setTimeout(() => {
          if (getNativeFullscreenElement()) onSuccess();
          else onFailure();
        }, 150);
        return;
      }

      if (typeof docEl.msRequestFullscreen === 'function') {
        docEl.msRequestFullscreen();
        window.setTimeout(() => {
          if (getNativeFullscreenElement()) onSuccess();
          else onFailure();
        }, 150);
        return;
      }

      // Browser does not expose Fullscreen API (e.g. iOS iPhone Safari or restricted WebView)
      onFailure();
    } catch {
      onFailure();
    }
  };

  const lastFsToggleRef = useRef<number>(0);

  const toggleFullscreen = () => {
    const now = Date.now();
    if (now - lastFsToggleRef.current < 450) {
      return;
    }
    lastFsToggleRef.current = now;

    const doc = document as any;
    const currentFsEl = getNativeFullscreenElement();

    if (currentFsEl) {
      try {
        if (typeof doc.exitFullscreen === 'function') {
          doc.exitFullscreen().catch(() => {});
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          doc.webkitExitFullscreen();
        } else if (typeof doc.mozCancelFullScreen === 'function') {
          doc.mozCancelFullScreen();
        } else if (typeof doc.msExitFullscreen === 'function') {
          doc.msExitFullscreen();
        }
      } catch {
        // Ignore
      }
      setIsFullscreen(false);
      window.dispatchEvent(new Event('resize'));
      showToast('Saiu da Tela Cheia');
    } else {
      requestNativeFullscreen();
    }
  };

  const handleUpdateSettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
    SaveManager.saveSettings(newSettings);
    if (engineRef.current) {
      engineRef.current.updateSettings(newSettings);
    }
  };

  useEffect(() => {
    if (!activeWorldSave || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const engine = new GameEngine(
      activeWorldSave,
      settings,
      (hudSnap) => {
        setSnapshot({ ...hudSnap });
      },
      (interactedStation: PlaceableType) => {
        setStationContext(interactedStation);
        setCraftInitialTab('craft');
        setActiveModal('CRAFT');
        engine.setUiPauseRequested(true);
      },
      (interactedNpc) => {
        setActiveNpcId(interactedNpc.id);
        setActiveModal('NPC_TRADE');
        engine.setUiPauseRequested(true);
      },
      (interactedChest) => {
        setActiveChestId(interactedChest.id);
        setActiveModal('CHEST');
        engine.setUiPauseRequested(true);
      },
      (interactedStall) => {
        setActiveStallId(interactedStall.id);
        setActiveModal('MARKET_STALL');
        engine.setUiPauseRequested(true);
      },
      guestMultiplayerRef.current,
      (reason: string) => {
        setTransitionState({
          active: true,
          title: 'ENCERRANDO SESSÃO ONLINE',
          subtitle: reason || 'O anfitrião encerrou a sessão.',
          stepLabel: 'Salvando herói e montaria integrada...',
          progress: 75,
        });
        void engine.saveGame(true).finally(() => {
          window.setTimeout(() => {
            guestMultiplayerRef.current = null;
            setActiveModal('NONE');
            setIsEditingHud(false);
            setIsMountSaddlebagOpen(false);
            setActiveWorldSave(null);
            setSnapshot(null);
            setTransitionState(null);
            showToast(reason);
          }, 380);
        });
      }
    );
    guestMultiplayerRef.current = null;
    engineRef.current = engine;
    engine.initialize(canvas);

    // Smoothly complete the entry transition loading screen once the canvas and initial chunks are ready
    setTransitionState((prev) =>
      prev
        ? {
            ...prev,
            stepLabel: 'Mundo pronto! Sincronizando interface...',
            progress: 100,
          }
        : null
    );
    const readyTimer = window.setTimeout(() => {
      setTransitionState(null);
    }, 320);

    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener('resize', resizeCanvas);
      void engine.saveGame(true);
      engine.destroy();
      engineRef.current = null;
    };
  }, [activeWorldSave]);

  // Synchronize real game pause whenever Map, Inventory, Craft, Character, Pause, Chest, NPC Trade, Stall, Saddlebag, or HUD Editor is open.
  // Music stops ONLY on Pause menu; in Craft, Map, Inventory, and other UI screens, music stays playing at half volume with muffled echo.
  useEffect(() => {
    if (!engineRef.current) return;
    const shouldRequestPause =
      activeModal !== 'NONE' || isEditingHud || isMountSaddlebagOpen;
    const isPauseMenu = activeModal === 'PAUSE';
    const isMuffledOverlay =
      (activeModal !== 'NONE' && activeModal !== 'PAUSE') ||
      isEditingHud ||
      isMountSaddlebagOpen;
    engineRef.current.setAudioMenuState(isPauseMenu, isMuffledOverlay);
    engineRef.current.setUiPauseRequested(shouldRequestPause);
  }, [activeModal, isEditingHud, isMountSaddlebagOpen]);

  const handleStartWorldWithTransition = (
    saveData: WorldSaveData,
    mpManager?: MultiplayerManager | null
  ) => {
    if (transitionState?.active) return;
    const isGuest = Boolean(mpManager && mpManager.role === 'GUEST');
    setTransitionState({
      active: true,
      title: isGuest
        ? `CONECTANDO A ${saveData.metadata.name.toUpperCase()}`
        : `CARREGANDO ${saveData.metadata.name.toUpperCase()}`,
      subtitle: isGuest
        ? 'Sincronizando mundo do anfitrião, entidades e sua montaria integrada...'
        : 'Gerando terreno procedural, biomas, vilas, águas e restaurando estado salvo...',
      stepLabel: 'Inicializando motor gráfico e superfície Canvas...',
      progress: 45,
    });

    window.setTimeout(() => {
      guestMultiplayerRef.current = mpManager || null;
      setActiveModal('NONE');
      setIsEditingHud(false);
      setIsMountSaddlebagOpen(false);
      setActiveWorldSave(saveData);
    }, 220);
  };

  const handleSaveAndExitToMenu = async () => {
    if (transitionState?.active) return;
    setTransitionState({
      active: true,
      title: 'SALVANDO E SAINDO PARA O MENU',
      subtitle:
        'Preservando inventário, construções e montaria integrada ao personagem...',
      stepLabel: 'Gravando dados locais e encerrando sessão...',
      progress: 60,
    });

    try {
      if (activeChestId && engineRef.current) {
        engineRef.current.closeChest(activeChestId);
      }
      if (engineRef.current) {
        await engineRef.current.saveGame(false);
      }
    } catch {
      // ignore
    }

    setTransitionState((prev) =>
      prev
        ? {
            ...prev,
            stepLabel: 'Transição concluída!',
            progress: 100,
          }
        : null
    );

    window.setTimeout(() => {
      setActiveModal('NONE');
      setStationContext(null);
      setActiveChestId(null);
      setActiveStallId(null);
      setIsEditingHud(false);
      setIsMountSaddlebagOpen(false);
      setActiveWorldSave(null);
      setSnapshot(null);
      setTransitionState(null);
    }, 320);
  };

  const openModal = (modal: ActiveModal) => {
    if (transitionState?.active) return;
    setIsEditingHud(false);
    setActiveModal(modal);
    if (engineRef.current) {
      engineRef.current.setUiPauseRequested(modal !== 'NONE' || isMountSaddlebagOpen);
    }
  };

  const openHandCraftModal = () => {
    if (transitionState?.active) return;
    setStationContext(null);
    setCraftInitialTab('inventory');
    openModal('CRAFT');
  };

  const closeModal = () => {
    if (activeChestId && engineRef.current) {
      engineRef.current.closeChest(activeChestId);
    }
    setActiveModal('NONE');
    setStationContext(null);
    setActiveChestId(null);
    setActiveStallId(null);
    if (engineRef.current) {
      engineRef.current.setUiPauseRequested(isEditingHud || isMountSaddlebagOpen);
    }
  };

  const handleOpenHudEditor = () => {
    setActiveModal('NONE');
    setIsEditingHud(true);
    if (engineRef.current) {
      engineRef.current.setUiPauseRequested(true);
    }
  };

  const handleFinishEditingHud = () => {
    setIsEditingHud(false);
    if (engineRef.current) {
      engineRef.current.setUiPauseRequested(
        activeModal !== 'NONE' || isMountSaddlebagOpen
      );
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      !engineRef.current ||
      activeModal !== 'NONE' ||
      isEditingHud ||
      isMountSaddlebagOpen ||
      transitionState?.active
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    engineRef.current.handleCanvasTap(sx, sy);
  };

  const standaloneUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?autofs=1`
      : '/?autofs=1';

  return (
    <div
      ref={appRootRef}
      className="w-screen h-dvh bg-[#120c08] relative overflow-hidden"
    >
      {/* 1-Tap Fullscreen Banner when opened in Standalone Tab (?autofs=1) */}
      {needsAutoFsTap && !isFullscreen && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-4">
          <div className="w-full max-w-md medieval-panel p-5 text-center space-y-4">
            <div className="w-12 h-12 mx-auto mc-slot-active flex items-center justify-center">
              <Maximize2 className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-1">
              <h2 className="font-pixel text-sm sm:text-base font-bold text-amber-400">
                PRONTO PARA TELA CHEIA REAL!
              </h2>
              <p className="text-xs text-[#e5d5b5]">
                Toque no botão abaixo para ocultar as barras do navegador e jogar em Tela Cheia Horizontal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNeedsAutoFsTap(false);
                requestNativeFullscreen();
              }}
              className="w-full min-h-[48px] medieval-btn-gold font-pixel text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
            >
              <Maximize2 className="w-4 h-4" />
              <span>ENTRAR EM TELA CHEIA AGORA</span>
            </button>
            <button
              type="button"
              onClick={() => setNeedsAutoFsTap(false)}
              className="text-[11px] text-[#c4ab7d] underline hover:text-white"
            >
              Continuar sem tela cheia
            </button>
          </div>
        </div>
      )}

      {/* Mobile Fullscreen Unlocker Modal (Shown when Iframe or iOS Safari blocks native requestFullscreen) */}
      {showFullscreenModal && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg medieval-panel p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b-2 border-[#4a301e] pb-2">
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-amber-400" />
                <h3 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
                  ATIVAR TELA CHEIA NO CELULAR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFullscreenModal(false)}
                className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInsideIframe() ? (
              <div className="space-y-3">
                <p className="text-xs text-[#f3e5c8] leading-relaxed">
                  Você está abrindo o jogo dentro de um <strong>painel de visualização (iframe)</strong> que bloqueia a Tela Cheia direta do celular.
                </p>
                <div className="medieval-inset p-3 space-y-2 border border-amber-500/40">
                  <div className="text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Solução Instantânea (Recomendado para Celular):</span>
                  </div>
                  <p className="text-[11px] text-[#c4ab7d]">
                    Toque no botão abaixo para abrir o jogo direto em uma guia limpa do navegador com <strong>Tela Cheia 100% liberada</strong> (seus mundos salvos serão mantidos):
                  </p>
                  <a
                    href={standaloneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowFullscreenModal(false)}
                    className="w-full min-h-[46px] medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-2 no-underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>ABRIR EM TELA CHEIA REAL (NOVA GUIA)</span>
                  </a>
                </div>
              </div>
            ) : isIosDevice() ? (
              <div className="space-y-2.5 text-xs text-[#f3e5c8]">
                <p>
                  No <strong>iPhone / iOS</strong>, o sistema da Apple não permite ocultar a barra do Safari apenas por botão na aba comum.
                </p>
                <div className="medieval-inset p-3 space-y-1.5">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Como jogar em Tela Cheia 100% no iPhone:</span>
                  </div>
                  <ol className="list-decimal list-inside text-[11px] text-[#e5d5b5] space-y-1">
                    <li>
                      Toque no botão <strong>Compartilhar</strong> do navegador.
                    </li>
                    <li>
                      Selecione <strong>"Adicionar à Tela de Início"</strong>.
                    </li>
                    <li>
                      Abra o ícone <strong>Wildborn</strong> criado — ele abrirá em Tela Cheia Nativa Horizontal sem nenhuma barra!
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 text-xs text-[#f3e5c8]">
                <p>
                  Seu navegador móvel bloqueou a transição automática ou exige abertura direta:
                </p>
                <a
                  href={standaloneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowFullscreenModal(false)}
                  className="w-full min-h-[44px] medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-2 no-underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>ABRIR EM GUIA DE TELA CHEIA</span>
                </a>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowFullscreenModal(false)}
                className="px-4 min-h-[38px] medieval-btn-wood text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Toast Confirmation for Fullscreen Toggle */}
      {fullscreenToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[70] medieval-panel px-3.5 py-1.5 flex items-center gap-2 text-xs font-pixel text-amber-300 shadow-xl pointer-events-none">
          {isFullscreen ? (
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>{fullscreenToast}</span>
        </div>
      )}

      {/* Subtle Landscape Recommendation Pill when held Vertically */}
      {isPortraitMobile && !dismissedPortraitHint && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] medieval-panel px-3 py-1.5 flex items-center gap-2 text-[11px] text-amber-300 shadow-lg max-w-[92vw]">
          <Smartphone className="w-4 h-4 rotate-90 text-amber-400 shrink-0" />
          <span className="truncate">
            Dica: Gire o celular na <strong>Horizontal</strong> para a melhor experiência!
          </span>
          <button
            type="button"
            onClick={() => setDismissedPortraitHint(true)}
            className="p-0.5 text-[#c4ab7d] hover:text-white shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!activeWorldSave ? (
        <WorldSelectScreen
          settings={settings}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onUpdateSettings={handleUpdateSettings}
          onStartWorld={(saveData) => {
            handleStartWorldWithTransition(saveData, null);
          }}
          onJoinOnlineWorld={(saveData, mpManager) => {
            handleStartWorldWithTransition(saveData, mpManager);
          }}
        />
      ) : (
        <div className="relative w-full h-full overflow-hidden bg-[#120c08] select-none">
          {/* Dedicated Single Game Canvas Surface */}
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            className="block w-full h-full pixelated cursor-crosshair touch-none"
          />

          {/* Real Pause / Active Multiplayer Indicator Pill (auto-disappears after 5s so it never obstructs UI) */}
          {snapshot && isOverlayOpen && statusBannerVisible && (
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[55] pointer-events-none">
              <div
                className={`medieval-panel px-3 py-1 flex items-center gap-2 text-[10px] font-pixel font-bold shadow-lg ${
                  snapshot.isPaused
                    ? 'border-amber-500/80 text-amber-300'
                    : 'border-sky-500/80 text-sky-300'
                }`}
              >
                <span>
                  {snapshot.isPaused
                    ? '⏸ JOGO PAUSADO'
                    : '🌐 MULTIPLAYER EM REDE ATIVO — O MUNDO CONTINUA EM TEMPO REAL'}
                </span>
              </div>
            </div>
          )}

          {/* Responsive Medieval Pixel Mobile HUD + Live WYSIWYG Control Editor */}
          {engineRef.current && snapshot && (
            <MobileHud
              engine={engineRef.current}
              snapshot={snapshot}
              settings={settings}
              isFullscreen={isFullscreen}
              isEditingHud={isEditingHud}
              onToggleFullscreen={toggleFullscreen}
              onUpdateSettings={handleUpdateSettings}
              onFinishEditingHud={handleFinishEditingHud}
              onOpenMap={() => openModal('MAP')}
              onOpenHandCraftAndInventory={openHandCraftModal}
              onOpenCharacter={() => openModal('CHARACTER')}
              onOpenOnlineInvite={() => openModal('ONLINE_INVITE')}
              onOpenPause={() => openModal('PAUSE')}
              onMountSaddlebagToggle={(open) => {
                setIsMountSaddlebagOpen(open);
                if (engineRef.current) {
                  engineRef.current.setUiPauseRequested(
                    open || activeModal !== 'NONE' || isEditingHud
                  );
                }
              }}
            />
          )}

          {/* Fog-of-War Chunk World Map Modal */}
          {activeModal === 'MAP' && engineRef.current && snapshot && (
            <WorldMapModal
              engine={engineRef.current}
              world={engineRef.current.world}
              player={snapshot.player}
              tamedAnimals={snapshot.tamedAnimals}
              waypoints={snapshot.waypoints}
              onClose={closeModal}
            />
          )}

          {/* Modular Minecraft-Style Crafting (Station-Separated) & 32-Slot Inventory Drawer */}
          {activeModal === 'CRAFT' && engineRef.current && snapshot && (
            <CraftingDrawer
              engine={engineRef.current}
              player={snapshot.player}
              stationContext={stationContext}
              initialTab={craftInitialTab}
              onClose={closeModal}
            />
          )}

          {/* Village NPC Trade, Affinity & Diplomacy Modal */}
          {activeModal === 'NPC_TRADE' &&
            engineRef.current &&
            snapshot &&
            activeNpcId && (
              <NpcTradeModal
                engine={engineRef.current}
                npcId={activeNpcId}
                player={snapshot.player}
                onClose={closeModal}
              />
            )}

          {/* Interactive 24-Slot Chest Storage Modal */}
          {activeModal === 'CHEST' &&
            engineRef.current &&
            snapshot &&
            activeChestId && (
              <ChestStorageModal
                engine={engineRef.current}
                chestId={activeChestId}
                player={snapshot.player}
                onSelectChestId={(newId) => setActiveChestId(newId)}
                onClose={closeModal}
              />
            )}

          {/* Interactive Market Stall Modal (Ownership, Merchandise, Price Table & Customer Offers) */}
          {activeModal === 'MARKET_STALL' &&
            engineRef.current &&
            snapshot &&
            activeStallId && (
              <MarketStallModal
                engine={engineRef.current}
                stallId={activeStallId}
                player={snapshot.player}
                onSelectStallId={(newId) => setActiveStallId(newId)}
                onOpenNpcTrade={(npcId) => {
                  setActiveNpcId(npcId);
                  setActiveModal('NPC_TRADE');
                }}
                onOpenWorkbench={() => {
                  setStationContext(PlaceableType.WORKBENCH);
                  setCraftInitialTab('craft');
                  setActiveModal('CRAFT');
                }}
                onClose={closeModal}
              />
            )}

          {/* RPG Character Attributes & Tamed Animals Modal */}
          {activeModal === 'CHARACTER' && engineRef.current && snapshot && (
            <CharacterPetsModal
              engine={engineRef.current}
              player={snapshot.player}
              tamedAnimals={snapshot.tamedAnimals}
              onClose={closeModal}
            />
          )}

          {/* Online Invite & Multiplayer Room Modal */}
          {activeModal === 'ONLINE_INVITE' && engineRef.current && snapshot && (
            <OnlineInviteModal
              engine={engineRef.current}
              snapshot={snapshot}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onClose={closeModal}
            />
          )}

          {/* Pause & Settings / HUD Scale / Manual Control Editor Launcher */}
          {activeModal === 'PAUSE' && engineRef.current && (
            <PauseSettingsModal
              engine={engineRef.current}
              settings={settings}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              onUpdateSettings={handleUpdateSettings}
              onOpenHudEditor={handleOpenHudEditor}
              onOpenOnlineInvite={() => openModal('ONLINE_INVITE')}
              onResume={closeModal}
              onExitToMenu={() => {
                void handleSaveAndExitToMenu();
              }}
            />
          )}

          {/* Hardcore Game Over Modal */}
          {snapshot?.isGameOver && engineRef.current && (
            <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
              <div className="w-full max-w-md medieval-panel p-5 text-center space-y-3">
                <h2 className="font-pixel text-lg font-bold text-rose-400">
                  FIM DA JORNADA (MODO HARDCORE)
                </h2>
                <p className="text-xs text-[#e5d5b5]">
                  Você sobreviveu por {snapshot.metadata.dayCount} dia(s) e alcançou o Nível {snapshot.player.level}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveAndExitToMenu();
                  }}
                  className="w-full min-h-[44px] medieval-btn-gold font-pixel text-xs font-bold"
                >
                  VOLTAR À SELEÇÃO DE MUNDOS
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Transition Loading Screen to prevent race conditions and state inconsistencies */}
      {transitionState?.active && (
        <div className="fixed inset-0 z-[95] bg-[#0e0906]/95 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-md medieval-panel p-6 text-center space-y-4 border-2 border-amber-500/70 shadow-[0_0_32px_rgba(0,0,0,0.9)]">
            <div className="w-14 h-14 mx-auto mc-slot-active flex items-center justify-center">
              <div className="w-7 h-7 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-pixel text-sm sm:text-base font-bold text-amber-400 tracking-wide">
                {transitionState.title}
              </h2>
              <p className="text-xs text-[#e5d5b5] leading-relaxed">
                {transitionState.subtitle}
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="w-full h-3 medieval-inset overflow-hidden p-[2px]">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-200"
                  style={{
                    width: `${Math.max(15, Math.min(100, transitionState.progress))}%`,
                  }}
                />
              </div>
              <div className="text-[10px] font-mono-tabular text-amber-300/90 font-semibold">
                {transitionState.stepLabel}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
