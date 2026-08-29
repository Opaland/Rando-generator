/**
 * Ce que pèse une tuile IGN, et donc ce que pèse un corridor — la mesure que
 * le bouton « Emporter cette randonnée » attend depuis #153 (issue #397).
 *
 * ```
 * npm run poids-tuiles
 * ```
 *
 * ## La question, telle que le code la pose
 *
 * `src/core/telechargement.ts` porte, en toutes lettres :
 *
 * > Ce qu'il faudrait pour trancher mieux : le poids réel d'une tuile IGN
 * > sur un secteur de montagne.
 *
 * Et `src/components/BoutonEmporter.tsx` en tire la conséquence : faute de
 * cette mesure, il affiche un compte de tuiles et non des mégaoctets,
 * parce qu'annoncer « environ 40 Mo » serait le nombre inventé que
 * CLAUDE.md §2 interdit.
 *
 * Ce script produit le nombre manquant. Il ne décide pas ce que le bouton
 * doit afficher — ça, c'est une décision de rédaction, et elle appartient à
 * l'issue.
 *
 * ## Comment il s'y prend
 *
 * **Il ne recalcule pas le corridor.** Il appelle `tuilesDuCorridor` de
 * `src/core/corridor.ts`, avec `ZOOMS_TERRAIN` et `RAYON_CORRIDOR_METRES`
 * de `src/core/telechargement.ts`, et il construit ses adresses avec
 * `urlDeTuile` et `IGN_TILES`. Un second calcul de la même grandeur est
 * exactement le défaut du §4ter, mesuré à trois exemplaires sur #303 : les
 * tuiles pesées ici sont donc, à l'identique, celles que le bouton
 * téléchargerait.
 *
 * **Il pèse un échantillon des vraies tuiles du corridor**, pas des tuiles
 * voisines choisies à la main. Le tirage est déterministe (graine fixe) :
 * deux exécutions interrogent les mêmes tuiles et doivent rendre les mêmes
 * chiffres tant que l'IGN ne republie pas sa couche.
 *
 * **Il compare deux terrains sur la même forme.** La même trace est pesée
 * là où elle est — une boucle de la Métropole de Lyon, `gid` 5, tirée de
 * `tests/fixtures/boucles/metropole.json` — puis translatée en Chartreuse.
 *
 * La comparaison porte sur le **poids moyen d'une tuile, zoom par zoom**, et
 * pas sur les totaux. La première version de ce script affirmait « même
 * forme, donc même nombre de tuiles » et le vérifiait ; l'assertion a
 * échoué, 69 contre 66, et elle avait raison contre moi. Une translation
 * change la latitude, donc `metresParPixel`, donc la largeur d'une tuile en
 * mètres, donc le nombre de tuiles qu'un corridor de 500 m déborde de part
 * et d'autre. Comparer deux totaux, ce serait mêler cet effet-là à celui du
 * sol.
 *
 * ## Ce qu'il ne mesure pas, et qu'il ne faut pas lui faire dire
 *
 * - **Un échantillon n'est pas un inventaire.** Le total par zoom est
 *   `compte × moyenne de l'échantillon` ; l'écart-type affiché dit ce que
 *   cette moyenne vaut. Sur des zooms où les tuiles vont de 22 ko à 116 ko,
 *   ce n'est pas une décimale près.
 * - **Une translation n'est pas une randonnée.** La trace déplacée en
 *   Chartreuse traverse ce qu'elle traverse ; elle ne suit aucun sentier.
 *   Elle sert à peser un sol, pas à décrire un parcours.
 * - **Rien ici ne dit ce que le navigateur garde.** Le cache de tuiles a sa
 *   propre éviction, et une tuile déjà vue ne se retéléchargera pas.
 * - **Le profil altimétrique n'est pas pesé.** `ressourcesDeLaRandonnee`
 *   rend une adresse d'altimétrie en plus des tuiles ; elle est comptée à
 *   part parce qu'elle ne dépend pas du zoom.
 */
import { readFileSync } from 'node:fs'
import {
  tuilesDuCorridor,
  urlDeTuile,
  cleTuile,
} from '../src/core/corridor.ts'
import {
  ZOOMS_TERRAIN,
  RAYON_CORRIDOR_METRES,
} from '../src/core/telechargement.ts'
import { IGN_TILES } from '../src/components/map/style.ts'
import { formatOctets } from '../src/lib/format.ts'

/** Tuiles pesées par zoom. Assez pour une moyenne, pas pour trois décimales. */
const ECHANTILLON_PAR_ZOOM = 12

