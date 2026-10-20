import { describe, it, expect } from 'vitest'
import {
  cumulativeDistances,
  historyStats,
  monthLabel,
  monthlyBuckets,
  reperesHistogramme,
  trackDistanceMeters,
} from '../../src/core/history.ts'
import type { LonLat, Track } from '../../src/core/types.ts'

const LAT = 45.4

/** Trace rectiligne d'environ `meters` mètres, à la date donnée. */
function track(
  id: string,
  date: string | null,
  meters: number,
  elevationGain: number | null = null,
): Track {
  const points: LonLat[] = []
  const step = 0.0002
  const total = Math.max(2, Math.round(meters / (step * 111_195 * 0.7)))
  for (let i = 0; i < total; i++) points.push([4.5 + i * step, LAT])
  return {
    id,
    filename: `${id}.gpx`,
    points,
    date,
    importedAt: '2026-08-19T00:00:00Z',
    elevationGain,
  }
}

describe('trackDistanceMeters', () => {
  it('mesure la longueur de la trace', () => {
    expect(trackDistanceMeters(track('a', null, 1000))).toBeGreaterThan(500)
  })

  it('retourne 0 pour une trace sans géométrie exploitable', () => {
    const vide: Track = {
      id: 'v',
      filename: 'v.gpx',
      points: [],
      date: null,
      importedAt: '2026-08-19T00:00:00Z',
    }
    expect(trackDistanceMeters(vide)).toBe(0)
  })
})

describe('historyStats', () => {
  it('totalise sorties, distance et dénivelé', () => {
    const stats = historyStats([
      track('a', '2026-06-10T08:00:00Z', 5000, 300),
      track('b', '2026-07-02T08:00:00Z', 8000, 500),
    ])
    expect(stats.count).toBe(2)
    expect(stats.distanceMeters).toBeGreaterThan(0)
    expect(stats.elevationGain).toBe(800)
    expect(stats.firstDate).toBe('2026-06-10T08:00:00Z')
    expect(stats.lastDate).toBe('2026-07-02T08:00:00Z')
  })

  it('retient la première et la dernière date même hors ordre d’arrivée', () => {
    /*
      Trouvé par mutation du 17/10 : le test précédent présente les traces
      déjà triées par date d'arrivée (juin puis juillet), où « mettre à
      jour sans condition » et « mettre à jour seulement si plus extrême »
      donnent le même résultat. Ici l'ordre d'arrivée ne correspond à
      aucun des deux extrêmes.
    */
    const stats = historyStats([
      track('b', '2026-06-01T08:00:00Z', 1000),
      track('a', '2026-01-01T08:00:00Z', 1000),
      track('c', '2026-03-01T08:00:00Z', 1000),
    ])
    expect(stats.firstDate).toBe('2026-01-01T08:00:00Z')
    expect(stats.lastDate).toBe('2026-06-01T08:00:00Z')
  })

  it('compte les sorties sans date sans les perdre', () => {
    const stats = historyStats([
      track('a', '2026-06-10T08:00:00Z', 5000),
      track('b', null, 3000),
    ])
    expect(stats.count).toBe(2)
    expect(stats.undatedCount).toBe(1)
    expect(stats.firstDate).toBe('2026-06-10T08:00:00Z')
  })

  it('ignore un dénivelé absent plutôt que de le compter pour zéro à tort', () => {
    const stats = historyStats([track('a', null, 1000, null)])
    expect(stats.elevationGain).toBe(0)
  })

  it('gère une liste vide', () => {
    expect(historyStats([])).toEqual({
      count: 0,
      distanceMeters: 0,
      elevationGain: 0,
      undatedCount: 0,
      firstDate: null,
      lastDate: null,
    })
  })

  it('écarte une date illisible comme une absence de date', () => {
    const stats = historyStats([track('a', 'pas-une-date', 1000)])
    expect(stats.undatedCount).toBe(1)
    expect(stats.firstDate).toBeNull()
  })
})

