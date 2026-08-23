import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import { actionsPossibles } from '../core/recorder.ts'
import { chiffresDeLaSortie } from '../core/sortieEnCours.ts'
import { formatChrono, formatKm } from '../lib/format.ts'
import styles from './Enregistreur.module.css'

/**
 * L'écran de marche (issue #152, pierre 3).
 *
 * C'est ici que la boucle se referme : jusqu'à présent, pour voir sa
 * progression, il fallait enregistrer sa sortie dans une autre application,
 * l'exporter et l'importer. La proposition de valeur dépendait d'un
 * concurrent — ce que l'audit externe du 20/08 appelle le seul problème
 * existentiel du produit.
 *
 * **Enregistrer n'est pas guider.** Aucune instruction, aucune voix, aucun
 * recalcul d'itinéraire : on se souvient d'où l'on est passé, on ne dit à
 * personne où aller.
 *
 * Ce qui n'y figure pas, et pourquoi :
 *
 * - **« ce qu'il reste »**, que la feuille de route mentionne, suppose de
 *   savoir quel itinéraire on suit. Rien ne le dit aujourd'hui, et le
 *   déduire de la position demanderait un appariement en direct dont le
 *   seuil change ce qui est compté (#150, #151) ;
 * - **une vitesse instantanée.** Sur du GPS brut, elle saute de 2 à 15 km/h
 *   d'un relevé à l'autre. La moyenne, elle, veut dire quelque chose.
 */

/** Un rythme d'affichage, pas de mesure : les points arrivent quand ils veulent. */
const BATTEMENT_MS = 1000

export function Enregistreur() {
  const enregistrement = useAppStore((s) => s.enregistrement)
  const sortieReprise = useAppStore((s) => s.sortieReprise)
  const sortieErreur = useAppStore((s) => s.sortieErreur)
  const demarrerSortie = useAppStore((s) => s.demarrerSortie)
  const suspendreSortie = useAppStore((s) => s.suspendreSortie)
  const poursuivreSortie = useAppStore((s) => s.poursuivreSortie)
  const terminerSortie = useAppStore((s) => s.terminerSortie)
  const abandonnerSortie = useAppStore((s) => s.abandonnerSortie)

  // Les chiffres avancent avec l'horloge, pas avec les positions : entre
  // deux relevés il peut s'écouler dix secondes, et un compteur figé
  // pendant dix secondes ressemble à une application plantée.
  const [maintenant, setMaintenant] = useState(() => Date.now())
  const enMarche = enregistrement.etat === 'enregistrement'
  useEffect(() => {
    if (!enMarche) return
    const battement = setInterval(() => {
      setMaintenant(Date.now())
    }, BATTEMENT_MS)
    return () => {
      clearInterval(battement)
    }
  }, [enMarche])

  const actions = actionsPossibles(enregistrement)
  const chiffres = chiffresDeLaSortie(enregistrement, maintenant)
  const auRepos = enregistrement.etat === 'repos'

  return (
    <section className={styles.section} data-testid="enregistreur">
      <h2 className={styles.titre}>Enregistrer une sortie</h2>

      {auRepos ? (
        <>
          <button
            type="button"
            className={`btn-primary ${styles.demarrer}`}
            data-testid="sortie-demarrer"
            onClick={() => {
              demarrerSortie()
            }}
          >
            Démarrer
          </button>
          <p className={styles.aide}>
            Sentiers retient par où vous passez, et rien d’autre. La position
            ne quitte pas l’appareil, même pendant l’enregistrement.
          </p>
        </>
      ) : (
        <>
          {sortieReprise && (
            <p className={styles.reprise} role="status" data-testid="sortie-reprise">
              Sortie retrouvée. Elle est <strong>en pause</strong> : l’appli
              s’est arrêtée en cours de route et personne ne sait ce qui s’est
              passé depuis. Reprenez si vous marchez toujours.
            </p>
          )}
          {sortieErreur !== null && (
            <p className={styles.erreur} role="alert" data-testid="sortie-erreur">
              {sortieErreur} Ce qui a été marché est enregistré.
            </p>
          )}

          <dl className={styles.chiffres} data-testid="sortie-chiffres">
            <div className={styles.chiffre}>
              <dt>Distance</dt>
              <dd data-testid="sortie-distance">
                {formatKm(chiffres.distanceMetres)}
              </dd>
            </div>
            <div className={styles.chiffre}>
              <dt>Durée</dt>
              <dd data-testid="sortie-duree">
                {formatChrono(chiffres.dureeEnMarcheMs)}
              </dd>
            </div>
            <div className={styles.chiffre}>
              <dt>Dénivelé +</dt>
              <dd data-testid="sortie-denivele">
                {chiffres.deniveleMetres === null
                  ? '—'
                  : `${String(Math.round(chiffres.deniveleMetres))} m`}
              </dd>
            </div>
          </dl>
          {chiffres.points === 0 && (
            <p className={styles.aide} data-testid="sortie-attente">
              En attente de la première position…
            </p>
          )}

          <div className={styles.actions}>
            {actions.includes('suspendre') && (
              <button
                type="button"
                className={styles.action}
                data-testid="sortie-pause"
                onClick={() => {
                  suspendreSortie()
                }}
              >
                Pause
              </button>
            )}
            {actions.includes('reprendre') && (
              <button
                type="button"
                className={styles.action}
                data-testid="sortie-reprendre"
                onClick={() => {
                  poursuivreSortie()
                }}
              >
                Reprendre
              </button>
            )}
            <button
              type="button"
              className={`btn-primary ${styles.action}`}
              data-testid="sortie-terminer"
              onClick={() => {
                void terminerSortie()
              }}
            >
              Terminer
            </button>
            {/*
              Abandonner n'est pas dans l'issue, et on ne peut pas s'en
              passer : démarrer par accident arrive — une poche, un appui de
              trop — et personne ne veut d'une sortie fantôme de trois mètres
              dans son historique. `terminer` produit une trace, celui-ci
              n'en produit aucune, d'où la confirmation.
            */}
            <button
              type="button"
              className={styles.abandonner}
              data-testid="sortie-abandonner"
              onClick={() => {
                void abandonnerSortie()
              }}
            >
              Abandonner
            </button>
          </div>
        </>
      )}
    </section>
  )
}
