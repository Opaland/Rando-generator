import type { LonLat } from "./types.ts";

/**
 * Quelles tuiles couvrent le corridor d'un itinéraire (issue #153).
 *
 * Le cache de tuiles est aujourd'hui alimenté par ce qu'on a **déjà
 * regardé** : préparer sa sortie la veille en zoomant dessus ne garantit
 * rien au départ le lendemain, et le cache est un LRU de six cents entrées
 * que la moindre balade ailleurs suffit à vider.
 *
 * Ce module ne télécharge rien. Il dit **quoi** télécharger, et il le dit
 * exactement — c'est ce compte qui sera montré avant de lancer, et il doit
 * décrire le téléchargement réel, pas une approximation.
 *
 * Tout y est vérifiable sans réseau, et ce n'est pas un hasard : une tuile
 * oubliée ne se voit qu'en montagne, sans réseau, au moment où l'on en a
 * besoin.
 */

/** Côté d'une tuile, en pixels. Constante de la projection Web Mercator. */
export const TAILLE_TUILE_PX = 256;

/**
 * Résolution de Web Mercator à l'équateur, au zoom 0, en mètres par pixel.
 *
 * Ce n'est pas un réglage : c'est la circonférence de la Terre divisée par
 * la largeur d'une tuile.
 */
const RESOLUTION_ZOOM_0 = 156_543.033_928_040_9;

export interface Tuile {
  z: number;
  x: number;
  y: number;
}

export interface OptionsCorridor {
  /** Les niveaux de zoom à couvrir. */
  zooms: number[];
  /**
   * De combien on élargit de part et d'autre du tracé, en mètres.
   *
   * Ce n'est pas une marge d'erreur mais un choix d'usage : on regarde
   * autour de soi quand on se demande où l'on est. Le nombre est décidé par
   * l'appelant, pas ici.
   */
  rayonMetres: number;
}

/** Une clef stable, pour dédoublonner et comparer. */
export function cleTuile({ z, x, y }: Tuile): string {
  return `${String(z)}/${String(x)}/${String(y)}`;
}

/** Combien de mètres vaut un pixel, à cette latitude et à ce zoom. */
export function metresParPixel(lat: number, z: number): number {
  return (RESOLUTION_ZOOM_0 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** La tuile qui contient ce point, à ce zoom. */
export function tuileDe(lon: number, lat: number, z: number): Tuile {
  const cotes = 2 ** z;
  const radians = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * cotes);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
      cotes,
  );
  /*
    Web Mercator s'arrête à ±85,0511° : au-delà, la formule rend un indice
    hors du monde. Une première version bornait donc la latitude avant de
    projeter — et la mutation a montré que cette borne-là ne changeait rien,
    parce que celle-ci fait déjà le travail, y compris pour un pôle exact où
    la tangente part à l'infini. Une seule borne, à l'endroit où le résultat
    doit tenir (CLAUDE.md §4).
  */
  const borner = (v: number) => Math.max(0, Math.min(cotes - 1, v));
  return { z, x: borner(x), y: borner(y) };
}

/** Remplit un gabarit `{z}` / `{x}` / `{y}`. */
export function urlDeTuile(tuile: Tuile, gabarit: string): string {
  return gabarit
    .replace("{z}", String(tuile.z))
    .replace("{x}", String(tuile.x))
    .replace("{y}", String(tuile.y));
}

/**
 * Les tuiles à télécharger pour couvrir le tracé et ses abords.
 *
 * **Le tracé est parcouru, pas échantillonné à ses sommets.** Deux points
 * d'une géométrie OSM peuvent être distants de plusieurs kilomètres : ne
 * prendre que les tuiles des sommets laisserait des trous au milieu des
 * segments, et le trou serait précisément là où l'on marche. On avance donc
 * le long de chaque segment par pas d'une demi-tuile, ce qui garantit qu'on
 * ne saute par-dessus aucune.
 *
 * Le résultat est trié et dédoublonné : le compte annoncé avant de lancer
 * doit décrire le téléchargement réel, à la tuile près.
 */
