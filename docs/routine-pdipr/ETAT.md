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
| — | `puy-de-dome` | livré | 1 | #672 | #87, #668, #674, #675, #676 | 11/11, WFS du CRAIG, 442 itinéraires, LO 1.0, mention « CD63-2026 » ; VTT et équestre gardés (Cédric, 18/11) |
| 5 | `haute-loire` | bloqué | 0 | | #682 | 12/11 : rien d'ouvert ; portail Geotrek du Département sans licence |
| 6 | `cantal` | bloqué | 0 | | #682 | 12/11 : rien au CRAIG ni sur data.gouv.fr |
| — | `allier` | attend Cédric | — | | #683 | 12/11 : jeu 2024 « pas d'usage commercial » (CRAIG) ; copie 2020 en LO 2.0 posée par Madada |
| 8 | `vosges` | bloqué | 0 | | #682 | 12/11 : aucun PDIPR départemental ouvert (data.gouv.fr, DataGrandEst) |
| 9 | `haut-rhin` | bloqué | 0 | | #682 | 12/11 : aucun PDIPR départemental ouvert (data.gouv.fr, DataGrandEst) |
| 10 | `bas-rhin` | bloqué | 0 | | #682 | 12/11 : aucun PDIPR départemental ouvert (data.gouv.fr, DataGrandEst) |
| 11 | `moselle` | bloqué | 0 | | #682 | 12/11 : aucun PDIPR départemental ouvert (data.gouv.fr, DataGrandEst) |
| 12 | `haute-saone` | bloqué | 0 | | #682 | 12/11 : aucun PDIPR départemental ouvert (data.gouv.fr, DataGrandEst) |
| 13 | `meurthe-et-moselle` | bloqué | 0 | | #682, #694 | 19/11 : zone ajoutée (#693) ; LO 1.0 nommée par le producteur ; serveur `webcarto.infogeo54.fr` refuse les robots (403 « ogo ») : attend le shapefile téléchargé à la main |
| 14 | `savoie` | à faire | 0 | | #87 | 23/11 : remise dans la file par Cédric ; « PDIPR73 » publié par le Département sur data.gouv.fr en LO 1.0 (`fr-lo`) |
| — | `haute-savoie` | livré | 0 | #699 | #87, #700, #701 | 23/11, shapefile 2023 du Département (data.gouv.fr), LO 2.0, 14 617 lignes ; 7 897 déjà dans OSM à ≥ 80 % |

## Journal

Une ligne par passage : `AAAA-MM-JJ — zone — tentative n — résultat — PR/issues`.

- 2026-11-10 — rhone — faite à la main (#664), modèle des passages suivants.
- 2026-11-10 — loire, drome, ardeche — pas de jeu embarquable, pas un échec — bloqués, #666.
- 2026-11-10 — puy-de-dome — tentative 1 — échec : e2e `credit-peint` rouge, le crédit déplié recouvre « Ma position » (#668) ; PR brouillon, `parcours` reporté au passage suivant — #87, #668.
- 2026-11-11 — puy-de-dome — tentative 2 — verte : #668 corrigé (le crédit d'un PDIPR suit la zone peinte, le cadrage réserve le crédit déplié) ; porte complète, relecture adverse, `parcours` (Jeanine, Bernard) ; trois issues pour Cédric (#674, #675, #676) — #672 fusionnée.
- 2026-11-12 — haute-loire, cantal, vosges, haut-rhin, bas-rhin, moselle, haute-saone — pas de jeu ouvert, pas un échec — bloqués, #682.
- 2026-11-12 — allier — licence non nommée (« pas d'usage commercial ») — attend Cédric, #683.
- 2026-11-12 — **file épuisée** : plus aucune zone `à faire` ni `en cours`. La routine s'arrête là jusqu'à une décision de Cédric (#666, #682, #683, Savoie et Haute-Savoie) ou une zone ajoutée à la file.
- 2026-11-13 — file vide — aucune réponse sur #682, #683 ; catalogue régional revérifié : aucune fiche PDIPR pour la Loire, l'Ardèche, la Drôme (#666, commenté) — rien à faire, arrêt.
- 2026-11-16 — file vide — passages du 14 et du 15/11 non traités le soir même, rattrapés ensemble ; aucun changement sur `main` ni réponse sur #666, #682, #683 — rien à faire, arrêt.
- 2026-11-18 — puy-de-dome — Cédric garde les 7 boucles VTT et la boucle équestre (question ouverte depuis #672) ; passage du 17/11 rattrapé : file vide, rien d'autre.
- 2026-11-19 — Cédric valide les propositions des 12-18/11 : le lien data.gouv.fr suffit pour la date de mise à jour de la LO 1.0 (Puy-de-Dôme) ; la Meurthe-et-Moselle devient une zone et entre dans la file ; la routine continue.
- 2026-11-19 — meurthe-et-moselle — zone ajoutée (#693), licence nommée, téléchargement refusé aux robots — pas un échec — bloqué, #694. Savoie et Haute-Savoie : licence nommée par le producteur trouvée sur data.gouv.fr, question posée à Cédric.
- 2026-11-20 — file sans zone à faire — attend Cédric : Savoie et Haute-Savoie (licence nommée trouvée le 19/11), fichier de la Meurthe-et-Moselle (#694) ; rien sur Drive ni sur les issues — arrêt.
- 2026-11-21 — file sans zone à faire — toujours en attente de Cédric (Savoie, Haute-Savoie ; fichier de la Meurthe-et-Moselle, #694) — arrêt.
- 2026-11-22 — file sans zone à faire — toujours en attente de Cédric (Savoie, Haute-Savoie ; fichier de la Meurthe-et-Moselle, #694) — arrêt.
- 2026-11-23 — haute-savoie — tentative 1 — verte : shapefile 2023 intégré, projection recoupée par le KML du Département ; porte, relecture adverse, `parcours` (Jeanine, Bernard) ; issues #700 (réseau de fond suspendu à Overpass), #701 (légende) et complément de #674 — #699 fusionnée. Cédric remet la Savoie et la Haute-Savoie dans la file (« reprends les routines »).
