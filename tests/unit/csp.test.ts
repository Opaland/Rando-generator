import { describe, it, expect } from 'vitest'
import cspBrut from '../../deploy/csp.conf?raw'
import nginxBrut from '../../deploy/nginx.conf?raw'
import { HOTES_CONTACTES } from '../../src/core/journalSortant.ts'

/**
 * La politique de sécurité de contenu dit la vérité (24/08 — « on va mettre
 * l'application sur un serveur »).
 *
 * GitHub Pages ne permet aucun en-tête : la promesse écrite en haut de chaque
 * écran — « vos traces GPX ne quittent jamais votre navigateur » — n'était
 * qu'une affirmation, gardée par des tests et par la bonne volonté. Sur un
 * serveur, elle devient **une règle appliquée par le navigateur** : une
 * requête vers un hôte non listé est refusée avant de partir.
 *
 * Ce fichier garde ce que cela suppose : que la liste soit juste. Elle peut
 * être fausse dans les deux sens, et les deux coûtent cher :
 *
 * - **un hôte oublié casse l'application** — et pas au build, pas aux tests
 *   unitaires : chez la personne, en montagne, quand la carte refuse de se
 *   charger ;
 * - **un hôte en trop ouvre une porte que personne n'a demandée**, et rend
 *   la politique décorative.
 *
 * La source de comparaison est `journalSortant`, qui existe depuis #178 pour
 * *montrer* ce qui sort. Les deux listes disent la même chose de deux façons ;
 * celle-ci l'interdit, celle-là la compte.
 */

/** Les hôtes autorisés par une directive de la politique. */
function hotesDe(directive: string): string[] {
  const politique = /^set \$csp "([^"]+)";/m.exec(cspBrut)?.[1] ?? ''
  const bloc = politique
    .split(';')
    .map((morceau) => morceau.trim())
    .find((morceau) => morceau.startsWith(`${directive} `))
  if (!bloc) return []
  return bloc
    .split(/\s+/)
    .slice(1)
    .filter((jeton) => jeton.startsWith('https://'))
    .map((jeton) => jeton.replace('https://', ''))
}

describe('la politique existe et se lit', () => {
  it('déclare une directive `set $csp`', () => {
    expect(/^set \$csp "[^"]+";/m.test(cspBrut)).toBe(true)
  })

  /**
   * `vite.config.ts` lit ce fichier pour que le serveur de prévisualisation
   * serve les mêmes en-têtes, et nginx l'inclut. Deux lecteurs, une source.
   * Si nginx cessait de l'inclure, la production servirait une page sans
   * politique pendant que les tests continueraient de passer.
   */
  it('est incluse par nginx, et hors de `conf.d/`', () => {
    expect(nginxBrut).toContain('include /etc/nginx/csp.conf;')
    expect(nginxBrut).toContain('add_header Content-Security-Policy $csp always;')
  })
})

describe('les hôtes autorisés', () => {
  /**
   * Tout ce que le code contacte doit être joignable. C'est le sens
   * « application cassée » de la divergence, et le plus coûteux : il ne se
   * voit qu'en production.
   */
  it('couvrent tout ce que l’application contacte', () => {
    const joignables = new Set([...hotesDe('connect-src'), ...hotesDe('img-src')])
    const manquants = HOTES_CONTACTES.filter((hote) => !joignables.has(hote))
    expect(
      manquants,
      `hôtes contactés par le code mais absents de la politique : ${manquants.join(', ')}`,
    ).toEqual([])
  })

  /**
   * Et rien de plus. C'est le sens « porte ouverte » : moins visible, mais
   * c'est lui qui transforme une protection en décoration.
   */
  it('n’autorisent rien que l’application ne contacte', () => {
    const connus = new Set<string>(HOTES_CONTACTES)
    const enTrop = [...hotesDe('connect-src'), ...hotesDe('img-src')].filter(
      (hote) => !connus.has(hote),
    )
    expect(
      [...new Set(enTrop)],
      `hôtes autorisés que le code ne contacte pas : ${enTrop.join(', ')}`,
    ).toEqual([])
  })
})

describe('ce que la politique refuse', () => {
  const politique = /^set \$csp "([^"]+)";/m.exec(cspBrut)?.[1] ?? ''

  /**
   * Une politique qui laisse passer le script en ligne ne protège de rien :
   * c'est exactement le vecteur qu'elle existe pour fermer. La concession
   * sur les **styles** est assumée et documentée — MapLibre injecte les
   * siens, et les pastilles de couleur sont posées en attribut.
   */
  it('n’autorise ni script en ligne ni évaluation', () => {
    const script = politique
      .split(';')
      .map((m) => m.trim())
      .find((m) => m.startsWith('script-src '))
    expect(script).toBeDefined()
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
  })

  it('ferme ce qui n’a aucun usage ici', () => {
    for (const attendu of [
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(politique).toContain(attendu)
    }
  })

  /**
   * Sans `default-src`, une directive oubliée n'est pas restreinte du tout —
   * et c'est celle qu'on oublie qui compte.
   */
  it('pose un défaut restrictif', () => {
    expect(politique).toMatch(/^default-src 'self'/)
  })
})
