import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { errorInterceptor } from './error.interceptor';
import { AuthService } from '../services/auth.service';

describe('errorInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it("sur un 401 : déconnecte, redirige vers /login et laisse passer l'erreur", () => {
    auth.token.set('expired.jwt.token');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    let status = 0;

    client.get('/api/users/me').subscribe({ error: (e) => (status = e.status) });
    http
      .expectOne('/api/users/me')
      .flush({ message: 'Token invalide' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(status).toBe(401);
  });

  it('sur une autre erreur (404) : garde la session', () => {
    auth.token.set('valid.jwt.token');
    const navigate = vi.spyOn(router, 'navigateByUrl');

    client.get('/api/tracks/x').subscribe({ error: () => undefined });
    http
      .expectOne('/api/tracks/x')
      .flush({ message: 'Piste inconnue' }, { status: 404, statusText: 'Not Found' });

    expect(auth.token()).toBe('valid.jwt.token');
    expect(navigate).not.toHaveBeenCalled();
  });
});
