import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

/** Même remarque que authGuard : confort d'affichage, pas sécurité. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estAdmin()) {
    return true;
  }

  inject(NotificationService).erreur('Accès réservé aux administrateurs.');
  return router.createUrlTree(['/seances']);
};
