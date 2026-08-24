import { test, expect, type Page } from '@playwright/test'
import {
  fermerLeGuide,
  mockElevation,
  mockExternalNetwork,
  mockTilesOk,
} from './helpers.ts'

/**
 * Les règles de clavier — première question : **le focus se voit-il ?**
 *
 * `docs/AUDIT_UX_24_08.md` §6 listait cinq surfaces non auscultées. Celle-ci
 * décide si l'application est utilisable sans souris : un focus qu'on ne voit
 * pas laisse la personne appuyer sur Entrée sans savoir sur quoi.
 *
 * ## Pourquoi mesurer des pixels et non des styles
 *
 * `outline: var(--anneau-focus)` se lit très bien, et le jeton portait le mot
 * « focus ». Il valait `0 0 0 1px var(--rouge-balisage)` — quatre longueurs et
 * une couleur, c'est-à-dire une valeur de `box-shadow`.
 *
 * Ce n'est pas une déclaration ignorée. Une substitution de `var()` qui
 * produit une valeur invalide rend la déclaration **invalide au moment du
 * calcul** : la propriété retombe à sa valeur *initiale* au lieu de laisser
 * gagner la règle du dessous. `outline-style` revenait donc à `none`, et le
 * liseré de `button:focus-visible` disparaissait avec.
 *
 * Un test sur `getComputedStyle` d'une règle générale aurait conclu « le focus
 * est visible » — vrai, mais pour une autre raison que celle qu'on croyait,
 * ce que CLAUDE.md §1bis interdit d'appeler une assertion. Une mesure de
 * pixels ne peut pas se tromper de raison : on demande à l'écran ce qui
 * change, pas au code ce qu'il a l'intention de faire.
 *
 * Mesuré avant correction, onglet actif : `outline: none 0px` alors que
 * `:focus-visible` s'applique, et **pas un pixel** ne changeait.
 *
 * ## Ce que cette sonde ne demande pas
 *
 * Elle ne demande pas si le focus va *au bon endroit*, ni s'il entre dans ce
 * qui est replié — c'est une autre question, et elle a sa propre sonde.
 */

const LARGEURS = [
  { nom: 'téléphone', width: 390, height: 844, tactile: true },
  { nom: 'PC', width: 1280, height: 800, tactile: false },
] as const

/**
 * Le nombre d'arrêts de tabulation qu'on ausculte.
 *
 * Ce n'est pas une borne de qualité mais de durée : chaque arrêt coûte deux
 * captures. La boucle s'arrête d'elle-même dès que la tabulation reboucle, et
 * la mesure du nombre d'arrêts atteints est assertée — un plafond silencieux
 * se lirait comme une couverture complète.
 */
const ARRETS_MAX = 60

interface Arret {
  /** Ce qui a le focus, décrit pour un humain qui lit un échec. */
  quoi: string
  rect: { x: number; y: number; width: number; height: number }
  /** Vrai si le centre de l'élément est réellement peint par lui. */
  peint: boolean
  dansLeCadre: boolean
}

async function arretCourant(page: Page): Promise<Arret | null> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body || !(el instanceof HTMLElement)) return null
    const r = el.getBoundingClientRect()
    const centreX = r.x + r.width / 2
    const centreY = r.y + r.height / 2
    const dansLeCadre =
      r.width > 0 &&
      r.height > 0 &&
      centreX >= 0 &&
      centreY >= 0 &&
      centreX <= window.innerWidth &&
      centreY <= window.innerHeight
    const dessus = dansLeCadre
      ? document.elementFromPoint(centreX, centreY)
      : null
    // Le libellé accessible d'abord : c'est ce qu'une personne entendrait, et
    // un sélecteur seul ne dit rien quand il y a quinze boutons.
    const nom =
      el.getAttribute('aria-label') ??
      el.getAttribute('data-testid') ??
      el.textContent.trim().slice(0, 40)
    return {
      quoi: `${el.tagName.toLowerCase()}${nom ? ` « ${nom} »` : ''}`,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      peint:
        dessus !== null &&
        (dessus === el || el.contains(dessus) || dessus.contains(el)),
      dansLeCadre,
    }
  })
}

