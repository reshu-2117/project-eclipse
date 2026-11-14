/**
 * The hero planet, drawn by a small WebGL shader so the Lanterns really light it.
 *
 * Eclipse-01 has no sun: every photon on its surface comes from a Lantern. Each pixel of the disc is a
 * point on a unit sphere. For each of the 24 Lanterns (positions in planet radii, camera space) the shader
 * adds:
 *   - diffuse light: Lambert x inverse-square falloff, shaped by the Lantern's reflector, which points at
 *     the planet's centre. A Lantern low over the ice throws a bright, tight pool; the pool fades out
 *     toward that Lantern's horizon.
 *   - a specular glint: ice is glossy, so where the angle is right the Lantern is reflected toward the
 *     viewer (Blinn-Phong with Schlick Fresnel; brighter, smoother ice is shinier).
 *   - subsurface scatter: light entering ice comes back out blue-green around the pool's edge.
 *   - atmospheric scatter: a thin haze, lit by nearby Lanterns, brightest when a Lantern is just behind the
 *     limb and its light is scattered forward toward the viewer.
 * Unlit ice keeps a faint cold starlight. The result is tone mapped (ACES) and written as premultiplied
 * alpha, so the haze blends over the orbits behind it.
 *
 * Returns null when WebGL is unavailable or the shader does not compile; the caller keeps its CSS planet.
 */

export const MAX_LIGHTS = 24;

export interface PlanetLight {
  /** camera space, planet radii: x right, y up, z toward the viewer */
  x: number;
  y: number;
  z: number;
  /** radiant intensity, 0 = dark */
  power: number;
  /** linear RGB */
  color: readonly [number, number, number];
}

export interface PlanetView {
  /** camera elevation above the equator, rad */
  elevation: number;
  /** roll of the planet's axis on screen, rad (counter-clockwise) */
  roll: number;
  /** canvas half-size divided by planet radius (room for the haze) */
  extent: number;
}

export interface PlanetRenderer {
  render(lights: PlanetLight[], spin: number): void;
  resize(cssSize: number, dpr: number): void;
  dispose(): void;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* Written once; GLSL ES 1.00 or 3.00 by prefix. */
const FRAG_BODY = `
#define N_LIGHTS ${MAX_LIGHTS}
uniform sampler2D uTex;
uniform vec4 uLight[N_LIGHTS];   // xyz position (planet radii, camera space), w power
uniform vec3 uColor[N_LIGHTS];   // linear rgb
uniform mat3 uToBody;            // camera space -> planet body frame (includes spin)
uniform float uExtent;
uniform float uPx;               // planet radius in device pixels
varying vec2 vUv;

const float PI = 3.14159265;
const vec3 ICE_TINT = vec3(0.30, 0.62, 0.78);
const vec3 STARLIGHT = vec3(0.030, 0.056, 0.095);

vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 sampleSurface(vec3 nBody) {
  float lon = atan(nBody.x, nBody.z);
  float lat = asin(clamp(nBody.y, -1.0, 1.0));
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
#ifdef GL2
  // the longitude wraps at the back of the sphere; take derivatives from a copy that does not jump there
  vec2 uv2 = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec2 dx2 = dFdx(uv2), dy2 = dFdy(uv2);
  if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
  return srgbToLinear(textureGrad(uTex, uv, dx, dy).rgb);
#else
  return srgbToLinear(texture2D(uTex, uv).rgb);
#endif
}

// Henyey-Greenstein phase function, forward scattering for g > 0
float phaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

void main() {
  vec2 p = vUv * uExtent;          // planet radii, y up
  float r = length(p);
  float edge = clamp((1.0 - r) * uPx + 0.5, 0.0, 1.0);   // antialiased limb
  vec3 col = vec3(0.0);

  // ---- surface ----
  if (r < 1.0 + 1.5 / uPx) {
    float rr = min(r, 0.9999);
    vec3 n = vec3(p / max(r, 1e-5) * rr, sqrt(1.0 - rr * rr));
    vec3 albedo = sampleSurface(uToBody * n);
    float brightness = dot(albedo, vec3(0.333));
    float shine = mix(18.0, 90.0, smoothstep(0.05, 0.35, brightness));    // smooth, bright ice is glossier
    vec3 v = vec3(0.0, 0.0, 1.0);
    float nv = max(n.z, 0.0);

    vec3 diffuse = vec3(0.0);
    vec3 spec = vec3(0.0);
    vec3 sss = vec3(0.0);
    for (int i = 0; i < N_LIGHTS; i++) {
      vec4 L = uLight[i];
      if (L.w <= 0.0) continue;
      vec3 toL = L.xyz - n;
      float d2 = dot(toL, toL);
      vec3 l = toL * inversesqrt(d2);
      float ndl = dot(n, l);
      // reflector aimed at the planet's centre: a focused beam, brightest straight down, with a little spill
      float aim = max(dot(normalize(L.xyz), l), 0.0);
      float a2 = aim * aim;
      float a8 = a2 * a2 * a2 * a2;
      float beam = 0.06 + 0.94 * a8 * a8;
      float e = L.w * beam / d2;
      // ice softens the terminator slightly (wrap lighting)
      float wrapped = max((ndl + 0.12) / 1.12, 0.0);
      diffuse += uColor[i] * e * wrapped;
      // light that entered the ice nearby comes back out, tinted, where direct light is grazing
      sss += uColor[i] * e * max(1.0 - abs(ndl), 0.0) * step(-0.25, ndl);
      if (ndl > 0.0) {
        vec3 h = normalize(l + v);
        float nh = max(dot(n, h), 0.0);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(h, v), 0.0), 5.0);
        spec += uColor[i] * e * ndl * fres * pow(nh, shine) * (shine + 8.0) / (8.0 * PI);
      }
    }
    vec3 surface = albedo * (diffuse / PI * 3.2 + STARLIGHT)
                 + ICE_TINT * albedo * sss * 0.16
                 + spec * 0.9;

    // haze seen through the edge of the disc: thicker toward the limb
    float path = pow(1.0 - nv, 3.0);
    surface += ICE_TINT * path * 0.05;

    col = surface * edge;
  }

  // ---- atmosphere: a thin shell, lit by nearby Lanterns, scattering toward the viewer ----
  float h = max(r - 1.0, 0.0);
  float shell = r < 1.0 ? pow(1.0 - sqrt(max(1.0 - r * r, 0.0)), 3.0) : exp(-h * 46.0);
  if (shell > 0.002) {
    vec3 limb = r < 1.0 ? vec3(p, sqrt(max(1.0 - r * r, 0.0))) : vec3(p / r, 0.0);
    vec3 scatter = vec3(0.0);
    for (int i = 0; i < N_LIGHTS; i++) {
      vec4 L = uLight[i];
      if (L.w <= 0.0) continue;
      vec3 toL = L.xyz - limb;
      float d2 = dot(toL, toL);
      // a Lantern hidden behind the planet only reaches the haze it can see over the horizon
      float visible = smoothstep(-0.25, 0.1, dot(normalize(toL), normalize(limb)));
      float c = dot(normalize(limb - L.xyz), vec3(0.0, 0.0, 1.0));
      scatter += uColor[i] * L.w * visible * phaseHG(c, 0.55) / d2;
    }
    col += (scatter * 0.5 + ICE_TINT * 0.07) * shell;
  }

  vec3 outc = pow(aces(col * 1.1), vec3(1.0 / 2.2));
  // premultiplied: the disc is opaque; beyond it the haze is light over whatever is behind (rgb <= alpha)
  float alpha = max(edge, max(outc.r, max(outc.g, outc.b)));
  gl_FragColor_OUT = vec4(outc, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("Hero planet shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createPlanetRenderer(
  canvas: HTMLCanvasElement,
  view: PlanetView,
  texture: HTMLImageElement,
  onLost: () => void,
): PlanetRenderer | null {
  const attrs: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false };
  const gl2 = canvas.getContext("webgl2", attrs);
  const gl = (gl2 ?? canvas.getContext("webgl", attrs)) as WebGLRenderingContext | null;
  if (!gl) return null;
  const isGL2 = !!gl2;

  const vsrc = isGL2
    ? `#version 300 es\n${VERT.replace("attribute", "in").replace("varying", "out")}`
    : VERT;
  const fbody = FRAG_BODY.replace("gl_FragColor_OUT", isGL2 ? "fragColor" : "gl_FragColor");
  const fsrc = isGL2
    ? `#version 300 es\nprecision highp float;\n#define GL2\nout vec4 fragColor;\n${fbody.replace("varying vec2 vUv;", "in vec2 vUv;")}`
    : `precision highp float;\n${fbody}`;

