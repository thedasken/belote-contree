# Belote Contrée — dossier de spécification v1.0

## Développement

Le lot 1 initialise un monorepo pnpm et implémente le cœur et les cartes dans packages/game-engine. Avec Node.js 24 ou plus récent :

    pnpm install
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build

La documentation métier ci-dessous et dans docs/ reste la source de vérité. Les modules d'enchères, de plis, de scoring et la façade Game Engine sont exposés par `packages/game-engine/src/`; ils restent purs, immuables et indépendants des transports.

Le lot 5 ajoute les contrats Zod dans `packages/protocol/` et le socle serveur dans `apps/server/`. Installation et vérifications :

    pnpm install
    pnpm dev:server
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build

Copier `apps/server/.env.example` vers `.env` pour configurer l'adresse d'écoute et les origines autorisées.

La persistance serveur utilise SQLite via `DATABASE_PATH` (par défaut `./data/sessions.sqlite`). Le schéma est créé au démarrage ; les snapshots actifs contiennent les empreintes de jetons et l'état du moteur, jamais les jetons privés en clair. Les salons sauvegardés sont rechargés au démarrage avant d'accepter les connexions.

Les connexions WebSocket sont suivies en mémoire par participant, avec remplacement par identifiant de connexion, suspension/reprise de session et heartbeat configurables par `WS_HEARTBEAT_INTERVAL_MS` et `WS_HEARTBEAT_TIMEOUT_MS`.

La validation backend couvre les limites WebSocket, les contres concurrents,
la suspension/reconnexion, la restauration SQLite et le heartbeat réel avec
clients `ws` sains, silencieux et remplacés.

Le serveur expose également `POST /rooms/:code/assign`, `POST /rooms/:code/start` et `GET /rooms/:code/ws`. Les commandes WebSocket sont authentifiées par le jeton privé et portent `commandId` ainsi que `expectedVersion`.

## Frontend (lot 6A)

Le frontend React/Vite se trouve dans `apps/web`.

```sh
pnpm install
pnpm --filter @belote/web dev
```

Par défaut, l'API est recherchée sur `http://localhost:3000`. Pour un autre environnement, créer `apps/web/.env` avec `VITE_API_URL` et, si nécessaire, `VITE_WS_URL` (par exemple `ws://localhost:3000`). Le serveur doit autoriser l'origine du frontend via `ALLOWED_ORIGINS`.

Pour lancer les deux applications, utiliser deux terminaux : `pnpm dev:server`, puis `pnpm --filter @belote/web dev`. Les vérifications frontend sont `pnpm --filter @belote/web typecheck`, `pnpm --filter @belote/web lint`, `pnpm --filter @belote/web test` et `pnpm --filter @belote/web build`.

Le parcours réel se lance après compilation du serveur, avec le serveur et Vite démarrés dans deux terminaux : `pnpm --filter @belote/server build`, puis `pnpm --filter @belote/web exec playwright test --project=chromium --config=playwright.config.ts`. La configuration prépare aussi WebKit avec `--project=webkit`; les navigateurs Playwright doivent être installés avec `playwright install chromium webkit`.

Pour le scénario E2E de fin de partie, démarrer le serveur avec `E2E_FIXTURE=1` afin d'activer la fixture de test strictement réservée à cet environnement, puis lancer `pnpm --filter @belote/web exec playwright test e2e/game-completion.spec.ts --project=chromium`. Ce scénario utilise le vrai moteur, Fastify, SQLite et quatre contextes Chromium indépendants.

La validation responsive se lance avec `pnpm --filter @belote/web exec playwright test e2e/responsive.spec.ts --project=chromium`. Elle couvre 375×667, 667×375, 844×390, 932×430, 1280×720 et 1920×1080, et produit les captures dans `apps/web/test-results/`. Le projet WebKit est configuré (`--project=webkit`), mais nécessite le binaire Playwright WebKit local ; il n'est pas considéré comme validé si ce binaire n'est pas installé.

WebKit Playwright 1.55.0 attend l'archive `webkit_ubuntu20.04_x64_special-2092`. Sur Fedora, si cette archive ne se télécharge pas, les tests WebKit restent non exécutés ; cela ne signifie pas que le WebKit système est compatible. Pour une validation Safari réelle, servir l'application en HTTPS puis ouvrir le parcours lobby, enchères, donne, reconnexion et fin de partie sur un iPhone en paysage (667×375, 844×390 ou 932×430), en contrôlant les cartes, dialogues, safe areas et absence de débordement.

