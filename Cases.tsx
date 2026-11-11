import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CARD_BY_ID, type CardDef } from '../../collection/cards';
import { CASES, caseCardOdds, type CaseDef } from '../../collection/cases';
import { RARITIES, RARITY_ORDER, type RarityId } from '../../collection/rarities';
import type { CaseHistoryEntry, CaseOpenResult } from '../../server/types';
import { call, fmt, newKey, reducedMotion, server, useApp } from '../../state/app';
import { sfx } from '../../audio/sfx';
import { fireConfetti } from '../components/Confetti';
import { MemeCard } from '../components/MemeCard';

const ITEM_W = 132; // largeur d'une carte du ruban + marge (px), synchronisée avec le CSS
const STRIP_LEN = 64;
const WIN_INDEX = 56;

/** Ruban cosmétique pondéré par rareté. Le résultat réel est déjà connu. */
function buildStrip(def: CaseDef, winner: string): CardDef[] {
  const odds = caseCardOdds(def, CARD_BY_ID);
  const pick = () => {
    let r = Math.random() * 100;
    for (const o of odds) { r -= o.pct; if (r < 0) return o.card; }
    return odds[0].card;
  };
  const list = Array.from({ length: STRIP_LEN }, pick);
  list[WIN_INDEX] = CARD_BY_ID[winner];
  return list;
}

