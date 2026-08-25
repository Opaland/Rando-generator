import { useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import {
  ALL_FILTERS,
  effortEstime,
  itineraryFacts,
  libelleEffort,
  matchesFilters,
  type DiscoveryFilters,
} from '../core/discovery.ts'
import { assessItinerary, hasGaps } from '../core/dataQuality.ts'
import { isCompleted } from '../core/milestones.ts'
import type { LonLat, Network } from '../core/types.ts'
import {
  displayName,
  formatDuration,
  formatKm,
  formatPct,
} from '../lib/format.ts'
import { NETWORK_BADGES } from '../lib/networkDisplay.ts'
import {
  DETOURS_PROPOSES,
  detoursParItineraire,
  type DetoursPoi,
} from '../core/poisDeZone.ts'
import { lireIntention } from '../core/intention.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryList.module.css'

type SortKey = 'pct' | 'name' | 'length' | 'duration'

/** « 320 m » ou « 1,2 km » — la précision au mètre n'aide personne ici. */
function formatDetourCourt(metres: number): string {
  if (metres < 1_000) return `${String(Math.round(metres / 10) * 10)} m`
  return `${(metres / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

/**
 * Les réseaux filtrables. Écrite à la main et non dérivée du type : `PERSO`
 * n'a rien à faire ici — les itinéraires persos ont leur propre section.
 *
 * `INCONNU` y figure au contraire, et c'est tout l'intérêt du #284 : pouvoir
 * demander « montre-moi ce dont on ne sait rien » — ou l'inverse, ne garder
 * que ce qui est déclaré balisé avant de choisir sa sortie du dimanche.
 *
 * `tests/unit/reseauxFiltrables.test.ts` garde cette liste : TypeScript ne
 * voit rien passer quand un réseau s'ajoute au type sans s'ajouter ici, et
 * c'est exactement le mode d'échec du §4 — une condition transverse recopiée
 * à la main plutôt que nommée.
 */
const NETWORKS: Network[] = ['GR', 'GRP', 'PR', 'LOCAL', 'INCONNU']

interface Plage {
  label: string
  minKm: number | null
  maxKm: number | null
}

const TOUTES_LONGUEURS: Plage = { label: 'toutes', minKm: null, maxKm: null }

const LONGUEURS: Plage[] = [
  TOUTES_LONGUEURS,
  { label: 'moins de 5 km', minKm: null, maxKm: 5 },
  { label: '5 à 10 km', minKm: 5, maxKm: 10 },
  { label: '10 à 20 km', minKm: 10, maxKm: 20 },
  { label: 'plus de 20 km', minKm: 20, maxKm: null },
]

const DUREES: { label: string; minutes: number | null }[] = [
  { label: 'peu importe', minutes: null },
  { label: 'moins d’1 h', minutes: 60 },
  { label: 'moins de 2 h', minutes: 120 },
  { label: 'moins de 3 h', minutes: 180 },
  { label: 'moins de 4 h', minutes: 240 },
  { label: 'moins de 6 h', minutes: 360 },
]

const DENIVELES: { label: string; gain: number | null }[] = [
  { label: 'peu importe', gain: null },
  { label: 'moins de 100 m', gain: 100 },
  { label: 'moins de 300 m', gain: 300 },
  { label: 'moins de 600 m', gain: 600 },
  { label: 'moins de 1 000 m', gain: 1_000 },
]

const PROXIMITES: { label: string; km: number | null }[] = [
  { label: 'partout', km: null },
  { label: 'à moins de 5 km', km: 5 },
  { label: 'à moins de 10 km', km: 10 },
  { label: 'à moins de 25 km', km: 25 },
  { label: 'à moins de 50 km', km: 50 },
]

/**
 * Le libellé de l'option « d'après votre question ».
 *
 * Elle dit le nombre lu, pas un palier approchant : c'est tout l'intérêt de
 * ne pas ranger « moins de 12 km » dans « 10 à 20 km ».
 */
function libelleQuestion(
  pose: Partial<DiscoveryFilters>,
  champ: ChampPilote,
): string | null {
  if (champ === 'longueur') {
    if (pose.minKm != null && pose.maxKm != null)
      return `${String(pose.minKm)} à ${String(pose.maxKm)} km`
    if (pose.maxKm != null) return `moins de ${String(pose.maxKm)} km`
    if (pose.minKm != null) return `plus de ${String(pose.minKm)} km`
    return null
  }
  if (champ === 'duree')
    return pose.maxMinutes == null
      ? null
      : `moins de ${String(pose.maxMinutes)} min`
  if (champ === 'denivele')
    return pose.maxGain == null ? null : `moins de ${String(pose.maxGain)} m`
  return pose.maxAwayKm == null
    ? null
    : `à moins de ${String(pose.maxAwayKm)} km`
}

/** Les quatre listes qu'une question peut piloter. */
const CHAMPS_PILOTES = ['longueur', 'duree', 'denivele', 'proximite'] as const
type ChampPilote = (typeof CHAMPS_PILOTES)[number]

/**
 * Les champs de `DiscoveryFilters` derrière chaque liste.
 *
 * Une table plutôt que quatre `if` recopiés : la longueur en tient deux, et
 * une garde transverse se nomme (CLAUDE.md §4).
 */
const CHAMPS_LIBRES = [
  'minKm',
  'maxKm',
  'maxMinutes',
  'maxGain',
  'maxAwayKm',
] as const

const CHAMPS_DU_PILOTE: Record<
  ChampPilote,
  readonly (typeof CHAMPS_LIBRES)[number][]
> = {
  longueur: ['minKm', 'maxKm'],
  duree: ['maxMinutes'],
  denivele: ['maxGain'],
  proximite: ['maxAwayKm'],
}

/** Convertit la valeur d'un <select> d'index en index sûr. */
function toIndex(value: string, length: number): number {
  const index = Number(value)
  return Number.isInteger(index) && index >= 0 && index < length ? index : 0
}

export function ItineraryList() {
  const itineraries = useAppStore((s) => s.itineraries)
  const poisZone = useAppStore((s) => s.poisZone)
  const poisZoneLoading = useAppStore((s) => s.poisZoneLoading)
  const poisZoneTronque = useAppStore((s) => s.poisZoneTronque)
  const chargerPoisDeLaZone = useAppStore((s) => s.chargerPoisDeLaZone)
  const matching = useAppStore((s) => s.matching)
  const selectedItineraryId = useAppStore((s) => s.selectedItineraryId)
  const selectItinerary = useAppStore((s) => s.selectItinerary)
  const seuilBoucle = useAppStore((s) => s.completionPct)
  const userPosition = useAppStore((s) => s.userPosition)

  const [query, setQuery] = useState('')
  const [networks, setNetworks] = useState<Set<Network>>(new Set(NETWORKS))
  const [sortKey, setSortKey] = useState<SortKey>('pct')
  const [longueurIndex, setLongueurIndex] = useState(0)
  const [dureeIndex, setDureeIndex] = useState(0)
  const [deniveleIndex, setDeniveleIndex] = useState(0)
  const [proximiteIndex, setProximiteIndex] = useState(0)
  const [shape, setShape] = useState<DiscoveryFilters['shape']>('all')
  const [sol, setSol] = useState<DiscoveryFilters['sol']>('all')
  /**
   * Le palier de détour choisi, ou `null` pour « peu importe » (issue #156).
   *
   * C'est bien la personne qui le choisit, comme pour la longueur ou la
   * durée. Un booléen « avec de l'eau » serait une promesse, et l'issue
   * l'interdit : un POI absent d'OpenStreetMap ne veut pas dire qu'il n'y a
   * pas d'eau, il veut dire que personne ne l'a saisi.
   */
  const [detourEau, setDetourEau] = useState<number | null>(null)

  /**
   * Ce qu'une question en toutes lettres a posé (pierre 0 de
   * `docs/IA_LOCALE.md`).
   *
   * **Pourquoi un état à part plutôt que des index de paliers.** Les
   * paliers de longueur sont des tranches — « 5 à 10 km », « 10 à 20 km ».
   * « Moins de 12 km » ne rentre dans aucune : la ranger dans « 10 à 20 km »
   * écarterait les randos de trois kilomètres que personne n'a exclues, et
   * la ranger dans « moins de 10 km » couperait à douze. Les deux mentent.
   *
   * Le filtre, lui, accepte des nombres libres : c'est le `<select>` qui est
   * une commodité, pas la donnée. La question écrit donc les nombres, et
   * chaque `<select>` concerné gagne une option « d'après votre question »
   * tant qu'elle le pilote — pour que le panneau montre **exactement** ce
   * qui s'applique. Choisir un palier à la main reprend la main.
   */
  const [depuisQuestion, setDepuisQuestion] =
    useState<Partial<DiscoveryFilters> | null>(null)
  const [question, setQuestion] = useState('')
  const [incompris, setIncompris] = useState<string[]>([])

  const lancerLaQuestion = (texte: string) => {
    const lue = lireIntention(texte)
    if (lue.compris.length === 0) {
      setDepuisQuestion(null)
      setIncompris(lue.incompris)
      return
    }
    /*
      `shape` et `sol` ont des options exactes dans leurs listes : la
      question les y pose directement. Les cinq autres sont des nombres
      libres, qu'aucun palier ne représente forcément.

      Une boucle sur la table plutôt que cinq `else if` recopiés : ils
      disaient la même chose cinq fois, et le cinquième était de toute façon
      inatteignable pour le vérificateur de types. `lue.filtres` part de
      `ALL_FILTERS`, tout à `null` — seul ce qu'une règle a posé en sort.
    */
    setShape(lue.filtres.shape)
    setSol(lue.filtres.sol)
    const pose: Partial<DiscoveryFilters> = {}
    for (const clef of CHAMPS_LIBRES) {
      const valeur = lue.filtres[clef]
      if (valeur !== null) pose[clef] = valeur
    }
    setDepuisQuestion(Object.keys(pose).length > 0 ? pose : null)
    setIncompris(lue.incompris)
  }

  /**
   * Rendre la main sur un champ que la question tenait.
   *
   * Les deux bornes de longueur partent ensemble : une question qui a posé
   * « entre 8 et 12 km » ne laisse pas un minimum orphelin quand on choisit
   * un palier à la main.
   *
   * On reconstruit l'objet à partir des clés qu'on garde, plutôt que de
   * poser `undefined` : `exactOptionalPropertyTypes` refuse la seconde
   * façon, et il a raison — « absent » et « présent et indéfini » ne sont
   * pas la même chose quand on étale l'objet sur les filtres.
   */
  const reprendreLaMain = (champ: ChampPilote) => {
    setDepuisQuestion((avant) => {
      if (!avant) return avant
      const gardees = CHAMPS_PILOTES.filter((c) => c !== champ).flatMap(
        (c) => CHAMPS_DU_PILOTE[c],
      )
      const apres: Partial<DiscoveryFilters> = {}
      for (const clef of gardees) {
        const valeur = avant[clef]
        if (valeur !== undefined) apres[clef] = valeur
      }
      return Object.keys(apres).length > 0 ? apres : null
    })
  }

  const resultById = useMemo(
    () => new Map((matching?.results ?? []).map((r) => [r.itineraryId, r])),
    [matching],
  )

  /**
   * Le détour du POI le plus proche, par itinéraire.
   *
   * Vide tant que personne n'a demandé les POI de la zone : la recherche
   * coûte une requête Overpass, et rien ne la déclenche tout seul.
   */
  const detoursById = useMemo(() => {
    if (poisZone.length === 0) return new Map<number, DetoursPoi>()
    const detours = detoursParItineraire(itineraries, poisZone)
    return new Map(
      itineraries.map((itin, i) => [
        itin.osmRelationId,
        detours[i] ?? { water: null, shelter: null, viewpoint: null },
      ]),
    )
  }, [itineraries, poisZone])

  const filters = useMemo<DiscoveryFilters>(() => {
    const plage = LONGUEURS[longueurIndex] ?? TOUTES_LONGUEURS
    return {
      ...ALL_FILTERS,
      minKm: plage.minKm,
      maxKm: plage.maxKm,
      maxMinutes: DUREES[dureeIndex]?.minutes ?? null,
      maxGain: DENIVELES[deniveleIndex]?.gain ?? null,
      maxAwayKm: PROXIMITES[proximiteIndex]?.km ?? null,
      shape,
      sol,
      // Ce que la question a posé l'emporte sur le palier, et seulement sur
      // les champs qu'elle a posés : elle n'efface rien d'autre.
      ...depuisQuestion,
    }
  }, [
    longueurIndex,
    dureeIndex,
    deniveleIndex,
    proximiteIndex,
    shape,
    sol,
    depuisQuestion,
  ])

  const filtresActifs =
    filters.minKm !== null ||
    filters.maxKm !== null ||
    filters.maxMinutes !== null ||
    filters.maxGain !== null ||
    filters.maxAwayKm !== null ||
    filters.shape !== 'all' ||
    filters.sol !== 'all'

  // Le GPS bouge en permanence — un relevé par seconde en marchant. Arrondir
  // la position ne suffisait pas : le tableau était recréé à chaque relevé,
  // donc les mémoïsations en aval tombaient quand même. On dépend des deux
  // nombres arrondis, qui eux ne changent que tous les ~100 m parcourus.
  const proximiteActive = filters.maxAwayKm !== null
  const lonArrondi =
    userPosition && proximiteActive
      ? Math.round(userPosition.lon * 1_000) / 1_000
      : null
  const latArrondi =
    userPosition && proximiteActive
      ? Math.round(userPosition.lat * 1_000) / 1_000
      : null
  const depuis = useMemo<LonLat | null>(
    () =>
      lonArrondi !== null && latArrondi !== null
        ? [lonArrondi, latArrondi]
        : null,
    [lonArrondi, latArrondi],
  )

  // Géométrie trouée : le seul défaut de donnée qui mérite d'être vu sans
  // ouvrir la fiche, parce qu'il fausse le pourcentage affiché juste à côté.
  const trouesById = useMemo(() => {
    const maintenant = new Date().toISOString()
    return new Map(
      itineraries.map((itin) => [
        itin.osmRelationId,
        hasGaps(assessItinerary(itin, maintenant)),
      ]),
    )
  }, [itineraries])

  const factsById = useMemo(
    () =>
      new Map(
        itineraries.map((itin) => [
          itin.osmRelationId,
          itineraryFacts(itin, depuis),
        ]),
      ),
    [itineraries, depuis],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = itineraries.filter((itin) => {
      /*
        Le palier d'eau (issue #156). Écarter un itinéraire sans détour connu
        n'est pas dire qu'il n'a pas d'eau : c'est dire qu'on n'en a pas
        trouvé dans le rayon examiné. La phrase sous la liste le rappelle,
        parce que le filtre seul ne peut pas le dire.
      */
      if (detourEau !== null) {
        const eau = detoursById.get(itin.osmRelationId)?.water
        if (eau === null || eau === undefined || eau > detourEau) return false
      }
      if (!networks.has(itin.network)) return false
      const facts = factsById.get(itin.osmRelationId)
      if (facts && !matchesFilters(facts, filters)) return false
      if (!normalizedQuery) return true
      return `${itin.ref ?? ''} ${itin.name ?? ''}`
        .toLowerCase()
        .includes(normalizedQuery)
    })
    const pctOf = (id: number) => resultById.get(id)?.pct ?? 0
    const minutesOf = (id: number) => factsById.get(id)?.minutes ?? 0
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'pct':
          return (
            pctOf(b.osmRelationId) - pctOf(a.osmRelationId) ||
            displayName(a).localeCompare(displayName(b), 'fr')
          )
        case 'length':
          return b.totalMeters - a.totalMeters
        case 'duration':
          return minutesOf(a.osmRelationId) - minutesOf(b.osmRelationId)
        case 'name':
          return displayName(a).localeCompare(displayName(b), 'fr')
      }
    })
  }, [
    itineraries,
    query,
    networks,
    sortKey,
    resultById,
    factsById,
    filters,
    detourEau,
    detoursById,
  ])

  if (itineraries.length === 0) return null

  const toggleNetwork = (network: Network) => {
    setNetworks((prev) => {
      const next = new Set(prev)
      if (next.has(network)) next.delete(network)
      else next.add(network)
      return next
    })
  }

  const reinitialiser = () => {
    setLongueurIndex(0)
    setDureeIndex(0)
    setDeniveleIndex(0)
    setProximiteIndex(0)
    setShape('all')
    setDepuisQuestion(null)
    setQuestion('')
    setIncompris([])
  }

  return (
    <details className={styles.section} open>
      <summary className="acc-summary">
        <h2 id="list-title" className={styles.title}>
          Itinéraires ({rows.length})
        </h2>
      </summary>

      <div className={styles.filters}>
        <input
          type="search"
          className={styles.search}
          placeholder="Filtrer par nom ou ref…"
          aria-label="Filtrer les itinéraires par texte"
          data-testid="list-filter"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
        />
        <div
          className={styles.networkFilters}
          role="group"
          aria-label="Filtrer par réseau"
        >
          {NETWORKS.map((network) => (
            <label key={network} className={styles.networkToggle}>
              <input
                type="checkbox"
                checked={networks.has(network)}
                onChange={() => {
                  toggleNetwork(network)
                }}
              />
              {NETWORK_BADGES[network]}
            </label>
          ))}
        </div>
        <label className={styles.sort}>
          Trier par{' '}
          <select
            value={sortKey}
            data-testid="list-sort"
            onChange={(e) => {
              setSortKey(e.target.value as SortKey)
            }}
          >
            <option value="pct">progression</option>
            <option value="name">nom</option>
            <option value="length">longueur</option>
            <option value="duration">durée</option>
          </select>
        </label>
      </div>

      <details className={styles.discovery} data-testid="discovery-filters">
        <summary className={styles.discoverySummary}>
          Trouver une sortie{filtresActifs ? ' — filtres actifs' : ''}
        </summary>
        {/*
          La question en toutes lettres (pierre 0 de `docs/IA_LOCALE.md`).

          Elle ne remplace pas les paliers, elle les remplit : ce qui est
          compris se voit dans les listes juste en dessous, et **ce qui ne
          l'est pas est écrit**. Un lecteur de langage naturel qui tait ce
          qu'il a ignoré ment par omission — et sur un sentier, on suit ce
          que l'écran dit.

          Aucun modèle, aucun téléchargement, aucun appel réseau : des règles
          de lecture, dans `src/core/intention.ts`. La recherche sémantique
          de la note d'architecture reste devant nous, et elle se jugera
          contre celle-ci.
        */}
        <form
          className={styles.question}
          onSubmit={(e) => {
            e.preventDefault()
            lancerLaQuestion(question)
          }}
        >
          <label className={styles.sort}>
            Ou dites-le en une phrase{' '}
            <input
              type="search"
              data-testid="list-question"
              placeholder="une boucle facile de moins de 10 km…"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value)
              }}
            />
          </label>
          <button type="submit" data-testid="list-question-ok">
            Appliquer
          </button>
        </form>
        {incompris.length > 0 && (
          <p className={styles.hint} data-testid="question-incompris">
            Je n’ai pas su quoi faire de : {incompris.join(', ')}. Le reste de
            votre phrase est dans les listes ci-dessous.
          </p>
        )}
        <div className={styles.discoveryGrid}>
          <label className={styles.sort}>
            Longueur{' '}
            <select
              value={
                libelleQuestion(depuisQuestion ?? {}, 'longueur') !== null
                  ? 'question'
                  : longueurIndex
              }
              data-testid="list-length"
              onChange={(e) => {
                reprendreLaMain('longueur')
                setLongueurIndex(toIndex(e.target.value, LONGUEURS.length))
              }}
            >
              {/*
                L'option n'existe que tant que la question tient ce champ.
                La laisser en permanence donnerait un choix qui ne veut rien
                dire, et la retirer sans reprendre la main afficherait un
                palier qui n'est pas celui qui s'applique.
              */}
              {libelleQuestion(depuisQuestion ?? {}, 'longueur') !== null && (
                <option value="question">
                  d’après votre phrase :{' '}
                  {libelleQuestion(depuisQuestion ?? {}, 'longueur')}
                </option>
              )}
              {LONGUEURS.map((plage, index) => (
                <option key={plage.label} value={index}>
                  {plage.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.sort}>
            Durée{' '}
            <select
              value={
                libelleQuestion(depuisQuestion ?? {}, 'duree') !== null
                  ? 'question'
                  : dureeIndex
              }
              data-testid="list-duration"
              onChange={(e) => {
                reprendreLaMain('duree')
                setDureeIndex(toIndex(e.target.value, DUREES.length))
              }}
            >
              {/*
                L'option n'existe que tant que la question tient ce champ.
                La laisser en permanence donnerait un choix qui ne veut rien
                dire, et la retirer sans reprendre la main afficherait un
                palier qui n'est pas celui qui s'applique.
              */}
              {libelleQuestion(depuisQuestion ?? {}, 'duree') !== null && (
                <option value="question">
                  d’après votre phrase :{' '}
                  {libelleQuestion(depuisQuestion ?? {}, 'duree')}
                </option>
              )}
              {DUREES.map((duree, index) => (
                <option key={duree.label} value={index}>
                  {duree.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.sort}>
            Dénivelé{' '}
            <select
              value={
                libelleQuestion(depuisQuestion ?? {}, 'denivele') !== null
                  ? 'question'
                  : deniveleIndex
              }
              data-testid="list-gain"
              onChange={(e) => {
                reprendreLaMain('denivele')
                setDeniveleIndex(toIndex(e.target.value, DENIVELES.length))
              }}
            >
              {/*
                L'option n'existe que tant que la question tient ce champ.
                La laisser en permanence donnerait un choix qui ne veut rien
                dire, et la retirer sans reprendre la main afficherait un
                palier qui n'est pas celui qui s'applique.
              */}
              {libelleQuestion(depuisQuestion ?? {}, 'denivele') !== null && (
                <option value="question">
                  d’après votre phrase :{' '}
                  {libelleQuestion(depuisQuestion ?? {}, 'denivele')}
                </option>
              )}
              {DENIVELES.map((denivele, index) => (
                <option key={denivele.label} value={index}>
                  {denivele.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.sort}>
            Forme{' '}
            <select
              value={shape}
              data-testid="list-shape"
              onChange={(e) => {
                setShape(e.target.value as DiscoveryFilters['shape'])
              }}
            >
              <option value="all">peu importe</option>
              <option value="loop">boucles</option>
              <option value="linear">allers simples</option>
            </select>
          </label>
          {/*
            Le sol (issue #179). Le libellé dit ce que le filtre fait
            vraiment : « entièrement dur ou stabilisé », et non « accessible »
            — un mot qui promettrait un jugement qu'on n'est pas en mesure de
            porter, et dont Nadia s'est déjà méfiée à raison.
          */}
          <label className={styles.sort}>
            Sol{' '}
            <select
              value={sol}
              data-testid="list-sol"
              onChange={(e) => {
                setSol(e.target.value as DiscoveryFilters['sol'])
              }}
            >
              <option value="all">peu importe</option>
              <option value="roulant">entièrement dur ou stabilisé</option>
            </select>
          </label>
          <label className={styles.sort}>
            Proximité{' '}
            <select
              value={
                libelleQuestion(depuisQuestion ?? {}, 'proximite') !== null
                  ? 'question'
                  : proximiteIndex
              }
              data-testid="list-nearby"
              onChange={(e) => {
                reprendreLaMain('proximite')
                setProximiteIndex(toIndex(e.target.value, PROXIMITES.length))
              }}
            >
              {/*
                L'option n'existe que tant que la question tient ce champ.
                La laisser en permanence donnerait un choix qui ne veut rien
                dire, et la retirer sans reprendre la main afficherait un
                palier qui n'est pas celui qui s'applique.
              */}
              {libelleQuestion(depuisQuestion ?? {}, 'proximite') !== null && (
                <option value="question">
                  d’après votre phrase :{' '}
                  {libelleQuestion(depuisQuestion ?? {}, 'proximite')}
                </option>
              )}
              {PROXIMITES.map((proximite, index) => (
                <option key={proximite.label} value={index}>
                  {proximite.label}
                </option>
              ))}
            </select>
          </label>
          {/*
            Ce qu'il y a sur le chemin (issue #156).

            Le bouton est explicite parce que la recherche coûte une requête
            Overpass de plus. Rien ne la déclenche tout seul : #283 a montré
            ce que coûte une requête que personne n'a demandée — quand elle
            échoue, c'est l'application qui paraît fautive.
          */}
          {poisZone.length === 0 ? (
            <button
              type="button"
              className={styles.reset}
              data-testid="list-charger-pois"
              disabled={poisZoneLoading || itineraries.length === 0}
              onClick={() => void chargerPoisDeLaZone()}
            >
              {poisZoneLoading
                ? 'Recherche des points d’eau…'
                : 'Chercher l’eau sur cette zone (une requête)'}
            </button>
          ) : (
            <label className={styles.sort}>
              Eau à moins de{' '}
              <select
                value={detourEau ?? ''}
                data-testid="list-eau"
                onChange={(e) => {
                  setDetourEau(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }}
              >
                <option value="">peu importe</option>
                {DETOURS_PROPOSES.map((metres) => (
                  <option key={metres} value={metres}>
                    {metres < 1_000
                      ? `${String(metres)} m de détour`
                      : `${String(metres / 1_000)} km de détour`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/*
          Une troncature silencieuse serait pire qu'une absence : la liste
          annoncerait « pas d'eau » pour des itinéraires que la requête n'a
          pas eu la place de couvrir. On ne peut pas l'éviter — c'est le prix
          d'une requête unique — mais on peut refuser de faire comme si de
          rien n'était.
        */}
        {poisZoneTronque && (
          <p className={styles.hint} data-testid="pois-tronques">
            Cette zone contient plus de points d’intérêt qu’une seule requête
            n’en rapporte : la recherche est incomplète. Un itinéraire sans eau
            affichée peut en avoir.
          </p>
        )}
        {poisZone.length > 0 && !poisZoneTronque && (
          <p className={styles.hint} data-testid="pois-avertissement">
            D’après OpenStreetMap. Un point d’eau absent de la carte n’est pas
            un point d’eau absent du terrain — et l’inverse est vrai aussi.
          </p>
        )}

        {filters.maxAwayKm !== null && !userPosition && (
          <p className={styles.hint} data-testid="nearby-hint">
            Position inconnue : activez « Où suis-je ? » sur la carte pour
            filtrer par proximité. En attendant, ce filtre ne retire rien.
          </p>
        )}

        {filtresActifs && (
          <button
            type="button"
            className={styles.reset}
            data-testid="list-reset"
            onClick={reinitialiser}
          >
            Réinitialiser les filtres
          </button>
        )}
      </details>

      {rows.length === 0 && (
        <p className={styles.hint} data-testid="list-empty">
          Aucun itinéraire ne correspond. Élargissez les critères — ou chargez
          une zone voisine.
        </p>
      )}

      <ul className={styles.list} data-testid="itinerary-list">
        {rows.map((itin) => {
          const result = resultById.get(itin.osmRelationId)
          const facts = factsById.get(itin.osmRelationId)
          const pct = result?.pct ?? 0
          const selected = selectedItineraryId === itin.osmRelationId
          return (
            <li key={itin.osmRelationId}>
              <button
                type="button"
                className={selected ? styles.rowSelected : styles.row}
                aria-pressed={selected}
                onClick={() => {
                  selectItinerary(selected ? null : itin.osmRelationId)
                }}
              >
                <span className={`${styles.badge} ${styles[itin.network]}`}>
                  {NETWORK_BADGES[itin.network]}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>
                    {displayName(itin)}
                    {trouesById.get(itin.osmRelationId) === true && (
                      <span
                        className={styles.gap}
                        role="img"
                        aria-label="Tracé incomplet dans OpenStreetMap"
                        title="Tracé incomplet dans OpenStreetMap : la progression ne porte que sur les tronçons présents"
                      >
                        {' '}
                        ⚠
                      </span>
                    )}
                  </span>
                  {itin.ref && itin.name && (
                    <span className={styles.rowSub}>{itin.name}</span>
                  )}
                  {facts && (
                    <span className={styles.rowFacts}>
                      <span
                        title={
                          facts.minutesSource === 'estimated'
                            ? 'Durée estimée : 4 km/h à plat, 300 m de montée à l’heure'
                            : 'Durée annoncée par la source'
                        }
                      >
                        {facts.minutesSource === 'estimated' ? '≈ ' : ''}
                        {formatDuration(facts.minutes)}
                      </span>
                      {facts.gainMeters !== null && (
                        <span> · {Math.round(facts.gainMeters)} m D+</span>
                      )}
                      {facts.shape === 'loop' && <span> · boucle</span>}
                      {/*
                        Le détour du point d'eau le plus proche (issue #156),
                        et non un booléen « avec de l'eau ». Un booléen serait
                        une promesse ; une distance dit ce qu'on a trouvé et
                        où, et laisse la personne décider.

                        Rien n'est affiché quand rien n'a été trouvé : écrire
                        « pas d'eau » affirmerait le terrain à partir d'une
                        absence dans OpenStreetMap. C'est la même règle que le
                        « non renseigné » des sources dans la fiche.
                      */}
                      {(() => {
                        const eau = detoursById.get(itin.osmRelationId)?.water
                        if (eau === null || eau === undefined) return null
                        return (
                          <span title="Détour aller-retour depuis le tracé, à vol d’oiseau">
                            {' · '}eau à {formatDetourCourt(eau)}
                          </span>
                        )
                      })()}
                      {/*
                        L'effort qualifié (issue #156) : « 420 m D+ » ne dit
                        pas « facile » à qui débute. Le mot est posé à côté
                        des chiffres, pas à leur place — celui qui sait les
                        lire ne perd rien.
                      */}
                      <span
                        className={styles.effort}
                        data-testid="itineraire-effort"
                        title={libelleEffort(facts)}
                      >
                        {' · '}
                        {effortEstime(facts)}
                      </span>
                    </span>
                  )}
                  <ProgressBalise
                    pct={pct}
                    network={itin.network}
                    label={`Progression ${displayName(itin)}`}
                  />
                </span>
                <span className={styles.rowStats}>
                  <span className={styles.rowPct}>
                    {formatPct(pct)}
                    {isCompleted(pct, seuilBoucle) && (
                      <span
                        className={styles.done}
                        title={`Itinéraire bouclé (au moins ${seuilBoucle} % parcourus)`}
                      >
                        {' '}
                        ✓
                      </span>
                    )}
                  </span>
                  <span className={styles.rowKm}>
                    {formatKm(itin.totalMeters)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
