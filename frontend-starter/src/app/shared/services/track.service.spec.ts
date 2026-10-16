import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TrackService } from './track.service';

describe('TrackService', () => {
  let service: TrackService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TrackService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list() transmet page et limit en paramètres de requête', () => {
    service.list(2, 10).subscribe();

    const req = http.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    // No search: q must not be sent at all.
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ items: [], total: 0, page: 2, limit: 10, pages: 1 });
  });

  it('list() ajoute q seulement quand une recherche est faite', () => {
    service.list(1, 5, 'blues').subscribe();

    const req = http.expectOne((r) => r.url === '/api/tracks');
    expect(req.request.params.get('q')).toBe('blues');
    req.flush({ items: [], total: 0, page: 1, limit: 5, pages: 1 });
  });

  it('remove() appelle DELETE /api/tracks/:id', () => {
    let done = false;
    service.remove('abc123').subscribe(() => (done = true));

    const req = http.expectOne('/api/tracks/abc123');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('lookupCover() envoie POST /api/tracks/:id/cover/lookup avec artiste et titre', () => {
    service.lookupCover('t1', 'Daft Punk', 'Get Lucky').subscribe();

    const req = http.expectOne('/api/tracks/t1/cover/lookup');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ artist: 'Daft Punk', title: 'Get Lucky' });
    req.flush({ id: 't1', hasCover: true, coverSource: 'web' });
  });

  it('upload() envoie un FormData et remonte les événements de progression', () => {
    const file = new File(['abc'], 'riff.mp3', { type: 'audio/mpeg' });
    const types: HttpEventType[] = [];
    service.upload(file, 'Riff').subscribe((event) => types.push(event.type));

    const req = http.expectOne('/api/tracks');
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    const body = req.request.body as FormData;
    expect(body.get('title')).toBe('Riff');
    expect((body.get('audio') as File).name).toBe('riff.mp3');

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    req.flush({ id: 't1', title: 'Riff' });

    expect(types).toContain(HttpEventType.UploadProgress);
    expect(types).toContain(HttpEventType.Response);
  });
});
