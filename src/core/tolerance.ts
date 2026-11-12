import { DEFAULT_TOLERANCE_METERS } from './types.ts'

/**
 * Trois choix nommés à la place d'un curseur en mètres (issue #174).
 *
 * Pour régler « Précision de suivi GPS : 25–100 m », il fallait savoir ce
 * qu'est une tolérance de correspondance, avoir une intuition de ce que
 * valent 25 m contre 75 m sur le terrain, et viser un curseur fin. Trois
 * conditions dont aucune n'est acquise.
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il n'invente pas trois nouvelles valeurs. Les bornes actuelles et le
 * défaut ont été choisis sans mesure, et poser trois crans au jugé
 * reproduirait le même arbitraire **avec l'assurance en plus** : un nombre
 * caché derrière un mot rassurant est plus difficile à remettre en cause
 * qu'un nombre affiché.
 *
 * Les trois crans sont donc exactement le minimum, le défaut et le maximum
 * que le produit livre déjà. Cette PR nomme ce qui existe ; elle ne prétend
 * pas l'avoir validé.
 *
 * Ce qu'il faudrait pour trancher : des traces réelles, de plusieurs
 * appareils, pour vérifier que « Normal » convient à la majorité et que
 * « Précis » n'ampute pas les GPS ordinaires.
 */

export type NiveauTolerance = 'precis' | 'normal' | 'souple'

interface Niveau {
  id: NiveauTolerance
  libelle: string
  /** Ce que le choix change sur le terrain, pas dans l'algorithme. */
  explication: string
  metres: number
}

export const NIVEAUX_TOLERANCE: readonly Niveau[] = [
  {
    id: 'precis',
    libelle: 'Précis',
    explication:
      'Ne compte un sentier que si vous l’avez suivi de près. À réserver aux GPS fiables, en terrain dégagé.',
    metres: 25,
  },
  {
    id: 'normal',
    libelle: 'Normal',
    explication:
      'Le réglage de départ. Convient à la plupart des montres et des téléphones, sur la plupart des sorties.',
    metres: 50,
  },
  {
    id: 'souple',
    libelle: 'Souple',
    explication:
      'Compte un sentier même si votre trace s’en écarte beaucoup. Utile sous les arbres, en forêt dense ou en fond de vallée.',
    metres: 100,
  },
]

/** Distance en mètres derrière un cran nommé. */
export function metresDuNiveau(niveau: NiveauTolerance): number {
  const trouve = NIVEAUX_TOLERANCE.find((n) => n.id === niveau)
  // Le type garantit l'existence ; ce repli n'existe que pour ne jamais
  // rendre undefined à un appelant qui calcule avec.
  return trouve?.metres ?? 50
}

/**
 * Cran correspondant à une distance, ou null s'il n'y en a pas.
 *
 * Une sauvegarde d'avant cette issue, ou un réglage fin fait au curseur,
 * peut valoir 37 m. L'afficher comme « Précis » mentirait sur ce qui est
 * réellement réglé — mieux vaut dire « personnalisé » et montrer le nombre.
 */
export function niveauDesMetres(metres: number): NiveauTolerance | null {
  return NIVEAUX_TOLERANCE.find((n) => n.metres === metres)?.id ?? null
}

/**
 * Les bornes du réglage : le cran le plus serré et le plus souple. Aucun
 * nombre neuf — 25 et 100 m, que `appStore.ts` écrivait en dur
 * (`MIN_TOLERANCE`, `MAX_TOLERANCE`) à côté des crans qui les disaient déjà.
 */
export const TOLERANCE_MIN = Math.min(...NIVEAUX_TOLERANCE.map((n) => n.metres))
export const TOLERANCE_MAX = Math.max(...NIVEAUX_TOLERANCE.map((n) => n.metres))

/**
 * La tolérance relue de la base au démarrage (#670).
 *
 * Elle était reprise telle quelle dès qu'elle était un nombre : `NaN`,
 * `-5` ou `1e308` écrits par une version future ou une base abîmée
 * devenaient la tolérance du calcul de complétion, hors de la plage que
 * le réglage permet. Un nombre non fini rend le défaut ; un nombre hors
 * plage est ramené à la borne. `setTolerance` passe aussi par elle, à l'écriture.
 */
export function lireTolerance(brut: unknown): number {
  if (typeof brut !== 'number' || !Number.isFinite(brut)) return DEFAULT_TOLERANCE_METERS
  return Math.min(TOLERANCE_MAX, Math.max(TOLERANCE_MIN, brut))
}
