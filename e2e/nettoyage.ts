import { FullConfig, request } from '@playwright/test';
import { COMPTES } from './aide';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ NETTOYAGE APRÈS LA SUITE                                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Chaque test qui écrit travaille sur SON compte — c'est ce qui les rend
 * indépendants. La contrepartie : une exécution complète laisse une quarantaine
 * de « Compte E2E » derrière elle, et l'écran d'administration devient
 * illisible au bout de quelques passes.
 *
 * On les efface donc à la fin, par la suppression en masse de l'API.
 *
 * ⚠️ GARDE-FOU : seul le domaine `@exemple.fr` est visé. C'est le domaine
 * réservé aux tests (RFC 2606), aucun compte réel ne peut s'y trouver — et les
 * comptes de démonstration, en `@kayedaw.fr`, sont hors d'atteinte par
 * construction. Un filtre sur un préfixe de nom serait beaucoup plus fragile :
 * les tests nomment leurs comptes « Promu… », « Supprime… », « Bloc… ».
 *
 * Le nettoyage ne fait JAMAIS échouer la suite : il s'exécute après les
 * assertions, et un backend déjà arrêté ne doit pas transformer une exécution
 * verte en rouge. D'où le try/catch qui se contente d'un avertissement.
 */
async function nettoyage(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4200';
  const contexte = await request.newContext({ baseURL });

  try {
    const connexion = await contexte.post('/api/auth/connexion', { data: COMPTES.admin });
    if (!connexion.ok()) {
      console.warn('[nettoyage] connexion administrateur impossible, comptes conservés');
      return;
    }
    const { token } = await connexion.json();
    const entetes = { Authorization: `Bearer ${token}` };

    // `size` et non `taille` : c'est le nom attendu par Spring Data. Sans lui,
    // on ne ramènerait que la première page de vingt et le nettoyage serait
    // silencieusement partiel.
    const liste = await contexte.get('/api/admin/utilisateurs?size=500', { headers: entetes });
    if (!liste.ok()) {
      return;
    }

    const ids: number[] = (await liste.json()).content
      .filter((u: { email: string }) => u.email.endsWith('@exemple.fr'))
      .map((u: { id: number }) => u.id);

    if (ids.length === 0) {
      return;
    }

    const suppression = await contexte.delete('/api/admin/utilisateurs', {
      headers: entetes,
      data: { ids }
    });
    const rapport = await suppression.json();
    console.log(
      `[nettoyage] ${rapport.supprimes.length} compte(s) de test supprimé(s)`
      + (rapport.refuses.length > 0 ? `, ${rapport.refuses.length} refusé(s)` : '')
    );
  } catch (erreur) {
    console.warn('[nettoyage] ignoré :', (erreur as Error).message);
  } finally {
    await contexte.dispose();
  }
}

export default nettoyage;
