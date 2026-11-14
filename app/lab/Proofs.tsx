"use client";

import { useMemo, useState } from "react";
import {
  PLANET,
  createGame,
  fuelForDeltaV,
  hohmann,
  hoursForShift,
  loadoutStats,
  orbitPeriodMin,
  planeChangeDv,
  testPushCmS,
  transferHours,
} from "@/lib/game";

import { CountUp } from "./fx";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

type Tag = "real" | "game" | "fiction";
interface Proof {
  what: string;
  formula: string;
  book: string;
  engine: string;
  ok: boolean;
  tag: Tag;
  note: string;
}

const TAG: Record<Tag, string> = { real: "REAL", game: "GAME VALUE", fiction: "FICTION" };

export function useProofs(): Proof[] {
  return useMemo(() => {
    const wick = PLANET.radiusKm + PLANET.wickAltKm;
    const l17 = PLANET.radiusKm + PLANET.lanternAltKm;
    const h = hohmann(wick, l17);
    const tender = loadoutStats(createGame(1).loadout);
    const dodge = fuelForDeltaV(316, 6100, 4500, 40);
    return [
      {
        what: "Orbit period at 1,000 km",
        formula: "T = 2π √(r³ / μ)",
        book: "≈105 min",
        engine: `${r1(orbitPeriodMin(l17))} min`,
        ok: Math.abs(orbitPeriodMin(l17) - 105) < 1,
        tag: "real",
        note: "Earth's radius and gravity, so every orbital number is a real one.",
      },
      {
        what: "Hohmann transfer, Wick to Lantern 17",
        formula: "Δv = |v_p − v₁| + |v₂ − v_a|",
        book: "376 m/s · 49 min",
        engine: `${r0(h.dv)} m/s · ${r0(h.minutes)} min`,
        ok: Math.round(h.dv) === 376 && Math.round(h.minutes) === 49,
        tag: "real",
        note: "The cheapest way between two orbits is the slow one.",
      },
      {
        what: "A 10° plane change",
        formula: "Δv = 2 v sin(Δi / 2)",
        book: "1,282 m/s",
        engine: `${r0(planeChangeDv(l17, 10))} m/s`,
        ok: Math.round(planeChangeDv(l17, 10)) === 1282,
        tag: "real",
        note: "Costs more than the whole safe round trip. That is the trap.",
      },
      {
        what: "Standard Tender: speed budget",
        formula: "Δv = Isp · g₀ · ln(m₀ / m₁)",
        book: "≈1,700 m/s",
        engine: `${r0(tender.dv)} m/s`,
        ok: Math.abs(tender.dv - 1700) < 40,
        tag: "real",
        note: "The ideal rocket equation, from NASA Glenn.",
      },
      {
        what: "Standard Tender: dry mass",
        formula: "dry = (core + parts) × 1.10",
        book: "≈6,060 kg",
        engine: `${r0(tender.dryKg)} kg`,
        ok: Math.abs(tender.dryKg - 6060) < 30,
        tag: "real",
        note: "The 10% is the design margin real engineers add.",
      },
      {
        what: "Fuel burned to dodge at 40 m/s",
        formula: "m_f = m (1 − e^(−Δv / vₑ))",
        book: "136 kg",
        engine: `${r0(dodge)} kg`,
        ok: Math.round(dodge) === 136,
        tag: "real",
        note: "A heavier ship pays more for the same dodge, with no extra code.",
      },
      {
        what: "Test push: 10 kW for 60 s on 482 kg",
        formula: "F = P · k,  Δv = F t / m",
        book: "≈6 cm/s",
        engine: `${r1(testPushCmS())} cm/s`,
        ok: Math.abs(testPushCmS() - 6) < 0.5,
        tag: "game",
        note: "Push per watt is from laser-ablation lab work, applied to ice.",
      },
      {
        what: "Beam time for a 1.5 km miss",
        formula: "s = ½ a t²,  a = 3F / m",
        book: "≈21 h",
        engine: `${r1(hoursForShift(1.5))} h`,
        ok: Math.abs(hoursForShift(1.5) - 21) < 1,
        tag: "fiction",
        note: "Twice the warning gives four times the miss.",
      },
      {
        what: "200 MB over the small radio",
        formula: "t = size ÷ speed",
        book: "1 h 44 min",
        engine: `${r0(transferHours(200, 0.256) * 60)} min`,
        ok: Math.round(transferHours(200, 0.256) * 60) === 104,
        tag: "real",
        note: "Why the comms choice in the hangar matters at the end.",
      },
      {
        what: "2 GB over the laser terminal",
        formula: "t = size ÷ speed",
        book: "80 s",
        engine: `${r0(transferHours(2000, 200) * 3600)} s`,
        ok: Math.round(transferHours(2000, 200) * 3600) === 80,
        tag: "real",
        note: "NASA's DSOC reached 267 Mbps from deep space.",
      },
    ];
  }, []);
}

