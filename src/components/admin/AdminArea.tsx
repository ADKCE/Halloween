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
  Moon,
  Camera,
  Award,
  Sliders,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import {
  Player,
  GameStatus,
  RoleType,
  GameSettings,
  PlayerStatus,
  KillRecord,
  PartyPhoto
} from '../../types/game';
import { gameApi } from '../../utils/api';

interface AdminAreaProps {
  gameStatus: GameStatus;
  players: Player[];
  settings: GameSettings;
  adminCode: string;
  kills: KillRecord[];
  photos: PartyPhoto[];
  onStartGame: () => Promise<void>;
  onAbortGame: () => Promise<void>;
  onEndGame: () => Promise<void>;
  onRestartGame: (keepPlayers: boolean) => Promise<void>;
  onPlayerAction: (playerId: string, action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren') => Promise<void>;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => Promise<void>;
  onTriggerFullMoon: (durationMinutes?: number) => Promise<void>;
  onStopFullMoon: () => Promise<void>;
  onConfirmKill: (killId: string) => Promise<void>;
  onUndoKill: (killId: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
}

export const AdminArea: React.FC<AdminAreaProps> = ({
  gameStatus,
  players,
  settings,
  adminCode,
  kills,
  photos,
  onStartGame,
  onAbortGame,
  onEndGame,
  onRestartGame,
  onPlayerAction,
  onUpdateSettings,
  onTriggerFullMoon,
  onStopFullMoon,
  onConfirmKill,
  onUndoKill,
  onDeletePhoto,
}) => {
  // Sub-tabs in Admin: 'control' | 'players' | 'kills' | 'gallery' | 'settings' | 'qrcode'
  const [activeTab, setActiveTab] = useState<'control' | 'players' | 'kills' | 'gallery' | 'settings' | 'qrcode'>('control');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('alle');
  const [statusFilter, setStatusFilter] = useState<string>('alle');

  // Restart modal states
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);

  // Settings form states
  const [formData, setFormData] = useState({
    adminCode: settings.adminCode || '1031',
    vampireCount: settings.vampireCount || 6,
    werewolfCount: settings.werewolfCount || 4,
    ghostCount: settings.ghostCount || 4,
    hunterCount: settings.hunterCount || 10,
    gracePeriodMinutes: settings.gracePeriodMinutes || 15,
    vampireCooldownMinutes: settings.vampireCooldownMinutes || 6,
    ghostCooldownMinutes: settings.ghostCooldownMinutes || 6,
    werewolfCooldownMinutes: settings.werewolfCooldownMinutes || 2,
    hunterHitCooldownMinutes: settings.hunterHitCooldownMinutes || 15,
    hunterMissPenaltyMinutes: settings.hunterMissPenaltyMinutes || 30,
    killConfirmationTimeoutMinutes: settings.killConfirmationTimeoutMinutes || 5,
    pointsPhotoTask: settings.pointsPhotoTask || 10,
    pointsSpecialTask: settings.pointsSpecialTask || 20,
    pointsTaggedCoPlayer: settings.pointsTaggedCoPlayer || 2,
    pointsEvilKill: settings.pointsEvilKill || 15,
    pointsExorcismSuccess: settings.pointsExorcismSuccess || 25,
  });

  const [settingsNotice, setSettingsNotice] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [previewPlayer, setPreviewPlayer] = useState<Player | null>(null);

  // Diashow State for Beamer
  const [isDiashowRunning, setIsDiashowRunning] = useState(false);
  const [diashowIndex, setDiashowIndex] = useState(0);

  // Sync settings when props change
  useEffect(() => {
    setFormData({
      adminCode: settings.adminCode || '1031',
      vampireCount: settings.vampireCount || 6,
      werewolfCount: settings.werewolfCount || 4,
      ghostCount: settings.ghostCount || 4,
      hunterCount: settings.hunterCount || 10,
      gracePeriodMinutes: settings.gracePeriodMinutes || 15,
      vampireCooldownMinutes: settings.vampireCooldownMinutes || 6,
      ghostCooldownMinutes: settings.ghostCooldownMinutes || 6,
      werewolfCooldownMinutes: settings.werewolfCooldownMinutes || 2,
      hunterHitCooldownMinutes: settings.hunterHitCooldownMinutes || 15,
      hunterMissPenaltyMinutes: settings.hunterMissPenaltyMinutes || 30,
      killConfirmationTimeoutMinutes: settings.killConfirmationTimeoutMinutes || 5,
      pointsPhotoTask: settings.pointsPhotoTask || 10,
      pointsSpecialTask: settings.pointsSpecialTask || 20,
      pointsTaggedCoPlayer: settings.pointsTaggedCoPlayer || 2,
      pointsEvilKill: settings.pointsEvilKill || 15,
      pointsExorcismSuccess: settings.pointsExorcismSuccess || 25,
    });
  }, [settings]);

  // Diashow rotation
  useEffect(() => {
    if (!isDiashowRunning || photos.length === 0) return;
    const interval = setInterval(() => {
      setDiashowIndex((prev) => (prev + 1) % photos.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isDiashowRunning, photos.length]);

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

  // Compute stats
  const stats = useMemo(() => {
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

  // Unconfirmed Kills
  const unconfirmedKills = useMemo(() => {
    return kills.filter((k) => !k.confirmed);
  }, [kills]);

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
    await onUpdateSettings(formData);
    setSettingsNotice('Einstellungen erfolgreich in Supabase gespeichert!');
    setTimeout(() => setSettingsNotice(''), 3000);
  };

  return (
    <div className="space-y-4 max-w-md mx-auto pb-16">
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
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              gameStatus === 'Läuft'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-[#ff6b00]/15 text-[#ff6b00] border border-[#ff6b00]/40'
            }`}
          >
            {gameStatus}
          </span>
        </div>

        {/* Sub-Navigation */}
        <div className="grid grid-cols-6 gap-1 p-1 bg-zinc-950 rounded-2xl border border-zinc-800 text-[10px] font-bold text-center">
          <button
            onClick={() => setActiveTab('control')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'control' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Steuerung
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'players' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Gäste
          </button>
          <button
            onClick={() => setActiveTab('kills')}
            className={`py-2 rounded-xl transition cursor-pointer relative ${
              activeTab === 'kills' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Kills
            {unconfirmedKills.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'gallery' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Galerie
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'settings' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Optionen
          </button>
          <button
            onClick={() => setActiveTab('qrcode')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'qrcode' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            QR
          </button>
        </div>
      </div>

      {/* KPI STATS CARD */}
      <div className="p-4 rounded-3xl bg-zinc-950/80 border border-zinc-800 shadow-xl space-y-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
          Live-Status
        </span>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <span className="text-[10px] font-semibold text-zinc-400 block uppercase">Lebend</span>
            <span className="font-mono font-black text-xl text-emerald-400">{stats.totalLiving}</span>
          </div>
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <span className="text-[10px] font-semibold text-zinc-400 block uppercase">Tot</span>
            <span className="font-mono font-black text-xl text-rose-400">{stats.totalDead}</span>
          </div>
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <span className="text-[10px] font-semibold text-zinc-400 block uppercase">Gesamt</span>
            <span className="font-mono font-black text-xl text-[#ff6b00]">{stats.totalActive}</span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 pt-1 text-center">
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-zinc-400 block">Mensch</span>
            <span className="font-bold text-xs text-white">{stats.livingHumans}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-blue-400 block">Jäger</span>
            <span className="font-bold text-xs text-blue-300">{stats.livingHunters}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-rose-400 block">Vampir</span>
            <span className="font-bold text-xs text-rose-300">{stats.livingVampires}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-amber-400 block">Wolf</span>
            <span className="font-bold text-xs text-amber-300">{stats.livingWerewolves}</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span className="text-[9px] text-purple-400 block">Geist</span>
            <span className="font-bold text-xs text-purple-300">{stats.livingGhosts}</span>
          </div>
        </div>
      </div>

      {/* UNCONFIRMED KILLS WARNING BANNER */}
      {unconfirmedKills.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500 text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>{unconfirmedKills.length} offene(r) Kill(s)!</strong> Warten auf Bestätigung durch Opfer.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('kills')}
            className="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-bold text-[10px] shrink-0 cursor-pointer"
          >
            Prüfen
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: RUNDENSTEUERUNG                                   */}
      {/* ======================================================== */}
      {activeTab === 'control' && (
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h3 className="font-serif font-bold text-base text-white">Spielsteuerung</h3>

            <div className="space-y-2.5 pt-1">
              <button
                onClick={onStartGame}
                disabled={gameStatus === 'Läuft' || players.length === 0}
                className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition active:scale-95 cursor-pointer ${
                  gameStatus === 'Läuft' || players.length === 0
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                Spiel starten (Rollen zuteilen)
              </button>

              <button
                onClick={onEndGame}
                disabled={gameStatus !== 'Läuft'}
                className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                  gameStatus !== 'Läuft'
                    ? 'bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black shadow-lg shadow-amber-950'
                }`}
              >
                <Award className="w-4 h-4" />
                Spiel regulär beenden (Auswertung)
              </button>

              <button
                onClick={onAbortGame}
                disabled={gameStatus !== 'Läuft'}
                className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                  gameStatus !== 'Läuft'
                    ? 'bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed'
                    : 'bg-rose-700 hover:bg-rose-600 text-white'
                }`}
              >
                <Square className="w-4 h-4 fill-current" />
                Spiel abbrechen (Zurück zur Lobby)
              </button>

              <button
                onClick={() => setIsRestartModalOpen(true)}
                className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Neustart...
              </button>
            </div>
          </div>

          {/* VOLLMOND MANUELL AUSLÖSEN */}
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-400/20 text-amber-400">
                <Moon className="w-5 h-5 fill-current" />
              </span>
              <div>
                <h4 className="font-bold text-white text-sm">Vollmond-Steuerung</h4>
                <p className="text-[11px] text-zinc-400">Manueller Vollmond für Werwölfe (5 Minuten)</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onTriggerFullMoon(5)}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-950 cursor-pointer transition active:scale-95"
              >
                Vollmond jetzt starten!
              </button>
              <button
                onClick={onStopFullMoon}
                className="px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
              >
                Beenden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: GÄSTE & SPIELERVERWALTUNG                         */}
      {/* ======================================================== */}
      {activeTab === 'players' && (
        <div className="space-y-3">
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Name oder Kostüm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-[#ff6b00]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
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

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredPlayers.map((p) => (
              <div
                key={p.id}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={p.photoUrl || '/placeholder.png'}
                    alt={p.name}
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-700 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-white">{p.name}</span>
                      <span className="text-[10px] text-zinc-400">({p.role})</span>
                    </div>
                    <div className="text-[11px] text-[#ff6b00]">{p.costumeName}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {p.points} Pkt • Status: {p.status}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  {p.status !== 'lebendig' ? (
                    <button
                      onClick={() => onPlayerAction(p.id, 'wiederbeleben')}
                      className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      Wiederbeleben
                    </button>
                  ) : (
                    <button
                      onClick={() => onPlayerAction(p.id, 'toeten')}
                      className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-500/30 rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      Töten
                    </button>
                  )}
                  <button
                    onClick={() => onPlayerAction(p.id, 'entfernen')}
                    className="px-2 py-0.5 text-zinc-500 hover:text-rose-400 text-[9px] cursor-pointer"
                  >
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: KILL-LOG & UNBESTÄTIGTE KILLS                     */}
      {/* ======================================================== */}
      {activeTab === 'kills' && (
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-white text-sm">Kill-Log & Bestätigungen</h3>
            <p className="text-[11px] text-zinc-400">
              Admin kann Kills manuell bestätigen oder rückgängig machen
            </p>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {kills.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">Keine Kills verzeichnet</p>
            ) : (
              kills.map((k) => (
                <div
                  key={k.id}
                  className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                    !k.confirmed
                      ? 'bg-rose-950/40 border-rose-500'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      {k.killerName} &rarr; {k.victimName}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(k.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>
                      Art: {k.reason === 'exorcism' ? 'Exorzismus' : 'Kill'} •{' '}
                      {k.confirmed ? (
                        <span className="text-emerald-400">Bestätigt</span>
                      ) : (
                        <span className="text-amber-400 font-bold">Wartet auf Bestätigung!</span>
                      )}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-1 border-t border-zinc-800">
                    {!k.confirmed && (
                      <button
                        onClick={() => onConfirmKill(k.id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer"
                      >
                        Manuell bestätigen
                      </button>
                    )}
                    <button
                      onClick={() => onUndoKill(k.id)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-300 hover:text-rose-400 border border-zinc-700 text-[10px] cursor-pointer"
                    >
                      Rückgängig machen
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: GALERIE & BEAMER-DIASHOW                          */}
      {/* ======================================================== */}
      {activeTab === 'gallery' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-sm">Party-Galerie ({photos.length})</h3>
              <p className="text-[11px] text-zinc-400">Fotos löschen oder Beamer-Diashow starten</p>
            </div>
            <button
              onClick={() => setIsDiashowRunning(!isDiashowRunning)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer ${
                isDiashowRunning
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              {isDiashowRunning ? 'Diashow stoppen' : 'Diashow starten'}
            </button>
          </div>

          {/* Diashow Fullscreen Preview */}
          {isDiashowRunning && photos.length > 0 && (
            <div className="p-4 rounded-3xl bg-black border-2 border-purple-500 space-y-2 text-center">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                Beamer-Diashow aktiv (Foto {diashowIndex + 1} / {photos.length})
              </span>
              <div className="aspect-video rounded-2xl overflow-hidden bg-zinc-950 flex items-center justify-center">
                <img
                  src={photos[diashowIndex]?.photoUrl}
                  alt="Diashow"
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-xs text-white font-medium">
                {photos[diashowIndex]?.caption || `Foto von ${photos[diashowIndex]?.photographerName}`}
              </p>
            </div>
          )}

          {/* Grid of photos with delete buttons */}
          <div className="grid grid-cols-2 gap-2 max-h-[480px] overflow-y-auto">
            {photos.map((ph) => (
              <div
                key={ph.id}
                className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 group aspect-square"
              >
                <img src={ph.photoUrl} alt="Party" className="w-full h-full object-cover" />
                <button
                  onClick={() => onDeletePhoto(ph.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-rose-400 hover:bg-rose-600 hover:text-white transition cursor-pointer"
                  title="Foto löschen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-2 text-[10px] text-zinc-300">
                  <span className="font-bold block truncate">{ph.photographerName}</span>
                  <span className="text-[9px] text-zinc-400 truncate block">{ph.caption}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: OPTIONEN & COOLDOWNS                              */}
      {/* ======================================================== */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
          <h3 className="font-serif font-bold text-base text-white">Spieleinstellungen</h3>

          {settingsNotice && (
            <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4" />
              {settingsNotice}
            </div>
          )}

          {/* Admin Code */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1">Admin-PIN-Code:</label>
            <input
              type="text"
              required
              value={formData.adminCode}
              onChange={(e) => setFormData({ ...formData, adminCode: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-mono text-sm"
            />
          </div>

          {/* Cooldowns & Zeiten */}
          <div className="pt-2 border-t border-zinc-800 space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              Zeiten & Cooldowns (Minuten)
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Schonfrist (Min):</label>
                <input
                  type="number"
                  min="0"
                  value={formData.gracePeriodMinutes}
                  onChange={(e) => setFormData({ ...formData, gracePeriodMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Vampir Cooldown (Min):</label>
                <input
                  type="number"
                  min="1"
                  value={formData.vampireCooldownMinutes}
                  onChange={(e) => setFormData({ ...formData, vampireCooldownMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Geist Cooldown (Min):</label>
                <input
                  type="number"
                  min="1"
                  value={formData.ghostCooldownMinutes}
                  onChange={(e) => setFormData({ ...formData, ghostCooldownMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Werwolf Vollmond-CD:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.werewolfCooldownMinutes}
                  onChange={(e) => setFormData({ ...formData, werewolfCooldownMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Jäger Treffer-CD:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.hunterHitCooldownMinutes}
                  onChange={(e) => setFormData({ ...formData, hunterHitCooldownMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Jäger Fehlschuss-Sperre:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.hunterMissPenaltyMinutes}
                  onChange={(e) => setFormData({ ...formData, hunterMissPenaltyMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>
            </div>
          </div>

          {/* Punktewerte */}
          <div className="pt-2 border-t border-zinc-800 space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              Punktewerte
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Foto-Aufgabe:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.pointsPhotoTask}
                  onChange={(e) => setFormData({ ...formData, pointsPhotoTask: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Spezialaufgabe:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.pointsSpecialTask}
                  onChange={(e) => setFormData({ ...formData, pointsSpecialTask: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Mitspieler-Bonus:</label>
                <input
                  type="number"
                  min="0"
                  value={formData.pointsTaggedCoPlayer}
                  onChange={(e) => setFormData({ ...formData, pointsTaggedCoPlayer: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Böser Kill:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.pointsEvilKill}
                  onChange={(e) => setFormData({ ...formData, pointsEvilKill: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Exorzismus Treffer:</label>
                <input
                  type="number"
                  min="1"
                  value={formData.pointsExorcismSuccess}
                  onChange={(e) => setFormData({ ...formData, pointsExorcismSuccess: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#ff6b00] hover:bg-[#e05e00] text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer"
          >
            Alle Einstellungen in Supabase speichern
          </button>
        </form>
      )}

      {/* ======================================================== */}
      {/* TAB 6: BEAMER QR-CODE                                    */}
      {/* ======================================================== */}
      {activeTab === 'qrcode' && (
        <div className="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-4 shadow-xl">
          <div>
            <h3 className="font-serif font-black text-lg text-white">Party-Beamer QR-Code</h3>
            <p className="text-xs text-zinc-400">
              Projiziere diesen Code an die Wand, damit Gäste direkt beitreten können:
            </p>
          </div>

          <div className="p-4 bg-white rounded-3xl inline-block shadow-2xl">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Beamer QR Code" className="w-64 h-64 mx-auto" />
            ) : (
              <div className="w-64 h-64 bg-zinc-200 animate-pulse rounded-2xl" />
            )}
          </div>

          <p className="text-xs text-zinc-400 font-mono">
            {typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}
          </p>
        </div>
      )}

      {/* RESTART MODAL */}
      {isRestartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl space-y-4">
            <h3 className="font-serif font-bold text-white text-base">Spiel neustarten</h3>
            <p className="text-xs text-zinc-400">
              Wähle, ob die registrierten Spieler erhalten bleiben oder die Datenbank geleert werden soll:
            </p>

            <div className="space-y-2">
              <button
                onClick={() => {
                  onRestartGame(true);
                  setIsRestartModalOpen(false);
                }}
                className="w-full py-3 rounded-xl bg-[#ff6b00] text-zinc-950 font-black text-xs cursor-pointer"
              >
                Gäste behalten (Nur Rollen & Kills resetten)
              </button>
              <button
                onClick={() => {
                  onRestartGame(false);
                  setIsRestartModalOpen(false);
                }}
                className="w-full py-3 rounded-xl bg-rose-600 text-white font-black text-xs cursor-pointer"
              >
                Komplett leeren (Alle Spieler & Fotos löschen)
              </button>
              <button
                onClick={() => setIsRestartModalOpen(false)}
                className="w-full py-2 text-zinc-400 text-xs cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
