# Revue globale — 28 août 2026

Elle porte sur l'application, pas sur les diffs de la nuit. C'est ce qui lui
permet de trouver ce qu'aucune revue de sprint ne pouvait voir : deux de ses
six trouvailles sont dans des fichiers qu'aucun sprint récent n'a touchés, et
une troisième demande de comparer un commit du 22 à un commit du 24.

**Deux défauts sont actifs en production au moment où ces lignes sont
écrites.**

---

## 1. Déploiement — vert

CI 794 et Pages 237 au vert sur `main` après #372. Le §7 est satisfait : rien
n'a été empilé sur du rouge.

## 2. Les deux mécanismes dont la clé ne bouge jamais

C'est la trouvaille de cette revue, et elle a deux occurrences sans rapport
l'une avec l'autre. Dans les deux cas le mécanisme est **correct** ; c'est sa
clé qui est gelée, de sorte qu'il ne s'exécute jamais.

### #370 — le nettoyage de cache du service worker

`public/sw.js` supprime, à chaque activation, les caches dont le nom ne
commence pas par `VERSION`. C'est la forme canonique, et elle est juste — à
une condition : que `VERSION` change d'une livraison à l'autre.

```
$ git log --oneline -S "const VERSION = " -- public/sw.js
c8cc57e Hors-ligne : service worker, précache généré au build, bandeau honnête
```

Une seule ligne : la constante a été écrite une fois et n'a jamais bougé. Il y
a eu 231 déploiements depuis.

Confirmé sur la page servie :

```
$ curl -s https://opaland.github.io/Rando-generator/sw.js | grep -o "const VERSION = '[^']*'"
const VERSION = 'sentiers-v1'
```

Le précache déployé compte quinze entrées, dont six aux noms hachés — les six
fichiers de `dist/assets/`, 1,88 Mo. Ce sont elles qui s'empilent : les neuf
autres gardent leur nom d'une livraison à l'autre et sont remplacées.

`CACHE_APP` est donc le seul des trois caches que rien ne borne, alors que
son voisin est plafonné à six cents entrées avec ce commentaire : « le quota
n'est pas extensible ».

**Ce qui n'est pas mesuré** : le nombre de mégaoctets réellement présents
chez quelqu'un. Il dépend du nombre de livraisons traversées et de
l'éviction du navigateur. Ce qui est établi est le mécanisme et son activité
en production, pas un chiffre de terrain.

### #371 — le schéma de zone, corrigé le jour même

`SCHEMA_ZONE` portait cette consigne, écrite le 22/08 :

> À incrémenter quand la requête Overpass rapporte quelque chose de nouveau,
> faute de quoi les copies plus anciennes prétendent répondre à une question
> qu'on ne leur a pas posée.

Le 24/08, #286 ajoutait `osmcSymbol` et `operator` au contenu mis en cache.
La constante n'a pas bougé.

Le cache garde des `Itinerary` **analysés**, pas la réponse brute : le nouvel
analyseur ne repassera donc jamais sur une zone écrite avant. Et
`decrireBalisage(undefined)` rend `null`, si bien que la fiche **omet la
ligne** — rien ne distingue « OpenStreetMap ne porte pas ce tag ici » de « on
ne l'a pas demandé quand on a rempli ce cache ». C'est mot pour mot la phrase
que le champ `schema?` existe pour empêcher.

Fenêtre : toute zone chargée entre le 22 et le 24/08 et non rafraîchie, soit
jusqu'au 21–24 septembre.

**Corrigé le 28/08** — `SCHEMA_ZONE = 2`, et une garde qui compare la liste
épinglée à ce que le parseur écrit.

Ce qui mérite d'être retenu : le commentaire de `zoneUtilisable` affirmait que
réunir l'âge et la version « aurait laissé le second oubli se reproduire ».
**Il s'est reproduit deux jours après.** Le problème n'a jamais été que les
deux conditions soient séparées, mais qu'aucun lien n'existe entre la
constante et le parseur qui la périme. Le remède compare, il ne regroupe pas.

