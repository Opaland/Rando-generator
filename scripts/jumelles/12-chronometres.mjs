import { readFileSync, readdirSync } from "node:fs";
import { echouer, lire } from "./_socle.mjs";

/*
  ──────────────────────────────────────────────────────────────────────────
  Les chronomètres, et le nom de fichier auquel toute la règle tenait (#475).

  `vitest.mutation.config.ts` écarte de la vague de mutation les tests qui
  assertent sur une horloge — ils n'ont rien à y apprendre, et ils la font
  tomber au galop d'essai. L'exclusion tient au suffixe `.perf.test.ts`.

  La règle vit donc à deux endroits qui peuvent diverger : une **convention
  de nommage**, mécanique, et un **fait sémantique** — ce test regarde-t-il
  une horloge ? Écrire `expect(duree).toBeLessThan(…)` dans un fichier au nom
  ordinaire suffisait à casser la vague, en silence : la mutation n'est pas
  une porte (§6bis), rien ne la relance, et personne ne voyait rien.

  Mesuré le 02/09 : `npm run mutation` ne démarrait plus, sur le budget de
  `routing.test.ts` — 881 ms pour tout le fichier au repos, 2 506 ms pour ce
  seul test avec les 99 fichiers du périmètre instrumentés, **à un seul
  processus**. C'est l'instrumentation qui coûte, pas la concurrence, et la
  prose de la configuration disait le contraire.

  Ce que ce script vérifie : tout fichier de `tests/unit/` qui asserte sur une
  durée écoulée s'appelle `*.perf.test.ts`, ou figure ci-dessous avec son
  motif. Ce qu'il ne prouve pas : que le budget soit le bon.
*/
const DOSSIER_UNITAIRE = "tests/unit";

/**
 * Les assertions sur une durée écoulée qui ne sont **pas** des chronomètres.
 *
 * Une exemption se justifie, elle ne se constate pas : le §4bis dit ce que
 * devient une liste dont le pourquoi vit ailleurs.
 */
const CHRONOMETRES_ASSUMES = new Map([
  [
    "corridor.test.ts",
    "garde une terminaison, pas une performance : la boucle sans fin qu'il " +
      "attrape a tourné dix minutes avant d'être arrêtée, et ses deux autres " +
      "assertions portent sur un résultat qu’un mutant peut casser",
  ],
]);

/*
  Une durée écoulée, et non n'importe quel `performance.now()` : un test peut
  lire l'horloge sans rien asserter dessus. Le motif cherche la soustraction
  de deux relevés, puis une assertion de comparaison sur ce qu'elle rend.
*/
const RELEVE = /performance\.now\(\)\s*-\s*/;
const BORNE = /toBeLessThan(?:OrEqual)?\(/;

/*
  Lecture **récursive**, comme le motif qu'elle garde.

  La première version lisait la racine seule alors que l'exclusion de
  `vitest.mutation.config.ts` s'écrit `tests/unit/(**)/*.perf.test.ts`. Il n'y a
  pas de sous-dossier aujourd'hui, donc rien ne manquait — mais un
  chronomètre rangé dans un sous-dossier serait passé sans un mot, et la
  vague aurait recassé en silence, exactement le défaut que cette garde
  existe pour fermer. Une garde plus étroite que sa règle est une garde qui
  attend son cas (#435, §4ter).
*/
const fichiersUnitaires = readdirSync(DOSSIER_UNITAIRE, {
  recursive: true,
}).filter((nom) => nom.endsWith(".test.ts"));
if (fichiersUnitaires.length < 50) {
  echouer(
    `Seulement ${String(fichiersUnitaires.length)} fichiers de test lus dans` +
      ` ${DOSSIER_UNITAIRE} : le motif de lecture ne correspond plus, et ce` +
      ` script ne garde donc plus rien.`,
  );
}

const chronometres = fichiersUnitaires.filter((nom) => {
  const source = readFileSync(`${DOSSIER_UNITAIRE}/${nom}`, "utf8");
  return RELEVE.test(source) && BORNE.test(source);
});
if (chronometres.length === 0) {
  echouer(
    `Aucune assertion de durée trouvée dans ${DOSSIER_UNITAIRE} : le motif` +
      ` \`performance.now() - …\` suivi d'une borne ne correspond plus, et ce` +
      ` script ne garde donc plus rien.`,
  );
}

const nommesPerf = chronometres.filter((nom) => nom.endsWith(".perf.test.ts"));
const echappes = chronometres.filter(
  (nom) => !nom.endsWith(".perf.test.ts") && !CHRONOMETRES_ASSUMES.has(nom),
);
if (echappes.length > 0) {
  echouer(
    `Ces fichiers assertent sur une durée écoulée sans s'appeler` +
      ` \`*.perf.test.ts\` : ${echappes.join(", ")}.\n` +
      `  → \`vitest.mutation.config.ts\` les écarte par ce motif de nom. Sous` +
      ` ce nom-là ils entrent dans la vague de mutation, qui instrumente le` +
      ` code mesuré et fait exploser leur budget : \`npm run mutation\`` +
      ` refuse alors de démarrer, en silence (issue #475).\n` +
      `  → soit le fichier se renomme, soit son assertion garde autre chose` +
      ` qu'une performance, et il rejoint CHRONOMETRES_ASSUMES avec son motif.`,
  );
}

const exemptesDisparus = [...CHRONOMETRES_ASSUMES.keys()].filter(
  (nom) => !chronometres.includes(nom),
);
if (exemptesDisparus.length > 0) {
  echouer(
    `${exemptesDisparus.join(", ")} figure(nt) dans CHRONOMETRES_ASSUMES sans` +
      ` asserter de durée : l'exemption ne sert plus, et une exemption qui ne` +
      ` sert plus finit par en couvrir une autre.`,
  );
}

export const resume = `${String(chronometres.length)} assertions de durée, dont ${String(nommesPerf.length)} nommées *.perf.test.ts (${String(CHRONOMETRES_ASSUMES.size)} exemption assumée)`;
