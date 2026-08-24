import { describe, it, expect } from 'vitest'

/**
 * Un jeton de forme `box-shadow` posé en `outline` supprime le liseré.
 *
 * `--anneau-focus` valait `0 0 0 1px var(--rouge-balisage)` — une valeur de
 * `box-shadow`. Trois feuilles l'employaient en `outline`.
 *
 * Ce n'est pas une déclaration ignorée. Une substitution de `var()` qui
 * produit une valeur invalide rend la déclaration **invalide au moment du
 * calcul** : la propriété retombe à sa valeur *initiale* au lieu de laisser
 * gagner la règle du dessous. `outline-style` revient donc à `none`, et le
 * liseré de `button:focus-visible` disparaît avec.
 *
 * Mesuré sur l'onglet actif de la barre : `outline: none 0px` alors que
 * `:focus-visible` s'applique. **Une erreur de syntaxe aurait été moins
 * grave** — celle-là, la cascade la rattrape.
 *
 * `tests/e2e/regles-de-clavier.spec.ts` mesure les pixels et attrape le cas
 * où plus rien n'est visible. Il ne peut pas attraper celui-ci quand une
 * ombre voisine masque la perte : sur les commandes de zoom du profil, le
 * halo de la règle générale restait, et seul le contour manquait. C'est
 * pourquoi cette garde-ci est statique, et pourquoi les deux existent.
 */

/**
 * Les feuilles sont lues par `import.meta.glob`, comme `jetons.test.ts` :
 * pas de types Node à installer, et une seule façon de résoudre les chemins,
 * la même que celle du build.
 */
const brutes: Record<string, string> = {
  ...import.meta.glob<string>('../../src/*.css', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>('../../src/components/**/*.css', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
}

/**
 * Les commentaires sont retirés avant tout examen. Sans cela, la note qui
 * explique le piège dans `index.css` — et qui cite `outline: var(...)` en
 * toutes lettres — serait lue comme une déclaration fautive. Le premier essai
 * de ce test a échoué exactement là-dessus.
 */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Les propriétés personnalisées déclarées, quel que soit le bloc. */
function jetonsDeclares(css: string): Map<string, string> {
  const jetons = new Map<string, string>()
  for (const [, nom, valeur] of css.matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi,
  )) {
    // La dernière déclaration gagne : c'est aussi ce que fait la cascade pour
    // les redéfinitions de gros texte et de contraste renforcé.
    jetons.set(nom as string, (valeur as string).trim())
  }
  return jetons
}

/** Une valeur d'`outline` commence par une largeur et un style de trait. */
function estUneFormeDeContour(valeur: string): boolean {
  return /^\s*(\d+(\.\d+)?(px|em|rem)|thin|medium|thick)\s+(solid|dashed|dotted|double|groove|ridge|inset|outset)\b/i.test(
    valeur,
  )
}

/** Une valeur de `box-shadow` porte au moins deux longueurs de décalage. */
function estUneFormeDOmbre(valeur: string): boolean {
  const sansInset = valeur.replace(/\binset\b/gi, '').trim()
  const longueurs = sansInset.match(/(^|\s)-?\d+(\.\d+)?(px|em|rem)?(?=\s|$)/g)
  return (longueurs?.length ?? 0) >= 2
}

const CSS: { nom: string; css: string }[] = Object.entries(brutes).map(
  ([chemin, css]) => ({
    nom: chemin.split('/').pop() ?? chemin,
    css: sansCommentaires(css),
  }),
)

describe('les jetons de liseré ne s’échangent pas', () => {
  const jetons = new Map<string, string>()
  for (const { css } of CSS) {
    for (const [nom, valeur] of jetonsDeclares(css)) jetons.set(nom, valeur)
  }

  it('trouve les deux jetons de liseré, chacun dans sa forme', () => {
    // Le test ne vaut que s'il lit vraiment les feuilles : sans cette
    // vérification, un chemin devenu faux rendrait tous les autres verts.
    expect(jetons.get('--contour-focus')).toBeDefined()
    expect(jetons.get('--anneau-selection')).toBeDefined()
    expect(estUneFormeDeContour(jetons.get('--contour-focus') as string)).toBe(
      true,
    )
    expect(estUneFormeDOmbre(jetons.get('--anneau-selection') as string)).toBe(
      true,
    )
  })

  it('aucune déclaration `outline` ne prend un jeton en forme d’ombre', () => {
    const fautives: string[] = []
    for (const { nom: fichier, css } of CSS) {
      for (const [, nom] of css.matchAll(
        /outline\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/gi,
      )) {
        const valeur = jetons.get(nom as string)
        if (valeur && !estUneFormeDeContour(valeur)) {
          fautives.push(
            `${fichier} → outline: var(${nom as string}) = « ${valeur} »`,
          )
        }
      }
    }
    expect(
      fautives,
      `ces déclarations effacent le liseré au lieu de le poser :\n${fautives.join('\n')}`,
    ).toEqual([])
  })

  it('aucune déclaration `box-shadow` ne prend un jeton en forme de contour', () => {
    const fautives: string[] = []
    for (const { nom: fichier, css } of CSS) {
      for (const [, nom] of css.matchAll(
        /box-shadow\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/gi,
      )) {
        const valeur = jetons.get(nom as string)
        if (valeur && !estUneFormeDOmbre(valeur)) {
          fautives.push(
            `${fichier} → box-shadow: var(${nom as string}) = « ${valeur} »`,
          )
        }
      }
    }
    expect(fautives).toEqual([])
  })

  /**
   * La garde ne vaut que si elle sait dire non : on lui présente les deux
   * échanges qu'elle doit refuser, sans toucher aux feuilles.
   */
  it('refuse bien l’échange qu’on lui demande de refuser', () => {
    expect(estUneFormeDeContour('0 0 0 1px #c8102e')).toBe(false)
    expect(estUneFormeDOmbre('2px solid #c8102e')).toBe(false)
    expect(estUneFormeDeContour('2px solid #c8102e')).toBe(true)
    expect(estUneFormeDOmbre('inset 0 2px 0 #c8102e')).toBe(true)
  })
})
