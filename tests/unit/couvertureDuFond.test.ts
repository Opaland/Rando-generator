import { describe, it, expect } from 'vitest'
import { couvertureDuStatut, sonderLeFond } from '../../src/core/couvertureDuFond.ts'

/**
 * Issue #593 — en Nouvelle-Calédonie, le plan IGN rend 404 dès le zoom 8
 * (mesuré le 22/10, revérifié le 27/10 : 200 à Lyon, 404 près de Nouméa au
 * zoom 10), et « Emporter » proposait d'y télécharger des tuiles qui
 * n'existent pas.
 *
 * Tranché par Cédric le 27/10 : le dire, et ne pas emporter. La couverture
 * se **mesure** sur une tuile témoin plutôt que de s'écrire en dur : une
 * liste de territoires couverts serait un nombre inventé, et elle vieillirait
 * en silence quand l'IGN étend son plan.
 */
describe('couvertureDuStatut', () => {
  it('un 404 dit que le plan ne couvre pas la zone', () => {
    expect(couvertureDuStatut(404)).toBe('absent')
  })

  it('une tuile servie dit qu’il couvre', () => {
    expect(couvertureDuStatut(200)).toBe('couvert')
  })

  it('une panne ne dit rien : on ne sait pas', () => {
    // Hors réseau — le cas ordinaire en randonnée —, ou un serveur en
    // erreur : retirer « Emporter » sur une panne priverait de la carte
    // hors ligne justement quand on la prépare.
    expect(couvertureDuStatut(null)).toBe('inconnu')
    expect(couvertureDuStatut(500)).toBe('inconnu')
    expect(couvertureDuStatut(503)).toBe('inconnu')
    expect(couvertureDuStatut(403)).toBe('inconnu')
  })
})

describe('sonderLeFond', () => {
  it('rend le verdict du statut de la tuile témoin', async () => {
    const vues: string[] = []
    const recuperer = (url: string) => {
      vues.push(url)
      return Promise.resolve({ status: 404 })
    }
    expect(await sonderLeFond(['https://t/1', 'https://t/2'], recuperer)).toBe('absent')
    expect(vues).toEqual(['https://t/1'])
  })

  it('ne dit rien quand la requête échoue', async () => {
    const recuperer = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await sonderLeFond(['https://t/1'], recuperer)).toBe('inconnu')
  })

  it('ne sonde rien sans tuile', async () => {
    let appels = 0
    const recuperer = () => {
      appels += 1
      return Promise.resolve({ status: 200 })
    }
    expect(await sonderLeFond([], recuperer)).toBe('inconnu')
    expect(appels).toBe(0)
  })
})
