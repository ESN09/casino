import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEME_MACHINE as M, evaluate, simulateRtp } from '../src/games/slots/engine';
import { SeededRng } from '../src/core/rng';

const lineBet = (bet: number) => bet / M.paylines.length;
/** Construit une grille [rouleau][rangée] à partir de 3 rangées lisibles. */
const grid = (top: string[], mid: string[], bot: string[]) => top.map((_, r) => [top[r], mid[r], bot[r]]);
const F = ['potato', 'toast', 'pigeon', 'frog', 'duck'];

test('3 symboles alignés sur la ligne du milieu', () => {
  const g = grid(['toast', 'pigeon', 'toast', 'pigeon', 'toast'], ['doge', 'doge', 'doge', 'potato', 'frog'], ['pigeon', 'toast', 'frog', 'toast', 'duck']);
  const o = evaluate(M, g, 100);
  const w = o.lineWins.find((x) => x.line === 0)!;
  assert.equal(w.symbol, 'doge');
  assert.equal(w.count, 3);
  assert.equal(w.payout, 20 * lineBet(100));
});

test('le wild remplace un symbole', () => {
  const g = grid(F, ['duck', 'wild', 'duck', 'duck', 'potato'], [...F].reverse());
  const w = evaluate(M, g, 100).lineWins.find((x) => x.line === 0)!;
  assert.equal(w.symbol, 'duck');
  assert.equal(w.count, 4);
});

test('wilds en tête : le meilleur gain est retenu', () => {
  const g = grid(F, ['wild', 'wild', 'wild', 'potato', 'toast'], [...F].reverse());
  const w = evaluate(M, g, 100).lineWins.find((x) => x.line === 0)!;
  // 3 wilds (30) > 4 patates (10)
  assert.equal(w.symbol, 'wild');
  assert.equal(w.payout, 30 * lineBet(100));
});

test('3 scatters : gain sur la mise totale + 8 tours gratuits', () => {
  const g = grid(['scatter', 'toast', 'scatter', 'toast', 'frog'], ['potato', 'pigeon', 'frog', 'scatter', 'duck'], ['toast', 'frog', 'pigeon', 'duck', 'potato']);
  const o = evaluate(M, g, 100);
  assert.equal(o.scatterCount, 3);
  assert.equal(o.scatterPayout, 200);
  assert.equal(o.freeSpinsAwarded, 8);
});

test('le multiplicateur des tours gratuits s\'applique', () => {
  const g = grid(F, ['doge', 'doge', 'doge', 'potato', 'frog'], [...F].reverse());
  assert.equal(evaluate(M, g, 100, 2).totalPayout, evaluate(M, g, 100, 1).totalPayout * 2);
});

test('RTP simulé cohérent avec la valeur affichée (±2 pts)', () => {
  const { rtp, hitRate } = simulateRtp(M, new SeededRng(2026), 300_000);
  assert.ok(Math.abs(rtp - M.measuredRtp) < 0.02, `RTP ${rtp}`);
  assert.ok(hitRate > 0.3 && hitRate < 0.55, `taux de gain ${hitRate}`);
});
