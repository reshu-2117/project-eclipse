"use client";

/**
 * The flight deck: you fly from the Wick to Lantern 17 yourself.
 *
 * Real gravity, real burns (lib/flight). The flight computer plots each burn and can turn the ship
 * and cut the engine for you (Guide), but you light it. Event cards still happen in flight, a fragment
 * of ice crosses your path, and the last kilometre is yours on the thrusters.
 */
import "./flight.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EVENTS, ROUTES, dvLeft, hasSensor, isEclipse, mirrorOutputPct, options } from "@/lib/game";
import type { Action, Delta, GameState, LedgerEntry } from "@/lib/game";
import { ARRIVE, DISTRESS, FLY_ALERT, FLY_APPROACH, FLY_BRAKE, FLY_START, type VoiceLine } from "@/lib/game/data/story";
import { AIMS, FlightSim, HARD, SOFT, WARPS, type Aim, type FlightEvent, type FlightSnapshot } from "@/lib/flight/sim";
import { THRUST } from "@/lib/flight/ship";
import { norm } from "@/lib/flight/kepler";
import CardArt from "../CardArt";
import type { Sound } from "../audio";
import { FlightScene, type View } from "./scene";

const SNAP_KEY = "eclipse-flight";
const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");
const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function clock(h: number) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function mmss(s: number) {
  if (!Number.isFinite(s)) return "--:--";
  const neg = s < 0;
  s = Math.abs(s);
  if (s >= 3600) return `${neg ? "−" : ""}${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} m`;
  return `${neg ? "−" : ""}${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function dist(m: number) {
  if (m >= 100_000) return `${r0(m / 1000)} km`;
  if (m >= 1000) return `${r1(m / 1000)} km`;
  return `${r0(m)} m`;
}

interface Hud {
  hour: number;
  eclipse: boolean;
  mode: FlightSim["mode"];
  warp: number;
  maxWarp: number;
  available: number;
  spent: number;
  hull: number;
  peri: number;
  apo: number;
  node: { label: string; say: string; kind: string; idx: number; total: number; dv: number; toStart: number; burnS: number; totalDv: number; totalS: number } | null;
  remaining: number;
  thrusting: boolean;
  aligning: boolean;
  pointErr: number;
  aim: Aim;
  guide: boolean;
  burnDv: number;
  conj: { state: string; tca: number; miss: number; pc: number; rel: number; dodge: { aim: Aim; dv: number } | null; passedAt: number | null };
  dock: { range: number; closing: number; up: number; side: number; vUp: number; vSide: number; lateral: number } | null;
  gap: number;
  l17: { x: number; y: number; on: boolean; dist: number };
  frag: { x: number; y: number; on: boolean; dist: number };
  port: { x: number; y: number; on: boolean; dist: number };
  lidar: boolean;
  slowmo: boolean;
  scope: Scope | null;
}

/** The orbit scope: a top-down schematic with heights exaggerated so 300 km and 1,000 km read apart. */
interface Scope {
  ghost: string;
  planned: string | null;
  l17: [number, number];
  ship: [number, number];
  frag: [number, number] | null;
  burn: [number, number] | null;
}

const SC = { c: 100, planet: 50, perKm: 0.036 };

function scopeXY(p: readonly number[], rot: number): [number, number] {
  const r = Math.hypot(p[0], p[1]);
  const a = Math.atan2(p[1], p[0]) + rot;
  const d = Math.min(97, SC.planet + Math.max(0, (r - 6_371_000) / 1000) * SC.perKm);
  return [SC.c + d * Math.cos(a), SC.c - d * Math.sin(a)];
}

function scopePath(pts: readonly (readonly number[])[], rot: number): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${scopeXY(p, rot).map((v) => v.toFixed(1)).join(" ")}`).join("");
}

function OrbitScope({ s }: { s: Scope }) {
  return (
    <svg className="fd-scope" viewBox="0 0 200 200" role="img" aria-label="Orbit scope: your orbit, the planned orbit and Lantern 17, seen from above">
      <defs>
        <radialGradient id="fd-planet" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#0d1828" />
          <stop offset="100%" stopColor="#1f3b55" />
        </radialGradient>
      </defs>
      <circle cx={SC.c} cy={SC.c} r={SC.planet} fill="url(#fd-planet)" />
      <circle cx={SC.c} cy={SC.c} r={SC.planet + 1000 * SC.perKm} fill="none" stroke="rgba(255,255,255,0.16)" strokeDasharray="1 3" />
      <path d={s.ghost} fill="none" stroke="#ffb766" strokeWidth="1.6" />
      {s.planned && <path d={s.planned} fill="none" stroke="#6fe3ff" strokeWidth="1.2" strokeDasharray="3 3" />}
      {s.burn && <circle cx={s.burn[0]} cy={s.burn[1]} r="3.2" fill="none" stroke="#6fe3ff" strokeWidth="1.4" />}
      {s.frag && <circle cx={s.frag[0]} cy={s.frag[1]} r="2.6" fill="#ff5a46" />}
      <circle cx={s.l17[0]} cy={s.l17[1]} r="3.4" fill="#ffd08a" />
      <circle cx={s.ship[0]} cy={s.ship[1]} r="3" fill="#ffffff" />
      <text x="6" y="194" fill="#7a8ba3" fontSize="8" fontFamily="var(--mono)">
        HEIGHTS ×{Math.round(SC.perKm * 6371 / SC.planet)}
      </text>
    </svg>
  );
}

type Overlay = "intro" | "card" | "result" | "docked" | "lost" | null;

