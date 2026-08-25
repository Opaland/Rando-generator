# Audit de la suite e2e — 25/08

Demande de Cédric : « j'ai plein de tests e2e — leur robustesse ? leur
utilité ? redondance ? pertinence ? faut-il en fusionner ? »

**85 fichiers, 347 tests, 11 368 lignes, 13 minutes.**

Ce document ne dit pas si un test est *bon* : ça se décide, et le §2 interdit
de prétendre mesurer ce qui se décide. Il rend des **chiffres**, et nomme les
candidats à la lecture. `scripts/audit-e2e.mjs` les recalcule.

---

## 1. Le chiffre qui compte : ce que la suite ne voit pas

**J'ai divisé par deux le pourcentage de complétion** — une ligne dans
`matching.ts`, le calcul central de toute l'application, celui dont
CLAUDE.md §9 fait une condition d'arrêt.

```
6 failed · 341 passed (13,8 min)
```

**Six fichiers sur 85. Six tests sur 347.** Le reste — 98,3 % de la suite —
ne s'aperçoit de rien.

Les six qui voient :

| fichier | ce qu'il asserte |
|---|---|
| `customs.spec.ts` | la progression d'un itinéraire perso |
| `detail.spec.ts` | la fiche à 100 % après import |
| `jalon-franchi.spec.ts` | l'annonce d'un jalon franchi |
| `jalons.spec.ts` | « bouclé » et le prochain jalon |
| `scenario.spec.ts` | le parcours complet zone → import → recalcul |
| `seuil.spec.ts` | le réglage du seuil « bouclé » |

**Ce n'est pas un défaut de la suite** — la plupart de ces fichiers ausculte
autre chose (une mise en page, un import, une attribution), et il serait
absurde qu'ils vérifient un pourcentage.

C'est une **mesure de sa forme** : la suite est large et plate, pas
redondante. Chaque fichier tient un sujet et le tient seul. La contrepartie
est qu'un sujet dont un seul fichier parle disparaît avec lui, sans que rien
ne le signale.

**Ce qu'il faut en tirer**, et rien de plus : ce n'est pas la longueur de la
suite qui protège le calcul de complétion, ce sont six tests nommés. Les
supprimer ou les affaiblir ne ferait pas baisser un compteur.

---

## 2. Robustesse — huit attentes fixes

`waitForTimeout` passe sur une machine rapide et tombe sous charge. C'est la
famille du §6ter, dont le dépôt porte **trois cas datés** — dont un trouvé
ce matin même : « rien ne déborde en largeur », rouge une fois en suite
complète, vert à trois relances isolées.

| fichier | attentes fixes |
|---|---|
| `enregistrer.spec.ts` | 3 |
| `carte.spec.ts` | 1 |
| `loading.spec.ts` | 1 |
| `mobile.spec.ts` | 1 |
| `poignee-pourcentage.spec.ts` | 1 |
| `sorties-reseau.spec.ts` | 1 |

Huit au total, sur 347 tests. **C'est peu, et c'est la seule fragilité
mécaniquement détectable.** Chacune se remplace par un `expect.poll` sur
l'état final voulu.

`enregistrer.spec.ts` mérite d'être lu en premier : trois attentes fixes,
mais aussi neuf convergences — le fichier connaît le piège et l'évite
ailleurs, ce qui rend les trois restantes suspectes plutôt qu'assumées.

---

## 3. Exposition au §1bis — trente-deux fichiers

`toBeVisible` accepte un élément **écrêté** par un ancêtre en
`overflow: hidden`. `toContainText` lit du `display: none`. Ce ne sont pas
des interdits : ce sont des assertions qui **peuvent passer pour une raison
qu'on n'a pas voulue**, et le dépôt en a quatre cas datés.

Trente-deux fichiers ont au moins huit de ces assertions et **aucune** mesure
de ce qui est peint (`elementFromPoint` / `estAlEcran`). Les plus exposés :

| fichier | assertions nues | convergences |
|---|---|---|
| `detail.spec.ts` | 61 | 6 |
| `decouverte.spec.ts` | 25 | 0 |
| `scenario.spec.ts` | 21 | 0 |
| `tracer.spec.ts` | 20 | 0 |
| `traces.spec.ts` | 19 | 0 |
| `transparence.spec.ts` | 17 | 0 |

**Ce n'est pas une liste de défauts.** `regles-d-ecran.spec.ts` pose la
question « qu'est-ce qui est peint » globalement, à trois largeurs et dans
six états : exiger la même mesure dans chaque fichier serait la recopier
quatre-vingt-cinq fois, ce que le §4 proscrit.

C'est une liste d'**exposition** : là où une régression de mise en page peut
laisser un test vert. `detail.spec.ts` est le premier à relire — 61
assertions, 447 lignes, 18 tests, et c'est aussi l'un des six qui gardent le
calcul de complétion.

