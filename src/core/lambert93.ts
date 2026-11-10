import type { LonLat } from './types.ts'

/**
 * Lambert-93 (RGF93, EPSG:2154) vers WGS84, en degrés. Issue #87.
 *
 * Le PDIPR du Rhône est livré en shapefile Lambert-93, la projection légale
 * de la France métropolitaine ; la carte ne lit que du WGS84. RGF93 et WGS84
 * coïncident à mieux que le mètre — en deçà des 5 m auxquels le réseau de
 * fond est simplifié (`scripts/preparer-pdipr.mjs`) : aucune transformation
 * de datum n'est faite.
 *
 * Constantes et algorithme : IGN, note technique NTG_71 (ALG0004 pour la
 * latitude, par itération sur la latitude isométrique).
 */
const E = 0.0818191910428158
const N = 0.725607765053267
const C = 11754255.426096
const XS = 700000
const YS = 12655612.049876
const LAMBDA0 = (3 * Math.PI) / 180

/** Itérer jusqu'à ce que la latitude ne bouge plus de ~1 mm (NTG_71 : 1e-11 rad). */
const PRECISION = 1e-11
const ITERATIONS_MAX = 50

export function lambert93VersWgs84(x: number, y: number): LonLat {
  const dx = x - XS
  const dy = y - YS
  const r = Math.hypot(dx, dy)
  const gamma = Math.atan2(dx, -dy)
  const latIso = -Math.log(r / C) / N
  let phi = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2
  for (let i = 0; i < ITERATIONS_MAX; i++) {
    const s = E * Math.sin(phi)
    const suivant =
      2 * Math.atan(((1 + s) / (1 - s)) ** (E / 2) * Math.exp(latIso)) - Math.PI / 2
    const ecart = Math.abs(suivant - phi)
    phi = suivant
    if (ecart < PRECISION) break
  }
  return [((LAMBDA0 + gamma / N) * 180) / Math.PI, (phi * 180) / Math.PI]
}
