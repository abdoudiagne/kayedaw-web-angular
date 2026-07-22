import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Pays {
  readonly code: string;
  readonly nom: string;
}

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ RÉFÉRENTIEL DES PAYS                                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * La liste vient de l'API et n'est PAS écrite en dur ici. Le géocodage
 * s'appuie sur le même référentiel côté serveur : deux listes divergentes
 * offriraient des pays sélectionnables pour lesquels aucune ville ne serait
 * trouvable — le pire des cas, puisque rien ne le signalerait.
 *
 * `shareReplay` : 249 entrées immuables, un seul appel pour toute la session.
 * Sans lui, chaque écran portant le champ le rechargerait.
 */
@Injectable({ providedIn: 'root' })
export class PaysService {

  private readonly http = inject(HttpClient);

  private readonly liste$ = this.http.get<readonly Pays[]>('/api/meteo/pays').pipe(
    // Un référentiel indisponible ne doit pas bloquer une inscription : on
    // retombe sur la France, seule valeur qui garantit un géocodage utile.
    catchError(() => of([{ code: 'FR', nom: 'France' }] as readonly Pays[])),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  tous(): Observable<readonly Pays[]> {
    return this.liste$;
  }

  /** Les noms seuls : c'est le NOM qui est stocké et affiché, pas le code. */
  noms(): Observable<readonly string[]> {
    return this.liste$.pipe(map(liste => liste.map(p => p.nom)));
  }
}
