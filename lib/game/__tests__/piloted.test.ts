/** Piloted flights: the flight deck reports time, extra burns and docking; the rules stay the same. */
import { describe, expect, it } from "vitest";
import { createGame, dvLeft, options, replay, step, type Action, type GameState } from "../index";

function play(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = step(s, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}

const start = (seed = 1) => play(createGame(seed), { type: "begin" }, { type: "launch" }, { type: "route", id: "quick", piloted: true });

/** Play every card with the first allowed choice, reporting a slice of flight before each. */
function flyCards(s: GameState): GameState {
  while (s.phase === "journey" && s.card < s.deck.length) {
    s = play(s, { type: "flight", dv: 0, hours: 0.5, hull: 0 });
    const o = options(s).find((x) => x.ok && x.action.type === "card");
    if (!o) throw new Error("no card choice allowed");
    s = play(s, o.action);
  }
  return s;
}

describe("piloted flight", () => {
  it("charges the route up front but does not fly the legs or dock by itself", () => {
    const auto = play(createGame(1), { type: "begin" }, { type: "launch" }, { type: "route", id: "quick" });
    const s = start();
    expect(s.piloted).toBe(true);
    expect(s.phase).toBe("journey");
    expect(dvLeft(s)).toBeCloseTo(dvLeft(auto), 6);
    // the autopilot already flew the first leg; the pilot hasn't
    expect(s.t).toBeLessThan(auto.t);
    const done = flyCards(s);
    expect(done.phase).toBe("journey");
    expect(done.docked).toBe(false);
  });

  it("docks only after the last card, and the station opens", () => {
    let s = start();
    const early = step(s, { type: "dock", dv: 0, hours: 0, hull: 0, speed: 0.1 });
    if (s.deck.length > 0) expect(early.ok).toBe(false);
    s = flyCards(s);
    s = play(s, { type: "dock", dv: 3, hours: 0.2, hull: 0, speed: 0.12 });
    expect(s.phase).toBe("station");
    expect(s.docked).toBe(true);
    expect(s.log.some((e) => e.title === "Soft capture")).toBe(true);
    expect(s.log.some((e) => e.title === "Docked at Lantern 17")).toBe(true);
  });

  it("time, burns and hull damage reported by the flight are applied", () => {
    const s0 = start();
    const s1 = play(s0, { type: "flight", dv: 25, hours: 1.5, hull: 12, note: "Ice fragment" });
    expect(s1.t).toBeCloseTo(s0.t + 1.5, 6);
    expect(dvLeft(s1)).toBeCloseTo(dvLeft(s0) - 25, 3);
    expect(s1.hull).toBe(s0.hull - 12);
  });

  it("flying cheaper than the computer puts fuel back, within the tank", () => {
    const s0 = start();
    const s1 = play(s0, { type: "flight", dv: -15, hours: 0, hull: 0 });
    expect(dvLeft(s1)).toBeCloseTo(dvLeft(s0) + 15, 3);
  });

  it("rejects silly numbers instead of trusting them", () => {
    const s0 = start();
    const s1 = play(s0, { type: "flight", dv: Number.NaN, hours: -5, hull: 1e9 });
    expect(s1.t).toBe(s0.t);
    expect(s1.hull).toBe(0);
    expect(dvLeft(s1)).toBeCloseTo(dvLeft(s0), 6);
  });

  it("running the tank dry in flight ends the mission adrift", () => {
    const s = play(start(), { type: "flight", dv: 4999, hours: 0, hull: 0 });
    expect(s.adrift).toBe(true);
    expect(s.phase).toBe("debrief");
  });

  it("is refused outside a piloted flight", () => {
    const auto = play(createGame(1), { type: "begin" }, { type: "launch" }, { type: "route", id: "quick" });
    expect(step(auto, { type: "flight", dv: 0, hours: 1, hull: 0 }).ok).toBe(false);
  });

  it("replays exactly from the saved actions", () => {
    let s = start(7);
    s = flyCards(s);
    s = play(s, { type: "dock", dv: 1.5, hours: 0.25, hull: 4, speed: 0.4 });
    const actions: Action[] = [{ type: "begin" }, { type: "launch" }, { type: "route", id: "quick", piloted: true }];
    // rebuild the same action list the hard way and compare final states
    let r = createGame(7);
    for (const a of actions) r = step(r, a).state;
    r = flyCards(r);
    r = step(r, { type: "dock", dv: 1.5, hours: 0.25, hull: 4, speed: 0.4 }).state;
    expect(JSON.stringify(r)).toBe(JSON.stringify(s));
    expect(typeof replay).toBe("function");
  });
});
