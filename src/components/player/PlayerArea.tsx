import React, { useState, useMemo } from 'react';
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
  UserCheck,
  Trophy,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Plus,
  Flame,
  Search,
  Filter,
  Loader2,
  Award
} from 'lucide-react';
import {
  Player,
  GameStatus,
  RoleType,
  KillRecord,
  PartyTask,
  TaskCompletion,
  PartyPhoto
} from '../../types/game';
import { compressImageToMax1200px } from '../../utils/imageCompressor';

interface PlayerAreaProps {
  player: Player;
  players: Player[];
  gameStatus: GameStatus;
  totalJoinedCount: number;
  kills: KillRecord[];
  tasks: PartyTask[];
  taskCompletions: TaskCompletion[];
  photos: PartyPhoto[];
  onLogoutDevice: () => void;
  onRecordKill: (victimId: string) => Promise<void>;
  onCompleteTask: (taskId: string, photoBlobOrUrl?: Blob | File | string) => Promise<void>;
  onUploadPhoto: (file: File, caption: string) => Promise<void>;
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  players,
  gameStatus,
  totalJoinedCount,
  kills,
  tasks,
  taskCompletions,
  photos,
  onLogoutDevice,
  onRecordKill,
  onCompleteTask,
  onUploadPhoto,
}) => {
  // Sub-tabs: 'my-game' | 'players' | 'ranking' | 'tasks' | 'gallery'
  const [subTab, setSubTab] = useState<'my-game' | 'players' | 'ranking' | 'tasks' | 'gallery'>('my-game');
  const [roleRevealed, setRoleRevealed] = useState(false);

  // Kill Modal State
  const [isKillModalOpen, setIsKillModalOpen] = useState(false);
  const [selectedVictimId, setSelectedVictimId] = useState('');
  const [isSubmittingKill, setIsSubmittingKill] = useState(false);
  const [killError, setKillError] = useState('');
  const [killSuccess, setKillSuccess] = useState('');

  // Task Completion Modal State
  const [selectedTaskForUpload, setSelectedTaskForUpload] = useState<PartyTask | null>(null);
  const [taskPhotoFile, setTaskPhotoFile] = useState<File | null>(null);
  const [taskPhotoPreview, setTaskPhotoPreview] = useState<string>('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Gallery Upload Modal State
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [galleryPhotoFile, setGalleryPhotoFile] = useState<File | null>(null);
  const [galleryPhotoPreview, setGalleryPhotoPreview] = useState<string>('');
  const [galleryCaption, setGalleryCaption] = useState('');
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);

  // Player search filter
  const [playerSearch, setPlayerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'alle' | 'lebendig' | 'tot'>('alle');

  const isDead = player.status === 'tot';
  const isKillerRole = ['Vampir', 'Werwolf', 'Geist'].includes(player.role);
  const isHunter = player.role === 'Geisterjäger';

  // Active players list
  const activePlayers = useMemo(
    () => players.filter((p) => p.status !== 'entfernt'),
    [players]
  );

  // Alive players excluding self (candidates for kill/attack)
  const potentialVictims = useMemo(
    () => activePlayers.filter((p) => p.id !== player.id && p.status === 'lebendig'),
    [activePlayers, player.id]
  );

  // Filtered player list for "Spieler" tab
  const filteredPlayers = useMemo(() => {
    return activePlayers.filter((p) => {
      const matchSearch =
        !playerSearch.trim() ||
        p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
        p.costumeName.toLowerCase().includes(playerSearch.toLowerCase());
      const matchStatus = statusFilter === 'alle' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [activePlayers, playerSearch, statusFilter]);

  // Ranking sorted by points descending
  const rankingList = useMemo(() => {
    return [...activePlayers].sort((a, b) => (b.points || 0) - (a.points || 0));
  }, [activePlayers]);

  // Player's completed tasks
  const myCompletedTaskIds = useMemo(() => {
    return new Set(taskCompletions.filter((c) => c.playerId === player.id).map((c) => c.taskId));
  }, [taskCompletions, player.id]);

  // --- HANDLERS ---
  const handleExecuteKill = async () => {
    if (!selectedVictimId) return;
    setIsSubmittingKill(true);
    setKillError('');
    try {
      await onRecordKill(selectedVictimId);
      setKillSuccess('Biss erfolgreich protokolliert! +50 Punkte.');
      setTimeout(() => {
        setIsKillModalOpen(false);
        setSelectedVictimId('');
        setKillSuccess('');
      }, 1500);
    } catch (err: any) {
      setKillError(err?.message || 'Biss konnte nicht ausgeführt werden');
    } finally {
      setIsSubmittingKill(false);
    }
  };

  const handleTaskPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTaskPhotoFile(file);
    try {
      const compressed = await compressImageToMax1200px(file);
      setTaskPhotoPreview(compressed.dataUrl);
    } catch {
      setTaskPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmitTask = async () => {
    if (!selectedTaskForUpload) return;
    setIsSubmittingTask(true);
    try {
      await onCompleteTask(selectedTaskForUpload.id, taskPhotoFile || undefined);
      setSelectedTaskForUpload(null);
      setTaskPhotoFile(null);
      setTaskPhotoPreview('');
    } catch (err: any) {
      alert(err?.message || 'Aufgabe konnte nicht abgeschlossen werden');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleGalleryPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGalleryPhotoFile(file);
    try {
      const compressed = await compressImageToMax1200px(file);
      setGalleryPhotoPreview(compressed.dataUrl);
    } catch {
      setGalleryPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmitGalleryPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!galleryPhotoFile) return;
    setIsUploadingGallery(true);
    try {
      await onUploadPhoto(galleryPhotoFile, galleryCaption);
      setIsGalleryModalOpen(false);
      setGalleryPhotoFile(null);
      setGalleryPhotoPreview('');
      setGalleryCaption('');
    } catch (err: any) {
      alert(err?.message || 'Foto konnte nicht hochgeladen werden');
    } finally {
      setIsUploadingGallery(false);
    }
  };

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

  return (
    <div className="space-y-4 max-w-md mx-auto pb-10">
      {/* Top Bar: Status, Players Count, Logout */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 shadow-lg">
        <div className="flex items-center gap-2">{getStatusBadge()}</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 bg-zinc-900 px-3 py-1 rounded-xl border border-zinc-800">
            <Users className="w-3.5 h-3.5 text-[#ff6b00]" />
            <span>{totalJoinedCount} Gäste</span>
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

      {/* Sub-Navigation Bar for Player Views (Lobby, Spielerliste, Ranking, Aufgaben, Galerie) */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-zinc-900/90 border border-zinc-800 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSubTab('my-game')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            subTab === 'my-game'
              ? 'bg-[#ff6b00] text-black shadow-md shadow-[#ff6b00]/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {gameStatus === 'Lobby' ? 'Lobby' : 'Mein Spiel'}
        </button>
        <button
          onClick={() => setSubTab('players')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            subTab === 'players'
              ? 'bg-[#ff6b00] text-black shadow-md shadow-[#ff6b00]/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Spieler ({activePlayers.length})
        </button>
        <button
          onClick={() => setSubTab('ranking')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            subTab === 'ranking'
              ? 'bg-[#ff6b00] text-black shadow-md shadow-[#ff6b00]/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Ranking
        </button>
        <button
          onClick={() => setSubTab('tasks')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            subTab === 'tasks'
              ? 'bg-[#ff6b00] text-black shadow-md shadow-[#ff6b00]/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Aufgaben
        </button>
        <button
          onClick={() => setSubTab('gallery')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            subTab === 'gallery'
              ? 'bg-[#ff6b00] text-black shadow-md shadow-[#ff6b00]/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Galerie ({photos.length})
        </button>
      </div>

      {/* VIEW 1: MEIN SPIEL & LOBBY */}
      {subTab === 'my-game' && (
        <div className="space-y-4">
          {/* Eigenes Profil Banner */}
          <div className="p-4 rounded-3xl bg-linear-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                <img
                  src={player.photoUrl}
                  alt={player.name}
                  className={`w-18 h-18 rounded-2xl object-cover border-2 shadow-lg ${
                    isDead ? 'border-zinc-700 grayscale' : 'border-[#ff6b00]/60'
                  }`}
                />
                {isDead && (
                  <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center text-red-500">
                    <Skull className="w-7 h-7" />
                  </div>
                )}
              </div>

              <div className="truncate flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="font-serif font-black text-lg text-white tracking-wide truncate">
                    {player.name}
                  </h2>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[#ff6b00]/20 text-[#ff6b00] border border-[#ff6b00]/30">
                    Du
                  </span>
                </div>
                <p className="text-xs text-[#ff6b00] font-semibold mt-0.5 truncate flex items-center gap-1">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  {player.costumeName}
                </p>

                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      player.status === 'lebendig'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                        : player.status === 'tot'
                        ? 'bg-red-950 text-red-400 border-red-500/40'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {player.status}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/40">
                    {player.points || 0} Punkte
                  </span>
                  {player.killsCount ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/40">
                      {player.killsCount} Kills
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* LOBBY MODUS */}
          {gameStatus === 'Lobby' && (
            <div className="p-6 rounded-3xl bg-linear-to-b from-purple-950/40 via-zinc-900 to-zinc-950 border-2 border-purple-500/30 text-center space-y-3 shadow-xl">
              <div className="w-14 h-14 rounded-full bg-[#ff6b00]/10 border border-[#ff6b00]/30 text-[#ff6b00] flex items-center justify-center mx-auto animate-pulse">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-serif font-black text-xl text-white">Das Spiel startet bald</h3>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
                  Willkommen in der Party-Lobby! Der Spielleiter weist die Rollen zu. Sobald die Runde gestartet wird,
                  siehst du hier deine geheime Rolle und Aktionen.
                </p>
              </div>
              <div className="pt-1 flex items-center justify-center gap-2 text-xs font-bold text-zinc-300 bg-zinc-950/60 p-2.5 rounded-2xl border border-zinc-800">
                <Users className="w-4 h-4 text-[#ff6b00]" />
                <span>{activePlayers.length} Gäste im selben Spiel versammelt</span>
              </div>
            </div>
          )}

          {/* LAUFENDES SPIEL: ROLLE & AKTIONEN */}
          {gameStatus !== 'Lobby' && (
            <>
              {/* Geheime Rolle */}
              <div className="p-5 rounded-3xl bg-zinc-900/95 border-2 border-zinc-800 shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Deine Geheime Rolle
                  </span>
                  <span className="text-[10px] text-zinc-500">{roleRevealed ? 'Sichtbar' : 'Verdeckt'}</span>
                </div>

                {!roleRevealed ? (
                  <div className="p-6 rounded-2xl bg-linear-to-b from-purple-950/60 to-zinc-950 border border-purple-500/40 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-300">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-base text-white">Rolle geheim verdeckt</h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Tippe auf den Button, um deine Rolle diskret anzusehen.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRoleRevealed(true)}
                      className="w-full py-3 px-4 rounded-xl bg-linear-to-r from-purple-700 to-rose-600 hover:from-purple-600 hover:to-rose-500 text-white font-serif font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-98 transition"
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
                      <h3 className="font-serif font-black text-2xl text-white tracking-wide">{player.role}</h3>
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
                      {player.role === 'Werwolf' && 'Du bist ein Werwolf. Halte dich bereit für die Vollmond-Jagd.'}
                      {player.role === 'Geist' && 'Du wandelst als Geist. Schlage nur zu, wenn du mit dem Opfer allein bist.'}
                      {player.role === 'Geisterjäger' && 'Du bist der Schutz der Sterblichen. Finde die bösen Kreaturen.'}
                      {player.role === 'Mensch' && 'Du bist ein sterblicher Gast. Löse Aufgaben und überlebe die Nacht!'}
                    </p>

                    <button
                      type="button"
                      onClick={() => setRoleRevealed(false)}
                      className="w-full py-2 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer mt-2"
                    >
                      <EyeOff className="w-4 h-4" />
                      Rolle wieder verbergen
                    </button>
                  </div>
                )}
              </div>

              {/* AKTIONEN: BISS / KILL AUSFÜHREN (Für Vampire, Werwölfe, Geister) */}
              {isKillerRole && !isDead && (
                <div className="p-5 rounded-3xl bg-linear-to-b from-rose-950/40 via-zinc-900 to-zinc-950 border border-rose-500/40 shadow-xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-rose-500" />
                      Nacht-Aktion ({player.role})
                    </h3>
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-500/30">
                      Aktiv
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Hast du ein Opfer berührt und ihm die geheime Botschaft zugeflüstert? Protokolliere hier deinen Kill,
                    um dem Opfer den Tod zuzuweisen und dir +50 Punkte zu sichern.
                  </p>

                  <button
                    onClick={() => setIsKillModalOpen(true)}
                    className="w-full py-3.5 px-4 rounded-2xl bg-linear-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-serif font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-950 flex items-center justify-center gap-2 cursor-pointer active:scale-98 transition"
                  >
                    <Skull className="w-4 h-4" />
                    Biss / Kill protokollieren
                  </button>
                </div>
              )}
            </>
          )}

          {/* LETZTE KILLS IM SPIEL */}
          {kills.length > 0 && (
            <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
              <h4 className="font-serif font-bold text-sm text-white flex items-center gap-2 pb-2 border-b border-zinc-800">
                <Skull className="w-4 h-4 text-rose-400" />
                Letzte Vorfälle ({kills.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {kills.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      <span className="text-zinc-400 truncate">
                        <strong className="text-white">{k.victimName}</strong> wurde eliminiert
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                      {new Date(k.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SPIELERLISTE (Search & Filters) */}
      {subTab === 'players' && (
        <div className="space-y-3">
          <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#ff6b00]" />
                Alle Party-Gäste ({filteredPlayers.length})
              </h3>
              <span className="text-[10px] text-zinc-500">Live aus Supabase</span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
              <input
                type="text"
                placeholder="Name oder Kostüm suchen..."
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff6b00]"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              {(['alle', 'lebendig', 'tot'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-semibold capitalize border transition cursor-pointer ${
                    statusFilter === filter
                      ? 'bg-[#ff6b00]/20 border-[#ff6b00] text-[#ff6b00]'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Player Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
              {filteredPlayers.map((guest) => {
                const isCurrent = guest.id === player.id;
                const isGuestDead = guest.status === 'tot';
                return (
                  <div
                    key={guest.id}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition ${
                      isCurrent
                        ? 'bg-[#ff6b00]/10 border-[#ff6b00]/50'
                        : isGuestDead
                        ? 'bg-red-950/20 border-red-900/40 opacity-75'
                        : 'bg-zinc-950/80 border-zinc-800/80'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={guest.photoUrl}
                        alt={guest.name}
                        className={`w-12 h-12 rounded-xl object-cover border ${
                          isGuestDead ? 'border-red-500/50 grayscale' : 'border-zinc-700'
                        }`}
                      />
                      {isGuestDead && (
                        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center text-red-500">
                          <Skull className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-white truncate">{guest.name}</p>
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#ff6b00] text-black">
                            Du
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#ff6b00] truncate font-medium">{guest.costumeName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[9px] font-bold uppercase ${
                            guest.status === 'lebendig'
                              ? 'text-emerald-400'
                              : guest.status === 'tot'
                              ? 'text-red-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {guest.status}
                        </span>
                        <span className="text-[9px] text-zinc-400">· {guest.points || 0} Pkt.</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: RANKING / BESTENLISTE */}
      {subTab === 'ranking' && (
        <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Party-Bestenliste
            </h3>
            <span className="text-[10px] text-zinc-500">Punkte & Überleben</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {rankingList.map((ranked, index) => {
              const isCurrent = ranked.id === player.id;
              const isFirst = index === 0;
              const isSecond = index === 1;
              const isThird = index === 2;

              return (
                <div
                  key={ranked.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition ${
                    isCurrent
                      ? 'bg-[#ff6b00]/15 border-[#ff6b00]'
                      : isFirst
                      ? 'bg-amber-950/30 border-amber-500/40'
                      : 'bg-zinc-950/80 border-zinc-800/80'
                  }`}
                >
                  <div className="w-6 text-center font-serif font-black text-sm">
                    {isFirst ? (
                      <span className="text-amber-400">🥇</span>
                    ) : isSecond ? (
                      <span className="text-zinc-300">🥈</span>
                    ) : isThird ? (
                      <span className="text-amber-600">🥉</span>
                    ) : (
                      <span className="text-zinc-500 text-xs">#{index + 1}</span>
                    )}
                  </div>

                  <img
                    src={ranked.photoUrl}
                    alt={ranked.name}
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-700 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      {ranked.name}
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#ff6b00] text-black">
                          Du
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[#ff6b00] truncate">{ranked.costumeName}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-serif font-black text-sm text-white block">
                      {ranked.points || 0}
                    </span>
                    <span className="text-[9px] text-zinc-400 uppercase font-semibold">Punkte</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: AUFGABEN (TASKS) */}
      {subTab === 'tasks' && (
        <div className="space-y-3">
          <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div>
                <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-purple-400" />
                  Halloween Party-Aufgaben
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Löse Challenges, lade Beweisfotos hoch und sammle Punkte!
                </p>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
              {tasks.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">Keine Aufgaben hinterlegt.</p>
              ) : (
                tasks.map((t) => {
                  const isDone = myCompletedTaskIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 rounded-2xl border transition space-y-2 ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-500/40 opacity-80'
                          : 'bg-zinc-950 border-zinc-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                            {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {t.title}
                          </h4>
                          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{t.description}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/40 shrink-0">
                          +{t.points} Pkt.
                        </span>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        {isDone ? (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                            ✓ Abgeschlossen
                          </span>
                        ) : (
                          <button
                            onClick={() => setSelectedTaskForUpload(t)}
                            className="py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Foto-Beweis hochladen
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: GALERIE (PHOTOS) */}
      {subTab === 'gallery' && (
        <div className="space-y-3">
          <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div>
                <h3 className="font-serif font-bold text-base text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#ff6b00]" />
                  Party-Galerie ({photos.length})
                </h3>
                <p className="text-[11px] text-zinc-400">Live-Fotos aller Party-Gäste</p>
              </div>
              <button
                onClick={() => setIsGalleryModalOpen(true)}
                className="py-1.5 px-3 rounded-xl bg-[#ff6b00] hover:bg-[#e05e00] text-black font-bold text-xs flex items-center gap-1.5 shadow-md shadow-[#ff6b00]/20 cursor-pointer active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Foto teilen
              </button>
            </div>

            {photos.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">
                Noch keine Fotos hochgeladen. Sei der Erste!
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-4/3 rounded-2xl overflow-hidden bg-black border border-zinc-800 shadow-md"
                  >
                    <img
                      src={photo.photoUrl}
                      alt={photo.caption || 'Partyfoto'}
                      className="w-full h-full object-cover transition group-hover:scale-105 duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2">
                      <p className="text-[10px] text-white font-bold truncate">
                        {photo.photographerName || 'Gast'}
                      </p>
                      {photo.caption && (
                        <p className="text-[9px] text-zinc-300 truncate">{photo.caption}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: BISS / KILL AUSFÜHREN */}
      {isKillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-xs bg-zinc-900 border-2 border-rose-500/50 rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-rose-400 font-serif font-bold text-sm">
                <Skull className="w-4 h-4" />
                Opfer auswählen
              </div>
              <button
                onClick={() => setIsKillModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {killError && (
              <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-[11px] text-rose-300 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{killError}</span>
              </div>
            )}

            {killSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-[11px] text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{killSuccess}</span>
              </div>
            )}

            <p className="text-xs text-zinc-300">
              Wähle den Party-Gast, den du soeben berührt und gebissen hast:
            </p>

            <select
              value={selectedVictimId}
              onChange={(e) => setSelectedVictimId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white text-xs focus:outline-none focus:border-rose-500"
            >
              <option value="">-- Gast auswählen --</option>
              {potentialVictims.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.costumeName})
                </option>
              ))}
            </select>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsKillModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-400"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleExecuteKill}
                disabled={!selectedVictimId || isSubmittingKill}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold text-xs uppercase cursor-pointer"
              >
                {isSubmittingKill ? 'Protokolliere...' : 'Kill bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: AUFGABEN FOTO-BEWEIS */}
      {selectedTaskForUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-xs bg-zinc-900 border-2 border-purple-500/50 rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="font-serif font-bold text-sm text-purple-300">
                {selectedTaskForUpload.title}
              </div>
              <button
                onClick={() => setSelectedTaskForUpload(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300">{selectedTaskForUpload.description}</p>

            {taskPhotoPreview ? (
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-purple-500">
                <img src={taskPhotoPreview} alt="Beweis" className="w-full h-full object-cover" />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-purple-500 cursor-pointer text-zinc-400">
                <Camera className="w-8 h-8 text-purple-400 mb-2" />
                <span className="text-xs font-bold text-white">Foto aufnehmen</span>
                <span className="text-[10px] text-zinc-500">Wird komprimiert hochgeladen</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleTaskPhotoSelect}
                  className="hidden"
                />
              </label>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedTaskForUpload(null);
                  setTaskPhotoPreview('');
                  setTaskPhotoFile(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-400"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSubmitTask}
                disabled={isSubmittingTask}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase cursor-pointer"
              >
                {isSubmittingTask ? 'Speichert...' : 'Erledigt!'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: NEUES GALERIE-FOTO */}
      {isGalleryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <form
            onSubmit={handleSubmitGalleryPhoto}
            className="w-full max-w-xs bg-zinc-900 border-2 border-[#ff6b00]/50 rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="font-serif font-bold text-sm text-[#ff6b00] flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Foto zur Galerie hinzufügen
              </div>
              <button
                type="button"
                onClick={() => setIsGalleryModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {galleryPhotoPreview ? (
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-[#ff6b00]">
                <img src={galleryPhotoPreview} alt="Vorschau" className="w-full h-full object-cover" />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-[#ff6b00] cursor-pointer text-zinc-400">
                <Camera className="w-8 h-8 text-[#ff6b00] mb-2" />
                <span className="text-xs font-bold text-white">Party-Schnappschuss wählen</span>
                <span className="text-[10px] text-zinc-500">Komprimierung auf max. 1200px</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleGalleryPhotoSelect}
                  className="hidden"
                />
              </label>
            )}

            <input
              type="text"
              placeholder="Bildunterschrift (optional)..."
              value={galleryCaption}
              onChange={(e) => setGalleryCaption(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsGalleryModalOpen(false);
                  setGalleryPhotoPreview('');
                  setGalleryPhotoFile(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-400"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!galleryPhotoFile || isUploadingGallery}
                className="flex-1 py-2.5 rounded-xl bg-[#ff6b00] hover:bg-[#e05e00] disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold text-xs uppercase cursor-pointer"
              >
                {isUploadingGallery ? 'Lade hoch...' : 'Hochladen'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
