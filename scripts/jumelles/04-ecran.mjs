import { readFileSync } from "node:fs";
import {
  EN_LETTRES,
  REGLES,
  SKILL_AUDIT,
  SONDE_ECRAN,
  compteAnnonce,
  echouer,
} from "./_socle.mjs";

/*
  Quatrième paire : ce que la sonde d'écran mesure, et ce que les documents
  en annoncent.

  Le 28/08, quatre heures après avoir ajouté la tablette (#363), `CLAUDE.md`
  §6quinquies et la skill `audit-ui` annonçaient toujours « trois largeurs et
  six états ». La sonde en mesurait **quatre et huit**, et la skill
  **énumérait** les largeurs : « 390 tactile, 800 tactile, 1280 non ». 1024
  n'apparaissait nulle part (issue #367).

  Une procédure qui décrit un outil disparu fait pire que ne rien dire : elle
  donne l'assurance d'avoir couvert ce qu'on n'a pas couvert. Qui la suit à la
  main prend trois captures et manque la seule vue large **et** tactile.

  Trois inventaires sont comparés ici, et rien d'autre :

  1. les largeurs énumérées par la skill ;
  2. les commandes de la porte listées par le §6 de `CLAUDE.md` ;
  3. les comptes annoncés dans les deux phrases **définitionnelles**.

  ## Ce que ce contrôle refuse de faire

  Il ne compte pas toutes les occurrences de « N états » du dépôt. Le §6ter
  raconte une mesure datée — « rouge sur les six états » — qui était vraie ce
  jour-là. Le récit d'une mesure ne se réécrit pas parce que l'outil a grandi
  depuis : ce serait falsifier l'histoire pour faire passer un contrôle. Le
  §4bis dit qu'une justification vieillit ; il ne dit pas de la rajeunir de
  force.

  Il ne dit rien non plus de la justesse des phrases autour. Ça se relit, et
  le §2 interdit de prétendre mesurer ce qui se décide.
*/

/** Le contenu d'un `const NOM = [ … ] as const`, sans quoi on ne mesure rien. */
function blocDeConstante(source, nom, ou) {
  const debut = source.indexOf(`const ${nom} = [`);
  if (debut === -1) {
    echouer(
      `\`const ${nom} = [\` est introuvable dans ${ou} : le motif de lecture ne` +
        ` correspond plus, et ce contrôle ne garde donc plus rien.`,
    );
  }
  const fin = source.indexOf("] as const", debut);
  if (fin === -1) echouer(`La fin de \`${nom}\` est introuvable dans ${ou}.`);
  return source.slice(debut, fin);
}

const sondeSource = readFileSync(SONDE_ECRAN, "utf8");

const largeurs = [
  ...blocDeConstante(sondeSource, "LARGEURS", SONDE_ECRAN).matchAll(
    /\bwidth:\s*(\d+)/g,
  ),
].map((m) => Number(m[1]));
if (largeurs.length === 0) echouer(`Aucune largeur lue dans ${SONDE_ECRAN}.`);

// Les états sont des chaînes nues, une par ligne ; les commentaires du bloc
// commencent par `*` ou `/*` et ne peuvent donc pas être pris pour l'un d'eux.
const etats = [
  ...blocDeConstante(sondeSource, "ETATS", SONDE_ECRAN).matchAll(
    /^ {2}'([^']+)',$/gm,
  ),
].map((m) => m[1]);
if (etats.length === 0) echouer(`Aucun état lu dans ${SONDE_ECRAN}.`);

const skillSource = readFileSync(SKILL_AUDIT, "utf8");

/*
  La ligne qui prétend énumérer les largeurs. On l'ancre sur « À N largeurs (»
  — la parenthèse est ce qui distingue une énumération d'une simple mention.
*/
const enumeration = /^À\s+\p{L}+\s+largeurs\s*\(([^)]*)\)/mu.exec(skillSource);
if (!enumeration) {
  echouer(
    `La ligne « À … largeurs (…) » est introuvable dans ${SKILL_AUDIT} : le` +
      ` motif de lecture ne correspond plus, et ce contrôle ne garde donc` +
      ` plus rien.`,
  );
}
const nonEnumerees = largeurs.filter(
  (l) => !new RegExp(`\\b${String(l)}\\b`).test(enumeration[1]),
);
if (nonEnumerees.length > 0) {
  echouer(
    `${String(nonEnumerees.length)} largeur(s) mesurée(s) par ${SONDE_ECRAN}` +
      ` et absente(s) de l'énumération de ${SKILL_AUDIT} :` +
      ` ${nonEnumerees.join(", ")}\n` +
      `\nL'énumération lue : « ${enumeration[1]} »\n` +
      `\nUne procédure qui énumère trois vues quand la sonde en mesure quatre` +
      ` donne l'assurance d'avoir couvert ce qu'on n'a pas couvert.`,
  );
}

const phrasesDefinitionnelles = [
  {
    ou: `${REGLES} §6quinquies`,
    // La phrase qui définit la sonde, par opposition aux récits datés du §6ter.
    phrase: (() => {
      const source = readFileSync(REGLES, "utf8");
      const depart = source.indexOf("questions mesurables");
      if (depart === -1) {
        echouer(
          `« questions mesurables » est introuvable dans ${REGLES} : l'ancre` +
            ` de la phrase définitionnelle ne correspond plus, et ce contrôle` +
            ` ne garde donc plus rien.`,
        );
      }
      return source.slice(depart, source.indexOf(".", depart) + 1);
    })(),
  },
  {
    ou: `${SKILL_AUDIT} (description)`,
    phrase: (() => {
      const ligne = /^description:.*$/m.exec(skillSource);
      if (!ligne) {
        echouer(
          `La ligne \`description:\` est introuvable dans ${SKILL_AUDIT}.`,
        );
      }
      return ligne[0];
    })(),
  },
];

for (const { ou, phrase } of phrasesDefinitionnelles) {
  for (const [mot, attendu] of [
    ["largeurs", largeurs.length],
    ["états", etats.length],
  ]) {
    const annonce = compteAnnonce(phrase, mot);
    if (annonce === -1) {
      echouer(
        `Aucun compte lisible devant « ${mot} » dans ${ou} : le motif de` +
          ` lecture ne correspond plus, et ce contrôle ne garde donc plus rien.` +
          `\nPhrase lue : « ${phrase.trim()} »`,
      );
    }
    if (annonce !== attendu) {
      echouer(
        `${ou} annonce ${EN_LETTRES[annonce]} ${mot}, la sonde en mesure` +
          ` ${String(attendu)}.\n` +
          `\nPhrase lue : « ${phrase.trim()} »`,
      );
    }
  }
}

export const resume = `${String(largeurs.length)} largeurs et ${String(etats.length)} états, annoncés tels quels`;
