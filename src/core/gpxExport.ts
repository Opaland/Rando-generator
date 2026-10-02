import type { Itinerary, LonLat, Network, Track } from './types.ts'

/**
 * Export GPX : de quoi charger un itinéraire dans une montre, un GPS ou une
 * autre application. Générateur pur (aucun accès DOM) pour rester testable ;
 * le téléchargement lui-même vit dans lib/download.ts.
 */

/** Attribution inscrite dans le fichier, imposée par la licence de la source. */
export interface GpxAttribution {
  author: string
  license: string
}

const OSM_ATTRIBUTION: GpxAttribution = {
  author: 'les contributeurs OpenStreetMap',
  license: 'https://opendatacommons.org/licenses/odbl/',
}

const METROPOLE_ATTRIBUTION: GpxAttribution = {
  author: 'Métropole de Lyon',
  license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
}

/**
 * Attribution à embarquer selon la provenance du tracé. Exporter une donnée
 * ODbL ou en Licence Ouverte sans mentionner sa source serait une violation
 * de licence : le fichier la porte donc lui-même, puisqu'il circulera hors
 * de l'application.
 */
export function gpxAttributionFor(network: Network): GpxAttribution | null {
  switch (network) {
    // `INCONNU` est dans le même groupe que les trois réseaux déclarés, et
    // ce n'est pas un oubli : ne pas savoir de quel réseau il s'agit ne
    // change rien à la **provenance**. La géométrie vient d'OpenStreetMap,
    // et l'exporter sans le dire serait une violation d'ODbL. L'attribution
    // suit la source, jamais le classement.
    case 'GR':
    case 'GRP':
    case 'PR':
    case 'INTERNATIONAL':
    case 'INCONNU':
      return OSM_ATTRIBUTION
    case 'LOCAL':
      return METROPOLE_ATTRIBUTION
    case 'PERSO':
      /*
        Un tracé `PERSO` **peut** ne pas être celui de l'utilisateur.

        Ce cas répondait `null` avec le commentaire « c'est le sien », et
        c'était faux pour Léa : le PDIPR de son département arrive ici, sous
        Licence Ouverte, laquelle oblige à l'attribution. Le réseau dit le
        type de sentier, pas sa provenance — et les confondre produisait un
        export muet.

        La provenance se lit maintenant sur l'itinéraire (`attributionDe`).
        Ce repli-ci ne vaut donc que pour ce qui a réellement été dessiné
        dans l'application.
      */
      return null
  }
}

/**
 * La provenance d'un itinéraire : celle qu'il déclare, sinon celle que son
 * réseau implique (issue #87).
 *
 * Une seule fonction nommée, consultée partout où l'on attribue — l'export
 * GPX comme la fiche. Recopier ce choix est le mode d'échec de CLAUDE.md §4,
 * et c'est déjà ce qui a produit le trou : l'export dérivait du réseau, la
 * fiche affichait `details.source`, et personne ne couvrait le troisième cas.
 */
export function attributionDe(itinerary: Itinerary): GpxAttribution | null {
  return itinerary.attribution ?? gpxAttributionFor(itinerary.network)
}

/**
 * Ce qu'il faut dire quand on ne sait pas d'où vient un fichier importé.
 *
 * On ne l'invente pas — une attribution fausse est pire qu'absente. On
 * prévient que l'export sera muet, et la personne décide de ce qu'elle en
 * fait. Rien à dire pour un tracé dessiné à la main : il n'a pas de source
 * manquante, il n'en a pas.
 */
export function mentionDeSource(itinerary: Itinerary): string | null {
  if (attributionDe(itinerary)) return null
  if (itinerary.importe !== true) return null
  return (
    'Ce fichier ne déclare pas sa source. Si cette donnée vient d’un ' +
    'producteur public, son export GPX ne portera aucune attribution — ' +
    'la plupart des licences ouvertes en exigent une.'
  )
}

/** Un repère posé sur le tracé : une coupure d'étape, par exemple. */
export interface GpxWaypoint {
  lon: number
  lat: number
  name: string
}

