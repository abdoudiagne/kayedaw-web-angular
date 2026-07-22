import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { choisirDansSelect, creerCompte, creerSeance, ilYA, seConnecter } from './aide';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ FILTRES, TRI ET PAGINATION DE /seances                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Ce sont les trois mécanismes du flux RxJS le plus dense de l'application
 * (combineLatest → switchMap → HTTP), et aucun n'était couvert : les tests
 * existants ne vérifiaient que la recherche plein texte.
 *
 * Chaque test travaille sur SON compte, créé par l'API : les filtres portent
 * sur l'ensemble des séances de l'utilisateur connecté, donc un jeu partagé
 * rendrait tout comptage dépendant de l'ordre d'exécution des tests.
 *
 * ⚠️ Les dates sont ESPACÉES d'une semaine à l'autre : une séance compte dans
 * le plafond hebdomadaire de 80 km, et le backend refuserait (422) un lot
 * entier posé sur les sept mêmes jours.
 */

/**
 * ⚠️ PAS de helper « attendre la fin du filtrage ».
 *
 * Une attente sur aria-busy=false passe IMMÉDIATEMENT : les filtres sont
 * débouncés de 300 ms, donc au retour de `selectOption` la requête n'est même
 * pas partie et le drapeau vaut encore false depuis le cycle précédent. Le
 * test lisait alors l'ancienne liste et échouait par intermittence.
 *
 * On s'appuie donc uniquement sur des assertions AUTO-RÉESSAYÉES (toHaveCount,
 * toContainText, expect.poll) : elles absorbent le debounce sans jamais figer
 * une durée d'attente arbitraire.
 */

async function compteAvecSeances(
  request: APIRequestContext,
  page: Page,
  seances: ReadonlyArray<{ type?: string; distanceKm: number; dureeMinutes: number; jours: number }>
) {
  const compte = await creerCompte(request);
  for (const seance of seances) {
    // ⚠️ On n'écrit `type` QUE s'il est fourni : creerSeance applique son
    // défaut par `{ type: 'ENDURANCE', ...seance }`, et une clé présente à
    // `undefined` écrase ce défaut au lieu de le laisser jouer — le backend
    // répond alors 400 « le type est obligatoire ».
    await creerSeance(request, compte.token, {
      ...(seance.type ? { type: seance.type } : {}),
      distanceKm: seance.distanceKm,
      dureeMinutes: seance.dureeMinutes,
      dateHeure: ilYA(seance.jours)
    });
  }
  await seConnecter(page, compte);
  return compte;
}

