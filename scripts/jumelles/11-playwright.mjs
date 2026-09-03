import { readFileSync } from "node:fs";
import { echouer } from "./_socle.mjs";

/* --------------------------------------------------------------------------
   Les commandes qui lancent Playwright, et celles qui sont annoncées avec
   PW_CHROMIUM_PATH (issue #435).

   `playwright.config.ts` lit cette variable pour **toute** exécution. Quatre
   scripts de `package.json` en dépendent donc, et un seul était annoncé avec
   elle — dans le README comme dans le §6. Le 31/08, `npm run monkey` a rendu
   trois échecs au milieu d'une porte verte pour cette seule raison.

   Ce n'est pas un faux vert : le navigateur ne se lance pas du tout, l'échec
   est bruyant. C'est une porte rouge pour une raison qui n'est pas celle
   qu'on cherche, au pire moment.

   La liste vit dans `package.json` ; les deux autres la décrivent. Un script
   neuf qui lance Playwright sans être nommé dans les deux fait échouer ici.
   -------------------------------------------------------------------------- */

const PAQUET = "package.json";
const README_PW = "README.md";
const REGLES_PW = "CLAUDE.md";

const scripts = JSON.parse(readFileSync(PAQUET, "utf8")).scripts ?? {};
const lancentPlaywright = Object.entries(scripts)
  .filter(([, commande]) => /(^|\s)(npx )?playwright test(\s|$)/.test(commande))
  .map(([nom]) => nom);

if (lancentPlaywright.length === 0) {
  echouer(
    `${PAQUET} : aucun script ne lance \`playwright test\`.\n` +
      `  → le motif de lecture ne correspond plus, cette garde ne garde` +
      ` donc plus rien.`,
  );
}

/*
  On cherche le nom entier, comme `commandes-annoncees.mjs` a appris à le
  faire : `includes('reel')` est vrai dans « réellement » et dans « Corée ».
*/
const nommeEntier = (texte, mot) =>
  new RegExp(`(^|[^\\p{L}\\d-])${mot}([^\\p{L}\\d-]|$)`, "u").test(texte);

for (const [fichier, source] of [
  [README_PW, readFileSync(README_PW, "utf8")],
  [REGLES_PW, readFileSync(REGLES_PW, "utf8")],
]) {
  /*
    Le paragraphe qui parle de la variable, et lui seul : ailleurs dans le
    README, « e2e » apparaît pour d'autres raisons, et trouver le mot loin de
    la phrase ne prouverait pas qu'il y est annoncé.
  */
  const index = source.indexOf("PW_CHROMIUM_PATH");
  if (index === -1) {
    echouer(`${fichier} ne parle nulle part de PW_CHROMIUM_PATH.`);
  }
  const paragraphe = source.slice(index, index + 600);
  const absents = lancentPlaywright.filter(
    (nom) => !nommeEntier(paragraphe, nom),
  );
  if (absents.length > 0) {
    echouer(
      `${fichier} annonce PW_CHROMIUM_PATH sans nommer ${absents.join(", ")}.\n` +
        `  → ces scripts lancent pourtant \`playwright test\` et lisent la` +
        ` variable. Une phrase plus étroite que le besoin fait rougir une` +
        ` porte pour la mauvaise raison (issue #435, §4ter).`,
    );
  }
}

export const resume = `${String(lancentPlaywright.length)} commandes Playwright, toutes annoncées avec PW_CHROMIUM_PATH`;
