"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";

const N = 24;
const TARGET = 16; // Lantern 17 (zero-based index)
const RX = 0.44; // orbit radius as a fraction of the stage
const RY = 0.11;
const TILT = (-10 * Math.PI) / 180;

export default function Hero({ lit17 }: { lit17: boolean }) {
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);

  // Orbit loop: the Lanterns circle the planet, passing behind and in front of it.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = stage.clientWidth;
    const ro = new ResizeObserver(() => {
      size = stage.clientWidth;
      if (reduce) place(0);
    });
    ro.observe(stage);

    const ct = Math.cos(TILT);
    const st = Math.sin(TILT);
    const t0 = performance.now();
    let raf = 0;

    function place(elapsed: number) {
      const base = 0.9 + elapsed * 0.00006;
      for (let i = 0; i < N; i++) {
        const el = dots.current[i];
        if (!el) continue;
        const a = base + (i * Math.PI * 2) / N;
        const dx = RX * Math.cos(a) * size;
        const dy = RY * Math.sin(a) * size;
        const x = dx * ct - dy * st;
        const y = dx * st + dy * ct;
        const s = Math.sin(a);
        const front = s > 0;
        const depth = (s + 1) / 2;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(0.7 + depth * 0.45).toFixed(3)})`;
        el.style.zIndex = front ? "6" : "2";
        el.style.opacity = front ? "1" : (0.35 + depth * 0.6).toFixed(2);
      }
    }

    function loop(now: number) {
      place(now - t0);
      raf = requestAnimationFrame(loop);
    }

    if (reduce) place(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Flashlight: your light reveals the sunless world.
  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const hero = heroRef.current;
    if (!hero) return;
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--mx", `${e.clientX - r.left}px`);
    hero.style.setProperty("--my", `${e.clientY - r.top}px`);
  }

  const veilStyle = { "--veil": lit17 ? 0.62 : 0.8 } as CSSProperties;

  return (
    <section ref={heroRef} className="hero" id="top" onPointerMove={onPointerMove} aria-labelledby="hero-title">
      <div className="sky" aria-hidden="true" />

      <div aria-hidden="true">
        <span className="debris debris-0 drift-a" style={{ width: 70, height: 70, top: "18%", left: 0 }} />
        <span className="debris debris-2 drift-b far" style={{ width: 40, height: 40, top: "64%", left: 0, animationDelay: "-30s" }} />
        <span className="debris debris-1 drift-c" style={{ width: 110, height: 110, top: "72%", left: 0, animationDelay: "-12s" }} />
        <span className="debris debris-0 drift-b far" style={{ width: 28, height: 28, top: "34%", left: 0, animationDelay: "-52s" }} />
        <span className="debris debris-2 drift-a far" style={{ width: 22, height: 22, top: "8%", left: 0, animationDelay: "-20s" }} />
      </div>

      <div className="veil" style={veilStyle} aria-hidden="true" />

      <div className="wrap hero-grid">
        <div className="hero-copy reveal">
          <p className="eyebrow">
            Mission 001 <b>{"//"}</b> Lantern 17 repair
          </p>
          <h1 className="display" id="hero-title">
            There was no sunrise on this world.
            <em>So they built one.</em>
          </h1>
          <p className="lede">
            A rogue planet drifting without a star, kept alive by a ring of orbital Lanterns. One of them has gone
            dark. You are the engineer sent to bring it back: design the spacecraft, choose the science, and
            relight Lantern 17.
          </p>
          <div className="hero-actions">
            <a className="btn btn-lantern" href="#mission">
              Begin mission <span aria-hidden="true">↗</span>
            </a>
            <a className="btn btn-ghost" href="#world">
              Explore the planet <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-caption">A fictional world. Real engineering questions.</p>
        </div>

        <div className="stage" ref={stageRef}>
          <svg className="orbit-svg orbit-back" viewBox="0 0 100 100" aria-hidden="true">
            <g transform="rotate(-10 50 50)">
              <path d="M 6 50 A 44 11 0 0 1 94 50" stroke="#FFB547" strokeOpacity="0.22" strokeWidth="0.25" strokeDasharray="0.6 0.9" fill="none" />
            </g>
          </svg>

          <div className="planet" aria-hidden="true">
            <div className="planet-shade" />
          </div>

          <svg className="orbit-svg orbit-front" viewBox="0 0 100 100" aria-hidden="true">
            <g transform="rotate(-10 50 50)">
              <path d="M 94 50 A 44 11 0 0 1 6 50" stroke="#FFB547" strokeOpacity="0.45" strokeWidth="0.25" fill="none" />
            </g>
          </svg>

          {Array.from({ length: N }, (_, i) => {
            const isTarget = i === TARGET;
            const cls = isTarget ? (lit17 ? "lantern lantern-reborn" : "lantern lantern-dead") : "lantern";
            return (
              <span
                key={i}
                ref={(el) => {
                  dots.current[i] = el;
                }}
                className={cls}
                style={{ "--d": `${(i % 6) * 0.55}s` } as CSSProperties}
              >
                {isTarget && (
                  <a href="#mission" className={lit17 ? "lantern-tag ok" : "lantern-tag"}>
                    <i className={lit17 ? "dot dot-amber" : "dot dot-ember"} />
                    L-17 · {lit17 ? "RELIT" : "OFFLINE"}
                  </a>
                )}
              </span>
            );
          })}

          <p className="planet-label" style={{ left: "6%", top: "10%" }}>
            <b>+</b> ECLIPSE-01 · ROGUE PLANET
          </p>
          <p className="planet-label" style={{ right: "4%", bottom: "12%", textAlign: "right" }}>
            NO STAR · NO SUNRISE
            <br />
            <b>SUBSURFACE OCEAN</b> · TRACES OF LIFE
          </p>
        </div>
      </div>

      <p className="hint" aria-hidden="true">
        Move your light across the dark
      </p>
    </section>
  );
}
