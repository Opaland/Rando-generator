import { test, expect } from '@playwright/test'
import { mockExternalNetwork, fermerLeGuide } from './helpers.ts'

/**
 * AUDIT_UX.md, constat U5 — « 0 % parcourus » s'affichait avant qu'il y ait
 * quoi que ce soit à parcourir.
 *
 * Ce n'est pas seulement un mauvais premier chiffre : c'est un chiffre
 * **faux**. Il n'y a pas 0 % de parcouru quand il n'y a rien à parcourir. Le
 * libellé « Zones, traces et réglages » existait pour ce cas et cédait dès
 * que le calcul rendait 0 au lieu de rien — parce qu'une division par zéro
 * doit bien rendre quelque chose.
 *
 * Les deux moitiés sont gardées : se taire quand il n'y a rien, et parler
 * dès qu'il y a de quoi. Un test qui ne vérifierait que la première
 * laisserait passer une poignée devenue muette pour toujours.
 */

test.use({ viewport: { width: 390, height: 844 } })

test('sans rien de chargé, la poignée ne donne pas de pourcentage', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)

  const poignee = page.getByTestId('sheet-handle')
  await expect(poignee).toContainText('Zones, traces et réglages')
  // Et elle ne le donne toujours pas après que le calcul a eu le temps de
  // tourner à vide : c'est là que le zéro apparaissait.
  await page.waitForTimeout(1500)
  await expect(poignee).toContainText('Zones, traces et réglages')
  await expect(poignee).not.toContainText('%')
})

test('dès qu’une zone est chargée, elle donne le pourcentage', async ({
  page,
}) => {
  await mockExternalNetwork(page)
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('3 itinéraires', {
    timeout: 15_000,
  })

  // Zéro pour cent d'un parcours qu'on n'a pas encore marché est une vraie
  // mesure : il y a un dénominateur.
  await expect(page.getByTestId('sheet-handle')).toContainText('% parcourus', {
    timeout: 15_000,
  })
})
