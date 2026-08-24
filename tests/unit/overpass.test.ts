import { describe, it, expect, vi } from 'vitest'
import {
  ZONES,
  libelleDeZone,
  FEATURED_ROUTES,
  buildZoneQuery,
  buildRefQuery,
  buildAroundQuery,
  RAYON_AUTOUR_METERS,
  parseOverpassResponse,
  fetchOverpass,
  OverpassError,
  OVERPASS_MIRRORS,
} from '../../src/core/overpass.ts'
import pilatFixture from '../fixtures/overpass/pilat.json'

const FETCHED_AT = '2026-02-01T12:00:00Z'

describe('buildZoneQuery', () => {
  it('construit une requête admin_level=6 pour le Rhône + Métropole de Lyon', () => {
    const q = buildZoneQuery('rhone')
    expect(q).toContain('[out:json]')
    expect(q).toContain('[timeout:180]')
    expect(q).toContain('"admin_level"="6"')
    expect(q).toContain('"name"="Rhône"')
    expect(q).toContain('"name"="Métropole de Lyon"')
    expect(q).toContain(
      'relation["route"~"^(hiking|foot|walking|pilgrimage)$"](area.zone)',
    )
    expect(q).toContain('out meta geom;')
  })

  it('utilise boundary=protected_area pour le PNR du Pilat', () => {
    const q = buildZoneQuery('pilat')
    expect(q).toContain('"boundary"="protected_area"')
    expect(q).toContain('Pilat')
  })

  it('« Rhône, Loire et Pilat » réunit les trois zones', () => {
    const q = buildZoneQuery('trois')
    expect(q).toContain('"name"="Rhône"')
    expect(q).toContain('"name"="Loire"')
    expect(q).toContain('Pilat')
  })

  it('rejette une zone inconnue', () => {
    expect(() => buildZoneQuery('atlantide')).toThrow()
  })

  it('les zones proches restent en tête, suivies des départements AURA', () => {
    const proches = ZONES.filter((z) => z.group === 'proche').map((z) => z.id)
    expect(proches).toEqual(['rhone', 'loire', 'pilat', 'trois'])
    const aura = ZONES.filter((z) => z.group === 'aura').map((z) => z.id)
    // Les 12 départements de la région, moins Rhône et Loire déjà proposés.
    expect(aura).toHaveLength(10)
    expect(aura).toContain('isere')
    expect(aura).toContain('haute-savoie')
    expect(aura).not.toContain('rhone')
    expect(aura).not.toContain('loire')
  })

  it('chaque département AURA produit une requête admin_level=6 à son nom', () => {
    expect(buildZoneQuery('puy-de-dome')).toContain('"name"="Puy-de-Dôme"')
    expect(buildZoneQuery('ardeche')).toContain('"name"="Ardèche"')
    expect(buildZoneQuery('haute-savoie')).toContain('"name"="Haute-Savoie"')
  })

  it('les identifiants de zone sont uniques', () => {
    const ids = ZONES.map((z) => z.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('FEATURED_ROUTES', () => {
  it('propose des grands itinéraires chargeables par leur ref', () => {
    const refs = FEATURED_ROUTES.map((r) => r.ref)
    expect(refs).toContain('GR 65') // Saint-Jacques, voie du Puy
    expect(refs).toContain('GR 70') // Stevenson
    expect(new Set(refs).size).toBe(refs.length)
  })

  it('chaque ref mise en avant produit une requête France entière valide', () => {
    for (const route of FEATURED_ROUTES) {
      const q = buildRefQuery(route.ref)
      expect(q).toContain('["ISO3166-1"="FR"]')
      expect(q).toContain('out meta geom;')
    }
  })
})

describe('buildRefQuery', () => {
  it('cherche le ref avec espace optionnel, insensible à la casse', () => {
    const q = buildRefQuery('GR 20')
    expect(q).toContain('"route"~"^(hiking|foot|walking|pilgrimage)$"')
    expect(q).toContain('GR ?20')
    expect(q).toContain(',i]')
  })

  it('inclut route=pilgrimage : certains chemins de Saint-Jacques y sont tagués', () => {
    expect(buildRefQuery('GR 65')).toContain('pilgrimage')
    expect(buildZoneQuery('rhone')).toContain('pilgrimage')
  })

  it('les requêtes de zone incluent les itinéraires route=foot (cartoguides)', () => {
    // Les boucles départementales/métropolitaines sont souvent route=foot.
    for (const zoneId of ['rhone', 'loire', 'pilat', 'trois']) {
      expect(buildZoneQuery(zoneId)).toContain('foot')
    }
  })

  it('échappe les caractères spéciaux de regex', () => {
    const q = buildRefQuery('GR 20 (Nord)')
    expect(q).toContain('\\\\(Nord\\\\)')
  })
})

/**
 * Deux couches d'échappement se superposent dans un filtre Overpass, et les
 * confondre était le défaut de l'issue #164 : la ref est une expression
 * régulière (couche interne), elle-même écrite entre guillemets en Overpass
 * QL (couche externe).
 *
 * Plutôt que de vérifier l'orthographe des antislashs — ce qui ne prouve
 * rien — on refait le trajet d'Overpass : on retire la couche QL comme son
 * analyseur le fait, on compile l'expression obtenue, et on regarde ce
 * qu'elle reconnaît.
 */
function regexVueParOverpass(query: string): RegExp {
  const filtre = /\["ref"~"((?:[^"\\]|\\.)*)",i\]/.exec(query)
  if (!filtre) {
    throw new Error(
      `Overpass ne saurait pas lire ce filtre de ref : ${query}`,
    )
  }
  // Overpass QL : `\"` vaut un guillemet, `\\` vaut un antislash.
  return new RegExp(filtre[1]!.replace(/\\(.)/g, '$1'))
}

describe('buildRefQuery — échappement Overpass QL (issue #164)', () => {
  it('ne laisse pas un guillemet fermer la chaîne QL', () => {
    // Le guillemet n'est pas un métacaractère de regex : il n'était pas
    // échappé, et fermait la chaîne QL au milieu du filtre.
    const q = buildRefQuery('GR"5')
    expect(regexVueParOverpass(q).test('GR"5')).toBe(true)
  })

  it('transmet un antislash comme un antislash', () => {
    // Deux couches à traverser : la regex le double, QL redouble le tout.
    const q = buildRefQuery('GR\\5')
    expect(regexVueParOverpass(q).test('GR\\5')).toBe(true)
  })

  it('tient les deux ensemble', () => {
    const q = buildRefQuery('GR"\\5')
    expect(regexVueParOverpass(q).test('GR"\\5')).toBe(true)
  })

  it('ne laisse pas une ref ajouter un filtre à la requête', () => {
    // La charge de l'audit. Il n'y a ici ni serveur, ni secret, ni autre
    // utilisateur : ce n'est pas une faille, c'est une entrée mal échappée.
    const charge = 'GR"]["name"~"pwn'
    const q = buildRefQuery(charge)
    // Un seul filtre de ref, et il reconnaît la charge à la lettre.
    expect(q.match(/\["ref"~/g)).toHaveLength(1)
    expect(q).not.toContain('["name"~')
    expect(regexVueParOverpass(q).test(charge)).toBe(true)
  })

  it('n’abîme pas le cas courant', () => {
    const regex = regexVueParOverpass(buildRefQuery('GR 20 (Nord)'))
    expect(regex.test('GR 20 (Nord)')).toBe(true)
    // L'espace reste optionnel : « GR20 » trouve « GR 20 ».
    expect(regex.test('GR20 (Nord)')).toBe(true)
    expect(regex.test('GR 21 (Nord)')).toBe(false)
  })

  it('ancre toujours la recherche sur la ref entière', () => {
    const regex = regexVueParOverpass(buildRefQuery('GR 7'))
    expect(regex.test('GR 7')).toBe(true)
    expect(regex.test('GR 70')).toBe(false)
    expect(regex.test('VGR 7')).toBe(false)
  })
})

describe('parseOverpassResponse', () => {
  const itineraries = parseOverpassResponse(pilatFixture, FETCHED_AT)

  it('retourne les relations exploitables, sans celles dépourvues de géométrie', () => {
    expect(itineraries.map((i) => i.osmRelationId)).toEqual([1001, 1002, 1003])
  })

  it('extrait ref, nom et réseau (tags puis repli sur ref)', () => {
    const [gr, pr, grp] = itineraries
    expect(gr!.ref).toBe('GR 7')
    expect(gr!.network).toBe('GR')
    expect(pr!.ref).toBeNull()
    expect(pr!.name).toBe('Sentier des Crêtes')
    expect(pr!.network).toBe('PR')
    expect(grp!.network).toBe('GRP')
  })

  it('convertit la géométrie en [lon, lat]', () => {
    const gr = itineraries[0]!
    expect(gr.ways[0]!.coords[0]).toEqual([4.5, 45.4])
  })

  it('déduplique les ways répétés dans une même relation', () => {
    const gr = itineraries[0]!
    expect(gr.ways.map((w) => w.osmWayId)).toEqual([100, 101, 200])
  })

  it('ignore les membres nœuds et les ways sans géométrie', () => {
    const gr = itineraries[0]!
    expect(gr.ways.some((w) => w.osmWayId === 999)).toBe(false)
  })

  it('calcule totalMeters en comptant chaque way une fois', () => {
    const gr = itineraries[0]!
    // 3 ways horizontaux de 0.01° de lon à 45.4° ≈ 3 × 780 m.
    expect(gr.totalMeters).toBeGreaterThan(2300)
    expect(gr.totalMeters).toBeLessThan(2400)
  })

  it('horodate les itinéraires avec fetchedAt', () => {
    expect(itineraries[0]!.fetchedAt).toBe(FETCHED_AT)
  })

  it('ignore les éléments qui ne sont pas des relations et les relations sans membres ni tags', () => {
    const res = parseOverpassResponse(
      {
        elements: [
          { type: 'way', id: 1 },
          { type: 'relation', id: 2 },
          {
            type: 'relation',
            id: 3,
            members: [
              {
                type: 'way',
                ref: 30,
                geometry: [
                  { lat: 45.4, lon: 4.5 },
                  { lat: 45.4, lon: 4.51 },
                ],
              },
            ],
          },
        ],
      },
      FETCHED_AT,
    )
    expect(res.map((i) => i.osmRelationId)).toEqual([3])
    expect(res[0]!.ref).toBeNull()
    expect(res[0]!.network).toBe('PR')
  })
})

describe('fraîcheur amont (out meta)', () => {
  it('demande les métadonnées dans les deux requêtes', () => {
    // Sans `meta`, Overpass ne renvoie pas la date de dernière modification :
    // impossible de dire si un tracé date de 2013 ou de la semaine dernière.
    expect(buildZoneQuery('pilat')).toContain('out meta geom;')
    expect(buildRefQuery('GR 7')).toContain('out meta geom;')
  })

  it('retient la date de dernière modification de la relation', () => {
    const data = {
      elements: [
        {
          type: 'relation',
          id: 1,
          timestamp: '2019-04-02T08:15:00Z',
          tags: { route: 'hiking', network: 'nwn', ref: 'GR 7' },
          members: [
            {
              type: 'way',
              ref: 10,
              geometry: [
                { lat: 45.4, lon: 4.5 },
                { lat: 45.41, lon: 4.5 },
              ],
            },
          ],
        },
      ],
    }
    const [itin] = parseOverpassResponse(data, FETCHED_AT)
    expect(itin?.osmUpdatedAt).toBe('2019-04-02T08:15:00Z')
  })

  it('se passe de la date quand Overpass ne la donne pas', () => {
    // Les miroirs ne répondent pas tous pareil, et le cache d'hier a été
    // écrit sans elle : son absence ne doit rien casser. Le jeu d'essai ne
    // date que sa première relation, exprès.
    const sansDate = parseOverpassResponse(pilatFixture, FETCHED_AT).filter(
      (i) => i.osmRelationId !== 1001,
    )
    expect(sansDate.length).toBeGreaterThan(0)
    expect(sansDate.every((i) => i.osmUpdatedAt === null)).toBe(true)
  })
})

describe('fetchOverpass', () => {
  const okResponse = () =>
    new Response(JSON.stringify(pilatFixture), { status: 200 })

  it('interroge le premier miroir et parse la réponse', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())
    const data = await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0]![0]).toBe(OVERPASS_MIRRORS[0])
    // Rattaché au fixture plutôt qu'au nombre 4 : ces tests éprouvent le
    // transport, pas la taille du jeu d'essai. Le nombre codé en dur les a
    // fait tomber tous les quatre le jour où le fixture a gagné des chemins
    // tagués (issue #179), pour un défaut qui n'existait pas.
    expect((data as { elements: unknown[] }).elements).toHaveLength(
      pilatFixture.elements.length,
    )
  })

  it('bascule sur le second miroir si le premier échoue (réseau)', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(okResponse())
    const data = await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[1]![0]).toBe(OVERPASS_MIRRORS[1])
    expect(data).toBeTruthy()
  })

  it('bascule aussi sur réponse HTTP non-200', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(okResponse())
    await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  /**
   * Overpass ne signale pas ses échecs par un code HTTP : quand une requête
   * dépasse son délai ou sa mémoire, il répond **200** avec un corps JSON
   * parfaitement formé — `elements: []` — et le motif dans `remark`.
   *
   * Le code ne lisait pas `remark`. Une réponse d'échec passait donc pour un
   * succès vide, et l'application affirmait « Aucun itinéraire balisé trouvé
   * dans cette zone sur OpenStreetMap » — c'est-à-dire le contraire de la
   * vérité, sur des départements qui en comptent des milliers.
   */
  const remarkResponse = (remark: string, elements: unknown[] = []) =>
    new Response(JSON.stringify({ version: 0.6, elements, remark }), {
      status: 200,
    })

  it('ne prend pas un échec Overpass en 200 pour une zone vide', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        remarkResponse(
          'runtime error: Query timed out in "query" at line 3 after 180 seconds.',
        ),
      )
      .mockResolvedValueOnce(okResponse())
    const data = await fetchOverpass('QUERY', { fetchFn })
    expect(
      fetchFn,
      'un miroir qui a échoué en 200 doit laisser la place au suivant',
    ).toHaveBeenCalledTimes(2)
    expect((data as { elements: unknown[] }).elements).toHaveLength(
      pilatFixture.elements.length,
    )
  })

  it('rapporte le motif d’Overpass quand tous les miroirs échouent ainsi', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        remarkResponse(
          'runtime error: Query run out of memory in "query" at line 3 using about 2048 MB of RAM.',
        ),
      )
    const erreur: unknown = await fetchOverpass('QUERY', { fetchFn }).catch(
      (e: unknown) => e,
    )
    expect(erreur).toBeInstanceOf(OverpassError)
    // Le motif brut est en anglais et parle de RAM : il n'a pas sa place à
    // l'écran tel quel. Ce que la personne doit lire, c'est que la zone est
    // trop vaste — et quoi faire à la place.
    expect((erreur as Error).message).toMatch(/trop (vaste|grande)/i)
    expect((erreur as Error).message).not.toMatch(/runtime error/)
  })

  /**
   * Un `remark` accompagné de données est un résultat **partiel**, pas un
   * échec : Overpass a rendu ce qu'il a pu. On garde les données — mieux vaut
   * une zone incomplète que pas de zone — mais on ne fait pas semblant
   * qu'elle est complète.
   */
  it('garde un résultat partiel, et le signale', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        remarkResponse('Please note: ...', pilatFixture.elements),
      )
    const data = await fetchOverpass('QUERY', { fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect((data as { elements: unknown[] }).elements).toHaveLength(
      pilatFixture.elements.length,
    )
    expect((data as { remark?: string }).remark).toBeTruthy()
  })

  it('lève une OverpassError en français si tous les miroirs échouent', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('failed to fetch'))
    await expect(fetchOverpass('QUERY', { fetchFn })).rejects.toThrow(
      OverpassError,
    )
    await expect(fetchOverpass('QUERY', { fetchFn })).rejects.toThrow(
      /serveurs de données/i,
    )
    expect(fetchFn).toHaveBeenCalledTimes(2 * OVERPASS_MIRRORS.length)
  })

  it('tente le miroir suivant si la réponse n’est pas du JSON Overpass', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>maintenance</html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"pas":"overpass"}', { status: 200 }))
    await expect(fetchOverpass('QUERY', { fetchFn })).rejects.toThrow(
      OverpassError,
    )
    expect(fetchFn).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length)
  })

  it('utilise fetch global et les miroirs par défaut si rien n’est injecté', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse())
    try {
      await fetchOverpass('QUERY')
      expect(spy).toHaveBeenCalledWith(
        OVERPASS_MIRRORS[0],
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('signale les octets reçus au fil du téléchargement', async () => {
    // Une réponse découpée en morceaux, comme l'envoie un serveur Overpass :
    // l'attente dure deux minutes, il faut pouvoir montrer qu'elle avance.
    const brut = new TextEncoder().encode(JSON.stringify(pilatFixture))
    const morceaux = [brut.slice(0, 100), brut.slice(100, 400), brut.slice(400)]
    const corps = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const morceau of morceaux) controller.enqueue(morceau)
        controller.close()
      },
    })
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(corps, { status: 200 }))

    const octets: number[] = []
    const data = await fetchOverpass('QUERY', {
      fetchFn,
      onProgress: (recus) => octets.push(recus),
    })

    // Cumulatif et croissant : c'est ce que l'utilisateur voit défiler.
    expect(octets).toEqual([100, 400, brut.byteLength])
    // Rattaché au fixture plutôt qu'au nombre 4 : ces tests éprouvent le
    // transport, pas la taille du jeu d'essai. Le nombre codé en dur les a
    // fait tomber tous les quatre le jour où le fixture a gagné des chemins
    // tagués (issue #179), pour un défaut qui n'existait pas.
    expect((data as { elements: unknown[] }).elements).toHaveLength(
      pilatFixture.elements.length,
    )
  })

  it('lit quand même la réponse si le corps n’est pas diffusable', async () => {
    // Anciens navigateurs, et doublures de test qui rendent une réponse sans
    // flux : la progression est alors muette, mais le chargement fonctionne.
    const sansCorps = {
      ok: true,
      body: null,
      json: () => Promise.resolve(pilatFixture),
    } as unknown as Response
    const onProgress = vi.fn()
    const data = await fetchOverpass('QUERY', {
      fetchFn: vi.fn().mockResolvedValue(sansCorps),
      onProgress,
    })
    // Rattaché au fixture plutôt qu'au nombre 4 : ces tests éprouvent le
    // transport, pas la taille du jeu d'essai. Le nombre codé en dur les a
    // fait tomber tous les quatre le jour où le fixture a gagné des chemins
    // tagués (issue #179), pour un défaut qui n'existait pas.
    expect((data as { elements: unknown[] }).elements).toHaveLength(
      pilatFixture.elements.length,
    )
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('passe au miroir suivant si le flux se coupe en cours de route', async () => {
    const corps = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"elements":'))
        controller.error(new Error('connexion perdue'))
      },
    })
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(corps, { status: 200 }))
      .mockResolvedValueOnce(okResponse())
    const data = await fetchOverpass('QUERY', { fetchFn, onProgress: vi.fn() })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    // Rattaché au fixture plutôt qu'au nombre 4 : ces tests éprouvent le
    // transport, pas la taille du jeu d'essai. Le nombre codé en dur les a
    // fait tomber tous les quatre le jour où le fixture a gagné des chemins
    // tagués (issue #179), pour un défaut qui n'existait pas.
    expect((data as { elements: unknown[] }).elements).toHaveLength(
      pilatFixture.elements.length,
    )
  })

  it('signale chaque tentative de miroir via onAttempt', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed to fetch'))
      .mockResolvedValueOnce(okResponse())
    const onAttempt = vi.fn()
    await fetchOverpass('QUERY', { fetchFn, onAttempt })
    expect(onAttempt).toHaveBeenNthCalledWith(1, 0, OVERPASS_MIRRORS.length)
    expect(onAttempt).toHaveBeenNthCalledWith(2, 1, OVERPASS_MIRRORS.length)
  })

  it('envoie la requête en POST avec le corps data=…', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse())
    await fetchOverpass('QUERY', { fetchFn })
    const init = fetchFn.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body as string).toContain('data=')
  })
})

