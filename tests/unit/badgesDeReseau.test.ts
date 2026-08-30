import { describe, it, expect } from 'vitest'
import type { Network } from '../../src/core/types.ts'
import {
  NETWORK_BADGES,
  NETWORK_COLOR_VARS,
} from '../../src/lib/networkDisplay.ts'

/**
 * Les feuilles qui peignent un badge de réseau écrivent **chacune ses
 * classes à la main**, une par réseau. TypeScript ne voit rien passer : le
 * composant fait `styles[itin.network]`, qui rend `undefined` sans se
 * plaindre. Le badge s'affiche alors sans fond du tout.
 *
 * C'est le mode d'échec du §4 dans sa forme la plus pure : une condition
 * transverse recopiée en plusieurs exemplaires. On ne peut pas la nommer ici
 * — les modules CSS n'ont pas de boucle — mais on peut refuser qu'elle
 * diverge, et c'est ce que fait ce test.
 *
 * Découvert en ajoutant `INCONNU` (issue #284) : les feuilles étaient toutes
 * à mettre à jour, et rien n'aurait signalé qu'il en manquait une.
 *
 * ## Ce que sa première version ne gardait pas
 *
 * Elle disait « trois feuilles » et ne lisait que `Itinerary*.module.css`.
 * Il y en avait **cinq** : `NextOuting` et `Objectifs` peignent le même
 * badge, hors du motif de nom. Ni `INTERNATIONAL` ni `INCONNU` n'y avaient
 * de classe — un badge sans fond, en texte blanc. Mesuré au navigateur par
 * `tests/e2e/badges-de-reseau.spec.ts` : `rgba(0, 0, 0, 0)` de fond, et au
 * travers le `rgb(255, 255, 255)` d'une ligne de « Prochaine sortie » ou le
 * `rgb(250, 247, 242)` du papier dans « Objectifs ». Rien à voir, au sens
 * propre.
 *
 * Deux leçons, et elles sont dans CLAUDE.md :
 *
 * - **§6quinquies** — une sonde qui ne regarde qu'un écran ne garde qu'un
 *   écran. Ici, qu'un motif de nom de fichier. Le glob part maintenant de
 *   tout `src/components/`, et c'est la présence d'un `.GR {` qui décide
 *   qu'une feuille est concernée : une feuille de badge neuve entre dans la
 *   garde sans que personne y pense ;
 * - **§4bis** — « trois feuilles » était une justification, donc une
 *   affirmation, et elle avait vieilli sans que personne la relise.
 *
 * ## Et la couleur, pas seulement la classe
 *
 * L'existence d'une classe ne dit pas qu'elle peint la bonne couleur.
 * `PERSO` en était la preuve : `--vert-noir` dans trois feuilles,
 * `--gris-vert` dans les deux autres, pendant que la carte le trace en
 * `--vert-noir`. Un badge et son tracé de couleurs différentes ne se
 * remarquent qu'au moment où l'on compare, c'est-à-dire jamais.
 *
 * ## Et le texte posé dessus
 *
 * Le badge PR est le seul dont le texte n'est pas blanc : du jaune ne porte
 * pas de blanc. Il doit prendre `--encre-balisage` — l'encre **du balisage**,
 * qui ne suit pas le thème parce que son fond n'en dépend pas : un aplat
 * jaune de PR reste jaune la nuit.
 *
 * `--encre` y tomberait à 1,92:1 en thème sombre. La correction du volet 1 de
 * #361 avait atteint trois feuilles et oublié les deux mêmes que #422 — le
 * même trou, deux fois de suite, parce que rien ne regardait la couleur du
 * texte. C'est ce que fait la seconde assertion ci-dessous.
 */

const feuilles: Record<string, string> = import.meta.glob<string>(
  '../../src/components/*.module.css',
  { query: '?raw', import: 'default', eager: true },
)

/**
 * `PERSO` n'apparaît pas dans la liste filtrable mais bien dans les badges :
 * on part donc de tous les réseaux, sans exception à maintenir.
 */
const RESEAUX = Object.keys(NETWORK_BADGES) as Network[]

/** Le corps de la règle `.<réseau> { … }`, ou `null` si elle manque. */
function regle(brut: string, reseau: Network): string | null {
  const trouve = new RegExp(`^\\.${reseau}\\s*\\{([^}]*)\\}`, 'm').exec(brut)
  return trouve?.[1] ?? null
}

const concernees = Object.entries(feuilles).filter(([, brut]) =>
  /^\.GR\s*\{/m.test(brut),
)

describe('chaque feuille de badge connaît chaque réseau', () => {
  /*
    Bruyant plutôt que silencieux : si le motif cesse de correspondre — une
    feuille renommée, un `.GR` devenu autre chose — ce test rendrait
    « tout va bien » sur zéro feuille lue. C'est le §6quater : un contrôle
    qu'il faut penser à lire ne garde rien.
  */
  it('lit bien les cinq feuilles de badge connues', () => {
    expect(concernees.map(([chemin]) => chemin.split('/').pop()).sort()).toEqual(
      [
        'ItineraryCard.module.css',
        'ItineraryDetail.module.css',
        'ItineraryList.module.css',
        'NextOuting.module.css',
        'Objectifs.module.css',
      ],
    )
  })

  for (const [chemin, brut] of concernees) {
    const nom = chemin.replace('../../', '')
    it.each(RESEAUX)(`${nom} peint %s de la bonne couleur`, (reseau) => {
      const corps = regle(brut, reseau)
      expect(
        corps,
        `le badge ${reseau} n’a pas de classe ici : il s’affichera sans fond`,
      ).not.toBeNull()
      expect(
        corps ?? '',
        `le badge ${reseau} ne prend pas la couleur que la carte trace`,
      ).toContain(`background: var(${NETWORK_COLOR_VARS[reseau]});`)
      /*
        Un badge n'a pas à redéclarer sa couleur de texte — `.badge` la pose
        en `--texte-sur-couleur`. S'il le fait quand même, c'est que son aplat
        ne porte pas de blanc, et alors c'est l'encre du **balisage** qu'il
        lui faut : celle de l'interface s'éclaircirait la nuit sur un fond
        qui, lui, ne change pas.
      */
      const texte = /\bcolor:\s*var\((--[a-z-]+)\)/.exec(corps ?? '')?.[1]
      if (texte !== undefined) {
        expect(
          texte,
          `le badge ${reseau} pose son texte en \`${texte}\` : sur un aplat de` +
            ` balisage, qui ne suit pas le thème, il faut \`--encre-balisage\``,
        ).toBe('--encre-balisage')
      }
    })
  }
})
