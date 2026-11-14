/**
 * The event deck, handbook pages 12–13. Each card is one row of data. Draw 3 per run, always
 * including E4 (the distress call). Every choice costs something different.
 */
import type { Source } from "../constants";
import type { AddonId, EngineId, EventId, KitId, PowerId, SensorId, ShieldId } from "../types";

export interface CardEffect {
  /** Δv spent, m/s (burned as fuel through the rocket equation, so heavy ships pay more). */
  dv?: number;
  /** Δv given away as fuel to another crew, m/s worth. */
  giveDv?: number;
  hours?: number;
  /** Energy spent (negative) or gained (positive), kWh. */
  energy?: number;
  hull?: number;
  hullByShield?: Record<ShieldId, number>;
  hoursByEngine?: Partial<Record<EngineId, number>>;
  loseSensor?: boolean;
  fuelKg?: number;
  spareSegments?: number;
  helped?: boolean;
  evidencePenalty?: number;
  dockDelayH?: number;
  evaHours?: number;
  /** Tumbling wreck: safe with lidar, otherwise a chance of hull damage. */
  tumble?: { chance: number; hull: number; safeWith: SensorId };
}

export interface CardNeeds {
  sensor?: SensorId;
  noSensor?: SensorId;
  shield?: boolean;
  kit?: KitId;
  addon?: AddonId;
}

export interface CardChoice {
  id: string;
  label: string;
  outcome: string;
  needs?: CardNeeds;
  effect: CardEffect;
}

export interface EventCard {
  id: EventId;
  title: string;
  tier: "must" | "should" | "nice";
  text: string;
  teaches: string;
  source: Source;
  real?: string;
  skipIf?: { engine?: EngineId[]; power?: PowerId[] };
  choices: CardChoice[];
}

