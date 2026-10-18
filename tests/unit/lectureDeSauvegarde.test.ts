import { describe, it, expect } from 'vitest'
import {
  BackupError,
  backupFilename,
  buildBackup,
  compresserBackup,
  fusionnerItineraires,
  fusionnerTraces,
  serialiserBackup,
  lireArchiveBackup,
  resumeFusion,
} from '../../src/core/backup.ts'
import type { Itinerary, LonLat, Track } from '../../src/core/types.ts'

/**
 * Ce que la relecture d'une sauvegarde écarte, entrée par entrée.
 *
 * Écrit après la vague de mutation du 18/10 sur `core/backup.ts` : 64
 * survivants hors de la fusion des itinéraires, dont la plupart dans les
 * gardes `estTrace`, `estItineraire`, `estParcoursDeclare` et `estPoint`.
 * Une sauvegarde vient du disque, peut avoir été écrite à la main ou par une
 * autre version : ce qu'une garde laisse passer finit en base, puis dans le
 * calcul de longueur et le rendu de la carte (#166).
 *
 * Chaque cas pose **une** entrée abîmée à côté d'une entrée saine, et
 * demande que la première soit écartée et la seconde gardée — sans quoi
 * « tout est écarté » passerait pour « l'abîmée est écartée ».
 */

const POINT_A: [number, number] = [4.5, 45.4]
const POINT_B: [number, number] = [4.51, 45.41]

const TRACE_SAINE = {
  id: 'saine',
  filename: 'saine.gpx',
  points: [POINT_A, POINT_B],
  date: null,
  importedAt: '2026-08-01T00:00:00.000Z',
}

const ITINERAIRE_SAIN = {
  osmRelationId: -1,
  ref: null,
  name: 'Sain',
  network: 'PERSO' as const,
  ways: [{ osmWayId: -1, coords: [POINT_A, POINT_B] }],
  totalMeters: 1,
  fetchedAt: '2026-08-01T00:00:00.000Z',
}

const DECLARATION_SAINE = {
  itineraryId: 7,
  date: '2026-07-14',
  declareLe: '2026-08-01T00:00:00.000Z',
}

function sauvegarde(parts: Record<string, unknown>): string {
  return JSON.stringify({
    format: 'sentiers-sauvegarde',
    version: 1,
    exportedAt: '2026-08-01T00:00:00.000Z',
    tracks: [],
    customItineraries: [],
    parcoursDeclares: [],
    settings: {},
    ...parts,
  })
}

describe('les traces abîmées sont écartées, la saine reste', () => {
  it.each([
    ['une entrée nulle', null],
    ['un identifiant numérique', { ...TRACE_SAINE, id: 12 }],
    ['un nom de fichier absent', { ...TRACE_SAINE, filename: undefined }],
    ['un seul point abîmé parmi d’autres', { ...TRACE_SAINE, points: [POINT_A, [4.5, 'x']] }],
    ['une latitude en chaîne', { ...TRACE_SAINE, points: [POINT_A, [4.5, '45.4']] }],
  ])('%s', async (_cas, abimee) => {
    const relu = await lireArchiveBackup(sauvegarde({ tracks: [abimee, TRACE_SAINE] }))
    expect(relu.tracks.map((t) => t.id)).toEqual(['saine'])
  })
})

describe('les itinéraires abîmés sont écartés, le sain reste', () => {
  it.each([
    ['une entrée nulle', null],
    ['un numéro en chaîne', { ...ITINERAIRE_SAIN, osmRelationId: '-2' }],
    ['un chemin nul parmi d’autres', { ...ITINERAIRE_SAIN, ways: [ITINERAIRE_SAIN.ways[0], null] }],
    [
      'un chemin aux coordonnées abîmées parmi d’autres',
      { ...ITINERAIRE_SAIN, ways: [ITINERAIRE_SAIN.ways[0], { osmWayId: -2, coords: [[4.5]] }] },
    ],
    ['un chemin sans coordonnées', { ...ITINERAIRE_SAIN, ways: [{ osmWayId: -2, coords: [] }] }],
  ])('%s', async (_cas, abime) => {
    const relu = await lireArchiveBackup(
      sauvegarde({ customItineraries: [abime, ITINERAIRE_SAIN] }),
    )
    expect(relu.customItineraries.map((i) => i.name)).toEqual(['Sain'])
  })
})

