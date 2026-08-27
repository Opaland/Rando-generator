import { test, expect } from '@playwright/test'
import { mockExternalNetwork, mockGeocode, pilatGrOnly } from './helpers.ts'

/**
 * Recherche par nom de lieu (issue #131).
 *
 * Le premier écran demandait une ref d'itinéraire ou un département : Sylvie,
 * qui débute, ne connaît ni l'une ni l'autre. Elle connaît sa ville.
 */
test('chercher une ville charge les sentiers autour', async ({ page }) => {
  const overpass = await mockExternalNetwork(page)
  await mockGeocode(page)
  await page.goto('/')

  await page.getByTestId('lieu-input').fill('Saint-Étienne')
  await page.getByTestId('lieu-submit').click()

  // Deux communes portent ce nom : le contexte départemental les distingue,
  // sinon on choisit à pile ou face.
  const propositions = page.getByTestId('lieu-results')
  await expect(propositions).toContainText('Saint-Étienne')
  await expect(propositions).toContainText('42, Loire')
  await expect(propositions).toContainText('38, Isère')

  // La première proposition est la Loire : c'est celle qu'on veut, et son
  // libellé la distingue de l'homonyme iséroise.
  const premiere = propositions.locator('li').first()
  await expect(premiere).toContainText('42, Loire')
  await premiere.getByRole('button').click()

  // Les itinéraires arrivent, et la zone porte le nom du lieu — pas un
  // identifiant de zone que personne n'a choisi.
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await expect(page.getByTestId('zone-section')).toContainText(
    'Autour de Saint-Étienne',
  )

  // La requête envoyée à Overpass est bien une requête de rayon autour du
  // point trouvé, et pas la zone par défaut.
  expect(overpass.count()).toBeGreaterThan(0)
  const requete = overpass.lastQuery()
  expect(requete).toContain('around:12000,45.400000,4.502000')

  // La liste de propositions se referme une fois le choix fait.
  await expect(page.getByTestId('lieu-results')).toHaveCount(0)

  /*
    « Actualiser les tracés » doit refaire la requête. Sur une zone « autour
    d'un lieu », le bouton ne faisait rien du tout — la clé de zone n'est pas
    un identifiant de la liste des zones, et l'échec était silencieux.

    **La fixture change avant le clic, et c'est ce qui rend le test un
    test.** La version d'avant attendait de relire « 3 itinéraires » : ce
    texte était déjà à l'écran depuis vingt lignes, donc l'attente rendait la
    main tout de suite, et le comptage d'appels qui suivait était une photo
    prise avant que la requête ne soit partie. Elle est tombée une fois en
    suite complète, jamais isolée — la signature du §6ter, et la cause du
    §1bis : une assertion qui pouvait passer pour une raison qu'on n'avait
    pas voulue.

    Mesuré, et pas seulement raisonné : en remettant le défaut d'origine —
    le bouton qui ne rejoue pas une zone « autour d'un lieu » — l'ancienne
    version **échouait** — mais sur le comptage, jamais sur l'attente, qui
    rendait la main aussitôt. Elle n'était donc pas creuse : elle
    discriminait, à un instant qu'elle ne contrôlait pas. C'est la nuance du §6ter — pas un
    ordre supposé, un **instant** supposé.

    En réduisant la fixture au seul GR 7, « 1 itinéraire » ne peut apparaître
    qu'après une **nouvelle** réponse : la discrimination passe dans
    l'assertion qui converge, et le comptage qui suit ne peut plus être lu
    trop tôt. C'est ce que fait déjà `resilience.spec.ts` pour la même règle
    sur une zone prédéfinie ; les deux tests disaient la même chose, un seul
    la vérifiait au bon moment (§4ter).
  */
  const appelsAvant = overpass.count()
  overpass.setFixture(pilatGrOnly())
  await page.getByTestId('zone-refresh').click()
  await expect(page.getByTestId('zone-meta')).toContainText('1 itinéraire', {
    timeout: 15_000,
  })
  expect(overpass.count()).toBeGreaterThan(appelsAvant)
  await expect(page.getByTestId('zone-section')).toContainText(
    'Autour de Saint-Étienne',
  )
})

test('une ville introuvable le dit, sans laisser croire à une panne', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockGeocode(page, { vide: true })
  await page.goto('/')

  await page.getByTestId('lieu-input').fill('Zzzz')
  await page.getByTestId('lieu-submit').click()

  await expect(page.getByTestId('lieu-empty')).toContainText(
    /aucune commune de ce nom/i,
  )
  await expect(page.getByTestId('lieu-error')).toHaveCount(0)
})

test('un service de recherche en panne renvoie vers les zones de la liste', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await mockGeocode(page, { erreur: 503 })
  await page.goto('/')

  await page.getByTestId('lieu-input').fill('Saint-Étienne')
  await page.getByTestId('lieu-submit').click()

  const erreur = page.getByTestId('lieu-error')
  await expect(erreur).toContainText('503')
  // Le message ne laisse pas l'utilisateur sans porte de sortie : les zones
  // prédéfinies, elles, marchent toujours.
  await expect(erreur).toContainText(/zone/i)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
})
