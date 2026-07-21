import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ConditionsMeteo } from '../models/seance.model';

@Injectable({ providedIn: 'root' })
export class MeteoService {

  private readonly http = inject(HttpClient);

  /**
   * L'API renvoie 204 (corps vide) si le service externe est indisponible ou
   * la ville inconnue. On modélise donc explicitement `null` en sortie.
   *
   * `catchError` avec `of(null)` : la météo est un CONFORT, une panne ne doit
   * jamais casser l'écran. Même philosophie que le repli côté backend.
   */
  /**
   * Conditions à un instant précis (`2026-07-26T18:30`).
   *
   * On envoie l'HEURE et pas seulement le jour : c'est tout l'intérêt de
   * l'aperçu pour planifier — 7 h et 18 h n'ont ni la même température ni
   * le même vent, et c'est justement ce qui fait choisir un créneau.
   */
  conditions(ville: string, dateHeure: string): Observable<ConditionsMeteo | null> {
    const params = new HttpParams().set('ville', ville).set('dateHeure', dateHeure);

    return this.http.get<ConditionsMeteo | null>('/api/meteo/conditions', { params })
      .pipe(catchError(() => of(null)));
  }
}
