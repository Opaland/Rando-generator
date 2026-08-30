/// <reference types="vitest/config" />
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { poserLaPolitique } from './src/lib/baliseDePolitique.ts'

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
      /*
        L'empreinte de la construction (issue #370).

        Dérivée des **noms hachés** eux-mêmes, et non d'un horodatage : ce
        sont eux qui changent quand le contenu change, et eux seuls. Une
        reconstruction à l'identique rend donc la même empreinte, et
        l'`activate` du service worker ne purge rien — on ne jette pas le
        hors-ligne de quelqu'un pour un build à vide.

        Douze caractères : de quoi rendre une collision hors de portée sans
        allonger un nom de cache que personne ne lit.
      */
      const empreinte = createHash('sha256')
        .update([...assets].sort().join('\n'))
        .digest('hex')
        .slice(0, 12)

      const source = await readFile(swPath, 'utf-8')
      const reecrit = source
        .replace(
          'self.__PRECACHE__ = []',
          `self.__PRECACHE__ = ${JSON.stringify(fichiers)}`,
        )
        .replace("const EMPREINTE = '__EMPREINTE__'", `const EMPREINTE = '${empreinte}'`)

      /*
        Bruyant plutôt que silencieux : si l'un des deux marqueurs disparaît
        de `public/sw.js`, la construction doit échouer ici. Un service worker
        livré avec `__EMPREINTE__` littérale ne purgerait plus jamais rien, et
        rien à l'écran ne le dirait — c'est le défaut qu'on vient de corriger,
        reconstitué en silence (§6quater).
      */
      if (reecrit.includes('__EMPREINTE__') || reecrit.includes('__PRECACHE__ = []')) {
        throw new Error(
          'sentiers-precache-sw : un marqueur de public/sw.js n’a pas été' +
            ' remplacé. Le service worker livré serait inerte.',
        )
      }

      await writeFile(swPath, reecrit)
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

/**
 * Les directives qu'une balise `<meta http-equiv>` ne peut pas porter.
 *
 * La spécification les ignore en balise — elles n'ont de sens que dans un
 * en-tête HTTP. Les y laisser produirait un avertissement dans la console à
 * chaque chargement, et surtout ferait croire qu'elles s'appliquent.
 */
const IGNOREES_EN_BALISE = ['frame-ancestors', 'report-uri', 'sandbox']

/**
 * La politique telle qu'une balise peut la porter (issue #375).
 *
 * ## Pourquoi une balise
 *
 * `deploy/csp.conf` est soigné, gardé dans les deux sens par
 * `tests/unit/csp.test.ts`, et les tests de bout en bout tournent sous lui.
 * Et pourtant, sur `opaland.github.io`, `curl` ne rendait **ni en-tête ni
 * balise** : tout ce travail protégeait le serveur de prévisualisation et
 * une image conteneur que rien ne déploie.
 *
 * Le dépôt en avait tiré « Pages ne laisse poser aucun en-tête, donc rien à
 * faire ». C'est vrai **des en-têtes**. Une balise `<meta http-equiv>` n'en
 * est pas un, et elle couvre `connect-src` — précisément la directive qui
 * porte la promesse du produit.
 *
 * ## Ce qu'elle ne couvre pas, et qu'il faut dire
 *
 * `frame-ancestors 'none'` reste servi par nginx et **ne l'est pas** sur
 * Pages : une balise ne peut pas l'exprimer. C'est une vraie perte, pas un
 * détail — le déménagement vers un vrai serveur garde donc sa raison d'être.
 *
 * ## Dérivée, jamais recopiée
 *
 * Même source que l'en-tête de prévisualisation, à trois directives près.
 * Recopier la politique ici aurait créé la jumelle que quatre instances de
 * #367 viennent de coûter (§4ter).
 */
function politiquePourBalise(): string {
  const gardees = politiqueDeSecurite()
    .split(';')
    .map((directive) => directive.trim())
    .filter(
      (directive) =>
        directive !== '' &&
        !IGNOREES_EN_BALISE.includes(directive.split(/\s+/)[0] ?? ''),
    )

  if (gardees.length === 0) {
    throw new Error(
      'deploy/csp.conf : il ne reste aucune directive après avoir retiré ' +
        "celles qu'une balise ignore. La page serait servie sans politique.",
    )
  }
  return gardees.join('; ')
}

/**
 * Pose la politique dans `index.html`, à la place que le navigateur exige :
 * **avant tout ce qu'elle doit gouverner**. Une balise posée après un script
 * ne s'applique pas à lui.
 */
function baliseDeLaPolitique(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${politiquePourBalise()}" />`
}

/*
  La pose vit dans `src/lib/baliseDePolitique.ts` : c'est une fonction pure,
  donc éprouvable, et elle **remplace** au lieu d'ajouter depuis #420. Ce qui
  reste ici est ce qui ne se teste pas ainsi — la lecture de `deploy/csp.conf`
  et la composition de la balise.
*/
function poser(html: string, quoi: string): string {
  return poserLaPolitique(html, baliseDeLaPolitique(), quoi)
}

function politiqueDansLaPage(): Plugin {
  return {
    name: 'sentiers-csp-balise',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => poser(html, 'index.html'),
    },
    /*
      `pourquoi.html` est servie **telle quelle** depuis `public/` : Vite ne
      la transforme pas, `transformIndexHtml` ne la voit jamais. Elle serait
      donc restée sans politique pendant que l'application en gagnait une.

      C'est le §3 dans sa forme la plus banale — la surface qu'une correction
      oublie — et c'est le test de bout en bout qui l'a trouvée, pas la
      relecture. Elle est traitée ici plutôt que dans un second greffon : une
      question, un endroit (§4ter).
    */
    async closeBundle() {
      const chemin = path.resolve('dist/pourquoi.html')
      const html = await readFile(chemin, 'utf-8')
      await writeFile(chemin, poser(html, 'pourquoi.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), precacheServiceWorker(), politiqueDansLaPage()],
  base: './',
  /*
    Les mêmes en-têtes qu'en production, sur le serveur de prévisualisation.

    C'est lui que Playwright interroge : sans cette ligne, les tests de bout
    en bout tourneraient contre une page sans politique, et la première fois
    que quelqu'un l'éprouverait serait en production.
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
