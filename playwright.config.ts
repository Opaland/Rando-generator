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
   * un navigateur qui ne rend pas la main, un exécutant figé. Le 23/08,
   * l'étape e2e d'une PR de documentation seule est restée en cours
   * cinquante minutes sur du code qui venait de passer en quatre minutes et
   * demie, et rien dans la chaîne n'avait de raison de s'arrêter avant la
   * limite de six heures de GitHub.
   *
   * Mesuré : 3,7 à 4,5 min en intégration continue, 8,6 min sur ma machine
   * avec `--workers=1`. Vingt-cinq minutes laissent près de trois fois le
   * pire cas connu, et transforment un blocage en rapport lisible plutôt
   * qu'en exécutant tué.
   */
  globalTimeout: 25 * 60 * 1000,
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
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
