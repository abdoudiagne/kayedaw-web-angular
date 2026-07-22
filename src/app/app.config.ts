import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import Aura from '@primeng/themes/aura';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { erreurInterceptor } from './core/interceptors/erreur.interceptor';

/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ LOCALE — Angular ne suit PAS celle du navigateur                          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * `LOCALE_ID` vaut « en-US » par défaut, quelle que soit la langue du système
 * ou l'attribut lang de la page. Sans les deux lignes ci-dessous, `DatePipe`
 * rendait « Wednesday 22 July 2026 » au milieu d'une interface entièrement
 * francophone.
 *
 * Deux gestes, tous deux nécessaires :
 *   - `registerLocaleData` charge les données de la locale (noms de mois et de
 *     jours, séparateurs, premier jour de semaine) ;
 *   - le provider `LOCALE_ID` indique laquelle utiliser.
 *
 * Fournir l'un sans l'autre échoue : le provider seul lève « Missing locale
 * data for the locale fr-FR » à la première date affichée.
 */
registerLocaleData(localeFr, 'fr-FR');

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

    { provide: LOCALE_ID, useValue: 'fr-FR' },

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
    provideHttpClient(withInterceptors([authInterceptor, erreurInterceptor])),

    /**
     * ┌───────────────────────────────────────────────────────────────────────┐
     * │ PRIMENG — thème et animations                                         │
     * └───────────────────────────────────────────────────────────────────────┘
     *
     * `provideAnimationsAsync` plutôt que `provideAnimations` : le moteur
     * d'animation est chargé APRÈS l'amorçage, en différé. PrimeNG en dépend
     * (Toast, Dialog, Select), mais le premier rendu n'a pas à l'attendre.
     *
     * Thème AURA en mode « styled » : PrimeNG génère ses propres variables CSS
     * et les injecte au démarrage — aucun fichier de thème à déclarer dans
     * angular.json.
     *
     * ⚠️ PrimeNG est volontairement figé en 21. La version 22 embarque un
     * vérificateur de licence : sans clé, deux points d'appel injectent un
     * bandeau rouge « Invalid PrimeUI License » dans un shadow root FERMÉ,
     * que le CSS de la page ne peut pas atteindre. Monter de version exige
     * donc une clé PrimeUI, ce n'est plus une simple mise à jour.
     *
     * `darkModeSelector` est réglé sur l'attribut que pose déjà
     * PreferencesService (`data-theme="sombre"` sur <html>). Sans ce réglage,
     * PrimeNG bascule seul sur la classe `.p-dark` et ignore le choix explicite
     * de l'utilisateur : les composants seraient clairs sur une page sombre.
     */
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '[data-theme="sombre"]',
          /*
           * `cssLayer` : les styles PrimeNG sont placés dans une couche CSS
           * nommée, TOUJOURS de priorité inférieure au CSS hors couche. Les
           * quelques règles maison de styles.css l'emportent donc sans avoir à
           * empiler des !important ou des sélecteurs artificiellement lourds.
           */
          cssLayer: { name: 'primeng', order: 'primeng' }
        }
      },
      ripple: false,         // l'onde au clic n'apporte rien sur une app dense
      /*
       * Libellés en français. Sans cela, le paginateur annonce « Previous
       * Page » et les listes « No results found » au milieu d'une interface
       * entièrement francophone — y compris aux lecteurs d'écran, puisque ces
       * chaînes servent d'attributs aria-label.
       */
      translation: {
        emptyMessage: 'Aucun résultat',
        emptyFilterMessage: 'Aucun résultat',
        accept: 'Oui',
        reject: 'Non',
        clear: 'Effacer',
        choose: 'Choisir',
        weak: 'Faible',
        medium: 'Moyen',
        strong: 'Fort',
        passwordPrompt: 'Choisissez un mot de passe',
        // Les libellés du paginateur sont des attributs aria-label, donc sous
        // `aria` et non à la racine : ils ne sont JAMAIS visibles à l'écran,
        // seuls un lecteur d'écran et les tests les voient.
        aria: {
          firstPageLabel: 'Première page',
          lastPageLabel: 'Dernière page',
          nextPageLabel: 'Page suivante',
          prevPageLabel: 'Page précédente',
          previousPageLabel: 'Page précédente',
          rowsPerPageLabel: 'Lignes par page'
        }
      }
    }),

    /**
     * Services PrimeNG fournis à la racine : Toast et ConfirmDialog les
     * exigent au niveau applicatif, pas dans chaque composant qui les déclenche.
     */
    MessageService,
    ConfirmationService
  ]
};