/** Pause entre deux requêtes : on interroge un service public. */
const PAUSE_MS = 120

/**
 * Le centre du secteur de montagne où la trace est translatée.
 *
 * La Chartreuse parce que c'est le cas que l'issue nomme — « un secteur de
 * montagne » — et parce qu'elle est couverte par le MNT de l'IGN, ce que
 * #355 a montré ne pas être vrai partout.
 */
const CHARTREUSE = { lon: 5.83, lat: 45.35 }

/* Graine fixe : deux exécutions doivent peser les mêmes tuiles. */
let graine = 20260829
function hasard() {
  graine = (graine * 1103515245 + 12345) % 2147483648
  return graine / 2147483648
}

/** La trace de référence, telle que le dépôt la porte déjà. */
function traceDeReference() {
  const brut = JSON.parse(
    readFileSync(
      new URL('../tests/fixtures/boucles/metropole.json', import.meta.url),
      'utf8',
    ),
  )
  const boucle = brut.features.find((f) => f.properties.gid === 5)
  if (!boucle) throw new Error('La boucle gid=5 a disparu de la fixture.')
  const coords = boucle.geometry.coordinates.flat()
  if (coords.length < 2) {
    throw new Error(`Trace trop courte : ${String(coords.length)} points.`)
  }
  return { nom: boucle.properties.nom, coords }
}

/** La même trace, posée ailleurs : même forme, autre sol. */
function translatee(coords, vers) {
  let lonMin = Infinity
  let lonMax = -Infinity
  let latMin = Infinity
  let latMax = -Infinity
  for (const [lon, lat] of coords) {
    lonMin = Math.min(lonMin, lon)
    lonMax = Math.max(lonMax, lon)
    latMin = Math.min(latMin, lat)
    latMax = Math.max(latMax, lat)
  }
  const dLon = vers.lon - (lonMin + lonMax) / 2
  const dLat = vers.lat - (latMin + latMax) / 2
  return coords.map(([lon, lat]) => [lon + dLon, lat + dLat])
}

/** Les tuiles du corridor, groupées par zoom — par le chemin du dépôt. */
function corridorParZoom(coords) {
  const tuiles = tuilesDuCorridor(coords, {
    zooms: ZOOMS_TERRAIN,
    rayonMetres: RAYON_CORRIDOR_METRES,
  })
  const parZoom = new Map(ZOOMS_TERRAIN.map((z) => [z, []]))
  for (const tuile of tuiles) parZoom.get(tuile.z).push(tuile)
  return parZoom
}

/** Un tirage sans remise, déterministe. */
function echantillon(liste, combien) {
  const copie = [...liste]
  const tire = []
  while (tire.length < combien && copie.length > 0) {
    tire.push(copie.splice(Math.floor(hasard() * copie.length), 1)[0])
  }
  return tire
}

/**
 * Combien de tuiles d'un échantillon doivent répondre pour qu'on croie la
 * moyenne.
 *
 * La première version faisait échouer tout le script au premier refus. Une
 * exécution s'est arrêtée sur un HTTP 400 isolé, sur une tuile que la
 * minute d'avant avait servie : un service public a des hoquets, et rendre
 * la mesure impossible pour un hoquet n'est pas de la rigueur.
 *
 * Mais avaler les échecs ne l'est pas davantage — une moyenne calculée sur
 * ce qui a bien voulu répondre est une moyenne biaisée que rien n'annonce.
 * D'où ce plancher : les trous sont comptés, affichés sous le tableau, et
 * au-delà de la moitié de l'échantillon la mesure s'arrête en le disant.
 */
const REPONSES_MINIMALES = ECHANTILLON_PAR_ZOOM / 2

/**
 * Le poids d'une tuile, en octets reçus, ou `null` si elle n'a pas répondu.
 *
 * Une seule reprise, après une pause : elle distingue un hoquet d'une
 * indisponibilité, et deux refus de suite n'ont plus rien d'accidentel.
 */
async function peser(tuile) {
  const url = urlDeTuile(tuile, IGN_TILES)
  for (const tentative of [1, 2]) {
    const reponse = await fetch(url)
    if (reponse.ok) return (await reponse.arrayBuffer()).byteLength
    if (tentative === 1) await new Promise((r) => setTimeout(r, 1000))
    else {
      console.error(
        `  (tuile ${cleTuile(tuile)} : HTTP ${String(reponse.status)} deux fois)`,
      )
    }
  }
  return null
}

