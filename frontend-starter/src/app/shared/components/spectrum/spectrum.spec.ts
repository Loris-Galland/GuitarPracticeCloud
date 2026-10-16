import { TestBed } from '@angular/core/testing';
import { logBands, SpectrumComponent } from './spectrum';
import { AudioEngineService, SpectrumFrame } from '../../services/audio-engine.service';

describe('logBands', () => {
  // 8 bins from 0 to 4 kHz (sample rate 8 kHz): 500 Hz per bin.
  const data = new Uint8Array([10, 255, 51, 102, 0, 0, 0, 204]);

  it('garde le bin le plus fort de chaque bande, entre 0 et 1', () => {
    // Bands 500-1000 Hz, 1000-2000 Hz, 2000-4000 Hz.
    expect(logBands(data, 8000, 3, 500, 4000)).toEqual([1, 0.4, 0.8]);
  });

  it('espace les bandes comme notre oreille : autant de barres par octave', () => {
    const bins = new Uint8Array(1024).fill(0);
    const bands = logBands(bins, 44100, 40);
    expect(bands).toHaveLength(40);
    expect(bands.every((b) => b === 0)).toBe(true);
  });
});

describe('SpectrumComponent', () => {
  let frame: SpectrumFrame | null;

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    frame = null;
    TestBed.configureTestingModule({
      providers: [{ provide: AudioEngineService, useValue: { spectrum: () => frame } }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('monte avec le son et redescend en douceur au silence', () => {
    const spectrum = TestBed.createComponent(SpectrumComponent).componentInstance;
    frame = { data: new Uint8Array(1024).fill(255), sampleRate: 44100 };
    spectrum.step(0);
    expect(spectrum.heights.every((h) => h === 1)).toBe(true);

    frame = null;
    spectrum.step(200);
    // 200 ms of release at 1.5 heights per second.
    expect(spectrum.heights[0]).toBeCloseTo(0.7, 5);
  });
});
