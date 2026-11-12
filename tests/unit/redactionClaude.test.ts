import { describe, it, expect } from 'vitest'
import {
  CONSIGNE_BILAN,
  MODELE_CLAUDE,
  coutEnDollars,
  messageDesFaits,
  verdictDuTexte,
} from '../../src/core/redactionClaude.ts'

/**
 * Issue #673 — ce qui se décide sans réseau dans un texte écrit par Claude :
 * ce qu'on lui demande, ce qu'il coûte, et s'il peut être montré.
 */
describe('la demande', () => {
  it('vise le modèle retenu', () => {
    expect(MODELE_CLAUDE).toBe('claude-opus-5-5')
  })

  it('interdit tout nombre absent des faits, y compris en lettres', () => {
    expect(CONSIGNE_BILAN).toMatch(/aucun nombre/i)
    expect(CONSIGNE_BILAN).toMatch(/lettres/i)
  })

  it('envoie les faits en JSON, et rien d’autre', () => {
    const message = messageDesFaits({ annee: 2026, sorties: 3 })
    expect(message).toContain('"annee": 2026')
    expect(JSON.parse(message.slice(message.indexOf('{')))).toEqual({ annee: 2026, sorties: 3 })
  })
})

describe('coutEnDollars', () => {
  it('compte entrée, sortie et cache au tarif du modèle servi', () => {
    // Opus 5.5 : 4 $ / 20 $ par million ; lecture de cache à 0,1×, écriture à 1,25×.
    expect(
      coutEnDollars('claude-opus-5-5', {
        input_tokens: 1_000_000,
        output_tokens: 100_000,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 0,
      }),
    ).toBeCloseTo(4 + 2 + 0.4, 6)
  })

  it('ne devine pas le tarif d’un modèle inconnu', () => {
    // Le repli côté serveur peut servir un autre modèle : un coût inventé
    // serait un chiffre présenté comme une mesure (§2).
    expect(coutEnDollars('claude-inconnu-9', { input_tokens: 10, output_tokens: 10 })).toBeNull()
  })
})

describe('verdictDuTexte', () => {
  const faits = { annee: 2026, sorties: 38, km: 412.4 }

  it('montre un texte dont chaque nombre vient des faits', () => {
    expect(verdictDuTexte('En 2026, 38 sorties pour 412,4 km.', faits)).toEqual({
      montrable: true,
      texte: 'En 2026, 38 sorties pour 412,4 km.',
    })
  })

  it('retient un texte qui porte un nombre inventé, et dit lequel', () => {
    expect(verdictDuTexte('En 2026, 40 sorties.', faits)).toEqual({
      montrable: false,
      inconnus: [40],
    })
  })

  it('retient un texte vide', () => {
    expect(verdictDuTexte('   ', faits)).toEqual({ montrable: false, inconnus: [] })
  })
})
