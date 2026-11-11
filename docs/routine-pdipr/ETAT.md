# Routine PDIPR — état

**Source unique** de l'avancement de la routine (`ROUTINE.md`). Mise à jour
dans la PR de chaque passage ; quand une PR de la routine est ouverte, c'est
l'`ETAT.md` de **sa branche** qui fait foi.

Statuts : `livré` · `en cours` · `à faire` · `bloqué (issue)` ·
`attend Cédric (issue)` — ce dernier n'est **jamais** repris par la routine
tant que Cédric n'a pas répondu sur l'issue.

| Ordre | Zone (`id`) | Statut | Échecs /10 | PR | Issues | Note |
|---|---|---|---|---|---|---|
| — | `isere` | livré | — | — | #87 | 18/10, tronçons, LO 2.0 |
| — | `ain` | livré | — | #574 | #87 | 21/10, boucles diffusables, LO 2.0 |
| — | `rhone` | livré | — | #664 | #20, #87 | courriel du Département, shapefile L93, LO 2.0 |
| 1 | `loire` | bloqué | 0 | | #666 | 10/11 : rien sur data.gouv.fr ni au wiki OSM ; datARA injoignable (502) |
| 2 | `drome` | bloqué | 0 | | #666 | 10/11 : jeu sur data.gouv.fr sans licence, portail `infogeo.ladrome.fr` injoignable |
| 3 | `ardeche` | bloqué | 0 | | #666 | 10/11 : rien sur data.gouv.fr ; datARA injoignable (502) |
| 4 | `puy-de-dome` | en cours | 1 | #672 | #87, #668 | 10/11 : WFS du CRAIG, 442 itinéraires, LO 1.0, mention « CD63-2026 » ; 11/11 : #668 corrigé dans #672 |
| 5 | `haute-loire` | à faire | 0 | | | |
| 6 | `cantal` | à faire | 0 | | | |
| 7 | `allier` | à faire | 0 | | | piste du 10/11 : couche WFS `public:DEPT03_2024_PDIPR` au CRAIG (licence à lire) |
| 8 | `vosges` | à faire | 0 | | | |
| 9 | `haut-rhin` | à faire | 0 | | | |
| 10 | `bas-rhin` | à faire | 0 | | | |
| 11 | `moselle` | à faire | 0 | | | |
| 12 | `haute-saone` | à faire | 0 | | | |
| — | `savoie` | attend Cédric | — | | | condition non nommée (FEUILLE_DE_ROUTE, 18/10) |
| — | `haute-savoie` | attend Cédric | — | | | idem |

## Journal

Une ligne par passage : `AAAA-MM-JJ — zone — tentative n — résultat — PR/issues`.

- 2026-11-10 — rhone — faite à la main (#664), modèle des passages suivants.
- 2026-11-10 — loire, drome, ardeche — pas de jeu embarquable, pas un échec — bloqués, #666.
- 2026-11-10 — puy-de-dome — tentative 1 — échec : e2e `credit-peint` rouge, le crédit déplié recouvre « Ma position » (#668) ; PR brouillon, `parcours` reporté au passage suivant — #87, #668.
- 2026-11-11 — puy-de-dome — tentative 2 — #668 corrigé (le crédit d'un PDIPR suit la zone peinte) ; porte, `parcours`, relecture — #672.
