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

## Ce que ce document ne tranche pas (08/10)

Pourquoi l'import est si lent par activité (3,7 s), et laquelle des deux
phases (analyse ou calcul de correspondance) domine. #159 demandait de
mesurer puis décider, dans cet ordre : la mesure est faite, et elle dit
qu'il y a quelque chose à investiguer — pas encore quoi corriger. Suite
ouverte dans une issue dédiée plutôt que devinée ici.

## Mise à jour du 16/10 — #539, la répartition, et l'hypothèse linéaire qui ne tient pas

Trois points de mesure supplémentaires, avec le détail du calcul de
correspondance posé en #539 (`performance.mark` autour de `recompute()`,
`appStore.ts`), tous mesurés sur ce même environnement.

| activités | temps d'import | analyse | correspondance | ms / activité |
|---:|---:|---:|---:|---:|
| 20 | 13 758 ms | 2 591 ms (19 %) | 10 614 ms (77 %) | 688 |
| 100 (08/10) | 368 123 ms | — (pas instrumenté alors) | — | 3 681 |
| 200 | ≥ 1 200 000 ms (n'a pas fini en 20 min) | — | — | ≥ 6 000 |
| 400 | ≥ 1 500 000 ms (n'a pas fini en 25 min, le plafond du test) | — | — | ≥ 3 750 |

À 20 activités, le calcul de correspondance domine déjà largement — 77 %
du temps, contre 19 % pour l'analyse séquentielle. Ça répond à la question
que #539 laissait ouverte. Ce n'est pas la partie la plus importante de
cette mise à jour.

### L'hypothèse linéaire ne tient pas face aux quatre points

#539 extrapolait un comportement linéaire depuis la seule mesure à 100
activités, et prévoyait ~49 minutes à 800. Le ms/activité **devrait rester
constant** si c'était vrai. Il ne l'est pas : 688 à 20 activités, 3 681 à
100 — un facteur 5,3 pour un facteur 5 d'activités, la signature d'une
croissance **quadratique**, pas linéaire, en nombre d'activités.

| activités | mesuré | prédit (linéaire, ancre 100) | prédit (quadratique, ancre 100) |
|---:|---:|---:|---:|
| 20 | 13 758 ms | 73 625 ms | 14 725 ms |
| 200 | ≥ 1 200 000 ms (n'a pas fini) | 736 246 ms (12,3 min) | 1 472 492 ms (24,5 min) |
| 400 | ≥ 1 500 000 ms (n'a pas fini) | 1 472 492 ms (24,5 min) | 5 889 968 ms (98,2 min) |

Le quadratique colle au point de 20 activités (14 725 ms prédits contre
13 758 mesurés, 7 % d'écart) et explique pourquoi 200 activités ne finit
pas en 20 minutes, alors que le linéaire prédisait 12,3 minutes.
**Ceci reste un ajustement sur quatre points, pas une preuve** : un
cinquième point (50 activités, par exemple) le confirmerait sans
attendre un plafond — non fait ici, cette seule mise à jour ayant déjà
coûté près d'une heure de calcul en arrière-plan.

### Une cause plausible, et ce qu'elle laisse en suspens

`buildTrackIndex` (`src/core/matching.ts`) range les segments de trace
dans une grille de cellules de 0,0015° (~167 m en latitude, logique posée
par #170). La fixture de ce banc (`gpxActivite`,
`tests/e2e/mesure-bibliotheque.spec.ts`) décale chaque activité d'environ
**un mètre** de latitude par rapport à la précédente, pour rester
distinctes sans être des doublons (§1bis de CLAUDE.md le rappelle : un
point trouvé en écrivant la fixture, pas en la lisant après coup) — cent
activités tiennent donc dans une bande de 100 m, plus étroite qu'une
seule cellule.

Si c'est la cause : les segments de centaines d'activités s'accumulent
dans les **mêmes** cellules, et chaque requête de correspondance
(`distanceToTrack`) balaie un panier qui grossit avec le nombre
d'activités plutôt que de rester borné — exactement ce que le hachage
spatial est censé éviter.

**Ce que cette mesure ne permet pas de trancher** : si une vraie
bibliothèque de 800 sorties réelles — dispersées sur des dizaines de
sentiers, parfois à des kilomètres les unes des autres plutôt qu'à un
mètre — se comporterait aussi mal. Le chiffre « quadratique » mesuré ici
dit quelque chose sur ce banc ; pas forcément sur un usage réel.

### Ce qu'il faudrait pour trancher, non fait ici

1. Un point à 50 activités, pour confirmer ou infirmer l'ajustement
   quadratique sans attendre un plafond.
2. Une variante de `gpxActivite` qui disperse les activités sur une vraie
   étendue géographique plutôt que de les empiler à un mètre les unes des
   autres — pour savoir si le ralentissement vient de la densité du jeu
   de données ou de l'algorithme lui-même.
3. Si (2) confirme un comportement quadratique sur une donnée dispersée :
   mesurer la taille des paniers de `TrackIndex` pendant un import réel,
   avant de choisir un correctif.

Aucune des trois n'est faite ici. La mesure en main inverse déjà la
conclusion du 08/10 — de « c'est lent, linéairement » à « c'est peut-être
bien plus grave, sur un banc dont la donnée est elle-même suspecte » —
et c'est une raison de s'arrêter avant d'inventer un correctif, pas après
(§2 de CLAUDE.md).

## Résolu le 17/10 : ce n'était pas l'espace, c'était le temps qui reculait

Les trois points laissés en suspens ont été faits. Dans l'ordre, ce qu'ils
ont montré — et le détour qu'il a fallu pour y arriver.

### 1. La dispersion géographique ne change rien

`gpxActivite` dispose désormais d'un `MESURE_ESPACEMENT_M` (défaut : 1 m,
inchangé pour rester comparable aux mesures précédentes). Rejoué à 100
activités espacées de 5 000 m plutôt que de 1 m — toujours avec
l'horodatage cassé d'alors — : **268 261 ms** de correspondance, contre
**368 123 ms** au total le 08/10 pour la même taille en dense. Aucune
amélioration qui justifierait l'hypothèse du hachage spatial saturé.
**L'espace n'est pas la cause.**

### 2. Le vrai coupable : un temps qui recule, pas une cellule qui sature

`windowedSpeedMps` (`src/core/matching.ts`) cherche, pour chaque segment,
une fenêtre de ±60 s autour de lui en balayant les points voisins — et ne
s'arrête que lorsque l'écart de temps **dépasse** cette fenêtre. Un temps
qui recule donne un écart **négatif**, qui ne dépasse jamais rien : la
recherche ne s'arrête plus, et balaie tout ce qui précède.

La fixture faisait reculer le temps de deux façons, découvertes et
corrigées l'une après l'autre :

1. **Dans l'écriture à la main de l'horodatage** : l'heure était figée à
   `08`, la minute calculée par `% 60` — pour une activité de 9 000 s
   (2,5 h), le temps repartait de `08:00:00` deux fois par activité.
   Corrigé en calculant l'horodatage depuis un vrai `Date`.
2. **Insuffisant, et ça n'a été vu qu'à la mesure suivante** : chaque
   activité repartait du **même** instant de départ. Une fois toutes les
   activités mises bout à bout (`tracks.flatMap((t) => t.points)` dans
   `recompute()`, `appStore.ts`), le temps reculait quand même — à la
   frontière entre deux activités plutôt qu'au milieu d'une seule.
   Reproduit en mémoire avec cette seule correction manquante : **81 875 ms**
   (50 activités) et **342 734 ms** (100), quasiment identique qu'on
   disperse les activités dans l'espace ou pas (83 949 ms et 347 650 ms) —
   la même signature quadratique, pour la même raison que le point 1 ci-
   dessus, une deuxième fois. C'est le §4 retourné contre moi : une
   correction qui ne tient qu'à un endroit, le vrai problème (un temps qui
   recule) revenait par un autre chemin.

Chaque activité démarre maintenant un jour après la précédente, comme le
ferait une vraie bibliothèque où deux sorties ne partagent jamais leur
horodatage. Reproduit en mémoire, avec les deux corrections : coût
**linéaire** en nombre d'activités — 1 220 ms, 3 163 ms, 6 599 ms à 20, 50,
100 activités.

### 3. La mesure réelle, enfin

`MESURE_ACTIVITES=200 npm run mesure`, sur le même environnement que les
mesures qui n'avaient pas fini en 20 puis 25 minutes :

| | avant (17/10, correctif encore incomplet) | après (deux correctifs) |
|---|---:|---:|
| import total | ≥ 1 200 000 ms (n'a pas fini) | **34 656 ms** |
| dont correspondance | ≥ 1 008 324 ms | **10 669 ms** |

Un facteur **~95** sur la correspondance, à taille égale. Le fichier entier
(archive, import, sauvegarde) tourne maintenant en moins d'une minute à
200 activités, contre un plafond de 20 à 25 minutes dépassé auparavant.

### Ce que ce résultat ne tranche pas

Une vraie trace réelle peut-elle présenter un horodatage non monotone —
une pause GPS qui fait sauter l'appareil en mode économie puis revenir, un
changement d'heure d'été/hiver mal géré par un firmware, deux fichiers
importés dans le désordre ? Si oui, `windowedSpeedMps` retomberait dans le
même piège sur une vraie bibliothèque, pas seulement sur ce banc. Cette
question reste ouverte : aucune mesure ici ne porte sur des exports réels,
et la trancher demanderait de regarder des traces réelles plutôt que d'en
décider depuis ce fichier (§2 de CLAUDE.md). Si la réponse est oui,
`windowedSpeedMps` gagnerait à borner son balayage par un nombre de points
plutôt que par un seul test d'écart — mais ce serait un correctif sur une
hypothèse non mesurée, pas fait ici.

> **Dépassé le 18/10** (commit `8e7e8e7`). Le balayage s'arrête maintenant
> aussi dès que le temps recule (`tPrev > tB`, `tNext < tA`) : un
> horodatage non monotone, quelle qu'en soit la cause, ne relance plus le
> balayage jusqu'au bord du tableau. La garde est
> `tests/unit/matching.perf.test.ts` (320 activités qui repartent toutes de
> l'instant 0 : 519 ms avant, 46 ms après). Ce qui reste vrai : aucun export
> réel n'a été regardé, donc on ne sait pas si le cas se présente — mais il
> ne coûte plus rien s'il se présente.

## Les 800 activités, enfin — 18/10

La taille qui avait ouvert #539, et que le test n'avait jamais pu finir dans
son plafond de 25 minutes. `MESURE_ACTIVITES=800 npm run mesure`, même banc,
après `8e7e8e7` :

| activités | import_ms | analyse_ms | correspondance_ms | ms/activité |
|---:|---:|---:|---:|---:|
| 200 (17/10) | 34 656 | — | 10 669 | 173 |
| **800** | **155 846** | **96 429** | **50 997** | **195** |

Le reste de la mesure : 800 traces affichées et 800 en base ; stockage
100 478 158 octets sur un quota de 901 913 257 (11 %) ; sauvegarde de
36 350 751 octets en 7 257 ms.

Ce que ces deux points disent, et rien de plus : pour quatre fois plus
d'activités, l'import coûte 4,5 fois plus et la correspondance 4,8 fois —
proche du linéaire, un peu au-dessus. Deux points ne suffisent pas à
nommer une courbe ; ils suffisent à dire que les « plusieurs heures » de
l'ajustement quadratique du 16/10 ne se produisent pas.

**L'ordre des phases s'est inversé.** À 800 activités, l'analyse des
fichiers (62 %) pèse maintenant presque le double de la correspondance
(33 %). Si l'import doit encore gagner, c'est là — et l'issue disait déjà
qu'un Web Worker pour l'analyse demande sa propre mesure avant d'être
décidé. Deux minutes et demie pour huit cents sorties, avec une barre
d'avancement par fichier (#149), n'en appellent pas d'urgence.
