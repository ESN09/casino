import { CryptoRng, randInt, uid, weightedPick, type Rng } from '../core/rng';
import { ECONOMY, levelFromXp } from '../config/economy';
import { CARD_BY_ID } from '../collection/cards';
import { CASE_BY_ID } from '../collection/cases';
import type { RarityId } from '../collection/rarities';
import { MACHINES, spin } from '../games/slots/engine';
import * as BJ from '../games/blackjack/engine';
import {
  GameError,
  type BlackjackView, type CaseHistoryEntry, type CaseOpenResult, type DailyClaim, type DailyStatus,
  type GameServer, type OwnedCard, type ProfileView, type SlotSession, type SlotSpinResult, type Transaction, type TxType,
} from './types';

/**
 * Serveur LOCAL (mode développement / invité hors-ligne).
 *
 * Il joue le rôle du serveur autoritaire : tirages par CSPRNG, contrôle des
 * mises et du solde, idempotence, registre des transactions. Il s'exécute
 * néanmoins dans le navigateur : un joueur déterminé peut modifier son
 * localStorage. C'est assumé en mode invité ; en production, la même
 * interface est servie par Supabase (Phase 5).
 */

export interface KV { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }

/** localStorage, avec repli en mémoire si le stockage est indisponible (navigation privée, iframe…). */
export function browserKV(): KV {
  try {
    const ls = globalThis.localStorage;
    const probe = '__mj_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v), remove: (k) => ls.removeItem(k) };
  } catch {
    console.warn('Stockage local indisponible : la partie ne sera pas sauvegardée.');
    return memoryKV();
  }
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
}

const SAVE_KEY = 'memejackpot.save.v1';
const SAVE_VERSION = 1;
const MAX_IDEM = 200;

interface BjRound extends BJ.BlackjackState { roundId: string }

