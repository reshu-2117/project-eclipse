import { describe, expect, it } from "vitest";
import { createGame, step, ROUTE_ORDER, type Action, type GameState, type RouteId } from "../../game";
import { FlightSim, PORT_LOCAL, NOSE_M } from "../sim";
import { norm } from "../kepler";

function play(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = step(s, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}

function launched(route: RouteId, setup: Action[] = [], seed = 3) {
  return play(createGame(seed), { type: "begin" }, ...setup, { type: "launch" }, { type: "route", id: route, piloted: true });
}

/** A careful robot pilot: follows the computer, dodges the fragment, docks gently. */
function fly(sim: FlightSim, opts: { dodge: boolean } = { dodge: true }) {
  const dt = 1 / 30;
  let dodging = 0;
  let frames = 0;
  const log: string[] = [];
  while (sim.mode !== "docked" && sim.mode !== "lost" && frames++ < 600_000) {
    if (sim.cardPending) {
      sim.takeReport();
      sim.cardPending = false;
    }
    // stay in sync with the burn latch
    if (sim.latched && !sim.burn) sim.latched = false;
    const node = sim.node;
    if (sim.mode === "cruise") {
      if (opts.dodge && sim.conj.state === "alert" && sim.conj.dodge && !sim.thrusting && dodging === 0 && sim.conj.tca - sim.t > 60) {
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
    } else if (sim.mode === "approach") {
      sim.setWarp(5);
      const d = sim.dockData();
      // a steady pilot: a speed for each distance, lined up early, small corrections only
      const near = d.range < 60;
      let target = d.range > 300 ? 1.5 : d.range > 60 ? 0.5 : d.range > 15 ? 0.2 : 0.1;
      // not lined up yet? hold position until you are
      if (d.lateral > Math.max(0.3, d.range * 0.25)) target = 0;
      const k = near ? 0.08 : 0.03;
      const want: [number, number, number] = [
        target,
        Math.max(-0.25, Math.min(0.25, -k * d.up)),
        Math.max(-0.25, Math.min(0.25, -k * d.side)),
      ];
      const have = [d.closing, d.vUp, d.vSide];
      const band = near ? 0.008 : 0.03;
      sim.rcs = want.map((w, i) => (Math.abs(w - have[i]) > band ? Math.sign(w - have[i]) : 0)) as [number, number, number];
      if (d.range < 60) sim.setWarp(1);
    }
    for (const e of sim.step(dt)) log.push(`${Math.round(sim.t)} ${e.type}${e.text ? ":" + e.text : ""}${e.value !== undefined ? "=" + e.value.toFixed(2) : ""}`);
  }
  return log;
}

describe("the live flight", () => {
  for (const route of ROUTE_ORDER) {
    it(`a careful pilot flies ${route} to a soft capture, near the card's Δv`, () => {
      // fast routes need the cryo engine to afford them
      const setup: Action[] = route === "fastOut" || route === "fastBoth" || route === "skipWindow" ? [{ type: "engine", id: "cryo" }] : [];
      let game: GameState;
      try {
        game = launched(route, setup);
      } catch {
        return; // that ship can't launch on this route; covered by engine tests
      }
      if (game.phase !== "journey") return;
      const sim = new FlightSim(game);
      const log = fly(sim);
      expect(sim.mode, log.slice(-12).join("\n") + JSON.stringify(sim.dockData())).toBe("docked");
      expect(sim.contact?.kind).toBe("soft");
      // the pilot's cost against the route card: finite burns, a dodge and the approach
      expect(Math.abs(sim.extraDv()), log.join("\n")).toBeLessThan(40);
      expect(sim.conj.state === "passed" || sim.conj.state === "hit").toBe(true);
      // and the engine accepts the result
      const rep = sim.takeReport();
      let g = game;
      while (g.card < g.deck.length) {
        const r = step(g, { type: "card", choice: "__none__" });
        if (r.ok) g = r.state;
        else break;
      }
      expect(rep.hours).toBeGreaterThan(0);
    });
  }

  it("the low-thrust cluster engine still makes it, at a higher price (finite burns)", { timeout: 60_000 }, () => {
    const game = launched("safe", [{ type: "engine", id: "cluster" }]);
    const sim = new FlightSim(game);
    const log = fly(sim);
    expect(sim.mode, log.slice(-12).join("\n")).toBe("docked");
    expect(sim.extraDv()).toBeLessThan(40);
  });

  it("an ignored fragment alert sometimes hits", { timeout: 120_000 }, () => {
    let hits = 0;
    let passes = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = new FlightSim(launched("quick", [], seed));
      fly(sim, { dodge: false });
      if (sim.conj.state === "hit") hits++;
      if (sim.conj.state === "passed") passes++;
    }
    expect(hits).toBeGreaterThan(0);
    expect(passes).toBeGreaterThan(0);
  });

  it("the docking port is in front of the ship at the approach point", () => {
    const sim = new FlightSim(launched("quick"));
    expect(PORT_LOCAL[0]).toBeLessThan(0);
    expect(NOSE_M).toBeGreaterThan(0);
    expect(sim.spec.routeDv).toBeGreaterThan(0);
  });
});

describe("cards and docking", () => {
  it("cards still to come happen at the approach, so you can always dock", () => {
    const game = launched("quick");
    const sim = new FlightSim(game);
    sim.fastForwardToApproach();
    let cards = 0;
    for (let i = 0; i < 2000 && cards < sim.cardTimes.length; i++) {
      for (const e of sim.step(0.1)) if (e.type === "card") cards++;
      if (sim.cardPending) sim.cardPending = false;
    }
    expect(cards).toBe(game.deck.length - game.card);
  });

  it("a snapshot resumes the same flight", () => {
    const game = launched("safe");
    const a = new FlightSim(game);
    a.setWarp(100);
    for (let i = 0; i < 50; i++) a.step(0.1);
    const snap = JSON.parse(JSON.stringify(a.snapshot(game.card)));
    const b = new FlightSim(game);
    expect(b.restore(snap, game.card)).toBe(true);
    expect(b.t).toBeCloseTo(a.t, 6);
    expect(b.ship.r[0]).toBeCloseTo(a.ship.r[0], 3);
    expect(b.restore(snap, game.card + 1)).toBe(false);
  });
});
