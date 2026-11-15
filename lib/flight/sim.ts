/**
 * The live flight: one ship, Lantern 17, a fast ice fragment and the slow ice haze, under real gravity.
 *
 * Pure TypeScript, no DOM: the flight deck calls `step(realSeconds)` every frame and reads the state.
 * Coasting is exact (Kepler); thrust is integrated with RK4. Attitude slews at a real RCS rate, and a
 * burn pushes along wherever the ship actually points, so a burn started before the turn finishes
 * wastes fuel (cosine loss), as it would.
 *
 * Fuel accounting: the engine charged the route card's Δv before launch. Here the tank holds
 * engine Δv left + that route Δv, and every burn and thruster pulse comes out of it. At docking the
 * flight reports `spent − routeDv`: positive costs fuel, negative gives it back.
 */
import type { GameState } from "../game/types";
import { dvLeft, isEclipse } from "../game/engine";
import { FRAGMENT, RCS, bumpDamage, fragmentDamage, shipSpec, type ShipSpec } from "./ship";
import {
  MU,
  R_PLANET,
  add,
  addScaled,
  closestApproach,
  cross,
  dot,
  elements,
  frameOf,
  fromLocal,
  lvlhOf,
  norm,
  propagate,
  scale,
  sub,
  toLocal,
  unit,
  type State,
  type V3,
} from "./kepler";
import { GAP_M, approachAt, buildScenario, l17At, nodeDv, replan, type PlanNode, type Scenario } from "./plan";

export type Aim = "computer" | "pro" | "retro" | "radOut" | "radIn" | "nrm" | "anti";
export const AIMS: { id: Aim; label: string; key: string }[] = [
  { id: "computer", label: "Computer", key: "C" },
  { id: "pro", label: "Prograde", key: "W" },
  { id: "retro", label: "Retrograde", key: "S" },
  { id: "radOut", label: "Radial out", key: "E" },
  { id: "radIn", label: "Radial in", key: "Q" },
  { id: "nrm", label: "Normal", key: "A" },
  { id: "anti", label: "Anti-normal", key: "D" },
];

export const WARPS = [1, 5, 10, 50, 100, 500, 1000];

export type Mode = "cruise" | "approach" | "docked" | "lost";

export interface Conjunction {
  /** time of closest approach, s */
  tca: number;
  /** alert time, s */
  alertT: number;
  /** fragment state at flight time 0 (for exact propagation) */
  frag0: State;
  /** the miss the fragment really has if the ship does not move, m (hidden) */
  trueMiss: number;
  /** a fixed measurement error, shrinking as TCA approaches */
  noise: V3;
  /** live prediction */
  predMiss: number;
  pc: number;
  /** relative speed, m/s */
  relSpeed: number;
  /** the dodge the computer recommends */
  dodge: { aim: Aim; dv: number } | null;
  state: "pending" | "alert" | "passed" | "hit";
  /** how far it really passed, m */
  passedAt: number | null;
  /** what the pass did */
  damage?: { hull: number; strikes: number; through: number; direct: boolean };
}

export interface Chunk {
  id: number;
  s: State;
  /** radius, m */
  size: number;
  /** spin, for drawing */
  spin: V3;
  hit: boolean;
}

export interface FlightEvent {
  type:
    | "burnStart"
    | "burnStop"
    | "cutoff"
    | "nodeDone"
    | "replan"
    | "alert"
    | "tca"
    | "fragHit"
    | "chunkHit"
    | "chunkNear"
    | "approach"
    | "contact"
    | "bounce"
    | "card"
    | "stop"
    | "dry"
    | "lost";
  text?: string;
  value?: number;
}

export interface FlightSnapshot {
  v: 1;
  seed: number;
  route: string;
  card: number;
  t: number;
  ship: State;
  att: V3;
  spent: number;
  rcsSpent: number;
  hullTotal: number;
  reportedT: number;
  waitPending: number;
  plan: PlanNode[];
  nodeIdx: number;
  replans: number;
  terminalDone: number;
  conj: Conjunction;
  cardTimes: number[];
  cardIdx: number;
  guide: boolean;
}

