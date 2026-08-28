/**
 * Ce que pèserait un découpage communal embarqué — la mesure que #296 attend
 * avant de décider.
 *
 * ```
 * npm run poids-communes
 * ```
 *
 * ## La question, telle que l'issue la pose
 *
 * > combien pèsent 34 945 communes simplifiées à la tolérance qui garde un
 * > point-dans-polygone juste ?
 *
 * Elle ne se répond pas de mémoire : c'est un arbitrage entre un poids de
 * fichier et un taux d'erreur, et le §2 interdit de trancher un tel seuil
 * sans les deux chiffres.
 *
 * ## Ce que ce script mesure
 *
 * Pour chaque tolérance de simplification : le poids brut, le poids gzippé
 * (le seul qui compte pour un téléchargement), le nombre de sommets, et le
 * **taux de désaccord** — la part de points de contrôle que le fichier
 * simplifié range dans une autre commune que le fichier de pleine précision.
 *
 * Les points de contrôle sont tirés au hasard **à l'intérieur** d'une
 * commune, et la vérité de référence est le fichier non simplifié lui-même :
 * la mesure est close, elle ne dépend d'aucune source extérieure.
 *
 * ## Ce qu'il ne mesure pas, et qu'il ne faut pas lui faire dire
 *
 * - La simplification est un Douglas–Peucker **anneau par anneau**, sans
 *   préservation de topologie : deux communes voisines peuvent se chevaucher
 *   ou laisser un interstice. Un outil topologique (TopoJSON, mapshaper)
 *   ferait mieux à tolérance égale. Les taux d'erreur ci-dessous sont donc un
 *   **plancher de qualité**, pas un plafond.
 * - Le tirage est uniforme dans la boîte englobante de chaque commune : il
 *   sur-représente les communes étendues, et ne dit rien de la distribution
 *   réelle des départs de randonnée.
 * - Quatre cents points de contrôle : à 0,5 %, l'incertitude
 *   d'échantillonnage est du même ordre que la valeur.
 */
import { gzipSync } from 'node:zlib'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'

const SOURCE =
  'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/communes.geojson'
const CACHE = '/tmp/communes-france.geojson'

/**
 * Les tolérances éprouvées, en degrés, avec leur équivalent métrique
 * approximatif (1° de latitude ≈ 111 km).
 */
const TOLERANCES = [0.0001, 0.0003, 0.001, 0.003]

/** Points de contrôle. Assez pour un ordre de grandeur, pas pour trois décimales. */
const CONTROLES = 400

/* Graine fixe : deux exécutions doivent rendre les mêmes chiffres. */
let graine = 20260828
function hasard() {
  graine = (graine * 1103515245 + 12345) % 2147483648
  return graine / 2147483648
}

function anneaux(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates]
  if (geom.type === 'MultiPolygon') return geom.coordinates
  return []
}

/**
 * Douglas–Peucker, **itératif** — avec sa propre pile plutôt que celle du
 * moteur.
 *
 * La version récursive naturelle déborde sur les littoraux bretons : un
 * anneau y porte des dizaines de milliers de sommets presque colinéaires, et
 * la récursion descend d'autant. Elle ne tournait qu'avec
 * `node --stack-size=40000`, c'est-à-dire avec un drapeau qui déplace la
 * limite au lieu de la retirer — et qui, dépassé, fait tomber le processus
 * au lieu de lever une erreur. Un script qui n'a pas besoin de drapeau est
 * un script qu'on peut lancer.
 */
function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points
  const garder = new Uint8Array(points.length)
  garder[0] = 1
  garder[points.length - 1] = 1
  const pile = [[0, points.length - 1]]
  while (pile.length) {
    const [debut, fin] = pile.pop()
    if (fin - debut < 2) continue
    const [x1, y1] = points[debut]
    const [x2, y2] = points[fin]
    const dx = x2 - x1
    const dy = y2 - y1
    const norme = Math.hypot(dx, dy)
    let distanceMax = 0
    let indice = -1
    for (let i = debut + 1; i < fin; i += 1) {
      const [x, y] = points[i]
      const d = norme
        ? Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norme
        : Math.hypot(x - x1, y - y1)
      if (d > distanceMax) {
        distanceMax = d
        indice = i
      }
    }
    if (distanceMax > epsilon && indice > 0) {
      garder[indice] = 1
      pile.push([debut, indice], [indice, fin])
    }
  }
  return points.filter((_, i) => garder[i] === 1)
}

function simplifier(geom, epsilon) {
  const anneau = (r) => {
    const s = douglasPeucker(r, epsilon)
    if (s.length < 4) return null
    if (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1]) {
      s.push(s[0])
    }
    return s
  }
  if (geom.type === 'Polygon') {
    const rs = geom.coordinates.map(anneau).filter(Boolean)
    return rs.length ? { type: 'Polygon', coordinates: rs } : null
  }
  if (geom.type === 'MultiPolygon') {
    const ps = geom.coordinates
      .map((poly) => poly.map(anneau).filter(Boolean))
      .filter((rs) => rs.length)
    return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null
  }
  return null
}

