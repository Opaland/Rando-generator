import { describe, it, expect } from 'vitest'
import {
  ZipError,
  entreesDeTrace,
  listZipEntries,
  looksLikeZip,
  readZipEntry,
  type ZipEntry,
} from '../../src/core/zip.ts'
import { buildZip } from '../fixtures/zip.ts'

/**
 * Le lecteur ZIP devant des archives comme on en reçoit.
 *
 * Écrit après la vague de mutation du 18/10 sur `core/zip.ts` : 35
 * survivants et 5 lignes jamais exécutées. La fixture n'écrivait ni champ
 * « extra », ni commentaire, ni taille mensongère — or une archive faite par
 * macOS ou par l'Explorateur Windows porte presque toujours un extra, et ce
 * sont ses longueurs qui donnent la position de chaque entrée. Lues de
 * travers, l'archive entière devenait illisible, et aucun test ne le disait.
 *
 * La fixture sait maintenant les écrire (`tests/fixtures/zip.ts`).
 */

const decoder = new TextDecoder()

async function lireTout(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const sortie: Record<string, string> = {}
  for (const entree of listZipEntries(buffer)) {
    sortie[entree.name] = decoder.decode(await readZipEntry(buffer, entree))
  }
  return sortie
}

async function messageDe(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ZipError)
    return (erreur as Error).message
  }
  throw new Error('aucune erreur levée')
}

function erreurSynchrone(f: () => unknown): string {
  try {
    f()
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(ZipError)
    return (erreur as Error).message
  }
  throw new Error('aucune erreur levée')
}

describe('une archive avec champs extra et commentaires', () => {
  it('lit chaque entrée à sa place', async () => {
    // Des longueurs toutes différentes : un extra lu à la place d'un autre,
    // ou dans le mauvais boutisme, décale tout ce qui suit.
    const archive = await buildZip(
      [
        { nom: 'un.gpx', contenu: 'premier', extraLocal: 9, extraCentral: 13, commentaire: 'note' },
        { nom: 'deux.gpx', contenu: 'second', extraLocal: 4, extraCentral: 28, methode: 0 },
      ],
      { commentaire: 'Exporté depuis un vrai logiciel' },
    )
    expect(await lireTout(archive)).toEqual({ 'un.gpx': 'premier', 'deux.gpx': 'second' })
  })

  it('trouve la fin d’archive derrière un commentaire de la taille maximale', async () => {
    const archive = await buildZip([{ nom: 'a.gpx', contenu: 'x' }], {
      commentaire: 'c'.repeat(65_535),
    })
    expect(listZipEntries(archive).map((e) => e.name)).toEqual(['a.gpx'])
  })
})

describe('les refus, avec la phrase qui dit pourquoi', () => {
  it('une archive Zip64 annoncée par la position du répertoire', async () => {
    const archive = new Uint8Array(await buildZip([{ nom: 'a.gpx', contenu: 'x' }]))
    new DataView(archive.buffer).setUint32(archive.length - 22 + 16, 0xffffffff, true)
    expect(erreurSynchrone(() => listZipEntries(archive.buffer))).toBe(
      'Archive trop volumineuse pour être lue ici (format Zip64) : extrayez-la puis déposez les fichiers.',
    )
  })

  it('une archive Zip64 annoncée par le nombre d’entrées', async () => {
    const archive = new Uint8Array(await buildZip([{ nom: 'a.gpx', contenu: 'x' }]))
    new DataView(archive.buffer).setUint16(archive.length - 22 + 10, 0xffff, true)
    expect(erreurSynchrone(() => listZipEntries(archive.buffer))).toBe(
      'Archive trop volumineuse pour être lue ici (format Zip64) : extrayez-la puis déposez les fichiers.',
    )
  })

  it('un répertoire qui annonce plus d’entrées qu’il n’en contient', async () => {
    const archive = new Uint8Array(await buildZip([{ nom: 'a.gpx', contenu: 'x' }]))
    new DataView(archive.buffer).setUint16(archive.length - 22 + 10, 2, true)
    expect(erreurSynchrone(() => listZipEntries(archive.buffer))).toBe(
      'Archive ZIP incomplète : le répertoire est tronqué.',
    )
  })

  it('un répertoire dont la signature est abîmée', async () => {
    const archive = new Uint8Array(await buildZip([{ nom: 'a.gpx', contenu: 'x' }]))
    const vue = new DataView(archive.buffer)
    const debutCentral = vue.getUint32(archive.length - 22 + 16, true)
    vue.setUint32(debutCentral, 0x12345678, true)
    expect(erreurSynchrone(() => listZipEntries(archive.buffer))).toBe(
      'Archive ZIP illisible : répertoire central corrompu.',
    )
  })

  const ENTREE: ZipEntry = {
    name: 'a.gpx',
    method: 0,
    compressedSize: 1,
    uncompressedSize: 1,
    localHeaderOffset: 0,
  }

  it.each([
    ['une entrée qui pointe hors de l’archive', { localHeaderOffset: 10_000 }, 'Archive ZIP incomplète : « a.gpx » manque.'],
    ['une entrée dont l’en-tête local est abîmé', { localHeaderOffset: 1 }, 'Archive ZIP illisible à l’entrée « a.gpx ».'],
    ['une entrée plus longue que l’archive', { compressedSize: 10_000 }, 'Archive ZIP incomplète : « a.gpx » est tronqué.'],
    ['une compression inconnue', { method: 12 }, '« a.gpx » utilise une compression non prise en charge.'],
  ])('%s', async (_cas, ecart, message) => {
    const archive = await buildZip([{ nom: 'a.gpx', contenu: 'x', methode: 0 }])
    expect(await messageDe(readZipEntry(archive, { ...ENTREE, ...ecart }))).toBe(message)
  })
})