export interface Contact {
  speed: number;
  lateral: number;
  kind: "soft" | "hard" | "bounce";
  hull: number;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rodrigues rotation. */
function rotate(v: V3, axis: V3, ang: number): V3 {
  const k = unit(axis);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const kv = cross(k, v);
  const kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

/** Where the docking port sits in Lantern 17's local frame (x along track, y up, z sideways), m. */
export const PORT_LOCAL: V3 = [-38, 0, 0];
/** The station's rough shape for collisions, in its local frame, m. */
export const STATION_BOX = { spineEnd: 44, spineR: 5, petalsX: 48, petalsR: 24 };
/** Ship nose length from its centre to its docking ring, m. */
export const NOSE_M = 4.2;
/** Ship collision radius, m. */
export const SHIP_R = 3.2;
/** Contact limits (real Dragon/ISS capture is about 0.1 m/s and 0.1 m; ours are a little kinder). */
export const SOFT = { speed: 0.3, lateral: 0.5 };
export const HARD = { speed: 0.8, lateral: 1.2 };
/** Slew rate, rad/s. */
const SLEW = (12 * Math.PI) / 180;
const HAZE_N = 34;

export class FlightSim {
  readonly sc: Scenario;
  spec: ShipSpec;
  readonly seed: number;
  /** flight time, s (0 = the window opens) */
  t = 0;
  ship: State;
  /** where the nose points (unit, inertial) */
  att: V3;
  mode: Mode = "cruise";
  /** Δv spent so far (main engine + thrusters), m/s */
  spent = 0;
  rcsSpent = 0;
  /** the engine's Δv left, updated by the flight deck after every card */
  engineDvLeft: number;
  /** hull damage not yet reported */
  hullPending = 0;
  hullTotal = 0;
  /** flight time of the last report to the engine, s */
  reportedT: number;
  /** the window wait, reported once with the first report */
  waitPending: number;

  plan: PlanNode[];
  nodeIdx = 0;
  /** the last computed remaining Δv for the active node */
  remaining: V3 = [0, 0, 0];
  replans = 0;
  terminalDone = 0;

  // controls
  burn = false;
  /** cut-off latch: after the computer cuts the engine, the button must be released */
  latched = false;
  aim: Aim = "computer";
  guide = true;
  rcs: V3 = [0, 0, 0];
  warp = 1;

  thrusting = false;
  rcsActive = false;
  /** Δv achieved since the current burn started */
  burnDv = 0;
  /** an "aim" burn flies a fixed inertial Δv vector (as a real burn plan does); what's been done of it */
  private latch: { idx: number; target: V3; done: V3 } | null = null;
  private prevRem = Infinity;
  private rdvChecked: PlanNode | null = null;
  /** the pilot is holding the button but the computer is still turning the ship */
  aligning = false;

  conj: Conjunction;
  chunks: Chunk[] = [];
  cardTimes: number[];
  cardIdx = 0;
  cardPending = false;
  slowmo = 0;
  contact: Contact | null = null;
  lostReason: string | null = null;
  private rng: () => number;
  private guidanceAt = -1;

  constructor(game: GameState) {
    if (!game.route) throw new Error("No route chosen.");
    this.seed = game.seed;
    this.rng = mulberry(game.seed * 9301 + 49297);
    this.spec = shipSpec(game);
    // a weak engine needs a long first burn; start the flight early enough to centre it on its node
    const bs = (dv: number) => this.burnSecondsFor(dv);
    const first = buildScenario(game.route, undefined, bs);
    const firstHalf = bs(first.nodes[0].dv) / 2;
    this.sc = firstHalf + 60 > first.nodes[0].t ? buildScenario(game.route, Math.ceil(firstHalf + 90), bs) : first;
    this.engineDvLeft = dvLeft(game);
    this.ship = { r: [...this.sc.ship0.r], v: [...this.sc.ship0.v] };
    this.att = frameOf(this.ship).pro;
    this.plan = this.sc.nodes.map((n) => ({ ...n }));
    this.reportedT = 0;
    this.waitPending = this.sc.waitH;
    this.cardTimes = this.scheduleCards(game.deck.length - game.card);
    this.conj = this.makeConjunction();
  }

  // ── derived ──

  get l17(): State {
    return l17At(this.sc, this.t);
  }

  /** The flight has been reported to the engine (docked): the engine's own Δv is the tank now. */
  settled = false;

  /** Δv left in the tank, m/s. */
  get available(): number {
    if (this.settled) return Math.max(0, this.engineDvLeft);
    return Math.max(0, this.engineDvLeft + this.spec.routeDv - this.spent);
  }

  get massKg(): number {
    return this.spec.dryKg * Math.exp(this.available / this.spec.ve);
  }

  get accel(): number {
    return this.spec.thrustN / this.massKg;
  }

  get node(): PlanNode | null {
    return this.mode === "cruise" ? (this.plan[this.nodeIdx] ?? null) : null;
  }

  /** Seconds a burn of `dv` takes at full thrust (rocket equation). */
  burnSeconds(dv: number): number {
    const m0 = this.massKg;
    const m1 = m0 * Math.exp(-dv / this.spec.ve);
    return ((m0 - m1) * this.spec.ve) / this.spec.thrustN;
  }

  /** The node's planned Δv as it will be at its own time (from the current coast). */
  plannedDv(node: PlanNode): V3 | null {
    const at = propagate(this.ship, node.t - this.t);
    return nodeDv(this.sc, node, at, node.t);
  }

  /** When to light the engine for the active node. */
  burnStartT(node: PlanNode, dv: number): number {
    return node.t - this.burnSeconds(dv) / 2;
  }

  /** Mission hour now (engine clock + time flown since the last report). */
  missionHour(gameT: number): number {
    return gameT + this.waitPending + (this.t - this.reportedT) / 3600;
  }

  eclipse(gameT: number) {
    return isEclipse(this.missionHour(gameT));
  }

  /** Relative position and velocity of the ship to Lantern 17 in its local frame (x along track, y up, z side). */
  relative(): { p: V3; v: V3; range: number; rate: number } {
    const l = this.l17;
    const f = lvlhOf(l);
    const d = sub(this.ship.r, l.r);
    const n = Math.sqrt(MU / norm(l.r) ** 3);
    const w = scale(f.hbar, n);
    const dv = sub(sub(this.ship.v, l.v), cross(w, d));
    const p = toLocal(f, d);
    const v = toLocal(f, dv);
    const range = norm(d);
    return { p, v, range, rate: -dot(d, dv) / Math.max(range, 1e-6) };
  }

  /** Port-relative numbers for docking. */
  dockData() {
    const rel = this.relative();
    const nose: V3 = [rel.p[0] + NOSE_M, rel.p[1], rel.p[2]];
    const toPort = sub(PORT_LOCAL, nose);
    const range = toPort[0];
    const lateral = Math.hypot(nose[1] - PORT_LOCAL[1], nose[2] - PORT_LOCAL[2]);
    return { range, lateral, closing: rel.v[0], up: nose[1] - PORT_LOCAL[1], side: nose[2] - PORT_LOCAL[2], vUp: rel.v[1], vSide: rel.v[2], rel };
  }

  /** Direction for an aim mode, at the current state. */
  aimDir(a: Aim): V3 | null {
    const f = frameOf(this.ship);
    switch (a) {
      case "pro":
        return f.pro;
      case "retro":
        return scale(f.pro, -1);
      case "radOut":
        return f.rad;
      case "radIn":
        return scale(f.rad, -1);
      case "nrm":
        return f.nrm;
      case "anti":
        return scale(f.nrm, -1);
      case "computer":
        if (this.mode === "approach") return lvlhOf(this.l17).vbar;
        return norm(this.remaining) > 1e-6 ? unit(this.remaining) : null;
    }
  }

  /** Predicted coast, for the ghost line: points every `step` seconds. */
  predict(seconds: number, count: number, from: State = this.ship): V3[] {
    const out: V3[] = [];
    for (let i = 0; i <= count; i++) out.push(propagate(from, (seconds * i) / count).r);
    return out;
  }

  /** The orbit after the next burn, as the computer plans it. */
  plannedOrbit(count = 160): V3[] | null {
    const node = this.node;
    if (!node) return null;
    const at = propagate(this.ship, Math.max(0, node.t - this.t));
    const dv = this.thrusting ? this.remaining : nodeDv(this.sc, node, at, Math.max(node.t, this.t));
    if (!dv) return null;
    const after = { r: at.r, v: add(at.v, dv) };
    const e = elements(after);
    const span = Number.isFinite(e.period) ? Math.min(e.period, 4 * 3600) : 2 * 3600;
    return this.predict(span, count, after);
  }

  orbitInfo() {
    const e = elements(this.ship);
    return { periKm: (e.rp - R_PLANET) / 1000, apoKm: Number.isFinite(e.ra) ? (e.ra - R_PLANET) / 1000 : Infinity, periodMin: e.period / 60 };
  }

  // ── scheduling ──

  private scheduleCards(n: number): number[] {
    if (n <= 0) return [];
    const first = this.plan[0];
    const t0 = first.t + this.burnSecondsFor(first.dv) / 2 + 150;
    const t1 = this.sc.approachT - 240;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let t = t0 + ((t1 - t0) * (i + 0.5)) / n;
      // keep clear of burns
      for (const node of this.plan) {
        const half = this.burnSecondsFor(node.dv) / 2 + 120;
        if (Math.abs(t - node.t) < half) t = node.t + half;
      }
      out.push(Math.min(t, this.sc.approachT - 120));
    }
    return out.sort((a, b) => a - b);
  }

  private burnSecondsFor(dv: number): number {
    const m0 = this.spec.startKg;
    return ((m0 - m0 * Math.exp(-dv / this.spec.ve)) * this.spec.ve) / this.spec.thrustN;
  }

  /** The fast fragment: set on the longest coast, in sight of the alert. */
  private makeConjunction(): Conjunction {
    // longest coast between two burns
    let best = { a: 0, b: 0 };
    for (let i = 0; i < this.plan.length - 1; i++) {
      const a = this.plan[i].t + this.burnSecondsFor(this.plan[i].dv) / 2 + 60;
      const b = this.plan[i + 1].t - this.burnSecondsFor(this.plan[i + 1].dv) / 2 - 60;
      if (b - a > best.b - best.a) best = { a, b };
    }
    const span = best.b - best.a;
    const lead = Math.min(14 * 60, span * 0.45);
    let tca = best.a + Math.max(lead + 60, span * (0.45 + 0.2 * this.rng()));
    tca = Math.min(tca, best.b - 30);
    // keep it away from the cards
    for (const c of this.cardTimes) if (Math.abs(c - tca) < lead + 120) tca = Math.min(best.b - 30, c + lead + 140);
    const alertT = tca - lead;
    const c: Conjunction = {
      tca,
      alertT,
      frag0: this.sc.ship0,
      trueMiss: 2 + this.rng() * 38,
      noise: [this.rng() * 2 - 1, this.rng() * 2 - 1, this.rng() * 2 - 1],
      predMiss: 0,
      pc: 0,
      relSpeed: 0,
      dodge: null,
      state: "pending",
      passedAt: null,
    };
    this.conjSide = this.rng() < 0.5 ? 1 : -1;
    this.conjAngle = this.rng() * Math.PI * 2;
    this.aimFragment(c, this.nominalAt(tca));
    return c;
  }

  private conjSide = 1;
  private conjAngle = 0;

  /** Put the fragment on a path that passes `trueMiss` from where the ship will be at TCA. */
  private aimFragment(c: Conjunction, at: State) {
    const f = frameOf(at);
    // the fragment crosses at a steep angle: its velocity is the ship's, turned 55° about the radial
    const vf = rotate(at.v, f.rad, ((55 * Math.PI) / 180) * this.conjSide);
    const rel = sub(vf, at.v);
    const across = unit(cross(rel, f.rad));
    const dir = unit(add(scale(f.rad, Math.cos(this.conjAngle)), scale(across, Math.sin(this.conjAngle))));
    const rf = addScaled(at.r, dir, c.trueMiss);
    c.frag0 = propagate({ r: rf, v: vf }, -c.tca);
    c.relSpeed = norm(rel);
  }

  /** The nominal (perfectly flown) ship state at time t, from the plan. */
  private nominalAt(t: number): State {
    let s = this.sc.ship0;
    let now = 0;
    for (const node of this.sc.nodes) {
      if (node.t > t) break;
      s = propagate(s, node.t - now);
      now = node.t;
      const dv = nodeDv(this.sc, node, s, now);
      if (dv) s = { r: s.r, v: add(s.v, dv) };
    }
    return propagate(s, t - now);
  }

  fragAt(t = this.t): State {
    return propagate(this.conj.frag0, t);
  }

  /** Measurement uncertainty of the fragment's track, m (shrinks as it gets closer). */
  private sigma(): number {
    return 14 + 0.32 * Math.max(0, this.conj.tca - this.t);
  }

  /** Re-predict the fragment pass from the ship's current coast. */
  private updateConjunction() {
    const c = this.conj;
    if (c.state !== "alert") return;
    const dtc = c.tca - this.t;
    const ca = closestApproach(this.ship, this.fragAt(), Math.max(0, dtc - 30), dtc + 30, 30);
    const sig = this.sigma();
    // what tracking says: the truth plus an error that shrinks with time
    const shown = Math.max(0, ca.d + c.noise[0] * sig * 0.6);
    c.predMiss = shown;
    const R = FRAGMENT.hardBodyM;
    c.pc = Math.min(0.5, ((R * R) / (2 * sig * sig)) * Math.exp(-(shown * shown) / (2 * sig * sig)));
    // the dodge: try small burns and keep the one that opens the gap most
    if (!this.thrusting) {
      let best: { aim: Aim; dv: number; d: number } | null = null;
      for (const aim of ["pro", "retro", "radOut", "radIn"] as Aim[]) {
        const dir = this.aimDir(aim)!;
        const dv = 0.6;
        const after = { r: this.ship.r, v: addScaled(this.ship.v, dir, dv) };
        const d = closestApproach(after, this.fragAt(), Math.max(0, dtc - 30), dtc + 30, 20).d;
        if (!best || d > best.d) best = { aim, dv, d };
      }
      c.dodge = best && c.pc > 1e-4 ? { aim: best.aim, dv: best.dv } : null;
    }
  }

  private makeHaze() {
    const l = this.l17;
    const f = lvlhOf(l);
    const n = Math.sqrt(MU / norm(l.r) ** 3);
    const w = scale(f.hbar, n);
    const out: Chunk[] = [];
    for (let i = 0; i < HAZE_N; i++) {
      // spread around the approach corridor, thicker near the station
      const along = -60 - Math.pow(this.rng(), 0.7) * 1100;
      const off = 6 + this.rng() * 70;
      const a = this.rng() * Math.PI * 2;
      const local: V3 = [along, Math.cos(a) * off, Math.sin(a) * off];
      // drift mostly across the corridor, a few towards it
      const toAxis = unit([0, -local[1], -local[2]]);
      const sp = 0.15 + this.rng() * 0.9;
      const lv: V3 = add(scale(toAxis, sp * (this.rng() < 0.55 ? 1 : -0.4)), [(this.rng() - 0.5) * 0.4, 0, 0]);
      const d = fromLocal(f, local);
      const v = add(add(l.v, cross(w, d)), fromLocal(f, lv));
      out.push({
        id: i,
        s: { r: add(l.r, d), v },
        size: 0.35 + Math.pow(this.rng(), 2.2) * 2.4,
        spin: [this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5],
        hit: false,
      });
    }
    this.chunks = out;
  }

  // ── controls ──

  maxWarp(): number {
    if (this.mode === "docked" || this.mode === "lost") return 1;
    if (this.thrusting) return this.accel > 1 ? 10 : 50;
    if (this.mode === "approach") return 10;
    if (this.conj.state === "alert" && this.conj.tca - this.t < 120) return 5;
    return WARPS[WARPS.length - 1];
  }

  setWarp(w: number) {
    this.warp = Math.max(1, Math.min(w, this.maxWarp()));
  }

  // ── the step ──

  /**
   * Advance by `real` seconds of wall time. Returns what happened (for sound, voice and the HUD).
   * Stops itself at burns, cards, alerts and the fragment pass, dropping time-warp to 1×.
   */
  step(real: number): FlightEvent[] {
    const ev: FlightEvent[] = [];
    if (this.mode === "docked" || this.mode === "lost" || this.cardPending) return ev;
    if (this.warp > this.maxWarp()) this.warp = this.maxWarp();

    let simDt = real * (this.slowmo > 0 ? 0.05 : this.warp);
    if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - real);

    // stops: never warp through something that needs the pilot
    const stops: { t: number; why: string }[] = [];
    const node = this.node;
    if (node && !this.thrusting && this.warp > 1) {
      const dv = norm(this.plannedDvCached(node));
      const start = this.burnStartT(node, dv) - 20;
      if (this.t < start) stops.push({ t: start, why: "burn" });
    }
    if (this.cardIdx < this.cardTimes.length) stops.push({ t: this.cardTimes[this.cardIdx], why: "card" });
    if (this.conj.state === "pending") stops.push({ t: this.conj.alertT, why: "alert" });
    if (this.conj.state === "alert") stops.push({ t: this.conj.tca - 1.2, why: "tca" });
    if (this.mode === "cruise" && !this.plan[this.nodeIdx] && this.warp > 1) stops.push({ t: this.t, why: "end" });
    let stopWhy: string | null = null;
    for (const s of stops) {
      if (s.t > this.t - 1e-9 && this.t + simDt >= s.t) {
        if (s.why === "tca" && this.slowmo > 0) continue;
        simDt = Math.max(0, s.t - this.t);
        stopWhy = s.why;
      }
    }

    this.advance(simDt, ev);

    if (stopWhy) {
      if (this.warp > 1) ev.push({ type: "stop", text: stopWhy });
      this.warp = 1;
      if (stopWhy === "card") {
        this.cardPending = true;
        this.cardIdx += 1;
        this.burn = false;
        ev.push({ type: "card" });
      } else if (stopWhy === "alert" && this.conj.state === "pending") {
        // aim it at the ship as it really is (no burns are planned before the pass)
        this.aimFragment(this.conj, propagate(this.ship, this.conj.tca - this.t));
        this.conj.state = "alert";
        this.updateConjunction();
        ev.push({ type: "alert" });
      } else if (stopWhy === "tca" && this.conj.state === "alert") {
        this.slowmo = 3.2;
      }
    }

    // the fragment pass
    if (this.conj.state === "alert" && this.t >= this.conj.tca) {
      const d = closestApproach(this.ship, this.fragAt(), -2, 2, 40).d;
      this.conj.passedAt = d;
      const hit = fragmentDamage(d, this.spec.shield, this.seed * 7919 + 17);
      this.conj.damage = hit;
      if (hit.hull > 0) {
        this.conj.state = "hit";
        this.hullPending += hit.hull;
        this.hullTotal += hit.hull;
        ev.push({ type: "fragHit", value: hit.hull, text: hit.direct ? "direct" : `${hit.through} of ${hit.strikes}` });
      } else {
        this.conj.state = "passed";
        ev.push({ type: "tca", value: d, text: hit.strikes ? `${hit.strikes} stopped` : undefined });
      }
    }
    return ev;
  }

