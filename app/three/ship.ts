/**
 * The player's ship, from the hangar choices. Nose (+x) carries the docking ring and floodlights;
 * the main engine fires out of the back (−x). Hull shape follows the hull card: Courier is slim,
 * Tender carries big round tanks, Hauler is a wide box. Engines get their own bells and flame colours.
 */
import * as THREE from "three";
import type { EngineId, HullId, ShieldId } from "@/lib/game";
import { glowTexture, tex } from "./cinema";

export interface ShipModel {
  group: THREE.Group;
  /** the cockpit eye point, local */
  eye: THREE.Vector3;
  length: number;
  floods: THREE.SpotLight[];
  update(t: number, thrust: number, rcs: THREE.Vector3, slewing: number): void;
  dispose(): void;
}

const FLAME: Record<EngineId, { core: THREE.Color; outer: THREE.Color; len: number; bells: number; bell: number }> = {
  biprop: { core: new THREE.Color(1.0, 0.86, 0.62), outer: new THREE.Color(1.0, 0.45, 0.18), len: 9, bells: 1, bell: 0.9 },
  cluster: { core: new THREE.Color(1.0, 0.86, 0.66), outer: new THREE.Color(1.0, 0.5, 0.25), len: 4, bells: 4, bell: 0.35 },
  green: { core: new THREE.Color(0.85, 0.95, 1.0), outer: new THREE.Color(0.55, 0.75, 1.0), len: 3.5, bells: 4, bell: 0.3 },
  cryo: { core: new THREE.Color(0.75, 0.85, 1.0), outer: new THREE.Color(0.35, 0.5, 1.0), len: 14, bells: 1, bell: 1.25 },
  ion: { core: new THREE.Color(0.6, 0.75, 1.0), outer: new THREE.Color(0.3, 0.45, 1.0), len: 2, bells: 1, bell: 0.4 },
};

