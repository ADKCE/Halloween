import { RoleType, TeamType, GameSettings } from '../types/game';

export interface RoleCounts {
  Vampir: number;
  Werwolf: number;
  Geist: number;
  Geisterjäger: number;
  Mensch: number;
}

export const DEFAULT_ROLE_PERCENTAGES = {
  vampirePercent: 6,
  werewolfPercent: 4,
  ghostPercent: 4,
  hunterPercent: 10,
};

/**
 * Calculates exact role counts according to the specifications:
 * - 2 Spieler: 1 Vampir, 1 Geisterjäger
 * - 3 Spieler: 1 Vampir, 1 Geisterjäger, 1 Mensch
 * - 4 Spieler: 1 Vampir, 1 Werwolf, 1 Geisterjäger, 1 Mensch
 * - 5 Spieler: 1 Vampir, 1 Werwolf, 1 Geist, 1 Geisterjäger, 1 Mensch
 * - ab 6 Spielern: Prozentrechnung mit Mindestanzahl 1 pro Sonderrolle.
 *   Menschen dürfen nie weniger als 40% ausmachen.
 */
export function calculateRoleDistribution(
  totalPlayers: number,
  settings?: Partial<GameSettings>
): RoleCounts {
  if (totalPlayers <= 0) {
    return { Vampir: 0, Werwolf: 0, Geist: 0, Geisterjäger: 0, Mensch: 0 };
  }

  if (totalPlayers === 1) {
    return { Vampir: 0, Werwolf: 0, Geist: 0, Geisterjäger: 0, Mensch: 1 };
  }

  // Small player count test rules
  if (totalPlayers === 2) {
    return { Vampir: 1, Werwolf: 0, Geist: 0, Geisterjäger: 1, Mensch: 0 };
  }
  if (totalPlayers === 3) {
    return { Vampir: 1, Werwolf: 0, Geist: 0, Geisterjäger: 1, Mensch: 1 };
  }
  if (totalPlayers === 4) {
    return { Vampir: 1, Werwolf: 1, Geist: 0, Geisterjäger: 1, Mensch: 1 };
  }
  if (totalPlayers === 5) {
    return { Vampir: 1, Werwolf: 1, Geist: 1, Geisterjäger: 1, Mensch: 1 };
  }

  // Ab 6 Spielern:
  const vPct = settings?.vampirePercent ?? DEFAULT_ROLE_PERCENTAGES.vampirePercent;
  const wPct = settings?.werewolfPercent ?? DEFAULT_ROLE_PERCENTAGES.werewolfPercent;
  const gPct = settings?.ghostPercent ?? DEFAULT_ROLE_PERCENTAGES.ghostPercent;
  const hPct = settings?.hunterPercent ?? DEFAULT_ROLE_PERCENTAGES.hunterPercent;

  // Rule: Menschen dürfen nie weniger als 40% ausmachen
  const minHumans = Math.max(1, Math.floor(totalPlayers * 0.40));
  const maxSpecialTotal = Math.max(0, totalPlayers - minHumans);

  // Raw calculation with minimum 1 per special role
  let vampires = Math.max(1, Math.round((totalPlayers * vPct) / 100));
  let werewolves = Math.max(1, Math.round((totalPlayers * wPct) / 100));
  let ghosts = Math.max(1, Math.round((totalPlayers * gPct) / 100));
  let hunters = Math.max(1, Math.round((totalPlayers * hPct) / 100));

  let specialSum = vampires + werewolves + ghosts + hunters;

  // If special roles exceed allowed maximum (ensuring >= 40% humans)
  if (specialSum > maxSpecialTotal) {
    // If not even 4 special roles fit, scale down prioritising Vampir and Geisterjäger
    if (maxSpecialTotal < 4) {
      vampires = 1;
      hunters = 1;
      werewolves = maxSpecialTotal >= 3 ? 1 : 0;
      ghosts = 0;
    } else {
      // Scale down while maintaining at least 1 per special role
      while (specialSum > maxSpecialTotal) {
        // Find which special role is most above its minimum 1
        const extras = [
          { role: 'hunters', val: hunters },
          { role: 'vampires', val: vampires },
          { role: 'werewolves', val: werewolves },
          { role: 'ghosts', val: ghosts },
        ].filter((x) => x.val > 1);

        if (extras.length > 0) {
          extras.sort((a, b) => b.val - a.val);
          if (extras[0].role === 'hunters') hunters--;
          else if (extras[0].role === 'vampires') vampires--;
          else if (extras[0].role === 'werewolves') werewolves--;
          else if (extras[0].role === 'ghosts') ghosts--;
          specialSum--;
        } else {
          // All are at 1, break
          break;
        }
      }
    }
  }

  const humans = Math.max(0, totalPlayers - (vampires + werewolves + ghosts + hunters));

  return {
    Vampir: vampires,
    Werwolf: werewolves,
    Geist: ghosts,
    Geisterjäger: hunters,
    Mensch: humans,
  };
}