  private plannedCache: { t: number; idx: number; dv: V3 } | null = null;
  private plannedDvCached(node: PlanNode): V3 {
    if (this.plannedCache && this.plannedCache.idx === this.nodeIdx && Math.abs(this.plannedCache.t - this.t) < 2) return this.plannedCache.dv;
    const dv = this.plannedDv(node) ?? [0, 0, 0];
    this.plannedCache = { t: this.t, idx: this.nodeIdx, dv };
    return dv;
  }

  private advance(dt: number, ev: FlightEvent[]) {
    let left = dt;
    let guard = 0;
    while (left > 1e-9 && guard++ < 20000) {
      const held = this.burn && !this.latched && this.available > 0 && this.mode === "cruise";
      // with the guide on, the computer only lights the engine once the nose is on target
      // (hysteresis: start within 4°, keep burning unless it slips past 12°)
      this.aligning = held && this.guide && this.pointingError() > (this.thrusting ? 12 : 4);
      const wantBurn = held && !this.aligning;
      const rcsCmd = this.mode === "approach" && norm(this.rcs) > 0 && this.available > 0;
      const powered = wantBurn || rcsCmd || this.aligning;
      const remNow = norm(this.remaining);
      let h = powered ? Math.min(left, 0.25) : left;
      if (wantBurn && remNow > 0) h = Math.min(h, Math.max(0.01, remNow / this.accel / 4));

      // attitude
      const target = this.desiredAttitude();
      if (target) this.slewTo(target, h);

      if (wantBurn && !this.thrusting) {
        this.thrusting = true;
        this.burnDv = 0;
        this.prevRem = Infinity;
        this.startLatch();
        ev.push({ type: "burnStart" });
      } else if (!wantBurn && this.thrusting) {
        this.thrusting = false;
        ev.push({ type: "burnStop", value: this.burnDv });
        this.afterBurn(ev);
      }
      this.rcsActive = rcsCmd;

      if (powered) {
        let acc: V3 = [0, 0, 0];
        if (wantBurn) acc = scale(this.att, this.accel);
        if (rcsCmd) {
          const f = lvlhOf(this.l17);
          const cmd = fromLocal(f, this.rcs);
          const a = RCS.newtons / this.massKg;
          acc = addScaled(acc, unit(cmd), a * Math.min(1, norm(this.rcs)));
        }
        const aMag = norm(acc);
        if (wantBurn && this.latch && this.aim === "computer") this.latch.done = addScaled(this.latch.done, this.att, this.accel * h);
        this.ship = rk4(this.ship, acc, h);
        const dv = aMag * h;
        this.spent += dv;
        if (rcsCmd) this.rcsSpent += dv;
        if (wantBurn) this.burnDv += this.accel * h;
        if (this.available <= 0) {
          this.burn = false;
          ev.push({ type: "dry" });
        }
      } else {
        this.ship = propagate(this.ship, h);
      }
      for (const c of this.chunks) if (!c.hit) c.s = propagate(c.s, h);
      this.t += h;
      left -= h;

      if (this.thrusting) this.guidance(ev, true);
      if (this.mode === "approach") this.proximity(ev, h);
      if (this.mode === "docked" || this.mode === "lost") break;
    }
    if (!this.thrusting) this.guidance(ev, false);
    this.updateConjunctionThrottled();
    this.checkSafety(ev);
  }

