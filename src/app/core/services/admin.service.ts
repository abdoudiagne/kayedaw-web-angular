import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Metriques, RapportSuppression, UtilisateurResume } from '../models/admin.model';
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

  modifierUtilisateur(
    id: number, nom: string, villeParDefaut: string, pays: string
  ): Observable<void> {
    return this.http.patch<void>(`${this.base}/utilisateurs/${id}`, { nom, villeParDefaut, pays });
  }

  /** L'ancien mot de passe n'est pas demandé : un administrateur ne le connaît pas. */
  reinitialiserMotDePasse(id: number, nouveauMotDePasse: string): Observable<void> {
    return this.http.put<void>(
      `${this.base}/utilisateurs/${id}/mot-de-passe`, { nouveauMotDePasse });
  }

  bloquer(id: number, actif: boolean): Observable<void> {
    return this.http.patch<void>(`${this.base}/utilisateurs/${id}/blocage`, { actif });
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

  /**
   * Suppression en masse. `HttpClient.delete` n'accepte un corps que via
   * l'option `body` — la signature ne le prend pas en second argument, à la
   * différence de `post` ou `put`. C'est le piège classique de cet appel.
   */
  supprimerPlusieurs(ids: readonly number[]): Observable<RapportSuppression> {
    return this.http.delete<RapportSuppression>(`${this.base}/utilisateurs`, {
      body: { ids }
    });
  }

  seancesDe(id: number, page = 0, taille = 10): Observable<Page<Seance>> {
    const params = new HttpParams().set('page', page).set('size', taille);
    return this.http.get<Page<Seance>>(`${this.base}/utilisateurs/${id}/seances`, { params });
  }

  /** Export PDF de l'annuaire — le serveur refuse déjà un non-administrateur. */
  exporterPdf(): Observable<Blob> {
    return this.http.get('/api/admin/utilisateurs/export.pdf', { responseType: 'blob' });
  }
}