/**
 * Fisher-Yates (Knuth) Shuffle algorithm.
 * Guarantees unbiased random permutations.
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Builds the exact role pool and assigns them via Fisher-Yates shuffle.
 */
export function distributeRoles(
  players: { id: string }[],
  settings?: Partial<GameSettings>
): { id: string; role: RoleType; team: TeamType }[] {
  const total = players.length;
  if (total === 0) return [];

  const counts = calculateRoleDistribution(total, settings);

  const roleDeck: { role: RoleType; team: TeamType }[] = [];

  for (let i = 0; i < counts.Vampir; i++) roleDeck.push({ role: 'Vampir', team: 'Böse' });
  for (let i = 0; i < counts.Werwolf; i++) roleDeck.push({ role: 'Werwolf', team: 'Böse' });
  for (let i = 0; i < counts.Geist; i++) roleDeck.push({ role: 'Geist', team: 'Böse' });
  for (let i = 0; i < counts.Geisterjäger; i++) roleDeck.push({ role: 'Geisterjäger', team: 'Gut' });
  for (let i = 0; i < counts.Mensch; i++) roleDeck.push({ role: 'Mensch', team: 'Gut' });

  // Safety pad if deck length doesn't match total
  while (roleDeck.length < total) {
    roleDeck.push({ role: 'Mensch', team: 'Gut' });
  }

  // Shuffle deck
  const shuffledDeck = fisherYatesShuffle(roleDeck);

  // Assign to players
  return players.map((p, index) => ({
    id: p.id,
    role: shuffledDeck[index].role,
    team: shuffledDeck[index].team,
  }));
}

/**
 * Nachzügler-Logik (Beitritt nach Spielstart):
 * Berechne die Zielanzahl pro Rolle für die neue Gesamtspielerzahl (N_neu = N_aktuell + 1).
 * Wähle zufällig unter den Rollen, die ihr Ziel noch nicht erreicht haben (gewichtet nach Fehlbetrag).
 * Sind alle Ziele erreicht, wird der Nachzügler Mensch.
 */
export function determineLateJoinerRole(
  existingPlayers: { role: RoleType; status?: string }[],
  settings?: Partial<GameSettings>
): { role: RoleType; team: TeamType } {
  // Only count active players
  const activeExisting = existingPlayers.filter((p) => p.status !== 'entfernt');
  const newTotal = activeExisting.length + 1;

  const targetCounts = calculateRoleDistribution(newTotal, settings);

  // Count current actual roles
  const actualCounts: Record<RoleType, number> = {
    Vampir: 0,
    Werwolf: 0,
    Geist: 0,
    Geisterjäger: 0,
    Mensch: 0,
    unassigned: 0,
    Unbekannt: 0,
  };

  for (const p of activeExisting) {
    if (p.role in actualCounts) {
      actualCounts[p.role]++;
    }
  }

  // Calculate deficits
  const roles: ('Vampir' | 'Werwolf' | 'Geist' | 'Geisterjäger')[] = [
    'Vampir',
    'Werwolf',
    'Geist',
    'Geisterjäger',
  ];

  const deficits: { role: RoleType; deficit: number; team: TeamType }[] = [];
  let totalDeficit = 0;

  for (const r of roles) {
    const target = targetCounts[r] || 0;
    const actual = actualCounts[r] || 0;
    const deficit = Math.max(0, target - actual);
    if (deficit > 0) {
      deficits.push({
        role: r,
        deficit,
        team: r === 'Geisterjäger' ? 'Gut' : 'Böse',
      });
      totalDeficit += deficit;
    }
  }

  // Check human deficit as well
  const humanTarget = targetCounts.Mensch || 0;
  const humanActual = actualCounts.Mensch || 0;
  const humanDeficit = Math.max(0, humanTarget - humanActual);
  if (humanDeficit > 0) {
    deficits.push({ role: 'Mensch', deficit: humanDeficit, team: 'Gut' });
    totalDeficit += humanDeficit;
  }

  // If no deficit exists for any role, default to Mensch
  if (totalDeficit <= 0 || deficits.length === 0) {
    return { role: 'Mensch', team: 'Gut' };
  }

  // Weighted random pick based on deficit
  let rand = Math.random() * totalDeficit;
  for (const item of deficits) {
    if (rand < item.deficit) {
      return { role: item.role, team: item.team };
    }
    rand -= item.deficit;
  }

  return { role: 'Mensch', team: 'Gut' };
}
