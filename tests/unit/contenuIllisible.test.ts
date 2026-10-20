// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseTraceFile } from '../../src/store/lecture.ts'
import { GPX_SIMPLE } from '../fixtures/gpx.ts'
import { pourquoiIllisible } from '../../src/core/contenuIllisible.ts'

/**
 * Issue #567, point 3 — un fichier qui n'est pas du XML recevait le message
 * du GPX : « Ce fichier n’est pas un XML valide. Vérifiez qu’il s’agit bien
 * d’un export GPX. » Un ZIP vide, un faux `.fit`, un `.gz` : à chacun le
 * conseil de vérifier un export GPX qu'il n'a jamais prétendu être.
 *
 * Chaque nom de fichier ment, exprès : c'est le contenu qui décide.
 */

async function messageDe(contenu: BlobPart, nom: string): Promise<string> {
  try {
    await parseTraceFile(new File([contenu], nom))
  } catch (erreur) {
    return (erreur as Error).message
  }
  throw new Error(`${nom} a été lu sans erreur`)
}

/** Une archive ZIP sans aucune entrée : l'en-tête de fin seul, 22 octets. */
function zipVide(): Uint8Array<ArrayBuffer> {
  const octets = new Uint8Array(new ArrayBuffer(22))
  new DataView(octets.buffer).setUint32(0, 0x06054b50, true)
  return octets
}

describe('un contenu qui n’est pas du XML dit ce qu’il est', () => {
  it('une archive ZIP vide', async () => {
    const message = await messageDe(zipVide(), 'export.zip')
    expect(message).toMatch(/archive ZIP est vide/)
    expect(message).not.toMatch(/GPX|XML/)
  })

  it('un fichier compressé seul (gzip)', async () => {
    // L'en-tête d'un flux gzip (RFC 1952) : c'est lui seul qui est regardé.
    const gzip = new Uint8Array([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03, 0x2b])
    const message = await messageDe(gzip, 'sortie.gpx.gz')
    expect(message).toMatch(/compressé/)
    expect(message).toMatch(/décompressez/i)
  })

  it('un faux .fit, qui n’est ni FIT, ni TCX, ni GPX', async () => {
    const message = await messageDe('ceci est un fichier texte', 'montre.fit')
    expect(message).toMatch(/ni un GPX, ni un FIT, ni un TCX/)
    expect(message).not.toMatch(/export GPX/)
  })

  it('un fichier vide', async () => {
    expect(await messageDe('', 'rien.gpx')).toMatch(/vide/)
    expect(await messageDe('  \n ', 'rien.gpx')).toMatch(/vide/)
  })
})

describe('ce qui ressemble à du XML reste confié au lecteur GPX', () => {
  it('un XML cassé garde le message du GPX, qui est alors le bon', async () => {
    expect(await messageDe('<gpx><trk>', 'casse.gpx')).toMatch(/XML valide/)
  })

  it('un GPX précédé d’une marque d’ordre d’octets se lit', async () => {
    const lu = await parseTraceFile(new File([`\uFEFF${GPX_SIMPLE}`], 'bom.gpx'))
    expect(lu.points.length).toBeGreaterThan(0)
  })
})

describe('pourquoiIllisible', () => {
  it('regarde au-delà des blancs de tête, quelle que soit leur longueur', () => {
    const texte = `${' '.repeat(200)}<gpx/>`
    expect(
      pourquoiIllisible(new TextEncoder().encode(texte).buffer, texte),
    ).toBeNull()
  })
})
