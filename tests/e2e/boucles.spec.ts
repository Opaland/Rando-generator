import { test, expect } from '@playwright/test'
import { mockExternalNetwork } from './helpers.ts'
import bouclesFixture from '../fixtures/boucles/metropole.json' with { type: 'json' }

test('la zone Rhône fusionne les boucles locales open data (réseau Boucle)', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  // Remplace la route « asset vide » par la fixture de boucles : 3 boucles
  // exploitables (la 4e n'a pas de tracé valable).
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: bouclesFixture }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  // 3 itinéraires OSM (fixture Pilat servie pour toutes les zones mockées)
  // + 3 boucles locales de la fixture.
  await expect(page.getByTestId('zone-meta')).toContainText('6 itinéraires', {
    timeout: 15_000,
  })

  const list = page.getByTestId('itinerary-list')
  await expect(list).toContainText('Les Vallons de la Beffe')

  // Ouvrir la fiche détail depuis la liste puis le lien « Voir le détail » :
  // les infos pratiques open data (commune, difficulté, source) s'affichent.
  await list.getByRole('button', { name: /Les Vallons de la Beffe/ }).click()
  await page.getByTestId('itinerary-card-detail-link').click()
  const local = page.getByTestId('detail-local-info')
  await expect(local).toBeVisible()
  await expect(local).toContainText('Dardilly')
  await expect(local).toContainText('moyen')
  await expect(local).toContainText('Métropole de Lyon')

  // Le filtre « Boucle » masque/affiche les boucles locales.
  await page.getByTestId('itinerary-detail-close').click()
  await page.getByRole('checkbox', { name: 'Boucle' }).uncheck()
  await expect(list).not.toContainText('Les Vallons de la Beffe')
  await expect(list).toContainText('GR 7')
})

test('l’asset de boucles indisponible ne casse pas le chargement de zone', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ status: 500, body: 'oups' }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('zone-error')).toHaveCount(0)
})


/**
 * Aucune phrase ne cite OpenStreetMap sur une fiche qui n'en vient pas
 * (issue #317).
 *
 * Relevé par Cédric le 25/08 sur « Au cœur des Monts d'Or », une boucle de la
 * Métropole :
 *
 *     Non renseigné : 100 %
 *     Calculé sur la longueur, d'après ce qu'OpenStreetMap renseigne
 *     chemin par chemin.
 *
 * `parseBouclesGeoJSON` construit ces ways depuis un `MultiLineString`, sans
 * aucun tag — il n'y en a pas dans la source, et on n'interroge pas OSM pour
 * les obtenir. Les « 100 % non renseigné » n'étaient donc pas le silence
 * d'OpenStreetMap : on ne lui avait rien demandé.
 *
 * La sonde est écrite en **négatif sur la fiche entière** plutôt qu'en positif
 * sur une phrase : la faute n'est pas dans un mot mais dans l'attribution, et
 * elle peut réapparaître par n'importe quelle autre ligne — une légende de
 * couverture, un lien, un avertissement de qualité. C'est la version §4ter du
 * constat, celle que l'issue réclame.
 */
test('une boucle locale ne met rien sur le dos d’OpenStreetMap', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.route('**/data/boucles-metropole-lyon.json', (route) =>
    route.fulfill({ json: bouclesFixture }),
  )
  await page.goto('/')

  await page.getByTestId('zone-rhone').click()
  const list = page.getByTestId('itinerary-list')
  await expect(list).toContainText('Les Vallons de la Beffe', {
    timeout: 15_000,
  })
  await list.getByRole('button', { name: /Les Vallons de la Beffe/ }).click()
  await page.getByTestId('itinerary-card-detail-link').click()

  const detail = page.getByTestId('itinerary-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('Dardilly')

  /*
    **La première version de cette sonde avait tort**, et elle l'a prouvé au
    premier lancement : elle interdisait le mot « OpenStreetMap » sur la fiche
    entière, et elle est tombée sur la note des couchages —

        « Ces informations viennent d'OpenStreetMap et peuvent être
          incomplètes ou périmées »

    — qui est **vraie**. Les points d'intérêt sont interrogés par une requête
    Overpass autour du tracé, quelle que soit la provenance du tracé lui-même.
    Une boucle de la Métropole a donc, tout à fait légitimement, des POI
    OpenStreetMap.

    La règle n'est pas « ne jamais nommer OSM », c'est « ne rien lui attribuer
    qui ne vienne pas de lui ». La sonde porte donc sur les sections qui
    décrivent **l'itinéraire**, et pas sur celle qui décrit ce qu'il y a
    autour.

    `innerText` et non `textContent` : le second lit aussi ce qui est en
    `display: none`, et affirmerait l'absence d'une phrase parfaitement
    présente (§1bis, constat U12).
  */
  const sol = page.getByTestId('detail-sol')
  await expect(sol).toBeVisible()
  expect(
    await sol.innerText(),
    'la section « Sous les pieds » d’une boucle Métropole cite OpenStreetMap',
  ).not.toMatch(/OpenStreetMap|OSM\b/i)

  // Et ce qui remplace la phrase dit la vérité, plutôt que de se taire.
  const muette = page.getByTestId('sol-source-muette')
  await expect(muette).toBeVisible()
  await expect(muette).toContainText(/pas ce qu’il y a dessous/i)
  await expect(muette).toContainText(/aucun relevé du sol/i)

  // La légende de couverture disparaît avec elle : « Relevé dans
  // OpenStreetMap : 0 % » mesurait un silence qui n'existait pas.
  await expect(page.getByTestId('revetement-couverture')).toHaveCount(0)

  // Ni lien vers une relation qui n'existe pas, ni date de modification OSM
  // pour un tracé qu'OSM n'a jamais vu.
  await expect(page.getByTestId('lien-osm')).toHaveCount(0)
  await expect(page.getByTestId('detail-osm-updated')).toHaveCount(0)
})
