import { describe, it, expect } from 'vitest'
import { creerCompteurDeRepli } from '../../src/lib/compteurDeRepli.ts'

/**
 * Issue #569, point 1 — le repli IGN → OSM était irréversible et
 * **cumulatif** : trois échecs de tuiles dans toute la session, même à une
 * heure d'écart, basculaient sur OSM jusqu'au rechargement. Tranché par
 * Cédric le 20/10 : trois échecs **consécutifs** — une tuile reçue remet le
 * compte à zéro —, et pas de retour automatique à l'IGN.
 */
describe('le compteur de repli', () => {
  it('replie au troisième échec consécutif', () => {
    const compteur = creerCompteurDeRepli(3)
    expect(compteur.echec()).toBe(false)
    expect(compteur.echec()).toBe(false)
    expect(compteur.echec()).toBe(true)
  })

  it('une tuile reçue remet le compte à zéro', () => {
    const compteur = creerCompteurDeRepli(3)
    compteur.echec()
    compteur.echec()
    compteur.succes()
    expect(compteur.echec()).toBe(false)
    expect(compteur.echec()).toBe(false)
    expect(compteur.echec()).toBe(true)
  })

  it('ne replie qu’une fois', () => {
    const compteur = creerCompteurDeRepli(3)
    compteur.echec()
    compteur.echec()
    expect(compteur.echec()).toBe(true)
    expect(compteur.echec()).toBe(false)
    compteur.succes()
    compteur.echec()
    compteur.echec()
    expect(compteur.echec()).toBe(false)
  })
})
