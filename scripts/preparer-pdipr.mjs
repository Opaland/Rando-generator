/*
  Prépare le PDIPR de l'Isère pour l'embarquer avec le site (issue #87).

    npm run pdipr

  À relancer quand le Département republie (le jeu dit sa date de mise à
  jour : `modified`, 18/10 à l'extraction) ; le fichier produit porte la sienne.

  L'export brut (opendata.isere.fr, Licence Ouverte 2.0, © Département de
  l'Isère) pèse 25,6 Mo pour 16 862 tronçons et 560 215 points, mesuré le
  18/10. Trop lourd pour être servi tel quel à un téléphone : on ne garde que
  la géométrie, simplifiée et arrondie.

  Les deux réglages ne changent que **ce qui est dessiné** — le réseau de fond
  n'entre dans aucun calcul (ni appariement, ni distance, ni pourcentage) :
  ce sont des seuils de présentation, tranchés au jugement et écrits ici
  comme tels (CLAUDE.md §2).

  - **Simplification à 5 m** (Douglas-Peucker). Mesuré sur l'export du 18/10 :
    2 m → 3,6 Mo ; 5 m → 2,4 Mo (770 Ko compressé) ; 10 m → 1,8 Mo. À 5 m, un
    tracé reste collé au sentier du fond IGN au zoom où on le regarde ; 10 m
    commence à couper les lacets. Écarté : 2 m, une fois et demie plus lourd
    pour un écart invisible à l'écran.
  - **Cinq décimales** (~1,1 m) : en deçà de la simplification, donc sans
    effet visible ; au-delà, des octets pour rien.
*/
import { writeFileSync } from "node:fs";
import { jeuPdiprPour, parseReseauPdipr } from "../src/core/pdipr.ts";

const SOURCE =
  "https://opendata.isere.fr/api/explore/v2.1/catalog/datasets/" +
  "plan-departemental-des-itineraires-de-promenades-et-de-randonnees-departement-de" +
  "/exports/geojson";
const JEU = jeuPdiprPour("isere");
const CIBLE = `public/${JEU.fichier}`;
const TOLERANCE_M = 5;
const DECIMALES = 5;

function simplifier(points, toleranceM) {
  if (points.length < 3) return points;
  const kx = 111195 * Math.cos((points[0][1] * Math.PI) / 180);
  const ky = 111195;
  const xy = points.map(([lon, lat]) => [lon * kx, lat * ky]);
  const garde = new Array(points.length).fill(false);
  garde[0] = garde[points.length - 1] = true;
  const pile = [[0, points.length - 1]];
  while (pile.length > 0) {
    const [a, b] = pile.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const longueur = Math.hypot(dx, dy);
    let pire = -1;
    let indice = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const d =
        longueur > 0
          ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / longueur
          : Math.hypot(px - ax, py - ay);
      if (d > pire) {
        pire = d;
        indice = i;
      }
    }
    if (pire > toleranceM) {
      garde[indice] = true;
      pile.push([a, indice], [indice, b]);
    }
  }
  return points.filter((_, i) => garde[i]);
}

const arrondi = (v) => Number(v.toFixed(DECIMALES));

const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`${SOURCE} → HTTP ${reponse.status}`);
const brut = await reponse.json();

/*
  Une seule entité MultiLineString plutôt qu'une par tronçon : l'enveloppe
  `{"type":"Feature","properties":{},"geometry":…}` répétée 17 415 fois
  pesait 1,4 Mo à elle seule (3,9 Mo contre 2,4, mesuré le 18/10), pour une
  information — « ceci est un tronçon » — que la géométrie dit déjà.
  `parseReseauPdipr` la redécoupe en lignes à la lecture.
*/
/*
  Le filtre est celui de la lecture (`parseReseauPdipr`, emprise comprise) :
  on n'embarque pas les octets d'un tronçon que la carte écarterait. Le
  18/10, il retire les 2 102 tronçons de Grenoble-Alpes Métropole, reprojetés
  au large de l'Afrique dans l'export lui-même — voir `EMPRISE_ISERE`.
*/
const lus = parseReseauPdipr(brut, JEU.emprise);
const brutes = (brut.features ?? []).reduce(
  (total, f) =>
    total +
    (f.geometry?.type === "MultiLineString"
      ? f.geometry.coordinates.length
      : 1),
  0,
);
const lignesSimplifiees = [];
let points = 0;
for (const { geometry } of lus.features) {
  const simple = simplifier(geometry.coordinates, TOLERANCE_M).map(
    ([lon, lat]) => [arrondi(lon), arrondi(lat)],
  );
  if (simple.length < 2) continue;
  points += simple.length;
  lignesSimplifiees.push(simple);
}

const sortie = {
  type: "FeatureCollection",
  source: "Département de l'Isère — PDIPR, Licence Ouverte 2.0",
  extrait: new Date().toISOString().slice(0, 10),
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: lignesSimplifiees },
    },
  ],
};
writeFileSync(CIBLE, JSON.stringify(sortie));
console.log(
  `${CIBLE} : ${lignesSimplifiees.length} lignes retenues sur ${brutes}, ` +
    `${points} points, ` +
    `${Math.round(JSON.stringify(sortie).length / 1024)} Ko.`,
);
