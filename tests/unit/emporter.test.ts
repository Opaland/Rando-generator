import { describe, it, expect, vi } from 'vitest'
import {
  MESSAGE_ARRETER,
  MESSAGE_PRECHARGER,
  MESSAGE_PROGRES,
  type ProgresTelechargement,
} from '../../src/core/telechargement.ts'
import { emporter, type CanalServiceWorker } from '../../src/lib/emporter.ts'

/**
 * La glu entre le bouton et le service worker (issue #153).
 *
 * Elle tient dans trente lignes et mérite pourtant ses propres tests : c'est
 * elle qui décide ce qui arrive quand on ferme la fiche au milieu d'un
 * téléchargement, et ce genre de décision ne se relit pas dans un composant.
 */

interface Faux extends CanalServiceWorker {
  envoyes: unknown[]
  emettre(donnees: unknown): void
  ecouteurs: number
}

function fauxCanal(avecControleur = true): Faux {
  const ecouteurs = new Set<(event: MessageEvent) => void>()
  const envoyes: unknown[] = []
  return {
    controller: avecControleur
      ? {
          postMessage(message: unknown) {
            envoyes.push(message)
          },
        }
      : null,
    addEventListener(_type, ecouteur) {
      ecouteurs.add(ecouteur)
    },
    removeEventListener(_type, ecouteur) {
      ecouteurs.delete(ecouteur)
    },
    envoyes,
    emettre(donnees) {
      for (const ecouteur of [...ecouteurs]) {
        ecouteur({ data: donnees } as MessageEvent)
      }
    },
    get ecouteurs() {
      return ecouteurs.size
    },
  }
}

const PAS: ProgresTelechargement = {
  faites: 1,
  total: 3,
  octets: 1_000,
  echecs: 0,
  fini: false,
}

describe('emporter', () => {
  it('demande le préchargement de la liste, telle quelle', () => {
    const canal = fauxCanal()
    emporter(canal, ['https://a.test/1.png', 'https://a.test/2.png'], vi.fn())
    expect(canal.envoyes).toEqual([
      {
        type: MESSAGE_PRECHARGER,
        urls: ['https://a.test/1.png', 'https://a.test/2.png'],
      },
    ])
  })

  it('transmet chaque compte rendu', () => {
    const canal = fauxCanal()
    const surProgres = vi.fn()
    emporter(canal, ['https://a.test/1.png'], surProgres)
    canal.emettre({ type: MESSAGE_PROGRES, ...PAS })
    expect(surProgres).toHaveBeenCalledWith(PAS)
  })

  it('ignore les messages qui ne le concernent pas', () => {
    const canal = fauxCanal()
    const surProgres = vi.fn()
    emporter(canal, ['https://a.test/1.png'], surProgres)
    canal.emettre({ type: 'sentiers:connectivity', cacheFallback: true })
    expect(surProgres).not.toHaveBeenCalled()
  })

  /**
   * Sans cela, ouvrir dix fiches laisse dix écouteurs branchés sur le
   * service worker, et le onzième téléchargement rend compte onze fois.
   */
  it('se débranche quand le service worker a fini', () => {
    const canal = fauxCanal()
    emporter(canal, ['https://a.test/1.png'], vi.fn())
    expect(canal.ecouteurs).toBe(1)
    canal.emettre({ type: MESSAGE_PROGRES, ...PAS, faites: 1, fini: true })
    expect(canal.ecouteurs).toBe(0)
  })

  /**
   * Fermer la fiche arrête le téléchargement. C'est un choix, et il se
   * défend : une randonnée de 200 km demande des milliers de tuiles, et rien
   * ne doit continuer à marteler la Géoplateforme derrière un écran qu'on a
   * quitté. Le service worker rendra un dernier compte, qui débranchera.
   */
  it('arrête ce qui court quand on referme', () => {
    const canal = fauxCanal()
    const arreter = emporter(canal, ['https://a.test/1.png'], vi.fn())
    expect(arreter).not.toBeNull()
    arreter?.()
    expect(canal.envoyes.at(-1)).toEqual({ type: MESSAGE_ARRETER })
  })

  it('ne réclame pas deux fois l’arrêt', () => {
    const canal = fauxCanal()
    const arreter = emporter(canal, ['https://a.test/1.png'], vi.fn())
    arreter?.()
    arreter?.()
    const arrets = canal.envoyes.filter(
      (m) => (m as { type?: string }).type === MESSAGE_ARRETER,
    )
    expect(arrets).toHaveLength(1)
  })

  /**
   * En développement, `main.tsx` n'enregistre le service worker qu'en
   * production : il n'y a alors personne pour télécharger. Le dire par un
   * `null` plutôt que par un bouton qui ne fait rien.
   */
  it('rend null quand aucun service worker ne contrôle la page', () => {
    const canal = fauxCanal(false)
    const surProgres = vi.fn()
    expect(emporter(canal, ['https://a.test/1.png'], surProgres)).toBeNull()
    expect(canal.ecouteurs).toBe(0)
  })

  /**
   * `navigator.serviceWorker` n'existe pas sur une origine non sécurisée —
   * un `http://` en réseau local, par exemple. Sans cette garde, le clic
   * lèverait une exception au lieu d'afficher une phrase.
   */
  it('rend null quand le navigateur n’a pas de service worker du tout', () => {
    expect(emporter(undefined, ['https://a.test/1.png'], vi.fn())).toBeNull()
  })
})
