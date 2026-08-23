# Revue de la nuit du 22 au 23/08/2026

Douze items livrés dans la nuit (PR #220 à #231), chacun avec la porte
complète verte. Cette revue ne relit pas les diffs un par un : elle regarde
**l'application**, comme `/revue-globale` le demande, et elle dit aussi ce
qui a été vérifié **sans rien changer** — une vérification qui ne débouche
sur rien reste une vérification, et ne pas l'écrire revient à la refaire.

## Ce qui a été livré

| PR | Ce que ça change |
|---|---|
| #220 | `core/recorder.ts` — la machine à états de l'enregistrement (#152, pierre 1) |
| #221 | L'axe des distances du profil altimétrique, calculé sur la géométrie entière |
| #222 | U4 — l'attribution n'est plus recouverte, à quatre largeurs |
| #223 | U5 — « 0 % parcourus » ne s'affiche plus quand il n'y a rien à parcourir |
| #224 | U7 — « Les trois » devient « Rhône, Loire et Pilat » |
| #225 | U6 — la légende de carte ne montre que ce que la zone contient |
| #226 | `CLAUDE.md` §1bis — les pièges de visibilité de Playwright |
| #227 | `core/legende.ts` — le contenu de la légende se décide hors du composant |
| #228 | U12 — « parcourez vos fichiers » passe devant le glisser-déposer |
| #229 | U10 — le titre de la fiche ne se casse plus en trois lignes |
| #230 | U9 — un seul traitement pour l'action principale |
| #231 | U8 — la grille des zones compte ses colonnes elle-même |

## Le défaut trouvé par cette revue

**Au premier lancement sur téléphone, la carte du guide recouvrait
l'attribution.** Mesuré à 390 × 844 avec `elementFromPoint`, quatre sondes
sur cinq le long de la mention renvoyaient la carte du guide : **80 % de la
mention recouverte**, à la première seconde de la première visite.

La cause est la correction de U4 elle-même (#222) : elle a remonté
l'attribution au-dessus de la barre d'onglets et de la poignée, donc dans la
zone qu'occupe le guide. `attribution.spec.ts` ne pouvait pas le voir — il
appelle `fermerLeGuide` avant de mesurer. Le test couvrait quatre largeurs
et un seul état ; c'est exactement la leçon que l'audit UX tirait de M5 et
M7, et elle s'est reproduite dans la nuit qui suivait.

### Ce que la correction a coûté

Réserver la bande d'attribution dans le guide a **rouvert U1** sur un
360 × 640 : « Voir un exemple » sortait du cadre visible. Les deux exigences
sont réelles et se disputent les mêmes pixels — sur ce téléphone, la bande du
bas (attribution, poignée, barre d'onglets) prend 192 px, il reste 337 px
pour une carte qui en demande 517.

Un premier arrangement ne laissait défiler que les trois étapes : mesuré,
leur rangée tombait à **0 px**. Le guide y perdait les phrases qui disent ce
que fait le produit — le remède était pire, et **aucun test ne l'aurait vu**.
D'où le repère `guide-etape-1` et son assertion.

L'arrangement retenu : titre fixe, corps défilant, action fixe.

## Vérifié sans rien changer

- **Le coût de `distancesCumulees` sur la géométrie entière** (#221).
  Mesuré : 0,2 ms pour 100 points, 6,4 ms pour 10 000, **13,1 ms pour
  50 000** (~400 km de sentier), 42,4 ms pour 200 000. Tout cela avant un
  aller-retour réseau qui coûte cent fois plus. Rien à optimiser.
- **`libelleDeZone` face au cache** (#224). `loadZone(zone.id)` confirme que
  le libellé courant est bien celui qui s'applique : une zone mise en cache
  sous « Les trois » s'affiche « Rhône, Loire et Pilat » sans purge.

## Ce qui reste ouvert

- **U11** — les émojis en couleur de la barre d'onglets. C'est un choix de
  design, pas un défaut mesuré : il ne se tranche pas seul de nuit.
- **#152, pierres 2 à 4** — la persistance du tampon et la reprise après un
  onglet tué, l'écran de marche, la mesure de batterie.
- Les cinq points bloqués sur Cédric, inchangés (`FEUILLE_DE_ROUTE.md`).

## Ce que cette nuit apprend

**Cinq tests creux trouvés, dont trois écrits dans l'heure.** Le compte est
stable d'une session à l'autre, ce qui veut dire que la relecture ne suffit
pas : c'est la mutation qui les trouve. Deux nouveaux pièges sont désormais
dans `CLAUDE.md` §1bis — `toBeVisible` accepte un élément découpé par
`overflow: hidden`, `toContainText` lit du texte en `display: none`.

Et un troisième, propre à cette revue : **une mesure faite à une seule
hauteur ne dit rien des autres.** Le défaut du guide passait à quatre pixels
près sur un écran de 900 px de haut. Il a fallu mesurer sur un 360 × 640 —
le petit téléphone Android — pour qu'il devienne franc.
