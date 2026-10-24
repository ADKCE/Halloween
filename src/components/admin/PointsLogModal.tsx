import React, { useState, useEffect } from 'react';
import { Award, X, Clock, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { Player, PointsLogEntry } from '../../types/game';
import { gameApi } from '../../utils/api';

interface PointsLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
}

export const PointsLogModal: React.FC<PointsLogModalProps> = ({
  isOpen,
  onClose,
  player,
}) => {
  const [logs, setLogs] = useState<PointsLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchLogs = async () => {
    if (!player) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await gameApi.getPointsLog(player.id);
      setLogs(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fehler beim Laden des Punkte-Logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && player) {
      fetchLogs();
    }
  }, [isOpen, player]);

  if (!isOpen || !player) return null;

  const totalPointsFromLog = logs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'photo_task':
        return { label: 'Foto-Aufgabe', color: 'bg-[#ff6b00]/15 text-[#ff6b00] border-[#ff6b00]/30' };
      case 'special_task':
        return { label: 'Spezialaufgabe (Mensch)', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
      case 'evil_kill':
        return { label: 'Kill bestätigt', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
      case 'exorcism':
        return { label: 'Exorzismus-Treffer', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
      default:
        return { label: reason || 'Punkte', color: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-zinc-700 bg-zinc-900 shrink-0">
              <img
                src={player.photoUrl || '/placeholder.png'}
                alt={player.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">{player.name}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                  {player.role || 'unassigned'}
                </span>
              </div>
              <p className="text-xs text-[#ff6b00]">
                Kostüm: "{player.costumeName || 'Kein Kostüm'}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Total Points KPI */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                Gesamtpunkte (Spielerprofil / Punkte-Log)
              </span>
              <span className="text-xs text-zinc-300">
                {logs.length} gebuchte Einträge
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="font-mono font-black text-2xl text-white">
              {player.points} <span className="text-xs text-[#ff6b00] font-sans">Pkt</span>
            </span>
            {totalPointsFromLog !== player.points && logs.length > 0 && (
              <span className="text-[10px] text-amber-400 block">
                Log-Summe: {totalPointsFromLog} Pkt
              </span>
            )}
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
            <span className="font-bold uppercase tracking-wider text-[10px]">Punkte-Historie (points_log)</span>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#ff6b00]" />
              <span className="text-xs font-mono">Lade Buchungen...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-3 bg-rose-950/80 border border-rose-500/60 rounded-2xl text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <Sparkles className="w-7 h-7 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400 font-medium">Noch keine Punkte-Einträge vorhanden.</p>
              <p className="text-[10px] text-zinc-600">Punkte werden bei Foto-Aufgaben (+10), Spezialaufgaben (+20), Kills (+15) oder Exorzismus (+25) verbucht.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => {
                const info = getReasonLabel(log.reason);
                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs flex items-center justify-between"
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${info.color}`}>
                          {info.label}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          Ref: {log.refId ? log.refId.substring(0, 16) : '-'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {new Date(log.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' })},{' '}
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="font-mono font-black text-sm text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-1 rounded-xl">
                        +{log.amount} Pkt
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs transition cursor-pointer"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
