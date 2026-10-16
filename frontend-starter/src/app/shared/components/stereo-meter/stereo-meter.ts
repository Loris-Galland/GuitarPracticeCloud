import { afterNextRender, Component, DestroyRef, inject, signal } from '@angular/core';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ballistics, meterRatio, METER_FLOOR_DB } from '../../utils/meter';

const SEGMENTS = 16;
/** The peak marker stays this long at the loudest point before falling. */
const PEAK_HOLD_MS = 1000;

/** What is displayed for one channel: number of lit segments and position of the peak marker. */
export interface MeterDisplay {
  name: 'L' | 'R';
  lit: number;
  peak: number;
}

/** Number of lit segments for a meter position from 0 to 1. */
export function litSegments(ratio: number, segments = SEGMENTS): number {
  return Math.round(Math.min(1, Math.max(0, ratio)) * segments);
}

/** Green up to -18 dB, yellow up to -6 dB, magenta above: the usual zones of a meter. */
export function segmentZone(index: number, segments = SEGMENTS): 'safe' | 'hot' | 'clip' {
  const db = METER_FLOOR_DB * (1 - (index + 1) / segments);
  if (db > -6) return 'clip';
  if (db > -18) return 'hot';
  return 'safe';
}

/**
 * Stereo level meters (left / right), fed by the audio engine of the studio page.
 * One requestAnimationFrame loop reads both channels, applies the ballistics
 * and keeps a peak marker for one second.
 */
@Component({
  selector: 'app-stereo-meter',
  template: `
    <div class="meters" role="img" aria-label="Vu-mètres gauche et droite">
      @for (channel of display(); track channel.name) {
        <div class="meter" [attr.data-channel]="channel.name">
          <div class="bar" aria-hidden="true">
            @for (zone of zones; track $index) {
              <i [class]="zone" [class.lit]="$index < channel.lit" [class.peak]="$index === channel.peak - 1"></i>
            }
          </div>
          <b>{{ channel.name }}</b>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .meters { display: flex; gap: 0.6rem; align-items: flex-end; }
    .meter { display: grid; justify-items: center; gap: 0.3rem; font-weight: 800; }
    .bar { display: flex; flex-direction: column-reverse; gap: 3px; padding: 4px; background: var(--ink); border-radius: 4px; }
    i { display: block; width: 26px; height: 8px; background: #333; }
    i.lit.safe, i.peak.safe { background: var(--lime); }
    i.lit.hot, i.peak.hot { background: var(--yellow); }
    i.lit.clip, i.peak.clip { background: var(--magenta); }
  `,
})
export class StereoMeterComponent {
  private readonly engine = inject(AudioEngineService);
  protected readonly zones = Array.from({ length: SEGMENTS }, (_, i) => segmentZone(i));

  readonly display = signal<MeterDisplay[]>([
    { name: 'L', lit: 0, peak: 0 },
    { name: 'R', lit: 0, peak: 0 },
  ]);

  // Raw positions (0 to 1), updated every frame. Only their segment count goes to the template.
  private readonly levels = [0, 0];
  private readonly peaks = [0, 0];
  private readonly peakTimes = [0, 0];
  private lastTime: number | null = null;
  private frame = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const loop = (now: number) => {
        this.step(now);
        this.frame = requestAnimationFrame(loop);
      };
      this.frame = requestAnimationFrame(loop);
    });
    destroyRef.onDestroy(() => cancelAnimationFrame(this.frame));
  }

  /** One frame: reads the engine, moves the bars and the peak markers. Public for the tests. */
  step(now: number): void {
    const elapsed = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
    this.lastTime = now;
    // Before the first play (or once paused), the meters simply fall back to zero.
    const input = this.engine.stereoLevels() ?? [0, 0];

    for (const i of [0, 1]) {
      const target = meterRatio(input[i]);
      this.levels[i] = ballistics(this.levels[i], target, elapsed);
      if (target >= this.peaks[i]) {
        this.peaks[i] = target;
        this.peakTimes[i] = now;
      } else if (now - this.peakTimes[i] > PEAK_HOLD_MS) {
        this.peaks[i] = ballistics(this.peaks[i], this.levels[i], elapsed);
      }
    }

    const next = this.display().map((channel, i) => ({
      ...channel,
      lit: litSegments(this.levels[i]),
      peak: litSegments(this.peaks[i]),
    }));
    // Only touch the signal when a segment actually changes: no re-render for nothing.
    const changed = next.some((c, i) => c.lit !== this.display()[i].lit || c.peak !== this.display()[i].peak);
    if (changed) this.display.set(next);
  }
}
