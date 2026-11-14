/**
 * Orbital model for the Lantern-17 environment.
 *
 * Pure TypeScript: no DOM, no Three.js, no Math.random, no Date. The same file runs in the browser
 * and in `npm run verify:orbits`, and a given seed always produces the same sky.
 *
 * SCALE AND UNITS
 *   distance  km in the model, 1 scene unit = 1,000 km (UNIT_KM)
 *   time      seconds of simulated time; the scene multiplies real seconds by a time-acceleration factor
 *   planet    Earth-like fictional world: radius 6,371 km, mu = 398,600 km^3/s^2
 *
 * PHYSICS (deliberately simplified)
 *   Every body follows a two-body Keplerian orbit around the planet: Kepler's equation is solved
 *   analytically, so position is an exact function of time. No n-body forces, no drag, no J2.
 *   Periods and speeds follow from semi-major axis (Kepler's third law, vis-viva).
 *
 * COLLISION SAFETY
 *   Each body has a keep-out radius. Two bodies are only allowed if the two orbit curves never come
 *   closer than keepOutA + keepOutB + SAFETY_MARGIN_KM. That distance is the MOID (minimum orbit
 *   intersection distance). If the MOID clears the limit, the bodies cannot meet at ANY time, whatever
 *   their phases or periods, which is stronger than checking positions at one instant.
 *   The MOID test is a branch-and-bound search over the two orbit angles. A body's position moves at
 *   most `a` km per radian of orbit angle, so a patch of the search space can be discarded with proof
 *   once its centre is further away than the patch could possibly shrink. That keeps the test rigorous
 *   (it can only err toward rejecting a path) while visiting a few hundred points instead of tens of
 *   thousands.
 *   A body whose proposed path fails is adjusted (semi-major axis pushed away from the conflicting
 *   orbit) and re-tested, then re-sampled if adjustment does not help.
 *   `createSafetyMonitor` adds a runtime swept (continuous) collision test as defence in depth.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const MU_KM3_S2 = 398_600;
export const PLANET_RADIUS_KM = 6_371;
export const UNIT_KM = 1_000;
export const SAFETY_MARGIN_KM = 70;
export const MIN_PERIGEE_KM = PLANET_RADIUS_KM + 900;
export const MAX_APOGEE_KM = 36_000;
export const ORBIT_SAMPLES = 256;
export const FIELD_SEED = "ECLIPSE-01/LANTERN-17/v1";
export const HERO_ID = "L-17";

export type BodyKind = "lantern" | "satellite" | "debris" | "mission";
export type BodyStatus = "target" | "online" | "damaged" | "nominal";

export interface Elements {
  /** semi-major axis, km */
  a: number;
  /** eccentricity */
  e: number;
  /** inclination, rad */
  i: number;
  /** right ascension of the ascending node, rad */
  raan: number;
  /** argument of periapsis, rad */
  argp: number;
  /** mean anomaly at t = 0, rad */
  m0: number;
}

export interface Orbit {
  el: Elements;
  /** mean motion, rad/s */
  n: number;
  /** orbital period, s */
  period: number;
  /** periapsis and apoapsis radius, km */
  rp: number;
  ra: number;
  /** semi-minor axis, km */
  b: number;
  /** perifocal basis vectors in the planet-fixed inertial frame (z = spin axis) */
  P: [number, number, number];
  Q: [number, number, number];
  /** ORBIT_SAMPLES points evenly spaced in eccentric anomaly, km, xyz interleaved */
  samples: Float64Array;
  /** distance from the planet's centre at each sample, km */
  radii: Float64Array;
}

export interface Body extends Orbit {
  index: number;
  id: string;
  name: string;
  kind: BodyKind;
  role: string;
  status: BodyStatus;
  /** keep-out radius used for collision safety, km */
  keepOutKm: number;
  /** drawn radius, km (always <= keepOutKm so drawn objects never visually overlap) */
  visualKm: number;
  /** visual-only tumble */
  spin: { axis: [number, number, number]; rate: number; phase: number };
  /** visual-only irregular shape, largest axis = 1 */
  shape: [number, number, number];
  /** how many times the path was nudged to clear a conflict */
  adjusted: number;
  /** smallest guaranteed gap between this body's keep-out sphere and any other, km */
  clearanceKm: number;
  nearestId: string;
}

