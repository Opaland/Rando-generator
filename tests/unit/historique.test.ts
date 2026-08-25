import { describe, it, expect } from 'vitest'
import {
  preparerHistorique,
  trierHistorique,
  chercherHistorique,
  grouperParAnnee,
  organiserHistorique,
  SEUIL_GROUPEMENT,
  MAX_PAR_ANNEE,
} from '../../src/core/historique.ts'
import type { Track } from '../../src/core/types.ts'

/**
 * Issue #175 — Karim dépose son archive Garmin complète : l'import réussit,
 * le calcul réussit, et il se retrouve devant huit cents lignes sans
 * recherche, sans tri, sans regroupement.
 *
 * La partie difficile est faite, la partie facile ne l'est pas. Ces
 * fonctions sont pures et vivent dans core pour être éprouvées ici plutôt
 * qu'à travers le DOM.
 */
function trace(
  filename: string,
  date: string | null,
  points = 2,
  elevationGain: number | null = null,
): Track {
  return {
    id: filename,
    filename,
    // Une ligne est-ouest : la longueur croît avec le nombre de points.
    points: Array.from({ length: points }, (_, i): [number, number] => [
      4.5 + i * 0.01,
      45.4,
    ]),
    date,
    importedAt: '2026-08-21T00:00:00Z',
    elevationGain,
  }
}

describe('preparerHistorique', () => {
  it('ne mesure la longueur qu’une fois par trace', () => {
    // Le rendu appelait polylineLengthMeters pour chaque trace, à chaque
    // rendu. Sur huit cents traces de dix mille points, c'est huit millions
    // de distances recalculées pour afficher une liste.
    const entrees = preparerHistorique([trace('a.gpx', '2026-06-15T08:00:00Z')])
    expect(entrees[0]!.metres).toBeGreaterThan(0)
  })

  it('range une trace sans date à part, sans la perdre', () => {
    const entrees = preparerHistorique([trace('sans-date.gpx', null)])
    expect(entrees).toHaveLength(1)
    expect(entrees[0]!.annee).toBeNull()
  })

  it('ne se laisse pas abuser par une date illisible', () => {
    const entrees = preparerHistorique([trace('cassee.gpx', 'pas une date')])
    expect(entrees[0]!.annee).toBeNull()
  })
})

describe('trierHistorique', () => {
  const entrees = preparerHistorique([
    trace('mars.gpx', '2026-03-01T08:00:00Z', 5, 100),
    trace('juin.gpx', '2026-06-01T08:00:00Z', 2, 900),
    trace('janvier.gpx', '2026-01-01T08:00:00Z', 9, 300),
  ])

  it('met la plus récente en tête', () => {
    expect(
      trierHistorique(entrees, 'date').map((e) => e.track.filename),
    ).toEqual(['juin.gpx', 'mars.gpx', 'janvier.gpx'])
  })

  it('met la plus longue en tête', () => {
    expect(
      trierHistorique(entrees, 'distance').map((e) => e.track.filename),
    ).toEqual(['janvier.gpx', 'mars.gpx', 'juin.gpx'])
  })

  it('met le plus gros dénivelé en tête', () => {
    // juin 900 m, janvier 300 m, mars 100 m.
    expect(
      trierHistorique(entrees, 'denivele').map((e) => e.track.filename),
    ).toEqual(['juin.gpx', 'janvier.gpx', 'mars.gpx'])
  })

  it('ne réordonne pas le tableau reçu', () => {
    const avant = entrees.map((e) => e.track.filename)
    trierHistorique(entrees, 'distance')
    expect(entrees.map((e) => e.track.filename)).toEqual(avant)
  })

  it('range les traces sans dénivelé après celles qui en ont', () => {
    // Absence de mesure n'est pas un dénivelé nul : les mettre à zéro les
    // mêlerait aux sorties plates, qui sont un fait, pas un manque.
    const melange = preparerHistorique([
      trace('inconnu.gpx', '2026-01-01T08:00:00Z', 2, null),
      trace('plat.gpx', '2026-01-02T08:00:00Z', 2, 0),
      trace('col.gpx', '2026-01-03T08:00:00Z', 2, 800),
    ])
    expect(
      trierHistorique(melange, 'denivele').map((e) => e.track.filename),
    ).toEqual(['col.gpx', 'plat.gpx', 'inconnu.gpx'])
  })
})

