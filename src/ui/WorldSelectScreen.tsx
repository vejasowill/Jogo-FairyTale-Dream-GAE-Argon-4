import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  Edit3,
  Globe,
  KeyRound,
  Lock,
  LogIn,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import {
  Direction,
  FriendLiveStatus,
  FriendProfileEntry,
  GameSettings,
  PlayerAppearance,
  PlayerState,
  WorldJoinRequestInfo,
  WorldMetadata,
  WorldSaveData,
} from '../game/core/types';
import { MultiplayerManager } from '../game/network/MultiplayerManager';
import {
  CloudSyncSnapshot,
  firebaseCloudSync,
} from '../game/persistence/FirebaseCloudSync';
import {
  createInitialPlayerState,
  SaveManager,
} from '../game/persistence/SaveManager';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import { AccountAppearanceModal } from './CharacterPetsModal';
import { CloudAccountModal, CloudSyncAutoModal } from './CloudAccountModal';
import { PauseSettingsModal } from './PauseSettingsModal';

interface WorldSelectScreenProps {
  settings: GameSettings;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenHudEditorFromMenu: () => void;
  onUpdateSettings: (s: GameSettings) => void;
  onStartWorld: (
    saveData: WorldSaveData,
    existingMultiplayer?: MultiplayerManager | null
  ) => void;
}

const DIFFICULTY_INFO: Record<
  'normal' | 'survival' | 'hardcore',
  { label: string; desc: string; badgeClass: string }
> = {
  normal: {
    label: 'Normal',
    desc: 'Exploração equilibrada com evolução fluida e desafios moderados.',
    badgeClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/60',
  },
  survival: {
    label: 'Sobrevivência',
    desc: 'Fome mais exigente e criaturas mais agressivas à noite.',
    badgeClass: 'text-amber-300 border-amber-500/40 bg-amber-950/60',
  },
  hardcore: {
    label: 'Hardcore',
    desc: 'Combate letal e sobrevivência implacável para veteranos.',
    badgeClass: 'text-rose-300 border-rose-500/40 bg-rose-950/60',
  },
};

