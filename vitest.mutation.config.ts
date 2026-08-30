import { defineConfig } from 'vitest/config'

/**
 * La suite unitaire telle que la vague de mutation doit la voir.
 *
 * ## Pourquoi une seconde configuration
 *
 * Deux fichiers mesurent un **temps** et non un résultat :
 * `tests/unit/matching.perf.test.ts` et
 * `tests/unit/sortieLongue.perf.test.ts`. Ils ont leur raison d'être — le
 * second garde la promesse de #152, qu'une sortie de quatre heures ne mange
 * pas le processeur d'un téléphone —, et ils restent dans `npm run test` et
 * dans la porte.
 *
 * Mais ils n'ont rien à faire dans une vague de mutation, pour deux motifs
 * distincts :
 *
 * - **ils ne peuvent rien y apprendre.** La mutation demande « les tests
 *   s'aperçoivent-ils qu'un résultat a changé ? ». Un test qui chronomètre
 *   ne regarde aucun résultat : ses mutants survivent tous, sans que cette
 *   survie dise quoi que ce soit ;
 * - **ils font tomber la vague avant qu'elle commence.** Stryker lance trois
 *   processus de test en parallèle ; la machine est donc chargée trois fois
 *   plus qu'en temps normal. Mesuré le 30/08 : le budget de 100 ms du calcul
 *   des chiffres est monté à **111,99 ms**, et Stryker refuse de démarrer si
 *   un test échoue au galop d'essai. La vague ne tournait pas du tout.
 *
 * Ce n'est pas un test « instable » qu'on écarte pour avoir la paix : c'est
 * une assertion sur une horloge, exacte quand la machine est au repos et
 * fausse quand elle ne l'est pas. La déplacer hors d'un contexte qui charge
 * la machine à dessein, c'est la remettre là où elle mesure ce qu'elle croit
 * mesurer (§1bis).
 *
 * Ce qui reste ouvert : un budget en millisecondes absolues reste
 * dépendant de la machine qui l'exécute. Le rendre robuste — un rapport
 * contre une base mesurée dans la même passe, plutôt qu'un nombre — change
 * ce qui est asserté, et c'est donc une décision à écrire, pas un effet de
 * bord de ce lot (§2).
 *
 * ## Et les gardes qui lisent le texte source
 *
 * Trois fichiers ne lisent pas un résultat mais **le code lui-même**, en
 * `?raw`, pour vérifier qu'un motif y est encore présent :
 *
 * - `schemaDeZone.test.ts` cherche `await db.saveZone({ … })` dans
 *   `src/store/trancheZone.ts` ;
 * - `plafondDuStore.test.ts` lit `src/store/*.ts` ;
 * - `etatDeclare.test.ts` lit tout `src/**` en `.ts`.
 *
 * Or **Stryker réécrit ces fichiers sur le disque** : il les instrumente,
 * mutant par mutant. Le motif cherché n'y est donc plus, et la garde
 * annonce très correctement qu'elle ne garde plus rien. Elle a raison sur
 * la copie instrumentée, et tort sur le dépôt.
 *
 * Ce n'est un défaut ni de la garde ni de la vague : c'est que les deux
 * portent sur le même objet — le texte source — et que l'une le réécrit
 * exprès. Une garde de texte n'a rien à apprendre d'un mutant, exactement
 * comme un chronomètre.
 *
 * **Trouvé le 30/08, et à retardement.** Le motif de `schemaDeZone` a été
 * ajouté par #404 le matin même ; la vague ne pouvait plus démarrer depuis.
 * Personne ne pouvait le voir : la mutation n'est pas une porte (§6bis), et
 * rien ne la relance. Un outil cassé en silence pendant que tout est vert,
 * c'est le §6quater sous un autre angle — ce qui n'est pas lu ne garde rien,
 * et ce qui n'est pas lancé ne signale rien.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      // Des chronomètres : ils ne regardent aucun résultat (cf. ci-dessus).
      'tests/unit/**/*.perf.test.ts',
      // Des gardes de texte source, que l'instrumentation réécrit sous elles.
      'tests/unit/schemaDeZone.test.ts',
      'tests/unit/plafondDuStore.test.ts',
      'tests/unit/etatDeclare.test.ts',
    ],
    passWithNoTests: true,
    // Sans cela, un import `?raw` d'une feuille de style rend une chaîne
    // vide : les tests qui comparent la palette CSS aux constantes
    // JavaScript passeraient sans rien vérifier.
    css: true,
  },
})
