import { Player, ServerStateResponse, GameSettings, SpecialTaskAssignment, RoleType } from '../types/game';
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

  async reassignRoles(adminCode: string): Promise<{ success: boolean; message: string }> {
    return supabaseService.reassignRoles(adminCode);
  }

  async abortGame(adminCode: string): Promise<void> {
    return supabaseService.abortGame(adminCode);
  }

  async endGame(adminCode: string): Promise<void> {
    return supabaseService.endGame(adminCode);
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

  async triggerManualFullMoon(adminCode: string, durationMinutes = 5): Promise<void> {
    return supabaseService.triggerManualFullMoon(adminCode, durationMinutes);
  }

  async stopFullMoon(adminCode: string): Promise<void> {
    return supabaseService.stopFullMoon(adminCode);
  }

  async reportKill(params: {
    killerId: string;
    victimId: string;
    ghostSoloConfirmed?: boolean;
  }): Promise<{ message: string; cooldownUntil: string }> {
    return supabaseService.reportKill(params);
  }

  async exorcise(hunterId: string, targetId: string): Promise<{
    hit: boolean;
    victimName: string;
    victimRole: RoleType;
    message: string;
    cooldownMinutes: number;
  }> {
    return supabaseService.exorcise(hunterId, targetId);
  }

  async confirmKill(killId: string): Promise<void> {
    return supabaseService.confirmKill(killId, false);
  }

  async reportSelfDeath(playerId: string, killerRole?: string): Promise<{ confirmedExisting: boolean; message: string }> {
    return supabaseService.reportSelfDeath(playerId, killerRole);
  }

  async adminUndoKill(adminCode: string, killId: string): Promise<void> {
    return supabaseService.adminUndoKill(adminCode, killId);
  }

  async completePhotoTask(params: {
    playerId: string;
    taskId: string;
    taskTitle: string;
    photoBlobOrUrl: Blob | File | string;
    taggedPlayerIds: string[];
  }): Promise<{ pointsAwarded: number; bonusPointsTotal: number }> {
    return supabaseService.completePhotoTask(params);
  }

  async getPendingSpecialTask(playerId: string): Promise<SpecialTaskAssignment | null> {
    return supabaseService.getPendingSpecialTask(playerId);
  }

  async completeSpecialTask(params: {
    specialTaskId: string;
    playerId: string;
    userAnswer?: number;
    scannedQrCode?: string;
    photoBlobOrUrl?: Blob | File | string;
  }): Promise<{ success: boolean; rewardPlayerName: string; rewardRole: RoleType; message: string }> {
    return supabaseService.completeSpecialTask(params);
  }

  async deletePhoto(adminCode: string, photoId: string): Promise<void> {
    return supabaseService.deletePhoto(adminCode, photoId);
  }

  public isFullMoonActive(gameState: any): boolean {
    return supabaseService.isFullMoonActive(gameState);
  }

  public getNextFullMoon(gameState: any): { startsInMinutes: number; durationMinutes: number } | null {
    return supabaseService.getNextFullMoon(gameState);
  }

  public subscribeToRealtime(callback: () => void): () => void {
    return supabaseService.subscribeToRealtime(callback);
  }
}

export const gameApi = new GameApiClient();
