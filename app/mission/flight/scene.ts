/**
 * The flight deck's 3D world. Floating origin: the ship is always at (0,0,0) and everything else is
 * placed relative to it in metres, so a 10 m ship and a 6,371 km planet render together without jitter.
 * The physics frame is used directly (z = Lantern 17's orbit normal); the camera's "up" follows the
 * local vertical, so the planet always sits below you.
 */
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { FlightSim } from "@/lib/flight/sim";
import { PORT_LOCAL } from "@/lib/flight/sim";
import { R_PLANET, frameOf, lvlhOf, norm, propagate, sub, type V3 } from "@/lib/flight/kepler";
import { R_L17 } from "@/lib/flight/plan";
import { createCinema, flareTexture, glowTexture, spaceEnvironment, tex, type Cinema } from "../../three/cinema";
import { buildLantern17, type Lantern17, type StationState } from "../../three/lantern17";
import { buildShip, type ShipModel } from "../../three/ship";
import type { EngineId, HullId, ShieldId } from "@/lib/game";

export type View = "chase" | "map" | "cockpit";

const N_LANTERNS = 24;

const PLANET_VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vObj;
  varying vec3 vWorld;
  void main() {
    vObj = normalize(position);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`;

const PLANET_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  #define N ${N_LANTERNS}
  uniform sampler2D uTex;
  uniform vec4 uLight[N];       // xyz: position relative to the planet centre, in planet radii; w: power
  uniform vec3 uCenter;         // planet centre, world
  uniform float uDim;           // eclipse dimming
  varying vec3 vObj;
  varying vec3 vWorld;
  const float PI = 3.14159265;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vObj);
    float lon = atan(n.x, n.y);
    float lat = asin(clamp(n.z, -1.0, 1.0));
    vec3 albedo = pow(texture2D(uTex, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI)).rgb, vec3(2.2));
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 diffuse = vec3(0.0);
    vec3 spec = vec3(0.0);
    for (int i = 0; i < N; i++) {
      vec4 L = uLight[i];
      if (L.w <= 0.0) continue;
      vec3 toL = L.xyz - n;
      float d2 = dot(toL, toL);
      vec3 l = toL * inversesqrt(d2);
      float ndl = dot(n, l);
      float aim = max(dot(normalize(L.xyz), l), 0.0);
      float a2 = aim * aim; float a8 = a2 * a2 * a2 * a2;
      float beam = 0.05 + 0.95 * a8 * a8;
      float e = L.w * beam / d2;
      vec3 col = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.86, 0.62), beam);
      diffuse += col * e * max((ndl + 0.12) / 1.12, 0.0);
      if (ndl > 0.0) {
        vec3 h = normalize(l + v);
        spec += col * e * ndl * pow(max(dot(n, h), 0.0), 60.0) * 0.6;
      }
    }
    vec3 starlight = vec3(0.010, 0.018, 0.032);
    vec3 c = albedo * (diffuse * 0.9 * uDim + starlight) + spec * 0.25 * uDim;
    // cold haze at the limb
    float limb = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    c += vec3(0.05, 0.11, 0.16) * limb * 0.35;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uDim;
  varying vec3 vObj; varying vec3 vWorld;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 v = normalize(cameraPosition - vWorld);
    float f = 1.0 - abs(dot(normalize(vObj), v));
    float a = pow(f, 5.0) * 0.55;
    gl_FragColor = vec4(vec3(0.32, 0.55, 0.78) * a * (0.35 + 0.65 * uDim), a);
  }
`;

interface Marker {
  x: number;
  y: number;
  on: boolean;
  dist: number;
}

const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

function makeLine(color: number, width: number, opacity: number, dashed = false): Line2 {
  const geo = new LineGeometry();
  geo.setPositions([0, 0, 0, 1, 0, 0]);
  const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity, dashed, dashSize: 60_000, gapSize: 40_000, depthWrite: false });
  const l = new Line2(geo, mat);
  l.frustumCulled = false;
  l.renderOrder = 2;
  return l;
}

