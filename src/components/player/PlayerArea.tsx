import React, { useState } from 'react';
import {
  Sparkles,
  Users,
  Eye,
  EyeOff,
  Skull,
  Shield,
  Moon,
  Ghost,
  Lock,
  HeartPulse,
  LogOut,
  UserCheck
} from 'lucide-react';
import { Player, GameStatus, RoleType } from '../../types/game';

interface PlayerAreaProps {
  player: Player;
  players: Player[];
  gameStatus: GameStatus;
  totalJoinedCount: number;
  onLogoutDevice: () => void;
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  players,
  gameStatus,
  totalJoinedCount,
  onLogoutDevice,
}) => {
  const [roleRevealed, setRoleRevealed] = useState(false);

  const getStatusBadge = () => {
    switch (gameStatus) {
      case 'Lobby':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff6b00]/15 border border-[#ff6b00]/30 text-[#ff6b00] text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#ff6b00] animate-pulse" />
            Lobby
          </span>
        );
      case 'Läuft':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase tracking-wider shadow-sm shadow-rose-950">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            Spiel Läuft
          </span>
        );
      case 'Beendet':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            Beendet
          </span>
        );
    }
  };

  const getRoleIcon = (role: RoleType) => {
    switch (role) {
      case 'Vampir':
        return <Skull className="w-8 h-8 text-rose-500" />;
      case 'Werwolf':
        return <Moon className="w-8 h-8 text-yellow-400" />;
      case 'Geist':
        return <Ghost className="w-8 h-8 text-purple-400" />;
      case 'Geisterjäger':
        return <Shield className="w-8 h-8 text-cyan-400" />;
      case 'Mensch':
        return <Users className="w-8 h-8 text-emerald-400" />;
      default:
        return <Sparkles className="w-8 h-8 text-[#ff6b00]" />;
    }
  };

  const isDead = player.status === 'tot';

  // List of active lobby guests (visible to all players)
  const lobbyGuests = players.filter((p) => p.status !== 'entfernt');

  return (
    <div className="space-y-4 max-w-md mx-auto pb-10">
      {/* Top Status Bar */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 shadow-lg">
        <div className="flex items-center gap-2">
          {getStatusBadge()}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 bg-zinc-900 px-3 py-1 rounded-xl border border-zinc-800">
            <Users className="w-3.5 h-3.5 text-[#ff6b00]" />
            <span>{totalJoinedCount} Spieler</span>
          </div>
          <button
            onClick={onLogoutDevice}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 transition cursor-pointer"
            title="Gerät abmelden"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Eigenes Profil */}
      <div className="p-5 rounded-3xl bg-linear-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={player.photoUrl}
              alt={player.name}
              className={`w-20 h-20 rounded-2xl object-cover border-2 shadow-lg ${
                isDead ? 'border-zinc-700 grayscale' : 'border-[#ff6b00]/60'
              }`}
            />
            {isDead && (
              <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center text-red-500">
                <Skull className="w-8 h-8" />
              </div>
            )}
          </div>

          <div className="truncate flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif font-black text-xl text-white tracking-wide truncate">
                {player.name}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ff6b00]/20 text-[#ff6b00] border border-[#ff6b00]/30">
                Du
              </span>
            </div>
            <p className="text-xs text-[#ff6b00] font-semibold mt-0.5 truncate flex items-center gap-1">
              <Sparkles className="w-3 h-3 shrink-0" />
              {player.costumeName}
            </p>

            <div className="mt-2 flex items-center gap-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  player.status === 'lebendig'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                    : player.status === 'tot'
                    ? 'bg-red-950 text-red-400 border-red-500/40'
                    : player.status === 'pausiert'
                    ? 'bg-amber-950 text-amber-300 border-amber-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                Status: {player.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. LOBBY-MODUS: Warten auf Start & Live Spielerliste */}
      {gameStatus === 'Lobby' && (
        <div className="space-y-4">
          {/* Lobby Welcome Card */}
          <div className="p-6 rounded-3xl bg-linear-to-b from-purple-950/40 via-zinc-900 to-zinc-950 border-2 border-purple-500/30 text-center space-y-3 shadow-xl">
            <div className="w-14 h-14 rounded-full bg-[#ff6b00]/10 border border-[#ff6b00]/30 text-[#ff6b00] flex items-center justify-center mx-auto animate-pulse">
              <Sparkles className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-serif font-black text-xl text-white">
                Das Spiel startet bald
              </h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
                Willkommen in der Party-Lobby! Der Spielleiter teilt die geheimen Rollen zu.
                Sobald die Runde gestartet wird, schaltet sich dein Spielbereich automatisch frei.
              </p>
            </div>

            <div className="pt-1 flex items-center justify-center gap-2 text-xs font-bold text-zinc-300 bg-zinc-950/60 p-2.5 rounded-2xl border border-zinc-800">
              <Users className="w-4 h-4 text-[#ff6b00]" />
              <span>Bereits {totalJoinedCount} Gäste in der Lobby</span>
            </div>
          </div>

          {/* Live Beigetretene Spielerliste (Live aus Server-Datenbank) */}
          <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="font-serif font-bold text-sm text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#ff6b00]" />
                Lobby-Gäste ({lobbyGuests.length})
              </h4>
              <span className="text-[10px] text-zinc-500">Live synchronisiert</span>
            </div>

            {lobbyGuests.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">Noch keine anderen Gäste beigetreten.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                {lobbyGuests.map((guest) => {
                  const isCurrent = guest.id === player.id;
                  return (
                    <div
                      key={guest.id}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl border transition ${
                        isCurrent
                          ? 'bg-[#ff6b00]/10 border-[#ff6b00]/50'
                          : 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <img
                        src={guest.photoUrl}
                        alt={guest.name}
                        className="w-12 h-12 rounded-xl object-cover border border-zinc-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-white truncate">
                            {guest.name}
                          </p>
                          {isCurrent && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#ff6b00] text-black">
                              Du
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#ff6b00] truncate font-medium">
                          {guest.costumeName}
                        </p>
                        <span className="text-[9px] text-zinc-400 capitalize">
                          {guest.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SPIELBEREICH (Läuft oder Beendet) */}
      {gameStatus !== 'Lobby' && (
        <>
          {/* GEHEIME ROLLE KARTE */}
          <div className="p-5 rounded-3xl bg-zinc-900/95 border-2 border-zinc-800 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Deine Geheime Rolle
              </span>
              <span className="text-[10px] text-zinc-500">
                {roleRevealed ? 'Sichtbar' : 'Verdeckt'}
              </span>
            </div>

            {!roleRevealed ? (
              <div className="p-6 rounded-2xl bg-linear-to-b from-purple-950/60 to-zinc-950 border border-purple-500/40 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-300">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-base text-white">
                    Rolle geheim verdeckt
                  </h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Tippe auf den Button, um deine Rolle diskret anzusehen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRoleRevealed(true)}
                  className="w-full py-3.5 px-4 rounded-xl bg-linear-to-r from-purple-700 to-rose-600 hover:from-purple-600 hover:to-rose-500 text-white font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-98 transition"
                >
                  <Eye className="w-4 h-4" />
                  Rolle aufdecken
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-linear-to-b from-zinc-950 via-zinc-900 to-zinc-950 border-2 border-rose-500/50 text-center space-y-3 animate-in fade-in zoom-in-95">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-rose-500/40 flex items-center justify-center mx-auto shadow-md">
                  {getRoleIcon(player.role)}
                </div>

                <div>
                  <h3 className="font-serif font-black text-2xl text-white tracking-wide">
                    {player.role}
                  </h3>
                  <span
                    className={`inline-block mt-1 text-xs font-bold px-3 py-0.5 rounded-full border ${
                      player.team === 'Böse'
                        ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                        : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                    }`}
                  >
                    Team: {player.team}
                  </span>
                </div>

                <p className="text-xs text-zinc-300 max-w-xs mx-auto pt-1 leading-relaxed">
                  {player.role === 'Vampir' && 'Du gehörst zur Nacht. Töte im Geheimen durch sanfte Berührung und Flüstern.'}
                  {player.role === 'Werwolf' && 'Du bist ein Werwolf. Halte dich bereit für die Jagd.'}
                  {player.role === 'Geist' && 'Du wandelst als Geist. Schlage nur zu, wenn du mit dem Opfer allein bist.'}
                  {player.role === 'Geisterjäger' && 'Du bist der Schutz der Sterblichen. Exorziere die Bösen.'}
                  {player.role === 'Mensch' && 'Du bist ein sterblicher Gast. Überlebe die Nacht und entlarve die Kreaturen.'}
                </p>

                <button
                  type="button"
                  onClick={() => setRoleRevealed(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer mt-2"
                >
                  <EyeOff className="w-4 h-4" />
                  Rolle wieder verbergen
                </button>
              </div>
            )}
          </div>

          {/* VORBEREITETER LEERER BEREICH: MEINE AKTIONEN */}
          <div className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-[#ff6b00]" />
                Meine Aktionen
              </h3>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                Bereit
              </span>
            </div>

            <div className="p-8 text-center text-zinc-500 rounded-2xl bg-zinc-950/60 border border-dashed border-zinc-800 space-y-2">
              <Sparkles className="w-6 h-6 text-[#ff6b00]/60 mx-auto" />
              <p className="text-xs font-medium text-zinc-400">
                Aktionsbereich vorbereitet
              </p>
              <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                Die spezifischen Rollen-Funktionen werden in einem späteren Schritt freigeschaltet.
              </p>
            </div>
          </div>

          {/* Mitspieler Übersicht (ohne Rollen) */}
          <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="font-serif font-bold text-sm text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#ff6b00]" />
                Mitspieler ({lobbyGuests.length})
              </h4>
              <span className="text-[10px] text-zinc-500">Live Status</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
              {lobbyGuests.map((guest) => (
                <div
                  key={guest.id}
                  className={`flex items-center gap-3 p-2 rounded-2xl border ${
                    guest.status === 'tot'
                      ? 'bg-red-950/20 border-red-900/40 opacity-60'
                      : 'bg-zinc-950/70 border-zinc-800/80'
                  }`}
                >
                  <img
                    src={guest.photoUrl}
                    alt={guest.name}
                    className={`w-10 h-10 rounded-xl object-cover border shrink-0 ${
                      guest.status === 'tot' ? 'border-red-500/50 grayscale' : 'border-zinc-700'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{guest.name}</p>
                    <p className="text-[10px] text-[#ff6b00] truncate">{guest.costumeName}</p>
                    <span
                      className={`text-[9px] font-bold uppercase ${
                        guest.status === 'lebendig'
                          ? 'text-emerald-400'
                          : guest.status === 'tot'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {guest.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
