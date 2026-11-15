/**
 * The debrief: numbers, mistakes, what you could have done better, and what each part is in real life.
 * Handbook page 20. Every "better choice" line compares what you did with the next-best option.
 */
import { BELIEF, CLOCKS } from "./constants";
import { ENDINGS } from "./data/endings";
import { REAL, type RealCard } from "./data/realLife";
import { ROUTES, routeTotals } from "./data/routes";
import { COMMS, SENSORS } from "./data/ship";
import { CLUES, PACKETS } from "./data/station";
import { dvLeft, evidence, fmtHours, isp, packetHours, shipDryKg } from "./engine";
import { loadoutStats } from "./loadout";
import { fuelForDeltaV } from "./physics";
import type { GameState } from "./types";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");

export function betterChoices(s: GameState): string[] {
  const out: string[] = [];
  const o = s.outcome;
  const st = loadoutStats(s.loadout);

  if (s.route && s.route !== "safe") {
    const mine = routeTotals(s.route);
    const safe = routeTotals("safe");
    const extraKg =
      fuelForDeltaV(st.isp, st.dryKg, st.fuelKg, mine.outDv) - fuelForDeltaV(st.isp, st.dryKg, st.fuelKg, safe.outDv);
    out.push(
      `${ROUTES[s.route].name} route: you burned about ${r0(extraKg)} kg more fuel on the way out than the safe route needed, to arrive ${fmtHours(safe.arriveH - mine.arriveH)} earlier.`,
    );
  } else if (s.route === "safe" && o && !o.stationSurvived && o.stationLostBy === "ice") {
    out.push("Safe route: you arrived at about hour 12.6. Deflecting alone needs about 21 h of beaming, so the ice was already out of reach.");
  }

  if (s.test && s.test.bandPct > 3 && !s.loadout.sensors.includes("radar"))
    out.push(`No radar: your test was ±${s.test.bandPct}%. With radar: ±3%${s.test.bandPct > BELIEF.maxBandPct ? ", enough to be believed" : ""}.`);
  if (!s.test && s.phase === "debrief")
    out.push("You never ran the controlled test. Without a measured number (clue C6, 30 points) nobody can believe you.");

  if (s.loadout.power === "battery" && s.stats.minEnergyFrac < 0.2)
    out.push(
      `Battery pack: you got down to ${Math.round(s.stats.minEnergyFrac * 100)}% energy. Fuel cells would have cost ${r0(80)} kg less and stored four times as much.`,
    );

  if (!s.helped && s.deck.includes("E4")) out.push("You ignored the distress call. Their log held a second sighting (C5).");

  if (s.reactorShutdownT !== null)
    out.push(
      s.found.includes("leak")
        ? "You found the leak but never patched it. The reactor shut down at hour 20 and took the beam with it. Do the boring job first."
        : "You never inspected the radiator fins. The ammonia leak shut the reactor down at hour 20.",
    );

  if (!s.found.includes("C2") && !s.loadout.sensors.includes("thermal"))
    out.push("No thermal camera: the burn scar on the Petals (C2) was invisible to you, and so was the proof that nothing else hit the ice.");

  if (s.choice && (s.choice === "A" || s.choice === "C") === false && !s.loadout.kit.includes("optics"))
    out.push("Without spare optics, options A and C were closed to you at the big choice.");

  const b = s.broadcast;
  if (b && !b.believed) out.push(`The network didn't believe you: ${b.reason}.`);
  if (b && b.believed && o && !o.stationSurvived && o.stationLostBy === "ice") {
    const join = b.joinT ?? CLOCKS.iceTrueH;
    out.push(
      `The network turned outward at hour ${Math.round(join * 10) / 10}, ${fmtHours(Math.max(0, CLOCKS.iceTrueH - join))} before impact. Sending earlier, or staying to guide your own beam longer, would have pushed the ice further.`,
    );
  }
  if (!b && evidence(s) >= BELIEF.minEvidence)
    out.push("You had the proof and never sent it. Even the Summary would have reached the network in minutes.");
  if (b && s.loadout.comms === "radio" && b.packet !== "summary") {
    const dish = packetHours({ ...s, loadout: { ...s.loadout, comms: "dish" } }, b.packet, b.t).hours;
    out.push(
      `Small radio: the ${PACKETS[b.packet].name} packet took ${fmtHours(b.hours)}. A high-gain dish would have sent it in ${fmtHours(dish)}.`,
    );
  }
  return out;
}

