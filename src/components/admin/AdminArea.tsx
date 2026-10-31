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
  Image as ImageIcon,
  Download,
  Archive,
  Loader2,
  Maximize2,
  Pause,
  ChevronLeft,
  ChevronRight,
  Clock
} from 'lucide-react';
import { downloadPhotosAsZip } from '../../utils/zipDownloader';
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
import { calculateRoleDistribution, RoleCounts } from '../../utils/roleDistribution';
import { PointsLogModal } from './PointsLogModal';
import { EmergencyPanel } from './EmergencyPanel';
import { LogsPanel } from './LogsPanel';

interface AdminAreaProps {
  gameStatus: GameStatus;
  players: Player[];
  settings: GameSettings;
  adminCode: string;
  kills: KillRecord[];
  photos: PartyPhoto[];
  onStartGame: () => Promise<void>;
  onReassignRoles: () => Promise<void>;
  onAbortGame: () => Promise<void>;
  onEndGame: () => Promise<void>;
  onReopenGame?: () => Promise<void>;
  onRestartGame: (keepPlayers: boolean) => Promise<void>;
  onPlayerAction: (playerId: string, action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren') => Promise<void>;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => Promise<void>;
  onTriggerFullMoon: (durationMinutes?: number) => Promise<void>;
  onStopFullMoon: () => Promise<void>;
  onConfirmKill: (killId: string) => Promise<void>;
  onUndoKill: (killId: string) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onAdminConfirmPendingDeath?: (victimId: string) => Promise<void>;
  onAdminRevivePendingDeath?: (playerId: string) => Promise<void>;
  lastTickAt?: string | null;
  onTriggerTick?: () => Promise<void>;
  onRefreshState?: () => Promise<void>;
  onToast?: (msg: string, type: 'success' | 'error') => void;
}

export const AdminArea: React.FC<AdminAreaProps> = ({
  gameStatus,
  players,
  settings,
  adminCode,
  kills,
  photos,
  lastTickAt,
  onStartGame,
  onReassignRoles,
  onAbortGame,
  onEndGame,
  onReopenGame,
  onRestartGame,
  onPlayerAction,
  onUpdateSettings,
  onTriggerFullMoon,
  onStopFullMoon,
  onConfirmKill,
  onUndoKill,
  onDeletePhoto,
  onAdminConfirmPendingDeath,
  onAdminRevivePendingDeath,
  onTriggerTick,
  onRefreshState,
  onToast,
}) => {
  // Sub-tabs in Admin: 'control' | 'players' | 'kills' | 'gallery' | 'settings' | 'qrcode' | 'emergency' | 'logs'
  const [activeTab, setActiveTab] = useState<'control' | 'players' | 'kills' | 'gallery' | 'settings' | 'qrcode' | 'emergency' | 'logs'>('control');
  const [tickSecondsAgo, setTickSecondsAgo] = useState<number | null>(null);
  const [isTicking, setIsTicking] = useState(false);

  // Live calculation of seconds since last tick
  useEffect(() => {
    const updateTick = () => {
      if (!lastTickAt) {
        setTickSecondsAgo(null);
        return;
      }
      const diffSec = Math.max(0, Math.floor((Date.now() - new Date(lastTickAt).getTime()) / 1000));
      setTickSecondsAgo(diffSec);
    };
    updateTick();
    const interval = setInterval(updateTick, 1000);
    return () => clearInterval(interval);
  }, [lastTickAt]);

  const handleManualTick = async () => {
    setIsTicking(true);
    try {
      if (onTriggerTick) {
        await onTriggerTick();
      } else {
        await gameApi.tickGame();
      }
    } finally {
      setIsTicking(false);
    }
  };

  const handleConfirmEndGame = async () => {
    if (confirm('Möchtest du das Spiel wirklich beenden? Alle Rollen werden enthüllt und das Gewinner-Team ermittelt.')) {
      await onEndGame();
    }
  };

  const handleConfirmAbortGame = async () => {
    if (confirm('Möchtest du das laufende Spiel wirklich abbrechen und zurück in die Lobby wechseln?')) {
      await onAbortGame();
    }
  };

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('alle');
  const [statusFilter, setStatusFilter] = useState<string>('alle');

  // Restart modal states
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);

