/**
 * Modèles alignés sur le contrat de l'API Kotlin.
 * On utilise des `interface` (effacées à la compilation, aucun coût runtime)
 * plutôt que des `class`, sauf besoin de comportement.
 */

/** Miroir de l'enum Kotlin TypeSeance. */
export type TypeSeance = 'ENDURANCE' | 'FRACTIONNE' | 'SORTIE_LONGUE' | 'RECUPERATION' | 'MARCHE';

/**
 * `as const` + `satisfies` : on obtient un objet immuable ET typé.
 * Permet d'itérer sur les types dans un <select> sans dupliquer la liste.
 */
export const TYPES_SEANCE = [
  { valeur: 'ENDURANCE', libelle: 'Endurance' },
  { valeur: 'FRACTIONNE', libelle: 'Fractionné' },
  { valeur: 'SORTIE_LONGUE', libelle: 'Sortie longue' },
  { valeur: 'RECUPERATION', libelle: 'Récupération' },
  { valeur: 'MARCHE', libelle: 'Marche à pied' }
] as const satisfies ReadonlyArray<{ valeur: TypeSeance; libelle: string }>;

/**
 * ENDURANCE → « Endurance ».
 *
 * La fonction vit AVEC le modèle et non dans un composant : elle était privée
 * à la liste, si bien que le détail, les statistiques et l'administration
 * affichaient l'enum brut — « SORTIE_LONGUE » sous les yeux de l'utilisateur.
 * Le repli sur la valeur brute couvre un type ajouté côté serveur avant de
 * l'être ici : mieux vaut un libellé laid qu'une cellule vide.
 */
export function libelleType(type: TypeSeance): string {
  return TYPES_SEANCE.find(t => t.valeur === type)?.libelle ?? type;
}

/**
 * Miroir de l'enum Kotlin SourceMeteo. L'utilisateur doit distinguer une
 * OBSERVATION d'une PRÉVISION : les deux n'ont pas la même valeur dans un carnet.
 */
export type SourceMeteo = 'OBSERVATION_METEO_FRANCE' | 'ARCHIVE_OPEN_METEO' | 'PREVISION_OPEN_METEO';

export const LIBELLES_SOURCE: Readonly<Record<SourceMeteo, string>> = {
  OBSERVATION_METEO_FRANCE: 'Observations Météo-France',
  ARCHIVE_OPEN_METEO: 'Réanalyse Open-Meteo',
  PREVISION_OPEN_METEO: 'Prévision Open-Meteo'
};

/**
 * Plafond hebdomadaire, en kilomètres — doit rester aligné sur
 * `kayedaw.entrainement.plafond-hebdo-km` côté backend, qui reste l'autorité.
 */
export const PLAFOND_HEBDO_KM = 80;

export interface Seance {
  readonly id: number;
  readonly type: TypeSeance;
  readonly distanceKm: number;
  readonly dureeMinutes: number;
  /** ISO local `2026-07-20T18:30` — la séance porte une heure précise. */
  readonly dateHeure: string;
  /** Vraie tant que la séance n'a pas eu lieu : elle est alors PLANIFIÉE. */
  readonly estPlanifiee: boolean;
  readonly commentaire: string | null;
  readonly allureMinParKm: number;
  readonly vitesseKmH: number;
  readonly intensite: string;
  readonly ville: string | null;
  /**
   * Pays de la SÉANCE, pas du compte : on ne court pas toujours chez soi, et
   * relire le pays sur le profil prêterait à un compte déménagé des séances
   * qu'il n'a jamais courues là. Nul sur les séances antérieures au champ.
   */
  readonly pays: string | null;
  /** Température MAXIMALE du jour — le nom l'explicite face à `temperatureMinC`. */
  readonly temperatureMaxC: number | null;
  readonly temperatureMinC: number | null;
  /** Température relevée à l'heure exacte de la séance (observations Météo-France). */
  readonly temperatureALHeureC: number | null;
  readonly precipitationMm: number | null;
  readonly ventKmH: number | null;
  /** Pic de particules fines PM2.5, en µg/m³. */
  readonly pm25: number | null;
  /** Provenance : observation officielle, réanalyse, ou prévision. */
  readonly sourceMeteo: SourceMeteo | null;
  readonly stationMeteo: string | null;
  readonly alertesMeteo: readonly string[];
}

