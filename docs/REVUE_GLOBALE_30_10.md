# Revue globale du 30/10

Revue de l'application, pas des diffs (CLAUDE.md §8), en clôture du 30/10. La
précédente date du 26/10 (`docs/REVUE_GLOBALE_26_10.md`) : celle-ci ne refait
pas ce qui n'a pas bougé depuis, et le dit. Dix-neuf commits entre la clôture
du 26/10 (`54b81f0`) et `2412f8c`.

## Déploiement

`main` vert : CI et GitHub Pages en succès sur `2412f8c`, `08cc152` et
`5f191fe`.

## Sécurité

- `npm audit --omit=dev` : **0** vulnérabilité livrée.
- `npm audit` complet : **2 modérées**, inchangé depuis #613.
- Points d'injection : toujours un seul, `setHTML(poiPopupHtml(props))`
  (`src/components/map/useMapInteractions.ts:74`). Ni ce fichier, ni
  `poiPopup.ts`, ni `deploy/csp.conf` n'ont changé depuis le 26/10 : pas relus.

## Trouvailles

Toutes ouvertes en issue, aucune corrigée ici.

- **#642, ce qui sort** : à l'ouverture d'une fiche, `BoutonEmporter` sonde une
  tuile IGN au départ de l'itinéraire (#593). « À propos » et le README ne le
  disent pas. Ce n'est pas une fuite de position, mais la liste de ce qui sort
  n'est plus complète. Lu dans le code, requête non relevée sur le réseau. Dans
  la même issue : l'élargissement à 25 km (#591) n'est annoncé nulle part.
- **#643, recherche** : `cret` trouve « Crêt de la Perdrix » dans l'historique,
  pas dans la liste des itinéraires (§4ter). Le repli NFD est écrit trois fois.
- **#644, démonstration** : `demonstration.ts:70` recopie à moitié
  `displayName`, et dit « itinéraire 2 » pour un GR 9. #641 a réuni deux copies
  de ce repli et laissé celle-ci, qui ne s'écrit pas à l'identique.
- **#571, PERSONAS** : huit puces de six fiches fausses aujourd'hui, listées sur
  l'issue. Karim est la seule vérifiée à la main, les autres sur l'existence
  des modules.

## Dette, chiffrée

| | 26/10 | 30/10 |
|---|---|---|
| `appStore.ts` | 1 104 | 1 104 (plafond 1 105) |
| `ItineraryDetail.tsx` | 779 | 779 |
| `matching.ts` | 747 | 747 |
| `overpass.ts` | 711 | 733 (+3,1 %) |

`overpass.ts` : #595 y a ajouté 20 lignes, le reste vient d'ailleurs.

## Surface d'API

`npm run ports` : 50 ports sur 9 tranches, dont 41 nomment une fonction, toutes
appelées (relevé dans la porte de #641).

## Cohérence des textes

Les promesses de confidentialité n'ont pas changé de formule ; ce qui leur
manque est #642. Le reste : #571.

## Poids livré

`MapView-*.js` 961 ko, `index-*.js` 427 ko (422 le 26/10), ouvrier MapLibre
470 ko, CSS 85 et 68 ko. `dist/` : 6,6 Mo (6,3 le 26/10), dont
`contours-de-zone.json` (#296) : 284 ko, 84 ko gzippés, précaché.

## Mesuré sans rien trouver

- **#296** : 84 ko gzippés, précache, seuil de ~100 m, seuil de trente sorties,
  aucune requête hors de la même origine.
- **#591, #593, #594 volet 2, #595, #611** : les commentaires et le README
  disent ce que fait le code.
- **Zones** : 20 sélecteurs, 20 contours, aucun en trop ni en moins ; seule la
  Nouvelle-Calédonie n'a pas d'emprise, et c'est voulu.
- **Rayons de « autour de »** : tous les lecteurs passent par les deux
  constantes.
- **Non revérifié** : les pourcentages du README qui exigent le réseau, les
  mesures de miroir de #587, et « 11,7 Mo » pour les contours communaux.

## Les chiffres de la journée

- Fusionnées : #637, #639, #640, #641 ; plus #635 et #636 datées du 30/10.
- Fermées : #296, #587, #595, et #604 sans code, sur décision de Cédric.
- Ouvertes : #642, #643, #644.
- Non fait : la mesure CSP sous Firefox (#571), décidée le 30/10.
