# Revue globale — 25/08

Une revue globale n'est pas une revue transversale des diffs. Ce qui suit
porte sur des fichiers qu'aucun sprint de la nuit n'a touchés.

---

## 1. Déploiement — vert

`main` déployé sur GitHub Pages, exécution 191 (merge de #295), succès. Les
vingt dernières exécutions de `deploy.yml` sur `main` sont vertes. Rien
n'est empilé sur du rouge.

---

## 2. Sécurité — une faille réelle, corrigée

### Un `javascript:` cliquable depuis une sauvegarde forgée

**C'est la trouvaille de cette revue, et elle est sérieuse.**

`ItineraryDetail` pose `href={itin.details.lienWeb}`. La règle « seul
`http(s)://` devient un lien » existait — **recopiée deux fois**, dans
`boucles.ts` pour les données ouvertes de la Métropole et dans `poi.ts` pour
les sites de refuges — et **absente** de l'import de sauvegarde.

Ce trou n'était pas un défaut d'attention. Il était **structurel** : les deux
gardes vivent au moment où l'on *lit le réseau*. L'import d'une sauvegarde
n'y repasse pas — `estItineraire` vérifie l'identifiant et les coordonnées,
jamais les détails.

C'est mot pour mot le §6quater de CLAUDE.md, appliqué à autre chose que
`dist/` :

> Un contrôle placé avant l'action ne garde que ce que l'action n'a pas
> encore changé.

**Mesuré, pas supposé.** Une sonde jetable a d'abord montré que
`javascript:alert(document.cookie)` traverse `lireArchiveBackup` intact. Un
e2e a ensuite montré ce que le navigateur en fait : **React 18 pose le
schéma tel quel dans le DOM**, et le lien est cliquable. On ne délègue pas
une question de sécurité au comportement non contractuel d'une bibliothèque.

L'enjeu n'est pas théorique : Sentiers est entièrement local et garde des
traces personnelles en IndexedDB. Une exécution de script ici, c'est la
promesse centrale du produit qui tombe.

**Corrigé de la même façon que le hook `dist/` l'a été.** La règle est
nommée dans `core/lienSortant.ts`, les deux recopies l'appellent, et elle
est posée **au moment de construire le `href`** — là où l'action se produit,
et où il n'y a plus d'après. Les gardes de lecture restent : elles refusent
plus tôt et évitent de stocker une adresse qu'on ne montrera pas. Deux
instants différents, pas un doublon.

Six contournements sont testés, dont les deux qui comptent :

| Entrée | Pourquoi elle passe devant une regex naïve |
|---|---|
| `javascript:alert(1)#https://x` | l'ancre `^` manquante — une vague de mutation avait déjà trouvé cette faute exacte ailleurs dans le dépôt |
| `java<TAB>script:alert(1)` | les navigateurs ignorent les caractères de contrôle dans un `href` ; une regex les prend pour du contenu |

L'e2e a été vu **rouge avant le correctif**, avec le `javascript:` dans le
DOM.

### Une asymétrie d'échappement dans l'infobulle

`poiPopup.ts` échappait `kindLabel` dans une branche et pas dans l'autre.
Aucune conséquence aujourd'hui — la valeur vient d'une table interne — mais
**c'est l'asymétrie qui est le défaut** : rien ne signalait laquelle des deux
branches avait raison, et la prochaine valeur ajoutée à la table aurait
hérité de la mauvaise moitié. Une règle qui ne vaut qu'un cas sur deux n'est
pas une règle. Rendue symétrique.

### Mesuré sans rien trouver

- `grep` sur `innerHTML`, `dangerouslySetInnerHTML`, `eval(`, `new Function`
  dans tout `src/` : **un seul point d'injection**, `setHTML(poiPopupHtml())`,
  et ses interpolations sont échappées.
- `npm audit --omit=dev` : **0 vulnérabilité**.
- Les trois `href` dynamiques du dépôt sont désormais tous gardés au point
  de pose. Il n'y en a pas un quatrième : la recherche a porté sur la
  **formule** `href={`, pas sur les fichiers dont je me souvenais.

---

## 3. Dette, chiffrée

| | Issue #155 | Hier soir | Ce matin | Écart à l'issue |
|---|---|---|---|---|
| `appStore.ts` | 1 566 | 2 252 → 1 920 | **1 988** | **+27 %** |

Deux tranches ont été extraites (`trancheTrace`, `trancheFiche`), et le
fichier a quand même regrossi de 68 lignes cette nuit — le sprint 5 y a
ajouté l'état et l'action des POI de zone.

**Le constat est net : l'extraction ne va pas plus vite que l'ajout.** Deux
tranches sorties, et l'écart à l'issue reste de plus d'un quart. La
troisième tranche (sprint 8 du plan) n'est pas un confort.

## 4. Surface d'API — vingt et un exports pour personne

Un détecteur a rendu vingt et un symboles exportés qu'aucun autre module
n'importe. **Le premier résultat a été vérifié à la main**, comme le veut le
piège documenté dans la compétence : le détecteur d'exports morts avait un
jour rendu `computeCompletion` — le cœur de l'application.

Vérification faite : les vingt et un sont **vivants**, utilisés dans leur
propre fichier. Ce n'est donc pas du code mort, c'est une **surface d'API
trop large** — chaque `export` est une promesse de stabilité, et une
invitation au couplage accidentel. C'est la dette que le dépôt avait déjà
nommée sur `matching.ts`, qui exportait dix symboles pour un seul employé.

Les vingt et un `export` sont retirés. TypeScript, ESLint et les 1 626 tests
unitaires le prouvent sans un seul ajustement.

## 5. Cohérence des textes — rien à corriger

La promesse de confidentialité a été cherchée **par sa formule** dans le
README, les neuf documents de `docs/`, les sources et `public/`. Elle est
énoncée dans dix endroits, tous cohérents.

Un point valait d'être vérifié : le sprint 5 a ajouté une **requête sortante**
— les POI de la zone. `SortiesReseau` promet de « montrer ce qui sort, au
lieu de répéter que rien ne sort ». Elle n'a pas de liste codée en dur :
elle instrumente `fetch` et `XMLHttpRequest` et regroupe par hôte. La
nouvelle requête y est donc comptée d'office. **Pas de trou** — et c'est
exactement pour ça que ce panneau avait été conçu ainsi.

## 6. Poids livré

| Fragment | Brut | Gzip |
|---|---|---|
| `MapView` | **956 Ko** | 247 Ko |
| `maplibre-gl-worker` | 470 Ko | 129 Ko |
| `index` | 375 Ko | 120 Ko |

L'issue #93 enregistre 934 Ko pour `MapView` : **+22 Ko (+2,4 %)**. La
croissance est lente, mais elle est monotone — aucun sprint n'a jamais fait
baisser ce chiffre.

---

## Ce que cette revue dit du reste

Les deux trouvailles de sécurité ont la **même forme** que les cinq
trouvailles de la nuit sur les tests : quelque chose était vrai à l'endroit
où on l'avait écrit, et faux partout ailleurs.

- une garde d'URL vraie au parseur, absente à l'import ;
- un échappement vrai dans une branche, absent dans l'autre ;
- un test vrai pour quarante sorties, cité pour huit cents.

Le remède est toujours le même, et il est déjà dans CLAUDE.md sous trois
formes : **nommer la condition transverse plutôt que la recopier** (§4), et
**placer le contrôle là où l'action se produit** (§6quater).
