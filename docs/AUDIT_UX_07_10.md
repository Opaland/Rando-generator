# Mesure du panneau de zone — 07/10/2026

Issue #504. Cédric trouve le panneau de sélection de zone « assez lourd » et
propose trois pistes (géolocalisation, recherche, arbre de décision). Ces
trois pistes ne se départagent pas depuis un fichier — l'issue le dit
elle-même : « c'est une question qui demande une personne », à trancher en
regardant Zoé, Théo et Jeanine essayer. Ce document ne tranche rien ; il
pose les seuls chiffres qui se mesurent sans arbitrage, pour que « lourde »
ne reste pas un adjectif.

## Méthode

`page.getByTestId('zone-section')`, ouvert par défaut au premier lancement
(aucune zone chargée), mesuré aux quatre largeurs déjà utilisées par
`tests/e2e/regles-d-ecran.spec.ts`.

## Résultat

| largeur | hauteur fenêtre | hauteur du panneau | part de l'écran | lignes totales | lignes visibles sans défiler |
|---|---:|---:|---:|---:|---:|
| téléphone (390) | 844 px | 457 px | 54 % | 26 | **6** |
| point de rupture (800) | 900 px | 457 px | 51 % | 26 | 14 |
| tablette paysage (1024) | 768 px | 457 px | 60 % | 26 | 6 |
| PC (1280) | 800 px | 457 px | 57 % | 26 | 10 |

La hauteur du panneau ne change pas avec la largeur (457 px partout) : ce
qui bouge est la part qu'elle occupe, parce que la hauteur de fenêtre, elle,
varie.

26 lignes confirme, indépendamment, le compte de l'issue (19 zones +
6 itinéraires mis en avant = 25 ; l'écart d'une ligne vient probablement
d'un bouton de la section non compté dans cette estimation manuelle — à
vérifier si ce chiffre sert de référence ailleurs).

## Ce que ça dit, sans trancher

Sur un téléphone — le cas le plus fréquent — **6 lignes sur 26 sont
visibles sans faire défiler**, et le panneau occupe plus de la moitié de
l'écran. La « centaine de lignes » que Cédric projette pour une couverture
nationale n'existe pas encore (25-26 aujourd'hui, #504 le note déjà), mais
le défilement est déjà le mode normal de lecture de cette liste, pas
l'exception.

## Ce que ce document ne tranche pas

Lequel des trois chemins de l'issue — géolocalisation, recherche, arbre de
décision — adresse ce défilement sans en créer un autre. Nécessite une
session utilisateur (skill `audit-ui`), pas une mesure de plus.
