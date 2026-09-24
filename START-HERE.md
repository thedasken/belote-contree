# Démarrer avec Codex dans VS Code

1. Créer un dépôt local `belote-contree/`.
2. Copier à sa racine le contenu de cette archive : `README.md`, `docs/`, `prompts/` et ce guide. Ne pas copier seulement le prompt : Codex doit avoir accès aux spécifications.
3. Ouvrir le dossier du dépôt dans VS Code.
4. Ouvrir `prompts/01-bootstrap-codex.md` et envoyer à Codex son contenu complet.
5. Lui demander de s'en tenir au **premier lot**. À la fin, vérifier le diff, le lockfile et les résultats des commandes `pnpm typecheck`, `pnpm lint`, `pnpm test` et `pnpm build`.
6. Les décisions marquées « hypothèses non explicitement validées » dans `docs/decisions.md` doivent être confirmées avant l'implémentation correspondante, notamment dans le module Scoring.

Le premier lot n'implémente pas encore les enchères, le calcul des scores, les bots, le serveur ou l'interface. Le dossier peut être conservé tel quel dans le dépôt pour les étapes suivantes.
