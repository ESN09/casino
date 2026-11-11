import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as BJ from '../src/games/blackjack/engine';
import type { Card, Rank } from '../src/games/blackjack/engine';

const C = (r: Rank, s: Card['suit'] = '♠'): Card => ({ rank: r, suit: s });
/** Sabot ordonné : P1, D1, P2, D2, puis tirages suivants. */
const shoe = (...ranks: Rank[]) => ranks.map((r) => C(r));

test('valeur des mains : As = 11 ou 1', () => {
  assert.deepEqual(BJ.handValue([C('A'), C('6')]), { total: 17, soft: true });
  assert.deepEqual(BJ.handValue([C('A'), C('6'), C('10')]), { total: 17, soft: false });
  assert.deepEqual(BJ.handValue([C('A'), C('A'), C('9')]), { total: 21, soft: true });
  assert.deepEqual(BJ.handValue([C('A'), C('A'), C('A'), C('A')]), { total: 14, soft: true });
  assert.equal(BJ.handValue([C('K'), C('Q'), C('2')]).total, 22);
});

test('blackjack naturel payé 3:2', () => {
  const s = BJ.deal(shoe('A', '9', 'K', '7'), 100);
  assert.equal(s.phase, 'done');
  assert.equal(s.hands[0].result, 'blackjack');
  assert.equal(BJ.totalPayout(s), 250);
});

test('blackjack du croupier détecté (peek) : le joueur perd immédiatement', () => {
  const s = BJ.deal(shoe('10', 'A', '9', 'K'), 100);
  assert.equal(s.phase, 'done');
  assert.equal(s.hands[0].result, 'lose');
  assert.equal(BJ.totalPayout(s), 0);
});

test('blackjack des deux côtés : égalité', () => {
  const s = BJ.deal(shoe('A', 'A', 'K', 'Q'), 100);
  assert.equal(s.hands[0].result, 'push');
  assert.equal(BJ.totalPayout(s), 100);
});

test('le joueur saute au-delà de 21', () => {
  const s = BJ.deal(shoe('10', '9', '6', '7', 'K'), 50);
  BJ.apply(s, 'hit');
  assert.equal(s.hands[0].result, 'bust');
  assert.equal(s.phase, 'done');
  assert.equal(s.dealer.length, 2, 'le croupier ne tire pas si le joueur a sauté');
});

test('le croupier tire jusqu\'à 17 et reste sur 17 souple', () => {
  // Joueur 10+8 = 18 ; croupier 6 + A = 17 souple → reste.
  const s = BJ.deal(shoe('10', '6', '8', 'A'), 100);
  BJ.apply(s, 'stand');
  assert.equal(s.dealer.length, 2);
  assert.equal(s.hands[0].result, 'win');
  assert.equal(BJ.totalPayout(s), 200);
});

test('le croupier saute : le joueur gagne', () => {
  const s = BJ.deal(shoe('10', '6', '7', '10', 'K'), 100);
  BJ.apply(s, 'stand');
  assert.equal(BJ.handValue(s.dealer).total, 26);
  assert.equal(s.hands[0].result, 'win');
});

test('égalité rend la mise', () => {
  const s = BJ.deal(shoe('10', '10', '8', '8'), 100);
  BJ.apply(s, 'stand');
  assert.equal(s.hands[0].result, 'push');
  assert.equal(BJ.totalPayout(s), 100);
});

test('doubler : mise ×2, une seule carte, main terminée', () => {
  const s = BJ.deal(shoe('6', '9', '5', '7', 'K', '10'), 100);
  assert.equal(BJ.extraBetFor(s, 'double'), 100);
  BJ.apply(s, 'double');
  assert.equal(s.hands[0].bet, 200);
  assert.equal(s.hands[0].cards.length, 3);
  assert.equal(BJ.handValue(s.hands[0].cards).total, 21);
  assert.equal(s.hands[0].result, 'win');
  assert.equal(BJ.totalPayout(s), 400);
});

test('doubler impossible après 3 cartes', () => {
  const s = BJ.deal(shoe('2', '9', '3', '7', '4'), 100);
  BJ.apply(s, 'hit');
  assert.equal(BJ.availableActions(s).double, false);
  assert.throws(() => BJ.apply(s, 'double'));
});

test('séparer une paire : deux mains jouées tour à tour', () => {
  // P: 8,8 ; D: 10,7 ; tirages : 3 (main 1), K (main 2) puis joueur
  const s = BJ.deal(shoe('8', '10', '8', '7', '3', 'K'), 100);
  assert.equal(BJ.availableActions(s).split, true);
  BJ.apply(s, 'split');
  assert.equal(s.hands.length, 2);
  assert.equal(s.hands[0].cards.map((c) => c.rank).join(), '8,3');
  assert.equal(s.hands[1].cards.map((c) => c.rank).join(), '8,K');
  assert.equal(s.active, 0);
  BJ.apply(s, 'stand'); // 11 — mauvais choix mais légal
  assert.equal(s.active, 1);
  BJ.apply(s, 'stand'); // 18 vs 17
  assert.equal(s.phase, 'done');
  assert.equal(s.hands[0].result, 'lose');
  assert.equal(s.hands[1].result, 'win');
  assert.equal(BJ.totalPayout(s), 200);
});

test('As séparés : une carte chacun, 21 après séparation n\'est pas un blackjack', () => {
  const s = BJ.deal(shoe('A', '9', 'A', '9', 'K', '5'), 100);
  BJ.apply(s, 'split');
  assert.equal(s.phase, 'done');
  assert.equal(s.hands[0].result, 'win'); // 21 contre 18, payé 1:1
  assert.equal(s.hands[0].payout, 200);
  assert.equal(s.hands[1].result, 'lose'); // 16 contre 18
});

test('séparation limitée à 4 mains', () => {
  const s = BJ.deal(shoe('8', '10', '8', '9', '8', '8', '8', '8', '2', '2', '2', '2'), 10);
  BJ.apply(s, 'split');
  BJ.apply(s, 'split');
  BJ.apply(s, 'split');
  assert.equal(s.hands.length, 4);
  assert.equal(BJ.availableActions(s).split, false);
});

test('un sabot contient 6 × 52 cartes', () => {
  let n = 1;
  const shoeCards = BJ.newShoe({ next: () => ((n = (n * 48271) % 2147483647) / 2147483647) });
  assert.equal(shoeCards.length, 312);
  assert.equal(shoeCards.filter((c) => c.rank === 'A').length, 24);
});
