/**
 * The mission engine. One rule for every click (Build Guide, section 3):
 *   1. check the phase and the resources,  2. update one state object,  3. write a readable log line,
 *   4. hand back the new state,  5. only move on when allowed. A rejected click says why and changes nothing.
 *
 * step() is pure: it never touches the state you pass in. A run is a seed plus a list of actions,
 * so any mission can be replayed exactly (the debrief's ledger, "Replay with one change", the ghost run).
 */
import {
  BEAM_UNITS,
  BELIEF,
  BLIND_DOCK,
  BOILOFF,
  CLOCKS,
  DRONE_BATTERY_H,
  ECLIPSE,
  EVA_AIR_H,
  JETPACK_DV,
  LANTERN,
  METHOD_HOURS,
  MIRROR_SEGMENTS_NEEDED,
  MIRROR_WORK_H,
  NETWORK,
  PENALTY_H,
  RADIATION,
  REPAIR_HOURS,
  SURVEY,
  TEST,
  BASE_LOAD_KW,
} from "./constants";
import { CHOICES, CLUES, HAZARDS, PACKETS, SETTLEMENTS, SETTLEMENT_IDS, ZONES, ZONE_ORDER } from "./data/station";
import { ADDONS, COMMS, ENGINES, HULLS, KIT, MOBILITY, POWER, SENSORS, SHIELDS, SUITS } from "./data/ship";
import { EVENTS, EVENT_IDS, type CardChoice } from "./data/events";
import { ROUTES, routeTotals } from "./data/routes";
import { ENDINGS } from "./data/endings";
import { bestBand, defaultLoadout, heaterKw, loadoutStats } from "./loadout";
import { deltaV, fuelForDeltaV, iceAccelKmPerH2, testPushCmS, transferHours } from "./physics";
import { nextRandom, seedFrom } from "./rng";
import type {
  Action,
  ClueId,
  Delta,
  DvCategory,
  EnergyCategory,
  EventId,
  FindId,
  GameState,
  LedgerEntry,
  LedgerKind,
  Method,
  Outcome,
  RouteId,
  SensorId,
  SettlementId,
  ZoneId,
} from "./types";

// ───────────────────────────── setup ─────────────────────────────

export function createGame(seed = 1): GameState {
  const loadout = defaultLoadout();
  const settlements = Object.fromEntries(SETTLEMENT_IDS.map((id) => [id, SETTLEMENTS[id].reserveH])) as Record<
    SettlementId,
    number
  >;
  return {
    version: 1,
    seed,
    rng: seedFrom(seed),
    phase: "briefing",
    t: 0,
    loadout,
    launched: false,
    fuelKg: loadout.fuelKg,
    energyKwh: POWER[loadout.power].capacityKwh,
    hull: 100,
    lostSensors: [],
    drones: 0,
    droneHours: 0,
    evaHours: 0,
    jetpackDv: 0,
    doseMsv: 0,
    route: null,
    deck: [],
    card: 0,
    dockDelayH: 0,
    flightSegH: 0,
    flightLeftH: 0,
    piloted: false,
    helped: false,
    evidencePenalty: 0,
    arrivedT: null,
    docked: false,
    surveyed: false,
    zonesKnown: [],
    done: [],
    found: [],
    crossed: [],
    leakPatched: false,
    driftFixed: false,
    reactorOnline: true,
    reactorShutdownT: null,
    spareSegments: 0,
    mirror: "cracked",
    test: null,
    iceRevealed: false,
    iceRevealedBy: null,
    impactLogged: false,
    choice: null,
    choiceT: null,
    mustBroadcast: false,
    broadcast: null,
    departed: false,
    departT: null,
    homeT: null,
    crewHome: null,
    strandedReason: null,
    adrift: false,
    aboard: false,
    settlements,
    ice: { shiftKm: 0, velKmH: 0 },
    beamHoursL17: 0,
    stats: {
      dvUsed: { route: 0, events: 0, docking: 0, distress: 0, return: 0 },
      energyUsed: { life: 0, heaters: 0, sensors: 0, comms: 0 },
      minEnergyFrac: 1,
      lowEnergyHours: 0,
      phaseHours: {},
      track: [],
    },
    log: [
      {
        n: 1,
        t: 0,
        phase: "briefing",
        kind: "event",
        title: "Mission order: priority one",
        text: "Lantern 17 is failing. Find out what's wrong. Fix what you can. Bring the data home.",
      },
    ],
    outcome: null,
  };
}

// ───────────────────────────── step ─────────────────────────────

export type StepResult =
  | { ok: true; state: GameState; entries: LedgerEntry[] }
  | { ok: false; state: GameState; reason: string };

class Rejection extends Error {}
function no(reason: string): never {
  throw new Rejection(reason);
}

export function step(state: GameState, action: Action): StepResult {
  const s = structuredClone(state);
  const before = s.log.length;
  try {
    apply(s, action);
    afterAction(s);
  } catch (e) {
    if (e instanceof Rejection) return { ok: false, state, reason: e.message };
    throw e;
  }
  return { ok: true, state: s, entries: s.log.slice(before) };
}

/** Replay a run from its seed and action list. Rejected actions are skipped and reported. */
export function replay(seed: number, actions: Action[]) {
  let state = createGame(seed);
  const rejected: { index: number; action: Action; reason: string }[] = [];
  actions.forEach((action, index) => {
    const r = step(state, action);
    if (r.ok) state = r.state;
    else rejected.push({ index, action, reason: r.reason });
  });
  return { state, rejected };
}

// ───────────────────────────── selectors ─────────────────────────────

export function shipDryKg(s: GameState): number {
  return loadoutStats(s.loadout).dryKg;
}

export function isp(s: GameState): number {
  return ENGINES[s.loadout.engine].isp;
}

export function dvLeft(s: GameState): number {
  return deltaV(isp(s), shipDryKg(s), s.fuelKg);
}

export function energyCap(s: GameState): number {
  return POWER[s.loadout.power].capacityKwh;
}

export function hasSensor(s: GameState, id: SensorId): boolean {
  return s.loadout.sensors.includes(id) && !s.lostSensors.includes(id);
}

export function evidence(s: GameState): number {
  const pts = s.found.reduce((n, f) => n + (f in CLUES ? CLUES[f as ClueId].points : 0), 0);
  return Math.max(0, Math.min(100, pts - s.evidencePenalty));
}

export function cluesFound(s: GameState): ClueId[] {
  return s.found.filter((f): f is ClueId => f in CLUES);
}

export function isEclipse(t: number): boolean {
  const x = (((t - ECLIPSE.startH) % ECLIPSE.periodH) + ECLIPSE.periodH) % ECLIPSE.periodH;
  return x < ECLIPSE.lengthH - 1e-9;
}

export function deadline(): number {
  return CLOCKS.iceTrueH - CLOCKS.evacuateBeforeImpactH;
}

/** Light output of Lantern 17's mirror, before drift and taps. */
export function mirrorOutputPct(s: GameState): number {
  if (s.mirror === "fixed") return 100;
  if (s.mirror === "middle") return LANTERN.middleOutputPct;
  return LANTERN.startOutputPct;
}

function tapActive(s: GameState): boolean {
  return s.loadout.addons.includes("tap") && s.docked && !s.departed && s.reactorOnline;
}

/** How much of Lantern 17's light reaches the collector fields, 0–100. */
export function deliveredLightPct(s: GameState, dark = false): number {
  if (!s.reactorOnline || dark) return 0;
  if (s.choice === "B" && s.docked && !s.departed) return 0;
  let out = mirrorOutputPct(s);
  if (!s.driftFixed) out -= LANTERN.driftPenaltyPct;
  if (tapActive(s)) out -= LANTERN.tapPenaltyPct;
  return Math.max(0, Math.min(100, out));
}

