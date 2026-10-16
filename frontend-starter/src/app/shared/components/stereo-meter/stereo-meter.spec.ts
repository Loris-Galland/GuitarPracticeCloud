import { ComponentFixture, TestBed } from '@angular/core/testing';
import { litSegments, segmentZone, StereoMeterComponent } from './stereo-meter';
import { AudioEngineService } from '../../services/audio-engine.service';

describe('StereoMeterComponent', () => {
  let fixture: ComponentFixture<StereoMeterComponent>;
  let meter: StereoMeterComponent;
  let levels: [number, number] | null;

  const lit = (channel: 'L' | 'R') =>
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-channel="${channel}"] i.lit`).length;

  beforeEach(async () => {
    // The tests drive step() themselves: the real animation loop must not run in between.
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    levels = null;
    TestBed.configureTestingModule({
      imports: [StereoMeterComponent],
      providers: [{ provide: AudioEngineService, useValue: { stereoLevels: () => levels } }],
    });
    fixture = TestBed.createComponent(StereoMeterComponent);
    meter = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  it('reste éteint avant la première lecture', async () => {
    meter.step(0);
    await fixture.whenStable();
    expect(lit('L')).toBe(0);
    expect(lit('R')).toBe(0);
  });

  it('allume chaque canal selon son propre niveau', async () => {
    levels = [1, 10 ** (-24 / 20)]; // 0 dB à gauche, -24 dB à droite
    meter.step(16);
    await fixture.whenStable();

    expect(lit('L')).toBe(16);
    expect(lit('R')).toBe(8);
  });

  it('garde le pic une seconde, puis le laisse retomber', async () => {
    levels = [1, 1];
    meter.step(0);
    levels = [0, 0];
    meter.step(500);
    // The bar falls, the peak marker stays at the top.
    expect(meter.display()[0].lit).toBeLessThan(16);
    expect(meter.display()[0].peak).toBe(16);

    meter.step(1600);
    meter.step(2000);
    expect(meter.display()[0].peak).toBeLessThan(16);
  });

  it('découpe le vu-mètre en zones verte, jaune et magenta', () => {
    expect(segmentZone(0)).toBe('safe');
    expect(segmentZone(9)).toBe('safe');
    expect(segmentZone(10)).toBe('hot');
    expect(segmentZone(13)).toBe('hot'); // -6 dB pile
    expect(segmentZone(14)).toBe('clip');
    expect(segmentZone(15)).toBe('clip');
    expect(litSegments(0.5)).toBe(8);
    expect(litSegments(2)).toBe(16);
  });
});
