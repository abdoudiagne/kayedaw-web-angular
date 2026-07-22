import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { DefautSeance, Langue, Preferences, Theme } from '../models/preferences.model';
import { TypeSeance } from '../models/seance.model';
import { TraductionService } from './traduction.service';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PRÉFÉRENCES UTILISATEUR — état partagé                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Même forme que AuthService : un signal privé en écriture, exposé en lecture
 * seule, plus des dérivations `computed`. Trois écrans les consomment — le
 * profil les édite, le formulaire de séance les lit, la coquille applique le
 * thème et la langue — donc l'état ne peut pas vivre dans un composant.
 *
 * Le thème est appliqué IMMÉDIATEMENT à l'écriture, sans attendre la réponse
 * du serveur : c'est un réglage d'affichage, un aller-retour réseau avant de
 * voir le résultat le ferait paraître cassé.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {

  private readonly http = inject(HttpClient);
  private readonly traduction = inject(TraductionService);
  private readonly base = '/api/profil/preferences';

  /**
   * Clé de rappel local du thème.
   *
   * ⚠️ Le serveur reste l'autorité — mais il répond en ~100 ms, et pendant ce
   * temps la page s'affiche. Sans mémoire locale, un utilisateur en thème
   * sombre forcé voyait un flash blanc à chaque chargement. On rejoue donc le
   * dernier thème connu dès l'amorçage, puis le serveur confirme ou corrige.
   */
  private static readonly CLE_THEME = 'kayedaw.theme';

  private readonly _preferences = signal<Preferences | undefined>(undefined);
  readonly preferences = this._preferences.asReadonly();

  /** Indexé par type : c'est ainsi que le formulaire de séance l'interroge. */
  readonly defautsParType = computed(() => {
    const carte = new Map<TypeSeance, DefautSeance>();
    for (const defaut of this._preferences()?.seances ?? []) {
      carte.set(defaut.type, defaut);
    }
    return carte;
  });

  constructor() {
    this.appliquerTheme(this.themeMemorise());
  }

  /**
   * Chargé après la connexion. L'échec est absorbé : des préférences
   * indisponibles ne doivent pas empêcher d'utiliser l'application, le
   * formulaire retombe simplement sur ses champs vides.
   */
  charger(): Observable<Preferences | undefined> {
    return this.http.get<Preferences>(this.base).pipe(
      tap(preferences => this.appliquer(preferences)),
      catchError(() => of(undefined))
    );
  }

  enregistrer(preferences: Preferences): Observable<Preferences> {
    // Application optimiste du thème : voir le commentaire de classe.
    this.appliquerTheme(preferences.theme);
    return this.http.put<Preferences>(this.base, preferences).pipe(
      tap(enregistrees => this.appliquer(enregistrees))
    );
  }

  /**
   * Applique un thème SANS l'enregistrer : l'écran de profil s'en sert pour
   * que la vignette cliquée se voie immédiatement, avant même que la requête
   * ne parte. Un aperçu qui attend le réseau n'est pas un aperçu.
   */
  previsualiserTheme(theme: Theme): void {
    this.appliquerTheme(theme);
  }

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ Choix du thème depuis l'EN-TÊTE — donc parfois sans compte            │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Distinct de `previsualiserTheme`, qui n'écrit rien : le réglage de
   * l'en-tête doit survivre à un rechargement même pour un VISITEUR, qui n'a
   * aucun compte où le ranger. D'où la mémoire locale.
   *
   * ⚠️ Le service ne persiste PAS au compte lui-même : il faudrait injecter
   * `AuthService`, qui l'appelle déjà à la déconnexion — le cycle serait
   * immédiat. C'est donc l'appelant, qui connaît la session, qui enchaîne.
   */
  choisirThemeLocalement(theme: Theme): void {
    this.appliquerTheme(theme);
    localStorage.setItem(PreferencesService.CLE_THEME, theme);
  }

  /** Le thème effectivement retenu, mémoire locale comprise. */
  themeChoisi(): Theme {
    return this._preferences()?.theme ?? this.themeMemorise();
  }

  /**
   * Range un réglage de l'en-tête dans le COMPTE, s'il y en a un.
   *
   * ⚠️ Silencieux à dessein, sur les deux plans. D'abord il ne fait rien sans
   * préférences chargées : un visiteur n'a pas de compte, et l'absence de
   * session se reconnaît ici sans injecter `AuthService` — qui appelle déjà ce
   * service à la déconnexion, et créerait un cycle.
   *
   * Ensuite il absorbe l'échec : le réglage est DÉJÀ appliqué et mémorisé
   * localement quand cet appel part. Une notification d'erreur apprendrait à
   * l'utilisateur que quelque chose a raté sur un geste qui, à l'écran, a
   * parfaitement fonctionné.
   */
  persisterAuCompteSiConnecte(modification: { theme?: Theme; langue?: Langue }): void {
    const courantes = this._preferences();
    if (!courantes) {
      return;
    }
    const misesAJour: Preferences = { ...courantes, ...modification };
    this._preferences.set(misesAJour);
    this.http.put<Preferences>(this.base, misesAJour).subscribe({
      error: () => { /* réglage déjà appliqué : un échec ne se rattrape pas ici */ }
    });
  }

  /**
   * À la déconnexion : les préférences du COMPTE ne survivent pas à sa session.
   *
   * ⚠️ La mémoire locale, elle, est CONSERVÉE — et ce n'était pas le cas.
   * `oublier()` effaçait la clé du navigateur et forçait « SYSTEME ». Or
   * l'effet d'`app.component` l'appelle à chaque rendu sans session, donc à
   * CHAQUE chargement de page pour un visiteur : le thème choisi dans
   * l'en-tête était appliqué, mémorisé… puis effacé au rechargement suivant.
   * Le réglage semblait ne pas tenir, sans que rien ne l'explique.
   *
   * Un thème n'est pas une donnée confidentielle : le laisser en place après
   * une déconnexion est sans conséquence, et c'est la seule mémoire dont
   * dispose quelqu'un qui n'a pas de compte.
   */
  oublier(): void {
    this._preferences.set(undefined);
    this.appliquerTheme(this.themeMemorise());
  }

  private appliquer(preferences: Preferences): void {
    this._preferences.set(preferences);
    this.appliquerTheme(preferences.theme);
    localStorage.setItem(PreferencesService.CLE_THEME, preferences.theme);
    this.traduction.appliquer(preferences.langue);
  }

  /**
   * Le thème se pose en attribut sur <html>, pas en classe : styles.css cible
   * `:root[data-theme=...]`, et l'attribut est lisible dans l'inspecteur.
   * SYSTEME RETIRE l'attribut au lieu d'en poser un troisième — c'est
   * l'absence de dérogation qui rend la main à `prefers-color-scheme`.
   */
  /**
   * ⚠️ SYSTEME est RÉSOLU en une valeur concrète, il ne retire plus l'attribut.
   *
   * Auparavant, « Automatique » n'écrivait rien et laissait `prefers-color-scheme`
   * agir seul. Cela marchait pour styles.css — qui porte une requête média —
   * mais PAS pour PrimeNG : son `darkModeSelector` est un SÉLECTEUR CSS, il ne
   * peut pas observer une préférence système. Sur une machine réglée en sombre,
   * la page était sombre et les champs PrimeNG restaient blancs.
   *
   * L'attribut vaut donc toujours « clair » ou « sombre », et l'on suit les
   * changements de réglage système tant que l'utilisateur est en automatique.
   */
  private appliquerTheme(theme: Theme): void {
    this.suivreSysteme?.();
    this.suivreSysteme = undefined;

    if (theme !== 'SYSTEME') {
      this.poser(theme === 'SOMBRE' ? 'sombre' : 'clair');
      return;
    }

    const media = matchMedia('(prefers-color-scheme: dark)');
    const refleter = () => this.poser(media.matches ? 'sombre' : 'clair');
    refleter();
    media.addEventListener('change', refleter);
    // Rendu d'un désabonnement : sans lui, chaque changement de préférence
    // empilerait un écouteur de plus sur le même media query.
    this.suivreSysteme = () => media.removeEventListener('change', refleter);
  }

  private suivreSysteme?: () => void;

  private poser(valeur: 'clair' | 'sombre'): void {
    document.documentElement.setAttribute('data-theme', valeur);
  }

  private themeMemorise(): Theme {
    const valeur = localStorage.getItem(PreferencesService.CLE_THEME);
    return valeur === 'CLAIR' || valeur === 'SOMBRE' ? valeur : 'SYSTEME';
  }
}
