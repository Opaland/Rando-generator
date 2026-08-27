import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  trancheSauvegarde,
  type DependancesSauvegarde,
  type LectureSauvegarde,
} from '../../src/store/trancheSauvegarde.ts'
import {
  buildBackup,
  serialiserBackup,
  compresserBackup,
} from '../../src/core/backup.ts'
import type { Track } from '../../src/core/types.ts'
import type { ParcoursDeclare } from '../../src/core/declaratif.ts'

/**
 * La tranche « sauvegarde » du store (issue #155, cinquième tranche).
 *
 * Ces tests gardent trois choses qu'un test de bout en bout tient mal :
 *
 * 1. **l'ordre des gardes.** Exporter ou importer pendant la démonstration
 *    doit d'abord en sortir — et « d'abord » veut dire *avant de lire
 *    l'état*, pas quelque part dans la fonction. Un e2e ne peut affirmer que
 *    le résultat, jamais la séquence ;
 * 2. **la règle de fusion**, quatre fois la même : ce qui est déjà là
 *    l'emporte, la sauvegarde complète. Les traces, les itinéraires perso,
 *    les déclarations et les réglages y obéissent chacun pour une raison
 *    différente, et c'est ce qui rendait la règle invisible quand elle vivait
 *    dispersée dans mille quatre cents lignes ;
 * 3. **le refus silencieux**, qui n'en est pas un : une archive illisible
 *    rejoint la liste des erreurs d'import au lieu de remonter en exception.
 */

/*
  Les fixtures portent les **vrais** types, et c'est ce qui les rend justes.

  La première version les décrivait avec des formes écrites à la main —
  `{ itineraryId, date }` sans `declareLe`, une trace sans `importedAt`. Le
  lecteur de sauvegarde les écartait toutes en silence, parce qu'il valide ce
  qu'il relit, et trois tests tombaient sur un tableau vide sans dire
  pourquoi. Un type inventé pour la commodité d'un test teste autre chose que
  le code.
*/
const TRACE_A: Track = {
  id: 'a',
  filename: 'a.gpx',
  points: [
    [4.5, 45.4],
    [4.51, 45.4],
  ],
  date: '2026-01-01T00:00:00Z',
  importedAt: '2026-01-02T00:00:00Z',
}

/*
  Des points **différents**, et pas seulement un `fingerprint` différent.

  `fusionnerTraces` calcule l'empreinte depuis `trackFingerprint(t.points)` et
  ignore le champ porté par la trace — ce qui est le bon choix : une empreinte
  recopiée depuis un fichier ne prouve rien. La première version de cette
  fixture ne changeait que le champ, les deux traces avaient les mêmes points,
  et la fusion écartait B comme un doublon. Elle avait raison.
*/
const TRACE_B: Track = {
  ...TRACE_A,
  id: 'b',
  filename: 'b.gpx',
  points: [
    [4.6, 45.5],
    [4.61, 45.5],
  ],
}

function etatInitial(): LectureSauvegarde {
  return {
    tracks: [],
    customItineraries: [],
    parcoursDeclares: [],
    toleranceMeters: 25,
    completionPct: 80,
  }
}

