import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Shield,
  Play,
  Square,
  RotateCcw,
  Users,
  Search,
  Filter,
  Trash2,
  HeartPulse,
  QrCode,
  Lock,
  Unlock,
  Key,
  AlertTriangle,
  X,
  Settings as SettingsIcon,
  Check,
  Eye,
  Skull,
  Ghost,
} from 'lucide-react';
import { Player, GameStatus, RoleType, GameSettings, PlayerStatus } from '../../types/game';
import { gameApi } from '../../utils/api';

interface AdminAreaProps {
  gameStatus: GameStatus;
  players: Player[];
  settings: GameSettings;
  adminCode: string;
  onStartGame: () => Promise<void>;
  onAbortGame: () => Promise<void>;
  onRestartGame: (keepPlayers: boolean) => Promise<void>;
  onPlayerAction: (playerId: string, action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren') => Promise<void>;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => Promise<void>;
}

export const AdminArea: React.FC<AdminAreaProps> = ({
  gameStatus,
  players,
  settings,
  adminCode,
  onStartGame,
  onAbortGame,
  onRestartGame,
  onPlayerAction,
  onUpdateSettings,
}) => {
  // Sub-tabs in Admin
  const [activeTab, setActiveTab] = useState<'control' | 'players' | 'qrcode' | 'settings'>('control');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('alle');
  const [statusFilter, setStatusFilter] = useState<string>('alle');

  // Restart modal states
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
  const [restartMode, setRestartMode] = useState<'keep' | 'wipe' | null>(null);

  // Settings form
  const [newAdminCode, setNewAdminCode] = useState(settings.adminCode);
  const [vampireCount, setVampireCount] = useState(settings.vampireCount);
  const [werewolfCount, setWerewolfCount] = useState(settings.werewolfCount);
  const [ghostCount, setGhostCount] = useState(settings.ghostCount);
  const [hunterCount, setHunterCount] = useState(settings.hunterCount);
  const [supabaseStatus] = useState(() => gameApi.getStatus());
  const [settingsNotice, setSettingsNotice] = useState('');

  // QR Code data URL
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Player preview modal
  const [previewPlayer, setPreviewPlayer] = useState<Player | null>(null);

  // Generate QR code for Beamer projection
  useEffect(() => {
    const appUrl = window.location.origin + window.location.pathname;
    QRCode.toDataURL(appUrl, {
      width: 450,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, []);

  // Compute KPIs
  const stats = useMemo(() => {
    // Only non-removed players count in live overview
    const activeList = players.filter((p) => p.status !== 'entfernt');
    const living = activeList.filter((p) => p.status === 'lebendig');
    const dead = activeList.filter((p) => p.status === 'tot');

    const livingHumans = living.filter((p) => p.role === 'Mensch').length;
    const livingHunters = living.filter((p) => p.role === 'Geisterjäger').length;
    const livingVampires = living.filter((p) => p.role === 'Vampir').length;
    const livingWerewolves = living.filter((p) => p.role === 'Werwolf').length;
    const livingGhosts = living.filter((p) => p.role === 'Geist').length;

    return {
      totalLiving: living.length,
      totalDead: dead.length,
      totalActive: activeList.length,
      livingHumans,
      livingHunters,
      livingVampires,
      livingWerewolves,
      livingGhosts,
    };
  }, [players]);

  // Filtered players
  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const matchSearch =
        !searchTerm.trim() ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.costumeName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchRole = roleFilter === 'alle' || p.role === roleFilter;
      const matchStatus = statusFilter === 'alle' || p.status === statusFilter;

      return matchSearch && matchRole && matchStatus;
    });
  }, [players, searchTerm, roleFilter, statusFilter]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings({
      adminCode: newAdminCode.trim() || '1031',
      vampireCount: Number(vampireCount),
      werewolfCount: Number(werewolfCount),
      ghostCount: Number(ghostCount),
      hunterCount: Number(hunterCount),
    });
    setSettingsNotice('Einstellungen in Supabase gespeichert!');
    setTimeout(() => setSettingsNotice(''), 3000);
  };

