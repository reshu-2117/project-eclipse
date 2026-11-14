/**
 * Lantern 17, "the Lighthouse Spine": six zones, two hidden dangers, six clues, three explanations.
 * Handbook pages 14–17.
 */
import type { Source } from "../constants";
import type { ClueId, FindId, HazardId, HypId, Method, SensorId, SettlementId, ZoneId } from "../types";

export interface Find {
  what: FindId;
  methods: Method[];
  /** For the "scan" method: which ship sensor sees it (any of). */
  scanWith?: SensorId[];
  /** Must also carry one of these sensors (any method). */
  confirmWith?: SensorId[];
}

export interface Zone {
  id: ZoneId;
  name: string;
  what: string;
  hazard: string;
  far: boolean;
  /** Visible on the map after a survey without lidar. */
  nearHub: boolean;
  damaged: boolean;
  real: string;
  finds: Find[];
  /** Line shown when an inspection here turns up nothing new. */
  quiet: string;
}

export const ZONES: Record<ZoneId, Zone> = {
  dock: {
    id: "dock",
    name: "Dock hub",
    what: "Arrival point and the arm's base.",
    hazard: "Station drift makes docking harder.",
    far: false,
    nearHub: true,
    damaged: false,
    real: "IDA docking adapter: 526 kg",
    finds: [],
    quiet: "The docking ring is sound. Nothing hidden here.",
  },
  spine: {
    id: "spine",
    name: "Spine truss",
    what: "Cables and the gyro wheels.",
    hazard: "Loose debris.",
    far: false,
    nearHub: true,
    damaged: true,
    real: "ISS truss",
    finds: [{ what: "drift", methods: ["download", "drone", "arm", "eva"] }],
    quiet: "Cables and wheels, as logged.",
  },
  radiators: {
    id: "radiators",
    name: "Radiator fins",
    what: "Coolant loops for the reactor.",
    hazard: "Toxic ammonia leak.",
    far: false,
    nearHub: true,
    damaged: true,
    real: "ISS ammonia leaks, fixed by EVA",
    finds: [{ what: "leak", methods: ["download", "scan", "drone", "arm", "eva"], scanWith: ["thermal"] }],
    quiet: "The fins look intact from here. A thermal camera would show more.",
  },
  kiln: {
    id: "kiln",
    name: "The Kiln",
    what: "The fusion reactor.",
    hazard: "Radiation: +5 mSv per hour on EVA.",
    far: true,
    nearHub: false,
    damaged: false,
    real: "Fiction",
    finds: [{ what: "leak", methods: ["download"] }],
    quiet: "Reactor housing intact. Its log would tell you more than its shell.",
  },
  petals: {
    id: "petals",
    name: "The Petals",
    what: "The segmented mirror.",
    hazard: "Focused glare burns suits and blinds drones in daylight.",
    far: true,
    nearHub: false,
    damaged: true,
    real: "JWST: 18 hexagonal segments, 6.5 m",
    finds: [
      { what: "C1", methods: ["scan", "drone", "arm", "eva"], scanWith: ["camera"] },
      { what: "C2", methods: ["scan"], scanWith: ["thermal"] },
    ],
    quiet: "Optics telemetry shows one segment out of line. You'd need eyes or heat on it to know why.",
  },
  mast: {
    id: "mast",
    name: "Sensor mast",
    what: "The station's old recordings: the logbook.",
    hazard: "Corrupted files.",
    far: true,
    nearHub: false,
    damaged: false,
    real: "Like a black box",
    finds: [
      { what: "C3", methods: ["download", "eva"] },
      { what: "C4", methods: ["download", "eva"], confirmWith: ["lidar", "radar"] },
    ],
    quiet: "Nothing you can read from out here. The logs need a download.",
  },
};

export const ZONE_ORDER: ZoneId[] = ["dock", "spine", "radiators", "kiln", "petals", "mast"];

export interface Clue {
  id: ClueId;
  name: string;
  where: string;
  foundWith: string;
  points: number;
  shows: string;
}

export const CLUES: Record<ClueId, Clue> = {
  C1: {
    id: "C1",
    name: "Cracked segment 7",
    where: "The Petals",
    foundWith: "Camera, drone, arm or EVA",
    points: 15,
    shows: "A broken mirror can focus light far too tightly.",
  },
  C2: {
    id: "C2",
    name: "Burn scar / heat bloom",
    where: "The Petals",
    foundWith: "Thermal IR only",
    points: 15,
    shows: "Light was concentrated on one spot.",
  },
  C3: {
    id: "C3",
    name: "Vapour cloud record",
    where: "Sensor mast",
    foundWith: "Download",
    points: 10,
    shows: "Something boiled off the ice.",
  },
  C4: {
    id: "C4",
    name: "Path mismatch",
    where: "Sensor mast",
    foundWith: "Download, confirmed with lidar or radar",
    points: 20,
    shows: "The ice left on a different path.",
  },
  C5: {
    id: "C5",
    name: "Second sighting",
    where: "Distress crew's log",
    foundWith: "Only if you helped them",
    points: 10,
    shows: "It happened twice, so it's not a fluke.",
  },
  C6: {
    id: "C6",
    name: "Your test result",
    where: "The test",
    foundWith: "Beam + your best sensor",
    points: 30,
    shows: "Direct proof, with a measured number.",
  },
};

