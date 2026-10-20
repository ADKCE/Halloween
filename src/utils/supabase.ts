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
} from '../types/game';
import { DEFAULT_PHOTO_TASKS, DEFAULT_QUIZ_QUESTIONS } from './gameDataPool';

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
  killConfirmationTimeoutMinutes: 5,
  fullMoonMinIntervalMinutes: 20,
  fullMoonMaxIntervalMinutes: 40,
  fullMoonDurationMinutes: 5,
  pointsPhotoTask: 10,
  pointsSpecialTask: 20,
  pointsTaggedCoPlayer: 2,
  pointsEvilKill: 15,
  pointsExorcismSuccess: 25,
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

      // Find self
      const selfPlayer = (playersData || []).find((p: any) => playerId && p.id === playerId);
      const isSelfHunter = selfPlayer && selfPlayer.role === 'Geisterjäger';

      // Role secrecy rules:
      // - If game is 'Beendet' -> everyone sees all roles
      // - Admin -> sees all roles
      // - Self -> sees own role
      // - Hunter -> sees other Hunters' roles too
      // - Otherwise -> 'Unbekannt'
      const isGameEnded = gameState.status === 'Beendet';

      const mappedPlayers: Player[] = (playersData || []).map((p: any) => {
        const isSelf = playerId && p.id === playerId;
        const isHunterTeammate = isSelfHunter && p.role === 'Geisterjäger';
        const canSeeRole = isGameEnded || isAdmin || isSelf || isHunterTeammate;

        return {
          id: p.id,
          name: p.name,
          costumeName: p.costume_name || '',
          photoUrl: p.photo_url || '',
          role: (canSeeRole ? p.role : 'Unbekannt') as RoleType,
          team: (canSeeRole ? p.team : 'Gut') as TeamType,
          status: p.status || 'lebendig',
          points: p.points || 0,
          killsCount: p.kills_count || 0,
          tasksCompletedCount: p.tasks_completed_count || 0,
          cooldownUntil: p.cooldown_until || undefined,
          lastKillAt: p.last_kill_at || undefined,
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

      // Check auto-confirmation of pending kills (if older than killConfirmationTimeoutMinutes)
      if (gameState.status === 'Läuft') {
        const timeoutMinutes = settings.killConfirmationTimeoutMinutes || 5;
        const now = Date.now();
        const pendingKills = mappedKills.filter((k) => !k.confirmed);
        for (const pk of pendingKills) {
          const killTime = new Date(pk.createdAt).getTime();
          if (now - killTime > timeoutMinutes * 60 * 1000) {
            // Auto confirm!
            this.confirmKill(pk.id, true).catch((e) => console.warn('Auto confirm error:', e));
          }
        }
      }

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
        playerId: c.player_id,
        playerName: c.player_name,
        photoUrl: c.photo_url,
        taggedPlayerIds: c.tagged_player_ids || [],
        taggedPlayerNames: c.tagged_player_names || [],
        pointsAwarded: c.points_awarded || 10,
        completedAt: c.completed_at,
      }));

      // 6. Fetch photos (gallery)
      const { data: photosData } = await client
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const mappedPhotos: PartyPhoto[] = (photosData || []).map((ph: any) => ({
        id: ph.id,
        photoUrl: ph.photo_url,
        taskId: ph.task_id,
        caption: ph.caption,
        playerId: ph.player_id,
        photographerName: ph.photographer_name,
        taggedPlayerNames: ph.tagged_player_names || [],
        createdAt: ph.created_at,
      }));

      this.lastSyncTime = new Date().toLocaleTimeString();
      this.lastError = null;

      return {
        gameState,
        players: mappedPlayers,
        kills: mappedKills,
        tasks: mappedTasks,
        taskCompletions: mappedCompletions,
        photos: mappedPhotos,
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

    // Only insert core columns that are guaranteed to exist in standard schema
    const newRecord = {
      id,
      name: playerData.name.trim(),
      costume_name: playerData.costumeName.trim(),
      photo_url: uploadedPhotoUrl,
      role: 'Mensch',
      team: 'Gut',
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
      role: (data.role || 'Mensch') as RoleType,
      team: (data.team || 'Gut') as TeamType,
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

    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    const rawSettings = stateData?.settings || {};
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...rawSettings };

    const { data: players } = await client.from('players').select('*').neq('status', 'entfernt');
    if (!players || players.length === 0) {
      throw new Error('Keine Spieler in der Lobby vorhanden');
    }

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const total = shuffled.length;

    const numVampires = Math.min(settings.vampireCount || 6, total);
    const numWerewolves = Math.min(settings.werewolfCount || 4, Math.max(0, total - numVampires));
    const numGhosts = Math.min(settings.ghostCount || 4, Math.max(0, total - numVampires - numWerewolves));
    const numHunters = Math.min(
      settings.hunterCount || 10,
      Math.max(0, total - numVampires - numWerewolves - numGhosts)
    );

    let idx = 0;
    const assignments: { id: string; role: RoleType; team: TeamType }[] = [];

    for (let i = 0; i < numVampires && idx < total; i++, idx++) {
      assignments.push({ id: shuffled[idx].id, role: 'Vampir', team: 'Böse' });
    }
    for (let i = 0; i < numWerewolves && idx < total; i++, idx++) {
      assignments.push({ id: shuffled[idx].id, role: 'Werwolf', team: 'Böse' });
    }
    for (let i = 0; i < numGhosts && idx < total; i++, idx++) {
      assignments.push({ id: shuffled[idx].id, role: 'Geist', team: 'Böse' });
    }
    for (let i = 0; i < numHunters && idx < total; i++, idx++) {
      assignments.push({ id: shuffled[idx].id, role: 'Geisterjäger', team: 'Gut' });
    }
    while (idx < total) {
      assignments.push({ id: shuffled[idx].id, role: 'Mensch', team: 'Gut' });
      idx++;
    }

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
            role: 'Mensch',
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
            role: 'Mensch',
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
      await client.from('players').delete().eq('id', playerId);
    } else {
      await client.from('players').update({ status: newStatus }).eq('id', playerId);
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

  // --- CONFIRM OR UNDO KILL ---
  public async confirmKill(killId: string, auto = false): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: kill } = await client.from('kills').select('*').eq('id', killId).single();
    if (!kill) return;
    if (kill.confirmed) return;

    const { data: stateData } = await client.from('game_state').select('settings').eq('id', 'main').single();
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData?.settings || {}) };

    // 1. Mark victim as tot
    await client.from('players').update({ status: 'tot' }).eq('id', kill.victim_id);

    // 2. Award killer points (+15 Pkt für bösen Kill)
    const { data: killer } = await client.from('players').select('points, kills_count').eq('id', kill.killer_id).single();
    if (killer) {
      await this.safeUpdatePlayer(
        kill.killer_id,
        {
          points: (killer.points || 0) + (settings.pointsEvilKill || 15),
          kills_count: (killer.kills_count || 0) + 1,
        },
        ['points']
      );
    }

    // 3. Mark kill confirmed
    await client
      .from('kills')
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        auto_confirmed: auto,
      })
      .eq('id', killId);
  }

  public async adminUndoKill(adminCode: string, killId: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: kill } = await client.from('kills').select('*').eq('id', killId).single();
    if (!kill) throw new Error('Kill nicht gefunden');

    // Revive victim
    await client.from('players').update({ status: 'lebendig' }).eq('id', kill.victim_id);

    // Deduct killer points
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

    // Delete kill record
    await client.from('kills').delete().eq('id', killId);
  }

  // --- PHOTO TASKS (2 open tasks per player with tagged co-players) ---
  public async completePhotoTask(params: {
    playerId: string;
    taskId: string;
    taskTitle: string;
    photoBlobOrUrl: Blob | File | string;
    taggedPlayerIds: string[];
  }): Promise<{ pointsAwarded: number; bonusPointsTotal: number }> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: stateData } = await client.from('game_state').select('settings').eq('id', 'main').single();
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData?.settings || {}) };

    const { data: player } = await client.from('players').select('*').eq('id', params.playerId).single();
    if (!player) throw new Error('Spieler nicht gefunden');

    const uploadedPhotoUrl = await this.uploadPhoto(params.photoBlobOrUrl, 'task');

    // Resolve tagged player names
    const taggedIds = params.taggedPlayerIds || [];
    let taggedNames: string[] = [];
    if (taggedIds.length > 0) {
      const { data: taggedList } = await client.from('players').select('id, name, points').in('id', taggedIds);
      if (taggedList) {
        taggedNames = taggedList.map((p) => p.name);
        // Award 2 bonus points to each tagged co-player
        const bonusPts = settings.pointsTaggedCoPlayer || 2;
        for (const tp of taggedList) {
          await client
            .from('players')
            .update({
              points: (tp.points || 0) + bonusPts,
            })
            .eq('id', tp.id);
        }
      }
    }

    const taskPoints = settings.pointsPhotoTask || 10;

    // 1. Insert completion
    await client.from('task_completions').insert([
      {
        task_id: params.taskId,
        player_id: player.id,
        player_name: player.name,
        photo_url: uploadedPhotoUrl || null,
        tagged_player_ids: taggedIds,
        tagged_player_names: taggedNames,
        points_awarded: taskPoints,
      },
    ]);

    // 2. Award main player points
    await this.safeUpdatePlayer(
      player.id,
      {
        points: (player.points || 0) + taskPoints,
        tasks_completed_count: (player.tasks_completed_count || 0) + 1,
      },
      ['points']
    );

    // 3. Add to party photo gallery
    if (uploadedPhotoUrl) {
      await client.from('photos').insert([
        {
          photo_url: uploadedPhotoUrl,
          task_id: params.taskId,
          caption: `Aufgabe "${params.taskTitle}" gelöst von ${player.name}`,
          player_id: player.id,
          photographer_name: player.name,
          tagged_player_names: taggedNames,
        },
      ]);
    }

    return {
      pointsAwarded: taskPoints,
      bonusPointsTotal: taggedIds.length * (settings.pointsTaggedCoPlayer || 2),
    };
  }

  // --- SPECIAL TASKS FOR HUMANS (QR Code, Quiz, Motif) ---
  public async getPendingSpecialTask(playerId: string): Promise<SpecialTaskAssignment | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const { data } = await client
        .from('special_tasks')
        .select('*')
        .eq('player_id', playerId)
        .is('completed_at', null)
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
        points: data.points,
        qrCodeExpected: data.qr_code_expected,
        quizData: data.quiz_data,
        motifDescription: data.motif_description,
        createdAt: data.created_at,
        completedAt: data.completed_at,
        rewardRevealedPlayerId: data.reward_player_id,
        rewardRevealedPlayerName: data.reward_player_name,
        rewardRevealedRole: data.reward_role,
      };
    } catch {
      return null;
    }
  }

  public async completeSpecialTask(params: {
    specialTaskId: string;
    playerId: string;
    userAnswer?: number;
    scannedQrCode?: string;
    photoBlobOrUrl?: Blob | File | string;
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

    // Verify answer
    if (st.type === 'quiz') {
      const correctIdx = st.quiz_data?.correctIndex ?? 0;
      if (params.userAnswer !== correctIdx) {
        throw new Error('Leider falsch beantwortet! Versuche es noch einmal.');
      }
    } else if (st.type === 'qr_code') {
      if (params.scannedQrCode?.trim().toUpperCase() !== st.qr_code_expected?.trim().toUpperCase()) {
        throw new Error('Ungültiger QR-Code für diese Spezialaufgabe!');
      }
    }

    // Pick a random living person to reveal
    const { data: allLiving } = await client
      .from('players')
      .select('id, name, role')
      .neq('id', params.playerId)
      .eq('status', 'lebendig');

    let revealedName = 'Jemand Unbekanntes';
    let revealedRole: RoleType = 'Mensch';
    let revealedId = '';

    if (allLiving && allLiving.length > 0) {
      const randomTarget = allLiving[Math.floor(Math.random() * allLiving.length)];
      revealedId = randomTarget.id;
      revealedName = randomTarget.name;
      revealedRole = randomTarget.role as RoleType;
    }

    const { data: stateData } = await client.from('game_state').select('settings').eq('id', 'main').single();
    const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...(stateData?.settings || {}) };
    const taskPoints = settings.pointsSpecialTask || 20;

    // Award points
    const { data: player } = await client.from('players').select('points').eq('id', params.playerId).single();
    if (player) {
      await client
        .from('players')
        .update({
          points: (player.points || 0) + taskPoints,
        })
        .eq('id', params.playerId);
    }

    // Mark task completed & save reward
    await client
      .from('special_tasks')
      .update({
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
      message: `Geheimnis enthüllt: ${revealedName} ist ${revealedRole}! (+${taskPoints} Punkte)`,
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

  // --- DELETE PHOTO (ADMIN) ---
  public async deletePhoto(adminCode: string, photoId: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    await client.from('photos').delete().eq('id', photoId);
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
