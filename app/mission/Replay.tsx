"use client";

/**
 * "Replay with one change": the same seed (so the same events and the same ice), restarted from the
 * hangar or from the launch, and a ghost of the last result to beat.
 */
import { useSyncExternalStore } from "react";
import { debrief } from "@/lib/game";
import type { GameState } from "@/lib/game";

const GHOST_KEY = "eclipse-ghost";

export interface Ghost {
  seed: number;
  ending: string;
  iceKm: number;
  evidence: number;
  hull: number;
  dvLeft: number;
  survived: boolean;
}

function readGhost(): string {
  try {
    return window.sessionStorage.getItem(GHOST_KEY) ?? "";
  } catch {
    return "";
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener("eclipse-ghost", cb);
  return () => window.removeEventListener("eclipse-ghost", cb);
};

/** Remember this result before starting the replay. */
export function saveGhost(g: GameState) {
  const d = debrief(g);
  if (!d.outcome || !d.ending) return;
  const ghost: Ghost = {
    seed: g.seed,
    ending: d.ending.name,
    iceKm: d.outcome.iceShiftKm,
    evidence: d.outcome.evidence,
    hull: g.hull,
    dvLeft: d.outcome.dvLeft,
    survived: d.outcome.stationSurvived,
  };
  try {
    window.sessionStorage.setItem(GHOST_KEY, JSON.stringify(ghost));
    window.dispatchEvent(new Event("eclipse-ghost"));
  } catch {
    /* private window */
  }
}

/** The last run on this seed against this one. */
export function GhostCompare({ game }: { game: GameState }) {
  const raw = useSyncExternalStore(subscribe, readGhost, () => "");
  let ghost: Ghost | null = null;
  try {
    ghost = raw ? (JSON.parse(raw) as Ghost) : null;
  } catch {
    ghost = null;
  }
  const d = debrief(game);
  if (!ghost || ghost.seed !== game.seed || !d.outcome || !d.ending) return null;
  const rows: [string, string, string, boolean | null][] = [
    ["Ending", ghost.ending, d.ending.name, null],
    ["Lantern 17", ghost.survived ? "Standing" : "Lost", d.outcome.stationSurvived ? "Standing" : "Lost", d.outcome.stationSurvived && !ghost.survived ? true : !d.outcome.stationSurvived && ghost.survived ? false : null],
    ["Ice moved", `${ghost.iceKm.toFixed(1)} km`, `${d.outcome.iceShiftKm.toFixed(1)} km`, d.outcome.iceShiftKm > ghost.iceKm + 0.05 ? true : d.outcome.iceShiftKm < ghost.iceKm - 0.05 ? false : null],
    ["Evidence", `${ghost.evidence}`, `${d.outcome.evidence}`, d.outcome.evidence > ghost.evidence ? true : d.outcome.evidence < ghost.evidence ? false : null],
    ["Hull", `${ghost.hull}`, `${game.hull}`, game.hull > ghost.hull ? true : game.hull < ghost.hull ? false : null],
    ["Δv left", `${Math.round(ghost.dvLeft)} m/s`, `${Math.round(d.outcome.dvLeft)} m/s`, d.outcome.dvLeft > ghost.dvLeft + 5 ? true : d.outcome.dvLeft < ghost.dvLeft - 5 ? false : null],
  ];
  return (
    <section className="rp-ghost" aria-label="Last time against this time">
      <p className="eyebrow">
        Same events, one change <b>{"//"}</b> Last time against this time
      </p>
      <table>
        <thead>
          <tr>
            <th />
            <th>Last time</th>
            <th>This time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b, better]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{a}</td>
              <td className={better === true ? "up" : better === false ? "down" : ""}>
                {b} {better === true ? "▲" : better === false ? "▼" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The two replay buttons. */
export function ReplayButtons({ game, onReplay }: { game: GameState; onReplay: (at: "hangar" | "route") => void }) {
  return (
    <div className="rp-actions">
      <p>
        <b>Replay with one change.</b> Same events, same ice, same clock. Change one thing and see what it does.
      </p>
      <div className="ms-gate-actions">
        <button
          type="button"
          className="btn btn-lantern"
          onClick={() => {
            saveGhost(game);
            onReplay("hangar");
          }}
        >
          Change the ship <span aria-hidden="true">↺</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            saveGhost(game);
            onReplay("route");
          }}
        >
          Same ship, fly it again
        </button>
      </div>
    </div>
  );
}
