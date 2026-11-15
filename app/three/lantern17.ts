/**
 * Lantern 17, "the Lighthouse Spine", built in code.
 *
 * Local frame (metres): +x is forward along the orbit, +y is up (away from the planet), z is sideways.
 * The dock hub faces backwards (−x), so a ship catching up from behind flies straight in, as crews
 * approach the ISS along its velocity vector. The Kiln burns at the front, under a dish of 18 gold
 * hexagonal mirror segments (JWST has 18) that throws its light down to the cities. Segment 7 is cracked.
 *
 * Zones match lib/game/data/station.ts: dock, spine, radiators, kiln, petals, mast.
 */
import * as THREE from "three";
import type { ZoneId } from "@/lib/game";
import { flareTexture, glowTexture, tex } from "./cinema";
import { TEMPS, setTemp } from "./thermal";

export interface StationState {
  /** Lantern 17's light output, 0..1 (61% at the start) */
  output: number;
  /** the ammonia leak is still venting */
  leak: boolean;
  /** the attitude drift is unfixed (a gyro wobbles, the station turns slowly) */
  drift: boolean;
  /** the Eclipse: mirrors cool, the beam dims */
  eclipse: boolean;
  /** reactor shut down */
  dark: boolean;
}

export interface Lantern17 {
  group: THREE.Group;
  /** zone centres, local frame */
  anchors: Record<ZoneId, THREE.Vector3>;
  /** handholds along the outside, local frame (for the spacewalk) */
  handholds: THREE.Vector3[];
  /** the cracked segment, for close inspection */
  segment7: THREE.Mesh;
  /** points where the leak vents */
  leakAt: THREE.Vector3;
  /** a wobble angle the drift adds to the whole station (radians), read by the sim's camera */
  driftAngle: number;
  update(t: number, s: StationState, camera?: THREE.Camera): void;
  /** emissive parts that a thermal camera should see hot */
  hot: THREE.Object3D[];
  dispose(): void;
}

const PORT_X = -38;
const KILN_X = 44;

function hullMaterial(color = 0xb9c0c8, rough = 0.5, metal = 0.55, repeat: [number, number] = [2, 1]) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  try {
    m.map = tex("/textures/hull.jpg", { repeat });
    // the hull texture is very dark; lift it so it reads as brushed panels, not paint
    m.color.multiplyScalar(2.6);
  } catch {
    /* textures load in the browser only */
  }
  return m;
}

/** Crumpled gold foil (multi-layer insulation). */
function foilMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xc8962e, roughness: 0.32, metalness: 1, emissive: 0x1a0d00, emissiveIntensity: 0.4 });
}

function crackTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, s, s);
  g.strokeStyle = "rgba(255,240,220,0.95)";
  g.lineCap = "round";
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    let px = x;
    let py = y;
    for (let i = 0; i < 8; i++) {
      a += (rnd() - 0.5) * 0.7;
      px += Math.cos(a) * (len / 8);
      py += Math.sin(a) * (len / 8);
      g.lineTo(px, py);
      if (depth > 0 && rnd() < 0.22) branch(px, py, a + (rnd() - 0.5) * 2.2, len * 0.45, w * 0.6, depth - 1);
    }
    g.stroke();
  };
  for (let i = 0; i < 5; i++) branch(s * 0.42, s * 0.55, (i / 5) * Math.PI * 2 + rnd(), s * 0.55, 2.4, 2);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** A flat hexagon prism, pointy side along x. */
function hexGeometry(radius: number, thick: number) {
  const g = new THREE.CylinderGeometry(radius, radius, thick, 6, 1);
  g.rotateY(Math.PI / 6);
  return g;
}

/** Instanced square truss between two x positions. */
function truss(x0: number, x1: number, width: number, member: number, mat: THREE.Material): THREE.InstancedMesh {
  const bay = width;
  const bays = Math.max(1, Math.round((x1 - x0) / bay));
  const len = (x1 - x0) / bays;
  const h = width / 2;
  const corners: [number, number][] = [
    [h, h],
    [h, -h],
    [-h, -h],
    [-h, h],
  ];
  const mats: THREE.Matrix4[] = [];
  const box = (from: THREE.Vector3, to: THREE.Vector3) => {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from);
    const l = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
    mats.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(l, member, member)));
  };
  // longerons
  for (const [y, z] of corners) box(new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z));
  for (let b = 0; b <= bays; b++) {
    const x = x0 + b * len;
    // battens (square frame)
    for (let i = 0; i < 4; i++) {
      const [y0, z0] = corners[i];
      const [y1, z1] = corners[(i + 1) % 4];
      box(new THREE.Vector3(x, y0, z0), new THREE.Vector3(x, y1, z1));
    }
    if (b < bays) {
      // diagonals on each face, alternating
      for (let i = 0; i < 4; i++) {
        const [y0, z0] = corners[i];
        const [y1, z1] = corners[(i + 1) % 4];
        const flip = (b + i) % 2 === 0;
        box(new THREE.Vector3(x, flip ? y0 : y1, flip ? z0 : z1), new THREE.Vector3(x + len, flip ? y1 : y0, flip ? z1 : z0));
      }
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}

function navLight(color: number, size = 1.6) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sp.scale.setScalar(size);
  return sp;
}

