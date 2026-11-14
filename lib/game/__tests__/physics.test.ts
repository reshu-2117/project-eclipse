/** Every real-physics number in the Game Systems Handbook, re-derived from first principles. */
import { describe, expect, it } from "vitest";
import {
  PLANET,
  deltaV,
  fuelForDeltaV,
  hohmann,
  hoursForShift,
  iceShiftKm,
  orbitPeriodMin,
  planeChangeDv,
  testPushCmS,
  transferHours,
} from "../index";

const wick = PLANET.radiusKm + PLANET.wickAltKm;
const l17 = PLANET.radiusKm + PLANET.lanternAltKm;

describe("orbits (handbook p.11, Engineering Brief A1)", () => {
  it("Lantern 17 at 1,000 km takes about 105 minutes per orbit", () => {
    expect(orbitPeriodMin(l17)).toBeCloseTo(105, 0);
  });
  it("a Hohmann transfer from the Wick costs 376 m/s and takes 49 minutes", () => {
    const h = hohmann(wick, l17);
    expect(Math.round(h.dv)).toBe(376);
    expect(Math.round(h.minutes)).toBe(49);
  });
  it("a plane change costs about 128 m/s per degree, 1,282 m/s for 10°", () => {
    expect(Math.round(planeChangeDv(l17, 1))).toBe(128);
    expect(Math.round(planeChangeDv(l17, 10))).toBe(1282);
  });
});

describe("rocket equation (handbook p.10)", () => {
  it("a standard Tender has about 1,700 m/s", () => {
    expect(deltaV(316, (3850 + 1671) * 1.1, 4500)).toBeCloseTo(1718, 0);
  });
  it("a 40 m/s dodge in a 10,600 kg Tender burns about 136 kg", () => {
    expect(Math.round(fuelForDeltaV(316, 6100, 4500, 40))).toBe(136);
  });
  it("doubling the fuel does not double the Δv", () => {
    const one = deltaV(316, 6000, 4500);
    const two = deltaV(316, 6000, 9000);
    expect(two).toBeLessThan(2 * one);
  });
});

describe("comms (handbook p.19): size ÷ speed", () => {
  const cases: [number, number, number][] = [
    [20, 0.256, 625],
    [200, 0.256, 6250],
    [2000, 0.256, 62500],
    [200, 10, 160],
    [2000, 200, 80],
  ];
  it.each(cases)("%d MB at %d Mbps takes %d s", (mb, mbps, seconds) => {
    expect(transferHours(mb, mbps) * 3600).toBeCloseTo(seconds, 3);
  });
});

describe("the test and the big ice (handbook p.17)", () => {
  it("10 kW for 60 s on a 482 kg block gives about 6 cm/s", () => {
    expect(testPushCmS()).toBeCloseTo(6.2, 1);
  });
  it("one Lantern needs about 21 hours to move the ice 1.5 km", () => {
    expect(hoursForShift(1.5)).toBeCloseTo(21, 0);
    expect(iceShiftKm(21)).toBeGreaterThan(1.5);
  });
  it("twice the warning gives four times the miss", () => {
    expect(iceShiftKm(20) / iceShiftKm(10)).toBeCloseTo(4, 6);
  });
});
