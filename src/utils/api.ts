import { Player, GameState, ServerStateResponse, GameSettings } from '../types/game';

const BACKEND_URL_KEY = 'halloween_backend_url_override';

class GameApiClient {
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('halloween_party_sync');
    }
  }

  public getBackendUrlOverride(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(BACKEND_URL_KEY) || '';
  }

  public setBackendUrlOverride(url: string) {
    if (typeof window === 'undefined') return;
    if (url.trim()) {
      localStorage.setItem(BACKEND_URL_KEY, url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem(BACKEND_URL_KEY);
    }
  }

  private getBaseUrl(): string {
    const override = this.getBackendUrlOverride();
    return override ? override : '';
  }

  private notifySync() {
    try {
      this.channel?.postMessage({ type: 'sync_update', timestamp: Date.now() });
    } catch {
      // Ignore broadcast channel errors
    }
  }

  // --- API METHODS (All server-backed) ---

  async getGameState(playerId?: string | null, adminCode?: string | null): Promise<ServerStateResponse> {
    const baseUrl = this.getBaseUrl();
    const params = new URLSearchParams();
    if (playerId) params.append('playerId', playerId);
    if (adminCode) params.append('adminCode', adminCode);

    const query = params.toString() ? `?${params.toString()}` : '';
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (adminCode) headers['x-admin-code'] = adminCode;

    const res = await fetch(`${baseUrl}/api/game-state${query}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Fehler beim Laden des Spielstands: ${res.status} ${res.statusText}`);
    }

    const data: ServerStateResponse = await res.json();
    return data;
  }

  async getPlayers(playerId?: string | null, adminCode?: string | null): Promise<Player[]> {
    const baseUrl = this.getBaseUrl();
    const params = new URLSearchParams();
    if (playerId) params.append('playerId', playerId);
    if (adminCode) params.append('adminCode', adminCode);

    const query = params.toString() ? `?${params.toString()}` : '';
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (adminCode) headers['x-admin-code'] = adminCode;

    const res = await fetch(`${baseUrl}/api/players${query}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Fehler beim Laden der Spieler: ${res.status}`);
    }

    const data = await res.json();
    return data.players || [];
  }

  async registerPlayer(playerData: { name: string; costumeName: string; photoUrl: string }): Promise<Player> {
    const baseUrl = this.getBaseUrl();

    const res = await fetch(`${baseUrl}/api/players/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(playerData),
    });

    if (!res.ok) {
      let errorMsg = 'Registrierung fehlgeschlagen';
      try {
        const errJson = await res.json();
        if (errJson?.error) errorMsg = errJson.error;
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    this.notifySync();
    return data.player;
  }

  async verifyAdminCode(code: string): Promise<boolean> {
    const baseUrl = this.getBaseUrl();

    const res = await fetch(`${baseUrl}/api/admin/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    if (res.ok) {
      const json = await res.json();
      return Boolean(json.success);
    }
    return false;
  }

  async startGame(adminCode: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/start-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ adminCode }),
    });

    if (!res.ok) {
      let errText = 'Spielstart fehlgeschlagen';
      try {
        const json = await res.json();
        if (json.error) errText = json.error;
      } catch {}
      throw new Error(errText);
    }

    this.notifySync();
  }

  async abortGame(adminCode: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/abort-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ adminCode }),
    });

    if (!res.ok) {
      throw new Error('Spielabbruch fehlgeschlagen');
    }

    this.notifySync();
  }

  async restartGame(adminCode: string, keepPlayers: boolean): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ adminCode, keepPlayers }),
    });

    if (!res.ok) {
      throw new Error('Neustart fehlgeschlagen');
    }

    this.notifySync();
  }

  async playerAction(
    adminCode: string,
    playerId: string,
    action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren'
  ): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/player-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ adminCode, playerId, action }),
    });

    if (!res.ok) {
      throw new Error(`Aktion '${action}' fehlgeschlagen`);
    }

    this.notifySync();
  }

  async updateSettings(adminCode: string, newSettings: Partial<GameSettings>): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/update-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-code': adminCode,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ adminCode, ...newSettings }),
    });

    if (!res.ok) {
      throw new Error('Einstellungen konnten nicht aktualisiert werden');
    }

    this.notifySync();
  }

  public subscribeToSync(callback: () => void): () => void {
    if (!this.channel) return () => {};
    const handler = () => callback();
    this.channel.addEventListener('message', handler);
    return () => this.channel?.removeEventListener('message', handler);
  }
}

export const gameApi = new GameApiClient();
