/**
 * Three.js scene for the Lantern-17 orbital environment. Client-only; loaded on demand.
 *
 * Scene units: 1 unit = 1,000 km. The model frame is z-up (planet spin axis); Three.js is y-up, so a
 * model point (x, y, z) km is drawn at (x, z, -y) / 1000.
 *
 * Light: Eclipse-01 has no sun. The only strong light sources are the Lanterns, so Lantern 17 and a
 * few online neighbours are point lights, over a faint ice-blue fill. Relighting Lantern 17 ramps its
 * light up and warms the planet's rim.
 */

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  EquirectangularReflectionMapping,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  LoadingManager,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  HERO_ID,
  PLANET_RADIUS_KM,
  TAU,
  UNIT_KM,
  createSafetyMonitor,
  positionAt,
  speedAt,
  type Body,
  type OrbitalField,
} from "./sim";

export interface BodyInfo {
  id: string;
  name: string;
  kind: Body["kind"];
  role: string;
  status: Body["status"];
  altitudeKm: number;
  speedKmS: number;
  periodMin: number;
  eccentricity: number;
  inclinationDeg: number;
  /** smallest guaranteed gap to any other body's keep-out sphere, km */
  clearanceKm: number;
  /** name of the nearest neighbour when it is known (within 1,500 km of keep-out contact) */
  nearestName: string | null;
  adjusted: number;
}

export interface SceneStats {
  simSeconds: number;
  fps: number;
  watchedPairs: number;
  intervalsChecked: number;
  violations: number;
  closestKm: number;
}

export interface FieldSummary {
  bodies: number;
  pairs: number;
  /** smallest guaranteed gap between any two keep-out spheres, km */
  minClearanceKm: number;
  /** paths nudged apart while the field was built */
  adjustments: number;
  heroPeriodMin: number;
}

export interface OrbitSceneOptions {
  container: HTMLElement;
  field: OrbitalField;
  lit17: boolean;
  reducedMotion: boolean;
  /** phones and low-power devices: fewer objects, lighter shading */
  compact: boolean;
  onReady?: (summary: FieldSummary) => void;
  onSelection?: (info: BodyInfo | null) => void;
  onStats?: (stats: SceneStats) => void;
  onEngagedChange?: (engaged: boolean) => void;
  onError?: (message: string) => void;
}

export type ViewMode = "overview" | "follow";

export interface OrbitSceneController {
  setLit(lit: boolean): void;
  setTimeScale(scale: number): void;
  setPaused(paused: boolean): void;
  setView(mode: ViewMode): void;
  zoom(factor: number): void;
  resetView(): void;
  setEngaged(engaged: boolean): void;
  select(id: string | null): void;
  /** simulated seconds for one orbit of Lantern 17 at the current time scale, in real seconds */
  heroOrbitRealSeconds(): number;
  dispose(): void;
}

/* ------------------------------------------------------------------ */

const R_PLANET = PLANET_RADIUS_KM / UNIT_KM;
const AMBER = new Color("#ffb547");
const EMBER = new Color("#ff6a2b");
const ICE = new Color("#7fd4e8");
const FROST = new Color("#dce6f0");

const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _v = new Vector3();
const _t = new Vector3();
const _g = new Vector3();
const ZERO = new Vector3();
const UP = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const _tmp = new Float64Array(3);

/** model km (z-up) -> scene units (y-up) */
function toScene(src: ArrayLike<number>, o: number, out: Vector3): Vector3 {
  return out.set(src[o] / UNIT_KM, src[o + 2] / UNIT_KM, -src[o + 1] / UNIT_KM);
}

function glowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,255,255,0.55)");
    g.addColorStop(0.45, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function irregularRock(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.72 + 0.5 * hash3(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100));
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** mergeGeometries needs every part indexed or every part not indexed; make them all non-indexed. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    // keep only the attributes every part has
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
  }
  return mergeGeometries(flat, false) ?? parts[0];
}

function satelliteGeometry(): BufferGeometry {
  const bus = new BoxGeometry(0.5, 0.42, 0.7);
  const left = new BoxGeometry(0.62, 0.03, 0.34);
  left.translate(-0.62, 0, 0);
  const right = new BoxGeometry(0.62, 0.03, 0.34);
  right.translate(0.62, 0, 0);
  const dish = new ConeGeometry(0.18, 0.2, 10);
  dish.rotateX(Math.PI / 2);
  dish.translate(0, 0, 0.45);
  return merge([bus, left, right, dish]);
}

function occludedByPlanet(camera: PerspectiveCamera, p: Vector3): boolean {
  const c = camera.position;
  _v.copy(p).sub(c);
  const len2 = _v.lengthSq();
  if (len2 < 1e-9) return false;
  const t = MathUtils.clamp(-c.dot(_v) / len2, 0, 1);
  _p.copy(c).addScaledVector(_v, t);
  return _p.length() < R_PLANET * 0.995;
}