  private conjAt = -1;
  private updateConjunctionThrottled() {
    if (this.conj.state !== "alert") return;
    if (Math.abs(this.t - this.conjAt) < 0.5 && !this.thrusting) return;
    this.conjAt = this.t;
    this.updateConjunction();
  }

  private desiredAttitude(): V3 | null {
    if (this.mode === "approach") return lvlhOf(this.l17).vbar;
    if (this.aim === "computer") {
      const d = this.aimDir("computer");
      return d ?? frameOf(this.ship).pro;
    }
    return this.aimDir(this.aim);
  }

  private slewTo(target: V3, h: number) {
    const c = Math.max(-1, Math.min(1, dot(this.att, target)));
    const ang = Math.acos(c);
    if (ang < 1e-6) return;
    const step = Math.min(ang, SLEW * h);
    let axis = cross(this.att, target);
    if (norm(axis) < 1e-9) axis = frameOf(this.ship).rad;
    this.att = unit(rotate(this.att, axis, step));
  }

  /** Angle between where the ship points and where the computer wants it, degrees. */
  pointingError(): number {
    const d = this.aimDir(this.aim) ?? this.att;
    return (Math.acos(Math.max(-1, Math.min(1, dot(this.att, d)))) * 180) / Math.PI;
  }

  /** Lock the active "aim" node's Δv as a fixed inertial vector when its burn starts. */
  private startLatch() {
    const node = this.plan[this.nodeIdx];
    if (!node || this.mode !== "cruise" || node.how.type !== "aim" || this.aim !== "computer") return;
    if (this.latch && this.latch.idx === this.nodeIdx) return; // resuming a burn that was paused
    const at = this.t < node.t ? propagate(this.ship, node.t - this.t) : this.ship;
    const dv = nodeDv(this.sc, node, at, Math.max(node.t, this.t));
    if (dv) this.latch = { idx: this.nodeIdx, target: dv, done: [0, 0, 0] };
  }

