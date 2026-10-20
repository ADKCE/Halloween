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
  points: number;
  killsCount?: number;
  joinedAt: string;
  tasksCompletedCount?: number;
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
  adminCode: string;
  fullMoonTimes?: string[];
  updatedAt?: string;
}

export interface KillRecord {
  id: string;
  killerId: string;
  victimId: string;
  killerName?: string;
  victimName?: string;
  createdAt: string;
  confirmed: boolean;
}

export interface PartyTask {
  id: string;
  title: string;
  description: string;
  points: number;
  category: string;
  createdAt?: string;
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  playerId: string;
  playerName: string;
  photoUrl?: string;
  completedAt: string;
}

export interface PartyPhoto {
  id: string;
  photoUrl: string;
  taskId?: string;
  caption?: string;
  playerId?: string;
  photographerName?: string;
  createdAt: string;
}

export interface ServerStateResponse {
  gameState: GameState;
  players: Player[];
  kills: KillRecord[];
  tasks: PartyTask[];
  taskCompletions: TaskCompletion[];
  photos: PartyPhoto[];
  totalJoinedCount: number;
}
