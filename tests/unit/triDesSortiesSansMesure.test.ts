import { describe, it, expect } from 'vitest'
import { preparerHistorique, trierHistorique } from '../../src/core/historique.ts'
import type { Track } from '../../src/core/types.ts'

/**
 * Le tri de l'historique quand une mesure manque, quel que soit l'ordre
 * d'arrivée.
 *
 * La vague de mutation du 19/10 a trouvé la branche « a sans date, b daté »
 * du tri par date **jamais atteinte** : le test existant posait la sortie
 * sans date en tête du tableau, et le moteur de tri de V8 ne la passait alors
 * qu'en second argument du comparateur. Même chose pour le dénivelé. Une
 * branche que l'ordre des données décide d'appeler ou non n'est pas testée
 * par un seul ordre : on les prend donc tous.
 */
function trace(filename: string, date: string | null, elevationGain: number | null): Track {
  return {
    id: filename,
    filename,
    points: [
      [4.5, 45.4],
      [4.51, 45.4],
    ],
    date,
    importedAt: '2026-08-21T00:00:00Z',
    elevationGain,
  }
}

function permutations<T>(liste: T[]): T[][] {
  if (liste.length <= 1) return [liste]
  return liste.flatMap((tete, i) =>
    permutations([...liste.slice(0, i), ...liste.slice(i + 1)]).map((reste) => [tete, ...reste]),
  )
}

const noms = (entrees: { track: Track }[]) => entrees.map((e) => e.track.filename)

describe('trierHistorique, dans tous les ordres d’arrivée', () => {
  const traces = [
    trace('juin', '2026-06-01T08:00:00Z', 900),
    trace('mars', '2026-03-01T08:00:00Z', null),
    // Avant 1970 : un instant négatif. Sans lui, une sortie sans date
    // comptée pour zéro tombait quand même en dernier, et le tri paraissait
    // juste pour une mauvaise raison — « pas au 1er janvier 1970 », dit le
    // code, et c'est la seule date qui le distingue.
    trace('1969', '1969-07-21T02:56:00Z', 50),
    // Un dénivelé nul mesuré : une sortie plate est un fait. Sans elle, une
    // mesure manquante comptée pour zéro passait encore après toutes les
    // autres.
    trace('sans-date-1', null, 0),
    trace('sans-date-2', null, null),
  ]

  it.each(permutations(traces).map((ordre) => [ordre.map((t) => t.filename).join(', '), ordre] as const))(
    'par date, depuis [%s] : les datées par date décroissante, puis les autres dans leur ordre d’arrivée',
    (_titre, ordre) => {
      const sansDate = ordre.filter((t) => t.date === null).map((t) => t.filename)
      expect(noms(trierHistorique(preparerHistorique(ordre), 'date'))).toEqual(['juin', 'mars', '1969', ...sansDate])
    },
  )

  it.each(permutations(traces).map((ordre) => [ordre.map((t) => t.filename).join(', '), ordre] as const))(
    'par dénivelé, depuis [%s] : les mesurées par dénivelé décroissant, puis les autres dans leur ordre d’arrivée',
    (_titre, ordre) => {
      const sansMesure = ordre.filter((t) => t.elevationGain === null).map((t) => t.filename)
      expect(noms(trierHistorique(preparerHistorique(ordre), 'denivele'))).toEqual([
        'juin',
        '1969',
        'sans-date-1',
        ...sansMesure,
      ])
    },
  )
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - la condition **intérieure** de `typeof db === 'number' ? 1 : 0` et de
    `b.instant === null ? 0 : 1`, forcée, inversée ou vidée — celle de
    l'extérieur est tuée : la réponse ne bouge qu'entre 0 et 1. Le tri de V8
    ne distingue que « négatif » de « le reste » (insertion binaire et fusion
    testent `order < 0`) : 0 et 1 y rangent pareil. Un autre moteur pourrait
    les distinguer ; aucun test ici ne le peut ;
  - dans la recherche, `toLowerCase` devenu `toUpperCase` : la même
    transformation s'applique au texte et à la requête ;
  - `?? []` dans le groupement : la clé vient de la boucle qui remplit la
    table, elle y est toujours ;
  - `terme === ''` retiré : la chaîne vide est contenue partout, le filtre
    rend tout — une copie au lieu du tableau reçu ;
  - les chaînes du texte cherchable remplacées par « Stryker was here! » :
    il faudrait chercher ce mot ;
  - `normalize('')` et `toLocaleDateString('')` : ils **lèvent** au
    chargement du fichier de test, aucun test ne tourne, et Stryker compte
    pourtant le mutant comme survivant. Vérifié à la main : la suite tombe en
    « no tests ». Ce sont des tués.
*/