  // Role distribution & Simulation modal states
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulatePlayerCount, setSimulatePlayerCount] = useState<number>(100);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);

  // Settings form states
  const [formData, setFormData] = useState({
    adminCode: settings.adminCode || '1031',
    vampirePercent: settings.vampirePercent ?? 6,
    werewolfPercent: settings.werewolfPercent ?? 4,
    ghostPercent: settings.ghostPercent ?? 4,
    hunterPercent: settings.hunterPercent ?? 10,
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
    pendingDeathTimeoutMinutes: settings.pendingDeathTimeoutMinutes ?? 4,
    unconfirmedKillAction: settings.unconfirmedKillAction ?? 'revive',
    photoTaskIntervalMinutes: settings.photoTaskIntervalMinutes ?? 10,
    killConfirmationTimeoutMinutes: settings.killConfirmationTimeoutMinutes || 5,
    pointsPhotoTask: settings.pointsPhotoTask || 10,
    pointsSpecialTask: settings.pointsSpecialTask || 20,
    photoDownloadUnlocked: settings.photoDownloadUnlocked || 'ended',
    pointsEvilKill: settings.pointsEvilKill || 15,
    pointsExorcismSuccess: settings.pointsExorcismSuccess || 25,
  });

  const [settingsNotice, setSettingsNotice] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [previewPlayer, setPreviewPlayer] = useState<Player | null>(null);
  const [pointsLogPlayer, setPointsLogPlayer] = useState<Player | null>(null);
  const [isPointsLogOpen, setIsPointsLogOpen] = useState(false);

  // Edit player role & points modals
  const [editingRolePlayer, setEditingRolePlayer] = useState<Player | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<RoleType>('Mensch');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const [editingPointsPlayer, setEditingPointsPlayer] = useState<Player | null>(null);
  const [pointsDeltaInput, setPointsDeltaInput] = useState<string>('10');
  const [pointsReasonInput, setPointsReasonInput] = useState<string>('Spielleiter-Korrektur');
  const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);

  const handleSaveRole = async () => {
    if (!editingRolePlayer) return;
    setIsUpdatingRole(true);
    try {
      await gameApi.adminSetPlayerRole(adminCode, editingRolePlayer.id, selectedNewRole);
      if (onToast) onToast(`Rolle für ${editingRolePlayer.name} auf ${selectedNewRole} geändert!`, 'success');
      if (onRefreshState) await onRefreshState();
      setEditingRolePlayer(null);
    } catch (err: any) {
      if (onToast) onToast(err?.message || 'Fehler beim Ändern der Rolle', 'error');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleSavePoints = async () => {
    if (!editingPointsPlayer) return;
    const delta = parseInt(pointsDeltaInput, 10);
    if (isNaN(delta) || delta === 0) {
      if (onToast) onToast('Bitte gib eine gültige Punktezahl ein (z.B. 10 oder -5)', 'error');
      return;
    }
    setIsUpdatingPoints(true);
    try {
      await gameApi.adminAdjustPlayerPoints(adminCode, editingPointsPlayer.id, delta, pointsReasonInput);
      if (onToast) onToast(`Punkte für ${editingPointsPlayer.name} angepasst (${delta > 0 ? '+' : ''}${delta})!`, 'success');
      if (onRefreshState) await onRefreshState();
      setEditingPointsPlayer(null);
    } catch (err: any) {
      if (onToast) onToast(err?.message || 'Fehler beim Anpassen der Punkte', 'error');
    } finally {
      setIsUpdatingPoints(false);
    }
  };

  // Diashow State for Beamer
  const [isDiashowRunning, setIsDiashowRunning] = useState(false);
  const [isDiashowFullscreen, setIsDiashowFullscreen] = useState(false);
  const [isDiashowPaused, setIsDiashowPaused] = useState(false);
  const [diashowIndex, setDiashowIndex] = useState(0);

  // ZIP download state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  // Photos sorted newest first for smart preference
  const newestPhotosFirst = useMemo(() => {
    return [...photos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [photos]);

  // Sync settings when props change
  useEffect(() => {
    setFormData({
      adminCode: settings.adminCode || '1031',
      vampirePercent: settings.vampirePercent ?? 6,
      werewolfPercent: settings.werewolfPercent ?? 4,
      ghostPercent: settings.ghostPercent ?? 4,
      hunterPercent: settings.hunterPercent ?? 10,
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
      pendingDeathTimeoutMinutes: settings.pendingDeathTimeoutMinutes ?? 4,
      unconfirmedKillAction: settings.unconfirmedKillAction ?? 'revive',
      photoTaskIntervalMinutes: settings.photoTaskIntervalMinutes ?? 10,
      killConfirmationTimeoutMinutes: settings.killConfirmationTimeoutMinutes || 5,
      pointsPhotoTask: settings.pointsPhotoTask || 10,
      pointsSpecialTask: settings.pointsSpecialTask || 20,
      photoDownloadUnlocked: settings.photoDownloadUnlocked || 'ended',
      pointsEvilKill: settings.pointsEvilKill || 15,
      pointsExorcismSuccess: settings.pointsExorcismSuccess || 25,
    });
  }, [settings]);

  // Diashow rotation (alle 6 Sekunden, zeigt neue Fotos bevorzugt)
  useEffect(() => {
    if (!isDiashowRunning || photos.length === 0 || isDiashowPaused) return;

    const interval = setInterval(() => {
      setDiashowIndex((prevIdx) => {
        if (photos.length <= 1) return 0;
        // 60% Chance: wähle eines der neuesten Fotos (Top 3 oder Top 30%)
        const preferNew = Math.random() < 0.6;
        if (preferNew && photos.length > 2) {
          const topPoolSize = Math.max(2, Math.min(5, Math.ceil(photos.length * 0.3)));
          const randomNewIndex = Math.floor(Math.random() * topPoolSize);
          const targetPhoto = newestPhotosFirst[randomNewIndex];
          const foundIdx = photos.findIndex((p) => p.id === targetPhoto?.id);
          return foundIdx !== -1 ? foundIdx : (prevIdx + 1) % photos.length;
        }
        return (prevIdx + 1) % photos.length;
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [isDiashowRunning, photos, isDiashowPaused, newestPhotosFirst]);

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

  const activePlayers = useMemo(() => players.filter((p) => p.status !== 'entfernt'), [players]);

  // Ausstehende Tode (Pending Deaths)
  const pendingDeaths = useMemo(() => {
    return players.filter(
      (p) => p.status === 'pending_death' || p.status === 'tod_ausstehend'
    );
  }, [players]);

  const [liveNow, setLiveNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatPendingRemaining = (pendingAt?: string | null) => {
    if (!pendingAt) return '04:00';
    const startMs = new Date(pendingAt).getTime();
    const timeoutMin = formData.pendingDeathTimeoutMinutes || 4;
    const expiresMs = startMs + timeoutMin * 60 * 1000;
    const diffSec = Math.max(0, Math.floor((expiresMs - liveNow) / 1000));
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleAdminConfirmPending = async (victimId: string) => {
    if (onAdminConfirmPendingDeath) {
      await onAdminConfirmPendingDeath(victimId);
    } else {
      await gameApi.adminConfirmKill(adminCode, victimId);
    }
  };

  const handleAdminRevivePending = async (playerId: string) => {
    if (onAdminRevivePendingDeath) {
      await onAdminRevivePendingDeath(playerId);
    } else {
      await gameApi.adminRevivePlayer(adminCode, playerId);
    }
  };

  // Target distribution for current active player count
  const targetCounts = useMemo(() => {
    return calculateRoleDistribution(activePlayers.length, {
      vampirePercent: formData.vampirePercent,
      werewolfPercent: formData.werewolfPercent,
      ghostPercent: formData.ghostPercent,
      hunterPercent: formData.hunterPercent,
    });
  }, [activePlayers.length, formData.vampirePercent, formData.werewolfPercent, formData.ghostPercent, formData.hunterPercent]);

  // Actual role counts
  const actualRoleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Vampir: 0,
      Werwolf: 0,
      Geist: 0,
      Geisterjäger: 0,
      Mensch: 0,
      unassigned: 0,
      Unbekannt: 0,
    };
    for (const p of activePlayers) {
      const r = p.role || 'unassigned';
      counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
  }, [activePlayers]);

  // Human percent (Rest)
  const humanPercent = useMemo(() => {
    return Math.max(0, 100 - (formData.vampirePercent + formData.werewolfPercent + formData.ghostPercent + formData.hunterPercent));
  }, [formData.vampirePercent, formData.werewolfPercent, formData.ghostPercent, formData.hunterPercent]);

  // Simulations
  const sim100 = useMemo(() => {
    return calculateRoleDistribution(100, {
      vampirePercent: formData.vampirePercent,
      werewolfPercent: formData.werewolfPercent,
      ghostPercent: formData.ghostPercent,
      hunterPercent: formData.hunterPercent,
    });
  }, [formData.vampirePercent, formData.werewolfPercent, formData.ghostPercent, formData.hunterPercent]);

  const simCurrent = useMemo(() => {
    return calculateRoleDistribution(activePlayers.length, {
      vampirePercent: formData.vampirePercent,
      werewolfPercent: formData.werewolfPercent,
      ghostPercent: formData.ghostPercent,
      hunterPercent: formData.hunterPercent,
    });
  }, [activePlayers.length, formData.vampirePercent, formData.werewolfPercent, formData.ghostPercent, formData.hunterPercent]);

  const simCustom = useMemo(() => {
    return calculateRoleDistribution(simulatePlayerCount, {
      vampirePercent: formData.vampirePercent,
      werewolfPercent: formData.werewolfPercent,
      ghostPercent: formData.ghostPercent,
      hunterPercent: formData.hunterPercent,
    });
  }, [simulatePlayerCount, formData.vampirePercent, formData.werewolfPercent, formData.ghostPercent, formData.hunterPercent]);

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

  // Win condition metrics
  const winMetrics = useMemo(() => {
    const active = players.filter((p) => p.status !== 'entfernt' && !p.isTest);
    const good = active.filter((p) => p.team === 'Gut');
    const evil = active.filter((p) => p.team === 'Böse');
    const hunters = active.filter((p) => p.role === 'Geisterjäger');

    const livingGood = good.filter((p) => p.status === 'lebendig' || p.status === 'pending_death' || p.status === 'tod_ausstehend').length;
    const livingEvil = evil.filter((p) => p.status === 'lebendig' || p.status === 'pending_death' || p.status === 'tod_ausstehend').length;
    const livingHunters = hunters.filter((p) => p.status === 'lebendig' || p.status === 'pending_death' || p.status === 'tod_ausstehend').length;

    const deadGoodPct = good.length > 0 ? Math.round(((good.length - livingGood) / good.length) * 100) : 0;

    return {
      totalActive: active.length,
      livingGood,
      totalGood: good.length,
      livingEvil,
      totalEvil: evil.length,
      livingHunters,
      totalHunters: hunters.length,
      deadGoodPct,
    };
  }, [players]);

  const [isCheckingWin, setIsCheckingWin] = useState(false);
  const handleManualCheckWin = async () => {
    setIsCheckingWin(true);
    try {
      const res = await gameApi.checkWin('admin_manual');
      if (res?.winner) {
        if (onToast) onToast(`Siegbedingung erfüllt! Team ${res.winner} gewinnt (${res.end_reason})`, 'success');
      } else {
        if (onToast) onToast('Siegbedingungen geprüft: Spiel läuft weiter, noch kein Sieger.', 'success');
      }
      if (onRefreshState) await onRefreshState();
    } catch (err: any) {
      if (onToast) onToast(err?.message || 'Fehler beim Prüfen der Siegbedingungen', 'error');
    } finally {
      setIsCheckingWin(false);
    }
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
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 p-1 bg-zinc-950 rounded-2xl border border-zinc-800 text-[10px] font-bold text-center">
          <button
            type="button"
            onClick={() => setActiveTab('control')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'control' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Steuerung
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('players')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'players' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Gäste
          </button>
          <button
            type="button"
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
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'gallery' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Galerie
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'settings' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Optionen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('emergency')}
            className={`py-2 rounded-xl transition cursor-pointer relative ${
              activeTab === 'emergency' ? 'bg-rose-600 text-white font-black' : 'text-rose-400 hover:text-white'
            }`}
          >
            Notfall
            {pendingDeaths.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none animate-pulse">
                {pendingDeaths.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-2 rounded-xl transition cursor-pointer ${
              activeTab === 'logs' ? 'bg-[#ff6b00] text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Logs
          </button>
          <button
            type="button"
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

      {/* TICK GAME MONITOR CARD (ANFORDERUNG 4) */}
      <div
        className={`p-4 rounded-3xl border shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          tickSecondsAgo === null || tickSecondsAgo > 180
            ? 'bg-rose-950/40 border-rose-500/80 text-rose-200'
            : 'bg-zinc-900 border-zinc-800 text-zinc-200'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Clock
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              tickSecondsAgo === null || tickSecondsAgo > 180 ? 'text-rose-400 animate-pulse' : 'text-purple-400'
            }`}
          />
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs text-white">Automatischer Spiel-Ticker:</span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  tickSecondsAgo === null || tickSecondsAgo > 180
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}
              >
                {tickSecondsAgo !== null ? `vor ${tickSecondsAgo}s` : 'Nie gelaufen'}
              </span>
            </div>
            {tickSecondsAgo === null || tickSecondsAgo > 180 ? (
              <p className="text-[10px] text-rose-300 font-medium">
                Warnung: Länger als 3 Minuten nichts gelaufen! pg_cron in Supabase prüfen oder manuell ticken.
              </p>
            ) : (
              <p className="text-[10px] text-zinc-400">
                Prüft ausstehende Tode (4-Minuten-Frist), Fotoaufgaben-Slots und Vollmond-Ereignisse.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualTick}
          disabled={isTicking}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer shadow-md disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isTicking ? 'animate-spin' : ''}`} />
          <span>{isTicking ? 'Tickt...' : 'Tick jetzt ausführen'}</span>
        </button>
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
          {/* ROLLENVERTEILUNG: SOLL / IST TABELLE */}
          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#ff6b00]" />
                <div>
                  <h3 className="font-serif font-bold text-base text-white">Rollenverteilung (Soll / Ist)</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-400">
                      {activePlayers.length} aktive Spieler
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        actualRoleCounts.unassigned > 0
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      Spieler ohne Rolle: {actualRoleCounts.unassigned}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                Simulieren
              </button>
            </div>

            {/* Soll/Ist Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] uppercase font-bold text-zinc-400">
                    <th className="py-1.5 px-2">Rolle</th>
                    <th className="py-1.5 px-2 text-center">Team / Ziel</th>
                    <th className="py-1.5 px-2 text-center">Soll</th>
                    <th className="py-1.5 px-2 text-center">Ist</th>
                    <th className="py-1.5 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-medium">
                  {/* Vampir */}
                  <tr className="hover:bg-zinc-800/30">
                    <td className="py-2 px-2 flex items-center gap-1.5">
                      <span className="text-sm">🧛</span>
                      <span className="text-rose-300 font-bold">Vampir</span>
                    </td>
                    <td className="py-2 px-2 text-center text-[11px] text-rose-400 font-mono">
                      Böse ({formData.vampirePercent}%)
                    </td>
                    <td className="py-2 px-2 text-center font-bold font-mono text-zinc-200">
                      {targetCounts.Vampir}
                    </td>
                    <td className="py-2 px-2 text-center font-black font-mono text-white">
                      {actualRoleCounts.Vampir}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[11px]">
                      {actualRoleCounts.Vampir === targetCounts.Vampir ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> Passt
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          {actualRoleCounts.Vampir - targetCounts.Vampir > 0 ? `+${actualRoleCounts.Vampir - targetCounts.Vampir}` : `${actualRoleCounts.Vampir - targetCounts.Vampir}`}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Werwolf */}
                  <tr className="hover:bg-zinc-800/30">
                    <td className="py-2 px-2 flex items-center gap-1.5">
                      <span className="text-sm">🐺</span>
                      <span className="text-amber-300 font-bold">Werwolf</span>
                    </td>
                    <td className="py-2 px-2 text-center text-[11px] text-amber-400 font-mono">
                      Böse ({formData.werewolfPercent}%)
                    </td>
                    <td className="py-2 px-2 text-center font-bold font-mono text-zinc-200">
                      {targetCounts.Werwolf}
                    </td>
                    <td className="py-2 px-2 text-center font-black font-mono text-white">
                      {actualRoleCounts.Werwolf}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[11px]">
                      {actualRoleCounts.Werwolf === targetCounts.Werwolf ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> Passt
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          {actualRoleCounts.Werwolf - targetCounts.Werwolf > 0 ? `+${actualRoleCounts.Werwolf - targetCounts.Werwolf}` : `${actualRoleCounts.Werwolf - targetCounts.Werwolf}`}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Geist */}
                  <tr className="hover:bg-zinc-800/30">
                    <td className="py-2 px-2 flex items-center gap-1.5">
                      <span className="text-sm">👻</span>
                      <span className="text-purple-300 font-bold">Geist</span>
                    </td>
                    <td className="py-2 px-2 text-center text-[11px] text-purple-400 font-mono">
                      Böse ({formData.ghostPercent}%)
                    </td>
                    <td className="py-2 px-2 text-center font-bold font-mono text-zinc-200">
                      {targetCounts.Geist}
                    </td>
                    <td className="py-2 px-2 text-center font-black font-mono text-white">
                      {actualRoleCounts.Geist}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[11px]">
                      {actualRoleCounts.Geist === targetCounts.Geist ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> Passt
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          {actualRoleCounts.Geist - targetCounts.Geist > 0 ? `+${actualRoleCounts.Geist - targetCounts.Geist}` : `${actualRoleCounts.Geist - targetCounts.Geist}`}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Geisterjäger */}
                  <tr className="hover:bg-zinc-800/30">
                    <td className="py-2 px-2 flex items-center gap-1.5">
                      <span className="text-sm">🏹</span>
                      <span className="text-blue-300 font-bold">Geisterjäger</span>
                    </td>
                    <td className="py-2 px-2 text-center text-[11px] text-blue-400 font-mono">
                      Gut ({formData.hunterPercent}%)
                    </td>
                    <td className="py-2 px-2 text-center font-bold font-mono text-zinc-200">
                      {targetCounts.Geisterjäger}
                    </td>
                    <td className="py-2 px-2 text-center font-black font-mono text-white">
                      {actualRoleCounts.Geisterjäger}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[11px]">
                      {actualRoleCounts.Geisterjäger === targetCounts.Geisterjäger ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> Passt
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          {actualRoleCounts.Geisterjäger - targetCounts.Geisterjäger > 0 ? `+${actualRoleCounts.Geisterjäger - targetCounts.Geisterjäger}` : `${actualRoleCounts.Geisterjäger - targetCounts.Geisterjäger}`}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Mensch */}
                  <tr className="hover:bg-zinc-800/30">
                    <td className="py-2 px-2 flex items-center gap-1.5">
                      <span className="text-sm">👤</span>
                      <span className="text-zinc-200 font-bold">Mensch</span>
                    </td>
                    <td className="py-2 px-2 text-center text-[11px] text-zinc-400 font-mono">
                      Gut ({humanPercent}%)
                    </td>
                    <td className="py-2 px-2 text-center font-bold font-mono text-zinc-200">
                      {targetCounts.Mensch}
                    </td>
                    <td className="py-2 px-2 text-center font-black font-mono text-white">
                      {actualRoleCounts.Mensch}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-[11px]">
                      {actualRoleCounts.Mensch === targetCounts.Mensch ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Check className="w-3.5 h-3.5" /> Passt
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          {actualRoleCounts.Mensch - targetCounts.Mensch > 0 ? `+${actualRoleCounts.Mensch - targetCounts.Mensch}` : `${actualRoleCounts.Mensch - targetCounts.Mensch}`}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Unassigned row if any */}
                  {actualRoleCounts.unassigned > 0 && (
                    <tr className="bg-amber-950/20 text-amber-300">
                      <td className="py-2 px-2 flex items-center gap-1.5">
                        <span className="text-sm">⏳</span>
                        <span className="font-bold">Noch ohne Rolle</span>
                      </td>
                      <td className="py-2 px-2 text-center text-[11px] text-amber-400/80 font-mono">
                        Lobby / Beitritt
                      </td>
                      <td className="py-2 px-2 text-center font-bold font-mono text-zinc-400">-</td>
                      <td className="py-2 px-2 text-center font-black font-mono text-amber-400">
                        {actualRoleCounts.unassigned}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[11px] text-amber-400 font-bold">
                        Offen
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Reassign & Missing Roles Buttons */}
            <div className="pt-2 border-t border-zinc-800 flex flex-col sm:flex-row gap-2">
              {actualRoleCounts.unassigned > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await gameApi.assignMissingRoles(adminCode);
                      if (onToast) onToast(res.message, 'success');
                      if (onRefreshState) await onRefreshState();
                    } catch (e: any) {
                      if (onToast) onToast(e.message || 'Fehler beim Zuweisen', 'error');
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition active:scale-95"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Fehlende Rollen vergeben ({actualRoleCounts.unassigned})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (gameStatus === 'Läuft') {
                    setIsReassignModalOpen(true);
                  } else {
                    if (confirm(`Möchtest du die Rollen für alle ${activePlayers.length} Spieler jetzt neu verteilen?`)) {
                      onReassignRoles();
                    }
                  }
                }}
                disabled={activePlayers.length === 0}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition ${
                  actualRoleCounts.unassigned > 0 ? 'sm:w-auto' : 'w-full'
                } ${
                  gameStatus === 'Läuft'
                    ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-600 text-rose-200'
                    : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Rollen neu würfeln</span>
                {gameStatus === 'Läuft' && <span className="text-[10px] text-rose-400 font-normal">(Warnung)</span>}
              </button>
            </div>
          </div>

          {/* AUSSTEHENDE TODE (PENDING DEATHS) */}
          <div className="p-5 rounded-3xl bg-zinc-900 border-2 border-rose-500/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 animate-pulse">
                  <Skull className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="font-bold text-white text-sm">Ausstehende Tode ({pendingDeaths.length})</h4>
                  <p className="text-[11px] text-zinc-400">
                    Opfer warten auf Täter-Bestätigung (Frist: {formData.pendingDeathTimeoutMinutes || 4} Min)
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono text-xs font-bold">
                {pendingDeaths.length} offen
              </span>
            </div>

            {pendingDeaths.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-2">Aktuell keine ausstehenden Tode vorhanden.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {pendingDeaths.map((p) => {
                  const remaining = formatPendingRemaining(p.pendingDeathAt);
                  return (
                    <div
                      key={p.id}
                      className="p-3 rounded-2xl bg-zinc-950 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={p.photoUrl || '/placeholder.png'}
                          alt={p.name}
                          className="w-12 h-12 rounded-xl object-cover border border-zinc-700 shrink-0"
                        />
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            <span>{p.name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-[10px] text-zinc-300 font-mono">
                              {p.role}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400">
                            Kostüm: <span className="text-zinc-200">{p.costumeName}</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Restzeit: {remaining}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAdminConfirmPending(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-sm transition active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Kill bestätigen
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdminRevivePending(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-sm transition active:scale-95"
                        >
                          <HeartPulse className="w-3.5 h-3.5" />
                          Wiederbeleben
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SIEGBEDINGUNGEN & METRIKEN (LIVE) */}
          <div className="p-5 rounded-3xl bg-zinc-900 border-2 border-purple-500/40 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                  <Award className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="font-bold text-white text-sm">Siegbedingungen (Live-Monitor)</h4>
                  <p className="text-[11px] text-zinc-400">Automatische Prüfung nach jedem Kill & Ticker</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleManualCheckWin}
                disabled={isCheckingWin || gameStatus !== 'Läuft'}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow transition active:scale-95"
              >
                <CheckCircle2 className={`w-3.5 h-3.5 ${isCheckingWin ? 'animate-spin' : ''}`} />
                <span>{isCheckingWin ? 'Prüft...' : 'Jetzt prüfen'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
              <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block uppercase font-bold">Böse lebend</span>
                <span className={`font-mono font-black text-base ${winMetrics.livingEvil === 0 && winMetrics.totalEvil > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {winMetrics.livingEvil} / {winMetrics.totalEvil}
                </span>
                <span className="text-[9px] text-zinc-500 block">Sieg Gut bei 0</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-blue-400 block uppercase font-bold">Jäger lebend</span>
                <span className={`font-mono font-black text-base ${winMetrics.livingHunters === 0 && winMetrics.totalHunters > 0 ? 'text-rose-400' : 'text-blue-300'}`}>
                  {winMetrics.livingHunters} / {winMetrics.totalHunters}
                </span>
                <span className="text-[9px] text-zinc-500 block">Sieg Böse bei 0</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-emerald-400 block uppercase font-bold">Gute lebend</span>
                <span className="font-mono font-black text-base text-emerald-300">
                  {winMetrics.livingGood} / {winMetrics.totalGood}
                </span>
                <span className="text-[9px] text-zinc-500 block">Unschuldige</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-amber-400 block uppercase font-bold">Tote Gute %</span>
                <span className={`font-mono font-black text-base ${winMetrics.deadGoodPct >= 75 ? 'text-rose-400 font-black animate-pulse' : 'text-amber-300'}`}>
                  {winMetrics.deadGoodPct}%
                </span>
                <span className="text-[9px] text-zinc-500 block">Sieg Böse ab &gt;75%</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h3 className="font-serif font-bold text-base text-white">Spielsteuerung & Timer</h3>

            {/* TICK MONITOR */}
            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${tickSecondsAgo !== null && tickSecondsAgo > 180 ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
                <span className="text-zinc-400">pg_cron Hintergrund-Tick:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={tickSecondsAgo !== null && tickSecondsAgo > 180 ? 'text-rose-400 font-bold' : 'text-emerald-300 font-bold'}>
                  {tickSecondsAgo !== null ? `vor ${tickSecondsAgo}s` : 'Warte auf ersten Tick...'}
                </span>
                <button
                  type="button"
                  onClick={handleManualTick}
                  disabled={isTicking}
                  className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-sans flex items-center gap-1 cursor-pointer"
                  title="Manuell tick_game() ausführen"
                >
                  <RotateCcw className={`w-3 h-3 ${isTicking ? 'animate-spin' : ''}`} />
                  Jetzt ticken
                </button>
              </div>
            </div>

            {tickSecondsAgo !== null && tickSecondsAgo > 180 && gameStatus === 'Läuft' && (
              <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-500/50 text-amber-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Warnung: Letzter Tick vor über 3 Minuten! Prüfe pg_cron oder klicke oben auf &quot;Jetzt ticken&quot;.</span>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              {gameStatus === 'Beendet' ? (
                <>
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/80 to-zinc-950 border border-purple-500/60 text-center space-y-1.5 shadow-lg">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 block">
                      Status: Spiel beendet
                    </span>
                    <p className="text-xs text-zinc-300">
                      Das Spiel befindet sich im Endzustand. Alle Daten (Punkte, Kills, Aufgaben) bleiben erhalten.
                    </p>
                  </div>

                  {onReopenGame && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm('Möchtest du das Spiel wieder öffnen? Der Status wechselt zurück auf "Läuft", alle bestehenden Punkte, Rollen und Kills bleiben unverändert erhalten.')) {
                          await onReopenGame();
                        }
                      }}
                      className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Spiel wieder öffnen (Status: Läuft)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsRestartModalOpen(true)}
                    className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Neustart...</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('emergency')}
                    className="w-full py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-600/50 text-rose-300 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Alles zurücksetzen (Notfall-Panel)</span>
                  </button>
                </>
              ) : (
                <>
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
                    onClick={handleConfirmEndGame}
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
                    onClick={handleConfirmAbortGame}
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
                </>
              )}
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
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-zinc-400 font-mono font-bold">
                        {p.points} Pkt • {p.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPointsLogPlayer(p);
                          setIsPointsLogOpen(true);
                        }}
                        className="px-2 py-0.5 rounded-md bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-300 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                        title="Detaillierte Punkte-Historie anzeigen"
                      >
                        <Award className="w-2.5 h-2.5 text-amber-400" />
                        Log
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRolePlayer(p);
                          setSelectedNewRole(p.role && p.role !== 'unassigned' && p.role !== 'Unbekannt' ? p.role : 'Mensch');
                        }}
                        className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-[10px] font-bold cursor-pointer transition"
                        title="Rolle manuell anpassen"
                      >
                        Rolle ändern
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPointsPlayer(p);
                          setPointsDeltaInput('10');
                          setPointsReasonInput('Spielleiter-Korrektur');
                        }}
                        className="px-2 py-0.5 rounded-md bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 text-[10px] font-bold cursor-pointer transition"
                        title="Punkte manuell anpassen (+/-)"
                      >
                        +/- Pkt
                      </button>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="font-bold text-white text-sm">Party-Galerie ({photos.length})</h3>
              <p className="text-[11px] text-zinc-400">Fotos verwalten, Diashow projizieren oder ZIP herunterladen</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (photos.length === 0) return;
                  setIsZipping(true);
                  setZipProgress({ current: 0, total: photos.length });
                  try {
                    await downloadPhotosAsZip(
                      photos.map((p) => ({
                        id: p.id,
                        photoUrl: p.photoUrl,
                        photographerName: p.photographerName,
                        taskTitle: p.caption,
                        createdAt: p.createdAt,
                      })),
                      'Halloween_Party_Alle_Fotos.zip',
                      (current, total) => setZipProgress({ current, total })
                    );
                  } catch (err: any) {
                    alert('Fehler beim Erstellen der ZIP-Datei: ' + err?.message);
                  } finally {
                    setIsZipping(false);
                    setZipProgress(null);
                  }
                }}
                disabled={isZipping || photos.length === 0}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Alle Fotos als ZIP herunterladen"
              >
                {isZipping ? <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" /> : <Archive className="w-3.5 h-3.5 text-purple-400" />}
                <span>{isZipping ? `${zipProgress?.current}/${zipProgress?.total}` : `ZIP (${photos.length})`}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsDiashowRunning(true);
                  setIsDiashowFullscreen(true);
                  setIsDiashowPaused(false);
                }}
                disabled={photos.length === 0}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-purple-950/50 disabled:opacity-40"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Beamer-Diashow (Vollbild)</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Beamer-Diashow Overlay */}
          {isDiashowFullscreen && photos.length > 0 && (
            <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-4 sm:p-8 select-none animate-in fade-in">
              {/* Top controls */}
              <div className="w-full max-w-5xl mx-auto flex items-center justify-between text-zinc-400">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-purple-950 border border-purple-500/50 text-purple-300 font-bold text-xs tracking-wider uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    Beamer-Diashow
                  </span>
                  <span className="text-xs font-mono text-zinc-300">
                    Foto {diashowIndex + 1} von {photos.length}
                  </span>
                  <span className="text-[11px] text-zinc-500 hidden sm:inline">
                    (wechselt alle 6s • bevorzugt neue Fotos)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDiashowPaused(!isDiashowPaused)}
                    className="p-2.5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 text-white cursor-pointer transition border border-zinc-800"
                    title={isDiashowPaused ? 'Fortsetzen' : 'Pausieren'}
                  >
                    {isDiashowPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDiashowFullscreen(false);
                      setIsDiashowRunning(false);
                    }}
                    className="p-2.5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 text-white cursor-pointer transition border border-zinc-800"
                    title="Vollbild beenden"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Main Photo with prev/next arrows */}
              <div className="relative flex-1 w-full max-w-5xl mx-auto flex items-center justify-center my-3">
                <button
                  type="button"
                  onClick={() => setDiashowIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))}
                  className="absolute left-2 z-10 p-3 rounded-full bg-black/60 hover:bg-purple-600 text-white backdrop-blur-md transition cursor-pointer"
                  title="Vorheriges Bild"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>

                <img
                  src={photos[diashowIndex]?.photoUrl}
                  alt="Diashow"
                  className="max-h-[75vh] max-w-full rounded-2xl object-contain shadow-2xl border border-zinc-800"
                />

                <button
                  type="button"
                  onClick={() => setDiashowIndex((prev) => (prev + 1) % photos.length)}
                  className="absolute right-2 z-10 p-3 rounded-full bg-black/60 hover:bg-purple-600 text-white backdrop-blur-md transition cursor-pointer"
                  title="Nächstes Bild"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>

              {/* Bottom Card (Task, Photographer, Time - NO ROLES!) */}
              <div className="w-full max-w-2xl mx-auto p-4 rounded-3xl bg-zinc-950/90 border border-zinc-800 text-center space-y-1">
                <h4 className="text-base font-bold text-white">
                  {photos[diashowIndex]?.caption || 'Party-Aufgabe'}
                </h4>
                <div className="flex items-center justify-center gap-4 text-xs text-zinc-400">
                  <span className="text-purple-300 font-medium">
                    Fotograf: {photos[diashowIndex]?.photographerName || 'Gast'}
                  </span>
                  {photos[diashowIndex]?.createdAt && (
                    <span className="font-mono text-zinc-400">
                      {new Date(photos[diashowIndex].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Uhr
                    </span>
                  )}
                </div>
              </div>
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

          {/* Rollen-Zielanteile in Prozent */}
          <div className="pt-2 border-t border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                Rollen-Zielanteile (%)
              </span>
              <button
                type="button"
                onClick={() => setIsSimulateModalOpen(true)}
                className="text-[10px] text-purple-400 hover:text-purple-300 font-bold underline flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3" />
                Verteilung simulieren
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">🧛 Vampir-Anteil (%):</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={formData.vampirePercent}
                  onChange={(e) => setFormData({ ...formData, vampirePercent: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">🐺 Werwolf-Anteil (%):</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={formData.werewolfPercent}
                  onChange={(e) => setFormData({ ...formData, werewolfPercent: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">👻 Geist-Anteil (%):</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={formData.ghostPercent}
                  onChange={(e) => setFormData({ ...formData, ghostPercent: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">🏹 Geisterjäger (%):</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={formData.hunterPercent}
                  onChange={(e) => setFormData({ ...formData, hunterPercent: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>
            </div>

            {/* Calculated Human Rest & Warning */}
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                humanPercent < 40
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>
                <span className="font-bold">👤 Mensch-Anteil (Rest):</span>{' '}
                <span className="font-mono font-bold text-white text-sm">{humanPercent}%</span>
              </div>
              {humanPercent < 40 && (
                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Mindestens 40% empfohlen!
                </span>
              )}
            </div>
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

          {/* Neuer Kill-Ablauf & Fristen */}
          <div className="pt-2 border-t border-zinc-800 space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-400 block">
              Neuer Kill-Ablauf & Fristen
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Ausstehender Tod Frist (Min):</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={formData.pendingDeathTimeoutMinutes}
                  onChange={(e) => setFormData({ ...formData, pendingDeathTimeoutMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Ablauf ohne Bestätigung:</label>
                <select
                  value={formData.unconfirmedKillAction || 'revive'}
                  onChange={(e) => setFormData({ ...formData, unconfirmedKillAction: e.target.value as 'revive' | 'stay_dead' })}
                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold text-xs"
                >
                  <option value="revive">Wiederbeleben (Standard)</option>
                  <option value="stay_dead">Als tot lassen</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400">
              Wenn ein Opfer sich meldet, hat der Täter {formData.pendingDeathTimeoutMinutes} Minuten Zeit. Danach wird der Spieler entweder automatisch wiederbelebt oder scheidet als tot aus.
            </p>
          </div>

          {/* Foto-Aufgaben Intervall */}
          <div className="pt-2 border-t border-zinc-800 space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#ff6b00] block">
              Foto-Aufgaben Intervall
            </span>
            <div className="text-xs">
              <label className="block text-[11px] text-zinc-400 mb-1">Neue Foto-Aufgabe alle (Minuten, 5-15):</label>
              <input
                type="number"
                min="5"
                max="15"
                value={formData.photoTaskIntervalMinutes}
                onChange={(e) => setFormData({ ...formData, photoTaskIntervalMinutes: Number(e.target.value) })}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-white font-bold"
              />
            </div>
            <p className="text-[10px] text-zinc-400">
              Alle {formData.photoTaskIntervalMinutes} Minuten erhält jeder lebende Spieler automatisch eine neue Foto-Aufgabe (max. 3 gleichzeitig offen, Verfall nach 30 Minuten).
            </p>
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

      {/* ======================================================== */}
      {/* TAB 7: NOTFALL- & WARTUNGS-PANEL (ANFORDERUNG 5 & 7)      */}
      {/* ======================================================== */}
      {activeTab === 'emergency' && (
        <EmergencyPanel
          adminCode={adminCode}
          players={players}
          onRefreshState={onRefreshState || (async () => {})}
          onToast={onToast}
        />
      )}

      {/* ======================================================== */}
      {/* TAB 8: FEHLER- & TICK-LOGS (ANFORDERUNG 2 & 4)            */}
      {/* ======================================================== */}
      {activeTab === 'logs' && (
        <LogsPanel adminCode={adminCode} />
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

      {/* REASSIGN CONFIRMATION MODAL (Warning in running game) */}
      {isReassignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border-2 border-rose-600 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-white text-base">Achtung: Spiel läuft!</h3>
                <p className="text-[11px] text-rose-300">Rollen im laufenden Spiel neu verteilen</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Möchtest du die Rollen für alle <strong>{activePlayers.length} Spieler</strong> wirklich neu verteilen?
              Alle aktuellen Rollen werden überschrieben und den Spielern sofort neu zugewiesen.
            </p>

            <div className="space-y-2 pt-1">
              <button
                disabled={isReassigning}
                onClick={async () => {
                  setIsReassigning(true);
                  try {
                    await onReassignRoles();
                    setIsReassignModalOpen(false);
                  } finally {
                    setIsReassigning(false);
                  }
                }}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-950 cursor-pointer transition"
              >
                {isReassigning ? 'Verteile neu...' : 'Ja, Rollen jetzt neu verteilen'}
              </button>
              <button
                disabled={isReassigning}
                onClick={() => setIsReassignModalOpen(false)}
                className="w-full py-2.5 text-zinc-400 hover:text-white text-xs cursor-pointer"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIMULATE MODAL */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-white text-base">Rollenverteilung simulieren</h3>
                  <p className="text-[10px] text-zinc-400">Reine Browser-Berechnung, keine Datenänderung</p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="p-1.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TABELLE 1: 100 SPIELER (REFERENZ) */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Referenz: 100 Spieler
                </span>
                <span className="text-[10px] font-mono text-purple-400 font-bold">100% Verteilung</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-rose-400 block font-bold">🧛 Vampir</span>
                  <span className="font-mono font-bold text-white">{sim100.Vampir}</span>
                  <span className="text-[9px] text-zinc-400 block">{formData.vampirePercent}%</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-amber-400 block font-bold">🐺 Werwolf</span>
                  <span className="font-mono font-bold text-white">{sim100.Werwolf}</span>
                  <span className="text-[9px] text-zinc-400 block">{formData.werewolfPercent}%</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-purple-400 block font-bold">👻 Geist</span>
                  <span className="font-mono font-bold text-white">{sim100.Geist}</span>
                  <span className="text-[9px] text-zinc-400 block">{formData.ghostPercent}%</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-blue-400 block font-bold">🏹 Jäger</span>
                  <span className="font-mono font-bold text-white">{sim100.Geisterjäger}</span>
                  <span className="text-[9px] text-zinc-400 block">{formData.hunterPercent}%</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-300 block font-bold">👤 Mensch</span>
                  <span className="font-mono font-bold text-white">{sim100.Mensch}</span>
                  <span className="text-[9px] text-zinc-400 block">{humanPercent}%</span>
                </div>
              </div>
            </div>

            {/* TABELLE 2: AKTUELLE SPIELERZAHL */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Aktuelle Spieleranzahl ({activePlayers.length} Spieler)
                </span>
                <span className="text-[10px] text-zinc-400">Ist vs. Soll</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-rose-400 block font-bold">🧛 Vampir</span>
                  <span className="font-mono font-bold text-white">{simCurrent.Vampir}</span>
                  <span className="text-[9px] text-zinc-500 block">Ist: {actualRoleCounts.Vampir}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-amber-400 block font-bold">🐺 Werwolf</span>
                  <span className="font-mono font-bold text-white">{simCurrent.Werwolf}</span>
                  <span className="text-[9px] text-zinc-500 block">Ist: {actualRoleCounts.Werwolf}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-purple-400 block font-bold">👻 Geist</span>
                  <span className="font-mono font-bold text-white">{simCurrent.Geist}</span>
                  <span className="text-[9px] text-zinc-500 block">Ist: {actualRoleCounts.Geist}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-blue-400 block font-bold">🏹 Jäger</span>
                  <span className="font-mono font-bold text-white">{simCurrent.Geisterjäger}</span>
                  <span className="text-[9px] text-zinc-500 block">Ist: {actualRoleCounts.Geisterjäger}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span className="text-[10px] text-zinc-300 block font-bold">👤 Mensch</span>
                  <span className="font-mono font-bold text-white">{simCurrent.Mensch}</span>
                  <span className="text-[9px] text-zinc-500 block">Ist: {actualRoleCounts.Mensch}</span>
                </div>
              </div>
            </div>

            {/* INTERAKTIVER SIMULATOR */}
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Beliebige Spielerzahl testen
                </span>
                <span className="font-mono font-black text-sm text-[#ff6b00]">
                  {simulatePlayerCount} Spieler
                </span>
              </div>

              <input
                type="range"
                min="2"
                max="150"
                value={simulatePlayerCount}
                onChange={(e) => setSimulatePlayerCount(Number(e.target.value))}
                className="w-full accent-[#ff6b00] cursor-pointer"
              />

              <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
                <div className="p-2 rounded-xl bg-zinc-950 border border-rose-500/20">
                  <span className="text-[10px] text-rose-400 block font-bold">Vampir</span>
                  <span className="font-mono font-bold text-white text-sm">{simCustom.Vampir}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-amber-500/20">
                  <span className="text-[10px] text-amber-400 block font-bold">Werwolf</span>
                  <span className="font-mono font-bold text-white text-sm">{simCustom.Werwolf}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-purple-500/20">
                  <span className="text-[10px] text-purple-400 block font-bold">Geist</span>
                  <span className="font-mono font-bold text-white text-sm">{simCustom.Geist}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-blue-500/20">
                  <span className="text-[10px] text-blue-400 block font-bold">Jäger</span>
                  <span className="font-mono font-bold text-white text-sm">{simCustom.Geisterjäger}</span>
                </div>
                <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-700">
                  <span className="text-[10px] text-zinc-300 block font-bold">Mensch</span>
                  <span className="font-mono font-bold text-white text-sm">{simCustom.Mensch}</span>
                </div>
              </div>
            </div>

            {/* REGEL-ERLÄUTERUNG */}
            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 space-y-1 leading-relaxed">
              <span className="font-bold text-zinc-200 block text-xs">Hinterlegte Verteilungsregeln:</span>
              <p>• <strong>2 Spieler:</strong> 1 Vampir, 1 Geisterjäger</p>
              <p>• <strong>3 Spieler:</strong> 1 Vampir, 1 Geisterjäger, 1 Mensch</p>
              <p>• <strong>4 Spieler:</strong> 1 Vampir, 1 Werwolf, 1 Geisterjäger, 1 Mensch</p>
              <p>• <strong>5 Spieler:</strong> 1 Vampir, 1 Werwolf, 1 Geist, 1 Geisterjäger, 1 Mensch</p>
              <p>• <strong>ab 6 Spielern:</strong> Prozentrechnung mit Mindestanzahl 1 pro Sonderrolle. Menschen machen nie weniger als 40% aus.</p>
            </div>

            <button
              type="button"
              onClick={() => setIsSimulateModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* POINTS LOG MODAL */}
      <PointsLogModal
        isOpen={isPointsLogOpen}
        onClose={() => {
          setIsPointsLogOpen(false);
          setPointsLogPlayer(null);
        }}
        player={pointsLogPlayer}
      />

      {/* EDIT PLAYER ROLE MODAL */}
      {editingRolePlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-white text-base">Rolle manuell ändern</h3>
              <button
                type="button"
                onClick={() => setEditingRolePlayer(null)}
                className="p-1 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Spieler: <strong className="text-white">{editingRolePlayer.name}</strong> ({editingRolePlayer.costumeName})
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Neue Rolle auswählen:
              </label>
              <select
                value={selectedNewRole}
                onChange={(e) => setSelectedNewRole(e.target.value as RoleType)}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-bold text-xs"
              >
                <option value="Mensch">Mensch (Team Gut)</option>
                <option value="Geisterjäger">Geisterjäger (Team Gut)</option>
                <option value="Vampir">Vampir (Team Böse)</option>
                <option value="Werwolf">Werwolf (Team Böse)</option>
                <option value="Geist">Geist (Team Böse)</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRolePlayer(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSaveRole}
                disabled={isUpdatingRole}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                {isUpdatingRole && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Speichern</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PLAYER POINTS MODAL */}
      {editingPointsPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-white text-base">Punkte anpassen</h3>
              <button
                type="button"
                onClick={() => setEditingPointsPlayer(null)}
                className="p-1 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Spieler: <strong className="text-white">{editingPointsPlayer.name}</strong> • Aktuell: <strong className="text-[#ff6b00]">{editingPointsPlayer.points} Pkt</strong>
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Punkte-Änderung (+/-):
              </label>
              <input
                type="number"
                value={pointsDeltaInput}
                onChange={(e) => setPointsDeltaInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-mono font-bold text-sm"
                placeholder="z.B. 10 oder -5"
              />
              <span className="text-[10px] text-zinc-500 block">
                Tipp: Positive Zahl für Gutschrift (z.B. 10), negative Zahl für Abzug (z.B. -10).
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Grund / Notiz:
              </label>
              <input
                type="text"
                value={pointsReasonInput}
                onChange={(e) => setPointsReasonInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-xs"
                placeholder="z.B. Bonus-Kostüm oder Regelverstoß"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPointsPlayer(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSavePoints}
                disabled={isUpdatingPoints}
                className="flex-1 py-2.5 rounded-xl bg-[#ff6b00] hover:bg-[#ff7b1a] text-zinc-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                {isUpdatingPoints && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Punkte buchen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
