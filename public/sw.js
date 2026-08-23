/*
 * Service worker de Sentiers — écrit à la main, sans Workbox : la stratégie
 * tient en quelques dizaines de lignes lisibles, et une dépendance de build
 * supplémentaire ne se justifie pas ici.
 *
 * Ce qui fonctionne hors connexion, et seulement cela :
 *   - l'application elle-même, si elle a été ouverte au moins une fois ;
 *   - les fonds de carte DÉJÀ consultés (les autres resteront gris) ;
 *   - les tracés et traces GPX, déjà en IndexedDB indépendamment d'ici.
 *
 * Ce qui ne fonctionne pas hors connexion, et ne doit pas être présenté
 * comme tel : charger une nouvelle zone (Overpass), et les points
 * d'intérêt. Ces réponses ne sont pas mises en cache — un relief ou des POI
 * périmés ne valent pas mieux qu'un message clair.
 *
 * Une exception, et une seule : **ce qu'on a téléchargé exprès**. Le bouton
 * « Télécharger cette randonnée » (issue #153) envoie ici une liste
 * d'adresses — les tuiles de son corridor et son profil altimétrique — et
 * elles sont gardées dans un cache à part. La règle ci-dessus tient
 * toujours : rien n'est gardé parce qu'on l'a regardé. Un profil qu'on a
 * emporté volontairement n'est pas un profil périmé qu'on n'a pas demandé.
 */

const VERSION = 'sentiers-v1'
const CACHE_APP = `${VERSION}-app`
const CACHE_TUILES = `${VERSION}-tuiles`
/*
 * Ce qu'on a demandé à emporter. Séparé des tuiles pour deux raisons : ce
 * cache-ci n'est pas un LRU — on ne jette pas une randonnée qu'on a
 * téléchargée pour partir demain — et un profil altimétrique n'a rien à
 * faire dans une réserve dimensionnée pour des images.
 */
const CACHE_TERRAIN = `${VERSION}-terrain`

/**
 * Liste des fichiers de l'application, réécrite au build par le greffon
 * `sentiers-precache-sw` de vite.config.ts : leurs noms sont hachés et ne
 * peuvent donc pas être écrits à la main ici. Sans précache, la première
 * visite ne met rien en cache — le service worker ne contrôle pas encore la
 * page quand elle charge ses scripts.
 */
self.__PRECACHE__ = []

/** Au-delà, on supprime les plus anciennes : le quota n'est pas extensible. */
const MAX_TUILES = 600

/*
 * Type du message de connectivité, recopié depuis src/core/connectivity.ts —
 * ce fichier vit hors du bundle et ne peut rien importer. Un test unitaire
 * vérifie que les deux valeurs ne divergent pas.
 */
const CONNECTIVITY_MESSAGE = 'sentiers:connectivity'

/* Issue #153, recopiés depuis src/core/telechargement.ts pour la même
 * raison, et gardés par le même genre de test. */
const MESSAGE_PRECHARGER = 'sentiers:precharger'
const MESSAGE_PROGRES = 'sentiers:telechargement'

/*
 * Vrai dès qu'une requête de l'application a dû être servie depuis le cache
 * faute de réseau. C'est le seul signal fiable pour la page : au chargement
 * hors connexion, `navigator.onLine` peut encore répondre `true` et aucun
 * événement `offline` ne sera émis, la coupure étant antérieure à la page.
 */
let secoursCache = false

/** Prévient les pages ouvertes que l'application tourne sur le cache. */
async function signalerSecours() {
  const pages = await self.clients.matchAll({ includeUncontrolled: true })
  for (const page of pages) {
    page.postMessage({ type: CONNECTIVITY_MESSAGE, cacheFallback: true })
  }
}

/*
 * Une page qui vient de démarrer demande l'état : le service worker a déjà
 * constaté l'échec pendant la navigation, avant même que ses scripts ne
 * s'exécutent. La réponse part sur le port du MessageChannel fourni.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === MESSAGE_PRECHARGER) {
    const liste = Array.isArray(event.data.urls) ? event.data.urls : []
    event.waitUntil(precharger(liste, event.source))
    return
  }
  if (event.data?.type !== CONNECTIVITY_MESSAGE) return
  const port = event.ports?.[0]
  const reponse = { type: CONNECTIVITY_MESSAGE, cacheFallback: secoursCache }
  if (port) port.postMessage(reponse)
  else event.source?.postMessage(reponse)
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP)
      const fichiers = self.__PRECACHE__.length
        ? self.__PRECACHE__
        : ['./', './index.html']
      // allSettled plutôt que addAll : un seul fichier manquant ne doit pas
      // faire échouer l'installation entière.
      await Promise.allSettled(fichiers.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((nom) => !nom.startsWith(VERSION))
            .map((nom) => caches.delete(nom)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function estTuile(url) {
  return (
    (url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/wmts')) ||
    url.hostname === 'tile.openstreetmap.org'
  )
}

/*
 * Le service altimétrique : même hôte que les tuiles IGN, mais pas sous
 * `/wmts`. C'est cette différence d'un chemin qui le laissait hors de tout
 * cache, et l'issue #153 la relève comme vérifiée.
 */
function estAltimetrie(url) {
  return (
    url.hostname === 'data.geopf.fr' && url.pathname.startsWith('/altimetrie')
  )
}

