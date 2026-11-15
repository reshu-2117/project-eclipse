"use client";

import { useMemo } from "react";
import { debrief } from "@/lib/game";
import type { GameState, LedgerEntry } from "@/lib/game";
import { CityLamps, MissDiagram, MissionTrace } from "./charts";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

const TONE: Record<string, string> = { best: "#ffd47a", win: "#8fe3b0", price: "#ffb547", partial: "#7fd4e8", notWin: "#ff9a6e", loss: "#ff6a2b" };

function Ledger({ entries }: { entries: LedgerEntry[] }) {
  return (
    <ol className="lab-ledger">
      {entries.map((e) => (
        <li key={e.n} className={`is-${e.kind}`}>
          <span className="lab-mono lab-t">T+{r1(e.t)}</span>
          <div>
            <b>{e.title}</b>
            {e.text && <p>{e.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The whole result of a mission: ending, scores, cities, chart, what you could have done better, the real hardware, and the ledger. */
export default function Result({ s }: { s: GameState }) {
  const d = useMemo(() => debrief(s), [s]);
  const o = d.outcome;
  if (!o || !d.ending) return null;
  return (
    <div className="lab-result">
      <div className={`lab-ending tier-${d.ending.tier}`}>
        <p className="eyebrow">
          Ending <b>{"//"}</b> {d.ending.tierLabel}
        </p>
        <h3 className="display">{d.ending.name}</h3>
        <p className="lab-quote">{d.ending.line}</p>
        <p className="lab-dim">{d.ending.trigger}</p>
      </div>

      <div className="lab-score">
        <div className={o.stationSurvived ? "is-ok" : "is-bad"}>
          <span>Lantern 17</span>
          <b>{o.stationSurvived ? "Standing" : o.stationLostBy === "reactor" ? "Reactor down" : "Hit by the ice"}</b>
        </div>
        <div className={o.crewHome ? "is-ok" : "is-bad"}>
          <span>Crew</span>
          <b>{o.crewHome ? "Home" : "Stranded"}</b>
        </div>
        <div>
          <span>Ice moved</span>
          <b className="lab-mono">{r1(o.iceShiftKm)} / 1.5 km</b>
        </div>
        <div>
          <span>Evidence</span>
          <b className="lab-mono">{o.evidence} / 100</b>
        </div>
        <div>
          <span>Test band</span>
          <b className="lab-mono">{o.bandPct === null ? "no test" : `±${o.bandPct}%`}</b>
        </div>
        <div>
          <span>Δv left</span>
          <b className="lab-mono">{r0(o.dvLeft)} m/s</b>
        </div>
      </div>

      {d.flight && (
        <div className="lab-flight">
          <h3 className="lab-h3">Your flight</h3>
          <div className="lab-score">
            <div className={d.flight.docked ? (d.flight.soft ? "is-ok" : "is-bad") : "is-bad"}>
              <span>Docking</span>
              <b>{d.flight.docked ? (d.flight.soft ? "Soft capture" : "Hard dock") : "Never docked"}</b>
            </div>
            <div>
              <span>Contact speed</span>
              <b className="lab-mono">{d.flight.speed === null ? "—" : `${d.flight.speed.toFixed(2)} m/s`}</b>
            </div>
            <div className={d.flight.extraDv > 30 ? "is-bad" : "is-ok"}>
              <span>Δv vs the route card</span>
              <b className="lab-mono">{d.flight.extraDv >= 0 ? `+${r0(d.flight.extraDv)}` : `−${r0(-d.flight.extraDv)}`} m/s</b>
            </div>
            <div className={d.flight.iceHits ? "is-bad" : "is-ok"}>
              <span>Ice fragment</span>
              <b>{d.flight.iceHits ? `Hit: −${d.flight.iceHull} hull` : "Missed you"}</b>
            </div>
          </div>
        </div>
      )}

      <div className="cx-visuals">
        <MissDiagram o={o} />
        <CityLamps o={o} />
      </div>

      <MissionTrace s={s} ledger={d.ledger} tone={TONE[d.ending.tier]} />

      {d.better.length > 0 && (
        <div className="lab-better">
          <h3 className="lab-h3">What you could have done better</h3>
          {d.better.map((b) => (
            <blockquote key={b}>{b}</blockquote>
          ))}
        </div>
      )}

      <div className="lab-real">
        {d.realLife.map((c) => (
          <div key={c.key}>
            <small>{c.label}</small>
            <b>≈ {c.real}</b>
            <span>{c.note}</span>
          </div>
        ))}
      </div>

      <h3 className="lab-h3">The decision ledger</h3>
      <Ledger entries={d.ledger} />
    </div>
  );
}
