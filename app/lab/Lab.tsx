"use client";

import "./lab.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ENDING_ORDER, EVENT_IDS, ROUTE_ORDER, STRATEGIES } from "@/lib/game";
import PlanetCanvas from "../components/PlanetCanvas";
import type { PlanetLight } from "../components/heroPlanet";
import { useReducedMotion } from "../mission/Opening";
import { Crews, Endings } from "./Crews";
import Playground from "./Playground";
import Proofs, { useProofs } from "./Proofs";
import Rules from "./Rules";
import Ships from "./Ships";
import { TEST_COUNT } from "./facts";
import { computeTally, type Tally } from "./tally";

const SECTIONS: [string, string][] = [
  ["proofs", "Proofs"],
  ["rocket", "Rocket equation"],
  ["ships", "Ships"],
  ["crews", "Crews"],
  ["endings", "Endings"],
  ["rules", "Rules"],
];

/** Lanterns pooled around Eclipse-01, so the planet is lit the way it is on the home page. */
const LIGHTS: PlanetLight[] = Array.from({ length: 18 }, (_, i) => {
  const a = i * 2.399963;
  return { x: Math.cos(a) * 1.36, y: Math.sin(a) * 1.36, z: 0.6 + 0.8 * Math.sin(i * 1.7 + 0.5), power: 0.21, color: [1.0, 0.58, 0.25] as const };
});

export default function Lab() {
  const reduce = useReducedMotion();
  const proofs = useProofs();
  const [tally, setTally] = useState<Tally | null>(null);
  const [active, setActive] = useState("proofs");

  // working out how every crew fares on several decks takes a moment, so the page paints first
  useEffect(() => {
    const id = window.setTimeout(() => setTally(computeTally()), 80);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const passed = proofs.filter((p) => p.ok).length;
  const stats = [
    { big: `${passed} / ${proofs.length}`, small: "physics numbers re-derived and matching" },
    { big: String(TEST_COUNT), small: "automatic tests, all passing" },
    { big: String(STRATEGIES.length), small: "scripted crews that fly whole missions" },
    { big: String(ENDING_ORDER.length), small: "endings, every one reachable" },
  ];

  return (
    <div className="lb">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="lb-nav">
        <Link href="/" className="lb-back">
          <span aria-hidden="true" /> Project Eclipse
        </Link>
        <nav aria-label="Sections">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? "on" : ""} aria-current={active === id ? "location" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <Link href="/mission" className="btn btn-lantern lb-play-btn">
          Play<span className="lb-hide-sm"> the mission</span> <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main id="main">
        <section className="lb-hero">
          <div className="lb-hero-copy">
            <p className="eyebrow">
              Mission Lab <b>{"//"}</b> The engine, in the open
            </p>
            <h1 className="display">
              Every number in the game, <em>checked in public.</em>
            </h1>
            <p className="lb-lede">
              Project Eclipse is built on one engine: the rocket equation, five routes, {EVENT_IDS.length} event cards, Lantern 17&apos;s six zones and {ENDING_ORDER.length} endings. This page runs that same engine in your browser, so you can see where each number comes from, play with it, and watch whole missions fly.
            </p>
            <div className="lb-hero-actions">
              <Link href="/mission" className="btn btn-lantern">
                Play the mission <span aria-hidden="true">↗</span>
              </Link>
              <a href="#proofs" className="btn btn-ghost">
                See the proofs <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div className="lb-hero-planet" aria-hidden="true">
            <PlanetCanvas lights={LIGHTS} reduce={reduce} elevation={0.3} spinRate={0.05} className="lb-planet" />
            <p className="lb-planet-tag">
              ECLIPSE-01 · ROGUE PLANET <b>·</b> NO STAR <b>·</b> {ROUTE_ORDER.length} ROUTES TO LANTERN 17
            </p>
          </div>
        </section>

        <ul className="lb-stats" aria-label="The engine in numbers">
          {stats.map((s) => (
            <li key={s.small}>
              <b>{s.big}</b>
              <span>{s.small}</span>
            </li>
          ))}
        </ul>

        <Proofs />
        <Playground />
        <Ships />
        <Crews tally={tally} />
        <Endings tally={tally} />
        <Rules />
      </main>

      <footer className="lb-foot">
        <p>
          Values tagged <i className="hg-tag game">GAME VALUE</i> in the code are our own balance choices, not NASA data, and the ice-specific push and the fusion Lantern are extrapolation and fiction. Project Eclipse uses a fictional planetary system and future technology. Its mission choices are inspired by real orbital mechanics, spacecraft engineering, energy limits and proposed remote-deflection physics. Values are simplified for learning.
        </p>
        <p>
          Built for NASA Space Apps 2026, Space Mission Design Game. Code written with Claude Code; voices generated with ElevenLabs (AI). Source: <a href="https://github.com/reshu-2117/project-eclipse">github.com/reshu-2117/project-eclipse</a>.
        </p>
      </footer>
    </div>
  );
}
