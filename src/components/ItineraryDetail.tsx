import { useAppStore } from '../store/appStore.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { POI_LABELS } from '../lib/poiDisplay.ts'
import { elevationStats } from '../core/elevation.ts'
import { ElevationChart } from './ElevationChart.tsx'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryDetail.module.css'

/**
 * Fiche détail d'un itinéraire, ouverte en cliquant son tracé sur la carte :
 * profil altimétrique (service IGN), points d'intérêt proches (Overpass),
 * et une vue 3D (caméra inclinée sur le tracé — perspective, pas un relief
 * calculé à partir d'un modèle numérique de terrain).
 */
export function ItineraryDetail() {
  const detailItineraryId = useAppStore((s) => s.detailItineraryId)
  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const matching = useAppStore((s) => s.matching)
  const customMatching = useAppStore((s) => s.customMatching)
  const elevationProfile = useAppStore((s) => s.elevationProfile)
  const elevationError = useAppStore((s) => s.elevationError)
  const elevationLoading = useAppStore((s) => s.elevationLoading)
  const pois = useAppStore((s) => s.pois)
  const poisLoading = useAppStore((s) => s.poisLoading)
  const view3D = useAppStore((s) => s.view3D)
  const closeItineraryDetail = useAppStore((s) => s.closeItineraryDetail)
  const toggleView3D = useAppStore((s) => s.toggleView3D)
  const focusOn = useAppStore((s) => s.focusOn)

  if (detailItineraryId === null) return null
  const itin =
    itineraries.find((i) => i.osmRelationId === detailItineraryId) ??
    customItineraries.find((i) => i.osmRelationId === detailItineraryId)
  if (!itin) return null

  const relevantMatching = itin.network === 'PERSO' ? customMatching : matching
  const result = relevantMatching?.results.find(
    (r) => r.itineraryId === detailItineraryId,
  )
  const pct = result?.pct ?? 0
  const done = result?.doneMeters ?? 0
  const total = result?.totalMeters ?? itin.totalMeters
  const stats = elevationProfile ? elevationStats(elevationProfile.elevations) : null

  return (
    <aside
      className={styles.panel}
      aria-label={`Détail de ${displayName(itin)}`}
      data-testid="itinerary-detail"
    >
      <header className={styles.header}>
        <span className={`${styles.badge} ${styles[itin.network]}`}>
          {itin.network}
        </span>
        <div className={styles.titleBlock}>
          <h3 className={styles.name}>{displayName(itin)}</h3>
          {itin.ref && itin.name && <p className={styles.sub}>{itin.name}</p>}
        </div>
        <button
          type="button"
          className={view3D ? styles.view3dActive : styles.view3d}
          aria-pressed={view3D}
          data-testid="detail-3d-toggle"
          onClick={toggleView3D}
        >
          Vue 3D
        </button>
        <button
          type="button"
          className="btn-icon-close"
          aria-label="Fermer la fiche détail"
          data-testid="itinerary-detail-close"
          onClick={closeItineraryDetail}
        >
          ×
        </button>
      </header>

      <div className={styles.stats}>
        <p className={styles.pct} data-testid="itinerary-detail-pct">
          {formatPct(pct)}
        </p>
        <ProgressBalise
          pct={pct}
          network={itin.network}
          label={`Progression ${displayName(itin)}`}
        />
        <p className={styles.km}>
          {formatKm(done)} parcourus · {formatKm(Math.max(0, total - done))}{' '}
          restants
        </p>
      </div>

      <section className={styles.section} aria-labelledby="elevation-title">
        <h4 id="elevation-title" className={styles.sectionTitle}>
          Profil altimétrique
        </h4>
        {elevationLoading && (
          <p className={styles.hint} role="status">
            Calcul du relief…
          </p>
        )}
        {elevationError && (
          <p className={styles.hint} role="status">
            {elevationError}
          </p>
        )}
        {elevationProfile && stats && (
          <>
            <ElevationChart profile={elevationProfile} />
            <p className={styles.elevationStats}>
              D+ {Math.round(stats.gain)} m · D− {Math.round(stats.loss)} m ·{' '}
              {Math.round(stats.min)}–{Math.round(stats.max)} m
            </p>
          </>
        )}
      </section>

      <section className={styles.section} aria-labelledby="poi-title">
        <h4 id="poi-title" className={styles.sectionTitle}>
          Points d’intérêt
        </h4>
        {poisLoading && (
          <p className={styles.hint} role="status">
            Recherche autour du tracé…
          </p>
        )}
        {!poisLoading && pois.length === 0 && (
          <p className={styles.hint}>Aucun point d’intérêt répertorié à proximité.</p>
        )}
        {pois.length > 0 && (
          <ul className={styles.poiList} data-testid="detail-poi-list">
            {pois.map((poi) => (
              <li key={poi.id}>
                <button
                  type="button"
                  className={styles.poiItem}
                  onClick={() => {
                    focusOn([poi.lon, poi.lat])
                  }}
                >
                  <span className={styles.poiKind}>{POI_LABELS[poi.kind]}</span>
                  <span className={styles.poiName}>
                    {poi.name ?? POI_LABELS[poi.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
