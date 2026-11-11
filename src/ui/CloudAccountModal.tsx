import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Copy,
  Gift,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
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

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  onClose,
  onWorldsUpdated,
}) => {
  const [cloudSnap, setCloudSnap] = useState<CloudSyncSnapshot>(() =>
    firebaseCloudSync.getSnapshot()
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const unsub = firebaseCloudSync.subscribe((snap) => {
      setCloudSnap(snap);
    });
    return unsub;
  }, []);

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
    setFeedback('Sincronizando mundos locais e nuvem (Cloud Firestore)...');
    try {
      await firebaseCloudSync.syncAllWorldsWithCloud();
      await firebaseCloudSync.syncAllGuestProfilesWithCloud();
      await firebaseCloudSync.fetchUserEntitlements();
      onWorldsUpdated?.();
      setFeedback(
        'Sincronização concluída! Todos os seus mundos locais e na nuvem estão atualizados.'
      );
    } catch (err: any) {
      setFeedback(
        err?.message || 'Erro ao sincronizar mundos com o Cloud Firestore.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyUid = (uidToCopy: string) => {
    navigator.clipboard?.writeText(uidToCopy).catch(() => {});
    setFeedback(`UID copiado: ${uidToCopy}`);
  };

  const localWorldsCount = SaveManager.listWorlds().length;
  const legacyDeviceUid = getOrCreateLocalDevicePlayerUid();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[94dvh] medieval-panel flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a110b] border-b-2 border-[#4a301e] shrink-0">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-400" />
            <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
              CONTA GOOGLE & NUVEM FIREBASE
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
            <div className="medieval-inset px-3 py-2 border border-amber-500/40 text-xs text-amber-200 font-bold flex items-center justify-between gap-2">
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
                    Vincule seus mundos, aparência universal, montarias domesticadas e futuros conteúdos exclusivos ao seu <strong>UID único do Firebase</strong> para jogar em qualquer celular ou computador.
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
                  ✓ Seus mundos locais atuais serão migrados e preservados automaticamente ao fazer login!
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
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/50 text-[9px] font-bold text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>CONECTADO</span>
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

                {/* UID & Sync Telemetry */}
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
                        Mundos no Cloud Firestore
                      </div>
                      <div className="font-bold text-sky-300 text-xs">
                        {Math.max(cloudSnap.cloudWorldsCount, localWorldsCount)}{' '}
                        mundo(s) sincronizado(s)
                      </div>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-[#c4ab7d]">
                    {cloudSnap.lastSyncedAt
                      ? `Última sincronização na nuvem: ${new Date(
                          cloudSnap.lastSyncedAt
                        ).toLocaleTimeString()}`
                      : 'Sincronização automática em tempo real ativa'}
                  </span>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleManualSyncNow}
                    className="min-h-[36px] px-3 medieval-btn-emerald font-pixel text-[10px] font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`}
                    />
                    <span>SINCRONIZAR MUNDOS AGORA</span>
                  </button>
                </div>
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