function plumeMaterial(core: THREE.Color, outer: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uCore: { value: core }, uOuter: { value: outer } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uLevel; uniform vec3 uCore, uOuter;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float n(float x) { return fract(sin(x * 91.17) * 43758.5); }
      void main() {
        #include <logdepthbuf_fragment>
        float along = 1.0 - vUv.y;                      // 0 at the bell, 1 at the tail
        float rim = pow(abs(dot(vN, vV)), 1.4);
        // shock diamonds: bright bands down the exhaust
        float diamonds = 0.65 + 0.35 * sin(along * 38.0 - uTime * 50.0);
        float flick = 0.85 + 0.15 * n(floor(uTime * 40.0));
        float fade = pow(1.0 - along, 1.6);
        vec3 c = mix(uOuter, uCore, rim * (1.0 - along)) * diamonds;
        float a = fade * rim * uLevel * flick;
        gl_FragColor = vec4(c * a * 1.5, a);
      }`,
  });
}

export function buildShip(hull: HullId, engine: EngineId, shield: ShieldId): ShipModel {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const white = new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.45, metalness: 0.35 });
  try {
    white.map = tex("/textures/hull.jpg", { repeat: [2, 1] });
    white.color.multiplyScalar(2.4);
  } catch {
    /* browser only */
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.55, metalness: 0.7 });
  const foil = new THREE.MeshStandardMaterial({ color: 0xc8962e, roughness: 0.3, metalness: 1 });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide });
  const window_ = new THREE.MeshStandardMaterial({ color: 0x0b1620, emissive: 0x7fd0ff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2 });
  disposables.push(white, dark, foil, bellMat, window_);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const x = new THREE.Mesh(g, m);
    x.castShadow = true;
    x.receiveShadow = true;
    group.add(x);
    return x;
  };

  // body dimensions by hull
  const dims = hull === "courier" ? { r: 1.25, len: 7.5 } : hull === "tender" ? { r: 1.6, len: 8.5 } : { r: 1.9, len: 10 };
  const back = -dims.len / 2;
  const front = dims.len / 2;

  // crew capsule at the front (a cone frustum), service module behind
  const cap = mesh(new THREE.CylinderGeometry(dims.r * 0.55, dims.r, dims.len * 0.32, 40), white);
  cap.rotation.z = -Math.PI / 2;
  cap.position.x = front - dims.len * 0.16;
  if (hull === "hauler") {
    const svc = mesh(new THREE.BoxGeometry(dims.len * 0.62, dims.r * 1.8, dims.r * 1.8), white);
    svc.position.x = back + dims.len * 0.31;
  } else {
    const svc = mesh(new THREE.CylinderGeometry(dims.r, dims.r, dims.len * 0.62, 40), white);
    svc.rotation.z = Math.PI / 2;
    svc.position.x = back + dims.len * 0.31;
  }
  // foil band and radiator stripes
  const band = mesh(new THREE.CylinderGeometry(dims.r * 1.02, dims.r * 1.02, dims.len * 0.12, 40, 1, true), foil);
  band.rotation.z = Math.PI / 2;
  band.position.x = back + dims.len * 0.12;
  if (hull === "tender") {
    // big spherical tanks either side
    // long cylindrical propellant tanks either side, wrapped in white blanket
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6, metalness: 0.1 });
    disposables.push(tankMat);
    for (const s of [-1, 1]) {
      const tank = mesh(new THREE.CapsuleGeometry(0.62, dims.len * 0.38, 8, 24), tankMat);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(back + dims.len * 0.34, -0.15, s * (dims.r + 0.62));
      for (const k of [-1, 1]) {
        const strut = mesh(new THREE.BoxGeometry(0.18, 0.18, 0.7), dark);
        strut.position.set(back + dims.len * 0.34 + k * dims.len * 0.13, -0.15, s * (dims.r + 0.05));
      }
    }
  }
  // windows
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const w = mesh(new THREE.BoxGeometry(0.5, 0.32, 0.06), window_);
    w.position.set(front - dims.len * 0.2, Math.cos(a) * dims.r * 0.8, Math.sin(a) * dims.r * 0.8);
    w.lookAt(new THREE.Vector3(w.position.x, w.position.y * 3, w.position.z * 3));
  }
  // docking ring at the nose
  const ring = mesh(new THREE.TorusGeometry(dims.r * 0.48, 0.09, 12, 40), new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.25, metalness: 0.9 }));
  ring.rotation.y = Math.PI / 2;
  ring.position.x = front + 0.05;
  // shield: a Whipple bumper plate on the nose side
  if (shield !== "none") {
    const plate = mesh(new THREE.CylinderGeometry(dims.r * 1.06, dims.r * 1.06, shield === "heavy" ? 0.35 : 0.12, 40, 1, true), dark);
    plate.rotation.z = Math.PI / 2;
    plate.position.x = front - dims.len * 0.33;
  }
  // RCS quads
  const quads: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const q = mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), dark);
    const y = Math.cos(a) * (dims.r + 0.15);
    const z = Math.sin(a) * (dims.r + 0.15);
    q.position.set(back + dims.len * 0.55, y, z);
    quads.push(q.position.clone());
  }
  // engines
  const fl = FLAME[engine];
  const bells: THREE.Vector3[] = [];
  if (fl.bells === 1) bells.push(new THREE.Vector3(back, 0, 0));
  else for (let i = 0; i < 4; i++) bells.push(new THREE.Vector3(back, Math.cos((i / 4) * Math.PI * 2 + Math.PI / 4) * dims.r * 0.5, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 4) * dims.r * 0.5));
  const plumeMat = plumeMaterial(fl.core, fl.outer);
  disposables.push(plumeMat);
  const plumes: THREE.Mesh[] = [];
  for (const b of bells) {
    const bell = mesh(new THREE.CylinderGeometry(fl.bell * 0.35, fl.bell, fl.bell * 1.6, 32, 1, true), bellMat);
    bell.rotation.z = Math.PI / 2;
    bell.position.set(b.x - fl.bell * 0.8, b.y, b.z);
    const plume = new THREE.Mesh(new THREE.CylinderGeometry(fl.bell * 0.9, fl.bell * 2.4, fl.len, 32, 1, true), plumeMat);
    plume.rotation.z = Math.PI / 2;
    plume.position.set(b.x - fl.bell * 1.6 - fl.len / 2, b.y, b.z);
    plume.visible = false;
    group.add(plume);
    plumes.push(plume);
  }
  const engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: fl.core, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  engineGlow.position.set(back - fl.bell * 1.8, 0, 0);
  engineGlow.scale.setScalar(fl.bell * 4.5);
  group.add(engineGlow);
  const engineLight = new THREE.PointLight(fl.outer, 0, 60, 2);
  engineLight.position.set(back - fl.bell * 3, 0, 0);
  group.add(engineLight);

  // RCS puffs: small additive sprites at the quads
  const puffs = quads.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xeaf4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.position.copy(p);
    s.scale.setScalar(1.2);
    group.add(s);
    return s;
  });

  // floodlights: the only light you bring
  const floods: THREE.SpotLight[] = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.SpotLight(0xf3f6ff, 0, 420, 0.32, 0.55, 1.4);
    sp.position.set(front - 0.4, 0.2 + dims.r * 0.75, s * dims.r * 0.45);
    sp.target.position.set(front + 30, 0, s * 1.5);
    group.add(sp, sp.target);
    floods.push(sp);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    lamp.position.copy(sp.position).add(new THREE.Vector3(0.25, 0, 0));
    lamp.scale.setScalar(0.7);
    group.add(lamp);
  }
  floods[0].castShadow = true;
  floods[0].shadow.mapSize.set(1024, 1024);
  floods[0].shadow.camera.near = 1;
  floods[0].shadow.camera.far = 400;
  floods[0].shadow.bias = -0.0004;

  // a little navigation strobe
  const strobe = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  strobe.position.set(back + dims.len * 0.3, dims.r + 0.2, 0);
  strobe.scale.setScalar(1.1);
  group.add(strobe);

  let lastPuff = 0;
  return {
    group,
    eye: new THREE.Vector3(front + 0.3, 0, 0),
    length: dims.len,
    floods,
    update(t, thrust, rcs, slewing) {
      const lvl = Math.max(0, Math.min(1, thrust));
      plumeMat.uniforms.uTime.value = t;
      plumeMat.uniforms.uLevel.value = lvl;
      plumes.forEach((p) => (p.visible = lvl > 0.01));
      const flick = 0.85 + 0.15 * Math.sin(t * 61) * Math.sin(t * 23);
      (engineGlow.material as THREE.SpriteMaterial).opacity = 0.45 * lvl * flick;
      engineLight.intensity = lvl * 220 * flick;
      strobe.visible = (t % 1.7) / 1.7 < 0.05;
      // RCS: puff the quads that would fire for the commanded motion and for slewing
      const active = rcs.lengthSq() > 0.01 || slewing > 0.5;
      if (active && t - lastPuff > 0.07) lastPuff = t;
      puffs.forEach((p, i) => {
        const on = active && (rcs.lengthSq() > 0.01 ? Math.abs(i % 2 ? rcs.z : rcs.y) + Math.abs(rcs.x) * 0.5 > 0.1 : (i + Math.floor(t * 8)) % 2 === 0);
        const m = p.material as THREE.SpriteMaterial;
        m.opacity = on ? 0.55 + 0.45 * Math.random() : Math.max(0, m.opacity - 0.15);
        p.scale.setScalar(on ? 0.8 + Math.random() * 0.9 : 0.8);
      });
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
    },
  };
}
