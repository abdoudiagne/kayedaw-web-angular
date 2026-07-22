import { APIRequestContext, Locator, Page, expect } from '@playwright/test';

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
  // L'écran d'arrivée dépend du RÔLE : un administrateur atterrit sur
  // /administration, un membre sur /seances. Attendre /seances pour tout le
  // monde ferait échouer chaque connexion administrateur.
  await expect(page).toHaveURL(/\/(seances|administration)/);
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
  // Le CORPS de la réponse est repris dans le message : un `expect(ok).toBe(true)`
  // nu ne dit que « false », alors que le backend explique précisément son refus
  // (plafond hebdomadaire, date hors horizon…). Sans cela, diagnostiquer un
  // échec de préparation revient à deviner.
  expect(
    reponse.ok(),
    `création de séance (${reponse.status()}) : ${await reponse.text()}`
  ).toBeTruthy();
}

/**
 * Date-heure décalée de N MINUTES, au format LocalDateTime attendu par l'API.
 *
 * ⚠️ Composée à partir des champs LOCAUX, jamais via toISOString() : celui-ci
 * bascule en UTC et décalerait la séance de deux heures en été — de quoi la
 * faire sortir de la fenêtre « en cours » que l'on cherche justement à tester.
 */
export function dateHeureLocale(minutes: number) {
  const d = new Date(Date.now() + minutes * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Date passée, décalée de N jours, au format attendu par l'API. */
export function ilYA(jours: number, heure = '09:00') {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return `${d.toISOString().slice(0, 10)}T${heure}`;
}

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PILOTAGE DES CONTRÔLES PRIMENG                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Les contrôles PrimeNG ne se pilotent pas comme leurs équivalents natifs :
 *
 *  - `p-inputnumber` intercepte les frappes pour formater au fil de la saisie.
 *    Un `fill()` écrit la valeur puis se fait réécrire par le composant — le
 *    champ finissait à « 54 » au lieu de « 30 ». Il faut sélectionner puis
 *    taper, comme un utilisateur.
 *  - `p-select` n'est pas un <select> : `selectOption()` ne s'y applique pas.
 *    On ouvre le panneau, puis on clique l'option par son rôle ARIA.
 */
export async function saisirNombre(page: Page, id: string, valeur: number | string) {
  // ⚠️ SÉPARATEUR DÉCIMAL. p-inputnumber suit la locale du navigateur, fixée à
  // fr-FR dans playwright.config.ts : il attend donc une VIRGULE et ignore le
  // point. Taper « 7.5 » produisait 75, l'allure devenait irréaliste, le
  // formulaire restait invalide et le test échouait plus loin, sur un symptôme
  // sans rapport avec sa cause.
  await saisirNombreDans(page.locator(`#${id}`), valeur);
}

/** Variante prenant un locator : les champs du profil sont repérés par leur
    aria-label, pas par un identifiant fixe (il porte l'index de la ligne). */
export async function saisirNombreDans(champ: Locator, valeur: number | string) {
  const saisie = String(valeur).replace('.', ',');
  await champ.click();
  await champ.press('ControlOrMeta+a');
  // `delay` : sans lui, sous charge, p-inputnumber laissait tomber la virgule
  // et « 7,5 » devenait 75. L'allure passait à 0'32"/km, le formulaire restait
  // invalide, et le test échouait DEUX assertions plus loin sur un « champ
  // Recherche introuvable » — un symptôme sans rapport avec la cause.
  await champ.pressSequentially(saisie, { delay: 25 });
  await champ.blur();

  // Garde-fou : on vérifie ici ce qui a réellement été saisi. Un échec à cet
  // endroit nomme le vrai problème, au lieu de le laisser dériver.
  const attendu = saisie.replace(/[^0-9]/g, '');
  await expect(champ, `saisie de ${saisie}`)
    .toHaveValue(new RegExp(`^${attendu.split('').join('[.,]?')}$`));
}

export async function choisirDansSelect(page: Page, id: string, libelle: string) {
  await page.locator(`#${id}`).click();
  await page.getByRole('option', { name: libelle, exact: true }).click();
}

/**
 * Variante pour un p-select FILTRABLE : avec 249 pays, l'option visée n'est pas
 * rendue tant qu'on n'a pas filtré — la liste est virtualisée.
 */
export async function choisirPays(page: Page, id: string, pays: string) {
  await page.locator(`#${id}`).click();
  await page.getByPlaceholder('Rechercher un pays').fill(pays);
  await page.getByRole('option', { name: pays, exact: true }).click();
}

/** Compte avec un pays explicite : le géocodage des villes en dépend. */
export async function creerCompteAvecPays(
  request: APIRequestContext, pays: string, ville: string
): Promise<{ email: string; motDePasse: string; token: string }> {
  const email = emailUnique();
  const reponse = await request.post('/api/auth/inscription', {
    data: { email, motDePasse: MOT_DE_PASSE_TEST, nom: `Coureur ${pays}`,
            villeParDefaut: ville, pays }
  });
  expect(reponse.ok(), `inscription ${pays}`).toBeTruthy();
  return { email, motDePasse: MOT_DE_PASSE_TEST, token: (await reponse.json()).token };
}

/** Crée une séance et renvoie la réponse complète, météo comprise. */
export async function creerEtLire(
  request: APIRequestContext, token: string, ville: string, dateHeure: string
) {
  const reponse = await request.post('/api/seances', {
    headers: { Authorization: `Bearer ${token}` },
    data: { type: 'ENDURANCE', distanceKm: 5, dureeMinutes: 30, dateHeure, ville }
  });
  expect(reponse.ok(), `création à ${ville} : ${await reponse.text()}`).toBeTruthy();
  return reponse.json();
}
