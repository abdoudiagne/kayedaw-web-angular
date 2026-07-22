import { expect, test } from '@playwright/test';
import { choisirPays, emailUnique } from './aide';

test.describe('Inscription', () => {

  /**
   * L'inscription N'OUVRE PAS de session : elle renvoie vers la connexion,
   * avec un message de confirmation. Saisir soi-même les identifiants qu'on
   * vient de choisir les ancre et vérifie tout de suite qu'ils fonctionnent.
   */
  test('crée un compte, renvoie vers la connexion et le dit', async ({ page }) => {
    const email = emailUnique();
    const motDePasse = 'coureur-du-59';
    await page.goto('/inscription');

    await page.getByLabel('Nom').fill('Coureur E2E');
    await page.getByLabel('Ville habituelle').fill('Lille');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
    await page.getByLabel('Confirmer le mot de passe').fill(motDePasse);
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page).toHaveURL(/\/connexion/);
    // Le toast est monté dans la coquille, hors du router-outlet : il survit
    // à la navigation et s'affiche bien SUR l'écran de connexion.
    await expect(page.getByText('Compte créé. Connectez-vous pour commencer.')).toBeVisible();

    // Aucune session n'a été ouverte : l'écran de connexion est bien présenté,
    // et non court-circuité par une redirection d'utilisateur déjà identifié.
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

    // Et le compte fonctionne réellement
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(motDePasse);
    await page.getByRole('button', { name: 'Se connecter' }).click();
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

    // Sélecteur ciblé : voir la note de connexion.spec.ts — la pile de
    // notifications occupe en permanence une région role="alert" vide.
    await expect(page.locator('.erreur.globale')).toContainText(/existe déjà/);
  });


  test('un nom trop long est refusé avec sa raison', async ({ page, request }) => {
    // Le front ne borne pas la longueur du nom : c'est le serveur qui tranche,
    // et son motif doit remonter à l'écran.
    const reponse = await request.post('/api/auth/inscription', {
      data: {
        email: emailUnique(), motDePasse: 'coureur-du-59',
        nom: 'N'.repeat(300), villeParDefaut: 'Lille'
      }
    });
    // 400 et non 500 : une saisie trop longue n'est pas une panne serveur
    expect(reponse.status()).toBe(400);
    expect((await reponse.json()).message).toContain('100 caractères');
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ UNE PETITE COMMUNE DOIT SE TROUVER DÈS LES PREMIÈRES LETTRES        │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Signalé en usage réel : pays « Sénégal », saisie « bambi », aucune
   * suggestion — alors que Bambilor est bien une commune sénégalaise, connue
   * du géocodeur.
   *
   * En cause, la profondeur de recherche : Open-Meteo classe MONDIALEMENT
   * avant de tronquer, puis applique le filtre de pays. Bambilor était évincée
   * par ses homonymes plus peuplés d'Angola, de Tanzanie et de Centrafrique
   * bien avant que le Sénégal n'entre en jeu. Mesuré : 0 résultat sénégalais à
   * count=20 comme à count=50, et Bambilor à count=100.
   *
   * Ce test vise une commune MODESTE à dessein : une capitale sort en tête
   * quelle que soit la profondeur et ne prouverait rien.
   */
  test('une petite commune étrangère apparaît dès les premières lettres',
    async ({ page }) => {
      await page.goto('/inscription');
      await choisirPays(page, 'pays', 'Sénégal');

      await page.getByLabel('Ville habituelle').pressSequentially('bambi', { delay: 60 });

      await expect(page.getByRole('option', { name: 'Bambilor' }))
        .toBeVisible({ timeout: 15_000 });
    });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ CHAQUE SUGGESTION DOIT ÊTRE SITUABLE                                │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Le filtre par pays est correct — vérifié : aucune suggestion étrangère ne
   * passe. Mais la liste n'affichait que des noms NUS hors de France, le
   * repère venant du code postal français. « Banba », « Mbamb » : rien ne les
   * rattachait au pays choisi, et cela se lisait comme du bruit venu
   * d'ailleurs. La région administrative comble ce vide.
   *
   * Un utilisateur ne devrait pas avoir à croire un filtre sur parole.
   */
  test('chaque suggestion porte son repère géographique', async ({ page }) => {
    await page.goto('/inscription');
    await choisirPays(page, 'pays', 'Sénégal');

    await page.getByLabel('Ville habituelle').pressSequentially('bamb', { delay: 60 });

    // Région sénégalaise affichée à côté du nom, et non un champ vide
    await expect(page.getByRole('option', { name: /Banba.*Tambacounda/ }))
      .toBeVisible({ timeout: 15_000 });
  });
});
