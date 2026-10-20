import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Track } from '../../src/core/types.ts'

/**
 * Issue #565 — une sortie autour de minuit changeait de jour, de mois ou
 * d'année selon l'écran : l'histogramme, la carte de bilan et le `max` de
 * « Déclarer parcouru » comptaient en UTC, le libellé, la liste et
 * l'historique en heure locale.
 *
 * Choix (§2, présentation) : **l'heure locale partout.** Une sortie faite
 * le 1ᵉʳ septembre à 7 h à Nouméa a été faite le 1ᵉʳ septembre.
 *
 * Le fuseau est forcé par le test : sur une machine de CI réglée en UTC, un
 * test qui suivrait le fuseau de la machine passerait avec ou sans le
 * correctif — il n'y aurait rien à départager.
 */
const env = (
  globalThis as unknown as { process: { env: Record<string, string | undefined> } }
).process.env
const fuseauDOrigine = env.TZ

/**
 * Les modules, rechargés **après** avoir posé le fuseau : `outing.ts` crée
 * son `Intl.DateTimeFormat` au chargement, avec le fuseau du moment. Un
 * navigateur ne change pas de fuseau en cours de route ; un test, si.
 */
async function dansLeFuseau(fuseau: string) {
  env.TZ = fuseau
  vi.resetModules()
  const [history, outing, summary, historique, valeurLue] = await Promise.all([
    import('../../src/core/history.ts'),
    import('../../src/core/outing.ts'),
    import('../../src/core/summary.ts'),
    import('../../src/core/historique.ts'),
    import('../../src/core/valeurLue.ts'),
  ])
  return { ...history, ...outing, ...summary, ...historique, ...valeurLue }
}

afterEach(() => {
  if (fuseauDOrigine === undefined) delete env.TZ
  else env.TZ = fuseauDOrigine
})

function trace(date: string): Track {
  return {
    id: date,
    filename: 'sortie.gpx',
    points: [
      [4.5, 45.4],
      [4.501, 45.4],
    ],
    date,
    importedAt: date,
  }
}

describe('à Nouméa, une sortie du 1ᵉʳ septembre à 7 h', () => {
  // 2026-08-31T20:00Z = 1ᵉʳ septembre, 7 h, heure de Nouméa (UTC+11).
  const date = '2026-08-31T20:00:00Z'

  it('est en septembre pour tous les écrans', async () => {
    const { outingLabel, dateAffichee, monthlyBuckets } =
      await dansLeFuseau('Pacific/Noumea')
    expect(outingLabel(trace(date))).toBe('Le 1 septembre 2026')
    expect(dateAffichee(date)).toBe('01/09/2026')
    expect(monthlyBuckets([trace(date)]).map((b) => b.month)).toEqual([
      '2026-09',
    ])
  })

  it('un « aujourd’hui » à 7 h du matin est bien aujourd’hui', async () => {
    const { jourLocal } = await dansLeFuseau('Pacific/Noumea')
    expect(jourLocal(Date.parse(date))).toBe('2026-09-01')
  })
})

describe('à Paris, une sortie du 31 décembre à 23 h 30 UTC', () => {
  // 2025-12-31T23:30Z = 1ᵉʳ janvier 2026, 0 h 30, heure de Paris.
  const date = '2025-12-31T23:30:00Z'

  it('est en 2026 pour tous les écrans', async () => {
    const { outingLabel, monthlyBuckets, preparerHistorique, summaryFilename } =
      await dansLeFuseau('Europe/Paris')
    expect(outingLabel(trace(date))).toBe('Le 1 janvier 2026')
    expect(monthlyBuckets([trace(date)]).map((b) => b.month)).toEqual([
      '2026-01',
    ])
    expect(preparerHistorique([trace(date)])[0]?.annee).toBe(2026)
    expect(summaryFilename(date)).toBe('bilan-sentiers-2026-01-01.png')
  })
})

describe('jourLocal et moisLocal', () => {
  it('suivent le fuseau, pas UTC', async () => {
    const { moisLocal, jourLocal } = await dansLeFuseau('Pacific/Noumea')
    expect(moisLocal('2026-08-31T20:00:00Z')).toBe('2026-09')
    env.TZ = 'America/Los_Angeles'
    expect(moisLocal('2026-09-01T03:00:00Z')).toBe('2026-08')
    expect(jourLocal(Date.parse('2026-09-01T03:00:00Z'))).toBe('2026-08-31')
  })

  it('ne lisent rien dans une date illisible', async () => {
    const { moisLocal } = await dansLeFuseau('UTC')
    expect(moisLocal('pas une date')).toBeNull()
    expect(moisLocal(null)).toBeNull()
  })
})

/*
  Revue du 20/10 : une date sans heure, « AAAA-MM-JJ » — celle que range
  « Déclarer parcouru » —, était lue par `Date.parse` comme minuit **UTC**.
  Formatée en heure locale à l'ouest de Greenwich, elle tombait la veille :
  choisir le 15 en Guadeloupe, lire le 14.
*/
describe('une date sans heure est un jour, pas un instant UTC', () => {
  it('reste le même jour à l’ouest de Greenwich', async () => {
    const { dateAffichee, moisLocal } = await dansLeFuseau('America/Guadeloupe')
    expect(dateAffichee('2026-06-15')).toBe('15/06/2026')
    expect(moisLocal('2026-06-01')).toBe('2026-06')
  })

  it('et à l’est aussi', async () => {
    const { dateAffichee } = await dansLeFuseau('Pacific/Noumea')
    expect(dateAffichee('2026-06-15')).toBe('15/06/2026')
  })

  it('le nom du fichier de sauvegarde suit le jour local, comme le bilan', async () => {
    env.TZ = 'America/Guadeloupe'
    vi.resetModules()
    const { backupFilename } = await import('../../src/core/backup.ts')
    const { summaryFilename } = await import('../../src/core/summary.ts')
    // 16/06 à 2 h UTC = 15/06 au soir en Guadeloupe.
    expect(backupFilename('2026-06-16T02:00:00Z')).toBe(
      'sauvegarde-sentiers-2026-06-15.json.gz',
    )
    expect(summaryFilename('2026-06-16T02:00:00Z')).toBe(
      'bilan-sentiers-2026-06-15.png',
    )
  })
})