describe('buildAroundQuery', () => {
  it('cherche les itinéraires dans un rayon autour d’un point', () => {
    // Une commune n'est pas une zone Overpass : « autour de Saint-Étienne »
    // se traduit par un rayon, pas par les limites administratives — on
    // marche rarement à l'intérieur du panneau d'entrée de ville.
    const query = buildAroundQuery([4.387178, 45.439695], 12_000)
    expect(query).toContain('[out:json]')
    // Overpass attend (around:rayon,lat,lon) — l'ordre inverse du GeoJSON,
    // et l'inverser silencieusement enverrait la requête au large de la Somalie.
    expect(query).toContain('(around:12000,45.439695,4.387178)')
    expect(query).toContain('route')
    expect(query).toContain('out meta geom')
  })

  it('arrondit les coordonnées sans les tronquer au point de déplacer le centre', () => {
    const query = buildAroundQuery([4.3871784321, 45.4396951234], 5_000)
    expect(query).toMatch(/around:5000,45\.43969\d*,4\.38717\d*/)
  })
})

describe('RAYON_AUTOUR_METERS', () => {
  it('couvre une sortie à la journée sans faire exploser la requête', () => {
    expect(RAYON_AUTOUR_METERS).toBeGreaterThanOrEqual(5_000)
    expect(RAYON_AUTOUR_METERS).toBeLessThanOrEqual(25_000)
  })
})

