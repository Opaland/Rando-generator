import { useMemo } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { suggestNextOutings } from '../core/nextOuting.ts'
import { displayName, formatKm } from '../lib/format.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import styles from './NextOuting.module.css'

/** Trois propositions : au-delà, ce n'est plus une suggestion, c'est la liste. */
const MAX_SUGGESTIONS = 3

/**
 * « Prochaine sortie » : ce qui vient juste après le pourcentage — par où
 * continuer. Un tableau de bord qui affiche 43 % laisse l'utilisateur devant
 * une carte et cinquante itinéraires entamés ; on lui montre le plus long
 * tronçon qu'il lui reste, pondéré par la distance pour s'y rendre.
 */
export function NextOuting() {
  const itineraries = useAppStore((s) => s.itineraries)
  const matching = useAppStore((s) => s.matching)
  const userPosition = useAppStore((s) => s.userPosition)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const focusOn = useAppStore((s) => s.focusOn)

  // Même précaution que dans la liste : la position brute change à chaque
  // relevé GPS, et reparcourir tous les échantillons une fois par seconde
  // pour un classement qui ne bouge pas serait du gaspillage. On dépend des
  // coordonnées arrondies à ~100 m.
  const lonArrondi = userPosition
    ? Math.round(userPosition.lon * 1_000) / 1_000
    : null
  const latArrondi = userPosition
    ? Math.round(userPosition.lat * 1_000) / 1_000
    : null

  const suggestions = useMemo(() => {
    if (!matching) return []
    return suggestNextOutings(itineraries, matching.samples, {
      from:
        lonArrondi !== null && latArrondi !== null
          ? [lonArrondi, latArrondi]
          : null,
      limit: MAX_SUGGESTIONS,
    })
  }, [itineraries, matching, lonArrondi, latArrondi])

  const nameById = useMemo(
    () => new Map(itineraries.map((i) => [i.osmRelationId, i])),
    [itineraries],
  )

  if (suggestions.length === 0) return null

  return (
    <details className={styles.section} data-testid="next-outing" open>
      <summary className="acc-summary">
        <h2 className={styles.title}>Prochaine sortie</h2>
      </summary>
      <p className={styles.hint}>
        Le plus long tronçon qu’il vous reste d’un seul tenant, pondéré par la
        distance pour s’y rendre.
      </p>
      <ol className={styles.list}>
        {suggestions.map((suggestion) => {
          const itin = nameById.get(suggestion.itineraryId)
          if (!itin) return null
          return (
            <li key={suggestion.itineraryId}>
              <button
                type="button"
                className={styles.row}
                onClick={() => {
                  selectItinerary(suggestion.itineraryId)
                  focusOn(suggestion.bestRun.start)
                }}
              >
                <span
                  className={`${styles.badge} ${styles[itin.network]}`}
                  data-reseau={itin.network}
                >
                  {NETWORK_BADGES[itin.network]}
                </span>
                <span className={styles.main}>
                  <span className={styles.name}>{displayName(itin)}</span>
                  <span className={styles.facts}>
                    {formatKm(suggestion.bestRun.meters)} d’un trait
                    {suggestion.remainingMeters >
                      suggestion.bestRun.meters * 1.05 &&
                      ` · ${formatKm(suggestion.remainingMeters)} au total`}
                    {suggestion.awayMeters !== null &&
                      ` · à ${formatKm(suggestion.awayMeters)} de vous`}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
