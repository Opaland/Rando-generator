import { describe, it, expect } from 'vitest'
import {
  classerSortie,
  noterSortie,
  resumerJournal,
  libelleDestination,
  type EntreeJournal,
} from '../../src/core/journalSortant.ts'

/**
 * Issue #178 — « Aucun compte, aucun serveur, rien n'est envoyé » est écrit
 * dans l'en-tête, dans l'accueil, dans « À propos » et sur la page
 * publique. Il n'est jamais montré : c'est un slogan répété, pas un
 * bénéfice prouvé.
 *
 * Le journal compte ce qui sort réellement, sur l'appareil, et le classe
 * par service — les mêmes que ceux qu'« À propos » nomme depuis #168.
 *
 * Le cas qui décide de sa valeur est le dernier : une destination qu'on ne
 * sait pas classer doit être **dite**, pas absorbée. Un compteur qui range
 * l'inconnu dans « divers » rassure sans informer, et deviendrait faux le
 * jour où une dépendance ouvrirait un canal que personne n'a voulu.
 */
describe('classerSortie', () => {
  it('reconnaît les deux miroirs Overpass comme la source des sentiers', () => {
    expect(classerSortie('https://overpass-api.de/api/interpreter').destination).toBe('sentiers')
    expect(
      classerSortie('https://overpass.kumi.systems/api/interpreter').destination,
    ).toBe('sentiers')
  })

  it('distingue le fond de carte IGN de l’altimétrie IGN', () => {
    // Les deux sont chez data.geopf.fr : le chemin seul les sépare, et
    // « À propos » les présente comme deux services distincts — l'un voit
    // où vous regardez, l'autre quel itinéraire vous ouvrez.
    expect(
      classerSortie('https://data.geopf.fr/wmts?LAYER=PLANIGNV2&TILEROW=1').destination,
    ).toBe('fond-de-carte')
    expect(
      classerSortie('https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=4.5').destination,
    ).toBe('altimetrie')
  })

  it('reconnaît le repli OpenStreetMap', () => {
    expect(classerSortie('https://tile.openstreetmap.org/12/2000/1400.png').destination).toBe(
      'fond-de-carte',
    )
  })

  it('reconnaît la recherche de commune', () => {
    expect(
      classerSortie('https://api-adresse.data.gouv.fr/search/?q=Lyon').destination,
    ).toBe('recherche-commune')
  })

  it('range les fichiers du site à part', () => {
    // Ce ne sont pas des tiers : c'est l'application qui se charge
    // elle-même. Les mêler aux services fausserait le chiffre montré.
    //
    // L'origine est passée en argument depuis le 24/08 : elle valait
    // `opaland.github.io` en dur, ce qui aurait fait dénoncer ses propres
    // fichiers à l'application dès qu'elle serait servie d'ailleurs. Ce test
    // dit maintenant la bonne chose — « ce qui vient de chez moi est à
    // moi » — au lieu de « ce qui vient de GitHub Pages est à moi ».
    const origine = 'https://opaland.github.io'
    expect(
      classerSortie('/Rando-generator/boucles.json', origine).destination,
    ).toBe('site')
    expect(
      classerSortie(
        'https://opaland.github.io/Rando-generator/app.js',
        origine,
      ).destination,
    ).toBe('site')
  })

  it('avoue une destination qu’il ne sait pas classer', () => {
    const sortie = classerSortie('https://analytics.example.com/collect?x=1')
    expect(sortie.destination).toBe('inconnue')
    expect(sortie.hote).toBe('analytics.example.com')
  })

  it('ne casse pas sur une URL illisible', () => {
    expect(classerSortie('pas une url').destination).toBe('site')
  })
})

describe('resumerJournal', () => {
  const entrees: EntreeJournal[] = [
    { destination: 'sentiers', hote: 'overpass-api.de', nombre: 1 },
    { destination: 'fond-de-carte', hote: 'data.geopf.fr', nombre: 2 },
    { destination: 'site', hote: 'opaland.github.io', nombre: 1 },
  ]

  it('compte par service, du plus bavard au plus discret', () => {
    const resume = resumerJournal(entrees)
    expect(resume.parDestination[0]).toEqual({
      destination: 'fond-de-carte',
      hotes: ['data.geopf.fr'],
      nombre: 2,
    })
  })

  it('ne compte pas les fichiers du site comme des tiers', () => {
    const resume = resumerJournal(entrees)
    expect(resume.total).toBe(3)
    expect(resume.parDestination.map((d) => d.destination)).not.toContain('site')
  })

  it('signale une destination inconnue au lieu de la noyer', () => {
    const resume = resumerJournal([
      ...entrees,
      { destination: 'inconnue', hote: 'analytics.example.com', nombre: 1 },
    ])
    expect(resume.inconnues).toEqual(['analytics.example.com'])
  })

  it('ne dit rien d’inconnu quand tout est répertorié', () => {
    expect(resumerJournal(entrees).inconnues).toEqual([])
  })

  it('rend zéro sans rien inventer sur un journal vide', () => {
    const resume = resumerJournal([])
    expect(resume.total).toBe(0)
    expect(resume.parDestination).toEqual([])
    expect(resume.inconnues).toEqual([])
  })
})

