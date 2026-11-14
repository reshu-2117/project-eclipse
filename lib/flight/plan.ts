/**
 * The flight computer: turns a route card into real burns, and re-plans when the pilot strays.
 *
 * Geometry (same as the game engine): the Wick circles at 300 km, Lantern 17 at 1,000 km.
 * Every route ends at the approach point, 1 km behind Lantern 17 on the same orbit (a "V-bar" hold,
 * as crews approach the ISS), with the same velocity, so the ship can hold there for ever.
 *
 *   safe        wait 3 h · Hohmann up (2 burns) · drop into a phasing orbit · 5 orbits · climb back
 *   quick       same, with 1 phasing orbit
 *   fastOut     wait 3 h · direct intercept, 22 min · match speed
 *   fastBoth    same as fastOut on the way out
 *   skipWindow  no wait, Wick's plane is 10° off · Hohmann up · plane change · 1 phasing orbit
 *
 * The burns are computed from the physics, not copied from the handbook; tests check they come out at the
 * handbook's numbers (376, 27, 136, 1,282 m/s), and the fast intercept angle is solved so it costs 1,252.
 */
import type { RouteId } from "../game/types";
import { ORBIT } from "../game/data/routes";
import { PLANET } from "../game/constants";
import {
  MU,
  add,
  circularSpeed,
  circularState,
  cross,
  dot,
  frameOf,
  lambert,
  norm,
  propagate,
  scale,
  sub,
  unit,
  type State,
  type V3,
} from "./kepler";

export const R_WICK = (PLANET.radiusKm + PLANET.wickAltKm) * 1e3;
export const R_L17 = (PLANET.radiusKm + PLANET.lanternAltKm) * 1e3;
/** Where the approach begins: this far behind Lantern 17 along its track, m. */
export const GAP_M = 1000;
/** Time from the start of the flight to the first burn, s: room to find your bearings. */
export const LEAD_S = 150;
/** The route card's docking allowance, m/s (the "Dock at Lantern 17" leg). */
export const DOCK_ALLOWANCE = 20;
const DEG = Math.PI / 180;

export type NodeKind = "depart" | "circularize" | "plane" | "phaseDown" | "phaseUp" | "intercept" | "match";

/**
 * A planned burn. "aim" burns are solved by shooting: the Δv at time t that puts the ship at `aimR` at
 * time `aimT`. "orbit" burns set the velocity to a target: circular in a given plane, or Lantern 17's own.
 */
export interface PlanNode {
  kind: NodeKind;
  /** centre of the burn, s since the flight began */
  t: number;
  label: string;
  /** what the computer says, in plain words */
  say: string;
  /** nominal Δv, m/s (for the plan list and the budget) */
  dv: number;
  how: { type: "aim"; aimT: number; aimR: V3 } | { type: "circular"; planeH: V3 } | { type: "rendezvous" };
}

export interface Scenario {
  route: RouteId;
  /** hours spent waiting for the window before the flight starts (shown as a time-lapse) */
  waitH: number;
  ship0: State;
  l17at0: State;
  nodes: PlanNode[];
  /** when the ship reaches the approach point, s */
  approachT: number;
  /** sum of the nominal burns, m/s */
  idealDv: number;
}

/** Lantern 17's state at time t (a circular orbit, exact). */
export const l17At = (sc: Scenario, t: number): State => propagate(sc.l17at0, t);

/** The approach point: on Lantern 17's own orbit, GAP_M behind it. */
export function approachAt(sc: Scenario, t: number): State {
  return propagate(sc.l17at0, t - GAP_M / circularSpeed(R_L17));
}

const vCirc = (r: number) => circularSpeed(r);
const n = (r: number) => Math.sqrt(MU / (r * r * r));

/** Phasing orbit that gains `gain` radians on a circular orbit of radius r over N revolutions; Δv per burn. */
export function phasing(r: number, gain: number, N: number) {
  const T = (2 * Math.PI) / n(r);
  const Tp = (N * 2 * Math.PI - gain) / (N * n(r));
  const a = Math.cbrt(MU * (Tp / (2 * Math.PI)) ** 2);
  const vApo = Math.sqrt(MU * (2 / r - 1 / a));
  return { T, Tp, a, dv: vCirc(r) - vApo, perigeeR: 2 * a - r };
}