const FILTERS: { id: Tag | "all"; label: string; note: string }[] = [
  { id: "all", label: "All", note: "Hover a segment to find its card, or a card to find its segment." },
  { id: "real", label: "Real", note: "Published formulas and NASA figures. The engine reaches the same answer." },
  { id: "game", label: "Game value", note: "Our own balance choices, labelled so nobody mistakes them for NASA data." },
  { id: "fiction", label: "Fiction", note: "Extrapolation: the ice push is built on lab work, then scaled to a Lantern." },
];

const R = 78;
const seg = (i: number, n: number) => {
  const step = 360 / n;
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(100 + R * Math.cos(a)).toFixed(2)} ${(100 + R * Math.sin(a)).toFixed(2)}`;
  };
  return `M${pt(-90 + i * step + 4)} A${R} ${R} 0 0 1 ${pt(-90 + (i + 1) * step - 4)}`;
};

export default function Proofs() {
  const proofs = useProofs();
  const [filter, setFilter] = useState<Tag | "all">("all");
  const [hot, setHot] = useState<number | null>(null);
  const passed = proofs.filter((p) => p.ok).length;
  const count = (t: Tag) => proofs.filter((p) => p.tag === t).length;
  const note = FILTERS.find((f) => f.id === filter)!.note;
  const on = (p: Proof) => filter === "all" || p.tag === filter;
  return (
    <section className="lb-sec" id="proofs" aria-labelledby="proofs-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          01 <b>{"//"}</b> Proofs
        </p>
        <h2 className="display" id="proofs-title">
          Every number, <em>re-derived.</em>
        </h2>
        <p>
          The engine never copies a number from our handbook. It computes each one from the real formula, and this board compares the two in your browser,
          right now. <b>
            {passed} of {proofs.length}
          </b>{" "}
          match.
        </p>
      </header>

      <div className="lb-pb">
        <aside className="lb-verdict" aria-label="Verdict">
          <div className="lb-ring">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r={R + 16} className="lb-ring-halo" />
              <circle cx="100" cy="100" r={R - 14} className="lb-ring-inner" />
              {proofs.map((p, i) => (
                <path
                  key={p.what}
                  d={seg(i, proofs.length)}
                  className={`lb-seg${p.ok ? "" : " off"}${on(p) ? "" : " dim"}${hot === i ? " hot" : ""}`}
                  style={{ ["--i" as string]: i }}
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(null)}
                />
              ))}
            </svg>
            <div className="lb-ring-c">
              <b>
                <CountUp to={passed} />
              </b>
              <span>of {proofs.length} match</span>
            </div>
          </div>
          <div className="lb-filter" role="group" aria-label="Show proofs by source">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? "on" : ""} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
                <small>{f.id === "all" ? proofs.length : count(f.id)}</small>
              </button>
            ))}
          </div>
          <p className="lb-verdict-note" aria-live="polite">
            {note}
          </p>
        </aside>

        <ol className="lb-proofs">
          {proofs.map((p, i) => (
            <li
              key={p.what}
              className={`${p.ok ? "ok" : "off"}${on(p) ? "" : " dim"}${hot === i ? " hot" : ""}`}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
            >
              <span className="lb-proof-n" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="lb-proof-top">
                <h3>{p.what}</h3>
                <i className={`hg-tag ${p.tag}`}>{TAG[p.tag]}</i>
              </div>
              <code>{p.formula}</code>
              <div className="lb-proof-vals">
                <div>
                  <small>The engine computes</small>
                  <b>{p.engine}</b>
                </div>
                <div>
                  <small>The handbook says</small>
                  <span>{p.book}</span>
                </div>
                <svg className="lb-check" viewBox="0 0 24 24" aria-label={p.ok ? "match" : "off"} role="img">
                  <circle cx="12" cy="12" r="10.5" />
                  {p.ok ? <path d="M7 12.5l3.2 3.2L17 9" /> : <path d="M8 8l8 8M16 8l-8 8" />}
                </svg>
              </div>
              <p>{p.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
