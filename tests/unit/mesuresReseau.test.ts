import { describe, it } from 'vitest'
import {
  OVERPASS_MIRRORS,
  fetchOverpass,
  parseOverpassResponse,
  type OverpassResponse,
} from '../../src/core/overpass.ts'
import { chainWays } from '../../src/core/chainage.ts'
import { itineraryCoords, interruptionsDuTrace } from '../../src/core/mapdata.ts'
import { polylineLengthMeters } from '../../src/core/sampling.ts'
import { decrireBalisage } from '../../src/core/balisage.ts'

/**
 * Les mesures qui demandent un réseau (issue #331).
 *
 * ```
 * npm run mesures-osm
 * ```
 *
 * ## Pourquoi ce fichier existe
 *
 * Cinq issues étaient bloquées sur des chiffres qu'aucune machine de ce
 * projet ne pouvait aller chercher : le proxy sortant refusait
 * `overpass-api.de` et le reste — mesuré le 26/08, voir
 * `docs/AUDIT_LOCAL_26_08.md`.
 *
 * **Ce n'est plus vrai depuis le 27/08**, l'environnement ayant été ouvert.
 * Ce qui bloque désormais est d'une autre nature, et bien plus banal : les
 * miroirs limitent une IP qui les interroge en rafale. D'où la liste de
 * miroirs propre à ces mesures, et surtout le témoin ci-dessous.
 *
 * Chaque issue porte sa requête, dispersée dans cinq pages GitHub — c'est-à-
 * dire nulle part, le jour où quelqu'un aura enfin du réseau. Ce fichier les
 * rassemble et les rend exécutables d'une commande.
 *
 * ## Pourquoi un fichier de test et non un script `.mjs`
 *
 * Parce qu'il **importe le code qui décidera**. La question de #290 n'est pas
 * « combien de relations portent un `osmc:symbol` » mais « combien en portent
 * un **que nous savons lire** », et seule `decrireBalisage` répond à celle-là.
 * De même, la longueur de #301 se mesure par `chainWays` et
 * `itineraryCoords` : deux façons de calculer la même grandeur finissent par
 * ne plus la calculer pareil, et #303 dit ce que ça coûte.
 *
 * `scripts/couverture-village.mjs` reste un `.mjs` parce qu'il ne compte que
 * des tags : il n'a aucune règle à partager.
 *
 * ## Ce qu'il fait, et ce qu'il ne fait pas
 *
 * Il **affiche des nombres**, et rappelle sous chacun comment le lire. Il
 * n'asserte rien et ne ferme aucune issue : le §2 interdit de faire trancher
 * un seuil par le script qui le mesure. Il est **ignoré par défaut** — sans
 * `RESEAU=1`, il apparaît comme sauté dans chaque suite, ce qui est aussi une
 * façon de ne pas l'oublier.
 */

/*
  `process` déclaré ici plutôt qu'importé de `node:process`.

  `tsconfig.app.json` couvre `tests/unit` avec `types: ["vite/client"]` — pas
  les types Node. Déplacer ce fichier vers le projet Node ne marche pas non
  plus : il importe `src/core`, qui appartient au projet applicatif, et un
  fichier ne peut pas vivre dans deux projets à la fois.

  Cette déclaration locale dit exactement ce qu'on utilise, et rien de plus.
*/
declare const process: {
  env: Record<string, string | undefined>
  stdout: { write: (texte: string) => void }
}

/**
 * Ces mesures ne tournent **jamais** dans la porte.
 *
 * Sans `RESEAU=1`, tout ce fichier est sauté — il apparaît alors comme tel
 * dans chaque suite, ce qui est aussi une façon de ne pas l'oublier. C'est
 * délibéré : un test qui dépend d'Overpass rougirait un jour de lenteur, et
 * la suite doit rester jouable sans réseau.
 */
const ACTIF = process.env['RESEAU'] === '1'

function titre(texte: string): void {
  process.stdout.write(`\n${'='.repeat(70)}\n${texte}\n${'='.repeat(70)}\n`)
}

function ligne(texte: string): void {
  process.stdout.write(`${texte}\n`)
}

