"use client";

/**
 * Walk Lantern 17: go outside, glide along the rails to each zone, look with your own eyes (or the
 * thermal visor), and do the work there. Every button is the engine's own action, with its real hours
 * and refusal reasons, so the 3D walk and the station guide can never disagree.
 */
import "./walk.css";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  HAZARDS,
  SENSORS,
  testUnlocked,
  METHOD_HOURS,
  REPAIR_HOURS,
  ZONES,
  ZONE_ORDER,
  fmtHours,
  hasSensor,
  iceClock,
  isEclipse,
  jobHours,
  mirrorOutputPct,
  reactorClock,
} from "@/lib/game";
import type { Action, HazardId, Method, ZoneId } from "@/lib/game";
import { Latest, clueCount, r1, type Coach, type QuestCtx } from "../shared";
import { WalkScene, type Pin, type ScreenPin } from "./walkScene";
import type { Sound } from "../../mission/audio";
import Lumen, { type Tip } from "../../guide/Lumen";

const METHODS: { id: Method; name: string; sub: string }[] = [
  { id: "eva", name: "Look up close", sub: "Hands-on, here and now. Uses suit air." },
  { id: "download", name: "Read its logs", sub: "Plug into the data port. Glare can't fool it." },
  { id: "scan", name: "Scan from the ship", sub: "Your ship's cameras, from a safe distance." },
  { id: "drone", name: "Send a drone", sub: "Quick, but bright light can blind it." },
  { id: "arm", name: "Use the robot arm", sub: "Slow and careful. Only if you packed it." },
];

/** What you see when you get there: plain words, no spoilers beyond what your eyes would tell you. */
const SEE: Record<ZoneId, (s: { leak: boolean; drift: boolean; found: (f: string) => boolean }) => string> = {
  dock: () => "The docking hub. Your ship is latched to the ring behind you. The seals hold; the hub's windows still glow.",
  spine: (s) =>
    s.drift
      ? "The spine truss runs the length of the station. Inside the grey box two gyro wheels spin to keep Lantern 17 pointed at the cities. The far wheel is wobbling."
      : "The spine truss. Both gyro wheels spin true now.",
  radiators: (s) =>
    s.leak
      ? "Two radiator fins shed the reactor's heat. Along the edge of the near fin, something glitters in your lamp, like snow."
      : "Two radiator fins shed the reactor's heat. The coolant loops glow steady.",
  mast: () => "The sensor mast. The box at its base is the station's black box: every reading Lantern 17 ever took.",
  kiln: () => "The Kiln, the fusion lamp. It is hot out here: listen to your dosimeter.",
  petals: () => "Eighteen gold mirror segments throw the Kiln's light down to the cities. Look closely: one of them doesn't sit quite right.",
};

const HAZARD_ZONE: Record<HazardId, ZoneId> = { leak: "radiators", drift: "spine" };

/** What the thermal visor shows that your eyes can't. To count as evidence, record it with the ship's thermal camera (Scan). */
const THERMAL_HINT: Partial<Record<ZoneId, string>> = {
  petals: "Thermal: one segment has a white-hot bloom on its face, where the light was focused. Your eyes can't see it. A thermal scan from the ship would record it.",
  radiators: "Thermal: a cold, dark plume streams off the fin's edge. Escaping ammonia flash-freezes.",
  kiln: "Thermal: the Kiln is white-hot, and so is everything within a few metres of it.",
  dock: "Thermal: the hub and your ship glow warm. People live in there.",
};

