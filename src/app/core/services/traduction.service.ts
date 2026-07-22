import { Injectable, signal } from '@angular/core';
import { Langue } from '../models/preferences.model';

/**
 * Le widget s'annonce sur `window` : il appelle la fonction nommée passée en
 * paramètre `cb` de son URL, puis expose `google.translate`.
 */
declare global {
  interface Window {
    google?: { translate?: { TranslateElement: new (options: object, hote: string) => void } };
    initialiserTraductionKayedaw?: () => void;
  }
}

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BASCULE FR / EN PAR LE WIDGET GOOGLE TRANSLATE                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Choix assumé : aucun fichier de traduction, aucune chaîne à maintenir. Le
 * widget traduit la page rendue, y compris les écrans ajoutés plus tard.
 *
 * ⚠️ CE QUE CE CHOIX COÛTE, écrit ici pour que personne ne le redécouvre :
 *
 *  1. Le widget RÉÉCRIT les nœuds de texte du DOM, dont Angular garde des
 *     références : risque connu de `removeChild` en échec. Correctif préventif
 *     dans `main.ts` (voir la note d'honnêteté qui s'y trouve).
 *  2. Le script est un TIERS : il ne se charge pas hors ligne, et le contenu
 *     de la page transite par Google. À documenter dans toute politique de
 *     confidentialité.
 *  3. La traduction n'est PAS maîtrisée, et c'est mesuré, pas supposé. Relevé
 *     sur cette application : « Type » → « Kind », « Recherche » → « Research »
 *     (au lieu de « Search »), « Du »/« Au » → « Of »/« At », et les initiales
 *     « CE » de l'avatar rendues en « THIS ». D'où les `translate="no"` posés
 *     sur ce qui ne doit jamais être traduit.
 *  4. Google a cessé de distribuer ce widget aux nouveaux sites : le script
 *     fonctionne encore mais n'est plus une dépendance pérenne.
 *  5. Chaque bascule RECHARGE la page — seul moment où le widget relit son
 *     cookie. Voir `appliquer()`.
 *
 * Le script n'est chargé QUE si l'utilisateur demande l'anglais : en français
 * — cas par défaut — aucune requête ne part vers Google.
 */
@Injectable({ providedIn: 'root' })
export class TraductionService {

  private static readonly ID_SCRIPT = 'script-traduction';
  private static readonly ID_CONTENEUR = 'widget-traduction';
  private static readonly LANGUE_SOURCE = 'fr';

  private readonly _langue = signal<Langue>('FR');
  readonly langue = this._langue.asReadonly();

  /** Mémorise le chargement en cours : deux bascules rapides = un seul script. */
  private chargement?: Promise<boolean>;

  /**
   * ⚠️ LE PILOTAGE PASSE PAR LE COOKIE, PAS PAR LE <select> DU WIDGET.
   *
   * Première tentative, abandonnée : écrire `.goog-te-combo.value = 'en'` puis
   * émettre un `change`. Vérifié en conditions réelles — le sélecteur passait
   * bien à « en » (249 options chargées, aucune erreur console) et la page
   * restait intégralement en français. Le widget n'expose aucun gestionnaire
   * sur cet événement ; c'est le cookie `googtrans` qu'il lit, et uniquement à
   * son INITIALISATION.
   *
   * D'où le rechargement de page à chaque bascule : c'est le seul moment où le
   * widget relit le cookie. C'est visible pour l'utilisateur, mais un
   * changement de langue est un geste rare et explicite — mieux vaut un
   * rechargement franc qu'un réglage qui ne prend pas.
   */
  appliquer(langue: Langue): void {
    this._langue.set(langue);
    const souhaiteAnglais = langue === 'EN';

    if (souhaiteAnglais === this.traductionActive()) {
      // État déjà cohérent : au chargement d'une page avec le cookie posé, il
      // suffit d'injecter le widget pour qu'il applique la traduction.
      if (souhaiteAnglais) {
        void this.charger();
      }
      return;
    }

    this.ecrireCookie(souhaiteAnglais);
    window.location.reload();
  }

  /** Le cookie porte le couple source/cible, par exemple `/fr/en`. */
  private traductionActive(): boolean {
    return document.cookie.split('; ')
      .some(morceau => morceau.startsWith('googtrans=') && morceau.endsWith('/en'));
  }

  private ecrireCookie(actif: boolean): void {
    document.cookie = actif
      ? `googtrans=/${TraductionService.LANGUE_SOURCE}/en; path=/`
      // Une date passée est la seule façon de supprimer un cookie côté client.
      : 'googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }

  /**
   * Injecte le conteneur puis le script, une seule fois. Résout à `false` si
   * le script ne se charge pas — hors ligne, bloqueur de contenu, ou service
   * retiré : l'application reste alors en français, ce qui est dégradé mais
   * parfaitement utilisable.
   */
  private charger(): Promise<boolean> {
    if (this.chargement) {
      return this.chargement;
    }

    this.chargement = new Promise<boolean>(resoudre => {
      if (!document.getElementById(TraductionService.ID_CONTENEUR)) {
        const hote = document.createElement('div');
        hote.id = TraductionService.ID_CONTENEUR;
        document.body.appendChild(hote);
      }

      // Le widget appelle cette fonction globale une fois son code évalué.
      window.initialiserTraductionKayedaw = () => {
        const fabrique = window.google?.translate?.TranslateElement;
        if (!fabrique) {
          resoudre(false);
          return;
        }
        new fabrique(
          { pageLanguage: TraductionService.LANGUE_SOURCE, autoDisplay: false },
          TraductionService.ID_CONTENEUR
        );
        resoudre(true);
      };

      const script = document.createElement('script');
      script.id = TraductionService.ID_SCRIPT;
      script.src = 'https://translate.google.com/translate_a/element.js'
        + '?cb=initialiserTraductionKayedaw';
      script.onerror = () => resoudre(false);
      document.body.appendChild(script);
    });

    return this.chargement;
  }
}
