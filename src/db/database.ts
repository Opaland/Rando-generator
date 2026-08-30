import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Itinerary, Track } from '../core/types.ts'
import type { PointBrut } from '../core/recorder.ts'
import type { EnteteEnregistrement } from '../core/reprise.ts'
import type { PoisEmportes } from '../core/poisEmportes.ts'
import type { ParcoursDeclare } from '../core/declaratif.ts'
import {
  ecrireReglage,
  lireReglage,
  reglagesSynchronesDisponibles,
} from './reglages.ts'

/** Erreur de persistance, message affichable tel quel à l'utilisateur. */
export class DbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DbError'
  }
}

export const DB_NAME = 'sentiers'
export const DB_VERSION = 5

/** Durée de vie du cache des tracés : 30 jours. */
export const CACHE_TTL_MS = 30 * 24 * 3600 * 1000

/** Zone (ou recherche par ref) mise en cache avec ses itinéraires. */
export interface CachedZone {
  zoneKey: string
  label: string
  itineraries: Itinerary[]
  fetchedAt: string
  /**
   * Ce que la requête Overpass demandait au moment de l'écriture.
   *
   * Absent sur tout ce qui a été mis en cache avant #179 : la requête ne
   * demandait alors pas les tags des chemins, et les itinéraires stockés
   * n'en portent aucun. Le profil affichait pour eux « Rien à en dire :
   * 100 % » — mesuré : une bande d'origine `inconnu`, couvrant tout.
   * L'énoncé vrai n'était pas « OpenStreetMap ne dit rien », mais « on ne
   * l'a jamais demandé », et le cache tient trente jours.
   */
  schema?: number
  /**
   * Overpass avait-il interrompu la requête au moment de l'écriture ?
   *
   * Ce fait ne se recalcule pas à la relecture : le `remark` d'Overpass
   * n'est pas dans les itinéraires, il était dans la réponse. Sans lui,
   * une zone tronquée servie depuis le cache passe pour entière et ses
   * pourcentages sont surestimés en silence (#404).
   *
   * Absent sur tout ce qui a été mis en cache avant #404 — voir
   * `CHAMPS_DE_ZONE` pour ce que cette absence veut dire, et pourquoi elle
   * ne périme rien.
   */
  partielle?: boolean
  /**
   * Combien d'itinéraires découpés n'ont rendu aucun tronçon (#400).
   *
   * Même raison que `partielle` : ce compte se lit sur la réponse Overpass,
   * pas sur ce qu'on en a gardé.
   */
  perdues?: number
}

/**
 * Version courante du contenu mis en cache pour une zone.
 *
 * À incrémenter quand la requête Overpass rapporte quelque chose de
 * nouveau, faute de quoi les copies plus anciennes prétendent répondre à
 * une question qu'on ne leur a pas posée.
 *
 * - **1** = les tags de revêtement des chemins membres (issue #179) ;
 * - **2** = `osmc:symbol` et `operator`, le balisage peint sur l'arbre
 *   (issue #286, livré le 24/08 — et l'incrément oublié jusqu'au 28,
 *   issue #371).
 *
 * La consigne ci-dessus existait depuis le 22/08 et n'a pas suffi : #286 est
 * passé deux jours plus tard sans que personne ne la relise. C'est pourquoi
 * `CHAMPS_MIS_EN_CACHE` la double d'une liste que
 * `tests/unit/schemaDeZone.test.ts` compare à ce que le parseur écrit — une
 * consigne qu'il faut penser à lire ne garde rien (§6quater).
 */
export const SCHEMA_ZONE = 2