/** Beam force on the big ice right now, in units of Lantern 17's whole cracked head. */
export function beamUnits(s: GameState, t = s.t): { l17: number; network: number } {
  let l17 = 0;
  if (s.reactorOnline && s.docked && !s.departed) {
    if (s.choice === "B") l17 = BEAM_UNITS.B;
    else if (s.choice === "C") l17 = BEAM_UNITS.C;
  }
  const b = s.broadcast;
  const network = b && b.believed && b.joinT !== null && t >= b.joinT ? b.lanterns * BEAM_UNITS.networkLantern : 0;
  return { l17, network };
}

/** What the HUD's ice clock shows: hours to the impact the player currently believes in. */
export function iceClock(s: GameState): number {
  return (s.iceRevealed ? CLOCKS.iceTrueH : CLOCKS.iceBriefedH) - s.t;
}

/** The reactor clock only exists once the leak has been found, and stops when it's patched. */
export function reactorClock(s: GameState): number | null {
  if (!s.found.includes("leak") || s.leakPatched || !s.reactorOnline) return null;
  return CLOCKS.reactorH - s.t;
}

export function testUnlocked(s: GameState): boolean {
  const pinned = (["C1", "C2", "C3", "C4"] as ClueId[]).filter((c) => s.found.includes(c)).length;
  return pinned >= 2 && (s.crossed.includes("H1") || s.crossed.includes("H2"));
}

export function returnCostDv(s: GameState): number {
  if (!s.route) return 0;
  const t = routeTotals(s.route);
  return s.docked ? t.backDv : t.backDv - 20;
}

// ───────────────────────────── internals ─────────────────────────────

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const whole = Math.floor(h + 1e-9);
  const min = Math.round((h - whole) * 60);
  return min === 0 ? `${whole} h` : `${whole} h ${min} min`;
}

function log(s: GameState, kind: LedgerKind, title: string, text: string, delta?: Delta) {
  s.log.push({ n: s.log.length + 1, t: Math.round(s.t * 100) / 100, phase: s.phase, kind, title, text, delta });
}

function random(s: GameState): number {
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return v;
}

function requireDv(s: GameState, dv: number) {
  const have = dvLeft(s);
  if (have + 1e-6 < dv) no(`Need ${r0(dv)} m/s, you have ${r0(have)}.`);
}

function requireEnergy(s: GameState, kwh: number) {
  if (s.energyKwh + 1e-9 < kwh) no(`Need ${r1(kwh)} kWh, you have ${r1(s.energyKwh)}.`);
}

function requireTime(s: GameState, hours: number) {
  const left = deadline() - s.t;
  if (hours > left + 1e-9)
    no(
      `Not enough time: that takes ${fmtHours(hours)}, and you must be clear of the station in ${fmtHours(Math.max(0, left))}.`,
    );
}

/** Burn fuel for a Δv change through the rocket equation. Returns false if the tank ran dry first. */
function burn(s: GameState, dv: number, category: DvCategory): { ok: boolean; achieved: number; fuelKg: number } {
  if (dv <= 0) return { ok: true, achieved: 0, fuelKg: 0 };
  const need = fuelForDeltaV(isp(s), shipDryKg(s), s.fuelKg, dv);
  if (need <= s.fuelKg + 1e-9) {
    s.fuelKg = Math.max(0, s.fuelKg - need);
    s.stats.dvUsed[category] += dv;
    return { ok: true, achieved: dv, fuelKg: need };
  }
  const achieved = dvLeft(s);
  const fuelKg = s.fuelKg;
  s.fuelKg = 0;
  s.stats.dvUsed[category] += achieved;
  return { ok: false, achieved, fuelKg };
}

function revealIce(s: GameState, by: "radar" | "director") {
  if (s.iceRevealed) return;
  s.iceRevealed = true;
  s.iceRevealedBy = by;
  const left = CLOCKS.iceTrueH - s.t;
  log(
    s,
    "alarm",
    "The ice is early",
    by === "radar"
      ? `Your radar has the fragment moving faster than it was tracked. Impact is at hour ${CLOCKS.iceTrueH}, not ${CLOCKS.iceBriefedH}: ${fmtHours(left)} from now.`
      : `Director: “New tracking data. The fragment is faster than we thought. Impact at hour ${CLOCKS.iceTrueH}.” That's ${fmtHours(Math.max(0, left))} from now.`,
  );
}

interface AdvanceOpts {
  /** Lantern 17's light is off the cities (the test beam). */
  dark?: boolean;
  /** Extra electrical load while this runs, kW. */
  extraKw?: number;
  extraCategory?: EnergyCategory;
}

/**
 * Let time pass, minute by minute: energy, heaters, boil-off, radiation, the settlements' reserves,
 * the reactor clock, the Eclipse, the network's reply and the push on the ice.
 */
function advance(s: GameState, hours: number, opts: AdvanceOpts = {}) {
  if (hours <= 1e-9) return;
  const l = s.loadout;
  const power = POWER[l.power];
  const heat = heaterKw(l);
  const rtgKw = l.addons.includes("rtg") ? 0.11 : 0;
  const boils = ENGINES[l.engine].boiloff;
  const cap = power.capacityKwh;
  const steps = Math.max(1, Math.ceil(hours * 60));
  const dt = hours / steps;

  for (let i = 0; i < steps; i++) {
    const t = s.t;

    if (s.launched && s.reactorOnline && !s.leakPatched && t >= CLOCKS.reactorH - 1e-9) {
      s.reactorOnline = false;
      s.reactorShutdownT = t;
      log(
        s,
        "alarm",
        "Reactor safety shutdown",
        s.found.includes("leak")
          ? "The coolant leak was never patched. The reactor shuts itself down and Lantern 17 goes dark. All four settlements drain, and the beam can't fire."
          : "Coolant pressure hits zero: an ammonia leak nobody found. The reactor shuts itself down and Lantern 17 goes dark.",
      );
    }
    if (s.launched && !s.iceRevealed && t >= CLOCKS.directorRevealH - 1e-9) revealIce(s, "director");

    const eclipseNow = isEclipse(t);
    if (s.launched && eclipseNow !== isEclipse(t - dt) && t <= CLOCKS.iceTrueH) {
      log(
        s,
        "event",
        eclipseNow ? "The Eclipse begins" : "The Eclipse ends",
        eclipseNow
          ? "The whole network dims for six hours. The cities run on their scheduled stores, comms relays slow to a quarter, and the mirrors cool."
          : "The Lanterns brighten. Every hour Lantern 17 is dark now costs the cities again.",
      );
    }

    if (s.aboard) {
      const extra = opts.extraKw ?? 0;
      const load = BASE_LOAD_KW + heat - rtgKw + extra;
      const gain = power.regenKw + (tapActive(s) ? 10 : 0);
      s.energyKwh = Math.min(cap, s.energyKwh + (gain - load) * dt);
      s.stats.energyUsed.life += BASE_LOAD_KW * dt;
      s.stats.energyUsed.heaters += Math.max(0, heat - rtgKw) * dt;
      if (extra) s.stats.energyUsed[opts.extraCategory ?? "sensors"] += extra * dt;
      if (s.energyKwh <= 0) s.energyKwh = 0;
      const frac = s.energyKwh / cap;
      s.stats.minEnergyFrac = Math.min(s.stats.minEnergyFrac, frac);
      if (frac < 0.1) s.stats.lowEnergyHours += dt;
      if (boils) s.fuelKg *= Math.pow(1 - BOILOFF.fraction, dt / BOILOFF.everyH);
      s.doseMsv += (RADIATION.deepSpaceMsvPerDay / 24) * dt;
    }

    if (s.launched && !eclipseNow) {
      const drain = 1 - deliveredLightPct(s, opts.dark) / 100;
      for (const id of SETTLEMENT_IDS) s.settlements[id] = Math.max(0, s.settlements[id] - drain * dt);
    }

    if (t < CLOCKS.iceTrueH) {
      const { l17, network } = beamUnits(s, t);
      const a = iceAccelKmPerH2(l17 + network);
      const h = Math.min(dt, CLOCKS.iceTrueH - t);
      s.ice.shiftKm += s.ice.velKmH * h + 0.5 * a * h * h;
      s.ice.velKmH += a * h;
      if (l17 > 0) s.beamHoursL17 += h;
    }

    s.t = t + dt;
    if (s.launched && t < CLOCKS.iceTrueH && s.t >= CLOCKS.iceTrueH - 1e-9) logImpact(s);
    s.stats.phaseHours[s.phase] = (s.stats.phaseHours[s.phase] ?? 0) + dt;

    const b = s.broadcast;
    if (b && !b.replied && s.t >= b.arriveT - 1e-9) networkReply(s);
  }
}

