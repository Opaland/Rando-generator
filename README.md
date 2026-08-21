# Sentiers

**Mesurez votre progression sur les itinéraires de randonnée balisés français.**

Sentiers compare vos traces GPX aux tracés d'itinéraires (GR, GR de Pays, PR)
issus d'OpenStreetMap et affiche votre complétion sur une carte et en
statistiques : « j'ai parcouru 34 % du GR 7, 61 % des sentiers du Pilat ».

- **Vos traces restent chez vous** : vos GPX ne quittent jamais votre
  navigateur, et le calcul de complétion s'y fait de bout en bout. Aucun
  compte, aucun backend, aucune télémétrie. La persistance se fait en
  IndexedDB.
- **Ce qui sort quand même** : afficher une carte, c'est demander des images à
  quelqu'un. Overpass reçoit la zone ou la référence cherchée, la
  Géoplateforme IGN les tuiles regardées et jusqu'à cent points de
  l'itinéraire dont on ouvre le profil, l'API Adresse le nom de commune tapé,
  et l'hébergeur la demande de la page. « À propos » le détaille dans
  l'application (issue #168).
- **Données ouvertes uniquement** : itinéraires © les contributeurs
  OpenStreetMap (ODbL) via l'API Overpass ; boucles locales de la Métropole
  de Lyon © Métropole de Lyon (Licence Ouverte 2.0, jeu « Boucles communales
  de randonnée ») ; fond de carte Plan IGN v2 (licence ouverte Etalab 2.0)
  avec repli automatique sur les tuiles OSM.
- **Utilisable hors réseau** : service worker sans dépendance (ni Workbox ni
  greffon PWA), précache généré au build, tuiles déjà vues conservées.
- Site statique : déployable tel quel sur GitHub Pages, Netlify, etc.

> GR®, GR de Pays® et PR® sont des marques de la FFRandonnée. Cette
> application est indépendante et fondée sur les données OpenStreetMap.
> Elle n'utilise **aucune** donnée FFRandonnée ni la couche IGN « Sentiers de
> randonnée balisés ».

## Démarrage

```bash
npm ci
npm run dev        # serveur de développement Vite
```

Vérifications complètes (ce que fait la CI) :

```bash
npm run lint       # eslint strict (typed linting)
npm run typecheck  # tsc -b
npm run coverage   # vitest + couverture (seuil 90 % sur src/core)
npm run build      # tsc -b && vite build
npm run e2e        # playwright (nécessite un Chromium, voir ci-dessous)
```

Pour Playwright : `npx playwright install chromium`, ou pointez un Chromium
existant via `PW_CHROMIUM_PATH=/chemin/vers/chrome npm run e2e`.

## Utilisation

1. **Charger une zone** : Rhône + Métropole de Lyon, Loire, PNR du Pilat, les
   trois, ou **n'importe quel département d'Auvergne-Rhône-Alpes** — ou encore
   un ref d'itinéraire (ex. « GR 20 »), avec quelques **grands itinéraires**
   proposés en un clic (GR 65 Saint-Jacques, GR 70 Stevenson, GR 5 Alpes…),
   cherchés sur la France entière puisqu'aucune zone ne les contient. Sont
   retenues les relations OSM `route=hiking`, `foot`, `walking` (les boucles
   locales type cartoguides sont souvent taguées `foot`) et `pilgrimage`
   (certains chemins de Saint-Jacques). Les départements sont chargés **un par
   un** : une requête couvrant toute la région dépasserait le délai d'Overpass
   et le quota de stockage du navigateur. La requête Overpass peut
   prendre de 30 s à 2 min ; le résultat est mis en cache 30 jours dans le
   navigateur (bouton « Actualiser les tracés » pour forcer). Pour les zones
   couvrant la Métropole de Lyon, les **55 boucles communales** du jeu open
   data métropolitain (réseau « Boucle », bleu-vert) s'ajoutent
   automatiquement aux itinéraires OSM — fichier embarqué avec le site
   (`public/data/`), aucun appel réseau supplémentaire.
