import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { TracksPageComponent } from './tracks-page';
import { Track } from '../../shared/models/track.model';

const track = (id: string, title: string): Track => ({
  id,
  title,
  originalName: `${title}.mp3`,
  mimeType: 'audio/mpeg',
  size: 1024,
  hasCover: false,
  createdAt: '2026-10-01T10:00:00Z',
});

const page = (items: Track[]) => ({ items, total: items.length, page: 1, limit: 5, pages: 1 });

describe('TracksPageComponent', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let http: HttpTestingController;
  // The Material dialog always answers "confirmed", the snackbar only records its messages.
  const snackBar = { open: vi.fn() };
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };

  /** Answers the GET /api/tracks sent by load(). */
  const flushList = (items: Track[]) =>
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/tracks').flush(page(items));

  beforeEach(async () => {
    snackBar.open.mockClear();
    dialog.open.mockClear();
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    flushList([track('t1', 'Blues en La'), track('t2', 'Funk')]);
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('affiche une erreur quand le chargement de la liste échoue', async () => {
    component.load();
    http
      .expectOne((r) => r.url === '/api/tracks')
      .flush({ message: 'Serveur indisponible' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Serveur indisponible');
  });

  it('supprime après confirmation : DELETE /api/tracks/:id, message de succès, puis recharge la liste', async () => {
    component.remove(component.tracks()[0]);

    const req = http.expectOne('/api/tracks/t1');
    expect(req.request.method).toBe('DELETE');
    // Double click while the request is running: no second DELETE.
    component.remove(component.tracks()[0]);
    req.flush(null, { status: 204, statusText: 'No Content' });

    flushList([track('t2', 'Funk')]);
    await fixture.whenStable();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(snackBar.open.mock.calls[0][0]).toContain('a été supprimée');
    expect(component.tracks().map((t) => t.id)).toEqual(['t2']);
    expect(component.deletingId()).toBeNull();
  });

  it('piste déjà supprimée ailleurs (404) : message explicite et liste rafraîchie', async () => {
    component.remove(component.tracks()[0]);

    http
      .expectOne('/api/tracks/t1')
      .flush({ message: 'Piste inconnue' }, { status: 404, statusText: 'Not Found' });
    flushList([track('t2', 'Funk')]);
    await fixture.whenStable();

    expect(snackBar.open.mock.calls[0][0]).toContain("n'existe plus");
    expect(component.tracks().map((t) => t.id)).toEqual(['t2']);
  });

  it("l'upload passe par uploading avec un pourcentage, puis success et recharge la liste", async () => {
    component.file.set(new File(['abc'], 'riff.mp3', { type: 'audio/mpeg' }));
    component.upload();
    expect(component.uploadStatus()).toBe('uploading');
    expect(component.title.disabled).toBe(true);

    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/tracks');
    req.event({ type: HttpEventType.UploadProgress, loaded: 30, total: 120 });
    expect(component.progress()).toBe(25);

    req.flush(track('t3', 'riff.mp3'));
    flushList([track('t3', 'riff.mp3'), track('t1', 'Blues en La')]);
    await fixture.whenStable();

    expect(component.uploadStatus()).toBe('success');
    expect(component.title.enabled).toBe(true);
  });

  it("l'upload en échec passe en error et affiche le message du serveur", async () => {
    component.file.set(new File(['abc'], 'riff.mp3', { type: 'audio/mpeg' }));
    component.upload();

    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/tracks')
      .flush({ message: 'Format audio non accepté' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();

    expect(component.uploadStatus()).toBe('error');
    expect(component.uploading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Format audio non accepté');
  });

  it("recherche de pochette : préremplit le formulaire, met à jour la card et charge l'image", async () => {
    const first = { ...component.tracks()[0], artist: 'Daft Punk' };
    component.tracks.set([first, component.tracks()[1]]);
    // jsdom cannot build a real ObjectURL from the simulated Blob.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pochette');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    component.openLookup(first);
    expect(component.lookupForm.getRawValue()).toEqual({ artist: 'Daft Punk', title: 'Blues en La' });

    component.searchCover(first);
    const req = http.expectOne('/api/tracks/t1/cover/lookup');
    expect(req.request.method).toBe('POST');
    req.flush({ ...first, hasCover: true, coverSource: 'web' });

    // The new cover is then downloaded as a Blob, like the audio.
    http.expectOne('/api/tracks/t1/cover').flush(new Blob(['img'], { type: 'image/jpeg' }));
    await fixture.whenStable();

    expect(component.tracks()[0].coverSource).toBe('web');
    expect(component.covers()['t1']).toBe('blob:pochette');
    expect(component.lookupId()).toBeNull();
    expect(snackBar.open.mock.calls[0][0]).toContain('Pochette trouvée');
  });

  it('recherche de pochette sans résultat (404) : message du serveur dans le SnackBar', async () => {
    const first = component.tracks()[0];
    component.openLookup(first);
    component.lookupForm.controls.artist.setValue('Inconnu');
    component.searchCover(first);

    http
      .expectOne('/api/tracks/t1/cover/lookup')
      .flush({ message: 'Aucune pochette trouvée' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(snackBar.open.mock.calls[0][0]).toBe('Aucune pochette trouvée');
    expect(component.lookingUpId()).toBeNull();
  });
});
