import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { formatTime } from '../../utils/time';

/** Width of one bar plus its gap, in CSS pixels. */
const BAR_STEP = 3;
/** Same cap as the 3D scene: a 3x screen would draw 9 times more pixels for nothing. */
const MAX_PIXEL_RATIO = 1.5;
/** Arrow keys move by 5 seconds, like most players. */
const KEY_STEP_SECONDS = 5;

/**
 * Resamples the peaks to one value per bar: each bar keeps the loudest peak of its slice,
 * so a short loud hit never disappears when the canvas is narrow.
 */
export function resamplePeaks(peaks: number[], bars: number): number[] {
  if (!peaks.length || bars <= 0) return [];
  const size = peaks.length / bars;
  return Array.from({ length: bars }, (_, i) => {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    return Math.max(...peaks.slice(from, to));
  });
}

/** Position of a click inside the waveform, from 0 (start) to 1 (end). */
export function ratioAt(x: number, width: number): number {
  return width > 0 ? Math.min(1, Math.max(0, x / width)) : 0;
}

/**
 * Clickable waveform drawn in a canvas. The part already played is yellow,
 * the rest grey, with a white playhead. It behaves as a slider for the keyboard
 * and screen readers (arrows, Home, End).
 */
@Component({
  selector: 'app-waveform',
  template: `
    @if (peaks().length) {
      <canvas #canvas aria-hidden="true"></canvas>
    } @else {
      <p class="empty">Forme d'onde indisponible pour cette piste.</p>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      height: 110px;
      background: #1d1d1d;
      border: 2px solid var(--white);
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
    }
    :host(:focus-visible) { outline: 3px solid var(--magenta); outline-offset: 3px; }
    canvas { display: block; width: 100%; height: 100%; }
    .empty { margin: 0; display: grid; place-items: center; height: 100%; color: #b5b5b5; font-weight: 700; }
  `,
  host: {
    role: 'slider',
    tabindex: '0',
    '[attr.aria-label]': '"Position dans " + label()',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'duration()',
    '[attr.aria-valuenow]': 'currentTime()',
    '[attr.aria-valuetext]': 'valueText()',
    '(click)': 'onClick($event)',
    '(keydown)': 'onKey($event)',
  },
})
export class WaveformComponent {
  readonly peaks = input.required<number[]>();
  /** Current position, from 0 to 1. */
  readonly progress = input(0);
  /** Length in seconds, used for the keyboard and the screen reader text. */
  readonly duration = input(0);
  readonly label = input('la piste');
  /** Asked position, from 0 to 1. The parent moves the audio element. */
  readonly seek = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly size = signal({ width: 0, height: 0 });

  protected readonly currentTime = computed(() => Math.round(this.progress() * this.duration()));
  protected readonly valueText = computed(
    () => `${formatTime(this.currentTime())} sur ${formatTime(this.duration())}`,
  );
  private readonly bars = computed(() =>
    resamplePeaks(this.peaks(), Math.floor(this.size().width / BAR_STEP)),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    // The canvas follows the size of the component (window resize, mobile rotation).
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.size.set({ width, height });
      });
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    effect(() => this.draw(this.bars(), this.progress()));
  }

  protected onClick(event: MouseEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.seek.emit(ratioAt(event.clientX - rect.left, rect.width));
  }

  protected onKey(event: KeyboardEvent): void {
    const duration = this.duration();
    if (!duration) return;
    const step = KEY_STEP_SECONDS / duration;
    const targets: Record<string, number> = {
      ArrowLeft: this.progress() - step,
      ArrowDown: this.progress() - step,
      ArrowRight: this.progress() + step,
      ArrowUp: this.progress() + step,
      Home: 0,
      End: 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    this.seek.emit(Math.min(1, Math.max(0, targets[event.key])));
  }

  private draw(bars: number[], progress: number): void {
    const canvas = this.canvas()?.nativeElement;
    const { width, height } = this.size();
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !width) return;

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    // CSS variables of the site, read once per draw: the canvas stays in the art direction.
    const styles = getComputedStyle(this.host.nativeElement);
    const played = styles.getPropertyValue('--yellow').trim() || '#ffe600';
    const head = width * progress;
    const middle = height / 2;

    bars.forEach((peak, i) => {
      const x = i * BAR_STEP;
      const h = Math.max(2, peak * (height - 12));
      context.fillStyle = x < head ? played : '#8a8a8a';
      context.fillRect(x, middle - h / 2, BAR_STEP - 1, h);
    });

    context.fillStyle = '#ffffff';
    context.fillRect(Math.min(head, width - 3), 0, 3, height);
  }
}
