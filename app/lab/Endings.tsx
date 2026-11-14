"use client";

import { useRef, useState } from "react";
import { ENDINGS, ENDING_ORDER, STRATEGIES } from "@/lib/game";
import type { EndingId } from "@/lib/game";
import type { Ending } from "@/lib/game/data/endings";
import LanternNetwork, { type L17State } from "../components/LanternNetwork";
import { useReducedMotion } from "../mission/Opening";
import type { Tally } from "./tally";

/** What the network looks like when each kind of ending lands. */
const NETWORK: Record<Ending["tier"], { l17: L17State; line: string }> = {
  best: { l17: "lit", line: "Lantern 17 restored. Every Lantern now knows how to turn." },
  win: { l17: "lit", line: "Lantern 17 restored. The ice misses." },
  price: { l17: "lit", line: "Lantern 17 survives, and the win cost something." },
  partial: { l17: "failing", line: "Lantern 17 survives, still failing." },
  notWin: { l17: "failing", line: "Lantern 17 is still failing, and nobody is listening." },
  loss: { l17: "dark", line: "Lantern 17 is lost, and the cities it fed go dark." },
};

/** Every ending: how often the sample crews reach it, what triggers it, and what the network looks like afterwards. */
export function Endings({ tally }: { tally: Tally | null }) {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState<EndingId>(ENDING_ORDER[0]);
  const list = useRef<HTMLDivElement>(null);

  const total = (id: EndingId) => (tally ? STRATEGIES.reduce((n, c) => n + (tally[c.id]?.[id] ?? 0), 0) : 0);
  const runs = tally ? ENDING_ORDER.reduce((n, id) => n + total(id), 0) : 0;
  const share = (id: EndingId) => (runs ? total(id) / runs : 0);
  const pct = (id: EndingId) => (share(id) === 0 ? "none" : share(id) < 0.01 ? "<1%" : `${Math.round(share(id) * 100)}%`);

  const e = ENDINGS[sel];
  const net = NETWORK[e.tier];
  const crews = tally ? STRATEGIES.filter((s) => (tally[s.id]?.[sel] ?? 0) > 0) : [];

  const onKey = (ev: React.KeyboardEvent) => {
    const i = ENDING_ORDER.indexOf(sel);
    let next = i;
    if (ev.key === "ArrowDown" || ev.key === "ArrowRight") next = (i + 1) % ENDING_ORDER.length;
    else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") next = (i - 1 + ENDING_ORDER.length) % ENDING_ORDER.length;
    else return;
    ev.preventDefault();
    setSel(ENDING_ORDER[next]);
    list.current?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
  };

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

      <div className="lb-spectrum" role="group" aria-label="How often each ending happens across the sample runs">
        {ENDING_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={`tier-${ENDINGS[id].tier}${sel === id ? " on" : ""}`}
            style={{ flexGrow: Math.max(share(id), 0.012) * 100 }}
            aria-label={`${ENDINGS[id].name}: ${pct(id)} of sample runs`}
            title={`${ENDINGS[id].name}: ${pct(id)}`}
            onClick={() => setSel(id)}
          />
        ))}
      </div>
      <p className="lb-spectrum-note">
        {tally ? (
          <>
            Each bar is one ending, as wide as its share of <b>{runs}</b> sample runs ({STRATEGIES.length} crews on 8 different event decks).
          </>
        ) : (
          "Flying the sample runs…"
        )}
      </p>

      <div className="lb-ed">
        <article className={`lb-ed-main tier-${e.tier}`} key={sel} aria-live="polite">
          <div className="lb-ed-net">
            <LanternNetwork l17={net.l17} reduce={reduce} ringRadius={0.4} planetRadius={0.27} />
            <p>{net.line}</p>
          </div>
          <div className="lb-ed-copy">
            <p className="eyebrow">{e.tierLabel}</p>
            <h3>{e.name}</h3>
            <q>{e.line}</q>
            <div className="lb-ed-block">
              <small>What triggers it</small>
              <p>{e.trigger}</p>
            </div>
            <div className="lb-ed-block">
              <small>Reached by</small>
              {tally ? (
                crews.length ? (
                  <ul className="lb-chips">
                    {crews.map((c) => (
                      <li key={c.id}>
                        {c.name}
                        <b>×{tally[c.id]?.[sel]}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No crew in this sample reaches it. It is still reachable by hand.</p>
                )
              ) : (
                <p>Checking…</p>
              )}
            </div>
            <div className="lb-ed-share">
              <b>{tally ? pct(sel) : "…"}</b>
              <span>of sample runs</span>
            </div>
          </div>
        </article>

        <div className="lb-ed-list" role="radiogroup" aria-label="Choose an ending" ref={list} onKeyDown={onKey}>
          {ENDING_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={sel === id}
              tabIndex={sel === id ? 0 : -1}
              className={`tier-${ENDINGS[id].tier}${sel === id ? " on" : ""}`}
              onClick={() => setSel(id)}
            >
              <i aria-hidden="true" />
              <span>
                <small>{ENDINGS[id].tierLabel}</small>
                {ENDINGS[id].name}
              </span>
              <em>{tally ? pct(id) : ""}</em>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
