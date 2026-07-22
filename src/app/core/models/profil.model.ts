import { Role } from './auth.model';

/** Miroir de ProfilResponse — le mot de passe n'y figure évidemment jamais. */
export interface Profil {
  readonly email: string;
  readonly nom: string;
  readonly role: Role;
  readonly villeParDefaut: string;
  /** Pays de résidence, « France » par défaut. Accompagne la ville pour le
      géocodage : « Lille » existe aussi en Belgique et aux États-Unis. */
  readonly pays: string;
  readonly nombreSeances: number;
  readonly distanceTotaleKm: number;
  readonly premiereSeance: string | null;
}

export interface ChangerMotDePasseRequest {
  motDePasseActuel: string;
  nouveauMotDePasse: string;
}
