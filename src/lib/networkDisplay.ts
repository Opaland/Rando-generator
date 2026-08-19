import type { Network } from '../core/types.ts'

/**
 * Couleur de balisage par réseau, pour la carte et la légende.
 *
 * Ces valeurs sont forcément dupliquées avec les variables de src/index.css :
 * MapLibre ne lit pas les propriétés personnalisées CSS, et une feuille de
 * style ne lit pas une constante JavaScript. tests/unit/networkColors.test.ts
 * empêche les deux listes de diverger — un badge et un tracé de couleurs
 * différentes ne se remarquent qu'au moment où l'on compare, donc jamais.
 */
export const NETWORK_COLORS: Record<Network, string> = {
  GR: '#c8102e',
  GRP: '#b34a08',
  PR: '#d9a400',
  // Boucles locales open data : bleu-vert, volontairement distinct du jaune
  // PR pour ne pas confondre deux sources différentes sur la carte.
  LOCAL: '#1d7a8c',
  PERSO: '#1e2b23',
}

export const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  LOCAL: 'Boucle locale',
  PERSO: 'Itinéraire perso',
}

/** Texte court des badges (les libellés longs cassent la mise en page). */
export const NETWORK_BADGES: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GRP',
  PR: 'PR',
  LOCAL: 'Boucle',
  PERSO: 'PERSO',
}
