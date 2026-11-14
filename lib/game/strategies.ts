/**
 * Scripted players. Each one plays a whole mission against the real engine by choosing its next
 * action from the current state. The tests use them to prove every ending can be reached, and the
 * Mission Lab plays them live so the team can watch a run unfold.
 */
import { EVENTS } from "./data/events";
import { createGame, dvLeft, evidence, step } from "./engine";
import type { Action, EndingId, GameState, Loadout } from "./types";

export type Policy = (s: GameState) => Action;

export interface Strategy {
  id: string;
  name: string;
  aims: EndingId;
  summary: string;
  build: Partial<Loadout>;
  policy: Policy;
}

type CardPref = (s: GameState) => string[];

/** Prefer card choices in the given order, falling back to whatever the engine accepts. */
function playCards(s: GameState, prefs: CardPref): Action {
  const card = EVENTS[s.deck[s.card]];
  const order = [...prefs(s), ...card.choices.map((c) => c.id)];
  for (const id of order) {
    const a: Action = { type: "card", choice: id };
    if (step(s, a).ok) return a;
  }
  return { type: "card", choice: card.choices[card.choices.length - 1].id };
}

/** Play a list of station actions in order, skipping any the engine rejects. */
function firstOk(s: GameState, list: Action[]): Action | null {
  for (const a of list) if (step(s, a).ok) return a;
  return null;
}

const cheapCards = (help: boolean): CardPref => (s) => {
  const id = s.deck[s.card];
  if (id === "E4") return help ? ["relay", "fuel"] : ["ignore"];
  if (id === "E1") return ["turn", "tank"];
  if (id === "E2") return ["nudge", "emergency", "hit"];
  if (id === "E3") return ["rtg", "heat", "without"];
  if (id === "E5") return ["through"];
  if (id === "E6") return ["pass"];
  if (id === "E7") return ["limp", "thrusters"];
  return [];
};

function hangarThenRoute(s: GameState, build: Partial<Loadout>, route: Action & { type: "route" }): Action | null {
  if (s.phase === "briefing") return { type: "begin" };
  if (s.phase === "hangar") {
    const l = s.loadout;
    if (build.hull && l.hull !== build.hull) return { type: "hull", id: build.hull };
    if (build.engine && l.engine !== build.engine) return { type: "engine", id: build.engine };
    if (build.power && l.power !== build.power) return { type: "power", id: build.power };
    if (build.shield && l.shield !== build.shield) return { type: "shield", id: build.shield };
    if (build.comms && l.comms !== build.comms) return { type: "comms", id: build.comms };
    if (build.sensors) {
      const extra = l.sensors.find((x) => !build.sensors!.includes(x));
      if (extra) return { type: "sensor", id: extra };
      const missing = build.sensors.find((x) => !l.sensors.includes(x));
      if (missing) return { type: "sensor", id: missing };
    }
    if (build.kit) {
      const extra = l.kit.find((x) => !build.kit!.includes(x));
      if (extra) return { type: "kit", id: extra };
      const missing = build.kit.find((x) => !l.kit.includes(x));
      if (missing) return { type: "kit", id: missing };
    }
    if (build.addons) {
      const missing = build.addons.find((x) => !l.addons.includes(x));
      if (missing) return { type: "addon", id: missing };
    }
    if (build.mobility && l.mobility !== build.mobility) return { type: "mobility", id: build.mobility };
    return { type: "launch" };
  }
  if (s.phase === "route") return route;
  return null;
}

/** The thorough scientist: find everything, prove it, take the clever middle, tell everyone. */
const scientist = (opts: { help: boolean; route: "quick" | "safe"; packet: "core" | "full" | "summary" }): Policy => (s) => {
  const pre = hangarThenRoute(s, BEST_BUILD, { type: "route", id: opts.route });
  if (pre) return pre;
  if (s.phase === "journey") return playCards(s, cheapCards(opts.help));
  if (s.phase === "station") {
    return (
      firstOk(s, [
        { type: "survey" },
        { type: "inspect", zone: "radiators", method: "download" },
        { type: "repair", repair: "leak", method: "eva" },
        { type: "inspect", zone: "mast", method: "download" },
        { type: "inspect", zone: "petals", method: "scan" },
        { type: "crossOut", hyp: "H2" },
        { type: "crossOut", hyp: "H1" },
        { type: "test" },
        // Send the moment the evidence would be believed: the earlier the network turns, the further the ice moves.
        ...(s.broadcast || evidence(s) < 80 ? [] : ([{ type: "broadcast", packet: opts.packet }] as Action[])),
        { type: "inspect", zone: "petals", method: "eva" },
        { type: "inspect", zone: "spine", method: "download" },
        { type: "repair", repair: "drift", method: "eva" },
      ]) ?? (s.broadcast ? { type: "toChoice" } : { type: "broadcast", packet: opts.packet })
    );
  }
  if (s.phase === "choice") return firstOk(s, [{ type: "choose", option: "C", method: "eva" }, { type: "choose", option: "D" }])!;
  if (s.phase === "endgame") {
    if (!s.broadcast) return { type: "broadcast", packet: opts.packet };
    const left = 29.5 - s.t;
    const ret = 416;
    if (left > 0.01 && dvLeft(s) > ret) return { type: "stay", hours: left };
    return { type: "depart" };
  }
  return { type: "depart" };
};

