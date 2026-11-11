import { useEffect, useState } from 'react';
import type { BjAction, Card } from '../../games/blackjack/engine';
import type { BlackjackView } from '../../server/types';
import { call, fmt, newKey, server, useApp } from '../../state/app';
import { sfx } from '../../audio/sfx';
import { fireConfetti } from '../components/Confetti';

const CHIPS = [10, 25, 50, 100, 500, 1000];
const RESULT_LABEL = { blackjack: 'BLACKJACK !', win: 'Gagné', push: 'Égalité', lose: 'Perdu', bust: 'Sauté' } as const;

function PlayingCard({ card, index, hidden }: { card: Card | null; index: number; hidden?: boolean }) {
  const red = card && (card.suit === '♥' || card.suit === '♦');
  return (
    <div className={`pcard ${hidden || !card ? 'back' : ''} ${red ? 'red' : ''}`} style={{ animationDelay: `${index * 0.12}s` }}>
      {card && !hidden ? (
        <>
          <span className="pc-corner">{card.rank}<br />{card.suit}</span>
          <span className="pc-center">{card.suit}</span>
          <span className="pc-corner br">{card.rank}<br />{card.suit}</span>
        </>
      ) : <span className="pc-back-logo">MJ</span>}
    </div>
  );
}

export function Blackjack() {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(50);
  const [view, setView] = useState<BlackjackView | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);

  useEffect(() => { void server.bjCurrent().then((v) => v && setView(v)); }, []);

  const playing = view?.phase === 'player';

  const apply = (v: BlackjackView) => {
    const prevCards = (view?.dealer.length ?? 0) + (view?.hands.reduce((s, h) => s + h.cards.length, 0) ?? 0);
    const nowCards = v.dealer.length + v.hands.reduce((s, h) => s + h.cards.length, 0);
    for (let i = 0; i < Math.max(1, nowCards - prevCards); i++) setTimeout(() => sfx.card(), i * 120);
    setView(v);
    if (v.phase === 'done') {
      // Le solde est mis à jour après l'animation de révélation.
      setProfile({ ...v.profile, balance: v.profile.balance - v.hands.reduce((s, h) => s + (h.payout ?? 0), 0) });
      setTimeout(() => {
        setProfile(v.profile);
        const net = v.netResult ?? 0;
        if (v.hands.some((h) => h.result === 'blackjack')) { sfx.win(true); fireConfetti(120); }
        else if (net > 0) sfx.win();
        else if (net < 0) sfx.lose();
      }, 650);
    } else setProfile(v.profile);
  };

  const deal = async () => {
    const amount = bet || lastBet;
    if (busy || amount <= 0) return;
    setBusy(true);
    const v = await call(() => server.bjDeal(amount, newKey()));
    if (v) { setLastBet(amount); setBet(0); apply(v); }
    setBusy(false);
  };

  const act = async (a: BjAction) => {
    if (!view || busy) return;
    setBusy(true);
    const v = await call(() => server.bjAction(view.roundId, a, newKey()));
    if (v) apply(v);
    setBusy(false);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!playing || !view) return;
      const map: Record<string, BjAction> = { h: 'hit', s: 'stand', d: 'double', p: 'split' };
      const a = map[e.key.toLowerCase()];
      if (a && view.actions[a]) void act(a);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const addChip = (c: number) => {
    if (playing) return;
    if (bet + c > Math.min(5000, profile.balance)) return;
    sfx.chip();
    setBet(bet + c);
  };

  const activeBet = view?.hands[view.active]?.bet ?? 0;
  const canExtra = profile.balance >= activeBet;

  return (
    <div className="screen blackjack">
      <div className="game-head">
        <div>
          <h1 className="neon green">Blackjack</h1>
          <p className="muted">6 jeux · Croupier reste sur 17 · Blackjack payé 3:2</p>
        </div>
        <button className="btn ghost" onClick={() => setRules(!rules)}>📜 {rules ? 'Masquer' : 'Règles'}</button>
      </div>

      {rules && (
        <div className="panel rules-panel">
          <ul className="rules">
            <li>But : approcher 21 sans dépasser et battre la main du croupier.</li>
            <li>Figures = 10, As = 1 ou 11 (calculé automatiquement au mieux).</li>
            <li><b>Tirer</b> (H) : prendre une carte · <b>Rester</b> (S) : garder sa main.</li>
            <li><b>Doubler</b> (D) : doubler la mise sur 2 cartes, recevoir une seule carte.</li>
            <li><b>Séparer</b> (P) : une paire de même valeur devient deux mains (mise égale), jusqu'à 4 mains. As séparés : une carte chacun.</li>
            <li>Le croupier tire jusqu'à 16 et reste à partir de 17 (y compris 17 souple). Avec un As ou un 10 visible, il vérifie son blackjack.</li>
            <li>Gains : victoire 1:1, blackjack naturel 3:2, égalité = mise rendue. Un 21 après séparation n'est pas un blackjack.</li>
            <li>Sabot de 6 jeux, mélangé par le serveur et remélangé sous 78 cartes. Mise de 10 à 5 000 ◈.</li>
          </ul>
        </div>
      )}

      <div className="felt">
        <div className="felt-arc">BLACKJACK PAIE 3 CONTRE 2 · LE CROUPIER RESTE SUR 17</div>
        <div className="bj-zone dealer">
          <span className="zone-label">Croupier {view && <b className="total">{view.dealerTotal}{view.phase === 'player' ? ' + ?' : ''}</b>}</span>
          <div className="pcards">
            {view ? view.dealer.map((c, i) => <PlayingCard key={`${view.roundId}-d${i}-${c ? 'up' : 'down'}`} card={c} index={i} hidden={!c} />)
              : <><div className="pcard ghost" /><div className="pcard ghost" /></>}
          </div>
        </div>

        <div className="bj-zone player">
          <div className="hands">
            {view ? view.hands.map((h, hi) => (
              <div key={hi} className={`hand ${playing && hi === view.active ? 'active' : ''} ${h.result ?? ''}`}>
                <div className="pcards">{h.cards.map((c, i) => <PlayingCard key={`${view.roundId}-${hi}-${i}`} card={c} index={i} />)}</div>
                <div className="hand-info">
                  <b className="total">{h.total}{h.soft && h.total < 21 ? ' souple' : ''}</b>
                  <span className="muted">mise {fmt(h.bet)}{h.doubled ? ' (doublée)' : ''}</span>
                </div>
                {h.result && <div className={`hand-result ${h.result}`}>{RESULT_LABEL[h.result]}{h.payout ? ` +${fmt(h.payout)}` : ''}</div>}
              </div>
            )) : <div className="hand"><div className="pcards"><div className="pcard ghost" /><div className="pcard ghost" /></div></div>}
          </div>
        </div>

        {view?.phase === 'done' && view.netResult !== undefined && (
          <div className={`bj-banner ${view.netResult > 0 ? 'win' : view.netResult < 0 ? 'lose' : 'push'}`}>
            {view.netResult > 0 ? `+${fmt(view.netResult)} ◈` : view.netResult < 0 ? `${fmt(view.netResult)} ◈` : 'Égalité'}
          </div>
        )}
      </div>

      {playing && view ? (
        <div className="bj-actions">
          <button className="btn act" disabled={busy || !view.actions.hit} onClick={() => act('hit')}>Tirer <kbd>H</kbd></button>
          <button className="btn act" disabled={busy || !view.actions.stand} onClick={() => act('stand')}>Rester <kbd>S</kbd></button>
          <button className="btn act" disabled={busy || !view.actions.double || !canExtra} onClick={() => act('double')} title={!canExtra ? 'Crédits insuffisants' : ''}>Doubler <kbd>D</kbd></button>
          <button className="btn act" disabled={busy || !view.actions.split || !canExtra} onClick={() => act('split')} title={!canExtra ? 'Crédits insuffisants' : ''}>Séparer <kbd>P</kbd></button>
        </div>
      ) : (
        <div className="bj-betting">
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c} className={`casino-chip c${c}`} onClick={() => addChip(c)} disabled={bet + c > Math.min(5000, profile.balance)} aria-label={`Ajouter ${c}`}>
                {c >= 1000 ? `${c / 1000}K` : c}
              </button>
            ))}
          </div>
          <div className="row gap center wrap">
            <span className="bet-amount">Mise : <b>{fmt(bet || lastBet)}</b> ◈</span>
            <button className="btn" onClick={() => setBet(0)} disabled={!bet}>Effacer</button>
            <button className="btn primary big" onClick={deal} disabled={busy || (bet || lastBet) > profile.balance || (bet || lastBet) < 10}>
              {view ? 'Rejouer' : 'Distribuer'}
            </button>
          </div>
          {!bet && <p className="muted small center">Clique sur les jetons pour composer ta mise (sinon : dernière mise).</p>}
        </div>
      )}
    </div>
  );
}
