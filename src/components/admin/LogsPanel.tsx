import React, { useState, useEffect } from 'react';
import { Bug, Clock, RefreshCw, AlertTriangle, CheckCircle2, Terminal } from 'lucide-react';
import { gameApi } from '../../utils/api';
import { getLocalErrorsBuffer } from '../../utils/errorLogger';

interface LogsPanelProps {
  adminCode: string;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ adminCode }) => {
  const [subTab, setSubTab] = useState<'errors' | 'ticks' | 'win_checks'>('errors');
  const [clientErrors, setClientErrors] = useState<any[]>([]);
  const [tickLogs, setTickLogs] = useState<any[]>([]);
  const [winCheckLogs, setWinCheckLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const [errors, ticks, winChecks] = await Promise.all([
        gameApi.getClientErrors(50),
        gameApi.getTickLogs(30),
        gameApi.getWinCheckLogs(30),
      ]);
      // Combine with local buffer if any were captured locally
      const localErrors = getLocalErrorsBuffer();
      const combinedErrors = [...localErrors, ...errors];
      const uniqueErrors = Array.from(new Map(combinedErrors.map((item) => [item.id || item.message + item.created_at, item])).values());
      setClientErrors(uniqueErrors);
      setTickLogs(ticks);
      setWinCheckLogs(winChecks);
    } catch (e) {
      console.warn('Error fetching logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Header and Toggle */}
      <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-serif font-black text-white text-base">System- & Sieg-Logs</h3>
            <p className="text-[11px] text-zinc-400">Echtzeit-Überwachung aller Client-Fehler, Siegbedingungen & Ticks</p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          disabled={isLoading}
          className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer"
          title="Logs aktualisieren"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#ff6b00]' : ''}`} />
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="flex rounded-2xl bg-zinc-950 p-1 border border-zinc-800 text-xs font-bold gap-1">
        <button
          type="button"
          onClick={() => setSubTab('errors')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
            subTab === 'errors'
              ? 'bg-rose-950 border border-rose-500/60 text-rose-200 font-black'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Bug className="w-3.5 h-3.5 text-rose-400" />
          <span>Fehler ({clientErrors.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('win_checks')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
            subTab === 'win_checks'
              ? 'bg-emerald-950 border border-emerald-500/60 text-emerald-200 font-black'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Sieg-Checks ({winCheckLogs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('ticks')}
          className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
            subTab === 'ticks'
              ? 'bg-purple-950 border border-purple-500/60 text-purple-200 font-black'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>Ticks ({tickLogs.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: CLIENT ERRORS */}
      {subTab === 'errors' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {clientErrors.length === 0 ? (
            <div className="p-8 rounded-3xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
              <h4 className="font-bold text-white text-sm">Keine Fehler registriert</h4>
              <p className="text-xs text-zinc-400">Alle Clients laufen stabil ohne unbehandelte Exceptions.</p>
            </div>
          ) : (
            clientErrors.map((err, idx) => (
              <div
                key={err.id || idx}
                className="p-3.5 rounded-2xl bg-zinc-900 border border-rose-500/40 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                  <span className="text-rose-400 font-bold">{err.source || 'Client'}</span>
                  <span>{new Date(err.created_at || err.createdAt || Date.now()).toLocaleTimeString()}</span>
                </div>
                <div className="font-bold text-rose-200 break-words text-xs">
                  {err.message}
                </div>
                {err.stack && (
                  <pre className="p-2 rounded-xl bg-black/60 font-mono text-[9px] text-zinc-400 overflow-x-auto max-h-24">
                    {err.stack}
                  </pre>
                )}
                {err.player_id && (
                  <div className="text-[10px] text-zinc-500 font-mono">
                    Spieler-ID: {err.player_id}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SUB-TAB 2: TICK LOGS */}
      {subTab === 'ticks' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {tickLogs.length === 0 ? (
            <div className="p-8 rounded-3xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
              <Clock className="w-8 h-8 mx-auto text-zinc-500" />
              <h4 className="font-bold text-white text-sm">Noch keine Ticks protokolliert</h4>
              <p className="text-xs text-zinc-400">pg_cron oder der Client-Ticker führen periodische Ticks aus.</p>
            </div>
          ) : (
            tickLogs.map((tl, idx) => (
              <div
                key={tl.id || idx}
                className={`p-3 rounded-2xl border text-xs space-y-1 ${
                  tl.status === 'success'
                    ? 'bg-zinc-900/90 border-zinc-800'
                    : 'bg-rose-950/40 border-rose-500/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono font-bold text-[11px] ${
                      tl.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {tl.status === 'success' ? '✓ Tick Erfolgreich' : '✗ Tick Fehler'}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {new Date(tl.tickAt || tl.tick_at || Date.now()).toLocaleTimeString()}
                    {tl.durationMs ? ` (${tl.durationMs}ms)` : ''}
                  </span>
                </div>

                {tl.errorMessage && (
                  <p className="text-rose-300 text-[11px] font-mono break-words">{tl.errorMessage}</p>
                )}

                {tl.details && (
                  <div className="text-[10px] text-zinc-400 font-mono flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                    {tl.details.expired_pending_count !== undefined && (
                      <span>Ausstehende Tode bereinigt: {tl.details.expired_pending_count}</span>
                    )}
                    {tl.details.created_photo_tasks !== undefined && (
                      <span>Neue Foto-Aufgaben: {tl.details.created_photo_tasks}</span>
                    )}
                    {tl.details.moon_action && (
                      <span>Vollmond: {tl.details.moon_action}</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SUB-TAB 3: WIN CHECK LOGS */}
      {subTab === 'win_checks' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {winCheckLogs.length === 0 ? (
            <div className="p-8 rounded-3xl bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-zinc-500" />
              <h4 className="font-bold text-white text-sm">Noch keine Sieg-Checks protokolliert</h4>
              <p className="text-xs text-zinc-400">check_win() wird bei jedem Kill, Exorzismus und Ticker ausgeführt.</p>
            </div>
          ) : (
            winCheckLogs.map((wc, idx) => (
              <div
                key={wc.id || idx}
                className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                  wc.winner_team
                    ? 'bg-gradient-to-r from-purple-950/80 to-zinc-900 border-purple-500/80 shadow-md'
                    : 'bg-zinc-900/90 border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[11px] text-[#ff6b00]">
                      [{wc.trigger_action || wc.triggerAction || 'check'}]
                    </span>
                    {wc.winner_team && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                        🏆 Team {wc.winner_team} Sieger!
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {new Date(wc.checked_at || wc.checkedAt || Date.now()).toLocaleTimeString()}
                  </span>
                </div>

                {wc.end_reason && (
                  <p className="text-purple-300 text-[11px] font-bold">
                    Grund: {wc.end_reason}
                  </p>
                )}

                <div className="grid grid-cols-4 gap-1 text-[10px] font-mono pt-1 text-zinc-300">
                  <div className="p-1 rounded bg-zinc-950/60 text-center">
                    <span className="text-zinc-500 block">Gute</span>
                    <span className="font-bold text-emerald-400">{wc.living_good ?? wc.livingGood} / {wc.initial_good ?? wc.initialGood}</span>
                  </div>
                  <div className="p-1 rounded bg-zinc-950/60 text-center">
                    <span className="text-zinc-500 block">Böse</span>
                    <span className="font-bold text-rose-400">{wc.living_evil ?? wc.livingEvil} / {wc.initial_evil ?? wc.initialEvil}</span>
                  </div>
                  <div className="p-1 rounded bg-zinc-950/60 text-center">
                    <span className="text-zinc-500 block">Jäger</span>
                    <span className="font-bold text-blue-400">{wc.living_hunters ?? wc.livingHunters} / {wc.initial_hunters ?? wc.initialHunters}</span>
                  </div>
                  <div className="p-1 rounded bg-zinc-950/60 text-center">
                    <span className="text-zinc-500 block">Tote Gut</span>
                    <span className="font-bold text-amber-400">{wc.good_death_pct ?? wc.goodDeathPct}%</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
