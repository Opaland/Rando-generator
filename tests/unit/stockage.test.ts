import { describe, it, expect, vi } from 'vitest'
import {
  apiDuNavigateur,
  etatDuStockage,
  demanderPersistance,
  estSafari,
  type ApiStockage,
} from '../../src/core/stockage.ts'

/**
 * Issue #169 — `navigator.storage.persist()` n'était appelé nulle part.
 *
 * Le mur n'est pas la taille : des milliers de traces tiennent partout. Le
 * risque est que Safari efface les données d'un site après sept jours sans
 * interaction — le rythme normal de quelqu'un qui marche le week-end.
 */
function api(overrides: Partial<ApiStockage> = {}): ApiStockage {
  return {
    persisted: () => Promise.resolve(false),
    persist: () => Promise.resolve(true),
    estimate: () => Promise.resolve({ usage: 1_048_576, quota: 104_857_600 }),
    ...overrides,
  }
}

describe('etatDuStockage', () => {
  it('rapporte l’espace utilisé et le mode obtenu', async () => {
    const etat = await etatDuStockage(api({ persisted: () => Promise.resolve(true) }))
    expect(etat).toEqual({
      persistant: true,
      octetsUtilises: 1_048_576,
      octetsDisponibles: 104_857_600,
    })
  })

  it('dit « on ne sait pas » plutôt que d’inventer un zéro', async () => {
    // Un navigateur sans l'API n'a pas zéro octet : il a un chiffre qu'on
    // n'a pas. Afficher « 0 octet utilisé » serait faux.
    expect(await etatDuStockage(null)).toEqual({
      persistant: null,
      octetsUtilises: null,
      octetsDisponibles: null,
    })
  })

  it('survit à une estimation qui échoue', async () => {
    const etat = await etatDuStockage(
      api({ estimate: () => Promise.reject(new Error('refusé')) }),
    )
    expect(etat.persistant).toBe(false)
    expect(etat.octetsUtilises).toBeNull()
  })

  it('accepte une estimation partielle', async () => {
    const etat = await etatDuStockage(
      api({ estimate: () => Promise.resolve({ usage: 42 }) }),
    )
    expect(etat.octetsUtilises).toBe(42)
    expect(etat.octetsDisponibles).toBeNull()
  })
})

describe('demanderPersistance', () => {
  it('ne redemande pas ce qui est déjà acquis', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    const resultat = await demanderPersistance(
      api({ persisted: () => Promise.resolve(true), persist }),
    )
    expect(resultat).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('demande quand ce n’est pas acquis', async () => {
    const persist = vi.fn(() => Promise.resolve(true))
    expect(await demanderPersistance(api({ persist }))).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('rapporte un refus sans le déguiser', async () => {
    // Le critère d'octroi dépend de l'engagement avec le site, opaque et
    // variable : un refus est un cas normal, pas une anomalie.
    expect(
      await demanderPersistance(api({ persist: () => Promise.resolve(false) })),
    ).toBe(false)
  })

  it('rapporte l’absence d’API comme une inconnue, pas comme un refus', async () => {
    expect(await demanderPersistance(null)).toBeNull()
  })

  it('ne laisse pas une exception remonter', async () => {
    expect(
      await demanderPersistance(
        api({ persist: () => Promise.reject(new Error('bloqué')) }),
      ),
    ).toBe(false)
  })
})

describe('estSafari', () => {
  const UA = {
    safariMac:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    safariIphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    chromeIphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.0.0 Mobile/15E148 Safari/604.1',
    firefoxIphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15',
    chromeMac:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    chromeAndroid:
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    firefox:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  }

  it('reconnaît Safari sur macOS et sur iPhone', () => {
    expect(estSafari(UA.safariMac)).toBe(true)
    expect(estSafari(UA.safariIphone)).toBe(true)
  })

  it('compte les navigateurs d’iOS, qui sont tous WebKit', () => {
    // Chrome et Firefox pour iOS habillent WebKit : même politique
    // d'éviction, même avertissement à donner.
    expect(estSafari(UA.chromeIphone)).toBe(true)
    expect(estSafari(UA.firefoxIphone)).toBe(true)
  })

  it('ne prend pas les Chromium pour des Safari', () => {
    // Tous portent « Safari » dans leur chaîne, pour des raisons historiques.
    expect(estSafari(UA.chromeMac)).toBe(false)
    expect(estSafari(UA.chromeAndroid)).toBe(false)
    expect(estSafari(UA.edge)).toBe(false)
    expect(estSafari(UA.firefox)).toBe(false)
  })
})

describe('apiDuNavigateur', () => {
  it('rend null quand le navigateur ne fournit rien', () => {
    vi.stubGlobal('navigator', undefined)
    expect(apiDuNavigateur()).toBeNull()
    vi.stubGlobal('navigator', {})
    expect(apiDuNavigateur()).toBeNull()
    vi.stubGlobal('navigator', { storage: { persisted: () => true } })
    expect(apiDuNavigateur()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('appelle les méthodes sur `navigator.storage`, pas détachées', async () => {
    // Extraites sans liaison, ces méthodes lèvent une « Illegal invocation »
    // dans un vrai navigateur : le `this` doit rester `navigator.storage`.
    const storage = {
      marque: 'le bon objet',
      persisted(this: { marque: string }) {
        return Promise.resolve(this.marque === 'le bon objet')
      },
      persist(this: { marque: string }) {
        return Promise.resolve(this.marque === 'le bon objet')
      },
      estimate(this: { marque: string }) {
        return Promise.resolve({ usage: this.marque.length })
      },
    }
    vi.stubGlobal('navigator', { storage })
    const api = apiDuNavigateur()
    expect(api).not.toBeNull()
    await expect(api!.persisted()).resolves.toBe(true)
    await expect(api!.persist()).resolves.toBe(true)
    await expect(api!.estimate()).resolves.toEqual({ usage: 12 })
    vi.unstubAllGlobals()
  })
})
