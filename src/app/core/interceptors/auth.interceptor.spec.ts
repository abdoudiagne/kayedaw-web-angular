import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

/**
 * Un intercepteur fonctionnel se teste comme le reste de la chaîne HTTP :
 * on l'enregistre, on émet une requête, et on inspecte les en-têtes reçus
 * par le HttpTestingController.
 */
describe('authInterceptor', () => {

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['token']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth }
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('ajoute l en-tête Authorization quand un jeton existe', () => {
    auth.token.and.returnValue('jeton-abc');

    http.get('/api/seances').subscribe();

    const requete = httpMock.expectOne('/api/seances');
    expect(requete.request.headers.get('Authorization')).toBe('Bearer jeton-abc');
    requete.flush({});
  });

  it('n ajoute rien en l absence de jeton', () => {
    auth.token.and.returnValue(null);

    http.get('/api/seances').subscribe();

    const requete = httpMock.expectOne('/api/seances');
    expect(requete.request.headers.has('Authorization')).toBeFalse();
    requete.flush({});
  });

  it('n envoie pas le jeton sur les routes publiques d authentification', () => {
    auth.token.and.returnValue('jeton-abc');

    http.post('/api/auth/connexion', {}).subscribe();

    const requete = httpMock.expectOne('/api/auth/connexion');
    expect(requete.request.headers.has('Authorization')).toBeFalse();
    requete.flush({});
  });
});
