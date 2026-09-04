import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  FEATURED_ROUTES,
  ZONES,
  type ZoneGroup,
} from '../core/overpass.ts'
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

/**
 * Les groupes de zones, dans l'ordre où ils s'affichent.
 *
 * Deux blocs identiques étaient copiés-collés — le même `<p>`, le même
 * `<div role="group">`, le même bouton, à un filtre près. Ajouter le massif
 * vosgien (#286) en aurait fait un troisième, et la troisième copie est
 * toujours celle qui diverge (CLAUDE.md §4). L'identifiant du groupe sert
 * aussi d'ancre `aria-labelledby`, ce qui garantit qu'un groupe ajouté
 * ici arrive nommé pour un lecteur d'écran, et pas seulement peint.
 */
const GROUPES: { id: ZoneGroup; titre: string }[] = [
  { id: 'proche', titre: 'Autour de chez moi' },
  { id: 'aura', titre: 'Auvergne-Rhône-Alpes, par département' },
  { id: 'vosges', titre: 'Massif vosgien, par département' },
]

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
  const rafraichirZone = useAppStore((s) => s.rafraichirZone)
  const zoneRestoredAtStartup = useAppStore((s) => s.zoneRestoredAtStartup)
  /*
    Amener l'alerte sous les yeux quand elle apparaît — et seulement alors.

    `block: 'nearest'` est le cœur du choix : si le message est déjà dans la
    fenêtre, il **ne bouge rien**. Le défilement ne se produit donc que dans
    le cas où, sans lui, la personne ne verrait rien — typiquement un bouton
    de zone pris dans un groupe du bas, où remonter l'alerte ne suffit pas.

    Un défilement qui répond au propre clic de la personne n'est pas une
    surprise ; un `'center'` ou un `'start'` en serait une, parce qu'il
    déplacerait la page même quand rien ne le demande.
  */
  const alerteZone = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (zoneError) alerteZone.current?.scrollIntoView({ block: 'nearest' })
  }, [zoneError])

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

      {/*
        La réponse se met là où la personne regarde, pas à la fin du panneau
        (#497).

        Zoé a essayé Nouméa depuis un portable, et n'a rien vu : le message
        existait, mais il fallait faire défiler. Mesuré à 1 280 × 800 avant
        de toucher quoi que ce soit — le bouton cliqué était à 268 px, le
        panneau descendait jusqu'à 1 264, et le message atterrissait à
        **1 274 px**, soit 474 sous la ligne de flottaison et 945 sous le
        bouton qui l'avait provoqué. `elementFromPoint` à son centre ne
        rendait rien : à cet endroit il n'y a pas d'écran.

        La cause était structurelle : la réponse était ajoutée à la fin d'un
        panneau de 1 124 px dont les commandes vivent en haut. La déplacer ne
        suffit pourtant pas pour les groupes du bas, d'où le
        `scrollIntoView` ci-dessous.
      */}
      {zoneError && (
        <p
          ref={alerteZone}
          className={styles.error}
          role="alert"
          data-testid="zone-error"
        >
          {zoneError}
        </p>
      )}

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

      {GROUPES.map((groupe) => (
        <Fragment key={groupe.id}>
          <p className={styles.groupTitle} id={`${groupe.id}-title`}>
            {groupe.titre}
          </p>
          <div
            className={styles.zones}
            role="group"
            aria-labelledby={`${groupe.id}-title`}
          >
            {ZONES.filter((zone) => zone.group === groupe.id).map((zone) => (
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
        </Fragment>
      ))}

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
          Ou par numéro d’itinéraire
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
              // Le magasin sait de quelle sorte de zone il s'agit ; ce bouton
              // ne le devinait pas, et ne faisait rien du tout sur une zone
              // « Autour de… » — en silence.
              void rafraichirZone()
            }}
          >
            Actualiser les tracés
          </button>
        </p>
      )}
    </section>

  )
}
