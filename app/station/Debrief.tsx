"use client";

import "./quest.css";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { BELIEF, debrief } from "@/lib/game";
import type { GameState, LedgerEntry } from "@/lib/game";
import { r0, r1 } from "./shared";

const TONE: Record<string, string> = { best: "#ffd47a", win: "#8fe3b0", price: "#ffb547", partial: "#7fd4e8", notWin: "#ff9a6e", loss: "#ff6a2b" };

/** The moments worth remembering: not every inspection, just the turning points. */
function keyMoments(ledger: LedgerEntry[]): LedgerEntry[] {
  const skip = /^(Inspected|Ruled out|Held position|Fly-around|Docked at Lantern|Network:)/;
  const picks = ledger.filter((e) => e.kind !== "notice" && !skip.test(e.title) && e.phase !== "briefing" && e.phase !== "hangar");
  if (picks.length <= 8) return picks;
  // keep the first, the last two, and an even spread between
  const out = new Set<LedgerEntry>([picks[0], picks[picks.length - 1], picks[picks.length - 2]]);
  const step = (picks.length - 1) / 6;
  for (let i = 1; i < 6; i++) out.add(picks[Math.round(i * step)]);
  return picks.filter((e) => out.has(e));
}

/** The ending: what happened and why, in plain words, what could have gone better, and how to try again. */
export default function Debrief({ game, onNew, ghost, replay }: { game: GameState; onNew: () => void; ghost?: ReactNode; replay?: ReactNode }) {
  const d = useMemo(() => debrief(game), [game]);
  const [copied, setCopied] = useState(false);
  const o = d.outcome;
  const e = d.ending;
  if (!o || !e) return null;
  const tone = TONE[e.tier] ?? "#ffb547";
  const b = game.broadcast;
  const failedCities = o.settlements.filter((x) => x.failed).length;

  const verdicts: { ok: boolean | null; title: string; line: string }[] = [
    {
      ok: o.evidence >= BELIEF.minEvidence && o.bandPct !== null && o.bandPct <= BELIEF.maxBandPct,
      title: "Your proof",
      line: `${o.evidence} of 100 proof points, ${o.bandPct === null ? "and you never ran the test" : `with a test accurate to ±${o.bandPct}%`}. The network needed ${BELIEF.minEvidence} and a test within ±${BELIEF.maxBandPct}%.`,
    },
    {
      ok: b ? b.believed : false,
      title: "The network",
      line: !b ? "You never sent a report, so nobody else knew." : b.believed ? `They believed your ${b.packet} report and ${b.lanterns} more Lanterns turned toward the ice.` : `They did not believe you: ${b.reason}.`,
    },
    {
      ok: o.stationSurvived,
      title: "Lantern 17",
      line: o.stationSurvived ? `It survived. You pushed the ice ${r1(o.iceShiftKm)} km of the 1.5 km it needed.` : o.stationLostBy === "reactor" ? "Its reactor shut down and the station was lost." : `The ice hit it. You pushed the ice ${r1(o.iceShiftKm)} km of the 1.5 km it needed.`,
    },
    {
      ok: o.crewHome,
      title: "Your crew",
      line: o.crewHome ? "You got home safe." : `Stranded. ${o.strandedReason ?? "You did not make it back."}`,
    },
    {
      ok: failedCities === 0,
      title: "The cities",
      line: failedCities === 0 ? "All four settlements kept their light." : `${failedCities} of 4 settlements ran out of light.`,
    },
  ];

  const copy = async () => {
    const text = `I flew Project Eclipse and got "${e.name}" (${e.tierLabel}). Proof ${o.evidence}/100, the ice moved ${r1(o.iceShiftKm)} km of the 1.5 km it needed, ${o.crewHome ? "and my crew got home" : "and my crew got stranded"}. Can you do better? ${window.location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy your result:", text);
    }
  };

  return (
    <div className="sq-db" style={{ ["--tone" as string]: tone }}>
      <header className="sq-db-head">
        <p className="sq-eyebrow">Debrief · hour {r1(game.t)}</p>
        <span className="sq-db-tier">{e.tierLabel}</span>
        <h1>{e.name}</h1>
        <p className="sq-db-quote">{e.line}</p>
        <p className="sq-small">Why this ending: {e.trigger}</p>
      </header>

      <section aria-label="How it went">
        <h2 className="sq-db-h">How it went</h2>
        <ul className="sq-db-verdicts">
          {verdicts.map((v) => (
            <li key={v.title} className={v.ok ? "ok" : "no"}>
              <span aria-hidden="true">{v.ok ? "✓" : "✗"}</span>
              <div>
                <b>{v.title}</b>
                <p>{v.line}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {ghost}

      <section aria-label="Key moments">
        <h2 className="sq-db-h">The moments that mattered</h2>
        <ol className="sq-db-moments">
          {keyMoments(d.ledger).map((m) => (
            <li key={m.n} className={m.kind}>
              <span>Hour {r1(m.t)}</span>
              <div>
                <b>{m.title}</b>
                {m.text && <p>{m.text}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="What you could have done better">
        <h2 className="sq-db-h">What you could have done better</h2>
        {d.better.length ? (
          <ul className="sq-db-better">
            {d.better.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="sq-done">
            <b>Nothing stands out.</b> That was a clean run.
          </p>
        )}
      </section>

      <section aria-label="In real life">
        <h2 className="sq-db-h">In real life</h2>
        <p className="sq-lede">Every part you flew is based on real hardware.</p>
        <div className="sq-db-real">
          {d.realLife.map((c) => (
            <article key={c.key}>
              <small>{c.label}</small>
              <b>≈ {c.real}</b>
              <p>{c.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sq-db-go" aria-label="Try again">
        <h2 className="sq-db-h">Try again</h2>
        <p className="sq-lede">The same ice and the same event cards come back if you replay this mission. Change one thing, like the route or your sensors, and see what happens.</p>
        {replay}
        <div className="sq-actions row">
          <button type="button" className="sq-btn big" onClick={onNew}>
            Start fresh with a new ship
          </button>
          <button type="button" className="sq-btn ghost big" onClick={copy}>
            {copied ? "Copied!" : "Copy my result to share"}
          </button>
          <Link href="/lab" className="sq-btn ghost big">
            See how the 9 crews did
          </Link>
        </div>
        <p className="sq-small">Details: {r0(o.dvLeft)} m/s of fuel power left, {r1(o.doseMsv)} mSv of radiation, hull {o.hull} out of 100.</p>
      </section>
    </div>
  );
}