/**
 * Les champs qu'une zone en cache peut porter, au schéma courant.
 *
 * Épinglés **ici**, à côté de la version qu'ils justifient, plutôt que
 * déduits du type `Itinerary` : ce type porte aussi `details`,
 * `attribution` et `importe`, qui viennent d'un fichier déposé ou d'un tracé
 * dessiné, jamais d'Overpass. Les inclure ferait rougir la garde sur des
 * ajouts qui ne touchent pas le cache de zone — et une garde qui rougit à
 * tort finit désactivée.
 *
 * `osmcSymbol` et `operator` ne sont écrits que si le tag existe (#286 : « le
 * cache de zone ne grossit pas de deux `null` par relation »). Cette liste
 * décrit donc ce qu'une relation **peut** porter, pas ce que chacune porte.
 *
 * ## Le `depuis`, et ce qu'il rend difficile
 *
 * Chaque champ dit à quel schéma il est apparu, et le test asserte que le
 * plus grand des `depuis` **est** `SCHEMA_ZONE`. Un champ neuf s'écrit donc
 * `depuis: SCHEMA_ZONE + 1`, et le test reste rouge tant que la constante
 * n'a pas suivi : l'incrément devient le chemin le plus court.
 *
 * Ce qu'il ne rend pas impossible, et il faut le dire : écrire `depuis: 2`
 * sur un champ ajouté aujourd'hui. Le test passerait — mais il aura fallu
 * affirmer noir sur blanc que ce champ existe depuis le schéma 2, ce qui est
 * faux et se voit en relecture. Une garde déplace le mensonge à un endroit
 * où on le lit ; elle ne l'interdit pas.
 */
export const CHAMPS_MIS_EN_CACHE: readonly {
  champ: string
  depuis: number
}[] = [
  { champ: 'osmRelationId', depuis: 1 },
  { champ: 'ref', depuis: 1 },
  { champ: 'name', depuis: 1 },
  { champ: 'network', depuis: 1 },
  { champ: 'ways', depuis: 1 },
  { champ: 'totalMeters', depuis: 1 },
  { champ: 'fetchedAt', depuis: 1 },
  { champ: 'osmUpdatedAt', depuis: 1 },
  { champ: 'osmcSymbol', depuis: 2 },
  { champ: 'operator', depuis: 2 },
]

/**
 * Les champs que porte l'enregistrement d'une zone — le niveau au-dessus.
 *
 * `CHAMPS_MIS_EN_CACHE` décrit un itinéraire ; celle-ci décrit l'objet qui
 * les contient. Deux listes parce que ce sont deux questions : la première
 * demande « qu'est-ce que la requête Overpass rapporte », la seconde
 * « qu'est-ce qu'on a retenu de la réponse ».
 *
 * ## Pourquoi pas de `depuis` ici
 *
 * Le `depuis` de `CHAMPS_MIS_EN_CACHE` force l'incrément de `SCHEMA_ZONE`,
 * qui **jette** les copies plus anciennes. C'est le bon remède là-bas : une
 * relation sans `osmcSymbol` ne se distingue pas d'une relation dont le tag
 * n'existe pas, et la fiche mentirait.
 *
 * Ici, l'absence est lisible telle quelle : une zone sans `partielle` a été
 * écrite avant #404, et on ne sait donc pas si elle était tronquée. On se
 * tait alors — ce qui est exactement le comportement d'avant #404 pour
 * toutes les zones. Ces copies ne se comportent jamais plus mal qu'hier, et
 * l'angle mort se referme seul en trente jours (`CACHE_TTL_MS`).
 *
 * L'alternative écartée : incrémenter `SCHEMA_ZONE`, donc redemander à
 * Overpass toutes les zones de tout le monde, y compris celles qui n'ont
 * jamais rien eu de travers. `tests/unit/schemaDeZone.test.ts` épingle ce
 * choix : qui incrémente verra ce test rougir et lira ce paragraphe.
 *
 * **Un champ neuf ici demande donc une question, pas un réflexe :** son
 * absence rend-elle une vieille copie *fausse* (alors `SCHEMA_ZONE` bouge et
 * le champ va dans l'autre liste), ou seulement *muette* ?
 */
export const CHAMPS_DE_ZONE: readonly string[] = [
  'zoneKey',
  'label',
  'itineraries',
  'fetchedAt',
  'schema',
  'partielle',
  'perdues',
]