  /** The flight computer: what's left of the active burn; cut-off; node done; re-plans. */
  private guidance(ev: FlightEvent[], live: boolean) {
    if (this.mode !== "cruise") return;
    const node = this.plan[this.nodeIdx];
    if (!node) {
      this.remaining = [0, 0, 0];
      this.arrive(ev);
      return;
    }
    if (!live && Math.abs(this.t - this.guidanceAt) < 0.5) return;
    this.guidanceAt = this.t;

    const latched = this.latch && this.latch.idx === this.nodeIdx ? this.latch : null;
    let dvNow: V3 | null = null;
    if (latched) dvNow = sub(latched.target, latched.done);
    else if (node.how.type !== "aim" && (this.thrusting || this.t >= node.t - this.burnSeconds(node.dv) / 2 - 90)) dvNow = nodeDv(this.sc, node, this.ship, this.t);
    this.remaining = dvNow ?? this.plannedDvCached(node);
    const rem = norm(this.remaining);

    if (this.thrusting && this.guide && this.aim === "computer") {
      // cut off on target, or the moment the error starts growing again (overshoot)
      const flipped = latched ? dot(this.remaining, latched.target) <= 0 : false;
      if (rem < Math.max(0.05, Math.min(0.4, node.dv * 0.002)) || flipped || (rem > this.prevRem + 1e-3 && rem < 2)) {
        this.burn = false;
        this.latched = true;
        this.thrusting = false;
        ev.push({ type: "cutoff", value: this.burnDv });
        this.afterBurn(ev);
        return;
      }
    }
    this.prevRem = rem;

    // Arriving off the mark? Matching speed there would lock in the miss. Fly a terminal transfer instead.
    if (node.how.type === "rendezvous" && !this.thrusting && this.rdvChecked !== node && this.t >= node.t - this.burnSeconds(node.dv) / 2 - 300) {
      this.rdvChecked = node;
      const at = propagate(this.ship, Math.max(0, node.t - this.t));
      if (norm(sub(at.r, approachAt(this.sc, Math.max(node.t, this.t)).r)) > 1500 && this.terminalDone < 3) {
        this.terminalDone += 1;
        this.doReplan(ev, true);
        return;
      }
    }

    if (this.available < 0.5 && rem > 1 && !this.thrusting) {
      this.lose("The tank is dry and Lantern 17 is still out of reach.", ev);
      return;
    }

    // missed it badly, or wandered off: re-plan
    const late = this.t - (node.t + this.burnSeconds(node.dv) / 2);
    const tooCostly = rem > Math.max(2.5 * node.dv + 60, 150);
    if (!this.thrusting && ((late > 180 && rem > Math.max(1, node.dv * 0.05)) || (late > -60 && tooCostly))) {
      this.doReplan(ev, false);
    }
  }

