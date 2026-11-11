import { CARDS, CARD_BY_ID } from '../../collection/cards';
import { CASES } from '../../collection/cases';
import { MEME_MACHINE } from '../../games/slots/engine';
import { fmt, useApp, type Route } from '../../state/app';
import { MemeCard } from '../components/MemeCard';

interface Tile { title: string; sub: string; emoji: string; from: string; to: string; route?: Route; badge?: string }

const TILES: Tile[] = [
  { title: 'Meme Machine', sub: MEME_MACHINE.tagline, emoji: '🎰', from: '#5b2bff', to: '#ff2fa0', route: 'slots', badge: 'HOT' },
  { title: 'Blackjack', sub: 'Contre le croupier · BJ payé 3:2', emoji: '🂡', from: '#0a7d55', to: '#13c08a', route: 'blackjack' },
  { title: 'Caisses Memes', sub: 'Ouvre, collectionne, frime', emoji: '📦', from: '#ff7a1a', to: '#ff2f6d', route: 'cases', badge: 'NEW' },
  { title: 'Roulette', sub: 'Phase 3', emoji: '🎡', from: '#3a2f55', to: '#4a3f6a' },
  { title: 'Texas Hold\'em', sub: 'Phase 3', emoji: '♠️', from: '#2f3a55', to: '#3f4a6a' },
  { title: 'Mines', sub: 'Phase 3', emoji: '💣', from: '#2f4a4a', to: '#3f5a5a' },
  { title: 'Plinko', sub: 'Phase 3', emoji: '🔻', from: '#4a2f4a', to: '#5a3f5a' },
  { title: 'MEME DECK', sub: 'Mode stratégique · Phase 4', emoji: '🧠', from: '#4a3a2f', to: '#5a4a3f' },
];

export function Lobby() {
  const p = useApp((s) => s.profile)!;
  const daily = useApp((s) => s.daily);
  const go = useApp((s) => s.go);
  const owned = Object.keys(p.collection).length;
  const recent = Object.values(p.collection).sort((a, b) => b.lastAt - a.lastAt).slice(0, 4);

  return (
    <div className="screen lobby">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Casino virtuel · Crédits fictifs</p>
          <h1>Salut {p.name} <span className="wave">👋</span></h1>
          <p className="muted">Fais tourner les rouleaux, bats le croupier et complète ta collection de memes.</p>
          <div className="row gap wrap">
            {daily?.canClaim ? (
              <button className="btn primary big pulse" onClick={() => go('daily')}>🎁 Récupérer le bonus du jour</button>
            ) : (
              <button className="btn big" onClick={() => go('daily')}>🎁 Calendrier de connexion</button>
            )}
            <button className="btn ghost big" onClick={() => go('cases')}>📦 Ouvrir une caisse · {fmt(CASES[0].price)} ◈</button>
          </div>
        </div>
        <div className="hero-cards" aria-hidden>
          {['doge', 'stonks', 'debug-duck'].map((id, i) => (
            <div key={id} className={`hero-card hc${i}`}><MemeCard card={CARD_BY_ID[id]} size="sm" interactive={false} /></div>
          ))}
        </div>
      </section>

      <h2 className="section-title">Jeux</h2>
      <section className="tiles">
        {TILES.map((t) => (
          <button
            key={t.title}
            className={`tile ${t.route ? '' : 'locked'}`}
            style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
            onClick={() => t.route && go(t.route)}
            disabled={!t.route}
            aria-label={t.route ? t.title : `${t.title} — bientôt disponible`}
          >
            {t.badge && <span className="tile-badge">{t.badge}</span>}
            {!t.route && <span className="tile-badge soon">BIENTÔT</span>}
            <span className="tile-emoji">{t.emoji}</span>
            <span className="tile-title">{t.title}</span>
            <span className="tile-sub">{t.sub}</span>
          </button>
        ))}
      </section>

      <section className="lobby-panels">
        <div className="panel">
          <div className="panel-head">
            <h3>Collection</h3>
            <button className="link" onClick={() => go('collection')}>Voir tout →</button>
          </div>
          <div className="progress big"><i style={{ width: `${(owned / CARDS.length) * 100}%` }} /></div>
          <p className="muted">{owned} / {CARDS.length} cartes découvertes · {Math.round((owned / CARDS.length) * 100)} %</p>
          <div className="mini-row">
            {recent.length === 0 && <p className="muted small">Aucune carte pour l'instant. Ouvre ta première caisse !</p>}
            {recent.map((o) => <MemeCard key={o.cardId} card={CARD_BY_ID[o.cardId]} size="sm" count={o.count} />)}
          </div>
        </div>
        <div className="panel">
          <h3>Statistiques</h3>
          <dl className="stats">
            <div><dt>Tours de slot</dt><dd>{fmt(p.stats.spins)}</dd></div>
            <div><dt>Mains de blackjack</dt><dd>{fmt(p.stats.bjHands)}</dd></div>
            <div><dt>Caisses ouvertes</dt><dd>{fmt(p.stats.casesOpened)}</dd></div>
            <div><dt>Plus gros gain</dt><dd>{fmt(p.stats.biggestWin)} ◈</dd></div>
          </dl>
        </div>
        <div className="panel soon-panel">
          <h3>À venir</h3>
          <ul className="soon-list">
            <li><span>🏆</span>Défis quotidiens & hebdo</li>
            <li><span>🎃</span>Événements saisonniers</li>
            <li><span>📊</span>Classements</li>
          </ul>
          <p className="muted small">Ces modules arrivent dans les prochaines phases.</p>
        </div>
      </section>
    </div>
  );
}
