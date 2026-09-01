import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  creerEnregistreurDeReglage,
  marquerTouche,
  oublierReglagesTouches,
  repriseAuDemarrage,
} from '../../src/store/reglagesPersistants.ts'

/**
 * Issue #460 — la règle qui empêche la base d'annuler un geste (#203).
 *
 * ## D'où vient ce fichier
 *
 * De la vague du 01/09, une fois `src/store/**` entré dans le périmètre de
 * mutation (#458). `reglagesPersistants.ts` rendait 69,23 %, et un `grep`
 * expliquait pourquoi : **aucun fichier de test ne nommait ce module.** Il
 * n'était exercé qu'indirectement, par des tests qui vérifient des réglages
 * sans jamais poser la question que le module existe pour trancher.
 *
 * Ses quatre survivants changeaient tous un résultat, et trois rouvraient le
 * défaut de #203 mot pour mot : sans le registre, `repriseAuDemarrage` rend
 * toujours ce que contenait la base, donc la case qu'on vient de cocher
 * revient à son ancien état quand IndexedDB répond enfin.
 *
 * Sept réglages passent par cette règle — tolérance, seuil de complétion,
 * objectifs, mode d'affichage, gros texte, guide fermé, panneau replié.
 *
 * ## Ce que le module dit de lui-même, et pourquoi ça n'a pas suffi
 *
 * « Le même piège avait déjà été fermé pour les traces et il est resté
 * ouvert pour les réglages assez longtemps pour être rouvert d'un cran en
 * ajoutant deux drapeaux sans relire le commentaire. **D'où un module,
 * plutôt qu'un commentaire.** »
 *
 * Le module a été créé pour que la règle ne se perde plus, et n'a pas reçu
 * de test. Le §4bis dit ce que vaut une justification que rien ne vérifie —
 * ici c'est le module entier qui était dans ce cas.
 */

/** Un `localStorage` dont le test décide s'il accepte d'écrire. */
function magasinQui(accepte: boolean) {
  const contenu = new Map<string, string>()
  return {
    getItem: (clef: string) => contenu.get(clef) ?? null,
    setItem: (clef: string, valeur: string) => {
      if (!accepte) throw new Error('quota dépassé (test)')
      contenu.set(clef, valeur)
    },
    removeItem: (clef: string) => {
      contenu.delete(clef)
    },
    clear: () => {
      contenu.clear()
    },
    key: () => null,
    length: 0,
  }
}

beforeEach(() => {
  // Le registre vit à la portée du module, comme la page qui l'héberge : il
  // survit d'un test au suivant si on ne le vide pas.
  oublierReglagesTouches()
  vi.stubGlobal('localStorage', magasinQui(true))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('la règle de reprise au démarrage', () => {
  it('rend ce que contenait la base tant que personne n’a rien touché', () => {
    expect(repriseAuDemarrage('toleranceMeters', 30, 50)).toBe(30)
  })

  it('rend ce qui est en mémoire dès que la clef a été tranchée', () => {
    /*
      LA question de #203. `init` lit la base en asynchrone ; entre le
      premier rendu et sa réponse, quelqu'un a le temps de cocher une case.
      Sans cette règle, la valeur d'avant revient sous ses yeux.
    */
    marquerTouche('toleranceMeters')
    expect(repriseAuDemarrage('toleranceMeters', 30, 50)).toBe(50)
  })

  it('protège la clef touchée, et elle seule', () => {
    /*
      Un registre par clef, pas un drapeau global : quelqu'un qui règle la
      tolérance pendant le démarrage doit quand même retrouver le gros texte
      qu'il avait choisi la fois d'avant.
    */
    marquerTouche('toleranceMeters')
    expect(repriseAuDemarrage('toleranceMeters', 30, 50)).toBe(50)
    expect(repriseAuDemarrage('grosTexte', 'oui', 'non')).toBe('oui')
  })

  it('repart d’une session vierge quand on l’oublie', () => {
    marquerTouche('toleranceMeters')
    oublierReglagesTouches()
    expect(repriseAuDemarrage('toleranceMeters', 30, 50)).toBe(30)
  })
})

describe('enregistrer un réglage', () => {
  it('marque la clef comme tranchée, ce qui protège le geste', async () => {
    /*
      Les deux bouts de la même règle : sans cet appel, le registre reste
      vide même quand la personne a cliqué, et la base gagne quand même.
    */
    const enregistrer = creerEnregistreurDeReglage({
      baseOuverte: () => Promise.resolve(null),
    })
    await enregistrer('toleranceMeters', 50, () => undefined)

    expect(repriseAuDemarrage('toleranceMeters', 30, 50)).toBe(50)
  })

  it('écrit avant d’appliquer, dans cet ordre', async () => {
    /*
      L'ordre est documenté et motivé dans le module — « quand localStorage
      rend la main, c'est écrit ; on applique donc après, sachant que c'est
      gardé ». Une justification qui affirme se vérifie (§4bis).
    */
    const ordre: string[] = []
    const magasin = magasinQui(true)
    vi.stubGlobal('localStorage', {
      ...magasin,
      setItem: (clef: string, valeur: string) => {
        ordre.push('écrit')
        magasin.setItem(clef, valeur)
      },
    })
    const enregistrer = creerEnregistreurDeReglage({
      baseOuverte: () => Promise.resolve(null),
    })

    await enregistrer('toleranceMeters', 50, () => ordre.push('appliqué'))

    expect(ordre).toEqual(['écrit', 'appliqué'])
  })

  it('se replie sur la base quand le stockage synchrone refuse', async () => {
    const ecrites: [string, string | number][] = []
    vi.stubGlobal('localStorage', magasinQui(false))
    const enregistrer = creerEnregistreurDeReglage({
      baseOuverte: () =>
        Promise.resolve({
          setSetting: (clef: string, valeur: string | number) => {
            ecrites.push([clef, valeur])
            return Promise.resolve()
          },
        }),
    })

    await enregistrer('toleranceMeters', 50, () => undefined)

    expect(ecrites).toEqual([['toleranceMeters', 50]])
  })

  it('ne lève pas quand ni le stockage ni la base ne veulent de lui', async () => {
    /*
      Le survivant `if (db)` → `true`, et c'est la même forme que celui
      d'`oubliDeZone.ts` trouvé dans la même vague : une garde que le harnais
      ne met jamais à l'épreuve parce qu'il rend toujours une base.
      
      Le cas est réel et le module l'annonce : « certains navigateurs
      verrouillent localStorage et pas l'autre ». Quand les deux refusent,
      `null.setSetting` lèverait, et le rejet ne serait attrapé nulle part —
      un clic sur un réglage ferait remonter une erreur sans rapport.
    */
    vi.stubGlobal('localStorage', magasinQui(false))
    const enregistrer = creerEnregistreurDeReglage({
      baseOuverte: () => Promise.resolve(null),
    })

    let applique = false
    await expect(
      enregistrer('toleranceMeters', 50, () => (applique = true)),
    ).resolves.toBeUndefined()
    // Et le réglage s'applique quand même : perdu au rechargement, pas
    // pendant la session.
    expect(applique).toBe(true)
  })
})