/** Un pourcentage lisible, ou « — » quand le dénominateur est nul. */
function part(numerateur: number, denominateur: number): string {
  if (denominateur === 0) return '—'
  const pourcent = ((numerateur / denominateur) * 100).toFixed(1)
  return `${pourcent} % (${String(numerateur)}/${String(denominateur)})`
}

interface ElementTague {
  type?: string
  tags?: Record<string, string>
}

function elementsDe(brut: unknown): ElementTague[] {
  return (brut as { elements?: ElementTague[] }).elements ?? []
}

/**
 * Les miroirs employés **par ces mesures**, et non par l'application.
 *
 * `OVERPASS_MIRRORS` sert les gens qui utilisent Sentiers ; cette liste sert
 * à mesurer. Les deux n'ont pas les mêmes contraintes : ici on accepte un
 * miroir lointain et lent pourvu qu'il réponde, là il faut la latence.
 *
 * **Vérifié le 27/08.** Les deux miroirs de l'application coupaient la
 * connexion (`Connection reset`) après une dizaine de requêtes depuis cette
 * machine — une limitation par IP, pas la politique réseau : `curl` sortait
 * très bien vers d'autres hôtes au même moment.
 */
const MIROIRS_DE_MESURE = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ...OVERPASS_MIRRORS,
]

/** Toutes les mesures passent par là, plutôt que par le défaut. */
function mesurer(requete: string): Promise<OverpassResponse> {
  return fetchOverpass(requete, { mirrors: MIROIRS_DE_MESURE })
}

/**
 * La boîte du Pilat, et le nombre qu'elle doit rendre.
 *
 * C'est le **témoin** de toutes les mesures qui suivent, et il vient d'un
 * raté : le 27/08, la requête de #321 a rendu **zéro relation** sur
 * `overpass.osm.ch`, ce qui se lit exactement comme « rien n'est mappé
 * autour de Porcelette » — la conclusion que l'issue attendait. Le même
 * miroir rendait 115 relations sur Berne et 0 sur le Pilat : une base
 * **suisse**, dont le silence sur la Moselle ne voulait rien dire.
 *
 * Une réponse vide d'un miroir non vérifié est indiscernable d'une réponse
 * vide vraie. C'est le §1bis appliqué à une source de données : la mesure
 * pouvait passer pour une raison qu'on n'avait pas voulue.
 *
 * 56 relations, mesuré le 27/08 sur `overpass-api.de` **et** sur
 * `maps.mail.ru`. Le nombre bougera avec la donnée OSM ; ce qui compte est
 * l'ordre de grandeur, pas l'égalité stricte.
 */
const TEMOIN_PILAT = {
  bbox: '45.20,4.30,45.60,4.90',
  attendu: 56,
}

