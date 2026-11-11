import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmt, useApp, server, type Route } from '../../state/app';
import { sfx } from '../../audio/sfx';

/** Nombre qui s'anime vers sa nouvelle valeur. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setFlash(value > start ? 'up' : 'down');
    const t0 = performance.now();
    const dur = Math.min(900, 250 + Math.abs(value - start) / 20);
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else { from.current = value; setTimeout(() => setFlash(null), 300); }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <span className={`${className ?? ''} ${flash ? `flash-${flash}` : ''}`}>{fmt(shown)}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function TopBar() {
  const p = useApp((s) => s.profile)!;
  const daily = useApp((s) => s.daily);
  const go = useApp((s) => s.go);
  const route = useApp((s) => s.route);
  const pct = Math.round((p.levelXp / p.levelXpNext) * 100);
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go('lobby')} aria-label="Retour au lobby">
        <span className="brand-mark">MJ</span>
        <span className="brand-text">MEME<b>JACKPOT</b></span>
      </button>
      <nav className="top-nav">
        {NAV.map((n) => (
          <button key={n.route} className={route === n.route ? 'active' : ''} onClick={() => go(n.route)}>
            {n.label}{n.route === 'daily' && daily?.canClaim && <i className="dot" />}
          </button>
        ))}
      </nav>
      <div className="player-chip" onClick={() => go('profile')} role="button" tabIndex={0} aria-label="Profil et paramètres">
        <span className="avatar">{p.avatar}</span>
        <span className="pc-meta">
          <span className="pc-name">{p.name}</span>
          <span className="pc-level">Niv. {p.level}<span className="xpbar"><i style={{ width: `${pct}%` }} /></span></span>
        </span>
      </div>
      <div className="balance" title="Crédits fictifs — aucune valeur monétaire">
        <span className="coin">◈</span>
        <AnimatedNumber value={p.balance} />
      </div>
    </header>
  );
}

const NAV: { route: Route; label: string; icon: string }[] = [
  { route: 'lobby', label: 'Casino', icon: '🎰' },
  { route: 'cases', label: 'Caisses', icon: '📦' },
  { route: 'collection', label: 'Collection', icon: '🃏' },
  { route: 'daily', label: 'Bonus', icon: '🎁' },
  { route: 'profile', label: 'Profil', icon: '⚙️' },
];

export function BottomNav() {
  const route = useApp((s) => s.route);
  const go = useApp((s) => s.go);
  const daily = useApp((s) => s.daily);
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {NAV.map((n) => (
        <button key={n.route} className={route === n.route || (n.route === 'lobby' && (route === 'slots' || route === 'blackjack')) ? 'active' : ''} onClick={() => go(n.route)}>
          <span className="bn-icon">{n.icon}</span>
          <span>{n.label}</span>
          {n.route === 'daily' && daily?.canClaim && <i className="dot" />}
        </button>
      ))}
    </nav>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>{t.text}</div>
      ))}
    </div>
  );
}

export function AgeGate() {
  const setProfile = useApp((s) => s.setProfile);
  return (
    <div className="modal-backdrop solid">
      <div className="modal gate">
        <div className="gate-logo">MEME<b>JACKPOT</b></div>
        <h2>Avant de jouer</h2>
        <ul className="gate-list">
          <li><b>Casino simulé.</b> Les crédits ◈ et les cartes sont fictifs : ils ne s'achètent pas, ne se retirent pas et ne s'échangent contre aucune valeur réelle.</li>
          <li><b>Public adulte.</b> Ce jeu reproduit des mécaniques de casino ; il est destiné aux personnes de 18 ans et plus.</li>
          <li><b>Probabilités affichées.</b> Chaque jeu et chaque caisse publie ses règles et ses chances.</li>
          <li>Tu peux définir une limite de session et réduire les animations dans le Profil.</li>
        </ul>
        <button className="btn primary big" onClick={async () => { sfx.coin(); setProfile(await server.updateProfile({ ageConfirmed: true })); }}>
          J'ai 18 ans ou plus — Entrer
        </button>
        <p className="muted small">Si tu as moins de 18 ans, ferme cette page.</p>
      </div>
    </div>
  );
}

/** Rappel de limite de session volontaire. */
export function SessionReminder() {
  const p = useApp((s) => s.profile)!;
  const start = useApp((s) => s.sessionStart);
  const [shown, setShown] = useState(false);
  const [snoozeUntil, setSnooze] = useState(0);
  useEffect(() => {
    const lim = p.settings.sessionLimitMin;
    if (!lim) return;
    const id = setInterval(() => {
      if (Date.now() - start > lim * 60_000 && Date.now() > snoozeUntil) setShown(true);
    }, 5000);
    return () => clearInterval(id);
  }, [p.settings.sessionLimitMin, start, snoozeUntil]);
  if (!shown) return null;
  const mins = Math.round((Date.now() - start) / 60000);
  return (
    <Modal title="Petite pause ?" onClose={() => { setShown(false); setSnooze(Date.now() + 15 * 60_000); }}>
      <p>Tu joues depuis <b>{mins} minutes</b>, au-delà de la limite que tu t'es fixée.</p>
      <p className="muted">Ta progression est sauvegardée. Tu peux reprendre quand tu veux.</p>
      <div className="row gap">
        <button className="btn" onClick={() => { setShown(false); setSnooze(Date.now() + 15 * 60_000); }}>Encore 15 min</button>
        <button className="btn primary" onClick={() => { setShown(false); useApp.setState({ sessionStart: Date.now() }); }}>OK, je fais une pause</button>
      </div>
    </Modal>
  );
}