function chips(d: Delta | undefined) {
  if (!d) return [];
  const out: { text: string; tone: "cost" | "gain" }[] = [];
  const add = (label: string, n: number | undefined, unit: string, goodUp: boolean) => {
    if (!n) return;
    out.push({ text: `${label} ${n > 0 ? "+" : "−"}${r0(Math.abs(n))} ${unit}`.trim(), tone: n > 0 === goodUp ? "gain" : "cost" });
  };
  add("Δv", d.dv, "m/s", true);
  add("Fuel", d.fuelKg, "kg", true);
  add("Time", d.hours ? Math.round(d.hours * 10) / 10 : 0, "h", false);
  add("Energy", d.kwh, "kWh", true);
  add("Hull", d.hull, "", true);
  add("Evidence", d.evidence, "", true);
  return out;
}

/** Is there a saved flight for this exact point of this run? (resume after a refresh) */
function hasSnapshot(g: GameState): boolean {
  try {
    const raw = window.sessionStorage.getItem(SNAP_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as FlightSnapshot;
    return s.seed === g.seed && s.card === g.card && s.route === g.route;
  } catch {
    return false;
  }
}

/** The speed you want for the distance left to the ring. */
function speedLimit(range: number) {
  return range > 300 ? 2 : range > 60 ? 0.8 : range > 15 ? 0.4 : SOFT.speed;
}

export default function FlightDeck({
  game,
  act,
  sound,
  say,
  onHold,
}: {
  game: GameState;
  act: (a: Action) => string | null;
  sound: Sound;
  say: (line: VoiceLine) => void;
  onHold: (hold: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<FlightSim | null>(null);
  const sceneRef = useRef<FlightScene | null>(null);
  const gameRef = useRef(game);
  const [hud, setHud] = useState<Hud | null>(null);
  // resuming a saved flight skips the intro
  const [overlay, setOverlay] = useState<Overlay>(() => (hasSnapshot(game) ? null : "intro"));
  const [view, setViewState] = useState<View>("chase");
  const [result, setResult] = useState<{ from: number; cardId: string; choiceId: string } | null>(null);
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "warn" | "good"; key: number } | null>(null);
  const [lostWhy, setLostWhy] = useState<string | null>(null);
  const [dockInfo, setDockInfo] = useState<{ speed: number; extra: number } | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const overlayRef = useRef<Overlay>(overlay);
  const keys = useRef(new Set<string>());

  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  const notify = useCallback((text: string, tone: "info" | "warn" | "good" = "info") => {
    setToast({ text, tone, key: Date.now() });
  }, []);

  const saveSnap = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    try {
      window.sessionStorage.setItem(SNAP_KEY, JSON.stringify(sim.snapshot(gameRef.current.card)));
    } catch {
      /* private window */
    }
  }, []);

  /** Keep the sim's view of the ship in step with the engine (cards change fuel and sensors). */
  const syncFromGame = useCallback((g: GameState) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.engineDvLeft = dvLeft(g);
    sim.spec.lidar = hasSensor(g, "lidar");
    sim.spec.radar = hasSensor(g, "radar");
    sim.spec.thermal = hasSensor(g, "thermal");
  }, []);

  useEffect(() => {
    syncFromGame(game);
  }, [game, syncFromGame]);

  // ── build the sim and the scene once ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || simRef.current) return;
    const g = gameRef.current;
    let sim: FlightSim;
    try {
      sim = new FlightSim(g);
    } catch (e) {
      queueMicrotask(() => setGlError(String(e)));
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(SNAP_KEY);
      if (raw) sim.restore(JSON.parse(raw) as FlightSnapshot, g.card);
    } catch {
      /* ignore a bad snapshot */
    }
    // a reviewer's shortcut: ?fly=approach starts at the approach point
    const jump = new URLSearchParams(window.location.search).get("fly");
    const jumped = jump === "approach" && sim.mode === "cruise";
    if (jumped) debugToApproach(sim, g, act);
    simRef.current = sim;
    let scene: FlightScene;
    try {
      scene = new FlightScene(canvas, { hull: g.loadout.hull, engine: g.loadout.engine, shield: g.loadout.shield });
    } catch (e) {
      queueMicrotask(() => setGlError(e instanceof Error ? e.message : String(e)));
      return;
    }
    sceneRef.current = scene;
    if (jumped) scene.shot = { kind: "arrive", t: 0, dur: 7 };
    // for development tools and automated checks only
    if (process.env.NODE_ENV !== "production") (window as unknown as { __fd: unknown }).__fd = { sim, scene };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      scene.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
      simRef.current = null;
      sound.engine(0);
    };
    // the sim is built once per mount; later game changes are synced through syncFromGame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── the main loop ──
  const handleEvents = useCallback(
    (evs: FlightEvent[]) => {
      const sim = simRef.current;
      const scene = sceneRef.current;
      if (!sim || !scene) return;
      for (const e of evs) {
        switch (e.type) {
          case "burnStart":
            break;
          case "cutoff":
            sound.ping(660);
            notify(`Engine cut-off. ${r1(e.value ?? 0)} m/s done.`, "good");
            break;
          case "nodeDone": {
            sound.lock();
            const next = sim.node;
            if (next?.kind === "phaseDown") window.setTimeout(() => say(FLY_BRAKE), 1200);
            break;
          }
          case "replan":
            sound.reject();
            notify(e.text === "terminal" ? `Not quite on the spot. New burn to close the gap: ${r1(e.value ?? 0)} m/s.` : `Off the plan. The computer found a new path: ${r0(e.value ?? 0)} m/s.`, "warn");
            break;
          case "alert":
            sound.warn();
            scene.hit(0.25);
            say(FLY_ALERT);
            break;
          case "tca":
            sound.pass();
            scene.shot = { kind: "pass", t: 0, dur: 3.4 };
            notify(
              `It passed ${r0(e.value ?? 0)} m away.${e.text ? ` Your shield stopped all ${e.text.split(" ")[0]} pieces of its cloud.` : ""}`,
              (e.value ?? 0) < 60 ? "warn" : "good",
            );
            break;
          case "fragHit": {
            sound.alarm();
            sound.clack(1);
            scene.hit(1.2);
            const r = sim.takeReport();
            act({ type: "flight", dv: 0, hours: r.hours, hull: r.hull, note: e.text === "direct" ? "Ice fragment: direct hit" : "Ice fragment: its cloud got through" });
            saveSnap();
            scene.shot = { kind: "pass", t: 0, dur: 3.4 };
            notify(
              e.text === "direct"
                ? `Direct hit: 12 cm of ice at ${r1((simRef.current?.conj.relSpeed ?? 7000) / 1000)} km/s. No shield stops that. −${e.value} hull.`
                : `Pieces of its cloud got through your shield (${e.text}). −${e.value} hull.`,
              "warn",
            );
            break;
          }
          case "chunkHit":
            sound.clack(Math.min(1, 0.4 + (e.value ?? 1) / 10));
            scene.hit(0.4);
            notify(`Ice on the hull: −${e.value} hull.`, "warn");
            break;
          case "approach":
            sound.swell(98);
            scene.shot = { kind: "arrive", t: 0, dur: 7 };
            setViewState("chase");
            scene.view = "chase";
            scene.dist = 30;
            window.setTimeout(() => say(FLY_APPROACH), 900);
            break;
          case "bounce":
            sound.clack(1);
            sound.alarm();
            scene.hit(0.9);
            notify(e.text === "structure" ? `You hit the station's structure: −${e.value} hull. Line up on the ring first.` : `Too fast: you bounced off the ring. −${e.value} hull.`, "warn");
            break;
          case "contact": {
            const g = gameRef.current;
            const r = sim.takeReport();
            const reason = act({ type: "dock", dv: sim.extraDv(), hours: r.hours, hull: r.hull, speed: sim.contact?.speed ?? 0 });
            if (reason) {
              notify(reason, "warn");
              break;
            }
            sim.settled = true;
            onHold(true);
            setDockInfo({ speed: sim.contact?.speed ?? 0, extra: sim.extraDv() });
            sound.engine(0);
            sound.capture();
            scene.shot = { kind: "dock", t: 0, dur: 1e9 };
            setOverlay("docked");
            try {
              window.sessionStorage.removeItem(SNAP_KEY);
            } catch {
              /* ignore */
            }
            window.setTimeout(() => say(ARRIVE), 1600);
            void g;
            break;
          }
          case "card": {
            const r = sim.takeReport();
            act({ type: "flight", dv: 0, hours: r.hours, hull: r.hull });
            sound.flip();
            setResult(null);
            setFlash(null);
            setOverlay("card");
            saveSnap();
            break;
          }
          case "dry":
            sound.reject();
            notify("The tank is dry.", "warn");
            break;
          case "lost":
            onHold(true);
            sound.alarm();
            setLostWhy(e.text ?? "The flight is lost.");
            setOverlay("lost");
            break;
          case "stop":
            if (e.text === "burn") notify("Burn coming up. Time back to normal.", "info");
            break;
        }
      }
    },
    [act, notify, onHold, say, saveSnap, sound],
  );

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let puffAt = 0;
    let scopeAt = 0;
    let scope: Scope | null = null;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const sim = simRef.current;
      const scene = sceneRef.current;
      if (!sim || !scene) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      // controls from held keys (approach)
      if (sim.mode === "approach") {
        const k = keys.current;
        const ax = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
        const ay = (k.has("KeyR") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyF") || k.has("ArrowDown") ? 1 : 0);
        const az = (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) - (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0);
        if (k.size || padRef.current.some((x) => x !== 0)) {
          const p = padRef.current;
          sim.rcs = [Math.max(-1, Math.min(1, ax + p[0])), Math.max(-1, Math.min(1, ay + p[1])), Math.max(-1, Math.min(1, az + p[2]))];
        } else sim.rcs = [0, 0, 0];
      }
      const paused = overlayRef.current !== null && overlayRef.current !== "docked";
      const evs = paused ? [] : sim.step(dt);
      if (evs.length) handleEvents(evs);
      sound.engine(sim.thrusting ? 1 : 0, sim.accel > 3 ? 1.3 : 0.8);
      if (sim.rcsActive && now - puffAt > 110) {
        puffAt = now;
        sound.puff(0.5);
      }
      const hour = sim.missionHour(g.t);
      const eclipse = isEclipse(hour);
      const st = {
        output: mirrorOutputPct(g) / 100,
        leak: !g.leakPatched,
        drift: !g.driftFixed,
        eclipse,
        dark: !g.reactorOnline,
      };
      const marks = scene.frame(sim, dt, st, eclipse);
      if (now - hudAt > 90) {
        hudAt = now;
        const node = sim.node;
        const plannedDv = node ? norm(sim.plannedDvForHud(node)) : 0;
        const idx = sim.nodeIdx;
        const dk = sim.mode === "approach" || sim.mode === "docked" ? sim.dockData() : null;
        const info = sim.orbitInfo();
        if (now - scopeAt > 240) {
          scopeAt = now;
          // the ship sits at the bottom of the scope; everything turns with it
          const rot = -Math.PI / 2 - Math.atan2(sim.ship.r[1], sim.ship.r[0]);
          const per = Number.isFinite(info.periodMin) ? Math.min(info.periodMin * 60, 4 * 3600) : 3 * 3600;
          const plan = sim.node ? sim.plannedOrbit(90) : null;
          const nodeAt = sim.node && sim.node.t > sim.t ? sim.predict(sim.node.t - sim.t, 1)[1] : null;
          scope = {
            ghost: scopePath(sim.predict(per, 120), rot),
            planned: plan ? scopePath(plan, rot) : null,
            l17: scopeXY(sim.l17.r, rot),
            ship: scopeXY(sim.ship.r, rot),
            frag: sim.conj.state === "alert" ? scopeXY(sim.fragAt().r, rot) : null,
            burn: nodeAt ? scopeXY(nodeAt, rot) : null,
          };
        }
        setHud({
          hour,
          eclipse,
          mode: sim.mode,
          warp: sim.warp,
          maxWarp: sim.maxWarp(),
          available: sim.available,
          spent: sim.spent,
          hull: Math.max(0, g.hull - sim.hullPending),
          peri: info.periKm,
          apo: info.apoKm,
          node: node
            ? {
                label: node.label,
                say: node.say,
                kind: node.kind,
                idx: idx + 1,
                total: sim.plan.length,
                dv: plannedDv,
                toStart: sim.burnStartT(node, plannedDv) - sim.t,
                burnS: sim.burnSeconds(plannedDv),
                totalDv: sim.burnDv + plannedDv,
                totalS: sim.burnSeconds(sim.burnDv + plannedDv),
              }
            : null,
          remaining: norm(sim.remaining),
          thrusting: sim.thrusting,
          aligning: sim.aligning,
          pointErr: sim.pointingError(),
          aim: sim.aim,
          guide: sim.guide,
          burnDv: sim.burnDv,
          conj: {
            state: sim.conj.state,
            tca: sim.conj.tca - sim.t,
            miss: sim.conj.predMiss,
            pc: sim.conj.pc,
            rel: sim.conj.relSpeed,
            dodge: sim.conj.dodge,
            passedAt: sim.conj.passedAt,
          },
          dock: dk ? { range: dk.range, closing: dk.closing, up: dk.up, side: dk.side, vUp: dk.vUp, vSide: dk.vSide, lateral: dk.lateral } : null,
          gap: sim.gapKm(),
          l17: marks.l17,
          frag: marks.frag,
          port: marks.port,
          lidar: sim.spec.lidar,
          slowmo: sim.slowmo > 0,
          scope,
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents, sound]);

  // ── controls ──
  const padRef = useRef<[number, number, number]>([0, 0, 0]);
  const setPad = useCallback((axis: 0 | 1 | 2, v: number) => {
    const p: [number, number, number] = [...padRef.current];
    p[axis] = v;
    padRef.current = p;
  }, []);
  const burnDown = useCallback(() => {
    const sim = simRef.current;
    if (!sim || overlayRef.current) return;
    sound.unlock();
    sim.burn = true;
  }, [sound]);
  const burnUp = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.burn = false;
    sim.latched = false;
  }, []);
  const setAim = useCallback((a: Aim) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.aim = a;
    sound.click();
  }, [sound]);
  const setWarp = useCallback((dir: 1 | -1) => {
    const sim = simRef.current;
    if (!sim) return;
    const i = WARPS.indexOf(sim.warp);
    const next = WARPS[Math.max(0, Math.min(WARPS.length - 1, (i < 0 ? 0 : i) + dir))];
    sim.setWarp(next);
    sound.tick();
  }, [sound]);
  const skipAhead = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.setWarp(WARPS[WARPS.length - 1]);
    sound.click();
  }, [sound]);
  const setView = useCallback((v: View) => {
    const scene = sceneRef.current;
    setViewState(v);
    if (scene) {
      scene.view = v;
      if (scene.shot?.kind !== "dock") scene.shot = null;
    }
    sound.click();
  }, [sound]);
  const toggleGuide = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.guide = !sim.guide;
    sound.click();
  }, [sound]);
  const dodge = useCallback(() => {
    const sim = simRef.current;
    if (!sim?.conj.dodge) return;
    sim.aim = sim.conj.dodge.aim;
    notify(`Aiming ${AIMS.find((a) => a.id === sim.conj.dodge!.aim)?.label.toLowerCase()}. Hold BURN for about ${r1(sim.conj.dodge.dv)} m/s, then switch back to Computer.`, "info");
    sound.click();
  }, [notify, sound]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const sim = simRef.current;
      if (!sim) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) burnDown();
        return;
      }
      if (sim.mode === "approach") {
        if (["KeyW", "KeyS", "KeyA", "KeyD", "KeyR", "KeyF", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
          e.preventDefault();
          keys.current.add(e.code);
          return;
        }
      }
      const aimKeys: Record<string, Aim> = { Digit1: "computer", Digit2: "pro", Digit3: "retro", Digit4: "radOut", Digit5: "radIn", Digit6: "nrm", Digit7: "anti" };
      if (aimKeys[e.code]) setAim(aimKeys[e.code]);
      else if (e.code === "Period") setWarp(1);
      else if (e.code === "Comma") setWarp(-1);
      else if (e.code === "Slash") skipAhead();
      else if (e.code === "KeyM") setView(view === "map" ? "chase" : "map");
      else if (e.code === "KeyC" && sim.mode === "approach") setView(view === "cockpit" ? "chase" : "cockpit");
      else if (e.code === "KeyG") toggleGuide();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") burnUp();
      keys.current.delete(e.code);
    };
    const blur = () => {
      burnUp();
      keys.current.clear();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [burnDown, burnUp, setAim, setWarp, skipAhead, setView, toggleGuide, view]);

  // camera drag and zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      const scene = sceneRef.current;
      if (!p || !scene) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom(scene, pinch / d);
        pinch = d;
        return;
      }
      if (scene.shot && scene.shot.kind !== "dock") scene.shot = null;
      if (scene.view === "map") {
        scene.mapYaw -= dx * 0.005;
        scene.mapPitch = Math.max(-1.45, Math.min(1.45, scene.mapPitch + dy * 0.005));
      } else {
        scene.yaw -= dx * 0.006;
        scene.pitch = Math.max(-1.3, Math.min(1.3, scene.pitch + dy * 0.005));
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    const zoom = (scene: FlightScene, k: number) => {
      if (scene.view === "map") scene.mapDist = Math.max(1.3e7, Math.min(9e7, scene.mapDist * k));
      else scene.dist = Math.max(12, Math.min(600, scene.dist * k));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scene = sceneRef.current;
      if (scene) zoom(scene, Math.exp(e.deltaY * 0.0012));
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  // toasts fade
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── cards ──
  const card = overlay === "card" || overlay === "result" ? EVENTS[result ? (result.cardId as keyof typeof EVENTS) : game.deck[game.card]] : null;
  const opts = useMemo(() => (overlay === "card" ? options(game) : []), [game, overlay]);
  useEffect(() => {
    if (overlay === "card" && card?.id === "E4") {
      const t = window.setTimeout(() => {
        sound.radio();
        say(DISTRESS);
      }, 500);
      return () => window.clearTimeout(t);
    }
  }, [overlay, card?.id, sound, say]);

  const chooseCard = (choiceId: string) => {
    if (!card) return;
    const before = gameRef.current.log.length;
    const reason = act({ type: "card", choice: choiceId });
    if (reason) {
      sound.reject();
      setFlash({ id: choiceId, text: reason });
      return;
    }
    sound.lock();
    setFlash(null);
    setResult({ from: before, cardId: card.id, choiceId });
    setOverlay("result");
  };
  const flyOn = () => {
    const sim = simRef.current;
    sound.click();
    setResult(null);
    setOverlay(null);
    if (sim) {
      syncFromGame(gameRef.current);
      sim.cardPending = false;
      saveSnap();
    }
  };
  const entries: LedgerEntry[] = result ? game.log.slice(result.from) : [];
  const main = card ? entries.find((e) => e.title.startsWith(`${card.title}:`)) : undefined;

  const start = () => {
    sound.unlock();
    sound.swell(110);
    sound.thump(0.6);
    setOverlay(null);
    window.setTimeout(() => say(FLY_START), 600);
  };

  const rescue = () => {
    const sim = simRef.current;
    if (!sim) return;
    const r = sim.takeReport();
    act({ type: "flight", dv: Math.max(0, sim.extraDv()) + sim.available + 100, hours: r.hours, hull: r.hull, note: "Lost in flight" });
    try {
      window.sessionStorage.removeItem(SNAP_KEY);
    } catch {
      /* ignore */
    }
    onHold(false);
  };

  const route = game.route ? ROUTES[game.route] : null;
  const engine = THRUST[game.loadout.engine];
  const h = hud;

  if (glError) {
    return (
      <div className="fd fd-error">
        <p>
          The flight deck needs WebGL, and this browser couldn&apos;t start it ({glError}). Try another browser, or turn on hardware acceleration.
        </p>
      </div>
    );
  }

  const nodeSoon = h?.node && h.node.toStart < 900;
  const burnState = !h
    ? ""
    : h.thrusting
      ? "burning"
      : h.aligning
        ? "turning"
        : h.node && h.node.toStart <= 0 && h.remaining > 0.3
          ? "now"
          : "";

  return (
    <div className={`fd${h?.slowmo ? " slow" : ""}${h?.mode === "approach" ? " approach" : ""}`}>
      <canvas ref={canvasRef} className="fd-canvas" aria-label="The view from your ship" />

      {/* target brackets */}
      {h && h.l17.on && h.mode !== "docked" && view !== "map" && (
        <div className="fd-bracket l17" style={{ left: `${h.l17.x * 100}%`, top: `${h.l17.y * 100}%` }} aria-hidden="true">
          <i />
          <span>LANTERN 17 · {dist(h.l17.dist)}</span>
        </div>
      )}
      {h && h.frag.on && h.conj.state === "alert" && (
        <div className="fd-bracket frag" style={{ left: `${h.frag.x * 100}%`, top: `${h.frag.y * 100}%` }} aria-hidden="true">
          <i />
          <span>ICE · {dist(h.frag.dist)}</span>
        </div>
      )}

      {h && overlay !== "intro" && (
        <>
          {/* status: time and orbit */}
          <section className="fd-panel fd-status" aria-label="Flight status">
            <p className="fd-eyebrow">
              {route?.name ?? "Flight"} <b>{"//"}</b> {h.mode === "approach" ? "Final approach" : h.mode === "docked" ? "Docked" : h.node ? `Burn ${h.node.idx} of ${h.node.total}` : "Coasting"}
            </p>
            <p className="fd-clock">
              T+{clock(h.hour)}
              {h.eclipse && <em>ECLIPSE</em>}
            </p>
            <dl className="fd-orbit">
              <div>
                <dt>Lowest</dt>
                <dd>{r0(h.peri)} km</dd>
              </div>
              <div>
                <dt>Highest</dt>
                <dd>{Number.isFinite(h.apo) ? `${r0(h.apo)} km` : "escaping"}</dd>
              </div>
              <div>
                <dt>To L-17</dt>
                <dd>{h.gap < 1 ? `${r0(h.gap * 1000)} m` : `${r0(h.gap)} km`}</dd>
              </div>
            </dl>
            {h.peri < 180 && h.mode === "cruise" && <p className="fd-warn">Your lowest point skims the atmosphere.</p>}
            {h.scope && h.mode === "cruise" && <OrbitScope s={h.scope} />}
          </section>

          {/* the ship: fuel, hull, time-warp */}
          <section className="fd-panel fd-ship" aria-label="Ship">
            <div className="fd-tank">
              <span>Δv in the tank</span>
              <b>{r0(h.available)}</b>
              <small>m/s</small>
              <i style={{ width: `${Math.min(100, (h.available / Math.max(1, h.available + h.spent)) * 100)}%` }} />
            </div>
            <div className="fd-hull">
              <span>Hull</span>
              <b className={h.hull < 60 ? "low" : ""}>{h.hull}</b>
            </div>
            <div className="fd-warp" role="group" aria-label="Time-warp">
              <button type="button" onClick={() => setWarp(-1)} aria-label="Slower time-warp" disabled={h.warp <= 1}>
                −
              </button>
              <output aria-live="off">{h.slowmo ? "SLOW" : `${h.warp}×`}</output>
              <button type="button" onClick={() => setWarp(1)} aria-label="Faster time-warp" disabled={h.warp >= h.maxWarp}>
                +
              </button>
              {h.mode === "cruise" && (
                <button type="button" className="fd-skip" onClick={skipAhead} disabled={h.maxWarp <= 1 || h.thrusting}>
                  Skip to next
                </button>
              )}
            </div>
          </section>

          {/* the computer, or the approach */}
          {h.mode === "cruise" && (
            <section className={`fd-panel fd-computer ${burnState}`} aria-label="Flight computer" aria-live="polite">
              {h.node ? (
                <>
                  <p className="fd-eyebrow">
                    Computer <b>{"//"}</b> {h.node.label}
                  </p>
                  <p className="fd-say">{h.node.say}</p>
                  <div className="fd-burn-row">
                    <div className="fd-num">
                      <span>{h.thrusting ? "Still to burn" : h.node.toStart > 0 ? "Light the engine in" : "Burn now"}</span>
                      <b>{h.thrusting ? `${r1(h.remaining)} m/s` : h.node.toStart > 0 ? mmss(h.node.toStart) : `${r1(h.remaining)} m/s`}</b>
                    </div>
                    <div className="fd-num">
                      <span>Whole burn</span>
                      <b>
                        {r1(h.thrusting ? h.node.totalDv : h.node.dv)} m/s · {mmss(h.thrusting ? h.node.totalS : h.node.burnS)}
                      </b>
                    </div>
                    <div className="fd-num">
                      <span>Pointing</span>
                      <b className={h.pointErr < 4 ? "ok" : "off"}>{h.pointErr < 1 ? "on target" : `${r0(h.pointErr)}° off`}</b>
                    </div>
                  </div>
                  {h.thrusting && (
                    <div className="fd-progress" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, (h.burnDv / Math.max(0.1, h.burnDv + h.remaining)) * 100)}%` }} />
                    </div>
                  )}
                  {nodeSoon && h.aim !== "computer" && h.conj.state !== "alert" && <p className="fd-hint">You&apos;re aiming by hand. Switch to Computer to point at the burn.</p>}
                  {h.aligning && <p className="fd-hint">Turning the ship to the burn direction…</p>}
                </>
              ) : (
                <p className="fd-say">Closing on the approach point.</p>
              )}
              <button
                type="button"
                className="fd-burn"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  burnDown();
                }}
                onPointerUp={burnUp}
                onPointerCancel={burnUp}
                onContextMenu={(e) => e.preventDefault()}
                aria-label="Hold to burn the main engine (Space)"
              >
                <span>{h.thrusting ? "BURNING" : "HOLD TO BURN"}</span>
                <small>Space</small>
              </button>
            </section>
          )}

          {h.mode === "approach" && h.dock && (
            <ApproachPanel h={h} setPad={setPad} view={view} setView={setView} />
          )}

          {/* aim and guide */}
          {h.mode === "cruise" && (
            <section className="fd-panel fd-aim" aria-label="Aim">
              <p className="fd-eyebrow">Aim the ship</p>
              <div className="fd-aim-grid">
                {AIMS.map((a, i) => (
                  <button key={a.id} type="button" aria-pressed={h.aim === a.id} onClick={() => setAim(a.id)} title={`${a.label} (${i + 1})`}>
                    <AimIcon id={a.id} />
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="fd-guide" aria-pressed={h.guide} onClick={toggleGuide}>
                Guide {h.guide ? "on" : "off"} <small>{h.guide ? "the computer waits until you're pointed right, and cuts the engine on target" : "you light and cut the engine yourself"}</small>
              </button>
            </section>
          )}

          {/* views */}
          <nav className="fd-views" aria-label="Camera">
            <button type="button" aria-pressed={view === "chase"} onClick={() => setView("chase")}>
              Ship
            </button>
            <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
              Map
            </button>
            {(h.mode === "approach" || h.mode === "docked") && (
              <button type="button" aria-pressed={view === "cockpit"} onClick={() => setView("cockpit")}>
                Cockpit
              </button>
            )}
          </nav>

          {/* the ice alert */}
          {(h.conj.state === "alert" || (h.conj.state !== "pending" && h.conj.tca > -12)) && (
            <section className={`fd-alert ${h.conj.state}`} role="alert">
              {h.conj.state === "alert" ? (
                <>
                  <p className="fd-eyebrow">Collision warning</p>
                  <h2>Ice fragment crossing your path</h2>
                  <dl>
                    <div>
                      <dt>Closest pass in</dt>
                      <dd>{mmss(h.conj.tca)}</dd>
                    </div>
                    <div>
                      <dt>Predicted miss</dt>
                      <dd>{r0(h.conj.miss)} m</dd>
                    </div>
                    <div>
                      <dt>Chance of a hit</dt>
                      <dd className={h.conj.pc > 1e-4 ? "red" : "ok"}>{h.conj.pc > 1e-6 ? `1 in ${r0(1 / h.conj.pc)}` : "none"}</dd>
                    </div>
                    <div>
                      <dt>Closing speed</dt>
                      <dd>{r1(h.conj.rel / 1000)} km/s</dd>
                    </div>
                  </dl>
                  <p className="fd-real">Real rule: NASA moves the ISS when the chance is worse than 1 in 10,000, with a burn of about half a metre per second. A shield like the ISS&apos;s stops pieces up to about 1 cm; this fragment is about 12.</p>
                  {h.conj.dodge ? (
                    <button type="button" className="btn btn-lantern" onClick={dodge}>
                      Dodge: {r1(h.conj.dodge.dv)} m/s {AIMS.find((a) => a.id === h.conj.dodge!.aim)?.label.toLowerCase()}
                    </button>
                  ) : (
                    <p className="fd-ok">Below the line. You can let it pass.</p>
                  )}
                </>
              ) : h.conj.state === "hit" ? (
                <h2>Hit.</h2>
              ) : (
                <h2>Passed {r0(h.conj.passedAt ?? 0)} m away.</h2>
              )}
            </section>
          )}

          {toast && (
            <p key={toast.key} className={`fd-toast ${toast.tone}`} role="status">
              {toast.text}
            </p>
          )}
        </>
      )}

      {/* ── overlays ── */}
      {overlay === "intro" && (
        <div className="fd-overlay fd-intro">
          <div className="fd-card">
            <p className="fd-eyebrow">
              {route?.name ?? "Flight"} <b>{"//"}</b> You have the controls
            </p>
            <h1 className="display">
              Fly to <em>Lantern 17.</em>
            </h1>
            {route && route.id !== "skipWindow" && <p className="fd-lede">You waited {route.out[0].hours} hours for the launch window. Now the burns are yours.</p>}
            <ol className="fd-lessons">
              <li>
                <b>Burn, then drift.</b> No brakes, no air. Your engine changes your orbit; then you coast.
              </li>
              <li>
                <b>Forward makes you climb. Braking makes you faster.</b> A lower orbit is a quicker one. Your gut will be wrong; the computer won&apos;t.
              </li>
              <li>
                <b>Hold BURN (Space) when the countdown hits zero.</b> With Guide on, the computer points the ship and cuts the engine for you.
              </li>
              <li>
                <b>The last kilometre is on thrusters.</b> Touch the docking ring slower than {SOFT.speed} m/s.
              </li>
            </ol>
            <p className="fd-fine">
              Real gravity, real burns: Earth-size planet, 300 km to 1,000 km. Your {engine.note.split(":")[0]} engine gives {r0(engine.newtons)} N
              {engine.source === "game" ? " (a game value)" : ""}.
            </p>
            <button type="button" className="btn btn-lantern" onClick={start} autoFocus>
              Take the controls <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      {(overlay === "card" || overlay === "result") && card && (
        <div className="fd-overlay">
          <article className="jn-card fd-event" key={card.id}>
            <CardArt id={card.id} />
            <div className="jn-card-body">
              {overlay === "card" ? (
                <>
                  <div className="jn-card-top">
                    <h2>{card.title}</h2>
                    <i className={`hg-tag ${card.source}`}>{card.source === "real" ? "REAL" : card.source === "game" ? "GAME VALUE" : "FICTION"}</i>
                  </div>
                  <p className="jn-text">{card.text}</p>
                  {card.real && <p className="hg-anchor">{card.real}</p>}
                  <div className="jn-choices" role="group" aria-label="Your choices">
                    {card.choices.map((c) => {
                      const o = opts.find((x) => x.action.type === "card" && x.action.choice === c.id);
                      const locked = o ? !o.ok : false;
                      const why = flash?.id === c.id ? flash.text : locked ? o?.reason : null;
                      return (
                        <div key={c.id} className="hg-optwrap">
                          <button type="button" className={`hg-opt jn-choice${locked ? " locked" : ""}`} aria-disabled={locked || undefined} onClick={() => chooseCard(c.id)}>
                            <span className="hg-opt-top">
                              <b>{c.label}</b>
                            </span>
                            <span className="hg-cost">{c.outcome}</span>
                            {locked && <span className="hg-locked">{why}</span>}
                          </button>
                          {!locked && flash?.id === c.id && (
                            <p className="hg-reason" role="alert">
                              {flash.text}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="eyebrow">
                    {card.title} <b>{"//"}</b> You chose
                  </p>
                  <h2>{card.choices.find((c) => c.id === result?.choiceId)?.label}</h2>
                  <p className="jn-text">{main ? main.text : ""}</p>
                  {chips(main?.delta).length > 0 && (
                    <ul className="jn-chips" aria-label="What it cost">
                      {chips(main?.delta).map((c) => (
                        <li key={c.text} className={c.tone}>
                          {c.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="jn-teach">{card.teaches}</p>
                  <button type="button" className="btn btn-lantern" onClick={flyOn} autoFocus>
                    Fly on <span aria-hidden="true">→</span>
                  </button>
                </>
              )}
            </div>
          </article>
        </div>
      )}

      {overlay === "docked" && (
        <div className="fd-overlay fd-end">
          <div className="fd-card">
            <p className="fd-eyebrow">
              Contact <b>{"//"}</b> {game.log.some((e) => e.title === "Hard dock") ? "Hard dock" : "Soft capture"}
            </p>
            <h1 className="display">
              Docked at <em>Lantern 17.</em>
            </h1>
            <DockSummary game={game} info={dockInfo} />
            <div className="ms-gate-actions">
              <Link href="/station" className="btn btn-lantern">
                Board Lantern 17 <span aria-hidden="true">→</span>
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => onHold(false)}>
                Flight report
              </button>
            </div>
          </div>
        </div>
      )}

      {overlay === "lost" && (
        <div className="fd-overlay fd-end">
          <div className="fd-card lost">
            <p className="fd-eyebrow">Mission control</p>
            <h1 className="display">The flight is lost.</h1>
            <p className="fd-lede">{lostWhy}</p>
            <button type="button" className="btn btn-lantern" onClick={rescue}>
              Call for rescue <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DockSummary({ game, info }: { game: GameState; info: { speed: number; extra: number } | null }) {
  const extra = info?.extra ?? 0;
  return (
    <ul className="ms-launched-stats fd-stats">
      <li>
        <b>{info ? r2(info.speed) : "—"}</b>
        <span>m/s at contact</span>
      </li>
      <li>
        <b>{r0(Math.abs(extra))}</b>
        <span>{extra >= 0 ? "m/s over the route card" : "m/s saved on the route card"}</span>
      </li>
      <li>
        <b>{r0(dvLeft(game))}</b>
        <span>m/s of Δv left</span>
      </li>
      <li>
        <b>{game.hull}</b>
        <span>hull, out of 100</span>
      </li>
    </ul>
  );
}

function ApproachPanel({
  h,
  setPad,
  view,
  setView,
}: {
  h: Hud;
  setPad: (axis: 0 | 1 | 2, v: number) => void;
  view: View;
  setView: (v: View) => void;
}) {
  const d = h.dock!;
  const limit = speedLimit(d.range);
  // without lidar, the numbers are guesses by eye
  const est = !h.lidar;
  const range = est ? Math.round(d.range / 10) * 10 : d.range;
  const closingTone = d.closing > limit * 1.2 ? "red" : d.closing > limit ? "amber" : d.closing < -0.05 ? "amber" : "ok";
  const latTone = d.lateral > HARD.lateral ? "red" : d.lateral > SOFT.lateral ? "amber" : "ok";
  // reticle: where the port is relative to your nose, screen right = −side
  const scale = Math.max(2, Math.min(60, d.range * 0.15));
  const px = Math.max(-1, Math.min(1, -d.side / scale));
  const py = Math.max(-1, Math.min(1, d.up / scale));
  const hold = (axis: 0 | 1 | 2, v: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setPad(axis, v);
    },
    onPointerUp: () => setPad(axis, 0),
    onPointerCancel: () => setPad(axis, 0),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <section className="fd-panel fd-approach" aria-label="Docking">
      <p className="fd-eyebrow">
        Thrusters <b>{"//"}</b> {est ? "no lidar: judging by eye" : "lidar locked"}
      </p>
      <div className="fd-dock-nums">
        <div className="fd-num">
          <span>To the ring</span>
          <b>{est ? "~" : ""}{d.range > 1000 ? `${r1(d.range / 1000)} km` : `${r0(range)} m`}</b>
        </div>
        <div className="fd-num">
          <span>Closing</span>
          <b className={closingTone}>
            {est ? "~" : ""}
            {est ? r1(Math.abs(d.closing) < 0.05 ? 0 : d.closing) : r2(Math.abs(d.closing) < 0.005 ? 0 : d.closing)} m/s
          </b>
          <small>keep under {r2(limit)}</small>
        </div>
        <div className="fd-num">
          <span>Off centre</span>
          <b className={latTone}>{d.lateral < 10 ? r2(d.lateral) : r0(d.lateral)} m</b>
        </div>
      </div>
      <div className="fd-dock-row">
        <div className="fd-reticle" aria-hidden="true">
          <i className="cross" />
          <i className={`port ${latTone}`} style={{ left: `${50 + px * 44}%`, top: `${50 - py * 44}%` }} />
          <span>{r0(scale)} m</span>
        </div>
        <div className="fd-pad" role="group" aria-label="Thrusters: hold to fire">
          <button type="button" className="up" {...hold(1, 1)} aria-label="Up (R or ↑)">
            ▲<small>Up</small>
          </button>
          <button type="button" className="left" {...hold(2, 1)} aria-label="Left (A or ←)">
            ◀<small>Left</small>
          </button>
          <button type="button" className="fwd" {...hold(0, 1)} aria-label="Forward (W)">
            ⬤<small>Forward</small>
          </button>
          <button type="button" className="right" {...hold(2, -1)} aria-label="Right (D or →)">
            ▶<small>Right</small>
          </button>
          <button type="button" className="down" {...hold(1, -1)} aria-label="Down (F or ↓)">
            ▼<small>Down</small>
          </button>
          <button type="button" className="back" {...hold(0, -1)} aria-label="Back (S)">
            ○<small>Back</small>
          </button>
        </div>
      </div>
      <p className="fd-hint">
        {d.lateral > Math.max(0.5, d.range * 0.25)
          ? "Line up first: get the ring onto the cross, then move in."
          : d.closing > limit
            ? "Too fast for this distance. Tap Back."
            : d.closing < 0.02 && d.range > 2
              ? "Tap Forward to start closing."
              : "Steady. Small taps."}
        {view !== "cockpit" && d.range < 120 && (
          <>
            {" "}
            <button type="button" className="fd-link" onClick={() => setView("cockpit")}>
              Cockpit view
            </button>
          </>
        )}
      </p>
    </section>
  );
}

function AimIcon({ id }: { id: Aim }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {id === "computer" && (
        <>
          <circle cx="12" cy="12" r="8" {...c} />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path d="M12 1v5M12 18v5M1 12h5M18 12h5" {...c} />
        </>
      )}
      {id === "pro" && (
        <>
          <circle cx="12" cy="12" r="5" {...c} />
          <path d="M12 2v5M3 12h4M17 12h4" {...c} />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        </>
      )}
      {id === "retro" && (
        <>
          <circle cx="12" cy="12" r="5" {...c} />
          <path d="M8.5 8.5l7 7M15.5 8.5l-7 7M12 17v4M4 15l3-2M20 15l-3-2" {...c} />
        </>
      )}
      {id === "radOut" && (
        <>
          <circle cx="12" cy="12" r="5" {...c} />
          <path d="M12 2v5M12 17v5M2 12h5M17 12h5" {...c} />
        </>
      )}
      {id === "radIn" && (
        <>
          <circle cx="12" cy="12" r="5" {...c} />
          <path d="M12 7v3M12 14v3M7 12h3M14 12h3" {...c} />
        </>
      )}
      {id === "nrm" && <path d="M12 3l8 15H4z" {...c} />}
      {id === "anti" && (
        <>
          <path d="M12 3l8 15H4z" {...c} />
          <path d="M12 8v6" {...c} />
        </>
      )}
    </svg>
  );
}

/** Reviewer shortcut (?fly=approach): fly the whole route instantly with a perfect computer, keep the cards. */
function debugToApproach(sim: FlightSim, g: GameState, act: (a: Action) => string | null) {
  // play through the cards with the first allowed choice, then park at the approach point
  sim.fastForwardToApproach();
  void g;
  void act;
}
