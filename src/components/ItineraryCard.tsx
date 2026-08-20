import { useAppStore } from '../store/appStore.ts'
import {
  isCompleted,
  metersToNextMilestone,
  nextMilestone,
} from '../core/milestones.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryCard.module.css'

/** Fiche de l'itinéraire sélectionné, en surimpression de la carte. */
export function ItineraryCard() {
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const detailItineraryId = useAppStore((s) => s.detailItineraryId)
  const itineraries = useAppStore((s) => s.itineraries)
  const seuilBoucle = useAppStore((s) => s.completionPct)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const matching = useAppStore((s) => s.matching)
  const customMatching = useAppStore((s) => s.customMatching)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const openItineraryDetail = useAppStore((s) => s.openItineraryDetail)
  const objectifs = useAppStore((s) => s.objectifs)
  const basculerObjectif = useAppStore((s) => s.basculerObjectif)

  // La fiche détail (altimétrie, POI, vue 3D) prend le relais : éviter le
  // doublon d'information avec ce résumé flottant.
  if (selectedItineraryId === null || detailItineraryId !== null) return null
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
  // Un pourcentage qui monte lentement ne dit rien ; un palier à portée, si.
  const restantJalon = metersToNextMilestone(pct, total)
  const objectif = objectifs.includes(itin.osmRelationId)

  return (
    <aside
      className={styles.card}
      aria-label={`Fiche de ${displayName(itin)}`}
      data-testid="itinerary-card"
    >
      <header className={styles.header}>
        <span className={`${styles.badge} ${styles[itin.network]}`}>
          {NETWORK_BADGES[itin.network]}
        </span>
        <h3 className={styles.name}>{displayName(itin)}</h3>
        <button
          type="button"
          className="btn-icon-close"
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
      <p className={styles.milestone} data-testid="itinerary-card-milestone">
        {isCompleted(pct, seuilBoucle)
          ? `Itinéraire bouclé (au moins ${seuilBoucle} % parcourus)`
          : restantJalon !== null
            ? `Encore ${formatKm(restantJalon)} pour atteindre ${nextMilestone(pct) ?? 100} %`
            : ''}
      </p>
      {/*
        Épingler se décide en regardant l'itinéraire, pas en survolant la
        liste (issue #13) : c'est ici qu'on voit ce qu'il reste, donc ici
        qu'on décide d'en faire un objectif.
      */}
      <button
        type="button"
        className={objectif ? styles.objectifActif : styles.objectif}
        aria-pressed={objectif}
        data-testid="itinerary-card-objectif"
        onClick={() => void basculerObjectif(itin.osmRelationId)}
      >
        {objectif ? '★ Objectif suivi' : '☆ Suivre comme objectif'}
      </button>
      <button
        type="button"
        className={styles.detailLink}
        data-testid="itinerary-card-detail-link"
        onClick={() => {
          openItineraryDetail(itin.osmRelationId)
        }}
      >
        Voir le détail (altimétrie, points d’intérêt) →
      </button>
    </aside>
  )
}