function setLine(l: Line2, pts: V3[], origin: V3) {
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {
    arr[i * 3] = p[0] - origin[0];
    arr[i * 3 + 1] = p[1] - origin[1];
    arr[i * 3 + 2] = p[2] - origin[2];
  });
  const geo = new LineGeometry();
  geo.setPositions(arr);
  l.geometry.dispose();
  l.geometry = geo;
  if ((l.material as LineMaterial).dashed) l.computeLineDistances();
}

export class FlightScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly cinema: Cinema;
  private canvas: HTMLCanvasElement;
  private planet: THREE.Mesh;
  private planetMat: THREE.ShaderMaterial;
  private atmo: THREE.Mesh;
  private atmoMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private sky: THREE.Mesh;
  private lanterns: THREE.Sprite[] = [];
  private l17Flare: THREE.Sprite;
  private station: Lantern17;
  private ship: ShipModel;
  private ghost: Line2;
  private planned: Line2;
  private l17Orbit: Line2;
  private fragPath: Line2;
  private frag: THREE.Group;
  private fragStreak: Line2;
  private haze: THREE.InstancedMesh;
  private burnArrow: THREE.Group;
  private shipMarker: THREE.Sprite;
  private ambient: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private lanternLights: V3[] = [];
  private lanternPhase: number[] = [];

  view: View = "chase";
  /** camera orbit around the ship (chase) or the planet (map) */
  yaw = Math.PI * 0.92;
  pitch = 0.28;
  dist = 38;
  mapDist = 2.7 * R_PLANET;
  mapYaw = 0;
  mapPitch = 1.42;
  /** a cinematic shot overriding the camera: kind and time left */
  shot: { kind: "arrive" | "pass" | "dock" | "custom"; t: number; dur: number; off?: number[]; look?: number[] } | null = null;
  private time = 0;
  private lastLineAt = -1;
  private shake = 0;
  private flash = 0;
  private bars = 0;

  constructor(canvas: HTMLCanvasElement, opts: { hull: HullId; engine: EngineId; shield: ShieldId }) {
    this.canvas = canvas;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1e10);
    this.cinema = createCinema(canvas, this.scene, this.camera);
    const env = spaceEnvironment(this.cinema.renderer);
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;

    // light: the planet's cold glow from below, Lantern 17's warm light as the key, and a faint
    // starlight rim so the silhouette reads against black
    this.ambient = new THREE.HemisphereLight(0x0c1220, 0x2a3c52, 1.1);
    this.scene.add(this.ambient);
    this.key = new THREE.DirectionalLight(0xffc489, 1.6);
    this.scene.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(0x7f9cff, 0.55);
    this.scene.add(this.rim, this.rim.target);

    // stars: a few thousand points of real-ish colours and brightnesses
    const N = 7000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      // more stars near a galactic band
      const band = rnd() < 0.35 ? (rnd() - 0.5) * 0.25 : u;
      const ss = Math.sqrt(1 - band * band);
      pos.set([Math.cos(th) * (rnd() < 0.35 ? ss : s) * 1e9, (rnd() < 0.35 ? band : u) * 1e9, Math.sin(th) * (rnd() < 0.35 ? ss : s) * 1e9], i * 3);
      const m = Math.pow(rnd(), 6);
      const tint = rnd();
      const c = tint < 0.15 ? [1.0, 0.78, 0.6] : tint < 0.3 ? [0.7, 0.8, 1.0] : [0.95, 0.95, 1.0];
      const b = 0.15 + m * 2.2;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, map: glowTexture(), blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    this.scene.add(this.stars);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex("/textures/starfield.jpg"), side: THREE.BackSide, depthWrite: false, transparent: true, opacity: 0.35 });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2e9, 48, 24), skyMat);
    this.sky.renderOrder = -3;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // planet
    const lights = Array.from({ length: N_LANTERNS }, () => new THREE.Vector4());
    this.planetMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex("/textures/planet_map.jpg", { srgb: false }) }, uLight: { value: lights }, uCenter: { value: new THREE.Vector3() }, uDim: { value: 1 } },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(R_PLANET, 192, 128), this.planetMat);
    this.planet.frustumCulled = false;
    this.scene.add(this.planet);
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: { uDim: { value: 1 } },
      vertexShader: PLANET_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R_PLANET * 1.025, 128, 64), this.atmoMat);
    this.atmo.frustumCulled = false;
    this.scene.add(this.atmo);

    // the Lantern network: three rings of eight, Lantern 17 in ours
    for (let i = 0; i < N_LANTERNS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd09a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }));
      s.scale.setScalar(0.022);
      s.renderOrder = 1;
      this.scene.add(s);
      this.lanterns.push(s);
      this.lanternPhase.push((i % 8) * (Math.PI / 4) + Math.floor(i / 8) * 0.37);
      this.lanternLights.push([0, 0, 0]);
    }
    this.l17Flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTexture(), color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }));
    this.l17Flare.scale.setScalar(0.09);
    this.l17Flare.renderOrder = 1;
    this.scene.add(this.l17Flare);

    this.station = buildLantern17();
    this.scene.add(this.station.group);
    this.ship = buildShip(opts.hull, opts.engine, opts.shield);
    this.scene.add(this.ship.group);

    // orbit lines
    this.ghost = makeLine(0xffb766, 2.2, 0.95);
    this.planned = makeLine(0x6fe3ff, 1.8, 0.85, true);
    this.l17Orbit = makeLine(0xffffff, 1.2, 0.22);
    this.fragPath = makeLine(0xff4d3d, 1.6, 0.8);
    this.scene.add(this.ghost, this.planned, this.l17Orbit, this.fragPath);

    // the fragment: a tumbling lump of dirty ice and a streak
    this.frag = new THREE.Group();
    const fg = new THREE.IcosahedronGeometry(1.4, 2);
    const fp = fg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const k = 0.7 + 0.5 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
      fp.setXYZ(i, fp.getX(i) * k, fp.getY(i) * k * 0.8, fp.getZ(i) * k);
    }
    fg.computeVertexNormals();
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xa9c7d6, roughness: 0.35, metalness: 0.05, emissive: 0x0a2030, emissiveIntensity: 0.6 });
    try {
      iceMat.map = tex("/textures/frost.jpg");
    } catch {
      /* browser only */
    }
    this.frag.add(new THREE.Mesh(fg, iceMat));
    const fglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xbfe6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fglow.scale.setScalar(16);
    this.frag.add(fglow);
    this.frag.visible = false;
    this.scene.add(this.frag);
    this.fragStreak = makeLine(0xd8f2ff, 3, 0.9);
    this.fragStreak.visible = false;
    this.scene.add(this.fragStreak);

    // the ice haze
    const hg = new THREE.IcosahedronGeometry(1, 1);
    const hp = hg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      const k = 0.75 + 0.45 * ((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) / 2;
      hp.setXYZ(i, hp.getX(i) * k, hp.getY(i) * k * 0.85, hp.getZ(i) * k * 1.1);
    }
    hg.computeVertexNormals();
    this.haze = new THREE.InstancedMesh(hg, iceMat, 64);
    this.haze.count = 0;
    this.haze.castShadow = true;
    this.haze.frustumCulled = false;
    this.scene.add(this.haze);

    // the burn arrow
    this.burnArrow = new THREE.Group();
    const am = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.95, 1.2), transparent: true, opacity: 0.9, depthWrite: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 8), am);
    shaft.position.y = 5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 16), am);
    head.position.y = 10.8;
    this.burnArrow.add(shaft, head);
    this.burnArrow.visible = false;
    this.scene.add(this.burnArrow);

    this.shipMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false }));
    this.shipMarker.scale.setScalar(0.03);
    this.shipMarker.visible = false;
    this.scene.add(this.shipMarker);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cinema.setSize(w, h);
    const res = new THREE.Vector2(w, h);
    for (const l of [this.ghost, this.planned, this.l17Orbit, this.fragPath, this.fragStreak]) (l.material as LineMaterial).resolution.copy(res);
  }

  hit(strength = 1) {
    this.shake = Math.max(this.shake, 0.6 * strength);
    this.flash = Math.max(this.flash, strength);
  }

  /** Lantern positions (absolute, metres) at sim time t, with Lantern 17 from the sim. */
  private lanternPositions(sim: FlightSim): V3[] {
    const l17 = sim.l17.r;
    const n = Math.sqrt(3.986e14 / R_L17 ** 3);
    const base = Math.atan2(l17[1], l17[0]);
    const out: V3[] = [];
    for (let i = 0; i < N_LANTERNS; i++) {
      const ring = Math.floor(i / 8);
      if (i === 0) {
        out.push(l17);
        continue;
      }
      const inc = ring === 0 ? 0 : (60 * Math.PI) / 180;
      const raan = ring * ((2 * Math.PI) / 3);
      const th = (ring === 0 ? base : 0) + this.lanternPhase[i] + (ring === 0 ? 0 : n * sim.t);
      const x = Math.cos(th) * R_L17;
      const y0 = Math.sin(th) * R_L17;
      const y = y0 * Math.cos(inc);
      const z = y0 * Math.sin(inc);
      out.push([x * Math.cos(raan) - y * Math.sin(raan), x * Math.sin(raan) + y * Math.cos(raan), z]);
    }
    return out;
  }

  /** Draw a frame. `dt` is wall time; `station` comes from the game state. */
  frame(sim: FlightSim, dt: number, st: StationState, eclipse: boolean): { l17: Marker; frag: Marker; port: Marker } {
    this.time += dt;
    const o = sim.ship.r;
    const rel = (p: V3) => new THREE.Vector3(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
    const up = v3(frameOf(sim.ship).rad);

    // planet and lights
    const center = rel([0, 0, 0]);
    this.planet.position.copy(center);
    this.atmo.position.copy(center);
    this.planetMat.uniforms.uCenter.value.copy(center);
    const dim = eclipse ? 0.28 : 1;
    this.planetMat.uniforms.uDim.value = dim;
    this.atmoMat.uniforms.uDim.value = dim;
    const lp = this.lanternPositions(sim);
    const lights = this.planetMat.uniforms.uLight.value as THREE.Vector4[];
    lp.forEach((p, i) => {
      const power = i === 0 ? (st.dark ? 0 : 0.05 * st.output) : 0.05;
      lights[i].set(p[0] / R_PLANET, p[1] / R_PLANET, p[2] / R_PLANET, power);
      const s = this.lanterns[i];
      s.position.copy(rel(p));
      const m = s.material as THREE.SpriteMaterial;
      m.opacity = (i === 0 ? 0 : 0.9) * (eclipse ? 0.35 : 1);
    });

    // Lantern 17 and its flare
    const l17 = sim.l17;
    const f = lvlhOf(l17);
    const l17rel = rel(l17.r);
    const l17d = l17rel.length();
    this.station.group.position.copy(l17rel);
    const basis = new THREE.Matrix4().makeBasis(v3(f.vbar), v3(f.rbar), v3(f.hbar).multiplyScalar(-1));
    this.station.group.quaternion.setFromRotationMatrix(basis);
    if (this.station.driftAngle) this.station.group.rotateZ(this.station.driftAngle);
    this.station.group.visible = l17d < 400_000;
    this.station.group.updateMatrixWorld();
    this.station.update(this.time, st, this.camera);
    this.l17Flare.position.copy(l17rel).add(v3(f.rbar).multiplyScalar(-8));
    const fm = this.l17Flare.material as THREE.SpriteMaterial;
    const flick = st.dark ? 0 : st.output * (0.85 + 0.15 * Math.sin(this.time * 7.3));
    fm.opacity = Math.min(1, (l17d > 3000 ? 1 : l17d / 3000) * flick * (eclipse ? 0.5 : 1));
    this.l17Flare.scale.setScalar(0.05 + 0.06 * flick);

    // ship
    const att = v3(sim.att);
    const shipUp = up.clone().sub(att.clone().multiplyScalar(up.dot(att))).normalize();
    const shipZ = new THREE.Vector3().crossVectors(att, shipUp);
    this.ship.group.position.set(0, 0, 0);
    this.ship.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(att, shipUp, shipZ));
    const rcsLocal = new THREE.Vector3(sim.rcs[0], sim.rcs[1], sim.rcs[2]);
    this.ship.update(this.time, sim.thrusting ? 1 : 0, sim.rcsActive ? rcsLocal : new THREE.Vector3(), sim.aligning ? 1 : 0);
    const floods = sim.mode === "approach" || sim.mode === "docked" || l17d < 3000 ? 1 : 0;
    this.ship.floods.forEach((s) => (s.intensity = floods * 9000));

    // lines, recomputed a few times a second (cheap enough, exact)
    // seen from beside the ship you sit inside your own orbit's plane, so orbits collapse into lines:
    // like real flight software, they live on the map (and in the HUD's orbit scope)
    const showLines = this.view === "map";
    this.ghost.visible = showLines;
    this.planned.visible = showLines && !!sim.node;
    this.l17Orbit.visible = showLines;
    if (this.time - this.lastLineAt > 0.25 || sim.thrusting) {
      this.lastLineAt = this.time;
      const e = sim.orbitInfo();
      const period = Number.isFinite(e.periodMin) ? e.periodMin * 60 : 3 * 3600;
      setLine(this.ghost, sim.predict(Math.min(period, 4 * 3600), 220), o);
      const plan = sim.plannedOrbit(180);
      if (plan) setLine(this.planned, plan, o);
      const T = 2 * Math.PI * Math.sqrt(R_L17 ** 3 / 3.986e14);
      setLine(this.l17Orbit, sim.predict(T, 200, l17), o);
    }
    const mapW = this.view === "map";
    (this.ghost.material as LineMaterial).linewidth = mapW ? 2.6 : 2;
    (this.planned.material as LineMaterial).linewidth = mapW ? 2.2 : 1.6;

    // the fragment
    const c = sim.conj;
    const fragOn = c.state === "alert" || (c.state !== "pending" && Math.abs(sim.t - c.tca) < 4);
    let fragMarker: Marker = { x: 0, y: 0, on: false, dist: 0 };
    if (fragOn) {
      const fs = sim.fragAt();
      const frel = rel(fs.r);
      const fd = frel.length();
      this.frag.visible = fd < 60_000;
      this.frag.position.copy(frel);
      this.frag.rotation.x += dt * 2.1;
      this.frag.rotation.y += dt * 1.3;
      // streak: where it was a moment ago (motion blur in the slow shot)
      const back = propagate(fs, sim.slowmo > 0 ? -0.06 : -0.25).r;
      this.fragStreak.visible = fd < 60_000;
      setLine(this.fragStreak, [fs.r, back], o);
      this.fragPath.visible = this.view === "map" || fd > 2000;
      if (this.fragPath.visible) setLine(this.fragPath, [propagate(fs, -600).r, fs.r, propagate(fs, Math.max(60, c.tca - sim.t + 300)).r], o);
      fragMarker = this.project(frel, fd);
    } else {
      this.frag.visible = false;
      this.fragStreak.visible = false;
      this.fragPath.visible = false;
    }

    // the haze
    if (sim.chunks.length) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let n = 0;
      for (const ch of sim.chunks) {
        if (n >= 64) break;
        const p = rel(ch.s.r);
        q.setFromEuler(new THREE.Euler(this.time * ch.spin[0], this.time * ch.spin[1], this.time * ch.spin[2]));
        m.compose(p, q, new THREE.Vector3(ch.size, ch.size, ch.size));
        this.haze.setMatrixAt(n++, m);
      }
      this.haze.count = n;
      this.haze.instanceMatrix.needsUpdate = true;
    } else this.haze.count = 0;

    // burn arrow
    const node = sim.node;
    const remain = norm(sim.remaining);
    this.burnArrow.visible = this.view === "chase" && !!node && remain > 0.05 && sim.t > node.t - 900;
    if (this.burnArrow.visible) {
      const d = v3(sim.remaining).normalize();
      this.burnArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      this.burnArrow.position.copy(d.clone().multiplyScalar(this.ship.length * 0.6));
      const k = 0.6 + 0.15 * Math.sin(this.time * 6);
      this.burnArrow.scale.setScalar(k);
    }

    // the key light comes from Lantern 17 (warm, flickering with it); the rim from behind the camera's side
    const toL17 = l17rel.clone().normalize();
    this.key.position.copy(toL17.clone().multiplyScalar(100));
    this.key.target.position.set(0, 0, 0);
    this.key.intensity = (st.dark ? 0.15 : 0.5 + 1.3 * flick) * (eclipse ? 0.5 : 1);
    this.rim.position.copy(up.clone().multiplyScalar(60).add(v3(frameOf(sim.ship).pro).multiplyScalar(-80)));
    this.ambient.intensity = eclipse ? 0.6 : 1.1;

    // camera
    this.placeCamera(sim, up, dt, l17rel, f);

    // stars and sky follow the camera (they are at infinity); exposure drops near bright things
    this.stars.position.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    const bright = l17d < 2000 ? 1 - l17d / 2000 : 0;
    this.starMat.opacity = 0.95 - 0.6 * bright;
    (this.sky.material as THREE.MeshBasicMaterial).opacity = 0.32 - 0.22 * bright;

    // map marker
    this.shipMarker.visible = this.view === "map";

    // grade
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const wantBars = this.shot ? 1 : 0;
    this.bars += (wantBars - this.bars) * Math.min(1, dt * 3);
    const g = this.cinema.grade.uniforms;
    g.uFlash.value = this.flash;
    g.uBars.value = this.bars;
    g.uDesat.value = sim.mode === "lost" ? 0.6 : 0;
    this.cinema.render(dt);

    const portW = l17rel.clone().add(v3(f.vbar).multiplyScalar(PORT_LOCAL[0]));
    return { l17: this.project(l17rel, l17d), frag: fragMarker, port: this.project(portW, portW.length()) };
  }

  private placeCamera(sim: FlightSim, up: THREE.Vector3, dt: number, l17rel: THREE.Vector3, f: ReturnType<typeof lvlhOf>) {
    const cam = this.camera;
    const fwd = v3(frameOf(sim.ship).pro);
    const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
    this.shake = Math.max(0, this.shake - dt * 1.2);
    const jitter = () => (Math.random() - 0.5) * this.shake;

    if (this.shot) {
      this.shot.t += dt;
      const k = Math.min(1, this.shot.t / this.shot.dur);
      const ease = k * k * (3 - 2 * k);
      if (this.shot.kind === "custom" && this.shot.off && this.shot.look) {
        // a camera placed in the station's own frame (used for stills)
        const vbar = v3(f.vbar);
        const rbar = v3(f.rbar);
        const hbar = v3(f.hbar).multiplyScalar(-1);
        const at = (p: number[]) => l17rel.clone().add(vbar.clone().multiplyScalar(p[0])).add(rbar.clone().multiplyScalar(p[1])).add(hbar.clone().multiplyScalar(p[2]));
        cam.position.copy(at(this.shot.off));
        cam.up.copy(rbar);
        cam.lookAt(at(this.shot.look));
        return;
      }
      if (this.shot.kind === "arrive") {
        // a slow push-in past the station's flank, then settle behind the ship
        const vbar = v3(f.vbar);
        const rbar = v3(f.rbar);
        const hbar = v3(f.hbar);
        const startPos = l17rel.clone().add(vbar.clone().multiplyScalar(-160)).add(rbar.clone().multiplyScalar(-28)).add(hbar.clone().multiplyScalar(70));
        const endPos = new THREE.Vector3().add(fwd.clone().multiplyScalar(-26)).add(up.clone().multiplyScalar(7)).add(side.clone().multiplyScalar(6));
        cam.position.lerpVectors(startPos, endPos, ease);
        cam.up.copy(up);
        cam.lookAt(l17rel.clone().multiplyScalar(1 - ease * 0.15));
      } else if (this.shot.kind === "pass") {
        // side-on to the ship, close, so the fragment crosses the frame
        cam.position.copy(side.clone().multiplyScalar(-24).add(up.clone().multiplyScalar(5)).add(fwd.clone().multiplyScalar(-8)));
        cam.up.copy(up);
        cam.lookAt(0, 0, 0);
      } else {
        // docked: a slow orbit round the joined ship and station
        const a = this.shot.t * 0.06;
        const vbar = v3(f.vbar);
        const rbar = v3(f.rbar);
        const hbar = v3(f.hbar);
        const c = l17rel.clone().add(vbar.clone().multiplyScalar(-20));
        cam.position.copy(c.clone().add(vbar.clone().multiplyScalar(-60 * Math.cos(a))).add(hbar.clone().multiplyScalar(60 * Math.sin(a))).add(rbar.clone().multiplyScalar(-14)));
        cam.up.copy(rbar);
        cam.lookAt(c);
      }
      cam.position.x += jitter();
      cam.position.y += jitter();
      if (this.shot.kind !== "dock" && this.shot.t >= this.shot.dur) this.shot = null;
      return;
    }

    if (this.view === "map") {
      const center = new THREE.Vector3(-sim.ship.r[0], -sim.ship.r[1], -sim.ship.r[2]);
      const h = new THREE.Vector3(0, 0, 1);
      const x = new THREE.Vector3(1, 0, 0);
      const y = new THREE.Vector3(0, 1, 0);
      const dir = x
        .clone()
        .multiplyScalar(Math.cos(this.mapPitch) * Math.cos(this.mapYaw))
        .add(y.clone().multiplyScalar(Math.cos(this.mapPitch) * Math.sin(this.mapYaw)))
        .add(h.clone().multiplyScalar(Math.sin(this.mapPitch)));
      cam.position.copy(center.clone().add(dir.multiplyScalar(this.mapDist)));
      cam.up.copy(h);
      cam.lookAt(center);
      cam.fov = 45;
      cam.updateProjectionMatrix();
      return;
    }

    if (this.view === "cockpit") {
      const att = v3(sim.att);
      const shipUp = up.clone().sub(att.clone().multiplyScalar(up.dot(att))).normalize();
      cam.position.copy(att.clone().multiplyScalar(this.ship.length / 2 + 0.6));
      cam.up.copy(shipUp);
      cam.lookAt(att.clone().multiplyScalar(1000));
      cam.fov = 50;
      cam.updateProjectionMatrix();
      cam.position.x += jitter() * 0.3;
      cam.position.y += jitter() * 0.3;
      return;
    }

    // chase: orbit around the ship in its local frame (forward = velocity, up = away from the planet)
    const dir = fwd
      .clone()
      .multiplyScalar(Math.cos(this.pitch) * Math.cos(this.yaw))
      .add(side.clone().multiplyScalar(Math.cos(this.pitch) * Math.sin(this.yaw)))
      .add(up.clone().multiplyScalar(Math.sin(this.pitch)));
    const target = new THREE.Vector3();
    // near the station, frame both
    const l17d = l17rel.length();
    if (l17d < 600) target.copy(l17rel).multiplyScalar(0.18 * (1 - l17d / 600));
    cam.position.copy(target.clone().add(dir.multiplyScalar(this.dist)));
    cam.up.copy(up);
    cam.lookAt(target);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    cam.position.x += jitter();
    cam.position.y += jitter();
  }

  private project(p: THREE.Vector3, dist: number): Marker {
    const v = p.clone().project(this.camera);
    const on = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, on, dist };
  }

  dispose() {
    this.station.dispose();
    this.ship.dispose();
    this.cinema.dispose();
  }
}

export { sub };
