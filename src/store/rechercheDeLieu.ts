/**
 * Chercher une commune par son nom, sorti de la tranche de zone (#454, #445).
 *
 * ## Pourquoi ce fichier existe
 *
 * `trancheZone.ts` était à trois lignes de son plafond (537 pour 540), et le
 * correctif de #454 en demandait huit de plus. C'est exactement la situation
 * que #445 annonçait : « un garde-fou qui ne laisse plus de marge devient un
 * mur, et le prochain correctif réel sera arbitré dans l'urgence ». Le
 * message du plafond nomme les deux réponses honnêtes — sortir une tranche,
 * ou relever le plafond en disant pourquoi ces lignes ont leur place là. Ici
 * la première s'imposait : **la recherche de lieu n'est pas de la logique de
 * zone.** Elle interroge un géocodeur, possède quatre champs d'état et son
 * propre compteur de course, et ne partage rien avec Overpass.
 *
 * Raboter un commentaire pour tenir sous la limite aurait été la troisième
 * réponse, celle que le §2 et #445 interdisent tous les deux.
 *
 * ## Le défaut que la sortie permet de fermer
 *
 * La remise à zéro de la recherche était écrite **quatre fois** dans
 * `trancheZone.ts`, et trois de ces écritures n'incrémentaient pas
 * `lieuSequence`. Or c'est le compteur, et lui seul, qui décide si une
 * réponse encore en vol a le droit de s'afficher : vider le champ ou choisir
 * un lieu laissait donc la liste des propositions se rouvrir toute seule
 * quelques centaines de millisecondes plus tard, par-dessus la zone qu'on
 * venait de demander. Mesuré sur les deux chemins (#454).
 *
 * `RECHERCHE_AU_REPOS` porte la table une fois, et `effacerLieux` fait le
 * geste entier. Le §4 le dit sans détour : une condition consultée par
 * plusieurs actions devient une fonction nommée.
 */
import { chercherLieux, GeocodeError, type Lieu } from '../core/geocode.ts'

/** Ce que la recherche de lieu ajoute à l'état du store. */
export interface EtatRecherche {
  lieux: Lieu[]
  lieuxLoading: boolean
  lieuError: string | null
  /**
   * Vrai quand la dernière recherche n'a rien trouvé — différent de « pas
   * encore cherché », que la liste vide ne distingue pas.
   */
  lieuxVides: boolean
}

/**
 * La recherche au repos : aucune proposition, aucune erreur, rien en cours.
 *
 * Une seule table plutôt que quatre écritures à la main — c'est la moitié du
 * correctif de #454, l'autre étant que `effacerLieux` fasse aussi avancer le
 * compteur.
 */
export const RECHERCHE_AU_REPOS: EtatRecherche = {
  lieux: [],
  lieuxLoading: false,
  lieuError: null,
  lieuxVides: false,
}

export interface DependancesRecherche {
  set: (partiel: Partial<EtatRecherche>) => void
}

export interface ActionsRecherche {
  /** Cherche des communes par nom (API Adresse de la BAN). */
  chercherLieu: (query: string) => Promise<void>
  /**
   * Referme la liste des propositions, et **invalide ce qui est en vol**.
   *
   * Les deux moitiés comptent : sans l'incrément, une réponse partie avant
   * le geste revient s'afficher après lui (#454).
   */
  effacerLieux: () => void
}

export function trancheRecherche(
  deps: DependancesRecherche,
): ActionsRecherche {
  /*
    Un compteur de closure, jamais un champ d'état : il ne se peint pas, et
    le mettre dans le store ferait repeindre l'application à chaque frappe.
  */
  let lieuSequence = 0

  function effacerLieux(): void {
    lieuSequence += 1
    deps.set({ ...RECHERCHE_AU_REPOS })
  }

  return {
    effacerLieux,

    async chercherLieu(query) {
      const terme = query.trim()
      if (terme === '') {
        effacerLieux()
        return
      }
      const sequence = ++lieuSequence
      deps.set({ lieuxLoading: true, lieuError: null, lieuxVides: false })
      try {
        const lieux = await chercherLieux(terme)
        // Une recherche plus récente a pris le relais : ses résultats sont
        // ceux que l'utilisateur attend, pas ceux d'une frappe abandonnée.
        if (sequence !== lieuSequence) return
        deps.set({ lieux, lieuxVides: lieux.length === 0 })
      } catch (error) {
        if (sequence !== lieuSequence) return
        deps.set({
          lieux: [],
          lieuError:
            error instanceof GeocodeError
              ? error.message
              : 'La recherche de lieu n’a pas abouti. Choisissez une zone dans la liste.',
        })
      } finally {
        if (sequence === lieuSequence) deps.set({ lieuxLoading: false })
      }
    },
  }
}
