import { PRESETS, actionsToReach, createGame, options, step } from "@/lib/game";
import type { Action, GameState } from "@/lib/game";

/**
 * A reviewer's shortcut: the actions that take a fresh game, with the Investigator ship and the safe route, to the
 * station or to the big choice. Every action goes through the real engine, so the result is an honest run that
 * replays and saves like any other.
 */
export function actionsTo(seed: number, target: "station" | "choice"): { actions: Action[]; state: GameState } {
  const actions: Action[] = [];
  let s = createGame(seed);
  const go = (a: Action) => {
    const r = step(s, a);
    if (!r.ok) throw new Error(`Shortcut step rejected: ${r.reason}`);
    actions.push(a);
    s = r.state;
  };
  go({ type: "begin" });
  const ship = PRESETS.find((p) => p.id === "investigator")!.loadout;
  for (const a of actionsToReach(s, ship)) go(a);
  go({ type: "launch" });
  go({ type: "route", id: "safe" });
  // each event card: the first choice the engine allows
  for (let i = 0; i < 8 && s.phase === "journey"; i++) {
    const pick = options(s).find((o) => o.ok);
    if (!pick) break;
    go(pick.action);
  }
  if (target === "choice" && s.phase === "station") {
    go({ type: "survey" });
    go({ type: "toChoice" });
  }
  return { actions, state: s };
}

/** A reviewer's shortcut to the flight deck: the Investigator ship, launched on the quick route, piloted. */
export function actionsToFlight(seed: number): { actions: Action[]; state: GameState } {
  const actions: Action[] = [];
  let s = createGame(seed);
  const go = (a: Action) => {
    const r = step(s, a);
    if (!r.ok) throw new Error(`Shortcut step rejected: ${r.reason}`);
    actions.push(a);
    s = r.state;
  };
  go({ type: "begin" });
  const ship = PRESETS.find((p) => p.id === "investigator")!.loadout;
  for (const a of actionsToReach(s, ship)) go(a);
  go({ type: "launch" });
  go({ type: "route", id: "quick", piloted: true });
  return { actions, state: s };
}
