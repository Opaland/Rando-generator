import { useAppStore } from '../store/appStore.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { POI_LABELS, POI_OVERNIGHT } from '../lib/poiDisplay.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import { elevationStats } from '../core/elevation.ts'
import { itineraryCoords } from '../core/mapdata.ts'
import { DEFAULT_STAGE_METERS, buildStages } from '../core/stages.ts'
import {
  buildGpxDocument,
  gpxAttributionFor,
  gpxFilename,
} from '../core/gpxExport.ts'
import { downloadTextFile } from '../lib/download.ts'
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
  const focusOnBounds = useAppStore((s) => s.focusOnBounds)

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
  const hasSleepingSpot = pois.some((poi) => POI_OVERNIGHT.includes(poi.kind))
  // Un long GR ne se lit pas en un seul pourcentage : on le découpe en
  // étapes calculées (les découpages des topo-guides sont éditoriaux, donc
  // hors de portée — cf. src/core/stages.ts).
  const etapes = buildStages(itin, relevantMatching?.samples ?? [])

  return (
    <aside
      className={styles.panel}
      aria-label={`Détail de ${displayName(itin)}`}
      data-testid="itinerary-detail"
    >
      <header className={styles.header}>
        <span className={`${styles.badge} ${styles[itin.network]}`}>
          {NETWORK_BADGES[itin.network]}
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
        <button
          type="button"
          className="btn-secondary"
          data-testid="itinerary-detail-export"
          onClick={() => {
            const label = displayName(itin)
            downloadTextFile(
              gpxFilename(label),
              buildGpxDocument({
                name: label,
                coords: itineraryCoords(itin),
                attribution: gpxAttributionFor(itin.network),
                createdAt: new Date().toISOString(),
              }),
            )
          }}
        >
          Exporter en GPX
        </button>
      </div>

      {itin.details && (
        <section
          className={styles.section}
          aria-labelledby="local-title"
          data-testid="detail-local-info"
        >
          <h4 id="local-title" className={styles.sectionTitle}>
            Infos pratiques
          </h4>
          <p className={styles.localMeta}>
            {[
              itin.details.commune && `Départ : ${itin.details.commune}`,
              itin.details.difficulte && `Difficulté : ${itin.details.difficulte}`,
              itin.details.temps && `Durée : ${itin.details.temps}`,
              itin.details.denivele && `D+ annoncé : ${itin.details.denivele}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {itin.details.descriptif && (
            <p className={styles.localDescription}>{itin.details.descriptif}</p>
          )}
          {itin.details.lienWeb && (
            <a
              className={styles.localLink}
              href={itin.details.lienWeb}
              target="_blank"
              rel="noreferrer"
            >
              {/^https?:\/\/[^?#]*\.pdf(\?|#|$)/i.test(itin.details.lienWeb)
                ? 'Carte PDF du producteur'
                : 'Fiche sur le site du producteur'}{' '}
              (lien fourni par la source, parfois obsolète) →
            </a>
          )}
          <p className={styles.localSource}>
            Source : {itin.details.source} (Licence Ouverte 2.0)
          </p>
        </section>
      )}

      {etapes.length > 0 && (
        <section className={styles.section} aria-labelledby="stages-title">
          <h4 id="stages-title" className={styles.sectionTitle}>
            Étapes
          </h4>
          <p className={styles.hint}>
            Découpage régulier calculé par l’application, en tranches d’environ{' '}
            {Math.round(DEFAULT_STAGE_METERS / 1_000)} km — ce ne sont pas les
            étapes d’un topo-guide.
          </p>
          <ol className={styles.stages} data-testid="detail-stages">
            {etapes.map((etape) => (
              <li key={etape.index}>
                <button
                  type="button"
                  className={styles.stage}
                  onClick={() => {
                    focusOnBounds(etape.bounds)
                  }}
                >
                  <span className={styles.stageName}>
                    Étape {etape.index}
                    <span className={styles.stageRange}>
                      {' '}
                      {formatKm(etape.startMeters)} → {formatKm(etape.endMeters)}
                    </span>
                  </span>
                  <ProgressBalise
                    pct={etape.pct}
                    network={itin.network}
                    label={`Progression étape ${etape.index}`}
                  />
                  <span className={styles.stagePct}>{formatPct(etape.pct)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

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
            {pois.map((poi) => {
              const { phone, website, capacity, openingHours, operator, elevation } =
                poi.details
              const facts = [
                capacity && `${capacity} places`,
                openingHours && `ouvert ${openingHours}`,
                elevation && `${elevation} m`,
                operator,
                phone,
              ].filter(Boolean)
              return (
                <li key={poi.id} className={styles.poiEntry}>
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
                  {(facts.length > 0 || website) && (
                    <p className={styles.poiFacts}>
                      {facts.join(' · ')}
                      {website && (
                        <>
                          {facts.length > 0 && ' · '}
                          <a href={website} target="_blank" rel="noreferrer">
                            site
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {hasSleepingSpot && (
          <p className={styles.poiCaveat} data-testid="detail-poi-caveat">
            « Couchage libre » regroupe refuges non gardés, cabanes et
            appentis : gratuits et sans réservation, mais ni garantis ouverts
            ni entretenus. Ces informations viennent d’OpenStreetMap et
            peuvent être incomplètes ou périmées — vérifiez auprès du
            gestionnaire avant de compter dessus pour une nuit.
          </p>
        )}
      </section>
    </aside>
  )
}
