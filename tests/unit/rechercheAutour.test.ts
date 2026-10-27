import { describe, it, expect } from 'vitest'
import {
  RAYON_ELARGI_METERS,
  cleAutour,
  libelleAutour,
  lireCleAutour,
  nomDuLieuAutour,
  rayonSuivant,
} from '../../src/core/rechercheAutour.ts'
import { RAYON_AUTOUR_METERS } from '../../src/core/overpass.ts'

/**
 * Issue #591 — « Autour de Nouméa » rendait 0 itinéraire : 12 km passaient
 * à côté de sentiers qu'Overpass trouve à 20 km (8 relations) et 30 km (13).
 *
 * Tranché par Cédric le 27/10 : 12 km d'abord, et 25 km seulement si rien
 * n'est trouvé — en le disant à l'écran. Une ville de métropole ne change
 * donc rien ; une requête de plus n'a lieu que là où il n'y avait rien.
 */
describe('rayonSuivant', () => {
  it('élargit une recherche vide au rayon de repli', () => {
    expect(rayonSuivant(RAYON_AUTOUR_METERS, 0)).toBe(RAYON_ELARGI_METERS)
  })

  it('n’élargit pas une recherche qui a trouvé quelque chose', () => {
    expect(rayonSuivant(RAYON_AUTOUR_METERS, 1)).toBeNull()
  })

  it('n’élargit qu’une fois', () => {
    // Sans cette borne, une commune sans aucun sentier ferait tourner les
    // requêtes indéfiniment.
    expect(rayonSuivant(RAYON_ELARGI_METERS, 0)).toBeNull()
  })

  it('n’élargit rien quand le chargement n’a pas abouti', () => {
    // Annulé, ou serveurs injoignables : on ne sait pas s'il n'y a rien.
    expect(rayonSuivant(RAYON_AUTOUR_METERS, null)).toBeNull()
  })

  it('le rayon de repli est plus large que celui d’origine', () => {
    expect(RAYON_ELARGI_METERS).toBeGreaterThan(RAYON_AUTOUR_METERS)
  })
})

describe('la clé d’une recherche « autour »', () => {
  it('garde la forme historique au rayon d’origine', () => {
    // Des clés `autour:<lon>,<lat>` sont en base depuis des mois : elles
    // doivent se relire telles quelles.
    expect(cleAutour([4.83, 45.76], RAYON_AUTOUR_METERS)).toBe('autour:4.8300,45.7600')
  })

  it('porte le rayon quand il a été élargi', () => {
    expect(cleAutour([166.45, -22.27], RAYON_ELARGI_METERS)).toBe(
      'autour:166.4500,-22.2700,25000',
    )
  })

  it('se relit, rayon compris', () => {
    expect(lireCleAutour('autour:166.4500,-22.2700,25000')).toEqual({
      center: [166.45, -22.27],
      rayon: RAYON_ELARGI_METERS,
    })
    expect(lireCleAutour('autour:4.8,45.75')).toEqual({
      center: [4.8, 45.75],
      rayon: RAYON_AUTOUR_METERS,
    })
  })

  it('refuse une clé abîmée plutôt que d’inventer un centre', () => {
    // Relue au démarrage, la clé vient du stockage : elle peut être tronquée
    // (voir rafraichirZone.test.ts).
    expect(lireCleAutour('autour:4.8')).toBeNull()
    expect(lireCleAutour('autour:abc,45.75')).toBeNull()
    expect(lireCleAutour('autour:4.8,def')).toBeNull()
    expect(lireCleAutour('autour:4.8,45.75,abc')).toBeNull()
    expect(lireCleAutour('autour:4.8,45.75,0')).toBeNull()
    expect(lireCleAutour('autour:4.8,45.75,25000,1')).toBeNull()
    expect(lireCleAutour('vercors')).toBeNull()
  })
})

describe('le libellé d’une recherche « autour »', () => {
  it('ne dit rien du rayon d’origine', () => {
    expect(libelleAutour('Chaponost', RAYON_AUTOUR_METERS)).toBe('Autour de Chaponost')
  })

  it('dit que la recherche a été élargie, et de combien', () => {
    expect(libelleAutour('Nouméa', RAYON_ELARGI_METERS)).toBe(
      'Autour de Nouméa, élargi à 25 km',
    )
  })

  it('rend le nom du lieu, élargi ou non', () => {
    // C'est ce que `rafraichirZone` rejoue : sans retirer la mention, une
    // actualisation appellerait « Nouméa, élargi à 25 km, élargi à 25 km ».
    expect(nomDuLieuAutour('Autour de Nouméa, élargi à 25 km')).toBe('Nouméa')
    expect(nomDuLieuAutour('Autour de Chaponost')).toBe('Chaponost')
    expect(nomDuLieuAutour(null)).toBe('')
  })
})
