import { test, expect } from '@playwright/test'
import { appelsOverpassStabilisesA, afficherTousLesReseaux, mockExternalNetwork } from './helpers.ts'

test('les départements d’Auvergne-Rhône-Alpes sont chargeables', async ({
  page,
}) => {
  const overpass = await mockExternalNetwork(page)
  await page.goto('/')

  await page.getByTestId('zone-isere').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  await appelsOverpassStabilisesA(overpass, 1)

  // Une autre zone de la région reste accessible dans la foulée.
  await expect(page.getByTestId('zone-haute-savoie')).toBeEnabled()
})

test('un grand itinéraire se charge en un clic, sans taper sa ref', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')

  // GR 65 = chemin de Saint-Jacques (voie du Puy) : traverse plusieurs
  // départements, donc chargé par ref sur la France entière.
  await page.getByTestId('featured-gr65').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // Le bouton reflète la sélection en cours.
  await expect(page.getByTestId('featured-gr65')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

/**
 * Overpass ne signale pas ses échecs par un code HTTP (issue #283).
 *
 * Une requête qui dépasse son délai de 180 s ou sa mémoire répond **200**,
 * avec un corps JSON parfaitement bien formé dont `elements` est vide et
 * dont `remark` porte le motif. Rien dans la forme ne la distingue d'un
 * département qui n'aurait aucun sentier balisé.
 *
 * L'application affichait donc « Aucun itinéraire balisé trouvé dans cette
 * zone sur OpenStreetMap » — pour la Haute-Savoie. C'est la phrase qui fait
 * fermer l'application pour de bon, et c'est ce test qui la surveille.
 *
 * Le mot cherché est **le nôtre** (« trop vaste »), pas celui d'Overpass :
 * le motif brut est en anglais et parle de RAM, il n'a rien à faire à
 * l'écran.
 */
test('une zone qu’Overpass n’arrive pas à rendre le dit, au lieu de se dire vide', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // Enregistrée après le mock général : la route la plus récente gagne.
  let appels = 0
  await page.route('**/api/interpreter', (route) => {
    appels += 1
    void route.fulfill({
      status: 200,
      json: {
        version: 0.6,
        elements: [],
        remark:
          'runtime error: Query timed out in "query" at line 3 after 180 seconds.',
      },
    })
  })
  await page.goto('/')

  await page.getByTestId('zone-haute-savoie').click()

  const erreur = page.getByTestId('zone-error')
  await expect(erreur).toBeVisible({ timeout: 20_000 })
  await expect(
    erreur,
    'un échec d’Overpass est présenté comme un département sans sentier',
  ).not.toContainText('Aucun itinéraire')
  await expect(erreur).toContainText(/trop vaste/i)
  // Le second miroir doit avoir été essayé : un miroir qui répond « je n'y
  // arrive pas » n'est pas un miroir qui a réussi.
  expect(appels).toBe(2)
})

/**
 * Un miroir qui limite a répondu, et précisément (issue #319).
 *
 * Le 25/08, un clic sur la Moselle rendait « Impossible de joindre les
 * serveurs… ils sont **peut-être** surchargés », avec dans la console :
 *
 *     POST https://overpass-api.de/api/interpreter 429 (Too Many Requests)
 *
 * C'est #283 dans l'autre sens : là un échec passait pour une zone vide, ici
 * une réponse exacte passe pour une absence de réponse. Le coût est le même —
 * on envoie chercher son réseau quelqu'un dont le réseau va très bien.
 *
 * Ce test regarde l'écran, pas la fonction : le message peut être juste dans
 * `overpass.ts` et n'arriver nulle part.
 */
test('une limite de requêtes se dit comme telle, avec le délai du serveur', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route('**/api/interpreter', (route) =>
    route.fulfill({
      status: 429,
      headers: {
        'Retry-After': '42',
        /*
          Sans cet en-tête, le navigateur **cache** `Retry-After` : il n'est
          pas dans la liste sûre du CORS, et une réponse d'un autre domaine
          n'expose que celle-là. Mesuré ici le 25/08 — le test rendait le
          message sans délai alors que le serveur en donnait un.

          C'est donc une condition du serveur, pas du code : Overpass doit
          l'exposer pour que le délai s'affiche. Quand il ne le fait pas, le
          message dit qu'il ne sait pas — et c'est le chemin ordinaire.
        */
        'Access-Control-Expose-Headers': 'Retry-After',
      },
      body: 'rate limited',
    }),
  )
  await page.goto('/')

  await page.getByTestId('zone-moselle').click()

  const erreur = page.getByTestId('zone-error')
  await expect(erreur).toBeVisible({ timeout: 20_000 })
  await expect(
    erreur,
    'un serveur qui répond « trop de requêtes » est présenté comme injoignable',
  ).not.toContainText(/impossible de joindre/i)
  await expect(erreur).toContainText(/limitent le nombre de requêtes/i)
  // Le délai vient du serveur : il est affiché, plutôt que remplacé par un
  // « quelques minutes » qui ne mesure rien.
  await expect(erreur).toContainText('42')
})
