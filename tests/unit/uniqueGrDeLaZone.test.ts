import { describe, it, expect } from 'vitest'
import {
  GRANDS_ITINERAIRES_TOUJOURS_MONTRES,
  reseauxVisiblesParDefaut,
  reseauxVisiblesPourLaZone,
} from '../../src/core/lisibilite.ts'
import type { Network } from '../../src/core/types.ts'

/**
 * Issue #594, volet 2 — en Nouvelle-Calédonie, le repli par défaut cachait
 * le GR® NC1, **seul GR de la zone** : 14 itinéraires sur 20 masqués, aucun
 * GR dessiné (mesuré le 22/10 par l'agent `parcours`, au nom de Zoé).
 *
 * Le repli (#322, décision du 25/08) existe parce qu'un GR traverse la zone
 * de part en part et barre l'écran ; quand il est seul, il n'y a rien à
 * désencombrer, et le cacher prive la zone de son itinéraire principal.
 *
 * Décision de Cédric du 27/10 : ne jamais replier l'unique GR. Une zone qui
 * n'en compte qu'un ou deux les montre ; le repli reste pour les zones où ils
 * sont nombreux. « Un ou deux » est décidé, pas mesuré (§2).
 */
function itin(network: Network, ref: string | null, id: number) {
  return { network, ref, name: null, osmRelationId: id }
}

describe('reseauxVisiblesPourLaZone', () => {
  it('montre le GR d’une zone qui n’en a qu’un, même découpé en tronçons', () => {
    // Le GR NC1 est rendu en neuf relations-tronçons, toutes « GR NC1 » : un
    // seul itinéraire, pas neuf.
    const zone = [
      ...Array.from({ length: 9 }, (_, i) => itin('GR', 'GR NC1', i)),
      itin('INCONNU', null, 100),
    ]
    expect(reseauxVisiblesPourLaZone(zone)).toContain('GR')
  })

  it('montre encore deux GR, à la limite décidée', () => {
    const zone = [itin('GR', 'GR 7', 1), itin('GR', 'GR 65', 2)]
    expect(GRANDS_ITINERAIRES_TOUJOURS_MONTRES).toBe(2)
    expect(reseauxVisiblesPourLaZone(zone)).toContain('GR')
  })

  it('replie les GR d’une zone qui en compte trois ou plus', () => {
    const zone = [itin('GR', 'GR 7', 1), itin('GR', 'GR 65', 2), itin('GR', 'GR 9', 3)]
    expect(reseauxVisiblesPourLaZone(zone)).not.toContain('GR')
  })

  it('juge chaque réseau replié pour lui-même', () => {
    // Une Via internationale seule reste montrée ; trois GR restent repliés.
    const zone = [
      itin('INTERNATIONAL', 'E4', 1),
      itin('GR', 'GR 7', 2),
      itin('GR', 'GR 65', 3),
      itin('GR', 'GR 9', 4),
    ]
    const visibles = reseauxVisiblesPourLaZone(zone)
    expect(visibles).toContain('INTERNATIONAL')
    expect(visibles).not.toContain('GR')
  })

  it('compte un itinéraire sans référence pour lui seul', () => {
    // Sans `ref`, deux relations ne se confondent pas : rien ne dit qu'elles
    // forment le même itinéraire.
    const zone = [itin('GR', null, 1), itin('GR', null, 2), itin('GR', null, 3)]
    expect(reseauxVisiblesPourLaZone(zone)).not.toContain('GR')
  })

  it('confond « GR 7 » et « gr7 » : la même référence, écrite autrement', () => {
    const zone = [
      itin('GR', 'GR 7', 1),
      itin('GR', 'gr7', 2),
      itin('GR', 'GR7', 3),
    ]
    expect(reseauxVisiblesPourLaZone(zone)).toContain('GR')
  })

  it('rend le défaut habituel sans itinéraire du tout', () => {
    expect(reseauxVisiblesPourLaZone([])).toEqual(reseauxVisiblesParDefaut())
  })

  it('ne touche pas aux réseaux qui ne sont pas repliés par défaut', () => {
    const zone = [itin('PR', 'PR 1', 1)]
    expect(reseauxVisiblesPourLaZone(zone)).toEqual(reseauxVisiblesParDefaut())
  })
})
