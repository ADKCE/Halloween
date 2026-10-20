import { Player, ServerStateResponse, GameSettings } from '../types/game';
import { supabaseService, SupabaseConfigStatus } from './supabase';

class GameApiClient {
  public getStatus(): SupabaseConfigStatus {
    return supabaseService.getStatus();
  }

  public saveSupabaseCredentials(url: string, key: string) {
    supabaseService.saveLocalCredentials(url, key);
  }

  async getGameState(playerId?: string | null, adminCode?: string | null): Promise<ServerStateResponse> {
    return supabaseService.getGameState(playerId, adminCode);
  }

  async registerPlayer(playerData: { name: string; costumeName: string; photoUrl: string }): Promise<Player> {
    return supabaseService.registerPlayer(playerData);
  }

  async verifyAdminCode(code: string): Promise<boolean> {
    return supabaseService.verifyAdminCode(code);
  }

  async startGame(adminCode: string): Promise<void> {
    return supabaseService.startGame(adminCode);
  }

  async abortGame(adminCode: string): Promise<void> {
    return supabaseService.abortGame(adminCode);
  }

  async restartGame(adminCode: string, keepPlayers: boolean): Promise<void> {
    return supabaseService.restartGame(adminCode, keepPlayers);
  }

  async playerAction(
    adminCode: string,
    playerId: string,
    action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren'
  ): Promise<void> {
    return supabaseService.playerAction(adminCode, playerId, action);
  }

  async updateSettings(adminCode: string, newSettings: Partial<GameSettings>): Promise<void> {
    return supabaseService.updateSettings(adminCode, newSettings);
  }

  async recordKill(killerId: string, victimId: string): Promise<void> {
    return supabaseService.recordKill(killerId, victimId);
  }

  async completeTask(playerId: string, taskId: string, photoBlobOrUrl?: Blob | File | string): Promise<void> {
    return supabaseService.completeTask(playerId, taskId, photoBlobOrUrl);
  }

  async uploadPartyPhoto(playerId: string, photoFile: Blob | File, caption?: string): Promise<string> {
    return supabaseService.uploadPartyPhoto(playerId, photoFile, caption);
  }

  public subscribeToRealtime(callback: () => void): () => void {
    return supabaseService.subscribeToRealtime(callback);
  }
}

export const gameApi = new GameApiClient();
