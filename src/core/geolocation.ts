/**
 * Géolocalisation : la position vient de l'API du navigateur et ne quitte
 * jamais l'appareil — elle n'est ni stockée, ni envoyée, ni journalisée.
 * Ce module ne contient que la partie pure (messages, formatage) ; l'appel
 * à `navigator.geolocation` vit dans le store.
 */

/**
 * `enableHighAccuracy` sollicite le GPS plutôt que le réseau : c'est plus
 * gourmand en batterie, mais une position à 500 m près n'a aucun intérêt
 * pour savoir si l'on est sur le bon sentier.
 */
export const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 20_000,
}

/** Codes de GeolocationPositionError (norme W3C). */
export const GEO_PERMISSION_DENIED = 1
export const GEO_POSITION_UNAVAILABLE = 2
export const GEO_TIMEOUT = 3

/** Message en français expliquant quoi faire, jamais le code brut. */
export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case GEO_PERMISSION_DENIED:
      return 'Localisation refusée. Autorisez l’accès à votre position dans les réglages du navigateur pour ce site.'
    case GEO_POSITION_UNAVAILABLE:
      return 'Position introuvable : le signal GPS est peut-être trop faible (sous couvert forestier, en gorge…).'
    case GEO_TIMEOUT:
      return 'La localisation a pris trop de temps. Réessayez à découvert.'
    default:
      return 'La localisation a échoué.'
  }
}

/** « ± 12 m » — arrondi honnête, sans fausse précision. */
export function formatAccuracy(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  const rounded = meters < 10 ? Math.round(meters) : Math.round(meters / 5) * 5
  return `± ${rounded} m`
}

/**
 * Au-delà de ce seuil, la position est trop imprécise pour situer quelqu'un
 * sur un sentier : on l'affiche quand même, mais en le signalant.
 */
export const POOR_ACCURACY_METERS = 50

export function isAccuracyPoor(meters: number): boolean {
  return !Number.isFinite(meters) || meters > POOR_ACCURACY_METERS
}
