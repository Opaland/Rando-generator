import { describe, expect, it } from 'vitest'
import {
  attributionHtml,
  attributionTexte,
  creditsDesSources,
  IGN,
  IGN_RELIEF,
  MARQUES_FFRANDONNEE,
  METROPOLE,
  OSM,
  OSM_FOND_ET_TRACES,
} from '../../src/lib/attribution.ts'
import {
  ATTRIBUTION,
  ATTRIBUTION_OSM,
} from '../../src/components/map/style.ts'
import { attributionDe, gpxAttributionFor } from '../../src/core/gpxExport.ts'
import type { Network } from '../../src/core/types.ts'
import { makeItinerary, straightLine } from '../fixtures/synthetic.ts'

/**
 * Ce que Sentiers doit à ses sources (issue #386).
 *
 * ## Deux questions, et elles ne se ressemblent pas
 *
 * 1. **La composition rend-elle exactement ce qui était écrit à la main ?**
 *    Les deux chaînes de MapLibre sont épinglées au caractère près. C'est un
 *    test de non-régression sur un remplacement mécanique : si un jour la
 *    formule doit changer, elle changera **ici aussi**, délibérément, et pas
 *    par l'effet de bord d'un morceau retouché ailleurs.
 * 2. **Chaque morceau porte-t-il ce qu'une licence exige ?** Un nom, un
 *    symbole de droit, une licence nommée, un lien où la lire.
 *
 * ## Pourquoi épingler des chaînes, ce qui ne se fait pas d'habitude
 *
 * Parce que la valeur de ce fichier est précisément d'être **la seule**
 * écriture de ces phrases. Une constante recopiée se garde en comparant les
 * copies (§4ter) ; ici il n'y a plus de copie à comparer, et la seule chose
 * qui puisse encore diverger est la phrase d'aujourd'hui contre celle
 * d'hier.
 */

describe('les crédits composés rendent ce qui était écrit à la main', () => {
  it('l’attribution du fond IGN, au caractère près', () => {
    expect(ATTRIBUTION).toBe(
      'Fond © <a href="https://www.ign.fr/">IGN</a> (Plan IGN, licence' +
        ' ouverte Etalab 2.0) · Itinéraires © les contributeurs <a' +
        ' href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
        ' (ODbL) · Boucles locales © <a' +
        ' href="https://data.grandlyon.com/">Métropole de Lyon</a> (Licence' +
        ' Ouverte)',
    )
  })

  it('celle du miroir OSM, au caractère près', () => {
    expect(ATTRIBUTION_OSM).toBe(
      'Fond et itinéraires © les contributeurs <a' +
        ' href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
        ' (ODbL) · Boucles locales © <a' +
        ' href="https://data.grandlyon.com/">Métropole de Lyon</a> (Licence' +
        ' Ouverte)',
    )
  })

  it('celle de la carte de partage, qui ne crédite qu’OpenStreetMap', () => {
    expect(attributionTexte(OSM)).toBe(
      'Itinéraires © les contributeurs OpenStreetMap (ODbL)',
    )
  })

  /*
    Le lien du seul crédit dont la licence l'exige nommément. Il était
    déjà dans les deux chaînes ci-dessus ; l'écrire à part dit **pourquoi**
    il y est, et ferait échouer une simplification qui le retirerait de la
    forme texte en le laissant dans la forme HTML.
  */
  it('la forme texte ne perd pas le nom de la licence', () => {
    expect(attributionTexte(IGN_RELIEF, OSM, METROPOLE)).toBe(
      'Relief © IGN (Plan IGN, licence ouverte Etalab 2.0) · Itinéraires © les' +
        ' contributeurs OpenStreetMap (ODbL) · Boucles locales © Métropole' +
        ' de Lyon (Licence Ouverte)',
    )
  })
})

describe('chaque crédit porte ce qu’une licence demande', () => {
  const tous = { OSM, IGN, IGN_RELIEF, METROPOLE, OSM_FOND_ET_TRACES }

  for (const [nom, credit] of Object.entries(tous)) {
    it(`${nom} nomme sa source, sa licence et où la lire`, () => {
      expect(credit.quoi, 'ce qui est dû n’est pas dit').not.toBe('')
      expect(credit.qui, 'la source n’est pas nommée').not.toBe('')
      expect(credit.licence, 'la licence n’est pas nommée').not.toBe('')
      /*
        `^https?://` **ancré** : sans l'ancre, `javascript:alert(1)#https://x`
        passerait, et cette valeur part dans un `href`. C'est le survivant de
        mutation le plus utile de la vague du 23/08, et il se paie une ligne
        partout où une adresse devient un attribut.
      */
      expect(credit.lien, 'le lien n’est pas une adresse http(s)').toMatch(
        /^https?:\/\//,
      )
    })

    it(`${nom} se rend avec le symbole de droit d’auteur`, () => {
      expect(attributionTexte(credit)).toContain('©')
      expect(attributionHtml(credit)).toContain('©')
    })
  }

  /*
    Une mention de marque n'est pas un crédit de licence : elle n'a ni « © »
    ni lien, et elle est délibérément hors de `Credit`. Ce test garde cette
    distinction — si quelqu'un la rangeait parmi les crédits, la boucle
    ci-dessus lui réclamerait un lien qui n'existe pas.
  */
  it('les marques de la FFRandonnée ne se déguisent pas en licence', () => {
    expect(MARQUES_FFRANDONNEE).not.toContain('©')
    expect(MARQUES_FFRANDONNEE).toContain('®')
  })
})

