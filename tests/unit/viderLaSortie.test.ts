import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { viderLaSortie } from '../../src/lib/viderLaSortie.ts'

/**
 * Issue #612 — `dist/` n'était jamais vidé sur le PC de Cédric : 110
 * `MapView-*.js` empilés, 150 Mo, et le service worker local qui précachait
 * chaque ancien bundle.
 *
 * Ce n'était pas Vite. Mesuré le 26/10 sous Node 24.13 (Windows) :
 * `fs.rmSync` **ne fait rien, sans erreur**, dès que le chemin contient un
 * caractère non ASCII — « Moretti Cédric ». `unlinkSync`,
 * `fs.promises.rm` et `rmSync` sur le chemin court 8.3 suppriment bien.
 * Vite vide `outDir` par `rmSync` : sur ce chemin-là, il ne vidait rien.
 *
 * D'où le « é » du dossier de ce test : c'est la condition du défaut. Sous
 * Linux (la CI), `rmSync` marche partout et ce test ne discrimine pas ; il
 * discrimine sur le poste où le défaut existe.
 */
async function sortieAvecTemoin(): Promise<{ dist: string; temoin: string }> {
  const racine = await mkdtemp(path.join(tmpdir(), 'sentiers-é-'))
  const dist = path.join(racine, 'dist')
  mkdirSync(path.join(dist, 'assets'), { recursive: true })
  const temoin = path.join(dist, 'assets', 'MapView-ancien.js')
  writeFileSync(temoin, 'ancien bundle')
  return { dist, temoin }
}

describe('viderLaSortie', () => {
  it('retire les anciens bundles, même sous un chemin accentué', async () => {
    const { dist, temoin } = await sortieAvecTemoin()

    await viderLaSortie(dist)

    expect(existsSync(temoin)).toBe(false)
    expect(existsSync(dist)).toBe(false)
  })

  it('ne se plaint pas d’une sortie qui n’existe pas encore', async () => {
    const { dist } = await sortieAvecTemoin()
    await viderLaSortie(dist)

    await expect(viderLaSortie(dist)).resolves.toBeUndefined()
  })
})
