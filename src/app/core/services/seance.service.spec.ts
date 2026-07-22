import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SeanceService } from './seance.service';
import { Page, Seance } from '../models/seance.model';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — Comment testez-vous un service HTTP ?                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Avec `HttpTestingController` : aucun appel réseau réel, mais on vérifie
 * l'URL, la méthode, les paramètres et les en-têtes, et on contrôle la réponse.
 *
 * `httpMock.verify()` en fin de test échoue s'il reste une requête non
 * consommée — un excellent garde-fou contre les appels involontaires.
 */
describe('SeanceService', () => {

  let service: SeanceService;
  let httpMock: HttpTestingController;

  const seance: Seance = {
    id: 1, type: 'ENDURANCE', distanceKm: 10, dureeMinutes: 50,
    dateHeure: '2026-07-19T18:30', estPlanifiee: false, commentaire: null, allureMinParKm: 5, vitesseKmH: 12,
    intensite: 'modérée', ville: null, pays: null, temperatureMaxC: null, temperatureMinC: null,
    temperatureALHeureC: null, precipitationMm: null, ventKmH: null, pm25: null,
    sourceMeteo: null, stationMeteo: null, alertesMeteo: []
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(SeanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('liste les séances avec pagination et tri', () => {
    const page: Page<Seance> = {
      content: [seance], totalElements: 1, totalPages: 1,
      number: 0, size: 20, first: true, last: true
    };

    service.lister({ page: 0, taille: 20, tri: 'dateHeure,desc', type: null })
      .subscribe(resultat => expect(resultat.content.length).toBe(1));

    const requete = httpMock.expectOne(r => r.url === '/api/seances');
    expect(requete.request.method).toBe('GET');
    expect(requete.request.params.get('page')).toBe('0');
    expect(requete.request.params.get('sort')).toBe('dateHeure,desc');
    requete.flush(page);
  });

  /**
   * Le filtrage passe désormais par des PARAMÈTRES sur /api/seances, et non
   * plus par une route dédiée par critère : une seule requête sait combiner
   * type, période et recherche.
   */
  it('envoie tous les filtres en paramètres de requête', () => {
    service.lister({
      page: 0, taille: 20, tri: 'dateHeure,desc', type: 'FRACTIONNE',
      debut: '2026-07-01', fin: '2026-07-31', recherche: 'piste'
    }).subscribe();

    const requete = httpMock.expectOne(r => r.url === '/api/seances');
    expect(requete.request.params.get('type')).toBe('FRACTIONNE');
    expect(requete.request.params.get('debut')).toBe('2026-07-01');
    expect(requete.request.params.get('fin')).toBe('2026-07-31');
    expect(requete.request.params.get('recherche')).toBe('piste');
    requete.flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true });
  });

  /** Un critère vide n'est pas envoyé : l'URL reste lisible côté serveur. */
  it('omet les filtres non renseignés', () => {
    service.lister({ page: 0, taille: 20, tri: 'dateHeure,desc', type: null }).subscribe();

    const requete = httpMock.expectOne(r => r.url === '/api/seances');
    expect(requete.request.params.has('type')).toBeFalse();
    expect(requete.request.params.has('recherche')).toBeFalse();
    requete.flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true });
  });

  it('crée une séance en POST', () => {
    service.creer({ type: 'ENDURANCE', distanceKm: 10, dureeMinutes: 50, dateHeure: '2026-07-19T18:30' })
      .subscribe(resultat => expect(resultat.id).toBe(1));

    const requete = httpMock.expectOne('/api/seances');
    expect(requete.request.method).toBe('POST');
    expect(requete.request.body.distanceKm).toBe(10);
    requete.flush(seance);
  });

  it('propage l erreur 422 de règle métier', () => {
    let statut = 0;

    service.creer({ type: 'ENDURANCE', distanceKm: 95, dureeMinutes: 500, dateHeure: '2026-07-19T18:30' })
      .subscribe({ error: (e) => statut = e.status });

    httpMock.expectOne('/api/seances').flush(
      { motif: 'PLAFOND_HEBDOMADAIRE', detail: 'dépassement', volumeCalculeKm: 95, plafondKm: 80 },
      { status: 422, statusText: 'Unprocessable Entity' }
    );

    expect(statut).toBe(422);
  });

  it('supprime une séance en DELETE', () => {
    service.supprimer(1).subscribe();

    const requete = httpMock.expectOne('/api/seances/1');
    expect(requete.request.method).toBe('DELETE');
    requete.flush(null);
  });
});
