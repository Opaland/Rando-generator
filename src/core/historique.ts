import { polylineLengthMeters } from './sampling.ts'
import type { Track } from './types.ts'

/**
 * Rendre consultable un historique qui a grossi (issue #175).
 *
 * Karim dépose son archive Garmin complète : la lecture réussit, le calcul
 * réussit, et il se retrouve devant huit cents lignes sans recherche, sans
 * tri, sans regroupement. L'application a réussi la partie difficile et
 * échoue sur la partie facile.
 *
 * Tout est ici plutôt que dans le composant, pour deux raisons : ces règles
 * s'éprouvent sans DOM, et la mesure de longueur ne doit être faite qu'une
 * fois par trace — le rendu la refaisait à chaque passage, soit huit
 * millions de distances pour peindre une liste.
 */

/** Une trace, plus ce qu'il faut pour la trier et la chercher. */
export interface EntreeHistorique {
  track: Track
  /** Longueur du tracé, mesurée une seule fois. */
  metres: number
  /** Année de la sortie ; `null` si le fichier n'en portait pas. */
  annee: number | null
  /** Instant de la sortie, pour trier sans reparser la date. */
  instant: number | null
  /** Nom et dates, normalisés une fois pour la recherche. */
  cherchable: string
}

export type CritereTri = 'date' | 'distance' | 'denivele'

/**
 * En dessous de ce nombre de sorties, aucun regroupement : un repli sur
 * quatre sorties ajoute un geste sans rien ranger.
 *
 * Seuil de **présentation** — il ne change rien à ce qui est calculé, et se
 * tranche donc au jugement (CLAUDE.md §2). Trente, parce qu'une liste plus
 * courte tient sous le pouce sans effort. Écartés : grouper toujours, qui
 * impose un pli à qui n'en a pas besoin ; ne grouper qu'au-delà de cent,
 * qui laisse justement la zone inconfortable sans remède.
 */
export const SEUIL_GROUPEMENT = 30

/**
 * Ce qu'une année déplie d'un coup. Au-delà, le reste est décompté et
 * affiché à la demande : huit cents sorties la même année restent huit
 * cents nœuds à peindre, même dans un groupe ouvert.
 *
 * Seuil de présentation également.
 */
export const MAX_PAR_ANNEE = 200

/** Minuscules, sans accents : personne ne tape « crêtes » avec l'accent. */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function preparerHistorique(tracks: Track[]): EntreeHistorique[] {
  return tracks.map((track) => {
    const instant = track.date ? Date.parse(track.date) : Number.NaN
    const valide = Number.isFinite(instant)
    const date = valide ? new Date(instant) : null
    return {
      track,
      metres: polylineLengthMeters(track.points),
      annee: date ? date.getFullYear() : null,
      instant: valide ? instant : null,
      // La date telle qu'elle est affichée fait partie du texte cherchable :
      // la liste montre « 15/06/2026 », le chercher doit fonctionner.
      cherchable: normaliser(
        [
          track.filename,
          // La zone au moment de l'import (#206) : « PNR du Pilat » se
          // cherche comme le nom de fichier. Absente sur les traces déjà
          // en base, et c'est sans conséquence — une chaîne vide ne
          // retire rien de cherchable.
          track.zoneALImport ?? '',
          date ? date.toLocaleDateString('fr-FR') : '',
          date ? String(date.getFullYear()) : '',
        ].join(' '),
      ),
    }
  })
}

export function chercherHistorique(
  entrees: EntreeHistorique[],
  requete: string,
): EntreeHistorique[] {
  const terme = normaliser(requete.trim())
  if (terme === '') return entrees
  return entrees.filter((e) => e.cherchable.includes(terme))
}

export function trierHistorique(
  entrees: EntreeHistorique[],
  critere: CritereTri,
): EntreeHistorique[] {
  // Une copie : le tableau reçu vient d'un `useMemo` et sera réutilisé.
  const copie = [...entrees]
  if (critere === 'distance') {
    return copie.sort((a, b) => b.metres - a.metres)
  }
  if (critere === 'denivele') {
    // Une absence de mesure n'est pas un dénivelé nul : la ramener à zéro
    // mêlerait ces sorties aux sorties plates, qui sont un fait et non un
    // manque. Elles vont donc à la fin, sans se prétendre plates.
    return copie.sort((a, b) => {
      const da = a.track.elevationGain
      const db = b.track.elevationGain
      if (typeof da !== 'number') return typeof db === 'number' ? 1 : 0
      if (typeof db !== 'number') return -1
      return db - da
    })
  }
  // Même règle pour une sortie sans date : à la fin, pas au 1er janvier 1970.
  return copie.sort((a, b) => {
    if (a.instant === null) return b.instant === null ? 0 : 1
    if (b.instant === null) return -1
    return b.instant - a.instant
  })
}

export interface GroupeHistorique {
  /** `null` : soit la liste est courte et n'est pas groupée, soit ce sont
   * les sorties sans date. `ouvertParDefaut` distingue les deux cas. */
  annee: number | null
  entrees: EntreeHistorique[]
  ouvertParDefaut: boolean
  /** Combien d'entrées au-delà de `MAX_PAR_ANNEE` dans ce groupe. */
  restantes: number
}

export function grouperParAnnee(
  entrees: EntreeHistorique[],
): GroupeHistorique[] {
  if (entrees.length < SEUIL_GROUPEMENT) {
    return [
      {
        annee: null,
        entrees,
        ouvertParDefaut: true,
        restantes: Math.max(0, entrees.length - MAX_PAR_ANNEE),
      },
    ]
  }

  const parAnnee = new Map<number, EntreeHistorique[]>()
  const sansDate: EntreeHistorique[] = []
  for (const entree of entrees) {
    if (entree.annee === null) {
      sansDate.push(entree)
      continue
    }
    const groupe = parAnnee.get(entree.annee)
    if (groupe) groupe.push(entree)
    else parAnnee.set(entree.annee, [entree])
  }

  const annees = [...parAnnee.keys()].sort((a, b) => b - a)
  // L'année la plus récente **qui contient des sorties**, et non l'année
  // civile en cours : chaque mois de janvier, celle-ci serait vide.
  const groupes: GroupeHistorique[] = annees.map((annee, rang) => {
    const contenu = parAnnee.get(annee) ?? []
    return {
      annee,
      entrees: contenu,
      ouvertParDefaut: rang === 0,
      restantes: Math.max(0, contenu.length - MAX_PAR_ANNEE),
    }
  })

  if (sansDate.length > 0) {
    groupes.push({
      annee: null,
      entrees: sansDate,
      ouvertParDefaut: false,
      restantes: Math.max(0, sansDate.length - MAX_PAR_ANNEE),
    })
  }
  return groupes
}

/**
 * Ce qu'on affiche, une fois cherché et trié.
 *
 * Le regroupement par année est une commodité **chronologique** : il n'a de
 * sens que si la liste est ordonnée par date. Trier par distance puis
 * découper par année enterrerait la plus longue sortie dans une année
 * repliée — la personne a demandé un classement global, on lui rendait un
 * classement par tranche. Trouvé par le test e2e du tri, qui attendait la
 * plus longue en tête et trouvait la première de l'année courante.
 */
export function organiserHistorique(
  entrees: EntreeHistorique[],
  critere: CritereTri,
): GroupeHistorique[] {
  if (critere !== 'date') {
    return [
      {
        annee: null,
        entrees,
        ouvertParDefaut: true,
        restantes: Math.max(0, entrees.length - MAX_PAR_ANNEE),
      },
    ]
  }
  return grouperParAnnee(entrees)
}
