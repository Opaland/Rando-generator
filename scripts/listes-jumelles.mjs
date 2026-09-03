/**
 * Les listes jumelles — le mode d'échec du 25/08, rendu mécanique.
 *
 * Deux listes disaient la même règle : celle des commandes plancherisées par
 * `src/index.css`, et celle des commandes mesurées par la question 4 de
 * `tests/e2e/regles-d-ecran.spec.ts`. Elles avaient **le même trou** — ni
 * `select`, ni `input` hors `range`, ni `textarea` — et vingt-cinq commandes
 * du dépôt n'étaient donc ni tenues ni surveillées.
 *
 * Personne ne pouvait l'attraper en relisant un diff : les deux fichiers ne
 * changent pas ensemble, et chacun paraît complet isolément. C'est le §4ter
 * de `CLAUDE.md`, et la garde vit dans deux langages qui ne peuvent rien
 * s'importer.
 *
 * Ce fichier ne vérifie plus rien lui-même : chaque famille vit sous
 * `scripts/jumelles/`, et celui-ci les lance.
 *
 * ## La seule chose qu'il garde, et elle compte
 *
 * **Les familles sont découvertes par le dossier, jamais par une liste.**
 * Une liste de familles à tenir à jour serait la quinzième liste jumelle du
 * dépôt, et elle aurait le même trou que les autres : un fichier oublié
 * dedans serait un contrôle silencieusement mort. C'est exactement le mode
 * d'échec de #489 — un port né mort — transposé aux gardes elles-mêmes.
 *
 * D'où les trois refus ci-dessous : un dossier trop maigre, un fichier sans
 * `resume`, un `resume` vide. Aucun ne peut passer en silence.
 *
 * L'ordre d'affichage est celui du dossier, et le préfixe numérique le fixe.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = "scripts/jumelles";

/*
  Un compte **exact**, et non un plancher.

  La première écriture posait un plancher de dix. Éprouvée en retirant une
  famille du dossier, elle rendait une ligne verte à onze : la famille
  disparue ne manquait à personne. C'est mot pour mot ce que cet item
  reproche au fichier d'avant — un contrôle silencieusement mort — et le
  §1 dit ce que vaut une garde qui passe pour une raison qu'on n'a pas
  voulue.

  Un nombre à tenir à jour est le prix, et il est faible : il ne change que
  le jour où une famille naît ou meurt, et ce jour-là il échoue en le
  disant, au lieu de laisser filer.
*/
const FAMILLES_ATTENDUES = 12;

const fichiers = readdirSync(DOSSIER)
  .filter((nom) => nom.endsWith(".mjs") && !nom.startsWith("_"))
  .sort();

if (fichiers.length !== FAMILLES_ATTENDUES) {
  console.error(
    `${String(fichiers.length)} famille(s) lue(s) sous ${DOSSIER}, pour` +
      ` ${String(FAMILLES_ATTENDUES)} attendues :\n` +
      fichiers.map((nom) => `  ${nom}`).join("\n") +
      `\n\nUne famille en moins est une garde qui a disparu sans que` +
      ` personne le remarque ; une de plus est une garde que ce compte n'a` +
      ` pas encore vue. Dans les deux cas, corriger \`FAMILLES_ATTENDUES\`` +
      ` est une décision, pas une formalité.`,
  );
  process.exit(1);
}

const resumes = [];
for (const nom of fichiers) {
  const famille = await import(`../${join(DOSSIER, nom)}`);
  if (typeof famille.resume !== "string") {
    console.error(
      `${join(DOSSIER, nom)} n'exporte pas de \`resume\`.\n` +
        `\nUne famille qui ne rend pas sa ligne a pu ne rien vérifier du tout,` +
        ` et le lanceur n'aurait aucun moyen de le dire.`,
    );
    process.exit(1);
  }
  if (famille.resume.trim() === "") {
    console.error(
      `${join(DOSSIER, nom)} rend un \`resume\` vide.\n` +
        `\nUne ligne vide se lit comme une famille d'accord. Si la famille n'a` +
        ` rien à dire, elle n'a rien à garder.`,
    );
    process.exit(1);
  }
  resumes.push(famille.resume);
}

console.log(`Listes jumelles d'accord : ${resumes.join(" ; ")}.`);
