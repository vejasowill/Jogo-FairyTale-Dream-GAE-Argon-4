import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
  Minimize2,
  Share2,
  Skull,
  Smartphone,
  Sparkles,
  Swords,
  Wind,
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
  | 'VILLAGE_WELL'
  | 'ONLINE_INVITE'
  | 'STATUS_EFFECTS';

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
  const [activeWellId, setActiveWellId] = useState<string | null>(null);
  const [wellFeedback, setWellFeedback] = useState<string | null>(null);
  const [craftInitialTab, setCraftInitialTab] = useState<'craft' | 'inventory'>(
    'craft'
  );
  const [expandedEffectIds, setExpandedEffectIds] = useState<
    Record<string, boolean>
  >({});
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
    }, 2000);
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

  // Block native browser context menu ("Download image" / "Open link") on long-press across mobile & desktop
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      e.preventDefault();
    };
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'IMG' || target.tagName === 'A')) {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', handleContextMenu, {
      passive: false,
    });
    window.addEventListener('dragstart', handleDragStart, { passive: false });
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('dragstart', handleDragStart);
    };
  }, []);

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
      },
      (interactedWell) => {
        setActiveWellId(interactedWell.id);
        setWellFeedback(null);
        setActiveModal('VILLAGE_WELL');
        engine.setUiPauseRequested(true);
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
      if (
        !engine.isSavingOrExiting &&
        (engine.isAuthoritativeLocalWorld() ||
          !engine.multiplayer.isConnectionUnstable())
      ) {
        void engine.saveGame(true, true);
      }
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
    const isHostOnline = Boolean(
      engineRef.current?.multiplayer.isOnline &&
        engineRef.current?.multiplayer.role === 'HOST'
    );
    // Immediately close any open modal and go directly to the local save confirmation screen
    setActiveModal('NONE');
    setIsEditingHud(false);
    setIsMountSaddlebagOpen(false);
    setTransitionState({
      active: true,
      title: 'SALVANDO E SAINDO PARA O MENU',
      subtitle: isHostOnline
        ? 'Desconectando convidados e gravando estado local do mundo...'
        : 'Preservando inventário, construções e montaria no armazenamento local...',
      stepLabel: 'Salvamento local em andamento...',
      progress: 55,
    });

    try {
      if (activeChestId && engineRef.current) {
        engineRef.current.closeChest(activeChestId);
      }
      if (activeNpcId && engineRef.current) {
        engineRef.current.endNpcInteraction(activeNpcId);
      }
      if (engineRef.current) {
        // Freeze game loop, commit fast local save (IndexedDB + localStorage), and enqueue background cloud sync
        await engineRef.current.saveAndPrepareForExit();
        setTransitionState((prev) =>
          prev
            ? {
                ...prev,
                stepLabel: isHostOnline
                  ? 'Salvamento local concluído! Encerrando sala online...'
                  : 'Salvamento local concluído! Sincronização em nuvem continuará em segundo plano...',
                progress: 90,
              }
            : null
        );
        if (engineRef.current.multiplayer.isOnline) {
          await Promise.race([
            engineRef.current.multiplayer.disconnectAndCloseRoom(),
            new Promise((r) => window.setTimeout(r, 450)),
          ]);
        }
      }
    } catch {
      // ignore
    }

    setTransitionState((prev) =>
      prev
        ? {
            ...prev,
            stepLabel: 'Salvamento local concluído!',
            progress: 100,
          }
        : null
    );

    window.setTimeout(() => {
      setStationContext(null);
      setActiveChestId(null);
      setActiveStallId(null);
      setActiveWorldSave(null);
      setSnapshot(null);
      setTransitionState(null);
    }, 120);
  };

  const handleRevertToLastAutoSaveAndExit = async () => {
    if (transitionState?.active) return;
    setActiveModal('NONE');
    setIsEditingHud(false);
    setIsMountSaddlebagOpen(false);
    setTransitionState({
      active: true,
      title: 'RESTAURANDO ÚLTIMO SAVE AUTOMÁTICO',
      subtitle:
        'Encerrando sessão com falha de conexão e restaurando o estado do último salvamento automático...',
      stepLabel: 'Restaurando snapshot do último save automático...',
      progress: 65,
    });

    try {
      if (engineRef.current) {
        await engineRef.current.revertToLastAutoSaveAndPrepareExit();
        if (engineRef.current.multiplayer.isOnline) {
          engineRef.current.multiplayer.disconnect(false);
        }
      }
    } catch {
      // ignore
    }

    setTransitionState((prev) =>
      prev
        ? {
            ...prev,
            stepLabel: 'Retornando ao menu principal...',
            progress: 100,
          }
        : null
    );

    window.setTimeout(() => {
      setStationContext(null);
      setActiveChestId(null);
      setActiveStallId(null);
      setActiveWorldSave(null);
      setSnapshot(null);
      setTransitionState(null);
    }, 280);
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
    if (activeNpcId && engineRef.current) {
      engineRef.current.endNpcInteraction(activeNpcId);
    }
    setActiveModal('NONE');
    setStationContext(null);
    setActiveChestId(null);
    setActiveStallId(null);
    setActiveNpcId(null);
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
          onOpenHudEditorFromMenu={handleOpenHudEditor}
          onUpdateSettings={handleUpdateSettings}
          onStartWorld={(saveData, mpManager) => {
            handleStartWorldWithTransition(saveData, mpManager || null);
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

          {/* Real Pause / Active Multiplayer Indicator Pill (auto-disappears after 2s with 33% opacity so it never obstructs UI) */}
          {snapshot && isOverlayOpen && statusBannerVisible && (
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[55] pointer-events-none opacity-[0.33]">
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

          {/* Discreet Non-Blocking Friend Join Request Notification Popup (Host Approval) */}
          {snapshot &&
            snapshot.pendingJoinRequests &&
            snapshot.pendingJoinRequests.length > 0 &&
            engineRef.current && (
              <div className="fixed top-14 right-3 z-[65] flex flex-col gap-2 max-w-[290px] w-[88vw] pointer-events-auto">
                {snapshot.pendingJoinRequests.slice(0, 2).map((req) => (
                  <div
                    key={req.requestId}
                    className="medieval-panel px-3 py-2.5 border border-amber-500/75 shadow-xl bg-[#18100a]/95 space-y-2"
                  >
                    <div className="text-[11px] text-[#f5e7c6] leading-snug">
                      <strong className="text-amber-300 font-pixel text-[10px]">
                        {req.requesterName}
                      </strong>{' '}
                      deseja entrar no seu mundo.
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void engineRef.current?.respondToJoinRequest(
                            req.requestId,
                            false
                          );
                        }}
                        className="min-h-[28px] px-2.5 medieval-btn-crimson font-pixel text-[9px] font-bold"
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void engineRef.current?.respondToJoinRequest(
                            req.requestId,
                            true
                          );
                        }}
                        className="min-h-[28px] px-3 medieval-btn-emerald font-pixel text-[9px] font-bold"
                      >
                        Aceitar
                      </button>
                    </div>
                  </div>
                ))}
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
              onOpenStatusEffects={() => openModal('STATUS_EFFECTS')}
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
                  if (
                    engineRef.current &&
                    !engineRef.current.tryOpenNpcInteraction(npcId)
                  ) {
                    return;
                  }
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

          {/* Poço da Vila — Gerenciador de Casas, Moradores e Líder da Vila */}
          {activeModal === 'VILLAGE_WELL' &&
            engineRef.current &&
            snapshot &&
            activeWellId &&
            (() => {
              const engine = engineRef.current;
              const wellData = engine.getVillageWellManagementData(activeWellId);
              if (!wellData) return null;
              const {
                well,
                isPlayerLeader,
                isElderLeader,
                isUnowned,
                leaderName,
                canDrinkToday,
                housesInRadius,
                residentsInRadius,
              } = wellData;
              const radiusPx = GameEngine.WELL_VILLAGE_RADIUS;

              return (
                <div
                  className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 select-none"
                  onClick={closeModal}
                >
                  <div
                    className="w-full max-w-2xl max-h-[92dvh] medieval-panel flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="px-3.5 py-2.5 bg-[#1c110a] border-b-2 border-[#4a301e] flex items-center justify-between gap-2 shrink-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                            {well.customName || 'Poço da Vila'}
                          </h2>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 border ${
                              isPlayerLeader
                                ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                                : isUnowned
                                  ? 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                                  : 'bg-sky-950/70 border-sky-500/60 text-sky-300'
                            }`}
                          >
                            Dono: {leaderName}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#c4ab7d] font-mono-tabular">
                          Gerenciador de Vila · Raio de Comunidade: {radiusPx}px
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={closeModal}
                        className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {wellFeedback && (
                      <div className="px-3.5 py-1.5 bg-amber-950/70 border-b border-amber-500/50 text-[11px] font-bold text-amber-200 shrink-0">
                        {wellFeedback}
                      </div>
                    )}

                    {/* Body */}
                    <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1">
                      {/* 1. Água Fresca do Poço (1x por dia) */}
                      <div className="medieval-inset p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div>
                          <div className="font-pixel text-[11px] font-bold text-sky-300">
                            ÁGUA FRESCA DO POÇO (1x POR DIA)
                          </div>
                          <div className="text-[11px] text-[#d8c4a0]">
                            Restaura +22 Vida, +35 Fôlego e +10 Saciedade.
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canDrinkToday}
                          onClick={() => {
                            const res = engine.drinkFromVillageWell(activeWellId);
                            setWellFeedback(res.message);
                          }}
                          className={`min-h-[36px] px-3.5 font-pixel text-[10px] font-bold shrink-0 ${
                            canDrinkToday
                              ? 'medieval-btn-emerald'
                              : 'medieval-btn-wood opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {canDrinkToday ? 'Beber Água do Poço' : 'Já Usado Hoje'}
                        </button>
                      </div>

                      {/* 2. Liderança / Dono do Poço */}
                      <div className="medieval-inset p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <div className="font-pixel text-[11px] font-bold text-amber-300">
                              LÍDER DA VILA (DONO DO POÇO)
                            </div>
                            <div className="text-[11px] text-[#d8c4a0]">
                              {isElderLeader
                                ? `Em vilas naturais, o ${leaderName} é o Líder da Vila enquanto estiver vivo.`
                                : isPlayerLeader
                                  ? 'Você é o Líder da Vila e pode adicionar ou remover casas e moradores.'
                                  : 'Este poço está Sem Dono. Assuma a posse para gerenciar as casas e moradores no raio.'}
                            </div>
                          </div>

                          {isUnowned && (
                            <button
                              type="button"
                              onClick={() => {
                                const res = engine.setVillageWellOwner(
                                  activeWellId,
                                  'PLAYER'
                                );
                                setWellFeedback(res.message);
                              }}
                              className="min-h-[34px] px-3 medieval-btn-gold font-pixel text-[10px] font-bold shrink-0"
                            >
                              Tomar Posse (Ser Líder)
                            </button>
                          )}

                          {isPlayerLeader && (
                            <button
                              type="button"
                              onClick={() => {
                                const res = engine.setVillageWellOwner(
                                  activeWellId,
                                  'NONE'
                                );
                                setWellFeedback(res.message);
                              }}
                              className="min-h-[32px] px-2.5 medieval-btn-wood font-pixel text-[10px] font-bold shrink-0"
                            >
                              Deixar Liderança
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 3. Casas / Pontos de Descanso no Raio */}
                      <div className="medieval-inset p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-pixel text-[11px] font-bold text-amber-400">
                            CASAS E PONTOS DE DESCANSO NO RAIO ({housesInRadius.length})
                          </span>
                          <span className="text-[10px] text-[#c4ab7d]">
                            {isPlayerLeader
                              ? 'Toque para incluir ou remover da vila'
                              : 'Apenas o Líder da Vila pode alterar'}
                          </span>
                        </div>

                        {housesInRadius.length === 0 ? (
                          <div className="text-[11px] text-[#9c8462] italic py-2">
                            Nenhuma casa ou ponto de descanso dentro do raio deste poço.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {housesInRadius.map((h) => (
                              <div
                                key={h.id}
                                className="px-2.5 py-2 bg-[#140c07] border border-[#3b2516] flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-pixel text-[10px] font-bold text-[#f5e7c6]">
                                      {h.label}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 font-bold border ${
                                        h.isMember
                                          ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                                          : 'bg-stone-900 border-stone-600 text-stone-300'
                                      }`}
                                    >
                                      {h.isMember ? 'Integrante da Vila' : 'Casa Independente'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[#c4ab7d]">
                                    Dono: <strong>{h.ownerLabel}</strong> · Moradores:{' '}
                                    {h.residentNames.length > 0
                                      ? h.residentNames.join(', ')
                                      : 'Nenhum'}{' '}
                                    · {h.dist}px
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={!isPlayerLeader}
                                  onClick={() => {
                                    const res = engine.toggleVillageWellHouseMembership(
                                      activeWellId,
                                      h.id
                                    );
                                    setWellFeedback(res.message);
                                  }}
                                  className={`min-h-[30px] px-2.5 font-pixel text-[9px] font-bold shrink-0 ${
                                    !isPlayerLeader
                                      ? 'medieval-btn-wood opacity-45 cursor-not-allowed'
                                      : h.isMember
                                        ? 'medieval-btn-crimson'
                                        : 'medieval-btn-emerald'
                                  }`}
                                >
                                  {h.isMember ? 'Remover da Vila' : 'Adicionar à Vila'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 4. Moradores no Raio */}
                      <div className="medieval-inset p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-pixel text-[11px] font-bold text-amber-400">
                            MORADORES NO RAIO ({residentsInRadius.length})
                          </span>
                          <span className="text-[10px] text-[#c4ab7d]">
                            Comunidade da Vila
                          </span>
                        </div>

                        {residentsInRadius.length === 0 ? (
                          <div className="text-[11px] text-[#9c8462] italic py-2">
                            Nenhum aldeão próximo ao raio deste poço no momento.
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {residentsInRadius.map((r) => (
                              <div
                                key={r.id}
                                className="px-2.5 py-2 bg-[#140c07] border border-[#3b2516] flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-pixel text-[10px] font-bold text-[#f5e7c6]">
                                      {r.name}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-950/60 border border-amber-500/40 text-amber-200 font-bold">
                                      {r.profession}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 font-bold border ${
                                        r.isMember
                                          ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300'
                                          : 'bg-stone-900 border-stone-600 text-stone-300'
                                      }`}
                                    >
                                      {r.isMember ? 'Na Comunidade' : 'Independente'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[#c4ab7d]">
                                    Residência: {r.houseLabel} · {r.dist}px
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={!isPlayerLeader}
                                  onClick={() => {
                                    const res = engine.toggleVillageWellResidentMembership(
                                      activeWellId,
                                      r.id
                                    );
                                    setWellFeedback(res.message);
                                  }}
                                  className={`min-h-[30px] px-2.5 font-pixel text-[9px] font-bold shrink-0 ${
                                    !isPlayerLeader
                                      ? 'medieval-btn-wood opacity-45 cursor-not-allowed'
                                      : r.isMember
                                        ? 'medieval-btn-crimson'
                                        : 'medieval-btn-emerald'
                                  }`}
                                >
                                  {r.isMember ? 'Remover' : 'Adicionar'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

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

          {/* Active Character Status Effects Modal (Paused, segmented into Positive & Negative, with Accordion Descriptions) */}
          {activeModal === 'STATUS_EFFECTS' && snapshot && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 select-none">
              <div className="w-full max-w-md medieval-panel p-4 sm:p-5 flex flex-col gap-3 max-h-[88dvh]">
                <div className="flex items-center justify-between border-b-2 border-[#4a301e] pb-2">
                  <div>
                    <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
                      EFEITOS ATIVOS DO PERSONAGEM
                    </h2>
                    <p className="text-[10px] text-[#c4ab7d]">
                      Jogo em pausa · Toque em um efeito para abrir sua descrição
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto space-y-3 pr-1">
                  {(() => {
                    const allEffects = snapshot.player.statusEffects || [];
                    const positiveEffects = allEffects.filter(
                      (e) => e.polarity === 'positive'
                    );
                    const negativeEffects = allEffects.filter(
                      (e) => e.polarity === 'negative'
                    );

                    const renderEffectCard = (
                      eff: (typeof allEffects)[number]
                    ) => {
                      const isExpanded = Boolean(expandedEffectIds[eff.id]);
                      const isNegative = eff.polarity === 'negative';
                      const mins = Math.floor(Math.ceil(eff.duration) / 60);
                      const secs = Math.ceil(eff.duration) % 60;
                      const formattedTime =
                        mins > 0
                          ? `${mins}m ${String(secs).padStart(2, '0')}s`
                          : `${Math.ceil(eff.duration)}s`;

                      return (
                        <div
                          key={eff.id}
                          className={`medieval-inset border transition-colors ${
                            isNegative
                              ? 'border-purple-500/60 bg-[#1a0d1e]/90'
                              : 'border-emerald-500/60 bg-[#0d1f16]/90'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEffectIds((prev) => ({
                                ...prev,
                                [eff.id]: !prev[eff.id],
                              }))
                            }
                            className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${
                                  isNegative
                                    ? 'bg-[#2a1230] border-purple-400/70'
                                    : 'bg-[#122b1e] border-emerald-400/70'
                                }`}
                              >
                                {eff.id === 'poison_1' ||
                                eff.id === 'poison_2' ? (
                                  <div className="flex items-center">
                                    <Skull className="w-4 h-4 text-purple-400" />
                                    <span className="text-[8px] font-pixel font-bold text-purple-200 ml-0.5">
                                      {eff.id === 'poison_2' ? '2' : '1'}
                                    </span>
                                  </div>
                                ) : eff.id === 'strength' ? (
                                  <Swords className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <Wind className="w-4 h-4 text-cyan-300" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-pixel text-xs font-bold text-[#f5e7c6] truncate">
                                  {eff.name}
                                </div>
                                <div className="text-[10px] text-[#c4ab7d]">
                                  Tempo restante:{' '}
                                  <span className="font-mono-tabular font-bold text-amber-300">
                                    {formattedTime}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-bold border ${
                                  isNegative
                                    ? 'bg-purple-950/80 border-purple-500/60 text-purple-200'
                                    : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                                }`}
                              >
                                {formattedTime}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-amber-300" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-[#c4ab7d]" />
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-2.5 pt-1 border-t border-white/10 text-xs text-[#e5d5b5] leading-relaxed">
                              {eff.description}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Positive Effects Section */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-pixel font-bold text-emerald-400 uppercase tracking-wider">
                            <span>✦ Efeitos Positivos</span>
                            <span>({positiveEffects.length})</span>
                          </div>
                          {positiveEffects.length === 0 ? (
                            <div className="medieval-inset px-3 py-2 text-[11px] text-[#9c8462] italic">
                              Nenhum efeito positivo ativo no momento.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {positiveEffects.map(renderEffectCard)}
                            </div>
                          )}
                        </div>

                        {/* Negative Effects Section */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-pixel font-bold text-purple-300 uppercase tracking-wider">
                            <span>☠ Efeitos Negativos</span>
                            <span>({negativeEffects.length})</span>
                          </div>
                          {negativeEffects.length === 0 ? (
                            <div className="medieval-inset px-3 py-2 text-[11px] text-[#9c8462] italic">
                              Nenhum efeito negativo ativo no momento.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {negativeEffects.map(renderEffectCard)}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="w-full min-h-[40px] medieval-btn-gold font-pixel text-xs font-bold"
                >
                  FECHAR E RETOMAR JOGO
                </button>
              </div>
            </div>
          )}

          {/* Sleep Countdown & Multiplayer Sync Overlay (keeps center clear so the sleeping character in bed is visible) */}
          {snapshot?.player.isSleeping && engineRef.current && (() => {
            const sleepStatus = engineRef.current.getSleepStatus();
            return (
              <div className="fixed inset-0 z-[85] bg-black/35 flex flex-col items-center justify-end pb-8 sm:pb-12 p-4 select-none pointer-events-auto">
                <div className="w-full max-w-sm medieval-panel p-4 sm:p-5 text-center space-y-3.5 border-2 border-amber-500/70 shadow-[0_0_32px_rgba(0,0,0,0.9)] bg-[#140d08]/95">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl">🌙</span>
                    <h2 className="font-pixel text-sm sm:text-base font-bold text-amber-300 tracking-wide">
                      {sleepStatus.allSleeping
                        ? `Dormindo na Cama... (${sleepStatus.countdownSec}s)`
                        : `Jogadores na cama (${sleepStatus.sleepingCount}/${sleepStatus.totalPlayers})`}
                    </h2>
                  </div>
                  <p className="text-[11px] text-[#e5d5b5]">
                    {sleepStatus.allSleeping
                      ? 'Você está protegido na cama. Aguarde a contagem terminar para avançar para o amanhecer.'
                      : 'Você está deitado e protegido na cama. Aguardando os demais jogadores deitarem...'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      engineRef.current?.cancelSleep('Você levantou da cama.');
                    }}
                    className="w-full min-h-[38px] medieval-btn-crimson font-pixel text-xs font-bold tracking-wider"
                  >
                    LEVANTAR DA CAMA
                  </button>
                </div>
              </div>
            );
          })()}

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

          {/* Connection Instability / Reconnecting Overlay (Pauses Game & Shows Time Since Last Auto-Save) */}
          {snapshot?.onlineSession?.connectionUnstable &&
            !transitionState?.active &&
            engineRef.current &&
            (() => {
              const now = Date.now();
              const elapsedSec = Math.max(
                0,
                Math.floor((now - (snapshot.lastAutoSaveAt || now)) / 1000)
              );
              const mins = Math.floor(elapsedSec / 60);
              const secs = elapsedSec % 60;
              const elapsedLabel =
                mins > 0
                  ? `há ${mins} min e ${secs}s`
                  : `há ${secs} segundo${secs === 1 ? '' : 's'}`;
              const unstableSec = snapshot.onlineSession.connectionUnstableSince
                ? Math.max(
                    1,
                    Math.floor(
                      (now - snapshot.onlineSession.connectionUnstableSince) /
                        1000
                    )
                  )
                : 1;

              return (
                <div className="fixed inset-0 z-[90] bg-black/88 backdrop-blur-sm flex items-center justify-center p-4 select-none">
                  <div className="w-full max-w-md medieval-panel p-5 sm:p-6 text-center space-y-4 border-2 border-amber-500/80 shadow-[0_0_40px_rgba(0,0,0,0.95)]">
                    <div className="w-14 h-14 mx-auto mc-slot-active flex items-center justify-center">
                      <div className="w-7 h-7 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    </div>

                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/60 text-[10px] font-pixel font-bold text-amber-300 uppercase tracking-wider">
                        <span>⚠️ JOGO PAUSADO · INSTABILIDADE DE CONEXÃO</span>
                      </div>
                      <h2 className="font-pixel text-sm sm:text-base font-bold text-amber-400 tracking-wide pt-1">
                        TENTANDO RECONECTAR À SESSÃO...
                      </h2>
                      <p className="text-xs text-[#e5d5b5] leading-relaxed">
                        {snapshot.onlineSession.connectionUnstableReason ||
                          'Foi detectada uma inconsistência ou falha de qualidade na sua conexão de internet. O jogo foi pausado automaticamente para proteger seu progresso.'}
                      </p>
                    </div>

                    <div className="medieval-inset p-3 space-y-1.5 text-left border border-[#5c3c24]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#c4ab7d]">
                          Último save automático:
                        </span>
                        <span className="font-mono-tabular font-bold text-emerald-400">
                          {elapsedLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#c4ab7d]">
                          Tempo sem resposta estável:
                        </span>
                        <span className="font-mono-tabular font-bold text-amber-300">
                          {unstableSec}s
                        </span>
                      </div>
                      {snapshot.onlineSession.reconnectAttempts &&
                        snapshot.onlineSession.reconnectAttempts > 0 && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[#c4ab7d]">
                              Tentativas de reconexão:
                            </span>
                            <span className="font-mono-tabular font-bold text-sky-300">
                              #{snapshot.onlineSession.reconnectAttempts}
                            </span>
                          </div>
                        )}
                    </div>

                    <div className="space-y-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          engineRef.current?.multiplayer.retryReconnectNow();
                        }}
                        className="w-full min-h-[42px] medieval-btn-gold font-pixel text-xs font-bold tracking-wider"
                      >
                        🔄 TENTAR RECONECTAR AGORA
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          void handleRevertToLastAutoSaveAndExit();
                        }}
                        className="w-full min-h-[44px] medieval-btn-crimson px-3 py-2 font-pixel text-[11px] font-bold leading-snug"
                      >
                        SAIR E PERDER PROGRESSO DESDE O ÚLTIMO SAVE AUTOMÁTICO (
                        {elapsedLabel.toUpperCase()})
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
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
