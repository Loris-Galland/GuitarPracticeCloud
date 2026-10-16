import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/auth-response.model';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  // Fails if a test leaves a request nobody answered (or made one it did not expect).
  afterEach(() => http.verify());

  it('login() envoie POST /api/auth/login avec email et mot de passe, puis garde le token', () => {
    const response: AuthResponse = {
      token: 'fake.jwt.token',
      user: { id: 'u1', name: 'Demo', email: 'demo@example.com', createdAt: '2026-10-01T10:00:00Z' },
    };

    service.login('demo@example.com', 'Demo1234!').subscribe();

    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'demo@example.com', password: 'Demo1234!' });
    req.flush(response);

    expect(service.token()).toBe('fake.jwt.token');
    expect(localStorage.getItem('gpc_token')).toBe('fake.jwt.token');
    expect(service.currentUser()?.email).toBe('demo@example.com');
  });

  it('login() en échec (401) ne stocke aucun token', () => {
    let status = 0;
    service.login('demo@example.com', 'mauvais').subscribe({ error: (e) => (status = e.status) });

    http
      .expectOne('/api/auth/login')
      .flush({ message: 'Identifiants invalides' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('gpc_token')).toBeNull();
  });
});
