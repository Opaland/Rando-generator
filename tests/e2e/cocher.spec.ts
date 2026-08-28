import { test, expect } from '@playwright/test'
import { activerLeGrosTexte, cocher, mockExternalNetwork } from './helpers.ts'

/**
 * La garde de `cocher()` — celle qui manquait au moment où on l'a écrite.
 *
 * `cocher` remplace `locator.check()` partout dans cette suite, parce que
 * `.check()` photographie un état qui met un temps non nul à s'établir
 * (CLAUDE.md §6ter). Le remplacement paraissait équivalent. Il ne l'était
 * pas : `.check()` ne fait **rien** sur une commande déjà cochée, tandis
 * qu'un clic sur une **case** déjà cochée la décoche.
 *
 * Aucun des dix-huit appels remplacés n'exerçait ce cas — la suite était
 * verte, et l'est restée. Le défaut n'a été trouvé qu'en revue de sprint, par
 * la question inverse : « qu'est-ce que ce correctif a **retiré** ? ».
 *
 * Un radio ne le montre jamais : recliquer un radio coché le laisse coché.
 * C'est ce qui rendait le trou invisible, et c'est pourquoi ce test vise une
 * case, `gros-texte`, et pas un bouton radio.
 *
 * Vérifié : sans la garde d'idempotence, ce test rougit sur
 * `toBeChecked()`.
 */
test('cocher() ne décoche pas ce qui est déjà coché', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  // Le chemin réel du dépôt jusqu'à la commande, accordéon compris — une
  // sonde se configure comme la vraie, §1bis.
  await activerLeGrosTexte(page, false)

  const bascule = page.getByTestId('gros-texte')
  await expect(bascule).toBeChecked()

  await cocher(bascule)
  await expect(bascule).toBeChecked()
  // Et l'effet reste posé sur la racine : la case n'a pas seulement l'air
  // cochée, le gros texte est toujours actif.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset['grosTexte']),
    )
    .toBe('oui')
})
