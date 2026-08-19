import { describe, it, expect } from 'vitest'
import swSource from '../../public/sw.js?raw'
import {
  CONNECTIVITY_MESSAGE,
  initialConnectivity,
  isOffline,
  reduceConnectivity,
} from '../../src/core/connectivity.ts'

describe('isOffline', () => {
  it('est hors ligne quand le navigateur le déclare', () => {
    expect(isOffline({ navigatorOnline: false, cacheFallback: false })).toBe(
      true,
    )
  })

  it('est en ligne quand rien ne signale de coupure', () => {
    expect(isOffline({ navigatorOnline: true, cacheFallback: false })).toBe(
      false,
    )
  })

  it('croit le service worker plutôt que navigator.onLine', () => {
    // navigator.onLine ne dit que « une interface réseau existe » : il reste
    // optimiste au chargement d'une page servie depuis le cache faute de
    // réseau. Un échec de requête constaté est une preuve, pas une opinion.
    expect(isOffline({ navigatorOnline: true, cacheFallback: true })).toBe(true)
  })
})

describe('reduceConnectivity', () => {
  it('enregistre la perte de connexion', () => {
    const state = reduceConnectivity(initialConnectivity(true), 'offline')
    expect(isOffline(state)).toBe(true)
  })

  it('efface le repli sur cache dès que la connexion revient', () => {
    // Sinon le bandeau resterait affiché pour toujours après un lancement
    // hors connexion, ce qui serait faux dès la première antenne captée.
    const horsLigne = reduceConnectivity(
      initialConnectivity(true),
      'cache-fallback',
    )
    expect(isOffline(horsLigne)).toBe(true)
    const revenu = reduceConnectivity(horsLigne, 'online')
    expect(isOffline(revenu)).toBe(false)
    expect(revenu.cacheFallback).toBe(false)
  })

  it('conserve le repli sur cache tant que la connexion n’est pas revenue', () => {
    const state = reduceConnectivity(
      reduceConnectivity(initialConnectivity(true), 'cache-fallback'),
      'offline',
    )
    expect(state.cacheFallback).toBe(true)
  })

  it('retourne le même état quand rien ne change, pour éviter un rendu inutile', () => {
    const state = initialConnectivity(true)
    expect(reduceConnectivity(state, 'online')).toBe(state)
    const coupe = reduceConnectivity(state, 'offline')
    expect(reduceConnectivity(coupe, 'offline')).toBe(coupe)
    const secours = reduceConnectivity(state, 'cache-fallback')
    expect(reduceConnectivity(secours, 'cache-fallback')).toBe(secours)
  })

  it('part de l’état réel du navigateur au démarrage', () => {
    expect(isOffline(initialConnectivity(false))).toBe(true)
    expect(isOffline(initialConnectivity(true))).toBe(false)
  })
})

describe('CONNECTIVITY_MESSAGE', () => {
  it('reste identique à la constante recopiée dans public/sw.js', () => {
    // Le service worker est du JavaScript brut hors du bundle : il ne peut
    // pas importer cette constante, il la recopie. Ce test empêche les deux
    // valeurs de diverger en silence.
    expect(swSource).toContain(`'${CONNECTIVITY_MESSAGE}'`)
  })
})
