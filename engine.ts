import { randInt, type Rng } from '../../core/rng';

/** Moteur de machine à sous pur : aucune dépendance UI, testable. */

export type SymbolKind = 'normal' | 'wild' | 'scatter';

export interface SlotSymbol {
  id: string;
  emoji: string;
  label: string;
  kind: SymbolKind;
  /** Gains en multiples de la mise PAR LIGNE pour 3, 4, 5 symboles alignés. */
  pays: [number, number, number];
}

export interface SlotMachineDef {
  id: string;
  name: string;
  tagline: string;
  theme: { from: string; to: string; accent: string };
  reels: number;
  rows: number;
  symbols: SlotSymbol[];
  /** Rouleaux : liste d'identifiants de symboles (bande circulaire). */
  strips: string[][];
  /** Lignes gagnantes : pour chaque rouleau, l'indice de rangée (0 = haut). */
  paylines: number[][];
  bets: number[];
  freeSpins: {
    /** Nombre de scatters → tours gratuits. */
    award: Record<number, number>;
    multiplier: number;
  };
  /** Gains scatter en multiples de la MISE TOTALE (3, 4, 5 scatters). */
  scatterPays: [number, number, number];
  /** RTP mesuré par simulation (tests/slots.test.ts) — affiché au joueur. */
  measuredRtp: number;
}

export interface LineWin {
  line: number;
  symbol: string;
  count: number;
  /** Positions [rouleau, rangée] gagnantes. */
  cells: [number, number][];
  payout: number;
}

export interface SpinOutcome {
  stops: number[];
  grid: string[][]; // grid[reel][row]
  lineWins: LineWin[];
  scatterCount: number;
  scatterCells: [number, number][];
  scatterPayout: number;
  freeSpinsAwarded: number;
  multiplier: number;
  totalPayout: number;
}

function buildStrip(counts: Record<string, number>, order: string[]): string[] {
  // Répartition entrelacée et déterministe pour éviter les paquets de symboles.
  const remaining = { ...counts };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const strip: string[] = [];
  let k = 0;
  while (strip.length < total) {
    const id = order[k % order.length];
    if (remaining[id] > 0) {
      strip.push(id);
      remaining[id]--;
    }
    k++;
  }
  return strip;
}

const MM_ORDER = ['potato', 'frog', 'toast', 'duck', 'pigeon', 'doge', 'potato', 'toast', 'wild', 'pigeon', 'frog', 'scatter', 'toast', 'potato', 'duck', 'pigeon'];

export const MEME_MACHINE: SlotMachineDef = {
  id: 'meme-machine',
  name: 'Meme Machine',
  tagline: '5 rouleaux · 10 lignes · Tours gratuits ×2',
  theme: { from: '#5b2bff', to: '#ff2fa0', accent: '#2ef2ff' },
  reels: 5,
  rows: 3,
  symbols: [
    { id: 'potato',  emoji: '🥔', label: 'Patate',   kind: 'normal',  pays: [4, 10, 25] },
    { id: 'toast',   emoji: '🍞', label: 'Toast',    kind: 'normal',  pays: [4, 12, 30] },
    { id: 'pigeon',  emoji: '🐦', label: 'Pigeon',   kind: 'normal',  pays: [5, 15, 40] },
    { id: 'frog',    emoji: '🐸', label: 'Grenouille', kind: 'normal', pays: [8, 25, 80] },
    { id: 'duck',    emoji: '🦆', label: 'Canard',   kind: 'normal',  pays: [12, 40, 120] },
    { id: 'doge',    emoji: '🐕', label: 'Wow Dog',  kind: 'normal',  pays: [20, 80, 300] },
    { id: 'wild',    emoji: '🃏', label: 'WILD',     kind: 'wild',    pays: [30, 150, 750] },
    { id: 'scatter', emoji: '💎', label: 'SCATTER',  kind: 'scatter', pays: [0, 0, 0] },
  ],
  strips: [
    buildStrip({ potato: 9, toast: 8, pigeon: 7, frog: 5, duck: 4, doge: 3, wild: 2, scatter: 2 }, MM_ORDER),
    buildStrip({ potato: 9, toast: 8, pigeon: 7, frog: 5, duck: 4, doge: 3, wild: 2, scatter: 2 }, MM_ORDER),
    buildStrip({ potato: 9, toast: 8, pigeon: 7, frog: 5, duck: 4, doge: 3, wild: 2, scatter: 2 }, MM_ORDER),
    buildStrip({ potato: 9, toast: 8, pigeon: 7, frog: 5, duck: 4, doge: 3, wild: 2, scatter: 2 }, MM_ORDER),
    buildStrip({ potato: 9, toast: 8, pigeon: 7, frog: 5, duck: 4, doge: 3, wild: 2, scatter: 2 }, MM_ORDER),
  ],
  paylines: [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
    [0, 1, 1, 1, 0],
  ],
  bets: [10, 20, 50, 100, 250, 500],
  freeSpins: { award: { 3: 8, 4: 12, 5: 20 }, multiplier: 2 },
  scatterPays: [2, 10, 50],
  measuredRtp: 0.955, // simulé sur 2 M de tours (voir tests/slots.test.ts)
};

