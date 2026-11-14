"use client";

import "./station.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BELIEF,
  CLOCKS,
  CLUES,
  CLUE_IDS,
  EVA_AIR_H,
  HAZARDS,
  HYPOTHESES,
  METHOD_HOURS,
  PACKETS,
  REPAIR_HOURS,
  SENSORS,
  ZONES,
  ZONE_ORDER,
  deliveredLightPct,
  evidence,
  fmtHours,
  hasSensor,
  iceClock,
  isEclipse,
  jobHours,
  mirrorOutputPct,
  options,
  packetHours,
  reactorClock,
  testUnlocked,
} from "@/lib/game";
import type { Action, ClueId, GameState, HazardId, HypId, Method, PacketId, ZoneId } from "@/lib/game";
import type { Sound } from "./audio";
import { HUB, ZONE_POS } from "./stationMap";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

const METHODS: { id: Method; name: string; sub: string }[] = [
  { id: "download", name: "Telemetry download", sub: "Read the station's own logs" },
  { id: "scan", name: "Scan from the ship", sub: "Camera and thermal camera" },
  { id: "drone", name: "Send a drone", sub: "Free-flying, surface only" },
  { id: "arm", name: "Robotic arm", sub: "Slow and precise" },
  { id: "eva", name: "Spacewalk (EVA)", sub: "Hands on, limited air" },
];

/** What the player did just now, and what it found. Shared by the station and the decision screens. */
export function Latest({ game, from }: { game: GameState; from: number | null }) {
  const entries = from === null ? [] : game.log.slice(from).filter((e) => e.title !== "Docked at Lantern 17");
  if (!entries.length) return null;
  return (
    <section className="st-latest" aria-live="polite" aria-label="What just happened">
      <p className="eyebrow">
        Just now <b>{"//"}</b> Hour {r1(game.t)}
      </p>
      {entries.map((e) => (
        <p key={e.n} className={e.kind}>
          <b>{e.title}.</b> {e.text}
        </p>
      ))}
    </section>
  );
}

/** Send one packet to the network. Used at the station, at the big choice and at the end. */
export function Transmit({
  game,
  run,
  must,
}: {
  game: GameState;
  run: (a: Action) => void;
  must?: boolean;
}) {
  const opts = useMemo(() => options(game), [game]);
  const b = game.broadcast;
  const eclipse = isEclipse(game.t);
  return (
    <section className={`st-card st-tx${must ? " must" : ""}`} aria-labelledby="st-tx-t">
      <header>
        <p className="eyebrow">
          The network <b>{"//"}</b> One report per crew
        </p>
        <h2 id="st-tx-t">Send what you found</h2>
        <p className="st-lede">
          The network will only act if it believes you: enough evidence, a measured test, and a packet that arrives before the ice does. A bigger packet takes longer to send, and everything slows to a quarter in the Eclipse.
          {must && <strong> You chose to let the network decide, so send everything you can.</strong>}
        </p>
      </header>
      {b ? (
        <div className="st-sent">
          <p>
            <b>{PACKETS[b.packet].name} packet sent.</b> It left at hour {r1(b.t)} and arrives at hour {r1(b.arriveT)}
            {b.arriveT > CLOCKS.iceTrueH ? ", after the ice has hit." : "."} The network weighs it when it lands, and you will see its answer at the end.
          </p>
        </div>
      ) : (
        <div className="st-packets">
          {(Object.keys(PACKETS) as PacketId[]).map((id) => {
            const o = opts.find((x) => x.action.type === "broadcast" && x.action.packet === id);
            const ph = packetHours(game, id);
            const late = game.t + ph.hours > CLOCKS.iceTrueH;
            return (
              <div key={id} className="st-packet">
                <b>{PACKETS[id].name}</b>
                <small>{r0(PACKETS[id].mb)} MB</small>
                <p>{PACKETS[id].contains}</p>
                <span className={late ? "late" : ""}>
                  {fmtHours(ph.hours)} to send{ph.eclipse ? " (Eclipse: ×4 slower)" : ""}
                  {late ? ", arrives too late" : ""}
                </span>
                <button type="button" className="btn btn-ghost" aria-disabled={!o?.ok || undefined} onClick={() => run({ type: "broadcast", packet: id })}>
                  Send {PACKETS[id].name.toLowerCase()}
                </button>
                {o && !o.ok && <em>{o.reason}</em>}
              </div>
            );
          })}
        </div>
      )}
      {!b && eclipse && <p className="st-note">The Eclipse is on now, so a packet takes four times as long.</p>}
    </section>
  );
}

