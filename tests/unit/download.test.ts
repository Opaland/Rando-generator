// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { downloadTextFile, downloadBlob } from '../../src/lib/download.ts'

/**
 * `src/lib/download.ts` : 42 % stmt, 0 % branche mesuré le 08/10
 * (`docs/ANALYSE_08_10.md`) — jamais exercé en unitaire, seulement par les
 * suites e2e qui déclenchent un vrai téléchargement dans Chromium.
 *
 * Ce que ces deux fonctions promettent et qui se vérifie ici : rien ne
 * transite par le réseau (`URL.createObjectURL` reste local au navigateur),
 * et l'ancre créée pour déclencher le téléchargement ne reste pas dans le
 * DOM après son clic.
 */
describe('downloadTextFile et downloadBlob', () => {
  let creerUrl: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>
  let revoquerUrl: ReturnType<typeof vi.fn<(url: string) => void>>
  let clic: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    creerUrl = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:faux-url')
    revoquerUrl = vi.fn<(url: string) => void>()
    URL.createObjectURL = creerUrl
    URL.revokeObjectURL = revoquerUrl
    // jsdom tente une vraie navigation sur le clic d'une ancre `download`
    // pointant vers un blob: URL, et ne sait pas la faire — silencieux et
    // vérifiable plutôt que de laisser passer l'avertissement.
    clic = vi.fn<() => void>()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clic)
  })

  it('fabrique un blob du bon type et déclenche un clic sur une ancre éphémère', () => {
    downloadTextFile('trace.gpx', '<gpx></gpx>')

    expect(creerUrl).toHaveBeenCalledTimes(1)
    const blob = creerUrl.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('application/gpx+xml;charset=utf-8')

    // L'ancre a fait son geste et n'est plus dans le DOM : rien ne doit
    // rester d'un téléchargement qui vient de partir.
    expect(document.querySelectorAll('a').length).toBe(0)
  })

  it("accepte un type MIME différent pour un contenu qui n'est pas du GPX", () => {
    downloadTextFile('rapport.json', '{}', 'application/json')
    const blob = creerUrl.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('application/json;charset=utf-8')
  })

  it('pose le nom de fichier demandé sur l’ancre avant de cliquer', () => {
    const poseeSurLAncre: string[] = []
    // `click` est déjà espionnée sur le prototype (voir beforeEach) : la
    // mock, appelée comme méthode, reçoit l'ancre en `this` — pas besoin de
    // passer par `document.createElement` pour l'observer.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        poseeSurLAncre.push(this.download)
        clic()
      },
    )

    downloadTextFile('itineraire.gpx', 'contenu')

    expect(clic).toHaveBeenCalledTimes(1)
    expect(poseeSurLAncre).toEqual(['itineraire.gpx'])
  })

  it('libère l’URL après coup, sans bloquer le téléchargement en cours', async () => {
    downloadTextFile('trace.gpx', 'contenu')
    expect(revoquerUrl).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(revoquerUrl).toHaveBeenCalledWith('blob:faux-url')
  })

  it('downloadBlob fait le même geste sur un contenu binaire déjà fabriqué', () => {
    const blob = new Blob(['données'], { type: 'image/png' })
    downloadBlob('bilan.png', blob)

    expect(creerUrl).toHaveBeenCalledWith(blob)
    expect(document.querySelectorAll('a').length).toBe(0)
  })
})