/** The moment the ice arrives, written into the ledger in its true place in time. */
function logImpact(s: GameState) {
  if (s.impactLogged) return;
  s.impactLogged = true;
  const lostBy = !s.reactorOnline ? "reactor" : s.ice.shiftKm < 1.5 ? "ice" : null;
  log(
    s,
    lostBy ? "alarm" : "event",
    "Impact hour",
    lostBy === "reactor"
      ? `The ice arrives. Lantern 17 has been dark since its reactor shut down at hour ${r1(s.reactorShutdownT ?? CLOCKS.reactorH)}.`
      : lostBy === null
        ? `The ice passes ${r1(s.ice.shiftKm)} km off its old path, wide of Lantern 17.`
        : `The ice had moved ${r1(s.ice.shiftKm)} km of the 1.5 km it needed. It hits Lantern 17.`,
  );
}

function networkReply(s: GameState) {
  const b = s.broadcast!;
  b.replied = true;
  if (b.arriveT > CLOCKS.iceTrueH + 1e-9) {
    log(s, "event", "Packet arrived after impact", "The network received your data after the ice had already arrived.");
    return;
  }
  if (b.believed) {
    log(
      s,
      "event",
      "Network: data received",
      `LANTERN 4 … DATA RECEIVED · REPLICATING. LANTERN 11 … REPLICATING. ${b.lanterns} stations adopt the Lantern Defense Protocol and will turn outward within the hour.`,
    );
  } else {
    log(s, "event", "Network: probably a sensor error", `Stations reply: “Probably a sensor error.” Why: ${b.reason}.`);
  }
}

// ───────────────────────────── the rules ─────────────────────────────

function apply(s: GameState, a: Action) {
  if (s.phase === "debrief") no("The mission is over. Start a new one to play again.");

  switch (a.type) {
    case "begin":
      if (s.phase !== "briefing") no("The briefing is already over.");
      s.phase = "hangar";
      log(s, "event", "The Wick", "You walk into the orbital dock at 300 km. Four bays, a readiness review, then the launch.");
      return;

    case "hull":
    case "engine":
    case "power":
    case "shield":
    case "comms":
    case "sensor":
    case "kit":
    case "addon":
    case "suit":
    case "mobility":
    case "fuel":
      return hangar(s, a);

    case "launch":
      return launch(s);

    case "route":
      return chooseRoute(s, a.id, a.piloted === true);

    case "flight":
      return pilotReport(s, a.dv, a.hours, a.hull, a.note);

    case "dock":
      return pilotDock(s, a.dv, a.hours, a.hull, a.speed);

    case "card":
      return playCard(s, a.choice);

    case "survey":
      return survey(s);

    case "inspect":
      return inspect(s, a.zone, a.method);

    case "repair":
      return repair(s, a.repair, a.method);

    case "crossOut":
      return crossOut(s, a.hyp);

    case "test":
      return runTest(s);

    case "toChoice":
      return toChoice(s);

    case "choose":
      return choose(s, a.option, a.method);

    case "broadcast":
      return broadcast(s, a.packet);

    case "stay":
      return stay(s, a.hours);

    case "depart":
      if (s.phase !== "endgame") no("You can only head home after the big choice.");
      if (s.mustBroadcast && !s.broadcast) no("You chose to let the network decide. Send the packet first.");
      return depart(s);
  }
}

// ── hangar ──

function hangar(s: GameState, a: Extract<Action, { type: "hull" | "engine" | "power" | "shield" | "comms" | "sensor" | "kit" | "addon" | "suit" | "mobility" | "fuel" }>) {
  if (s.phase !== "hangar") no(s.launched ? "The hangar is behind you: you've launched." : "Finish the briefing first.");
  const l = s.loadout;
  switch (a.type) {
    case "hull": {
      const hull = HULLS[a.id];
      if (!hull) no("Unknown hull.");
      const wasFull = l.fuelKg >= HULLS[l.hull].maxFuelKg - 1e-9;
      l.hull = a.id;
      l.fuelKg = wasFull ? hull.maxFuelKg : Math.min(l.fuelKg, hull.maxFuelKg);
      if (l.sensors.length > hull.sensorSlots) l.sensors = l.sensors.slice(0, hull.sensorSlots);
      log(s, "choice", `Hull: ${hull.name}`, hull.note);
      return;
    }
    case "engine": {
      const e = ENGINES[a.id];
      if (!e) no("Unknown engine.");
      if (e.locked) no(e.locked);
      l.engine = a.id;
      log(s, "choice", `Engine: ${e.name}`, `Isp ${e.isp} s. ${e.drawback}`);
      return;
    }
    case "power":
      if (!POWER[a.id]) no("Unknown power option.");
      l.power = a.id;
      log(s, "choice", `Power: ${POWER[a.id].name}`, POWER[a.id].gain);
      return;
    case "shield":
      if (!SHIELDS[a.id]) no("Unknown shield.");
      l.shield = a.id;
      log(s, "choice", `Shield: ${SHIELDS[a.id].name}`, SHIELDS[a.id].stops);
      return;
    case "comms":
      if (!COMMS[a.id]) no("Unknown comms.");
      l.comms = a.id;
      log(s, "choice", `Comms: ${COMMS[a.id].name}`, COMMS[a.id].drawback);
      return;
    case "sensor": {
      if (!SENSORS[a.id]) no("Unknown sensor.");
      if (l.sensors.includes(a.id)) {
        l.sensors = l.sensors.filter((x) => x !== a.id);
        log(s, "choice", `Removed: ${SENSORS[a.id].name}`, "");
        return;
      }
      const slots = HULLS[l.hull].sensorSlots;
      if (l.sensors.length >= slots)
        no(`The ${HULLS[l.hull].name} has ${slots} sensor slot${slots === 1 ? "" : "s"}. Take one out first.`);
      l.sensors = [...l.sensors, a.id];
      log(s, "choice", `Sensor: ${SENSORS[a.id].name}`, SENSORS[a.id].gain);
      return;
    }
    case "kit": {
      if (!KIT[a.id]) no("Unknown kit.");
      const on = !l.kit.includes(a.id);
      l.kit = on ? [...l.kit, a.id] : l.kit.filter((x) => x !== a.id);
      log(s, "choice", `${on ? "Packed" : "Unpacked"}: ${KIT[a.id].name}`, on ? KIT[a.id].detail : "");
      return;
    }
    case "addon": {
      if (!ADDONS[a.id]) no("Unknown add-on.");
      const on = !l.addons.includes(a.id);
      l.addons = on ? [...l.addons, a.id] : l.addons.filter((x) => x !== a.id);
      log(s, "choice", `${on ? "Fitted" : "Removed"}: ${ADDONS[a.id].name}`, on ? ADDONS[a.id].detail : "");
      return;
    }
    case "suit":
      if (!SUITS[a.id]) no("Unknown suit.");
      if (!l.kit.includes("eva")) no("Pack the EVA suits first.");
      l.suit = a.id;
      log(s, "choice", `Suit: ${SUITS[a.id].name}`, SUITS[a.id].drawback);
      return;
    case "mobility":
      if (!MOBILITY[a.id]) no("Unknown option.");
      if (!l.kit.includes("eva")) no("Pack the EVA suits first.");
      l.mobility = a.id;
      log(s, "choice", `Suit: ${MOBILITY[a.id].name}`, MOBILITY[a.id].drawback);
      return;
    case "fuel": {
      const max = HULLS[l.hull].maxFuelKg;
      if (!Number.isFinite(a.kg) || a.kg < 0) no("Fuel must be a positive number of kg.");
      if (a.kg > max) no(`The ${HULLS[l.hull].name} holds at most ${r0(max)} kg of fuel.`);
      l.fuelKg = Math.round(a.kg);
      log(s, "choice", `Fuel: ${r0(l.fuelKg)} kg`, "");
      return;
    }
  }
}

