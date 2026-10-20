import React, { useEffect, useState } from 'react';
import { Moon, AlertCircle } from 'lucide-react';
import { FullMoonEvent } from '../../types/game';

interface FullMoonBannerProps {
  activeFullMoon: FullMoonEvent | null;
  isWerewolf: boolean;
  onMoonEnd?: () => void;
}

export const FullMoonBanner: React.FC<FullMoonBannerProps> = ({
  activeFullMoon,
  isWerewolf,
  onMoonEnd,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!activeFullMoon) {
      setSecondsLeft(0);
      return;
    }

    // Trigger werewolf vibration if supported
    if (isWerewolf && typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 400]);
      } catch {}
    }

    const updateTimer = () => {
      const now = Date.now();
      const end = new Date(activeFullMoon.endsAt).getTime();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setSecondsLeft(diff);
      if (diff === 0 && onMoonEnd) {
        onMoonEnd();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeFullMoon, isWerewolf, onMoonEnd]);

  if (!activeFullMoon || secondsLeft <= 0) return null;

  const min = Math.floor(secondsLeft / 60);
  const sec = secondsLeft % 60;
  const timeFormatted = `${min}:${sec < 10 ? '0' : ''}${sec}`;

  return (
    <div className="w-full bg-gradient-to-r from-indigo-950 via-purple-900 to-indigo-950 border-y-2 border-amber-400/80 p-3 shadow-xl shadow-purple-950/80 text-white animate-pulse">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-amber-400 text-zinc-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/50">
            <Moon className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-black text-sm tracking-wide text-amber-300">
                VOLLMOND IST AKTIV!
              </span>
              <span className="text-[10px] bg-red-600 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Gefahr
              </span>
            </div>
            <p className="text-[11px] text-zinc-200">
              {isWerewolf
                ? '🐺 Werwölfe können JETZT töten! (Cooldown: 2 Min)'
                : 'Werwölfe streifen umher! Sei auf der Hut.'}
            </p>
          </div>
        </div>

        <div className="shrink-0 font-mono font-black text-lg bg-black/60 px-3 py-1 rounded-xl border border-amber-400/50 text-amber-300">
          {timeFormatted}
        </div>
      </div>
    </div>
  );
};
