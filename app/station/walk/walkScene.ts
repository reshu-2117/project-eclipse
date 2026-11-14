/**
 * The spacewalk: first person, outside Lantern 17.
 *
 * You move the way astronauts do: hand over hand along the yellow rails, gliding between handholds.
 * Pick a zone and you glide there along the spine; drag to look around. The planet hangs 1,000 km
 * below, lit only by the Lanterns' pools of light; the Kiln burns over your head.
 */
import * as THREE from "three";
import type { EngineId, HullId, ShieldId, ZoneId } from "@/lib/game";
import { R_PLANET } from "@/lib/flight/kepler";
import { createCinema, glowTexture, spaceEnvironment, tex, type Cinema } from "../../three/cinema";
import { buildLantern17, type Lantern17, type StationState } from "../../three/lantern17";
import { buildShip } from "../../three/ship";
import { ATMO_FRAG, N_LANTERNS, PLANET_FRAG, PLANET_VERT } from "../../mission/flight/scene";

/** Where you hang to look at each zone, and what you look at (station frame, metres). */
export const VIEWS: Record<ZoneId, { at: [number, number, number]; look: [number, number, number] }> = {
  dock: { at: [-31, 4.2, 6.5], look: [-38, 0.5, 0] },
  spine: { at: [-14, 3.6, 5.2], look: [-18, 0, 1.5] },
  radiators: { at: [6, 4.2, 14.5], look: [3.5, 0.1, 9.3] },
  mast: { at: [7, 17, 4.5], look: [4, 21, 0] },
  kiln: { at: [33, -2.5, 8], look: [44, -3.5, 0] },
  petals: { at: [52, -2, 16], look: [50, 7, 9] },
};

/** The rail you glide along between zones: a line along the spine's top corner. */
const RAIL_Y = 2.9;
const RAIL_Z = 2.9;

export interface Pin {
  id: string;
  label: string;
  at: THREE.Vector3;
  tone: "clue" | "hazard" | "fixed";
}

export interface ScreenPin {
  id: string;
  label: string;
  x: number;
  y: number;
  on: boolean;
  tone: Pin["tone"];
}

