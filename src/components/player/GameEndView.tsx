import React, { useState } from 'react';
import {
  Trophy,
  Skull,
  Award,
  Users,
  Search,
  CheckCircle2,
  Image as ImageIcon,
  Flame,
  ArrowRight,
  ShieldAlert,
  Moon,
  Sparkles
} from 'lucide-react';
import {
  Player,
  KillRecord,
  PartyPhoto,
  RoleType,
  TeamType,
  GameState
} from '../../types/game';

interface GameEndViewProps {
  gameState: GameState;
  players: Player[];
  kills: KillRecord[];
  photos: PartyPhoto[];
}

export const GameEndView: React.FC<GameEndViewProps> = ({
  gameState,
  players,
  kills,
  photos,
}) => {
  const [activeTab, setActiveTab] = useState<'winner' | 'ranking' | 'roles' | 'kills'>('winner');
  const [roleSearch, setRoleSearch] = useState('');

  const activePlayers = players.filter((p) => p.status !== 'entfernt');

  // Winner calculation
  const good = activePlayers.filter((p) => p.team === 'Gut');
  const evil = activePlayers.filter((p) => p.team === 'Böse');
  const goodAlive = good.filter((p) => p.status === 'lebendig').length;
  const evilAlive = evil.filter((p) => p.status === 'lebendig').length;

  const winnerTeam: TeamType = (gameState as any).winner_team || (evilAlive === 0 ? 'Gut' : 'Böse');

  // Top individual rankings
  const overallRanking = [...activePlayers].sort((a, b) => (b.points || 0) - (a.points || 0));
  const deadRanking = activePlayers
    .filter((p) => p.status === 'tot')
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  // Role resolution list
  const filteredRoles = activePlayers.filter(
    (p) =>
      p.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
      p.costumeName.toLowerCase().includes(roleSearch.toLowerCase()) ||
      p.role.toLowerCase().includes(roleSearch.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-12">
      {/* HEADER BANNER */}
      <div className="text-center space-y-2 p-6 rounded-3xl bg-gradient-to-b from-purple-950/80 via-zinc-950 to-zinc-950 border-2 border-purple-500/50 shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg shadow-amber-400/40">
          <Trophy className="w-8 h-8" />
        </div>
        <span className="inline-block px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-black uppercase tracking-wider">
          Spiel beendet
        </span>
        <h2 className="text-3xl font-serif font-black text-white">
          Team {winnerTeam.toUpperCase()} gewinnt!
        </h2>
        <p className="text-xs text-zinc-300 max-w-xs mx-auto">
          {winnerTeam === 'Gut'
            ? 'Alle Mächte des Bösen wurden besiegt oder exorziert. Die Sterblichen haben überlebt!'
            : 'Die Kreaturen der Nacht haben die Herrschaft über die Party errungen!'}
        </p>

        <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto pt-2">
          <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-bold">Team GUT</span>
            <span className="text-sm font-mono font-bold text-emerald-400">
              {goodAlive} / {good.length} am Leben
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-bold">Team BÖSE</span>
            <span className="text-sm font-mono font-bold text-rose-400">
              {evilAlive} / {evil.length} am Leben
            </span>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex rounded-2xl bg-zinc-900 p-1 border border-zinc-800 text-xs font-bold">
        <button
          onClick={() => setActiveTab('winner')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer ${
            activeTab === 'winner' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Sieg & Stats
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer ${
            activeTab === 'ranking' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Endranking
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer ${
            activeTab === 'roles' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Rollenauflösung
        </button>
        <button
          onClick={() => setActiveTab('kills')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer ${
            activeTab === 'kills' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Kill-Log
        </button>
      </div>

      {/* TAB 1: WINNER & TOP THREE */}
      {activeTab === 'winner' && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="font-serif font-bold text-lg text-white">Party-Champions</h3>
            <p className="text-xs text-zinc-400">Die erfolgreichsten Spieler des Abends</p>
          </div>

          <div className="grid grid-cols-3 gap-2 items-end pt-4">
            {/* Platz 2 */}
            {overallRanking[1] && (
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-center flex flex-col items-center">
                <span className="text-xs font-bold text-zinc-400">🥈 2. Platz</span>
                <img
                  src={overallRanking[1].photoUrl || '/placeholder.png'}
                  alt={overallRanking[1].name}
                  className="w-12 h-12 rounded-full object-cover my-2 border-2 border-zinc-600"
                />
                <div className="text-xs font-bold truncate max-w-full text-white">{overallRanking[1].name}</div>
                <div className="text-[10px] text-[#ff6b00] font-mono font-bold mt-1">
                  {overallRanking[1].points} Pkt
                </div>
              </div>
            )}

            {/* Platz 1 */}
            {overallRanking[0] && (
              <div className="p-4 rounded-3xl bg-gradient-to-b from-amber-950/60 to-zinc-900 border-2 border-amber-400/80 text-center flex flex-col items-center -translate-y-2 shadow-xl shadow-amber-950/50">
                <span className="text-xs font-black text-amber-300">👑 1. Platz</span>
                <img
                  src={overallRanking[0].photoUrl || '/placeholder.png'}
                  alt={overallRanking[0].name}
                  className="w-16 h-16 rounded-full object-cover my-2 border-2 border-amber-400"
                />
                <div className="text-sm font-black truncate max-w-full text-white">{overallRanking[0].name}</div>
                <div className="text-xs text-zinc-300 truncate max-w-full">{overallRanking[0].costumeName}</div>
                <div className="text-xs text-amber-400 font-mono font-black mt-1">
                  {overallRanking[0].points} Pkt
                </div>
              </div>
            )}

            {/* Platz 3 */}
            {overallRanking[2] && (
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-center flex flex-col items-center">
                <span className="text-xs font-bold text-amber-600">🥉 3. Platz</span>
                <img
                  src={overallRanking[2].photoUrl || '/placeholder.png'}
                  alt={overallRanking[2].name}
                  className="w-12 h-12 rounded-full object-cover my-2 border-2 border-amber-700"
                />
                <div className="text-xs font-bold truncate max-w-full text-white">{overallRanking[2].name}</div>
                <div className="text-[10px] text-[#ff6b00] font-mono font-bold mt-1">
                  {overallRanking[2].points} Pkt
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ENDRANKING */}
      {activeTab === 'ranking' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-bold text-white text-sm">Gesamtranking (Einzelwertung)</h3>
            <p className="text-[11px] text-zinc-400">Alle Gäste sortiert nach Punkten</p>
          </div>

          <div className="space-y-1.5">
            {overallRanking.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono font-black text-sm w-6 text-center ${
                      idx === 0
                        ? 'text-amber-400'
                        : idx === 1
                        ? 'text-zinc-300'
                        : idx === 2
                        ? 'text-amber-600'
                        : 'text-zinc-600'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <img
                    src={p.photoUrl || '/placeholder.png'}
                    alt={p.name}
                    className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                  />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      {p.name}
                      {p.status === 'tot' && (
                        <span className="text-[10px] text-rose-400 font-normal">(tot)</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400">{p.costumeName}</div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-[#ff6b00]">{p.points} Pkt</span>
                  <span className="block text-[10px] text-zinc-500 font-medium">{p.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ROLES RESOLUTION */}
      {activeTab === 'roles' && (
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-white text-sm">Rollenauflösung</h3>
            <p className="text-[11px] text-zinc-400">Wer war wer? Das Geheimnis ist gelüftet!</p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Nach Name, Kostüm oder Rolle filtern..."
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-[#ff6b00]"
            />
          </div>

          <div className="space-y-1.5 max-h-[450px] overflow-y-auto">
            {filteredRoles.map((p) => {
              const isEvil = p.team === 'Böse';
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={p.photoUrl || '/placeholder.png'}
                      alt={p.name}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                    />
                    <div>
                      <div className="text-xs font-bold text-white leading-tight">{p.name}</div>
                      <div className="text-[10px] text-zinc-400">{p.costumeName}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                        p.role === 'Vampir'
                          ? 'bg-rose-950/60 text-rose-400 border border-rose-800'
                          : p.role === 'Werwolf'
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                          : p.role === 'Geist'
                          ? 'bg-purple-950/60 text-purple-400 border border-purple-800'
                          : p.role === 'Geisterjäger'
                          ? 'bg-blue-950/60 text-blue-400 border border-blue-800'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                      }`}
                    >
                      {p.role}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        p.status === 'lebendig' ? 'text-emerald-400' : 'text-zinc-500 line-through'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: KILL LOG */}
      {activeTab === 'kills' && (
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-white text-sm">Vollständiges Kill-Log</h3>
            <p className="text-[11px] text-zinc-400">Chronologie aller Angriffe und Exorzismen</p>
          </div>

          <div className="space-y-2 max-h-[450px] overflow-y-auto">
            {kills.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">Keine Kills verzeichnet</p>
            ) : (
              kills.map((k) => (
                <div
                  key={k.id}
                  className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {k.reason === 'exorcism' ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <Skull className="w-3.5 h-3.5 text-rose-500" />
                      )}
                      {k.killerName} {k.reason === 'exorcism' ? 'exorzierte' : 'tötete'} {k.victimName}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(k.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>
                      {k.reason === 'exorcism' ? (
                        k.exorcismHit ? (
                          <span className="text-emerald-400">Treffer! ({k.victimRole} eliminiert)</span>
                        ) : (
                          <span className="text-amber-400">Fehlschuss ({k.victimRole} überlebt)</span>
                        )
                      ) : (
                        <span>
                          {k.killerRole || 'Böser'} ({k.confirmed ? 'bestätigt' : 'ausstehend'})
                        </span>
                      )}
                    </span>
                    {k.autoConfirmed && (
                      <span className="text-[9px] text-zinc-500">(Auto-Bestätigt)</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
