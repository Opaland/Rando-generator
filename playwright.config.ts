import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
   * Mesuré : 3,7 à 4,5 min en intégration continue d'habitude, 8,6 min sur
   * ma machine en `--workers=1` — et **cinquante minutes** le 23/08 sur un
   * exécutant lent, run qui a fini par réussir. Une borne posée à vingt-cinq
   * minutes, écrite avant de connaître ce chiffre, aurait transformé cette
   * réussite en échec. Une porte qui rougit sur la lenteur d'une machine ne
   * mesure plus le code.
   *
   * Soixante-dix minutes ne protègent donc pas de la lenteur, et c'est
   * voulu : elles protègent de l'infini.
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
  ...(process.env.SENTIERS_URL
    ? {}
    : { globalSetup: './tests/e2e/dist-a-jour.ts' }),
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
  ...(process.env.SENTIERS_URL
    ? {}
    : {
        webServer: {
          command: 'npm run preview',
          url: 'http://localhost:4173',
          reuseExistingServer: !process.env.CI,
        },
      }),
})