  private afterBurn(ev: FlightEvent[]) {
    const node = this.plan[this.nodeIdx];
    if (!node || this.mode !== "cruise") return;
    const latched = this.latch && this.latch.idx === this.nodeIdx ? this.latch : null;
    const dv = latched ? sub(latched.target, latched.done) : nodeDv(this.sc, node, this.ship, this.t, this.remaining);
    const rem = dv ? norm(dv) : Infinity;
    const passed = latched ? dot(sub(latched.target, latched.done), latched.target) <= 0 : false;
    if (rem < Math.max(0.35, node.dv * 0.012) || passed) {
      this.nodeIdx += 1;
      this.latch = null;
      this.remaining = [0, 0, 0];
      this.plannedCache = null;
      ev.push({ type: "nodeDone", text: node.label });
      if (!this.plan[this.nodeIdx]) this.arrive(ev);
    }
  }

  private doReplan(ev: FlightEvent[], terminal: boolean) {
    const p = replan(this.sc, this.ship, this.t, terminal);
    this.replans += 1;
    if (!p) {
      this.lose("The flight computer can't find a path to Lantern 17 from here.", ev);
      return;
    }
    this.plan = [...this.plan.slice(0, this.nodeIdx), ...p.nodes];
    this.plannedCache = null;
    this.latch = null;
    ev.push({ type: "replan", text: terminal ? "terminal" : "intercept", value: p.dv });
  }