/**
 * La cinquième copie, celle qui part dans un fichier (§4ter).
 *
 * `src/core/gpxExport.ts` porte ses propres `OSM_ATTRIBUTION` et
 * `METROPOLE_ATTRIBUTION`, et ce n'est pas une négligence : un GPX veut une
 * **adresse de licence** là où l'interface veut un nom court, et il ne peut
 * pas dépendre de `src/lib` — le cœur ne connaît pas l'affichage.
 *
 * Ce qui ne va pas de soi, c'est que les deux nomment le même producteur.
 * Renommer « les contributeurs OpenStreetMap » d'un côté et pas de l'autre
 * ne casserait rien, ne se verrait dans aucun diff, et laisserait un fichier
 * exporté créditant quelqu'un d'autre que la carte qui l'a produit.
 *
 * Le §4ter donne le remède quand les deux ne peuvent pas être partagées :
 * **un test qui asserte qu'elles sont d'accord**.
 */
describe('le GPX exporté crédite les mêmes gens que l’écran', () => {
  const WAYS = [{ osmWayId: 1, coords: straightLine(4.5, 45.4, 1_000, 100) }]

  it('nomme OpenStreetMap comme la carte le nomme', () => {
    const gr = makeItinerary(1, WAYS, { network: 'GR' })
    expect(attributionDe(gr)?.author).toBe(`${OSM.devant ?? ''}${OSM.qui}`)
  })

  it('nomme la Métropole comme la carte la nomme', () => {
    const local = makeItinerary(2, WAYS, { network: 'LOCAL' })
    expect(attributionDe(local)?.author).toBe(
      `${METROPOLE.devant ?? ''}${METROPOLE.qui}`,
    )
  })
})

/**
 * L'habillage suit la provenance, pour tout réseau (issue #388).
 *
 * ## Ce que ce bloc garde, et ce qu'il ne garde plus
 *
 * Il ne compare plus deux tables. Il n'y en a qu'une : `attributionDe`, dans
 * le cœur. `creditsDesSources` ne décide de rien — elle habille ce que le
 * cœur a répondu.
 *
 * Ce qui peut encore casser, et que ceci garde : qu'une provenance rendue
 * par le cœur ne trouve pas son habillage et sorte sous un autre nom, ou
 * qu'un crédit apparaisse là où le cœur n'en voit aucun. Les deux se
 * traduiraient par une attribution fausse sur l'image de partage.
 *
 * La boucle porte sur **tous** les réseaux, énumérés ici. Un réseau neuf
 * fait échouer le compte avant de faire échouer une comparaison : c'est ce
 * qui empêche ce test d'être vert parce qu'il ne regarde plus rien.
 */
describe('chaque provenance du cœur trouve son habillage', () => {
  const TOUS: Network[] = ['GR', 'GRP', 'PR', 'LOCAL', 'PERSO', 'INCONNU']

  it('la liste des réseaux est complète', () => {
    const attendus: Record<Network, true> = {
      GR: true,
      GRP: true,
      PR: true,
      LOCAL: true,
      PERSO: true,
      INCONNU: true,
    }
    expect(
      [...TOUS].sort(),
      'un réseau a été ajouté au type sans être éprouvé ici : sa provenance' +
        ' pourrait sortir sous un mauvais nom sans que rien ne rougisse',
    ).toEqual(Object.keys(attendus).sort())
  })

  for (const reseau of TOUS) {
    it(`${reseau} : l’image nomme qui le GPX nomme`, () => {
      const duGpx = gpxAttributionFor(reseau)

      if (duGpx === null) {
        expect(
          creditsDesSources([]),
          `${reseau} ne doit rien dans le GPX : l'image ne doit créditer` +
            ` personne non plus, sous peine de se contredire.`,
        ).toEqual([])
        return
      }

      const habilles = creditsDesSources([duGpx])
      expect(habilles).toHaveLength(1)
      const credit = habilles[0]
      expect(
        `${credit?.devant ?? ''}${credit?.qui ?? ''}`,
        `le GPX crédite « ${duGpx.author} » et l'image quelqu'un d'autre.`,
      ).toBe(duGpx.author)
    })
  }

  /*
    Une source déclarée par un fichier importé — le cas de Léa (#87). Elle
    n'est dans aucune table : c'est précisément pourquoi la version keyée sur
    le réseau était fausse.
  */
  it('habille une source inconnue sous le nom qu’elle déclare', () => {
    const credits = creditsDesSources([
      {
        author: 'Département de l’Ain',
        license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
      },
    ])
    expect(credits).toHaveLength(1)
    expect(attributionTexte(...credits)).toBe(
      'Itinéraires © Département de l’Ain',
    )
  })

  /*
    Dédoublonnage sur le **nom** et non sur la référence : `attributionDe`
    rend une constante partagée pour les réseaux OSM, mais un objet neuf par
    source déclarée. Sans ce cas, deux itinéraires de l'Ain crédités deux
    fois passeraient.
  */
  it('ne crédite pas deux fois le même producteur', () => {
    const ain = {
      author: 'Département de l’Ain',
      license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
    }
    expect(creditsDesSources([ain, { ...ain }])).toHaveLength(1)
  })
})