const BEST_BUILD: Partial<Loadout> = {
  hull: "tender",
  engine: "biprop",
  power: "fuelcells",
  shield: "light",
  sensors: ["thermal", "radar"],
  comms: "dish",
  kit: ["eva", "optics"],
};

/** The lone hero: fly fast, patch the reactor, turn the whole beam on the ice and hold it. */
const loneBeam = (opts: { send: boolean; engine: "biprop" | "cryo"; shield: "none" | "light" }): Policy => (s) => {
  const build: Partial<Loadout> = {
    hull: "tender",
    engine: opts.engine,
    power: "fuelcells",
    shield: opts.shield,
    sensors: ["lidar", "camera"],
    comms: "dish",
    kit: ["eva"],
  };
  const pre = hangarThenRoute(s, build, { type: "route", id: "fastOut" });
  if (pre) return pre;
  if (s.phase === "journey") return playCards(s, cheapCards(false));
  if (s.phase === "station")
    return (
      firstOk(s, [
        { type: "survey" },
        { type: "inspect", zone: "radiators", method: "download" },
        { type: "repair", repair: "leak", method: "eva" },
      ]) ?? { type: "toChoice" }
    );
  if (s.phase === "choice") return { type: "choose", option: "B" };
  if (s.phase === "endgame") {
    if (opts.send && !s.broadcast) return { type: "broadcast", packet: "summary" };
    const left = 29.5 - s.t;
    if (left > 0.01) return { type: "stay", hours: left };
    return { type: "depart" };
  }
  return { type: "depart" };
};

/** Proves it, beams it alone, sends it, and burns the fuel it needed to get home. */
const martyr: Policy = (s) => {
  const build: Partial<Loadout> = { ...BEST_BUILD, sensors: ["thermal", "lidar"], shield: "light" };
  const pre = hangarThenRoute(s, build, { type: "route", id: "fastOut" });
  if (pre) return pre;
  if (s.phase === "journey") return playCards(s, cheapCards(false));
  if (s.phase === "station")
    return (
      firstOk(s, [
        { type: "survey" },
        { type: "inspect", zone: "radiators", method: "download" },
        { type: "repair", repair: "leak", method: "eva" },
        { type: "inspect", zone: "mast", method: "download" },
        { type: "inspect", zone: "petals", method: "scan" },
        { type: "crossOut", hyp: "H2" },
        { type: "crossOut", hyp: "H1" },
        { type: "test" },
        { type: "inspect", zone: "petals", method: "eva" },
        ...(s.broadcast || evidence(s) < 80 ? [] : ([{ type: "broadcast", packet: "core" }] as Action[])),
      ]) ?? { type: "toChoice" }
    );
  if (s.phase === "choice") return { type: "choose", option: "B" };
  if (s.phase === "endgame") {
    const left = 29.5 - s.t;
    if (left > 0.01) return { type: "stay", hours: left };
    return { type: "depart" };
  }
  return { type: "depart" };
};

/** The careful one who proves it all and then keeps it to themselves. */
const hoarder: Policy = (s) => {
  const pre = hangarThenRoute(s, BEST_BUILD, { type: "route", id: "quick" });
  if (pre) return pre;
  if (s.phase === "journey") return playCards(s, cheapCards(false));
  if (s.phase === "station") {
    if (evidence(s) >= 80) return { type: "toChoice" };
    return (
      firstOk(s, [
        { type: "survey" },
        { type: "inspect", zone: "radiators", method: "download" },
        { type: "repair", repair: "leak", method: "eva" },
        { type: "inspect", zone: "mast", method: "download" },
        { type: "inspect", zone: "petals", method: "scan" },
        { type: "inspect", zone: "petals", method: "eva" },
        { type: "crossOut", hyp: "H2" },
        { type: "test" },
      ]) ?? { type: "toChoice" }
    );
  }
  if (s.phase === "choice") return { type: "choose", option: "E" };
  return { type: "depart" };
};

