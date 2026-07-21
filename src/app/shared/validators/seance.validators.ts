import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VALIDATEURS PERSONNALISÉS                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Un validateur retourne `null` si tout va bien, ou un objet d'erreurs.
 * Convention : la clé identifie l'erreur, la valeur porte le contexte utile
 * à l'affichage du message.
 *
 * Ces règles DOUBLENT celles du backend — c'est volontaire : le front donne
 * un retour immédiat, le backend reste la seule autorité. On ne remplace
 * jamais une validation serveur par une validation client.
 */

/** Horizon de planification, en jours — doit rester aligné sur le backend. */
export const HORIZON_PLANIFICATION_JOURS = 14;

/**
 * La séance peut être PLANIFIÉE, mais pas indéfiniment : au-delà de l'horizon,
 * aucune prévision météo n'est fiable et le plan perd son sens.
 *
 * Remplace l'ancien `pasDansLeFutur` : le futur proche est désormais légitime.
 */
export const dansHorizonDePlanification: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  if (!control.value) {
    return null;                        // @required s'en charge
  }

  const saisie = new Date(control.value as string);
  if (Number.isNaN(saisie.getTime())) {
    return { dateInvalide: true };
  }

  const limite = new Date();
  limite.setDate(limite.getDate() + HORIZON_PLANIFICATION_JOURS);

  return saisie > limite
    ? { dateTropLointaine: { horizonJours: HORIZON_PLANIFICATION_JOURS } }
    : null;
};

/** Allure plausible : entre 2 et 20 min/km. Validateur de GROUPE. */
export const allurePlausible: ValidatorFn = (groupe: AbstractControl): ValidationErrors | null => {
  const distance = groupe.get('distanceKm')?.value as number | null;
  const duree = groupe.get('dureeMinutes')?.value as number | null;

  if (!distance || !duree || distance <= 0) {
    return null;
  }

  const allure = duree / distance;
  if (allure < 2) {
    return { allureIrrealiste: { allure, raison: 'trop rapide' } };
  }
  if (allure > 20) {
    return { allureIrrealiste: { allure, raison: 'trop lente' } };
  }
  return null;
};