## 3. La politique de sécurité qui ne protège personne — #375

`deploy/csp.conf` est une source unique soignée, lue par nginx et par la
prévisualisation, gardée dans les deux sens par `tests/unit/csp.test.ts`
contre `HOTES_CONTACTES`. Les 408 tests de bout en bout tournent sous la
politique réelle.

Sur la page que les gens ouvrent :

```
$ curl -sI https://opaland.github.io/Rando-generator/ | grep -i content-security
(rien)
$ curl -s https://opaland.github.io/Rando-generator/ | grep -io "<meta[^>]*content-security-policy[^>]*>"
(rien)
```

Ni en-tête, ni balise. Tout ce travail protège le serveur de prévisualisation
et une image conteneur que rien ne déploie.

Le dépôt le sait et l'écrit — mais il en tire une conclusion trop large :
« Pages n'en laisse poser aucun » est vrai **des en-têtes**, et une balise
`<meta http-equiv>` n'en est pas un. Elle couvrirait `connect-src`,
c'est-à-dire précisément la directive qui porte la promesse du produit.

Elle ne couvre pas `frame-ancestors`, `report-uri` ni `sandbox`, ignorées en
balise par spécification. Ce n'est donc pas un remplacement du serveur : le
déménagement garde sa raison d'être.

## 4. Quatre énumérations périmées — #367

Quatre surfaces décrivaient un outil qui avait changé sans elles :

| surface | annonçait | mesure |
|---|---|---|
| `CLAUDE.md` §6quinquies | trois largeurs, six états | quatre et huit |
| skill `audit-ui` | idem, et **énumérait** 390/800/1280 | 1024 nulle part |
| `CLAUDE.md` §6 | six commandes de porte | neuf |
| `README.md` | « Six personnes suivies pas à pas » | dix-huit |
| `.claude/hooks/porte-avant-commit.sh` | quatre commandes | six |

La dernière tranche une hypothèse. On pouvait croire que la documentation
vieillit parce qu'elle est **loin** du code. Ici l'en-tête et les appels sont
dans le même fichier, à six lignes d'écart, et chaque ajout était soigné
isolément.

Le problème n'est pas la distance. C'est qu'**aucune énumération n'est
comparée à ce qu'elle énumère**, où qu'elle vive.

`npm run listes` en compte six paires au lieu de trois.

## 5. Deux surfaces qui ne disent pas ce qu'elles font

- **#369** — la feuille d'impression, livrée le matin même, n'est mentionnée
  nulle part : ni bouton, ni README, ni PRD. `grep -i imprim` sur `src/`,
  `public/`, le README et le PRD ne rend que le CSS lui-même. Paul ne peut la
  découvrir qu'en pressant Ctrl+P au hasard, et Jeanine, 76 ans, ne connaît
  pas ce raccourci.
- **#373** — `docs/IA_LOCALE.md` inscrit dans « ce qui est déjà décidé » que
  le poids s'annonce avant le téléchargement, « la règle du bouton
  *Emporter* ». Le bouton fait l'inverse, et dit pourquoi : « annoncer
  environ 40 Mo serait le nombre inventé que CLAUDE.md §2 interdit ». La
  règle proposée reste bonne — une taille de fichier ONNX se connaît d'avance
  — mais le précédent invoqué dit le contraire.

## 6. Une liste sans garde — #368

Ce que l'hydratation masque en mode démonstration et ce que
`quitterDemonstration` relit sont deux listes de trois entrées, écrites dans
deux fichiers. Elles coïncident aujourd'hui. Rien ne le tient demain, et la
cicatrice précédente est arrivée exactement par là.

---

## Ce qui a été mesuré sans trouver de défaut

Ça vaut d'être écrit, pour qu'on ne recommence pas la mesure dans six mois.

- **Injections HTML** : un seul point, `poiPopupHtml`, échappé dans les deux
  branches depuis la revue du 25/08. `lienSortant` ancre son `^` et retire
  les caractères que le navigateur ignore avant d'examiner le schéma.
