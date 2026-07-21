import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SuggestionVille } from '../models/seance.model';

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

  rechercher(terme: string): Observable<readonly SuggestionVille[]> {
    if (terme.trim().length < 2) {
      return of([]);                    // pas d'appel réseau sur une lettre
    }

    return this.http
      .get<readonly SuggestionVille[]>('/api/meteo/villes', {
        params: new HttpParams().set('q', terme.trim())
      })
      // Une autocomplétion en panne ne doit pas casser la saisie : on rend
      // une liste vide, l'utilisateur tape la ville à la main.
      .pipe(catchError(() => of([])));
  }
}
