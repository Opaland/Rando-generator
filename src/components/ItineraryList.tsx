import { useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import {
  ALL_FILTERS,
  itineraryFacts,
  matchesFilters,
  type DiscoveryFilters,
} from '../core/discovery.ts'
import { isCompleted } from '../core/milestones.ts'
import type { LonLat, Network } from '../core/types.ts'
import {
  displayName,
  formatDuration,
  formatKm,
  formatPct,
} from '../lib/format.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryList.module.css'

type SortKey = 'pct' | 'name' | 'length' | 'duration'

const NETWORKS: Network[] = ['GR', 'GRP', 'PR', 'LOCAL']

interface Plage {
  label: string
  minKm: number | null
  maxKm: number | null
}

const TOUTES_LONGUEURS: Plage = { label: 'toutes', minKm: null, maxKm: null }

const LONGUEURS: Plage[] = [
  TOUTES_LONGUEURS,
  { label: 'moins de 5 km', minKm: null, maxKm: 5 },
  { label: '5 à 10 km', minKm: 5, maxKm: 10 },
  { label: '10 à 20 km', minKm: 10, maxKm: 20 },
  { label: 'plus de 20 km', minKm: 20, maxKm: null },
]

const DUREES: { label: string; minutes: number | null }[] = [
  { label: 'peu importe', minutes: null },
  { label: 'moins d’1 h', minutes: 60 },
  { label: 'moins de 2 h', minutes: 120 },
  { label: 'moins de 3 h', minutes: 180 },
  { label: 'moins de 4 h', minutes: 240 },
  { label: 'moins de 6 h', minutes: 360 },
]

const DENIVELES: { label: string; gain: number | null }[] = [
  { label: 'peu importe', gain: null },
  { label: 'moins de 100 m', gain: 100 },
  { label: 'moins de 300 m', gain: 300 },
  { label: 'moins de 600 m', gain: 600 },
  { label: 'moins de 1 000 m', gain: 1_000 },
]

const PROXIMITES: { label: string; km: number | null }[] = [
  { label: 'partout', km: null },
  { label: 'à moins de 5 km', km: 5 },
  { label: 'à moins de 10 km', km: 10 },
  { label: 'à moins de 25 km', km: 25 },
  { label: 'à moins de 50 km', km: 50 },
]

/** Convertit la valeur d'un <select> d'index en index sûr. */
function toIndex(value: string, length: number): number {
  const index = Number(value)
  return Number.isInteger(index) && index >= 0 && index < length ? index : 0
}

export function ItineraryList() {
  const itineraries = useAppStore((s) => s.itineraries)
  const matching = useAppStore((s) => s.matching)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const userPosition = useAppStore((s) => s.userPosition)

  const [query, setQuery] = useState('')
  const [networks, setNetworks] = useState<Set<Network>>(new Set(NETWORKS))
  const [sortKey, setSortKey] = useState<SortKey>('pct')
  const [longueurIndex, setLongueurIndex] = useState(0)
  const [dureeIndex, setDureeIndex] = useState(0)
  const [deniveleIndex, setDeniveleIndex] = useState(0)
  const [proximiteIndex, setProximiteIndex] = useState(0)
  const [shape, setShape] = useState<DiscoveryFilters['shape']>('all')

  const resultById = useMemo(
    () => new Map((matching?.results ?? []).map((r) => [r.itineraryId, r])),
    [matching],
  )

  const filters = useMemo<DiscoveryFilters>(() => {
    const plage = LONGUEURS[longueurIndex] ?? TOUTES_LONGUEURS
    return {
      ...ALL_FILTERS,
      minKm: plage.minKm,
      maxKm: plage.maxKm,
      maxMinutes: DUREES[dureeIndex]?.minutes ?? null,
      maxGain: DENIVELES[deniveleIndex]?.gain ?? null,
      maxAwayKm: PROXIMITES[proximiteIndex]?.km ?? null,
      shape,
    }
  }, [longueurIndex, dureeIndex, deniveleIndex, proximiteIndex, shape])

  const filtresActifs =
    filters.minKm !== null ||
    filters.maxKm !== null ||
    filters.maxMinutes !== null ||
    filters.maxGain !== null ||
    filters.maxAwayKm !== null ||
    filters.shape !== 'all'

  // Le GPS bouge en permanence : la position est arrondie à ~100 m pour ne
  // pas recalculer la distance de chaque itinéraire à chaque relevé. Elle
  // n'est lue que si le filtre de proximité est utilisé.
  const depuis = useMemo<LonLat | null>(() => {
    if (!userPosition || filters.maxAwayKm === null) return null
    return [
      Math.round(userPosition.lon * 1_000) / 1_000,
      Math.round(userPosition.lat * 1_000) / 1_000,
    ]
  }, [userPosition, filters.maxAwayKm])

  const factsById = useMemo(
    () =>
      new Map(
        itineraries.map((itin) => [
          itin.osmRelationId,
          itineraryFacts(itin, depuis),
        ]),
      ),
    [itineraries, depuis],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = itineraries.filter((itin) => {
      if (!networks.has(itin.network)) return false
      const facts = factsById.get(itin.osmRelationId)
      if (facts && !matchesFilters(facts, filters)) return false
      if (!normalizedQuery) return true
      return `${itin.ref ?? ''} ${itin.name ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery)
    })
    const pctOf = (id: number) => resultById.get(id)?.pct ?? 0
    const minutesOf = (id: number) => factsById.get(id)?.minutes ?? 0
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'pct':
          return (
            pctOf(b.osmRelationId) - pctOf(a.osmRelationId) ||
            displayName(a).localeCompare(displayName(b), 'fr')
          )
        case 'length':
          return b.totalMeters - a.totalMeters
        case 'duration':
          return minutesOf(a.osmRelationId) - minutesOf(b.osmRelationId)
        case 'name':
          return displayName(a).localeCompare(displayName(b), 'fr')
      }
    })
  }, [itineraries, query, networks, sortKey, resultById, factsById, filters])

  if (itineraries.length === 0) return null

  const toggleNetwork = (network: Network) => {
    setNetworks((prev) => {
      const next = new Set(prev)
      if (next.has(network)) next.delete(network)
      else next.add(network)
      return next
    })
  }

  const reinitialiser = () => {
    setLongueurIndex(0)
    setDureeIndex(0)
    setDeniveleIndex(0)
    setProximiteIndex(0)
    setShape('all')
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
              {NETWORK_BADGES[network]}
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
            <option value="duration">durée</option>
          </select>
        </label>
      </div>

      <details className={styles.discovery} data-testid="discovery-filters">
        <summary className={styles.discoverySummary}>
          Trouver une sortie{filtresActifs ? ' — filtres actifs' : ''}
        </summary>
        <div className={styles.discoveryGrid}>
          <label className={styles.sort}>
            Longueur{' '}
            <select
              value={longueurIndex}
              data-testid="list-length"
              onChange={(e) => {
                setLongueurIndex(toIndex(e.target.value, LONGUEURS.length))
              }}
            >
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
              value={dureeIndex}
              data-testid="list-duration"
              onChange={(e) => {
                setDureeIndex(toIndex(e.target.value, DUREES.length))
              }}
            >
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
              value={deniveleIndex}
              data-testid="list-gain"
              onChange={(e) => {
                setDeniveleIndex(toIndex(e.target.value, DENIVELES.length))
              }}
            >
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
          <label className={styles.sort}>
            Proximité{' '}
            <select
              value={proximiteIndex}
              data-testid="list-nearby"
              onChange={(e) => {
                setProximiteIndex(toIndex(e.target.value, PROXIMITES.length))
              }}
            >
              {PROXIMITES.map((proximite, index) => (
                <option key={proximite.label} value={index}>
                  {proximite.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filters.maxAwayKm !== null && !userPosition && (
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

      {rows.length === 0 && (
        <p className={styles.hint} data-testid="list-empty">
          Aucun itinéraire ne correspond. Élargissez les critères — ou chargez
          une zone voisine.
        </p>
      )}

      <ul className={styles.list} data-testid="itinerary-list">
        {rows.map((itin) => {
          const result = resultById.get(itin.osmRelationId)
          const facts = factsById.get(itin.osmRelationId)
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
                  {NETWORK_BADGES[itin.network]}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{displayName(itin)}</span>
                  {itin.ref && itin.name && (
                    <span className={styles.rowSub}>{itin.name}</span>
                  )}
                  {facts && (
                    <span className={styles.rowFacts}>
                      <span
                        title={
                          facts.minutesSource === 'estimated'
                            ? 'Durée estimée : 4 km/h à plat, 300 m de montée à l’heure'
                            : 'Durée annoncée par la source'
                        }
                      >
                        {facts.minutesSource === 'estimated' ? '≈ ' : ''}
                        {formatDuration(facts.minutes)}
                      </span>
                      {facts.gainMeters !== null && (
                        <span> · {Math.round(facts.gainMeters)} m D+</span>
                      )}
                      {facts.shape === 'loop' && <span> · boucle</span>}
                    </span>
                  )}
                  <ProgressBalise
                    pct={pct}
                    network={itin.network}
                    label={`Progression ${displayName(itin)}`}
                  />
                </span>
                <span className={styles.rowStats}>
                  <span className={styles.rowPct}>
                    {formatPct(pct)}
                    {isCompleted(pct) && (
                      <span className={styles.done} title="Itinéraire bouclé">
                        {' '}
                        ✓
                      </span>
                    )}
                  </span>
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
