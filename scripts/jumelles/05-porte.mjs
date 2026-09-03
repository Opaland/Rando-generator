import { readFileSync } from "node:fs";
import {
  CI,
  LISEZ_MOI,
  REGLES,
  SKILL_PORTE,
  commandesDeLaPorte,
  echouer,
} from "./_socle.mjs";

/*
  Les trois porteurs de la même liste, réunis parce qu'ils sont une seule
  famille : le §6 de `CLAUDE.md` l'énumère, la skill `/porte` donne le bloc
  qu'on copie, et le README la titre « ce que fait la CI ». Ils partageaient
  déjà `commandesDeLaPorte` par une variable de portée fichier — le
  découpage l'a rendu visible, et cette dépendance est maintenant nommée.
*/
const commandes = commandesDeLaPorte();

/*
  La porte, telle que le §6 l'énumère.

  Trois commandes y manquaient — `listes`, `textes`, `chemins` — dont deux
  que ce même fichier présente ailleurs. La troisième, `chemins`, a été
  écrite pour attraper « un commentaire qui nomme un fichier affirme qu'il
  existe » (#357) ; personne n'a pensé à la citer dans la liste des gardes.
*/
const regles = readFileSync(REGLES, "utf8");
const departPorte = regles.indexOf("La porte complète avant de committer");
if (departPorte === -1) {
  echouer(
    `« La porte complète avant de committer » est introuvable dans ${REGLES} :` +
      ` le motif de lecture ne correspond plus, et ce contrôle ne garde donc` +
      ` plus rien.`,
  );
}
const paragraphePorte = regles.slice(
  departPorte,
  regles.indexOf("\n\n", departPorte),
);
const citeesParLeSix = new Set(
  [...paragraphePorte.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]),
);

const absentesDuSix = commandes.filter((c) => !citeesParLeSix.has(c));
if (absentesDuSix.length > 0) {
  echouer(
    `${String(absentesDuSix.length)} commande(s) de la porte absente(s) du §6` +
      ` de ${REGLES} : ${absentesDuSix.join(", ")}\n` +
      `\nUne garde qu'on oublie de citer dans la liste des gardes est une` +
      ` garde qu'on oubliera de lancer.`,
  );
}

/*
  La porte, écrite une troisième fois — dans la skill qui la lance.

  Le §6 de `CLAUDE.md` énumère les commandes, la CI les lance, et
  `.claude/skills/porte/SKILL.md` en donne le bloc à copier-coller. Les deux
  premières étaient déjà comparées ; la troisième ne l'était pas, et elle
  avait dérivé : `npm run chemins`, livré en #357, n'y a jamais figuré.
  Personne ne l'a vu, parce que c'est le §4ter — deux listes qui disent la
  même règle ont le même trou, et chacune paraît complète quand on la lit
  seule.

  Deux commandes y sont volontairement écrites autrement, et l'exemption ne
  peut pas pourrir : le texte qui les remplace doit être présent, sinon
  l'exemption échoue elle aussi.
*/
const ECRITES_AUTREMENT = new Map([
  ["typecheck", "npx tsc -b --noEmit"],
  ["e2e", "npx playwright test"],
]);

/*
  `monkey` est de la porte mais pas de la CI — trop lent. Le bloc du README
  annonce « ce que fait la CI » : l'y exiger serait lui faire dire faux.
*/
const HORS_CI = new Set(["monkey"]);

const skillPorte = readFileSync(SKILL_PORTE, "utf8");
const citeesParLaSkill = new Set(
  [...skillPorte.matchAll(/\bnpm run ([a-z0-9-]+)/g)].map((m) => m[1]),
);
if (citeesParLaSkill.size === 0) {
  echouer(
    `Aucun \`npm run\` lu dans ${SKILL_PORTE} : le motif de lecture ne` +
      ` correspond plus, et ce contrôle ne garde donc plus rien.`,
  );
}
const absentesDeLaSkill = commandes.filter(
  (c) => !citeesParLaSkill.has(c) && !ECRITES_AUTREMENT.has(c),
);
if (absentesDeLaSkill.length > 0) {
  echouer(
    `${String(absentesDeLaSkill.length)} commande(s) de la porte absente(s) de` +
      ` ${SKILL_PORTE} : ${absentesDeLaSkill.join(", ")}\n` +
      `\nLa skill est le bloc qu'on copie pour lancer la porte. Ce qui n'y est` +
      ` pas ne se lance pas.`,
  );
}

/*
  Et une quatrième fois, dans le README — sous le titre « Vérifications
  complètes (ce que fait la CI) », qui en fait une affirmation et non une
  sélection. Elle était fausse : `listes`, `textes` et `chemins` n'y
  figuraient pas, et le seuil de couverture y était annoncé « sur src/core »
  alors qu'il porte aussi sur le magasin.

  C'est la première chose que lit quelqu'un qui arrive sur le dépôt (§3).
*/
const lisezMoi = readFileSync(LISEZ_MOI, "utf8");
const departVerifications = lisezMoi.indexOf(
  "Vérifications complètes (ce que fait la CI)",
);
if (departVerifications === -1) {
  echouer(
    `« Vérifications complètes (ce que fait la CI) » est introuvable dans` +
      ` ${LISEZ_MOI} : l'ancre ne correspond plus, et ce contrôle ne garde` +
      ` donc plus rien.`,
  );
}
const blocVerifications = lisezMoi.slice(
  departVerifications,
  lisezMoi.indexOf("```", lisezMoi.indexOf("```bash", departVerifications) + 7),
);
const citeesParLeLisezMoi = new Set(
  [...blocVerifications.matchAll(/\bnpm run ([a-z0-9-]+)/g)].map((m) => m[1]),
);
const absentesDuLisezMoi = commandes.filter(
  (c) => !citeesParLeLisezMoi.has(c) && !HORS_CI.has(c),
);
if (absentesDuLisezMoi.length > 0) {
  echouer(
    `${String(absentesDuLisezMoi.length)} commande(s) de la CI absente(s) du` +
      ` bloc « Vérifications complètes » de ${LISEZ_MOI} :` +
      ` ${absentesDuLisezMoi.join(", ")}\n` +
      `\nCe titre affirme « ce que fait la CI ». Une liste qui l'affirme sans` +
      ` le faire est pire qu'une liste absente (§5).`,
  );
}
const horsCiPerimees = [...HORS_CI].filter(
  (c) => commandes.includes(c) && citeesParLeLisezMoi.has(c),
);
if (horsCiPerimees.length > 0) {
  echouer(
    `${String(horsCiPerimees.length)} exemption(s) inutile(s) de HORS_CI :` +
      ` ${horsCiPerimees.join(", ")} figure(nt) désormais dans le bloc du` +
      ` README, et l'exemption ne sert donc plus à rien.`,
  );
}
const exemptionsMuettes = [...ECRITES_AUTREMENT].filter(
  ([, texte]) => !skillPorte.includes(texte),
);
if (exemptionsMuettes.length > 0) {
  echouer(
    `${String(exemptionsMuettes.length)} exemption(s) de ${SKILL_PORTE} qui ne` +
      ` correspondent plus :\n` +
      exemptionsMuettes
        .map(([nom, texte]) => `  ${nom} : « ${texte} » est introuvable`)
        .join("\n") +
      `\n\nUne commande dite « écrite autrement » qu'on ne retrouve sous aucune` +
      ` forme n'est pas écrite du tout.`,
  );
}

export const resume = `${String(commandes.length)} commandes de porte, toutes citées par le §6, la skill et le README`;