  const getStatusBadge = () => {
    switch (gameStatus) {
      case 'Lobby':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff6b00]/15 border border-[#ff6b00]/40 text-[#ff6b00] text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#ff6b00] animate-pulse" />
            Lobby
          </span>
        );
      case 'Läuft':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase tracking-wider shadow-sm shadow-rose-950">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            Läuft
          </span>
        );
      case 'Beendet':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold uppercase tracking-wider">
            Beendet
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 max-w-md mx-auto pb-12">
      {/* Top Header Card */}
      <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-black text-lg text-white">Admin-Zentrale</h2>
              <p className="text-[10px] text-zinc-400">PIN geschützt ({adminCode})</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Sub-Navigation Buttons */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-950 rounded-2xl border border-zinc-800 text-[11px] font-bold">
          <button
            onClick={() => setActiveTab('control')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'control' ? 'bg-[#ff6b00] text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Steuerung
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'players' ? 'bg-[#ff6b00] text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Spieler ({players.length})
          </button>
          <button
            onClick={() => setActiveTab('qrcode')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'qrcode' ? 'bg-[#ff6b00] text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Beamer-QR
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'settings' ? 'bg-[#ff6b00] text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Optionen
          </button>
        </div>
      </div>

      {/* KPI STATS CARD (Anzahl lebender Spieler gesamt, Menschen, Geisterjäger, Vampire, Werwölfe, Geister, Tote) */}
      <div className="p-4 rounded-3xl bg-zinc-950/80 border border-zinc-800 shadow-xl space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
          Live-Übersicht Spieler
        </span>

        <div className="grid grid-cols-3 gap-2">
          {/* Lebend Gesamt */}
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <span className="text-[10px] font-semibold text-zinc-400 block uppercase">Lebend</span>
            <span className="font-mono font-black text-xl text-emerald-400 tabular-nums">
              {stats.totalLiving}
            </span>
          </div>

          {/* Tote Gesamt */}
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <span className="text-[10px] font-semibold text-zinc-400 block uppercase">Tot</span>
            <span className="font-mono font-black text-xl text-red-400 tabular-nums">
              {stats.totalDead}
            </span>
          </div>

          {/* Aktiv Gesamt */}
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <span className="text-[10px] font-semibold text-zinc-400 block uppercase">Lobby</span>
            <span className="font-mono font-black text-xl text-[#ff6b00] tabular-nums">
              {stats.totalActive}
            </span>
          </div>
        </div>

        {/* Detailed breakdown */}
        <div className="grid grid-cols-5 gap-1 pt-1 text-center">
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-zinc-400 block">Menschen</span>
            <span className="font-bold text-xs text-white">{stats.livingHumans}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-cyan-400 block">Jäger</span>
            <span className="font-bold text-xs text-cyan-300">{stats.livingHunters}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-rose-400 block">Vampire</span>
            <span className="font-bold text-xs text-rose-300">{stats.livingVampires}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-yellow-400 block">Werwölfe</span>
            <span className="font-bold text-xs text-yellow-300">{stats.livingWerewolves}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-purple-400 block">Geister</span>
            <span className="font-bold text-xs text-purple-300">{stats.livingGhosts}</span>
          </div>
        </div>
      </div>

      {/* TAB 1: SPIELSTEUERUNG */}
      {activeTab === 'control' && (
        <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-3">
          <h3 className="font-serif font-bold text-base text-white">Rundensteuerung</h3>
          <p className="text-xs text-zinc-400">
            Starte die Jagd, brich das Spiel ab oder führe einen Neustart durch.
          </p>

          <div className="space-y-2.5 pt-2">
            {/* Start Button */}
            <button
              onClick={onStartGame}
              disabled={gameStatus === 'Läuft' || players.length === 0}
              className={`w-full py-4 px-5 rounded-2xl font-serif font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-98 cursor-pointer ${
                gameStatus === 'Läuft' || players.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60'
              }`}
            >
              <Play className="w-5 h-5 fill-current" />
              Spiel starten
            </button>

            {/* Abbrechen Button */}
            <button
              onClick={onAbortGame}
              disabled={gameStatus !== 'Läuft'}
              className={`w-full py-3.5 px-5 rounded-2xl font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-98 cursor-pointer ${
                gameStatus !== 'Läuft'
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                  : 'bg-rose-700 hover:bg-rose-600 text-white shadow-rose-950/60'
              }`}
            >
              <Square className="w-4 h-4 fill-current" />
              Spiel abbrechen
            </button>

            {/* Neustart Button */}
            <button
              onClick={() => setIsRestartModalOpen(true)}
              className="w-full py-3.5 px-5 rounded-2xl font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Neustart...
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SPIELERVERWALTUNG */}
      {activeTab === 'players' && (
        <div className="space-y-3">
          {/* Search & Filter Bar */}
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2 shadow-lg">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Name oder Kostüm suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff6b00]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter nach Rolle"
                className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
              >
                <option value="alle">Alle Rollen</option>
                <option value="Mensch">Mensch</option>
                <option value="Geisterjäger">Geisterjäger</option>
                <option value="Vampir">Vampir</option>
                <option value="Werwolf">Werwolf</option>
                <option value="Geist">Geist</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter nach Status"
                className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200"
              >
                <option value="alle">Alle Status</option>
                <option value="lebendig">Lebendig</option>
                <option value="tot">Tot</option>
                <option value="entfernt">Entfernt</option>
                <option value="pausiert">Pausiert</option>
              </select>
            </div>
          </div>

          {/* Player Cards List */}
          <div className="space-y-2">
            {filteredPlayers.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900/60 rounded-2xl border border-zinc-800">
                Keine Spieler gefunden.
              </div>
            ) : (
              filteredPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-between gap-3 shadow-sm ${
                    player.status === 'tot'
                      ? 'bg-red-950/15 border-red-500/20'
                      : player.status === 'entfernt'
                      ? 'opacity-50 line-through'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewPlayer(player)}
                      className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-zinc-700 bg-black cursor-pointer"
                    >
                      <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white">{player.name}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            player.team === 'Böse'
                              ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                          }`}
                        >
                          {player.team}
                        </span>
                      </div>
                      <span className="text-xs text-[#ff6b00] block">{player.costumeName}</span>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                        <span className="font-semibold text-zinc-200">Rolle: {player.role}</span>
                        <span>·</span>
                        <span>{player.status}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions per player */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {player.status !== 'lebendig' ? (
                      <button
                        onClick={() => onPlayerAction(player.id, 'wiederbeleben')}
                        className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-lg text-[10px] font-bold cursor-pointer"
                        title="Status zurück auf lebendig"
                      >
                        Wiederbeleben
                      </button>
                    ) : (
                      <button
                        onClick={() => onPlayerAction(player.id, 'toeten')}
                        className="px-2 py-1 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                        title="Als tot markieren"
                      >
                        Töten
                      </button>
                    )}

                    {player.status !== 'entfernt' && (
                      <button
                        onClick={() => onPlayerAction(player.id, 'entfernen')}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 rounded-lg text-[10px] cursor-pointer"
                        title="Spieler komplett entfernen"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BEAMER QR-CODE */}
      {activeTab === 'qrcode' && (
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-4 shadow-xl">
          <div>
            <h3 className="font-serif font-black text-lg text-white">Beamer-QR-Code</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Auf den Beamer projizieren, damit alle Gäste mit der Kamera beitreten können.
            </p>
          </div>

          <div className="p-4 bg-white rounded-2xl inline-block mx-auto shadow-2xl">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Party QR Code" className="w-64 h-64 mx-auto" />
            ) : (
              <div className="w-64 h-64 bg-zinc-200 animate-pulse" />
            )}
          </div>

          <div className="text-xs font-mono text-zinc-400 bg-zinc-950 p-3 rounded-xl border border-zinc-800 break-all">
            {window.location.origin}
          </div>
        </div>
      )}

      {/* TAB 4: OPTIONEN & EINSTELLUNGEN */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-xl space-y-4">
          <h3 className="font-serif font-bold text-base text-white">Rollen- & Sicherheitseinstellungen</h3>

          {settingsNotice && (
            <div className="p-3 bg-emerald-950 border border-emerald-500 text-emerald-300 rounded-xl text-xs font-bold">
              {settingsNotice}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Admin-Code (PIN):
            </label>
            <input
              type="text"
              required
              value={newAdminCode}
              onChange={(e) => setNewAdminCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-mono text-sm"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              Rollenverteilung bei 100 Spielern
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Vampire:</label>
                <input
                  type="number"
                  min="1"
                  value={vampireCount}
                  onChange={(e) => setVampireCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Werwölfe:</label>
                <input
                  type="number"
                  min="1"
                  value={werewolfCount}
                  onChange={(e) => setWerewolfCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Geister:</label>
                <input
                  type="number"
                  min="1"
                  value={ghostCount}
                  onChange={(e) => setGhostCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Geisterjäger:</label>
                <input
                  type="number"
                  min="1"
                  value={hunterCount}
                  onChange={(e) => setHunterCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>
            </div>

            <p className="text-[11px] text-zinc-500">
              Der Rest der Gäste wird automatisch Menschen. Bei abweichender Spielerzahl berechnet das System die Zuteilung proportional.
            </p>

            <div className="pt-2 border-t border-zinc-800 space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-400">
                Datenbank-Backend:
              </label>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Status:</span>
                  <span className="text-emerald-400 font-bold">
                    {supabaseStatus.isConfigured ? 'Supabase verbunden' : 'Konfiguration erforderlich'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">URL:</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[200px]" title={supabaseStatus.supabaseUrl}>
                    {supabaseStatus.supabaseUrl || 'VITE_SUPABASE_URL'}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 pt-1">
                  Alle Spieler werden zentral über Supabase (Postgres & Realtime) synchronisiert. Für Details rufe die App mit <code className="text-[#ff6b00]">?debug=1</code> auf.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#ff6b00] hover:bg-[#e05e00] text-white font-bold text-xs uppercase tracking-wider shadow-lg cursor-pointer"
          >
            Änderungen speichern
          </button>
        </form>
      )}

      {/* RESTART MODAL MIT ZWEI SICHERHEITSOPTIONEN */}
      {isRestartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm bg-zinc-900 border-2 border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#ff6b00]" />
                Spiel neustarten
              </h3>
              <button onClick={() => { setIsRestartModalOpen(false); setRestartMode(null); }}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {!restartMode ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">
                  Wähle die gewünschte Reset-Option:
                </p>

                <button
                  type="button"
                  onClick={() => setRestartMode('keep')}
                  className="w-full p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-[#ff6b00] text-left cursor-pointer transition"
                >
                  <span className="font-bold text-xs text-white block">
                    1. Spiel zurücksetzen (Spieler behalten)
                  </span>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">
                    Rollen werden geleert, Status geht auf Lobby. Alle Kostüme & Fotos bleiben erhalten.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRestartMode('wipe')}
                  className="w-full p-3.5 rounded-2xl bg-zinc-950 border border-rose-950 hover:border-rose-500 text-left cursor-pointer transition"
                >
                  <span className="font-bold text-xs text-rose-400 block">
                    2. Alles löschen inklusive Spieler
                  </span>
                  <span className="text-[11px] text-zinc-400 block mt-0.5">
                    Löscht alle Profile, Kostüme und Spielstände komplett aus der Datenbank.
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Sicherheitsabfrage:</strong> Bist du absolut sicher?
                    {restartMode === 'keep' ? (
                      <p className="mt-1">
                        Das Spiel wird abgebrochen und in die Lobby versetzt. Rollen werden neu zugewiesen beim nächsten Start.
                      </p>
                    ) : (
                      <p className="mt-1">
                        Alle {players.length} Spieler werden unwiderruflich gelöscht!
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRestartMode(null)}
                    className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-300"
                  >
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onRestartGame(restartMode === 'keep');
                      setIsRestartModalOpen(false);
                      setRestartMode(null);
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg ${
                      restartMode === 'keep' ? 'bg-[#ff6b00]' : 'bg-rose-700'
                    }`}
                  >
                    Ja, Ausführen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PLAYER PHOTO PREVIEW MODAL */}
      {previewPlayer && (
        <div
          onClick={() => setPreviewPlayer(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-xs w-full bg-zinc-900 border border-zinc-700 rounded-3xl overflow-hidden shadow-2xl relative"
          >
            <button
              onClick={() => setPreviewPlayer(null)}
              className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full bg-black/70 text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="aspect-4/5 w-full bg-black">
              <img src={previewPlayer.photoUrl} alt={previewPlayer.name} className="w-full h-full object-cover" />
            </div>
            <div className="p-4 bg-zinc-950">
              <span className="text-xs text-[#ff6b00] font-bold block">{previewPlayer.costumeName}</span>
              <h4 className="font-serif font-black text-lg text-white">{previewPlayer.name}</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Rolle: <strong className="text-zinc-200">{previewPlayer.role}</strong> ({previewPlayer.team})
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
