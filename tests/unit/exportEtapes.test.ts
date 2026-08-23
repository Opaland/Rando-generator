import { describe, it, expect } from 'vitest'
import { buildGpxDocument } from '../../src/core/gpxExport.ts'
import { waypointsDesEtapes } from '../../src/core/stages.ts'
import type { Stage } from '../../src/core/stages.ts'

/*
 * Note sur les libellés : `formatKm` n'impose pas de décimale — « 20 km » et
 * « 41,5 km ». Mes premières attentes disaient « 20,0 km », par habitude et
 * sans avoir regardé ; c'étaient elles qui étaient fausses.
 */

/**
 * Issue #161, point 2 — le plan ne sortait pas de l'application.
 *
 * Seul l'itinéraire complet s'exportait. Camille, qui prépare trois semaines
 * sur la Grande Traversée des Alpes, ne pouvait pas emporter **son
 * découpage** — c'est-à-dire la seule chose qu'elle avait construite ici.
 *
 * Un GPX à waypoints plutôt qu'un fichier par étape : une montre en avale un
 * seul, le tracé reste entier, et les coupures se lisent dessus. Vingt
 * fichiers demanderaient vingt gestes et perdraient la continuité.
 */

function etape(index: number, debut: number, fin: number): Stage {
  return {
    index,
    startMeters: debut,
    endMeters: fin,
    meters: fin - debut,
    doneMeters: 0,
    pct: 0,
    start: [4.5 + index * 0.01, 45.4],
    end: [4.5 + (index + 1) * 0.01, 45.41],
    bounds: [
      [4.5, 45.4],
      [4.6, 45.5],
    ],
  }
}

const ETAPES = [etape(1, 0, 20_000), etape(2, 20_000, 41_500)]

describe('waypointsDesEtapes', () => {
  it('ne rend rien sans étapes', () => {
    expect(waypointsDesEtapes([])).toEqual([])
  })

  /**
   * Un point de départ, une fin par étape. Sur deux étapes : départ, fin de
   * la première — c'est là qu'on dort — et arrivée.
   */
  it('marque le départ, chaque fin d’étape, et l’arrivée', () => {
    const points = waypointsDesEtapes(ETAPES)
    expect(points).toHaveLength(3)
    expect(points[0]?.name).toBe('Départ')
    expect(points[1]?.name).toBe('Fin d’étape 1 — 20 km')
    expect(points[2]?.name).toBe('Arrivée — 41,5 km')
  })

  it('place chaque point là où l’étape s’arrête', () => {
    const points = waypointsDesEtapes(ETAPES)
    expect(points[0]?.lon).toBeCloseTo(ETAPES[0]!.start[0], 6)
    expect(points[1]?.lon).toBeCloseTo(ETAPES[0]!.end[0], 6)
    expect(points[2]?.lon).toBeCloseTo(ETAPES[1]!.end[0], 6)
  })

  /** Une étape unique n'a pas de « fin d'étape » : elle a une arrivée. */
  it('ne fabrique pas de coupure quand il n’y en a pas', () => {
    const points = waypointsDesEtapes([etape(1, 0, 12_000)])
    expect(points.map((p) => p.name)).toEqual(['Départ', 'Arrivée — 12 km'])
  })
})

describe('buildGpxDocument avec waypoints', () => {
  const base = {
    name: 'GR 5',
    coords: [
      [4.5, 45.4],
      [4.6, 45.5],
    ] as [number, number][],
    attribution: null,
    createdAt: '2026-08-23T10:00:00.000Z',
  }

  it('n’écrit aucun waypoint quand il n’y en a pas', () => {
    expect(buildGpxDocument(base)).not.toContain('<wpt')
  })

  it('écrit un <wpt> par coupure', () => {
    const gpx = buildGpxDocument({
      ...base,
      waypoints: waypointsDesEtapes(ETAPES),
    })
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(3)
    expect(gpx).toContain('Fin d’étape 1 — 20 km')
  })

  /**
   * Le schéma GPX 1.1 impose l'ordre : metadata, wpt, rte, trk. Un fichier
   * qui l'enfreint est refusé par certaines montres — silencieusement, ce
   * qui est le pire des cas sur le terrain.
   */
  it('respecte l’ordre imposé par le schéma', () => {
    const gpx = buildGpxDocument({
      ...base,
      waypoints: waypointsDesEtapes(ETAPES),
    })
    expect(gpx.indexOf('</metadata>')).toBeLessThan(gpx.indexOf('<wpt '))
    expect(gpx.lastIndexOf('</wpt>')).toBeLessThan(gpx.indexOf('<trk>'))
  })

  it('échappe ce qui viendrait d’OpenStreetMap', () => {
    const gpx = buildGpxDocument({
      ...base,
      waypoints: [{ lon: 4.5, lat: 45.4, name: 'Refuge <des> "Aiguilles"' }],
    })
    expect(gpx).toContain('Refuge &lt;des&gt; &quot;Aiguilles&quot;')
    expect(gpx).not.toContain('<des>')
  })
})
