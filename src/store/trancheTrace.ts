/**
 * Le tracé d'itinéraire, sorti du store (issue #155).
 *
 * ## Pourquoi cette tranche-là en premier
 *
 * `appStore.ts` faisait **2 252 lignes** au moment de ce découpage, là où
 * l'issue en comptait 1 566 : la dette a grossi de 44 % depuis qu'elle a été
 * écrite, et un fichier qu'on ne peut plus tenir en tête est un fichier où
 * l'on recopie une garde au lieu de la nommer — c'est déjà arrivé quatre
 * fois sur ce dépôt.
 *
 * Le tracé est la tranche la plus séparable : sept actions, trois aides, un
 * état qui ne sert qu'à elles, et une suite de bout en bout qui lui est
 * propre (`tests/e2e/tracer.spec.ts`).
 *
 * ## Ce que ce découpage est, et ce qu'il n'est pas
 *
 * **C'est une séparation de code, pas une séparation d'état.** La tranche
 * reçoit `get` sur l'état entier, et s'en sert : ouvrir le mode tracé ferme
 * la fiche détail — les deux occupent la même zone d'écran —, et enregistrer
 * un tracé ajoute un itinéraire perso puis relance le calcul de complétion.
 *
 * Prétendre le contraire serait le genre de commentaire qui vieillit mal
 * (CLAUDE.md §4bis). Ce qui est gagné est réel et suffit : un fichier de
 * moins de deux cents lignes qu'on relit d'un coup, et un motif que les
 * tranches suivantes reprendront.
 *
 * ## Ce qui ne change pas
 *
 * Aucun comportement. C'est une refonte pure, et sa preuve n'est pas dans ce
 * commentaire : ce sont les 1 387 tests unitaires et les 317 de bout en bout
 * qui la donnent, dont ceux qui exercent chacune des sept actions.
 */

import type { Itinerary, LonLat } from '../core/types.ts'
import {
  buildRoutingGraph,
  clefsAllerRetour,
  clefsBouclees,
  routeThrough,
  snapToNetwork,
  type RoutingGraph,
} from '../core/routing.ts'
import {
  elevationStats,
  fetchElevationProfile,
  ElevationError,
} from '../core/elevation.ts'
import { polylineLengthMeters } from '../core/sampling.ts'

/** Ce que le tracé ajoute à l'état du store. */
export interface EtatTrace {
  drawMode: boolean
  /** Clés de nœuds du graphe pour chaque étape posée. */
  drawWaypointKeys: string[]
  /** Coordonnées des étapes, pour les afficher sur la carte. */
  drawWaypoints: LonLat[]
  /** Tracé calculé qui suit les chemins entre les étapes. */
  drawPath: LonLat[]
  drawError: string | null
  /** D+ estimé du tracé en cours, null tant qu'on ne l'a pas demandé. */
  drawGainMeters: number | null
  drawGainLoading: boolean
}

/** Ce que le tracé ajoute aux actions du store. */
export interface ActionsTrace {
  toggleDrawMode: () => void
  addDrawPoint: (point: LonLat) => void
  undoDrawPoint: () => void
  /** Complète le tracé par le retour, en suivant le même chemin. */
  allerRetourTrace: () => void
  /** Referme le tracé sur son point de départ, par les chemins. */
  bouclerTrace: () => void
  /** Estime le dénivelé du tracé en cours (une seule requête, à la demande). */
  estimerDeniveleTrace: () => Promise<void>
  saveDrawnItinerary: (name: string) => Promise<void>
}

/**
 * L'état de départ, et celui auquel on revient.
 *
 * Une seule table plutôt que trois copies : `toggleDrawMode`,
 * `saveDrawnItinerary` et l'initialisation du store remettaient chacune les
 * sept champs à la main, et il a suffi d'en oublier un pour qu'un dénivelé
 * d'un tracé précédent reste affiché sous le suivant. Une remise à zéro qui
 * se recopie finit par diverger (CLAUDE.md §4).
 */
export const TRACE_VIDE: EtatTrace = {
  drawMode: false,
  drawWaypointKeys: [],
  drawWaypoints: [],
  drawPath: [],
  drawError: null,
  drawGainMeters: null,
  drawGainLoading: false,
}

