import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { signal } from '@angular/core';

/**
 * Un guard fonctionnel s'exécute dans un contexte d'injection :
 * on l'invoque via `TestBed.runInInjectionContext`.
 */
describe('authGuard', () => {

  let estConnecte: ReturnType<typeof signal<boolean>>;

  const executer = () => TestBed.runInInjectionContext(
    () => authGuard({} as never, { url: '/seances' } as never)
  );

  beforeEach(() => {
    estConnecte = signal(false);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { estConnecte } },
        { provide: Router, useValue: { createUrlTree: () => ({} as UrlTree) } }
      ]
    });
  });

  it('autorise un utilisateur connecté', () => {
    estConnecte.set(true);
    expect(executer()).toBeTrue();
  });

  it('redirige un utilisateur non connecté', () => {
    estConnecte.set(false);
    expect(executer()).not.toBeTrue();      // renvoie un UrlTree de redirection
  });
});
