/**
 * Ce que la vague de mutation casse exprès, et ce qu'elle laisse tranquille.
 *
 * Le format est passé de JSON à ce fichier pour une seule raison : une liste
 * d'exclusions sans ses motifs se périme sans que personne le voie. Le JSON
 * n'a pas de commentaires, et le §4ter dit ce que devient une règle dont le
 * pourquoi vit ailleurs.
 */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  /*
    Une configuration de test à part, qui écarte les deux fichiers de
    chronométrage. Le pourquoi est écrit dans `vitest.mutation.config.ts` :
    en deux mots, un test qui mesure un temps n'apprend rien d'un mutant, et
    la charge des trois processus de Stryker le faisait échouer au galop
    d'essai — la vague ne démarrait pas.
  */
  vitest: { configFile: 'vitest.mutation.config.ts' },
  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'reports/mutation.json' },
  coverageAnalysis: 'perTest',
  concurrency: 3,
  timeoutMS: 20_000,
  mutate: [
    'src/core/**/*.ts',
    // Des déclarations de types : rien à muter, et les mutants y sont tous
    // équivalents par construction.
    '!src/core/types.ts',
    'src/store/tranche*.ts',
    'src/db/reglages.ts',

    /*
      `src/lib/` est entré dans le périmètre le 30/08, et il en était absent
      depuis toujours.

      Ce qui l'a fait remarquer : #420 a extrait `baliseDePolitique.ts` de
      `vite.config.ts` **précisément parce qu'il était pur, donc éprouvable**
      — et ses tests n'avaient jamais été mis à l'épreuve, faute d'être dans
      cette liste. Un module extrait pour être testable, hors du périmètre de
      ce qui teste les tests : c'est le §6quinquies appliqué à une vague.

      Le motif est large exprès. Un fichier neuf de `src/lib/` entre dans la
      vague sans que personne y pense ; c'est l'inverse qui doit demander une
      décision, et l'écrire.
    */
    'src/lib/**/*.ts',

    /*
      Les six exclus, et pourquoi chacun.

      Aucun n'a de test unitaire : ce sont des crochets React ou de la glu de
      navigateur, éprouvés par les tests de bout en bout, que Stryker ne
      lance pas. Muter du code sans test unitaire ne rapporte qu'une chose —
      qu'il n'en a pas — et cette liste le dit déjà, en moins cher.

      Ce n'est donc **pas** un constat de manque : mesurer une hauteur peinte
      ou un téléchargement déclenché depuis vitest coûterait plus de mensonge
      que de garantie.
    */
    '!src/lib/deborde.ts', //        crochet React, mesure du DOM peint
    '!src/lib/download.ts', //       Blob et ancre : le navigateur fait le travail
    '!src/lib/maplibreSetup.ts', //  huit lignes, une URL de worker, aucune logique
    '!src/lib/observerReseau.ts', // remplace fetch et XHR au niveau global
    '!src/lib/useCountUp.ts', //     crochet React à minuterie
    '!src/lib/useHorloge.ts', //     crochet React à minuterie
  ],
}
