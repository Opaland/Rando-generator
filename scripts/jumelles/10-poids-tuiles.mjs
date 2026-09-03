import { readFileSync } from "node:fs";
import { echouer } from "./_socle.mjs";

/*
  ===========================================================================
  Neuvième paire : le poids d'une tuile, dans le code et dans la mesure.
  ===========================================================================

  `POIDS_MOYEN_PAR_ZOOM` (src/core/telechargement.ts) porte cinq nombres que
  le bouton « Emporter » affiche, et `docs/MESURE_TUILES.md` porte les mêmes,
  dans le tableau qui les a produits.

  Ils ne peuvent pas être partagés : un document n'importe rien. Ils ne
  changent jamais ensemble non plus — une nouvelle campagne de mesure touche
  le document, un ajustement touche le code — et chacun paraît complet quand
  on le lit seul. §4ter à la lettre, donc remède 2 : un contrôle qui asserte
  que les deux sont d'accord.

  Ce qui compte ici n'est pas la valeur mais la **traçabilité** : un chiffre
  affiché à l'utilisateur doit se retrouver dans la mesure qui le justifie,
  sinon la justification est un commentaire qui affirme (§4bis).
*/
const POIDS_CODE = "src/core/telechargement.ts";
const POIDS_DOC = "docs/MESURE_TUILES.md";

const sourcePoids = readFileSync(POIDS_CODE, "utf8");
const blocPoids =
  /POIDS_MOYEN_PAR_ZOOM: Record<number, number> = \{([^}]*)\}/.exec(
    sourcePoids,
  );
if (!blocPoids) {
  echouer(
    `${POIDS_CODE} : POIDS_MOYEN_PAR_ZOOM est introuvable sous la forme` +
      ` attendue. Le motif de lecture ne correspond plus, ce contrôle ne` +
      ` garde donc plus rien — le réparer plutôt que le retirer.`,
  );
}
const poidsParZoom = new Map();
for (const [, z, valeur] of blocPoids[1].matchAll(/(\d+):\s*([\d_]+)/g)) {
  poidsParZoom.set(Number(z), Number(valeur.replaceAll("_", "")));
}
if (poidsParZoom.size === 0) {
  echouer(`${POIDS_CODE} : aucun poids lu dans POIDS_MOYEN_PAR_ZOOM.`);
}

const sourceMesure = readFileSync(POIDS_DOC, "utf8");
for (const [zoom, octets] of poidsParZoom) {
  /*
    Le document écrit ses nombres à la française — « 105 422 », espace
    insécable comprise selon l'éditeur. On compare donc sur les chiffres
    seuls, pas sur leur mise en forme.
  */
  const chiffres = String(octets);
  const present = sourceMesure
    .replaceAll(/[\u00a0\u202f ]/g, "")
    .includes(chiffres);
  if (!present) {
    echouer(
      `Le poids du zoom ${String(zoom)} vaut ${chiffres} o dans` +
        ` ${POIDS_CODE}, et ${POIDS_DOC} ne le porte nulle part.\n` +
        `  → ce nombre s'affiche à l'utilisateur ; s'il ne se retrouve pas` +
        ` dans la mesure qui le justifie, la justification n'affirme plus` +
        ` rien (§4bis), et les deux listes ont dérivé (§4ter).`,
    );
  }
}

export const resume = `${String(poidsParZoom.size)} poids de tuile, tous retrouvés dans ${POIDS_DOC}`;
