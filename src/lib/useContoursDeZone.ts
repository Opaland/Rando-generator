import { useEffect, useState } from 'react'
import type { ContoursDeZone } from '../core/lieuxDeTrace.ts'

/**
 * Les contours des zones prédéfinies (#296), lus à l'ouverture de
 * l'historique et pas avant : 84 ko gzippés (mesuré le 30/10) que la carte
 * n'a aucune raison de payer. Un seul chargement par session — l'historique
 * se monte et se démonte avec son onglet — un échec, lui, se retente à la
 * prochaine ouverture.
 *
 * Une panne rend `null` et ne dit rien : la recherche marche alors comme
 * avant #296, par nom de fichier, date et zone d'import. Rien n'y est faux,
 * il y manque seulement des mots.
 */
let chargement: Promise<ContoursDeZone | null> | null = null

function charger(): Promise<ContoursDeZone | null> {
  chargement ??= fetch(`${import.meta.env.BASE_URL}data/contours-de-zone.json`)
    .then((r) => (r.ok ? (r.json() as Promise<ContoursDeZone>) : null))
    .then((d) => (d && typeof d.contours === 'object' ? d : null))
    .catch(() => null)
    .then((c) => {
      // Un échec ne se garde pas : la prochaine ouverture réessaie.
      if (c === null) chargement = null
      return c
    })
  return chargement
}

export function useContoursDeZone(): ContoursDeZone | null {
  const [contours, setContours] = useState<ContoursDeZone | null>(null)
  useEffect(() => {
    let vivant = true
    void charger().then((c) => {
      if (vivant) setContours(c)
    })
    return () => {
      vivant = false
    }
  }, [])
  return contours
}