2. **Importer des GPX** (multi-fichiers, drag & drop). Les traces sont listées
   avec nom, date, distance et D+, persistées localement ; un double import
   du même fichier est détecté et refusé. Sur un lot de fichiers, l'import
   annonce celui qu'il est en train de lire. **Déplier une trace** montre ce
   que cette sortie-là a fait avancer : quels itinéraires balisés, et de
   combien (un simple croisement de sentier, sous 300 m, n'est pas compté).
3. **Créer « Mes itinéraires »** : importez le GPX d'un parcours *à faire*
   (cartoguide, Visorando, tracé maison…) — il devient un itinéraire local
   avec sa propre progression, hors statistiques des réseaux OSM. Ou
   **tracez-le à la souris** (« Tracer sur la carte ») : chaque clic pose une
   étape accrochée au sentier le plus proche, et le tracé **suit les chemins
   affichés** entre les étapes (plus court chemin, calculé dans le
   navigateur).
4. **Voir ses sorties** : la section « Mes sorties » totalise le nombre de
   sorties, les kilomètres et le D+, et trace un histogramme des distances
   par mois (12 derniers mois). Les mois sans sortie sont conservés à zéro —
   une interruption est une information. Les traces sans date sont comptées
   dans les totaux et signalées comme absentes du graphique.
5. **Lire sa progression** : carte colorée (gris = non parcouru, couleur du
   balisage = parcouru — une légende compacte rappelle le code couleur par
   réseau), tableau de bord (% global, km faits/restants, répartition
   GR/GRP/PR, top 5), liste triable/filtrable. Sélectionner un itinéraire
   dans la liste **zoome dessus** sur la carte. Un itinéraire parcouru à
   **95 % ou plus est « bouclé »** — exiger 100 % punirait le randonneur pour
   des tronçons impraticables ou une géométrie OSM imparfaite ; le seuil est
   toujours annoncé, jamais présenté comme du 100 %. Les autres affichent ce
   qu'il reste avant le prochain jalon (25, 50, 75, 90, 100 %).
6. **Trouver une sortie** : le panneau « Trouver une sortie » filtre par
   longueur, durée, dénivelé, forme (boucle ou aller simple, déduite de la
   géométrie du tracé) et proximité de votre position. Aucun filtre ne
   s'applique à une donnée absente : un dénivelé inconnu n'est pas un
   dénivelé nul, et l'écarter ferait disparaître en silence la plupart des
   tracés OSM.
7. **Prochaine sortie** : l'application propose le plus long tronçon non
   parcouru d'un seul tenant, pondéré par la distance pour s'y rendre — un
   tronçon de 12 km à 200 km de chez soi n'est pas une proposition.
8. **Fiche détail** : cliquer un tracé sur la carte ouvre un panneau avec son
   **profil altimétrique** (service altimétrique IGN, Etalab 2.0 — D+/D−/
   min/max) — **survolez-le pour voir où l'on est** sur la carte, à la souris
   comme au clavier —, les **étapes** pour les itinéraires de plus de 30 km
   (découpage régulier calculé par l'application, ce ne sont pas les étapes
   d'un topo-guide), les **points d'intérêt** à proximité (via Overpass), et
   une **vue 3D** — une perspective
   caméra inclinée sur le tracé (pas un relief calculé depuis un modèle
   numérique de terrain). Le relief et les POI sont des bonus : indisponibles,
   la fiche reste utilisable.
9. **Se localiser** : le bouton « Ma position » affiche l'appareil sur la
   carte et recentre dessus au premier relevé. La position est lue par le
   navigateur et **reste dans l'onglet** — ni enregistrée, ni transmise. La
   précision annoncée est affichée, et signalée quand elle est trop mauvaise
   pour situer quelqu'un sur un sentier.
10. **Régler la précision de suivi GPS** (tolérance de matching, 25–100 m)
    selon la précision de votre appareil ; tout est recalculé.
11. **Emporter ou montrer** : chaque itinéraire s'exporte en **GPX** (avec son
    attribution), et le tableau de bord enregistre un **bilan en image** —
    pourcentage global, itinéraires les plus avancés, période couverte. L'image
    est dessinée sur l'appareil et ne contient aucune coordonnée : des totaux
    et des noms d'itinéraires publics, rien d'autre.

### Hors connexion

L'application s'installe et se relance **sans réseau** une fois visitée
(service worker, `public/sw.js`). Fonctionnent hors connexion :

- l'application elle-même et son interface ;
- les **tracés et traces GPX** déjà chargés (IndexedDB, indépendamment du
  service worker) ;
- les **fonds de carte déjà consultés** — les autres tuiles resteront grises.

Ne fonctionnent **pas** hors connexion, et ne sont pas présentés comme tels :
charger une nouvelle zone (Overpass), le profil altimétrique (service IGN),
les points d'intérêt. Ces réponses ne sont volontairement pas mises en cache :
un relief ou des POI périmés ne valent pas mieux qu'un message clair. Un
bandeau l'explique dès que la connexion tombe.

Sur téléphone, la carte occupe tout le cadre et le panneau de contrôle devient
une feuille glissante à trois positions : repliée sur sa seule poignée — qui
affiche le pourcentage global —, à mi-hauteur, ou presque plein écran. Elle
s'ouvre à mi-hauteur à la première visite, quand il n'y a rien à voir sur la
carte et tout à faire dans le panneau, et reste basse au retour, quand la zone
vient du cache. Chaque section reste un accordéon repliable.

Toute suppression (trace, itinéraire perso) demande une confirmation en deux
temps — pas de boîte de dialogue native, un simple second clic sur
« Confirmer ? ».

## Architecture

```
src/
├─ core/        # PUR — zéro dépendance DOM/React, entièrement testé
│  ├─ geo.ts       # distance équirectangulaire, hachage spatial, interpolation
│  ├─ sampling.ts  # échantillonnage des ways tous les 100 m (report du reliquat)
│  ├─ matching.ts  # index spatial, complétion par itinéraire/réseau/global
│  ├─ overpass.ts  # requêtes zones/ref (hiking + foot/walking), parsing, miroirs
│  ├─ gpx.ts       # parsing GPX (trkpt et rtept, DOMParser injecté)
│  ├─ network.ts   # classement GR/GRP/PR depuis les tags OSM
│  ├─ elevation.ts # profil altimétrique (service IGN), D+/D-, comblement de trous
│  ├─ poi.ts       # POI le long d'un tracé (Overpass, bbox découpées)
│  ├─ boucles.ts   # boucles communales open data (Métropole de Lyon, LO 2.0)
│  ├─ routing.ts   # graphe des sentiers, accroche d'un clic, Dijkstra
│  ├─ history.ts   # sorties par mois, totaux, cumuls
│  ├─ discovery.ts # durées et dénivelés publiés, forme du tracé, filtres
│  ├─ stages.ts    # découpage d'un long itinéraire en étapes régulières
│  ├─ nextOuting.ts # « prochaine sortie » : plus long tronçon restant, pondéré
│  ├─ milestones.ts # jalons 25/50/75/90/100 % et seuil « bouclé » (95 %)
│  ├─ outing.ts    # ce qu'une sortie a fait avancer, ce jour-là
│  ├─ summary.ts   # bilan partageable (totaux, itinéraires les plus avancés)
│  ├─ connectivity.ts # état de connexion : navigateur + constat du worker
│  ├─ animation.ts # interpolations d'animation (compteur qui suit la barre)
│  ├─ gpxExport.ts # écriture GPX 1.1 + attribution de licence
│  ├─ geolocation.ts # messages et seuils de la position GPS
│  └─ mapdata.ts   # GeoJSON des couches carte (base / parcouru / traces)
├─ store/       # Zustand + client du worker de matching
├─ db/          # IndexedDB (idb), versionnée, TTL 30 jours
├─ workers/     # matching.worker.ts (repli synchrone si Worker indisponible)
└─ components/  # MapView (MapLibre) + map/ (style, sources, caméra),
                # ZonePicker, TrackManager, Dashboard, NextOuting, History,
                # ItineraryList, ItineraryCard, ItineraryDetail, Settings, About
tests/
├─ unit/        # Vitest — miroir de src/core + db
├─ fixtures/    # GPX synthétiques + réponse Overpass enregistrée (JSON)
└─ e2e/         # Playwright, réseau externe intégralement mocké
```

### Le matching en bref

1. Chaque way OSM est échantillonné tous les **100 m** (interpolation
   linéaire, report du reliquat entre segments — pas de dérive).
2. La trace GPX est indexée sous forme de **segments** (pas de points) dans
   des cellules de **0,0015°** (~160 m) ; chaque échantillon ne teste que les
   9 cellules voisines. Un saut de plus d'**1 km** entre deux relevés est
   traité comme une coupure, pas comme une marche.
3. Un échantillon est candidat si la trace passe à moins de la **tolérance**
   (50 m par défaut, réglable 25–100 m) — distance mesurée **au segment**,
   pour ne pas pénaliser un appareil qui n'enregistre qu'un point toutes les
   quelques minutes.
4. Un passage n'est crédité que s'il couvre **au moins 3 échantillons
   consécutifs** (~300 m) : couper un sentier perpendiculairement ne le
   parcourt pas.
5. Un passage n'est crédité que si **au moins un quart** de ses échantillons
   sont à moins de **40 % de la tolérance** : une trace qui reste à écart
   constant sans jamais serrer le sentier décrit une route parallèle, pas une
   marche dessus.
6. Distances par approximation équirectangulaire (R = 6 371 000 m),
   suffisante à ces échelles.
7. Un way partagé entre plusieurs itinéraires compte dans chacun, mais une
   seule fois dans les totaux globaux.
8. Performance mesurée : 50 000 échantillons × 100 000 points GPX en
   ~0,3 s (cible < 2 s) ; le calcul tourne dans un Web Worker.

Les règles 4 et 5 corrigent des faux positifs mesurés : une trace parallèle
à 30 m créditait auparavant **100 %** d'un sentier jamais foulé. Les
scénarios adverses sont dans `tests/unit/matchingQuality.test.ts`, avec les
valeurs d'avant en commentaire. Limite connue : sans horodatage par point
(le parseur ne le conserve pas), on ne peut pas distinguer une marche d'un
trajet en voiture le long d'un sentier — un contrôle de vitesse reste à
faire.

### Décisions notables

- **Pas de turf.js** : la spec l'autorise « uniquement pour ce qu'on ne
  recode pas » ; tout le cœur géométrique étant recodé (et testé), la
  dépendance est inutile à ce stade.
- **Routage recodé plutôt qu'une brique externe** : `route_snapper` (WASM,
  Apache 2.0) impose de pré-générer un graphe binaire par zone au build, et
  `geojson-path-finder` tire turf.js — deux dépendances lourdes pour un
  Dijkstra sur un graphe qu'on a déjà en mémoire. `core/routing.ts` construit
  le graphe directement depuis les ways affichés (OSM **et** boucles open
  data) : le tracé colle donc exactement au réseau que l'utilisateur voit,
  ce qu'un service de routage tiers (API IGN Géoplateforme, graphe BD TOPO®)
  ne garantit pas. Les sommets sont quantifiés à ~1 m pour que deux ways
  partageant une jonction se raccordent malgré les arrondis d'export.
