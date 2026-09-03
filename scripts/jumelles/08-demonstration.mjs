import { readFileSync } from "node:fs";
import { echouer } from "./_socle.mjs";

/*
  Septième paire : ce que la démonstration masque, et ce que la sortie relit.

  L'hydratation du store refuse d'écraser trois listes tant qu'une
  démonstration tourne — sinon le visiteur verrait ses vraies sorties et les
  trois fictives dans le même pourcentage. `quitterDemonstration` les relit
  en sortant, ce qui rend le masquage sans conséquence.

  Les deux disent la même règle, dans deux fichiers, et **une seule était
  gardée** : `tests/unit/trancheDemonstration.test.ts` tient la relecture,
  rien ne tient le masquage. Une quatrième liste masquée sans être relue se
  perdrait en silence — et seulement chez quelqu'un qui avait déjà des
  données, donc jamais chez un nouveau venu ni dans un test partant d'une
  base vide (issue #368).

  La cicatrice précédente est arrivée exactement par là : les déclarations de
  #158 étaient masquées avant d'être relues.
*/
const HYDRATATION = "src/store/appStore.ts";
const SORTIE = "src/store/trancheDemonstration.ts";

const masquees = [
  ...new Set(
    [
      ...readFileSync(HYDRATATION, "utf8").matchAll(
        /^\s*([a-zA-Z]+):\s*\n?\s*enDemonstration$|^\s*([a-zA-Z]+): enDemonstration/gm,
      ),
    ].map((m) => m[1] ?? m[2]),
  ),
].filter((nom) => nom !== undefined);

if (masquees.length === 0) {
  echouer(
    `Aucune liste masquée lue dans ${HYDRATATION} : le motif` +
      ` « clé: enDemonstration ? … » ne correspond plus, et ce contrôle ne` +
      ` garde donc plus rien.`,
  );
}

const sourceSortie = readFileSync(SORTIE, "utf8");

/*
  Ancré sur la **déstructuration de la lecture de base**, et non sur un
  `deps.set({ … })`.

  Le fichier en contient plusieurs — `demarrerDemonstration` et
  `arreterDemonstration` en appellent aussi. Un motif qui cherche le premier
  attrape donc le mauvais. La première écriture de ce contrôle marchait par
  accident : `[^}]+` s'arrêtait sur les accolades imbriquées des appels
  précédents, ce qui le faisait tomber sur le bon par hasard. Assoupli en
  `[\s\S]*?` pour tolérer un reformatage, il attrapait aussitôt le premier
  venu — et rendait « les trois listes ne sont pas relues », ce qui est faux.

  §1bis, sur ma propre garde : elle était verte pour une raison que je
  n'avais pas voulue.

  `const [a, b, c] = await Promise.all(` ne se produit qu'une fois, et nomme
  exactement ce qui est relu de la base.
*/
const relues = [
  ...(
    /const \[([^\]]+)\] = await Promise\.all\(/.exec(sourceSortie)?.[1] ?? ""
  ).matchAll(/([a-zA-Z]+)/g),
].map((m) => m[1]);

if (relues.length === 0) {
  echouer(
    `Aucune liste relue lue dans ${SORTIE} : le motif` +
      ` « const [\u2026] = await Promise.all( » ne correspond plus, et ce` +
      ` contrôle ne garde donc plus rien.`,
  );
}

const masqueesSansRelecture = masquees.filter((nom) => !relues.includes(nom));
const reluesSansMasquage = relues.filter((nom) => !masquees.includes(nom));

if (masqueesSansRelecture.length > 0 || reluesSansMasquage.length > 0) {
  echouer(
    `La démonstration masque et relit deux listes différentes.\n` +
      `Masquée sans être relue : ${masqueesSansRelecture.join(", ") || "—"}\n` +
      `  → perdue en sortant, et seulement chez quelqu'un qui en avait.\n` +
      `Relue sans être masquée : ${reluesSansMasquage.join(", ") || "—"}\n` +
      `  → relecture inutile, ou masquage oublié.\n` +
      `\nLes deux côtés disent la même règle : ${HYDRATATION} et ${SORTIE}.`,
  );
}

export const resume = `${String(masquees.length)} listes de démonstration, masquées et relues d'accord`;
