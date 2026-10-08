import { useRef } from 'react'
import { ONGLETS, type Onglet } from '../core/maquetteOnglets.ts'
import styles from './BarreOnglets.module.css'

/**
 * Au-dessous, un déplacement compte comme un tap, pas un balayage : un doigt
 * qui tremble de quelques pixels en appuyant ne doit pas changer d'onglet.
 */
const SEUIL_BALAYAGE_PX = 40

/**
 * Ce que dit le témoin de sortie, selon l'état — et il en dit toujours
 * quelque chose de complet : « Sorties » seul serait ambigu pour qui
 * navigue à la voix.
 */
const ANNONCE_SORTIE = {
  enregistrement: 'sortie en cours d’enregistrement',
  pause: 'sortie en pause',
} as const

/**
 * Navigation par onglets (issue #171), disposition par défaut sur téléphone
 * — voir `core/maquetteOnglets.ts`.
 *
 * Icône **et** libellé : une icône seule se devine, et se devine mal. Les
 * cibles font 44 px de haut au minimum, et la barre réserve la zone sûre
 * iOS sous elle.
 */
export function BarreOnglets({
  actif,
  onChange,
  sortie = null,
}: {
  actif: Onglet
  onChange: (onglet: Onglet) => void
  /**
   * L'état de la sortie en cours, ou `null`. La barre est la seule chose
   * toujours visible sur un téléphone : c'est donc ici que se dit qu'un
   * enregistrement tourne pendant qu'on regarde la carte. Sans cela, on
   * range son téléphone en croyant avoir terminé, et le GPS tourne jusqu'à
   * la nuit.
   */
  sortie?: 'enregistrement' | 'pause' | null
}) {
  /*
   * Un geste de balayage, en plus du tap sur un bouton (AUDIT_UX.md,
   * constat D — repoussé au sprint 3 en même temps que les deux autres
   * items de la même revue, pour la même raison de risque qu'eux : un
   * balayage sur la carte ou sur le profil altimétrique veut déjà dire
   * autre chose (le pan MapLibre, le parcours du profil). La barre, elle,
   * ne porte aucun autre geste : c'est la seule zone où en ajouter un ne
   * peut rien recouvrir.
   *
   * Une référence et non un état : la position de départ n'a besoin d'être
   * lue qu'au relâchement, jamais d'un rendu pendant le geste.
   */
  const depart = useRef<{ x: number; y: number } | null>(null)
  // Posé au moment du balayage détecté, lu par le clic synthétique que le
  // navigateur envoie juste après : sans lui, relâcher sur un autre bouton
  // que celui de départ changerait l'onglet deux fois, avec deux cibles
  // différentes.
  const vientDeBalayer = useRef(false)

  const indexActif = ONGLETS.findIndex((o) => o.cle === actif)

  return (
    <nav
      className={styles.barre}
      aria-label="Sections de l’application"
      data-testid="barre-onglets"
      onPointerDown={(evenement) => {
        // Seul le bouton principal (ou un contact tactile, qui vaut 0 lui
        // aussi) compte comme un balayage — sinon un glissé au bouton droit
        // changeait d'onglet au lieu d'ouvrir un menu contextuel (trouvé en
        // revue, #balayage).
        if (evenement.button !== 0) return
        // Remis à plat ici, et pas seulement après le clic qui suit
        // d'ordinaire un balayage : sur un vrai doigt, un geste qui dépasse
        // le seuil de tap du navigateur ne déclenche souvent aucun clic de
        // suivi, et le drapeau serait resté levé pour avaler le tap
        // suivant, sans rapport (trouvé en revue, #balayage).
        vientDeBalayer.current = false
        depart.current = { x: evenement.clientX, y: evenement.clientY }
      }}
      onPointerUp={(evenement) => {
        const depuis = depart.current
        depart.current = null
        if (!depuis) return
        const dx = evenement.clientX - depuis.x
        const dy = evenement.clientY - depuis.y
        // Horizontal et net : un geste surtout vertical, ou trop court,
        // reste un tap raté plutôt qu'un balayage.
        if (Math.abs(dx) < SEUIL_BALAYAGE_PX || Math.abs(dx) <= Math.abs(dy)) {
          return
        }
        const cible = ONGLETS[indexActif + (dx < 0 ? 1 : -1)]
        if (!cible) return
        vientDeBalayer.current = true
        onChange(cible.cle)
      }}
      onPointerCancel={() => {
        depart.current = null
      }}
      onClickCapture={(evenement) => {
        if (!vientDeBalayer.current) return
        vientDeBalayer.current = false
        evenement.preventDefault()
        evenement.stopPropagation()
      }}
    >
      {ONGLETS.map((onglet) => (
        <button
          key={onglet.cle}
          type="button"
          className={styles.onglet}
          aria-current={actif === onglet.cle ? 'page' : undefined}
          data-testid={`onglet-${onglet.cle}`}
          onClick={() => {
            onChange(onglet.cle)
          }}
        >
          <span className={styles.icone} aria-hidden="true">
            {onglet.icone}
            {onglet.cle === 'sorties' && sortie !== null && (
              <span
                className={`${styles.temoin} ${sortie === 'pause' ? styles.temoinPause : ''}`}
                data-testid="temoin-sortie"
                data-etat={sortie}
              />
            )}
          </span>
          <span className={styles.libelle}>{onglet.libelle}</span>
          {onglet.cle === 'sorties' && sortie !== null && (
            <span className="sr-only">{ANNONCE_SORTIE[sortie]}</span>
          )}
        </button>
      ))}
    </nav>
  )
}