describe('libelleDestination', () => {
  it('nomme chaque service comme « À propos » le nomme', () => {
    // Une correction de texte se fait sur toutes les surfaces : si ces
    // libellés divergent de ceux d'« À propos », la personne croit avoir
    // affaire à deux inventaires différents.
    expect(libelleDestination('sentiers')).toMatch(/sentiers/i)
    expect(libelleDestination('fond-de-carte')).toMatch(/fond de carte/i)
    expect(libelleDestination('altimetrie')).toMatch(/altim/i)
    expect(libelleDestination('recherche-commune')).toMatch(/commune/i)
  })
})

describe('noterSortie', () => {
  it('fusionne les requêtes d’un même service au lieu de les empiler', () => {
    // Mesuré : quarante et une requêtes pour un simple chargement de zone,
    // dont vingt-huit tuiles. Une ligne par requête ferait grossir le
    // journal sans fin au fil des déplacements sur la carte.
    let journal = noterSortie([], 'https://tile.openstreetmap.org/12/1/1.png')
    journal = noterSortie(journal, 'https://tile.openstreetmap.org/12/1/2.png')
    journal = noterSortie(journal, 'https://tile.openstreetmap.org/12/2/1.png')
    expect(journal).toHaveLength(1)
    expect(journal[0]!.nombre).toBe(3)
  })

  it('sépare deux services servis par le même hôte', () => {
    let journal = noterSortie([], 'https://data.geopf.fr/wmts?LAYER=PLANIGNV2')
    journal = noterSortie(journal, 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json')
    expect(journal.map((e) => e.destination).sort()).toEqual([
      'altimetrie',
      'fond-de-carte',
    ])
  })

  it('ne modifie pas le journal reçu', () => {
    const journal: never[] = []
    noterSortie(journal, 'https://overpass-api.de/api/interpreter')
    expect(journal).toHaveLength(0)
  })
})

/**
 * L'origine n'est plus une adresse en dur (24/08 — « on va mettre
 * l'application sur un serveur »).
 *
 * `classerSortie` comparait l'hôte à `opaland.github.io`, écrit deux fois
 * dans le module : une fois comme base de résolution des URL relatives, une
 * fois comme test d'appartenance. Servie depuis n'importe quel autre serveur,
 * l'application aurait classé **ses propres fichiers** en « destination
 * inconnue ».
 *
 * Ce n'est pas un détail d'affichage. Ce compteur est le seul endroit où la
 * promesse de l'en-tête est *montrée* plutôt qu'affirmée (issue #178), et il
 * aurait dénoncé l'origine qui le sert. Un compteur de vie privée qui crie au
 * loup sur lui-même n'est pas seulement faux : il rend inaudible le jour où
 * une vraie fuite apparaît.
 */
describe('l’origine qui sert l’application', () => {
  it('reconnaît ses propres fichiers, quel que soit le serveur', () => {
    for (const origine of [
      'https://opaland.github.io',
      'https://sentiers.example.org',
      'http://192.168.1.20:8080',
      'http://localhost:4173',
    ]) {
      expect(
        classerSortie(`${origine}/assets/index-abc123.js`, origine).destination,
      ).toBe('site')
    }
  })

  it('résout les chemins relatifs contre l’origine qui sert', () => {
    expect(
      classerSortie('/data/boucles.json', 'https://sentiers.example.org')
        .destination,
    ).toBe('site')
    expect(
      classerSortie('./sw.js', 'https://sentiers.example.org').destination,
    ).toBe('site')
  })

  /**
   * Le point qui donne sa valeur au compteur : une origine **voisine** n'est
   * pas la sienne. Un sous-domaine qui se mettrait à recevoir des requêtes
   * doit être dit, pas absorbé.
   */
  it('ne prend pas un hôte voisin pour le sien', () => {
    expect(
      classerSortie(
        'https://mesure.sentiers.example.org/collect',
        'https://sentiers.example.org',
      ).destination,
    ).toBe('inconnue')
  })

  /**
   * Sans origine fournie — dans un test, un worker, un rendu côté serveur —
   * la fonction ne doit pas se taire ni inventer : elle continue de classer
   * les tiers correctement, et c'est tout ce qu'on lui demande alors.
   */
  it('reste utile quand personne ne lui dit d’où elle est servie', () => {
    expect(
      classerSortie('https://overpass-api.de/api/interpreter').destination,
    ).toBe('sentiers')
    expect(classerSortie('/assets/app.js').destination).toBe('site')
  })
})