/** For a piloted flight: what the ledger says about how you flew. */
export function flightReport(s: GameState) {
  if (!s.piloted) return null;
  const dock = s.log.find((e) => e.title === "Soft capture" || e.title === "Hard dock");
  const speed = dock ? Number(/Contact at ([\d.]+) m\/s/.exec(dock.text)?.[1] ?? NaN) : null;
  const extra = dock?.delta?.dv !== undefined ? -dock.delta.dv : 0;
  const ice = s.log.filter((e) => e.phase === "journey" && e.title.startsWith("Ice fragment"));
  const iceHull = ice.reduce((k, e) => k + -(e.delta?.hull ?? 0), 0);
  const pilotHull = s.log
    .filter((e) => e.phase === "journey" && e.title === "Piloting")
    .reduce((k, e) => k + -(e.delta?.hull ?? 0), 0);
  return {
    docked: !!dock,
    soft: dock?.title === "Soft capture",
    speed: speed !== null && Number.isFinite(speed) ? speed : null,
    extraDv: extra,
    iceHits: ice.length,
    iceHull,
    hazeHull: pilotHull,
    dockHull: -(dock?.delta?.hull ?? 0),
  };
}

function flightLessons(s: GameState): string[] {
  const f = flightReport(s);
  if (!f) return [];
  const out: string[] = [];
  if (f.docked && !f.soft && f.speed !== null)
    out.push(`Hard dock at ${f.speed.toFixed(2)} m/s. Under 0.3 m/s and lined up on the ring is a soft capture: slow right down for the last 15 m.`);
  if (f.extraDv > 30)
    out.push(
      `Your flying cost ${r0(f.extraDv)} m/s more than the route card. Light the engine when the countdown hits zero (half the burn falls before the node, half after), and let the computer cut it.`,
    );
  if (f.iceHits)
    out.push("The ice fragment's path crossed yours and you stayed in it. A 0.6 m/s dodge, minutes ahead, costs almost nothing; NASA moves the ISS at 1 in 10,000.");
  if (f.hazeHull > 0) out.push("Drifting ice hit you on the approach. Stop, let it pass, then go on: it's slow, and so are you.");
  return out;
}

/** The actions to restart a run from: the hangar (change your ship) or the launch (same ship, fly again). */
export function replayPoint<A extends { type: string }>(actions: A[], at: "hangar" | "route"): A[] {
  const i = actions.findIndex((a) => a.type === (at === "hangar" ? "launch" : "route"));
  return i < 0 ? actions.slice() : actions.slice(0, i);
}

export function realLifeCards(s: GameState): RealCard[] {
  const l = s.loadout;
  const keys: string[] = [l.engine, l.power];
  if (s.piloted) {
    if (s.route !== "fastOut" && s.route !== "fastBoth") keys.push("hohmann");
    keys.push("conjunction");
    if (s.log.some((e) => e.title === "Soft capture" || e.title === "Hard dock")) keys.push("vbar");
  }
  if (l.shield !== "none") keys.push(l.shield);
  keys.push(...l.sensors);
  if (l.comms === "laser" || l.comms === "radio") keys.push(l.comms);
  keys.push(...l.kit);
  keys.push(...l.addons);
  if (l.kit.includes("eva") && l.mobility === "jetpack") keys.push("jetpack");
  if (s.test) keys.push("ablation");
  if (s.choice === "B" || s.choice === "C") keys.push("beam");
  return keys.filter((k) => REAL[k]).map((k) => REAL[k]);
}

export function debrief(s: GameState) {
  const o = s.outcome;
  const st = loadoutStats(s.loadout);
  const route = s.route ? routeTotals(s.route) : null;
  const ledger = s.log.filter((e) => e.phase !== "briefing" && e.phase !== "hangar");
  return {
    ending: o ? ENDINGS[o.ending] : null,
    outcome: o,
    numbers: {
      dvPlanned: route ? route.totalDv : 0,
      dvAtLaunch: st.dv,
      dvUsed: s.stats.dvUsed,
      dvLeft: dvLeft(s),
      launchMassKg: st.wetKg,
      launchFuelKg: st.fuelKg,
      energyUsed: s.stats.energyUsed,
      phaseHours: s.stats.phaseHours,
      evidence: evidence(s),
      clues: (Object.keys(CLUES) as (keyof typeof CLUES)[]).map((id) => ({ ...CLUES[id], found: s.found.includes(id) })),
      bandPct: s.test?.bandPct ?? null,
      bandSensor: s.test ? SENSORS[s.test.sensor].name : null,
      dataSent: s.broadcast
        ? { mb: PACKETS[s.broadcast.packet].mb, hours: s.broadcast.hours, link: COMMS[s.loadout.comms].name }
        : null,
      settlements: o?.settlements ?? [],
      doseMsv: s.doseMsv,
      hull: s.hull,
      fuelKgBurnedPerDvAtEnd: fuelForDeltaV(isp(s), shipDryKg(s), s.fuelKg, 1),
    },
    better: [...flightLessons(s), ...betterChoices(s)],
    flight: flightReport(s),
    realLife: realLifeCards(s),
    ledger,
  };
}
