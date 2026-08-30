---
name: vague-mutation
description: Lancer une vague de tests de mutation sur Sentiers et la lire — quels survivants comptent, lesquels sont équivalents, et ce qu'un survivant dit du test plutôt que du code. À lancer après un module neuf, jamais à chaque commit.
---

# Une vague de mutation

`npm run mutation` casse le code exprès et regarde si les tests s'en
aperçoivent. **Ce n'est pas une porte** : trop lent pour chaque commit, et un
survivant n'est pas toujours un défaut. C'est une vague à lancer après un
module neuf, et surtout à *lire*.

## Lancer

```bash
npm run mutation          # ciblage dans stryker.config.mjs
```

Cibler les modules du lot, pas tout `src/core` — une vague de sept modules
tient en un quart d'heure, la totalité non.

## Les deux chiffres, et pourquoi le second seul compte

| Vague | Score | Survivants | Dont un résultat changé |
|---|---|---|---|
| 1 (7 modules) | 78 % | — | 2 |
| 2 (7 modules, 23/08) | 83,9 % | 111 | 11 |

Cent onze survivants, onze qui comptent. **Le score n'est pas l'objet.** Une
table de traduction produit des dizaines de survivants sans intérêt ; un seuil
de présentation aussi. Chasser le score conduit à écrire des tests qui
verrouillent des libellés.

Ce qu'on cherche : **les survivants qui changent un résultat.** Une
soustraction devenue addition dans un calcul de pente. Une fusion de bandes
qui pouvait finir avant de commencer. Aucune des deux n'était visible en
relisant.

## Trois choses qu'un survivant peut vouloir dire

**Le code est mal testé.** Le cas ordinaire, et le plus facile : écrire le
test qui distingue, en vérifiant qu'il échoue sur le mutant.

**Mon test ne pouvait pas échouer.** Le survivant `fin + 0` / `fin − 0` :
l'assertion portait sur l'étape 1, dont le départ est zéro. La skill `sonde`
dit de retirer le correctif ; ici l'outil l'a fait à ma place, et il a eu
raison contre moi.

**Le test ne va pas là où je crois.** Deux mutants ont survécu à *trois* tests
successifs. Chaque survie disait la même chose : la garde ne devient
atteignable qu'au second tour de boucle, ou sur une dernière étape courte. Un
test qui vise une ligne sans l'atteindre est vert pour rien — et il ne le dit
pas.

## Les survivants équivalents

Le même résultat par un autre chemin. Ce ne sont pas des défauts, et **le
dire fait partie de la lecture** : trois l'étaient dans la vague 2. Les écrire
comme tels dans le test, sinon on les rechasse à la vague suivante — et le
troisième tour, on « corrige » quelque chose qui allait bien.

## Ce que la mutation trouve et que rien d'autre ne trouve

Le survivant le plus utile de la vague 2 n'était pas un calcul mais une
ancre : `/^https?:\/\//` privée de son `^` accepte
`javascript:alert(1)#https://x`, et cette adresse part dans un `href`.

Une regex de validation sans ancre passe toutes les relectures. La mutation
la trouve en une fois.

## Rendre

- le score, mais après les survivants, pas avant ;
- chaque survivant qui change un résultat, avec le test ajouté ;
- chaque équivalent, avec la raison écrite dans le test ;
- et ce qu'on n'a **pas** couvert, s'il reste des modules hors de la vague.
