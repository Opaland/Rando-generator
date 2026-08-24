# Dix sprints — nuit du 24 au 25/08

Demandé par Cédric : dix sprints, exécutés d'affilée, avec **une revue de
persona entre chaque** et une **revue globale** à la fin.

Les dix ne sortent pas d'un chapeau. Huit viennent du backlog ouvert, deux
des questions que Cédric a posées le 24/08 au soir (Pilat, Club Vosgien,
villages). Chacun ferme au moins une issue et se juge sur ce qu'un persona
donné arrive — ou n'arrive pas — à faire après.

## La règle du jeu

Un sprint n'est réputé fini que si :

1. la porte complète est verte **avant** le commit — `lint`, `tsc -b
   --noEmit`, `coverage`, `build`, `e2e --workers=1`, `monkey` ;
2. tout test ajouté après coup a été vu **rouge sans son correctif**
   (CLAUDE.md §1) ;
3. la revue de persona qui suit est écrite ici, avec ce qui bloque encore.

Une revue de persona n'est pas un satisfecit. Elle cherche ce que la
personne ne peut toujours pas faire.

## Le plan

| # | Sprint | Ferme | Persona qui juge |
|---|---|---|---|
| 1 | « PR » n'est plus une corbeille | #284 | Sylvie, Marc |
| 2 | Le balisage tel qu'il est peint sur l'arbre | #286 | Anne-Marie *(nouvelle)*, Marc |
| 3 | Ce qu'il y a au village | #285 | Camille, Bernard |
| 4 | Le terrain décide qui peut y aller | #179 | Nadia *(nouvelle)*, Bernard |
| 5 | Filtrer par ce qu'il y a sur le chemin | #156 | Sylvie |
| 6 | Cent sorties restent lisibles | #175 | Karim |
| 7 | Prévenir quand on quitte le parcours | #154 | Camille |
| 8 | Troisième tranche du store | #155 | Bernard *(vieux téléphone)* |
| 9 | Le poids de la carte | #93 | Sylvie *(4G en fond de vallée)* |
| 10 | La confidentialité se voit, pas seulement s'écrit | #178 | Léa, Bernard |

Puis **revue globale** : l'application, pas les diffs.

## Ce que je ne promets pas

Dix sprints, c'est une nuit optimiste. L'ordre est celui-ci parce que les
quatre premiers répondent à des questions posées, et que les six suivants
sont classés du plus visible au plus technique. Si la nuit s'arrête au
sixième, ce sera écrit ici — je ne rétrécirai pas un sprint pour pouvoir en
cocher dix.

---

## Sprint 1 — « PR » n'est plus une corbeille

**Ferme #284.** `classifyNetwork` renvoyait `PR` pour tout ce qui n'était ni
`nwn`, ni `rwn`, ni `lwn`, ni préfixé « GR ». À côté, `About.tsx` expliquait
que le jaune veut dire « Promenade et Randonnée », marque FFRandonnée. Un
tracé qu'un particulier a saisi pour lui ressortait donc comme un circuit
balisé officiel.

*(La revue de persona est écrite après l'exécution, plus bas.)*
