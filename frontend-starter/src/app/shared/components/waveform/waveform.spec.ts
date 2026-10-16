import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ratioAt, resamplePeaks, WaveformComponent } from './waveform';

describe('resamplePeaks / ratioAt', () => {
  it('garde le pic le plus fort de chaque tranche', () => {
    expect(resamplePeaks([0.1, 0.9, 0.2, 0.3, 0.5, 0.4], 3)).toEqual([0.9, 0.3, 0.5]);
  });

  it('ne perd aucune barre quand il y a plus de barres que de pics', () => {
    expect(resamplePeaks([0.2, 0.8], 4)).toEqual([0.2, 0.2, 0.8, 0.8]);
    expect(resamplePeaks([], 10)).toEqual([]);
  });

  it('ramène la position du clic entre 0 et 1', () => {
    expect(ratioAt(50, 200)).toBe(0.25);
    expect(ratioAt(-10, 200)).toBe(0);
    expect(ratioAt(250, 200)).toBe(1);
    expect(ratioAt(10, 0)).toBe(0);
  });
});

describe('WaveformComponent', () => {
  let fixture: ComponentFixture<WaveformComponent>;
  let host: HTMLElement;
  let seeks: number[];

  beforeEach(async () => {
    // jsdom has no canvas: getContext returns null and the drawing is simply skipped.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    fixture = TestBed.createComponent(WaveformComponent);
    fixture.componentRef.setInput('peaks', [0.2, 0.5, 0.9]);
    fixture.componentRef.setInput('duration', 100);
    fixture.componentRef.setInput('progress', 0.5);
    fixture.componentRef.setInput('label', 'Blues');
    seeks = [];
    fixture.componentInstance.seek.subscribe((ratio) => seeks.push(ratio));
    await fixture.whenStable();
    host = fixture.nativeElement;
  });

  afterEach(() => vi.restoreAllMocks());

  it('expose un slider accessible avec la position en texte', () => {
    expect(host.getAttribute('role')).toBe('slider');
    expect(host.getAttribute('tabindex')).toBe('0');
    expect(host.getAttribute('aria-label')).toBe('Position dans Blues');
    expect(host.getAttribute('aria-valuenow')).toBe('50');
    expect(host.getAttribute('aria-valuetext')).toBe('0:50 sur 1:40');
  });

  it('émet la position cliquée', () => {
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 400 } as DOMRect);
    host.dispatchEvent(new MouseEvent('click', { clientX: 200 }));
    expect(seeks).toEqual([0.25]);
  });

  it('avance et recule de 5 secondes au clavier, Début et Fin vont aux extrémités', () => {
    const key = (k: string) => host.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    key('ArrowRight');
    key('ArrowLeft');
    key('Home');
    key('End');
    key('a'); // ignored
    expect(seeks).toEqual([0.55, 0.45, 0, 1]);
  });

  it('affiche un message quand la piste n\'a pas de forme d\'onde', async () => {
    fixture.componentRef.setInput('peaks', []);
    await fixture.whenStable();
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.textContent).toContain("Forme d'onde indisponible");
  });
});
