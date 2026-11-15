import { describe, expect, it } from "vitest";
import { MU, add, circularState, elements, lambert, norm, propagate, sub } from "../kepler";
import { DOCK_ALLOWANCE, R_L17, R_WICK, approachAt, buildScenario, fastIntercept, hohmannLegs, nodeDv, phasing, replan } from "../plan";
import { ORBIT, ROUTE_ORDER, routeTotals } from "../../game";

describe("kepler", () => {
  it("returns to the start after one period", () => {
    const s = { r: [R_WICK, 0, 0] as [number, number, number], v: [0, 8100, 300] as [number, number, number] };
    const T = elements(s).period;
    const back = propagate(s, T);
    expect(norm(sub(back.r, s.r))).toBeLessThan(1e-3);
    expect(norm(sub(back.v, s.v))).toBeLessThan(1e-6);
  });

  it("runs backwards as well as forwards", () => {
    const s = circularState(R_L17, 0.3, 0.2);
    const there = propagate(s, 4321);
    const back = propagate(there, -4321);
    expect(norm(sub(back.r, s.r))).toBeLessThan(1e-3);
  });

  it("handles escape orbits", () => {
    const s = { r: [R_WICK, 0, 0] as [number, number, number], v: [0, 12000, 0] as [number, number, number] };
    const e = elements(s);
    expect(e.e).toBeGreaterThan(1);
    const later = propagate(s, 3600);
    // energy is conserved
    const en = (x: typeof s) => (norm(x.v) ** 2) / 2 - MU / norm(x.r);
    expect(Math.abs(en(later) - en(s)) / Math.abs(en(s))).toBeLessThan(1e-9);
  });

  it("solves Lambert's problem consistently with propagation", () => {
    const a = circularState(R_WICK, 0);
    const b = circularState(R_L17, 2.0);
    const sol = lambert(a.r, b.r, 1800, [0, 0, 1])!;
    expect(sol).not.toBeNull();
    const end = propagate({ r: a.r, v: sol.v1 }, 1800);
    expect(norm(sub(end.r, b.r))).toBeLessThan(1);
  });
});

describe("the flight computer reproduces the handbook", () => {
  it("Hohmann 300 → 1,000 km is 376 m/s in 49 minutes", () => {
    const h = hohmannLegs(R_WICK, R_L17);
    expect(Math.round(h.dv1 + h.dv2)).toBe(376);
    expect(Math.round(h.tof / 60)).toBe(49);
  });

  it("catch-up 10°: about 27 m/s over 5 orbits, about 136 in one", () => {
    const slow = phasing(R_L17, (10 * Math.PI) / 180, 5);
    const quick = phasing(R_L17, (10 * Math.PI) / 180, 1);
    expect(Math.abs(2 * slow.dv - ORBIT.catchUpSlow.dv)).toBeLessThan(1);
    expect(Math.abs(2 * quick.dv - ORBIT.catchUpQuick.dv)).toBeLessThan(5); // 139.6 vs the handbook's rounded 136
    expect(quick.perigeeR - 6_371_000).toBeGreaterThan(600_000); // nowhere near the atmosphere
  });

  it("the fast intercept costs the handbook's 1,252 m/s in 22 minutes", () => {
    const f = fastIntercept();
    expect(Math.abs(f.dv - ORBIT.fastDv)).toBeLessThan(1);
    expect(f.tof).toBeCloseTo(22 * 60, 6);
  });

  for (const route of ROUTE_ORDER) {
    it(`${route}: flying the plan's burns lands on the approach point, for the route card's Δv`, () => {
      const sc = buildScenario(route);
      let s = sc.ship0;
      let t = 0;
      let spent = 0;
      for (const node of sc.nodes) {
        s = propagate(s, node.t - t);
        t = node.t;
        const dv = nodeDv(sc, node, s, t)!;
        expect(dv).not.toBeNull();
        spent += norm(dv);
        s = { r: s.r, v: add(s.v, dv) };
      }
      const aim = approachAt(sc, t);
      expect(t).toBeCloseTo(sc.approachT, 6);
      expect(norm(sub(s.r, aim.r))).toBeLessThan(2); // metres
      expect(norm(sub(s.v, aim.v))).toBeLessThan(0.01); // m/s
      // within a few m/s of the route card, docking allowance aside
      const card = routeTotals(route).outDv - DOCK_ALLOWANCE;
      expect(Math.abs(spent - card)).toBeLessThan(6);
      // and it takes the route card's time
      expect(Math.abs(sc.waitH + sc.approachT / 3600 - routeTotals(route).arriveH)).toBeLessThan(0.15);
      // and it waits there: an hour later the ship is still 1 km behind
      const later = propagate(s, 3600);
      expect(Math.abs(norm(sub(later.r, propagate(sc.l17at0, t + 3600).r)) - 1000)).toBeLessThan(1);
    });
  }

  it("corrects a sloppy departure burn with the next burns", () => {
    const sc = buildScenario("safe");
    let s = propagate(sc.ship0, sc.nodes[0].t);
    const dv0 = nodeDv(sc, sc.nodes[0], s, sc.nodes[0].t)!;
    // 2% short and 10 s late
    s = propagate(s, 10);
    s = { r: s.r, v: add(s.v, [dv0[0] * 0.98, dv0[1] * 0.98, dv0[2] * 0.98]) };
    let t = sc.nodes[0].t + 10;
    let spent = norm(dv0) * 0.98;
    for (const node of sc.nodes.slice(1)) {
      s = propagate(s, node.t - t);
      t = node.t;
      const dv = nodeDv(sc, node, s, t)!;
      expect(dv).not.toBeNull();
      spent += norm(dv);
      s = { r: s.r, v: add(s.v, dv) };
    }
    // the next burns fix the timing; what's left is a few km, closed by the terminal burn
    const left = norm(sub(s.r, approachAt(sc, t).r));
    expect(left).toBeLessThan(30_000);
    const term = replan(sc, s, t, true)!;
    expect(term).not.toBeNull();
    let x = propagate(s, term.nodes[0].t - t);
    const d1 = nodeDv(sc, term.nodes[0], x, term.nodes[0].t)!;
    x = { r: x.r, v: add(x.v, d1) };
    x = propagate(x, term.nodes[1].t - term.nodes[0].t);
    const d2 = nodeDv(sc, term.nodes[1], x, term.nodes[1].t)!;
    spent += norm(d1) + norm(d2);
    expect(norm(sub(x.r, approachAt(sc, term.nodes[1].t).r))).toBeLessThan(5);
    // the fix is affordable: within 60 m/s of the computer's own plan
    expect(Math.abs(spent - sc.idealDv)).toBeLessThan(60);
  });

  it("re-plans a direct intercept when the plan is lost", () => {
    const sc = buildScenario("quick");
    const s = propagate(sc.ship0, 1200); // never left the Wick
    const p = replan(sc, s, 1200)!;
    expect(p).not.toBeNull();
    let x = propagate(s, p.nodes[0].t - 1200);
    x = { r: x.r, v: add(x.v, nodeDv(sc, p.nodes[0], x, p.nodes[0].t)!) };
    x = propagate(x, p.nodes[1].t - p.nodes[0].t);
    expect(norm(sub(x.r, approachAt(sc, p.nodes[1].t).r))).toBeLessThan(5);
  });
});
