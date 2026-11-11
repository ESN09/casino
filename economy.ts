/**
 * Configuration centrale de l'économie virtuelle.
 * Toutes les valeurs sont des crédits FICTIFS, sans aucune valeur monétaire.
 * En production, cette config est servie (et versionnée) par le serveur.
 */
export const ECONOMY = {
  configVersion: 1,
  startingCredits: 5000,

  daily: {
    baseCredits: 1000,
    /** Petite récompense de connexion, en XP. */
    loginXp: 50,
    /** Bonus supplémentaire du 7e jour consécutif. */
    day7BonusCredits: 2000,
    /** Bonus progressif jours 1..7 (s'ajoute à baseCredits). */
    streakBonus: [0, 100, 200, 300, 400, 500, 0],
  },

  /** Coup de pouce pour continuer à jouer sans crédits. */
  rescue: {
    threshold: 100,
    credits: 500,
    cooldownMs: 4 * 60 * 60 * 1000,
  },

  xp: {
    /** XP gagnée par crédit misé (1 XP / 10 crédits). */
    perCreditWagered: 0.1,
    perCaseOpened: 15,
  },

  /** Tolérance anti-retour-en-arrière de l'horloge (5 min). */
  clockToleranceMs: 5 * 60 * 1000,

  ledgerMaxEntries: 300,
} as const;

/** XP cumulée requise pour atteindre `level` (niveau 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(120 * Math.pow(level - 1, 1.55));
}

export function levelFromXp(xp: number): { level: number; current: number; next: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return { level, current: xp - xpForLevel(level), next: xpForLevel(level + 1) - xpForLevel(level) };
}
