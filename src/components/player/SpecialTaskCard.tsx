import React, { useState } from 'react';
import {
  Sparkles,
  HelpCircle,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Eye,
  Camera,
  Loader2
} from 'lucide-react';
import { SpecialTaskAssignment, RoleType } from '../../types/game';

interface SpecialTaskCardProps {
  specialTask: SpecialTaskAssignment;
  onComplete: (userAnswer?: number, scannedQrCode?: string) => Promise<{
    rewardPlayerName: string;
    rewardRole: RoleType;
  }>;
}

export const SpecialTaskCard: React.FC<SpecialTaskCardProps> = ({
  specialTask,
  onComplete,
}) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [qrInput, setQrInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [revealedResult, setRevealedResult] = useState<{ name: string; role: RoleType } | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await onComplete(
        selectedOption !== null ? selectedOption : undefined,
        qrInput ? qrInput : undefined
      );
      setRevealedResult({ name: res.rewardPlayerName, role: res.rewardRole });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fehler beim Lösen der Spezialaufgabe');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-950/60 via-purple-950/40 to-zinc-950 border-2 border-amber-500/60 shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400">
            <Sparkles className="w-4 h-4" />
          </span>
          <span className="text-xs font-black uppercase tracking-wider text-amber-400">
            Exklusive Spezialaufgabe (Mensch)
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold font-mono">
          +{specialTask.points} Pkt + Geheimnis
        </span>
      </div>

      <div>
        <h4 className="font-bold text-white text-sm">{specialTask.title}</h4>
        <p className="text-xs text-zinc-300 mt-1">{specialTask.description}</p>
      </div>

      {revealedResult ? (
        <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 space-y-2 text-center animate-in zoom-in-95">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Aufgabe erfolgreich gelöst!
          </div>
          <div className="text-sm text-zinc-200">
            Du hast ein geheimes Wissen erlangt:
          </div>
          <div className="p-2.5 rounded-xl bg-black/60 border border-emerald-500/40">
            <span className="font-serif font-black text-white text-base">
              {revealedResult.name}
            </span>
            <span className="mx-2 text-zinc-500">•</span>
            <span className="font-bold text-amber-300">
              Rolle: {revealedResult.role}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {/* QUIZ FORM */}
          {specialTask.type === 'quiz' && specialTask.quizData && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-200 bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/20">
                {specialTask.quizData.question}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {specialTask.quizData.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedOption(idx)}
                    className={`text-left p-2.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                      selectedOption === idx
                        ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                        : 'bg-zinc-900/80 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* QR CODE INPUT */}
          {specialTask.type === 'qr_code' && (
            <div className="space-y-2">
              <label className="text-[11px] text-zinc-400 block">
                Finde den versteckten QR-Code auf der Party und gib den Code ein:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Z.B. SPOOKY-2026"
                  className="flex-1 bg-black/60 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-amber-400 outline-none uppercase"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errorMsg}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (specialTask.type === 'quiz' && selectedOption === null) || (specialTask.type === 'qr_code' && !qrInput.trim())}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-zinc-950 font-black text-xs shadow-md shadow-amber-950 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            Lösung prüfen & Rolle aufdecken
          </button>
        </div>
      )}
    </div>
  );
};
