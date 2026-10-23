import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Player,
  GameState,
  RoleType,
  TeamType,
  KillRecord,
  PartyTask,
  TaskCompletion,
  PartyPhoto,
  ServerStateResponse,
  GameSettings,
  SpecialTaskAssignment,
  FullMoonEvent,
  PlayerPhotoTask,
} from '../types/game';
import {
  DEFAULT_PHOTO_TASKS,
  DEFAULT_QUIZ_QUESTIONS,
  HALLOWEEN_ANAGRAMS,
  generateScrambledWord,
  generateMathQuestions,
  generateSequence,
  generateSecretCode,
} from './gameDataPool';
import {
  distributeRoles,
  determineLateJoinerRole,
  DEFAULT_ROLE_PERCENTAGES,
} from './roleDistribution';

const STORAGE_URL_KEY = 'halloween_supabase_url';
const STORAGE_ANON_KEY = 'halloween_supabase_anon_key';

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  supabaseUrl: string;
  hasAnonKey: boolean;
  source: 'env' | 'localStorage' | 'none';
  realtimeStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'POLLING_ONLY' | 'ERROR';
  lastSyncTime: string | null;
  lastError: string | null;
  dbPlayerCount: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  adminCode: '1031',
  vampirePercent: 6,
  werewolfPercent: 4,
  ghostPercent: 4,
  hunterPercent: 10,
  vampireCount: 6,
  werewolfCount: 4,
  ghostCount: 4,
  hunterCount: 10,
  gracePeriodMinutes: 15,
  vampireCooldownMinutes: 6,
  ghostCooldownMinutes: 6,
  werewolfCooldownMinutes: 2,
  hunterHitCooldownMinutes: 15,
  hunterMissPenaltyMinutes: 30,
  pendingDeathTimeoutMinutes: 4,
  unconfirmedKillAction: 'revive',
  fullMoonMinIntervalMinutes: 20,
  fullMoonMaxIntervalMinutes: 40,
  fullMoonDurationMinutes: 5,
  pointsPhotoTask: 10,
  pointsSpecialTask: 20,
  pointsEvilKill: 15,
  pointsExorcismSuccess: 25,
  photoTaskIntervalMinutes: 10,
  photoTaskExpirationMinutes: 30,
  photoDownloadUnlocked: 'ended',
  specialTaskIntervalMinMinutes: 10,
  specialTaskIntervalMaxMinutes: 20,
};

export function sanitizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/rest\/v1\/?$/, '');
  url = url.replace(/\/auth\/v1\/?$/, '');
  url = url.replace(/\/storage\/v1\/?$/, '');
  url = url.replace(/\/realtime\/v1\/?$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
}

