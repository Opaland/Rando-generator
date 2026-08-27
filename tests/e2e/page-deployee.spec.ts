import { test, expect } from '@playwright/test'

/**
 * La page réellement déployée, et non celle qu'on vient de construire.
 *
 * ## Pourquoi cette sonde existe
 *
 * Toute la suite tourne sur `dist/` servi en local. Elle prouve que le code
 * est juste ; elle ne prouve **rien** sur ce que GitHub Pages sert à
 * quelqu'un qui ouvre le lien. Entre les deux il y a un chemin de base
 * (`/Rando-generator/`), un artefact, un cache, et un service worker — quatre
 * endroits où une application juste peut arriver cassée.
 *
 * Le piège classique est le premier : un `base` mal réglé produit des balises
 * `<script src="/assets/…">` qui répondent 404 sur un site publié dans un
 * sous-chemin. La page se charge, reste blanche, et la suite locale est verte.
 *
 * ## Pourquoi elle est sautée par défaut
 *
 * Elle a besoin du vrai réseau. Le conteneur de développement n'y donne pas
 * accès à un navigateur : `curl` sort par le proxy sortant, Chromium non — il
 * rend `ERR_CONNECTION_RESET` même avec `--proxy-server`, et le journal du
 * proxy ne voit passer que sa télémétrie en clair. Mesuré le 27/08.
 *
 * Elle tourne donc **là où le réseau existe** : dans le workflow de
 * déploiement, juste après la publication. C'est d'ailleurs sa place
 * naturelle — une sonde de déploiement qui ne s'exécute pas au déploiement
 * ne garde rien (§6quater).
 *
 * Le même motif que `tests/unit/mesuresReseau.test.ts` : une variable
 * d'environnement, et un saut franc plutôt qu'un test qui passerait sans
 * rien avoir mesuré.
 */

const URL_DEPLOYEE = process.env['SENTIERS_URL']

test.describe('la page déployée', () => {
  test.skip(
    !URL_DEPLOYEE,
    'SENTIERS_URL non défini : sonde de déploiement sautée',
  )

  test('répond, monte, et ne perd aucun asset', async ({ page }) => {
    /*
      Les échecs de requête sont collectés **avant** la navigation : un asset
      manquant échoue pendant le chargement, et un écouteur posé après aurait
      manqué précisément ce qu'il vient chercher.
    */
    const echecs: string[] = []
    page.on('response', (r) => {
      if (r.status() >= 400) echecs.push(`${String(r.status())} ${r.url()}`)
    })
    const erreursConsole: string[] = []
    page.on('pageerror', (e) => {
      erreursConsole.push(e.message)
    })

    const reponse = await page.goto(URL_DEPLOYEE as string, {
      timeout: 30_000,
    })
    expect(reponse?.status(), 'la page déployée ne répond pas 200').toBe(200)

    // L'application monte : un titre rendu par React, pas le HTML statique.
    await expect(
      page.getByRole('heading', { name: 'Sentiers', level: 1 }),
    ).toBeVisible({ timeout: 20_000 })

    // Et le premier écran est utilisable : la zone se choisit.
    await expect(page.getByTestId('zone-pilat')).toBeVisible({
      timeout: 20_000,
    })

    expect(echecs, `requêtes en échec : ${echecs.join(' | ')}`).toEqual([])
    expect(
      erreursConsole,
      `erreurs JavaScript : ${erreursConsole.join(' | ')}`,
    ).toEqual([])
  })

  test('sert la page « pourquoi », qui est un fichier à part', async ({
    page,
  }) => {
    /*
      `public/pourquoi.html` n'est pas rendu par React : c'est un fichier
      statique que Vite copie. Il a donc son propre chemin de base, et c'est
      exactement le genre de fichier qu'un déploiement oublie sans que rien
      ne rougisse.
    */
    const base = (URL_DEPLOYEE as string).replace(/\/?$/, '/')
    const reponse = await page.goto(`${base}pourquoi.html`, { timeout: 30_000 })
    expect(reponse?.status()).toBe(200)
    await expect(page.locator('body')).toContainText(/Sentiers/i)
  })
})
