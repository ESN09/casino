import { CARDS, type CardDef } from './cards';
import type { RarityId } from './rarities';

/**
 * Définition d'une caisse. Le tirage se fait en deux temps :
 * 1. rareté selon `rarityPct` (probabilités exactes affichées au joueur) ;
 * 2. carte uniforme parmi le pool de cette rareté.
 * La probabilité exacte d'une carte = rarityPct[r] / taille(pool[r]).
 */
export interface CaseDef {
  id: string;
  name: string;
  price: number;
  emoji: string;
  theme: [string, string];
  /** Version de la table de probabilités (affichée, versionnée côté serveur). */
  oddsVersion: number;
  rarityPct: Partial<Record<RarityId, number>>;
  pool: string[];
}

const poolOf = (rarities: RarityId[]): string[] =>
  CARDS.filter((c) => rarities.includes(c.rarity)).map((c) => c.id);

export const CASES: CaseDef[] = [
  {
    id: 'starter',
    name: 'Starter Meme Case',
    price: 100,
    emoji: '📦',
    theme: ['#3b2bd1', '#ff3ea5'],
    oddsVersion: 1,
    rarityPct: { common: 62, uncommon: 28, rare: 10 },
    pool: poolOf(['common', 'uncommon', 'rare']),
  },
];

export const CASE_BY_ID: Record<string, CaseDef> = Object.fromEntries(CASES.map((x) => [x.id, x]));

export interface CardOdds { card: CardDef; pct: number }

export function caseCardOdds(def: CaseDef, cards: Record<string, CardDef>): CardOdds[] {
  const out: CardOdds[] = [];
  for (const [rarity, pct] of Object.entries(def.rarityPct) as [RarityId, number][]) {
    const pool = def.pool.filter((id) => cards[id].rarity === rarity);
    for (const id of pool) out.push({ card: cards[id], pct: pct / pool.length });
  }
  return out;
}

export function validateCase(def: CaseDef, cards: Record<string, CardDef>): string[] {
  const errors: string[] = [];
  const total = Object.values(def.rarityPct).reduce((s, v) => s + (v ?? 0), 0);
  if (Math.abs(total - 100) > 1e-9) errors.push(`${def.id}: probabilités = ${total} % (≠ 100 %)`);
  for (const r of Object.keys(def.rarityPct) as RarityId[]) {
    if (!def.pool.some((id) => cards[id]?.rarity === r)) errors.push(`${def.id}: aucune carte de rareté ${r}`);
  }
  for (const id of def.pool) if (!cards[id]) errors.push(`${def.id}: carte inconnue ${id}`);
  return errors;
}
