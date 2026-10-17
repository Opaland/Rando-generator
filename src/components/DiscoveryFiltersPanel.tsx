import {
  DENIVELES,
  DUREES,
  LONGUEURS,
  PROXIMITES,
  libelleQuestion,
  toIndex,
  type ChampPilote,
  type DiscoveryFilters,
} from '../core/discovery.ts'
import { DETOURS_PROPOSES } from '../core/poisDeZone.ts'
import type { Fragment } from '../core/intention.ts'
import type { UserPosition } from '../core/types.ts'
import styles from './ItineraryList.module.css'

/**
 * Le panneau « Trouver une sortie », sorti d'`ItineraryList.tsx` (dette du
 * 17/10, le fichier approchait son plafond de lignes).
 *
 * Purement présentationnel : tout l'état (paliers, question en langage
 * naturel) reste dans `ItineraryList`, qui en a besoin pour filtrer la liste
 * principale rendue à côté de ce panneau — le déplacer ici aurait demandé de
 * le faire remonter par un événement, pour rien.
 */
export interface DiscoveryFiltersPanelProps {
  filtresActifs: boolean
  question: string
  setQuestion: (valeur: string) => void
  lancerLaQuestion: (texte: string) => void
  compris: Fragment[]
  incompris: string[]
  depuisQuestion: Partial<DiscoveryFilters> | null
  longueurIndex: number
  setLongueurIndex: (index: number) => void
  dureeIndex: number
  setDureeIndex: (index: number) => void
  deniveleIndex: number
  setDeniveleIndex: (index: number) => void
  shape: DiscoveryFilters['shape']
  setShape: (valeur: DiscoveryFilters['shape']) => void
  sol: DiscoveryFilters['sol']
  setSol: (valeur: DiscoveryFilters['sol']) => void
  proximiteIndex: number
  setProximiteIndex: (index: number) => void
  reprendreLaMain: (champ: ChampPilote) => void
  hasPois: boolean
  poisZoneLoading: boolean
  hasItineraries: boolean
  chargerPoisDeLaZone: () => void
  detourEau: number | null
  setDetourEau: (metres: number | null) => void
  poisZoneTronque: boolean
  proximiteFiltreActif: boolean
  userPosition: UserPosition | null
  reinitialiser: () => void
}

