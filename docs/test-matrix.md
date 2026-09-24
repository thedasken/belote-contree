# Matrice de tests — Belote Contrée v1.0

Les identifiants sont stables. Toute implémentation doit convertir ces cas en tests automatisés progressivement. Le lot 1 couvre `CAR-*` et les types `CORE-*` ; le lot 2 couvre `BID-01` à `BID-17` ; le lot 3 couvre les scénarios `TRK-*` et `WIN-*` du moteur des plis ; le lot 4 couvre `SCR-*` et l'intégration Game Engine ; le lot 5 couvre les invariants Room/Session/Protocol, l'authentification, la confidentialité, la persistance SQLite et le registre des connexions WebSocket.

## Core et cartes — lot 1 (bloquant)

| ID | Cas | Résultat attendu |
|---|---|---|
| CORE-01 | Positions 0,1,2,3 | Partenaires 0–2 / 1–3 ; tour cyclique 0→1→2→3 |
| CORE-02 | Couleurs et rangs | 4 couleurs × 8 rangs ; types exhaustifs |
| CAR-01 | Création du paquet | Exactement 32 cartes distinctes |
| CAR-02 | Paquet incomplet/en doublon remis à `deal` | Rejet typé sans état partiel |
| CAR-03 | Distribution d'un paquet connu | Quatre mains de huit, aucune perte ni doublon |
| CAR-04 | Même paquet injecté deux fois | Mêmes mains et même ordre de distribution |
| CAR-05 | Mélange injectable avec source déterministe | Résultat identique pour même source ; permutation des 32 cartes |
| CAR-06 | Valeurs atout | J=20, 9=14, A=11, 10=10, K=4, Q=3, 8=0, 7=0 |
| CAR-07 | Valeurs hors atout | A=11, 10=10, K=4, Q=3, J=2, 9=0, 8=0, 7=0 |
| CAR-08 | Hiérarchie atout et hors atout | Conforme aux tableaux normatifs ; aucun classement par valeur de points seulement |
| CAR-09 | Somme de points d'un paquet | 152 points de cartes, hors dix de der et belote |

## Enchères — lot 2

| ID | Cas | Attendu |
|---|---|---|
| BID-01 | 80 cœur en ouverture | Accepté |
| BID-02 | 70 ou 85 | Refusé |
| BID-03 | 100 après 90 | Accepté |
| BID-04 | 100 après 100 autre couleur | Refusé |
| BID-05 | Capot après 160 | Accepté |
| BID-06 | Enchère numérique après capot | Refusée |
| BID-07 | Trois passes après enchère | Contrat fixé |
| BID-08 | Quatre passes initiales | Donne annulée, score inchangé |
| BID-09 | Enchère hors tour | Refusée |
| BID-10 | Contre hors tour par défense | Accepté ; enchères closes |
| BID-11 | Contre par preneurs ou sans contrat | Refusé |
| BID-12 | Deux contres concurrents | Une seule commande valide |
| BID-13 | Chaque preneur refuse la surcontre | Début du jeu, contrat contré |
| BID-14 | Un preneur surcontre | Début du jeu, contrat surcontré |
| BID-15 | Défenseur surcontre / troisième renoncement / enchère après contre | Refusés |

## Plis — lot 2

| ID | Cas | Attendu |
|---|---|---|
| TRK-01 | Entame | Toute carte en main est légale |
| TRK-02 | Couleur demandée disponible | Fournir obligatoire |
| TRK-03 | Couleur absente, partenaire maître | Toutes cartes légales |
| TRK-04 | Couleur absente, partenaire non maître, atout disponible | Couper obligatoire |
| TRK-05 | Adversaire maître à l'atout, surcoupe possible | Seuls les atouts supérieurs autorisés |
| TRK-06 | Adversaire maître à l'atout, surcoupe impossible | Défausse libre, même atout inférieur |
| TRK-07 | Atout demandé, montée possible | Montée obligatoire |
| TRK-08 | Atout demandé, montée impossible | Tout atout de main légal |
| TRK-09 | Ni couleur demandée ni atout | Défausse libre |
| TRK-10 | Carte absente de la main / hors tour | Refus sans mutation |
| WIN-01 | Sans atout dans le pli | Plus haute carte de la couleur demandée gagne |
| WIN-02 | Au moins un atout | Plus haut atout gagne |
| WIN-03 | Pli complet | Quatre cartes, gagnant entame le suivant |
| WIN-04 | Huitième pli | Bonus dix de der ou bonus capot et clôture |

## Belote — lot 3

| ID | Cas | Attendu |
|---|---|---|
| BEL-01 | K+Q atout dans la même main | Belote potentielle |
| BEL-02 | Première carte du couple jouée | Belote annoncée |
| BEL-03 | Deuxième carte du couple jouée | Rebelote, bonus unique 20 |
| BEL-04 | K/Q répartis entre deux mains | Aucun bonus |
| BEL-05 | K/Q d'une couleur non atout | Aucun bonus |
| BEL-06 | Preneurs chutent avec belote | Ils conservent 20 ; défense ne les récupère pas |
| BEL-07 | Défense perd un capot avec belote | Elle conserve 20 |

## Scores — lot 3

