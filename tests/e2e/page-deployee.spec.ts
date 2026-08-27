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
 * Le piège classique serait le premier — un `base` mal réglé produit des
 * balises `<script src="/assets/…">` qui répondent 404 sur un site publié
 * dans un sous-chemin, la page se charge, reste blanche, et la suite locale
 * est verte. **Ici il est déjà évité** : `vite.config.ts` pose `base: './'`,
 * donc les chemins sont relatifs et la page tient à n'importe quelle
 * profondeur. Ce qui reste à garder est le reste de la chaîne — l'artefact
 * publié, le cache, le service worker — et c'est déjà trois endroits de trop
 * pour n'en surveiller aucun.
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
 *
 * ## Elle échoue quand il le faut — vérifié
 *
 * Une sonde qu'on n'a jamais vue rouge ne vaut rien (§1), et celle-ci a
 * d'abord été livrée sans cette preuve. Elle se fait maintenant à froid, sans
 * réseau, en profitant d'un détail : `vite.config.ts` pose `base: './'`, donc
 * les chemins d'assets sont **relatifs**. Servir la page depuis un
 * sous-chemin qui n'existe pas donne un `index.html` (repli SPA) dont tous
 * les assets répondent 404 — précisément le défaut que cette sonde cherche.
 *
 *     npm run preview
 *     SENTIERS_URL=http://localhost:4173/            → 2 passent
 *     SENTIERS_URL=http://localhost:4173/nexistepas/ → 2 échouent
 *
 * Mesuré le 27/08. Le second cas rougit sur « l'application monte », parce
 * qu'aucun script ne s'est chargé — c'est bien la page blanche que l'en-tête
 * décrit.
 *
 * Au passage, ce `base: './'` veut dire que le piège du chemin de base est
 * déjà évité par construction. Ce que la sonde garde vraiment est donc
 * l'artefact, le cache et le service worker — pas le sous-chemin. L'en-tête
 * disait le contraire ; il est corrigé plutôt que laissé à promettre plus
 * que ce qu'il tient.
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

      ## Et seulement les nôtres

      La première version comptait **toute** réponse ≥ 400, tuiles IGN et
      OpenStreetMap comprises. Un hoquet de `data.geopf.fr` pendant un
      déploiement aurait donc rendu la porte rouge pour une panne qui n'est
      pas la nôtre — et une porte qui rougit sur l'indisponibilité d'un tiers
      cesse d'être lue.

      Ce que ce test mesure est dans son nom : **aucun de nos assets ne
      manque**. Un asset à nous est servi par la même origine que la page
      sondée ; le reste appartient à quelqu'un d'autre, et son
      indisponibilité est un sujet pour l'application (qui sait déjà la
      dire), pas pour le déploiement.
    */
    const origine = new URL(URL_DEPLOYEE as string).origin
    const echecs: string[] = []
    page.on('response', (r) => {
      if (r.status() < 400) return
      if (!r.url().startsWith(origine)) return
      echecs.push(`${String(r.status())} ${r.url()}`)
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
