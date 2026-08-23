import { formatChrono, formatDistance, formatPct } from '../lib/format.ts'

/**
 * Ce que la poignée de la feuille annonce, sur téléphone.
 *
 * C'est la seule ligne toujours visible au-dessus de la barre d'onglets
 * quand la feuille est repliée pour regarder la carte. Trois choses à dire
 * selon le moment, et une seule à la fois — d'où une fonction plutôt qu'une
 * expression ternaire dans le rendu : la règle se lit, et elle s'éprouve.
 *
 * Le troisième cas est né de la revue du 23/08. Pendant qu'une sortie
 * s'enregistrait, la poignée annonçait toujours « Zones, traces et
 * réglages », alors que la feuille de route demande « rien qui demande de
 * sortir le téléphone toutes les deux minutes » : il fallait déplier la
 * feuille et changer d'onglet pour lire sa distance.
 */

export interface EtatPoignee {
  /** Les chiffres de la sortie en cours, ou `null` s'il n'y en a pas. */
  sortie: { distanceMetres: number; dureeEnMarcheMs: number } | null
  /** Progression globale, ou `null` s'il n'y a rien à compter (constat U5). */
  pourcentage: number | null
}

export function libellePoignee({ sortie, pourcentage }: EtatPoignee): string {
  if (sortie !== null) {
    // Avant la première position, il n'y a rien à afficher qui ne soit un
    // zéro — et accueillir quelqu'un par un zéro est le défaut que U5 a
    // corrigé ailleurs. On dit ce qui est vrai : une sortie a commencé.
    if (sortie.distanceMetres <= 0) return 'Sortie en cours'
    return `${formatDistance(sortie.distanceMetres)} · ${formatChrono(sortie.dureeEnMarcheMs)}`
  }
  if (pourcentage === null) return 'Zones, traces et réglages'
  return `${formatPct(pourcentage)} parcourus`
}
