import { describe, it, expect, vi } from 'vitest'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { appliquerQuandPret } from '../../src/components/map/useMapSources.ts'

/**
 * Le repère du profil altimétrique disparaissait par intermittence, et la
 * suite e2e le prenait sur le fait environ une fois sur trois sous charge.
 *
 * Deux causes distinctes, trouvées à deux moments différents.
 *
 * La première (#186) : un `apply` mis en attente ferme sur les données de
 * son rendu, et rejouait donc un état périmé quand l'attente se levait
 * après un rendu plus récent. D'où le nettoyage rendu par la fonction.
 *
 * La seconde : l'attente elle-même. Elle portait sur `isStyleLoaded()` puis
 * sur l'événement « idle », qui dans MapLibre exigent que **toutes** les
 * sources de la carte soient chargées — y compris le fond raster, sans
 * rapport avec les sources GeoJSON qu'on écrit. Quand le fond boucle en
 * erreur (les e2e avortent toutes les requêtes de tuiles, et un utilisateur
 * hors ligne est dans le même cas), « idle » peut ne jamais se déclencher :
 * la mise à jour restait en attente pour toujours. Mesuré : aucun « idle »
 * en cinq secondes sur les runs en échec, plusieurs dizaines sur ceux qui
 * passaient.
 *
 * L'attente porte maintenant sur ce qu'on veut vraiment savoir — la source
 * visée existe-t-elle — et se réveille sur « styledata », qui ne dépend pas
 * du chargement des tuiles.
 */
function carteFactice(sourcesPresentes: string[]) {
  const abonnes: (() => void)[] = []
  const sources = new Set(sourcesPresentes)
  const map = {
    getSource: (id: string) => (sources.has(id) ? { id } : undefined),
    on: (_evenement: string, fn: () => void) => {
      abonnes.push(fn)
    },
    off: (_evenement: string, fn: () => void) => {
      const index = abonnes.indexOf(fn)
      if (index >= 0) abonnes.splice(index, 1)
    },
  } as unknown as MaplibreMap
  return {
    map,
    ajouterSource: (id: string) => sources.add(id),
    styledata: () => {
      for (const fn of abonnes.slice()) fn()
    },
  }
}

describe('appliquerQuandPret', () => {
  it('applique tout de suite quand la source visée existe', () => {
    const { map } = carteFactice(['trails'])
    const apply = vi.fn()
    // Rien à annuler : il n'y a pas d'attente.
    expect(appliquerQuandPret(map, ['trails'], apply)).toBeUndefined()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('n’attend pas le chargement des tuiles, seulement la source', () => {
    // Le cas qui gelait la mise à jour : le fond raster boucle en erreur,
    // donc « idle » ne vient jamais — mais la source GeoJSON, elle, est là
    // depuis longtemps. Rien ne justifie d'attendre.
    const { map } = carteFactice(['elevation-hover'])
    const apply = vi.fn()
    appliquerQuandPret(map, ['elevation-hover'], apply)
    expect(apply).toHaveBeenCalledOnce()
  })

  it('attend quand la source n’existe pas encore', () => {
    const { map, ajouterSource, styledata } = carteFactice([])
    const apply = vi.fn()
    appliquerQuandPret(map, ['trails'], apply)
    expect(apply).not.toHaveBeenCalled()
    // Un « styledata » sans la source ne suffit pas : le style se signale
    // plusieurs fois pendant sa mise en place.
    styledata()
    expect(apply).not.toHaveBeenCalled()
    ajouterSource('trails')
    styledata()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('attend toutes les sources qu’il va écrire, pas seulement la première', () => {
    const { map, ajouterSource, styledata } = carteFactice(['trails'])
    const apply = vi.fn()
    appliquerQuandPret(map, ['trails', 'pois'], apply)
    expect(apply).not.toHaveBeenCalled()
    ajouterSource('pois')
    styledata()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('ne se réabonne pas indéfiniment une fois appliqué', () => {
    const { map, ajouterSource, styledata } = carteFactice([])
    const apply = vi.fn()
    appliquerQuandPret(map, ['trails'], apply)
    ajouterSource('trails')
    styledata()
    styledata()
    expect(apply).toHaveBeenCalledOnce()
  })

  it('n’exécute pas une mise à jour annulée', () => {
    const { map, ajouterSource, styledata } = carteFactice([])
    const apply = vi.fn()
    appliquerQuandPret(map, ['trails'], apply)?.()
    ajouterSource('trails')
    styledata()
    expect(apply).not.toHaveBeenCalled()
  })

  it('laisse le dernier rendu gagner, et non le premier', () => {
    // Le scénario exact du repère (#186) : la fiche s'ouvre sans repère
    // alors que la source n'est pas encore là, puis le clic pose le repère.
    // Sans le nettoyage, le rendu d'avant le clic reprenait la main.
    const { map, ajouterSource, styledata } = carteFactice([])
    const sansRepere = vi.fn()
    const avecRepere = vi.fn()
    const annuler = appliquerQuandPret(map, ['elevation-hover'], sansRepere)
    annuler?.()
    appliquerQuandPret(map, ['elevation-hover'], avecRepere)
    ajouterSource('elevation-hover')
    styledata()
    expect(sansRepere).not.toHaveBeenCalled()
    expect(avecRepere).toHaveBeenCalledOnce()
  })
})
