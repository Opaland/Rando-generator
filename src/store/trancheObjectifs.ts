import { resumeObjectif, type ResumeObjectif } from '../core/objectifs.ts'
import { STEP_METERS, type Itinerary } from '../core/types.ts'
import type { MatchResult } from '../core/matching.ts'

/**
 * Les objectifs épinglés (issue #13), sortis du store (revue technique du
 * 30/09 — anticiper une extraction avant que le plafond d'`appStore.ts` ne
 * casse, plutôt que la faire sous la pression d'une fonctionnalité).
 *
 * Un objectif n'est qu'un identifiant qu'on bascule et qu'on persiste ; ce
 * qu'il reste à marcher — `resumeObjectif`, dans `core/objectifs.ts` — se
 * calcule à la demande depuis les échantillons du matching, jamais stocké.
 */

export interface EtatObjectifs {
  /**
   * Itinéraires épinglés comme objectifs. Le tableau de bord constate ; un
   * objectif dit par où continuer.
   */
  objectifs: number[]
}

export interface ActionsObjectifs {
  /** Épingle (ou dépingle) un itinéraire comme objectif. */
  basculerObjectif: (id: number) => Promise<void>
  /** Ce qu'il reste sur un objectif : mètres, pourcentage, tronçons. */
  resumeDeLObjectif: (id: number) => ResumeObjectif | null
}

export const OBJECTIFS_AU_REPOS: EtatObjectifs = { objectifs: [] }

/**
 * Relit la liste depuis la base. Stockée en JSON parce que le magasin de
 * réglages ne connaît que des nombres et des chaînes ; un contenu abîmé ne
 * doit pas empêcher l'application de démarrer.
 */
export function lireObjectifs(brut: number | string | undefined): number[] {
  if (typeof brut !== 'string') return []
  try {
    const lu: unknown = JSON.parse(brut)
    return Array.isArray(lu) ? lu.filter((id) => typeof id === 'number') : []
  } catch {
    return []
  }
}

export interface DependancesObjectifs {
  lire: () => {
    objectifs: number[]
    matching: MatchResult | null
    itineraries: Itinerary[]
    customItineraries: Itinerary[]
  }
  set: (partiel: { objectifs: number[] }) => void
  /** Écrit le réglage puis l'applique — voir `reglagesPersistants.ts`. */
  enregistrerReglage: (
    clef: 'objectifs',
    valeur: string,
    appliquer: () => void,
  ) => Promise<void>
}

export function trancheObjectifs(
  deps: DependancesObjectifs,
): ActionsObjectifs {
  return {
    async basculerObjectif(id) {
      const actuels = deps.lire().objectifs
      const objectifs = actuels.includes(id)
        ? actuels.filter((autre) => autre !== id)
        : [...actuels, id]
      await deps.enregistrerReglage(
        'objectifs',
        JSON.stringify(objectifs),
        () => {
          deps.set({ objectifs })
        },
      )
    },

    resumeDeLObjectif(id) {
      const { matching, itineraries, customItineraries } = deps.lire()
      const itineraire = [...itineraries, ...customItineraries].find(
        (i) => i.osmRelationId === id,
      )
      if (!itineraire || !matching) return null
      return resumeObjectif(itineraire, matching.samples, STEP_METERS)
    },
  }
}
