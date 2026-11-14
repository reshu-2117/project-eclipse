/**
 * Two-body orbital mechanics in metres and seconds.
 *
 * Pure TypeScript, no DOM. Coasting arcs are propagated exactly (universal-variable Kepler solution),
 * so a ship coasting for ten hours lands where Newton says it does, not where a step-by-step
 * integrator drifts to. Burns are integrated with RK4 in `sim.ts`.
 *
 * The planet uses Earth's size and gravity, as the rest of the game does (lib/game/constants.ts).
 */
import { PLANET } from "../game/constants";

export type V3 = [number, number, number];

/** Gravitational parameter, m³/s² (the game's 398,600 km³/s²). */
export const MU = PLANET.mu * 1e9;
/** Planet radius, m. */
export const R_PLANET = PLANET.radiusKm * 1e3;
/** Standard gravity for the rocket equation, m/s². */
export const G0 = 9.80665;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: V3): V3 => {
  const n = norm(a);
  return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};
export const addScaled = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export interface State {
  r: V3;
  v: V3;
}

// ── Stumpff functions ──

function stumpC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}

function stumpS(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/**
 * Where a coasting body is after `dt` seconds (any conic, any direction of time).
 * Universal-variable formulation (Curtis, Orbital Mechanics for Engineering Students, Alg. 3.4).
 */
export function propagate(s: State, dt: number, mu = MU): State {
  if (dt === 0) return { r: [...s.r], v: [...s.v] };
  const r0 = norm(s.r);
  const v0 = norm(s.v);
  const vr0 = dot(s.r, s.v) / r0;
  const alpha = 2 / r0 - (v0 * v0) / mu;
  const sqmu = Math.sqrt(mu);

  // Newton on the universal anomaly χ, with a safe starting guess.
  let x = alpha > 1e-12 ? sqmu * Math.abs(alpha) * dt : (sqmu * dt) / r0;
  for (let i = 0; i < 60; i++) {
    const z = alpha * x * x;
    const C = stumpC(z);
    const S = stumpS(z);
    const F = ((r0 * vr0) / sqmu) * x * x * C + (1 - alpha * r0) * x * x * x * S + r0 * x - sqmu * dt;
    const dF = ((r0 * vr0) / sqmu) * x * (1 - alpha * x * x * S) + (1 - alpha * r0) * x * x * C + r0;
    const step = F / dF;
    x -= step;
    if (Math.abs(step) < 1e-9 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x;
  const C = stumpC(z);
  const S = stumpS(z);
  const f = 1 - ((x * x) / r0) * C;
  const g = dt - (1 / sqmu) * x * x * x * S;
  const r: V3 = addScaled(scale(s.r, f), s.v, g);
  const rn = norm(r);
  const fd = (sqmu / (rn * r0)) * (alpha * x * x * x * S - x);
  const gd = 1 - ((x * x) / rn) * C;
  const v: V3 = addScaled(scale(s.r, fd), s.v, gd);
  return { r, v };
}

export interface Elements {
  /** semi-major axis, m (negative for escape orbits) */
  a: number;
  e: number;
  /** periapsis and apoapsis radius, m (apoapsis Infinity when escaping) */
  rp: number;
  ra: number;
  /** period, s (Infinity when escaping) */
  period: number;
  /** specific orbital energy, J/kg */
  energy: number;
  /** angular momentum vector */
  h: V3;
}

export function elements(s: State, mu = MU): Elements {
  const r = norm(s.r);
  const v = norm(s.v);
  const energy = (v * v) / 2 - mu / r;
  const h = cross(s.r, s.v);
  const eVec = sub(scale(cross(s.v, h), 1 / mu), scale(s.r, 1 / r));
  const e = norm(eVec);
  const a = -mu / (2 * energy);
  const p = dot(h, h) / mu;
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const period = e < 1 && a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;
  return { a, e, rp, ra, period, energy, h };
}

/** Speed of a circular orbit at radius r, m/s. */
export const circularSpeed = (r: number, mu = MU) => Math.sqrt(mu / r);

/** Circular orbit state at angle θ in a plane tilted by `inc` about the x axis. */
export function circularState(radius: number, theta: number, inc = 0, mu = MU): State {
  const v = circularSpeed(radius, mu);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  // in-plane (x, y) then rotate about x by inc: y → (y·cos, y·sin)
  return {
    r: [radius * c, radius * s * ci, radius * s * si],
    v: [-v * s, v * c * ci, v * c * si],
  };
}

/** Local frame of an orbit: prograde (along velocity), radial out, orbit normal. */
export interface Frame {
  pro: V3;
  rad: V3;
  nrm: V3;
}

export function frameOf(s: State): Frame {
  const pro = unit(s.v);
  const nrm = unit(cross(s.r, s.v));
  // radial out, made exactly perpendicular to prograde
  const rad = unit(cross(pro, nrm));
  return { pro, rad, nrm };
}

/**
 * Local-vertical local-horizontal frame of a target (used for proximity operations and docking).
 * x = V-bar (along track), y = R-bar out (radial, up), z = H-bar (orbit normal).
 */
export interface Lvlh {
  vbar: V3;
  rbar: V3;
  hbar: V3;
}

export function lvlhOf(s: State): Lvlh {
  const rbar = unit(s.r);
  const hbar = unit(cross(s.r, s.v));
  const vbar = cross(hbar, rbar);
  return { vbar, rbar, hbar };
}

export const toLocal = (f: Lvlh, d: V3): V3 => [dot(d, f.vbar), dot(d, f.rbar), dot(d, f.hbar)];
export const fromLocal = (f: Lvlh, l: V3): V3 => addScaled(addScaled(scale(f.vbar, l[0]), f.rbar, l[1]), f.hbar, l[2]);

/**
 * Lambert's problem: the velocities that take a body from r1 to r2 in `tof` seconds (single revolution,
 * short or long way chosen by the prograde direction `hRef`). Universal variables with a bracketed
 * Newton solve on z (Curtis Alg. 5.2). Returns null when no solution is found.
 */
export function lambert(r1v: V3, r2v: V3, tof: number, hRef: V3, mu = MU): { v1: V3; v2: V3 } | null {
  const r1 = norm(r1v);
  const r2 = norm(r2v);
  const c12 = cross(r1v, r2v);
  let cosd = dot(r1v, r2v) / (r1 * r2);
  cosd = Math.max(-1, Math.min(1, cosd));
  let dtheta = Math.acos(cosd);
  if (dot(c12, hRef) < 0) dtheta = 2 * Math.PI - dtheta;
  const A = Math.sin(dtheta) * Math.sqrt((r1 * r2) / (1 - Math.cos(dtheta)));
  if (!Number.isFinite(A) || Math.abs(A) < 1e-9) return null;

  const y = (z: number) => r1 + r2 + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z));
  const tofOf = (z: number) => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return (Math.pow(yz / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(yz)) / Math.sqrt(mu);
  };

  // Bracket z: time of flight grows with z on the single-revolution branch.
  let lo = -4 * Math.PI * Math.PI;
  while (!(tofOf(lo) < tof) && lo < 4 * Math.PI * Math.PI) lo += 0.1;
  let hi = 4 * Math.PI * Math.PI - 1e-6;
  if (!(tofOf(lo) < tof) || !(tofOf(hi) > tof)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const t = tofOf(mid);
    if (!Number.isFinite(t) || t < tof) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  const z = (lo + hi) / 2;
  const yz = y(z);
  const f = 1 - yz / r1;
  const g = A * Math.sqrt(yz / mu);
  const gd = 1 - yz / r2;
  const v1 = scale(sub(r2v, scale(r1v, f)), 1 / g);
  const v2 = scale(sub(scale(r2v, gd), r1v), 1 / g);
  return { v1, v2 };
}

/** Closest approach between two coasting bodies in [t0, t1] (seconds from now). */
export function closestApproach(a: State, b: State, t0: number, t1: number, samples = 60): { t: number; d: number } {
  const dist = (t: number) => norm(sub(propagate(a, t).r, propagate(b, t).r));
  let bestT = t0;
  let best = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = t0 + ((t1 - t0) * i) / samples;
    const d = dist(t);
    if (d < best) {
      best = d;
      bestT = t;
    }
  }
  // golden-section refine around the best sample
  const span = (t1 - t0) / samples;
  let lo = Math.max(t0, bestT - span);
  let hi = Math.min(t1, bestT + span);
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo);
  let d = lo + gr * (hi - lo);
  let fc = dist(c);
  let fd = dist(d);
  for (let i = 0; i < 60; i++) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - gr * (hi - lo);
      fc = dist(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + gr * (hi - lo);
      fd = dist(d);
    }
    if (hi - lo < 1e-4) break;
  }
  const t = (lo + hi) / 2;
  return { t, d: dist(t) };
}