describe('les déclarations', () => {
  it.each([
    ['une entrée nulle', null],
    ['un itinéraire en chaîne', { ...DECLARATION_SAINE, itineraryId: '7' }],
    ['une date de déclaration absente', { ...DECLARATION_SAINE, declareLe: undefined }],
    ['une date numérique', { ...DECLARATION_SAINE, date: 20260714 }],
  ])('écartent %s', async (_cas, abimee) => {
    const relu = await lireArchiveBackup(
      sauvegarde({ parcoursDeclares: [abimee, DECLARATION_SAINE] }),
    )
    expect(relu.parcoursDeclares).toEqual([DECLARATION_SAINE])
  })

  it.each([
    ['une date nulle', null],
    ['une date absente', undefined],
  ])('gardent %s — « je ne sais plus quand » est une réponse', async (_cas, date) => {
    const relu = await lireArchiveBackup(
      sauvegarde({ parcoursDeclares: [{ ...DECLARATION_SAINE, date }] }),
    )
    expect(relu.parcoursDeclares).toEqual([{ ...DECLARATION_SAINE, date: null }])
  })
})

describe('le fichier lui-même', () => {
  it('accepte le format écrit en toutes lettres', async () => {
    // Le contrat du fichier, pas seulement la constante : une sauvegarde
    // téléchargée hier porte cette chaîne-là, et doit se relire demain.
    const relu = await lireArchiveBackup(sauvegarde({ tracks: [TRACE_SAINE] }))
    expect(relu.format).toBe('sentiers-sauvegarde')
  })

  it('relit une sauvegarde décompressée, donnée en octets', async () => {
    const octets = new TextEncoder().encode(sauvegarde({ tracks: [TRACE_SAINE] }))
    const relu = await lireArchiveBackup(octets)
    expect(relu.tracks).toHaveLength(1)
  })

  it('refuse une version écrite en chaîne', async () => {
    await expect(lireArchiveBackup(sauvegarde({ version: '1' }))).rejects.toThrow(
      'Cette sauvegarde a été écrite par une version plus récente de Sentiers ' +
        '(version 1). Mettez l’application à jour, puis réessayez.',
    )
  })

  it.each([
    ['un texte illisible', 'bonjour', 'Ce fichier n’est pas une sauvegarde Sentiers : son contenu est illisible.'],
    ['un nombre', '42', 'Ce fichier n’est pas une sauvegarde Sentiers.'],
    ['null', 'null', 'Ce fichier n’est pas une sauvegarde Sentiers.'],
    ['une chaîne', '"sentiers"', 'Ce fichier n’est pas une sauvegarde Sentiers.'],
    [
      'un autre format',
      '{"format":"autre"}',
      'Ce fichier n’est pas une sauvegarde Sentiers. Choisissez le fichier ' +
        '« sauvegarde-sentiers-….json.gz » produit par « Enregistrer une sauvegarde ».',
    ],
  ])('refuse %s, avec la phrase qui dit pourquoi', async (_cas, texte, message) => {
    const echec = lireArchiveBackup(texte)
    await expect(echec).rejects.toBeInstanceOf(BackupError)
    /*
      Le message entier, pas une sous-chaîne : `toThrow('…Sentiers.')` était
      satisfait par la phrase plus longue « …Sentiers. Choisissez le
      fichier… », et laissait vivre quatre mutants de `champs` qui envoient
      un nombre ou une chaîne sur le mauvais refus (vague du 18/10).
    */
    await expect(echec.catch((e: unknown) => (e as Error).message)).resolves.toBe(
      message,
    )
  })

  it('relit sans l’abîmer un texte accentué coupé entre deux morceaux décompressés', async () => {
    /*
      Le flux de décompression rend le texte par morceaux, et un « é » tient
      sur deux octets : sans `stream: true`, celui qui tombe à cheval sur deux
      morceaux devient « �� ». Un nom assez long pour couvrir plusieurs
      morceaux en coupe un — à condition de prendre « € », trois octets : la
      première version prenait « é », deux octets, et restait verte sans le
      correctif (vu à l'injection). Probablement parce que les morceaux
      coupent à des offsets pairs — supposé, pas mesuré.
    */
    const nom = '€'.repeat(300_000)
    const backup = buildBackup({
      tracks: [{ ...TRACE_SAINE, filename: nom }],
      customItineraries: [],
      settings: {},
      parcoursDeclares: [],
      exportedAt: '2026-08-01T00:00:00.000Z',
    })
    const relu = await lireArchiveBackup(await compresserBackup(serialiserBackup(backup)))
    expect(relu.tracks[0]?.filename === nom, 'le nom relu n’est plus celui écrit').toBe(true)
  })

  it('nomme son erreur', () => {
    expect(new BackupError('x').name).toBe('BackupError')
  })

  it('ne pose pas de réglage absent, même à `undefined`', async () => {
    // `toEqual` tient `{ a: undefined }` pour égal à `{}` : on compte les clefs.
    const relu = await lireArchiveBackup(sauvegarde({ settings: {} }))
    expect(Object.keys(relu.settings)).toEqual([])
  })
})

