/**
 * Voir passer ce qui sort, pour pouvoir le montrer (issue #178).
 *
 * L'observation se fait au plus près du navigateur — `fetch` et
 * `XMLHttpRequest` — et non dans les modules qui appellent ces API. La
 * raison est le sens même du compteur : s'il n'observait que les appels que
 * nous écrivons, il ne pourrait jamais révéler celui que nous n'avons pas
 * voulu, et ne prouverait rien. Posé sur le navigateur, il voit aussi ce
 * qu'une dépendance déciderait d'envoyer.
 *
 * Ce qu'il ne voit pas est écrit ici plutôt que passé sous silence : les
 * ressources chargées par le navigateur lui-même — balises `<img>`,
 * feuilles de style, polices — ne passent ni par `fetch` ni par XHR.
 * L'interface ne doit donc affirmer que ce que cette instrumentation
 * couvre, et c'est pourquoi elle parle de « requêtes de l'application »
 * plutôt que de tout trafic.
 */
export function observerReseau(noter: (url: string) => void): void {
  const fetchOriginal = window.fetch.bind(window)
  window.fetch = (entree: RequestInfo | URL, init?: RequestInit) => {
    noter(
      typeof entree === 'string'
        ? entree
        : entree instanceof URL
          ? entree.href
          : entree.url,
    )
    return fetchOriginal(entree, init)
  }

  const prototype = XMLHttpRequest.prototype
  /* eslint-disable @typescript-eslint/unbound-method -- la méthode est
     réinstallée telle quelle sur le prototype et rappelée par `.apply` avec
     son `this` d'origine : elle n'est jamais détachée. */
  const ouvrirOriginal = prototype.open
  /* eslint-enable @typescript-eslint/unbound-method */
  prototype.open = function (
    this: XMLHttpRequest,
    methode: string,
    url: string | URL,
    asynchrone?: boolean,
    utilisateur?: string | null,
    motDePasse?: string | null,
  ) {
    noter(typeof url === 'string' ? url : url.href)
    // `open(methode, url)` vaut `open(methode, url, true)` : la
    // spécification donne `true` pour défaut à `async`. Passer la valeur
    // explicitement évite d'avoir à distinguer les deux surcharges sans rien
    // changer au comportement.
    ouvrirOriginal.call(
      this,
      methode,
      url,
      asynchrone ?? true,
      utilisateur,
      motDePasse,
    )
  }
}