/** Le cadre à photographier : l'élément, plus la place que prend son liseré. */
function cadreAutour(
  rect: Arret['rect'],
  vue: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  // Le liseré le plus large de l'application déborde de 10 px : contour de
  // 3 px posé à 2 px d'écart, puis cerne d'ombre à 8 px. Douze laisse de la
  // marge sans englober le voisin.
  const marge = 12
  const x = Math.max(0, Math.floor(rect.x - marge))
  const y = Math.max(0, Math.floor(rect.y - marge))
  return {
    x,
    y,
    width: Math.min(vue.width - x, Math.ceil(rect.width + marge * 2)),
    height: Math.min(vue.height - y, Math.ceil(rect.height + marge * 2)),
  }
}

async function atteindre(page: Page): Promise<void> {
  await mockExternalNetwork(page)
  await mockTilesOk(page)
  await mockElevation(page)
  /*
    Les transitions sont coupées pour cette suite.

    Deux captures séparées d'une animation diffèrent **toujours**, et la sonde
    conclurait « le focus se voit » sur une feuille en train de bouger. C'est
    le mode d'échec du §1bis dans le sens qui rassure à tort. La précaution ne
    masque rien : un liseré de focus n'est pas une animation.
  */
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await fermerLeGuide(page)
  await page.getByTestId('zone-pilat').click()
  await expect(page.getByTestId('zone-meta')).toContainText('itinéraire', {
    timeout: 15_000,
  })
}

for (const vue of LARGEURS) {
  test.describe(`le focus se voit — ${vue.nom}`, () => {
    test.use({
      viewport: { width: vue.width, height: vue.height },
      hasTouch: vue.tactile,
    })

    /**
     * On photographie deux fois le même rectangle — l'élément au focus, puis
     * le même sans focus — et on compare les octets. Chromium encode le PNG
     * de façon déterministe : sur une page immobile, des octets identiques
     * disent qu'**aucun pixel n'a changé**, donc que rien n'annonce le focus.
     */
    test('chaque arrêt de tabulation change quelque chose à l’écran', async ({
      page,
    }) => {
      await atteindre(page)
      const invisibles: string[] = []
      const vus: string[] = []
      let mesures = 0

      for (let i = 0; i < ARRETS_MAX; i++) {
        await page.keyboard.press('Tab')
        const arret = await arretCourant(page)
        if (!arret) break
        // Un tour complet : la tabulation est revenue à son premier arrêt.
        if (i > 0 && vus[0] === arret.quoi) break
        vus.push(arret.quoi)

        /*
          On ne juge que ce qui est peint.

          Un élément recouvert par la feuille — l'attribution de la carte
          derrière un panneau à mi-hauteur — n'a évidemment aucun pixel qui
          change au focus, et le dire ici serait répondre à une autre question
          que celle posée. C'est **une vraie question**, et elle n'est pas
          esquivée : elle appartient à la sonde de ce qui reste atteignable au
          clavier, où ce même élément est un constat et non une exception.

          L'exclusion est donc étroite par construction : ce qui n'est pas
          peint est mesuré ailleurs, jamais nulle part.
        */
        if (!arret.dansLeCadre || !arret.peint) continue

        const cadre = cadreAutour(arret.rect, vue)
        if (cadre.width <= 0 || cadre.height <= 0) continue

        const poigne = await page.evaluateHandle(() => document.activeElement)
        const avecFocus = await page.screenshot({ clip: cadre })
        await poigne.evaluate((el) => {
          ;(el as HTMLElement).blur()
        })
        const sansFocus = await page.screenshot({ clip: cadre })
        // On rend le focus à l'élément avant de continuer : sans cela, la
        // tabulation repartirait du début du document et la suite du parcours
        // ne serait pas celle qu'on croit auditer.
        await poigne.evaluate((el) => {
          ;(el as HTMLElement).focus()
        })
        await poigne.dispose()

        mesures++
        if (avecFocus.equals(sansFocus)) invisibles.push(arret.quoi)
      }

      // Sans ces deux bornes, une sonde qui n'atteindrait plus rien —
      // sélecteur cassé, page vide — resterait verte en ne mesurant rien.
      expect(vus.length, 'la tabulation n’atteint rien').toBeGreaterThan(10)
      expect(mesures, 'aucun arrêt n’a pu être mesuré').toBeGreaterThan(10)
      expect(
        invisibles,
        `rien ne change à l’écran au focus de : ${invisibles.join(', ')}`,
      ).toEqual([])
    })
  })
}
