import { useAppStore } from '../store/appStore.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryCard.module.css'

/** Fiche de l'itinéraire sélectionné, en surimpression de la carte. */
export function ItineraryCard() {
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const matching = useAppStore((s) => s.matching)
  const customMatching = useAppStore((s) => s.customMatching)
  const selectItinerary = useAppStore((s) => s.selectItinerary)

  if (selectedItineraryId === null) return null
  const itin =
    itineraries.find((i) => i.osmRelationId === selectedItineraryId) ??
    customItineraries.find((i) => i.osmRelationId === selectedItineraryId)
  if (!itin) return null

  const relevantMatching = itin.network === 'PERSO' ? customMatching : matching
  const result = relevantMatching?.results.find(
    (r) => r.itineraryId === selectedItineraryId,
  )
  const pct = result?.pct ?? 0
  const done = result?.doneMeters ?? 0
  const total = result?.totalMeters ?? itin.totalMeters

  return (
    <aside
      className={styles.card}
      aria-label={`Fiche de ${displayName(itin)}`}
      data-testid="itinerary-card"
    >
      <header className={styles.header}>
        <span className={`${styles.badge} ${styles[itin.network]}`}>
          {itin.network}
        </span>
        <h3 className={styles.name}>{displayName(itin)}</h3>
        <button
          type="button"
          className={styles.close}
          aria-label="Fermer la fiche"
          data-testid="itinerary-card-close"
          onClick={() => {
            selectItinerary(null)
          }}
        >
          ×
        </button>
      </header>
      {itin.ref && itin.name && <p className={styles.sub}>{itin.name}</p>}
      <p className={styles.pct} data-testid="itinerary-card-pct">
        {formatPct(pct)}
      </p>
      <ProgressBalise
        pct={pct}
        network={itin.network}
        label={`Progression ${displayName(itin)}`}
      />
      <p className={styles.detail}>
        {formatKm(done)} parcourus · {formatKm(Math.max(0, total - done))}{' '}
        restants
      </p>
    </aside>
  )
}
