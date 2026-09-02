import { describe, expect, it } from 'vitest'
import { drawSummaryCard } from '../../src/lib/summaryCard.ts'
import type { Summary } from '../../src/core/summary.ts'
import { gpxAttributionFor } from '../../src/core/gpxExport.ts'

/** Les provenances telles que le cœur les rend, sans les réécrire ici. */
const DE_L_OSM = gpxAttributionFor('GR')
const DE_LA_METROPOLE = gpxAttributionFor('LOCAL')

/**
 * Ce que l'image de partage écrit vraiment (issue #388).
 *
 * ## Pourquoi ce fichier n'existait pas, et ce que ça coûtait
 *
 * `drawSummaryCard` n'avait **aucun test**. Son crédit d'OpenStreetMap —
 * la seule chose qui rendait l'image conforme à l'ODbL — n'était donc gardé
 * par rien : un `fillText` retiré, et une image publiable partait sans
 * attribution sans que quoi que ce soit ne rougisse.
 *
 * La mesure qui a ouvert #388 était une sonde jetable. Le §1bis dit ce
 * qu'elle vaut comme garde : rien. Elle est ici, gardée.
 *
 * ## Comment on mesure ce qu'un canevas peint
 *
 * On ne le mesure pas — on relève ce qu'on lui **demande** de peindre, en
 * lui passant un contexte factice qui collecte les appels à `fillText`.
 *
 * C'est une mesure plus faible que `elementFromPoint` sur du DOM, et il faut
 * le dire : elle ne prouve pas qu'un pixel change, seulement que l'ordre est
 * donnée. Ce qu'elle attrape quand même, et qui est le mode d'échec réel :
 * une ligne supprimée, une condition qui l'évite, une composition qui rend
 * la mauvaise phrase.
 */

/** Contexte de dessin factice : on ne garde que les textes demandés. */
function contexteQuiNoteLesTextes(): {
  ctx: CanvasRenderingContext2D
  textes: string[]
} {
  const textes: string[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_cible, propriete) {
      if (propriete === 'fillText' || propriete === 'strokeText') {
        return (texte: string) => textes.push(texte)
      }
      if (propriete === 'measureText') return () => ({ width: 100 })
      if (propriete === 'createLinearGradient') {
        return () => ({ addColorStop: () => {} })
      }
      return () => {}
    },
    set: () => true,
  })
  return { ctx, textes }
}

function bilan(partiel: Partial<Summary> = {}): Summary {
  return {
    pct: 42,
    doneMeters: 12_000,
    totalMeters: 30_000,
    outings: 3,
    period: { from: '2025-01-01', to: '2025-06-01' },
    top: [{ name: 'Boucle de Saint-Genis', pct: 80, completed: false }],
    zoneLabel: 'Métropole de Lyon',
    sources: DE_L_OSM === null ? [] : [DE_L_OSM],
    ...partiel,
  }
}

/** Tout ce que le canevas s'est vu demander d'écrire. */
function textesEcrits(bilanDeTest: Summary): string[] {
  const { ctx, textes } = contexteQuiNoteLesTextes()
  drawSummaryCard(ctx, bilanDeTest)
  return textes
}

/** Les textes écrits, recollés — le crédit est une phrase, pas un mot. */
function creditEcrit(bilanDeTest: Summary): string {
  const { ctx, textes } = contexteQuiNoteLesTextes()
  drawSummaryCard(ctx, bilanDeTest)
  const credit = textes.find((t) => t.includes('©'))
  return credit ?? ''
}

