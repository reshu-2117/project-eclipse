"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  ADDONS,
  CLUES,
  CLUE_IDS,
  COMMS,
  ENGINES,
  EVENTS,
  EVENT_IDS,
  HULLS,
  HYPOTHESES,
  KIT,
  POWER,
  SENSORS,
  SETTLEMENTS,
  SETTLEMENT_IDS,
  SHIELDS,
  ZONES,
  ZONE_ORDER,
} from "@/lib/game";
import type { ZoneId } from "@/lib/game";
import CardArt from "../mission/CardArt";
import { HUB, ZONE_POS } from "../mission/stationMap";
import { HullThumb } from "../mission/Blueprint";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const TAG = { real: "REAL", game: "GAME VALUE", fiction: "FICTION" } as const;

const TABS = [
  { id: "hulls", label: "Hulls & parts" },
  { id: "cards", label: "Event cards" },
  { id: "station", label: "Lantern 17" },
  { id: "towns", label: "Settlements" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ---------- hulls ---------- */
function Hulls() {
  const hulls = Object.values(HULLS);
  const max = (k: "coreKg" | "maxFuelKg" | "bayLimitKg" | "cost") => Math.max(...hulls.map((h) => h[k]));
  const slots: [string, number][] = [
    ["Engines", Object.keys(ENGINES).length],
    ["Power", Object.keys(POWER).length],
    ["Shields", Object.keys(SHIELDS).length],
    ["Sensors", Object.keys(SENSORS).length],
    ["Comms", Object.keys(COMMS).length],
    ["Kit", Object.keys(KIT).length],
    ["Add-ons", Object.keys(ADDONS).length],
  ];
  const parts = slots.reduce((n, [, c]) => n + c, 0);
  return (
    <div className="lb-tabpanel">
      <div className="lb-hulls">
        {hulls.map((h) => {
          const bars: [string, string, number][] = [
            ["Core mass", `${r0(h.coreKg)} kg`, h.coreKg / max("coreKg")],
            ["Max fuel", `${r0(h.maxFuelKg)} kg`, h.maxFuelKg / max("maxFuelKg")],
            ["Bay", `${r0(h.bayLimitKg)} kg`, h.bayLimitKg / max("bayLimitKg")],
            ["Cost", `${h.cost} cr`, h.cost / max("cost")],
          ];
          return (
            <article key={h.id} className="lb-hullcard">
              <div className="lb-hull big">
                <HullThumb id={h.id} />
              </div>
              <h3>{h.name}</h3>
              <p className="lb-hullcard-tag">{h.tagline}</p>
              <ul className="lb-bars">
                {bars.map(([label, v, k]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <i aria-hidden="true">
                      <u style={{ width: `${Math.max(6, k * 100)}%` }} />
                    </i>
                    <b>{v}</b>
                  </li>
                ))}
                <li>
                  <span>Sensor slots</span>
                  <i className="dots" aria-hidden="true">
                    {[0, 1, 2, 3].map((n) => (
                      <u key={n} className={n < h.sensorSlots ? "on" : ""} />
                    ))}
                  </i>
                  <b>{h.sensorSlots}</b>
                </li>
              </ul>
              <p className="lb-hullcard-note">{h.note}</p>
            </article>
          );
        })}
      </div>
      <div className="lb-slots" aria-label={`${parts} parts across seven slots`}>
        <b>{parts} parts</b>
        {slots.map(([name, n]) => (
          <span key={name}>
            {name} <em>{n}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------- event cards ---------- */
function Cards() {
  return (
    <div className="lb-tabpanel">
      <p className="lb-tab-lede">
        {EVENT_IDS.length} cards. Three are drawn each flight, and the distress call is always one of them. Each card says where it comes from.
      </p>
      <div className="lb-evs">
        {EVENT_IDS.map((id) => {
          const c = EVENTS[id];
          return (
            <article key={id} className="lb-ev">
              <CardArt id={id} />
              <div className="lb-ev-body">
                <div className="lb-ev-top">
                  <h3>{c.title}</h3>
                  <i className={`hg-tag ${c.source}`}>{TAG[c.source]}</i>
                </div>
                <ul className="lb-chips">
                  {c.choices.map((x) => (
                    <li key={x.id}>{x.label}</li>
                  ))}
                </ul>
                <p>{c.teaches}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- the station ---------- */
function Station() {
  const [sel, setSel] = useState<ZoneId>("dock");
  const z = ZONES[sel];
  const clueFor = (id: ZoneId) => CLUE_IDS.filter((c) => CLUES[c].where.toLowerCase().includes(ZONES[id].name.toLowerCase()));
  const clues = clueFor(sel);
  return (
    <div className="lb-tabpanel">
      <div className="lb-station">
        <svg viewBox="0 0 620 404" role="group" aria-label="Map of Lantern 17's six zones">
          <defs>
            <radialGradient id="lb-hub" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(255,181,71,0.35)" />
              <stop offset="1" stopColor="rgba(255,181,71,0)" />
            </radialGradient>
          </defs>
          <circle cx={HUB.x} cy={HUB.y} r="150" className="lb-st-ring" />
          <circle cx={HUB.x} cy={HUB.y} r="228" className="lb-st-ring far" />
          {ZONE_ORDER.filter((id) => id !== "dock").map((id) => (
            <line
              key={id}
              x1={HUB.x}
              y1={HUB.y}
              x2={ZONE_POS[id].x}
              y2={ZONE_POS[id].y}
              className={`lb-st-link${ZONES[id].far ? " far" : ""}${ZONES[id].damaged ? " dmg" : ""}`}
            />
          ))}
          <circle cx={HUB.x} cy={HUB.y} r="70" fill="url(#lb-hub)" />
          {ZONE_ORDER.map((id) => {
            const p = ZONE_POS[id];
            const n = clueFor(id).length;
            return (
              <g
                key={id}
                transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
                className={`lb-node${sel === id ? " on" : ""}${ZONES[id].damaged ? " dmg" : ""}${id === "dock" ? " hub" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${ZONES[id].name}${ZONES[id].damaged ? ", damaged" : ""}${n ? `, ${n} clue${n > 1 ? "s" : ""}` : ""}`}
                aria-pressed={sel === id}
                onClick={() => setSel(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSel(id);
                  }
                }}
              >
                <circle r={id === "dock" ? 30 : 24} className="lb-node-pulse" />
                <circle r={id === "dock" ? 20 : 15} className="lb-node-dot" />
                {Array.from({ length: n }, (_, k) => (
                  <circle key={k} cx={-8 + k * 16} cy={-(id === "dock" ? 36 : 30)} r="4.5" className="lb-pin" />
                ))}
                <text y={id === "dock" ? 48 : 42} textAnchor="middle">
                  {ZONES[id].name}
                </text>
              </g>
            );
          })}
        </svg>

        <aside className="lb-zone" aria-live="polite">
          <p className="eyebrow">
            {z.damaged ? "Damaged" : "Sound"} <b>·</b> {z.far ? "far from the hub" : "near the hub"}
          </p>
          <h3>{z.name}</h3>
          <p>{z.what}</p>
          <div className="lb-ed-block warn">
            <small>Hazard</small>
            <p>{z.hazard}</p>
          </div>
          <div className="lb-ed-block">
            <small>Real-world anchor</small>
            <p>{z.real}</p>
          </div>
          <div className="lb-ed-block">
            <small>Clues here</small>
            {clues.length ? (
              <ul className="lb-clues">
                {clues.map((c) => (
                  <li key={c}>
                    <b>
                      {c} · {CLUES[c].name}
                    </b>
                    <span>
                      {CLUES[c].points} pt · found with {CLUES[c].foundWith.toLowerCase()}
                    </span>
                    <em>{CLUES[c].shows}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No clue is hidden here.</p>
            )}
          </div>
        </aside>
      </div>

      <h4 className="lb-sub">Three explanations to rule out</h4>
      <div className="lb-hyps">
        {Object.values(HYPOTHESES).map((h) => (
          <article key={h.id}>
            <b>
              <i>{h.id}</i> {h.name}
            </b>
            <p>{h.text}</p>
            <small>Ruled out by</small>
            <span>{h.ruledOutBy}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ---------- settlements ---------- */
function Towns() {
  const towns = SETTLEMENT_IDS.map((id) => SETTLEMENTS[id]);
  const max = Math.max(...towns.map((t) => t.reserveH));
  return (
    <div className="lb-tabpanel">
      <p className="lb-tab-lede">Each settlement keeps a reserve of stored light. It drains by the light the town is missing, and the shortest reserve fails first.</p>
      <ol className="lb-towns">
        {[...towns]
          .sort((a, b) => a.reserveH - b.reserveH)
          .map((t) => (
            <li key={t.id}>
              <div className="lb-town-name">
                <h3>{t.name}</h3>
                <p>{t.note}</p>
              </div>
              <div className="lb-town-bar" aria-hidden="true">
                <u style={{ width: `${(t.reserveH / max) * 100}%` }} />
                {[12, 24, 36, 48].map((h) => (
                  <i key={h} style={{ left: `${(h / max) * 100}%` }} />
                ))}
              </div>
              <b>
                {t.reserveH}
                <small> h of reserve</small>
              </b>
            </li>
          ))}
      </ol>
      <div className="lb-ruler" aria-hidden="true">
        {[0, 12, 24, 36, 48].map((h) => (
          <span key={h}>{h} h</span>
        ))}
      </div>
    </div>
  );
}

/** The game's data, laid open. Every row is a line of data in the code, and every row says where it comes from. */
export default function Rules() {
  const [tab, setTab] = useState<TabId>("hulls");
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else return;
    e.preventDefault();
    setTab(TABS[n].id);
    list.current?.querySelectorAll<HTMLElement>("[role=tab]")[n]?.focus();
  };
  return (
    <section className="lb-sec" id="rules" aria-labelledby="rules-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          05 <b>{"//"}</b> The rules, in the open
        </p>
        <h2 className="display" id="rules-title">
          It&apos;s all <em>just data.</em>
        </h2>
        <p>Hulls, parts, event cards, zones and clues are plain rows in the code. A new part or card is a new row. Open any tab to read it.</p>
      </header>

      <div className="lb-tabs" role="tablist" aria-label="Game data" ref={list} onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "on" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} className="lb-panel">
        {tab === "hulls" && <Hulls />}
        {tab === "cards" && <Cards />}
        {tab === "station" && <Station />}
        {tab === "towns" && <Towns />}
      </div>
    </section>
  );
}
