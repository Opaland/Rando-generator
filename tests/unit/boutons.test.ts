import { describe, it, expect } from 'vitest'

/**
 * AUDIT_UX.md, constat U9 — trois traitements pour l'action principale.
 *
 * « Voir un exemple » portait son propre remplissage vert-noir quand
 * « Ajouter un itinéraire » — action principale elle aussi — était en rouge
 * balisage. Deux couleurs pour la même intention, et personne ne l'avait
 * décidé.
 *
 * Le correctif seul ne suffisait pas : `btn-primary` et une classe de module
 * ont **la même spécificité**, et c'est l'ordre de chargement des feuilles
 * qui tranche. Remettre le vert-noir dans la classe locale ne changeait donc
 * rien à l'écran — et le test de bout en bout ne voyait pas la mutation.
 *
 * Ce test-ci regarde la structure plutôt que le rendu : **une classe de
 * composant combinée à un bouton global ne redéclare pas sa peinture.** Le
 * jour où l'ordre des feuilles changera, la règle tiendra toujours.
 */

const feuilles: Record<string, string> = import.meta.glob(
  '../../src/components/*.module.css',
  { query: '?raw', import: 'default', eager: true },
)

const composants: Record<string, string> = import.meta.glob(
  '../../src/**/*.tsx',
  { query: '?raw', import: 'default', eager: true },
)

/** Les commentaires sont retirés avant tout examen (leçon de jetons.test.ts). */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Ce qu'un bouton global peint, et qu'une classe locale n'a pas à refaire. */
const PEINTURE = ['background', 'background-color', 'border-color', 'color']

/**
 * Les couples repérés dans le JSX : `btn-primary ${styles.demo}` dit que la
 * classe `demo` accompagne un bouton global.
 */
function couples(): { fichier: string; classe: string; bouton: string }[] {
  const trouves: { fichier: string; classe: string; bouton: string }[] = []
  const motif = /(btn-(?:primary|secondary|link|icon-close))\s+\$\{styles\.([A-Za-z0-9_]+)\}/g
  for (const [chemin, contenu] of Object.entries(composants)) {
    let m: RegExpExecArray | null
    while ((m = motif.exec(contenu)) !== null) {
      trouves.push({
        fichier: chemin.replace(/.*\//, ''),
        bouton: m[1] as string,
        classe: m[2] as string,
      })
    }
  }
  return trouves
}

/** Les propriétés déclarées par une règle `.classe { … }` d'une feuille. */
function declarations(css: string, classe: string): string[] {
  const motif = new RegExp(`\\.${classe}\\s*\\{([^}]*)\\}`, 'g')
  const proprietes: string[] = []
  let m: RegExpExecArray | null
  while ((m = motif.exec(sansCommentaires(css))) !== null) {
    for (const ligne of (m[1] as string).split(';')) {
      const nom = ligne.split(':')[0]?.trim()
      if (nom) proprietes.push(nom)
    }
  }
  return proprietes
}

describe('les boutons du système visuel', () => {
  it('repère bien les couples classe locale / bouton global', () => {
    // Sans cela, le test suivant passerait en ne regardant rien.
    expect(couples().length).toBeGreaterThan(0)
  })

  it('aucune classe locale ne repeint un bouton global', () => {
    const fautes: string[] = []
    for (const { fichier, classe, bouton } of couples()) {
      const chemin = Object.keys(feuilles).find((c) =>
        c.endsWith(fichier.replace('.tsx', '.module.css')),
      )
      if (!chemin) continue
      const proprietes = declarations(feuilles[chemin] ?? '', classe)
      for (const propriete of proprietes) {
        if (PEINTURE.includes(propriete)) {
          fautes.push(`${fichier} → .${classe} (avec ${bouton}) redéclare ${propriete}`)
        }
      }
    }
    expect(fautes).toEqual([])
  })
})
