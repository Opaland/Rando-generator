import { describe, it, expect } from 'vitest'
import {
  ZipError,
  entreesDeTrace,
  listZipEntries,
  looksLikeZip,
  readZipEntry,
} from '../../src/core/zip.ts'
import { buildZip, buildZipTropGrand, gzip } from '../fixtures/zip.ts'

/**
 * Lecture d'archives ZIP (issue #89) : c'est ce qui remplace un connecteur
 * Strava, dont le secret OAuth ne peut pas vivre dans une application
 * statique. L'utilisateur exporte ses données et dépose l'archive.
 */
const GPX = '<?xml version="1.0"?><gpx><trk><trkseg/></trk></gpx>'

describe('looksLikeZip', () => {
  it('reconnaît une archive à sa signature', async () => {
    expect(looksLikeZip(await buildZip([{ nom: 'a.gpx', contenu: GPX }]))).toBe(
      true,
    )
  })

  it('ne prend pas un GPX pour une archive', () => {
    expect(looksLikeZip(new TextEncoder().encode(GPX).buffer)).toBe(false)
    expect(looksLikeZip(new ArrayBuffer(2))).toBe(false)
  })
})

describe('listZipEntries', () => {
  it('liste les entrées du répertoire central', async () => {
    const archive = await buildZip([
      { nom: 'activities/1.gpx', contenu: GPX },
      { nom: 'activities/2.fit', contenu: 'FIT', methode: 0 },
    ])
    const entrees = listZipEntries(archive)
    expect(entrees.map((e) => e.name)).toEqual([
      'activities/1.gpx',
      'activities/2.fit',
    ])
    expect(entrees[1]?.method).toBe(0)
  })

  it('refuse une archive sans en-tête de fin', () => {
    expect(() => listZipEntries(new TextEncoder().encode('pas un zip').buffer)).toThrow(
      ZipError,
    )
  })

  it('refuse une archive Zip64 plutôt que de la lire de travers', async () => {
    // Au-delà de 65 535 entrées, le format bascule sur des en-têtes Zip64 que
    // ce lecteur ne connaît pas. Mieux vaut le dire que rendre n'importe quoi.
    await expect(async () =>
      listZipEntries(await buildZipTropGrand()),
    ).rejects.toThrow(/trop volumineuse|Zip64/i)
  })
})

describe('readZipEntry', () => {
  it('décompresse une entrée deflate', async () => {
    const archive = await buildZip([{ nom: 'a.gpx', contenu: GPX }])
    const entree = listZipEntries(archive)[0]
    expect(entree).toBeDefined()
    const contenu = await readZipEntry(archive, entree!)
    expect(new TextDecoder().decode(contenu)).toBe(GPX)
  })

  it('rend tel quel une entrée stockée', async () => {
    const archive = await buildZip([
      { nom: 'a.gpx', contenu: GPX, methode: 0 },
    ])
    const contenu = await readZipEntry(archive, listZipEntries(archive)[0]!)
    expect(new TextDecoder().decode(contenu)).toBe(GPX)
  })

  it('dégzippe un .gpx.gz, comme en produisent les archives Strava', async () => {
    const archive = await buildZip([
      { nom: 'activities/12.gpx.gz', contenu: await gzip(GPX), methode: 0 },
    ])
    const contenu = await readZipEntry(archive, listZipEntries(archive)[0]!)
    expect(new TextDecoder().decode(contenu)).toBe(GPX)
  })

  it('refuse une méthode de compression inconnue', async () => {
    const archive = await buildZip([{ nom: 'a.gpx', contenu: GPX }])
    const entree = { ...listZipEntries(archive)[0]!, method: 99 }
    await expect(readZipEntry(archive, entree)).rejects.toThrow(ZipError)
  })
})

describe('entreesDeTrace', () => {
  it('ne garde que les fichiers de trace', async () => {
    const archive = await buildZip([
      { nom: 'activities/1.gpx', contenu: GPX },
      { nom: 'activities/2.FIT', contenu: 'x', methode: 0 },
      { nom: 'activities/3.gpx.gz', contenu: 'x', methode: 0 },
      { nom: 'activities/4.tcx', contenu: 'x' },
      { nom: 'profile.csv', contenu: 'x' },
      { nom: 'media/photo.jpg', contenu: 'x' },
    ])
    const noms = entreesDeTrace(listZipEntries(archive)).map((e) => e.name)
    expect(noms).toEqual([
      'activities/1.gpx',
      'activities/2.FIT',
      'activities/3.gpx.gz',
      'activities/4.tcx',
    ])
  })

  it('ignore les dossiers et les métadonnées d’archivage', async () => {
    const archive = await buildZip([
      { nom: 'activities/', contenu: '', methode: 0 },
      { nom: '__MACOSX/._1.gpx', contenu: 'x', methode: 0 },
      { nom: 'activities/1.gpx', contenu: GPX },
    ])
    const noms = entreesDeTrace(listZipEntries(archive)).map((e) => e.name)
    expect(noms).toEqual(['activities/1.gpx'])
  })
})
