// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * Issue #442 — les deux imports finissent pareil, et doivent le rester.
 *
 * ## Ce que ce fichier garde
 *
 * `importGpxFiles` et `importCustomGpx` se terminaient par le même épilogue,
 * écrit deux fois : remise à zéro de l'avancement, rangement de ce qui est
 * entré suivi d'un recalcul, cumul des messages d'échec. Quatre fragments
 * étaient identiques au caractère près.
 *
 * Ce n'était pas un défaut — les deux copies étaient d'accord, vérifié — mais
 * une forme : **rien ne les tenait d'accord**, et les deux fonctions ne
 * changent jamais ensemble. C'est le §4ter dans sa formulation exacte : deux
 * listes qui disent la même règle ont le même trou.
 *
 * ## Pourquoi un test plutôt que la seule fonction nommée
 *
 * `deposerLeResultatDeLImport` supprime la duplication, mais elle ne se
 * défend pas toute seule : rien n'empêche qu'un des deux appels soit un jour
 * remplacé par un épilogue écrit à la main « juste pour ce cas ». Ce fichier
 * pose les trois questions sur **les deux chemins à la fois**, de sorte
 * qu'une réponse qui divergerait fasse rougir.
 *
 * ## Ce qui a été vérifié (§1)
 *
 * Le test est vert sur le code d'avant la fonction nommée — il devait
 * l'être, l'issue dit qu'il n'y avait pas de défaut. Ce qui le rend
 * discriminant a été mesuré en injectant la dérive dans **chaque** copie
 * séparément : remplacer `[...state.importErrors, ...errors]` par `errors`
 * d'un seul côté fait rougir, et le message nomme le chemin fautif. Les deux
 * autres questions ont été éprouvées de même — l'avancement laissé en place
 * d'un côté, le recalcul sorti de sa garde de l'autre.
 *
 * Et après la fonction nommée, la même injection posée une seule fois fait
 * rougir **les deux** chemins. C'est la mesure qui dit qu'ils passent
 * désormais par le même code, plutôt que la promesse qu'ils y passent.
 */

/** Un fichier que ni le lecteur GPX ni les autres n'accepteront. */
const illisible = (nom: string) =>
  new File(['ceci n’est pas une trace'], nom, {
    type: 'application/gpx+xml',
  })

/** Un GPX bien formé, assez long pour être une trace comme un itinéraire. */
const bon = (nom: string) =>
  new File(
    [
      `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${nom}</name><trkseg>
    <trkpt lat="45.400" lon="4.500"><ele>300</ele></trkpt>
    <trkpt lat="45.401" lon="4.501"><ele>310</ele></trkpt>
    <trkpt lat="45.402" lon="4.502"><ele>320</ele></trkpt>
  </trkseg></trk>
</gpx>`,
    ],
    nom,
    { type: 'application/gpx+xml' },
  )

/**
 * Les deux chemins, sous le même nom, pour poser chaque question deux fois.
 *
 * Les nommer ainsi n'est pas de la coquetterie : le message d'échec de
 * `it.each` porte alors le chemin fautif, et c'est ce qui distingue « les
 * deux ont dérivé » de « un seul a dérivé ».
 */
const chemins = [
  {
    quoi: 'importGpxFiles (les traces)',
    lancer: (actions: ReturnType<typeof trancheImport>, fichiers: File[]) =>
      actions.importGpxFiles(fichiers),
  },
  {
    quoi: 'importCustomGpx (les itinéraires)',
    lancer: (actions: ReturnType<typeof trancheImport>, fichiers: File[]) =>
      actions.importCustomGpx(fichiers),
  },
]

describe.each(chemins)('l’épilogue de $quoi', ({ lancer }) => {
  it('cumule les messages d’échec au lieu de les remplacer', async () => {
    const espion = espionner()
    const actions = trancheImport(espion.deps)

    await lancer(actions, [illisible('premier.gpx')])
    // Sans ce préalable, un second import qui n'ajouterait rien du tout
    // rendrait la même longueur qu'un remplacement.
    expect(espion.etat().importErrors).toHaveLength(1)

    await lancer(actions, [illisible('second.gpx')])

    const messages = espion.etat().importErrors.join(' ')
    expect(espion.etat().importErrors).toHaveLength(2)
    expect(messages).toContain('premier.gpx')
    expect(messages).toContain('second.gpx')
  })

  it('range l’avancement, même quand tout a échoué', async () => {
    const espion = espionner()
    await lancer(trancheImport(espion.deps), [illisible('rate.gpx')])
    expect(espion.etat().importProgress).toBeNull()
  })

  it('ne touche pas à la liste des messages quand rien n’a raté', async () => {
    /*
      Le survivant de la vague du 01/09 : `if (errors.length > 0)` muté en
      `true` ne faisait rougir personne. Ce n'est pas un mutant équivalent —
      sans la garde, `[...etat.importErrors, ...errors]` construit un
      **nouveau tableau** au même contenu, et Zustand repeint alors la liste
      des erreurs à chaque import réussi.
      
      La différence n'est pas une valeur mais une identité : c'est donc
      l'identité qu'on assert.
    */
    const espion = espionner()
    const avant = espion.etat().importErrors

    await lancer(trancheImport(espion.deps), [bon('bonne.gpx')])

    expect(espion.etat().importErrors).toBe(avant)
  })

  it('ne recalcule la complétion que si quelque chose est entré', async () => {
    const rate = espionner()
    await lancer(trancheImport(rate.deps), [illisible('rate.gpx')])
    expect(rate.appels.recompute).toBe(0)

    const reussi = espionner()
    await lancer(trancheImport(reussi.deps), [bon('bonne.gpx')])
    expect(reussi.appels.recompute).toBe(1)
  })
})
