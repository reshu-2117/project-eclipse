/**
 * The Wick's catalogue: three hulls and every part. Handbook pages 6–9.
 * Masses include tanks and plumbing. Each row says what it gives you and what it costs you.
 */
import type { Source } from "../constants";
import type {
  AddonId,
  CommsId,
  EngineId,
  HullId,
  KitId,
  MobilityId,
  PowerId,
  SensorId,
  ShieldId,
  SuitId,
} from "../types";

interface Row<Id extends string> {
  id: Id;
  name: string;
  massKg: number;
  cost: number;
  source: Source;
  anchor: string;
  gain: string;
  drawback: string;
}

export interface Hull {
  id: HullId;
  name: string;
  tagline: string;
  coreKg: number;
  maxFuelKg: number;
  bayLimitKg: number;
  sensorSlots: number;
  cost: number;
  note: string;
}

export const HULLS: Record<HullId, Hull> = {
  courier: {
    id: "courier",
    name: "Courier",
    tagline: "Fast · fragile",
    coreKg: 2700,
    maxFuelKg: 3400,
    bayLimitKg: 1400,
    sensorSlots: 1,
    cost: 20,
    note: "The only hull light enough for the fast route out. It can't carry a heavy shield and suits together.",
  },
  tender: {
    id: "tender",
    name: "Tender",
    tagline: "Balanced · first run",
    coreKg: 3850,
    maxFuelKg: 4500,
    bayLimitKg: 2500,
    sensorSlots: 2,
    cost: 30,
    note: "Built on the Engineering Brief's baseline mission, about Soyuz size. Comfortable on the safe route.",
  },
  hauler: {
    id: "hauler",
    name: "Hauler",
    tagline: "Heavy · fixes anything",
    coreKg: 4800,
    maxFuelKg: 5500,
    bayLimitKg: 3800,
    sensorSlots: 3,
    cost: 40,
    note: "The only hull that carries heavy armour, the arm and spare optics together. Slow, and it eats the budget.",
  },
};

export const HULL_CORE_NOTE =
  "Core mass is everything that isn't a choice: cabin and structure, life support, computers, heaters, docking ring, 2 crew and food.";

export interface Engine extends Row<EngineId> {
  isp: number;
  heaterKw: number;
  boiloff: boolean;
  locked?: string;
}

export const ENGINES: Record<EngineId, Engine> = {
  biprop: {
    id: "biprop",
    name: "Workhorse biprop",
    massKg: 450,
    cost: 12,
    isp: 316,
    heaterKw: 0.3,
    boiloff: false,
    source: "real",
    anchor: "AJ10-class, flown on Shuttle and Orion",
    gain: "Strong, proven, restartable.",
    drawback: "Fuel lines need 300 W of heaters in the cold.",
  },
  cluster: {
    id: "cluster",
    name: "Four-thruster cluster",
    massKg: 380,
    cost: 10,
    isp: 312,
    heaterKw: 0.3,
    boiloff: false,
    source: "real",
    anchor: "4 × R-4D-class",
    gain: "Lose one, still fly home. A frozen line doesn't stop it.",
    drawback: "Slightly weaker. 300 W of heaters.",
  },
  green: {
    id: "green",
    name: "Green monoprop",
    massKg: 400,
    cost: 10,
    isp: 231,
    heaterKw: 0.15,
    boiloff: false,
    source: "real",
    anchor: "ASCENT-class",
    gain: "Safer, simpler. Only 150 W of heaters.",
    drawback: "Needs far more fuel for the same trip.",
  },
  cryo: {
    id: "cryo",
    name: "Cryogenic",
    massKg: 650,
    cost: 18,
    isp: 450,
    heaterKw: 0,
    boiloff: true,
    source: "real",
    anchor: "RL10-class, LOX/LH2",
    gain: "Most efficient. The only way a Tender can go fast.",
    drawback: "Fuel boils away: about 2% every 6 hours.",
  },
  ion: {
    id: "ion",
    name: "Ion engine",
    massKg: 0,
    cost: 0,
    isp: 4190,
    heaterKw: 0,
    boiloff: false,
    source: "real",
    anchor: "Gridded ion thruster",
    gain: "Absurdly efficient.",
    drawback: "Tiny thrust.",
    locked: "Would take about 4 months and a 7 kW reactor to get there. Useless in an emergency.",
  },
};

export interface Power extends Row<PowerId> {
  capacityKwh: number;
  regenKw: number;
}

