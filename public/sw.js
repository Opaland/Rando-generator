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
 * comme tel : charger une nouvelle zone (Overpass), le profil altimétrique
 * (service IGN), les points d'intérêt. Ces réponses ne sont volontairement
 * pas mises en cache — un relief ou des POI périmés ne valent pas mieux
 * qu'un message clair.
 */

const VERSION = 'sentiers-v1'
const CACHE_APP = `${VERSION}-app`
const CACHE_TUILES = `${VERSION}-tuiles`

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
    return reponse
  } catch (erreur) {
    const enCache =
      (await cache.match(request, OPTIONS_MATCH)) ??
      (secours && (await cache.match(secours, OPTIONS_MATCH)))
    if (enCache) return enCache
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
  }
  // Overpass, altimétrie, POI : laissés au réseau, jamais mis en cache.
})
