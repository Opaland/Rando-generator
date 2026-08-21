/**
 * Ce qui sort réellement de l'appareil, compté ici (issue #178).
 *
 * « Aucun compte, aucun serveur, rien n'est envoyé » est le seul vrai
 * différenciateur du produit. Il est écrit dans l'en-tête, dans l'accueil,
 * dans « À propos » et sur la page publique — et il n'est jamais **montré**.
 * Un slogan répété n'est pas un bénéfice prouvé.
 *
 * Ce module ne fait que classer et compter. Il ne décide de rien, n'envoie
 * rien, et n'a aucun état : le journal vit dans le store, et disparaît avec
 * l'onglet — un compteur de vie privée qui se persisterait serait une
 * ironie coûteuse.
 *
 * Le point qui fait toute sa valeur : une destination qu'on ne sait pas
 * classer est **dite**, jamais absorbée dans un « divers ». Un compteur qui
 * range l'inconnu rassure sans informer, et deviendrait faux le jour où une
 * dépendance ouvrirait un canal que personne n'a voulu. C'est aussi ce qui
 * en fait un garde-fou sur les affirmations d'« À propos », et pas
 * seulement un ornement.
 */

export type Destination =
  | 'sentiers'
  | 'fond-de-carte'
  | 'altimetrie'
  | 'recherche-commune'
  /** Les fichiers de l'application elle-même : pas un tiers. */
  | 'site'
  | 'inconnue'

export interface EntreeJournal {
  destination: Destination
  hote: string
  nombre: number
}

/**
 * Les hôtes que l'application contacte volontairement. La liste double
 * celle qu'« À propos » énumère depuis #168 — si elles divergent, c'est
 * l'inventaire qui est faux, pas le compteur.
 */
const CONNUS: { hote: RegExp; chemin?: RegExp; destination: Destination }[] = [
  { hote: /(^|\.)overpass-api\.de$/, destination: 'sentiers' },
  { hote: /(^|\.)kumi\.systems$/, destination: 'sentiers' },
  // Deux services chez le même hôte : seul le chemin les sépare. L'un voit
  // où vous regardez, l'autre quel itinéraire vous ouvrez — « À propos » les
  // présente comme distincts, le compteur doit faire pareil.
  { hote: /(^|\.)data\.geopf\.fr$/, chemin: /altimetrie|elevation/i, destination: 'altimetrie' },
  { hote: /(^|\.)data\.geopf\.fr$/, destination: 'fond-de-carte' },
  { hote: /(^|\.)tile\.openstreetmap\.org$/, destination: 'fond-de-carte' },
  { hote: /(^|\.)api-adresse\.data\.gouv\.fr$/, destination: 'recherche-commune' },
  { hote: /(^|\.)data\.grandlyon\.com$/, destination: 'sentiers' },
]

export function classerSortie(url: string): { destination: Destination; hote: string } {
  let analysee: URL
  try {
    // Une URL relative est un fichier du site : il n'y a pas d'autre origine
    // depuis laquelle l'application soit servie.
    analysee = new URL(url, 'https://opaland.github.io/')
  } catch {
    return { destination: 'site', hote: '' }
  }
  const hote = analysee.hostname
  if (hote === 'opaland.github.io' || hote === 'localhost' || hote === '127.0.0.1') {
    return { destination: 'site', hote }
  }
  for (const connu of CONNUS) {
    if (!connu.hote.test(hote)) continue
    if (connu.chemin && !connu.chemin.test(analysee.pathname + analysee.search)) continue
    return { destination: connu.destination, hote }
  }
  return { destination: 'inconnue', hote }
}

export interface GroupeDestination {
  destination: Destination
  hotes: string[]
  nombre: number
}

/**
 * Ajoute une sortie au journal, en **fusionnant** avec la ligne existante.
 *
 * Mesuré : un simple chargement de zone produit quarante et une requêtes,
 * dont vingt-huit tuiles. Garder une ligne par requête ferait grossir le
 * journal sans fin au fil du déplacement sur la carte, pour une information
 * qui tient en un compteur par service. Le journal reste donc borné par le
 * nombre de couples (service, hôte) — une poignée.
 */
export function noterSortie(
  journal: EntreeJournal[],
  url: string,
): EntreeJournal[] {
  const { destination, hote } = classerSortie(url)
  const index = journal.findIndex(
    (e) => e.destination === destination && e.hote === hote,
  )
  if (index === -1) return [...journal, { destination, hote, nombre: 1 }]
  const copie = [...journal]
  const existante = copie[index] as EntreeJournal
  copie[index] = { ...existante, nombre: existante.nombre + 1 }
  return copie
}

export interface ResumeJournal {
  /** Requêtes parties vers un tiers. Les fichiers du site n'en sont pas. */
  total: number
  parDestination: GroupeDestination[]
  /** Hôtes contactés que la liste ne connaît pas. Vide, en principe. */
  inconnues: string[]
}

export function resumerJournal(entrees: EntreeJournal[]): ResumeJournal {
  const groupes = new Map<Destination, { hotes: Set<string>; nombre: number }>()
  const inconnues = new Set<string>()
  let total = 0
  for (const entree of entrees) {
    if (entree.destination === 'site') continue
    total += entree.nombre
    if (entree.destination === 'inconnue') inconnues.add(entree.hote)
    const groupe = groupes.get(entree.destination)
    if (groupe) {
      groupe.hotes.add(entree.hote)
      groupe.nombre += entree.nombre
    } else {
      groupes.set(entree.destination, {
        hotes: new Set([entree.hote]),
        nombre: entree.nombre,
      })
    }
  }
  const parDestination = [...groupes.entries()]
    .map(([destination, g]) => ({
      destination,
      hotes: [...g.hotes].sort(),
      nombre: g.nombre,
    }))
    .sort((a, b) => b.nombre - a.nombre)
  return { total, parDestination, inconnues: [...inconnues].sort() }
}

/**
 * Les mêmes noms que dans « À propos ». Une correction de texte se fait sur
 * toutes les surfaces : deux vocabulaires pour un même inventaire donnent
 * l'impression de deux inventaires.
 */
export function libelleDestination(destination: Destination): string {
  switch (destination) {
    case 'sentiers':
      return 'Tracés des sentiers'
    case 'fond-de-carte':
      return 'Fond de carte'
    case 'altimetrie':
      return 'Altimétrie'
    case 'recherche-commune':
      return 'Recherche de commune'
    case 'site':
      return 'Fichiers de l’application'
    case 'inconnue':
      return 'Destination non répertoriée'
  }
}
