"use client";

import { useState } from "react";
import {
  CLOCKS,
  CLUES,
  CLUE_IDS,
  HAZARDS,
  HYPOTHESES,
  METHOD_HOURS,
  PACKETS,
  REPAIR_HOURS,
  SENSORS,
  ZONES,
  ZONE_ORDER,
  fmtHours,
  hasSensor,
  isEclipse,
  jobHours,
  packetHours,
  reactorClock,
  testUnlocked,
} from "@/lib/game";
import type { Action, HazardId, HypId, Method, PacketId, ZoneId } from "@/lib/game";
import { HUB, ZONE_POS } from "../mission/stationMap";
import { Latest, beliefChecks, clueCount, r1, sceneClues, type QuestCtx } from "./shared";

const opt = (c: QuestCtx, pred: (a: Action) => boolean) => c.opts.find((o) => pred(o.action));

/* ------------------------------------------------------------------ */
/* Step 1: look around                                                  */
/* ------------------------------------------------------------------ */
export function Look({ c }: { c: QuestCtx }) {
  const g = c.game;
  const o = opt(c, (a) => a.type === "survey");
  const lidar = hasSensor(g, "lidar");
  return (
    <div className="sq-panel">
      <h2>Look around</h2>
      <p className="sq-lede">
        A survey is a quick lap around the station. It tells you where everything is, so you know where to look. It takes 30 minutes and a little battery.
      </p>
      {g.surveyed ? (
        <div className="sq-done">
          <b>Survey done.</b> You can see {g.zonesKnown.length} of 6 zones on the map.
          {!lidar && g.zonesKnown.length < 6 && <span> Your ship has no lidar, so the far zones are still blank. You can still go and look at them.</span>}
          {lidar && <span> Your lidar also shows which zones are damaged, in orange.</span>}
        </div>
      ) : (
        <div className="sq-actions">
          <button type="button" className="sq-btn big" aria-disabled={!o?.ok || undefined} onClick={() => c.run({ type: "survey" })}>
            Fly the survey <span aria-hidden="true">↗</span>
          </button>
          {o && !o.ok && <p className="sq-why">{o.reason}</p>}
        </div>
      )}
      <Latest game={g} from={c.from} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: investigate                                                  */
/* ------------------------------------------------------------------ */
const METHODS: { id: Method; name: string; sub: string }[] = [
  { id: "download", name: "Read its logs", sub: "Copy what the station recorded. Fast, and glare can't fool it." },
  { id: "scan", name: "Scan from the ship", sub: "Use your cameras from a safe distance." },
  { id: "drone", name: "Send a drone", sub: "A little flying camera. Quick, but bright light can blind it." },
  { id: "arm", name: "Use the robot arm", sub: "Slow and careful. Only if you packed the arm." },
  { id: "eva", name: "Go outside", sub: "A spacewalk. Hands-on, but it uses suit air and time." },
];

export function Investigate({ c }: { c: QuestCtx }) {
  const g = c.game;
  const [sel, setSel] = useState<ZoneId>("dock");
  const known = (z: ZoneId) => z === "dock" || g.zonesKnown.includes(z);
  const lidar = hasSensor(g, "lidar");
  const worked = (z: ZoneId) => g.done.some((d) => d.startsWith(`${z}:`));
  const pins = (z: ZoneId) => ZONES[z].finds.filter((f) => g.found.includes(f.what) && (f.what !== "leak" || z === "radiators") && worked(z)).length;
  const open = (z: ZoneId) => (z === "radiators" && g.found.includes("leak") && !g.leakPatched) || (z === "spine" && g.found.includes("drift") && !g.driftFixed);
  const fixed = (z: ZoneId) => (z === "radiators" && g.leakPatched) || (z === "spine" && g.driftFixed);
  const zone = ZONES[sel];
  const isKnown = known(sel);

  return (
    <div className="sq-panel">
      <h2>Investigate</h2>
      <p className="sq-lede">
        Tap a zone on the map, then choose how to look at it. Clues are hiding in some zones, and each way of looking finds different things. You have found <b>{clueCount(g)} of 6</b> clues.
      </p>
      {!g.surveyed && <p className="sq-warn">Fly the survey first (step 1), so the map fills in.</p>}

      <div className="sq-split">
        <div className="sq-map">
          <svg viewBox="0 0 620 404" role="group" aria-label="Map of Lantern 17">
            <defs>
              <radialGradient id="sq-hub" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="rgba(255,181,71,0.35)" />
                <stop offset="1" stopColor="rgba(255,181,71,0)" />
              </radialGradient>
            </defs>
            <circle cx={HUB.x} cy={HUB.y} r="150" className="sq-ring" />
            <circle cx={HUB.x} cy={HUB.y} r="228" className="sq-ring far" />
            {ZONE_ORDER.filter((z) => z !== "dock").map((z) => (
              <line key={z} x1={HUB.x} y1={HUB.y} x2={ZONE_POS[z].x} y2={ZONE_POS[z].y} className={`sq-link${known(z) ? " known" : ""}`} />
            ))}
            <circle cx={HUB.x} cy={HUB.y} r="70" fill="url(#sq-hub)" />
            {ZONE_ORDER.map((z) => {
              const p = ZONE_POS[z];
              const hint = lidar && g.surveyed && ZONES[z].damaged && !fixed(z);
              const n = pins(z);
              const cls = ["sq-node", z === "dock" ? "hub" : "", known(z) ? "known" : "unknown", hint || open(z) ? "dmg" : "", fixed(z) ? "fixed" : "", worked(z) ? "worked" : "", sel === z ? "on" : ""].filter(Boolean).join(" ");
              return (
                <g
                  key={z}
                  transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-pressed={sel === z}
                  aria-label={`${known(z) ? ZONES[z].name : "Unknown zone"}${open(z) ? ", something is broken here" : ""}${n ? `, ${n} clue${n > 1 ? "s" : ""} found` : ""}`}
                  onClick={() => setSel(z)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSel(z);
                    }
                  }}
                >
                  <circle r={z === "dock" ? 30 : 24} className="sq-pulse" />
                  <circle r={z === "dock" ? 20 : 15} className="sq-dot" />
                  {!known(z) && (
                    <text y="5" textAnchor="middle" className="sq-q">
                      ?
                    </text>
                  )}
                  {Array.from({ length: n }, (_, k) => (
                    <circle key={k} cx={-8 * (n - 1) + k * 16} cy={-(z === "dock" ? 37 : 31)} r="4.6" className="sq-pin" />
                  ))}
                  <text y={z === "dock" ? 49 : 43} textAnchor="middle" className="sq-name">
                    {known(z) ? ZONES[z].name : "Unknown"}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="sq-legend">
            <i className="a" /> damaged <i className="p" /> a clue found <i className="w" /> searched <i className="f" /> fixed
          </p>
        </div>

        <div className="sq-zone">
          <p className="sq-eyebrow">{isKnown ? (zone.far ? "Far from your ship" : "Near your ship") : "Not on your map yet"}</p>
          <h3>{isKnown ? zone.name : "Unknown zone"}</h3>
          {isKnown ? (
            <>
              <p>{zone.what}</p>
              <p className="sq-small">
                <b>Watch out:</b> {zone.hazard}
              </p>
            </>
          ) : (
            <p>Your survey could not see this far. You can still go and look, and it will appear on the map.</p>
          )}
          <div className="sq-methods" role="group" aria-label="Ways to look">
            {METHODS.map((m) => {
              const o = opt(c, (a) => a.type === "inspect" && a.zone === sel && a.method === m.id);
              const done = g.done.includes(`${sel}:${m.id}`);
              const job = jobHours(g, sel, m.id, METHOD_HOURS[m.id]);
              const locked = !o?.ok && !done;
              return (
                <div key={m.id}>
                  <button type="button" className={`sq-method${done ? " done" : ""}${locked ? " locked" : ""}`} aria-disabled={done || locked || undefined} onClick={() => !done && c.run({ type: "inspect", zone: sel, method: m.id })}>
                    <span>
                      <b>{m.name}</b>
                      <small>{m.sub}</small>
                    </span>
                    <i>{done ? "done ✓" : fmtHours(job.hours)}</i>
                  </button>
                  {job.why.length > 0 && !done && !locked && <p className="sq-small warn">Takes longer because {job.why.join(" and ")}.</p>}
                  {locked && o && <p className="sq-why">{o.reason}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {c.flash && <p className="sq-flash" role="alert">{c.flash}</p>}
      <Latest game={g} from={c.from} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: fix problems                                                 */
/* ------------------------------------------------------------------ */
const HAZARD_PLAIN: Record<HazardId, { title: string; text: string }> = {
  leak: { title: "A leaking coolant pipe", text: "Ammonia is leaking from a pipe that cools the reactor. If it is not patched before hour 20, the reactor shuts itself down and the station loses power." },
  drift: { title: "A broken spinning wheel", text: "A gyro wheel has failed, so the station is slowly turning and its light slides off the cities. Fixing it gives the cities 15 points more light." },
};

export function Fix({ c }: { c: QuestCtx }) {
  const g = c.game;
  const found = (["leak", "drift"] as HazardId[]).filter((h) => g.found.includes(h));
  const reactor = reactorClock(g);
  return (
    <div className="sq-panel">
      <h2>Fix problems</h2>
      <p className="sq-lede">Some zones hide broken things. You only see a problem once you have found it in step 2.</p>
      {reactor !== null && <p className="sq-alarm">Reactor shuts down in {r1(Math.max(0, reactor))} hours unless the leak is patched.</p>}
      {found.length === 0 && <p className="sq-empty">Nothing broken found yet. Keep investigating. Try the Radiator fins and the Spine truss.</p>}
      <div className="sq-cards">
        {found.map((h) => {
          const done = h === "leak" ? g.leakPatched : g.driftFixed;
          const methods = (h === "leak" ? ["eva", "arm"] : ["eva"]) as ("eva" | "arm")[];
          return (
            <article key={h} className={`sq-card${done ? " done" : " bad"}`}>
              <p className="sq-eyebrow">{done ? "Fixed" : "Needs fixing"}</p>
              <h3>{HAZARD_PLAIN[h].title}</h3>
              <p>{HAZARD_PLAIN[h].text}</p>
              <p className="sq-small">{HAZARDS[h].real}</p>
              {!done && (
                <div className="sq-actions">
                  {methods.map((m) => {
                    const o = opt(c, (a) => a.type === "repair" && a.repair === h && a.method === m);
                    const job = jobHours(g, HAZARDS[h].zone, m, REPAIR_HOURS[h]);
                    return (
                      <div key={m}>
                        <button type="button" className="sq-btn" aria-disabled={!o?.ok || undefined} onClick={() => c.run({ type: "repair", repair: h, method: m })}>
                          {m === "eva" ? "Fix it on a spacewalk" : "Fix it with the arm"} · {fmtHours(job.hours)}
                        </button>
                        {o && !o.ok && <p className="sq-why">{o.reason}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {c.flash && <p className="sq-flash" role="alert">{c.flash}</p>}
      <Latest game={g} from={c.from} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: prove it                                                     */
/* ------------------------------------------------------------------ */
const IDEA_PLAIN: Record<HypId, string> = {
  H1: "The sensors are just wrong.",
  H2: "Something else hit the ice and changed its path.",
  H3: "Lantern 17's cracked mirror focused light and pushed the ice.",
};

export function Prove({ c }: { c: QuestCtx }) {
  const g = c.game;
  const unlocked = testUnlocked(g);
  const testOpt = opt(c, (a) => a.type === "test");
  return (
    <div className="sq-panel">
      <h2>Prove it</h2>
      <p className="sq-lede">A guess is not proof. Pin clues from step 2, cross off the wrong ideas, then run a test to measure the truth.</p>

      <h3 className="sq-h3">Clues ({clueCount(g)} of 6)</h3>
      <ul className="sq-clues">
        {CLUE_IDS.map((id) => {
          const got = g.found.includes(id);
          return (
            <li key={id} className={got ? "got" : ""}>
              <span>
                {id} <i>{CLUES[id].points} pts</i>
              </span>
              {got ? (
                <>
                  <b>{CLUES[id].name}</b>
                  <p>{CLUES[id].shows}</p>
                </>
              ) : (
                <>
                  <b>Not found yet</b>
                  <p>
                    Look at {CLUES[id].where.toLowerCase()}. Found with: {CLUES[id].foundWith.toLowerCase()}.
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="sq-h3">Which story is true?</h3>
      <div className="sq-cards three">
        {(["H1", "H2", "H3"] as HypId[]).map((h) => {
          const out = g.crossed.includes(h);
          const o = opt(c, (a) => a.type === "crossOut" && a.hyp === h);
          return (
            <article key={h} className={`sq-card idea${out ? " out" : ""}`}>
              <b>{HYPOTHESES[h].name}</b>
              <p>{IDEA_PLAIN[h]}</p>
              {h === "H3" ? (
                <span className="sq-tag">{g.found.includes("C1") && g.found.includes("C2") ? (g.test ? "Your test proved this" : "Your clues point here") : "Not enough clues yet"}</span>
              ) : out ? (
                <span className="sq-tag ok">✓ Crossed off</span>
              ) : (
                <>
                  <button type="button" className="sq-btn ghost" aria-disabled={!o?.ok || undefined} onClick={() => c.run({ type: "crossOut", hyp: h })}>
                    Cross it off
                  </button>
                  {o && !o.ok && <p className="sq-why">{o.reason}</p>}
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className={`sq-test${g.test ? " done" : unlocked ? " ready" : ""}`}>
        <div>
          <p className="sq-eyebrow">The test · {g.test ? "done" : unlocked ? "unlocked" : "locked"}</p>
          <h3>Push a block of ice with the cracked mirror</h3>
          <p>You fire the mirror at a 1 metre block of ice for 60 seconds and measure how far it moves. It takes 2 hours, and Lantern 17 goes dark for 1 of them. Your best sensor decides how sure you can be.</p>
          {!unlocked && !g.test && <p className="sq-why">To unlock it: pin 2 clues from C1 to C4 (you have {sceneClues(g)}) and cross off the idea that the sensors are wrong, or that something else hit it.</p>}
          {g.test && (
            <p className="sq-result">
              It moved <b>{r1(g.test.measuredCmS)} cm per second</b>, measured with the {SENSORS[g.test.sensor].name.toLowerCase()} (accurate to ±{g.test.bandPct}%: {g.test.bandPct <= 3 ? "proven" : g.test.bandPct <= 15 ? "likely" : "maybe"}).
            </p>
          )}
        </div>
        {!g.test && (
          <div className="sq-actions">
            <button type="button" className="sq-btn big" aria-disabled={!testOpt?.ok || undefined} onClick={() => c.run({ type: "test" })}>
              Run the test <span aria-hidden="true">↯</span>
            </button>
            {testOpt && !testOpt.ok && <p className="sq-why">{testOpt.reason}</p>}
          </div>
        )}
      </div>
      {c.flash && <p className="sq-flash" role="alert">{c.flash}</p>}
      <Latest game={g} from={c.from} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5: tell the world                                               */
/* ------------------------------------------------------------------ */
const PACKET_PLAIN: Record<PacketId, string> = {
  summary: "Just the headline. Quick to send, but it has no measurements, so nobody will act on it.",
  core: "Your findings plus your test results. This is what you need to be believed.",
  full: "Everything, including video and every log. Takes longest, but it convinces the most stations.",
};

export function Report({ c }: { c: QuestCtx }) {
  const g = c.game;
  const b = g.broadcast;
  return (
    <div className="sq-panel">
      <h2>Tell the world</h2>
      <p className="sq-lede">
        You can send <b>one</b> report to the other Lanterns. If they believe you, they will help push the ice away. A bigger report takes longer to send, and everything is four times slower during the Eclipse.
      </p>
      {b ? (
        <div className="sq-done">
          <b>{PACKETS[b.packet].name} report sent.</b> It left at hour {r1(b.t)} and arrives at hour {r1(b.arriveT)}
          {b.arriveT > CLOCKS.iceTrueH ? ", after the ice has already hit." : "."} The network decides what to do when it lands. You will see their answer at the end.
        </div>
      ) : (
        <>
          <div className="sq-cards three">
            {(Object.keys(PACKETS) as PacketId[]).map((id) => {
              const o = opt(c, (a) => a.type === "broadcast" && a.packet === id);
              const ph = packetHours(g, id);
              const arrive = g.t + ph.hours;
              return (
                <article key={id} className="sq-card">
                  <h3>{PACKETS[id].name}</h3>
                  <p>{PACKET_PLAIN[id]}</p>
                  <p className="sq-small">
                    {PACKETS[id].mb} MB · {fmtHours(ph.hours)} to send{ph.eclipse ? " (slow: Eclipse)" : ""}
                  </p>
                  <p className={`sq-small ${arrive > CLOCKS.iceTrueH ? "warn" : ""}`}>Arrives at hour {r1(arrive)}</p>
                  <button type="button" className="sq-btn" aria-disabled={!o?.ok || undefined} onClick={() => c.run({ type: "broadcast", packet: id }, "radio")}>
                    Send {PACKETS[id].name.toLowerCase()}
                  </button>
                  {o && !o.ok && <p className="sq-why">{o.reason}</p>}
                </article>
              );
            })}
          </div>
          <div className="sq-checks">
            <p className="sq-eyebrow">What the network wants before it believes you</p>
            <ul>
              {beliefChecks(g, g.t + packetHours(g, "core").hours).map((k) => (
                <li key={k.text} className={k.ok ? "ok" : ""}>
                  {k.ok ? "✓" : "○"} {k.text}
                </li>
              ))}
            </ul>
            <p className="sq-small">This checks the Core report. {isEclipse(g.t) ? "The Eclipse is on right now, so reports are slow." : ""}</p>
          </div>
        </>
      )}
      {c.flash && <p className="sq-flash" role="alert">{c.flash}</p>}
      <Latest game={g} from={c.from} />
    </div>
  );
}
