/**
 * Source d'aléa AUTORITAIRE.
 * Utilisée uniquement par la couche serveur (src/server). L'interface ne
 * l'importe jamais : elle reçoit des résultats déjà tirés.
 *
 * En local, on utilise crypto.getRandomValues (CSPRNG du navigateur / Node).
 * En production, la même interface sera implémentée côté Edge Function
 * Supabase — le client ne détermine jamais un gain.
 */
export interface Rng {
  /** Flottant uniforme dans [0, 1). */
  next(): number;
}

export class CryptoRng implements Rng {
  private buf = new Uint32Array(64);
  private idx = 64;

  next(): number {
    if (this.idx >= this.buf.length) {
      globalThis.crypto.getRandomValues(this.buf);
      this.idx = 0;
    }
    // 32 bits d'entropie suffisent pour nos tirages ; division exacte → [0,1)
    return this.buf[this.idx++] / 4294967296;
  }
}

/** RNG déterministe (mulberry32) — UNIQUEMENT pour les tests et simulations. */
export class SeededRng implements Rng {
  constructor(private seed: number) {}
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng.next() * maxExclusive);
}

/** Tirage pondéré. Les poids n'ont pas besoin de sommer à 1. */
export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((s, it) => s + weight(it), 0);
  if (total <= 0) throw new Error('weightedPick: total des poids nul');
  let r = rng.next() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function uid(rng: Rng = new CryptoRng()): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += Math.floor(rng.next() * 0xffffffff).toString(16).padStart(8, '0');
  return s;
}
