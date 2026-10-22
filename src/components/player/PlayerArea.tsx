import React, { useState, useEffect, useMemo } from 'react';
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
  Trophy,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  Flame,
  Search,
  Filter,
  Award,
  Zap,
  Info,
  Layers,
  ChevronRight,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';
import {
  Player,
  GameStatus,
  RoleType,
  KillRecord,
  PartyTask,
  TaskCompletion,
  PartyPhoto,
  SpecialTaskAssignment,
  GameState,
  FullMoonEvent
} from '../../types/game';
import { DEFAULT_PHOTO_TASKS } from '../../utils/gameDataPool';
import { KillModal } from './KillModal';
import { PhotoTaskModal } from './PhotoTaskModal';
import { SpecialTaskCard } from './SpecialTaskCard';
import { FullMoonBanner } from './FullMoonBanner';
import { KillNotificationModal } from './KillNotificationModal';
import { SelfDeathModal } from './SelfDeathModal';
import { GameEndView } from './GameEndView';
import { GalleryView } from './GalleryView';
import { gameApi } from '../../utils/api';

interface PlayerAreaProps {
  player: Player;
  players: Player[];
  gameState: GameState;
  totalJoinedCount: number;
  kills: KillRecord[];
  tasks: PartyTask[];
  taskCompletions: TaskCompletion[];
  photos: PartyPhoto[];
  activeTab: 'actions' | 'tasks' | 'ranking' | 'gallery' | 'profile';
  onTabChange: (tab: 'actions' | 'tasks' | 'ranking' | 'gallery' | 'profile') => void;
  onLogoutDevice: () => void;
  onRefreshState: () => Promise<void>;
  onSelfReportDeath: (killerRole: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onRequestAdminUnlock?: () => void;
  isAdminUnlocked?: boolean;
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  players,
  gameState,
  totalJoinedCount,
  kills,
  tasks,
  taskCompletions,
  photos,
  activeTab,
  onTabChange,
  onLogoutDevice,
  onRefreshState,
  onSelfReportDeath,
  onDeletePhoto,
  onRequestAdminUnlock,
  isAdminUnlocked,
}) => {
  // Secret Role reveal toggle
  const [isRoleSecretRevealed, setIsRoleSecretRevealed] = useState(false);

  // Modals
  const [isKillModalOpen, setIsKillModalOpen] = useState(false);
  const [isSelfDeathModalOpen, setIsSelfDeathModalOpen] = useState(false);
  const [activeTaskModal, setActiveTaskModal] = useState<{ id: string; title: string; desc: string } | null>(null);

  // Special task for humans
  const [pendingSpecialTask, setPendingSpecialTask] = useState<SpecialTaskAssignment | null>(null);

  // Cooldown countdown state
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState<number>(0);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState<number>(0);

  // Filter/Search in Ranking
  const [rankingFilter, setRankingFilter] = useState<'all' | 'dead' | 'kills'>('all');
  const [playerSearchTerm, setPlayerSearchTerm] = useState('');

  // Check if player has pending kill on themselves
  const pendingKillOnSelf = useMemo(() => {
    return kills.find((k) => k.victimId === player.id && !k.confirmed);
  }, [kills, player.id]);

  // Check if full moon is active
  const isFullMoon = useMemo(() => {
    return gameApi.isFullMoonActive(gameState);
  }, [gameState]);

  const nextFullMoonInfo = useMemo(() => {
    return gameApi.getNextFullMoon(gameState);
  }, [gameState]);

  // Check Grace Period (Schonfrist: 15 min nach startedAt)
  useEffect(() => {
    const checkGraceAndCooldown = () => {
      // 1. Schonfrist
      if (gameState.status === 'Läuft' && gameState.startedAt) {
        const graceMinutes = gameState.settings.gracePeriodMinutes || 15;
        const startMs = new Date(gameState.startedAt).getTime();
        const endGraceMs = startMs + graceMinutes * 60 * 1000;
        const now = Date.now();
        const diffGrace = Math.max(0, Math.floor((endGraceMs - now) / 1000));
        setGracePeriodSeconds(diffGrace);
      } else {
        setGracePeriodSeconds(0);
      }

      // 2. Player cooldown
      const dbPlayer = players.find((p) => p.id === player.id);
      let cdTimestamp = dbPlayer?.cooldownUntil || (dbPlayer as any)?.cooldown_until || player.cooldownUntil;
      if (!cdTimestamp) {
        try {
          cdTimestamp = sessionStorage.getItem(`cd_${player.id}`) || null;
        } catch {}
      }
      if (cdTimestamp) {
        const cdEndMs = new Date(cdTimestamp).getTime();
        const diffCd = Math.max(0, Math.floor((cdEndMs - Date.now()) / 1000));
        setCooldownRemainingSeconds(diffCd);
      } else {
        setCooldownRemainingSeconds(0);
      }
    };

    checkGraceAndCooldown();
    const interval = setInterval(checkGraceAndCooldown, 1000);
    return () => clearInterval(interval);
  }, [gameState, player, players]);

  // Load pending special task for living humans
  useEffect(() => {
    if (gameState.status === 'Läuft' && player.role === 'Mensch' && player.status === 'lebendig') {
      gameApi.getPendingSpecialTask(player.id).then((st) => {
        setPendingSpecialTask(st);
      });
    }
  }, [gameState.status, player.role, player.status, player.id]);

  const isDead = player.status === 'tot';
  const isHunter = player.role === 'Geisterjäger';
  const isKiller = ['Vampir', 'Werwolf', 'Geist'].includes(player.role);
  const isWerewolf = player.role === 'Werwolf';

  // Alive players excluding self
  const potentialVictims = useMemo(() => {
    return players.filter((p) => p.id !== player.id && p.status === 'lebendig');
  }, [players, player.id]);

  // Hunters teammate list (Geisterjäger sehen sich gegenseitig)
  const fellowHunters = useMemo(() => {
    if (!isHunter) return [];
    return players.filter((p) => p.role === 'Geisterjäger' && p.id !== player.id && p.status !== 'entfernt');
  }, [players, isHunter, player.id]);

  // Top rankings
  const activePlayers = useMemo(() => players.filter((p) => p.status !== 'entfernt'), [players]);
  const overallRanking = useMemo(
    () => [...activePlayers].sort((a, b) => (b.points || 0) - (a.points || 0)),
    [activePlayers]
  );
  const deadRanking = useMemo(
    () => activePlayers.filter((p) => p.status === 'tot').sort((a, b) => (b.points || 0) - (a.points || 0)),
    [activePlayers]
  );
  const myRank = overallRanking.findIndex((p) => p.id === player.id) + 1;

  // Active 2 photo tasks for the player (derived deterministically or rotating)
  const myActivePhotoTasks = useMemo(() => {
    // Generate 2 rotating tasks from pool
    const completedCount = player.tasksCompletedCount || 0;
    const pool = DEFAULT_PHOTO_TASKS;
    const task1 = pool[completedCount % pool.length];
    const task2 = pool[(completedCount + 1) % pool.length];

    // Pick a random other player for specific templates
    const otherPlayers = players.filter((p) => p.id !== player.id && p.status !== 'entfernt');
    const randomTarget = otherPlayers.length > 0 ? otherPlayers[completedCount % otherPlayers.length] : null;

    const formatDesc = (t: typeof task1) => {
      let txt = t.text;
      if (randomTarget) {
        txt = txt
          .replace('{playerName}', randomTarget.name)
          .replace('{costumeName}', randomTarget.costumeName || 'Kostüm');
      } else {
        txt = txt
          .replace('{playerName}', 'einem Mitspieler')
          .replace('{costumeName}', 'einem Grusel-Kostüm');
      }
      return txt;
    };

    return [
      {
        id: `${task1.id}_${completedCount}`,
        title: task1.type === 'specific_player' ? `Foto mit ${randomTarget?.name || 'Gast'}` : 'Foto-Challenge #1',
        description: formatDesc(task1),
        points: gameState.settings.pointsPhotoTask || 10,
        rawTemplate: task1,
        targetPlayer: randomTarget,
      },
      {
        id: `${task2.id}_${completedCount + 1}`,
        title: task2.type === 'specific_costume' ? `Kostüm-Foto` : 'Foto-Challenge #2',
        description: formatDesc(task2),
        points: gameState.settings.pointsPhotoTask || 10,
        rawTemplate: task2,
        targetPlayer: randomTarget,
      },
    ];
  }, [player.tasksCompletedCount, player.id, players, gameState.settings.pointsPhotoTask]);

  // Handlers
  const handleConfirmKillOnSelf = async () => {
    if (!pendingKillOnSelf) return;
    await onSelfReportDeath('Unbekannt');
  };

  const handleSelfReportDeath = async (killerRole: string) => {
    await onSelfReportDeath(killerRole);
  };

  const handleReportKill = async (victimId: string, ghostSoloConfirmed?: boolean) => {
    const res = await gameApi.reportKill({
      killerId: player.id,
      victimId,
      ghostSoloConfirmed,
    });
    await onRefreshState();
    return res;
  };

  const handleExorcise = async (targetId: string) => {
    const res = await gameApi.exorcise(player.id, targetId);
    await onRefreshState();
    return res;
  };

  const handleCompletePhotoTask = async (photoBlobOrUrl: Blob | File | string) => {
    if (!activeTaskModal) return;
    await gameApi.completePhotoTask({
      playerId: player.id,
      taskId: activeTaskModal.id,
      taskTitle: activeTaskModal.title,
      photoBlobOrUrl,
    });
    setActiveTaskModal(null);
    await onRefreshState();
  };

  const handleCompleteSpecialTask = async (userAnswer?: number, scannedQrCode?: string) => {
    if (!pendingSpecialTask) throw new Error('Keine Spezialaufgabe aktiv');
    const res = await gameApi.completeSpecialTask({
      specialTaskId: pendingSpecialTask.id,
      playerId: player.id,
      userAnswer,
      scannedQrCode,
    });
    await onRefreshState();
    return res;
  };

  // IF GAME IS OVER (Beendet), SHOW END VIEW
  if (gameState.status === 'Beendet') {
    return (
      <GameEndView
        gameState={gameState}
        players={players}
        kills={kills}
        photos={photos}
      />
    );
  }

  // IF STILL IN LOBBY, HANDLE TABS OR SHOW LOBBY VIEW
  if (gameState.status === 'Lobby') {
    if (activeTab === 'gallery') {
      return (
        <div className="space-y-4 animate-in fade-in pb-16">
          <GalleryView
            photos={photos}
            currentPlayerId={player.id}
            currentPlayerName={player.name}
            isGameEnded={false}
            downloadSetting={gameState.settings?.photoDownloadUnlocked || 'ended'}
            isAdmin={Boolean(isAdminUnlocked)}
            onDeletePhoto={onDeletePhoto}
          />
        </div>
      );
    }

    if (activeTab === 'profile') {
      return (
        <div className="space-y-4 animate-in fade-in pb-16">
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Rollen-Zuteilung
            </span>
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-700 text-center space-y-2">
              <span className="text-2xl font-serif font-black text-amber-400 block">Lobby-Phase</span>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Deine Rolle wird beim Spielstart geheim zugeteilt.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 text-xs text-zinc-300">
            <h4 className="font-serif font-bold text-white text-base">Spielregeln</h4>
            <div className="space-y-2">
              <div>
                <span className="font-bold text-white block">1. Berühren & Flüstern:</span>
                Zum Töten das Opfer kurz berühren und ins Ohr flüstern:{" "}
                <span className="italic text-rose-400">"Du wurdest von einem [Rolle] getötet."</span>
              </div>
              <div>
                <span className="font-bold text-white block">2. Punkteverteilung:</span>
                Foto-Aufgabe: 10 Pkt • Spezialaufgabe: 20 Pkt • Böser Kill: 15 Pkt • Exorzismus: 25 Pkt.
              </div>
            </div>
          </div>

          {!isAdminUnlocked && onRequestAdminUnlock && (
            <button
              type="button"
              onClick={onRequestAdminUnlock}
              className="w-full py-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-zinc-500 hover:text-zinc-300 font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Spielleiter-Login / Admin-Bereich</span>
            </button>
          )}

          <button
            onClick={onLogoutDevice}
            className="w-full py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <LogOut className="w-4 h-4" />
            Auf diesem Gerät abmelden
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-5 animate-in fade-in pb-16">
        <div className="text-center p-6 rounded-3xl bg-gradient-to-b from-orange-950/40 via-zinc-950 to-zinc-950 border border-orange-500/30 space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ff6b00]/15 border border-[#ff6b00]/40 flex items-center justify-center text-[#ff6b00] animate-pulse">
            <Sparkles className="w-7 h-7" />
          </div>
          <span className="inline-block px-3 py-0.5 rounded-full bg-[#ff6b00]/15 text-[#ff6b00] text-xs font-bold uppercase tracking-wider">
            Party-Lobby
          </span>
          <h2 className="text-2xl font-serif font-black text-white">Warten auf Spielstart...</h2>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
            Der Spielleiter startet das Spiel gleich. Mache dich bereit und lerne deine Mitgäste kennen!
          </p>
        </div>

        {/* Own Player Badge */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={player.photoUrl || '/placeholder.png'}
              alt={player.name}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-[#ff6b00]"
            />
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Du bist angemeldet als
              </span>
              <span className="font-bold text-white text-base leading-tight block">{player.name}</span>
              <span className="text-xs text-[#ff6b00] font-medium">{player.costumeName}</span>
            </div>
          </div>
          <button
            onClick={onLogoutDevice}
            className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition"
            title="Auf diesem Gerät abmelden"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Lobby Players List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-[#ff6b00]" />
              In der Lobby ({totalJoinedCount})
            </h3>
            <span className="text-xs text-zinc-500 font-mono">Live via Supabase</span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
            {activePlayers.map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex items-center gap-2.5"
              >
                <img
                  src={p.photoUrl || '/placeholder.png'}
                  alt={p.name}
                  className="w-10 h-10 rounded-xl object-cover border border-zinc-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{p.name}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{p.costumeName}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- GAME IS RUNNING ('Läuft') ---
  return (
    <div className="space-y-4 animate-in fade-in pb-16">
      {/* 1. FULL MOON BANNER */}
      <FullMoonBanner
        activeFullMoon={gameState.activeFullMoon || null}
        isWerewolf={isWerewolf}
        onMoonEnd={onRefreshState}
      />

      {/* 2. PENDING KILL FULL-SCREEN NOTIFICATION */}
      {pendingKillOnSelf && (
        <KillNotificationModal
          pendingKill={pendingKillOnSelf}
          onConfirm={handleConfirmKillOnSelf}
        />
      )}

      {/* 3. DEAD PLAYER BANNER / ZUSCHAUER-MODUS */}
      {isDead && (
        <div className="p-5 rounded-3xl bg-gradient-to-b from-purple-950/90 via-zinc-950 to-zinc-950 border-2 border-purple-600/80 shadow-2xl space-y-3 text-center animate-in fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-black uppercase tracking-wider">
            <Skull className="w-4 h-4 text-purple-400" />
            Totenreich • Zuschauer-Modus
          </div>
          <h3 className="text-2xl font-serif font-black text-white">Du bist tot!</h3>
          <p className="text-xs text-zinc-300 max-w-sm mx-auto leading-relaxed">
            Du scheidest aus dem aktiven Jagen und Töten aus, bleibst aber als <strong className="text-purple-300">Zuschauer</strong> voll im Spielgeschehen!
          </p>

          <div className="grid grid-cols-2 gap-2 text-left pt-1">
            <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-purple-500/30 text-[11px] text-zinc-300 space-y-1">
              <span className="font-bold text-purple-300 block">👁️ Rollen aufdecken:</span>
              <p className="text-[10px] text-zinc-400 leading-tight">Deine Rolle ({player.role}) ist kein Geheimnis mehr. Du darfst sie jetzt offen verraten!</p>
            </div>
            <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-purple-500/30 text-[11px] text-zinc-300 space-y-1">
              <span className="font-bold text-amber-300 block">📸 Foto-Punkte:</span>
              <p className="text-[10px] text-zinc-400 leading-tight">Löse Foto-Aufgaben im Tab "Aufgaben", um Punkte im Totenreich-Ranking zu sammeln!</p>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-[10px] text-zinc-400">
            Der Spielleiter/Admin kann dich im Admin-Bereich jederzeit <span className="text-emerald-400 font-bold">wiederbeleben</span>.
          </div>
        </div>
      )}

      {/* 4. SCHONFRIST (GRACE PERIOD) WARNING BANNER */}
      {gracePeriodSeconds > 0 && !isDead && (
        <div className="p-3 rounded-2xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-amber-300 block">Schonfrist aktiv!</span>
              <span className="text-[11px] text-amber-200/80">In den ersten 15 Min. darf niemand getötet werden.</span>
            </div>
          </div>
          <div className="font-mono font-bold text-amber-300 text-sm shrink-0">
            {Math.floor(gracePeriodSeconds / 60)}:{(gracePeriodSeconds % 60).toString().padStart(2, '0')}
          </div>
        </div>
      )}



      {/* ======================================================== */}
      {/* TAB 1: AKTIONEN (Fähigkeiten der eigenen Rolle)            */}
      {/* ======================================================== */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          {/* Quick Role Status Header */}
          <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${
                  player.role === 'Vampir'
                    ? 'bg-rose-950 border border-rose-600'
                    : player.role === 'Werwolf'
                    ? 'bg-amber-950 border border-amber-600'
                    : player.role === 'Geist'
                    ? 'bg-purple-950 border border-purple-600'
                    : player.role === 'Geisterjäger'
                    ? 'bg-blue-950 border border-blue-600'
                    : player.role === 'Mensch'
                    ? 'bg-emerald-950 border border-emerald-600'
                    : 'bg-zinc-800 border border-zinc-600'
                }`}
              >
                {player.role === 'Vampir' && <Skull className="w-6 h-6 text-rose-500" />}
                {player.role === 'Werwolf' && <Moon className="w-6 h-6 text-amber-400" />}
                {player.role === 'Geist' && <Ghost className="w-6 h-6 text-purple-400" />}
                {player.role === 'Geisterjäger' && <ShieldAlert className="w-6 h-6 text-blue-400" />}
                {player.role === 'Mensch' && <Users className="w-6 h-6 text-emerald-400" />}
                {(player.role === 'unassigned' || !player.role) && <HelpCircle className="w-6 h-6 text-zinc-400" />}
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                  Deine Rolle
                </span>
                <span className="font-serif font-black text-xl text-white block">
                  {player.role === 'unassigned' || !player.role ? 'Noch nicht zugelost' : player.role}
                </span>
                <span className="text-xs text-zinc-400">
                  {player.role === 'unassigned' || !player.role ? 'Rolle folgt bei Spielstart' : `Team ${player.team}`}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono font-bold text-[#ff6b00] block">{player.points} Pkt</span>
              <span
                className={`text-[10px] font-bold ${
                  player.status === 'lebendig' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {player.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* HUNTER SPECIAL: FELLOW HUNTERS LIST */}
          {isHunter && fellowHunters.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/40 space-y-2">
              <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Deine Geisterjäger-Kollegen:
              </span>
              <div className="flex flex-wrap gap-2">
                {fellowHunters.map((fh) => (
                  <div
                    key={fh.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-900/60 border border-blue-600/40 text-xs text-blue-200"
                  >
                    <img
                      src={fh.photoUrl || '/placeholder.png'}
                      alt={fh.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                    <span className="font-bold">{fh.name}</span>
                    <span className="text-[10px] text-blue-300/80">({fh.costumeName})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTION BUTTON & COOLDOWN LOGIC */}
          <div className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
            <h4 className="font-serif font-bold text-white text-base">Fähigkeiten im Spiel</h4>

            {isDead ? (
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-center space-y-2">
                <Skull className="w-8 h-8 mx-auto text-zinc-600" />
                <p className="text-xs text-zinc-400">
                  Als Toter kannst du keine Kills oder Angriffe mehr durchführen.
                  Löse Foto-Aufgaben, um im Totenreich Punkte zu sammeln!
                </p>
              </div>
            ) : isKiller ? (
              /* VAMPIR, WERWOLF, GEIST */
              <div className="space-y-3">
                <div className="text-xs text-zinc-300 space-y-1 leading-relaxed">
                  {player.role === 'Vampir' && (
                    <p>
                      🧛 <strong>Vampir:</strong> Töte ein Opfer durch kurzes Berühren an Schulter/Arm und
                      Flüstern: <em>"Du wurdest von einem Vampir getötet."</em> (Cooldown: 6 Min).
                    </p>
                  )}
                  {player.role === 'Werwolf' && (
                    <p>
                      🐺 <strong>Werwolf:</strong> Du kannst <strong>ausschließlich bei Vollmond</strong> töten!
                      Während des Vollmonds gilt ein verkürzter Cooldown von nur 2 Minuten.
                    </p>
                  )}
                  {player.role === 'Geist' && (
                    <p>
                      👻 <strong>Geist:</strong> Du kannst nur zuschlagen, wenn du mit dem Opfer <strong>allein</strong> im
                      Raum bist (Pflicht-Bestätigung). Cooldown: 6 Minuten.
                    </p>
                  )}
                </div>

                {/* Cooldown Display */}
                {cooldownRemainingSeconds > 0 && (
                  <div className="p-3 rounded-2xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Clock className="w-4 h-4 animate-spin" />
                      Cooldown läuft:
                    </span>
                    <span className="font-mono font-black text-sm">
                      {Math.floor(cooldownRemainingSeconds / 60)}:{(cooldownRemainingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}

                {/* Werewolf Moon Lockout */}
                {isWerewolf && !isFullMoon && (
                  <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Moon className="w-4 h-4" />
                      Kein Vollmond aktiv
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {nextFullMoonInfo
                        ? `Nächster Vollmond in ca. ${nextFullMoonInfo.startsInMinutes} Minuten.`
                        : 'Warte, bis der Vollmond aufgeht!'}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setIsKillModalOpen(true)}
                  disabled={cooldownRemainingSeconds > 0 || (isWerewolf && !isFullMoon) || gracePeriodSeconds > 0}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-sm shadow-xl shadow-rose-950/80 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                >
                  <Skull className="w-5 h-5" />
                  Kill melden ({player.role})
                </button>
              </div>
            ) : isHunter ? (
              /* GEISTERJÄGER */
              <div className="space-y-3">
                <div className="text-xs text-zinc-300 space-y-1 leading-relaxed">
                  <p>
                    🏹 <strong>Exorzismus:</strong> Wähle eine Person aus.
                    Ist sie böse (Vampir, Werwolf oder Geist), stirbt sie sofort (+25 Pkt, Cooldown 15 Min).
                    Ist sie gut (Mensch), bleibt sie am Leben und du bist für 30 Minuten gesperrt!
                  </p>
                </div>

                {cooldownRemainingSeconds > 0 && (
                  <div className="p-3 rounded-2xl bg-blue-950/50 border border-blue-500/50 text-blue-300 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Clock className="w-4 h-4" />
                      Exorzismus-Sperre:
                    </span>
                    <span className="font-mono font-black text-sm">
                      {Math.floor(cooldownRemainingSeconds / 60)}:{(cooldownRemainingSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => setIsKillModalOpen(true)}
                  disabled={cooldownRemainingSeconds > 0 || gracePeriodSeconds > 0}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-blue-950/80 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                >
                  <ShieldAlert className="w-5 h-5" />
                  Exorzieren
                </button>
              </div>
            ) : (
              /* MENSCH */
              <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                <p>
                  🧍 <strong>Deine Rolle als Mensch:</strong> Du kannst niemanden töten.
                  Deine Aufgabe ist es zu überleben, Party-Aufgaben zu lösen und den Geisterjägern zu helfen,
                  die Kreaturen der Nacht zu entlarven!
                </p>
                <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs">
                  ✨ <strong>Spezialaufgaben:</strong> Alle 10–20 Minuten erhältst du vielleicht eine
                  Spezialaufgabe (Quiz, QR-Code oder Foto). Damit erfährst du die geheime Rolle eines Mitspielers!
                </div>
              </div>
            )}

            {/* BUTTON "ICH WURDE GETÖTET" (IM TAB AKTIONEN) */}
            {!isDead && (
              <div className="pt-3 border-t border-zinc-800 space-y-1.5">
                <button
                  type="button"
                  onClick={() => setIsSelfDeathModalOpen(true)}
                  className="w-full py-3.5 rounded-2xl bg-zinc-950 hover:bg-rose-950/40 border border-zinc-700 hover:border-rose-500/70 text-zinc-200 hover:text-rose-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 shadow-sm"
                >
                  <Skull className="w-4 h-4 text-rose-500" />
                  <span>Ich wurde getötet (Selbstmeldung)</span>
                </button>
                <p className="text-[10px] text-zinc-500 text-center">
                  Tippe hier, wenn dich jemand berührt und angeflüstert hat.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: AUFGABEN (Foto- & Spezialaufgaben für ALLE)        */}
      {/* ======================================================== */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-sm">Offene Aufgaben</h3>
              <p className="text-[11px] text-zinc-400">
                Gilt für alle Spieler (auch Böse & Tote für Punkte)
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#ff6b00]">
              {player.tasksCompletedCount || 0} gelöst
            </span>
          </div>

          {/* SPECIAL TASK FOR HUMANS IF PENDING */}
          {player.role === 'Mensch' && pendingSpecialTask && (
            <SpecialTaskCard
              specialTask={pendingSpecialTask}
              onComplete={handleCompleteSpecialTask}
            />
          )}

          {/* 2 OFFENE FOTO-AUFGABEN */}
          <div className="space-y-3">
            {myActivePhotoTasks.map((t, idx) => (
              <div
                key={t.id}
                className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 hover:border-zinc-700 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#ff6b00]/15 text-[#ff6b00] text-[10px] font-bold uppercase tracking-wider">
                    Foto-Aufgabe {idx + 1}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#ff6b00]">
                    +{t.points} Pkt
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-white text-sm">{t.title}</h4>
                  <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">{t.description}</p>
                </div>

                {t.targetPlayer && (
                  <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <img
                      src={t.targetPlayer.photoUrl || '/placeholder.png'}
                      alt={t.targetPlayer.name}
                      className="w-8 h-8 rounded-xl object-cover border border-zinc-700"
                    />
                    <div>
                      <span className="text-[10px] text-zinc-400 block">Gesuchtes Kostüm:</span>
                      <span className="text-xs font-bold text-white">
                        {t.targetPlayer.name} als "{t.targetPlayer.costumeName}"
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() =>
                    setActiveTaskModal({
                      id: t.id,
                      title: t.title,
                      desc: t.description,
                    })
                  }
                  className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[#ff6b00] to-orange-600 hover:from-[#ff7c1f] hover:to-orange-500 text-zinc-950 font-black text-xs shadow-md shadow-orange-950 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  Foto aufnehmen & lösen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: RANKING (Punkte-Ranking & Spielstand)              */}
      {/* ======================================================== */}
      {activeTab === 'ranking' && (
        <div className="space-y-4">
          {/* My Rank Summary */}
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-950/40 via-zinc-900 to-zinc-900 border border-amber-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Dein Platz im Ranking
              </span>
              <span className="font-serif font-black text-2xl text-amber-400">
                #{myRank > 0 ? myRank : '-'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Punkte
              </span>
              <span className="font-mono font-black text-2xl text-white">
                {player.points}
              </span>
            </div>
          </div>

          {/* Ranking Sub-Filter: All, Totenreich or Kill-Log */}
          <div className="flex rounded-2xl bg-zinc-900 p-1 border border-zinc-800 text-xs font-bold gap-1">
            <button
              onClick={() => setRankingFilter('all')}
              className={`flex-1 py-1.5 rounded-xl transition cursor-pointer text-center ${
                rankingFilter === 'all'
                  ? 'bg-[#ff6b00] text-zinc-950 font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Top 20
            </button>
            <button
              onClick={() => setRankingFilter('dead')}
              className={`flex-1 py-1.5 rounded-xl transition cursor-pointer text-center ${
                rankingFilter === 'dead'
                  ? 'bg-purple-600 text-white font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Totenreich
            </button>
            <button
              onClick={() => setRankingFilter('kills')}
              className={`flex-1 py-1.5 rounded-xl transition cursor-pointer text-center ${
                rankingFilter === 'kills'
                  ? 'bg-rose-600 text-white font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Kill-Log ({kills.filter((k) => k.confirmed).length})
            </button>
          </div>

          {/* KILL-LOG VIEW */}
          {rankingFilter === 'kills' ? (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {kills.filter((k) => k.confirmed).length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <Skull className="w-6 h-6 mx-auto text-zinc-600" />
                  <p>Bisher wurden keine Kills gemeldet. Alle Gäste leben noch!</p>
                </div>
              ) : (
                kills
                  .filter((k) => k.confirmed)
                  .map((k) => (
                    <div
                      key={k.id}
                      className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Skull className="w-3.5 h-3.5 text-rose-500" />
                          <span>{k.victimName} wurde getötet</span>
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {new Date(k.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span>
                          Täter: <strong className="text-rose-300">{k.killerName || 'Unbekannt'}</strong>
                          {k.killerRole && k.killerRole !== 'Unbekannt' && ` (${k.killerRole})`}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {k.reason === 'self_reported'
                            ? 'Selbstmeldung'
                            : k.reason === 'exorcism'
                            ? 'Exorzismus'
                            : 'Angriff'}
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          ) : (
            /* Player list (Top 20, roles hidden!) */
            <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {(rankingFilter === 'all' ? overallRanking.slice(0, 20) : deadRanking).map((p, idx) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition ${
                  p.id === player.id
                    ? 'bg-[#ff6b00]/15 border-[#ff6b00]/50'
                    : 'bg-zinc-900/80 border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`font-mono font-black text-xs w-5 text-center ${
                      idx === 0
                        ? 'text-amber-400'
                        : idx === 1
                        ? 'text-zinc-300'
                        : idx === 2
                        ? 'text-amber-600'
                        : 'text-zinc-500'
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
                      {p.id === player.id && (
                        <span className="text-[10px] text-[#ff6b00] font-black">(Du)</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400">{p.costumeName}</div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-[#ff6b00]">{p.points} Pkt</span>
                  <span
                    className={`block text-[9px] font-bold ${
                      p.status === 'lebendig' ? 'text-emerald-400' : 'text-purple-400'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB: GALERIE (Party-Galerie aller gelösten Foto-Aufgaben)  */}
      {/* ======================================================== */}
      {activeTab === 'gallery' && (
        <GalleryView
          photos={photos}
          currentPlayerId={player.id}
          currentPlayerName={player.name}
          isGameEnded={false}
          downloadSetting={gameState.settings?.photoDownloadUnlocked || 'ended'}
          isAdmin={Boolean(isAdminUnlocked)}
          onDeletePhoto={onDeletePhoto}
        />
      )}

      {/* ======================================================== */}
      {/* TAB 4: PROFIL & REGELN (Profil, Rollenkarte, Regeln)     */}
      {/* ======================================================== */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          {/* Secret Role Card */}
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Geheime Rollenkarte
              </span>
              <button
                onClick={() => setIsRoleSecretRevealed(!isRoleSecretRevealed)}
                className="text-xs text-[#ff6b00] font-bold flex items-center gap-1 cursor-pointer"
              >
                {isRoleSecretRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {isRoleSecretRevealed ? 'Verstecken' : 'Aufdecken'}
              </button>
            </div>

            {isRoleSecretRevealed ? (
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-700 text-center space-y-2 animate-in zoom-in-95">
                <span className="text-2xl font-serif font-black text-white block">
                  {player.role === 'unassigned' || !player.role ? 'Noch nicht zugelost' : player.role}
                </span>
                <span className="inline-block px-3 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold">
                  {player.role === 'unassigned' || !player.role ? 'Lobby-Phase' : `Team ${player.team}`}
                </span>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  {(player.role === 'unassigned' || !player.role) && 'Das Spiel hat noch nicht begonnen. Deine Rolle wird beim Start des Spiels geheim zugeteilt!'}
                  {player.role === 'Vampir' && 'Du bist ein Vampir. Töte im Geheimen und entkomme den Geisterjägern.'}
                  {player.role === 'Werwolf' && 'Du bist ein Werwolf. Töte rasend schnell während des Vollmonds.'}
                  {player.role === 'Geist' && 'Du bist ein Geist. Schlage nur zu, wenn du mit dem Opfer allein bist.'}
                  {player.role === 'Geisterjäger' && 'Du bist ein Geisterjäger. Exorziere die Bösen, verschone Menschen.'}
                  {player.role === 'Mensch' && 'Du bist ein Mensch. Löse Aufgaben, überlebe und hilf dem Guten Team!'}
                </p>
              </div>
            ) : (
              <div
                onClick={() => setIsRoleSecretRevealed(true)}
                className="p-6 rounded-2xl bg-zinc-950 border border-dashed border-zinc-700 text-center cursor-pointer hover:border-[#ff6b00] transition"
              >
                <Lock className="w-6 h-6 mx-auto text-zinc-600 mb-1" />
                <span className="text-xs font-bold text-zinc-400">
                  Tippe hier, um deine geheime Rolle anzusehen
                </span>
              </div>
            )}
          </div>

          {/* BUTTON "ICH WURDE GETÖTET" (IM TAB PROFIL) */}
          {!isDead && (
            <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                <Skull className="w-4 h-4 text-rose-500" />
                <span>Wurdest du im echten Leben erwischt?</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Falls dich ein Vampir, Geist oder Werwolf berührt und dir deinen Tod ins Ohr geflüstert hat:
              </p>
              <button
                type="button"
                onClick={() => setIsSelfDeathModalOpen(true)}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-950 via-rose-900 to-red-950 hover:from-rose-900 hover:to-red-900 border border-rose-600/70 text-rose-100 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 shadow-md shadow-rose-950/60"
              >
                <Skull className="w-4 h-4 text-rose-400" />
                <span>Ich wurde getötet</span>
              </button>
            </div>
          )}

          {/* RULES SUMMARY */}
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 text-xs text-zinc-300">
            <h4 className="font-serif font-bold text-white text-base">Spielregeln</h4>

            <div className="space-y-2">
              <div>
                <span className="font-bold text-white block">1. Berühren & Flüstern:</span>
                Zum Töten das Opfer kurz an Arm/Schulter berühren und ins Ohr flüstern:{" "}
                <span className="italic text-rose-400">"Du wurdest von einem [Rolle] getötet."</span> Danach in der App melden.
              </div>

              <div>
                <span className="font-bold text-white block">2. Siegbedingungen:</span>
                • <strong>GUT gewinnt:</strong> Wenn alle Bösen tot sind.<br />
                • <strong>BÖSE gewinnt:</strong> Wenn alle Geisterjäger tot sind oder &gt;75% des guten Teams tot sind.<br />
                • Bei Zeitende gewinnt das Team mit prozentual mehr Überlebenden.
              </div>

              <div>
                <span className="font-bold text-white block">3. Punkteverteilung:</span>
                Foto-Aufgabe: 10 Pkt • Spezialaufgabe: 20 Pkt • Böser Kill: 15 Pkt • Exorzismus: 25 Pkt.
              </div>
            </div>
          </div>

          {/* Admin Unlock button if not yet unlocked */}
          {!isAdminUnlocked && onRequestAdminUnlock && (
            <button
              type="button"
              onClick={onRequestAdminUnlock}
              className="w-full py-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-zinc-500 hover:text-zinc-300 font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Spielleiter-Login / Admin-Bereich</span>
            </button>
          )}

          {/* Logout */}
          <button
            onClick={onLogoutDevice}
            className="w-full py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <LogOut className="w-4 h-4" />
            Auf diesem Gerät abmelden
          </button>
        </div>
      )}

      {/* KILL MODAL POPUP */}
      <KillModal
        isOpen={isKillModalOpen}
        onClose={() => setIsKillModalOpen(false)}
        killer={player}
        potentialVictims={potentialVictims}
        isFullMoonActive={isFullMoon}
        onReportKill={handleReportKill}
        onExorcise={handleExorcise}
      />

      {/* PHOTO TASK MODAL POPUP */}
      {activeTaskModal && (
        <PhotoTaskModal
          isOpen={Boolean(activeTaskModal)}
          onClose={() => setActiveTaskModal(null)}
          taskTitle={activeTaskModal.title}
          taskDescription={activeTaskModal.desc}
          onComplete={handleCompletePhotoTask}
        />
      )}

      {/* SELF DEATH CONFIRMATION MODAL */}
      <SelfDeathModal
        isOpen={isSelfDeathModalOpen}
        onClose={() => setIsSelfDeathModalOpen(false)}
        playerName={player.name}
        onConfirmDeath={handleSelfReportDeath}
      />
    </div>
  );
};
