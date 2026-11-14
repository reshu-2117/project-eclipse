"use client";

import { useEffect, useRef, useState } from "react";
import type { BodyInfo, FieldSummary, OrbitSceneController, SceneStats, ViewMode } from "./orbit/scene";

const SPEEDS = [300, 900, 2700] as const;
const DEFAULT_SPEED = 900;

const KIND_LABEL: Record<BodyInfo["kind"], string> = {
  lantern: "Lantern station",
  satellite: "Satellite",
  debris: "Ice debris",
  mission: "Mission object",
};

const int = (n: number) => Math.round(n).toLocaleString("en-US");

function period(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
}

type Status = "idle" | "loading" | "ready" | "error";

export default function OrbitalSection({ lit17 }: { lit17: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<OrbitSceneController | null>(null);
  const litRef = useRef(lit17);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [info, setInfo] = useState<BodyInfo | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [summary, setSummary] = useState<FieldSummary | null>(null);
  const [view, setView] = useState<ViewMode>("overview");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [engaged, setEngaged] = useState(false);

  // Keep the scene in step with the game: authorising the repair relights Lantern 17.
  useEffect(() => {
    litRef.current = lit17;
    ctrlRef.current?.setLit(lit17);
  }, [lit17]);

  // Load Three.js and build the scene only when the section is about to scroll into view.
  useEffect(() => {
    const stage = stageRef.current;
    const gl = glRef.current;
    if (!stage || !gl) return;
    let cancelled = false;
    let started = false;

    const start = async () => {
      if (started) return;
      started = true;
      setStatus("loading");
      try {
        const [{ loadField }, scene] = await Promise.all([import("./orbit/loadField"), import("./orbit/scene")]);
        const field = await loadField();
        if (cancelled) return;
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const compact = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
        const ctrl = scene.createOrbitScene({
          container: gl,
          field,
          lit17: litRef.current,
          reducedMotion,
          compact,
          onReady: (s) => {
            if (cancelled) return;
            setSummary(s);
            setStatus("ready");
          },
          onSelection: (b) => !cancelled && setInfo(b),
          onStats: (s) => !cancelled && setStats(s),
          onEngagedChange: (e) => !cancelled && setEngaged(e),
          onError: (m) => {
            if (cancelled) return;
            setMessage(m);
            setStatus("error");
          },
        });
        ctrl.setTimeScale(DEFAULT_SPEED);
        ctrlRef.current = ctrl;
        setPaused(reducedMotion);
      } catch {
        if (cancelled) return;
        setMessage("This browser could not start the 3D view. The rest of the page works as normal.");
        setStatus("error");
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void start();
        }
      },
      { rootMargin: "700px 0px" },
    );
    io.observe(stage);

    return () => {
      cancelled = true;
      io.disconnect();
      ctrlRef.current?.dispose();
      ctrlRef.current = null;
    };
  }, []);

  const ready = status === "ready";
  const heroOrbitSeconds = summary ? (summary.heroPeriodMin * 60) / speed : null;

  const chooseView = (mode: ViewMode) => {
    ctrlRef.current?.setView(mode);
    setView(mode);
  };
  const chooseSpeed = (s: number) => {
    ctrlRef.current?.setTimeScale(s);
    setSpeed(s);
  };
  const togglePause = () => {
    const next = !paused;
    ctrlRef.current?.setPaused(next);
    setPaused(next);
  };
  const toggleEngaged = () => {
    const next = !engaged;
    ctrlRef.current?.setEngaged(next);
    setEngaged(next);
  };
  const reset = () => {
    ctrlRef.current?.resetView();
    setView("overview");
  };

  return (
    <section className="section orbit" id="orbit" aria-labelledby="orbit-title">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            Orbital view <b>{"//"}</b> Eclipse-01 · live simulation
          </p>
          <h2 className="display" id="orbit-title">
            Lantern 17, <em>in motion.</em>
          </h2>
          <p className="lede">
            Every object here follows its own orbit around the planet, at its own height and speed. Time runs
            faster than real life so you can watch the ring turn. Tap any object to read its telemetry.
          </p>
        </div>

        <div className="orbit-layout reveal">
          <div className="orbit-main">
            <div className="orbit-stage" ref={stageRef} data-status={status}>
              <div className="orbit-gl" ref={glRef} />
              {!ready && (
                <div className="orbit-poster" aria-hidden={status === "idle"}>
                  <span className="orbit-poster-planet" aria-hidden="true" />
                  <p role={status === "error" ? "alert" : "status"}>
                    {status === "error"
                      ? message
                      : status === "loading"
                        ? "Plotting safe orbits…"
                        : "Orbital view loads as you scroll"}
                  </p>
                </div>
              )}
              <div className="orbit-hud" aria-hidden="true">
                <span>
                  Scale <b>1 unit = 1,000 km</b>
                </span>
                <span>
                  Time <b>×{int(speed)}</b>
                  {paused ? " · paused" : ""}
                </span>
              </div>
              {ready && (
                <p className="orbit-hint" aria-hidden="true">
                  <span className="hint-mouse">
                    {engaged ? "Drag to rotate · scroll to zoom · Esc to release" : "Drag to rotate · click the view to unlock zoom"}
                  </span>
                  <span className="hint-touch">
                    {engaged ? "Drag to rotate · pinch to zoom" : "Swipe sideways to rotate · use Control camera for pinch zoom"}
                  </span>
                </p>
              )}
            </div>

            <div className="orbit-controls" role="toolbar" aria-label="Orbit view controls">
              <div className="orbit-group" role="group" aria-label="Camera view">
                <button type="button" className="btn btn-ghost btn-sm" aria-pressed={view === "overview"} disabled={!ready} onClick={() => chooseView("overview")}>
                  Overview
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-pressed={view === "follow"} disabled={!ready} onClick={() => chooseView("follow")}>
                  Follow L-17
                </button>
              </div>
              <div className="orbit-group" role="group" aria-label="Simulation time">
                <button type="button" className="btn btn-ghost btn-sm" aria-pressed={paused} disabled={!ready} onClick={togglePause}>
                  {paused ? "Play" : "Pause"}
                </button>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-pressed={speed === s}
                    aria-label={`Time speed ${int(s)} times`}
                    disabled={!ready}
                    onClick={() => chooseSpeed(s)}
                  >
                    ×{int(s)}
                  </button>
                ))}
              </div>
              <div className="orbit-group" role="group" aria-label="Camera controls">
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Zoom out" disabled={!ready} onClick={() => ctrlRef.current?.zoom(1.3)}>
                  −
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Zoom in" disabled={!ready} onClick={() => ctrlRef.current?.zoom(1 / 1.3)}>
                  +
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!ready} onClick={reset}>
                  Reset
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-pressed={engaged} disabled={!ready} onClick={toggleEngaged}>
                  {engaged ? "Release camera" : "Control camera"}
                </button>
              </div>
            </div>
          </div>

          <aside className="detail orbit-panel" aria-live="polite" aria-label="Selected object telemetry">
            {info ? (
              <>
                <p className="eyebrow">
                  {KIND_LABEL[info.kind]} <b>·</b> {info.id}
                </p>
                <h3>{info.name}</h3>
                <p>{info.role}</p>
                <div className="readout">
                  <div>
                    <span>Altitude</span>
                    <strong>{int(info.altitudeKm)} km</strong>
                  </div>
                  <div>
                    <span>Speed</span>
                    <strong>{info.speedKmS.toFixed(2)} km/s</strong>
                  </div>
                  <div>
                    <span>Orbit period</span>
                    <strong>{period(info.periodMin)}</strong>
                  </div>
                  <div>
                    <span>Inclination</span>
                    <strong>{info.inclinationDeg.toFixed(0)}°</strong>
                  </div>
                  <div>
                    <span>Path</span>
                    <strong>{info.eccentricity < 0.005 ? "Circular" : `Ellipse, e ${info.eccentricity.toFixed(3)}`}</strong>
                  </div>
                  <div>
                    <span>Nearest path</span>
                    <strong>{info.nearestName ? `${int(info.clearanceKm)} km · ${info.nearestName}` : "Over 1,300 km clear"}</strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">
                  Telemetry <b>·</b> {ready ? "no object selected" : "standing by"}
                </p>
                <h3>Eclipse-01</h3>
                <p>
                  {ready
                    ? "Tap any Lantern, satellite, mission object or ice fragment in the view to read its orbit."
                    : "Orbit data appears here once the simulation starts."}
                </p>
              </>
            )}

            <div className="orbit-safety">
              <p className="eyebrow">Collision watch</p>
              {summary ? (
                <>
                  <p className="orbit-safety-line">
                    <strong>{summary.bodies}</strong> objects, <strong>{int(summary.pairs)}</strong> path pairs checked. Every
                    pair keeps at least <strong>{int(summary.minClearanceKm)} km</strong> between safety zones, at any time.
                  </p>
                  <p className="orbit-safety-line">
                    Live sweep: <strong>{stats ? int(stats.watchedPairs) : "…"}</strong> close pairs watched,{" "}
                    <strong className={stats && stats.violations > 0 ? "bad" : "good"}>{stats ? stats.violations : 0}</strong>{" "}
                    conflicts.
                  </p>
                </>
              ) : (
                <p className="orbit-safety-line">Paths are checked against each other before anything is drawn.</p>
              )}
            </div>

            <p className="orbit-note">
              Objects are drawn far larger than real hardware so you can see them, and each keeps a safety zone of the same
              size. Orbits are simplified two-body paths.{" "}
              {heroOrbitSeconds ? `At ×${int(speed)}, one Lantern 17 orbit takes about ${Math.round(heroOrbitSeconds)} seconds.` : ""}
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
