import { describe, it, expect } from 'vitest'
import { messageDeZone } from '../../src/core/messageDeZone.ts'

/**
 * Issue #404 — ce qu'une zone a de travers, et où cette phrase se compose.
 *
 * Les trois diagnostics de zone (rien trouvé, zone tronquée, itinéraires
 * découpés jamais rendus) vivaient dans `loadZone`, **après** le retour
 * anticipé qui sert une zone en cache. Ils n'étaient donc dits qu'au premier
 * chargement, c'est-à-dire une fois tous les trente jours, et jamais lors
 * des visites suivantes — celles où l'on regarde ses pourcentages.
 *
 * Le remède est celui du §4 : la condition devient une fonction nommée,
 * consultée par les deux chemins, plutôt que recopiée dans le second.
 */
describe('ce qu’une zone a de travers', () => {
  it('ne dit rien d’une zone entière', () => {
    expect(messageDeZone({ itineraires: 12 })).toBeNull()
    expect(
      messageDeZone({ itineraires: 12, partielle: false, perdues: 0 }),
    ).toBeNull()
  })

  it('dit quoi faire quand la zone est vide', () => {
    expect(messageDeZone({ itineraires: 0 })).toMatch(
      /Aucun itinéraire balisé/,
    )
  })

  /*
    Une zone tronquée est le plus coûteux des trois : rien ne la distingue
    d'une zone entière à l'écran, et le pourcentage calculé dessus est
    surestimé — le dénominateur manque de ce qui n'est jamais revenu.
  */
  it('dit qu’une zone tronquée gonfle les pourcentages', () => {
    const message = messageDeZone({ itineraires: 12, partielle: true })
    expect(message).toMatch(/en partie/)
    expect(message, 'la conséquence compte plus que la cause').toMatch(
      /surestim/,
    )
  })

  it('dit combien d’itinéraires découpés manquent', () => {
    expect(messageDeZone({ itineraires: 12, perdues: 3 })).toContain('3 ')
  })

  /*
    `toContain('1 itinéraire')` serait satisfait par « 1 itinéraires » — le
    pluriel contient le singulier, et le §1bis a déjà mordu là-dessus sur le
    libellé de téléchargement. On vise donc les verbes, qui diffèrent.
  */
  it('accorde le singulier', () => {
    const un = messageDeZone({ itineraires: 12, perdues: 1 }) ?? ''
    expect(un).toContain('est découpé')
    expect(un).toContain('il n’est donc pas affiché')
    const trois = messageDeZone({ itineraires: 12, perdues: 3 }) ?? ''
    expect(trois).toContain('sont découpés')
    expect(trois).toContain('ils ne sont donc pas affichés')
  })

  /**
   * L'ordre des trois, et il n'est pas décoratif : une zone vide dont
   * Overpass a signalé l'interruption doit d'abord dire qu'elle est vide,
   * parce que c'est ce que la personne voit. Le §2 range ce choix parmi ceux
   * qui se décident — il est donc écrit ici plutôt que supposé.
   */
  it('annonce d’abord le plus visible', () => {
    expect(
      messageDeZone({ itineraires: 0, partielle: true, perdues: 2 }),
    ).toMatch(/Aucun itinéraire balisé/)
    expect(
      messageDeZone({ itineraires: 12, partielle: true, perdues: 2 }),
    ).toMatch(/en partie/)
  })

  /**
   * Une zone mise en cache avant #404 ne porte aucun des deux faits. Leur
   * absence veut dire « on ne sait pas », et on se tait — c'est exactement
   * ce que fait l'application aujourd'hui pour toutes les zones.
   *
   * L'alternative écartée : périmer ces copies pour les redemander à
   * Overpass. Elle aurait fermé l'angle mort tout de suite, au prix d'une
   * interrogation complète pour tout le monde, y compris ceux dont la zone
   * n'a jamais rien eu de travers. L'angle mort se referme seul en trente
   * jours (`CACHE_TTL_MS`), et d'ici là ces zones se comportent comme
   * avant — jamais plus mal.
   */
  it('se tait sur une zone écrite avant que le fait ne soit gardé', () => {
    expect(messageDeZone({ itineraires: 12 })).toBeNull()
  })
})
