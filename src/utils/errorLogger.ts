import { gameApi } from './api';

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  source?: string;
  playerId?: string | null;
}

const recentErrorsBuffer: any[] = [];
let isInitialized = false;

export function initGlobalErrorLogging(getPlayerId: () => string | null) {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  window.onerror = (message, source, lineno, colno, error) => {
    const errorMsg = typeof message === 'string' ? message : 'Unknown window.onerror';
    const loc = `${source || 'unknown'}:${lineno || 0}:${colno || 0}`;

    reportClientError({
      message: errorMsg,
      stack: error?.stack,
      source: loc,
      playerId: getPlayerId(),
    });
  };

  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const errorMsg = reason instanceof Error ? reason.message : String(reason || 'Unhandled Promise Rejection');
    const stack = reason instanceof Error ? reason.stack : undefined;

    reportClientError({
      message: errorMsg,
      stack,
      source: 'unhandledrejection',
      playerId: getPlayerId(),
    });
  };
}

export async function reportClientError(payload: ClientErrorPayload): Promise<void> {
  const entry = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    created_at: new Date().toISOString(),
    player_id: payload.playerId || (typeof window !== 'undefined' ? localStorage.getItem('halloween_party_player_id') : null),
    message: payload.message || 'Unbekannter Fehler',
    stack: payload.stack || null,
    source: payload.source || 'client',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  recentErrorsBuffer.unshift(entry);
  if (recentErrorsBuffer.length > 50) recentErrorsBuffer.pop();

  try {
    await gameApi.logClientError(entry);
  } catch (err) {
    // Silent fallback to avoid recursive error loops
    console.warn('Could not persist client error to Supabase:', err);
  }
}

export function getLocalErrorsBuffer() {
  return [...recentErrorsBuffer];
}
