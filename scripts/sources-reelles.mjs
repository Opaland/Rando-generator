#!/usr/bin/env node
/*
  Les sources publiques, interrogées pour de vrai (issue #669).

    npm run sources                       le rapport, dans la console
    npm run sources -- --rapport f.md     et dans un fichier

  La CI tourne sans réseau, et c'est voulu : quand une source change, on
  l'apprenait par hasard — l'export de l'Isère a placé 2 102 tronçons au
  large de l'Afrique (18/10), l'API de datARA est passée à 403 (22/10, #20).

  Chaque source reçoit une petite requête, et sa réponse passe par **le
  lecteur de l'application** (`parseOverpassResponse`, `parseReseauPdipr`…),
  pas par une seconde idée de sa forme : « format changé » veut dire
  exactement « ce que Sentiers ne saurait plus lire » (CLAUDE.md §4ter).

  Le tri (`scripts/sources/verdict.ts`) suit le dépôt Netatmo : injoignable
  ou surchargée → ignorée ; refusée ou d'une autre forme → rouge, et le code
  de sortie vaut 1. Le flux `.github/workflows/sources.yml` en fait une issue.

  Le rapport ne porte que des noms de champs et des comptes, jamais un
  extrait des données.

  Les PDIPR sont **lus dans `sources-pdipr.mjs`** : chaque département qui y
  reçoit une adresse est contrôlé ici sans rien ajouter. Le Rhône n'en a
  pas — son jeu est arrivé par courriel — et datARA n'en fournit aucune que
  l'application ou un script emploie : il n'y a rien à interroger.
*/
import { writeFileSync, appendFileSync } from "node:fs";
import { OVERPASS_MIRRORS, buildAroundQuery, parseOverpassResponse } from "../src/core/overpass.ts";
import { buildElevationLineUrl, parseElevationResponse } from "../src/core/elevation.ts";
import { buildGeocodeUrl, parseGeocodeResponse } from "../src/core/geocode.ts";
import { jeuPdiprPour, parseReseauPdipr } from "../src/core/pdipr.ts";
import { IGN_TILES } from "../src/components/map/style.ts";
import { SOURCES_PDIPR } from "./sources-pdipr.mjs";
import { verdictDe, etatGlobal, rapport } from "./sources/verdict.ts";

/** Le Crêt de la Perdrix, dans le Pilat : la zone de départ de l'application. */
const PILAT = [4.6, 45.36];
const DELAI_MS = 120_000;
/** Deux points sur la crête du Pilat, à quelques centaines de mètres. */
const ALTI = [PILAT, [4.605, 45.362]];

/*
  Un agent nommé, sans adresse ni contact : sans lui, overpass-api.de répond
  406 à l'agent par défaut de Node — mesuré le 12/11, trois fois sur trois —,
  ce qui passerait pour une source changée. Le navigateur, lui, en envoie
  toujours un.
*/
const AGENT = "Sentiers (controle des sources publiques)";

function demander(url, init = {}) {
  return fetch(url, { ...init, headers: { ...init.headers, "User-Agent": AGENT } });
}

/** La tuile qui contient un point, au zoom donné (Web Mercator, comme le fond). */
function tuile([lon, lat], z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x, y, z };
}

/** Les noms de champs d'une entité, triés : la seule chose qu'on en rapporte. */
function champsDe(feature) {
  const props = feature?.properties;
  return props && typeof props === "object" ? Object.keys(props).sort() : [];
}

function verifierJson(lire) {
  return async (reponse) => {
    const texte = await reponse.text();
    let donnees;
    try {
      donnees = JSON.parse(texte);
    } catch {
      const type = reponse.headers.get("content-type") ?? "sans type";
      return { problemes: [`réponse illisible en JSON (${type}, ${String(texte.length)} caractères)`], mesure: "" };
    }
    try {
      return lire(donnees);
    } catch (erreur) {
      return { problemes: [`le lecteur de Sentiers refuse la réponse : ${erreur.name}`], mesure: "" };
    }
  };
}