export const POWER: Record<PowerId, Power> = {
  fuelcells: {
    id: "fuelcells",
    name: "Fuel cells ×2",
    massKg: 520,
    cost: 10,
    capacityKwh: 360,
    regenKw: 0,
    source: "real",
    anchor: "Shuttle-class",
    gain: "12 kW, 360 kWh stored. Makes drinking water.",
    drawback: "A worn cell can lose a fifth of its charge.",
  },
  battery: {
    id: "battery",
    name: "Battery pack",
    massKg: 600,
    cost: 6,
    capacityKwh: 90,
    regenKw: 0,
    source: "real",
    anchor: "Space Li-ion, about 150 Wh/kg",
    gain: "Silent and simple.",
    drawback: "90 kWh only. 30 h of normal use needs about 100.",
  },
  reactor: {
    id: "reactor",
    name: "Small reactor",
    massKg: 1200,
    cost: 22,
    capacityKwh: 30,
    regenKw: 4,
    source: "real",
    anchor: "Kilopower-class",
    gain: "4 kW that never runs out.",
    drawback: "Heavy, expensive, and only a small buffer for bursts.",
  },
};

export interface Shield extends Row<ShieldId> {
  /** Hull damage multiplier for debris you choose to tank. */
  stops: string;
}

export const SHIELDS: Record<ShieldId, Shield> = {
  none: {
    id: "none",
    name: "None",
    massKg: 0,
    cost: 0,
    stops: "Nothing.",
    source: "real",
    anchor: "",
    gain: "Fastest, cheapest.",
    drawback: "Every pebble hits the hull.",
  },
  light: {
    id: "light",
    name: "Light Whipple",
    massKg: 276,
    cost: 6,
    stops: "About 0.9 cm aluminium-sized bits at 7 km/s.",
    source: "real",
    anchor: "ISS-type layered Whipple shield, sized for 40 m² of hull",
    gain: "Stops most of the gravel.",
    drawback: "276 kg you have to push everywhere.",
  },
  heavy: {
    id: "heavy",
    name: "Heavy Whipple",
    massKg: 1080,
    cost: 12,
    stops: "About 1.3–1.45 cm pebbles.",
    source: "real",
    anchor: "ISS-type stuffed Whipple shield",
    gain: "Shrugs off the swarm.",
    drawback: "Costs about 280 kg of extra fuel. Can't stop a 1 m block: that has to be dodged.",
  },
};

export interface Sensor extends Row<SensorId> {
  powerW: number;
  /** Uncertainty of the test result if this is your best measuring sensor, ±%. null = can't measure speed. */
  bandPct: number | null;
}

export const SENSORS: Record<SensorId, Sensor> = {
  camera: {
    id: "camera",
    name: "Inspection camera",
    massKg: 10,
    cost: 3,
    powerW: 10,
    bandPct: 60,
    source: "real",
    anchor: "OSIRIS-REx cameras: 0.6 kg, 5.3 W each",
    gain: "See cracks (clue C1). Test result is rough: ±60%.",
    drawback: "Can't see heat. Can't measure speed well.",
  },
  thermal: {
    id: "thermal",
    name: "Thermal IR camera",
    massKg: 12,
    cost: 5,
    powerW: 15,
    bandPct: null,
    source: "real",
    anchor: "Heat imaging, as used by TriDAR",
    gain: "See heat: the burn scar (clue C2), failing shields, the leak.",
    drawback: "Can't measure speed at all.",
  },
  lidar: {
    id: "lidar",
    name: "Lidar",
    massKg: 25,
    cost: 8,
    powerW: 60,
    bandPct: 15,
    source: "real",
    anchor: "TriDAR worked from 0.5 m to over 2 km",
    gain: "3D map of the station, safe docking, test result ±15%.",
    drawback: "60 W while scanning.",
  },
  radar: {
    id: "radar",
    name: "Tracking radar",
    massKg: 40,
    cost: 10,
    powerW: 200,
    bandPct: 3,
    source: "real",
    anchor: "Doppler resolves mm/s over 10 s (Engineering Brief, A10)",
    gain: "True ice size, early warnings, test result ±3%.",
    drawback: "Heaviest sensor, 200 W.",
  },
};

export interface Comms extends Row<CommsId> {
  powerW: number;
  mbps: number;
  stationOnly: boolean;
}

export const COMMS: Record<CommsId, Comms> = {
  radio: {
    id: "radio",
    name: "Small radio",
    massKg: 2,
    cost: 2,
    powerW: 35,
    mbps: 0.256,
    stationOnly: false,
    source: "real",
    anchor: "IRIS-class transponder",
    gain: "Light and cheap.",
    drawback: "A 200 MB proof takes 1 h 44 min to send.",
  },
  dish: {
    id: "dish",
    name: "High-gain dish",
    massKg: 30,
    cost: 6,
    powerW: 100,
    mbps: 10,
    stationOnly: false,
    source: "game",
    anchor: "",
    gain: "Fast enough for everything.",
    drawback: "Must be pointed home.",
  },
  laser: {
    id: "laser",
    name: "Laser terminal",
    massKg: 35,
    cost: 12,
    powerW: 120,
    mbps: 200,
    stationOnly: false,
    source: "real",
    anchor: "NASA DSOC on Psyche hit 267 Mbps",
    gain: "Fastest by far.",
    drawback: "Expensive. Debris clouds can block the beam.",
  },
  relay: {
    id: "relay",
    name: "Lantern relay",
    massKg: 5,
    cost: 4,
    powerW: 0,
    mbps: 50,
    stationOnly: true,
    source: "fiction",
    anchor: "",
    gain: "Fast and nearly weightless.",
    drawback: "Only works docked to a live Lantern, on power the cities need.",
  },
};