/** Hohmann transfer between circular orbits. */
export function hohmannLegs(r1: number, r2: number) {
  const a = (r1 + r2) / 2;
  const dv1 = Math.sqrt(MU * (2 / r1 - 1 / a)) - vCirc(r1);
  const dv2 = vCirc(r2) - Math.sqrt(MU * (2 / r2 - 1 / a));
  return { dv1, dv2, tof: Math.PI * Math.sqrt((a * a * a) / MU) };
}

/** Circular velocity at position r in the plane with normal planeH. */
export function circularVelocity(r: V3, planeH: V3): V3 {
  return scale(unit(cross(planeH, r)), vCirc(norm(r)));
}

/** Fast intercept: the transfer angle, for a fixed 22-minute flight, whose two burns cost the handbook's 1,252 m/s. */
export function fastIntercept(target = ORBIT.fastDv) {
  const tof = ORBIT.fastH * 3600;
  const r1 = circularState(R_WICK, 0);
  const H: V3 = [0, 0, 1];
  const cost = (th: number) => {
    const r2 = circularState(R_L17, th);
    const sol = lambert(r1.r, r2.r, tof, H);
    if (!sol) return Infinity;
    return norm(sub(sol.v1, r1.v)) + norm(sub(r2.v, sol.v2));
  };
  // find the cheapest angle, then step forward (a longer arc) until the cost reaches the target
  let best = 0;
  let bestCost = Infinity;
  for (let th = 20 * DEG; th <= 175 * DEG; th += 0.25 * DEG) {
    const c = cost(th);
    if (c < bestCost) {
      bestCost = c;
      best = th;
    }
  }
  if (bestCost >= target) return { theta: best, dv: bestCost, tof };
  let lo = best;
  let hi = best;
  while (hi < 179 * DEG && cost(hi) < target) hi += 0.5 * DEG;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (cost(mid) < target) lo = mid;
    else hi = mid;
  }
  return { theta: (lo + hi) / 2, dv: cost((lo + hi) / 2), tof };
}

