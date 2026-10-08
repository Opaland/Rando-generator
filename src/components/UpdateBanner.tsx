import { useEffect, useState } from 'react'
import styles from './UpdateBanner.module.css'

/**
 * Bandeau « nouvelle version disponible ».
 *
 * `public/sw.js` appelle déjà `skipWaiting()` à l'installation et
 * `clients.claim()` à l'activation : un service worker neuf prend le
 * contrôle de la page sans attendre que tous les onglets se ferment. Mais
 * le code déjà chargé en mémoire ne change pas pour autant — seul un
 * rechargement l'obtient. Sans ce bandeau, une PWA ouverte depuis son icône
 * (une reprise d'onglet, jamais une nouvelle navigation) pouvait tourner des
 * semaines sur une version périmée sans que rien ne le dise — signalé en
 * usage réel le 29/09, en pleine randonnée.
 *
 * Recharger est **laissé au geste**, jamais automatique : la même page peut
 * avoir un enregistrement en cours, et le couper sans demander serait le
 * genre de surprise que ce produit évite partout ailleurs. Rien n'est perdu
 * pour autant si on recharge quand même — une sortie non terminée se
 * retrouve en pause au redémarrage, exactement comme après un onglet tué.
 */
export function UpdateBanner() {
  const [disponible, setDisponible] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    /*
      `controllerchange` se déclenche aussi à la toute première activation
      d'un service worker — le passage de `null` à un contrôleur, sur une
      page qui vient de s'ouvrir. Ce n'est pas une mise à jour : seul un
      changement qui **succède** à un contrôleur déjà présent au montage en
      est une. Sans cette garde, le bandeau s'afficherait à chaque premier
      chargement.
    */
    const avaitDejaUnControleur = navigator.serviceWorker.controller !== null

    const surChangement = () => {
      if (avaitDejaUnControleur) setDisponible(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', surChangement)
    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        surChangement,
      )
    }
  }, [])

  if (!disponible) return null

  return (
    <div className={styles.bandeau} role="status" data-testid="update-banner">
      <p className={styles.texte}>
        <strong>Nouvelle version disponible.</strong> Vos données restent
        intactes, y compris un enregistrement en cours.
      </p>
      <button
        type="button"
        className={styles.recharger}
        data-testid="update-reload"
        onClick={() => {
          window.location.reload()
        }}
      >
        Recharger
      </button>
    </div>
  )
}
