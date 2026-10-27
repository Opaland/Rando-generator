import { describe, it, expect } from 'vitest'
import { couvertureDuStatut, sonderLeFond, tuileTemoin } from '../../src/core/couvertureDuFond.ts'

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

describe('tuileTemoin', () => {
  it('est la tuile qui contient le départ, au zoom le plus bas emporté', () => {
    /*
      Relecture adverse du 27/10 : la première tuile du corridor était sa
      voisine nord-ouest — la marge d'une tuile autour du point. Le témoin
      est maintenant la tuile du départ lui-même : Lyon, z12, ligne 1461,
      colonne 2103 — la voisine nord-ouest serait 1460 / 2102.
      Le zoom le plus bas parce qu'un 404 y veut dire « rien du tout » ; une
      couverture qui s'arrête plus haut (Hendaye : 200 à z12, 404 à z16)
      reste proposée, et ses tuiles manquantes se comptent en échecs.
    */
    const url = tuileTemoin([[4.835, 45.764]])
    expect(url).toContain('TILEMATRIX=12&')
    expect(url).toContain('TILEROW=1461&')
    expect(url).toContain('TILECOL=2103')
  })

  it('ne propose rien pour une trace vide', () => {
    expect(tuileTemoin([])).toBeNull()
  })
})

describe('sonderLeFond', () => {
  it('rend le verdict du statut de la tuile témoin', async () => {
    const vues: string[] = []
    const recuperer = (url: string) => {
      vues.push(url)
      return Promise.resolve({ status: 404 })
    }
    expect(await sonderLeFond('https://t/1', recuperer)).toBe('absent')
    expect(vues).toEqual(['https://t/1'])
  })

  it('ne dit rien quand la requête échoue', async () => {
    const recuperer = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await sonderLeFond('https://t/1', recuperer)).toBe('inconnu')
  })

  it('ne sonde rien sans témoin', async () => {
    let appels = 0
    const recuperer = () => {
      appels += 1
      return Promise.resolve({ status: 200 })
    }
    expect(await sonderLeFond(null, recuperer)).toBe('inconnu')
    expect(appels).toBe(0)
  })
})
