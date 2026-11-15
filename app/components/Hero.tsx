"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import Link from "next/link";
import { createPlanetRenderer, type PlanetLight, type PlanetRenderer } from "./heroPlanet";

const PLANES = 3;
const PER_PLANE = 8;
const N = PLANES * PER_PLANE;
const TARGET = 16; // Lantern 17 (zero-based index)

/**
 * The Lanterns fly a Walker Delta constellation, 56°:24/3/1 — the same pattern as the Galileo
 * navigation satellites. 24 Lanterns share one circular altitude in 3 orbital planes inclined 56° to the
 * equator, ascending nodes 120° apart, 8 Lanterns evenly spaced in each plane. The phasing factor F = 1
 * offsets neighbouring planes by 360°·F/24 = 15°, which keeps every Lantern clear of every other where
 * the planes cross. One altitude means one period, so the whole network turns as a rigid lattice and
 * every Lantern stays exactly on its own ring.
 *
 * Positions are a pure function of time and the same projection draws the rings, the trails and the
 * Lanterns, so a Lantern can never drift off its line.
 */
const INCLINATION = (56 * Math.PI) / 180;
const PHASING = 1;
/** orbit radius, as a fraction of the stage width (the planet's radius is 0.29) */
const RADIUS = 0.41;
const PLANET_RADIUS = 0.29;
/** right ascension of the first plane's ascending node, chosen for the composition */
const RAAN0 = (-18 * Math.PI) / 180;
/** camera elevation above the equator, and roll of the whole system on screen */
const ELEVATION = (17 * Math.PI) / 180;
const ROLL_DEG = 11;
const ROLL = (ROLL_DEG * Math.PI) / 180;
/** one orbit, ms */
const PERIOD = 96_000;
const OMEGA = (Math.PI * 2) / PERIOD;
/** where the clock starts, as a fraction of an orbit: Lantern 17 begins on the near side, lower left */
const EPOCH = 0.86;
/** length of a Lantern's light trail along its ring, rad */
const TRAIL = (24 * Math.PI) / 180;

const AMBER = "255, 181, 71";

/** the planet turns once every 160 s, the same way its Lanterns travel */
const SPIN_PERIOD = 160_000;
/** the GL planet canvas reaches 1.25 planet radii, leaving room for the lit haze */
const PLANET_EXTENT = 1.25;
/** the shader has no fine edges besides the limb, so it renders at up to 1.5x to stay cheap on laptops and phones */
const PLANET_DPR = 1.5;
/** Lantern light on the ice: power at full output, in planet-radius units */
const LANTERN_POWER = 0.16;
/** light colours, linear RGB: a warm white for working Lanterns, ember for Lantern 17's dying glow */
const WARM_WHITE: readonly [number, number, number] = [1.0, 0.58, 0.25];
const EMBER_LIGHT: readonly [number, number, number] = [1.0, 0.144, 0.024];
/** ice-damaged Lanterns run at reduced output, as shown on the Lantern Network board */
const OUTPUT: Record<number, number> = { 8: 0.64, 15: 0.41, 17: 0.52 };

/** Lantern 17's failing collector: mostly a faint ember, with the same stutter as its marker. */
function emberFlicker(elapsed: number) {
  const f = (elapsed % 2600) / 2600;
  return (f > 0.46 && f < 0.5) || (f > 0.53 && f < 0.57) ? 0.2 : 1;
}

interface Plane {
  /** node direction and in-plane normal, in world space (x right, y north, z toward the viewer) */
  n: [number, number, number];
  m: [number, number, number];
}

const PLANE_AXES: Plane[] = Array.from({ length: PLANES }, (_, p) => {
  const raan = RAAN0 + (p * Math.PI * 2) / PLANES;
  const n: [number, number, number] = [Math.cos(raan), 0, -Math.sin(raan)];
  const ci = Math.cos(INCLINATION);
  const si = Math.sin(INCLINATION);
  // perpendicular to n in the equator (prograde: the near side moves left, with the planet's surface), tilted by i
  const m: [number, number, number] = [Math.sin(raan) * ci, si, Math.cos(raan) * ci];
  return { n, m };
});

/** argument of latitude of each Lantern at t = 0 (Walker phasing) */
const SLOT = Array.from({ length: N }, (_, i) => {
  const p = Math.floor(i / PER_PLANE);
  const s = i % PER_PLANE;
  return (s * Math.PI * 2) / PER_PLANE + (p * PHASING * Math.PI * 2) / N;
});

