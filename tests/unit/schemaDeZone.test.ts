import { describe, it, expect } from 'vitest'
import {
  CHAMPS_DE_ZONE,
  CHAMPS_MIS_EN_CACHE,
  SCHEMA_ZONE,
  zoneUtilisable,
  type CachedZone,
} from '../../src/db/database.ts'
import { messageDeZone } from '../../src/core/messageDeZone.ts'
import { parseOverpassResponse } from '../../src/core/overpass.ts'

/**
 * Ce qu'une zone met en cache, et la version qui le dit (#371).
 *
 * ## Le raté, daté du 24/08
 *
 * `SCHEMA_ZONE` porte cette consigne, écrite le 22/08 :
 *
 * > À incrémenter quand la requête Overpass rapporte quelque chose de
 * > nouveau, faute de quoi les copies plus anciennes prétendent répondre à
 * > une question qu'on ne leur a pas posée.
 *
 * Deux jours plus tard, #286 ajoutait `osmcSymbol` et `operator` au contenu
 * mis en cache. La constante n'a pas bougé. Les zones écrites entre les deux
 * dates restaient donc « fraîches » sans porter le balisage peint, et la
 * fiche omettait simplement la ligne : rien ne distinguait « OpenStreetMap ne
 * porte pas ce tag ici » de « on ne l'a pas demandé quand on a rempli ce
 * cache ». Trente jours de vie par zone, soit jusqu'au 21–24 septembre.
 *
 * ## Pourquoi un test, et pas un troisième regroupement
 *
 * Le commentaire de `zoneUtilisable` affirmait :
 *
 * > Deux conditions, et une seule fonction pour les porter : l'âge, et la
 * > version du contenu. Les garder séparées aurait laissé le second oubli se
 * > reproduire au prochain enrichissement de la requête.
 *
 * **L'oubli s'est reproduit quand même**, deux jours après. Réunir les deux
 * conditions n'y pouvait rien : le problème n'a jamais été qu'elles soient
 * séparées, mais qu'aucun lien n'existe entre la constante et le parseur qui
 * la périme. C'est le §4bis appliqué au remède précédent — une justification
 * qui a l'air d'expliquer, et que les faits ont démentie.
 *
 * D'où ce fichier : il **compare** les deux, au lieu de les rapprocher.
 *
 * ## Ce qu'il garde, et ce qu'il ne garde pas
 *
 * Il garde que la liste épinglée à côté de `SCHEMA_ZONE` décrive exactement
 * ce que `parseOverpassResponse` écrit. Il ne dit pas si la valeur de
 * `SCHEMA_ZONE` est la bonne — ça se décide, et le §2 interdit de prétendre
 * mesurer ce qui se décide. Ce qu'il rend impossible est d'ajouter un champ
 * **sans que personne ne se pose la question**.
 */

/** Une relation portant tous les tags que le parseur sait lire. */
const RELATION_COMPLETE = {
  elements: [
    {
      type: 'way' as const,
      id: 10,
      tags: { surface: 'gravel' },
    },
    {
      type: 'relation' as const,
      id: 42,
      timestamp: '2026-08-01T00:00:00Z',
      tags: {
        ref: 'GR 7',
        name: 'Sentier des Crêtes',
        network: 'nwn',
        route: 'hiking',
        'osmc:symbol': 'red:red:white_stripe',
        operator: 'Club Vosgien',
      },
      members: [
        {
          type: 'way' as const,
          ref: 10,
          role: '',
          geometry: [
            { lat: 45.4, lon: 4.6 },
            { lat: 45.41, lon: 4.61 },
          ],
        },
      ],
    },
  ],
}

