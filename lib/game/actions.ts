/**
 * What can the player do right now, and why not? Each candidate action is tried against the real
 * engine, so the button's enabled state and its "why not" text come from the same rule that runs it.
 */
import { EVENTS } from "./data/events";
import { ROUTE_ORDER } from "./data/routes";
import { ADDONS, COMMS, ENGINES, HULLS, KIT, MOBILITY, POWER, SENSORS, SHIELDS, SUITS } from "./data/ship";
import { ZONE_ORDER } from "./data/station";
import { step } from "./engine";
import type { Action, GameState, Method } from "./types";

export interface Option {
  action: Action;
  ok: boolean;
  reason?: string;
}

const METHODS: Method[] = ["download", "scan", "drone", "arm", "eva"];

export function candidates(s: GameState): Action[] {
  switch (s.phase) {
    case "briefing":
      return [{ type: "begin" }];
    case "hangar":
      return [
        ...Object.keys(HULLS).map((id) => ({ type: "hull", id }) as Action),
        ...Object.keys(ENGINES).map((id) => ({ type: "engine", id }) as Action),
        ...Object.keys(POWER).map((id) => ({ type: "power", id }) as Action),
        ...Object.keys(SHIELDS).map((id) => ({ type: "shield", id }) as Action),
        ...Object.keys(SENSORS).map((id) => ({ type: "sensor", id }) as Action),
        ...Object.keys(COMMS).map((id) => ({ type: "comms", id }) as Action),
        ...Object.keys(KIT).map((id) => ({ type: "kit", id }) as Action),
        ...Object.keys(ADDONS).map((id) => ({ type: "addon", id }) as Action),
        ...Object.keys(SUITS).map((id) => ({ type: "suit", id }) as Action),
        ...Object.keys(MOBILITY).map((id) => ({ type: "mobility", id }) as Action),
        { type: "launch" },
      ];
    case "route":
      return ROUTE_ORDER.map((id) => ({ type: "route", id }));
    case "journey":
      return EVENTS[s.deck[s.card]].choices.map((c) => ({ type: "card", choice: c.id }));
    case "station":
      return [
        { type: "survey" },
        ...ZONE_ORDER.flatMap((zone) => METHODS.map((method) => ({ type: "inspect", zone, method }) as Action)),
        { type: "repair", repair: "leak", method: "eva" },
        { type: "repair", repair: "leak", method: "arm" },
        { type: "repair", repair: "drift", method: "eva" },
        { type: "crossOut", hyp: "H1" },
        { type: "crossOut", hyp: "H2" },
        { type: "crossOut", hyp: "H3" },
        { type: "test" },
        { type: "broadcast", packet: "summary" },
        { type: "broadcast", packet: "core" },
        { type: "broadcast", packet: "full" },
        { type: "toChoice" },
      ];
    case "choice":
      return [
        { type: "choose", option: "A", method: "eva" },
        { type: "choose", option: "A", method: "arm" },
        { type: "choose", option: "B" },
        { type: "choose", option: "C", method: "eva" },
        { type: "choose", option: "C", method: "arm" },
        { type: "choose", option: "D" },
        { type: "choose", option: "E" },
      ];
    case "endgame":
      return [
        { type: "broadcast", packet: "summary" },
        { type: "broadcast", packet: "core" },
        { type: "broadcast", packet: "full" },
        { type: "stay", hours: 1 },
        { type: "stay", hours: 4 },
        { type: "depart" },
      ];
    case "debrief":
      return [];
  }
}

export function options(s: GameState): Option[] {
  return candidates(s).map((action) => {
    const r = step(s, action);
    return r.ok ? { action, ok: true } : { action, ok: false, reason: r.reason };
  });
}
