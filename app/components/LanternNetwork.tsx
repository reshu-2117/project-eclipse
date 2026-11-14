"use client";

import { useEffect, useRef, useState } from "react";
import { createPlanetRenderer, type PlanetLight, type PlanetRenderer } from "./heroPlanet";

/**
 * The Lantern network around Eclipse-01, the same as the home page: 24 Lanterns on a Walker Delta 56°:24/3/1
 * constellation (the pattern the Galileo satellites fly), three tilted rings, light trails, and the planet shaded
 * by the Lanterns' own light. It is a square stage that fills its box and takes its state as props, so every
 * screen can show the network in the phase of the mission it is in:
 *
 *  - `l17`: Lantern 17 is "failing" (an ember that stutters), "dark", or "lit" again.
 *  - `eclipse`: the Eclipse dims the whole network.
 *
 * Positions are a pure function of time and one projection draws rings, trails and Lanterns, so a Lantern can
 * never drift off its line.
 */

export type L17State = "failing" | "dark" | "lit";

const PLANES = 3;
const PER_PLANE = 8;
const N = PLANES * PER_PLANE;
const TARGET = 16; // Lantern 17, zero-based
const INCLINATION = (56 * Math.PI) / 180;
const PHASING = 1;
const RAAN0 = (-18 * Math.PI) / 180;
const PERIOD = 96_000;
const OMEGA = (Math.PI * 2) / PERIOD;
const EPOCH = 0.86;
const TRAIL = (24 * Math.PI) / 180;
const SPIN_PERIOD = 160_000;
const PLANET_EXTENT = 1.25;
const PLANET_DPR = 1.5;
const LANTERN_POWER = 0.16;
/** the home page's ring-to-planet ratio: lights keep this distance so the planet is shaded the same on every screen */
const HOME_RATIO = 0.41 / 0.29;

const AMBER = "255, 181, 71";
const EMBER = "255, 96, 44";
const WARM: readonly [number, number, number] = [1.0, 0.58, 0.25];
const EMBER_LIGHT: readonly [number, number, number] = [1.0, 0.144, 0.024];
/** ice-damaged Lanterns run at reduced output, as on the Lantern Network board */
const OUTPUT: Record<number, number> = { 8: 0.64, 15: 0.41 };
/** how much light is left in the Eclipse */
const ECLIPSE_LEVEL = 0.26;
/** how much of Lantern 17's light is left in each state */
const L17_LEVEL: Record<L17State, number> = { failing: 0.52, dark: 0.04, lit: 1 };

const PLANE_AXES = Array.from({ length: PLANES }, (_, p) => {
  const raan = RAAN0 + (p * Math.PI * 2) / PLANES;
  const n: [number, number, number] = [Math.cos(raan), 0, -Math.sin(raan)];
  const ci = Math.cos(INCLINATION);
  const si = Math.sin(INCLINATION);
  const m: [number, number, number] = [Math.sin(raan) * ci, si, Math.cos(raan) * ci];
  return { n, m };
});

const SLOT = Array.from({ length: N }, (_, i) => {
  const p = Math.floor(i / PER_PLANE);
  const s = i % PER_PLANE;
  return (s * Math.PI * 2) / PER_PLANE + (p * PHASING * Math.PI * 2) / N;
});

const lanternAngle = (i: number, elapsed: number) => SLOT[i] + (EPOCH * PERIOD + elapsed) * OMEGA;
const depthAlpha = (d: number) => {
  const t = (d + 1) / 2;
  return 0.3 + 0.7 * t * t;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function emberFlicker(elapsed: number) {
  const f = (elapsed % 2600) / 2600;
  return (f > 0.46 && f < 0.5) || (f > 0.53 && f < 0.57) ? 0.2 : 1;
}

function makeSprite(dpr: number, rgb: string) {
  const r = 18;
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(r * 2 * dpr);
  const g = c.getContext("2d");
  if (!g) return c;
  g.scale(dpr, dpr);
  const glow = g.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${rgb}, 0.55)`);
  glow.addColorStop(0.22, `rgba(${rgb}, 0.22)`);
  glow.addColorStop(0.55, `rgba(${rgb}, 0.06)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, r * 2, r * 2);
  const core = g.createRadialGradient(r, r, 0, r, r, 3.6);
  core.addColorStop(0, "rgba(255, 244, 222, 1)");
  core.addColorStop(0.55, `rgba(${rgb}, 1)`);
  core.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = core;
  g.beginPath();
  g.arc(r, r, 3.6, 0, Math.PI * 2);
  g.fill();
  return c;
}

