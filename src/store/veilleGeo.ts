/**
 * Un seul `watchPosition` pour deux usages (issue #152).
 *
 * La carte montre **où l'on est**, l'enregistrement retient **par où l'on
 * est passé**. Ce sont deux besoins distincts, et ils demandaient au départ
 * deux suivis. Deux suivis, c'est deux fois la position haute précision
 * réclamée au système : sur une sortie de quatre heures, c'est la batterie
 * qui paie.
 *
 * Le corollaire compte autant que la règle : **arrêter l'affichage de sa
 * position ne doit pas arrêter l'enregistrement.** D'où un comptage des
 * demandeurs plutôt qu'un simple booléen.
 *
 * Extrait du store pour deux raisons. La première est qu'il y grossissait un
 * fichier que l'issue #155 signale déjà comme gênant. La seconde vaut
 * mieux : ici, tout cela s'éprouve **sans navigateur** — le comptage n'était
 * gardé que par un seul test e2e, c'est-à-dire par le plus lent et le plus
 * fragile des moyens.
 */

export type Veilleur = 'carte' | 'sortie'

export interface VeilleGeo {
  /** Rend faux si le navigateur ne fournit pas de géolocalisation. */
  demarrer: (qui: Veilleur) => boolean
  arreter: (qui: Veilleur) => void
}

export interface OptionsVeille {
  /** Injectable : les tests fournissent une géolocalisation qui compte. */
  geolocation: () => Geolocation | null
  options: PositionOptions
  surPosition: (position: GeolocationPosition) => void
  surErreur: (erreur: GeolocationPositionError) => void
}

export function creerVeilleGeo({
  geolocation,
  options,
  surPosition,
  surErreur,
}: OptionsVeille): VeilleGeo {
  const veilleurs = new Set<Veilleur>()
  let identifiant: number | null = null

  return {
    demarrer(qui) {
      const api = geolocation()
      if (!api) return false
      veilleurs.add(qui)
      identifiant ??= api.watchPosition(
        surPosition,
        (erreur) => {
          // On **ferme** le suivi avant de l'oublier.
          //
          // La version d'origine se contentait de remettre l'identifiant à
          // `null` — en croyant, comme moi jusqu'à ce test, que le
          // navigateur referme un suivi qui a rendu une erreur. Il ne le
          // fait pas : la norme prévoit qu'un `watchPosition` continue après
          // une erreur non fatale. L'ancien suivi restait donc actif, et le
          // redémarrage suivant en ouvrait un second par-dessus — deux
          // positions haute précision demandées au système, exactement le
          // coût que ce module existe pour éviter.
          //
          // Le compteur repart de zéro : sans cela la veille se croirait
          // ouverte et ne rouvrirait jamais.
          if (identifiant !== null) api.clearWatch(identifiant)
          identifiant = null
          veilleurs.clear()
          surErreur(erreur)
        },
        options,
      )
      return true
    },

    arreter(qui) {
      veilleurs.delete(qui)
      if (veilleurs.size > 0) return
      const api = geolocation()
      if (identifiant !== null && api) api.clearWatch(identifiant)
      identifiant = null
    },
  }
}