describe('fusionnerTraces, à l’intérieur d’une même sauvegarde', () => {
  const trace = (id: string, decalage: number): Track => ({
    ...TRACE_SAINE,
    id,
    points: [
      [4.5 + decalage, 45.4],
      [4.51 + decalage, 45.41],
    ],
  })

  it('n’ajoute qu’une fois une trace que la sauvegarde porte deux fois', () => {
    const resultat = fusionnerTraces([], [trace('a', 0), trace('b', 0)])
    expect(resultat.tracks.map((t) => t.id)).toEqual(['a'])
    expect(resultat.ignorees).toBe(1)
  })

  it('renomme sans doublon deux entrantes qui portent un identifiant déjà pris', () => {
    const resultat = fusionnerTraces(
      [trace('x', 0)],
      [trace('x', 1), trace('x-importee', 2), trace('x', 3)],
    )
    const ids = resultat.tracks.map((t) => t.id)
    expect(ids[1]).toBe('x-importee')
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('resumeFusion, les accords restants', () => {
  it('dit « itinéraires » au pluriel, et additionne les deux « déjà présents »', () => {
    expect(
      resumeFusion(
        { tracks: [], ajoutees: 0, ignorees: 2 },
        { itineraries: [], ajoutes: 3, ignores: 1 },
      ),
    ).toBe('3 itinéraires ajoutés, 3 déjà présents.')
  })
})

describe('backupFilename', () => {
  it('ne prend une date que si elle ouvre la chaîne', () => {
    expect(backupFilename('le 2026-08-20')).toBe('sauvegarde-sentiers.json.gz')
  })
})

describe('fusionnerItineraires ne confond pas deux itinéraires différents', () => {
  const itin = (id: number, name: string, coords: LonLat[]): Itinerary => ({
    ...ITINERAIRE_SAIN,
    osmRelationId: id,
    name,
    ways: [{ osmWayId: id, coords }],
  })
  /*
    Les survivants de `signature` à la vague du 18/10 rendaient la même
    signature à deux itinéraires distincts — et la restauration écartait
    alors le second comme « déjà présent », sans un mot.
  */
  it.each([
    [
      'même nom, même départ, arrivée différente',
      itin(-1, 'Boucle', [[4.5, 45.4], [4.6, 45.5]]),
      itin(-2, 'Boucle', [[4.5, 45.4], [4.7, 45.6]]),
    ],
    [
      'même nom, même arrivée, départ différent',
      itin(-1, 'Boucle', [[4.5, 45.4], [4.6, 45.5]]),
      itin(-2, 'Boucle', [[4.4, 45.3], [4.6, 45.5]]),
    ],
    [
      'même tracé, noms différents',
      itin(-1, 'Boucle', [[4.5, 45.4], [4.6, 45.5]]),
      itin(-2, 'Autre', [[4.5, 45.4], [4.6, 45.5]]),
    ],
    [
      'nom et nombre de points qui se recollent pareil',
      // « x » + 12 points et « x1 » + 2 points s'écrivent tous deux « x12 »
      // si les champs ne sont pas séparés.
      itin(
        -1,
        'x',
        Array.from({ length: 12 }, (_, i): LonLat => [4.5 + (i === 11 ? 0.1 : i * 1e-3), 45.4]),
      ),
      itin(-2, 'x1', [[4.5, 45.4], [4.6, 45.4]]),
    ],
  ])('%s', (_cas, a, b) => {
    const resultat = fusionnerItineraires([a], [b])
    expect(resultat.ajoutes).toBe(1)
    expect(resultat.itineraries).toHaveLength(2)
  })

  /*
    Survivants laissés, et pourquoi (§6bis) :
    - `itineraire.name ?? ''` → `?? "Stryker was here!"` : la même chaîne de
      remplacement pour deux itinéraires sans nom, donc la même comparaison ;
    - `estGzip` à moitié (`octets[0] === 0x1f && true`, `||`, `true && …`) :
      il faudrait un fichier non compressé qui commence par l'octet 0x1f ou
      dont le deuxième octet vaut 0x8b — aucun JSON ne s'écrit ainsi. Le
      remplacement entier par `true` est, lui, tué.
  */
})
