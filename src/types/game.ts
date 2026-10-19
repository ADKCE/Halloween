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
  updatedAt?: string;
}

export interface ServerStateResponse {
  gameState: GameState;
  players: Player[];
  totalJoinedCount: number;
}
