import { Injectable, signal } from '@angular/core';

export interface Notification {
  readonly id: number;
  readonly texte: string;
  readonly type: 'succes' | 'erreur' | 'info';
}

/**
 * File de notifications gérée en signal : l'affichage se met à jour tout seul.
 * `update` reçoit l'état courant et retourne le nouveau — on ne mute jamais
 * le tableau existant, ce qui garantit le déclenchement de la réactivité et
 * reste compatible avec la stratégie OnPush.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {

  private compteur = 0;
  private readonly _notifications = signal<readonly Notification[]>([]);
  readonly notifications = this._notifications.asReadonly();

  succes(texte: string): void { this.ajouter(texte, 'succes'); }
  erreur(texte: string): void { this.ajouter(texte, 'erreur'); }
  info(texte: string): void { this.ajouter(texte, 'info'); }

  fermer(id: number): void {
    this._notifications.update(liste => liste.filter(n => n.id !== id));
  }

  private ajouter(texte: string, type: Notification['type']): void {
    const id = ++this.compteur;
    this._notifications.update(liste => [...liste, { id, texte, type }]);
    setTimeout(() => this.fermer(id), 5000);
  }
}