function Opening({ def, result, onDone }: { def: CaseDef; result: CaseOpenResult; onDone: () => void }) {
  const [strip] = useState(() => buildStrip(def, result.cardId));
  const trackRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current!;
    const view = viewRef.current!;
    const center = view.clientWidth / 2;
    const jitter = (Math.random() - 0.5) * (ITEM_W * 0.6); // cosmétique : où la flèche s'arrête sur la carte
    const target = -(WIN_INDEX * ITEM_W + ITEM_W / 2 - center + jitter);
    const rm = reducedMotion();
    const anim = track.animate(
      [{ transform: 'translateX(0px)' }, { transform: `translateX(${target}px)` }],
      { duration: rm ? 600 : 6200, easing: 'cubic-bezier(.08,.72,.12,1)', fill: 'forwards' },
    );
    animRef.current = anim;
    let lastIdx = -1;
    let raf = 0;
    const tick = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
      const idx = Math.floor((center - m.m41) / ITEM_W);
      if (idx !== lastIdx) { lastIdx = idx; sfx.tick(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    anim.onfinish = () => { cancelAnimationFrame(raf); onDone(); };
    return () => { cancelAnimationFrame(raf); anim.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="opening">
      <div className="opening-case" style={{ background: `linear-gradient(135deg, ${def.theme[0]}, ${def.theme[1]})` }}>{def.emoji}</div>
      <div className="strip-view" ref={viewRef}>
        <div className="strip-marker" />
        <div className="strip-track" ref={trackRef}>
          {strip.map((c, i) => (
            <div key={i} className={`strip-item r-${c.rarity}`} style={{ ['--rc' as string]: RARITIES[c.rarity].color }}>
              <span className="si-emoji">{c.art.emoji}</span>
              <span className="si-name">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="btn ghost" onClick={() => animRef.current?.finish()}>⏩ Passer l'animation</button>
    </div>
  );
}

function Reveal({ result, onClose, onAgain, canAgain }: { result: CaseOpenResult; onClose: () => void; onAgain: () => void; canAgain: boolean }) {
  const card = CARD_BY_ID[result.cardId];
  const r = RARITIES[card.rarity];
  useEffect(() => {
    sfx.reveal(r.rank);
    if (r.rank >= 2) fireConfetti(r.rank >= 4 ? 300 : 160, [r.color, '#ffffff', '#ffd23f']);
  }, [r]);
  return (
    <div className={`reveal rr-${card.rarity}`} style={{ ['--rc' as string]: r.color }}>
      <div className="reveal-burst" aria-hidden />
      <p className="reveal-rarity">{r.label}</p>
      <div className="reveal-card"><MemeCard card={card} size="lg" /></div>
      {result.isNew ? <p className="reveal-new">✨ NOUVELLE CARTE ajoutée à ta collection</p> : <p className="muted">Doublon ajouté à ta collection</p>}
      <div className="row gap center">
        <button className="btn" onClick={onClose}>Retour</button>
        <button className="btn primary" onClick={onAgain} disabled={!canAgain}>Rouvrir · {fmt(CASES.find((c) => c.id === result.caseId)!.price)} ◈</button>
      </div>
    </div>
  );
}

export function Cases() {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const [selected] = useState<CaseDef>(CASES[0]);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'reveal'>('idle');
  const [result, setResult] = useState<CaseOpenResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CaseHistoryEntry[]>([]);

  useEffect(() => { void server.caseHistory().then(setHistory); }, [phase]);

  const open = async () => {
    if (busy || profile.balance < selected.price) return;
    setBusy(true);
    sfx.coin();
    const res = await call(() => server.openCase(selected.id, newKey()));
    setBusy(false);
    if (!res) return;
    // Tirage déjà effectué et enregistré : on retire la carte de l'affichage jusqu'à la révélation.
    const shownCollection = { ...res.profile.collection };
    if (res.isNew) delete shownCollection[res.cardId];
    else shownCollection[res.cardId] = { ...shownCollection[res.cardId], count: shownCollection[res.cardId].count - 1 };
    setProfile({ ...res.profile, collection: shownCollection });
    setResult(res);
    setPhase('opening');
  };

  const finishOpening = () => {
    setPhase('reveal');
    void server.getProfile().then(setProfile);
  };

  const odds = caseCardOdds(selected, CARD_BY_ID);
  const byRarity = RARITY_ORDER.filter((r) => selected.rarityPct[r]).map((r) => ({ r: r as RarityId, pct: selected.rarityPct[r]!, cards: odds.filter((o) => o.card.rarity === r) }));

  return (
    <div className="screen cases">
      <div className="game-head">
        <div>
          <h1 className="neon orange">Caisses Memes</h1>
          <p className="muted">Le tirage est effectué et enregistré par le serveur avant l'animation.</p>
        </div>
      </div>

      {phase === 'idle' && (
        <div className="case-layout">
          <div className="case-hero panel">
            <div className="case-box" style={{ background: `linear-gradient(135deg, ${selected.theme[0]}, ${selected.theme[1]})` }}>
              <span>{selected.emoji}</span>
            </div>
            <h2>{selected.name}</h2>
            <p className="muted">Cartes communes, peu communes et rares · {selected.pool.length} cartes possibles</p>
            <button className="btn primary big" onClick={open} disabled={busy || profile.balance < selected.price}>
              Ouvrir · {fmt(selected.price)} ◈
            </button>
            {profile.balance < selected.price && <p className="warn">Crédits insuffisants.</p>}
            <p className="muted small">D'autres caisses (Viral, Legendary, Brainrot, Mythic) et les ouvertures ×5 / ×10 arrivent en Phase 2.</p>
          </div>

          <div className="panel odds">
            <h3>Probabilités exactes <span className="muted small">(table v{selected.oddsVersion})</span></h3>
            {byRarity.map(({ r, pct, cards }) => (
              <div key={r} className="odds-group" style={{ ['--rc' as string]: RARITIES[r].color }}>
                <div className="odds-head"><span className="rar-dot" />{RARITIES[r].label}<b>{pct} %</b></div>
                <div className="odds-cards">
                  {cards.map((o) => (
                    <div key={o.card.id} className="odds-card">
                      <span>{o.card.art.emoji}</span>
                      <span className="oc-name">{o.card.name}{profile.collection[o.card.id] && <i className="owned-tick" title="Déjà obtenue"> ✓</i>}</span>
                      <span className="oc-pct">{o.pct.toFixed(2)} %</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="panel history">
            <h3>Historique des ouvertures</h3>
            {history.length === 0 && <p className="muted small">Aucune ouverture pour l'instant.</p>}
            <ul>
              {history.slice(0, 12).map((h) => {
                const c = CARD_BY_ID[h.cardId];
                return (
                  <li key={h.openId} style={{ ['--rc' as string]: RARITIES[c.rarity].color }}>
                    <span>{c.art.emoji}</span><b>{c.name}</b><span className="rar-tag">{RARITIES[c.rarity].label}</span>
                    <time>{new Date(h.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {phase === 'opening' && result && <Opening def={selected} result={result} onDone={finishOpening} />}
      {phase === 'reveal' && result && (
        <Reveal
          result={result}
          onClose={() => setPhase('idle')}
          onAgain={() => { setPhase('idle'); void open(); }}
          canAgain={profile.balance >= selected.price}
        />
      )}
    </div>
  );
}
