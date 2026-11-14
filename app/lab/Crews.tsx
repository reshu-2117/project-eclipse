"use client";

import { useMemo, useState } from "react";
import { ENDINGS, ENDING_ORDER, STRATEGIES, runPolicy } from "@/lib/game";
import type { EndingId } from "@/lib/game";
import "./charts.css";
import Result from "./Result";
import { TALLY_SEEDS, type Tally } from "./tally";

/** Every crew against every ending: a dot's size is how often that crew lands there across the sample decks. */
function CrewMap({ tally, pick, onPick }: { tally: Tally | null; pick: string; onPick: (id: string) => void }) {
  return (
    <div className="cm">
      <div className="cm-inner" role="group" aria-label="Which ending each crew reaches, across the sample event decks">
        <div className="cm-head" aria-hidden="true">
          <span>Crew</span>
          {ENDING_ORDER.map((e) => (
            <span key={e} className={`tier-${ENDINGS[e].tier}`}>
              {ENDINGS[e].name}
            </span>
          ))}
        </div>
        {STRATEGIES.map((st, r) => (
          <button
            key={st.id}
            type="button"
            className={`cm-row${pick === st.id ? " on" : ""}`}
            aria-pressed={pick === st.id}
            aria-label={`${st.name}: ${tally ? ENDING_ORDER.filter((e) => tally[st.id]?.[e]).map((e) => `${ENDINGS[e].name} ${tally[st.id]?.[e]} of ${TALLY_SEEDS}`).join(", ") : "working it out"}`}
            onClick={() => onPick(st.id)}
          >
            <b>{st.name}</b>
            {ENDING_ORDER.map((e, c) => {
              const n = tally?.[st.id]?.[e] ?? 0;
              return (
                <span key={e} className={`cm-cell tier-${ENDINGS[e].tier}`}>
                  <span className={`cm-dot${n ? "" : " none"}`} style={{ ["--k" as string]: Math.sqrt(n / TALLY_SEEDS), ["--r" as string]: r, ["--c" as string]: c }}>
                    {n > 1 && <i>{n}</i>}
                  </span>
                </span>
              );
            })}
          </button>
        ))}
      </div>
      <p className="cm-note">{tally ? `A bigger, brighter dot means the crew lands there more often. Each crew flew ${TALLY_SEEDS} different event decks. Click a row to watch that crew.` : "Flying the sample runs…"}</p>
    </div>
  );
}

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

      <CrewMap tally={tally} pick={pick} onPick={setPick} />

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
