import { Injectable, signal } from '@angular/core';

/** What the 3D scene reads on every frame. Values go from 0 to 1. */
export interface AudioLevels {
  bass: number;
  mid: number;
  treble: number;
  /** Raw spectrum (0-255 per band), used by the equalizer on the 3D screen. */
  spectrum: Uint8Array;
}

/**
 * Bridge between the <audio> player of the tracks page and the 3D scene.
 * The player is plugged into a Web Audio AnalyserNode, which gives the
 * frequency spectrum of what is actually playing, without any HTTP call.
 */
@Injectable({ providedIn: 'root' })
export class AudioVisualizerService {
  /** True while a track is playing: the speakers follow the music instead of idling. */
  readonly playing = signal(false);

  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private spectrum = new Uint8Array(0);
  // An element can only be plugged once (createMediaElementSource throws the second time).
  private readonly connected = new WeakSet<HTMLMediaElement>();

  /** Called on the player's "play" event, which always follows a user click. */
  connect(audio: HTMLAudioElement): void {
    const context = this.ensureContext();
    if (!this.connected.has(audio)) {
      // Once plugged, the sound goes through the graph: source -> analyser -> speakers.
      context.createMediaElementSource(audio).connect(this.analyser!);
      this.connected.add(audio);
    }
    // A context created without a user gesture starts "suspended" and would stay silent.
    if (context.state === 'suspended') void context.resume();
    this.playing.set(true);
  }

  stop(): void {
    this.playing.set(false);
  }

  /** Reads the current spectrum. Cheap enough to be called 60 times per second. */
  levels(): AudioLevels | null {
    if (!this.analyser || !this.playing()) return null;
    this.analyser.getByteFrequencyData(this.spectrum);
    const n = this.spectrum.length;
    return {
      bass: this.average(0, Math.floor(n * 0.08)),
      mid: this.average(Math.floor(n * 0.08), Math.floor(n * 0.4)),
      treble: this.average(Math.floor(n * 0.4), n),
      spectrum: this.spectrum,
    };
  }

  /** Little synthesized kick when the user clicks a speaker: a sine falling from 150 Hz to 40 Hz. */
  kick(): void {
    const context = this.ensureContext();
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      // 64 bands are plenty for 3D speakers and a small equalizer.
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.context.destination);
      this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return this.context;
  }

  private average(from: number, to: number): number {
    let sum = 0;
    for (let i = from; i < to; i++) sum += this.spectrum[i];
    return to > from ? sum / (to - from) / 255 : 0;
  }
}
