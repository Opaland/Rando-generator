# La vague complète, une fois, et ce qu'elle dit du raccourci

Le 02/09, `npm run mutation` a tourné pour la première fois sur son périmètre
complet — jusque-là, un budget de chronomètre mal nommé le faisait échouer au
galop d'essai avant le premier mutant (#475). Une fois le blocage levé :
**72 minutes, 99 fichiers, 8 994 mutants.**

Ce document existe pour que la prochaine personne qui écrit « le score de
mutation est de X % » ait un endroit où vérifier de quel X elle parle, plutôt
que de recopier un chiffre d'une conversation qui a disparu (#448).

## Pourquoi deux chiffres, et pas un

Stryker en rend deux, et les confondre serait le défaut même que #448
dénonçait :

- **81,73 %** ne juge que le code **couvert** par au moins un test ;
- **78,92 %** compte aussi les mutants **sans aucune couverture** comme non
  détectés.

Le second est le plus honnête des deux : un mutant jamais exécuté n'est pas
« à la limite », il est simplement absent de toute vérification.

## Le score, par domaine

| domaine | fichiers | mutants | tués | survivants | sans couverture | score (couvert) |
|---|---:|---:|---:|---:|---:|---:|
| `src/core` | 69 | 6 962 | 5 633 | 1 223 | 106 | **82,16 %** |
| `src/store` | 17 | 1 415 | 1 008 | 239 | 167 | **80,83 %** |
| `src/db` | 1 | 51 | 42 | 8 | 1 | 84,00 % |
| `src/lib` | 12 | 566 | 414 | 116 | 36 | 78,11 % |
| **total** | **99** | **8 994** | **7 097** | **1 586** | **310** | **81,73 %** (78,92 % tous mutants) |

L'hypothèse de #448 — « `src/core` est probablement le domaine le mieux tenu »
— est vraie, mais de peu : 82,16 % contre 80,83 % pour le magasin, un écart
d'1,3 point. Les quatre domaines tiennent dans 6 points. Le raccourci
« 80,13 % sur le magasin » qui circulait avant cette vague n'était donc pas
trompeur sur le fond — mais rien ne le garantissait avant de mesurer, et un
chiffre juste par accident n'est pas un chiffre qu'on peut citer.

## Ce que le total cachait : 310 mutants sans aucune couverture

| fichier | sans couverture |
|---|---:|
| `src/store/appStore.ts` | 138 (traité par #480/#482) |
| `src/core/journalSortant.ts` | 18 |
| `src/lib/ecran.ts` | 18 |
| `src/lib/summaryCard.ts` | 16 (traité par #478) |
| `src/core/fit.ts` | 14 |
| `src/store/trancheTrace.ts` | 14 |
| 34 autres fichiers | 92 |

Deux scores bas se sont révélés, à la lecture, ne rien dire d'un manque :
`src/lib/networkDisplay.ts` (43,90 %, traité par #485) portait une vraie
lacune sur ses libellés, mais `src/core/intention.ts` (47,98 % apparent) est
à 77,12 % une fois `MOTS_DE_LIAISON` — un `Set` de 79 mots de liaison —
retiré du calcul : le §6bis prévenait déjà qu'une table de traduction produit
des survivants sans intérêt, et le premier passage sur ce fichier avait cité
le chiffre brut sans appliquer sa propre règle.

**La leçon vaut pour le score par fichier autant que par domaine : un chiffre
bas ne se cite pas sans avoir ouvert le fichier.**

## Ce qu'on cite désormais

1. Un chiffre de vague **porte toujours son périmètre**, y compris quand
   c'est le périmètre complet — « 80,8 % sur `src/store` », jamais « 80,8 %
   de couverture de mutation » tout court ;
2. le chiffre du périmètre complet se rafraîchit quand quelqu'un a le temps
   d'une vague complète (environ une heure), pas entre deux lots. La vague
   ciblée (`npm run mutation` sur le motif du jour) reste l'outil courant
   après un module neuf — voir la skill `vague-mutation`.

## Ce qu'on ne prétend pas

Que 81,73 % soit bon ou mauvais dans l'absolu. Les 1 586 survivants n'ont pas
tous été lus ; une partie est certainement équivalente, au sens où la skill
`vague-mutation` l'entend. Ce document établit un état des lieux daté, pas un
verdict — et il se périmera au prochain gros lot, comme tous les chiffres de
ce genre.
