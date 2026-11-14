"use client";

import Link from "next/link";
import Result from "./Result";
import { useMemo, useState } from "react";
import {
  ADDONS,
  COMMS,
  ENDINGS,
  ENGINES,
  HULLS,
  KIT,
  PLANET,
  POWER,
  ROUTES,
  SENSORS,
  SHIELDS,
  STRATEGIES,
  createGame,
  fuelForDeltaV,
  hohmann,
  hoursForShift,
  loadoutStats,
  orbitPeriodMin,
  planeChangeDv,
  routeFit,
  runPolicy,
  step,
  testPushCmS,
  transferHours,
  type Action,
  type GameState,
} from "@/lib/game";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

// ───────────────────────── 1. handbook vs engine ─────────────────────────

function Checks() {
  const rows = useMemo(() => {
    const wick = PLANET.radiusKm + PLANET.wickAltKm;
    const l17 = PLANET.radiusKm + PLANET.lanternAltKm;
    const h = hohmann(wick, l17);
    const tender = loadoutStats(createGame(1).loadout);
    return [
      { what: "Orbit period at 1,000 km", book: "≈105 min", engine: `${r1(orbitPeriodMin(l17))} min`, ok: Math.abs(orbitPeriodMin(l17) - 105) < 1 },
      { what: "Hohmann transfer, the Wick → Lantern 17", book: "376 m/s · 49 min", engine: `${r0(h.dv)} m/s · ${r0(h.minutes)} min`, ok: Math.round(h.dv) === 376 },
      { what: "10° plane change", book: "1,282 m/s", engine: `${r0(planeChangeDv(l17, 10))} m/s`, ok: Math.round(planeChangeDv(l17, 10)) === 1282 },
      { what: "Standard Tender Δv", book: "≈1,700 m/s", engine: `${r0(tender.dv)} m/s`, ok: Math.abs(tender.dv - 1700) < 40 },
      { what: "Standard Tender dry mass", book: "≈6,060 kg", engine: `${r0(tender.dryKg)} kg`, ok: Math.abs(tender.dryKg - 6060) < 30 },
      { what: "Fuel for a 40 m/s dodge (10,600 kg Tender)", book: "136 kg", engine: `${r0(fuelForDeltaV(316, 6100, 4500, 40))} kg`, ok: Math.round(fuelForDeltaV(316, 6100, 4500, 40)) === 136 },
      { what: "Test push: 10 kW × 60 s on 482 kg", book: "≈6 cm/s", engine: `${r1(testPushCmS())} cm/s`, ok: Math.abs(testPushCmS() - 6) < 0.5 },
      { what: "Beam time for a 1.5 km miss", book: "≈21 h", engine: `${r1(hoursForShift(1.5))} h`, ok: Math.abs(hoursForShift(1.5) - 21) < 1 },
      { what: "200 MB over the small radio", book: "1 h 44 min", engine: `${r0(transferHours(200, 0.256) * 60)} min`, ok: Math.round(transferHours(200, 0.256) * 60) === 104 },
      { what: "2 GB over the laser terminal", book: "80 s", engine: `${r0(transferHours(2000, 200) * 3600)} s`, ok: Math.round(transferHours(2000, 200) * 3600) === 80 },
    ];
  }, []);
  const passed = rows.filter((r) => r.ok).length;
  return (
    <section className="lab-block" aria-labelledby="checks-title">
      <header className="lab-head">
        <p className="eyebrow">
          01 <b>{"//"}</b> Handbook vs engine
        </p>
        <h2 className="display lab-h2" id="checks-title">
          Every number, <em>re-derived.</em>
        </h2>
        <p className="lab-lede">
          The engine doesn&apos;t copy the handbook&apos;s numbers. It computes them from the real formulas, and this
          table compares the two live in your browser. {passed} of {rows.length} match.
        </p>
      </header>
      <div className="lab-table" role="table" aria-label="Handbook numbers checked against the engine">
        <div className="lab-tr lab-th" role="row">
          <span role="columnheader">What</span>
          <span role="columnheader">Handbook</span>
          <span role="columnheader">Engine</span>
          <span role="columnheader" className="lab-sr">
            Status
          </span>
        </div>
        {rows.map((r) => (
          <div className="lab-tr" role="row" key={r.what}>
            <span role="cell">{r.what}</span>
            <span role="cell" className="lab-mono lab-dim">
              {r.book}
            </span>
            <span role="cell" className="lab-mono">
              {r.engine}
            </span>
            <span role="cell" className={r.ok ? "lab-ok" : "lab-bad"}>
              {r.ok ? "✓ match" : "✗ off"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────── 2. the hangar calculator ─────────────────────────

function Chips<T extends string>({
  label,
  items,
  isOn,
  onPick,
}: {
  label: string;
  items: { id: T; name: string; sub?: string }[];
  isOn: (id: T) => boolean;
  onPick: (id: T) => void;
}) {
  return (
    <fieldset className="lab-chips">
      <legend>{label}</legend>
      <div>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className="lab-chip"
            aria-pressed={isOn(it.id)}
            onClick={() => onPick(it.id)}
          >
            <span>{it.name}</span>
            {it.sub && <small>{it.sub}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Meter({ label, value, max, unit, warn }: { label: string; value: number; max: number; unit: string; warn?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`lab-meter${warn ? " is-warn" : ""}`}>
      <div className="lab-meter-top">
        <span>{label}</span>
        <b className="lab-mono">
          {r0(value)} <small>/ {r0(max)} {unit}</small>
        </b>
      </div>
      <div className="lab-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Hangar() {
  const [s, setS] = useState<GameState>(() => {
    const r = step(createGame(1), { type: "begin" });
    return r.ok ? r.state : createGame(1);
  });
  const [msg, setMsg] = useState<string | null>(null);
  const l = s.loadout;
  const st = loadoutStats(l);
  const fit = routeFit(l);

  function act(a: Action) {
    const r = step(s, a);
    if (r.ok) {
      setS(r.state);
      setMsg(null);
    } else setMsg(r.reason);
  }

  return (
    <section className="lab-block" aria-labelledby="hangar-title">
      <header className="lab-head">
        <p className="eyebrow">
          02 <b>{"//"}</b> The Wick, as numbers
        </p>
        <h2 className="display lab-h2" id="hangar-title">
          Build a ship. <em>Watch it cost.</em>
        </h2>
        <p className="lab-lede">
          Every click goes through the real engine: it checks the rules, updates the ship, and says why when it
          refuses. Chunk 2 puts the blueprint art on top of exactly this.
        </p>
      </header>

      <div className="lab-hangar">
        <div className="lab-pickers">
          <Chips
            label="Hull"
            items={Object.values(HULLS).map((h) => ({ id: h.id, name: h.name, sub: `${h.cost} cr` }))}
            isOn={(id) => l.hull === id}
            onPick={(id) => act({ type: "hull", id })}
          />
          <Chips
            label="Engine"
            items={Object.values(ENGINES).map((e) => ({ id: e.id, name: e.name, sub: e.locked ? "locked" : `Isp ${e.isp} s` }))}
            isOn={(id) => l.engine === id}
            onPick={(id) => act({ type: "engine", id })}
          />
          <Chips
            label="Power"
            items={Object.values(POWER).map((p) => ({ id: p.id, name: p.name, sub: `${p.capacityKwh} kWh` }))}
            isOn={(id) => l.power === id}
            onPick={(id) => act({ type: "power", id })}
          />
          <Chips
            label="Shield"
            items={Object.values(SHIELDS).map((x) => ({ id: x.id, name: x.name, sub: `${x.massKg} kg` }))}
            isOn={(id) => l.shield === id}
            onPick={(id) => act({ type: "shield", id })}
          />
          <Chips
            label={`Sensors · ${l.sensors.length} of ${HULLS[l.hull].sensorSlots} slots`}
            items={Object.values(SENSORS).map((x) => ({ id: x.id, name: x.name, sub: x.bandPct ? `±${x.bandPct}%` : "heat" }))}
            isOn={(id) => l.sensors.includes(id)}
            onPick={(id) => act({ type: "sensor", id })}
          />
          <Chips
            label="Comms"
            items={Object.values(COMMS).map((x) => ({ id: x.id, name: x.name, sub: x.mbps < 1 ? `${x.mbps * 1000} kbps` : `${x.mbps} Mbps` }))}
            isOn={(id) => l.comms === id}
            onPick={(id) => act({ type: "comms", id })}
          />
          <Chips
            label="Service kit"
            items={Object.values(KIT).map((x) => ({ id: x.id, name: x.name, sub: `${x.massKg} kg` }))}
            isOn={(id) => l.kit.includes(id)}
            onPick={(id) => act({ type: "kit", id })}
          />
          <Chips
            label="Power add-ons"
            items={Object.values(ADDONS).map((x) => ({ id: x.id, name: x.name, sub: `${x.cost} cr` }))}
            isOn={(id) => l.addons.includes(id)}
            onPick={(id) => act({ type: "addon", id })}
          />
          <p className="lab-reject" role="status" aria-live="polite">
            {msg ?? " "}
          </p>
        </div>

        <aside className="lab-panel" aria-label="Live ship numbers">
          <div className="lab-dv">
            <span>Δv · speed budget</span>
            <b className="lab-mono">{r0(st.dv)}</b>
            <small>m/s</small>
          </div>
          <dl className="lab-dl">
            <div>
              <dt>Dry mass (with 10% margin)</dt>
              <dd className="lab-mono">{r0(st.dryKg)} kg</dd>
            </div>
            <div>
              <dt>Fuel loaded</dt>
              <dd className="lab-mono">{r0(st.fuelKg)} kg</dd>
            </div>
            <div>
              <dt>Energy stored</dt>
              <dd className="lab-mono">{r0(st.energyKwh)} kWh</dd>
            </div>
            <div>
              <dt>Lasts at {r1(st.loadKw)} kW</dt>
              <dd className="lab-mono">{st.enduranceH === Infinity ? "forever" : `${r0(st.enduranceH)} h`}</dd>
            </div>
          </dl>
          <Meter label="Bay space" value={st.bayUsedKg} max={st.bayLimitKg} unit="kg" warn={st.bayUsedKg > st.bayLimitKg} />
          <Meter label="Budget" value={st.credits} max={100} unit="cr" warn={st.credits > 100} />

          <h3 className="lab-h3">Readiness review</h3>
          {st.flags.length === 0 ? (
            <p className="lab-ok">No red flags.</p>
          ) : (
            <ul className="lab-flags">
              {st.flags.map((f) => (
                <li key={f.id} className={f.level === "block" ? "is-block" : ""}>
                  {f.text}
                </li>
              ))}
            </ul>
          )}

          <h3 className="lab-h3">Which routes fit</h3>
          <ul className="lab-routes">
            {fit.map((r) => (
              <li key={r.id} className={r.fits ? (r.fitsWithMargin ? "is-ok" : "is-tight") : "is-no"}>
                <span>{ROUTES[r.id].name}</span>
                <span className="lab-mono">{r0(r.totalDv)} m/s</span>
                <span className="lab-mono lab-dim">{r1(r.arriveH)} h</span>
                <span className="lab-mono">{r.fits ? (r.fitsWithMargin ? "fits" : "no margin") : `short ${r0(r.shortBy)}`}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}

// ───────────────────────── 3. watch a mission ─────────────────────────

function Mission() {
  const [pick, setPick] = useState(STRATEGIES[0].id);
  const [seed, setSeed] = useState(1);
  const result = useMemo(() => {
    const st = STRATEGIES.find((x) => x.id === pick)!;
    const r = runPolicy(seed, st.policy);
    return { st, run: r };
  }, [pick, seed]);
  const { run } = result;
  const s = run.state;

  return (
    <section className="lab-block" aria-labelledby="mission-title">
      <header className="lab-head">
        <p className="eyebrow">
          03 <b>{"//"}</b> Watch a mission
        </p>
        <h2 className="display lab-h2" id="mission-title">
          Nine crews. <em>Eight endings.</em>
        </h2>
        <p className="lab-lede">
          Each crew is a scripted player that makes every choice through the real engine: the hangar, the route, the
          event cards, the station, the big choice, the broadcast. Change the seed to deal a different event deck.
        </p>
      </header>

      <div className="lab-crews" role="radiogroup" aria-label="Choose a crew">
        {STRATEGIES.map((st) => (
          <button key={st.id} type="button" role="radio" aria-checked={pick === st.id} className="lab-crew" onClick={() => setPick(st.id)}>
            <b>{st.name}</b>
            <span>{st.summary}</span>
            <small className="lab-mono">aims for: {ENDINGS[st.aims].name}</small>
          </button>
        ))}
      </div>

      <div className="lab-seed">
        <label htmlFor="seed" className="lab-mono">
          Seed
        </label>
        <input id="seed" type="number" min={1} value={seed} onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))} />
        <button type="button" className="lab-chip" onClick={() => setSeed((x) => x + 1)}>
          Deal again
        </button>
        <span className="lab-dim lab-mono">
          deck: {s.deck.join(" · ") || "—"} · {run.actions.length} actions
        </span>
      </div>

      <Result s={s} />
    </section>
  );
}

export default function Lab() {
  return (
    <main className="lab" id="main">
      <div className="wrap">
        <nav className="lab-nav">
          <Link href="/" className="lab-mono">
            ← Project Eclipse
          </Link>
          <span className="lab-mono lab-dim">Chunk 0 · game engine</span>
        </nav>
        <header className="lab-hero">
          <p className="eyebrow">
            Mission Lab <b>{"//"}</b> built for the team
          </p>
          <h1 className="display">
            The brain of the game, <em>running live.</em>
          </h1>
          <p className="lab-lede">
            Before any screen gets its art, the rules have to be right. This page runs the same engine the game will
            use: the rocket equation, the routes, the event deck, Lantern 17&apos;s six zones, the clues, the two
            clocks, the push on the ice, the network, and every ending. Nothing here is a mock-up.
          </p>
        </header>
        <Checks />
        <Hangar />
        <Mission />
        <footer className="lab-foot lab-dim">
          <p>
            Values tagged in the code as <span className="lab-mono">game</span> are our own balance choices, not NASA
            data. Project Eclipse uses a fictional planetary system and future technology. Its mission choices are
            inspired by real orbital mechanics, spacecraft engineering, energy limits and proposed remote-deflection
            physics. Values are simplified for learning.
          </p>
        </footer>
      </div>
    </main>
  );
}
