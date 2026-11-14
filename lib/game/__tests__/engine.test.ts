/** The rules: phases, rejections, clocks, clues, the test, the network, and determinism. */
import { describe, expect, it } from "vitest";
import {
  CLOCKS,
  ENDING_ORDER,
  STRATEGIES,
  createGame,
  debrief,
  dvLeft,
  evidence,
  isEclipse,
  options,
  replay,
  runPolicy,
  step,
  type Action,
  type GameState,
} from "../index";

function play(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = step(s, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}

/** Launch a loadout and fly to the station, taking the cheapest choice on every card. */
function toStation(seed: number, setup: Action[], route: Action = { type: "route", id: "quick" }): GameState {
  let s = play(createGame(seed), { type: "begin" }, ...setup, { type: "launch" }, route);
  while (s.phase === "journey") {
    const opt = options(s).filter((o) => o.ok);
    const prefs = ["ignore", "tank", "nudge", "emergency", "heat", "through", "pass", "limp", "shut"];
    const pick = prefs.map((p) => opt.find((o) => o.action.type === "card" && o.action.choice === p)).find(Boolean);
    s = play(s, (pick ?? opt[0]).action);
  }
  return s;
}

describe("the one rule: a rejected click changes nothing and says why", () => {
  it("scanning in the hangar is rejected with a reason", () => {
    const s = play(createGame(1), { type: "begin" });
    const r = step(s, { type: "survey" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.length).toBeGreaterThan(10);
      expect(r.state).toBe(s);
    }
  });
  it("step never mutates the state it is given", () => {
    const s = play(createGame(1), { type: "begin" });
    const copy = structuredClone(s);
    step(s, { type: "hull", id: "hauler" });
    expect(s).toEqual(copy);
  });
  it("the ion engine is shown but locked, and explains itself", () => {
    const r = step(play(createGame(1), { type: "begin" }), { type: "engine", id: "ion" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/4 months/);
  });
  it("the Courier has one sensor slot", () => {
    const s = play(createGame(1), { type: "begin" }, { type: "hull", id: "courier" });
    expect(s.loadout.sensors).toHaveLength(1);
    const r = step(s, { type: "sensor", id: "radar" });
    expect(r.ok).toBe(false);
  });
  it("an over-budget ship can't launch", () => {
    const s = play(
      createGame(1),
      { type: "begin" },
      { type: "hull", id: "hauler" },
      { type: "power", id: "reactor" },
      { type: "comms", id: "laser" },
      { type: "sensor", id: "radar" },
      { type: "kit", id: "arm" },
      { type: "kit", id: "optics" },
    );
    const r = step(s, { type: "launch" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Budget/);
  });
});

describe("determinism", () => {
  it("the same seed and the same actions replay to the same mission", () => {
    const st = STRATEGIES[0];
    const a = runPolicy(7, st.policy);
    const b = replay(7, a.actions);
    expect(b.rejected).toHaveLength(0);
    expect(b.state).toEqual(a.state);
  });
  it("different seeds draw different event decks, and E4 is always in", () => {
    const decks = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = play(createGame(seed), { type: "begin" }, { type: "launch" }, { type: "route", id: "safe" });
      expect(s.deck).toContain("E4");
      expect(s.deck).toHaveLength(3);
      decks.add(s.deck.join());
    }
    expect(decks.size).toBeGreaterThan(5);
  });
});

describe("journey", () => {
  it("the flight is flown in legs: time passes between event cards and the dock comes last", () => {
    const quick = play(createGame(1), { type: "begin" }, { type: "launch" }, { type: "route", id: "quick" });
    const total = 5.6 + 0; // the quick route's arrival, hours
    expect(quick.phase).toBe("journey");
    expect(quick.t).toBeCloseTo(total / 4, 1);
    let s = quick;
    const times = [s.t];
    while (s.phase === "journey") {
      const opt = options(s).find((o) => o.ok && o.action.type === "card" && ["ignore", "tank", "nudge", "emergency", "heat", "through", "pass", "limp", "shut"].includes(o.action.choice))!;
      s = play(s, opt.action);
      times.push(s.t);
    }
    expect(s.phase).toBe("station");
    expect(s.flightLeftH).toBe(0);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    expect(s.arrivedT).toBeGreaterThanOrEqual(total - 0.1);
  });
  it("a route the ship can't afford is allowed, and you drift past the station", () => {
    const s = play(createGame(1), { type: "begin" }, { type: "hull", id: "hauler" }, { type: "shield", id: "heavy" }, { type: "launch" }, { type: "route", id: "skipWindow" });
    expect(s.adrift).toBe(true);
    expect(s.phase).toBe("debrief");
    expect(s.outcome?.crewHome).toBe(false);
  });
  it("heavier ships burn more fuel for the same dodge", () => {
    const burnFor = (shield: "light" | "heavy") => {
      for (let seed = 1; seed < 200; seed++) {
        const s = play(createGame(seed), { type: "begin" }, { type: "shield", id: shield }, { type: "launch" }, { type: "route", id: "safe" });
        if (s.deck[0] === "E1") {
          const before = s.fuelKg;
          return before - play(s, { type: "card", choice: "dodge" }).fuelKg;
        }
      }
      throw new Error("no E1 found");
    };
    expect(burnFor("heavy")).toBeGreaterThan(burnFor("light"));
  });
});

describe("station", () => {
  it("the leak shuts the reactor down at hour 20 unless it's patched", () => {
    let s = toStation(1, []);
    s = play(s, { type: "survey" });
    while (s.t < CLOCKS.reactorH) s = play(s, { type: "toChoice" }, { type: "choose", option: "D" }, { type: "stay", hours: 30 });
    expect(s.reactorShutdownT).toBeCloseTo(20, 1);
    expect(s.outcome?.stationLostBy).toBe("reactor");
  });
  it("C2 is only visible to the thermal camera, and C4 needs lidar or radar to confirm", () => {
    let s = toStation(2, [{ type: "sensor", id: "lidar" }]);
    s = play(s, { type: "survey" }, { type: "inspect", zone: "petals", method: "scan" }, { type: "inspect", zone: "mast", method: "download" });
    expect(s.found).toContain("C1");
    expect(s.found).not.toContain("C2");
    expect(s.found).toContain("C3");
    expect(s.found).not.toContain("C4");
  });
  it("radar reveals the true impact time at the survey", () => {
    let s = toStation(3, [{ type: "sensor", id: "lidar" }, { type: "sensor", id: "radar" }]);
    expect(s.iceRevealed).toBe(false);
    s = play(s, { type: "survey" });
    expect(s.iceRevealed).toBe(true);
    expect(s.iceRevealedBy).toBe("radar");
  });
  it("the test stays locked until 2 clues are pinned and H1 or H2 is ruled out", () => {
    let s = toStation(4, [{ type: "hull", id: "hauler" }, { type: "sensor", id: "lidar" }, { type: "sensor", id: "thermal" }, { type: "sensor", id: "radar" }]);
    s = play(s, { type: "survey" });
    expect(step(s, { type: "test" }).ok).toBe(false);
    s = play(s, { type: "inspect", zone: "petals", method: "scan" });
    expect(step(s, { type: "test" }).ok).toBe(false);
    expect(step(s, { type: "crossOut", hyp: "H3" }).ok).toBe(false);
    s = play(s, { type: "crossOut", hyp: "H2" }, { type: "test" });
    expect(s.test?.bandPct).toBe(3);
    expect(s.found).toContain("C6");
    expect(s.crossed).toContain("H1");
    expect(evidence(s)).toBe(60);
  });
  it("the test dims Lantern 17 for an hour, which costs the cities", () => {
    let s = toStation(4, [{ type: "hull", id: "hauler" }, { type: "sensor", id: "lidar" }, { type: "sensor", id: "thermal" }, { type: "sensor", id: "radar" }]);
    s = play(s, { type: "survey" }, { type: "inspect", zone: "petals", method: "scan" }, { type: "crossOut", hyp: "H2" });
    const before = s.settlements.lowlight;
    const tested = play(s, { type: "test" });
    expect(before - tested.settlements.lowlight).toBeGreaterThan(1);
  });
  it("there is no drain during the Eclipse", () => {
    expect(isEclipse(9)).toBe(true);
    expect(isEclipse(15)).toBe(false);
  });
  it("you must leave half an hour before impact", () => {
    let s = toStation(5, []);
    s = play(s, { type: "survey" }, { type: "toChoice" }, { type: "choose", option: "D" }, { type: "broadcast", packet: "summary" });
    s = play(s, { type: "stay", hours: 100 });
    expect(s.departT).toBeCloseTo(CLOCKS.iceTrueH - CLOCKS.evacuateBeforeImpactH, 1);
    expect(s.phase).toBe("debrief");
  });
});

describe("endings", () => {
  it.each(ENDING_ORDER)("%s can be reached", (ending) => {
    const hits = STRATEGIES.filter((st) => st.aims === ending).some((st) => {
      for (let seed = 1; seed <= 12; seed++) if (runPolicy(seed, st.policy).state.outcome?.ending === ending) return true;
      return false;
    });
    expect(hits).toBe(true);
  });
  it("every strategy finishes a mission without a rejected click", () => {
    for (const st of STRATEGIES) {
      const r = runPolicy(11, st.policy);
      expect(r.state.phase).toBe("debrief");
      expect(r.rejected).toEqual([]);
    }
  });
  it("the best run saves the station, gets home, and the debrief explains itself", () => {
    const r = runPolicy(1, STRATEGIES.find((s) => s.id === "scientist-helper")!.policy);
    const o = r.state.outcome!;
    expect(o.ending).toBe("somethingInTheDark");
    expect(o.stationSurvived).toBe(true);
    expect(o.crewHome).toBe(true);
    expect(o.iceShiftKm).toBeGreaterThan(1.5);
    const d = debrief(r.state);
    expect(d.realLife.length).toBeGreaterThan(3);
    expect(d.ledger.length).toBeGreaterThan(10);
    expect(dvLeft(r.state)).toBeGreaterThan(0);
  });
  it("the impact hour is written to the ledger exactly once, in its place in time", () => {
    for (const st of STRATEGIES) {
      const r = runPolicy(3, st.policy);
      const hits = r.state.log.filter((e) => e.title === "Impact hour");
      expect(hits).toHaveLength(1);
      expect(hits[0].t).toBeCloseTo(CLOCKS.iceTrueH, 1);
    }
  });
  it("arriving by the safe route is too late to save the station, even when believed", () => {
    const r = runPolicy(1, STRATEGIES.find((s) => s.id === "safe-scientist")!.policy);
    expect(r.state.outcome?.believed).toBe(true);
    expect(r.state.outcome?.stationSurvived).toBe(false);
    expect(debrief(r.state).better.join(" ")).toMatch(/network turned outward/);
  });
});
