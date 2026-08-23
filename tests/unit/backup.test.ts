import { describe, it, expect } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  backupFilename,
  buildBackup,
  fusionnerItineraires,
  fusionnerTraces,
  compresserBackup,
  lireArchiveBackup,
  resumeFusion,
  serialiserBackup,
} from '../../src/core/backup.ts'
import type { Itinerary, Track } from '../../src/core/types.ts'

/**
 * Sauvegarde complète (issue #132).
 *
 * Tout vit dans l'IndexedDB du navigateur : rien ne suit d'un appareil à
 * l'autre, et vider le cache efface des années de traces. C'est le prix du
 * « vos traces ne quittent jamais votre navigateur » — un prix qu'on assume,
 * à condition de laisser une porte de sortie manuelle.
 */
function trace(id: string, points: [number, number][], filename = `${id}.gpx`): Track {
  return {
    id,
    filename,
    points,
    date: '2026-05-01T08:00:00Z',
    importedAt: '2026-05-01T20:00:00Z',
    elevationGain: 320,
  }
}

function perso(id: number, name: string, coords: [number, number][]): Itinerary {
  return {
    osmRelationId: id,
    ref: null,
    name,
    network: 'PERSO',
    ways: [{ osmWayId: id * 1000, coords }],
    totalMeters: 1200,
    fetchedAt: '2026-05-01T20:00:00Z',
  }
}

const TRACE_A = trace('a', [
  [4.5, 45.4],
  [4.51, 45.41],
])
const TRACE_B = trace('b', [
  [6.0, 45.9],
  [6.01, 45.91],
])

describe('buildBackup / serialiserBackup', () => {
  it('emporte les traces, les itinéraires perso et les réglages', () => {
    const backup = buildBackup({
      tracks: [TRACE_A],
      customItineraries: [perso(-1, 'Ma boucle', [[4.5, 45.4], [4.52, 45.42]])],
      settings: { toleranceMeters: 25, completionPct: 95 },
      exportedAt: '2026-08-20T10:00:00Z',
    })
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.tracks).toHaveLength(1)
    expect(backup.customItineraries[0]?.name).toBe('Ma boucle')
    expect(backup.settings.toleranceMeters).toBe(25)
  })

  it("n'emporte pas les itinéraires téléchargés depuis OpenStreetMap", () => {
    // Ils se re-téléchargent en un clic et pèsent des mégaoctets : les mettre
    // dans la sauvegarde, c'est faire payer à l'utilisateur le transport
    // d'une donnée qui ne lui appartient pas.
    const backup = buildBackup({
      tracks: [],
      customItineraries: [],
      settings: {},
      exportedAt: '2026-08-20T10:00:00Z',
    })
    expect(Object.keys(backup)).not.toContain('itineraries')
    expect(Object.keys(backup)).not.toContain('zones')
  })
})