---

## 4. Pertinence — aucun test obsolète

Aucun `data-testid` cité par un test n'est absent des sources.

**Et la première version du script en trouvait trois.** `global-vide`,
`global-km` et `global-declare-etat` — tous trois produits par un ternaire
dans `Dashboard.tsx` que ma détection ne lisait pas :

```ts
etatBilan === 'mesure' ? 'global-km' : `global-${...}`
```

J'allais rapporter trois tests obsolètes qui allaient très bien. La skill
`audit-ui` le dit depuis le jour où son détecteur d'exports morts a rendu
`computeCompletion`, le cœur de l'application : **vérifier à la main le
premier résultat de tout script de revue avant d'en rapporter quoi que ce
soit.**

---

## 5. Redondance — le recouvrement ne la mesure pas

Vingt paires de fichiers touchent aux mêmes `data-testid` à 50 % ou plus. Les
trois premières sont à **100 %** :

```
archive.spec.ts ↔ fit.spec.ts ↔ tcx.spec.ts   (6 testids communs)
```

**Vérifié à la main : ce ne sont pas des doublons.** Ils importent trois
formats différents — une archive ZIP d'export, un fichier de montre FIT, un
vieux TCX — chacun avec son chemin heureux et son chemin d'erreur. Ils
partagent les mêmes testids parce qu'ils passent par le même **flux
d'import**, pas parce qu'ils disent la même chose.

De même `espacement.spec.ts`, à 83 % de recouvrement, teste tout autre chose :
une trace trop espacée pour être située (#148).

**Le recouvrement mesure une surface partagée, pas une intention dupliquée.**
Un audit qui conclurait « fusionnez ces trois-là, ils font doublon » se
tromperait, et ferait perdre trois chemins d'erreur.

---

## 6. Fusions qui vaudraient le coup — et pourquoi

Une seule famille, et l'argument n'est **pas** la redondance :

### `archive` + `fit` + `tcx` → une table de formats

206 lignes, six tests, trois `beforeEach` identiques. Une table

```ts
const FORMATS = [
  { nom: 'GPX', bon: gpxValide, casse: gpxTronque },
  { nom: 'FIT', bon: fitValide, casse: fitTronque },
  { nom: 'TCX', bon: tcxValide, casse: tcxIllisible },
  { nom: 'archive ZIP', bon: zipValide, casse: zipVide },
]
```

rendrait la même couverture **et montrerait les trous** : y a-t-il un test de
GPX cassé ? un ZIP contenant du FIT ? Aujourd'hui la réponse demande d'ouvrir
quatre fichiers ; avec une table, une ligne manquante se voit.

**C'est le seul argument valable pour fusionner des tests** : une table expose
ce qu'une liste de fichiers cache. Gagner des lignes n'en est pas un.

### Ce qu'il ne faut *pas* fusionner

- `etapes` / `etapes-refuges` / `export-etapes` (71 %) — trois questions
  distinctes : le découpage, son calage sur les couchages, son export ;
- `bilan` / `carte` (80 %) — l'image de bilan et le rendu de la carte ;
- `poignee-pourcentage` / `regles-de-clavier` (75 %) — le geste et le clavier
  sur la même poignée, et c'est **exactement** ce qu'il faut vérifier deux
  fois.

---

## 7. Ce qui se décide, et que ce document ne tranche pas

- **Faut-il porter la mesure de peinture dans `detail.spec.ts` ?** Elle a 61
  assertions nues et garde un des six chemins du calcul de complétion. Mon
  avis : oui, sur les trois assertions qui portent un chiffre, pas sur les
  61.
- **Faut-il remplacer les huit attentes fixes ?** Oui, mais une par une, en
  vérifiant que le test échoue encore sans son correctif — une attente fixe
  qui masquait un vrai défaut le remontrerait, et ce serait une bonne
  nouvelle.
- **Faut-il découper `detail.spec.ts` (447 lignes, 18 tests) ?** Il est le
  plus gros du dépôt après les règles d'écran. Découper par sujet — profil,
  POI, étapes — rendrait chaque échec plus lisible. Ce n'est pas urgent.
- **13 minutes, est-ce trop ?** La CI a une borne à 75 minutes, posée après
  un run réel de 50 minutes sur un exécutant lent. Tant que la borne tient,
  la durée n'est pas un problème à résoudre.

---

## Ce que cet audit a coûté, et ce qu'il a rendu

Deux exécutions complètes de la suite (27 minutes), un script de 150 lignes,
et une injection. Le chiffre du §1 — **six fichiers sur 85** — ne s'obtenait
d'aucune autre façon : ni en lisant les tests, ni en comptant les assertions,
ni en mesurant la couverture.

**Une suite se juge sur ce qu'elle attrape quand on remet un défaut.**
