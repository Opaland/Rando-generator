---
name: revue-globale
description: Revue de l'application Sentiers dans son ensemble — sécurité, dette, poids, cohérence des textes, déploiement — et non des diffs récents. À lancer en fin de cycle, après les revues de sprint.
---

# Revue globale

**Une revue globale n'est pas une revue transversale des diffs.** J'ai
confondu les deux une fois : le nom promettait une revue de l'application,
le contenu comparait trois diffs entre eux.

Ce qui se trouve ici ne se trouve nulle part ailleurs, parce que ça porte
sur des fichiers qu'aucun sprint n'a touchés.

## Le passage obligé

### Déploiement

L'état des dernières exécutions sur `main`. À faire **en premier** : le
reste ne vaut rien si `main` est rouge.

### Sécurité

```bash
grep -rn "innerHTML\|dangerouslySetInnerHTML\|eval(\|new Function" src/
grep -rn "setHTML\|setDOMContent" src/
npm audit --omit=dev
```

Pour chaque point d'injection trouvé, vérifier que **toutes** les
interpolations sont échappées — pas seulement celles qu'on a en tête.

### Dette, chiffrée

```bash
wc -l src/store/*.ts src/core/*.ts src/components/*.tsx | sort -rn | head
```

Comparer au chiffre de l'issue de dette. Une dette qui a grossi se rapporte
avec son pourcentage, pas avec un adjectif.

### Surface d'API

Pour les modules critiques, lister ce qui est exporté et vérifier ce qui est
réellement importé ailleurs. `core/matching.ts` exportait dix symboles pour
un seul utilisé.

### Cohérence des textes

C'est là qu'était le README oublié. Chercher les formules, pas les fichiers :

```bash
grep -rn "100 % local\|ne quitte\|aucune donnée\|rien ne sort" README.md docs/ src/ public/
```

### Poids livré

```bash
npm run build && ls -la dist/assets/
```

## Le piège de l'outil qu'on vient d'écrire

Mon détecteur d'exports morts a rendu `computeCompletion` comme mort — le
cœur de l'application. **Vérifier à la main le premier résultat de tout
script de revue** avant d'en rapporter quoi que ce soit.

## La sortie

- Les trouvailles réelles, corrigées ou ouvertes en issue.
- Ce qui a été mesuré **sans** trouver de défaut — ça vaut d'être dit.
- Les chiffres du cycle.
