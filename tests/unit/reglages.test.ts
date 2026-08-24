// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ecrireReglage,
  effacerReglage,
  lireReglage,
  reglagesSynchronesDisponibles,
} from '../../src/db/reglages.ts'

/**
 * Le magasin synchrone des réglages (issue #203).
 *
 * Il est né sans tests à lui : `appStore.test.ts` l'exerçait par le dessus,
 * ce qui suffisait à voir qu'un réglage survit, mais pas à voir ce qui se
 * passe quand le magasin ment. La vague de mutation du 24/08 l'a chiffré —
 * **douze survivants sur dix-sept mutants**, dont la sonde de disponibilité,
 * le refus d'un type inattendu et les deux replis.
 *
 * Ces tests-là visent précisément ce qu'un test « par le dessus » ne peut pas
 * atteindre : les chemins d'échec, qui sont la raison d'être du module.
 */

/** Un magasin qui obéit, et qu'on peut rendre hostile à volonté. */
function magasinDeTest(): Storage & { boiteNoire: Map<string, string> } {
  const boiteNoire = new Map<string, string>()
  return {
    boiteNoire,
    get length() {
      return boiteNoire.size
    },
    clear: () => {
      boiteNoire.clear()
    },
    getItem: (k: string) => boiteNoire.get(k) ?? null,
    setItem: (k: string, v: string) => {
      boiteNoire.set(k, v)
    },
    removeItem: (k: string) => {
      boiteNoire.delete(k)
    },
    key: (i: number) => [...boiteNoire.keys()][i] ?? null,
  }
}

const vrai = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

afterEach(() => {
  vi.unstubAllGlobals()
  if (vrai) Object.defineProperty(globalThis, 'localStorage', vrai)
})

describe('aller-retour', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', magasinDeTest())
  })

  it('rend exactement ce qui a été écrit, nombre compris', () => {
    expect(ecrireReglage('completionPct', 90)).toBe(true)
    expect(lireReglage('completionPct')).toBe(90)
  })

  /**
   * Le type est ce qui compte. `normalizeCompletionPct` rend sa valeur par
   * défaut sur autre chose qu'un nombre, et `lireDrapeau` n'accepte que le
   * nombre 1 : une chaîne aurait silencieusement remis les réglages à zéro au
   * premier rechargement.
   */
  it('distingue le nombre 90 de la chaîne « 90 »', () => {
    ecrireReglage('completionPct', 90)
    expect(lireReglage('completionPct')).not.toBe('90')
    ecrireReglage('modeAffichage', 'simple')
    expect(lireReglage('modeAffichage')).toBe('simple')
  })

  it('rend undefined sur une clef jamais écrite', () => {
    expect(lireReglage('toleranceMeters')).toBeUndefined()
  })

  it('efface ce qu’on lui demande d’effacer', () => {
    ecrireReglage('grosTexte', 1)
    effacerReglage('grosTexte')
    expect(lireReglage('grosTexte')).toBeUndefined()
  })

  /** Un espace commun : les clefs sont préfixées, jamais nues. */
  it('range ses clefs sous un préfixe qui lui est propre', () => {
    ecrireReglage('grosTexte', 1)
    const magasin = localStorage as unknown as {
      boiteNoire: Map<string, string>
    }
    expect([...magasin.boiteNoire.keys()]).toEqual([
      'sentiers.reglage.grosTexte',
    ])
  })
})

describe('quand le contenu du magasin ment', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', magasinDeTest())
  })

  /**
   * Une valeur abîmée — un autre onglet, une version future, une extension —
   * ne doit pas remonter telle quelle : `undefined` laisse l'appelant poser
   * son défaut, un objet le ferait planter au premier usage.
   */
  it('refuse un JSON qui n’est ni nombre ni chaîne', () => {
    localStorage.setItem('sentiers.reglage.objectifs', '{"a":1}')
    expect(lireReglage('objectifs')).toBeUndefined()
    localStorage.setItem('sentiers.reglage.objectifs', 'null')
    expect(lireReglage('objectifs')).toBeUndefined()
    localStorage.setItem('sentiers.reglage.objectifs', 'true')
    expect(lireReglage('objectifs')).toBeUndefined()
  })

  it('refuse un contenu qui n’est pas du JSON', () => {
    localStorage.setItem('sentiers.reglage.modeAffichage', 'simple')
    expect(lireReglage('modeAffichage')).toBeUndefined()
  })
})

describe('quand le magasin refuse', () => {
  it('dit non à l’écriture plutôt que de la croire faite', () => {
    const hostile = magasinDeTest()
    hostile.setItem = () => {
      throw new DOMException('plein', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', hostile)
    expect(ecrireReglage('completionPct', 90)).toBe(false)
  })

  /**
   * Le point qui a motivé la revue du sprint : **un magasin plein refuse
   * d'écrire mais lit très bien.** La lecture ne doit donc pas dépendre d'une
   * capacité d'écriture, sans quoi elle retomberait sur la copie périmée
   * d'IndexedDB et le réglage semblerait revenir en arrière tout seul.
   */
  it('continue de lire quand il n’accepte plus d’écrire', () => {
    const hostile = magasinDeTest()
    hostile.setItem('sentiers.reglage.completionPct', '90')
    hostile.setItem = () => {
      throw new DOMException('plein', 'QuotaExceededError')
    }
    vi.stubGlobal('localStorage', hostile)
    expect(lireReglage('completionPct')).toBe(90)
    expect(reglagesSynchronesDisponibles()).toBe(false)
  })

  it('rend undefined quand même la lecture lève', () => {
    const hostile = magasinDeTest()
    hostile.getItem = () => {
      throw new DOMException('refusé', 'SecurityError')
    }
    vi.stubGlobal('localStorage', hostile)
    expect(lireReglage('completionPct')).toBeUndefined()
  })
})

describe('quand il n’y a pas de magasin du tout', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', undefined)
  })

  it('ne lève pas, et ne prétend rien', () => {
    expect(reglagesSynchronesDisponibles()).toBe(false)
    expect(lireReglage('completionPct')).toBeUndefined()
    expect(ecrireReglage('completionPct', 90)).toBe(false)
    expect(() => {
      effacerReglage('completionPct')
    }).not.toThrow()
  })
})

describe('la sonde de disponibilité', () => {
  it('dit oui sur un magasin qui accepte, et ne laisse pas sa clef d’essai', () => {
    const magasin = magasinDeTest()
    vi.stubGlobal('localStorage', magasin)
    expect(reglagesSynchronesDisponibles()).toBe(true)
    expect(
      [...magasin.boiteNoire.keys()],
      'la clef d’essai est restée dans le magasin',
    ).toEqual([])
  })
})
