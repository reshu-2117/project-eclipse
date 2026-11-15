/**
 * Starter packages for the hangar: one click builds a whole ship, through the real engine, so a first-time
 * player (or a judge with 20 seconds) can launch straight away and still see what each part cost.
 * Each preset is a full loadout.
 *
 * Every package can see heat (the thermal camera finds the burn scar, worth 15 proof points) and can measure
 * the ice (lidar or radar, needed for the path check and the test). That is on purpose. Played the same way,
 * the scripted crew that skips the distress call wins with any of these and ends "Dismissed" on a camera-only
 * ship, because proof then tops out at 75 and the network wants 80. The tests keep it that way.
 */
import { step } from "./engine";
import { STANDARD_TENDER } from "./data/ship";
import { loadoutStats, routeFit } from "./loadout";
import type { Action, GameState, Loadout } from "./types";

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  /** the one-line reason a beginner would choose it, after "Pick this if" */
  pickIf: string;
  /** one line on what this ship is good and bad at */
  blurb: string;
  /** the package a first-time player should take */
  recommended?: boolean;
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
    id: "investigator",
    name: "Investigator",
    tagline: "Best first run",
    pickIf: "you want the best shot at the best ending.",
    blurb: "Sees heat, measures the ice to within 3%, and carries spare mirror parts, so you can really repair Lantern 17. It uses nearly the whole budget and can only fly the two slower routes.",
    recommended: true,
    loadout: { ...base, sensors: ["thermal", "radar"], kit: ["eva", "optics"] },
  },
  {
    id: "balanced",
    name: "Balanced Tender",
    tagline: "Cheap and simple",
    pickIf: "you want the simplest, cheapest ship that can still be believed.",
    blurb: "A heat camera and lidar find the clues and measure the ice, and suits fix things outside. The cheapest of the five and easy on fuel. It carries no spare mirror parts, so it can't repair the mirror.",
    loadout: { ...base, sensors: ["thermal", "lidar"] },
  },
  {
    id: "scout",
    name: "Drone Scout",
    tagline: "Look first, risk less",
    pickIf: "you would rather send drones than people into danger.",
    blurb: "Drones take the first look at risky spots, with suits aboard for repairs. A light ship that keeps good fuel for the trip home. It carries no spare mirror parts.",
    loadout: { ...base, sensors: ["thermal", "lidar"], kit: ["drones", "eva"] },
  },
  {
    id: "armoured",
    name: "Armoured Tender",
    tagline: "Built for the ice",
    pickIf: "you are worried about ice hitting your ship.",
    blurb: "A heavy shield shrugs off most of an ice cloud, though a big chunk still has to be dodged. The bay is almost full, so there are no spare mirror parts, and it has the least fuel of the five.",
    loadout: { ...base, shield: "heavy", sensors: ["thermal", "lidar"] },
  },
  {
    id: "rush",
    name: "Cryo Rush",
    tagline: "Fast, if you can afford it",
    pickIf: "you want to arrive early and have more time at the station.",
    blurb: "A cryogenic engine is the only way a Tender can fly the fast routes, and it carries the most fuel of the five. The super-cold fuel slowly boils away, and it has no spare mirror parts.",
    loadout: { ...base, engine: "cryo", sensors: ["thermal", "lidar"] },
  },
];

export interface PresetFacts {
  /** thermal camera: finds the hidden burn scar, the second clue */
  seesHeat: boolean;
  /** how exactly the best sensor measures the ice, ±%; null if nothing aboard can */
  testBandPct: number | null;
  /** spare mirror segments and a way to fit them: unlocks "Repair the mirror" and "Fix half" at the big decision */
  canRepairMirror: boolean;
  /** of the five routes, how many the full tank flies with the 10% margin */
  routesInReach: number;
  /** no red flags in the readiness review */
  cleanLaunch: boolean;
}

/** What a ship can do, read off the loadout itself, so a card can never say something the engine will not do. */
export function presetFacts(l: Loadout): PresetFacts {
  const st = loadoutStats(l);
  return {
    seesHeat: l.sensors.includes("thermal"),
    testBandPct: st.bestBandPct,
    canRepairMirror: l.kit.includes("optics") && (l.kit.includes("eva") || l.kit.includes("arm")),
    routesInReach: routeFit(l).filter((r) => r.fitsWithMargin).length,
    cleanLaunch: st.flags.length === 0,
  };
}

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
