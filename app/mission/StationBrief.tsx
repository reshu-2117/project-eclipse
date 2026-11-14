"use client";

import "./opening.css";
import { useEffect, useRef } from "react";
import { BELIEF, CLOCKS, METHOD_HOURS, REPAIR_HOURS, SURVEY, TEST } from "@/lib/game";
import { STATION_ENTER, type VoiceLine } from "@/lib/game/data/story";

const mins = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

/** The slide before the station: what this stage is, what each part of it costs, and a numbered path so anyone can say "step 3 confused me". */
export default function StationBrief({
  say,
  onBegin,
  resuming,
}: {
  say: (line: VoiceLine) => void;
  onBegin: () => void;
  /** true when the player already started work and only wants the reminder */
  resuming: boolean;
}) {
  const go = useRef<HTMLButtonElement>(null);
  // focus the button for keyboard users without scrolling the slide away from its heading
  useEffect(() => go.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (resuming) return;
    const id = window.setTimeout(() => say(STATION_ENTER), 700);
    return () => window.clearTimeout(id);
  }, [say, resuming]);

  const STEPS: { n: number; title: string; what: string; cost: string }[] = [
    {
      n: 1,
      title: "Survey",
      what: "Fly once around Lantern 17 to map its six zones. With lidar you see all six and which are damaged. Without it, half the map stays blank.",
      cost: `${mins(SURVEY.hours)} and ${SURVEY.kwh} kWh`,
    },
    {
      n: 2,
      title: "Inspect",
      what: "Pick a zone, then a way to look: download its logs, scan from the ship, send a drone, use the arm, or go out on a spacewalk. Different methods find different things.",
      cost: `${mins(METHOD_HOURS.download)} to ${mins(METHOD_HOURS.eva)} each, more for far zones`,
    },
    {
      n: 3,
      title: "Repair",
      what: "Two hazards are hiding: a coolant leak and a drifting gyro. If the leak isn't patched, the reactor shuts itself down at hour 20.",
      cost: `${mins(REPAIR_HOURS.leak)} for the leak, ${mins(REPAIR_HOURS.drift)} for the drift`,
    },
    {
      n: 4,
      title: "Evidence board",
      what: "Every find pins a clue (there are six). Three explanations are on the table, and two are wrong. Rule them out when your clues allow it.",
      cost: `The network believes you at ${BELIEF.minEvidence} out of 100`,
    },
    {
      n: 5,
      title: "The test",
      what: "Once two clues are pinned and one wrong explanation is ruled out, aim the cracked mirror at a block of ice and measure the push. Your best sensor decides how sure you can be.",
      cost: `${mins(TEST.hours)}, and Lantern 17 goes dark for ${mins(TEST.darkHours)}`,
    },
    {
      n: 6,
      title: "Send, choose, leave",
      what: "Send one packet to the network before the ice arrives, then make the big choice (A to E), hold the beam if you chose to, and undock.",
      cost: `The ice hits at hour ${CLOCKS.iceTrueH}`,
    },
  ];

  return (
    <main className="ms-brief" id="main">
      <div className="ms-brief-inner">
        <header className="ms-brief-head">
          <p className="eyebrow">
            Lantern 17 <b>{"//"}</b> Stage briefing
          </p>
          <h1 className="display">
            What happens <em>at the station.</em>
          </h1>
          <p className="ms-brief-lede">
            You are docked. Lantern 17 is failing and the obvious reason may not be the true one. This stage has six steps. You do not have to do them in order, but every step costs hours, and the ice clock does not stop.
          </p>
        </header>

        <ol className="ms-steps" aria-label="The six steps at the station">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="ms-step-n">{s.n}</span>
              <div>
                <b>{s.title}</b>
                <p>{s.what}</p>
                <small>{s.cost}</small>
              </div>
            </li>
          ))}
        </ol>

        <div className="ms-stakes" aria-label="What you are spending">
          <p className="ms-term-h">What you are spending</p>
          <ul>
            <li>
              <b>Time</b> <span>every job takes hours</span>
            </li>
            <li>
              <b>Energy</b> <span>sensors and radios drain it</span>
            </li>
            <li>
              <b>Suit air and drones</b> <span>limited, and they do not refill</span>
            </li>
            <li>
              <b>Evidence</b> <span>what you earn, and what the network needs</span>
            </li>
          </ul>
        </div>

        <div className="ms-brief-go">
          <button ref={go} type="button" className="btn btn-lantern" onClick={onBegin}>
            {resuming ? "Back to work" : "Begin at the station"} <span aria-hidden="true">→</span>
          </button>
          <p>Each step has a number. If something is unclear, tell the team the step number.</p>
        </div>
      </div>
    </main>
  );
}