export default function StationWalk({ c, coach, onGuide, sound }: { c: QuestCtx; coach: Coach; onGuide: () => void; sound: Sound }) {
  const g = c.game;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WalkScene | null>(null);
  const gameRef = useRef(g);
  const [zone, setZone] = useState<ZoneId>("dock");
  const [moving, setMoving] = useState(false);
  const [pins, setPins] = useState<ScreenPin[]>([]);
  const [thermal, setThermal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testShot, setTestShot] = useState(false);
  const hasThermal = hasSensor(g, "thermal");

  useEffect(() => {
    gameRef.current = g;
  }, [g]);

  // the scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: WalkScene;
    try {
      scene = new WalkScene(canvas, { hull: gameRef.current.loadout.hull, engine: gameRef.current.loadout.engine, shield: gameRef.current.loadout.shield });
    } catch (e) {
      queueMicrotask(() => setErr(e instanceof Error ? e.message : String(e)));
      return;
    }
    sceneRef.current = scene;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __walk: unknown }).__walk = scene;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      scene.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    let pinAt = 0;
    let pinKey = "";
    let wasMoving = false;
    let clickAt = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const gg = gameRef.current;
      const sp = scene.frame(dt, {
        output: mirrorOutputPct(gg) / 100,
        leak: !gg.leakPatched,
        drift: !gg.driftFixed,
        eclipse: isEclipse(gg.t),
        dark: !gg.reactorOnline,
      });
      // the HUD only re-renders when a pin really moves or the glide starts or stops
      if (now - pinAt > 120) {
        pinAt = now;
        const key = sp.map((p) => `${p.id}:${p.on ? 1 : 0}:${Math.round(p.x * 200)}:${Math.round(p.y * 200)}`).join("|");
        if (key !== pinKey) {
          pinKey = key;
          setPins(sp);
        }
        if (scene.moving !== wasMoving) {
          wasMoving = scene.moving;
          setMoving(scene.moving);
        }
      }
      // the dosimeter clicks faster as you near the Kiln
      const d = scene.kilnDistance();
      const rate = gg.reactorOnline ? Math.min(14, 1600 / (d * d)) : 0;
      if (rate > 0.3 && now - clickAt > 1000 / rate + Math.random() * (400 / rate)) {
        clickAt = now;
        sound.tick();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // built once; game changes reach the loop through gameRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // drag to look around
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      const s = sceneRef.current;
      if (!last || !s) return;
      s.yaw = Math.max(-2.6, Math.min(2.6, s.yaw - (e.clientX - last.x) * 0.004));
      s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch - (e.clientY - last.y) * 0.004));
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => (last = null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  // pins on what you've found
  const found = g.found.join(",");
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const st = s.station;
    const seg = st.segment7 ? st.segment7.position.clone() : new THREE.Vector3(50, 7, 9);
    const list: Pin[] = [];
    const has = (f: string) => g.found.includes(f as never);
    if (has("leak")) list.push({ id: "leak", label: g.leakPatched ? "Leak patched" : "Ammonia leak", at: st.leakAt.clone(), tone: g.leakPatched ? "fixed" : "hazard" });
    if (has("drift")) list.push({ id: "drift", label: g.driftFixed ? "Gyro fixed" : "Failed gyro wheel", at: new THREE.Vector3(-18, 0, 2.6), tone: g.driftFixed ? "fixed" : "hazard" });
    if (has("C1")) list.push({ id: "C1", label: "C1 · Cracked segment 7", at: seg.clone().add(new THREE.Vector3(0, -0.8, 0)), tone: "clue" });
    if (has("C2")) list.push({ id: "C2", label: "C2 · Burn scar", at: seg.clone().add(new THREE.Vector3(1.6, -0.6, 1.2)), tone: "clue" });
    if (has("C3")) list.push({ id: "C3", label: "C3 · Vapour cloud record", at: new THREE.Vector3(4, 3.2, 0.9), tone: "clue" });
    if (has("C4")) list.push({ id: "C4", label: "C4 · Path mismatch", at: new THREE.Vector3(4, 3.2, -0.9), tone: "clue" });
    s.setPins(list);
    // a find lights the visor
    if (list.length) s.flash();
  }, [found, g.found, g.leakPatched, g.driftFixed]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.thermal = thermal;
  }, [thermal]);

  // the test: when the engine records it, play the shot; afterwards the block stays pushed
  const testAt = g.test?.t ?? null;
  const seenTest = useRef(testAt);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    if (testAt !== null && seenTest.current === null) {
      setThermal(false);
      s.playTest();
      sound.swell(92);
      sound.burn(6);
      setTestShot(true);
      const id = window.setTimeout(() => setTestShot(false), 10500);
      seenTest.current = testAt;
      return () => window.clearTimeout(id);
    }
    s.testDone = testAt !== null;
    seenTest.current = testAt;
  }, [testAt, sound]);

  const go = (z: ZoneId) => {
    const s = sceneRef.current;
    if (!s) return;
    const d = s.goTo(z);
    setZone(z);
    if (d > 0) sound.puff(0.4);
  };

  const survey = () => {
    c.run({ type: "survey" });
    if (sceneRef.current) sceneRef.current.survey = 6;
  };

  const run = (a: Action) => {
    c.run(a);
  };

  const z = ZONES[zone];
  const known = zone === "dock" || g.zonesKnown.includes(zone);
  const hazards = (Object.keys(HAZARD_ZONE) as HazardId[]).filter((h) => HAZARD_ZONE[h] === zone && g.found.includes(h));
  const reactor = reactorClock(g);
  const see = known
    ? SEE[zone]({ leak: !g.leakPatched, drift: !g.driftFixed, found: (f) => g.found.includes(f as never) })
    : "Your survey couldn't see this part of the station. You're here now: pick how to look, and it goes on your map.";
  const opt = (pred: (a: Action) => boolean) => c.opts.find((o) => pred(o.action));
  const surveyOpt = opt((a) => a.type === "survey");
  const zoneState = useMemo(
    () =>
      Object.fromEntries(
        ZONE_ORDER.map((id) => {
          const worked = g.done.some((d) => d.startsWith(`${id}:`));
          const broken = (id === "radiators" && g.found.includes("leak") && !g.leakPatched) || (id === "spine" && g.found.includes("drift") && !g.driftFixed);
          const fixed = (id === "radiators" && g.leakPatched) || (id === "spine" && g.driftFixed);
          return [id, broken ? "broken" : fixed ? "fixed" : worked ? "worked" : id === "dock" || g.zonesKnown.includes(id) ? "known" : "unknown"];
        }),
      ) as Record<ZoneId, string>,
    [g.done, g.found, g.leakPatched, g.driftFixed, g.zonesKnown],
  );

  /** Lumen's line out here: the coach's next step, pointing at where to do it. */
  function walkTip(): Tip {
    const base = { title: coach.title.toLowerCase() };
    if (!g.surveyed) return { ...base, id: "survey", text: `Welcome outside Lantern 17. ${coach.text} Press Fly the survey.`, target: ".sw-work .sq-btn" };
    if (moving) return { ...base, id: `moving-${zone}`, text: "Gliding along the safety rail. Drag the view to look around.", target: undefined };
    if (coach.step === "fix") {
      const here = hazards.some((h) => (h === "leak" ? !g.leakPatched : !g.driftFixed));
      return here
        ? { ...base, id: `fix-here-${zone}`, text: `${coach.text} It's right here. Press a Fix button.`, target: ".sw-fix .sw-act", tone: "warn" }
        : { ...base, id: `fix-go-${zone}`, text: `${coach.text} Go to the zone marked red on the left.`, target: ".sw-zone.broken", tone: "warn" };
    }
    if (coach.step === "investigate") {
      const left = METHODS.filter((m) => !g.done.includes(`${zone}:${m.id}`)).length;
      return left > 0 && zoneState[zone] !== "worked"
        ? { ...base, id: `look-${zone}`, text: `You're at ${z.name}. Pick a way to look, below. Each takes some time and finds different things: thermal sees heat, a close look sees cracks. Clues found so far: ${clueCount(g)} of 6.`, target: ".sw-methods" }
        : { ...base, id: `next-zone-${zone}`, text: `You've searched ${z.name}. Glide to another zone from the list on the left. Unknown zones go on your map once you get there.`, target: ".sw-zones" };
    }
    if (coach.step === "prove" && testUnlocked(g) && !g.test) {
      return zone === "petals" || zone === "kiln"
        ? { ...base, id: `test-${zone}`, text: `${coach.text} The test is right here.`, target: ".sw-test" }
        : { ...base, id: "test-go", text: `${coach.text} Go to the Petals or the Kiln to run it.`, target: ".sw-zones" };
    }
    if (coach.zone) {
      const there = ZONES[coach.zone].name;
      return zone === coach.zone
        ? { ...base, id: `clue-here-${zone}`, text: `${coach.text} You're at ${there}: pick that below.`, target: ".sw-methods" }
        : { ...base, id: `clue-go-${coach.zone}`, text: `${coach.text} Glide to ${there} from the list on the left.`, target: ".sw-zones" };
    }
    return { ...base, id: `guide-${coach.step}-${coach.title}`, text: `${coach.text} You do that in the station guide.`, target: ".sw-guide" };
  }

  if (err) {
    return (
      <div className="sw sw-error">
        <p>The 3D walk needs WebGL ({err}).</p>
        <button type="button" className="sq-btn" onClick={onGuide}>
          Use the station guide
        </button>
      </div>
    );
  }

  return (
    <div className={`sw${thermal ? " thermal" : ""}${testShot ? " shot" : ""}`}>
      <canvas ref={canvasRef} className="sw-canvas" aria-label="Outside Lantern 17, first person" />
      <div className="sw-visor" aria-hidden="true" />

      {pins.map(
        (p) =>
          p.on && (
            <div key={p.id} className={`sw-pin ${p.tone}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
              <i />
              <span>{p.label}</span>
            </div>
          ),
      )}

      {testShot && g.test && (
        <div className="sw-testread" role="status">
          <p className="sw-eyebrow">The controlled test · 10 kW for 60 s</p>
          <p className="big">
            {r1(g.test.measuredCmS)} <small>± {r1((g.test.measuredCmS * g.test.bandPct) / 100)} cm/s</small>
          </p>
          <p>
            The block moved. Light alone pushed it, measured with your {SENSORS[g.test.sensor].name.toLowerCase()} (±{g.test.bandPct}%:{" "}
            {g.test.bandPct <= 3 ? "proven" : g.test.bandPct <= 15 ? "likely" : "maybe"}).
          </p>
        </div>
      )}

      {/* the suit's readouts */}
      <section className="sw-panel sw-suit" aria-label="Suit" data-explain="Your suit's screen. The clock, how long until the ice hits, how much air is left, how much radiation you have soaked up, and how many clues you have found.">
        <p className="sw-eyebrow">EVA suit</p>
        <dl>
          <div>
            <dt>Mission hour</dt>
            <dd>{r1(g.t)}</dd>
          </div>
          <div>
            <dt>Ice impact</dt>
            <dd className={iceClock(g) < 8 ? "red" : ""}>T−{r1(iceClock(g))} h</dd>
          </div>
          <div>
            <dt>Suit air</dt>
            <dd>{fmtHours(g.evaHours)}</dd>
          </div>
          <div>
            <dt>Dose</dt>
            <dd>{r1(g.doseMsv)} mSv</dd>
          </div>
          <div>
            <dt>Clues</dt>
            <dd className="amber">{clueCount(g)} of 6</dd>
          </div>
          <div>
            <dt>Light</dt>
            <dd>{isEclipse(g.t) ? "Eclipse" : "Daylight"}</dd>
          </div>
        </dl>
        {reactor !== null && <p className="sw-alarm">Reactor shuts down in {r1(Math.max(0, reactor))} h unless the leak is patched.</p>}
        <div className="sw-modes" role="group" aria-label="Visor">
          <button type="button" aria-pressed={!thermal} onClick={() => setThermal(false)}>
            Visor
          </button>
          <button type="button" aria-pressed={thermal} onClick={() => hasThermal && setThermal(true)} disabled={!hasThermal} title={hasThermal ? "Thermal view" : "Needs the thermal IR camera on your ship"}>
            Thermal
          </button>
        </div>
      </section>

      {/* where to go */}
      <nav className="sw-panel sw-zones" aria-label="Go to a zone" data-explain="The six parts of the station. Tap one to glide there. Red means something is broken there; green means fixed.">
        <p className="sw-eyebrow">Go to</p>
        {ZONE_ORDER.map((id, i) => (
          <button key={id} type="button" className={`sw-zone ${zoneState[id]}`} aria-current={zone === id ? "location" : undefined} onClick={() => go(id)}>
            <span className="n">{i + 1}</span>
            <span>{zoneState[id] === "unknown" ? "Unknown zone" : ZONES[id].name}</span>
            <i aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="sw-guide" onClick={onGuide}>
          Station guide (steps, proof, report) →
        </button>
      </nav>

      {/* the guide */}
      {!testShot && <Lumen tip={walkTip()} place="top-center" />}

      {/* the work */}
      <section className="sw-panel sw-work" aria-label={`At ${z.name}`} aria-live="polite">
        {!g.surveyed ? (
          <>
            <p className="sw-eyebrow">First things first</p>
            <h2>Survey the station</h2>
            <p className="sw-see">Your ship flies a lap round Lantern 17 so you know where everything is. 30 minutes and a little battery.</p>
            <button type="button" className="sq-btn big" aria-disabled={!surveyOpt?.ok || undefined} onClick={survey}>
              Fly the survey
            </button>
            {surveyOpt && !surveyOpt.ok && <p className="sq-why">{surveyOpt.reason}</p>}
          </>
        ) : (
          <>
            <p className="sw-eyebrow">
              {moving ? "Moving along the rail…" : known ? (z.far ? "Far from your ship" : "Near your ship") : "Not on your map yet"}
            </p>
            <h2>{known ? z.name : "Unknown zone"}</h2>
            <p className="sw-see">{see}</p>
            {thermal && THERMAL_HINT[zone] && <p className="sw-thermal">{THERMAL_HINT[zone]}</p>}
            {known && (
              <p className="sw-hazard">
                <b>Watch out:</b> {z.hazard}
              </p>
            )}
            {hazards.map((h) => {
              const done = h === "leak" ? g.leakPatched : g.driftFixed;
              if (done) return null;
              const methods = (h === "leak" ? ["eva", "arm"] : ["eva"]) as ("eva" | "arm")[];
              return (
                <div key={h} className="sw-fix">
                  <p className="sw-eyebrow red">Broken here</p>
                  <b>{HAZARDS[h].name}</b>
                  <div className="sw-actions">
                    {methods.map((m) => {
                      const o = opt((a) => a.type === "repair" && a.repair === h && a.method === m);
                      const job = jobHours(g, HAZARDS[h].zone, m, REPAIR_HOURS[h]);
                      return (
                        <div key={m}>
                          <button type="button" className="sw-act fix" aria-disabled={!o?.ok || undefined} onClick={() => run({ type: "repair", repair: h, method: m })}>
                            {m === "eva" ? "Fix it with your hands" : "Fix it with the arm"} <i>{fmtHours(job.hours)}</i>
                          </button>
                          {o && !o.ok && <p className="sq-why">{o.reason}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(zone === "petals" || zone === "kiln") && <TestCard c={c} />}
            <div className="sw-methods" role="group" aria-label="Ways to look" data-explain="Ways to look at this zone. Each takes some hours and finds different things. Some need a part you packed in the hangar.">
              {METHODS.map((m) => {
                const o = opt((a) => a.type === "inspect" && a.zone === zone && a.method === m.id);
                const done = g.done.includes(`${zone}:${m.id}`);
                const job = jobHours(g, zone, m.id, METHOD_HOURS[m.id]);
                const locked = !o?.ok && !done;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`sw-act${done ? " done" : ""}${locked ? " locked" : ""}`}
                    aria-disabled={done || locked || undefined}
                    title={locked ? o?.reason : m.sub}
                    onClick={() => !done && !moving && run({ type: "inspect", zone, method: m.id })}
                  >
                    <b>{m.name}</b>
                    <small>{locked ? o?.reason : m.sub}</small>
                    <i>{done ? "done ✓" : fmtHours(job.hours)}</i>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {c.flash && (
          <p className="sq-flash" role="alert">
            {c.flash}
          </p>
        )}
        <Latest game={g} from={c.from} />
        <p className="sw-fine">Time out here is compressed: the clock and your suit air move by the real hours each job takes.</p>
      </section>
    </div>
  );
}

/** The controlled test, from where you can see it happen. */
function TestCard({ c }: { c: QuestCtx }) {
  const g = c.game;
  const o = c.opts.find((x) => x.action.type === "test");
  const unlocked = testUnlocked(g);
  if (g.test) {
    return (
      <div className="sw-test done">
        <p className="sw-eyebrow">The test · done</p>
        <b>
          The block moved {r1(g.test.measuredCmS)} cm/s (±{g.test.bandPct}%). Light pushes ice.
        </b>
      </div>
    );
  }
  return (
    <div className={`sw-test${unlocked ? " ready" : ""}`}>
      <p className="sw-eyebrow">The test · {unlocked ? "ready" : "locked"}</p>
      <b>Aim the cracked segment at a 1 m block of ice and fire for 60 seconds.</b>
      <p>If light can push ice, the block will move, and your best sensor will measure how fast. Two hours; Lantern 17 goes dark for one of them.</p>
      <button type="button" className="sw-act fix" aria-disabled={!o?.ok || undefined} onClick={() => c.run({ type: "test" }, "thump")}>
        Run the test <i>2 h</i>
      </button>
      {o && !o.ok && <p className="sq-why">{o.reason}</p>}
    </div>
  );
}
