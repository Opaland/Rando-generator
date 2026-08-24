/// <reference types="vitest/config" />
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
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
        // Boucles locales open data. Elles servent la démonstration du
        // premier lancement et les zones du Rhône : sans elles ici, une
        // application installée les perdait hors ligne, alors que c'est
        // précisément dehors qu'on en a besoin (revue globale du cycle 2).
        './data/boucles-metropole-lyon.json',
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

/**
 * La politique de sécurité de contenu, lue là où elle est écrite.
 *
 * `deploy/csp.conf` est la source unique : nginx l'inclut en production, et
 * le serveur de prévisualisation la sert ici. Les tests de bout en bout
 * tournent donc contre la politique **réelle** — une politique éprouvée
 * seulement en production est une politique éprouvée par les gens.
 *
 * La lecture est synchrone et volontairement bruyante : si le fichier
 * manque ou si sa forme change, la configuration doit échouer au démarrage
 * plutôt que de servir en silence une page sans politique. Un garde-fou
 * qu'on ne remarque pas quand il tombe ne garde rien (CLAUDE.md §6quater).
 */
function politiqueDeSecurite(): string {
  const brut = readFileSync(path.resolve('deploy/csp.conf'), 'utf8')
  const trouve = /^set \$csp "([^"]+)";/m.exec(brut)
  if (!trouve?.[1]) {
    throw new Error(
      'deploy/csp.conf : directive `set $csp "…";` introuvable. ' +
        'La prévisualisation servirait une page sans politique de sécurité, ' +
        'et les tests de bout en bout ne la vérifieraient plus.',
    )
  }
  return trouve[1]
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), precacheServiceWorker()],
  base: './',
  /*
    Les mêmes en-têtes qu'en production, sur le serveur de prévisualisation.

    C'est lui que Playwright interroge : sans cette ligne, les 285 tests
    tourneraient contre une page sans politique, et la première fois que
    quelqu'un l'éprouverait serait en production.
  */
  preview: {
    headers: { 'Content-Security-Policy': politiqueDeSecurite() },
  },
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
