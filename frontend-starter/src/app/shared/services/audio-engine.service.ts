import { inject, Injectable, InjectionToken } from '@angular/core';

/** Lets the tests replace the real AudioContext, which jsdom does not have. */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<() => AudioContext>('AUDIO_CONTEXT_FACTORY', {
  providedIn: 'root',
  factory: () => () => new AudioContext(),
});

/** One band per octave, the classic layout of a 10-band graphic equalizer. */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_RANGE_DB = 12;

export interface StudioSettings {
  /** 0 to 1. */
  volume: number;
  /** -1 (left) to 1 (right). */
  pan: number;
  /** Gain of each EQ band in dB, from -12 to +12. */
  eq: number[];
  /** drive and tone from 0 to 1. */
  distortion: { on: boolean; drive: number; tone: number };
  /** Low-pass filter: cutoff in Hz, resonance as the Q factor. */
  filter: { on: boolean; cutoff: number; resonance: number };
  /** time in seconds, feedback and mix from 0 to 1. */
  delay: { on: boolean; time: number; feedback: number; mix: number };
  /** size = length of the reverb tail in seconds, mix from 0 to 1. */
  reverb: { on: boolean; size: number; mix: number };
}

export const DEFAULT_SETTINGS: StudioSettings = {
  volume: 0.8,
  pan: 0,
  eq: EQ_FREQUENCIES.map(() => 0),
  distortion: { on: false, drive: 0.5, tone: 0.6 },
  filter: { on: false, cutoff: 2000, resonance: 1 },
  delay: { on: false, time: 0.35, feedback: 0.4, mix: 0.35 },
  reverb: { on: false, size: 2, mix: 0.3 },
};

/** 2048 samples at 44.1 kHz = about 46 ms of sound, a usual window for a level meter. */
const ANALYSER_SIZE = 2048;
/** Changes are smoothed over ~20 ms: turning a knob or a pedal on never makes a click. */
const SMOOTHING = 0.02;
const MAX_DELAY_SECONDS = 2;

/** Spectrum read by the spectrum component. */
export interface SpectrumFrame {
  /** Level of each frequency bin, from 0 to 255. */
  data: Uint8Array;
  sampleRate: number;
}

/** An effect with a dry path (untouched sound) and a wet path (through the effect). */
interface Stage {
  dry: GainNode;
  wet: GainNode;
  output: GainNode;
}

/**
 * Web Audio graph of the studio page. Provided by the page itself, so each visit
 * gets its own context, closed when the page is left.
 *
 *   <audio> > EQ (10 bands) > distortion > filter > delay > reverb > pan > volume > speakers
 *                                                                              ├> stereo > splitter > meters L / R
 *                                                                              └> spectrum analyser
 *
 * Settings can be changed before the first play: they are kept and applied when the graph is built.
 */
@Injectable()
export class AudioEngineService {
  private readonly createContext = inject(AUDIO_CONTEXT_FACTORY);
  private context?: AudioContext;
  private settings: StudioSettings = structuredClone(DEFAULT_SETTINGS);

  private eq: BiquadFilterNode[] = [];
  private distortion?: Stage & { shaper: WaveShaperNode; tone: BiquadFilterNode };
  private filter?: Stage & { biquad: BiquadFilterNode };
  private delay?: Stage & { node: DelayNode; feedback: GainNode };
  private reverb?: Stage & { convolver: ConvolverNode };
  private panner?: StereoPannerNode;
  private volume?: GainNode;
  private channels: AnalyserNode[] = [];
  private spectrumAnalyser?: AnalyserNode;

  private readonly samples = new Float32Array(ANALYSER_SIZE);
  private spectrumData = new Uint8Array(0);
  // The curve and the impulse response are costly: rebuilt only when their knob moves.
  private curveDrive = -1;
  private impulseSize = -1;

  /**
   * Plugs the page's <audio> element into the graph. Called on its "play" event,
   * which always follows a click: a context created without a user gesture would stay silent.
   */
  attach(audio: HTMLAudioElement): void {
    if (!this.context) this.build(audio);
    if (this.context!.state === 'suspended') void this.context!.resume();
  }

  /** Applies all the settings (volume, pan, EQ, pedals). */
  update(settings: StudioSettings): void {
    this.settings = structuredClone(settings);
    if (this.context) this.apply();
  }

  /** RMS level of the left and right channels (0 = silence, 1 = full scale), or null before the first play. */
  stereoLevels(): [number, number] | null {
    if (this.channels.length !== 2) return null;
    return [this.rmsOf(this.channels[0]), this.rmsOf(this.channels[1])];
  }

  /** Current frequency spectrum, or null before the first play. */
  spectrum(): SpectrumFrame | null {
    if (!this.spectrumAnalyser || !this.context) return null;
    this.spectrumAnalyser.getByteFrequencyData(this.spectrumData);
    return { data: this.spectrumData, sampleRate: this.context.sampleRate };
  }

  destroy(): void {
    void this.context?.close();
    this.context = undefined;
    this.channels = [];
    this.spectrumAnalyser = undefined;
  }

