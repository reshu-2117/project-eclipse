"use client";

import { useState } from "react";
import {
  CHOICES,
  CLOCKS,
  MIRROR_SEGMENTS_NEEDED,
  MIRROR_WORK_H,
  SETTLEMENTS,
  SETTLEMENT_IDS,
  deadline,
  deliveredLightPct,
  dvLeft,
  fmtHours,
  jobHours,
  returnCostDv,
} from "@/lib/game";
import type { Action, ChoiceId } from "@/lib/game";
import { DEPART } from "@/lib/game/data/story";
import { Latest, r0, r1, type QuestCtx } from "./shared";

const ORDER: ChoiceId[] = ["A", "B", "C", "D", "E"];
const HANDS: ChoiceId[] = ["A", "C"];

const PLAIN: Record<ChoiceId, { title: string; text: string }> = {
  A: { title: "Repair the mirror", text: "Swap all the broken mirror pieces. Lantern 17 shines at full power and the cities recover, but the mirror can no longer push the ice." },
  B: { title: "Fire the broken mirror at the ice", text: "Keep the mirror cracked and aim Lantern 17 at the ice to push it away. The cities lose their light the whole time, and Ember Hollow's farms may fail." },
  C: { title: "Fix half, keep a weapon", text: "Swap some pieces but keep one cracked on purpose. The cities get most of their light back and you can still push the ice, more slowly. Needs spare mirror parts." },
  D: { title: "Let the network decide", text: "Leave the mirror alone. Send everything you found and let the other Lanterns decide what to do." },
  E: { title: "Leave now", text: "Fly home with what you have. Lantern 17's fate is up to whatever happens next." },
};

