/**
 * The real physics under the game. Every function here is a textbook formula, not a game rule.
 */
import { G0, ICE, MARGIN, PLANET, TEST } from "./constants";

/** Exhaust velocity from specific impulse, m/s. */
export function exhaustVelocity(isp: number): number {
  return isp * G0;
}

/** Ideal rocket equation (NASA Glenn): Δv = Isp·g0·ln((dry + fuel) / dry), in m/s. */
export function deltaV(isp: number, dryKg: number, fuelKg: number): number {
  if (dryKg <= 0 || fuelKg <= 0 || isp <= 0) return 0;
  return exhaustVelocity(isp) * Math.log((dryKg + fuelKg) / dryKg);
}

/** Fuel burned to change speed by dv: (dry + fuel)·(1 − e^(−dv / (Isp·g0))), in kg. */
export function fuelForDeltaV(isp: number, dryKg: number, fuelKg: number, dv: number): number {
  if (dv <= 0) return 0;
  return (dryKg + fuelKg) * (1 - Math.exp(-dv / exhaustVelocity(isp)));
}

/** Dry mass with the 10% design margin: (core + parts) × 1.10. */
export function dryMass(coreKg: number, partsKg: number): number {
  return (coreKg + partsKg) * (1 + MARGIN);
}

/** Speed of a circular orbit, km/s. */
export function circularSpeed(radiusKm: number, mu: number = PLANET.mu): number {
  return Math.sqrt(mu / radiusKm);
}

/** Period of a circular orbit, minutes. */
export function orbitPeriodMin(radiusKm: number, mu: number = PLANET.mu): number {
  return (2 * Math.PI * Math.sqrt(radiusKm ** 3 / mu)) / 60;
}

/** Hohmann transfer between two circular orbits: total Δv (m/s) and transfer time (minutes). */
export function hohmann(r1Km: number, r2Km: number, mu: number = PLANET.mu): { dv: number; minutes: number } {
  const a = (r1Km + r2Km) / 2;
  const dv1 = Math.sqrt(mu * (2 / r1Km - 1 / a)) - circularSpeed(r1Km, mu);
  const dv2 = circularSpeed(r2Km, mu) - Math.sqrt(mu * (2 / r2Km - 1 / a));
  return { dv: (Math.abs(dv1) + Math.abs(dv2)) * 1000, minutes: (Math.PI * Math.sqrt(a ** 3 / mu)) / 60 };
}

/** Plane change at a circular orbit: 2·v·sin(Δi / 2), m/s. */
export function planeChangeDv(radiusKm: number, degrees: number, mu: number = PLANET.mu): number {
  return 2 * circularSpeed(radiusKm, mu) * 1000 * Math.sin((degrees * Math.PI) / 360);
}

/** Time to send a file: size ÷ speed, hours. */
export function transferHours(megabytes: number, megabitsPerSecond: number): number {
  return (megabytes * 8) / megabitsPerSecond / 3600;
}

/** Speed change of the test block after the 60 s beam, cm/s. Force = power × push per watt. */
export function testPushCmS(): number {
  const forceN = TEST.beamKw * 1000 * TEST.pushMicroNPerW * 1e-6;
  return ((forceN * TEST.burnS) / TEST.blockKg) * 100;
}

/**
 * Sideways acceleration of the big ice for one unit of beam force, km/h².
 * a = orbitFactor × F / m. One unit for 21 h moves it about 1.5 km.
 */
export function iceAccelKmPerH2(units = 1): number {
  const aMs2 = (ICE.orbitFactor * ICE.beamForceN * units) / ICE.massKg;
  return (aMs2 * 3600 * 3600) / 1000;
}

/** Shift after beaming for a constant time from rest: ½·a·t², km. Twice the warning gives four times the miss. */
export function iceShiftKm(hours: number, units = 1): number {
  return 0.5 * iceAccelKmPerH2(units) * hours * hours;
}

/** Hours of constant beaming needed for a given shift. */
export function hoursForShift(km: number, units = 1): number {
  return Math.sqrt((2 * km) / iceAccelKmPerH2(units));
}
