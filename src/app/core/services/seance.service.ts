import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreerSeanceRequest, ModifierSeanceRequest, Page, Records, Seance, Statistiques, TypeSeance
} from '../models/seance.model';

export interface CritereRecherche {
  page: number;
  taille: number;
  tri: string;
  type: TypeSeance | null;
  /** Bornes facultatives, au format ISO `yyyy-MM-dd`. */
  debut?: string | null;
  fin?: string | null;
  /** Cherché dans le commentaire et la ville. */
  recherche?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SeanceService {

  private readonly http = inject(HttpClient);
  private readonly base = '/api/seances';

  /**
   * HttpParams est IMMUABLE : chaque `.set()` retourne une nouvelle instance.
   * Oublier de réaffecter le résultat est une erreur classique — les paramètres
   * sont alors silencieusement perdus.
   */
  lister(critere: CritereRecherche): Observable<Page<Seance>> {
    // HttpParams est IMMUABLE : on réaffecte à chaque `.set()`, sinon les
    // paramètres sont silencieusement perdus.
    let params = new HttpParams()
      .set('page', critere.page)
      .set('size', critere.taille)
      .set('sort', critere.tri);

    // Un critère vide n'est pas envoyé : l'URL reste lisible et le backend
    // traite l'absence de paramètre comme « pas de filtre ».
    if (critere.type) { params = params.set('type', critere.type); }
    if (critere.debut) { params = params.set('debut', critere.debut); }
    if (critere.fin) { params = params.set('fin', critere.fin); }
    if (critere.recherche?.trim()) { params = params.set('recherche', critere.recherche.trim()); }

    return this.http.get<Page<Seance>>(this.base, { params });
  }

  records(): Observable<Records> {
    return this.http.get<Records>(`${this.base}/records`);
  }

  parId(id: number): Observable<Seance> {
    return this.http.get<Seance>(`${this.base}/${id}`);
  }

  creer(requete: CreerSeanceRequest): Observable<Seance> {
    return this.http.post<Seance>(this.base, requete);
  }

  modifier(id: number, requete: ModifierSeanceRequest): Observable<Seance> {
    return this.http.put<Seance>(`${this.base}/${id}`, requete);
  }

  supprimer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  statistiques(debut: string, fin: string): Observable<Statistiques> {
    const params = new HttpParams().set('debut', debut).set('fin', fin);
    return this.http.get<Statistiques>(`${this.base}/statistiques`, { params });
  }

  /**
   * Export PDF du carnet complet.
   *
   * `responseType: 'blob'` : sans cela `HttpClient` tente de lire la réponse
   * en JSON et échoue sur le premier octet du PDF, avec une erreur d'analyse
   * qui ne dit rien du vrai problème.
   */
  exporterPdf(): Observable<Blob> {
    return this.http.get('/api/seances/export.pdf', { responseType: 'blob' });
  }
}
