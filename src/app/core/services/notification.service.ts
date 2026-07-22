import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ FAÇADE au-dessus du MessageService de PrimeNG                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Pourquoi garder ce service alors que PrimeNG en fournit un ?
 *
 *  1. Le VOCABULAIRE reste celui du domaine : `succes()` / `erreur()` /
 *     `info()`, en français, comme le reste du code. Les huit composants
 *     appelants n'ont pas changé d'une ligne lors du passage à PrimeNG.
 *  2. La sévérité PrimeNG (`success`, `error`, `info`) et les durées sont
 *     décidées ICI, une fois. Sans façade, chaque appelant choisirait sa
 *     propre `life` et ses propres libellés d'en-tête.
 *  3. Un changement de bibliothèque ne toucherait que ce fichier.
 *
 * ⚠️ Ce qui a DISPARU au passage, et c'est voulu : la file en signal, les
 * minuteries manuelles et la suspension au survol. `p-toast` fait déjà tout
 * cela — il met le compte à rebours en pause au survol et gère la fermeture.
 * Réimplémenter ce comportement à côté d'une bibliothèque qui le fournit
 * serait du code à maintenir pour rien.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {

  private readonly messages = inject(MessageService);

  /** Une confirmation se lit vite ; une erreur mérite qu'on s'y attarde. */
  private static readonly DUREE_BREVE_MS = 4_000;
  private static readonly DUREE_LONGUE_MS = 8_000;

  succes(texte: string): void {
    this.messages.add({
      severity: 'success', summary: 'Succès', detail: texte,
      life: NotificationService.DUREE_BREVE_MS
    });
  }

  erreur(texte: string): void {
    this.messages.add({
      severity: 'error', summary: 'Erreur', detail: texte,
      life: NotificationService.DUREE_LONGUE_MS
    });
  }

  info(texte: string): void {
    this.messages.add({
      severity: 'info', summary: 'Information', detail: texte,
      life: NotificationService.DUREE_BREVE_MS
    });
  }
}
