import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'

/**
 * Vide `dist/` avant chaque construction (#612). Lu par `vite.config.ts`
 * seulement : l'application n'en importe rien.
 *
 * Vite le fait déjà — par `fs.rmSync`, qui sous Node 24.13 (Windows) **ne
 * fait rien, sans erreur**, dès que le chemin contient un caractère non
 * ASCII : « Moretti Cédric ». Mesuré le 26/10, `dist/` y empilait 110
 * `MapView-*.js` et 150 Mo, que le service worker local précachait tous.
 * `fs.promises.rm` n'a pas ce défaut.
 *
 * Et la suppression se vérifie : un vidage raté fait échouer le build au
 * lieu de laisser croire qu'il a eu lieu (§6quater). `rmSync` est interdit
 * par `eslint.config.js` pour la même raison.
 */
export async function viderLaSortie(dossier: string): Promise<void> {
  await rm(dossier, { recursive: true, force: true })
  if (existsSync(dossier)) {
    throw new Error(
      `${dossier} n'a pas pu être vidé : le build empilerait les anciens bundles (#612).`,
    )
  }
}
