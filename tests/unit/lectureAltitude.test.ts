import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ElevationError,
  buildElevationLineUrl,
  downsample,
  elevationStats,
  fetchElevationProfile,
  fillElevationGaps,
  libelleResolution,
  parseElevationResponse,
  pointAtDistance,
  statsCumulees,
  tronconsContinus,
  HYSTERESIS_ALTIMETRIQUE_METRES,
} from '../../src/core/elevation.ts'
import type { ElevationProfile, LonLat } from '../../src/core/types.ts'

/**
 * Le relief, là où la vague de mutation du 18/10 l'a trouvé sans test.
 *
 * 64 survivants et 6 lignes jamais exécutées sur `core/elevation.ts`.
 * Plusieurs changeaient un nombre affiché : le D− d'un profil découpé, qui
 * pouvait devenir négatif ; un trou de profil comblé avec le mauvais voisin
 * dès le deuxième trou ; le point du graphique relié à la carte, jamais
 * demandé entre deux relevés ; le libellé de résolution, en mètres ou en
 * kilomètres.
 */

const A: LonLat = [5.7, 45.1]
const B: LonLat = [5.71, 45.11]
const C: LonLat = [5.72, 45.13]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('le dénivelé', () => {
  it('additionne les pertes de chaque morceau d’un profil interrompu', () => {
    const troncons: ElevationProfile[] = [
      { distances: [0, 100], elevations: [500, 400], coords: [A, B] },
      { distances: [300, 400], elevations: [600, 550], coords: [B, C] },
    ]
    expect(statsCumulees(troncons)).toEqual({ gain: 0, loss: 150, min: 400, max: 600 })
  })

  it('compte une montée ou une descente égale au seuil d’hystérésis', () => {
    const seuil = HYSTERESIS_ALTIMETRIQUE_METRES
    expect(elevationStats([100, 100 + seuil])?.gain).toBe(seuil)
    expect(elevationStats([100, 100 - seuil])?.loss).toBe(seuil)
  })
})

describe('fillElevationGaps', () => {
  it('interpole chaque trou entre ses deux voisins, pas avec ceux d’un autre trou', () => {
    expect(fillElevationGaps([100, null, 200, null, null, 500])).toEqual([100, 150, 200, 300, 400, 500])
  })
})

describe('pointAtDistance', () => {
  const profil: ElevationProfile = { distances: [0, 100, 200], elevations: [500, 600, null], coords: [A, B, C] }

  it('interpole le point et l’altitude entre les deux relevés qui l’encadrent', () => {
    const p = pointAtDistance(profil, 50)
    expect(p?.distanceMeters).toBe(50)
    expect(p?.elevation).toBe(550)
    expect(p?.point[0]).toBeCloseTo((A[0] + B[0]) / 2, 12)
    expect(p?.point[1]).toBeCloseTo((A[1] + B[1]) / 2, 12)
  })

  it('n’annonce pas d’altitude quand l’un des deux relevés en manque', () => {
    expect(pointAtDistance(profil, 150)?.elevation).toBeNull()
  })

  it('ramène au bout du profil une distance qui le dépasse', () => {
    expect(pointAtDistance(profil, 1_000)?.point).toEqual(C)
  })
})

describe('libelleResolution', () => {
  const espacement = (metres: number, n = 3): ElevationProfile => ({
    distances: Array.from({ length: n }, (_, i) => i * metres),
    elevations: Array.from({ length: n }, () => 500),
    coords: Array.from({ length: n }, () => A),
  })

  it.each([
    [600, 'altitude relevée tous les 600 m — entre deux relevés la courbe est une droite, et un col peut s’y cacher.'],
    [1_000, 'altitude relevée tous les 1 km — entre deux relevés la courbe est une droite, et un col peut s’y cacher.'],
  ])('dit l’espacement de %d m', (metres, libelle) => {
    expect(libelleResolution(espacement(metres))).toBe(libelle)
  })

  it('se tait quand les relevés sont serrés, jusqu’à 500 m compris', () => {
    // « Au-delà de cet espacement, un col peut se cacher » : 500 m n'est pas
    // au-delà.
    expect(libelleResolution(espacement(100))).toBeNull()
    expect(libelleResolution(espacement(500))).toBeNull()
  })

  it('parle aussi d’un profil de deux relevés', () => {
    expect(libelleResolution(espacement(2_000, 2))).toMatch(/2 km/)
  })
})

describe('downsample', () => {
  it('garde le premier et le dernier point, et des intermédiaires régulièrement espacés', () => {
    const coords = Array.from({ length: 100 }, (_, i): LonLat => [i, 0])
    expect(downsample(coords, 10).map((p) => p[0])).toEqual([0, 11, 22, 33, 44, 55, 66, 77, 88, 99])
  })
})

describe('la réponse du service', () => {
  it('lit les clefs « alt » et « elevation » aussi bien que « z »', () => {
    const r = parseElevationResponse({ elevations: [{ z: 500 }, { alt: 600 }, { elevation: 700 }] }, [A, B, C])
    expect(r).toEqual([500, 600, 700])
  })

  it.each([
    ['infinie', Infinity],
    ['écrite en chaîne', '812'],
  ])('écarte une altitude %s', (_cas, z) => {
    expect(parseElevationResponse({ elevations: [{ z }, { z: 600 }] }, [A, B])).toEqual([null, 600])
  })

  it('rend null pour un point dont la réponse ne parle pas', () => {
    expect(parseElevationResponse({ elevations: [{ z: 500 }] }, [A, B])).toEqual([500, null])
  })

  it('refuse une réponse sans liste, avec la phrase exacte', () => {
    expect(() => parseElevationResponse({}, [A, B])).toThrow(
      new ElevationError('Réponse du service altimétrique illisible.'),
    )
  })

  it('demande la bonne ressource, avec ses options', () => {
    const params = new URL(buildElevationLineUrl([A, B])).searchParams
    expect(params.get('resource')).toBe('ign_rge_alti_wld')
    expect(params.get('delimiter')).toBe('|')
    expect(params.get('indent')).toBe('false')
    expect(params.get('measures')).toBe('false')
  })

  it('nomme son erreur', () => {
    expect(new ElevationError('x').name).toBe('ElevationError')
  })
})

