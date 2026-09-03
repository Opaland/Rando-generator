import { readFileSync } from "node:fs";
import { echouer } from "./_socle.mjs";

/*
  Sixième paire : ce que le hook de pré-commit lance, et ce que son en-tête
  annonce.

  Il disait « Ne contient QUE ce qui tient en moins d'une minute : lint,
  listes jumelles, typecheck, tests unitaires » et en lançait **six** —
  `textes` et `chemins` manquaient. Les deux avaient été ajoutés avec leur
  propre commentaire explicatif, juste au-dessus de leur ligne ; l'en-tête,
  six lignes plus haut, n'a pas suivi (issue #367).

  Celle-ci tranche une hypothèse. Ce n'est pas que la documentation vieillit
  parce qu'elle est **loin** du code : ici les deux sont dans le même
  fichier, à six lignes d'écart. C'est qu'aucune énumération n'est comparée à
  ce qu'elle énumère, où qu'elle vive.

  Elle est aussi la plus facile à garder des quatre, pour la même raison :
  les deux côtés sont dans un seul fichier.
*/
const HOOK = ".claude/hooks/porte-avant-commit.sh";

const hookSource = readFileSync(HOOK, "utf8");

const lanceesParLeHook = [
  ...hookSource.matchAll(/^lancer\s+"([a-z0-9-]+)"/gm),
].map((m) => m[1]);
if (lanceesParLeHook.length === 0) {
  echouer(
    `Aucun \`lancer "…"\` lu dans ${HOOK} : le motif de lecture ne correspond` +
      ` plus, et ce contrôle ne garde donc plus rien.`,
  );
}

const departEnTete = hookSource.indexOf("Ne contient QUE");
if (departEnTete === -1) {
  echouer(
    `« Ne contient QUE » est introuvable dans ${HOOK} : l'ancre de l'en-tête` +
      ` ne correspond plus, et ce contrôle ne garde donc plus rien.`,
  );
}
// Les `#` de commentaire retirés : ils coupent les mots d'une ligne à l'autre.
const enTete = hookSource
  .slice(departEnTete, hookSource.indexOf(".", departEnTete) + 1)
  .replace(/^\s*#\s?/gm, "");

const nonAnnoncees = lanceesParLeHook.filter(
  (nom) => !new RegExp(`(?<![\\p{L}-])${nom}(?![\\p{L}-])`, "u").test(enTete),
);
if (nonAnnoncees.length > 0) {
  echouer(
    `${String(nonAnnoncees.length)} commande(s) lancée(s) par ${HOOK} et` +
      ` absente(s) de son propre en-tête : ${nonAnnoncees.join(", ")}\n` +
      `\nEn-tête lu : « ${enTete.replace(/\s+/g, " ").trim()} »\n` +
      `\nUne énumération à six lignes du code qu'elle décrit vieillit comme` +
      ` les autres.`,
  );
}

export const resume = `${String(lanceesParLeHook.length)} commandes du hook, toutes dans son en-tête`;