describe('lireArchiveBackup', () => {
  it('relit ce que serialiserBackup a écrit', async () => {
    const backup = buildBackup({
      tracks: [TRACE_A, TRACE_B],
      customItineraries: [],
      settings: { toleranceMeters: 30 },
      exportedAt: '2026-08-20T10:00:00Z',
    })
    const relu = await lireArchiveBackup(serialiserBackup(backup))
    expect(relu).toEqual(backup)
  })

  it('relit une sauvegarde compressée, reconnue à son en-tête gzip', async () => {
    const backup = buildBackup({
      tracks: [TRACE_A],
      customItineraries: [],
      settings: {},
      exportedAt: '2026-08-20T10:00:00Z',
    })
    const compresse = await compresserBackup(serialiserBackup(backup))
    // Le fichier téléchargé est compressé : une trace, c'est du texte de
    // coordonnées, qui se réduit d'un ordre de grandeur.
    expect(compresse[0]).toBe(0x1f)
    expect(compresse[1]).toBe(0x8b)
    // Et le gain est réel, pas décoratif.
    expect(compresse.length).toBeLessThan(serialiserBackup(backup).length)
    expect(await lireArchiveBackup(compresse)).toEqual(backup)
  })

  it('refuse un fichier qui n’est pas du JSON', async () => {
    await expect(lireArchiveBackup('bonjour')).rejects.toBeInstanceOf(BackupError)
  })

  it('refuse un JSON qui n’est pas une sauvegarde Sentiers', async () => {
    // Un GeoJSON, un export d'une autre application : le dire, plutôt que
    // d'importer zéro trace en silence.
    await expect(
      lireArchiveBackup('{"type":"FeatureCollection","features":[]}'),
    ).rejects.toBeInstanceOf(BackupError)
  })

  it('refuse une sauvegarde d’une version future', async () => {
    const futur = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION + 1,
      exportedAt: '2027-01-01T00:00:00Z',
      tracks: [],
      customItineraries: [],
      settings: {},
    })
    await expect(lireArchiveBackup(futur)).rejects.toThrow(/version/i)
  })

  it('refuse un JSON qui n’est même pas un objet', async () => {
    await expect(lireArchiveBackup('42')).rejects.toBeInstanceOf(BackupError)
  })

  it('écarte un itinéraire perso sans géométrie, et garde les autres', async () => {
    const bancal = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-08-20T10:00:00Z',
      tracks: [],
      customItineraries: [
        { osmRelationId: -9, name: 'Sans chemin', ways: [] },
        { osmRelationId: -8, name: 'Ways abîmés', ways: [{ osmWayId: 1 }] },
        perso(-1, 'Ma boucle', [[4.5, 45.4], [4.52, 45.42]]),
      ],
      settings: {},
    })
    const relu = await lireArchiveBackup(bancal)
    expect(relu.customItineraries.map((i) => i.name)).toEqual(['Ma boucle'])
  })

  it('écarte un itinéraire dont les coordonnées ne sont pas des nombres', async () => {
    // Un fichier venu du disque n'est garanti par rien — le module le sait et
    // le vérifie partout ailleurs. Ce chemin-là y avait échappé : un `null`
    // ou une chaîne se propageait jusqu'au calcul de longueur et au rendu de
    // la carte, très loin du point d'entrée (issue #166).
    const bancal = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-08-21T10:00:00Z',
      tracks: [],
      customItineraries: [
        {
          osmRelationId: -9,
          name: 'Coordonnées piégées',
          ways: [{ osmWayId: 1, coords: [['a', 'b'], [null, {}]] }],
        },
        {
          osmRelationId: -8,
          name: 'Un point sur deux',
          ways: [{ osmWayId: 2, coords: [[4.5, 45.4], [null, 45.5]] }],
        },
        perso(-1, 'Saine', [[4.5, 45.4], [4.52, 45.42]]),
      ],
      settings: {},
    })
    const relu = await lireArchiveBackup(bancal)
    // Les deux abîmés partent, le sain reste : on récupère quatre-vingt-dix-
    // neuf itinéraires sur cent plutôt que zéro.
    expect(relu.customItineraries.map((i) => i.name)).toEqual(['Saine'])
  })

  it('refuse une coordonnée à trois valeurs', async () => {
    // `LonLat` vaut exactement deux nombres, et Sentiers n'en écrit jamais
    // d'autre forme : une coordonnée à trois valeurs signale un fichier qui
    // n'a pas été produit ici. Être strict là-dessus est un choix, pas un
    // oubli — accepter [lon, lat, altitude] demanderait de tronquer, donc de
    // transformer une donnée qu'on prétend seulement relire.
    const troisValeurs = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-08-21T10:00:00Z',
      tracks: [],
      customItineraries: [
        {
          osmRelationId: -1,
          name: 'Avec altitude',
          ways: [{ osmWayId: 1, coords: [[4.5, 45.4, 800], [4.52, 45.42, 850]] }],
        },
      ],
      settings: {},
    })
    expect((await lireArchiveBackup(troisValeurs)).customItineraries).toEqual([])
  })

  it('ne reprend d’un réglage que ce qui est un nombre', async () => {
    // Une sauvegarde bricolée à la main ne doit pas mettre la tolérance à
    // « beaucoup ».
    const bricole = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-08-20T10:00:00Z',
      tracks: [],
      customItineraries: [],
      settings: { toleranceMeters: 'beaucoup', completionPct: 95 },
    })
    const relu = await lireArchiveBackup(bricole)
    expect(relu.settings.toleranceMeters).toBeUndefined()
    expect(relu.settings.completionPct).toBe(95)
  })

  it('survit à une sauvegarde amputée de ses listes', async () => {
    const minimal = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
    })
    const relu = await lireArchiveBackup(minimal)
    expect(relu.tracks).toEqual([])
    expect(relu.customItineraries).toEqual([])
    expect(relu.exportedAt).toBe('')
    expect(relu.settings).toEqual({})
  })

  it('écarte une trace sans point plutôt que de la faire entrer', async () => {
    const bancal = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: '2026-08-20T10:00:00Z',
      tracks: [{ id: 'x', filename: 'x.gpx', points: [], importedAt: 'z' }, TRACE_A],
      customItineraries: [],
      settings: {},
    })
    const relu = await lireArchiveBackup(bancal)
    expect(relu.tracks.map((t) => t.id)).toEqual(['a'])
  })
})