export type SettingKey =
  | 'toleranceMeters'
  | 'completionPct'
  | 'lastZoneKey'
  /** Itinéraires épinglés comme objectifs, en JSON (liste d'identifiants). */
  | 'objectifs'
  /** « complet » ou « simple » — deux registres, pas deux applications. */
  | 'modeAffichage'
  /** 0 ou 1, faute de booléen dans le magasin des réglages. */
  | 'grosTexte'
  /** 0 ou 1 : le guide de premier lancement a-t-il été fermé ? */
  | 'guideFerme'
  /** 0 ou 1 : le panneau latéral a-t-il été replié sur grand écran ? */
  | 'panneauReplie'

/**
 * Clef unique de l'en-tête de la sortie en cours.
 *
 * Une seule sortie s'enregistre à la fois : on ne marche pas deux sentiers
 * en même temps, et deux tampons concurrents ne poseraient que des
 * questions sans réponse — lequel reprendre, lequel jeter.
 */
export const CLEF_ENREGISTREMENT = 'encours'

interface SentiersSchema extends DBSchema {
  zones: { key: string; value: CachedZone }
  tracks: { key: string; value: Track }
  settings: { key: string; value: number | string }
  /** Itinéraires créés par l'utilisateur (ids négatifs, réseau PERSO). */
  customItineraries: { key: number; value: Itinerary }
  /** L'état de la sortie en cours, sans ses points (issue #152). */
  enregistrement: { key: string; value: EnteteEnregistrement }
  /**
   * Les points de la sortie en cours, un par enregistrement.
   *
   * Un magasin séparé, et une clef auto-incrémentée : on **ajoute** un
   * point, on ne réécrit jamais le tableau. Chaque écriture coûte le même
   * prix à la quatrième heure qu'à la première, là où réécrire l'ensemble
   * aurait coûté de plus en plus cher à mesure que la sortie s'allonge —
   * c'est-à-dire précisément quand la batterie est la plus basse.
   */
  enregistrementPoints: { key: number; value: PointBrut }
  /**
   * Les points d'intérêt emportés avec une randonnée (issue #153).
   *
   * Ils sont ici et non dans un cache du service worker parce qu'Overpass
   * répond en `POST`, et que le Cache API ne sait pas ranger une requête
   * `POST` : c'est vérifié, pas supposé. Une clef par itinéraire — on
   * emporte une randonnée, pas une région.
   */
  poisEmportes: { key: number; value: PoisEmportes }
  /**
   * Les itinéraires déclarés parcourus sans trace GPX (issue #158).
   *
   * Un magasin à part, et c'est le fond du sujet : le déclaratif n'entre
   * jamais dans le pipeline de matching, donc il ne peut pas se mélanger au
   * mesuré par accident.
   */
  parcoursDeclares: { key: number; value: ParcoursDeclare }
}

/**
 * La copie en cache répond-elle encore à la question qu'on pose aujourd'hui ?
 *
 * Deux conditions, et une seule fonction pour les porter : l'âge, et la
 * version du contenu. Les garder séparées aurait laissé le second oubli se
 * reproduire au prochain enrichissement de la requête (CLAUDE.md §4).
 */
export function zoneUtilisable(zone: CachedZone, nowIso: string): boolean {
  return zone.schema === SCHEMA_ZONE && isFresh(zone.fetchedAt, nowIso)
}

/** Vrai si un horodatage ISO a moins de CACHE_TTL_MS d'ancienneté à `nowIso`. */
export function isFresh(fetchedAtIso: string, nowIso: string): boolean {
  const fetchedAt = Date.parse(fetchedAtIso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(fetchedAt) || Number.isNaN(now)) return false
  return now - fetchedAt < CACHE_TTL_MS
}

