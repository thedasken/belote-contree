# Règlement métier exécutable — Belote Contrée v1.0

Ce texte est normatif pour notre application. Toute divergence avec une publication fédérale mentionnée ici est une **variante choisie**. Ne pas substituer les règles de la coinche à celles de la contrée.

Référence : https://www.ffbelote.org/belote-contree/

## 1. Table, cartes et distribution

- Quatre places `0=SUD`, `1=EST`, `2=NORD`, `3=OUEST`. Équipe A : 0 et 2 ; équipe B : 1 et 3.
- L'ordre de tour adopté pour ce projet est `0→1→2→3→0`, *convention logicielle correspondant au joueur à droite dans notre schéma de places*. Le premier donneur est tiré au sort ; la première enchère et l'entame reviennent à la place suivante (`dealer+1 modulo 4`). Le donneur tourne d'une place à chaque redistribution.
- 32 cartes uniques ; couleurs Pique, Cœur, Carreau, Trèfle ; rangs 7, 8, 9, Valet, Dame, Roi, 10, As. Mélange sécurisé en production ; distribution déterministe injectable pour les tests, huit cartes par place.

## 2. Atouts, rangs et valeur des cartes

| Rang décroissant atout | J | 9 | A | 10 | K | Q | 8 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Points | 20 | 14 | 11 | 10 | 4 | 3 | 0 | 0 |

| Rang décroissant hors atout | A | 10 | K | Q | J | 9 | 8 | 7 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Points | 11 | 10 | 4 | 3 | 2 | 0 | 0 | 0 |

Total des valeurs des cartes : 152. Le huitième pli reçoit le dix de der (+10), soit 162 points ordinaires au total. Si un même camp remporte les huit plis, la convention de capot remplace le bonus final de +10 par +100 : total des plis et bonus = 252.

## 3. Enchères

- Enchères numériques permises : 80, 90, 100, 110, 120, 130, 140, 150, 160, associées à l'une des quatre couleurs.
- `Capot` peut être annoncé avec une couleur d'atout et dépasse toute enchère numérique ; il exige les huit plis.
- Une enchère doit strictement dépasser la précédente. Passer est autorisé à son tour. Trois passes consécutives après une enchère concluent les enchères. Quatre passes initiales annulent la donne : aucun score, rotation du donneur et redistribution.
- Contre **hors tour** autorisé par n'importe lequel des deux défenseurs tant que les enchères sont ouvertes et qu'un contrat existe. Le premier contre valide clôt immédiatement les enchères numériques ; il ne peut plus y avoir de surenchère.
- Après contre : phase `SURCOINCHE_WINDOW` sans minuterie. Les deux places de l'équipe preneuse peuvent chacune `SURCOINCHE` ou `DECLINE_SURCOINCHE`, dans n'importe quel ordre. Le premier surcontre valide clôt la fenêtre immédiatement ; sinon elle se clôt après deux renoncements distincts. Les autres actions d'enchère sont refusées.
- Les commandes d'un salon sont ordonnées et atomiques : la première commande valide l'emporte si plusieurs contres arrivent simultanément.

## 4. Cartes légalement jouables

1. L'entame peut jouer n'importe quelle carte de sa main.
2. Si le joueur possède la couleur demandée, il doit la fournir. Si la couleur demandée est l'atout et qu'il peut monter au-dessus du meilleur atout du pli, il doit monter ; sinon tout atout de sa main est permis.
3. S'il n'a pas la couleur demandée et que son partenaire est actuellement maître, il peut jouer n'importe quelle carte.
4. Sinon, s'il possède de l'atout, il doit couper. Si un adversaire tient déjà le pli avec de l'atout, il doit surcouper s'il peut ; si aucun atout de sa main ne permet de surcouper, il peut se défausser de n'importe quelle carte (y compris d'un atout inférieur).
5. S'il ne possède ni la couleur demandée ni d'atout, il peut jouer n'importe quelle carte.
6. Le pli revient au plus fort atout joué, sinon à la plus forte carte de la couleur demandée. Le vainqueur entame le pli suivant. Une carte retirée d'une main ne peut plus être jouée.