test.describe('Liste des séances — filtres, tri, pagination', () => {

  test('le filtre par type ne retient que le type demandé', async ({ page, request }) => {
    await compteAvecSeances(request, page, [
      { type: 'ENDURANCE', distanceKm: 10, dureeMinutes: 55, jours: 3 },
      { type: 'FRACTIONNE', distanceKm: 8, dureeMinutes: 40, jours: 10 },
      { type: 'FRACTIONNE', distanceKm: 6, dureeMinutes: 30, jours: 17 },
      { type: 'SORTIE_LONGUE', distanceKm: 22, dureeMinutes: 130, jours: 24 }
    ]);

    await expect(page.locator('.seance')).toHaveCount(4, { timeout: 15_000 });

    await choisirDansSelect(page, 'filtreType', 'Fractionné');
    await expect(page.locator('.seance')).toHaveCount(2);

    // Le libellé affiché doit être TRADUIT, jamais la constante de l'enum
    for (const badge of await page.locator('.seance .etiquette-type').all()) {
      await expect(badge).toHaveText('Fractionné');
    }

    // Retour à « Tous » : les quatre séances reviennent
    // p-select n'a plus d'option « Tous » : le filtre se retire par son
    // bouton d'effacement, ce qui est le geste réel de l'utilisateur.
    await page.locator('.p-select-clear-icon').click();
    await expect(page.locator('.seance')).toHaveCount(4);
  });

  test('le filtre par dates borne la période des deux côtés', async ({ page, request }) => {
    await compteAvecSeances(request, page, [
      { distanceKm: 5, dureeMinutes: 30, jours: 2 },
      { distanceKm: 6, dureeMinutes: 35, jours: 9 },
      { distanceKm: 7, dureeMinutes: 40, jours: 30 },
      { distanceKm: 8, dureeMinutes: 45, jours: 60 }
    ]);
    await expect(page.locator('.seance')).toHaveCount(4, { timeout: 15_000 });

    const jourISO = (jours: number) => {
      const d = new Date();
      d.setDate(d.getDate() - jours);
      return d.toISOString().slice(0, 10);
    };

    // Fenêtre couvrant les deux séances les plus récentes seulement
    await page.getByLabel('Du').fill(jourISO(15));
    await expect(page.locator('.seance')).toHaveCount(2);

    // On resserre par le haut : il ne reste que celle d'il y a 9 jours
    await page.getByLabel('Au').fill(jourISO(5));
    await expect(page.locator('.seance')).toHaveCount(1);
  });

  /**
   * NON-RÉGRESSION : des bornes inversées renvoyaient une page vide, que rien
   * ne distinguait d'une période réellement sans sortie. L'utilisateur en
   * concluait qu'il n'avait pas couru, au lieu de corriger sa saisie.
   */
  test('des bornes inversées sont NOMMÉES, pas silencieuses', async ({ page, request }) => {
    await compteAvecSeances(request, page, [
      { distanceKm: 5, dureeMinutes: 30, jours: 3 }
    ]);
    await expect(page.locator('.seance')).toHaveCount(1, { timeout: 15_000 });

    const dansNJoursISO = (jours: number) => {
      const d = new Date();
      d.setDate(d.getDate() + jours);
      return d.toISOString().slice(0, 10);
    };

    await page.getByLabel('Du').fill(dansNJoursISO(5));
    await page.getByLabel('Au').fill(dansNJoursISO(-5));

    // Sélecteur CIBLÉ et non getByRole('alert') : les notifications occupent en
    // permanence une région role="alert" vide — c'est le motif ARIA correct,
    // une région live doit préexister à son contenu — et le rôle seul renvoie
    // donc deux éléments.
    await expect(page.locator('.alerte-periode')).toContainText(/précède la date/);
  });

  test('le tri par distance ordonne réellement les lignes', async ({ page, request }) => {
    await compteAvecSeances(request, page, [
      { distanceKm: 5, dureeMinutes: 30, jours: 3 },
      { distanceKm: 21, dureeMinutes: 120, jours: 10 },
      { distanceKm: 12, dureeMinutes: 65, jours: 17 }
    ]);
    await expect(page.locator('.seance')).toHaveCount(3, { timeout: 15_000 });

    await choisirDansSelect(page, 'tri', 'Distance');

    // On lit les distances dans l'ORDRE DU DOM : l'assertion porte sur la
    // séquence, pas sur la présence — c'est tout l'objet d'un tri.
    // expect.poll réessaie jusqu'à ce que la liste triée arrive ; une lecture
    // sèche capturait l'ancien ordre, la requête étant débouncée de 300 ms.
    await expect.poll(async () =>
      (await page.locator('.seance .m-distance .valeur strong').allTextContents()).map(Number)
    ).toEqual([21, 12, 5]);
  });

  test('le tri par date bascule du plus récent au plus ancien', async ({ page, request }) => {
    await compteAvecSeances(request, page, [
      { distanceKm: 5, dureeMinutes: 30, jours: 3 },
      { distanceKm: 6, dureeMinutes: 35, jours: 20 },
      { distanceKm: 7, dureeMinutes: 40, jours: 40 }
    ]);
    await expect(page.locator('.seance')).toHaveCount(3, { timeout: 15_000 });

    // On vise la DISTANCE de la première ligne, qui identifie la séance sans
    // ambiguïté : un toContainText('5') sur la ligne entière matcherait aussi
    // bien « 35 min », « 05:00 » ou une allure.
    const premiereDistance = page.locator('.seance').first().locator('.m-distance .valeur strong');

    // Par défaut « Date (récent) » : la séance d'il y a 3 jours est en tête
    await expect(premiereDistance).toHaveText('5');

    await choisirDansSelect(page, 'tri', 'Date (ancien)');
    await expect(premiereDistance).toHaveText('7');
  });

  /**
   * La page vaut 20 séances (taille fixée dans seance-liste.component.ts).
   * On en crée 21 : c'est le plus petit jeu qui produise une seconde page,
   * donc le moins coûteux à préparer.
   */
  test('la pagination change de page et borne ses extrémités', async ({ page, request }) => {
    const seances = Array.from({ length: 21 }, (_, i) => ({
      distanceKm: 5,
      dureeMinutes: 30,
      // Une séance tous les deux jours : 5 km × ~3 par semaine, très en deçà
      // du plafond hebdomadaire de 80 km qui ferait échouer la préparation.
      jours: 2 + i * 2
    }));
    await compteAvecSeances(request, page, seances);

    await expect(page.locator('.seance')).toHaveCount(20, { timeout: 20_000 });

    // p-paginator : les boutons portent un aria-label, pas de texte visible.
    const precedent = page.getByRole('button', { name: 'Page précédente' });
    const suivant = page.getByRole('button', { name: 'Page suivante' });

    // Première page : on ne peut pas remonter plus haut
    await expect(precedent).toBeDisabled();
    await expect(suivant).toBeEnabled();
    /*
     * Le rapport dit désormais « 1 à 20 sur 21 » et non « Page 1 sur 2 » : le
     * paginateur affiche déjà ses numéros de page, alors que le TOTAL
     * n'apparaissait nulle part. On assert donc sur ce que l'écran apprend.
     */
    const rapport = page.locator('.p-paginator-current');
    await expect(rapport).toHaveText('1 à 20 sur 21 séance(s)');

    await suivant.click();
    await expect(page.locator('.seance')).toHaveCount(1);
    await expect(rapport).toHaveText('21 à 21 sur 21 séance(s)');
    await expect(suivant).toBeDisabled();

    await precedent.click();
    await expect(page.locator('.seance')).toHaveCount(20);
    await expect(rapport).toHaveText('1 à 20 sur 21 séance(s)');
  });

  /**
   * Un filtre appliqué sur une page > 1 doit ramener à la première page :
   * sinon la requête part avec un numéro de page qui n'existe plus dans le
   * jeu filtré, et la liste revient vide alors que des résultats existent.
   */
  test('filtrer depuis la page 2 ne laisse pas une page hors du jeu filtré',
    async ({ page, request }) => {
      const seances = Array.from({ length: 21 }, (_, i) => ({
        type: i === 0 ? 'RECUPERATION' : 'ENDURANCE',
        distanceKm: 5,
        dureeMinutes: 30,
        jours: 2 + i * 2
      }));
      await compteAvecSeances(request, page, seances);
      await expect(page.locator('.seance')).toHaveCount(20, { timeout: 20_000 });

      await page.getByRole('button', { name: 'Page suivante' }).click();
        await expect(page.locator('.seance')).toHaveCount(1);

      // Une seule séance porte ce type : elle ne peut être que sur la page 1
      await choisirDansSelect(page, 'filtreType', 'Récupération');
        await expect(page.locator('.seance')).toHaveCount(1);
    });

  test('« Réinitialiser » n apparaît qu avec un filtre actif et les efface tous',
    async ({ page, request }) => {
      await compteAvecSeances(request, page, [
        { type: 'ENDURANCE', distanceKm: 10, dureeMinutes: 55, jours: 3 },
        { type: 'FRACTIONNE', distanceKm: 8, dureeMinutes: 40, jours: 10 }
      ]);
      await expect(page.locator('.seance')).toHaveCount(2, { timeout: 15_000 });

      const reinitialiser = page.getByRole('button', { name: 'Réinitialiser' });
      await expect(reinitialiser).toHaveCount(0);

      await choisirDansSelect(page, 'filtreType', 'Fractionné');
        await expect(page.locator('.seance')).toHaveCount(1);
      await expect(reinitialiser).toBeVisible();

      await reinitialiser.click();
        await expect(page.locator('.seance')).toHaveCount(2);
      await expect(reinitialiser).toHaveCount(0);
    });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ FILTRER DEPUIS LA PAGE 2 NE DOIT PAS VIDER L'ÉCRAN                  │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Défaut signalé en usage — « les filtres ne fonctionnent pas ». Ils
   * fonctionnaient : depuis la page 2, choisir un type envoyait
   * `page=1&type=…`. Les résultats filtrés tenant sur une seule page, la
   * page 1 était VIDE, et l'écran se vidait sans un mot.
   *
   * Un numéro de page n'a de sens que RELATIVEMENT à un jeu de résultats :
   * changer le critère invalide la position.
   *
   * ⚠️ Le test vérifie AUSSI que la pagination marche toujours (page 2 = 5
   * séances) : la première correction cassait la navigation, l'émission
   * initiale des filtres remettant la page à zéro juste après le clic.
   */
  test('filtrer depuis la page 2 revient à la première page', async ({ page, request }) => {
    const compte = await creerCompte(request);
    for (let i = 1; i <= 25; i++) {
      await creerSeance(request, compte.token, {
        type: i % 2 ? 'ENDURANCE' : 'FRACTIONNE',
        distanceKm: 3, dureeMinutes: 25, dateHeure: ilYA(i, '08:00'), ville: 'Lille'
      });
    }
    await seConnecter(page, compte);
    await expect(page.locator('.seance')).toHaveCount(20, { timeout: 25_000 });

    // La pagination fonctionne : 25 séances, 5 sur la seconde page
    await page.getByLabel('Page suivante').click();
    await expect(page.locator('.seance')).toHaveCount(5, { timeout: 15_000 });

    // On filtre DEPUIS cette seconde page : 12 fractionnés, tous sur une page
    await page.locator('#filtreType').click();
    await page.getByRole('option', { name: 'Fractionné' }).click();
    await expect(page.locator('.seance')).toHaveCount(12, { timeout: 15_000 });
  });

  /**
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ CHOISIR COMBIEN DE SÉANCES PAR PAGE                                 │
   * └─────────────────────────────────────────────────────────────────────┘
   *
   * Le carnet était figé à vingt par page, sans moyen d'en voir plus ni même
   * de savoir combien il en existait au total.
   *
   * ⚠️ Le test élargit DEPUIS la page 2 : passer à 50 en conservant le numéro
   * de page demanderait les séances 100 à 150 d'un jeu qui n'en compte plus
   * qu'une seule page, et l'écran reviendrait vide — le même défaut que le
   * filtrage depuis la page 2.
   */
  test('le nombre de séances par page se choisit', async ({ page, request }) => {
    const compte = await creerCompte(request);
    for (let i = 1; i <= 25; i++) {
      await creerSeance(request, compte.token, {
        type: 'ENDURANCE', distanceKm: 3, dureeMinutes: 25,
        dateHeure: ilYA(i, '08:00'), ville: 'Lille'
      });
    }
    await seConnecter(page, compte);
    await expect(page.locator('.seance')).toHaveCount(20, { timeout: 25_000 });

    const rapport = page.locator('.p-paginator-current');
    await expect(rapport).toHaveText('1 à 20 sur 25 séance(s)');

    await page.getByLabel('Page suivante').click();
    await expect(rapport).toHaveText('21 à 25 sur 25 séance(s)', { timeout: 15_000 });

    // On élargit depuis la page 2 : retour à la première, tout tient dessus
    await page.locator('.p-paginator-rpp-dropdown').click();
    await page.getByRole('option', { name: '50' }).click();
    await expect(page.locator('.seance')).toHaveCount(25, { timeout: 15_000 });
    await expect(rapport).toHaveText('1 à 25 sur 25 séance(s)');
  });
});