function launch(s: GameState) {
  if (s.phase !== "hangar") no("You can only launch from the hangar.");
  const st = loadoutStats(s.loadout);
  const block = st.flags.find((f) => f.level === "block");
  if (block) no(block.text);
  const l = s.loadout;
  s.launched = true;
  s.aboard = true;
  s.fuelKg = st.fuelKg;
  s.energyKwh = POWER[l.power].capacityKwh;
  s.drones = l.kit.includes("drones") ? 2 : 0;
  s.droneHours = s.drones ? DRONE_BATTERY_H : 0;
  s.evaHours = l.kit.includes("eva") ? EVA_AIR_H : 0;
  s.jetpackDv = l.kit.includes("eva") && l.mobility === "jetpack" ? JETPACK_DV : 0;
  s.spareSegments = l.kit.includes("optics") ? 6 : 0;
  const warns = st.flags.filter((f) => f.level === "warn");
  log(
    s,
    "choice",
    `Readiness review passed: ${HULLS[l.hull].name}`,
    `${r0(st.wetKg)} kg at launch, ${r0(st.fuelKg)} kg of it fuel. ${r0(st.dv)} m/s of Δv, ${st.credits} of 100 credits.` +
      (warns.length ? ` You launched with ${warns.length} red flag${warns.length === 1 ? "" : "s"}: ${warns.map((w) => w.text).join(" ")}` : " No red flags."),
    { credits: st.credits },
  );
  s.phase = "route";
}

// ── route and journey ──

