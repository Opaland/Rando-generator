import { contenuLegende } from '../core/legende.ts'
import { useAppStore } from '../store/appStore.ts'
import {
  NETWORK_COLORS,
  NETWORK_EXPLANATIONS,
  NETWORK_LABELS,
} from '../lib/networkDisplay.ts'
import styles from './MapLegend.module.css'

/**
 * Légende de carte : elle ne nomme que ce qui est dessiné.
 *
 * Elle affichait les cinq réseaux et les deux états en permanence. Mesuré sur
 * un téléphone : 100 px sur les 350 de carte visible, soit 28 %, et en haut —
 * là où le tracé se trouve après un cadrage. Six entrées, dont la moitié ne
 * concernait pas la zone affichée (AUDIT_UX.md, constat U6).
 *
 * Ce qu'elle montre est décidé dans `core/legende`, où cela s'éprouve sans
 * DOM. Ici, il ne reste que le rendu.
 */
export function MapLegend() {
  const itineraires = useAppStore((s) => s.itineraries)
  const itinerairesPerso = useAppStore((s) => s.customItineraries)
  const aDesTraces = useAppStore((s) => s.tracks.length > 0)
  const contenu = contenuLegende({ itineraires, itinerairesPerso, aDesTraces })

  // Rien à nommer : pas de cadre vide posé sur la carte.
  if (contenu.vide) return null

  return (
    <div className={styles.legend} data-testid="map-legend">
      {contenu.reseaux.length > 0 && (
        <ul className={styles.networks}>
          {contenu.reseaux.map((network) => (
            <li
              key={network}
              className={styles.item}
              // Une explication au survol : elle ne prend pas de place sur une
              // carte déjà chargée, et se trouve là où la question se pose
              // (issue #145). La version longue est dans « À propos ».
              title={NETWORK_EXPLANATIONS[network]}
              data-reseau={network}
            >
              <span
                className={styles.swatch}
                style={{ background: NETWORK_COLORS[network] }}
              />
              {NETWORK_LABELS[network]}
            </li>
          ))}
        </ul>
      )}
      {contenu.etats && (
        <div className={styles.states} data-testid="legende-etats">
          <span className={styles.item}>
            <span className={styles.lineDone} />
            parcouru
          </span>
          <span className={styles.item}>
            <span className={styles.lineTodo} />
            restant
          </span>
        </div>
      )}
    </div>
  )
}
