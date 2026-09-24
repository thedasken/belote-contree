# Registre des décisions — Belote Contrée

## Confirmées par le demandeur

- Contrée uniquement ; quatre joueurs, deux équipes choisies manuellement et fixes durant la session.
- URL web et PWA ; Chrome Android / Safari iOS prioritaires ; téléphone paysage ; tapis traditionnel vert et bois ; animations discrètes ; appui simple.
- Internet à quatre sur appareils séparés, bots pour compléter et solo, objectif multijoueur local sans Internet ; méthode locale à choisir selon la simplicité réelle.
- Salon privé par code, pseudo temporaire, aucune inscription ; suspension à la déconnexion, reconnexions temporaires ; pas de reprise durable d'anciennes parties.
- Pas de limite de temps, chat ni historique.
- Contrats numériques 80 à 160 par 10, quatre couleurs, plus capot ; pas de SA/TA ; uniquement belote-rebelote ; quatre passes initiales = nouvelle distribution avec donneur suivant.
- Contre à la volée par la défense, clôturant immédiatement les enchères.
- Fenêtre de surcontre : l'un des deux preneurs surcontre OU les deux preneurs déclinent ; sans minuterie.
- Comptage « points faits + annoncés » ; belote-rebelote déclarée automatiquement et **toujours imprenable**, même lorsque l'équipe perd.
- Partie s'arrête après une donne complète lorsqu'au moins une équipe atteint 2000.
- VPS Docker ; performance et sobriété prioritaires ; développement progressif MVP, V2, V3.

## Hypothèses nécessaires à l'implémentation (NON explicitement validées)

- Si les deux équipes atteignent 2000 à la fin de la même donne : score le plus élevé gagnant. En cas d'égalité exacte, une donne de départage (sinon aucun gagnant déterminable).
- En cas de capot non annoncé durant une donne contrée, le forfait contre/surcontre remplace le bonus de capot non demandé, sans cumul.
- Le forfait de contrat numérique surcontré vaut `4 × (160 + contrat)` ; chaque équipe conserve séparément son bonus belote.
- Le bonus belote est inclus une seule fois : dans les points faits arrondis si contrat ordinaire réussi, sinon ajout séparé aux forfaits.
- Premier lot : quatre humains en ligne avant la livraison des bots V2 ; le moteur peut représenter les places bots sans logique de décision dès le MVP.
- Salon inactif expirant après une durée configurable, valeur initialement proposée : 24 h.
- Attribution du vainqueur si une donne est annulée indéfiniment : jamais de score fictif.

Ces hypothèses sont documentées afin de permettre l'écriture de tests reproductibles ; ne pas les présenter comme des préférences explicitement confirmées.

## Décisions techniques proposées

Monorepo pnpm, TypeScript strict, React + Vite PWA, Fastify + WebSocket, moteur TypeScript partagé et pur, Vitest / Playwright, Docker Compose. Le réseau local sans Internet doit faire l'objet d'un prototype Chrome Android + Safari iOS avant de retenir une technologie.
