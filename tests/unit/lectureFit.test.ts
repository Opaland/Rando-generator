import { describe, it, expect } from 'vitest'
import { FIT_EPOCH_SECONDS, FitError, looksLikeFit, parseFit } from '../../src/core/fit.ts'
import { buildFit } from '../fixtures/fit.ts'

/**
 * Le lecteur FIT devant ce que `buildFit` ne sait pas fabriquer.
 *
 * Écrit après la vague de mutation du 18/10 sur `core/fit.ts` : 52
 * survivants et 14 lignes jamais exécutées. La fixture écrit toujours la
 * même définition — cinq champs, dans le même ordre, aux bons types — et
 * jamais une vraie précision GPS (elle écrit la sentinelle 0xFF). Rien
 * n'éprouvait donc les heures et précisions rendues, un en-tête compressé,
 * un champ plus court que son type, une altitude « améliorée », ni un
 * fichier qui s'arrête au milieu d'une définition.
 *
 * `octets` écrit un fichier à la main, petit-boutien, et annonce dans
 * l'en-tête exactement la taille des données : un lecteur qui lirait
 * au-delà sortirait du tampon et lèverait, au lieu de lire du vide en
 * silence.
 */

const LE = true

/** Un fichier FIT dont les données sont exactement `corps`. */
function octets(corps: number[]): ArrayBuffer {
  const entete = [12, 0x20, 0x5c, 0x08, ...u32(corps.length), 0x2e, 0x46, 0x49, 0x54]
  return Uint8Array.from([...entete, ...corps]).buffer
}

function u16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff]
}
function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
}
const i32 = (v: number) => u32(v >>> 0)
const semi = (deg: number) => i32(Math.round((deg * 2 ** 31) / 180))
function f32(v: number): number[] {
  const b = new DataView(new ArrayBuffer(4))
  b.setFloat32(0, v, LE)
  return [0, 1, 2, 3].map((i) => b.getUint8(i))
}
function f64(v: number): number[] {
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, v, LE)
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => b.getUint8(i))
}

interface Champ {
  numero: number
  taille: number
  type: number
}

/** Une définition de message : en-tête, réserve, boutisme, numéro global, champs. */
function definition(local: number, global: number, champs: Champ[]): number[] {
  return [0x40 | local, 0, 0, ...u16(global), champs.length, ...champs.flatMap((c) => [c.numero, c.taille, c.type])]
}

const LAT: Champ = { numero: 0, taille: 4, type: 0x85 }
const LON: Champ = { numero: 1, taille: 4, type: 0x85 }
const ALT: Champ = { numero: 2, taille: 2, type: 0x84 }

/** Un enregistrement de position, à Grenoble ou ailleurs. */
const position = (lat = 45.19, lon = 5.72) => [...semi(lat), ...semi(lon)]
const altitudeBrute = (m: number) => Math.round((m + 500) * 5)

describe('ce que buildFit écrit et que personne ne relisait', () => {
  it('rend les heures et les précisions GPS, alignées sur les points', () => {
    const lu = parseFit(
      buildFit([
        { timestamp: 1_000, lat: 45.19, lon: 5.72, gpsAccuracy: 5 },
        { timestamp: 1_010 }, // sans position : ne décale rien
        { timestamp: 1_020, lat: 45.191, lon: 5.721 },
      ]),
    )
    expect(lu.times).toEqual([
      (1_000 + FIT_EPOCH_SECONDS) * 1_000,
      (1_020 + FIT_EPOCH_SECONDS) * 1_000,
    ])
    expect(lu.precisionsMetres).toEqual([5, null])
  })

  it('ne laisse pas un autre champ du relevé écraser la précision GPS', () => {
    // Une vraie montre écrit bien plus que cinq champs : la fréquence
    // cardiaque (champ 3, uint8) vient ici après la précision.
    const fichier = octets([
      ...definition(0, 20, [LAT, LON, { numero: 31, taille: 1, type: 0x02 }, { numero: 3, taille: 1, type: 0x02 }]),
      0x00, ...position(), 5, 142,
    ])
    expect(parseFit(fichier).precisionsMetres).toEqual([5])
  })

  it('date la trace de son premier enregistrement, pas d’un autre message', () => {
    // `withOtherMessage` place avant les enregistrements une session
    // horodatée à 1 000 s ; le premier enregistrement l'est à 5 000 s.
    const lu = parseFit(buildFit([{ timestamp: 5_000, lat: 45.19, lon: 5.72 }], { withOtherMessage: true }))
    expect(lu.date).toBe(new Date((5_000 + FIT_EPOCH_SECONDS) * 1_000).toISOString())
  })
})

