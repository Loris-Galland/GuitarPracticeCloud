import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { StudioPageComponent } from './studio-page';
import { TrackDetail } from '../../shared/models/track.model';
import { AUDIO_CONTEXT_FACTORY } from '../../shared/services/audio-engine.service';
import { FakeAudioContext } from '../../shared/testing/fake-audio-context';

const detail: TrackDetail = {
  id: 't1',
  title: 'Blues en La',
  artist: 'Moi',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 1024,
  hasCover: false,
  duration: 200,
  createdAt: '2026-10-01T10:00:00Z',
  peaks: [0.1, 0.6, 0.3],
};

describe('StudioPageComponent', () => {
  let fixture: ComponentFixture<StudioPageComponent>;
  let component: StudioPageComponent;
  let http: HttpTestingController;
  let context: FakeAudioContext;

  beforeEach(() => {
    context = new FakeAudioContext();
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:studio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    TestBed.configureTestingModule({
      imports: [StudioPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 't1' }) } } },
        { provide: AUDIO_CONTEXT_FACTORY, useValue: () => context },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StudioPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  /** Answers GET /api/tracks/t1 then GET /api/tracks/t1/audio. */
  async function loadTrack() {
    http.expectOne('/api/tracks/t1').flush(detail);
    http.expectOne('/api/tracks/t1/audio').flush(new Blob(['son'], { type: 'audio/mpeg' }));
    await fixture.whenStable();
  }

  it("charge le détail puis l'audio, et affiche titre, waveform et durée ffmpeg", async () => {
    await loadTrack();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toContain('Blues en La');
    expect(page.querySelector('app-waveform canvas')).not.toBeNull();
    expect(page.querySelector('.time')?.textContent).toContain('0:00 / 3:20');
    expect(page.querySelector('audio')?.getAttribute('src')).toBe('blob:studio');
  });

  it('déplace la lecture quand on clique dans la waveform', async () => {
    await loadTrack();

    component.seek(0.25);
    await fixture.whenStable();

    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    expect(audio.currentTime).toBe(50);
    expect(component.progress()).toBe(0.25);
    expect(fixture.nativeElement.querySelector('.time')?.textContent).toContain('0:50 / 3:20');
  });

  it('lance et met en pause la lecture avec le même bouton', async () => {
    await loadTrack();
    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const play = vi.spyOn(audio, 'play').mockResolvedValue();
    const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {});

    component.toggle();
    expect(play).toHaveBeenCalled();

    vi.spyOn(audio, 'paused', 'get').mockReturnValue(false);
    component.toggle();
    expect(pause).toHaveBeenCalled();
  });

  it("affiche un message clair quand la piste n'existe pas (404) et ne demande pas l'audio", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    http.expectOne('/api/tracks/t1').flush({ message: 'Piste inconnue' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain("n'existe pas ou ne vous appartient pas");
    http.expectNone('/api/tracks/t1/audio');
  });

  it('branche le lecteur sur le moteur Web Audio au lancement et affiche les vu-mètres', async () => {
    await loadTrack();
    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    audio.dispatchEvent(new Event('play'));

    expect(context.createMediaElementSource).toHaveBeenCalledWith(audio);
    expect(context.resume).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('app-stereo-meter [data-channel]').length).toBe(2);
  });

  it('envoie les réglages des knobs, faders et pédales au moteur audio', async () => {
    await loadTrack();
    fixture.nativeElement.querySelector('audio').dispatchEvent(new Event('play'));

    component.controls.controls.pan.setValue(-0.5);
    component.controls.controls.eq.at(0).setValue(6);
    component.controls.controls.reverb.controls.on.setValue(true);
    await fixture.whenStable();

    expect(context.all('panner')[0].pan.value).toBe(-0.5);
    expect(context.all('biquad')[0].gain.value).toBe(6);
    expect(fixture.nativeElement.querySelector('.pedal.cyan').classList).not.toContain('off');
    expect(fixture.nativeElement.querySelector('.pedal.yellow').classList).toContain('off');
  });

  it("remet l'égaliseur à plat", async () => {
    await loadTrack();
    component.controls.controls.eq.at(3).setValue(-8);
    component.flattenEq();
    expect(component.settings().eq.every((gain) => gain === 0)).toBe(true);
  });

  it('affiche 10 faders, 2 knobs de sortie et 4 pédales', async () => {
    await loadTrack();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('app-fader').length).toBe(10);
    expect(page.querySelectorAll('.levels app-knob').length).toBe(2);
    expect(page.querySelectorAll('.pedal app-footswitch').length).toBe(4);
  });

  it("libère l'ObjectURL et ferme le contexte audio en quittant la page", async () => {
    await loadTrack();
    fixture.nativeElement.querySelector('audio').dispatchEvent(new Event('play'));
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:studio');
    expect(context.close).toHaveBeenCalled();
  });
});
