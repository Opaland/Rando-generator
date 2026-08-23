import { displayName, formatPct } from '../lib/format.ts'
import type { Itinerary, Network } from './types.ts'

/**
 * « J'ai fait celui-là » — le parcours déclaré, sans trace GPX (issue #158).
 *
 * Sylvie n'a aucun fichier : ses quinze PR des trois dernières années sont
 * dans sa tête. Tout le produit suppose une trace ; c'est le seul persona
 * pour qui l'application reste inutilisable de bout en bout, et c'est le
 * profil le plus nombreux — la majorité des randonneurs n'enregistrent rien.
 *
 * **La règle dure, et elle vient de l'issue : un itinéraire coché à la main
 * ne se confond jamais avec un itinéraire mesuré.** Tout le produit repose
 * sur « le chiffre est vrai » ; les additionner en silence le détruirait.
 *
 * Ici, ce n'est pas une discipline, c'est une propriété de structure. Le
 * déclaratif **n'entre pas dans le pipeline de matching** : il ne produit
 * aucun échantillon. « Prochaine sortie », les tronçons restants et la plus
 * longue série continue l'ignorent donc sans qu'aucune garde ne les protège
 * — ils n'y ont pas accès. C'est le seul agencement où l'on ne peut pas
 * oublier la quatrième garde (CLAUDE.md §4), puisqu'il n'y en a aucune.
 */

/** Un itinéraire que quelqu'un déclare avoir parcouru, sans l'avoir mesuré. */
export interface ParcoursDeclare {
  itineraryId: number
  /**
   * Date approximative, si elle s'en souvient. `null` est un cas normal et
   * non une donnée manquante : « je l'ai fait, je ne sais plus quand » est
   * une réponse complète.
   */
  date: string | null
  /** Instant de la déclaration — pour trier, et pour pouvoir revenir dessus. */
  declareLe: string
}

export function estDeclare(
  declares: ParcoursDeclare[],
  itineraryId: number,
): boolean {
  return declares.some((d) => d.itineraryId === itineraryId)
}

/** Longueur cumulée des itinéraires cochés, parmi ceux qui sont chargés. */
export function metresDeclares(
  itineraries: Itinerary[],
  declares: ParcoursDeclare[],
): number {
  let total = 0
  for (const itin of itineraries) {
    if (estDeclare(declares, itin.osmRelationId)) total += itin.totalMeters
  }
  return total
}

export interface ChiffresCompletion {
  pctMesure: number
  pctDeclare: number
  metresMesures: number
  metresDeclares: number
  metresTotal: number
}

export interface OptionsCompletion {
  /**
   * Mètres déjà mesurés sur chaque itinéraire.
   *
   * Sans cela, un itinéraire parcouru à moitié puis coché à la main
   * compterait deux fois ces mètres-là, et le total dépasserait 100 %. La
   * mesure prime : le déclaratif ne comble que ce qu'elle ne couvre pas.
   */
  mesuresParItineraire?: Map<number, number>
}

/**
 * Les deux chiffres, côte à côte et jamais additionnés.
 *
 * L'issue proposait « 43 % mesurés, 12 % déclarés » plutôt qu'un seul chiffre
 * qui les additionne en silence. C'est cette piste-là, et elle décide de la
 * forme du reste : puisque les deux nombres voyagent ensemble, aucun écran ne
 * peut afficher l'un en croyant montrer l'autre.
 */
export function chiffresDeCompletion(
  mesure: { doneMeters: number; totalMeters: number; pct: number },
  itineraries: Itinerary[],
  declares: ParcoursDeclare[],
  options: OptionsCompletion = {},
): ChiffresCompletion {
  const dejaMesures = options.mesuresParItineraire ?? new Map<number, number>()
  let declaresMetres = 0
  for (const itin of itineraries) {
    if (!estDeclare(declares, itin.osmRelationId)) continue
    const mesureSurCetItineraire = dejaMesures.get(itin.osmRelationId) ?? 0
    declaresMetres += Math.max(0, itin.totalMeters - mesureSurCetItineraire)
  }
  const total = mesure.totalMeters
  return {
    pctMesure: mesure.pct,
    pctDeclare: total > 0 ? (declaresMetres / total) * 100 : 0,
    metresMesures: mesure.doneMeters,
    metresDeclares: declaresMetres,
    metresTotal: total,
  }
}

/**
 * Ce qui s'affiche : un chiffre tant que rien n'est déclaré, deux ensuite.
 *
 * La grande majorité des écrans ne doit pas payer le prix d'une distinction
 * qui ne les concerne pas — quelqu'un qui n'a jamais rien coché ne verra
 * jamais le mot « mesurés ».
 */
export function libelleCompletion(chiffres: {
  pctMesure: number
  pctDeclare: number
}): string {
  if (chiffres.pctDeclare <= 0) return formatPct(chiffres.pctMesure)
  return `${formatPct(chiffres.pctMesure)} mesurés · ${formatPct(
    chiffres.pctDeclare,
  )} déclarés`
}

/** Une déclaration telle que « Mes sorties » la montre. */
export interface DeclarationListee {
  itineraryId: number
  nom: string
  network: Network
  metres: number
  date: string | null
}

/**
 * Les déclarations, prêtes à lister — dans leur **propre section** (issue
 * #158, troisième pierre).
 *
 * Une section à part, et non des lignes glissées dans la liste des traces :
 * celle-ci est bâtie sur des `Track`, dont chaque entrée porte une géométrie
 * réelle, une longueur mesurée, un détail de sortie et une suppression. Y
 * mêler du déclaratif reviendrait à confondre deux natures dans le seul
 * endroit où l'on compare ses sorties entre elles — c'est le même principe
 * que les deux chiffres du tableau de bord.
 *
 * Les sans-date vont en fin de liste, et non au hasard : « je ne sais plus
 * quand » est une réponse, pas une donnée manquante, et elle mérite un rang
 * décidé.
 */
export function listerDeclarations(
  itineraries: Itinerary[],
  declares: ParcoursDeclare[],
): DeclarationListee[] {
  const parId = new Map(itineraries.map((i) => [i.osmRelationId, i]))
  const listees: DeclarationListee[] = []
  for (const d of declares) {
    const itin = parId.get(d.itineraryId)
    if (!itin) continue
    listees.push({
      itineraryId: d.itineraryId,
      nom: displayName(itin),
      network: itin.network,
      metres: itin.totalMeters,
      date: d.date,
    })
  }
  return listees.sort((a, b) => {
    if (a.date === b.date) return 0
    if (a.date === null) return 1
    if (b.date === null) return -1
    return a.date < b.date ? 1 : -1
  })
}
