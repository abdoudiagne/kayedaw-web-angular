import { expect, test } from '@playwright/test';
import { COMPTES } from './aide';

test.describe('Connexion', () => {

  /**
   * La racine ne mène PLUS à la connexion : elle présente l'application. Un
   * visiteur devait auparavant saisir des identifiants avant même de savoir ce
   * que fait le produit.
   */
  test('la racine présente l application, sans demander de se connecter',
    async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'Chaque foulée compte.' })).toBeVisible();
      // Aucun champ de connexion : c'est une page de présentation
      await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveCount(0);
      // Mais les deux portes d'entrée y sont
      await expect(page.getByRole('link', { name: 'Créer un compte' }).first()).toBeVisible();
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

    // On vise le message DU FORMULAIRE, pas « une alerte quelque part » :
    // la pile de notifications occupe en permanence une région role="alert"
    // vide — c'est le motif ARIA correct, une région live doit préexister au
    // contenu qu'on y insère — donc le rôle seul est ambigu.
    const message = page.locator('.erreur.globale');
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
     * ⚠️ RÉGRESSION D'ACCESSIBILITÉ ASSUMÉE, introduite par p-password.
     *
     * Le révélateur écrit à la main était un <button> portant un nom
     * accessible en sr-only : atteignable au clavier, trouvable au pilotage
     * vocal, testable par getByRole. PrimeNG rend une simple ICÔNE
     * (.p-password-toggle-mask-icon), sans rôle ni nom, et hors de l'ordre de
     * tabulation. Le test cible donc une classe interne — ce qu'on évite
     * normalement — parce qu'il n'existe plus rien de sémantique à viser.
     */
    const bascule = page.locator('.p-password-toggle-mask-icon');
    await expect(bascule).toBeVisible();
    await bascule.click();

    await expect(champ).toHaveAttribute('type', 'text');
    // On doit toujours être sur la page : un bouton sans type aurait soumis
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('un administrateur atterrit sur son écran, pas sur le carnet',
    async ({ page }) => {
      await page.goto('/connexion');
      await page.getByLabel('Email').fill(COMPTES.admin.email);
      await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES.admin.motDePasse);
      await page.getByRole('button', { name: 'Se connecter' }).click();

      await expect(page).toHaveURL(/\/administration/);
    });

  /**
   * Le paramètre `redirige` PRIME sur l'écran d'accueil du rôle : y ramener
   * l'utilisateur est tout l'objet du garde qui l'a posé.
   */
  test('le paramètre redirige l emporte sur l écran par défaut', async ({ page }) => {
    await page.goto('/statistiques');            // le garde renvoie vers /connexion
    await expect(page).toHaveURL(/redirige/);

    await page.getByLabel('Email').fill(COMPTES.utilisateur.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(COMPTES.utilisateur.motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/statistiques/);
  });
});
