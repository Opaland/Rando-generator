import type { PoiDetails, PoiKind } from '../core/types.ts'

/** Libellés et couleurs des catégories de POI, partagés entre la carte et la fiche détail. */
export const POI_LABELS: Record<PoiKind, string> = {
  viewpoint: 'Point de vue',
  peak: 'Sommet',
  pass: 'Col',
  hut: 'Refuge gardé',
  bivouac: 'Couchage libre',
  gite: 'Gîte d’étape',
  shelter: 'Abri (pause)',
  water: "Point d'eau",
  picnic: 'Pique-nique',
  ruins: 'Vestige',
  marker: 'Croix ou borne',
  monument: 'Monument',
}

/**
 * Les familles de points d'intérêt, et ce qu'elles veulent dire.
 *
 * Le code couleur n'en était pas un : douze teintes posées une par une au
 * fil des lots, sans règle. Mesuré le 23/08, il portait trois défauts que
 * personne ne pouvait voir en relisant la liste :
 *
 * - **`hut` valait exactement `#c8102e`**, la couleur du balisage GR. Une
 *   pastille de refuge était bit pour bit la couleur d'un tracé GR ;
 * - **`water` valait exactement `#1d6fa5`**, le bleu de « où suis-je ». Un
 *   point d'eau et sa propre position, même point de 6 px, même couleur ;
 * - **`ruins` et `marker` étaient à ΔE 11,7 l'un de l'autre** — en dessous
 *   de ce qui se distingue sur une pastille de six pixels. Quatre autres
 *   paires étaient sous 20.
 *
 * La règle est maintenant celle-ci : **une famille, une teinte ; à
 * l'intérieur d'une famille, la clarté dit l'engagement.** Trois violets du
 * foncé au clair pour dormir — gardé, réservé, libre. Deux verts pour la
 * halte, où l'on s'arrête sans dormir. La terre et le regard pour le relief.
 * Un bleu profond pour l'eau. Des minéraux sourds pour le patrimoine.
 *
 * Le déplacement qui compte est celui de l'abri météo : il était gris-bleu,
 * au milieu des couchages ; il est vert, avec le pique-nique. C'est la
 * distinction que l'issue #23 puis #161 ont défendue — **on n'y dort pas** —
 * et elle se lit désormais sur la carte sans ouvrir la fiche.
 *
 * Écarté : garder les teintes et se contenter de les nommer. Cela aurait
 * rangé le code sans rien changer pour qui regarde la carte, alors que les
 * deux collisions, elles, trompent.
 *
 * `tests/unit/poiCouleurs.test.ts` tient les trois règles en chiffres —
 * contraste, distance aux couleurs de l'application, séparation des
 * familles. Elles sont **calculées**, pas recopiées : une teinte changée au
 * jugement rougit si elle sort du code.
 */
export type FamillePoi = 'dormir' | 'halte' | 'relief' | 'eau' | 'patrimoine'

export const POI_FAMILLES: Record<PoiKind, FamillePoi> = {
  hut: 'dormir',
  gite: 'dormir',
  bivouac: 'dormir',
  shelter: 'halte',
  picnic: 'halte',
  peak: 'relief',
  pass: 'relief',
  viewpoint: 'relief',
  water: 'eau',
  ruins: 'patrimoine',
  marker: 'patrimoine',
  monument: 'patrimoine',
}

export const POI_COLORS: Record<PoiKind, string> = {
  // Dormir — violet, du foncé au clair : plus c'est clair, moins il faut
  // avoir prévu. Refuge gardé, gîte d'étape, couchage libre.
  hut: '#5b2b7a',
  gite: '#8244a8',
  bivouac: '#a375c0',

  // Halte — vert : on s'y arrête, on n'y dort pas.
  picnic: '#4e6b2c',
  shelter: '#7d8a5c',

  // Relief — la terre et le regard.
  peak: '#6b4226',
  pass: '#a06a2c',
  viewpoint: '#2f6f4f',

  // Eau — un bleu profond, tenu à distance du bleu de la position.
  water: '#0e3a80',

  // Patrimoine — minéraux sourds, du plus massif au plus discret.
  monument: '#3f3a52',
  ruins: '#8a5a5a',
  marker: '#b07a94',
}

/**
 * Catégories où l'on peut passer la nuit **sans réservation ni gardien**.
 *
 * Ni le refuge gardé ni le gîte d'étape n'y entrent, et pour la même
 * raison : les deux se réservent, et les deux ferment. La question à
 * laquelle cette liste répond est « où puis-je dormir ce soir sans avoir
 * rien prévu » — y ajouter un gîte laisserait croire qu'on peut s'y
 * présenter.
 */
export const POI_OVERNIGHT: PoiKind[] = ['bivouac']

/**
 * Ce qu'on peut honnêtement dire d'un point d'eau.
 *
 * Une fontaine `drinking_water` est prévue pour être bue : sans mention
 * contraire, on n'ajoute pas de doute là où il n'y en a pas. Une source
 * naturelle, elle, n'est potable que si OpenStreetMap l'affirme — et le
 * silence de la donnée est une information à afficher, pas un blanc à
 * laisser interpréter.
 */
export function mentionEau(details: PoiDetails): string | null {
  const morceaux: string[] = []
  if (details.drinkingWater === 'oui') morceaux.push('potable')
  else if (details.drinkingWater === 'non') morceaux.push('non potable')
  else if (details.drinkingWater === 'traitee') morceaux.push('potable (traitée)')
  else if (details.spring) morceaux.push('potabilité non renseignée')
  if (details.seasonal) morceaux.push('saisonnière')
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