export function gridFromStops(def: SlotMachineDef, stops: number[]): string[][] {
  return stops.map((stop, r) => {
    const strip = def.strips[r];
    return Array.from({ length: def.rows }, (_, row) => strip[(stop + row) % strip.length]);
  });
}

export function evaluate(def: SlotMachineDef, grid: string[][], totalBet: number, multiplier = 1): Omit<SpinOutcome, 'stops'> {
  const sym = Object.fromEntries(def.symbols.map((s) => [s.id, s]));
  const lineBet = totalBet / def.paylines.length;
  const lineWins: LineWin[] = [];

  def.paylines.forEach((line, li) => {
    const ids = line.map((row, reel) => grid[reel][row]);
    let best: LineWin | null = null;
    // Candidats : chaque symbole normal présent + wild seul.
    const candidates = new Set(ids.filter((id) => sym[id].kind === 'normal'));
    candidates.add('wild');
    for (const cand of candidates) {
      let count = 0;
      for (const id of ids) {
        if (id === cand || (sym[id].kind === 'wild' && cand !== 'scatter')) count++;
        else break;
      }
      if (count >= 3) {
        const pay = sym[cand].pays[count - 3] * lineBet * multiplier;
        if (!best || pay > best.payout) {
          best = {
            line: li, symbol: cand, count, payout: pay,
            cells: line.slice(0, count).map((row, reel) => [reel, row] as [number, number]),
          };
        }
      }
    }
    if (best) lineWins.push(best);
  });

  const scatterCells: [number, number][] = [];
  grid.forEach((col, reel) => col.forEach((id, row) => { if (sym[id].kind === 'scatter') scatterCells.push([reel, row]); }));
  const scatterCount = scatterCells.length;
  const sIdx = Math.min(scatterCount, 5) - 3;
  const scatterPayout = sIdx >= 0 ? def.scatterPays[sIdx] * totalBet * multiplier : 0;
  const freeSpinsAwarded = def.freeSpins.award[Math.min(scatterCount, 5)] ?? 0;

  const totalPayout = Math.floor(lineWins.reduce((s, w) => s + w.payout, 0) + scatterPayout);
  return { grid, lineWins, scatterCount, scatterCells, scatterPayout, freeSpinsAwarded, multiplier, totalPayout };
}

export function spin(def: SlotMachineDef, rng: Rng, totalBet: number, inFreeSpins: boolean): SpinOutcome {
  const stops = def.strips.map((s) => randInt(rng, s.length));
  const grid = gridFromStops(def, stops);
  const mult = inFreeSpins ? def.freeSpins.multiplier : 1;
  return { stops, ...evaluate(def, grid, totalBet, mult) };
}

/** Simulation Monte-Carlo du RTP, tours gratuits inclus. */
export function simulateRtp(def: SlotMachineDef, rng: Rng, spins: number, bet = 100): { rtp: number; hitRate: number; fsRate: number } {
  let wagered = 0, won = 0, hits = 0, fsTriggers = 0;
  for (let i = 0; i < spins; i++) {
    wagered += bet;
    let o = spin(def, rng, bet, false);
    won += o.totalPayout;
    if (o.totalPayout > 0) hits++;
    let fs = o.freeSpinsAwarded;
    if (fs > 0) fsTriggers++;
    while (fs > 0) {
      fs--;
      o = spin(def, rng, bet, true);
      won += o.totalPayout;
      fs += o.freeSpinsAwarded;
    }
  }
  return { rtp: won / wagered, hitRate: hits / spins, fsRate: fsTriggers / spins };
}

export const MACHINES: Record<string, SlotMachineDef> = { [MEME_MACHINE.id]: MEME_MACHINE };
