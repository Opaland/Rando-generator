import { construireDemonstration } from '../core/demonstration.ts'
import type { ParcoursDeclare } from '../core/declaratif.ts'
import type { Itinerary, Track } from '../core/types.ts'
import type { SentiersDb } from '../db/database.ts'

/**
 * La démonstration, sortie du store (issue #155).
 *
 * Sixième et dernière grande tranche. Elle porte les trois moments d'une
 * visite guidée : l'ouvrir, en sortir sans rien perdre, et la quitter pour
 * de bon.
 *
 * ## Pourquoi ces trois-là ensemble
 *
 * Elles ne partagent pas seulement le drapeau `demonstration` : elles
 * partagent **la question de ce qu'on rend quand on en sort**, et les trois
 * y répondent différemment parce que les trois situations diffèrent.
 *
 * - `arreterDemonstration` retire les sorties fictives **et garde les
 *   boucles**, qui sont réelles et sous licence ouverte. La zone est
 *   renommée pour ce qu'elle est vraiment, pas vidée ;
 * - `quitterDemonstration` remet tout à zéro **et relit la base**, parce
 *   qu'on revient à ce qui existait avant ;
 * - `sortirDeLaDemonstration` est la garde que les autres tranches appellent
 *   avant d'écrire quoi que ce soit — export, import, chargement de zone.
 *
 * ## La cicatrice qui part avec
 *
 * Le commentaire de `quitterDemonstration` affirmait « la base n'a jamais
 * rien reçu de la démonstration, donc rien n'est perdu ». C'était vrai quand
 * il a été écrit et faux ensuite : les déclarations de parcours (#158) sont
 * arrivées après, et la relecture ne les reprenait pas. §4bis — une
 * justification vieillit comme le reste, et personne ne la relit.
 *
 * Le défaut restait **latent** : l'entrée de la démonstration ne vit que dans
 * le guide de premier lancement, qu'un revenant — le seul à pouvoir avoir des
 * déclarations — a déjà fermé. Un accident de navigation protégeait, pas une
 * garantie. La relecture est donc symétrique de celle des traces, et le test
 * la tient maintenant hors du store.
 */

/** Ce que la démonstration ajoute à l'état du store. */
export interface EtatDemonstration {
  demonstration: boolean
}

/** Ce que la démonstration ajoute aux actions du store. */
export interface ActionsDemonstration {
  demarrerDemonstration: () => Promise<void>
  arreterDemonstration: () => Promise<void>
  quitterDemonstration: () => Promise<void>
}

/** L'état que la tranche réécrit, au-delà de son propre drapeau. */
export interface EcritureDemonstration {
  demonstration: boolean
  itineraries: Itinerary[]
  tracks: Track[]
  customItineraries: Itinerary[]
  parcoursDeclares: ParcoursDeclare[]
  zoneKey: string | null
  zoneLabel: string | null
  zoneError: string | null
  zoneLoading: boolean
  selectedItineraryId: number | null
  detailItineraryId: number | null
  /**
   * Le jalon fêté, remis à `null` en sortant.
   *
   * Le type est repris tel quel plutôt que réduit à `unknown` : la tranche
   * n'écrit jamais que `null`, mais un `unknown` ici rendrait le `set` du
   * store incompatible — et le faire passer par une assertion masquerait
   * l'accord au lieu de le tenir.
   */
  celebration: { itineraryId: number; milestone: number } | null
}

/** Ce que la tranche a besoin de savoir du reste du store. */
export interface DependancesDemonstration {
  set: (partiel: Partial<EcritureDemonstration>) => void
  /** L'état courant, lu au moment où on en a besoin. */
  lire: () => { demonstration: boolean; tracks: Track[]; zoneKey: string | null }
  /**
   * Les boucles communales embarquées avec le site.
   *
   * La démonstration fonctionne hors ligne, sur des données réelles et
   * licenciées, sans faire attendre Overpass au tout premier écran.
   */
  bouclesLocales: () => Promise<Itinerary[]>
  baseOuverte: () => Promise<SentiersDb | null>
  recalculer: () => Promise<void>
  /** L'instant des sorties fictives, injecté pour être mesurable. */
  maintenant: () => string
}

/** Le libellé de la zone une fois la démonstration arrêtée. */
const ZONE_REELLE = {
  cle: 'boucles-lyon',
  libelle: 'Boucles communales — Métropole de Lyon',
} as const

/** La zone tant que la démonstration tourne. */
const ZONE_DEMONSTRATION = {
  cle: 'demonstration',
  libelle: 'Démonstration — Métropole de Lyon',
} as const

/** Préfixe des identifiants de sorties fictives, pour pouvoir les retirer. */
const PREFIXE_FICTIF = 'demo-'

export function trancheDemonstration(
  deps: DependancesDemonstration,
): ActionsDemonstration {
  return {
    async demarrerDemonstration() {
      const boucles = await deps.bouclesLocales()
      const sorties = construireDemonstration(boucles)
      if (sorties.length === 0) {
        deps.set({
          zoneError:
            'La démonstration n’a pas pu être préparée. Choisissez une zone pour commencer.',
        })
        return
      }
      const maintenant = deps.maintenant()
      deps.set({
        demonstration: true,
        itineraries: boucles,
        zoneKey: ZONE_DEMONSTRATION.cle,
        zoneLabel: ZONE_DEMONSTRATION.libelle,
        zoneError: null,
        zoneLoading: false,
        tracks: sorties.map((sortie) => ({
          id: `${PREFIXE_FICTIF}${String(sortie.itineraire)}`,
          filename: sortie.nom,
          points: sortie.points,
          date: maintenant,
          importedAt: maintenant,
          elevationGain: null,
        })),
      })
      await deps.recalculer()
    },

    async arreterDemonstration() {
      const etat = deps.lire()
      if (!etat.demonstration) return
      const enDemonstration = etat.zoneKey === ZONE_DEMONSTRATION.cle
      deps.set({
        demonstration: false,
        // Les sorties fictives partent ; les boucles restent, elles sont
        // réelles. La zone est renommée pour ce qu'elle est vraiment.
        tracks: etat.tracks.filter((t) => !t.id.startsWith(PREFIXE_FICTIF)),
        zoneKey: enDemonstration ? ZONE_REELLE.cle : etat.zoneKey,
        ...(enDemonstration ? { zoneLabel: ZONE_REELLE.libelle } : {}),
        celebration: null,
      })
      await deps.recalculer()
    },

    async quitterDemonstration() {
      if (!deps.lire().demonstration) return
      deps.set({
        demonstration: false,
        itineraries: [],
        tracks: [],
        zoneKey: null,
        zoneLabel: null,
        selectedItineraryId: null,
        detailItineraryId: null,
        celebration: null,
      })
      /*
        La base n'a jamais rien reçu de la démonstration : il n'y a rien à
        défaire, seulement à relire ce qui existait vraiment.

        Les trois listes ensemble, et pas seulement les traces : les
        déclarations manquaient à cette relecture pendant que le commentaire
        affirmait « rien n'est perdu » (§4bis). Une quatrième liste qui
        arriverait un jour se verrait ici, ce qui n'était pas le cas quand la
        relecture était éparpillée.
      */
      const db = await deps.baseOuverte()
      if (db) {
        const [tracks, customItineraries, parcoursDeclares] = await Promise.all(
          [
            db.listTracks(),
            db.listCustomItineraries(),
            db.listerParcoursDeclares(),
          ],
        )
        deps.set({ tracks, customItineraries, parcoursDeclares })
      }
      await deps.recalculer()
    },
  }
}