Les exemples ci-dessous sont calculés sans belote sauf mention contraire. Chaque couple `pointsPlis` inclut le dix de der et totalise 162 en l'absence de capot. Les scores affichés sont `preneur/défense`.

| ID | Contrat | Points plis P/D | Attendu |
|---|---|---|---|
| SCR-01 | 80 | 110 / 52 | 190 / 50 |
| SCR-02 | 100 | 115 / 47 | 220 / 50 |
| SCR-03 | 90 | 89 / 73 | 0 / 250 |
| SCR-04 | 120 | 120 / 42 | 240 / 40 |
| SCR-05 | 160, capot non annoncé | 252 / 0 (inclut bonus capot) | 410 / 0 (forfait 250+160) |
| SCR-06 | 100 contré réussi | 115 / 47 | 520 / 0 |
| SCR-07 | 100 contré chuté | 95 / 67 | 0 / 520 |
| SCR-08 | 100 surcontré réussi | 115 / 47 | 1040 / 0 |
| SCR-09 | Capot annoncé réussi | 252 / 0 | 500 / 0 |
| SCR-10 | Capot annoncé chuté | 140 / 22 | 0 / 500 |
| SCR-11 | Capot contré réussi | 252 / 0 | 1000 / 0 |
| SCR-12 | Capot surcontré réussi | 252 / 0 | 2000 / 0 |
| SCR-13 | 90 annoncé, 89 points | 89 / 73 | Chute **avant arrondi** |
| SCR-14 | 90, points P=70, belote P=20 | 70 / 92 | Contrat réussi ; P=180 (70+20+90), D=90 |
| SCR-15 | 100 annoncé chuté, belote P=20 | 90 / 72 | P=20, D=260 ; belote imprenable |
| SCR-16 | 100 contré chuté, belote défense=20 | 90 / 72 | P=0, D=540 |
| SCR-17 | Capot demandé et chuté, belote preneurs=20 | 140 / 22 | P=20, D=500 |
| SCR-18 | Résultat déjà appliqué | — | Deuxième application rejetée |

## Partie et protection — lots 3–5

| ID | Cas | Attendu |
|---|---|---|
| GAME-01 | Quatre places valides | Démarrage autorisé |
| GAME-02 | Huit plis achevés | Donne unique clôturée et score appliqué une fois |
| GAME-03 | Une équipe atteint >=2000 après la donne | Partie terminée |
| GAME-04 | Les deux atteignent >=2000 après la même donne | Total le plus élevé gagnant (hypothèse documentée) |
| GAME-05 | Égalité exacte >=2000 | Donne de départage (hypothèse documentée) |
| GAME-06 | Quatre passes initiaux | Aucune modification du score |
| NET-01 | Déconnexion humaine | Jeu suspendu ; état intact |
| NET-02 | Reconnexion valide | Même main, même tour, scores inchangés |
| NET-03 | Commande dupliquée / version périmée | Aucun double coup |
| PRIV-01 | Vue joueur | Aucune main adverse cachée |
| PRIV-02 | Code de salon sans jeton privé | Impossible d'usurper une place déjà occupée |

## Validation backend — lot 5J

| ID | Test d'intégration | Résultat |
|---|---|---|
| SEC-01 | `applique les limites de taille et de débit WebSocket` | Réussi |
| BID-12 | `accepte un seul contre parmi deux commandes simultanées` | Réussi |
| NET-03 | `restaure une partie après redémarrage et déduplique une commande` | Réussi |
| NET-04 | `suspend et reprend une session après déconnexion` | Réussi |
| HB-01 | `HB-01 conserve un client sain pendant plusieurs ping/pong` | Réussi |
| HB-02 | `HB-02 expire un client silencieux puis reprend la session` | Réussi |
| HB-03 | `HB-03 ignore l'expiration tardive d'une connexion remplacée et nettoie` | Réussi |

## Interface de jeu — lot 6B

| WEB-6B-01 | Projection PlayerView : actions légales, main locale et confidentialité | Réussi |
| WEB-6B-02 | Table relative, cartes adverses masquées et main locale | Implémenté |
| WEB-6B-03 | Enchères et commandes de cartes via WebSocket | Implémenté |
| WEB-6B-04 | Plis, contrat et scores | Implémenté |
| WEB-6B-05 | Reconnexion pendant un pli | Validé par Playwright Chromium |
| WEB-6B-06 | GAME_COMPLETED à 2 000 points sur quatre clients | Validé par Playwright Chromium |
| WEB-6C-01 | Responsive Chromium : 375×667 à 1920×1080 | Validé ; captures inspectées |
| WEB-6C-02 | prefers-reduced-motion et animations non bloquantes | Validé par Playwright Chromium |
| WEB-6C-03 | Compatibilité WebKit sous Linux | Bloqué : binaire WebKit indisponible |
| WEB-6C-04 | Captures visuelles des écrans de jeu sur cinq résolutions | Validé par Playwright Chromium ; captures inspectées |
| WEB-6C-05 | WebKit Playwright 1.55.0 sous Fedora | Non exécuté : téléchargement de `webkit_ubuntu20.04_x64_special-2092` bloqué, binaire absent |
