"use client";

import { useState } from "react";
import { G0, ROUTES, ROUTE_ORDER, deltaV, routeTotals } from "@/lib/game";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");

const W = 640;
const H = 330;
const M = { l: 54, r: 18, t: 18, b: 40 };
const XMAX = 6500;
const YMAX = 3400;
const x = (fuel: number) => M.l + (fuel / XMAX) * (W - M.l - M.r);
const y = (dv: number) => H - M.b - (dv / YMAX) * (H - M.t - M.b);

/** The rocket equation, to play with. Dragging the fuel makes the key point: double the fuel is not double the speed. */
export default function Playground() {
  const [isp, setIsp] = useState(316);
  const [dry, setDry] = useState(6000);
  const [fuel, setFuel] = useState(4500);

  const dv = deltaV(isp, dry, fuel);
  const doubled = deltaV(isp, dry, Math.min(XMAX, fuel * 2));
  const slope = (isp * G0) / dry; // Δv per kg of fuel if the fuel weighed nothing
  const curve = Array.from({ length: 66 }, (_, i) => {
    const f = (i / 65) * XMAX;
    return `${i ? "L" : "M"}${x(f).toFixed(1)},${y(deltaV(isp, dry, f)).toFixed(1)}`;
  }).join(" ");
  const needs = ROUTE_ORDER.map((id, n) => ({ id, n: n + 1, need: routeTotals(id).withMarginDv }));

  return (
    <section className="lb-sec" id="rocket" aria-labelledby="rocket-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          02 <b>{"//"}</b> The rocket equation
        </p>
        <h2 className="display" id="rocket-title">
          Why fuel gets <em>expensive.</em>
        </h2>
        <p>
          Every kilogram of fuel you add also has to be carried by the fuel you already have. So the speed you gain grows more slowly with each kilogram. Drag the sliders and watch the curve bend away from the straight line.
        </p>
      </header>

      <div className="lb-play">
        <div className="lb-controls">
          <label>
            <span>
              Engine efficiency <small>Isp</small>
            </span>
            <b>{isp} s</b>
            <input type="range" min={200} max={460} step={2} value={isp} onChange={(e) => setIsp(Number(e.target.value))} />
            <em>Green monoprop 231 · Cluster 312 · Biprop 316 · Cryogenic 450</em>
          </label>
          <label>
            <span>
              Dry mass <small>ship without fuel</small>
            </span>
            <b>{r0(dry)} kg</b>
            <input type="range" min={3000} max={9000} step={50} value={dry} onChange={(e) => setDry(Number(e.target.value))} />
            <em>Courier ≈ 4,800 · Tender ≈ 6,100 · Hauler ≈ 7,100</em>
          </label>
          <label>
            <span>
              Fuel loaded <small>propellant</small>
            </span>
            <b>{r0(fuel)} kg</b>
            <input type="range" min={0} max={XMAX} step={50} value={fuel} onChange={(e) => setFuel(Number(e.target.value))} />
            <em>A hull holds 3,400 to 5,500 kg</em>
          </label>

          <div className="lb-read">
            <div>
              <small>Speed budget</small>
              <b>{r0(dv)}</b>
              <span>m/s</span>
            </div>
            <p>
              Twice the fuel ({r0(Math.min(XMAX, fuel * 2))} kg) gives <b>{r0(doubled)} m/s</b>, which is {fuel > 0 ? `${(doubled / dv).toFixed(2)}×` : "—"} the speed, not 2×.
            </p>
          </div>
        </div>

        <figure className="lb-chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Speed budget against fuel. At ${r0(fuel)} kg you have ${r0(dv)} metres per second.`}>
            {[0, 500, 1000, 1500, 2000, 2500, 3000].map((v) => (
              <g key={v}>
                <path d={`M${M.l},${y(v)} L${W - M.r},${y(v)}`} className="lb-grid" />
                <text x={M.l - 8} y={y(v) + 3} textAnchor="end" className="lb-axis">
                  {r0(v)}
                </text>
              </g>
            ))}
            {[0, 1000, 2000, 3000, 4000, 5000, 6000].map((v) => (
              <text key={v} x={x(v)} y={H - M.b + 18} textAnchor="middle" className="lb-axis">
                {r0(v)}
              </text>
            ))}
            <text x={M.l} y={H - 6} className="lb-axis lb-axis-title">
              FUEL LOADED, KG
            </text>
            <text x={12} y={M.t + 4} className="lb-axis lb-axis-title">
              Δv, M/S
            </text>

            {/* what the speed would be if fuel were free to carry */}
            <path d={`M${x(0)},${y(0)} L${x(Math.min(XMAX, YMAX / slope))},${y(Math.min(YMAX, slope * XMAX))}`} className="lb-linear" />
            <text x={x(Math.min(XMAX, YMAX / slope)) - 8} y={y(Math.min(YMAX, slope * XMAX)) + 18} textAnchor="end" className="lb-axis">
              if fuel weighed nothing
            </text>

            {/* the real thing */}
            <path d={curve} className="lb-curve" />

            {/* what each route needs */}
            {needs.map((r) => (
              <g key={r.id} className={dv >= r.need ? "ok" : "no"}>
                <path d={`M${M.l},${y(r.need)} L${W - M.r},${y(r.need)}`} className="lb-need" />
                <circle cx={W - M.r - 10} cy={y(r.need)} r="8" className="lb-need-dot" />
                <text x={W - M.r - 10} y={y(r.need) + 3} textAnchor="middle" className="lb-need-n">
                  {r.n}
                </text>
              </g>
            ))}

            {/* where you are */}
            <path d={`M${x(fuel)},${y(0)} L${x(fuel)},${y(dv)}`} className="lb-here-line" />
            <circle cx={x(fuel)} cy={y(dv)} r="7" className="lb-here" />
          </svg>
          <figcaption>
            <ol>
              {needs.map((r) => (
                <li key={r.id} className={dv >= r.need ? "ok" : "no"}>
                  <span>{r.n}</span> {ROUTES[r.id].name} <b>{r0(r.need)} m/s</b>
                </li>
              ))}
            </ol>
            <p>Each numbered line is what a route needs for the round trip, with the 10% margin. A route is in reach when the dot is above its line.</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