/** Build the nominal flight for a route. */
export function buildScenario(route: RouteId, lead = LEAD_S, burnSeconds: (dv: number) => number = () => 0): Scenario {
  /** Time between the centres of two back-to-back burns: both must finish, then 60 s to turn the ship. */
  const gap = (dvA: number, dvB: number) => Math.max(90, burnSeconds(dvA) / 2 + burnSeconds(dvB) / 2 + 60);
  const H: V3 = [0, 0, 1]; // Lantern 17's orbit normal
  const r1 = R_WICK;
  const r2 = R_L17;
  const hoh = hohmannLegs(r1, r2);
  const lagAngle = 10 * DEG; // where the handbook's catch-up starts: 10° behind
  const nodes: PlanNode[] = [];
  let waitH = route === "skipWindow" ? 0 : ORBIT.windowWaitH;

  if (route === "fastOut" || route === "fastBoth") {
    const fi = fastIntercept();
    const t1 = lead;
    const tArr = t1 + fi.tof;
    // ship starts so that at t1 it is at angle 0
    const ship0 = circularState(r1, -n(r1) * t1);
    const atDepart = propagate(ship0, t1);
    // approach point at tArr sits at angle θ; Lantern 17 is GAP_M further along
    const l17Theta = fi.theta + GAP_M / r2 - n(r2) * tArr;
    const l17at0 = circularState(r2, l17Theta);
    const sc: Scenario = { route, waitH, ship0, l17at0, nodes, approachT: tArr, idealDv: 0 };
    const aim = approachAt(sc, tArr);
    const sol = lambert(atDepart.r, aim.r, fi.tof, H)!;
    const dvA = norm(sub(sol.v1, atDepart.v));
    const dvB = norm(sub(aim.v, sol.v2));
    nodes.push({
      kind: "intercept",
      t: t1,
      label: "Intercept burn",
      say: "One hard burn, aimed straight at where Lantern 17 will be in 22 minutes.",
      dv: dvA,
      how: { type: "aim", aimT: tArr, aimR: aim.r },
    });
    nodes.push({
      kind: "match",
      t: tArr,
      label: "Match speed",
      say: "You arrive fast. Burn hard against your motion to stop beside the station.",
      dv: dvB,
      how: { type: "rendezvous" },
    });
    sc.idealDv = dvA + dvB;
    return sc;
  }

  const N = route === "safe" ? 5 : 1;
  const ph = phasing(r2, lagAngle, N);
  const skip = route === "skipWindow";
  const inc = skip ? 10 * DEG : 0;
  const tDep = lead;
  const tCirc = tDep + hoh.tof;
  // the ship departs at angle π (in its own plane) so it arrives on the +x axis: the line of nodes
  // When the plane must change, the burn happens just after the climb, on the line where the two planes
  // cross (the x axis), so the ship reaches the top of its climb that much short of it.
  const before = skip ? n(r2) * gap(hoh.dv2, 2 * vCirc(r2) * Math.sin(inc / 2)) : 0;
  const ship0 = circularState(r1, Math.PI - before - n(r1) * tDep, inc);
  const shipH = unit(cross(ship0.r, ship0.v));
  // Gaps between back-to-back burns, so each finishes before the next starts.
  const planeDv = skip ? 2 * vCirc(r2) * Math.sin(inc / 2) : 0;
  const tPlane = tCirc + gap(hoh.dv2, planeDv);
  const tDown = skip ? tPlane + gap(planeDv, ph.dv) : tCirc + gap(hoh.dv2, ph.dv);
  const tUp = tDown + N * ph.Tp;

  // nominal trajectory, impulsive burns
  let s = propagate(ship0, tDep);
  const depart = frameOf(s).pro;
  s = { r: s.r, v: add(s.v, scale(depart, hoh.dv1)) };
  s = propagate(s, tCirc - tDep);
  const circR = s.r;
  s = { r: s.r, v: circularVelocity(s.r, shipH) };
  if (skip) {
    s = propagate(s, tPlane - tCirc);
    s = { r: s.r, v: circularVelocity(s.r, H) };
  }
  s = propagate(s, tDown - (skip ? tPlane : tCirc));
  const downR = s.r;
  s = { r: s.r, v: scale(unit(s.v), norm(s.v) - ph.dv) };
  s = propagate(s, tUp - tDown);
  const upR = s.r;
  // the ship is now 10° ahead of where it would have been; put Lantern 17 GAP_M ahead of it
  const shipAngle = Math.atan2(upR[1], upR[0]);
  const l17Theta = shipAngle + GAP_M / r2 - n(r2) * tUp;
  const l17at0 = circularState(r2, l17Theta);

  const sc: Scenario = { route, waitH, ship0, l17at0, nodes, approachT: tUp, idealDv: 0 };

  nodes.push({
    kind: "depart",
    t: tDep,
    label: "Leave the Wick",
    say: "Burn forward. Going faster at the bottom swings the far side of your orbit up to Lantern 17's height.",
    dv: hoh.dv1,
    how: { type: "aim", aimT: tCirc, aimR: circR },
  });
  nodes.push({
    kind: "circularize",
    t: tCirc,
    label: "Round off the orbit",
    say: "You've coasted to the top. Burn forward again, or you'll fall straight back down.",
    dv: hoh.dv2,
    how: { type: "circular", planeH: shipH },
  });
  if (skip) {
    const vBefore = circularVelocity(circR, shipH);
    const vAfter = circularVelocity(circR, H);
    nodes.push({
      kind: "plane",
      t: tPlane,
      label: "Change plane 10°",
      say: "Turn your whole orbit 10° to line up with Lantern 17. Turning is the most expensive thing in space.",
      dv: norm(sub(vAfter, vBefore)),
      how: { type: "circular", planeH: H },
    });
  }
  nodes.push({
    kind: "phaseDown",
    t: tDown,
    label: "Slow down to catch up",
    say: `Lantern 17 is ${Math.round(lagAngle / DEG)}° ahead. Brake. A lower orbit is a faster one, so slowing down is how you catch it.`,
    dv: ph.dv,
    how: { type: "aim", aimT: tUp, aimR: upR },
  });
  nodes.push({
    kind: "phaseUp",
    t: tUp,
    label: "Climb back and hold",
    say: "Burn forward to climb back to its orbit and stop, one kilometre behind the station.",
    dv: ph.dv,
    how: { type: "rendezvous" },
  });
  void downR;
  sc.idealDv = nodes.reduce((k, x) => k + x.dv, 0);
  return sc;
}

// ── live guidance ──

function solve3(A: number[][], b: V3): V3 | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let q = c; q < 4; q++) M[r][q] -= k * M[c][q];
    }
  }
  const x: V3 = [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  return x.every(Number.isFinite) ? x : null;
}

