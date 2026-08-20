import type { PoiDetails, PoiKind } from '../core/types.ts'

/** Libellés et couleurs des catégories de POI, partagés entre la carte et la fiche détail. */
export const POI_LABELS: Record<PoiKind, string> = {
  viewpoint: 'Point de vue',
  peak: 'Sommet',
  pass: 'Col',
  hut: 'Refuge gardé',
  bivouac: 'Couchage libre',
  shelter: 'Abri (pause)',
  water: "Point d'eau",
  picnic: 'Pique-nique',
  ruins: 'Vestige',
  marker: 'Croix ou borne',
  monument: 'Monument',
}

export const POI_COLORS: Record<PoiKind, string> = {
  viewpoint: '#2f6f4f',
  peak: '#6b4226',
  pass: '#8c5a2b',
  hut: '#c8102e',
  bivouac: '#7d3c98',
  shelter: '#4a6b6b',
  water: '#1d6fa5',
  picnic: '#b3801a',
  ruins: '#8a6f4e',
  marker: '#7a6a5a',
  monument: '#5a5a7a',
}

/** Catégories où l'on peut passer la nuit sans réservation ni gardien. */
export const POI_OVERNIGHT: PoiKind[] = ['bivouac']

/**
 * Ce qu'on peut honnêtement dire d'un point d'eau.
 *
 * Une fontaine `drinking_water` est prévue pour être bue : sans mention
 * contraire, on n'ajoute pas de doute là où il n'y en a pas. Une source
 * naturelle, elle, n'est potable que si OpenStreetMap l'affirme — et le
 * silence de la donnée est une information à afficher, pas un blanc à
 * laisser interpréter.
 */
export function mentionEau(details: PoiDetails): string | null {
  const morceaux: string[] = []
  if (details.drinkingWater === 'oui') morceaux.push('potable')
  else if (details.drinkingWater === 'non') morceaux.push('non potable')
  else if (details.drinkingWater === 'traitee') morceaux.push('potable (traitée)')
  else if (details.spring) morceaux.push('potabilité non renseignée')
  if (details.seasonal) morceaux.push('saisonnière')
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
