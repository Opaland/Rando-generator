import type { Network } from '../core/types.ts'
import { NETWORK_COLORS, NETWORK_LABELS } from '../lib/networkDisplay.ts'
import styles from './MapLegend.module.css'

const NETWORKS: Network[] = ['GR', 'GRP', 'PR', 'LOCAL', 'PERSO']

/** Légende compacte : couleur par réseau + distinction parcouru/restant. */
export function MapLegend() {
  return (
    <div className={styles.legend} data-testid="map-legend">
      <ul className={styles.networks}>
        {NETWORKS.map((network) => (
          <li key={network} className={styles.item}>
            <span
              className={styles.swatch}
              style={{ background: NETWORK_COLORS[network] }}
            />
            {NETWORK_LABELS[network]}
          </li>
        ))}
      </ul>
      <div className={styles.states}>
        <span className={styles.item}>
          <span className={styles.lineDone} />
          parcouru
        </span>
        <span className={styles.item}>
          <span className={styles.lineTodo} />
          restant
        </span>
      </div>
    </div>
  )
}
