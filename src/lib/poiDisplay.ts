import type { PoiKind } from '../core/types.ts'

/** Libellés et couleurs des catégories de POI, partagés entre la carte et la fiche détail. */
export const POI_LABELS: Record<PoiKind, string> = {
  viewpoint: 'Point de vue',
  peak: 'Sommet',
  hut: 'Refuge gardé',
  bivouac: 'Couchage libre',
  shelter: 'Abri (pause)',
  water: "Point d'eau",
  picnic: 'Pique-nique',
  monument: 'Monument',
}

export const POI_COLORS: Record<PoiKind, string> = {
  viewpoint: '#2f6f4f',
  peak: '#6b4226',
  hut: '#c8102e',
  bivouac: '#7d3c98',
  shelter: '#4a6b6b',
  water: '#1d6fa5',
  picnic: '#b3801a',
  monument: '#5a5a7a',
}

/** Catégories où l'on peut passer la nuit sans réservation ni gardien. */
export const POI_OVERNIGHT: PoiKind[] = ['bivouac']
