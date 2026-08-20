/// <reference types="vitest/config" />
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Inscrit la liste des fichiers construits dans public/sw.js, dont les noms
 * sont hachés et donc inconnus à l'écriture. Sans cette liste, la première
 * visite ne met rien en cache : le service worker ne contrôle pas encore la
 * page au moment où elle charge ses scripts, et l'application serait vide au
 * premier lancement hors connexion.
 *
 * Les données de zone (public/data) sont volontairement exclues : elles ne
 * concernent qu'un territoire, et pèsent plus lourd que l'application.
 */
function precacheServiceWorker(): Plugin {
  return {
    name: 'sentiers-precache-sw',
    apply: 'build',
    async closeBundle() {
      const dist = path.resolve('dist')
      const swPath = path.join(dist, 'sw.js')
      const assets = await readdir(path.join(dist, 'assets')).catch(() => [])
      const fichiers = [
        './',
        './index.html',
        // La page « pourquoi » est servie telle quelle, hors du bundle : sans
        // elle ici, le lien de l'en-tête retomberait sur l'application hors
        // connexion (le secours de navigation, cf. public/sw.js).
        './pourquoi.html',
        './og-image.png',
        './manifest.webmanifest',
        './icon.svg',
        './icon-192.png',
        './icon-512.png',
        ...assets.map((nom) => `./assets/${nom}`),
      ]
      const source = await readFile(swPath, 'utf-8')
      await writeFile(
        swPath,
        source.replace(
          'self.__PRECACHE__ = []',
          `self.__PRECACHE__ = ${JSON.stringify(fichiers)}`,
        ),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  base: './',
  build: {
    // maplibre-gl pèse ~900 kB minifié à lui seul : seuil relevé en
    // connaissance de cause plutôt qu'un warning permanent.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: true,
    // Sans cela, un import `?raw` d'une feuille de style rend une chaîne
    // vide : le test qui compare la palette CSS aux constantes JavaScript
    // passerait sans rien vérifier.
    css: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
