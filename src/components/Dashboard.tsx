import { useMemo } from 'react'
import { useAppStore } from '../store/appStore.ts'
import type { Network } from '../core/types.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { useCountUp } from '../lib/useCountUp.ts'
import { isCompleted } from '../core/milestones.ts'
import { tracesHorsZone } from '../core/couverture.ts'
import {
  chiffresDeCompletion,
  etatDuBilan,
  libelleSousLeChiffre,
} from '../core/declaratif.ts'
import { buildSummary, summaryFilename } from '../core/summary.ts'
import { summaryCardBlob } from '../lib/summaryCard.ts'
import { downloadBlob } from '../lib/download.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './Dashboard.module.css'

const NETWORK_LABELS: Record<Network, string> = {
  GR: 'GR',
  GRP: 'GR de Pays',
  PR: 'PR',
  // Au pluriel comme ses voisins : le tableau de bord agrège des kilomètres.
  INTERNATIONAL: 'Itinéraires internationaux',
  LOCAL: 'Boucles locales',
  // Les itinéraires persos ont leur propre section : jamais affichés ici
  // (leur total reste à 0 dans le matching des réseaux OSM).
  PERSO: 'Mes itinéraires',
  // Le tableau de bord compte des kilomètres, pas des promesses : au pluriel
  // ici, parce qu'il en agrège plusieurs (issue #284).
  INCONNU: 'Réseau non déclaré',
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
  const parcoursDeclares = useAppStore((s) => s.parcoursDeclares)

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
  /*
    Les deux chiffres, côte à côte et jamais additionnés (issue #158).

    Le grand pourcentage reste **le mesuré**, et rien d'autre : c'est lui qui
    porte la promesse « le chiffre est vrai ». Le déclaratif s'affiche à part,
    en toutes lettres, et seulement quand il existe — quelqu'un qui n'a rien
    coché ne verra jamais le mot « mesurés ».
  */
  // `global` ne vaut que si `matching` vaut : la mesure déjà faite sur chaque
  // itinéraire se lit donc sans détour, et c'est elle qui empêche de compter
  // deux fois un sentier parcouru à moitié puis coché.
  const etatBilan = etatDuBilan({
    traces: tracks.length,
    declarations: parcoursDeclares.length,
  })
  const chiffres =
    matching && global
      ? chiffresDeCompletion(global, itineraries, parcoursDeclares, {
          mesuresParItineraire: new Map(
            matching.results.map((r) => [r.itineraryId, r.doneMeters]),
          ),
        })
      : null
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
          {/*
            Un zéro nu se lit comme un calcul en panne : il dit ici d'où il
            vient (issue #172). Depuis #158, « d'où il vient » a trois
            réponses et non deux — quelqu'un qui n'a coché que des
            déclarations n'a pas « rien fait », et le lui dire était faux
            (revue globale du 23/08).
          */}
          <p
            className={styles.globalDetail}
            data-testid={
              etatBilan === 'mesure' ? 'global-km' : `global-${etatBilan === 'declare' ? 'declare-etat' : 'vide'}`
            }
          >
            {libelleSousLeChiffre(etatBilan, global)}
          </p>
          {chiffres && chiffres.pctDeclare > 0 && (
            <p className={styles.declare} data-testid="global-declare">
              <strong>{formatPct(chiffres.pctDeclare)} déclarés</strong> en
              plus, sur {formatKm(chiffres.metresDeclares)} d’itinéraires
              cochés à la main. Ce chiffre-là n’est pas mesuré : il n’entre ni
              dans le pourcentage ci-dessus, ni dans les tronçons restants, ni
              dans les suggestions de prochaine sortie.
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
