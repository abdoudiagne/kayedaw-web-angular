import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VALIDATION D'EMAIL — pourquoi ne pas utiliser Validators.email ?        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * `Validators.email` d'Angular accepte « a@b » : ni point, ni extension.
 * Or la faute de frappe la plus fréquente est justement le domaine incomplet
 * (« abdou@gmail » au lieu de « abdou@gmail.com »), et elle passait la
 * validation front pour n'être rejetée qu'au retour serveur.
 *
 * Ce motif est le MIROIR EXACT de MOTIF_EMAIL côté Kotlin : les deux doivent
 * rester alignés, sinon le front accepte ce que le backend refuse.
 *
 * On reste volontairement permissif au-delà : valider un email par expression
 * régulière au sens strict de la RFC 5322 est un piège classique, seule
 * l'envoi d'un message de confirmation prouve qu'une adresse existe.
 */
export const MOTIF_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const emailValide: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valeur = (control.value as string | null)?.trim();
  if (!valeur) {
    return null;                       // Validators.required s'en charge
  }
  return MOTIF_EMAIL.test(valeur) ? null : { emailInvalide: true };
};

/**
 * Robustesse indicative d'un mot de passe : longueur + variété de caractères.
 * Jamais bloquante — seule la longueur minimale l'est, côté backend aussi.
 */
export function robustesseMotDePasse(valeur: string): number {
  if (!valeur) {
    return 0;
  }

  let score = Math.min(valeur.length / 12, 1) * 55;
  if (/[A-Z]/.test(valeur)) { score += 15; }
  if (/[0-9]/.test(valeur)) { score += 15; }
  if (/[^A-Za-z0-9]/.test(valeur)) { score += 15; }

  return Math.round(Math.min(score, 100));
}

/**
 * Refuse les mots de passe les plus courants.
 *
 * Une longueur minimale seule laisse passer « 12345678 » ou « motdepasse » :
 * ce sont les premiers essais de toute attaque par dictionnaire.
 */
const TROP_COURANTS = [
  'motdepasse', 'password', '12345678', '123456789', 'azertyui', 'qwertyui',
  'abcdefgh', 'iloveyou', 'sunshine', 'princess', 'football', 'motdepasse1'
];

export const motDePasseNonTrivial: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valeur = (control.value as string | null)?.toLowerCase();
  if (!valeur) {
    return null;
  }
  return TROP_COURANTS.includes(valeur) ? { motDePasseTropCourant: true } : null;
};