export class WalkScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.05, 1e10);
  readonly cinema: Cinema;
  readonly station: Lantern17;
  private planetMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private pinSprites = new Map<string, THREE.Sprite>();
  private path: THREE.CatmullRomCurve3 | null = null;
  private pathT = 0;
  private pathDur = 1;
  private lookFrom = new THREE.Vector3();
  private lookTo = new THREE.Vector3();
  private time = 0;
  /** where you are and what you're looking at */
  pos = new THREE.Vector3(...VIEWS.dock.at);
  look = new THREE.Vector3(...VIEWS.dock.look);
  /** free-look offsets (drag) */
  yaw = 0;
  pitch = 0;
  zone: ZoneId = "dock";
  moving = false;
  thermal = false;
  /** a slow orbit round the station (the survey) */
  survey = 0;
  private headlamp: THREE.SpotLight;

  constructor(canvas: HTMLCanvasElement, opts: { hull: HullId; engine: EngineId; shield: ShieldId }) {
    this.cinema = createCinema(canvas, this.scene, this.camera);
    this.scene.environment = spaceEnvironment(this.cinema.renderer);
    this.scene.environmentIntensity = 0.55;
    this.scene.add(new THREE.HemisphereLight(0x0c1220, 0x2a3c52, 1.0));

    // stars
    const N = 6000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let seed = 99173;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * 1e9, u * 1e9, Math.sin(th) * s * 1e9], i * 3);
      const b = 0.15 + Math.pow(rnd(), 6) * 2.2;
      const t = rnd();
      const c = t < 0.15 ? [1, 0.8, 0.62] : t < 0.3 ? [0.72, 0.82, 1] : [0.95, 0.95, 1];
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, map: glowTexture(), blending: THREE.AdditiveBlending }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // the planet, 1,000 km below; the Lanterns' pools of light on it
    const lights = Array.from({ length: N_LANTERNS }, (_, i) => {
      if (i === 0) return new THREE.Vector4(0, 0, (R_PLANET + 1e6) / R_PLANET, 0.05);
      const a = (i / N_LANTERNS) * Math.PI * 2 * 2.618;
      const lat = Math.asin(((i * 0.37) % 1) * 2 - 1) * 0.8;
      const r = (R_PLANET + 1e6) / R_PLANET;
      return new THREE.Vector4(Math.cos(lat) * Math.cos(a) * r, Math.cos(lat) * Math.sin(a) * r, Math.sin(lat) * r, 0.05);
    });
    this.planetMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex("/textures/planet_map.jpg", { srgb: false }) }, uLight: { value: lights }, uCenter: { value: new THREE.Vector3() }, uDim: { value: 1 } },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });
    // the shader uses z as the planet's up; turn it so +z points at the station
    const planet = new THREE.Mesh(new THREE.SphereGeometry(R_PLANET, 160, 100), this.planetMat);
    planet.rotation.x = -Math.PI / 2;
    planet.position.set(0, -(R_PLANET + 1e6), 0);
    planet.frustumCulled = false;
    this.scene.add(planet);
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R_PLANET * 1.025, 96, 48),
      new THREE.ShaderMaterial({ uniforms: { uDim: { value: 1 } }, vertexShader: PLANET_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }),
    );
    atmo.position.copy(planet.position);
    atmo.frustumCulled = false;
    this.scene.add(atmo);

    // the station, and your ship docked at its port
    this.station = buildLantern17();
    this.scene.add(this.station.group);
    const ship = buildShip(opts.hull, opts.engine, opts.shield);
    ship.group.position.set(-38 - ship.length / 2 - 0.1, 0, 0);
    this.scene.add(ship.group);
    ship.floods.forEach((f) => (f.intensity = 0));

    // a cool rim from the planet side, a dim warm key from the Kiln's direction
    const rim = new THREE.DirectionalLight(0x7f9cff, 0.45);
    rim.position.set(-40, -60, 30);
    this.scene.add(rim);

    // your helmet lamp
    this.headlamp = new THREE.SpotLight(0xf4f7ff, 160, 60, 0.42, 0.5, 1.4);
    this.scene.add(this.headlamp, this.headlamp.target);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.cinema.setSize(w, h);
  }

  /** Glide to a zone along the rail. Returns the glide time in seconds. */
  goTo(z: ZoneId): number {
    if (z === this.zone && !this.moving) return 0;
    const v = VIEWS[z];
    const target = new THREE.Vector3(...v.at);
    const pts = [this.pos.clone()];
    const railFrom = new THREE.Vector3(this.pos.x, RAIL_Y, RAIL_Z);
    const railTo = new THREE.Vector3(Math.max(-30, Math.min(38, target.x)), RAIL_Y, RAIL_Z);
    if (this.pos.distanceTo(railFrom) > 2) pts.push(railFrom.clone().lerp(this.pos, 0.3));
    pts.push(new THREE.Vector3(Math.max(-30, Math.min(38, this.pos.x)), RAIL_Y, RAIL_Z));
    if (Math.abs(railTo.x - railFrom.x) > 6) pts.push(railFrom.clone().lerp(railTo, 0.5).setX((railFrom.x + railTo.x) / 2));
    pts.push(railTo);
    pts.push(target);
    this.path = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.4);
    const len = this.path.getLength();
    // a steady glide: about 3 m/s along the rail (time is compressed: the engine charges the real hours)
    this.pathDur = Math.max(2.2, len / 6);
    this.pathT = 0;
    this.lookFrom.copy(this.look);
    this.lookTo.set(...v.look);
    this.zone = z;
    this.moving = true;
    this.yaw = 0;
    this.pitch = 0;
    return this.pathDur;
  }

  /** Put a marker on a find. */
  setPins(pins: Pin[]) {
    const keep = new Set(pins.map((p) => p.id));
    for (const [id, s] of this.pinSprites) {
      if (!keep.has(id)) {
        this.scene.remove(s);
        this.pinSprites.delete(id);
      }
    }
    for (const p of pins) {
      let s = this.pinSprites.get(p.id);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        s.scale.setScalar(1.8);
        this.scene.add(s);
        this.pinSprites.set(p.id, s);
      }
      s.position.copy(p.at);
      (s.material as THREE.SpriteMaterial).color.set(p.tone === "clue" ? 0xffc566 : p.tone === "hazard" ? 0xff5a46 : 0x7dffb0);
      s.userData = p;
    }
  }

  frame(dt: number, st: StationState): ScreenPin[] {
    this.time += dt;
    this.station.update(this.time, st, this.camera);

    if (this.moving && this.path) {
      this.pathT = Math.min(1, this.pathT + dt / this.pathDur);
      const k = this.pathT;
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.pos.copy(this.path.getPointAt(ease));
      this.look.lerpVectors(this.lookFrom, this.lookTo, Math.min(1, ease * 1.3));
      if (k >= 1) this.moving = false;
    }

    const cam = this.camera;
    if (this.survey > 0) {
      // the survey: your ship's camera loops the station
      this.survey = Math.max(0, this.survey - dt);
      const a = this.time * 0.35;
      cam.position.set(Math.cos(a) * 95, 28, Math.sin(a) * 95);
      cam.up.set(0, 1, 0);
      cam.lookAt(5, 0, 0);
    } else {
      // breathing: a slow, tiny drift of the head
      const bob = new THREE.Vector3(Math.sin(this.time * 0.6) * 0.03, Math.sin(this.time * 0.9) * 0.04, 0);
      cam.position.copy(this.pos).add(bob);
      cam.up.set(0, 1, 0);
      const dir = this.look.clone().sub(this.pos).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(right, this.pitch));
      dir.applyQuaternion(q);
      cam.lookAt(cam.position.clone().add(dir));
    }
    this.headlamp.position.copy(cam.position);
    this.headlamp.target.position.copy(cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(10)));
    this.stars.position.copy(cam.position);

    // pins pulse
    for (const s of this.pinSprites.values()) s.scale.setScalar(1.4 + 0.4 * Math.sin(this.time * 4));

    // thermal: a false-colour palette in the grade, hot things glow, everything else drops to deep blue
    const g = this.cinema.grade.uniforms;
    g.uThermal.value += ((this.thermal ? 1 : 0) - g.uThermal.value) * Math.min(1, dt * 6);
    g.uFlash.value = Math.max(0, g.uFlash.value - dt * 1.5);
    g.uBars.value = this.survey > 0 ? 1 : Math.max(0, g.uBars.value - dt * 2);
    this.cinema.render(dt);

    const out: ScreenPin[] = [];
    for (const s of this.pinSprites.values()) {
      const p = s.userData as Pin;
      const v = s.position.clone().project(cam);
      out.push({ id: p.id, label: p.label, tone: p.tone, x: (v.x + 1) / 2, y: (1 - v.y) / 2, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 });
    }
    return out;
  }

  flash() {
    this.cinema.grade.uniforms.uFlash.value = 0.8;
  }

  /** How close you are to the Kiln, m (for the radiation counter). */
  kilnDistance(): number {
    return this.pos.distanceTo(new THREE.Vector3(44, -3, 0));
  }

  dispose() {
    this.station.dispose();
    this.cinema.dispose();
  }
}
