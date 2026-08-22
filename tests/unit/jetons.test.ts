import { describe, it, expect } from 'vitest'
import indexCssBrut from '../../src/index.css?raw'

/**
 * Tous les jetons employés existent (revue du design system).
 *
 * `--vert-foret` était utilisé dans `Backup.module.css` et défini nulle
 * part. En CSS, cela ne casse rien de visible : la déclaration est invalide,
 * la propriété n'est pas appliquée, et l'élément hérite. Le bouton n'avait
 * donc pas la couleur qu'on croyait lui avoir donnée, et rien ne le disait —
 * ni le navigateur, ni le lint, ni une relecture.
 *
 * Les feuilles sont lues par `import.meta.glob` plutôt que par `node:fs` :
 * pas de types Node à installer, et une seule façon de résoudre les chemins,
 * la même que celle du build.
 */
const feuillesBrutes = import.meta.glob('../../src/components/*.module.css', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Les variables posées en ligne par un composant, avec une valeur de repli. */
const POSEES_EN_LIGNE = new Set(['--stripe-color'])

/**
 * Les commentaires sont retirés avant tout examen. Sans cela, « issue #169 »
 * est lu comme une couleur écrite en dur — le premier essai de ce test a
 * échoué exactement là-dessus.
 */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

const indexCss = sansCommentaires(indexCssBrut)

const feuilles: { nom: string; css: string }[] = Object.entries(feuillesBrutes)
  .map(([chemin, css]) => ({
    nom: chemin.split('/').pop() ?? chemin,
    css: sansCommentaires(css),
  }))
  .sort((a, b) => a.nom.localeCompare(b.nom))

const definis = new Set(
  [...indexCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1] as string),
)

describe('les jetons du design system', () => {
  it('sont lus, et il y en a un nombre plausible', () => {
    // Un glob qui ne trouve rien rendrait tous les tests suivants verts pour
    // la pire raison : ils n'auraient rien examiné.
    expect(feuilles.length).toBeGreaterThan(15)
    expect(definis.size).toBeGreaterThan(25)
  })

  it('sont tous définis là où ils sont employés', () => {
    const manquants: string[] = []
    for (const { nom, css } of [...feuilles, { nom: 'index.css', css: indexCss }]) {
      for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        const jeton = m[1] as string
        if (definis.has(jeton) || POSEES_EN_LIGNE.has(jeton)) continue
        manquants.push(`${nom} → ${jeton}`)
      }
    }
    expect(manquants).toEqual([])
  })

  it('sont employés plutôt que recopiés en dur pour les tailles', () => {
    // Quarante-six tailles étaient écrites en dur, dont quatre valeurs pour
    // une même intention. Ce test empêche la dérive de recommencer.
    const enDur: string[] = []
    for (const { nom, css } of feuilles) {
      for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
        const valeur = (m[1] as string).trim()
        if (valeur.startsWith('var(--')) continue
        // `inherit` et les tailles relatives suivent l'échelle au lieu de la
        // contourner : elles ne sont pas une dérive.
        //
        // L'expression est ancrée à dessein. Une première version excluait
        // tout ce qui « finit par em » — ce qui avale aussi `rem`, donc
        // précisément ce que ce test doit attraper. Vérifié : le garde-fou
        // était devenu creux, et seule la réintroduction du défaut l'a montré.
        if (valeur === 'inherit' || /^[\d.]+(%|em)$/.test(valeur)) continue
        enDur.push(`${nom} → font-size: ${valeur}`)
      }
    }
    expect(enDur).toEqual([])
  })

  it('sont employés plutôt que recopiés en dur pour les couleurs', () => {
    const enDur: string[] = []
    for (const { nom, css } of feuilles) {
      for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        enDur.push(`${nom} → ${m[0]}`)
      }
    }
    expect(enDur).toEqual([])
  })
})
