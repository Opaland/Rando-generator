import { useEffect, useState } from 'react'
import styles from './InstallButton.module.css'

/**
 * Proposition d'installation (issue #172).
 *
 * Le manifeste était prêt et l'application installable, mais rien ne le
 * proposait : le gain de perception — une icône sur l'écran d'accueil plutôt
 * qu'un onglet — est sans commune mesure avec le coût.
 *
 * Le bouton n'apparaît que si le navigateur a effectivement proposé
 * l'installation. Pas de mode d'emploi inventé pour les navigateurs qui
 * n'émettent pas l'événement : mieux vaut ne rien dire que d'expliquer un
 * geste qu'on n'a pas pu vérifier.
 */

/** L'événement n'est pas dans les types du DOM : il n'est pas standardisé. */
interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
}

export function InstallButton() {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null)

  useEffect(() => {
    const capturer = (event: Event) => {
      // Sans preventDefault, Chrome affiche sa propre bannière au moment qui
      // lui convient — souvent le pire.
      event.preventDefault()
      setInvite(event as EvenementInstallation)
    }
    const installee = () => {
      setInvite(null)
    }
    window.addEventListener('beforeinstallprompt', capturer)
    window.addEventListener('appinstalled', installee)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturer)
      window.removeEventListener('appinstalled', installee)
    }
  }, [])

  if (!invite) return null

  return (
    <button
      type="button"
      className={styles.installer}
      data-testid="installer"
      onClick={() => {
        // L'invite ne sert qu'une fois : la retirer tout de suite évite un
        // second clic sans effet, que l'utilisateur lirait comme une panne.
        setInvite(null)
        void invite.prompt()
      }}
    >
      Installer Sentiers
    </button>
  )
}
