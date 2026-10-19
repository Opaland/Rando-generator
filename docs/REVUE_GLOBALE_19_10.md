# Revue globale — 19/10

L'application, pas les diffs. C'est la première revue globale depuis
celle du 28/08. Entre les deux : 69 commits sur la branche depuis le
merge #540, la nuit du 18 au 19/10 (vagues de mutation, #543) et #546.

## 1. Déploiement — vert

CI et déploiement GitHub Pages verts sur `main` (0e30bc6, merge #540, le
08/10). Rien n'est empilé sur un `main` rouge.

## 2. Une règle de cache écrite deux fois, et testée du mauvais côté

`public/sw.js` décide seul de ce qu'il met en cache : `estTuile` et
`estAltimetrie`. `src/core/telechargement.ts` porte deux jumelles,
`estTuileCarte` et `estAltimetrie`, que **l'application n'appelle
nulle part** : seuls des tests les appellent.

Leurs tests éprouvaient donc la copie qui ne tourne pas. Un hôte de tuiles
ajouté d'un seul côté aurait laissé la suite verte et le cache faux. Les
deux fichiers ne changent jamais ensemble, et chacun paraît complet quand
on le lit seul : c'est la forme exacte du §4ter.

**Corrigé.** `tests/unit/cacheDuServiceWorker.test.ts` exige que les
deux corps soient le même texte, aux espaces près. C'est l'issue 2 du
§4ter, puisque le service worker n'importe rien de `src`. Je l'ai vérifié
par deux injections : un hôte ajouté côté `sw.js`, puis `'/altimetrie/'`
au lieu de `'/altimetrie'`. Les deux font rougir le test.

## 3. Un libellé que rien n'affiche

`libelleCompletion` (`src/core/declaratif.ts`) s'annonce comme « Ce qui
s'affiche : un chiffre tant que rien n'est déclaré, deux ensuite ». Il est
testé, mais **aucun composant ne l'appelle**. Le tableau de bord écrit son
propre libellé (« X déclarés en … »), avec une autre formulation que la
fonction (« X mesurés · Y déclarés »).

C'est une justification qui affirme et qui est fausse (§4bis), plus une
formulation en double. **Non corrigé**, parce que choisir laquelle des deux
phrases est la bonne se décide : c'est une question pour Cédric.
Supprimer la fonction ne changerait rien à l'écran.

## 4. Un alias sans appelant

`COMPLETION_PCT` (`src/core/milestones.ts`) se dit « Ancien nom, conservé
pour les appels qui n'ont pas à connaître le réglage ». Aucun appel de
`src/` ne l'utilise : seul `milestones.test.ts` le fait. Le commentaire
justifie une existence qui n'a plus de raison (§4bis). Laissé en l'état
et noté ici : le retirer touche un test, et c'est un item à part.

## 5. Un texte que #546 a rendu incomplet

Le README disait « **tracez-le à la souris** ». Depuis #546, le tracé
s'enregistre au doigt sur téléphone, ce qui était impossible avant à
390 px comme à 800 px. Corrigé en « à la souris ou au doigt ». J'ai
cherché la formule sur toutes les surfaces (§3) : c'est la seule
occurrence qui parle du tracé.

## Ce qui a été mesuré sans trouver de défaut

- **Injections HTML** : toujours un seul point, `poiPopupHtml`
  (`src/components/map/poiPopup.ts`), échappé dans ses deux branches.
- **`npm audit --omit=dev`** : zéro vulnérabilité.
- **`npm audit` complet** : deux vulnérabilités modérées dans `qs`, qui n'est
  utilisé que par Stryker, via `typed-rest-client@2.3.1`, qui l'épingle en
  version exacte 6.15.1. `npm audit fix` n'y peut donc rien. **Laissé en
  l'état, sur décision de Cédric (19/10).** `qs` ne sert qu'à envoyer des
  rapports au tableau de bord en ligne de Stryker, ce qu'on ne fait pas, et
  rien de livré n'en dépend. L'autre voie aurait été un `overrides` qui
  impose à Stryker une version qu'il n'a pas testée. À revoir quand Stryker
  mettra sa dépendance à jour.
- **Surface d'API de `src/core`** : deux exports « orphelins » au premier
  passage, `FLAT_KMH` et `ASCENT_METERS_PER_HOUR`, et le premier résultat
  était faux, comme la skill le prévient. Les deux sont lus par
  `scripts/jumelles/13-regle-estimation.mjs` et servent dans leur fichier.
  Neuf exports exécutables ne sont appelés que par des tests. Trois
  étaient des trouvailles (§2 à §4). Les autres (`cellKey`,
  `cumulativeDistances`, `graphSize`, `metresDuNiveau`,
  `HOTES_CONTACTES`) sont des outils de test ou des gardes : le dernier
  est la liste que la CSP doit couvrir.
