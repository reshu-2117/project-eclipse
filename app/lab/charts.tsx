"use client";

import "./charts.css";
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CLOCKS, POWER, SETTLEMENTS, isEclipse } from "@/lib/game";
import type { GameState, LedgerEntry, Outcome } from "@/lib/game";
import { useReducedMotion } from "../mission/Opening";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

/* ------------------------------------------------------------------ */
/* A smooth curve through points that never overshoots (monotone cubic) */
/* ------------------------------------------------------------------ */
function curve(raw: [number, number][]) {
  // one point per x (the last one wins), in order
  const pts: [number, number][] = [];
  for (const p of raw) {
    if (pts.length && Math.abs(pts[pts.length - 1][0] - p[0]) < 1e-6) pts[pts.length - 1] = p;
    else pts.push(p);
  }
  const n = pts.length;
  if (n < 2) return { d: n ? `M${pts[0][0]},${pts[0][1]}` : "", at: () => (n ? pts[0][1] : 0), last: pts[n - 1] };
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) s.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const m: number[] = [s[0]];
  for (let i = 1; i < n - 1; i++) m.push(s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2);
  m.push(s[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) m[i] = m[i + 1] = 0;
    else {
      const a = m[i] / s[i];
      const b = m[i + 1] / s[i];
      const h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        m[i] = t * a * s[i];
        m[i + 1] = t * b * s[i];
      }
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    d += `C${(pts[i][0] + dx / 3).toFixed(1)},${(pts[i][1] + (m[i] * dx) / 3).toFixed(1)} ${(pts[i + 1][0] - dx / 3).toFixed(1)},${(pts[i + 1][1] - (m[i + 1] * dx) / 3).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  const at = (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (pts[i + 1][0] < x) i++;
    const h = pts[i + 1][0] - pts[i][0];
    const t = (x - pts[i][0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
  return { d, at, last: pts[n - 1] };
}

/* ------------------------------------------------------------------ */
/* The mission trace                                                   */
/* ------------------------------------------------------------------ */
const W = 720;
const H = 320;
const PAD = { l: 18, r: 18, t: 40, b: 46 };
type Key = "dv" | "energy" | "evidence";
const SERIES: { key: Key; label: string; color: string; unit: string }[] = [
  { key: "dv", label: "Speed left (Δv)", color: "#ffb547", unit: "m/s" },
  { key: "energy", label: "Energy", color: "#7fd4e8", unit: "kWh" },
  { key: "evidence", label: "Evidence", color: "#8fe3b0", unit: "pts" },
];

export function MissionTrace({ s, ledger, tone }: { s: GameState; ledger: LedgerEntry[]; tone: string }) {
  const reduce = useReducedMotion();
  const pts = s.stats.track;
  const maxT = Math.max(32, Math.ceil(Math.max(...pts.map((p) => p.t)) / 4) * 4);
  const maxDv = Math.max(1, ...pts.map((p) => p.dvLeft));
  const cap = POWER[s.loadout.power].capacityKwh;
  const [on, setOn] = useState<Record<Key, boolean>>({ dv: true, energy: true, evidence: true });
  const [cursor, setCursor] = useState<number | null>(null);

  const x = (t: number) => PAD.l + (t / maxT) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.max(0, Math.min(1, v))) * (H - PAD.t - PAD.b);
  const base = H - PAD.b;

  const curves = useMemo(() => {
    const mk = (f: (p: (typeof pts)[number]) => number) => curve(pts.map((p) => [x(p.t), y(f(p))] as [number, number]));
    return {
      dv: mk((p) => p.dvLeft / maxDv),
      energy: mk((p) => p.energy / cap),
      evidence: mk((p) => p.evidence / 100),
    };
    // x and y only depend on the values above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, maxT, maxDv, cap]);

  const eclipses = useMemo(() => {
    const out: [number, number][] = [];
    let start: number | null = null;
    for (let t = 0; t <= maxT + 1e-9; t += 0.25) {
      const e = isEclipse(t);
      if (e && start === null) start = t;
      if (!e && start !== null) {
        out.push([start, t]);
        start = null;
      }
    }
    if (start !== null) out.push([start, maxT]);
    return out;
  }, [maxT]);

  const endT = pts.length ? pts[pts.length - 1].t : 0;
  const t = cursor ?? endT;
  const idx = (() => {
    let k = 0;
    while (k + 1 < pts.length && pts[k + 1].t <= t) k++;
    return k;
  })();
  const interp = (f: (p: (typeof pts)[number]) => number) => {
    const a = pts[idx];
    const b = pts[Math.min(idx + 1, pts.length - 1)];
    if (!a) return 0;
    if (a === b || b.t === a.t) return f(a);
    const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    return f(a) + (f(b) - f(a)) * k;
  };
  const read = { dv: interp((p) => p.dvLeft), energy: interp((p) => p.energy), evidence: interp((p) => p.evidence) };
  const lastEntry = [...ledger].reverse().find((e) => e.t <= t + 1e-6) ?? ledger[0];

  const timeAt = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(endT, ((px - PAD.l) / (W - PAD.l - PAD.r)) * maxT));
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => setCursor(timeAt(e.clientX, e.currentTarget));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 2 : 0.5;
    if (e.key === "ArrowRight") setCursor(Math.min(endT, t + step));
    else if (e.key === "ArrowLeft") setCursor(Math.max(0, t - step));
    else if (e.key === "Home") setCursor(0);
    else if (e.key === "End") setCursor(null);
    else return;
    e.preventDefault();
  };

  const ticks = Array.from({ length: Math.floor(maxT / 6) + 1 }, (_, i) => i * 6);
  const runKey = `${pts.length}-${endT}-${s.seed ?? ""}`;
  const cx = x(t);

  return (
    <figure className="cx-trace" style={{ ["--tone" as string]: tone }}>
      <div className="cx-readout" aria-live="polite">
        <div className="cx-clock">
          <small>Mission time</small>
          <b>
            T+{r1(t)}
            <i> h</i>
          </b>
        </div>
        {SERIES.map((k) => (
          <div key={k.key} className={on[k.key] ? "" : "off"} style={{ ["--c" as string]: k.color }}>
            <small>{k.label}</small>
            <b>
              {k.key === "dv" ? r0(read.dv) : k.key === "energy" ? r1(read.energy) : r0(read.evidence)}
              <i> {k.unit}</i>
            </b>
          </div>
        ))}
        <p className="cx-now">
          <small>Just happened</small>
          {lastEntry ? lastEntry.title : "—"}
        </p>
      </div>

      <svg
        key={runKey}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`Speed left, energy and evidence over the mission. Use the left and right arrow keys to move through time. At T plus ${r1(t)} hours: ${r0(read.dv)} metres per second left, ${r1(read.energy)} kilowatt hours, ${r0(read.evidence)} evidence points.`}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={onKey}
        onBlur={() => setCursor(null)}
        className={reduce ? "still" : ""}
      >
        <defs>
          {SERIES.map((k) => (
            <linearGradient key={k.key} id={`cx-a-${k.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={k.color} stopOpacity="0.32" />
              <stop offset="1" stopColor={k.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <pattern id="cx-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(127,212,232,0.18)" strokeWidth="1.4" />
          </pattern>
          <linearGradient id="cx-eclipse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(127,212,232,0.16)" />
            <stop offset="1" stopColor="rgba(127,212,232,0.02)" />
          </linearGradient>
          <filter id="cx-glow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <clipPath id="cx-clip">
            <rect x={PAD.l} y={PAD.t - 8} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b + 16} />
          </clipPath>
        </defs>

        {/* the horizontal grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="cx-grid" />
        ))}

        {/* the Eclipse: the network dims, comms slow */}
        {eclipses.map(([a, b]) => (
          <g key={a}>
            <rect x={x(a)} y={PAD.t - 8} width={x(b) - x(a)} height={H - PAD.t - PAD.b + 16} fill="url(#cx-eclipse)" />
            <rect x={x(a)} y={PAD.t - 8} width={x(b) - x(a)} height={H - PAD.t - PAD.b + 16} fill="url(#cx-hatch)" />
            <text x={(x(a) + x(b)) / 2} y={PAD.t - 16} className="cx-tag ice" textAnchor="middle">
              ECLIPSE
            </text>
          </g>
        ))}

        {/* the ice's true arrival */}
        <g>
          <line x1={x(CLOCKS.iceTrueH)} x2={x(CLOCKS.iceTrueH)} y1={PAD.t - 8} y2={base + 8} className="cx-impact" />
          <circle cx={x(CLOCKS.iceTrueH)} cy={PAD.t - 8} r="4" className="cx-impact-dot" />
          <text x={x(CLOCKS.iceTrueH) - 8} y={PAD.t - 16} className="cx-tag ember" textAnchor="end">
            IMPACT · {CLOCKS.iceTrueH} H
          </text>
        </g>

        {/* the three traces: an area, a soft glow, then the line itself */}
        <g clipPath="url(#cx-clip)">
          {SERIES.map((k) => {
            const c = curves[k.key];
            const lastP = c.last;
            return (
              <g key={k.key} className={`cx-series${on[k.key] ? "" : " off"}`} style={{ ["--c" as string]: k.color }}>
                <path d={`${c.d}L${lastP[0].toFixed(1)},${base}L${x(pts[0]?.t ?? 0).toFixed(1)},${base}Z`} fill={`url(#cx-a-${k.key})`} className="cx-area" />
                <path d={c.d} className="cx-glow" filter="url(#cx-glow)" pathLength={1} />
                <path d={c.d} className="cx-line" pathLength={1} />
              </g>
            );
          })}
        </g>

        {/* the last point of the mission: where the story ended */}
        {pts.length > 0 && (
          <g className="cx-end">
            <line x1={x(endT)} x2={x(endT)} y1={PAD.t - 8} y2={base + 8} />
            <text x={x(endT) + (x(endT) > W - 90 ? -8 : 8)} y={base + 22} className="cx-tag tone" textAnchor={x(endT) > W - 90 ? "end" : "start"}>
              END · {r1(endT)} H
            </text>
          </g>
        )}

        {/* the decision ticks along the time axis */}
        <g>
          {ledger.map((e) => (
            <line
              key={e.n}
              x1={x(Math.min(e.t, maxT))}
              x2={x(Math.min(e.t, maxT))}
              y1={base + 2}
              y2={base + (e.kind === "alarm" ? 11 : e.kind === "choice" ? 9 : 6)}
              className={`cx-tick ${e.kind}`}
            />
          ))}
        </g>
        <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} className="cx-axis" />
        {ticks.map((h) => (
          <text key={h} x={x(h)} y={H - 8} className="cx-tag" textAnchor="middle">
            {h} H
          </text>
        ))}

        {/* the cursor */}
        <g className="cx-cursor" style={{ ["--x" as string]: `${cx}px` }}>
          <line x1={cx} x2={cx} y1={PAD.t - 8} y2={base} />
          {SERIES.map((k) =>
            on[k.key] && pts.length ? (
              <circle key={k.key} cx={cx} cy={curves[k.key].at(cx)} r="5" style={{ ["--c" as string]: k.color }} />
            ) : null,
          )}
        </g>
      </svg>

      <figcaption>
        <div className="cx-keys" role="group" aria-label="Show or hide a trace">
          {SERIES.map((k) => (
            <button key={k.key} type="button" aria-pressed={on[k.key]} className={on[k.key] ? "on" : ""} style={{ ["--c" as string]: k.color }} onClick={() => setOn((o) => ({ ...o, [k.key]: !o[k.key] }))}>
              <i aria-hidden="true" />
              {k.label}
            </button>
          ))}
        </div>
        <span className="cx-hint">Move across the chart, or use the arrow keys, to read any moment. Ticks along the bottom are decisions.</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* The cities: four lamps, each one a ring of stored light              */
/* ------------------------------------------------------------------ */
export function CityLamps({ o }: { o: Outcome }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <section className="cx-lamps" aria-label="Light reserves of the four settlements">
      <h4 className="cx-title">The cities, by the light they kept</h4>
      <ul>
        {o.settlements.map((x, i) => {
          const f = Math.max(0, Math.min(1, x.endH / x.startH));
          return (
            <li key={x.id} className={x.failed ? "out" : f < 0.5 ? "low" : ""} style={{ ["--i" as string]: i, ["--f" as string]: f }}>
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                  <radialGradient id={`cx-lamp-${x.id}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0" stopColor="#ffd47a" stopOpacity={x.failed ? 0 : 0.2 + 0.55 * f} />
                    <stop offset="1" stopColor="#ffd47a" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx="60" cy="60" r="58" fill={`url(#cx-lamp-${x.id})`} />
                <circle cx="60" cy="60" r={R} className="cx-lamp-track" />
                <circle cx="60" cy="60" r={R} className="cx-lamp-arc" strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 60 60)" />
                <text x="60" y="64" textAnchor="middle" className="cx-lamp-b">
                  {x.failed ? "OUT" : r1(x.endH)}
                </text>
                <text x="60" y="80" textAnchor="middle" className="cx-lamp-s">
                  {x.failed ? "DARK" : `OF ${x.startH} H`}
                </text>
              </svg>
              <span>{SETTLEMENTS[x.id].name}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The miss: how far the ice was pushed, against what Lantern 17 needs  */
/* ------------------------------------------------------------------ */
export function MissDiagram({ o }: { o: Outcome }) {
  const NEED = 1.5;
  const shift = o.iceShiftKm;
  const SCALE = 44; // px per needed distance (the safe clearance)
  const off = Math.min(110, (shift / NEED) * SCALE);
  const cy = 112;
  const cleared = shift >= NEED - 1e-9;
  const reduce = useReducedMotion();
  const full = `M20,${cy} C150,${cy} 200,${cy + off} 330,${cy + off} L500,${cy + off}`;
  const toStation = `M20,${cy} C150,${cy} 200,${cy + off} 330,${cy + off}`;
  const rockPath = cleared ? full : toStation;
  const rockEnd: [number, number] = cleared ? [500, cy + off] : [330, cy + off];
  const gap = shift - NEED;
  const rock = (cx: number, cyy: number, r: number) =>
    Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2;
      const k = r * (0.74 + 0.36 * ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1));
      return `${(cx + Math.cos(a) * k).toFixed(1)},${(cyy + Math.sin(a) * k * 0.86).toFixed(1)}`;
    }).join(" ");
  return (
    <section className={`cx-miss${cleared ? " clear" : " hit"}`} aria-label="Ice miss distance">
      <h4 className="cx-title">The ice, and the miss</h4>
      <svg viewBox="0 0 520 220" role="img" aria-label={cleared ? `The ice was pushed ${r1(shift)} kilometres and missed Lantern 17 by ${r1(gap)} kilometres.` : `The ice was pushed only ${r1(shift)} of the 1.5 kilometres it needed and hit Lantern 17.`}>
        <defs>
          <linearGradient id="cx-trail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7fd4e8" stopOpacity="0" />
            <stop offset="1" stopColor="#7fd4e8" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="cx-station" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffb547" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* the safe corridor around Lantern 17 */}
        <circle cx="330" cy={cy} r="78" fill="url(#cx-station)" />
        <circle cx="330" cy={cy} r={SCALE} className="cx-safe" />
        <circle cx="330" cy={cy} r="9" className="cx-station" />
        <text x="330" y={cy - SCALE - 14} className="cx-tag" textAnchor="middle">
          LANTERN 17 · 1.5 KM CLEARANCE
        </text>

        {/* where the ice was going */}
        <line x1="20" y1={cy} x2="500" y2={cy} className="cx-path old" />
        <text x="22" y={cy - 10} className="cx-tag ember">
          ORIGINAL PATH
        </text>

        {/* where you sent it */}
        {shift > 0.02 && (
          <>
            <path d={full} className="cx-path new" />
            <line x1="330" x2="330" y1={cy} y2={cy + off} className="cx-offset" />
            <text x="338" y={cy + off / 2 + 4} className="cx-tag amber">
              {r1(shift)} KM
            </text>
          </>
        )}

        {/* the fragment rides the path it was given, and stops at the station if it was not pushed far enough */}
        <g className="cx-rock">
          <polygon points={rock(0, 0, 12)} transform={reduce ? `translate(${rockEnd[0]} ${rockEnd[1]})` : undefined} />
          {!reduce && <animateMotion dur="6s" repeatCount="indefinite" path={rockPath} keyPoints="0;1;1" keyTimes="0;0.7;1" calcMode="linear" />}
        </g>
        {!cleared && (
          <g className="cx-burst" transform={`translate(330 ${cy + off})`}>
            {Array.from({ length: 10 }, (_, i) => (
              <line key={i} x1="0" y1="0" x2={Math.cos((i / 10) * 6.283) * (i % 2 ? 24 : 38)} y2={Math.sin((i / 10) * 6.283) * (i % 2 ? 24 : 38)} />
            ))}
          </g>
        )}
      </svg>
      <p className="cx-miss-say">
        {cleared ? (
          <>
            <b>Missed by {r1(gap)} km.</b> You pushed it {r1(shift)} km; it needed 1.5.
          </>
        ) : (
          <>
            <b>{r1(NEED - shift)} km short.</b> You pushed it {r1(shift)} km of the 1.5 it needed.
          </>
        )}
      </p>
    </section>
  );
}