  const vs = compile(gl, gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("Hero planet program:", gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (isGL2) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const uLight = loc("uLight[0]");
  const uColor = loc("uColor[0]");
  const uToBody = loc("uToBody");
  const uExtent = loc("uExtent");
  const uPx = loc("uPx");
  gl.uniform1i(loc("uTex"), 0);
  gl.uniform1f(uExtent, view.extent);

  const lightBuf = new Float32Array(MAX_LIGHTS * 4);
  const colorBuf = new Float32Array(MAX_LIGHTS * 3);
  const mat = new Float32Array(9);
  const ce = Math.cos(view.elevation);
  const se = Math.sin(view.elevation);
  const cr = Math.cos(view.roll);
  const sr = Math.sin(view.roll);

  const lost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  canvas.addEventListener("webglcontextlost", lost);

  return {
    resize(cssSize, dpr) {
      const px = Math.max(1, Math.round(cssSize * dpr));
      canvas.width = px;
      canvas.height = px;
      gl.viewport(0, 0, px, px);
      gl.uniform1f(uPx, px / 2 / view.extent);
    },
    render(lights, spin) {
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const l = lights[i];
        lightBuf[4 * i] = l ? l.x : 0;
        lightBuf[4 * i + 1] = l ? l.y : 0;
        lightBuf[4 * i + 2] = l ? l.z : 0;
        lightBuf[4 * i + 3] = l ? l.power : 0;
        colorBuf[3 * i] = l ? l.color[0] : 0;
        colorBuf[3 * i + 1] = l ? l.color[1] : 0;
        colorBuf[3 * i + 2] = l ? l.color[2] : 0;
      }
      // camera -> world: undo the roll, then the elevation; world -> body: turn with the planet's spin
      // (columns are the images of the camera axes, as GLSL mat3 expects)
      const cs = Math.cos(spin);
      const ss = Math.sin(spin);
      const toBody = (cx: number, cy: number, cz: number, o: number) => {
        const wx = cx * cr + cy * sr;
        const y1 = -cx * sr + cy * cr;
        const wy = y1 * ce + cz * se;
        const wz = -y1 * se + cz * ce;
        mat[o] = wx * cs + wz * ss;
        mat[o + 1] = wy;
        mat[o + 2] = -wx * ss + wz * cs;
      };
      toBody(1, 0, 0, 0);
      toBody(0, 1, 0, 3);
      toBody(0, 0, 1, 6);
      gl.uniform4fv(uLight, lightBuf);
      gl.uniform3fv(uColor, colorBuf);
      gl.uniformMatrix3fv(uToBody, false, mat);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", lost);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
