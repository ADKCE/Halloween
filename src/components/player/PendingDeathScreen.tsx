import React, { useState, useEffect } from 'react';
import { Skull, Clock, HeartPulse, AlertCircle, Shield } from 'lucide-react';
import { Player } from '../../types/game';

interface PendingDeathScreenProps {
  player: Player;
  timeoutMinutes?: number;
}

export const PendingDeathScreen: React.FC<PendingDeathScreenProps> = ({
  player,
  timeoutMinutes = 4,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(timeoutMinutes * 60);

  useEffect(() => {
    const updateCountdown = () => {
      if (!player.pendingDeathAt) {
        setSecondsLeft(timeoutMinutes * 60);
        return;
      }

      const startMs = new Date(player.pendingDeathAt).getTime();
      const expiresMs = startMs + timeoutMinutes * 60 * 1000;
      const diffSec = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setSecondsLeft(diffSec);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [player.pendingDeathAt, timeoutMinutes]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/95 text-center select-none backdrop-blur-xl animate-in fade-in duration-300">
      {/* Background glowing effects */}
      <div className="absolute w-72 h-72 rounded-full bg-rose-600/10 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute w-48 h-48 rounded-full bg-amber-600/10 blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950/90 border-2 border-rose-500/80 p-6 shadow-2xl shadow-rose-950/80 space-y-5">
        {/* Animated skull icon */}
        <div className="relative mx-auto w-20 h-20 rounded-3xl bg-rose-950/80 border-2 border-rose-500/80 flex items-center justify-center text-rose-500 shadow-xl shadow-rose-950/60 animate-bounce">
          <Skull className="w-10 h-10" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
          </span>
        </div>

        {/* Title & Status */}
        <div className="space-y-1.5">
          <span className="inline-block px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-[11px] font-black uppercase tracking-widest border border-rose-500/40">
            Angriff gemeldet • Tod ausstehend
          </span>
          <h2 className="text-2xl font-serif font-black text-white tracking-wide">
            Warte auf Bestätigung durch den Täter
          </h2>
          <p className="text-xs text-zinc-300 leading-relaxed px-2">
            Du wurdest am Arm oder an der Schulter berührt. Dein Angreifer (Vampir, Werwolf oder Geist) muss den Kill nun auf seinem Smartphone bestätigen.
          </p>
        </div>

        {/* Countdown display */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-rose-400 animate-spin" />
            Restzeit für Bestätigung:
          </span>
          <div className="text-4xl font-mono font-black text-rose-400 tracking-wider">
            {formattedTime}
          </div>
          <span className="text-[11px] text-zinc-400 block pt-1">
            Minuten : Sekunden
          </span>
        </div>

        {/* Reassurance note */}
        <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed text-left flex gap-2">
          <HeartPulse className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Automatische Rettung:</strong> Falls kein Täter den Kill innerhalb von 4 Minuten bestätigt, wirst du automatisch wiederbelebt und kannst sofort normal weiterspielen!
          </span>
        </div>

        <div className="text-[10px] text-zinc-500">
          Während dieses Zustands bist du vor weiteren Angriffen und Aufgaben geschützt.
        </div>
      </div>
    </div>
  );
};
