import { useEffect, useRef, type RefObject } from 'react'

/**
 * Ramène une alerte dans la fenêtre dès qu'elle apparaît.
 *
 * `ZonePicker.tsx` le faisait déjà pour `zone-error` (issue #497) : Zoé n'a
 * rien vu parce que le message était rendu 474 px sous la ligne de
 * flottaison. Une seconde instance de la même famille, trouvée le 07/09 en
 * élargissant la sonde des règles d'écran à dix nouvelles alertes (#499) :
 * `sorties-inconnues`, `fuite-trace` et `gpx-errors` étaient rendues, avaient
 * un rectangle valide, et restaient hors champ — l'une hors de la fenêtre du
 * navigateur, les deux autres hors de la zone visible d'un panneau ou d'une
 * boîte de dialogue qui défile. Trois alertes de plus recopiant le même
 * `useRef` + `useEffect` auraient été le mode d'échec que CLAUDE.md §4
 * décrit : une garde qu'on ne sait pas qu'on recopie tant qu'on ne cherche
 * pas la troisième fois.
 *
 * `block: 'nearest'` : un défilement qui répond à ce que la personne vient
 * de faire n'est pas une surprise ; `'center'` ou `'start'` en seraient une,
 * en déplaçant la page ou le panneau même quand rien ne le demande.
 *
 * `aussi` couvre un second ordre d'arrivée que `active` seul ne voit pas.
 * `SortiesReseau` reste monté en permanence **derrière** la boîte de
 * dialogue « À propos », fermée par défaut : si la donnée déclenchant
 * l'alerte arrive avant que quelqu'un ouvre la boîte, `active` passe à vrai
 * pendant qu'elle est invisible (`display: none`), et `scrollIntoView` n'y
 * fait alors rien. `aussi` (l'état ouvert/fermé de la boîte) fait relancer
 * l'effet à l'ouverture — mais React exécute les effets d'un enfant
 * **avant** ceux de son parent, et c'est le parent (`About`) qui appelle
 * `dialog.showModal()` : sans le différer, ce second passage tombait lui
 * aussi avant que la boîte soit montrée, et ne ramenait toujours rien.
 * Trouvé le 07/09 en revérifiant après coup, comme le veut CLAUDE.md §1,
 * que le premier correctif faisait vraiment ce qu'il prétendait.
 *
 * `requestAnimationFrame` repousse l'appel après le lot d'effets de ce
 * rendu, `showModal()` de `About` compris.
 */
export function useDefilerVersAlerte<T extends HTMLElement>(
  active: boolean,
  aussi?: unknown,
): RefObject<T> {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: 'nearest' })
    })
    return () => {
      cancelAnimationFrame(id)
    }
    // `aussi` n'est lu que pour redéclencher l'effet à son changement.
  }, [active, aussi])
  return ref
}
