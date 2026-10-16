import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('ajoute Authorization: Bearer <token> quand un token existe', () => {
    auth.token.set('fake.jwt.token');

    client.get('/api/users/me').subscribe();

    const req = http.expectOne('/api/users/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake.jwt.token');
    req.flush({});
  });

  it("n'ajoute pas de header quand il n'y a pas de token", () => {
    client.get('/api/health').subscribe();

    const req = http.expectOne('/api/health');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