describe('les positions', () => {
  it.each([
    ['une latitude absente', { timestamp: 1, lon: 5.72 }],
    ['une longitude absente', { timestamp: 1, lat: 45.19 }],
  ])('écartent un enregistrement dont %s, sans le compter hors limites', (_cas, sansFix) => {
    const lu = parseFit(buildFit([sansFix, { timestamp: 2, lat: 45.19, lon: 5.72 }]))
    expect(lu.points).toHaveLength(1)
    expect(lu.pointsHorsLimites).toBe(0)
  })

  it.each([
    ['sur l’équateur', 0, 5.72],
    ['sur le méridien de Greenwich', 45.19, 0],
  ])('gardent un point %s : seul le 0/0 dit « pas de fix »', (_cas, lat, lon) => {
    const lu = parseFit(buildFit([{ timestamp: 1, lat, lon }]))
    expect(lu.points).toHaveLength(1)
  })
})

describe('l’altitude', () => {
  const ENHANCED: Champ = { numero: 78, taille: 4, type: 0x86 }

  it('lit l’altitude améliorée, quel que soit l’ordre des deux champs', () => {
    const avantPuisApres = octets([
      ...definition(0, 20, [LAT, LON, ALT, ENHANCED]),
      0x00, ...position(), ...u16(altitudeBrute(100)), ...u32(altitudeBrute(812)),
    ])
    const apresPuisAvant = octets([
      ...definition(0, 20, [LAT, LON, ENHANCED, ALT]),
      0x00, ...position(), ...u32(altitudeBrute(812)), ...u16(altitudeBrute(100)),
    ])
    expect(parseFit(avantPuisApres).elevations).toEqual([812])
    expect(parseFit(apresPuisAvant).elevations).toEqual([812])
  })

  it.each([
    ['sint8', 0x01, [altitudeBrute(-480)], -480],
    ['sint16', 0x83, u16(altitudeBrute(1_500)), 1_500],
    ['byte', 0x0d, [altitudeBrute(-490)], -490],
    ['float32', 0x88, f32(altitudeBrute(812)), 812],
    ['float64', 0x89, f64(altitudeBrute(812)), 812],
  ])('se lit quand elle est écrite en %s', (_type, type, brut, metres) => {
    const fichier = octets([
      ...definition(0, 20, [LAT, LON, { numero: 2, taille: brut.length, type }]),
      0x00, ...position(), ...brut,
    ])
    expect(parseFit(fichier).elevations[0]).toBeCloseTo(metres, 6)
  })

  it.each([
    ['une valeur flottante NaN', { numero: 2, taille: 4, type: 0x88 }, f32(Number.NaN)],
    ['un type qu’il ne sait pas lire (chaîne)', { numero: 2, taille: 2, type: 0x07 }, [0x41, 0x00]],
    ['un champ plus court que son type', { numero: 2, taille: 1, type: 0x84 }, [0x10]],
  ])('est absente pour %s, plutôt qu’inventée', (_cas, champ, brut) => {
    const lu = parseFit(octets([...definition(0, 20, [LAT, LON, champ]), 0x00, ...position(), ...brut]))
    expect(lu.points).toHaveLength(1)
    expect(lu.elevations).toEqual([null])
  })
})