/**
 * Shooting: the impulsive Δv now that puts a coasting ship as close as possible to `aimR` after `dt`
 * seconds. Levenberg–Marquardt on exact Kepler propagation, so directions a single burn cannot control
 * (a radial or sideways error after a whole number of orbits) are left alone instead of blowing up;
 * the leftover is cleaned up by the terminal approach burn. Returns the Δv and the leftover miss.
 */
export function shootLM(s: State, dt: number, aimR: V3, guess: V3 = [0, 0, 0]): { dv: V3; miss: number } | null {
  if (dt < 1) return null;
  const missOf = (dv: V3) => sub(propagate({ r: s.r, v: add(s.v, dv) }, dt).r, aimR);
  let x: V3 = [...guess];
  let f = missOf(x);
  let cost = norm(f);
  let lambda = 1e-3;
  for (let it = 0; it < 40 && cost > 0.05; it++) {
    const eps = 0.01;
    const J: number[][] = [[], [], []];
    for (let j = 0; j < 3; j++) {
      const xp: V3 = [...x];
      xp[j] += eps;
      const fp = missOf(xp);
      for (let i = 0; i < 3; i++) J[i][j] = (fp[i] - f[i]) / eps;
    }
    // JᵀJ and Jᵀf
    const JtJ = [0, 1, 2].map((a) => [0, 1, 2].map((b) => J[0][a] * J[0][b] + J[1][a] * J[1][b] + J[2][a] * J[2][b]));
    const Jtf: V3 = [0, 1, 2].map((a) => -(J[0][a] * f[0] + J[1][a] * f[1] + J[2][a] * f[2])) as V3;
    const diagMax = Math.max(JtJ[0][0], JtJ[1][1], JtJ[2][2], 1e-12);
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v + lambda * diagMax : v)));
      const step = solve3(A, Jtf);
      if (!step) {
        lambda *= 10;
        continue;
      }
      const xn = add(x, step);
      const fn = missOf(xn);
      const cn = norm(fn);
      if (Number.isFinite(cn) && cn < cost) {
        x = xn;
        f = fn;
        cost = cn;
        lambda = Math.max(1e-12, lambda / 10);
        improved = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  return x.every(Number.isFinite) ? { dv: x, miss: cost } : null;
}

/**
 * A phasing burn: after whole orbits a single burn only controls *when* you get back, not where, so the
 * computer solves just the forward/backward speed that brings the ship to the aim point's angle on time.
 * Any height or sideways error is left for the terminal approach burn, as real crews do.
 */
