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
};

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
