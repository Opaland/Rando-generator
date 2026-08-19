import { useEffect, useState } from 'react'
import styles from './OfflineBanner.module.css'

/**
 * Bandeau affiché sans connexion. Il dit précisément ce qui reste possible
 * et ce qui ne l'est pas : promettre un « mode hors-ligne » complet alors
 * que charger une zone reste impossible serait trompeur, et se paierait au
 * mauvais moment — en pleine forêt.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const majuscule = () => {
      setOffline(!navigator.onLine)
    }
    majuscule()
    window.addEventListener('online', majuscule)
    window.addEventListener('offline', majuscule)
    return () => {
      window.removeEventListener('online', majuscule)
      window.removeEventListener('offline', majuscule)
    }
  }, [])

  if (!offline) return null

  return (
    <p className={styles.banner} role="status" data-testid="offline-banner">
      <strong>Hors connexion.</strong> Vos traces, vos itinéraires et les
      fonds de carte déjà consultés restent disponibles. Charger une nouvelle
      zone, le relief ou les points d’intérêt demandera du réseau.
    </p>
  )
}
