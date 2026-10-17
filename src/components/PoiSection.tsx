import { formatDetour } from '../lib/format.ts'
import { POI_COLORS, POI_LABELS, mentionEau } from '../lib/poiDisplay.ts'
import { dateDeReleve, declareQuelqueChose } from '../core/releveOsm.ts'
import { lienSortant } from '../core/lienSortant.ts'
import { DETOUR_MAX_METRES, type PoiSitue } from '../core/poiDistance.ts'
import type { SourcePois } from '../core/poisEmportes.ts'
import type { LonLat } from '../core/types.ts'
import styles from './ItineraryDetail.module.css'

/**
 * La section « Points d’intérêt » de la fiche, sortie d'`ItineraryDetail.tsx`
 * (dette du 17/10 : le fichier était à 945 lignes, juste sous son plafond de
 * 965).
 *
 * Purement présentationnel, comme `DiscoveryFiltersPanel.tsx` : tout l'état
 * (quels POI sont repliés, lesquels sont emportés) reste dans la fiche, qui
 * en a besoin pour le reste de son rendu — déplacer l'état ici n'aurait fait
 * que le faire remonter par un événement, pour rien.
 */
export interface PoiSectionProps {
  poisLoading: boolean
  mentionEmport: string | null
  pois: PoiSitue[]
  poisSource: SourcePois
  poisEcartes: PoiSitue[]
  poisAffiches: PoiSitue[]
  poisReplies: PoiSitue[]
  poisDeplies: boolean
  hasSleepingSpot: boolean
  onFocusPoi: (coords: LonLat) => void
  onDeplierPois: () => void
}

