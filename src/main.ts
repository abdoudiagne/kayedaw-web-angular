import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ COHABITATION AVEC GOOGLE TRANSLATE — correctif défensif                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le widget de traduction (voir TraductionService) REMPLACE les nœuds de texte
 * de la page par ses propres nœuds. Angular, lui, garde des références directes
 * sur les nœuds qu'il a créés pour pouvoir les retirer plus tard.
 *
 * Le risque, largement documenté : quand un `@if` ou un `@for` re-rend une zone
 * déjà traduite, Angular appelle `removeChild` sur un nœud qui n'est plus
 * l'enfant de ce parent, et le navigateur lève
 *   NotFoundError: Failed to execute 'removeChild' on 'Node'.
 * L'erreur casse le cycle de détection de changement et fige l'écran.
 *
 * ⚠️ HONNÊTETÉ SUR CE QUI A ÉTÉ VÉRIFIÉ : le plantage n'a PAS été reproduit sur
 * les parcours de cette application, correctif retiré — traduction active,
 * filtrage de la liste des séances, navigation entre écrans, aucune erreur.
 * Le correctif est donc PRÉVENTIF. Il est conservé parce que son coût est nul
 * et que les parcours testés ne couvrent pas toutes les séquences possibles ;
 * il ne faut pas pour autant le présenter comme la correction d'un bogue
 * observé ici.
 *
 * Le correctif rend les deux opérations TOLÉRANTES : si le nœud n'appartient
 * plus au parent, le widget l'a déjà déplacé, et il n'y a rien à faire. On ne
 * masque aucune anomalie d'Angular — le contrat de removeChild est justement
 * « retire cet enfant », et il n'y est plus.
 *
 * Posé AVANT bootstrapApplication : le premier rendu doit déjà en bénéficier.
 */
function tolererLesRetraitsDeLaTraduction(): void {
  const retirerOrigine = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, enfant: T): T {
    if (enfant.parentNode !== this) {
      return enfant;
    }
    return retirerOrigine.call(this, enfant) as T;
  };

  const insererOrigine = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node, noeud: T, reference: Node | null
  ): T {
    // Une référence qui n'est plus notre enfant : on insère en fin plutôt que
    // de lever, ce qui reste l'intention la plus proche de l'appel d'origine.
    if (reference && reference.parentNode !== this) {
      return insererOrigine.call(this, noeud, null) as T;
    }
    return insererOrigine.call(this, noeud, reference) as T;
  };
}

tolererLesRetraitsDeLaTraduction();

/**
 * Amorçage d'une application STANDALONE : plus de AppModule.
 * Depuis Angular 14/15, les NgModule ne sont plus nécessaires — c'est
 * aujourd'hui l'approche recommandée par défaut.
 */
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
