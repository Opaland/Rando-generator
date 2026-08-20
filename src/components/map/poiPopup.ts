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
  return capacite ? `${titre}<br><span>${kindLabel}${capacite}</span>` : titre
}
