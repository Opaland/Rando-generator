import { create } from 'zustand'

/**
 * La clé d'API Anthropic de l'utilisateur (issue #673).
 *
 * Sentiers est un site statique : une clé embarquée serait publique. Chacun
 * colle donc la sienne, et elle ne va **que** chez Anthropic.
 *
 * - **En mémoire par défaut**, pour l'onglet : fermer l'onglet l'oublie.
 * - **Sur l'appareil seulement si l'utilisateur le demande**, sous un nom à
 *   part — `sentiers.claude.cle`, hors du préfixe `sentiers.reglage.` : ni la
 *   sauvegarde ni l'oubli des réglages ne la lisent, et elle ne voyage dans
 *   aucun fichier.
 * - Le risque d'une clé gardée est dit à côté de la case : l'origine
 *   `opaland.github.io` est partagée par tous les sites du compte, qui
 *   peuvent lire le même stockage (apprentissage A1 du dépôt Netatmo).
 */
export const CLEF_STOCKAGE = 'sentiers.claude.cle'

function stockage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

function lireGardee(): string | null {
  try {
    const valeur = stockage()?.getItem(CLEF_STOCKAGE) ?? null
    return valeur && valeur.trim() ? valeur.trim() : null
  } catch {
    return null
  }
}

interface EtatCleClaude {
  cle: string | null
  gardee: boolean
  /** Pose la clé ; `garder` l'écrit aussi sur l'appareil, sinon l'en retire. */
  poser: (cle: string, garder: boolean) => void
  /** Oublie la clé, en mémoire et sur l'appareil. */
  oublier: () => void
}

export const useCleClaude = create<EtatCleClaude>((set) => {
  const gardee = lireGardee()
  return {
    cle: gardee,
    gardee: gardee !== null,
    poser: (cle, garder) => {
      const propre = cle.trim()
      if (!propre) return
      try {
        if (garder) stockage()?.setItem(CLEF_STOCKAGE, propre)
        else stockage()?.removeItem(CLEF_STOCKAGE)
      } catch {
        // Stockage refusé (navigation privée, quota) : la clé reste en
        // mémoire, et l'interface ne prétend pas l'avoir gardée.
        set({ cle: propre, gardee: false })
        return
      }
      set({ cle: propre, gardee: garder })
    },
    oublier: () => {
      try {
        stockage()?.removeItem(CLEF_STOCKAGE)
      } catch {
        // Rien à faire de plus : la mémoire est vidée ci-dessous.
      }
      set({ cle: null, gardee: false })
    },
  }
})
