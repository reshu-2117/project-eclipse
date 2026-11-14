"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";

const N = 24;
const TARGET = 16; // Lantern 17 (zero-based index)
const BASE_TILT = (-10 * Math.PI) / 180;

/**
 * Every Lantern has its own orbit: a different size, eccentricity, tilt and speed, with the planet at
 * the focus of each ellipse. Seeded, so the sky is the same on every visit. Sizes are fractions of
 * the stage width; speed follows Kepler's third law (small orbits run faster).
 */
interface HeroOrbit {
  a: number;
  e: number;
  /** direction of the closest point, rad (each orbit points a different way) */
  w: number;
  /** how edge-on the orbit is to the viewer, 0 to 1 */
  k: number;
  tilt: number;
  phase: number;
  speed: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORBITS: HeroOrbit[] = (() => {
  const rnd = mulberry32(0x17e1195e);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  return Array.from({ length: N }, (_, i) => {
    if (i === TARGET) {
      // Lantern 17: a clear ellipse, starting on the near side of the planet
      return { a: 0.4, e: 0.22, w: 0, k: 0.26, tilt: BASE_TILT, phase: 2.4, speed: 0.00006 * Math.pow(0.44 / 0.4, 1.5) };
    }
    const a = between(0.27, 0.39);
    return {
      a,
      e: between(0.06, 0.3),
      w: between(0, Math.PI * 2),
      k: between(0.12, 0.45),
      tilt: BASE_TILT + between(-0.5, 0.5),
      phase: between(0, Math.PI * 2),
      speed: 0.00006 * Math.pow(0.44 / a, 1.5),
    };
  });
})();

function kepler(M: number, e: number) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/**
 * Point on an orbit at eccentric anomaly E: stage fractions from the planet's centre, plus `v`, how
 * far the point is toward (+) or away from (-) the viewer, which decides front and back.
 */
function orbitPoint(o: HeroOrbit, E: number): { x: number; y: number; v: number } {
  const u0 = o.a * (Math.cos(E) - o.e);
  const v0 = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const cw = Math.cos(o.w);
  const sw = Math.sin(o.w);
  const u = u0 * cw - v0 * sw;
  const v = u0 * sw + v0 * cw;
  const ct = Math.cos(o.tilt);
  const st = Math.sin(o.tilt);
  const sy = v * o.k;
  return { x: u * ct - sy * st, y: u * st + sy * ct, v };
}

/** SVG paths (viewBox 0..100) for the parts of an orbit in front of, and behind, the planet. */
function orbitPaths(o: HeroOrbit) {
  const steps = 120;
  const pts = Array.from({ length: steps + 1 }, (_, k) => orbitPoint(o, (k / steps) * Math.PI * 2));
  let front = "";
  let back = "";
  let prevHalf = "";
  for (let k = 0; k < steps; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const half = a.v + b.v > 0 ? "front" : "back";
    const seg = `${prevHalf === half ? "" : `M${(50 + a.x * 100).toFixed(2)} ${(50 + a.y * 100).toFixed(2)} `}L${(50 + b.x * 100).toFixed(2)} ${(50 + b.y * 100).toFixed(2)} `;
    if (half === "front") front += seg;
    else back += seg;
    prevHalf = half;
  }
  return { front, back };
}

const PATHS = ORBITS.map(orbitPaths);
const OTHER_BACK = PATHS.filter((_, i) => i !== TARGET).map((p) => p.back).join(" ");
const OTHER_FRONT = PATHS.filter((_, i) => i !== TARGET).map((p) => p.front).join(" ");
const TARGET_BACK = PATHS[TARGET].back;
const TARGET_FRONT = PATHS[TARGET].front;

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

    const t0 = performance.now();
    let raf = 0;

    function place(elapsed: number) {
      for (let i = 0; i < N; i++) {
        const el = dots.current[i];
        if (!el) continue;
        const o = ORBITS[i];
        const E = kepler(o.phase + elapsed * o.speed, o.e);
        const p = orbitPoint(o, E);
        const s = Math.max(-1, Math.min(1, p.v / (o.a * (1 + o.e))));
        const front = s > 0;
        const depth = (s + 1) / 2;
        el.style.transform = `translate3d(${(p.x * size).toFixed(1)}px, ${(p.y * size).toFixed(1)}px, 0) scale(${(0.7 + depth * 0.45).toFixed(3)})`;
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
            <path d={OTHER_BACK} stroke="#FFB547" strokeOpacity="0.07" strokeWidth="0.18" fill="none" />
            <path d={TARGET_BACK} stroke="#FFB547" strokeOpacity="0.24" strokeWidth="0.25" strokeDasharray="0.6 0.9" fill="none" />
          </svg>

          <div className="planet" aria-hidden="true">
            <div className="planet-shade" />
          </div>

          <svg className="orbit-svg orbit-front" viewBox="0 0 100 100" aria-hidden="true">
            <path d={OTHER_FRONT} stroke="#FFB547" strokeOpacity="0.14" strokeWidth="0.18" fill="none" />
            <path d={TARGET_FRONT} stroke="#FFB547" strokeOpacity="0.5" strokeWidth="0.25" fill="none" />
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