  /** After the last burn: close enough to start the approach, or one more burn to close the gap. */
  private arrive(ev: FlightEvent[]) {
    if (this.mode !== "cruise") return;
    const ap = approachAt(this.sc, this.t);
    const miss = norm(sub(this.ship.r, ap.r));
    const rel = this.relative();
    // hand over only from behind the station, inside the approach corridor
    const behind = rel.p[0] < -150 && rel.p[0] > -2600 && Math.hypot(rel.p[1], rel.p[2]) < 400;
    if (miss < 1200 && behind && Math.abs(rel.v[0]) < 2 && Math.hypot(rel.v[1], rel.v[2]) < 2) {
      this.mode = "approach";
      this.burn = false;
      this.latched = false;
      this.warp = 1;
      this.makeHaze();
      this.cardsNow();
      ev.push({ type: "approach" });
      return;
    }
    if (this.terminalDone < 3) {
      this.terminalDone += 1;
      this.doReplan(ev, true);
    } else if (rel.range < 5000 && rel.p[0] < -60) {
      // close enough: hand over to the pilot's thrusters
      this.mode = "approach";
      this.warp = 1;
      this.makeHaze();
      this.cardsNow();
      ev.push({ type: "approach" });
    }
  }

  /** Any cards still to come happen now: you can't dock with events outstanding. */
  private cardsNow() {
    for (let i = this.cardIdx; i < this.cardTimes.length; i++) this.cardTimes[i] = this.t + 4 + (i - this.cardIdx) * 3;
  }

  private proximity(ev: FlightEvent[], h: number) {
    // ice haze
    for (const c of this.chunks) {
      if (c.hit) continue;
      const d = sub(c.s.r, this.ship.r);
      const dist = norm(d);
      if (dist < SHIP_R + c.size) {
        const relV = sub(c.s.v, this.ship.v);
        const sp = Math.abs(dot(relV, unit(d)));
        const dmg = bumpDamage(900 * (4 / 3) * Math.PI * c.size ** 3, sp);
        this.hullPending += dmg;
        this.hullTotal += dmg;
        c.hit = true;
        // the chunk tumbles away; the ship gets a nudge (momentum: ice is ~900 kg/m³)
        const iceKg = 900 * (4 / 3) * Math.PI * c.size ** 3;
        const k = Math.min(0.5, iceKg / this.massKg);
        this.ship = { r: this.ship.r, v: addScaled(this.ship.v, unit(scale(d, -1)), sp * k) };
        c.s = { r: c.s.r, v: addScaled(c.s.v, unit(d), sp * 1.6 + 0.3) };
        ev.push({ type: "chunkHit", value: dmg });
      }
    }
    // the station's body: you can't fly through it
    const dk = this.dockData();
    const p = dk.rel.p;
    const lat = Math.hypot(p[1], p[2]);
    const hitsBody =
      (p[0] + NOSE_M > PORT_LOCAL[0] + 0.5 && p[0] - NOSE_M < STATION_BOX.spineEnd && lat < STATION_BOX.spineR + SHIP_R && dk.lateral >= 2.5) ||
      (p[0] + NOSE_M > STATION_BOX.petalsX - 6 && p[0] - NOSE_M < STATION_BOX.petalsX + 6 && lat < STATION_BOX.petalsR + SHIP_R);
    if (hitsBody) {
      const speed = Math.max(0.2, norm(dk.rel.v));
      const hull = Math.round(Math.min(30, 8 + 12 * speed));
      this.hullPending += hull;
      this.hullTotal += hull;
      // pushed back and away
      const f = lvlhOf(this.l17);
      const away = unit(fromLocal(f, [-1, p[1] * 0.2, p[2] * 0.2]));
      this.ship = { r: addScaled(this.ship.r, away, 0.5), v: addScaled(sub(this.ship.v, fromLocal(f, dk.rel.v)), away, 0.25 + speed * 0.3) };
      this.contact = { speed, lateral: dk.lateral, kind: "bounce", hull };
      ev.push({ type: "bounce", value: hull, text: "structure" });
      return;
    }
    // the port
    if (dk.range <= 0 && dk.rel.p[0] < PORT_LOCAL[0] && dk.lateral < 2.5) {
      const speed = Math.max(0, dk.closing);
      const lateral = dk.lateral;
      let kind: Contact["kind"];
      let hull = 0;
      if (speed <= SOFT.speed && lateral <= SOFT.lateral) kind = "soft";
      else if (speed <= HARD.speed && lateral <= HARD.lateral) {
        kind = "hard";
        hull = Math.round(4 + 14 * Math.max((speed - SOFT.speed) / (HARD.speed - SOFT.speed), (lateral - SOFT.lateral) / (HARD.lateral - SOFT.lateral)));
      } else {
        kind = "bounce";
        hull = Math.round(Math.min(25, 6 + 10 * speed));
      }
      this.hullPending += hull;
      this.hullTotal += hull;
      this.contact = { speed, lateral, kind, hull };
      if (kind === "bounce") {
        // pushed back off the ring
        const f = lvlhOf(this.l17);
        this.ship = { r: addScaled(this.ship.r, f.vbar, -0.3), v: addScaled(this.ship.v, f.vbar, -(speed * 1.3 + 0.08)) };
        ev.push({ type: "bounce", value: hull });
      } else {
        this.mode = "docked";
        this.burn = false;
        this.rcs = [0, 0, 0];
        ev.push({ type: "contact", text: kind, value: hull });
      }
    }
    void h;
  }

