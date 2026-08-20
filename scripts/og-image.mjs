/**
 * Fabrique l'image de prévisualisation (og:image) du site — issue #8.
 *
 * Elle est *générée*, pas dessinée à la main : la palette, la balise et les
 * mots viennent du produit, et un changement d'identité se reporte en
 * relançant `npm run og-image`. Le PNG produit est versionné, parce qu'un
 * robot d'indexation ne lance pas de script.
 *
 * Aucune police distante : les mêmes piles système que l'application.
 */
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const SORTIE = join(racine, 'public', 'og-image.png')

/** Format attendu par les réseaux sociaux (ratio 1,91:1). */
const LARGEUR = 1200
const HAUTEUR = 630

const page = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${LARGEUR}px; height: ${HAUTEUR}px;
    background: #1e2b23; color: #faf7f2;
    font-family: 'Avenir Next', 'Futura', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;
    display: grid; grid-template-columns: 1fr 452px; align-items: center;
    gap: 72px; padding: 80px 88px;
  }
  .balise { display: flex; flex-direction: column; width: 132px; border-radius: 6px; overflow: hidden; }
  /* flex: none — sans quoi les deux barres se font écraser par le centrage. */
  .balise span { flex: 0 0 30px; }
  .blanc { background: #faf7f2; }
  .rouge { background: #c8102e; }
  .texte { display: flex; flex-direction: column; gap: 26px; }
  h1 { font-size: 86px; line-height: 1; letter-spacing: -0.02em; }
  .accroche { font-size: 36px; line-height: 1.3; color: #e7e9e4; max-width: 22ch; }
  .pied { font-size: 23px; line-height: 1.4; color: #97a89a; }
  .pied strong { color: #e7e9e4; font-weight: 600; }

  /* Un aperçu de ce que l'application montre : le chiffre est l'accroche. */
  .carte {
    background: #faf7f2; color: #1e2b23; border-radius: 14px;
    padding: 34px 36px; display: flex; flex-direction: column; gap: 10px;
  }
  .carte .quoi { font-size: 22px; color: #5a6b5d; letter-spacing: 0.06em; text-transform: uppercase; }
  .carte .pct { font-size: 92px; line-height: 1; font-weight: 700; }
  .carte .km { font-size: 20px; color: #5a6b5d; white-space: nowrap; }
  .jauge { height: 14px; border-radius: 7px; background: #e7e9e4; overflow: hidden; margin-top: 8px; }
  .jauge span { display: block; height: 100%; width: 61%; background: #c8102e; }
</style></head><body>
  <div class="texte">
    <div class="balise"><span class="blanc"></span><span class="rouge"></span></div>
    <h1>Sentiers</h1>
    <p class="accroche">Quelle part des sentiers balisés avez-vous déjà parcourue&nbsp;?</p>
    <p class="pied">Vos traces GPX, lues dans votre navigateur.<br><strong>Sans compte, sans serveur.</strong></p>
  </div>
  <div class="carte">
    <span class="quoi">GR 7 · Pilat</span>
    <span class="pct">61 %</span>
    <div class="jauge"><span></span></div>
    <span class="km">38,2 km parcourus · 24,4 km restants</span>
  </div>
</body></html>`

const navigateur = await chromium.launch({
  ...(process.env['PW_CHROMIUM_PATH']
    ? { executablePath: process.env['PW_CHROMIUM_PATH'] }
    : {}),
})
const onglet = await navigateur.newPage({
  viewport: { width: LARGEUR, height: HAUTEUR },
  deviceScaleFactor: 1,
})
await onglet.setContent(page)
await onglet.screenshot({ path: SORTIE })
await navigateur.close()
console.log(`og:image écrite dans ${SORTIE}`)
