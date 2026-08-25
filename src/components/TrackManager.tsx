import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { etoilesDeSortie } from '../core/affichage.ts'
import { formatKm, importProgressLabel } from '../lib/format.ts'
import { outingLabel } from '../core/outing.ts'
import { listerDeclarations } from '../core/declaratif.ts'
import {
  preparerHistorique,
  chercherHistorique,
  trierHistorique,
  organiserHistorique,
  MAX_PAR_ANNEE,
  SEUIL_GROUPEMENT,
  type CritereTri,
  type EntreeHistorique,
} from '../core/historique.ts'
import { ConfirmDeleteButton } from './ConfirmDeleteButton.tsx'
import styles from './TrackManager.module.css'

const SUCCESS_TIMEOUT_MS = 4000

export function TrackManager() {
  const tracks = useAppStore((s) => s.tracks)
  const itineraires = useAppStore((s) => s.itineraries)
  const itinerairesPersos = useAppStore((s) => s.customItineraries)
  const parcoursDeclares = useAppStore((s) => s.parcoursDeclares)
  const retirerParcoursDeclare = useAppStore((s) => s.retirerParcoursDeclare)
  const importErrors = useAppStore((s) => s.importErrors)
  const importGpxFiles = useAppStore((s) => s.importGpxFiles)
  const importProgress = useAppStore((s) => s.importProgress)
  const outingDetail = useAppStore((s) => s.outingDetail)
  const toggleOutingDetail = useAppStore((s) => s.toggleOutingDetail)
  const removeTrack = useAppStore((s) => s.removeTrack)
  const clearImportErrors = useAppStore((s) => s.clearImportErrors)
  const importDoublons = useAppStore((s) => s.importDoublons)
  const importerDoublon = useAppStore((s) => s.importerDoublon)
  const ignorerDoublon = useAppStore((s) => s.ignorerDoublon)
  const ignorerTousDoublons = useAppStore((s) => s.ignorerTousDoublons)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importing, setImporting] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<CritereTri>('date')
  // Les années dépliées à la main, par-dessus celle qui l'est par défaut.
  const [depliees, setDepliees] = useState<Record<string, boolean>>({})
  const [toutAfficher, setToutAfficher] = useState<Record<string, boolean>>({})
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current)
    },
    [],
  )

  // Une seule mesure de longueur par trace, et non une par rendu : sur huit
  // cents traces de dix mille points, le rendu recalculait huit millions de
  // distances pour peindre une liste (issue #175).
  const historique = useMemo(() => preparerHistorique(tracks), [tracks])
  const declarations = useMemo(
    () =>
      listerDeclarations(
        [...itineraires, ...itinerairesPersos],
        parcoursDeclares,
      ),
    [itineraires, itinerairesPersos, parcoursDeclares],
  )
  const groupes = useMemo(
    () =>
      organiserHistorique(
        trierHistorique(chercherHistorique(historique, recherche), tri),
        tri,
      ),
    [historique, recherche, tri],
  )
  const nbTrouvees = groupes.reduce((n, g) => n + g.entrees.length, 0)

  const runImport = async (files: File[]) => {
    setImporting(true)
    setSuccessMsg(null)
    // Compter les traces ajoutées, et non les fichiers moins les erreurs :
    // une archive en contient plusieurs, un fichier peut être importé tout
    // en signalant quelque chose, et un doublon n'est plus une erreur.
    const avant = useAppStore.getState().tracks.length
    await importGpxFiles(files)
    setImporting(false)
    const imported = useAppStore.getState().tracks.length - avant
    if (imported > 0) {
      setSuccessMsg(
        imported === 1 ? '1 trace importée.' : `${imported} traces importées.`,
      )
      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => {
        setSuccessMsg(null)
      }, SUCCESS_TIMEOUT_MS)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith('.gpx'),
    )
    if (files.length > 0) void runImport(files)
  }

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="tracks-title" className={styles.title}>
          Mes traces
        </h2>
      </summary>

      <div
        className={dragOver ? styles.dropzoneActive : styles.dropzone}
        data-testid="gpx-dropzone"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => {
          setDragOver(false)
        }}
        onDrop={onDrop}
      >
        {/*
          Le geste qui marche partout passe devant. « Glissez vos fichiers »
          menait, sur un téléphone où le glisser-déposer n'existe pas
          (AUDIT_UX.md, constat U12) : la seule action possible était en
          second, derrière un « ou ».

          Le glisser-déposer n'est pas retiré — il reste le geste naturel à
          la souris. Il est mentionné sous `pointer: fine` seulement, comme
          la phrase de confidentialité de l'en-tête a deux longueurs pour la
          même promesse. La condition porte sur l'entrée, pas sur la largeur :
          une tablette de 900 px n'a pas plus de souris qu'un téléphone.
        */}
        <p className={styles.dropText}>
          <button
            type="button"
            className="btn-link"
            data-testid="gpx-browse"
            onClick={() => inputRef.current?.click()}
          >
            Choisissez vos fichiers
          </button>{' '}
          GPX, FIT ou TCX
          <span className={styles.dropGlisser} data-testid="depot-glisser">
            {' '}
            — ou glissez-les ici.
          </span>
        </p>
        <p className={styles.dropHint}>
          Lecture 100 % locale : vos traces ne sont envoyées nulle part. Vous
          pouvez aussi déposer l’archive d’export de Strava ou Garmin, telle
          quelle : elle est ouverte ici, sur votre appareil.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,.fit,.tcx,.zip,application/gpx+xml,application/vnd.ant.fit,application/zip"
          multiple
          hidden
          data-testid="gpx-input"
          onChange={(event) => {
            const files = event.target.files
            if (files && files.length > 0) {
              void runImport(Array.from(files))
            }
            event.target.value = ''
          }}
        />
      </div>

      {importing && (
        <p
          className={styles.importing}
          role="status"
          data-testid="gpx-importing"
        >
          {importProgress
            ? importProgressLabel(importProgress)
            : 'Import en cours…'}
        </p>
      )}

      {successMsg && (
        <p
          className={styles.success}
          role="status"
          aria-live="polite"
          data-testid="gpx-import-success"
        >
          {successMsg}
        </p>
      )}

      {importErrors.length > 0 && (
        <div className={styles.errors} role="alert" data-testid="gpx-errors">
          <ul>
            {importErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
          <button type="button" onClick={clearImportErrors}>
            OK
          </button>
        </div>
      )}

      {importDoublons.length > 0 && (
        <div className={styles.doublons} data-testid="gpx-doublons">
          <p>
            {importDoublons.length === 1
              ? 'Une trace ressemble à une sortie déjà importée.'
              : `${importDoublons.length} traces ressemblent à des sorties déjà importées.`}{' '}
            À vous de voir.
          </p>
          <ul>
            {importDoublons.map((doublon) => (
              <li key={doublon.id}>
                <span className={styles.doublonNom}>{doublon.filename}</span>
                <span>ressemble à « {doublon.ressembleA} »</span>
                <span className={styles.doublonActions}>
                  <button
                    type="button"
                    onClick={() => void importerDoublon(doublon.id)}
                  >
                    Importer quand même
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ignorerDoublon(doublon.id)
                    }}
                  >
                    Ignorer
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {importDoublons.length > 1 && (
            <span className={styles.doublonActions}>
              <button type="button" onClick={ignorerTousDoublons}>
                Tout ignorer
              </button>
            </span>
          )}
        </div>
      )}

      {tracks.length === 0 ? (
        <p className={styles.empty} data-testid="tracks-empty">
          Aucune trace pour l’instant.
        </p>
      ) : (
        <>
          {tracks.length >= SEUIL_GROUPEMENT && (
            <div className={styles.outils}>
              <label className={styles.chercher}>
                <span className="sr-only">Rechercher une sortie</span>
                <input
                  type="search"
                  value={recherche}
                  data-testid="tracks-recherche"
                  placeholder="Nom de fichier, date ou zone…"
                  onChange={(e) => {
                    setRecherche(e.target.value)
                  }}
                />
              </label>
              <label className={styles.trier}>
                <span className="sr-only">Trier les sorties</span>
                <select
                  value={tri}
                  data-testid="tracks-tri"
                  onChange={(e) => {
                    setTri(e.target.value as CritereTri)
                  }}
                >
                  <option value="date">Les plus récentes</option>
                  <option value="distance">Les plus longues</option>
                  <option value="denivele">Le plus de dénivelé</option>
                </select>
              </label>
              <p
                className={styles.compte}
                role="status"
                data-testid="tracks-compte"
              >
                {nbTrouvees === tracks.length
                  ? `${tracks.length} sorties`
                  : `${nbTrouvees} sur ${tracks.length}`}
              </p>
            </div>
          )}

          {nbTrouvees === 0 ? (
            <p className={styles.empty} data-testid="tracks-aucun-resultat">
              Aucune sortie ne correspond à « {recherche.trim()} ».
            </p>
          ) : (
            groupes.map((groupe) => {
              const cle = String(groupe.annee ?? 'sans-date')
              const groupe_est_seul =
                groupes.length === 1 && groupe.annee === null
              const ouvert = depliees[cle] ?? groupe.ouvertParDefaut
              // Chercher traverse les plis : sans cela, la sortie trouvée
              // dans une année repliée resterait invisible.
              const visible = ouvert || recherche.trim() !== ''
              const bornees =
                (toutAfficher[cle] ?? false)
                  ? groupe.entrees
                  : groupe.entrees.slice(0, MAX_PAR_ANNEE)
              return (
                <section key={cle} className={styles.annee}>
                  {!groupe_est_seul && (
                    <button
                      type="button"
                      className={styles.anneeTitre}
                      aria-expanded={visible}
                      data-testid={`tracks-annee-${cle}`}
                      onClick={() => {
                        setDepliees((etat) => ({ ...etat, [cle]: !visible }))
                      }}
                    >
                      <span>{groupe.annee ?? 'Sans date'}</span>
                      <span className={styles.anneeCompte}>
                        {groupe.entrees.length}
                      </span>
                    </button>
                  )}
                  {visible && (
                    <>
                      <ul className={styles.list} data-testid="tracks-list">
                        {bornees.map((entree) => (
                          <ItemTrace
                            key={entree.track.id}
                            entree={entree}
                            outingDetail={outingDetail}
                            toggleOutingDetail={toggleOutingDetail}
                            removeTrack={removeTrack}
                          />
                        ))}
                      </ul>
                      {groupe.restantes > 0 &&
                        !(toutAfficher[cle] ?? false) && (
                          <button
                            type="button"
                            className={styles.plus}
                            data-testid={`tracks-plus-${cle}`}
                            onClick={() => {
                              setToutAfficher((etat) => ({
                                ...etat,
                                [cle]: true,
                              }))
                            }}
                          >
                            Afficher les {groupe.restantes} sorties suivantes
                          </button>
                        )}
                    </>
                  )}
                </section>
              )
            })
          )}
        </>
      )}
      {/*
        Les itinéraires déclarés (issue #158), dans leur propre section.

        Pas des lignes glissées dans la liste ci-dessus : celle-ci est bâtie
        sur des traces, dont chaque entrée porte une géométrie réelle, une
        longueur mesurée et un détail de sortie. Mêler les deux natures ici
        reviendrait à les confondre dans le seul endroit où l'on compare ses
        sorties entre elles.
      */}
      {declarations.length > 0 && (
        <section className={styles.declarations} data-testid="declarations">
          <h3 className={styles.declarationsTitre}>
            Déclarés sans trace ({declarations.length})
          </h3>
          <p className={styles.declarationsAide}>
            Cochés à la main depuis leur fiche. Ils ne comptent pas dans votre
            pourcentage mesuré.
          </p>
          <ul className={styles.declarationsListe}>
            {declarations.map((d) => (
              <li key={d.itineraryId} className={styles.item}>
                <span className={styles.itemInfo}>
                  <span className={styles.filename}>{d.nom}</span>
                  <span className={styles.itemMeta}>
                    {d.date
                      ? new Date(d.date).toLocaleDateString('fr-FR')
                      : 'date inconnue'}
                    {' · '}
                    {formatKm(d.metres)}
                  </span>
                </span>
                <ConfirmDeleteButton
                  label={`Retirer la déclaration ${d.nom}`}
                  onConfirm={() => void retirerParcoursDeclare(d.itineraryId)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </details>
  )
}

/**
 * Une sortie de la liste. Extraite parce que la liste est maintenant rendue
 * depuis plusieurs endroits (un groupe par année), et qu'une duplication de
 * ce bloc serait le genre de recopie qui finit par diverger.
 */
function ItemTrace({
  entree,
  outingDetail,
  toggleOutingDetail,
  removeTrack,
}: {
  entree: EntreeHistorique
  outingDetail: ReturnType<typeof useAppStore.getState>['outingDetail']
  toggleOutingDetail: (id: string) => Promise<void> | void
  removeTrack: (id: string) => Promise<void> | void
}) {
  const track = entree.track
  const ouvert = outingDetail?.trackId === track.id
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.itemInfo}
        aria-expanded={ouvert}
        data-testid={`track-toggle-${track.filename}`}
        onClick={() => void toggleOutingDetail(track.id)}
      >
        <span className={styles.filename}>{track.filename}</span>
        <span className={styles.itemMeta}>
          {track.date
            ? new Date(track.date).toLocaleDateString('fr-FR')
            : 'date inconnue'}
          {' · '}
          {formatKm(entree.metres)}
          {typeof track.elevationGain === 'number' &&
            ` · D+ ${Math.round(track.elevationGain)} m`}
        </span>
        {/*
          La zone chargée au moment de l'import (issue #206).

          « Importée depuis » et non « lieu » : c'est la zone qui était à
          l'écran, pas l'endroit d'où l'on est parti. Une sortie du Pilat
          porte « PNR du Pilat », ce qui aide à retrouver sans prétendre
          situer. Absente sur les traces déjà en base, et la ligne
          disparaît alors plutôt que d'annoncer « zone inconnue ».
        */}
        {track.zoneALImport && (
          <span
            className={styles.itemMeta}
            data-testid={`track-zone-${track.filename}`}
          >
            Importée depuis&nbsp;: {track.zoneALImport}
          </span>
        )}
      </button>
      <ConfirmDeleteButton
        label={`Supprimer la trace ${track.filename}`}
        onConfirm={() => void removeTrack(track.id)}
      />
      {ouvert && (
        <div className={styles.outing} data-testid="track-outing">
          <p className={styles.outingTitle}>{outingLabel(track)}</p>
          {outingDetail.loading ? (
            <p className={styles.outingHint} role="status">
              Calcul de la sortie…
            </p>
          ) : outingDetail.highlights.length === 0 ? (
            <p className={styles.outingHint}>
              Cette sortie n’a fait avancer aucun itinéraire balisé de la zone
              chargée.
            </p>
          ) : (
            <>
              {/* Trois étoiles au plus, d'après le meilleur itinéraire
                  avancé. Ce n'est pas un score : pas de classement, pas de
                  comparaison entre personnes. Une étoile dit « ça a compté »
                  (issue #173). */}
              {(() => {
                const etoiles = etoilesDeSortie(
                  Math.max(...outingDetail.highlights.map((f) => f.pct)),
                )
                return (
                  <p
                    className={styles.etoiles}
                    data-testid="outing-etoiles"
                    data-etoiles={etoiles}
                  >
                    <span aria-hidden="true">
                      {'★'.repeat(etoiles)}
                      {'☆'.repeat(3 - etoiles)}
                    </span>
                    <span className="sr-only">
                      {etoiles} étoile{etoiles > 1 ? 's' : ''} sur 3
                    </span>
                  </p>
                )
              })()}
              <ul className={styles.outingList}>
                {outingDetail.highlights.map((fait) => (
                  <li key={fait.itineraryId}>
                    <strong>{fait.name}</strong> : {formatKm(fait.doneMeters)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  )
}
