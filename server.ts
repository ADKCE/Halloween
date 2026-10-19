import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';

// --- TYPES ---
export type RoleType = 'Mensch' | 'Geisterjäger' | 'Vampir' | 'Werwolf' | 'Geist' | 'Unbekannt';
export type TeamType = 'Gut' | 'Böse';
export type PlayerStatus = 'lebendig' | 'tot' | 'entfernt' | 'pausiert';
export type GameStatus = 'Lobby' | 'Läuft' | 'Beendet';

export interface Player {
  id: string;
  name: string;
  costumeName: string;
  photoUrl: string;
  role: RoleType;
  team: TeamType;
  status: PlayerStatus;
  joinedAt: string;
  kills?: string[];
  tasks?: string[];
}

export interface GameSettings {
  adminCode: string;
  vampireCount: number; // default 6 (per 100)
  werewolfCount: number; // default 4 (per 100)
  ghostCount: number; // default 4 (per 100)
  hunterCount: number; // default 10 (per 100)
}

export interface GameState {
  id: 'main';
  status: GameStatus;
  startedAt: string | null;
  endedAt: string | null;
  settings: GameSettings;
  updatedAt: string;
}

// --- CENTRAL PERSISTENT DATABASE STORE ---
const DATA_FILE = path.resolve('.game-data.json');

export interface StoredData {
  gameState: GameState;
  players: Player[];
}

const defaultData: StoredData = {
  gameState: {
    id: 'main',
    status: 'Lobby',
    startedAt: null,
    endedAt: null,
    settings: {
      adminCode: '1031',
      vampireCount: 6,
      werewolfCount: 4,
      ghostCount: 4,
      hunterCount: 10,
    },
    updatedAt: new Date().toISOString(),
  },
  players: [],
};

let memoryData: StoredData = loadData();

function loadData(): StoredData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        gameState: {
          id: 'main',
          status: parsed.gameState?.status || 'Lobby',
          startedAt: parsed.gameState?.startedAt || null,
          endedAt: parsed.gameState?.endedAt || null,
          settings: {
            adminCode: parsed.gameState?.settings?.adminCode || '1031',
            vampireCount: parsed.gameState?.settings?.vampireCount ?? 6,
            werewolfCount: parsed.gameState?.settings?.werewolfCount ?? 4,
            ghostCount: parsed.gameState?.settings?.ghostCount ?? 4,
            hunterCount: parsed.gameState?.settings?.hunterCount ?? 10,
          },
          updatedAt: parsed.gameState?.updatedAt || new Date().toISOString(),
        },
        players: Array.isArray(parsed.players) ? parsed.players : [],
      };
    }
  } catch (err) {
    console.error('Failed to load data file, using defaults', err);
  }
  return defaultData;
}

function saveData() {
  try {
    memoryData.gameState.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write data file', err);
  }
}

// --- HELPER: PROPORTIONAL ROLE DISTRIBUTION ---
function distributeRoles(players: Player[], settings: GameSettings): Player[] {
  const activePlayers = players.filter((p) => p.status !== 'entfernt');
  const count = activePlayers.length;
  if (count === 0) return players;

  // Proportional calculations based on 100 players baseline
  let vCount = Math.max(1, Math.round((settings.vampireCount / 100) * count));
  let wCount = Math.max(1, Math.round((settings.werewolfCount / 100) * count));
  let gCount = Math.max(1, Math.round((settings.ghostCount / 100) * count));
  let hCount = Math.max(1, Math.round((settings.hunterCount / 100) * count));

  if (count < 5) {
    // Micro lobby for quick testing: 1 Hunter, 1 Vampire, rest humans
    vCount = 1;
    wCount = count >= 4 ? 1 : 0;
    gCount = 0;
    hCount = 1;
  }

  const roleDeck: { role: RoleType; team: TeamType }[] = [];

  for (let i = 0; i < vCount; i++) roleDeck.push({ role: 'Vampir', team: 'Böse' });
  for (let i = 0; i < wCount; i++) roleDeck.push({ role: 'Werwolf', team: 'Böse' });
  for (let i = 0; i < gCount; i++) roleDeck.push({ role: 'Geist', team: 'Böse' });
  for (let i = 0; i < hCount; i++) roleDeck.push({ role: 'Geisterjäger', team: 'Gut' });

  // Fill remainder with Menschen (Gut)
  while (roleDeck.length < count) {
    roleDeck.push({ role: 'Mensch', team: 'Gut' });
  }

  if (roleDeck.length > count) {
    roleDeck.length = count;
  }

  // Shuffle deck
  roleDeck.sort(() => Math.random() - 0.5);

  const activeIds = new Set(activePlayers.map((p) => p.id));
  let deckIndex = 0;

  return players.map((p) => {
    if (!activeIds.has(p.id)) return p;
    const assigned = roleDeck[deckIndex++];
    return {
      ...p,
      role: assigned ? assigned.role : 'Mensch',
      team: assigned ? assigned.team : 'Gut',
      status: 'lebendig',
    };
  });
}

