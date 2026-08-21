import { describe, it, expect } from 'vitest'
import {
  FIT_EPOCH_SECONDS,
  FitError,
  looksLikeFit,
  parseFit,
} from '../../src/core/fit.ts'
import { buildFit, notAFit } from '../fixtures/fit.ts'

describe('looksLikeFit', () => {
  it('reconnaît un fichier FIT à sa signature', () => {
    expect(looksLikeFit(buildFit([]))).toBe(true)
  })

  it('ne se laisse pas prendre par un fichier texte', () => {
    expect(looksLikeFit(notAFit())).toBe(false)
    expect(looksLikeFit(new ArrayBuffer(4))).toBe(false)
  })
})

describe('parseFit', () => {
  it('lit les points, les altitudes et la date de départ', () => {
    const fit = parseFit(
      buildFit([
        { timestamp: 1_000_000, lat: 45.4, lon: 4.5, altitude: 812 },
        { timestamp: 1_000_010, lat: 45.401, lon: 4.501, altitude: 825 },
      ]),
    )
    expect(fit.points).toHaveLength(2)
    expect(fit.points[0]?.[0]).toBeCloseTo(4.5, 5)
    expect(fit.points[0]?.[1]).toBeCloseTo(45.4, 5)
    expect(fit.elevations[0]).toBeCloseTo(812, 1)
    expect(fit.date).toBe(
      new Date((1_000_000 + FIT_EPOCH_SECONDS) * 1_000).toISOString(),
    )
  })

  it('lit aussi les fichiers écrits en gros-boutien', () => {
    // L'architecture est déclarée par message : les deux existent en vrai.
    const fit = parseFit(
      buildFit([{ timestamp: 42, lat: 45.4, lon: 4.5 }], { bigEndian: true }),
    )
    expect(fit.points[0]?.[1]).toBeCloseTo(45.4, 5)
  })

  it('écarte les enregistrements sans position', () => {
    // Les premières secondes d'une sortie, avant le fix GPS : la montre
    // enregistre quand même, avec une position sentinelle.
    const fit = parseFit(
      buildFit([
        { timestamp: 1 },
        { timestamp: 2, lat: 45.4, lon: 4.5 },
        { timestamp: 3, lat: 0, lon: 0 },
      ]),
    )
    expect(fit.points).toHaveLength(1)
    // La date reste celle du premier enregistrement horodaté, même sans fix.
    expect(fit.date).toBe(
      new Date((1 + FIT_EPOCH_SECONDS) * 1_000).toISOString(),
    )
  })

  it('note l’absence d’altitude plutôt que d’inventer un zéro', () => {
    const fit = parseFit(buildFit([{ timestamp: 1, lat: 45.4, lon: 4.5 }]))
    expect(fit.points).toHaveLength(1)
    expect(fit.elevations[0]).toBeNull()
  })

  it('traverse les messages qui ne l’intéressent pas', () => {
    const fit = parseFit(
      buildFit([{ timestamp: 5, lat: 45.4, lon: 4.5 }], {
        withOtherMessage: true,
      }),
    )
    expect(fit.points).toHaveLength(1)
  })

  it('saute les champs développeur sans se désynchroniser', () => {
    // Un champ développeur non sauté décalerait tous les enregistrements
    // suivants, et les points partiraient n'importe où.
    const fit = parseFit(
      buildFit(
        [
          { timestamp: 1, lat: 45.4, lon: 4.5 },
          { timestamp: 2, lat: 45.41, lon: 4.51 },
          { timestamp: 3, lat: 45.42, lon: 4.52 },
        ],
        { developerField: true },
      ),
    )
    expect(fit.points).toHaveLength(3)
    expect(fit.points[2]?.[1]).toBeCloseTo(45.42, 5)
  })

  it('refuse un fichier qui n’est pas un FIT', () => {
    expect(() => parseFit(notAFit())).toThrow(FitError)
    expect(() => parseFit(notAFit())).toThrow(/n’est pas un FIT/)
  })

  it('refuse un fichier tronqué au lieu d’en lire la moitié', () => {
    expect(() => parseFit(buildFit([{ lat: 45.4, lon: 4.5 }], { truncate: true })))
      .toThrow(/incomplet/)
  })

  it('accepte un fichier sans le moindre enregistrement', () => {
    const fit = parseFit(buildFit([]))
    expect(fit.points).toEqual([])
    expect(fit.date).toBeNull()
  })
})

describe('parseFit — bornes WGS84 (issue #167)', () => {
  it('compte les positions hors bornes au lieu de les écarter en silence', () => {
    // Les semicircles couvrent ±180° sur les deux axes : une latitude de
    // 120° est représentable, et n'a aucun sens.
    const fit = parseFit(
      buildFit([
        { timestamp: 1, lat: 45.4, lon: 4.5 },
        { timestamp: 2, lat: 120, lon: 4.5 },
      ]),
    )
    expect(fit.points).toHaveLength(1)
    expect(fit.pointsHorsLimites).toBe(1)
  })

  it('ne compte pas la position sentinelle d’un enregistrement sans fix', () => {
    // 0/0 est dans les bornes et attendu au démarrage d'une montre : le
    // signaler à l'utilisateur serait du bruit, pas une information.
    const fit = parseFit(
      buildFit([
        { timestamp: 1 },
        { timestamp: 2, lat: 0, lon: 0 },
        { timestamp: 3, lat: 45.4, lon: 4.5 },
      ]),
    )
    expect(fit.points).toHaveLength(1)
    expect(fit.pointsHorsLimites).toBe(0)
  })
})
