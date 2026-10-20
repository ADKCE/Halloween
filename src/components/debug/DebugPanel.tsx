import React, { useState, useEffect } from 'react';
import { Bug, RefreshCw, Database, Radio, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { gameApi } from '../../utils/api';
import { SupabaseConfigStatus } from '../../utils/supabase';

interface DebugPanelProps {
  registeredPlayerId: string | null;
  gameStatus: string;
  totalJoinedCount: number;
  onRefresh: () => void;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  registeredPlayerId,
  gameStatus,
  totalJoinedCount,
  onRefresh,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [status, setStatus] = useState<SupabaseConfigStatus | null>(null);

  // Quick credentials input state if user wants to enter them in UI
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [showConfigForm, setShowConfigForm] = useState(false);

  useEffect(() => {
    // Only visible if ?debug=1 in URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      setIsVisible(params.get('debug') === '1');
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const update = () => setStatus(gameApi.getStatus());
    update();
    const interval = setInterval(update, 1500);
    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const handleSaveCustomCreds = (e: React.FormEvent) => {
    e.preventDefault();
    gameApi.saveSupabaseCredentials(customUrl, customKey);
    setStatus(gameApi.getStatus());
    setShowConfigForm(false);
    onRefresh();
  };

  const getRealtimeBadge = (s: SupabaseConfigStatus['realtimeStatus']) => {
    switch (s) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Realtime aktiv
          </span>
        );
      case 'CONNECTING':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            Verbindet...
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-500/40">
            <AlertTriangle className="w-2.5 h-2.5" />
            Fehler (Fallback: 3s Polling)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-700">
            3s Polling aktiv
          </span>
        );
    }
  };

  return (
    <aside aria-label="Supabase Debug Konsole" className="fixed bottom-20 right-3 z-50 max-w-sm w-[calc(100vw-24px)] sm:w-88 bg-zinc-950/95 backdrop-blur-xl border-2 border-emerald-500/60 rounded-2xl shadow-2xl text-zinc-200 overflow-hidden font-mono text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-950/60 border-b border-emerald-500/30">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-emerald-300 text-[11px] uppercase tracking-wider">
            Supabase Debug Panel (?debug=1)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRefresh()}
            className="p-1 hover:text-white text-zinc-400 transition"
            title="Jetzt manuell synchronisieren"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:text-white text-zinc-400 transition"
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3.5 space-y-2.5 max-h-[70vh] overflow-y-auto">
          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">Spieler in DB:</span>
              <span className="font-bold text-white text-sm">
                {status?.dbPlayerCount ?? totalJoinedCount}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">Spielstatus:</span>
              <span className="font-bold text-[#ff6b00] text-sm">{gameStatus}</span>
            </div>
          </div>

          {/* Eigene Spieler-ID */}
          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block">Eigene Spieler-ID (localStorage):</span>
            <span className="font-bold text-xs text-purple-300 break-all">
              {registeredPlayerId || '(nicht angemeldet)'}
            </span>
          </div>

          {/* Letzter Abruf & Realtime-Status */}
          <div className="space-y-1.5 p-2 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Letzter Datenabruf:</span>
              <span className="text-white font-bold text-[11px]">
                {status?.lastSyncTime || 'Noch keiner'}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
              <span className="text-[10px] text-zinc-400">Realtime-Status:</span>
              {getRealtimeBadge(status?.realtimeStatus || 'POLLING_ONLY')}
            </div>
          </div>

          {/* Letzte Fehlermeldung */}
          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block mb-0.5">Letzte Fehlermeldung:</span>
            {status?.lastError ? (
              <span className="text-rose-400 text-[11px] break-words flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {status.lastError}
              </span>
            ) : (
              <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Keine Fehler vorhanden
              </span>
            )}
          </div>

          {/* Supabase URL & Setup Info */}
          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Supabase URL:</span>
              <span className="text-[10px] text-zinc-300 truncate max-w-[170px]" title={status?.supabaseUrl}>
                {status?.supabaseUrl || '(fehlt)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Anon Key:</span>
              <span className="text-[10px] text-zinc-300">
                {status?.hasAnonKey ? '✓ Gesetzt' : '✗ Fehlt'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Quelle:</span>
              <span className="text-[10px] text-purple-400">
                {status?.source === 'env'
                  ? 'Cloudflare / .env'
                  : status?.source === 'localStorage'
                  ? 'Browser Override'
                  : 'Nicht hinterlegt'}
              </span>
            </div>

            <button
              onClick={() => setShowConfigForm(!showConfigForm)}
              className="mt-1 w-full py-1 text-[10px] text-emerald-400 hover:text-emerald-300 underline text-left cursor-pointer"
            >
              {showConfigForm ? 'Konfigurationsformular schließen' : 'Supabase-Keys im Browser testen / ändern →'}
            </button>
          </div>

          {/* Quick in-browser config form */}
          {showConfigForm && (
            <form onSubmit={handleSaveCustomCreds} className="p-2.5 rounded-xl bg-zinc-900/90 border border-emerald-500/30 space-y-2">
              <p className="text-[10px] text-zinc-400">
                Hier kannst du Supabase-Keys testweise direkt im Browser hinterlegen (ohne Neustart):
              </p>
              <input
                type="url"
                placeholder="https://xyz.supabase.co"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full px-2 py-1 rounded bg-black border border-zinc-700 text-white text-[11px]"
              />
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5c..."
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="w-full px-2 py-1 rounded bg-black border border-zinc-700 text-white text-[11px]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase cursor-pointer"
                >
                  Speichern & Testen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    gameApi.saveSupabaseCredentials('', '');
                    setStatus(gameApi.getStatus());
                    setShowConfigForm(false);
                    onRefresh();
                  }}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] cursor-pointer"
                >
                  Zurücksetzen
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </aside>
  );
};
