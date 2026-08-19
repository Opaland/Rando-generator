/**
 * État de connexion de l'application.
 *
 * `navigator.onLine` ne répond pas à la question « ai-je du réseau ? » mais à
 * « une interface réseau existe-t-elle ? ». Il est notoirement optimiste, et
 * il l'est particulièrement au pire moment pour nous : quand la page vient
 * d'être servie depuis le cache du service worker faute de réseau, il peut
 * encore valoir `true` au montage, et aucun événement `offline` ne suivra —
 * la coupure est antérieure au chargement.
 *
 * On croise donc deux signaux : la déclaration du navigateur, et le constat
 * du service worker (une requête de l'application a échoué et a dû être
 * servie depuis le cache). Le second est une preuve, pas une opinion.
 */

/** Type du message échangé avec le service worker (recopié dans public/sw.js). */
export const CONNECTIVITY_MESSAGE = 'sentiers:connectivity'

export interface ConnectivityState {
  /** Ce que déclare `navigator.onLine`. */
  navigatorOnline: boolean
  /** Le service worker a servi l'application depuis le cache, réseau absent. */
  cacheFallback: boolean
}

export type ConnectivityEvent = 'online' | 'offline' | 'cache-fallback'

export function initialConnectivity(navigatorOnline: boolean): ConnectivityState {
  return { navigatorOnline, cacheFallback: false }
}

export function isOffline(state: ConnectivityState): boolean {
  return !state.navigatorOnline || state.cacheFallback
}

/**
 * Applique un événement. Retourne l'état précédent à l'identique quand rien
 * ne change, pour que React puisse court-circuiter le rendu.
 */
export function reduceConnectivity(
  state: ConnectivityState,
  event: ConnectivityEvent,
): ConnectivityState {
  switch (event) {
    case 'online':
      // Le retour du réseau invalide le constat du service worker : le repli
      // sur cache datait d'avant, le garder afficherait un bandeau mensonger.
      if (state.navigatorOnline && !state.cacheFallback) return state
      return { navigatorOnline: true, cacheFallback: false }
    case 'offline':
      if (!state.navigatorOnline) return state
      return { ...state, navigatorOnline: false }
    case 'cache-fallback':
      if (state.cacheFallback) return state
      return { ...state, cacheFallback: true }
  }
}
