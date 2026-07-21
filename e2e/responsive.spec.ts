import { expect, Page, test } from '@playwright/test';
import { COMPTES, seConnecter } from './aide';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CE QU'ON VÉRIFIE VRAIMENT                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le vrai défaut du responsive n'est pas visuel, il est MESURABLE : un
 * débordement horizontal. Dès qu'un élément dépasse la largeur du viewport,
 * la page défile latéralement et devient pénible sur mobile.
 *
 * On compare donc scrollWidth au clientWidth du document — un test objectif,
 * qui n'exige pas de juger d'une esthétique.
 */
async function verifierAucunDebordement(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');

  const debordement = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });

  // 1 px de tolérance : les arrondis sub-pixel ne sont pas un défaut
  expect(debordement.scroll,
    `${url} déborde de ${debordement.scroll - debordement.client}px`)
    .toBeLessThanOrEqual(debordement.client + 1);
}

test.describe('Responsive @mobile', () => {

  const ecrans = ['/seances', '/seances/nouvelle', '/statistiques', '/profil'];

  test('aucun écran ne déborde horizontalement', async ({ page }) => {
    await seConnecter(page);
    for (const url of ecrans) {
      await verifierAucunDebordement(page, url);
    }
  });

  test('les écrans publics ne débordent pas non plus', async ({ page }) => {
    for (const url of ['/connexion', '/inscription']) {
      await verifierAucunDebordement(page, url);
    }
  });

  test('l espace d administration tient sur mobile', async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await verifierAucunDebordement(page, '/administration');
  });

  test('la navigation reste atteignable', async ({ page }) => {
    await seConnecter(page);
    // Déconnexion et profil doivent rester cliquables, quelle que soit la largeur
    await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Mon profil/ })).toBeVisible();
  });
});
