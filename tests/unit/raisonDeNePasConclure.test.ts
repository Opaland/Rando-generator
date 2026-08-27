import { describe, it, expect } from 'vitest'
import {
  raisonDeNePasConclure,
  type TentativeReseau,
} from '../fixtures/verdictReseau'

/**
 * La seule porte de sortie des tests réseau réel, éprouvée comme du code.
 *
 * `tests/e2e/reel.spec.ts` se saute quand cette fonction rend une raison. Un
 * verdict trop large rendrait tout le fichier muet — et un fichier muet
 * ressemble à un fichier vert. C'est le mode d'échec que CLAUDE.md §1bis
 * décrit : une sortie qui pourrait se déclencher pour une raison qu'on n'a
 * pas voulue.
 *
 * Ces cas sont donc écrits **contre** la fonction, pas pour elle.
 */
function tentatives(
  reponses: { hote: string; statut: number }[],
  echecs: { hote: string; raison: string }[] = [],
): TentativeReseau[] {
  return [...reponses, ...echecs]
}

describe('raisonDeNePasConclure', () => {
  it('n’excuse rien quand aucun miroir n’a été tenté', () => {
    expect(raisonDeNePasConclure(tentatives([]))).toBe('')
  })

  it('n’excuse rien quand un miroir a rendu des données', () => {
    expect(
      raisonDeNePasConclure(
        tentatives([{ hote: 'overpass-api.de', statut: 200 }]),
      ),
    ).toBe('')
  })

  it('n’excuse rien si un seul des deux miroirs a répondu', () => {
    const verdict = raisonDeNePasConclure(
      tentatives(
        [{ hote: 'overpass.kumi.systems', statut: 200 }],
        [{ hote: 'overpass-api.de', raison: 'read ECONNRESET' }],
      ),
    )
    expect(verdict).toBe('')
  })

  it('excuse quand tous les miroirs ont lâché le transport', () => {
    const verdict = raisonDeNePasConclure(
      tentatives(
        [],
        [
          { hote: 'overpass-api.de', raison: 'read ECONNRESET' },
          { hote: 'overpass.kumi.systems', raison: 'timeout' },
        ],
      ),
    )
    expect(verdict).toContain('overpass-api.de → read ECONNRESET')
    expect(verdict).toContain('overpass.kumi.systems → timeout')
  })

  it('excuse quand les miroirs régulent, code à l’appui', () => {
    const verdict = raisonDeNePasConclure(
      tentatives([{ hote: 'overpass-api.de', statut: 429 }]),
    )
    expect(verdict).toContain('HTTP 429')
  })

  /*
    Le cas qui a coûté un rouge le 27/08 : l'altimétrie de l'IGN tombe, les
    itinéraires arrivent. Une excuse qui regarderait « un tiers a échoué »
    plutôt que « Overpass n'a rien rendu » sauterait le test au lieu de
    montrer que la fiche ne dit pas pourquoi son profil manque.
  */
  it('n’excuse pas la panne d’un tiers qui n’est pas Overpass', () => {
    const verdict = raisonDeNePasConclure(
      tentatives(
        [{ hote: 'overpass-api.de', statut: 200 }],
        [{ hote: 'data.geopf.fr', raison: 'read ECONNRESET' }],
      ),
    )
    expect(verdict).toBe('')
  })
})