export interface LanternNetworkProps {
  l17?: L17State;
  eclipse?: boolean;
  /** orbit radius and planet radius as fractions of the stage width */
  ringRadius?: number;
  planetRadius?: number;
  /** camera elevation and on-screen roll, degrees */
  elevation?: number;
  roll?: number;
  /** 0 to 1: how loud the rings, trails and Lanterns are (the planet's own shading is unchanged) */
  calm?: number;
  /** leave Lantern 17's marker to the parent, which draws it where the route ends */
  hideTarget?: boolean;
  reduce?: boolean;
  className?: string;
}

export default function LanternNetwork({
  l17 = "failing",
  eclipse = false,
  ringRadius = 0.41,
  planetRadius = 0.29,
  elevation = 17,
  roll = 11,
  calm = 1,
  hideTarget = false,
  reduce = false,
  className,
}: LanternNetworkProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const planetRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ l17, eclipse, calm, hideTarget });
  const redraw = useRef<() => void>(() => {});
  const [gl, setGl] = useState(false);

  useEffect(() => {
    live.current = { l17, eclipse, calm, hideTarget };
    redraw.current();
  }, [l17, eclipse, calm, hideTarget]);

  useEffect(() => {
    const stage = stageRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    const planetCanvas = planetRef.current;
    if (!stage || !back || !front || !planetCanvas) return;
    const bctx = back.getContext("2d");
    const fctx = front.getContext("2d");
    if (!bctx || !fctx) return;

    const EL = (elevation * Math.PI) / 180;
    const ROLL = (roll * Math.PI) / 180;
    const CE = Math.cos(EL);
    const SE = Math.sin(EL);
    const CR = Math.cos(ROLL);
    const SR = Math.sin(ROLL);

    /** x, y in stage fractions from the planet's centre (y down), depth d from -1 (far) to 1 (near) */
    function project(p: number, u: number) {
      const { n, m } = PLANE_AXES[p];
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const wx = cu * n[0] + su * m[0];
      const wy = cu * n[1] + su * m[1];
      const wz = cu * n[2] + su * m[2];
      const y1 = wy * CE - wz * SE;
      const z1 = wy * SE + wz * CE;
      const x2 = wx * CR - y1 * SR;
      const y2 = wx * SR + y1 * CR;
      return { x: x2 * ringRadius, y: -y2 * ringRadius, d: z1 };
    }
    const occluded = (x: number, y: number, d: number) => d < 0 && x * x + y * y < planetRadius * planetRadius;

    let size = 0;
    let dpr = 1;
    let sprite = makeSprite(1, AMBER);
    let emberSprite = makeSprite(1, EMBER);
    const ringBack = document.createElement("canvas");
    const ringFront = document.createElement("canvas");

    let planet: PlanetRenderer | null = null;
    let disposed = false;
    const lights: PlanetLight[] = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, power: 0, color: WARM }));
    let dim = live.current.eclipse ? ECLIPSE_LEVEL : 1;
    let lvl17 = L17_LEVEL[live.current.l17];
    let last = 0;

    const img = new Image();
    img.decoding = "async";
    img.src = "/textures/planet_map.jpg";
    img
      .decode()
      .then(() => {
        if (disposed) return;
        planet = createPlanetRenderer(planetCanvas, { elevation: EL, roll: ROLL, extent: PLANET_EXTENT }, img, () => {
          planet = null;
          setGl(false);
        });
        if (!planet) return;
        planet.resize(size * planetRadius * PLANET_EXTENT * 2, Math.min(window.devicePixelRatio || 1, PLANET_DPR));
        draw(last);
        setGl(true);
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
      sprite = makeSprite(dpr, AMBER);
      emberSprite = makeSprite(dpr, EMBER);
      drawRings();
      planet?.resize(size * planetRadius * PLANET_EXTENT * 2, Math.min(dpr, PLANET_DPR));
    }

    function drawRings() {
      const rb = ringBack.getContext("2d");
      const rf = ringFront.getContext("2d");
      if (!rb || !rf) return;
      for (const g of [rb, rf]) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, ringBack.width, ringBack.height);
        g.setTransform(dpr, 0, 0, dpr, (size / 2) * dpr, (size / 2) * dpr);
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
      const { l17: state, eclipse: eclipseNow, calm: loud, hideTarget: hide } = live.current;
      const dt = Math.max(0, elapsed - last);
      last = elapsed;
      // the phases change over a second or two, not in one frame
      const ease = (to: number, from: number, ms: number) => (reduce ? to : from + (to - from) * (1 - Math.exp(-dt / ms)));
      dim = ease(eclipseNow ? ECLIPSE_LEVEL : 1, dim, 650);
      lvl17 = ease(L17_LEVEL[state], lvl17, 900);

      // the rings stay put, but the Eclipse takes some of their glow (the layer is faded as a whole)
      const ringAlpha = loud * (0.45 + 0.55 * dim);
      for (const [g, rings] of [
        [bctx!, ringBack],
        [fctx!, ringFront],
      ] as const) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, back!.width, back!.height);
        g.globalAlpha = ringAlpha;
        g.drawImage(rings, 0, 0);
        g.globalAlpha = 1;
        g.setTransform(dpr, 0, 0, dpr, (size / 2) * dpr, (size / 2) * dpr);
        g.lineCap = "round";
      }

      const segs = 18;
      for (let i = 0; i < N; i++) {
        const is17 = i === TARGET;
        if (is17 && (lvl17 < 0.2 || hide)) continue;
        const p = Math.floor(i / PER_PLANE);
        const u = lanternAngle(i, elapsed);
        const strength = (is17 ? lvl17 : 1) * dim * loud;
        let prev = project(p, u - TRAIL);
        for (let k = 1; k <= segs; k++) {
          const t = k / segs;
          const cur = project(p, u - TRAIL * (1 - t));
          const d = (prev.d + cur.d) / 2;
          const g = d > 0 ? fctx! : bctx!;
          g.strokeStyle = `rgba(${is17 && lvl17 < 0.7 ? EMBER : AMBER}, ${(0.62 * t * t * depthAlpha(d) * strength).toFixed(3)})`;
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
        const is17 = i === TARGET;
        const p = Math.floor(i / PER_PLANE);
        const pt = project(p, lanternAngle(i, elapsed));
        const x = pt.x * size;
        const y = pt.y * size;
        // the planet is shaded as on the home page: the Lanterns keep the home page's distance from it
        const light = lights[i];
        light.x = (pt.x / ringRadius) * HOME_RATIO;
        light.y = (-pt.y / ringRadius) * HOME_RATIO;
        light.z = pt.d * HOME_RATIO;
        const output = OUTPUT[i] ?? 1;
        let sprite17 = false;
        let a = 1;
        if (is17) {
          const flicker = state === "lit" ? 1 : state === "failing" ? 0.78 + 0.22 * emberFlicker(elapsed) : emberFlicker(elapsed);
          const level = lvl17 * flicker;
          light.power = LANTERN_POWER * level * dim;
          const mix = Math.max(0, Math.min(1, (lvl17 - 0.05) / 0.6));
          light.color = [lerp(EMBER_LIGHT[0], WARM[0], mix), lerp(EMBER_LIGHT[1], WARM[1], mix), lerp(EMBER_LIGHT[2], WARM[2], mix)];
          sprite17 = lvl17 < 0.7;
          a = (0.35 + 0.65 * Math.min(1, lvl17 + 0.2)) * flicker;
        } else {
          const shimmer = output < 1 ? 0.9 + 0.1 * Math.sin(elapsed / 310 + i * 1.7) : 1;
          light.power = LANTERN_POWER * output * shimmer * dim;
          a = 0.55 + 0.45 * output;
        }
        if (is17 && hide) continue;
        if (occluded(pt.x, pt.y, pt.d)) continue;
        const g = pt.d > 0 ? fctx! : bctx!;
        const s = (0.8 + 0.32 * ((pt.d + 1) / 2)) * (is17 ? 1.35 : 1);
        g.globalAlpha = Math.min(1, depthAlpha(pt.d) * a * (0.3 + 0.7 * dim) * loud);
        g.drawImage(sprite17 ? emberSprite : sprite, x - half * s, y - half * s, half * 2 * s, half * 2 * s);
        g.globalAlpha = 1;
      }
      planet?.render(lights, (elapsed / SPIN_PERIOD) * Math.PI * 2);
    }

    const t0 = performance.now();
    let raf = 0;
    let visible = true;
    const loop = (now: number) => {
      draw(now - t0);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (reduce) draw(0);
      else if (!raf) raf = requestAnimationFrame(loop);
    };
    redraw.current = () => {
      if (reduce) draw(0);
    };

    resize();
    start();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    ro.observe(stage);
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
      redraw.current = () => {};
      planet?.dispose();
    };
  }, [ringRadius, planetRadius, elevation, roll, reduce]);

  const full = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" } as const;
  const pw = `${planetRadius * PLANET_EXTENT * 2 * 100}%`;
  return (
    <div ref={stageRef} className={className} style={{ position: "relative", width: "100%", aspectRatio: "1" }} aria-hidden="true">
      <canvas ref={backRef} style={full} />
      {/* if WebGL is missing, a plain dark disc stands in for the planet */}
      {!gl && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${planetRadius * 2 * 100}%`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: "radial-gradient(circle at 36% 32%, #2a4a66, #0f2236 60%, #060d17)",
          }}
        />
      )}
      <canvas
        ref={planetRef}
        style={{ position: "absolute", left: "50%", top: "50%", width: pw, height: pw, transform: "translate(-50%, -50%)", display: "block" }}
      />
      <canvas ref={frontRef} style={full} />
    </div>
  );
}
