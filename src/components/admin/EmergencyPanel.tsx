import React, { useState } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  HeartPulse,
  Wrench,
  ZapOff,
  Trash2,
  CheckCircle2,
  X,
  Loader2,
  UserCheck
} from 'lucide-react';
import { Player, PlayerStatus } from '../../types/game';
import { gameApi } from '../../utils/api';

interface EmergencyPanelProps {
  adminCode: string;
  players: Player[];
  onRefreshState: () => Promise<void>;
  onToast?: (msg: string, type: 'success' | 'error') => void;
}

export const EmergencyPanel: React.FC<EmergencyPanelProps> = ({
  adminCode,
  players,
  onRefreshState,
  onToast,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<PlayerStatus>('lebendig');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [isClearingDeaths, setIsClearingDeaths] = useState(false);
  const [isRepairingState, setIsRepairingState] = useState(false);
  const [isResettingCooldowns, setIsResettingCooldowns] = useState(false);

  // Full reset modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isExecutingReset, setIsExecutingReset] = useState(false);

  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    if (onToast) onToast(text, type);
    setTimeout(() => setFeedback(null), 4000);
  };

  // 1. Alle ausstehenden Tode zurücksetzen
  const handleClearPendingDeaths = async () => {
    if (!confirm('Möchtest du wirklich alle ausstehenden Tode abbrechen und diese Spieler wieder auf "lebendig" setzen?')) return;
    setIsClearingDeaths(true);
    try {
      const res = await gameApi.adminClearPendingDeaths(adminCode);
      await onRefreshState();
      showFeedback(res.message);
    } catch (err: any) {
      showFeedback(err?.message || 'Fehler beim Zurücksetzen der ausstehenden Tode', 'error');
    } finally {
      setIsClearingDeaths(false);
    }
  };

  // 2. Spieler-Status manuell setzen
  const handleSetPlayerStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayerId) {
      showFeedback('Bitte wähle einen Spieler aus!', 'error');
      return;
    }

    setIsUpdatingStatus(true);
    try {
      await gameApi.adminSetPlayerStatus(adminCode, selectedPlayerId, targetStatus);
      await onRefreshState();
      const p = players.find((pl) => pl.id === selectedPlayerId);
      showFeedback(`Status von ${p?.name || 'Spieler'} auf "${targetStatus}" gesetzt.`);
    } catch (err: any) {
      showFeedback(err?.message || 'Fehler beim Setzen des Status', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // 3. Spielstatus reparieren
  const handleRepairGameState = async () => {
    setIsRepairingState(true);
    try {
      const res = await gameApi.adminRepairGameState(adminCode);
      await onRefreshState();
      showFeedback(res.message);
    } catch (err: any) {
      showFeedback(err?.message || 'Fehler beim Reparieren des Spielstatus', 'error');
    } finally {
      setIsRepairingState(false);
    }
  };

  // 4. Cooldowns aller Spieler zurücksetzen
  const handleResetAllCooldowns = async () => {
    if (!confirm('Alle Abklingzeiten (Vampir, Geist, Jäger, Werwolf) für sämtliche Spieler auf 0 zurücksetzen?')) return;
    setIsResettingCooldowns(true);
    try {
      await gameApi.adminResetAllCooldowns(adminCode);
      await onRefreshState();
      showFeedback('Alle Cooldowns erfolgreich aufgehoben!');
    } catch (err: any) {
      showFeedback(err?.message || 'Fehler beim Zurücksetzen der Cooldowns', 'error');
    } finally {
      setIsResettingCooldowns(false);
    }
  };

  // 5. Komplett-Reset aller Spielerdaten
  const handleExecuteFullReset = async () => {
    if (confirmInput.trim() !== 'RESET') {
      showFeedback('Bitte tippe exakt "RESET" ein, um zu bestätigen!', 'error');
      return;
    }

    setIsExecutingReset(true);
    try {
      const res = await gameApi.resetGameFull(adminCode);
      setIsResetModalOpen(false);
      setConfirmInput('');
      await onRefreshState();
      showFeedback(res.message);
    } catch (err: any) {
      showFeedback(err?.message || 'Fehler beim Komplett-Reset', 'error');
    } finally {
      setIsExecutingReset(false);
    }
  };

  const activePlayers = players.filter((p) => p.status !== 'entfernt');

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Header Card */}
      <div className="p-4 rounded-3xl bg-rose-950/40 border-2 border-rose-500/60 shadow-xl space-y-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-serif font-black text-white text-base">Notfall- & Wartungs-Panel</h3>
            <p className="text-[11px] text-zinc-400">
              Direkte Eingriffe bei Hängern, Verbindungsabbrüchen oder falschen Zuständen
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 shadow-lg animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-500 text-emerald-200'
              : 'bg-rose-950/80 border border-rose-500 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{feedback.text}</span>
        </div>
      )}

      {/* QUICK EMERGENCY ACTIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* A. Alle ausstehenden Tode zurücksetzen */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <HeartPulse className="w-4 h-4 text-emerald-400" />
              <span>Ausstehende Tode abbrechen</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Setzt alle Spieler im Status "Tod ausstehend" sofort wieder auf "lebendig" und beendet deren Warte-Screen.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearPendingDeaths}
            disabled={isClearingDeaths}
            className="w-full py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-98 shadow-sm"
          >
            {isClearingDeaths ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            <span>Alle ausstehenden Tode aufheben</span>
          </button>
        </div>

        {/* B. Cooldowns aller Spieler zurücksetzen */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <ZapOff className="w-4 h-4 text-amber-400" />
              <span>Alle Cooldowns aufheben</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Löscht alle Kill- und Exorzismus-Sperrzeiten bei sämtlichen Spielern auf 0.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetAllCooldowns}
            disabled={isResettingCooldowns}
            className="w-full py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-98 shadow-sm"
          >
            {isResettingCooldowns ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            <span>Alle Cooldowns zurücksetzen</span>
          </button>
        </div>

        {/* C. Spielstatus reparieren */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <Wrench className="w-4 h-4 text-blue-400" />
              <span>Spielstatus reparieren</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Stellt sicher, dass der Datensatz in <code>game_state</code> existiert, konsistent ist und aktualisiert wird.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRepairGameState}
            disabled={isRepairingState}
            className="w-full py-2.5 rounded-2xl bg-zinc-950 hover:bg-zinc-800 border border-blue-500/40 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-98 shadow-sm"
          >
            {isRepairingState ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            <span>Spielstatus reparieren</span>
          </button>
        </div>
      </div>

      {/* D. Spieler-Status manuell setzen */}
      <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex items-center gap-2 text-white font-bold text-xs">
          <UserCheck className="w-4 h-4 text-[#ff6b00]" />
          <span>Spieler-Status manuell korrigieren</span>
        </div>

        <form onSubmit={handleSetPlayerStatus} className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
              Spieler auswählen:
            </label>
            <select
              value={selectedPlayerId}
              onChange={(e) => {
                setSelectedPlayerId(e.target.value);
                const pl = players.find((p) => p.id === e.target.value);
                if (pl) setTargetStatus(pl.status);
              }}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white outline-none focus:border-[#ff6b00]"
            >
              <option value="">-- Spieler auswählen ({activePlayers.length}) --</option>
              {activePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role || 'unassigned'}) • Status: {p.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
              Neuer Status:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
              {(['lebendig', 'tot', 'pending_death', 'pausiert'] as PlayerStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setTargetStatus(st)}
                  className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer font-bold capitalize ${
                    targetStatus === st
                      ? 'bg-[#ff6b00] text-zinc-950 border-[#ff6b00]'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  {st === 'pending_death' ? 'Tod ausstehend' : st}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedPlayerId || isUpdatingStatus}
            className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[#ff6b00] to-orange-600 hover:from-[#ff7c1f] hover:to-orange-500 text-zinc-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50"
          >
            {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>Status für gewählten Spieler speichern</span>
          </button>
        </form>
      </div>

      {/* E. DANGER ZONE: KOMPLETT-RESET ALLER SPIELERDATEN */}
      <div className="p-5 rounded-3xl bg-rose-950/20 border-2 border-rose-600/70 space-y-3">
        <div className="flex items-start gap-2.5">
          <Trash2 className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-serif font-black text-sm text-rose-200">
              Gefahrenzone: Komplett-Reset aller Spielerdaten
            </h4>
            <p className="text-[11px] text-rose-300/80 leading-relaxed">
              Löscht <strong>alle Spielerprofile</strong>, Kills, Aufgaben, Punkte-Logs und Fotos vollständig. Setzt das Spiel in die saubere Lobby zurück und erhöht die <code>reset_epoch</code>, sodass alle Handys automatisch wieder im Login-Screen landen.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setConfirmInput('');
            setIsResetModalOpen(true);
          }}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-700 to-red-700 hover:from-rose-600 hover:to-red-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-950/80 transition active:scale-98"
        >
          <Trash2 className="w-4 h-4" />
          <span>Alles zurücksetzen (alle Spieler löschen)</span>
        </button>
      </div>

      {/* MODAL: 2-STUFIGE SICHERHEITSABFRAGE MIT WORT "RESET" */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-950 border-2 border-rose-600 p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/80 border border-rose-500/60 flex items-center justify-center text-rose-500 animate-bounce">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-serif font-black text-white">Komplett-Reset bestätigen</h3>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Diese Aktion löscht <strong>alle {players.length} Spieler</strong> und setzt das gesamte Spiel unwiderruflich auf Null zurück.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-left space-y-1.5">
              <label className="block text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                Tippe <span className="underline font-mono text-white">RESET</span> zur Freischaltung:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="RESET"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border-2 border-zinc-700 text-white font-mono text-center font-bold text-sm tracking-widest outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsResetModalOpen(false);
                  setConfirmInput('');
                }}
                disabled={isExecutingReset}
                className="flex-1 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold text-xs hover:text-white cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleExecuteFullReset}
                disabled={confirmInput.trim() !== 'RESET' || isExecutingReset}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-950"
              >
                {isExecutingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Unwiderruflich löschen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
