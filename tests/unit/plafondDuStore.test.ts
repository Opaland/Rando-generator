import { describe, it, expect } from 'vitest'

/**
 * Le plafond du store (issues #155 et #298).
 *
 * ## Pourquoi un test et pas une résolution
 *
 * `appStore.ts` a été mesuré quatre fois : 1 566 lignes quand #155 a été
 * écrite, 2 252 avant les extractions, 1 920 après deux tranches, **1 988**
 * le lendemain matin. Deux tranches sorties, et le fichier avait déjà
 * repris 68 lignes en une nuit.
 *
 * Le constat de la revue globale du 25/08 : **l'extraction ne va pas plus
 * vite que l'ajout.** Une troisième tranche seule ne changerait rien à la
 * pente — elle déplacerait le point de départ, pas la direction.
 *
 * Ce dépôt sait quoi faire d'un chiffre qui dérive, et il l'a déjà fait
 * cinq fois : `terrainCouleurs`, `poiCouleurs`, `badgesDeReseau`,
 * `etatDeclare`, `jetonsDeFocus`. Une dette qu'on mesure une fois par cycle
 * regrossit entre deux mesures ; une dette qu'un test refuse ne regrossit
 * pas.
 *
 * ## Comment les plafonds sont posés
 *
 * **Sous la valeur courante, jamais dessus.** Un plafond posé à la valeur du
 * jour valide l'état du jour et n'empêche rien ; c'était le piège nommé dans
 * #298. Chacun laisse de quoi écrire un commentaire ou une garde — quelques
 * dizaines de lignes — et pas de quoi loger une fonctionnalité.
 *
 * Quand un plafond casse, il y a **deux réponses honnêtes** : sortir une
 * tranche, ou déplacer le plafond *en expliquant pourquoi la ligne a sa
 * place ici*. La seconde est légitime. Ce qui ne l'est pas, c'est de la
 * déplacer sans le dire — et c'est précisément ce qu'un nombre écrit dans un
 * test rend impossible.
 */

const fichiers: Record<string, string> = import.meta.glob<string>(
  '../../src/store/*.ts',
  { query: '?raw', import: 'default', eager: true },
)

/**
 * Les plafonds, en lignes. Chacun est **au-dessus** de la valeur mesurée le
 * 25/08 et **au-dessous** de ce qu'elle serait après une nuit d'ajouts.
 *
 * `appStore.ts` reste le plus gros de loin : c'est ce qu'il reste à
 * découper, et le plafond dit à quelle vitesse on accepte que ça traîne.
 */
const PLAFONDS: Record<string, number> = {
  'appStore.ts': 1_750,
  'trancheImport.ts': 480,
  'enregistrementSlice.ts': 370,
  'trancheTrace.ts': 360,
  'trancheFiche.ts': 260,
  'lecture.ts': 220,
  'veilleGeo.ts': 130,
  'matchingClient.ts': 110,
}

describe('le store ne regrossit pas en silence', () => {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const nom = chemin.split('/').pop() ?? chemin
    const plafond = PLAFONDS[nom]

    /*
      Un fichier ajouté à `src/store/` sans plafond passerait inaperçu, et le
      prochain millier de lignes s'y installerait tranquillement. C'est
      exactement le mode d'échec du §4 : une règle qu'on oublie d'étendre au
      cas suivant.
    */
    it(`${nom} a un plafond`, () => {
      expect(
        plafond,
        `${nom} est dans src/store/ sans plafond : ajoutez-en un dans PLAFONDS, au-dessus de sa taille actuelle et au-dessous de ce qu'on accepterait`,
      ).toBeDefined()
    })

    if (plafond === undefined) continue

    it(`${nom} tient sous ${String(plafond)} lignes`, () => {
      const lignes = contenu.split('\n').length
      expect(
        lignes,
        `${nom} fait ${String(lignes)} lignes pour un plafond de ${String(plafond)}. ` +
          `Deux réponses honnêtes : en sortir une tranche, ou relever le plafond ` +
          `en disant pourquoi ces lignes ont leur place ici. Pas de troisième.`,
      ).toBeLessThanOrEqual(plafond)
    })
  }
})