describe('le schéma de zone et ce qu’il décrit (#371)', () => {
  it('épingle exactement les champs que le parseur écrit', () => {
    const [itineraire] = parseOverpassResponse(
      RELATION_COMPLETE,
      '2026-08-28T00:00:00Z',
    )
    expect(itineraire).toBeDefined()

    const ecrits = Object.keys(itineraire ?? {}).sort()
    const epingles = CHAMPS_MIS_EN_CACHE.map((c) => c.champ).sort()

    /*
      Le message compte autant que l'assertion : qui casse ce test vient
      d'ajouter ou de retirer un champ du cache, et doit décider si
      `SCHEMA_ZONE` bouge. Lui rendre « attendu 10, reçu 11 » l'obligerait à
      relire deux fichiers pour comprendre ce qu'on lui demande.
    */
    expect(
      ecrits,
      `Les champs mis en cache par parseOverpassResponse ne correspondent plus` +
        ` à CHAMPS_MIS_EN_CACHE.\n` +
        `En trop : ${ecrits.filter((c) => !epingles.includes(c)).join(', ') || '—'}\n` +
        `Manquants : ${epingles.filter((c) => !ecrits.includes(c)).join(', ') || '—'}\n` +
        `\nUn champ ajouté au cache demande d'incrémenter SCHEMA_ZONE, sinon` +
        ` les copies plus anciennes prétendent répondre à une question qu'on` +
        ` ne leur a pas posée (#371).`,
    ).toEqual(epingles)
  })

  it('l’absence d’un tag ne retire pas le champ de la liste épinglée', () => {
    /*
      `osmcSymbol` et `operator` ne sont écrits que si le tag existe — c'est
      délibéré (#286 : « le cache de zone ne grossit pas de deux `null` par
      relation »). La liste épinglée décrit donc ce qu'une relation *peut*
      porter, et le premier test la mesure sur une relation qui porte tout.

      Ce test-ci tient l'autre bout : une relation nue produit un
      sous-ensemble, jamais autre chose.
    */
    const nue = {
      elements: [
        {
          ...RELATION_COMPLETE.elements[1],
          tags: { ref: 'GR 7', route: 'hiking' },
        },
      ],
    }
    const [itineraire] = parseOverpassResponse(
      nue as typeof RELATION_COMPLETE,
      '2026-08-28T00:00:00Z',
    )
    const ecrits = Object.keys(itineraire ?? {})
    expect(ecrits.length).toBeGreaterThan(0)
    const epingles = CHAMPS_MIS_EN_CACHE.map((c) => c.champ)
    expect(ecrits.every((c) => epingles.includes(c))).toBe(true)
  })

  it('le plus récent des champs épinglés est celui du schéma courant', () => {
    /*
      Le lien qui manquait le 24/08. Un champ neuf s'écrit
      `depuis: SCHEMA_ZONE + 1` — et ce test reste rouge tant que la constante
      n'a pas suivi, ce qui fait de l'incrément le chemin le plus court.

      Il ne juge toujours pas si la valeur est la bonne : ça se décide, et le
      §2 interdit de prétendre mesurer ce qui se décide. Il rend seulement
      impossible d'ajouter un champ **sans que la question se pose**.
    */
    const plusRecent = Math.max(...CHAMPS_MIS_EN_CACHE.map((c) => c.depuis))
    expect(
      plusRecent,
      `Le champ le plus récent est marqué \`depuis: ${String(plusRecent)}\`` +
        ` alors que SCHEMA_ZONE vaut ${String(SCHEMA_ZONE)}.\n` +
        `\nUn champ ajouté au cache se marque \`depuis: SCHEMA_ZONE + 1\`,` +
        ` et SCHEMA_ZONE suit — sinon les copies plus anciennes prétendent` +
        ` répondre à une question qu'on ne leur a pas posée (#371).`,
    ).toBe(SCHEMA_ZONE)
  })

  it('une zone écrite sous un schéma plus ancien n’est plus utilisable', () => {
    /*
      La moitié du mécanisme qu'un script ne pourrait pas vérifier : que
      l'incrément **purge** effectivement. Sans elle, on garderait la
      cohérence des listes sans savoir si elle sert à quelque chose.
    */
    const zone: CachedZone = {
      zoneKey: 'pilat',
      label: 'PNR du Pilat',
      itineraries: [],
      fetchedAt: '2026-08-28T00:00:00Z',
      schema: SCHEMA_ZONE - 1,
    }
    const uneMinutePlusTard = '2026-08-28T00:01:00Z'
    expect(zoneUtilisable(zone, uneMinutePlusTard)).toBe(false)
    expect(
      zoneUtilisable({ ...zone, schema: SCHEMA_ZONE }, uneMinutePlusTard),
    ).toBe(true)
  })
})

