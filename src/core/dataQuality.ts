import { distanceMeters } from './geo.ts'
import { chainWays, MIN_GAP_METERS } from './chainage.ts'
import type { Itinerary, LonLat } from './types.ts'

/**
 * Qualité de la donnée affichée.
 *
 * L'application montre des relations OpenStreetMap sans dire ce qu'elles
 * valent. Or une relation trouée produit un pourcentage parfaitement faux
 * — calculé sur ce qui est présent, sans mentionner ce qui manque — et
 * l'utilisateur n'a aucun moyen de s'en douter. Dire « il manque 12 km à
 * cette relation » ne répare rien, mais rend le chiffre lisible.
 *
 * Rien ici ne juge le terrain : on ne mesure que ce qu'on a téléchargé.
 */

/** Au-delà, la donnée mérite une actualisation (le cache dure 30 jours). */
export const STALE_DAYS = 30

export interface GeometryGap {
  from: LonLat
  to: LonLat
  meters: number
}

export interface DataQuality {
  /** Morceaux distincts de la géométrie (1 = continue, 0 = rien d'exploitable). */
  pieces: number
  /** Interruptions entre morceaux, de la plus grande à la plus petite. */
  gaps: GeometryGap[]
  gapMeters: number
  /** Âge de la donnée en jours, si la date de téléchargement est lisible. */
  ageDays: number | null
  /**
   * Âge de la relation dans OpenStreetMap, en jours — l'âge de la donnée
   * elle-même, là où `ageDays` ne dit que celui de notre copie. Nul quand
   * Overpass n'a pas donné la date, ou pour un itinéraire hors OSM.
   */
  upstreamAgeDays: number | null
  /** Messages prêts à afficher ; vide quand il n'y a rien à signaler. */
  warnings: string[]
}

