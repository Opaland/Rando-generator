import { create } from 'zustand'
import type { Network } from '../core/types.ts'
import { reseauxVisiblesParDefaut } from '../core/lisibilite.ts'
import { RESEAUX_FILTRABLES } from '../core/reseaux.ts'

/**
 * Quels réseaux sont montrés — un seul état, deux lecteurs (#322).
 *
 * ## Pourquoi un store, et pas un `useState` dans la liste
 *
 * Le choix vivait dans `ItineraryList`, et il ne concernait que la liste.
 * Tant que tout était affiché par défaut, la carte et la liste ne pouvaient
 * pas se contredire. Dès qu'un réseau est replié, elles le peuvent : une
 * ligne rendue à la liste sans être rendue à la carte devient un itinéraire
 * cliquable dont le tracé n'apparaît nulle part — un défaut qu'on ne
 * comprend qu'après avoir cherché dix minutes.
 *
 * Le §4 dit de nommer une condition consultée par plusieurs endroits ; ici
 * ce n'est pas seulement la condition qui doit être partagée, c'est la
 * **réponse**. Un état, donc.
 *
 * ## Pourquoi un store à part, et pas `appStore`
 *
 * L'issue #155 mesure `appStore.ts` et refuse qu'il regrossisse. Ce
 * réglage-là n'a rien à voir avec les données : il ne se persiste pas, il ne
 * se sauvegarde pas, il ne survit pas au rechargement — c'est un réglage
 * d'écran, au même titre que le tri de la liste. Le loger dans le store des
 * données l'aurait mêlé à ce qui se relit d'IndexedDB.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne touche à **aucun comptage**. Le tableau de bord, les pourcentages de
 * complétion et le matching continuent de porter sur tous les itinéraires
 * chargés : replier un GR change ce qu'on voit, jamais ce qui est mesuré.
 * Un test le dit, parce que c'est le genre d'effet de bord qu'un filtre
 * d'affichage attrape sans qu'on l'ait voulu.
 */
export interface EtatReseauxVisibles {
  /** Les réseaux montrés, dans l'ordre de la charte. */
  reseauxVisibles: readonly Network[]
  /** Montre ou replie un réseau. */
  basculerReseau: (reseau: Network) => void
  /** Rend tout ce qui était replié — le geste que la ligne d'annonce offre. */
  afficherTousLesReseaux: () => void
}

export const useReseauxVisibles = create<EtatReseauxVisibles>((set) => ({
  reseauxVisibles: reseauxVisiblesParDefaut(),
  basculerReseau: (reseau) => {
    set((etat) => ({
      /*
        On reconstruit depuis l'ordre de la charte plutôt que d'ajouter en
        queue : sans cela, un réseau rendu après avoir été replié se
        retrouverait en dernier, et les cases à cocher changeraient d'ordre
        sous le doigt.
      */
      reseauxVisibles: etat.reseauxVisibles.includes(reseau)
        ? etat.reseauxVisibles.filter((r) => r !== reseau)
        : ordonner([...etat.reseauxVisibles, reseau]),
    }))
  },
  afficherTousLesReseaux: () => {
    set({ reseauxVisibles: [...RESEAUX_FILTRABLES] })
  },
}))

function ordonner(reseaux: readonly Network[]): Network[] {
  return RESEAUX_FILTRABLES.filter((r) => reseaux.includes(r))
}