describe('les tags de chemin (issue #179)', () => {
  /**
   * Mesuré sur la donnée réelle avant d'écrire une ligne : `out meta geom;`
   * sur des relations ne rend que la géométrie des membres. Sur une fenêtre
   * du Pilat, zéro occurrence de `highway` dans 3 Mo — et `highway` est
   * porté par tous les chemins d'OSM.
   *
   * Les demander explicitement coûte +24 % : 450 ko de tags pour 1,84 Mo de
   * géométrie, soit 129 octets par chemin.
   */
  it('les trois requêtes demandent les tags des chemins membres', () => {
    for (const q of [
      buildZoneQuery('pilat'),
      buildRefQuery('GR 7'),
      buildAroundQuery([4.5, 45.4]),
    ]) {
      expect(q).toContain('out meta geom')
      // Les chemins membres, sortis sans géométrie : elle est déjà rendue
      // par la relation, la redemander doublerait la réponse pour rien.
      expect(q).toMatch(/way\(r\.[a-z]+\)/)
      expect(q).toContain('out tags')
    }
  })

  it('rattache les tags retenus aux ways de l’itinéraire', () => {
    const itins = parseOverpassResponse(
      {
        elements: [
          {
            type: 'relation',
            id: 1,
            tags: { route: 'hiking', name: 'Test' },
            members: [
              {
                type: 'way',
                ref: 10,
                geometry: [
                  { lat: 45.4, lon: 4.5 },
                  { lat: 45.4, lon: 4.51 },
                ],
              },
            ],
          },
          {
            type: 'way',
            id: 10,
            tags: {
              surface: 'gravel',
              smoothness: 'good',
              // Bruit qu'on ne garde pas : mesuré, l'essentiel des 450 ko
              // est fait de tags qui ne disent rien d'un sentier.
              maxspeed: '50',
              source: 'cadastre',
            },
          },
        ],
      },
      '2026-01-01T00:00:00Z',
    )
    const way = itins[0]!.ways[0]!
    expect(way.tags?.surface).toBe('gravel')
    expect(way.tags?.smoothness).toBe('good')
    expect(way.tags).not.toHaveProperty('maxspeed')
    expect(way.tags).not.toHaveProperty('source')
  })

  it('laisse `tags` absent quand le chemin n’a rien qui nous intéresse', () => {
    // Et non un objet vide : `tags: {}` se sérialise dans le cache pour ne
    // rien dire, sur chaque way de chaque zone.
    const itins = parseOverpassResponse(
      {
        elements: [
          {
            type: 'relation',
            id: 1,
            tags: { route: 'hiking' },
            members: [
              {
                type: 'way',
                ref: 10,
                geometry: [
                  { lat: 45.4, lon: 4.5 },
                  { lat: 45.4, lon: 4.51 },
                ],
              },
            ],
          },
          { type: 'way', id: 10, tags: { maxspeed: '50' } },
        ],
      },
      '2026-01-01T00:00:00Z',
    )
    expect(itins[0]!.ways[0]!.tags).toBeUndefined()
  })

  it('ne casse pas sur une réponse sans aucun way (zones déjà en cache)', () => {
    const itins = parseOverpassResponse(
      {
        elements: [
          {
            type: 'relation',
            id: 1,
            tags: { route: 'hiking' },
            members: [
              {
                type: 'way',
                ref: 10,
                geometry: [
                  { lat: 45.4, lon: 4.5 },
                  { lat: 45.4, lon: 4.51 },
                ],
              },
            ],
          },
        ],
      },
      '2026-01-01T00:00:00Z',
    )
    expect(itins).toHaveLength(1)
    expect(itins[0]!.ways[0]!.tags).toBeUndefined()
  })
})