  private build(audio: HTMLAudioElement): void {
    const context = (this.context = this.createContext());
    // An element can only be plugged once: createMediaElementSource throws the second time.
    const source = context.createMediaElementSource(audio);

    // Equalizer: a shelf at each end, peaking filters in between.
    this.eq = EQ_FREQUENCIES.map((frequency, i) => {
      const band = context.createBiquadFilter();
      band.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      band.frequency.value = frequency;
      band.Q.value = 1.4; // about one octave wide
      return band;
    });
    let last: AudioNode = source;
    for (const band of this.eq) last = last.connect(band);

    // Distortion: the waveshaper clips the signal, a low-pass "tone" tames the harsh highs.
    const shaper = context.createWaveShaper();
    shaper.oversample = '4x';
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    shaper.connect(tone);
    this.distortion = { ...this.stage(last, shaper, tone), shaper, tone };

    const biquad = context.createBiquadFilter();
    biquad.type = 'lowpass';
    this.filter = { ...this.stage(this.distortion.output, biquad, biquad), biquad };

    // Delay: the output of the delay is sent back into it, quieter each time (feedback).
    const node = context.createDelay(MAX_DELAY_SECONDS);
    const feedback = context.createGain();
    node.connect(feedback);
    feedback.connect(node);
    this.delay = { ...this.stage(this.filter.output, node, node), node, feedback };

    const convolver = context.createConvolver();
    this.reverb = { ...this.stage(this.delay.output, convolver, convolver), convolver };

    this.panner = context.createStereoPanner();
    this.volume = context.createGain();
    this.reverb.output.connect(this.panner);
    this.panner.connect(this.volume);
    this.volume.connect(context.destination);

    // A mono file only has one channel: the splitter would leave the right meter at zero.
    // A gain forced to 2 channels "speakers" copies the mono signal to both sides.
    const stereo = context.createGain();
    stereo.channelCount = 2;
    stereo.channelCountMode = 'explicit';
    stereo.channelInterpretation = 'speakers';
    this.volume.connect(stereo);
    const splitter = context.createChannelSplitter(2);
    stereo.connect(splitter);
    this.channels = [0, 1].map((channel) => {
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_SIZE;
      splitter.connect(analyser, channel);
      return analyser;
    });

    this.spectrumAnalyser = context.createAnalyser();
    this.spectrumAnalyser.fftSize = ANALYSER_SIZE;
    this.spectrumAnalyser.smoothingTimeConstant = 0.75;
    // Default range (-100 to -30 dB) saturates on loud masters: every bar would stick to the top.
    this.spectrumAnalyser.minDecibels = -90;
    this.spectrumAnalyser.maxDecibels = -10;
    this.volume.connect(this.spectrumAnalyser);
    this.spectrumData = new Uint8Array(this.spectrumAnalyser.frequencyBinCount);

    this.curveDrive = -1;
    this.impulseSize = -1;
    this.apply();
  }

  /** input > dry > output, and input > [effect] > wet > output. */
  private stage(input: AudioNode, effectIn: AudioNode, effectOut: AudioNode): Stage {
    const context = this.context!;
    const dry = context.createGain();
    const wet = context.createGain();
    const output = context.createGain();
    input.connect(dry);
    dry.connect(output);
    input.connect(effectIn);
    effectOut.connect(wet);
    wet.connect(output);
    return { dry, wet, output };
  }

  private apply(): void {
    const s = this.settings;
    this.set(this.volume!.gain, s.volume);
    this.set(this.panner!.pan, s.pan);
    this.eq.forEach((band, i) => this.set(band.gain, s.eq[i] ?? 0));

    const d = this.distortion!;
    if (s.distortion.drive !== this.curveDrive) {
      d.shaper.curve = distortionCurve(s.distortion.drive);
      this.curveDrive = s.distortion.drive;
    }
    // Tone from 800 Hz (dark) to 12 kHz (bright), on a log scale like the ear.
    this.set(d.tone.frequency, 800 * 15 ** s.distortion.tone);
    this.toggle(d, s.distortion.on);

    const f = this.filter!;
    this.set(f.biquad.frequency, s.filter.cutoff);
    this.set(f.biquad.Q, s.filter.resonance);
    this.toggle(f, s.filter.on);

    // Delay and reverb are added on top of the sound: the dry path always stays at 1.
    const dl = this.delay!;
    this.set(dl.node.delayTime, s.delay.time);
    this.set(dl.feedback.gain, Math.min(s.delay.feedback, 0.9));
    this.set(dl.dry.gain, 1);
    this.set(dl.wet.gain, s.delay.on ? s.delay.mix : 0);

    const r = this.reverb!;
    if (s.reverb.size !== this.impulseSize) {
      r.convolver.buffer = impulseResponse(this.context!, s.reverb.size);
      this.impulseSize = s.reverb.size;
    }
    this.set(r.dry.gain, 1);
    this.set(r.wet.gain, s.reverb.on ? s.reverb.mix : 0);
  }

  /** Effects that replace the sound: on = only the wet path, off = only the dry path. */
  private toggle(stage: Stage, on: boolean): void {
    this.set(stage.dry.gain, on ? 0 : 1);
    this.set(stage.wet.gain, on ? 1 : 0);
  }

  private set(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.context!.currentTime, SMOOTHING);
  }

  private rmsOf(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.samples);
    return rms(this.samples);
  }
}

/** Root mean square: the "average energy" of a signal, closer to what we hear than the peak. */
export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/**
 * Soft clipping curve of the waveshaper: x is pushed by k then rounded off near ±1.
 * drive 0 leaves the sound almost clean, drive 1 gives a strong overdrive.
 */
export function distortionCurve(drive: number, size = 1024): Float32Array<ArrayBuffer> {
  const k = drive * 100;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i * 2) / (size - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Artificial reverb: a stereo burst of noise that fades out over `seconds`.
 * Convolving the sound with it sounds like a room whose size grows with the tail.
 */
export function impulseResponse(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
  }
  return buffer;
}
