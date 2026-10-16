import { afterNextRender, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { AudioEngineService } from '../../services/audio-engine.service';
import { ballistics } from '../../utils/meter';

const BANDS = 40;
const LOWEST_HZ = 40;
const HIGHEST_HZ = 16000;
const MAX_PIXEL_RATIO = 1.5;

/**
 * Groups the FFT bins into `count` bands spaced like the ear hears (logarithmic):
 * as many bars for 40-80 Hz as for 8-16 kHz. Each band keeps its loudest bin, from 0 to 1.
 */
export function logBands(
  data: Uint8Array,
  sampleRate: number,
  count = BANDS,
  low = LOWEST_HZ,
  high = HIGHEST_HZ,
): number[] {
  // The analyser gives fftSize / 2 bins, evenly spread from 0 Hz to sampleRate / 2.
  const hzPerBin = sampleRate / 2 / data.length;
  return Array.from({ length: count }, (_, i) => {
    const from = low * (high / low) ** (i / count);
    const to = low * (high / low) ** ((i + 1) / count);
    const first = Math.min(data.length - 1, Math.floor(from / hzPerBin));
    const last = Math.min(data.length - 1, Math.max(first, Math.ceil(to / hzPerBin) - 1));
    let max = 0;
    for (let bin = first; bin <= last; bin++) max = Math.max(max, data[bin]);
    return max / 255;
  });
}

/** Real-time frequency spectrum of what comes out of the speakers, drawn in a canvas. */
@Component({
  selector: 'app-spectrum',
  template: `<canvas #canvas role="img" aria-label="Spectre des fréquences en temps réel"></canvas>`,
  styles: `
    :host { display: block; height: 150px; padding: 6px; background: var(--ink); border-radius: 4px; }
    canvas { display: block; width: 100%; height: 100%; }
  `,
})
export class SpectrumComponent {
  private readonly engine = inject(AudioEngineService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  /** Displayed height of each bar, from 0 to 1 (falls back slowly, like the meters). */
  readonly heights = new Array<number>(BANDS).fill(0);
  private lastTime: number | null = null;
  private frame = 0;
  private colors = { bar: '#00c2ff', cap: '#ffffff' };

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const styles = getComputedStyle(this.canvas().nativeElement);
      this.colors.bar = styles.getPropertyValue('--cyan').trim() || this.colors.bar;
      const loop = (now: number) => {
        this.step(now);
        this.draw();
        this.frame = requestAnimationFrame(loop);
      };
      this.frame = requestAnimationFrame(loop);
    });
    destroyRef.onDestroy(() => cancelAnimationFrame(this.frame));
  }

  /** Reads the engine and moves the bars. Public for the tests. */
  step(now: number): void {
    const elapsed = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
    this.lastTime = now;
    const frame = this.engine.spectrum();
    const targets = frame ? logBands(frame.data, frame.sampleRate) : this.heights.map(() => 0);
    targets.forEach((target, i) => (this.heights[i] = ballistics(this.heights[i], target, elapsed)));
  }

  private draw(): void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!context || !width || !height) return;

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const gap = 3;
    const barWidth = (width - gap * (BANDS - 1)) / BANDS;
    this.heights.forEach((level, i) => {
      if (level <= 0) return;
      const h = Math.max(3, level * height);
      const x = i * (barWidth + gap);
      context.fillStyle = this.colors.bar;
      context.fillRect(x, height - h, barWidth, h);
      // White cap on top of each bar, as on the mockup.
      context.fillStyle = this.colors.cap;
      context.fillRect(x, height - h, barWidth, 3);
    });
  }
}
