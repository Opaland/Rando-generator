import { test, expect } from '@playwright/test'

/**
 * Image de prévisualisation du lien partagé (issue #8, seconde moitié).
 *
 * Le bilan en image existait déjà ; le lien partagé, lui, n'avait aucune
 * vignette — un rectangle gris dans la conversation où l'on annonce ses
 * 61 %. Ce test vérifie ce qu'un robot d'indexation vérifiera : la balise
 * existe, son URL est absolue, et le fichier est bien là.
 */
test('le lien partagé porte une image de prévisualisation servie par le site', async ({
  page,
  request,
}) => {
  await page.goto('/')

  const contenu = async (propriete: string) =>
    page.locator(`meta[property="${propriete}"]`).getAttribute('content')

  const image = await contenu('og:image')
  expect(image).toBeTruthy()
  // Les réseaux sociaux ne résolvent pas les chemins relatifs : une URL
  // relative produit exactement le rectangle gris qu'on cherche à éviter.
  expect(image).toMatch(/^https:\/\//)
  expect(await contenu('og:image:width')).toBe('1200')
  expect(await contenu('og:image:height')).toBe('630')
  // Une image sans alternative textuelle n'est pas lisible par tout le monde.
  expect(await contenu('og:image:alt')).toBeTruthy()
  expect(
    await page.locator('meta[name="twitter:card"]').getAttribute('content'),
  ).toBe('summary_large_image')

  // Et le fichier est réellement servi : une balise qui pointe vers un 404
  // est pire que pas de balise du tout.
  const reponse = await request.get('og-image.png')
  expect(reponse.status()).toBe(200)
  const octets = await reponse.body()
  expect([...octets.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  expect(octets.byteLength).toBeGreaterThan(10_000)
})