export interface GpxExportOptions {
  name: string
  coords: LonLat[]
  attribution: GpxAttribution | null
  /** Horodatage ISO — injecté pour garder la fonction pure. */
  createdAt: string
  /**
   * Repères à poser sur le tracé (issue #161).
   *
   * Un GPX à waypoints plutôt qu'un fichier par étape : une montre en avale
   * un seul, le tracé reste entier, et les coupures se lisent dessus.
   */
  waypoints?: GpxWaypoint[]
  /**
   * Horodatage ISO de chaque point, aligné sur `coords` (issue sprint 1,
   * export d'une sortie enregistrée ou importée). `null` à un index donné
   * veut dire que ce point précis n'a pas d'horaire — on ne l'invente pas,
   * on l'omet. Absent, aucun `<time>` de point n'est écrit : c'est le cas
   * d'un itinéraire-cible, qui n'a jamais été marché.
   */
  pointTimes?: (string | null)[]
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Construit un document GPX 1.1 à partir d'une polyligne. */
export function buildGpxDocument(options: GpxExportOptions): string {
  const { name, coords, attribution, createdAt } = options
  if (coords.length === 0) {
    throw new Error('Impossible d’exporter un itinéraire sans aucun point.')
  }

  const safeName = escapeXml(name.trim() || 'Itinéraire')
  const points = coords
    .map(([lon, lat], i) => {
      // Schéma GPX 1.1 : à l'intérieur de <trkpt>, <time> vient après <ele>
      // (absent ici, aucun point de trace ne porte d'altitude).
      const instant = options.pointTimes?.[i]
      const balise = instant
        ? `\n        <time>${escapeXml(instant)}</time>\n      `
        : ''
      return `      <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${balise}</trkpt>`
    })
    .join('\n')

  // L'ordre des éléments de <metadata> est imposé par le schéma GPX 1.1 :
  // name, desc, author, copyright, link, time…
  const copyright = attribution
    ? `    <copyright author="${escapeXml(attribution.author)}">
      <license>${escapeXml(attribution.license)}</license>
    </copyright>\n`
    : ''

  /*
    L'ordre est imposé par le schéma GPX 1.1 : metadata, wpt, rte, trk. Un
    fichier qui l'enfreint est refusé par certaines montres — sans message,
    ce qui est le pire des cas sur le terrain.
  */
  const reperes = (options.waypoints ?? [])
    .map(
      (w) =>
        `  <wpt lat="${w.lat.toFixed(7)}" lon="${w.lon.toFixed(7)}">
    <name>${escapeXml(w.name)}</name>
  </wpt>`,
    )
    .join('\n')
  const blocReperes = reperes === '' ? '' : `${reperes}\n`

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Sentiers" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
${copyright}    <time>${escapeXml(createdAt)}</time>
  </metadata>
${blocReperes}  <trk>
    <name>${safeName}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`
}

/**
 * Le nom de fichier d'une trace, sans son extension — c'est le nom qu'on
 * veut voir dans les métadonnées GPX, pas « activity_18274639.gpx ».
 *
 * `versTrace` (sortieEnCours.ts) ne pose jamais d'extension sur une sortie
 * enregistrée (« Sortie enregistrée ») : le remplacement est un no-op pour
 * elle, et ne touche que les traces importées.
 */
export function trackDisplayName(track: Track): string {
  return track.filename.replace(/\.(gpx|fit|tcx)$/i, '')
}

/**
 * Exporte une trace personnelle — enregistrée ou importée — en GPX.
 *
 * Trou laissé ouvert depuis la livraison de l'enregistrement (#152) :
 * `enregistrementSlice.ts` dit qu'une sortie terminée devient « une trace
 * comme une autre — appariée, comptée, **exportable** », mais rien ne
 * l'exportait. Sans ça, une sortie faite dans l'application ne pouvait en
 * ressortir sous aucune forme — à l'inverse de la promesse « vos données
 * restent les vôtres ».
 *
 * Jamais d'attribution : une `Track` est toujours la trace de la personne
 * — enregistrée par elle ou déposée par elle —, jamais une donnée balisée
 * de tiers (ça, c'est `Itinerary`, et c'est `attributionDe` qui s'en
 * charge).
 */
export function gpxDocumentFromTrack(track: Track): string {
  return buildGpxDocument({
    name: trackDisplayName(track),
    coords: track.points,
    attribution: null,
    // La date de la sortie plutôt que celle de son rangement en base ; à
    // défaut (trace importée sans date lisible), le moment de l'import
    // reste le seul horodatage dont on dispose.
    createdAt: track.date ?? track.importedAt,
    // `exactOptionalPropertyTypes` : une trace sans `times` ne doit pas
    // poser `pointTimes: undefined`, qui n'est pas la même chose que
    // l'absence de la clé — l'un et l'autre valent « rien à écrire », mais
    // seule l'absence est un type valide ici.
    ...(track.times && {
      pointTimes: track.times.map((t) =>
        t === null ? null : new Date(t).toISOString(),
      ),
    }),
  })
}

/** Nom de fichier sûr, sans accent ni caractère interdit par les systèmes. */
export function gpxFilename(name: string): string {
  const slug = name
    .normalize('NFD')
    // Retire les diacritiques (« Crêt » → « Cret »).
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `sentiers-${slug || 'itineraire'}.gpx`
}