// --- SERVER INITIALIZATION ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser with high limit for avatar photos
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Cross-Origin Resource Sharing (CORS) - supports all phones and browsers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-admin-code');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), playerCount: memoryData.players.length });
  });

  // 1. GET /api/game-state
  // Server-side role sanitization:
  // - Admin (with correct x-admin-code) sees all roles and all players (including 'entfernt')
  // - Non-admin players see ALL players' names, costumeNames, photos, statuses, and joinedAt
  // - BUT the secret 'role' and 'team' fields are ONLY returned for the requesting player's own ID
  app.get('/api/game-state', (req: Request, res: Response) => {
    const adminCodeHeader = (req.headers['x-admin-code'] as string) || (req.query.adminCode as string);
    const playerId = req.query.playerId as string | undefined;
    const isAdmin = adminCodeHeader === memoryData.gameState.settings.adminCode;

    // Filter out 'entfernt' players for non-admin viewers
    const visiblePlayers = isAdmin
      ? memoryData.players
      : memoryData.players.filter((p) => p.status !== 'entfernt');

    // Redact roles for non-admin
    const sanitizedPlayers = visiblePlayers.map((p) => {
      if (isAdmin) return p;
      if (playerId && p.id === playerId) {
        // Player sees their own secret role
        return p;
      }
      // Mask roles and teams of other players
      return {
        id: p.id,
        name: p.name,
        costumeName: p.costumeName,
        photoUrl: p.photoUrl,
        status: p.status,
        joinedAt: p.joinedAt,
        role: 'Unbekannt' as RoleType,
        team: 'Gut' as TeamType,
      };
    });

    res.json({
      gameState: memoryData.gameState,
      players: sanitizedPlayers,
      totalJoinedCount: memoryData.players.filter((p) => p.status !== 'entfernt').length,
    });
  });

  // 2. GET /api/players (direct entity access)
  app.get('/api/players', (req: Request, res: Response) => {
    const adminCodeHeader = (req.headers['x-admin-code'] as string) || (req.query.adminCode as string);
    const playerId = req.query.playerId as string | undefined;
    const isAdmin = adminCodeHeader === memoryData.gameState.settings.adminCode;

    const visiblePlayers = isAdmin
      ? memoryData.players
      : memoryData.players.filter((p) => p.status !== 'entfernt');

    const sanitizedPlayers = visiblePlayers.map((p) => {
      if (isAdmin) return p;
      if (playerId && p.id === playerId) return p;
      return {
        id: p.id,
        name: p.name,
        costumeName: p.costumeName,
        photoUrl: p.photoUrl,
        status: p.status,
        joinedAt: p.joinedAt,
        role: 'Unbekannt' as RoleType,
        team: 'Gut' as TeamType,
      };
    });

    res.json({ players: sanitizedPlayers });
  });

  // 3. POST /api/players/register
  // Mandatory: name, costumeName, photoUrl
  app.post('/api/players/register', (req: Request, res: Response) => {
    const { name, costumeName, photoUrl } = req.body;

    if (!name || !name.trim() || !costumeName || !costumeName.trim() || !photoUrl) {
      return res.status(400).json({ error: 'Name, Kostümname und Foto sind Pflichtfelder!' });
    }

    const newPlayer: Player = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: name.trim(),
      costumeName: costumeName.trim(),
      photoUrl,
      role: 'Unbekannt',
      team: 'Gut',
      status: 'lebendig',
      joinedAt: new Date().toISOString(),
      kills: [],
      tasks: [],
    };

    memoryData.players.push(newPlayer);
    saveData();

    res.status(201).json({ success: true, player: newPlayer });
  });

  // 4. POST /api/admin/verify-code
  app.post('/api/admin/verify-code', (req: Request, res: Response) => {
    const { code } = req.body;
    if (code === memoryData.gameState.settings.adminCode) {
      return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Ungültiger Admin-Code' });
  });

  // Admin Middleware
  const verifyAdmin = (req: Request, res: Response, next: () => void) => {
    const code = (req.headers['x-admin-code'] as string) || (req.body?.adminCode as string);
    if (code !== memoryData.gameState.settings.adminCode) {
      return res.status(403).json({ error: 'Nicht autorisiert. Falscher Admin-Code.' });
    }
    next();
  };

  // 5. POST /api/admin/start-game
  app.post('/api/admin/start-game', verifyAdmin, (_req: Request, res: Response) => {
    const activeCount = memoryData.players.filter((p) => p.status !== 'entfernt').length;
    if (activeCount === 0) {
      return res.status(400).json({ error: 'Keine Spieler in der Lobby vorhanden.' });
    }

    memoryData.players = distributeRoles(memoryData.players, memoryData.gameState.settings);
    memoryData.gameState.status = 'Läuft';
    memoryData.gameState.startedAt = new Date().toISOString();
    memoryData.gameState.endedAt = null;
    saveData();

    res.json({ success: true, gameState: memoryData.gameState });
  });

  // 6. POST /api/admin/abort-game
  app.post('/api/admin/abort-game', verifyAdmin, (_req: Request, res: Response) => {
    memoryData.gameState.status = 'Beendet';
    memoryData.gameState.endedAt = new Date().toISOString();
    saveData();

    res.json({ success: true, gameState: memoryData.gameState });
  });

  // 7. POST /api/admin/restart
  app.post('/api/admin/restart', verifyAdmin, (req: Request, res: Response) => {
    const { keepPlayers } = req.body;

    memoryData.gameState.status = 'Lobby';
    memoryData.gameState.startedAt = null;
    memoryData.gameState.endedAt = null;

    if (keepPlayers) {
      memoryData.players = memoryData.players.map((p) => ({
        ...p,
        role: 'Unbekannt',
        team: 'Gut',
        status: 'lebendig',
      }));
    } else {
      memoryData.players = [];
    }

    saveData();
    res.json({ success: true, gameState: memoryData.gameState });
  });

  // 8. POST /api/admin/update-settings
  app.post('/api/admin/update-settings', verifyAdmin, (req: Request, res: Response) => {
    const { adminCode, vampireCount, werewolfCount, ghostCount, hunterCount } = req.body;

    if (adminCode && adminCode.trim()) {
      memoryData.gameState.settings.adminCode = adminCode.trim();
    }
    if (typeof vampireCount === 'number') memoryData.gameState.settings.vampireCount = vampireCount;
    if (typeof werewolfCount === 'number') memoryData.gameState.settings.werewolfCount = werewolfCount;
    if (typeof ghostCount === 'number') memoryData.gameState.settings.ghostCount = ghostCount;
    if (typeof hunterCount === 'number') memoryData.gameState.settings.hunterCount = hunterCount;

    saveData();
    res.json({ success: true, settings: memoryData.gameState.settings });
  });

  // 9. POST /api/admin/player-action
  app.post('/api/admin/player-action', verifyAdmin, (req: Request, res: Response) => {
    const { playerId, action } = req.body; // 'entfernen' | 'wiederbeleben' | 'pausieren' | 'toeten'

    memoryData.players = memoryData.players.map((p) => {
      if (p.id === playerId) {
        if (action === 'entfernen') return { ...p, status: 'entfernt' };
        if (action === 'wiederbeleben') return { ...p, status: 'lebendig' };
        if (action === 'toeten') return { ...p, status: 'tot' };
        if (action === 'pausieren') {
          return { ...p, status: p.status === 'pausiert' ? 'lebendig' : 'pausiert' };
        }
      }
      return p;
    });

    saveData();
    res.json({ success: true, players: memoryData.players });
  });

  // Vite Integration in Development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Halloween Party Game Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