- **Pas de police distante** : l'app promet que rien ne sort du navigateur ;
  charger des webfonts contredirait cette promesse. Piles système soignées à
  la place.
- **Coloration « parcouru »** à la résolution de l'échantillonnage (100 m),
  au-dessus du tracé précis en gris : lisible et sans calcul de projection
  coûteux.
- **Cache Overpass** : en cas d'échec des deux miroirs, on retombe sur le
  cache même périmé, avec un message honnête.
- **« Vue 3D »** : une inclinaison de caméra MapLibre (pitch/bearing) sur le
  tracé, pas un relief calculé depuis un modèle numérique de terrain — plus
  simple, zéro dépendance de tuiles supplémentaire, et honnête dans son
  intitulé (« vue » plutôt que « relief 3D »).
- **Altimétrie et POI en meilleur effort** : ces deux appels réseau (service
  IGN, Overpass) ne bloquent jamais l'affichage de la fiche détail ; en cas
  d'échec, message clair et le reste (progression, carte) reste utilisable.
- **Où dormir : trois catégories, pas une** — le wiki OSM distingue le refuge
  gardé (`tourism=alpine_hut`, personnel et réservation), le couchage
  autonome (`wilderness_hut`, `shelter_type=basic_hut|lean_to|rock_shelter`,
  gratuit et sans gardien) et l'abri météo (`weather_shelter`, explicitement
  *pas* prévu pour la nuit). Les mélanger enverrait quelqu'un dormir dans un
  abri de crête ; ils sont donc séparés, et un avertissement rappelle que la
  donnée OSM peut être périmée. Les abris sans `shelter_type` exploitable
  (abribus…) sont écartés dès la requête.