/** Garde le cache de tuiles sous sa limite, en supprimant les plus anciennes. */
async function limiterTuiles(cache) {
  const entrees = await cache.keys()
  if (entrees.length <= MAX_TUILES) return
  await Promise.all(
    entrees.slice(0, entrees.length - MAX_TUILES).map((cle) => cache.delete(cle)),
  )
}

/*
 * `ignoreVary` est indispensable ici : les fichiers de l'application sont
 * servis avec `Vary: Origin`, et le précache les enregistre via une requête
 * du service worker (sans en-tête Origin) tandis que la page les redemande
 * en `crossorigin` (avec Origin). Sans cette option, la réponse en cache est
 * jugée incompatible et l'application reste blanche hors connexion.
 */
const OPTIONS_MATCH = { ignoreVary: true }

/** Réseau d'abord, cache en secours : l'application reste à jour si possible. */
async function reseauPuisCache(request, cacheName, secours) {
  const cache = await caches.open(cacheName)
  try {
    const reponse = await fetch(request)
    if (reponse && reponse.ok) await cache.put(request, reponse.clone())
    secoursCache = false
    return reponse
  } catch (erreur) {
    const enCache =
      (await cache.match(request, OPTIONS_MATCH)) ??
      (secours && (await cache.match(secours, OPTIONS_MATCH)))
    if (enCache) {
      secoursCache = true
      void signalerSecours()
      return enCache
    }
    throw erreur
  }
}

/** Cache d'abord : une tuile ne change pas, inutile de la retélécharger. */
async function cachePuisReseau(request, cacheName) {
  const cache = await caches.open(cacheName)
  const enCache = await cache.match(request, OPTIONS_MATCH)
  if (enCache) return enCache
  const reponse = await fetch(request)
  // Une tuile tierce peut être « opaque » (sans en-têtes CORS) : elle reste
  // stockable et réutilisable telle quelle.
  if (reponse && (reponse.ok || reponse.type === 'opaque')) {
    await cache.put(request, reponse.clone())
    void limiterTuiles(cache)
  }
  return reponse
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(reseauPuisCache(request, CACHE_APP, './index.html'))
    return
  }
  if (url.origin === self.location.origin) {
    event.respondWith(reseauPuisCache(request, CACHE_APP))
    return
  }
  if (estTuile(url)) {
    event.respondWith(cachePuisReseau(request, CACHE_TUILES))
    return
  }
  if (estAltimetrie(url)) {
    /*
     * Réseau d'abord : un profil téléchargé la veille reste juste, mais
     * autant prendre le frais quand il y a du réseau. Et surtout, on ne
     * met **pas** en cache ce qui passe ici — seule la demande explicite
     * de téléchargement remplit `CACHE_TERRAIN`. Sans cela, regarder un
     * profil suffirait à le garder, et l'en-tête de ce fichier mentirait.
     */
    event.respondWith(reseauPuisTerrain(request))
    return
  }
  // Overpass et les POI : laissés au réseau, jamais mis en cache.
})

/** Réseau d'abord, puis ce qu'on avait emporté — et rien de plus. */
async function reseauPuisTerrain(request) {
  try {
    return await fetch(request)
  } catch (erreur) {
    const cache = await caches.open(CACHE_TERRAIN)
    const emporte = await cache.match(request, OPTIONS_MATCH)
    if (emporte) {
      secoursCache = true
      void signalerSecours()
      return emporte
    }
    throw erreur
  }
}

/*
 * Télécharger une randonnée (issue #153).
 *
 * La page envoie la liste des adresses, le service worker les récupère une
 * par une et rend compte à chaque pas. Deux choix méritent d'être écrits :
 *
 * - **on compte les octets réellement reçus**, on ne les estime pas. Le
 *   nombre de tuiles est connu d'avance et exact ; leur poids ne l'est pas,
 *   et personne ici n'a mesuré ce que pèse une tuile de la Géoplateforme.
 *   Annoncer « environ 40 Mo » serait inventer un nombre que rien n'appuie ;
 * - **une adresse qui échoue n'arrête pas les autres.** Une randonnée à
 *   laquelle il manque trois tuiles reste une randonnée emportée ; s'arrêter
 *   à la première erreur rendrait le bouton inutile sur un réseau moyen.
 */
async function precharger(liste, source) {
  const rendreCompte = (etat) => {
    source?.postMessage({ type: MESSAGE_PROGRES, ...etat })
  }
  const total = liste.length
  let faites = 0
  let octets = 0
  let echecs = 0
  for (const adresse of liste) {
    try {
      const url = new URL(adresse)
      const cache = await caches.open(
        estTuile(url) ? CACHE_TUILES : CACHE_TERRAIN,
      )
      const request = new Request(adresse, { mode: 'cors' })
      const reponse = await fetch(request)
      if (reponse && (reponse.ok || reponse.type === 'opaque')) {
        const copie = reponse.clone()
        await cache.put(request, reponse)
        const corps = await copie.arrayBuffer()
        octets += corps.byteLength
      } else {
        echecs += 1
      }
    } catch {
      echecs += 1
    }
    faites += 1
    rendreCompte({ faites, total, octets, echecs, fini: faites === total })
  }
  if (total === 0) rendreCompte({ faites: 0, total: 0, octets: 0, echecs: 0, fini: true })
}
