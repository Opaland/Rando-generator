import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { STEP_METERS, type Itinerary, type Network, type Sample } from './types.ts'

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

interface ChiffresCompletion {
  pctMesure: number
  pctDeclare: number
  metresMesures: number
  metresDeclares: number
  metresTotal: number
}

/**
 * Les deux chiffres, côte à côte et jamais additionnés.
 *
 * L'issue proposait « 43 % mesurés, 12 % déclarés » plutôt qu'un seul chiffre
 * qui les additionne en silence. C'est cette piste-là, et elle décide de la
 * forme du reste : puisque les deux nombres voyagent ensemble, aucun écran ne
 * peut afficher l'un en croyant montrer l'autre.
 *
 * **Comptés dans la même unité** (#564) : les échantillons du matching, où un
 * way partagé ne compte qu'une fois. Le déclaré prenait la longueur exacte
 * des itinéraires cochés sur un total en échantillons — deux GR qui partagent
 * un way, cochés, faisaient 121,2 % ; un itinéraire fragmenté coché en entier,
 * 30 %. Un échantillon est déclaré s'il n'est pas déjà mesuré et qu'il
 * appartient à un itinéraire coché : la mesure prime, le déclaratif ne comble
 * que ce qu'elle ne couvre pas, et la somme ne peut plus dépasser 100 %.
 * Tranché par Cédric le 20/10.
 */
export function chiffresDeCompletion(
  mesure: {
    global: { doneMeters: number; totalMeters: number; pct: number }
    samples: readonly Pick<Sample, 'done' | 'itineraryIds'>[]
  },
  declares: ParcoursDeclare[],
  stepMeters: number = STEP_METERS,
): ChiffresCompletion {
  const coches = new Set(declares.map((d) => d.itineraryId))
  let declaresEchantillons = 0
  for (const echantillon of mesure.samples) {
    if (echantillon.done) continue
    if (echantillon.itineraryIds.some((id) => coches.has(id))) {
      declaresEchantillons += 1
    }
  }
  const declaresMetres = declaresEchantillons * stepMeters
  const total = mesure.global.totalMeters
  return {
    pctMesure: mesure.global.pct,
    pctDeclare: total > 0 ? (declaresMetres / total) * 100 : 0,
    metresMesures: mesure.global.doneMeters,
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
interface DeclarationListee {
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

/**
 * Ce que le tableau de bord a comme sujet (revue globale du 23/08).
 *
 * Sylvie coche quinze PR depuis leur fiche, et son bilan affichait
 * « Aucune sortie importée pour l'instant » — une phrase qui contredisait ce
 * qu'elle venait de faire. Elle était juste la veille : c'est #158 qui l'a
 * rendue fausse **sans la toucher**, parce qu'elle testait `traces === 0`,
 * et que Sylvie n'aura jamais de trace. C'est tout son cas.
 *
 * La bonne question n'est pas « a-t-elle importé une trace ? » mais
 * « **a-t-elle fait quelque chose ?** ». Elle est nommée ici parce que trois
 * endroits pourraient vouloir la poser, et que la recopier est le mode
 * d'échec de CLAUDE.md §4.
 */
type EtatBilan = 'vide' | 'declare' | 'mesure'

export function etatDuBilan(compte: {
  traces: number
  declarations: number
}): EtatBilan {
  if (compte.traces > 0) return 'mesure'
  return compte.declarations > 0 ? 'declare' : 'vide'
}

/**
 * La phrase sous le grand pourcentage.
 *
 * Pour Sylvie, le zéro reste vrai : c'est le pourcentage **mesuré**, et #158
 * interdit de le gonfler avec du déclaratif. Ce qui change, c'est qu'on
 * cesse de lui dire qu'elle n'a rien fait — et qu'on lui dit pourquoi son
 * chiffre est à zéro, ce qui est autre chose.
 */
export function libelleSousLeChiffre(
  etat: EtatBilan,
  global: { doneMeters: number; totalMeters: number },
): string {
  if (etat === 'vide') {
    return `Aucune sortie importée pour l’instant — ${formatKm(
      global.totalMeters,
    )} à découvrir dans cette zone.`
  }
  if (etat === 'declare') {
    return (
      'Ce pourcentage ne compte que les traces GPX, et vous n’en avez pas ' +
      'encore importé. Vos itinéraires cochés à la main sont plus bas.'
    )
  }
  return `${formatKm(global.doneMeters)} parcourus · ${formatKm(
    Math.max(0, global.totalMeters - global.doneMeters),
  )} restants`
}