const CE = Math.cos(ELEVATION);
const SE = Math.sin(ELEVATION);
const CR = Math.cos(ROLL);
const SR = Math.sin(ROLL);

/**
 * Screen position of argument of latitude `u` on plane `p`: x, y in stage fractions from the planet's
 * centre (y down), and depth d from -1 (far side) to 1 (near side).
 */
function project(p: number, u: number) {
  const { n, m } = PLANE_AXES[p];
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const wx = cu * n[0] + su * m[0];
  const wy = cu * n[1] + su * m[1];
  const wz = cu * n[2] + su * m[2];
  // camera above the equator: far points rise on screen
  const y1 = wy * CE - wz * SE;
  const z1 = wy * SE + wz * CE;
  // roll
  const x2 = wx * CR - y1 * SR;
  const y2 = wx * SR + y1 * CR;
  return { x: x2 * RADIUS, y: -y2 * RADIUS, d: z1 };
}

function lanternAngle(i: number, elapsed: number) {
  return SLOT[i] + (EPOCH * PERIOD + elapsed) * OMEGA;
}

/** Hidden behind the planet: on the far side and inside the planet's disc. */
function occluded(x: number, y: number, d: number) {
  return d < 0 && x * x + y * y < PLANET_RADIUS * PLANET_RADIUS;
}

/** Brightness falls off toward the far side, so the lattice reads in depth. */
function depthAlpha(d: number) {
  const t = (d + 1) / 2;
  return 0.3 + 0.7 * t * t;
}

/** Soft glowing Lantern, drawn once and stamped every frame. */
function makeSprite(dpr: number) {
  const r = 18;
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(r * 2 * dpr);
  const g = c.getContext("2d");
  if (!g) return c;
  g.scale(dpr, dpr);
  const glow = g.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${AMBER}, 0.55)`);
  glow.addColorStop(0.22, `rgba(${AMBER}, 0.22)`);
  glow.addColorStop(0.55, `rgba(${AMBER}, 0.06)`);
  glow.addColorStop(1, `rgba(${AMBER}, 0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, r * 2, r * 2);
  const core = g.createRadialGradient(r, r, 0, r, r, 3.6);
  core.addColorStop(0, "rgba(255, 244, 222, 1)");
  core.addColorStop(0.55, `rgba(${AMBER}, 1)`);
  core.addColorStop(1, `rgba(${AMBER}, 0)`);
  g.fillStyle = core;
  g.beginPath();
  g.arc(r, r, 3.6, 0, Math.PI * 2);
  g.fill();
  return c;
}