export const EVENTS: Record<EventId, EventCard> = {
  E1: {
    id: "E1",
    title: "Pebble swarm",
    tier: "must",
    text: "A cloud of ice gravel from the filament crosses your path.",
    teaches: "Shield mass pays off here.",
    source: "game",
    choices: [
      { id: "dodge", label: "Dodge burn", outcome: "−40 m/s Δv", effect: { dv: 40 } },
      {
        id: "turn",
        label: "Turn the shielded side forward",
        outcome: "−30 min, −1 kWh",
        needs: { shield: true },
        effect: { hours: 0.5, energy: -1, hullByShield: { none: 0, light: 2, heavy: 0 } },
      },
      {
        id: "tank",
        label: "Tank it",
        outcome: "Hull −20 (no shield) / −5 (light) / 0 (heavy)",
        effect: { hullByShield: { none: 20, light: 5, heavy: 0 } },
      },
    ],
  },
  E2: {
    id: "E2",
    title: "Tracked chunk",
    tier: "must",
    text: "A fist-sized chunk on a collision course.",
    teaches: "Good sensors save fuel.",
    source: "game",
    choices: [
      {
        id: "nudge",
        label: "Small nudge",
        outcome: "Radar gives 20 min warning: −15 m/s",
        needs: { sensor: "radar" },
        effect: { dv: 15 },
      },
      { id: "emergency", label: "Emergency burn", outcome: "−60 m/s", effect: { dv: 60 } },
      { id: "hit", label: "Take the hit", outcome: "Hull −40, a sensor is lost", effect: { hull: 40, loseSensor: true } },
    ],
  },
  E3: {
    id: "E3",
    title: "Frozen fuel line",
    tier: "must",
    text: "Deep cold. Hydrazine-family fuel freezes at about +1.5 °C.",
    teaches: "Heat is a resource, not a given.",
    source: "real",
    real: "Hydrazine freezes at about +1.5 °C.",
    skipIf: { engine: ["cryo"] },
    choices: [
      { id: "heat", label: "Heat the lines", outcome: "−3 kWh", effect: { energy: -3 } },
      {
        id: "without",
        label: "Fly without that engine",
        outcome: "Biprop / green: +1 h. Cluster: no effect.",
        effect: { hoursByEngine: { biprop: 1, green: 1, cluster: 0 } },
      },
      { id: "rtg", label: "Let the RTG warm it", outcome: "No effect: free heat", needs: { addon: "rtg" }, effect: {} },
    ],
  },
  E4: {
    id: "E4",
    title: "Distress call",
    tier: "must",
    text: "Another crew's craft is crippled. They're asking anyone in range.",
    teaches: "Helping costs something now and pays back later.",
    source: "fiction",
    choices: [
      { id: "fuel", label: "Give them fuel", outcome: "−150 m/s worth", effect: { giveDv: 150, helped: true } },
      { id: "relay", label: "Relay their data home", outcome: "−2 kWh, −30 min", effect: { energy: -2, hours: 0.5, helped: true } },
      { id: "tow", label: "Tow them to safety", outcome: "−200 m/s, −2 h", effect: { dv: 200, hours: 2, helped: true } },
      { id: "ignore", label: "Ignore", outcome: "Free, but it's logged", effect: {} },
    ],
  },
  E5: {
    id: "E5",
    title: "Light crossing",
    tier: "should",
    text: "Your path crosses another Lantern's beam field.",
    teaches: "Light is a physical force. Foreshadows the twist.",
    source: "fiction",
    choices: [
      {
        id: "through",
        label: "Fly straight through",
        outcome: "Hull heats up, heaters off: +2 kWh. Cameras blinded: evidence −5 later.",
        effect: { energy: 2, evidencePenalty: 5 },
      },
      { id: "detour", label: "Detour around the beam", outcome: "−20 m/s, −30 min", effect: { dv: 20, hours: 0.5 } },
      {
        id: "tap",
        label: "Drink it in with the Lantern tap",
        outcome: "+10 kWh free power. Cameras blinded: evidence −5 later.",
        needs: { addon: "tap" },
        effect: { energy: 10, evidencePenalty: 5 },
      },
    ],
  },
  E6: {
    id: "E6",
    title: "Abandoned Lantern 9",
    tier: "should",
    text: "A stripped station from the 72-year crisis drifts past. It's tumbling.",
    teaches: "Salvage is a gamble that good sensors take out of your hands.",
    source: "fiction",
    choices: [
      {
        id: "segments",
        label: "Salvage 2 mirror segments",
        outcome: "−2 h, −10 m/s. Tumbling: lidar = safe, otherwise 30% chance of hull −15.",
        effect: { hours: 2, dv: 10, spareSegments: 2, tumble: { chance: 0.3, hull: 15, safeWith: "lidar" } },
      },
      {
        id: "fuel",
        label: "Salvage fuel",
        outcome: "+300 kg fuel, −2 h. Tumbling: lidar = safe, otherwise 30% chance of hull −15.",
        effect: { hours: 2, fuelKg: 300, tumble: { chance: 0.3, hull: 15, safeWith: "lidar" } },
      },
      { id: "pass", label: "Fly past", outcome: "Nothing gained, nothing spent", effect: {} },
    ],
  },
  E7: {
    id: "E7",
    title: "Reaction wheel fails",
    tier: "should",
    text: "A spinning wheel that turns the ship stops working.",
    teaches: "One of the most common real spacecraft failures.",
    source: "real",
    real: "Kepler and Dawn both lost reaction wheels, and so did Japan's Hayabusa.",
    choices: [
      { id: "thrusters", label: "Steer with thrusters", outcome: "−25 m/s over the mission", effect: { dv: 25 } },
      {
        id: "eva",
        label: "EVA repair",
        outcome: "−1 h and 1 h of suit air",
        needs: { kit: "eva" },
        effect: { hours: 1, evaHours: 1 },
      },
      { id: "limp", label: "Fly on without it", outcome: "Docking takes 30 min longer", effect: { dockDelayH: 0.5 } },
    ],
  },
  E8: {
    id: "E8",
    title: "Fuel cell wears out",
    tier: "nice",
    text: "One cell's output drops.",
    teaches: "Redundancy is mass you carry for the bad day.",
    source: "game",
    skipIf: { power: ["battery", "reactor"] },
    choices: [{ id: "shut", label: "Shut the worn cell down", outcome: "Lose 72 kWh of stored energy", effect: { energy: -72 } }],
  },
};

export const EVENT_IDS = Object.keys(EVENTS) as EventId[];
