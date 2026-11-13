import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
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
  UserCheck,
  UserPlus,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import {
  FirestoreQuotaResetInfo,
  getFirestoreQuotaResetInfo,
  onFirestoreWriteQuotaExhausted,
} from '../firebase';
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
  ActiveWorldSessionLockInfo,
  socialDirectoryClient,
} from '../game/network/SocialDirectoryClient';
import {
  CloudSyncSnapshot,
  firebaseCloudSync,
} from '../game/persistence/FirebaseCloudSync';
import { SaveManager } from '../game/persistence/SaveManager';
import { spriteAtlas } from '../game/rendering/SpriteAtlas';
import { AccountAppearanceModal } from './CharacterPetsModal';
import {
  BlockingSyncOperationModal,
  CloudAccountModal,
  CloudSyncAutoModal,
} from './CloudAccountModal';
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

interface SearchResultEntry {
  playerPublicId: string;
  username: string;
  isOnline?: boolean;
  inOpenWorld?: boolean;
  worldName?: string | null;
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
  // Navigation views:
  // - 'home': Initial Screen (SONHO ENCANTADO)
  // - 'play': Jogar Screen (Tab 1: Mundos | Tab 2: Amigos - Mundos Abertos & Convites)
  // - 'friends_hub': Hub Social de Amigos (Opened from Amigos button on Initial Screen)
  const [viewMode, setViewMode] = useState<'home' | 'play' | 'friends_hub'>(
    'home'
  );
  const [playTab, setPlayTab] = useState<'worlds' | 'friends'>('worlds');
  const [hubSection, setHubSection] = useState<'manage' | 'search'>('manage');

