import { readFileSync } from "node:fs";
import { SKILL_AUDIT } from "./_socle.mjs";

/*
  ─────────────────────────────────────────────────────────────────────────
  Troisième paire : les personas de la skill `audit-ui` et leurs fiches.

  Le 28/08, `docs/PERSONAS.md` — le seul document dont c'est le métier —
  ignorait **Théo et Jeanine**. Ils sont pourtant nommés dans le §10 de
  CLAUDE.md, qui définit sur eux ce qui ne peut pas être fermé sans preuve
  humaine, dans la feuille de route, dans quatre fichiers de tests, dans
  `src/core/affichage.ts` et dans la skill `audit-ui`.

  Sept endroits les connaissaient, le document non. Aucun diff ne pouvait
  l'attraper : aucun ne touche ce document et les autres ensemble.

  Ce contrôle garde l'**existence d'une fiche**, jamais la justesse de ce
  qu'elle raconte — celle-là se relit, et le §2 interdit de prétendre mesurer
  ce qui se décide. Il ne dirait rien, par exemple, du fait que la Sylvie de
  la skill est « en montagne, gantée » quand celle du document « débute la
  randonnée » : deux accents à réconcilier à la main.
*/
const PERSONAS = "docs/PERSONAS.md";

const nommesParLaSkill = [
  ...readFileSync(SKILL_AUDIT, "utf8").matchAll(
    /^- \*\*([A-ZÉÈÀÎÔ][\p{L}-]+)\*\*/gmu,
  ),
].map((m) => m[1]);

if (nommesParLaSkill.length === 0) {
  console.error(
    `Aucun persona trouvé dans ${SKILL_AUDIT} : le motif de lecture ne` +
      ` correspond plus, et ce contrôle ne garde donc plus rien.`,
  );
  process.exit(1);
}

const fiches = new Set(
  [
    ...readFileSync(PERSONAS, "utf8").matchAll(
      /^#{2,3} ([A-ZÉÈÀÎÔ][\p{L}-]+)/gmu,
    ),
  ].map((m) => m[1]),
);

const sansFiche = nommesParLaSkill.filter((nom) => !fiches.has(nom));
if (sansFiche.length > 0) {
  console.error(
    `${String(sansFiche.length)} persona(s) nommé(s) par ${SKILL_AUDIT} sans` +
      ` fiche dans ${PERSONAS} : ${sansFiche.join(", ")}\n` +
      `\nUn persona qui choisit où l'on regarde mérite d'exister là où on` +
      ` les décrit.`,
  );
  process.exit(1);
}

export const resume = `${String(nommesParLaSkill.length)} personas de la skill, tous avec leur fiche`;
