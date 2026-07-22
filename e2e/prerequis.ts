import { FullConfig, request } from '@playwright/test';
import { COMPTES } from './aide';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ VÉRIFIER LES PRÉREQUIS AVANT DE LANCER QUOI QUE CE SOIT                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Le diagnostic qui a motivé ce fichier : vingt-cinq tests en échec, tous sur
 * `expect(page).toHaveURL(/seances|administration/)` avec « received:
 * /connexion ». Rien dans ce message ne dit que le mot de passe du compte de
 * démonstration avait simplement été changé à la main depuis le navigateur —
 * les compteurs du serveur montraient un `PUT /api/profil/mot-de-passe`, alors
 * qu'AUCUN test n'appelle cette route.
 *
 * La suite lit les identifiants de démonstration comme des constantes, ce qui
 * est légitime : ils sont documentés et recréés à chaque démarrage. Mais
 * n'importe qui peut les modifier en se servant de l'application, et la base
 * étant en mémoire, seul un redémarrage les rétablit.
 *
 * Ce contrôle transforme donc vingt-cinq échecs illisibles en UN message qui
 * dit quoi faire. Il ne corrige rien — il nomme la cause.
 */
async function verifierPrerequis(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4200';
  const contexte = await request.newContext({ baseURL });

  try {
    for (const [role, compte] of Object.entries(COMPTES)) {
      const reponse = await contexte.post('/api/auth/connexion', { data: compte });

      if (reponse.status() === 200) {
        continue;
      }

      // 403 et 401 ne disent pas la même chose : l'un est un compte bloqué,
      // l'autre un mot de passe qui n'est plus celui du seed.
      const cause = reponse.status() === 403
        ? `le compte est BLOQUÉ (débloquez-le depuis /administration)`
        : `son mot de passe n'est plus « ${compte.motDePasse} » — il a été changé `
          + `depuis l'application`;

      throw new Error(
        `\n\n  Compte de démonstration « ${role} » (${compte.email}) inutilisable : `
        + `${cause}.\n`
        + `  La base est EN MÉMOIRE : redémarrez le backend pour recréer le seed.\n`
        + `      cd ../kayedaw-api-kotlin && mvn spring-boot:run\n`
      );
    }
  } finally {
    await contexte.dispose();
  }
}

export default verifierPrerequis;
