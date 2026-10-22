import { lire, echouer, LISEZ_MOI } from "./_socle.mjs";

/*
  ===========================================================================
  Treizième paire : la règle d'estimation de durée, dans le code et dans le
  README.
  ===========================================================================

  `FLAT_KMH` et `ASCENT_METERS_PER_HOUR` (src/core/discovery.ts) fixent la
  vitesse de marche à plat et le rythme de montée retenus pour estimer une
  durée. L'infobulle de la liste des itinéraires lit maintenant la constante
  (chasse aux règles jumelles du 17/10) ; le README, lui, ne peut rien
  importer et recopie les deux nombres en toutes lettres.

  Ce que ce contrôle garde n'est pas la formule — elle se lit dans
  discovery.ts — mais que les deux nombres cités au lecteur du README sont
  ceux que le code applique réellement. Une correction de vitesse qui
  oublierait le README rendrait sa phrase fausse sans qu'aucune porte ne le
  dise (§4ter, §4bis).
*/
const DISCOVERY = "src/core/discovery.ts";

const sourceDiscovery = lire(DISCOVERY);
const kmh = /FLAT_KMH = (\d+)/.exec(sourceDiscovery);
const ascension = /ASCENT_METERS_PER_HOUR = (\d+)/.exec(sourceDiscovery);
if (!kmh || !ascension) {
  echouer(
    `${DISCOVERY} : FLAT_KMH ou ASCENT_METERS_PER_HOUR introuvable sous la` +
      ` forme attendue. Le motif de lecture ne correspond plus, ce contrôle` +
      ` ne garde donc plus rien — le réparer plutôt que le retirer.`,
  );
}

/*
  Le README enveloppe ses lignes à la main : la phrase « 300 m de montée à
  l'heure » coupe entre « 300 m » et « de montée » dans le fichier source.
  Un `includes` sur le texte brut manque donc la phrase qu'il cherche
  pourtant mot pour mot — mesuré en lançant ce contrôle une première fois.
  Les retours à la ligne sont donc ramenés à des espaces avant comparaison.
*/
const readme = lire(LISEZ_MOI).replace(/\s+/g, ' ');
const manquants = [];
if (!readme.includes(`${kmh[1]} km/h à plat`)) {
  manquants.push(`${kmh[1]} km/h à plat`);
}
if (!readme.includes(`${ascension[1]} m de montée à l'heure`)) {
  manquants.push(`${ascension[1]} m de montée à l'heure`);
}
if (manquants.length > 0) {
  echouer(
    `${LISEZ_MOI} ne porte pas : ${manquants.join(", ")}.\n` +
      `  → ${DISCOVERY} applique pourtant ces valeurs (FLAT_KMH=${kmh[1]},` +
      ` ASCENT_METERS_PER_HOUR=${ascension[1]}) : la phrase qui explique la` +
      ` règle à qui lit le dépôt ne la décrit plus (§4bis).`,
  );
}

export const resume = `règle d'estimation (${kmh[1]} km/h, ${ascension[1]} m/h) retrouvée dans ${LISEZ_MOI}`;
