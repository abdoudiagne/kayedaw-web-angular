import { TypeSeance } from './seance.model';

/**
 * Miroir des enums Kotlin `Theme` et `Langue` (paquet `user`).
 * SYSTEME n'est pas une absence de choix : c'est le choix de suivre l'OS.
 */
export type Theme = 'SYSTEME' | 'CLAIR' | 'SOMBRE';
export type Langue = 'FR' | 'EN';

export const THEMES = [
  { valeur: 'SYSTEME', libelle: 'Automatique (système)' },
  { valeur: 'CLAIR', libelle: 'Clair' },
  { valeur: 'SOMBRE', libelle: 'Sombre' }
] as const satisfies ReadonlyArray<{ valeur: Theme; libelle: string }>;

export const LANGUES = [
  { valeur: 'FR', libelle: 'Français' },
  { valeur: 'EN', libelle: 'English' }
] as const satisfies ReadonlyArray<{ valeur: Langue; libelle: string }>;

/** Valeurs pré-remplies dans le formulaire de séance pour un type donné. */
export interface DefautSeance {
  readonly type: TypeSeance;
  readonly distanceKm: number;
  readonly dureeMinutes: number;
}

/**
 * ⚠️ `seances` contient TOUJOURS les cinq types, même pour un compte neuf :
 * le serveur complète avec ses valeurs d'usine. L'écran n'a donc jamais à
 * inventer de repli, et un type ajouté côté serveur apparaît tout seul.
 */
export interface Preferences {
  readonly theme: Theme;
  readonly langue: Langue;
  readonly seances: readonly DefautSeance[];
}