export interface FieldStats {
  bodies: number;
  pairs: number;
  /** pairs cleared by the cheap radial-shell test */
  prunedByShell: number;
  /** pairs that needed the orbit-to-orbit distance search */
  sampled: number;
  /** search cells evaluated by the orbit-distance search */
  cells: number;
  /** path adjustments applied while placing bodies */
  adjustments: number;
  /** proposals thrown away */
  rejected: number;
  minClearanceKm: number;
  minClearancePair: [string, string];
}

export interface OrbitalField {
  seed: string;
  bodies: Body[];
  stats: FieldStats;
}

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let k = 0; k < str.length; k++) {
    h = Math.imul(h ^ str.charCodeAt(k), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: small, fast, deterministic. */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();

/* ------------------------------------------------------------------ */
/* Kepler                                                              */
/* ------------------------------------------------------------------ */

export function solveKepler(meanAnomaly: number, e: number): number {
  let M = meanAnomaly % TAU;
  if (M < 0) M += TAU;
  if (e < 1e-9) return M;
  let E = e < 0.8 ? M + e * Math.sin(M) : Math.PI;
  for (let k = 0; k < 10; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

type Out = { [index: number]: number };

/** Point on the orbit at eccentric anomaly E, written into out[o..o+2] (km). */
export function orbitPoint(orb: Orbit, E: number, out: Out, o = 0): void {
  const x = orb.el.a * (Math.cos(E) - orb.el.e);
  const y = orb.b * Math.sin(E);
  out[o] = x * orb.P[0] + y * orb.Q[0];
  out[o + 1] = x * orb.P[1] + y * orb.Q[1];
  out[o + 2] = x * orb.P[2] + y * orb.Q[2];
}

/** Position at simulated time t seconds, written into out[o..o+2] (km). */
export function positionAt(orb: Orbit, t: number, out: Out, o = 0): void {
  orbitPoint(orb, solveKepler(orb.el.m0 + orb.n * t, orb.el.e), out, o);
}

/** Orbital speed at radius r (vis-viva), km/s. */
export function speedAt(orb: Orbit, rKm: number): number {
  return Math.sqrt(MU_KM3_S2 * (2 / rKm - 1 / orb.el.a));
}

export function makeOrbit(el: Elements): Orbit {
  const cO = Math.cos(el.raan);
  const sO = Math.sin(el.raan);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);
  const cw = Math.cos(el.argp);
  const sw = Math.sin(el.argp);
  const orb: Orbit = {
    el,
    n: Math.sqrt(MU_KM3_S2 / (el.a * el.a * el.a)),
    period: TAU * Math.sqrt((el.a * el.a * el.a) / MU_KM3_S2),
    rp: el.a * (1 - el.e),
    ra: el.a * (1 + el.e),
    b: el.a * Math.sqrt(1 - el.e * el.e),
    P: [cw * cO - sw * sO * ci, cw * sO + sw * cO * ci, sw * si],
    Q: [-sw * cO - cw * sO * ci, -sw * sO + cw * cO * ci, cw * si],
    samples: new Float64Array(ORBIT_SAMPLES * 3),
    radii: new Float64Array(ORBIT_SAMPLES),
  };
  // Evenly spaced eccentric anomalies by angle-addition recurrence (no trig per sample).
  const dc = Math.cos(TAU / ORBIT_SAMPLES);
  const ds = Math.sin(TAU / ORBIT_SAMPLES);
  let c = 1;
  let sn = 0;
  for (let k = 0; k < ORBIT_SAMPLES; k++) {
    const x = el.a * (c - el.e);
    const y = orb.b * sn;
    orb.samples[3 * k] = x * orb.P[0] + y * orb.Q[0];
    orb.samples[3 * k + 1] = x * orb.P[1] + y * orb.Q[1];
    orb.samples[3 * k + 2] = x * orb.P[2] + y * orb.Q[2];
    orb.radii[k] = el.a * (1 - el.e * c);
    const nc = c * dc - sn * ds;
    sn = sn * dc + c * ds;
    c = nc;
  }
  return orb;
}

/* ------------------------------------------------------------------ */
/* Orbit-to-orbit separation (MOID)                                    */
/* ------------------------------------------------------------------ */

const _pa = new Float64Array(3);
const _pb = new Float64Array(3);

function dist2(A: Orbit, B: Orbit, u: number, v: number): number {
  orbitPoint(A, u, _pa);
  orbitPoint(B, v, _pb);
  const dx = _pa[0] - _pb[0];
  const dy = _pa[1] - _pb[1];
  const dz = _pa[2] - _pb[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Pattern search from a seed to a local minimum of the orbit-to-orbit distance, km. */
export function refineSeparation(A: Orbit, B: Orbit, u0: number, v0: number): number {
  let u = u0;
  let v = v0;
  let step = TAU / ORBIT_SAMPLES;
  let best = dist2(A, B, u, v);
  for (let it = 0; it < 70 && step > 2e-6; it++) {
    let bu = u;
    let bv = v;
    let improved = false;
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        if (du === 0 && dv === 0) continue;
        const d2 = dist2(A, B, u + du * step, v + dv * step);
        if (d2 < best) {
          best = d2;
          bu = u + du * step;
          bv = v + dv * step;
          improved = true;
        }
      }
    }
    if (improved) {
      u = bu;
      v = bv;
    } else {
      step *= 0.5;
    }
  }
  return Math.sqrt(best);
}

export interface SeparationCounters {
  /** pairs cleared by the radial-shell test alone */
  shell: number;
  /** pairs that needed the branch-and-bound search */
  sampled: number;
  /** search cells evaluated in total */
  cells: number;
}

const DEFAULT_TOLERANCE_KM = 0.3;
const MAX_CELLS = 8_000;
const DE = TAU / ORBIT_SAMPLES;
const TABLE_MASK = ORBIT_SAMPLES - 1;
// Depth-first stack of (u, v, half-size, lower bound) entries.
const STACK = new Float64Array(4 * 4096);

/**
 * Smallest distance between the two orbit curves, in km, to within `toleranceKm` (default 0.3 km).
 *
 * - If the radial shells of the two orbits are further apart than `threshold`, the shell gap is a
 *   proven lower bound (distance >= | |rA| - |rB| |) and is returned.
 * - Otherwise a branch-and-bound search covers the whole (angle A, angle B) torus. For a cell centred
 *   at (u, v) with half-size h (radians of orbit angle), two independent proofs bound everything in it:
 *     chord:   a point moves at most `a` km per radian, so nothing is closer than d - (aA + aB) h
 *     radial:  the orbital radius changes at most a*e km per radian, and distance >= |rA - rB|, so
 *              nothing is closer than |rA - rB| - (aA eA + aB eB) h
 *   Cells whose best bound cannot beat the cutoff are dropped. Coarse levels read precomputed sample
 *   points; only the few surviving cells near a close approach use trigonometry.
 * - A centre closer than `stopBelow` is an actual pair of points that close, so the search stops
 *   there (certain conflict).
 * - A return value >= threshold is a proven lower bound on the true minimum.
 */
export function orbitSeparation(
  A: Orbit,
  B: Orbit,
  threshold: number,
  stopBelow = threshold,
  counters?: SeparationCounters,
  toleranceKm = DEFAULT_TOLERANCE_KM,
): number {
  const gap = Math.max(A.rp - B.ra, B.rp - A.ra);
  if (gap >= threshold) {
    if (counters) counters.shell++;
    return gap;
  }
  if (counters) counters.sampled++;

  const sa = A.samples;
  const sb = B.samples;
  const aSum = A.el.a + B.el.a;
  const eSum = A.el.a * A.el.e + B.el.a * B.el.e;
  let best = Infinity;
  let cells = 0;
  let sp = 0;
  let radDiff = 0;

  /** centre distance; leaves |rA - rB| in radDiff */
  const evaluate = (u: number, v: number, h: number): number => {
    cells++;
    if (h >= DE * 0.999) {
      // table lookup: centres at coarse levels are whole sample indices
      const i = Math.round(u / DE) & TABLE_MASK;
      const j = Math.round(v / DE) & TABLE_MASK;
      const dx = sa[3 * i] - sb[3 * j];
      const dy = sa[3 * i + 1] - sb[3 * j + 1];
      const dz = sa[3 * i + 2] - sb[3 * j + 2];
      radDiff = Math.abs(A.radii[i] - B.radii[j]);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    radDiff = Math.abs(A.el.a * (1 - A.el.e * Math.cos(u)) - B.el.a * (1 - B.el.e * Math.cos(v)));
    return Math.sqrt(dist2(A, B, u, v));
  };
  const lowerBound = (d: number, h: number) => Math.max(d - aSum * h, radDiff - eSum * h);

  const visit = (u: number, v: number, h: number): boolean => {
    const d = evaluate(u, v, h);
    if (d < best) best = d;
    if (d < stopBelow) return true;
    const lb = lowerBound(d, h);
    if (lb < Math.min(threshold, best - toleranceKm) && sp + 4 <= STACK.length) {
      STACK[sp++] = u;
      STACK[sp++] = v;
      STACK[sp++] = h;
      STACK[sp++] = lb;
    }
    return false;
  };

  const finish = (value: number) => {
    if (counters) counters.cells += cells;
    return value;
  };

  // Seed with a 16 x 16 grid of cells, each 16 samples wide, centred on sample indices.
  const H0 = 8 * DE;
  for (let iu = 0; iu < 16; iu++) {
    for (let iv = 0; iv < 16; iv++) {
      if (visit((8 + 16 * iu) * DE, (8 + 16 * iv) * DE, H0)) return finish(best);
    }
  }

  while (sp > 0 && cells < MAX_CELLS) {
    const lb = STACK[--sp];
    const h = STACK[--sp];
    const v = STACK[--sp];
    const u = STACK[--sp];
    // the cutoff may have tightened since this cell was pushed
    if (lb >= Math.min(threshold, best - toleranceKm)) continue;
    if (aSum * h <= toleranceKm) continue; // leaf: centre distance already recorded
    const hc = h / 2;
    for (let cu = -1; cu <= 1; cu += 2) {
      for (let cv = -1; cv <= 1; cv += 2) {
        if (visit(u + cu * hc, v + cv * hc, hc)) return finish(best);
      }
    }
  }

  // Budget exhausted in a decision search: treat the pair as a conflict, which can only reject paths.
  if (cells >= MAX_CELLS && sp > 0 && stopBelow > 0) return finish(Math.min(best, stopBelow - 1));
  return finish(best >= threshold ? threshold : best);
}

/* ------------------------------------------------------------------ */
/* Swept (continuous) collision test                                   */
/* ------------------------------------------------------------------ */

/** Closest approach of two points that move linearly from p0->p1 and q0->q1 over one step. */
export function sweptMinDistance(
  p: ArrayLike<number>,
  po: number,
  p1: ArrayLike<number>,
  q: ArrayLike<number>,
  qo: number,
  q1: ArrayLike<number>,
): number {
  const rx = p[po] - q[qo];
  const ry = p[po + 1] - q[qo + 1];
  const rz = p[po + 2] - q[qo + 2];
  const vx = p1[po] - p[po] - (q1[qo] - q[qo]);
  const vy = p1[po + 1] - p[po + 1] - (q1[qo + 1] - q[qo + 1]);
  const vz = p1[po + 2] - p[po + 2] - (q1[qo + 2] - q[qo + 2]);
  const vv = vx * vx + vy * vy + vz * vz;
  let s = vv > 1e-12 ? -(rx * vx + ry * vy + rz * vz) / vv : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const cx = rx + s * vx;
  const cy = ry + s * vy;
  const cz = rz + s * vz;
  return Math.sqrt(cx * cx + cy * cy + cz * cz);
}

export interface SafetyMonitor {
  /** Advance to simulated time t, sweeping every candidate pair across the interval since the last call. */
  step(t: number): void;
  readonly stats: { pairsWatched: number; intervalsChecked: number; violations: number; closestKm: number };
}

/**
 * Runtime verification. The orbit geometry already forbids meetings; this independently watches the
 * pairs whose orbits are not far apart, using sub-stepped swept tests so fast bodies cannot tunnel
 * through each other between frames.
 */
export function createSafetyMonitor(bodies: Body[]): SafetyMonitor {
  const watched: [number, number][] = [];
  const slotOf = new Map<number, number>();
  const involved: number[] = [];
  const slot = (bi: number) => {
    let s = slotOf.get(bi);
    if (s === undefined) {
      s = involved.length;
      slotOf.set(bi, s);
      involved.push(bi);
    }
    return s;
  };
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const gap = Math.max(bodies[i].rp - bodies[j].ra, bodies[j].rp - bodies[i].ra);
      if (gap < 5_000) watched.push([slot(i), slot(j)]);
    }
  }
  const hard = (si: number, sj: number) => bodies[involved[si]].keepOutKm + bodies[involved[sj]].keepOutKm;

  let prev = new Float64Array(involved.length * 3);
  let cur = new Float64Array(involved.length * 3);
  let tPrev = Number.NaN;
  const stats = { pairsWatched: watched.length, intervalsChecked: 0, violations: 0, closestKm: Infinity };

  const sample = (t: number, out: Float64Array) => {
    for (let s = 0; s < involved.length; s++) positionAt(bodies[involved[s]], t, out, 3 * s);
  };

  return {
    stats,
    step(t: number) {
      if (!Number.isFinite(tPrev) || t < tPrev || t - tPrev > 7_200) {
        sample(t, prev);
        tPrev = t;
        return;
      }
      const dt = t - tPrev;
      if (dt <= 0) return;
      const n = Math.min(64, Math.ceil(dt / 60));
      for (let s = 1; s <= n; s++) {
        sample(tPrev + (dt * s) / n, cur);
        for (const [si, sj] of watched) {
          const d = sweptMinDistance(prev, 3 * si, cur, prev, 3 * sj, cur);
          stats.intervalsChecked++;
          if (d < stats.closestKm) stats.closestKm = d;
          if (d < hard(si, sj)) stats.violations++;
        }
        const swap = prev;
        prev = cur;
        cur = swap;
      }
      tPrev = t;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Field generation                                                    */
/* ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  kind: BodyKind;
  role: string;
  status: BodyStatus;
  keepOutKm: number;
  visualKm: number;
  propose: (rng: Rng, widenKm: number) => Elements;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function lanternSpecs(): Spec[] {
  // The neighbours of slot 17 in the 24-station network. L-09, L-16 and L-18 match the ice damage
  // already shown on the Lantern Network board.
  const ids: [number, BodyStatus][] = [
    [9, "damaged"],
    [13, "online"],
    [15, "online"],
    [16, "damaged"],
    [18, "damaged"],
    [19, "online"],
    [22, "online"],
    [24, "online"],
  ];
  return ids.map(([n, status]) => ({
    id: `L-${pad(n)}`,
    name: `Lantern ${n}`,
    kind: "lantern" as const,
    role: status === "damaged" ? "Lantern station, ice-damaged collector" : "Lantern station",
    status,
    keepOutKm: 220,
    visualKm: 200,
    // Irregular on purpose: eccentric paths that swing from low over the surface to far out,
    // each tilted differently, so the Lanterns do not trace a neat ring.
    propose: (rng, widen) => ({
      a: range(rng, 11_800, 19_500 + widen),
      e: range(rng, 0.1, 0.3),
      i: range(rng, 4, 68) * DEG,
      raan: range(rng, 0, TAU),
      argp: range(rng, 0, TAU),
      m0: range(rng, 0, TAU),
    }),
  }));
}

function missionSpecs(): Spec[] {
  const defs: { id: string; name: string; role: string; a: [number, number]; e: number; i: [number, number] }[] = [
    { id: "CR-1", name: "Control Relay CR-1", role: "Relay to Control, far side", a: [16_000, 21_500], e: 0.05, i: [20, 60] },
    { id: "TN-2", name: "Repair Tender TN-2", role: "Parked repair tender", a: [10_500, 13_000], e: 0.03, i: [5, 35] },
    { id: "SB-3", name: "Survey Beacon SB-3", role: "Thermal survey beacon", a: [9_000, 15_000], e: 0.08, i: [0, 80] },
    { id: "IC-4", name: "Ice Core Cache IC-4", role: "Sample cache from the first survey", a: [14_000, 22_000], e: 0.1, i: [100, 160] },
  ];
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    kind: "mission" as const,
    role: d.role,
    status: "nominal" as const,
    keepOutKm: 170,
    visualKm: 150,
    propose: (rng, widen) => ({
      a: range(rng, d.a[0], d.a[1] + widen),
      e: range(rng, 0, d.e),
      i: range(rng, d.i[0], d.i[1]) * DEG,
      raan: range(rng, 0, TAU),
      argp: range(rng, 0, TAU),
      m0: range(rng, 0, TAU),
    }),
  }));
}

function satelliteSpecs(count: number): Spec[] {
  const roles = ["Ice-radar survey satellite", "Comms relay", "Navigation beacon", "Surface imager", "Thermal observer"];
  return Array.from({ length: count }, (_, k) => ({
    id: `SV-${pad(k + 1)}`,
    name: `Satellite SV-${pad(k + 1)}`,
    kind: "satellite" as const,
    role: roles[k % roles.length],
    status: "nominal" as const,
    keepOutKm: 130,
    visualKm: 110,
    propose: (rng: Rng, widen: number) => ({
      a: range(rng, 9_000, 24_000 + widen),
      e: range(rng, 0, 0.1),
      i: range(rng, 0, 110) * DEG,
      raan: range(rng, 0, TAU),
      argp: range(rng, 0, TAU),
      m0: range(rng, 0, TAU),
    }),
  }));
}

function debrisSpecs(count: number, rng: Rng): Spec[] {
  return Array.from({ length: count }, (_, k) => {
    const keepOutKm = Math.round(range(rng, 60, 120));
    return {
      id: `ICE-${pad(k + 1, 3)}`,
      name: `Ice fragment ${pad(k + 1, 3)}`,
      kind: "debris" as const,
      role: "Ice debris from the collector strike",
      status: "nominal" as const,
      keepOutKm,
      visualKm: keepOutKm * 0.75,
      propose: (r: Rng, widen: number) => ({
        a: range(r, 8_300, 27_000 + widen),
        e: range(r, 0, 0.14),
        // uniform over the sphere of orbit normals: prograde, polar and retrograde all occur
        i: Math.acos(range(r, -1, 1)),
        raan: range(r, 0, TAU),
        argp: range(r, 0, TAU),
        m0: range(r, 0, TAU),
      }),
    };
  });
}

function withinBounds(el: Elements): boolean {
  return el.e >= 0 && el.e < 0.35 && el.a * (1 - el.e) >= MIN_PERIGEE_KM && el.a * (1 + el.e) <= MAX_APOGEE_KM;
}

interface Conflict {
  other: Body;
  separation: number;
  required: number;
  shortfall: number;
}

/**
 * First conflict found, checking the bodies whose radius is closest to the candidate first: those are
 * the likeliest to clash, so most bad proposals are rejected after one or two tests.
 */
function firstConflict(cand: Orbit, keepOutKm: number, placed: Body[], counters: SeparationCounters): Conflict | null {
  const order = placed.slice().sort((p, q) => Math.abs(p.el.a - cand.el.a) - Math.abs(q.el.a - cand.el.a));
  for (const other of order) {
    const required = keepOutKm + other.keepOutKm + SAFETY_MARGIN_KM;
    const separation = orbitSeparation(cand, other, required, required, counters);
    if (separation < required) return { other, separation, required, shortfall: required - separation };
  }
  return null;
}

const MAX_ATTEMPTS = 900;
/** A proposal whose radial range overlaps more than this many existing bodies is dropped without a search. */
const CROWD_LIMIT = 6;

function crowdCount(el: Elements, keepOutKm: number, placed: Body[]): number {
  const rp = el.a * (1 - el.e);
  const ra = el.a * (1 + el.e);
  let crowd = 0;
  for (const o of placed) {
    const required = keepOutKm + o.keepOutKm + SAFETY_MARGIN_KM;
    if (Math.max(rp - o.ra, o.rp - ra) < required) crowd++;
  }
  return crowd;
}
const MAX_NUDGES = 3;

export function generateField(seed: string = FIELD_SEED): OrbitalField {
  const rng = seededRandom(seed);
  const counters: SeparationCounters = { shell: 0, sampled: 0, cells: 0 };
  let adjustments = 0;
  let rejected = 0;

  const specs: Spec[] = [
    ...lanternSpecs(),
    ...missionSpecs(),
    ...satelliteSpecs(10),
    ...debrisSpecs(40, seededRandom(`${seed}/debris-sizes`)),
  ];

  const bodies: Body[] = [];
  const finish = (spec: Spec, orbit: Orbit, adjusted: number): Body => {
    const own = seededRandom(`${seed}/${spec.id}/visual`);
    const ax = range(own, -1, 1);
    const ay = range(own, -1, 1);
    const az = range(own, -1, 1);
    const len = Math.hypot(ax, ay, az) || 1;
    const sx = range(own, 0.65, 1.15);
    const sy = range(own, 0.65, 1.15);
    const sz = range(own, 0.65, 1.15);
    const sm = Math.max(sx, sy, sz);
    return {
      ...orbit,
      index: bodies.length,
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      role: spec.role,
      status: spec.status,
      keepOutKm: spec.keepOutKm,
      visualKm: spec.visualKm,
      spin: {
        axis: [ax / len, ay / len, az / len],
        rate: range(own, 0.15, 0.9) * (own() < 0.5 ? -1 : 1),
        phase: range(own, 0, TAU),
      },
      shape: [sx / sm, sy / sm, sz / sm],
      adjusted,
      clearanceKm: Infinity,
      nearestId: "",
    };
  };

  // Lantern 17 is fixed: the other bodies are routed around it. Slot 17 gives it a 17 degree tilt, and
  // a clearly elliptical path (e = 0.27): about 3,700 km over the surface at its lowest, 11,200 km at its highest.
  bodies.push(
    finish(
      {
        id: HERO_ID,
        name: "Lantern 17",
        kind: "lantern",
        role: "Lantern station, collector struck by ice",
        status: "target",
        keepOutKm: 220,
        visualKm: 200,
        propose: () => ({ a: 13_800, e: 0.27, i: 17 * DEG, raan: 40 * DEG, argp: 110 * DEG, m0: 2.1 }),
      },
      makeOrbit({ a: 13_800, e: 0.27, i: 17 * DEG, raan: 40 * DEG, argp: 110 * DEG, m0: 2.1 }),
      0,
    ),
  );

  for (const spec of specs) {
    let placedBody: Body | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !placedBody; attempt++) {
      // If a region is crowded, let later attempts reach a little further out.
      const widen = Math.floor(attempt / 60) * 1_200;
      let el = spec.propose(rng, widen);
      if (!withinBounds(el)) {
        rejected++;
        continue;
      }
      if (crowdCount(el, spec.keepOutKm, bodies) > CROWD_LIMIT) {
        rejected++;
        continue;
      }
      let orbit = makeOrbit(el);
      let adjusted = 0;
      for (let nudge = 0; nudge <= MAX_NUDGES; nudge++) {
        const conflict = firstConflict(orbit, spec.keepOutKm, bodies, counters);
        if (!conflict) {
          placedBody = finish(spec, orbit, adjusted);
          break;
        }
        if (nudge === MAX_NUDGES) break;
        // Adjust the path: push the semi-major axis away from the orbit it conflicts with.
        const dir = el.a >= conflict.other.el.a ? 1 : -1;
        el = { ...el, a: el.a + dir * (conflict.shortfall + 25) };
        if (!withinBounds(el)) break;
        orbit = makeOrbit(el);
        adjusted++;
        adjustments++;
      }
      if (!placedBody) rejected++;
    }
    if (!placedBody) throw new Error(`Orbit generation could not place ${spec.id} without a conflict`);
    bodies.push(placedBody);
  }

  // Guaranteed clearance between every pair: exact below 1,500 km, a proven lower bound beyond that.
  const minClearance: Pick<FieldStats, "minClearanceKm" | "minClearancePair"> = {
    minClearanceKm: Infinity,
    minClearancePair: ["", ""],
  };
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i];
      const B = bodies[j];
      const sep = orbitSeparation(A, B, 1_500, 0, undefined, 4);
      const clearance = sep - A.keepOutKm - B.keepOutKm;
      if (clearance < A.clearanceKm) {
        A.clearanceKm = clearance;
        A.nearestId = B.id;
      }
      if (clearance < B.clearanceKm) {
        B.clearanceKm = clearance;
        B.nearestId = A.id;
      }
      if (clearance < minClearance.minClearanceKm) {
        minClearance.minClearanceKm = clearance;
        minClearance.minClearancePair = [A.id, B.id];
      }
    }
  }

  return {
    seed,
    bodies,
    stats: {
      bodies: bodies.length,
      pairs: (bodies.length * (bodies.length - 1)) / 2,
      prunedByShell: counters.shell,
      sampled: counters.sampled,
      cells: counters.cells,
      adjustments,
      rejected,
      ...minClearance,
    },
  };
}

let cached: OrbitalField | null = null;

/** The one shared sky. Generated once per page load; identical every time. */
export function getField(): OrbitalField {
  if (!cached) cached = generateField(FIELD_SEED);
  return cached;
}
