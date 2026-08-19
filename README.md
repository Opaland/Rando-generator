# Sentiers

**Mesurez votre progression sur les itinéraires de randonnée balisés français.**

Sentiers compare vos traces GPX aux tracés d'itinéraires (GR, GR de Pays, PR)
issus d'OpenStreetMap et affiche votre complétion sur une carte et en
statistiques : « j'ai parcouru 34 % du GR 7, 61 % des sentiers du Pilat ».

- **100 % local** : vos GPX ne quittent jamais votre navigateur. Aucun compte,
  aucun backend, aucune télémétrie. La persistance se fait en IndexedDB.
- **Données ouvertes uniquement** : itinéraires © les contributeurs
  OpenStreetMap (ODbL) via l'API Overpass ; fond de carte Plan IGN v2
  (licence ouverte Etalab 2.0) avec repli automatique sur les tuiles OSM.
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
   trois — ou un ref d'itinéraire (ex. « GR 20 »). La requête Overpass peut
   prendre de 30 s à 2 min ; le résultat est mis en cache 30 jours dans le
   navigateur (bouton « Actualiser les tracés » pour forcer).
2. **Importer des GPX** (multi-fichiers, drag & drop). Les traces sont listées
   avec nom, date et distance, et persistées localement.
3. **Lire sa progression** : carte colorée (gris = non parcouru, couleur du
   balisage = parcouru), tableau de bord (% global, km faits/restants,
   répartition GR/GRP/PR, top 5), liste triable/filtrable, fiche par itinéraire.
4. **Régler la tolérance** (25–100 m) selon la précision de votre GPS ;
   tout est recalculé.

## Architecture

```
src/
├─ core/        # PUR — zéro dépendance DOM/React, entièrement testé
│  ├─ geo.ts       # distance équirectangulaire, hachage spatial, interpolation
│  ├─ sampling.ts  # échantillonnage des ways tous les 100 m (report du reliquat)
│  ├─ matching.ts  # index spatial, complétion par itinéraire/réseau/global
│  ├─ overpass.ts  # requêtes zones/ref, parsing, bascule entre miroirs
│  ├─ gpx.ts       # parsing GPX (DOMParser injecté)
│  ├─ network.ts   # classement GR/GRP/PR depuis les tags OSM
│  └─ mapdata.ts   # GeoJSON des couches carte (base / parcouru / traces)
├─ store/       # Zustand + client du worker de matching
├─ db/          # IndexedDB (idb), versionnée, TTL 30 jours
├─ workers/     # matching.worker.ts (repli synchrone si Worker indisponible)
└─ components/  # MapView (MapLibre), ZonePicker, TrackManager, Dashboard,
                # ItineraryList, ItineraryCard, Settings, About
tests/
├─ unit/        # Vitest — miroir de src/core + db
├─ fixtures/    # GPX synthétiques + réponse Overpass enregistrée (JSON)
└─ e2e/         # Playwright, réseau externe intégralement mocké
```

### Le matching en bref

1. Chaque way OSM est échantillonné tous les **100 m** (interpolation
   linéaire, report du reliquat entre segments — pas de dérive).
2. Les points GPX sont indexés dans des cellules de **0,0015°** (~160 m) ;
   chaque échantillon ne teste que les 9 cellules voisines.
3. Un échantillon est « fait » si un point GPX est à moins de la tolérance
   (50 m par défaut, réglable 25–100 m).
4. Distances par approximation équirectangulaire (R = 6 371 000 m),
   suffisante à ces échelles.
5. Un way partagé entre plusieurs itinéraires compte dans chacun, mais une
   seule fois dans les totaux globaux.
6. Performance mesurée : 50 000 échantillons × 100 000 points GPX en
   ~0,3 s (cible < 2 s) ; le calcul tourne dans un Web Worker.

### Décisions notables

- **Pas de turf.js** : la spec l'autorise « uniquement pour ce qu'on ne
  recode pas » ; tout le cœur géométrique étant recodé (et testé), la
  dépendance est inutile à ce stade.
- **Pas de police distante** : l'app promet que rien ne sort du navigateur ;
  charger des webfonts contredirait cette promesse. Piles système soignées à
  la place.
- **Coloration « parcouru »** à la résolution de l'échantillonnage (100 m),
  au-dessus du tracé précis en gris : lisible et sans calcul de projection
  coûteux.
- **Cache Overpass** : en cas d'échec des deux miroirs, on retombe sur le
  cache même périmé, avec un message honnête.
- Chaque erreur (Overpass down, GPX corrompu, IndexedDB bloqué, WebGL
  absent) a un message en français qui dit quoi faire.

## Qualité

- TDD sur `src/core` (couverture imposée ≥ 90 %, mesurée ~99 %) ; fixtures de
  matching : trace superposée → 100 %, décalée 30 m → 100 % / 70 m → 0 %
  (TOL = 50), moitié → 50 %, way partagé compté 1× en global.
- Aucun test ne touche le réseau : Overpass est une fixture enregistrée,
  Playwright intercepte tout le trafic externe.
- E2E : scénario nominal complet, GPX corrompu, Overpass injoignable, bascule
  de miroir, actualisation forcée (zone et ref), repli de tuiles IGN → OSM avec
  conservation des tracés, multi-import/suppression, audit axe-core (WCAG 2 A/AA).
- CI GitHub Actions : lint + typecheck + tests (couverture) + build + e2e.
- Avant release : smoke test manuel sur données réelles — voir
  [docs/RELEASE.md](./docs/RELEASE.md).

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
