import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
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
  FirestoreQuotaResetInfo,
  getFirestoreQuotaResetInfo,
  onFirestoreWriteQuotaExhausted,
} from '../firebase';
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
  const [quotaInfo, setQuotaInfo] = useState<FirestoreQuotaResetInfo>(() =>
    getFirestoreQuotaResetInfo()
  );
  const [busyAction, setBusyAction] = useState<
    'login' | 'sync' | 'logout' | null
  >(null);

  useEffect(() => {
    const unsubSync = firebaseCloudSync.subscribe((next) => {
      setSnap(next);
      setQuotaInfo(getFirestoreQuotaResetInfo());
    });
    const unsubQuota = onFirestoreWriteQuotaExhausted(() => {
      setQuotaInfo(getFirestoreQuotaResetInfo());
    });
    const timer = window.setInterval(() => {
      setQuotaInfo(getFirestoreQuotaResetInfo());
    }, 30000);
    return () => {
      unsubSync();
      unsubQuota();
      window.clearInterval(timer);
    };
  }, []);

  const handleLogin = async () => {
    setBusyAction('login');
    try {
      const ok = await firebaseCloudSync.signInWithGoogle();
      setQuotaInfo(getFirestoreQuotaResetInfo());
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
      setQuotaInfo(getFirestoreQuotaResetInfo());
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

  const hasInternalOrQuotaError =
    quotaInfo.isExhausted ||
    snap.syncStatus === 'ERROR' ||
    snap.reconciliation.hasErrors;

  const detectedErrorDescription = quotaInfo.isExhausted
    ? quotaInfo.errorReason
    : snap.reconciliation.errorSummary ||
      snap.statusMessage ||
      'Falha interna ao comunicar com o serviço de sincronização na nuvem.';

  const isAllWorldsSynced =
    Boolean(snap.user) &&
    !isSyncing &&
    !hasInternalOrQuotaError &&
    snap.diagnostics.pendingWorldsCount === 0 &&
    snap.pendingUploadsCount === 0;

  const username = SaveManager.getEffectiveUsername(Boolean(snap.user));

  const syncItems = [
    {
      id: 'worlds',
      icon: Cloud,
      label: 'Mundos sincronizados',
      synced:
        Boolean(snap.user) &&
        !hasInternalOrQuotaError &&
        (isAllWorldsSynced || snap.syncStatus === 'SYNCED'),
      syncing: Boolean(snap.user) && isSyncing,
      warning: Boolean(snap.user) && hasInternalOrQuotaError,
    },
    {
      id: 'appearances',
      icon: Palette,
      label: 'Aparências sincronizadas',
      synced: Boolean(snap.user) && !isSyncing && !hasInternalOrQuotaError,
      syncing: Boolean(snap.user) && isSyncing,
      warning: Boolean(snap.user) && hasInternalOrQuotaError,
    },
    {
      id: 'friends',
      icon: Users,
      label: 'Amigos sincronizados',
      synced: Boolean(snap.user) && !isSyncing,
      syncing: Boolean(snap.user) && isSyncing,
      warning: false,
    },
    {
      id: 'account',
      icon: ShieldCheck,
      label: 'Demais informações da conta sincronizadas',
      synced: Boolean(snap.user) && !isSyncing && !hasInternalOrQuotaError,
      syncing: Boolean(snap.user) && isSyncing,
      warning: Boolean(snap.user) && hasInternalOrQuotaError,
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
                Status da conta Google e diagnóstico de sincronização
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
          {/* Quota / Internal Error Diagnostic Alert */}
          {hasInternalOrQuotaError && (
            <div className="p-3 bg-amber-950/90 border-2 border-amber-500/70 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-pixel text-[11px] font-bold text-amber-300 uppercase">
                    Aviso de Funcionamento Interno / Sincronização
                  </div>
                  <div className="text-[#f3e5c8] leading-relaxed">
                    <strong>Erro detectado:</strong> {detectedErrorDescription}
                  </div>
                </div>
              </div>

              <div className="p-2 bg-[#140c07] border border-amber-500/40 flex items-start gap-2 text-[11px] text-amber-200">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  A sincronização principal do Firebase Firestore só será
                  restabelecida quando a cota diária reiniciar em{' '}
                  <strong className="text-amber-300 font-mono">
                    {quotaInfo.formattedCountdown}
                  </strong>{' '}
                  (às{' '}
                  <strong className="text-amber-300 font-mono">
                    {quotaInfo.resetLocalTimeFormatted}
                  </strong>{' '}
                  no seu horário local — 00:00 no horário do Pacífico). Enquanto
                  isso, seus mundos continuam salvos com segurança no
                  dispositivo e no servidor secundário.
                </div>
              </div>
            </div>
          )}

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
                        ) : item.warning ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Reinicia em {quotaInfo.formattedCountdown}</span>
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

export interface BlockingSyncOperationModalProps {
  isOpen: boolean;
  title: string;
  processLabel: string;
  subprocessLabel?: string;
  error?: string | null;
  timeoutSeconds?: number;
  onCancelOrExit: () => void;
}

export const BlockingSyncOperationModal: React.FC<
  BlockingSyncOperationModalProps
> = ({
  isOpen,
  title,
  processLabel,
  subprocessLabel,
  error,
  timeoutSeconds = 8,
  onCancelOrExit,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [quotaInfo, setQuotaInfo] = useState<FirestoreQuotaResetInfo>(() =>
    getFirestoreQuotaResetInfo()
  );

  useEffect(() => {
    if (!isOpen) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    setQuotaInfo(getFirestoreQuotaResetInfo());
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
      setQuotaInfo(getFirestoreQuotaResetInfo());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const isTimedOut = elapsedSec >= timeoutSeconds;
  const canCancelOrExit = Boolean(error) || isTimedOut;

  return (
    <div className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-md medieval-panel border-2 border-[#8c6d46] bg-[#160e09] p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#3d2616] pb-3">
          <div className="w-9 h-9 bg-[#2a1b10] border border-amber-500/50 flex items-center justify-center shrink-0">
            {error ? (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            ) : (
              <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-pixel text-xs font-bold text-amber-300 uppercase tracking-wider truncate">
              {title}
            </h3>
            <p className="text-[11px] text-[#c4ab7d]">
              {error
                ? 'Falha detectada ao confirmar sincronização'
                : 'Aguardando confirmação real de salvamento na nuvem/servidor...'}
            </p>
          </div>
        </div>

        <div className="medieval-inset p-3.5 space-y-2.5 bg-[#120b07]">
          <div className="flex items-center justify-between text-xs font-bold text-[#f3e5c8]">
            <span>Processo: {processLabel}</span>
            <span className="font-mono text-amber-300">{elapsedSec}s</span>
          </div>

          <div className="w-full h-2.5 bg-[#0c0704] border border-[#4a301e] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                error
                  ? 'bg-red-500 w-full'
                  : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 animate-pulse w-4/5'
              }`}
            />
          </div>

          <div className="text-[11px] text-sky-300 font-medium leading-snug">
            {subprocessLabel ||
              'Subprocesso: Comunicando com o diretório social e perfil da conta...'}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/90 border border-red-500/70 space-y-1.5 text-xs">
            <div className="font-pixel text-[10px] font-bold text-red-300 uppercase flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Erro Específico Detectado</span>
            </div>
            <p className="text-red-100 leading-relaxed">{error}</p>
            {quotaInfo.isExhausted && (
              <p className="text-[11px] text-amber-200 pt-1">
                Cota do Firestore reinicia em{' '}
                <strong className="font-mono text-amber-300">
                  {quotaInfo.formattedCountdown}
                </strong>{' '}
                (às {quotaInfo.resetLocalTimeFormatted}).
              </p>
            )}
          </div>
        )}

        {!error && isTimedOut && (
          <div className="p-3 bg-amber-950/80 border border-amber-500/60 text-xs text-amber-200 space-y-1">
            <div className="font-bold text-amber-300">
              A sincronização está demorando mais que o normal ({elapsedSec}s).
            </div>
            <p className="text-[11px] leading-relaxed">
              A alteração já foi salva localmente neste dispositivo. Você pode
              continuar aguardando ou cancelar/sair agora.
            </p>
          </div>
        )}

        {canCancelOrExit ? (
          <button
            onClick={onCancelOrExit}
            className="w-full py-2.5 px-4 medieval-btn-crimson text-xs font-pixel font-bold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            <span>{error ? 'Fechar / Sair' : 'Cancelar / Sair'}</span>
          </button>
        ) : (
          <div className="text-center text-[11px] text-[#a38960] italic">
            Esta janela fechará automaticamente assim que o salvamento for
            confirmado.
          </div>
        )}
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
  const [quotaInfo, setQuotaInfo] = useState<FirestoreQuotaResetInfo>(() =>
    getFirestoreQuotaResetInfo()
  );
  const [elapsedSec, setElapsedSec] = useState(0);
  const [dismissedQuotaAlert, setDismissedQuotaAlert] = useState(false);
  const wasReconcilingRef = useRef<boolean>(snap.reconciliation.active);

  useEffect(() => {
    const unsub = firebaseCloudSync.subscribe((next) => {
      const wasActive = wasReconcilingRef.current;
      wasReconcilingRef.current = next.reconciliation.active;
      setSnap(next);
      setQuotaInfo(getFirestoreQuotaResetInfo());
      if (wasActive && !next.reconciliation.active) {
        window.setTimeout(() => {
          onWorldsUpdated?.();
        }, 0);
      }
    });
    const unsubQuota = onFirestoreWriteQuotaExhausted(() => {
      setQuotaInfo(getFirestoreQuotaResetInfo());
      setDismissedQuotaAlert(false);
    });
    const timer = window.setInterval(() => {
      setQuotaInfo(getFirestoreQuotaResetInfo());
    }, 15000);
    return () => {
      unsub();
      unsubQuota();
      window.clearInterval(timer);
    };
  }, [onWorldsUpdated]);

  // Track elapsed time while the login reconciliation modal is active
  useEffect(() => {
    if (!snap.reconciliation.showModal || !snap.reconciliation.active) {
      setElapsedSec(0);
      return;
    }
    setElapsedSec(0);
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [snap.reconciliation.showModal, snap.reconciliation.active]);

  const rec = snap.reconciliation;
  const tp = snap.transferProgress;

  const worldErrors = Object.values(snap.worldSyncStates).filter(
    (st) => st.detailedStatus === 'SYNC_ERROR' && st.error
  );

  const hasSpecificError =
    rec.hasErrors ||
    snap.syncStatus === 'ERROR' ||
    quotaInfo.isExhausted ||
    worldErrors.length > 0;

  const specificErrorText =
    rec.errorSummary ||
    worldErrors[0]?.error ||
    (quotaInfo.isExhausted ? quotaInfo.errorReason : null) ||
    (snap.syncStatus === 'ERROR' ? snap.statusMessage : null);

  // 1. Full Blocking Login & Account Synchronization Modal
  if (rec.showModal && !rec.dismissedByUser) {
    const isTakingTooLong = elapsedSec >= 12;
    const allowCancelOrClose =
      !rec.active || hasSpecificError || isTakingTooLong;
    const pct = Math.min(100, Math.max(2, rec.progressPercent || 0));

    return (
      <div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
        <div
          className="w-full max-w-lg medieval-panel border-2 border-[#8c6d46] bg-[#160e09] p-4 sm:p-5 space-y-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b-2 border-[#3d2616] pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-[#2a1b10] border-2 border-amber-500/60 flex items-center justify-center shrink-0">
                {hasSpecificError ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : rec.active ? (
                  <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-300 uppercase tracking-wider">
                  Sincronizando Conta e Mundos
                </h2>
                <p className="text-[11px] text-[#c4ab7d] truncate">
                  Reconciliação completa entre o dispositivo local e a nuvem
                </p>
              </div>
            </div>
            {rec.active && (
              <span className="text-[11px] font-mono text-amber-300/90 shrink-0">
                {elapsedSec}s
              </span>
            )}
          </div>

          {/* Main Process + Progress Bar + Subprocess */}
          <div className="medieval-inset p-3.5 sm:p-4 space-y-3 bg-[#120b07] border border-[#4a301e]">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs sm:text-sm font-bold text-amber-200">
                Processo ({rec.stageNumber} de 9): {rec.stageLabel}
              </div>
              <div className="font-pixel text-xs sm:text-sm font-bold text-emerald-400 shrink-0">
                {pct}%
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 bg-[#0a0604] border border-[#5c3c24] overflow-hidden p-0.5">
              <div
                className={`h-full transition-all duration-300 ${
                  hasSpecificError
                    ? 'bg-gradient-to-r from-amber-500 to-red-500'
                    : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Subprocess Detail */}
            <div className="space-y-1 pt-0.5">
              <div className="text-xs text-sky-300 font-semibold leading-snug">
                {rec.microDetail || 'Iniciando verificação da conta...'}
              </div>

              {tp && tp.phase !== 'IDLE' && tp.phase !== 'COMPLETED' && (
                <div className="text-[11px] text-[#d5c3a1] font-mono bg-[#1a110b] px-2.5 py-1.5 border border-[#3d2616] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Mundo: <strong>{tp.worldName || 'Mundo'}</strong>
                  </span>
                  <span>
                    Pacotes: <strong>{tp.chunksUploaded}</strong> /{' '}
                    <strong>{Math.max(1, tp.chunksTotal)}</strong>
                  </span>
                  {tp.transferSpeedBytesPerSec > 0 && (
                    <span className="text-emerald-400">
                      {tp.transferSpeedBytesPerSec >= 1024 * 1024
                        ? `${(
                            tp.transferSpeedBytesPerSec /
                            (1024 * 1024)
                          ).toFixed(2)} MB/s`
                        : `${Math.max(
                            1,
                            Math.round(tp.transferSpeedBytesPerSec / 1024)
                          )} KB/s`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Telemetry Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="medieval-inset p-2.5 bg-[#120b07]">
              <div className="text-[10px] text-[#c4ab7d] uppercase">
                Mundos Locais
              </div>
              <div className="font-pixel text-xs font-bold text-[#f3e5c8] mt-1">
                {snap.diagnostics.localWorldsCount}
              </div>
            </div>
            <div className="medieval-inset p-2.5 bg-[#120b07]">
              <div className="text-[10px] text-[#c4ab7d] uppercase">
                Mundos Nuvem
              </div>
              <div className="font-pixel text-xs font-bold text-sky-400 mt-1">
                {Math.max(
                  snap.diagnostics.cloudWorldsCount,
                  rec.worldsIdentifiedInCloud
                )}
              </div>
            </div>
            <div className="medieval-inset p-2.5 bg-[#120b07]">
              <div className="text-[10px] text-[#c4ab7d] uppercase">
                Baixados
              </div>
              <div className="font-pixel text-xs font-bold text-amber-400 mt-1">
                {snap.diagnostics.downloadedWorldsCount}
              </div>
            </div>
            <div className="medieval-inset p-2.5 bg-[#120b07]">
              <div className="text-[10px] text-[#c4ab7d] uppercase">
                Sincronizados
              </div>
              <div className="font-pixel text-xs font-bold text-emerald-400 mt-1">
                {snap.diagnostics.syncedWorldsCount}
              </div>
            </div>
          </div>

          {/* Specific Error Box if any error occurred */}
          {hasSpecificError && specificErrorText && (
            <div className="p-3 bg-red-950/90 border-2 border-red-500/70 space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-pixel text-[10px] font-bold text-red-300 uppercase">
                    Erro Específico na Sincronização
                  </div>
                  <div className="text-red-100 leading-relaxed">
                    {specificErrorText}
                  </div>
                </div>
              </div>
              {quotaInfo.isExhausted && (
                <div className="p-2 bg-[#140c07] border border-amber-500/40 flex items-center gap-2 text-[11px] text-amber-200">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    A cota diária do Firebase reiniciará em{' '}
                    <strong className="text-amber-300 font-mono">
                      {quotaInfo.formattedCountdown}
                    </strong>{' '}
                    (às {quotaInfo.resetLocalTimeFormatted}).
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Timeout notice if taking > 12s */}
          {!hasSpecificError && rec.active && isTakingTooLong && (
            <div className="p-2.5 bg-amber-950/80 border border-amber-500/60 text-[11px] text-amber-200">
              A sincronização está demorando mais que o esperado ({elapsedSec}
              s). Você pode aguardar a conclusão ou cancelar/sair para continuar
              com os dados já carregados.
            </div>
          )}

          {/* Non-minimizable enforcement: only show Cancel/Close when error, timeout, or finished */}
          {allowCancelOrClose ? (
            <div className="pt-1">
              <button
                onClick={() => {
                  firebaseCloudSync.forceCancelReconciliation();
                  onWorldsUpdated?.();
                }}
                className="w-full py-2.5 px-4 medieval-btn-crimson text-xs font-pixel font-bold uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                <span>
                  {!rec.active
                    ? 'Fechar e Continuar'
                    : 'Cancelar / Continuar com Mundos Locais'}
                </span>
              </button>
            </div>
          ) : (
            <div className="text-center text-[11px] text-[#a38960] italic pt-1">
              Sincronização obrigatória de login em andamento. Esta tela fechará
              automaticamente ao concluir (100%).
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Non-blocking Quota Alert Banner when not in active login modal
  if (hasSpecificError && !dismissedQuotaAlert && quotaInfo.isExhausted) {
    return (
      <div className="fixed bottom-3 right-3 z-40 max-w-sm">
        <div className="medieval-panel p-3 border-2 border-amber-500/80 bg-[#1a110b]/95 shadow-2xl space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-amber-300 font-pixel text-[10px] font-bold uppercase">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Aviso de Sincronização / Cota</span>
            </div>
            <button
              onClick={() => setDismissedQuotaAlert(true)}
              className="text-[#c4ab7d] hover:text-white p-0.5"
              title="Fechar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-[#f3e5c8] leading-snug">
            <strong>Erro:</strong> {quotaInfo.errorReason}
          </p>
          <p className="text-[11px] text-amber-200 leading-snug flex items-center gap-1.5 pt-0.5">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Sincronização na nuvem disponível quando a cota reiniciar em{' '}
              <strong className="text-amber-300 font-mono">
                {quotaInfo.formattedCountdown}
              </strong>{' '}
              (às {quotaInfo.resetLocalTimeFormatted}).
            </span>
          </p>
        </div>
      </div>
    );
  }

  return null;
};
