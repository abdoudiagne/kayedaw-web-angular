export interface InscriptionRequest {
  email: string;
  motDePasse: string;
  nom: string;
  /** Optionnel côté serveur : « France » si absent. */
  pays?: string;
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
  /**
   * ⚠️ Le pays voyage AVEC la ville, et il ne le faisait pas.
   *
   * Le serveur ne renvoyait que `villeParDefaut` : le client retombait sur son
   * repli « France » et le formulaire de séance s'ouvrait sur « Dakar, France »
   * pour un compte sénégalais — un lieu introuvable, donc sans suggestions ni
   * météo, alors que le profil était juste.
   *
   * Le champ est requis : le serveur le renvoie toujours. `AuthService` garde
   * malgré tout un repli à l'exécution, pour une session restaurée depuis un
   * `localStorage` écrit avant ce correctif.
   */
  readonly pays: string;
}

export type Role = 'USER' | 'ADMIN';

/**
 * Le rôle est une constante de sécurité, pas un mot d'interface : « USER »
 * s'affichait tel quel sur /profil et /administration, seuls écrans en
 * majuscules non traduites de toute l'application.
 */
export const LIBELLES_ROLE: Readonly<Record<Role, string>> = {
  USER: 'Membre',
  ADMIN: 'Administrateur'
};

/** Utilisateur tel que conservé côté front (jamais le mot de passe). */
export interface Utilisateur {
  readonly email: string;
  readonly nom: string;
  readonly role: Role;
  readonly villeParDefaut: string;
  /** Pays de résidence : il borne le géocodage des villes. */
  readonly pays: string;
}
