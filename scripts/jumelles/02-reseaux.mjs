import { readFileSync } from "node:fs";
import { CSS } from "./_socle.mjs";

/*
  ─────────────────────────────────────────────────────────────────────────
  Deuxième paire : les couleurs de réseau, écrites à trois endroits.

  - les jetons de `src/index.css` — la source pour l'écran ;
  - `NETWORK_COLORS` de `src/lib/networkDisplay.ts`, en hexadécimal : le
    canevas de `summaryCard.ts` en a besoin, `var()` ne s'y résout pas ;
  - la table de `src/components/ProgressBalise.tsx`, en `var(--…)`, pour que
    la barre **suive** l'assombrissement du gros texte — ce que
    l'hexadécimal ne peut pas faire.

  Les deux dernières ne sont pas des doublons à fusionner : elles servent
  deux besoins différents, et c'est écrit dans les deux fichiers. Ce qui
  manquait est la garantie qu'elles désignent **la même couleur**. Elles
  s'accordaient à la main au 28/08, et rien ne le vérifiait — le §4ter dans
  sa forme ordinaire : deux listes justes qui cesseront de l'être un jour
  sans que le diff le montre.

  Ce que ce contrôle ne dit pas : si la couleur est la bonne. Ça se décide.
*/
const RESEAUX = "src/lib/networkDisplay.ts";
const BARRE = "src/components/ProgressBalise.tsx";

function tableDe(chemin, motif) {
  const source = readFileSync(chemin, "utf8");
  const debut = source.indexOf("NETWORK_COLORS");
  if (debut === -1) {
    console.error(`NETWORK_COLORS introuvable dans ${chemin}.`);
    process.exit(1);
  }
  const bloc = source.slice(debut, source.indexOf("\n}\n", debut));
  return Object.fromEntries([...bloc.matchAll(motif)].map((m) => [m[1], m[2]]));
}

const hexParReseau = tableDe(RESEAUX, /(\w+):\s*'(#[0-9a-fA-F]{6})'/g);
const jetonParReseau = tableDe(BARRE, /(\w+):\s*'var\((--[\w-]+)\)'/g);

const racine = (() => {
  const css = readFileSync(CSS, "utf8");
  const debut = css.indexOf(":root {");
  const bloc = css.slice(debut, css.indexOf("\n}", debut));
  return Object.fromEntries(
    [...bloc.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );
})();

const desaccords = [];
for (const [reseau, hex] of Object.entries(hexParReseau)) {
  const jeton = jetonParReseau[reseau];
  if (!jeton) {
    desaccords.push(`${reseau} : ${BARRE} ne nomme aucun jeton`);
    continue;
  }
  const valeur = racine[jeton];
  if (!valeur) {
    desaccords.push(`${reseau} : le jeton ${jeton} n'existe pas dans ${CSS}`);
    continue;
  }
  if (valeur !== hex.toLowerCase()) {
    desaccords.push(`${reseau} : ${hex} ≠ ${jeton} qui vaut ${valeur}`);
  }
}
for (const reseau of Object.keys(jetonParReseau)) {
  if (!(reseau in hexParReseau)) {
    desaccords.push(`${reseau} : nommé par ${BARRE}, absent de ${RESEAUX}`);
  }
}

if (desaccords.length > 0) {
  console.error(
    `Les couleurs de réseau ne s'accordent plus — ${String(desaccords.length)} :\n` +
      desaccords.map((d) => `  ${d}`).join("\n") +
      `\n\nTrois listes disent la même couleur : les jetons de ${CSS},` +
      `\nl'hexadécimal de ${RESEAUX} et les var() de ${BARRE}.`,
  );
  process.exit(1);
}

export const resume = `${String(Object.keys(hexParReseau).length)} couleurs de réseau, les trois listes d'accord`;
