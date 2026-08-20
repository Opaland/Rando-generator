import { useEffect, useState, type FormEvent } from 'react'
import { FEATURED_ROUTES, ZONES } from '../core/overpass.ts'
import { formatOctets } from '../lib/format.ts'
import { useAppStore } from '../store/appStore.ts'
import styles from './ZonePicker.module.css'

const STAGE_TEXT: Record<'requesting' | 'retrying' | 'processing', string> = {
  requesting:
    'Interrogation d’OpenStreetMap… comptez 30 secondes à 2 minutes selon la charge des serveurs.',
  retrying:
    'Premier serveur injoignable, nouvelle tentative sur un second serveur…',
  processing: 'Réponse reçue, traitement des tracés…',
}

export function ZonePicker() {
  const zoneKey = useAppStore((s) => s.zoneKey)
  const zoneLabel = useAppStore((s) => s.zoneLabel)
  const zoneLoading = useAppStore((s) => s.zoneLoading)
  const zoneLoadStage = useAppStore((s) => s.zoneLoadStage)
  const zoneLoadBytes = useAppStore((s) => s.zoneLoadBytes)
  const zoneError = useAppStore((s) => s.zoneError)
  const zoneFetchedAt = useAppStore((s) => s.zoneFetchedAt)
  const itineraries = useAppStore((s) => s.itineraries)
  const loadZone = useAppStore((s) => s.loadZone)
  const loadRef = useAppStore((s) => s.loadRef)
  const chercherLieu = useAppStore((s) => s.chercherLieu)
  const loadAutour = useAppStore((s) => s.loadAutour)
  const effacerLieux = useAppStore((s) => s.effacerLieux)
  const lieux = useAppStore((s) => s.lieux)
  const lieuxLoading = useAppStore((s) => s.lieuxLoading)
  const lieuError = useAppStore((s) => s.lieuError)
  const lieuxVides = useAppStore((s) => s.lieuxVides)
  const cancelZoneLoad = useAppStore((s) => s.cancelZoneLoad)
  const zoneRestoredAtStartup = useAppStore((s) => s.zoneRestoredAtStartup)
  const [refInput, setRefInput] = useState('')
  const [lieuInput, setLieuInput] = useState('')
  /**
   * null = suivre l'état des données ; dès que l'utilisateur ouvre ou ferme
   * la section, c'est son choix qui prime.
   *
   * La section est repliée uniquement quand la zone vient du cache au
   * démarrage — « je reviens voir ma progression » — et pas après un clic de
   * l'utilisateur, qui est peut-être en train d'en essayer plusieurs.
   */
  const [ouvert, setOuvert] = useState<boolean | null>(null)
  const [elapsedS, setElapsedS] = useState(0)

  useEffect(() => {
    if (!zoneLoading) return
    const start = Date.now()
    const tick = () => {
      setElapsedS(Math.round((Date.now() - start) / 1000))
    }
    // Affiche 0 s immédiatement plutôt que d'attendre le premier tick.
    tick()
    const id = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [zoneLoading])

  const onRefSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (refInput.trim()) void loadRef(refInput)
  }

  const onLieuSubmit = (event: FormEvent) => {
    event.preventDefault()
    void chercherLieu(lieuInput)
  }

  const deplie = ouvert ?? !zoneRestoredAtStartup

  return (
    <section className={styles.section} aria-labelledby="zone-title">
      {/*
        Section entièrement contrôlée : le navigateur émet un événement
        `toggle` au montage quand l'élément démarre ouvert, ce qui figerait
        aussitôt le « choix de l'utilisateur ». On intercepte donc le clic
        sur la poignée plutôt que d'écouter le résultat.
      */}
      <details
        className={styles.picker}
        data-testid="zone-section"
        open={deplie}
      >
        <summary
          className="acc-summary"
          onClick={(e) => {
            e.preventDefault()
            setOuvert(!deplie)
          }}
        >
          <h2 id="zone-title" className={styles.title}>
            Zone
            {zoneLabel && (
              <span className={styles.zoneActiveName}> · {zoneLabel}</span>
            )}
          </h2>
        </summary>
      {/*
        La recherche par lieu vient en premier : c'est la seule entrée qui ne
        suppose rien. « GR », « ref », « département » sont justes et
        supposent tout acquis — quelqu'un qui débute connaît sa ville
        (issue #131).
      */}
      <form className={styles.lieuForm} onSubmit={onLieuSubmit}>
        <label className={styles.lieuLabel} htmlFor="lieu-input">
          Des sentiers autour d’une ville
        </label>
        <div className={styles.refRow}>
          <input
            id="lieu-input"
            data-testid="lieu-input"
            type="search"
            placeholder="ex. Saint-Étienne"
            value={lieuInput}
            disabled={zoneLoading}
            onChange={(e) => {
              setLieuInput(e.target.value)
            }}
          />
          <button
            type="submit"
            className="btn-primary"
            data-testid="lieu-submit"
            disabled={zoneLoading || lieuxLoading || !lieuInput.trim()}
          >
            {lieuxLoading ? 'Recherche…' : 'Chercher'}
          </button>
        </div>
      </form>

      {lieuError && (
        <p className={styles.lieuError} role="alert" data-testid="lieu-error">
          {lieuError}
        </p>
      )}

      {lieuxVides && (
        <p className={styles.lieuHint} role="status" data-testid="lieu-empty">
          Aucune commune de ce nom. Vérifiez l’orthographe, ou choisissez une
          zone ci-dessous.
        </p>
      )}

      {lieux.length > 0 && (
        <ul className={styles.lieux} data-testid="lieu-results">
          {lieux.map((lieu) => (
            <li key={`${lieu.label}-${lieu.center.join(',')}`}>
              <button
                type="button"
                className={styles.lieu}
                disabled={zoneLoading}
                onClick={() => void loadAutour(lieu)}
              >
                <span className={styles.lieuNom}>{lieu.label}</span>
                {lieu.contexte && (
                  <span className={styles.lieuContexte}>{lieu.contexte}</span>
                )}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="btn-link"
              data-testid="lieu-clear"
              onClick={effacerLieux}
            >
              Annuler
            </button>
          </li>
        </ul>
      )}

      <p className={styles.groupTitle} id="proches-title">
        Ou une zone entière
      </p>
      <div
        className={styles.zones}
        role="group"
        aria-labelledby="proches-title"
      >
        {ZONES.filter((zone) => zone.group === 'proche').map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={zoneKey === zone.id ? styles.zoneActive : styles.zone}
            aria-pressed={zoneKey === zone.id}
            data-testid={`zone-${zone.id}`}
            disabled={zoneLoading}
            onClick={() => void loadZone(zone.id)}
          >
            {zone.label}
          </button>
        ))}
      </div>

      <p className={styles.groupTitle} id="aura-title">
        Auvergne-Rhône-Alpes, par département
      </p>
      <div className={styles.zones} role="group" aria-labelledby="aura-title">
        {ZONES.filter((zone) => zone.group === 'aura').map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={zoneKey === zone.id ? styles.zoneActive : styles.zone}
            aria-pressed={zoneKey === zone.id}
            data-testid={`zone-${zone.id}`}
            disabled={zoneLoading}
            onClick={() => void loadZone(zone.id)}
          >
            {zone.label}
          </button>
        ))}
      </div>

      <p className={styles.groupTitle} id="featured-title">
        Grands itinéraires
      </p>
      <div
        className={styles.featured}
        role="group"
        aria-labelledby="featured-title"
      >
        {FEATURED_ROUTES.map((route) => {
          const key = `ref:${route.ref.toUpperCase()}`
          return (
            <button
              key={route.ref}
              type="button"
              className={zoneKey === key ? styles.zoneActive : styles.zone}
              aria-pressed={zoneKey === key}
              data-testid={`featured-${route.ref.replace(/\s+/g, '').toLowerCase()}`}
              disabled={zoneLoading}
              onClick={() => void loadRef(route.ref)}
            >
              <span className={styles.featuredRef}>{route.label}</span>
              <span className={styles.featuredHint}>{route.hint}</span>
            </button>
          )
        })}
      </div>

      <form className={styles.refForm} onSubmit={onRefSubmit}>
        <label className={styles.refLabel} htmlFor="ref-input">
          Ou par ref d’itinéraire
        </label>
        <div className={styles.refRow}>
          <input
            id="ref-input"
            data-testid="ref-input"
            type="text"
            placeholder="ex. GR 20"
            value={refInput}
            disabled={zoneLoading}
            onChange={(e) => {
              setRefInput(e.target.value)
            }}
          />
          <button
            type="submit"
            className="btn-primary"
            data-testid="ref-submit"
            disabled={zoneLoading || !refInput.trim()}
          >
            Charger
          </button>
        </div>
      </form>

      </details>

      {zoneLoading && (
        <div className={styles.waiting} role="status" data-testid="zone-loading">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.waitingText}>
            {STAGE_TEXT[zoneLoadStage ?? 'requesting']}
            {elapsedS > 0 && (
              <span className={styles.elapsed} data-testid="zone-loading-elapsed">
                {' '}
                ({elapsedS} s)
              </span>
            )}
            {zoneLoadBytes > 0 && (
              <span
                className={styles.received}
                data-testid="zone-loading-bytes"
              >
                {formatOctets(zoneLoadBytes)} reçus
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn-link"
            data-testid="zone-cancel"
            onClick={cancelZoneLoad}
          >
            Annuler
          </button>
          <span className={styles.dontReload}>
            Ne rechargez pas la page : la requête repartirait de zéro et
            chargerait un peu plus les serveurs. Une fois reçue, la zone est
            gardée sur votre appareil — les fois suivantes sont immédiates.
          </span>
        </div>
      )}

      {zoneError && (
        <p className={styles.error} role="alert" data-testid="zone-error">
          {zoneError}
        </p>
      )}

      {!zoneLoading && zoneKey && (
        <p className={styles.meta} data-testid="zone-meta">
          {itineraries.length} itinéraire{itineraries.length > 1 ? 's' : ''}
          {zoneFetchedAt &&
            ` · tracés du ${new Date(zoneFetchedAt).toLocaleDateString('fr-FR')}`}
          <button
            type="button"
            className="btn-link"
            data-testid="zone-refresh"
            onClick={() => {
              if (zoneKey.startsWith('ref:')) {
                if (zoneLabel) void loadRef(zoneLabel, { force: true })
              } else {
                void loadZone(zoneKey, { force: true })
              }
            }}
          >
            Actualiser les tracés
          </button>
        </p>
      )}
    </section>

  )
}
