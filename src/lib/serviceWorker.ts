/**
 * Le conteneur de service worker, ou `undefined` quand le navigateur n'en a
 * pas.
 *
 * Sur une origine non sécurisée — la prévisualisation ouverte par l'IP du
 * réseau local, pour essayer sur un téléphone — `navigator.serviceWorker`
 * n'existe pas du tout. Quatre endroits le consultent ; trois se gardaient
 * chacun à la main, le quatrième l'avait oublié, et la page restait blanche
 * (issue #561). La garde est donc nommée ici plutôt que recopiée (CLAUDE.md
 * §4).
 */
export function conteneurServiceWorker(): ServiceWorkerContainer | undefined {
  return 'serviceWorker' in navigator ? navigator.serviceWorker : undefined
}
