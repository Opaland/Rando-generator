/**
 * La zone : ce que la carte montre, et comment on y arrive (issue #155).
 *
 * Quatrième tranche, et la plus grosse — trois cent neuf lignes qui
 * partagent un état (`zoneKey`, `zoneLabel`, `zoneError`, le chargement, les
 * lieux cherchés) et une seule préoccupation.
 *
 * ## Ce que cette tranche n'est pas
 *
 * Une séparation d'état. Elle lit et écrit des champs du store comme les
 * trois précédentes. Ce qui la rend utile, c'est que ses dépendances sont
 * **listées une à une** plutôt que masquées derrière « le store » : le
 * couplage devient visible quand il grandit, au lieu de se cacher.
 *
 * ## Les deux numéros de séquence, et pourquoi ils vivent ici
 *
 * `sequenceZone` et `sequenceLieu` sont des compteurs de closure, pas des
 * champs d'état : ils ne se peignent jamais, et les mettre dans le store
 * ferait repeindre l'application à chaque frappe dans le champ de
 * recherche.
 *
 * Le premier porte une leçon datée, gardée mot pour mot dans
 * `loadFromOverpass` : **il se prend avant tout `await`, sans exception.**
 */

import {
  buildAroundQuery,
  buildRefQuery,
  buildZoneQuery,
  fetchOverpass,
  OverpassError,
  parseOverpassResponse,
  relationsPerdues,
  RAYON_AUTOUR_METERS,
  ZONES,
  libelleDeZone,
} from '../core/overpass.ts'
import { chercherLieux, GeocodeError, type Lieu } from '../core/geocode.ts'
import { fetchPois } from '../core/poi.ts'
import { reponseTronquee } from '../core/poisDeZone.ts'
import { itineraryCoords } from '../core/mapdata.ts'
import { parseBouclesGeoJSON } from '../core/boucles.ts'
import {
  zoneUtilisable,
  SCHEMA_ZONE,
  DbError,
  type SentiersDb,
} from '../db/database.ts'
import type { Itinerary, PointOfInterest } from '../core/types.ts'

/** Où en est un chargement de zone, pour l'annoncer plutôt que le taire. */
export type ZoneLoadStage = 'requesting' | 'retrying' | 'processing' | null

/** Zones dont le périmètre couvre la Métropole de Lyon (boucles locales). */
const ZONES_WITH_LOCAL_BOUCLES = new Set(['rhone', 'trois'])

/*
  Boucles locales open data, embarquées avec le site (© Métropole de Lyon,
  Licence Ouverte 2.0). Chargées paresseusement et une seule fois ; en cas
  d'échec, l'app fonctionne exactement comme avant — c'est un bonus.
*/
let bouclesPromise: Promise<Itinerary[]> | null = null

/**
 * Exporté parce que la démonstration s'en sert : elle rejoue des sorties
 * fictives sur les boucles locales, qui sont embarquées avec le site et donc
 * disponibles hors ligne dès le premier écran.
 */
export function fetchLocalBoucles(): Promise<Itinerary[]> {
  bouclesPromise ??= fetch(
    `${import.meta.env.BASE_URL}data/boucles-metropole-lyon.json`,
  )
    .then((response) => (response.ok ? response.json() : null))
    .then((data: unknown) =>
      parseBouclesGeoJSON(data, new Date().toISOString()),
    )
    .catch(() => [])
    .then((boucles) => {
      // Un échec ne se mémorise pas. Hors ligne au premier chargement, les
      // boucles seraient sinon absentes pour toute la session, alors qu'un
      // simple changement de zone suffirait à les retrouver.
      if (boucles.length === 0) bouclesPromise = null
      return boucles
    })
  return bouclesPromise
}

/** Ce que la zone ajoute à l'état du store. */
export interface EtatZone {
  zoneKey: string | null
  zoneLabel: string | null
  zoneError: string | null
  zoneLoading: boolean
  zoneLoadStage: ZoneLoadStage
  zoneLoadBytes: number
  poisZone: PointOfInterest[]
  poisZoneLoading: boolean
  poisZoneTronque: boolean
  lieux: Lieu[]
  lieuxLoading: boolean
  lieuError: string | null
  lieuxVides: boolean
}

