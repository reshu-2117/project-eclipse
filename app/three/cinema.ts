/**
 * The cinematic pipeline shared by the flight deck and the station walk.
 *
 * Look: space has no fill light. Shadows are black, highlights burn, and the only colours are the warm
 * Lanterns, the cold ice and whatever your floodlights touch. The grade adds what a camera would:
 * bloom on hot lights, fine film grain, a soft vignette, a hint of lens fringing at the edges, and
 * letterbox bars for the big moments. A governor drops resolution if the frame rate sags (tablets).
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.055 },
    uFringe: { value: 0.0022 },
    uBars: { value: 0 },
    uAspect: { value: 1.6 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.35, 0.2) },
    uLift: { value: new THREE.Color(0.006, 0.012, 0.02) },
    uDesat: { value: 0 },
    uThermal: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uFringe, uBars, uAspect, uFlash, uDesat, uThermal;
    // an "ironbow" thermal palette: cold black-blue, warm purple and red, hot orange to white
    vec3 ironbow(float t) {
      t = clamp(t, 0.0, 1.0);
      vec3 a = vec3(0.02, 0.02, 0.10);
      vec3 b = vec3(0.35, 0.05, 0.55);
      vec3 c = vec3(0.90, 0.20, 0.15);
      vec3 d = vec3(1.00, 0.65, 0.05);
      vec3 e = vec3(1.00, 1.00, 0.85);
      if (t < 0.25) return mix(a, b, t / 0.25);
      if (t < 0.5) return mix(b, c, (t - 0.25) / 0.25);
      if (t < 0.75) return mix(c, d, (t - 0.5) / 0.25);
      return mix(d, e, (t - 0.75) / 0.25);
    }
    uniform vec3 uFlashColor, uLift;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      // lens fringing grows toward the edge
      vec2 off = c * uFringe * (0.4 + r2 * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // the shadows sit on a cold, very dark blue instead of dead black
      col = col + uLift * (1.0 - smoothstep(0.0, 0.25, dot(col, vec3(0.333))));
      // warm highlights, cool shadows (a gentle split tone)
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(1.04, 1.0, 0.94), smoothstep(0.45, 1.0, l));
      col = mix(col, col * vec3(0.93, 1.0, 1.08), 1.0 - smoothstep(0.0, 0.35, l));
      col = mix(col, vec3(l), uDesat);
      col = mix(col, ironbow(pow(l, 0.55) * 1.15), uThermal);
      // vignette
      col *= 1.0 - uVignette * smoothstep(0.15, 0.95, r2);
      // grain, stronger in the darks
      float g = hash(vUv * vec2(1931.0, 1171.0) + fract(uTime * 7.31)) - 0.5;
      col += g * uGrain * (1.15 - l);
      // alarm flash
      col = mix(col, uFlashColor, uFlash * 0.35 * (0.4 + r2));
      // letterbox
      float bar = uBars * 0.11;
      if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface Cinema {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  setSize(w: number, h: number): void;
  render(dt: number): void;
  setCamera(camera: THREE.Camera): void;
  dispose(): void;
  /** current pixel ratio after the governor */
  pixelRatio(): number;
}

export function createCinema(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera): Cinema {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const maxPr = Math.min(window.devicePixelRatio || 1, 1.75);
  let pr = maxPr;
  renderer.setPixelRatio(pr);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 1.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  let w = 1;
  let h = 1;
  // frame-time governor
  let acc = 0;
  let frames = 0;
  let cool = 0;

  const setSize = (nw: number, nh: number) => {
    w = Math.max(1, nw);
    h = Math.max(1, nh);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloom.resolution.set(Math.round((w * pr) / 2), Math.round((h * pr) / 2));
    grade.uniforms.uAspect.value = w / h;
  };

  return {
    renderer,
    composer,
    bloom,
    grade,
    setSize,
    setCamera(c) {
      renderPass.camera = c;
    },
    render(dt) {
      grade.uniforms.uTime.value += dt;
      composer.render(dt);
      acc += dt;
      frames++;
      cool = Math.max(0, cool - dt);
      if (acc > 1.5) {
        const fps = frames / acc;
        acc = 0;
        frames = 0;
        if (cool <= 0) {
          if (fps < 38 && pr > 0.75) {
            pr = Math.max(0.75, pr - 0.25);
            setSize(w, h);
            cool = 3;
          } else if (fps > 57 && pr < maxPr) {
            pr = Math.min(maxPr, pr + 0.25);
            setSize(w, h);
            cool = 6;
          }
        }
      }
    },
    pixelRatio: () => pr,
    dispose() {
      composer.dispose();
      renderer.dispose();
    },
  };
}

// ── shared textures ──

let glowTex: THREE.Texture | null = null;
/** A soft round glow for lights seen from afar. */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.08, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.22, "rgba(255,255,255,0.35)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.08)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let flareTex: THREE.Texture | null = null;
/** A four-point star flare (a camera's aperture on a bright point). */
export function flareTexture(): THREE.Texture {
  if (flareTex) return flareTex;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.translate(s / 2, s / 2);
  const ray = (ang: number, len: number, wid: number, a: number) => {
    g.save();
    g.rotate(ang);
    const grd = g.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -wid);
    g.lineTo(len, 0);
    g.lineTo(0, wid);
    g.closePath();
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, s / 2, 2.2, 0.85);
  for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2 + Math.PI / 4, s / 3.2, 1.1, 0.35);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, s / 6);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, s / 6, 0, Math.PI * 2);
  g.fill();
  flareTex = new THREE.CanvasTexture(c);
  flareTex.colorSpace = THREE.SRGBColorSpace;
  return flareTex;
}

const loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;
const cache = new Map<string, THREE.Texture>();
export function tex(url: string, opts: { srgb?: boolean; repeat?: [number, number] } = {}): THREE.Texture {
  const key = `${url}|${opts.srgb}|${opts.repeat?.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = loader!.load(url);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/**
 * An environment for reflections: black space, a warm glow where the Kiln burns, the faint cold
 * glow of the planet below. Metal and the gold mirror segments pick these up.
 */
export function spaceEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const geo = new THREE.SphereGeometry(1, 16, 8);
  const blob = (color: number, intensity: number, pos: [number, number, number], scale: [number, number, number]) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    env.add(mesh);
  };
  // planet below: a wide, dim cold glow; a few warm city pools
  blob(0x1a2a3a, 0.9, [0, -8, 0], [14, 3, 14]);
  blob(0xffa040, 0.6, [3, -6, 2], [1.4, 0.6, 1.4]);
  blob(0xffa040, 0.4, [-4, -6, -3], [1.0, 0.5, 1.0]);
  // the Kiln: hot and close
  blob(0xffc27a, 1.6, [6, 2, 0], [1.0, 1.0, 1.0]);
  // a distant Lantern
  blob(0xffd8a0, 2.5, [-5, 6, 4], [0.3, 0.3, 0.3]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}