export const WorldSelectScreen: React.FC<WorldSelectScreenProps> = ({
  settings,
  isFullscreen,
  onToggleFullscreen,
  onOpenHudEditorFromMenu,
  onUpdateSettings,
  onStartWorld,
}) => {
  const [viewMode, setViewMode] = useState<'home' | 'play'>('home');
  const [playTab, setPlayTab] = useState<'worlds' | 'friends'>('worlds');

  const [worlds, setWorlds] = useState<WorldMetadata[]>(() =>
    SaveManager.listWorlds()
  );
  const [cloudSnap, setCloudSnap] = useState<CloudSyncSnapshot>(() =>
    firebaseCloudSync.getSnapshot()
  );
  const [accountAppearance, setAccountAppearance] = useState<PlayerAppearance>(
    () => SaveManager.getAccountAppearance()
  );
  const [previewDir, setPreviewDir] = useState<Direction>('down');

  // Modals on Home / Play screens
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showGlobalOptionsModal, setShowGlobalOptionsModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Create New World Modal State (Section 5.2)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState('Vale Encantado');
  const [newWorldSeed, setNewWorldSeed] = useState('');
  const [newWorldDifficulty, setNewWorldDifficulty] = useState<
    'normal' | 'survival' | 'hardcore'
  >('normal');
  const [newWorldOnlineEnabled, setNewWorldOnlineEnabled] = useState(false);

  // Manage Existing World Modal State (Section 5.3 & 5.5)
  const [managingWorld, setManagingWorld] = useState<WorldMetadata | null>(
    null
  );
  const [editName, setEditName] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<
    'normal' | 'survival' | 'hardcore'
  >('normal');
  const [editOnlineEnabled, setEditOnlineEnabled] = useState(false);
  const [confirmDeleteWorld, setConfirmDeleteWorld] =
    useState<WorldMetadata | null>(null);
  const [manageFeedback, setManageFeedback] = useState<string | null>(null);
  const [seedCopiedId, setSeedCopiedId] = useState<string | null>(null);
  const [loadingWorldId, setLoadingWorldId] = useState<string | null>(null);

  // Import World File Input
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importBanner, setImportBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Friends, Player ID, Search, Join Request & Invite Code State (Sections 4, 6, 7)
  const [myPublicId, setMyPublicId] = useState<string>(() =>
    SaveManager.getPlayerPublicId()
  );
  const [myUsername, setMyUsername] = useState<string>(() =>
    SaveManager.getEffectiveUsername()
  );
  const [copiedMyId, setCopiedMyId] = useState(false);

  const [friendsList, setFriendsList] = useState<FriendProfileEntry[]>(() =>
    SaveManager.getFriendsList()
  );
  const [friendsStatusMap, setFriendsStatusMap] = useState<
    Record<string, FriendLiveStatus>
  >({});
  const [isLoadingFriendsStatus, setIsLoadingFriendsStatus] = useState(false);

  const [searchIdInput, setSearchIdInput] = useState('');
  const [searchUsernameInput, setSearchUsernameInput] = useState('');
  const [searchResults, setSearchResults] = useState<
    { playerPublicId: string; username: string }[]
  >([]);
  const [isSearchingPlayers, setIsSearchingPlayers] = useState(false);
  const [friendsMessage, setFriendsMessage] = useState<{
    type: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);

  // Direct Invite Code Join (Section 7)
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isJoiningByCode, setIsJoiningByCode] = useState(false);

  // Pending Join Request to a Friend's World (Section 6.2)
  const [activeJoinRequest, setActiveJoinRequest] =
    useState<WorldJoinRequestInfo | null>(null);

  const refreshLocalWorlds = useCallback(() => {
    setWorlds(SaveManager.listWorlds());
  }, []);

  useEffect(() => {
    void SaveManager.hydrateFromIndexedDB().then((hydrated) => {
      setWorlds(hydrated);
    });
  }, []);

  useEffect(() => {
    const unsub = firebaseCloudSync.subscribe((snap) => {
      setCloudSnap(snap);
      const signedIn = Boolean(snap.user);
      setMyPublicId(SaveManager.getPlayerPublicId(snap.user?.uid));
      setMyUsername(SaveManager.getEffectiveUsername(signedIn));
      setAccountAppearance(SaveManager.getAccountAppearance());
      setFriendsList(SaveManager.getFriendsList());
      setWorlds(SaveManager.listWorlds());
    });
    return unsub;
  }, []);

  // Report presence on menu and sync profile on mount
  useEffect(() => {
    const syncInitialPresence = async () => {
      try {
        const pubId = SaveManager.getPlayerPublicId();
        const uname = SaveManager.getEffectiveUsername();
        const slotsInfo = SaveManager.getAppearanceSlots();
        const res = await fetch('/api/social/sync-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: cloudSnap.user?.uid || null,
            playerPublicId: pubId,
            username: uname,
            appearanceSlots: slotsInfo.slots,
            activeAppearanceSlotIndex: slotsInfo.activeIndex,
            accountAppearance: SaveManager.getAccountAppearance(),
            friendsList: SaveManager.getFriendsList(),
            deletedWorldIds: Array.from(SaveManager.getDeletedWorldIds()),
            presence: {
              isOnline: true,
              inOpenWorld: false,
              worldId: null,
              worldName: null,
              inviteCode: null,
            },
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.profile?.friendsList)) {
            SaveManager.setFriendsList(json.profile.friendsList);
            setFriendsList(json.profile.friendsList);
          }
          if (Array.isArray(json?.friendsStatus)) {
            const map: Record<string, FriendLiveStatus> = {};
            for (const st of json.friendsStatus) {
              if (st && st.playerPublicId) map[st.playerPublicId] = st;
            }
            setFriendsStatusMap(map);
          }
        }
      } catch {
        // ignore offline
      }
    };
    void syncInitialPresence();
  }, [cloudSnap.user?.uid]);

  // Section 6.1: Poll friends presence ONLY when the Friends section is open
  const pollFriendsPresence = useCallback(async () => {
    setIsLoadingFriendsStatus(true);
    try {
      const pubId = SaveManager.getPlayerPublicId();
      const uname = SaveManager.getEffectiveUsername();
      const res = await fetch('/api/social/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerPublicId: pubId,
          username: uname,
          isOnline: true,
          inOpenWorld: false,
          worldId: null,
          worldName: null,
          inviteCode: null,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.friendsList)) {
          setFriendsList(json.friendsList);
        }
        if (Array.isArray(json?.friendsStatus)) {
          const nextMap: Record<string, FriendLiveStatus> = {};
          for (const st of json.friendsStatus) {
            if (st && st.playerPublicId) {
              nextMap[st.playerPublicId] = st;
            }
          }
          setFriendsStatusMap(nextMap);
        }
      }
    } catch {
      // ignore offline
    } finally {
      setIsLoadingFriendsStatus(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode !== 'play' || playTab !== 'friends') return;
    void pollFriendsPresence();
    const intervalId = window.setInterval(() => {
      void pollFriendsPresence();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [viewMode, playTab, pollFriendsPresence]);

  // Section 6.2: Poll active join request when waiting for host authorization
  useEffect(() => {
    if (!activeJoinRequest || activeJoinRequest.status !== 'PENDING') return;
    let cancelled = false;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/social/join-request/${encodeURIComponent(
            activeJoinRequest.requestId
          )}`
        );
        if (!res.ok) {
          if (!cancelled) {
            setActiveJoinRequest(null);
            setFriendsMessage({
              type: 'error',
              text: 'A solicitação de entrada expirou.',
            });
          }
          return;
        }
        const json = await res.json();
        const reqData = json?.request as WorldJoinRequestInfo | undefined;
        if (!reqData || cancelled) return;

        if (reqData.status === 'ACCEPTED' && reqData.inviteCode) {
          setActiveJoinRequest(null);
          await handleConnectToInviteCode(reqData.inviteCode);
        } else if (reqData.status === 'DECLINED') {
          setActiveJoinRequest(null);
          setFriendsMessage({
            type: 'error',
            text: `O anfitrião recusou a solicitação para entrar em "${reqData.worldName}".`,
          });
        }
      } catch {
        // ignore transient error
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJoinRequest]);

  // Character sprite preview on Initial Screen
  const characterSpriteUrl = (() => {
    const dummyPlayer = {
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
      appearance: accountAppearance,
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

    const c = spriteAtlas.getPlayerSprite(previewDir, 0, dummyPlayer);
    return c.toDataURL();
  })();

  const handleDynamicFriendsOrLoginButton = async () => {
    if (cloudSnap.user) {
      setPlayTab('friends');
      setViewMode('play');
      return;
    }
    setIsLoggingIn(true);
    try {
      const ok = await firebaseCloudSync.signInWithGoogle();
      if (ok) {
        refreshLocalWorlds();
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePlayExistingWorld = async (worldId: string) => {
    setLoadingWorldId(worldId);
    try {
      const fullWorld = await SaveManager.loadWorldGuaranteed(worldId);
      if (fullWorld) {
        onStartWorld(fullWorld, null);
      }
    } finally {
      setLoadingWorldId(null);
    }
  };

  const handleConfirmCreateWorld = () => {
    const cleanName = newWorldName.trim() || 'Vale Encantado';
    const created = SaveManager.createNewWorld(
      cleanName,
      newWorldSeed,
      newWorldDifficulty,
      newWorldOnlineEnabled
    );
    if (cloudSnap.user) {
      firebaseCloudSync.enqueueWorldSync(created.metadata.id, 'world_create');
    }
    setShowCreateModal(false);
    refreshLocalWorlds();
    onStartWorld(created, null);
  };

  const openManageWorldModal = (w: WorldMetadata) => {
    setManagingWorld(w);
    setEditName(w.name);
    setEditDifficulty(w.difficulty);
    setEditOnlineEnabled(Boolean(w.onlineEnabled));
    setManageFeedback(null);
  };

  const handleSaveWorldManagement = () => {
    if (!managingWorld) return;
    const updated = SaveManager.updateWorldMetadata(
      managingWorld.id,
      editName,
      editDifficulty,
      editOnlineEnabled
    );
    if (updated) {
      setManagingWorld({ ...updated });
      refreshLocalWorlds();
      setManageFeedback('Alterações salvas com sucesso!');
      window.setTimeout(() => setManageFeedback(null), 2000);
    }
  };

  const handleCreateWorldCopy = async () => {
    if (!managingWorld) return;
    const copy = await SaveManager.duplicateWorld(managingWorld.id);
    if (copy) {
      refreshLocalWorlds();
      setManageFeedback('Cópia do mundo criada com sucesso!');
      window.setTimeout(() => setManageFeedback(null), 2200);
    }
  };

  const handleDownloadManagedWorld = async () => {
    if (!managingWorld) return;
    const full = await SaveManager.loadWorldGuaranteed(managingWorld.id);
    if (full) {
      SaveManager.downloadWorldFile(full);
      setManageFeedback('Download iniciado!');
      window.setTimeout(() => setManageFeedback(null), 2000);
    }
  };

  const handleConfirmPermanentDelete = () => {
    if (!confirmDeleteWorld) return;
    const targetId = confirmDeleteWorld.id;
    SaveManager.deleteWorld(targetId, settings);
    setConfirmDeleteWorld(null);
    if (managingWorld?.id === targetId) {
      setManagingWorld(null);
    }
    refreshLocalWorlds();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const result = SaveManager.importWorldFromJson(content);
      if (result.ok && result.world) {
        refreshLocalWorlds();
        setImportBanner({
          type: 'success',
          text: `Mundo "${result.world.metadata.name}" importado com sucesso!`,
        });
      } else {
        setImportBanner({
          type: 'error',
          text: result.error || 'Erro ao importar arquivo de mundo.',
        });
      }
      window.setTimeout(() => setImportBanner(null), 4000);
    };
    reader.readAsText(file);
  };

  // Friends Search & Actions
  const handleCopyMyId = () => {
    navigator.clipboard?.writeText(myPublicId).catch(() => {});
    setCopiedMyId(true);
    window.setTimeout(() => setCopiedMyId(false), 1800);
  };

  const handleSearchById = async () => {
    const clean = searchIdInput.trim().toUpperCase();
    if (!clean) return;
    setIsSearchingPlayers(true);
    setFriendsMessage(null);
    try {
      const res = await fetch(
        `/api/social/search?playerId=${encodeURIComponent(
          clean
        )}&excludeId=${encodeURIComponent(myPublicId)}`
      );
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json?.results) ? json.results : [];
        setSearchResults(list);
        if (list.length === 0) {
          setFriendsMessage({
            type: 'info',
            text: 'Nenhum jogador encontrado com este ID.',
          });
        }
      }
    } catch {
      setFriendsMessage({
        type: 'error',
        text: 'Erro ao buscar jogador por ID.',
      });
    } finally {
      setIsSearchingPlayers(false);
    }
  };

  const handleSearchByUsername = async () => {
    const clean = searchUsernameInput.trim();
    if (!clean) return;
    setIsSearchingPlayers(true);
    setFriendsMessage(null);
    try {
      const res = await fetch(
        `/api/social/search?username=${encodeURIComponent(
          clean
        )}&excludeId=${encodeURIComponent(myPublicId)}`
      );
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json?.results) ? json.results : [];
        setSearchResults(list);
        if (list.length === 0) {
          setFriendsMessage({
            type: 'info',
            text: 'Nenhum jogador encontrado com este username.',
          });
        }
      }
    } catch {
      setFriendsMessage({
        type: 'error',
        text: 'Erro ao buscar jogadores por username.',
      });
    } finally {
      setIsSearchingPlayers(false);
    }
  };

  const handleAddFriend = async (targetPublicId: string) => {
    setFriendsMessage(null);
    try {
      const res = await fetch('/api/social/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myPublicId,
          myUsername,
          targetPublicId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setFriendsMessage({
          type: 'error',
          text: json?.error || 'Não foi possível adicionar este jogador.',
        });
        return;
      }
      if (Array.isArray(json.friendsList)) {
        SaveManager.setFriendsList(json.friendsList);
        setFriendsList(json.friendsList);
      }
      if (Array.isArray(json.friendsStatus)) {
        const nextMap: Record<string, FriendLiveStatus> = {};
        for (const st of json.friendsStatus) {
          if (st && st.playerPublicId) nextMap[st.playerPublicId] = st;
        }
        setFriendsStatusMap(nextMap);
      }
      setFriendsMessage({
        type: 'success',
        text: 'Amigo adicionado e sincronizado com sua conta!',
      });
    } catch {
      setFriendsMessage({
        type: 'error',
        text: 'Erro de conexão ao adicionar amigo.',
      });
    }
  };

  const handleRemoveFriend = async (targetPublicId: string) => {
    try {
      const res = await fetch('/api/social/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myPublicId,
          targetPublicId,
        }),
      });
      const json = await res.json();
      if (res.ok && json?.ok && Array.isArray(json.friendsList)) {
        SaveManager.setFriendsList(json.friendsList);
        setFriendsList(json.friendsList);
      }
    } catch {
      // ignore
    }
  };

  const handleRequestJoinFriendWorld = async (targetPublicId: string) => {
    setFriendsMessage(null);
    try {
      const res = await fetch('/api/social/join-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterPublicId: myPublicId,
          requesterName: myUsername,
          targetPublicId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json.request) {
        setFriendsMessage({
          type: 'error',
          text:
            json?.error ||
            'Não foi possível solicitar entrada no mundo deste amigo.',
        });
        return;
      }
      setActiveJoinRequest(json.request as WorldJoinRequestInfo);
    } catch {
      setFriendsMessage({
        type: 'error',
        text: 'Erro ao enviar solicitação de entrada.',
      });
    }
  };

  const handleConnectToInviteCode = async (rawCode: string) => {
    const cleanCode = rawCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    if (cleanCode.length < 4) {
      setFriendsMessage({
        type: 'error',
        text: 'Digite um código de convite válido.',
      });
      return;
    }
    setIsJoiningByCode(true);
    setFriendsMessage(null);
    try {
      const result = await MultiplayerManager.joinWorldByCode(
        cleanCode,
        myUsername,
        settings.customServerUrl
      );
      if (!result.ok || !result.worldSave || !result.manager) {
        setFriendsMessage({
          type: 'error',
          text:
            result.error ||
            'Código de convite inválido ou mundo não está aberto.',
        });
        result.manager?.disconnect(false);
        return;
      }
      onStartWorld(result.worldSave, result.manager);
    } finally {
      setIsJoiningByCode(false);
    }
  };

  const isSyncing =
    cloudSnap.syncStatus === 'SYNCING' || cloudSnap.reconciliation.active;

  return (
    <div className="fixed inset-0 bg-[#0d0805] text-[#f3e5c8] flex flex-col overflow-hidden select-none">
      {/* Subtle atmospheric background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-35"
        style={{
          background:
            'radial-gradient(circle at 50% 32%, rgba(217, 119, 6, 0.22), rgba(18, 12, 8, 0.96) 72%)',
        }}
      />

      {/* Hidden File Input for World Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />

      {/* ====================================================================
          VIEW 1: TELA INICIAL (SONHO ENCANTADO)
         ==================================================================== */}
      {viewMode === 'home' && (
        <div className="relative z-10 flex-1 flex flex-col justify-between p-4 sm:p-6">
          {/* Top spacer for balanced vertical centering */}
          <div className="h-4 shrink-0" />

          {/* Main Split Area: Center (Title + 3 Buttons) & Right (Character + Pencil) */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
              {/* Left balance column on wide screens */}
              <div className="hidden sm:block sm:col-span-2" />

              {/* 1.1. Center Area: Title + 3 Buttons in strict order */}
              <div className="sm:col-span-6 flex flex-col items-center text-center space-y-6">
                <div className="space-y-1.5">
                  <h1 className="font-geologica text-3xl sm:text-5xl font-black tracking-tight text-amber-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.85)] uppercase">
                    SONHO ENCANTADO
                  </h1>
                </div>

                <div className="w-full max-w-xs flex flex-col gap-3">
                  {/* 1. Jogar */}
                  <button
                    onClick={() => {
                      setPlayTab('worlds');
                      setViewMode('play');
                    }}
                    className="w-full min-h-[48px] py-3 px-6 medieval-btn-emerald font-pixel text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Jogar</span>
                  </button>

                  {/* 2. Opções */}
                  <button
                    onClick={() => setShowGlobalOptionsModal(true)}
                    className="w-full min-h-[46px] py-2.5 px-6 medieval-btn-gold font-pixel text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Opções</span>
                  </button>

                  {/* 3. Amigos / Login (Dynamic) */}
                  <button
                    onClick={handleDynamicFriendsOrLoginButton}
                    disabled={isLoggingIn}
                    className="w-full min-h-[46px] py-2.5 px-6 medieval-btn-wood font-pixel text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {cloudSnap.user ? (
                      <>
                        <Users className="w-4 h-4 text-amber-300" />
                        <span>Amigos</span>
                      </>
                    ) : isLoggingIn ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 text-amber-300" />
                        <span>Login</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 1.2. Right Side: Character Representation + Small Pencil Button Below */}
              <div className="sm:col-span-4 flex flex-col items-center justify-center gap-2.5">
                <div
                  onClick={() => {
                    const order: Direction[] = ['down', 'right', 'up', 'left'];
                    setPreviewDir(
                      order[(order.indexOf(previewDir) + 1) % order.length]
                    );
                  }}
                  title="Clique para girar o personagem"
                  className="w-32 h-32 sm:w-36 sm:h-36 medieval-panel bg-[#160e09]/90 border-2 border-[#6e4930] flex items-center justify-center cursor-pointer shadow-xl relative group"
                >
                  <img
                    src={characterSpriteUrl}
                    alt="Personagem"
                    className="w-24 h-24 sm:w-28 sm:h-28 pixelated transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-[#e5d5b5] truncate max-w-[150px]">
                    {myUsername}
                  </span>
                  <button
                    onClick={() => setShowAppearanceModal(true)}
                    title="Personalizar aparência e username"
                    className="min-h-[36px] min-w-[36px] px-3 py-1.5 medieval-btn-gold flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 1.3. Bottom-Left Corner: Discreet Account Button */}
          <div className="flex items-center justify-between pt-2 shrink-0">
            <button
              onClick={() => setShowAccountModal(true)}
              className="medieval-panel px-3 py-2 bg-[#18100a]/95 hover:border-amber-500/70 transition-colors flex items-center gap-2.5"
            >
              {cloudSnap.user ? (
                <>
                  {cloudSnap.user.photoURL ? (
                    <img
                      src={cloudSnap.user.photoURL}
                      alt={myUsername}
                      className="w-7 h-7 rounded border border-emerald-400 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 bg-[#2a1b10] border border-emerald-400 flex items-center justify-center text-[10px] font-bold text-amber-300">
                      {myUsername.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="text-left">
                    <div className="text-xs font-bold text-[#f3e5c8] leading-tight max-w-[140px] truncate">
                      {myUsername}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Conectado</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 px-1 py-0.5 text-xs font-pixel font-bold text-amber-300 uppercase">
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Login</span>
                </div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 2: TELA DE JOGAR (1. MUNDOS | 2. AMIGOS)
         ==================================================================== */}
      {viewMode === 'play' && (
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
          {/* Top Navigation Bar */}
          <div className="px-3 sm:px-5 py-2.5 bg-[#160f0a] border-b-2 border-[#4a301e] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('home')}
                className="min-h-[36px] px-3 medieval-btn-wood text-xs font-pixel font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Início</span>
              </button>

              {/* Section Tabs: 1. Mundos | 2. Amigos */}
              <div className="flex items-center gap-1.5 bg-[#0e0905] p-1 border border-[#4a301e]">
                <button
                  onClick={() => setPlayTab('worlds')}
                  className={`min-h-[34px] px-4 text-xs font-pixel font-bold uppercase flex items-center gap-1.5 ${
                    playTab === 'worlds'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Mundos</span>
                </button>
                <button
                  onClick={() => setPlayTab('friends')}
                  className={`min-h-[34px] px-4 text-xs font-pixel font-bold uppercase flex items-center gap-1.5 ${
                    playTab === 'friends'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Amigos</span>
                </button>
              </div>
            </div>

            {/* Discreet General Sync Status Indicator in Header (Section 5.1) */}
            <button
              onClick={() => setShowAccountModal(true)}
              className="px-2.5 py-1.5 bg-[#1f140d] border border-[#5c3c24] hover:border-amber-400/60 flex items-center gap-2 text-[11px]"
              title="Ver status da conta e sincronização"
            >
              {cloudSnap.user ? (
                isSyncing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span className="text-amber-300 font-semibold">
                      Sincronizando...
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-semibold">
                      Mundos sincronizados
                    </span>
                  </>
                )
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-[#c4ab7d]" />
                  <span className="text-[#c4ab7d] font-semibold">
                    Salvo localmente
                  </span>
                </>
              )}
            </button>
          </div>

          {/* ================================================================
              TAB 1: MUNDOS (Section 5)
             ================================================================ */}
          {playTab === 'worlds' && (
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Action Bar: Criar novo mundo + Importar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      setNewWorldName('Vale Encantado');
                      setNewWorldSeed('');
                      setNewWorldDifficulty('normal');
                      setNewWorldOnlineEnabled(false);
                      setShowCreateModal(true);
                    }}
                    className="min-h-[42px] px-5 medieval-btn-emerald font-pixel text-xs font-bold uppercase flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar novo mundo</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 medieval-btn-wood text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-300" />
                    <span>Importar mundo</span>
                  </button>
                </div>

                {importBanner && (
                  <div
                    className={`p-2.5 border text-xs font-bold flex items-center justify-between ${
                      importBanner.type === 'success'
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                        : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                    }`}
                  >
                    <span>{importBanner.text}</span>
                    <button onClick={() => setImportBanner(null)}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Worlds List */}
                {worlds.length === 0 ? (
                  <div className="medieval-panel p-8 text-center space-y-3">
                    <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
                    <div className="space-y-1">
                      <h3 className="font-pixel text-sm font-bold text-amber-300 uppercase">
                        Nenhum mundo criado ainda
                      </h3>
                      <p className="text-xs text-[#c4ab7d]">
                        Clique em &ldquo;Criar novo mundo&rdquo; para iniciar sua
                        jornada em Sonho Encantado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {worlds.map((w) => {
                      const diff =
                        DIFFICULTY_INFO[w.difficulty] || DIFFICULTY_INFO.normal;
                      const isOnline = Boolean(w.onlineEnabled);
                      const isLoadingThis = loadingWorldId === w.id;

                      return (
                        <div
                          key={w.id}
                          className="medieval-panel p-3.5 flex flex-col justify-between gap-3 bg-[#18100a]/95 hover:border-[#8c6d46] transition-colors"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 truncate">
                                {w.name}
                              </h3>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold border shrink-0 ${diff.badgeClass}`}
                              >
                                {diff.label}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#c4ab7d]">
                              <span>Dia {w.dayCount || 1}</span>
                              <span>•</span>
                              <span>Nível {w.playerLevel || 1}</span>
                              <span>•</span>
                              <span
                                className={
                                  isOnline
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-[#9c845c]'
                                }
                              >
                                {isOnline
                                  ? 'Online ativado'
                                  : 'Online desativado'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handlePlayExistingWorld(w.id)}
                              disabled={isLoadingThis}
                              className="flex-1 min-h-[38px] medieval-btn-emerald font-pixel text-xs font-bold uppercase flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                {isLoadingThis ? 'Abrindo...' : 'Jogar'}
                              </span>
                            </button>

                            <button
                              onClick={() => openManageWorldModal(w)}
                              title="Editar e gerenciar mundo"
                              className="min-h-[38px] min-w-[40px] px-2.5 medieval-btn-wood flex items-center justify-center"
                            >
                              <Edit3 className="w-4 h-4 text-amber-300" />
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

          {/* ================================================================
              TAB 2: AMIGOS (Sections 4, 6, 7)
             ================================================================ */}
          {playTab === 'friends' && (
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="max-w-4xl mx-auto space-y-3.5">
                {/* Active Join Request Waiting Banner (Section 6.2) */}
                {activeJoinRequest && (
                  <div className="medieval-panel p-3.5 border-2 border-amber-500/70 bg-[#23160c] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                      <div>
                        <div className="font-pixel text-xs font-bold text-amber-300 uppercase">
                          Aguardando autorização do anfitrião...
                        </div>
                        <div className="text-xs text-[#e5d5b5]">
                          Solicitação enviada para entrar em{' '}
                          <strong>{activeJoinRequest.worldName}</strong>.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveJoinRequest(null)}
                      className="px-3 py-1.5 medieval-btn-crimson text-xs font-bold shrink-0"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {friendsMessage && (
                  <div
                    className={`p-2.5 border text-xs font-bold flex items-center justify-between ${
                      friendsMessage.type === 'success'
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                        : friendsMessage.type === 'error'
                        ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                        : 'bg-amber-950/80 border-amber-500/50 text-amber-200'
                    }`}
                  >
                    <span>{friendsMessage.text}</span>
                    <button onClick={() => setFriendsMessage(null)}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Top Grid: My Player ID + Direct Invite Code Entry */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Section 4: My Player ID */}
                  <div className="medieval-panel p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[10px] font-bold text-amber-400 uppercase">
                        Seu ID de Jogador
                      </span>
                      <span className="text-[11px] font-bold text-[#e5d5b5]">
                        {myUsername}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 bg-[#0e0905] border border-[#5c3c24] font-mono text-sm font-bold text-amber-300 tracking-wider select-text">
                        {myPublicId}
                      </div>
                      <button
                        onClick={handleCopyMyId}
                        className="min-h-[38px] px-3 medieval-btn-gold text-xs font-pixel font-bold uppercase flex items-center gap-1.5"
                      >
                        {copiedMyId ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Section 7: Direct Join by World Invite Code */}
                  <div className="medieval-panel p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-pixel text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Código de Convite de Mundo</span>
                      </span>
                      <span className="text-[10px] text-[#c4ab7d]">
                        Entrada direta
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inviteCodeInput}
                        maxLength={8}
                        onChange={(e) =>
                          setInviteCodeInput(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            void handleConnectToInviteCode(inviteCodeInput);
                          }
                        }}
                        placeholder="Ex: AB12CD"
                        className="flex-1 px-3 py-2 bg-[#0e0905] border border-[#5c3c24] font-mono text-sm font-bold text-white uppercase focus:outline-none focus:border-emerald-400"
                      />
                      <button
                        onClick={() =>
                          void handleConnectToInviteCode(inviteCodeInput)
                        }
                        disabled={isJoiningByCode}
                        className="min-h-[38px] px-3.5 medieval-btn-emerald text-xs font-pixel font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isJoiningByCode ? 'Entrando...' : 'Entrar'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 4 & 5: Search Players by Player ID or by Username */}
                <div className="medieval-panel p-3.5 space-y-3">
                  <div className="font-pixel text-xs font-bold text-amber-300 uppercase">
                    Adicionar e Buscar Amigos
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Search/Add by Player ID */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={searchIdInput}
                        onChange={(e) =>
                          setSearchIdInput(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSearchById();
                        }}
                        placeholder="Buscar por ID (ex: SE-XXXX-XXXX)"
                        className="flex-1 px-2.5 py-2 bg-[#0e0905] border border-[#5c3c24] text-xs font-mono text-[#f3e5c8] uppercase focus:outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => void handleSearchById()}
                        disabled={isSearchingPlayers}
                        className="min-h-[36px] px-3 medieval-btn-gold text-xs font-bold flex items-center gap-1"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>ID</span>
                      </button>
                    </div>

                    {/* Search by Username */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={searchUsernameInput}
                        onChange={(e) => setSearchUsernameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSearchByUsername();
                        }}
                        placeholder="Buscar por Username..."
                        className="flex-1 px-2.5 py-2 bg-[#0e0905] border border-[#5c3c24] text-xs text-[#f3e5c8] focus:outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => void handleSearchByUsername()}
                        disabled={isSearchingPlayers}
                        className="min-h-[36px] px-3 medieval-btn-gold text-xs font-bold flex items-center gap-1"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Buscar</span>
                      </button>
                    </div>
                  </div>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="medieval-inset p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-pixel text-amber-300 uppercase">
                        <span>Resultados encontrados ({searchResults.length})</span>
                        <button
                          onClick={() => setSearchResults([])}
                          className="text-[#c4ab7d] hover:text-white"
                        >
                          Limpar
                        </button>
                      </div>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {searchResults.map((resItem) => {
                          const alreadyFriend = friendsList.some(
                            (f) => f.playerPublicId === resItem.playerPublicId
                          );
                          return (
                            <div
                              key={resItem.playerPublicId}
                              className="flex items-center justify-between gap-2 p-2 bg-[#120b07] border border-[#3d2616]"
                            >
                              <div>
                                <div className="text-xs font-bold text-[#f3e5c8]">
                                  {resItem.username}
                                </div>
                                <div className="text-[10px] font-mono text-amber-400">
                                  ID: {resItem.playerPublicId}
                                </div>
                              </div>
                              {alreadyFriend ? (
                                <span className="px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                                  Já é amigo
                                </span>
                              ) : (
                                <button
                                  onClick={() =>
                                    void handleAddFriend(resItem.playerPublicId)
                                  }
                                  className="px-3 py-1.5 medieval-btn-emerald text-[10px] font-pixel font-bold uppercase flex items-center gap-1"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Adicionar</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 6: Friends List & Live Status */}
                <div className="medieval-panel p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-pixel text-xs font-bold text-amber-300 uppercase flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Lista de Amigos ({friendsList.length})</span>
                    </h3>
                    <button
                      onClick={() => void pollFriendsPresence()}
                      className="px-2.5 py-1 medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          isLoadingFriendsStatus ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Atualizar</span>
                    </button>
                  </div>

                  {friendsList.length === 0 ? (
                    <div className="medieval-inset p-6 text-center text-xs text-[#c4ab7d]">
                      Sua lista de amigos está vazia. Busque pelo ID de jogador
                      ou pelo username acima para adicionar seus amigos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {friendsList.map((friend) => {
                        const live = friendsStatusMap[friend.playerPublicId];
                        const isOnline = Boolean(live?.isOnline);
                        const inOpenWorld = Boolean(live?.inOpenWorld);

                        return (
                          <div
                            key={friend.playerPublicId}
                            className="medieval-inset p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    isOnline
                                      ? 'bg-emerald-400'
                                      : 'bg-slate-600'
                                  }`}
                                />
                                <span className="text-sm font-bold text-[#f3e5c8]">
                                  {live?.username || friend.username}
                                </span>
                                <span className="text-[10px] font-mono text-[#c4ab7d]">
                                  ({friend.playerPublicId})
                                </span>
                              </div>

                              <div className="text-xs pl-4">
                                {!isOnline ? (
                                  <span className="text-[#8b7355]">
                                    Offline
                                  </span>
                                ) : inOpenWorld ? (
                                  <span className="text-emerald-400 font-semibold">
                                    Jogando em mundo aberto
                                    {live?.worldName
                                      ? `: ${live.worldName}`
                                      : ''}
                                  </span>
                                ) : (
                                  <span className="text-sky-300 font-semibold">
                                    Online
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {isOnline && inOpenWorld && (
                                <button
                                  onClick={() =>
                                    void handleRequestJoinFriendWorld(
                                      friend.playerPublicId
                                    )
                                  }
                                  disabled={Boolean(activeJoinRequest)}
                                  className="px-3.5 py-2 medieval-btn-emerald text-[11px] font-pixel font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <Wifi className="w-3.5 h-3.5" />
                                  <span>Solicitar entrada</span>
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  void handleRemoveFriend(friend.playerPublicId)
                                }
                                title="Remover amigo"
                                className="p-2 medieval-btn-crimson"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODAL: CRIAR NOVO MUNDO (Section 5.2)
         ==================================================================== */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-lg medieval-panel flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-[#1a110b] border-b-2 border-[#4a301e]">
              <h2 className="font-pixel text-xs font-bold text-amber-300 uppercase">
                Criar Novo Mundo
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto max-h-[82dvh]">
              {/* 1. Nome do mundo */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Nome do Mundo
                </label>
                <input
                  type="text"
                  value={newWorldName}
                  maxLength={32}
                  onChange={(e) => setNewWorldName(e.target.value)}
                  placeholder="Nome do seu mundo..."
                  className="w-full px-3 py-2 bg-[#0e0905] border border-[#6e4930] text-sm font-bold text-[#f3e5c8] focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* 2. Dificuldade */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Dificuldade
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'survival', 'hardcore'] as const).map((d) => {
                    const active = newWorldDifficulty === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewWorldDifficulty(d)}
                        className={`py-2 px-2 text-xs font-pixel font-bold uppercase ${
                          active ? 'medieval-btn-gold' : 'medieval-btn-wood'
                        }`}
                      >
                        {DIFFICULTY_INFO[d].label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#c4ab7d] pt-0.5">
                  {DIFFICULTY_INFO[newWorldDifficulty].desc}
                </p>
              </div>

              {/* 3. Seed */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Seed (Opcional)
                </label>
                <input
                  type="text"
                  value={newWorldSeed}
                  maxLength={24}
                  onChange={(e) => setNewWorldSeed(e.target.value)}
                  placeholder="Deixe vazio para gerar aleatoriamente"
                  className="w-full px-3 py-2 bg-[#0e0905] border border-[#6e4930] text-xs font-mono text-[#f3e5c8] focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* 4. Disponibilidade online */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Disponibilidade Online
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewWorldOnlineEnabled(true)}
                    className={`py-2.5 px-3 text-xs font-pixel font-bold uppercase flex items-center justify-center gap-1.5 ${
                      newWorldOnlineEnabled
                        ? 'medieval-btn-emerald'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Online ativado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewWorldOnlineEnabled(false)}
                    className={`py-2.5 px-3 text-xs font-pixel font-bold uppercase flex items-center justify-center gap-1.5 ${
                      !newWorldOnlineEnabled
                        ? 'medieval-btn-gold'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Online desativado</span>
                  </button>
                </div>
              </div>

              {/* Confirm & Start */}
              <div className="pt-2">
                <button
                  onClick={handleConfirmCreateWorld}
                  className="w-full min-h-[44px] medieval-btn-emerald font-pixel text-xs font-bold uppercase flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Criar e Iniciar Mundo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: EDIÇÃO E GERENCIAMENTO DO MUNDO (Section 5.3)
         ==================================================================== */}
      {managingWorld && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3"
          onClick={() => setManagingWorld(null)}
        >
          <div
            className="w-full max-w-lg medieval-panel flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-[#1a110b] border-b-2 border-[#4a301e]">
              <div>
                <h2 className="font-pixel text-xs font-bold text-amber-300 uppercase">
                  Gerenciar Mundo
                </h2>
                <p className="text-[11px] text-[#c4ab7d]">
                  Dia {managingWorld.dayCount || 1} • Nível{' '}
                  {managingWorld.playerLevel || 1} •{' '}
                  {managingWorld.exploredChunksCount || 0} regiões exploradas
                </p>
              </div>
              <button
                onClick={() => setManagingWorld(null)}
                className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto max-h-[82dvh]">
              {manageFeedback && (
                <div className="p-2 bg-emerald-950/80 border border-emerald-500/50 text-xs font-bold text-emerald-300 text-center">
                  {manageFeedback}
                </div>
              )}

              {/* Rename World */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Título do Mundo
                </label>
                <input
                  type="text"
                  value={editName}
                  maxLength={32}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0e0905] border border-[#6e4930] text-sm font-bold text-[#f3e5c8] focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Seed Display */}
              <div className="flex items-center justify-between p-2.5 medieval-inset">
                <div>
                  <div className="text-[10px] font-pixel text-amber-300 uppercase">
                    Seed do Mundo
                  </div>
                  <div className="font-mono text-xs font-bold text-white">
                    {managingWorld.seed}
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(String(managingWorld.seed))
                      .catch(() => {});
                    setSeedCopiedId(managingWorld.id);
                    window.setTimeout(() => setSeedCopiedId(null), 1600);
                  }}
                  className="px-3 py-1.5 medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                >
                  {seedCopiedId === managingWorld.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-300" />
                      <span>Copiar Seed</span>
                    </>
                  )}
                </button>
              </div>

              {/* Change Difficulty */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Dificuldade
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'survival', 'hardcore'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setEditDifficulty(d)}
                      className={`py-2 px-2 text-xs font-pixel font-bold uppercase ${
                        editDifficulty === d
                          ? 'medieval-btn-gold'
                          : 'medieval-btn-wood'
                      }`}
                    >
                      {DIFFICULTY_INFO[d].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Change Online Availability */}
              <div className="space-y-1">
                <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase">
                  Disponibilidade Online
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOnlineEnabled(true)}
                    className={`py-2 px-3 text-xs font-pixel font-bold uppercase flex items-center justify-center gap-1.5 ${
                      editOnlineEnabled
                        ? 'medieval-btn-emerald'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Online ativado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOnlineEnabled(false)}
                    className={`py-2 px-3 text-xs font-pixel font-bold uppercase flex items-center justify-center gap-1.5 ${
                      !editOnlineEnabled
                        ? 'medieval-btn-gold'
                        : 'medieval-btn-wood'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Online desativado</span>
                  </button>
                </div>
              </div>

              {/* Save Changes Button */}
              <button
                onClick={handleSaveWorldManagement}
                className="w-full min-h-[40px] medieval-btn-emerald font-pixel text-xs font-bold uppercase flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>

              {/* Secondary Management Actions: Copy, Download, Delete */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#3d2616]">
                <button
                  onClick={() => void handleCreateWorldCopy()}
                  className="py-2.5 px-2 medieval-btn-wood text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-300" />
                  <span>Criar Cópia</span>
                </button>

                <button
                  onClick={() => void handleDownloadManagedWorld()}
                  className="py-2.5 px-2 medieval-btn-wood text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-sky-300" />
                  <span>Baixar</span>
                </button>

                <button
                  onClick={() => setConfirmDeleteWorld(managingWorld)}
                  className="py-2.5 px-2 medieval-btn-crimson text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: CONFIRMAÇÃO DE EXCLUSÃO DEFINITIVA (Section 5.5)
         ==================================================================== */}
      {confirmDeleteWorld && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3"
          onClick={() => setConfirmDeleteWorld(null)}
        >
          <div
            className="w-full max-w-md medieval-panel p-4 space-y-4 border-2 border-rose-500/70"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-rose-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="font-pixel text-xs font-bold uppercase">
                Excluir Mundo Permanentemente
              </h3>
            </div>

            <p className="text-xs text-[#f3e5c8] leading-relaxed">
              Tem certeza que deseja excluir o mundo{' '}
              <strong className="text-amber-300">
                &ldquo;{confirmDeleteWorld.name}&rdquo;
              </strong>
              ? Este mundo também será excluído permanentemente dos dados
              sincronizados da sua conta na nuvem e não poderá ser recuperado.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => setConfirmDeleteWorld(null)}
                className="py-2.5 px-3 medieval-btn-wood text-xs font-pixel font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPermanentDelete}
                className="py-2.5 px-3 medieval-btn-crimson text-xs font-pixel font-bold uppercase flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODALS: APARÊNCIA, CONTA & OPÇÕES GERAIS
         ==================================================================== */}
      {showAppearanceModal && (
        <AccountAppearanceModal
          onClose={() => setShowAppearanceModal(false)}
          onAppearanceSaved={(updated) => setAccountAppearance(updated)}
          onUsernameSaved={(newUname) => {
            setMyUsername(newUname);
            onUpdateSettings({
              ...settings,
              playerName: newUname,
              accountUsername: newUname,
            });
          }}
        />
      )}

      {showAccountModal && (
        <CloudAccountModal
          onClose={() => setShowAccountModal(false)}
          onWorldsUpdated={refreshLocalWorlds}
        />
      )}

      {showGlobalOptionsModal && (
        <PauseSettingsModal
          mode="global_only"
          settings={settings}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onOpenHudEditor={() => {
            setShowGlobalOptionsModal(false);
            onOpenHudEditorFromMenu();
          }}
          onUpdateSettings={onUpdateSettings}
          onResume={() => setShowGlobalOptionsModal(false)}
        />
      )}

      <CloudSyncAutoModal onWorldsUpdated={refreshLocalWorlds} />
    </div>
  );
};
