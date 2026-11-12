import { describe, it, expect } from 'vitest'
import { OUTILS_DE_QUESTIONS, executerOutil } from '../../src/core/outilsDeQuestions.ts'
import type { CompletionResult, Itinerary, LonLat, Track } from '../../src/core/types.ts'

/**
 * Issue #673, troisième usage — les questions sur ses sorties. Claude ne
 * reçoit jamais les sorties : il appelle ces fonctions, qui calculent ici et
 * ne rendent que des totaux. Ces tests disent ce que chacune rend, et ce
 * qu'aucune ne rend jamais : coordonnées, noms de fichiers, jours, noms
 * d'itinéraires personnels.
 */
function trace(id: string, date: string | null, centiemes: number, d: number | null = null): Track {
  const points: LonLat[] = Array.from({ length: centiemes + 1 }, (_, i) => [i * 0.01, 0])
  return { id, filename: `chez-mamie-${id}.gpx`, points, date, importedAt: '2026-11-12T08:00:00Z', elevationGain: d }
}

const donnees = {
  tracks: [
    trace('a', '2026-06-02T09:00:00Z', 10, 400),
    trace('b', '2026-06-20T09:00:00Z', 20, 900),
    trace('c', '2026-09-05T09:00:00Z', 5),
    trace('d', '2025-08-01T09:00:00Z', 30, 1200),
    trace('e', null, 2),
  ],
  resultats: [
    { itineraryId: 1, doneMeters: 8_456, totalMeters: 120_000, pct: 7.05, computedAt: '' },
    { itineraryId: 2, doneMeters: 3_000, totalMeters: 5_000, pct: 60, computedAt: '' },
  ] as CompletionResult[],
  itineraires: [
    { osmRelationId: 1, name: 'GR 7', ref: 'GR 7', network: 'GR' },
    { osmRelationId: 2, name: 'Boucle de la cabane de Mamie', ref: null, network: 'PERSO' },
  ] as unknown as Itinerary[],
}

const appel = (nom: string, entree: unknown = {}) => executerOutil(nom, entree, donnees)

describe('les outils déclarés', () => {
  it('ont chacun un nom, une description et un schéma strict', () => {
    for (const outil of OUTILS_DE_QUESTIONS) {
      expect(outil.name).toMatch(/^[a-z_]+$/)
      expect(outil.description.length).toBeGreaterThan(20)
      expect(outil.input_schema.additionalProperties).toBe(false)
      expect(outil.strict).toBe(true)
    }
  })
})

describe('executerOutil', () => {
  it('annees : chaque année, et les sorties sans date à part', () => {
    expect(appel('annees')).toEqual({
      annees: [
        { annee: 2026, sorties: 3, km: expect.closeTo(38.9, 1) as number, deniveleM: 1300 },
        { annee: 2025, sorties: 1, km: expect.closeTo(33.4, 1) as number, deniveleM: 1200 },
      ],
      sortiesSansDate: 1,
    })
  })

  it('totaux : filtrés par année et par mois', () => {
    expect(appel('totaux', { annee: 2026, mois: 6 })).toEqual({
      sorties: 2,
      km: expect.closeTo(33.4, 1) as number,
      deniveleM: 1300,
    })
    // Aucune altitude : pas de zéro présenté comme une mesure (§2).
    expect(appel('totaux', { annee: 2026, mois: 9 })).toMatchObject({ sorties: 1, deniveleM: null })
  })

  it('par_mois : en toutes lettres, les mois vides compris', () => {
    const mois = appel('par_mois', { annee: 2026 }) as { mois: string; sorties: number }[]
    expect(mois.map((m) => m.mois)).toEqual(['juin', 'juillet', 'août', 'septembre'])
    expect(mois.map((m) => m.sorties)).toEqual([2, 0, 0, 1])
  })

  it('plus_longues : au plus cinq, sans nom ni jour', () => {
    expect(appel('plus_longues', { nombre: 2 })).toEqual([
      { mois: 'août 2025', km: expect.closeTo(33.4, 1) as number, deniveleM: 1200 },
      { mois: 'juin 2026', km: expect.closeTo(22.2, 1) as number, deniveleM: 900 },
    ])
    // Le plafond de cinq tient même quand on en demande cinquante.
    const sept = Array.from({ length: 7 }, (_, i) => trace(`s${String(i)}`, '2026-05-01T09:00:00Z', 3 + i))
    expect(
      (executerOutil('plus_longues', { nombre: 50 }, { ...donnees, tracks: sept }) as unknown[]).length,
    ).toBe(5)
  })

  it('itineraires : les publics seulement, avec leur avancement', () => {
    expect(appel('itineraires')).toEqual([
      { nom: 'GR 7', pct: 7.1, kmFaits: 8.5, kmTotal: 120 },
    ])
  })

  /*
    Relecture adverse du 12/11 : une erreur qui portait « entre 1900 et
    2100 » permettait au texte d'écrire « 1900 sorties » — ses nombres
    entraient dans les faits. Une erreur ne porte donc aucun chiffre.
  */
  it('rend des erreurs sans aucun chiffre', () => {
    const erreurs = [
      appel('totaux', { annee: '2026' }),
      appel('totaux', { annee: 1e308 }),
      appel('plus_longues', { nombre: -3 }),
      appel('par_mois', {}),
      appel('outil-42'),
    ]
    for (const e of erreurs) expect(JSON.stringify(e)).not.toMatch(/\d/)
  })

  it('refuse un mois sans année, au lieu d’additionner tous les mars', () => {
    expect(appel('totaux', { mois: 3 })).toEqual({ erreur: expect.any(String) as string })
  })

  it('dit qu’une mesure manque au lieu de rendre une liste vide', () => {
    // [] se lirait « aucun » ; l'avancement non calculé, ou des zones pas
    // encore chargées, sont une absence de mesure.
    expect(executerOutil('itineraires', {}, { ...donnees, resultats: null })).toEqual({
      erreur: expect.any(String) as string,
    })
    expect(executerOutil('par_zone', {}, { ...donnees, contours: null })).toEqual({
      erreur: expect.any(String) as string,
    })
  })

  it('refuse une entrée fausse ou un outil inconnu sans lever', () => {
    expect(appel('totaux', { annee: '2026' })).toEqual({ erreur: expect.any(String) as string })
    expect(appel('totaux', { mois: 13 })).toEqual({ erreur: expect.any(String) as string })
    expect(appel('inconnu')).toEqual({ erreur: expect.any(String) as string })
    expect(appel('toString')).toEqual({ erreur: expect.any(String) as string })
  })

  it('ne rend jamais une coordonnée, un nom de fichier, un jour ni un itinéraire personnel', () => {
    const tout = JSON.stringify(
      OUTILS_DE_QUESTIONS.map((o) => appel(o.name, o.name === 'par_mois' ? { annee: 2026 } : {})),
    )
    expect(tout).not.toMatch(/chez-mamie|\.gpx|Mamie|cabane/)
    expect(tout).not.toMatch(/2026-0\d-\d\d|T09/)
    expect(tout).not.toMatch(/\[\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*\]/)
  })
})