/**
 * Ce que la tranche a besoin de savoir du reste du store.
 *
 * Écrit comme une liste explicite plutôt que « le store » : chaque ligne
 * ajoutée ici est une dépendance qu'on voit grandir, au lieu d'un accès
 * qu'on découvre en cherchant un défaut.
 */
export interface DependancesTrace {
  set: (partiel: Partial<EtatTrace>) => void
  /**
   * Range l'itinéraire tracé : il est enregistré, ajouté aux itinéraires
   * perso, sélectionné, **et le tracé en cours est remis à zéro — en une
   * seule mise à jour d'état**, puis le calcul de complétion est relancé.
   *
   * « En une seule » n'est pas un détail de style. En deux, l'écran passe par
   * un instant où le panneau de tracé s'est refermé et où l'itinéraire n'est
   * pas encore dans la liste. Rien ne l'interdit, mais rien ne le voulait
   * non plus, et une refonte qui change ce qu'on voit n'est plus une
   * refonte.
   */
  enregistrerLeTrace: (itineraire: Itinerary) => Promise<void>
  /**
   * Les deux listes **séparément**, et non concaténées.
   *
   * Le graphe est mémoïsé sur l'**identité** des tableaux. Une première
   * version de cette tranche demandait la liste déjà fusionnée : elle
   * fabriquait un tableau neuf à chaque appel, si bien que le mémo ne pouvait
   * plus jamais toucher et que le graphe se reconstruisait à chaque clic —
   * des dizaines de milliers de sommets sur une grosse zone.
   *
   * Rien ne l'aurait dit : la suite entière restait verte, et le tracé
   * marchait. C'est le genre de régression qu'une refonte introduit et qu'un
   * test de comportement ne voit pas ; `tests/unit/trancheTrace.test.ts`
   * compte donc les constructions.
   */
  itinerairesDuGraphe: () => { balises: Itinerary[]; perso: Itinerary[] }
  /** Prochain identifiant libre pour un itinéraire perso (ids négatifs). */
  prochainIdentifiantPerso: () => number
  etatTrace: () => EtatTrace
  /** Ferme la fiche détail, qui occupe la même zone d'écran. */
  fermerLaFiche: () => void
  ficheOuverte: () => boolean
}