/** Les champs du store que la tranche lit sans les posséder. */
export interface EtatLuAilleurs {
  db: SentiersDb | null
  itineraries: Itinerary[]
  demonstration: boolean
}

export interface ActionsZone {
  loadZone: (zoneId: string, options?: { force?: boolean }) => Promise<void>
  loadRef: (ref: string, options?: { force?: boolean }) => Promise<void>
  loadAutour: (lieu: Lieu, options?: { force?: boolean }) => Promise<void>
  chargerPoisDeLaZone: () => Promise<void>
  cancelZoneLoad: () => void
  rafraichirZone: () => Promise<void>
  chercherLieu: (query: string) => Promise<void>
  effacerLieux: () => void
  /**
   * Exposée parce que le démarrage la rappelle sur la dernière zone
   * restaurée, et non parce qu'un test s'en sert — la nuance compte
   * (CLAUDE.md §4bis).
   */
  mergeLocalBoucles: (zoneKey: string) => Promise<void>
}

export interface DependancesZone {
  set: (
    partiel:
      | Partial<EtatZone & EtatLuAilleurs>
      | ((
          etat: EtatZone & EtatLuAilleurs,
        ) => Partial<EtatZone & EtatLuAilleurs>),
  ) => void
  etat: () => EtatZone & EtatLuAilleurs
  /** La base une fois ouverte, ou `null` si elle ne s'ouvrira pas. */
  baseOuverte: () => Promise<SentiersDb | null>
  /** Retient la zone affichée, pour la rouvrir au prochain démarrage. */
  persistLastZone: (zoneKey: string) => Promise<void>
  /** Recalcule la complétion après un changement d'itinéraires. */
  recompute: () => Promise<void>
  /** Pose les itinéraires d'une zone et remet ce qui en dépend à zéro. */
  setItineraries: (
    zoneKey: string,
    zoneLabel: string,
    itineraries: Itinerary[],
    fetchedAt: string,
  ) => void
  /**
   * Sort de la démonstration avant de charger une vraie zone.
   *
   * L'entonnoir vit dans `loadFromOverpass` plutôt qu'en trois exemplaires :
   * sans lui, charger une zone pendant une démonstration laissait trois
   * sorties fictives sur des itinéraires réels.
   */
  sortirDeLaDemonstration: () => Promise<void>
}

