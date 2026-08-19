import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre v6 résout l'URL de son worker interne à partir de import.meta.url
// du module principal ; après bundling, ce fichier n'existe plus à côté du
// bundle et la carte reste bloquée en chargement. On fournit explicitement
// l'URL du worker bundlé par Vite (avec sa dépendance maplibre-gl-shared).
setWorkerUrl(maplibreWorkerUrl)
