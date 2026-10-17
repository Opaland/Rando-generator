import { useMemo, useState } from 'react'
import { useAppStore } from '../store/appStore.ts'
import {
  ALL_FILTERS,
  CHAMPS_DU_PILOTE,
  CHAMPS_LIBRES,
  CHAMPS_PILOTES,
  DENIVELES,
  DUREES,
  LIBELLE_REGLE_ESTIMATION,
  LONGUEURS,
  PROXIMITES,
  TOUTES_LONGUEURS,
  effortEstime,
  itineraryFacts,
  libelleEffort,
  matchesFilters,
  type DiscoveryFilters,
} from '../core/discovery.ts'
import { DiscoveryFiltersPanel } from './DiscoveryFiltersPanel.tsx'
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
import { detoursParItineraire, type DetoursPoi } from '../core/poisDeZone.ts'
import { lireIntention, type Fragment } from '../core/intention.ts'
import { RESEAUX_FILTRABLES } from '../core/reseaux.ts'
import { comptesMasques } from '../core/lisibilite.ts'
import { useReseauxVisibles } from '../store/reseauxVisibles.ts'
import { ProgressBalise } from './ProgressBalise.tsx'
import styles from './ItineraryList.module.css'

type SortKey = 'pct' | 'name' | 'length' | 'duration'

/** « 320 m » ou « 1,2 km » — la précision au mètre n'aide personne ici. */
function formatDetourCourt(metres: number): string {
  if (metres < 1_000) return `${String(Math.round(metres / 10) * 10)} m`
  return `${(metres / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}


type ChampPilote = (typeof CHAMPS_PILOTES)[number]

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
  /*
    Les réseaux montrés viennent du store et non d'un `useState` : la carte
    lit le même état, et une ligne rendue à la liste sans l'être à la carte
    serait un itinéraire cliquable dont le tracé n'apparaît nulle part
    (#322).
  */
  const reseauxVisibles = useReseauxVisibles((s) => s.reseauxVisibles)
  const basculerReseau = useReseauxVisibles((s) => s.basculerReseau)
  const afficherTousLesReseaux = useReseauxVisibles(
    (s) => s.afficherTousLesReseaux,
  )
  const networks = useMemo(
    () => new Set<Network>(reseauxVisibles),
    [reseauxVisibles],
  )
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
  /**
   * Ce que la question a fait tenir, pour le dire — pas seulement ce qu'elle
   * n'a pas tenu (issue #477). La donnée existait déjà dans `Intention`
   * (`compris[].texte`, déjà gardée par `tests/unit/intention.test.ts`) ;
   * seul l'écran la taisait, en ne montrant que l'ignoré.
   */
  const [compris, setCompris] = useState<Fragment[]>([])

  const lancerLaQuestion = (texte: string) => {
    const lue = lireIntention(texte)
    if (lue.compris.length === 0) {
      setDepuisQuestion(null)
      setIncompris(lue.incompris)
      setCompris([])
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
    setCompris(lue.compris)
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

  /*
    Ce que le filtre de réseau retire, par réseau.

    Compté sur **tous** les itinéraires chargés, et pas sur les lignes
    affichées : les autres filtres — longueur, durée, sol — en écartent
    d'autres, et les mêler ferait dire à la phrase « 12 GR masqués » ce
    qu'elle ne veut pas dire. Elle ne parle que du filtre de réseau, et c'est
    ce que son texte annonce.
  */
  const masques = useMemo(
    () => comptesMasques(itineraries, networks),
    [itineraries, networks],
  )

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

  const reinitialiser = () => {
    setLongueurIndex(0)
    setDureeIndex(0)
    setDeniveleIndex(0)
    setProximiteIndex(0)
    setShape('all')
    setDepuisQuestion(null)
    setQuestion('')
    setIncompris([])
    setCompris([])
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
          {RESEAUX_FILTRABLES.map((network) => (
            <label key={network} className={styles.networkToggle}>
              <input
                type="checkbox"
                checked={networks.has(network)}
                onChange={() => {
                  basculerReseau(network)
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

      {/*
        Ce qui est replié se dit (#322).

        Un GR absent de la liste sans que rien ne le signale est un mensonge
        par omission : la personne conclut qu'il n'y a pas de GR dans la
        zone, ce qui est faux. La ligne est **au-dessus** du panneau
        « Trouver une sortie », replié par défaut — le §6quinquies vaut aussi
        pour un lecteur : ce qui est replié par défaut est ce qu'on oublie
        par défaut.
      */}
      {masques.length > 0 && (
        <p className={styles.masques} data-testid="list-masques">
          {masques
            .map((m) => `${String(m.nombre)} ${NETWORK_BADGES[m.network]}`)
            .join(', ')}{' '}
          {masques.length === 1 && masques[0]?.nombre === 1
            ? 'est masqué'
            : 'sont masqués'}{' '}
          par le filtre de réseau.{' '}
          <button type="button" onClick={afficherTousLesReseaux}>
            Tout afficher
          </button>
        </p>
      )}

      <DiscoveryFiltersPanel
        filtresActifs={filtresActifs}
        question={question}
        setQuestion={setQuestion}
        lancerLaQuestion={lancerLaQuestion}
        compris={compris}
        incompris={incompris}
        depuisQuestion={depuisQuestion}
        longueurIndex={longueurIndex}
        setLongueurIndex={setLongueurIndex}
        dureeIndex={dureeIndex}
        setDureeIndex={setDureeIndex}
        deniveleIndex={deniveleIndex}
        setDeniveleIndex={setDeniveleIndex}
        shape={shape}
        setShape={setShape}
        sol={sol}
        setSol={setSol}
        proximiteIndex={proximiteIndex}
        setProximiteIndex={setProximiteIndex}
        reprendreLaMain={reprendreLaMain}
        hasPois={poisZone.length > 0}
        poisZoneLoading={poisZoneLoading}
        hasItineraries={itineraries.length > 0}
        chargerPoisDeLaZone={() => void chargerPoisDeLaZone()}
        detourEau={detourEau}
        setDetourEau={setDetourEau}
        poisZoneTronque={poisZoneTronque}
        proximiteFiltreActif={filters.maxAwayKm !== null}
        userPosition={userPosition}
        reinitialiser={reinitialiser}
      />

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
                <span
                  className={`${styles.badge} ${styles[itin.network]}`}
                  data-reseau={itin.network}
                >
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
                            ? `Durée estimée : ${LIBELLE_REGLE_ESTIMATION}`
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