export default function Station({ game, act, sound }: { game: GameState; act: (a: Action) => string | null; sound: Sound }) {
  const [sel, setSel] = useState<ZoneId>("dock");
  const [from, setFrom] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const opts = useMemo(() => options(game), [game]);

  const run = (a: Action) => {
    const before = game.log.length;
    const reason = act(a);
    if (reason) {
      sound.reject();
      setFlash(reason);
      return;
    }
    setFlash(null);
    setFrom(before);
    if (a.type === "broadcast") sound.radio();
    else sound.lock();
  };

  // a find rings; a hazard sounds the alarm
  const seen = useRef(game.found.length);
  const hadHazard = useRef(game.found.some((f) => f === "leak" || f === "drift"));
  useEffect(() => {
    const n = game.found.length;
    const haz = game.found.some((f) => f === "leak" || f === "drift");
    if (n > seen.current) {
      if (haz && !hadHazard.current) sound.alarm();
      else sound.ping();
    }
    seen.current = n;
    hadHazard.current = haz;
  }, [game.found, sound]);

  const lidar = hasSensor(game, "lidar");
  const known = (z: ZoneId) => z === "dock" || game.zonesKnown.includes(z);
  const zone = ZONES[sel];
  const isKnown = known(sel);
  // a pin is a find made at that zone (a leak spotted in the reactor's log belongs to the radiators)
  const finds = (z: ZoneId) => ZONES[z].finds.filter((f) => game.found.includes(f.what) && (f.what !== "leak" || z === "radiators") && game.done.some((d) => d.startsWith(`${z}:`)));
  const hazardOpen = (z: ZoneId) => (z === "radiators" && game.found.includes("leak") && !game.leakPatched) || (z === "spine" && game.found.includes("drift") && !game.driftFixed);
  const hazardDone = (z: ZoneId) => (z === "radiators" && game.leakPatched) || (z === "spine" && game.driftFixed);
  const worked = (z: ZoneId) => game.done.some((d) => d.startsWith(`${z}:`));

  const ev = evidence(game);
  const reactor = reactorClock(game);
  const light = deliveredLightPct(game);
  const unlocked = testUnlocked(game);
  const pinned = (["C1", "C2", "C3", "C4"] as ClueId[]).filter((c) => game.found.includes(c)).length;

  const optFor = (pred: (a: Action) => boolean) => opts.find((o) => pred(o.action));
  const surveyOpt = optFor((a) => a.type === "survey");
  const testOpt = optFor((a) => a.type === "test");

  const repairs = (["leak", "drift"] as HazardId[]).filter((h) => HAZARDS[h].zone === sel && game.found.includes(h));

  const kit = game.loadout.kit;
  const resources: { label: string; value: string; low?: boolean }[] = [];
  if (kit.includes("eva")) resources.push({ label: "Suit air", value: `${r1(game.evaHours)} of ${EVA_AIR_H} h`, low: game.evaHours < 2 });
  if (kit.includes("drones")) resources.push({ label: "Drones", value: `${game.drones} left, ${r1(game.droneHours)} h battery`, low: game.drones === 0 });
  if (game.loadout.mobility === "jetpack") resources.push({ label: "Jetpack", value: `${r1(game.jetpackDv)} m/s`, low: game.jetpackDv < 1 });
  if (kit.includes("optics")) resources.push({ label: "Spare mirror segments", value: String(game.spareSegments) });
  resources.push({ label: "Radiation dose", value: `${r1(game.doseMsv)} mSv` });

  const toChoice = () => {
    const before = game.log.length;
    const reason = act({ type: "toChoice" });
    if (reason) {
      sound.reject();
      setFlash(reason);
    } else {
      sound.thump(0.6);
      setFrom(before);
    }
  };

  const statusLine = !game.surveyed
    ? "You are docked. Fly the survey first, so you know where to look."
    : game.found.length
      ? `You have found ${game.found.filter((f) => f in CLUES).length} of 6 clues.`
      : "Nothing found yet. Send something out to look.";

  return (
    <div className="st">
      <header className="st-head">
        <p className="eyebrow">
          Lantern 17 <b>{"//"}</b> Docked, hour {r1(game.t)}
        </p>
        <h1 className="display">
          Find out what <em>really</em> happened.
        </h1>
        <p className="st-lede">
          Lantern 17 is at {mirrorOutputPct(game)}% light and falling. Something is wrong with it, and the obvious answer may not be the true one. Look at each zone, pin the clues, rule out the wrong explanations, and test the right one. Every job costs hours, and the ice clock does not stop.
        </p>
      </header>

      <ul className="st-clocks" aria-label="Clocks and light">
        <li className="ice">
          <small>Ice clock</small>
          <b>T−{r1(Math.max(0, iceClock(game)))} h</b>
          <span>{game.iceRevealed ? `impact at hour ${CLOCKS.iceTrueH}` : `briefed: hour ${CLOCKS.iceBriefedH}`}</span>
        </li>
        <li className={reactor !== null ? "alarm" : ""}>
          <small>Reactor clock</small>
          <b>{reactor !== null ? `T−${r1(Math.max(0, reactor))} h` : game.leakPatched ? "stopped" : "unknown"}</b>
          <span>{reactor !== null ? "a leak will shut it down" : game.leakPatched ? "leak patched" : "nothing found yet"}</span>
        </li>
        <li>
          <small>Light delivered</small>
          <b>{light}%</b>
          <span>to the four settlements</span>
        </li>
        <li className={isEclipse(game.t) ? "eclipse" : ""}>
          <small>Sky</small>
          <b>{isEclipse(game.t) ? "Eclipse" : "Daylight"}</b>
          <span>{isEclipse(game.t) ? "comms slow, mirrors cool" : "comms fast, mirrors blinding"}</span>
        </li>
      </ul>

      <div className="st-grid">
        <section className="st-card st-mapcard" aria-labelledby="st-map-t">
          <header>
            <p className="eyebrow">
              The station <b>{"//"}</b> Six zones
            </p>
            <h2 id="st-map-t">Where to look</h2>
          </header>
          <div className="st-map">
            <svg viewBox="0 0 620 404" role="group" aria-label="Map of Lantern 17">
              <defs>
                <radialGradient id="st-hub" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="rgba(255,181,71,0.35)" />
                  <stop offset="1" stopColor="rgba(255,181,71,0)" />
                </radialGradient>
              </defs>
              <circle cx={HUB.x} cy={HUB.y} r="150" className="st-ring" />
              <circle cx={HUB.x} cy={HUB.y} r="228" className="st-ring far" />
              {ZONE_ORDER.filter((z) => z !== "dock").map((z) => (
                <line key={z} x1={HUB.x} y1={HUB.y} x2={ZONE_POS[z].x} y2={ZONE_POS[z].y} className={`st-link${ZONES[z].far ? " far" : ""}${known(z) ? " known" : ""}`} />
              ))}
              <circle cx={HUB.x} cy={HUB.y} r="70" fill="url(#st-hub)" />
              {ZONE_ORDER.map((z) => {
                const p = ZONE_POS[z];
                const open = hazardOpen(z);
                const fixed = hazardDone(z);
                const hint = lidar && game.surveyed && ZONES[z].damaged && !fixed;
                const pins = finds(z).length;
                const cls = [
                  "st-node",
                  z === "dock" ? "hub" : "",
                  known(z) ? "known" : "unknown",
                  hint || open ? "dmg" : "",
                  fixed ? "fixed" : "",
                  worked(z) ? "worked" : "",
                  sel === z ? "on" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <g
                    key={z}
                    transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
                    className={cls}
                    role="button"
                    tabIndex={0}
                    aria-pressed={sel === z}
                    aria-label={`${known(z) ? ZONES[z].name : "Unmapped zone"}${open ? ", a hazard is open here" : ""}${pins ? `, ${pins} find${pins > 1 ? "s" : ""}` : ""}`}
                    onClick={() => {
                      sound.click();
                      setSel(z);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        sound.click();
                        setSel(z);
                      }
                    }}
                  >
                    <circle r={z === "dock" ? 30 : 24} className="st-pulse" />
                    <circle r={z === "dock" ? 20 : 15} className="st-dot" />
                    {!known(z) && (
                      <text y="5" textAnchor="middle" className="st-q">
                        ?
                      </text>
                    )}
                    {Array.from({ length: pins }, (_, k) => (
                      <circle key={k} cx={-8 * (pins - 1) + k * 16} cy={-(z === "dock" ? 37 : 31)} r="4.6" className="st-pin" />
                    ))}
                    <text y={z === "dock" ? 49 : 43} textAnchor="middle" className="st-name">
                      {known(z) ? ZONES[z].name : "Unmapped"}
                    </text>
                  </g>
                );
              })}
            </svg>
            {!game.surveyed && (
              <div className="st-survey">
                <p>The map is blank. A fly-around survey takes {fmtHours(0.5)} and 2 kWh.</p>
                <button type="button" className="btn btn-lantern" aria-disabled={!surveyOpt?.ok || undefined} onClick={() => run({ type: "survey" })}>
                  Fly the survey <span aria-hidden="true">↗</span>
                </button>
                {surveyOpt && !surveyOpt.ok && <em>{surveyOpt.reason}</em>}
              </div>
            )}
          </div>
          <p className="st-legend">
            <i className="a" /> damaged{lidar ? " (your lidar shows these)" : ""} <i className="p" /> a find <i className="w" /> inspected <i className="f" /> fixed
          </p>
          <ul className="st-res" aria-label="Crew and kit">
            {resources.map((r) => (
              <li key={r.label} className={r.low ? "low" : ""}>
                <small>{r.label}</small>
                <b>{r.value}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="st-card st-zone" aria-labelledby="st-zone-t" aria-live="polite">
          <header>
            <p className="eyebrow">
              {isKnown ? (zone.damaged ? "Damaged" : "Sound") : "Not on your map"} <b>{"·"}</b> {zone.far ? "far from the dock" : "near the dock"}
            </p>
            <h2 id="st-zone-t">{isKnown ? zone.name : "Unmapped zone"}</h2>
          </header>
          {isKnown ? (
            <>
              <p className="st-lede">{zone.what}</p>
              <div className="st-facts">
                <div>
                  <small>Hazard</small>
                  <p>{zone.hazard}</p>
                </div>
                <div>
                  <small>Real-world anchor</small>
                  <p>{zone.real}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="st-lede">
              {game.surveyed
                ? "Without lidar your survey could not map this far out. You can still send something to look, and it will show up on the map when you do."
                : "Fly the survey first."}
            </p>
          )}

          <h3 className="st-h3">How will you look?</h3>
          <div className="st-methods" role="group" aria-label="Inspection methods">
            {METHODS.map((m) => {
              const o = optFor((a) => a.type === "inspect" && a.zone === sel && a.method === m.id);
              const done = game.done.includes(`${sel}:${m.id}`);
              const job = jobHours(game, sel, m.id, METHOD_HOURS[m.id]);
              const locked = !o?.ok && !done;
              return (
                <div key={m.id} className="st-method">
                  <button type="button" className={`st-opt${done ? " done" : ""}${locked ? " locked" : ""}`} aria-disabled={done || locked || undefined} onClick={() => !done && run({ type: "inspect", zone: sel, method: m.id })}>
                    <span className="st-opt-top">
                      <b>{m.name}</b>
                      <i>{done ? "✓ done" : fmtHours(job.hours)}</i>
                    </span>
                    <span className="st-opt-sub">{m.sub}</span>
                    {job.why.length > 0 && !done && <span className="st-opt-why">{job.why.join(", ")}</span>}
                  </button>
                  {locked && o && <p className="st-locked">{o.reason}</p>}
                </div>
              );
            })}
          </div>

          {repairs.map((h) => {
            const fixed = h === "leak" ? game.leakPatched : game.driftFixed;
            const methods = (h === "leak" ? ["eva", "arm"] : ["eva"]) as ("eva" | "arm")[];
            return (
              <div key={h} className={`st-repair${fixed ? " fixed" : ""}`}>
                <p className="eyebrow">
                  {fixed ? "Fixed" : "Open hazard"} <b>{"//"}</b> {HAZARDS[h].name}
                </p>
                <p>{HAZARDS[h].text}</p>
                <p className="st-real">{HAZARDS[h].real}</p>
                {!fixed && (
                  <div className="st-repair-go">
                    {methods.map((m) => {
                      const o = optFor((a) => a.type === "repair" && a.repair === h && a.method === m);
                      const job = jobHours(game, HAZARDS[h].zone, m, REPAIR_HOURS[h]);
                      return (
                        <div key={m}>
                          <button type="button" className="btn btn-lantern" aria-disabled={!o?.ok || undefined} onClick={() => run({ type: "repair", repair: h, method: m })}>
                            {h === "leak" ? "Patch it" : "Fix it"} by {m === "eva" ? "spacewalk" : "arm"} · {fmtHours(job.hours)}
                          </button>
                          {o && !o.ok && <p className="st-locked">{o.reason}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {flash && (
        <p className="st-flash" role="alert">
          {flash}
        </p>
      )}
      <Latest game={game} from={from} />

      <section className="st-card st-board" aria-labelledby="st-board-t">
        <header className="st-board-head">
          <div>
            <p className="eyebrow">
              Evidence board <b>{"//"}</b> {statusLine}
            </p>
            <h2 id="st-board-t">What the clues say</h2>
          </div>
          <div className="st-evmeter" role="img" aria-label={`Evidence ${ev} out of 100. The network needs ${BELIEF.minEvidence}.`}>
            <div>
              <b>{ev}</b>
              <small>/ 100 evidence</small>
            </div>
            <div className="st-track">
              <u style={{ width: `${ev}%` }} />
              <i style={{ left: `${BELIEF.minEvidence}%` }}>
                <em>believed at {BELIEF.minEvidence}</em>
              </i>
            </div>
          </div>
        </header>

        <ul className="st-clues">
          {CLUE_IDS.map((c) => {
            const got = game.found.includes(c);
            const def = CLUES[c];
            return (
              <li key={c} className={got ? "got" : ""}>
                <span className="st-clue-id">
                  {c}
                  <i>{def.points} pts</i>
                </span>
                {got ? (
                  <>
                    <b>{def.name}</b>
                    <p>{def.shows}</p>
                    <small>
                      {c === "C6" && game.test ? `Measured ${r1(game.test.measuredCmS)} cm/s, ±${game.test.bandPct}%` : def.where}
                    </small>
                  </>
                ) : (
                  <>
                    <b>Not found yet</b>
                    <p>
                      {def.where}. Found with: {def.foundWith.toLowerCase()}.
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <h3 className="st-h3">Three explanations</h3>
        <div className="st-hyps">
          {(Object.keys(HYPOTHESES) as HypId[]).map((h) => {
            const def = HYPOTHESES[h];
            const out = game.crossed.includes(h);
            const o = optFor((a) => a.type === "crossOut" && a.hyp === h);
            return (
              <article key={h} className={`st-hyp${out ? " out" : ""}${h === "H3" ? " truth" : ""}`}>
                <b>
                  <i>{h}</i> {def.name}
                </b>
                <p>{def.text}</p>
                {h === "H3" ? (
                  <span className="st-supported">
                    {game.found.includes("C1") && game.found.includes("C2") ? (game.test ? "Proven by your test" : "Supported by C1 + C2") : "Not enough clues to say yet"}
                  </span>
                ) : out ? (
                  <span className="st-ruled">✓ Ruled out</span>
                ) : (
                  <>
                    <button type="button" className="btn btn-ghost" aria-disabled={!o?.ok || undefined} onClick={() => run({ type: "crossOut", hyp: h })}>
                      Rule it out
                    </button>
                    {o && !o.ok && <p className="st-locked">{o.reason}</p>}
                  </>
                )}
              </article>
            );
          })}
        </div>

        <div className={`st-test${game.test ? " done" : unlocked ? " ready" : ""}`}>
          <div>
            <p className="eyebrow">
              The controlled test <b>{"//"}</b> {game.test ? "Done" : unlocked ? "Unlocked" : "Locked"}
            </p>
            <h3>Aim the cracked mirror at a block of ice</h3>
            <p>
              Fire 10 kW for 60 seconds at a 1 m block and measure how far it moves. It takes 2 hours, and Lantern 17 goes dark for one of them. How sure you can be depends on your best sensor.
            </p>
            {!unlocked && !game.test && (
              <p className="st-need">
                To unlock it: pin 2 of the clues C1 to C4 ({pinned} of 2 so far) and rule out H1 or H2.
              </p>
            )}
            {game.test && (
              <p className="st-result">
                Measured <b>{r1(game.test.measuredCmS)} cm/s</b> with the {SENSORS[game.test.sensor].name.toLowerCase()} (±{game.test.bandPct}%:{" "}
                {game.test.bandPct <= 3 ? "proven" : game.test.bandPct <= 15 ? "likely" : "maybe"}).
              </p>
            )}
          </div>
          {!game.test && (
            <div className="st-test-go">
              <button type="button" className="btn btn-lantern" aria-disabled={!testOpt?.ok || undefined} onClick={() => run({ type: "test" })}>
                Fire the test beam <span aria-hidden="true">↯</span>
              </button>
              {testOpt && !testOpt.ok && <p className="st-locked">{testOpt.reason}</p>}
            </div>
          )}
        </div>
      </section>

      <Transmit game={game} run={run} />

      <section className="st-card st-next" aria-labelledby="st-next-t">
        <div>
          <p className="eyebrow">
            When you are ready <b>{"//"}</b> You cannot come back
          </p>
          <h2 id="st-next-t">Make the big choice</h2>
          <p>
            Fix the mirror, use it as a weapon, find a clever middle, let the network decide, or walk away. Once you choose, the station work is over.
          </p>
          <ul className="st-summary">
            <li className={ev >= BELIEF.minEvidence ? "ok" : "warn"}>
              Evidence {ev} / 100 {ev >= BELIEF.minEvidence ? "(enough to be believed)" : `(the network needs ${BELIEF.minEvidence})`}
            </li>
            <li className={game.test ? "ok" : "warn"}>{game.test ? "Test measured" : "No test result yet"}</li>
            <li className={game.broadcast ? "ok" : ""}>{game.broadcast ? "Packet sent" : "No packet sent yet (you can still send one after the choice)"}</li>
          </ul>
        </div>
        <button type="button" className="btn btn-lantern" onClick={toChoice}>
          Go to the big choice <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}
