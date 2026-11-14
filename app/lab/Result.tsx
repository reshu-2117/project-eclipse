"use client";

import { useMemo } from "react";
import { CLOCKS, POWER, SETTLEMENTS, debrief, isEclipse } from "@/lib/game";
import type { GameState, LedgerEntry } from "@/lib/game";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

function Chart({ s }: { s: GameState }) {
  const W = 640;
  const H = 180;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const pts = s.stats.track;
  const maxT = Math.max(32, ...pts.map((p) => p.t));
  const maxDv = Math.max(1, ...pts.map((p) => p.dvLeft));
  const x = (t: number) => pad.l + (t / maxT) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const line = (f: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(f(p)).toFixed(1)}`).join("");
  const eclipse: number[] = [];
  for (let t = 0; t < maxT; t += 0.25) if (isEclipse(t)) eclipse.push(t);
  const eStart = eclipse[0] ?? 0;
  const eEnd = eclipse.length ? eclipse[eclipse.length - 1] + 0.25 : 0;
  const cap = POWER[s.loadout.power].capacityKwh;
  return (
    <figure className="lab-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Δv, energy and evidence over the mission">
        {eclipse.length > 0 && <rect x={x(eStart)} y={pad.t} width={x(eEnd) - x(eStart)} height={H - pad.t - pad.b} className="lab-eclipse" />}
        <line x1={x(CLOCKS.iceTrueH)} x2={x(CLOCKS.iceTrueH)} y1={pad.t} y2={H - pad.b} className="lab-impact" />
        <text x={x(CLOCKS.iceTrueH) + 4} y={pad.t + 10} className="lab-axis">
          impact
        </text>
        {eclipse.length > 0 && (
          <text x={x(eStart) + 4} y={H - pad.b - 6} className="lab-axis">
            eclipse
          </text>
        )}
        {[0, 6, 12, 18, 24, 30].map((t) => (
          <text key={t} x={x(t)} y={H - 6} className="lab-axis" textAnchor="middle">
            {t}h
          </text>
        ))}
        <path d={line((p) => p.dvLeft / maxDv)} className="lab-line is-dv" />
        <path d={line((p) => p.energy / cap)} className="lab-line is-energy" />
        <path d={line((p) => p.evidence / 100)} className="lab-line is-evidence" />
      </svg>
      <figcaption>
        <span className="k is-dv">Δv left</span>
        <span className="k is-energy">Energy</span>
        <span className="k is-evidence">Evidence</span>
      </figcaption>
    </figure>
  );
}

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

      <div className="lab-cities">
        {o.settlements.map((x) => (
          <div key={x.id} className={x.failed ? "is-bad" : ""}>
            <span>{SETTLEMENTS[x.id].name}</span>
            <div className="lab-bar" aria-hidden="true">
              <i style={{ width: `${(x.endH / x.startH) * 100}%` }} />
            </div>
            <b className="lab-mono">{x.failed ? "failed" : `${r1(x.endH)} of ${x.startH} h`}</b>
          </div>
        ))}
      </div>

      <Chart s={s} />

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
