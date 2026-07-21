import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { erreurInterceptor } from './core/interceptors/erreur.interceptor';

/**
 * Configuration d'une application standalone : les providers remplacent
 * les `imports` et `providers` de l'ancien AppModule.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    /**
     * `eventCoalescing` : regroupe plusieurs événements en un seul cycle de
     * détection de changement. Gain de performance simple à activer.
     */
    provideZoneChangeDetection({ eventCoalescing: true }),

    /**
     * `withComponentInputBinding` : les paramètres de route sont injectés
     * directement dans les @Input du composant. Plus besoin de s'abonner
     * à ActivatedRoute pour lire un `:id`.
     */
    provideRouter(routes, withComponentInputBinding()),

    /**
     * ORDRE SIGNIFICATIF : les intercepteurs s'exécutent dans l'ordre déclaré
     * à l'aller, et en ordre INVERSE au retour. auth ajoute le jeton en
     * premier, erreur traite donc la réponse en dernier — c'est ce qu'on veut.
     */
    provideHttpClient(withInterceptors([authInterceptor, erreurInterceptor]))
  ]
};
