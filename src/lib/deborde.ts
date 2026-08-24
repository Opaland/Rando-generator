import { useCallback, useEffect, useState } from 'react'

/**
 * Est-ce que ce cadre cache du contenu sous son bord ?
 *
 * Retour de Cédric, 24/08 : « le profil des terrains est coupé à moitié
 * lorsque tu regardes ». La fiche détail enfermait 2 334 px de contenu dans
 * 400 px de fenêtre, et **rien ne le disait** — les navigateurs ne dessinent
 * plus de barre de défilement permanente, si bien qu'un texte coupé au ras du
 * bord se lit comme un texte fini.
 *
 * Les ombres de défilement (CSS pur, voir `ItineraryDetail.module.css`) font
 * le travail à l'œil. Ce crochet fait les deux choses que le CSS ne sait pas
 * faire :
 *
 * - poser un attribut **mesurable**, donc testable autrement qu'en comparant
 *   des dégradés ;
 * - rendre le cadre atteignable au clavier. Une zone défilante non
 *   focalisable enferme son contenu pour qui n'a pas de souris : les flèches
 *   ne font rien tant que rien n'a le focus. C'est WCAG 2.1.1, et un défaut
 *   réel — pas une précaution.
 *
 * ## Une ref de rappel, et pourquoi
 *
 * La première version prenait un `RefObject` et observait `ref.current` dans
 * un effet monté une fois. Elle ne marchait jamais, et le test l'a dit :
 * `ItineraryDetail` rend `null` tant qu'aucun itinéraire n'est ouvert, si
 * bien que l'effet tournait sur une référence vide, repartait aussitôt, et
 * **ne revenait pas** — ses dépendances, l'objet ref, ne changent jamais.
 *
 * Une ref de rappel donne à l'effet une dépendance qui, elle, change au
 * moment exact où l'élément apparaît. C'est la différence entre observer un
 * élément et observer une case qui contiendra peut-être un élément.
 */
export function useDeborde(): [(element: HTMLElement | null) => void, boolean] {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [deborde, setDeborde] = useState(false)

  const poser = useCallback((noeud: HTMLElement | null) => {
    setElement(noeud)
  }, [])

  useEffect(() => {
    if (
      !element ||
      typeof ResizeObserver === 'undefined' ||
      typeof MutationObserver === 'undefined'
    ) {
      return
    }
    const mesurer = (): void => {
      // Quatre pixels de tolérance : un sous-pixel d'arrondi ne fait pas un
      // débordement, et allumer la marque pour rien la rendrait muette.
      setDeborde(element.scrollHeight > element.clientHeight + 4)
    }

    /*
      Deux observateurs, parce qu'il y a deux façons de déborder.

      `ResizeObserver` voit le **cadre** changer : une fenêtre redimensionnée,
      un téléphone qui pivote. Il appelle son rappel dès l'observation, ce qui
      donne la mesure initiale — sans poser l'état depuis le corps de l'effet,
      ce qui déclencherait le rendu en cascade que le lint interdit à juste
      titre.

      `MutationObserver` voit le **contenu** changer, et c'est le cas fréquent
      ici : le profil altimétrique et les points d'intérêt sont deux appels
      réseau qui répondent quand ils veulent, longtemps après le montage.
    */
    const taille = new ResizeObserver(mesurer)
    taille.observe(element)
    const contenu = new MutationObserver(mesurer)
    contenu.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => {
      taille.disconnect()
      contenu.disconnect()
    }
  }, [element])

  return [poser, deborde]
}
