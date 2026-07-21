import { expect, test } from '@playwright/test';
import { emailUnique } from './aide';

test.describe('Inscription', () => {

  test('crée un compte et connecte directement', async ({ page }) => {
    const email = emailUnique();
    await page.goto('/inscription');

    await page.getByLabel('Nom').fill('Coureur E2E');
    await page.getByLabel('Ville habituelle').fill('Lille');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('coureur-du-59');
    await page.getByLabel('Confirmer le mot de passe').fill('coureur-du-59');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page).toHaveURL(/\/seances/);
  });

  test('le bouton reste désactivé tant qu un champ obligatoire manque', async ({ page }) => {
    await page.goto('/inscription');
    const bouton = page.getByRole('button', { name: 'Créer mon compte' });
    await expect(bouton).toBeDisabled();

    // On remplit tout SAUF la confirmation : le bouton doit rester bloqué
    await page.getByLabel('Nom').fill('Coureur E2E');
    await page.getByLabel('Ville habituelle').fill('Lille');
    await page.getByLabel('Email').fill('nouveau@exemple.fr');
    await page.getByLabel('Mot de passe', { exact: true }).fill('coureur-du-59');
    await expect(bouton).toBeDisabled();

    // Confirmation concordante : le formulaire devient valide
    await page.getByLabel('Confirmer le mot de passe').fill('coureur-du-59');
    await expect(bouton).toBeEnabled();
  });

  test('refuse un mot de passe trop courant', async ({ page }) => {
    await page.goto('/inscription');
    const champ = page.getByLabel('Mot de passe', { exact: true });
    await champ.fill('motdepasse');
    await champ.blur();

    await expect(page.getByText(/trop courant/)).toBeVisible();
  });

  test('signale des mots de passe différents', async ({ page }) => {
    await page.goto('/inscription');
    await page.getByLabel('Mot de passe', { exact: true }).fill('coureur-du-59');
    const confirmation = page.getByLabel('Confirmer le mot de passe');
    await confirmation.fill('coureur-du-62');
    await confirmation.blur();

    await expect(page.getByText(/ne correspondent pas/)).toBeVisible();
  });

  test('l autocomplétion propose des villes et se pilote au clavier', async ({ page }) => {
    await page.goto('/inscription');
    const ville = page.getByLabel('Ville habituelle');
    await ville.fill('bord');

    const liste = page.getByRole('listbox');
    await expect(liste).toBeVisible();
    await expect(liste.getByRole('option').first()).toContainText(/Bord/i);

    // Flèche puis Entrée : le formulaire ne doit PAS être soumis
    await ville.press('ArrowDown');
    await ville.press('Enter');

    await expect(page).toHaveURL(/\/inscription/);
    await expect(ville).not.toHaveValue('bord');
  });

  test('refuse un email déjà utilisé', async ({ page }) => {
    await page.goto('/inscription');
    await page.getByLabel('Nom').fill('Doublon');
    await page.getByLabel('Ville habituelle').fill('Lille');
    await page.getByLabel('Email').fill('user@kayedaw.fr');
    await page.getByLabel('Mot de passe', { exact: true }).fill('coureur-du-59');
    await page.getByLabel('Confirmer le mot de passe').fill('coureur-du-59');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByRole('alert')).toContainText(/existe déjà/);
  });
});
