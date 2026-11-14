/**
 * Every fixed number the mission runs on, in one place.
 *
 * Each value is tagged with where it comes from, the same three tags the Game Systems Handbook uses:
 *   real    measured hardware or real physics
 *   game    our own number, chosen for balance
 *   fiction story world, not real
 *
 * Change a balance number here and every screen, test and report follows.
 */

export type Source = "real" | "game" | "fiction";

/** Standard gravity, used to turn Isp into exhaust velocity (NASA Glenn, ideal rocket equation). real */
export const G0 = 9.80665;

/** Design margin added to dry mass and to every Δv plan (the Engineering Brief's convention). real practice */
export const MARGIN = 0.1;

/** Credits each crew can spend in the hangar. game */
export const BUDGET = 100;

export const CREW = 2;

/** Life support + computers, always on. game */
export const BASE_LOAD_KW = 3;

/** Planet and orbits. The planet uses Earth's size and gravity so the orbital numbers are real ones. */
export const PLANET = {
  radiusKm: 6371,
  mu: 398600, // km³/s²
  wickAltKm: 300,
  lanternAltKm: 1000,
} as const;

/** The two clocks. */
export const CLOCKS = {
  /** What the briefing says. fiction */
  iceBriefedH: 36,
  /** When the ice really arrives. Radar shows it at the survey; otherwise the Director calls it in. fiction */
  iceTrueH: 30,
  /** The ammonia leak forces a reactor safety shutdown at this hour unless it is patched. fiction */
  reactorH: 20,
  /** If nobody has worked out the true impact time by now, the Director calls it in. game */
  directorRevealH: 24,
  /** The crew must be clear of the station this long before impact. game */
  evacuateBeforeImpactH: 0.5,
} as const;

/** The network dims for 6 of every 24 hours. Mission hour 8 is when the next one starts. fiction */
export const ECLIPSE = { startH: 8, lengthH: 6, periodH: 24, commsFactor: 0.25 } as const;

/** Radiation. Deep space from Curiosity's RAD (real); the Kiln dose is a game value. */
export const RADIATION = { deepSpaceMsvPerDay: 1.8, kilnMsvPerH: 5, careerLimitMsv: 600 } as const;

/** Lantern 17's light. 3 cracked segments × 13 points = the briefing's 61%. game */
export const LANTERN = {
  startOutputPct: 61,
  crackedSegments: 3,
  segmentLossPct: 13,
  driftPenaltyPct: 15,
  middleOutputPct: 80,
  tapPenaltyPct: 3,
} as const;

/**
 * The station-killer. A 100 m ice fragment, a 1 MW beam pushing it with 50 N.
 * Shift grows with beam time squared; orbits multiply the drift about 3× (Engineering Brief, Section C).
 */
export const ICE = {
  massKg: 2.8e8,
  diameterM: 100,
  beamForceN: 50,
  orbitFactor: 3,
  missKm: 1.5,
} as const;

/** One unit of beam force = Lantern 17's whole cracked head in focus mode (option B). */
export const BEAM_UNITS = { B: 1, C: 0.5, networkLantern: 0.5 } as const;

/** What happens when the network believes you. game */
export const NETWORK = { lanternsCore: 3, lanternsFull: 5, joinDelayH: 1 } as const;

/** The controlled test: a 1 m ice block, a 10 kW beam for 60 s. Push per watt from ablation lab work. */
export const TEST = {
  blockKg: 482,
  beamKw: 10,
  pushMicroNPerW: 50,
  burnS: 60,
  hours: 2,
  darkHours: 1,
} as const;

/** To be believed: enough evidence, and a measurement tight enough to trust. game */
export const BELIEF = { minEvidence: 80, maxBandPct: 15 } as const;

/** Docking, station-keeping and the home dock, each 20 m/s (Engineering Brief, Section C). */
export const DOCK_DV = 20;
export const STATION_KEEP_DV = 20;
/** Without lidar the station's drift makes docking slower and costlier. game */
export const BLIND_DOCK = { dv: 15, hours: 0.25 } as const;

/** Inspection and repair times, in hours. Download, drone, arm and EVA from the handbook; scan is ours. */
export const METHOD_HOURS = { download: 1 / 6, scan: 1 / 3, drone: 0.25, arm: 0.75, eva: 1 } as const;
export const PENALTY_H = {
  /** Tether can't reach the far zones without rigging a line along the truss. game */
  tetherFar: 0.5,
  /** Canadarm2-style arm walks end over end to reach the far zones. game */
  armWalk: 0.5,
  /** Hard suits are safer and slower. game */
  hardSuit: 0.5,
  /** The Petals are blinding in daylight. game */
  daylightPetals: 0.5,
} as const;

export const REPAIR_HOURS = { leak: 1.5, drift: 1 } as const;
export const SURVEY = { hours: 0.5, kwh: 2 } as const;
export const MIRROR_WORK_H = { A: 1.5, C: 2 } as const;
export const MIRROR_SEGMENTS_NEEDED = { A: 3, C: 2 } as const;

/** Suits and drones. EMU ~8 h of air (real, rounded); SAFER ~3 m/s (real). */
export const EVA_AIR_H = 8;
export const DRONE_BATTERY_H = 3;
export const JETPACK_DV = 3;

/** Cryogenic fuel boils away. game */
export const BOILOFF = { fraction: 0.02, everyH: 6 } as const;
