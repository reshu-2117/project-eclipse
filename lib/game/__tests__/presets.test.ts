import { describe, expect, it } from "vitest";
import {
  PRESETS,
  STRATEGIES,
  actionsToReach,
  createGame,
  loadoutStats,
  options,
  presetFacts,
  replay,
  routeFit,
  runPolicy,
  sameShip,
  step,
  type Action,
  type GameState,
  type Loadout,
  type Policy,
} from "../index";

function inHangar() {
  const r = step(createGame(1), { type: "begin" });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function play(s: GameState, ...actions: Action[]): GameState {
  for (const a of actions) {
    const r = step(s, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} rejected: ${r.reason}`);
    s = r.state;
  }
  return s;
}

/** Fly a loadout to the big decision on the safe route, taking the first choice the engine allows on every card. */
function atTheBigChoice(l: Loadout): GameState {
  let s = inHangar();
  s = play(s, ...actionsToReach(s, l), { type: "launch" }, { type: "route", id: "safe" });
  for (let i = 0; i < 8 && s.phase === "journey"; i++) {
    const pick = options(s).find((o) => o.ok);
    if (!pick) break;
    s = play(s, pick.action);
  }
  return play(s, { type: "survey" }, { type: "toChoice" });
}

/** A scripted crew flying a given ship: the hangar and route are ours, every later move is the strategy's. */
function crewIn(l: Loadout, route: "quick" | "safe", base: Policy): Policy {
  return (s) => {
    if (s.phase === "briefing") return { type: "begin" };
    if (s.phase === "hangar") {
      const todo = actionsToReach(s, l);
      return todo.length ? todo[0] : { type: "launch" };
    }
    if (s.phase === "route") return { type: "route", id: route };
    return base(s);
  };
}

describe("starter ships", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s builds through the engine and can launch", (_id, p) => {
    const s0 = inHangar();
    const actions = actionsToReach(s0, p.loadout);
    const { state, rejected } = replay(1, [{ type: "begin" }, ...actions]);
    expect(rejected).toEqual([]);
    expect(sameShip(state.loadout, p.loadout)).toBe(true);
    const st = loadoutStats(state.loadout);
    expect(st.canLaunch).toBe(true);
    expect(st.credits).toBeLessThanOrEqual(100);
  });
  it("you can switch from any preset to any other", () => {
    for (const a of PRESETS)
      for (const b of PRESETS) {
        const { state } = replay(1, [{ type: "begin" }, ...actionsToReach(inHangar(), a.loadout)]);
        const back = actionsToReach(state, b.loadout);
        const out = replay(1, [{ type: "begin" }, ...actionsToReach(inHangar(), a.loadout), ...back]);
        expect(out.rejected).toEqual([]);
        expect(sameShip(out.state.loadout, b.loadout)).toBe(true);
      }
  });
  it("the starter ships are genuinely different trade-offs", () => {
    const stats = Object.fromEntries(PRESETS.map((p) => [p.id, loadoutStats(p.loadout)]));
    const fits = Object.fromEntries(PRESETS.map((p) => [p.id, routeFit(p.loadout).filter((r) => r.fits).length]));
    // the cryo ship reaches more routes; the investigator sees the ice more precisely
    expect(fits.rush).toBeGreaterThan(fits.balanced);
    expect(stats.investigator.bestBandPct).toBeLessThan(stats.balanced.bestBandPct ?? 100);
  });

  it("there are five packages, each its own ship, and one is the best first pick", () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(5);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(5);
    for (const a of PRESETS) for (const b of PRESETS) if (a !== b) expect(sameShip(a.loadout, b.loadout)).toBe(false);
    const best = PRESETS.filter((p) => p.recommended);
    expect(best).toHaveLength(1);
    // the review shortcut and the first card both depend on this one
    expect(best[0].id).toBe("investigator");
    expect(PRESETS[0].id).toBe("investigator");
    for (const p of PRESETS) {
      expect(p.pickIf.length).toBeGreaterThan(10);
      expect(p.blurb.length).toBeGreaterThan(30);
    }
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))("%s is safe for a beginner: no red flags and everything needed to be believed", (_id, p) => {
    const l = p.loadout;
    const st = loadoutStats(l);
    // nothing in the readiness review, not even a warning
    expect(st.flags).toEqual([]);
    expect(st.credits).toBeLessThanOrEqual(100);
    // a thermal camera finds the burn scar (15 proof points); lidar or radar confirms the path and runs the test
    expect(l.sensors).toContain("thermal");
    expect(l.sensors.some((x) => x === "lidar" || x === "radar")).toBe(true);
    expect(st.bestBandPct).not.toBeNull();
    expect(st.bestBandPct!).toBeLessThanOrEqual(15);
    // and a way to go outside, to patch the reactor leak that ends the mission at hour 20
    expect(l.kit).toContain("eva");
    // the safe route, with the margin
    expect(routeFit(l).find((r) => r.id === "safe")!.fitsWithMargin).toBe(true);
    expect(presetFacts(l)).toMatchObject({ seesHeat: true, cleanLaunch: true });
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))("%s: what its card says about repairing the mirror is what the engine allows", (_id, p) => {
    const s = atTheBigChoice(p.loadout);
    expect(s.phase).toBe("choice");
    const can = (option: "A" | "C") => options(s).some((o) => o.ok && o.action.type === "choose" && o.action.option === option);
    // "Repair the mirror" and "Fix half" both need spare mirror segments, and only the spare optics carry them
    expect(can("A")).toBe(presetFacts(p.loadout).canRepairMirror);
    expect(can("C")).toBe(presetFacts(p.loadout).canRepairMirror);
    expect(presetFacts(p.loadout).canRepairMirror).toBe(p.loadout.kit.includes("optics"));
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))("%s: a careful crew that skips the distress call still wins with it, on either route", (_id, p) => {
    const crew = STRATEGIES.find((st) => st.id === "scientist")!;
    for (const route of ["quick", "safe"] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const r = runPolicy(seed, crewIn(p.loadout, route, crew.policy));
        expect(r.rejected, `${p.id} ${route} ${seed}`).toEqual([]);
        expect(["firstLight", "somethingInTheDark"], `${p.id} ${route} ${seed}`).toContain(r.state.outcome?.ending);
      }
  });

  it("and that is the reason every package has a thermal camera: on a camera-only ship the same crew is dismissed", () => {
    // proof then tops out at 75 without the distress crew's clue, and the network wants 80
    const cameraOnly: Loadout = { ...PRESETS.find((p) => p.id === "balanced")!.loadout, sensors: ["camera", "lidar"] };
    const crew = STRATEGIES.find((st) => st.id === "scientist")!;
    for (let seed = 1; seed <= 4; seed++) {
      const r = runPolicy(seed, crewIn(cameraOnly, "safe", crew.policy));
      expect(r.state.outcome?.ending).toBe("dismissed");
    }
  });

  it("the card facts come straight from the loadout", () => {
    const inv = presetFacts(PRESETS.find((p) => p.id === "investigator")!.loadout);
    expect(inv).toEqual({ seesHeat: true, testBandPct: 3, canRepairMirror: true, routesInReach: 2, cleanLaunch: true });
    const rush = presetFacts(PRESETS.find((p) => p.id === "rush")!.loadout);
    expect(rush.routesInReach).toBeGreaterThan(inv.routesInReach);
    expect(rush.canRepairMirror).toBe(false);
  });
});
