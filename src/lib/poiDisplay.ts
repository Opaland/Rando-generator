import type { PoiKind } from '../core/types.ts'

/** Libellés et couleurs des catégories de POI, partagés entre la carte et la fiche détail. */
export const POI_LABELS: Record<PoiKind, string> = {
  viewpoint: 'Point de vue',
  peak: 'Sommet',
  hut: 'Refuge',
  water: "Point d'eau",
  picnic: 'Pique-nique',
  monument: 'Monument',
}

export const POI_COLORS: Record<PoiKind, string> = {
  viewpoint: '#2f6f4f',
  peak: '#6b4226',
  hut: '#c8102e',
  water: '#1d6fa5',
  picnic: '#b3801a',
  monument: '#5a5a7a',
}
