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

## Corrigé le 08/09 — la piste retenue par Cédric, mesurée après coup

Cédric tranche : la recherche par lieu (déjà en tête du panneau depuis
#131) reste l'entrée principale, et la liste des 19 zones + 6 grands
itinéraires passe dans un conteneur à hauteur bornée (280 px,
`overflow-y: auto`) plutôt que de continuer à gonfler le panneau avec son
propre contenu.

| largeur | avant | après | part du viewport, avant → après |
|---|---:|---:|---|
| téléphone (390 px) | 1 124 px | **457 px** | 133 % → **54 %** |
| point de rupture (800 px) | 933 px | **457 px** | 104 % → **51 %** |
| PC (1280 px) | 1 124 px | **457 px** | 141 % → **57 %** |

Aux trois largeurs, le panneau tient désormais largement dans la hauteur
d'écran dès l'accueil — la carte et le reste de l'interface redeviennent
visibles sans défiler.

### Pourquoi une hauteur bornée plutôt qu'un second repli

Un `<details>` imbriqué (repli/dépli, comme le panneau lui-même) aurait
demandé un clic de plus pour atteindre n'importe quelle zone — contraire à
l'esprit de #131, qui a justement mis la recherche en tête pour éviter un
clic inutile. `overflow-y: auto` garde chaque zone à un seul geste : un
doigt ou une molette la révèle, sans ouvrir quoi que ce soit.

C'est aussi ce qui a évité une reprise coûteuse : plus de soixante-dix
fichiers e2e cliquent une zone par `data-testid` sans passer par un
déplié préalable. Un repli aurait cassé chacun d'eux ; le défilement
interne, lui, est transparent pour Playwright — il fait défiler le
conteneur avant de cliquer, exactement comme il le ferait pour la page
entière. Vérifié en rejouant la suite complète après le changement.

### Théo et Jeanine, spécifiquement

- **Théo** (gros texte, deux largeurs extrêmes) : les boutons ne
  rétrécissent pas — leur hauteur minimale (`--cible-mini`) est inchangée.
  En gros texte, moins de boutons tiennent dans les 280 px avant de
  défiler, ce qui est le comportement attendu : la liste s'adapte à la
  taille du texte plutôt que de l'écraser. `regles-d-ecran.spec.ts` couvre
  déjà « rien ne déborde en largeur » en gros texte sur l'état
  « zone chargée » ; aucun débordement nouveau après ce changement (suite
  complète rejouée).
- **Jeanine** (première ouverture qui s'explique, cibles sans précision) :
  rien à deviner — la liste est visible dès l'ouverture du panneau, pas
  derrière une bascule supplémentaire, et un bouton partiellement visible
  en bas du conteneur signale qu'il y en a d'autres, sans dépendre de la
  vue d'une barre de défilement. Les cibles elles-mêmes n'ont pas changé
  de taille ; ce point n'est donc ni amélioré ni dégradé par ce sprint.

Ce que ce document ne prétend toujours pas : que 280 px est LE bon nombre.
C'est un choix de présentation (§2), écrit avec sa raison — montrer
plusieurs zones à la fois sans faire dépendre le panneau de leur nombre —
et les pistes écartées (repli imbriqué, pas de plafond du tout).
