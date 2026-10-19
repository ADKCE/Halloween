import React, { useState } from 'react';
import { KeyRound, Shield, X, AlertCircle } from 'lucide-react';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (code: string) => Promise<boolean>;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({ isOpen, onClose, onVerify }) => {
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setErrorMsg('');
    setIsVerifying(true);
    try {
      const isValid = await onVerify(code.trim());
      if (isValid) {
        setCode('');
        onClose();
      } else {
        setErrorMsg('Falscher Admin-Code (Standard: 1031)');
      }
    } catch {
      setErrorMsg('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-xs bg-zinc-900 border-2 border-purple-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-purple-400 font-serif font-bold text-sm">
            <Shield className="w-4 h-4" />
            Admin-Freischaltung
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-zinc-400">
            Bitte gib den geheimen 4-stelligen Admin-Code ein (Standard: <strong>1031</strong>).
          </p>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-[11px] text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              required
              placeholder="Admin-Code eingeben..."
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-700 text-center font-mono text-xl tracking-widest text-white focus:outline-none focus:border-[#ff6b00]"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-400"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isVerifying || !code.trim()}
              className="flex-1 py-3 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs uppercase shadow-lg shadow-purple-950 cursor-pointer"
            >
              Entsperren
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
