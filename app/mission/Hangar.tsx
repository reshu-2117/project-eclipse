"use client";

import { PLAIN, plainFor } from "@/lib/game/data/plain";
import Lumen, { type Tip } from "../guide/Lumen";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ADDONS,
  BUDGET,
  COMMS,
  ENGINES,
  HULLS,
  KIT,
  MOBILITY,
  POWER,
  PRESETS,
  RADIATION,
  ROUTES,
  SENSORS,
  SHIELDS,
  SUITS,
  actionsToReach,
  lineItems,
  loadoutStats,
  presetFacts,
  routeFit,
  sameShip,
} from "@/lib/game";
import type { Action, GameState, Loadout, Source } from "@/lib/game";
import { HANGAR_ENTER, HANGAR_LAUNCH, HANGAR_REVIEW, type VoiceLine } from "@/lib/game/data/story";
import Blueprint, { HullThumb, type Focus } from "./Blueprint";
import type { Sound } from "./audio";
import { useReducedMotion } from "./Opening";

type Bay = "hull" | "parts" | "suits" | "review";
const BAYS: { id: Bay; letter: string; name: string; sub: string }[] = [
  { id: "hull", letter: "A", name: "Hull bay", sub: "Packages · Courier · Tender · Hauler" },
  { id: "parts", letter: "B", name: "Part slots", sub: "Six slots and two add-ons" },
  { id: "suits", letter: "C", name: "Suit bay", sub: "Soft or hard, tether or jetpack" },
  { id: "review", letter: "D", name: "Readiness review", sub: "Red flags before launch" },
];

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${r0(Math.abs(n))}`;

// ───────────────────────────── small pieces ─────────────────────────────

/** A number that rolls to its new value instead of jumping. */
function useRolling(value: number, reduce: boolean): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    if (reduce) {
      raf.current = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(raf.current);
    }
    const start = performance.now();
    const a = from.current;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 520);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduce]);
  return shown;
}

const SOURCE_LABEL: Record<Source, string> = { real: "REAL", game: "GAME VALUE", fiction: "FICTION" };

interface Flash {
  id: string;
  text: string;
  n: number;
}

interface OptProps {
  id: string;
  name: string;
  source?: Source;
  nums: [string, string][];
  gain?: string;
  cost?: string;
  anchor?: string;
  on: boolean;
  locked?: string;
  dv?: number;
  credits?: number;
  flash: Flash | null;
  onPick: () => void;
}

function Opt({ id, name, source, nums, gain, cost, anchor, on, locked, dv, credits, flash, onPick }: OptProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const mine = flash?.id === id ? flash : null;
  const plain = plainFor(id);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (mine && !reduce) {
      ref.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
        { duration: 260 },
      );
    }
  }, [mine, reduce]);
  return (
    <div className="hg-optwrap">
      <button
        ref={ref}
        type="button"
        className={`hg-opt${on ? " on" : ""}${locked ? " locked" : ""}`}
        aria-pressed={on}
        aria-disabled={locked ? true : undefined}
        onClick={onPick}
      >
        <span className="hg-opt-top">
          <b>{name}</b>
          {source && <i className={`hg-tag ${source}`}>{SOURCE_LABEL[source]}</i>}
        </span>
        <span className="hg-opt-nums">
          {nums.map(([k, v]) => (
            <span key={k}>
              <small>{k}</small> {v}
            </span>
          ))}
          {!on && dv !== undefined && dv !== 0 && (
            <span className={dv > 0 ? "up" : "down"}>
              <small>Δv</small> {signed(dv)}
            </span>
          )}
          {!on && credits !== undefined && credits !== 0 && (
            <span className={credits < 0 ? "up" : "down"}>
              <small>CR</small> {signed(credits)}
            </span>
          )}
        </span>
        {plain ? (
          <>
            <span className="hg-plain best">
              <b>Great for</b> {plain.best}
            </span>
            <span className="hg-plain worst">
              <b>Bad at</b> {plain.worst}
            </span>
            {on && gain && <span className="hg-gain">{gain}</span>}
            {on && cost && <span className="hg-cost">{cost}</span>}
          </>
        ) : (
          <>
            {gain && <span className="hg-gain">{gain}</span>}
            {cost && <span className="hg-cost">{cost}</span>}
          </>
        )}
        {anchor && <span className="hg-anchor">{anchor}</span>}
        {locked && <span className="hg-locked">{locked}</span>}
      </button>
      {mine && (
        <p key={mine.n} className="hg-reason" role="alert">
          {mine.text}
        </p>
      )}
    </div>
  );
}

function Group({ title, hint, focus, setFocus, f, children }: { title: string; hint?: string; focus: Focus; setFocus: (f: Focus) => void; f: Focus; children: ReactNode }) {
  return (
    <section
      className={`hg-group${focus === f ? " focus" : ""}`}
      onMouseEnter={() => setFocus(f)}
      onMouseLeave={() => setFocus(null)}
      onFocus={() => setFocus(f)}
      onBlur={() => setFocus(null)}
    >
      <header>
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </header>
      <div className="hg-opts">{children}</div>
    </section>
  );
}

// ───────────────────────────── the review ─────────────────────────────

const WHY: Record<string, string> = {
  dv: "Δv is how much you can change your speed. Below the safe route plus margin, one surprise can strand you.",
  speed: "Without lidar or radar you can only guess how fast the ice is moving. A camera alone is about ±60%.",
  energy: "Life support, heaters and sensors drain stored energy. At zero, the mission ends.",
  shield: "Debris from the ice stream will hit the hull. With no shield, a pebble swarm costs you 20 hull points.",
  inspect: "With no suits, drones or arm you can read data from the ship, but you can't look closely or repair anything.",
  budget: "The budget is a hard limit. Take something out, or pick a cheaper hull.",
  bay: "The parts weigh more than this hull's bay can carry. Take something out, or pick a bigger hull.",
  slots: "This hull has fewer sensor slots. Take a sensor out.",
};

const CHECKS: { id: string; pass: string; level: "warn" | "block" }[] = [
  { id: "budget", pass: `Within the ${BUDGET}-credit budget`, level: "block" },
  { id: "bay", pass: "Parts fit the hull's bay", level: "block" },
  { id: "slots", pass: "Sensors fit the hull's slots", level: "block" },
  { id: "dv", pass: "Δv covers the safe route with a 10% margin", level: "warn" },
  { id: "speed", pass: "A sensor can measure speed (lidar or radar)", level: "warn" },
  { id: "energy", pass: "Energy lasts 30 hours of normal use", level: "warn" },
  { id: "shield", pass: "A shield is fitted", level: "warn" },
  { id: "inspect", pass: "Something can inspect and repair up close", level: "warn" },
];

// ───────────────────────────── the hangar ─────────────────────────────

export default function Hangar({
  game,
  act,
  sound,
  say,
}: {
  game: GameState;
  /** Run an action through the engine. Returns the reason if it was refused. */
  act: (a: Action) => string | null;
  sound: Sound;
  say: (line: VoiceLine) => void;
}) {
  const reduce = useReducedMotion();
  const l = game.loadout;
  const stats = useMemo(() => loadoutStats(l), [l]);
  const fit = useMemo(() => routeFit(l), [l]);
  const items = useMemo(() => lineItems(l), [l]);
  const [bay, setBay] = useState<Bay>("hull");
  const [focus, setFocus] = useState<Focus>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [launching, setLaunching] = useState(false);
  const flashN = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const id = window.setTimeout(() => say(HANGAR_ENTER), 700);
    const list = timers.current;
    return () => {
      window.clearTimeout(id);
      list.forEach((t) => window.clearTimeout(t));
    };
  }, [say]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 5200);
    return () => window.clearTimeout(id);
  }, [flash]);

  const pick = useCallback(
    (flashId: string, a: Action) => {
      const reason = act(a);
      if (reason) {
        sound.reject();
        flashN.current += 1;
        setFlash({ id: flashId, text: reason, n: flashN.current });
      } else {
        sound.lock();
        setFlash(null);
        setConfirming(false);
      }
    },
    [act, sound],
  );

  const goBay = (b: Bay) => {
    if (b === bay) return;
    sound.click();
    setBay(b);
    setConfirming(false);
    if (b === "review") say(HANGAR_REVIEW);
  };

  const applyPreset = (loadout: Loadout) => {
    // the same clicks a player would make, each checked by the engine and recorded in order
    actionsToReach(game, loadout).forEach((a) => act(a));
    sound.lock();
    setFlash(null);
  };

  // what a change would do to Δv and credits, before you make it
  const prev = (patch: Partial<Loadout>) => {
    const b = loadoutStats({ ...l, ...patch });
    return { dv: b.dv - stats.dv, credits: b.credits - stats.credits };
  };
  const toggled = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const blocks = stats.flags.filter((f) => f.level === "block");
  const warns = stats.flags.filter((f) => f.level === "warn");
  const dvShown = useRolling(stats.dv, reduce);
  const hull = HULLS[l.hull];
  // the package the ship currently matches, if any: it stops matching the moment you change a part
  const loaded = PRESETS.find((p) => sameShip(l, p.loadout));

  const launch = () => {
    if (blocks.length) return;
    if (warns.length && !confirming) {
      sound.click();
      setConfirming(true);
      return;
    }
    sound.launch();
    say(HANGAR_LAUNCH);
    setLaunching(true);
    const t = window.setTimeout(() => act({ type: "launch" }), reduce ? 800 : 2600);
    timers.current.push(t);
  };

  const bayIndex = BAYS.findIndex((b) => b.id === bay);
  const nextBay = BAYS[bayIndex + 1];
  const prevBay = BAYS[bayIndex - 1];

  // Lumen: one line for the bay you are in, pointing at the thing that matters now
  const reachable = fit.filter((r) => r.fits).length;
  const tip: Tip =
    blocks.length > 0 && bay === "review"
      ? { id: `block-${blocks[0].id}`, title: "can't launch yet", text: `${blocks[0].text}`, target: ".hg-gantry", tone: "warn" }
      : reachable === 0
        ? { id: "noreach", title: "fuel", text: "Your ship can't reach Lantern 17 yet. The big number on the right is your fuel. Add fuel, or swap a heavy part for a lighter one, until a route turns green.", target: ".hg-dv", tone: "warn" }
        : bay === "hull" && loaded
          ? { id: `pkg-${loaded.id}`, title: "package loaded", text: `${loaded.name} is built and cleared for launch. Press “Go to the launch check” to take off, or change any part first.`, target: ".hg-loaded", tone: "good" }
          : bay === "hull"
            ? { id: "hull", title: "step 1 of 4", text: "New here? Take a package at the top and I will take you straight to launch. Or build your own: pick the size of your ship first. A bigger ship carries more, but it is heavier, so the same fuel takes you less far.", target: ".hg-packages" }
            : bay === "parts"
              ? { id: "parts", title: "step 2 of 4", text: "Pick one part from each row. Each card says what it is great for and what it is bad at. Keep an eye on the big number on the right: that is how far your fuel takes you.", target: ".hg-dv" }
              : bay === "suits"
                ? { id: "suits", title: "step 3 of 4", text: "Suits are for going outside at Lantern 17. Not sure? Leave the defaults and move on.", target: ".hg-nav" }
                : warns.length > 0
                  ? { id: `warn-${warns.length}`, title: "step 4 of 4", text: `Your ship can fly, but I see ${warns.length} risk${warns.length === 1 ? "" : "s"} listed here. Fix them, or launch anyway and live with them.`, target: ".hg-gantry" }
                  : { id: "ready", title: "step 4 of 4", text: "Everything checks out. Press Launch.", target: ".hg-gantry .btn-lantern", tone: "good" };

  // the gauge: 0 to 3,000 m/s, with a tick for what each route needs
  const GMAX = 3000;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / GMAX) * 100))}%`;

  return (
    <div className="hg">
      <header className="hg-head">
        <p className="eyebrow">
          The Wick <b>{"//"}</b> Orbital dock · 300 km
        </p>
        <ol className="hg-bays" aria-label="Hangar bays" data-explain="The four steps of building your ship. Go left to right: the hull, the parts, the suits, then a final check.">
          {BAYS.map((b, i) => (
            <li key={b.id}>
              <button
                type="button"
                className={`hg-bay${bay === b.id ? " on" : ""}${i < bayIndex ? " done" : ""}`}
                aria-current={bay === b.id ? "step" : undefined}
                onClick={() => goBay(b.id)}
              >
                <span className="hg-bay-letter">{b.letter}</span>
                <span>
                  <b>{b.name}</b>
                  <small>{b.sub}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="hg-grid">
        {/* ───────── left: the bay you are in ───────── */}
        <div className="hg-left">
          {bay === "hull" && (
            <>
              <section className="hg-group hg-packages" data-explain="Five ready-built ships. Pick one and you can go straight to launch. Every one can see heat and measure the ice, which is what gets you believed at the end.">
                <header>
                  <h3>New here? Take a package</h3>
                  <p>Five ready-built ships. Pick one and go straight to launch. Every one can see heat and measure the ice, which is what gets you believed at the end.</p>
                </header>
                <div className="hg-pkgwrap">
                  <div className="hg-opts">
                    {PRESETS.map((p) => {
                      const st = loadoutStats(p.loadout);
                      const f = presetFacts(p.loadout);
                      const on = sameShip(l, p.loadout);
                      return (
                        <div className="hg-optwrap" key={p.id}>
                          <button type="button" className={`hg-opt hg-pkg${on ? " on" : ""}`} aria-pressed={on} onClick={() => applyPreset(p.loadout)}>
                            <span className="hg-opt-top">
                              <b>{p.name}</b>
                              <i className="hg-tagline">{p.tagline}</i>
                            </span>
                            {p.recommended && <span className="hg-star">★ Best first pick</span>}
                            <span className="hg-pickif">
                              <b>Pick this if</b> {p.pickIf}
                            </span>
                            <span className="hg-chips">
                              <i className={`hg-chip ${f.seesHeat ? "ok" : "no"}`}>{f.seesHeat ? "Sees heat" : "Can't see heat"}</i>
                              <i className={`hg-chip ${f.testBandPct !== null ? "ok" : "no"}`}>{f.testBandPct !== null ? `Measures the ice ±${f.testBandPct}%` : "Can't measure the ice"}</i>
                              <i className={`hg-chip ${f.canRepairMirror ? "ok" : "no"}`}>{f.canRepairMirror ? "Can repair the mirror" : "Can't repair the mirror"}</i>
                              <i className="hg-chip">Flies {f.routesInReach} of 5 routes</i>
                            </span>
                            <span className="hg-opt-nums">
                              <span><small>Δv</small> {r0(st.dv)} m/s</span>
                              <span><small>CR</small> {st.credits}</span>
                            </span>
                            <span className="hg-gain">{p.blurb}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {loaded && (
                    <div className="hg-loaded" role="status">
                      <p>
                        <b>{loaded.name}</b> is loaded. {presetFacts(loaded.loadout).cleanLaunch ? "Nothing is flagged." : "Check the launch review."}
                      </p>
                      <span className="hg-loaded-btns">
                        <button type="button" className="btn btn-lantern" onClick={() => goBay("review")}>
                          Go to the launch check <span aria-hidden="true">→</span>
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => goBay("parts")}>
                          Change parts
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <p className="hg-or">
                <span>or build your own ship</span>
              </p>

              <section className="hg-group">
                <header>
                  <h3>Choose a hull</h3>
                  <p>It sets how heavy the ship starts, how much fuel it can hold and how many parts fit. All three can finish the mission. None can do everything.</p>
                </header>
                <div className="hg-opts">
                  {Object.values(HULLS).map((h) => (
                    <div className="hg-optwrap" key={h.id}>
                      <button
                        type="button"
                        className={`hg-opt hg-hull${l.hull === h.id ? " on" : ""}`}
                        aria-pressed={l.hull === h.id}
                        onClick={() => pick(`hull:${h.id}`, { type: "hull", id: h.id })}
                      >
                        <HullThumb id={h.id} />
                        <span className="hg-opt-top">
                          <b>{h.name}</b>
                          <i className="hg-tagline">{h.tagline}</i>
                        </span>
                        <span className="hg-opt-nums">
                          <span><small>CORE</small> {r0(h.coreKg)} kg</span>
                          <span><small>FUEL</small> {r0(h.maxFuelKg)} kg</span>
                          <span><small>BAY</small> {r0(h.bayLimitKg)} kg</span>
                          <span><small>SENSORS</small> {h.sensorSlots}</span>
                          <span><small>CR</small> {h.cost}</span>
                        </span>
                        {PLAIN[h.id] && (
                          <>
                            <span className="hg-plain best">
                              <b>Great for</b> {PLAIN[h.id].best}
                            </span>
                            <span className="hg-plain worst">
                              <b>Bad at</b> {PLAIN[h.id].worst}
                            </span>
                          </>
                        )}
                        {l.hull === h.id && <span className="hg-gain">{h.note}</span>}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="hg-note">
                  Dry mass = (core + parts) × 1.10. The extra 10% is the design margin real engineers add for growth.
                </p>
              </section>

            </>
          )}

          {bay === "parts" && (
            <>
              <Group title="Engine" hint="Pick one. Isp is how much speed you get from each kilogram of fuel." focus={focus} setFocus={setFocus} f="engine">
                {Object.values(ENGINES).map((e) => (
                  <Opt
                    key={e.id}
                    id={`engine:${e.id}`}
                    name={e.name}
                    source={e.source}
                    on={l.engine === e.id}
                    locked={e.locked}
                    nums={[
                      ["MASS", e.massKg ? `${r0(e.massKg)} kg` : "—"],
                      ["ISP", `${r0(e.isp)} s`],
                      ["CR", e.cost ? String(e.cost) : "—"],
                      ["HEATER", e.heaterKw ? `${Math.round(e.heaterKw * 1000)} W` : "0 W"],
                    ]}
                    gain={e.gain}
                    cost={e.drawback}
                    anchor={e.anchor}
                    dv={e.locked ? undefined : prev({ engine: e.id }).dv}
                    credits={e.locked ? undefined : prev({ engine: e.id }).credits}
                    flash={flash}
                    onPick={() => pick(`engine:${e.id}`, { type: "engine", id: e.id })}
                  />
                ))}
              </Group>

              <Group title="Fuel" hint="More fuel means more Δv, but you get less for every kilogram you add." focus={focus} setFocus={setFocus} f="fuel">
                <div className="hg-fuel">
                  <div className="hg-fuel-top">
                    <b>{r0(stats.fuelKg)} kg</b>
                    <small>of {r0(stats.maxFuelKg)} kg the {hull.name} can hold</small>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={stats.maxFuelKg}
                    step={50}
                    value={stats.fuelKg}
                    aria-label="Fuel loaded, in kilograms"
                    aria-valuetext={`${r0(stats.fuelKg)} kilograms, ${r0(stats.dv)} metres per second of delta-v`}
                    onChange={(e) => act({ type: "fuel", kg: Number(e.target.value) })}
                  />
                  <div className="hg-fuel-btns">
                    <button type="button" className="hg-mini" onClick={() => pick("fuel", { type: "fuel", kg: stats.maxFuelKg })}>
                      Fill the tank
                    </button>
                    <button type="button" className="hg-mini" onClick={() => pick("fuel", { type: "fuel", kg: Math.round(stats.maxFuelKg * 0.5) })}>
                      Half
                    </button>
                  </div>
                </div>
              </Group>

              <Group title="Power" hint="No sun, so no solar panels. Energy is stored, and it has to last." focus={focus} setFocus={setFocus} f="power">
                {Object.values(POWER).map((p) => (
                  <Opt
                    key={p.id}
                    id={`power:${p.id}`}
                    name={p.name}
                    source={p.source}
                    on={l.power === p.id}
                    nums={[
                      ["MASS", `${r0(p.massKg)} kg`],
                      ["STORED", `${p.capacityKwh} kWh`],
                      ["CR", String(p.cost)],
                      ...(p.regenKw ? ([["MAKES", `${p.regenKw} kW`]] as [string, string][]) : []),
                    ]}
                    gain={p.gain}
                    cost={p.drawback}
                    anchor={p.anchor}
                    dv={prev({ power: p.id }).dv}
                    credits={prev({ power: p.id }).credits}
                    flash={flash}
                    onPick={() => pick(`power:${p.id}`, { type: "power", id: p.id })}
                  />
                ))}
              </Group>

              <Group title="Shield" hint="Layered shields shatter debris before it reaches the hull." focus={focus} setFocus={setFocus} f="shield">
                {Object.values(SHIELDS).map((s) => (
                  <Opt
                    key={s.id}
                    id={`shield:${s.id}`}
                    name={s.name}
                    source={s.source}
                    on={l.shield === s.id}
                    nums={[
                      ["MASS", `${r0(s.massKg)} kg`],
                      ["CR", String(s.cost)],
                    ]}
                    gain={s.stops}
                    cost={s.drawback}
                    anchor={s.anchor}
                    dv={prev({ shield: s.id }).dv}
                    credits={prev({ shield: s.id }).credits}
                    flash={flash}
                    onPick={() => pick(`shield:${s.id}`, { type: "shield", id: s.id })}
                  />
                ))}
              </Group>

              <Group
                title={`Sensors · ${l.sensors.length} of ${stats.sensorSlots} slot${stats.sensorSlots === 1 ? "" : "s"}`}
                hint="What you can see, and how sure you can be. Pick up to the number of slots."
                focus={focus}
                setFocus={setFocus}
                f="sensors"
              >
                {Object.values(SENSORS).map((s) => (
                  <Opt
                    key={s.id}
                    id={`sensor:${s.id}`}
                    name={s.name}
                    source={s.source}
                    on={l.sensors.includes(s.id)}
                    nums={[
                      ["MASS", `${r0(s.massKg)} kg`],
                      ["POWER", `${s.powerW} W`],
                      ["CR", String(s.cost)],
                      ["TEST", s.bandPct === null ? "can't" : `±${s.bandPct}%`],
                    ]}
                    gain={s.gain}
                    cost={s.drawback}
                    anchor={s.anchor}
                    dv={prev({ sensors: toggled(l.sensors, s.id) }).dv}
                    credits={prev({ sensors: toggled(l.sensors, s.id) }).credits}
                    flash={flash}
                    onPick={() => pick(`sensor:${s.id}`, { type: "sensor", id: s.id })}
                  />
                ))}
              </Group>

              <Group title="Communications" hint="How fast you can tell the world what you found." focus={focus} setFocus={setFocus} f="comms">
                {Object.values(COMMS).map((c) => (
                  <Opt
                    key={c.id}
                    id={`comms:${c.id}`}
                    name={c.name}
                    source={c.source}
                    on={l.comms === c.id}
                    nums={[
                      ["MASS", `${r0(c.massKg)} kg`],
                      ["POWER", c.powerW ? `${c.powerW} W` : "station"],
                      ["CR", String(c.cost)],
                      ["SPEED", c.mbps < 1 ? `${Math.round(c.mbps * 1000)} kbps` : `${c.mbps} Mbps`],
                    ]}
                    gain={c.gain}
                    cost={c.drawback}
                    anchor={c.anchor}
                    dv={prev({ comms: c.id }).dv}
                    credits={prev({ comms: c.id }).credits}
                    flash={flash}
                    onPick={() => pick(`comms:${c.id}`, { type: "comms", id: c.id })}
                  />
                ))}
              </Group>

              <Group title="Service kit" hint="Pick any that fit the bay. These decide what you can fix, and they pay off late in the game." focus={focus} setFocus={setFocus} f="kit">
                {Object.values(KIT).map((k) => (
                  <Opt
                    key={k.id}
                    id={`kit:${k.id}`}
                    name={k.name}
                    source={k.source}
                    on={l.kit.includes(k.id)}
                    nums={[
                      ["MASS", `${r0(k.massKg)} kg`],
                      ["CR", String(k.cost)],
                    ]}
                    gain={k.gain}
                    cost={k.drawback}
                    anchor={k.anchor}
                    dv={prev({ kit: toggled(l.kit, k.id) }).dv}
                    credits={prev({ kit: toggled(l.kit, k.id) }).credits}
                    flash={flash}
                    onPick={() => pick(`kit:${k.id}`, { type: "kit", id: k.id })}
                  />
                ))}
              </Group>

              <Group title="Power add-ons" hint="Optional. They use bay space." focus={focus} setFocus={setFocus} f="addons">
                {Object.values(ADDONS).map((a) => (
                  <Opt
                    key={a.id}
                    id={`addon:${a.id}`}
                    name={a.name}
                    source={a.source}
                    on={l.addons.includes(a.id)}
                    nums={[
                      ["MASS", `${r0(a.massKg)} kg`],
                      ["CR", String(a.cost)],
                    ]}
                    gain={a.gain}
                    cost={a.drawback}
                    anchor={a.anchor}
                    dv={prev({ addons: toggled(l.addons, a.id) }).dv}
                    credits={prev({ addons: toggled(l.addons, a.id) }).credits}
                    flash={flash}
                    onPick={() => pick(`addon:${a.id}`, { type: "addon", id: a.id })}
                  />
                ))}
              </Group>
            </>
          )}

          {bay === "suits" && (
            <>
              {!l.kit.includes("eva") && (
                <p className="hg-callout">
                  You haven&apos;t packed EVA suits. Pick them in bay B to unlock the suit options. You can skip this bay: the defaults are a soft suit and a tether.
                </p>
              )}
              <Group title="Suit" hint="Soft is mobile and good for detail work. Hard is safer near the reactor, but slower." focus={focus} setFocus={setFocus} f="kit">
                {Object.values(SUITS).map((s) => (
                  <Opt
                    key={s.id}
                    id={`suit:${s.id}`}
                    name={s.name}
                    source={s.source}
                    on={l.suit === s.id}
                    nums={[
                      ["MASS", s.massKg ? `${r0(s.massKg)} kg` : "—"],
                      ["CR", s.cost ? String(s.cost) : "—"],
                    ]}
                    gain={s.gain}
                    cost={s.drawback}
                    flash={flash}
                    onPick={() => pick(`suit:${s.id}`, { type: "suit", id: s.id as "soft" | "hard" })}
                  />
                ))}
              </Group>
              <Group title="Getting around" hint="A tether can't let you drift away, but it can't reach the far zones. A jetpack is an emergency tool, not a scooter." focus={focus} setFocus={setFocus} f="kit">
                {Object.values(MOBILITY).map((s) => (
                  <Opt
                    key={s.id}
                    id={`mob:${s.id}`}
                    name={s.name}
                    source={s.source}
                    on={l.mobility === s.id}
                    nums={[
                      ["MASS", s.massKg ? `${r0(s.massKg)} kg` : "—"],
                      ["CR", s.cost ? String(s.cost) : "—"],
                    ]}
                    gain={s.gain}
                    cost={s.drawback}
                    anchor={s.id === "jetpack" ? "NASA SAFER: about 38 kg each, about 3 m/s in total" : undefined}
                    flash={flash}
                    onPick={() => pick(`mob:${s.id}`, { type: "mobility", id: s.id as "tether" | "jetpack" })}
                  />
                ))}
              </Group>
              <section className="hg-group">
                <header>
                  <h3>Radiation</h3>
                  <p>Normal spacewalks aren&apos;t the danger. Standing near the reactor is.</p>
                </header>
                <div className="hg-rad">
                  <div>
                    <span>Deep space</span>
                    <i style={{ width: "3%" }} />
                    <b>{RADIATION.deepSpaceMsvPerDay} mSv / day</b>
                  </div>
                  <div className="hot">
                    <span>The Kiln (reactor)</span>
                    <i style={{ width: "62%" }} />
                    <b>+{RADIATION.kilnMsvPerH} mSv / hour</b>
                  </div>
                  <div>
                    <span>Career limit</span>
                    <i style={{ width: "100%" }} />
                    <b>{RADIATION.careerLimitMsv} mSv</b>
                  </div>
                </div>
                <p className="hg-note">Deep-space background is from NASA&apos;s Curiosity RAD instrument. The Kiln dose is a game value. A hard suit halves it.</p>
              </section>
            </>
          )}

          {bay === "review" && (
            <>
              <section className="hg-group hg-review">
                <header>
                  <h3>Readiness review</h3>
                  <p>Like NASA&apos;s real Flight Readiness Review, this warns you but still lets you launch. If you do, you own the risk.</p>
                </header>
                <div className={`hg-stamp ${blocks.length ? "held" : warns.length ? "flags" : "clear"}`} key={`${blocks.length}-${warns.length}`}>
                  {blocks.length ? "HELD" : warns.length ? `CLEARED · ${warns.length} FLAG${warns.length === 1 ? "" : "S"}` : "CLEARED"}
                </div>
                <ul className="hg-checks">
                  {CHECKS.map((c) => {
                    const flag = stats.flags.find((f) => f.id === c.id);
                    return (
                      <li key={c.id} className={flag ? flag.level : "pass"}>
                        <span className="hg-check-mark" aria-hidden="true">
                          {flag ? (flag.level === "block" ? "✕" : "!") : "✓"}
                        </span>
                        <div>
                          <b>{flag ? flag.text : c.pass}</b>
                          {flag && <p>{WHY[c.id]}</p>}
                        </div>
                        <span className="sr-only">{flag ? (flag.level === "block" ? "blocks launch" : "warning") : "passed"}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="hg-group">
                <header>
                  <h3>What you are carrying</h3>
                </header>
                <table className="hg-table">
                  <thead>
                    <tr>
                      <th scope="col">Slot</th>
                      <th scope="col">Part</th>
                      <th scope="col">Mass</th>
                      <th scope="col">CR</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Hull</td>
                      <td>{hull.name}</td>
                      <td>{r0(hull.coreKg)} kg</td>
                      <td>{hull.cost}</td>
                    </tr>
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td>{it.slot}</td>
                        <td>{it.name}</td>
                        <td>{it.massKg ? `${r0(it.massKg)} kg` : "—"}</td>
                        <td>{it.cost || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={2}>Dry mass with 10% margin</th>
                      <td>{r0(stats.dryKg)} kg</td>
                      <td>{stats.credits}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            </>
          )}

          <nav className="hg-nav" aria-label="Move between bays">
            {prevBay ? (
              <button type="button" className="btn btn-ghost" onClick={() => goBay(prevBay.id)}>
                <span aria-hidden="true">←</span> {prevBay.name}
              </button>
            ) : (
              <span />
            )}
            {nextBay && (
              <button type="button" className="btn btn-lantern" onClick={() => goBay(nextBay.id)}>
                {nextBay.name} <span aria-hidden="true">→</span>
              </button>
            )}
          </nav>
        </div>

        {/* ───────── centre: the blueprint ───────── */}
        <div className="hg-centre">
          <div className="hg-sheet" data-explain="A drawing of your ship. It changes as you pick parts, so you can see what you are building.">
            <Blueprint loadout={l} stats={stats} focus={focus} />
          </div>

          <div className={`hg-gantry${blocks.length ? " held" : ""}`} data-explain="The launch pad. When it says ready, press Launch. If something is wrong it tells you what.">
            <div>
              <p className="eyebrow">Launch gantry</p>
              <p className="hg-gantry-line">
                {blocks.length
                  ? blocks[0].text
                  : bay !== "review"
                    ? "Finish in the readiness review, then launch."
                    : confirming
                      ? `${warns.length} red flag${warns.length === 1 ? "" : "s"}. Launch anyway?`
                      : "All bays done. The gantry is ready."}
              </p>
            </div>
            {bay !== "review" ? (
              <button type="button" className="btn btn-ghost" onClick={() => goBay("review")}>
                Go to the review <span aria-hidden="true">↓</span>
              </button>
            ) : confirming ? (
              <span className="hg-gantry-btns">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                  Go back
                </button>
                <button type="button" className="btn btn-lantern" onClick={launch}>
                  Launch anyway <span aria-hidden="true">↑</span>
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-lantern" onClick={launch} disabled={blocks.length > 0}>
                Launch <span aria-hidden="true">↑</span>
              </button>
            )}
          </div>
        </div>

        {/* ───────── right: the live numbers ───────── */}
        <aside className="hg-right" aria-label="Live ship numbers">
          <div className="hg-dv" data-explain="Your fuel, counted as how much you can change your speed (Δv, in metres per second). Every route to Lantern 17 costs some. More fuel, or a lighter ship, makes this number bigger.">
            <span>Δv · speed budget</span>
            <b>{r0(dvShown)}</b>
            <small>m/s</small>
          </div>
          <div className="hg-gauge" data-explain="The bar is your fuel. Each numbered tick is what one route needs. If your bar passes a tick, you can fly that route." role="img" aria-label={`Δv ${r0(stats.dv)} metres per second. ${fit.filter((r) => r.fits).length} of 5 routes are in reach.`}>
            <div className="hg-gauge-track">
              <i style={{ width: pct(stats.dv) }} />
              {fit.map((r, n) => (
                <em key={r.id} className={r.fitsWithMargin ? "ok" : r.fits ? "tight" : "no"} style={{ left: pct(r.withMarginDv) }}>
                  <u>{n + 1}</u>
                </em>
              ))}
            </div>
            <p>Ticks show what each route needs, with a 10% margin.</p>
          </div>

          <dl className="hg-dl" data-explain="Your ship's vital numbers: how heavy it is, how much fuel and power it carries, how long the power lasts, and how exact your tests at the station will be.">
            <div>
              <dt>Dry mass</dt>
              <dd>{r0(stats.dryKg)} kg</dd>
            </div>
            <div>
              <dt>Fuel loaded</dt>
              <dd>{r0(stats.fuelKg)} kg</dd>
            </div>
            <div>
              <dt>Energy stored</dt>
              <dd>{r0(stats.energyKwh)} kWh</dd>
            </div>
            <div>
              <dt>Lasts at {r1(stats.loadKw)} kW</dt>
              <dd className={stats.enduranceH < 30 ? "warn" : ""}>{stats.enduranceH === Infinity ? "indefinitely" : `${r0(stats.enduranceH)} h`}</dd>
            </div>
            <div>
              <dt>Test accuracy</dt>
              <dd className={stats.bestBandPct === null ? "warn" : ""}>{stats.bestBandPct === null ? "can't measure" : `±${stats.bestBandPct}%`}</dd>
            </div>
          </dl>

          <Meter label="Bay space" value={stats.bayUsedKg} max={stats.bayLimitKg} unit="kg" over={stats.bayUsedKg > stats.bayLimitKg} />
          <Meter label="Budget" value={stats.credits} max={BUDGET} unit="credits" over={stats.credits > BUDGET} />

          <h3 className="hg-h3">Routes in reach</h3>
          <ol className="hg-routes" data-explain="The five ways to fly to Lantern 17, from cheapest to fastest. Green means you have the fuel for it. Red means you don't.">
            {fit.map((r, n) => (
              <li key={r.id} className={r.fitsWithMargin ? "ok" : r.fits ? "tight" : "no"}>
                <span className="n">{n + 1}</span>
                <span>{ROUTES[r.id].name}</span>
                <span className="v">{r0(r.totalDv)} m/s</span>
                <span className="s">{r.fitsWithMargin ? "fits" : r.fits ? "no margin" : `short ${r0(r.shortBy)}`}</span>
              </li>
            ))}
          </ol>
          {stats.flags.length > 0 && (
            <button type="button" className="hg-flagsbtn" onClick={() => goBay("review")}>
              {blocks.length ? `${blocks.length} problem${blocks.length === 1 ? "" : "s"} blocking launch` : `${warns.length} red flag${warns.length === 1 ? "" : "s"}`} <span aria-hidden="true">→</span>
            </button>
          )}
        </aside>
      </div>

      {!launching && <Lumen tip={tip} />}
      {launching && (
        <div className="hg-launch" role="status" aria-live="assertive">
          <p className="eyebrow">Launch gantry</p>
          <h2 className="display">
            Gantry clear. <em>Launch.</em>
          </h2>
          <ol className="hg-count" aria-hidden="true">
            <li>3</li>
            <li>2</li>
            <li>1</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function Meter({ label, value, max, unit, over }: { label: string; value: number; max: number; unit: string; over: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`hg-meter${over ? " over" : ""}`} data-explain={label === "Budget" ? "Money. Every part costs credits, and you can't go over the budget." : "Room inside the ship. Parts take space; if the bar goes red, nothing more fits."}>
      <div>
        <span>{label}</span>
        <b>
          {r0(value)} <small>/ {r0(max)} {unit}</small>
        </b>
      </div>
      <div className="hg-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
