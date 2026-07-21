import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — Qu'est-ce qu'un guard ? Est-ce de la sécurité ?              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Un guard autorise ou refuse une NAVIGATION. `CanActivateFn` est la forme
 * fonctionnelle moderne (Angular 15+), qui remplace la classe CanActivate.
 *
 * ⚠️ RÉPONSE ATTENDUE EN ENTRETIEN : ce n'est PAS de la sécurité.
 * C'est du confort utilisateur — on évite d'afficher un écran vide à
 * quelqu'un qui n'est pas connecté. N'importe qui peut contourner un guard
 * en appelant l'API directement. La VRAIE sécurité est côté serveur :
 * Spring Security, @PreAuthorize, et vérification de propriété des données.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estConnecte()) {
    return true;
  }

  // On mémorise la destination pour y revenir après connexion
  return router.createUrlTree(['/connexion'], {
    queryParams: { redirige: state.url }
  });
};

/** Empêche un utilisateur déjà connecté de revenir sur l'écran de connexion. */
export const invitéGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.estConnecte() ? router.createUrlTree(['/seances']) : true;
};
