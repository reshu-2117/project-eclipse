"use client";

import { useState } from "react";

type Status = "online" | "damaged" | "offline" | "relit";

const DAMAGED: Record<number, number> = { 8: 64, 15: 41, 17: 52 };

function lanternFor(i: number, lit17: boolean) {
  const id = `L-${String(i + 1).padStart(2, "0")}`;
  if (i === 16) {
    return lit17
      ? { id, status: "relit" as Status, output: 100 }
      : { id, status: "offline" as Status, output: 61 };
  }
  if (DAMAGED[i] !== undefined) return { id, status: "damaged" as Status, output: DAMAGED[i] };
  return { id, status: "online" as Status, output: 90 + ((i * 7) % 10) };
}

const COPY: Record<Status, { label: string; text: string }> = {
  online: {
    label: "Online",
    text: "Holding steady. Its light is still reaching the surface below, and the ice under it stays thin enough for life.",
  },
  damaged: {
    label: "Ice damage",
    text: "Its collector has been scarred by ice debris drifting through the orbit. Output is falling. It will need attention soon.",
  },
  offline: {
    label: "Failing",
    text: "Its optics are damaged and its light is falling: 61% and dropping. Three telemetry channels have gone silent, and a huge piece of ice is tracked toward it. This is your mission.",
  },
  relit: {
    label: "Relit",
    text: "Back online. Light is returning to the surface below. The network is whole again, for now.",
  },
};

export default function Network({ lit17 }: { lit17: boolean }) {
  const [sel, setSel] = useState(16);
  const lanterns = Array.from({ length: 24 }, (_, i) => lanternFor(i, lit17));
  const current = lanterns[sel];
  const copy = COPY[current.status];
  const lit = lanterns.filter((l) => l.status !== "offline").length;

  return (
    <section className="section" id="network" aria-labelledby="network-title">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            The Lantern Network <b>{"//"}</b> 24 stations
          </p>
          <h2 className="display" id="network-title">
            Twenty-four lights. <em>One is failing.</em>
          </h2>
          <p className="lede">
            With no star to warm it, the planet survives on artificial light. Every Lantern holds back the ice on
            the patch of surface beneath it. Tap any station to read its status.
          </p>
        </div>

        <div className="network-layout reveal">
          <div className="board">
            <div className="board-top">
              <span className="eyebrow">Orbital status board</span>
              <span className="eyebrow">
                <b>{lit}</b>/24 healthy
              </span>
            </div>
            <div className="cells">
              {lanterns.map((l, i) => {
                const cls = l.status === "offline" ? "cell dead" : l.status === "damaged" ? "cell warn" : "cell";
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={cls}
                    aria-pressed={sel === i}
                    aria-label={`${l.id}, ${COPY[l.status].label}, output ${l.output} percent`}
                    onClick={() => setSel(i)}
                  >
                    <span className="cell-id">
                      {l.id}
                      <i
                        className={
                          l.status === "offline" ? "dot dot-ember" : l.status === "damaged" ? "dot dot-ice" : "dot dot-amber"
                        }
                        aria-hidden="true"
                      />
                    </span>
                    <span className="cell-bar" aria-hidden="true">
                      <i style={{ width: `${l.output}%` }} />
                    </span>
                    <span className="cell-status">{COPY[l.status].label.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="detail" aria-live="polite">
            <p className="eyebrow">
              Station <b>{current.id}</b> · orbit slot {sel + 1} of 24
            </p>
            <h3>Lantern {sel + 1}</h3>
            <p>{copy.text}</p>
            <div className="readout">
              <div>
                <span>Status</span>
                <strong
                  style={{
                    color:
                      current.status === "offline"
                        ? "var(--ember)"
                        : current.status === "damaged"
                          ? "var(--ice)"
                          : "var(--amber)",
                  }}
                >
                  {copy.label}
                </strong>
              </div>
              <div>
                <span>Light output</span>
                <strong>{current.output}%</strong>
              </div>
              <div>
                <span>Surface below</span>
                <strong>{current.status === "offline" ? "Dimming" : current.status === "damaged" ? "Cooling" : "Stable"}</strong>
              </div>
              <div>
                <span>Action</span>
                <strong>{current.status === "offline" ? "Repair" : current.status === "damaged" ? "Monitor" : "None"}</strong>
              </div>
            </div>
            {current.status === "offline" && (
              <a className="btn btn-lantern" href="#briefing" style={{ justifySelf: "start" }}>
                Take the mission <span aria-hidden="true">↓</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