export interface CreerSeanceRequest {
  type: TypeSeance;
  distanceKm: number;
  dureeMinutes: number;
  /** ISO local `2026-07-20T18:30`, jusqu'à 30 jours dans le futur. */
  dateHeure: string;
  commentaire?: string | null;
  ville?: string | null;
  /** Absent, le serveur retombe sur le pays du compte. */
  pays?: string | null;
}

export type ModifierSeanceRequest = Omit<CreerSeanceRequest, 'ville' | 'pays'>;

/** Miroir de la Page de Spring Data. */
export interface Page<T> {
  readonly content: readonly T[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly number: number;
  readonly size: number;
  readonly first: boolean;
  readonly last: boolean;
}

export interface Statistiques {
  readonly nombreSeances: number;
  readonly distanceTotaleKm: number;
  readonly dureeTotaleMinutes: number;
  readonly allureMoyenneMinParKm: number;
  readonly volumeParType: Readonly<Record<TypeSeance, number>>;
  readonly calculeEnMs: number;
  readonly evolution: readonly PointEvolution[];
  readonly comparaison: Comparaison | null;
}

export interface ConditionsMeteo {
  readonly ville: string;
  readonly temperatureMaxC: number | null;
  readonly temperatureMinC: number | null;
  /** Température relevée à l'heure exacte de la séance (observations Météo-France). */
  readonly temperatureALHeureC: number | null;
  readonly precipitationMm: number | null;
  readonly ventMaxKmH: number | null;
  readonly pm25: number | null;
  /**
   * ⚠️ Noms alignés sur ConditionsResponse du backend : `source` et `station`,
   * SANS suffixe — contrairement à l'entité Seance qui expose `sourceMeteo` et
   * `stationMeteo`. Les deux DTO sont distincts, ne pas les confondre.
   */
  readonly source: SourceMeteo;
  readonly station: string | null;
  readonly alertes: readonly string[];
}

/**
 * Réponse 422 de l'API quand une règle métier bloque.
 * Côté Kotlin, ces cas viennent de la `sealed interface` ResultatCreationSeance.
 * Le type union reproduit cette exhaustivité côté front.
 */
export type MotifRefus = 'PLAFOND_HEBDOMADAIRE' | 'DATE_TROP_LOINTAINE';

export interface RefusMetier {
  readonly motif: MotifRefus;
  readonly detail: string;
  readonly volumeCalculeKm?: number;
  readonly plafondKm?: number;
}

/** Structure d'erreur normalisée du @RestControllerAdvice. */
export interface ErreurApi {
  readonly statut: number;
  readonly erreur: string;
  readonly message: string;
  readonly horodatage: string;
}

/** Un point de la courbe d'évolution : lundi de la semaine + volume. */
export interface PointEvolution {
  readonly semaine: string;
  readonly distanceKm: number;
  readonly nombreSeances: number;
}

/** Même durée, juste avant : c'est ce qui donne un sens au chiffre brut. */
export interface Comparaison {
  readonly distanceTotaleKm: number;
  readonly nombreSeances: number;
  readonly variationDistancePourcent: number | null;
}

export interface Records {
  readonly plusLongueDistanceKm: number | null;
  readonly plusLongueDuree: number | null;
  readonly meilleureAllureMinParKm: number | null;
  readonly plusGrosseSemaineKm: number | null;
  readonly nombreTotalSeances: number;
  readonly distanceCumuleeKm: number;
}

/** Suggestion d'autocomplétion du champ ville. */
export interface SuggestionVille {
  readonly nom: string;
  readonly departement: string | null;
  readonly latitude: number;
  readonly longitude: number;
}
