import { FormControl, FormGroup } from '@angular/forms';
import { allurePlausible, dansHorizonDePlanification, HORIZON_PLANIFICATION_JOURS, villeRequise }
  from './seance.validators';

describe('Validateurs de séance', () => {

  describe('dansHorizonDePlanification', () => {

    /** Format du champ datetime-local : `2026-07-20T18:30`. */
    const dansNJours = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 16);

    it('accepte une séance passée', () => {
      expect(dansHorizonDePlanification(new FormControl(dansNJours(-1)))).toBeNull();
    });

    it('accepte une séance planifiée dans l horizon', () => {
      expect(dansHorizonDePlanification(new FormControl(dansNJours(7)))).toBeNull();
    });

    it('refuse une planification au-delà de l horizon', () => {
      // Décalage DÉRIVÉ de la constante, jamais écrit en dur : la valeur 30
      // codée ici est devenue la borne exacte le jour où l'horizon est passé
      // de 14 à 30 jours, et le test échouait sur son propre littéral.
      const erreur = dansHorizonDePlanification(
        new FormControl(dansNJours(HORIZON_PLANIFICATION_JOURS + 5)));
      expect(erreur?.['dateTropLointaine'].horizonJours).toBe(HORIZON_PLANIFICATION_JOURS);
    });

    it('refuse une date illisible', () => {
      expect(dansHorizonDePlanification(new FormControl('pas-une-date'))).toEqual({ dateInvalide: true });
    });

    it('laisse passer une valeur vide (rôle de Validators.required)', () => {
      expect(dansHorizonDePlanification(new FormControl(''))).toBeNull();
    });
  });

  describe('allurePlausible', () => {

    const groupe = (distanceKm: number, dureeMinutes: number) =>
      new FormGroup({
        distanceKm: new FormControl(distanceKm),
        dureeMinutes: new FormControl(dureeMinutes)
      });

    it('accepte une allure réaliste', () => {
      expect(allurePlausible(groupe(10, 50))).toBeNull();    // 5 min/km
    });

    it('refuse une allure trop rapide', () => {
      const erreur = allurePlausible(groupe(10, 15));        // 1,5 min/km
      expect(erreur?.['allureIrrealiste'].raison).toBe('trop rapide');
    });

    it('refuse une allure trop lente', () => {
      const erreur = allurePlausible(groupe(1, 30));         // 30 min/km
      expect(erreur?.['allureIrrealiste'].raison).toBe('trop lente');
    });

    it('ne valide rien tant que les champs sont vides', () => {
      expect(allurePlausible(groupe(0, 0))).toBeNull();
    });
  });

  describe('villeRequise', () => {

    it('accepte une ville saisie', () => {
      expect(villeRequise(new FormControl('Lille'))).toBeNull();
    });

    it('refuse un champ vide', () => {
      expect(villeRequise(new FormControl(''))).toEqual({ villeRequise: true });
    });

    /*
     * LE cas qui justifie ce validateur : Validators.required laisse passer des
     * espaces. Ils atteindraient le géocodeur, ne désigneraient aucun lieu, et
     * la séance serait enregistrée sans météo — définitivement, puisque le
     * champ ville n'existe pas à la modification.
     */
    it('refuse une saisie faite uniquement d espaces', () => {
      expect(villeRequise(new FormControl('   '))).toEqual({ villeRequise: true });
    });

    it('refuse un contrôle nul', () => {
      expect(villeRequise(new FormControl(null))).toEqual({ villeRequise: true });
    });

    /*
     * p-autoComplete écrit l'OBJET suggestion dans le contrôle le temps d'un
     * tour, avant que le composant n'y remette le nom. Le validateur doit le
     * traverser sans lever : une exception ici laisse le formulaire dans un
     * état incohérent, sur une valeur pourtant parfaitement valide.
     */
    it('traverse l objet suggestion écrit par p-autoComplete sans lever', () => {
      const suggestion = { nom: 'Thiès', departement: null, latitude: 14.8, longitude: -16.9 };
      expect(() => villeRequise(new FormControl(suggestion))).not.toThrow();
      expect(villeRequise(new FormControl(suggestion))).toBeNull();
    });
  });

});
