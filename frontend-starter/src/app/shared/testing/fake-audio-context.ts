/**
 * Minimal AudioContext for the tests: jsdom has no Web Audio.
 * Each node records what it is connected to, so a test can check the graph,
 * and each parameter keeps the last value it was asked to reach.
 */
export class FakeParam {
  constructor(public value = 0) {}

  setTargetAtTime(value: number) {
    this.value = value;
  }
}

export class FakeNode {
  readonly connections: { node: FakeNode | object; output?: number }[] = [];
  channelCount = 2;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  type = '';
  readonly gain = new FakeParam(1);
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly pan = new FakeParam(0);
  readonly delayTime = new FakeParam(0);
  curve: Float32Array | null = null;
  buffer: object | null = null;
  oversample = 'none';

  constructor(readonly kind: string) {}

  connect(node: FakeNode | object, output?: number) {
    this.connections.push({ node, output });
    return node;
  }
}

export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  minDecibels = -100;
  maxDecibels = -30;
  /** Value written in every sample by getFloatTimeDomainData. */
  sample = 0;

  constructor() {
    super('analyser');
  }

  get frequencyBinCount() {
    return this.fftSize / 2;
  }

  getFloatTimeDomainData(target: Float32Array) {
    target.fill(this.sample);
  }

  getByteFrequencyData(target: Uint8Array) {
    target.fill(128);
  }
}

export class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = { kind: 'destination' };
  readonly analysers: FakeAnalyser[] = [];
  readonly nodes: FakeNode[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createMediaElementSource = vi.fn(() => this.add('source'));
  createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, numberOfChannels: channels, getChannelData: (i: number) => data[i] };
  });

  createGain = () => this.add('gain');
  createChannelSplitter = () => this.add('splitter');
  createBiquadFilter = () => this.add('biquad');
  createWaveShaper = () => this.add('waveshaper');
  createDelay = () => this.add('delay');
  createConvolver = () => this.add('convolver');
  createStereoPanner = () => this.add('panner');

  createAnalyser() {
    const analyser = new FakeAnalyser();
    this.nodes.push(analyser);
    this.analysers.push(analyser);
    return analyser;
  }

  /** All the nodes of one kind, in creation order. */
  all(kind: string): FakeNode[] {
    return this.nodes.filter((node) => node.kind === kind);
  }

  private add(kind: string): FakeNode {
    const node = new FakeNode(kind);
    this.nodes.push(node);
    return node;
  }
}