function formatKm(meters: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(
    meters / 1_000,
  )} km`
}

/**
 * Vrai quand la géométrie est en plusieurs morceaux. C'est le seul défaut
 * qui mérite d'apparaître dans la liste : l'âge de la donnée concerne toute
 * la zone d'un coup et n'apprendrait rien, répété sur chaque ligne.
 */
export function hasGaps(quality: DataQuality): boolean {
  return quality.pieces > 1
}

export function assessItinerary(
  itinerary: Itinerary,
  now: string,
): DataQuality {
  const chaine = chainWays(itinerary.ways)
  const gaps: GeometryGap[] = []
  let pieces = 0
  let precedent: LonLat | null = null

  for (const maillon of chaine) {
    if (maillon.newPiece) {
      pieces += 1
      if (precedent) {
        const meters = distanceMeters(precedent, maillon.start)
        // Sous le seuil, deux extrémités « séparées » sont en fait le même
        // point saisi deux fois : ce n'est pas un trou, c'est du bruit.
        if (meters >= MIN_GAP_METERS) {
          gaps.push({ from: precedent, to: maillon.start, meters })
        }
      }
    }
    precedent = maillon.end
  }

  gaps.sort((a, b) => b.meters - a.meters)
  const gapMeters = gaps.reduce((total, gap) => total + gap.meters, 0)

  const instant = Date.parse(itinerary.fetchedAt)
  const maintenant = Date.parse(now)
  const ageDays =
    Number.isNaN(instant) || Number.isNaN(maintenant)
      ? null
      : Math.floor((maintenant - instant) / 86_400_000)

  // Âge de la relation dans OSM. Volontairement pas un avertissement :
  // un GR balisé qui n'a pas bougé depuis huit ans n'a probablement pas
  // bougé sur le terrain non plus. C'est un fait à donner, pas un reproche.
  const amont = itinerary.osmUpdatedAt
    ? Date.parse(itinerary.osmUpdatedAt)
    : Number.NaN
  const upstreamAgeDays =
    Number.isNaN(amont) || Number.isNaN(maintenant)
      ? null
      : Math.max(0, Math.floor((maintenant - amont) / 86_400_000))

  const warnings: string[] = []
  if (pieces === 0) {
    warnings.push(
      'Aucun tracé exploitable dans cette relation OpenStreetMap : le pourcentage ne veut rien dire ici.',
    )
  } else if (pieces > 1) {
    warnings.push(
      `Géométrie en ${pieces} morceaux dans OpenStreetMap` +
        (gapMeters > 0 ? `, ${formatKm(gapMeters)} d’interruptions` : '') +
        ' : la progression ne porte que sur les tronçons présents.',
    )
  }
  /*
    Une relation qui ne contient qu'un seul chemin (issue #301).

    « Rando Saint-Joseph », relation 6628093 : un unique chemin de 471 m, ni
    `ref` ni `network`, créée en 2016 et jamais reprise. Elle s'affiche à
    côté d'un GR de 153 km, et **le chiffre qu'on en donne est juste** — 0,5
    km est toute la géométrie qu'elle porte. C'est la donnée qui est
    incomplète, pas le calcul.

    Le signal est **structurel** et non métrique : « un seul chemin membre »
    ne demande aucun seuil. Écarter en deçà d'une longueur en aurait demandé
    un, et le §2 l'interdit tant que la distribution n'est pas regardée.

    Mesuré avant d'écrire cette phrase — l'issue posait le verrou « si c'est
    20 %, ça devient du bruit » : **1 relation sur 26**, soit 4 %, sur le
    Pilat, la Loire et l'ouest lyonnais. La valeur suivante est 3 chemins :
    le cas est isolé, pas le bas d'un continuum.

    Au conditionnel, et c'est délibéré. À la différence de « géométrie en
    morceaux », rien ici ne condamne le pourcentage : ce qui manque manque
    dans OpenStreetMap, et nos données ne peuvent pas le savoir.
    « Probablement » est le maximum qu'on puisse affirmer.

    `pieces === 1` plutôt que `ways.length === 1` seul : une relation vide a
    déjà son propre avertissement, plus grave, et deux phrases sur le même
    écran diraient deux choses du même fait.

    **Et le chemin doit être ouvert.** Un chemin unique et fermé est une
    boucle complète — une boucle communale en est exactement une — et la
    dire « probablement incomplète » serait fausse. Cette nuance n'est pas
    de moi : le test « ne compte pas un chemin fermé comme une interruption »
    existait, il a rougi sur ma première version, et il avait raison.

    Vérifié sur les deux cas réels avant de conclure : le chemin de
    « Rando Saint-Joseph » (149884421, 30 nœuds) et celui du « Circuit de la
    Ronde des Vergers » (364456256, 8 nœuds) sont **tous deux ouverts**. La
    mesure de 4 % n'est donc pas entamée par cette exclusion.

    **Et l'itinéraire ne doit rien déclarer.** L'issue le disait, et je
    l'avais laissé tomber en écrivant le code :

    > une liaison assumée porterait un `ref` ou un `network`, celle-ci n'a
    > que `route=hiking`

    C'est un test de bout en bout qui l'a rattrapé — la fixture modélise le
    GRP Tour du Pilat, 140 km réels, par un chemin unique, et l'avertissement
    y apparaissait sur un itinéraire manifestement déclaré. Le raccourci de
    fixture était le révélateur, pas la cause : sans ce garde-fou, n'importe
    quel GR modélisé sommairement aurait été traité de fragment.

    Les deux cas réels mesurés n'ont **ni `ref` ni `network`** : la
    restriction n'entame pas non plus la mesure de 4 %.
  */
  const seul = itinerary.ways.length === 1 ? itinerary.ways[0] : null
  const premier = seul?.coords[0]
  const dernier = seul?.coords[seul.coords.length - 1]
  const boucleFermee =
    premier !== undefined &&
    dernier !== undefined &&
    premier[0] === dernier[0] &&
    premier[1] === dernier[1]

  const rienDeDeclare =
    (itinerary.ref === null || itinerary.ref === '') &&
    itinerary.network === 'INCONNU'

  if (pieces === 1 && seul !== null && !boucleFermee && rienDeDeclare) {
    warnings.push(
      'Cette relation ne contient qu’un seul chemin : elle est probablement' +
        ' incomplète dans OpenStreetMap.',
    )
  }
  if (ageDays !== null && ageDays > STALE_DAYS) {
    warnings.push(
      `Tracés téléchargés il y a ${ageDays} jours — « Actualiser les tracés » ira rechercher les corrections apportées depuis.`,
    )
  }

  return { pieces, gaps, gapMeters, ageDays, upstreamAgeDays, warnings }
}