export function DiscoveryFiltersPanel({
  filtresActifs,
  question,
  setQuestion,
  lancerLaQuestion,
  compris,
  incompris,
  depuisQuestion,
  longueurIndex,
  setLongueurIndex,
  dureeIndex,
  setDureeIndex,
  deniveleIndex,
  setDeniveleIndex,
  shape,
  setShape,
  sol,
  setSol,
  proximiteIndex,
  setProximiteIndex,
  reprendreLaMain,
  hasPois,
  poisZoneLoading,
  hasItineraries,
  chargerPoisDeLaZone,
  detourEau,
  setDetourEau,
  poisZoneTronque,
  proximiteFiltreActif,
  userPosition,
  reinitialiser,
}: DiscoveryFiltersPanelProps) {
  const pose = depuisQuestion ?? {}
  return (
    <details className={styles.discovery} data-testid="discovery-filters">
      <summary className={styles.discoverySummary}>
        Trouver une sortie{filtresActifs ? ' — filtres actifs' : ''}
      </summary>
      {/*
        La question en toutes lettres (pierre 0 de `docs/IA_LOCALE.md`).

        Elle ne remplace pas les paliers, elle les remplit : ce qui est
        compris se voit dans les listes juste en dessous, et **ce qui ne
        l'est pas est écrit**. Un lecteur de langage naturel qui tait ce
        qu'il a ignoré ment par omission — et sur un sentier, on suit ce
        que l'écran dit.

        Aucun modèle, aucun téléchargement, aucun appel réseau : des règles
        de lecture, dans `src/core/intention.ts`. La recherche sémantique
        de la note d'architecture reste devant nous, et elle se jugera
        contre celle-ci.
      */}
      <form
        className={styles.question}
        onSubmit={(e) => {
          e.preventDefault()
          lancerLaQuestion(question)
        }}
      >
        <label className={styles.sort}>
          Ou dites-le en une phrase{' '}
          <input
            type="search"
            data-testid="list-question"
            placeholder="une boucle facile de moins de 10 km…"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
            }}
          />
        </label>
        <button type="submit" data-testid="list-question-ok">
          Appliquer
        </button>
      </form>
      {compris.length > 0 && (
        <p className={styles.hint} data-testid="question-compris">
          Compris : {compris.map((f) => f.texte).join(', ')}.
        </p>
      )}
      {incompris.length > 0 && (
        <p className={styles.hint} data-testid="question-incompris">
          Je n’ai pas su quoi faire de : {incompris.join(', ')}. Le reste de
          votre phrase est dans les listes ci-dessous.
        </p>
      )}
      <div className={styles.discoveryGrid}>
        <label className={styles.sort}>
          Longueur{' '}
          <select
            value={
              libelleQuestion(pose, 'longueur') !== null
                ? 'question'
                : longueurIndex
            }
            data-testid="list-length"
            onChange={(e) => {
              reprendreLaMain('longueur')
              setLongueurIndex(toIndex(e.target.value, LONGUEURS.length))
            }}
          >
            {/*
              L'option n'existe que tant que la question tient ce champ.
              La laisser en permanence donnerait un choix qui ne veut rien
              dire, et la retirer sans reprendre la main afficherait un
              palier qui n'est pas celui qui s'applique.
            */}
            {libelleQuestion(pose, 'longueur') !== null && (
              <option value="question">
                d’après votre phrase : {libelleQuestion(pose, 'longueur')}
              </option>
            )}
            {LONGUEURS.map((plage, index) => (
              <option key={plage.label} value={index}>
                {plage.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.sort}>
          Durée{' '}
          <select
            value={
              libelleQuestion(pose, 'duree') !== null
                ? 'question'
                : dureeIndex
            }
            data-testid="list-duration"
            onChange={(e) => {
              reprendreLaMain('duree')
              setDureeIndex(toIndex(e.target.value, DUREES.length))
            }}
          >
            {/*
              L'option n'existe que tant que la question tient ce champ.
              La laisser en permanence donnerait un choix qui ne veut rien
              dire, et la retirer sans reprendre la main afficherait un
              palier qui n'est pas celui qui s'applique.
            */}
            {libelleQuestion(pose, 'duree') !== null && (
              <option value="question">
                d’après votre phrase : {libelleQuestion(pose, 'duree')}
              </option>
            )}
            {DUREES.map((duree, index) => (
              <option key={duree.label} value={index}>
                {duree.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.sort}>
          Dénivelé{' '}
          <select
            value={
              libelleQuestion(pose, 'denivele') !== null
                ? 'question'
                : deniveleIndex
            }
            data-testid="list-gain"
            onChange={(e) => {
              reprendreLaMain('denivele')
              setDeniveleIndex(toIndex(e.target.value, DENIVELES.length))
            }}
          >
            {/*
              L'option n'existe que tant que la question tient ce champ.
              La laisser en permanence donnerait un choix qui ne veut rien
              dire, et la retirer sans reprendre la main afficherait un
              palier qui n'est pas celui qui s'applique.
            */}
            {libelleQuestion(pose, 'denivele') !== null && (
              <option value="question">
                d’après votre phrase : {libelleQuestion(pose, 'denivele')}
              </option>
            )}
            {DENIVELES.map((denivele, index) => (
              <option key={denivele.label} value={index}>
                {denivele.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.sort}>
          Forme{' '}
          <select
            value={shape}
            data-testid="list-shape"
            onChange={(e) => {
              setShape(e.target.value as DiscoveryFilters['shape'])
            }}
          >
            <option value="all">peu importe</option>
            <option value="loop">boucles</option>
            <option value="linear">allers simples</option>
          </select>
        </label>
        {/*
          Le sol (issue #179). Le libellé dit ce que le filtre fait
          vraiment : « entièrement dur ou stabilisé », et non « accessible »
          — un mot qui promettrait un jugement qu'on n'est pas en mesure de
          porter, et dont Nadia s'est déjà méfiée à raison.
        */}
        <label className={styles.sort}>
          Sol{' '}
          <select
            value={sol}
            data-testid="list-sol"
            onChange={(e) => {
              setSol(e.target.value as DiscoveryFilters['sol'])
            }}
          >
            <option value="all">peu importe</option>
            <option value="roulant">entièrement dur ou stabilisé</option>
          </select>
        </label>
        <label className={styles.sort}>
          Proximité{' '}
          <select
            value={
              libelleQuestion(pose, 'proximite') !== null
                ? 'question'
                : proximiteIndex
            }
            data-testid="list-nearby"
            onChange={(e) => {
              reprendreLaMain('proximite')
              setProximiteIndex(toIndex(e.target.value, PROXIMITES.length))
            }}
          >
            {/*
              L'option n'existe que tant que la question tient ce champ.
              La laisser en permanence donnerait un choix qui ne veut rien
              dire, et la retirer sans reprendre la main afficherait un
              palier qui n'est pas celui qui s'applique.
            */}
            {libelleQuestion(pose, 'proximite') !== null && (
              <option value="question">
                d’après votre phrase : {libelleQuestion(pose, 'proximite')}
              </option>
            )}
            {PROXIMITES.map((proximite, index) => (
              <option key={proximite.label} value={index}>
                {proximite.label}
              </option>
            ))}
          </select>
        </label>
        {/*
          Ce qu'il y a sur le chemin (issue #156).

          Le bouton est explicite parce que la recherche coûte une requête
          Overpass de plus. Rien ne la déclenche tout seul : #283 a montré
          ce que coûte une requête que personne n'a demandée — quand elle
          échoue, c'est l'application qui paraît fautive.
        */}
        {!hasPois ? (
          <button
            type="button"
            className={styles.reset}
            data-testid="list-charger-pois"
            disabled={poisZoneLoading || !hasItineraries}
            onClick={chargerPoisDeLaZone}
          >
            {poisZoneLoading
              ? 'Recherche des points d’eau…'
              : 'Chercher l’eau sur cette zone (une requête)'}
          </button>
        ) : (
          <label className={styles.sort}>
            Eau à moins de{' '}
            <select
              value={detourEau ?? ''}
              data-testid="list-eau"
              onChange={(e) => {
                setDetourEau(
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }}
            >
              <option value="">peu importe</option>
              {DETOURS_PROPOSES.map((metres) => (
                <option key={metres} value={metres}>
                  {metres < 1_000
                    ? `${String(metres)} m de détour`
                    : `${String(metres / 1_000)} km de détour`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/*
        Une troncature silencieuse serait pire qu'une absence : la liste
        annoncerait « pas d'eau » pour des itinéraires que la requête n'a
        pas eu la place de couvrir. On ne peut pas l'éviter — c'est le prix
        d'une requête unique — mais on peut refuser de faire comme si de
        rien n'était.
      */}
      {poisZoneTronque && (
        <p className={styles.hint} data-testid="pois-tronques">
          Cette zone contient plus de points d’intérêt qu’une seule requête
          n’en rapporte : la recherche est incomplète. Un itinéraire sans eau
          affichée peut en avoir.
        </p>
      )}
      {hasPois && !poisZoneTronque && (
        <p className={styles.hint} data-testid="pois-avertissement">
          D’après OpenStreetMap. Un point d’eau absent de la carte n’est pas
          un point d’eau absent du terrain — et l’inverse est vrai aussi.
        </p>
      )}

      {proximiteFiltreActif && !userPosition && (
        <p className={styles.hint} data-testid="nearby-hint">
          Position inconnue : activez « Où suis-je ? » sur la carte pour
          filtrer par proximité. En attendant, ce filtre ne retire rien.
        </p>
      )}

      {filtresActifs && (
        <button
          type="button"
          className={styles.reset}
          data-testid="list-reset"
          onClick={reinitialiser}
        >
          Réinitialiser les filtres
        </button>
      )}
    </details>
  )
}
