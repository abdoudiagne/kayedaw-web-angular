import { expect, test } from '@playwright/test';
import { choisirPays, creerCompte, creerCompteAvecPays, creerEtLire, creerSeance, dansNJours,
  dateHeureLocale, ilYA, saisirNombre, seConnecter } from './aide';

test.describe('Séances', () => {

  test.beforeEach(async ({ page }) => seConnecter(page));

  /**
   * Le cœur de la planification : la météo doit apparaître AVANT enregistrement,
   * grâce à la ville de référence du profil. Aucun test unitaire ne peut le
   * prouver — il faut le vrai formulaire, la vraie API et le vrai service météo.
   */
  test('affiche la météo prévue avant enregistrement', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    // La ville doit être pré-remplie depuis le profil
    await expect(page.getByLabel('Ville')).not.toHaveValue('');

    await page.getByLabel('Date et heure').fill(dansNJours(3, '07:00'));

    const apercu = page.locator('.apercu-meteo');
    await expect(apercu).toBeVisible({ timeout: 20_000 });
    await expect(apercu).toContainText(/prévision/);
  });

  /**
   * NON-RÉGRESSION : à l'ouverture de l'écran, la date est pré-remplie à
   * MAINTENANT. Le jour courant était routé vers l'API archive, qui s'arrête à
   * hier — l'aperçu s'affichait donc avec l'en-tête mais AUCUNE mesure.
   */
  test('affiche la météo du jour dès l ouverture, sans rien saisir', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    const apercu = page.locator('.apercu-meteo');
    await expect(apercu).toBeVisible({ timeout: 20_000 });

    // Un en-tête seul ne suffit pas : on exige des valeurs chiffrées
    await expect(apercu.locator('dd')).not.toHaveCount(0);
    await expect(apercu).toContainText(/°C/);
    await expect(apercu).toContainText(/km\/h/);
  });

  /**
   * NON-RÉGRESSION : la liste de villes se dépliait toute seule à l'ouverture
   * de l'écran. La ville étant pré-remplie depuis le profil, l'affectation
   * programmatique déclenchait `valueChanges` comme une frappe utilisateur.
   */
  test('la liste de villes ne s ouvre pas toute seule à l ouverture', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    const ville = page.getByLabel('Ville');
    await expect(ville).not.toHaveValue('');          // bien pré-remplie
    // Au-delà du debounce de 250 ms, aucune liste ne doit être apparue
    await page.waitForTimeout(1200);
    await expect(page.getByRole('listbox')).toHaveCount(0);

    // Mais elle s'ouvre dès que l'utilisateur tape réellement
    await ville.fill('');
    await ville.pressSequentially('bord', { delay: 60 });
    await expect(page.getByRole('listbox')).toBeVisible({ timeout: 15_000 });
  });

  /**
   * La ville pré-remplie est une COMMODITÉ, pas une contrainte : elle doit
   * rester librement modifiable, et l'aperçu météo doit suivre la nouvelle
   * ville — sinon on planifierait sur les conditions du mauvais lieu.
   */
  test('la ville pré-remplie reste modifiable et la météo suit', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    const ville = page.getByLabel('Ville');

    // Ni readonly ni disabled : le champ est éditable
    await expect(ville).toBeEditable();
    await expect(ville).toHaveValue('Lille');

    // On la remplace par une autre ville, choisie dans les suggestions
    await ville.fill('');
    await ville.pressSequentially('Bordeaux', { delay: 50 });
    const liste = page.getByRole('listbox');
    await expect(liste).toBeVisible({ timeout: 15_000 });
    await liste.getByRole('option').first().click();
    await expect(ville).toHaveValue(/Bordeaux/);

    // L'aperçu météo doit refléter la NOUVELLE ville
    await page.getByLabel('Date et heure').fill(dansNJours(3, '09:00'));
    const apercu = page.locator('.apercu-meteo');
    await expect(apercu).toBeVisible({ timeout: 20_000 });
    await expect(apercu).toContainText(/Bordeaux/);
  });

  test('la ville peut aussi être saisie à la main sans passer par la liste', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    const ville = page.getByLabel('Ville');

    await ville.fill('');
    await ville.pressSequentially('Nantes', { delay: 40 });
    // On ferme la liste par Échap : la saisie libre doit être conservée
    await ville.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(ville).toHaveValue('Nantes');
  });

  test('l allure et la vitesse s affichent et restent cohérentes', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    await saisirNombre(page, 'distanceKm', '5');
    await saisirNombre(page, 'dureeMinutes', '30');

    const apercu = page.locator('.apercu');
    // 5 km en 30 min : 6'00"/km ET 10 km/h — deux lectures du même effort
    await expect(apercu).toContainText(`6'00"/km`);
    await expect(apercu).toContainText('10 km/h');
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ La ville conditionne l'enregistrement                               │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Elle est le seul champ dans ce cas, parce qu'elle est le seul qu'on ne
   * peut plus corriger : la météo est résolue et stockée à l'enregistrement,
   * et l'écran de modification n'offre pas la ville. Sans ce garde-fou, un
   * champ vidé par mégarde produisait une séance définitivement sans météo,
   * sans qu'aucun message ne le signale.
   *
   * Le test vérifie AUSSI le motif affiché : un bouton désactivé muet est une
   * impasse, et il ne prend pas le focus — un lecteur d'écran ne le
   * rencontrerait jamais.
   */
  test('le bouton Enregistrer reste inactif tant que la ville est vide', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    await saisirNombre(page, 'distanceKm', '5');
    await saisirNombre(page, 'dureeMinutes', '30');

    const enregistrer = page.getByRole('button', { name: 'Enregistrer' });
    // Pré-remplie depuis le profil : le formulaire est donc utilisable d'emblée
    await expect(enregistrer).toBeEnabled();

    await page.getByLabel('Ville').fill('');
    await expect(enregistrer).toBeDisabled();
    await expect(page.getByText('Renseignez la ville pour enregistrer.')).toBeVisible();

    // Des espaces ne valent pas une ville : ils atteindraient le géocodeur
    // sans désigner aucun lieu, et la séance reviendrait sans météo.
    await page.getByLabel('Ville').fill('   ');
    await expect(enregistrer).toBeDisabled();

    await page.getByLabel('Ville').fill('Lille');
    await expect(enregistrer).toBeEnabled();
    await expect(page.getByText('Renseignez la ville pour enregistrer.')).toHaveCount(0);
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ ON NE COURT PAS TOUJOURS CHEZ SOI                                   │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Le pays venait du COMPTE : un Français en déplacement ne trouvait aucune
   * ville étrangère dans l'autocomplétion, et sa séance revenait sans météo.
   * Il appartient désormais à la SÉANCE, et il vient AVANT la ville à
   * l'écran parce que c'est lui qui borne les villes proposées.
   */
  test('le pays précède la ville et commande ses suggestions', async ({ page }) => {
    await page.goto('/seances/nouvelle');

    // Pré-rempli sur le pays du profil : le cas courant n'exige aucune saisie
    await expect(page.locator('#pays')).toContainText('France', { timeout: 15_000 });

    const ville = page.getByLabel('Ville');
    await expect(ville).not.toHaveValue('');

    // Changer de pays vide la ville : « Lille » au Sénégal ne désigne rien
    await choisirPays(page, 'pays', 'Sénégal');
    await expect(ville).toHaveValue('');

    // ...et les suggestions suivent le nouveau pays
    await ville.pressSequentially('Thi', { delay: 60 });
    await expect(page.getByRole('option', { name: /Thiès/ }).first())
      .toBeVisible({ timeout: 15_000 });
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ RETAPER LE MÊME NOM APRÈS AVOIR CORRIGÉ LE PAYS                     │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Défaut signalé en usage réel : « Bambilor » saisi avec le pays sur France
   * ne donne rien — c'est normal, la commune est sénégalaise. On corrige le
   * pays, on retape le même nom… et toujours rien.
   *
   * En cause, `distinctUntilChanged()` posé sur le seul terme de recherche :
   * le mot étant identique au précédent, aucune requête ne repartait. Le même
   * mot sous un autre pays est pourtant une AUTRE question.
   *
   * ⚠️ Le test vise le TEXTE de l'option, pas leur nombre : PrimeNG rend son
   * message « Aucun résultat » comme un élément de liste, et compter les
   * options ferait passer un échec pour un succès.
   */
  test('retaper la même ville après avoir corrigé le pays relance la recherche',
    async ({ page }) => {
      await page.goto('/seances/nouvelle');
      const ville = page.getByLabel('Ville');

      // Bambilor est une commune du Sénégal : rien à trouver en France
      await ville.fill('');
      await ville.pressSequentially('Bambilor', { delay: 40 });
      await expect(page.getByRole('option', { name: /Bambilor/ })).toHaveCount(0, { timeout: 15_000 });

      // On corrige le pays — ce qui vide la ville — puis on retape le MÊME nom
      await choisirPays(page, 'pays', 'Sénégal');
      await ville.pressSequentially('Bambilor', { delay: 40 });

      await expect(page.getByRole('option', { name: /Bambilor/ }).first())
        .toBeVisible({ timeout: 15_000 });
    });

  /**
   * Le géocodeur cherche par RESSEMBLANCE et pénalise l'écart de longueur :
   * « bamb » lui évoque Bamba ou Mbamb, jamais Bambilor — qui sort dès
   * « bambi ». Vérifié : à count=100 et sans filtre de pays, Bambilor est
   * absent des cent résultats, donc rien de notre côté ne peut le rattraper.
   *
   * Ce qui EST de notre ressort, c'est de ne pas laisser une liste vide se
   * lire « cette ville n'existe pas ».
   */
  test('une saisie trop courte est expliquée, pas laissée en silence',
    async ({ page }) => {
      await page.goto('/seances/nouvelle');
      await choisirPays(page, 'pays', 'Sénégal');

      const ville = page.getByLabel('Ville');
      await ville.pressSequentially('zzz', { delay: 50 });

      await expect(page.getByText(/continuez à saisir/i)).toBeVisible({ timeout: 15_000 });

      // Une saisie qui aboutit fait disparaître le conseil
      await ville.fill('');
      await ville.pressSequentially('Bambilor', { delay: 40 });
      await expect(page.getByText(/continuez à saisir/i)).toHaveCount(0, { timeout: 15_000 });
    });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ L'APERÇU MÉTÉO DOIT RESTER SOUS LES YEUX PENDANT LA SAISIE          │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Il vivait au milieu du formulaire, sous la ligne de flottaison : c'est en
   * déplaçant la DATE qu'on veut le voir bouger, or il fallait défiler pour
   * constater l'effet de sa propre saisie, puis remonter pour la corriger. Un
   * retour en direct qu'on ne voit pas n'en est pas un.
   *
   * Le test mesure ce qui compte — l'aperçu est-il encore À L'ÉCRAN après un
   * défilement — et non la présence d'une classe CSS, qui ne prouverait rien
   * du comportement.
   */
  test('l aperçu météo reste visible pendant qu on fait défiler le formulaire',
    async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 700 });
      await page.goto('/seances/nouvelle');

      const apercu = page.locator('.apercu-meteo');
      await expect(apercu).toBeVisible({ timeout: 25_000 });

      await page.mouse.wheel(0, 500);
      await expect.poll(async () => {
        const boite = await apercu.boundingBox();
        return boite !== null && boite.y > 0 && boite.y < 700;
      }, { timeout: 5_000 }).toBe(true);
    });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ EXPORT PDF — un fichier, pas une page imprimable                    │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Le test attend l'événement `download` : c'est la seule preuve qu'un
   * FICHIER est bien parti. Vérifier la présence du bouton, ou même l'appel
   * réseau, ne dirait rien du résultat — et le téléchargement passe ici par un
   * blob construit à la main, le jeton n'étant posé que par l'intercepteur.
   */
  test('exporte le carnet en PDF', async ({ page }) => {
    await page.goto('/seances');

    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter en PDF' }).click();
    const fichier = await telechargement;

    // Le nom porte la date : trois exports successifs ne s'écrasent pas
    expect(fichier.suggestedFilename()).toMatch(/^seances-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test('le bouton Enregistrer exige AUSSI le pays', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    await saisirNombre(page, 'distanceKm', '5');
    await saisirNombre(page, 'dureeMinutes', '30');

    const enregistrer = page.getByRole('button', { name: 'Enregistrer' });
    await expect(enregistrer).toBeEnabled();

    // Choisir un pays vide la ville : le lieu redevient incomplet
    await choisirPays(page, 'pays', 'Belgique');
    await expect(enregistrer).toBeDisabled();
    await expect(page.getByText('Renseignez la ville pour enregistrer.')).toBeVisible();
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ LE CAS QUI PASSAIT EN SILENCE                                       │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Constaté en usage réel, dans le journal du serveur :
   * « ville inconnue : Dakar (France), enrichissement ignoré », trois fois.
   *
   * La ville n'était pas vide — `villeRequise` était donc satisfait — mais ne
   * désignait aucun lieu du pays choisi. Aucune suggestion n'apparaissait, la
   * liste étant bornée au pays ; la frappe libre était acceptée ; et la séance
   * se serait enregistrée SANS météo, définitivement, sans un seul message.
   *
   * Le validateur asynchrone interroge le référentiel. Le test vérifie le
   * message ET le blocage : constater l'erreur sans empêcher l'enregistrement
   * ne servirait à rien.
   */
  test('une ville qui n existe pas dans le pays choisi est refusée, et dite',
    async ({ page }) => {
      await page.goto('/seances/nouvelle');
      await saisirNombre(page, 'distanceKm', '5');
      await saisirNombre(page, 'dureeMinutes', '30');

      const enregistrer = page.getByRole('button', { name: 'Enregistrer' });
      const ville = page.getByLabel('Ville');

      // Le pays reste sur France, on saisit une ville sénégalaise à la main
      await ville.fill('Dakar');

      await expect(page.getByText(/introuvable en France/)).toBeVisible({ timeout: 15_000 });
      await expect(enregistrer).toBeDisabled();

      // Corriger le PAYS suffit à lever le refus : c'est bien lui qui était faux
      await choisirPays(page, 'pays', 'Sénégal');
      await ville.fill('Dakar');
      await expect(page.getByText(/introuvable/)).toHaveCount(0, { timeout: 15_000 });
      await expect(enregistrer).toBeEnabled();
    });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ L'AVERTISSEMENT DOIT S'ALIGNER SUR LA PORTÉE RÉELLE DE L'API        │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Planifier va jusqu'à 30 jours — c'est NOTRE règle. Prévoir s'arrête à
   * J+14 — c'est celle d'Open-Meteo, mesurée : J+14 rend une valeur, J+15 est
   * accepté mais ne rend rien, J+16 est refusé.
   *
   * La constante valait 15, soit le dernier jour ACCEPTÉ et non le dernier
   * jour COUVERT : une séance posée à J+15 échappait à l'avertissement tout en
   * revenant sans mesure — le cas même qu'il doit couvrir.
   *
   * Le test vérifie les DEUX côtés de la frontière : un avertissement qui
   * s'affiche toujours ne vaut pas mieux qu'un avertissement absent.
   */
  test('l avertissement de prévision s aligne sur J+14', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    const avertissement = page.getByText(/aucune prévision météo au-delà/);

    // Dernier jour où une prévision existe : rien à signaler
    await page.getByLabel('Date et heure').fill(dansNJours(14, '18:00'));
    await expect(avertissement).toHaveCount(0);

    // Premier jour sans valeur : l'écran doit le dire
    await page.getByLabel('Date et heure').fill(dansNJours(15, '18:00'));
    await expect(avertissement).toBeVisible();
  });

  test('refuse une planification au-delà de 30 jours', async ({ page }) => {
    await page.goto('/seances/nouvelle');
    await saisirNombre(page, 'distanceKm', '10');
    await saisirNombre(page, 'dureeMinutes', '50');
    await page.getByLabel('Date et heure').fill(dansNJours(60));
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(/au-delà de 30 jours/)).toBeVisible();
  });

});

/**
 * Bloc SÉPARÉ, sans le beforeEach de connexion du précédent : ces tests
 * ouvrent leur PROPRE compte, et se reconnecter alors qu'une session est déjà
 * ouverte est impossible — le garde invité renvoie /connexion vers /seances.
 */
test.describe('Séances — état temporel', () => {

  /**
   * Le backend ne connaît que deux états (`estPlanifiee` = date future) : une
   * séance commencée il y a dix minutes lui est « réalisée » et se noyait dans
   * l'historique. C'est pourtant la seule ligne qui décrive l'instant présent.
   */
  test('une séance en cours est mise en avant, hors de l historique',
    async ({ page, request }) => {
      const compte = await creerCompte(request);
      // Commencée il y a 10 min pour 1 h : elle se déroule maintenant.
      await creerSeance(request, compte.token, {
        distanceKm: 10, dureeMinutes: 60, dateHeure: dateHeureLocale(-10)
      });
      await seConnecter(page, compte);

      await expect(page.getByRole('heading', { name: /En cours/ })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.seance.active')).toHaveCount(1);
      // Elle ne doit PAS être comptée deux fois : absente de « Réalisées »
      await expect(page.locator('.seance')).toHaveCount(1);
    });

  /**
   * NON-RÉGRESSION : l'archive Open-Meteo s'arrête à hier, donc une séance
   * courue AUJOURD'HUI est enrichie par la prévision. Le badge « prévision »
   * s'affichait alors sur une séance bel et bien réalisée, laissant croire
   * qu'elle n'avait pas eu lieu.
   */
  test('une séance déjà courue aujourd hui ne porte pas de badge de prévision',
    async ({ page, request }) => {
      const compte = await creerCompte(request);
      // Commencée il y a 3 h pour 45 min : terminée, mais datée d'aujourd'hui.
      await creerSeance(request, compte.token, {
        distanceKm: 8, dureeMinutes: 45, dateHeure: dateHeureLocale(-180), ville: 'Lille'
      });
      await seConnecter(page, compte);

      await expect(page.locator('.seance')).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator('.seance.active')).toHaveCount(0);
      await expect(page.locator('.meteo-ligne .prevision')).toHaveCount(0);
    });
});

test.describe('Séances — création isolée', () => {

  /**
   * Compte dédié ici aussi : ce test exigeait qu'une séance EXISTE sur le
   * compte de démonstration, donc qu'un autre test en ait laissé une. Cette
   * dépendance invisible entre fichiers l'a fait échouer dès que le test de
   * création est passé sur son propre compte. Il sème désormais sa donnée.
   */

  /**
   * NON-RÉGRESSION : `LOCALE_ID` vaut « en-US » par défaut dans Angular, quelle
   * que soit la langue du système ou l'attribut lang de la page. Le détail
   * affichait « Wednesday 22 July 2026 » au milieu d'une interface française.
   */
  test('la date du détail s affiche en français', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await creerSeance(request, compte.token, {
      distanceKm: 10, dureeMinutes: 55, dateHeure: ilYA(1, '17:23')
    });
    await seConnecter(page, compte);

    await page.locator('.seance').first().click();
    const titre = page.locator('h1').first();
    await expect(titre).toBeVisible({ timeout: 15_000 });

    // Un jour et un mois français, pas leurs équivalents anglais
    await expect(titre).toHaveText(
      /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i);
    await expect(titre).toContainText(
      /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/);

    /*
     * Et le mois reste en MINUSCULE : `text-transform: capitalize` capitalisait
     * chaque mot — « Mardi 21 Juillet 2026 ». Invisible en anglais, où la
     * locale capitalise déjà, faux en français.
     */
    await expect(titre).not.toHaveText(/\s(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)/);
  });

  test('les mesures de la liste portent leur intitulé', async ({ page, request }) => {
    const compte = await creerCompte(request);
    await creerSeance(request, compte.token, {
      distanceKm: 9, dureeMinutes: 50, dateHeure: ilYA(4)
    });
    await seConnecter(page, compte);

    const premiere = page.locator('.seance').first();
    await expect(premiere).toBeVisible({ timeout: 15_000 });

    // Sans intitulé, « 1h02 » se lisait comme une heure et non une durée
    for (const intitule of ['Distance', 'Durée', 'Allure', 'Vitesse']) {
      await expect(premiere.getByText(intitule, { exact: true })).toBeVisible();
    }
  });

  /**
   * ⚠️ COMPTE DÉDIÉ, et non le compte de démonstration partagé.
   *
   * Ce test CRÉE une séance et ne la supprime pas. Sur le compte de démo, ses
   * traces s'accumulaient d'une exécution à l'autre : au bout d'une dizaine de
   * passes, la semaine courante atteignait 82,5 km et le plafond hebdomadaire
   * de 80 km refusait la création — un échec sans rapport avec ce que le test
   * vérifie, et qui n'apparaissait qu'après coup. Un compte neuf part à zéro.
   */
  test('enregistre une séance passée et la retrouve dans la liste',
      async ({ page, request }) => {
      await seConnecter(page, await creerCompte(request));
      const commentaire = `e2e-${Date.now()}`;
      await page.goto('/seances/nouvelle');

      await saisirNombre(page, 'distanceKm', '7.5');
      await saisirNombre(page, 'dureeMinutes', '40');
      await page.getByLabel('Date et heure').fill(dansNJours(-2, '09:00'));
      await page.getByLabel('Commentaire').fill(commentaire);
      await page.getByRole('button', { name: 'Enregistrer' }).click();

      await expect(page).toHaveURL(/\/seances/);

      // La recherche serveur doit la retrouver
      await page.getByLabel('Recherche').fill(commentaire);
      await expect(page.locator('.seance')).toHaveCount(1, { timeout: 15_000 });
      await expect(page.locator('.seance').first()).toContainText('7.5');
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ Le LIEU du compte arrive en entier — ville ET pays                  │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * `AuthResponse` ne portait que `villeParDefaut`. Le client retombait donc
   * sur son repli « France », et un compte sénégalais ouvrait « Nouvelle
   * séance » sur Dakar / **France** : lieu introuvable, aucune suggestion,
   * aucune météo — alors que le profil était juste.
   *
   * Le test passe par la CONNEXION à l'écran, et non par un jeton posé à la
   * main : c'est la réponse de connexion qui portait le trou.
   */
  test('le pays du compte pré-remplit le formulaire, pas seulement la ville',
      async ({ page, request }) => {
      const compte = await creerCompteAvecPays(request, 'Sénégal', 'Dakar');
      await seConnecter(page, compte);

      await page.goto('/seances/nouvelle');

      await expect(page.locator('#pays')).toContainText('Sénégal', { timeout: 15_000 });
      await expect(page.getByLabel('Ville')).toHaveValue('Dakar');

      // Le lieu est cohérent : ni message d'introuvable, ni bouton bloqué
      await expect(page.getByText(/introuvable/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ PARCOURS COMPLET À L'ÉCRAN : créer à l'étranger, lire, modifier,    │
   * │ supprimer                                                           │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Les trois opérations sont enchaînées sur UNE séance, dans l'ordre où un
   * utilisateur les fait. Testées séparément, chacune peut passer alors que
   * l'enchaînement casse — c'est la modification qui perdait le lieu et la
   * météo, jamais la modification seule.
   *
   * Compte dédié : le test écrit, et le plafond hebdomadaire de 80 km finit
   * par refuser les créations sur un compte partagé.
   */
  test('parcours complet : création à l étranger, modification, suppression',
      async ({ page, request }) => {
      await seConnecter(page, await creerCompte(request));
      const commentaire = `parcours-${Date.now()}`;

      // ── CRÉATION ────────────────────────────────────────────────────────
      await page.goto('/seances/nouvelle');
      await choisirPays(page, 'pays', 'Sénégal');

      const ville = page.getByLabel('Ville');
      await ville.pressSequentially('Thiès', { delay: 50 });
      const liste = page.getByRole('listbox');
      await expect(liste).toBeVisible({ timeout: 15_000 });
      await liste.getByRole('option').first().click();

      await saisirNombre(page, 'distanceKm', '8');
      await saisirNombre(page, 'dureeMinutes', '45');
      await page.getByLabel('Date et heure').fill(ilYA(1, '08:00').replace(' ', 'T'));
      await page.getByLabel('Commentaire').fill(commentaire);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page).toHaveURL(/\/seances$/);

      // ── LECTURE : la liste porte la ville ET le pays ─────────────────────
      await page.getByLabel('Recherche').fill(commentaire);
      const carte = page.locator('.seance');
      await expect(carte).toHaveCount(1, { timeout: 15_000 });
      await expect(carte.first()).toContainText('Thiès');
      // Le pays : sans lui, « Thiès » seul ne dit pas où l'on a couru
      await expect(carte.first().locator('.pays')).toHaveText('Sénégal');

      // ── MODIFICATION : le lieu et la météo doivent SURVIVRE ─────────────
      // Les actions vivent sur le DÉTAIL, la carte de liste n'est qu'un lien
      await carte.first().click();
      await expect(page).toHaveURL(/\/seances\/\d+$/);
      await page.getByRole('link', { name: /Modifier/ }).click();
      await expect(page).toHaveURL(/\/modifier$/);
      await saisirNombre(page, 'distanceKm', '12');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page).toHaveURL(/\/seances$/);

      await page.getByLabel('Recherche').fill(commentaire);
      await expect(carte).toHaveCount(1, { timeout: 15_000 });
      await expect(carte.first()).toContainText('12');
      await expect(carte.first().locator('.pays')).toHaveText('Sénégal');

      // ── SUPPRESSION ─────────────────────────────────────────────────────
      await carte.first().click();
      await expect(page).toHaveURL(/\/seances\/\d+$/);
      await page.getByRole('button', { name: /Supprimer/ }).click();
      // ⚠️ alertdialog et non dialog, et l'hôte comme la boîte le portent —
      // d'où .last(). Le libellé d'acceptation est explicite (« Supprimer la
      // séance »), pas un « Oui » générique : il nomme ce qui va disparaître.
      await page.getByRole('alertdialog').last()
        .getByRole('button', { name: 'Supprimer la séance' }).click();

      await expect(page).toHaveURL(/\/seances$/);
      await page.getByLabel('Recherche').fill(commentaire);
      await expect(carte).toHaveCount(0, { timeout: 15_000 });
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ La contrainte de ville ne doit PAS enfermer l'écran de modification │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * L'édition n'affiche pas le champ ville et ne le renseigne pas : un
   * `required` laissé actif y rendrait le formulaire éternellement invalide,
   * et la séance impossible à corriger — sur un champ que l'utilisateur ne
   * voit même pas. Le composant lève donc le validateur en modification, et
   * c'est ce test qui garantit qu'il le fait vraiment.
   */
  test('une séance existante reste modifiable, sans champ ville à l écran',
      async ({ page, request }) => {
      const compte = await creerCompte(request);
      const seance = await creerEtLire(request, compte.token, 'Lille', ilYA(3, '10:00'));
      await seConnecter(page, compte);

      await page.goto(`/seances/${seance.id}/modifier`);

      // Le champ n'existe pas ici : c'est la prémisse de tout le raisonnement
      await expect(page.getByLabel('Ville')).toHaveCount(0);

      const enregistrer = page.getByRole('button', { name: 'Enregistrer' });
      await expect(enregistrer).toBeEnabled();

      await saisirNombre(page, 'distanceKm', '8');
      await enregistrer.click();

      await expect(page).toHaveURL(/\/seances$/);
      await expect(page.locator('.seance').first()).toContainText('8');
  });
});

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MÉTÉO HORS DE FRANCE                                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le géocodeur était verrouillé sur `countryCode=FR` : aucune ville étrangère
 * n'était trouvable, et la séance était créée sans météo ni ville. Le pays du
 * COMPTE lève désormais l'homonymie.
 */
test.describe('Séances — météo à l étranger', () => {

  test('un compte sénégalais obtient la météo de ses villes', async ({ request }) => {
    const compte = await creerCompteAvecPays(request, 'Sénégal', 'Dakar');

    // Bargny (69 000 hab.) est le cas qui a révélé le défaut `count=1` du
    // géocodeur : introuvable à 1 résultat demandé, trouvé à 2.
    for (const ville of ['Dakar', 'Thiès', 'Bargny', 'Kaolack']) {
      const seance = await creerEtLire(request, compte.token, ville, ilYA(2));
      expect(seance.ville, `${ville} géocodée`).toBe(ville);
      expect(seance.temperatureMaxC, `${ville} : température`).not.toBeNull();
      // Hors de France, DPClim ne couvre rien : c'est l'archive qui répond
      expect(seance.sourceMeteo).toBe('ARCHIVE_OPEN_METEO');
    }
  });

  /**
   * NON-RÉGRESSION : l'archive ne demandait pas la série HORAIRE, que seule la
   * prévision réclamait. Une séance passée connaissait donc le maximum du jour
   * mais pas la chaleur réellement subie à l'heure de la sortie.
   */
  test('une séance passée à l étranger connaît la température de son heure',
    async ({ request }) => {
      const compte = await creerCompteAvecPays(request, 'Sénégal', 'Dakar');
      const seance = await creerEtLire(request, compte.token, 'Dakar', ilYA(2, '07:00'));

      expect(seance.temperatureALHeureC).not.toBeNull();
      // À 7 h il fait plus frais qu'au plus chaud de la journée : c'est
      // précisément l'information que la série horaire apporte.
      expect(seance.temperatureALHeureC).toBeLessThan(seance.temperatureMaxC);
    });

  test('le pays du compte écarte les homonymes', async ({ request }) => {
    // « Dakar » existe aussi en Syrie et en Inde. Un compte FRANÇAIS ne doit
    // pas se voir attribuer l'un d'eux : mieux vaut aucune météo qu'une météo
    // fausse, prise à 5 000 km de là.
    const francais = await creerCompteAvecPays(request, 'France', 'Lille');
    const seance = await creerEtLire(request, francais.token, 'Dakar', ilYA(2));

    expect(seance.ville).toBeNull();
    expect(seance.sourceMeteo).toBeNull();
  });
});
