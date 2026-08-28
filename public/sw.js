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

/**
 * L'empreinte de la construction, réécrite au build par le greffon
 * `sentiers-precache-sw` de vite.config.ts — exactement comme `__PRECACHE__`
 * juste en dessous.
 *
 * ## Pourquoi elle a dû naître (issue #370)
 *
 * Il y avait ici `const VERSION = 'sentiers-v1'`, écrite une fois le premier
 * jour et jamais rechangée. L'`activate` supprimait les caches dont le nom ne
 * commence pas par `VERSION` — or les trois commençaient par `sentiers-v1`.
 * Le filtre n'en retenait aucun : **le ménage ne s'est jamais exécuté**, en
 * plus de deux cents déploiements.
 *
 * Les six fichiers de `dist/assets/` portent un nom haché qui change à chaque
 * construction : chacun est donc une clé neuve, pas un remplacement. 1,88 Mo
 * s'ajoutaient à chaque livraison dans le seul cache que rien ne borne.
 *
 * ## Dérivée du contenu, pas de l'horloge
 *
 * L'empreinte est un condensé de la liste des fichiers hachés. Une
 * reconstruction qui ne change rien rend donc la même empreinte et **ne purge
 * rien** : on ne jette pas le hors-ligne de quelqu'un pour un build à vide.
 */
const EMPREINTE = '__EMPREINTE__'

/**
 * Le préfixe commun à tous les caches d'application, quelle que soit leur
 * empreinte. C'est lui que l'`activate` balaie — et lui seul.
 */
const PREFIXE_APP = 'sentiers-app-'
const CACHE_APP = `${PREFIXE_APP}${EMPREINTE}`

/**
 * Celui d'avant #370, à emporter une bonne fois : c'est le nom qu'ont
 * aujourd'hui tous les navigateurs ayant déjà ouvert Sentiers.
 */
const CACHE_APP_HERITE = 'sentiers-v1-app'

/*
 * **Nom littéral, délibérément figé.**
 *
 * Ce cache ne doit PAS être purgé à chaque version : il est borné à 600
 * entrées, et le vider à chaque livraison rendrait grise une carte qu'on
 * venait de consulter. Le « v1 » y est désormais un vestige, gardé tel quel
 * pour que ce qui est déjà en place reste trouvable — aucune migration,
 * aucune perte.
 */
const CACHE_TUILES = 'sentiers-v1-tuiles'
/*
 * Ce qu'on a demandé à emporter. Séparé des tuiles pour deux raisons : ce
 * cache-ci n'est pas un LRU — on ne jette pas une randonnée qu'on a
 * téléchargée pour partir demain — et un profil altimétrique n'a rien à
 * faire dans une réserve dimensionnée pour des images.
 */
const CACHE_TERRAIN = 'sentiers-v1-terrain'

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
const MESSAGE_ARRETER = 'sentiers:arreter-telechargement'

/*
 * Les onglets qui ont demandé l'arrêt de leur téléchargement.
 *
 * Le corridor d'un GR de 200 km compte des milliers de tuiles et la boucle
 * est séquentielle : sans ce moyen d'arrêt, appuyer sur « Emporter » serait
 * sans retour, et fermer la fiche laisserait le service worker marteler la
 * Géoplateforme derrière un écran qu'on a quitté.
 *
 * Un ensemble d'identifiants d'onglets, et non un simple drapeau : le
 * service worker est partagé par toutes les pages du site. Avec un drapeau,
 * refermer une fiche dans un onglet interrompait le téléchargement lancé
 * dans un autre — qui affichait alors « Emportée » sur une randonnée
 * incomplète, sans que rien de visible depuis cet onglet ne l'explique.
 */
const arretsDemandes = new Set()

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
    arretsDemandes.delete(event.source?.id)
    event.waitUntil(precharger(liste, event.source))
    return
  }
  if (event.data?.type === MESSAGE_ARRETER) {
    arretsDemandes.add(event.source?.id)
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
          /*
            Ne balaie que les caches d'application périmés — jamais « tout ce
            qu'on ne reconnaît pas ».

            La forme d'avant supprimait tout nom étranger à la version
            courante. Rendue vivante par une empreinte variable, elle aurait
            emporté `CACHE_TERRAIN` à chaque mise à jour, c'est-à-dire la
            randonnée que quelqu'un a téléchargée exprès pour partir demain,
            là où il n'y aura pas de réseau. Silencieusement, et peut-être le
            matin du départ.

            Le défaut corrigé aurait ainsi coûté plus cher que le défaut
            (#370). `tests/unit/swMenage.test.ts` tient les deux moitiés.
          */
          noms
            .filter(
              (nom) =>
                nom === CACHE_APP_HERITE ||
                (nom.startsWith(PREFIXE_APP) && nom !== CACHE_APP),
            )
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

/**
 * Cache d'abord : une tuile ne change pas, inutile de la retélécharger.
 *
 * Deux caches sont consultés, et l'ordre n'est pas indifférent : celui de
 * navigation, borné, puis celui de terrain, qui contient ce qu'on a emporté
 * exprès. Sans ce second regard, une randonnée emportée s'afficherait grise
 * hors connexion alors que ses tuiles sont là — rangées ailleurs.
 */
async function cachePuisReseau(request, cacheName) {
  const cache = await caches.open(cacheName)
  const enCache = await cache.match(request, OPTIONS_MATCH)
  if (enCache) return enCache
  const terrain = await caches.open(CACHE_TERRAIN)
  const emportee = await terrain.match(request, OPTIONS_MATCH)
  /*
    Pas de `signalerSecours()` ici, et c'est délibéré : servir une tuile
    qu'on a emportée n'est pas se rabattre sur le cache faute de réseau,
    c'est se servir de ce qu'on est allé chercher. Le signaler ferait
    apparaître le bandeau « Hors connexion » en pleine connexion, dès qu'on
    survole une randonnée emportée — un mensonge dans l'autre sens.
  */
  if (emportee) return emportee
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
  const demandeur = source?.id
  for (const adresse of liste) {
    if (arretsDemandes.has(demandeur)) break
    try {
      /*
        Tout ce qu'on emporte va dans le cache de terrain, **y compris les
        tuiles**.

        Elles allaient d'abord dans `CACHE_TUILES`, ce qui semblait naturel :
        une tuile est une tuile. Mais ce cache-là est borné à 600 entrées et
        taillé du plus ancien à chaque tuile consultée ensuite. On emportait
        donc 104 tuiles, on ouvrait la carte, et une partie disparaissait
        sans rien dire — pendant que le bouton affichait « Emportée ».

        Le cache de terrain, lui, n'est pas taillé : ce qu'on a demandé
        reste. La contrepartie est qu'il grossit, et qu'il ne se vide qu'en
        effaçant les données du site. C'est le sens du mot « emporter ».
      */
      const cache = await caches.open(CACHE_TERRAIN)
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
  // Une liste vide, ou un arrêt en cours de route : dans les deux cas la
  // boucle sort sans avoir rendu de compte final, et la page resterait sur
  // « 3 / 50 » pour toujours.
  if (faites < total || total === 0) {
    rendreCompte({ faites, total, octets, echecs, fini: true })
  }
  arretsDemandes.delete(demandeur)
}
