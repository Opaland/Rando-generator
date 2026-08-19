import { useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import type { Network } from '../core/types.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryList.module.css'

type SortKey = 'pct' | 'name' | 'length'

const NETWORKS: Network[] = ['GR', 'GRP', 'PR']

export function ItineraryList() {
  const itineraries = useAppStore((s) => s.itineraries)
  const matching = useAppStore((s) => s.matching)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)

  const [query, setQuery] = useState('')
  const [networks, setNetworks] = useState<Set<Network>>(new Set(NETWORKS))
  const [sortKey, setSortKey] = useState<SortKey>('pct')

  const resultById = useMemo(
    () => new Map((matching?.results ?? []).map((r) => [r.itineraryId, r])),
    [matching],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = itineraries.filter((itin) => {
      if (!networks.has(itin.network)) return false
      if (!normalizedQuery) return true
      return `${itin.ref ?? ''} ${itin.name ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery)
    })
    const pctOf = (id: number) => resultById.get(id)?.pct ?? 0
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'pct':
          return (
            pctOf(b.osmRelationId) - pctOf(a.osmRelationId) ||
            displayName(a).localeCompare(displayName(b), 'fr')
          )
        case 'length':
          return b.totalMeters - a.totalMeters
        case 'name':
          return displayName(a).localeCompare(displayName(b), 'fr')
      }
    })
  }, [itineraries, query, networks, sortKey, resultById])

  if (itineraries.length === 0) return null

  const toggleNetwork = (network: Network) => {
    setNetworks((prev) => {
      const next = new Set(prev)
      if (next.has(network)) next.delete(network)
      else next.add(network)
      return next
    })
  }

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="list-title" className={styles.title}>
          Itinéraires ({rows.length})
        </h2>
      </summary>

      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          placeholder="Filtrer par nom ou ref…"
          aria-label="Filtrer les itinéraires par texte"
          data-testid="list-filter"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
        />
        <div
          className={styles.networkFilters}
          role="group"
          aria-label="Filtrer par réseau"
        >
          {NETWORKS.map((network) => (
            <label key={network} className={styles.networkToggle}>
              <input
                type="checkbox"
                checked={networks.has(network)}
                onChange={() => {
                  toggleNetwork(network)
                }}
              />
              {network}
            </label>
          ))}
        </div>
        <label className={styles.sort}>
          Trier par{' '}
          <select
            value={sortKey}
            data-testid="list-sort"
            onChange={(e) => {
              setSortKey(e.target.value as SortKey)
            }}
          >
            <option value="pct">progression</option>
            <option value="name">nom</option>
            <option value="length">longueur</option>
          </select>
        </label>
      </div>

      <ul className={styles.list} data-testid="itinerary-list">
        {rows.map((itin) => {
          const result = resultById.get(itin.osmRelationId)
          const pct = result?.pct ?? 0
          const selected = selectedItineraryId === itin.osmRelationId
          return (
            <li key={itin.osmRelationId}>
              <button
                type="button"
                className={selected ? styles.rowSelected : styles.row}
                aria-pressed={selected}
                onClick={() => {
                  selectItinerary(selected ? null : itin.osmRelationId)
                }}
              >
                <span className={`${styles.badge} ${styles[itin.network]}`}>
                  {itin.network}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{displayName(itin)}</span>
                  {itin.ref && itin.name && (
                    <span className={styles.rowSub}>{itin.name}</span>
                  )}
                  <ProgressBalise
                    pct={pct}
                    network={itin.network}
                    label={`Progression ${displayName(itin)}`}
                  />
                </span>
                <span className={styles.rowStats}>
                  <span className={styles.rowPct}>{formatPct(pct)}</span>
                  <span className={styles.rowKm}>
                    {formatKm(itin.totalMeters)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
