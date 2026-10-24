import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Skull, Clock, HeartPulse, RefreshCw, Shield, AlertTriangle, Lock, UserCheck } from 'lucide-react';
import { Player } from '../../types/game';
import { gameApi } from '../../utils/api';

interface PendingDeathScreenProps {
  player: Player;
  timeoutMinutes?: number;
  onRefreshState: () => Promise<void>;
  onRequestAdminUnlock?: () => void;
  isAdminUnlocked?: boolean;
}

export const PendingDeathScreen: React.FC<PendingDeathScreenProps> = ({
  player,
  timeoutMinutes = 4,
  onRefreshState,
  onRequestAdminUnlock,
  isAdminUnlocked,
}) => {
  // Server-time offset in ms: serverTime = Date.now() + serverOffsetMs
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(timeoutMinutes * 60);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasTriggeredExpire, setHasTriggeredExpire] = useState(false);
  const [isEmergencyRecovering, setIsEmergencyRecovering] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Measure server time drift
  useEffect(() => {
    let isMounted = true;
    gameApi.getServerNow().then((serverNowIso) => {
      if (!isMounted || !serverNowIso) return;
      const serverMs = new Date(serverNowIso).getTime();
      const localMs = Date.now();
      setServerOffsetMs(serverMs - localMs);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Update countdown using adjusted server time
  useEffect(() => {
    const updateCountdown = () => {
      if (!player.pendingDeathAt) {
        setSecondsLeft(timeoutMinutes * 60);
        return;
      }

      const startMs = new Date(player.pendingDeathAt).getTime();
      const expiresMs = startMs + timeoutMinutes * 60 * 1000;
      const currentServerMs = Date.now() + serverOffsetMs;
      const diffSec = Math.floor((expiresMs - currentServerMs) / 1000);

      setSecondsLeft(Math.max(0, diffSec));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [player.pendingDeathAt, timeoutMinutes, serverOffsetMs]);

  // Handle automatic expiration RPC when seconds reach 0
  const triggerExpire = useCallback(async () => {
    if (hasTriggeredExpire) return;
    setHasTriggeredExpire(true);
    try {
      await gameApi.expirePendingDeaths();
      await onRefreshState();
    } catch (err: any) {
      console.warn('expirePendingDeaths failed:', err);
    }
  }, [hasTriggeredExpire, onRefreshState]);

  useEffect(() => {
    if (secondsLeft === 0 && !hasTriggeredExpire) {
      triggerExpire();
    }
  }, [secondsLeft, hasTriggeredExpire, triggerExpire]);

  // Manual refresh status
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setActionMessage(null);
    try {
      if (secondsLeft === 0) {
        await gameApi.expirePendingDeaths();
      }
      await onRefreshState();
      setActionMessage('Status erfolgreich abgefragt.');
    } catch (err: any) {
      setActionMessage(err?.message || 'Fehler beim Aktualisieren');
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  // Emergency rescue: "Ich bin noch im Spiel" (available when expired >= 30s)
  const handleEmergencyRescue = async () => {
    setIsEmergencyRecovering(true);
    setActionMessage(null);
    try {
      const res = await gameApi.expirePendingDeaths();
      await onRefreshState();
      setActionMessage(res?.message || 'Status wurde geprüft und korrigiert!');
    } catch (err: any) {
      setActionMessage(err?.message || 'Fehler beim Korrigieren des Status');
    } finally {
      setIsEmergencyRecovering(false);
    }
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Check if expired for more than 30 seconds
  const startMs = player.pendingDeathAt ? new Date(player.pendingDeathAt).getTime() : Date.now();
  const expiresMs = startMs + timeoutMinutes * 60 * 1000;
  const currentServerMs = Date.now() + serverOffsetMs;
  const isOverdue30s = currentServerMs - expiresMs > 30 * 1000;

  return (
    <div className="min-h-screen z-50 flex flex-col items-center justify-between p-4 sm:p-6 bg-black/95 text-center select-none backdrop-blur-xl animate-in fade-in duration-300 relative">
      {/* Background glowing effects */}
      <div className="absolute w-72 h-72 rounded-full bg-rose-600/10 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute w-48 h-48 rounded-full bg-amber-600/10 blur-2xl pointer-events-none" />

      {/* Top utility bar: Escape to Admin if unlocked or request pin */}
      <div className="w-full max-w-sm flex items-center justify-between z-10 pt-2">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          {player.name} ({player.costumeName || 'Gast'})
        </span>

        {onRequestAdminUnlock && (
          <button
            type="button"
            onClick={onRequestAdminUnlock}
            className="px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-[10px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Spielleiter-Menü öffnen"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <span>Admin</span>
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950/90 border-2 border-rose-500/80 p-6 shadow-2xl shadow-rose-950/80 space-y-4 my-auto z-10">
        {/* Animated skull icon */}
        <div className="relative mx-auto w-16 h-16 rounded-3xl bg-rose-950/80 border-2 border-rose-500/80 flex items-center justify-center text-rose-500 shadow-xl shadow-rose-950/60 animate-bounce">
          <Skull className="w-9 h-9" />
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
          </span>
        </div>

        {/* Title & Status */}
        <div className="space-y-1">
          <span className="inline-block px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-500/40">
            Angriff gemeldet • Tod ausstehend
          </span>
          <h2 className="text-xl font-serif font-black text-white tracking-wide">
            Warte auf Bestätigung durch den Täter
          </h2>
          <p className="text-[11px] text-zinc-300 leading-relaxed px-1">
            Du wurdest am Arm oder an der Schulter berührt. Dein Angreifer (Vampir, Werwolf oder Geist) muss den Kill jetzt auf seinem Smartphone bestätigen.
          </p>
        </div>

        {/* Countdown display */}
        <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3 text-rose-400 animate-spin" />
            Restzeit für Bestätigung:
          </span>
          <div className="text-3xl font-mono font-black text-rose-400 tracking-wider">
            {formattedTime}
          </div>
          <span className="text-[10px] text-zinc-400 block">
            {secondsLeft > 0 ? 'Minuten : Sekunden' : 'Frist abgelaufen – Prüfung läuft...'}
          </span>
        </div>

        {/* Reassurance note */}
        <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed text-left flex gap-2">
          <HeartPulse className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Automatische Rettung:</strong> Bestätigt kein Täter innerhalb der {timeoutMinutes} Minuten, wirst du automatisch wiederbelebt und kannst weiterspielen!
          </span>
        </div>

        {actionMessage && (
          <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] text-emerald-300 animate-in fade-in">
            {actionMessage}
          </div>
        )}

        {/* Action Buttons: Status neu laden & Emergency Button */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#ff6b00]' : 'text-zinc-400'}`} />
            <span>{isRefreshing ? 'Prüfe Status...' : 'Status neu laden'}</span>
          </button>

          {/* Notfall-Button "Ich bin noch im Spiel" (nach Ablauf der Frist) */}
          {(secondsLeft === 0 || isOverdue30s) && (
            <button
              type="button"
              onClick={handleEmergencyRescue}
              disabled={isEmergencyRecovering}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-zinc-950 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 shadow-lg shadow-emerald-950 animate-in zoom-in-95"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isEmergencyRecovering ? 'Wiederbeleben...' : 'Frist vorbei: Ich bin noch im Spiel!'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer reassurance */}
      <div className="w-full max-w-sm py-2 text-[10px] text-zinc-500 z-10">
        Geschützt vor weiteren Angriffen während des Wartens.
      </div>
    </div>
  );
};