/** Nobody checks the radiators. */
const tourist: Policy = (s) => {
  const pre = hangarThenRoute(s, { sensors: ["camera"] }, { type: "route", id: "safe" });
  if (pre) return pre;
  if (s.phase === "journey") return playCards(s, cheapCards(false));
  if (s.phase === "station") return firstOk(s, [{ type: "survey" }, { type: "inspect", zone: "petals", method: "scan" }]) ?? { type: "toChoice" };
  if (s.phase === "choice") return { type: "choose", option: "E" };
  return { type: "depart" };
};

export const STRATEGIES: Strategy[] = [
  {
    id: "scientist-helper",
    name: "The whole truth",
    aims: "somethingInTheDark",
    summary: "Tender with thermal IR and radar, suits and spare optics. Quick route, helps the distress crew, finds all six clues, takes the clever middle and sends the Core packet.",
    build: BEST_BUILD,
    policy: scientist({ help: true, route: "quick", packet: "core" }),
  },
  {
    id: "scientist",
    name: "Proof, sent",
    aims: "firstLight",
    summary: "The same careful mission, but it flies past the distress call.",
    build: BEST_BUILD,
    policy: scientist({ help: false, route: "quick", packet: "core" }),
  },
  {
    id: "lone-beam-send",
    name: "Lone beam, then tell them",
    aims: "dismissed",
    summary: "Fast out in a stripped-down Tender, patch the reactor, beam the ice alone, and send only a summary.",
    build: { hull: "tender", engine: "biprop", shield: "none" },
    policy: loneBeam({ send: true, engine: "biprop", shield: "none" }),
  },
  {
    id: "lone-beam",
    name: "Lone beam, no fuel home",
    aims: "savedButStranded",
    summary: "Fast out in a Tender that kept its shield, and hold the beam to the last minute. The ice misses. The tank is empty.",
    build: { hull: "tender", engine: "biprop", shield: "light" },
    policy: loneBeam({ send: false, engine: "biprop", shield: "light" }),
  },
  {
    id: "lone-beam-cryo",
    name: "Lone beam, cryo Tender",
    aims: "homeSafe",
    summary: "A cryo Tender flies fast and still has the Δv to come home after holding the beam, even with its fuel boiling off.",
    build: { hull: "tender", engine: "cryo", shield: "light" },
    policy: loneBeam({ send: false, engine: "cryo", shield: "light" }),
  },
  {
    id: "martyr",
    name: "Proof, no way home",
    aims: "firstLightStranded",
    summary: "Fast out in a fully kitted Tender, proves the effect, sends the Core packet and holds its own beam on the ice. The ice misses. The fuel for home went on getting there fast.",
    build: { ...BEST_BUILD, sensors: ["thermal", "lidar"] },
    policy: martyr,
  },
  {
    id: "safe-scientist",
    name: "Too slow to save it",
    aims: "firstLight",
    summary: "Takes the safe route and does everything right. The network believes, but turns too late for the ice.",
    build: BEST_BUILD,
    policy: scientist({ help: false, route: "safe", packet: "core" }),
  },
  {
    id: "hoarder",
    name: "Kept it quiet",
    aims: "filedUnread",
    summary: "Gathers 80+ evidence, then walks away without sending.",
    build: BEST_BUILD,
    policy: hoarder,
  },
  {
    id: "tourist",
    name: "Never checked the radiators",
    aims: "lantern17Lost",
    summary: "Safe route, a camera, a quick look at the mirror, and home.",
    build: { sensors: ["camera"] },
    policy: tourist,
  },
];

export function runPolicy(seed: number, policy: Policy, maxSteps = 400) {
  let s = createGame(seed);
  const actions: Action[] = [];
  const rejected: { action: Action; reason: string }[] = [];
  for (let i = 0; i < maxSteps && s.phase !== "debrief"; i++) {
    const a = policy(s);
    const r = step(s, a);
    if (!r.ok) {
      rejected.push({ action: a, reason: r.reason });
      if (rejected.length > 20) break;
      continue;
    }
    actions.push(a);
    s = r.state;
  }
  return { state: s, actions, rejected };
}
