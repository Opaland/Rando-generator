import { figureDuBalisage } from '../lib/balisageDisplay.ts'
import { ENCRE } from '../lib/couleursPartagees.ts'

/**
 * La balise, dessinée (issue #381).
 *
 * OsmAnd et Waymarked Trails dessinent `osmc:symbol` ; Sentiers le décrivait
 * en toutes lettres. « Rectangle rouge sur fond blanc » est juste, et
 * demande à Anne-Marie de reconstituer mentalement ce qu'elle a sous les
 * yeux depuis quarante ans.
 *
 * Le dessin **accompagne** la phrase, il ne la remplace pas : une imprimante
 * noir et blanc, un lecteur d'écran et un daltonien ont tous besoin des mots
 * (#360). D'où `aria-hidden` — la phrase voisine dit déjà tout, et la
 * répéter ferait entendre la balise deux fois.
 */
export function BalisePeinte({ tag }: { tag: string | undefined }) {
  const figure = figureDuBalisage(tag)
  if (!figure) return null

  /*
    Le cadre est dimensionné en `em` par le CSS : la balise grandit avec le
    texte qu'elle accompagne, donc avec le mode gros texte de Théo, sans
    qu'aucun pixel ne soit choisi ici (§2 — on dérive d'une grandeur qui
    existe plutôt que d'en inventer une).

    Le liseré d'encre existe parce qu'une balise blanche sur fond blanc
    serait invisible : c'est la même raison que `BLANC_BALISAGE`, et il est
    posé sur le cadre entier plutôt que sur chaque figure.
  */
  return (
    <svg
      viewBox="0 0 20 20"
      className="balise-peinte"
      data-testid="balise-peinte"
      aria-hidden="true"
      focusable="false"
    >
      {figure.fond !== null && (
        <rect x="0" y="0" width="20" height="20" rx="2" fill={figure.fond} />
      )}
      {figure.genre === 'moities' && (
        <>
          <rect x="2" y="3" width="16" height="7" fill={figure.haut} />
          <rect x="2" y="10" width="16" height="7" fill={figure.bas} />
        </>
      )}
      {figure.genre === 'barre' && (
        <rect x="2" y="7" width="16" height="6" fill={figure.couleur} />
      )}
      {/*
        La crête : deux versants, le sommet au milieu. Dessinée en polygone
        plein et non en trait, parce qu'une balise est une surface peinte.
      */}
      {figure.genre === 'crete' && (
        <polygon points="2,15 10,4 18,15 14,15 10,9 6,15" fill={figure.couleur} />
      )}
      <rect
        x="0.5"
        y="0.5"
        width="19"
        height="19"
        rx="2"
        fill="none"
        stroke={ENCRE}
        strokeOpacity="0.35"
      />
    </svg>
  )
}