const SOURCES = [
  ...OVERPASS_MIRRORS.map((miroir) => ({
    nom: `Overpass (${new URL(miroir).host})`,
    requete: (signal) =>
      demander(miroir, {
        method: "POST",
        body: `data=${encodeURIComponent(buildAroundQuery(PILAT, 3_000))}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal,
      }),
    verifier: verifierJson((donnees) => {
      if (!Array.isArray(donnees?.elements)) return { problemes: ["pas de tableau `elements`"], mesure: "" };
      const itineraires = parseOverpassResponse(donnees, new Date().toISOString());
      const traces = itineraires.filter((i) => i.ways.some((w) => w.coords.length >= 2));
      return {
        problemes: traces.length === 0 ? ["aucun itinéraire tracé autour du Pilat"] : [],
        mesure: `${String(donnees.elements.length)} éléments, ${String(traces.length)} itinéraires tracés`,
      };
    }),
  })),
  {
    nom: "IGN, fond de carte (WMTS)",
    requete: (signal) => {
      const { x, y, z } = tuile(PILAT, 12);
      const url = IGN_TILES.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
      return demander(url, { signal });
    },
    verifier: async (reponse) => {
      const type = reponse.headers.get("content-type") ?? "";
      const octets = (await reponse.arrayBuffer()).byteLength;
      return {
        problemes: type.startsWith("image/") && octets > 0 ? [] : [`pas une image (${type || "sans type"})`],
        mesure: `${type}, ${String(octets)} octets`,
      };
    },
  },
  {
    nom: "IGN, altimétrie",
    requete: (signal) => demander(buildElevationLineUrl(ALTI), { signal }),
    verifier: verifierJson((donnees) => {
      const altitudes = parseElevationResponse(donnees, ALTI);
      const lues = altitudes.filter((a) => a !== null).length;
      return {
        problemes: lues === altitudes.length ? [] : [`${String(altitudes.length - lues)} altitudes illisibles sur ${String(altitudes.length)}`],
        mesure: `${String(lues)} altitudes sur ${String(altitudes.length)}`,
      };
    }),
  },
  {
    nom: "API Adresse",
    requete: (signal) => demander(buildGeocodeUrl("Pélussin"), { signal }),
    verifier: verifierJson((donnees) => {
      const lieux = parseGeocodeResponse(donnees);
      return {
        problemes: lieux.some((l) => l.label.includes("Pélussin")) ? [] : ["Pélussin introuvable"],
        mesure: `${String(lieux.length)} lieux`,
      };
    }),
  },
  ...Object.entries(SOURCES_PDIPR)
    .filter(([, source]) => source.url)
    .map(([zone, source]) => ({
      nom: `PDIPR ${source.nom}`,
      requete: (signal) => demander(source.url, { signal }),
      verifier: verifierJson((brut) => {
        const entites = Array.isArray(brut?.features) ? brut.features : null;
        if (!entites) return { problemes: ["pas de tableau `features`"], mesure: "" };
        const jeu = jeuPdiprPour(zone);
        // Le filtre est celui de la préparation : règle de diffusion et
        // emprise. Zéro ligne retenue, c'est le scénario de #669 — un champ
        // renommé, une reprojection changée — qui passait en silence.
        const retenues = parseReseauPdipr(brut, jeu.emprise, jeu.retenir).features.length;
        const champs = champsDe(entites[0]);
        return {
          problemes: retenues === 0 ? [`aucune ligne retenue sur ${String(entites.length)} entités`] : [],
          mesure:
            `${String(entites.length)} entités, ${String(retenues)} lignes retenues ; ` +
            `champs : ${champs.length > 0 ? champs.join(", ") : "aucun"}`,
        };
      }),
    })),
];

async function controler(source) {
  let reponse;
  try {
    reponse = await source.requete(AbortSignal.timeout(DELAI_MS));
  } catch (erreur) {
    return { nom: source.nom, ...verdictDe({ erreur: erreur.cause?.code ?? erreur.name }), mesure: "" };
  }
  if (!reponse.ok) {
    await reponse.body?.cancel();
    return { nom: source.nom, ...verdictDe({ statut: reponse.status }), mesure: "" };
  }
  try {
    const { problemes, mesure } = await source.verifier(reponse);
    return { nom: source.nom, ...verdictDe({ statut: reponse.status, problemes }), mesure };
  } catch (erreur) {
    // Un corps coupé en cours de lecture : la source n'a pas fini de parler.
    return { nom: source.nom, ...verdictDe({ erreur: erreur.cause?.code ?? erreur.name }), mesure: "" };
  }
}

const resultats = [];
for (const source of SOURCES) resultats.push(await controler(source));

const texte = rapport(resultats, new Date().toISOString().slice(0, 10));
process.stdout.write(texte);

const indice = process.argv.indexOf("--rapport");
if (indice !== -1 && process.argv[indice + 1]) writeFileSync(process.argv[indice + 1], texte);

const etat = etatGlobal(resultats);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `etat=${etat}\n`);
console.log(`\nÉtat : ${etat}`);
process.exitCode = etat === "rouge" ? 1 : 0;
