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

/** Horizon de planification, en jours — doit rester aligné sur le backend
    (`kayedaw.entrainement.planification-max-jours` dans application.yml). */
export const HORIZON_PLANIFICATION_JOURS = 30;

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Dernier jour où une PRÉVISION existe réellement — 14, pas 15            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * À ne pas confondre avec `HORIZON_PLANIFICATION_JOURS` (30) : celui-ci est
 * notre règle métier — jusqu'où l'on autorise à POSER une séance — tandis que
 * celui-là est une limite d'Open-Meteo, que nous ne choisissons pas. Entre les
 * deux, une séance est parfaitement valide mais revient sans météo. C'est
 * légitime, et c'est pourquoi l'écran doit le DIRE : un encart vide sans
 * explication se lit comme une panne.
 *
 * ⚠️ La valeur était 15, et c'était FAUX d'un jour. Mesuré sur l'API :
 *
 *   J+14 → 32,0 °C
 *   J+15 → requête ACCEPTÉE, mais aucune valeur (la plage annoncée s'arrête là)
 *   J+16 → refusée, « Parameter 'start_date' is out of allowed range »
 *
 * Une séance posée à J+15 échappait donc à l'avertissement tout en ne recevant
 * aucune mesure : exactement le cas que cet avertissement existe pour couvrir.
 * La borne est le dernier jour qui porte une VALEUR, pas le dernier que l'API
 * accepte sans broncher.
 */
export const PORTEE_PREVISION_JOURS = 14;

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

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ La ville est OBLIGATOIRE à la création — et pourquoi elle seule          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Elle l'est pour une raison qu'aucun autre champ ne partage : c'est la SEULE
 * donnée qu'on ne peut plus corriger après coup. La météo est résolue puis
 * stockée au moment de l'enregistrement, et l'écran de modification n'offre
 * même pas le champ ville. Une séance créée sans lieu reste donc
 * définitivement sans température, sans vent et sans pluie — alors qu'une
 * distance fautive se rectifie en dix secondes.
 *
 * `Validators.required` ne suffit pas : il n'écarte que la chaîne vide. Trois
 * espaces la franchissent, partent au géocodeur, ne correspondent à aucun lieu,
 * et la séance revient sans météo — exactement le cas que cette règle existe
 * pour empêcher, mais en silence.
 */
export const villeRequise: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  /*
   * ⚠️ Le contrôle n'est pas toujours une chaîne, malgré son type.
   *
   * `p-autoComplete` écrit brièvement l'OBJET suggestion avant que le composant
   * n'y remette le nom. Un validateur qui suppose une chaîne lèverait sur cette
   * émission, et une exception dans un validateur laisse le formulaire dans un
   * état incohérent. Un objet n'est de toute façon pas vide : la règle est
   * satisfaite, on sort avant le `.trim()`.
   */
  const valeur = control.value;
  if (valeur !== null && valeur !== undefined && typeof valeur !== 'string') {
    return null;
  }
  return (valeur ?? '').trim().length === 0 ? { villeRequise: true } : null;
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
