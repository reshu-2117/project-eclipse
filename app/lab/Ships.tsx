"use client";

import Link from "next/link";
import { HullThumb } from "../mission/Blueprint";
import { PRESETS, ROUTES, ROUTE_ORDER, loadoutStats, routeTotals } from "@/lib/game";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

type State = "ok" | "tight" | "short" | "dry";

function cell(dv: number, id: (typeof ROUTE_ORDER)[number]): { state: State; text: string; pct: number } {
  const t = routeTotals(id);
  const pct = Math.max(0.04, Math.min(1, dv / t.withMarginDv));
  if (dv < t.outDv) return { state: "dry", pct, text: `dry, ${r0(t.outDv - dv)} short` };
  if (dv < t.totalDv) return { state: "short", pct, text: `no way home, ${r0(t.totalDv - dv)} short` };
  if (dv < t.withMarginDv) return { state: "tight", pct, text: "no margin" };
  return { state: "ok", pct, text: `+${r0(dv - t.withMarginDv)} spare` };
}

/** The three starter ships, side by side, against all five routes. */
export default function Ships() {
  const ships = PRESETS.map((p) => ({ p, st: loadoutStats(p.loadout) }));
  return (
    <section className="lb-sec" id="ships" aria-labelledby="ships-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          02 <b>{"//"}</b> Ships against routes
        </p>
        <h2 className="display" id="ships-title">
          No ship can do <em>everything.</em>
        </h2>
        <p>
          The three starter ships, built by the same engine the hangar uses, against all five routes. Green is a route the ship can fly with margin, amber is a risk, red is a route it can&apos;t finish.
        </p>
      </header>

      <div className="lb-ships">
        {ships.map(({ p, st }) => (
          <article key={p.id} className="lb-ship">
            <div className="lb-hull">
              <HullThumb id={p.loadout.hull} />
            </div>
            <p className="eyebrow">{p.tagline}</p>
            <h3>{p.name}</h3>
            <p className="lb-ship-blurb">{p.blurb}</p>
            <dl>
              <div>
                <dt>Speed budget</dt>
                <dd>{r0(st.dv)} m/s</dd>
              </div>
              <div>
                <dt>Dry mass</dt>
                <dd>{r0(st.dryKg)} kg</dd>
              </div>
              <div>
                <dt>Credits</dt>
                <dd>{st.credits} / 100</dd>
              </div>
              <div>
                <dt>Test accuracy</dt>
                <dd>{st.bestBandPct === null ? "can't measure" : `±${st.bestBandPct}%`}</dd>
              </div>
              <div>
                <dt>Energy lasts</dt>
                <dd>{st.enduranceH === Infinity ? "indefinitely" : `${r0(st.enduranceH)} h`}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="lb-matrix-wrap">
        <table className="lb-matrix">
          <caption className="sr-only">Which routes each starter ship can fly</caption>
          <thead>
            <tr>
              <th scope="col">Ship</th>
              {ROUTE_ORDER.map((id) => (
                <th scope="col" key={id}>
                  {ROUTES[id].name}
                  <small>
                    {r0(routeTotals(id).withMarginDv)} m/s · {r1(routeTotals(id).arriveH)} h
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ships.map(({ p, st }) => (
              <tr key={p.id}>
                <th scope="row">
                  {p.name}
                  <small>{r0(st.dv)} m/s</small>
                </th>
                {ROUTE_ORDER.map((id) => {
                  const c = cell(st.dv, id);
                  return (
                    <td key={id} className={c.state}>
                      {c.text}
                      <i style={{ width: `${c.pct * 100}%` }} aria-hidden="true" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lb-cta-line">
        Want a ship of your own? <Link href="/mission">Build one in the Wick →</Link>
      </p>
    </section>
  );
}
