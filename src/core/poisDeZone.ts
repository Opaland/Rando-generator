import { distanceMeters, distanceToSegmentMeters } from './geo.ts'
import { DETOUR_MAX_METRES } from './poiDistance.ts'
import { itineraryCoords } from './mapdata.ts'
import { MAX_POIS } from './poi.ts'
import type { Itinerary, LonLat, PoiKind, PointOfInterest } from './types.ts'

/**
 * Ce qu'il y a sur le chemin, pour **choisir** (issue #156).
 *
 * Les points d'intérêt sont téléchargés, classés et affichés dans la fiche
 * depuis des semaines. Ils n'ont jamais servi à choisir un itinéraire —
 * seulement à le décrire une fois choisi. « Y a-t-il de l'eau ? » est
 * pourtant la question qu'on se pose en juillet, et la seule information
 * vitale de la liste.
 *
 * ## Une distance, jamais un booléen
 *
 * L'issue demande un filtre « avec de l'eau sur le parcours ». Un booléen
 * serait une **promesse**, et l'issue interdit précisément la promesse : un
 * POI absent d'OpenStreetMap ne veut pas dire qu'il n'y a pas d'eau, il veut
 * dire que personne ne l'a saisi.
 *
 * Ce module rend donc un **détour en mètres**, et `null` quand rien n'a été
 * trouvé — ce qui n'est pas la même chose que « c'est loin ». Le palier
 * (« à moins de 500 m ») est choisi par la personne dans la liste, comme
 * pour la longueur ou la durée. Aucun seuil n'est inventé ici (§2).
 */

/**
 * Les trois catégories qui aident à choisir, et rien d'autre.
 *
 * L'eau parce que c'est la seule information vitale ; l'abri parce que c'est
 * elle qui compte quand le ciel est douteux ; le point de vue parce que
 * c'est souvent la raison d'y aller. Les sommets, cols, vestiges et croix
 * décrivent une sortie, ils ne la font pas choisir — les ajouter allongerait
 * la ligne de chaque itinéraire pour rien.
 */
export const CATEGORIES_RECHERCHEES = ['water', 'shelter', 'viewpoint'] as const

export type CategorieRecherchee = (typeof CATEGORIES_RECHERCHEES)[number]

/** Détour aller-retour, en mètres, ou `null` si rien n'a été trouvé. */
export type DetoursPoi = Record<CategorieRecherchee, number | null>

/**
 * Jusqu'où l'on cherche, de part et d'autre du tracé.
 *
 * **Ce n'est pas un réglage de vitesse, c'est ce qui décide du `null`.** Un
 * POI au-delà de ce rayon n'est pas rendu « loin » : il n'est pas rendu du
 * tout, et l'itinéraire est présenté comme n'ayant pas d'eau.
 *
 * La première version de ce module laissait ce seuil vivre implicitement
 * dans la taille des cellules d'index, avec un commentaire affirmant que
 * « le résultat est le même quelle que soit sa valeur, seule la vitesse
 * change ». C'était faux, et c'est exactement ce que le §4bis décrit : une
 * justification qui a l'air d'expliquer alors qu'elle affirme.
 *
 * La valeur n'est pas inventée non plus (§2) : elle vaut **le plus grand
 * palier que la liste propose**. Chercher moins loin ferait mentir le
 * palier ; chercher plus loin coûterait sans que personne puisse le
 * demander. C'est `DETOURS_PROPOSES` qui commande, et le test le tient.
 */
/**
 * Les paliers qu'on envisagerait de proposer, avant confrontation avec ce que
 * la fiche accepte d'afficher.
 *
 * Le palier de 2 km est celui qui a rendu le lien nécessaire : depuis #318, la
 * fiche n'affiche plus un point d'eau au-delà d'un kilomètre de détour. Le
 * proposer ici aurait promis dans la liste ce que la fiche aurait refusé deux
 * clics plus loin — deux listes qui disent la même règle, et qui ne la disent
 * pas pareil (§4ter).
 */
const PALIERS_ENVISAGES = [250, 500, 1_000, 2_000] as const

/**
 * Ce que la liste propose réellement : les paliers que la fiche tiendra.
 *
 * Filtré et non recopié, pour que remonter `DETOUR_MAX_METRES` remette le
 * palier de 2 km en circulation tout seul. Un commentaire disant « penser à
 * mettre à jour l'autre » n'aurait rien gardé (§6quater).
 */
export const DETOURS_PROPOSES = PALIERS_ENVISAGES.filter(
  (metres) => metres <= DETOUR_MAX_METRES,
)

export const RAYON_DE_RECHERCHE_METERS = Math.max(...DETOURS_PROPOSES) / 2

/**
 * Le côté d'une cellule d'index, en degrés.
 *
 * Dérivé du rayon, et non choisi : une cellule vaut un rayon, donc les neuf
 * cellules voisines couvrent toujours au moins le rayon dans chaque
 * direction. Le degré de longitude rétrécit avec la latitude ; on prend le
 * cas le plus défavorable de la France métropolitaine (51° N), pour que la
 * cellule soit partout au moins aussi large que le rayon.
 */
