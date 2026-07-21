import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from '../services/notification.service';
import { AuthService } from '../services/auth.service';

/**
 * Traduit les erreurs HTTP en comportements applicatifs cohérents.
 * Les statuts correspondent exactement au @RestControllerAdvice du backend.
 *
 * On RELANCE toujours l'erreur (`throwError`) : l'intercepteur gère l'effet
 * transverse, mais le composant doit rester libre de réagir spécifiquement
 * (par exemple afficher un message sous un champ de formulaire).
 */
export const erreurInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((erreur: HttpErrorResponse) => {
      switch (erreur.status) {
        case 0:
          notifications.erreur('Serveur injoignable — vérifiez votre connexion.');
          break;

        case 401:
          // Jeton absent, invalide ou expiré : on nettoie la session
          if (!req.url.includes('/api/auth/')) {
            auth.deconnecter(false);
            void router.navigate(['/connexion'], {
              queryParams: { redirige: router.url }   // on revient où on était
            });
            notifications.erreur('Session expirée, merci de vous reconnecter.');
          }
          break;

        case 403:
          notifications.erreur("Vous n'avez pas accès à cette ressource.");
          break;

        case 422:
          // Règle métier : le composant affiche le détail, pas l'intercepteur
          break;

        case 500:
          notifications.erreur('Une erreur technique est survenue.');
          break;
      }

      return throwError(() => erreur);
    })
  );
};
