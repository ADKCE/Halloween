import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  Player,
  GameState,
  ServerStateResponse,
  GameSettings,
  KillRecord,
  PartyTask,
  TaskCompletion,
  PartyPhoto,
  RoleType,
  TeamType,
} from '../types/game';
import { compressImage } from './imageCompressor';

export function sanitizeSupabaseUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  // If user pasted the PostgREST endpoint (e.g. https://<ref>.supabase.co/rest/v1 or /rest/v1/)
  url = url.replace(/\/rest\/v1\/?$/, '');
  // If user pasted auth or storage endpoint
  url = url.replace(/\/(auth|storage|graphql)\/v1\/?$/, '');
  url = url.replace(/\/+$/, '');
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(';base64,');
    if (parts.length < 2) {
      return new Blob([dataUrl], { type: 'image/jpeg' });
    }
    const contentType = parts[0].split(':')[1] || 'image/jpeg';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  } catch (err) {
    console.warn('Error converting dataUrlToBlob:', err);
    return new Blob([], { type: 'image/jpeg' });
  }
}

const STORAGE_URL_KEY = 'halloween_supabase_url';
const STORAGE_ANON_KEY = 'halloween_supabase_anon_key';

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  supabaseUrl: string;
  hasAnonKey: boolean;
  source: 'env' | 'localStorage' | 'none';
  realtimeStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR' | 'POLLING_ONLY';
  lastSyncTime: string | null;
  lastError: string | null;
  dbPlayerCount: number;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private realtimeStatus: SupabaseConfigStatus['realtimeStatus'] = 'POLLING_ONLY';
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private dbPlayerCount = 0;

  constructor() {
    this.initClient();
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

  public getStatus(): SupabaseConfigStatus {
    const { url, key, source } = this.getCredentials();
    return {
      isConfigured: Boolean(this.client && url && key),
      supabaseUrl: url,
      hasAnonKey: Boolean(key),
      source,
      realtimeStatus: this.realtimeStatus,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
      dbPlayerCount: this.dbPlayerCount,
    };
  }

  // --- STORAGE UPLOAD ---
  public async uploadPhoto(
    blobOrFile: Blob | File | string,
    prefix: 'costume' | 'task' | 'party' = 'costume'
  ): Promise<string> {
    const client = this.getClient();

    // 1. Convert string / base64 or compress if needed
    let uploadBlob: Blob;
    let fallbackDataUrl = '';

    if (typeof blobOrFile === 'string') {
      if (blobOrFile.startsWith('data:')) {
        fallbackDataUrl = blobOrFile;
        uploadBlob = dataUrlToBlob(blobOrFile);
      } else {
        // already a hosted URL (e.g. https://...)
        return blobOrFile;
      }
    } else {
      const compressed = await compressImage(
        blobOrFile,
        prefix === 'costume' ? 800 : 1200
      );
      uploadBlob = compressed.blob;
      fallbackDataUrl = compressed.dataUrl;
    }

    if (!client) {
      if (fallbackDataUrl) return fallbackDataUrl;
      throw new Error('Supabase ist noch nicht konfiguriert (VITE_SUPABASE_URL fehlt)');
    }

    // Flat filename without nested directory slashes for maximal storage compatibility
    const fileExt = 'jpg';
    const safeRandom = Math.random().toString(36).substring(2, 9);
    const fileName = `${prefix}_${Date.now()}_${safeRandom}.${fileExt}`;

    try {
      const { data: uploadData, error: uploadError } = await client.storage
        .from('photos')
        .upload(fileName, uploadBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.warn('Supabase storage upload error:', uploadError.message);
        this.lastError = `Storage-Upload: ${uploadError.message}`;
        // Fallback to client-compressed image dataUrl so player flow is never blocked
        if (fallbackDataUrl) {
          return fallbackDataUrl;
        }
        throw new Error(`Foto-Upload: ${uploadError.message}. Stelle sicher, dass der Bucket 'photos' im Supabase Dashboard angelegt und öffentlich (Public) ist.`);
      }

      const { data: publicData } = client.storage
        .from('photos')
        .getPublicUrl(uploadData?.path || fileName);

      return publicData.publicUrl;
    } catch (err: any) {
      console.warn('Foto-Upload Ausnahme abgefangen:', err);
      if (fallbackDataUrl) {
        this.lastError = `Storage-Hinweis: Foto komprimiert im Datensatz gesichert (${err?.message || 'Bucket photos prüfen'})`;
        return fallbackDataUrl;
      }
      throw err;
    }
  }

  // --- GAME STATE & PLAYERS ---
  public async getGameState(
    playerId?: string | null,
    adminCode?: string | null
  ): Promise<ServerStateResponse> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Supabase nicht konfiguriert. Bitte trage VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY ein.');
    }

    try {
      // 1. Fetch game_state (id = 'main')
      const { data: stateData, error: stateError } = await client
        .from('game_state')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();

      if (stateError) {
        throw new Error(`game_state Fehler: ${stateError.message}`);
      }

      // Default game state fallback if table row doesn't exist yet
      const gameState: GameState = {
        id: 'main',
        status: (stateData?.status as any) || 'Lobby',
        startedAt: stateData?.started_at || null,
        endedAt: stateData?.ended_at || null,
        settings: stateData?.settings || {
          adminCode: stateData?.admin_code || '1031',
          vampireCount: 6,
          werewolfCount: 4,
          ghostCount: 4,
          hunterCount: 10,
        },
        adminCode: stateData?.admin_code || '1031',
        fullMoonTimes: stateData?.full_moon_times || [],
        updatedAt: stateData?.updated_at || undefined,
      };

      // Check if admin is verified
      const isAdmin = Boolean(adminCode && adminCode.trim() === gameState.adminCode);

      // 2. Fetch players
      const { data: playersData, error: playersError } = await client
        .from('players')
        .select('*')
        .order('created_at', { ascending: true });

      if (playersError) {
        throw new Error(`players Fehler: ${playersError.message}`);
      }

      this.dbPlayerCount = playersData ? playersData.length : 0;

      // Map and filter role secrets (only admin or the player themselves sees their role)
      const mappedPlayers: Player[] = (playersData || []).map((p: any) => {
        const isSelf = playerId && p.id === playerId;
        const canSeeSecret = isAdmin || isSelf;

        return {
          id: p.id,
          name: p.name,
          costumeName: p.costume_name || '',
          photoUrl: p.photo_url || '',
          role: (canSeeSecret ? p.role : 'Unbekannt') as RoleType,
          team: (canSeeSecret ? p.team : 'Gut') as TeamType,
          status: p.status || 'lebendig',
          points: p.points || 0,
          killsCount: p.kills_count || 0,
          joinedAt: p.created_at,
        };
      });

      // 3. Fetch kills
      const { data: killsData } = await client
        .from('kills')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      const mappedKills: KillRecord[] = (killsData || []).map((k: any) => ({
        id: k.id,
        killerId: k.killer_id,
        victimId: k.victim_id,
        killerName: k.killer_name,
        victimName: k.victim_name,
        createdAt: k.created_at,
        confirmed: k.confirmed !== false,
      }));

      // 4. Fetch tasks
      const { data: tasksData } = await client
        .from('tasks')
        .select('*')
        .order('points', { ascending: true });

      const mappedTasks: PartyTask[] = (tasksData || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        points: t.points,
        category: t.category,
        createdAt: t.created_at,
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
      this.lastError = err?.message || 'Verbindungsfehler zu Supabase';
      throw err;
    }
  }

  // --- REGISTER PLAYER ---
  public async registerPlayer(playerData: {
    name: string;
    costumeName: string;
    photoUrl: string;
  }): Promise<Player> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Supabase ist nicht konfiguriert. Bitte prüfe VITE_SUPABASE_URL.');
    }

    // 1. Upload photo to Supabase storage if it's base64 data
    let uploadedPhotoUrl = playerData.photoUrl;
    if (playerData.photoUrl.startsWith('data:')) {
      try {
        uploadedPhotoUrl = await this.uploadPhoto(playerData.photoUrl, 'costume');
      } catch (err: any) {
        console.warn('Storage upload error, using direct compressed photo:', err);
        uploadedPhotoUrl = playerData.photoUrl;
      }
    }

    const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newPlayerRow = {
      id: playerId,
      name: playerData.name.trim(),
      costume_name: playerData.costumeName.trim(),
      photo_url: uploadedPhotoUrl,
      role: 'Mensch',
      team: 'Gut',
      status: 'lebendig',
      points: 0,
      kills_count: 0,
    };

    const { data, error } = await client
      .from('players')
      .insert([newPlayerRow])
      .select()
      .single();

    if (error) {
      this.lastError = error.message;
      throw new Error(`Fehler beim Registrieren in Supabase: ${error.message}`);
    }

    // Also add their costume photo to the party photo stream
    try {
      await client.from('photos').insert([
        {
          photo_url: uploadedPhotoUrl,
          caption: `Kostüm von ${playerData.name}: ${playerData.costumeName}`,
          player_id: playerId,
          photographer_name: playerData.name,
        },
      ]);
    } catch {
      // Non-fatal if photo stream entry fails
    }

    return {
      id: data.id,
      name: data.name,
      costumeName: data.costume_name,
      photoUrl: data.photo_url,
      role: data.role as RoleType,
      team: data.team as TeamType,
      status: data.status,
      points: data.points,
      killsCount: data.kills_count,
      joinedAt: data.created_at,
    };
  }

  // --- ADMIN AUTH & CONTROL ---
  public async verifyAdminCode(code: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    try {
      // 1. Try Postgres function check_admin_code
      const { data, error } = await client.rpc('check_admin_code', { input_code: code.trim() });
      if (!error && typeof data === 'boolean') {
        return data;
      }
    } catch {
      // Fallback below
    }

    // 2. Direct fallback check in game_state table
    try {
      const { data } = await client
        .from('game_state')
        .select('admin_code')
        .eq('id', 'main')
        .maybeSingle();

      const realCode = data?.admin_code || '1031';
      return realCode === code.trim();
    } catch {
      return false;
    }
  }

  public async startGame(adminCode: string): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // 1. Fetch current settings and active players
    const { data: stateData } = await client.from('game_state').select('*').eq('id', 'main').single();
    const settings: GameSettings = stateData?.settings || {
      vampireCount: 6,
      werewolfCount: 4,
      ghostCount: 4,
      hunterCount: 10,
    };

    const { data: players } = await client
      .from('players')
      .select('*')
      .neq('status', 'entfernt');

    if (!players || players.length === 0) {
      throw new Error('Keine Spieler in der Lobby vorhanden');
    }

    // 2. Distribute roles based on counts
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

    // 3. Batch update player roles in Supabase
    for (const a of assignments) {
      await client
        .from('players')
        .update({
          role: a.role,
          team: a.team,
          status: 'lebendig',
        })
        .eq('id', a.id);
    }

    // 4. Update game_state
    const { error: stateError } = await client
      .from('game_state')
      .update({
        status: 'Läuft',
        started_at: new Date().toISOString(),
        ended_at: null,
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

  public async restartGame(adminCode: string, keepPlayers: boolean): Promise<void> {
    const isValid = await this.verifyAdminCode(adminCode);
    if (!isValid) throw new Error('Ungültiger Admin-Code');

    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    if (!keepPlayers) {
      // Clear all tables
      await client.from('kills').delete().neq('killer_id', '__never__');
      await client.from('task_completions').delete().neq('player_id', '__never__');
      await client.from('photos').delete().neq('photo_url', '__never__');
      await client.from('players').delete().neq('id', '__never__');
    } else {
      // Reset all players to living Mensch with 0 points
      await client
        .from('players')
        .update({
          role: 'Mensch',
          team: 'Gut',
          status: 'lebendig',
          points: 0,
          kills_count: 0,
        })
        .neq('id', '__never__');

      await client.from('kills').delete().neq('killer_id', '__never__');
      await client.from('task_completions').delete().neq('player_id', '__never__');
    }

    await client
      .from('game_state')
      .update({
        status: 'Lobby',
        started_at: null,
        ended_at: null,
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

  // --- ACTIONS: KILL & TASKS & PHOTO SHARING ---
  public async recordKill(killerId: string, victimId: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    // Fetch killer and victim
    const { data: killer } = await client.from('players').select('*').eq('id', killerId).single();
    const { data: victim } = await client.from('players').select('*').eq('id', victimId).single();

    if (!killer || !victim) throw new Error('Spieler nicht gefunden');
    if (victim.status === 'tot') throw new Error('Dieses Opfer ist bereits tot');

    // 1. Mark victim as dead
    await client.from('players').update({ status: 'tot' }).eq('id', victimId);

    // 2. Award killer points (+50)
    await client
      .from('players')
      .update({
        points: (killer.points || 0) + 50,
        kills_count: (killer.kills_count || 0) + 1,
      })
      .eq('id', killerId);

    // 3. Log kill
    await client.from('kills').insert([
      {
        killer_id: killerId,
        victim_id: victimId,
        killer_name: killer.name,
        victim_name: victim.name,
        confirmed: true,
      },
    ]);
  }

  public async completeTask(
    playerId: string,
    taskId: string,
    photoBlobOrUrl?: Blob | File | string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: player } = await client.from('players').select('*').eq('id', playerId).single();
    const { data: task } = await client.from('tasks').select('*').eq('id', taskId).single();

    if (!player || !task) throw new Error('Spieler oder Aufgabe nicht gefunden');

    let uploadedPhotoUrl = '';
    if (photoBlobOrUrl) {
      uploadedPhotoUrl = await this.uploadPhoto(photoBlobOrUrl, 'task');
    }

    // 1. Record completion
    await client.from('task_completions').insert([
      {
        task_id: taskId,
        player_id: playerId,
        player_name: player.name,
        photo_url: uploadedPhotoUrl || null,
      },
    ]);

    // 2. Award points
    await client
      .from('players')
      .update({
        points: (player.points || 0) + (task.points || 10),
      })
      .eq('id', playerId);

    // 3. If photo was included, add to party gallery
    if (uploadedPhotoUrl) {
      await client.from('photos').insert([
        {
          photo_url: uploadedPhotoUrl,
          task_id: taskId,
          caption: `Aufgabe '${task.title}' gelöst von ${player.name}`,
          player_id: playerId,
          photographer_name: player.name,
        },
      ]);
    }
  }

  public async uploadPartyPhoto(
    playerId: string,
    photoBlobOrFile: Blob | File,
    caption = ''
  ): Promise<string> {
    const client = this.getClient();
    if (!client) throw new Error('Supabase nicht verfügbar');

    const { data: player } = await client.from('players').select('name').eq('id', playerId).single();
    const photographerName = player?.name || 'Party-Gast';

    const uploadedUrl = await this.uploadPhoto(photoBlobOrFile, 'party');

    await client.from('photos').insert([
      {
        photo_url: uploadedUrl,
        caption: caption.trim() || `Party-Schnappschuss von ${photographerName}`,
        player_id: playerId,
        photographer_name: photographerName,
      },
    ]);

    return uploadedUrl;
  }

  // --- SUPABASE REALTIME SUBSCRIPTION ---
  public subscribeToRealtime(onChange: () => void): () => void {
    const client = this.getClient();
    if (!client) {
      this.realtimeStatus = 'POLLING_ONLY';
      return () => {};
    }

    try {
      this.realtimeStatus = 'CONNECTING';

      // Listen on public channel for all game tables
      const channel = client
        .channel('halloween_party_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, () => {
          onChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
          onChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kills' }, () => {
          onChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => {
          onChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => {
          onChange();
        })
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