export function buildLantern17(opts: { detail?: "high" | "low" } = {}): Lantern17 {
  const hi = opts.detail !== "low";
  const group = new THREE.Group();
  group.name = "Lantern 17";
  const disposables: { dispose(): void }[] = [];
  const hot: THREE.Object3D[] = [];

  const white = hullMaterial(0xc4cbd3, 0.55, 0.45, [3, 1]);
  const dark = hullMaterial(0x5a626c, 0.6, 0.7, [2, 1]);
  const foil = foilMaterial();
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.42, metalness: 0.85 });
  disposables.push(white, dark, foil, trussMat);

  const add = (m: THREE.Object3D) => {
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(m);
    return m;
  };

  // ── dock hub ──
  const hub = new THREE.Group();
  const hubBody = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7, hi ? 40 : 20, 1), white);
  hubBody.rotation.z = Math.PI / 2;
  hubBody.position.x = PORT_X + 4.5;
  hub.add(hubBody);
  // docking adapter: a stepped cone and the soft-capture ring
  const adapter = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 2.4, 1.4, 40, 1), dark);
  adapter.rotation.z = -Math.PI / 2;
  adapter.position.x = PORT_X + 0.7;
  hub.add(adapter);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 16, 64), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.25, metalness: 0.9 }));
  ring.rotation.y = Math.PI / 2;
  ring.position.x = PORT_X;
  hub.add(ring);
  // docking target: a cross on a standoff, above the port, for lining up by eye
  const tgtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), dark);
  post.rotation.z = Math.PI / 2;
  post.position.set(PORT_X - 0.25, 1.75, 0);
  hub.add(post);
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.08), tgtMat);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.5), tgtMat);
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.34, 32), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.9 }));
  plate.rotation.y = -Math.PI / 2;
  for (const m of [cross1, cross2]) m.position.set(PORT_X - 0.52, 1.75, 0);
  plate.position.set(PORT_X - 0.5, 1.75, 0);
  hub.add(plate, cross1, cross2);
  // node: a sphere with ports
  const node = new THREE.Mesh(new THREE.SphereGeometry(3.1, hi ? 48 : 24, hi ? 32 : 16), white);
  node.position.x = PORT_X + 10.5;
  hub.add(node);
  for (const [y, z] of [
    [3.1, 0],
    [0, 3.1],
    [0, -3.1],
  ]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.9, 24), dark);
    p.position.set(PORT_X + 10.5, y, z);
    if (z !== 0) p.rotation.x = Math.PI / 2;
    hub.add(p);
  }
  // MLI blanket band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.46, 2.46, 2.2, 40, 1, true), foil);
  band.rotation.z = Math.PI / 2;
  band.position.x = PORT_X + 6;
  hub.add(band);
  add(hub);

  // approach lights round the port, and strobes
  const portLights: THREE.Sprite[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const l = navLight(i % 2 ? 0x7dffb0 : 0x7dffb0, 0.7);
    l.position.set(PORT_X - 0.05, Math.cos(a) * 1.55, Math.sin(a) * 1.55);
    group.add(l);
    portLights.push(l);
  }

  // ── spine truss ──
  const spine = truss(PORT_X + 13.6, KILN_X - 5, 2.8, 0.14, trussMat);
  group.add(spine);
  // cable trays along the spine
  const tray = new THREE.Mesh(new THREE.BoxGeometry(KILN_X - 5 - (PORT_X + 13.6), 0.18, 0.5), foil);
  tray.position.set((KILN_X - 5 + PORT_X + 13.6) / 2, -1.5, 0.6);
  add(tray);

  // ── gyro housing: two counter-rotating wheels (one wobbles when the drift is unfixed) ──
  const gyroX = -18;
  const gyroBox = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 3.4), dark);
  gyroBox.position.set(gyroX, 0, 0);
  add(gyroBox);
  const wheels: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.32, 16, 48),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.25, metalness: 1 }),
    );
    w.position.set(gyroX, 0, side * 2.2);
    add(w);
    wheels.push(w);
  }

  // ── radiator fins: two big panels with glowing coolant loops ──
  const radX0 = -10;
  const radX1 = 16;
  const finMat = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.5, metalness: 0.4 });
  if (typeof document !== "undefined") {
    // panels: a grid of tiles with seams and a little grime
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#8d969f";
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 4; j++) {
        const v = 120 + Math.floor(Math.random() * 40);
        g.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
        g.fillRect(i * 32 + 1, j * 64 + 1, 30, 62);
      }
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i <= 16; i++) g.fillRect(i * 32, 0, 1.5, 256);
    for (let j = 0; j <= 4; j++) g.fillRect(0, j * 64, 512, 1.5);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    finMat.map = t;
  }
  const loopMat = new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x4fd6ff, emissiveIntensity: 0.55, roughness: 0.4 });
  disposables.push(finMat, loopMat);
  const fins: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const fin = new THREE.Group();
    const w = radX1 - radX0;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 9), finMat);
    panel.position.set((radX0 + radX1) / 2, 0, side * 6.4);
    fin.add(panel);
    // coolant loops: thin emissive strips across the panel
    for (let i = 0; i < 9; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.14, 0.09), loopMat);
      strip.position.set((radX0 + radX1) / 2, 0.01, side * (2.3 + i * 0.95));
      fin.add(strip);
    }
    // arm to the spine
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.6), dark);
    arm.position.set((radX0 + radX1) / 2, 0, side * 1.9);
    fin.add(arm);
    add(fin);
    fins.push(fin);
    hot.push(...fin.children.filter((c) => (c as THREE.Mesh).material === loopMat));
  }
  // nav lights at the fin tips (red port side, green starboard)
  const red = navLight(0xff3030, 1.4);
  red.position.set((radX0 + radX1) / 2, 0.3, -11);
  const green = navLight(0x30ff70, 1.4);
  green.position.set((radX0 + radX1) / 2, 0.3, 11);
  group.add(red, green);

  // the leak: a jet of ammonia snow from the +z fin
  const leakAt = new THREE.Vector3(3.5, 0.1, 9.3);
  const SNOW = hi ? 420 : 160;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW * 3);
  const snowSeed = new Float32Array(SNOW * 4);
  for (let i = 0; i < SNOW; i++) {
    snowSeed[i * 4] = Math.random();
    snowSeed[i * 4 + 1] = Math.random() - 0.5;
    snowSeed[i * 4 + 2] = Math.random() - 0.5;
    snowSeed[i * 4 + 3] = 0.6 + Math.random() * 0.8;
  }
  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({
    color: 0xd8f4ff,
    size: 0.09,
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  group.add(snow);

  // ── sensor mast: the station's black box ──
  const mastX = 4;
  const mast = new THREE.Group();
  const mastTruss = truss(0, 22, 0.9, 0.06, trussMat);
  mastTruss.rotation.z = Math.PI / 2;
  mastTruss.position.set(mastX, 1.4, 0);
  mast.add(mastTruss);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 1.6), foil);
  box.position.set(mastX, 1.9, 0);
  mast.add(box);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2.0, 32, 12, 0, Math.PI * 2, 0, 0.75), new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  dish.position.set(mastX, 23.6, 0);
  dish.rotation.z = Math.PI * 0.62;
  mast.add(dish);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), dark);
  feed.position.set(mastX - 0.6, 24, 0);
  feed.rotation.z = Math.PI * 0.62;
  mast.add(feed);
  for (const [y, s] of [
    [16, 0.7],
    [11, 0.5],
  ]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(s, 20, 8, 0, Math.PI * 2, 0, 0.8), dish.material);
    d.position.set(mastX + 0.6, y, 0.5);
    d.rotation.z = -Math.PI * 0.4;
    mast.add(d);
  }
  add(mast);
  const beacon = navLight(0xff2a1a, 1.8);
  beacon.position.set(mastX, 25.4, 0);
  group.add(beacon);

  // ── the Kiln: the fusion lamp ──
  const kiln = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(4.6, hi ? 64 : 32, hi ? 40 : 20), dark);
  shell.position.set(KILN_X, 0, 0);
  kiln.add(shell);
  for (let i = 0; i < 8; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.16, 8, 64, Math.PI), white);
    rib.position.set(KILN_X, 0, 0);
    rib.rotation.y = (i / 8) * Math.PI;
    kiln.add(rib);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.4, 1.4, 48), foil);
  collar.position.set(KILN_X, -4.4, 0);
  kiln.add(collar);
  // the aperture: where the light comes out, facing down at the planet
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.38).multiplyScalar(6) });
  const core = new THREE.Mesh(new THREE.CircleGeometry(2.7, 48), coreMat);
  core.rotation.x = Math.PI / 2;
  core.position.set(KILN_X, -5.12, 0);
  kiln.add(core);
  hot.push(core);
  add(kiln);
  const kilnLight = new THREE.PointLight(0xffb36b, 0, 600, 1.4);
  kilnLight.position.set(KILN_X, -6.5, 0);
  group.add(kilnLight);
  const kilnGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTexture(), color: 0xffc58a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  kilnGlow.position.set(KILN_X, -5.6, 0);
  kilnGlow.scale.setScalar(12);
  group.add(kilnGlow);

  // ── the Petals: 18 gold hexagonal mirror segments on a paraboloid, opening down ──
  const petals = new THREE.Group();
  const segR = 3.05; // flat-to-flat about 5.3 m
  const focal = 13;
  const dishTopY = 9;
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xd9a548, metalness: 1, roughness: 0.16, emissive: 0x1a0c00, emissiveIntensity: 0.25, envMapIntensity: 0.6 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x23272c, metalness: 0.6, roughness: 0.6 });
  disposables.push(mirrorMat, backMat);
  const axial: [number, number][] = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    const s = -q - r;
    const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
    if (d >= 1 && d <= 2) axial.push([q, r]);
  }
  let segment7: THREE.Mesh | null = null;
  const crackMap = typeof document !== "undefined" ? crackTexture() : null;
  axial.forEach(([q, r], idx) => {
    const step = segR * Math.sqrt(3) + 0.18;
    const px = step * (q + r / 2);
    const pz = step * ((Math.sqrt(3) / 2) * r);
    const rr = px * px + pz * pz;
    // paraboloid opening downward (an umbrella): the focus sits just under the Kiln's aperture
    const py = dishTopY - rr / (4 * focal);
    const cracked = idx === 6;
    const m = new THREE.Mesh(hexGeometry(segR, 0.22), cracked ? mirrorMat.clone() : mirrorMat);
    const back = new THREE.Mesh(hexGeometry(segR * 0.96, 0.5), backMat);
    // orient to the paraboloid normal (pointing down/inward to the focus)
    const normal = new THREE.Vector3(-px / (2 * focal), -1, -pz / (2 * focal)).normalize();
    const q4 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), normal);
    m.quaternion.copy(q4);
    back.quaternion.copy(q4);
    m.position.set(KILN_X + px, py, pz);
    back.position.copy(m.position).addScaledVector(normal, -0.35);
    if (cracked) {
      // knocked out of line, darker, with a fracture that catches the light
      m.rotateX(0.11);
      m.rotateZ(-0.07);
      const mm = m.material as THREE.MeshStandardMaterial;
      mm.roughness = 0.35;
      mm.color.set(0xb98f4a);
      if (crackMap) {
        mm.emissiveMap = crackMap;
        mm.emissive.set(0xffe2b8);
        mm.emissiveIntensity = 0.9;
      }
      segment7 = m;
      hot.push(m);
    }
    petals.add(m, back);
  });
  // support struts from the Kiln to the dish
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const from = new THREE.Vector3(KILN_X, 3.5, 0);
    const to = new THREE.Vector3(KILN_X + Math.cos(a) * 9.5, dishTopY + 0.6, Math.sin(a) * 9.5);
    const dir = to.clone().sub(from);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, dir.length(), 8), trussMat);
    strut.position.copy(from).add(to).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    petals.add(strut);
  }
  add(petals);

  // ── the beam: invisible in vacuum, except where ice crystals and vapour cross it ──
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0.6 } },
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
      uniform float uTime, uPower;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        #include <logdepthbuf_fragment>
        float along = vUv.y;                       // 1 at the dish, 0 far below
        float edge = pow(abs(dot(vN, vV)), 1.6);   // brighter through the middle of the cone
        float fall = pow(along, 2.2);
        // drifting sparkles: ice crystals crossing the beam
        vec2 g = vec2(vUv.x * 120.0, vUv.y * 700.0 + uTime * 2.0);
        vec2 f = fract(g) - 0.5;
        float sp = step(0.997, h(floor(g))) * smoothstep(0.22, 0.0, length(f)) * fall * 3.0;
        float a = (0.018 * fall * edge + sp * 0.3) * uPower;
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.48) * a, a);
      }`,
  });
  disposables.push(beamMat);
  const beamLen = 1600;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 70, beamLen, 48, 1, true), beamMat);
  beam.userData.thermalHide = true;
  beam.position.set(KILN_X, -6 - beamLen / 2, 0);
  group.add(beam);

  // work lights: the station lights its own structure, like the ISS's external floodlights.
  // Pools of warm-white light on the hub, the spine and the underside of the dish.
  const workLights: THREE.SpotLight[] = [];
  const work = (pos: [number, number, number], target: [number, number, number], intensity: number, angle: number, color = 0xfff1dc) => {
    const l = new THREE.SpotLight(color, intensity, 140, angle, 0.6, 1.5);
    l.position.set(...pos);
    l.target.position.set(...target);
    group.add(l, l.target);
    workLights.push(l);
    const lamp = navLight(0xfff4e0, 0.9);
    lamp.position.set(...pos);
    group.add(lamp);
  };
  work([PORT_X + 12, 4.4, 2.5], [PORT_X + 4, -2.5, -1.5], 110, 0.75);
  work([-26, 4, -3], [-8, 0, 0], 260, 0.6);
  work([10, -3.5, 3], [30, 0, 0], 260, 0.6);
  work([KILN_X - 8, -6, 0], [KILN_X + 4, 8, 0], 420, 0.75, 0xffd8a8);
  // lit windows round the hub: someone left the lights on
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, emissive: 0xffc98a, emissiveIntensity: 0.8, roughness: 0.3 });
  disposables.push(winMat);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.04), winMat);
    w.position.set(PORT_X + 5.5, Math.cos(a) * 2.42, Math.sin(a) * 2.42);
    w.lookAt(new THREE.Vector3(PORT_X + 5.5, Math.cos(a) * 5, Math.sin(a) * 5));
    hub.add(w);
  }

  // strobes
  const strobeA = navLight(0xffffff, 2.2);
  strobeA.position.set(PORT_X + 10.5, 3.6, 0);
  const strobeB = navLight(0xffffff, 2.2);
  strobeB.position.set(KILN_X, 5.2, 0);
  group.add(strobeA, strobeB);

  // ── handholds for the spacewalk: rails along the spine and out to each zone ──
  const handholds: THREE.Vector3[] = [];
  for (let x = PORT_X + 2; x <= KILN_X - 6; x += 3) handholds.push(new THREE.Vector3(x, 1.9, 1.9));
  const railMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5, metalness: 0.3 });
  disposables.push(railMat);
  const rails = new THREE.InstancedMesh(new THREE.TorusGeometry(0.22, 0.035, 6, 14, Math.PI), railMat, handholds.length);
  handholds.forEach((p, i) => rails.setMatrixAt(i, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)), new THREE.Vector3(1, 1, 1))));
  group.add(rails);

  // ── temperatures for the thermal view ──
  setTemp(hub, TEMPS.pressurised);
  setTemp(kiln, TEMPS.kilnShell);
  core.userData.tempK = TEMPS.kilnCore;
  box.userData.tempK = TEMPS.electronics;
  for (const fin of fins) {
    fin.children.forEach((ch) => {
      const m = ch as THREE.Mesh;
      ch.userData.tempK = m.material === loopMat ? TEMPS.coolant : m.material === finMat ? TEMPS.radiator : TEMPS.structure;
    });
  }
  petals.children.forEach((ch) => {
    const m = ch as THREE.Mesh;
    if (m.material === mirrorMat || ch === segment7) ch.userData.tempK = TEMPS.mirror;
  });
  gyroBox.userData.tempK = TEMPS.electronics;
  wheels.forEach((w) => (w.userData.tempK = TEMPS.electronics + 20));
  // the leak reads cold: escaping ammonia flash-freezes
  snow.userData.thermalColor = 0x1a0a3a;
  // the burn scar: invisible to the eye, a hot bloom to a thermal camera (clue C2)
  if (segment7) {
    const s7 = segment7 as THREE.Mesh;
    const scar = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
    scar.position.copy(s7.position);
    scar.quaternion.copy(s7.quaternion);
    // face the mirror's reflective side (towards the Kiln), just proud of the surface
    scar.rotateX(Math.PI / 2);
    scar.translateZ(0.14);
    scar.translateX(0.6);
    scar.translateY(0.4);
    scar.userData.tempK = TEMPS.scar;
    scar.userData.thermalOnly = true;
    scar.visible = false;
    petals.add(scar);
  }

  const anchors: Record<ZoneId, THREE.Vector3> = {
    dock: new THREE.Vector3(PORT_X + 6, 0, 0),
    spine: new THREE.Vector3(gyroX, 0, 0),
    radiators: new THREE.Vector3(3, 0, 8),
    kiln: new THREE.Vector3(KILN_X, -3, 0),
    petals: segment7 ? (segment7 as THREE.Mesh).position.clone() : new THREE.Vector3(KILN_X, 8, 10),
    mast: new THREE.Vector3(mastX, 20, 0),
  };

  const tmp = new THREE.Vector3();
  const api: Lantern17 = {
    group,
    anchors,
    handholds,
    segment7: segment7 as unknown as THREE.Mesh,
    leakAt,
    driftAngle: 0,
    hot,
    update(t, s, camera) {
      // the lamp: output with a failing flicker; dark if the reactor is down
      const flick = s.dark ? 0 : s.output * (0.86 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1.3) + (Math.sin(t * 31.7) > 0.93 ? -0.35 : 0));
      const ecl = s.eclipse ? 0.35 : 1;
      coreMat.color.setRGB(1.0, 0.72, 0.38).multiplyScalar(0.3 + 2.6 * flick * ecl);
      kilnLight.intensity = 5200 * flick * ecl;
      workLights.forEach((l, i) => (l.visible = !s.dark || i === 0));
      (kilnGlow.material as THREE.SpriteMaterial).opacity = Math.min(0.8, 0.1 + 0.7 * flick * ecl);
      kilnGlow.scale.setScalar(7 + 9 * flick * ecl);
      beamMat.uniforms.uTime.value = t;
      beamMat.uniforms.uPower.value = flick * ecl;
      loopMat.emissiveIntensity = s.leak ? 0.25 + 0.2 * Math.max(0, Math.sin(t * 1.7)) : 0.55;
      // nav lights
      const blink = (period: number, phase: number, on = 0.12) => ((t + phase) % period) / period < on;
      red.visible = blink(1.6, 0, 0.5);
      green.visible = blink(1.6, 0.8, 0.5);
      beacon.visible = blink(2.2, 0.3, 0.18);
      strobeA.visible = blink(1.3, 0.1, 0.06);
      strobeB.visible = blink(1.3, 0.75, 0.06);
      portLights.forEach((l, i) => (l.visible = blink(1.0, i * 0.12, 0.55)));
      // gyros spin; one wobbles while the drift is unfixed
      wheels[0].rotation.z = t * 6;
      wheels[1].rotation.z = -t * 6;
      wheels[1].rotation.x = s.drift ? Math.sin(t * 3.1) * 0.12 : 0;
      api.driftAngle = s.drift ? Math.sin(t * 0.07) * 0.06 : 0;
      // ammonia snow
      snow.visible = s.leak;
      if (s.leak) {
        for (let i = 0; i < SNOW; i++) {
          const life = (snowSeed[i * 4] + t * 0.22 * snowSeed[i * 4 + 3]) % 1;
          const spread = life * 3.2;
          snowPos[i * 3] = leakAt.x + snowSeed[i * 4 + 1] * spread + life * 1.5;
          snowPos[i * 3 + 1] = leakAt.y + life * 9 + snowSeed[i * 4 + 2] * spread * 0.8;
          snowPos[i * 3 + 2] = leakAt.z + life * 5.5 + snowSeed[i * 4 + 2] * spread;
        }
        snowGeo.attributes.position.needsUpdate = true;
        snowMat.opacity = 0.9;
      }
      if (camera) {
        // the flare fades when the camera can't see the aperture from above
        tmp.set(KILN_X, -6, 0).applyMatrix4(group.matrixWorld);
        const toCam = camera.position.clone().sub(tmp).normalize();
        const down = new THREE.Vector3(0, -1, 0).transformDirection(group.matrixWorld);
        const facing = Math.max(0, toCam.dot(down));
        (kilnGlow.material as THREE.SpriteMaterial).opacity *= 0.04 + 0.96 * facing * facing;
      }
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
    },
  };
  return api;
}
