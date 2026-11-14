"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteId } from "@/lib/game";
import LanternNetwork, { type L17State } from "../components/LanternNetwork";
import { useReducedMotion } from "./Opening";

/**
 * The flight map: the planet, the Wick's orbit (300 km), Lantern 17's orbit (1,000 km), and the path of each route.
 * Schematic, not to scale. The Hohmann arcs are real ellipses between the two orbits; the fast routes cut across;
 * the catch-up arcs show the extra orbits spent lining up with the Lantern.
 */

const C = { x: 320, y: 210 };
const R_PLANET = 56;
const R_WICK = 98;
const R_L17 = 168;
const START = (150 * Math.PI) / 180; // where the Wick sits on its orbit
const APEX = START + Math.PI; // where a Hohmann transfer meets Lantern 17's orbit

const pt = (r: number, a: number): [number, number] => [C.x + r * Math.cos(a), C.y + r * Math.sin(a)];
const f = (n: number) => n.toFixed(1);
const poly = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join(" ");

function hohmannPts(): [number, number][] {
  const a = (R_WICK + R_L17) / 2;
  const e = (R_L17 - R_WICK) / (R_L17 + R_WICK);
  const p = a * (1 - e * e);
  const out: [number, number][] = [];
  for (let i = 0; i <= 90; i++) {
    const phi = (i / 90) * Math.PI;
    out.push(pt(p / (1 + e * Math.cos(phi)), START + phi));
  }
  return out;
}

function arcPts(r: number, from: number, deg: number): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.max(8, Math.round(deg / 3));
  for (let i = 0; i <= n; i++) out.push(pt(r, from + ((i / n) * deg * Math.PI) / 180));
  return out;
}

function fastPts(): [number, number][] {
  // a direct intercept: out from the Wick, across the planet's flank, to Lantern 17
  const [x0, y0] = pt(R_WICK, START);
  const [x1, y1] = pt(R_L17, APEX);
  const cx = C.x + 20;
  const cy = C.y + 78;
  const out: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    out.push([(1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1]);
  }
  return out;
}

interface Path {
  /** the outbound path the ship flies */
  d: string;
  /** where it ends: Lantern 17 is wherever the route meets it */
  end: [number, number];
  /** dashed home leg */
  home: string;
  /** labels */
  note: string;
  tone: "safe" | "mid" | "fast";
}

function buildPaths(): Record<RouteId, Path> {
  const h = hohmannPts();
  const homeH = poly(h.slice().reverse());
  const fast = fastPts();
  const tilt = (pts: [number, number][]): [number, number][] =>
    pts.map(([x, y]) => {
      // a plane change: the same transfer, tipped out of the page
      const dx = x - C.x;
      const dy = y - C.y;
      return [C.x + dx * 0.96 - dy * 0.24, C.y + dy * 0.8 + dx * 0.2];
    });
  const mk = (pts: [number, number][], home: string, note: string, tone: Path["tone"]): Path => ({
    d: poly(pts),
    end: pts[pts.length - 1],
    home,
    note,
    tone,
  });
  return {
    safe: mk([...h, ...arcPts(R_L17, APEX, 300).slice(1)], homeH, "Hohmann transfer, then 5 orbits to catch up", "safe"),
    quick: mk([...h, ...arcPts(R_L17, APEX, 110).slice(1)], homeH, "Hohmann transfer, then 1 orbit to catch up", "safe"),
    fastOut: mk(fast, homeH, "Direct intercept out, Hohmann home", "fast"),
    skipWindow: mk([...tilt(h), ...tilt(arcPts(R_L17, APEX, 110)).slice(1)], homeH, "A 10° plane change, then Hohmann", "mid"),
    fastBoth: mk(fast, poly(fast.slice().reverse()), "Direct intercept both ways", "fast"),
  };
}

