import { FormControl, FormGroup } from '@angular/forms';
import { allurePlausible, dansHorizonDePlanification, HORIZON_PLANIFICATION_JOURS }
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
      const erreur = dansHorizonDePlanification(new FormControl(dansNJours(30)));
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
});
