export type RoleType = 'Mensch' | 'Geisterjäger' | 'Vampir' | 'Werwolf' | 'Geist' | 'unassigned' | 'Unbekannt';

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
  tasksCompletedCount?: number;
  cooldownUntil?: string;
  lastKillAt?: string;
  joinedAt: string;
}

export interface GameSettings {
  adminCode: string;
  // Rollen-Verteilung: Zielanteile in Prozent (im Admin einstellbar)
  vampirePercent?: number; // Standard: 6%
  werewolfPercent?: number; // Standard: 4%
  ghostPercent?: number; // Standard: 4%
  hunterPercent?: number; // Standard: 10%

  // Rollen-Verteilung (historische Zähler für Rückwärtskompatibilität)
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
  killConfirmationTimeoutMinutes: number; // Standard: 5 Minuten bis Auto-Bestätigung

  // Vollmond
  fullMoonMinIntervalMinutes: number; // Standard: 20 Minuten
  fullMoonMaxIntervalMinutes: number; // Standard: 40 Minuten
  fullMoonDurationMinutes: number; // Standard: 5 Minuten

  // Punkte
  pointsPhotoTask: number; // Standard: 10
  pointsSpecialTask: number; // Standard: 20
  pointsTaggedCoPlayer: number; // Standard: 2
  pointsEvilKill: number; // Standard: 15
  pointsExorcismSuccess: number; // Standard: 25

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
  updatedAt?: string;
}

export interface KillRecord {
  id: string;
  killerId: string;
  victimId: string;
  killerName?: string;
  victimName?: string;
  killerRole?: RoleType;
  victimRole?: RoleType;
  victimTeam?: TeamType;
  killerTeam?: TeamType;
  reason?: 'kill' | 'exorcism';
  exorcismHit?: boolean; // War Exorzismus Treffer (Opfer böse)?
  ghostSoloConfirmed?: boolean; // Für Geister
  createdAt: string;
  confirmed: boolean;
  confirmedAt?: string | null;
  autoConfirmed?: boolean;
}

export interface PhotoTaskTemplate {
  id: string;
  text: string;
  type: 'specific_player' | 'specific_costume' | 'group' | 'role_costumes' | 'general';
  targetRoleCostumes?: string[];
  requiredCount?: number;
}

export interface PlayerActiveTask {
  slot: number; // 1 oder 2
  taskTemplateId: string;
  title: string;
  description: string;
  points: number;
  assignedAt: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  targetPlayerCostume?: string;
  targetPlayerPhoto?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface SpecialTaskAssignment {
  id: string;
  playerId: string;
  type: 'qr_code' | 'quiz' | 'photo_motif';
  title: string;
  description: string;
  points: number;
  createdAt: string;
  completedAt?: string | null;
  rewardRevealedPlayerId?: string;
  rewardRevealedPlayerName?: string;
  rewardRevealedRole?: RoleType;
  // Für QR-Code Spezialaufgabe
  qrCodeExpected?: string;
  // Für Quiz Spezialaufgabe
  quizData?: QuizQuestion;
  // Für Foto-Motiv
  motifDescription?: string;
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
  taggedPlayerIds?: string[];
  taggedPlayerNames?: string[];
  pointsAwarded: number;
  completedAt: string;
}

export interface PartyPhoto {
  id: string;
  photoUrl: string;
  taskId?: string;
  caption?: string;
  playerId?: string;
  photographerName?: string;
  taggedPlayerNames?: string[];
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