describe('chercherHistorique — la zone au moment de l’import (#206)', () => {
  /*
    #206 demandait « chercher par lieu » et s'arrêtait sur une question de
    produit : retrouver un lieu après coup, c'est du géocodage inverse —
    huit cents positions de départ envoyées à un tiers pour l'archive de
    Karim, soit exactement ce que Sentiers refuse.

    La piste praticable était déjà écrite dans l'issue : retenir, **au
    moment de l'import**, la zone chargée. C'est local, sans réseau, et
    l'application la connaît déjà.

    Ce qui n'est **pas** tranché ici, et l'issue le dit : est-ce que « la
    zone au moment de l'import » mérite d'être appelée un lieu ? Le champ
    s'appelle donc `zoneALImport`, et l'interface dit « importée depuis ».
    Une sortie du Pilat porte « PNR du Pilat », ce qui est utile et
    grossier — le nommer autrement le ferait passer pour un lieu de départ.
  */
  const entrees = preparerHistorique([
    {
      ...trace('sortie-1.gpx', '2026-06-15T08:00:00Z'),
      zoneALImport: 'PNR du Pilat',
    },
    {
      ...trace('sortie-2.gpx', '2026-06-16T08:00:00Z'),
      zoneALImport: 'Boucles communales — Métropole de Lyon',
    },
    trace('sans-zone.gpx', '2026-06-17T08:00:00Z'),
  ])

  it('trouve par la zone', () => {
    expect(
      chercherHistorique(entrees, 'pilat').map((e) => e.track.filename),
    ).toEqual(['sortie-1.gpx'])
  })

  it('cherche la zone sans accent, comme le reste', () => {
    expect(
      chercherHistorique(entrees, 'metropole').map((e) => e.track.filename),
    ).toEqual(['sortie-2.gpx'])
  })

  it('n’écarte pas une trace sans zone quand on cherche autre chose', () => {
    // Les traces déjà en base n'ont pas ce champ, et doivent rester
    // cherchables par tout le reste. Un champ neuf ne rend personne muet.
    expect(
      chercherHistorique(entrees, 'sans-zone').map((e) => e.track.filename),
    ).toEqual(['sans-zone.gpx'])
  })
})

describe('chercherHistorique', () => {
  const entrees = preparerHistorique([
    trace('Pilat-crêtes.gpx', '2026-06-15T08:00:00Z'),
    trace('sortie-hiver.gpx', '2025-01-20T08:00:00Z'),
    trace('sans-date.gpx', null),
  ])

  it('rend tout quand on ne cherche rien', () => {
    expect(chercherHistorique(entrees, '   ')).toHaveLength(3)
  })

  it('trouve par un morceau du nom de fichier', () => {
    expect(
      chercherHistorique(entrees, 'crêtes').map((e) => e.track.filename),
    ).toEqual(['Pilat-crêtes.gpx'])
  })

  it('ignore la casse et les accents', () => {
    // Personne ne tape « crêtes » avec l'accent dans un champ de recherche.
    expect(chercherHistorique(entrees, 'CRETES')).toHaveLength(1)
    expect(chercherHistorique(entrees, 'pilat')).toHaveLength(1)
  })

  it('trouve par l’année', () => {
    expect(
      chercherHistorique(entrees, '2025').map((e) => e.track.filename),
    ).toEqual(['sortie-hiver.gpx'])
  })

  it('trouve par la date écrite comme elle est affichée', () => {
    // La liste montre « 15/06/2026 » : le chercher doit fonctionner.
    expect(chercherHistorique(entrees, '15/06/2026')).toHaveLength(1)
  })

  it('ne rend rien plutôt que tout quand rien ne correspond', () => {
    expect(chercherHistorique(entrees, 'zzz')).toEqual([])
  })
})

