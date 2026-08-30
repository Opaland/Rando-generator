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
import { decrireBalisage, lireBalisage } from '../../src/core/balisage.ts'
import { classifyNetwork } from '../../src/core/network.ts'

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
  id?: number
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

/**
 * Le délai de courtoisie entre deux requêtes lourdes.
 *
 * Overpass est un service public et gratuit, et ces mesures lui demandent
 * des départements entiers. Deux requêtes de ce poids coup sur coup font
 * couper la connexion — mesuré le 27/08 : les Vosges passent, le Rhône qui
 * suit immédiatement échoue au bout de deux minutes.
 *
 * Ce n'est pas un contournement mais la bonne manière : le miroir a raison de
 * se protéger, et une mesure qui le martèle finit par ne plus rien mesurer
 * du tout.
 */
const REPOS_ENTRE_REQUETES_MS = 5_000

function patienter(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Le même égard, en plus léger, pour le service altimétrique de l'IGN
 * (mesure 7). Six points isolés ne pèsent rien à côté d'un département
 * Overpass : la courtoisie suffit, la précaution n'est pas nécessaire. Ce
 * nombre ne change aucun résultat — il n'espace que des requêtes.
 */
const REPOS_ENTRE_POINTS_IGN_MS = 500

/** Toutes les mesures passent par là, plutôt que par le défaut. */
let premiereRequete = true
async function mesurer(requete: string): Promise<OverpassResponse> {
  if (!premiereRequete) await patienter(REPOS_ENTRE_REQUETES_MS)
  premiereRequete = false
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
/**
 * Mesurer **sans** Overpass, quand Overpass ne répond plus.
 *
 * ## Pourquoi cette seconde voie existe
 *
 * Le 30/08, les trois miroirs Overpass coupaient la connexion à 6–9 secondes,
 * `/api/status` compris — quatre issues attendaient une mesure qu'aucune
 * requête ne pouvait plus prendre (#290, #321, #20, #333). `api.openstreetmap.org`
 * répondait, lui, en une seconde.
 *
 * `GET /api/0.6/map.json?bbox=…` rend **tout** ce qui est dans une emprise,
 * relations comprises, avec leurs tags. C'est assez pour compter des
 * proportions — pas pour interroger un département : le serveur refuse
 * au-delà de 50 000 nœuds, et les fenêtres se comptent donc en centièmes de
 * degré.
 *
 * ## Ce que cette voie ne peut pas faire, et qu'il faut dire
 *
 * **Un échantillon de fenêtres n'est pas un inventaire.** Il rend des
 * proportions à quelques points près, sur ce que ces fenêtres-là traversent,
 * et rien d'autre. Il sur-représente aussi les longs itinéraires : un GR
 * traverse plusieurs fenêtres, une boucle communale une seule. Le
 * dédoublonnage par identifiant corrige le double comptage, pas le biais de
 * sélection.
 *
 * Une proportion mesurée ainsi ne se cite donc jamais comme « la part en
 * France », mais comme « la part dans ces fenêtres » (§2).
 */
const API_OSM = 'https://api.openstreetmap.org/api/0.6/map.json'

/** Les types de relation que l'application charge, et eux seuls. */
const ROUTES_PEDESTRES = new Set(['hiking', 'foot', 'walking'])

/**
 * Le repos entre deux fenêtres, et le rattrapage d'un 429.
 *
 * L'API OSM est le serveur principal du projet, pas un miroir de calcul :
 * chaque fenêtre lui coûte plusieurs mégaoctets. Mesuré le 30/08 : à quatre
 * secondes d'intervalle, une requête sur deux revient en 429, et repart après
 * une vingtaine de secondes. Ce n'est pas un contournement — c'est le tarif,
 * et une mesure qui martèle finit par ne plus rien mesurer.
 */
const REPOS_ENTRE_FENETRES_MS = 4_000
const REPOS_APRES_429_MS = 20_000

/** Une emprise, nommée pour que le rapport dise où l'on a regardé. */
interface Fenetre {
  nom: string
  bbox: string
}

/**
 * Les fenêtres de mesure, choisies pour **contraster les massifs**.
 *
 * Le Club Vosgien balise depuis 1872 et déclare tout ; d'autres massifs
 * n'ont presque rien de tagué. Un échantillon pris dans un seul d'entre eux
 * rendrait un chiffre vrai et inutilisable — c'est précisément l'écart entre
 * régions qui décide de ce qu'on peut peindre (#290).
 */
const FENETRES_BALISAGE: readonly Fenetre[] = [
  { nom: 'Munster (Vosges)', bbox: '7.12,48.03,7.14,48.05' },
  { nom: 'Hohneck (Vosges)', bbox: '7.00,48.03,7.02,48.05' },
  { nom: 'Ballon d’Alsace (Vosges)', bbox: '6.83,47.81,6.85,47.83' },
  { nom: 'Donon (Vosges)', bbox: '7.10,48.50,7.12,48.52' },
  { nom: 'Pilat (Loire)', bbox: '4.60,45.38,4.62,45.40' },
  { nom: 'Monts d’Or (Rhône)', bbox: '4.75,45.83,4.77,45.85' },
  { nom: 'Chartreuse (Isère)', bbox: '5.80,45.35,5.82,45.37' },
  { nom: 'Vercors (Drôme)', bbox: '5.45,44.92,5.47,44.94' },
  { nom: 'Bauges (Savoie)', bbox: '6.15,45.65,6.17,45.67' },
  { nom: 'Cévennes (Lozère)', bbox: '3.55,44.25,3.57,44.27' },
  { nom: 'Cantal', bbox: '2.68,45.07,2.70,45.09' },
  { nom: 'Luberon (Vaucluse)', bbox: '5.40,43.83,5.42,43.85' },
  { nom: 'Brocéliande (Morbihan)', bbox: '-2.20,47.98,-2.18,48.00' },
  { nom: 'Fontainebleau (Seine-et-Marne)', bbox: '2.60,48.40,2.62,48.42' },
]

/** Une relation pédestre échantillonnée, avec la fenêtre où on l'a vue. */
interface RelationVue {
  fenetre: string
  id: number
  tags: Record<string, string>
  /** Les membres, pour distinguer une relation plate d'une super-relation. */
  membres: { type?: string; ref?: number }[]
}

/**
 * Les relations pédestres de ces fenêtres, dédoublonnées par identifiant.
 *
 * Chaque échec est **dit et compté** plutôt que tu : une fenêtre qui n'a pas
 * répondu ne rend pas zéro relation, elle rend rien du tout, et confondre les
 * deux ferait passer une panne pour une donnée. C'est la leçon du témoin du
 * Pilat, appliquée ici.
 */
async function relationsDesFenetres(
  fenetres: readonly Fenetre[],
): Promise<{
  relations: RelationVue[]
  chemins: ElementTague[]
  trous: string[]
}> {
  const vues = new Map<number, RelationVue>()
  const cheminsVus = new Map<number, ElementTague>()
  const trous: string[] = []
  let premiere = true
  for (const fenetre of fenetres) {
    if (!premiere) await patienter(REPOS_ENTRE_FENETRES_MS)
    premiere = false
    let servie = false
    for (let essai = 1; essai <= 3 && !servie; essai += 1) {
      let reponse: Response
      try {
        reponse = await fetch(`${API_OSM}?bbox=${fenetre.bbox}`)
      } catch (erreur) {
        ligne(`  ${fenetre.nom} : échec réseau — ${(erreur as Error).message}`)
        await patienter(REPOS_APRES_429_MS)
        continue
      }
      if (reponse.status === 429) {
        await patienter(REPOS_APRES_429_MS)
        continue
      }
      if (!reponse.ok) {
        ligne(`  ${fenetre.nom} : HTTP ${String(reponse.status)}`)
        break
      }
      const data = (await reponse.json()) as { elements?: ElementTague[] }
      let neuves = 0
      for (const element of data.elements ?? []) {
        if (element.type === 'way' && element.id !== undefined) {
          if (!cheminsVus.has(element.id)) cheminsVus.set(element.id, element)
        }
        if (element.type !== 'relation') continue
        /*
          **Toutes** les relations, pas seulement les pédestres.

          La première version filtrait ici, et la mesure 11 en héritait une
          question sans réponse possible : « quelles autres valeurs de `route`
          y a-t-il ? » ne pouvait rendre que « aucune », puisque le filtre les
          avait déjà retirées. Elle rendait donc « — » quoi qu'il arrive —
          l'assertion qui passe pour une raison qu'on n'a pas voulue, §1bis.

          Le tri appartient à chaque mesure, pas au ramassage.
        */
        const tags = element.tags ?? {}
        if (element.id === undefined || vues.has(element.id)) continue
        vues.set(element.id, {
          fenetre: fenetre.nom,
          id: element.id,
          tags,
          membres: (element as { members?: { type?: string; ref?: number }[] })
            .members ?? [],
        })
        neuves += 1
      }
      // « tous types » et non « pédestres » : le ramassage ne trie plus, et
      // laisser « relations neuves » ferait lire ces nombres comme des
      // itinéraires alors qu'ils comptent aussi les lignes de bus.
      ligne(
        `  ${fenetre.nom.padEnd(32)} ${String(neuves).padStart(3)} relations neuves (tous types)`,
      )
      servie = true
    }
    if (!servie) trous.push(fenetre.nom)
  }
  return {
    relations: [...vues.values()],
    chemins: [...cheminsVus.values()],
    trous,
  }
}

/**
 * La couleur de référence d'une famille fédérale, quand elle en a **une**.
 *
 * GR est balisé blanc et rouge, PR jaune : une couleur dominante chacun. GRP
 * est balisé jaune **et** rouge — aucune couleur unique ne le représente, et
 * le comparer à une seule gonflerait le compte quel que soit le choix. Il est
 * donc écarté de la comparaison, et compté à part.
 */
const COULEUR_DE_FAMILLE: Record<string, string | undefined> = {
  GR: 'red',
  PR: 'yellow',
}

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

  /**
   * Deux départements, et c'est le second qui décide.
   *
   * La première version ne mesurait que **les Vosges**, et rendait 94,3 % —
   * très au-dessus du seuil de ~50 % que #290 se donne. Sauf que les Vosges
   * sont le massif du **Club Vosgien**, celui qui balise en formes
   * géométriques et renseigne `osmc:symbol` mieux que partout ailleurs :
   * c'est précisément pour ça que #286 s'y intéressait.
   *
   * Conclure « 94 % en France » depuis cet échantillon-là serait généraliser
   * depuis le cas le plus favorable — l'erreur que le §2 interdit. Le Rhône
   * sert donc de contre-épreuve : un département ordinaire, sans fédération
   * locale qui tienne la donnée.
   */
  /**
   * ## Quel territoire on interroge, dit une fois et vérifié
   *
   * `area["ref:INSEE"="69"]` rendait 15 relations, `area["ISO3166-2"="FR-69"]`
   * en rendait 157, et une mesure antérieure 227. Trois nombres pour « le
   * Rhône ». La cause est mesurée, et c'est le découpage de 2015 :
   *
   * ```
   * relation/7378     Rhône  admin_level=5  ref:INSEE=69   (pas d'ISO)
   * relation/4850451  Rhône  admin_level=6  ref:INSEE=69D  ISO3166-2=FR-69
   * ```
   *
   * Deux entités distinctes portent le même nom. La première est la
   * circonscription départementale — elle **inclut** la Métropole de Lyon ;
   * la seconde est le département proprement dit (69D), qui l'exclut. Les
   * Vosges n'ont pas ce problème : les deux tags y désignent la même
   * relation, d'où leurs 1 035 identiques.
   *
   * **On retient `ISO3166-2`**, qui désigne une frontière de niveau 6 dans
   * les deux cas — donc la même chose d'un département à l'autre, ce que
   * `ref:INSEE` ne garantit pas. Que le Rhône exclue alors la Métropole de
   * Lyon est un choix assumé : « un département ordinaire » se lit mieux
   * sans son cœur urbain.
   *
   * Et surtout : **la mesure dit désormais quelle frontière elle a
   * interrogée** — identifiant, nom, niveau. Un nombre sans son territoire
   * n'est pas une mesure, c'est un chiffre.
   */
  const DEPARTEMENTS_BALISAGE = [
    { code: 'FR-88', nom: 'Vosges (massif du Club Vosgien)' },
    { code: 'FR-69', nom: 'Rhône hors Métropole (département ordinaire)' },
  ]

  /**
   * Dit quelle frontière un code ISO désigne réellement.
   *
   * Appelée avant chaque comptage : sans elle, « 157 relations dans le
   * Rhône » ne dit pas de quel Rhône on parle.
   */
  async function nommerLaFrontiere(iso: string): Promise<void> {
    const brut = await mesurer(`[out:json][timeout:60];
relation["ISO3166-2"="${iso}"]["boundary"="administrative"];
out tags;`)
    for (const e of elementsDe(brut)) {
      const t = e.tags ?? {}
      ligne(
        `  frontière : relation ${t['ref:INSEE'] ?? '?'} « ${t['name'] ?? '?'} »` +
          ` niveau ${t['admin_level'] ?? '?'}`,
      )
    }
  }

  it('3 — la part des balisages que nous savons lire (#290)', { timeout: 900_000 }, async () => {
    titre('#290 — osmc:symbol exploitable, deux départements')
    for (const dept of DEPARTEMENTS_BALISAGE) {
      ligne('')
      ligne(`— ${dept.nom}`)
      await nommerLaFrontiere(dept.code)
      const brut = await mesurer(`[out:json][timeout:180];
area["ISO3166-2"="${dept.code}"]->.a;
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
      const inconnus = new Map<string, number>()
      for (const r of avecSymbole) {
        const tag = r.tags?.['osmc:symbol']
        if (tag && !decrireBalisage(tag)) {
          inconnus.set(tag, (inconnus.get(tag) ?? 0) + 1)
        }
      }
      if (inconnus.size > 0) {
        ligne('  symboles présents mais illisibles :')
        for (const [tag, n] of [...inconnus].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
          ligne(`   ${String(n).padStart(4)} × ${tag}`)
        }
      }
    }
    ligne('')
    ligne('À lire : c’est la ligne « que nous savons lire » du **Rhône** qui')
    ligne('décide, pas celle des Vosges. Sous ~50 %, peindre la carte au')
    ligne('balisage donnerait une carte à deux régimes, où l’on ne saurait')
    ligne('plus si le jaune veut dire « PR » ou « balisé jaune ». Un écart')
    ligne('marqué entre les deux départements est lui-même une réponse :')
    ligne('la couverture dépend alors du massif, donc d’où l’on marche.')
  })

  it('4 — qu’est-ce qu’un « GR » pour le code (#322)', { timeout: 600_000 }, async () => {
    titre('#322 — la part des itinéraires portant un network exploitable')
    await nommerLaFrontiere('FR-69')
    const brut = await mesurer(`[out:json][timeout:180];
area["ISO3166-2"="FR-69"]->.a;
relation["route"~"^(hiking|foot|walking)$"](area.a);
out tags;`)
    const relations = elementsDe(brut)
    const compte = new Map<string, number>()
    for (const r of relations) {
      const n = r.tags?.['network'] ?? '(absent)'
      compte.set(n, (compte.get(n) ?? 0) + 1)
    }
    ligne(`relations pédestres (69D)    : ${String(relations.length)}`)
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
    await nommerLaFrontiere('FR-69')
    const brut = await mesurer(`[out:json][timeout:180];
area["ISO3166-2"="FR-69"]->.a;
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

  /**
   * Les variantes d'un itinéraire balisé (#333).
   *
   * L'issue pose trois questions et **interdit de trancher avant** de les
   * avoir chiffrées. Les deux premières se lisent dans les tags ; la
   * troisième — la part de géométrie commune — demande de télécharger les
   * tracés, et c'est dit plutôt que supposé.
   */
  it('6 — les variantes d’itinéraires (#333)', { timeout: 900_000 }, async () => {
    titre('#333 — variantes : superroutes et refs dérivées')
    await nommerLaFrontiere('FR-69')

    const brut = await mesurer(`[out:json][timeout:180];
area["ISO3166-2"="FR-69"]->.a;
relation["route"~"^(hiking|foot|walking)$"](area.a);
out tags;`)
    const itineraires = elementsDe(brut)

    /*
      Les superroutes qui **contiennent** ces itinéraires. `rel(br.…)` remonte
      aux relations parentes : c'est la façon canonique de rattacher une
      variante à son tronc, et la seule qui ne repose pas sur du texte.
    */
    const parents = await mesurer(`[out:json][timeout:180];
area["ISO3166-2"="FR-69"]->.a;
relation["route"~"^(hiking|foot|walking)$"](area.a)->.itin;
rel(br.itin)["type"="superroute"];
out tags;`)
    const superroutes = elementsDe(parents)

    /*
      Une ref dérivée : `GR 7A` se rattache à `GR 7`. On la reconnaît à une
      lettre finale collée à un numéro — et on la compte séparément parce que
      c'est une déduction sur du texte, moins sûre qu'un lien de relation.
    */
    const REF_DERIVEE = /^(.*?\d+)\s?([A-Z])$/
    const derivees = itineraires.filter((r) =>
      REF_DERIVEE.test((r.tags?.['ref'] ?? '').trim()),
    )

    ligne(`relations pédestres          : ${String(itineraires.length)}`)
    ligne(`superroutes qui les coiffent : ${String(superroutes.length)}`)
    ligne(`refs dérivées (« GR 7A »)    : ${part(derivees.length, itineraires.length)}`)
    for (const r of derivees.slice(0, 10)) {
      ligne(`   ${(r.tags?.['ref'] ?? '').padEnd(10)} ${r.tags?.['name'] ?? ''}`)
    }

    /*
      La question qui décide, et qu'aucun des deux comptes ne répond seul :
      **les variantes elles-mêmes sont-elles rattachées ?**

      La famille est demandée avec ses parents dans la **même** requête. Sans
      ce témoin, une réponse vide se lirait « pas de superroute » alors
      qu'elle pourrait dire « la requête a échoué » — le miroir venait
      justement de rendre une erreur HTML au coup d'avant (§1bis).
    */
    if (derivees.length > 0) {
      const ids = derivees.map((r) => String(r.id ?? '')).join(',')
      const avecParents = await mesurer(`[out:json][timeout:120];
relation(id:${ids})->.fam;
(.fam; rel(br.fam););
out tags;`)
      const rendus = elementsDe(avecParents)
      const parentsDesDerivees = rendus.length - derivees.length
      ligne('')
      ligne(`variantes rendues (témoin)   : ${String(rendus.length - parentsDesDerivees)}/${String(derivees.length)}`)
      ligne(`dont rattachées à une superroute : ${String(parentsDesDerivees)}`)
      if (rendus.length === 0) {
        ligne('AUCUNE rendue : la requête a échoué, ne rien conclure.')
      }
    }

    ligne('')
    ligne('À lire : zéro superroute **et** zéro ref dérivée → il n’y a pas de')
    ligne('variantes à rattacher dans cette zone, et l’issue attend une zone où')
    ligne('il y en a. Des superroutes → le rattachement se lit dans la donnée,')
    ligne('sans deviner. Des refs dérivées sans superroute → le rattachement se')
    ligne('déduirait du texte, ce qui est moins sûr et doit être pesé.')
    ligne('')
    ligne('La troisième question de l’issue — quelle part de géométrie deux')
    ligne('variantes partagent — n’est pas ici : elle demande `out geom` sur')
    ligne('chaque relation, donc un tout autre volume. À faire quand on saura')
    ligne('qu’il y a des variantes à mesurer.')
  })

  /**
   * Le service altimétrique, et non Overpass — mais la même discipline.
   *
   * `PAS_MINIMAL_METRES` (src/core/pente.ts) décide si une pente est
   * calculée. Sa justification disait que la ressource `ign_rge_alti_wld`
   * est « un assemblage mondial » et qu'on prend donc la valeur la plus
   * grossière des deux annoncées. Mesuré le 28/08 : **c'est faux**, la
   * ressource ne couvre que la France.
   *
   * Cette mesure existe pour que ça ne se réécrive pas de mémoire une
   * troisième fois. Elle n'asserte rien — comme les autres, elle affiche.
   */
  it('7 — l’emprise du modèle de terrain de l’IGN (#316)', { timeout: 300_000 }, async () => {
    titre('#316 — que couvre `ign_rge_alti_wld`, et que dit-il de lui-même')

    const POINTS = [
      { nom: 'Pilat (Loire)', lon: 4.6, lat: 45.4 },
      { nom: 'Chamonix (Haute-Savoie)', lon: 6.87, lat: 45.92 },
      { nom: 'Guadeloupe (DOM)', lon: -61.55, lat: 16.24 },
      { nom: 'Berne (Suisse)', lon: 7.45, lat: 46.95 },
      { nom: 'Turin (Italie)', lon: 7.69, lat: 45.07 },
      { nom: 'Barcelone (Espagne)', lon: 2.17, lat: 41.39 },
    ] as const

    let titreDeLaRessource = '(non rendu)'
    let exactitude = '(non rendue)'
    for (const point of POINTS) {
      const adresse =
        'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json' +
        `?lon=${String(point.lon)}&lat=${String(point.lat)}` +
        '&resource=ign_rge_alti_wld&measures=true'
      let z = 'échec'
      try {
        const reponse = await fetch(adresse)
        const corps = (await reponse.json()) as {
          elevations?: {
            z?: number
            acc?: string
            measures?: { title?: string }[]
          }[]
        }
        const premier = corps.elevations?.[0]
        if (premier?.z !== undefined) z = premier.z.toFixed(2)
        if (premier?.acc !== undefined) exactitude = premier.acc
        const dit = premier?.measures?.[0]?.title
        if (dit !== undefined) titreDeLaRessource = dit
      } catch (erreur) {
        z = `échec — ${(erreur as Error).message.split('\n')[0]}`
      }
      ligne(`${point.nom.padEnd(26)} : z = ${z}`)
      await patienter(REPOS_ENTRE_POINTS_IGN_MS)
    }

    ligne('')
    ligne(`le service se nomme : ${titreDeLaRessource}`)
    ligne(`exactitude déclarée : ${exactitude}`)
    ligne('')
    ligne('À lire : `-99999` est le témoin de non-couverture de l’IGN, celui')
    ligne('que `elevation.ts` filtre déjà (`value > -9000`). Trois voisins')
    ligne('européens à -99999 et la Guadeloupe à une vraie altitude → la')
    ligne('ressource couvre la France, pas le monde, quoi qu’en dise son')
    ligne('suffixe `_wld`.')
    ligne('')
    ligne('Ce que ça ne dit pas : le pas de la grille. Le service répond')
    ligne('« Variable suivant la source de mesure », donc il ne le dira pas.')
    ligne('La mesure 8 ne le lui demande plus — elle le lui fait montrer.')
  })

  /**
   * Le pas réel du modèle, mesuré sur ce qu'il rend — et non lu dans une
   * spécification.
   *
   * La mesure 7 concluait qu'il fallait la fiche produit RGE ALTI, qui n'est
   * pas lisible autrement que par un script. C'était chercher la réponse au
   * mauvais endroit : ce qui décide de `PAS_MINIMAL_METRES` n'est pas la
   * finesse à laquelle l'IGN publie, c'est **la finesse à laquelle le service
   * nous répond**. Un modèle publié au mètre mais reéchantillonné en chemin
   * ne nous donnerait pas le mètre, et c'est le nôtre qui compte.
   *
   * ## Comment on la lit sans se tromper
   *
   * Un profil demandé le long d'une droite rend un escalier : l'altitude ne
   * change qu'en franchissant une cellule. La longueur d'une marche est donc
   * le pas — **à condition que ce ne soit pas notre échantillonnage qu'on
   * mesure**. D'où le contrôle : la même portion de terrain est demandée avec
   * quatre densités de points. Si le nombre d'altitudes distinctes ne bouge
   * pas, la marche est dans le sol ; s'il suit le nombre de points demandés,
   * elle est dans la requête et la mesure ne vaut rien.
   *
   * C'est le §1bis appliqué à une sonde : une mesure qui pourrait donner ce
   * chiffre-là pour une raison qu'on n'a pas voulue n'est pas une mesure.
   *
   * Le terrain plat ne sert à rien ici : deux cellules voisines y portent
   * légitimement la même altitude, et les marches se confondent. On mesure
   * donc sur des versants.
   */
  it('8 — le pas réel du modèle de terrain (#316)', { timeout: 600_000 }, async () => {
    titre('#316 — à quelle finesse le service altimétrique répond-il')

    const PORTEE_METRES = 30
    const VERSANTS = [
      { nom: 'Chartreuse', lon: 5.83, lat: 45.35 },
      { nom: 'Belledonne', lon: 6.0, lat: 45.18 },
      { nom: 'Pilat', lon: 4.61, lat: 45.4 },
    ] as const

    /** Les altitudes le long d'une droite, en `points` relevés. */
    async function altitudes(
      lon: number,
      lat: number,
      points: number,
      vers: 'est' | 'nord',
    ): Promise<number[]> {
      const span =
        vers === 'est'
          ? PORTEE_METRES / (111_320 * Math.cos((lat * Math.PI) / 180))
          : PORTEE_METRES / 110_540
      const lons: string[] = []
      const lats: string[] = []
      for (let i = 0; i < points; i += 1) {
        const t = (span * i) / (points - 1)
        lons.push((vers === 'est' ? lon + t : lon).toFixed(9))
        lats.push((vers === 'nord' ? lat + t : lat).toFixed(9))
      }
      const adresse =
        'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json' +
        `?lon=${lons.join('|')}&lat=${lats.join('|')}` +
        '&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=false'
      /*
        Un refus du proxy rend « Host not in allowlist », qui n'est pas du
        JSON : la première version tombait dessus et emportait toute la
        mesure. Une colonne vide se lit, une exception ne se lit pas.
      */
      try {
        const reponse = await fetch(adresse)
        const corps = (await reponse.json()) as {
          elevations?: { z?: number }[]
        }
        return (corps.elevations ?? [])
          .map((e) => e.z)
          .filter((z): z is number => z !== undefined && z > -9000)
      } catch {
        return []
      }
    }

    ligne('Contrôle : la même portion de terrain, demandée quatre fois avec')
    ligne('des densités différentes. Si les altitudes distinctes ne bougent')
    ligne('pas, l’escalier est dans le sol et non dans la requête.')
    ligne('')
    ligne('versant          sens   16 pts  31 pts  61 pts  121 pts   → pas')

    for (const versant of VERSANTS) {
      for (const vers of ['est', 'nord'] as const) {
        const comptes: string[] = []
        let dernier = 0
        for (const points of [16, 31, 61, 121]) {
          const zs = await altitudes(versant.lon, versant.lat, points, vers)
          dernier = new Set(zs).size
          comptes.push(zs.length === 0 ? '—' : String(dernier))
          await patienter(REPOS_ENTRE_POINTS_IGN_MS)
        }
        const pas =
          dernier > 0 ? `${(PORTEE_METRES / dernier).toFixed(2)} m` : '—'
        ligne(
          `${versant.nom.padEnd(16)} ${vers.padEnd(6)} ` +
            comptes.map((c) => c.padStart(6)).join('  ') +
            `   ${pas.padStart(7)}`,
        )
      }
    }

    ligne('')
    ligne('À lire : les quatre colonnes doivent porter le même nombre. C’est')
    ligne('ce qui distingue une résolution du sol d’un artefact de sonde — et')
    ligne('sans cette colonne-là, le chiffre de droite ne prouverait rien.')
    ligne('')
    ligne('Ce que la mesure du 29/08 a donné : dix altitudes distinctes sur')
    ligne('30 m vers l’est et sept vers le nord, aux trois versants et pour')
    ligne('les quatre densités — soit 3,00 m et 4,29 m. L’écart entre les deux')
    ligne('sens est constant d’un site à l’autre et ne dépend pas de la pente')
    ligne('(mesurée de 10 % à 86 %).')
    ligne('')
    ligne('Ces deux nombres sous-estiment la marche, et il faut le dire : les')
    ligne('cellules des deux bouts sont tronquées par la portée, donc diviser')
    ligne('30 m par le compte donne moins que le pas réel. Une seconde façon')
    ligne('de le mesurer — relever les paliers un par un à 0,25 m — a rendu')
    ligne('3,25 à 3,50 m vers l’est et 4,75 m vers le nord. Les deux')
    ligne('estimateurs encadrent : le pas est de 3,0–3,5 m vers l’est et de')
    ligne('4,3–4,8 m vers le nord.')
    ligne('')
    ligne('Ce que ça règle pour `PAS_MINIMAL_METRES` (src/core/pente.ts) : une')
    ligne('pente calculée sous 4,8 m lit l’escalier du modèle et non le')
    ligne('terrain. Le plancher de 5 m tombe juste au-dessus de la plus longue')
    ligne('marche des deux estimateurs. Il tient — et 1 m, l’autre candidat de')
    ligne('l’issue, aurait été faux d’un facteur quatre.')
    ligne('')
    ligne('Ce que ça ne dit pas : à quel pas l’IGN **publie** RGE ALTI. On a')
    ligne('mesuré ce que le service rend, ce qui est la question utile ici, et')
    ligne('c’est la seule que ces chiffres autorisent à trancher (§2).')
  })

  /**
   * La garde de #400 peut-elle seulement se déclencher ?
   *
   * `relationsPerdues` signale une super-relation — une relation dont les
   * membres sont des relations — dont aucune fille n'est revenue. La revue
   * du 30/08 a posé la question que la PR n'avait pas posée : **Overpass
   * rend-il jamais une telle relation** ?
   *
   * Elle n'est pas rhétorique. Les deux super-relations de Porcelette ont
   * été trouvées par l'API OpenStreetMap (`/api/0.6/map`), qui rend les
   * relations parentes d'un élément de la boîte. Un filtre Overpass
   * `(area)` ou `(around)` ne sélectionne pas forcément de la même façon une
   * relation qui n'a ni nœud ni chemin en propre.
   *
   * Si la réponse est non, la garde livrée est **correcte et inatteignable**
   * par ce chemin-là — ce qui ne la rend pas inutile (le cache de zone et un
   * import peuvent porter d'autres formes) mais change ce qu'on peut en
   * dire. Une garde dont on ignore si elle peut rougir n'est pas une garde,
   * c'est une intention.
   */
  it('9 — Overpass rend-il une super-relation ? (#400)', { timeout: 300_000 }, async () => {
    titre('#400 — une relation sans chemin propre est-elle sélectionnée ?')

    /* Les trois relations mesurées le 29/08 autour de Porcelette. */
    const SUPER_GR5G = 11_888_292
    const SUPER_VIA_REGIA = 19_412_943
    const PLATE_GR5G = 11_894_631

    const requete = `[out:json][timeout:60];
relation["route"~"^(hiking|foot|walking|pilgrimage)$"](49.10,6.60,49.25,6.85);
out ids;`

    let rendues: number[]
    try {
      const data = await fetchOverpass(requete)
      rendues = data.elements.map((e) => e.id)
    } catch (erreur) {
      ligne(`échec : ${(erreur as Error).message.split('\n')[0]}`)
      ligne('Overpass n’a pas répondu — la question reste ouverte.')
      return
    }

    ligne(`relations rendues dans la boîte : ${String(rendues.length)}`)
    ligne('')
    for (const [id, quoi] of [
      [SUPER_GR5G, 'GR 5G, super-relation (3 relations, 0 chemin)'],
      [SUPER_VIA_REGIA, 'Via Regia, super-relation (3 relations, 0 chemin)'],
      [PLATE_GR5G, 'GR 5G, relation plate (387 chemins)'],
    ] as const) {
      ligne(
        `${rendues.includes(id) ? 'rendue ' : 'absente'} — r${String(id)} : ${quoi}`,
      )
    }
    ligne('')
    ligne('À lire : si les deux super-relations sont absentes alors que la')
    ligne('plate est là, Overpass ne sélectionne pas une relation dépourvue')
    ligne('de membre propre, et la garde de #400 ne peut pas se déclencher')
    ligne('sur ce chemin. Si elles sont rendues, elle le peut — et le §1')
    ligne('demande alors qu’on l’ait vue rougir sur une vraie réponse.')
  })

  it(
    '10 — le balisage réel, mesuré sans Overpass (#290)',
    { timeout: 900_000 },
    async () => {
      titre('#290 — ce que la carte peint contre ce qui est peint sur l’arbre')
      ligne('Par `api.openstreetmap.org`, Overpass étant coupé (voir plus haut).')
      ligne('')
      const { relations: toutes, trous } =
        await relationsDesFenetres(FENETRES_BALISAGE)
      ligne('')
      if (trous.length > 0) {
        ligne(`fenêtres sans réponse : ${trous.join(', ')}`)
        ligne('(elles ne comptent pour zéro nulle part — elles manquent.)')
        ligne('')
      }
      if (toutes.length === 0) {
        ligne('Aucune fenêtre n’a répondu : la question reste ouverte.')
        return
      }

      // Le ramassage rend toutes les relations : c'est ici qu'on trie.
      const relations = toutes.filter((r) =>
        ROUTES_PEDESTRES.has(r.tags['route'] ?? ''),
      )
      const avec = relations.filter((r) => r.tags['osmc:symbol'] !== undefined)
      const lisibles = avec.filter(
        (r) => decrireBalisage(r.tags['osmc:symbol']) !== null,
      )
      const deuxPlans = avec.filter(
        (r) => lireBalisage(r.tags['osmc:symbol'])?.secondPlan != null,
      )
      ligne(`relations pédestres distinctes : ${String(relations.length)}`)
      ligne(`portent osmc:symbol            : ${part(avec.length, relations.length)}`)
      ligne(`que nous savons lire           : ${part(lisibles.length, relations.length)}`)
      ligne(`   …parmi celles taguées       : ${part(lisibles.length, avec.length)}`)
      ligne(`portent un second symbole      : ${part(deuxPlans.length, avec.length)}`)

      /*
        La question de fond, et elle n'a rien d'abstrait : Anne-Marie lit
        « rectangle rouge » dans la fiche et voit une ligne jaune sur la
        carte. On compte ici combien de fois la couleur peinte par la
        taxonomie fédérale contredit la couleur peinte sur l'arbre.
      */
      let comparables = 0
      let contredits = 0
      let grpEcartes = 0
      const exemples: string[] = []
      for (const relation of lisibles) {
        const reseau = classifyNetwork(relation.tags)
        if (reseau === 'GRP') {
          grpEcartes += 1
          continue
        }
        const attendue = COULEUR_DE_FAMILLE[reseau]
        const teinte = lireBalisage(relation.tags['osmc:symbol'])?.premierPlan.split(
          '_',
        )[0]
        if (attendue === undefined || teinte === undefined) continue
        comparables += 1
        if (teinte === attendue) continue
        contredits += 1
        if (exemples.length < 6) {
          exemples.push(
            `   r${String(relation.id)} ${reseau.padEnd(4)} ${relation.tags['osmc:symbol'] ?? ''} ${(relation.tags['name'] ?? '').slice(0, 30)}`,
          )
        }
      }
      ligne('')
      ligne('la couleur de la carte contre celle de l’arbre :')
      ligne(`  GRP écartés (balisage bicolore, pas de référence unique) : ${String(grpEcartes)}`)
      ligne(`  comparables                                             : ${String(comparables)}`)
      ligne(`  la carte contredit l’arbre                              : ${part(contredits, comparables)}`)
      for (const exemple of exemples) ligne(exemple)

      ligne('')
      ligne('couverture par fenêtre (lisibles / relations) :')
      const parFenetre = new Map<string, [number, number]>()
      for (const relation of relations) {
        const [total, lu] = parFenetre.get(relation.fenetre) ?? [0, 0]
        const symbole = relation.tags['osmc:symbol']
        parFenetre.set(relation.fenetre, [
          total + 1,
          lu + (symbole !== undefined && decrireBalisage(symbole) !== null ? 1 : 0),
        ])
      }
      for (const [nom, [total, lu]] of parFenetre) {
        ligne(`  ${nom.padEnd(32)} ${String(lu).padStart(3)} / ${String(total).padStart(3)}`)
      }

      ligne('')
      ligne('À lire : c’est la **dispersion** entre fenêtres qui décide, pas la')
      ligne('moyenne. Si un massif rend 100 % et un autre 0 %, peindre au')
      ligne('balisage donne une carte juste là où le Club Vosgien a travaillé et')
      ligne('muette ailleurs — une carte à deux régimes, ce que #290 voulait')
      ligne('précisément éviter. La moyenne, elle, cacherait cet écart.')
    },
  )

  /**
   * Les fenêtres de Porcelette (Moselle), pour #321.
   *
   * Le nord et le sud du village dépassent les 50 000 nœuds de l'API OSM —
   * mesuré le 30/08, HTTP 400 sur les deux. Trois fenêtres est-ouest les
   * remplacent : le géocodeur place Porcelette à 49,1634 / 6,6596, et le
   * rayon de la recherche « autour » est de douze kilomètres, donc elles
   * tombent toutes dans ce que l'application aurait interrogé.
   */
  const FENETRES_PORCELETTE: readonly Fenetre[] = [
    { nom: 'Porcelette centre', bbox: '6.69,49.11,6.75,49.15' },
    { nom: 'Porcelette ouest', bbox: '6.63,49.11,6.69,49.15' },
    { nom: 'Porcelette est', bbox: '6.75,49.11,6.81,49.15' },
  ]

  it(
    '11 — Porcelette : les trois hypothèses de #321, éprouvées (#321)',
    { timeout: 900_000 },
    async () => {
      titre('#321 — trois PR au village, zéro proposée : pourquoi ?')
      const { relations, chemins, trous } =
        await relationsDesFenetres(FENETRES_PORCELETTE)
      ligne('')
      if (trous.length > 0) ligne(`fenêtres sans réponse : ${trous.join(', ')}`)
      if (relations.length === 0) {
        ligne('Aucune fenêtre n’a répondu : la question reste ouverte.')
        return
      }

      /*
        Hypothèse 1 de l'issue : « les PR ne sont pas des relations, mais des
        chemins balisés que rien ne rassemble ». Elle décidait de tout — si
        elle est vraie, il faut savoir assembler un itinéraire sans relation
        pour dire l'ordre, et c'est un chantier.
      */
      const pedestres = relations.filter((r) =>
        ROUTES_PEDESTRES.has(r.tags['route'] ?? ''),
      )
      const membresChemins = new Set<number>()
      for (const relation of pedestres) {
        for (const membre of relation.membres) {
          if (membre.type === 'way' && membre.ref !== undefined) {
            membresChemins.add(membre.ref)
          }
        }
      }
      const balises = chemins.filter((c) => {
        const tags = c.tags ?? {}
        return (
          tags['osmc:symbol'] !== undefined ||
          /^[lrni]wn$/.test(tags['network'] ?? '')
        )
      })
      const orphelins = balises.filter(
        (c) => c.id !== undefined && !membresChemins.has(c.id),
      )

      /*
        Hypothèse 2 : « des relations sans tag `route` reconnu ». On liste donc
        les valeurs de `route` réellement présentes, plutôt que de supposer.
      */
      const autresRoutes = new Set(
        relations
          .map((r) => r.tags['route'])
          .filter(
            (route): route is string =>
              route !== undefined && !ROUTES_PEDESTRES.has(route),
          ),
      )

      ligne(`relations collectées          : ${String(relations.length)}`)
      ligne(`   dont pédestres             : ${String(pedestres.length)}`)
      ligne(`chemins collectés             : ${String(chemins.length)}`)
      ligne(`   portant un balisage        : ${String(balises.length)}`)
      ligne(`   …hors de toute relation    : ${String(orphelins.length)}`)
      ligne(`autres valeurs de route       : ${[...autresRoutes].join(', ') || '—'}`)
      ligne('')
      for (const relation of pedestres) {
        const chemin = relation.membres.filter((m) => m.type === 'way').length
        const filles = relation.membres.filter((m) => m.type === 'relation').length
        ligne(
          `  r${String(relation.id).padEnd(9)} chemins:${String(chemin).padStart(4)}` +
            ` filles:${String(filles).padStart(2)}  ${(relation.tags['name'] ?? '').slice(0, 42)}`,
        )
      }
      ligne('')
      ligne('À lire, hypothèse par hypothèse :')
      ligne('  1. « des chemins balisés sans relation » — c’est la ligne')
      ligne('     « hors de toute relation ». À zéro, l’hypothèse tombe, et')
      ligne('     avec elle le chantier d’assemblage qu’elle impliquait.')
      ligne('  2. « des relations sans route reconnu » — c’est la ligne des')
      ligne('     autres valeurs. Si elle ne porte que du routier et du')
      ligne('     ferroviaire, il n’y a rien de pédestre à récupérer.')
      ligne('  3. « le géocodage tombe trop loin » — le géocodeur place')
      ligne('     Porcelette à 49,1634 / 6,6596, et ces fenêtres sont à moins')
      ligne('     de six kilomètres. Elles sont donc dans le rayon de douze.')
      ligne('')
      ligne('Si les trois tombent, la donnée n’est pas en cause : c’est notre')
      ligne('chemin de code qu’il faut rejouer sur cette commune.')
    },
  )
})