- **POI : `nwr` et boîtes découpées** — en montagne un refuge est souvent
  cartographié comme le polygone du bâtiment : n'interroger que les nœuds les
  rendait invisibles. On interroge donc nœuds, ways et relations avec
  `out center`. Et comme une boîte englobante autour d'un GR de 750 km
  couvrirait un quart de la France, le tracé est découpé en portions d'au
  plus ~25 km, chacune avec sa propre boîte.
- Chaque erreur (Overpass down, GPX corrompu, IndexedDB bloqué, WebGL
  absent, service altimétrique indisponible) a un message en français qui
  dit quoi faire.

## Qualité

- TDD sur `src/core` (couverture imposée ≥ 90 %) ; fixtures de matching :
  trace superposée → 100 %, décalée 12 m → 100 % / 30 m → 0 % (TOL = 50,
  chemin parallèle), moitié → 50 %, way partagé compté 1× en global, plus
  une série de scénarios adverses (traversée perpendiculaire, GPS peu
  échantillonné, saut, aller-retour).
- Aucun test ne touche le réseau : Overpass est une fixture enregistrée,
  Playwright intercepte tout le trafic externe.
- **Tests unitaires du store** (`tests/unit/appStore.test.ts`) : cache de zone,
  forçage, repli sur un cache périmé, séquencement de deux chargements
  concurrents, dédoublonnage à l'import, bornage de la tolérance. Une fabrique
  IndexedDB neuve par test — supprimer la base ne suffit pas, une connexion
  restée ouverte bloque la suppression indéfiniment.
