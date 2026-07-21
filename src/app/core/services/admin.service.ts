import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Metriques, UtilisateurResume } from '../models/admin.model';
import { Role } from '../models/auth.model';
import { Page, Seance } from '../models/seance.model';

export interface CritereUtilisateurs {
  page: number;
  taille: number;
  tri: string;
  recherche: string;
}

/**
 * Appelle `/api/admin`, protégé côté serveur par la règle d'URL ET par
 * `@PreAuthorize` (défense en profondeur).
 *
 * Rien n'est vérifié ici : un service front ne décide pas d'une autorisation,
 * il subit la réponse du serveur. Un 403 remonte à l'intercepteur d'erreur.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {

  private readonly http = inject(HttpClient);
  private readonly base = '/api/admin';

  utilisateurs(critere: CritereUtilisateurs): Observable<Page<UtilisateurResume>> {
    const params = new HttpParams()
      .set('page', critere.page)
      .set('size', critere.taille)
      .set('sort', critere.tri)
      .set('recherche', critere.recherche);

    return this.http.get<Page<UtilisateurResume>>(`${this.base}/utilisateurs`, { params });
  }

  metriques(): Observable<Metriques> {
    return this.http.get<Metriques>(`${this.base}/metriques`);
  }

  changerRole(id: number, role: Role): Observable<void> {
    return this.http.patch<void>(`${this.base}/utilisateurs/${id}/role`, { role });
  }

  /** ⚠️ Supprime aussi toutes les séances de l'utilisateur. Irréversible. */
  supprimer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/utilisateurs/${id}`);
  }

  seancesDe(id: number, page = 0, taille = 10): Observable<Page<Seance>> {
    const params = new HttpParams().set('page', page).set('size', taille);
    return this.http.get<Page<Seance>>(`${this.base}/utilisateurs/${id}/seances`, { params });
  }
}
