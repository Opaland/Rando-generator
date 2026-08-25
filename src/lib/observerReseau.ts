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
 *
 * ## Le corps, depuis le 25/08
 *
 * L'observateur ne rendait que l'URL, et le panneau affichait « 0 requête
 * contenait vos traces » — un zéro **écrit en dur**, qui ne pouvait pas
 * monter. Pour que ce chiffre soit une mesure, il faut voir ce qui part,
 * pas seulement où.
 *
 * Seuls les corps **textuels** sont rendus : une chaîne, ou l'`URLSearchParams`
 * d'un formulaire. Un `Blob`, un `FormData` ou un flux ne sont pas lus — les
 * lire coûterait une copie à chaque requête, et les consommer casserait
 * l'envoi. `null` veut donc dire « rien à lire ici », jamais « rien dedans »,
 * et l'interface doit le dire ainsi.
 */
type Corps = string | null

function corpsLisible(valeur: unknown): Corps {
  if (typeof valeur === 'string') return valeur
  if (valeur instanceof URLSearchParams) return valeur.toString()
  return null
}

export function observerReseau(
  noter: (url: string, corps: Corps) => void,
): void {
  const fetchOriginal = window.fetch.bind(window)
  window.fetch = (entree: RequestInfo | URL, init?: RequestInit) => {
    noter(
      typeof entree === 'string'
        ? entree
        : entree instanceof URL
          ? entree.href
          : entree.url,
      corpsLisible(init?.body),
    )
    return fetchOriginal(entree, init)
  }

  /*
    Une `WeakMap` plutôt qu'une propriété posée sur la requête : elle ne
    retient pas l'objet, donc une requête abandonnée avant son `send` ne
    fuite pas — et rien n'est ajouté à un objet du navigateur.
  */
  const urlEnAttente = new WeakMap<XMLHttpRequest, string>()

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
    /*
      L'URL est connue à `open`, le corps à `send` : on retient l'une pour
      la rendre avec l'autre. Sans ça, une requête POST serait comptée sans
      son contenu — c'est-à-dire comptée sans ce qui compte.
    */
    urlEnAttente.set(this, typeof url === 'string' ? url : url.href)
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

  /* eslint-disable @typescript-eslint/unbound-method -- même raison que
     ci-dessus : `send` est réinstallée sur le prototype et rappelée par
     `.apply` avec son `this` d'origine. */
  const envoyerOriginal = prototype.send
  /* eslint-enable @typescript-eslint/unbound-method */
  prototype.send = function (this: XMLHttpRequest, corps?: unknown) {
    const url = urlEnAttente.get(this)
    if (url !== undefined) {
      urlEnAttente.delete(this)
      noter(url, corpsLisible(corps))
    }
    envoyerOriginal.call(this, corps as XMLHttpRequestBodyInit | null)
  }
}
