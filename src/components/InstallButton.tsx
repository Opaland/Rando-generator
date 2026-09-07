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
 *
 * Retour terrain de Cédric, 04/09 (issue #506) : « j'ai eu une pop-up pour
 * l'installer mais je n'ai rien installé sur mon téléphone ». Trois issues
 * possibles à un clic — accepté, refusé, ou l'installation qui échoue
 * ensuite — étaient **rigoureusement indiscernables à l'écran** : le
 * bouton disparaissait dans les trois cas, sans jamais lire `userChoice`.
 * Ce n'est pas la même chose que « prompt() a réussi » : `prompt()` réussit
 * dès que la boîte de dialogue s'est affichée, que la personne accepte ou
 * non. `userChoice` est la seule source qui dit ce qu'elle a choisi.
 */

/**
 * L'événement n'est pas dans les types du DOM : il n'est pas standardisé.
 *
 * `userChoice` est optionnelle pour la même raison que `prompt` l'était
 * déjà avant elle : rien ne garantit qu'un événement `beforeinstallprompt`
 * la porte, et un usage qui suppose sa présence sans vérifier planterait
 * sur un navigateur qui ne l'implémente pas.
 */
interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Issue = 'attente' | 'installee' | 'refusee' | 'echec'

export function InstallButton() {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null)
  const [issue, setIssue] = useState<Issue>('attente')

  useEffect(() => {
    const capturer = (event: Event) => {
      // Sans preventDefault, Chrome affiche sa propre bannière au moment qui
      // lui convient — souvent le pire.
      event.preventDefault()
      // L'événement n'est pas standardisé : rien ne garantit qu'il porte la
      // méthode qu'on s'apprête à appeler. Un bouton qui échoue au clic est
      // pire que pas de bouton du tout.
      const candidat = event as Partial<EvenementInstallation>
      if (typeof candidat.prompt !== 'function') return
      setInvite(event as EvenementInstallation)
      setIssue('attente')
    }
    // Une confirmation indépendante de `userChoice` : certains navigateurs
    // émettent `appinstalled` sans que la promesse ait tenu sa part, et
    // c'est justement le cas qu'on ne veut pas laisser muet.
    const surInstallation = () => {
      setInvite(null)
      setIssue('installee')
    }
    window.addEventListener('beforeinstallprompt', capturer)
    window.addEventListener('appinstalled', surInstallation)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturer)
      window.removeEventListener('appinstalled', surInstallation)
    }
  }, [])

  if (invite) {
    return (
      <button
        type="button"
        className={styles.installer}
        data-testid="installer"
        onClick={() => {
          // L'invite ne sert qu'une fois, qu'elle réussisse ou non : la
          // retirer tout de suite évite un second clic sans effet, que la
          // personne lirait comme une panne.
          setInvite(null)
          void (async () => {
            try {
              await invite.prompt()
              // Repli silencieux si le navigateur ne porte pas `userChoice` :
              // on ne peut alors rien affirmer sur l'issue, et un message
              // inventé serait pire qu'aucun message (même principe que
              // `prompt` plus haut).
              if (typeof invite.userChoice?.then !== 'function') return
              const { outcome } = await invite.userChoice
              setIssue(outcome === 'accepted' ? 'installee' : 'refusee')
            } catch {
              setIssue('echec')
            }
          })()
        }}
      >
        Installer Sentiers
      </button>
    )
  }

  if (issue === 'installee') {
    return (
      <p className={styles.issue} role="status" data-testid="installation-confirmee">
        Sentiers est installée.
      </p>
    )
  }

  if (issue === 'refusee') {
    return (
      <p className={styles.issue} role="status" data-testid="installation-refusee">
        Installation annulée. Vous pourrez réessayer si votre navigateur
        propose à nouveau l’installation.
      </p>
    )
  }

  if (issue === 'echec') {
    return (
      <p
        className={`${styles.issue} ${styles.issueEchec}`}
        role="alert"
        data-testid="installation-echec"
      >
        L’installation a échoué. Vous pourrez réessayer si votre navigateur
        propose à nouveau l’installation.
      </p>
    )
  }

  return null
}
