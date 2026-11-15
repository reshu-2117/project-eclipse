"use client";

import { useEffect, useRef, useState } from "react";
import {
  BRIEFING_HEADER,
  DIRECTOR_ACCEPT,
  DIRECTOR_BRIEF,
  METERS,
  ONE_RULE,
  UNKNOWNS,
  type VoiceLine,
} from "@/lib/game/data/story";
import type { Sound } from "./audio";
import { useReducedMotion } from "./Opening";

/** The briefing: the Director's terminal. What we know, what we don't, and the five meters the game is played on. */
import Lumen from "../guide/Lumen";

export default function Briefing({ sound, say, onAccept }: { sound: Sound; say: (line: VoiceLine) => void; onAccept: () => void }) {
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    const id = window.setTimeout(() => say(DIRECTOR_BRIEF), 700);
    return () => window.clearTimeout(id);
  }, [say]);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const accept = () => {
    if (leaving) return;
    setLeaving(true);
    sound.lock();
    say(DIRECTOR_ACCEPT);
    timer.current = window.setTimeout(onAccept, reduce ? 2600 : 4200);
  };

  return (
    <main className={`ms-brief${leaving ? " leaving" : ""}`} id="main">
      <div className="ms-brief-inner">
        <header className="ms-brief-head">
          <p className="eyebrow">
            {BRIEFING_HEADER} <b>{"//"}</b> Priority one
          </p>
          <h1 className="display">
            You are going <em>out there.</em>
          </h1>
        </header>

        <div className="ms-brief-grid">
          <section className="ms-term" aria-labelledby="brief-msg" data-explain="Your orders from the Director, and what nobody knows yet. Finding out is your job.">
            <p className="ms-term-bar">
              <i /> <i /> <i /> <span>OPS &gt; DIRECTOR &gt; CREW</span>
            </p>
            <h2 id="brief-msg" className="sr-only">
              Message from the Director
            </h2>
            <p className="ms-term-line">
              <b>DIRECTOR</b> {DIRECTOR_BRIEF.text}
            </p>
            <p className="ms-term-line dim">
              <b>STATUS</b> Lantern 17 output is at 61% and still falling. A tracked ice body is on its way. Three telemetry channels have gone quiet.
            </p>
            <h3 className="ms-term-h">What we do not know</h3>
            <ul className="ms-unknowns">
              {UNKNOWNS.map((u) => (
                <li key={u.key}>
                  <b>{u.title}</b>
                  <span>{u.text}</span>
                </li>
              ))}
            </ul>
          </section>

          <aside className="ms-meters-card" aria-labelledby="brief-meters" data-explain="The five things you are scored on. Every choice you make moves at least one of them up or down.">
            <h2 id="brief-meters" className="ms-term-h">
              The five meters
            </h2>
            <ul>
              {METERS.map((m, i) => (
                <li key={m.key}>
                  <span className="ms-m-n">{i + 1}</span>
                  <div>
                    <b>
                      {m.name} <small>{m.full}</small>
                    </b>
                    <span>{m.text}</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="ms-brief-rule">{ONE_RULE}</p>
          </aside>
        </div>

        {!leaving && (
          <Lumen
            tip={{
              id: "briefing",
              title: "the job",
              text: "Hi, I'm Lumen. I'll stay with you the whole mission. The job: Lantern 17, one of the mirrors that lights the cities, is dimming. Build a ship, fly up to it, find out why, and decide what to do. Tap me any time to hide me.",
              target: ".ms-brief-go .btn-lantern",
            }}
          />
        )}
        <div className="ms-brief-go">
          <button ref={go} type="button" className="btn btn-lantern" onClick={accept} disabled={leaving}>
            {leaving ? "Heading to the Wick…" : "Accept the mission"} {!leaving && <span aria-hidden="true">↗</span>}
          </button>
          <p>You will build your ship at the Wick, the orbital dock at 300 km.</p>
        </div>
      </div>
    </main>
  );
}
