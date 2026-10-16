import { TestBed } from '@angular/core/testing';
import {
  AUDIO_CONTEXT_FACTORY,
  AudioEngineService,
  DEFAULT_SETTINGS,
  distortionCurve,
  EQ_FREQUENCIES,
  impulseResponse,
  rms,
  StudioSettings,
} from './audio-engine.service';
import { FakeAudioContext, FakeNode } from '../testing/fake-audio-context';

/** Follows the graph from a node: the nodes it is directly connected to. */
const targets = (node: FakeNode) => node.connections.map((c) => c.node);

describe('AudioEngineService', () => {
  let engine: AudioEngineService;
  let context: FakeAudioContext;
  const audio = document.createElement('audio');
  const settings = (patch: Partial<StudioSettings>): StudioSettings => ({ ...structuredClone(DEFAULT_SETTINGS), ...patch });

  beforeEach(() => {
    context = new FakeAudioContext();
    TestBed.configureTestingModule({
      providers: [AudioEngineService, { provide: AUDIO_CONTEXT_FACTORY, useValue: () => context }],
    });
    engine = TestBed.inject(AudioEngineService);
  });

  it('ne mesure rien avant la première lecture', () => {
    expect(engine.stereoLevels()).toBeNull();
    expect(engine.spectrum()).toBeNull();
  });

  it("branche l'élément audio une seule fois et réveille le contexte", () => {
    engine.attach(audio);
    engine.attach(audio);

    expect(context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it("chaîne les 10 bandes d'égaliseur, plateau aux deux bouts et cloches au milieu", () => {
    engine.attach(audio);
    const [source] = context.all('source');
    const bands = context.all('biquad').slice(0, 10);

    expect(bands.map((b) => b.frequency.value)).toEqual(EQ_FREQUENCIES);
    expect(bands.map((b) => b.type)).toEqual(['lowshelf', ...new Array(8).fill('peaking'), 'highshelf']);
    expect(targets(source)).toEqual([bands[0]]);
    bands.slice(0, -1).forEach((band, i) => expect(targets(band)).toContain(bands[i + 1]));
  });

  it('termine la chaîne par pan, volume, enceintes, vu-mètres et spectre', () => {
    engine.attach(audio);
    const [panner] = context.all('panner');
    const volume = targets(panner)[0] as FakeNode;
    const [splitter] = context.all('splitter');

    expect(targets(volume)).toContain(context.destination);
    expect(splitter.connections).toEqual([
      { node: context.analysers[0], output: 0 },
      { node: context.analysers[1], output: 1 },
    ]);
    expect(targets(volume)).toContain(context.analysers[2]);
    // Mono files are copied to both channels before the split.
    const stereo = targets(volume).find((n) => (n as FakeNode).channelCountMode === 'explicit') as FakeNode;
    expect(stereo.channelCount).toBe(2);
  });

  it('applique volume, pan et égaliseur, y compris des réglages faits avant la lecture', () => {
    const eq = [...DEFAULT_SETTINGS.eq];
    eq[5] = -6;
    engine.update(settings({ volume: 0.5, pan: -0.4, eq }));
    engine.attach(audio);

    expect(context.all('panner')[0].pan.value).toBe(-0.4);
    expect((targets(context.all('panner')[0])[0] as FakeNode).gain.value).toBe(0.5);
    expect(context.all('biquad')[5].gain.value).toBe(-6);
  });

  it('coupe le son direct quand la distorsion ou le filtre sont allumés', () => {
    engine.attach(audio);
    const [shaper] = context.all('waveshaper');
    // stage() creates dry, wet, output: the 3 gains right after the waveshaper and its tone filter.
    const gains = context.all('gain');
    const [distDry, distWet] = gains;

    expect(distDry.gain.value).toBe(1);
    expect(distWet.gain.value).toBe(0);

    engine.update(settings({ distortion: { on: true, drive: 0.8, tone: 0.5 } }));
    expect(distDry.gain.value).toBe(0);
    expect(distWet.gain.value).toBe(1);
    expect(shaper.curve).toEqual(distortionCurve(0.8));
  });

  it('ajoute delay et reverb par-dessus le son direct, au niveau du mix', () => {
    engine.attach(audio);
    const [delay] = context.all('delay');
    const [convolver] = context.all('convolver');

    engine.update(
      settings({
        delay: { on: true, time: 0.5, feedback: 0.95, mix: 0.4 },
        reverb: { on: true, size: 1, mix: 0.25 },
      }),
    );

    expect(delay.delayTime.value).toBe(0.5);
    const feedback = targets(delay)[0] as FakeNode;
    // The feedback is capped at 0.9: above, the echoes would never die out.
    expect(feedback.gain.value).toBe(0.9);
    expect(targets(delay)).toContain(feedback);
    expect(convolver.buffer).not.toBeNull();
    expect(context.createBuffer).toHaveBeenCalledWith(2, 8000, 8000);
  });

  it("ne recalcule la réponse de la reverb que si sa taille change", () => {
    engine.attach(audio);
    const calls = context.createBuffer.mock.calls.length;
    engine.update(settings({ reverb: { on: true, size: 2, mix: 0.6 } }));
    expect(context.createBuffer.mock.calls.length).toBe(calls);
    engine.update(settings({ reverb: { on: true, size: 3, mix: 0.6 } }));
    expect(context.createBuffer.mock.calls.length).toBe(calls + 1);
  });

  it('renvoie le niveau RMS de chaque canal et le spectre', () => {
    engine.attach(audio);
    context.analysers[0].sample = 0.5;
    context.analysers[1].sample = -0.25;

    expect(engine.stereoLevels()).toEqual([0.5, 0.25]);
    const frame = engine.spectrum()!;
    expect(frame.sampleRate).toBe(8000);
    expect(frame.data.length).toBe(1024);
  });

  it('ferme le contexte audio quand la page est quittée', () => {
    engine.attach(audio);
    engine.destroy();

    expect(context.close).toHaveBeenCalled();
    expect(engine.stereoLevels()).toBeNull();
  });
});

describe('calculs audio', () => {
  it('rms() calcule la moyenne quadratique', () => {
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBe(1);
    expect(rms(new Float32Array([0.6, 0.8]))).toBeCloseTo(Math.sqrt(0.5), 5);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it('la courbe de distorsion reste entre -1 et 1, symétrique, et laisse le son propre sans drive', () => {
    const clean = distortionCurve(0, 5);
    expect(Array.from(clean)).toEqual([-1, -0.5, 0, 0.5, 1]);

    const hot = distortionCurve(1, 101);
    expect(Math.max(...hot)).toBeLessThanOrEqual(1);
    expect(hot[0]).toBeCloseTo(-hot[100], 6);
    // A quiet input is pushed much higher than with the clean curve: that is the overdrive.
    expect(hot[55]).toBeGreaterThan(0.8);
  });

  it('la réponse de reverb est stéréo et décroît vers le silence', () => {
    const context = new FakeAudioContext();
    const buffer = impulseResponse(context as unknown as BaseAudioContext, 0.5);
    const data = buffer.getChannelData(0);
    const energy = (from: number, to: number) => rms(data.subarray(from, to));

    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(4000);
    expect(energy(0, 400)).toBeGreaterThan(energy(3000, 3400) * 5);
  });
});