describe('fetchElevationProfile', () => {
  const INJOIGNABLE =
    'Le service altimétrique IGN est injoignable : le relief ne peut pas être affiché pour l’instant.'
  const repond = (corps: unknown, status = 200) =>
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(corps), { status })))

  async function message(p: Promise<unknown>): Promise<string> {
    try {
      await p
    } catch (e) {
      expect(e).toBeInstanceOf(ElevationError)
      return (e as Error).message
    }
    throw new Error('aucune erreur levée')
  }

  it('refuse un tracé d’un seul point, mais pas de deux', async () => {
    expect(await message(fetchElevationProfile([A], { fetchFn: repond({ elevations: [] }) }))).toBe(
      'Tracé trop court pour un profil altimétrique.',
    )
    const profil = await fetchElevationProfile([A, B], { fetchFn: repond({ elevations: [{ z: 1 }, { z: 2 }] }) })
    expect(profil.elevations).toEqual([1, 2])
  })

  it('passe par `fetch` quand on ne lui en donne pas', async () => {
    const f = repond({ elevations: [{ z: 1 }, { z: 2 }] })
    vi.stubGlobal('fetch', f)
    await fetchElevationProfile([A, B])
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('borne l’attente à vingt secondes par défaut, et transmet le signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const f = repond({ elevations: [{ z: 1 }, { z: 2 }] })
    await fetchElevationProfile([A, B], { fetchFn: f })
    expect(timeout).toHaveBeenCalledWith(20_000)
    expect((f.mock.calls[0] as unknown[])[1]).toHaveProperty('signal')
  })

  it('se passe de signal quand le navigateur ne sait pas en fabriquer', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      throw new TypeError('non pris en charge')
    })
    const f = repond({ elevations: [{ z: 1 }, { z: 2 }] })
    await fetchElevationProfile([A, B], { fetchFn: f })
    expect((f.mock.calls[0] as unknown[])[1]).toEqual({})
  })

  it.each([
    ['un réseau qui échoue', () => Promise.reject(new TypeError('Failed to fetch')), INJOIGNABLE],
    ['une réponse en erreur', () => Promise.resolve(new Response('', { status: 503 })), INJOIGNABLE],
    ['une réponse qui n’est pas du JSON', () => Promise.resolve(new Response('<html>', { status: 200 })), 'Réponse du service altimétrique illisible.'],
  ])('dit pourquoi pour %s', async (_cas, fetchFn, attendu) => {
    expect(await message(fetchElevationProfile([A, B], { fetchFn }))).toBe(attendu)
  })
})

describe('tronconsContinus', () => {
  it('ne fait rien traîner d’un morceau dans le suivant', () => {
    const profil: ElevationProfile = {
      distances: [0, 100, 200, 300],
      elevations: [500, 510, 520, 530],
      coords: [A, B, B, C],
    }
    const troncons = tronconsContinus(profil, [{ debutMetres: 120, finMetres: 280 }])
    expect(troncons).toEqual([
      { distances: [0, 100], elevations: [500, 510], coords: [A, B] },
      { distances: [300], elevations: [530], coords: [C] },
    ])
  })
})

/*
  Les 28 survivants de la seconde vague, et pourquoi ils restent (§6bis).
  Vérifiés en lisant le code :

  - `indicesEchantillons` : `nbPoints <= maxPoints` en `<` (à égalité, le pas
    vaut 1 et rend les mêmes indices) ; `Math.min(…, nbPoints + 1)` (le plus
    grand indice calculé vaut déjà `nbPoints − 1`) ;
  - `isFiniteAltitude` : `typeof value === 'number'` forcé (`Number.isFinite`
    refuse déjà une chaîne) ; `> -9000` en `>=` (le service rend −99 999) ;
  - `tronconsContinus` : la borne de boucle, `typeof distance`, `k <= bornes`,
    `bornes[k]?.` — des distances toujours numériques, et un `fermer()` en
    plus ou en moins sur un morceau vide ; le `fermer()` retiré dans le saut
    est rattrapé par la boucle qui franchit l'interruption ; `if (point)` —
    les points sont alignés sur les distances ;
  - `fillElevationGaps` : la borne de boucle, `k < i` en `<=` et `k > i` en
    `>=` — l'indice d'un trou n'est jamais un indice connu ;
  - `fetchElevationProfile` : les deux `catch {}` vidés — `signal` vaut déjà
    `undefined`, et une réponse non lue laisse `data` indéfini, que
    `parseElevationResponse` refuse avec la même phrase ;
  - `pointAtDistance` : les gardes de profil vide (le même `null` par
    `!pAvant`), `d >= borne` en `>` (t vaut 0 au relevé exact), `apres < 0`
    (la borne ne dépasse jamais le dernier relevé), les `Math.min` en
    `length + 1` et `!pAvant || !pApres` (points alignés sur les distances) ;
  - `libelleResolution` : `espacement === null` forcé à faux — `null <= 500`
    est vrai en JavaScript, le même `null` revient.
*/