export function trancheZone(deps: DependancesZone): ActionsZone {
  /*
    Deux compteurs de closure, jamais des champs d'état : ils ne se peignent
    pas, et les mettre dans le store ferait repeindre l'application à chaque
    frappe dans le champ de recherche de lieu.
  */
  let zoneLoadSequence = 0
  let lieuSequence = 0

  async function loadFromOverpass(
    zoneKey: string,
    zoneLabel: string,
    query: string,
    force: boolean,
  ): Promise<void> {
    // Le numéro de séquence se prend AVANT tout `await`, sans exception.
    //
    // Ma première version sortait de la démonstration d'abord : un `await`
    // s'intercalait donc entre le clic et la prise du numéro, et deux
    // chargements lancés coup sur coup pouvaient franchir cette frontière
    // avant qu'aucun n'ait réservé le sien. Un test de recherche de ville a
    // échoué une fois sur la suite complète, et c'était la vraie cause —
    // pas une instabilité.
    const sequence = ++zoneLoadSequence
    // Entonnoir unique des trois chemins de zone (loadZone, loadRef,
    // loadAutour) : la garde vit ici plutôt qu'en trois exemplaires.
    //
    // Sans elle, charger une vraie zone pendant une démonstration laissait
    // les trois sorties fictives dans la liste, sur des itinéraires réels,
    // sous un bandeau annonçant toujours une démonstration. C'était le
    // cinquième chemin de contamination — après ceux que la revue du sprint
    // 2 avait fermés, et que sa PR déclarait exhaustifs.
    await deps.sortirDeLaDemonstration()
    // Si l'utilisateur a annulé (ou relancé un autre chargement) entre-temps,
    // ce chargement ne doit plus toucher l'UI — mais on le laisse quand même
    // se terminer normalement : parsing et cache restent utiles en arrière-plan.
    const isCurrent = () => sequence === zoneLoadSequence
    deps.set({
      zoneLoading: true,
      zoneError: null,
      zoneLoadStage: 'requesting',
      zoneLoadBytes: 0,
    })
    try {
      // Relu à chaque usage, jamais figé : au démarrage, la base s'ouvre
      // pendant que l'utilisateur clique une zone. Un `db` capturé à l'entrée
      // valait encore null au retour d'Overpass, deux minutes plus tard — la
      // zone n'était donc jamais mise en cache, et la visite suivante
      // repartait pour une interrogation complète.
      let cached
      try {
        const db = deps.etat().db
        cached = db ? await db.getZone(zoneKey) : undefined
      } catch {
        cached = undefined
      }
      if (!isCurrent()) return
      const now = new Date().toISOString()
      if (cached && !force && zoneUtilisable(cached, now)) {
        deps.setItineraries(
          zoneKey,
          libelleDeZone(zoneKey, cached.label),
          cached.itineraries,
          cached.fetchedAt,
        )
        await deps.persistLastZone(zoneKey)
        await deps.recompute()
        return
      }

      try {
        const data = await fetchOverpass(query, {
          onAttempt: (mirrorIndex) => {
            if (isCurrent()) {
              deps.set({
                zoneLoadStage: mirrorIndex === 0 ? 'requesting' : 'retrying',
                // Un second miroir repart de zéro : garder le compteur du
                // premier laisserait croire à une progression qui n'existe plus.
                zoneLoadBytes: 0,
              })
            }
          },
          onProgress: (octets) => {
            if (isCurrent()) deps.set({ zoneLoadBytes: octets })
          },
        })
        if (!isCurrent()) return
        deps.set({ zoneLoadStage: 'processing' })
        const itineraries = parseOverpassResponse(data, now)
        const db = await deps.baseOuverte()
        if (db) {
          try {
            await db.saveZone({
              zoneKey,
              label: zoneLabel,
              itineraries,
              fetchedAt: now,
              schema: SCHEMA_ZONE,
            })
          } catch {
            // Quota de stockage dépassé (grosses zones) : on continue en
            // mémoire, le cache sera simplement absent au prochain démarrage.
          }
        }
        if (!isCurrent()) return
        // Enregistrée avant d'être affichée : si la zone est à l'écran, elle
        // sera restaurée au prochain démarrage. Dans l'autre ordre, recharger
        // la page dans la seconde qui suit interrompait l'écriture, et la
        // zone repartait pour une interrogation complète.
        await deps.persistLastZone(zoneKey)
        deps.setItineraries(zoneKey, zoneLabel, itineraries, now)
        if (itineraries.length === 0) {
          deps.set({
            zoneError:
              'Aucun itinéraire balisé trouvé dans cette zone sur OpenStreetMap. Réessayez avec « Actualiser les tracés », ou choisissez une autre zone.',
          })
        } else if (data.remark !== undefined) {
          // Overpass a rendu des données **et** un motif : il a interrompu la
          // requête en cours de route. Ce qui est à l'écran est un morceau de
          // la zone, et rien ne le distingue d'une zone complète — sauf de le
          // dire. Une complétion calculée là-dessus serait fausse par excès.
          deps.set({
            zoneError:
              'Les serveurs OpenStreetMap ont interrompu la requête : cette zone n’est affichée qu’en partie. Vos pourcentages sont donc surestimés. Essayez un secteur plus petit pour l’avoir en entier.',
          })
        } else {
          /*
            Un itinéraire découpé en tronçons dont aucun tronçon n'est revenu
            (#400). Ce cas passe après les deux autres parce qu'il est le
            moins grave des trois : une zone vide ou tronquée se voit, celui-ci
            ne se voit pas du tout.

            `relationsPerdues` ne compte que ce qui est réellement absent —
            une super-relation dont une fille est là ne perd rien, et prévenir
            alors serait le faux positif qui apprend à ignorer l'alerte
            suivante.
          */
          const perdues = relationsPerdues(data, itineraries)
          if (perdues.length > 0) {
            const pluriel = perdues.length > 1
            deps.set({
              zoneError:
                `${String(perdues.length)} itinéraire${pluriel ? 's' : ''} de cette zone ${pluriel ? 'sont découpés' : 'est découpé'} en tronçons qu’OpenStreetMap n’a pas rendus : ${pluriel ? 'ils ne sont donc pas affichés' : 'il n’est donc pas affiché'}. Le reste de la zone est complet.`,
            })
          }
        }
        await deps.recompute()
      } catch (error) {
        if (!isCurrent()) return
        // Miroirs injoignables : on retombe sur le cache même périmé.
        if (cached) {
          deps.setItineraries(
            zoneKey,
            libelleDeZone(zoneKey, cached.label),
            cached.itineraries,
            cached.fetchedAt,
          )
          deps.set({
            zoneError:
              'Les serveurs OpenStreetMap sont injoignables : affichage des tracés en cache (ils datent peut-être un peu).',
          })
          await deps.persistLastZone(zoneKey)
          await deps.recompute()
          return
        }
        const message =
          error instanceof OverpassError || error instanceof DbError
            ? error.message
            : 'Le chargement des tracés a échoué. Vérifiez votre connexion puis réessayez.'
        deps.set({ zoneError: message })
      }
    } finally {
      // Quoi qu'il arrive, l'interface ne reste jamais bloquée en chargement —
      // sauf si un chargement plus récent (ou une annulation) a pris le relais.
      if (isCurrent() && deps.etat().zoneLoading) {
        deps.set({ zoneLoading: false, zoneLoadStage: null, zoneLoadBytes: 0 })
      }
    }
  }

  /**
   * Ajoute les boucles locales open data aux itinéraires de la zone affichée
   * (fusion en mémoire uniquement — jamais écrites dans le cache Overpass,
   * qui reste une copie pure d'OSM). Sans effet si la zone a changé entre
   * temps ou si l'asset est indisponible.
   */
  async function mergeLocalBoucles(zoneKey: string): Promise<void> {
    if (!ZONES_WITH_LOCAL_BOUCLES.has(zoneKey)) return
    const boucles = await fetchLocalBoucles()
    if (boucles.length === 0 || deps.etat().zoneKey !== zoneKey) return
    const known = new Set(deps.etat().itineraries.map((i) => i.osmRelationId))
    const fresh = boucles.filter((b) => !known.has(b.osmRelationId))
    if (fresh.length === 0) return
    deps.set((state) => ({ itineraries: [...state.itineraries, ...fresh] }))
    await deps.recompute()
  }

  const actions: ActionsZone = {
    async loadZone(zoneId, options = {}) {
      const zone = ZONES.find((z) => z.id === zoneId)
      if (!zone) return
      const force = options.force ?? false
      if (force) {
        const db = deps.etat().db
        if (db) await db.deleteZone(zoneId)
      }
      await loadFromOverpass(zoneId, zone.label, buildZoneQuery(zoneId), force)
      await mergeLocalBoucles(zoneId)
    },

    /**
     * Charge en **une** requête les points d'intérêt de la zone entière
     * (issue #156), pour que la liste puisse dire où se trouve l'eau.
     *
     * À la demande, jamais automatiquement. C'est une interrogation
     * d'Overpass de plus, et #283 a montré ce que coûte une requête que
     * personne n'a demandée : quand elle échoue, c'est l'application qui
     * paraît fautive.
     *
     * Une requête pour toute la zone plutôt qu'une par itinéraire : la
     * seconde forme ferait des centaines d'appels, et se ferait couper par
     * le serveur bien avant la fin.
     */
    async chargerPoisDeLaZone() {
      const { itineraries, poisZoneLoading } = deps.etat()
      if (poisZoneLoading || itineraries.length === 0) return
      deps.set({ poisZoneLoading: true })
      try {
        const coords = itineraries.flatMap((itin) => itineraryCoords(itin))
        const pois = await fetchPois(coords)
        deps.set({
          poisZone: pois,
          poisZoneTronque: reponseTronquee(pois),
          poisZoneLoading: false,
        })
      } catch {
        // Un POI est un bonus, jamais bloquant : en cas d'échec on rend la
        // main sans rien afficher de plus. `fetchPois` ne lève déjà pas,
        // mais le `catch` garde le drapeau de chargement d'être laissé à
        // `true` si un jour elle changeait d'avis.
        deps.set({ poisZoneLoading: false })
      }
    },

    async loadRef(ref, options = {}) {
      const trimmed = ref.trim()
      if (!trimmed) return
      const force = options.force ?? false
      const zoneKey = `ref:${trimmed.toUpperCase()}`
      if (force) {
        const db = deps.etat().db
        if (db) await db.deleteZone(zoneKey)
      }
      await loadFromOverpass(zoneKey, trimmed, buildRefQuery(trimmed), force)
    },

    cancelZoneLoad() {
      // Invalide le chargement en cours : sa promesse continue en arrière-plan
      // (le cache en profitera si elle aboutit) mais ne touchera plus l'UI.
      zoneLoadSequence += 1
      deps.set({ zoneLoading: false, zoneLoadStage: null, zoneLoadBytes: 0 })
    },

    async chercherLieu(query) {
      const terme = query.trim()
      if (terme === '') {
        deps.set({ lieux: [], lieuError: null, lieuxVides: false })
        return
      }
      const sequence = ++lieuSequence
      deps.set({ lieuxLoading: true, lieuError: null, lieuxVides: false })
      try {
        const lieux = await chercherLieux(terme)
        // Une recherche plus récente a pris le relais : ses résultats sont
        // ceux que l'utilisateur attend, pas ceux d'une frappe abandonnée.
        if (sequence !== lieuSequence) return
        deps.set({ lieux, lieuxVides: lieux.length === 0 })
      } catch (error) {
        if (sequence !== lieuSequence) return
        deps.set({
          lieux: [],
          lieuError:
            error instanceof GeocodeError
              ? error.message
              : 'La recherche de lieu n’a pas abouti. Choisissez une zone dans la liste.',
        })
      } finally {
        if (sequence === lieuSequence) deps.set({ lieuxLoading: false })
      }
    },

    async loadAutour(lieu, options = {}) {
      const [lon, lat] = lieu.center
      const zoneKey = `autour:${lon.toFixed(4)},${lat.toFixed(4)}`
      const force = options.force ?? false
      if (force) {
        const db = await deps.baseOuverte()
        if (db) await db.deleteZone(zoneKey)
      }
      deps.set({ lieux: [], lieuError: null, lieuxVides: false })
      await loadFromOverpass(
        zoneKey,
        `Autour de ${lieu.label}`,
        buildAroundQuery(lieu.center, RAYON_AUTOUR_METERS),
        force,
      )
    },
    async rafraichirZone() {
      const { zoneKey, zoneLabel } = deps.etat()
      if (!zoneKey) return
      // Une démonstration n'a pas de source à rafraîchir : elle se rejoue
      // ou se quitte, elle ne se recharge pas.
      if (deps.etat().demonstration) return
      if (zoneKey.startsWith('ref:')) {
        if (zoneLabel) await actions.loadRef(zoneLabel, { force: true })
        return
      }
      if (zoneKey.startsWith('autour:')) {
        // La clé porte le centre de la recherche, précisément pour qu'on
        // puisse la rejouer sans avoir gardé le lieu d'origine.
        const [lon, lat] = zoneKey
          .slice('autour:'.length)
          .split(',')
          .map(Number)
        if (lon === undefined || lat === undefined) return
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return
        await actions.loadAutour(
          {
            label: (zoneLabel ?? '').replace(/^Autour de /, ''),
            contexte: null,
            center: [lon, lat],
          },
          { force: true },
        )
        return
      }
      await actions.loadZone(zoneKey, { force: true })
    },

    effacerLieux() {
      lieuSequence += 1
      deps.set({
        lieux: [],
        lieuError: null,
        lieuxVides: false,
        lieuxLoading: false,
      })
    },

    mergeLocalBoucles,
  }
  return actions
}
