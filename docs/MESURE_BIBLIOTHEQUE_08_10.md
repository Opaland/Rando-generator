# Une grosse bibliothèque, mesurée (issue #159)

Ce document ne dit pas s'il faut optimiser. Il établit les trois chiffres
que #159 demandait avant toute décision — temps d'import, quota IndexedDB,
poids de sauvegarde — pour une bibliothèque à l'échelle d'un vrai export
Strava ou Garmin.

Mesuré le 08/10 par `tests/e2e/mesure-bibliotheque.spec.ts`
(`npm run mesure`, et `MESURE_ACTIVITES=100 npm run mesure` pour le second
point), sur le build de production servi par `vite preview`. Chaque
activité synthétique porte 9 000 points (2,5 h de marche à un point par
seconde, la cadence par défaut d'une montre Garmin et de l'enregistrement
Strava).

## Les deux mesures

| activités | octets (archive zip) | temps d'import | ms / activité |
|---:|---:|---:|---:|
| 100 | 5 169 287 | **368 123 ms** (6,1 min) | 3 681 |
| 800 | 41 351 974 | **n'a pas fini en 25 min** (1 500 000 ms, le plafond du test) | ≥ 1 875 |

À 800 activités, le test a expiré sur son propre plafond — généreux
(25 minutes), posé pour ne jamais confondre la machine avec le code — sans
que l'import se termine. Extrapolé depuis la mesure à 100 (linéaire en
nombre d'activités, hypothèse la plus favorable) : **~49 minutes**. Une
seule mesure à 100 ne permet pas de distinguer un comportement linéaire
d'un comportement pire — mais même linéaire, ce chiffre est déjà au-delà de
ce qu'une personne attend d'un import.

### Ce que l'architecture écarte déjà

`deposerLeResultatDeLImport` (src/store/epilogueDImport.ts) ne recalcule le
matching **qu'une fois**, après que tous les fichiers d'un lot ont été
analysés — pas une fois par fichier. L'hypothèse la plus coûteuse (un
recalcul complet répété à chaque fichier, quadratique en nombre
d'activités) est donc déjà écartée par la lecture du code, avant la mesure.

### Ce qui reste à départager

Le temps se répartit entre l'analyse séquentielle des 800 fichiers (chacun
avec sa pause d'affichage, issue #149) et l'unique calcul de correspondance
final, qui traite alors 7,2 millions de points d'un coup. Cette mesure ne
dit pas dans quelle proportion — il faudrait chronométrer les deux phases
séparément pour trancher, ce qui n'a pas été fait ici.

## Les deux autres inconnues de #159

| | 100 activités | extrapolé à 800 | quota |
|---|---:|---:|---:|
| stockage utilisé | 11 418 574 o | ~91 MB | 992 607 441 o (~992 MB) — **9 % du quota, pas d'alerte** |
| sauvegarde (.json.gz) | 4 584 291 o | ~37 MB | — |

Sur ces deux points, le résultat est « tout va bien » au sens où #159
l'envisageait : la mesure vaut, elle ne trouve rien d'alarmant.

## Ce que ce document ne tranche pas

Pourquoi l'import est si lent par activité (3,7 s), et laquelle des deux
phases (analyse ou calcul de correspondance) domine. #159 demandait de
mesurer puis décider, dans cet ordre : la mesure est faite, et elle dit
qu'il y a quelque chose à investiguer — pas encore quoi corriger. Suite
ouverte dans une issue dédiée plutôt que devinée ici.
