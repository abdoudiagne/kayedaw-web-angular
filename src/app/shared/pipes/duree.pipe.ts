import { Pipe, PipeTransform } from '@angular/core';

/** Transforme 95 minutes en "1h35". */
@Pipe({ name: 'duree', standalone: true })
export class DureePipe implements PipeTransform {

  transform(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined || minutes < 0) {
      return '—';
    }

    const heures = Math.floor(minutes / 60);
    const reste = Math.round(minutes % 60);

    return heures === 0 ? `${reste} min` : `${heures}h${reste.toString().padStart(2, '0')}`;
  }
}