/** Le source du store, tel que le build le résout. */
const trancheZone = import.meta.glob('../../src/store/trancheZone.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})['../../src/store/trancheZone.ts'] as string

/**
 * L'enregistrement de zone lui-même — le niveau au-dessus (#404).
 *
 * `CHAMPS_MIS_EN_CACHE` décrit un itinéraire, `CHAMPS_DE_ZONE` l'objet qui
 * les contient. Deux listes, parce que ce sont deux questions ; et deux
 * gardes, parce que le §4ter dit qu'une règle écrite à deux endroits a le
 * même trou des deux côtés tant que rien ne les compare.
 */
describe('ce qu’une zone garde d’elle-même (#404)', () => {
  it('épingle exactement les champs que le store écrit', () => {
    /*
      Lu par `import.meta.glob` plutôt que par `node:fs`, comme
      `jetons.test.ts` : pas de types Node à installer, et une seule façon de
      résoudre les chemins — celle du build.

      Lu dans le source plutôt que reconstruit ici : un objet littéral écrit
      dans ce test serait la troisième copie de la liste, donc le défaut
      qu'on prétend garder. Le motif est vérifié avant d'être exploité —
      s'il cesse de correspondre, ce test le dit au lieu de rendre vert sur
      une lecture vide (§1).
    */
    const source = trancheZone
    const bloc = /await db\.saveZone\(\{([^}]*)\}\)/.exec(source)
    expect(
      bloc,
      'le motif `await db.saveZone({ … })` ne correspond plus à' +
        ' src/store/trancheZone.ts : cette garde ne garde donc plus rien.',
    ).not.toBeNull()

    const ecrits = [...(bloc?.[1] ?? '').matchAll(/^\s*(\w+)[,:]/gm)]
      .map((m) => m[1] ?? '')
      .sort()
    const epingles = [...CHAMPS_DE_ZONE].sort()
    expect(
      ecrits,
      `Ce que le store écrit dans le cache de zone ne correspond plus à` +
        ` CHAMPS_DE_ZONE.\n` +
        `En trop : ${ecrits.filter((c) => !epingles.includes(c)).join(', ') || '—'}\n` +
        `Manquants : ${epingles.filter((c) => !ecrits.includes(c)).join(', ') || '—'}\n` +
        `\nUn champ neuf demande une question : son absence rend-elle une` +
        ` vieille copie fausse — alors SCHEMA_ZONE bouge — ou seulement` +
        ` muette ? Voir le commentaire de CHAMPS_DE_ZONE.`,
    ).toEqual(epingles)
  })

  /**
   * Le choix du 30/08, épinglé pour qu'on le relise plutôt qu'on le refasse.
   *
   * `partielle` et `perdues` sont **additifs** : leur absence veut dire « on
   * ne sait pas », et une zone qui ne les porte pas se comporte exactement
   * comme avant #404 — elle se tait. Périmer ces copies aurait fermé
   * l'angle mort tout de suite, au prix d'une interrogation Overpass
   * complète pour tout le monde, y compris ceux dont la zone n'a jamais
   * rien eu de travers. L'angle mort se referme seul en trente jours.
   *
   * Qui incrémentera `SCHEMA_ZONE` verra ce test rougir, et lira ce
   * paragraphe avant de décider. C'est tout ce qu'on lui demande.
   */
  it('une copie écrite avant #404 reste utilisable, et muette', () => {
    const avant: CachedZone = {
      zoneKey: 'pilat',
      label: 'PNR du Pilat',
      itineraries: [],
      fetchedAt: '2026-08-30T00:00:00Z',
      schema: SCHEMA_ZONE,
    }
    expect(
      zoneUtilisable(avant, '2026-08-30T00:01:00Z'),
      'incrémenter SCHEMA_ZONE jette le cache de tout le monde : lire le' +
        ' commentaire de CHAMPS_DE_ZONE avant de le faire.',
    ).toBe(true)
    expect(messageDeZone({ itineraires: 12 })).toBeNull()
  })
})
