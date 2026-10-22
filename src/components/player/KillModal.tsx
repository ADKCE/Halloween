import React, { useState, useEffect } from 'react';
import {
  Skull,
  Search,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Clock,
  Sparkles,
  ShieldAlert,
  Moon,
  Ghost,
  Users
} from 'lucide-react';
import { Player, RoleType } from '../../types/game';

interface KillModalProps {
  isOpen: boolean;
  onClose: () => void;
  killer: Player;
  potentialVictims: Player[];
  pendingVictims: Player[];
  isFullMoonActive: boolean;
  timeoutMinutes?: number;
  onConfirmKill: (victimId: string, ghostSoloConfirmed?: boolean) => Promise<{ message: string; cooldownUntil?: string }>;
  onExorcise: (targetId: string) => Promise<{
    hit: boolean;
    victimName: string;
    victimRole: RoleType;
    message: string;
    cooldownMinutes: number;
  }>;
}

export const KillModal: React.FC<KillModalProps> = ({
  isOpen,
  onClose,
  killer,
  potentialVictims,
  pendingVictims,
  isFullMoonActive,
  timeoutMinutes = 4,
  onConfirmKill,
  onExorcise,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [ghostSoloConfirmed, setGhostSoloConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Live timer for pending victims countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const isHunter = killer.role === 'Geisterjäger';
  const isGhost = killer.role === 'Geist';
  const isWerewolf = killer.role === 'Werwolf';

  // For Hunter: pick from living players
  // For Evil (Vampir, Werwolf, Geist): pick ONLY from pendingVictims (status === 'pending_death')
  const victimsPool = isHunter ? potentialVictims : pendingVictims;

  const filteredVictims = victimsPool.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.costumeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedTarget = victimsPool.find((p) => p.id === selectedTargetId);

  const formatRemaining = (pendingAt?: string | null) => {
    if (!pendingAt) return '4:00';
    const startMs = new Date(pendingAt).getTime();
    const expiresMs = startMs + timeoutMinutes * 60 * 1000;
    const diffSec = Math.max(0, Math.floor((expiresMs - now) / 1000));
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    if (!selectedTargetId) return;

    if (isGhost && !ghostSoloConfirmed) {
      setFeedback({ type: 'error', msg: 'Als Geist musst du bestätigen, dass du mit dem Opfer allein im Raum warst!' });
      return;
    }

    if (isWerewolf && !isFullMoonActive) {
      setFeedback({ type: 'error', msg: 'Werwölfe können nur bei Vollmond töten!' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (isHunter) {
        const result = await onExorcise(selectedTargetId);
        setFeedback({
          type: result.hit ? 'success' : 'error',
          msg: result.message,
        });
        setTimeout(() => {
          onClose();
        }, 3000);
      } else {
        const result = await onConfirmKill(selectedTargetId, ghostSoloConfirmed);
        setFeedback({
          type: 'success',
          msg: result.message,
        });
        setTimeout(() => {
          onClose();
        }, 2500);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        msg: err?.message || 'Aktion fehlgeschlagen',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`p-2 rounded-xl ${
                isHunter
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-rose-500/20 text-rose-500'
              }`}
            >
              {isHunter ? <ShieldAlert className="w-5 h-5" /> : <Skull className="w-5 h-5" />}
            </span>
            <div>
              <h3 className="font-bold text-white text-sm">
                {isHunter ? 'Exorzismus durchführen' : 'Ich habe jemanden getötet'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {isHunter
                  ? 'Entlarve einen Bösen (Treffer = tot, Fehlschuss = 30 Min Sperre)'
                  : 'Wähle dein Opfer aus der Liste der ausstehenden Tode'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white bg-zinc-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reminder whisper rule */}
        {!isHunter && (
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-1">
            <p className="font-bold text-white">So funktioniert der Kill-Ablauf:</p>
            <p className="text-zinc-400">
              Berühre das Opfer am Arm oder an der Schulter und flüstere:{' '}
              <span className="italic text-rose-400 font-medium">
                "Du wurdest von einem {killer.role} getötet."
              </span><br />
              Das Opfer tippt auf <strong>"Ich wurde getötet"</strong> und erscheint hier zur Bestätigung.
            </p>
          </div>
        )}

        {/* Werewolf full moon check */}
        {isWerewolf && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              isFullMoonActive
                ? 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
                : 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
            }`}
          >
            <Moon className="w-4 h-4 shrink-0" />
            <span>
              {isFullMoonActive
                ? '🌕 Vollmond ist AKTIV! Du kannst jetzt zuschlagen.'
                : '🌑 Kein Vollmond aktiv! Werwölfe dürfen nur bei Vollmond töten.'}
            </span>
          </div>
        )}

        {/* Victim Selection / Pending Deaths List */}
        {!isHunter && pendingVictims.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-500">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Keine ausstehenden Tode</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Aktuell hat sich noch kein Opfer über seinen Button gemeldet. Berühre dein Opfer und bitte es, in seiner App auf <strong>"Ich wurde getötet"</strong> zu tippen.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 flex-1 flex flex-col min-h-0">
            {victimsPool.length > 5 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Opfer suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-rose-500"
                />
              </div>
            )}

            <div className="text-[11px] font-bold text-zinc-400 flex justify-between items-center px-1">
              <span>{isHunter ? 'Mögliche Ziele:' : 'Ausstehende Opfer (berührt):'}</span>
              <span>{filteredVictims.length} verfügbar</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-60 pr-1">
              {filteredVictims.map((vic) => {
                const isSelected = selectedTargetId === vic.id;
                const timeLeft = formatRemaining(vic.pendingDeathAt);

                return (
                  <div
                    key={vic.id}
                    onClick={() => setSelectedTargetId(vic.id)}
                    className={`p-2.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? isHunter
                          ? 'bg-blue-950/60 border-blue-500 shadow-md shadow-blue-950/50'
                          : 'bg-rose-950/60 border-rose-500 shadow-md shadow-rose-950/50'
                        : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={vic.photoUrl || 'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=150&q=80'}
                        alt={vic.name}
                        className="w-11 h-11 rounded-xl object-cover border border-zinc-700 shrink-0"
                      />
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-1.5">
                          {vic.name}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Kostüm: <span className="text-zinc-200">{vic.costumeName || 'Unbekannt'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {!isHunter && (
                        <div className="text-[11px] font-mono text-amber-400 font-bold flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{timeLeft}</span>
                        </div>
                      )}
                      <div
                        className={`w-5 h-5 mt-1 rounded-full border flex items-center justify-center ml-auto ${
                          isSelected
                            ? isHunter
                              ? 'bg-blue-500 border-blue-400 text-white'
                              : 'bg-rose-500 border-rose-400 text-white'
                            : 'border-zinc-700'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Geist solo check rule */}
        {isGhost && selectedTargetId && (
          <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-zinc-900/90 border border-purple-500/40 cursor-pointer">
            <input
              type="checkbox"
              checked={ghostSoloConfirmed}
              onChange={(e) => setGhostSoloConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-zinc-700 text-purple-600 focus:ring-purple-500"
            />
            <div className="text-xs text-zinc-300">
              <span className="font-bold text-white block">Pflicht-Regel für Geister:</span>
              <span>Ich war mit dem Opfer allein im Raum.</span>
            </div>
          </label>
        )}

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300'
                : 'bg-rose-950/80 border border-rose-500/60 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleSubmit}
          disabled={!selectedTargetId || isSubmitting || (isWerewolf && !isFullMoonActive)}
          className={`w-full py-3.5 rounded-2xl font-black text-sm tracking-wide shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
            isHunter
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40'
              : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-950/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {isHunter ? <ShieldAlert className="w-4 h-4" /> : <Skull className="w-4 h-4" />}
              <span>
                {isHunter
                  ? `Exorzismus an ${selectedTarget?.name || 'Ziel'} ausführen`
                  : `Kill an ${selectedTarget?.name || 'Opfer'} bestätigen (+15 Pkt.)`}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
