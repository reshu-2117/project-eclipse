/** The hangar's live panel and readiness review (handbook pp.5–8). */
import { describe, expect, it } from "vitest";
import { ROUTES, defaultLoadout, loadoutStats, routeFit, routeTotals, type Loadout } from "../index";

const tender = defaultLoadout();

describe("standard Tender (the handbook's sanity check)", () => {
  const st = loadoutStats(tender);
  it("is about 6,060 kg dry with ≈1,700 m/s", () => {
    expect(st.dryKg).toBeCloseTo(6073, 0);
    expect(st.dv).toBeGreaterThan(1690);
    expect(st.dv).toBeLessThan(1730);
  });
  it("fits the bay and the budget, and can launch", () => {
    expect(st.bayUsedKg).toBeLessThanOrEqual(2500);
    expect(st.credits).toBeLessThanOrEqual(100);
    expect(st.canLaunch).toBe(true);
  });
});

describe("readiness review red flags", () => {
  const with_ = (p: Partial<Loadout>) => loadoutStats({ ...tender, ...p });
  it("over budget blocks launch", () => {
    const st = with_({ hull: "hauler", sensors: ["radar", "lidar", "thermal"], kit: ["eva", "arm", "optics", "drones"], comms: "laser", power: "reactor" });
    expect(st.credits).toBeGreaterThan(100);
    expect(st.canLaunch).toBe(false);
    expect(st.flags.find((f) => f.id === "budget")?.level).toBe("block");
  });
  it("the Courier can't carry a heavy shield and suits together", () => {
    const st = with_({ hull: "courier", fuelKg: 3400, sensors: ["lidar"], shield: "heavy", kit: ["eva"] });
    expect(st.flags.some((f) => f.id === "bay" && f.level === "block")).toBe(true);
  });
  it("a battery pack can't cover 30 h of normal use", () => {
    expect(with_({ power: "battery" }).flags.some((f) => f.id === "energy")).toBe(true);
  });
  it("no lidar or radar is flagged but still allowed", () => {
    const st = with_({ sensors: ["camera", "thermal"] });
    expect(st.flags.some((f) => f.id === "speed" && f.level === "warn")).toBe(true);
    expect(st.canLaunch).toBe(true);
  });
  it("a heavier shield automatically costs Δv", () => {
    expect(with_({ shield: "heavy" }).dv).toBeLessThan(with_({ shield: "light" }).dv);
  });
  it("the RTG cancels heater power", () => {
    expect(with_({ addons: ["rtg"] }).loadKw).toBeLessThan(with_({}).loadKw);
  });
});

describe("routes (handbook p.11, with the fast-route fix)", () => {
  it("keeps the handbook's safe and quick totals", () => {
    expect(routeTotals("safe").totalDv).toBe(839);
    expect(routeTotals("quick").totalDv).toBe(948);
    expect(routeTotals("safe").withMarginDv).toBeCloseTo(923, 0);
    expect(routeTotals("safe").arriveH).toBeCloseTo(12.6, 1);
    expect(routeTotals("quick").arriveH).toBeCloseTo(5.6, 1);
  });
  it("every way out buys time with fuel: no plan is both cheaper and faster than another", () => {
    const ids = ["safe", "quick", "fastOut", "skipWindow"] as const;
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        const A = routeTotals(a);
        const B = routeTotals(b);
        expect(A.outDv <= B.outDv && A.arriveH <= B.arriveH).toBe(false);
      }
  });
  it("only a stripped Tender or a cryo Tender fits the fast route; a Hauler fits only the slow ones", () => {
    const fit = (l: Loadout) => Object.fromEntries(routeFit(l).map((r) => [r.id, r.fits]));
    expect(fit(tender).fastOut).toBe(true);
    expect(fit({ ...tender, engine: "cryo" }).skipWindow).toBe(true);
    const hauler = fit({ ...tender, hull: "hauler", fuelKg: 5500, shield: "heavy", kit: ["eva", "arm", "optics"] });
    expect(hauler.safe).toBe(true);
    expect(hauler.fastOut).toBe(false);
    expect(Object.keys(ROUTES)).toHaveLength(5);
  });
});