/**
 * AUDIT_UX.md, constat U7 — « Les trois » ne dit pas de quoi il s'agit.
 *
 * Ce n'était pas une troncature : il y avait la place de l'afficher en
 * entier à toutes les largeurs. C'était le libellé lui-même, qui laissait
 * deviner ce que la zone réunit.
 *
 * Le test ne fige pas un texte — il vérifie qu'aucun libellé de zone ne
 * laisse la question ouverte, ce qui vaut aussi pour les prochains.
 */
describe('les libellés de zone se suffisent à eux-mêmes', () => {
  it('nomme ce que chaque zone contient, sans quantificateur en l’air', () => {
    const flous = ZONES.filter((zone) =>
      /^(les|la|le|des|du)\s+(trois|deux|quatre|autres?|zones?)\b/i.test(
        zone.label,
      ),
    ).map((zone) => `${zone.id} → « ${zone.label} »`)
    expect(flous).toEqual([])
  })

  it('la zone qui réunit trois territoires les nomme', () => {
    const trois = ZONES.find((zone) => zone.id === 'trois')
    expect(trois).toBeDefined()
    for (const territoire of ['Rhône', 'Loire', 'Pilat']) {
      expect(trois?.label).toContain(territoire)
    }
  })

  /**
   * L'identifiant, lui, ne bouge pas : il est écrit en base comme
   * `lastZoneKey` et sert de clé au cache de zone. Le renommer perdrait
   * silencieusement la zone restaurée au démarrage de qui l'avait choisie.
   */
  it('garde son identifiant, qui vit en base', () => {
    expect(ZONES.some((zone) => zone.id === 'trois')).toBe(true)
  })
})

/**
 * Le libellé d'une zone peut changer ; la copie en cache, elle, garde celui
 * du jour où elle a été écrite. Sans quoi renommer « Les trois » en
 * « Rhône, Loire et Pilat » n'aurait rien changé pour qui l'avait déjà
 * chargée — le cache tient trente jours.
 */
describe('libelleDeZone', () => {
  it('rend le libellé courant d’une zone connue', () => {
    expect(libelleDeZone('trois', 'Les trois')).toBe('Rhône, Loire et Pilat')
    expect(libelleDeZone('pilat', 'PNR du Pilat')).toBe('PNR du Pilat')
  })

  it('garde le libellé stocké pour ce qui n’est pas une zone', () => {
    // Une recherche par ref ou par ville n'est pas dans ZONES : son libellé
    // vient de la requête, et lui seul le connaît.
    expect(libelleDeZone('ref:GR 65', 'GR 65')).toBe('GR 65')
    expect(libelleDeZone('autour:Saint-Étienne', 'Autour de Saint-Étienne')).toBe(
      'Autour de Saint-Étienne',
    )
  })
})
