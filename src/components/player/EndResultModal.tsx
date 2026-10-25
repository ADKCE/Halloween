import React from 'react';
import {
  Trophy,
  X,
  Medal,
  Users,
  Lock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { GameState, Player, KillRecord, TeamType } from '../../types/game';

interface EndResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameState;
  players: Player[];
  kills?: KillRecord[];
  onRequestAdminUnlock?: () => void;
  isAdminUnlocked?: boolean;
}

export const EndResultModal: React.FC<EndResultModalProps> = ({
  isOpen,
  onClose,
  gameState,
  players,
  onRequestAdminUnlock,
  isAdminUnlocked,
}) => {
  if (!isOpen) return null;

  const activePlayers = players.filter((p) => p.status !== 'entfernt');

  // Winner calculation
  const good = activePlayers.filter((p) => p.team === 'Gut');
  const evil = activePlayers.filter((p) => p.team === 'Böse');
  const goodAlive = good.filter((p) => p.status === 'lebendig').length;
  const evilAlive = evil.filter((p) => p.status === 'lebendig').length;

  const winnerTeam: TeamType =
    (gameState as any).winner_team || (evilAlive === 0 ? 'Gut' : 'Böse');

  // Top 3 Overall Ranking
  const topPlayers = [...activePlayers]
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-zinc-950 border-2 border-purple-500/60 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg shadow-amber-400/30">
              <Trophy className="w-5 h-5 fill-current" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-purple-400 block">
                Offizielles Endergebnis
              </span>
              <h3 className="font-serif font-black text-white text-lg leading-tight">
                Spiel beendet!
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            aria-label="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WINNER BANNER */}
        <div
          className={`p-4 rounded-2xl border text-center space-y-1.5 ${
            winnerTeam === 'Gut'
              ? 'bg-gradient-to-b from-emerald-950/70 to-zinc-900 border-emerald-500/50 text-emerald-200'
              : 'bg-gradient-to-b from-rose-950/70 to-zinc-900 border-rose-500/50 text-rose-200'
          }`}
        >
          <span className="text-[11px] font-mono font-bold tracking-wider uppercase block">
            Triumph der Nacht
          </span>
          <h4 className="text-2xl font-serif font-black text-white">
            Team {winnerTeam.toUpperCase()} gewinnt!
          </h4>
          <p className="text-xs text-zinc-300 leading-relaxed max-w-xs mx-auto">
            {winnerTeam === 'Gut'
              ? 'Alle Monster wurden besiegt oder exorziert. Die Sterblichen haben überlebt!'
              : 'Die Kreaturen der Nacht haben die Herrschaft über die Halloween-Party errungen!'}
          </p>

          <div className="grid grid-cols-2 gap-2 pt-2 text-left">
            <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-[11px]">
              <span className="text-zinc-400 block text-[9px] uppercase font-bold">Team GUT</span>
              <span className="font-mono font-black text-emerald-400 text-xs">
                {goodAlive} / {good.length} am Leben
              </span>
            </div>
            <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-[11px]">
              <span className="text-zinc-400 block text-[9px] uppercase font-bold">Team BÖSE</span>
              <span className="font-mono font-black text-rose-400 text-xs">
                {evilAlive} / {evil.length} am Leben
              </span>
            </div>
          </div>
        </div>

        {/* TOP 3 RANKING */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Medal className="w-3.5 h-3.5 text-amber-400" />
              Top 3 der Party
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Punkte-Wertung</span>
          </div>

          {topPlayers.length === 0 ? (
            <p className="text-xs text-zinc-500 italic text-center py-2">
              Keine Spielerdaten vorhanden.
            </p>
          ) : (
            topPlayers.map((tp, idx) => {
              const medalColor =
                idx === 0
                  ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
                  : idx === 1
                  ? 'text-zinc-300 border-zinc-400/30 bg-zinc-400/10'
                  : 'text-amber-600 border-amber-600/30 bg-amber-600/10';

              const medalLabel = idx === 0 ? '🥇 1. Platz' : idx === 1 ? '🥈 2. Platz' : '🥉 3. Platz';

              return (
                <div
                  key={tp.id}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 ${medalColor}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={tp.photoUrl || '/placeholder.png'}
                      alt={tp.name}
                      className="w-10 h-10 rounded-xl object-cover border border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-xs truncate">{tp.name}</span>
                        <span className="text-[9px] text-zinc-400 truncate">({tp.costumeName})</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                        <span>{medalLabel}</span>
                        <span>•</span>
                        <span className={tp.team === 'Böse' ? 'text-rose-400' : 'text-emerald-400'}>
                          {tp.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-black text-sm text-[#ff6b00] block">
                      {tp.points || 0} Pkt
                    </span>
                    <span className="text-[9px] text-zinc-500 block">
                      {tp.status === 'lebendig' ? 'Lebendig' : 'Tot'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* PRIMARY CLOSE BUTTON */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#ff6b00] to-orange-600 hover:from-[#ff7c1f] hover:to-orange-500 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-950/60 cursor-pointer transition active:scale-95 flex items-center justify-center gap-2"
          >
            <span>Schließen & Tabs ansehen</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {!isAdminUnlocked && onRequestAdminUnlock && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequestAdminUnlock();
              }}
              className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Lock className="w-3 h-3 text-zinc-500" />
              <span>Spielleiter-Login / Admin-Menü</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
