import { create } from 'zustand'
import type { FeatureCollection, LineString } from 'geojson'
import { jeuPdiprPour, parseReseauPdipr, reseauVide } from '../core/pdipr.ts'
import { memoriserJson } from './sourcesLocales.ts'

/**
 * Le réseau de fond PDIPR de la zone affichée (#87).
 *
 * ## Pourquoi un store à part
 *
 * Deux lecteurs : la carte, qui le peint, et la légende, qui ne nomme que ce
 * qui est dessiné (`core/legende.ts`). Si la légende se contentait de
 * savoir que la zone **pourrait** avoir un PDIPR, elle le nommerait hors
 * ligne, quand le fichier n'a pas pu venir — une légende qui ment, le défaut
 * exact du constat U6. Les deux lisent donc le même état : le réseau
 * effectivement reçu.
 *
 * Hors d'`appStore.ts` pour la même raison que `reseauxVisibles.ts` : rien
 * ici ne se persiste ni ne se sauvegarde, et l'issue #155 refuse que le
 * store des données regrossisse.
 */
interface EtatReseauDeFond {
  reseau: FeatureCollection<LineString>
}

export const useReseauDeFond = create<EtatReseauDeFond>(() => ({
  reseau: reseauVide(),
}))

/** Un accès mémorisé par fichier, créé à la première demande. */
const chargeurs = new Map<string, () => Promise<FeatureCollection<LineString>>>()

function telecharger(zoneKey: string | null): Promise<FeatureCollection<LineString>> {
  const jeu = jeuPdiprPour(zoneKey)
  if (jeu === null) return Promise.resolve(reseauVide())
  let charger = chargeurs.get(jeu.fichier)
  if (!charger) {
    charger = memoriserJson(
      `${import.meta.env.BASE_URL}${jeu.fichier}`,
      (data) => parseReseauPdipr(data, jeu.emprise),
      (reseau) => reseau.features.length === 0,
    )
    chargeurs.set(jeu.fichier, charger)
  }
  return charger()
}

/** La dernière zone demandée : une réponse lente pour une zone quittée ne s'applique pas. */
let zoneDemandee: string | null = null

/**
 * Charge le réseau de fond de cette zone — vide quand aucun département ne
 * le publie pour elle, et jamais téléchargé alors, puisqu'il pèse plus que
 * l'application.
 */
export async function chargerReseauDeFond(zoneKey: string | null): Promise<void> {
  // Changer de zone efface tout de suite l'ancien réseau : l'Isère ne doit
  // pas rester peinte sous la Loire le temps d'un téléchargement.
  if (zoneDemandee !== zoneKey) useReseauDeFond.setState({ reseau: reseauVide() })
  zoneDemandee = zoneKey
  const reseau = await telecharger(zoneKey)
  if (zoneDemandee !== zoneKey) return
  useReseauDeFond.setState({ reseau })
}
