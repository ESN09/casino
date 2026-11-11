export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';

export interface RarityDef {
  id: RarityId;
  label: string;
  color: string;
  /** Probabilité indicative d'une caisse standard (en %). */
  standardPct: number;
  rank: number;
}

export const RARITIES: Record<RarityId, RarityDef> = {
  common:    { id: 'common',    label: 'Commun',     color: '#9aa3b5', standardPct: 45,  rank: 0 },
  uncommon:  { id: 'uncommon',  label: 'Peu commun', color: '#3ee07a', standardPct: 28,  rank: 1 },
  rare:      { id: 'rare',      label: 'Rare',       color: '#3aa0ff', standardPct: 15,  rank: 2 },
  epic:      { id: 'epic',      label: 'Épique',     color: '#b154ff', standardPct: 8,   rank: 3 },
  legendary: { id: 'legendary', label: 'Légendaire', color: '#ff9a1f', standardPct: 3,   rank: 4 },
  mythic:    { id: 'mythic',    label: 'Mythique',   color: '#ff3b4e', standardPct: 0.9, rank: 5 },
  secret:    { id: 'secret',    label: 'Secret',     color: '#ffffff', standardPct: 0.1, rank: 6 },
};

export const RARITY_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