describe('l’en-tête à horodatage compressé', () => {
  it('désigne son type local sur les bits 5-6, pas sur les quatre derniers', () => {
    // Local 0 : une session, sans position. Local 1 : un enregistrement.
    // 0xA0 = compressé, type local 1. Lu comme un en-tête ordinaire, il
    // désignerait le type local 0 — la session.
    const fichier = octets([
      ...definition(0, 18, [{ numero: 253, taille: 4, type: 0x86 }]),
      ...definition(1, 20, [LAT, LON]),
      0xa0, ...position(),
    ])
    expect(parseFit(fichier).points).toHaveLength(1)
  })
})

describe('un fichier qui s’arrête au milieu de quelque chose', () => {
  const premier = [...definition(0, 20, [LAT, LON]), 0x00, ...position()]
  it.each([
    ['au milieu de l’en-tête d’une définition', [0x41, 0, 0]],
    ['au milieu de sa liste de champs', [0x41, 0, 0, ...u16(20), 2, 0, 4]],
    ['avant le compte de ses champs développeur', [0x61, 0, 0, ...u16(20), 1, 0, 4, 0x85]],
    ['au milieu de ses champs développeur', [0x61, 0, 0, ...u16(20), 1, 0, 4, 0x85, 1, 0]],
    ['au milieu d’un enregistrement', [0x00, ...semi(45.2)]],
  ])('%s : rend ce qu’il a lu avant, sans lever', (_cas, coupe) => {
    const lu = parseFit(octets([...premier, ...coupe]))
    expect(lu.points).toHaveLength(1)
  })

  it('s’arrête sur une donnée dont la définition est inconnue', () => {
    // Type local 3, jamais défini : impossible de savoir combien d'octets
    // il occupe, donc on s'arrête sur ce qu'on a lu.
    const lu = parseFit(octets([...premier, 0x03, ...position(45.3, 5.8)]))
    expect(lu.points).toHaveLength(1)
  })
})

describe('looksLikeFit', () => {
  const avec = (signature: string, longueur = 12) => {
    const b = new Uint8Array(longueur)
    b[0] = 12
    for (let i = 0; i < 4; i++) b[8 + i] = signature.charCodeAt(i)
    return b.buffer
  }

  it('reconnaît un en-tête de douze octets tout juste', () => {
    expect(looksLikeFit(avec('.FIT'))).toBe(true)
  })

  it.each(['XFIT', '.XIT', '.FXT', '.FIX'])('refuse la signature « %s »', (signature) => {
    expect(looksLikeFit(avec(signature))).toBe(false)
  })

  it('nomme son erreur', () => {
    expect(new FitError('x').name).toBe('FitError')
  })
})

/*
  Les survivants de la seconde vague (11 sur 236), et pourquoi ils restent
  (§6bis). Vérifiés en lisant le code :

  - `brut === null ||` retiré de `readNumber` : `isNaN(null)` est faux, et
    `null === INVALID_VALUES[type]` aussi — le même `null` revient ;
  - `case 3` (sint16) qui tomberait sur la lecture non signée, et `default`
    retiré : une altitude brute vaut (m + 500) × 5, positive pour toute
    altitude au-dessus de −500 m ; et après le dernier cas, il n'y a rien ;
  - `offset + 5 > fin` et ses deux sœurs en `>=` : elles ne diffèrent que
    pour une définition qui finit pile sur la fin des données, après
    laquelle il n'y a rien à lire de toute façon ;
  - `precision = valeur === UINT8_ABSENT ? null : valeur` sans sa garde, et
    `lat`/`lon !== SEMICIRCLE_ABSENT` forcés à vrai : ces sentinelles sont
    celles de `INVALID_VALUES` pour uint8 et sint32, que `readNumber` a
    déjà changées en `null`. Elles ne gardent que des champs déclarés sous
    un autre type que celui du profil ;
  - `def.globalNumber === RECORD_MESSAGE` forcé à vrai dans le test de
    position : `lat` et `lon` ne sont lus que dans un relevé, ils restent
    `null` ailleurs.
*/