/** The stage the Lantern network is drawn on: its rings are Lantern 17's orbit, so it spans a little more than that. */
const NET_SIZE = R_L17 * 2 * 1.04;
export default function FlightMap({
  route,
  hover,
  progress,
  loop,
  caption,
  l17 = "failing",
  eclipse = false,
  phase,
}: {
  route: RouteId | null;
  hover?: RouteId | null;
  /** 0 to 1 along the chosen route (used when loop is false) */
  progress: number;
  /** keep the ship moving along the route, for the preview */
  loop?: boolean;
  caption?: string;
  /** the network's phase: Lantern 17's state, and whether the Eclipse has dimmed everything */
  l17?: L17State;
  eclipse?: boolean;
  /** a short label for the phase, drawn on the map */
  phase?: string;
}) {
  const reduce = useReducedMotion();
  const paths = useMemo(() => buildPaths(), []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; size: number } | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const raf = useRef(0);
  const active = route ?? hover ?? null;

  // the ship eases toward its target, or sweeps along the path again and again in the preview
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (reduce) {
      raf.current = requestAnimationFrame(() => setShown(loop ? 0.6 : progress));
      return () => cancelAnimationFrame(raf.current);
    }
    const t0 = performance.now();
    const a = from.current;
    const tick = (now: number) => {
      if (loop) {
        const v = ((now - t0) / 6500) % 1;
        from.current = v;
        setShown(v);
      } else {
        const k = Math.min(1, (now - t0) / 1600);
        const e = 1 - Math.pow(1 - k, 3);
        const v = a + (progress - a) * e;
        from.current = v;
        setShown(v);
        if (k >= 1) return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [progress, loop, reduce, active]);

  const [ship, setShip] = useState<{ x: number; y: number; a: number } | null>(null);
  useEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    const at = Math.max(0, Math.min(len, shown * len));
    const a = p.getPointAtLength(at);
    const b = p.getPointAtLength(Math.min(len, at + 2));
    const next = { x: a.x, y: a.y, a: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    const id = requestAnimationFrame(() => setShip(next));
    return () => cancelAnimationFrame(id);
  }, [shown, active]);

  // keep the planet's canvas exactly under the planet the SVG draws, however the map is scaled
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const place = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const k = Math.min(w / 640, h / 420);
      const size = NET_SIZE * k;
      setBox({ left: (w - 640 * k) / 2 + C.x * k - size / 2, top: (h - 420 * k) / 2 + C.y * k - size / 2, size });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [wx, wy] = pt(R_WICK, START);
  const [lx, ly] = active ? paths[active].end : pt(R_L17, APEX);

  return (
    <div className="fm-wrap" ref={wrapRef}>
      {box && (
        <div className="fm-planet" style={{ left: box.left, top: box.top, width: box.size, height: box.size }}>
          <LanternNetwork
            l17={l17}
            eclipse={eclipse}
            reduce={reduce}
            ringRadius={R_L17 / NET_SIZE}
            planetRadius={R_PLANET / NET_SIZE}
            calm={1}
            hideTarget
          />
        </div>
      )}
    <svg className="fm" viewBox="0 0 640 420" role="img" aria-label={caption ?? "Flight map from the Wick at 300 km to Lantern 17 at 1,000 km"}>
      <defs>
        <radialGradient id="fm-planet" cx="38%" cy="34%" r="75%">
          <stop offset="0" stopColor="#2a4a66" />
          <stop offset="0.6" stopColor="#0f2236" />
          <stop offset="1" stopColor="#060d17" />
        </radialGradient>
        <radialGradient id="fm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(255,106,43,0.55)" />
          <stop offset="1" stopColor="rgba(255,106,43,0)" />
        </radialGradient>
      </defs>

      {/* orbits */}
      <circle cx={C.x} cy={C.y} r={R_L17} className="fm-orbit l17" />
      <circle cx={C.x} cy={C.y} r={R_WICK} className="fm-orbit wick" />

      {/* the planet */}
      <circle cx={C.x} cy={C.y} r={R_PLANET + 7} fill="rgba(127,212,232,0.05)" />
      <circle cx={C.x} cy={C.y} r={R_PLANET} fill="none" stroke="rgba(127,212,232,0.28)" />
      <text x={C.x} y={C.y + R_PLANET + 16} className="fm-text" textAnchor="middle">
        ECLIPSE-01
      </text>

      {/* every route, faint; the chosen or hovered one bright */}
      {(Object.keys(paths) as RouteId[]).map((id) => (
        <path key={id} d={paths[id].d} className={`fm-route ${paths[id].tone}${active === id ? " on" : ""}`} fill="none" />
      ))}
      {active && <path d={paths[active].home} className="fm-home" fill="none" />}
      {active && <path ref={pathRef} d={paths[active].d} className="fm-track" fill="none" pathLength={1} style={{ strokeDasharray: `${shown} 1` }} />}

      {/* the Wick and Lantern 17 */}
      <g transform={`translate(${f(wx)},${f(wy)})`}>
        <circle r="6" className="fm-wick" />
        <text x="-12" y="22" className="fm-text" textAnchor="end">
          THE WICK · 300 KM
        </text>
      </g>
      <g className="fm-l17g" style={{ transform: `translate(${f(lx)}px, ${f(ly)}px)` }}>
        <circle r="26" fill="url(#fm-glow)" className="fm-pulse" />
        <circle r="5" className="fm-l17" />
        <text x="14" y="-12" className="fm-text amber">
          LANTERN 17 · 1,000 KM
        </text>
      </g>

      {/* the ship */}
      {active && ship && (
        <g transform={`translate(${f(ship.x)},${f(ship.y)}) rotate(${f(ship.a)})`} className="fm-ship">
          <path d="M9,0 L-6,-5 L-3,0 L-6,5 Z" />
        </g>
      )}

      {phase && (
        <text x="22" y="30" className={`fm-text${eclipse ? " ice" : " amber"}`}>
          {phase.toUpperCase()}
        </text>
      )}
      <text x="22" y="404" className="fm-text">
        SCHEMATIC · NOT TO SCALE
      </text>
      {active && (
        <text x="618" y="404" className="fm-text" textAnchor="end">
          {paths[active].note.toUpperCase()}
        </text>
      )}
    </svg>
    </div>
  );
}
