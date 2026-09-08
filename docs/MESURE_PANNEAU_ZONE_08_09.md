# Ce que le panneau de zone occupe à l'écran, mesuré (issue #504)

Ce document ne tranche pas entre les trois pistes de #504 (géolocalisation,
recherche, arbre de décision) — c'est une décision de produit, réservée à
Cédric. Il établit ce que l'issue range « sans arbitrage » : ce que le
panneau ouvert occupe réellement, au premier chargement, avant qu'on ait
chargé la moindre zone.

Mesuré le 08/09 par `tests/e2e/mesure-panneau-zone.spec.ts` (`npm run
panneau`), sur le build de production.

## Les chiffres

| largeur | hauteur du panneau | part du viewport | zones visibles sans défiler |
|---|---:|---:|---:|
| téléphone (390 px) | 1 124 px | **133 %** | 6 / 25 |
| point de rupture (800 px) | 933 px | **104 %** | 14 / 25 |
| PC (1280 px) | 1 124 px | **141 %** | 19 / 25 |

25 boutons de zone au total (19 zones + 6 grands itinéraires), conforme au
compte de l'issue.

## Ce que ça dit

**Aux trois largeurs, le panneau dépasse déjà la hauteur d'écran avant
d'avoir chargé quoi que ce soit.** Personne n'a besoin d'ouvrir 19
départements pour que « lourd » soit vrai : le panneau seul, dans son état
le plus simple, ne tient déjà pas dans un écran de téléphone ni de PC.

**Sur téléphone, moins d'un quart des zones est atteignable sans faire
défiler** (6/25). C'est l'écran où l'issue situe Jeanine et Théo — ceux qui
ne savent pas dans quel département ils marchent, et qui verraient la
recherche par lieu (déjà en tête du panneau) avant même la première liste.

**Le point de rupture (800 px) est la largeur la moins mauvaise** (104 %,
14/25) — pas parce que le panneau y est plus court en absolu (933 px contre
1 124 aux deux autres), mais parce que la mise en page y gagne en largeur
utile sans perdre la disposition compacte du téléphone.

## Ce que ça ne dit pas

Le classement entre les trois pistes de l'issue, ni si 104 % ou 133 % est
« trop ». Ces chiffres montrent l'ampleur du problème que Cédric décrit —
il est réel, mesurable, et présent dès l'accueil — sans dire laquelle des
trois pistes le résout le mieux : cette question demande de montrer l'écran
à Zoé, Théo et Jeanine (§10), pas une mesure de plus.