- ~~**Promesse de confidentialité** : cherchée par sa formule dans le README,
  `docs/`, `src/` et `public/`. Cohérente partout.~~ **Faux, et retiré le
  jour même.** La seconde passe (ci-dessous) a trouvé « Rien ne quitte votre
  navigateur » sur l'écran d'import de « Mes itinéraires », et un compteur de
  fuites aveugle aux URL GET (#558). Chercher la formule « ne quitte » n'a
  pas vu la phrase écrite en « Rien ne quitte » sur une autre ligne. C'est
  exactement ce que le §3 dit des `grep` mémorisés.
- **Poids livré** : `MapView` à 958 Ko / 247 Ko gzip, contre 956 / 247 au
  28/08. `index` à 411 Ko / 132 Ko gzip.

## Les chiffres

| | 28/08 | 19/10 |
|---|---:|---:|
| lignes de `src/` (ts, tsx) | 26 547 | 30 551 |
| lignes de `tests/` | 38 764 | 61 396 |
| fichiers de spec e2e | 93 | 108 |
| fichiers de test unitaire | 131 | 219 |
| tests unitaires | 1 956 | 3 280 |
| tests e2e | 408 | 426 |
| `appStore.ts` | — | 1 098 lignes |

Les tests ont grossi deux fois plus vite que le code (+58 % contre
+15 %). C'est pour l'essentiel l'effet des vagues de mutation du 18 et du
19/10, qui ont transformé des tests creux en vrais tests.

## Ce qui reste ouvert

- §3 (`libelleCompletion`) et §4 (`COMPLETION_PCT`) : à trancher ou à
  retirer, chacun dans son item.
- Les personas : je n'ai pas relu une à une les fiches datées depuis le
  28/08 contre ce qui a été livré. La revue est donc incomplète sur ce
  point, et je le dis plutôt que de laisser croire le contraire.

## Seconde passe, le même jour : application entière, 24 issues

Demandée par Cédric le 19/10 au soir. Elle porte sur tout : code, design,
patterns, UX et QA. Cinq angles ont tourné en parallèle :
- l'interface, mesurée à quatre largeurs et en gros texte ;
- le code, relu en adversaire ;
- les promesses faites à l'utilisateur ;
- les règles jumelles ;
- un QA exploratoire par parcours réels.

Chaque constat a été reproduit ou mesuré, et les majeurs ont été revérifiés
à la main avant d'être retenus.

**Majeurs**
- #548 : « Actualiser les tracés » efface la copie hors ligne avant de
  savoir si le réseau répond (régression de #437).
- #549 : un itinéraire perso neuf hérite de la déclaration et de l'objectif
  d'un supprimé, par réutilisation d'id.
- #550 : la zone restaurée au démarrage saute les gardes (partielle, schéma,
  âge), §4.
- #551 : un double-clic supprime sans confirmation, et annule une
  déclaration.
- #552 : l'impression sort la barre d'onglets et les boutons, et des lignes
  se chevauchent.
- #553 : la fiche recouvre le crédit de la carte (licence) et les boutons de
  zoom.
- #554 : **régression de mon #546 du jour**. « Ma position » recouvre le
  « × » du panneau de tracé à 390 px, et ma sonde ne pouvait pas le voir.
- #555 : un tap sur ⓘ lance une sortie à 390 px.
- #556 : gros texte à 390 px, des commandes deviennent inatteignables et
  l'onglet « Progression » est coupé.
- #557 : attribution perdue (tracé dessiné, GPX réimporté, crédit imprimé
  figé).
- #558 : « Rien ne quitte votre navigateur » est faux à l'import, et le
  compteur de fuites est aveugle aux requêtes GET.
- #559 : sauvegarde, avec les déclarations seules, les réglages écrasés et
  des points hors du globe.
- #560 : enregistrement, avec une trace perdue si l'écriture échoue, une
  alerte GPS qui reste, et une pause comptée dans l'historique.
- #561 : page blanche sans service worker.
- #562 : le glisser-déposer ignore FIT, TCX et ZIP.
- #563 : le service worker perd la réponse quand `cache.put` échoue.

**Moyens et mineurs**
- #564 : deux longueurs par itinéraire, et un pourcentage déclaré au-delà
  de 100 %.
- #565 : une date UTC contre une date locale autour de minuit.
- #566 : « 95 % » affiché sans la coche « bouclé ».
- #567 : une balise vide devient 0, et « Invalid Date » s'affiche.
- #568 : focus, Échap et bouton Retour.
- #569 : quatre défauts mineurs de code.
- #570 : quatre défauts mineurs de mise en page.
- #571 : inventaire des textes et commentaires faux.

**Ce que cette passe dit des sondes.** Les e2e étaient verts sur tout cela.
Le défaut n'est pas l'absence de tests, c'est leur angle. Il fallait :
- un vrai `page.pdf` pour l'impression ;
- `elementFromPoint` sur les commandes de la carte quand la fiche est
  ouverte ;
- le gros texte sur plus d'un état ;
- un contexte non sécurisé pour le service worker ;
- un double-clic.

Chacun de ces angles mérite d'entrer dans la sonde quand son correctif sera
fait (§6quinquies).
