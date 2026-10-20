import type { SentiersDb } from '../db/database.ts'
import { resumeFusion } from '../core/backup.ts'
import type { ParcoursDeclare } from '../core/declaratif.ts'
import type { Itinerary, Track } from '../core/types.ts'

/**
 * Les écritures d'une restauration, et ce que la base en a vraiment reçu
 * (#559, point 5).
 *
 * Une écriture refusée en route — appareil plein — laissait une trace en
 * base, aucune à l'écran, et aucun message : l'exception remontait jusqu'à
 * un `void` dans `Backup.tsx`. L'écran doit montrer ce qui est écrit, ni
 * plus ni moins, et dire que la restauration s'est arrêtée. Sans base, rien
 * n'est écrit et tout est montré, comme avant.
 *
 * Sorti de `trancheSauvegarde.ts`, que ce correctif portait de 255 à 301
 * lignes pour un plafond de 270 : c'est un mécanisme entier, avec sa raison.
 */
export type BaseDeRestauration = Pick<
  SentiersDb,
  'saveTrack' | 'saveCustomItinerary' | 'declarerParcours'
>

export interface RestaurationEcrite {
  traces: Track[]
  persos: Itinerary[]
  /** Toutes les déclarations ont-elles été écrites ? */
  declarations: boolean
  interrompue: boolean
}

export async function ecrireLaRestauration(
  db: BaseDeRestauration | null,
  neufs: { traces: Track[]; persos: Itinerary[] },
  declarations: ParcoursDeclare[],
): Promise<RestaurationEcrite> {
  if (!db) {
    return { ...neufs, declarations: true, interrompue: false }
  }
  const ecrit: RestaurationEcrite = {
    traces: [],
    persos: [],
    declarations: false,
    interrompue: false,
  }
  try {
    for (const track of neufs.traces) {
      await db.saveTrack(track)
      ecrit.traces.push(track)
    }
    for (const itin of neufs.persos) {
      await db.saveCustomItinerary(itin)
      ecrit.persos.push(itin)
    }
    for (const declaration of declarations) {
      await db.declarerParcours(declaration)
    }
    ecrit.declarations = true
  } catch {
    ecrit.interrompue = true
  }
  return ecrit
}

/**
 * Le compte rendu de ce qui est **entré**, et l'arrêt s'il y en a eu un.
 * Interrompue, une restauration ne reprend pas non plus les réglages : elle
 * ne doit pas changer en plus ce qu'on n'a pas demandé à voir changer.
 */
export function resumeDeRestauration(
  ecrit: RestaurationEcrite,
  traces: Parameters<typeof resumeFusion>[0],
  persos: Parameters<typeof resumeFusion>[1],
): string {
  const resume = resumeFusion(
    { ...traces, ajoutees: ecrit.traces.length },
    { ...persos, ajoutes: ecrit.persos.length },
  )
  return ecrit.interrompue
    ? `Restauration interrompue : le navigateur a refusé d’enregistrer la suite. ${resume}`
    : resume
}
