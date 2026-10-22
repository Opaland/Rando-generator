import { test, expect, type Page } from '@playwright/test'
import { afficherTousLesReseaux, mockElevation, mockExternalNetwork, mockTilesOk, fermerLeGuide } from './helpers.ts'
import pilatFixture from '../fixtures/overpass/pilat.json' with { type: 'json' }

/**
 * Issue #93 — l'étape préalable que l'issue appelle « sans risque » :
 * mesurer, avant de décider si les tuiles vectorielles de Wandrer sont un
 * chantier à ouvrir. Rien ici ne tranche l'architecture (§2, §6sexies) —
 * ça ne ferait que peindre une zone chargée et relever deux chiffres.
 *
 * ## La donnée est fabriquée, et c'est écrit en toutes lettres
 *
 * #285 l'a déjà constaté pour un autre besoin : `overpass-api.de` est
 * refusé par le proxy sortant de cet environnement. Il n'y a donc aucune
 * vraie zone dense à charger pour mesurer dessus. `fixtureDense()` fabrique
 * 300 relations de 24 points chacune (7 200 points), réparties sur une
 * boîte de 0,7° × 1,3° — l'ordre de grandeur d'un département, pas celui
 * du seul Parc du Pilat (~200 circuits mesurés dans #88). Un générateur
 * pseudo-aléatoire à graine fixe (`mulberry32`) la rend identique à chaque
 * exécution, pour la même raison que `PROFIL_RESEAU` dans
 * `premier-chargement.spec.ts` : comparable d'une fois sur l'autre, jamais
 * une reproduction certifiée d'une vraie région.
 *
 * ## Ce qui est mesuré, et ses limites
 *
 * Chaque mesure est prise deux fois — sur la zone dense, puis sur la
 * fixture Pilat par défaut (3 itinéraires) — parce qu'un chiffre seul ne
 * dit rien ici : un panoramique à 25 images par seconde est-ce la densité
 * qui coûte, ou le plafond logiciel de cette machine ? Seul l'écart entre
 * les deux répond.
 *
 * 1. **temps de traitement** : du déclenchement du chargement à ce que la
 *    fiche de zone affiche le bon compte d'itinéraires — ça couvre le
 *    parsing Overpass et le calcul de complétion, pas le rendu MapLibre.
 * 2. **temps jusqu'au rendu stable** : l'événement `idle` de MapLibre, posé
 *    sur `window.__sentiersMap` (exposé pour les tests, `useMapInstance.ts`)
 *    avant le déclenchement — c'est MapLibre lui-même qui dit qu'il n'a
 *    plus rien à peindre, pas une heuristique sur `requestAnimationFrame` :
 *    une première version comptait les images, et ne s'arrêtait jamais —
 *    cet environnement garde la carte en animation continue (compas, rendu
 *    logiciel), ce que `idle` ignore à raison puisqu'aucune donnée n'y est
 *    en cause.
 * 3. **images par seconde pendant un panoramique** : nombre d'appels à
 *    `requestAnimationFrame` sur la durée d'un geste de glissement, divisé
 *    par cette durée. Mesuré dans un Chromium sans tête, sur la machine
 *    d'intégration — pas sur un vrai téléphone, exactement la limite que
 *    #14 a déjà posée pour l'audit mobile.
 *
 * **Ce fichier ne juge pas** — aucune assertion de seuil. Inventer un
 * plancher d'images par seconde sans l'avoir vu varier sur plusieurs
 * machines serait le nombre inventé que le §2 interdit.
 *
 * Hors de la porte, comme `mesure-bibliotheque.spec.ts` : `npm run dense`.
 */

const BOITE = { latMin: 44.9, latMax: 45.6, lonMin: 4.0, lonMax: 5.3 }
const NB_RELATIONS = 300
const POINTS_PAR_VOIE = 24

