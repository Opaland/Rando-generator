/**
 * Un réglage qu'on montre tout de suite et qu'on n'écrit qu'après un délai —
 * le curseur de tolérance, qui relance l'appariement à chaque écriture.
 *
 * Sorti de `Settings.tsx` (#569, point 2), où deux défauts vivaient dans
 * dix lignes de minuteur :
 * - le brouillon était effacé au retour de **chaque** écriture. Sur une
 *   grosse zone, ce retour tombait pendant un nouveau glissement et ramenait
 *   le curseur en arrière. Il n'est effacé que si la valeur écrite est
 *   encore la dernière demandée ;
 * - le minuteur était effacé au démontage, et un réglage fait juste avant de
 *   quitter l'onglet se perdait. Il est écrit au démontage.
 */
export interface OptionsReglageDiffere {
  delaiMs: number
  ecrire: (valeur: number) => Promise<void>
  /** La valeur à montrer, ou `null` pour suivre celle du magasin. */
  brouillon: (valeur: number | null) => void
}

export interface ReglageDiffere {
  changer: (valeur: number) => void
  demonter: () => void
}

export function creerReglageDiffere(
  options: OptionsReglageDiffere,
): ReglageDiffere {
  let minuteur: ReturnType<typeof setTimeout> | null = null
  let enAttente: number | null = null
  let derniere: number | null = null
  let monte = true

  const ecrire = (valeur: number) => {
    void options.ecrire(valeur).then(() => {
      if (!monte || derniere !== valeur) return
      derniere = null
      options.brouillon(null)
    })
  }

  return {
    changer(valeur) {
      derniere = valeur
      options.brouillon(valeur)
      if (minuteur) clearTimeout(minuteur)
      enAttente = valeur
      minuteur = setTimeout(() => {
        minuteur = null
        enAttente = null
        ecrire(valeur)
      }, options.delaiMs)
    },
    demonter() {
      monte = false
      if (minuteur) clearTimeout(minuteur)
      minuteur = null
      if (enAttente !== null) void options.ecrire(enAttente)
      enAttente = null
    },
  }
}
