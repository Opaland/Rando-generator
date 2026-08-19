import type { Network } from '../core/types.ts'

/** Couleur de balisage par réseau — source unique pour la carte et la légende. */
export const NETWORK_COLORS: Record<Network, string> = {
  GR: '#c8102e',
  GRP: '#b34a08',
  PR: '#d9a400',
  PERSO: '#1e2b23',
}

export const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  PERSO: 'Itinéraire perso',
}
