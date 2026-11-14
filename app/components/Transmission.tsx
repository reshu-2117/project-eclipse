"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LINES: { text: string; cls?: string }[] = [
  { text: "> INCOMING // CONTROL → FIELD ENGINEER", cls: "t-sys" },
  { text: "> Signal locked. Stand by." , cls: "t-sys" },
  { text: "" },
  { text: "Lantern 17 has gone dark." },
  { text: "Ice debris struck its collector array." },
  { text: "Below it, the surface is already freezing." },
  { text: "" },
  { text: "You are the only engineer close enough." },
  { text: "Design the mission. Bring the light back.", cls: "t-warm" },
];

const STARTS = LINES.map((_, i) => LINES.slice(0, i).reduce((n, l) => n + l.text.length + 1, 0));
const TOTAL = LINES.reduce((n, l) => n + l.text.length + 1, 0);
const BARS = Array.from({ length: 28 }, (_, i) => ({
  delay: `${((i * 37) % 90) / 100}s`,
  dur: `${0.6 + ((i * 13) % 50) / 100}s`,
}));

export default function Transmission() {
  const [typed, setTyped] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const play = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTyped(TOTAL);
      return;
    }
    setTyped(0);
    setRunning(true);
    timer.current = window.setInterval(() => {
      setTyped((t) => {
        const next = t + 1;
        if (next >= TOTAL) {
          if (timer.current) window.clearInterval(timer.current);
          timer.current = null;
          setRunning(false);
          return TOTAL;
        }
        return next;
      });
    }, 34);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [play]);

  // Split the typed character budget across lines.
  const shown = LINES.map((l, i) => {
    const take = Math.max(0, Math.min(l.text.length, typed - STARTS[i]));
    return { ...l, visible: l.text.slice(0, take), reached: typed >= STARTS[i] };
  });
  const lastStarted = shown.reduce((last, l, i) => (l.reached && typed > 0 ? i : last), 0);

  return (
    <section className="section" id="briefing" aria-labelledby="brief-title">
      <div className="wrap brief-layout">
        <div className="section-head reveal" style={{ marginBottom: 0 }}>
          <p className="eyebrow">
            Mission briefing <b>{"//"}</b> Priority one
          </p>
          <h2 className="display" id="brief-title">
            A silent world. <em>An extraordinary responsibility.</em>
          </h2>
          <p className="lede">
            Control can reach you, but it can&apos;t reach the Lantern. Every system on your spacecraft is a choice:
            what you carry, how you power it, how long you stay. Get the trade-offs right and the light comes back.
          </p>
          <p className="eyebrow" style={{ marginTop: 8 }}>
            Your first objective: <b>define the mission</b>
          </p>
        </div>

        <div className="terminal reveal" ref={ref}>
          <div className="term-bar">
            <span>CH-17 · DEEP SPACE RELAY</span>
            <span className={running ? "wave" : "wave idle"} aria-hidden="true">
              {BARS.map((b, i) => (
                <i key={i} style={{ animationDelay: b.delay, animationDuration: b.dur }} />
              ))}
            </span>
          </div>
          <div className="term-body" aria-live="off">
            <span className="sr-only">{LINES.map((l) => l.text).join(" ")}</span>
            <span aria-hidden="true">
              {shown.map((l, i) =>
                l.reached && typed > 0 ? (
                  <span key={i} className={l.cls}>
                    {l.visible}
                    {i === lastStarted && <span className="caret" />}
                    {"\n"}
                  </span>
                ) : null,
              )}
              {typed === 0 && <span className="caret" />}
            </span>
          </div>
          <div className="term-foot">
            <button type="button" className="btn btn-ghost" onClick={play}>
              Replay transmission
            </button>
            <a className="btn btn-lantern" href="#mission">
              Design the mission <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