function dansAnneau([x, y], anneau) {
  let dedans = false
  for (let i = 0; i < anneau.length - 1; i += 1) {
    const [xa, ya] = anneau[i]
    const [xb, yb] = anneau[i + 1]
    if (ya > y !== yb > y) {
      const xi = ((xb - xa) * (y - ya)) / (yb - ya) + xa
      if (x < xi) dedans = !dedans
    }
  }
  return dedans
}

function dans(point, geom) {
  for (const poly of anneaux(geom)) {
    if (!poly.length) continue
    if (dansAnneau(point, poly[0]) && !poly.slice(1).some((t) => dansAnneau(point, t))) {
      return true
    }
  }
  return false
}

function boite(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of anneaux(geom)) {
    for (const r of poly) {
      for (const [x, y] of r) {
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null
}

function communeDe(point, index) {
  const [x, y] = point
  for (const { code, geom, bbox } of index) {
    if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) continue
    if (dans(point, geom)) return code
  }
  return null
}

function sommets(geom) {
  let n = 0
  for (const poly of anneaux(geom)) for (const r of poly) n += r.length
  return n
}

async function source() {
  if (existsSync(CACHE)) return readFileSync(CACHE)
  process.stderr.write(`Téléchargement de ${SOURCE}\n`)
  const reponse = await fetch(SOURCE)
  if (!reponse.ok) {
    throw new Error(`source injoignable : HTTP ${String(reponse.status)}`)
  }
  const octets = Buffer.from(await reponse.arrayBuffer())
  writeFileSync(CACHE, octets)
  return octets
}

const brutSource = await source()
const collection = JSON.parse(brutSource.toString('utf8'))
const communes = collection.features
  .map((f) => ({
    code: f.properties.code,
    nom: f.properties.nom,
    geom: f.geometry,
    bbox: boite(f.geometry),
  }))
  .filter((c) => c.bbox)

const sommetsTotal = communes.reduce((n, c) => n + sommets(c.geom), 0)

const controles = []
let essais = 0
while (controles.length < CONTROLES && essais < CONTROLES * 100) {
  essais += 1
  const c = communes[Math.floor(hasard() * communes.length)]
  const point = [
    c.bbox[0] + hasard() * (c.bbox[2] - c.bbox[0]),
    c.bbox[1] + hasard() * (c.bbox[3] - c.bbox[1]),
  ]
  if (dans(point, c.geom)) controles.push({ point, code: c.code })
}

const lignes = []
const dire = (l) => {
  lignes.push(l)
  console.log(l)
}

dire(`communes            : ${String(communes.length)}`)
dire(`sommets             : ${sommetsTotal.toLocaleString('fr-FR')}`)
dire(`points de contrôle  : ${String(controles.length)}`)
dire('')
dire('   tolérance |  ≈ mètres |      brut |      gzip |    sommets | désaccord')
dire('-'.repeat(78))
dire(
  `      aucune |         — | ${(brutSource.length / 1e6).toFixed(1).padStart(8)}M | ` +
    `${(gzipSync(brutSource, { level: 9 }).length / 1e6).toFixed(1).padStart(8)}M | ` +
    `${sommetsTotal.toLocaleString('fr-FR').padStart(10)} | référence`,
)

for (const epsilon of TOLERANCES) {
  const simplifiees = []
  let n = 0
  for (const c of communes) {
    const geom = simplifier(c.geom, epsilon)
    if (!geom) continue
    n += sommets(geom)
    simplifiees.push({ code: c.code, geom, bbox: boite(geom) })
  }
  const brut = Buffer.from(
    JSON.stringify({
      type: 'FeatureCollection',
      features: simplifiees.map((c) => ({
        type: 'Feature',
        properties: { code: c.code },
        geometry: c.geom,
      })),
    }),
  )
  const index = simplifiees.filter((c) => c.bbox)
  const faux = controles.filter(
    ({ point, code }) => communeDe(point, index) !== code,
  ).length
  dire(
    `${epsilon.toFixed(4).padStart(12)} | ${String(Math.round(epsilon * 111_000)).padStart(8)}m | ` +
      `${(brut.length / 1e6).toFixed(1).padStart(8)}M | ` +
      `${(gzipSync(brut, { level: 9 }).length / 1e6).toFixed(1).padStart(8)}M | ` +
      `${n.toLocaleString('fr-FR').padStart(10)} | ` +
      `${String(faux)}/${String(controles.length)} (${((100 * faux) / controles.length).toFixed(1)} %)`,
  )
}

/*
  L'autre forme, celle qui ne prétend pas contenir : nom + centre, pour un
  « plus proche » plutôt qu'un « dans ». Ce n'est pas la même promesse, et
  c'est écrit dans l'issue plutôt que déguisé en équivalent.
*/
const centres = communes.map((c) => [
  c.nom,
  Number(((c.bbox[0] + c.bbox[2]) / 2).toFixed(4)),
  Number(((c.bbox[1] + c.bbox[3]) / 2).toFixed(4)),
])
const brutCentres = Buffer.from(JSON.stringify(centres))
dire('')
dire(
  `table nom + centre  : ${(brutCentres.length / 1e6).toFixed(2)} Mo brut, ` +
    `${(gzipSync(brutCentres, { level: 9 }).length / 1e6).toFixed(2)} Mo gzip`,
)
