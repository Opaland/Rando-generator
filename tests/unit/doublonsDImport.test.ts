// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { trancheImport } from '../../src/store/trancheImport.ts'
import { espionner } from './harnaisImport.ts'

/**
 * Les doublons d'import : les mettre de côté, puis trancher (issue #165).
 *
 * `importerDoublon` et `ignorerDoublon` n'avaient aucun test unitaire —
 * trouvé par la vague de mutation du 17/10. Trois survivants vivaient là :
 * la garde qui n'ajoute `importDoublons` que s'il y a vraiment un doublon,
 * et les deux filtres par identifiant qui le retirent de la liste.
 */

/**
 * Un GPX à points fixes, décalés de `decalage` degrés : deux appels avec le
 * même décalage produisent la même empreinte, deux décalages différents
 * produisent deux empreintes différentes — donc deux doublons distincts.
 */
function gpxFixe(nom: string, decalage = 0): string {
  const lon = (4.5 + decalage).toFixed(4)
  const lon2 = (4.502 + decalage).toFixed(4)
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${nom}</name><trkseg>
    <trkpt lat="45.4000" lon="${lon}"></trkpt>
    <trkpt lat="45.4010" lon="${lon2}"></trkpt>
  </trkseg></trk>
</gpx>`
}

async function deuxFoisLeMemeTrace() {
  const { deps, etat } = espionner()
  const actions = trancheImport(deps)
  await actions.importGpxFiles([new File([gpxFixe('original')], 'a.gpx')])
  expect(etat().tracks).toHaveLength(1)
  await actions.importGpxFiles([new File([gpxFixe('pareil')], 'b.gpx')])
  return { deps, etat, actions }
}

/** Deux traces originales, chacune suivie de son propre doublon. */
async function deuxDoublonsDistincts() {
  const { deps, etat } = espionner()
  const actions = trancheImport(deps)
  await actions.importGpxFiles([
    new File([gpxFixe('original-1', 0)], 'a.gpx'),
    new File([gpxFixe('original-2', 1)], 'c.gpx'),
  ])
  expect(etat().tracks).toHaveLength(2)
  await actions.importGpxFiles([
    new File([gpxFixe('pareil-1', 0)], 'b.gpx'),
    new File([gpxFixe('pareil-2', 1)], 'd.gpx'),
  ])
  expect(etat().importDoublons).toHaveLength(2)
  return { etat, actions }
}

describe('un second fichier qui ressemble à un déjà importé', () => {
  it('est mis de côté, pas rejeté ni ajouté directement', async () => {
    const { etat } = await deuxFoisLeMemeTrace()
    expect(etat().tracks).toHaveLength(1)
    expect(etat().importDoublons).toHaveLength(1)
    expect(etat().importDoublons[0]?.filename).toBe('b.gpx')
  })

  it('importerDoublon l’ajoute et le retire seul de la liste d’attente', async () => {
    /*
      Deux doublons distincts en attente : accepter le premier ne doit
      retirer QUE lui. Trouvé par mutation du 17/10 : le filtre `(d) => d.id
      !== id` rendu muet (`() => undefined`, qui écarte tout, `undefined`
      étant faux pour `filter`) survivait à un test qui n'avait jamais
      qu'un seul doublon en attente — retirer « celui qui correspond » et
      retirer « tous » donnaient alors le même résultat.
    */
    const { etat, actions } = await deuxDoublonsDistincts()
    const [premier, second] = etat().importDoublons
    expect(premier).toBeDefined()
    expect(second).toBeDefined()

    await actions.importerDoublon(premier!.id)

    expect(
      etat().tracks.map((t) => t.id),
      'accepter un doublon doit l’ajouter aux traces',
    ).toContain(premier!.id)
    expect(
      etat().importDoublons.map((d) => d.id),
      'seul le doublon tranché doit quitter l’attente, pas l’autre',
    ).toEqual([second!.id])
  })

  it('ignorerDoublon le retire seul, sans l’ajouter aux traces', async () => {
    const { etat, actions } = await deuxDoublonsDistincts()
    const [premier, second] = etat().importDoublons
    expect(premier).toBeDefined()
    expect(second).toBeDefined()

    actions.ignorerDoublon(premier!.id)

    expect(etat().tracks).toHaveLength(2)
    expect(
      etat().importDoublons.map((d) => d.id),
      'seul le doublon écarté doit disparaître, pas l’autre',
    ).toEqual([second!.id])
  })

  it('ignorerTousDoublons vide la liste d’un coup', async () => {
    const { deps, etat } = espionner()
    const actions = trancheImport(deps)
    await actions.importGpxFiles([new File([gpxFixe('original')], 'a.gpx')])
    await actions.importGpxFiles([
      new File([gpxFixe('pareil-1')], 'b.gpx'),
      new File([gpxFixe('pareil-1')], 'c.gpx'),
    ])
    expect(etat().importDoublons.length).toBeGreaterThan(0)

    actions.ignorerTousDoublons()

    expect(etat().importDoublons).toEqual([])
  })
})

/*
  Issue #559, point 5, même forme que la restauration : `importerDoublon`
  retirait le doublon de la liste **avant** d'écrire. Une écriture refusée
  (appareil plein) le faisait disparaître de la liste comme de la base,
  sans un mot, et l'exception remontait jusqu'au clic.
*/
describe('accepter un doublon quand la base refuse d’écrire', () => {
  it('le laisse en attente, ne l’ajoute pas, et le dit', async () => {
    const { deps, etat, actions } = await deuxFoisLeMemeTrace()
    const [doublon] = etat().importDoublons
    expect(doublon).toBeDefined()
    deps.baseOuverte = () =>
      Promise.resolve({
        saveTrack: () =>
          Promise.reject(new DOMException('plein', 'QuotaExceededError')),
      } as unknown as Awaited<ReturnType<typeof deps.baseOuverte>>)

    await expect(actions.importerDoublon(doublon!.id)).resolves.toBeUndefined()

    expect(etat().importDoublons.map((d) => d.id)).toEqual([doublon!.id])
    expect(etat().tracks).toHaveLength(1)
    expect(etat().importErrors.join(' ')).toMatch(/b\.gpx/)
  })
})
