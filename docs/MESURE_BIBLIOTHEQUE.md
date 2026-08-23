# Une grosse bibliothèque, mesurée (issue #159)

**Fait le 23/08/2026.** Trois nombres étaient inconnus ; ils ne le sont plus.
Ce document dit ce qui a été mesuré, sur quoi, et ce que j'en conclus — pas
ce qu'il faudrait optimiser, puisque la réponse est « rien, pour l'instant ».

## Ce qui a été importé

- **800 activités**, une archive ZIP de **41,4 Mo** ;
- **9 000 points par activité**, soit 2 h 30 de marche à un point par
  seconde — la cadence par défaut des montres Garmin et de l'enregistrement
  Strava. Le nombre vient de cette durée, pas d'un chiffre rond ;
- **7,2 millions de points** au total.

Reproductible : `npm run mesure`. Hors de la porte, comme le monkey — cette
mesure prend deux minutes, la porte tourne à chaque commit.

## Les trois nombres

| Ce qui était inconnu | Mesuré |
|---|---|
| Temps d'import total | **94,7 s** |
| Stockage IndexedDB occupé | **91,2 Mo**, sur un quota de **1 010 Mo** (9 %) |
| Poids de la sauvegarde | **36,7 Mo**, produite en **6,4 s** |

Et ce qui n'a pas eu lieu :

- **aucune trace perdue** — 800 déposées, 800 affichées, 800 en base ;
- **aucun échec de quota.** Le chemin « la trace reste en mémoire pour cette
  session », que personne n'avait vu s'exécuter, n'a pas été emprunté : il
  reste non éprouvé en conditions réelles, et c'est à dire plutôt qu'à taire.

## Ce que j'en conclus

**Rien à optimiser aujourd'hui.** L'issue prévenait : optimiser avant de
mesurer serait une régression de méthode — le Web Worker de parsing avait
déjà été écarté sur mesure. Les chiffres ne le rappellent pas à l'ordre.

Une minute trente-cinq pour huit cents activités est long, mais c'est un
geste qu'on fait **une fois**, à l'arrivée sur le produit, et l'avancement
est annoncé fichier par fichier. Le comparer à un import instantané n'a pas
de sens ; le comparer à ne rien voir pendant une minute et demie, si — et ce
n'est pas ce qui se passe.

## Ce que la mesure a fait apparaître, et qui n'était pas dans l'issue

**La sauvegarde pèse 36,7 Mo, presque autant que l'archive d'origine.** Elle
est produite en mémoire, en un seul bloc, et rien n'annonce ce poids avant de
cliquer. C'est la même question que le bouton « Emporter cette randonnée »
(#153) : un téléchargement dont on ne sait rien avant de le lancer.

La différence est qu'ici, **la mesure existe**. Le poids se déduit du nombre
de points : 36,7 Mo pour 7,2 millions, soit ~5,1 octets par point après
gzip. De quoi annoncer un ordre de grandeur avant de cliquer, sans rien
inventer. À faire, si quelqu'un le juge utile.

## Ce que cette mesure ne dit pas

- elle a tourné sur cette machine, en préversion locale : un téléphone est
  plus lent, et le rapport n'est pas connu ;
- les huit cents activités sont **synthétiques**. Elles ont la densité d'une
  vraie montre, mais pas ses irrégularités — pauses, pertes de fix, points
  aberrants. Une vraie archive Strava reste à passer ;
- le quota n'a pas été atteint : ce que fait l'application quand il l'est
  reste théorique.

## Un piège rencontré en la construisant

La première version de la fixture écrivait `index % 40` pour la latitude :
les huit cents fichiers ne portaient que **quarante tracés distincts**, et
l'import n'en gardait que quarante — correctement, puisque le reste était des
doublons. Le relevé disait « 800 entrent, 40 arrivent », ce qui ressemblait
beaucoup à une perte silencieuse.

C'était la fixture qui était fausse. Une mesure mal construite ne rend pas un
chiffre douteux : elle rend un chiffre faux, l'air parfaitement sûr de lui.
