/**
 * Le socle des listes jumelles : ce que plusieurs familles partagent.
 *
 * ## Pourquoi ce dossier existe
 *
 * `scripts/listes-jumelles.mjs` a compté jusqu'à **1 176 lignes, dont 718 de
 * code**, et contenait **quatorze familles de listes jumelles sans aucun
 * rapport entre elles** — les genres plancherisés par le CSS, les couleurs de
 * réseau, les personas, les largeurs et états de la sonde d'écran, les
 * commandes de la porte sur ses quatre porteurs, celles du hook, les listes
 * de démonstration, le crédit des sources, les poids de tuile, les commandes
 * Playwright, les assertions de durée.
 *
 * C'est le §4 retourné contre l'outil qui l'applique : quatorze règles qui
 * n'ont rien à se dire partageaient un fichier, une sortie et un seul point
 * d'échec (#492). Sa ligne de sortie faisait cinq cents caractères que
 * personne ne lisait en entier — donc déjà un « contrôle qu'il faut penser à
 * lire » déguisé en garde (§6quater).
 *
 * ## Ce que le découpage a appris
 *
 * Il n'était pas mécanique, contrairement à ce que #492 supposait. Les
 * familles étaient **déjà enchevêtrées** : le bloc des largeurs et états
 * lisait `skillSource`, une variable appartenant à la famille des personas,
 * et les trois familles de la porte se partageaient `commandesDeLaPorte`
 * sans que rien ne le dise. Un fichier long ne cache pas seulement ce qu'il
 * contient : il cache aussi ce qui s'y est appuyé sur quoi.
 *
 * Chaque famille lit donc maintenant ses propres sources. `lire()` garde le
 * contenu en mémoire, pour que l'indépendance ne coûte pas une relecture.
 */
import { readFileSync } from "node:fs";

/** Les chemins que plusieurs familles désignent, nommés une seule fois. */
export const REGLES = "CLAUDE.md";
export const CI = ".github/workflows/ci.yml";
export const LISEZ_MOI = "README.md";
export const SONDE_ECRAN = "tests/e2e/regles-d-ecran.spec.ts";
export const CSS = "src/index.css";
export const PERSONAS = "docs/PERSONAS.md";
export const SKILL_AUDIT = ".claude/skills/audit-ui/SKILL.md";
export const SKILL_PORTE = ".claude/skills/porte/SKILL.md";

const enMemoire = new Map();

/** Le contenu d'un fichier, lu une fois quel que soit le nombre de familles. */
export function lire(chemin) {
  if (!enMemoire.has(chemin))
    enMemoire.set(chemin, readFileSync(chemin, "utf8"));
  return enMemoire.get(chemin);
}

/**
 * Échoue en nommant, et sort.
 *
 * Le comportement d'avant le découpage est gardé tel quel : la première
 * famille en désaccord arrête tout. Rapporter les quatorze d'un coup serait
 * plus informatif, mais c'est un changement de comportement et non un
 * découpage — il est posé comme question dans #492, pas tranché ici.
 */
export function echouer(message) {
  console.error(message);
  process.exit(1);
}

/** Les nombres qu'un document écrit en toutes lettres. */
export const EN_LETTRES = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
  "vingt",
];

/**
 * Le compte annoncé devant un mot, dans **une** phrase désignée.
 *
 * On ne balaie pas le fichier : seules les phrases définitionnelles sont
 * comparées, pour la raison écrite dans la famille qui s'en sert.
 */
export function compteAnnonce(phrase, mot) {
  // `[\p{L}-]+` et non `\p{L}+` : « dix-neuf » porte un trait d'union, et
  // s'arrêter à « dix » aurait rendu un compte faux au lieu d'un échec.
  const trouve = new RegExp(`([\\p{L}-]+|\\d+)\\s+${mot}\\b`, "u").exec(phrase);
  if (!trouve) return -1;
  const brut = trouve[1].toLowerCase();
  return /^\d+$/.test(brut) ? Number(brut) : EN_LETTRES.indexOf(brut);
}

/**
 * Les commandes de la porte, telles que la CI les lance.
 *
 * Trois familles s'appuient dessus — le §6 de `CLAUDE.md`, la skill `/porte`
 * et le bloc « Vérifications complètes » du README. Elles se la partageaient
 * par une variable de portée fichier, ce qui est précisément ce qu'un fichier
 * de mille lignes rend invisible.
 *
 * `monkey` est de la porte sans être de la CI — trop lent — et s'y ajoute
 * donc à la main.
 */
export function commandesDeLaPorte() {
  const lues = [
    ...new Set([
      ...[...lire(CI).matchAll(/\bnpm run ([a-z0-9-]+)/g)].map((m) => m[1]),
      "monkey",
    ]),
  ];
  if (lues.length <= 1) {
    echouer(
      `Aucun \`npm run\` lu dans ${CI} : ce contrôle ne garde plus rien.`,
    );
  }
  return lues;
}