export const CLUE_IDS = Object.keys(CLUES) as ClueId[];

export interface Hazard {
  id: HazardId;
  name: string;
  zone: ZoneId;
  text: string;
  fix: string;
  real: string;
}

export const HAZARDS: Record<HazardId, Hazard> = {
  leak: {
    id: "leak",
    name: "Coolant leak",
    zone: "radiators",
    text: "Ammonia is leaking from a radiator loop. The reactor will shut itself down at hour 20.",
    fix: "Patch it: EVA or arm, 1.5 h. Stops the reactor clock.",
    real: "ISS ammonia coolant loops have leaked and needed spacewalks to isolate and fix.",
  },
  drift: {
    id: "drift",
    name: "Attitude drift",
    zone: "spine",
    text: "A failed gyro wheel lets the station slowly turn, so its beam slides off the collector field.",
    fix: "Fix it: EVA, 1 h. Cities get 15 points more light.",
    real: "Reaction wheels failed on Kepler (2012), Dawn (2010), Hayabusa and FUSE.",
  },
};

export interface Hypothesis {
  id: HypId;
  name: string;
  text: string;
  ruledOutBy: string;
}

export const HYPOTHESES: Record<HypId, Hypothesis> = {
  H1: {
    id: "H1",
    name: "Sensor error",
    text: "The obvious guess.",
    ruledOutBy: "Two different sensors agreeing (C3 + C4), or your own test (C6).",
  },
  H2: {
    id: "H2",
    name: "Something else hit it",
    text: "Another object knocked the ice off course.",
    ruledOutBy: "The thermal camera's record (C2: no impact flash) and a lidar or radar sweep (no other object).",
  },
  H3: {
    id: "H3",
    name: "The light pushed the ice",
    text: "The cracked mirror focused enough light to boil the ice and push it.",
    ruledOutBy: "It can't be. It's supported by C1 + C2, and proven by C6.",
  },
};

export interface Settlement {
  id: SettlementId;
  name: string;
  reserveH: number;
  note: string;
}

export const SETTLEMENTS: Record<SettlementId, Settlement> = {
  emberHollow: { id: "emberHollow", name: "Ember Hollow", reserveH: 16, note: "Farm district. First to fail." },
  greywell: { id: "greywell", name: "Greywell", reserveH: 28, note: "Main city." },
  marrowDeep: { id: "marrowDeep", name: "Marrow Deep", reserveH: 36, note: "Mining town." },
  lowlight: { id: "lowlight", name: "Lowlight", reserveH: 48, note: "Best reserves." },
};

export const SETTLEMENT_IDS = Object.keys(SETTLEMENTS) as SettlementId[];

export const PACKETS = {
  summary: { id: "summary", name: "Summary", mb: 20, contains: "Findings + the Lantern Defense Protocol." },
  core: { id: "core", name: "Core", mb: 200, contains: "+ the test measurements. Needed to be believed." },
  full: { id: "full", name: "Full", mb: 2000, contains: "+ video and every log. Convinces more stations." },
} as const;

export const CHOICES = {
  A: {
    id: "A",
    name: "Fix the mirror",
    sub: "Swap all cracked segments",
    happens: "Lantern 17 back to full light. Cities recover.",
    cost: "The focusing effect is gone. No deflection. The test can't be repeated.",
  },
  B: {
    id: "B",
    name: "Keep it broken, beam now",
    sub: "Start the deflection",
    happens: "Lantern 17's whole head turns on the ice for as long as you stay to guide it.",
    cost: "Cities dark the whole time. Ember Hollow fails. It may be too late anyway.",
  },
  C: {
    id: "C",
    name: "The clever middle",
    sub: "Needs spare optics",
    happens:
      "Replace every other cracked segment and keep segment 7 cracked, aimed on its own (like JWST segments). Lantern 17 back to about 80% light, and you still hold the weapon, at half strength.",
    cost: "+2 h of work, spare optics and EVA or arm time.",
  },
  D: {
    id: "D",
    name: "Don't decide alone",
    sub: "Send the protocol",
    happens: "Leave the mirror as it is, and send everything you have so the network decides.",
    cost: "The outcome depends on what you send.",
  },
  E: {
    id: "E",
    name: "Walk away",
    sub: "Leave now",
    happens: "Leave now with what you have.",
    cost: "Lantern 17's fate is left to whatever comes next.",
  },
} as const;

export const STATION_SOURCE: Source = "fiction";
