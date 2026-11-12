import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  LogIn,
  LogOut,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  CloudSyncSnapshot,
  firebaseCloudSync,
} from '../game/persistence/FirebaseCloudSync';
import { SaveManager } from '../game/persistence/SaveManager';

interface CloudAccountModalProps {
  onClose: () => void;
  onWorldsUpdated?: () => void;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  onClose,
  onWorldsUpdated,
}) => {
  const [snap, setSnap] = useState<CloudSyncSnapshot>(() =>
    firebaseCloudSync.getSnapshot()
  );
  const [busyAction, setBusyAction] = useState<
    'login' | 'sync' | 'logout' | null
  >(null);

  useEffect(() => {
    const unsub = firebaseCloudSync.subscribe((next) => {
      setSnap(next);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    setBusyAction('login');
    try {
      const ok = await firebaseCloudSync.signInWithGoogle();
      if (ok && onWorldsUpdated) {
        onWorldsUpdated();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncAll = async () => {
    setBusyAction('sync');
    try {
      await firebaseCloudSync.ensureUserProfileSynced(undefined, true);
      await firebaseCloudSync.syncAllWorldsWithCloud();
      if (onWorldsUpdated) {
        onWorldsUpdated();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleLogout = async () => {
    setBusyAction('logout');
    try {
      await firebaseCloudSync.signOutUser();
    } finally {
      setBusyAction(null);
    }
  };

  const isSyncing =
    busyAction === 'sync' ||
    snap.syncStatus === 'SYNCING' ||
    snap.reconciliation.active;

  const isAllWorldsSynced =
    Boolean(snap.user) &&
    !isSyncing &&
    snap.diagnostics.pendingWorldsCount === 0 &&
    snap.pendingUploadsCount === 0;

  const username = SaveManager.getEffectiveUsername(Boolean(snap.user));

  const syncItems = [
    {
      id: 'worlds',
      icon: Cloud,
      label: 'Mundos sincronizados',
      synced: Boolean(snap.user) && (isAllWorldsSynced || snap.syncStatus === 'SYNCED'),
      syncing: Boolean(snap.user) && isSyncing,
    },
    {
      id: 'appearances',
      icon: Palette,
      label: 'Aparências sincronizadas',
      synced: Boolean(snap.user) && !isSyncing,
      syncing: Boolean(snap.user) && isSyncing,
    },
    {
      id: 'friends',
      icon: Users,
      label: 'Amigos sincronizados',
      synced: Boolean(snap.user) && !isSyncing,
      syncing: Boolean(snap.user) && isSyncing,
    },
    {
      id: 'account',
      icon: ShieldCheck,
      label: 'Demais informações da conta sincronizadas',
      synced: Boolean(snap.user) && !isSyncing,
      syncing: Boolean(snap.user) && isSyncing,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md medieval-panel flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#2a1b10] border border-[#8c6d46] flex items-center justify-center">
              <Cloud className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="font-pixel text-xs font-bold text-amber-300 uppercase tracking-wide">
                Conta & Sincronização
              </h2>
              <p className="text-[11px] text-[#c4ab7d]">
                Status simplificado da sua conta Google
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto max-h-[82dvh]">
          {!snap.user ? (
            <div className="medieval-inset p-4 space-y-3 text-center">
              <div className="w-12 h-12 mx-auto bg-[#2a1b10] border-2 border-[#6e4930] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-amber-400" />
              </div>
              <div className="space-y-1">
                <h3 className="font-pixel text-xs text-amber-300 font-bold uppercase">
                  Conecte sua Conta Google
                </h3>
                <p className="text-xs text-[#e5d5b5] leading-relaxed">
                  Entre com sua conta Google para manter seus mundos, aparências
                  de personagem, lista de amigos e configurações sincronizados
                  entre todos os seus dispositivos.
                </p>
              </div>
              <button
                onClick={handleLogin}
                disabled={busyAction !== null}
                className="w-full py-2.5 px-4 medieval-btn-emerald text-xs font-pixel font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busyAction === 'login' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Entrar com Google</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              {/* Account Card */}
              <div className="medieval-inset p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {snap.user.photoURL ? (
                    <img
                      src={snap.user.photoURL}
                      alt={username}
                      className="w-11 h-11 rounded border-2 border-emerald-500/80 shrink-0 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-11 h-11 bg-[#2a1b10] border-2 border-emerald-500/80 flex items-center justify-center text-sm font-bold text-amber-300 shrink-0">
                      {username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#f3e5c8] truncate">
                      {username}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Conta Google conectada</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simplified Sync Checklist */}
              <div className="medieval-inset p-3 space-y-2">
                {syncItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2.5 p-2 bg-[#120b07] border border-[#3d2616]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs font-semibold text-[#f3e5c8] truncate">
                          {item.label}
                        </span>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {item.syncing ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Sincronizando</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>OK</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleSyncAll}
                  disabled={busyAction !== null || isSyncing}
                  className="py-2.5 px-3 medieval-btn-gold text-[11px] font-pixel font-bold uppercase flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  disabled={busyAction !== null}
                  className="py-2.5 px-3 medieval-btn-crimson text-[11px] font-pixel font-bold uppercase flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da Conta</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const CloudSyncAutoModal: React.FC<{
  onWorldsUpdated?: () => void;
}> = ({ onWorldsUpdated }) => {
  const [snap, setSnap] = useState<CloudSyncSnapshot>(() =>
    firebaseCloudSync.getSnapshot()
  );

  useEffect(() => {
    const unsub = firebaseCloudSync.subscribe((next) => {
      setSnap((prev) => {
        if (prev.reconciliation.active && !next.reconciliation.active) {
          onWorldsUpdated?.();
        }
        return next;
      });
    });
    return unsub;
  }, [onWorldsUpdated]);

  // Keep background synchronization non-blocking and silent so it never freezes or blocks the screen
  if (!snap.reconciliation.active) return null;

  return (
    <div className="fixed bottom-3 right-3 z-40 pointer-events-none">
      <div className="medieval-panel px-3 py-2 flex items-center gap-2 border border-amber-500/40 bg-[#1a110b]/95 shadow-lg">
        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
        <span className="text-[11px] font-semibold text-[#f3e5c8]">
          Sincronizando dados da conta...
        </span>
      </div>
    </div>
  );
};
