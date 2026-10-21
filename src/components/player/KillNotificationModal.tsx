import React, { useState } from 'react';
import { Skull, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { KillRecord } from '../../types/game';

interface KillNotificationModalProps {
  pendingKill: KillRecord;
  onConfirm: () => Promise<void>;
}

export const KillNotificationModal: React.FC<KillNotificationModalProps> = ({
  pendingKill,
  onConfirm,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsConfirming(true);
    setErrorMessage(null);
    try {
      await onConfirm();
      setConfirmed(true);
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e?.message || 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border-2 border-rose-600/80 p-6 text-center shadow-2xl shadow-rose-950/80 space-y-5">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-950/60 border-2 border-rose-500 flex items-center justify-center text-rose-500 animate-bounce">
          <Skull className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-wider">
            Angriff gemeldet!
          </span>
          <h2 className="text-2xl font-serif font-black text-white">
            Du wurdest getötet!
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Ein Mitspieler hat einen Kill an dir gemeldet. Bitte bestätige den Biss/Angriff:
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
          <p>
            Hinweis: Nach der Bestätigung trittst du ins <span className="text-purple-400 font-bold">Totenreich</span> ein.
            Du kannst weiterhin als Zuschauer im Spiel bleiben und Aufgaben im Totenreich lösen!
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-950/90 border border-rose-500 text-rose-200 text-xs text-left flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Fehler beim Bestätigen:</span>
              <span className="text-[11px] break-words">{errorMessage}</span>
            </div>
          </div>
        )}

        {confirmed ? (
          <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Tod bestätigt. Willkommen im Totenreich!
          </div>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-base shadow-lg shadow-rose-900/50 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Bestätige...
              </>
            ) : (
              <>
                <Skull className="w-5 h-5" />
                Ich wurde getötet
              </>
            )}
          </button>
        )}

        <p className="text-[10px] text-zinc-500">
          Wird dieser Angriff nicht innerhalb von 5 Minuten bestätigt, gilt er automatisch als vollstreckt.
        </p>
      </div>
    </div>
  );
};