/** Un banc d'essai : les dépendances, plus ce qu'elles ont enregistré. */
function banc(etat: LectureSauvegarde = etatInitial()) {
  type Suivi = LectureSauvegarde & { backupMessage?: string | null }
  const journal: string[] = []
  const telechargements: { nom: string; contenu: Blob }[] = []
  const ecrits: Parameters<DependancesSauvegarde['set']>[0][] = []
  const erreurs: string[] = []
  let courant: Suivi = etat

  const deps: DependancesSauvegarde = {
    set: (partiel) => {
      journal.push('set')
      ecrits.push(partiel)
      courant = { ...courant, ...partiel }
    },
    lire: () => {
      journal.push('lire')
      return courant
    },
    signalerErreurImport: (message) => {
      journal.push('erreur')
      erreurs.push(message)
    },
    quitterLaDemonstration: () => {
      journal.push('quitterLaDemonstration')
      return Promise.resolve()
    },
    baseOuverte: () => Promise.resolve(null),
    recalculer: () => {
      journal.push('recalculer')
      return Promise.resolve()
    },
    setTolerance: (v) => {
      journal.push(`tolerance:${String(v)}`)
      return Promise.resolve()
    },
    setCompletionPct: (v) => {
      journal.push(`completion:${String(v)}`)
      return Promise.resolve()
    },
    telecharger: (nom, contenu) => {
      journal.push('telecharger')
      telechargements.push({ nom, contenu })
    },
    maintenant: () => '2026-08-26T12:00:00.000Z',
  }
  return { deps, journal, ecrits, erreurs, telechargements, etat: () => courant }
}

