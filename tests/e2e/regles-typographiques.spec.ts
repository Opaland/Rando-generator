import { test, expect, type Page } from '@playwright/test'
import {
  activerLeGrosTexte,
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
  ouvrirOnglet,
  surChaqueOnglet,
} from './helpers.ts'

/**
 * Le plancher typographique — la règle existait, la garde manquait.
 *
 * ## Ce qui a déclenché ce fichier, et ce qu'il faut en retenir
 *
 * J'ai mesuré les tailles de texte sur une fenêtre de 390 px **pilotée à la
 * souris**, et compté soixante-dix textes sous 14 px. J'allais le rapporter
 * comme un défaut, et comme une phrase devenue fausse dans `core/affichage.ts`
 * — « le plancher typographique tient à 14 px en extérieur ».
 *
 * La phrase est vraie. C'est ma mesure qui était fausse : le plancher vit
 * sous `@media (pointer: coarse)`, et une fenêtre étroite pilotée à la souris
 * n'est pas un téléphone. Au doigt, il reste **quatre** textes sous 14 px, à
 * 13 px, et tous les quatre sont des exclusions **nommées et motivées** dans
 * `index.css`. En gros texte, il n'en reste aucun.
 *
 * C'est exactement le piège que CLAUDE.md §1bis consigne, et que j'avais cité
 * une heure plus tôt. Il ne s'est pas refermé sur un test, mais sur une
 * mesure jetable — ce qui est pire, parce qu'une mesure jetable ne passe par
 * aucune revue.
 *
 * ## Ce que ce fichier garde
 *
 * Rien de ce qu'il vérifie n'est cassé aujourd'hui. Il existe parce que la
 * règle n'était tenue que par du CSS que personne ne relit : supprimer le
 * bloc `@media (pointer: coarse)` d'`index.css` ne faisait rougir aucun test,
 * alors que c'est lui qui rend l'application lisible dehors.
 *
 * Le plancher n'est pas inventé : **14 px est écrit dans le CSS**, avec sa
 * raison (« l'écran est tenu à bout de bras, souvent au soleil, parfois
 * derrière des verres polarisés »), et les exclusions y sont nommées une par
 * une. La sonde ne fait que rendre exigible ce que le design system déclare.
 */

const LARGEURS = [
  { nom: 'téléphone', width: 390, height: 844, tactile: true },
  { nom: 'point de rupture', width: 800, height: 900, tactile: true },
] as const

/** Le plancher, en pixels, tel que `index.css` l'écrit sous `pointer: coarse`. */
const PLANCHER_TACTILE = 14

/**
 * Ce qui a le droit de rester en dessous, et pourquoi.
 *
 * Chaque entrée reprend une exclusion **déjà écrite dans `index.css`** : la
 * sonde ne décide de rien, elle refuse seulement qu'on en ajoute une
 * cinquième sans le dire.
 */
const SOUS_LE_PLANCHER: { selecteur: string; pourquoi: string }[] = [
  {
    selecteur: '[class*="badge"]',
    pourquoi:
      'badges de réseau : deux ou trois capitales grasses sur fond plein, ' +
      'contraintes en largeur dans les listes, lues d’un coup d’œil',
  },
  {
    selecteur: '.maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib *',
    pourquoi:
      'attribution de carte : dépliée, elle occupe déjà le quart d’une ' +
      'carte de téléphone, et c’est une phrase dense qu’on consulte une fois',
  },
]

interface TexteMesure {
  quoi: string
  px: number
}

/**
 * Toutes les tailles de texte réellement rendues, hors exclusions nommées.
 *
 * On lit la taille sur l'élément qui **porte le texte**, pas sur ses
 * ancêtres : un conteneur en 15 px dont l'enfant est en 11 px doit rendre 11.
 */
