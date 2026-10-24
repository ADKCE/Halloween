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

  async reportPendingDeath(playerId: string): Promise<{ success: boolean; message: string }> {
    return supabaseService.reportPendingDeath(playerId);
  }

  async confirmKill(
    killerIdOrKillId: string,
    victimId?: string,
    ghostSoloConfirmed = false
  ): Promise<{ success: boolean; message: string; cooldownUntil?: string }> {
    return supabaseService.confirmKill(killerIdOrKillId, victimId, ghostSoloConfirmed);
  }

  async adminConfirmKill(adminCode: string, victimId: string, killerId?: string): Promise<void> {
    return supabaseService.adminConfirmKill(adminCode, victimId, killerId);
  }

  async adminRevivePlayer(adminCode: string, playerId: string): Promise<void> {
    return supabaseService.adminRevivePlayer(adminCode, playerId);
  }

  async tickGame(): Promise<any> {
    return supabaseService.tickGame();
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
    slotNumber?: number;
  }): Promise<{ pointsAwarded: number }> {
    return supabaseService.completePhotoTask(params);
  }

  async getPendingSpecialTask(playerId: string): Promise<SpecialTaskAssignment | null> {
    return supabaseService.getPendingSpecialTask(playerId);
  }

  async completeSpecialTask(params: {
    specialTaskId: string;
    playerId: string;
    userAnswer?: number;
    mathAnswers?: number[];
    anagramAnswer?: string;
    sequenceAnswer?: string[];
    codeAnswer?: string;
  }): Promise<{ success: boolean; rewardPlayerName: string; rewardRole: RoleType; message: string }> {
    return supabaseService.completeSpecialTask(params);
  }

  async getPointsLog(playerId?: string): Promise<any[]> {
    return supabaseService.getPointsLog(playerId);
  }

  async deletePhoto(options: { photoId: string; playerId?: string; adminCode?: string } | string, photoIdParam?: string): Promise<void> {
    if (typeof options === 'string') {
      return supabaseService.deletePhoto({ adminCode: options, photoId: photoIdParam || '' });
    }
    return supabaseService.deletePhoto(options);
  }

  public isFullMoonActive(gameState: any): boolean {
    return supabaseService.isFullMoonActive(gameState);
  }

  public getNextFullMoon(gameState: any): { startsInMinutes: number; durationMinutes: number } | null {
    return supabaseService.getNextFullMoon(gameState);
  }

  async getServerNow(): Promise<string> {
    return supabaseService.getServerNow();
  }

  async expirePendingDeaths(): Promise<{ success: boolean; message: string; expiredCount: number }> {
    return supabaseService.expirePendingDeaths();
  }

  async logClientError(entry: any): Promise<void> {
    return supabaseService.logClientError(entry);
  }

  async getClientErrors(limit?: number): Promise<any[]> {
    return supabaseService.getClientErrors(limit);
  }

  async getTickLogs(limit?: number): Promise<any[]> {
    return supabaseService.getTickLogs(limit);
  }

  async adminClearPendingDeaths(adminCode: string): Promise<{ success: boolean; message: string }> {
    return supabaseService.adminClearPendingDeaths(adminCode);
  }

  async adminSetPlayerStatus(adminCode: string, playerId: string, newStatus: string): Promise<void> {
    return supabaseService.adminSetPlayerStatus(adminCode, playerId, newStatus);
  }

  async adminRepairGameState(adminCode: string): Promise<{ success: boolean; message: string }> {
    return supabaseService.adminRepairGameState(adminCode);
  }

  async adminResetAllCooldowns(adminCode: string): Promise<void> {
    return supabaseService.adminResetAllCooldowns(adminCode);
  }

  async resetGameFull(adminCode: string): Promise<{ success: boolean; message: string; newResetEpoch: number }> {
    return supabaseService.resetGameFull(adminCode);
  }

  public subscribeToRealtime(callback: () => void): () => void {
    return supabaseService.subscribeToRealtime(callback);
  }
}

export const gameApi = new GameApiClient();