/** Une archive de sauvegarde, dans le format que l'application produit. */
async function archive(parts: {
  tracks?: Track[]
  toleranceMeters?: number
  completionPct?: number
  parcoursDeclares?: ParcoursDeclare[]
}): Promise<File> {
  const backup = buildBackup({
    tracks: parts.tracks ?? [],
    customItineraries: [],
    settings: {
      ...(parts.toleranceMeters !== undefined
        ? { toleranceMeters: parts.toleranceMeters }
        : {}),
      ...(parts.completionPct !== undefined
        ? { completionPct: parts.completionPct }
        : {}),
    },
    parcoursDeclares: parts.parcoursDeclares ?? [],
    exportedAt: '2026-08-01T00:00:00.000Z',
  })
  const octets = await compresserBackup(serialiserBackup(backup))
  return new File([octets as BlobPart], 'sauvegarde.gz')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('exporterSauvegarde', () => {
  it('remet un fichier daté de l’instant de l’export', async () => {
    // Le nom du fichier vient de `maintenant()`, injecté pour cette raison :
    // un nom qui change à chaque seconde ne s'asserte pas.
    const { deps, telechargements } = banc()
    await trancheSauvegarde(deps).exporterSauvegarde()
    expect(telechargements).toHaveLength(1)
    expect(telechargements[0]?.nom).toContain('2026-08-26')
    expect(telechargements[0]?.contenu.type).toBe('application/gzip')
  })

  it('sort de la démonstration avant de lire quoi que ce soit', async () => {
    /*
      L'ordre est le test. Exporter en démonstration rapporterait des sorties
      fictives dans les vraies données au moment de relire la sauvegarde — et
      lire l'état avant d'en sortir revient au même que ne pas en sortir.
    */
    const { deps, journal } = banc()
    await trancheSauvegarde(deps).exporterSauvegarde()
    expect(journal.indexOf('quitterLaDemonstration')).toBeLessThan(
      journal.indexOf('lire'),
    )
  })
})

describe('importerSauvegarde', () => {
  it('sort de la démonstration avant de lire quoi que ce soit', async () => {
    // Trouvé à la revue du sprint 2 : les sorties fictives restaient en
    // mémoire, comptées dans les statistiques, jusqu'au rechargement suivant.
    const { deps, journal } = banc()
    await trancheSauvegarde(deps).importerSauvegarde(await archive({}))
    expect(journal.indexOf('quitterLaDemonstration')).toBeLessThan(
      journal.indexOf('lire'),
    )
  })

  it('signale une archive illisible au lieu de la laisser remonter', async () => {
    const { deps, erreurs, ecrits } = banc()
    const pasUneArchive = new File([new Uint8Array([1, 2, 3])], 'oups.gz')
    await expect(
      trancheSauvegarde(deps).importerSauvegarde(pasUneArchive),
    ).resolves.toBeUndefined()
    expect(erreurs).toHaveLength(1)
    expect(erreurs[0]).toContain('oups.gz')
    // Et rien n'a été écrit : un fichier illisible ne touche pas aux données.
    expect(ecrits).toHaveLength(0)
  })

  it('ajoute ce qui manque sans toucher à ce qui est là', async () => {
    const { deps, etat } = banc({ ...etatInitial(), tracks: [TRACE_A] })
    await trancheSauvegarde(deps).importerSauvegarde(
      await archive({ tracks: [TRACE_B] }),
    )
    expect(etat().tracks.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('ne recalcule que si la fusion a apporté quelque chose', async () => {
    // Le matching coûte cher. Relire une sauvegarde qu'on vient d'écrire ne
    // doit pas relancer huit millions de distances pour zéro changement.
    const avecApport = banc()
    await trancheSauvegarde(avecApport.deps).importerSauvegarde(
      await archive({ tracks: [TRACE_A] }),
    )
    expect(avecApport.journal).toContain('recalculer')

    const sansApport = banc({ ...etatInitial(), tracks: [TRACE_A] })
    await trancheSauvegarde(sansApport.deps).importerSauvegarde(
      await archive({ tracks: [TRACE_A] }),
    )
    expect(sansApport.journal).not.toContain('recalculer')
  })

  it('garde la déclaration déjà faite plutôt que celle de la sauvegarde', async () => {
    /*
      Écraser ferait disparaître une déclaration faite depuis l'export —
      exactement ce qui arrivait aux traces avant qu'on le corrige. La date
      retenue doit être la locale, pas celle de l'archive.
    */
    const { deps, etat } = banc({
      ...etatInitial(),
      parcoursDeclares: [
        { itineraryId: 7, date: '2026-08-20', declareLe: '2026-08-20T10:00:00Z' },
      ],
    })
    await trancheSauvegarde(deps).importerSauvegarde(
      await archive({
        parcoursDeclares: [
          { itineraryId: 7, date: '2026-01-01', declareLe: '2026-01-01T10:00:00Z' },
          { itineraryId: 9, date: '2026-02-02', declareLe: '2026-02-02T10:00:00Z' },
        ],
      }),
    )
    expect(etat().parcoursDeclares).toEqual([
      { itineraryId: 7, date: '2026-08-20', declareLe: '2026-08-20T10:00:00Z' },
      { itineraryId: 9, date: '2026-02-02', declareLe: '2026-02-02T10:00:00Z' },
    ])
  })

  it('ne reprend un réglage que s’il est dans la sauvegarde', async () => {
    // Une sauvegarde ancienne ne doit pas remettre la tolérance à zéro parce
    // qu'elle ne la portait pas encore.
    const sansReglages = banc()
    await trancheSauvegarde(sansReglages.deps).importerSauvegarde(
      await archive({}),
    )
    expect(sansReglages.journal.some((l) => l.startsWith('tolerance'))).toBe(
      false,
    )
    expect(sansReglages.journal.some((l) => l.startsWith('completion'))).toBe(
      false,
    )

    const avecReglages = banc()
    await trancheSauvegarde(avecReglages.deps).importerSauvegarde(
      await archive({ toleranceMeters: 40, completionPct: 60 }),
    )
    expect(avecReglages.journal).toContain('tolerance:40')
    expect(avecReglages.journal).toContain('completion:60')
  })

  it('dit ce que la fusion a rapporté, même quand c’est rien', async () => {
    // Un import silencieux est un import dont on ne sait pas s'il a marché.
    const { deps, etat } = banc({ ...etatInitial(), tracks: [TRACE_A] })
    await trancheSauvegarde(deps).importerSauvegarde(
      await archive({ tracks: [TRACE_A] }),
    )
    expect(etat().backupMessage).toBeTruthy()
  })
})

describe('clearBackupMessage', () => {
  it('efface le message et rien d’autre', () => {
    const { deps, ecrits } = banc()
    trancheSauvegarde(deps).clearBackupMessage()
    expect(ecrits).toEqual([{ backupMessage: null }])
  })
})
