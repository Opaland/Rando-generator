/** Fixtures GPX synthétiques pour les tests unitaires et e2e. */

export const GPX_SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>2024-06-15T08:30:00Z</time>
  </metadata>
  <trk>
    <name>Boucle du Pilat</name>
    <trkseg>
      <trkpt lat="45.40000" lon="4.50000"><ele>1200</ele></trkpt>
      <trkpt lat="45.40010" lon="4.50010"></trkpt>
      <trkpt lat="45.40020" lon="4.50020"></trkpt>
    </trkseg>
  </trk>
</gpx>`

/** Deux segments : les points des deux doivent être concaténés. */
export const GPX_MULTI_SEG = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="45.1" lon="4.1"><time>2023-11-02T10:00:00Z</time></trkpt>
      <trkpt lat="45.2" lon="4.2"></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="45.3" lon="4.3"></trkpt>
    </trkseg>
  </trk>
</gpx>`

/** GPX valide mais sans aucun trkpt. */
export const GPX_NO_TRKPT = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="45.4" lon="4.5"><name>Croix de Chaubouret</name></wpt>
</gpx>`

/** XML mal formé. */
export const GPX_MALFORMED = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="45`

/** Pas du GPX du tout. */
export const GPX_NOT_GPX = `<?xml version="1.0"?><html><body>Pas un GPX</body></html>`

/** Coordonnées invalides : le point non numérique est ignoré. */
export const GPX_BAD_COORDS = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="45.4" lon="4.5"></trkpt>
      <trkpt lat="abc" lon="4.6"></trkpt>
      <trkpt lat="45.6" lon="4.7"></trkpt>
    </trkseg>
  </trk>
</gpx>`
