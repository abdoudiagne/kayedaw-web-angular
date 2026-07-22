/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ DÉCLENCHER UN TÉLÉCHARGEMENT DEPUIS UNE RÉPONSE HTTP                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ Pourquoi pas un simple `<a href="/api/…/export.pdf" download>` ?
 *
 * Parce que le jeton vit dans `localStorage` et n'est posé sur la requête que
 * par `authInterceptor`. Une navigation déclenchée par le navigateur ne passe
 * pas par `HttpClient` : elle partirait sans en-tête `Authorization` et
 * recevrait un 401. Il faut donc récupérer le fichier en `blob` par le client
 * HTTP, puis fabriquer le téléchargement à la main.
 *
 * ⚠️ `revokeObjectURL` n'est pas optionnel : chaque `createObjectURL` retient
 * le blob en mémoire jusqu'à la fermeture de l'onglet. Sans libération, dix
 * exports d'un carnet fourni gardent dix documents vivants pour rien.
 */
export function telecharger(contenu: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(contenu);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  /*
   * L'élément est ajouté au document avant le clic : Firefox ignore un clic
   * sur un lien détaché de l'arbre, là où Chrome l'accepte. Le retirer
   * aussitôt évite de laisser des ancres invisibles s'accumuler.
   */
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}

/** `seances-2026-07-22.pdf` — la date évite que trois exports s'écrasent. */
export function nomDuJour(prefixe: string): string {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return `${prefixe}-${aujourdhui}.pdf`;
}
