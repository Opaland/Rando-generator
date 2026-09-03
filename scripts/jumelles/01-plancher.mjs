import { readFileSync, readdirSync } from "node:fs";
import { CSS } from "./_socle.mjs";

const SONDE = "tests/e2e/regles-d-ecran.spec.ts";

/**
 * Le « genre » d'un sélecteur : ce qu'il vise, dépouillé de ses conditions.
 *
 * `input:not([type='hidden'])` et `input[type='range']` visent tous deux des
 * `input` ; `label:has(> input[type='radio'])` vise un `label`. Comparer les
 * sélecteurs à la lettre serait un test qui échoue sur une reformulation —
 * donc un test qu'on finirait par désactiver.
 */
/**
 * Découpe une liste de sélecteurs sur les virgules **de premier niveau**.
 *
 * `String.split(',')` coupait à l'intérieur de
 * `:not([type='checkbox'], [type='radio'])` et rendait un genre `[type]`
 * qui n'existe pas. Un séparateur ne se lit pas hors de son contexte.
 */
function virgulesDePremierNiveau(liste) {
  const morceaux = [];
  let courant = "";
  let profondeur = 0;
  for (const c of liste) {
    if (c === "(" || c === "[") profondeur += 1;
    else if (c === ")" || c === "]") profondeur -= 1;
    if (c === "," && profondeur === 0) {
      morceaux.push(courant);
      courant = "";
    } else courant += c;
  }
  morceaux.push(courant);
  return morceaux;
}

function genre(selecteur) {
  const nu = selecteur.trim();
  if (nu === "") return null;
  const attribut = /^\[([a-zA-Z-]+)/.exec(nu);
  if (attribut) return `[${attribut[1]}]`;
  const classe = /^\.([\w-]+)/.exec(nu);
  if (classe) return `.${classe[1]}`;
  const balise = /^([a-zA-Z]+)/.exec(nu);
  return balise ? balise[1].toLowerCase() : null;
}

/** Les sélecteurs auxquels `src/index.css` applique le plancher des cibles. */
function genresPlancherises(cssBrut) {
  // Les commentaires d'abord : ce module en porte de longs, et leurs mots
  // se lisaient comme des sélecteurs (« replier », « niveau », « cf »).
  const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, "");
  const genres = new Set();
  // Chaque bloc dont la déclaration pose `min-height: var(--cible-mini)`.
  const blocs = css.matchAll(
    /([^{}]+)\{[^{}]*min-height:\s*var\(--cible-mini\)[^{}]*\}/g,
  );
  for (const bloc of blocs) {
    for (const selecteur of virgulesDePremierNiveau(bloc[1])) {
      const g = genre(selecteur);
      if (g) genres.add(g);
    }
  }
  return genres;
}

/** Les sélecteurs que la question 4 des règles d'écran interroge. */
function genresMesures(sonde) {
  const appel =
    /querySelectorAll\(\s*\n?\s*'([^']*(?:button|select)[^']*)'/.exec(sonde);
  if (!appel) throw new Error(`Liste des cibles introuvable dans ${SONDE}`);
  const genres = new Set();
  for (const selecteur of virgulesDePremierNiveau(appel[1])) {
    const g = genre(selecteur.replace(/"/g, "'"));
    if (g) genres.add(g);
  }
  return genres;
}

const plancherises = genresPlancherises(readFileSync(CSS, "utf8"));
const mesures = genresMesures(readFileSync(SONDE, "utf8"));

/*
  `.acc-summary` est une classe posée sur des `summary`, que la sonde
  interroge par la balise. L'écrire ici plutôt que d'assouplir `genre()` :
  une exception nommée se relit, une règle élargie se contourne.
*/
const EQUIVALENCES = new Map([
  [".acc-summary", "summary"],
  /*
    Le CSS plancherise le `label` d'une case à cocher ; la sonde interroge
    l'`input` et remonte à son étiquette. Les deux visent la même cible —
    celle que le doigt touche — par les deux bouts.
  */
  ["label", "input"],
]);

const oublies = [...plancherises].filter((g) => {
  const cible = EQUIVALENCES.get(g) ?? g;
  return !mesures.has(cible);
});

if (oublies.length > 0) {
  console.error(
    `Le CSS plancherise ${String(oublies.length)} genre(s) que la sonde ne mesure pas : ${oublies.join(", ")}\n` +
      `  plancherisés : ${[...plancherises].sort().join(", ")}\n` +
      `  mesurés      : ${[...mesures].sort().join(", ")}\n` +
      `\nAjouter le genre manquant à la question 4 de ${SONDE}.`,
  );
  process.exit(1);
}

export const resume = `${String(plancherises.size)} genres plancherisés, tous mesurés`;
