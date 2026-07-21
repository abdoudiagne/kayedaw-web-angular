import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Metriques } from '../models/admin.model';
import { AdminService } from './admin.service';

describe('AdminService', () => {

  let service: AdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('liste les utilisateurs', () => {
    const attendu = {
      content: [{ id: 1, email: 'admin@kayedaw.fr', nom: 'Administrateur KayeDaw', role: 'ADMIN' }],
      totalElements: 1, totalPages: 1, number: 0, size: 10, first: true, last: true
    };

    service.utilisateurs({ page: 0, taille: 10, tri: 'nom', recherche: '' })
      .subscribe(page => {
        expect(page.content.length).toBe(1);
        expect(page.content[0].role).toBe('ADMIN');
      });

    const requete = httpMock.expectOne(r => r.url === '/api/admin/utilisateurs');
    expect(requete.request.method).toBe('GET');
    requete.flush(attendu);
  });

  it('récupère les métriques', () => {
    const attendu: Metriques = { totalRequetes: 42, parRoute: { 'GET /api/seances': 40 } };

    service.metriques().subscribe(recu => expect(recu.totalRequetes).toBe(42));

    httpMock.expectOne('/api/admin/metriques').flush(attendu);
  });

  /**
   * Un non-administrateur reçoit 403 : le service ne masque rien, il laisse
   * l'erreur remonter (l'intercepteur affiche la notification).
   */
  it('propage le 403 quand le rôle est insuffisant', () => {
    let statut = 0;
    service.utilisateurs({ page: 0, taille: 10, tri: 'nom', recherche: '' })
      .subscribe({ error: (e) => statut = e.status });

    httpMock.expectOne(r => r.url === '/api/admin/utilisateurs')
      .flush({ message: 'Accès refusé' }, { status: 403, statusText: 'Forbidden' });

    expect(statut).toBe(403);
  });
});
