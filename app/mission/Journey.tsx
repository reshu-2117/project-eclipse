"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CLOCKS, ECLIPSE, EVENTS, ROUTES, dvLeft, iceClock, options } from "@/lib/game";
import type { Action, Delta, EventId, GameState, LedgerEntry } from "@/lib/game";
import { ARRIVE, DISTRESS, type VoiceLine } from "@/lib/game/data/story";
import CardArt from "./CardArt";
import FlightMap from "./FlightMap";
import type { Sound } from "./audio";

const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

interface Pending {
  from: number;
  index: number;
  cardId: EventId;
  choiceId: string;
}

interface Chip {
  text: string;
  tone: "cost" | "gain";
}

function chips(d: Delta | undefined): Chip[] {
  if (!d) return [];
  const out: Chip[] = [];
  const add = (label: string, n: number | undefined, unit: string, goodWhenPositive: boolean) => {
    if (!n) return;
    const sign = n > 0 ? "+" : "−";
    out.push({ text: `${label} ${sign}${r0(Math.abs(n))} ${unit}`.trim(), tone: n > 0 === goodWhenPositive ? "gain" : "cost" });
  };
  add("Δv", d.dv, "m/s", true);
  add("Fuel", d.fuelKg, "kg", true);
  add("Time", d.hours ? Math.round(d.hours * 10) / 10 : 0, "h", false);
  add("Energy", d.kwh, "kWh", true);
  add("Hull", d.hull, "", true);
  add("Evidence", d.evidence, "", true);
  return out;
}

/** A 0 to 36 hour strip showing the Eclipse, where you are now, and where you will arrive. */
function EclipseStrip({ now, arrive }: { now: number; arrive: number }) {
  const span = CLOCKS.iceBriefedH;
  const p = (h: number) => `${Math.max(0, Math.min(100, (h / span) * 100))}%`;
  const windows: [number, number][] = [];
  for (let s = ECLIPSE.startH; s < span; s += ECLIPSE.periodH) windows.push([s, Math.min(span, s + ECLIPSE.lengthH)]);
  return (
    <div className="jn-strip">
      <div className="jn-strip-bar" role="img" aria-label={`Mission hour ${r1(now)}. The Eclipse runs from hour ${ECLIPSE.startH} to ${ECLIPSE.startH + ECLIPSE.lengthH}.`}>
        {windows.map(([a, b]) => (
          <i key={a} style={{ left: p(a), width: `${((b - a) / span) * 100}%` }} />
        ))}
        <em className="now" style={{ left: p(now) }}>
          <u>now</u>
        </em>
        <em className="arrive" style={{ left: p(arrive) }}>
          <u>dock</u>
        </em>
      </div>
      <p>
        Hours 0 to {span}. The shaded band is the Eclipse: the whole network dims for {ECLIPSE.lengthH} hours, comms slow to a quarter and the mirrors cool.
      </p>
    </div>
  );
}