export interface SentiersDb {
  raw: IDBPDatabase<SentiersSchema>
  saveZone(zone: CachedZone): Promise<void>
  getZone(zoneKey: string): Promise<CachedZone | undefined>
  deleteZone(zoneKey: string): Promise<void>
  saveTrack(track: Track): Promise<void>
  listTracks(): Promise<Track[]>
  deleteTrack(id: string): Promise<void>
  saveCustomItinerary(itinerary: Itinerary): Promise<void>
  listCustomItineraries(): Promise<Itinerary[]>
  deleteCustomItinerary(id: number): Promise<void>
  getSetting(key: SettingKey): Promise<number | string | undefined>
  setSetting(key: SettingKey, value: number | string): Promise<void>
  /** Issue #152 — le tampon de la sortie en cours. */
  ecrireEntete(tete: EnteteEnregistrement): Promise<void>
  lireEntete(): Promise<EnteteEnregistrement | undefined>
  ajouterPointsEnregistres(points: PointBrut[]): Promise<void>
  compterPointsEnregistres(): Promise<number>
  lirePointsEnregistres(): Promise<PointBrut[]>
  effacerEnregistrement(): Promise<void>
  /** Range les points d'intérêt emportés avec une randonnée (issue #153). */
  ecrirePoisEmportes(pois: PoisEmportes): Promise<void>
  /** Ce qu'on avait emporté pour cet itinéraire, ou `undefined`. */
  lirePoisEmportes(itineraryId: number): Promise<PoisEmportes | undefined>
  /** Oublie ce qu'on avait emporté — quand l'itinéraire disparaît. */
  effacerPoisEmportes(itineraryId: number): Promise<void>
  /** Coche un itinéraire comme parcouru, sans trace (issue #158). */
  declarerParcours(parcours: ParcoursDeclare): Promise<void>
  /** Tous les itinéraires cochés à la main. */
  listerParcoursDeclares(): Promise<ParcoursDeclare[]>
  /** Décoche : on peut s'être trompé de sentier. */
  retirerParcoursDeclare(itineraryId: number): Promise<void>
}

export interface OpenDbOptions {
  /** Injectable pour les tests ; par défaut, l'IndexedDB du navigateur. */
  indexedDB?: IDBFactory | undefined
}

/**
 * Ouvre (et migre si besoin) la base IndexedDB de l'application.
 * Lève une DbError en français si IndexedDB est indisponible (navigation
 * privée de certains navigateurs, stockage désactivé…).
 */