const DEG_PAR_METRE_LON = 1 / (111_320 * Math.cos((51 * Math.PI) / 180))
const COTE_CELLULE_DEG = RAYON_DE_RECHERCHE_METERS * DEG_PAR_METRE_LON

function cle(lon: number, lat: number): string {
  return `${String(Math.floor(lon / COTE_CELLULE_DEG))}:${String(Math.floor(lat / COTE_CELLULE_DEG))}`
}

/**
 * Distance d'un point au tracé, en mètres.
 *
 * Reprise de `poiDistance.ts` plutôt qu'importée : celle-là s'applique à un
 * tracé unique et à tous ses POI ; ici on interroge un index, et le tracé
 * change à chaque itinéraire. Les deux appellent la même primitive `geo`.
 */
function distanceAuTrace(point: LonLat, trace: LonLat[]): number {
  const [premier, ...suite] = trace
  if (!premier) return Infinity
  if (suite.length === 0) return distanceMeters(point, premier)
  let min = Infinity
  let precedent = premier
  for (const courant of suite) {
    min = Math.min(min, distanceToSegmentMeters(point, precedent, courant))
    precedent = courant
  }
  return min
}

/**
 * Pour chaque itinéraire, le détour du POI le plus proche de chaque
 * catégorie — dans le même ordre que la liste reçue.
 *
 * L'index par cellules n'est pas une optimisation prématurée : cette
 * fonction tourne sur **toute** la zone, dans le fil principal, là où la
 * fiche n'en traitait qu'un itinéraire à la fois. Une comparaison naïve
 * ferait deux cents itinéraires × quatre cents POI × cent points, soit huit
 * millions de distances — et `tests/unit/poisDeZone.test.ts` en tient la
 * mesure.
 */
export function detoursParItineraire(
  itineraires: Itinerary[],
  pois: PointOfInterest[],
): DetoursPoi[] {
  const index = new Map<string, PointOfInterest[]>()
  for (const poi of pois) {
    if (!(CATEGORIES_RECHERCHEES as readonly PoiKind[]).includes(poi.kind)) {
      continue
    }
    const k = cle(poi.lon, poi.lat)
    const seau = index.get(k)
    if (seau) seau.push(poi)
    else index.set(k, [poi])
  }

  return itineraires.map((itineraire) => {
    const coords = itineraryCoords(itineraire)
    const meilleurs: DetoursPoi = { water: null, shelter: null, viewpoint: null }
    if (coords.length === 0) return meilleurs

    // Les cellules touchées par le tracé, et leurs voisines : un POI proche
    // d'un tronçon peut tomber de l'autre côté d'une frontière de cellule.
    const aVoir = new Set<string>()
    for (const [lon, lat] of coords) {
      const cx = Math.floor(lon / COTE_CELLULE_DEG)
      const cy = Math.floor(lat / COTE_CELLULE_DEG)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          aVoir.add(`${String(cx + dx)}:${String(cy + dy)}`)
        }
      }
    }

    const vus = new Set<string>()
    for (const k of aVoir) {
      for (const poi of index.get(k) ?? []) {
        if (vus.has(poi.id)) continue
        vus.add(poi.id)
        const categorie = poi.kind as CategorieRecherchee
        // Le détour est un aller-retour depuis le tracé, à vol d'oiseau —
        // la même convention que la fiche, pour que les deux nombres se
        // comparent.
        const ecart = distanceAuTrace([poi.lon, poi.lat], coords)
        // Le rayon tranche ici, explicitement, et non par un effet de bord
        // de la taille des cellules.
        if (ecart > RAYON_DE_RECHERCHE_METERS) continue
        const detour = ecart * 2
        const actuel = meilleurs[categorie]
        if (actuel === null || detour < actuel) meilleurs[categorie] = detour
      }
    }
    return meilleurs
  })
}

/**
 * Vrai si la réponse d'Overpass a probablement été **tronquée**.
 *
 * `buildPoiQuery` termine par `out center 400` : au-delà, le serveur s'arrête
 * sans rien dire. Sur le tracé d'un seul itinéraire, quatre cents POI sont
 * hors d'atteinte ; sur une zone entière, c'est le cas ordinaire.
 *
 * Une troncature silencieuse est pire qu'une absence : la liste annoncerait
 * « pas d'eau » pour des itinéraires que la requête n'a simplement pas eu la
 * place de couvrir. On ne peut pas l'éviter — c'est le prix d'une requête
 * unique — mais on peut refuser de faire comme si de rien n'était.
 *
 * Le test d'égalité est volontairement strict : Overpass rend exactement le
 * plafond quand il le touche, et un `>=` masquerait un jour un changement de
 * comportement du serveur derrière une condition trop accueillante.
 */
export function reponseTronquee(pois: PointOfInterest[]): boolean {
  return pois.length === MAX_POIS
}
