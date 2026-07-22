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
    // Le rôle est affiché TRADUIT : « USER » est une constante de sécurité,
    // pas un mot d'interface (LIBELLES_ROLE dans core/models/auth.model.ts).
    await expect(ligne).toContainText('Membre');

    await ligne.getByRole('button', { name: 'Promouvoir' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('Administrateur', { timeout: 15_000 });

    await page.locator('tbody tr').first().getByRole('button', { name: 'Rétrograder' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('Membre', { timeout: 15_000 });
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

    // La suppression passe par p-confirmdialog, plus par confirm() natif :
    // il est dans le DOM, et son bouton porte le VERBE de l'action.
    await page.locator('tbody tr').first().getByRole('button', { name: 'Supprimer' }).click();

    /*
     * `alertdialog` et non `dialog` : PrimeNG donne ce rôle à sa boîte de
     * confirmation, ce qui est le bon choix — une confirmation INTERROMPT.
     * `.last()` car l'hôte <p-dialog> et la boîte rendue portent tous deux le
     * rôle ; c'est la seconde qui contient le message et les boutons.
     */
    const boite = page.getByRole('alertdialog').last();
    await expect(boite).toBeVisible();
    // Le compte visé est nommé : c'est ce qui distingue cette confirmation
    // d'un « OK » générique cliqué par réflexe.
    await expect(boite).toContainText(compte.email);
    await boite.getByRole('button', { name: 'Supprimer le compte' }).click();

    await expect(page.getByText('Aucun utilisateur ne correspond.')).toBeVisible({ timeout: 15_000 });

    // Le compte ne doit plus pouvoir se connecter
    const reponse = await request.post('/api/auth/connexion', {
      data: { email: compte.email, motDePasse: compte.motDePasse }
    });
    expect(reponse.status()).toBe(401);
  });

  /**
   * SUPPRESSION EN MASSE. Le parcours qui compte n'est pas « deux cases
   * cochées, deux comptes partis » mais la garantie que la case d'en-tête
   * n'emporte PAS son propre compte : le serveur le refuserait, et l'annoncer
   * comme sélectionné serait un mensonge à l'écran.
   */
  test('supprime plusieurs comptes en une fois, sans jamais inclure le sien',
    async ({ page, request }) => {
      const marqueur = `Lot${Date.now()}`;
      const a = await creerCompte(request, undefined, `${marqueur}A`);
      const b = await creerCompte(request, undefined, `${marqueur}B`);

      await seConnecter(page, COMPTES.admin);
      await page.goto('/administration');
      await page.getByLabel('Rechercher').fill(marqueur);
      await expect(page.locator('tbody tr')).toHaveCount(2, { timeout: 15_000 });

      // La case d'en-tête coche les lignes sélectionnables de la page filtrée
      await page.getByLabel('Tout sélectionner').click();
      await expect(page.getByText('2 compte(s) sélectionné(s)')).toBeVisible();

      await page.getByRole('button', { name: 'Supprimer la sélection' }).click();
      const boite = page.getByRole('alertdialog').last();
      await expect(boite).toBeVisible();
      // Les emails sont énumérés : c'est ce qui permet de vérifier la sélection
      await expect(boite).toContainText(a.email);
      await expect(boite).toContainText(b.email);
      await boite.getByRole('button', { name: 'Supprimer la sélection' }).click();

      await expect(page.getByText('Aucun utilisateur ne correspond.')).toBeVisible({ timeout: 15_000 });

      // Les deux comptes ne doivent plus pouvoir se connecter
      for (const compte of [a, b]) {
        const reponse = await request.post('/api/auth/connexion', {
          data: { email: compte.email, motDePasse: compte.motDePasse }
        });
        expect(reponse.status(), `${compte.email} supprimé`).toBe(401);
      }
    });

  test('son propre compte n offre aucune case de sélection', async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(COMPTES.admin.email);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    // Ni case sur la ligne, ni barre d'action après un « tout sélectionner »
    await expect(page.locator('tbody tr').first().locator('p-tablecheckbox')).toHaveCount(0);
    await page.getByLabel('Tout sélectionner').click();
    await expect(page.getByText(/compte\(s\) sélectionné\(s\)/)).toHaveCount(0);
  });

  /**
   * TRI DES COLONNES. Ce qui mérite un test n'est pas « les lignes changent
   * d'ordre » mais que le tri soit fait par le SERVEUR : la table est en mode
   * lazy et n'a qu'une page en mémoire, un tri local classerait dix lignes sur
   * quarante et donnerait un ordre faux dès la deuxième page.
   *
   * On le prouve en observant la requête réellement émise.
   */
  test('le tri des colonnes part au serveur et revient à la première page',
    async ({ page }) => {
      const marqueur = `Tri${Date.now()}`;
      await seConnecter(page, COMPTES.admin);
      await page.goto('/administration');
      await page.getByLabel('Rechercher').fill(marqueur.slice(0, 3));

      // On capture le paramètre `sort` de la prochaine requête déclenchée par
      // le clic sur l'en-tête : c'est la preuve que le tri n'est pas local.
      const requete = page.waitForRequest(r =>
        r.url().includes('/api/admin/utilisateurs') && r.url().includes('sort=email'));
      await page.getByRole('columnheader', { name: /Email/ }).click();
      const url = new URL((await requete).url());

      expect(url.searchParams.get('sort')).toBe('email,asc');
      // Trier depuis une page > 1 renverrait une tranche arbitraire du nouvel
      // ordre : le critère doit toujours repartir de la première page.
      expect(url.searchParams.get('page')).toBe('0');

      // Second clic : le sens s'inverse
      const requeteDesc = page.waitForRequest(r =>
        r.url().includes('sort=email%2Cdesc') || r.url().includes('sort=email,desc'));
      await page.getByRole('columnheader', { name: /Email/ }).click();
      expect(new URL((await requeteDesc).url()).searchParams.get('sort')).toBe('email,desc');
    });

  test('le tri par nom ordonne réellement les lignes', async ({ page, request }) => {
    const marqueur = `Ord${Date.now()}`;
    // Créés dans le DÉSORDRE : si le tri ne faisait rien, l'ordre d'insertion
    // passerait pour un tri réussi.
    for (const suffixe of ['C', 'A', 'B']) {
      await creerCompte(request, undefined, `${marqueur}${suffixe}`);
    }

    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    await expect(page.locator('tbody tr')).toHaveCount(3, { timeout: 15_000 });

    const noms = async () =>
      (await page.locator('tbody tr td:nth-child(2)').allTextContents()).map(t => t.trim());

    // La table s'ouvre déjà triée sur « Nom » croissant : c'est l'état par
    // défaut du flux (tri$ = 'nom,asc'), pas un effet du clic.
    await expect.poll(noms).toEqual([`${marqueur}A`, `${marqueur}B`, `${marqueur}C`]);

    // Cliquer la colonne DÉJÀ triée inverse le sens — comportement de p-table
    await page.getByRole('columnheader', { name: /Nom/ }).click();
    await expect.poll(noms).toEqual([`${marqueur}C`, `${marqueur}B`, `${marqueur}A`]);

    await page.getByRole('columnheader', { name: /Nom/ }).click();
    await expect.poll(noms).toEqual([`${marqueur}A`, `${marqueur}B`, `${marqueur}C`]);
  });

  /**
   * BLOCAGE. Ce qui compte n'est pas la pastille « Bloqué » mais le fait que
   * le compte ne puisse PLUS se connecter — vérifié par l'API, pas à l'écran.
   */
  test('bloque un compte, qui ne peut alors plus se connecter', async ({ page, request }) => {
    const marqueur = `Bloc${Date.now()}`;
    const compte = await creerCompte(request, undefined, marqueur);

    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    const ligne = page.locator('tbody tr').first();
    await expect(ligne).toContainText('Actif');

    // Les actions sont des ICÔNES : leur nom accessible reste le verbe
    await ligne.getByRole('button', { name: 'Bloquer' }).click();
    await page.getByRole('alertdialog').last().getByRole('button', { name: 'Bloquer' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('Bloqué', { timeout: 15_000 });

    // 403 et non 401 : l'identité est bonne, c'est l'accès qui est suspendu
    const refus = await request.post('/api/auth/connexion', {
      data: { email: compte.email, motDePasse: compte.motDePasse }
    });
    expect(refus.status()).toBe(403);

    // Le déblocage ne demande PAS de confirmation : rendre l'accès ne casse rien
    await page.locator('tbody tr').first().getByRole('button', { name: 'Débloquer' }).click();
    await expect(page.locator('tbody tr').first()).toContainText('Actif', { timeout: 15_000 });
    const reprise = await request.post('/api/auth/connexion', {
      data: { email: compte.email, motDePasse: compte.motDePasse }
    });
    expect(reprise.status()).toBe(200);
  });

  /**
   * NON-RÉGRESSION : le dialogue s'ouvrait sur une ville VIDE, la liste ne
   * transportant pas le champ. L'administrateur devait la ressaisir de
   * mémoire — ou l'écrasait sans s'en apercevoir en n'y touchant pas.
   */
  test('l édition ouvre sur les valeurs réelles du compte', async ({ page, request }) => {
    const marqueur = `Pre${Date.now()}`;
    // creerCompte pose « Lille » comme ville de référence
    await creerCompte(request, undefined, marqueur);

    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    await page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }).click();
    await expect(page.getByLabel('Nom')).toHaveValue(marqueur);
    await expect(page.getByLabel('Ville de référence')).toHaveValue('Lille');
    // Le pays n'est pas envoyé à l'inscription : « France » est le défaut,
    // posé côté serveur et non par un pré-remplissage d'écran.
    await expect(page.locator('#edition-pays')).toContainText('France');
  });

  test('modifie un compte sans toucher à la ville, qui est conservée',
    async ({ page, request }) => {
      const marqueur = `Edit${Date.now()}`;
      const compte = await creerCompte(request, undefined, marqueur);

      await seConnecter(page, COMPTES.admin);
      await page.goto('/administration');
      await page.getByLabel('Rechercher').fill(marqueur);
      await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

      await page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }).click();
      // On ne modifie QUE le nom : la ville doit survivre à l'enregistrement
      await page.getByLabel('Nom').fill(`${marqueur}Renomme`);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByText('Compte modifié.')).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Rechercher').fill(`${marqueur}Renomme`);
      await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
      await page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }).click();
      await expect(page.getByLabel('Ville de référence')).toHaveValue('Lille');

      // Le compte reste connectable : l'édition n'a pas touché aux identifiants
      const connexion = await request.post('/api/auth/connexion', {
        data: { email: compte.email, motDePasse: compte.motDePasse }
      });
      expect(connexion.status()).toBe(200);
    });

  /**
   * CHANGEMENT DE MOT DE PASSE PAR L'ADMINISTRATEUR.
   *
   * On ne se contente pas du message de succès : on vérifie par l'API que
   * l'ancien mot de passe ne vaut PLUS et que le nouveau ouvre bien la
   * session. C'est la seule preuve que le hachage a réellement été remplacé.
   */
  test('réinitialise le mot de passe : l ancien ne vaut plus, le nouveau ouvre',
    async ({ page, request }) => {
      const marqueur = `Mdp${Date.now()}`;
      const compte = await creerCompte(request, undefined, marqueur);
      const nouveauSecret = 'secret-administrateur';

      // L'ancien mot de passe fonctionne AVANT : sans ce point de départ, un
      // 401 final ne prouverait rien.
      const avant = await request.post('/api/auth/connexion', {
        data: { email: compte.email, motDePasse: compte.motDePasse }
      });
      expect(avant.status(), 'connexion avant réinitialisation').toBe(200);

      await seConnecter(page, COMPTES.admin);
      await page.goto('/administration');
      await page.getByLabel('Rechercher').fill(marqueur);
      await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

      await page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }).click();
      await page.getByLabel('Nouveau mot de passe').fill(nouveauSecret);
      await page.getByRole('button', { name: 'Réinitialiser' }).click();
      await expect(page.getByText('Mot de passe réinitialisé.')).toBeVisible({ timeout: 15_000 });

      const ancien = await request.post('/api/auth/connexion', {
        data: { email: compte.email, motDePasse: compte.motDePasse }
      });
      expect(ancien.status(), 'ancien mot de passe rejeté').toBe(401);

      const reponse = await request.post('/api/auth/connexion', {
        data: { email: compte.email, motDePasse: nouveauSecret }
      });
      expect(reponse.status(), 'nouveau mot de passe accepté').toBe(200);

      // Et le jeton obtenu est réellement exploitable, pas seulement délivré
      const jeton = (await reponse.json()).token;
      const profil = await request.get('/api/profil', {
        headers: { Authorization: `Bearer ${jeton}` }
      });
      expect(profil.status(), 'jeton exploitable').toBe(200);
    });

  test('refuse un mot de passe trop court', async ({ page, request }) => {
    const marqueur = `Court${Date.now()}`;
    await creerCompte(request, undefined, marqueur);

    await seConnecter(page, COMPTES.admin);
    await page.goto('/administration');
    await page.getByLabel('Rechercher').fill(marqueur);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });

    await page.locator('tbody tr').first().getByRole('button', { name: 'Modifier' }).click();
    await page.getByLabel('Nouveau mot de passe').fill('abc');
    // Le bouton reste inerte : la règle des 5 caractères est vérifiée avant
    // l'envoi, et de nouveau côté serveur.
    await expect(page.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
  });

  test('l administrateur ne voit ni séances ni statistiques', async ({ page }) => {
    await seConnecter(page, COMPTES.admin);
    // Son écran d'accueil EST l'administration : le repli après connexion était
    // codé en dur sur /seances, il l'y déposait sur un carnet vide.
    await expect(page).toHaveURL(/\/administration/);
    // Son compte sert à administrer : un carnet vide et des statistiques à
    // zéro n'apprennent rien et allongent la navigation.
    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mes séances' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Statistiques' })).toHaveCount(0);
  });

  /**
   * L'annuaire complet en PDF. ⚠️ Le test vérifie AUSSI que le serveur refuse
   * un membre : l'export contient tous les comptes, et un bouton absent de
   * l'écran ne protège rien — n'importe qui peut appeler l'URL.
   */
  test('exporte l annuaire en PDF, et le refuse à un membre',
    async ({ page, request }) => {
      await seConnecter(page, COMPTES.admin);
      await page.goto('/administration');

      const telechargement = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exporter en PDF' }).click();
      expect((await telechargement).suggestedFilename())
        .toMatch(/^utilisateurs-\d{4}-\d{2}-\d{2}\.pdf$/);

      // Même URL, jeton d'un simple membre : 403
      const membre = await creerCompte(request);
      const refus = await request.get('/api/admin/utilisateurs/export.pdf', {
        headers: { Authorization: `Bearer ${membre.token}` }
      });
      expect(refus.status()).toBe(403);
    });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ LA PAGINATION DOIT SE VOIR, MÊME SUR UNE SEULE PAGE                 │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Elle était conditionnée à `totalPages > 1` : avec six comptes elle
   * n'apparaissait pas, et rien ne disait combien il y en avait au total ni
   * qu'on pouvait en afficher davantage. On la voyait comme absente.
   *
   * ⚠️ Le test vérifie aussi le changement de LIGNES PAR PAGE : passer de 10 à
   * 50 depuis la page 2 demanderait sinon les lignes 100 à 150 d'un jeu qui
   * n'en compte plus qu'une page — l'écran reviendrait vide.
   */
  test('pagine les comptes et permet d en afficher plus par page',
    async ({ page, request }) => {
      for (let i = 0; i < 14; i++) {
        await creerCompte(request);
      }
      await seConnecter(page, COMPTES.admin);
      await page.goto('/administration');

      await expect(page.locator('tbody tr')).toHaveCount(10, { timeout: 25_000 });
      const rapport = page.locator('.p-paginator-current');
      await expect(rapport).toContainText(/1 à 10 sur \d+ compte/);

      await page.getByLabel('Page suivante').click();
      await expect(rapport).toContainText(/^11 à /, { timeout: 15_000 });

      // Depuis la page 2, on élargit : on doit revenir à la première page
      await page.locator('.p-paginator-rpp-dropdown').click();
      await page.getByRole('option', { name: '50' }).click();
      await expect(rapport).toContainText(/^1 à /, { timeout: 15_000 });
      await expect(page.locator('tbody tr').first()).toBeVisible();
    });
});
