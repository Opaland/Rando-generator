import { useEffect, useReducer } from 'react'
import {
  CONNECTIVITY_MESSAGE,
  initialConnectivity,
  isOffline,
  reduceConnectivity,
} from '../core/connectivity.ts'
import styles from './OfflineBanner.module.css'

/** Au-delà, on considère que le service worker ne répondra pas. */
const REPONSE_SW_MS = 3_000

interface ConnectivityMessage {
  type?: string
  cacheFallback?: boolean
}

/**
 * Demande au service worker s'il a servi l'application depuis le cache faute
 * de réseau. C'est le seul moyen de le savoir quand la coupure précède le
 * chargement de la page : `navigator.onLine` reste alors optimiste et aucun
 * événement `offline` n'est émis.
 */
function demanderAuServiceWorker(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const controleur = navigator.serviceWorker.controller
    if (!controleur) {
      resolve(false)
      return
    }
    const canal = new MessageChannel()
    const minuteur = setTimeout(() => {
      canal.port1.close()
      resolve(false)
    }, REPONSE_SW_MS)
    canal.port1.onmessage = (event: MessageEvent<ConnectivityMessage>) => {
      clearTimeout(minuteur)
      resolve(event.data.cacheFallback === true)
    }
    controleur.postMessage({ type: CONNECTIVITY_MESSAGE }, [canal.port2])
  })
}

/**
 * Bandeau affiché sans connexion. Il dit précisément ce qui reste possible
 * et ce qui ne l'est pas : promettre un « mode hors-ligne » complet alors
 * que charger une zone reste impossible serait trompeur, et se paierait au
 * mauvais moment — en pleine forêt.
 */
export function OfflineBanner() {
  const [etat, dispatch] = useReducer(
    reduceConnectivity,
    navigator.onLine,
    initialConnectivity,
  )

  useEffect(() => {
    const enLigne = () => {
      dispatch('online')
    }
    const horsLigne = () => {
      dispatch('offline')
    }
    window.addEventListener('online', enLigne)
    window.addEventListener('offline', horsLigne)

    const surMessage = (event: MessageEvent<ConnectivityMessage>) => {
      if (
        event.data.type === CONNECTIVITY_MESSAGE &&
        event.data.cacheFallback === true
      ) {
        dispatch('cache-fallback')
      }
    }
    navigator.serviceWorker.addEventListener('message', surMessage)

    let vivant = true
    void demanderAuServiceWorker().then((secours) => {
      if (secours && vivant) dispatch('cache-fallback')
    })

    return () => {
      vivant = false
      window.removeEventListener('online', enLigne)
      window.removeEventListener('offline', horsLigne)
      navigator.serviceWorker.removeEventListener('message', surMessage)
    }
  }, [])

  if (!isOffline(etat)) return null

  return (
    <p className={styles.banner} role="status" data-testid="offline-banner">
      <strong>Hors connexion.</strong> Vos traces, vos itinéraires, les fonds
      de carte déjà consultés et les randonnées que vous avez emportées
      restent disponibles. Charger une nouvelle zone demandera du réseau — de
      même que le relief et les points d’intérêt d’une randonnée que vous
      n’avez pas emportée.
    </p>
  )
}