describe.skipIf(!ACTIF)('mesures OpenStreetMap (issue #331)', () => {
  /**
   * La mesure qui doit tourner **avant** les autres.
   *
   * Elle ne répond à aucune issue : elle dit si le miroir qui répond a la
   * donnée qu'on croit lui demander. Sans elle, toute réponse vide des
   * mesures suivantes est ambiguë — et l'ambiguïté penche toujours du côté
   * de la conclusion qu'on espérait.
   */
  it('0 — témoin : le miroir a-t-il la France ?', { timeout: 300_000 }, async () => {
    titre('Témoin de couverture — le Pilat, avant toute autre mesure')
    const brut = await mesurer(`[out:json][timeout:120];
relation["route"="hiking"](${TEMOIN_PILAT.bbox});
out ids;`)
    const trouvees = elementsDe(brut).length
    ligne(`relations pédestres sur le Pilat : ${String(trouvees)}`)
    ligne(`attendu (27/08)                  : ~${String(TEMOIN_PILAT.attendu)}`)
    ligne('')
    if (trouvees === 0) {
      ligne('ZÉRO. Le miroir qui a répondu n’a pas la France. **Ne lire aucune')
      ligne('des mesures suivantes** : leurs réponses vides ne diront rien de')
      ligne('la donnée, seulement de la base interrogée.')
      return
    }
    ligne('À lire : un ordre de grandeur comparable → la couverture française')
    ligne('est là, et une réponse vide plus bas veut dire quelque chose. Très')
    ligne('en dessous → miroir régional ou base partielle, mêmes précautions.')
  })

  it('1 — la relation de « Rando Saint-Joseph » (#301)', { timeout: 300_000 }, async () => {
    titre('#301 — relation 6628093, annoncée à 0,5 km sur la fiche')
    const brut = await mesurer(`[out:json][timeout:180];
relation(6628093);
out meta geom;
way(r);
out tags;`)
    const itineraires = parseOverpassResponse(brut, new Date().toISOString())
    const itin = itineraires[0]
    if (!itin) {
      ligne('Aucune relation rendue — vérifier l’identifiant.')
      return
    }
    const morceaux = chainWays(itin.ways).filter((m) => m.newPiece).length
    const coords = itineraryCoords(itin)
    const sommeDesWays = itin.ways.reduce(
      (total: number, way) => total + polylineLengthMeters(way.coords),
      0,
    )
    ligne(`nom               : ${itin.name ?? '(sans nom)'}`)
    ligne(`ref               : ${itin.ref ?? '(sans ref)'}`)
    ligne(`chemins membres   : ${String(itin.ways.length)}`)
    ligne(`morceaux          : ${String(morceaux)}`)
    ligne(`interruptions     : ${String(interruptionsDuTrace(itin).length)}`)
    ligne(`longueur chaînée  : ${(polylineLengthMeters(coords) / 1000).toFixed(2)} km`)
    ligne(`somme des chemins : ${(sommeDesWays / 1000).toFixed(2)} km`)
    ligne('')
    ligne('À lire : les deux longueurs à ~0,5 km avec un seul chemin membre →')
    ligne('relation incomplète (hyp. 1). Somme > chaînée → le chaînage perd un')
    ligne('morceau (hyp. 2). Les deux à 0,5 km avec plusieurs chemins qui se')
    ligne('recollent → la relation décrit vraiment une liaison courte (hyp. 3).')
  })

  it('2 — Porcelette : relations contre chemins balisés (#321)', { timeout: 300_000 }, async () => {
    titre('#321 — Porcelette (Moselle) : trois PR au village, zéro proposée')
    const brut = await mesurer(`[out:json][timeout:180];
area["name"="Porcelette"]["admin_level"="8"]->.a;
(
  relation["route"](area.a);
  way["osmc:symbol"](area.a);
  way["network"~"^[lrni]wn$"](area.a);
);
out tags;`)
    const elements = elementsDe(brut)
    const relations = elements.filter((e) => e.type === 'relation')
    const chemins = elements.filter((e) => e.type === 'way')
    ligne(`relations "route"             : ${String(relations.length)}`)
    for (const r of relations) {
      const nom = r.tags?.['name'] ?? r.tags?.['ref'] ?? '(sans nom)'
      ligne(
        `   route=${r.tags?.['route'] ?? '?'}  ` +
          `network=${r.tags?.['network'] ?? '—'}  ${nom}`,
      )
    }
    ligne(`chemins balisés               : ${String(chemins.length)}`)
    ligne('')
    ligne('À lire : zéro relation + des chemins balisés → hypothèse 1, nos')
    ligne('trois requêtes ne cherchent que des relations, et il faudrait')
    ligne('savoir assembler des chemins. Des relations avec un route= non')
    ligne('reconnu → hypothèse 2, le filtre s’élargit — après avoir mesuré le')
    ligne('bruit que ça ramène.')
  })

  it('3 — la part des balisages que nous savons lire (#290)', { timeout: 600_000 }, async () => {
    titre('#290 — osmc:symbol exploitable, département des Vosges')
    const brut = await mesurer(`[out:json][timeout:180];
area["ISO3166-2"="FR-88"]->.a;
relation["route"~"^(hiking|foot|walking)$"](area.a);
out tags;`)
    const relations = elementsDe(brut)
    const avecSymbole = relations.filter((r) => r.tags?.['osmc:symbol'])
    const lisibles = avecSymbole.filter((r) =>
      decrireBalisage(r.tags?.['osmc:symbol']),
    )
    ligne(`relations pédestres          : ${String(relations.length)}`)
    ligne(`portent osmc:symbol          : ${part(avecSymbole.length, relations.length)}`)
    ligne(`que nous savons lire         : ${part(lisibles.length, relations.length)}`)
    ligne(`   …parmi celles taguées     : ${part(lisibles.length, avecSymbole.length)}`)
    ligne('')
    ligne('Symboles présents mais illisibles, pour enrichir les tables :')
    const inconnus = new Map<string, number>()
    for (const r of avecSymbole) {
      const tag = r.tags?.['osmc:symbol']
      if (tag && !decrireBalisage(tag)) {
        inconnus.set(tag, (inconnus.get(tag) ?? 0) + 1)
      }
    }
    for (const [tag, n] of [...inconnus].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      ligne(`   ${String(n).padStart(4)} × ${tag}`)
    }
    ligne('')
    ligne('À lire : c’est la troisième ligne qui décide. Sous ~50 %, peindre')
    ligne('la carte au balisage donnerait une carte à deux régimes, où l’on ne')
    ligne('saurait plus si le jaune veut dire « PR » ou « balisé jaune ».')
  })

  it('4 — qu’est-ce qu’un « GR » pour le code (#322)', { timeout: 600_000 }, async () => {
    titre('#322 — la part des itinéraires portant un network exploitable')
    const brut = await mesurer(`[out:json][timeout:180];
area["ref:INSEE"="69"]->.a;
relation["route"~"^(hiking|foot|walking)$"](area.a);
out tags;`)
    const relations = elementsDe(brut)
    const compte = new Map<string, number>()
    for (const r of relations) {
      const n = r.tags?.['network'] ?? '(absent)'
      compte.set(n, (compte.get(n) ?? 0) + 1)
    }
    ligne(`relations pédestres du Rhône : ${String(relations.length)}`)
    for (const [n, c] of [...compte].sort((a, b) => b[1] - a[1])) {
      ligne(`   ${String(c).padStart(5)}  network=${n}`)
    }
    const parReseau = relations.filter((r) =>
      /^[ni]wn$/.test(r.tags?.['network'] ?? ''),
    )
    const parRef = relations.filter((r) => /^GRP?\s?\d/.test(r.tags?.['ref'] ?? ''))
    const lesDeux = relations.filter(
      (r) =>
        /^[ni]wn$/.test(r.tags?.['network'] ?? '') &&
        /^GRP?\s?\d/.test(r.tags?.['ref'] ?? ''),
    )
    ligne('')
    ligne(`network national/international : ${part(parReseau.length, relations.length)}`)
    ligne(`ref commençant par GR/GRP      : ${part(parRef.length, relations.length)}`)
    ligne(`les deux à la fois             : ${String(lesDeux.length)}`)
    ligne('')
    ligne('À lire : si les deux ensembles coïncident, le network suffit et')
    ligne('l’issue est tranchée. S’ils divergent, regarder lesquels et')
    ligne('pourquoi avant de choisir la définition — un GR de pays de 12 km')
    ligne('et un sentier de 200 km sans ref ne tombent pas du même côté.')
  })

  it('5 — les PR du Rhône (#20)', { timeout: 600_000 }, async () => {
    titre('#20 — inventaire des PR du Rhône dans OpenStreetMap')
    const brut = await mesurer(`[out:json][timeout:180];
area["ref:INSEE"="69"]->.a;
relation["route"~"^(hiking|foot|walking)$"](area.a);
out tags;`)
    const relations = elementsDe(brut)
    const locales = relations.filter((r) =>
      /^[lr]wn$/.test(r.tags?.['network'] ?? ''),
    )
    ligne(`relations pédestres   : ${String(relations.length)}`)
    ligne(`réseau local/régional : ${part(locales.length, relations.length)}`)
    ligne('')
    ligne('Les vingt premières, à comparer à la main avec un cartoguide :')
    for (const r of locales.slice(0, 20)) {
      ligne(`   ${(r.tags?.['ref'] ?? '—').padEnd(10)} ${r.tags?.['name'] ?? '(sans nom)'}`)
    }
    ligne('')
    ligne('À lire : l’écart entre ce compte et le nombre de PR d’un')
    ligne('cartoguide papier est ce que l’issue cherche depuis le 19/08.')
  })
})
