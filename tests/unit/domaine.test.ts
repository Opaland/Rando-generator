import { describe, it, expect } from 'vitest'
import {
  traverseAntimeridien,
  verifierDomaine,
  MESSAGE_ANTIMERIDIEN,
} from '../../src/core/domaine.ts'
import { distanceMeters } from '../../src/core/geo.ts'
import type { LonLat } from '../../src/core/types.ts'

/**
 * Issue #170 — le domaine où ce calcul est juste.
 *
 * `distanceMeters` projette en équirectangulaire et soustrait les longitudes
 * sans tenir compte de l'enroulement. **Mesuré ici** : un segment de 212 m à
 * cheval sur ±180°, à 17° de latitude sud, est calculé à 38 280 833 m. La
 * longueur totale, le pourcentage et le cadrage deviennent absurdes.
 *
 * L'issue tranche entre corriger la projection — un chantier réel, à ne pas
 * ouvrir sans besoin — et **borner explicitement**, pour que la limite soit
 * une décision assumée au lieu d'un angle mort. C'est la seconde voie.
 *
 * La borne posée n'est pas « la France » : ce serait une frontière politique
 * pour un défaut mathématique, et elle refuserait La Réunion, les Antilles ou
 * la Guyane, où ce calcul est parfaitement sain. La borne est le **domaine de
 * validité** — franchir ±180°, et rien d'autre.
 */

const A: LonLat = [179.999, -17]
const B: LonLat = [-179.999, -17]

describe('le défaut qu’on borne', () => {
  it('mesure encore 38 000 km pour 212 m — c’est bien lui qu’on refuse', () => {
    expect(distanceMeters(A, B)).toBeGreaterThan(1_000_000)
  })
})

describe('traverseAntimeridien', () => {
  it('voit le saut de ±180°', () => {
    expect(traverseAntimeridien([A, B])).toBe(true)
  })

  it('le voit dans les deux sens', () => {
    expect(traverseAntimeridien([B, A])).toBe(true)
  })

  it('ne le voit pas là où il n’est pas', () => {
    expect(
      traverseAntimeridien([
        [4.5, 45.4],
        [4.6, 45.5],
      ]),
    ).toBe(false)
  })

  /**
   * Le piège de la borne trop large : un tracé qui **longe** l'antiméridien
   * sans le franchir se calcule juste. Le refuser priverait sans raison —
   * Wallis-et-Futuna est à 176° ouest.
   */
  it('accepte un tracé qui longe l’antiméridien sans le franchir', () => {
    expect(
      traverseAntimeridien([
        [179.9, -13.3],
        [179.95, -13.31],
      ]),
    ).toBe(false)
  })

  /** Un grand pas d'est en ouest sans franchir : deux points aux antipodes. */
  it('ne se laisse pas prendre à un tracé très large mais continu', () => {
    expect(
      traverseAntimeridien([
        [-50, 10],
        [50, 10],
      ]),
    ).toBe(false)
  })

  it('ne dit rien d’un tracé vide ou d’un point seul', () => {
    expect(traverseAntimeridien([])).toBe(false)
    expect(traverseAntimeridien([A])).toBe(false)
  })
})

describe('verifierDomaine', () => {
  it('laisse passer ce qui se calcule juste', () => {
    expect(
      verifierDomaine([
        [4.5, 45.4],
        [4.6, 45.5],
      ]),
    ).toBeNull()
  })

  /**
   * Le refus **dit pourquoi**, et ne se contente pas d'un « fichier
   * invalide » : le fichier ne l'est pas, c'est Sentiers qui ne sait pas le
   * mesurer.
   */
  it('refuse en expliquant, et sans accuser le fichier', () => {
    expect(verifierDomaine([A, B])).toBe(MESSAGE_ANTIMERIDIEN)
    expect(MESSAGE_ANTIMERIDIEN).toMatch(/180/)
    expect(MESSAGE_ANTIMERIDIEN).not.toMatch(/invalide|corrompu|erreur/i)
  })
})
