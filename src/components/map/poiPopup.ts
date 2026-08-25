import { POI_LABELS } from '../../lib/poiDisplay.ts'
import { escapeHtml } from './style.ts'
import type { PoiKind } from '../../core/types.ts'

/**
 * Contenu HTML de l'infobulle d'un point d'intérêt.
 *
 * Extrait de MapView pour être testable : ces chaînes portent des noms venus
 * d'OpenStreetMap, c'est-à-dire d'inconnus. Un nom de refuge contenant du
 * balisage doit s'afficher tel quel, pas s'exécuter.
 */
export interface PoiPopupProps {
  name?: string | undefined
  kind?: PoiKind | undefined
  capacity?: string | null | undefined
}

export function poiPopupHtml(props: PoiPopupProps | undefined): string {
  const kindLabel = props?.kind ? POI_LABELS[props.kind] : 'Point d’intérêt'
  const capacite = props?.capacity
    ? ` · ${escapeHtml(props.capacity)} places`
    : ''
  const titre = `<strong>${escapeHtml(props?.name ?? kindLabel)}</strong>`
  // Sans nom, le titre porte déjà le type : le répéter dessous ne dirait rien
  // de plus — sauf s'il reste la capacité à annoncer.
  if (props?.name) {
    return `${titre}<br><span>${escapeHtml(kindLabel)}${capacite}</span>`
  }
  // `escapeHtml` des deux côtés, alors que `kindLabel` vient d'une table
  // interne et ne peut rien contenir de dangereux aujourd'hui.
  //
  // C'est l'asymétrie qui était le défaut : la branche du dessus l'échappait,
  // celle-ci non. Rien ne signalait laquelle avait raison, et la prochaine
  // valeur ajoutée à la table aurait hérité de la mauvaise moitié. Une règle
  // qui ne vaut que dans un cas sur deux n'est pas une règle (revue globale
  // du 25/08).
  return capacite
    ? `${titre}<br><span>${escapeHtml(kindLabel)}${capacite}</span>`
    : titre
}
