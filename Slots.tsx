import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MEME_MACHINE as M, gridFromStops, type SpinOutcome } from '../../games/slots/engine';
import { call, fmt, newKey, reducedMotion, server, useApp } from '../../state/app';
import { sfx } from '../../audio/sfx';
import { fireConfetti } from '../components/Confetti';
import { Modal } from '../components/Shell';
import type { SlotSpinResult } from '../../server/types';

const SYM = Object.fromEntries(M.symbols.map((s) => [s.id, s]));
const CELL = 92; // hauteur d'une case en px (synchronisée avec le CSS --cell)
const FILLER = 18;

/** Symboles de remplissage purement cosmétiques (n'influent pas sur le résultat). */
const randomSym = () => M.strips[0][Math.floor(Math.random() * M.strips[0].length)];

function Reel({ index, symbols, spinId, win }: { index: number; symbols: string[]; spinId: number; win: Set<string> }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const prev = useRef<string[]>(symbols);
  const [items, setItems] = useState<string[]>(symbols);

  useLayoutEffect(() => {
    if (spinId === 0) return;
    const fill = Array.from({ length: FILLER + index * 4 }, randomSym);
    const list = [...symbols, ...fill, ...prev.current];
    setItems(list);
    const el = stripRef.current!;
    const dist = (list.length - 3) * CELL;
    const rm = reducedMotion();
    const anim = el.animate(
      [{ transform: `translateY(${-dist}px)` }, { transform: 'translateY(8px)', offset: 0.94 }, { transform: 'translateY(0)' }],
      { duration: rm ? 180 + index * 40 : 900 + index * 260, easing: 'cubic-bezier(.15,.6,.25,1)', fill: 'both' },
    );
    anim.onfinish = () => { prev.current = symbols; sfx.reelStop(index); setItems(symbols); };
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  return (
    <div className="reel">
      <div className="reel-strip" ref={stripRef}>
        {items.map((id, i) => (
          <div key={i} className={`sym ${SYM[id].kind} ${i < 3 && win.has(`${index}:${i}`) ? 'win' : ''}`}>
            <span>{SYM[id].emoji}</span>
            {SYM[id].kind !== 'normal' && i < 3 && <em>{SYM[id].label}</em>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Slots() {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const toast = useApp((s) => s.toast);
  const [bet, setBet] = useState<number>(M.bets[1]);
  const [grid, setGrid] = useState<string[][]>(() => gridFromStops(M, [0, 3, 6, 9, 12]));
  const [spinId, setSpinId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SlotSpinResult | null>(null);
  const [showWin, setShowWin] = useState(false);
  const [freeLeft, setFreeLeft] = useState(0);
  const [freeWon, setFreeWon] = useState(0);
  const [paytable, setPaytable] = useState(false);
  const [lineIdx, setLineIdx] = useState(-1);

  useEffect(() => { void server.slotSession(M.id).then((s) => { setFreeLeft(s.freeSpinsLeft); setFreeWon(s.freeSpinsWon); if (s.freeSpinsLeft) setBet(s.freeSpinBet); }); }, []);

  const outcome: SpinOutcome | null = showWin ? last?.outcome ?? null : null;
  const winCells = useMemo(() => {
    const set = new Set<string>();
    if (!outcome) return set;
    const lines = lineIdx >= 0 ? [outcome.lineWins[lineIdx]] : outcome.lineWins;
    lines.forEach((w) => w.cells.forEach(([r, row]) => set.add(`${r}:${row}`)));
    if (lineIdx < 0 && outcome.scatterCount >= 3) outcome.scatterCells.forEach(([r, row]) => set.add(`${r}:${row}`));
    return set;
  }, [outcome, lineIdx]);

  // Fait défiler les lignes gagnantes une par une
  useEffect(() => {
    if (!outcome || outcome.lineWins.length < 2) { setLineIdx(-1); return; }
    let i = -1;
    const id = setInterval(() => { i = i + 1 >= outcome.lineWins.length ? -1 : i + 1; setLineIdx(i); }, 1100);
    return () => clearInterval(id);
  }, [outcome]);

  const isFree = freeLeft > 0;
  const canAfford = isFree || profile.balance >= bet;

  const doSpin = useCallback(async () => {
    if (busy || !canAfford) return;
    setBusy(true);
    setShowWin(false);
    sfx.reelStart();
    const res = await call(() => server.slotSpin(M.id, bet, newKey()));
    if (!res) { setBusy(false); return; }
    // Le résultat est déjà enregistré côté serveur ; on n'affiche le gain qu'à l'arrêt des rouleaux.
    setProfile({ ...res.profile, balance: res.profile.balance - res.outcome.totalPayout });
    setLast(res);
    setGrid(res.outcome.grid);
    setSpinId((n) => n + 1);
    const total = reducedMotion() ? 400 : 900 + (M.reels - 1) * 260 + 120;
    setTimeout(() => {
      setProfile(res.profile);
      setShowWin(true);
      setFreeLeft(res.freeSpinsLeft);
      setFreeWon(res.freeSpinsWon);
      const o = res.outcome;
      const x = o.totalPayout / res.bet;
      if (o.totalPayout > 0) {
        sfx.win(x >= 10);
        if (x >= 10) fireConfetti(x >= 50 ? 260 : 140);
      }
      if (o.freeSpinsAwarded > 0) {
        toast(res.wasFree ? `+${o.freeSpinsAwarded} tours gratuits !` : `💎 ${o.freeSpinsAwarded} TOURS GRATUITS · gains ×${M.freeSpins.multiplier}`, 'win');
        fireConfetti(120, ['#2ef2ff', '#ffffff', '#b154ff']);
      }
      if (res.wasFree && res.freeSpinsLeft === 0) toast(`Tours gratuits terminés : ${fmt(res.freeSpinsWon)} ◈ gagnés`, 'win');
      setBusy(false);
    }, total);
  }, [busy, canAfford, bet, setProfile, toast]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); void doSpin(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [doSpin]);

  const payout = outcome?.totalPayout ?? 0;
  const mult = outcome && last ? payout / last.bet : 0;
  const activeLine = outcome && lineIdx >= 0 ? outcome.lineWins[lineIdx] : null;

  return (
    <div className="screen slots" style={{ ['--m1' as string]: M.theme.from, ['--m2' as string]: M.theme.to, ['--ma' as string]: M.theme.accent }}>
      <div className="game-head">
        <div>
          <h1 className="neon">{M.name}</h1>
          <p className="muted">{M.tagline} · RTP simulé {(M.measuredRtp * 100).toFixed(1)} %</p>
        </div>
        <button className="btn ghost" onClick={() => setPaytable(true)}>ℹ️ Gains & règles</button>
      </div>

      <div className={`machine ${isFree ? 'free' : ''} ${busy ? 'spinning' : ''}`}>
        <div className="machine-lights" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.08}s` }} />)}</div>
        {isFree && <div className="free-banner">💎 TOURS GRATUITS : {freeLeft} · gains ×{M.freeSpins.multiplier} · total {fmt(freeWon)} ◈</div>}
        <div className="reels" style={{ ['--cell' as string]: `${CELL}px` }}>
          {grid.map((col, r) => <Reel key={r} index={r} symbols={col} spinId={spinId} win={winCells} />)}
          {activeLine && (
            <svg className="payline" viewBox={`0 0 ${M.reels * 100} ${M.rows * 100}`} preserveAspectRatio="none" aria-hidden>
              <polyline points={M.paylines[activeLine.line].map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(' ')} />
            </svg>
          )}
        </div>
        <div className={`win-display ${payout > 0 ? 'won' : ''} ${mult >= 10 ? 'big' : ''}`} aria-live="polite">
          {outcome ? (
            payout > 0 ? (
              <>
                <span className="wd-label">{mult >= 50 ? 'MEGA WIN' : mult >= 10 ? 'BIG WIN' : 'GAIN'}</span>
                <span className="wd-amount">+{fmt(payout)} ◈</span>
                <span className="wd-detail">
                  {activeLine ? `Ligne ${activeLine.line + 1} · ${activeLine.count}× ${SYM[activeLine.symbol].emoji}` : `${outcome.lineWins.length} ligne(s)${outcome.scatterPayout ? ' + scatter' : ''}`}
                  {outcome.multiplier > 1 ? ` · ×${outcome.multiplier}` : ''}
                </span>
              </>
            ) : <span className="wd-label dim">Pas de gain cette fois</span>
          ) : <span className="wd-label dim">{busy ? 'Les rouleaux tournent…' : 'Choisis ta mise et lance !'}</span>}
        </div>
      </div>

      <div className="controls">
        <div className="bet-picker" role="group" aria-label="Mise totale">
          <span className="muted small">Mise totale ({M.paylines.length} lignes)</span>
          <div className="row gap wrap">
            {M.bets.map((b) => (
              <button key={b} className={`chip-btn ${bet === b ? 'active' : ''}`} disabled={busy || isFree} onClick={() => { sfx.chip(); setBet(b); }}>
                {fmt(b)}
              </button>
            ))}
          </div>
        </div>
        <button className={`spin-btn ${isFree ? 'free' : ''}`} onClick={doSpin} disabled={busy || !canAfford} aria-label="Lancer">
          {busy ? '…' : isFree ? 'GRATUIT' : 'SPIN'}
          <small>{isFree ? `mise ${fmt(bet)}` : `${fmt(bet)} ◈`}</small>
        </button>
      </div>
      {!canAfford && <p className="warn">Crédits insuffisants pour cette mise. Baisse la mise ou passe par l'onglet Bonus.</p>}
      <p className="muted small center">Astuce : barre d'espace pour lancer. Résultat tiré et enregistré par le serveur avant l'animation.</p>

      {paytable && (
        <Modal title="Gains & règles — Meme Machine" onClose={() => setPaytable(false)} wide>
          <p>Gains en multiples de la <b>mise par ligne</b> (mise totale ÷ {M.paylines.length}), de gauche à droite, à partir du 1er rouleau. Seul le meilleur gain de chaque ligne compte.</p>
          <table className="paytable">
            <thead><tr><th>Symbole</th><th>×3</th><th>×4</th><th>×5</th></tr></thead>
            <tbody>
              {M.symbols.filter((s) => s.kind !== 'scatter').slice().reverse().map((s) => (
                <tr key={s.id}><td><span className="pt-emoji">{s.emoji}</span> {s.label}</td>{s.pays.map((v, i) => <td key={i}>{v}</td>)}</tr>
              ))}
              <tr><td><span className="pt-emoji">💎</span> Scatter (mise totale)</td>{M.scatterPays.map((v, i) => <td key={i}>{v}</td>)}</tr>
            </tbody>
          </table>
          <ul className="rules">
            <li><b>🃏 WILD</b> remplace tous les symboles sauf le scatter.</li>
            <li><b>💎 SCATTER</b> paie n'importe où : 3 / 4 / 5 scatters = {M.freeSpins.award[3]} / {M.freeSpins.award[4]} / {M.freeSpins.award[5]} tours gratuits.</li>
            <li>Pendant les tours gratuits, tous les gains sont multipliés par {M.freeSpins.multiplier} et la mise est figée.</li>
            <li>RTP simulé : <b>{(M.measuredRtp * 100).toFixed(1)} %</b> sur 2 millions de tours. Fréquence de gain ≈ 42 %, déclenchement des tours gratuits ≈ 1 tour sur 38.</li>
            <li>Les résultats sont indépendants des publicités, des cartes possédées et de l'historique.</li>
          </ul>
          <div className="lines-grid">
            {M.paylines.map((l, i) => (
              <div key={i} className="mini-line">
                <span>{i + 1}</span>
                <svg viewBox="0 0 50 30"><polyline points={l.map((row, r) => `${r * 10 + 5},${row * 10 + 5}`).join(' ')} /></svg>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
