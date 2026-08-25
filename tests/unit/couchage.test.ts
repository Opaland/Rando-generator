import { describe, it, expect } from 'vitest'
import { estUnCouchage } from '../../src/core/couchage.ts'
import { POI_OVERNIGHT } from '../../src/lib/poiDisplay.ts'
import type { PoiKind } from '../../src/core/types.ts'

/**
 * Cette liste était privée dans `stages.ts`, sous un commentaire annonçant
 * qu'il n'y aurait « pas de quatrième lecture ». L'issue #318 en fait une —
 * l'exception au rayon de détour — d'où l'extraction, et ce fichier.
 */
describe('estUnCouchage', () => {
  it('reconnaît les trois endroits où l’on dort', () => {
    expect(estUnCouchage('hut')).toBe(true)
    expect(estUnCouchage('bivouac')).toBe(true)
    expect(estUnCouchage('gite')).toBe(true)
  })

  it('n’y met pas l’abri météo', () => {
    // `PoiKind` le dit lui-même : « pause ou urgence, pas prévu pour la
    // nuit ». Le confondre ferait proposer un auvent de trois mètres carrés
    // comme couchage d'étape.
    expect(estUnCouchage('shelter')).toBe(false)
  })

  it('n’y met rien d’autre', () => {
    // Écrit en négatif plutôt qu'en positif : une catégorie neuve ajoutée à
    // `PoiKind` ne doit pas entrer ici par accident.
    const autres: PoiKind[] = [
      'viewpoint',
      'peak',
      'pass',
      'water',
      'picnic',
      'ruins',
      'marker',
      'monument',
    ]
    for (const kind of autres) {
      expect(estUnCouchage(kind), `${kind} n’est pas un couchage`).toBe(false)
    }
  })

  it('reste distincte de « où dormir sans réservation »', () => {
    /*
      Deux questions voisines, et c'est bien deux. `POI_OVERNIGHT` demande
      « peut-on y dormir sans rien réserver » — un refuge gardé et un gîte
      d'étape se réservent, une cabane non. Les fondre ferait envoyer
      quelqu'un dormir devant une porte fermée.

      Ce test ne dit pas laquelle a raison : il dit qu'elles diffèrent, et
      qu'on ne peut pas les remplacer l'une par l'autre sans s'en apercevoir.
    */
    expect(POI_OVERNIGHT).toEqual(['bivouac'])
    expect(estUnCouchage('hut')).toBe(true)
    expect(POI_OVERNIGHT.includes('hut')).toBe(false)
  })
})
