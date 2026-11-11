import { useEffect, useState } from 'react';
import { ECONOMY } from '../../config/economy';
import { call, fmt, newKey, server, useApp } from '../../state/app';
import { sfx } from '../../audio/sfx';
import { fireConfetti } from '../components/Confetti';

const dayCredits = (d: number) => ECONOMY.daily.baseCredits + ECONOMY.daily.streakBonus[d - 1] + (d === 7 ? ECONOMY.daily.day7BonusCredits : 0);

function countdown(ms: number) {
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export function Daily() {
  const daily = useApp((s) => s.daily);
  const p = useApp((s) => s.profile)!;
  const refresh = useApp((s) => s.refresh);
  const setProfile = useApp((s) => s.setProfile);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const [claimedAt] = useState(() => Date.now());

  useEffect(() => { void refresh(); const id = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(id); }, [refresh]);
  if (!daily) return null;

  const claim = async () => {
    setBusy(true);
    const r = await call(() => server.claimDaily(newKey()));
    if (r) {
      setProfile(r.profile);
      sfx.win(r.day === 7);
      fireConfetti(r.day === 7 ? 260 : 120, ['#3ee07a', '#ffd23f', '#2ef2ff']);
      toast(`+${fmt(r.credits)} ◈ et +${r.xp} XP — jour ${r.day}`, 'win');
      await refresh();
    }
    setBusy(false);
  };

  const rescue = async () => {
    setBusy(true);
    const np = await call(() => server.claimRescue(newKey()));
    if (np) { setProfile(np); sfx.coin(); toast(`Coup de pouce : +${fmt(ECONOMY.rescue.credits)} ◈`, 'win'); await refresh(); }
    setBusy(false);
  };

  const remaining = Math.max(0, daily.msUntilNext - (Date.now() - claimedAt));
  const claimedThrough = daily.canClaim ? daily.nextDay - 1 : daily.streak;

  return (
    <div className="screen daily">
      <div className="game-head">
        <div>
          <h1 className="neon green">Bonus quotidien</h1>
          <p className="muted">Reviens chaque jour : la série monte jusqu'au gros bonus du 7e jour. Rater un jour la remet à zéro, sans rien te retirer.</p>
        </div>
      </div>

      <div className="calendar">
        {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => {
          const done = d <= claimedThrough;
          const today = daily.canClaim && d === daily.nextDay;
          return (
            <div key={d} className={`cal-day ${done ? 'done' : ''} ${today ? 'today' : ''} ${d === 7 ? 'big' : ''}`}>
              <span className="cal-label">Jour {d}</span>
              <span className="cal-icon">{d === 7 ? '💰' : done ? '✅' : '🎁'}</span>
              <span className="cal-amount">{fmt(dayCredits(d))} ◈</span>
              <span className="cal-xp">+{ECONOMY.daily.loginXp} XP</span>
            </div>
          );
        })}
      </div>

      <div className="panel daily-cta">
        {daily.clockTamper ? (
          <p className="warn">L'horloge de ton appareil semble avoir reculé. Le bonus se débloquera quand l'heure sera de nouveau correcte.</p>
        ) : daily.canClaim ? (
          <button className="btn primary big pulse" onClick={claim} disabled={busy}>Récupérer {fmt(dayCredits(daily.nextDay))} ◈ — Jour {daily.nextDay}</button>
        ) : (
          <p>Bonus récupéré ✔ · prochain dans <b>{countdown(remaining)}</b> <span className="muted small">(minuit UTC)</span></p>
        )}
      </div>

      <div className="panel">
        <h3>Coup de pouce</h3>
        <p className="muted">Plus de crédits ? Si ton solde passe sous {fmt(ECONOMY.rescue.threshold)} ◈, récupère {fmt(ECONOMY.rescue.credits)} ◈ gratuits toutes les {ECONOMY.rescue.cooldownMs / 3_600_000} h — sans publicité.</p>
        {daily.rescueAvailable ? (
          <button className="btn primary" onClick={rescue} disabled={busy}>Récupérer {fmt(ECONOMY.rescue.credits)} ◈</button>
        ) : p.balance >= ECONOMY.rescue.threshold ? (
          <p className="small muted">Disponible seulement quand ton solde est bas (actuel : {fmt(p.balance)} ◈).</p>
        ) : (
          <p className="small muted">Prochain coup de pouce dans {countdown(daily.rescueMsLeft)}.</p>
        )}
      </div>
      <p className="muted small center">Les crédits ◈ sont fictifs : aucune valeur, aucun retrait, aucun échange.</p>
    </div>
  );
}
