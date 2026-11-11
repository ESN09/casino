import { useEffect, useState } from 'react';
import type { Transaction } from '../../server/types';
import { call, fmt, server, useApp } from '../../state/app';
import { sfx } from '../../audio/sfx';
import { Modal } from '../components/Shell';

/** Dans un cadre intégré (aperçu hébergé), les téléchargements sont bloqués : on garde seulement la copie. */
const EMBEDDED = (() => { try { return window.self !== window.top; } catch { return true; } })();

const AVATARS = ['😎', '🐸', '🐕', '🦆', '🤖', '👽', '🐱', '🦊', '🐼', '🧠', '🔥', '💎'];
const TX_LABEL: Record<Transaction['type'], string> = {
  starting: 'Crédits de départ', daily: 'Bonus quotidien', rescue: 'Coup de pouce', slot_bet: 'Mise slot', slot_win: 'Gain slot',
  bj_bet: 'Mise blackjack', bj_win: 'Gain blackjack', case_buy: 'Ouverture de caisse',
};

export function Settings() {
  const p = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const toast = useApp((s) => s.toast);
  const refresh = useApp((s) => s.refresh);
  const [name, setName] = useState(p.name);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [legal, setLegal] = useState(false);

  useEffect(() => { void server.transactions().then(setTxs); }, [p.balance]);

  const update = async (patch: Parameters<typeof server.updateProfile>[0]) => {
    const np = await call(() => server.updateProfile(patch));
    if (np) { setProfile(np); sfx.click(); }
    return np;
  };

  const exportData = async () => {
    const json = await server.exportData();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `memejackpot-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyData = async () => {
    try { await navigator.clipboard.writeText(await server.exportData()); toast('Données copiées dans le presse-papiers'); }
    catch { toast('Copie refusée par le navigateur', 'error'); }
  };

  return (
    <div className="screen settings">
      <div className="game-head"><div><h1 className="neon">Profil & paramètres</h1><p className="muted">Mode invité · sauvegarde locale sur cet appareil</p></div></div>

      <div className="settings-grid">
        <section className="panel">
          <h3>Profil</h3>
          <label className="field">Pseudo
            <div className="row gap">
              <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
              <button className="btn" disabled={name.trim() === p.name} onClick={async () => { if (await update({ name })) toast('Pseudo mis à jour'); }}>Enregistrer</button>
            </div>
          </label>
          <div className="field">Avatar
            <div className="avatar-grid">
              {AVATARS.map((a) => <button key={a} className={p.avatar === a ? 'active' : ''} onClick={() => update({ avatar: a })} aria-label={`Avatar ${a}`}>{a}</button>)}
            </div>
          </div>
          <dl className="stats">
            <div><dt>Niveau</dt><dd>{p.level}</dd></div>
            <div><dt>XP totale</dt><dd>{fmt(p.xp)}</dd></div>
            <div><dt>Total misé</dt><dd>{fmt(p.stats.totalWagered)} ◈</dd></div>
            <div><dt>Total gagné</dt><dd>{fmt(p.stats.totalWon)} ◈</dd></div>
          </dl>
          <p className="muted small">Comptes, connexion et synchronisation cloud : Phase 5 (Supabase).</p>
        </section>

        <section className="panel">
          <h3>Confort & protection du joueur</h3>
          <label className="toggle"><input type="checkbox" checked={p.settings.sound} onChange={(e) => update({ settings: { sound: e.target.checked } })} /><span />Sons</label>
          <label className="toggle"><input type="checkbox" checked={p.settings.reducedMotion} onChange={(e) => update({ settings: { reducedMotion: e.target.checked } })} /><span />Réduire les animations</label>
          <label className="field">Limite de session volontaire
            <select value={p.settings.sessionLimitMin} onChange={(e) => update({ settings: { sessionLimitMin: Number(e.target.value) } })}>
              <option value={0}>Aucune</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 heure</option>
              <option value={120}>2 heures</option>
            </select>
          </label>
          <p className="muted small">Un rappel s'affiche quand la durée est dépassée.</p>
          <hr />
          <h3>Données</h3>
          <div className="row gap wrap">
            {!EMBEDDED && <button className="btn" onClick={exportData}>⬇️ Exporter (JSON)</button>}
            <button className="btn" onClick={copyData}>📋 Copier mes données</button>
            <button className="btn danger" onClick={() => setConfirmReset(true)}>Supprimer ma sauvegarde</button>
          </div>
          <button className="link" onClick={() => setLegal(true)}>Mentions, crédits fictifs & confidentialité</button>
        </section>

        <section className="panel tx-panel">
          <h3>Registre des transactions</h3>
          <ul className="tx-list">
            {txs.slice(0, 40).map((t) => (
              <li key={t.id}>
                <span>{TX_LABEL[t.type]}</span>
                <b className={t.amount >= 0 ? 'pos' : 'neg'}>{t.amount >= 0 ? '+' : ''}{fmt(t.amount)}</b>
                <span className="muted small">{fmt(t.balanceAfter)} ◈ · {new Date(t.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {confirmReset && (
        <Modal title="Supprimer la sauvegarde ?" onClose={() => setConfirmReset(false)}>
          <p>Ta collection, ton solde et ta progression seront effacés de cet appareil. Action irréversible.</p>
          <div className="row gap">
            <button className="btn" onClick={() => setConfirmReset(false)}>Annuler</button>
            <button className="btn danger" onClick={async () => { const np = await server.resetAll(); setProfile(np); await refresh(); setName(np.name); setConfirmReset(false); toast('Sauvegarde supprimée'); }}>Supprimer</button>
          </div>
        </Modal>
      )}
      {legal && (
        <Modal title="Mentions & confidentialité" onClose={() => setLegal(false)} wide>
          <h4>Crédits fictifs</h4>
          <p>MEME JACKPOT est un casino simulé. Les crédits ◈ et les cartes n'ont aucune valeur monétaire : ils ne peuvent être ni achetés, ni retirés, ni vendus, ni transférés, ni convertis en cryptomonnaie ou en biens réels. Il n'existe aucun marché d'échange.</p>
          <h4>Probabilités</h4>
          <p>Chaque jeu publie ses règles et chaque caisse ses probabilités exactes avant ouverture. Les résultats ne dépendent ni des publicités, ni des cartes possédées.</p>
          <h4>Données (mode invité)</h4>
          <p>En mode invité, toutes les données restent sur cet appareil (stockage local du navigateur). Aucun envoi réseau, aucun traceur publicitaire. Tu peux les exporter ou les supprimer ici à tout moment.</p>
          <h4>Memes & illustrations</h4>
          <p>Les noms de memes connus appartiennent à leurs créateurs respectifs. Les illustrations actuelles sont des placeholders originaux ; aucune image protégée n'est utilisée.</p>
          <p className="muted small">Version de démonstration — les CGU et la politique de confidentialité définitives seront rédigées avant publication.</p>
        </Modal>
      )}
    </div>
  );
}
