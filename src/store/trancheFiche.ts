/**
 * La fiche détail, sortie du store (issue #155).
 *
 * Deuxième tranche après le tracé. Elle porte ce qui s'ouvre quand on
 * choisit un itinéraire : le profil altimétrique, les points d'intérêt, la
 * vue 3D — et les deux cibles de cadrage de la carte, qui n'ont d'autre
 * usage que de venir d'ici.
 *
 * ## Ce qu'elle corrige au passage
 *
 * Dix champs étaient remis à zéro **à la main, dans trois endroits** :
 * ouvrir une fiche, la fermer, et choisir un autre itinéraire dans la liste.
 * J'ai d'abord écrit « deux » dans ce commentaire, puis compté (§4bis).
 *
 * Trois listes de dix lignes qu'il fallait garder d'accord, et rien ne le
 * vérifiait. C'est le mode d'échec du §4, et le dépôt en porte déjà quatre
 * cicatrices. `FICHE_FERMEE` les remplace, et l'état initial du store la
 * reprend aussi : quatre endroits, une table.
 *
 * ## Ce que ce découpage n'est pas
 *
 * Une séparation d'état : la tranche lit les itinéraires du store pour
 * trouver celui qu'on ouvre, et écrit la sélection courante. Les
 * dépendances sont listées une à une plutôt que masquées derrière « le
 * store », ce qui rend le couplage visible quand il grandit.
 */

import type {
  ElevationProfile,
  Itinerary,
  LonLat,
  PointOfInterest,
} from '../core/types.ts'
import {
  fetchElevationProfile,
  ElevationError,
  type ProfilePoint,
} from '../core/elevation.ts'
import { fetchPoisOuEchec } from '../core/poi.ts'
import {
  choisirPois,
  type PoisEmportes,
  type SourcePois,
} from '../core/poisEmportes.ts'
import { itineraryCoords } from '../core/mapdata.ts'

/** Ce que la fiche détail ajoute à l'état du store. */
export interface EtatFiche {
  detailItineraryId: number | null
  elevationProfile: ElevationProfile | null
  elevationError: string | null
  elevationLoading: boolean
  /** Point survolé sur le profil altimétrique, à marquer sur la carte. */
  elevationHover: ProfilePoint | null
  pois: PointOfInterest[]
  poisLoading: boolean
  /**
   * D'où viennent les points affichés (issue #153).
   *
   * « emporte » n'est pas un détail d'implémentation : un point d'eau
   * emporté il y a trois mois peut avoir été supprimé ou tari, et la fiche
   * doit le dire. Une tuile périmée, elle, reste juste.
   */
  poisSource: SourcePois
  /** Date de l'emport, quand les points en viennent. */
  poisRecuperesLe: string | null
  view3D: boolean
  /** Coordonnée à centrer sur la carte (POI cliqué) ; consommée une fois par MapView. */
  focusTarget: LonLat | null
  /** Cadre à cadrer sur la carte (étape d'un long itinéraire) ; consommé une fois. */
  focusBounds: [LonLat, LonLat] | null
}

/** Ce que la fiche détail ajoute aux actions du store. */
export interface ActionsFiche {
  openItineraryDetail: (id: number) => void
  closeItineraryDetail: () => void
  toggleView3D: () => void
  setElevationHover: (point: ProfilePoint | null) => void
  focusOn: (coords: LonLat) => void
  clearFocusTarget: () => void
  focusOnBounds: (bounds: [LonLat, LonLat]) => void
  clearFocusBounds: () => void
}

/**
 * Fiche fermée : l'état de départ, et celui auquel on revient.
 *
 * Une seule table plutôt que deux listes de douze champs recopiées.
 *
 * Les deux cibles de cadrage n'y figurent pas, et c'est délibéré : elles se
 * consomment une fois, à l'initiative de la carte, et fermer une fiche n'a
 * jamais annulé un cadrage demandé. Les mettre ici aurait changé un
 * comportement au prétexte de le ranger.
 */
