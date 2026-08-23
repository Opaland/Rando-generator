import {
  MESSAGE_ARRETER,
  MESSAGE_PRECHARGER,
  MESSAGE_PROGRES,
  type ProgresTelechargement,
} from '../core/telechargement.ts'

/**
 * Ce que cette glu attend de `navigator.serviceWorker`, et rien de plus.
 *
 * Nommer le port plutôt que prendre `navigator` entier : c'est ce qui rend
 * la décision de fermeture testable sans navigateur.
 */
export interface CanalServiceWorker {
  readonly controller: { postMessage(message: unknown): void } | null
  addEventListener(
    type: 'message',
    ecouteur: (event: MessageEvent) => void,
  ): void
  removeEventListener(
    type: 'message',
    ecouteur: (event: MessageEvent) => void,
  ): void
}

interface MessageProgres {
  type?: string
  faites?: number
  total?: number
  octets?: number
  echecs?: number
  fini?: boolean
}

/**
 * Demande au service worker d'emporter une liste d'adresses (issue #153).
 *
 * Rend la fonction qui arrête ce qui court, ou `null` si personne ne peut
 * télécharger : en développement `main.tsx` n'enregistre le service worker
 * qu'en production, et sur une origine non sécurisée `navigator.serviceWorker`
 * n'existe pas du tout. Dans les deux cas le bouton doit le dire plutôt que
 * de ne rien faire.
 */
export function emporter(
  canal: CanalServiceWorker | undefined,
  urls: string[],
  surProgres: (progres: ProgresTelechargement) => void,
): (() => void) | null {
  const controleur = canal?.controller
  if (!canal || !controleur) return null

  let branche = true
  const debrancher = () => {
    if (!branche) return
    branche = false
    canal.removeEventListener('message', surMessage)
  }

  function surMessage(event: MessageEvent) {
    const donnees = event.data as MessageProgres
    if (donnees.type !== MESSAGE_PROGRES) return
    const progres: ProgresTelechargement = {
      faites: donnees.faites ?? 0,
      total: donnees.total ?? 0,
      octets: donnees.octets ?? 0,
      echecs: donnees.echecs ?? 0,
      fini: donnees.fini === true,
    }
    if (progres.fini) debrancher()
    surProgres(progres)
  }

  canal.addEventListener('message', surMessage)
  controleur.postMessage({ type: MESSAGE_PRECHARGER, urls })

  let arrete = false
  return () => {
    if (arrete) return
    arrete = true
    controleur.postMessage({ type: MESSAGE_ARRETER })
    debrancher()
  }
}
