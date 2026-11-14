/**
 * The route menu: time against fuel. Handbook page 11, with one fix.
 *
 * The orbital pieces are real (Engineering Brief A1, re-checked in physics.test.ts):
 *   Hohmann 300 → 1,000 km: 376 m/s, 49 min.   Fast transfer: 1,252 m/s, 22 min.
 *   10° plane change at 1,000 km: 1,282 m/s.   Catch-up 10°: 136 m/s in 1 orbit or 27 m/s over 5.
 *
 * The fix: in the handbook the fast transfer still waited 5 catch-up orbits, so it cost more and
 * arrived later than the quick catch-up, and nobody would ever pick it. A fast transfer can be
 * timed to arrive right at the station (a direct intercept), so it skips the catch-up orbits.
 * Now every plan buys time with fuel, which is the trade-off the route screen is meant to teach.
 */
import type { Source } from "../constants";
import type { RouteId } from "../types";

export const ORBIT = {
  hohmannDv: 376,
  hohmannH: 49 / 60,
  fastDv: 1252,
  fastH: 22 / 60,
  planeChangeDv: 1282,
  catchUpSlow: { dv: 27, hours: 5 * (105 / 60) },
  catchUpQuick: { dv: 136, hours: 105 / 60 },
  windowWaitH: 3,
} as const;

export interface Leg {
  label: string;
  dv: number;
  hours: number;
}

export interface Route {
  id: RouteId;
  name: string;
  summary: string;
  out: Leg[];
  back: Leg[];
  who: string;
  source: Source;
  teaches: string;
}

const DOCK: Leg = { label: "Dock at Lantern 17", dv: 20, hours: 0 };
const KEEP: Leg = { label: "Station-keeping", dv: 20, hours: 0 };
const HOME: Leg = { label: "Dock at the Wick", dv: 20, hours: 0 };
const WAIT: Leg = { label: "Wait for the launch window", dv: 0, hours: ORBIT.windowWaitH };
const HOHMANN_OUT: Leg = { label: "Hohmann transfer up", dv: ORBIT.hohmannDv, hours: ORBIT.hohmannH };
const HOHMANN_BACK: Leg = { label: "Hohmann transfer down", dv: ORBIT.hohmannDv, hours: ORBIT.hohmannH };
const FAST_OUT: Leg = { label: "Fast transfer, direct intercept", dv: ORBIT.fastDv, hours: ORBIT.fastH };
const FAST_BACK: Leg = { label: "Fast transfer down", dv: ORBIT.fastDv, hours: ORBIT.fastH };
const SLOW_CATCH: Leg = { label: "Catch up over 5 orbits", ...ORBIT.catchUpSlow };
const QUICK_CATCH: Leg = { label: "Catch up in 1 orbit", ...ORBIT.catchUpQuick };
const PLANE: Leg = { label: "10° plane change", dv: ORBIT.planeChangeDv, hours: 0 };
const HOME_PHASE: Leg = { label: "Phase back to the Wick", dv: 0, hours: ORBIT.catchUpQuick.hours };

export const ROUTES: Record<RouteId, Route> = {
  safe: {
    id: "safe",
    name: "Safe",
    summary: "Wait for the window, Hohmann up, catch up over 5 orbits.",
    out: [WAIT, HOHMANN_OUT, SLOW_CATCH, DOCK],
    back: [KEEP, HOHMANN_BACK, HOME_PHASE, HOME],
    who: "Every hull",
    source: "real",
    teaches: "Slow is cheap. But arriving late costs the chance to deflect.",
  },
  quick: {
    id: "quick",
    name: "Quick catch-up",
    summary: "Same transfer, but catch up in one orbit.",
    out: [WAIT, HOHMANN_OUT, QUICK_CATCH, DOCK],
    back: [KEEP, HOHMANN_BACK, HOME_PHASE, HOME],
    who: "Every hull",
    source: "real",
    teaches: "Phasing faster costs a little fuel and saves seven hours.",
  },
  fastOut: {
    id: "fastOut",
    name: "Fast out, safe back",
    summary: "Wait for the window, then a fast direct intercept. Hohmann home.",
    out: [WAIT, FAST_OUT, DOCK],
    back: [KEEP, HOHMANN_BACK, HOME_PHASE, HOME],
    who: "Courier, or a cryo Tender",
    source: "real",
    teaches: "Speed is bought with fuel, and the price climbs fast.",
  },
  fastBoth: {
    id: "fastBoth",
    name: "Fast both ways",
    summary: "Fast out and fast home.",
    out: [WAIT, FAST_OUT, DOCK],
    back: [KEEP, FAST_BACK, HOME_PHASE, HOME],
    who: "Nobody. Shown to teach.",
    source: "real",
    teaches: "Rushing home buys nothing: the ice doesn't care when you land.",
  },
  skipWindow: {
    id: "skipWindow",
    name: "Skip the window",
    summary: "Launch now: a 10° plane change, Hohmann up, catch up in one orbit.",
    out: [PLANE, HOHMANN_OUT, QUICK_CATCH, DOCK],
    back: [KEEP, HOHMANN_BACK, HOME_PHASE, HOME],
    who: "Only a cryo Tender, with nothing left over",
    source: "real",
    teaches: "A 10° plane change costs more than the whole safe round trip.",
  },
};

export const ROUTE_ORDER: RouteId[] = ["safe", "quick", "fastOut", "skipWindow", "fastBoth"];

const sum = (legs: Leg[], k: "dv" | "hours") => legs.reduce((n, l) => n + l[k], 0);

export function routeTotals(id: RouteId) {
  const r = ROUTES[id];
  const outDv = sum(r.out, "dv");
  const backDv = sum(r.back, "dv");
  return {
    outDv,
    backDv,
    totalDv: outDv + backDv,
    withMarginDv: (outDv + backDv) * 1.1,
    arriveH: sum(r.out, "hours"),
    backH: sum(r.back, "hours"),
  };
}
