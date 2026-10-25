import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  MessageSquare,
  Power,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  User,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { GAME_VERSION, GameSettings } from '../game/core/types';
import { GameEngine, HudSnapshot } from '../game/loop/GameEngine';

interface OnlineInviteModalProps {
  engine: GameEngine;
  snapshot: HudSnapshot;
  settings: GameSettings;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onClose: () => void;
}

export const OnlineInviteModal: React.FC<OnlineInviteModalProps> = ({
  engine,
  snapshot,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const session = snapshot.onlineSession;
  const [copied, setCopied] = useState(false);
  const [nameInput, setNameInput] = useState(
    session.localPlayerName || settings.playerName || 'Aventureiro'
  );
  const [nameSaved, setNameSaved] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  const onToggleOnline = () => engine.toggleOnlineSession();
  const onRegenerateCode = () => engine.regenerateInviteCode();
  const onUpdatePlayerName = (name: string) => {
    engine.updateMultiplayerPlayerName(name);
    onUpdateSettings({ ...settings, playerName: name });
  };
  const onSendChat = (text: string) => engine.sendMultiplayerChat(text);

  const isActivating = session.activationState === 'ACTIVATING';
  const hasError = session.activationState === 'ERROR';
  const steps = session.activationSteps || [];

  const handleCopyCode = () => {
    if (!session.inviteCode) return;
    navigator.clipboard.writeText(session.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onUpdatePlayerName(trimmed);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1800);
  };

  const handleSendChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 select-none">
      <div
        className="w-full max-w-lg rounded-2xl border-2 border-[#7c5330] bg-[#16110c] text-[#f5e7d3] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-[#261b12] via-[#312216] to-[#261b12] border-b border-[#5e3e22]">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                session.isOnline
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-400'
                  : isActivating
                  ? 'bg-amber-950/80 border-amber-500/60 text-amber-400'
                  : hasError
                  ? 'bg-rose-950/80 border-rose-500/60 text-rose-400'
                  : 'bg-stone-900 border-stone-700 text-stone-400'
              }`}
            >
              {isActivating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : session.isOnline ? (
                <Wifi className="w-5 h-5" />
              ) : (
                <WifiOff className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold tracking-wide uppercase text-amber-300 flex items-center gap-2">
                <span>Modo Online & Convite</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-[10px] font-mono text-amber-200">
                  v{session.gameVersion || GAME_VERSION}
                </span>
              </h2>
              <p className="text-[11px] text-amber-100/70">
                {session.role === 'GUEST'
                  ? `Conectado ao mundo de ${session.hostName} (v${session.gameVersion || GAME_VERSION})`
                  : isActivating
                  ? 'Ativando sala online no servidor...'
                  : session.isOnline
                  ? 'Mundo aberto para amigos entrarem na mesma versão'
                  : 'Ative o modo online para gerar um código de convite'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-black/40 hover:bg-black/70 text-amber-200/80 hover:text-white border border-amber-900/50 transition"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Status & Toggle Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#211810] border border-[#4d341e]">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isActivating
                    ? 'bg-amber-400 animate-ping'
                    : session.isOnline
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                    : hasError
                    ? 'bg-rose-500'
                    : 'bg-stone-500'
                }`}
              />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
                  {isActivating
                    ? 'ATIVANDO MODO ONLINE...'
                    : session.isOnline
                    ? session.role === 'HOST'
                      ? 'MUNDO ONLINE (HOSPEDANDO)'
                      : 'MUNDO ONLINE (CONVIDADO)'
                    : hasError
                    ? 'FALHA NA ATIVAÇÃO ONLINE'
                    : 'MODO OFFLINE (CONVITE DESATIVADO)'}
                </div>
                <div className="text-[11px] text-amber-100/60">
                  Mundo:{' '}
                  <strong className="text-amber-200">
                    {session.worldName || 'Fronteira'}
                  </strong>
                  {session.isOnline && session.transportMode && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/40 text-[9px] text-emerald-300 font-bold">
                      {session.transportMode === 'P2P_WEBRTC'
                        ? 'P2P WEBRTC TEMPO REAL'
                        : session.transportMode === 'WEBSOCKET'
                        ? 'WS + P2P TEMPO REAL'
                        : 'HTTP + P2P TEMPO REAL'}
                    </span>
                  )}
                  {session.isOnline && (
                    <span
                      className={`ml-1.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                        session.syncStatus === 'RESYNCING'
                          ? 'bg-amber-950/90 border-amber-500/50 text-amber-300 animate-pulse'
                          : 'bg-sky-950/80 border-sky-500/40 text-sky-300'
                      }`}
                    >
                      {session.syncStatus === 'RESYNCING'
                        ? '🔄 RESSINCRONIZANDO...'
                        : '✓ SINCRONIA ATIVA'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {session.isOnline && (
                <button
                  onClick={() => engine.forceMultiplayerResync()}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider bg-sky-950/80 hover:bg-sky-900/90 border border-sky-500/50 text-sky-200 transition cursor-pointer"
                  title="Forçar ressincronização imediata do mundo e jogadores"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      session.syncStatus === 'RESYNCING' ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Ressincronizar</span>
                </button>
              )}

              {session.role !== 'GUEST' && (
                <button
                  onClick={() => {
                    setShowDiagnostics(true);
                    onToggleOnline();
                  }}
                  disabled={isActivating}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition cursor-pointer ${
                    isActivating
                      ? 'bg-amber-900/40 border-amber-600/50 text-amber-200 opacity-75 cursor-wait'
                      : session.isOnline
                      ? 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-500/50 text-rose-200'
                      : 'bg-emerald-700 hover:bg-emerald-600 border-emerald-400/60 text-white shadow-lg shadow-emerald-950/50'
                  }`}
                >
                  {isActivating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Ativando...
                    </>
                  ) : (
                    <>
                      <Power className="w-3.5 h-3.5" />
                      {session.isOnline
                        ? 'Desativar Online'
                        : hasError
                        ? 'Tentar Novamente'
                        : 'Abrir Mundo Online'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Fast Activation Loading & Verification Checklist */}
          {(isActivating || hasError || (steps.length > 0 && showDiagnostics)) && (
            <div
              className={`rounded-xl border p-3 transition-all ${
                hasError
                  ? 'bg-rose-950/30 border-rose-500/50'
                  : isActivating
                  ? 'bg-amber-950/30 border-amber-500/50'
                  : 'bg-emerald-950/25 border-emerald-500/40'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider">
                  {isActivating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                      <span className="text-amber-300">
                        Verificando e Ativando Servidor Online...
                      </span>
                    </>
                  ) : hasError ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-rose-300">
                        Diagnóstico de Erro na Ativação
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">
                        Ativação Concluída com Sucesso
                      </span>
                    </>
                  )}
                </div>

                {!isActivating && !hasError && (
                  <button
                    onClick={() => setShowDiagnostics(false)}
                    className="text-[10px] text-amber-200/60 hover:text-amber-200 underline cursor-pointer"
                  >
                    Ocultar
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
                      step.status === 'success'
                        ? 'bg-emerald-950/40 border-emerald-700/40 text-emerald-200'
                        : step.status === 'loading'
                        ? 'bg-amber-950/50 border-amber-600/50 text-amber-200'
                        : step.status === 'error'
                        ? 'bg-rose-950/60 border-rose-600/60 text-rose-200'
                        : 'bg-black/30 border-stone-800 text-stone-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {step.status === 'loading' && (
                        <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                      )}
                      {step.status === 'success' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      {step.status === 'error' && (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      {step.status === 'pending' && (
                        <span className="w-3.5 h-3.5 rounded-full border border-stone-600 inline-block shrink-0" />
                      )}
                      <span className="font-semibold truncate">{step.label}</span>
                    </div>

                    {step.detail && (
                      <span
                        className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded ${
                          step.status === 'success'
                            ? 'bg-emerald-900/50 text-emerald-300'
                            : step.status === 'error'
                            ? 'bg-rose-900/60 text-rose-200 font-bold'
                            : 'bg-black/30 text-amber-200/70'
                        }`}
                      >
                        {step.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {hasError && session.lastError && (
                <div className="mt-2.5 p-2 rounded-lg bg-rose-950/80 border border-rose-500/60 text-[11px] text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-300">
                      Causa detectada:
                    </div>
                    <div>{session.lastError}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Invite Code Card */}
          {session.isOnline && session.inviteCode ? (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#291d12] via-[#1f160e] to-[#291d12] border-2 border-amber-500/50 shadow-inner text-center space-y-2.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-extrabold uppercase tracking-widest">
                <Sparkles className="w-3 h-3" /> Código de Convite do Mundo
              </div>

              <div className="flex items-center justify-center gap-2">
                <div className="px-5 py-2.5 rounded-xl bg-black/60 border border-amber-500/40 font-mono text-2xl sm:text-3xl font-black tracking-[0.28em] text-amber-300 select-all shadow-inner">
                  {session.inviteCode}
                </div>

                <button
                  onClick={handleCopyCode}
                  className="flex flex-col items-center justify-center px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-extrabold text-xs transition shadow-md cursor-pointer"
                  title="Copiar código"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="text-[10px] mt-0.5">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-[10px] mt-0.5">Copiar</span>
                    </>
                  )}
                </button>

                {session.role === 'HOST' && (
                  <button
                    onClick={() => {
                      setShowDiagnostics(true);
                      onRegenerateCode();
                    }}
                    disabled={isActivating}
                    className="flex flex-col items-center justify-center px-3 py-2.5 rounded-xl bg-[#332417] hover:bg-[#422f1e] text-amber-200 border border-[#614328] text-xs transition cursor-pointer"
                    title="Gerar novo código de convite"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isActivating ? 'animate-spin' : ''}`}
                    />
                    <span className="text-[10px] mt-0.5">Novo</span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-amber-100/75 max-w-md mx-auto leading-relaxed">
                Outro jogador só precisa abrir a tela inicial de{' '}
                <strong>Mundos</strong>, digitar este código em{' '}
                <strong>Entrar com Código de Convite</strong> e clicar em
                Conectar. O convite vale enquanto você estiver com este mundo
                aberto!
              </p>
            </div>
          ) : (
            !isActivating && (
              <div className="p-4 rounded-xl bg-black/30 border border-stone-800 text-center text-xs text-stone-400">
                Clique em{' '}
                <strong className="text-emerald-400">Abrir Mundo Online</strong>{' '}
                acima para ativar a sala no servidor e gerar um código de convite
                instantâneo.
              </div>
            )
          )}

          {/* Player Name Configuration */}
          <form
            onSubmit={handleSaveName}
            className="p-3 rounded-xl bg-[#1f160f] border border-[#47301b] space-y-2"
          >
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300/90">
              <User className="w-3.5 h-3.5" /> Seu Nome no Jogo Online
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={20}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex: Guardião Aric"
                className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-[#5c3e23] text-xs text-amber-100 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#3b2919] hover:bg-[#4f3722] border border-amber-500/40 text-amber-200 text-xs font-bold transition cursor-pointer"
              >
                {nameSaved ? 'Salvo!' : 'Atualizar'}
              </button>
            </div>
          </form>

          {/* Quick In-Game Chat Bubble Sender */}
          {session.isOnline && (
            <form
              onSubmit={handleSendChatSubmit}
              className="p-3 rounded-xl bg-[#1f160f] border border-[#47301b] space-y-2"
            >
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300/90">
                <MessageSquare className="w-3.5 h-3.5" /> Mensagem Rápida (Balão
                de Fala no Mundo)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={75}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Digite uma mensagem para os jogadores no mundo..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-[#5c3e23] text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-extrabold flex items-center gap-1 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar
                </button>
              </div>
            </form>
          )}

          {/* Connected Players List */}
          <div className="p-3 rounded-xl bg-[#1f160f] border border-[#47301b] space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300/90">
                <Users className="w-3.5 h-3.5" /> Jogadores neste Mundo (
                {session.connectedPeers.length || 1})
              </span>
              <span className="text-[10px] text-emerald-400/90 flex items-center gap-1">
                <Globe className="w-3 h-3" /> Tempo Real
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {session.connectedPeers.length === 0 ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border border-stone-800 text-xs">
                  <span className="font-semibold text-amber-100">
                    {session.localPlayerName} (Você)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                    Local
                  </span>
                </div>
              ) : (
                session.connectedPeers.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border border-[#422d1a] text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-bold text-amber-100">
                        {peer.name}
                      </span>
                      {peer.level && (
                        <span className="text-[10px] text-amber-400/80">
                          Nv.{peer.level}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                        peer.isHost
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      <Shield className="w-2.5 h-2.5" />
                      {peer.isHost ? 'Anfitrião' : 'Convidado'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