/** PRNG déterministe à graine fixe — https://github.com/bryc/code (domaine public). */
function mulberry32(graine: number): () => number {
  let etat = graine
  return () => {
    etat |= 0
    etat = (etat + 0x6d2b79f5) | 0
    let t = Math.imul(etat ^ (etat >>> 15), 1 | etat)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fixtureDense(): unknown {
  const alea = mulberry32(42)
  const elements: unknown[] = []
  for (let i = 0; i < NB_RELATIONS; i += 1) {
    let lat = BOITE.latMin + alea() * (BOITE.latMax - BOITE.latMin)
    let lon = BOITE.lonMin + alea() * (BOITE.lonMax - BOITE.lonMin)
    const geometry: { lat: number; lon: number }[] = []
    for (let p = 0; p < POINTS_PAR_VOIE; p += 1) {
      geometry.push({ lat, lon })
      lat += (alea() - 0.5) * 0.01
      lon += (alea() - 0.5) * 0.01
    }
    elements.push({
      type: 'relation',
      id: 9_000_000 + i,
      timestamp: '2024-01-01T00:00:00Z',
      tags: {
        type: 'route',
        route: 'hiking',
        network: 'nwn',
        ref: `GR ${String(i)}`,
        name: `Itinéraire synthétique ${String(i)}`,
      },
      members: [{ type: 'way', ref: 8_000_000 + i, role: '', geometry }],
    })
  }
  return {
    version: 0.6,
    generator: 'fixture synthétique (#93) — pas une réponse Overpass réelle',
    elements,
  }
}

function relever(nom: string, valeur: string): void {
  process.stdout.write(`\nMESURE ${nom} = ${valeur}\n`)
}

/**
 * Déclenche un chargement de zone et mesure deux temps : jusqu'à ce que la
 * fiche annonce le bon compte (traitement — parsing et complétion), puis
 * jusqu'au premier `idle` de MapLibre qui suit (rendu stable).
 *
 * La sonde `idle` est posée **avant** `declencher` : un `idle` tiré entre le
 * déclenchement et une sonde installée après coup serait manqué, et la
 * mesure dirait « jamais stabilisé » pour une carte qui l'était déjà.
 */
async function mesurerChargementZone(
  page: Page,
  texteAttendu: string,
  declencher: () => Promise<void>,
): Promise<{ traitementMs: number; renduStableMs: number }> {
  await page.evaluate(() => {
    const map = (
      window as unknown as {
        __sentiersMap?: { once: (evt: string, cb: () => void) => void }
      }
    ).__sentiersMap
    ;(window as unknown as { __idleApresMs: number | null }).__idleApresMs = null
    const debut = performance.now()
    map?.once('idle', () => {
      ;(
        window as unknown as { __idleApresMs: number | null }
      ).__idleApresMs = performance.now() - debut
    })
  })

  const debut = Date.now()
  await declencher()
  await expect(page.getByTestId('zone-meta')).toContainText(texteAttendu, {
    timeout: 60_000,
  })
  const traitementMs = Date.now() - debut

  await page.waitForFunction(
    () =>
      (window as unknown as { __idleApresMs: number | null })
        .__idleApresMs !== null,
    { timeout: 60_000 },
  )
  const renduStableMs = await page.evaluate(
    () => (window as unknown as { __idleApresMs: number }).__idleApresMs,
  )
  return { traitementMs, renduStableMs: Math.round(renduStableMs) }
}

/**
 * Images par seconde sur une fenêtre de temps, pendant un geste ou au repos.
 *
 * Compte les appels à `requestAnimationFrame`, pas des peintures confirmées
 * — mais c'est la même prise que la stabilisation : aucune autre mesure de
 * cadence n'est accessible depuis Playwright sans instrumenter l'application
 * elle-même pour ce seul banc.
 */
async function compterFpsPendant(
  page: Page,
  dureeMs: number,
  geste?: () => Promise<void>,
): Promise<number> {
  await page.evaluate(() => {
    ;(window as unknown as { __raf: number }).__raf = 0
    const original = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => {
      ;(window as unknown as { __raf: number }).__raf += 1
      return original(cb)
    }
  })
  const debut = Date.now()
  if (geste) await geste()
  const attente = dureeMs - (Date.now() - debut)
  if (attente > 0) await page.waitForTimeout(attente)
  const dureeReelle = Date.now() - debut
  const frames = await page.evaluate(
    () => (window as unknown as { __raf: number }).__raf,
  )
  return (frames / dureeReelle) * 1000
}

test.describe('ce que coûte une zone dense sur la carte (issue #93)', () => {
  test.skip(
    process.env['DENSE'] !== '1',
    'Mesure de performance, hors de la porte : `npm run dense`.',
  )
  test.setTimeout(2 * 60 * 1000)

  test('300 itinéraires synthétiques : traitement, stabilisation, panoramique', async ({
    page,
  }) => {
    const overpass = await mockExternalNetwork(page)
    await mockTilesOk(page)
    await mockElevation(page)
    overpass.setFixture(fixtureDense())
    await page.goto('/')
    await fermerLeGuide(page)

    const dense = await mesurerChargementZone(
      page,
      `${String(NB_RELATIONS)} itinéraires`,
      () => page.getByTestId('zone-pilat').click(),
    )
    relever('dense_traitement_ms', String(dense.traitementMs))
    relever('dense_rendu_stable_ms', String(dense.renduStableMs))

    await afficherTousLesReseaux(page)

    const canvas = page.locator('.maplibregl-canvas').first()
    const boite = await canvas.boundingBox()
    if (!boite) throw new Error('canvas de carte introuvable')
    const cx = boite.x + boite.width / 2
    const cy = boite.y + boite.height / 2

    const panoramique = async (): Promise<void> => {
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      for (let i = 1; i <= 20; i += 1) {
        await page.mouse.move(cx - i * 3, cy - i * 2, { steps: 2 })
      }
      await page.mouse.up()
    }

    // Repos d'abord : cet environnement anime la carte en continu (compas,
    // rendu logiciel) même sans aucun geste — c'est ce qui a fait échouer la
    // première version de ce banc, qui attendait un silence qui n'arrivait
    // jamais. Confirmé ici : le chiffre sert de plancher de référence, pas
    // de comparaison avec le panoramique.
    relever('fps_repos', (await compterFpsPendant(page, 1_000)).toFixed(1))
    const fpsDense = await compterFpsPendant(page, 1_000, panoramique)
    relever('dense_fps_panoramique', fpsDense.toFixed(1))

    // La même mesure sur la fixture clairsemée par défaut (3 itinéraires) :
    // sans ce second passage, un chiffre de panoramique seul ne dit rien —
    // il pourrait mesurer le plafond logiciel de la machine autant que le
    // coût réel de la densité. `zone-refresh` force un rechargement malgré
    // le cache de 30 jours (CLAUDE.md §6).
    overpass.setFixture(pilatFixture)
    const clairseme = await mesurerChargementZone(page, '3 itinéraires', () =>
      page.getByTestId('zone-refresh').click(),
    )
    relever('clairseme_traitement_ms', String(clairseme.traitementMs))
    relever('clairseme_rendu_stable_ms', String(clairseme.renduStableMs))
    const fpsClairseme = await compterFpsPendant(page, 1_000, panoramique)
    relever('clairseme_fps_panoramique', fpsClairseme.toFixed(1))

    process.stdout.write(
      '\nÀ lire : chaque mesure « dense_* » se compare à son équivalent\n' +
        '« clairseme_* », sur la même machine et le même geste — c\'est cet\n' +
        'écart, pas la valeur absolue, qui dit ce que coûte la densité. Un\n' +
        'écart faible sur « fps_panoramique » dirait que ce plafond vient de\n' +
        "l'environnement (voir « fps_repos »), pas des 300 itinéraires.\n" +
        'Tout ceci reste mesuré sans tête, sur la machine d’intégration — à\n' +
        "confirmer sur un vrai téléphone avant toute décision d'architecture,\n" +
        'exactement la limite que #14 a déjà posée pour l’audit mobile.\n',
    )
  })
})
