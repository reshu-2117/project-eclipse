"use client";

import { useState, type ComponentType } from "react";
import { Flyby, Layers, OrbitIcon, Scan, Thermal } from "./Icons";

export type ObjectiveId = "thermal" | "subsurface" | "traces";
export type CraftId = "orbital" | "flyby";

type Option<T extends string> = {
  id: T;
  title: string;
  line: string;
  Icon: ComponentType<{ size?: number }>;
  bars: [string, number][];
};

const OBJECTIVES: (Option<ObjectiveId> & { payload: string })[] = [
  {
    id: "thermal",
    title: "Map thermal anomalies",
    line: "Find where heat is leaking through the ice under the dead Lantern.",
    Icon: Thermal,
    payload: "Infrared thermal mapper",
    bars: [["Mass", 2], ["Power", 3], ["Risk", 2]],
  },
  {
    id: "subsurface",
    title: "Investigate subsurface structure",
    line: "Look beneath the crust to see how fast the ocean is freezing.",
    Icon: Layers,
    payload: "Ice-penetrating radar",
    bars: [["Mass", 4], ["Power", 4], ["Risk", 3]],
  },
  {
    id: "traces",
    title: "Characterize surface traces",
    line: "Read the chemistry the ice leaves behind, and what it says about life.",
    Icon: Scan,
    payload: "Imaging spectrometer",
    bars: [["Mass", 2], ["Power", 2], ["Risk", 1]],
  },
];

const CRAFTS: (Option<CraftId> & { power: string })[] = [
  {
    id: "orbital",
    title: "Orbital surveyor",
    line: "Park near Lantern 17 and study the surface slowly, pass after pass.",
    Icon: OrbitIcon,
    power: "Radioisotope generator. There is no sunlight out here to harvest.",
    bars: [["Time", 5], ["Coverage", 4], ["Cost", 4]],
  },
  {
    id: "flyby",
    title: "Reconnaissance flyby",
    line: "One fast pass. Get the data, fix what you can, keep moving.",
    Icon: Flyby,
    power: "Batteries, topped up by a small radioisotope unit.",
    bars: [["Time", 1], ["Coverage", 2], ["Cost", 2]],
  },
];

function tradeoff(obj: ObjectiveId | null, craft: CraftId | null) {
  if (!obj || !craft) return "Pick an objective and a spacecraft. The brief writes itself as you choose.";
  if (craft === "flyby" && obj === "subsurface")
    return "Radar needs time over the target. A single flyby will only scratch the surface. Consider an orbiter.";
  if (craft === "orbital" && obj === "subsurface")
    return "The strongest science case, and the heaviest spacecraft. More mass means a bigger launch and a higher cost.";
  if (craft === "orbital") return "Time on station gives you better data, but every extra kilogram has to be paid for.";
  return "Cheap and fast, but you get one look. Make it count.";
}

function Bars({ bars }: { bars: [string, number][] }) {
  return (
    <span className="bars" aria-hidden="true">
      {bars.map(([label, v]) => (
        <span className="bar-row" key={label}>
          {label}
          <span className="segs">
            {[1, 2, 3, 4, 5].map((n) => (
              <i key={n} className={n <= v ? "on" : undefined} />
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function MissionDesigner({
  obj,
  craft,
  lit17,
  onObj,
  onCraft,
  onAuthorise,
}: {
  obj: ObjectiveId | null;
  craft: CraftId | null;
  lit17: boolean;
  onObj: (o: ObjectiveId) => void;
  onCraft: (c: CraftId) => void;
  onAuthorise: () => void;
}) {
  const [err, setErr] = useState(false);
  const o = OBJECTIVES.find((x) => x.id === obj);
  const c = CRAFTS.find((x) => x.id === craft);
  const progress = lit17 ? 100 : 96 + (o ? 1 : 0) + (c ? 1 : 0);

  function authorise() {
    if (!obj || !craft) {
      setErr(true);
      return;
    }
    setErr(false);
    onAuthorise();
  }

  return (
    <section className="section mission" id="mission" aria-labelledby="mission-title">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            Mission design <b>{"//"}</b> Work order L17-0001
          </p>
          <h2 className="display" id="mission-title">
            Give your mission <em>a purpose.</em>
          </h2>
          <p className="lede">
            Every choice changes the spacecraft. Pick what you want to learn, then how you&apos;ll get there, and
            watch the trade-offs move.
          </p>
        </div>

        <div className="mission-layout">
          <div className="reveal">
            <div className="group" role="group" aria-labelledby="g-obj">
              <p className="eyebrow" id="g-obj">
                01 · Primary science objective
              </p>
              <div className="options">
                {OBJECTIVES.map(({ id, title, line, Icon, bars }) => (
                  <button
                    key={id}
                    type="button"
                    className="option"
                    aria-pressed={obj === id}
                    onClick={() => {
                      onObj(id);
                      setErr(false);
                    }}
                  >
                    <Icon size={28} />
                    <h4>{title}</h4>
                    <p>{line}</p>
                    <Bars bars={bars} />
                  </button>
                ))}
              </div>
            </div>

            <div className="group" role="group" aria-labelledby="g-craft">
              <p className="eyebrow" id="g-craft">
                02 · Spacecraft concept
              </p>
              <div className="options">
                {CRAFTS.map(({ id, title, line, Icon, bars }) => (
                  <button
                    key={id}
                    type="button"
                    className="option"
                    aria-pressed={craft === id}
                    onClick={() => {
                      onCraft(id);
                      setErr(false);
                    }}
                  >
                    <Icon size={28} />
                    <h4>{title}</h4>
                    <p>{line}</p>
                    <Bars bars={bars} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="order reveal" aria-labelledby="order-title" aria-live="polite">
            {lit17 && <span className="stamp">AUTHORISED</span>}
            <div className="order-head">
              <span>WORK ORDER</span>
              <span>L17-0001</span>
            </div>
            <h3 id="order-title">Your planning brief</h3>
            <dl className="fields">
              <div>
                <dt>Target</dt>
                <dd>Lantern 17 · orbit slot 17</dd>
              </div>
              <div>
                <dt>Objective</dt>
                <dd className={o ? undefined : "empty"}>{o ? o.title : "Not chosen yet"}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd className={c ? undefined : "empty"}>{c ? c.title : "Not chosen yet"}</dd>
              </div>
              <div>
                <dt>Payload</dt>
                <dd className={o ? undefined : "empty"}>{o ? o.payload : "Depends on objective"}</dd>
              </div>
              <div>
                <dt>Power</dt>
                <dd className={c ? undefined : "empty"}>{c ? c.power : "Depends on platform"}</dd>
              </div>
            </dl>
            <p className="tradeoff">
              <b>TRADE-OFF</b>
              {tradeoff(obj, craft)}
            </p>
            <div className="meter">
              <div className="meter-top">
                <span>SURFACE LIGHT</span>
                <span>{lit17 ? "24/24 LANTERNS" : "23/24 LANTERNS"}</span>
              </div>
              <div className="meter-track" aria-hidden="true">
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
            {lit17 ? (
              <p className="relit">
                Lantern 17 relit. Light is returning to the surface. <a href="#top">See it ↑</a>
              </p>
            ) : (
              <>
                <button type="button" className="btn btn-lantern" onClick={authorise} style={{ justifySelf: "start" }}>
                  Authorise repair <span aria-hidden="true">↗</span>
                </button>
                {err && <p className="err">Pick an objective and a spacecraft first.</p>}
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
