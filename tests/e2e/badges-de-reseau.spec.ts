import { test, expect, type Page } from '@playwright/test'
import {
  afficherTousLesReseaux,
  badgesPeints,
  buildGpx,
  mockExternalNetwork,
  pilatInternationalEtInconnu,
} from './helpers.ts'

/**
 * Un badge de réseau peint-il quelque chose ? (issue #422)
 *
 * ## Le défaut
 *
 * Cinq feuilles peignent le badge, et **chacune écrit ses sept classes à la
 * main** : les modules CSS n'ont pas de boucle. Le composant fait
 * `styles[itin.network]`, qui rend `undefined` sans que TypeScript n'ait rien
 * à dire — la chaîne de classes contient alors le mot « undefined », et le
 * badge n'a aucun fond.
 *
 * `INTERNATIONAL` et `INCONNU` n'avaient de classe ni dans « Prochaine
 * sortie » ni dans « Objectifs ». Le badge y occupait sa place, portait son
 * texte en `--texte-sur-couleur` — du blanc, prévu pour être lu sur un aplat
 * de balisage — et laissait voir la surface blanche de la ligne dessous.
 *
 * ## Pourquoi rien ne l'avait vu
 *
 * Trois gardes existaient, et aucune ne pouvait le trouver :
 *
 * - `tests/unit/badgesDeReseau.test.ts` ne lisait que `Itinerary*.module.css`
 *   — un motif de nom de fichier, alors que deux des cinq feuilles n'y
 *   répondent pas (§6quinquies) ;
 * - `tests/e2e/contraste-rendu.spec.ts` mesure le contraste réellement peint,
 *   mais ne traverse pas ces deux panneaux ;
 * - aucune fixture ne produisait un itinéraire `INTERNATIONAL` ou `INCONNU` :
 *   même une sonde qui les aurait regardés n'aurait rien eu à voir.
 *
 * ## Ce qu'on demande ici
 *
 * Pas « le badge est-il visible ? » — `toBeVisible` répond oui, il a un
 * rectangle non vide, et c'est le piège du §1bis. Mais **quelle couleur est
 * peinte ici, et laquelle est peinte dessous.** Deux couleurs égales, c'est
 * un badge qui n'existe pas.
 */

async function chargerAvecLesDeuxReseauxRares(page: Page): Promise<void> {
  const overpass = await mockExternalNetwork(page)
  overpass.setFixture(pilatInternationalEtInconnu())
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
}

/**
 * Le constat, formulé une fois pour les deux panneaux : chaque badge peint
 * une couleur, et ce n'est pas celle du fond derrière lui.
 */
function aucunBadgeInvisible(
  badges: { reseau: string; fond: string; derriere: string }[],
): void {
  expect(badges.length, 'aucun badge à mesurer : la sonde ne garde rien').toBeGreaterThan(0)
  for (const badge of badges) {
    expect(
      badge.fond,
      `le badge ${badge.reseau} n’a pas de fond : sa classe de réseau manque, ` +
        `on voit donc ${badge.derriere} au travers`,
    ).not.toMatch(/rgba\([^)]*,\s*0\)/)
    expect(
      badge.fond,
      `le badge ${badge.reseau} est peint de la couleur du fond (${badge.derriere}) : rien à voir`,
    ).not.toBe(badge.derriere)
  }
}

test('« Prochaine sortie » peint un fond sous chaque badge', async ({
  page,
}) => {
  await chargerAvecLesDeuxReseauxRares(page)
  await expect(page.getByTestId('next-outing')).toBeVisible()

  const badges = await badgesPeints(page, 'next-outing')
  /*
    Les deux réseaux du défaut doivent être là, sinon la mesure ne prouve
    rien. C'est le §1bis : une assertion qui ne peut pas échouer n'en est
    pas une, et une sonde qui mesure zéro badge « passe » sans rien voir.
  */
  expect(badges.map((b) => b.reseau).sort()).toContain('INTERNATIONAL')
  expect(badges.map((b) => b.reseau).sort()).toContain('INCONNU')
  aucunBadgeInvisible(badges)
})

test('« Objectifs » peint un fond sous chaque badge', async ({ page }) => {
  await chargerAvecLesDeuxReseauxRares(page)

  /*
    Un objectif s'épingle depuis la carte de l'itinéraire — c'est là qu'on
    voit ce qu'il reste. On en pose deux, un par réseau, pour que les deux
    badges du défaut soient à l'écran en même temps.
  */
  for (const nom of [/Via Lugdunum/, /Tour du Pilat/]) {
    await page
      .getByTestId('itinerary-list')
      .getByRole('button', { name: nom })
      .first()
      .click()
    await page.getByTestId('itinerary-card-objectif').click()
    await page.getByTestId('itinerary-card-close').click()
  }

  const liste = page.getByTestId('objectifs-list')
  await expect(liste).toBeVisible()

  const badges = await badgesPeints(page, 'objectifs-list')
  expect(badges.map((b) => b.reseau).sort()).toEqual(['INCONNU', 'INTERNATIONAL'])
  aucunBadgeInvisible(badges)
})

/**
 * Une trace importée ne change pas la question, mais elle change les
 * propositions : sans elle, « Prochaine sortie » ne classe rien.
 */
test('les badges restent peints une fois une sortie enregistrée', async ({
  page,
}) => {
  await chargerAvecLesDeuxReseauxRares(page)
  await page.getByTestId('gpx-input').setInputFiles({
    name: 'sortie.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(buildGpx(15), 'utf-8'),
  })
  await expect(page.getByTestId('global-pct')).toBeVisible()

  aucunBadgeInvisible(await badgesPeints(page, 'itinerary-list'))
})
