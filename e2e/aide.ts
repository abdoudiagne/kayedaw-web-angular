import { APIRequestContext, Page, expect } from '@playwright/test';

/**
 * Comptes recréés à chaque démarrage du backend (base H2 en mémoire).
 * On ne stocke QUE l'email et le mot de passe : le nom est modifiable depuis
 * la page profil, s'y fier rendrait les tests fragiles.
 */
export const COMPTES = {
  utilisateur: { email: 'user@kayedaw.fr', motDePasse: '12345' },
  admin: { email: 'admin@kayedaw.fr', motDePasse: '12345' }
};

export async function seConnecter(
  page: Page,
  compte: { email: string; motDePasse: string } = COMPTES.utilisateur
) {
  await page.goto('/connexion');
  await page.getByLabel('Email').fill(compte.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(compte.motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/seances/);
}

/** Email unique : les tests d'inscription ne doivent pas se marcher dessus. */
export function emailUnique(prefixe = 'e2e') {
  return `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@exemple.fr`;
}

/** Date-heure au format du champ datetime-local, décalée de N jours. */
export function dansNJours(jours: number, heure = '18:30') {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return `${d.toISOString().slice(0, 10)}T${heure}`;
}

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PRÉPARATION PAR L'API PLUTÔT QUE PAR L'INTERFACE                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Créer un compte et ses séances en cliquant prendrait dix fois plus de temps
 * et ferait échouer le test pour une raison sans rapport avec ce qu'il vérifie.
 * On prépare donc l'état par l'API, et on ne pilote au navigateur QUE l'écran
 * réellement testé.
 *
 * Chaque test travaille sur SON compte : les tests d'administration promeuvent
 * et suppriment des utilisateurs, ils ne doivent jamais toucher aux comptes de
 * démonstration ni se gêner entre eux.
 */
export const MOT_DE_PASSE_TEST = 'coureur-du-59';

export async function creerCompte(
  request: APIRequestContext,
  email = emailUnique(),
  nom = 'Compte E2E'
): Promise<{ email: string; motDePasse: string; token: string }> {
  const reponse = await request.post('/api/auth/inscription', {
    data: { email, motDePasse: MOT_DE_PASSE_TEST, nom, villeParDefaut: 'Lille' }
  });
  expect(reponse.ok(), `inscription de ${email}`).toBeTruthy();
  const corps = await reponse.json();
  return { email, motDePasse: MOT_DE_PASSE_TEST, token: corps.token };
}

export async function creerSeance(
  request: APIRequestContext,
  token: string,
  seance: { type?: string; distanceKm: number; dureeMinutes: number; dateHeure: string; ville?: string }
) {
  const reponse = await request.post('/api/seances', {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'ENDURANCE', ...seance }
  });
  expect(reponse.ok(), 'création de séance').toBeTruthy();
}

/** Date passée, décalée de N jours, au format attendu par l'API. */
export function ilYA(jours: number, heure = '09:00') {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return `${d.toISOString().slice(0, 10)}T${heure}`;
}
