"use client";

import { useMemo } from "react";
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

export default function Proofs() {
  const proofs = useProofs();
  const passed = proofs.filter((p) => p.ok).length;
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
          The engine never copies a number from our handbook. It computes each one from the real formula, and these cards compare the two in your browser,
          right now. <b>
            {passed} of {proofs.length}
          </b>{" "}
          match.
        </p>
      </header>
      <ul className="lb-proofs">
        {proofs.map((p) => (
          <li key={p.what} className={p.ok ? "ok" : "off"}>
            <div className="lb-proof-top">
              <span>{p.what}</span>
              <i className={`hg-tag ${p.tag}`}>{TAG[p.tag]}</i>
            </div>
            <code>{p.formula}</code>
            <div className="lb-proof-vals">
              <b>{p.engine}</b>
              <small>handbook says {p.book}</small>
              <em>{p.ok ? "✓ match" : "✗ off"}</em>
            </div>
            <p>{p.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
