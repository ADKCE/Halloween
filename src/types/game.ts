export type RoleType = 'Mensch' | 'Geisterjäger' | 'Vampir' | 'Werwolf' | 'Geist' | 'unassigned' | 'Unbekannt';

export type TeamType = 'Gut' | 'Böse';

export type PlayerStatus = 'lebendig' | 'tot' | 'pending_death' | 'tod_ausstehend' | 'entfernt' | 'pausiert';

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
  tasksCompletedCount?: number;
  cooldownUntil?: string;
  lastKillAt?: string;
  pendingDeathAt?: string | null;
  isTest?: boolean;
  joinedAt: string;
}

export interface GameSettings {
  adminCode: string;
  // Rollen-Verteilung: Zielanteile in Prozent (im Admin einstellbar)
  vampirePercent?: number; // Standard: 6%
  werewolfPercent?: number; // Standard: 4%
  ghostPercent?: number; // Standard: 4%
  hunterPercent?: number; // Standard: 10%

  // Rollen-Verteilung (historische Zähler)
  vampireCount: number;
  werewolfCount: number;
  ghostCount: number;
  hunterCount: number;

  // Zeiten in Minuten oder Sekunden
  gracePeriodMinutes: number; // Standard: 15 Minuten Schonfrist
  vampireCooldownMinutes: number; // Standard: 6 Minuten
  ghostCooldownMinutes: number; // Standard: 6 Minuten
  werewolfCooldownMinutes: number; // Standard: 2 Minuten während Vollmond
  hunterHitCooldownMinutes: number; // Standard: 15 Minuten nach Treffer
  hunterMissPenaltyMinutes: number; // Standard: 30 Minuten Sperre nach Fehlschuss
  
  // Neuer Kill-Ablauf Einstellungen
  pendingDeathTimeoutMinutes?: number; // Standard: 4 Minuten
  killConfirmationTimeoutMinutes?: number; // Legacy alias für pendingDeathTimeoutMinutes
  unconfirmedKillAction?: 'revive' | 'stay_dead'; // Standard: 'revive' (Wiederbeleben) oder 'stay_dead' (Als tot lassen)

  // Vollmond
  fullMoonMinIntervalMinutes: number; // Standard: 20 Minuten
  fullMoonMaxIntervalMinutes: number; // Standard: 40 Minuten
  fullMoonDurationMinutes: number; // Standard: 5 Minuten

  // Punkte
  pointsPhotoTask: number; // Standard: 10
  pointsSpecialTask: number; // Standard: 20
  pointsEvilKill: number; // Standard: 15
  pointsExorcismSuccess: number; // Standard: 25

  // Foto-Aufgaben Zeiten
  photoTaskIntervalMinutes?: number; // Standard: 10 Minuten (einstellbar 5-15)
  photoTaskExpirationMinutes?: number; // Standard: 30 Minuten

  // Download-Freischaltung für Fotos
  photoDownloadUnlocked?: 'ended' | 'always'; // Standard: 'ended', alternativ 'always'

  // Spezialaufgaben (für Menschen)
  specialTaskIntervalMinMinutes: number; // Standard: 10
  specialTaskIntervalMaxMinutes: number; // Standard: 20
}

export interface FullMoonEvent {
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  triggeredManually?: boolean;
}

export interface GameState {
  id: 'main';
  status: GameStatus;
  startedAt: string | null;
  endedAt: string | null;
  settings: GameSettings;
  adminCode: string;
  fullMoonTimes?: FullMoonEvent[];
  activeFullMoon?: FullMoonEvent | null;
  lastSpecialTaskAt?: string | null;
  nextSpecialTaskIntervalMinutes?: number;
  lastTickAt?: string | null;
  winnerTeam?: TeamType | null;
  updatedAt?: string;
}

export interface KillRecord {
  id: string;
  killerId: string | null;
  victimId: string;
  killerName?: string;
  victimName?: string;
  killerRole?: RoleType;
  victimRole?: RoleType;
  victimTeam?: TeamType;
  killerTeam?: TeamType;
  reason?: 'kill' | 'exorcism' | 'self_reported' | 'unconfirmed' | 'unconfirmed_timeout' | string;
  exorcismHit?: boolean;
  ghostSoloConfirmed?: boolean;
  createdAt: string;
  confirmed: boolean;
  confirmedAt?: string | null;
  autoConfirmed?: boolean;
}

export interface PlayerPhotoTask {
  id: string;
  playerId: string;
  slotNumber: number;
  title: string;
  description: string;
  taskType: 'specific_player' | 'specific_costume' | 'group' | 'two_players';
  targetPlayerId?: string;
  targetPlayerName?: string;
  targetPlayerCostume?: string;
  targetPlayerPhoto?: string;
  targetSecondPlayerId?: string;
  targetSecondPlayerName?: string;
  targetSecondPlayerCostume?: string;
  targetSecondPlayerPhoto?: string;
  targetCostumeName?: string;
  groupCount?: number;
  points: number;
  status: 'open' | 'completed' | 'expired';
  createdAt: string;
  expiresAt: string;
  completedAt?: string | null;
  photoUrl?: string;
}

export type MiniGameType = 'math' | 'anagram' | 'sequence' | 'quiz' | 'code';

export interface MathQuestion {
  expression: string;
  answer: number;
}

export interface MathTaskData {
  questions: MathQuestion[];
  timeLimitSeconds: number; // 60
}

export interface AnagramTaskData {
  scrambledWord: string;
  originalWord: string;
  hint?: string;
  timeLimitSeconds: number; // 30
}

export interface SequenceTaskData {
  symbols: string[];
  sequence: string[];
  timeLimitSeconds: number;
}

export interface QuizTaskData {
  question: string;
  options: string[];
  correctIndex: number;
  timeLimitSeconds: number; // 20
  explanation?: string;
}

export interface CodeTaskData {
  secretCode: string;
  timeLimitSeconds: number; // 45
}

export interface SpecialTaskAssignment {
  id: string;
  playerId: string;
  type: MiniGameType;
  title: string;
  description: string;
  points: number;
  createdAt: string;
  expiresAt: string;
  completedAt?: string | null;
  status: 'pending' | 'completed' | 'expired';
  rewardRevealedPlayerId?: string;
  rewardRevealedPlayerName?: string;
  rewardRevealedRole?: RoleType;
  taskData: {
    math?: MathTaskData;
    anagram?: AnagramTaskData;
    sequence?: SequenceTaskData;
    quiz?: QuizTaskData;
    code?: CodeTaskData;
  };
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
  taskTitle?: string;
  playerId: string;
  playerName: string;
  photoUrl?: string;
  pointsAwarded: number;
  completedAt: string;
}

export interface PartyPhoto {
  id: string;
  photoUrl: string;
  taskId?: string;
  taskTitle?: string;
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
  photoTasks?: PlayerPhotoTask[];
  specialTasks?: SpecialTaskAssignment[];
  totalJoinedCount: number;
}

export interface PhotoTaskTemplate {
  id: string;
  text: string;
  type: 'specific_player' | 'specific_costume' | 'group' | 'two_players' | string;
  requiredCount?: number;
  targetRoleCostumes?: string[];
  [key: string]: any;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