### Préproduction Docker

La préproduction utilise une image multistage unique : Fastify sert l'API, le WebSocket et les fichiers Vite compilés. Copier `.env.example` vers `.env`, renseigner `ALLOWED_ORIGINS` avec l'origine HTTPS du reverse proxy, puis lancer :

```bash
cp .env.example .env
docker compose build
docker compose up -d
curl http://127.0.0.1:3000/health
```

Le conteneur écoute sur `127.0.0.1:3000` côté hôte ; le reverse proxy doit transmettre `/`, `/rooms/*` et les connexions WebSocket `/rooms/*/ws` avec les en-têtes `Upgrade` et `Connection`. Le navigateur utilise automatiquement l'origine courante si `VITE_API_URL` et `VITE_WS_URL` ne sont pas définies. `E2E_FIXTURE` reste à `0` dans Compose et la route de fixture n'existe pas en production.

Variables serveur : `ALLOWED_ORIGINS`, `DATABASE_PATH`, `HOST`, `PORT`, `WS_HEARTBEAT_INTERVAL_MS`, `WS_HEARTBEAT_TIMEOUT_MS` et `E2E_FIXTURE`. La base est persistée dans le volume Docker `belote-data` à `/data/sessions.sqlite`. Les écritures utilisent des transactions SQLite `BEGIN IMMEDIATE` ; arrêter l'instance avant la sauvegarde, puis copier la base et ses fichiers `-wal`/`-shm` éventuels :

```bash
docker compose stop
docker run --rm -v belote-contree_belote-data:/data -v "$PWD/backups:/backup" alpine sh -c 'cp /data/sessions.sqlite /backup/sessions.sqlite'
docker compose start
```

Pour mettre à jour : `docker compose build && docker compose up -d`. Pour revenir à l'image précédente, conserver son tag, l'indiquer dans `docker-compose.yml`, puis exécuter `docker compose up -d`. Aucun secret, domaine réel ou jeton privé ne doit être commité ; `.env` est ignoré par Git.

### Rapport lot 6A

Créés : `apps/web` avec ses couches transport, écran d'accueil, lobby, écran de partie démarrée et styles responsives. Le jeton privé reste uniquement dans `sessionStorage`; les messages entrants sont validés par `serverMessageSchema`. La reconnexion est progressive et nettoyée au démontage.

Le backend existant fournit les endpoints et événements nécessaires. Le tapis, les cartes, les enchères visuelles, les bots, la PWA et le mode hors ligne restent volontairement hors périmètre. Le test de parcours navigateur et les tests React dédiés restent à compléter dans un environnement disposant de pnpm et des dépendances frontend.

Ce dossier constitue la source de vérité pour l'implémentation. Les décisions du projet prévalent sur les comportements implicites que pourrait inventer un agent de codage.

## Documents

1. `docs/requirements.md` — cahier des charges, périmètre et lots.
2. `docs/game-rules.md` — règlement personnalisé et conventions de score.
3. `docs/domain-model.md` — entités, valeurs et invariants.
4. `docs/architecture.md` — modules, dépendances et exécution.
5. `docs/test-matrix.md` — cas de tests et critères de validation.
6. `docs/decisions.md` — décisions structurantes, hypothèses et points à confirmer.
7. `prompts/01-bootstrap-codex.md` — **premier prompt Codex** : initialisation du monorepo et implémentation Cards/Core uniquement.

## Ordre de travail

- Lire tous les documents avant d'implémenter une règle.
- Initialiser le monorepo et développer le premier lot avec `prompts/01-bootstrap-codex.md`.
- Faire valider les tests du premier lot avant de commencer Bidding, Tricks, Scoring et Game Engine.

## Référence externe

- Fédération française de Belote, règlement de la contrée : https://www.ffbelote.org/belote-contree/
- La présente application **s'écarte volontairement** du règlement fédéral sur le contre hors tour, la surcontre sans chronomètre et la belote toujours imprenable. Les règles ci-dessous prévalent.
