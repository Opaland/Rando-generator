/*
  D'où viennent les PDIPR départementaux : l'adresse de l'export et la ligne
  de source qui l'accompagne. Partagé par `preparer-pdipr.mjs` (qui les
  embarque) et `recouvrement-pdipr-osm.mjs` (qui les mesure contre
  OpenStreetMap) : deux listes d'adresses recopiées finissent par diverger
  (CLAUDE.md §4).
*/
export const SOURCES_PDIPR = {
  isere: {
    url:
      "https://opendata.isere.fr/api/explore/v2.1/catalog/datasets/" +
      "plan-departemental-des-itineraires-de-promenades-et-de-randonnees-departement-de" +
      "/exports/geojson",
    source: "Département de l'Isère — PDIPR, Licence Ouverte 2.0",
    // Le nom de la zone administrative, tel que l'application l'interroge
    // (`core/overpass.ts`, AURA_DEPARTEMENTS).
    nom: "Isère",
  },
  ain: {
    url:
      "https://departement-ain.opendata.arcgis.com/api/download/v1/items/" +
      "09837461f2e146fda2fafc7aa0698a10/geojson?layers=101",
    source: "Département de l'Ain — PDIPR itinéraire, Licence Ouverte 2.0",
    nom: "Ain",
  },
  /*
    Le Rhône, le 09/11 : datARA ne livre son export que par panier, et
    rendait 403 le 22/10 (#20, #87). Le Département a envoyé le jeu par
    courriel le 06/11 — un shapefile en Lambert-93, sans métadonnées —, et
    Cédric a confirmé ce jour la Licence Ouverte 2.0. Il n'y a donc pas
    d'adresse à télécharger : le fichier se donne sur la ligne de commande.
    Les deux classements du jeu (« Réseau touristique » et « Réserve ») sont
    gardés, décision de Cédric du 09/11.
  */
  rhone: {
    shapefile: "Lambert-93",
    source: "Département du Rhône — PDIPR, Licence Ouverte 2.0",
    nom: "Rhône",
  },
};

/**
 * L'export brut d'une zone, en FeatureCollection WGS84 : téléchargé quand le
 * producteur publie une adresse, lu sur le disque sinon (`chemin`, le `.shp`
 * reçu). Une seule façon de l'obtenir pour les scripts qui le préparent et
 * qui le mesurent (CLAUDE.md §4).
 */
export async function exportBrut(zone, chemin) {
  const { url, shapefile } = SOURCES_PDIPR[zone];
  if (url) {
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`${url} → HTTP ${reponse.status}`);
    return reponse.json();
  }
  if (!chemin) {
    throw new Error(
      `${zone} n'a pas d'adresse publique : donner le .shp reçu (${shapefile}) en second argument`,
    );
  }
  const { readFileSync } = await import("node:fs");
  const { lignesDuShapefile } = await import("../src/core/shapefile.ts");
  const { lambert93VersWgs84 } = await import("../src/core/lambert93.ts");
  const octets = readFileSync(chemin);
  const lignes = lignesDuShapefile(
    octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength),
  );
  return {
    type: "FeatureCollection",
    features: lignes.map((ligne) => ({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: ligne.map(([x, y]) => lambert93VersWgs84(x, y)),
      },
    })),
  };
}

/** La zone demandée sur la ligne de commande, ou une erreur qui dit les connues. */
export function zoneDemandee(argument, defaut) {
  const zone = argument ?? defaut;
  if (!Object.hasOwn(SOURCES_PDIPR, zone)) {
    throw new Error(
      `zone inconnue : ${zone} (connues : ${Object.keys(SOURCES_PDIPR).join(", ")})`,
    );
  }
  return zone;
}