describe('la carte de partage crédite ce qu’elle affiche', () => {
  it('crédite OpenStreetMap pour un bilan de GR', () => {
    expect(creditEcrit(bilan())).toBe(
      'Itinéraires © les contributeurs OpenStreetMap (ODbL)',
    )
  })

  /*
    Le constat de #388, mesuré : cette image montre « Boucle de Saint-Genis »
    par son nom, et ne devait rien à la Métropole.
  */
  it('crédite la Métropole quand elle montre une de ses boucles', () => {
    expect(creditEcrit(bilan({ sources: DE_LA_METROPOLE === null ? [] : [DE_LA_METROPOLE] }))).toBe(
      'Boucles locales © Métropole de Lyon (Licence Ouverte)',
    )
  })

  it('crédite les deux quand les deux sont là', () => {
    expect(creditEcrit(bilan({
        sources: [DE_L_OSM, DE_LA_METROPOLE].filter((s) => s !== null),
      }))).toBe(
      'Itinéraires © les contributeurs OpenStreetMap (ODbL) · Boucles' +
        ' locales © Métropole de Lyon (Licence Ouverte)',
    )
  })

  /*
    L'autre moitié, et sans elle le test précédent passerait sur une image
    qui crédite tout le monde tout le temps — ce qui serait une attribution
    fausse, le défaut de #386 retourné.
  */
  it('ne crédite pas la Métropole d’une image sans boucle locale', () => {
    expect(creditEcrit(bilan())).not.toContain(
      'Métropole',
    )
  })

  /*
    Le cas qui a fait refaire cette fonction. Léa importe le PDIPR de son
    département : réseau `PERSO`, provenance déclarée « Département de
    l'Ain » sous Licence Ouverte (issue #87).

    Ma première version traduisait le **réseau** en crédit. Elle rendait donc
    « Itinéraires © les contributeurs OpenStreetMap (ODbL) » sur une image
    faite de données de l'Ain — une attribution *fausse*, ajoutée par le
    correctif censé en réparer une manquante.

    Sans licence nommée entre parenthèses : le fichier en donne l'adresse,
    pas le nom court, et l'inventer serait inventer un fait (§2).
  */
  it('crédite une source déclarée sous le nom qu’elle donne', () => {
    const pdipr = {
      author: 'Département de l’Ain',
      license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
    }
    expect(creditEcrit(bilan({ sources: [pdipr] }))).toBe(
      'Itinéraires © Département de l’Ain',
    )
  })

  /*
    Et rien du tout quand il n'y a rien à créditer. `gpxAttributionFor` rend
    déjà `null` pour un tracé réellement dessiné à la main : une image qui
    créditerait quand même OpenStreetMap dirait le contraire de l'export
    GPX du même tracé.
  */
  it('n’écrit aucun crédit quand rien n’est dû', () => {
    expect(creditEcrit(bilan({ sources: [], top: [] }))).toBe('')
  })

  /*
    Ce que l'image ne doit **jamais** porter : la promesse du produit est
    qu'aucune coordonnée ne sort. Un test de crédit est l'endroit naturel
    pour la garder, puisqu'il relève déjà tout ce qui est écrit.
  */
  it('n’écrit aucune coordonnée', () => {
    const { ctx, textes } = contexteQuiNoteLesTextes()
    drawSummaryCard(ctx, bilan())
    for (const texte of textes) {
      expect(texte, `« ${texte} » ressemble à une coordonnée`).not.toMatch(
        /\d+\.\d{4,}/,
      )
    }
  })
})

/**
 * Les cinq états que l'image n'avait jamais pris (issue #478).
 *
 * Les sept questions ci-dessus partent toutes du même `bilan()` : trois
 * sorties, une période dans une seule année, une zone nommée. La vague de
 * mutation complète l'a chiffré — 16 mutants de `summaryCard.ts` **sans
 * aucune couverture**, c'est-à-dire des lignes qu'aucun test n'exécute.
 *
 * Ce n'est pas une lacune comme une autre. C'est la seule chose que Sentiers
 * produise pour être vue par d'autres que son utilisateur, et une phrase
 * fausse y part chez tout le monde sans pouvoir être reprise.
 *
 * Les six états sont corrects aujourd'hui : ce sont les gardes qui
 * manquaient, pas le code.
 */
describe('la carte de partage dans les états qu’on ne lui donnait jamais', () => {
  /*
    L'accord au singulier. Le dépôt porte déjà une cicatrice sur l'accord en
    français (#343), gardée exhaustivement ; celle-ci ne l'était pas.
  */
  it('écrit « 1 sortie » au singulier, et « 3 sorties » au pluriel', () => {
    expect(textesEcrits(bilan({ outings: 1 }))).toContain('1 sortie · 2025')
    expect(textesEcrits(bilan({ outings: 3 }))).toContain('3 sorties · 2025')
  })

  /*
    La fixture historique est datée `2025-01-01 → 2025-06-01` : les deux
    années sont égales, donc la branche à tiret n'avait **jamais** été
    produite. C'est pourtant le cas de qui partage un bilan après plus d'un
    an de marche — le partage le plus probable.
  */
  it('porte les deux années d’une période à cheval', () => {
    expect(
      textesEcrits(bilan({ period: { from: '2024-11-01', to: '2026-02-01' } })),
    ).toContain('3 sorties · 2024–2026')
  })

  it('ne répète pas une année qui ne change pas', () => {
    expect(
      textesEcrits(bilan({ period: { from: '2025-01-01', to: '2025-12-31' } })),
    ).toContain('3 sorties · 2025')
  })

  it('n’invente aucune année quand la période manque', () => {
    const ecrits = textesEcrits(bilan({ period: null }))
    expect(ecrits).toContain('3 sorties')
    // Un tiret d'années sur un bilan sans période serait une date inventée.
    expect(ecrits.join(' ')).not.toMatch(/\d{4}/)
  })

  /*
    Les deux états vides : ce que voit quelqu'un qui partage avant d'avoir
    importé quoi que ce soit. C'est la première image que le monde reçoit de
    l'application.
  */
  it('dit qu’aucune trace n’est importée plutôt que « 0 sortie »', () => {
    const ecrits = textesEcrits(bilan({ outings: 0, period: null }))
    expect(ecrits).toContain('aucune trace importée')
    expect(ecrits.join(' ')).not.toContain('0 sortie')
  })

  it('dit « chargés » quand aucune zone n’est nommée', () => {
    expect(textesEcrits(bilan({ zoneLabel: null }))).toContain(
      'des itinéraires balisés chargés',
    )
    expect(textesEcrits(bilan())).toContain(
      'des itinéraires balisés — Métropole de Lyon',
    )
  })
})
