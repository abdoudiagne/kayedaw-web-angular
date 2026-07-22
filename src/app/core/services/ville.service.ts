import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SuggestionVille } from '../models/seance.model';

/**
 * Comparaison tolérante de deux noms de lieu : casse, accents et ponctuation
 * ignorés. « Saint Louis » saisi à la main doit reconnaître « Saint-Louis »
 * renvoyé par le géocodeur, et « thies » doit reconnaître « Thiès » — sinon la
 * validation punirait une frappe parfaitement compréhensible.
 */
export function memeVille(a: string, b: string): boolean {
  const normaliser = (valeur: string) => valeur
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');                          // tirets, apostrophes, espaces
  return normaliser(a) === normaliser(b);
}

/**
 * Autocomplétion des villes.
 *
 * On passe par NOTRE API plutôt que d'appeler le géocodeur depuis le
 * navigateur : le service tiers reste hors de portée du client, et l'API
 * pourra y ajouter un cache ou un quota sans toucher au front.
 */
@Injectable({ providedIn: 'root' })
export class VilleService {

  private readonly http = inject(HttpClient);

  /**
   * `pays` restreint les suggestions au pays du compte. Optionnel : l'écran
   * d'inscription appelle avant toute session, et retombe alors sur la France.
   */
  rechercher(terme: string, pays?: string): Observable<readonly SuggestionVille[]> {
    if (terme.trim().length < 2) {
      return of([]);                    // pas d'appel réseau sur une lettre
    }

    const params = new HttpParams().set('q', terme.trim());

    return this.http
      .get<readonly SuggestionVille[]>('/api/meteo/villes', {
        params: pays ? params.set('pays', pays) : params
      })
      // Une autocomplétion en panne ne doit pas casser la saisie : on rend
      // une liste vide, l'utilisateur tape la ville à la main.
      .pipe(catchError(() => of([])));
  }

  /**
   * ┌───────────────────────────────────────────────────────────────────────┐
   * │ La ville existe-t-elle DANS CE PAYS ?                                 │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * Distincte de `rechercher()` sur un point qui décide de tout : celle-ci
   * **ne masque pas la panne**. `rechercher` renvoie une liste vide aussi bien
   * pour « aucune ville de ce nom » que pour « service injoignable » — s'en
   * servir pour valider transformerait une indisponibilité du géocodeur en
   * erreur de saisie, et bloquerait l'enregistrement d'une ville pourtant
   * juste. Un tiers en panne ne doit jamais faire ça.
   *
   * D'où le triple état :
   *   - `true`  la ville est connue du pays ;
   *   - `false` elle ne l'est pas — « Dakar » en France ;
   *   - `null`  on n'en sait rien, le service n'a pas répondu. L'appelant
   *             s'abstient alors de conclure.
   */
  existe(ville: string, pays: string): Observable<boolean | null> {
    const terme = ville.trim();
    if (terme.length < 2) {
      return of(null);                  // trop court pour interroger quoi que ce soit
    }

    const params = new HttpParams().set('q', terme).set('pays', pays);

    return this.http
      .get<readonly SuggestionVille[]>('/api/meteo/villes', { params })
      .pipe(
        map(resultats => resultats.some(suggestion => memeVille(suggestion.nom, terme))),
        catchError(() => of(null))
      );
  }
}
