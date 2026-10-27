# Revue globale du 26/10

Revue de l'application, pas des diffs (CLAUDE.md §8), en clôture de la
session du 26/10. La précédente date du 22/10 (`docs/REVUE_GLOBALE_22_10.md`) :
celle-ci ne refait pas ce qui n'a pas bougé depuis, et le dit.

## Déploiement

`main` vert : CI et GitHub Pages en succès sur chacun des commits de la
journée (`4d42ffd`, `71b3f33`, `325c128`, puis les fusions qui suivent).
L'exécution `push` d'une PR peut encore caler à l'installation de Chromium
avant tout test (#587, revu le 26/10 sur la PR #616) ; l'exécution
`pull_request` du même commit fait foi.

## Sécurité

- `npm audit --omit=dev` : **0** vulnérabilité livrée.
- `npm audit` complet : **9** le 26/10 (3 hautes : `vite` via
  `launch-editor`, `undici`, `zod`), toutes en dépendances de
  développement. Après #613 : **2 modérées**, `qs` 6.15.1 épinglé à la
  version exacte par `typed-rest-client`, que Stryker n'emploie que pour
  publier un rapport sur un tableau de bord — laissé en l'état plutôt que
  forcé par `overrides` contre l'épinglage amont.
- Points d'injection : un seul, `setHTML(poiPopupHtml(props))`
  (`useMapInteractions.ts:74`). Les quatre interpolations de
  `poiPopup.ts` passent toutes par `escapeHtml`, relues une à une.

## Ce que la journée a trouvé hors de son sujet

- **`fs.rmSync` ne supprime rien, sans erreur, sous un chemin accentué**
  (Node 24.13, Windows) — « Moretti Cédric ». C'est lui qui laissait
  `dist/` grossir (#612), et non Vite : la piste de l'issue,
  `emptyOutDir`, mesurée sans effet. Même défaut dans
  `generer-integrations.mjs`, qui annonçait « supprimé » des orphelins
  restés en place. Corrigé par #620 ; ESLint interdit désormais `rmSync`.
  **Non signalé en amont**, et non vérifié sur une version plus récente
  de Node. Les dépendances l'emploient ailleurs, hors de portée de la
  règle.
- **Le tracé à la main écrivait en base pendant la démonstration** : trouvé
  par la relecture adverse du correctif de #600, pas par l'issue. Corrigé
  dans la même PR (#616).
- **La légende et la carte ne lisaient pas le même filtre** (§4ter), #594
  volet 1 (#619).

## Dette, chiffrée

| | 22/10 | 26/10 |
|---|---|---|
| `appStore.ts` | 1 099 | 1 104 (plafond 1 105) |
| plus gros fichiers | `appStore.ts`, `ItineraryDetail.tsx`, `matching.ts`, `overpass.ts` | inchangé (1 104, 779, 747, 711) |

Le plafond du store a servi le jour même : #601 le dépassait de 9 lignes.
La logique est allée dans la tranche de la fiche plutôt que de relever le
plafond.

Vu en passant, non ouvert : la recherche « itinéraire par identifiant, zone
puis perso » est écrite deux fois (`appStore.ts`, dépendance de
`trancheFiche`, et `ItineraryDetail.tsx:109-110`). Même résultat
aujourd'hui, pas de désaccord mesuré.

## Surface d'API

`npm run ports` : 50 ports sur 9 tranches, tous appelés. Les ajouts du jour
(`fermerLaFicheOrpheline`, `viderLaSortie`, le paramètre `reseauxVisibles`
de `contenuLegende`) ont chacun un appelant et un test.

## Cohérence des textes

- Les promesses de confidentialité (« ne quitte jamais… ») n'ont pas bougé ;
  celle de l'import reste #558.
- « Rien n'est enregistré » (`DemoBanner.tsx`) est **vraie de nouveau**
  depuis #616, pour la déclaration et le tracé. Que l'écran dise la sortie
  de la démonstration : #615, décidé par Cédric.
- `docs/PERSONAS.md` : rien de neuf contre le livré du jour. Ce qui reste
  faux sur Zoé (« Nouméa » introuvable) est déjà #596.

## Poids livré

`index-*.js` 422 ko, `MapView-*.js` 961 ko, CSS 67 ko — Vite 8.3.5 après
#613, à quelques centaines d'octets du 22/10. `dist/` : 6,3 Mo une fois
vidé (#612), contre ~150 Mo empilés.

## Mesuré sans rien trouver

- Écrivains de `itineraries` (#601) : aucun autre ne laisse de fiche
  orpheline (relecture adverse).
- Les préférences écrites pendant la démonstration (tolérance, objectifs,
  dernière zone) : ce ne sont pas des données de l'utilisateur, laissées
  hors de la garde.

## Les chiffres de la journée

- Fermées par une PR : #600, #601, #592 ; puis #612 et #613 si leurs PR
  fusionnent (#620 et la suivante) ; #594 volet 1 (#619, `Refs`).
- Ouverte : #615 (dire la sortie de la démonstration).
- Décisions de Cédric : #585, #584 (360 px), #591, #593, et le message de
  #615.
