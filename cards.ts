import type { RarityId } from './rarities';

/**
 * Fiches de cartes.
 *
 * ILLUSTRATIONS : placeholders originaux (emoji + dégradé). Aucune image de meme
 * n'est récupérée. Pour remplacer une illustration par un asset licencié,
 * renseigner `art.image` (URL ou import local) : le composant MemeCard l'affiche
 * à la place du placeholder.
 *
 * Les memes réels sont cités par leur nom uniquement ; les memes fictifs
 * (`original: true`) sont des créations du projet.
 */
export interface CardArt {
  emoji: string;
  /** Deux couleurs du dégradé de fond. */
  bg: [string, string];
  image?: string;
}

export interface CardDef {
  id: string;
  number: number;
  name: string;
  description: string;
  category: 'Classiques' | 'Animaux' | 'Bureau' | 'Absurde' | 'Internet';
  rarity: RarityId;
  original: boolean;
  art: CardArt;
}

const c = (
  number: number, id: string, name: string, rarity: RarityId, category: CardDef['category'],
  original: boolean, emoji: string, bg: [string, string], description: string,
): CardDef => ({ id, number, name, rarity, category, original, art: { emoji, bg }, description });

export const CARDS: CardDef[] = [
  // ── Communs ─────────────────────────────────────────────
  c(1,  'keyboard-cat',   'Keyboard Cat',          'common', 'Classiques', false, '🎹', ['#2b2d6e', '#5a3fb0'], 'Joue la musique de fin à chaque échec. Toujours à l\'heure.'),
  c(2,  'brrr-toaster',   'Grille-pain Juge',      'common', 'Absurde',    true,  '🍞', ['#6b3a1e', '#c47a2c'], 'Il éjecte tes tartines quand il désapprouve tes choix de vie.'),
  c(3,  'pigeon-intern',  'Pigeon Stagiaire',      'common', 'Bureau',     true,  '🐦', ['#30475e', '#6a8caf'], 'Ne sait pas ce qu\'il fait, mais il le fait avec assurance.'),
  c(4,  'gamer-chair',    'Chaise Gamer Abandonnée','common', 'Internet',   true,  '🪑', ['#3b1f4a', '#a0306b'], 'Achetée pour « streamer ». Sert de porte-manteau depuis 2021.'),
  c(5,  'one-bar-wifi',   'Wi-Fi 1 Barre',         'common', 'Internet',   true,  '📶', ['#1c3a3a', '#2f8f83'], 'Charge à 99 % pour l\'éternité.'),
  c(6,  'philo-potato',   'Patate Philosophe',     'common', 'Absurde',    true,  '🥔', ['#4a3b22', '#9c7f45'], '« Suis-je une frite qui n\'a pas encore vécu ? »'),
  c(7,  'monday-morning', 'Lundi Matin',           'common', 'Bureau',     true,  '☕', ['#3a2a20', '#7a5233'], 'Taux de caféine requis : critique.'),
  c(8,  'prod-bug',       'Bug en Prod',           'common', 'Bureau',     true,  '🐛', ['#1f3b1f', '#4c8c2b'], 'Apparaît uniquement le vendredi à 17 h 58.'),
  c(9,  'error-404',      'Humeur 404',            'common', 'Internet',   true,  '🤖', ['#28283a', '#55557a'], 'Motivation introuvable. Veuillez réessayer plus tard.'),
  // ── Peu communs ─────────────────────────────────────────
  c(10, 'cheems',         'Cheems',                'uncommon', 'Animaux',   false, '🐶', ['#5a4320', '#d0a24a'], 'Mange un cheemsburger. Garde la dignité. Ou presque.'),
  c(11, 'this-is-fine',   'This Is Fine',          'uncommon', 'Classiques', false, '🔥', ['#5a1a10', '#e0571e'], 'Tout va bien. Le café est encore chaud. La pièce aussi.'),
  c(12, 'expanding-brain','Expanding Brain',       'uncommon', 'Classiques', false, '🧠', ['#2a1a5a', '#7b5cff'], 'Chaque niveau de réflexion est plus lumineux — et plus absurde.'),
  c(13, 'calc-cat',       'Chat Calculatrice',     'uncommon', 'Animaux',   true,  '🐱', ['#20304a', '#4a74c0'], '2 + 2 = croquettes. Il a raison, techniquement.'),
  c(14, 'diplo-banana',   'Banane Diplomatique',   'uncommon', 'Absurde',   true,  '🍌', ['#4a4a10', '#d8c22a'], 'Résout tous les conflits. Glisse sur le reste.'),
  c(15, 'cactus-influ',   'Cactus Influenceur',    'uncommon', 'Internet',  true,  '🌵', ['#103a28', '#2fb06a'], '« Lien en bio. Ne touche pas, je pique. »'),
  // ── Rares ───────────────────────────────────────────────
  c(16, 'doge',           'Doge',                  'rare', 'Classiques', false, '🐕', ['#5a3a10', '#f0b54a'], 'Such card. Very rare. Wow.'),
  c(17, 'stonks',         'Stonks',                'rare', 'Classiques', false, '📈', ['#0f2a4a', '#2ad1a0'], 'Les courbes montent. La compréhension, pas du tout.'),
  c(18, 'rickroll',       'Rickroll',              'rare', 'Classiques', false, '🎤', ['#3a1040', '#ff4fa3'], 'Tu as cliqué pour voir la description. Tu le regrettes déjà.'),
  c(19, 'rage-cloud',     'Nuage Rageux',          'rare', 'Absurde',    true,  '⛈️', ['#1a1f3a', '#5560c8'], 'Pleut uniquement sur ton linge fraîchement étendu.'),
  c(20, 'debug-duck',     'Canard de Débogage',    'rare', 'Bureau',     true,  '🦆', ['#103040', '#20b8d8'], 'Tu lui expliques le bug. Il ne dit rien. Le bug disparaît.'),
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((x) => [x.id, x]));
