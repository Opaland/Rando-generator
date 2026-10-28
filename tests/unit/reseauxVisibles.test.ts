import { describe, it, expect, beforeEach } from 'vitest'
import { useReseauxVisibles } from '../../src/store/reseauxVisibles.ts'
import { reseauxVisiblesParDefaut } from '../../src/core/lisibilite.ts'
import { RESEAUX_FILTRABLES } from '../../src/core/reseaux.ts'

/**
 * L'état partagé par la liste et la carte (#322).
 *
 * Un `useState` dans la liste aurait suffi tant que tout était affiché : les
 * deux surfaces ne pouvaient pas se contredire. Dès qu'un réseau est replié,
 * elles le peuvent — et une ligne rendue à la liste sans l'être à la carte
 * est un itinéraire cliquable dont le tracé n'apparaît nulle part.
 */

beforeEach(() => {
  useReseauxVisibles.setState({ reseauxVisibles: reseauxVisiblesParDefaut() })
})

describe('au premier écran', () => {
  it('les grands itinéraires sont repliés', () => {
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('GR')
    // Et l'international avec eux (#335) : la Via Lugdunum, 153 km, est le
    // cas mesuré qui a motivé le repli — et le seul à lui échapper jusqu'ici.
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain(
      'INTERNATIONAL',
    )
  })

  it('et tout le reste est là', () => {
    expect(useReseauxVisibles.getState().reseauxVisibles).toEqual([
      'GRP',
      'PR',
      'LOCAL',
      'INCONNU',
    ])
  })
})

describe('basculerReseau', () => {
  it('rend un réseau replié', () => {
    useReseauxVisibles.getState().basculerReseau('GR')
    expect(useReseauxVisibles.getState().reseauxVisibles).toContain('GR')
  })

  it('replie un réseau montré', () => {
    useReseauxVisibles.getState().basculerReseau('PR')
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('PR')
  })

  /**
   * Le cas qui justifie de reconstruire depuis la charte plutôt que
   * d'ajouter en queue.
   *
   * Sans cela, un réseau rendu après avoir été replié se retrouve en dernier,
   * et les cases à cocher changent d'ordre sous le doigt de quelqu'un qui
   * vient d'en cliquer une. C'est le genre de défaut qu'on ne remarque qu'en
   * le vivant, et qu'aucune assertion ne cherche si on ne l'écrit pas.
   */
  it('remet le réseau à sa place dans la charte, pas en queue', () => {
    useReseauxVisibles.getState().basculerReseau('GR')
    expect(useReseauxVisibles.getState().reseauxVisibles).toEqual([
      'GR',
      'GRP',
      'PR',
      'LOCAL',
      'INCONNU',
    ])
  })

  it('deux bascules ramènent à l’état de départ', () => {
    const avant = useReseauxVisibles.getState().reseauxVisibles
    useReseauxVisibles.getState().basculerReseau('GR')
    useReseauxVisibles.getState().basculerReseau('GR')
    expect(useReseauxVisibles.getState().reseauxVisibles).toEqual(avant)
  })
})

describe('afficherTousLesReseaux', () => {
  it('rend tout ce qui était replié', () => {
    useReseauxVisibles.getState().basculerReseau('PR')
    useReseauxVisibles.getState().afficherTousLesReseaux()
    expect(useReseauxVisibles.getState().reseauxVisibles).toEqual([
      ...RESEAUX_FILTRABLES,
    ])
  })

  it('n’ajoute pas les persos', () => {
    useReseauxVisibles.getState().afficherTousLesReseaux()
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('PERSO')
  })
})

/**
 * #594, volet 2 : chaque zone repart de son propre défaut — l'unique GR
 * d'une zone y est montré —, une fois, à son arrivée ; un choix fait ensuite
 * dans la même zone n'est pas défait par un rechargement de ses itinéraires.
 */
describe('adapterALaZone', () => {
  const nc1 = [
    { network: 'GR' as const, ref: 'GR NC1', osmRelationId: 1 },
    { network: 'INCONNU' as const, ref: null, osmRelationId: 2 },
  ]

  beforeEach(() => {
    useReseauxVisibles.setState({ zoneAdaptee: null })
  })

  it('montre l’unique GR d’une zone qui arrive', () => {
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', nc1)
    expect(useReseauxVisibles.getState().reseauxVisibles).toContain('GR')
  })

  it('ne défait pas un choix fait dans la même zone', () => {
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', nc1)
    useReseauxVisibles.getState().basculerReseau('GR')
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('GR')

    // Les itinéraires de la même zone se relisent (boucles locales, cache) :
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', nc1)
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('GR')
  })

  it('repart du défaut de la zone suivante', () => {
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', nc1)
    const troisGr = [1, 2, 3].map((i) => ({
      network: 'GR' as const,
      ref: `GR ${String(i)}`,
      osmRelationId: i,
    }))
    useReseauxVisibles.getState().adapterALaZone('isere', troisGr)
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('GR')
  })

  it('attend que la zone ait des itinéraires', () => {
    // Au démarrage, la clé est restaurée avant ses itinéraires : adapter sur
    // une liste vide figerait le défaut général pour toute la zone.
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', [])
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', nc1)
    expect(useReseauxVisibles.getState().reseauxVisibles).toContain('GR')
  })
})
