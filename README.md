# MEME JACKPOT — Phase 1

Casino virtuel **à crédits fictifs** + collection de cartes memes.
Aucun argent réel, aucun retrait, aucune conversion : les crédits ◈ et les cartes n'ont aucune valeur.

## Démarrage

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 34 tests : blackjack, slots/RTP, caisses, registre, quotidien, anti-triche horloge
npm run typecheck    # typage strict du cœur (moteurs, serveur, tests)
npm run build        # build de production Vite → dist/
npm run build:standalone  # un seul fichier HTML autonome → dist-standalone/index.html
```

Node 20+ requis.

## Contenu jouable de la Phase 1

| Module | État |
|---|---|
| Lobby casino (tuiles, profil, niveau/XP, solde animé, stats) | ✅ |
| Navigation desktop + barre mobile en bas | ✅ |
| Crédits fictifs : 5 000 au départ, registre des transactions | ✅ |
| Sauvegarde locale (mode invité), export JSON, suppression | ✅ |
| Bonus quotidien sur 7 jours (1 000 ◈ + progression, gros bonus J7) + anti-recul d'horloge | ✅ |
| Coup de pouce sans pub (500 ◈ toutes les 4 h si solde < 100) | ✅ |
| **Meme Machine** : 5 rouleaux, 10 lignes, wild, scatter, tours gratuits ×2, table des gains, RTP simulé 95,5 % | ✅ |
| **Blackjack** : tirer, rester, doubler, séparer (4 mains), As 1/11, peek, S17, BJ 3:2 | ✅ |
| **Starter Meme Case** : ruban animé, ralentissement, révélation par rareté, passer l'animation, historique, probabilités exactes | ✅ |
| Inventaire : 20 cartes, tri (n°, rareté, date, nom), recherche, doublons, favoris, manquantes, stats | ✅ |
| Cartes : 7 raretés définies, effets holo / inclinaison 3D au pointeur | ✅ |
| Âge 18+, mentions crédits fictifs, limite de session volontaire, réduction des animations, sons on/off | ✅ |

Les tuiles Roulette, Poker, Mines, Plinko et MEME DECK sont affichées **désactivées** avec la mention « Bientôt » (aucun bouton factice).

## Architecture

```
src/
  core/rng.ts              CSPRNG (crypto.getRandomValues) + RNG déterministe pour les tests
  config/economy.ts        Économie centralisée (départ, quotidien, XP, coup de pouce…)
  collection/              Raretés (7), cartes (20), caisses + calcul/validation des cotes
  games/slots/engine.ts    Moteur de slot pur (évaluation des lignes, scatters, simulation RTP)
  games/blackjack/engine.ts Moteur de blackjack pur (règles, croupier, règlement)
  server/types.ts          Contrat GameServer (= future API Supabase)
  server/localServer.ts    Serveur local autoritaire : tirages, soldes, idempotence, registre
  state/                   Store global (API compatible Zustand) + appels serveur
  audio/sfx.ts             Sons synthétisés Web Audio (aucun fichier à licencier)
  ui/components, ui/screens Interface React
tests/                     node:test via tsx
```

### Principes anti-triche (déjà en place)

- **L'interface ne tire jamais un résultat.** Elle appelle `GameServer` ; le serveur tire, débite, crédite et enregistre, puis l'UI anime un résultat déjà connu. `Math.random()` n'est utilisé que pour du cosmétique (symboles de remplissage, confettis).
- **Idempotence** : chaque action monétaire porte une clé unique ; rejouer la clé renvoie le même résultat sans double débit.
- **Carte cachée du croupier** jamais envoyée au client avant la fin de la main.
- **Horloge** : un recul de l'heure de l'appareil bloque le bonus quotidien.

⚠️ En mode invité, le « serveur » tourne dans le navigateur : un joueur peut modifier son `localStorage`. C'est acceptable pour le dev et le hors-ligne. En Phase 5, `SupabaseServer` implémentera la même interface `GameServer` via des Edge Functions (tirages, soldes et cotes versionnées en base, RLS), sans changement côté UI.

### Choix techniques de cette phase

Le cahier des charges recommande Tailwind, Framer Motion, Zustand et Howler. L'environnement de construction de cette phase était hors-ligne, donc :
- **Zustand** → `src/state/store.ts` expose la même API `create()` ; remplacement = une ligne d'import.
- **Tailwind** → CSS à variables (`src/styles/global.css`) qui porte le design system.
- **Framer Motion** → Web Animations API + keyframes CSS (60 FPS, `will-change`, transforms uniquement).
- **Howler.js** → Web Audio synthétisé ; l'objet `sfx` peut être réimplémenté avec Howler sans toucher aux écrans.

Ces bibliothèques peuvent être introduites en Phase 2 sans refonte.

## Ajouter du contenu

- **Une carte** : ajouter une entrée dans `src/collection/cards.ts`. Pour une illustration licenciée, renseigner `art.image`.
- **Une caisse** : ajouter un `CaseDef` dans `src/collection/cases.ts` (les tests vérifient que les cotes totalisent 100 %).
- **Une machine à sous** : définir un `SlotMachineDef` dans `games/slots/engine.ts`, lancer `simulateRtp`, renseigner `measuredRtp`.

## Droits

Aucune image de meme n'est utilisée. Les noms de memes connus appartiennent à leurs auteurs ; les illustrations sont des placeholders originaux (emoji + dégradé) remplaçables. Les memes basés sur des personnages protégés ou des personnes réelles (Pepe, Trollface, Nyan Cat, Pikachu, Gigachad, Harold, El Risitas…) ne sont pas inclus tant qu'aucune licence n'est obtenue ; la Phase 4 pourra leur substituer des équivalents originaux.

## Économie (Phase 1)

| Élément | Valeur |
|---|---|
| Crédits de départ | 5 000 |
| Bonus quotidien | 1 000 → 1 500 (J1→J6), 3 000 au J7 |
| Coup de pouce | 500 si solde < 100, toutes les 4 h |
| Meme Machine | mises 10–500, RTP ≈ 95,5 % → perte moyenne ≈ 0,9 ◈ pour 20 ◈ misés |
| Blackjack | mise 10–5 000, avantage maison ≈ 0,5 % en stratégie de base |
| Starter Case | 100 ◈ — 62 % commun, 28 % peu commun, 10 % rare |

Avec le seul bonus quotidien, un joueur peut ouvrir ~10 Starter Cases ou faire ~50 tours à 20 ◈ par jour.

## Prochaine étape — Phase 2

Album par familles, 50 cartes, raretés Épique → Secret avec variantes (holo, Golden, Glitched, 1/1), caisses Viral / Legendary / Brainrot / Mythic, ouvertures ×5 / ×10, statistiques de collection.
