import { Role } from './auth.model';

/**
 * Miroir du `data class UtilisateurResume` de AdminController.
 * Le mot de passe n'apparaît évidemment nulle part : le backend expose un
 * DTO de projection, jamais l'entité JPA.
 */
export interface UtilisateurResume {
  readonly id: number;
  readonly email: string;
  readonly nom: string;
  readonly role: Role;
}

/**
 * `GET /api/admin/metriques` renvoie une Map Kotlin, donc un objet libre.
 * On le retype ici en interface plutôt que de laisser un `any` se propager :
 * c'est la frontière où l'on redonne un type à une donnée non structurée.
 */
export interface Metriques {
  readonly totalRequetes: number;
  readonly parRoute: Readonly<Record<string, number>>;
}
