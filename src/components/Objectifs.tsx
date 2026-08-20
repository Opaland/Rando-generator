import { useAppStore } from '../store/appStore.ts'
import { displayName, formatKm, formatPct } from '../lib/format.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './Objectifs.module.css'

/** Tronçons montrés par objectif : au-delà, ce n'est plus un plan, c'est une liste. */
const MAX_AFFICHES = 3

/**
 * Mode « objectif » (issue #13).
 *
 * Le tableau de bord constate ; il ne motive pas. Épingler un itinéraire,
 * c'est répondre à la seule question qui reste après le pourcentage :
 * *qu'est-ce qu'il me manque, et où ?* Chaque tronçon restant est cliquable
 * — la carte va s'y poser.
 */
export function Objectifs() {
  const objectifs = useAppStore((s) => s.objectifs)
  const itineraries = useAppStore((s) => s.itineraries)
  const customItineraries = useAppStore((s) => s.customItineraries)
  const matching = useAppStore((s) => s.matching)
  const resumeDeLObjectif = useAppStore((s) => s.resumeDeLObjectif)
  const basculerObjectif = useAppStore((s) => s.basculerObjectif)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const focusOn = useAppStore((s) => s.focusOn)

  if (objectifs.length === 0) return null

  const tous = [...itineraries, ...customItineraries]
  // Un objectif épinglé dans une autre zone n'est pas oublié : il n'est
  // simplement pas affichable tant que ses tracés ne sont pas chargés.
  const lignes = objectifs
    .map((id) => ({
      itineraire: tous.find((i) => i.osmRelationId === id),
      resume: resumeDeLObjectif(id),
    }))
    .filter((ligne) => ligne.itineraire !== undefined)

  return (
    <details className={styles.section} data-testid="objectifs" open>
      <summary className="acc-summary">
        <h2 id="objectifs-title" className={styles.title}>
          Mes objectifs
        </h2>
      </summary>

      {lignes.length === 0 ? (
        <p className={styles.hint} data-testid="objectifs-ailleurs">
          {objectifs.length === 1
            ? 'Votre objectif est dans une autre zone : chargez-la pour le retrouver.'
            : 'Vos objectifs sont dans d’autres zones : chargez-les pour les retrouver.'}
        </p>
      ) : (
        <ul className={styles.list} data-testid="objectifs-list">
          {lignes.map(({ itineraire, resume }) => {
            if (!itineraire) return null
            const nom = displayName(itineraire)
            return (
              <li key={itineraire.osmRelationId} className={styles.item}>
                <div className={styles.entete}>
                  <span
                    className={`${styles.badge} ${styles[itineraire.network]}`}
                  >
                    {NETWORK_BADGES[itineraire.network]}
                  </span>
                  <button
                    type="button"
                    className={styles.nom}
                    onClick={() => {
                      selectItinerary(itineraire.osmRelationId)
                    }}
                  >
                    {nom}
                  </button>
                  <button
                    type="button"
                    className={styles.retirer}
                    aria-label={`Retirer ${nom} de vos objectifs`}
                    data-testid={`objectif-retirer-${itineraire.osmRelationId}`}
                    onClick={() => void basculerObjectif(itineraire.osmRelationId)}
                  >
                    ×
                  </button>
                </div>

                {!matching || !resume ? (
                  <p className={styles.hint}>Calcul en cours…</p>
                ) : (
                  <>
                    <ProgressBalise
                      pct={resume.pct}
                      network={itineraire.network}
                      label={`Progression ${nom}`}
                    />
                    <p className={styles.chiffres}>
                      {formatPct(resume.pct)} ·{' '}
                      <strong>{formatKm(resume.remainingMeters)}</strong> à
                      parcourir
                    </p>
                    {resume.troncons.length === 0 ? (
                      <p className={styles.fini}>
                        Rien ne manque : cet itinéraire est bouclé.
                      </p>
                    ) : (
                      <ol className={styles.troncons}>
                        {resume.troncons
                          .slice(0, MAX_AFFICHES)
                          .map((troncon, rang) => (
                            <li key={`${troncon.wayId}-${rang}`}>
                              <button
                                type="button"
                                className={styles.troncon}
                                data-testid={`troncon-${itineraire.osmRelationId}-${rang}`}
                                onClick={() => {
                                  selectItinerary(itineraire.osmRelationId)
                                  focusOn(troncon.start)
                                }}
                              >
                                {formatKm(troncon.meters)} d’un trait
                                <span className={styles.aller}> · y aller</span>
                              </button>
                            </li>
                          ))}
                      </ol>
                    )}
                    {resume.troncons.length > MAX_AFFICHES && (
                      <p className={styles.hint}>
                        et {resume.troncons.length - MAX_AFFICHES} autres
                        tronçons, plus courts.
                      </p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}
