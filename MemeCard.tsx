import { useRef, type CSSProperties, type PointerEvent } from 'react';
import type { CardDef } from '../../collection/cards';
import { RARITIES } from '../../collection/rarities';
import { reducedMotion } from '../../state/app';

interface Props {
  card: CardDef;
  owned?: boolean;
  count?: number;
  favorite?: boolean;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onClick?: () => void;
}

/**
 * Carte meme avec effets par rareté (bordure, reflet holographique qui suit
 * le pointeur, inclinaison 3D). Les cartes non possédées s'affichent en silhouette.
 */
export function MemeCard({ card, owned = true, count, favorite, size = 'md', interactive = true, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const r = RARITIES[card.rarity];

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || !owned || reducedMotion()) return;
    const el = ref.current!;
    const b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width;
    const py = (e.clientY - b.top) / b.height;
    el.style.setProperty('--rx', `${(0.5 - py) * 18}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const style = {
    '--rc': r.color,
    '--a1': card.art.bg[0],
    '--a2': card.art.bg[1],
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`meme-card ${size} r-${card.rarity} ${owned ? '' : 'missing'} ${onClick ? 'clickable' : ''}`}
      style={style}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      aria-label={owned ? `${card.name}, ${r.label}` : `Carte n°${card.number} non obtenue`}
    >
      <div className="mc-inner">
        <div className="mc-top">
          <span className="mc-num">#{String(card.number).padStart(3, '0')}</span>
          <span className="mc-rarity">{owned ? r.label : '???'}</span>
        </div>
        <div className="mc-art">
          {owned && card.art.image ? <img src={card.art.image} alt="" /> : <span className="mc-emoji">{owned ? card.art.emoji : '❔'}</span>}
        </div>
        <div className="mc-name">{owned ? card.name : '???'}</div>
        {size !== 'sm' && <div className="mc-desc">{owned ? card.description : 'Carte encore inconnue. Ouvre des caisses pour la découvrir.'}</div>}
        <div className="mc-foot">
          <span>{owned ? card.category : ''}</span>
          {owned && card.original && size !== 'sm' && <span className="mc-orig">Original</span>}
        </div>
        <div className="mc-holo" />
        <div className="mc-glare" />
      </div>
      {count !== undefined && count > 1 && <span className="mc-count">×{count}</span>}
      {favorite && <span className="mc-fav">★</span>}
    </div>
  );
}
