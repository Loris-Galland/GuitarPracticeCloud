import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AudioVisualizerService } from '../../services/audio-visualizer.service';
import { StudioWorld } from './studio-world';

/**
 * Interactive 3D studio (desk, screen, speakers). Meant to be used inside a @defer block:
 * this component and Three.js then end up in a separate chunk, downloaded only when needed.
 * It is purely decorative: the page works the same without it (no WebGL, reduced motion…).
 */
@Component({
  selector: 'app-studio-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas
    #canvas
    aria-hidden="true"
    [class.ready]="ready()"
    [style.cursor]="hoverSpeaker() ? 'pointer' : 'default'"
    (pointermove)="onPointerMove($event)"
    (pointerleave)="onPointerLeave()"
    (click)="onClick()"
  ></canvas>`,
  styles: `
    :host { display: block; position: relative; width: 100%; height: 100%; }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      opacity: 0;
      transition: opacity 0.8s ease;
      touch-action: pan-y;
    }
    canvas.ready { opacity: 1; }
  `,
})
export class StudioSceneComponent {
  /** Text shown on the 3D computer screen (current track title for instance). */
  readonly screenText = input('Guitar Practice Cloud');

  readonly ready = signal(false);
  readonly hoverSpeaker = signal(false);

  private readonly audio = inject(AudioVisualizerService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private world?: StudioWorld;
  private frameId = 0;
  private lastTime = 0;
  private visible = true;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    // WebGL needs a real canvas in the DOM: afterNextRender only runs in the browser, after the first render.
    afterNextRender(() => void this.start());

    // Keeps the screen text in sync with the input. The signal is read first on purpose:
    // with world?.setScreenText(this.screenText()), the ?. would skip the read while world
    // is still loading, so the effect would track nothing and never run again.
    effect(() => {
      const text = this.screenText();
      this.world?.setScreenText(text);
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      cancelAnimationFrame(this.frameId);
      this.resizeObserver?.disconnect();
      this.intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.world?.dispose();
    });
  }

  private async start(): Promise<void> {
    let world: StudioWorld;
    try {
      world = new StudioWorld(this.canvas().nativeElement, this.reducedMotion);
      await world.load();
    } catch (error) {
      // No WebGL or a model that cannot be loaded: the CSS background stays, the site works normally.
      console.warn('[StudioScene] Scène 3D désactivée', error);
      return;
    }
    if (this.destroyed) {
      world.dispose();
      return;
    }
    this.world = world;
    world.setScreenText(this.screenText());

    // The canvas follows the size of its block (responsive) without listening to window resize.
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) world.resize(width, height);
      if (this.reducedMotion) this.renderOnce();
    });
    this.resizeObserver.observe(this.host.nativeElement);

    // No image computed when the scene is scrolled out of view or the tab is hidden.
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateLoop();
    });
    this.intersectionObserver.observe(this.host.nativeElement);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.ready.set(true);
    this.updateLoop();
  }

  private readonly onVisibilityChange = () => this.updateLoop();

  /** Starts or stops the requestAnimationFrame loop depending on visibility. */
  private updateLoop(): void {
    const shouldRun = !!this.world && this.visible && !document.hidden && !this.reducedMotion;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    if (shouldRun) {
      this.lastTime = performance.now();
      this.frameId = requestAnimationFrame(this.loop);
    }
  }

  /**
   * One iteration per screen refresh. The app is zoneless: this loop never triggers
   * Angular change detection, only the WebGL rendering.
   */
  private readonly loop = (now: number) => {
    // dt capped so a frame that took long (tab switch, GC…) does not make the animation jump.
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.world?.frame(now / 1000, dt, this.audio.levels());
    this.frameId = requestAnimationFrame(this.loop);
  };

  private renderOnce(): void {
    this.world?.frame(performance.now() / 1000, 0, null);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.world) return;
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    this.world.setPointer(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Only written when it changes, so the template is not re-checked at every pixel.
    const hovering = this.world.isHoveringSpeaker;
    if (hovering !== this.hoverSpeaker()) this.hoverSpeaker.set(hovering);
  }

  onPointerLeave(): void {
    this.world?.setPointer(0, 0);
    this.hoverSpeaker.set(false);
  }

  /** Clicking a speaker makes it "thump", with a synthesized kick if no track is playing. */
  onClick(): void {
    if (this.world?.click() && !this.audio.playing()) this.audio.kick();
  }
}