- E2E : scénario nominal complet, GPX corrompu, Overpass injoignable, bascule
  de miroir, actualisation forcée (zone et ref), repli de tuiles IGN → OSM avec
  conservation des tracés, multi-import/suppression, lot de gros GPX,
  hors-ligne (service worker), filtres de découverte, étapes, bilan d'une
  sortie, relation OSM trouée signalée, franchissement de jalon, export de
  bilan en image, audit axe-core (WCAG 2 A/AA) sur la vue principale **et sur
  les panneaux dépliés**.
- Un clic sur la carte vise 2 px de canvas : les tests qui ouvrent une fiche
  **réessaient le clic avec l'assertion dans la boucle**, plutôt que de parier
  sur un seul essai (la CI masquait ces échecs derrière ses relances).
- CI GitHub Actions : lint + typecheck + tests (couverture) + build + e2e.
- Avant release : smoke test manuel sur données réelles — voir
  [docs/RELEASE.md](./docs/RELEASE.md).
- Monkey testing : `npm run monkey` déchaîne « Bernard » (persona brouillon et
  impatient) — des séances d'actions aléatoires reproductibles par graine
  (`MONKEY_SEEDS`, `MONKEY_ACTIONS`), qui échouent à la moindre erreur
  JavaScript. Exploratoire, hors CI.

## Les documents du projet

Ils se lisent dans cet ordre — chacun répond à une question différente, et
aucun ne recopie les autres.

| Document | La question à laquelle il répond |
|---|---|
| [`public/pourquoi.html`](./public/pourquoi.html) | La version publique du brief — ce que le produit fait de différent, et ce qu'il coûte ([en ligne](https://opaland.github.io/Rando-generator/pourquoi.html)) |
| [`docs/BRIEF.md`](./docs/BRIEF.md) | Quel problème, pour qui, contre qui — et **ce qu'on ne fera pas** |
| [`docs/PRD.md`](./docs/PRD.md) | Dans quel ordre, et à quoi voit-on qu'un sujet est fini |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Quelles décisions structurent le code, et **pourquoi** |
| [`docs/PERSONAS.md`](./docs/PERSONAS.md) | Six personnes suivies pas à pas, et l'endroit exact où elles s'arrêtent |
| [`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md) | Le constat critique daté du 19/08, avec l'état de chaque point |
| [`docs/AUDIT_MOBILE.md`](./docs/AUDIT_MOBILE.md) | L'audit téléphone M0–M8, mesures avant/après |
| [`docs/RELEASE.md`](./docs/RELEASE.md) | Ce qu'on vérifie à la main avant de publier |
| [`docs/PROTOCOLE_TEST.md`](./docs/PROTOCOLE_TEST.md) | Comment on décide sans mesurer en douce — et pourquoi l'A/B classique est écarté |
| [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) | Couleurs, espacement, boutons — et **pourquoi la duplication JS/CSS ne doit pas être « corrigée »** |
| [`CLAUDE.md`](./CLAUDE.md) | Les règles de travail qu'aucune machine ne vérifie — chacune vient d'un raté daté |

## Déploiement (GitHub Pages)

Le site est en ligne sur <https://opaland.github.io/Rando-generator/>.

Le workflow [`deploy.yml`](.github/workflows/deploy.yml) construit le site et
le publie via GitHub Pages (source « GitHub Actions ») à chaque push. Le
build utilise une base relative (`base: './'`), il fonctionne donc sous ce
sous-chemin sans réglage supplémentaire.

Le déploiement se déclenche sur chaque push de `main` (ou manuellement via
« Run workflow ») et passe par l'environnement protégé `github-pages`.

## Licences

- Code : voir [LICENSE](./LICENSE).
- Itinéraires : © les contributeurs
  [OpenStreetMap](https://www.openstreetmap.org/copyright), licence
  [ODbL](https://opendatacommons.org/licenses/odbl/).
- Fond de carte : Plan IGN v2 © IGN, diffusé par la
  [Géoplateforme](https://geoservices.ign.fr/) sous licence ouverte
  Etalab 2.0.
