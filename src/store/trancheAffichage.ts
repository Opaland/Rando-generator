import type { ModeAffichage } from '../core/affichage.ts'

/**
 * Les réglages d'écran, sortis du store (issue #155, septième tranche).
 *
 * Quatre préférences qui n'ont rien à voir avec les données : le registre
 * d'affichage, le gros texte, le guide de premier lancement et le repli du
 * panneau. Aucune ne touche aux itinéraires, aux traces ni au matching ;
 * toutes se persistent de la même façon, par `enregistrerReglage`.
 *
 * ## Ce que ce découpage n'est pas
 *
 * Ce n'est pas la même chose que `reseauxVisibles`, qui est aussi un réglage
 * d'écran. Celui-là **ne survit pas au rechargement** et vit donc dans son
 * propre magasin, sans base. Ceux-ci se persistent, et leur reprise au
 * démarrage a une règle à elle (`repriseAuDemarrage`) — c'est ce qui les
 * garde ici, du côté du store qui lit la base.
 */

/** Ce que les réglages d'écran ajoutent à l'état. */
export interface EtatAffichage {
  /**
   * Registre d'affichage (issue #173). Deux modes, mêmes données, même
   * calcul : le mode simple cache, il n'enlève pas.
   */
  modeAffichage: ModeAffichage
  /** Tout agrandi et contrasté, y compris les libellés portés par la carte. */
  grosTexte: boolean
  /**
   * Le guide de premier lancement a-t-il été fermé ?
   *
   * Persisté, parce que la plainte porte précisément sur « quand on ouvre
   * l'appli » : un guide qui revient à chaque rechargement n'a pas été fermé,
   * il a été repoussé. Ce qui le rouvre est le rappel de `rappelGuideVisible`.
   */
  guideFerme: boolean
  /**
   * Le panneau latéral a-t-il été replié ?
   *
   * Sur téléphone la feuille avait déjà trois positions ; au-dessus de
   * 800 px la colonne était définitive et prenait 390 px de carte sans
   * qu'aucun geste puisse la rendre. Persisté pour la même raison que
   * ci-dessus.
   */
  panneauReplie: boolean
}

/** Ce que les réglages d'écran ajoutent aux actions. */
export interface ActionsAffichage {
  setModeAffichage: (mode: ModeAffichage) => Promise<void>
  setGrosTexte: (actif: boolean) => Promise<void>
  setGuideFerme: (ferme: boolean) => Promise<void>
  setPanneauReplie: (replie: boolean) => Promise<void>
}

/** L'état de départ, avant toute lecture de la base. */
export const AFFICHAGE_PAR_DEFAUT: EtatAffichage = {
  modeAffichage: 'complet',
  grosTexte: false,
  guideFerme: false,
  panneauReplie: false,
}

export interface DependancesAffichage {
  set: (partiel: Partial<EtatAffichage>) => void
  /** Écrit le réglage puis l'applique — voir `reglagesPersistants.ts`. */
  enregistrerReglage: (
    clef: 'modeAffichage' | 'grosTexte' | 'guideFerme' | 'panneauReplie',
    valeur: string | number,
    appliquer: () => void,
  ) => Promise<void>
}

export function trancheAffichage(
  deps: DependancesAffichage,
): ActionsAffichage {
  /*
    Les trois drapeaux s'écrivent en 0/1 et non en booléen : le magasin des
    réglages ne stocke que des nombres et des chaînes, et `lireDrapeau`
    n'accepte que `1` à la relecture. La conversion est ici, une fois, plutôt
    qu'à chaque appelant.
  */
  const drapeau = (clef: 'grosTexte' | 'guideFerme' | 'panneauReplie') =>
    async function poser(actif: boolean): Promise<void> {
      await deps.enregistrerReglage(clef, actif ? 1 : 0, () => {
        deps.set({ [clef]: actif })
      })
    }

  return {
    async setModeAffichage(mode) {
      await deps.enregistrerReglage('modeAffichage', mode, () => {
        deps.set({ modeAffichage: mode })
      })
    },
    setGrosTexte: drapeau('grosTexte'),
    setGuideFerme: drapeau('guideFerme'),
    setPanneauReplie: drapeau('panneauReplie'),
  }
}
