/**
 * Starter ships for the hangar: one click builds a whole ship, through the real engine, so a player (or a judge
 * with 20 seconds) can launch straight away and still see what each part cost. Each preset is a full loadout.
 */
import { step } from "./engine";
import { STANDARD_TENDER } from "./data/ship";
import type { Action, GameState, Loadout } from "./types";

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  /** one line on what this ship is good and bad at */
  blurb: string;
  loadout: Loadout;
}

const base: Loadout = {
  ...STANDARD_TENDER,
  sensors: [...STANDARD_TENDER.sensors],
  kit: [...STANDARD_TENDER.kit],
  addons: [],
};

export const PRESETS: Preset[] = [
  {
    id: "balanced",
    name: "Balanced Tender",
    tagline: "A safe first run",
    blurb: "Lidar docks cleanly, suits can fix things. Comfortable on the safe route, but it can't measure the ice precisely.",
    loadout: base,
  },
  {
    id: "investigator",
    name: "Investigator",
    tagline: "Built to find the truth",
    blurb: "Thermal camera and radar see what others miss, and spare optics let you act on it. Little fuel to spare for speed.",
    loadout: { ...base, sensors: ["thermal", "radar"], kit: ["eva", "optics"] },
  },
  {
    id: "rush",
    name: "Cryo Rush",
    tagline: "Fast, if you can afford it",
    blurb: "A cryogenic engine is the only way a Tender can go fast. The fuel boils away while you fly.",
    loadout: { ...base, engine: "cryo" },
  },
];

const same = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The next single click that moves `from` toward `to`, or null when they match. */
function nextAction(from: Loadout, to: Loadout): Action | null {
  if (from.hull !== to.hull) return { type: "hull", id: to.hull };
  if (from.engine !== to.engine) return { type: "engine", id: to.engine };
  if (from.power !== to.power) return { type: "power", id: to.power };
  if (from.shield !== to.shield) return { type: "shield", id: to.shield };
  if (from.comms !== to.comms) return { type: "comms", id: to.comms };
  const extraSensor = from.sensors.find((x) => !to.sensors.includes(x));
  if (extraSensor) return { type: "sensor", id: extraSensor };
  const missingSensor = to.sensors.find((x) => !from.sensors.includes(x));
  if (missingSensor) return { type: "sensor", id: missingSensor };
  const extraKit = from.kit.find((x) => !to.kit.includes(x));
  if (extraKit) return { type: "kit", id: extraKit };
  const missingKit = to.kit.find((x) => !from.kit.includes(x));
  if (missingKit) return { type: "kit", id: missingKit };
  const extraAddon = from.addons.find((x) => !to.addons.includes(x));
  if (extraAddon) return { type: "addon", id: extraAddon };
  const missingAddon = to.addons.find((x) => !from.addons.includes(x));
  if (missingAddon) return { type: "addon", id: missingAddon };
  if (from.suit !== to.suit) return { type: "suit", id: to.suit };
  if (from.mobility !== to.mobility) return { type: "mobility", id: to.mobility };
  if (from.fuelKg !== to.fuelKg) return { type: "fuel", kg: to.fuelKg };
  return null;
}

/** The clicks that turn the current ship into `target`. Each is checked by the engine as it goes. */
export function actionsToReach(state: GameState, target: Loadout): Action[] {
  const out: Action[] = [];
  let s = state;
  for (let i = 0; i < 80; i++) {
    const a = nextAction(s.loadout, target);
    if (!a) return out;
    const r = step(s, a);
    if (!r.ok) throw new Error(`Preset step rejected: ${r.reason}`);
    out.push(a);
    s = r.state;
  }
  throw new Error("Preset did not converge");
}

export function sameShip(a: Loadout, b: Loadout): boolean {
  return (
    a.hull === b.hull &&
    a.engine === b.engine &&
    a.power === b.power &&
    a.shield === b.shield &&
    a.comms === b.comms &&
    a.suit === b.suit &&
    a.mobility === b.mobility &&
    a.fuelKg === b.fuelKg &&
    same(a.sensors, b.sensors) &&
    same(a.kit, b.kit) &&
    same(a.addons, b.addons)
  );
}