interface TrailSpec {
  body: number;
  points: number;
  /** fraction of one orbit the tail covers */
  fraction: number;
  vertexStart: number;
}

export function createOrbitScene(opts: OrbitSceneOptions): OrbitSceneController {
  const { container, field, compact, reducedMotion } = opts;

  /* ---- renderer ---- */
  const renderer = new WebGLRenderer({
    antialias: !compact,
    alpha: false,
    powerPreference: "high-performance",
  });
  const maxDpr = compact ? 1.75 : 2;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x05070b, 1);
  const canvas = renderer.domElement;
  canvas.className = "orbit-canvas-el";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Interactive 3D view of Lantern 17 and nearby satellites, mission objects and ice debris orbiting Eclipse-01.",
  );
  container.appendChild(canvas);

  const scene = new Scene();
  scene.background = new Color(0x05070b);
  const camera = new PerspectiveCamera(42, 1, 0.05, 400);

  /* ---- bodies in play ---- */
  const debrisLimit = compact ? 24 : 40;
  let debrisSeen = 0;
  const bodies: Body[] = field.bodies.filter((b) => {
    if (b.kind !== "debris") return true;
    return debrisSeen++ < debrisLimit;
  });
  const nBodies = bodies.length;
  const modelPos = new Float64Array(nBodies * 3);
  const scenePos: Vector3[] = bodies.map(() => new Vector3());
  const heroIndex = bodies.findIndex((b) => b.id === HERO_ID);
  const hero = bodies[heroIndex];
  const byKind = {
    lantern: [] as number[],
    mission: [] as number[],
    satellite: [] as number[],
    debris: [] as number[],
  };
  bodies.forEach((b, i) => byKind[b.kind].push(i));
  const monitor = createSafetyMonitor(bodies);

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  /* ---- textures ---- */
  const manager = new LoadingManager();
  let readyFired = false;
  const fireReady = () => {
    if (readyFired) return;
    readyFired = true;
    opts.onReady?.({
      bodies: nBodies,
      pairs: (nBodies * (nBodies - 1)) / 2,
      minClearanceKm: field.stats.minClearanceKm,
      adjustments: field.stats.adjustments,
      heroPeriodMin: hero.period / 60,
    });
  };
  manager.onLoad = fireReady;
  manager.onError = fireReady; // render anyway; the planet falls back to a plain dark surface
  const loader = new TextureLoader(manager);
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), compact ? 2 : 8);
  const planetMap = loader.load("/textures/planet_map.jpg", (t) => {
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = maxAniso;
  });
  planetMap.colorSpace = SRGBColorSpace;
  track(planetMap);
  loader.load("/textures/starfield.jpg", (t) => {
    t.colorSpace = SRGBColorSpace;
    t.mapping = EquirectangularReflectionMapping;
    scene.background = t;
    scene.backgroundIntensity = 0.6;
    disposables.push(t);
  });
  const glowTex = track(glowTexture());

  /* ---- planet ---- */
  const planet = new Group();
  scene.add(planet);
  const planetMaterial = track(
    new MeshStandardMaterial({
      map: planetMap,
      roughness: 0.95,
      metalness: 0,
      emissive: new Color("#0c2b40"),
      emissiveMap: planetMap,
      emissiveIntensity: 0.55,
    }),
  );
  const planetGeo = track(new SphereGeometry(R_PLANET, compact ? 64 : 112, compact ? 44 : 72));
  const planetMesh = new Mesh(planetGeo, planetMaterial);
  planet.add(planetMesh);

  const atmoMaterial = track(
    new ShaderMaterial({
      uniforms: {
        uColor: { value: ICE.clone() },
        uStrength: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.8);
          gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
        }`,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  const atmoGeo = track(new SphereGeometry(R_PLANET * 1.028, compact ? 48 : 80, compact ? 32 : 56));
  scene.add(new Mesh(atmoGeo, atmoMaterial));

  /* ---- lights ---- */
  scene.add(new AmbientLight(0x7a97b5, 0.42));
  scene.add(new HemisphereLight(0x5b82a6, 0x07090e, 0.5));
  const fill = new DirectionalLight(0x9fd8ff, 0.5);
  fill.position.set(-30, 18, 24);
  scene.add(fill);

  const heroLight = new PointLight(0xffb547, 0, 0, 2);
  scene.add(heroLight);
  const neighbourLights: { light: PointLight; body: number }[] = [];
  const maxNeighbourLights = compact ? 1 : 3;
  for (const i of byKind.lantern) {
    if (neighbourLights.length >= maxNeighbourLights) break;
    if (bodies[i].status !== "online") continue;
    const light = new PointLight(0xffb547, 120, 0, 2);
    scene.add(light);
    neighbourLights.push({ light, body: i });
  }

  /* ---- lanterns ---- */
  interface LanternView {
    body: number;
    group: Group;
    coreMat: MeshBasicMaterial;
    plateMat: MeshStandardMaterial;
    glow: SpriteMaterial;
    glowSprite: Sprite;
    scale: number;
    phase: number;
  }
  const lanternViews: LanternView[] = [];
  const ringGeo = track(new RingGeometry(0.5, 1.0, 40));
  const rimGeo = track(new TorusGeometry(1.0, 0.055, 8, 48));
  const coreGeo = track(new SphereGeometry(0.4, 18, 14));
  const rimMat = track(new MeshStandardMaterial({ color: "#7d8ea6", metalness: 0.8, roughness: 0.4 }));
  for (const i of byKind.lantern) {
    const b = bodies[i];
    const group = new Group();
    const scale = b.visualKm / UNIT_KM;
    const coreMat = track(new MeshBasicMaterial({ color: AMBER.clone() }));
    const plateMat = track(
      new MeshStandardMaterial({
        color: "#4a586b",
        metalness: 0.7,
        roughness: 0.5,
        emissive: AMBER.clone(),
        emissiveIntensity: 0.3,
        side: DoubleSide,
      }),
    );
    group.add(new Mesh(coreGeo, coreMat));
    group.add(new Mesh(ringGeo, plateMat));
    group.add(new Mesh(rimGeo, rimMat));
    const glow = track(
      new SpriteMaterial({
        map: glowTex,
        color: AMBER.clone(),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    const glowSprite = new Sprite(glow);
    group.add(glowSprite);
    group.scale.setScalar(scale);
    scene.add(group);
    lanternViews.push({ body: i, group, coreMat, plateMat, glow, glowSprite, scale, phase: (i * 1.713) % TAU });
  }
  const heroView = lanternViews.find((l) => l.body === heroIndex) as LanternView;

  // Beam of light from Lantern 17 down to the surface it protects.
  const beamGeo = track(new ConeGeometry(1, 1, compact ? 24 : 40, 1, true));
  beamGeo.translate(0, -0.5, 0); // apex at origin, base at y = -1
  const beamMat = track(
    new MeshBasicMaterial({
      color: AMBER.clone(),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  const beam = new Mesh(beamGeo, beamMat);
  scene.add(beam);

  /* ---- mission objects ---- */
  interface MissionView {
    body: number;
    group: Group;
    beacon: SpriteMaterial;
    phase: number;
  }
  const missionViews: MissionView[] = [];
  const missionMat = track(
    new MeshStandardMaterial({
      color: "#c3d1e2",
      metalness: 0.55,
      roughness: 0.4,
      emissive: ICE.clone(),
      emissiveIntensity: 0.35,
    }),
  );
  const missionGeos: BufferGeometry[] = [
    merge([new OctahedronGeometry(0.62, 0), new TorusGeometry(1, 0.05, 8, 32)]),
    merge([new BoxGeometry(1.1, 0.6, 0.6), new BoxGeometry(0.1, 0.9, 1.6)]),
    new IcosahedronGeometry(0.8, 0),
    merge([new CapsuleGeometry(0.34, 0.9, 4, 10), new TorusGeometry(0.85, 0.04, 8, 32)]),
  ].map((g) => track(g));
  byKind.mission.forEach((i, k) => {
    const b = bodies[i];
    const group = new Group();
    group.add(new Mesh(missionGeos[k % missionGeos.length], missionMat));
    const beacon = track(
      new SpriteMaterial({
        map: glowTex,
        color: ICE.clone(),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    const spr = new Sprite(beacon);
    spr.scale.setScalar(4.2);
    group.add(spr);
    group.scale.setScalar(b.visualKm / UNIT_KM);
    scene.add(group);
    missionViews.push({ body: i, group, beacon, phase: k * 1.9 });
  });

  /* ---- satellites (instanced) ---- */
  const satGeo = track(satelliteGeometry());
  const satMat = track(new MeshStandardMaterial({ color: "#aebdd0", metalness: 0.78, roughness: 0.34 }));
  const sats = new InstancedMesh(satGeo, satMat, Math.max(1, byKind.satellite.length));
  sats.count = byKind.satellite.length;
  sats.instanceMatrix.setUsage(DynamicDrawUsage);
  sats.frustumCulled = false;
  scene.add(sats);

  /* ---- debris (instanced) ---- */
  const rockGeo = track(irregularRock());
  const rockMat = track(
    new MeshStandardMaterial({
      color: "#b4c4d6",
      roughness: 0.82,
      metalness: 0.05,
      flatShading: true,
      emissive: new Color("#0b1b2a"),
      emissiveIntensity: 0.7,
    }),
  );
  const rocks = new InstancedMesh(rockGeo, rockMat, Math.max(1, byKind.debris.length));
  rocks.count = byKind.debris.length;
  rocks.instanceMatrix.setUsage(DynamicDrawUsage);
  rocks.frustumCulled = false;
  scene.add(rocks);

  /* ---- trails ---- */
  const trails: TrailSpec[] = [];
  let vertexTotal = 0;
  const addTrail = (body: number, points: number, fraction: number) => {
    trails.push({ body, points, fraction, vertexStart: vertexTotal });
    vertexTotal += (points - 1) * 2;
  };
  const trailScale = compact ? 0.5 : 1;
  addTrail(heroIndex, Math.round(100 * trailScale), 0.38);
  byKind.lantern.forEach((i) => i !== heroIndex && addTrail(i, Math.round(40 * trailScale), 0.14));
  byKind.mission.forEach((i) => addTrail(i, Math.round(40 * trailScale), 0.14));
  byKind.satellite.forEach((i) => addTrail(i, Math.round(26 * trailScale), 0.06));
  byKind.debris.forEach((i) => addTrail(i, Math.round(14 * trailScale), 0.03));

  const trailPositions = new Float32Array(vertexTotal * 3);
  const trailColors = new Float32Array(vertexTotal * 3);
  const trailBase: Record<Body["kind"], { c: Color; k: number }> = {
    lantern: { c: AMBER, k: 0.55 },
    mission: { c: ICE, k: 0.5 },
    satellite: { c: ICE, k: 0.3 },
    debris: { c: FROST, k: 0.16 },
  };
  for (const t of trails) {
    const base = trailBase[bodies[t.body].kind];
    const boost = t.body === heroIndex ? 1.5 : 1;
    for (let k = 0; k < t.points - 1; k++) {
      for (let end = 0; end < 2; end++) {
        const f = Math.pow(1 - (k + end) / (t.points - 1), 1.6) * base.k * boost;
        const o = (t.vertexStart + k * 2 + end) * 3;
        trailColors[o] = base.c.r * f;
        trailColors[o + 1] = base.c.g * f;
        trailColors[o + 2] = base.c.b * f;
      }
    }
  }
  const trailGeo = track(new BufferGeometry());
  const trailPosAttr = new Float32BufferAttribute(trailPositions, 3);
  trailPosAttr.setUsage(DynamicDrawUsage);
  trailGeo.setAttribute("position", trailPosAttr);
  trailGeo.setAttribute("color", new Float32BufferAttribute(trailColors, 3));
  const trailMat = track(
    new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  const trailLines = new LineSegments(trailGeo, trailMat);
  trailLines.frustumCulled = false;
  scene.add(trailLines);

  /* ---- markers: faint glints so small objects stay readable when zoomed out ---- */
  const markerBodies = bodies.map((b, i) => (b.kind === "lantern" ? -1 : i)).filter((i) => i >= 0);
  const markerPos = new Float32Array(markerBodies.length * 3);
  const markerCol = new Float32Array(markerBodies.length * 3);
  markerBodies.forEach((bi, k) => {
    const kind = bodies[bi].kind;
    const c = kind === "debris" ? FROST : ICE;
    const f = kind === "debris" ? 0.55 : kind === "mission" ? 1 : 0.85;
    markerCol[3 * k] = c.r * f;
    markerCol[3 * k + 1] = c.g * f;
    markerCol[3 * k + 2] = c.b * f;
  });
  const markerGeo = track(new BufferGeometry());
  const markerPosAttr = new Float32BufferAttribute(markerPos, 3);
  markerPosAttr.setUsage(DynamicDrawUsage);
  markerGeo.setAttribute("position", markerPosAttr);
  markerGeo.setAttribute("color", new Float32BufferAttribute(markerCol, 3));
  const markerMat = track(
    new PointsMaterial({
      size: 7 * pixelRatio,
      sizeAttenuation: false,
      map: glowTex,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  const markers = new Points(markerGeo, markerMat);
  markers.frustumCulled = false;
  scene.add(markers);

  /* ---- orbit paths: Lantern 17 always, selected body on demand ---- */
  const orbitLineMat = (color: Color, opacity: number) =>
    track(new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  const orbitGeometry = (b: Body) => {
    const g = new BufferGeometry();
    const arr = new Float32Array((b.samples.length / 3) * 3);
    for (let k = 0; k < b.samples.length / 3; k++) {
      toScene(b.samples, 3 * k, _p);
      arr[3 * k] = _p.x;
      arr[3 * k + 1] = _p.y;
      arr[3 * k + 2] = _p.z;
    }
    g.setAttribute("position", new Float32BufferAttribute(arr, 3));
    return g;
  };
  const heroOrbit = new LineLoop(track(orbitGeometry(hero)), orbitLineMat(AMBER, 0.28));
  scene.add(heroOrbit);
  let selectedOrbit: LineLoop | null = null;
  const selectedOrbitMat = orbitLineMat(ICE, 0.6);

  /* ---- labels ---- */
  const makeTag = (cls: string) => {
    const el = document.createElement("div");
    el.className = `orbit-tag ${cls}`;
    el.style.opacity = "0";
    container.appendChild(el);
    return el;
  };
  const heroTag = makeTag("orbit-tag-hero");
  const selTag = makeTag("orbit-tag-sel");

  /* ---- state ---- */
  let litTarget = opts.lit17 ? 1 : 0;
  let lit = litTarget;
  let timeScale = 900;
  let paused = reducedMotion;
  let simT = 0;
  let lastSimT = Number.NaN;
  let view: ViewMode = "overview";
  let selected = -1;
  let engaged = false;
  let running = false;
  let visible = true;
  let disposed = false;
  let last = 0;
  const INTRO_SECONDS = 3.6;
  let introT = reducedMotion ? INTRO_SECONDS : 0;
  let transition = 0;
  let transitionLen = 0;
  let frames = 0;
  let ema = 1 / 60;
  let slowSince = 0;
  let nextTelemetry = 0;
  let nextStats = 0;

  /** Distance at which a 19,000 km radius (Lantern 17's wider orbit) fits the shorter side of the view. */
  const overviewDistance = () => {
    const aspect = camera.aspect || 1.6;
    return 19 / (Math.tan(MathUtils.degToRad(camera.fov / 2)) * Math.min(1, aspect));
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = compact ? 0.7 : 0.55;
  controls.zoomSpeed = 0.75;
  controls.minDistance = 8.5;
  controls.maxDistance = 100;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI - 0.04;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;

  const applyEngagement = () => {
    controls.enableZoom = engaged;
    // Not engaged: vertical swipes scroll the page and the wheel scrolls it too.
    canvas.style.touchAction = engaged ? "none" : "pan-y";
  };
  applyEngagement();

  const placeCameraDefault = () => {
    const d = overviewDistance();
    const polar = MathUtils.degToRad(68);
    const az = MathUtils.degToRad(32);
    camera.position.set(d * Math.sin(polar) * Math.sin(az), d * Math.cos(polar), d * Math.sin(polar) * Math.cos(az));
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
  };
  const introStartScale = 1.55;

  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    introT = INTRO_SECONDS; // the user took over: finish the fly-in immediately
    transition = 0;
  });

  const setEngaged = (next: boolean, notify = true) => {
    if (engaged === next) return;
    engaged = next;
    applyEngagement();
    if (notify) opts.onEngagedChange?.(engaged);
  };

  /* ---- sizing ---- */
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.9 ? 52 : 42;
    camera.updateProjectionMatrix();
  };
  resize();
  placeCameraDefault(); // after the first resize, so the distance uses the real aspect ratio
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ---- info + picking ---- */
  const nameOf = (id: string) => bodies.find((b) => b.id === id)?.name ?? null;
  const infoFor = (i: number): BodyInfo => {
    const b = bodies[i];
    const r = Math.hypot(modelPos[3 * i], modelPos[3 * i + 1], modelPos[3 * i + 2]);
    return {
      id: b.id,
      name: b.name,
      kind: b.kind,
      role: b.role,
      status: b.status,
      altitudeKm: r - PLANET_RADIUS_KM,
      speedKmS: speedAt(b, r),
      periodMin: b.period / 60,
      eccentricity: b.el.e,
      inclinationDeg: (b.el.i * 180) / Math.PI,
      clearanceKm: b.clearanceKm,
      nearestName: b.clearanceKm < 1_300 ? nameOf(b.nearestId) : null,
      adjusted: b.adjusted,
    };
  };

  const select = (i: number) => {
    selected = i;
    if (selectedOrbit) {
      scene.remove(selectedOrbit);
      selectedOrbit.geometry.dispose();
      selectedOrbit = null;
    }
    if (i >= 0 && i !== heroIndex) {
      selectedOrbit = new LineLoop(orbitGeometry(bodies[i]), selectedOrbitMat);
      scene.add(selectedOrbit);
    }
    opts.onSelection?.(i >= 0 ? infoFor(i) : null);
    selTag.style.opacity = "0";
    if (i >= 0) selTag.textContent = bodies[i].id;
  };

  const pickAt = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const limit = compact || matchMedia("(pointer: coarse)").matches ? 40 : 26;
    let best = -1;
    let bestD = limit;
    for (let i = 0; i < nBodies; i++) {
      _v.copy(scenePos[i]).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      const sx = (_v.x * 0.5 + 0.5) * rect.width;
      const sy = (-_v.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      // slightly favour the important bodies when several are under the finger
      const bias = bodies[i].kind === "debris" ? 1.15 : 1;
      if (d * bias < bestD && !occludedByPlanet(camera, scenePos[i])) {
        bestD = d * bias;
        best = i;
      }
    }
    select(best === selected ? -1 : best);
  };

  let downX = 0;
  let downY = 0;
  let downT = 0;
  const onPointerDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    if (e.pointerType === "mouse") setEngaged(true);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6 && performance.now() - downT < 450) {
      pickAt(e.clientX, e.clientY);
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  const onDocPointerDown = (e: PointerEvent) => {
    if (engaged && !container.contains(e.target as Node) && !(e.target as Element | null)?.closest?.(".orbit-controls")) {
      setEngaged(false);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setEngaged(false);
  };
  document.addEventListener("pointerdown", onDocPointerDown);
  document.addEventListener("keydown", onKey);

  const onContextLost = (e: Event) => {
    e.preventDefault();
    opts.onError?.("The graphics context was lost. Reload the page to restore the view.");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  /* ---- per-frame updates ---- */
  const writeTrails = () => {
    const arr = trailPosAttr.array as Float32Array;
    for (const t of trails) {
      const b = bodies[t.body];
      const dt = (t.fraction * b.period) / (t.points - 1);
      let px = 0;
      let py = 0;
      let pz = 0;
      for (let k = 0; k < t.points; k++) {
        positionAt(b, simT - k * dt, _tmp, 0);
        const x = _tmp[0] / UNIT_KM;
        const y = _tmp[2] / UNIT_KM;
        const z = -_tmp[1] / UNIT_KM;
        if (k > 0) {
          const o = (t.vertexStart + (k - 1) * 2) * 3;
          arr[o] = px;
          arr[o + 1] = py;
          arr[o + 2] = pz;
          arr[o + 3] = x;
          arr[o + 4] = y;
          arr[o + 5] = z;
        }
        px = x;
        py = y;
        pz = z;
      }
    }
    trailPosAttr.needsUpdate = true;
  };

  const updateBodies = (rt: number) => {
    for (let i = 0; i < nBodies; i++) {
      positionAt(bodies[i], simT, modelPos, 3 * i);
      toScene(modelPos, 3 * i, scenePos[i]);
    }

    for (let k = 0; k < markerBodies.length; k++) {
      const p = scenePos[markerBodies[k]];
      markerPos[3 * k] = p.x;
      markerPos[3 * k + 1] = p.y;
      markerPos[3 * k + 2] = p.z;
    }
    markerPosAttr.needsUpdate = true;

    for (const lv of lanternViews) {
      lv.group.position.copy(scenePos[lv.body]);
      lv.group.lookAt(ZERO);
    }
    for (const mv of missionViews) {
      const b = bodies[mv.body];
      mv.group.position.copy(scenePos[mv.body]);
      mv.group.quaternion.setFromAxisAngle(_s.set(b.spin.axis[0], b.spin.axis[1], b.spin.axis[2]), b.spin.phase + b.spin.rate * rt * 0.6);
      mv.beacon.opacity = 0.35 + 0.55 * Math.max(0, Math.sin(rt * 2.2 + mv.phase)) ** 4;
    }
    byKind.satellite.forEach((bi, k) => {
      const b = bodies[bi];
      _p.copy(scenePos[bi]);
      _m.lookAt(ZERO, _p, UP);
      _q.setFromRotationMatrix(_m);
      _q2.setFromAxisAngle(Z_AXIS, b.spin.phase + b.spin.rate * rt * 0.15);
      _q.multiply(_q2);
      const s = b.visualKm / UNIT_KM;
      _m.compose(_p, _q, _s.set(s, s, s));
      sats.setMatrixAt(k, _m);
    });
    sats.instanceMatrix.needsUpdate = true;
    byKind.debris.forEach((bi, k) => {
      const b = bodies[bi];
      _q.setFromAxisAngle(_v.set(b.spin.axis[0], b.spin.axis[1], b.spin.axis[2]), b.spin.phase + b.spin.rate * rt);
      const s = b.visualKm / UNIT_KM;
      _m.compose(scenePos[bi], _q, _s.set(b.shape[0] * s, b.shape[1] * s, b.shape[2] * s));
      rocks.setMatrixAt(k, _m);
    });
    rocks.instanceMatrix.needsUpdate = true;
  };

  const updateLights = (rt: number, dt: number) => {
    lit += (litTarget - lit) * (1 - Math.exp(-dt * 1.7));
    if (Math.abs(litTarget - lit) < 0.001) lit = litTarget;
    const flick = 0.5 + 0.5 * Math.sin(rt * 13.1) * Math.sin(rt * 7.3 + 1.7);
    const dropout = Math.sin(rt * 0.9 + 0.4) > 0.86 ? 0.25 : 1;

    // Lantern 17: dead and flickering ember, or steady amber once relit.
    const deadLevel = (0.22 + 0.5 * flick) * dropout;
    const level = MathUtils.lerp(deadLevel, 1, lit);
    heroView.coreMat.color.copy(EMBER).lerp(AMBER, lit).multiplyScalar(0.35 + 0.65 * level);
    heroView.plateMat.emissive.copy(EMBER).lerp(AMBER, lit);
    heroView.plateMat.emissiveIntensity = 0.05 + 0.9 * level * (0.25 + 0.75 * lit);
    heroView.glow.color.copy(EMBER).lerp(AMBER, lit);
    heroView.glow.opacity = MathUtils.lerp(0.3 * level, 0.95, lit);
    heroView.glowSprite.scale.setScalar(MathUtils.lerp(5.5, 13, lit));
    heroLight.color.copy(EMBER).lerp(AMBER, lit);
    heroLight.intensity = MathUtils.lerp(12 * level, 560, lit);
    heroLight.position.copy(scenePos[heroIndex]);

    for (const lv of lanternViews) {
      if (lv === heroView) continue;
      const b = bodies[lv.body];
      let l = 1;
      if (b.status === "damaged") {
        const f = 0.5 + 0.5 * Math.sin(rt * 5.2 + lv.phase) * Math.sin(rt * 2.9 + lv.phase * 2);
        l = 0.35 + 0.35 * f;
      }
      lv.coreMat.color.copy(AMBER).multiplyScalar(0.4 + 0.6 * l);
      lv.plateMat.emissiveIntensity = 0.1 + 0.5 * l;
      lv.glow.opacity = 0.7 * l;
      lv.glowSprite.scale.setScalar(b.status === "damaged" ? 6 : 8);
    }
    for (const nl of neighbourLights) nl.light.position.copy(scenePos[nl.body]);

    // Beam to the surface: _p is the Lantern, _v the sub-lantern surface point.
    const hp = scenePos[heroIndex];
    const len = hp.length();
    const altitude = Math.max(0.2, len - R_PLANET);
    beam.position.copy(hp);
    _v.copy(hp).normalize();
    beam.quaternion.setFromUnitVectors(_s.set(0, -1, 0), _p.copy(_v).multiplyScalar(-1));
    beam.scale.set(altitude * 0.22, altitude, altitude * 0.22);
    beamMat.opacity = 0.075 * lit;

    const strength = MathUtils.lerp(0.85, 1.25, lit);
    atmoMaterial.uniforms.uStrength.value = strength;
    (atmoMaterial.uniforms.uColor.value as Color).copy(ICE).lerp(AMBER, lit * 0.55);
  };

  /** Camera offset that frames Lantern 17 from above and behind, with the planet beneath it. */
  const followGoal = (out: Vector3) => {
    const hp = scenePos[heroIndex];
    positionAt(hero, simT + 40, _tmp, 0);
    toScene(_tmp, 0, _t).sub(hp).normalize(); // direction of travel
    _g.copy(hp).normalize(); // straight up from the surface
    // a narrow (portrait) frame needs the planet closer to straight ahead, so sit less far behind
    return out.copy(_g).multiplyScalar(2.4).addScaledVector(_t, camera.aspect < 0.9 ? -0.3 : -0.7);
  };

  const updateCamera = (dt: number) => {
    // fly-in
    if (introT < INTRO_SECONDS) {
      introT += dt;
      const k = Math.min(1, introT / INTRO_SECONDS);
      const e = 1 - Math.pow(1 - k, 3);
      const target = view === "follow" ? 3.4 : overviewDistance();
      _v.copy(camera.position).sub(controls.target);
      _v.setLength(MathUtils.lerp(target * introStartScale, target, e));
      camera.position.copy(controls.target).add(_v);
    }

    // follow: carry the orbit target (and the camera with it) along with Lantern 17
    const desired = view === "follow" ? scenePos[heroIndex] : ZERO;
    _p.copy(controls.target);
    const k = 1 - Math.exp(-dt * (view === "follow" ? (transition > 0 ? 3 : 16) : 3.2));
    controls.target.lerp(desired, k);
    camera.position.add(_v.copy(controls.target).sub(_p));

    if (transition > 0) {
      transition -= dt;
      const ease = 1 - Math.exp(-dt * 3.2);
      _v.copy(camera.position).sub(controls.target);
      if (view === "follow") {
        _v.lerp(followGoal(_p), ease);
      } else {
        _v.setLength(MathUtils.lerp(_v.length(), transitionLen, ease));
      }
      camera.position.copy(controls.target).add(_v);
    }
    controls.update(dt);
  };

  const updateLabels = () => {
    const rect = container.getBoundingClientRect();
    const place = (el: HTMLElement, p: Vector3, dx: number, dy: number) => {
      _v.copy(p).project(camera);
      const y = (-_v.y * 0.5 + 0.5) * rect.height + dy;
      const x = Math.min(Math.max((_v.x * 0.5 + 0.5) * rect.width + dx, 8), Math.max(8, rect.width - el.offsetWidth - 8));
      // occludedByPlanet reuses the scratch vectors, so read the projection first
      if (_v.z > 1 || occludedByPlanet(camera, p)) {
        el.style.opacity = "0";
        return;
      }
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = "1";
    };
    place(heroTag, scenePos[heroIndex], 16, -30);
    if (selected >= 0 && selected !== heroIndex) place(selTag, scenePos[selected], 14, -26);
    else selTag.style.opacity = "0";
  };
  let heroTagText = "";
  const refreshHeroTag = () => {
    const text = litTarget ? "LANTERN 17 · RELIT" : "LANTERN 17 · OFFLINE";
    if (text !== heroTagText) {
      heroTagText = text;
      heroTag.textContent = text;
      heroTag.classList.toggle("is-lit", litTarget === 1);
    }
  };
  refreshHeroTag();

  const frame = (nowMs: number) => {
    if (disposed) return;
    const rawDt = last ? (nowMs - last) / 1000 : 1 / 60;
    last = nowMs;
    const dt = Math.min(rawDt, 0.1);
    const rt = nowMs / 1000;

    ema = ema * 0.94 + rawDt * 0.06;
    frames++;
    if (ema > 0.027 && frames > 90) {
      slowSince += rawDt;
      if (slowSince > 2 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        markerMat.size = 7 * pixelRatio;
        resize();
        slowSince = 0;
        ema = 1 / 45;
      }
    } else {
      slowSince = 0;
    }

    if (!paused) simT += dt * timeScale;
    const moved = simT !== lastSimT;
    lastSimT = simT;

    planetMesh.rotation.y = (simT * TAU) / (20 * 3600);
    updateBodies(rt); // bodies tumble in real time even when the clock is paused
    if (moved) writeTrails();
    updateLights(rt, dt);
    updateCamera(dt);
    updateLabels();
    refreshHeroTag();

    if (!paused) monitor.step(simT);
    if (nowMs >= nextTelemetry) {
      nextTelemetry = nowMs + 250;
      if (selected >= 0) opts.onSelection?.(infoFor(selected));
    }
    if (nowMs >= nextStats) {
      nextStats = nowMs + 1000;
      opts.onStats?.({
        simSeconds: simT,
        fps: Math.round(1 / Math.max(ema, 1e-3)),
        watchedPairs: monitor.stats.pairsWatched,
        intervalsChecked: monitor.stats.intervalsChecked,
        violations: monitor.stats.violations,
        closestKm: monitor.stats.closestKm,
      });
    }
    renderer.render(scene, camera);
  };

  const syncLoop = () => {
    const shouldRun = visible && !document.hidden && !disposed;
    if (shouldRun && !running) {
      running = true;
      last = 0;
      renderer.setAnimationLoop(frame);
    } else if (!shouldRun && running) {
      running = false;
      renderer.setAnimationLoop(null);
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      syncLoop();
    },
    { threshold: 0 },
  );
  io.observe(container);
  document.addEventListener("visibilitychange", syncLoop);

  // First frame immediately so the stage is never blank while the loop starts.
  updateBodies(0);
  writeTrails();
  select(heroIndex);
  syncLoop();

  const heroPeriodSeconds = hero.period;

  return {
    setLit(next) {
      litTarget = next ? 1 : 0;
      refreshHeroTag();
    },
    setTimeScale(scale) {
      timeScale = scale;
    },
    setPaused(next) {
      paused = next;
    },
    setView(mode) {
      if (mode === view) return;
      view = mode;
      transition = 1.8;
      transitionLen = mode === "follow" ? 3.4 : overviewDistance();
      controls.minDistance = mode === "follow" ? 0.55 : 8.5;
      controls.maxDistance = mode === "follow" ? 40 : 100;
      controls.autoRotate = false;
      if (mode === "follow") select(heroIndex);
    },
    zoom(factor) {
      _v.copy(camera.position).sub(controls.target);
      const len = MathUtils.clamp(_v.length() * factor, controls.minDistance, controls.maxDistance);
      _v.setLength(len);
      camera.position.copy(controls.target).add(_v);
      transition = 0;
    },
    resetView() {
      view = "overview";
      controls.minDistance = 8.5;
      controls.maxDistance = 100;
      placeCameraDefault();
      introT = INTRO_SECONDS;
      transition = 0;
      controls.autoRotate = !reducedMotion;
    },
    setEngaged(next) {
      setEngaged(next, false);
    },
    select(id) {
      select(id ? bodies.findIndex((b) => b.id === id) : -1);
    },
    heroOrbitRealSeconds() {
      return heroPeriodSeconds / timeScale;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", syncLoop);
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      if (selectedOrbit) selectedOrbit.geometry.dispose();
      const seen = new Set<Material>();
      scene.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        const mat = mesh.material as Material | Material[] | undefined;
        if (!mat) return;
        for (const m of Array.isArray(mat) ? mat : [mat]) seen.add(m);
      });
      seen.forEach((m) => m.dispose());
      for (const d of disposables) d.dispose();
      sats.dispose();
      rocks.dispose();
      const bg = scene.background as Texture | Color | null;
      if (bg && "isTexture" in bg) bg.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      heroTag.remove();
      selTag.remove();
    },
  };
}