export interface Kit extends Row<KitId> {
  detail: string;
}

export const KIT: Record<KitId, Kit> = {
  eva: {
    id: "eva",
    name: "EVA suits ×2",
    massKg: 360,
    cost: 8,
    detail: "Full detail anywhere. 8 h of air each.",
    source: "real",
    anchor: "NASA EMU: about 118–127 kg charged, 8 h + 30 min backup",
    gain: "The only way to fix the drift. Can reach every zone.",
    drawback: "Slow, risky, and air runs out.",
  },
  drones: {
    id: "drones",
    name: "Drone pair",
    massKg: 60,
    cost: 6,
    detail: "Fast, risk-free scans. 3 h of battery.",
    source: "real",
    anchor: "NASA AERCam Sprint flew on STS-87 in 1997",
    gain: "15 minutes a zone, nobody at risk.",
    drawback: "Surface only. Can be lost to glare.",
  },
  arm: {
    id: "arm",
    name: "Robotic arm",
    massKg: 450,
    cost: 14,
    detail: "Safe heavy work, 8 m reach from the dock hub.",
    source: "real",
    anchor: "Canadarm3: 8.5 m, about 715 kg (estimate)",
    gain: "Patch the leak or swap mirror segments without risking anyone.",
    drawback: "Heavy. Has to walk end over end to reach the far zones.",
  },
  optics: {
    id: "optics",
    name: "Spare optics",
    massKg: 260,
    cost: 10,
    detail: "6 mirror segments.",
    source: "game",
    anchor: "Segments swap like JWST's 18 hexes",
    gain: "Turns a diagnosis into a fix.",
    drawback: "Dead weight unless you reach the Petals.",
  },
};

export interface Addon extends Row<AddonId> {
  detail: string;
}

export const ADDONS: Record<AddonId, Addon> = {
  rtg: {
    id: "rtg",
    name: "RTG “heat brick”",
    massKg: 45,
    cost: 15,
    detail: "110 W + about 2 kW of free heat.",
    source: "real",
    anchor: "MMRTG",
    gain: "Cancels engine heater power. Fuel lines never freeze.",
    drawback: "15 credits for 110 W.",
  },
  tap: {
    id: "tap",
    name: "Lantern tap",
    massKg: 80,
    cost: 6,
    detail: "+10 kWh per hour docked at a live Lantern.",
    source: "fiction",
    anchor: "",
    gain: "Free power at the station.",
    drawback: "Every watt is taken from the cities.",
  },
};

export interface SuitOption {
  id: SuitId | MobilityId;
  name: string;
  massKg: number;
  cost: number;
  gain: string;
  drawback: string;
  source: Source;
}

export const SUITS: Record<SuitId, SuitOption> = {
  soft: {
    id: "soft",
    name: "Soft suit",
    massKg: 0,
    cost: 0,
    gain: "Mobile, good for detail work.",
    drawback: "Weak impact and radiation protection.",
    source: "game",
  },
  hard: {
    id: "hard",
    name: "Hard suit",
    massKg: 40,
    cost: 2,
    gain: "Halves the dose near the reactor.",
    drawback: "+30 min per task.",
    source: "game",
  },
};

export const MOBILITY: Record<MobilityId, SuitOption> = {
  tether: {
    id: "tether",
    name: "Tether",
    massKg: 0,
    cost: 0,
    gain: "Can't drift away.",
    drawback: "Far zones need a line rigged first: +30 min.",
    source: "game",
  },
  jetpack: {
    id: "jetpack",
    name: "Jetpack",
    massKg: 76,
    cost: 2,
    gain: "Reach anywhere, no rigging.",
    drawback: "Only about 3 m/s of push in total: 3 far trips, then you're back on the tether.",
    source: "real",
  },
};

export const JETPACK_ANCHOR = "NASA SAFER: about 38 kg each, about 3 m/s in total";

/** The standard Tender from the handbook's sanity check. Also the default the hangar opens with. */
export const STANDARD_TENDER = {
  hull: "tender",
  engine: "biprop",
  power: "fuelcells",
  shield: "light",
  sensors: ["camera", "lidar"],
  comms: "dish",
  kit: ["eva"],
  addons: [],
  suit: "soft",
  mobility: "tether",
  fuelKg: 4500,
} as const;