describe('monthlyBuckets', () => {
  it('regroupe les sorties par mois, du plus ancien au plus récent', () => {
    const buckets = monthlyBuckets([
      track('b', '2026-07-02T08:00:00Z', 8000, 500),
      track('a', '2026-06-10T08:00:00Z', 5000, 300),
      track('c', '2026-07-20T08:00:00Z', 2000, 100),
    ])
    expect(buckets.map((b) => b.month)).toEqual(['2026-06', '2026-07'])
    expect(buckets[1]!.count).toBe(2)
    expect(buckets[1]!.elevationGain).toBe(600)
    // Trouvé par mutation du 17/10 : `+=` devenu `-=` ne cassait aucun test,
    // parce que seul `elevationGain` était lu sur un mois à deux traces.
    expect(buckets[1]!.distanceMeters).toBeGreaterThan(
      buckets[0]!.distanceMeters,
    )
  })

  it('comble les mois sans sortie plutôt que de les masquer', () => {
    // Un trou dans la pratique est une information, pas un détail à cacher.
    const buckets = monthlyBuckets([
      track('a', '2026-01-10T08:00:00Z', 5000),
      track('b', '2026-04-10T08:00:00Z', 5000),
    ])
    expect(buckets.map((b) => b.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
    expect(buckets[1]!.count).toBe(0)
    expect(buckets[1]!.distanceMeters).toBe(0)
  })

  it('franchit correctement un changement d’année', () => {
    const buckets = monthlyBuckets([
      track('a', '2025-11-10T08:00:00Z', 1000),
      track('b', '2026-02-10T08:00:00Z', 1000),
    ])
    expect(buckets.map((b) => b.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  /*
    Ce test disait l'inverse jusqu'au 20/10 : « utilise le fuseau UTC, pour
    que le mois ne dépende pas du lieu de lecture ». La raison tenait, mais
    l'histogramme était alors seul de son avis — la liste, le libellé et
    les années comptaient en heure locale, et une même sortie changeait de
    mois d'un écran à l'autre (#565). Tranché pour l'heure locale partout ;
    le cas qui reste, lire ses sorties depuis un autre fuseau que celui où
    on les a faites, déplace désormais tous les écrans ensemble.
  */
  it('compte le mois en heure locale, comme le reste de l’application', () => {
    const env = (
      globalThis as unknown as {
        process: { env: Record<string, string | undefined> }
      }
    ).process.env
    const avant = env.TZ
    try {
      // 23 h 30 le 31 janvier en UTC, 0 h 30 le 1ᵉʳ février à Paris.
      env.TZ = 'Europe/Paris'
      const buckets = monthlyBuckets([track('a', '2026-01-31T23:30:00Z', 1000)])
      expect(buckets[0]!.month).toBe('2026-02')
    } finally {
      if (avant === undefined) delete env.TZ
      else env.TZ = avant
    }
  })

  it('retourne une liste vide sans sortie datée', () => {
    expect(monthlyBuckets([])).toEqual([])
    expect(monthlyBuckets([track('a', null, 1000)])).toEqual([])
  })
})

describe('cumulativeDistances', () => {
  it('accumule les distances mois après mois', () => {
    const buckets = monthlyBuckets([
      track('a', '2026-01-10T08:00:00Z', 5000),
      track('b', '2026-02-10T08:00:00Z', 5000),
    ])
    const cumul = cumulativeDistances(buckets)
    expect(cumul).toHaveLength(2)
    expect(cumul[1]).toBeCloseTo(
      buckets[0]!.distanceMeters + buckets[1]!.distanceMeters,
      5,
    )
  })

  it('gère une liste vide', () => {
    expect(cumulativeDistances([])).toEqual([])
  })
})

describe('monthLabel', () => {
  it('affiche un mois lisible en français', () => {
    const label = monthLabel('2026-08')
    expect(label).toMatch(/2026/)
    expect(label.toLowerCase()).toMatch(/ao/)
  })

  it('retourne la valeur brute si elle est inattendue', () => {
    expect(monthLabel('n’importe quoi')).toBe('n’importe quoi')
  })
})

describe('reperesHistogramme', () => {
  // Retour de Cédric, 04/09 : « j'ai une barre rouge qui apparaît, je ne
  // sais pas ce que ça veut dire ». Le seul texte qui l'expliquait était un
  // aria-label, qui n'est pas peint. Ce que la légende visible doit dire se
  // calcule ici, hors du navigateur, et s'éprouve sans lui.
  const bucket = (month: string, distanceMeters: number, count = 1) => ({
    month,
    count,
    distanceMeters,
    elevationGain: 0,
  })

  it('désigne le mois le plus haut, et sa distance', () => {
    const reperes = reperesHistogramme([
      bucket('2026-06', 12_000),
      bucket('2026-07', 41_500),
      bucket('2026-08', 8_000),
    ])
    expect(reperes.moisLePlusHaut).toBe('2026-07')
    expect(reperes.metresLePlusHaut).toBe(41_500)
    expect(reperes.moisRenseignes).toBe(3)
  })

  it('ignore les mois creux, qui sont là pour montrer l’interruption', () => {
    const reperes = reperesHistogramme([
      bucket('2026-06', 12_000),
      bucket('2026-07', 0, 0),
      bucket('2026-08', 8_000),
    ])
    expect(reperes.moisLePlusHaut).toBe('2026-06')
    expect(reperes.moisRenseignes).toBe(2)
  })

  // Le cas de tout nouvel arrivant, et le moins lisible aujourd'hui : une
  // barre, un mois écrit, rien qui relie les deux.
  it('tient le cas d’un seul mois', () => {
    const reperes = reperesHistogramme([bucket('2026-09', 5_400)])
    expect(reperes.moisLePlusHaut).toBe('2026-09')
    expect(reperes.metresLePlusHaut).toBe(5_400)
    expect(reperes.moisRenseignes).toBe(1)
  })

  it('désigne un seul mois même si sa distance est nulle', () => {
    /*
      Trouvé par mutation du 17/10 : `moisLePlusHaut === null` retiré de la
      condition (ne laissant que « distance strictement plus grande que le
      maximum courant ») survivait parce que le maximum courant démarre à
      0 et qu'aucun test n'avait de mois avec sortie (count > 0) mais une
      distance nulle — un relevé GPS à un seul point, par exemple.
    */
    const reperes = reperesHistogramme([bucket('2026-09', 0, 1)])
    expect(reperes.moisLePlusHaut).toBe('2026-09')
    expect(reperes.metresLePlusHaut).toBe(0)
    expect(reperes.moisRenseignes).toBe(1)
  })

  it('garde le premier mois en cas d’égalité, pas le dernier', () => {
    /*
      Trouvé par une relecture du 18/10 : `>` remplacé par `>=` ne changeait
      jamais `moisLePlusHaut` tant qu'aucun test ne mettait deux mois à
      strictement la même distance — les deux désignent alors un mois
      différent, puisque `moisLePlusHaut` porte l'identité du mois, pas
      seulement sa distance.
    */
    const reperes = reperesHistogramme([
      bucket('2026-06', 20_000),
      bucket('2026-07', 20_000),
    ])
    expect(reperes.moisLePlusHaut).toBe('2026-06')
  })

  it('ne désigne rien quand il n’y a rien à désigner', () => {
    expect(reperesHistogramme([])).toEqual({
      moisLePlusHaut: null,
      metresLePlusHaut: 0,
      moisRenseignes: 0,
    })
    expect(reperesHistogramme([bucket('2026-09', 0, 0)]).moisLePlusHaut).toBe(
      null,
    )
  })
})