export function phaseBurn(s: State, dt: number, aimR: V3, nominal: number): V3 | null {
  const H = unit(cross(s.r, s.v));
  const pro = frameOf(s).pro;
  const ang = (k: number) => {
    const p = propagate({ r: s.r, v: add(s.v, scale(pro, k)) }, dt).r;
    // signed angle from aimR to p about H
    return Math.atan2(dot(cross(aimR, p), H), dot(aimR, p));
  };
  let lo = nominal - 120;
  let hi = nominal + 120;
  let flo = ang(lo);
  const fhi = ang(hi);
  if (!(flo * fhi < 0)) {
    // no bracket: take the best of a coarse scan
    let best = nominal;
    let bestA = Infinity;
    for (let k = lo; k <= hi; k += 1) {
      const a = Math.abs(ang(k));
      if (a < bestA) {
        bestA = a;
        best = k;
      }
    }
    return scale(pro, best);
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = ang(mid);
    if (fm * flo <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return scale(pro, (lo + hi) / 2);
}

/**
 * The velocity, at the ship's position, of an orbit with Lantern 17's size and angular momentum in the
 * given plane. At 1,000 km that is plain circular; a little off that height it keeps the right period
 * (so phasing works out) instead of locking in a slightly wrong circle. A long burn steering to this
 * ends on the right orbit even though it can't happen at one point.
 */
export function onL17Orbit(s: State, planeH: V3): V3 {
  const r = norm(s.r);
  const rHat = unit(s.r);
  const tHat = unit(cross(planeH, s.r));
  const h = Math.sqrt(MU * R_L17);
  const vt = h / r;
  const vr2 = (2 * MU) / r - MU / R_L17 - vt * vt;
  const vr = vr2 > 0 ? Math.sqrt(vr2) * Math.sign(dot(s.v, rHat) || 1) : 0;
  return add(scale(tHat, vt), scale(rHat, vr));
}

/** Shooting that must hit: the Δv, or null when the target can't be reached within 5 m. */
export function shoot(s: State, dt: number, aimR: V3, guess: V3 = [0, 0, 0]): V3 | null {
  const r = shootLM(s, dt, aimR, guess);
  return r && r.miss < 5 ? r.dv : null;
}

/**
 * The Δv the computer wants for a node, from the ship's state at time t (the node's own maths, applied
 * to wherever the ship really is). For a burn already under way this is what is left to do.
 */
export function nodeDv(sc: Scenario, node: PlanNode, s: State, t: number, guess?: V3): V3 | null {
  switch (node.how.type) {
    case "circular":
      return sub(onL17Orbit(s, node.how.planeH), s.v);
    case "rendezvous":
      return sub(approachAt(sc, t).v, s.v);
    case "aim": {
      const period = 2 * Math.PI * Math.sqrt(norm(s.r) ** 3 / MU);
      if (node.how.aimT - t > 0.75 * period) {
        // multi-orbit leg: a phasing burn (signed along prograde; braking is negative)
        const along = guess ? dot(guess, frameOf(s).pro) : node.kind === "phaseDown" ? -node.dv : node.dv;
        return phaseBurn(s, node.how.aimT - t, node.how.aimR, along);
      }
      const dt = node.how.aimT - t;
      const guesses: V3[] = [];
      if (guess) guesses.push(guess);
      guesses.push(scale(frameOf(s).pro, node.dv));
      const sol = lambert(s.r, node.how.aimR, dt, unit(cross(s.r, s.v)));
      if (sol) guesses.push(sub(sol.v1, s.v));
      let best: { dv: V3; miss: number } | null = null;
      const score = (x: { dv: V3; miss: number }) => (x.miss > 50 ? 1e6 + x.miss : 0) + norm(x.dv);
      for (const g of guesses) {
        const r = shootLM(s, dt, node.how.aimR, g);
        if (r && (!best || score(r) < score(best))) best = r;
        if (best && best.miss < 1 && norm(best.dv) < node.dv * 1.5 + 20) break;
      }
      return best ? best.dv : null;
    }
  }
}

/**
 * When the plan is lost (a burn missed by minutes, a big dodge, a pilot going their own way), build a
 * new one: a direct intercept of the approach point, picking the cheapest flight time we can solve.
 */
export function replan(sc: Scenario, s: State, t: number, terminal = false): { nodes: PlanNode[]; dv: number } | null {
  const H = unit(cross(sc.l17at0.r, sc.l17at0.v));
  const start = t + 90;
  const at = propagate(s, start - t);
  let best: { tof: number; dv: number; aim: State; dvA: number; dvB: number; score: number } | null = null;
  for (let tof = terminal ? 12 * 60 : 15 * 60; tof <= (terminal ? 90 * 60 : 3 * 3600); tof += 60) {
    const aim = approachAt(sc, start + tof);
    const sol = lambert(at.r, aim.r, tof, H);
    if (!sol) continue;
    const peri = (() => {
      const st = { r: at.r, v: sol.v1 };
      const h = norm(cross(st.r, st.v));
      const e = sub(scale(cross(st.v, cross(st.r, st.v)), 1 / MU), scale(st.r, 1 / norm(st.r)));
      return (h * h) / MU / (1 + norm(e));
    })();
    if (peri < (PLANET.radiusKm + 150) * 1e3) continue; // would graze the atmosphere
    const dvA = norm(sub(sol.v1, at.v));
    const dvB = norm(sub(aim.v, sol.v2));
    // the cheapest, but time counts too: an hour is worth 3 m/s
    const score = dvA + dvB + (tof / 3600) * 3;
    if (!best || score < best.score) best = { tof, dv: dvA + dvB, aim, dvA, dvB, score };
  }
  if (!best) return null;
  const nodes: PlanNode[] = [
    {
      kind: "intercept",
      t: start,
      label: terminal ? "Close the gap" : "New intercept",
      say: terminal
        ? "You're close, but not on the spot. A small burn now sets up a path to the approach point."
        : "The old plan is gone. One burn sets up a new path straight to the approach point.",
      dv: best.dvA,
      how: { type: "aim", aimT: start + best.tof, aimR: best.aim.r },
    },
    {
      kind: "match",
      t: start + best.tof,
      label: "Match speed",
      say: "Burn against your motion to stop one kilometre behind the station.",
      dv: best.dvB,
      how: { type: "rendezvous" },
    },
  ];
  return { nodes, dv: best.dv };
}
