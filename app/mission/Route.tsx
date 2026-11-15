"use client";

import { useEffect, useRef, useState } from "react";
import { CLOCKS, ROUTES, ROUTE_ORDER, dvLeft, isEclipse, routeTotals } from "@/lib/game";
import type { Action, GameState, RouteId } from "@/lib/game";
import { ROUTE_ENTER, type VoiceLine } from "@/lib/game/data/story";
import FlightMap from "./FlightMap";
import type { Sound } from "./audio";
import { useReducedMotion } from "./Opening";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

type Status = "fits" | "tight" | "short" | "dry";

export default function Route({
  game,
  act,
  sound,
  say,
}: {
  game: GameState;
  act: (a: Action) => string | null;
  sound: Sound;
  say: (line: VoiceLine) => void;
}) {
  const reduce = useReducedMotion();
  const have = dvLeft(game);
  const [sel, setSel] = useState<RouteId>("safe");
  const [hover, setHover] = useState<RouteId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [burning, setBurning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => say(ROUTE_ENTER), 600);
    return () => window.clearTimeout(id);
  }, [say]);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const status = (id: RouteId): { s: Status; short: number } => {
    const t = routeTotals(id);
    if (have + 1e-6 < t.outDv) return { s: "dry", short: t.outDv - have };
    if (have + 1e-6 < t.totalDv) return { s: "short", short: t.totalDv - have };
    if (have + 1e-6 < t.withMarginDv) return { s: "tight", short: 0 };
    return { s: "fits", short: 0 };
  };

  const showing = hover ?? sel;
  const tot = routeTotals(showing);
  const route = ROUTES[showing];
  const arriveIce = CLOCKS.iceBriefedH - tot.arriveH;
  const eclipseAtArrival = isEclipse(tot.arriveH);

  const pickRoute = (id: RouteId) => {
    sound.click();
    setSel(id);
    setConfirming(false);
    setError(null);
  };

  const commit = () => {
    const s = status(sel).s;
    if ((s === "dry" || s === "short") && !confirming) {
      sound.click();
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBurning(true);
    sound.burn(reduce ? 1 : 2.6);
    timer.current = window.setTimeout(
      () => {
        const reason = act({ type: "route", id: sel, piloted: true });
        if (reason) {
          setBurning(false);
          setError(reason);
          sound.reject();
        }
      },
      reduce ? 700 : 2200,
    );
  };

  const selStatus = status(sel);
  const selTot = routeTotals(sel);

  return (
    <div className="rt">
      <header className="rt-head">
        <p className="eyebrow">
          Launch gantry <b>{"//"}</b> Choose your route
        </p>
        <h1 className="display">
          Time against <em>fuel.</em>
        </h1>
        <p className="rt-lede">
          Lantern 17 orbits at 1,000 km and the Wick at 300 km. A slow transfer is cheap. A fast one is expensive. Every route is paid for in Δv, and the ice clock keeps running while you fly.
        </p>
      </header>

      <div className="rt-grid">
        <ol className="rt-cards" aria-label="Route plans">
          {ROUTE_ORDER.map((id, n) => {
            const r = ROUTES[id];
            const t = routeTotals(id);
            const s = status(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`rt-card ${s.s}${sel === id ? " on" : ""}`}
                  aria-pressed={sel === id}
                  onClick={() => pickRoute(id)}
                  onMouseEnter={() => setHover(id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(id)}
                  onBlur={() => setHover(null)}
                >
                  <span className="rt-card-top">
                    <b>
                      <i>{n + 1}</i> {r.name}
                    </b>
                    <span className={`rt-status ${s.s}`}>
                      {s.s === "fits" ? "fits" : s.s === "tight" ? "no margin" : s.s === "short" ? `short ${r0(s.short)} to get home` : `short ${r0(s.short)} on the way out`}
                    </span>
                  </span>
                  <span className="rt-card-sum">{r.summary}</span>
                  <span className="rt-nums">
                    <span><small>OUT</small> {r0(t.outDv)} m/s</span>
                    <span><small>HOME</small> {r0(t.backDv)} m/s</span>
                    <span><small>TOTAL +10%</small> {r0(t.withMarginDv)} m/s</span>
                    <span><small>ARRIVE</small> {r1(t.arriveH)} h</span>
                  </span>
                  <span className="rt-who">{r.who}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="rt-right">
          <div className="rt-map">
            <FlightMap
              route={showing}
              hover={hover}
              progress={1}
              loop
              eclipse={eclipseAtArrival}
              phase={eclipseAtArrival ? "Network at arrival: Eclipse, dimmed" : "Network at arrival: daylight, Lantern 17 failing"}
              caption={`Flight map for the ${route.name} route`}
            />
          </div>

          <section className="rt-detail" aria-live="polite">
            <div className="rt-detail-top">
              <div>
                <p className="eyebrow">{hover && hover !== sel ? "Previewing" : "Selected"}</p>
                <h2>{route.name}</h2>
              </div>
              <p className="rt-teach">{route.teaches}</p>
            </div>

            <div className="rt-bar" role="img" aria-label={`You have ${r0(have)} metres per second. This route needs ${r0(tot.totalDv)}, or ${r0(tot.withMarginDv)} with margin.`}>
              {(() => {
                const max = Math.max(have, tot.withMarginDv) * 1.08;
                const p = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
                return (
                  <>
                    <div className="rt-bar-track">
                      <i className="have" style={{ width: p(have) }} />
                      <em className="out" style={{ left: p(tot.outDv) }}><u>out</u></em>
                      <em className="total" style={{ left: p(tot.totalDv) }}><u>home</u></em>
                      <em className="margin" style={{ left: p(tot.withMarginDv) }}><u>+10%</u></em>
                    </div>
                    <p>
                      You have <b>{r0(have)} m/s</b>. This route needs <b>{r0(tot.totalDv)} m/s</b> for the round trip, <b>{r0(tot.withMarginDv)} m/s</b> with a 10% margin.
                    </p>
                  </>
                );
              })()}
            </div>

            <ul className="rt-facts">
              <li>
                <small>You arrive</small>
                <b>hour {r1(tot.arriveH)}</b>
                <span>plus any delays on the way</span>
              </li>
              <li>
                <small>Ice clock then</small>
                <b>T−{r1(arriveIce)} h</b>
                <span>on the clock you were briefed</span>
              </li>
              <li>
                <small>Light at arrival</small>
                <b>{eclipseAtArrival ? "the Eclipse" : "daylight"}</b>
                <span>{eclipseAtArrival ? "mirrors cool, comms slow" : "comms fast, mirrors blinding"}</span>
              </li>
            </ul>

            <p className="rt-soft">Arrive early and you will have time to work at the station. Arrive late and you will have none. The clock on the ice is already running.</p>

            {error && (
              <p className="hg-reason" role="alert">
                {error}
              </p>
            )}

            {confirming ? (
              <div className={`rt-confirm ${selStatus.s}`} role="alertdialog" aria-label="Confirm this route">
                <p>
                  {selStatus.s === "dry"
                    ? `Your tank can't cover the way out. You will run dry ${r0(selStatus.short)} m/s short of Lantern 17 and drift past it. The mission ends there.`
                    : `You can reach Lantern 17, but you won't have enough to get home (short ${r0(selStatus.short)} m/s) unless events spare you fuel.`}
                </p>
                <span>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                    Choose another route
                  </button>
                  <button type="button" className="btn btn-lantern" onClick={commit}>
                    Go anyway <span aria-hidden="true">↑</span>
                  </button>
                </span>
              </div>
            ) : (
              <div className="rt-go">
                <p>
                  {selStatus.s === "fits"
                    ? "Your ship can fly this route with margin to spare."
                    : selStatus.s === "tight"
                      ? "Your ship can fly it, but with no margin. One surprise will hurt."
                      : selStatus.s === "short"
                        ? "You can get there, but probably not home."
                        : "Your ship can't get there."}
                </p>
                <button type="button" className="btn btn-lantern" onClick={commit} disabled={burning}>
                  {burning ? "Burning…" : `Fly the ${ROUTES[sel].name} route`} {!burning && <span aria-hidden="true">↑</span>}
                </button>
                <small className="lab-mono">
                  Burn {r0(selTot.outDv)} m/s to get out there
                </small>
              </div>
            )}
          </section>
        </div>
      </div>

      {burning && (
        <div className="rt-burn" role="status" aria-live="assertive" aria-label="Engine burn">
          <p className="eyebrow">Engine burn</p>
          <h2 className="display">
            Ignition. <em>{r0(selTot.outDv)} m/s.</em>
          </h2>
        </div>
      )}
    </div>
  );
}
