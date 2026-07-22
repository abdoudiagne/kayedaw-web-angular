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
  /** Faux si un administrateur a bloqué le compte. Réversible, contrairement
      à la suppression : les séances et l'historique sont conservés. */
  readonly actif: boolean;
  /** Présent dans la liste parce que l'écran d'administration l'ÉDITE : sans
      lui, le dialogue s'ouvrait sur une ville vide. */
  readonly villeParDefaut: string;
  readonly pays: string;
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

/** Un compte que la suppression en masse a refusé, avec sa raison. */
export interface RefusSuppression {
  readonly id: number;
  readonly motif: string;
  readonly detail: string;
}

/**
 * Compte rendu d'une suppression en masse.
 *
 * Le serveur répond 200 et non 204 : le résultat est PARTIEL par nature —
 * certains comptes du lot peuvent être refusés (soi-même, dernier
 * administrateur) pendant que les autres partent. Un code d'état unique ne
 * saurait pas exprimer cela, et l'écran doit pouvoir le dire.
 */
export interface RapportSuppression {
  readonly supprimes: readonly number[];
  readonly refuses: readonly RefusSuppression[];
}