/** The big decision: five options, pick one, then lock it in. */
export function Decision({ c }: { c: QuestCtx }) {
  const g = c.game;
  const [sel, setSel] = useState<ChoiceId | null>(null);
  const [how, setHow] = useState<"eva" | "arm">(g.loadout.kit.includes("arm") ? "arm" : "eva");
  const act1 = (id: ChoiceId) => (HANDS.includes(id) ? { type: "choose", option: id, method: how } : { type: "choose", option: id }) as Action;
  const optFor = (id: ChoiceId) => c.opts.find((o) => o.action.type === "choose" && o.action.option === id && (!HANDS.includes(id) || o.action.method === how));
  const have = dvLeft(g);
  const ret = returnCostDv(g);
  const left = CLOCKS.iceTrueH - g.t;
  const selOpt = sel ? optFor(sel) : undefined;

  return (
    <div className="sq-panel wide">
      <h2>The big decision</h2>
      <p className="sq-lede">
        The ice arrives at hour {CLOCKS.iceTrueH}. That is {fmtHours(Math.max(0, left))} from now. Pick what to do about Lantern 17. <b>You cannot take it back.</b>
      </p>
      <ul className="sq-facts">
        <li>
          <small>Proof you have</small>
          <b>{r0(g.found.filter((f) => f.startsWith("C")).length)} clues</b>
        </li>
        <li className={have < ret ? "bad" : ""}>
          <small>Flying home needs</small>
          <b>{r0(ret)} m/s</b>
          <span>you have {r0(have)}</span>
        </li>
        <li className={g.settlements.emberHollow < 6 ? "bad" : ""}>
          <small>Ember Hollow has</small>
          <b>{r1(g.settlements.emberHollow)} h</b>
          <span>of light left</span>
        </li>
        <li>
          <small>Your report</small>
          <b>{g.broadcast ? "sent" : "not sent"}</b>
        </li>
      </ul>

      <div className="sq-choices" role="radiogroup" aria-label="The big decision">
        {ORDER.map((id) => {
          const o = optFor(id);
          const blocked = o ? !o.ok : false;
          const hrs = HANDS.includes(id) ? jobHours(g, "petals", how, MIRROR_WORK_H[id as "A" | "C"]).hours : 0;
          return (
            <button key={id} type="button" role="radio" aria-checked={sel === id} className={`sq-choice${sel === id ? " on" : ""}${blocked ? " blocked" : ""}`} onClick={() => setSel(id)}>
              <i>{id}</i>
              <span>
                <b>{PLAIN[id].title}</b>
                <span className="t">{PLAIN[id].text}</span>
                <span className="cost">The catch: {CHOICES[id].cost}</span>
                {HANDS.includes(id) && (
                  <span className="meta">
                    Needs {MIRROR_SEGMENTS_NEEDED[id as "A" | "C"]} spare mirror parts (you have {g.spareSegments}) · {fmtHours(hrs)}
                  </span>
                )}
                {blocked && o && <span className="why">{o.reason}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="sq-lock">
          <div>
            <p className="sq-eyebrow">You picked</p>
            <h3>{PLAIN[sel].title}</h3>
            {HANDS.includes(sel) && (
              <div className="sq-how" role="group" aria-label="How to swap the mirror parts">
                {(["arm", "eva"] as const).map((m) => (
                  <button key={m} type="button" className={how === m ? "on" : ""} aria-pressed={how === m} onClick={() => setHow(m)}>
                    {m === "arm" ? "With the robot arm" : "On a spacewalk"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="sq-actions">
            <button type="button" className="sq-btn big" aria-disabled={selOpt ? !selOpt.ok || undefined : undefined} onClick={() => c.run(act1(sel), "thump")}>
              Lock it in <span aria-hidden="true">→</span>
            </button>
            {selOpt && !selOpt.ok && <p className="sq-why">{selOpt.reason}</p>}
          </div>
        </div>
      )}
      {c.flash && <p className="sq-flash" role="alert">{c.flash}</p>}
      <Latest game={g} from={c.from} />
    </div>
  );
}

/** The last hours: stay and guide the beam, send your report, or leave. */
export function FinalHours({ c }: { c: QuestCtx }) {
  const g = c.game;
  const choice = g.choice ? CHOICES[g.choice] : null;
  const beaming = g.choice === "B" || g.choice === "C";
  const have = dvLeft(g);
  const ret = returnCostDv(g);
  const left = deadline() - g.t;
  const stay = (h: number) => c.opts.find((o) => o.action.type === "stay" && o.action.hours === h);
  const sendReport = (id: "summary" | "core" | "full") => c.opts.find((o) => o.action.type === "broadcast" && o.action.packet === id);

  return (
    <div className="sq-panel wide">
      <h2>{beaming ? "Hold the beam, then get out" : "The final hours"}</h2>
      <p className="sq-lede">
        You chose: <b>{choice ? PLAIN[choice.id].title : "to hold"}</b>. {beaming ? "The beam only pushes while you stay and guide it, and every hour costs the cities their light. " : ""}You must leave by hour {r1(deadline())}, which is {fmtHours(Math.max(0, left))} from now.
      </p>

      <ul className="sq-facts">
        <li>
          <small>Light reaching cities</small>
          <b>{deliveredLightPct(g)}%</b>
        </li>
        <li className={have < ret ? "bad" : ""}>
          <small>Flying home needs</small>
          <b>{r0(ret)} m/s</b>
          <span>you have {r0(have)}{have < ret ? ": not enough" : ""}</span>
        </li>
        <li>
          <small>Your report</small>
          <b>{g.broadcast ? "sent" : "not sent"}</b>
        </li>
      </ul>

      {(beaming || g.ice.shiftKm > 0) && (
        <div className="sq-ice">
          <p className="sq-eyebrow">The ice has moved {r1(g.ice.shiftKm)} km of the 1.5 km it needs</p>
          <div className="sq-bar" role="img" aria-label={`The ice has moved ${r1(g.ice.shiftKm)} of 1.5 kilometres`}>
            <u style={{ width: `${Math.min(100, (g.ice.shiftKm / 1.5) * 100)}%` }} />
          </div>
          <p className="sq-small">The push gets stronger the longer you stay: an extra hour near the end counts for more than one at the start.</p>
        </div>
      )}

      <Latest game={g} from={c.from} />
      {c.flash && <p className="sq-flash" role="alert">{c.flash}</p>}

      <div className="sq-cards three">
        <article className="sq-card">
          <h3>Stay a while</h3>
          <p>{beaming ? "Guide the beam so it keeps pushing the ice." : "Wait at the station."}</p>
          <div className="sq-actions">
            {[1, 4].map((h) => (
              <div key={h}>
                <button type="button" className="sq-btn" aria-disabled={!stay(h)?.ok || undefined} onClick={() => c.run({ type: "stay", hours: h })}>
                  Stay {h} hour{h > 1 ? "s" : ""}
                </button>
                {stay(h) && !stay(h)!.ok && <p className="sq-why">{stay(h)!.reason}</p>}
              </div>
            ))}
          </div>
        </article>

        {!g.broadcast && (
          <article className={`sq-card${g.mustBroadcast ? " hot" : ""}`}>
            <h3>Send your report</h3>
            <p>{g.mustBroadcast ? "You chose to let the network decide, so send everything you can." : "You have not sent your report yet. You only get one."}</p>
            <div className="sq-actions">
              {(["core", "full"] as const).map((id) => (
                <div key={id}>
                  <button type="button" className="sq-btn" aria-disabled={!sendReport(id)?.ok || undefined} onClick={() => c.run({ type: "broadcast", packet: id }, "radio")}>
                    Send the {id} report
                  </button>
                  {sendReport(id) && !sendReport(id)!.ok && <p className="sq-why">{sendReport(id)!.reason}</p>}
                </div>
              ))}
            </div>
          </article>
        )}

        <article className="sq-card leave">
          <h3>Leave the station</h3>
          <p>Undock and fly home. This ends the mission: time runs on to the impact and the network answers.{have < ret ? " You do not have the fuel power to get home, so you will be stranded." : ""}</p>
          <button
            type="button"
            className="sq-btn big"
            onClick={() => {
              c.say(DEPART);
              c.run({ type: "depart" }, "thump");
            }}
          >
            Undock and go home <span aria-hidden="true">→</span>
          </button>
        </article>
      </div>

      <div className="sq-towns">
        <p className="sq-eyebrow">How much light each city has left</p>
        <ul>
          {SETTLEMENT_IDS.map((id) => (
            <li key={id} className={g.settlements[id] <= 0 ? "out" : ""}>
              <span>{SETTLEMENTS[id].name}</span>
              <div className="sq-bar small">
                <u style={{ width: `${Math.max(0, (g.settlements[id] / SETTLEMENTS[id].reserveH) * 100)}%` }} />
              </div>
              <b>{g.settlements[id] <= 0 ? "dark" : `${r1(g.settlements[id])} h`}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
