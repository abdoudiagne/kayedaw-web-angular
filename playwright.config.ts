import { defineConfig, devices } from '@playwright/test';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TESTS DE BOUT EN BOUT — ce qu'ils apportent en plus des autres          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Les tests Karma vérifient des unités isolées (pipes, validateurs, services
 * avec HttpTestingController) : aucun ne prouve qu'un parcours complet
 * fonctionne. Ces tests-ci pilotent un vrai navigateur contre la vraie API :
 * ils auraient attrapé des défauts qu'aucun test unitaire ne pouvait voir —
 * la connexion sensible à la casse, ou le favicon absent.
 *
 * ⚠️ PRÉREQUIS : le backend doit tourner sur :8080.
 * Le serveur front est démarré automatiquement ci-dessous ; l'API, elle, vit
 * dans un autre dépôt et n'est pas du ressort de cette configuration.
 */
export default defineConfig({
  testDir: './e2e',
  // Un parcours complet est plus lent qu'un test unitaire : on laisse de l'air
  timeout: 45_000,
  expect: { timeout: 10_000 },

  // En local on veut voir le premier échec ; en CI on relance une fois pour
  // absorber les aléas réseau des services météo externes.
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,

  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:4200',
    // Trace conservée au premier échec : elle rejoue le parcours pas à pas,
    // ce qui évite de deviner à partir d'un message d'assertion.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /*
     * Le responsive est une exigence du projet : on le VÉRIFIE au lieu de
     * l'espérer. Les tests marqués @mobile ne tournent que sur ce profil.
     *
     * Viewport mobile sur CHROMIUM et non le profil iPhone, qui exige WebKit :
     * pour une vérification de débordement, le moteur de rendu n'apporte rien
     * et éviterait un second navigateur de 300 Mo à télécharger.
     */
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },   // gabarit d'un téléphone courant
        isMobile: true,
        hasTouch: true
      },
      grep: /@mobile/
    }
  ],

  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    // On réutilise le serveur déjà lancé en développement plutôt que d'en
    // démarrer un second, qui échouerait sur un port occupé.
    reuseExistingServer: true,
    timeout: 120_000
  }
});
