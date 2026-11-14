"use client";

import { useMemo, useState } from "react";
import { ENDINGS, ENDING_ORDER, STRATEGIES, runPolicy } from "@/lib/game";
import type { EndingId } from "@/lib/game";
import Result from "./Result";
import { TALLY_SEEDS, type Tally } from "./tally";

/** The nine scripted crews: pick one, deal it a different event deck, and read exactly what happened. */
export function Crews({ tally }: { tally: Tally | null }) {
  const [pick, setPick] = useState(STRATEGIES[0].id);
  const [seed, setSeed] = useState(1);
  const run = useMemo(() => runPolicy(seed, STRATEGIES.find((x) => x.id === pick)!.policy), [pick, seed]);
  const st = STRATEGIES.find((x) => x.id === pick)!;

  return (
    <section className="lb-sec" id="crews" aria-labelledby="crews-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          03 <b>{"//"}</b> Nine crews
        </p>
        <h2 className="display" id="crews-title">
          Watch whole missions, <em>move by move.</em>
        </h2>
        <p>
          Each crew is a scripted player that makes every choice through the real engine: the hangar, the route, the event cards, the station, the big choice and the broadcast. The bar under each name shows the endings it reached across {TALLY_SEEDS} different event decks.
        </p>
      </header>

      <div className="lb-crew-layout">
        <div className="lb-crews" role="radiogroup" aria-label="Choose a crew">
          {STRATEGIES.map((s) => {
            const t = tally?.[s.id];
            const total = t ? Object.values(t).reduce((a, b) => a + (b ?? 0), 0) : 0;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} className="lb-crew" onClick={() => setPick(s.id)}>
                <b>{s.name}</b>
                <span>{s.summary}</span>
                <span className="lb-tally" aria-label={t ? Object.entries(t).map(([e, n]) => `${ENDINGS[e as EndingId].name} ${n} of ${total}`).join(", ") : "working it out"}>
                  {t ? (
                    (Object.entries(t) as [EndingId, number][]).map(([e, n]) => <i key={e} className={`tier-${ENDINGS[e].tier}`} style={{ flex: n }} title={`${ENDINGS[e].name}: ${n} of ${total}`} />)
                  ) : (
                    <i className="wait" style={{ flex: 1 }} />
                  )}
                </span>
                <small>aims for: {ENDINGS[s.aims].name}</small>
              </button>
            );
          })}
        </div>

        <div className="lb-crew-run">
          <div className="lb-seed">
            <label htmlFor="lab-seed">Event deck</label>
            <input id="lab-seed" type="number" min={1} value={seed} onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))} />
            <button type="button" onClick={() => setSeed((n) => n + 1)}>
              Deal again
            </button>
            <span>
              {run.state.deck.join(" · ") || "—"} · {run.actions.length} actions
            </span>
          </div>
          <p className="lb-crew-name">
            <b>{st.name}</b> <span>{st.summary}</span>
          </p>
          <Result s={run.state} />
        </div>
      </div>
    </section>
  );
}

/** Every ending, what triggers it, and which crews reach it. */
export function Endings({ tally }: { tally: Tally | null }) {
  // of every run in the sample (each crew on each deck), how many ended this way
  const runs = tally ? STRATEGIES.reduce((n, c) => n + Object.values(tally[c.id] ?? {}).reduce((a, b) => a + b, 0), 0) : 0;
  return (
    <section className="lb-sec" id="endings" aria-labelledby="endings-title">
      <header className="lb-sec-head">
        <p className="eyebrow">
          04 <b>{"//"}</b> Eight endings
        </p>
        <h2 className="display" id="endings-title">
          Every ending is <em>reachable.</em>
        </h2>
        <p>
          The headline ending is about the proof: was it sent, in time, and was it believed? The station, the cities and the crew are scored separately, because scientific success and operational success are not always the same thing.
        </p>
      </header>
      <ul className="lb-endings">
        {ENDING_ORDER.map((id) => {
          const e = ENDINGS[id];
          const crews = tally ? STRATEGIES.filter((s) => (tally[s.id]?.[id] ?? 0) > 0) : [];
          const hits = tally ? STRATEGIES.reduce((n, c) => n + (tally[c.id]?.[id] ?? 0), 0) : 0;
          const share = runs ? hits / runs : 0;
          return (
            <li key={id} className={`tier-${e.tier}`}>
              <p className="eyebrow">{e.tierLabel}</p>
              <h3>{e.name}</h3>
              <q>{e.line}</q>
              <p className="lb-trigger">{e.trigger}</p>
              {tally && (
                <div className="lb-reach" title={`${hits} of ${runs} sample runs`}>
                  <span aria-hidden="true">
                    <i style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%` }} />
                  </span>
                  <b>{share > 0 ? `${share < 0.01 ? "<1" : Math.round(share * 100)}% of runs` : "no runs"}</b>
                </div>
              )}
              <p className="lb-reached">
                {tally ? (crews.length ? <>Reached by {crews.map((c) => c.name).join(", ")}</> : "Not reached by any crew in this sample") : "Checking…"}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
