import { useMemo } from 'react'
import { useAppStore } from '../store/appStore.ts'
import type { Network } from '../core/types.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './Dashboard.module.css'

const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  // Les itinéraires persos ont leur propre section : jamais affichés ici
  // (leur total reste à 0 dans le matching des réseaux OSM).
  PERSO: 'Mes itinéraires',
}

export function Dashboard() {
  const matching = useAppStore((s) => s.matching)
  const itineraries = useAppStore((s) => s.itineraries)
  const matchingBusy = useAppStore((s) => s.matchingBusy)
  const selectItinerary = useAppStore((s) => s.selectItinerary)

  const byId = useMemo(
    () => new Map(itineraries.map((i) => [i.osmRelationId, i])),
    [itineraries],
  )

  const top5 = useMemo(() => {
    if (!matching) return []
    return matching.results
      .filter((r) => r.pct > 0)
      .sort((a, b) => b.pct - a.pct || b.doneMeters - a.doneMeters)
      .slice(0, 5)
  }, [matching])

  if (itineraries.length === 0) return null

  const global = matching?.global

  return (
    <section className={styles.section} aria-labelledby="dashboard-title">
      <h2 id="dashboard-title" className={styles.title}>
        Tableau de bord
        {matchingBusy && (
          <span className={styles.busy} role="status">
            calcul…
          </span>
        )}
      </h2>

      {global && (
        <div className={styles.global}>
          <p className={styles.bigPct} data-testid="global-pct">
            {formatPct(global.pct)}
          </p>
          <p className={styles.globalDetail} data-testid="global-km">
            {formatKm(global.doneMeters)} parcourus ·{' '}
            {formatKm(global.totalMeters - global.doneMeters)} restants
          </p>
          <ProgressBalise pct={global.pct} label="Progression globale" />
        </div>
      )}

      {matching && (
        <dl className={styles.networks} data-testid="network-stats">
          {(Object.keys(NETWORK_LABELS) as Network[]).map((network) => {
            const stats = matching.byNetwork[network]
            if (stats.totalMeters === 0) return null
            return (
              <div key={network} className={styles.network}>
                <dt>{NETWORK_LABELS[network]}</dt>
                <dd>
                  <ProgressBalise
                    pct={stats.pct}
                    network={network}
                    label={`Progression ${NETWORK_LABELS[network]}`}
                  />
                  <span className={styles.networkDetail}>
                    {formatPct(stats.pct)} · {formatKm(stats.doneMeters)} /{' '}
                    {formatKm(stats.totalMeters)}
                  </span>
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      {top5.length > 0 && (
        <div className={styles.top}>
          <h3 className={styles.subtitle}>Vos 5 itinéraires les plus avancés</h3>
          <ol className={styles.topList} data-testid="top5">
            {top5.map((result) => {
              const itin = byId.get(result.itineraryId)
              if (!itin) return null
              return (
                <li key={result.itineraryId}>
                  <button
                    type="button"
                    className={styles.topItem}
                    onClick={() => {
                      selectItinerary(result.itineraryId)
                    }}
                  >
                    <span className={styles.topName}>{displayName(itin)}</span>
                    <ProgressBalise
                      pct={result.pct}
                      network={itin.network}
                      label={`Progression ${displayName(itin)}`}
                    />
                    <span className={styles.topPct}>{formatPct(result.pct)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
