import type { Source } from "./constants";

export type HullId = "courier" | "tender" | "hauler";
export type EngineId = "biprop" | "cluster" | "green" | "cryo" | "ion";
export type PowerId = "fuelcells" | "battery" | "reactor";
export type ShieldId = "none" | "light" | "heavy";
export type SensorId = "camera" | "thermal" | "lidar" | "radar";
export type CommsId = "radio" | "dish" | "laser" | "relay";
export type KitId = "eva" | "drones" | "arm" | "optics";
export type AddonId = "rtg" | "tap";
export type SuitId = "soft" | "hard";
export type MobilityId = "tether" | "jetpack";
export type RouteId = "safe" | "quick" | "fastOut" | "fastBoth" | "skipWindow";
export type EventId = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8";
export type ZoneId = "dock" | "spine" | "radiators" | "kiln" | "petals" | "mast";
export type Method = "download" | "scan" | "drone" | "arm" | "eva";
export type ClueId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
export type HazardId = "leak" | "drift";
export type FindId = ClueId | HazardId;
export type HypId = "H1" | "H2" | "H3";
export type ChoiceId = "A" | "B" | "C" | "D" | "E";
export type PacketId = "summary" | "core" | "full";
export type SettlementId = "emberHollow" | "greywell" | "marrowDeep" | "lowlight";
export type EndingId =
  | "somethingInTheDark"
  | "firstLight"
  | "firstLightStranded"
  | "dismissed"
  | "filedUnread"
  | "homeSafe"
  | "savedButStranded"
  | "lantern17Lost";

export type Phase = "briefing" | "hangar" | "route" | "journey" | "station" | "choice" | "endgame" | "debrief";

export interface Loadout {
  hull: HullId;
  engine: EngineId;
  power: PowerId;
  shield: ShieldId;
  sensors: SensorId[];
  comms: CommsId;
  kit: KitId[];
  addons: AddonId[];
  suit: SuitId;
  mobility: MobilityId;
  fuelKg: number;
}

export type Action =
  | { type: "begin" }
  | { type: "hull"; id: HullId }
  | { type: "engine"; id: EngineId }
  | { type: "power"; id: PowerId }
  | { type: "shield"; id: ShieldId }
  | { type: "comms"; id: CommsId }
  | { type: "sensor"; id: SensorId }
  | { type: "kit"; id: KitId }
  | { type: "addon"; id: AddonId }
  | { type: "suit"; id: SuitId }
  | { type: "mobility"; id: MobilityId }
  | { type: "fuel"; kg: number }
  | { type: "launch" }
  | { type: "route"; id: RouteId; piloted?: boolean }
  /** Piloted flight: what the pilot spent beyond the flight computer's ideal, time flown, hull damage. */
  | { type: "flight"; dv: number; hours: number; hull: number; note?: string }
  /** Piloted flight: contact with Lantern 17's docking port. */
  | { type: "dock"; dv: number; hours: number; hull: number; speed: number }
  | { type: "card"; choice: string }
  | { type: "survey" }
  | { type: "inspect"; zone: ZoneId; method: Method }
  | { type: "repair"; repair: HazardId; method: "eva" | "arm" }
  | { type: "crossOut"; hyp: HypId }
  | { type: "test" }
  | { type: "toChoice" }
  | { type: "choose"; option: ChoiceId; method?: "eva" | "arm" }
  | { type: "broadcast"; packet: PacketId }
  | { type: "stay"; hours: number }
  | { type: "depart" };

export interface Delta {
  dv?: number;
  fuelKg?: number;
  hours?: number;
  kwh?: number;
  evidence?: number;
  hull?: number;
  credits?: number;
}

export type LedgerKind = "choice" | "event" | "alarm" | "notice";

export interface LedgerEntry {
  n: number;
  t: number;
  phase: Phase;
  kind: LedgerKind;
  title: string;
  text: string;
  delta?: Delta;
}

export interface TestResult {
  t: number;
  sensor: SensorId;
  bandPct: number;
  trueCmS: number;
  measuredCmS: number;
}

export interface Broadcast {
  packet: PacketId;
  t: number;
  hours: number;
  arriveT: number;
  eclipse: boolean;
  believed: boolean;
  lanterns: number;
  joinT: number | null;
  /** Why the network didn't believe it (empty when believed). */
  reason: string;
  replied: boolean;
}

export type DvCategory = "route" | "events" | "docking" | "distress" | "return";
export type EnergyCategory = "life" | "heaters" | "sensors" | "comms";

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  phase: Phase;
  /** Mission hours since the briefing. */
  t: number;
  loadout: Loadout;

  // Ship
  launched: boolean;
  fuelKg: number;
  energyKwh: number;
  hull: number;
  lostSensors: SensorId[];
  drones: number;
  droneHours: number;
  evaHours: number;
  jetpackDv: number;
  doseMsv: number;

  // Journey
  route: RouteId | null;
  deck: EventId[];
  card: number;
  dockDelayH: number;
  /** The flight is split into equal legs so time passes between event cards. */
  flightSegH: number;
  flightLeftH: number;
  /** The player flies the route on the flight deck: time, extra Δv and docking come from the flight. */
  piloted: boolean;
  helped: boolean;
  evidencePenalty: number;

  // Station
  arrivedT: number | null;
  docked: boolean;
  surveyed: boolean;
  zonesKnown: ZoneId[];
  done: string[];
  found: FindId[];
  crossed: HypId[];
  leakPatched: boolean;
  driftFixed: boolean;
  reactorOnline: boolean;
  reactorShutdownT: number | null;
  spareSegments: number;
  mirror: "cracked" | "fixed" | "middle";
  test: TestResult | null;
  iceRevealed: boolean;
  iceRevealedBy: "radar" | "director" | null;
  /** The impact hour has been written to the ledger (it must appear exactly once). */
  impactLogged: boolean;

  // Decision and endgame
  choice: ChoiceId | null;
  choiceT: number | null;
  mustBroadcast: boolean;
  broadcast: Broadcast | null;
  departed: boolean;
  departT: number | null;
  homeT: number | null;
  crewHome: boolean | null;
  strandedReason: string | null;
  adrift: boolean;
  aboard: boolean;

  // World
  settlements: Record<SettlementId, number>;
  ice: { shiftKm: number; velKmH: number };
  beamHoursL17: number;

  // Stats for the debrief
  stats: {
    dvUsed: Record<DvCategory, number>;
    energyUsed: Record<EnergyCategory, number>;
    minEnergyFrac: number;
    lowEnergyHours: number;
    phaseHours: Partial<Record<Phase, number>>;
    track: { t: number; dvLeft: number; energy: number; evidence: number }[];
  };

  log: LedgerEntry[];
  outcome: Outcome | null;
}

export interface SettlementResult {
  id: SettlementId;
  startH: number;
  endH: number;
  failed: boolean;
}

export interface Outcome {
  ending: EndingId;
  sent: boolean;
  sentOnTime: boolean;
  believed: boolean;
  stationSurvived: boolean;
  stationLostBy: "reactor" | "ice" | null;
  iceShiftKm: number;
  crewHome: boolean;
  strandedReason: string | null;
  evidence: number;
  cluesFound: ClueId[];
  bandPct: number | null;
  settlements: SettlementResult[];
  doseMsv: number;
  hull: number;
  dvLeft: number;
}

/** A row in any data table. Every part, card and route carries its source so the UI can tag it. */
export interface Sourced {
  source: Source;
  anchor?: string;
}
