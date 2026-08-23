import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { openSentiersDb, DB_VERSION, DbError } from '../../src/db/database.ts'

/**
 * Deux onglets, deux versions de la base — trouvé à la revue du sprint.
 *
 * IndexedDB refuse de migrer tant qu'une connexion à l'ancienne version
 * vit. Sans gestionnaire, `openDB` **n'aboutit jamais** : mesuré, la
 * promesse reste en attente au-delà de toute limite raisonnable. Elle ne
 * lève pas — donc `init()` n'affiche aucun avertissement, la base reste
 * `null`, et tout ce qu'on importe dans ce nouvel onglet est perdu en
 * silence.
 *
 * Le cas est devenu deux fois plus probable en une journée : la base est
 * passée de la version 3 à la 5 en trois heures (#153 puis #158). Quelqu'un
 * qui garde Sentiers ouvert dans un onglet et rouvre le site dans un autre
 * le rencontre.
 *
 * Deux remèdes, et il faut les deux :
 *
 * - **`blocking`** : l'onglet ancien ferme sa connexion pour laisser passer
 *   la migration. Sans cela, c'est à l'utilisateur de deviner qu'il doit
 *   fermer un onglet ;
 * - **`blocked`** : si malgré tout la migration reste impossible, on
 *   abandonne avec un message qui dit quoi faire, plutôt que d'attendre
 *   sans fin.
 */

async function ouvrirAncienneVersion(nom: string) {
  const { openDB } = await import('idb')
  return openDB(nom, DB_VERSION - 1, {
    upgrade(db) {
      db.createObjectStore('zones', { keyPath: 'zoneKey' })
    },
  })
}

describe('deux onglets sur deux versions', () => {
  it('n’attend pas indéfiniment : la migration passe ou elle le dit', async () => {
    const nom = `deux-onglets-${String(Math.floor(Math.random() * 1e9))}`
    const ancien = await ouvrirAncienneVersion(nom)

    const verdict = await Promise.race([
      openSentiersDb(nom).then(
        (db) => {
          db.raw.close()
          return 'migré'
        },
        (erreur: unknown) => (erreur instanceof DbError ? 'refusé' : 'autre'),
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve('bloqué sans fin')
        }, 3_000),
      ),
    ])

    ancien.close()
    // L'un ou l'autre convient ; ce qui ne convient pas, c'est l'attente
    // muette. C'est elle que ce test interdit.
    expect(['migré', 'refusé']).toContain(verdict)
  })

  it('quand elle est refusée, elle dit quoi faire', async () => {
    const nom = `deux-onglets-msg-${String(Math.floor(Math.random() * 1e9))}`
    const ancien = await ouvrirAncienneVersion(nom)
    let message: string | null = null
    try {
      const db = await openSentiersDb(nom)
      db.raw.close()
    } catch (erreur) {
      message = erreur instanceof Error ? erreur.message : null
    }
    ancien.close()
    // Si la migration est passée, il n'y a rien à dire. Si elle a été
    // refusée, le message doit parler d'onglet — pas de « erreur inconnue ».
    if (message !== null) expect(message).toMatch(/onglet/i)
  })
})

/**
 * Le remède qui répare vraiment : l'onglet **ancien** ferme sa connexion.
 *
 * Le test précédent ouvrait l'ancienne version sans ce code — il ne pouvait
 * donc exercer que le renoncement. Ici, c'est une connexion ouverte par
 * `openSentiersDb` qui doit s'effacer devant une version supérieure, ce qui
 * est exactement la situation de deux onglets exécutant la même application.
 */
describe('l’onglet ancien laisse passer la migration', () => {
  it('ferme sa connexion quand une version supérieure se présente', async () => {
    const nom = `blocking-${String(Math.floor(Math.random() * 1e9))}`
    const ancien = await openSentiersDb(nom)
    const { openDB } = await import('idb')

    const verdict = await Promise.race([
      openDB(nom, DB_VERSION + 1, {
        upgrade(db) {
          db.createObjectStore('futur')
        },
      }).then((db) => {
        db.close()
        return 'migré'
      }),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve('bloqué sans fin')
        }, 3_000),
      ),
    ])

    // `close()` est idempotent : si `blocking` a déjà fermé, ceci ne coûte rien.
    ancien.raw.close()
    expect(verdict).toBe('migré')
  })
})
