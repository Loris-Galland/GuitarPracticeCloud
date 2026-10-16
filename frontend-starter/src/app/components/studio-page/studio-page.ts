import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TrackDetail } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { WaveformComponent } from '../../shared/components/waveform/waveform';
import { StereoMeterComponent } from '../../shared/components/stereo-meter/stereo-meter';
import { SpectrumComponent } from '../../shared/components/spectrum/spectrum';
import { KnobComponent } from '../../shared/components/knob/knob';
import { FaderComponent } from '../../shared/components/fader/fader';
import { FootswitchComponent } from '../../shared/components/footswitch/footswitch';
import {
  AudioEngineService,
  DEFAULT_SETTINGS,
  EQ_FREQUENCIES,
  EQ_RANGE_DB,
} from '../../shared/services/audio-engine.service';
import { formatTime } from '../../shared/utils/time';
import { formatDb, formatHz, formatPan, formatPercent, formatSeconds } from '../../shared/utils/format';

/**
 * Studio page of one track: the advanced player.
 * The <audio> element goes through the Web Audio graph of AudioEngineService.
 * Every control of the page (knobs, faders, footswitches) is a Reactive Forms
 * control: any change of the form is sent to the engine.
 */
@Component({
  imports: [
    RouterLink,
    ReactiveFormsModule,
    WaveformComponent,
    StereoMeterComponent,
    SpectrumComponent,
    KnobComponent,
    FaderComponent,
    FootswitchComponent,
  ],
  // One engine (and one AudioContext) per visit of the page, closed when leaving it.
  providers: [AudioEngineService],
  templateUrl: './studio-page.html',
  styleUrl: './studio-page.css',
})
export class StudioPageComponent {
  private readonly service = inject(TrackService);
  private readonly engine = inject(AudioEngineService);
  private readonly player = viewChild<ElementRef<HTMLAudioElement>>('player');
  private readonly fb = inject(NonNullableFormBuilder);

  readonly track = signal<TrackDetail | null>(null);
  readonly audioUrl = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly playing = signal(false);
  readonly currentTime = signal(0);
  /** ffmpeg's duration is known before the audio is loaded; the element's one is the fallback. */
  private readonly mediaDuration = signal(0);
  readonly duration = computed(() => this.track()?.duration || this.mediaDuration());
  readonly progress = computed(() => (this.duration() ? this.currentTime() / this.duration() : 0));

  readonly controls = this.fb.group({
    volume: DEFAULT_SETTINGS.volume,
    pan: DEFAULT_SETTINGS.pan,
    eq: this.fb.array(DEFAULT_SETTINGS.eq),
    distortion: this.fb.group(DEFAULT_SETTINGS.distortion),
    filter: this.fb.group(DEFAULT_SETTINGS.filter),
    delay: this.fb.group(DEFAULT_SETTINGS.delay),
    reverb: this.fb.group(DEFAULT_SETTINGS.reverb),
  });
  /** The form as a signal: the template (pedals on/off) and the engine follow it. */
  readonly settings = toSignal(this.controls.valueChanges.pipe(map(() => this.controls.getRawValue())), {
    initialValue: this.controls.getRawValue(),
  });

  protected readonly bands = EQ_FREQUENCIES.map((hz) => ({ hz, short: hz >= 1000 ? `${hz / 1000}k` : String(hz) }));
  protected readonly eqRange = EQ_RANGE_DB;
  protected readonly formatTime = formatTime;
  protected readonly formatDb = formatDb;
  protected readonly formatHz = formatHz;
  protected readonly formatPan = formatPan;
  protected readonly formatPercent = formatPercent;
  protected readonly formatSeconds = formatSeconds;

  private frame = 0;

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
    this.load(id);

    effect(() => this.engine.update(this.settings()));

    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.engine.destroy();
      const url = this.audioUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  load(id: string): void {
    this.service.get(id).subscribe({
      next: (track) => {
        this.track.set(track);
        // The audio is protected by the JWT: fetched as a Blob, then played from an ObjectURL.
        this.service.audio(id).subscribe({
          next: (blob) => {
            this.audioUrl.set(URL.createObjectURL(blob));
            this.loading.set(false);
          },
          error: (error: HttpErrorResponse) => this.fail(error, "Impossible de charger l'audio de cette piste."),
        });
      },
      error: (error: HttpErrorResponse) =>
        this.fail(
          error,
          error.status === 404
            ? "Cette piste n'existe pas ou ne vous appartient pas."
            : 'Impossible de charger la piste.',
        ),
    });
  }

  toggle(): void {
    const audio = this.player()?.nativeElement;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  /** Called by the waveform with a position from 0 to 1. */
  seek(ratio: number): void {
    const audio = this.player()?.nativeElement;
    if (!audio || !this.duration()) return;
    audio.currentTime = ratio * this.duration();
    this.currentTime.set(audio.currentTime);
  }

  /** Puts every band of the equalizer back to 0 dB. */
  flattenEq(): void {
    this.controls.controls.eq.setValue(DEFAULT_SETTINGS.eq);
  }

  protected onPlay(): void {
    const audio = this.player()?.nativeElement;
    if (audio) this.engine.attach(audio);
    this.playing.set(true);
    this.tick();
  }

  protected onPause(): void {
    this.playing.set(false);
    cancelAnimationFrame(this.frame);
    this.syncTime();
  }

  protected onMetadata(): void {
    const duration = this.player()?.nativeElement.duration;
    if (duration && Number.isFinite(duration)) this.mediaDuration.set(duration);
  }

  /** "timeupdate" only fires about 4 times per second: too jerky for the playhead. */
  private tick(): void {
    this.syncTime();
    this.frame = requestAnimationFrame(() => this.tick());
  }

  private syncTime(): void {
    const audio = this.player()?.nativeElement;
    if (audio) this.currentTime.set(audio.currentTime);
  }

  private fail(error: HttpErrorResponse, message: string): void {
    console.error('[StudioPage] Chargement impossible', error);
    this.error.set(message);
    this.loading.set(false);
  }
}