describe('le plafond de décompression', () => {
  const MO = 1024 * 1024

  it('accepte une entrée qui atteint le plafond sans le dépasser', async () => {
    const contenu = 'x'.repeat(1_000)
    const archive = await buildZip([{ nom: 'a.gpx', contenu }])
    const [entree] = listZipEntries(archive)
    const lu = await readZipEntry(archive, entree as ZipEntry, { tailleMax: 1_000 })
    expect(lu.byteLength).toBe(1_000)
  })

  it('refuse ce que l’archive annonce trop gros, en mégaoctets', async () => {
    const archive = await buildZip([{ nom: 'a.gpx', contenu: 'x', tailleAnnoncee: 3 * MO }])
    const [entree] = listZipEntries(archive)
    expect(await messageDe(readZipEntry(archive, entree as ZipEntry, { tailleMax: MO }))).toBe(
      '« a.gpx » annonce 3 Mo une fois décompressé : le fichier n’a pas été ouvert.',
    )
  })

  it('refuse ce qui se décompresse plus gros que ce que l’archive annonçait', async () => {
    // L'archive ment : elle annonce un octet, le contenu en fait deux millions.
    const archive = await buildZip([{ nom: 'a.gpx', contenu: 'x'.repeat(2 * MO), tailleAnnoncee: 1 }])
    const [entree] = listZipEntries(archive)
    expect(await messageDe(readZipEntry(archive, entree as ZipEntry, { tailleMax: MO }))).toBe(
      '« a.gpx » se décompresse au-delà de 1 Mo : le fichier n’a pas été ouvert.',
    )
  })
})

describe('entreesDeTrace', () => {
  const entree = (name: string): ZipEntry => ({
    name,
    method: 8,
    compressedSize: 1,
    uncompressedSize: 1,
    localHeaderOffset: 0,
  })

  it('écarte les métadonnées de macOS, même sans « ._ »', () => {
    const gardees = entreesDeTrace([
      entree('__MACOSX/activites/sortie.gpx'),
      entree('activites/._sortie.gpx'),
      entree('activites/sortie.gpx'),
    ])
    expect(gardees.map((e) => e.name)).toEqual(['activites/sortie.gpx'])
  })
})

describe('looksLikeZip et ZipError', () => {
  it('reconnaît une signature de quatre octets tout juste', () => {
    expect(looksLikeZip(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]).buffer)).toBe(true)
  })

  it('nomme son erreur', () => {
    expect(new ZipError('x').name).toBe('ZipError')
  })
})

/*
  Survivants laissés, et pourquoi (§6bis) :
  - `nom.endsWith('/')` retiré ou changé en `startsWith('/')` : un dossier
    n'a pas d'extension de trace, et le filtre suivant l'écarte ;
  - `position + 46 > …`, `debut + 30 > …` et `donnees + compressedSize > …`
    en `>=` : une entrée du répertoire, un en-tête local ou des données qui
    finiraient pile au dernier octet de l'archive n'existent pas — la fin
    d'archive vient après eux, sur 22 octets au moins.
*/
