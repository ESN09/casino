import { shuffle, type Rng } from '../../core/rng';

/**
 * Moteur de blackjack pur (aucune dépendance UI).
 * Règles : 6 jeux, le croupier reste sur 17 souple (S17), blackjack payé 3:2,
 * le croupier vérifie le blackjack sur As ou figure (peek), doublement sur
 * 2 cartes (y compris après séparation), séparation jusqu'à 4 mains,
 * As séparés : une seule carte chacun, pas de re-séparation des As.
 */

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export interface Card { rank: Rank; suit: Suit }

export const RULES = {
  decks: 6,
  reshuffleBelow: 78,
  dealerHitsSoft17: false,
  blackjackPays: 1.5,
  maxHands: 4,
} as const;

export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  result?: HandResult;
  /** Montant total rendu au joueur (mise incluse). */
  payout?: number;
}

export interface BlackjackState {
  shoe: Card[];
  dealer: Card[];
  hands: PlayerHand[];
  active: number;
  phase: 'player' | 'done';
  baseBet: number;
}

export type BjAction = 'hit' | 'stand' | 'double' | 'split';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function newShoe(rng: Rng, decks: number = RULES.decks): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ rank: r, suit: s });
  return shuffle(rng, shoe);
}

export function cardValue(c: Card): number {
  if (c.rank === 'A') return 11;
  if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return 10;
  return Number(c.rank);
}

/** Valeur d'une main : les As valent 11 puis 1 si nécessaire. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

function draw(state: BlackjackState): Card {
  const c = state.shoe.shift();
  if (!c) throw new Error('Sabot vide');
  return c;
}

export function deal(shoe: Card[], bet: number): BlackjackState {
  const s: BlackjackState = {
    shoe, dealer: [], active: 0, phase: 'player', baseBet: bet,
    hands: [{ cards: [], bet, doubled: false, done: false, fromSplit: false, splitAces: false }],
  };
  s.hands[0].cards.push(draw(s));
  s.dealer.push(draw(s));
  s.hands[0].cards.push(draw(s));
  s.dealer.push(draw(s));

  const playerBj = isBlackjack(s.hands[0].cards);
  const up = s.dealer[0];
  const dealerPeeks = up.rank === 'A' || cardValue(up) === 10;
  const dealerBj = dealerPeeks && isBlackjack(s.dealer);
  if (playerBj || dealerBj) settle(s);
  return s;
}

export function availableActions(s: BlackjackState): Record<BjAction, boolean> {
  const none = { hit: false, stand: false, double: false, split: false };
  if (s.phase !== 'player') return none;
  const h = s.hands[s.active];
  if (!h || h.done) return none;
  const two = h.cards.length === 2;
  const sameRank = two && cardValue(h.cards[0]) === cardValue(h.cards[1]) && (h.cards[0].rank === h.cards[1].rank || cardValue(h.cards[0]) === 10);
  return {
    hit: true,
    stand: true,
    double: two,
    split: sameRank && s.hands.length < RULES.maxHands && !(h.splitAces),
  };
}

/** Mise supplémentaire requise par une action (débitée par le serveur AVANT apply). */
export function extraBetFor(s: BlackjackState, a: BjAction): number {
  return a === 'double' || a === 'split' ? s.hands[s.active].bet : 0;
}

export function apply(s: BlackjackState, a: BjAction): BlackjackState {
  if (!availableActions(s)[a]) throw new Error(`Action « ${a} » impossible`);
  const h = s.hands[s.active];
  switch (a) {
    case 'hit':
      h.cards.push(draw(s));
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
      break;
    case 'split': {
      const aces = h.cards[0].rank === 'A';
      const second = h.cards.pop()!;
      const nh: PlayerHand = { cards: [second], bet: h.bet, doubled: false, done: false, fromSplit: true, splitAces: aces };
      h.fromSplit = true;
      h.splitAces = aces;
      h.cards.push(draw(s));
      nh.cards.push(draw(s));
      s.hands.splice(s.active + 1, 0, nh);
      if (aces) { h.done = true; nh.done = true; }
      else if (handValue(h.cards).total === 21) h.done = true;
      break;
    }
  }
  advance(s);
  return s;
}

function advance(s: BlackjackState): void {
  while (s.active < s.hands.length && s.hands[s.active].done) {
    s.active++;
    const nh = s.hands[s.active];
    if (nh && handValue(nh.cards).total === 21) nh.done = true;
  }
  if (s.active >= s.hands.length) {
    s.active = s.hands.length - 1;
    playDealer(s);
    settle(s);
  }
}

export function dealerShouldHit(cards: Card[]): boolean {
  const { total, soft } = handValue(cards);
  if (total < 17) return true;
  return total === 17 && soft && RULES.dealerHitsSoft17;
}

function playDealer(s: BlackjackState): void {
  // Inutile de tirer si toutes les mains du joueur ont sauté.
  if (s.hands.every((h) => handValue(h.cards).total > 21)) return;
  while (dealerShouldHit(s.dealer)) s.dealer.push(draw(s));
}

function settle(s: BlackjackState): void {
  const d = handValue(s.dealer).total;
  const dealerBj = isBlackjack(s.dealer);
  for (const h of s.hands) {
    const p = handValue(h.cards).total;
    const playerBj = isBlackjack(h.cards) && !h.fromSplit;
    if (p > 21) { h.result = 'bust'; h.payout = 0; }
    else if (playerBj && !dealerBj) { h.result = 'blackjack'; h.payout = Math.floor(h.bet * (1 + RULES.blackjackPays)); }
    else if (dealerBj && !playerBj) { h.result = 'lose'; h.payout = 0; }
    else if (playerBj && dealerBj) { h.result = 'push'; h.payout = h.bet; }
    else if (d > 21 || p > d) { h.result = 'win'; h.payout = h.bet * 2; }
    else if (p === d) { h.result = 'push'; h.payout = h.bet; }
    else { h.result = 'lose'; h.payout = 0; }
    h.done = true;
  }
  s.phase = 'done';
}

export function totalPayout(s: BlackjackState): number {
  return s.hands.reduce((sum, h) => sum + (h.payout ?? 0), 0);
}
export function totalStaked(s: BlackjackState): number {
  return s.hands.reduce((sum, h) => sum + h.bet, 0);
}
