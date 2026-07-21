import { Pipe, PipeTransform } from '@angular/core';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — Pipe pur ou impur ?                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * `pure: true` (le défaut) : le pipe n'est recalculé que si la référence de
 * l'entrée change. C'est un CACHE gratuit — bien plus performant qu'une
 * méthode appelée depuis le template, laquelle s'exécute à CHAQUE cycle de
 * détection de changement.
 *
 * Un pipe impur (`pure: false`) s'exécute à chaque cycle : à éviter sauf
 * nécessité réelle. C'est une cause fréquente de problèmes de performance.
 *
 * Transforme 5.5 (min/km) en "5'30\"/km".
 */
@Pipe({ name: 'allure', standalone: true })
export class AllurePipe implements PipeTransform {

  transform(allureMinParKm: number | null | undefined): string {
    if (allureMinParKm === null || allureMinParKm === undefined || !isFinite(allureMinParKm) || allureMinParKm <= 0) {
      return '—';
    }

    const minutes = Math.floor(allureMinParKm);
    const secondes = Math.round((allureMinParKm - minutes) * 60);

    // 5.999 arrondirait à 60 secondes : on reporte sur la minute
    if (secondes === 60) {
      return `${minutes + 1}'00"/km`;
    }

    return `${minutes}'${secondes.toString().padStart(2, '0')}"/km`;
  }
}