  private checkSafety(ev: FlightEvent[]) {
    if (this.mode === "lost" || this.mode === "docked") return;
    const alt = norm(this.ship.r) - R_PLANET;
    if (alt < 110_000) this.lose("The orbit dipped into the atmosphere. The hull scorches and the tanks are spent holding together.", ev);
    else if (norm(this.ship.r) > 60_000_000) this.lose("The ship is climbing away from the planet for good.", ev);
    else if (this.mode === "approach" && this.relative().range > 25_000) this.lose("Lantern 17 has drifted out of reach.", ev);
  }

  private lose(why: string, ev: FlightEvent[]) {
    this.mode = "lost";
    this.lostReason = why;
    this.burn = false;
    this.thrusting = false;
    ev.push({ type: "lost", text: why });
  }

  /** Give up and call for help (ends the flight adrift). */
  abandon(why = "You called for a rescue.") {
    this.mode = "lost";
    this.lostReason = why;
  }

  /** The burn the HUD shows for a node: what's left while burning, else the plan at its time. */
  plannedDvForHud(node: PlanNode): V3 {
    return this.thrusting ? this.remaining : this.plannedDvCached(node);
  }

  /** Reviewer shortcut: the computer flies the whole route perfectly; you take over for the approach. */
  fastForwardToApproach() {
    if (this.mode !== "cruise") return;
    this.t = this.sc.approachT;
    this.ship = approachAt(this.sc, this.t);
    this.att = lvlhOf(this.l17).vbar;
    this.spent = this.sc.idealDv;
    this.nodeIdx = this.plan.length;
    this.remaining = [0, 0, 0];
    this.conj.state = "passed";
    this.conj.passedAt = this.conj.trueMiss + 300;
    this.mode = "approach";
    this.warp = 1;
    this.makeHaze();
    this.cardsNow();
  }

  // ── save and resume (a page refresh mid-flight) ──

  snapshot(card: number): FlightSnapshot {
    return {
      v: 1,
      seed: this.seed,
      route: this.sc.route,
      card,
      t: this.t,
      ship: this.ship,
      att: this.att,
      spent: this.spent,
      rcsSpent: this.rcsSpent,
      hullTotal: this.hullTotal,
      reportedT: this.reportedT,
      waitPending: this.waitPending,
      plan: this.plan,
      nodeIdx: this.nodeIdx,
      replans: this.replans,
      terminalDone: this.terminalDone,
      conj: this.conj,
      cardTimes: this.cardTimes,
      cardIdx: this.cardIdx,
      guide: this.guide,
    };
  }

  /** Resume from a snapshot taken at the same point of the same run; false if it doesn't match. */
  restore(snap: FlightSnapshot, card: number): boolean {
    if (!snap || snap.v !== 1 || snap.seed !== this.seed || snap.route !== this.sc.route || snap.card !== card) return false;
    this.t = snap.t;
    this.ship = snap.ship;
    this.att = snap.att;
    this.spent = snap.spent;
    this.rcsSpent = snap.rcsSpent;
    this.hullTotal = snap.hullTotal;
    this.reportedT = snap.reportedT;
    this.waitPending = snap.waitPending;
    this.plan = snap.plan;
    this.nodeIdx = snap.nodeIdx;
    this.replans = snap.replans;
    this.terminalDone = snap.terminalDone;
    this.conj = snap.conj;
    this.cardTimes = snap.cardTimes;
    this.cardIdx = snap.cardIdx;
    this.guide = snap.guide;
    this.hullPending = 0;
    this.cardPending = false;
    return true;
  }

  // ── reporting to the engine ──

  /** The report to send before a card: time flown and hull damage since the last report. */
  takeReport(): { hours: number; hull: number } {
    const hours = this.waitPending + (this.t - this.reportedT) / 3600;
    const hull = this.hullPending;
    this.waitPending = 0;
    this.reportedT = this.t;
    this.hullPending = 0;
    return { hours, hull };
  }

  /** Δv beyond the route card (negative: flown cheaper). Sent once, at docking. */
  extraDv(): number {
    return this.spent - this.spec.routeDv;
  }

  /** A short readout of the gap to the approach point (cruise) or the station (approach). */
  gapKm(): number {
    if (this.mode === "approach" || this.mode === "docked") return this.relative().range / 1000;
    return norm(sub(this.ship.r, approachAt(this.sc, this.t).r)) / 1000 + GAP_M / 1000;
  }
}

/** One RK4 step under gravity plus a constant acceleration. */
export function rk4(s: State, acc: V3, h: number): State {
  const f = (r: V3): V3 => {
    const rn = norm(r);
    return addScaled(acc, r, -MU / (rn * rn * rn));
  };
  const k1v = f(s.r);
  const k1r = s.v;
  const k2v = f(addScaled(s.r, k1r, h / 2));
  const k2r = addScaled(s.v, k1v, h / 2);
  const k3v = f(addScaled(s.r, k2r, h / 2));
  const k3r = addScaled(s.v, k2v, h / 2);
  const k4v = f(addScaled(s.r, k3r, h));
  const k4r = addScaled(s.v, k3v, h);
  const r = addScaled(s.r, add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6);
  const v = addScaled(s.v, add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6);
  return { r, v };
}
