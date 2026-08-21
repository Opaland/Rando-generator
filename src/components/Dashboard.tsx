import { useMemo } from 'react'
import { useAppStore } from '../store/appStore.ts'
import type { Network } from '../core/types.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { useCountUp } from '../lib/useCountUp.ts'
import { isCompleted } from '../core/milestones.ts'
import { tracesHorsZone } from '../core/couverture.ts'
import { buildSummary, summaryFilename } from '../core/summary.ts'
import { summaryCardBlob } from '../lib/summaryCard.ts'
import { downloadBlob } from '../lib/download.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './Dashboard.module.css'

const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  LOCAL: 'Boucles locales',
  // Les itinéraires persos ont leur propre section : jamais affichés ici
  // (leur total reste à 0 dans le matching des réseaux OSM).
  PERSO: 'Mes itinéraires',
}

export function Dashboard() {
  const matching = useAppStore((s) => s.matching)
  const itineraries = useAppStore((s) => s.itineraries)
  const matchingBusy = useAppStore((s) => s.matchingBusy)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const celebration = useAppStore((s) => s.celebration)
  const dismissCelebration = useAppStore((s) => s.dismissCelebration)
  const seuilBoucle = useAppStore((s) => s.completionPct)
  const tracks = useAppStore((s) => s.tracks)

  // Le chiffre rattrape la barre : les voir bouger séparément donne
  // l'impression qu'ils ne parlent pas du même résultat.
  const pctAnime = useCountUp(matching?.global.pct ?? 0)

  const byId = useMemo(
    () => new Map(itineraries.map((i) => [i.osmRelationId, i])),
    [itineraries],
  )

  // « Bouclé » plutôt que « 100 % » : un tronçon impraticable, une déviation
  // de balisage ou une géométrie OSM imparfaite ne sont pas de la faute du
  // randonneur (cf. src/core/milestones.ts).
  const boucles = useMemo(
    () =>
      (matching?.results ?? []).filter((r) => isCompleted(r.pct, seuilBoucle))
        .length,
    [matching, seuilBoucle],
  )

  // Deux chiffres, deux périmètres. « Mes sorties » additionne toutes les
  // traces ; ce pourcentage ne porte que sur les itinéraires téléchargés.
  // Les deux sont justes, et leur écart n'était expliqué nulle part : on
  // rentre de Bretagne avec le Pilat chargé, les kilomètres montent d'un
  // côté et le pourcentage ne bouge pas de l'autre (issue #133).
  const horsZone = useMemo(
    () => tracesHorsZone(tracks, itineraries).length,
    [tracks, itineraries],
  )

  /**
   * Fabrique l'image du bilan et la propose au téléchargement. Rien ne part
   * sur le réseau : le PNG est dessiné et consommé dans l'onglet. L'image ne
   * contient que des totaux et des noms d'itinéraires publics — pas un seul
   * point GPS.
   */
  const partager = async () => {
    const etat = useAppStore.getState()
    if (!etat.matching) return
    const bilan = buildSummary({
      global: etat.matching.global,
      results: etat.matching.results,
      itineraries: etat.itineraries,
      tracks: etat.tracks,
      zoneLabel: etat.zoneLabel,
      completionPct: etat.completionPct,
    })
    const image = await summaryCardBlob(bilan)
    if (image) downloadBlob(summaryFilename(new Date().toISOString()), image)
  }

  const top5 = useMemo(() => {
    if (!matching) return []
    return matching.results
      .filter((r) => r.pct > 0)
      .sort((a, b) => b.pct - a.pct || b.doneMeters - a.doneMeters)
      .slice(0, 5)
  }, [matching])

  if (itineraries.length === 0) return null

  const global = matching?.global
  const itineraireFete = celebration
    ? byId.get(celebration.itineraryId)
    : undefined

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="dashboard-title" className={styles.title}>
          Tableau de bord
          {matchingBusy && (
            <span className={styles.busy} role="status">
              calcul…
            </span>
          )}
        </h2>
      </summary>

      {celebration && itineraireFete && (
        <p
          className={styles.celebration}
          role="status"
          data-testid="celebration"
        >
          <strong>{displayName(itineraireFete)}</strong>{' '}
          passe {celebration.milestone} %.
          <button
            type="button"
            className={styles.celebrationClose}
            aria-label="Masquer cette annonce"
            onClick={dismissCelebration}
          >
            ×
          </button>
        </p>
      )}

      {global && (
        <div className={styles.global}>
          <p className={styles.bigPct} data-testid="global-pct">
            {formatPct(pctAnime)}
          </p>
          {tracks.length === 0 ? (
            // Un zéro nu se lit comme un calcul en panne. Il dit ici d'où il
            // vient, et ce qu'il y a à gagner (issue #172).
            <p className={styles.globalDetail} data-testid="global-vide">
              Aucune sortie importée pour l’instant —{' '}
              {formatKm(global.totalMeters)} à découvrir dans cette zone.
            </p>
          ) : (
            <p className={styles.globalDetail} data-testid="global-km">
              {formatKm(global.doneMeters)} parcourus ·{' '}
              {formatKm(global.totalMeters - global.doneMeters)} restants
            </p>
          )}
          {boucles > 0 && (
            <p className={styles.globalDetail} data-testid="global-completed">
              {boucles} itinéraire{boucles > 1 ? 's' : ''} bouclé
              {boucles > 1 ? 's' : ''} (au moins {seuilBoucle} % parcourus)
            </p>
          )}
          {horsZone > 0 && (
            <p className={styles.horsZone} data-testid="global-hors-zone">
              {horsZone} de vos {tracks.length} sorties{' '}
              {horsZone > 1 ? 'sont' : 'est'} hors de la zone chargée et ne
              compte{horsZone > 1 ? 'nt' : ''} pas dans ce pourcentage.
            </p>
          )}
          <ProgressBalise pct={global.pct} label="Progression globale" />
          <button
            type="button"
            className={styles.share}
            data-testid="share-summary"
            onClick={() => {
              void partager()
            }}
          >
            Enregistrer mon bilan en image
          </button>
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
    </details>
  )
}
