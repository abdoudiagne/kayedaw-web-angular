import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChangerMotDePasseRequest, Profil } from '../models/profil.model';

@Injectable({ providedIn: 'root' })
export class ProfilService {

  private readonly http = inject(HttpClient);
  private readonly base = '/api/profil';

  profil(): Observable<Profil> {
    return this.http.get<Profil>(this.base);
  }

  modifierProfil(nom: string, villeParDefaut: string, pays: string): Observable<Profil> {
    return this.http.put<Profil>(this.base, { nom, villeParDefaut, pays });
  }

  /**
   * 204 en cas de succès, 422 si le mot de passe actuel est faux.
   * On garde le 422 non traité ici : c'est au composant d'afficher le détail
   * sous le bon champ, comme pour les refus métier des séances.
   */
  changerMotDePasse(requete: ChangerMotDePasseRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/mot-de-passe`, requete);
  }
}