export async function openSentiersDb(
  name: string = DB_NAME,
  options: OpenDbOptions = {},
): Promise<SentiersDb> {
  const factory =
    'indexedDB' in options
      ? options.indexedDB
      : (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!factory) {
    throw new DbError(
      'Votre navigateur bloque le stockage local (IndexedDB). ' +
        'Vos traces ne pourront pas être conservées entre deux visites : ' +
        'désactivez la navigation privée ou autorisez le stockage pour ce site.',
    )
  }

  /*
    Armé avant l'ouverture et appelé depuis `blocked` : `openDB` ne rejette
    pas de lui-même dans ce cas, il attend. On court donc l'ouverture contre
    ce refus explicite.
  */
  let rejeterCarBloquee: (() => void) | undefined
  const bloquee = new Promise<never>((_, rejeter) => {
    rejeterCarBloquee = () => {
      rejeter(
        new DbError(
          'Une autre page de Sentiers est encore ouverte sur une version ' +
            'précédente et empêche la mise à jour du stockage. Fermez les ' +
            'autres onglets Sentiers, puis rechargez cette page.',
        ),
      )
    }
  })
  // Sans cela, un rejet qui n'arrive jamais serait signalé comme non traité.
  bloquee.catch(() => undefined)

  let raw: IDBPDatabase<SentiersSchema>
  try {
    // La course entoure l'ouverture elle-même : `openDB` n'aboutit pas quand
    // elle est bloquée, donc tout ce qu'on écrirait après l'attendre ne
    // s'exécuterait jamais. Posé après coup une première fois — le test est
    // resté rouge et a désigné l'erreur.
    raw = await Promise.race([
      openDB<SentiersSchema>(name, DB_VERSION, {
      /*
        Deux onglets, deux versions de la base — trouvé à la revue du sprint.

        IndexedDB refuse de migrer tant qu'une connexion à l'ancienne version
        vit. Sans ces deux gestionnaires, `openDB` **n'aboutit jamais** :
        mesuré, la promesse reste en attente indéfiniment. Elle ne lève pas —
        donc aucun avertissement ne s'affiche, la base reste `null`, et tout
        ce qu'on importe dans ce nouvel onglet est perdu en silence.

        Le cas n'a rien de théorique : la base est passée de la version 3 à
        la 5 en trois heures (#153 puis #158), et quelqu'un qui garde
        Sentiers ouvert dans un onglet et rouvre le site dans un autre le
        rencontre.

        `blocking` s'exécute dans l'onglet **ancien** : il ferme sa connexion
        pour laisser passer la migration. C'est le seul des deux qui répare
        vraiment quelque chose — l'autre ne fait que ne plus mentir.
      */
      blocking() {
        raw.close()
      },
      blocked() {
        /*
          On arrive ici quand la connexion ancienne n'a pas pu être fermée —
          un onglet figé, ou une version antérieure à `blocking`. Mieux vaut
          renoncer en disant quoi faire que d'attendre sans fin.
        */
        rejeterCarBloquee?.()
      },
      upgrade(database, oldVersion) {
        // Migrations incrémentales : chaque version ajoute ses stores.
        if (oldVersion < 1) {
          database.createObjectStore('zones', { keyPath: 'zoneKey' })
          database.createObjectStore('tracks', { keyPath: 'id' })
          database.createObjectStore('settings')
        }
        if (oldVersion < 2) {
          database.createObjectStore('customItineraries', {
            keyPath: 'osmRelationId',
          })
        }
        if (oldVersion < 3) {
          database.createObjectStore('enregistrement')
          database.createObjectStore('enregistrementPoints', {
            autoIncrement: true,
          })
        }
        if (oldVersion < 4) {
          database.createObjectStore('poisEmportes', {
            keyPath: 'itineraryId',
          })
        }
        if (oldVersion < 5) {
          database.createObjectStore('parcoursDeclares', {
            keyPath: 'itineraryId',
          })
        }
      },
      }),
      bloquee,
    ])
  } catch (erreur) {
    // Un refus explicite porte déjà son message : le remplacer par le
    // message générique effacerait la seule chose utile qu'on sache dire.
    if (erreur instanceof DbError) throw erreur
    throw new DbError(
      'Impossible d’ouvrir le stockage local (IndexedDB). ' +
        'Rechargez la page ; si le problème persiste, videz les données du site.',
    )
  }

  await migrerLesReglages(raw)

  return {
    raw,
    async saveZone(zone) {
      await raw.put('zones', zone)
    },
    getZone(zoneKey) {
      return raw.get('zones', zoneKey)
    },
    async deleteZone(zoneKey) {
      await raw.delete('zones', zoneKey)
    },
    async saveTrack(track) {
      await raw.put('tracks', track)
    },
    listTracks() {
      return raw.getAll('tracks')
    },
    async deleteTrack(id) {
      await raw.delete('tracks', id)
    },
    async saveCustomItinerary(itinerary) {
      await raw.put('customItineraries', itinerary)
    },
    listCustomItineraries() {
      return raw.getAll('customItineraries')
    },
    async deleteCustomItinerary(id) {
      await raw.delete('customItineraries', id)
    },
    /*
      Les réglages vivent dans `localStorage` depuis #203 : c'est le seul
      magasin dont l'écriture soit **synchrone par contrat**, et c'est ce qui
      supprime la fenêtre pendant laquelle l'écran affirmait un réglage que la
      base ne connaissait pas encore.

      IndexedDB reste le repli quand `localStorage` refuse — certains
      navigateurs verrouillent l'un et pas l'autre — et reste la source de la
      **reprise** : `migrerLesReglages` recopie une fois ce qu'une version
      antérieure y avait laissé. Le magasin `settings` n'est donc jamais
      supprimé, seulement cessé d'être écrit, ce qui laisse un retour en
      arrière possible sans rien avoir perdu.
    */
    async getSetting(key) {
      const synchrone = lireReglage(key)
      if (synchrone !== undefined) return synchrone
      return raw.get('settings', key)
    },
    async setSetting(key, value) {
      if (ecrireReglage(key, value)) return
      await raw.put('settings', value, key)
    },
    async ecrireEntete(tete) {
      await raw.put('enregistrement', tete, CLEF_ENREGISTREMENT)
    },
    lireEntete() {
      return raw.get('enregistrement', CLEF_ENREGISTREMENT)
    },
    /**
     * Les points nouveaux, en **une seule transaction**.
     *
     * Un `put` par point ouvrirait autant de transactions, et une mort de
     * l'onglet au milieu laisserait une suite trouée. Ici, ou tout le lot
     * est écrit, ou rien ne l'est — et ce qui manque sera simplement
     * réécrit au tour suivant, puisque `pointsAEcrire` compare au compte
     * réel du disque.
     */
    async ajouterPointsEnregistres(points) {
      if (points.length === 0) return
      const tx = raw.transaction('enregistrementPoints', 'readwrite')
      for (const point of points) await tx.store.add(point)
      await tx.done
    },
    compterPointsEnregistres() {
      return raw.count('enregistrementPoints')
    },
    lirePointsEnregistres() {
      // `getAll` sur une clef auto-incrémentée rend l'ordre d'insertion :
      // c'est l'ordre du sentier, et c'est celui qu'attend le matching.
      return raw.getAll('enregistrementPoints')
    },
    async ecrirePoisEmportes(pois) {
      await raw.put('poisEmportes', pois)
    },
    lirePoisEmportes(itineraryId) {
      return raw.get('poisEmportes', itineraryId)
    },
    async effacerPoisEmportes(itineraryId) {
      await raw.delete('poisEmportes', itineraryId)
    },
    async declarerParcours(parcours) {
      await raw.put('parcoursDeclares', parcours)
    },
    listerParcoursDeclares() {
      return raw.getAll('parcoursDeclares')
    },
    async retirerParcoursDeclare(itineraryId) {
      await raw.delete('parcoursDeclares', itineraryId)
    },
    async effacerEnregistrement() {
      const tx = raw.transaction(
        ['enregistrement', 'enregistrementPoints'],
        'readwrite',
      )
      await Promise.all([
        tx.objectStore('enregistrement').clear(),
        tx.objectStore('enregistrementPoints').clear(),
        tx.done,
      ])
    },
  }
}