describe('fusionnerTraces', () => {
  it('ajoute ce qui manque et ignore ce qu’on a déjà', () => {
    const resultat = fusionnerTraces([TRACE_A], [TRACE_A, TRACE_B])
    expect(resultat.ajoutees).toBe(1)
    expect(resultat.ignorees).toBe(1)
    expect(resultat.tracks.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('reconnaît la même sortie sous un autre nom de fichier', () => {
    // Le même GPX exporté deux fois par la montre porte deux noms. C'est
    // l'empreinte du tracé qui décide, pas le nom.
    const renommee = trace('autre-id', [
      [4.5, 45.4],
      [4.51, 45.41],
    ], 'export-2.gpx')
    const resultat = fusionnerTraces([TRACE_A], [renommee])
    expect(resultat.ajoutees).toBe(0)
    expect(resultat.tracks).toHaveLength(1)
  })

  it('ne fusionne jamais en écrasant : la trace déjà là est gardée', () => {
    const memeId = trace('a', [
      [7.0, 46.0],
      [7.01, 46.01],
    ], 'ecrase-moi.gpx')
    const resultat = fusionnerTraces([TRACE_A], [memeId])
    expect(resultat.tracks[0]?.filename).toBe('a.gpx')
    // Contenu différent, identifiant déjà pris : elle entre avec un autre id.
    expect(resultat.ajoutees).toBe(1)
    expect(resultat.tracks[1]?.id).not.toBe('a')
    expect(resultat.tracks[1]?.filename).toBe('ecrase-moi.gpx')
  })
})

describe('fusionnerItineraires', () => {
  it('ignore un itinéraire perso déjà présent à l’identique', () => {
    const boucle = perso(-1, 'Ma boucle', [[4.5, 45.4], [4.52, 45.42]])
    const resultat = fusionnerItineraires([boucle], [{ ...boucle }])
    expect(resultat.ajoutes).toBe(0)
    expect(resultat.itineraries).toHaveLength(1)
  })

  it('garde son numéro à un itinéraire dont l’identifiant est libre', () => {
    const ici = perso(-1, 'Boucle du Pilat', [[4.5, 45.4], [4.52, 45.42]])
    const ailleurs = perso(-3, 'Tour du Mont Blanc', [[6.9, 45.9], [6.92, 45.92]])
    const resultat = fusionnerItineraires([ici], [ailleurs])
    expect(resultat.itineraries.map((i) => i.osmRelationId)).toEqual([-1, -3])
  })

  it('renumérote sans jamais retomber sur un numéro déjà distribué', () => {
    // Deux entrants qui portent tous deux le numéro déjà pris : le second ne
    // doit pas écraser le premier renuméroté.
    const ici = perso(-1, 'Ici', [[4.5, 45.4], [4.52, 45.42]])
    const a = perso(-1, 'A', [[6.9, 45.9], [6.92, 45.92]])
    const b = perso(-1, 'B', [[7.9, 44.9], [7.92, 44.92]])
    const resultat = fusionnerItineraires([ici], [a, b])
    const ids = resultat.itineraries.map((i) => i.osmRelationId)
    expect(new Set(ids).size).toBe(3)
  })

  it('accepte un itinéraire sans géométrie sans planter la fusion', () => {
    // La relecture les écarte déjà ; la fusion ne doit pas s'appuyer dessus.
    const vide: Itinerary = { ...perso(-2, 'Vide', [[4.5, 45.4]]), ways: [] }
    const resultat = fusionnerItineraires([], [vide])
    expect(resultat.ajoutes).toBe(1)
  })

  it('renumérote un itinéraire dont l’identifiant est déjà pris', () => {
    // Les ids perso sont attribués localement (−1, −2, …) : deux appareils
    // donnent le même numéro à deux itinéraires différents. Sans
    // renumérotation, l'import écraserait celui de l'appareil d'accueil.
    const ici = perso(-1, 'Boucle du Pilat', [[4.5, 45.4], [4.52, 45.42]])
    const ailleurs = perso(-1, 'Tour du Mont Blanc', [[6.9, 45.9], [6.92, 45.92]])
    const resultat = fusionnerItineraires([ici], [ailleurs])
    expect(resultat.ajoutes).toBe(1)
    expect(resultat.itineraries).toHaveLength(2)
    const noms = resultat.itineraries.map((i) => i.name)
    expect(noms).toContain('Boucle du Pilat')
    expect(noms).toContain('Tour du Mont Blanc')
    const ids = resultat.itineraries.map((i) => i.osmRelationId)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id < 0)).toBe(true)
  })

  it('renumérote aussi les ways, qui portent l’id de leur itinéraire', () => {
    const ici = perso(-1, 'Boucle du Pilat', [[4.5, 45.4], [4.52, 45.42]])
    const ailleurs = perso(-1, 'Tour du Mont Blanc', [[6.9, 45.9], [6.92, 45.92]])
    const resultat = fusionnerItineraires([ici], [ailleurs])
    const tousLesWays = resultat.itineraries.flatMap((i) =>
      i.ways.map((w) => w.osmWayId),
    )
    expect(new Set(tousLesWays).size).toBe(tousLesWays.length)
  })
})

describe('backupFilename', () => {
  it('date le fichier du jour de l’export', () => {
    expect(backupFilename('2026-08-20T10:00:00Z')).toBe(
      'sauvegarde-sentiers-2026-08-20.json.gz',
    )
  })

  it('reste utilisable si la date est illisible', () => {
    expect(backupFilename('n’importe quoi')).toBe('sauvegarde-sentiers.json.gz')
  })
})

describe('resumeFusion', () => {
  it('dit ce qui est entré et ce qui était déjà là', () => {
    expect(
      resumeFusion(
        { tracks: [], ajoutees: 12, ignorees: 3 },
        { itineraries: [], ajoutes: 1, ignores: 0 },
      ),
    ).toBe('12 traces ajoutées, 1 itinéraire ajouté, 3 déjà présents.')
  })

  it('accorde au singulier', () => {
    expect(
      resumeFusion(
        { tracks: [], ajoutees: 1, ignorees: 1 },
        { itineraries: [], ajoutes: 0, ignores: 0 },
      ),
    ).toBe('1 trace ajoutée, 1 déjà présent.')
  })

  it('ne laisse pas croire à un import réussi quand rien n’est entré', () => {
    // Réimporter deux fois la même sauvegarde ne doit pas afficher un
    // message vide, ni un silence qu'on prendrait pour un échec.
    expect(
      resumeFusion(
        { tracks: [], ajoutees: 0, ignorees: 0 },
        { itineraries: [], ajoutes: 0, ignores: 0 },
      ),
    ).toMatch(/rien de nouveau/)
  })
})

/**
 * Issue #170 — le quatrième chemin.
 *
 * Trois lecteurs de fichiers portent la garde du domaine ; la restauration
 * de sauvegarde est le quatrième chemin par lequel des coordonnées entrent,
 * et c'est déjà celui qu'on avait oublié pour la garde de démonstration
 * (CLAUDE.md §4). Une sauvegarde peut venir d'une version antérieure à cette
 * borne, ou avoir été modifiée à la main.
 */
describe('domaine de validité à la restauration (issue #170)', () => {
  /** Construit l'archive gzip que `lireArchiveBackup` attend. */
  async function archiveDe(parts: {
    tracks: Track[]
    customItineraries: Itinerary[]
    settings: Record<string, never>
  }): Promise<ArrayBuffer> {
    const octets = await compresserBackup(
      serialiserBackup(
        buildBackup({ ...parts, exportedAt: '2026-01-01T00:00:00Z' }),
      ),
    )
    return octets.buffer.slice(
      octets.byteOffset,
      octets.byteOffset + octets.byteLength,
    ) as ArrayBuffer
  }

  it('écarte une trace qui franchit le méridien 180°', async () => {
    const archive = await archiveDe({
      tracks: [
        {
          id: 'pacifique',
          filename: 'fidji.gpx',
          points: [
            [179.999, -17],
            [-179.999, -17],
          ],
          date: null,
          importedAt: '2026-01-01T00:00:00Z',
        },
      ],
      customItineraries: [],
      settings: {},
    })
    const relue = await lireArchiveBackup(archive)
    expect(relue.tracks).toHaveLength(0)
  })

  it('garde une trace qui longe l’antiméridien sans le franchir', async () => {
    const archive = await archiveDe({
      tracks: [
        {
          id: 'wallis',
          filename: 'wallis.gpx',
          points: [
            [179.9, -13.3],
            [179.95, -13.31],
          ],
          date: null,
          importedAt: '2026-01-01T00:00:00Z',
        },
      ],
      customItineraries: [],
      settings: {},
    })
    const relue = await lireArchiveBackup(archive)
    expect(relue.tracks).toHaveLength(1)
  })
})
