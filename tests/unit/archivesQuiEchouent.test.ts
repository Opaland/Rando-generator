import { describe, it, expect } from 'vitest'
import { developperArchives } from '../../src/store/lecture.ts'
import { buildZip, buildZipTropGrand } from '../fixtures/zip.ts'

/**
 * Issue #466, second volet — ce que Léa lit quand une archive résiste.
 *
 * ## D'où vient ce fichier
 *
 * De la vague du 01/09, une fois `src/store/**` dans son périmètre (#458).
 * `developperArchives` porte quatre chemins d'échec, chacun avec un message
 * destiné à quelqu'un, et **les quatre étaient non couverts** — la fonction
 * n'avait aucun test qui la nomme, seulement un passage indirect par les
 * imports réussis.
 *
 * ## La distinction que le code fait, et que rien ne vérifiait
 *
 * Deux fois, le code écrit :
 *
 *     error instanceof ZipError ? error.message : « … impossible. »
 *
 * C'est-à-dire : **un `ZipError` sait pourquoi il a échoué, et ce pourquoi
 * doit atteindre la personne**. Le repli générique est pour tout le reste.
 * Rien ne garantissait que le message précis arrive vraiment — un `catch`
 * qui aplatirait tout sur « archive illisible » aurait passé sans bruit.
 *
 * ## Ce qui compte le plus ici
 *
 * Une archive de PDIPR départemental contient des centaines de traces. Si
 * une seule entrée est abîmée, perdre les autres serait le vrai défaut. La
 * quatrième question mesure exactement ça, et la mesure dit : une entrée
 * cassée coûte une entrée.
 */

/** Un fichier dont la lecture disque échoue — quota, périphérique retiré. */
function fichierIllisible(nom: string): File {
  const fichier = new File(['peu importe'], nom)
  Object.defineProperty(fichier, 'arrayBuffer', {
    value: () => Promise.reject(new Error('lecture disque refusée (test)')),
  })
  return fichier
}

/** Casse la signature de la n-ième en-tête locale d'une archive. */
function abimerEntree(archive: Uint8Array, rang: number): Uint8Array {
  const copie = archive.slice()
  let vus = 0
  for (let i = 0; i + 4 <= copie.length; i += 1) {
    const estSignature =
      copie[i] === 0x50 &&
      copie[i + 1] === 0x4b &&
      copie[i + 2] === 0x03 &&
      copie[i + 3] === 0x04
    if (!estSignature) continue
    vus += 1
    if (vus === rang) {
      copie[i + 3] = 0x09
      return copie
    }
  }
  throw new Error(`aucune ${String(rang)}e entrée dans cette archive`)
}

const DEUX_TRACES = () =>
  buildZip([
    { nom: 'a.gpx', contenu: '<gpx/>' },
    { nom: 'b.gpx', contenu: '<gpx/>' },
  ])

const TROIS_TRACES = () =>
  buildZip([
    { nom: 'a.gpx', contenu: '<gpx/>' },
    { nom: 'b.gpx', contenu: '<gpx/>' },
    { nom: 'c.gpx', contenu: '<gpx/>' },
  ])

describe('quand une archive résiste', () => {
  it('dit quel fichier n’a pas pu être lu, et continue avec les autres', async () => {
    const bon = new File(['<gpx/>'], 'trace.gpx')

    const { fichiers, erreurs } = await developperArchives(
      [fichierIllisible('disque-mort.zip'), bon],
      () => undefined,
    )

    expect(erreurs).toEqual(['disque-mort.zip : lecture impossible.'])
    // Ce qui compte autant : le fichier suivant n'est pas perdu.
    expect(fichiers.map((f) => f.name)).toEqual(['trace.gpx'])
  })

  it('fait remonter le motif du ZipError, pas un message générique', async () => {
    /*
      Le Zip64 est le cas honnête : l'archive est valide, elle est
      simplement trop grosse pour ce lecteur, et le message le dit avec ce
      qu'il faut faire. Un `catch` qui aplatirait tout sur « archive
      illisible » ferait perdre exactement cette indication.
    */
    const { erreurs } = await developperArchives(
      [new File([await buildZipTropGrand()], 'departement.zip')],
      () => undefined,
    )

    expect(erreurs).toHaveLength(1)
    expect(erreurs[0]).toContain('departement.zip : ')
    expect(erreurs[0]).toContain('Zip64')
    expect(erreurs[0]).toContain('extrayez-la')
  })

  it('reconnaît un fichier qui se prétend archive sans en être une', async () => {
    const faux = new File(
      [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])],
      'faux.zip',
    )

    const { fichiers, erreurs } = await developperArchives(
      [faux],
      () => undefined,
    )

    expect(erreurs[0]).toContain('fin d’archive introuvable')
    expect(fichiers).toEqual([])
  })

  it('ne perd que l’entrée abîmée, et pas celles qui la suivent', async () => {
    /*
      LA question de ce fichier. Une archive de PDIPR départemental contient
      des centaines de traces ; si une seule est abîmée, perdre les autres
      serait le vrai défaut.

      **Trois entrées, la cassée au milieu** — et ce n'est pas décoratif. Ma
      première version en mettait deux, la cassée en second : elle ne
      distinguait rien. Sans le `catch` par entrée, l'exception remonte au
      `catch` de l'archive, qui produit un message contenant lui aussi
      « b.gpx », et « a.gpx » est déjà rangé de toute façon. Le test passait
      avec et sans la garde.

      Ce qui discrimine est **ce qui vient après** : avec la garde, `c.gpx`
      est sauvé ; sans elle, il est perdu avec le reste. Le §1bis dit qu'une
      assertion qui pourrait passer pour une raison qu'on n'a pas voulue
      n'en est pas une — celle-ci en était une, trouvée en injectant.
    */
    const abimee = abimerEntree(new Uint8Array(await TROIS_TRACES()), 2)

    const { fichiers, erreurs } = await developperArchives(
      [new File([abimee.buffer as ArrayBuffer], 'pdipr.zip')],
      () => undefined,
    )

    expect(fichiers.map((f) => f.name)).toEqual(['a.gpx', 'c.gpx'])
    expect(erreurs).toHaveLength(1)
    expect(erreurs[0]).toContain('b.gpx')
  })

  it('annonce chaque entrée par son nom, dépliée de son dossier', async () => {
    /*
      L'appel à `avancement` survivait à sa suppression : rien ne regardait
      ce que l'écran affiche pendant qu'une grosse archive se déplie. Sans
      lui, la barre reste figée sur le nom de l'archive pendant des
      centaines de fichiers.
    */
    const vus: string[] = []

    await developperArchives(
      [new File([await DEUX_TRACES()], 'lot.zip')],
      (nom, faits, total) => vus.push(`${nom} ${String(faits)}/${String(total)}`),
    )

    expect(vus).toEqual(['a.gpx 0/2', 'b.gpx 1/2'])
  })
})