export function trancheTrace(deps: DependancesTrace): ActionsTrace {
  /*
    Graphe de routage mémoïsé sur l'identité des tableaux d'itinéraires : le
    reconstruire à chaque clic de tracé serait inutilement coûteux sur une
    grosse zone (des dizaines de milliers de sommets).
  */
  let cache: {
    balises: Itinerary[]
    perso: Itinerary[]
    graph: RoutingGraph
  } | null = null

  function graphe(): RoutingGraph {
    const { balises, perso } = deps.itinerairesDuGraphe()
    if (cache && cache.balises === balises && cache.perso === perso) {
      return cache.graph
    }
    const graph = buildRoutingGraph([...balises, ...perso])
    cache = { balises, perso, graph }
    return graph
  }

  /**
   * Applique une nouvelle suite d'étapes au tracé en cours (aller-retour,
   * boucle). Si le routage échoue, on ne garde rien de la tentative : un
   * tracé à moitié modifié serait pire que pas de bouton du tout.
   */
  function appliquerClefs(
    keys: string[],
    quoi: 'aller-retour' | 'boucle',
  ): void {
    const actuelles = deps.etatTrace().drawWaypointKeys
    /*
      La garde tenait deux moitiés ; la seconde était inatteignable.

      `keys.length === actuelles.length` ne peut être vrai que si les deux
      tableaux sont le même : `clefsAllerRetour` rend soit `keys` lui-même —
      moins de deux étapes —, soit 2n−1 clés ; `clefsBouclees` rend soit
      `keys` lui-même, soit n+1. Aucune des deux ne peut fabriquer un tableau
      **différent** et de même longueur.

      La vague de mutation du 24/08 l'a montrée sans que j'aie à le prouver :
      remplacer le `ou` par un `et` survit, et supprimer la garde entière
      aussi. Une condition qui a l'air de garder quelque chose et ne garde
      rien finit par être lue comme une protection qui existe.
    */
    if (keys === actuelles) return
    const graph = graphe()
    const path = routeThrough(graph, keys)
    if (!path) {
      deps.set({
        drawError:
          quoi === 'boucle'
            ? 'Aucun chemin ne ramène au point de départ dans les tracés affichés.'
            : 'Impossible de refaire le trajet en sens inverse dans les tracés affichés.',
      })
      return
    }
    deps.set({
      drawWaypointKeys: keys,
      drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
      drawPath: path,
      drawError: null,
      drawGainMeters: null,
    })
  }

  return {
    toggleDrawMode() {
      const active = !deps.etatTrace().drawMode
      // La fiche détail occupe la même zone d'écran que le panneau de tracé.
      if (active && deps.ficheOuverte()) deps.fermerLaFiche()
      deps.set({ ...TRACE_VIDE, drawMode: active })
    },

    addDrawPoint(point) {
      if (!deps.etatTrace().drawMode) return
      const graph = graphe()
      const key = snapToNetwork(graph, point)
      if (!key) {
        deps.set({
          drawError:
            'Aucun sentier à proximité de ce point : cliquez plus près d’un tracé affiché.',
        })
        return
      }
      const keys = [...deps.etatTrace().drawWaypointKeys, key]
      const path = routeThrough(graph, keys)
      if (!path) {
        deps.set({
          drawError:
            'Impossible de relier ce point au précédent en suivant les chemins : les deux tronçons ne se rejoignent pas dans les données affichées.',
        })
        return
      }
      deps.set({
        drawWaypointKeys: keys,
        drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
        drawPath: path,
        drawError: null,
        // Le tracé a changé : le dénivelé affiché ne le décrit plus.
        drawGainMeters: null,
      })
    },

    allerRetourTrace() {
      appliquerClefs(
        clefsAllerRetour(deps.etatTrace().drawWaypointKeys),
        'aller-retour',
      )
    },

    bouclerTrace() {
      appliquerClefs(clefsBouclees(deps.etatTrace().drawWaypointKeys), 'boucle')
    },

    async estimerDeniveleTrace() {
      const { drawPath, drawGainLoading } = deps.etatTrace()
      if (drawPath.length < 2 || drawGainLoading) return
      deps.set({ drawGainLoading: true, drawError: null })
      try {
        // Une seule requête, à la fin : une par clic ferait vingt appels
        // pour un chiffre qui n'intéresse qu'au moment d'enregistrer.
        const profile = await fetchElevationProfile(drawPath)
        const stats = elevationStats(profile.elevations)
        deps.set({
          drawGainMeters: stats ? Math.round(stats.gain) : null,
          // Un service qui répond sans une seule altitude n'est pas une
          // panne, mais ce n'est pas un chiffre non plus : le dire.
          ...(stats
            ? {}
            : {
                drawError:
                  'Le relief n’est pas disponible sur ce tracé : il reste enregistrable sans son dénivelé.',
              }),
        })
      } catch (error) {
        deps.set({
          drawGainMeters: null,
          drawError:
            error instanceof ElevationError
              ? error.message
              : 'Le service altimétrique n’a pas répondu : le tracé reste enregistrable sans son dénivelé.',
        })
      } finally {
        deps.set({ drawGainLoading: false })
      }
    },

    undoDrawPoint() {
      const keys = deps.etatTrace().drawWaypointKeys.slice(0, -1)
      const graph = graphe()
      deps.set({
        drawWaypointKeys: keys,
        drawWaypoints: keys.map((k) => graph.nodes.get(k) as LonLat),
        drawPath: routeThrough(graph, keys) ?? [],
        drawError: null,
        drawGainMeters: null,
      })
    },

    async saveDrawnItinerary(name) {
      const { drawPath } = deps.etatTrace()
      if (drawPath.length < 2) return
      const id = deps.prochainIdentifiantPerso()
      const itineraire: Itinerary = {
        osmRelationId: id,
        ref: null,
        name: name.trim() || 'Itinéraire tracé',
        network: 'PERSO',
        ways: [{ osmWayId: id, coords: drawPath }],
        totalMeters: polylineLengthMeters(drawPath),
        fetchedAt: new Date().toISOString(),
      }
      await deps.enregistrerLeTrace(itineraire)
    },
  }
}
