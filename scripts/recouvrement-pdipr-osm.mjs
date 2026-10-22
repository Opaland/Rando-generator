/*
  Quelle part d'un PDIPR départemental OpenStreetMap a-t-il déjà ?

    npm run recouvrement -- ain

  Pour chaque objet de l'export (boucle ou tronçon), la part de ses points
  — un sur trois — qui tombe à moins de 30 m d'un chemin membre d'une
  relation PR (`network=lwn`) de la même zone. Rend la répartition en trois
  classes : < 20 %, 20 à 80 %, ≥ 80 %.

  Écrit le 21/10 (#574) après coup : la première mesure, jetable, vivait
  dans le scratchpad, et le chiffre qu'elle avait rendu — 81 boucles de
  l'Ain déjà couvertes à ≥ 80 % — était cité par le README et le PRD sans
  que rien dans le dépôt permette de le refaire (revue du sprint 2).

  **Le témoin passe avant la mesure, et l'arrête s'il échoue.** La première
  version rendait 0 partout : la requête `out tags geom` ne rapporte que
  les emprises des relations, pas leurs chemins, et l'outil ne voyait rien.
  Une mesure qui ne peut pas échouer ne prouve rien (CLAUDE.md §1) : ici,
  vingt objets comparés à leur propre géométrie doivent sortir à ≥ 80 %,
  et vingt autres, comparés à une géométrie déplacée de 2 km, à < 20 %.

  Les seuils de 30 m, 20 % et 80 % décrivent la mesure, ils ne décident de
  rien : ce script ne retire aucune boucle. Compter ou non les boucles d'un
  PDIPR est une décision de Cédric (§2) — pour l'Ain, le 21/10 : jamais.

  Réseau : l'export du Département et Overpass. Rien n'est écrit.
*/
import { SOURCES_PDIPR, zoneDemandee } from "./sources-pdipr.mjs";

const ZONE = zoneDemandee(process.argv[2], "ain");
const { url, nom } = SOURCES_PDIPR[ZONE];
const DISTANCE_M = 30;
const CASE_M = 200;
const MIROIRS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Projection locale en mètres, suffisante à l'échelle d'un département. */
function projeteur(latitude) {
  const ky = 111195;
  const kx = ky * Math.cos((latitude * Math.PI) / 180);
  return ([lon, lat]) => [lon * kx, lat * ky];
}

function distanceAuSegment([px, py], [[ax, ay], [bx, by]]) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Les segments des chemins, rangés dans une grille pour la recherche. */
function grilleDe(chemins, projeter) {
  const grille = new Map();
  const cle = (x, y) => `${Math.floor(x / CASE_M)},${Math.floor(y / CASE_M)}`;
  for (const chemin of chemins) {
    const p = chemin.map(projeter);
    for (let i = 1; i < p.length; i++) {
      const segment = [p[i - 1], p[i]];
      for (const k of new Set([cle(...p[i - 1]), cle(...p[i])])) {
        if (!grille.has(k)) grille.set(k, []);
        grille.get(k).push(segment);
      }
    }
  }
  return grille;
}

function partCouverte(lignes, grille, projeter) {
  const points = lignes.flat().map(projeter).filter((_, i) => i % 3 === 0);
  if (points.length === 0) return 0;
  let couverts = 0;
  for (const p of points) {
    const cx = Math.floor(p[0] / CASE_M);
    const cy = Math.floor(p[1] / CASE_M);
    let pres = false;
    for (let dx = -1; dx <= 1 && !pres; dx++) {
      for (let dy = -1; dy <= 1 && !pres; dy++) {
        for (const s of grille.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (distanceAuSegment(p, s) <= DISTANCE_M) {
            pres = true;
            break;
          }
        }
      }
    }
    if (pres) couverts++;
  }
  return couverts / points.length;
}

const lignesDe = (f) =>
  f.geometry?.type === "LineString"
    ? [f.geometry.coordinates]
    : f.geometry?.type === "MultiLineString"
      ? f.geometry.coordinates
      : [];

function repartition(parts) {
  return {
    "< 20 %": parts.filter((v) => v < 0.2).length,
    "20 à 80 %": parts.filter((v) => v >= 0.2 && v < 0.8).length,
    "≥ 80 %": parts.filter((v) => v >= 0.8).length,
  };
}

async function overpass(requete) {
  for (const miroir of MIROIRS) {
    const reponse = await fetch(miroir, {
      method: "POST",
      body: new URLSearchParams({ data: requete }),
      headers: { "User-Agent": "Sentiers-mesure/1.0" },
    }).catch(() => null);
    if (reponse?.ok) {
      const json = await reponse.json().catch(() => null);
      if (json?.elements?.length) return json;
    }
    console.error(`${miroir} : ${reponse ? reponse.status : "injoignable"}, miroir suivant`);
  }
  throw new Error("aucun miroir Overpass n'a répondu");
}

const reponse = await fetch(url);
if (!reponse.ok) throw new Error(`${url} → HTTP ${reponse.status}`);
const objets = (await reponse.json()).features.filter((f) => lignesDe(f).length > 0);
const premier = lignesDe(objets[0])[0][0];
const projeter = projeteur(premier[1]);

// Le témoin, sur l'export seul : il ne dépend ni du réseau ni d'OSM.
const temoin = objets.slice(0, 20).flatMap(lignesDe);
const grilleTemoin = grilleDe(
  temoin.map((l) => l.map(([lon, lat]) => [lon, lat])),
  projeter,
);
const memes = objets.slice(0, 20).map((f) => partCouverte(lignesDe(f), grilleTemoin, projeter));
const deplaces = objets
  .slice(0, 20)
  .map((f) =>
    partCouverte(
      lignesDe(f).map((l) => l.map(([lon, lat]) => [lon + 0.03, lat])),
      grilleTemoin,
      projeter,
    ),
  );
if (memes.some((v) => v < 0.8) || deplaces.some((v) => v >= 0.2)) {
  throw new Error(
    `témoin en échec — l'outil ne discrimine pas : ${JSON.stringify({ memes, deplaces })}`,
  );
}

const requete =
  `[out:json][timeout:250];` +
  `area["boundary"="administrative"]["admin_level"="6"]["name"="${nom}"]->.a;` +
  `rel(area.a)["type"="route"]["route"~"^(hiking|foot|walking)$"]["network"="lwn"];` +
  `way(r);out geom qt;`;
const chemins = (await overpass(requete)).elements
  .filter((e) => e.type === "way" && e.geometry)
  .map((e) => e.geometry.map((p) => [p.lon, p.lat]));
const grille = grilleDe(chemins, projeter);
const parts = objets.map((f) => partCouverte(lignesDe(f), grille, projeter));

console.log(
  `${nom} — ${objets.length} objets du PDIPR, ${chemins.length} chemins PR d'OSM ;` +
    ` témoin vérifié (20 sur 20 à ≥ 80 %, 20 déplacés sur 20 à < 20 %).`,
);
console.log("Part de chaque objet déjà couverte par OSM (≤ 30 m) :");
console.log(repartition(parts));