function moyenne(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function ecartType(xs) {
  const m = moyenne(xs)
  return Math.sqrt(moyenne(xs.map((x) => (x - m) ** 2)))
}

/*
  Pas de mise en forme maison : `formatOctets` est celle que le bouton
  affiche pendant le téléchargement, et deux façons d'écrire un poids dans
  le même dépôt sont deux listes qui disent la même règle (§4ter).
*/
const mo = formatOctets

async function pesee(titre, coords) {
  const parZoom = corridorParZoom(coords)
  const moyennes = new Map()
  console.log(`\n## ${titre}`)
  console.log(
    '\n| zoom | tuiles | pesées | moyenne | écart-type |     min |     max |   total |',
  )
  console.log(
    '|-----:|-------:|-------:|--------:|-----------:|--------:|--------:|--------:|',
  )
  let total = 0
  let comptees = 0
  let manquantes = 0
  for (const z of ZOOMS_TERRAIN) {
    const tuiles = parZoom.get(z)
    const tires = echantillon(tuiles, ECHANTILLON_PAR_ZOOM)
    const poids = []
    for (const tuile of tires) {
      const octets = await peser(tuile)
      if (octets !== null) poids.push(octets)
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    }
    if (poids.length < Math.min(REPONSES_MINIMALES, tuiles.length)) {
      throw new Error(
        `Zoom ${String(z)} : ${String(poids.length)} tuiles pesées sur ` +
          `${String(tires.length)} demandées. Ce n'est plus un hoquet, ` +
          `c'est une indisponibilité — la moyenne ne vaudrait rien.`,
      )
    }
    manquantes += tires.length - poids.length
    const m = moyenne(poids)
    moyennes.set(z, m)
    const sousTotal = m * tuiles.length
    total += sousTotal
    comptees += tuiles.length
    console.log(
      `| ${String(z).padStart(4)} | ${String(tuiles.length).padStart(6)} | ` +
        `${String(poids.length).padStart(6)} | ${Math.round(m).toLocaleString('fr-FR').padStart(7)} | ` +
        `${Math.round(ecartType(poids)).toLocaleString('fr-FR').padStart(10)} | ` +
        `${Math.min(...poids).toLocaleString('fr-FR').padStart(7)} | ` +
        `${Math.max(...poids).toLocaleString('fr-FR').padStart(7)} | ` +
        `${mo(sousTotal).padStart(7)} |`,
    )
  }
  console.log(
    `\n**${String(comptees)} tuiles, ${mo(total)} estimés** ` +
      `(somme des compte × moyenne échantillonnée par zoom).`,
  )
  if (manquantes > 0) {
    console.log(
      `\n${String(manquantes)} tuile(s) de l'échantillon n'ont pas répondu ` +
        `et ne comptent dans aucune moyenne.`,
    )
  }
  return { comptees, total, moyennes }
}

const { nom, coords } = traceDeReference()
console.log(`# Le poids d'un corridor, mesuré (issue #397)`)
console.log(
  `\nTrace de référence : « ${nom} », ${String(coords.length)} points, ` +
    `corridor de ${String(RAYON_CORRIDOR_METRES)} m, ` +
    `zooms ${ZOOMS_TERRAIN.join(', ')}.`,
)

const ville = await pesee('Là où elle est — Métropole de Lyon', coords)
const montagne = await pesee(
  'La même trace, translatée en Chartreuse',
  translatee(coords, CHARTREUSE),
)

console.log(`\n## Ce que le terrain change, zoom par zoom`)
console.log(`\n| zoom | ville | montagne | écart |`)
console.log(`|-----:|------:|---------:|------:|`)
for (const z of ZOOMS_TERRAIN) {
  const a = ville.moyennes.get(z)
  const b = montagne.moyennes.get(z)
  const ecart = (b / a - 1) * 100
  console.log(
    `| ${String(z).padStart(4)} | ${Math.round(a).toLocaleString('fr-FR').padStart(5)} | ` +
      `${Math.round(b).toLocaleString('fr-FR').padStart(8)} | ` +
      `${(ecart >= 0 ? '+' : '') + ecart.toFixed(0)} % |`,
  )
}

console.log(
  `\nLes deux corridors ne portent pas le même nombre de tuiles ` +
    `(${String(ville.comptees)} contre ${String(montagne.comptees)}) : ` +
    `la translation change la latitude, donc la largeur d'une tuile en ` +
    `mètres, donc le débordement du corridor. Les totaux — ` +
    `${mo(ville.total)} et ${mo(montagne.total)} — décrivent chacun leur ` +
    `corridor et ne se comparent pas entre eux.`,
)
