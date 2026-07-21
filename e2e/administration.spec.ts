import { expect, test } from '@playwright/test';
import { COMPTES, creerCompte, creerSeance, ilYA, seConnecter } from './aide';

test.describe('Administration', () => {

  test('un utilisateur simple ne peut pas y accéder', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await seConnecter(page, compte);

    await page.goto('/administration');

    // adminGuard renvoie vers les séances et signale le refus
    await expect(page).toHaveURL(/\/seances/);
    await expect(page.getByText(/réservé aux administrateurs/)).toBeVisible();
  });

  test('le lien Administration reste caché pour un non-admin', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await seConnecter(page, compte);

    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  });

  test('l admin voit la liste et les métriques', async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');

    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('.indicateurs')).toContainText('Utilisateurs');
    // Le trafic par route est alimenté par le compteur du backend
    await expect(page.getByRole('heading', { name: 'Trafic par route' })).toBeVisible();
  });

  test('la recherche filtre les comptes', async ({ page, request }) => {
    const marqueur = `Cherchable${Date.now()}`;
    const compte = await creerCompte(request, undefined, marqueur);
    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');

    await page.getByLabel('Rechercher').fill(marqueur);

    const lignes = page.locator('tbody tr');
    await expect(lignes).toHaveCount(1, { timeout: 15_000 });
    await expect(lignes.first()).toContainText(compte.email);
  });

  /**
   * GARDE-FOU : le serveur refuse qu'un admin se modifie lui-même. Le front
   * n'affiche donc aucune action sur sa propre ligne — proposer un bouton qui
   * mène à un refus est un piège, pas une fonctionnalité.
   */
  test('aucune action n est proposée sur sa propre ligne', async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(COMPTES.admin.email);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    const ligne = page.locator('tbody tr').first();
    await expect(ligne).toContainText('vous');
    await expect(ligne.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
    await expect(ligne.getByRole('button', { name: /Rétrograder|Promouvoir/ })).toHaveCount(0);
  });

  test('promeut puis rétrograde un utilisateur', async ({ page, request }) => {
    const marqueur = `Promu${Date.now()}`;
    const compte = await creerCompte(request, undefined, marqueur);
    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    // La recherche est débouncée : sans cette attente, on agirait sur la ligne
    // de l'utilisateur précédent, encore affichée.
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    const ligne = page.locator('tbody tr').first();
    await expect(ligne).toContainText('USER');

    await ligne.getByRole('button', { name: 'Promouvoir' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('ADMIN', { timeout: 15_000 });

    await page.locator('tbody tr').first().getByRole('button', { name: 'Rétrograder' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('USER', { timeout: 15_000 });
  });

  test('consulte les séances d un utilisateur', async ({ page, request }) => {
    const marqueur = `Coureur${Date.now()}`;
    const compte = await creerCompte(request, undefined, marqueur);
    await creerSeance(request, compte.token, { distanceKm: 12, dureeMinutes: 62, dateHeure: ilYA(3) });

    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    // Attendre le résultat filtré : cliquer trop tôt ouvrait les séances de
    // l'utilisateur affiché avant le filtre — le test passait sur la mauvaise ligne.
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('tbody tr').first()).toContainText(compte.email);

    await page.locator('tbody tr').first().getByRole('button', { name: 'Séances' }).click();

    const consultation = page.locator('.consultation');
    await expect(consultation).toBeVisible();
    await expect(consultation).toContainText('12');
  });

  test('supprime un utilisateur après confirmation', async ({ page, request }) => {
    const marqueur = `Supprime${Date.now()}`;
    const compte = await creerCompte(request, undefined, marqueur);
    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    // La suppression passe par un confirm() natif : sans ce gestionnaire,
    // Playwright l'annule par défaut et le test échouerait silencieusement.
    page.once('dialog', dialogue => dialogue.accept());
    await page.locator('tbody tr').first().getByRole('button', { name: 'Supprimer' }).click();

    await expect(page.getByText('Aucun utilisateur ne correspond.')).toBeVisible({ timeout: 15_000 });

    // Le compte ne doit plus pouvoir se connecter
    const reponse = await request.post('/api/auth/connexion', {
      data: { email: compte.email, motDePasse: compte.motDePasse }
    });
    expect(reponse.status()).toBe(401);
  });
});
