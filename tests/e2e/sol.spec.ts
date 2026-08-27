import { test, expect } from '@playwright/test'
import { afficherTousLesReseaux, mockExternalNetwork, openDetailFromMap } from './helpers.ts'

/**
 * Ce qu'il y a sous les pieds — ou sous les roues (issue #179).
 *
 * Nadia sort avec sa fille de onze ans en fauteuil tout-terrain. Elle ne
 * cherche pas « un parcours accessible » : l'étiquette ne veut rien dire, et
 * elle l'a déjà envoyée sur un sentier qu'elle n'a pas pu faire. Elle
 * cherche ce qu'il y a sous les roues, et elle sait parfaitement lire une
 * donnée absente.
 *
 * D'où le point dur de ce sprint, et il est à contre-courant du reste de
 * l'application : **ce filtre écarte ce qu'on ignore.** Tous les autres
 * laissent passer une donnée absente — ne pas connaître le dénivelé ne doit
 * pas faire disparaître un itinéraire d'une recherche. Ici, laisser passer
 * l'inconnu lui promettrait un chemin roulant que personne n'a vérifié.
 *
 * Sur le fixture du Pilat, trois cas **distincts** — et la distinction est
 * tout le test :
 *
 *   GR 7           dur 67 % + stabilisé 33 %      → roulant, gardé
 *   Sentier Crêtes stabilisé 41 % + naturel 59 %  → écarté, on sait que non
 *   Tour du Pilat  inconnu 100 %                  → écarté, on ne sait pas
 *
 * La première version de ce test n'avait pas le troisième cas : le fixture
 * ne contenait aucun tronçon réellement inconnu — celui que je croyais tel
 * était un `highway=track`, dont on **déduit** « naturel ». Le test
 * s'appelait « écarte ce dont on ne sait rien » et mesurait « écarte ce
 * qu'on sait naturel ». Une injection comptant l'inconnu comme roulant
 * restait verte (CLAUDE.md §1bis : une assertion qui passe pour une raison
 * qu'on n'a pas voulue n'est pas une assertion).
 *
 * Le cas manquant est arrivé par les **tags** du chemin 400, pas par un
 * chemin en plus. La première tentative ajoutait un tronçon sans tag au Tour
 * du Pilat : elle rallongeait l'itinéraire, donc le pourcentage global de la
 * zone, et **dix-neuf tests sans rapport** sont passés au rouge en affirmant
 * « 54,5 % » là où il y avait désormais « 46,2 % ». Un fixture partagé est
 * un oracle partagé : on y change ce qui se lit, jamais ce qui se mesure.
 * `highway=footway` sans `surface` n'est ni carrossable ni naturel — rien ne
 * s'en déduit, et la géométrie ne bouge pas d'un mètre.
 */
test('le filtre du sol écarte ce dont on ne sait rien', async ({ page }) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)

  const liste = page.getByTestId('itinerary-list')
  await expect(liste).toContainText('GR 7')
  await expect(liste).toContainText('Sentier des Crêtes')

  // Le panneau de filtres est replié par défaut : il faut l'ouvrir, comme
  // le fait `decouverte.spec.ts`.
  await page.getByTestId('discovery-filters').locator('summary').click()
  await page.getByTestId('list-sol').selectOption('roulant')

  await expect(liste).toContainText('GR 7')
  await expect(
    liste,
    'un itinéraire dont on sait qu’il est naturel a été présenté comme roulant',
  ).not.toContainText('Sentier des Crêtes')
  await expect(
    liste,
    'un itinéraire dont aucun tronçon n’a de revêtement renseigné a été présenté comme roulant — c’est la promesse fausse que Nadia redoute',
  ).not.toContainText('Tour du Pilat')
})

/**
 * L'autre moitié : les parts réelles, dans la fiche, **avec l'inconnu**.
 *
 * Le filtre ne garde que le tout-ou-rien, parce qu'un seuil du genre « 80 %
 * roulant » changerait ce qui est calculé et qu'aucune donnée ne permet de
 * le fixer (CLAUDE.md §2). Le cas limite se juge donc à l'œil, sur des
 * nombres — c'est le rôle de cette section.
 */
test('la fiche donne les parts de revêtement, sans noyer l’inconnu', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })
  await afficherTousLesReseaux(page)
  // Way 300 : `track` sans surface — propre au Sentier des Crêtes.
  await openDetailFromMap(page, 4.53, 45.405)

  const sol = page.getByTestId('detail-sol')
  await expect(sol).toBeVisible()
  await expect(sol).toContainText('Stabilisé')
  await expect(sol).toContainText('Naturel')
  await expect(
    sol,
    'la fiche laisse croire que « non renseigné » veut dire « facile »',
  ).toContainText('« Non renseigné » ne veut pas dire « facile »')
})
