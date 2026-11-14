"use client";

import "./station.css";
import { useMemo, useState } from "react";
import {
  BELIEF,
  CHOICES,
  CLOCKS,
  MIRROR_SEGMENTS_NEEDED,
  MIRROR_WORK_H,
  SETTLEMENTS,
  SETTLEMENT_IDS,
  deadline,
  deliveredLightPct,
  dvLeft,
  evidence,
  fmtHours,
  iceClock,
  jobHours,
  mirrorOutputPct,
  options,
  returnCostDv,
} from "@/lib/game";
import type { Action, ChoiceId, GameState } from "@/lib/game";
import type { Sound } from "./audio";
import { Latest, Transmit } from "./Station";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

const ORDER: ChoiceId[] = ["A", "B", "C", "D", "E"];
const NEEDS_HANDS: ChoiceId[] = ["A", "C"];

/** The big choice, and the last hours at the station. */
export default function Decision({ game, act, sound }: { game: GameState; act: (a: Action) => string | null; sound: Sound }) {
  const [sel, setSel] = useState<ChoiceId | null>(null);
  const [how, setHow] = useState<"eva" | "arm">(game.loadout.kit.includes("arm") ? "arm" : "eva");
  const [from, setFrom] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const opts = useMemo(() => options(game), [game]);

  const run = (a: Action, kind: "lock" | "radio" | "thump" = "lock") => {
    const before = game.log.length;
    const reason = act(a);
    if (reason) {
      sound.reject();
      setFlash(reason);
      return;
    }
    setFlash(null);
    setFrom(before);
    if (kind === "radio") sound.radio();
    else if (kind === "thump") sound.thump(0.7);
    else sound.lock();
  };

  const ev = evidence(game);
  const have = dvLeft(game);
  const ret = returnCostDv(game);
  const left = deadline() - game.t;
  const shift = game.ice.shiftKm;

  // ───────────── the choice ─────────────
  if (game.phase === "choice") {
    const act1 = (id: ChoiceId) => (NEEDS_HANDS.includes(id) ? { type: "choose", option: id, method: how } : { type: "choose", option: id }) as Action;
    const optFor = (id: ChoiceId) => opts.find((o) => o.action.type === "choose" && o.action.option === id && (!NEEDS_HANDS.includes(id) || o.action.method === how));
    const chosen = sel ? CHOICES[sel] : null;
    const chosenOpt = sel ? optFor(sel) : undefined;
    return (
      <div className="st">
        <header className="st-head">
          <p className="eyebrow">
            Lantern 17 <b>{"//"}</b> The big choice, hour {r1(game.t)}
          </p>
          <h1 className="display">
            What do you do <em>with the light?</em>
          </h1>
          <p className="st-lede">
            The ice arrives at hour {CLOCKS.iceTrueH}. That is {fmtHours(Math.max(0, iceClock(game)))} away. One Lantern beaming alone needs about 21 hours to push it 1.5 km aside, so what you do now, and what the network does with what you send, decides the ending.
          </p>
        </header>

        <ul className="st-clocks" aria-label="Where things stand">
          <li className="ice">
            <small>Ice clock</small>
            <b>T−{r1(Math.max(0, iceClock(game)))} h</b>
            <span>impact at hour {CLOCKS.iceTrueH}</span>
          </li>
          <li className={ev >= BELIEF.minEvidence ? "" : "alarm"}>
            <small>Evidence</small>
            <b>{ev} / 100</b>
            <span>{ev >= BELIEF.minEvidence ? "enough to be believed" : `the network needs ${BELIEF.minEvidence}`}</span>
          </li>
          <li className={have < ret ? "alarm" : ""}>
            <small>Getting home</small>
            <b>{r0(ret)} m/s</b>
            <span>
              you have {r0(have)} m/s{have < ret ? ": not enough" : ""}
            </span>
          </li>
          <li className={game.settlements.emberHollow < 6 ? "alarm" : ""}>
            <small>Ember Hollow</small>
            <b>{r1(game.settlements.emberHollow)} h</b>
            <span>of light reserve left</span>
          </li>
        </ul>

        <Latest game={game} from={from} />

        <div className="st-choices" role="radiogroup" aria-label="The big choice">
          {ORDER.map((id) => {
            const c = CHOICES[id];
            const o = optFor(id);
            const blocked = o ? !o.ok : false;
            const hands = NEEDS_HANDS.includes(id);
            const hrs = hands ? jobHours(game, "petals", how, MIRROR_WORK_H[id as "A" | "C"]).hours : 0;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={sel === id}
                className={`st-choice${sel === id ? " on" : ""}${blocked ? " blocked" : ""}`}
                onClick={() => {
                  sound.click();
                  setSel(id);
                  setFlash(null);
                }}
              >
                <i className="st-choice-l">{id}</i>
                <span className="st-choice-body">
                  <b>{c.name}</b>
                  <small>{c.sub}</small>
                  <span className="happens">{c.happens}</span>
                  <span className="cost">{c.cost}</span>
                  {hands && (
                    <span className="meta">
                      Needs {MIRROR_SEGMENTS_NEEDED[id as "A" | "C"]} spare segments ({game.spareSegments} aboard) · {fmtHours(hrs)} by {how === "eva" ? "spacewalk" : "arm"}
                    </span>
                  )}
                  {blocked && o && <span className="why">{o.reason}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {chosen && sel && (
          <section className="st-lock" aria-live="polite">
            <div>
              <p className="eyebrow">
                You are about to <b>{"//"}</b> {chosen.name}
              </p>
              <p>{chosen.happens}</p>
              <p className="cost">{chosen.cost}</p>
              {NEEDS_HANDS.includes(sel) && (
                <div className="st-how" role="group" aria-label="How will the segments be swapped?">
                  {(["arm", "eva"] as const).map((m) => (
                    <button key={m} type="button" className={how === m ? "on" : ""} aria-pressed={how === m} onClick={() => setHow(m)}>
                      {m === "arm" ? "With the arm" : "By spacewalk"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="st-lock-go">
              <button type="button" className="btn btn-lantern" aria-disabled={chosenOpt ? !chosenOpt.ok || undefined : undefined} onClick={() => run(act1(sel), "thump")}>
                Lock it in <span aria-hidden="true">→</span>
              </button>
              {chosenOpt && !chosenOpt.ok && <p className="st-locked">{chosenOpt.reason}</p>}
              <p className="st-note">You cannot take this back.</p>
            </div>
          </section>
        )}

        {flash && (
          <p className="st-flash" role="alert">
            {flash}
          </p>
        )}

        <Transmit game={game} run={(a) => run(a, "radio")} />
      </div>
    );
  }

  // ───────────── the endgame ─────────────
  const choice = game.choice ? CHOICES[game.choice] : null;
  const beaming = game.choice === "B" || game.choice === "C";
  const stayOpt = (h: number) => opts.find((o) => o.action.type === "stay" && o.action.hours === h);
  return (
    <div className="st">
      <header className="st-head">
        <p className="eyebrow">
          Lantern 17 <b>{"//"}</b> {choice ? choice.name : "Holding"}, hour {r1(game.t)}
        </p>
        <h1 className="display">
          {beaming ? (
            <>
              Hold the beam. <em>Then get clear.</em>
            </>
          ) : (
            <>
              The choice is made. <em>Now the clock.</em>
            </>
          )}
        </h1>
        <p className="st-lede">
          {beaming
            ? "The beam only pushes while you stay to guide it, and every hour you stay costs the cities their light. You have to leave before the ice arrives."
            : "You can stay and send your packet, or head home. You have to leave before the ice arrives."}
        </p>
      </header>

      <ul className="st-clocks" aria-label="Where things stand">
        <li className="ice">
          <small>Leave by</small>
          <b>hour {r1(deadline())}</b>
          <span>{left > 0 ? `${fmtHours(left)} from now` : "now"}</span>
        </li>
        <li>
          <small>Light delivered</small>
          <b>{deliveredLightPct(game)}%</b>
          <span>mirror at {mirrorOutputPct(game)}%</span>
        </li>
        <li className={have < ret ? "alarm" : ""}>
          <small>Getting home</small>
          <b>{r0(ret)} m/s</b>
          <span>
            you have {r0(have)} m/s{have < ret ? ": not enough" : ""}
          </span>
        </li>
        <li>
          <small>Mission time</small>
          <b>T+{r1(game.t)} h</b>
          <span>{game.broadcast ? "packet sent" : "no packet sent"}</span>
        </li>
      </ul>

      {(beaming || shift > 0) && (
        <section className="st-card st-ice" aria-label="How far the ice has been pushed">
          <header>
            <p className="eyebrow">
              The ice <b>{"//"}</b> It needs 1.5 km to miss Lantern 17
            </p>
            <h2>
              {r1(shift)} km <small>of 1.5 pushed so far</small>
            </h2>
          </header>
          <div className="st-track big" role="img" aria-label={`The ice has moved ${r1(shift)} of 1.5 kilometres.`}>
            <u style={{ width: `${Math.min(100, (shift / 1.5) * 100)}%` }} />
            <i style={{ left: "100%" }}>
              <em>clear at 1.5 km</em>
            </i>
          </div>
          <p className="st-note">The push grows with the square of the time, so each extra hour counts for more than the last.</p>
        </section>
      )}

      <Latest game={game} from={from} />
      {flash && (
        <p className="st-flash" role="alert">
          {flash}
        </p>
      )}

      <section className="st-card st-act" aria-label="What to do now">
        <div>
          <p className="eyebrow">
            Your move <b>{"//"}</b> Stay or go
          </p>
          <div className="st-act-row">
            {[1, 4].map((h) => {
              const o = stayOpt(h);
              return (
                <div key={h}>
                  <button type="button" className="btn btn-ghost" aria-disabled={!o?.ok || undefined} onClick={() => run({ type: "stay", hours: h })}>
                    Stay {h} hour{h > 1 ? "s" : ""}
                  </button>
                  {o && !o.ok && <p className="st-locked">{o.reason}</p>}
                </div>
              );
            })}
            <div>
              <button type="button" className="btn btn-lantern" onClick={() => run({ type: "depart" }, "thump")}>
                Undock and head home <span aria-hidden="true">→</span>
              </button>
              <p className="st-note">
                Leaving ends the mission: time runs on to the impact hour and the network answers.
                {have < ret ? " You do not have the Δv to get home, so you will be stranded." : ""}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Transmit game={game} run={(a) => run(a, "radio")} must={game.mustBroadcast && !game.broadcast} />

      <section className="st-card" aria-label="The four settlements">
        <p className="eyebrow">
          The cities <b>{"//"}</b> Light reserve left
        </p>
        <ul className="st-towns">
          {SETTLEMENT_IDS.map((id) => (
            <li key={id} className={game.settlements[id] <= 0 ? "out" : ""}>
              <span>{SETTLEMENTS[id].name}</span>
              <div className="st-track">
                <u style={{ width: `${Math.max(0, (game.settlements[id] / SETTLEMENTS[id].reserveH) * 100)}%` }} />
              </div>
              <b>{game.settlements[id] <= 0 ? "dark" : `${r1(game.settlements[id])} h`}</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