interface Save {
  version: number;
  playerId: string;
  name: string;
  avatar: string;
  balance: number;
  xp: number;
  ageConfirmed: boolean;
  stats: ProfileView['stats'];
  collection: Record<string, OwnedCard>;
  settings: ProfileView['settings'];
  ledger: Transaction[];
  idem: Record<string, { at: number; result: unknown }>;
  idemOrder: string[];
  daily: { lastClaimDay: string | null; streak: number };
  lastSeenAt: number;
  rescueLastAt: number;
  caseHistory: CaseHistoryEntry[];
  slots: Record<string, SlotSession>;
  bj: BjRound | null;
  shoe: BJ.Card[];
}

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class LocalServer implements GameServer {
  constructor(
    private kv: KV = browserKV(),
    private rng: Rng = new CryptoRng(),
    private now: () => number = () => Date.now(),
  ) {}

  // ─── Persistance ──────────────────────────────────────────────────────
  private fresh(): Save {
    const t = this.now();
    const s: Save = {
      version: SAVE_VERSION,
      playerId: uid(this.rng),
      name: 'Invité',
      avatar: '😎',
      balance: 0,
      xp: 0,
      ageConfirmed: false,
      stats: { spins: 0, bjHands: 0, casesOpened: 0, totalWagered: 0, totalWon: 0, biggestWin: 0 },
      collection: {},
      settings: { sound: true, reducedMotion: false, sessionLimitMin: 0 },
      ledger: [],
      idem: {},
      idemOrder: [],
      daily: { lastClaimDay: null, streak: 0 },
      lastSeenAt: t,
      rescueLastAt: 0,
      caseHistory: [],
      slots: {},
      bj: null,
      shoe: [],
    };
    this.tx(s, 'starting', ECONOMY.startingCredits);
    return s;
  }

  private load(): Save {
    const raw = this.kv.get(SAVE_KEY);
    if (!raw) {
      const s = this.fresh();
      this.persist(s);
      return s;
    }
    try {
      const s = JSON.parse(raw) as Save;
      if (s.version !== SAVE_VERSION) throw new Error('version');
      return s;
    } catch {
      // Sauvegarde corrompue : on la conserve à part et on repart proprement.
      this.kv.set(`${SAVE_KEY}.corrupt.${this.now()}`, raw);
      const s = this.fresh();
      this.persist(s);
      return s;
    }
  }

  private persist(s: Save): void {
    this.kv.set(SAVE_KEY, JSON.stringify(s));
  }

  /** Lecture-modification-écriture atomique (à l'échelle d'un onglet). */
  private mutate<T>(fn: (s: Save) => T): T {
    const s = this.load();
    this.touchClock(s);
    const out = fn(s);
    this.persist(s);
    return out;
  }

  /** Exécute `fn` une seule fois par clé d'idempotence. */
  private once<T>(key: string, fn: (s: Save) => T): T {
    if (!key || key.length < 8) throw new GameError('INVALID', 'Clé d\'idempotence manquante');
    const s0 = this.load();
    const hit = s0.idem[key];
    if (hit) return hit.result as T;
    return this.mutate((s) => {
      const result = fn(s);
      s.idem[key] = { at: this.now(), result };
      s.idemOrder.push(key);
      while (s.idemOrder.length > MAX_IDEM) delete s.idem[s.idemOrder.shift()!];
      return result;
    });
  }

  private touchClock(s: Save): void {
    s.lastSeenAt = Math.max(s.lastSeenAt, this.now());
  }

  private clockTampered(s: Save): boolean {
    return this.now() + ECONOMY.clockToleranceMs < s.lastSeenAt;
  }

  // ─── Registre & solde ────────────────────────────────────────────────
  private tx(s: Save, type: TxType, amount: number, ref?: string): void {
    if (!Number.isInteger(amount)) throw new GameError('INVALID', 'Montant non entier');
    if (s.balance + amount < 0) throw new GameError('INSUFFICIENT_FUNDS', 'Crédits insuffisants');
    s.balance += amount;
    s.ledger.unshift({ id: uid(this.rng), type, amount, balanceAfter: s.balance, at: this.now(), ref });
    if (s.ledger.length > ECONOMY.ledgerMaxEntries) s.ledger.length = ECONOMY.ledgerMaxEntries;
  }

  private wager(s: Save, type: TxType, amount: number, ref?: string): void {
    if (amount <= 0) throw new GameError('INVALID', 'Mise invalide');
    this.tx(s, type, -amount, ref);
    s.stats.totalWagered += amount;
    s.xp += Math.round(amount * ECONOMY.xp.perCreditWagered);
  }

  private win(s: Save, type: TxType, amount: number, ref?: string): void {
    if (amount <= 0) return;
    this.tx(s, type, amount, ref);
    s.stats.totalWon += amount;
    s.stats.biggestWin = Math.max(s.stats.biggestWin, amount);
  }

  private view(s: Save): ProfileView {
    const lv = levelFromXp(s.xp);
    return {
      playerId: s.playerId, name: s.name, avatar: s.avatar, balance: s.balance, xp: s.xp,
      level: lv.level, levelXp: lv.current, levelXpNext: lv.next, ageConfirmed: s.ageConfirmed,
      stats: { ...s.stats }, collection: structuredClone(s.collection), settings: { ...s.settings },
    };
  }

  // ─── Profil ──────────────────────────────────────────────────────────
  async getProfile() { return this.mutate((s) => this.view(s)); }

  async updateProfile(patch: Parameters<GameServer['updateProfile']>[0]) {
    return this.mutate((s) => {
      if (patch.name !== undefined) {
        const n = patch.name.trim().slice(0, 18);
        if (n.length < 2) throw new GameError('INVALID', 'Pseudo trop court (2 caractères min.)');
        s.name = n;
      }
      if (patch.avatar !== undefined) s.avatar = [...patch.avatar].slice(0, 2).join('') || '😎';
      if (patch.ageConfirmed) s.ageConfirmed = true;
      if (patch.settings) {
        const st = patch.settings;
        if (st.sound !== undefined) s.settings.sound = !!st.sound;
        if (st.reducedMotion !== undefined) s.settings.reducedMotion = !!st.reducedMotion;
        if (st.sessionLimitMin !== undefined) s.settings.sessionLimitMin = Math.max(0, Math.min(600, Math.round(st.sessionLimitMin)));
      }
      return this.view(s);
    });
  }

  async toggleFavorite(cardId: string) {
    return this.mutate((s) => {
      const o = s.collection[cardId];
      if (!o) throw new GameError('INVALID', 'Carte non possédée');
      o.favorite = !o.favorite;
      return this.view(s);
    });
  }

  // ─── Quotidien ───────────────────────────────────────────────────────
  private dailyInfo(s: Save): DailyStatus {
    const t = this.now();
    const today = utcDayKey(t);
    const yesterday = utcDayKey(t - 86_400_000);
    const tamper = this.clockTampered(s);
    const last = s.daily.lastClaimDay;
    const canClaim = !tamper && (last === null || today > last);
    const continuing = last === yesterday || last === today;
    const streakBase = continuing ? s.daily.streak : 0;
    const nextDay = (streakBase % 7) + 1;
    const nextMidnight = Date.parse(`${today}T00:00:00.000Z`) + 86_400_000;
    const rescueMsLeft = Math.max(0, s.rescueLastAt + ECONOMY.rescue.cooldownMs - t);
    return {
      canClaim, nextDay, streak: continuing ? s.daily.streak : 0,
      msUntilNext: canClaim ? 0 : nextMidnight - t,
      clockTamper: tamper,
      rescueAvailable: !tamper && s.balance < ECONOMY.rescue.threshold && rescueMsLeft === 0 && !s.bj,
      rescueMsLeft,
    };
  }

  async dailyStatus() { return this.mutate((s) => this.dailyInfo(s)); }

  async claimDaily(key: string): Promise<DailyClaim> {
    return this.once(key, (s) => {
      const st = this.dailyInfo(s);
      if (st.clockTamper) throw new GameError('CLOCK', 'L\'horloge de l\'appareil a reculé. Récompense bloquée jusqu\'au retour à l\'heure réelle.');
      if (!st.canClaim) throw new GameError('NOT_AVAILABLE', 'Récompense déjà réclamée aujourd\'hui');
      const day = st.nextDay;
      const credits = ECONOMY.daily.baseCredits + ECONOMY.daily.streakBonus[day - 1] + (day === 7 ? ECONOMY.daily.day7BonusCredits : 0);
      this.tx(s, 'daily', credits, `jour ${day}`);
      s.xp += ECONOMY.daily.loginXp;
      s.daily = { lastClaimDay: utcDayKey(this.now()), streak: day };
      return { day, credits, xp: ECONOMY.daily.loginXp, profile: this.view(s) };
    });
  }

  async claimRescue(key: string) {
    return this.once(key, (s) => {
      if (!this.dailyInfo(s).rescueAvailable) throw new GameError('NOT_AVAILABLE', 'Coup de pouce indisponible');
      this.tx(s, 'rescue', ECONOMY.rescue.credits);
      s.rescueLastAt = this.now();
      return this.view(s);
    });
  }

  // ─── Caisses ─────────────────────────────────────────────────────────
  async openCase(caseId: string, key: string): Promise<CaseOpenResult> {
    return this.once(key, (s) => {
      const def = CASE_BY_ID[caseId];
      if (!def) throw new GameError('INVALID', 'Caisse inconnue');
      this.tx(s, 'case_buy', -def.price, def.id);
      s.stats.totalWagered += def.price;
      const rarities = Object.entries(def.rarityPct) as [RarityId, number][];
      const [rarity] = weightedPick(this.rng, rarities, ([, p]) => p);
      const pool = def.pool.filter((id) => CARD_BY_ID[id].rarity === rarity);
      const cardId = pool[randInt(this.rng, pool.length)];
      const t = this.now();
      const owned = s.collection[cardId];
      const isNew = !owned;
      if (owned) { owned.count++; owned.lastAt = t; }
      else s.collection[cardId] = { cardId, count: 1, firstAt: t, lastAt: t, favorite: false };
      s.stats.casesOpened++;
      s.xp += ECONOMY.xp.perCaseOpened;
      const openId = uid(this.rng);
      s.caseHistory.unshift({ openId, caseId, cardId, at: t });
      if (s.caseHistory.length > 100) s.caseHistory.length = 100;
      return { openId, caseId, oddsVersion: def.oddsVersion, cardId, isNew, profile: this.view(s) };
    });
  }

  async caseHistory() { return this.load().caseHistory; }

  // ─── Machines à sous ─────────────────────────────────────────────────
  private session(s: Save, machineId: string): SlotSession {
    return (s.slots[machineId] ??= { machineId, freeSpinsLeft: 0, freeSpinBet: 0, freeSpinsWon: 0 });
  }

  async slotSession(machineId: string) { return this.mutate((s) => ({ ...this.session(s, machineId) })); }

  async slotSpin(machineId: string, bet: number, key: string): Promise<SlotSpinResult> {
    return this.once(key, (s) => {
      const def = MACHINES[machineId];
      if (!def) throw new GameError('INVALID', 'Machine inconnue');
      const ses = this.session(s, machineId);
      const wasFree = ses.freeSpinsLeft > 0;
      const stake = wasFree ? ses.freeSpinBet : bet;
      if (!wasFree) {
        if (!def.bets.includes(bet)) throw new GameError('INVALID', 'Mise non autorisée');
        this.wager(s, 'slot_bet', bet, machineId);
      }
      const outcome = spin(def, this.rng, stake, wasFree);
      this.win(s, 'slot_win', outcome.totalPayout, machineId);
      s.stats.spins++;
      if (wasFree) {
        ses.freeSpinsLeft = ses.freeSpinsLeft - 1 + outcome.freeSpinsAwarded;
        ses.freeSpinsWon += outcome.totalPayout;
      } else if (outcome.freeSpinsAwarded > 0) {
        ses.freeSpinsLeft = outcome.freeSpinsAwarded;
        ses.freeSpinBet = bet;
        ses.freeSpinsWon = 0;
      }
      return { outcome, bet: stake, wasFree, freeSpinsLeft: ses.freeSpinsLeft, freeSpinsWon: ses.freeSpinsWon, profile: this.view(s) };
    });
  }

  // ─── Blackjack ───────────────────────────────────────────────────────
  private bjView(s: Save, r: BjRound): BlackjackView {
    const hidden = r.phase === 'player';
    const net = r.phase === 'done' ? BJ.totalPayout(r) - BJ.totalStaked(r) : undefined;
    return {
      roundId: r.roundId,
      phase: r.phase,
      dealer: r.dealer.map((c, i) => (hidden && i === 1 ? null : c)),
      dealerTotal: hidden ? BJ.handValue([r.dealer[0]]).total : BJ.handValue(r.dealer).total,
      hands: r.hands.map((h) => ({ cards: h.cards, bet: h.bet, doubled: h.doubled, ...BJ.handValue(h.cards), result: h.result, payout: h.payout })),
      active: r.active,
      actions: BJ.availableActions(r),
      netResult: net,
      profile: this.view(s),
    };
  }

  private finishBj(s: Save, r: BjRound): void {
    if (r.phase !== 'done') return;
    this.win(s, 'bj_win', BJ.totalPayout(r), r.roundId);
    s.stats.bjHands += r.hands.length;
  }

  async bjCurrent() {
    return this.mutate((s) => (s.bj && s.bj.phase === 'player' ? this.bjView(s, s.bj) : null));
  }

  async bjDeal(bet: number, key: string) {
    return this.once(key, (s) => {
      if (s.bj && s.bj.phase === 'player') throw new GameError('INVALID', 'Une main est déjà en cours');
      if (!Number.isInteger(bet) || bet < 10 || bet > 5000) throw new GameError('INVALID', 'Mise entre 10 et 5 000');
      this.wager(s, 'bj_bet', bet);
      if (s.shoe.length < BJ.RULES.reshuffleBelow) s.shoe = BJ.newShoe(this.rng);
      const st = BJ.deal(s.shoe, bet);
      const r: BjRound = { ...st, roundId: uid(this.rng) };
      s.shoe = r.shoe;
      s.bj = r;
      this.finishBj(s, r);
      return this.bjView(s, r);
    });
  }

  async bjAction(roundId: string, action: BJ.BjAction, key: string) {
    return this.once(key, (s) => {
      const r = s.bj;
      if (!r || r.roundId !== roundId || r.phase !== 'player') throw new GameError('INVALID', 'Aucune main en cours');
      if (!BJ.availableActions(r)[action]) throw new GameError('INVALID', 'Action impossible');
      const extra = BJ.extraBetFor(r, action);
      if (extra > 0) this.wager(s, 'bj_bet', extra, r.roundId);
      BJ.apply(r, action);
      s.shoe = r.shoe;
      this.finishBj(s, r);
      return this.bjView(s, r);
    });
  }

  // ─── Divers ──────────────────────────────────────────────────────────
  async transactions() { return this.load().ledger; }

  async exportData() {
    const s = this.load();
    const { idem: _i, idemOrder: _o, shoe: _sh, ...rest } = s;
    return JSON.stringify({ exportedAt: new Date(this.now()).toISOString(), note: 'Crédits et cartes fictifs, sans valeur monétaire.', data: rest }, null, 2);
  }

  async resetAll() {
    this.kv.remove(SAVE_KEY);
    return this.getProfile();
  }
}
