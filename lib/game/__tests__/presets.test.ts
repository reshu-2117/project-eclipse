import { describe, expect, it } from "vitest";
import { PRESETS, actionsToReach, createGame, loadoutStats, replay, routeFit, sameShip, step } from "../index";

function inHangar() {
  const r = step(createGame(1), { type: "begin" });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
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
  it("the three presets are genuinely different trade-offs", () => {
    const stats = Object.fromEntries(PRESETS.map((p) => [p.id, loadoutStats(p.loadout)]));
    const fits = Object.fromEntries(PRESETS.map((p) => [p.id, routeFit(p.loadout).filter((r) => r.fits).length]));
    // the cryo ship reaches more routes; the investigator sees the ice more precisely
    expect(fits.rush).toBeGreaterThan(fits.balanced);
    expect(stats.investigator.bestBandPct).toBeLessThan(stats.balanced.bestBandPct ?? 100);
  });
});
