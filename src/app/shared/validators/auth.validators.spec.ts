import { FormControl } from '@angular/forms';
import { emailValide, robustesseMotDePasse } from './auth.validators';

describe('Validateurs d authentification', () => {

  describe('emailValide', () => {

    /** Ces cas passaient Validators.email d'Angular : c'est ce qu'on corrige. */
    it('refuse un domaine sans extension', () => {
      expect(emailValide(new FormControl('a@b'))).toEqual({ emailInvalide: true });
      expect(emailValide(new FormControl('abdou@gmail'))).toEqual({ emailInvalide: true });
    });

    it('refuse une extension d une seule lettre', () => {
      expect(emailValide(new FormControl('a@b.c'))).toEqual({ emailInvalide: true });
    });

    it('accepte une adresse normale', () => {
      expect(emailValide(new FormControl('abdou@kayedaw.fr'))).toBeNull();
      expect(emailValide(new FormControl('a.b+tag@sous.domaine.co.uk'))).toBeNull();
    });

    it('tolère les espaces de bord, comme le backend', () => {
      expect(emailValide(new FormControl('  abdou@kayedaw.fr  '))).toBeNull();
    });

    it('laisse passer le vide (rôle de Validators.required)', () => {
      expect(emailValide(new FormControl(''))).toBeNull();
    });
  });

  describe('robustesseMotDePasse', () => {

    it('croît avec la longueur et la variété', () => {
      expect(robustesseMotDePasse('')).toBe(0);
      expect(robustesseMotDePasse('abcdefgh'))
        .toBeLessThan(robustesseMotDePasse('Abcdefgh1!'));
    });

    it('est bornée à 100', () => {
      expect(robustesseMotDePasse('UnTresLongMotDePasse123!@#')).toBe(100);
    });
  });
});