export function PoiSection({
  poisLoading,
  mentionEmport,
  pois,
  poisSource,
  poisEcartes,
  poisAffiches,
  poisReplies,
  poisDeplies,
  hasSleepingSpot,
  onFocusPoi,
  onDeplierPois,
}: PoiSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="poi-title">
      <h4 id="poi-title" className={styles.sectionTitle}>
        Points d’intérêt
      </h4>
      {poisLoading && (
        <p className={styles.hint} role="status">
          Recherche autour du tracé…
        </p>
      )}
      {mentionEmport && (
        <p className={styles.hint} data-testid="poi-emportes">
          {mentionEmport}
        </p>
      )}
      {!poisLoading && pois.length === 0 && (
        <p className={styles.hint}>
          {poisSource === 'aucune'
            ? 'Points d’intérêt indisponibles : il faut du réseau, ou avoir emporté cette randonnée.'
            : 'Aucun point d’intérêt répertorié à proximité.'}
        </p>
      )}
      {pois.length > 0 && (
        <p className={styles.hint}>
          Du plus proche au plus lointain. Le détour indiqué est un
          aller-retour depuis le tracé, à vol d’oiseau : le chemin réel sera
          plus long.
        </p>
      )}
      {poisEcartes.length > 0 && (
        /*
          Une liste tronquée en silence est un mensonge par omission. Le
          rayon règle la lisibilité ; il ne doit pas coûter la franchise —
          d'où cette ligne, qui dit le nombre et le seuil.
        */
        <p className={styles.hint} data-testid="poi-ecartes">
          {poisEcartes.length === 1
            ? '1 autre point'
            : `${String(poisEcartes.length)} autres points`}{' '}
          {poisEcartes.length === 1 ? 'est' : 'sont'} répertorié
          {poisEcartes.length === 1 ? '' : 's'} au-delà de{' '}
          {DETOUR_MAX_METRES / 1_000} km de détour, et ne{' '}
          {poisEcartes.length === 1 ? 'figure' : 'figurent'} pas ici. Les
          hébergements, eux, sont listés quelle que soit leur distance.
        </p>
      )}
      {pois.length > 0 && (
        <ul className={styles.poiList} data-testid="detail-poi-list">
          {poisAffiches.map((poi) => {
            const {
              phone,
              website,
              capacity,
              openingHours,
              operator,
              elevation,
              osmUpdatedAt,
            } = poi.details
            const facts = [
              `${formatDetour(poi.detourMeters)} de détour`,
              mentionEau(poi.details),
              capacity && `${capacity} places`,
              // « ouvert Mo-Sa 08:00-19:00 » affirmait l'état du monde à
              // partir d'une déclaration : `opening_hours` est ce qu'un
              // contributeur a saisi un jour, pas ce que la porte fait
              // aujourd'hui. En montagne la fermeture saisonnière est la
              // règle et n'y figure presque jamais. Se fier à ce mot, c'est
              // arriver devant une supérette fermée avec un sac vide.
              //
              // « annoncé » remet la phrase à qui la tient (CLAUDE.md §4bis :
              // une justification est une affirmation, et celle-ci était
              // fausse dès qu'un horaire vieillissait).
              openingHours && `annoncé ouvert ${openingHours}`,
              elevation && `${elevation} m`,
              operator,
              phone,
              /*
                La date de relevé (issue #285), et seulement quand le point
                déclare quelque chose à juger.

                « annoncé ouvert Mo-Sa 08:00-19:00 » ne veut pas la même
                chose selon qu'il a été relevé le mois dernier ou en 2019 :
                c'est elle qui rend le doute proportionné, et qui décide
                qu'on téléphone avant de descendre au village.

                Pas sur un point qui n'annonce rien : « 250 m de détour —
                relevé le 12/03/2019 » n'apprend rien à personne, et la
                date deviendrait le bruit qui empêche de la voir là où
                elle sert.
              */
              declareQuelqueChose(poi.details)
                ? dateDeReleve(osmUpdatedAt)
                : null,
            ].filter(Boolean)
            return (
              <li key={poi.id} className={styles.poiEntry}>
                <button
                  type="button"
                  className={styles.poiItem}
                  onClick={() => {
                    onFocusPoi([poi.lon, poi.lat])
                  }}
                >
                  {/*
                    La pastille de la liste est celle de la carte.

                    Sans elle, le code couleur n'était lisible nulle part :
                    douze teintes peintes par MapLibre, et aucune légende.
                    Retrouver sur la carte le refuge qu'on vient de lire
                    demandait de deviner. La couleur vient de la même
                    constante que le marqueur, si bien que les deux ne
                    peuvent pas diverger.

                    `aria-hidden` : le libellé juste à côté dit déjà la
                    catégorie. Une pastille annoncée en plus ne ferait que
                    répéter, et une couleur ne se lit pas à voix haute.
                  */}
                  <span
                    className={styles.poiPastille}
                    style={{ background: POI_COLORS[poi.kind] }}
                    aria-hidden="true"
                    data-testid={`poi-pastille-${poi.kind}`}
                  />
                  <span className={styles.poiKind}>
                    {POI_LABELS[poi.kind]}
                  </span>
                  <span className={styles.poiName}>
                    {poi.name ?? POI_LABELS[poi.kind]}
                  </span>
                </button>
                {(facts.length > 0 || lienSortant(website)) && (
                  <p className={styles.poiFacts}>
                    {facts.join(' · ')}
                    {lienSortant(website) && (
                      <>
                        {facts.length > 0 && ' · '}
                        <a
                          href={lienSortant(website) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                        >
                          site
                        </a>
                      </>
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {poisReplies.length > 0 && !poisDeplies && (
        /*
          Le compte est dans le bouton, pas dans une phrase à côté : c'est
          ce qu'on lit quand on décide de cliquer. Et il dit « autres », au
          pluriel toujours — la garde de `replierLesPois` interdit qu'il
          n'y en ait qu'un.
        */
        <p className={styles.hint}>
          <button
            type="button"
            className={styles.deplierPois}
            data-testid="poi-deplier"
            onClick={onDeplierPois}
          >
            Afficher les {poisReplies.length} autres points
          </button>
        </p>
      )}

      {hasSleepingSpot && (
        <p className={styles.poiCaveat} data-testid="detail-poi-caveat">
          « Couchage libre » regroupe refuges non gardés, cabanes et appentis
          : gratuits et sans réservation, mais ni garantis ouverts ni
          entretenus. Ces informations viennent d’OpenStreetMap et peuvent
          être incomplètes ou périmées — vérifiez auprès du gestionnaire avant
          de compter dessus pour une nuit.
        </p>
      )}
    </section>
  )
}
