// Fichier généré par scripts/emprises-de-zone.mjs le 2026-10-22 — ne pas
// éditer à la main. Boîtes englobantes des limites OSM de chaque zone
// prédéfinie — hors celles que le script laisse sans emprise, et dit pourquoi —
// en [ouest, sud, est, nord], arrondies à 1e-4 degré (~10 m).
// © les contributeurs d'OpenStreetMap, ODbL.

import type { Emprise } from './emprisesDeZone.ts'

export const EMPRISES_DE_ZONE: Readonly<Record<string, Emprise>> = {
  // relations 4850451, 4850450
  'rhone': [4.2436, 45.454, 5.1603, 46.3065],
  // relation 7420
  'loire': [3.6884, 45.2311, 4.7608, 46.2765],
  // relation 5536999
  'pilat': [4.3317, 45.2311, 4.873, 45.5778],
  // relations 4850451, 4850450, 7420, 5536999
  'trois': [3.6884, 45.2311, 5.1603, 46.3065],
  // relation 7387
  'ain': [4.7279, 45.6109, 6.1701, 46.5199],
  // relation 1450201
  'allier': [2.2768, 45.9307, 4.0056, 46.8042],
  // relation 7430
  'ardeche': [3.8611, 44.2643, 4.8862, 45.3662],
  // relation 7381
  'cantal': [2.0629, 44.6159, 3.3713, 45.4836],
  // relation 7434
  'drome': [4.6469, 44.1152, 5.8303, 45.344],
  // relation 7437
  'isere': [4.7416, 44.6959, 6.3591, 45.8836],
  // relation 7452
  'haute-loire': [3.0821, 44.7438, 4.4905, 45.4276],
  // relation 7406
  'puy-de-dome': [2.388, 45.2871, 3.9856, 46.2563],
  // relation 7425
  'savoie': [5.6218, 45.0516, 7.1859, 45.9383],
  // relation 7407
  'haute-savoie': [5.8051, 45.6817, 7.0445, 46.4564],
  // relation 7384
  'vosges': [5.3936, 47.8137, 7.1984, 48.5137],
  // relation 7403
  'haut-rhin': [6.8413, 47.4203, 7.622, 48.3113],
  // relation 7415
  'bas-rhin': [6.9406, 48.1203, 8.2326, 49.0778],
  // relation 51854
  'moselle': [5.8918, 48.5266, 7.6388, 49.5149],
  // relation 7423
  'haute-saone': [5.367, 47.2526, 6.8255, 48.0241],
}
