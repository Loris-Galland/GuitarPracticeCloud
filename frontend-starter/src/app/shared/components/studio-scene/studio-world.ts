import {
  AmbientLight,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RedFormat,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { AudioLevels } from '../../services/audio-visualizer.service';

/** Kenney "Furniture Kit" models (CC0), copied into public/models. */
const MODELS = ['desk', 'computerScreen', 'speaker', 'plantSmall1', 'lampSquareTable'] as const;
type ModelName = (typeof MODELS)[number];

/** Same palette as the site (styles.css). */
const YELLOW = '#ffe600';
const MAGENTA = '#ff2e88';
const CYAN = '#00c2ff';
const LIME = '#8ce600';
const INK = '#111111';

/**
 * New color of each Kenney material, by model then material name.
 * The original colors (wood, grey metal) are replaced by the flat colors of the site.
 */
const RECOLOR: Record<ModelName, Record<string, string>> = {
  desk: { wood: YELLOW, metal: '#f4efe2' },
  computerScreen: { metalDark: '#262626', metal: '#f4efe2' },
  speaker: { wood: MAGENTA, metalMedium: '#262626' },
  plantSmall1: { wood: '#ff7a00', plant: LIME },
  lampSquareTable: { lamp: '#fff6c2', metal: '#f4efe2' },
};

/** Point the camera looks at: roughly the top of the desk. */
const TARGET = new Vector3(0, 0.36, 0);

/** One speaker = the Kenney model + two colored membranes + a colored light. */
interface Speaker {
  root: Group;
  woofer: Mesh<RingGeometry, MeshBasicMaterial>;
  tweeter: Mesh<RingGeometry, MeshBasicMaterial>;
  light: PointLight;
  energy: number;
  phase: number;
}

/**
 * The whole 3D studio, written without Angular so it can be read on its own:
 * load() builds the scene, frame() animates one image, dispose() frees the GPU.
 */
export class StudioWorld {
  private readonly renderer: WebGLRenderer;
  /** Draws the scene a second time, with the back faces pushed out in black: the "ink" outlines. */
  private readonly outline: OutlineEffect;
  /** 3 shades only (shadow, mid-tone, light) instead of a smooth gradient: the cel-shading look. */
  private readonly toonGradient = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(35, 1, 0.05, 20);
  private readonly speakers: Speaker[] = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2(0, 0);
  private readonly parallax = new Vector2(0, 0);
  private screenCanvas = document.createElement('canvas');
  private screenTexture = new CanvasTexture(this.screenCanvas);
  private screenText = '';
  private lastScreenDraw = 0;
  private distance = 2;
  private hovered: Speaker | null = null;
  private impulse = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly reducedMotion: boolean,
  ) {
    // Throws if WebGL is not available: the component then keeps its CSS placeholder.
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    // A 3x screen would render 9x more pixels for a barely visible gain: capped at 1.5.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = SRGBColorSpace;
    // No tone mapping: the flat colors stay as saturated as in the CSS.
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.outline = new OutlineEffect(this.renderer, { defaultThickness: 0.02, defaultColor: [0.067, 0.067, 0.067] });
    this.toonGradient.minFilter = this.toonGradient.magFilter = NearestFilter;
    this.toonGradient.needsUpdate = true;
    this.screenCanvas.width = 256;
    this.screenCanvas.height = 160;
    this.screenTexture.colorSpace = SRGBColorSpace;
  }

  /** Downloads the 5 models in parallel (about 60 KB in total) and places them. */
  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const entries = await Promise.all(
      MODELS.map(async (name) => [name, (await loader.loadAsync(`models/${name}.glb`)).scene] as const),
    );
    const models = Object.fromEntries(entries) as Record<ModelName, Group>;
    for (const name of MODELS) this.toonify(models[name], RECOLOR[name]);

    // The tag on the floor and the screen use the site fonts: they must be loaded before drawing.
    await Promise.all([
      document.fonts.load('64px "Sedgwick Ave Display"'),
      document.fonts.load('16px "Dela Gothic One"'),
    ]).catch(() => undefined);

    this.addLights();
    this.addFloor();

    // The Kenney models have their origin on a corner: the desk is shifted to be centered on (0, 0).
    const desk = models.desk;
    desk.position.set(-0.355, 0, 0.1);
    const deskTop = 0.38;

    const screen = models.computerScreen;
    screen.position.set(-0.196, deskTop, -0.06);
    screen.add(this.createScreenDisplay());

    models.plantSmall1.position.set(0.27, deskTop, -0.12);
    models.lampSquareTable.position.set(-0.36, deskTop, -0.06);
    models.lampSquareTable.rotation.y = 0.5;

    this.scene.add(desk, screen, models.plantSmall1, models.lampSquareTable);

    // The same speaker model is used twice: the second one is a clone that shares geometry and materials.
    this.speakers.push(this.createSpeaker(models.speaker, -0.56, 0.3, new Color(YELLOW), 0));
    this.speakers.push(this.createSpeaker(models.speaker.clone(), 0.56, -0.3, new Color(CYAN), Math.PI));
    this.drawScreen(null, 0);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Distance chosen so the scene (1.5 wide, 0.9 high) always fits, whatever the ratio of the block.
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const fitHeight = 0.45 / Math.tan(halfFov);
    const fitWidth = 0.75 / (Math.tan(halfFov) * this.camera.aspect);
    this.distance = Math.max(fitHeight, fitWidth) * 1.05;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  /** Pointer position in the canvas, from -1 to 1 on each axis. */
  setPointer(x: number, y: number): void {
    this.pointer.set(x, y);
    // A few meshes only: the raycast is cheap enough to run on each pointer move.
    this.updateHover();
  }

  /** Returns true when the click hit a speaker (the component then plays a kick). */
  click(): boolean {
    if (!this.hovered) return false;
    this.impulse = 1;
    return true;
  }

  get isHoveringSpeaker(): boolean {
    return this.hovered !== null;
  }

  setScreenText(text: string): void {
    this.screenText = text;
    this.lastScreenDraw = 0;
  }

  /** Computes and draws one image. dt is the time since the previous image, in seconds. */
  frame(time: number, dt: number, levels: AudioLevels | null): void {
    // Smooth camera parallax: moves a fraction of the remaining distance at each image.
    if (!this.reducedMotion) {
      this.parallax.lerp(this.pointer, Math.min(1, dt * 3));
      this.placeCamera();
    }

    this.impulse *= Math.exp(-dt * 5);
    for (const speaker of this.speakers) this.animateSpeaker(speaker, time, dt, levels);

    // The screen is a 2D canvas used as a texture: redrawn at each image when music plays, ~10 times/s otherwise.
    if (levels || time - this.lastScreenDraw > 0.1) {
      this.drawScreen(levels, time);
      this.lastScreenDraw = time;
    }

    this.outline.render(this.scene, this.camera);
  }

  /** Frees everything that lives on the GPU: geometries, materials, textures, then the WebGL context. */
  dispose(): void {
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose();
      const materials = ([] as Material[]).concat(mesh.material ?? []);
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
        material.dispose();
      }
    });
    this.screenTexture.dispose();
    this.toonGradient.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private placeCamera(): void {
    // Seen from the front and slightly above, offset by the pointer.
    const direction = new Vector3(this.parallax.x * 0.35, 0.38 + this.parallax.y * 0.12, 1).normalize();
    this.camera.position.copy(TARGET).addScaledVector(direction, this.distance);
    this.camera.lookAt(TARGET);
  }

  /** Replaces the Kenney materials by flat toon materials in the site colors. */
  private toonify(model: Group, colors: Record<string, string>): void {
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const original = mesh.material as Material;
      mesh.material = new MeshToonMaterial({ color: colors[original.name] ?? '#f4efe2', gradientMap: this.toonGradient });
      original.dispose();
    });
  }

  private addLights(): void {
    // Strong flat ambient light + one sun: the toon gradient turns it into 3 clear shades.
    this.scene.add(new AmbientLight('#ffffff', 0.9));
    const sun = new DirectionalLight('#ffffff', 1.4);
    sun.position.set(1.2, 2, 1.6);
    this.scene.add(sun);
  }

  /** Round "rooftop" under the desk, with a spray-painted tag in front of it. */
  private addFloor(): void {
    // Halftone dots, like the background of the site, drawn once in a small repeated canvas.
    const dots = document.createElement('canvas');
    dots.width = dots.height = 32;
    const dotsCtx = dots.getContext('2d')!;
    dotsCtx.fillStyle = '#fff8e7';
    dotsCtx.fillRect(0, 0, 32, 32);
    dotsCtx.fillStyle = 'rgba(17, 17, 17, 0.14)';
    dotsCtx.beginPath();
    dotsCtx.arc(16, 16, 4, 0, Math.PI * 2);
    dotsCtx.fill();
    const dotsTexture = new CanvasTexture(dots);
    dotsTexture.colorSpace = SRGBColorSpace;
    dotsTexture.wrapS = dotsTexture.wrapT = RepeatWrapping;
    dotsTexture.repeat.set(24, 24);

    const side = new MeshToonMaterial({ color: '#262626', gradientMap: this.toonGradient });
    const top = new MeshToonMaterial({ map: dotsTexture, gradientMap: this.toonGradient });
    // CylinderGeometry groups: side, top, bottom.
    const floor = new Mesh(new CylinderGeometry(1, 1, 0.05, 64), [side, top, side]);
    floor.position.y = -0.025;
    this.scene.add(floor);

    // The tag is a separate transparent plane lying on the floor, so it faces the camera.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(256, 100);
    ctx.rotate(-0.06);
    ctx.font = '84px "Sedgwick Ave Display", cursive';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = INK;
    ctx.strokeText('GPC Radio', 0, 0);
    ctx.fillStyle = MAGENTA;
    ctx.fillText('GPC Radio', 0, 0);
    const tagTexture = new CanvasTexture(canvas);
    tagTexture.colorSpace = SRGBColorSpace;
    const tag = new Mesh(
      new PlaneGeometry(0.5, 0.156),
      new MeshBasicMaterial({ map: tagTexture, transparent: true, depthWrite: false }),
    );
    tag.material.userData['outlineParameters'] = { visible: false };
    tag.rotation.x = -Math.PI / 2;
    tag.position.set(0.02, 0.002, 0.19);
    this.scene.add(tag);
  }

  /**
   * Plane placed on the screen panel of the model. The coordinates come from the GLB:
   * panel from x 0.007 to 0.386, y 0.056 to 0.287, tilted back by about 8 degrees.
   */
  private createScreenDisplay(): Mesh {
    const display = new Mesh(
      new PlaneGeometry(0.379, 0.233),
      new MeshBasicMaterial({ map: this.screenTexture, toneMapped: false }),
    );
    // A flat plane on the screen panel: an outline would only draw a black frame inside the screen.
    display.material.userData['outlineParameters'] = { visible: false };
    display.position.set(0.1965, 0.1715, -0.049);
    display.rotation.x = -0.1376;
    return display;
  }

  private createSpeaker(model: Group, x: number, angle: number, color: Color, phase: number): Speaker {
    // The model's origin is on a corner: it is shifted so the group pivots around its bottom center.
    const root = new Group();
    model.position.set(-0.074, 0, 0.074);
    root.add(model);
    root.position.set(x, 0, -0.02);
    root.rotation.y = angle;

    // Membrane positions measured on the GLB: two cones centered on x 0.074, y 0.342 and 0.507.
    const woofer = this.createMembrane(color, 0.342);
    const tweeter = this.createMembrane(color, 0.507);
    root.add(woofer, tweeter);

    const light = new PointLight(color, 0.15, 1.2);
    light.position.set(0, 0.45, 0.25);
    root.add(light);

    this.scene.add(root);
    return { root, woofer, tweeter, light, energy: 0, phase };
  }

  private createMembrane(color: Color, y: number): Mesh<RingGeometry, MeshBasicMaterial> {
    const membrane = new Mesh(
      new RingGeometry(0.017, 0.031, 32),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: DoubleSide, toneMapped: false }),
    );
    membrane.material.userData['outlineParameters'] = { visible: false };
    membrane.position.set(0, y, 0.062);
    return membrane;
  }

  private animateSpeaker(speaker: Speaker, time: number, dt: number, levels: AudioLevels | null): void {
    // Without music: slow "breathing". With music: the bass drives the woofer, the treble the tweeter.
    const idle = this.reducedMotion ? 0 : 0.1 + 0.08 * Math.sin(time * 2.2 + speaker.phase);
    const bass = levels ? Math.pow(levels.bass, 1.5) * 1.3 : idle;
    const treble = levels ? Math.min(1, levels.treble * 2.2) : idle * 0.6;
    const hoverBoost = speaker === this.hovered ? 0.15 : 0;
    const target = Math.min(1.2, Math.max(bass, this.impulse) + hoverBoost);
    // Fast attack so each kick is visible, then the value follows the target smoothly.
    speaker.energy += (target - speaker.energy) * Math.min(1, dt * 18);
    const e = speaker.energy;

    // Squash and stretch of the whole cabinet from its base.
    speaker.root.scale.set(1 + 0.06 * e, 1 + 0.035 * e, 1 + 0.06 * e);
    speaker.woofer.scale.setScalar(1 + 0.35 * e);
    speaker.woofer.position.z = 0.062 + 0.012 * e;
    speaker.woofer.material.opacity = 0.45 + 0.55 * Math.min(1, e);
    speaker.tweeter.scale.setScalar(1 + 0.3 * treble);
    speaker.tweeter.material.opacity = 0.4 + 0.6 * treble;
    speaker.light.intensity = 0.1 + 0.9 * e;
  }

  private updateHover(): void {
    if (!this.speakers.length) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.speakers.map((s) => s.root),
      true,
    )[0];
    this.hovered = hit ? (this.speakers.find((s) => isDescendant(hit.object, s.root)) ?? null) : null;
  }

  /** Draws the title and a 24-bar equalizer in the 2D canvas used as the screen texture. */
  private drawScreen(levels: AudioLevels | null, time: number): void {
    const ctx = this.screenCanvas.getContext('2d')!;
    const { width: w, height: h } = this.screenCanvas;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = YELLOW;
    ctx.font = '16px "Dela Gothic One", "Arial Black", sans-serif';
    ctx.fillText(fitText(ctx, this.screenText.toUpperCase(), w - 24), 12, 28);
    // "ON AIR" label on a magenta block while a track plays.
    ctx.font = '10px "Dela Gothic One", "Arial Black", sans-serif';
    if (levels) {
      ctx.fillStyle = MAGENTA;
      ctx.fillRect(10, 36, 62, 15);
      ctx.fillStyle = INK;
      ctx.fillText('● ON AIR', 14, 47);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillText('● STAND BY', 12, 47);
    }

    // Plain colored bars, one color out of four, like the stickers of the site.
    const palette = [YELLOW, MAGENTA, CYAN, LIME];
    const bars = 24;
    const gap = 3;
    const barWidth = (w - 24 - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle = palette[i % palette.length];
      const value = levels
        ? levels.spectrum[Math.floor((i / bars) * levels.spectrum.length * 0.75)] / 255
        : this.reducedMotion
          ? 0.2
          : 0.12 + 0.1 * (1 + Math.sin(time * 2.5 + i * 0.55));
      const barHeight = Math.max(3, value * 90);
      ctx.fillRect(12 + i * (barWidth + gap), h - 12 - barHeight, barWidth, barHeight);
    }
    this.screenTexture.needsUpdate = true;
  }
}

function isDescendant(object: Object3D, root: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current === root) return true;
  }
  return false;
}

/** Cuts the text with "…" so it fits in maxWidth pixels. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
  return cut + '…';
}