export const FICHE_FERMEE: Omit<EtatFiche, 'focusTarget' | 'focusBounds'> = {
  detailItineraryId: null,
  elevationProfile: null,
  elevationError: null,
  elevationLoading: false,
  elevationHover: null,
  pois: [],
  poisLoading: false,
  poisSource: 'aucune',
  poisRecuperesLe: null,
  view3D: false,
}

/** Ce que la tranche a besoin de savoir du reste du store. */
export interface DependancesFiche {
  set: (
    partiel: Partial<EtatFiche & { selectedItineraryId: number | null }>,
  ) => void
  etatFiche: () => EtatFiche
  /** L'itinéraire ouvert, balisé ou perso, ou `undefined` s'il a disparu. */
  itineraireParId: (id: number) => Itinerary | undefined
  /** Les points d'intérêt mis de côté pour cet itinéraire, s'il y en a. */
  poisEmportes: (id: number) => Promise<PoisEmportes | null>
}

export function trancheFiche(deps: DependancesFiche): ActionsFiche {
  /*
    Numéro d'ordre des ouvertures.

    Deux fiches ouvertes coup sur coup lancent deux requêtes de profil : rien
    ne garantit que la première réponde en premier, et sans ce compteur la
    réponse tardive de la fiche abandonnée écraserait celle qu'on regarde.
  */
  let sequence = 0

  return {
    openItineraryDetail(id) {
      const courante = ++sequence
      deps.set({
        ...FICHE_FERMEE,
        detailItineraryId: id,
        selectedItineraryId: id,
        elevationLoading: true,
        poisLoading: true,
      })

      const itineraire = deps.itineraireParId(id)
      const coords = itineraire ? itineraryCoords(itineraire) : []
      const encoreLa = () =>
        courante === sequence && deps.etatFiche().detailItineraryId === id

      if (coords.length < 2) {
        deps.set({ elevationLoading: false, poisLoading: false })
        return
      }

      void fetchElevationProfile(coords)
        .then((profile) => {
          if (encoreLa())
            deps.set({ elevationProfile: profile, elevationLoading: false })
        })
        .catch((error: unknown) => {
          if (!encoreLa()) return
          deps.set({
            elevationLoading: false,
            elevationError:
              error instanceof ElevationError
                ? error.message
                : 'Profil altimétrique indisponible.',
          })
        })

      /*
        Le réseau et la réserve sont demandés ensemble, et `choisirPois`
        tranche. Les demander l'un après l'autre ferait attendre la réserve
        — qui est instantanée — derrière un Overpass qui met dix secondes à
        ne pas répondre, c'est-à-dire précisément dans le cas où elle sert.
      */
      void Promise.all([fetchPoisOuEchec(coords), deps.poisEmportes(id)]).then(
        ([reseau, emportes]) => {
          if (!encoreLa()) return
          const resultat = choisirPois(reseau, emportes)
          deps.set({
            pois: resultat.pois,
            poisSource: resultat.source,
            poisRecuperesLe: resultat.recuperesLe,
            poisLoading: false,
          })
        },
      )
    },

    closeItineraryDetail() {
      // Le numéro avance : une réponse encore en vol ne rouvrira rien.
      sequence += 1
      deps.set({ ...FICHE_FERMEE })
    },

    toggleView3D() {
      deps.set({ view3D: !deps.etatFiche().view3D })
    },

    setElevationHover(point) {
      deps.set({ elevationHover: point })
    },

    focusOn(coords) {
      deps.set({ focusTarget: coords })
    },

    clearFocusTarget() {
      deps.set({ focusTarget: null })
    },

    focusOnBounds(bounds) {
      deps.set({ focusBounds: bounds })
    },

    clearFocusBounds() {
      deps.set({ focusBounds: null })
    },
  }
}