- **`npm audit --omit=dev`** : zéro vulnérabilité.
- **Surface d'API** : **zéro export exécutable orphelin** dans les 46 modules
  de `src/core`. Le commit du 25/08 en avait soldé vingt et un — seize
  `const`, cinq `function`, aucun type — et la dette n'est pas revenue. Les
  soixante types non importés que rend le détecteur sont autre chose : ils
  servent dans leur propre fichier, et un `export` superflu sur un type ne
  coûte ni exécution ni octet livré. La comparaison « 21 → 60 » ne tenait
  pas.
- **Poids livré** : `MapView` à 956 Ko / 247 Ko gzip — inchangé depuis la
  revue du 25/08, alors que trente sprints ont passé.
- **Promesse de confidentialité** : cherchée par sa formule dans le README,
  les 28 documents de `docs/`, les sources et `public/`. Cohérente partout.
  Le panneau `SortiesReseau` n'a pas de liste codée en dur et **dit** une
  destination non répertoriée au lieu de l'absorber dans un « divers ».
- **Aucune police distante** : `grep` sur `fonts.googleapis`, `fonts.gstatic`,
  `@import url(` et `@font-face` ne rend rien. La phrase du README tient.
- **`prefers-reduced-motion`** : traité par une règle universelle.
- **Quota de stockage** : `src/core/stockage.ts` interroge `estimate()`.
- **PWA installable** : manifeste lié, `standalone`, icônes 192/512/maskable
  présentes dans `dist/`, service worker enregistré avec son gestionnaire
  `fetch`. Un inventaire de critères, **pas une installation réussie** — ce
  qui reste de #14 demande un vrai téléphone.

## Les chiffres du cycle

| | |
|---|---:|
| lignes de `src/` | 26 547 |
| lignes de `tests/` | 38 764 |
| fichiers de spec e2e | 93 |
| fichiers de test unitaire | 131 |
| tests unitaires | 1 956 |
| tests e2e | 408 verts, 9 sautés |
| couverture (instructions) | 97,38 % |
| scripts de garde | 7 |
| paires jumelles | 6 |

## Une mesure faite, et un soupçon démenti

- **Les neuf tests e2e qui se sautent à chaque porte** — mesuré, et le
  soupçon était faux.

  Je les croyais sautés faute de WebGL : treize fichiers portent trente-deux
  `test.skip()` conditionnés à `hasMap`, avec le message « WebGL
  indisponible ». Relevés un par un avec `--reporter=list`, les neuf sont
  **tous** des suites volontairement en veille, chacune derrière son
  interrupteur :

  | suite | interrupteur | ce qu'elle fait |
  |---|---|---|
  | `monkey.spec.ts` × 3 | `MONKEY` | lancée à part par `npm run monkey` |
  | `reel.spec.ts` × 3 | `REEL` | parle aux vrais serveurs |
  | `page-deployee.spec.ts` × 2 | `SENTIERS_URL` | sonde le site en ligne |
  | `mesure-bibliotheque.spec.ts` | `MESURE_ACTIVITES` | huit cents traces |

  **Aucune ne saute pour cause de WebGL** : il fonctionne dans ce conteneur,
  et ces gardes-là ne se déclenchent jamais. Rien à corriger.

  C'est écrit ici pour qu'on ne recommence pas l'enquête : un compte de
  sautés qui ne bouge pas est le compte normal, et c'est **neuf**.

## Ce qui reste à mesurer, et que je n'ai pas rapporté

Une chose a été **soupçonnée et pas mesurée**. Elle n'est donc pas un
constat, et le §1bis interdit de la présenter comme tel.

- **L'attribution sur la feuille imprimée.** `@media print` masque
  `[data-testid='map']`, donc le contrôle d'attribution de MapLibre avec ;
  `mentionDeSource` ne s'affiche que quand la source **manque**. Or le profil
  et la liste de POI imprimés dérivent d'OSM. À mesurer avec
  `emulateMedia({ media: 'print' })` avant d'ouvrir quoi que ce soit.

