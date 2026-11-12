import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  Gift,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Terminal,
  UserCheck,
  X,
} from 'lucide-react';
import {
  getClientFirebaseDiagnostics,
  testFirestoreConnection,
} from '../firebase';
import {
  CloudSyncSnapshot,
  firebaseCloudSync,
} from '../game/persistence/FirebaseCloudSync';
import {
  getOrCreateLocalDevicePlayerUid,
  SaveManager,
} from '../game/persistence/SaveManager';

interface CloudAccountModalProps {
  onClose: () => void;
  onWorldsUpdated?: () => void;
}

function formatByteSize(bytes: number): string {
  const safe = Math.max(0, Number(bytes) || 0);
  if (safe < 1024) return `${safe} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTransferSpeed(bytesPerSec: number): string {
  const safe = Math.max(0, Number(bytesPerSec) || 0);
  if (safe <= 0) return '—';
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB/s`;
  return `${(safe / (1024 * 1024)).toFixed(2)} MB/s`;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  onClose,
  onWorldsUpdated,
}) => {
  const [cloudSnap, setCloudSnap] = useState<CloudSyncSnapshot>(() =>
    firebaseCloudSync.getSnapshot()
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [concurrency, setConcurrency] = useState<number>(() =>
    firebaseCloudSync.getMaxUploadConcurrency()
  );
  const [firestoreReachable, setFirestoreReachable] = useState<boolean | null>(
    null
  );
  const [serverAdminStatus, setServerAdminStatus] = useState<{
    checked: boolean;
    adminInitialized: boolean;
    adminSecretsIsolated: boolean;
    storageMode: string;
  }>({
    checked: false,
    adminInitialized: false,
    adminSecretsIsolated: true,
    storageMode: 'Híbrido (Firestore + Storage Chunks)',
  });
  const clientDiag = getClientFirebaseDiagnostics();

  useEffect(() => {
    const unsub = firebaseCloudSync.subscribe((snap) => {
      setCloudSnap(snap);
    });
    void testFirestoreConnection(true).then((ok) => {
      setFirestoreReachable(ok);
    });
    fetch('/api/firebase/diagnostics')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setServerAdminStatus({
            checked: true,
            adminInitialized: Boolean(data.adminSdk?.initialized),
            adminSecretsIsolated:
              Boolean(data.security?.adminCredentialsIsolatedToServer) &&
              clientDiag.adminSecretsAbsentFromFrontend,
            storageMode: data.firebaseStorageBucketProvisioned
              ? 'Firebase Storage + Firestore Index'
              : 'Híbrido Segmentado (Sem Limite 1MB)',
          });
        }
      })
      .catch(() => {});
    return unsub;
  }, [clientDiag.adminSecretsAbsentFromFrontend]);

  const handleGoogleSignIn = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setFeedback('Conectando ao Google Authentication...');
    const res = await firebaseCloudSync.signInWithGoogle();
    setIsBusy(false);
    setFeedback(res.message);
    if (res.ok) {
      onWorldsUpdated?.();
    }
  };

  const handleSignOut = async () => {
    if (isBusy) return;
    setIsBusy(true);
    await firebaseCloudSync.signOutUser();
    setIsBusy(false);
    setFeedback(
      'Sessão encerrada. Seus mundos locais permanecem salvos neste dispositivo.'
    );
    onWorldsUpdated?.();
  };

  const handleManualSyncNow = async () => {
    if (isBusy || !cloudSnap.user) return;
    setIsBusy(true);
    setFeedback(
      'Iniciando reconciliação completa de mundos e verificação de integridade...'
    );
    try {
      await firebaseCloudSync.runPostLoginReconciliation(
        undefined,
        'manual_sync'
      );
      onWorldsUpdated?.();
      setFeedback(
        'Reconciliação concluída! Todos os mundos na nuvem e no dispositivo foram verificados.'
      );
    } catch (err: any) {
      setFeedback(
        err?.message ||
          'Transferência interrompida. O estado local foi preservado e você pode retomar de onde parou.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleConcurrencyChange = (newLimit: number) => {
    setConcurrency(newLimit);
    firebaseCloudSync.setMaxUploadConcurrency(newLimit);
  };

  const handleCopyUid = (uidToCopy: string) => {
    navigator.clipboard?.writeText(uidToCopy).catch(() => {});
    setFeedback(`UID copiado: ${uidToCopy}`);
  };

  const localWorldsList = SaveManager.listWorlds();
  const localWorldsCount = localWorldsList.length;
  const legacyDeviceUid = getOrCreateLocalDevicePlayerUid();
  const prog = cloudSnap.transferProgress;
  const recon = cloudSnap.reconciliation;
  const diag = cloudSnap.diagnostics;

  const progressPercent = recon.active
    ? recon.progressPercent
    : prog && prog.chunksTotal > 0
    ? Math.min(100, Math.round((prog.chunksUploaded / prog.chunksTotal) * 100))
    : prog?.phase === 'COMPLETED'
    ? 100
    : 100;

  const hasErrorOrResume =
    Boolean(prog?.canResume) ||
    prog?.phase === 'PAUSED_INTERRUPTED' ||
    prog?.phase === 'ERROR' ||
    cloudSnap.syncStatus === 'ERROR' ||
    recon.hasErrors;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[94dvh] medieval-panel flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-400" />
            <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
              CONTA GOOGLE & SINCRONIZAÇÃO MULTIDISPOSITIVO
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3 flex-1">
          {(feedback || cloudSnap.statusMessage) && (
            <div
              className={`medieval-inset px-3 py-2 border text-xs font-bold flex items-center justify-between gap-2 ${
                hasErrorOrResume
                  ? 'border-red-500/50 text-red-200'
                  : 'border-amber-500/40 text-amber-200'
              }`}
            >
              <span>{feedback || cloudSnap.statusMessage}</span>
              {feedback && (
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-[#c4ab7d] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {!cloudSnap.user ? (
            <div className="medieval-inset p-4 space-y-3 border border-sky-500/35">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 mc-slot-active flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <div className="font-pixel text-xs font-bold text-white">
                    ENTRE COM SUA CONTA GOOGLE
                  </div>
                  <p className="text-xs text-[#e5d5b5] leading-relaxed">
                    Vincule seus mundos, aparência universal, montarias domesticadas e futuros conteúdos exclusivos ao seu <strong>UID único do Firebase</strong> para jogar em qualquer celular, guia anônima ou computador.
                  </p>
                </div>
              </div>

              <div className="medieval-panel p-2.5 text-[11px] text-[#c4ab7d] space-y-1">
                <div className="flex items-center justify-between">
                  <span>Mundos salvos neste dispositivo:</span>
                  <span className="font-bold text-amber-300">
                    {localWorldsCount} mundo(s)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>ID local atual (pré-migração):</span>
                  <span className="font-mono text-[10px] text-[#e5d5b5]">
                    {legacyDeviceUid}
                  </span>
                </div>
                <p className="text-[10px] text-emerald-300 pt-1">
                  ✓ Ao entrar, seus mundos locais serão enviados para a nuvem e qualquer mundo já salvo na sua conta Google será baixado e reconstruído automaticamente!
                </p>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[44px] medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {isBusy ? 'CONECTANDO...' : 'ENTRAR COM CONTA GOOGLE'}
                </span>
              </button>
            </div>
          ) : (
            <>
              {/* Authenticated Account Card */}
              <div className="medieval-inset p-3.5 space-y-3 border border-emerald-500/40">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {cloudSnap.user.photoURL ? (
                      <img
                        src={cloudSnap.user.photoURL}
                        alt={cloudSnap.user.displayName}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded border-2 border-amber-400 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 mc-slot-active flex items-center justify-center shrink-0">
                        <UserCheck className="w-5 h-5 text-emerald-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-pixel text-xs font-bold text-white truncate">
                          {cloudSnap.user.displayName}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 ${
                            cloudSnap.syncStatus === 'SYNCING' || recon.active
                              ? 'bg-sky-950/90 border-sky-400/50 text-sky-300'
                              : cloudSnap.syncStatus === 'ERROR'
                              ? 'bg-rose-950/90 border-rose-400/50 text-rose-300'
                              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                          }`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>
                            {cloudSnap.syncStatus === 'SYNCING' || recon.active
                              ? 'SINCRONIZANDO...'
                              : cloudSnap.syncStatus === 'ERROR'
                              ? 'ATENÇÃO NA SINC.'
                              : 'SINCRONIZADO'}
                          </span>
                        </span>
                      </div>
                      {cloudSnap.user.email && (
                        <div className="text-[11px] text-[#c4ab7d] truncate">
                          {cloudSnap.user.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleSignOut}
                    className="min-h-[34px] px-3 medieval-btn-crimson text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>

                {/* UID & Primary Counters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#3d281a] text-[11px]">
                  <div className="mc-slot p-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[9px] text-[#c4ab7d] uppercase font-bold">
                        Firebase UID do Jogador
                      </div>
                      <div className="font-mono text-[10px] text-amber-300 truncate">
                        {cloudSnap.user.uid}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyUid(cloudSnap.user!.uid)}
                      title="Copiar UID"
                      className="p-1 text-[#c4ab7d] hover:text-white shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mc-slot p-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] text-[#c4ab7d] uppercase font-bold">
                        Banco Cloud Firestore Ativo
                      </div>
                      <div className="font-mono text-[10px] text-sky-300 truncate max-w-[210px]">
                        {clientDiag.firestoreDatabaseId}
                      </div>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                </div>

                {/* Global Reconciliation & World Diagnostics (7 Mandatory Counters) */}
                <div className="mc-slot p-2.5 space-y-2 border border-[#4a301e]">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-pixel text-amber-300 font-bold uppercase flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      <span>Diagnóstico Global de Mundos</span>
                    </span>
                    <span className="font-mono text-emerald-300 font-bold">
                      {diag.syncedWorldsCount}/{diag.localWorldsCount} sincronizados
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Mundos Locais
                      </div>
                      <div className="font-mono font-bold text-white">
                        {diag.localWorldsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Mundos na Nuvem
                      </div>
                      <div className="font-mono font-bold text-sky-300">
                        {diag.cloudWorldsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Sincronizados
                      </div>
                      <div className="font-mono font-bold text-emerald-300">
                        {diag.syncedWorldsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Pendentes / Fila
                      </div>
                      <div className="font-mono font-bold text-amber-300">
                        {diag.pendingWorldsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Baixados na Sessão
                      </div>
                      <div className="font-mono font-bold text-purple-300">
                        {diag.downloadedWorldsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Operações Concluídas
                      </div>
                      <div className="font-mono font-bold text-emerald-300">
                        {diag.completedOperationsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Falhas Registradas
                      </div>
                      <div
                        className={`font-mono font-bold ${
                          diag.failedOperationsCount > 0
                            ? 'text-rose-400'
                            : 'text-[#c4ab7d]'
                        }`}
                      >
                        {diag.failedOperationsCount}
                      </div>
                    </div>

                    <div className="bg-[#160e09] px-2 py-1 border border-[#3a2518]">
                      <div className="text-[#a89068] text-[9px]">
                        Velocidade / Fluxo
                      </div>
                      <div className="font-mono font-bold text-amber-200">
                        {prog
                          ? formatTransferSpeed(prog.transferSpeedBytesPerSec)
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real-time Incremental Transfer Progress & Stage Telemetry */}
                <div className="mc-slot p-2.5 space-y-2 border border-[#4a301e]">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-pixel text-amber-300 font-bold uppercase">
                      {recon.active
                        ? `Etapa ${recon.stageNumber}/9: ${recon.stageLabel}`
                        : prog && prog.phase !== 'IDLE'
                        ? prog.phase === 'COMPLETED'
                          ? `Sincronizado (${prog.worldName || 'Mundo'})`
                          : prog.phase === 'PAUSED_INTERRUPTED' ||
                            prog.phase === 'ERROR'
                          ? 'Transferência Pausada / Retomável'
                          : `Sincronizando: ${prog.worldName || 'Mundo'} (${progressPercent}%)`
                        : 'Sincronização Incremental de Chunks'}
                    </span>
                    <span className="font-mono text-emerald-300 font-bold">
                      { `${progressPercent}%` }
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-[#120b07] border border-[#4a301e] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        hasErrorOrResume
                          ? 'bg-red-500'
                          : 'bg-gradient-to-r from-emerald-600 to-amber-400'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Micro-progress subtitle */}
                  <div className="text-[11px] text-[#e5d5b5] font-mono">
                    {recon.microDetail ||
                      (prog
                        ? `Partes processadas: ${prog.chunksUploaded}/${prog.chunksTotal} (${formatByteSize(
                            prog.bytesTransferred
                          )})`
                        : 'Todos os manifestos e chunks verificados por hash.')}
                  </div>

                  {/* Per-World Status List */}
                  {localWorldsList.length > 0 && (
                    <div className="pt-1 space-y-1 max-h-32 overflow-y-auto">
                      {localWorldsList.map((w) => {
                        const st = cloudSnap.worldSyncStates[w.id];
                        const label = st?.detailedLabel || 'Aguardando envio';
                        const isSynced = st?.detailedStatus === 'SYNCED';
                        const isErr = st?.detailedStatus === 'SYNC_ERROR';
                        const isConflict =
                          st?.detailedStatus === 'VERSION_CONFLICT';
                        return (
                          <div
                            key={w.id}
                            className="bg-[#160e09] px-2 py-1 border border-[#3a2518] flex items-center justify-between gap-2 text-[10px]"
                          >
                            <span className="font-bold text-white truncate">
                              {w.name}
                            </span>
                            <span
                              className={`font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                                isSynced
                                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                                  : isErr
                                  ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                                  : isConflict
                                  ? 'bg-purple-950/80 border-purple-500/40 text-purple-200'
                                  : 'bg-sky-950/80 border-sky-500/40 text-sky-200'
                              }`}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Concurrency Control & Last Sync Timestamp */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-[#c4ab7d]">
                    <div className="flex items-center gap-1.5">
                      <span>Uploads simultâneos:</span>
                      {[4, 8, 12, 16].map((limit) => (
                        <button
                          key={limit}
                          type="button"
                          onClick={() => handleConcurrencyChange(limit)}
                          className={`px-1.5 py-0.5 border font-mono text-[9px] font-bold ${
                            concurrency === limit
                              ? 'bg-amber-700/80 border-amber-400 text-white'
                              : 'bg-[#1a110b] border-[#4a301e] text-[#c4ab7d]'
                          }`}
                        >
                          {limit}x
                        </button>
                      ))}
                    </div>

                    <span>
                      {cloudSnap.lastSyncedAt
                        ? `Última sincronização: ${new Date(
                            cloudSnap.lastSyncedAt
                          ).toLocaleDateString()} às ${new Date(
                            cloudSnap.lastSyncedAt
                          ).toLocaleTimeString()}`
                        : 'Aguardando primeira sincronização'}
                    </span>
                  </div>

                  {hasErrorOrResume && (prog?.lastError || recon.errorSummary) && (
                    <div className="p-2 bg-red-950/60 border border-red-500/40 text-[10px] text-red-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span>{prog?.lastError || recon.errorSummary}</span>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleManualSyncNow}
                        className="px-2 py-1 medieval-btn-gold text-[9px] font-pixel font-bold shrink-0"
                      >
                        RETOMAR
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowLogs((v) => !v)}
                    className="min-h-[34px] px-2.5 medieval-btn-wood text-[10px] font-bold flex items-center gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5 text-amber-300" />
                    <span>
                      {showLogs
                        ? 'Ocultar Log de Etapas'
                        : `Ver Log de Sincronização (${cloudSnap.diagnosticLogs.length})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleManualSyncNow}
                    className="min-h-[36px] px-3 medieval-btn-emerald font-pixel text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {hasErrorOrResume
                        ? 'RETOMAR SINCRONIZAÇÃO'
                        : 'SINCRONIZAR MUNDOS AGORA'}
                    </span>
                  </button>
                </div>

                {/* Structured Stage Diagnostic Logs */}
                {showLogs && (
                  <div className="bg-[#110a06] border border-[#4a301e] p-2.5 space-y-1.5 max-h-44 overflow-y-auto font-mono text-[10px]">
                    <div className="flex items-center justify-between border-b border-[#3a2518] pb-1">
                      <span className="text-amber-300 font-bold">
                        LOG ESTRUTURADO POR ETAPA (SEM CREDENCIAIS)
                      </span>
                      <button
                        type="button"
                        onClick={() => firebaseCloudSync.clearDiagnosticLogs()}
                        className="text-[9px] text-[#c4ab7d] hover:text-white underline"
                      >
                        Limpar
                      </button>
                    </div>
                    {cloudSnap.diagnosticLogs.length === 0 ? (
                      <div className="text-[#8c6d46] py-2">
                        Nenhum evento registrado nesta sessão.
                      </div>
                    ) : (
                      cloudSnap.diagnosticLogs.map((entry) => (
                        <div
                          key={entry.id}
                          className={`py-0.5 border-b border-[#24160e] ${
                            entry.level === 'ERROR'
                              ? 'text-rose-300'
                              : entry.level === 'WARN'
                              ? 'text-amber-300'
                              : entry.level === 'SUCCESS'
                              ? 'text-emerald-300'
                              : 'text-[#e5d5b5]'
                          }`}
                        >
                          <span className="text-[#8c6d46]">
                            [{new Date(entry.timestamp).toLocaleTimeString()}]
                          </span>{' '}
                          <span className="font-bold">[{entry.stage}]</span>{' '}
                          {entry.worldName ? `(${entry.worldName}) ` : ''}
                          <span>{entry.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Account Entitlements & Exclusive Content Linked to UID */}
              <div className="medieval-inset p-3 space-y-2 border border-amber-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span className="font-pixel text-[11px] font-bold text-amber-300">
                      CONTEÚDOS EXCLUSIVOS & COMPRAS DA CONTA (UID)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-300 font-bold">
                    {cloudSnap.entitlements.length} ativo(s)
                  </span>
                </div>

                {cloudSnap.entitlements.length === 0 ? (
                  <p className="text-[11px] text-[#c4ab7d] leading-snug">
                    Sua conta está preparada para vincular pacotes cosméticos, recompensas exclusivas e aquisições futuras diretamente ao seu UID (<strong>{cloudSnap.user.uid.slice(0, 10)}...</strong>).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {cloudSnap.entitlements.map((ent) => (
                      <div
                        key={ent.entitlementId}
                        className="mc-slot px-2.5 py-1.5 flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-amber-200 truncate">
                          {ent.sku}
                        </span>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                          Ativo
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Integration & Security Status Summary */}
          <div className="medieval-inset p-3 space-y-2 border border-[#4a301e] text-[11px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-pixel text-[10px] font-bold text-amber-300 uppercase">
                  Diagnóstico da Arquitetura Híbrida Firebase
                </span>
              </div>
              <span className="font-mono text-[10px] text-emerald-300 font-bold">
                {clientDiag.projectId}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px]">
              <div className="mc-slot px-2 py-1.5 flex items-center justify-between">
                <span className="text-[#c4ab7d]">Metadados & Índice:</span>
                <span
                  className={
                    firestoreReachable === null
                      ? 'text-amber-300 font-bold'
                      : firestoreReachable
                      ? 'text-emerald-300 font-bold'
                      : 'text-red-400 font-bold'
                  }
                >
                  {firestoreReachable === null
                    ? 'Verificando...'
                    : firestoreReachable
                    ? 'Cloud Firestore Online'
                    : 'Offline'}
                </span>
              </div>

              <div className="mc-slot px-2 py-1.5 flex items-center justify-between">
                <span className="text-[#c4ab7d]">Motor de Chunks:</span>
                <span className="text-sky-300 font-bold truncate ml-1">
                  {serverAdminStatus.storageMode}
                </span>
              </div>

              <div className="mc-slot px-2 py-1.5 flex items-center justify-between">
                <span className="text-[#c4ab7d]">Salvamento Local:</span>
                <span className="text-emerald-300 font-bold">
                  IndexedDB + localStorage
                </span>
              </div>

              <div className="mc-slot px-2 py-1.5 flex items-center justify-between">
                <span className="text-[#c4ab7d]">Chaves Admin Isoladas:</span>
                <span
                  className={
                    serverAdminStatus.adminSecretsIsolated
                      ? 'text-emerald-300 font-bold'
                      : 'text-red-400 font-bold'
                  }
                >
                  {serverAdminStatus.adminSecretsIsolated
                    ? 'Protegidas'
                    : 'Alerta'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#1a110b] border-t-2 border-[#4a301e] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 medieval-btn-wood text-xs font-bold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
