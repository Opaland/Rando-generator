import { lire, echouer, LISEZ_MOI } from "./_socle.mjs";

/*
  ===========================================================================
  Quatorzième paire : le seuil de vitesse motorisée, dans le code et dans le
  README.
  ===========================================================================

  `MAX_WALK_SPEED_MPS` (src/core/matching.ts) n'est pas un nombre posé mais un
  rapport — 800 / 100,91, le record du monde du 800 m — choisi plutôt
  qu'inventé (§2/§6sexies). Le README ne peut pas importer ce calcul : il
  recopie son résultat en toutes lettres, « 28,5 km/h ».

  Ce que ce contrôle garde n'est pas le choix du seuil — il est documenté et
  sourcé dans matching.ts — mais que le nombre cité au lecteur du README est
  bien ce que ce rapport donne, recalculé ici indépendamment du commentaire
  qui l'accompagne dans le code. Une correction du record de référence qui
  oublierait le README rendrait sa phrase fausse sans qu'aucune porte ne le
  dise (§4ter, §4bis).
*/
const MATCHING = "src/core/matching.ts";

const sourceMatching = lire(MATCHING);
const seuil = /MAX_WALK_SPEED_MPS = (\d+) \/ ([\d.]+)/.exec(sourceMatching);
if (!seuil) {
  echouer(
    `${MATCHING} : MAX_WALK_SPEED_MPS introuvable sous la forme attendue` +
      ` (dividende / diviseur). Le motif de lecture ne correspond plus, ce` +
      ` contrôle ne garde donc plus rien — le réparer plutôt que le retirer.`,
  );
}

const metresParSeconde = Number(seuil[1]) / Number(seuil[2]);
const kmh = (metresParSeconde * 3.6).toFixed(1).replace(".", ",");

const readme = lire(LISEZ_MOI).replace(/\s+/g, " ");
if (!readme.includes(`${kmh} km/h`)) {
  echouer(
    `${LISEZ_MOI} ne porte pas : ${kmh} km/h.\n` +
      `  → ${MATCHING} applique pourtant MAX_WALK_SPEED_MPS = ${seuil[1]} /` +
      ` ${seuil[2]}, soit ${kmh} km/h une fois reconverti : la phrase qui` +
      ` explique le seuil à qui lit le dépôt ne le décrit plus (§4bis).`,
  );
}

export const resume = `seuil de vitesse motorisée (${kmh} km/h) retrouvé dans ${LISEZ_MOI}`;
