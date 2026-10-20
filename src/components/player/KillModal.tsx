import React, { useState } from 'react';
import {
  Skull,
  Search,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Clock,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { Player, RoleType } from '../../types/game';

interface KillModalProps {
  isOpen: boolean;
  onClose: () => void;
  killer: Player;
  potentialVictims: Player[];
  isFullMoonActive: boolean;
  onReportKill: (victimId: string, ghostSoloConfirmed?: boolean) => Promise<{ message: string; cooldownUntil: string }>;
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
  isFullMoonActive,
  onReportKill,
  onExorcise,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [ghostSoloConfirmed, setGhostSoloConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  if (!isOpen) return null;

  const isHunter = killer.role === 'Geisterjäger';
  const isGhost = killer.role === 'Geist';
  const isWerewolf = killer.role === 'Werwolf';

  const filteredVictims = potentialVictims.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.costumeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedTarget = potentialVictims.find((p) => p.id === selectedTargetId);

  const handleSubmit = async () => {
    if (!selectedTargetId) return;

    if (isGhost && !ghostSoloConfirmed) {
      setFeedback({ type: 'error', msg: 'Als Geist musst du bestätigen, dass du mit dem Opfer allein warst!' });
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
        const result = await onReportKill(selectedTargetId, ghostSoloConfirmed);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
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
                {isHunter ? 'Exorzismus durchführen' : 'Kill / Biss melden'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {isHunter
                  ? 'Entlarve einen Bösen (Treffer = tot, Fehlschuss = 30 Min Sperre)'
                  : 'Wähle dein Opfer per Namen oder Kostüm aus'}
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
        <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 space-y-1">
          <p className="font-bold text-white">Regel zur Erinnerung:</p>
          <p className="text-zinc-400">
            Berühre das Opfer kurz an Arm/Schulter und flüstere: <br />
            <span className="italic text-rose-400 font-medium">
              "Du wurdest von einem {killer.role} getötet."
            </span>
          </p>
        </div>

        {/* Search & Victim Select */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Opfer suchen (Name oder Kostüm)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-rose-500"
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl bg-zinc-900/60 p-1.5 border border-zinc-800">
            {filteredVictims.length === 0 ? (
              <p className="text-[11px] text-zinc-500 text-center py-4">
                Keine lebenden Opfer gefunden
              </p>
            ) : (
              filteredVictims.map((p) => {
                const isSelected = selectedTargetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedTargetId(p.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition cursor-pointer ${
                      isSelected
                        ? isHunter
                          ? 'bg-blue-500/20 border border-blue-500 text-white'
                          : 'bg-rose-500/20 border border-rose-500 text-white'
                        : 'bg-zinc-900 text-zinc-300 border border-transparent hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={p.photoUrl || '/placeholder.png'}
                        alt={p.name}
                        className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                      />
                      <div>
                        <div className="text-xs font-bold leading-tight">{p.name}</div>
                        <div className="text-[10px] text-zinc-400">{p.costumeName}</div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                        isSelected
                          ? isHunter
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'bg-rose-500 border-rose-500 text-white'
                          : 'border-zinc-700 bg-zinc-950'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* GHOST SPECIFIC REQUIREMENT */}
        {isGhost && (
          <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200 cursor-pointer">
            <input
              type="checkbox"
              checked={ghostSoloConfirmed}
              onChange={(e) => setGhostSoloConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-purple-400 text-purple-600 focus:ring-0"
            />
            <div>
              <span className="font-bold text-white block">Pflicht für Geister:</span>
              Ich war mit dem Opfer allein im Raum / Bereich (keine Zeugen).
            </div>
          </label>
        )}

        {/* FEEDBACK */}
        {feedback && (
          <div
            className={`p-3 rounded-2xl border text-xs font-medium space-y-1 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500 text-rose-300'
            }`}
          >
            <p className="font-bold">{feedback.msg}</p>
          </div>
        )}

        {/* SUBMIT BUTTON */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !selectedTargetId || (isGhost && !ghostSoloConfirmed)}
          className={`w-full py-3.5 rounded-2xl font-black text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50 ${
            isHunter
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-950'
              : 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-rose-950'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verarbeite...
            </>
          ) : isHunter ? (
            <>
              <ShieldAlert className="w-4 h-4" />
              {selectedTarget ? `${selectedTarget.name} exorzieren!` : 'Ziel exorzieren'}
            </>
          ) : (
            <>
              <Skull className="w-4 h-4" />
              {selectedTarget ? `Kill an ${selectedTarget.name} melden` : 'Kill melden'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
