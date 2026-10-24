import React, { useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  MessageSquare,
  Power,
  RefreshCw,
  Send,
  Shield,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { GameSettings } from '../game/core/types';
import { GameEngine, HudSnapshot } from '../game/loop/GameEngine';

interface OnlineInviteModalProps {
  engine: GameEngine;
  snapshot: HudSnapshot;
  settings: GameSettings;
  onUpdateSettings: (s: GameSettings) => void;
  onClose: () => void;
}

const QUICK_EMOTES = [
  '👋 Olá! Bem-vindo ao mundo!',
  '🧭 Siga-me!',
  '⚔️ Preciso de ajuda aqui!',
  '🏠 Venha até a base!',
  '💰 Vamos negociar na tenda!',
];

export const OnlineInviteModal: React.FC<OnlineInviteModalProps> = ({
  engine,
  snapshot,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const session = snapshot.onlineSession;
  const [playerNameInput, setPlayerNameInput] = useState(
    session.localPlayerName || settings.playerName || 'Aventureiro'
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleCopyInviteCode = () => {
    if (!session.inviteCode) return;
    navigator.clipboard?.writeText(session.inviteCode).catch(() => {});
    setCopiedCode(true);
    setFeedbackMsg(
      `Código ${session.inviteCode} copiado! Envie para seu amigo colocar na tela inicial do jogo dele.`
    );
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleSavePlayerName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = playerNameInput.trim().slice(0, 22) || 'Aventureiro';
    setPlayerNameInput(clean);
    engine.updateMultiplayerPlayerName(clean);
    onUpdateSettings({
      ...settings,
      playerName: clean,
    });
    setFeedbackMsg(`Seu nome online foi atualizado para "${clean}".`);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    engine.sendMultiplayerChat(chatInput);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-2xl medieval-panel flex flex-col max-h-[94dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a110b] border-b-2 border-[#4a301e]">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h2 className="font-pixel text-xs sm:text-sm font-bold text-amber-400">
              MODO ONLINE & CÓDIGO DE CONVITE DO MUNDO
            </h2>
          </div>
          <button
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] medieval-btn-crimson flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {feedbackMsg && (
            <div className="medieval-inset px-3 py-2 flex items-center justify-between text-xs text-emerald-300 border border-emerald-500/40">
              <span>{feedbackMsg}</span>
              <button
                onClick={() => setFeedbackMsg(null)}
                className="text-[#c4ab7d] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Top Banner: Invite Code Box */}
          <div className="medieval-inset p-3.5 sm:p-4 border-2 border-amber-500/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {session.isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/90 border border-emerald-500/70 text-emerald-300 text-[11px] font-bold">
                    <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span>MUNDO ABERTO E ONLINE</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-stone-900 border border-stone-600 text-stone-300 text-[11px] font-bold">
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    <span>MODO OFFLINE (CONVITE DESATIVADO)</span>
                  </span>
                )}

                <span className="text-[11px] text-[#c4ab7d]">
                  Mundo: <strong className="text-white">{snapshot.metadata.name}</strong>
                </span>
              </div>

              {session.role !== 'GUEST' && (
                <button
                  type="button"
                  onClick={() => engine.toggleOnlineSession()}
                  className={`min-h-[34px] px-3 py-1 text-xs font-bold flex items-center gap-1.5 ${
                    session.isOnline ? 'medieval-btn-crimson' : 'medieval-btn-emerald'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>
                    {session.isOnline ? 'Fechar Sala Online' : 'Abrir Mundo Online'}
                  </span>
                </button>
              )}
            </div>

            {session.isOnline && session.inviteCode ? (
              <div className="bg-[#120b07] border-2 border-amber-500/60 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-[10px] font-pixel text-amber-300 uppercase">
                    SEU CÓDIGO DE CONVITE DESTE MUNDO:
                  </div>
                  <div className="font-pixel text-xl sm:text-2xl font-extrabold tracking-[0.22em] text-amber-400 select-all">
                    {session.inviteCode}
                  </div>
                  <p className="text-[11px] text-[#c4ab7d]">
                    Outra pessoa no jogo dela só precisa digitar este código em{' '}
                    <strong className="text-white">"Entrar com Código de Convite"</strong>.
                    Válido enquanto você estiver com este mundo aberto!
                  </p>
                </div>

                <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyInviteCode}
                    className="flex-1 sm:w-44 min-h-[42px] px-3 medieval-btn-gold font-pixel text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>COPIADO!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>COPIAR CÓDIGO</span>
                      </>
                    )}
                  </button>

                  {session.role === 'HOST' && (
                    <button
                      type="button"
                      onClick={() => engine.regenerateInviteCode()}
                      className="min-h-[36px] px-2.5 medieval-btn-wood text-[11px] font-bold flex items-center justify-center gap-1.5"
                      title="Gerar um novo código de convite para este mundo"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
                      <span>Trocar Código</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#120b07] border border-[#4a301e] p-3 text-xs text-[#c4ab7d]">
                Clique em <strong className="text-emerald-400">"Abrir Mundo Online"</strong>{' '}
                acima para gerar um código de convite ativo para este mundo.
              </div>
            )}
          </div>

          {/* 2-Column Grid: Player Identity + Connected Players & Quick Chat */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Left Column (5 cols): Player Name & Rules */}
            <div className="sm:col-span-5 space-y-3">
              <form
                onSubmit={handleSavePlayerName}
                className="medieval-inset p-3 space-y-2"
              >
                <label className="block font-pixel text-[10px] text-amber-400 font-bold">
                  SEU NOME NO MUNDO ONLINE
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    maxLength={22}
                    value={playerNameInput}
                    onChange={(e) => setPlayerNameInput(e.target.value)}
                    placeholder="Seu nome/nick..."
                    className="flex-1 h-9 px-2.5 mc-slot text-xs text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 min-h-[36px] medieval-btn-gold text-xs font-bold"
                  >
                    Salvar
                  </button>
                </div>
                <p className="text-[10px] text-[#c4ab7d]">
                  Aparece acima do seu personagem para os outros jogadores.
                </p>
              </form>

              <div className="medieval-inset p-3 space-y-1.5 text-[11px] text-[#e5d5b5]">
                <div className="flex items-center gap-1.5 font-pixel text-[10px] text-sky-300 font-bold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>COMO FUNCIONA O CONVITE</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-[10px] text-[#c4ab7d]">
                  <li>
                    Para convidar alguém, basta estar dentro do seu mundo com o modo online ativo.
                  </li>
                  <li>
                    O convidado digita seu código na tela inicial dele e entra direto neste mundo em tempo real.
                  </li>
                  <li>
                    Construções, colheitas, baús, tendas e combates são sincronizados ao vivo.
                  </li>
                  <li>
                    Ao sair do mundo ou fechar o jogo, o convite é encerrado automaticamente.
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Column (7 cols): Connected Players List & Live Chat/Emotes */}
            <div className="sm:col-span-7 space-y-3 flex flex-col justify-between">
              <div className="medieval-inset p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-pixel text-[10px] text-amber-400 font-bold">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      JOGADORES NO MUNDO ({session.connectedPeers.length || 1})
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono-tabular">
                    {session.role === 'HOST'
                      ? 'Você é o Anfitrião'
                      : session.role === 'GUEST'
                      ? `Anfitrião: ${session.hostName}`
                      : 'Single-player'}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {session.connectedPeers.length === 0 ? (
                    <div className="p-2 mc-slot flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300">
                        👑 {session.localPlayerName} (Você)
                      </span>
                      <span className="text-[10px] text-[#c4ab7d]">
                        NV.{snapshot.player.level}
                      </span>
                    </div>
                  ) : (
                    session.connectedPeers.map((peer) => {
                      const isSelf = peer.peerId === engine.multiplayer.peerId;
                      return (
                        <div
                          key={peer.peerId}
                          className={`p-2 flex items-center justify-between text-xs ${
                            isSelf ? 'mc-slot-active' : 'mc-slot'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{peer.isHost ? '👑' : '🌐'}</span>
                            <span className="font-bold text-white">
                              {peer.name}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] text-amber-300 font-bold">
                                (Você)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span
                              className={
                                peer.isHost ? 'text-amber-400 font-bold' : 'text-sky-300'
                              }
                            >
                              {peer.isHost ? 'Anfitrião' : 'Convidado'}
                            </span>
                            {peer.level && (
                              <span className="text-[#c4ab7d] font-mono-tabular">
                                NV.{peer.level}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quick Chat & Overhead Message */}
              {session.isOnline && (
                <div className="medieval-inset p-3 space-y-2">
                  <div className="flex items-center gap-1.5 font-pixel text-[10px] text-amber-400 font-bold">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>MENSAGEM NO MUNDO (BALÃO DE FALA)</span>
                  </div>

                  <form onSubmit={handleSendChat} className="flex gap-1.5">
                    <input
                      type="text"
                      maxLength={70}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Escreva uma mensagem para os jogadores..."
                      className="flex-1 h-9 px-2.5 mc-slot text-xs text-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3 min-h-[36px] medieval-btn-emerald text-xs font-bold flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar</span>
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {QUICK_EMOTES.map((emote) => (
                      <button
                        key={emote}
                        type="button"
                        onClick={() => engine.sendMultiplayerChat(emote)}
                        className="px-2 py-1 mc-slot text-[10px] text-amber-200 hover:text-white"
                      >
                        {emote}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#1a110b] border-t-2 border-[#4a301e] flex items-center justify-end">
          <button
            onClick={onClose}
            className="min-h-[38px] px-6 medieval-btn-gold font-pixel text-xs font-bold"
          >
            VOLTAR AO MUNDO
          </button>
        </div>
      </div>
    </div>
  );
};
