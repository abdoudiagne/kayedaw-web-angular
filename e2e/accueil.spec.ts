import { expect, test } from '@playwright/test';
import { COMPTES, seConnecter } from './aide';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PAGE D'ACCUEIL PUBLIQUE                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Ce qui mérite d'être testé n'est pas la présence de jolies phrases, mais que
 * les CHIFFRES affichés viennent des constantes qui font foi. Une page vitrine
 * qui annonce « 14 jours » quand le code en applique 30 est pire que muette :
 * elle ment, et personne ne pense à la relire en changeant une règle.
 */
test.describe('Accueil', () => {

  test('présente l application et mène aux deux portes d entrée', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Chaque foulée compte.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer un compte' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /déjà un compte/ })).toBeVisible();

    await page.getByRole('link', { name: 'Créer un compte' }).first().click();
    await expect(page).toHaveURL(/\/inscription/);
  });

  test('les chiffres annoncés sont ceux que le code applique', async ({ page }) => {
    await page.goto('/');

    const chiffres = page.locator('.chiffres');
    // Horizon de planification : HORIZON_PLANIFICATION_JOURS
    await expect(chiffres).toContainText('30');
    // Plafond hebdomadaire : PLAFOND_HEBDO_KM
    await expect(chiffres).toContainText('80');
    // Les cinq types de séance : TYPES_SEANCE
    await expect(chiffres).toContainText('5');

    // Le nombre de pays vient du référentiel servi par l'API, pas d'un littéral
    await expect(chiffres).toContainText(/\d{3}\s*pays|pays/);
    await expect(page.locator('.liste-types li')).toHaveCount(5);
  });

  test('les trois sources météo sont expliquées', async ({ page }) => {
    await page.goto('/');
    const sources = page.locator('.grille-sources .source');
    await expect(sources).toHaveCount(3);
    await expect(sources).toContainText([/Météo-France/, /Archive/, /Prévision/]);
  });

  /**
   * Un utilisateur déjà identifié n'a rien à faire sur une page de
   * présentation : `invitéGuard` le renvoie sur l'écran de son RÔLE.
   */
  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ L'accueil NE REDIRIGE PLUS un compte connecté — il s'adapte         │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * La page était gardée par `invitéGuard`. Mais « Accueil » figure en
   * permanence dans l'en-tête : un lien qui rebondit ailleurs annonce une
   * destination et en livre une autre. La page reste donc ouverte, et ce sont
   * ses appels à l'action qui changent — proposer « Créer un compte » à qui
   * en a déjà un ne veut rien dire.
   */
  test('un membre connecté voit la page, avec les actions de SON rôle',
    async ({ page }) => {
      await seConnecter(page);
      await page.goto('/');

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'Chaque foulée compte.' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Mes séances', exact: true }).last())
        .toBeVisible();
      await expect(page.getByRole('link', { name: 'Nouvelle séance' })).toBeVisible();
      // Les portes d'entrée d'un visiteur n'ont plus lieu d'être
      await expect(page.getByRole('link', { name: "J'ai déjà un compte" })).toHaveCount(0);
    });

  test('un administrateur connecté est renvoyé vers son propre écran',
    async ({ page }) => {
      await seConnecter(page, COMPTES.admin);
      await page.goto('/');

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('link', { name: 'Administrer les comptes' })).toBeVisible();
      // Un administrateur n'enregistre pas de séance : le second bouton saute
      await expect(page.getByRole('link', { name: 'Nouvelle séance' })).toHaveCount(0);
    });

  test('les deux liens publics restent dans l en-tête une fois connecté',
    async ({ page }) => {
      await seConnecter(page);
      const entete = page.locator('header');

      await expect(entete.getByRole('link', { name: 'Accueil', exact: true })).toBeVisible();
      await expect(entete.getByRole('link', { name: 'À propos', exact: true })).toBeVisible();
    });
});

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ « À PROPOS » — la carte d'identité technique                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Elle est SANS garde, contrairement à l'accueil : c'est la seule page
 * publique qui reste utile une fois connecté, et la navigation la garde donc
 * en permanence. Ce test le vérifie des deux côtés de la session — c'est la
 * différence de traitement entre les deux pages qui mérite d'être protégée,
 * pas la présence de paragraphes.
 */
test.describe('À propos', () => {

  test('est accessible depuis l en-tête, sans compte', async ({ page }) => {
    await page.goto('/');

    // Navigation de contenu à GAUCHE : Accueil et À propos
    await page.getByRole('link', { name: 'À propos', exact: true }).click();

    await expect(page).toHaveURL(/\/a-propos$/);
    await expect(page.getByRole('heading', { name: 'À propos de KayeDaw' })).toBeVisible();
    // Les deux moitiés du projet, chacune avec son dépôt
    await expect(page.getByRole('heading', { name: 'Frontend' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backend' })).toBeVisible();
  });

  test('reste accessible une fois connecté', async ({ page }) => {
    await seConnecter(page);

    await page.getByRole('link', { name: 'À propos', exact: true }).click();
    await expect(page).toHaveURL(/\/a-propos$/);
    await expect(page.getByRole('heading', { name: 'À propos de KayeDaw' })).toBeVisible();
  });

  /**
   * Même exigence que sur l'accueil : les chiffres viennent des constantes.
   * Les recopier ferait de cette page une documentation périmée dès la
   * première évolution de règle.
   */
  test('affiche les chiffres réels des règles métier', async ({ page }) => {
    await page.goto('/a-propos');

    const reperes = page.locator('.reperes');
    await expect(reperes).toContainText('30');       // horizon de planification
    await expect(reperes).toContainText('80');       // plafond hebdomadaire
    await expect(reperes).toContainText('5');        // types de séance
    // Le référentiel arrive par l'API : il n'est pas écrit dans la page
    await expect(reperes).toContainText(/2\d\d/, { timeout: 15_000 });
  });
});