  const [worlds, setWorlds] = useState<WorldMetadata[]>(() =>
    SaveManager.listWorlds()
  );
  const [cloudSnap, setCloudSnap] = useState<CloudSyncSnapshot>(() =>
    firebaseCloudSync.getSnapshot()
  );
  const [quotaInfo, setQuotaInfo] = useState<FirestoreQuotaResetInfo>(() =>
    getFirestoreQuotaResetInfo()
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
  const [copiedFriendId, setCopiedFriendId] = useState<string | null>(null);

  const [friendsList, setFriendsList] = useState<FriendProfileEntry[]>(() =>
    SaveManager.getFriendsList()
  );
  const [friendsStatusMap, setFriendsStatusMap] = useState<
    Record<string, FriendLiveStatus>
  >({});
  const [isLoadingFriendsStatus, setIsLoadingFriendsStatus] = useState(false);

  // Dedicated Search State in Hub Social de Amigos
  const [searchIdInput, setSearchIdInput] = useState('');
  const [searchUsernameInput, setSearchUsernameInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultEntry[]>([]);
  const [isSearchingPlayers, setIsSearchingPlayers] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<{
    performed: boolean;
    mode: 'id' | 'username';
    query: string;
    count: number;
    error?: string;
  } | null>(null);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);

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

  // Blocking Sync Operation Modal State (for immediate-sync edits)
  const [blockingSyncState, setBlockingSyncState] = useState<{
    isOpen: boolean;
    title: string;
    processLabel: string;
    subprocessLabel: string;
    error: string | null;
  }>({
    isOpen: false,
    title: '',
    processLabel: '',
    subprocessLabel: '',
    error: null,
  });

  // Account Active World Session Conflict Modal State
  const [activeWorldConflict, setActiveWorldConflict] = useState<{
    isOpen: boolean;
    message: string;
    activeSession?: ActiveWorldSessionLockInfo | null;
  }>({
    isOpen: false,
    message: '',
    activeSession: null,
  });

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
      setQuotaInfo(getFirestoreQuotaResetInfo());
      const signedIn = Boolean(snap.user);
      setMyPublicId(SaveManager.getPlayerPublicId(snap.user?.uid));
      setMyUsername(SaveManager.getEffectiveUsername(signedIn));
      setAccountAppearance(SaveManager.getAccountAppearance());
      setFriendsList(SaveManager.getFriendsList());
      setWorlds(SaveManager.listWorlds());
    });
    const unsubQuota = onFirestoreWriteQuotaExhausted(() => {
      setQuotaInfo(getFirestoreQuotaResetInfo());
    });
    const quotaTimer = window.setInterval(() => {
      setQuotaInfo(getFirestoreQuotaResetInfo());
    }, 30000);
    return () => {
      unsub();
      unsubQuota();
      window.clearInterval(quotaTimer);
    };
  }, []);

  // Report presence on menu and sync profile on mount
  const syncMySocialProfileWithServer = useCallback(async () => {
    try {
      const signedIn = Boolean(cloudSnap.user);
      const pubId = SaveManager.getPlayerPublicId(cloudSnap.user?.uid);
      const localSettings = SaveManager.loadSettings();
      const slotsInfo = SaveManager.getAppearanceSlots();
      const json = await socialDirectoryClient.syncProfile({
        uid: cloudSnap.user?.uid || null,
        playerPublicId: pubId,
        username: localSettings.accountUsername || undefined,
        usernameUpdatedAt: localSettings.usernameUpdatedAt || 0,
        appearanceSlots: slotsInfo.slots,
        activeAppearanceSlotIndex: slotsInfo.activeIndex,
        accountAppearance: SaveManager.getAccountAppearance(),
        appearanceUpdatedAt: localSettings.appearanceUpdatedAt || 0,
        friendsList: SaveManager.getFriendsList(),
        removedFriendIds: Array.from(SaveManager.getRemovedFriendIds()),
        deletedWorldIds: Array.from(SaveManager.getDeletedWorldIds()),
        presence: {
          isOnline: true,
          inOpenWorld: false,
          worldId: null,
          worldName: null,
          inviteCode: null,
        },
      });
      if (json.ok) {
        setMyUsername(SaveManager.getEffectiveUsername(signedIn));
        setAccountAppearance(SaveManager.getAccountAppearance());
        setFriendsList(SaveManager.getFriendsList());
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
  }, [cloudSnap.user]);

  useEffect(() => {
    void syncMySocialProfileWithServer();
  }, [syncMySocialProfileWithServer]);

  // Poll friends presence when either Friends Hub or Play->Friends tab is open
  const pollFriendsPresence = useCallback(async () => {
    setIsLoadingFriendsStatus(true);
    try {
      const pubId = SaveManager.getPlayerPublicId();
      const uname = SaveManager.getEffectiveUsername();
      const json = await socialDirectoryClient.reportPresence({
        playerPublicId: pubId,
        username: uname,
        isOnline: true,
        inOpenWorld: false,
        worldId: null,
        worldName: null,
        inviteCode: null,
      });
      if (json.ok) {
        setFriendsList(SaveManager.getFriendsList());
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
    const isFriendsAreaActive =
      viewMode === 'friends_hub' ||
      (viewMode === 'play' && playTab === 'friends');
    if (!isFriendsAreaActive) return;

    void pollFriendsPresence();
    const intervalId = window.setInterval(() => {
      void pollFriendsPresence();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [viewMode, playTab, pollFriendsPresence]);

  // Poll active join request when waiting for host authorization
  useEffect(() => {
    if (!activeJoinRequest || activeJoinRequest.status !== 'PENDING') return;
    let cancelled = false;

    const timer = window.setInterval(async () => {
      try {
        const json = await socialDirectoryClient.pollJoinRequestStatus(
          activeJoinRequest.requestId
        );
        if (!json.ok || !json.request) {
          if (!cancelled) {
            setActiveJoinRequest(null);
            setFriendsMessage({
              type: 'error',
              text: 'A solicitação de entrada expirou.',
            });
          }
          return;
        }
        const reqData = json.request;
        if (cancelled) return;

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
      setViewMode('friends_hub');
      return;
    }
    setIsLoggingIn(true);
    try {
      const ok = await firebaseCloudSync.signInWithGoogle();
      setQuotaInfo(getFirestoreQuotaResetInfo());
      if (ok) {
        refreshLocalWorlds();
        setViewMode('friends_hub');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePlayExistingWorld = async (worldId: string) => {
    setLoadingWorldId(worldId);
    const targetMeta = worlds.find((w) => w.id === worldId);
    const targetName = targetMeta?.name || 'Mundo';

    setBlockingSyncState({
      isOpen: true,
      title: 'Verificando Sessão da Conta',
      processLabel: `Preparando abertura de "${targetName}"`,
      subprocessLabel:
        'Subprocesso: Verificando se já existe outro mundo aberto nesta mesma conta em outra aba ou dispositivo...',
      error: null,
    });

    try {
      const lockCheck =
        await socialDirectoryClient.acquireAccountWorldSessionLock({
          playerPublicId: myPublicId,
          worldId,
          worldName: targetName,
        });

      if (!lockCheck.ok || lockCheck.conflict) {
        setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
        setActiveWorldConflict({
          isOpen: true,
          message:
            lockCheck.error ||
            'Esta conta já está com um mundo aberto em outra sessão ou dispositivo. Feche o mundo na outra sessão antes de abrir um mundo aqui para evitar conflito nos saves.',
          activeSession: lockCheck.activeSession || null,
        });
        return;
      }

      setBlockingSyncState((prev) => ({
        ...prev,
        subprocessLabel:
          'Subprocesso: Carregando dados do mundo do armazenamento seguro...',
      }));

      const fullWorld = await SaveManager.loadWorldGuaranteed(worldId);
      setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));

      if (fullWorld) {
        onStartWorld(fullWorld, null);
      } else {
        await socialDirectoryClient.releaseAccountWorldSessionLock(myPublicId);
      }
    } catch (err: any) {
      setBlockingSyncState((prev) => ({
        ...prev,
        error: err?.message || 'Erro ao verificar ou carregar o mundo.',
      }));
    } finally {
      setLoadingWorldId(null);
    }
  };

  const handleConfirmCreateWorld = async () => {
    const cleanName = newWorldName.trim() || 'Vale Encantado';

    setBlockingSyncState({
      isOpen: true,
      title: 'Verificando Sessão e Criando Mundo',
      processLabel: `Criando mundo "${cleanName}"`,
      subprocessLabel:
        'Subprocesso: Verificando se já existe outro mundo aberto nesta mesma conta...',
      error: null,
    });

    const lockCheck =
      await socialDirectoryClient.acquireAccountWorldSessionLock({
        playerPublicId: myPublicId,
        worldId: `creating_${Date.now()}`,
        worldName: cleanName,
      });

    if (!lockCheck.ok || lockCheck.conflict) {
      setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
      setActiveWorldConflict({
        isOpen: true,
        message:
          lockCheck.error ||
          'Esta conta já está com um mundo aberto em outra sessão ou dispositivo. Feche o mundo na outra sessão antes de criar ou abrir um mundo aqui.',
        activeSession: lockCheck.activeSession || null,
      });
      return;
    }

    const created = SaveManager.createNewWorld(
      cleanName,
      newWorldSeed,
      newWorldDifficulty,
      newWorldOnlineEnabled
    );

    await socialDirectoryClient.acquireAccountWorldSessionLock({
      playerPublicId: myPublicId,
      worldId: created.metadata.id,
      worldName: created.metadata.name,
    });

    if (cloudSnap.user) {
      firebaseCloudSync.enqueueWorldSync(created.metadata.id, 'world_create');
    }

    setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
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

  const handleSaveWorldManagement = async () => {
    if (!managingWorld) return;
    setBlockingSyncState({
      isOpen: true,
      title: 'Salvando Alterações do Mundo',
      processLabel: `Atualizando "${editName.trim() || managingWorld.name}"`,
      subprocessLabel:
        'Subprocesso: Gravando configurações e sincronizando metadados do mundo...',
      error: null,
    });
    const updated = SaveManager.updateWorldMetadata(
      managingWorld.id,
      editName,
      editDifficulty,
      editOnlineEnabled
    );
    if (updated) {
      setManagingWorld({ ...updated });
      refreshLocalWorlds();
      if (cloudSnap.user) {
        try {
          await firebaseCloudSync.uploadWorldToCloud(updated.id);
        } catch {
          // queued fallback
        }
      }
      setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
      setManageFeedback('Alterações salvas e sincronizadas com sucesso!');
      window.setTimeout(() => setManageFeedback(null), 2000);
    } else {
      setBlockingSyncState((prev) => ({
        ...prev,
        error: 'Não foi possível salvar as alterações deste mundo.',
      }));
    }
  };

  const handleCreateWorldCopy = async () => {
    if (!managingWorld) return;
    setBlockingSyncState({
      isOpen: true,
      title: 'Duplicando Mundo',
      processLabel: `Criando cópia de "${managingWorld.name}"`,
      subprocessLabel:
        'Subprocesso: Clonando regiões e sincronizando novo mundo...',
      error: null,
    });
    const copy = await SaveManager.duplicateWorld(managingWorld.id);
    if (copy) {
      refreshLocalWorlds();
      if (cloudSnap.user) {
        firebaseCloudSync.enqueueWorldSync(copy.metadata.id, 'world_duplicate');
      }
      setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
      setManageFeedback('Cópia do mundo criada com sucesso!');
      window.setTimeout(() => setManageFeedback(null), 2200);
    } else {
      setBlockingSyncState((prev) => ({
        ...prev,
        error: 'Falha ao criar cópia do mundo.',
      }));
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

  const handleConfirmPermanentDelete = async () => {
    if (!confirmDeleteWorld) return;
    const targetId = confirmDeleteWorld.id;
    const targetName = confirmDeleteWorld.name;
    setBlockingSyncState({
      isOpen: true,
      title: 'Excluindo Mundo Permanentemente',
      processLabel: `Removendo "${targetName}"`,
      subprocessLabel:
        'Subprocesso: Excluindo mundo do armazenamento local e sincronizando exclusão na nuvem...',
      error: null,
    });
    SaveManager.deleteWorld(targetId, settings);
    await firebaseCloudSync.syncProfileAppearanceAndSettings();
    setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
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

  const handleCopyFriendId = (id: string) => {
    navigator.clipboard?.writeText(id).catch(() => {});
    setCopiedFriendId(id);
    window.setTimeout(() => setCopiedFriendId(null), 1600);
  };

  const normalizeCandidatePublicId = (raw: string): string => {
    const trimmed = raw.trim().toUpperCase();
    const alnum = trimmed.replace(/[^A-Z0-9]/g, '');
    if (alnum.length === 10 && alnum.startsWith('SE')) {
      return `SE-${alnum.slice(2, 6)}-${alnum.slice(6, 10)}`;
    }
    if (alnum.length === 8) {
      return `SE-${alnum.slice(0, 4)}-${alnum.slice(4, 8)}`;
    }
    return trimmed;
  };

  const handleSearchById = async () => {
    const clean = searchIdInput.trim().toUpperCase();
    if (!clean) {
      setSearchFeedback({
        performed: true,
        mode: 'id',
        query: '',
        count: 0,
        error: 'Digite o ID do jogador (ex: SE-XXXX-XXXX) antes de buscar.',
      });
      return;
    }

    setIsSearchingPlayers(true);
    setFriendsMessage(null);
    setSearchFeedback(null);
    try {
      await syncMySocialProfileWithServer();
      const res = await socialDirectoryClient.searchPlayers({
        playerId: clean,
        excludeId: myPublicId,
      });
      if (res.ok) {
        const list: SearchResultEntry[] = Array.isArray(res.results)
          ? res.results
          : [];
        setSearchResults(list);
        setSearchFeedback({
          performed: true,
          mode: 'id',
          query: clean,
          count: list.length,
        });
      } else {
        setSearchResults([]);
        setSearchFeedback({
          performed: true,
          mode: 'id',
          query: clean,
          count: 0,
          error:
            res.error || 'Não foi possível consultar o servidor no momento.',
        });
      }
    } catch {
      setSearchResults([]);
      setSearchFeedback({
        performed: true,
        mode: 'id',
        query: clean,
        count: 0,
        error: 'Erro de conexão ao buscar jogador por ID.',
      });
    } finally {
      setIsSearchingPlayers(false);
    }
  };

  const handleSearchByUsername = async () => {
    const clean = searchUsernameInput.trim();
    if (!clean) {
      setSearchFeedback({
        performed: true,
        mode: 'username',
        query: '',
        count: 0,
        error: 'Digite o nome de usuário (username) antes de buscar.',
      });
      return;
    }

    setIsSearchingPlayers(true);
    setFriendsMessage(null);
    setSearchFeedback(null);
    try {
      await syncMySocialProfileWithServer();
      const res = await socialDirectoryClient.searchPlayers({
        username: clean,
        excludeId: myPublicId,
      });
      if (res.ok) {
        const list: SearchResultEntry[] = Array.isArray(res.results)
          ? res.results
          : [];
        setSearchResults(list);
        setSearchFeedback({
          performed: true,
          mode: 'username',
          query: clean,
          count: list.length,
        });
      } else {
        setSearchResults([]);
        setSearchFeedback({
          performed: true,
          mode: 'username',
          query: clean,
          count: 0,
          error:
            res.error || 'Não foi possível consultar o servidor no momento.',
        });
      }
    } catch {
      setSearchResults([]);
      setSearchFeedback({
        performed: true,
        mode: 'username',
        query: clean,
        count: 0,
        error: 'Erro de conexão ao buscar jogadores por username.',
      });
    } finally {
      setIsSearchingPlayers(false);
    }
  };

  const handleAddFriend = async (
    rawTargetPublicId: string,
    fallbackUsername?: string
  ) => {
    const targetPublicId = normalizeCandidatePublicId(rawTargetPublicId);
    if (!targetPublicId) return;
    if (targetPublicId === myPublicId) {
      setFriendsMessage({
        type: 'error',
        text: 'Você não pode adicionar seu próprio ID como amigo.',
      });
      return;
    }

    setAddingFriendId(targetPublicId);
    setFriendsMessage(null);
    setBlockingSyncState({
      isOpen: true,
      title: 'Adicionando Amigo',
      processLabel: `Vinculando ${
        fallbackUsername || targetPublicId
      } à sua conta`,
      subprocessLabel:
        'Subprocesso: Confirmando adição mútua no diretório social e salvando na nuvem...',
      error: null,
    });
    try {
      const json = await socialDirectoryClient.addFriend({
        myPublicId,
        myUsername,
        targetPublicId,
        targetUsername: fallbackUsername || undefined,
      });
      if (!json?.ok) {
        setBlockingSyncState((prev) => ({
          ...prev,
          error: json?.error || 'Não foi possível adicionar este jogador.',
        }));
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

      await firebaseCloudSync.syncProfileAppearanceAndSettings();
      setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
      setFriendsMessage({
        type: 'success',
        text: `Jogador ${
          fallbackUsername || targetPublicId
        } adicionado com sucesso à sua lista de amigos!`,
      });
    } catch (err: any) {
      setBlockingSyncState((prev) => ({
        ...prev,
        error: err?.message || 'Erro ao adicionar amigo no servidor.',
      }));
    } finally {
      setAddingFriendId(null);
    }
  };

  const handleRemoveFriend = async (targetPublicId: string) => {
    setBlockingSyncState({
      isOpen: true,
      title: 'Removendo Amigo da Lista',
      processLabel: `Removendo conexão (${targetPublicId})`,
      subprocessLabel:
        'Subprocesso: Removendo amigo do diretório social e confirmando sincronização na conta...',
      error: null,
    });
    try {
      const json = await socialDirectoryClient.removeFriend({
        myPublicId,
        targetPublicId,
      });
      setFriendsList(json.friendsList);
      await firebaseCloudSync.syncProfileAppearanceAndSettings();
      setBlockingSyncState((prev) => ({ ...prev, isOpen: false, error: null }));
      setFriendsMessage({
        type: 'info',
        text: `Amigo (${targetPublicId}) removido da sua lista com sucesso.`,
      });
    } catch (err: any) {
      setFriendsList(SaveManager.getFriendsList());
      setBlockingSyncState((prev) => ({
        ...prev,
        error: err?.message || 'Erro ao sincronizar remoção do amigo.',
      }));
    }
  };

  const handleRequestJoinFriendWorld = async (targetPublicId: string) => {
    setFriendsMessage(null);
    try {
      const json = await socialDirectoryClient.sendJoinRequest({
        requesterPublicId: myPublicId,
        requesterName: myUsername,
        targetPublicId,
      });
      if (!json?.ok || !json.request) {
        setFriendsMessage({
          type: 'error',
          text:
            json?.error ||
            'Não foi possível solicitar entrada no mundo deste amigo.',
        });
        return;
      }
      if (json.request.status === 'ACCEPTED' && json.request.inviteCode) {
        await handleConnectToInviteCode(json.request.inviteCode);
        return;
      }
      setActiveJoinRequest(json.request);
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

  const hasQuotaOrInternalError =
    quotaInfo.isExhausted ||
    cloudSnap.syncStatus === 'ERROR' ||
    cloudSnap.reconciliation.hasErrors;

  const errorExplanationText = quotaInfo.isExhausted
    ? quotaInfo.errorReason
    : cloudSnap.reconciliation.errorSummary ||
      cloudSnap.statusMessage ||
      'Falha interna na sincronização com o banco de dados na nuvem.';

  // Friends currently playing in an open world (for Jogar -> Amigos tab)
  const friendsInOpenWorlds = friendsList.filter((friend) => {
    const live = friendsStatusMap[friend.playerPublicId];
    return Boolean(live?.isOnline && live?.inOpenWorld);
  });

  const onlineFriendsCount = friendsList.filter((friend) =>
    Boolean(friendsStatusMap[friend.playerPublicId]?.isOnline)
  ).length;

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
          {/* Top bar: Quota / Internal Error warning if present */}
          <div className="shrink-0">
            {hasQuotaOrInternalError && (
              <div
                onClick={() => setShowAccountModal(true)}
                className="max-w-3xl mx-auto p-2.5 bg-amber-950/90 border border-amber-500/70 flex flex-wrap items-center justify-between gap-2 text-xs cursor-pointer hover:border-amber-400"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[#f3e5c8] truncate">
                    <strong>Aviso Interno:</strong> {errorExplanationText}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#140c07] border border-amber-500/40 text-[11px] font-mono font-bold text-amber-300 shrink-0">
                  <Clock className="w-3 h-3" />
                  Reinicia em {quotaInfo.formattedCountdown} (às{' '}
                  {quotaInfo.resetLocalTimeFormatted})
                </span>
              </div>
            )}
          </div>

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

                  {/* 3. Amigos (Hub Social) / Login (Dynamic) */}
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

          {/* 1.3. Bottom-Left Corner: Discreet Account Button + Hub Social Shortcut */}
          <div className="flex items-center justify-between pt-2 shrink-0 gap-2">
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

            {!cloudSnap.user && (
              <button
                onClick={() => setViewMode('friends_hub')}
                className="px-3 py-2 medieval-btn-wood text-[11px] font-pixel font-bold uppercase flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-amber-300" />
                <span>Hub de Amigos</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 2: HUB SOCIAL DE AMIGOS (Acessado pelo botão Amigos da Tela Inicial)
          Separado em duas seções próprias:
          1. Meus Amigos (Gerenciar amigos existentes)
          2. Buscar e Adicionar Amigos (Busca com carregamento e feedback claro)
         ==================================================================== */}
      {viewMode === 'friends_hub' && (
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <div className="px-3 sm:px-5 py-2.5 bg-[#160f0a] border-b-2 border-[#4a301e] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setViewMode('home')}
                className="min-h-[36px] px-3 medieval-btn-wood text-xs font-pixel font-bold flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Início</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#2a1b10] border border-[#8c6d46] flex items-center justify-center">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 uppercase">
                    Hub Social de Amigos
                  </h2>
                  <p className="text-[11px] text-[#c4ab7d] hidden sm:block">
                    Gerencie sua lista de amigos e busque novos jogadores por ID
                    ou Username
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPlayTab('friends');
                  setViewMode('play');
                }}
                className="min-h-[36px] px-3 medieval-btn-emerald text-[11px] font-pixel font-bold uppercase flex items-center gap-1.5"
                title="Ver mundos abertos de amigos e código de convite"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Mundos de Amigos / Convite</span>
              </button>
            </div>
          </div>

          {/* Hub Content */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Player Identity Card */}
              <div className="medieval-panel p-3.5 bg-[#18100a]/95 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#120b07] border-2 border-[#6e4930] flex items-center justify-center shrink-0">
                    <img
                      src={characterSpriteUrl}
                      alt={myUsername}
                      className="w-10 h-10 pixelated"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#f3e5c8]">
                        {myUsername}
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                        {friendsList.length} Amigo(s) • {onlineFriendsCount}{' '}
                        Online
                      </span>
                    </div>
                    <div className="text-[11px] text-[#c4ab7d] mt-0.5">
                      Compartilhe seu ID abaixo para que seus amigos possam te
                      encontrar:
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 bg-[#0e0905] border border-[#5c3c24] font-mono text-xs sm:text-sm font-bold text-amber-300 tracking-wider select-text">
                    {myPublicId}
                  </div>
                  <button
                    onClick={handleCopyMyId}
                    className="min-h-[38px] px-3 medieval-btn-gold text-xs font-pixel font-bold uppercase flex items-center gap-1.5 shrink-0"
                  >
                    {copiedMyId ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar ID</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Active Join Request Banner */}
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

              {/* Feedback Message Banner */}
              {friendsMessage && (
                <div
                  className={`p-3 border text-xs font-bold flex items-center justify-between ${
                    friendsMessage.type === 'success'
                      ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                      : friendsMessage.type === 'error'
                      ? 'bg-rose-950/90 border-rose-500/60 text-rose-300'
                      : 'bg-amber-950/90 border-amber-500/60 text-amber-200'
                  }`}
                >
                  <span>{friendsMessage.text}</span>
                  <button onClick={() => setFriendsMessage(null)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Hub Section Selector Tabs:
                  1. Meus Amigos (Gerenciar Amigos Existentes)
                  2. Buscar e Adicionar Amigos (Seção Própria de Busca) */}
              <div className="grid grid-cols-2 gap-2 bg-[#120b07] p-1.5 border-2 border-[#4a301e]">
                <button
                  onClick={() => setHubSection('manage')}
                  className={`min-h-[42px] py-2 px-3 font-pixel text-xs font-bold uppercase flex items-center justify-center gap-2 ${
                    hubSection === 'manage'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Meus Amigos ({friendsList.length})</span>
                </button>
                <button
                  onClick={() => setHubSection('search')}
                  className={`min-h-[42px] py-2 px-3 font-pixel text-xs font-bold uppercase flex items-center justify-center gap-2 ${
                    hubSection === 'search'
                      ? 'medieval-btn-gold'
                      : 'medieval-btn-wood'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>Buscar e Adicionar Amigos</span>
                </button>
              </div>

              {/* ==============================================================
                  SEÇÃO 1 DO HUB: MEUS AMIGOS (GERENCIAR AMIGOS EXISTENTES)
                 ============================================================== */}
              {hubSection === 'manage' && (
                <div className="medieval-panel p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#3d2616] pb-2.5">
                    <div>
                      <h3 className="font-pixel text-xs font-bold text-amber-300 uppercase flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-400" />
                        <span>Gerenciar Amigos ({friendsList.length})</span>
                      </h3>
                      <p className="text-[11px] text-[#c4ab7d] mt-0.5">
                        Acompanhe o status dos seus amigos adicionados ou remova
                        conexões.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void pollFriendsPresence()}
                        className="px-3 py-1.5 medieval-btn-wood text-[11px] font-bold flex items-center gap-1.5"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            isLoadingFriendsStatus ? 'animate-spin' : ''
                          }`}
                        />
                        <span>Atualizar Status</span>
                      </button>
                      <button
                        onClick={() => setHubSection('search')}
                        className="px-3 py-1.5 medieval-btn-emerald text-[11px] font-pixel font-bold uppercase flex items-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+ Buscar Amigo</span>
                      </button>
                    </div>
                  </div>

                  {friendsList.length === 0 ? (
                    <div className="medieval-inset p-8 text-center space-y-3">
                      <Users className="w-8 h-8 text-amber-400/80 mx-auto" />
                      <div className="space-y-1">
                        <div className="font-pixel text-xs font-bold text-amber-300 uppercase">
                          Você ainda não adicionou amigos
                        </div>
                        <p className="text-xs text-[#c4ab7d] max-w-md mx-auto">
                          Use a seção &ldquo;Buscar e Adicionar Amigos&rdquo;
                          para procurar jogadores pelo ID ou Username, ou
                          adicione jogadores que estiverem no mesmo mundo online
                          que você!
                        </p>
                      </div>
                      <button
                        onClick={() => setHubSection('search')}
                        className="px-4 py-2.5 medieval-btn-emerald font-pixel text-xs font-bold uppercase inline-flex items-center gap-2"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Ir para Buscar e Adicionar Amigos</span>
                      </button>
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
                            className="medieval-inset p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                                  }`}
                                />
                                <span className="text-sm font-bold text-[#f3e5c8]">
                                  {live?.username || friend.username}
                                </span>
                                <span className="px-2 py-0.5 bg-[#0e0905] border border-[#3d2616] text-[10px] font-mono text-amber-300">
                                  {friend.playerPublicId}
                                </span>
                                <button
                                  onClick={() =>
                                    handleCopyFriendId(friend.playerPublicId)
                                  }
                                  className="text-[10px] text-[#c4ab7d] hover:text-white flex items-center gap-0.5"
                                  title="Copiar ID deste amigo"
                                >
                                  {copiedFriendId === friend.playerPublicId ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
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
                                    Online no menu
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
                                title="Remover amigo da sua lista"
                                className="px-2.5 py-2 medieval-btn-crimson text-[11px] font-bold flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">
                                  Remover
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ==============================================================
                  SEÇÃO 2 DO HUB: BUSCAR E ADICIONAR AMIGOS (SEÇÃO PRÓPRIA)
                 ============================================================== */}
              {hubSection === 'search' && (
                <div className="medieval-panel p-4 space-y-4">
                  <div className="border-b border-[#3d2616] pb-2.5">
                    <h3 className="font-pixel text-xs font-bold text-amber-300 uppercase flex items-center gap-2">
                      <Search className="w-4 h-4 text-amber-400" />
                      <span>Procurar e Adicionar Jogadores</span>
                    </h3>
                    <p className="text-[11px] text-[#c4ab7d] mt-0.5">
                      Busque pelo ID único do jogador (ex: SE-A1B2-C3D4) ou pelo
                      nome de usuário (Username).
                    </p>
                  </div>

                  {/* Two Search Boxes: By ID & By Username */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Box 1: Search by Player ID */}
                    <div className="medieval-inset p-3 space-y-2">
                      <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase block">
                        1. Buscar por ID de Jogador
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={searchIdInput}
                          onChange={(e) =>
                            setSearchIdInput(e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSearchById();
                          }}
                          placeholder="Ex: SE-1A2B-3C4D"
                          className="flex-1 px-3 py-2 bg-[#0e0905] border border-[#5c3c24] text-xs font-mono text-[#f3e5c8] uppercase focus:outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={() => void handleSearchById()}
                          disabled={isSearchingPlayers}
                          className="min-h-[38px] px-3.5 medieval-btn-gold text-xs font-pixel font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isSearchingPlayers ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5" />
                          )}
                          <span>Buscar ID</span>
                        </button>
                      </div>
                    </div>

                    {/* Box 2: Search by Username */}
                    <div className="medieval-inset p-3 space-y-2">
                      <label className="text-[11px] font-pixel font-bold text-amber-300 uppercase block">
                        2. Buscar por Username
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={searchUsernameInput}
                          onChange={(e) =>
                            setSearchUsernameInput(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              void handleSearchByUsername();
                          }}
                          placeholder="Digite o nome do jogador..."
                          className="flex-1 px-3 py-2 bg-[#0e0905] border border-[#5c3c24] text-xs text-[#f3e5c8] focus:outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={() => void handleSearchByUsername()}
                          disabled={isSearchingPlayers}
                          className="min-h-[38px] px-3.5 medieval-btn-gold text-xs font-pixel font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isSearchingPlayers ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5" />
                          )}
                          <span>Buscar Nome</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Search Loading & Feedback Panel */}
                  <div className="medieval-inset p-3.5 space-y-3">
                    {isSearchingPlayers ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2 text-amber-300">
                        <RefreshCw className="w-6 h-6 animate-spin" />
                        <span className="font-pixel text-xs font-bold uppercase">
                          Buscando jogadores no servidor...
                        </span>
                      </div>
                    ) : !searchFeedback ? (
                      <div className="py-4 text-center text-xs text-[#c4ab7d]">
                        Digite um ID ou Username acima e clique em buscar para
                        ver os resultados aqui.
                      </div>
                    ) : searchFeedback.error ? (
                      <div className="p-3 bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{searchFeedback.error}</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 bg-[#120b07] border border-[#3d2616] space-y-2 text-center">
                        <div className="font-pixel text-xs font-bold text-amber-300 uppercase">
                          Nenhum jogador encontrado para &ldquo;
                          {searchFeedback.query}&rdquo;
                        </div>
                        <p className="text-xs text-[#c4ab7d]">
                          {searchFeedback.mode === 'id'
                            ? 'Verifique se o ID de Jogador (formato SE-XXXX-XXXX) foi digitado corretamente.'
                            : 'Verifique se o Username foi digitado corretamente ou busque pelo ID de Jogador (SE-XXXX-XXXX).'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-pixel text-emerald-300 uppercase">
                          <span>
                            Busca concluída: {searchResults.length} jogador(es)
                            encontrado(s) para &ldquo;{searchFeedback.query}
                            &rdquo;
                          </span>
                          <button
                            onClick={() => {
                              setSearchResults([]);
                              setSearchFeedback(null);
                            }}
                            className="text-[#c4ab7d] hover:text-white text-[10px]"
                          >
                            Limpar busca
                          </button>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {searchResults.map((resItem) => {
                            const alreadyFriend = friendsList.some(
                              (f) => f.playerPublicId === resItem.playerPublicId
                            );
                            const isAddingThis =
                              addingFriendId === resItem.playerPublicId;

                            return (
                              <div
                                key={resItem.playerPublicId}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 bg-[#120b07] border border-[#4a301e]"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-2 h-2 rounded-full ${
                                        resItem.isOnline
                                          ? 'bg-emerald-400'
                                          : 'bg-slate-600'
                                      }`}
                                    />
                                    <span className="text-sm font-bold text-[#f3e5c8]">
                                      {resItem.username}
                                    </span>
                                    {resItem.isOnline && (
                                      <span className="text-[10px] font-bold text-emerald-400">
                                        {resItem.inOpenWorld
                                          ? `• Em Mundo Aberto (${
                                              resItem.worldName || 'Online'
                                            })`
                                          : '• Online'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-mono text-amber-400 pl-4">
                                    ID: {resItem.playerPublicId}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  {alreadyFriend ? (
                                    <span className="px-3 py-1.5 bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-pixel font-bold text-emerald-300 uppercase flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Já é seu amigo</span>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        void handleAddFriend(
                                          resItem.playerPublicId,
                                          resItem.username
                                        )
                                      }
                                      disabled={isAddingThis}
                                      className="px-3.5 py-2 medieval-btn-emerald text-[11px] font-pixel font-bold uppercase flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                      <UserPlus className="w-3.5 h-3.5" />
                                      <span>
                                        {isAddingThis
                                          ? 'Adicionando...'
                                          : 'Adicionar Amigo'}
                                      </span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          VIEW 3: TELA DE JOGAR (1. MUNDOS | 2. AMIGOS — MUNDOS ABERTOS & CONVITE)
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

              {/* Section Tabs: 1. Mundos | 2. Amigos (Mundos Online & Convite) */}
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
                  {friendsInOpenWorlds.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] rounded-full">
                      {friendsInOpenWorlds.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Discreet General Sync Status Indicator in Header (Section 5.1) */}
            <button
              onClick={() => setShowAccountModal(true)}
              className="px-2.5 py-1.5 bg-[#1f140d] border border-[#5c3c24] hover:border-amber-400/60 flex items-center gap-2 text-[11px]"
              title="Ver status da conta e sincronização"
            >
              {hasQuotaOrInternalError ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300 font-semibold">
                    Cota reinicia em {quotaInfo.formattedCountdown}
                  </span>
                </>
              ) : cloudSnap.user ? (
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
                {/* Quota / Internal Error Diagnostic Banner inside Worlds */}
                {hasQuotaOrInternalError && (
                  <div className="medieval-panel p-3 border-2 border-amber-500/70 bg-[#23150b] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-pixel text-[11px] font-bold text-amber-300 uppercase">
                          Aviso de Sincronização na Nuvem
                        </div>
                        <div className="text-[#f3e5c8]">
                          <strong>Erro:</strong> {errorExplanationText}
                        </div>
                        <div className="text-amber-200/90 text-[11px]">
                          A sincronização com o Firebase será retomada quando a
                          cota diária reiniciar em{' '}
                          <strong className="font-mono text-amber-300">
                            {quotaInfo.formattedCountdown}
                          </strong>{' '}
                          (às {quotaInfo.resetLocalTimeFormatted}). Seus mundos
                          continuam salvos localmente e no servidor secundário.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAccountModal(true)}
                      className="px-3 py-1.5 medieval-btn-gold text-[10px] font-pixel font-bold uppercase shrink-0 self-end sm:self-center"
                    >
                      Detalhes
                    </button>
                  </div>
                )}

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
              TAB 2 (DENTRO DE JOGAR): MUNDOS ABERTOS DE AMIGOS & CONVITE
              Focado em mostrar mundos disponíveis de amigos online para pedir
              para entrar + anexar código de convite direto.
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

                {/* 1. Anexar / Entrar com Código de Convite de Mundo */}
                <div className="medieval-panel p-4 space-y-2.5 border-2 border-emerald-500/40 bg-[#142018]/75">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-pixel text-xs font-bold text-emerald-300 uppercase flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-emerald-400" />
                        <span>Anexar Código de Convite de Mundo</span>
                      </h3>
                      <p className="text-[11px] text-[#c4ab7d] mt-0.5">
                        Recebeu um código de convite de 6 caracteres de um
                        amigo? Digite abaixo para entrar diretamente no mundo:
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 max-w-md">
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
                      className="flex-1 px-3.5 py-2.5 bg-[#0e0905] border border-emerald-500/50 font-mono text-sm font-bold text-amber-300 tracking-widest uppercase focus:outline-none focus:border-emerald-400"
                    />
                    <button
                      onClick={() =>
                        void handleConnectToInviteCode(inviteCodeInput)
                      }
                      disabled={isJoiningByCode}
                      className="min-h-[42px] px-5 medieval-btn-emerald text-xs font-pixel font-bold uppercase flex items-center gap-2 disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {isJoiningByCode ? 'Conectando...' : 'Entrar no Mundo'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Mundos Abertos de Amigos Online */}
                <div className="medieval-panel p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#3d2616] pb-2.5">
                    <div>
                      <h3 className="font-pixel text-xs font-bold text-amber-300 uppercase flex items-center gap-2">
                        <Globe className="w-4 h-4 text-emerald-400" />
                        <span>
                          Mundos Disponíveis de Amigos Online (
                          {friendsInOpenWorlds.length})
                        </span>
                      </h3>
                      <p className="text-[11px] text-[#c4ab7d] mt-0.5">
                        Mundos que seus amigos estão hospedando com modo online
                        aberto neste momento.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void pollFriendsPresence()}
                        className="px-2.5 py-1.5 medieval-btn-wood text-[10px] font-bold flex items-center gap-1"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${
                            isLoadingFriendsStatus ? 'animate-spin' : ''
                          }`}
                        />
                        <span>Atualizar</span>
                      </button>

                      <button
                        onClick={() => setViewMode('friends_hub')}
                        className="px-3 py-1.5 medieval-btn-gold text-[10px] font-pixel font-bold uppercase flex items-center gap-1.5"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Hub Social de Amigos</span>
                      </button>
                    </div>
                  </div>

                  {friendsInOpenWorlds.length === 0 ? (
                    <div className="medieval-inset p-6 text-center space-y-2.5">
                      <Wifi className="w-7 h-7 text-amber-400/70 mx-auto" />
                      <div className="space-y-1">
                        <div className="font-pixel text-xs font-bold text-amber-300 uppercase">
                          Nenhum mundo de amigo aberto no momento
                        </div>
                        <p className="text-xs text-[#c4ab7d] max-w-md mx-auto">
                          Quando um amigo seu estiver jogando com a{' '}
                          <strong>Disponibilidade Online ativada</strong>, o
                          mundo dele aparecerá aqui para você pedir para entrar.
                          Você também pode gerenciar ou buscar amigos no Hub
                          Social.
                        </p>
                      </div>
                      <div className="pt-1">
                        <button
                          onClick={() => setViewMode('friends_hub')}
                          className="px-4 py-2 medieval-btn-wood text-xs font-pixel font-bold uppercase inline-flex items-center gap-2"
                        >
                          <Users className="w-3.5 h-3.5 text-amber-300" />
                          <span>
                            Abrir Hub Social (Gerenciar e Buscar Amigos)
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {friendsInOpenWorlds.map((friend) => {
                        const live = friendsStatusMap[friend.playerPublicId];
                        return (
                          <div
                            key={friend.playerPublicId}
                            className="medieval-inset p-3.5 border border-emerald-500/40 bg-[#121e16]/80 flex flex-col justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-pixel text-xs font-bold text-amber-300 truncate">
                                  {live?.worldName || 'Mundo Online'}
                                </span>
                                <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-500/50 text-[10px] font-bold text-emerald-300 flex items-center gap-1 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>Aberto</span>
                                </span>
                              </div>
                              <div className="text-xs text-[#e5d5b5]">
                                Anfitrião:{' '}
                                <strong>
                                  {live?.username || friend.username}
                                </strong>
                              </div>
                            </div>

                            <button
                              onClick={() =>
                                void handleRequestJoinFriendWorld(
                                  friend.playerPublicId
                                )
                              }
                              disabled={Boolean(activeJoinRequest)}
                              className="w-full min-h-[38px] medieval-btn-emerald text-xs font-pixel font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              <Wifi className="w-3.5 h-3.5" />
                              <span>Solicitar entrada no mundo</span>
                            </button>
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

      <BlockingSyncOperationModal
        isOpen={blockingSyncState.isOpen}
        title={blockingSyncState.title}
        processLabel={blockingSyncState.processLabel}
        subprocessLabel={blockingSyncState.subprocessLabel}
        error={blockingSyncState.error}
        onCancelOrExit={() =>
          setBlockingSyncState((prev) => ({
            ...prev,
            isOpen: false,
            error: null,
          }))
        }
      />

      {/* Account Active World Session Conflict Modal */}
      {activeWorldConflict.isOpen && (
        <div
          className="fixed inset-0 z-[96] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() =>
            setActiveWorldConflict({
              isOpen: false,
              message: '',
              activeSession: null,
            })
          }
        >
          <div
            className="w-full max-w-md medieval-panel border-2 border-rose-500/80 bg-[#160e09] p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[#3d2616] pb-3">
              <div className="w-10 h-10 bg-rose-950/80 border border-rose-500/60 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="font-pixel text-xs font-bold text-rose-300 uppercase">
                  Mundo Já Aberto Nesta Conta
                </h3>
                <p className="text-[11px] text-[#c4ab7d]">
                  Proteção contra conflito de saves entre dispositivos
                </p>
              </div>
            </div>

            <div className="p-3 bg-rose-950/60 border border-rose-500/50 text-xs text-[#f3e5c8] leading-relaxed space-y-2">
              <p>{activeWorldConflict.message}</p>
              {activeWorldConflict.activeSession && (
                <div className="p-2 bg-[#120b07] border border-[#3d2616] text-[11px] font-mono text-amber-300 space-y-1">
                  <div>
                    Mundo em uso:{' '}
                    <strong>
                      {activeWorldConflict.activeSession.worldName}
                    </strong>
                  </div>
                  <div>
                    Sessão ativa:{' '}
                    <strong>
                      {activeWorldConflict.activeSession.deviceLabel ||
                        'Outro Dispositivo / Aba'}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() =>
                setActiveWorldConflict({
                  isOpen: false,
                  message: '',
                  activeSession: null,
                })
              }
              className="w-full py-2.5 px-4 medieval-btn-crimson text-xs font-pixel font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              <span>Entendi / Voltar</span>
            </button>
          </div>
        </div>
      )}

      <CloudSyncAutoModal onWorldsUpdated={refreshLocalWorlds} />
    </div>
  );
};
