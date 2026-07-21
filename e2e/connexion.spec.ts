import { expect, test } from '@playwright/test';
import { COMPTES } from './aide';

test.describe('Connexion', () => {

  test('la racine mène à la connexion quand on n est pas identifié', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  });

  test('un compte valide accède au carnet', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Email').fill(COMPTES.utilisateur.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES.utilisateur.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/seances/);

    /*
     * On vérifie l'EMAIL, pas le nom affiché : le nom est modifiable depuis la
     * page profil, un test qui s'y accroche casse dès qu'on le change — ce qui
     * s'est produit ici, le compte de démo ayant été renommé.
     */
    await page.getByRole('link', { name: /Mon profil/ }).click();
    await expect(page).toHaveURL(/\/profil/);
    await expect(page.getByText(COMPTES.utilisateur.email)).toBeVisible();
  });

  /**
   * NON-RÉGRESSION : la connexion était sensible à la casse. Un compte créé
   * avec « Abdou@Gmail.com » était stocké en minuscules et son propriétaire ne
   * pouvait plus jamais se connecter en tapant son adresse telle qu'il l'écrit.
   */
  test('accepte l email quelle que soit la casse', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Email').fill(COMPTES.utilisateur.email.toUpperCase());
    await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES.utilisateur.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/seances/);
  });

  test('un mot de passe faux ne révèle pas si le compte existe', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Email').fill(COMPTES.utilisateur.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    const message = page.getByRole('alert');
    await expect(message).toBeVisible();
    // Le message ne doit distinguer ni l'email ni le mot de passe
    await expect(message).toHaveText(/Email ou mot de passe incorrect/);
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('signale un domaine d email incomplet', async ({ page }) => {
    await page.goto('/connexion');
    const email = page.getByLabel('Email');
    await email.fill('abdou@gmail');       // passait Validators.email d'Angular
    await email.blur();

    await expect(page.getByText(/il manque le domaine/)).toBeVisible();
  });

  test('le bouton est désactivé tant que le formulaire est invalide', async ({ page }) => {
    await page.goto('/connexion');
    const bouton = page.getByRole('button', { name: 'Se connecter' });

    // Formulaire vide : rien à soumettre
    await expect(bouton).toBeDisabled();

    // Email seul renseigné : le mot de passe manque encore
    await page.getByLabel('Email').fill('user@kayedaw.fr');
    await expect(bouton).toBeDisabled();

    // Les deux champs valides : le bouton s'active
    await page.getByLabel('Mot de passe', { exact: true }).fill('12345');
    await expect(bouton).toBeEnabled();
  });

  test('le révélateur affiche le mot de passe sans soumettre le formulaire', async ({ page }) => {
    await page.goto('/connexion');
    const champ = page.getByLabel('Mot de passe', { exact: true });
    await champ.fill('secret123');
    await expect(champ).toHaveAttribute('type', 'password');

    /*
     * L'icône est un SVG décoratif (aria-hidden) : le nom accessible vient du
     * texte en sr-only. On le cible donc par son RÔLE et son nom, pas par du
     * texte visible — c'est aussi ce qui garantit qu'un lecteur d'écran et un
     * pilotage vocal trouvent le bouton.
     */
    const bascule = page.getByRole('button', { name: 'Afficher le mot de passe' });
    await expect(bascule.locator('svg')).toBeVisible();
    await bascule.click();

    await expect(champ).toHaveAttribute('type', 'text');
    // Le nom accessible s'inverse une fois le mot de passe révélé
    await expect(page.getByRole('button', { name: 'Masquer le mot de passe' })).toBeVisible();
    // On doit toujours être sur la page : un bouton sans type aurait soumis
    await expect(page).toHaveURL(/\/connexion/);
  });
});
