import { useMemo, useState } from 'react';
import { CARDS, CARD_BY_ID, type CardDef } from '../../collection/cards';
import { RARITIES, RARITY_ORDER } from '../../collection/rarities';
import { CASES, caseCardOdds } from '../../collection/cases';
import { call, server, useApp } from '../../state/app';
import { MemeCard } from '../components/MemeCard';
import { Modal } from '../components/Shell';

type Sort = 'number' | 'rarity' | 'date' | 'name';
type Filter = 'all' | 'owned' | 'missing' | 'dupes' | 'favorites';

export function Collection() {
  const p = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const go = useApp((s) => s.go);
  const [sort, setSort] = useState<Sort>('number');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<CardDef | null>(null);

  const owned = Object.keys(p.collection).length;
  const total = Object.values(p.collection).reduce((s, o) => s + o.count, 0);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = CARDS.filter((c) => {
      const o = p.collection[c.id];
      if (filter === 'owned' && !o) return false;
      if (filter === 'missing' && o) return false;
      if (filter === 'dupes' && !(o && o.count > 1)) return false;
      if (filter === 'favorites' && !o?.favorite) return false;
      // On ne peut rechercher par nom que les cartes découvertes (le numéro reste cherchable).
      if (needle && !((o && c.name.toLowerCase().includes(needle)) || String(c.number) === needle)) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      if (sort === 'rarity') return RARITIES[b.rarity].rank - RARITIES[a.rarity].rank || a.number - b.number;
      if (sort === 'name') return a.name.localeCompare(b.name, 'fr');
      if (sort === 'date') return (p.collection[b.id]?.firstAt ?? 0) - (p.collection[a.id]?.firstAt ?? 0) || a.number - b.number;
      return a.number - b.number;
    });
    return arr;
  }, [p.collection, sort, filter, q]);

  const perRarity = RARITY_ORDER.map((r) => ({
    r, have: CARDS.filter((c) => c.rarity === r && p.collection[c.id]).length, all: CARDS.filter((c) => c.rarity === r).length,
  })).filter((x) => x.all > 0);

  const toggleFav = async (id: string) => {
    const np = await call(() => server.toggleFavorite(id));
    if (np) setProfile(np);
  };

  const d = detail ? p.collection[detail.id] : undefined;
  const odds = detail ? CASES.map((cs) => ({ cs, pct: caseCardOdds(cs, CARD_BY_ID).find((o) => o.card.id === detail.id)?.pct })).filter((x) => x.pct) : [];

  return (
    <div className="screen collection">
      <div className="game-head">
        <div>
          <h1 className="neon pink">Collection</h1>
          <p className="muted">Série 1 · Memes d'Internet & créations originales</p>
        </div>
        <button className="btn primary" onClick={() => go('cases')}>📦 Ouvrir des caisses</button>
      </div>

      <section className="coll-stats panel">
        <div className="cs-main">
          <span className="cs-big">{Math.round((owned / CARDS.length) * 100)}<small>%</small></span>
          <div>
            <b>{owned} / {CARDS.length}</b> cartes différentes
            <div className="progress"><i style={{ width: `${(owned / CARDS.length) * 100}%` }} /></div>
            <span className="muted small">{total} cartes au total · {total - owned} doublon(s)</span>
          </div>
        </div>
        <div className="cs-rar">
          {perRarity.map((x) => (
            <div key={x.r} style={{ ['--rc' as string]: RARITIES[x.r].color }}>
              <span className="rar-dot" />{RARITIES[x.r].label}<b>{x.have}/{x.all}</b>
            </div>
          ))}
        </div>
      </section>

      <div className="coll-toolbar">
        <input type="search" placeholder="Rechercher un meme ou un n°…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <div className="seg" role="group" aria-label="Filtrer">
          {([['all', 'Toutes'], ['owned', 'Possédées'], ['missing', 'Manquantes'], ['dupes', 'Doublons'], ['favorites', '★ Favoris']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier">
          <option value="number">Tri : numéro</option>
          <option value="rarity">Tri : rareté</option>
          <option value="date">Tri : date d'obtention</option>
          <option value="name">Tri : nom</option>
        </select>
      </div>

      <div className="card-grid">
        {list.map((c) => {
          const o = p.collection[c.id];
          return <MemeCard key={c.id} card={c} owned={!!o} count={o?.count} favorite={o?.favorite} onClick={() => setDetail(c)} />;
        })}
        {list.length === 0 && <p className="muted">Aucune carte ne correspond.</p>}
      </div>

      {detail && (
        <Modal title={d ? detail.name : `Carte n°${detail.number}`} onClose={() => setDetail(null)} wide>
          <div className="detail">
            <MemeCard card={detail} owned={!!d} size="lg" />
            <div className="detail-info">
              <p><span className="rar-tag" style={{ ['--rc' as string]: RARITIES[detail.rarity].color }}>{d ? RARITIES[detail.rarity].label : 'Rareté inconnue'}</span></p>
              {d ? (
                <>
                  <p>{detail.description}</p>
                  <dl className="stats">
                    <div><dt>Exemplaires</dt><dd>{d.count}</dd></div>
                    <div><dt>Obtenue le</dt><dd>{new Date(d.firstAt).toLocaleDateString('fr-FR')}</dd></div>
                    <div><dt>Catégorie</dt><dd>{detail.category}</dd></div>
                    <div><dt>Type</dt><dd>{detail.original ? 'Meme original' : 'Meme Internet'}</dd></div>
                  </dl>
                  <button className="btn" onClick={() => toggleFav(detail.id)}>{d.favorite ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>
                </>
              ) : <p className="muted">Pas encore découverte.</p>}
              <h4>Où l'obtenir</h4>
              <ul className="rules">
                {odds.map(({ cs, pct }) => <li key={cs.id}>{cs.name} : {pct!.toFixed(2)} % par ouverture</li>)}
              </ul>
              <p className="muted small">Variantes holographique, Golden, Glitched et 1/1 : Phase 2. Illustration temporaire, remplaçable par un asset licencié.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
