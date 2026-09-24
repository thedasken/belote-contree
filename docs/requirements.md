# Cahier des charges (SRS) — Belote Contrée v1.0

Statut : périmètre validé ; les hypothèses restantes sont distinguées dans `decisions.md`.

## 1. Objectif

Application de belote contrée privée, gratuite, sans publicité, sans compte, permettant à quatre participants maximum de jouer à deux équipes de deux sur mobile ou ordinateur. L'application doit être performante, sobre et maintenable ; elle sera développée progressivement avec Codex dans VS Code.

## 2. Plateformes

- Web sur téléphone et ordinateur ; Chrome Android et Safari iOS prioritaires.
- Orientation paysage pour le tapis de jeu ; présentation adaptée aux écrans d'ordinateur.
- Accès immédiat par URL ; installation PWA facultative.
- Hébergement sur VPS personnel avec Docker.
- Mode Internet pour quatre personnes ; mode solo ou groupe incomplet avec bots ; multijoueur local sans Internet, à livrer dans un lot ultérieur après validation du mécanisme local.
- Le mode solo hors ligne exige une première visite et une mise en cache correcte de la PWA.

## 3. Exigences fonctionnelles

| ID | Exigence | Lot |
|---|---|---|
| FR-01 | Créer un salon privé et obtenir un code de partage | MVP |
| FR-02 | Rejoindre un salon avec code et pseudo temporaire, sans compte | MVP |
| FR-03 | Quatre places, deux équipes fixes de deux et affectation manuelle | MVP |
| FR-04 | Lancer uniquement lorsque les quatre places sont occupées, humains ou bots | MVP* |
| FR-05 | Mélanger puis distribuer les 32 cartes, huit par place | MVP |
| FR-06 | Enchérir : 80–160 par paliers de 10, quatre couleurs, plus Capot | MVP |
| FR-07 | Contre hors tour autorisé pour la défense, qui ferme les enchères ; fenêtre de surcontre sans limite de temps pour les deux preneurs | MVP |
| FR-08 | Jouer huit plis avec détection des coups autorisés et refus des coups illégaux | MVP |
| FR-09 | Détecter automatiquement la belote-rebelote, toujours imprenable | MVP |
| FR-10 | Calculer points faits + annoncés et finir à 2 000 points après une donne entière | MVP |
| FR-11 | Mettre en évidence les cartes légales et rendre le dernier pli consultable | MVP |
| FR-12 | Suspendre une session lorsqu'un humain se déconnecte, reprendre au retour | MVP |
| FR-13 | Interface tapis vert et bois, distribution/déplacement discrets, carte jouée par appui | MVP |
| FR-14 | Compléter les places avec des bots et proposer du solo | V2 |
| FR-15 | Exécuter moteur et bots localement sans Internet après mise en cache PWA | V2 |
| FR-16 | Multijoueur local sans connexion Internet, Android + iPhone | V3 |

\* Le moteur supporte conceptuellement des places bots au MVP ; l'interface de sélection et les décisions automatiques des bots sont en V2. Au MVP, démarrage à quatre humains.

## 4. Règles générales et exclusions

- Variante : belote contrée seulement ; quatre atouts couleur ; aucun Sans Atout / Tout Atout ; pas de générale.
- Annonces : uniquement belote-rebelote (20 points), automatisée.
- Pas de compte, pas de chat, pas d'historique durable, pas de classement, pas de minuterie de jeu.
- Une partie interrompue se reprend seulement pendant la durée de vie de son salon actif ; pas de bibliothèque de parties archivées.
- La donnée privée d'une main ne peut être envoyée qu'au joueur correspondant.

## 5. Qualité et sécurité

- Le serveur est autoritaire en mode Internet ; chaque action doit être authentifiée et validée côté serveur.
- Le code de salon n'est pas un jeton d'identité ; la reconnexion exige un jeton privé aléatoire.
- Une place ne peut pas être contrôlée par deux sessions simultanées sans politique explicite de reprise.
- Chaque salon séquence ses commandes ; version et identifiant de commande empêchent les doubles applications.
- Moteur pur, indépendant de React, Fastify, navigateur et stockage ; tests unitaires déterministes.
- Performance visée : interaction perçue immédiate ; éviter les dépendances et processus superflus. Aucune promesse de latence Internet fixe.
- Pas de distribution de secrets ni de cartes adverses via événements publics.

## 6. Critères de réception MVP

Quatre personnes rejoignent un salon privé depuis Chrome Android, Safari iOS et/ou ordinateur, choisissent deux équipes, enchérissent, jouent huit plis par donne, consultent le dernier pli, voient les scores, se reconnectent après une coupure temporaire, et finissent une partie conforme aux règles documentées. Toutes les matrices de tests métier bloquantes passent avant livraison.

## 7. Livraison progressive

1. Core/Cards et tests.
2. Bidding et Tricks avec scénarios.
3. Scoring, moteur de jeu et simulation sans interface.
4. Salon, session, protocole, persistance temporaire et serveur.
5. UI responsive, tests réels Chrome Android et Safari iOS.
6. Bots raisonnablement intelligents, PWA hors ligne et multijoueur local une fois la faisabilité validée.
