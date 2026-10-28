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
    useReseauxVisibles.setState({ zoneAdaptee: null, signatureAdaptee: null, choixDansLaZone: false })
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
    // Une zone vide (Overpass n'a rien rendu) ne fige rien : quand ses
    // itinéraires arrivent, le défaut de la zone se pose. (Relecture du
    // 27/10 : `setItineraries` pose clé et itinéraires ensemble, ce n'est
    // donc pas le démarrage qui produit ce cas.)
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', [])
    useReseauxVisibles.getState().adapterALaZone('nouvelle-caledonie', nc1)
    expect(useReseauxVisibles.getState().reseauxVisibles).toContain('GR')
  })

  /*
    Trouvés par la relecture adverse du 27/10 : poser le défaut « une fois
    par clé » dépendait de l'ordre d'arrivée, et la clé seule ne dit pas si
    la zone a changé.
  */
  it('reprend le défaut quand la même zone s’enrichit, tant que rien n’a été choisi', () => {
    // La Nouvelle-Calédonie arrive d'abord d'OSM, puis le GR Nord embarqué
    // la complète (`mergeLocalBoucles`) : le défaut doit suivre la liste
    // complète, quel que soit l'ordre dans lequel React voit les deux.
    const troisGr = [1, 2, 3].map((i) => ({
      network: 'GR' as const,
      ref: `GR ${String(i)}`,
      osmRelationId: i,
    }))
    useReseauxVisibles.getState().adapterALaZone('z', troisGr.slice(0, 1))
    expect(useReseauxVisibles.getState().reseauxVisibles).toContain('GR')
    useReseauxVisibles.getState().adapterALaZone('z', troisGr)
    expect(useReseauxVisibles.getState().reseauxVisibles).not.toContain('GR')
  })

  it('arrêter la démonstration ne défait pas un choix : même liste, autre clé', () => {
    // `arreterDemonstration` renomme la zone (« demonstration » →
    // « boucles-lyon ») sans en changer les itinéraires.
    useReseauxVisibles.getState().adapterALaZone('demonstration', nc1)
    useReseauxVisibles.getState().basculerReseau('LOCAL')
    const choix = useReseauxVisibles.getState().reseauxVisibles
    useReseauxVisibles.getState().adapterALaZone('boucles-lyon', nc1)
    expect(useReseauxVisibles.getState().reseauxVisibles).toEqual(choix)
  })
})