export default function Hero({ lit17 }: { lit17: boolean }) {
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const planetRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const litRef = useRef(lit17);
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    litRef.current = lit17;
    redrawRef.current();
  }, [lit17]);

  // The constellation: rings, light trails and Lanterns, on a canvas behind the planet and one in front.
  useEffect(() => {
    const stage = stageRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    const planetCanvas = planetRef.current;
    const marker = markerRef.current;
    const anchor = anchorRef.current;
    if (!stage || !back || !front || !planetCanvas || !marker || !anchor) return;
    const bctx = back.getContext("2d");
    const fctx = front.getContext("2d");
    if (!bctx || !fctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = 0;
    let dpr = 1;
    let sprite = makeSprite(1);
    // the static rings, drawn once per resize
    const ringBack = document.createElement("canvas");
    const ringFront = document.createElement("canvas");
    let flipped = false;

    // The planet: a shader lit by the Lanterns. Until it is ready (or if WebGL is missing) the CSS planet shows.
    let planet: PlanetRenderer | null = null;
    let disposed = false;
    const lights: PlanetLight[] = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, power: 0, color: WARM_WHITE }));
    let lit17Level = litRef.current ? 1 : 0;
    let lastElapsed = 0;
    const img = new Image();
    img.decoding = "async";
    img.src = "/textures/planet_map.jpg";
    img
      .decode()
      .then(() => {
        if (disposed) return;
        planet = createPlanetRenderer(
          planetCanvas,
          { elevation: ELEVATION, roll: ROLL, extent: PLANET_EXTENT },
          img,
          () => {
            planet = null;
            stage.classList.remove("gl-planet");
          },
        );
        if (!planet) return;
        planet.resize(size * PLANET_RADIUS * PLANET_EXTENT * 2, Math.min(window.devicePixelRatio || 1, PLANET_DPR));
        draw(lastElapsed);
        stage.classList.add("gl-planet");
      })
      .catch(() => {});

    function resize() {
      size = stage!.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.round(size * dpr);
      for (const c of [back!, front!, ringBack, ringFront]) {
        c.width = px;
        c.height = px;
      }
      sprite = makeSprite(dpr);
      drawRings();
      planet?.resize(size * PLANET_RADIUS * PLANET_EXTENT * 2, Math.min(dpr, PLANET_DPR));
    }

    function drawRings() {
      const rb = ringBack.getContext("2d");
      const rf = ringFront.getContext("2d");
      if (!rb || !rf) return;
      for (const g of [rb, rf]) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, ringBack.width, ringBack.height);
        g.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);
        g.lineWidth = 1;
        g.lineCap = "round";
      }
      const steps = 360;
      for (let p = 0; p < PLANES; p++) {
        let prev = project(p, 0);
        for (let k = 1; k <= steps; k++) {
          const cur = project(p, (k / steps) * Math.PI * 2);
          const d = (prev.d + cur.d) / 2;
          const g = d > 0 ? rf : rb;
          g.strokeStyle = `rgba(${AMBER}, ${(0.3 * depthAlpha(d)).toFixed(3)})`;
          g.beginPath();
          g.moveTo(prev.x * size, prev.y * size);
          g.lineTo(cur.x * size, cur.y * size);
          g.stroke();
          prev = cur;
        }
      }
    }

    function draw(elapsed: number) {
      for (const [g, rings] of [
        [bctx!, ringBack],
        [fctx!, ringFront],
      ] as const) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, back!.width, back!.height);
        g.drawImage(rings, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);
        g.lineCap = "round";
      }

      const lit = litRef.current;
      // Lantern 17 comes back over a couple of seconds, not in one frame
      const dt = Math.max(0, elapsed - lastElapsed);
      lastElapsed = elapsed;
      lit17Level = reduce ? (lit ? 1 : 0) : lit17Level + ((lit ? 1 : 0) - lit17Level) * (1 - Math.exp(-dt / 900));
      const segs = 18;
      for (let i = 0; i < N; i++) {
        if (i === TARGET && !lit) continue; // a dark Lantern leaves no light behind it
        const p = Math.floor(i / PER_PLANE);
        const u = lanternAngle(i, elapsed);
        // light trail, fading out behind the Lantern along its own ring
        let prev = project(p, u - TRAIL);
        for (let k = 1; k <= segs; k++) {
          const t = k / segs;
          const cur = project(p, u - TRAIL * (1 - t));
          const d = (prev.d + cur.d) / 2;
          const g = d > 0 ? fctx! : bctx!;
          g.strokeStyle = `rgba(${AMBER}, ${(0.62 * t * t * depthAlpha(d)).toFixed(3)})`;
          g.lineWidth = 0.6 + 1.4 * t;
          g.beginPath();
          g.moveTo(prev.x * size, prev.y * size);
          g.lineTo(cur.x * size, cur.y * size);
          g.stroke();
          prev = cur;
        }
      }

      const half = 18;
      for (let i = 0; i < N; i++) {
        const p = Math.floor(i / PER_PLANE);
        const pt = project(p, lanternAngle(i, elapsed));
        const x = pt.x * size;
        const y = pt.y * size;
        // the same Lantern, as a light on the planet (camera space, in planet radii)
        const light = lights[i];
        light.x = pt.x / PLANET_RADIUS;
        light.y = -pt.y / PLANET_RADIUS;
        light.z = (pt.d * RADIUS) / PLANET_RADIUS;
        const output = OUTPUT[i] ?? 1;
        if (i === TARGET) {
          const ember = 0.05 * emberFlicker(elapsed);
          light.power = LANTERN_POWER * (ember + (1 - ember) * lit17Level);
          light.color = lit17Level > 0.5 ? WARM_WHITE : EMBER_LIGHT;
        } else {
          // a scarred collector shimmers a little
          const shimmer = output < 1 ? 0.9 + 0.1 * Math.sin(elapsed / 310 + i * 1.7) : 1;
          light.power = LANTERN_POWER * output * shimmer;
        }
        if (i === TARGET) {
          const scale = 0.84 + 0.26 * ((pt.d + 1) / 2);
          marker!.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;
          marker!.style.zIndex = pt.d > 0 ? "6" : "2";
          marker!.style.opacity = depthAlpha(pt.d).toFixed(3);
          anchor!.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
          // keep the tag on the open side of the Lantern
          if (!flipped && pt.x > 0.16) flipped = true;
          else if (flipped && pt.x < 0.1) flipped = false;
          anchor!.classList.toggle("flip", flipped);
          anchor!.classList.toggle("hidden-side", occluded(pt.x, pt.y, pt.d));
          continue;
        }
        if (occluded(pt.x, pt.y, pt.d)) continue;
        const g = pt.d > 0 ? fctx! : bctx!;
        const s = 0.8 + 0.32 * ((pt.d + 1) / 2);
        g.globalAlpha = depthAlpha(pt.d) * (0.55 + 0.45 * (OUTPUT[i] ?? 1));
        g.drawImage(sprite, x - half * s, y - half * s, half * 2 * s, half * 2 * s);
        g.globalAlpha = 1;
      }
      planet?.render(lights, (elapsed / SPIN_PERIOD) * Math.PI * 2);
    }

    const t0 = performance.now();
    let raf = 0;
    let visible = true;

    function loop(now: number) {
      draw(now - t0);
      raf = visible ? requestAnimationFrame(loop) : 0;
    }

    function start() {
      if (reduce) draw(0);
      else if (!raf) raf = requestAnimationFrame(loop);
    }

    redrawRef.current = () => {
      if (reduce) draw(0);
    };

    resize();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(stage);

    // pause while the hero is off screen
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(stage);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      redrawRef.current = () => {};
      planet?.dispose();
      stage.classList.remove("gl-planet");
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
            A rogue planet drifting without a star, kept alive by a network of orbital Lanterns. One of them is
            failing, with a huge piece of ice on its way. You are one of 300 crews sent to find out why: build the
            spacecraft, read the evidence, and make the hard call.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-lantern" href="/mission">
              Begin mission <span aria-hidden="true">↗</span>
            </Link>
            <Link className="btn btn-ghost" href="/review">
              Review every part of the game <span aria-hidden="true">↗</span>
            </Link>
            <a className="btn btn-ghost" href="#world">
              Explore the planet <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="hero-caption">A fictional world. Real engineering questions.</p>
        </div>

        <div className="stage" ref={stageRef}>
          <canvas className="orbit-canvas orbit-back" ref={backRef} aria-hidden="true" />

          <div className="planet" style={{ transform: `rotate(${-ROLL_DEG}deg)` }} aria-hidden="true">
            <div className="planet-shade" style={{ transform: `rotate(${ROLL_DEG}deg)` }} />
          </div>
          <canvas
            className="planet-gl"
            ref={planetRef}
            aria-hidden="true"
            style={{
              left: `${(50 - PLANET_RADIUS * PLANET_EXTENT * 100).toFixed(3)}%`,
              top: `${(50 - PLANET_RADIUS * PLANET_EXTENT * 100).toFixed(3)}%`,
              width: `${(PLANET_RADIUS * PLANET_EXTENT * 200).toFixed(3)}%`,
              height: `${(PLANET_RADIUS * PLANET_EXTENT * 200).toFixed(3)}%`,
            }}
          />

          <canvas className="orbit-canvas orbit-front" ref={frontRef} aria-hidden="true" />

          <span
            ref={markerRef}
            className={lit17 ? "lantern lantern-reborn" : "lantern lantern-dead"}
            aria-hidden="true"
          />
          <span ref={anchorRef} className="lantern-anchor">
            <a href="/mission" className={lit17 ? "lantern-tag ok" : "lantern-tag"}>
              <i className={lit17 ? "dot dot-amber" : "dot dot-ember"} />
              L-17 · {lit17 ? "RELIT" : "DEGRADED"}
            </a>
          </span>

          <p className="planet-label" style={{ left: "4%", top: "1.5%" }}>
            <b>+</b> ECLIPSE-01 · ROGUE PLANET
          </p>
          <p className="planet-label" style={{ right: "4%", bottom: "1.5%", textAlign: "right" }}>
            NO STAR · NO SUNRISE
            <br />
            <b>FOUR SETTLEMENTS</b> · BENEATH THE ICE
          </p>
        </div>
      </div>

      <p className="hint" aria-hidden="true">
        Move your light across the dark
      </p>
    </section>
  );
}
