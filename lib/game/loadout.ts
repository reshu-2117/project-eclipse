/**
 * Everything the hangar's live panel shows, computed from a loadout. Pure functions.
 */
import { BASE_LOAD_KW, BUDGET } from "./constants";
import { ADDONS, COMMS, ENGINES, HULLS, KIT, MOBILITY, POWER, SENSORS, SHIELDS, STANDARD_TENDER, SUITS } from "./data/ship";
import { ROUTES, routeTotals } from "./data/routes";
import { deltaV, dryMass } from "./physics";
import type { Loadout, SensorId } from "./types";

export function defaultLoadout(): Loadout {
  return {
    ...STANDARD_TENDER,
    sensors: [...STANDARD_TENDER.sensors],
    kit: [...STANDARD_TENDER.kit],
    addons: [],
  };
}

export interface LineItem {
  slot: string;
  name: string;
  massKg: number;
  cost: number;
}

export function lineItems(l: Loadout): LineItem[] {
  const items: LineItem[] = [];
  const e = ENGINES[l.engine];
  items.push({ slot: "Engine", name: e.name, massKg: e.massKg, cost: e.cost });
  const p = POWER[l.power];
  items.push({ slot: "Power", name: p.name, massKg: p.massKg, cost: p.cost });
  const s = SHIELDS[l.shield];
  items.push({ slot: "Shield", name: s.name, massKg: s.massKg, cost: s.cost });
  for (const id of l.sensors) items.push({ slot: "Sensor", name: SENSORS[id].name, massKg: SENSORS[id].massKg, cost: SENSORS[id].cost });
  const c = COMMS[l.comms];
  items.push({ slot: "Comms", name: c.name, massKg: c.massKg, cost: c.cost });
  for (const id of l.kit) items.push({ slot: "Service kit", name: KIT[id].name, massKg: KIT[id].massKg, cost: KIT[id].cost });
  for (const id of l.addons) items.push({ slot: "Power add-on", name: ADDONS[id].name, massKg: ADDONS[id].massKg, cost: ADDONS[id].cost });
  if (l.kit.includes("eva")) {
    const suit = SUITS[l.suit];
    if (suit.massKg || suit.cost) items.push({ slot: "Suit", name: suit.name, massKg: suit.massKg, cost: suit.cost });
    const mob = MOBILITY[l.mobility];
    if (mob.massKg || mob.cost) items.push({ slot: "Suit", name: mob.name, massKg: mob.massKg, cost: mob.cost });
  }
  return items;
}

/** Heater power the engine needs, after the RTG cancels it. */
export function heaterKw(l: Loadout): number {
  return l.addons.includes("rtg") ? 0 : ENGINES[l.engine].heaterKw;
}

/** Steady drain while flying: life support and computers plus heaters, less the RTG's 110 W. */
export function steadyLoadKw(l: Loadout): number {
  return BASE_LOAD_KW + heaterKw(l) - (l.addons.includes("rtg") ? 0.11 : 0);
}

export type FlagLevel = "warn" | "block";

export interface Flag {
  id: string;
  level: FlagLevel;
  text: string;
}

export interface LoadoutStats {
  partsKg: number;
  bayUsedKg: number;
  bayLimitKg: number;
  dryKg: number;
  fuelKg: number;
  maxFuelKg: number;
  wetKg: number;
  isp: number;
  dv: number;
  credits: number;
  energyKwh: number;
  regenKw: number;
  loadKw: number;
  enduranceH: number;
  sensorSlots: number;
  bestBandPct: number | null;
  flags: Flag[];
  canLaunch: boolean;
}

export function bestBand(sensors: SensorId[]): { sensor: SensorId; bandPct: number } | null {
  let best: { sensor: SensorId; bandPct: number } | null = null;
  for (const id of sensors) {
    const b = SENSORS[id].bandPct;
    if (b !== null && (!best || b < best.bandPct)) best = { sensor: id, bandPct: b };
  }
  return best;
}

export function loadoutStats(l: Loadout): LoadoutStats {
  const hull = HULLS[l.hull];
  const items = lineItems(l);
  const partsKg = items.reduce((n, i) => n + i.massKg, 0);
  const credits = hull.cost + items.reduce((n, i) => n + i.cost, 0);
  const dryKg = dryMass(hull.coreKg, partsKg);
  const isp = ENGINES[l.engine].isp;
  const fuelKg = Math.min(l.fuelKg, hull.maxFuelKg);
  const dv = deltaV(isp, dryKg, fuelKg);
  const power = POWER[l.power];
  const loadKw = steadyLoadKw(l);
  const net = loadKw - power.regenKw;
  const enduranceH = net <= 0 ? Infinity : power.capacityKwh / net;
  const band = bestBand(l.sensors);

  const flags: Flag[] = [];
  const safe = routeTotals("safe");
  if (dv < safe.withMarginDv)
    flags.push({
      id: "dv",
      level: "warn",
      text: `Δv ${Math.round(dv)} m/s is less than the safe route + 10% margin (${Math.round(safe.withMarginDv)} m/s).`,
    });
  if (!l.sensors.includes("lidar") && !l.sensors.includes("radar"))
    flags.push({ id: "speed", level: "warn", text: "No sensor can measure speed (no lidar or radar)." });
  if (enduranceH < 30)
    flags.push({
      id: "energy",
      level: "warn",
      text: `Energy won't last 30 h of normal use (about ${Math.floor(enduranceH)} h at ${loadKw.toFixed(2)} kW).`,
    });
  if (l.shield === "none") flags.push({ id: "shield", level: "warn", text: "No shield, but debris events are possible." });
  if (!l.kit.some((k) => k === "eva" || k === "drones" || k === "arm"))
    flags.push({ id: "inspect", level: "warn", text: "No way to inspect or repair up close (no drones, suits or arm)." });
  if (credits > BUDGET)
    flags.push({ id: "budget", level: "block", text: `Budget over ${BUDGET} credits (${credits}). This one blocks launch.` });
  if (partsKg > hull.bayLimitKg)
    flags.push({
      id: "bay",
      level: "block",
      text: `Parts weigh ${Math.round(partsKg)} kg. The ${hull.name}'s bay takes ${hull.bayLimitKg} kg.`,
    });
  if (l.sensors.length > hull.sensorSlots)
    flags.push({ id: "slots", level: "block", text: `The ${hull.name} has ${hull.sensorSlots} sensor slot(s).` });

  return {
    partsKg,
    bayUsedKg: partsKg,
    bayLimitKg: hull.bayLimitKg,
    dryKg,
    fuelKg,
    maxFuelKg: hull.maxFuelKg,
    wetKg: dryKg + fuelKg,
    isp,
    dv,
    credits,
    energyKwh: power.capacityKwh,
    regenKw: power.regenKw,
    loadKw,
    enduranceH,
    sensorSlots: hull.sensorSlots,
    bestBandPct: band?.bandPct ?? null,
    flags,
    canLaunch: !flags.some((f) => f.level === "block"),
  };
}

/** Which route plans this loadout can fly with its full tank, before any events. */
export function routeFit(l: Loadout) {
  const { dv } = loadoutStats(l);
  return (Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((id) => {
    const t = routeTotals(id);
    return {
      id,
      ...t,
      fits: dv >= t.totalDv,
      fitsWithMargin: dv >= t.withMarginDv,
      shortBy: Math.max(0, t.totalDv - dv),
    };
  });
}
