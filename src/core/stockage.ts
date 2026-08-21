/**
 * Persistance du stockage local (issue #169).
 *
 * `navigator.storage.persist()` n'était appelé nulle part : le stockage
 * restait « best-effort », et le navigateur s'autorisait à l'évincer.
 *
 * Le mur n'est pas la taille — des milliers de traces tiennent partout, et
 * Safari lui-même laisse environ un gigaoctet. Le risque est ailleurs :
 * Safari efface les données d'un site après **sept jours sans interaction**
 * quand la prévention du pistage est active. Quelqu'un qui marche le
 * week-end et ouvre l'application une fois par quinzaine peut retrouver son
 * historique vide sans avoir rien fait.
 */

/** Sous-ensemble de `navigator.storage`, injecté pour rester testable. */
export interface ApiStockage {
  persisted: () => Promise<boolean>
  persist: () => Promise<boolean>
  estimate: () => Promise<{ usage?: number; quota?: number }>
}

export interface EtatDuStockage {
  /** null quand le navigateur ne sait pas répondre. */
  persistant: boolean | null
  octetsUtilises: number | null
  octetsDisponibles: number | null
}

/** L'API du navigateur, ou null s'il ne la fournit pas. */
export function apiDuNavigateur(): ApiStockage | null {
  // `navigator.storage` manque encore sur quelques navigateurs, et les types
  // du DOM le déclarent pourtant toujours présent.
  const stockage = (globalThis.navigator as Navigator | undefined)?.storage as
    | Partial<ApiStockage>
    | undefined
  const { persisted, persist, estimate } = stockage ?? {}
  if (!persisted || !persist || !estimate) return null
  return {
    persisted: () => persisted.call(stockage),
    persist: () => persist.call(stockage),
    estimate: () => estimate.call(stockage),
  }
}

/**
 * État du stockage, sans jamais inventer de chiffre.
 *
 * Un navigateur sans l'API n'a pas zéro octet : il a un chiffre qu'on n'a
 * pas. Afficher « 0 octet utilisé » serait faux, et rassurant à tort.
 */
export async function etatDuStockage(
  api: ApiStockage | null,
): Promise<EtatDuStockage> {
  if (!api) {
    return { persistant: null, octetsUtilises: null, octetsDisponibles: null }
  }
  const persistant = await api.persisted().catch(() => null)
  const estimation = await api.estimate().catch(() => null)
  return {
    persistant,
    octetsUtilises: estimation?.usage ?? null,
    octetsDisponibles: estimation?.quota ?? null,
  }
}

/**
 * Demande la persistance, si elle n'est pas déjà acquise.
 *
 * Retourne null quand le navigateur ne fournit pas l'API : c'est une
 * inconnue, pas un refus, et les deux ne se disent pas de la même façon.
 *
 * Le critère d'octroi dépend de l'engagement de l'utilisateur avec le site —
 * opaque et variable d'un navigateur à l'autre. Un refus est donc un cas
 * normal, à ne pas présenter comme une anomalie.
 */
export async function demanderPersistance(
  api: ApiStockage | null,
): Promise<boolean | null> {
  if (!api) return null
  const deja = await api.persisted().catch(() => false)
  if (deja) return true
  return api.persist().catch(() => false)
}

/**
 * Le navigateur est-il un Safari (macOS ou iOS) ?
 *
 * Renifler la chaîne d'agent est une mauvaise pratique pour choisir des
 * fonctionnalités — on teste ce dont on a besoin, pas qui l'implémente.
 * C'en est une acceptable ici : ce n'est pas une capacité qu'on cherche,
 * c'est une **politique d'éviction** propre à un moteur, qu'aucune API ne
 * permet d'interroger.
 *
 * Tous les navigateurs d'iOS embarquent WebKit et héritent de la même
 * politique : Chrome (CriOS) et Firefox (FxiOS) y sont donc inclus, alors
 * qu'ils sont exclus sur les autres systèmes.
 */
export function estSafari(userAgent: string): boolean {
  if (/CriOS|FxiOS|EdgiOS/i.test(userAgent)) {
    // Sur iOS, ce sont des habillages de WebKit : même politique.
    return /iPhone|iPad|iPod/i.test(userAgent)
  }
  if (/Chrome|Chromium|Android|Edg\//i.test(userAgent)) return false
  return /Safari/i.test(userAgent)
}
