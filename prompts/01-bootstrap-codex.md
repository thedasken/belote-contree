# Prompt Codex 01 — Initialisation du dépôt et Cards/Core

Copie-colle **tout le contenu ci-dessous** dans Codex, après avoir copié le dossier `docs/` à la racine du nouveau dépôt `belote-contree` (ou avoir extrait l'archive complète dans le dépôt).

---

Tu es un ingénieur logiciel chargé d'initialiser le projet **Belote Contrée** dans le dépôt ouvert dans VS Code. Lis **intégralement** `README.md`, `docs/requirements.md`, `docs/game-rules.md`, `docs/domain-model.md`, `docs/architecture.md`, `docs/test-matrix.md` et `docs/decisions.md` avant toute modification. Ces fichiers définissent le contrat métier du projet. Les préférences explicites du demandeur priment sur les règles fédérales. Ne développe **que le lot 1 : initialisation du monorepo, Core et Cards, avec tests automatisés**. N'implémente ni enchères, ni plis, ni scores, ni bots, ni serveur multijoueur, ni UI métier.

## Livrables de ce lot

1. Initialiser un monorepo pnpm avec `pnpm-workspace.yaml`, `package.json` racine, un lockfile et des scripts `typecheck`, `test`, `lint` et `build`. Utiliser TypeScript strict et des versions stables vérifiées dans l'environnement ; privilégier Node.js 24 LTS si disponible. Ne pas inventer des numéros de versions : si l'accès au registre est indisponible, expliciter la limite et travailler avec les versions disponibles.
2. Créer les workspaces :
   - `packages/game-engine` avec les dossiers `src/core/`, `src/cards/` et `test/` ;
   - `packages/bot` et `packages/protocol` vides ou minimalement déclarés, sans logique fictive ;
   - `apps/web` et `apps/server` comme dossiers de destination, sans installer React ou Fastify tant que ce n'est pas nécessaire au premier lot.
3. Dans `core`, définir **des types explicites**, des identifiants de places `SeatId` valides (0,1,2,3), les équipes, `Suit`, `Rank`, `Card` et les erreurs de validation utiles. Choisir une API typée ergonomique, sans classes inutiles. Définir `nextSeat` et `teamOfSeat` ; pas de dépendances Node ou DOM.
4. Dans `cards`, implémenter :
   - `createDeck(): readonly Card[]` (32 cartes uniques) ;
   - `validateDeck(deck)` rejetant les doublons, cartes invalides et paquets incomplets ;
   - `shuffleDeck(deck, random)` avec une stratégie injectable permettant des tests déterministes (Fisher–Yates, source crypto par un adaptateur externe plus tard) ;
   - `dealCards(shuffledDeck, dealerSeat)` qui distribue les 32 cartes en ordre tournant à partir du joueur suivant le donneur : quatre mains de huit ; l'ordre interne des mains et de distribution doit être déterministe et documenté ;
   - fonctions pures de **force** et de **valeur en points** d'une carte avec indication de l'atout (ne jamais confondre classement et points).
5. Exporter uniquement une interface publique cohérente depuis `packages/game-engine/src/index.ts`. L'API peut évoluer, mais tous les comportements du lot 1 doivent être couverts par des tests.
6. Écrire en Vitest les cas `CORE-01`, `CORE-02`, `CAR-01` à `CAR-09` de `docs/test-matrix.md` ; ajouter des tests pour chaque erreur, les limites, le paquet immuable et différentes positions de donneur. Aucun test ne doit dépendre d'un mélange aléatoire non contrôlé.
7. Configurer un formatage cohérent et un lint simple. Ajouter un `.gitignore` correct (node_modules, dist, coverage, fichiers .env, artefacts de build), un exemple de configuration si pertinent et des scripts simples. Ne pas créer de CI, Docker, base de données ou déploiement à ce stade.
8. Produire un `README.md` du dépôt indiquant comment installer, vérifier les types, tester et compiler **sans effacer ni réécrire la documentation métier fournie**. Conserver les fichiers `docs/` tels quels et documenter toute proposition d'évolution séparément.

## Règles d'architecture impératives

- `game-engine` doit s'exécuter dans un navigateur et sur Node.js : pas de `fs`, `crypto` Node, `window`, `localStorage`, Fastify ou React dans le moteur.
- Le mélange doit recevoir une source de nombres aléatoires injectée ; préparer une interface minimale pour permettre ultérieurement un adaptateur cryptographiquement sûr. Ne jamais utiliser `Math.random` implicitement pour les parties de production.
- Pour les tests, utiliser des jeux de 32 cartes connus et une source déterministe. Le moteur ne stocke aucun état global mutable.
- Pas de dépendances circulaires. `cards` dépend de `core` ; pas l'inverse.
- Pas de sur-ingénierie : privilégier des fonctions pures et des types plutôt qu'une arborescence de classes ou des interfaces vides.
- Aucun objet métier inventé pour contourner une erreur de compilation. Aucun test ignoré pour rendre la CI artificiellement verte.

## Critères de fin de lot

- Exécuter l'installation, `pnpm typecheck`, `pnpm lint`, `pnpm test` et `pnpm build` si l'environnement le permet. Corriger les erreurs plutôt que les masquer.
- Tous les tests `CORE-*` et `CAR-*` du premier lot passent.
- Afficher en fin de travail un résumé **concis** : fichiers créés, API publiques, commandes exécutées, nombre de tests réussis, erreurs ou limitations restantes, et points de décision nécessaires avant le lot 2.
- Ne pas démarrer le lot 2 sans une demande explicite.
