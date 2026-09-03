import { defineConfig, devices } from '@playwright/test'
import { cibleServieDIci } from './tests/e2e/relais-reseau'

/**
 * La cible sondée, et si elle est servie par cette machine.
 *
 * L'ancienne condition était « `SENTIERS_URL` est posée », justifiée par
 * « elle n'est posée que par le workflow de déploiement ». Cette phrase
 * n'était pas fausse quand elle a été écrite ; elle l'est devenue le 27/08,
 * quand `SENTIERS_URL=http://localhost:4173/` a servi deux fois à vérifier
 * que la sonde rougit (§1) — et l'en-tête de `page-deployee.spec.ts`
 * documente cet usage. Le contrôle de fraîcheur sautait donc précisément
 * dans le cas où il garde encore quelque chose : une cible locale **est**
 * `dist/`.
 *
 * La question juste n'est pas « qui a posé la variable » mais « y a-t-il un
 * `dist/` derrière cette adresse ». Voir `relais-reseau.ts`, d'où la règle
 * vient — une seule fois.
 */
const CIBLE = process.env.SENTIERS_URL
const CIBLE_LOCALE = cibleServieDIci(CIBLE)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Un seul exécutant hors CI, et la raison n'est pas celle qu'on croyait.
   *
   * Le §6 imposait `--workers=1` sur la ligne de commande, et la skill
   * `/porte` l'expliquait par « en parallèle, les tests se marchent dessus ».
   * Mesuré le 03/09 (#491), c'est faux : rien ne se marche dessus. Trois
   * passes consécutives en parallèle sur cette machine à quatre cœurs ont
   * rendu 3, 4 et 3 échecs — **dix tests distincts, presque jamais les
   * mêmes**, et tous sur un `expect.poll` qui expire. Un onglet qui met plus
   * de 15 s à peindre, un marqueur qui n'arrive pas en 5 s, un recentrage
   * mesuré à 0,045° au lieu de 0,01.
   *
   * Ce ne sont donc pas des courses entre tests mais des **budgets de temps
   * calibrés sur une machine au repos**, tenus en défaut par deux Chromium
   * qui rendent du WebGL sur quatre cœurs. Un test qui échoue au hasard une
   * fois sur trois ne mesure plus rien : le §1bis vaut dans les deux sens.
   *
   * Le parallélisme rendrait 25,6 → 15,6 min, soit 39 % — payés par une
   * suite qui ne discrimine plus. Le marché n'en vaut pas la peine.
   *
   * En CI, `undefined` laisse Playwright décider, et c'est mesuré vert :
   * 430 passés en 9,5 min, **aucun test marqué flaky**, donc les deux
   * reprises disponibles n'ont pas servi. Cet exécutant-là est moins
   * contraint que ce conteneur.
   *
   * Le réglage vit ici plutôt que sur la ligne de commande parce qu'un
   * garde-fou qu'il faut penser à taper ne garde rien (§6quater) : l'oubli
   * du drapeau rendait une suite rouge pour une raison qui n'est pas le
   * code.
   */
  workers: process.env.CI ? undefined : 1,
  /**
   * Une borne à la suite entière, et pas seulement à chaque test.
   *
   * Le délai par test (30 s) ne protège de rien si ce qui bloque est en
   * dehors d'un test : un serveur de prévisualisation qui ne démarre pas,
   * un navigateur qui ne rend pas la main, un exécutant qui n'avance plus.
   * Rien, dans la chaîne, n'avait de raison de s'arrêter avant la limite de
   * six heures de GitHub.
   *
   * **Le nombre est au-dessus du pire cas observé, pas du cas ordinaire.**
   * Le pire cas connu est de **cinquante minutes**, le 23/08, sur un
   * exécutant lent — un run qui a fini par réussir. Une borne posée à
   * vingt-cinq minutes, écrite avant de connaître ce chiffre, aurait
   * transformé cette réussite en échec. Une porte qui rougit sur la lenteur
   * d'une machine ne mesure plus le code.
   *
   * Soixante-dix minutes ne protègent donc pas de la lenteur, et c'est
   * voulu : elles protègent de l'infini.
   *
   * **Les durées ordinaires ne sont plus écrites ici** (#491). Elles
   * l'étaient — « 3,7 à 4,5 min en CI, 8,6 min sur ma machine » — et les
   * deux avaient triplé sans que personne le voie : mesuré le 03/09,
   * 9,5 min en CI et 25,2 min ici. Un chiffre que rien ne garde redevient
   * faux, et il vaut mieux ne pas l'écrire que le réécrire (§3).
   */
  /*
    Refuse de démarrer sur un `dist/` périmé (CLAUDE.md §6quater).

    Le hook `.claude/hooks/dist-a-jour.sh` pose la même question, mais avant
    l'exécution de la commande — et une commande qui modifie les sources puis
    lance Playwright passe donc au travers. Ce contrôle-ci s'exécute dans le
    processus, au démarrage : il n'y a plus d'intervalle entre la
    vérification et l'usage. Voir l'en-tête du fichier pour le raté daté.
  */
  /*
    Deux réglages sautent quand `SENTIERS_URL` est posé, et il faut dire
    pourquoi plutôt que de le laisser deviner.

    La sonde de déploiement (`page-deployee.spec.ts`) interroge un site
    **déjà publié**. Elle n'a donc ni serveur de prévisualisation à démarrer
    ni `dist/` local à comparer aux sources : le contrôle de fraîcheur
    n'aurait rien à garder, et le refuser au démarrage empêcherait la seule
    sonde qui regarde ce que les gens voient vraiment.

    Le §6quater interdit d'écarter un garde-fou en silence : hors de ce mode,
    les deux restent en place mot pour mot, et `SENTIERS_URL` n'est posé que
    par le workflow de déploiement.
  */
  ...(CIBLE_LOCALE ? { globalSetup: './tests/e2e/dist-a-jour.ts' } : {}),
  globalTimeout: 70 * 60 * 1000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Le service worker intercepte les requêtes réseau et court-circuiterait
    // les mocks de page.route : bloqué par défaut, et réactivé explicitement
    // dans le seul test qui l'exerce (tests/e2e/offline.spec.ts).
    serviceWorkers: 'block',
    // Permet d'utiliser un Chromium déjà installé (env sans téléchargement).
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(CIBLE === undefined
    ? {
        webServer: {
          command: 'npm run preview',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
        },
      }
    : {}),
})
