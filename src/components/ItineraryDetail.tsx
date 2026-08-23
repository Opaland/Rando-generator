import { useAppStore } from '../store/appStore.ts'
import {
  displayName,
  formatAnciennete,
  formatDetour,
  formatKm,
  formatPct,
} from '../lib/format.ts'
import { POI_LABELS, POI_OVERNIGHT, mentionEau } from '../lib/poiDisplay.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import { elevationStats } from '../core/elevation.ts'
import { itineraryCoords } from '../core/mapdata.ts'
import { situerPois } from '../core/poiDistance.ts'
import { DEFAULT_STAGE_METERS, buildStages } from '../core/stages.ts'
import { assessItinerary } from '../core/dataQuality.ts'
import {
  buildGpxDocument,
  gpxAttributionFor,
  gpxFilename,
} from '../core/gpxExport.ts'
import { downloadTextFile } from '../lib/download.ts'
import { ElevationChart } from './ElevationChart.tsx'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryDetail.module.css'
import { penteMaximale, libellePente } from '../core/pente.ts'
import { bandesDeRevetement } from '../core/revetement.ts'

/**
 * Fiche détail d'un itinéraire, ouverte en cliquant son tracé sur la carte :
 * profil altimétrique (service IGN), points d'intérêt proches (Overpass),
 * et une inclinaison de caméra sur le tracé — une perspective, pas un relief
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
  const poisBruts = useAppStore((s) => s.pois)
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
  // Les POI viennent de boîtes englobantes larges de plusieurs kilomètres :
  // sans mesure, « à proximité » était une promesse que personne n'avait
  // vérifiée (issue #122). On les situe, du plus proche au plus lointain, et
  // on affiche ce qu'ils coûtent — un aller-retour, pas une distance à vol
  // d'oiseau.
  const pois = situerPois(poisBruts, itineraryCoords(itin))

  const stats = elevationProfile ? elevationStats(elevationProfile.elevations) : null
  // Pente maximale (issue #179) : Farid, en fauteuil, et Nadia et Yann avec
  // une poussette en ont besoin pour décider de s'engager. Le chiffre n'est
  // jamais rendu seul — `libellePente` porte la résolution avec lui.
  const pente = elevationProfile ? penteMaximale(elevationProfile) : null
  // Les bandes viennent de la géométrie complète des ways, pas du profil
  // sous-échantillonné : leur axe est la même distance cumulée, elles se
  // superposent donc sans réattribution point par point (issue #179).
  const bandes = bandesDeRevetement(itin)
  const hasSleepingSpot = pois.some((poi) => POI_OVERNIGHT.includes(poi.kind))
  // Un long GR ne se lit pas en un seul pourcentage : on le découpe en
  // étapes calculées (les découpages des topo-guides sont éditoriaux, donc
  // hors de portée — cf. src/core/stages.ts).
  const etapes = buildStages(itin, relevantMatching?.samples ?? [])
  // Une relation trouée produit un pourcentage faux sans le dire : le
  // signaler ne répare rien, mais rend le chiffre lisible.
  const qualite = assessItinerary(itin, new Date().toISOString())


  return (
    <aside
      className={styles.panel}
      aria-label={`Détail de ${displayName(itin)}`}
      data-testid="itinerary-detail"
    >
      {/*
        Le titre tient sa ligne, l'action passe en dessous.

        « Incliner la carte » prenait 145 px des 380 de la fiche, et le
        sous-titre se cassait en trois lignes — « GR 7 — / Traversée du /
        Pilat » (AUDIT_UX.md, constat U10). Le sous-titre est le seul endroit
        qui nomme l'itinéraire en toutes lettres ; c'est lui qui doit avoir la
        largeur, pas un bouton.

        Écarté : raccourcir le libellé du bouton. Il avait été renommé de
        « Vue 3D » précisément pour dire ce qu'il fait, et le raccourcir
        reviendrait à défaire cela pour gagner des pixels.
      */}
      <header className={styles.header}>
        <div className={styles.identite}>
          <span className={`${styles.badge} ${styles[itin.network]}`}>
            {NETWORK_BADGES[itin.network]}
          </span>
          <div className={styles.titleBlock}>
            <h3 className={styles.name}>{displayName(itin)}</h3>
            {itin.ref && itin.name && <p className={styles.sub}>{itin.name}</p>}
          </div>
          <button
            type="button"
            className="btn-icon-close"
            aria-label="Fermer la fiche détail"
            data-testid="itinerary-detail-close"
            onClick={closeItineraryDetail}
          >
            ×
          </button>
        </div>
        <button
          type="button"
          className={view3D ? styles.view3dActive : styles.view3d}
          aria-pressed={view3D}
          data-testid="detail-3d-toggle"
          onClick={toggleView3D}
        >
          {view3D ? 'Remettre à plat' : 'Incliner la carte'}
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

      {(qualite.warnings.length > 0 || itin.osmUpdatedAt) && (
        <section className={styles.section} data-testid="detail-quality">
          <h4 className={styles.sectionTitle}>Qualité de la donnée</h4>
          <ul className={styles.quality}>
            {qualite.warnings.map((avertissement) => (
              <li key={avertissement}>{avertissement}</li>
            ))}
            {itin.osmUpdatedAt && (
              <li data-testid="detail-osm-updated">
                Tracé modifié dans OpenStreetMap le{' '}
                {new Date(itin.osmUpdatedAt).toLocaleDateString('fr-FR')}
                {qualite.upstreamAgeDays !== null &&
                  ` (${formatAnciennete(qualite.upstreamAgeDays)})`}
                . Un itinéraire balisé qui n’a pas bougé depuis longtemps n’est
                pas forcément faux — mais le pourcentage affiché dépend de ce
                tracé-là.
              </li>
            )}
          </ul>
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
            {/* `key` : changer d'itinéraire remet à zéro le zoom et le
                curseur du profil, sans effet de synchronisation. */}
            <ElevationChart
              key={detailItineraryId}
              profile={elevationProfile}
              bandes={bandes}
            />
            <p className={styles.elevationStats}>
              D+ {Math.round(stats.gain)} m · D− {Math.round(stats.loss)} m ·{' '}
              {Math.round(stats.min)}–{Math.round(stats.max)} m
            </p>
            {pente && (
              <p className={styles.pente} data-testid="pente-max">
                <strong>Pente</strong> : {libellePente(pente)}
              </p>
            )}
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
          <p className={styles.hint}>
            Du plus proche au plus lointain. Le détour indiqué est un
            aller-retour depuis le tracé, à vol d’oiseau : le chemin réel sera
            plus long.
          </p>
        )}
        {pois.length > 0 && (
          <ul className={styles.poiList} data-testid="detail-poi-list">
            {pois.map((poi) => {
              const { phone, website, capacity, openingHours, operator, elevation } =
                poi.details
              const facts = [
                `${formatDetour(poi.detourMeters)} de détour`,
                mentionEau(poi.details),
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
