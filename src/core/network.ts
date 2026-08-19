import type { Network } from './types.ts'

/**
 * Classe un itinéraire depuis ses tags OSM :
 * network=nwn → GR ; network=rwn → GRP ; network=lwn → PR.
 * Sinon, repli sur le préfixe du ref (GRP avant GR, préfixe commun), défaut PR.
 */
export function classifyNetwork(
  tags: Record<string, string | undefined>,
): Network {
  switch (tags.network) {
    case 'nwn':
      return 'GR'
    case 'rwn':
      return 'GRP'
    case 'lwn':
      return 'PR'
  }
  const ref = tags.ref ?? ''
  if (ref.startsWith('GRP')) return 'GRP'
  if (ref.startsWith('GR')) return 'GR'
  return 'PR'
}
