import { expect, test } from '@playwright/test';
import { choisirDansSelect, choisirPays, creerCompte, saisirNombre, saisirNombreDans,
  seConnecter } from './aide';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PRÉFÉRENCES UTILISATEUR                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * La valeur de cette fonctionnalité est dans la LIAISON entre deux écrans :
 * on règle dans /profil, on en profite dans /seances/nouvelle. Aucun test
 * unitaire ne peut le prouver — il faut les deux écrans et la vraie API.
 *
 * Chaque test ouvre SON compte : les préférences sont des données de compte,
 * les partager rendrait les tests dépendants de leur ordre d'exécution.
 */
test.describe('Préférences', () => {

  /** La ligne d'un type dans la grille, repérée par son libellé. */
  const champsDuType = (page: import('@playwright/test').Page, libelle: string) => ({
    distance: page.getByLabel(`Distance par défaut, ${libelle}`),
    duree: page.getByLabel(`Durée par défaut, ${libelle}`)
  });

  test('le pays vaut France par défaut et se modifie', async ({ page, request }) => {
    await seConnecter(page, await creerCompte(request));
    await page.goto('/profil');

    // Défaut posé par le SERVEUR à l'inscription, pas par l'écran
    const champPays = page.locator('#pays');
    await expect(champPays).toContainText('France', { timeout: 15_000 });

    // Liste fermée de 249 entrées, filtrable : on ne saisit plus librement
    await choisirPays(page, 'pays', 'Belgique');

    /*
     * ⚠️ Changer de pays VIDE la ville, sur cet écran comme sur tous les
     * autres : une ville appartient à son pays, et « Lille » conservé après un
     * passage en Belgique désignerait un lieu que le géocodeur n'y trouve pas.
     * La ville étant obligatoire, il faut donc en choisir une nouvelle — c'est
     * la règle, pas un contournement du test.
     */
    await expect(page.getByLabel('Ville de référence')).toHaveValue('');

    await page.getByLabel('Ville de référence').fill('Bruxelles');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Profil mis à jour.')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.locator('#pays')).toContainText('Belgique', { timeout: 15_000 });
    await expect(page.getByLabel('Ville de référence')).toHaveValue('Bruxelles');
  });

  /**
   * « Annuler » rétablit les valeurs du SERVEUR, pas un formulaire vide : on
   * annule ses modifications, on n'efface pas son identité. Il n'apparaît que
   * si quelque chose a changé — un bouton qui ne fait rien apprend au lecteur
   * à ignorer les boutons.
   */
  test('le bouton Annuler rétablit les valeurs enregistrées', async ({ page, request }) => {
    await seConnecter(page, await creerCompte(request));
    await page.goto('/profil');

    const nom = page.getByLabel('Nom');
    await expect(nom).not.toHaveValue('', { timeout: 15_000 });
    const initial = await nom.inputValue();

    // Formulaire intact : rien à annuler, donc pas de bouton
    await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(0);

    await nom.fill('Nom provisoire');
    await page.getByRole('button', { name: 'Annuler' }).click();

    await expect(nom).toHaveValue(initial);
    await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
  });

  test('un compte neuf voit les cinq types pré-remplis par le serveur',
    async ({ page, request }) => {
      await seConnecter(page, await creerCompte(request));
      await page.goto('/profil');

      // Même repère pour les cinq types : 5 km en 60 min, soit 12 min/km —
      // une allure plausible partout, donc jamais d'erreur à l'ouverture.
      for (const type of ['Endurance', 'Fractionné', 'Sortie longue',
                          'Récupération', 'Marche à pied']) {
        await expect(champsDuType(page, type).distance).toHaveValue('5', { timeout: 15_000 });
        await expect(champsDuType(page, type).duree).toHaveValue('60');
      }
    });

  test('les valeurs enregistrées pré-remplissent le formulaire de séance',
    async ({ page, request }) => {
      await seConnecter(page, await creerCompte(request));
      await page.goto('/profil');

      const endurance = champsDuType(page, 'Endurance');
      await expect(endurance.distance).toHaveValue('5', { timeout: 15_000 });
      // p-inputnumber intercepte la frappe : fill() se fait réécrire par le
      // composant, la durée restait à 60. Voir saisirNombreDans().
      await saisirNombreDans(endurance.distance, '13.5');
      await saisirNombreDans(endurance.duree, 75);
      // ⚠️ Assertion sur le CONTENU EXACT de la zone d'état, pas un
      // getByText('Enregistré') : celui-ci fait une correspondance par
      // sous-chaîne insensible à la casse et matchait déjà le message au
      // repos (« …est enregistrée automatiquement »). Le test passait donc
      // sans qu'aucun enregistrement n'ait eu lieu.
      await expect(page.locator('.etat-auto')).toHaveText('✓ Enregistré', { timeout: 15_000 });

      await page.goto('/seances/nouvelle');
      // Le type par défaut du formulaire est ENDURANCE
      // p-inputnumber formate selon la locale : 13.5 peut s'écrire « 13,5 »
      await expect(page.locator('#distanceKm')).toHaveValue(/13[.,]5/, { timeout: 15_000 });
      await expect(page.locator('#dureeMinutes')).toHaveValue('75');
    });

  /**
   * Les valeurs d'usine étant IDENTIQUES pour tous les types, ce test doit
   * d'abord en personnaliser une — sinon changer de type ne produirait aucun
   * effet observable et le test passerait sans rien prouver.
   */
  test('changer de type applique les valeurs de ce type', async ({ page, request }) => {
    await seConnecter(page, await creerCompte(request));
    await page.goto('/profil');
    const sortieLongue = champsDuType(page, 'Sortie longue');
    await expect(sortieLongue.distance).toHaveValue('5', { timeout: 15_000 });
    await saisirNombreDans(sortieLongue.distance, 18);
    await saisirNombreDans(sortieLongue.duree, 105);
    await expect(page.locator('.etat-auto')).toHaveText('✓ Enregistré', { timeout: 15_000 });

    await page.goto('/seances/nouvelle');
    await expect(page.locator('#distanceKm')).toHaveValue('5', { timeout: 15_000 });

    await choisirDansSelect(page, 'type', 'Sortie longue');
    await expect(page.locator('#distanceKm')).toHaveValue('18');
    await expect(page.locator('#dureeMinutes')).toHaveValue('105');
  });

  /**
   * NON-RÉGRESSION la plus importante du lot : un raccourci qui efface une
   * saisie devient un piège. Le pré-remplissage ne vaut que pour un champ
   * jamais touché.
   */
  test('une valeur saisie à la main survit à un changement de type',
    async ({ page, request }) => {
      await seConnecter(page, await creerCompte(request));
      await page.goto('/seances/nouvelle');
      await expect(page.locator('#distanceKm')).toHaveValue('5', { timeout: 15_000 });

      await saisirNombre(page, 'distanceKm', 42);
      await choisirDansSelect(page, 'type', 'Récupération');

      // La distance saisie reste ; la durée, jamais touchée, suit le type
      await expect(page.locator('#distanceKm')).toHaveValue('42');
      await expect(page.locator('#dureeMinutes')).toHaveValue('60');
    });

  test('le thème choisi s applique et survit à un rechargement',
    async ({ page, request }) => {
      await seConnecter(page, await creerCompte(request));
      await page.goto('/profil');
      await expect(champsDuType(page, 'Endurance').distance)
        .toHaveValue('5', { timeout: 15_000 });

      const racine = page.locator('html');
      /*
       * « Automatique » RÉSOUT la préférence système en valeur concrète au lieu
       * de ne rien écrire : le darkModeSelector de PrimeNG est un sélecteur CSS
       * et ne sait pas observer prefers-color-scheme. Sans cette résolution,
       * les champs PrimeNG restaient blancs sur une page sombre.
       */
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(racine).toHaveAttribute('data-theme', 'clair');

      // Le thème est une VIGNETTE cliquable, pas une liste déroulante :
      // on doit voir ce qu'on choisit avant de choisir.
      // On clique la VIGNETTE, comme un utilisateur : le bouton radio lui-même
      // est en sr-only, c'est le label qui porte la cible visible.
      await page.locator('label.choix-theme').filter({ hasText: 'Sombre' }).click();
      // Appliqué AVANT l'enregistrement : un aperçu qui attend le réseau n'en
      // est pas un.
      await expect(racine).toHaveAttribute('data-theme', 'sombre');
      await expect(page.locator('.etat-auto')).toHaveText('✓ Enregistré', { timeout: 15_000 });

      await page.reload();
      await expect(racine).toHaveAttribute('data-theme', 'sombre');
    });
});
