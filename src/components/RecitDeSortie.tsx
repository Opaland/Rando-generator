import { useMemo } from 'react'
import { faitsDeSortie } from '../core/faitsDeSortie.ts'
import type { OutingHighlight } from '../core/outing.ts'
import { CONSIGNE_SORTIE, messageDesFaits } from '../core/redactionClaude.ts'
import type { Track } from '../core/types.ts'
import { useContoursDeZone } from '../lib/useContoursDeZone.ts'
import { useAppStore } from '../store/appStore.ts'
import { RedactionClaude } from './RedactionClaude.tsx'

/**
 * Le récit d'une sortie écrit par Claude (issue #673, deuxième usage), dans
 * la fiche de la sortie. Les itinéraires avancés sont ceux que la fiche
 * affiche déjà (`highlights`) : le récit ne recalcule rien.
 */
export function RecitDeSortie({
  track,
  highlights,
}: {
  track: Track
  highlights: readonly OutingHighlight[]
}) {
  const itineraires = useAppStore((s) => s.itineraries)
  const contours = useContoursDeZone()
  const faits = useMemo(
    () => faitsDeSortie(track, highlights, itineraires, contours),
    [track, highlights, itineraires, contours],
  )
  return (
    <RedactionClaude
      faits={faits}
      consigne={CONSIGNE_SORTIE}
      message={messageDesFaits(faits)}
      libelle="Raconter cette sortie"
      sansCle="Facultatif : avec votre clé d’API Anthropic (Réglages), Claude peut raconter cette sortie."
      prefixe="recit"
    />
  )
}
