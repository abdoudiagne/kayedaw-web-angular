import { expect, test } from '@playwright/test';
import { dansNJours, seConnecter } from './aide';

test.describe('Séances', () => {

  test.beforeEach(async ({ page }) => seConnecter(page));

  /**
   * Le cœur de la planification : la météo doit apparaître AVANT enregistrement,
   * grâce à la ville de référence du profil. Aucun test unitaire ne peut le
   * prouver — il faut le vrai formulaire, la vraie API et le vrai service météo.
   */
  test('affiche la météo prévue avant enregistrement', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    // La ville doit être pré-remplie depuis le profil
    await expect(page.getByLabel('Ville (optionnel)')).not.toHaveValue('');

    await page.getByLabel('Date et heure').fill(dansNJours(3, '07:00'));

    const apercu = page.locator('.apercu-meteo');
    await expect(apercu).toBeVisible({ timeout: 20_000 });
    await expect(apercu).toContainText(/prévision/);
  });

  /**
   * NON-RÉGRESSION : à l'ouverture de l'écran, la date est pré-remplie à
   * MAINTENANT. Le jour courant était routé vers l'API archive, qui s'arrête à
   * hier — l'aperçu s'affichait donc avec l'en-tête mais AUCUNE mesure.
   */
  test('affiche la météo du jour dès l ouverture, sans rien saisir', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    const apercu = page.locator('.apercu-meteo');
    await expect(apercu).toBeVisible({ timeout: 20_000 });

    // Un en-tête seul ne suffit pas : on exige des valeurs chiffrées
    await expect(apercu.locator('dd')).not.toHaveCount(0);
    await expect(apercu).toContainText(/°C/);
    await expect(apercu).toContainText(/km\/h/);
  });

  /**
   * NON-RÉGRESSION : la liste de villes se dépliait toute seule à l'ouverture
   * de l'écran. La ville étant pré-remplie depuis le profil, l'affectation
   * programmatique déclenchait `valueChanges` comme une frappe utilisateur.
   */
  test('la liste de villes ne s ouvre pas toute seule à l ouverture', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    const ville = page.getByLabel('Ville (optionnel)');
    await expect(ville).not.toHaveValue('');          // bien pré-remplie
    // Au-delà du debounce de 250 ms, aucune liste ne doit être apparue
    await page.waitForTimeout(1200);
    await expect(page.getByRole('listbox')).toHaveCount(0);

    // Mais elle s'ouvre dès que l'utilisateur tape réellement
    await ville.fill('');
    await ville.pressSequentially('bord', { delay: 60 });
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 15_000 });
  });

  /**
   * La ville pré-remplie est une COMMODITÉ, pas une contrainte : elle doit
   * rester librement modifiable, et l'aperçu météo doit suivre la nouvelle
   * ville — sinon on planifierait sur les conditions du mauvais lieu.
   */
  test('la ville pré-remplie reste modifiable et la météo suit', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    const ville = page.getByLabel('Ville (optionnel)');

    // Ni readonly ni disabled : le champ est éditable
    await expect(ville).toBeEditable();
    await expect(ville).toHaveValue('Lille');

    // On la remplace par une autre ville, choisie dans les suggestions
    await ville.fill('');
    await ville.pressSequentially('Bordeaux', { delay: 50 });
    const liste = page.getByRole('listbox');
    await expect(liste).toBeVisible({ timeout: 15_000 });
    await liste.getByRole('option').first().click();
    await expect(ville).toHaveValue(/Bordeaux/);

    // L'aperçu météo doit refléter la NOUVELLE ville
    await page.getByLabel('Date et heure').fill(dansNJours(3, '09:00'));
    const apercu = page.locator('.apercu-meteo');
    await expect(apercu).toBeVisible({ timeout: 20_000 });
    await expect(apercu).toContainText(/Bordeaux/);
  });

  test('la ville peut aussi être saisie à la main sans passer par la liste', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    const ville = page.getByLabel('Ville (optionnel)');

    await ville.fill('');
    await ville.pressSequentially('Nantes', { delay: 40 });
    // On ferme la liste par Échap : la saisie libre doit être conservée
    await ville.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(ville).toHaveValue('Nantes');
  });

  test('l allure et la vitesse s affichent et restent cohérentes', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    await page.getByLabel('Distance (km)').fill('5');
    await page.getByLabel('Durée (minutes)').fill('30');

    const apercu = page.locator('.apercu');
    // 5 km en 30 min : 6'00"/km ET 10 km/h — deux lectures du même effort
    await expect(apercu).toContainText(`6'00"/km`);
    await expect(apercu).toContainText('10 km/h');
  });

  test('refuse une planification au-delà de 14 jours', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    await page.getByLabel('Distance (km)').fill('10');
    await page.getByLabel('Durée (minutes)').fill('50');
    await page.getByLabel('Date et heure').fill(dansNJours(40));
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(/au-delà de 14 jours/)).toBeVisible();
  });

  test('enregistre une séance passée et la retrouve dans la liste', async ({ page }) => {
    const commentaire = `e2e-${Date.now()}`;
    await page.goto('/seances/nouvelle');
    await page.getByLabel('Distance (km)').fill('7.5');
    await page.getByLabel('Durée (minutes)').fill('40');
    await page.getByLabel('Date et heure').fill(dansNJours(-2, '09:00'));
    await page.getByLabel('Commentaire').fill(commentaire);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page).toHaveURL(/\/seances/);

    // La recherche serveur doit la retrouver
    await page.getByLabel('Recherche').fill(commentaire);
    await expect(page.locator('.seance')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.seance').first()).toContainText('7.5');
  });

  test('les mesures de la liste portent leur intitulé', async ({ page }) => {
    await page.goto('/seances');
    const premiere = page.locator('.seance').first();
    await expect(premiere).toBeVisible({ timeout: 15_000 });

    // Sans intitulé, « 1h02 » se lisait comme une heure et non une durée
    for (const intitule of ['Distance', 'Durée', 'Allure', 'Vitesse']) {
      await expect(premiere.getByText(intitule, { exact: true })).toBeVisible();
    }
  });
});
