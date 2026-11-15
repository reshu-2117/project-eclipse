import { describe, expect, it } from "vitest";
import { createGame, step, type Action, type GameState, type RouteId } from "../../game";
import { FlightSim, SOFT } from "../sim";
import { norm } from "../kepler";
import { RCS } from "../ship";
import { DOCK_DEFAULT, DOCK_LEVELS, FULL_THRUST_WARP, approachCap, approachWarp, assistAxis, rcsThrottle, stepLevel, type DockLevel } from "../dock";

function play(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = step(s, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}

function launched(route: RouteId, seed: number) {
  return play(createGame(seed), { type: "begin" }, { type: "launch" }, { type: "route", id: route, piloted: true });
}

const DT = 1 / 30;

/** Fly the cruise like a careful robot until the real hand-over to the approach, so the ship is not perfectly lined up. */
function toHandOver(game: GameState): FlightSim {
  const sim = new FlightSim(game);
  let dodging = 0;
  for (let frames = 0; sim.mode === "cruise" && frames < 600_000; frames++) {
    if (sim.cardPending) {
      sim.takeReport();
      sim.cardPending = false;
    }
    if (sim.latched && !sim.burn) sim.latched = false;
    const node = sim.node;
    if (sim.conj.state === "alert" && sim.conj.dodge && !sim.thrusting && dodging === 0 && sim.conj.tca - sim.t > 60) {
      dodging = sim.conj.dodge.dv;
      sim.aim = sim.conj.dodge.aim;
    }
    if (dodging > 0) {
      sim.setWarp(1);
      if (sim.pointingError() < 1) sim.burn = true;
      if (sim.thrusting && sim.burnDv >= dodging) {
        sim.burn = false;
        dodging = -1;
        sim.aim = "computer";
      }
    } else if (node) {
      const dv = norm(sim.plannedDv(node) ?? [0, 0, 0]);
      const start = sim.burnStartT(node, dv);
      if (sim.t >= start && !sim.latched) sim.burn = true;
      else if (sim.t < start - 30) sim.setWarp(1000);
      else sim.setWarp(1);
    }
    sim.step(DT);
  }
  expect(sim.mode).toBe("approach");
  if (sim.cardPending) {
    sim.takeReport();
    sim.cardPending = false;
  }
  return sim;
}

/** The speed the docking panel calls green for this distance. */
const limit = (r: number) => (r > 300 ? 2 : r > 60 ? 0.8 : r > 15 ? 0.4 : SOFT.speed);

/**
 * Dock the way the flight deck does: the computer lines you up, the pilot only holds Closer or Slow down.
 * `reaction` is how long the pilot's finger stays on a button before they look again.
 */
function dock(sim: FlightSim, level: DockLevel, reaction: number, frac = 0.85) {
  let active = false;
  let hold = 0;
  let until = 0;
  let real = 0;
  let worst = 0;
  let frames = 0;
  while (sim.mode === "approach" && frames++ < 400_000) {
    if (sim.cardPending) {
      sim.takeReport();
      sim.cardPending = false;
    }
    const d = sim.dockData();
    const w = approachWarp(level, d, active);
    active = w.active;
    sim.setWarp(w.warp);
    // the cap must hold on every frame, whatever the level
    worst = Math.max(worst, sim.warp / approachCap(d.range));
    if (real >= until) {
      let target = d.range > 15 ? limit(d.range) * frac : Math.min(limit(d.range) * frac, 0.26);
      if (d.lateral > Math.max(0.3, d.range * 0.25)) target = 0;
      hold = Math.abs(target - d.closing) > 0.03 ? Math.sign(target - d.closing) : 0;
      until = real + reaction;
    }
    const k = d.range < 60 ? 0.08 : 0.03;
    const a = RCS.newtons / sim.massKg;
    const wantUp = Math.max(-0.25, Math.min(0.25, -k * d.up));
    const wantSide = Math.max(-0.25, Math.min(0.25, -k * d.side));
    sim.rcs = [hold, assistAxis(wantUp, d.vUp, a, sim.warp, DT), assistAxis(wantSide, d.vSide, a, sim.warp, DT)];
    sim.step(DT);
    real += DT;
  }
  return { real, kind: sim.contact?.kind, speed: sim.contact?.speed ?? NaN, lateral: sim.contact?.lateral ?? NaN, rcs: sim.rcsSpent, worst, mode: sim.mode };
}

describe("docking time-warp rules", () => {
  it("the cap falls as the ring gets closer, and the last 15 m are real time", () => {
    let prev = Infinity;
    for (const r of [2000, 958, 301, 120, 61, 60, 30, 16, 15, 5, 0.5]) {
      const c = approachCap(r);
      expect(c).toBeLessThanOrEqual(prev);
      prev = c;
    }
    expect(approachCap(2000)).toBe(20);
    expect(approachCap(958)).toBe(20);
    expect(approachCap(100)).toBe(20);
    expect(approachCap(60)).toBe(10);
    expect(approachCap(30)).toBe(10);
    expect(approachCap(15)).toBe(1);
    expect(approachCap(10)).toBe(1);
    expect(approachCap(0.5)).toBe(1);
  });

  it("thrusters are at full force up to 2× and fall so that force × warp stays level", () => {
    for (const w of [1, 2]) expect(rcsThrottle(w)).toBe(1);
    for (const w of [5, 10, 20]) {
      expect(rcsThrottle(w)).toBeLessThan(1);
      expect(rcsThrottle(w) * w).toBeCloseTo(FULL_THRUST_WARP, 9);
    }
  });

  it("time only runs fast while you close in or the ship lines up; waiting costs no mission hours", () => {
    const still = { range: 958, closing: 0, lateral: 0.1 };
    expect(approachWarp("max", still, false)).toEqual({ warp: 1, active: false });
    expect(approachWarp("max", { ...still, closing: -0.3 }, false).warp).toBe(1);
    // closing in: the level, held down by the distance
    expect(approachWarp("max", { ...still, closing: 0.5 }, false).warp).toBe(20);
    expect(approachWarp(10, { ...still, closing: 0.5 }, false).warp).toBe(10);
    expect(approachWarp(5, { ...still, closing: 0.5 }, false).warp).toBe(5);
    expect(approachWarp(1, { ...still, closing: 0.5 }, false).warp).toBe(1);
    expect(approachWarp("max", { range: 40, closing: 0.3, lateral: 0.2 }, true).warp).toBe(10);
    expect(approachWarp(10, { range: 8, closing: 0.2, lateral: 0.2 }, true).warp).toBe(1);
    expect(approachWarp("max", { range: 8, closing: 0.2, lateral: 0.2 }, true).warp).toBe(1);
    // a big offset: the assist is lining the ship up, so time may run even while it sits still
    expect(approachWarp("max", { range: 900, closing: 0, lateral: 110 }, false).warp).toBe(20);
    expect(approachWarp(10, { range: 900, closing: 0, lateral: 110 }, false).warp).toBe(10);
    // lined up and still: real time
    expect(approachWarp("max", { range: 900, closing: 0, lateral: 1.5 }, false).warp).toBe(1);
  });

  it("starting needs 0.1 m/s and stopping needs it to fall under 0.05, so it does not flicker", () => {
    const d = (closing: number) => ({ range: 500, closing, lateral: 0.1 });
    expect(approachWarp("max", d(0.07), false).active).toBe(false);
    expect(approachWarp("max", d(0.07), true).active).toBe(true);
    expect(approachWarp("max", d(0.04), true).active).toBe(false);
    expect(approachWarp("max", d(0.11), false).active).toBe(true);
  });

  it("the lining-up command reaches the wanted speed without overshoot or chatter, at any warp", () => {
    const a = 0.085;
    for (const warp of [1, 5, 10, 20, 50]) {
      let v = 0;
      let flips = 0;
      let last = 0;
      for (let i = 0; i < 400; i++) {
        const c = assistAxis(0.2, v, a, warp, DT);
        if (c !== 0 && last !== 0 && Math.sign(c) !== Math.sign(last)) flips++;
        if (c !== 0) last = c;
        v += a * rcsThrottle(warp) * c * DT * warp;
        expect(v).toBeLessThan(0.2 + 0.006);
      }
      expect(v).toBeCloseTo(0.2, 2);
      expect(flips).toBe(0);
    }
    expect(assistAxis(0.2, 0.198, a, 1, DT)).toBe(0);
    expect(Math.abs(assistAxis(5, 0, a, 50, DT))).toBe(1);
  });

  it("the keyboard steps through 1×, 5×, 10×, Max and stops at the ends", () => {
    expect(DOCK_LEVELS).toEqual([1, 5, 10, "max"]);
    expect(DOCK_DEFAULT).toBe("max");
    expect(stepLevel(1, -1)).toBe(1);
    expect(stepLevel(1, 1)).toBe(5);
    expect(stepLevel(10, 1)).toBe("max");
    expect(stepLevel("max", 1)).toBe("max");
    expect(stepLevel("max", -1)).toBe(10);
  });
});

describe("docking in the live sim", () => {
  it("in the approach the sim itself refuses a warp the distance does not allow", () => {
    const sim = new FlightSim(launched("safe", 3));
    sim.fastForwardToApproach();
    expect(sim.maxWarp()).toBe(20);
    sim.setWarp(1000);
    expect(sim.warp).toBe(20);
    expect(sim.dockData().range).toBeGreaterThan(300);
  });

  it("and in the last 15 m the sim holds even a stuck 1000× request down to real time", () => {
    const sim = toHandOver(launched("safe", 1));
    let near = 0;
    let seen = 0;
    let active = false;
    for (let frames = 0; sim.mode === "approach" && frames < 400_000; frames++) {
      if (sim.cardPending) {
        sim.takeReport();
        sim.cardPending = false;
      }
      const d = sim.dockData();
      const w = approachWarp("max", d, active);
      active = w.active;
      // a bug in the caller: it asks for the moon on every frame
      sim.setWarp(d.range < 15 ? 1000 : w.warp);
      if (d.range < 15) {
        seen++;
        near = Math.max(near, sim.warp);
      }
      const target = d.range > 15 ? Math.min(limit(d.range) * 0.85, 2) : 0.2;
      const k = d.range < 60 ? 0.08 : 0.03;
      const a = RCS.newtons / sim.massKg;
      sim.rcs = [Math.abs(target - d.closing) > 0.03 ? Math.sign(target - d.closing) : 0, assistAxis(Math.max(-0.25, Math.min(0.25, -k * d.up)), d.vUp, a, sim.warp, DT), assistAxis(Math.max(-0.25, Math.min(0.25, -k * d.side)), d.vSide, a, sim.warp, DT)];
      sim.step(DT);
    }
    expect(seen).toBeGreaterThan(30);
    expect(near).toBe(1);
    expect(sim.mode).toBe("docked");
  });

  it("a tap moves the ship the same per real second at 20× as at 5×", () => {
    const closing = (warp: number) => {
      const sim = new FlightSim(launched("safe", 3));
      sim.fastForwardToApproach();
      // no event cards: they stop the clock, and this test is about thrust alone
      sim.cardTimes = [];
      sim.rcs = [1, 0, 0];
      for (let i = 0; i < 15; i++) {
        sim.setWarp(warp);
        sim.step(DT);
      }
      return sim.dockData().closing;
    };
    const slow = closing(5);
    const fast = closing(20);
    expect(slow).toBeGreaterThan(0.05);
    expect(fast / slow).toBeGreaterThan(0.97);
    expect(fast / slow).toBeLessThan(1.03);
    // and without the throttle 20× would be four times harder than 5×: that is what the rule is for
    expect(rcsThrottle(20)).toBeCloseTo(FULL_THRUST_WARP / 20, 9);
  });

  it("a ship that sits still runs in real time", () => {
    const sim = new FlightSim(launched("safe", 3));
    sim.fastForwardToApproach();
    const t0 = sim.t;
    let active = false;
    for (let i = 0; i < 90; i++) {
      const w = approachWarp("max", sim.dockData(), active);
      active = w.active;
      sim.setWarp(w.warp);
      sim.step(DT);
    }
    expect(sim.t - t0).toBeCloseTo(90 * DT, 3);
  });

  // real hand-overs, not the perfect one: seed 2 on the safe route arrives about 98 m off the ring's axis
  const starts: [RouteId, number][] = [["safe", 1], ["safe", 2], ["safe", 3], ["quick", 1], ["quick", 2]];

  it.each(starts)("%s seed %i: Max docks softly in under two minutes, a third of the old five", (route, seed) => {
    const sim = toHandOver(launched(route, seed));
    const r = dock(sim, "max", 0.25);
    expect(r.mode).toBe("docked");
    expect(r.kind).toBe("soft");
    expect(r.real).toBeLessThan(125);
    // the old automatic rule needed about 310 s for the same ship
    expect(r.real).toBeLessThan(310 / 2.5);
    expect(r.worst).toBeLessThanOrEqual(1);
    // no more thruster fuel than a careful hand-flown dock
    expect(r.rcs).toBeLessThan(15);
  });

  it.each(starts)("%s seed %i: a slow pilot (a full 1 s on each button) still docks softly at Max", (route, seed) => {
    const r = dock(toHandOver(launched(route, seed)), "max", 1.0, 0.8);
    expect(r.kind).toBe("soft");
    expect(r.real).toBeLessThan(145);
    expect(r.rcs).toBeLessThan(20);
  });

  it("each level is slower than the next and every one still docks softly", () => {
    const times: Record<string, number> = {};
    for (const level of [5, 10, "max"] as DockLevel[]) {
      const r = dock(toHandOver(launched("safe", 1)), level, 0.25);
      expect(r.kind).toBe("soft");
      expect(r.worst).toBeLessThanOrEqual(1);
      times[String(level)] = r.real;
    }
    expect(times["5"]).toBeGreaterThan(times["10"]);
    expect(times["10"]).toBeGreaterThan(times.max);
    // 10× is about two minutes, 5× about three and a half and Max a little under two
    expect(times["10"]).toBeLessThan(160);
    expect(times["5"]).toBeLessThan(280);
  });

  it("1× is real time and stays the slow, careful way: a quarter of an hour of mission", () => {
    const sim = toHandOver(launched("safe", 3));
    const t0 = sim.t;
    const r = dock(sim, 1, 0.25);
    expect(r.kind).toBe("soft");
    expect(r.worst).toBeLessThanOrEqual(1);
    expect(sim.t - t0).toBeGreaterThan(600);
    expect(r.real).toBeCloseTo(sim.t - t0, -1);
  });

  it("the speed does not change how much mission time a dock costs, only how long you wait", () => {
    const missionSeconds = (level: DockLevel) => {
      const sim = toHandOver(launched("safe", 3));
      const t0 = sim.t;
      dock(sim, level, 0.25);
      return sim.t - t0;
    };
    const slow = missionSeconds(1);
    const fast = missionSeconds("max");
    expect(Math.abs(slow - fast) / slow).toBeLessThan(0.1);
  });
});
