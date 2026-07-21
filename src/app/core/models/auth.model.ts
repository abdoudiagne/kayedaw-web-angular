export interface InscriptionRequest {
  email: string;
  motDePasse: string;
  nom: string;
  /** Obligatoire : elle conditionne l'aperçu météo dès la planification. */
  villeParDefaut: string;
}

export interface ConnexionRequest {
  email: string;
  motDePasse: string;
}

export interface AuthResponse {
  readonly token: string;
  readonly typeToken: string;
  readonly expireDansMs: number;
  readonly email: string;
  readonly nom: string;
  readonly role: Role;
  readonly villeParDefaut: string;
}

export type Role = 'USER' | 'ADMIN';

/** Utilisateur tel que conservé côté front (jamais le mot de passe). */
export interface Utilisateur {
  readonly email: string;
  readonly nom: string;
  readonly role: Role;
  readonly villeParDefaut: string;
}