function drawDeck(s: GameState): EventId[] {
  const l = s.loadout;
  const eligible = EVENT_IDS.filter((id) => {
    if (id === "E4") return false;
    const skip = EVENTS[id].skipIf;
    if (skip?.engine?.includes(l.engine)) return false;
    if (skip?.power?.includes(l.power)) return false;
    return true;
  });
  const pool = [...eligible];
  const picked: EventId[] = [];
  while (picked.length < 2 && pool.length) {
    const i = Math.floor(random(s) * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  const at = Math.floor(random(s) * (picked.length + 1));
  picked.splice(at, 0, "E4");
  return picked;
}

function chooseRoute(s: GameState, id: RouteId, piloted = false) {
  if (s.phase !== "route") no("The route is chosen at the launch gantry.");
  const route = ROUTES[id];
  if (!route) no("Unknown route.");
  const tot = routeTotals(id);
  const safe = routeTotals("safe");
  s.route = id;
  s.deck = drawDeck(s);
  s.card = 0;

  const before = dvLeft(s);
  const res = burn(s, tot.outDv, "route");
  const vsSafe =
    id === "safe"
      ? `The cheapest way up. Arrival in about ${fmtHours(tot.arriveH)}.`
      : `${r0(tot.totalDv - safe.totalDv)} m/s more than the safe route for the round trip, to arrive ${fmtHours(safe.arriveH - tot.arriveH)} earlier.`;
  if (!res.ok) {
    s.adrift = true;
    log(
      s,
      "alarm",
      `Took the ${route.name.toLowerCase()} route, and ran dry`,
      `It needed ${r0(tot.outDv)} m/s on the way out. You had ${r0(before)}. The tank empties ${r0(tot.outDv - res.achieved)} m/s short of Lantern 17, and you drift past it.`,
      { dv: -res.achieved, fuelKg: -res.fuelKg },
    );
    s.crewHome = false;
    s.strandedReason = `Out of Δv on the way out: needed ${r0(tot.outDv)} m/s, had ${r0(before)}.`;
    return depart(s, { stranded: true });
  }
  log(s, "choice", `Route: ${route.name}`, `${vsSafe} Burned ${r0(res.fuelKg)} kg of fuel for ${r0(tot.outDv)} m/s on the way out.`, {
    dv: -tot.outDv,
    fuelKg: -res.fuelKg,
    hours: tot.arriveH,
  });
  s.phase = "journey";
  if (piloted) {
    // The flight deck flies the route in real physics and reports time, extra burns and docking itself.
    s.piloted = true;
    s.flightSegH = 0;
    s.flightLeftH = 0;
    return;
  }
  // fly the first leg now; each event card is followed by the next leg, and the last leg ends at the dock
  s.flightSegH = tot.arriveH / (s.deck.length + 1);
  s.flightLeftH = tot.arriveH - s.flightSegH;
  advance(s, s.flightSegH);
}

/** Keep a number the flight deck sends inside a sane range (it is replayed from saved actions). */
function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
}

/** Apply what the flight deck measured: time flown, Δv beyond the computer's ideal, hull damage. */
function pilotApply(s: GameState, dvRaw: number, hoursRaw: number, hullRaw: number, category: DvCategory): boolean {
  const dv = clampNum(dvRaw, -200, 5000);
  const hours = clampNum(hoursRaw, 0, 48);
  const hull = Math.round(clampNum(hullRaw, 0, 100));
  advance(s, hours);
  if (hull) s.hull = Math.max(0, s.hull - hull);
  if (dv < 0) {
    // flown cheaper than the computer's plan: that fuel is still in the tank
    const dry = shipDryKg(s);
    const ve = isp(s) * 9.80665;
    s.fuelKg = Math.min(HULLS[s.loadout.hull].maxFuelKg, (dry + s.fuelKg) * Math.exp(-dv / ve) - dry);
    s.stats.dvUsed[category] = Math.max(0, s.stats.dvUsed[category] + dv);
    return true;
  }
  if (dv === 0) return true;
  const before = dvLeft(s);
  const b = burn(s, dv, category);
  if (b.ok) return true;
  s.adrift = true;
  log(
    s,
    "alarm",
    "The tank ran dry in flight",
    `The burns needed ${r0(dv)} m/s more and you had ${r0(before)}. With nothing left to brake, you drift past Lantern 17.`,
    { dv: -b.achieved, fuelKg: -b.fuelKg },
  );
  s.crewHome = false;
  s.strandedReason = `Out of Δv in flight: needed ${r0(dv)} m/s more, had ${r0(before)}.`;
  depart(s, { stranded: true });
  return false;
}

function pilotGuard(s: GameState) {
  if (s.phase !== "journey") no("You're not in flight.");
  if (!s.piloted) no("This flight is on autopilot.");
}

function pilotReport(s: GameState, dv: number, hours: number, hull: number, note?: string) {
  pilotGuard(s);
  if (!pilotApply(s, dv, hours, hull, "route")) return;
  const extra = clampNum(dv, -200, 5000);
  const hit = Math.round(clampNum(hull, 0, 100));
  if (Math.abs(extra) >= 0.5 || hit > 0) {
    const bits: string[] = [];
    if (extra >= 0.5) bits.push(`${r0(extra)} m/s more than the flight computer's ideal`);
    if (extra <= -0.5) bits.push(`${r0(-extra)} m/s less than the flight computer's ideal`);
    if (hit > 0) bits.push(`${hit} hull damage`);
    log(s, hit > 0 ? "alarm" : "notice", note?.slice(0, 80) || "Piloting", `${bits.join(", ")}.`, {
      ...(Math.abs(extra) >= 0.5 ? { dv: -extra } : {}),
      ...(hit > 0 ? { hull: -hit } : {}),
    });
  }
}

function pilotDock(s: GameState, dv: number, hours: number, hull: number, speed: number) {
  pilotGuard(s);
  if (s.card < s.deck.length) no("There are still events ahead on this flight.");
  if (!pilotApply(s, dv, hours, hull, "docking")) return;
  const v = clampNum(speed, 0, 10);
  const hit = Math.round(clampNum(hull, 0, 100));
  const extra = clampNum(dv, -200, 5000);
  log(
    s,
    hit > 0 ? "alarm" : "choice",
    hit > 0 ? "Hard dock" : "Soft capture",
    `Contact at ${(Math.round(v * 100) / 100).toFixed(2)} m/s.` +
      (hit > 0 ? ` The ring took the blow: ${hit} hull damage.` : " The latches close.") +
      (extra >= 0.5 ? ` The flight cost ${r0(extra)} m/s more than the computer's plan.` : "") +
      (extra <= -0.5 ? ` You flew it ${r0(-extra)} m/s cheaper than the computer's plan.` : ""),
    { ...(Math.abs(extra) >= 0.5 ? { dv: -extra } : {}), ...(hit > 0 ? { hull: -hit } : {}) },
  );
  arrive(s);
}

function cardChoiceBlocked(s: GameState, c: CardChoice): string | null {
  const n = c.needs;
  if (!n) return null;
  if (n.sensor && !hasSensor(s, n.sensor)) return `Needs the ${SENSORS[n.sensor].name.toLowerCase()}.`;
  if (n.shield && s.loadout.shield === "none") return "Needs a shield to turn forward.";
  if (n.kit && !s.loadout.kit.includes(n.kit)) return `Needs ${KIT[n.kit].name}.`;
  if (n.addon && !s.loadout.addons.includes(n.addon)) return `Needs the ${ADDONS[n.addon].name}.`;
  return null;
}

function playCard(s: GameState, choiceId: string) {
  if (s.phase !== "journey") no("No event card is waiting.");
  const card = EVENTS[s.deck[s.card]];
  const c = card.choices.find((x) => x.id === choiceId);
  if (!c) no("That isn't one of this card's choices.");
  const blocked = cardChoiceBlocked(s, c);
  if (blocked) no(blocked);
  const e = c.effect;

  // Check every cost before paying any of them.
  if (e.dv) requireDv(s, e.dv);
  if (e.giveDv) requireDv(s, e.giveDv);
  if (e.energy && e.energy < 0) requireEnergy(s, -e.energy);
  if (e.evaHours && s.evaHours < e.evaHours) no(`Needs ${fmtHours(e.evaHours)} of suit air. You have ${fmtHours(s.evaHours)}.`);

  const delta: Delta = {};
  const notes: string[] = [];
  let hours = e.hours ?? 0;
  if (e.hoursByEngine) hours += e.hoursByEngine[s.loadout.engine] ?? 0;

  if (e.dv) {
    const b = burn(s, e.dv, "events");
    delta.dv = -e.dv;
    delta.fuelKg = -b.fuelKg;
    notes.push(`${r0(e.dv)} m/s cost ${r0(b.fuelKg)} kg of fuel.`);
  }
  if (e.giveDv) {
    const b = burn(s, e.giveDv, "distress");
    delta.dv = -e.giveDv;
    delta.fuelKg = -b.fuelKg;
    notes.push(`You transfer ${r0(b.fuelKg)} kg of fuel: ${r0(e.giveDv)} m/s of your own.`);
  }
  if (e.energy) {
    s.energyKwh = Math.max(0, Math.min(energyCap(s), s.energyKwh + e.energy));
    delta.kwh = e.energy;
  }
  let hullHit = e.hull ?? 0;
  if (e.hullByShield) hullHit += e.hullByShield[s.loadout.shield];
  if (e.tumble && !hasSensor(s, e.tumble.safeWith)) {
    if (random(s) < e.tumble.chance) {
      hullHit += e.tumble.hull;
      notes.push("The wreck swings round and clips you.");
    } else notes.push("Without lidar you guess at its spin. This time you guessed right.");
  } else if (e.tumble) notes.push("Lidar maps the tumble. You match its spin and work safely.");
  if (hullHit) {
    s.hull = Math.max(0, s.hull - hullHit);
    delta.hull = -hullHit;
  }
  if (e.loseSensor) {
    const live = s.loadout.sensors.filter((x) => !s.lostSensors.includes(x));
    if (live.length) {
      const lost = live[Math.floor(random(s) * live.length)];
      s.lostSensors.push(lost);
      notes.push(`The impact takes out your ${SENSORS[lost].name.toLowerCase()}.`);
    }
  }
  if (e.fuelKg) {
    const max = HULLS[s.loadout.hull].maxFuelKg;
    const add = Math.min(e.fuelKg, max - s.fuelKg);
    s.fuelKg += add;
    delta.fuelKg = (delta.fuelKg ?? 0) + add;
    notes.push(`+${r0(add)} kg of fuel${add < e.fuelKg ? " (your tanks were nearly full)" : ""}.`);
  }
  if (e.spareSegments) {
    s.spareSegments += e.spareSegments;
    notes.push(`You now carry ${s.spareSegments} spare mirror segments.`);
  }
  if (e.helped) {
    s.helped = true;
    if (!s.found.includes("C5")) s.found.push("C5");
    notes.push("Their log shows a second ice fragment bending its path near a Lantern. Clue C5 pinned.");
  }
  if (e.evidencePenalty) {
    s.evidencePenalty += e.evidencePenalty;
    delta.evidence = -e.evidencePenalty;
  }
  if (e.dockDelayH) s.dockDelayH += e.dockDelayH;
  if (e.evaHours) s.evaHours -= e.evaHours;
  if (hours) delta.hours = hours;

  log(s, "choice", `${card.title}: ${c.label}`, [c.outcome + ".", ...notes].join(" "), delta);
  advance(s, hours);

  s.card += 1;
  if (s.piloted) return; // the flight deck flies on, and docking ends the journey
  if (s.card >= s.deck.length) arrive(s);
  else {
    const seg = Math.min(s.flightSegH, s.flightLeftH);
    s.flightLeftH -= seg;
    advance(s, seg);
  }
}

function arrive(s: GameState) {
  if (s.flightLeftH > 0) {
    const rest = s.flightLeftH;
    s.flightLeftH = 0;
    advance(s, rest);
  }
  s.docked = true;
  s.arrivedT = s.t;
  s.phase = "station";
  const notes: string[] = [];
  if (s.piloted) {
    notes.push(hasSensor(s, "lidar") ? "You flew the approach yourself, with lidar calling the range." : "You flew the approach by eye: no lidar.");
  } else if (!hasSensor(s, "lidar")) {
    const b = burn(s, BLIND_DOCK.dv, "docking");
    notes.push(
      `No lidar: the station's drift makes docking slow and costly (${b.ok ? r0(BLIND_DOCK.dv) : r0(b.achieved)} m/s, ${fmtHours(BLIND_DOCK.hours)}).`,
    );
    advance(s, BLIND_DOCK.hours);
  } else notes.push("Lidar locks the docking port. A clean, safe dock.");
  if (s.dockDelayH) {
    notes.push(`Without a working reaction wheel it takes ${fmtHours(s.dockDelayH)} longer.`);
    advance(s, s.dockDelayH);
  }
  log(
    s,
    "event",
    "Docked at Lantern 17",
    `Hour ${r1(s.t)}. ${notes.join(" ")} Light output ${LANTERN.startOutputPct}% and falling. Ice clock T−${r1(iceClock(s))} h.` +
      (isEclipse(s.t) ? " You've arrived during the Eclipse: the mirrors are cool, and safe to inspect up close." : " You've arrived in daylight: the mirror zone is blinding."),
  );
}

// ── station ──

function stationOnly(s: GameState) {
  if (s.phase !== "station") no("That's only possible while you're working at the station.");
}

function survey(s: GameState) {
  stationOnly(s);
  if (s.surveyed) no("You've already flown the survey.");
  requireTime(s, SURVEY.hours);
  requireEnergy(s, SURVEY.kwh);
  advance(s, SURVEY.hours);
  s.energyKwh = Math.max(0, s.energyKwh - SURVEY.kwh);
  s.stats.energyUsed.sensors += SURVEY.kwh;
  s.surveyed = true;
  if (hasSensor(s, "lidar")) {
    s.zonesKnown = [...ZONE_ORDER];
    const damaged = ZONE_ORDER.filter((z) => ZONES[z].damaged).map((z) => ZONES[z].name);
    log(s, "choice", "Fly-around survey", `Lidar builds a full 3D map. Damaged zones glow amber: ${damaged.join(", ")}.`, {
      hours: SURVEY.hours,
      kwh: -SURVEY.kwh,
    });
  } else {
    s.zonesKnown = ZONE_ORDER.filter((z) => ZONES[z].nearHub);
    const unknown = ZONE_ORDER.filter((z) => !ZONES[z].nearHub).map((z) => ZONES[z].name);
    log(s, "choice", "Fly-around survey", `Without lidar, half the map stays unknown until you visit: ${unknown.join(", ")}.`, {
      hours: SURVEY.hours,
      kwh: -SURVEY.kwh,
    });
  }
  if (hasSensor(s, "radar")) revealIce(s, "radar");
}

/** Time a job takes in a zone, with every penalty, and whether it spends a jetpack charge. */
export function jobHours(s: GameState, zone: ZoneId, method: Method, base: number): { hours: number; jetpack: boolean; why: string[] } {
  const z = ZONES[zone];
  let hours = base;
  const why: string[] = [];
  let jetpack = false;
  if (method === "arm" && z.far) {
    hours += PENALTY_H.armWalk;
    why.push("the arm walks end over end to reach it");
  }
  if (method === "eva") {
    if (s.loadout.suit === "hard") {
      hours += PENALTY_H.hardSuit;
      why.push("hard suits are slow");
    }
    if (z.far) {
      if (s.loadout.mobility === "jetpack" && s.jetpackDv >= 1) jetpack = true;
      else {
        hours += PENALTY_H.tetherFar;
        why.push("the tether line has to be rigged along the truss");
      }
    }
    if (zone === "petals" && !isEclipse(s.t)) {
      hours += PENALTY_H.daylightPetals;
      why.push("the Petals are blinding in daylight");
    }
  }
  return { hours, jetpack, why };
}

function methodAvailable(s: GameState, method: Method, hours: number) {
  const l = s.loadout;
  if (method === "scan" && !hasSensor(s, "camera") && !hasSensor(s, "thermal"))
    no("Your ship has no camera or thermal camera to scan with.");
  if (method === "drone") {
    if (!l.kit.includes("drones")) no("You didn't pack drones.");
    if (s.drones <= 0) no("Both drones are lost.");
    if (s.droneHours + 1e-9 < hours) no(`The drones have ${fmtHours(s.droneHours)} of battery left.`);
  }
  if (method === "arm" && !l.kit.includes("arm")) no("You didn't pack the robotic arm.");
  if (method === "eva") {
    if (!l.kit.includes("eva")) no("You didn't pack EVA suits.");
    if (s.evaHours + 1e-9 < hours) no(`That EVA takes ${fmtHours(hours)}. The suits have ${fmtHours(s.evaHours)} of air left.`);
  }
}

function spendJob(s: GameState, zone: ZoneId, method: Method, hours: number, jetpack: boolean) {
  if (method === "drone") s.droneHours = Math.max(0, s.droneHours - hours);
  if (method === "eva") {
    s.evaHours = Math.max(0, s.evaHours - hours);
    if (jetpack) s.jetpackDv -= 1;
    if (zone === "kiln") s.doseMsv += RADIATION.kilnMsvPerH * hours * (s.loadout.suit === "hard" ? 0.5 : 1);
  }
}

const METHOD_NAME: Record<Method, string> = {
  download: "telemetry download",
  scan: "a scan from the ship",
  drone: "a drone",
  arm: "the arm",
  eva: "EVA",
};

function inspect(s: GameState, zone: ZoneId, method: Method) {
  stationOnly(s);
  const z = ZONES[zone];
  if (!z) no("Unknown zone.");
  if (!METHOD_HOURS[method]) no("Unknown method.");
  if (!s.surveyed) no("Fly the survey first, so you know where to look.");
  const key = `${zone}:${method}`;
  if (s.done.includes(key)) no(`You've already inspected ${z.name} with ${METHOD_NAME[method]}.`);
  const job = jobHours(s, zone, method, METHOD_HOURS[method]);
  methodAvailable(s, method, job.hours);
  requireTime(s, job.hours);
  let extraKw = 0;
  if (method === "scan")
    extraKw = (["camera", "thermal"] as SensorId[]).filter((x) => hasSensor(s, x)).reduce((n, x) => n + SENSORS[x].powerW / 1000, 0);
  advance(s, job.hours, { extraKw, extraCategory: "sensors" });
  spendJob(s, zone, method, job.hours, job.jetpack);
  s.done.push(key);
  if (!s.zonesKnown.includes(zone)) s.zonesKnown.push(zone);

  const got: FindId[] = [];
  const notes: string[] = [];
  for (const f of z.finds) {
    if (!f.methods.includes(method) || s.found.includes(f.what)) continue;
    if (method === "scan" && f.scanWith && !f.scanWith.some((x) => hasSensor(s, x))) continue;
    if (f.confirmWith && !f.confirmWith.some((x) => hasSensor(s, x))) {
      notes.push("The path data is there, but corrupted. Lidar or radar could confirm it.");
      continue;
    }
    s.found.push(f.what);
    got.push(f.what);
  }
  if (method === "drone" && zone === "petals" && !isEclipse(s.t)) {
    s.drones -= 1;
    s.droneHours = s.drones > 0 ? s.droneHours / 2 : 0;
    notes.push("The glare off the Petals blinds a drone and it tumbles away. One drone lost.");
  }
  if (method === "eva" && zone === "kiln") notes.push(`The crew takes ${r1(RADIATION.kilnMsvPerH * job.hours * (s.loadout.suit === "hard" ? 0.5 : 1))} mSv near the reactor.`);
  if (job.jetpack) notes.push(`Jetpack: ${s.jetpackDv} m/s of push left.`);
  if (job.why.length) notes.push(`It took ${fmtHours(job.hours)}: ${job.why.join(", ")}.`);

  const names = got.map((f) => (f in CLUES ? `${f} ${CLUES[f as ClueId].name}` : HAZARDS[f as "leak" | "drift"].name));
  const text = got.length ? `Found: ${names.join(", ")}. ` : `${z.quiet} `;
  log(s, "choice", `Inspected ${z.name} with ${METHOD_NAME[method]}`, (text + notes.join(" ")).trim(), {
    hours: job.hours,
    evidence: got.filter((f) => f in CLUES).reduce((n, f) => n + CLUES[f as ClueId].points, 0) || undefined,
  });
  if (got.includes("leak"))
    log(s, "alarm", "A second clock", `${HAZARDS.leak.text} That's ${fmtHours(Math.max(0, CLOCKS.reactorH - s.t))} from now.`);
  if (got.includes("drift")) log(s, "notice", "Attitude drift", HAZARDS.drift.text);
}

function repair(s: GameState, what: "leak" | "drift", method: "eva" | "arm") {
  stationOnly(s);
  const h = HAZARDS[what];
  if (!h) no("Unknown repair.");
  if (!s.found.includes(what)) no("You haven't found anything to repair there yet.");
  if (what === "leak" && s.leakPatched) no("The leak is already patched.");
  if (what === "drift" && s.driftFixed) no("The drift is already fixed.");
  if (what === "leak" && !s.reactorOnline) no("Too late: the reactor has already shut down.");
  if (what === "drift" && method !== "eva") no("The gyro wheel needs hands on it: EVA only.");
  if (method !== "eva" && method !== "arm") no("Repairs need EVA or the arm.");
  const job = jobHours(s, h.zone, method, REPAIR_HOURS[what]);
  methodAvailable(s, method, job.hours);
  requireTime(s, job.hours);
  if (what === "leak" && s.t + job.hours > CLOCKS.reactorH)
    no(`The patch takes ${fmtHours(job.hours)}, and the reactor shuts down in ${fmtHours(Math.max(0, CLOCKS.reactorH - s.t))}.`);
  advance(s, job.hours);
  spendJob(s, h.zone, method, job.hours, job.jetpack);
  if (what === "leak") {
    s.leakPatched = true;
    log(s, "choice", `Patched the ammonia leak (${METHOD_NAME[method]})`, `${fmtHours(job.hours)}. The reactor clock stops.`, { hours: job.hours });
  } else {
    s.driftFixed = true;
    log(s, "choice", "Fixed the drift (EVA)", `${fmtHours(job.hours)}. The beam slides back onto the collectors: cities get 15 points more light.`, {
      hours: job.hours,
    });
  }
}

function crossOut(s: GameState, hyp: "H1" | "H2" | "H3") {
  stationOnly(s);
  if (s.crossed.includes(hyp)) no("Already ruled out.");
  if (hyp === "H3") no("The evidence supports this one. You can't rule it out.");
  if (hyp === "H1") {
    const ok = (s.found.includes("C3") && s.found.includes("C4")) || s.found.includes("C6");
    if (!ok) no("Not yet. A sensor error is ruled out when two different sensors agree (C3 + C4), or by your own test.");
    s.crossed.push("H1");
    log(s, "choice", "Ruled out: sensor error", "Two different instruments recorded the same thing at the same moment.");
    return;
  }
  const ok = s.found.includes("C2") && (hasSensor(s, "lidar") || hasSensor(s, "radar"));
  if (!ok)
    no(
      "Not yet. To rule out another impact you need the thermal record (C2: no impact flash) and a lidar or radar sweep (no other object).",
    );
  s.crossed.push("H2");
  log(s, "choice", "Ruled out: something else hit it", "No impact flash on the thermal record, and no other object in your sweep.");
}

function runTest(s: GameState) {
  stationOnly(s);
  if (s.test) no("You've already run the test.");
  if (!s.reactorOnline) no("The reactor is down. There's nothing to fire.");
  if (!testUnlocked(s)) no("Locked. Pin 2 of clues C1–C4 and rule out H1 or H2 first.");
  const live = s.loadout.sensors.filter((x) => !s.lostSensors.includes(x));
  const best = bestBand(live);
  if (!best) no("Nothing aboard can measure the block's speed. You need a camera, lidar or radar.");
  requireTime(s, TEST.hours);
  const kw = SENSORS[best.sensor].powerW / 1000;
  advance(s, TEST.darkHours, { dark: true, extraKw: kw, extraCategory: "sensors" });
  advance(s, TEST.hours - TEST.darkHours, { extraKw: kw, extraCategory: "sensors" });
  const trueCmS = testPushCmS();
  const u = random(s) * 2 - 1;
  const measuredCmS = trueCmS * (1 + (best.bandPct / 100) * 0.5 * u);
  s.test = { t: s.t, sensor: best.sensor, bandPct: best.bandPct, trueCmS, measuredCmS };
  s.found.push("C6");
  const label = best.bandPct <= 3 ? "proven" : best.bandPct <= 15 ? "likely" : "maybe";
  log(
    s,
    "choice",
    "The controlled test",
    `Aimed the cracked segment at a 1 m ice block and fired 10 kW for 60 s. Measured ${r1(measuredCmS)} ± ${r1((measuredCmS * best.bandPct) / 100)} cm/s with the ${SENSORS[best.sensor].name.toLowerCase()} (±${best.bandPct}%: “${label}”). Lantern 17 went dark for an hour to do it.`,
    { hours: TEST.hours, evidence: CLUES.C6.points },
  );
  if (!s.crossed.includes("H1")) {
    s.crossed.push("H1");
    log(s, "choice", "Ruled out: sensor error", "Your own measurement shows the push. It isn't the instruments.");
  }
}

function toChoice(s: GameState) {
  stationOnly(s);
  s.phase = "choice";
  revealIce(s, "director");
  const left = CLOCKS.iceTrueH - s.t;
  log(
    s,
    "notice",
    "Ember Hollow is a farm",
    `Turning the beam outward means their crops miss a light window. Ember Hollow has ${r1(s.settlements.emberHollow)} h of reserve left.`,
  );
  const ret = returnCostDv(s);
  const have = dvLeft(s);
  if (have < ret * 1.1)
    log(
      s,
      "notice",
      "Your fuel is marginal",
      have < ret
        ? `Getting home needs ${r0(ret)} m/s. You have ${r0(have)}. You can't get home as things stand.`
        : `Getting home needs ${r0(ret)} m/s. You have ${r0(have)}: less than the 10% margin.`,
    );
  log(
    s,
    "notice",
    "Time",
    `${fmtHours(left)} to impact. One Lantern beaming alone needs about 21 h to push the ice 1.5 km aside.`,
  );
}

// ── the big choice ──

function choose(s: GameState, option: "A" | "B" | "C" | "D" | "E", method?: "eva" | "arm") {
  if (s.phase !== "choice") no("The big choice comes after your work at the station.");
  if (!CHOICES[option]) no("Unknown option.");

  if (option === "A" || option === "C") {
    const need = MIRROR_SEGMENTS_NEEDED[option];
    if (s.spareSegments < need)
      no(`Needs ${need} spare mirror segments. You have ${s.spareSegments}${s.loadout.kit.includes("optics") ? "" : ": you didn't pack spare optics"}.`);
    const m = method ?? (s.loadout.kit.includes("arm") ? "arm" : "eva");
    if (m !== "eva" && m !== "arm") no("Swapping segments needs EVA or the arm.");
    if (option === "C" && !s.reactorOnline) no("The reactor is down. There's no beam to hold on to.");
    const job = jobHours(s, "petals", m, MIRROR_WORK_H[option]);
    methodAvailable(s, m, job.hours);
    requireTime(s, job.hours);
    advance(s, job.hours);
    spendJob(s, "petals", m, job.hours, job.jetpack);
    s.spareSegments -= need;
    s.mirror = option === "A" ? "fixed" : "middle";
    s.choice = option;
    s.choiceT = s.t;
    s.phase = "endgame";
    log(
      s,
      "choice",
      option === "A" ? "Fixed the mirror" : "The clever middle",
      option === "A"
        ? `${fmtHours(job.hours)} of work. All three cracked segments swapped. Lantern 17 is back to full light, and the focusing effect is gone for good.`
        : `${fmtHours(job.hours)} of work. Two segments swapped; segment 7 stays cracked, aimed on its own at the ice. Lantern 17 back to ${LANTERN.middleOutputPct}% light, and the beam pushes at half strength while you stay to guide it.`,
      { hours: job.hours },
    );
    return;
  }

  if (option === "B" && !s.reactorOnline) no("The reactor is down. There's no beam to aim.");
  s.choice = option;
  s.choiceT = s.t;
  s.phase = "endgame";
  if (option === "B") {
    log(
      s,
      "choice",
      "Keep it broken, beam now",
      "Lantern 17's whole head turns on the ice. It fires for as long as you stay to guide it, and every settlement drains while it does, except during the Eclipse.",
    );
  } else if (option === "D") {
    s.mustBroadcast = true;
    log(s, "choice", "Don't decide alone", "You leave the mirror as it is and prepare everything you have for the network.");
  } else if (option === "E") {
    log(s, "choice", "Walk away", "You undock with what you have.");
    depart(s);
  }
}

// ── endgame ──

export function packetHours(s: GameState, packet: "summary" | "core" | "full", at = s.t): { hours: number; eclipse: boolean } {
  const c = COMMS[s.loadout.comms];
  const eclipse = isEclipse(at);
  return { hours: transferHours(PACKETS[packet].mb, c.mbps * (eclipse ? 0.25 : 1)), eclipse };
}

/**
 * One broadcast per mission. It can go as soon as you're at the station ("transmit findings early",
 * from the dossier), or after the big choice. What it carries is fixed the moment you send it.
 */
function broadcast(s: GameState, packet: "summary" | "core" | "full") {
  if (!["station", "choice", "endgame"].includes(s.phase) || s.departed) no("You send your packet from the station.");
  if (s.broadcast) no("You've already sent your packet. The network weighs one report per crew.");
  if (!PACKETS[packet]) no("Unknown packet.");
  const c = COMMS[s.loadout.comms];
  if (c.stationOnly && (!s.docked || !s.reactorOnline)) no("The Lantern relay only works docked to a live Lantern.");
  const { hours, eclipse } = packetHours(s, packet);
  const kwh = (c.powerW / 1000) * hours;
  requireEnergy(s, kwh);
  s.energyKwh -= kwh;
  s.stats.energyUsed.comms += kwh;

  const ev = evidence(s);
  const arriveT = s.t + hours;
  const reasons: string[] = [];
  if (packet === "summary") reasons.push("a summary carries no measurements");
  if (ev < BELIEF.minEvidence) reasons.push(`evidence is ${ev}/100, below ${BELIEF.minEvidence}`);
  if (!s.test) reasons.push("there's no test result");
  else if (s.test.bandPct > BELIEF.maxBandPct) reasons.push(`the measurement is only ±${s.test.bandPct}%`);
  if (arriveT > CLOCKS.iceTrueH) reasons.push("it arrives after impact");
  const believed = reasons.length === 0;
  const lanterns = believed ? (packet === "full" ? NETWORK.lanternsFull : NETWORK.lanternsCore) : 0;
  s.broadcast = {
    packet,
    t: s.t,
    hours,
    arriveT,
    eclipse,
    believed,
    lanterns,
    joinT: believed ? arriveT + NETWORK.joinDelayH : null,
    reason: believed ? "" : reasons.join("; "),
    replied: false,
  };
  log(
    s,
    "choice",
    `Sent the ${PACKETS[packet].name} packet`,
    `${r0(PACKETS[packet].mb)} MB over the ${c.name.toLowerCase()}: ${fmtHours(hours)} to send${eclipse ? " (×4 slower during the Eclipse)" : ""}.`,
    { kwh: -kwh },
  );
  advance(s, 5 / 60);
}

function stay(s: GameState, hours: number) {
  if (s.phase !== "endgame") no("You can only hold position after the big choice.");
  if (!s.docked || s.departed) no("You've already left the station.");
  if (!Number.isFinite(hours) || hours <= 0) no("Stay for a positive number of hours.");
  const left = deadline() - s.t;
  if (left <= 1e-6) no("Time's up: you have to leave before the ice arrives.");
  const h = Math.min(hours, left);
  const shiftBefore = s.ice.shiftKm;
  advance(s, h);
  const beaming = s.choice === "B" || s.choice === "C";
  log(
    s,
    "choice",
    `Held position ${fmtHours(h)}`,
    beaming
      ? `Guiding the beam. The ice has moved ${r1(s.ice.shiftKm)} km so far (+${r1(s.ice.shiftKm - shiftBefore)}). It needs 1.5 km to miss.`
      : "Standing by at the station.",
    { hours: h },
  );
}

function depart(s: GameState, opts: { stranded?: boolean } = {}) {
  if (s.departed) return;
  const route = s.route ? routeTotals(s.route) : null;
  s.departed = true;
  s.departT = s.t;
  const wasDocked = s.docked;
  s.docked = false;
  if (!opts.stranded && route) {
    const cost = wasDocked ? route.backDv : route.backDv - 20;
    const have = dvLeft(s);
    const b = burn(s, cost, "return");
    if (!b.ok) {
      s.crewHome = false;
      s.strandedReason = `Out of Δv: getting home needed ${r0(cost)} m/s, you had ${r0(have)}.`;
      log(s, "alarm", "Not enough Δv to get home", `${s.strandedReason} You burn what you have and wait for a rescue crew.`, {
        dv: -b.achieved,
        fuelKg: -b.fuelKg,
      });
    } else {
      log(s, "choice", "Heading home", `${r0(cost)} m/s for the trip home: ${r0(b.fuelKg)} kg of fuel. ${r0(dvLeft(s))} m/s to spare.`, {
        dv: -cost,
        fuelKg: -b.fuelKg,
      });
    }
    advance(s, route.backH);
    if (s.crewHome !== false) {
      if (s.energyKwh <= 0) {
        s.crewHome = false;
        s.strandedReason = "Power ran out on the way home.";
        log(s, "alarm", "Power ran out", "Life support drops to emergency mode. A rescue crew has to come and get you.");
      } else s.crewHome = true;
    }
  }
  if (s.crewHome === null) s.crewHome = false;
  s.homeT = s.t;
  s.aboard = false;
  if (s.crewHome) log(s, "event", "Docked at the Wick", `Home at hour ${r1(s.t)}.`);
  finalize(s);
}

function finalize(s: GameState) {
  if (s.t < CLOCKS.iceTrueH) advance(s, CLOCKS.iceTrueH - s.t);
  if (s.broadcast && !s.broadcast.replied) networkReply(s);
  const o = evaluate(s);
  s.outcome = o;
  s.phase = "debrief";
  log(s, "event", `Ending: ${ENDINGS[o.ending].name}`, ENDINGS[o.ending].line);
}

/** Every ending, and what triggers it. */
export function evaluate(s: GameState): Outcome {
  const b = s.broadcast;
  const sentOnTime = !!b && b.arriveT <= CLOCKS.iceTrueH + 1e-9;
  const believed = !!b && b.believed;
  const stationLostBy = !s.reactorOnline ? "reactor" : s.ice.shiftKm < 1.5 ? "ice" : null;
  const stationSurvived = stationLostBy === null;
  const crewHome = !!s.crewHome;
  const ev = evidence(s);
  const clues = cluesFound(s);

  let ending: Outcome["ending"];
  if (believed) {
    if (crewHome && s.helped && clues.length === 6) ending = "somethingInTheDark";
    else ending = crewHome ? "firstLight" : "firstLightStranded";
  } else if (sentOnTime) ending = "dismissed";
  else if (!stationSurvived) ending = ev >= BELIEF.minEvidence ? "filedUnread" : "lantern17Lost";
  else ending = crewHome ? "homeSafe" : "savedButStranded";

  return {
    ending,
    sent: !!b,
    sentOnTime,
    believed,
    stationSurvived,
    stationLostBy,
    iceShiftKm: s.ice.shiftKm,
    crewHome,
    strandedReason: s.strandedReason,
    evidence: ev,
    cluesFound: clues,
    bandPct: s.test?.bandPct ?? null,
    settlements: SETTLEMENT_IDS.map((id) => ({
      id,
      startH: SETTLEMENTS[id].reserveH,
      endH: s.settlements[id],
      failed: s.settlements[id] <= 1e-6,
    })),
    doseMsv: s.doseMsv,
    hull: s.hull,
    dvLeft: dvLeft(s),
  };
}

// ───────────────────────────── after every action ─────────────────────────────

function afterAction(s: GameState) {
  if (s.phase !== "debrief" && s.launched && s.aboard && !s.departed) {
    if (s.energyKwh <= 1e-9) {
      log(s, "alarm", "Power critical", "Stored energy is gone. Life support drops to emergency mode and the crew has to head home now.");
      if (s.phase === "journey" || s.phase === "route") s.docked = false;
      s.phase = s.phase === "station" || s.phase === "choice" ? "endgame" : s.phase;
      depart(s);
    } else if (s.docked && s.t >= deadline() - 1e-9) {
      log(s, "alarm", "Get clear", "Director: “The ice is minutes out. Undock now.”");
      s.phase = "endgame";
      depart(s);
    }
  }
  if (s.launched) {
    const last = s.stats.track[s.stats.track.length - 1];
    if (!last || last.t !== s.t)
      s.stats.track.push({ t: Math.round(s.t * 100) / 100, dvLeft: Math.round(dvLeft(s)), energy: Math.round(s.energyKwh * 10) / 10, evidence: evidence(s) });
  }
}
