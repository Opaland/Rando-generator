# Revue globale du 22/10

Skill `revue-globale`, sur `main` après la fusion de la branche longue (#586)
et des trois premières PR du nouveau mode (#597, #598, #599). Dernière revue
globale : le 19/10 (`REVUE_GLOBALE_19_10.md`).

Deux volets ont été confiés à des agents en lecture seule, avec interdits
écrits : la cohérence des textes et des personas (`relecteur-de-promesses`),
les règles jumelles (`chasseur-de-jumeaux`). Le reste a été mesuré dans la
conversation principale. Chaque trouvaille ci-dessous est vérifiée ou
marquée comme déduite ; toutes sont ouvertes en issue.

## Déploiement

`main` vert après #586 : CI, image de production, GitHub Pages (8bd653e).
Une ombre : trois exécutions `push` sont tombées le 22/10 sur l'installation
de Chromium (10 min dépassées, aucun test lancé), quand l'exécution
`pull_request` du même commit passait — #587.

## Sécurité

- **Points d'injection** : deux occurrences, aucune nouvelle. `style.ts:528`
  est un commentaire ; `useMapInteractions.ts:74` passe par `poiPopupHtml`,
  qui échappe chaque interpolation (`escapeHtml`, relu).
- **`npm audit --omit=dev`** : 0. **`npm audit` complet** : 6, dont 1 haute
  (`vite` → `launch-editor`, serveur de développement sous Windows), contre
  2 modérées le 19/10. Rien de livré — #613.
- **Promesse réseau** : `deploy/csp.conf` n'autorise que les cinq hôtes que
  le README nomme ; aucun `sendBeacon`, `WebSocket` ni `EventSource`
  (relecteur-de-promesses). Tenue.
- Une **clé d'API** a été collée dans la conversation le 22/10 : elle n'a
  été écrite nulle part ; Cédric a été invité à la révoquer.

## Dette, chiffrée

| mesure | 19/10 | 22/10 |
|---|---|---|
| lignes de `src/` (ts, tsx) | 30 551 | 32 276 (+5,6 %) |
| lignes de `tests/` (ts) | 61 396 | 66 473 (+8,3 %) |
| `appStore.ts` | 1 098 | 1 099 |

Les tests croissent plus vite que le code. Plus gros fichiers inchangés en
rang : `appStore.ts`, `ItineraryDetail.tsx`, `matching.ts`, `overpass.ts`.

## Poids livré

`MapView` 961,9 Ko / 248,7 Ko gzip (958 / 247 le 19/10). Mais **`dist/` local
ne se vide plus** (Vite 8.2.1, témoin mesuré) : 104 anciens `MapView-*.js`,
145 Mo, tous précachés par le `sw.js` local — #612.

## Cohérence des textes (relecteur-de-promesses)

Haute gravité :
- la grosse bibliothèque annoncée « pas encore tenue » dans le README et
  PERSONAS, alors que 800 activités passent en 155,8 s depuis le 18/10 — #602 ;
- « une relation sur quatre porte `osmc:symbol` », tiré d'une fixture de
  quatre relations présentée comme « le seul jeu réel » — #603 ;
- **un comportement, pas seulement un texte** : déclarer un parcours pendant
  la démonstration écrirait en base, malgré « Rien n'est enregistré »
  (lecture du code, à prouver par un test) — #600.

Moyenne et basse : « les cinq chemins portent la même garde » (#604), la
feuille mobile et les onglets absents du README (#605), décomptes faux de
PERSONAS et fiche de Paul (#606), `PW_CHROMIUM_PATH` contradictoire (#607),
sous-annonces et ambiguïtés (#608). Trois trouvailles portaient sur la PR
#599 elle-même — dont l'exception « docs seuls » écrite dans `CLAUDE.md` et
dans `AGENTS.md`, déjà divergente : corrigées avant sa fusion.

## Règles jumelles (chasseur-de-jumeaux)

- **Moyenne** : une fiche « ouverte » survit au changement de zone ; tout ce
  qui lit `detailItineraryId !== null` croit une fiche peinte — #601 ;
- « au-dessus de la fiche » dérivé deux fois, « Ma position » à 110 px d'elle
  (arithmétique, non mesuré en navigateur) — #609 ;
- le point de rupture 800 en dur dans `useCreditReplie`, et une garde qui ne
  lit que la première condition d'un `@media` — #610 ;
- la clé `autour:` lue deux fois, trois valeurs de mètres par degré — #611.

Un soupçon **non retenu**, faute de mesure : le cadrage sur la sélection
(`useMapCamera.ts:93`, `padding: 64`) ne réserve pas la feuille repliée
(108 px). À mesurer avant d'en faire une issue.

## Personas contre le livré

Le parcours de Zoé (agent `parcours`, réseau réel, #588) a fait mieux qu'une
relecture : six défauts mesurés, #591 à #596 — « autour de Nouméa » à 0
itinéraire (rayon de 12 km), la carte restée sur Lyon, le fond IGN en 404 dès
le zoom 8 en Nouvelle-Calédonie, le GR NC1 masqué par défaut sous une
légende qui l'annonce, des tronçons sans nom, et une phrase fausse de
PERSONAS.md.

## Mesuré sans rien trouver

La promesse réseau ; les nombres du README contre le code (8 réglages, 100
points d'altimétrie, 19 personas, 19 emprises, 6 grands itinéraires, 600
tuiles, 30 jours, 1 km, 28,5 km/h…) ; les commandes de la CI contre le README
et `CLAUDE.md` ; les commentaires « exporté pour les tests » (leurs tests
existent) ; les emprises de zone contre `ZONES` (d'accord, gardé par
`emprisesDeZone.test.ts` dans les deux sens) ; `RAYON_AUTOUR_METERS` et
`--hauteur-feuille-moitie`, partagés sans copie.

## Les chiffres du cycle (19/10 → 22/10)

- 160 commits fusionnés sur `main` par #586, puis 3 PR du nouveau mode ;
- e2e : 496 → 504 tests ; monkey 3/3 à chaque porte ;
- numéros ouverts le 22/10 : #578 à #613 (PR comprises) ; 14 issues par cette revue, 6 par le parcours de Zoé.