/**
 * Recopie une fois les réglages laissés dans IndexedDB par une version
 * antérieure (#203).
 *
 * Sans elle, la mise à jour remettrait chaque personne à des réglages par
 * défaut : seuil, tolérance, mode d'affichage, gros texte, objectifs
 * épinglés. Un correctif qui efface ce qu'il vient protéger ne corrige rien.
 *
 * `localStorage` gagne quand les deux ont la clef : c'est lui qui reçoit les
 * écritures depuis la migration, donc lui qui est à jour. La copie ne se fait
 * que dans un sens, et le magasin `settings` reste tel quel.
 *
 * Sans `localStorage`, il n'y a rien à migrer : IndexedDB reste la source, et
 * la fenêtre de #203 avec elle. C'est le prix d'un navigateur qui refuse le
 * stockage synchrone, et il est dit plutôt que masqué.
 */
async function migrerLesReglages(
  raw: IDBPDatabase<SentiersSchema>,
): Promise<void> {
  if (!reglagesSynchronesDisponibles()) return
  const clefs: SettingKey[] = [
    'toleranceMeters',
    'completionPct',
    'lastZoneKey',
    'objectifs',
    'modeAffichage',
    'grosTexte',
    'guideFerme',
    'panneauReplie',
  ]
  for (const clef of clefs) {
    if (lireReglage(clef) !== undefined) continue
    const ancienne = await raw.get('settings', clef)
    if (ancienne !== undefined) ecrireReglage(clef, ancienne)
  }
}
