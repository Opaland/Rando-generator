import type { Network } from './types.ts'

/**
 * Classe un itinéraire depuis ses tags OSM :
 * network=iwn → INTERNATIONAL ; network=nwn → GR ; network=rwn → GRP ;
 * network=lwn → PR.
 * Sinon, repli sur le préfixe du ref (GRP avant GR, préfixe commun).
 *
 * **Ce qui ne se déclare pas ressort `INCONNU`, et non `PR`** (issue #284).
 *
 * `PR` a longtemps été la valeur de repli, c'est-à-dire la corbeille : tout
 * ce qui n'était ni `nwn`, ni `rwn`, ni `lwn`, ni préfixé « GR » y tombait.
 * Une relation qu'un contributeur a saisie pour lui, une boucle d'office de
 * tourisme, un tracé abandonné à moitié — tout ressortait « PR », peint en
 * jaune, à côté d'un texte expliquant que le jaune veut dire « Promenade et
 * Randonnée, circuit local balisé », marque de la FFRandonnée.
 *
 * L'application affirmait donc un balisage qu'elle n'avait jamais vu. Sur le
 * terrain, la différence est celle entre un sentier entretenu et un layon
 * qui s'arrête dans un pré — et c'est précisément ce que quelqu'un qui
 * choisit sa sortie a besoin de savoir.
 */
export function classifyNetwork(
  tags: Record<string, string | undefined>,
): Network {
  switch (tags.network) {
    // OpenStreetMap en emploie quatre, et nous n'en lisions que trois
    // (issue #335) : `iwn` tombait dans le repli par le ref, et sans ref
    // exploitable l'itinéraire ressortait `INCONNU` — c'est-à-dire que
    // l'application affirmait qu'aucun réseau n'était déclaré là où OSM en
    // déclarait le plus structurant qui soit.
    case 'iwn':
      return 'INTERNATIONAL'
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
  // Un ref qui écrit « PR » en toutes lettres est une déclaration, au même
  // titre que `network=lwn`. Ce cas arrivait auparavant sur `PR` **par
  // accident**, en traversant le repli : il aurait été perdu en changeant le
  // défaut, et aucun test ne l'aurait dit.
  if (ref.startsWith('PR')) return 'PR'
  return 'INCONNU'
}