export function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return { blob: new Blob([ab], { type: mime }), mime };
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private realtimeStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'POLLING_ONLY' | 'ERROR' = 'DISCONNECTED';
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private dbPlayerCount = 0;
  private channel: any = null;

  constructor() {
    this.initClient();
  }

  public getStatus(): SupabaseConfigStatus {
    const creds = this.getCredentials();
    return {
      isConfigured: Boolean(creds.url && creds.key),
      supabaseUrl: creds.url,
      hasAnonKey: Boolean(creds.key),
      source: creds.source,
      realtimeStatus: this.realtimeStatus,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
      dbPlayerCount: this.dbPlayerCount,
    };
  }

  public getCredentials(): { url: string; key: string; source: 'env' | 'localStorage' | 'none' } {
    const rawEnvUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
    const envUrl = sanitizeSupabaseUrl(rawEnvUrl);
    const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

    if (envUrl && envKey && !envUrl.includes('xxxxxxxxxxxxxxxxxxxx')) {
      return { url: envUrl, key: envKey, source: 'env' };
    }

    if (typeof window !== 'undefined') {
      const rawLocalUrl = (localStorage.getItem(STORAGE_URL_KEY) || '').trim();
      const localUrl = sanitizeSupabaseUrl(rawLocalUrl);
      const localKey = (localStorage.getItem(STORAGE_ANON_KEY) || '').trim();
      if (localUrl && localKey) {
        return { url: localUrl, key: localKey, source: 'localStorage' };
      }
    }

    return { url: envUrl, key: envKey, source: envUrl ? 'env' : 'none' };
  }

  public saveLocalCredentials(url: string, key: string) {
    if (typeof window === 'undefined') return;
    const cleanUrl = sanitizeSupabaseUrl(url);
    const cleanKey = key.trim();
    if (cleanUrl && cleanKey) {
      localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
      localStorage.setItem(STORAGE_ANON_KEY, cleanKey);
    } else {
      localStorage.removeItem(STORAGE_URL_KEY);
      localStorage.removeItem(STORAGE_ANON_KEY);
    }
    this.initClient();
  }

  public initClient(): boolean {
    const { url, key } = this.getCredentials();
    if (!url || !key || !url.startsWith('http')) {
      this.client = null;
      this.realtimeStatus = 'POLLING_ONLY';
      return false;
    }

    try {
      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      return true;
    } catch (err: any) {
      this.lastError = err?.message || 'Fehler beim Erstellen des Supabase-Clients';
      this.client = null;
      return false;
    }
  }

  public getClient(): SupabaseClient | null {
    if (!this.client) {
      this.initClient();
    }
    return this.client;
  }

  // --- PHOTO UPLOAD WITH STORAGE & COMPRESSED FALLBACK ---
  public async uploadPhoto(
    blobOrFileOrDataUrl: Blob | File | string,
    prefix: 'costume' | 'task' | 'party' = 'costume'
  ): Promise<string> {
    const client = this.getClient();
    if (!client) {
      if (typeof blobOrFileOrDataUrl === 'string') return blobOrFileOrDataUrl;
      throw new Error('Supabase ist nicht konfiguriert');
    }

    let uploadBlob: Blob;
    let fileExt = 'jpg';
    let fallbackDataUrl = '';

    if (typeof blobOrFileOrDataUrl === 'string') {
      fallbackDataUrl = blobOrFileOrDataUrl;
      if (blobOrFileOrDataUrl.startsWith('data:')) {
        const converted = dataUrlToBlob(blobOrFileOrDataUrl);
        uploadBlob = converted.blob;
        fileExt = converted.mime.split('/')[1] || 'jpg';
      } else {
        return blobOrFileOrDataUrl;
      }
    } else {
      uploadBlob = blobOrFileOrDataUrl;
      const type = blobOrFileOrDataUrl.type || 'image/jpeg';
      fileExt = type.split('/')[1] || 'jpg';
    }

    const uniqueId = Math.random().toString(36).substring(2, 10);
    const timeStamp = Date.now();
    const fileName = `${prefix}_${timeStamp}_${uniqueId}.${fileExt}`;

    try {
      const { data: uploadData, error: uploadError } = await client.storage
        .from('photos')
        .upload(fileName, uploadBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: uploadBlob.type || 'image/jpeg',
        });

      if (uploadError) {
        console.warn('Storage-Upload fehlgeschlagen:', uploadError);
        this.lastError = `Storage: ${uploadError.message}`;
        if (fallbackDataUrl) return fallbackDataUrl;
        return '';
      }

      const { data: publicData } = client.storage
        .from('photos')
        .getPublicUrl(uploadData?.path || fileName);

      return publicData.publicUrl;
    } catch (err: any) {
      console.warn('Foto-Upload Ausnahme:', err);
      if (fallbackDataUrl) return fallbackDataUrl;
      return '';
    }
  }

  // --- GET GAME STATE (WITH ROLE FILTERING & SECRETS) ---
  public async getGameState(
    playerId?: string | null,
    adminCode?: string | null
  ): Promise<ServerStateResponse> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Supabase nicht konfiguriert.');
    }

    try {
      // 1. Fetch game_state (id = 'main')
      const { data: stateData, error: stateError } = await client
        .from('game_state')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

      if (stateError) {
        throw new Error(`game_state: ${stateError.message}`);
      }

      const rawSettings = stateData?.settings || {};
      const settings: GameSettings = {
        ...DEFAULT_GAME_SETTINGS,
        ...rawSettings,
        adminCode: stateData?.admin_code || rawSettings.adminCode || '1031',
      };

      const gameState: GameState = {
        id: 'main',
        status: (stateData?.status as any) || 'Lobby',
        startedAt: stateData?.started_at || null,
        endedAt: stateData?.ended_at || null,
        settings,
        adminCode: stateData?.admin_code || '1031',
        fullMoonTimes: stateData?.full_moon_times || [],
        activeFullMoon: stateData?.active_full_moon || null,
        lastTickAt: stateData?.last_tick_at || null,
        winnerTeam: stateData?.winner_team || null,
        updatedAt: stateData?.updated_at || undefined,
      };

      const isAdmin = Boolean(adminCode && adminCode.trim() === gameState.adminCode);

      // 2. Fetch players
      const { data: playersData, error: playersError } = await client
        .from('players')
        .select('*')
        .order('created_at', { ascending: true });

      if (playersError) {
        throw new Error(`players: ${playersError.message}`);
      }

      this.dbPlayerCount = playersData ? playersData.length : 0;

      // Secure role lookup via RPC to avoid exposing all roles to anon client
      let mySecretRole: RoleType | null = null;
      let mySecretTeam: TeamType | null = null;
      let fellowHunterIds = new Set<string>();

      if (playerId) {
        try {
          const { data: roleRes } = await client.rpc('get_my_role', { p_player_id: playerId });
          if (roleRes && roleRes.role) {
            mySecretRole = roleRes.role as RoleType;
            mySecretTeam = roleRes.team as TeamType;
          }
        } catch {}

        if (mySecretRole === 'Geisterjäger') {
          try {
            const { data: huntersRes } = await client.rpc('get_fellow_hunters', { p_player_id: playerId });
            if (Array.isArray(huntersRes)) {
              fellowHunterIds = new Set(huntersRes.map((h: any) => h.player_id));
            }
          } catch {}
        }
      }

      // Role secrecy rules:
      // - If game is 'Beendet' -> everyone sees all roles
      // - Admin -> sees all roles
      // - Self -> sees own role (via RPC or record)
      // - Hunter -> sees other Hunters' roles too
      // - Otherwise -> 'Unbekannt'
      const isGameEnded = gameState.status === 'Beendet';

      const mappedPlayers: Player[] = (playersData || []).map((p: any) => {
        const isSelf = Boolean(playerId && p.id === playerId);
        const isHunterTeammate = Boolean(fellowHunterIds.has(p.id));
        const rawRole = (p.role === 'unassigned' || !p.role) ? 'unassigned' : (p.role as RoleType);
        const rawTeam = (p.team || 'Gut') as TeamType;

        let resolvedRole: RoleType = 'Unbekannt';
        let resolvedTeam: TeamType = 'Gut';

        if (gameState.status === 'Lobby') {
          // In der Lobby hat noch niemand eine Spielrolle (erst ab Spielstart)
          resolvedRole = isAdmin ? rawRole : 'unassigned';
          resolvedTeam = 'Gut';
        } else {
          // Läuft oder Beendet
          if (isGameEnded || isAdmin) {
            resolvedRole = rawRole;
            resolvedTeam = rawTeam;
          } else if (isSelf) {
            resolvedRole = mySecretRole || rawRole;
            resolvedTeam = mySecretTeam || rawTeam;
          } else if (isHunterTeammate) {
            resolvedRole = 'Geisterjäger';
            resolvedTeam = 'Gut';
          } else {
            resolvedRole = 'Unbekannt';
            resolvedTeam = 'Gut';
          }
        }

        return {
          id: p.id,
          name: p.name,
          costumeName: p.costume_name || '',
          photoUrl: p.photo_url || '',
          role: resolvedRole,
          team: resolvedTeam,
          status: p.status || 'lebendig',
          points: p.points || 0,
          killsCount: p.kills_count || 0,
          tasksCompletedCount: p.tasks_completed_count || 0,
          cooldownUntil: p.cooldown_until || undefined,
          lastKillAt: p.last_kill_at || undefined,
          pendingDeathAt: p.pending_death_at || null,
          isTest: Boolean(p.is_test),
          joinedAt: p.created_at,
        };
      });

      // 3. Fetch kills
      const { data: killsData } = await client
        .from('kills')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const mappedKills: KillRecord[] = (killsData || []).map((k: any) => ({
        id: k.id,
        killerId: k.killer_id,
        victimId: k.victim_id,
        killerName: k.killer_name,
        victimName: k.victim_name,
        killerRole: k.killer_role,
        victimRole: k.victim_role,
        killerTeam: k.killer_team,
        victimTeam: k.victim_team,
        reason: k.reason || 'kill',
        exorcismHit: k.exorcism_hit,
        ghostSoloConfirmed: k.ghost_solo_confirmed,
        confirmed: k.confirmed !== false,
        confirmedAt: k.confirmed_at,
        autoConfirmed: Boolean(k.auto_confirmed),
        createdAt: k.created_at,
      }));



      // Check win conditions if game is running
      if (gameState.status === 'Läuft') {
        this.evaluateWinConditions(gameState, playersData || [], settings).catch((e) =>
          console.warn('Win condition check error:', e)
        );
      }

      // 4. Tasks (Default pool or DB)
      const mappedTasks: PartyTask[] = DEFAULT_PHOTO_TASKS.map((t, idx) => ({
        id: t.id || `task_${idx}`,
        title: t.text.split('(')[0].replace('{playerName}', 'Mitspieler').replace('{costumeName}', 'Kostüm'),
        description: t.text,
        points: settings.pointsPhotoTask || 10,
        category: 'party',
      }));

      // 5. Fetch task completions
      const { data: completionsData } = await client
        .from('task_completions')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(100);

      const mappedCompletions: TaskCompletion[] = (completionsData || []).map((c: any) => ({
        id: c.id,
        taskId: c.task_id,
        taskTitle: c.task_title || '',
        playerId: c.player_id,
        playerName: c.player_name,
        photoUrl: c.photo_url,
        pointsAwarded: c.points_awarded || 10,
        completedAt: c.completed_at,
      }));

      // 6. Fetch photos (gallery)
      const { data: photosData } = await client
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      const mappedPhotos: PartyPhoto[] = (photosData || []).map((ph: any) => ({
        id: ph.id,
        photoUrl: ph.photo_url,
        taskId: ph.task_id,
        taskTitle: ph.task_title || ph.caption || 'Foto-Aufgabe',
        caption: ph.caption || ph.task_title || 'Foto-Aufgabe',
        playerId: ph.player_id,
        photographerName: ph.photographer_name || 'Gast',
        createdAt: ph.created_at,
      }));

      // 7. Fetch player photo tasks (from DB table player_photo_tasks)
      let mappedPhotoTasks: PlayerPhotoTask[] = [];
      if (playerId) {
        try {
          const { data: ptData } = await client
            .from('player_photo_tasks')
            .select('*')
            .eq('player_id', playerId)
            .order('slot_number', { ascending: false });

          if (ptData && Array.isArray(ptData)) {
            mappedPhotoTasks = ptData.map((pt: any) => ({
              id: pt.id,
              playerId: pt.player_id,
              slotNumber: pt.slot_number,
              title: pt.title,
              description: pt.description,
              taskType: pt.task_type,
              targetPlayerId: pt.target_player_id,
              targetPlayerName: pt.target_player_name,
              targetPlayerCostume: pt.target_player_costume,
              targetPlayerPhoto: pt.target_player_photo,
              targetSecondPlayerId: pt.target_second_player_id,
              targetSecondPlayerName: pt.target_second_player_name,
              targetSecondPlayerCostume: pt.target_second_player_costume,
              targetSecondPlayerPhoto: pt.target_second_player_photo,
              targetCostumeName: pt.target_costume_name,
              groupCount: pt.group_count,
              points: pt.points || 10,
              status: pt.status || 'open',
              createdAt: pt.created_at,
              expiresAt: pt.expires_at,
              completedAt: pt.completed_at,
              photoUrl: pt.photo_url,
            }));
          }
        } catch {}
      }

      // 8. Fetch special tasks (for living humans)
      let mappedSpecialTasks: SpecialTaskAssignment[] = [];
      if (playerId) {
        try {
          const { data: stData } = await client
            .from('special_tasks')
            .select('*')
            .eq('player_id', playerId)
            .order('created_at', { ascending: false })
            .limit(5);

          if (stData && Array.isArray(stData)) {
            mappedSpecialTasks = stData.map((st: any) => ({
              id: st.id,
              playerId: st.player_id,
              type: st.type,
              title: st.title,
              description: st.description,
              points: st.points || 20,
              status: st.status || (st.completed_at ? 'completed' : 'pending'),
              createdAt: st.created_at,
              expiresAt: st.expires_at,
              completedAt: st.completed_at,
              rewardRevealedPlayerId: st.reward_player_id,
              rewardRevealedPlayerName: st.reward_player_name,
              rewardRevealedRole: st.reward_role,
              taskData: st.task_data || {},
            }));
          }
        } catch {}
      }

      this.lastSyncTime = new Date().toLocaleTimeString();
      this.lastError = null;

      return {
        gameState,
        players: mappedPlayers,
        kills: mappedKills,
        tasks: mappedTasks,
        taskCompletions: mappedCompletions,
        photos: mappedPhotos,
        photoTasks: mappedPhotoTasks,
        specialTasks: mappedSpecialTasks,
        totalJoinedCount: mappedPlayers.filter((p) => p.status !== 'entfernt').length,
      };
    } catch (err: any) {
      this.lastError = err?.message || 'Fehler beim Abrufen der Spieldaten';
      throw err;
    }
  }

  // --- WIN CONDITION EVALUATOR ---
  private async evaluateWinConditions(
    gameState: GameState,
    allDbPlayers: any[],
    settings: GameSettings
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const active = allDbPlayers.filter((p) => p.status !== 'entfernt');
    if (active.length === 0) return;

    const evilPlayers = active.filter((p) => p.team === 'Böse');
    const goodPlayers = active.filter((p) => p.team === 'Gut');
    const livingEvil = evilPlayers.filter((p) => p.status === 'lebendig');
    const livingGood = goodPlayers.filter((p) => p.status === 'lebendig');
    const livingHunters = active.filter((p) => p.role === 'Geisterjäger' && p.status === 'lebendig');

    let wonTeam: TeamType | null = null;

    // 1. GUT gewinnt, wenn alle Bösen tot sind
    if (evilPlayers.length > 0 && livingEvil.length === 0) {
      wonTeam = 'Gut';
    }
    // 2. BÖSE gewinnt, wenn alle Geisterjäger tot sind oder mehr als 75% des guten Teams tot sind
    else if (goodPlayers.length > 0) {
      const allHuntersCount = active.filter((p) => p.role === 'Geisterjäger').length;
      const allHuntersDead = allHuntersCount > 0 && livingHunters.length === 0;
      const deadGoodPercent = ((goodPlayers.length - livingGood.length) / goodPlayers.length) * 100;

      if (allHuntersDead || deadGoodPercent >= 75) {
        wonTeam = 'Böse';
      }
    }

    if (wonTeam) {
      await client
        .from('game_state')
        .update({
          status: 'Beendet',
          ended_at: new Date().toISOString(),
          winner_team: wonTeam,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'main');
    }
  }

  // --- RESILIENT PLAYER UPDATE HELPER ---
  // If optional columns (cooldown_until, kills_count, tasks_completed_count) don't exist in the database table yet,
  // gracefully fall back to updating only the core columns (points, status, role, team).
  public async safeUpdatePlayer(
    playerId: string,
    payload: Record<string, any>,
    fallbackKeys: string[] = ['points', 'status', 'role', 'team']
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    try {
      const { error } = await client.from('players').update(payload).eq('id', playerId);
      if (error) {
        console.warn('safeUpdatePlayer: extended update failed, using fallback:', error.message);
        const fallbackPayload: Record<string, any> = {};
        for (const k of fallbackKeys) {
          if (k in payload) fallbackPayload[k] = payload[k];
        }
        if (Object.keys(fallbackPayload).length > 0) {
          await client.from('players').update(fallbackPayload).eq('id', playerId);
        }
      }
    } catch (err) {
      console.warn('safeUpdatePlayer exception:', err);
    }
  }

  // --- REGISTER PLAYER ---
  public async registerPlayer(playerData: {
    name: string;
    costumeName: string;
    photoUrl: string;
  }): Promise<Player> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const id = `player_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let uploadedPhotoUrl = playerData.photoUrl;

    if (playerData.photoUrl.startsWith('data:')) {
      try {
        uploadedPhotoUrl = await this.uploadPhoto(playerData.photoUrl, 'costume');
      } catch (err: any) {
        console.warn('Storage upload error, using direct photo:', err);
        uploadedPhotoUrl = playerData.photoUrl;
      }
    }

    // Determine role:
    // If Lobby -> role: 'unassigned'
    // If Läuft -> Nachzügler! Role allocated based on deficit
    let assignedRole: RoleType = 'unassigned';
    let assignedTeam: TeamType = 'Gut';

    try {
      const { data: stateData } = await client
        .from('game_state')
        .select('status, settings')
        .eq('id', 'main')
        .maybeSingle();

      const gameStatus = stateData?.status || 'Lobby';
      const rawSettings = stateData?.settings || {};
      const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...rawSettings };

      if (gameStatus === 'Läuft') {
        const { data: existingPlayers } = await client
          .from('players')
          .select('role, status')
          .neq('status', 'entfernt');

        const lateAssignment = determineLateJoinerRole(existingPlayers || [], settings);
        assignedRole = lateAssignment.role;
        assignedTeam = lateAssignment.team;
      }
    } catch (e) {
      console.warn('Error determining role during registration:', e);
    }

    // Only insert core columns that are guaranteed to exist in standard schema
    const newRecord = {
      id,
      name: playerData.name.trim(),
      costume_name: playerData.costumeName.trim(),
      photo_url: uploadedPhotoUrl,
      role: assignedRole,
      team: assignedTeam,
      status: 'lebendig',
      points: 0,
      created_at: new Date().toISOString(),
    };

    let data: any = null;
    const { data: insertedData, error } = await client
      .from('players')
      .insert([newRecord])
      .select('id, name, costume_name, photo_url, role, team, status, points, created_at')
      .single();

    if (error) {
      // Fallback: simple insert without select in case PostgREST schema cache has issues with returning select
      const retry = await client.from('players').insert([newRecord]);
      if (retry.error) {
        throw new Error(`Registrierung fehlgeschlagen: ${retry.error.message}`);
      }
      data = newRecord;
    } else {
      data = insertedData;
    }

    return {
      id: data.id,
      name: data.name,
      costumeName: data.costume_name,
      photoUrl: data.photo_url,
      role: (data.role || assignedRole) as RoleType,
      team: (data.team || assignedTeam) as TeamType,
      status: data.status || 'lebendig',
      points: data.points || 0,
      killsCount: data.kills_count || 0,
      tasksCompletedCount: data.tasks_completed_count || 0,
      cooldownUntil: data.cooldown_until || undefined,
      lastKillAt: data.last_kill_at || undefined,
      joinedAt: data.created_at,
    };
  }

  // --- ADMIN VERIFICATION & ACTIONS ---
  public async verifyAdminCode(code: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    try {
      const { data, error } = await client.rpc('check_admin_code', { input_code: code.trim() });
      if (!error && typeof data === 'boolean') return data;
    } catch {}

    try {
      const { data } = await client.from('game_state').select('admin_code').eq('id', 'main').maybeSingle();
      return (data?.admin_code || '1031') === code.trim();
    } catch {
      return false;
    }
  }

  public async startGame(adminCode: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 0. Server-seitige atomare Postgres-Funktion RPC "start_game" versuchen
    try {
      const { data: rpcStart, error: rpcStartErr } = await client.rpc('start_game', {
        p_admin_code: adminCode.trim(),
      });
      if (!rpcStartErr && rpcStart?.success) {
        return;
      }
    } catch {}

    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    const rawSettings = stateData?.settings || {};
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...rawSettings };

    // 1. Rollenverteilung: Zuerst serverseitig über Postgres RPC "assign_roles",
    // andernfalls clientseitig per exakter Zielanzahl & Fisher-Yates-Mischung
    let rpcDone = false;
    try {
      const { error: rpcError } = await client.rpc('assign_roles');
      if (!rpcError) {
        rpcDone = true;
      } else {
        console.warn('RPC assign_roles returned error:', rpcError);
      }
    } catch (rpcErr) {
      console.warn('RPC assign_roles not available, using client distribution:', rpcErr);
    }

    if (!rpcDone) {
      const { data: players } = await client.from('players').select('id').neq('status', 'entfernt');
      if (!players || players.length === 0) {
        throw new Error('Keine Spieler in der Lobby vorhanden');
      }

      const assignments = distributeRoles(players, settings);
      for (const a of assignments) {
        await this.safeUpdatePlayer(
          a.id,
          {
            role: a.role,
            team: a.team,
            status: 'lebendig',
            points: 0,
            cooldown_until: null,
            kills_count: 0,
            tasks_completed_count: 0,
          },
          ['role', 'team', 'status', 'points']
        );
      }
    }

    // Schedule initial full moon events (every 20 to 40 min, duration 5 min)
    const startTime = Date.now();
    const fullMoonTimes: FullMoonEvent[] = [];
    let nextStart = startTime + (20 + Math.floor(Math.random() * 20)) * 60 * 1000;
    for (let i = 0; i < 6; i++) {
      const ends = nextStart + 5 * 60 * 1000;
      fullMoonTimes.push({
        id: `moon_${i + 1}`,
        startsAt: new Date(nextStart).toISOString(),
        endsAt: new Date(ends).toISOString(),
      });
      nextStart = ends + (20 + Math.floor(Math.random() * 20)) * 60 * 1000;
    }

    const { error: stateError } = await client
      .from('game_state')
      .update({
        status: 'Läuft',
        started_at: new Date().toISOString(),
        ended_at: null,
        full_moon_times: fullMoonTimes,
        active_full_moon: null,
        winner_team: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');

    if (stateError) throw new Error(stateError.message);
  }

  // --- REASSIGN ROLES ---
  public async reassignRoles(adminCode: string): Promise<{ success: boolean; message: string }> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    const rawSettings = stateData?.settings || {};
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...rawSettings };

    let rpcDone = false;
    try {
      const { error: rpcError } = await client.rpc('assign_roles');
      if (!rpcError) rpcDone = true;
    } catch {}

    if (!rpcDone) {
      const { data: players } = await client.from('players').select('id').neq('status', 'entfernt');
      if (!players || players.length === 0) {
        throw new Error('Keine Spieler vorhanden');
      }
      const assignments = distributeRoles(players, settings);
      for (const a of assignments) {
        await this.safeUpdatePlayer(
          a.id,
          {
            role: a.role,
            team: a.team,
          },
          ['role', 'team']
        );
      }
    }

    return { success: true, message: 'Rollen erfolgreich neu verteilt!' };
  }

  public async abortGame(adminCode: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    await client
      .from('game_state')
      .update({
        status: 'Lobby',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');

    // Reset players back to unassigned in Lobby
    try {
      await client
        .from('players')
        .update({
          role: 'unassigned',
          team: 'Gut',
        })
        .neq('status', 'entfernt');
    } catch {}
  }

  public async endGame(adminCode: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // Zur Endzeit gewinnt das Team, das prozentual mehr seiner ursprünglichen Spieler am Leben hat
    const { data: allPlayers } = await client.from('players').select('*').neq('status', 'entfernt');
    const good = (allPlayers || []).filter((p) => p.team === 'Gut');
    const evil = (allPlayers || []).filter((p) => p.team === 'Böse');

    const goodAlive = good.filter((p) => p.status === 'lebendig').length;
    const evilAlive = evil.filter((p) => p.status === 'lebendig').length;

    const goodAliveRatio = good.length > 0 ? goodAlive / good.length : 0;
    const evilAliveRatio = evil.length > 0 ? evilAlive / evil.length : 0;

    let winner: TeamType = 'Gut';
    if (evilAliveRatio > goodAliveRatio) {
      winner = 'Böse';
    } else if (goodAliveRatio > evilAliveRatio) {
      winner = 'Gut';
    }

    await client
      .from('game_state')
      .update({
        status: 'Beendet',
        ended_at: new Date().toISOString(),
        winner_team: winner,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');
  }

  public async restartGame(adminCode: string, keepPlayers: boolean): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 0. Server-seitige atomare Postgres RPC "admin_restart_game" versuchen
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('admin_restart_game', {
        p_admin_code: adminCode.trim(),
        p_keep_players: keepPlayers,
        p_keep_photos: true,
      });
      if (!rpcErr && rpcRes?.success) {
        return;
      }
    } catch {}

    if (!keepPlayers) {
      await client.from('kills').delete().neq('killer_id', '__never__');
      await client.from('task_completions').delete().neq('player_id', '__never__');
      await client.from('special_tasks').delete().neq('player_id', '__never__');
      await client.from('photos').delete().neq('photo_url', '__never__');
      await client.from('players').delete().neq('id', '__never__');
    } else {
      try {
        await client
          .from('players')
          .update({
            role: 'unassigned',
            team: 'Gut',
            status: 'lebendig',
            points: 0,
            kills_count: 0,
            tasks_completed_count: 0,
            last_kill_at: null,
            cooldown_until: null,
          })
          .neq('id', '__never__');
      } catch {
        await client
          .from('players')
          .update({
            role: 'unassigned',
            team: 'Gut',
            status: 'lebendig',
            points: 0,
          })
          .neq('id', '__never__');
      }
      await client.from('kills').delete().neq('killer_id', '__never__');
      await client.from('task_completions').delete().neq('player_id', '__never__');
      await client.from('special_tasks').delete().neq('player_id', '__never__');
    }

    await client
      .from('game_state')
      .update({
        status: 'Lobby',
        started_at: null,
        ended_at: null,
        active_full_moon: null,
        winner_team: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');
  }

  public async playerAction(
    adminCode: string,
    playerId: string,
    action: 'entfernen' | 'wiederbeleben' | 'toeten' | 'pausieren'
  ): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    let newStatus: string;
    switch (action) {
      case 'toeten':
        newStatus = 'tot';
        break;
      case 'wiederbeleben':
        newStatus = 'lebendig';
        break;
      case 'pausieren':
        newStatus = 'pausiert';
        break;
      case 'entfernen':
        newStatus = 'entfernt';
        break;
    }

    if (action === 'entfernen') {
      const { error } = await client.from('players').delete().eq('id', playerId);
      if (error) {
        this.lastError = `Spieler entfernen fehlgeschlagen: ${error.message}`;
        throw new Error(`Spieler entfernen fehlgeschlagen: ${error.message}`);
      }
    } else {
      const { error } = await client.from('players').update({ status: newStatus }).eq('id', playerId);
      if (error) {
        this.lastError = `Aktion '${action}' fehlgeschlagen: ${error.message}`;
        throw new Error(`Aktion '${action}' fehlgeschlagen: ${error.message}`);
      }
    }
  }

  public async updateSettings(adminCode: string, newSettings: Partial<GameSettings>): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: current } = await client.from('game_state').select('settings, admin_code').eq('id', 'main').single();
    const updated = {
      ...DEFAULT_GAME_SETTINGS,
      ...(current?.settings || {}),
      ...newSettings,
    };

    const updatePayload: any = {
      settings: updated,
      updated_at: new Date().toISOString(),
    };

    if (newSettings.adminCode) {
      updatePayload.admin_code = newSettings.adminCode.trim();
    }

    await client.from('game_state').update(updatePayload).eq('id', 'main');
  }

  public async triggerManualFullMoon(adminCode: string, durationMinutes = 5): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const starts = Date.now();
    const ends = starts + durationMinutes * 60 * 1000;
    const moon: FullMoonEvent = {
      id: `manual_${starts}`,
      startsAt: new Date(starts).toISOString(),
      endsAt: new Date(ends).toISOString(),
      triggeredManually: true,
    };

    await client
      .from('game_state')
      .update({
        active_full_moon: moon,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');
  }

  public async stopFullMoon(adminCode: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) return;

    await client
      .from('game_state')
      .update({
        active_full_moon: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'main');
  }

  // --- ACTIONS: KILL & EXORCISM ---
  public async reportKill(params: {
    killerId: string;
    victimId: string;
    ghostSoloConfirmed?: boolean;
  }): Promise<{ message: string; cooldownUntil: string }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 1. Fetch killer, victim, gameState
    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    if (stateData?.status !== 'Läuft') {
      throw new Error('Das Spiel läuft derzeit nicht!');
    }

    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData.settings || {}) };

    // Check Schonfrist (grace period)
    if (stateData.started_at) {
      const elapsedMin = (Date.now() - new Date(stateData.started_at).getTime()) / (1000 * 60);
      if (elapsedMin < (settings.gracePeriodMinutes || 15)) {
        const remaining = Math.ceil((settings.gracePeriodMinutes || 15) - elapsedMin);
        throw new Error(`Schonfrist aktiv! In den ersten ${settings.gracePeriodMinutes} Min. darf niemand getötet werden (noch ${remaining} Min.)`);
      }
    }

    const { data: killer } = await client.from('players').select('*').eq('id', params.killerId).single();
    const { data: victim } = await client.from('players').select('*').eq('id', params.victimId).single();

    if (!killer || !victim) throw new Error('Spieler nicht gefunden');
    if (victim.status === 'tot') throw new Error('Dieses Opfer ist bereits tot!');
    if (killer.status === 'tot') throw new Error('Tote Spieler können niemanden töten!');

    // Check killer cooldown
    if (killer.cooldown_until) {
      const cdEnd = new Date(killer.cooldown_until).getTime();
      if (Date.now() < cdEnd) {
        const diffSec = Math.ceil((cdEnd - Date.now()) / 1000);
        throw new Error(`Cooldown noch aktiv! Bitte warte noch ${diffSec} Sekunden.`);
      }
    }

    // Role-specific kill checks
    let cooldownMinutes = 6;
    if (killer.role === 'Vampir') {
      cooldownMinutes = settings.vampireCooldownMinutes || 6;
    } else if (killer.role === 'Werwolf') {
      // Must be active full moon!
      const isMoonActive = this.isFullMoonActive(stateData);
      if (!isMoonActive) {
        throw new Error('Werwölfe können nur während des Vollmonds töten! Warte auf den Vollmond.');
      }
      cooldownMinutes = settings.werewolfCooldownMinutes || 2;
    } else if (killer.role === 'Geist') {
      if (!params.ghostSoloConfirmed) {
        throw new Error('Als Geist musst du bestätigen, dass du mit dem Opfer allein warst!');
      }
      cooldownMinutes = settings.ghostCooldownMinutes || 6;
    } else {
      throw new Error('Deine Rolle kann keine Kills melden.');
    }

    const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();

    // 1. Killer Cooldown starts immediately
    try {
      sessionStorage.setItem(`cd_${killer.id}`, cooldownUntil);
    } catch {}

    await this.safeUpdatePlayer(
      killer.id,
      {
        last_kill_at: new Date().toISOString(),
        cooldown_until: cooldownUntil,
      },
      []
    );

    // 2. Insert Kill Record (pending confirmation by victim)
    await client.from('kills').insert([
      {
        killer_id: killer.id,
        victim_id: victim.id,
        killer_name: killer.name,
        victim_name: victim.name,
        killer_role: killer.role,
        victim_role: victim.role,
        killer_team: killer.team,
        victim_team: victim.team,
        reason: 'kill',
        ghost_solo_confirmed: Boolean(params.ghostSoloConfirmed),
        confirmed: false,
      },
    ]);

    return {
      message: `Kill an ${victim.name} gemeldet! Cooldown läuft (${cooldownMinutes} Min.).`,
      cooldownUntil,
    };
  }

  public async exorcise(hunterId: string, targetId: string): Promise<{
    hit: boolean;
    victimName: string;
    victimRole: RoleType;
    message: string;
    cooldownMinutes: number;
  }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 0. Server-seitige atomare Postgres-Funktion RPC "exorcise" versuchen
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('exorcise', {
        p_hunter_id: hunterId,
        p_target_id: targetId,
      });

      if (!rpcErr && rpcRes && rpcRes.success) {
        const cdMin = rpcRes.cooldown_minutes || 15;
        const cooldownUntil = new Date(Date.now() + cdMin * 60 * 1000).toISOString();
        try {
          sessionStorage.setItem(`cd_${hunterId}`, cooldownUntil);
        } catch {}

        return {
          hit: Boolean(rpcRes.hit),
          victimName: rpcRes.target_name || '',
          victimRole: (rpcRes.target_role || 'Unbekannt') as RoleType,
          message: rpcRes.message || '',
          cooldownMinutes: cdMin,
        };
      } else if (rpcErr && rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
        throw new Error(rpcErr.message);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('function') && !err.message.includes('does not exist')) {
        throw err;
      }
      console.warn('RPC exorcise nicht verfügbar, führe Client-Fallback aus:', err);
    }

    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    if (stateData?.status !== 'Läuft') throw new Error('Das Spiel läuft derzeit nicht!');

    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData.settings || {}) };

    // Schonfrist
    if (stateData.started_at) {
      const elapsedMin = (Date.now() - new Date(stateData.started_at).getTime()) / (1000 * 60);
      if (elapsedMin < (settings.gracePeriodMinutes || 15)) {
        throw new Error(`Schonfrist aktiv (${settings.gracePeriodMinutes} Min.)!`);
      }
    }

    const { data: hunter } = await client.from('players').select('*').eq('id', hunterId).single();
    const { data: target } = await client.from('players').select('*').eq('id', targetId).single();

    if (!hunter || !target) throw new Error('Spieler nicht gefunden');
    if (hunter.role !== 'Geisterjäger') throw new Error('Nur Geisterjäger können exorzieren!');
    if (target.status === 'tot') throw new Error('Dieses Ziel ist bereits tot!');

    // Cooldown check
    if (hunter.cooldown_until) {
      const cdEnd = new Date(hunter.cooldown_until).getTime();
      if (Date.now() < cdEnd) {
        const diffMin = Math.ceil((cdEnd - Date.now()) / (1000 * 60));
        throw new Error(`Exorzismus-Sperre noch aktiv! Warte noch ${diffMin} Minuten.`);
      }
    }

    const isEvil = target.team === 'Böse' || ['Vampir', 'Werwolf', 'Geist'].includes(target.role);
    let cooldownMinutes = 15;
    let message = '';

    if (isEvil) {
      // Treffer! Böser ist sofort tot, Hunter bekommt Punkte, Cooldown 15 Min
      cooldownMinutes = settings.hunterHitCooldownMinutes || 15;
      await client.from('players').update({ status: 'tot' }).eq('id', target.id);

      const hunterPoints = (hunter.points || 0) + (settings.pointsExorcismSuccess || 25);
      const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();
      try {
        sessionStorage.setItem(`cd_${hunter.id}`, cooldownUntil);
      } catch {}

      await this.safeUpdatePlayer(
        hunter.id,
        {
          points: hunterPoints,
          kills_count: (hunter.kills_count || 0) + 1,
          cooldown_until: cooldownUntil,
        },
        ['points']
      );

      await client.from('kills').insert([
        {
          killer_id: hunter.id,
          victim_id: target.id,
          killer_name: hunter.name,
          victim_name: target.name,
          killer_role: 'Geisterjäger',
          victim_role: target.role,
          killer_team: 'Gut',
          victim_team: 'Böse',
          reason: 'exorcism',
          exorcism_hit: true,
          confirmed: true,
          confirmed_at: new Date().toISOString(),
        },
      ]);

      message = `VOLLE KRAFT! ${target.name} war ein ${target.role} und wurde erfolgreich exorziert! (+${settings.pointsExorcismSuccess} Pkt.)`;
    } else {
      // Fehlschuss! Ziel bleibt am Leben, Jäger ist 30 Min gesperrt
      cooldownMinutes = settings.hunterMissPenaltyMinutes || 30;
      const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();
      try {
        sessionStorage.setItem(`cd_${hunter.id}`, cooldownUntil);
      } catch {}

      await this.safeUpdatePlayer(
        hunter.id,
        {
          cooldown_until: cooldownUntil,
        },
        []
      );

      await client.from('kills').insert([
        {
          killer_id: hunter.id,
          victim_id: target.id,
          killer_name: hunter.name,
          victim_name: target.name,
          killer_role: 'Geisterjäger',
          victim_role: target.role,
          killer_team: 'Gut',
          victim_team: 'Gut',
          reason: 'exorcism',
          exorcism_hit: false,
          confirmed: true,
          confirmed_at: new Date().toISOString(),
        },
      ]);

      message = `FEHLSCHUSS! ${target.name} gehört zum guten Team (${target.role}) und lebt weiter! Du bist für ${cooldownMinutes} Minuten gesperrt.`;
    }

    return {
      hit: isEvil,
      victimName: target.name,
      victimRole: target.role as RoleType,
      message,
      cooldownMinutes,
    };
  }

  // ==============================================================================
  // --- 1. NEUER KILL-ABLAUF (Opfer meldet pending_death, Täter bestätigt) ---
  // ==============================================================================

  /**
   * Opfer meldet sich selbst als getötet -> setzt Status auf 'pending_death' mit Zeitstempel
   */
  public async reportPendingDeath(playerId: string): Promise<{ success: boolean; message: string }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 1. Zuerst serverseitige Postgres-Funktion RPC "report_pending_death" versuchen
    try {
      const { data, error } = await client.rpc('report_pending_death', { p_player_id: playerId });
      if (!error && data && data.success) {
        return { success: true, message: data.message || 'Warte auf Bestätigung durch den Täter.' };
      }
    } catch {}

    // 2. Client-seitiger Fallback
    const { data: player, error: fetchErr } = await client.from('players').select('id, status').eq('id', playerId).single();
    if (fetchErr || !player) throw new Error('Spieler nicht gefunden');
    if (player.status !== 'lebendig') {
      throw new Error('Nur lebende Spieler können sich als getötet melden');
    }

    const { error: updateErr } = await client
      .from('players')
      .update({
        status: 'pending_death',
        pending_death_at: new Date().toISOString(),
      })
      .eq('id', playerId);

    if (updateErr) {
      throw new Error(`Konnte Status nicht aktualisieren: ${updateErr.message}`);
    }

    return {
      success: true,
      message: 'Du hast dich als getötet gemeldet. Warte auf Bestätigung durch den Täter.',
    };
  }

  /**
   * Täter (Vampir, Werwolf, Geist) wählt ein Opfer im Status 'pending_death' und bestätigt den Kill
   */
  public async confirmKill(
    killerIdOrKillId: string,
    victimId?: string,
    ghostSoloConfirmed = false
  ): Promise<{ success: boolean; message: string; cooldownUntil?: string }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // Wenn nur 1 Parameter übergeben wurde: altes Format mit killId
    if (!victimId) {
      const { data: kill } = await client.from('kills').select('*').eq('id', killerIdOrKillId).single();
      if (!kill || kill.confirmed) return { success: true, message: 'Bereits bestätigt' };
      await client.from('players').update({ status: 'tot', pending_death_at: null }).eq('id', kill.victim_id);
      await client.from('kills').update({ confirmed: true, confirmed_at: new Date().toISOString() }).eq('id', killerIdOrKillId);
      return { success: true, message: 'Kill bestätigt' };
    }

    const killerId = killerIdOrKillId;

    // 1. Zuerst serverseitige Postgres-Funktion RPC "confirm_kill" aufrufen (atomar mit FOR UPDATE)
    try {
      const { data, error } = await client.rpc('confirm_kill', {
        p_killer_id: killerId,
        p_victim_id: victimId,
        p_ghost_solo: Boolean(ghostSoloConfirmed),
      });

      if (!error && data) {
        if (!data.success) {
          throw new Error(data.error || 'Kill-Bestätigung fehlgeschlagen');
        }
        if (data.cooldownUntil) {
          try {
            sessionStorage.setItem(`cd_${killerId}`, data.cooldownUntil);
          } catch {}
        }
        return {
          success: true,
          message: data.message || 'Kill erfolgreich bestätigt! +15 Punkte.',
          cooldownUntil: data.cooldownUntil,
        };
      }
    } catch (rpcErr: any) {
      // Wenn der Fehler eine Business-Logik-Meldung ist (z.B. Cooldown aktiv), diesen direkt weiterwerfen
      if (rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
        throw rpcErr;
      }
      console.warn('RPC confirm_kill nicht verfügbar, führe Client-Fallback aus:', rpcErr);
    }

    // 2. Client-seitiger Fallback (validiert alle Regeln serverseitig über Tabellenabfragen)
    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    if (stateData?.status !== 'Läuft') throw new Error('Das Spiel läuft derzeit nicht!');

    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData.settings || {}) };
    const now = Date.now();

    // Schonfrist prüfen
    if (stateData.started_at) {
      const elapsedMin = (now - new Date(stateData.started_at).getTime()) / (1000 * 60);
      const graceMin = settings.gracePeriodMinutes || 15;
      if (elapsedMin < graceMin) {
        const remaining = Math.ceil(graceMin - elapsedMin);
        throw new Error(`Schonfrist aktiv! Noch ${remaining} Minuten.`);
      }
    }

    const { data: killer } = await client.from('players').select('*').eq('id', killerId).single();
    const { data: victim } = await client.from('players').select('*').eq('id', victimId).single();

    if (!killer || !victim) throw new Error('Spieler nicht gefunden');
    if (killer.status !== 'lebendig') throw new Error('Nur lebende Spieler können Kills bestätigen');
    if (!['Vampir', 'Werwolf', 'Geist'].includes(killer.role)) {
      throw new Error('Nur böse Rollen (Vampir, Werwolf, Geist) können Kills bestätigen');
    }

    // Cooldown prüfen
    if (killer.cooldown_until) {
      const cdEnd = new Date(killer.cooldown_until).getTime();
      if (now < cdEnd) {
        const diffSec = Math.ceil((cdEnd - now) / 1000);
        throw new Error(`Dein Cooldown ist noch aktiv! Bitte warte noch ${diffSec} Sekunden.`);
      }
    }

    // Werwolf nur bei Vollmond
    if (killer.role === 'Werwolf' && !this.isFullMoonActive(stateData)) {
      throw new Error('Werwölfe können nur bei aktivem Vollmond töten!');
    }

    // Geist Allein-im-Raum Checkbox
    if (killer.role === 'Geist' && !ghostSoloConfirmed) {
      throw new Error('Als Geist musst du bestätigen, dass du mit dem Opfer allein im Raum warst!');
    }

    // Opfer-Status prüfen
    if (victim.status !== 'pending_death' && victim.status !== 'tod_ausstehend') {
      throw new Error('Dieses Opfer ist nicht im Status "Tod ausstehend" oder wurde bereits bestätigt!');
    }

    // Cooldown berechnen
    let cooldownMinutes = 6;
    if (killer.role === 'Vampir') cooldownMinutes = settings.vampireCooldownMinutes || 6;
    else if (killer.role === 'Werwolf') cooldownMinutes = settings.werewolfCooldownMinutes || 2;
    else if (killer.role === 'Geist') cooldownMinutes = settings.ghostCooldownMinutes || 6;

    const cooldownUntil = new Date(now + cooldownMinutes * 60 * 1000).toISOString();
    try {
      sessionStorage.setItem(`cd_${killer.id}`, cooldownUntil);
    } catch {}

    // Opfer endgültig töten
    await client
      .from('players')
      .update({ status: 'tot', pending_death_at: null })
      .eq('id', victim.id);

    // Täter Punkte und Cooldown
    await this.safeUpdatePlayer(
      killer.id,
      {
        points: (killer.points || 0) + (settings.pointsEvilKill || 15),
        kills_count: (killer.kills_count || 0) + 1,
        last_kill_at: new Date().toISOString(),
        cooldown_until: cooldownUntil,
      },
      ['points']
    );

    // Kill ins Log eintragen
    await client.from('kills').insert([
      {
        killer_id: killer.id,
        victim_id: victim.id,
        killer_name: killer.name,
        victim_name: victim.name,
        killer_role: killer.role,
        victim_role: victim.role,
        killer_team: 'Böse',
        victim_team: victim.team,
        reason: 'kill',
        ghost_solo_confirmed: Boolean(ghostSoloConfirmed),
        confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    ]);

    return {
      success: true,
      message: `Kill an ${victim.name} erfolgreich bestätigt! +15 Punkte.`,
      cooldownUntil,
    };
  }

  /**
   * Admin-Funktionen: Kill manuell bestätigen oder Spieler wiederbeleben
   */
  public async adminConfirmKill(adminCode: string, victimId: string, killerId?: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    try {
      const { data, error } = await client.rpc('admin_confirm_kill', {
        p_admin_code: adminCode,
        p_victim_id: victimId,
        p_killer_id: killerId || null,
      });
      if (!error && data?.success) return;
    } catch {}

    const { data: victim } = await client.from('players').select('*').eq('id', victimId).single();
    if (!victim) throw new Error('Opfer nicht gefunden');

    await client.from('players').update({ status: 'tot', pending_death_at: null }).eq('id', victimId);

    await client.from('kills').insert([
      {
        killer_id: killerId || null,
        victim_id: victim.id,
        killer_name: killerId ? 'Täter' : 'Admin-Bestätigung',
        victim_name: victim.name,
        victim_role: victim.role,
        reason: 'admin_confirmed',
        confirmed: true,
        confirmed_at: new Date().toISOString(),
      },
    ]);
  }

  public async adminRevivePlayer(adminCode: string, playerId: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    try {
      const { data, error } = await client.rpc('admin_revive_player', {
        p_admin_code: adminCode,
        p_player_id: playerId,
      });
      if (!error && data?.success) return;
    } catch {}

    await client
      .from('players')
      .update({ status: 'lebendig', pending_death_at: null })
      .eq('id', playerId);
  }

  /**
   * tickGame: Führt serverseitigen Postgres-Ticker tick_game() aus oder Client-Fallback.
   * Prüft:
   * 1. 4-Minuten-Timeout für ausstehende Tode (wiederbeleben vs. als tot lassen)
   * 2. Foto-Aufgaben Generierung für jeden lebenden Spieler alle 10 Minuten (Slot-basiert, max 3 offene)
   * 3. 30-Minuten-Ablauf für offene Foto-Aufgaben
   * 4. Spezialaufgaben für lebende Menschen alle 10-20 Minuten
   */
  public async tickGame(): Promise<any> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const { data, error } = await client.rpc('tick_game');
      if (!error && data) {
        return data;
      }
    } catch {}

    return await this.fallbackTickGame();
  }

  private async fallbackTickGame(): Promise<any> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
      if (!stateData || stateData.status !== 'Läuft' || !stateData.started_at) {
        return { status: 'idle' };
      }

      const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData.settings || {}) };
      const now = Date.now();
      const elapsedMin = Math.floor((now - new Date(stateData.started_at).getTime()) / (1000 * 60));

      // ------------------------------------------------------------------------
      // A) Ausstehende Tode prüfen (Standard: 4 Minuten Frist)
      // ------------------------------------------------------------------------
      const timeoutMin = settings.pendingDeathTimeoutMinutes ?? 4;
      const unconfirmedAction = settings.unconfirmedKillAction ?? 'revive';

      const { data: pendingPlayers } = await client
        .from('players')
        .select('*')
        .in('status', ['pending_death', 'tod_ausstehend']);

      if (pendingPlayers && pendingPlayers.length > 0) {
        for (const p of pendingPlayers) {
          if (!p.pending_death_at) continue;
          const pendingTime = new Date(p.pending_death_at).getTime();
          if (now - pendingTime >= timeoutMin * 60 * 1000) {
            if (unconfirmedAction === 'stay_dead') {
              await client.from('players').update({ status: 'tot', pending_death_at: null }).eq('id', p.id);
            } else {
              await client.from('players').update({ status: 'lebendig', pending_death_at: null }).eq('id', p.id);
            }

            await client.from('kills').insert([
              {
                killer_id: null,
                victim_id: p.id,
                killer_name: 'Nicht bestätigt',
                victim_name: p.name,
                victim_role: p.role,
                reason: 'unconfirmed_timeout',
                confirmed: true,
                confirmed_at: new Date().toISOString(),
              },
            ]);
          }
        }
      }

      // ------------------------------------------------------------------------
      // B) Foto-Aufgaben generieren (alle 10 Min, max 3 offene, 30 Min Ablauf)
      // ------------------------------------------------------------------------
      const photoInterval = settings.photoTaskIntervalMinutes ?? 10;
      const currentSlot = Math.floor(elapsedMin / photoInterval);

      const { data: livingPlayers } = await client
        .from('players')
        .select('id, name, costume_name, photo_url')
        .eq('status', 'lebendig');

      if (livingPlayers && livingPlayers.length > 0) {
        // Zuerst abgelaufene Aufgaben (älter als 30 Min) auf 'expired' setzen
        try {
          await client
            .from('player_photo_tasks')
            .update({ status: 'expired' })
            .eq('status', 'open')
            .lt('expires_at', new Date().toISOString());
        } catch {}

        for (const lp of livingPlayers) {
          try {
            // Prüfen, ob für diesen Slot schon eine Aufgabe existiert
            const { data: existingSlot } = await client
              .from('player_photo_tasks')
              .select('id')
              .eq('player_id', lp.id)
              .eq('slot_number', currentSlot)
              .maybeSingle();

            if (existingSlot) continue;

            // Prüfen, ob bereits 3 offene Aufgaben vorliegen
            const { count } = await client
              .from('player_photo_tasks')
              .select('id', { count: 'exact', head: true })
              .eq('player_id', lp.id)
              .eq('status', 'open');

            if ((count || 0) >= 3) continue;

            // Andere lebende Spieler zur Auswahl
            const others = livingPlayers.filter((o) => o.id !== lp.id);
            if (others.length === 0) continue;

            const target = others[Math.floor(Math.random() * others.length)];
            const secondOthers = others.filter((o) => o.id !== target.id);
            const secondTarget = secondOthers.length > 0 ? secondOthers[Math.floor(Math.random() * secondOthers.length)] : null;

            const taskTypeRandom = Math.floor(Math.random() * 4);
            let title = '';
            let description = '';
            let taskType = 'specific_player';
            let targetPlayerId: string | null = null;
            let targetPlayerName: string | null = null;
            let targetPlayerCostume: string | null = null;
            let targetPlayerPhoto: string | null = null;
            let targetSecondPlayerId: string | null = null;
            let targetSecondPlayerName: string | null = null;
            let targetCostumeName: string | null = null;
            let groupCount: number | null = null;

            if (taskTypeRandom === 0) {
              // 1. Foto mit bestimmtem Spieler (niemals Rolle nennen!)
              taskType = 'specific_player';
              title = `Foto mit ${target.name}`;
              description = `Mach ein Foto mit ${target.name} (${target.costume_name || 'Grusel-Kostüm'}).`;
              targetPlayerId = target.id;
              targetPlayerName = target.name;
              targetPlayerCostume = target.costume_name;
              targetPlayerPhoto = target.photo_url;
            } else if (taskTypeRandom === 1) {
              // 2. Foto mit jemandem in bestimmtem Kostüm
              taskType = 'specific_costume';
              const costume = target.costume_name || 'Hexen- oder Vampirkostüm';
              title = `Kostüm: ${costume}`;
              description = `Mach ein Foto mit jemandem im Kostüm "${costume}".`;
              targetCostumeName = costume;
            } else if (taskTypeRandom === 2) {
              // 3. Gruppenfoto (3 bis 8 Leute)
              taskType = 'group';
              const countNeeded = Math.floor(Math.random() * 6) + 3; // 3 bis 8
              title = `Gruppenfoto (${countNeeded} Personen)`;
              description = `Mach ein Gruppenfoto mit mindestens ${countNeeded} Leuten!`;
              groupCount = countNeeded;
            } else {
              // 4. Foto mit zwei Personen zusammen
              if (secondTarget) {
                taskType = 'two_players';
                title = `Foto mit ${target.name} & ${secondTarget.name}`;
                description = `Mach ein Foto mit ${target.name} und ${secondTarget.name} zusammen.`;
                targetPlayerId = target.id;
                targetPlayerName = target.name;
                targetPlayerCostume = target.costume_name;
                targetPlayerPhoto = target.photo_url;
                targetSecondPlayerId = secondTarget.id;
                targetSecondPlayerName = secondTarget.name;
              } else {
                taskType = 'specific_player';
                title = `Foto mit ${target.name}`;
                description = `Mach ein Foto mit ${target.name}.`;
                targetPlayerId = target.id;
                targetPlayerName = target.name;
                targetPlayerCostume = target.costume_name;
                targetPlayerPhoto = target.photo_url;
              }
            }

            const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();

            await client.from('player_photo_tasks').insert([
              {
                player_id: lp.id,
                slot_number: currentSlot,
                title,
                description,
                task_type: taskType,
                target_player_id: targetPlayerId,
                target_player_name: targetPlayerName,
                target_player_costume: targetPlayerCostume,
                target_player_photo: targetPlayerPhoto,
                target_second_player_id: targetSecondPlayerId,
                target_second_player_name: targetSecondPlayerName,
                target_costume_name: targetCostumeName,
                group_count: groupCount,
                points: settings.pointsPhotoTask || 10,
                status: 'open',
                expires_at: expiresAt,
              },
            ]);
          } catch {}
        }
      }

      // ------------------------------------------------------------------------
      // C) Spezialaufgaben für lebende Menschen (alle 10-20 Minuten, 1-2 Spieler)
      // ------------------------------------------------------------------------
      const { data: livingHumans } = await client
        .from('players')
        .select('id, name')
        .eq('role', 'Mensch')
        .eq('status', 'lebendig');

      if (livingHumans && livingHumans.length > 0) {
        // Prüfen, wann die letzte Spezialaufgabe erzeugt wurde
        const { data: lastSpecials } = await client
          .from('special_tasks')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1);

        let shouldTriggerSpecial = false;
        if (!lastSpecials || lastSpecials.length === 0) {
          if (elapsedMin >= 10) shouldTriggerSpecial = true;
        } else {
          const lastTime = new Date(lastSpecials[0].created_at).getTime();
          const minutesSinceLast = (now - lastTime) / (1000 * 60);
          if (minutesSinceLast >= 15) shouldTriggerSpecial = true;
        }

        if (shouldTriggerSpecial) {
          // Wähle 1 bis 2 zufällige Menschen aus
          const shuffledHumans = [...livingHumans].sort(() => 0.5 - Math.random());
          const chosenCount = Math.min(shuffledHumans.length, Math.floor(Math.random() * 2) + 1);
          const chosenHumans = shuffledHumans.slice(0, chosenCount);

          const miniGameTypes: ('math' | 'anagram' | 'sequence' | 'quiz' | 'code')[] = [
            'math',
            'anagram',
            'sequence',
            'quiz',
            'code',
          ];

          for (const human of chosenHumans) {
            const chosenType = miniGameTypes[Math.floor(Math.random() * miniGameTypes.length)];
            let title = '';
            let description = '';
            let taskData: any = {};

            if (chosenType === 'math') {
              title = 'Spezialaufgabe: Kopfrechnen';
              description = 'Löse 3 Kopfrechenaufgaben nacheinander in 60 Sekunden!';
              taskData = {
                math: {
                  questions: generateMathQuestions(),
                  timeLimitSeconds: 60,
                },
              };
            } else if (chosenType === 'anagram') {
              const anagramItem = HALLOWEEN_ANAGRAMS[Math.floor(Math.random() * HALLOWEEN_ANAGRAMS.length)];
              const scrambled = generateScrambledWord(anagramItem.word);
              title = 'Spezialaufgabe: Halloween-Anagramm';
              description = `Entschlüssle das Buchstabensalat-Wort "${scrambled}" in 30 Sekunden!`;
              taskData = {
                anagram: {
                  scrambledWord: scrambled,
                  originalWord: anagramItem.word,
                  hint: anagramItem.hint,
                  timeLimitSeconds: 30,
                },
              };
            } else if (chosenType === 'sequence') {
              const seq = generateSequence(5);
              title = 'Spezialaufgabe: Merk-Sequenz';
              description = 'Merke dir die Reihenfolge der 5 Halloween-Symbole und tippe sie nach!';
              taskData = {
                sequence: {
                  symbols: ['🎃', '👻', '🦇', '💀', '🕷️'],
                  sequence: seq,
                  timeLimitSeconds: 40,
                },
              };
            } else if (chosenType === 'quiz') {
              const q = DEFAULT_QUIZ_QUESTIONS[Math.floor(Math.random() * DEFAULT_QUIZ_QUESTIONS.length)];
              title = 'Spezialaufgabe: Halloween-Quiz';
              description = 'Beantworte die Grusel-Frage richtig in 20 Sekunden!';
              taskData = {
                quiz: {
                  question: q.question,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  explanation: q.explanation,
                  timeLimitSeconds: 20,
                },
              };
            } else {
              // Code
              const secret = generateSecretCode(4);
              title = 'Spezialaufgabe: Geheimcode knacken';
              description = 'Finde den 4-stelligen Geheimcode in 45 Sekunden durch logisches Raten!';
              taskData = {
                code: {
                  secretCode: secret,
                  timeLimitSeconds: 45,
                },
              };
            }

            const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();

            try {
              await client.from('special_tasks').insert([
                {
                  player_id: human.id,
                  type: chosenType,
                  title,
                  description,
                  points: settings.pointsSpecialTask || 20,
                  task_data: taskData,
                  status: 'pending',
                  expires_at: expiresAt,
                },
              ]);
            } catch {}
          }
        }
      }

      return { status: 'success', elapsedMin };
    } catch (err: any) {
      console.warn('Fallback tick_game error:', err);
      return { status: 'error', error: err?.message };
    }
  }

  // Für Abwärtskompatibilität: altes reportSelfDeath leitet auf reportPendingDeath um
  public async reportSelfDeath(
    playerId: string,
    _killerRole: string = 'Unbekannt'
  ): Promise<{ confirmedExisting: boolean; message: string }> {
    const res = await this.reportPendingDeath(playerId);
    return {
      confirmedExisting: false,
      message: res.message,
    };
  }

  public async adminUndoKill(adminCode: string, killId: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: kill } = await client.from('kills').select('*').eq('id', killId).single();
    if (!kill) throw new Error('Kill nicht gefunden');

    // Revive victim
    await client.from('players').update({ status: 'lebendig', pending_death_at: null }).eq('id', kill.victim_id);

    // Deduct killer points
    if (kill.killer_id) {
      const { data: killer } = await client.from('players').select('points, kills_count').eq('id', kill.killer_id).single();
      if (killer) {
        await this.safeUpdatePlayer(
          kill.killer_id,
          {
            points: Math.max(0, (killer.points || 0) - 15),
            kills_count: Math.max(0, (killer.kills_count || 0) - 1),
          },
          ['points']
        );
      }
    }

    // Delete kill record
    await client.from('kills').delete().eq('id', killId);
  }

  // --- PHOTO TASKS (Upload photo for task without tagging) ---
  public async completePhotoTask(params: {
    playerId: string;
    taskId: string;
    taskTitle: string;
    photoBlobOrUrl: Blob | File | string;
    slotNumber?: number;
  }): Promise<{ pointsAwarded: number }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: stateData } = await client.from('game_state').select('settings').eq('id', 'main').single();
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData?.settings || {}) };

    const { data: player } = await client.from('players').select('*').eq('id', params.playerId).single();
    if (!player) throw new Error('Spieler nicht gefunden');

    const uploadedPhotoUrl = await this.uploadPhoto(params.photoBlobOrUrl, 'task');
    const taskPoints = settings.pointsPhotoTask || 10;

    // 1. Task in player_photo_tasks als abgeschlossen markieren
    try {
      if (params.taskId) {
        await client
          .from('player_photo_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            photo_url: uploadedPhotoUrl || null,
          })
          .eq('id', params.taskId);
      }
    } catch {}

    // 2. Insert completion (keine Personen-Tags)
    await client.from('task_completions').insert([
      {
        task_id: params.taskId,
        player_id: player.id,
        player_name: player.name,
        photo_url: uploadedPhotoUrl || null,
        points_awarded: taskPoints,
      },
    ]);

    // 3. Award player points (+10 Pkt)
    await this.safeUpdatePlayer(
      player.id,
      {
        points: (player.points || 0) + taskPoints,
        tasks_completed_count: (player.tasks_completed_count || 0) + 1,
      },
      ['points']
    );

    // 4. In die zentrale Galerie einfügen (Aufgabe, Uhrzeit, Fotograf - keine Rollen!)
    if (uploadedPhotoUrl) {
      await client.from('photos').insert([
        {
          photo_url: uploadedPhotoUrl,
          task_id: params.taskId,
          caption: params.taskTitle,
          player_id: player.id,
          photographer_name: player.name,
        },
      ]);
    }

    return { pointsAwarded: taskPoints };
  }

  // --- SPECIAL TASKS FOR HUMANS (Kopfrechnen, Anagramm, Merk-Sequenz, Quiz, Geheimcode) ---
  public async getPendingSpecialTask(playerId: string): Promise<SpecialTaskAssignment | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const { data } = await client
        .from('special_tasks')
        .select('*')
        .eq('player_id', playerId)
        .eq('status', 'pending')
        .is('completed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      return {
        id: data.id,
        playerId: data.player_id,
        type: data.type,
        title: data.title,
        description: data.description,
        points: data.points || 20,
        createdAt: data.created_at,
        expiresAt: data.expires_at,
        completedAt: data.completed_at,
        status: data.status || 'pending',
        rewardRevealedPlayerId: data.reward_player_id,
        rewardRevealedPlayerName: data.reward_player_name,
        rewardRevealedRole: data.reward_role,
        taskData: data.task_data || {},
      };
    } catch {
      return null;
    }
  }

  public async completeSpecialTask(params: {
    specialTaskId: string;
    playerId: string;
    userAnswer?: number;
    mathAnswers?: number[];
    anagramAnswer?: string;
    sequenceAnswer?: string[];
    codeAnswer?: string;
  }): Promise<{
    success: boolean;
    rewardPlayerName: string;
    rewardRole: RoleType;
    message: string;
  }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: st } = await client.from('special_tasks').select('*').eq('id', params.specialTaskId).single();
    if (!st) throw new Error('Spezialaufgabe nicht gefunden');
    if (st.completed_at) throw new Error('Diese Aufgabe wurde bereits abgeschlossen');

    // Ablaufdatum prüfen
    if (st.expires_at && new Date(st.expires_at).getTime() < Date.now()) {
      await client.from('special_tasks').update({ status: 'expired' }).eq('id', params.specialTaskId);
      throw new Error('Die Frist für diese Spezialaufgabe ist abgelaufen!');
    }

    const taskData = st.task_data || {};

    // 1. Antwort prüfen
    if (st.type === 'math') {
      const questions = taskData.math?.questions || [];
      const answers = params.mathAnswers || [];
      const isAllCorrect = questions.every((q: any, idx: number) => Number(answers[idx]) === Number(q.answer));
      if (!isAllCorrect) {
        throw new Error('Nicht alle Kopfrechenaufgaben waren korrekt!');
      }
    } else if (st.type === 'anagram') {
      const target = (taskData.anagram?.originalWord || '').trim().toUpperCase();
      const user = (params.anagramAnswer || '').trim().toUpperCase();
      if (user !== target) {
        throw new Error('Das eingegebene Anagramm-Wort ist leider nicht richtig!');
      }
    } else if (st.type === 'sequence') {
      const targetSeq = taskData.sequence?.sequence || [];
      const userSeq = params.sequenceAnswer || [];
      if (targetSeq.join(',') !== userSeq.join(',')) {
        throw new Error('Die eingegebene Symbol-Reihenfolge war leider falsch!');
      }
    } else if (st.type === 'quiz') {
      const correctIdx = taskData.quiz?.correctIndex ?? 0;
      if (params.userAnswer !== correctIdx) {
        throw new Error('Leider falsch geantwortet!');
      }
    } else if (st.type === 'code') {
      const secret = (taskData.code?.secretCode || '').trim();
      const userCode = (params.codeAnswer || '').trim();
      if (userCode !== secret) {
        throw new Error('Falscher Geheimcode!');
      }
    }

    // 2. Vorherige Enthüllungen dieses Spielers abrufen, um Wiederholungen zu vermeiden
    let alreadyRevealedIds = new Set<string>();
    try {
      const { data: pastRevealed } = await client
        .from('special_tasks')
        .select('reward_player_id')
        .eq('player_id', params.playerId)
        .eq('status', 'completed')
        .not('reward_player_id', 'is', null);

      if (pastRevealed && Array.isArray(pastRevealed)) {
        pastRevealed.forEach((r: any) => {
          if (r.reward_player_id) alreadyRevealedIds.add(r.reward_player_id);
        });
      }
    } catch {}

    // Zufälligen lebenden BÖSEN Spieler finden, dessen Rolle aufgedeckt wird!
    const { data: evilPlayers } = await client
      .from('players')
      .select('id, name, role')
      .neq('id', params.playerId)
      .eq('status', 'lebendig')
      .in('role', ['Vampir', 'Werwolf', 'Geist']);

    let revealedName = 'Ein dunkler Schatten';
    let revealedRole: RoleType = 'Vampir';
    let revealedId = '';

    if (evilPlayers && evilPlayers.length > 0) {
      // Unbekannte böse Spieler bevorzugen
      const unrevealedEvil = evilPlayers.filter((ep: any) => !alreadyRevealedIds.has(ep.id));
      const pool = unrevealedEvil.length > 0 ? unrevealedEvil : evilPlayers;
      const randomEvil = pool[Math.floor(Math.random() * pool.length)];
      revealedId = randomEvil.id;
      revealedName = randomEvil.name;
      revealedRole = randomEvil.role as RoleType;
    } else {
      // Falls keine bösen mehr leben: beliebiger lebender Spieler
      const { data: anyLiving } = await client
        .from('players')
        .select('id, name, role')
        .neq('id', params.playerId)
        .eq('status', 'lebendig');
      if (anyLiving && anyLiving.length > 0) {
        const rand = anyLiving[Math.floor(Math.random() * anyLiving.length)];
        revealedId = rand.id;
        revealedName = rand.name;
        revealedRole = rand.role as RoleType;
      }
    }

    const { data: stateData } = await client.from('game_state').select('settings').eq('id', 'main').single();
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData?.settings || {}) };
    const taskPoints = settings.pointsSpecialTask || 20;

    // Punkte gutschreiben
    const { data: player } = await client.from('players').select('points').eq('id', params.playerId).single();
    if (player) {
      await client
        .from('players')
        .update({ points: (player.points || 0) + taskPoints })
        .eq('id', params.playerId);
    }

    // Aufgabe als abgeschlossen markieren
    await client
      .from('special_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        reward_player_id: revealedId,
        reward_player_name: revealedName,
        reward_role: revealedRole,
      })
      .eq('id', params.specialTaskId);

    return {
      success: true,
      rewardPlayerName: revealedName,
      rewardRole: revealedRole,
      message: `Geheimnis aufgedeckt: ${revealedName} ist ein ${revealedRole}! Gib diese Information diskret an einen Geisterjäger weiter.`,
    };
  }

  // --- FULL MOON HELPER ---
  public isFullMoonActive(gameState: any): boolean {
    if (gameState?.active_full_moon) {
      const ends = new Date(gameState.active_full_moon.endsAt).getTime();
      return Date.now() < ends;
    }
    const times: FullMoonEvent[] = gameState?.full_moon_times || [];
    const now = Date.now();
    return times.some((t) => {
      const s = new Date(t.startsAt).getTime();
      const e = new Date(t.endsAt).getTime();
      return now >= s && now <= e;
    });
  }

  public getNextFullMoon(gameState: any): { startsInMinutes: number; durationMinutes: number } | null {
    const times: FullMoonEvent[] = gameState?.full_moon_times || [];
    const now = Date.now();
    const future = times
      .map((t) => ({ ...t, startMs: new Date(t.startsAt).getTime() }))
      .filter((t) => t.startMs > now)
      .sort((a, b) => a.startMs - b.startMs);

    if (future.length === 0) return null;
    const next = future[0];
    const diffMin = Math.ceil((next.startMs - now) / (1000 * 60));
    const durationMin = Math.round((new Date(next.endsAt).getTime() - next.startMs) / (1000 * 60));
    return { startsInMinutes: diffMin, durationMinutes: durationMin };
  }

  // --- DELETE PHOTO (Fotograf oder Admin) ---
  public async deletePhoto(options: { photoId: string; playerId?: string; adminCode?: string }): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 1. Serverseitige Prüfung per Postgres RPC falls vorhanden
    try {
      const { data: rpcSuccess, error: rpcErr } = await client.rpc('delete_photo', {
        p_photo_id: options.photoId,
        p_player_id: options.playerId || null,
        p_admin_code: options.adminCode || null,
      });
      if (!rpcErr && rpcSuccess) {
        return;
      }
    } catch {
      // Fallback auf direkte Abfrage
    }

    // 2. Direkte Prüfung und Löschung
    if (options.adminCode) {
      const isValid = await this.verifyAdminCode(options.adminCode);
      if (!isValid) throw new Error('Ungültiger Admin-Code');
      const { error: delErr } = await client.from('photos').delete().eq('id', options.photoId);
      if (delErr) throw new Error(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    if (options.playerId) {
      const { data: existing, error: fetchErr } = await client
        .from('photos')
        .select('player_id')
        .eq('id', options.photoId)
        .single();
      if (fetchErr) throw new Error(`Foto nicht gefunden: ${fetchErr.message}`);
      if (existing?.player_id !== options.playerId) {
        throw new Error('Du kannst nur Fotos löschen, die du selbst hochgeladen hast!');
      }
      const { error: delErr } = await client
        .from('photos')
        .delete()
        .eq('id', options.photoId)
        .eq('player_id', options.playerId);
      if (delErr) throw new Error(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }

    throw new Error('Keine Berechtigung zum Löschen des Fotos');
  }

  // --- SUBSCRIBE TO REALTIME ---
  public subscribeToRealtime(onChange: () => void): () => void {
    const client = this.getClient();
    if (!client) {
      this.realtimeStatus = 'POLLING_ONLY';
      return () => {};
    }

    try {
      this.realtimeStatus = 'CONNECTING';

      const channel = client
        .channel('halloween_party_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kills' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'special_tasks' }, () => onChange())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.realtimeStatus = 'CONNECTED';
          } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            this.realtimeStatus = 'ERROR';
          } else if (status === 'CLOSED') {
            this.realtimeStatus = 'DISCONNECTED';
          }
        });

      this.channel = channel;
      return () => {
        channel.unsubscribe();
      };
    } catch (err: any) {
      this.realtimeStatus = 'POLLING_ONLY';
      this.lastError = err?.message;
      return () => {};
    }
  }
}

export const supabaseService = new SupabaseService();