export function tuilesDuCorridor(
  coords: LonLat[],
  { zooms, rayonMetres }: OptionsCorridor,
): Tuile[] {
  if (coords.length === 0) return [];
  const vues = new Set<string>();
  const tuiles: Tuile[] = [];

  const ajouter = (tuile: Tuile) => {
    const cle = cleTuile(tuile);
    if (vues.has(cle)) return;
    vues.add(cle);
    tuiles.push(tuile);
  };

  for (const z of zooms) {
    const cotes = 2 ** z;
    for (const [lon, lat] of pointsDuTrace(coords, z)) {
      const centre = tuileDe(lon, lat, z);
      // De combien de tuiles il faut s'écarter pour couvrir le rayon
      // demandé. À 45° de latitude et au zoom 16, une tuile fait environ
      // 430 m : un corridor de 500 m déborde donc d'une tuile de chaque
      // côté, et de plus en plus à mesure qu'on zoome.
      //
      // La borne n'est pas une précaution de style : sans elle, ce module
      // partait en boucle. Près d'un pôle, `metresParPixel` n'approche pas
      // zéro, il en approche de dix-sept ordres de grandeur — parce que
      // `Math.cos(π/2)` vaut 6,1 × 10⁻¹⁷ et non 0. Un garde `cote > 0` ne
      // protège donc de rien : la marge calculée valait trois millions de
      // milliards de tuiles.
      //
      // Au-delà de la largeur du monde à ce zoom, il n'y a plus rien à
      // couvrir. Ce n'est pas un nombre choisi : c'est la taille de la carte.
      const cote = metresParPixel(lat, z) * TAILLE_TUILE_PX;
      // Pas de garde sur `cote` : s'il valait zéro, le quotient serait
      // l'infini, et `Math.min` le ramènerait à la largeur du monde. La
      // borne fait le travail des deux.
      const marge = Math.min(cotes, Math.ceil(rayonMetres / cote));
      for (let dx = -marge; dx <= marge; dx++) {
        for (let dy = -marge; dy <= marge; dy++) {
          const x = centre.x + dx;
          const y = centre.y + dy;
          if (x < 0 || y < 0 || x >= cotes || y >= cotes) continue;
          ajouter({ z, x, y });
        }
      }
    }
  }
  return tuiles;
}

/**
 * Le tracé, redécoupé assez fin pour qu'aucune tuile ne soit sautée.
 *
 * Le pas vaut la moitié d'une tuile : c'est la condition pour qu'un segment
 * qui traverse une tuile en pose au moins un point dedans, quelle que soit
 * son orientation.
 */
function* pointsDuTrace(coords: LonLat[], z: number): Generator<LonLat> {
  // Pas de borne sur le nombre de morceaux, et ce n'est pas un oubli : une
  // première version en posait une, à la largeur du monde. La mutation a
  // montré qu'elle ne servait à rien — un segment ne peut pas traverser
  // deux fois la carte, donc `voulus` ne peut pas dépasser cette borne.
  // Près d'un pôle, le pas et la distance deviennent infinitésimaux
  // ensemble, et leur quotient reste petit. C'est la marge, plus bas, qui
  // protège de l'explosion.
  let a: LonLat | null = null;
  for (const b of coords) {
    if (a === null) {
      yield b;
      a = b;
      continue;
    }
    const latMoyenne = (a[1] + b[1]) / 2;
    const pas = (metresParPixel(latMoyenne, z) * TAILLE_TUILE_PX) / 2;
    // Le `pas > 0` est un plancher contre une division par zéro qu'aucune
    // latitude réelle ne produit — `Math.cos` ne rend jamais exactement 0
    // pour un angle fini. La couverture le signale donc comme inatteignable,
    // et c'est exact : il est là pour que l'inatteignable le reste.
    const morceaux =
      pas > 0 ? Math.max(1, Math.ceil(distanceApprochee(a, b) / pas)) : 1;
    for (let k = 1; k <= morceaux; k++) {
      const t = k / morceaux;
      yield [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    a = b;
  }
}

/**
 * Une longueur de segment suffisante pour décider d'un nombre de pas.
 *
 * On n'a pas besoin de la géodésique ici — seulement de ne jamais
 * sous-estimer, pour ne pas sauter de tuile. L'approximation
 * équirectangulaire majore sur les distances courtes qui nous intéressent,
 * et coûte un cosinus au lieu d'un haversine sur des dizaines de milliers
 * de segments.
 */
function distanceApprochee(a: LonLat, b: LonLat): number {
  const METRES_PAR_DEGRE = 111_320;
  const dLat = (b[1] - a[1]) * METRES_PAR_DEGRE;
  const dLon =
    (b[0] - a[0]) *
    METRES_PAR_DEGRE *
    Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}