async function tropPetits(
  page: Page,
  plancher: number,
): Promise<TexteMesure[]> {
  return page.evaluate(
    ({ plancher: seuil, exclusions }) => {
      const trouves: { quoi: string; px: number }[] = []
      for (const el of Array.from(document.querySelectorAll('*'))) {
        if (!(el instanceof HTMLElement)) continue
        const texte = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim()
        if (texte.length === 0) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (exclusions.some((s) => el.matches(s) || el.closest(s) !== null)) {
          continue
        }
        const px = Number.parseFloat(getComputedStyle(el).fontSize)
        if (px >= seuil) continue
        trouves.push({
          quoi: `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]} « ${texte.slice(0, 28)} »`,
          px: Math.round(px * 100) / 100,
        })
      }
      return trouves
    },
    { plancher, exclusions: SOUS_LE_PLANCHER.map((e) => e.selecteur) },
  )
}

async function atteindre(
  page: Page,
  compact: boolean,
  grosTexte: boolean,
): Promise<void> {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await fermerLeGuide(page)
  if (grosTexte) {
    await activerLeGrosTexte(page, compact)
    // L'onglet filtre sur téléphone : revenir là où se choisit une zone.
    if (compact) await ouvrirOnglet(page, 'carte')
  }
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
}

for (const vue of LARGEURS) {
  for (const grosTexte of [false, true]) {
    test.describe(`plancher typographique — ${vue.nom}${grosTexte ? ', gros texte' : ''}`, () => {
      test.use({
        viewport: { width: vue.width, height: vue.height },
        hasTouch: vue.tactile,
      })

      /**
       * `hasTouch` n'est pas un détail de confort : sans lui, la sonde
       * mesure les paliers de bureau en croyant mesurer ceux du doigt, et
       * rend trente-quatre faux positifs au lieu de zéro. C'est la mesure
       * qui a failli me faire rapporter un défaut inexistant.
       */
      test('aucun texte sous le plancher, hors exclusions nommées', async ({
        page,
      }) => {
        await atteindre(page, vue.tactile, grosTexte)
        const petits = new Map<string, number>()
        // L'onglet filtre sur téléphone : n'en regarder qu'un ne garderait
        // qu'un quart de l'application (§6quinquies).
        await surChaqueOnglet(page, async () => {
          for (const t of await tropPetits(page, PLANCHER_TACTILE)) {
            petits.set(t.quoi, t.px)
          }
        })
        expect(
          [...petits.entries()].map(([q, px]) => `${String(px)} px — ${q}`),
          'des textes passent sous 14 px là où l’écran se lit à bout de bras',
        ).toEqual([])
      })
    })
  }
}

/**
 * Les exclusions ne sont pas un blanc-seing : ce qui est dessous a quand même
 * un plancher, celui du plus petit palier que le design system déclare.
 *
 * Sans cette seconde question, la liste d'exclusions deviendrait l'endroit où
 * l'on range ce qu'on ne veut pas corriger — et une règle qui excuse tout ne
 * garde rien.
 */
test.describe('ce qui est sous le plancher a quand même un fond', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('rien ne descend sous le plus petit palier déclaré', async ({
    page,
  }) => {
    await atteindre(page, true, false)
    const mesures = await page.evaluate(() => {
      const racine = getComputedStyle(document.documentElement)
      const enPx = (jeton: string) => {
        const brut = racine.getPropertyValue(jeton).trim()
        const rem = Number.parseFloat(brut)
        const base = Number.parseFloat(getComputedStyle(document.body).fontSize)
        return brut.endsWith('rem')
          ? rem * 16
          : brut.endsWith('px')
            ? rem
            : rem * base
      }
      const plusPetit = enPx('--texte-etiquette')
      const trop: { quoi: string; px: number }[] = []
      for (const el of Array.from(document.querySelectorAll('*'))) {
        if (!(el instanceof HTMLElement)) continue
        const texte = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim()
        if (texte.length === 0) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const px = Number.parseFloat(getComputedStyle(el).fontSize)
        if (px + 0.01 < plusPetit) {
          trop.push({
            quoi: `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`,
            px: Math.round(px * 100) / 100,
          })
        }
      }
      return { plusPetit, trop }
    })
    expect(
      mesures.trop,
      `sous le plus petit palier déclaré (${String(mesures.plusPetit)} px) : ${JSON.stringify(mesures.trop)}`,
    ).toEqual([])
  })
})
