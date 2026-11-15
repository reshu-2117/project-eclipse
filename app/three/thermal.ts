/**
 * A thermal camera view. Each part gets a temperature (kelvin) from what it is: pressurised modules
 * are warm, radiators warmer, bare structure cold, shiny mirrors read cold because metal emits little,
 * and everything near the Kiln is heated by it, falling off with distance. Colour comes from an
 * "ironbow" palette, as thermal cameras use.
 */
import * as THREE from "three";

export const TEMPS = {
  space: 4,
  ice: 120,
  structure: 175,
  mirror: 165,
  electronics: 270,
  radiator: 285,
  pressurised: 292,
  coolant: 322,
  scar: 560,
  engine: 430,
  kilnShell: 640,
  kilnCore: 1500,
} as const;

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p;
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uBase;
  uniform vec3 uKiln;
  uniform float uKilnHeat;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vN;
  vec3 ironbow(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.01, 0.01, 0.06);
    vec3 b = vec3(0.30, 0.03, 0.50);
    vec3 c = vec3(0.88, 0.16, 0.14);
    vec3 d = vec3(1.00, 0.62, 0.05);
    vec3 e = vec3(1.00, 1.00, 0.88);
    if (t < 0.25) return mix(a, b, t / 0.25);
    if (t < 0.5) return mix(b, c, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c, d, (t - 0.5) / 0.25);
    return mix(d, e, (t - 0.75) / 0.25);
  }
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(vWorld - uKiln);
    float T = uBase + uKilnHeat * 420.0 * exp(-d / 7.0);
    // a camera sees radiance (~T^4): map on a log scale between 160 K and 650 K
    float t = (log(max(T, 1.0)) - log(160.0)) / (log(650.0) - log(160.0));
    vec3 v = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vN), v));
    vec3 col = ironbow(t) * (0.6 + 0.4 * facing);
    // sensor noise
    col += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.025;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const shared = {
  kiln: { value: new THREE.Vector3() },
  heat: { value: 1 },
  time: { value: 0 },
};
const cache = new Map<number, THREE.ShaderMaterial>();

function thermalMaterial(base: number): THREE.ShaderMaterial {
  const key = Math.round(base);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uBase: { value: base }, uKiln: shared.kiln, uKilnHeat: shared.heat, uTime: shared.time },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    cache.set(key, m);
  }
  return m;
}

/** Tag an object (and its children) with a base temperature. Children keep their own if they have one. */
export function setTemp(o: THREE.Object3D, kelvin: number, force = false) {
  o.traverse((c) => {
    if (force || c.userData.tempK === undefined) c.userData.tempK = kelvin;
  });
}

/** Where the heat comes from (world position) and how hot it is now (0..1). */
export function thermalSource(kilnWorld: THREE.Vector3, heat: number, time: number) {
  shared.kiln.value.copy(kilnWorld);
  shared.heat.value = heat;
  shared.time.value = time;
}

/**
 * Switch a whole tree between its normal materials and the thermal view. Meshes use their tag
 * (default: cold structure); sprites and lights' glows are hidden (LEDs barely register); points
 * keep their own `thermalColor` if they have one.
 */
export function applyThermal(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    if (o.userData.thermalHide) {
      o.visible = !on;
      return;
    }
    const mesh = o as THREE.Mesh;
    if ((mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) && mesh.material) {
      if (on) {
        if (!o.userData.realMat) o.userData.realMat = mesh.material;
        mesh.material = thermalMaterial(o.userData.tempK ?? TEMPS.structure);
      } else if (o.userData.realMat) {
        mesh.material = o.userData.realMat;
        delete o.userData.realMat;
      }
      if (o.userData.thermalOnly) o.visible = on;
    } else if ((o as THREE.Sprite).isSprite) {
      if (on) {
        if (o.userData.wasVisible === undefined) o.userData.wasVisible = o.visible;
        o.userData.hideThermal = true;
      } else if (o.userData.hideThermal) {
        delete o.userData.hideThermal;
        delete o.userData.wasVisible;
      }
    } else if ((o as THREE.Points).isPoints && o.userData.thermalColor !== undefined) {
      const pm = (o as THREE.Points).material as THREE.PointsMaterial;
      if (on) {
        if (o.userData.realColor === undefined) o.userData.realColor = pm.color.getHex();
        pm.color.set(o.userData.thermalColor);
        pm.blending = THREE.NormalBlending;
      } else if (o.userData.realColor !== undefined) {
        pm.color.set(o.userData.realColor);
        pm.blending = THREE.AdditiveBlending;
        delete o.userData.realColor;
      }
    }
  });
}

/** After an update that toggles sprite visibility (blinking lights), keep them off in thermal. */
export function hideThermalSprites(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o.userData.hideThermal) o.visible = false;
  });
}
