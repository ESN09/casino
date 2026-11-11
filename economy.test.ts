import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalServer, memoryKV } from '../src/server/localServer';
import { SeededRng, weightedPick } from '../src/core/rng';
import { CASES, caseCardOdds, validateCase } from '../src/collection/cases';
import { CARD_BY_ID, CARDS } from '../src/collection/cards';
import { RARITIES } from '../src/collection/rarities';
import { ECONOMY } from '../src/config/economy';

const DAY = 86_400_000;
const mk = (start = Date.parse('2026-11-11T10:00:00Z')) => {
  let t = start;
  const clock = { now: () => t, set: (v: number) => (t = v), add: (d: number) => (t += d) };
  const srv = new LocalServer(memoryKV(), new SeededRng(7), clock.now);
  return { srv, clock };
};
let k = 0;
const key = () => `test-key-${++k}`;

test('les probabilités standard des raretés totalisent 100 %', () => {
  const sum = Object.values(RARITIES).reduce((s, r) => s + r.standardPct, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
});

test('toutes les caisses sont valides et leurs cotes par carte somment à 100 %', () => {
  for (const c of CASES) {
    assert.deepEqual(validateCase(c, CARD_BY_ID), []);
    const total = caseCardOdds(c, CARD_BY_ID).reduce((s, o) => s + o.pct, 0);
    assert.ok(Math.abs(total - 100) < 1e-9);
  }
  assert.equal(CARDS.length, 20);
  assert.equal(new Set(CARDS.map((c) => c.number)).size, 20);
});

test('tirage pondéré : fréquences proches des poids', () => {
  const rng = new SeededRng(1);
  const items = [['a', 62], ['b', 28], ['c', 10]] as const;
  const n = 200_000, cnt: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < n; i++) cnt[weightedPick(rng, items, (x) => x[1])[0]]++;
  assert.ok(Math.abs(cnt.a / n - 0.62) < 0.005);
  assert.ok(Math.abs(cnt.c / n - 0.10) < 0.005);
});

test('nouveau joueur : 5 000 crédits et transaction de départ', async () => {
  const { srv } = mk();
  const p = await srv.getProfile();
  assert.equal(p.balance, ECONOMY.startingCredits);
  const tx = await srv.transactions();
  assert.equal(tx[0].type, 'starting');
});

test('caisse : débit, carte ajoutée, idempotence (pas de double transaction)', async () => {
  const { srv } = mk();
  const kk = key();
  const a = await srv.openCase('starter', kk);
  const b = await srv.openCase('starter', kk);
  assert.equal(a.openId, b.openId);
  const p = await srv.getProfile();
  assert.equal(p.balance, 5000 - 100);
  assert.equal(p.stats.casesOpened, 1);
  assert.equal(p.collection[a.cardId].count, 1);
});

test('crédits insuffisants : refus sans modification du solde', async () => {
  const { srv } = mk();
  for (let i = 0; i < 50; i++) await srv.openCase('starter', key());
  await assert.rejects(srv.openCase('starter', key()), /insuffisants/);
  assert.equal((await srv.getProfile()).balance, 0);
});

test('distribution des raretés de la caisse Starter (10 000 ouvertures)', async () => {
  const { srv } = mk();
  // Solde illimité pour le test : on réclame un coup de pouce impossible, donc on recrée via plusieurs serveurs.
  const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
  let opened = 0;
  let s = srv;
  while (opened < 10_000) {
    try { const r = await s.openCase('starter', key()); counts[CARD_BY_ID[r.cardId].rarity]++; opened++; }
    catch { s = new LocalServer(memoryKV(), new SeededRng(opened)); }
  }
  assert.ok(Math.abs(counts.common / opened - 0.62) < 0.02, JSON.stringify(counts));
  assert.ok(Math.abs(counts.rare / opened - 0.10) < 0.015, JSON.stringify(counts));
});

test('récompense quotidienne : une fois par jour UTC, série et bonus du 7e jour', async () => {
  const { srv, clock } = mk();
  const d1 = await srv.claimDaily(key());
  assert.equal(d1.day, 1);
  assert.equal(d1.credits, 1000);
  await assert.rejects(srv.claimDaily(key()), /déjà/);
  let last = d1;
  for (let d = 2; d <= 7; d++) { clock.add(DAY); last = await srv.claimDaily(key()); }
  assert.equal(last.day, 7);
  assert.equal(last.credits, 1000 + 2000);
  clock.add(DAY);
  assert.equal((await srv.claimDaily(key())).day, 1, 'la série reboucle après 7 jours');
  clock.add(3 * DAY);
  assert.equal((await srv.dailyStatus()).nextDay, 1, 'un jour manqué réinitialise la série');
});

test('anti-triche horloge : reculer l\'heure bloque la récompense', async () => {
  const { srv, clock } = mk();
  await srv.claimDaily(key());
  clock.add(DAY * 3);
  await srv.getProfile(); // l'appareil « voit » cette date
  clock.add(-DAY * 2);    // le joueur recule son horloge
  const st = await srv.dailyStatus();
  assert.equal(st.clockTamper, true);
  assert.equal(st.canClaim, false);
  await assert.rejects(srv.claimDaily(key()), /horloge/);
});

test('machine à sous : mise débitée, gain crédité, bilan du registre cohérent', async () => {
  const { srv } = mk();
  let expected = 5000;
  for (let i = 0; i < 200; i++) {
    const r = await srv.slotSpin('meme-machine', 50, key());
    expected += (r.wasFree ? 0 : -50) + r.outcome.totalPayout;
    assert.equal(r.profile.balance, expected);
  }
  await assert.rejects(srv.slotSpin('meme-machine', 33, key()), /Mise/);
});

test('blackjack : la carte cachée du croupier n\'est pas exposée', async () => {
  const { srv } = mk();
  for (let i = 0; i < 30; i++) {
    const v = await srv.bjDeal(100, key());
    if (v.phase === 'player') {
      assert.equal(v.dealer[1], null);
      const end = await srv.bjAction(v.roundId, 'stand', key());
      assert.equal(end.phase, 'done');
      assert.ok(end.dealer.every((c) => c !== null));
    }
  }
});

test('blackjack : solde = départ − mises + gains', async () => {
  const { srv } = mk();
  let bal = 5000;
  for (let i = 0; i < 40; i++) {
    let v = await srv.bjDeal(100, key());
    bal -= 100;
    while (v.phase === 'player') {
      const act = v.actions.double ? 'double' : 'stand';
      if (act === 'double') bal -= v.hands[v.active].bet;
      v = await srv.bjAction(v.roundId, act, key());
    }
    bal += v.hands.reduce((s, h) => s + (h.payout ?? 0), 0);
    assert.equal(v.profile.balance, bal);
  }
});

test('blackjack : impossible de distribuer pendant une main en cours', async () => {
  const { srv } = mk();
  let v = await srv.bjDeal(100, key());
  while (v.phase !== 'player') v = await srv.bjDeal(100, key());
  await assert.rejects(srv.bjDeal(100, key()), /déjà en cours/);
});

test('coup de pouce disponible uniquement sous le seuil', async () => {
  const { srv } = mk();
  assert.equal((await srv.dailyStatus()).rescueAvailable, false);
  for (let i = 0; i < 50; i++) await srv.openCase('starter', key());
  assert.equal((await srv.dailyStatus()).rescueAvailable, true);
  const p = await srv.claimRescue(key());
  assert.equal(p.balance, ECONOMY.rescue.credits);
});
