import { expect, test } from '@playwright/test';
import { creerCompte, creerSeance, ilYA, seConnecter } from './aide';

test.describe('Statistiques', () => {

  /**
   * Chaque test sème SES propres données : les statistiques sont des agrégats,
   * les assertions ne seraient pas déterministes sur un compte partagé dont le
   * contenu évolue au fil des autres tests.
   */
  test('agrège les séances de la période et se compare à la précédente', async ({ page, request }) => {
    const compte = await creerCompte(request);
    // Période courante : 10 + 8 = 18 km sur deux semaines distinctes
    await creerSeance(request, compte.token, { distanceKm: 10, dureeMinutes: 50, dateHeure: ilYA(3) });
    await creerSeance(request, compte.token, { distanceKm: 8, dureeMinutes: 40, dateHeure: ilYA(10) });
    // Période précédente (au-delà de 30 jours) : sert de base de comparaison
    await creerSeance(request, compte.token, { distanceKm: 6, dureeMinutes: 30, dateHeure: ilYA(40) });

    await seConnecter(page, compte);
    await page.goto('/statistiques');

    const indicateurs = page.locator('.indicateurs');
    await expect(indicateurs).toContainText('2');       // séances réalisées
    await expect(indicateurs).toContainText('18');      // distance cumulée
  });

  test('les raccourcis de période changent les dates', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await creerSeance(request, compte.token, { distanceKm: 5, dureeMinutes: 25, dateHeure: ilYA(2) });

    await seConnecter(page, compte);
    await page.goto('/statistiques');

    const debut = page.getByLabel('Du');
    const avant = await debut.inputValue();

    const raccourci7 = page.getByRole('button', { name: '7 jours' });
    await raccourci7.click();
    await expect(debut).not.toHaveValue(avant);

    /*
     * L'état sélectionné se lit sur `aria-pressed` et non plus sur une classe
     * CSS maison : p-selectbutton l'expose nativement, ce qui rend l'assertion
     * SÉMANTIQUE — un lecteur d'écran voit exactement ce que le test vérifie.
     */
    await expect(raccourci7).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * La courbe n'apparaît qu'à partir de DEUX points : une courbe à un seul
   * point n'apprend rien. On vérifie les deux cas.
   */
  test('la courbe apparaît dès deux semaines de données', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await creerSeance(request, compte.token, { distanceKm: 10, dureeMinutes: 50, dateHeure: ilYA(2) });

    await seConnecter(page, compte);
    await page.goto('/statistiques');
    await expect(page.locator('.graphique')).toHaveCount(0);

    // Une seconde semaine, et la courbe doit s'afficher
    await creerSeance(request, compte.token, { distanceKm: 12, dureeMinutes: 60, dateHeure: ilYA(9) });
    await page.reload();

    const graphique = page.locator('.graphique');
    await expect(graphique).toBeVisible();
    // L'échelle doit être annoncée : une courbe sans graduation n'est pas une donnée
    await expect(graphique).toContainText(/Échelle 0 →/);
  });

  test('affiche les records personnels', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await creerSeance(request, compte.token, { distanceKm: 21.1, dureeMinutes: 105, dateHeure: ilYA(5) });
    await creerSeance(request, compte.token, { distanceKm: 10, dureeMinutes: 40, dateHeure: ilYA(6) });

    await seConnecter(page, compte);
    await page.goto('/statistiques');

    const records = page.locator('.records');
    await expect(records).toContainText('21.1');        // plus longue sortie
    await expect(records).toContainText(`4'00"/km`);    // meilleure allure : 10 km en 40 min
  });

  test('une séance PLANIFIÉE n entre pas dans les statistiques', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await creerSeance(request, compte.token, { distanceKm: 10, dureeMinutes: 50, dateHeure: ilYA(2) });

    const futur = new Date();
    futur.setDate(futur.getDate() + 3);
    await creerSeance(request, compte.token, {
      distanceKm: 30, dureeMinutes: 180, dateHeure: `${futur.toISOString().slice(0, 10)}T09:00`
    });

    await seConnecter(page, compte);
    await page.goto('/statistiques');

    // 10 km et non 40 : le réalisé seulement
    await expect(page.locator('.indicateurs')).toContainText('10');
    await expect(page.locator('.indicateurs')).not.toContainText('40');
  });
});
