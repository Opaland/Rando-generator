import { useEffect, useRef, useState } from 'react'
import {
  RAYON_CORRIDOR_METRES,
  ZOOMS_TERRAIN,
  libelleTelechargement,
  ressourcesDeLaRandonnee,
  type ProgresTelechargement,
} from '../core/telechargement.ts'
import type { LonLat } from '../core/types.ts'
import { emporter, emporterPois } from '../lib/emporter.ts'
import { fetchPoisOuEchec } from '../core/poi.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './BoutonEmporter.module.css'

/**
 * « Emporter cette randonnée » (issue #153).
 *
 * Un composant à part, et pas trois lignes dans la fiche détail : il change
 * d'état à chaque tuile reçue, et la fiche entière n'a pas à se repeindre
 * cent fois pour cela — même raison que `PoigneeTexte`.
 *
 * Deux choses qu'il faut savoir en le lisant :
 *
 * - **le nombre de tuiles est exact ; le poids est mesuré mais pas
 *   affiché.** L'issue demandait « le budget affiché avant de lancer »,
 *   c'est-à-dire des mégaoctets. Ils sont connus depuis le 29/08
 *   (`docs/MESURE_TUILES.md`) — mais un corridor de village pèse « de
 *   l'ordre de quatre mégaoctets », avec des tuiles qui vont du simple au
 *   double, et choisir comment dire cette fourchette est une décision, pas
 *   une mesure (#397). Ce qui s'affiche avant reste donc un compte de
 *   tuiles, et ce qui s'affiche pendant et après sont des octets **reçus**,
 *   comptés par le service worker ;
 * - **fermer la fiche arrête le téléchargement.** Le corridor d'un GR de
 *   200 km compte des milliers de tuiles : rien ne doit continuer à
 *   marteler la Géoplateforme derrière un écran qu'on a quitté.
 */
export function BoutonEmporter({
  coords,
  itineraryId,
}: {
  coords: LonLat[]
  itineraryId: number
}) {
  const base = useAppStore((s) => s.db)
  /*
    Calculé une fois au montage, et non à chaque rendu : parcourir le
    corridor d'un long tracé sur cinq zooms n'est pas gratuit. La fiche pose
    un `key` sur l'identifiant de l'itinéraire — changer d'itinéraire
    remonte donc le composant, et le calcul se refait.
  */
  const [ressources] = useState(() =>
    ressourcesDeLaRandonnee(coords, {
      zooms: ZOOMS_TERRAIN,
      rayonMetres: RAYON_CORRIDOR_METRES,
    }),
  )
  const [progres, setProgres] = useState<ProgresTelechargement | null>(null)
  const [sansServiceWorker, setSansServiceWorker] = useState(false)
  /*
    Les points d'intérêt ne suivent pas le chemin des tuiles : Overpass
    répond en `POST`, que le Cache API ne sait pas ranger. Ils partent donc
    en parallèle, vers IndexedDB, et leur échec se dit séparément — il ne
    rend pas la randonnée moins emportée.
  */
  const [poisEmportes, setPoisEmportes] = useState<boolean | null>(null)
  const arreter = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      arreter.current?.()
      arreter.current = null
    },
    [],
  )

  const adresses = [...ressources.tuiles]
  if (ressources.altimetrie) adresses.push(ressources.altimetrie)

  const enCours = progres !== null && !progres.fini
  const fini = progres?.fini === true

  return (
    <div className={styles.bloc}>
      <button
        type="button"
        className="btn-secondary"
        data-testid="itinerary-detail-emporter"
        disabled={adresses.length === 0 || enCours || fini}
        onClick={() => {
          const stop = emporter(
            'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
            adresses,
            setProgres,
          )
          if (!stop) {
            setSansServiceWorker(true)
            return
          }
          arreter.current = stop
          if (base) {
            void emporterPois(
              {
                recuperer: (trace) => fetchPoisOuEchec(trace),
                ecrire: (pois) => base.ecrirePoisEmportes(pois),
                maintenant: () => new Date(),
              },
              itineraryId,
              coords,
            ).then(setPoisEmportes)
          } else {
            setPoisEmportes(false)
          }
          setProgres({
            faites: 0,
            total: adresses.length,
            octets: 0,
            echecs: 0,
            fini: false,
          })
        }}
      >
        {libelleTelechargement(
          progres,
          ressources.tuiles.length,
          ressources.octetsEstimes,
        )}
      </button>
      {progres === null && !sansServiceWorker && (
        <p className={styles.aide}>
          Fond de carte et relief, gardés pour le jour où vous n’aurez pas de
          réseau. Le poids dépend du terrain : il s’affiche pendant le
          téléchargement.
        </p>
      )}
      {enCours && (
        <p className={styles.aide} role="status">
          Fermer cette fiche arrête le téléchargement ; ce qui est descendu
          reste.
        </p>
      )}
      {fini && progres.echecs > 0 && (
        <p className={styles.aide} data-testid="emporter-manquantes">
          Le réseau a refusé {progres.echecs} tuile
          {progres.echecs > 1 ? 's' : ''} : autant de carrés gris là-bas.
          Relancez depuis une meilleure connexion pour les compléter.
        </p>
      )}
      {poisEmportes === false && (
        <p className={styles.aide} data-testid="emporter-sans-poi">
          Les points d’intérêt n’ont pas pu être emportés : sans réseau, la
          fiche n’aura ni points d’eau ni refuges. Le fond de carte et le
          relief, eux, sont là.
        </p>
      )}
      {sansServiceWorker && (
        <p className={styles.aide} role="status">
          Le mode hors-ligne n’est pas actif sur cette page : rechargez-la,
          puis réessayez. S’il ne revient pas, c’est que le navigateur ne
          l’autorise pas ici — il demande une adresse en <code>https</code>.
        </p>
      )}
    </div>
  )
}