export default function Journey({
  game,
  act,
  sound,
  say,
  onRebuild,
}: {
  game: GameState;
  act: (a: Action) => string | null;
  sound: Sound;
  say: (line: VoiceLine) => void;
  onRebuild: () => void;
}) {
  const n = game.deck.length;
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<{ id: string; text: string } | null>(null);

  const card = pending ? EVENTS[pending.cardId] : game.phase === "journey" ? EVENTS[game.deck[game.card]] : null;
  const mode: "card" | "result" | "arrival" = pending ? "result" : game.phase === "journey" ? "card" : "arrival";
  const idx = pending ? pending.index : Math.min(game.card, n - 1);
  const progress = mode === "arrival" ? 1 : (idx + 1) / (n + 1);
  const route = game.route ? ROUTES[game.route] : null;

  const opts = useMemo(() => (mode === "card" ? options(game) : []), [game, mode]);
  const entries: LedgerEntry[] = pending ? game.log.slice(pending.from) : [];
  const main = card ? entries.find((e) => e.title.startsWith(`${card.title}:`)) : undefined;
  const others = entries.filter((e) => e !== main && e.title !== "Docked at Lantern 17");

  // a card arrives with a flip; another crew's mayday comes over the radio
  const cardId = mode === "card" ? card?.id : null;
  useEffect(() => {
    if (!cardId) return;
    sound.flip();
    if (cardId === "E4") {
      const t = window.setTimeout(() => {
        sound.radio();
        say(DISTRESS);
      }, 500);
      return () => window.clearTimeout(t);
    }
  }, [cardId, sound, say]);

  const hullHit = main?.delta?.hull ?? 0;
  useEffect(() => {
    if (pending && hullHit < 0) sound.alarm();
  }, [pending, hullHit, sound]);

  useEffect(() => {
    if (mode !== "arrival") return;
    sound.thump(0.5);
    const t = window.setTimeout(() => say(ARRIVE), 700);
    return () => window.clearTimeout(t);
  }, [mode, sound, say]);

  const choose = (choiceId: string) => {
    if (!card) return;
    const before = game.log.length;
    const reason = act({ type: "card", choice: choiceId });
    if (reason) {
      sound.reject();
      setFlash({ id: choiceId, text: reason });
      return;
    }
    sound.lock();
    setFlash(null);
    setPending({ from: before, index: game.card, cardId: card.id, choiceId });
  };

  const dock = game.log.find((e) => e.title === "Docked at Lantern 17");
  const journeyLog = game.log.filter((e) => e.phase === "journey" || e.title.startsWith("Route:"));
  const arriveEst = game.arrivedT ?? game.t + game.flightLeftH + game.dockDelayH;

  return (
    <div className="jn">
      <header className="jn-head">
        <p className="eyebrow">
          {route ? route.name : "Flight"} <b>{"//"}</b> {mode === "arrival" ? "Arrived" : `Event ${Math.min(idx + 1, n)} of ${n}`}
        </p>
        <h1 className="display">
          {mode === "arrival" ? (
            <>
              Docked at <em>Lantern 17.</em>
            </>
          ) : (
            <>
              En route to <em>Lantern 17.</em>
            </>
          )}
        </h1>
      </header>

      <div className="jn-grid">
        <div className="jn-left">
          <div className="rt-map">
            <FlightMap route={game.route} progress={progress} caption="Your ship on its way to Lantern 17" />
          </div>
          <ol className="jn-pips" aria-label="Events on this flight">
            {game.deck.map((id, i) => {
              const revealed = mode === "arrival" || i <= idx;
              const done = mode === "arrival" || i < idx || (i === idx && mode !== "card");
              return (
                <li key={i} className={done ? "done" : i === idx ? "on" : ""}>
                  <span>{i + 1}</span>
                  {revealed ? EVENTS[id].title : "Unknown"}
                </li>
              );
            })}
          </ol>
          <EclipseStrip now={game.t} arrive={arriveEst} />
        </div>

        <div className="jn-right">
          {mode === "card" && card && (
            <article className="jn-card" key={card.id}>
              <CardArt id={card.id} />
              <div className="jn-card-body">
                <div className="jn-card-top">
                  <h2>{card.title}</h2>
                  <i className={`hg-tag ${card.source}`}>{card.source === "real" ? "REAL" : card.source === "game" ? "GAME VALUE" : "FICTION"}</i>
                </div>
                <p className="jn-text">{card.text}</p>
                {card.real && <p className="hg-anchor">{card.real}</p>}
                <div className="jn-choices" role="group" aria-label="Your choices">
                  {card.choices.map((c) => {
                    const o = opts.find((x) => x.action.type === "card" && x.action.choice === c.id);
                    const locked = o ? !o.ok : false;
                    const why = flash?.id === c.id ? flash.text : locked ? o?.reason : null;
                    return (
                      <div key={c.id} className="hg-optwrap">
                        <button type="button" className={`hg-opt jn-choice${locked ? " locked" : ""}`} aria-disabled={locked || undefined} onClick={() => choose(c.id)}>
                          <span className="hg-opt-top">
                            <b>{c.label}</b>
                          </span>
                          <span className="hg-cost">{c.outcome}</span>
                          {locked && <span className="hg-locked">{why}</span>}
                        </button>
                        {!locked && flash?.id === c.id && (
                          <p className="hg-reason" role="alert">
                            {flash.text}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          )}

          {mode === "result" && card && (
            <article className="jn-card jn-result">
              <CardArt id={card.id} />
              <div className="jn-card-body">
                <p className="eyebrow">
                  {card.title} <b>{"//"}</b> You chose
                </p>
                <h2>{card.choices.find((c) => c.id === pending!.choiceId)?.label}</h2>
                <p className="jn-text">{main ? main.text : ""}</p>
                {chips(main?.delta).length > 0 && (
                  <ul className="jn-chips" aria-label="What it cost">
                    {chips(main?.delta).map((c) => (
                      <li key={c.text} className={c.tone}>
                        {c.text}
                      </li>
                    ))}
                  </ul>
                )}
                {others.map((e) => (
                  <p key={e.n} className={`jn-also ${e.kind}`}>
                    <b>{e.title}.</b> {e.text}
                  </p>
                ))}
                <p className="jn-teach">{card.teaches}</p>
                <button
                  type="button"
                  className="btn btn-lantern"
                  onClick={() => {
                    sound.click();
                    setPending(null);
                  }}
                >
                  {game.phase === "station" ? "Dock at Lantern 17" : "Fly on"} <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          )}

          {mode === "arrival" && (
            <article className="jn-card jn-arrival">
              <div className="jn-card-body">
                <p className="eyebrow">
                  Hour {r1(game.t)} <b>{"//"}</b> Ice clock T−{r1(iceClock(game))} h
                </p>
                <h2>You are on the station.</h2>
                <p className="jn-text">{dock ? dock.text : "You have docked at Lantern 17."}</p>
                <ul className="ms-launched-stats jn-stats">
                  <li>
                    <b>{r0(dvLeft(game))}</b>
                    <span>m/s of Δv left</span>
                  </li>
                  <li>
                    <b>{r0(game.energyKwh)}</b>
                    <span>kWh stored</span>
                  </li>
                  <li>
                    <b>{game.hull}</b>
                    <span>hull, out of 100</span>
                  </li>
                </ul>
                <p className="ms-gate-fine">
                  Surveying the station, reading its clues and making the big choice are the next part of this build. You can watch a full mission play out in the Mission Lab.
                </p>
                <div className="ms-gate-actions">
                  <Link href="/lab" className="btn btn-lantern">
                    Watch a mission in the Mission Lab <span aria-hidden="true">↗</span>
                  </Link>
                  <button type="button" className="btn btn-ghost" onClick={onRebuild}>
                    Build a different ship
                  </button>
                </div>
              </div>
            </article>
          )}

          <section className="jn-log" aria-label="Flight log">
            <h3 className="hg-h3">Flight log</h3>
            <ol>
              {journeyLog.map((e) => (
                <li key={e.n} className={e.kind}>
                  <span>T+{r1(e.t)}</span>
                  <b>{e.title}</b>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