## 5. Belote-rebelote — variante choisie

- Le détenteur des deux cartes `K` et `Q` d'atout possède une belote potentielle. À la première jouée, le moteur émet `BELOTE_DECLARED` ; à la seconde, `REBELOTE_DECLARED`, puis valide un bonus unique de 20 points pour son équipe.
- Ce bonus est **toujours imprenable**, notamment en cas de contrat chuté, de contre ou de capot subi. Aucun transfert du bonus à l'adversaire.
- La belote compte pour atteindre le seuil d'un contrat numérique : `pointsPlisEtDernierPliPreneurs + bonusBelotePreneurs >= contrat`.
- Un bonus de belote n'est ajouté **qu'une fois** à la marque finale. Dans les contrats normaux réussis, il est inclus dans le total arrondi des points faits ; en cas de chute, contre ou capot forfaitaire, il est ajouté séparément au score forfaitaire de son propriétaire.
- Contrat numérique réussi : `scorePreneurs = arrondiDizaine(pointsFaitsPreneurs + belotePreneurs + contrat)` ; `scoreDefense = arrondiDizaine(pointsFaitsDefense + beloteDefense)`.
- Contrat numérique chuté : `scorePreneurs = belotePreneurs` ; `scoreDefense = 160 + contrat + beloteDefense`. La belote preneuse n'est jamais transférée.
- Contrat numérique contré/surcontré : `forfait = (160 + contrat) × multiplicateur`, multiplicateur `2` pour contre, `4` pour surcontre. Le camp remportant le contrat reçoit le forfait ; chaque équipe ajoute **sa propre** belote si elle en détient une. Aucun cumul additionnel des points des plis dans ces scores forfaitaires.
- Capot annoncé : forfait gagnant `500` (non contré), `1000` (contré) ou `2000` (surcontré) ; l'autre camp marque 0 avant bonus de belote. Le camp qui réalise les huit plis remporte le capot demandé ; sinon l'équipe adverse reçoit le forfait. Chaque équipe conserve son éventuelle belote.
- Capot non demandé pendant un contrat numérique non contré : le camp ayant réalisé les huit plis reçoit `250 + valeurContrat`, et chaque camp conserve son propre bonus belote. Une occurrence de capot non demandé dans un contrat contré/surcontré utilise **le forfait contré/surcontré**, sans ajouter en plus le bonus `250+contrat`.

### Arrondi

Arrondi arithmétique à la dizaine la plus proche, 5 vers la dizaine supérieure : `round10(n) = floor((n+5)/10)*10`. Vérifier le contrat sur les points non arrondis. La belote forfaitaire imprenable est ajoutée après le forfait, sans arrondi supplémentaire.

### Ambiguïtés neutralisées

- Le bonus belote d'une équipe qui perd est conservé, même si l'adversaire réalise un capot ou gagne un contrat contré.
- Si la belote permet d'atteindre un contrat numérique, celui-ci est réussi même si la défense a davantage de points bruts ; c'est la règle de réussite explicitement choisie pour la contrée.
- Le score de la défense sur un contrat normal réussi ne comprend pas la valeur du contrat.

## 6. Fin de partie

- Score de départ 0–0, objectif 2000.
- Ne jamais interrompre une donne en cours, même si un événement intermédiaire semble franchir 2000 : calculer d'abord le résultat complet après huit plis.
- Dès qu'au moins une équipe a atteint 2000 **après la donne**, la partie s'arrête. Si les deux ont atteint 2000, le score final le plus élevé l'emporte.
- **Hypothèse de sûreté en cas d'égalité exacte au seuil** : aucune victoire n'est déclarée ; jouer une donne de départage. Cette exception n'est pas encore une décision explicite de l'utilisateur et reste signalée dans `decisions.md`.

## 7. Donne annulée et reconnexion

- Quatre passes avant toute enchère => donne annulée, aucun résultat ni point, rotation du donneur.
- La déconnexion d'un humain suspend la session réseau sans modifier le statut métier de la donne. Reprise au même tour et avec les mêmes mains si le salon reste actif.
