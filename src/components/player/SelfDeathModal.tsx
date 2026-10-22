import React, { useState } from 'react';
import { Skull, AlertTriangle, Loader2, CheckCircle2, X } from 'lucide-react';
import { RoleType } from '../../types/game';

interface SelfDeathModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  onConfirmDeath: (killerRole: string) => Promise<void>;
}

const KILLER_ROLE_OPTIONS = [
  { id: 'Vampir', label: 'Vampir', emoji: '🧛', desc: 'Berührung an Schulter/Arm & Geflüster' },
  { id: 'Werwolf', label: 'Werwolf', emoji: '🐺', desc: 'Angriff bei Vollmond' },
  { id: 'Geist', label: 'Geist', emoji: '👻', desc: 'Allein im Raum berührt' },
  { id: 'Geisterjäger', label: 'Geisterjäger', emoji: '🏹', desc: 'Exorzismus erhalten' },
  { id: 'Unbekannt', label: 'Weiß nicht / Unbekannt', emoji: '❓', desc: 'Täter hat Rolle nicht genannt' },
];

export const SelfDeathModal: React.FC<SelfDeathModalProps> = ({
  isOpen,
  onClose,
  playerName,
  onConfirmDeath,
}) => {
  const [selectedRole, setSelectedRole] = useState<string>('Unbekannt');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirmDeath(selectedRole);
      onClose();
    } catch (err: any) {
      console.error('Fehler bei Selbstmeldung als tot:', err);
      setErrorMessage(err?.message || 'Fehler beim Markieren als tot. Bitte erneut versuchen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border-2 border-rose-600/80 p-5 text-center shadow-2xl shadow-rose-950/80 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Top Icon */}
        <div className="flex justify-between items-start">
          <div className="w-8" />
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/80 border border-rose-500/60 flex items-center justify-center text-rose-500 animate-pulse">
            <Skull className="w-8 h-8" />
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Heading */}
        <div className="space-y-1">
          <span className="inline-block px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-wider">
            Sicherheitsabfrage
          </span>
          <h3 className="text-xl font-serif font-black text-white">
            Wurdest du gerade getötet?
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Hast du eine Berührung am Arm oder an der Schulter mit dem Geflüster erhalten? Dein Status wechselt zu <strong className="text-rose-400">"Tod ausstehend"</strong>, und du wartest bis zu 4 Minuten auf die Bestätigung durch den Täter.
          </p>
        </div>

        {/* Warning & Admin hint */}
        <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300 text-left space-y-1">
          <p>
            ⏱️ <strong>4 Minuten Frist:</strong> Bestätigt der Täter den Kill in dieser Zeit nicht, wirst du automatisch wiederbelebt und bleibst im Spiel!
          </p>
          <p className="text-zinc-400 text-[10px]">
            Während der Wartezeit kannst du keine Aktionen ausführen und bist vor weiteren Angriffen geschützt.
          </p>
        </div>

        {/* Error Notice */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-950/90 border border-rose-500 text-rose-200 text-xs text-left flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">Fehler:</span>
              <span className="break-words text-[11px]">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-sm shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              <>
                <Skull className="w-4 h-4" />
                Ja, ich wurde getötet
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-bold text-xs transition cursor-pointer"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
};
