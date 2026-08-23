import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { openSentiersDb, DB_VERSION, type SentiersDb } from '../../src/db/database.ts'
import {
  entete,
  pointsAEcrire,
  reprendreApresInterruption,
} from '../../src/core/reprise.ts'
import {
  ajouterPoint,
  demarrer,
  enregistreurVide,
  suspendre,
  type Enregistrement,
  type PointBrut,
} from '../../src/core/recorder.ts'

/**
 * Issue #152, pierre 2 — la moitié qui touche le disque.
 *
 * `core/reprise.ts` dit quoi écrire ; ici on vérifie que ça survit
 * réellement à une base fermée puis rouverte, ce qu'aucun test en mémoire
 * ne peut prouver.
 */

let db: SentiersDb
let compteur = 0
let nom = ''

beforeEach(async () => {
  compteur += 1
  nom = `sentiers-reprise-${String(compteur)}`
  db = await openSentiersDb(nom)
})

const T0 = 1_700_000_000_000

function point(i: number): PointBrut {
  return {
    lon: 4.8 + i / 1000,
    lat: 45.75,
    instant: T0 + i * 1000,
    precisionMetres: 8,
    altitude: 210 + i,
  }
}

/** Écrit ce qui manque, comme le fera la boucle de géolocalisation. */
async function synchroniser(
  base: SentiersDb,
  e: Enregistrement,
  instant: number,
): Promise<void> {
  const dejaEcrits = await base.compterPointsEnregistres()
  await base.ajouterPointsEnregistres(pointsAEcrire(e, dejaEcrits))
  await base.ecrireEntete(entete(e, instant))
}

describe('la base', () => {
  it('ne trouve ni en-tête ni point sur une base neuve', async () => {
    expect(await db.lireEntete()).toBeUndefined()
    expect(await db.compterPointsEnregistres()).toBe(0)
    expect(await db.lirePointsEnregistres()).toEqual([])
  })
})

describe('l’écriture au fil de la sortie', () => {
  it('n’écrit chaque point qu’une fois, même en synchronisant à chaque pas', async () => {
    let e = demarrer(enregistreurVide(), T0)
    for (let i = 1; i <= 12; i++) {
      e = ajouterPoint(e, point(i))
      await synchroniser(db, e, point(i).instant)
    }
    expect(await db.compterPointsEnregistres()).toBe(12)
    expect(await db.lirePointsEnregistres()).toEqual(e.points)
  })

  it('rend les points dans l’ordre où ils sont arrivés', async () => {
    let e = demarrer(enregistreurVide(), T0)
    for (let i = 1; i <= 30; i++) e = ajouterPoint(e, point(i))
    await synchroniser(db, e, point(30).instant)
    const lus = await db.lirePointsEnregistres()
    expect(lus.map((p) => p.instant)).toEqual(e.points.map((p) => p.instant))
  })

  it('efface l’ancienne sortie quand une nouvelle commence', async () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(1))
    await synchroniser(db, e, point(1).instant)

    await db.effacerEnregistrement()
    expect(await db.lireEntete()).toBeUndefined()
    expect(await db.compterPointsEnregistres()).toBe(0)
  })
})

describe('l’onglet tué', () => {
  /**
   * Le cœur de cette pierre. La base est fermée sans prévenir — c'est ce que
   * fait un navigateur qui récupère de la mémoire — puis rouverte comme au
   * prochain lancement de l'application.
   */
  it('retrouve la sortie après une fermeture brutale, en pause', async () => {
    let e = demarrer(enregistreurVide(), T0)
    for (let i = 1; i <= 8; i++) {
      e = ajouterPoint(e, point(i))
      await synchroniser(db, e, point(i).instant)
    }

    db.raw.close()
    const rouverte = await openSentiersDb(nom)

    const tete = await rouverte.lireEntete()
    expect(tete).toBeDefined()
    const points = await rouverte.lirePointsEnregistres()
    const repris = tete ? reprendreApresInterruption(tete, points) : null

    expect(repris).not.toBeNull()
    expect(repris?.etat).toBe('pause')
    expect(repris?.points).toEqual(e.points)
    expect(repris?.demarreA).toBe(T0)
    expect(repris?.intervalles).toEqual([{ debut: T0, fin: point(8).instant }])
  })

  it('retrouve une sortie tuée pendant une pause sans la rallonger', async () => {
    let e = demarrer(enregistreurVide(), T0)
    e = ajouterPoint(e, point(1))
    e = suspendre(e, point(2).instant)
    await synchroniser(db, e, point(2).instant)

    db.raw.close()
    const rouverte = await openSentiersDb(nom)
    const tete = await rouverte.lireEntete()
    const repris = tete
      ? reprendreApresInterruption(tete, await rouverte.lirePointsEnregistres())
      : null

    expect(repris?.intervalles).toEqual([{ debut: T0, fin: point(2).instant }])
  })

  it('ne perd que le dernier point quand la mort survient entre deux écritures', async () => {
    let e = demarrer(enregistreurVide(), T0)
    for (let i = 1; i <= 5; i++) {
      e = ajouterPoint(e, point(i))
      await synchroniser(db, e, point(i).instant)
    }
    // Un sixième point arrive, l'onglet meurt avant l'écriture.
    expect(ajouterPoint(e, point(6)).points).toHaveLength(6)

    db.raw.close()
    const rouverte = await openSentiersDb(nom)
    const points = await rouverte.lirePointsEnregistres()
    expect(points).toHaveLength(5)
    expect(points.at(-1)?.instant).toBe(point(5).instant)
  })
})

describe('la migration', () => {
  it('ajoute les magasins à une base v2 sans perdre ce qu’elle contenait', async () => {
    const nomV2 = `sentiers-migration-reprise-${String(compteur)}`
    const { openDB } = await import('idb')
    const v2 = await openDB(nomV2, 2, {
      upgrade(base) {
        base.createObjectStore('zones', { keyPath: 'zoneKey' })
        base.createObjectStore('tracks', { keyPath: 'id' })
        base.createObjectStore('settings')
        base.createObjectStore('customItineraries', { keyPath: 'osmRelationId' })
      },
    })
    await v2.put('settings', 42, 'toleranceMeters')
    v2.close()

    const migree = await openSentiersDb(nomV2)
    expect(migree.raw.version).toBe(DB_VERSION)
    expect(await migree.getSetting('toleranceMeters')).toBe(42)
    expect(await migree.lireEntete()).toBeUndefined()
  })
})