describe('grouperParAnnee', () => {
  const beaucoup = (n: number, annee: number) =>
    Array.from({ length: n }, (_, i) =>
      trace(
        `${annee}-${i}.gpx`,
        `${annee}-06-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z`,
      ),
    )

  it('ne groupe pas une petite liste', () => {
    // Un repli sur quatre sorties ajoute un geste sans rien ranger.
    const entrees = preparerHistorique(beaucoup(4, 2026))
    const groupes = grouperParAnnee(entrees)
    expect(groupes).toHaveLength(1)
    expect(groupes[0]!.annee).toBeNull()
    expect(groupes[0]!.ouvertParDefaut).toBe(true)
  })

  it('groupe par année au-delà du seuil', () => {
    const entrees = preparerHistorique([
      ...beaucoup(SEUIL_GROUPEMENT, 2026),
      ...beaucoup(5, 2018),
    ])
    const groupes = grouperParAnnee(entrees)
    expect(groupes.map((g) => g.annee)).toEqual([2026, 2018])
  })

  it('ouvre l’année la plus récente, et elle seule', () => {
    // « On ouvre 2026, pas 2018 » — et pas non plus « l'année civile en
    // cours », qui serait vide chaque mois de janvier.
    const entrees = preparerHistorique([
      ...beaucoup(SEUIL_GROUPEMENT, 2024),
      ...beaucoup(5, 2018),
    ])
    const groupes = grouperParAnnee(entrees)
    expect(groupes[0]!.annee).toBe(2024)
    expect(groupes[0]!.ouvertParDefaut).toBe(true)
    expect(groupes[1]!.ouvertParDefaut).toBe(false)
  })

  it('met les sorties sans date dans un groupe nommé, à la fin', () => {
    const entrees = preparerHistorique([
      ...beaucoup(SEUIL_GROUPEMENT, 2026),
      trace('sans-date.gpx', null),
    ])
    const groupes = grouperParAnnee(entrees)
    expect(groupes.at(-1)!.annee).toBeNull()
    expect(groupes.at(-1)!.entrees).toHaveLength(1)
  })

  it('borne ce qu’une année déplie d’un coup', () => {
    // Huit cents sorties la même année restent huit cents nœuds à peindre.
    const entrees = preparerHistorique(beaucoup(MAX_PAR_ANNEE + 40, 2026))
    const groupes = grouperParAnnee(entrees)
    expect(groupes[0]!.entrees).toHaveLength(MAX_PAR_ANNEE + 40)
    expect(groupes[0]!.restantes).toBe(40)
  })
})

describe('organiserHistorique', () => {
  const beaucoup = Array.from({ length: SEUIL_GROUPEMENT + 5 }, (_, i) =>
    trace(`${2020 + (i % 4)}-${i}.gpx`, `${2020 + (i % 4)}-06-01T08:00:00Z`),
  )

  it('groupe par année quand on trie par date', () => {
    const groupes = organiserHistorique(
      trierHistorique(preparerHistorique(beaucoup), 'date'),
      'date',
    )
    expect(groupes.length).toBeGreaterThan(1)
  })

  it('rend une liste à plat quand on trie par autre chose', () => {
    // Sinon la plus longue sortie se retrouve dans une année repliée, et le
    // classement demandé n'est pas celui qu'on montre.
    for (const critere of ['distance', 'denivele'] as const) {
      const groupes = organiserHistorique(
        trierHistorique(preparerHistorique(beaucoup), critere),
        critere,
      )
      expect(groupes).toHaveLength(1)
      expect(groupes[0]!.ouvertParDefaut).toBe(true)
      expect(groupes[0]!.entrees).toHaveLength(beaucoup.length)
    }
  })
})
