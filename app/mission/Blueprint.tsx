"use client";

import { ENGINES, POWER, SHIELDS, COMMS } from "@/lib/game";
import type { HullId, Loadout, SensorId } from "@/lib/game";
import type { LoadoutStats } from "@/lib/game";

/**
 * The ship, drawn as a blueprint. Every part in the loadout has a drawing that slides into place and locks;
 * taking a part out slides it away. Each hull has its own silhouette and its own anchor points, so the same
 * parts sit correctly on a needle-thin Courier and a boxy Hauler.
 *
 * Coordinates: a 900 x 460 sheet, nose to the right, centre line at y = 230.
 */

type Pt = [number, number];
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Geo {
  accent: string;
  body: string;
  /** extra outline paths (fins, docking ring) */
  extra: string[];
  dividers: number[];
  top: number;
  bottom: number;
  engine: Pt;
  engineScale: number;
  tank: Rect;
  bay: Rect;
  boom: { base: Pt; tip: Pt };
  mast: { base: Pt; tip: Pt };
  belly: Pt;
  nose: Pt;
  rtg: { base: Pt; tip: Pt };
  tap: Pt;
  ports: Pt[];
  seams: number[];
}

const GEO: Record<HullId, Geo> = {
  courier: {
    accent: "#7fd4e8",
    body: "M170,205 L560,196 L800,230 L560,264 L170,255 Z",
    extra: ["M170,205 L128,168 L218,203 Z", "M170,255 L128,292 L218,257 Z", "M800,230 L826,230"],
    dividers: [],
    top: 198,
    bottom: 262,
    engine: [170, 230],
    engineScale: 0.7,
    tank: { x: 204, y: 212, w: 214, h: 36 },
    bay: { x: 430, y: 210, w: 112, h: 40 },
    boom: { base: [520, 199], tip: [572, 128] },
    mast: { base: [330, 202], tip: [330, 128] },
    belly: [236, 262],
    nose: [828, 230],
    rtg: { base: [196, 205], tip: [160, 148] },
    tap: [520, 262],
    ports: [[596, 226], [596, 234]],
    seams: [190, 424, 548],
  },
  tender: {
    accent: "#ffb547",
    body: "M260,168 L640,168 Q710,176 752,208 L752,252 Q710,284 640,292 L260,292 Q244,292 244,276 L244,184 Q244,168 260,168 Z",
    extra: ["M752,206 L780,206 L780,254 L752,254"],
    dividers: [],
    top: 168,
    bottom: 292,
    engine: [244, 230],
    engineScale: 1,
    tank: { x: 262, y: 184, w: 190, h: 92 },
    bay: { x: 466, y: 184, w: 160, h: 92 },
    boom: { base: [612, 169], tip: [650, 98] },
    mast: { base: [356, 169], tip: [356, 96] },
    belly: [292, 292],
    nose: [782, 230],
    rtg: { base: [272, 169], tip: [250, 118] },
    tap: [600, 292],
    ports: [[664, 218], [664, 242]],
    seams: [458, 632],
  },
  hauler: {
    accent: "#b79cff",
    body: "M200,150 L700,150 L735,180 L735,280 L700,310 L200,310 Z",
    extra: ["M735,204 L766,204 L766,256 L735,256"],
    dividers: [330, 460, 590],
    top: 150,
    bottom: 310,
    engine: [200, 230],
    engineScale: 1.25,
    tank: { x: 214, y: 166, w: 236, h: 128 },
    bay: { x: 472, y: 166, w: 218, h: 128 },
    boom: { base: [680, 151], tip: [716, 76] },
    mast: { base: [350, 151], tip: [350, 74] },
    belly: [262, 310],
    nose: [768, 230],
    rtg: { base: [222, 151], tip: [204, 100] },
    tap: [690, 310],
    ports: [[712, 212], [712, 248]],
    seams: [696],
  },
};

/** A small outline of a hull, for the hull cards. */
export function HullThumb({ id }: { id: HullId }) {
  const g = GEO[id];
  return (
    <svg viewBox="100 90 740 280" className="hg-thumb" aria-hidden="true" style={{ ["--bp" as string]: g.accent }}>
      <path d={g.body} className="bp-line" />
      {g.extra.map((d, i) => (
        <path key={i} d={d} className="bp-line" />
      ))}
      {g.dividers.map((x) => (
        <path key={x} d={`M${x},${g.top} L${x},${g.bottom}`} className="bp-line" opacity="0.5" />
      ))}
      <path d={`M${g.engine[0]},${g.engine[1] - 24 * g.engineScale} L${g.engine[0] - 50 * g.engineScale},${g.engine[1] - 40 * g.engineScale} L${g.engine[0] - 50 * g.engineScale},${g.engine[1] + 40 * g.engineScale} L${g.engine[0]},${g.engine[1] + 24 * g.engineScale} Z`} className="bp-line" />
    </svg>
  );
}

export type Focus = "hull" | "engine" | "fuel" | "power" | "shield" | "sensors" | "comms" | "kit" | "addons" | null;

const SENSOR_ORDER: SensorId[] = ["camera", "thermal", "lidar", "radar"];

// ───────────── engines (drawn with the hull's rear at 0,0, bell pointing left) ─────────────

function EngineArt({ id }: { id: Loadout["engine"] }) {
  if (id === "cluster") {
    return (
      <g>
        {[-33, -11, 11, 33].map((dy) => (
          <path key={dy} d={`M0,${dy - 4} L-12,${dy - 4} L-36,${dy - 10} L-36,${dy + 10} L-12,${dy + 4} L0,${dy + 4} Z`} />
        ))}
      </g>
    );
  }
  if (id === "green") {
    return (
      <g>
        <path d="M0,-18 L-12,-18 L-50,-34 L-50,34 L-12,18 L0,18 Z" />
        <circle cx="-8" cy="-52" r="14" className="bp-green" />
        <path d="M-8,-38 L-8,-20" className="bp-green" />
      </g>
    );
  }
  if (id === "cryo") {
    return (
      <g>
        <path d="M0,-30 L-22,-30 L-88,-64 L-88,64 L-22,30 L0,30 Z" />
        <path d="M-30,-22 L-30,22 M-50,-34 L-50,34 M-68,-46 L-68,46" className="bp-frost" />
        <path d="M0,-30 Q14,-52 0,-62 L34,-62 Q22,-44 34,-30 Z" className="bp-frost" />
      </g>
    );
  }
  // workhorse biprop (and the locked ion engine, which can't be picked)
  return (
    <g>
      <path d="M0,-26 L-18,-26 L-64,-48 L-64,48 L-18,26 L0,26 Z" />
      <path d="M-18,-26 L-18,26 M-40,-37 L-40,37" />
    </g>
  );
}

// ───────────── small icons ─────────────

function Hex({ x, y, r }: { x: number; y: number; r: number }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
  return <polygon points={pts} />;
}

function KitIcon({ id }: { id: "eva" | "drones" | "arm" | "optics" }) {
  if (id === "eva")
    return (
      <g>
        <circle cx="-9" cy="-4" r="7" />
        <circle cx="9" cy="-4" r="7" />
        <path d="M-12,-5 Q-9,-8 -6,-5 M6,-5 Q9,-8 12,-5" />
        <path d="M-16,12 Q-9,3 -2,12 M2,12 Q9,3 16,12" />
      </g>
    );
  if (id === "drones")
    return (
      <g>
        <circle cx="-9" cy="-3" r="6" />
        <ellipse cx="-9" cy="-3" rx="10" ry="3" />
        <circle cx="9" cy="4" r="6" />
        <ellipse cx="9" cy="4" rx="10" ry="3" />
      </g>
    );
  if (id === "arm")
    return (
      <g>
        <path d="M-16,12 L-5,-6 L7,5 L16,-11" fill="none" />
        <circle cx="-16" cy="12" r="3" />
        <circle cx="-5" cy="-6" r="2.5" />
        <circle cx="7" cy="5" r="2.5" />
        <path d="M16,-11 l4,-3 M16,-11 l4,3" fill="none" />
      </g>
    );
  return (
    <g>
      <Hex x={-8} y={-5} r={7} />
      <Hex x={8} y={-5} r={7} />
      <Hex x={0} y={8} r={7} />
    </g>
  );
}

function SensorIcon({ id }: { id: SensorId }) {
  if (id === "camera")
    return (
      <g>
        <circle r="8" />
        <circle r="3.5" />
      </g>
    );
  if (id === "thermal")
    return (
      <g>
        <rect x="-9" y="-7" width="18" height="14" rx="2" />
        <path d="M-5,-2 q2,-3 4,0 t4,0 M-5,3 q2,-3 4,0 t4,0" fill="none" />
      </g>
    );
  if (id === "lidar")
    return (
      <g>
        <path d="M-9,5 A9,9 0 0 1 9,5 Z" />
        <path d="M-14,2 A14,14 0 0 1 14,2 M-19,-1 A19,19 0 0 1 19,-1" fill="none" opacity="0.6" />
      </g>
    );
  return (
    <g>
      <path d="M-11,-8 Q2,0 -11,8" fill="none" />
      <path d="M-11,-8 L-11,8" />
      <path d="M-2,0 L12,0 M12,-3 L12,3" fill="none" />
    </g>
  );
}

function CommsArt({ id }: { id: Loadout["comms"] }) {
  if (id === "radio")
    return (
      <g>
        <path d="M0,0 L0,-34" fill="none" />
        <circle cx="0" cy="-36" r="3" />
        <path d="M-8,-30 A12,12 0 0 1 8,-30" fill="none" opacity="0.6" />
      </g>
    );
  if (id === "laser")
    return (
      <g>
        <rect x="-11" y="-20" width="22" height="14" rx="2" />
        <path d="M0,-20 L0,-34" fill="none" />
        <path d="M0,-38 L0,-60" className="bp-beam" />
        <circle cx="0" cy="-38" r="2.5" className="bp-beam" />
      </g>
    );
  if (id === "relay")
    return (
      <g>
        <rect x="-14" y="-18" width="28" height="10" rx="2" />
        <path d="M-22,-26 A24,24 0 0 1 22,-26 M-30,-32 A34,34 0 0 1 30,-32" fill="none" opacity="0.55" />
      </g>
    );
  return (
    <g>
      <path d="M-26,-24 Q0,6 26,-24" fill="none" />
      <path d="M-26,-24 L26,-24" opacity="0.5" />
      <path d="M0,-12 L0,-36 M-4,-36 L4,-36" fill="none" />
    </g>
  );
}

// ───────────── the sheet ─────────────

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export default function Blueprint({
  loadout,
  stats,
  focus,
}: {
  loadout: Loadout;
  stats: LoadoutStats;
  focus: Focus;
}) {
  const g = GEO[loadout.hull];
  const hot = (f: Focus) => (focus === f ? " hot" : "");
  const fuelRatio = Math.max(0, Math.min(1, stats.fuelKg / stats.maxFuelKg));
  const overBay = stats.bayUsedKg > stats.bayLimitKg;
  const cy = 230;

  const bayCols = 2;
  const cellW = g.bay.w / bayCols;
  const cellH = g.bay.h / 2;
  const kitScale = Math.min(cellW, cellH) / 36;
  const KIT: ("eva" | "drones" | "arm" | "optics")[] = ["eva", "drones", "arm", "optics"];

  // the fuel gauge fills from the bottom of the tank
  const fuelH = g.tank.h * fuelRatio;

  const boomPoint = (t: number): Pt => [g.boom.base[0] + (g.boom.tip[0] - g.boom.base[0]) * t, g.boom.base[1] + (g.boom.tip[1] - g.boom.base[1]) * t];
  const sensorFrac: Record<SensorId, number> = { camera: 1, thermal: 0.72, lidar: 0.46, radar: 0.2 };

  const powerOn = loadout.power;
  const shieldLayers = loadout.shield === "none" ? 0 : loadout.shield === "light" ? 1 : 3;
  const engine = ENGINES[loadout.engine];

  return (
    <svg
      className="bp"
      viewBox="0 0 900 460"
      role="img"
      aria-label={`Blueprint of your ${loadout.hull}: ${engine.name}, ${POWER[powerOn].name}, ${SHIELDS[loadout.shield].name} shield, ${loadout.sensors.length} sensors, ${COMMS[loadout.comms].name}.`}
      style={{ ["--bp" as string]: g.accent }}
    >
      <defs>
        <pattern id="bp-grid-s" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30,0 L0,0 L0,30" fill="none" stroke="rgba(127,212,232,0.07)" strokeWidth="1" />
        </pattern>
        <pattern id="bp-grid-l" width="150" height="150" patternUnits="userSpaceOnUse">
          <path d="M150,0 L0,0 L0,150" fill="none" stroke="rgba(127,212,232,0.13)" strokeWidth="1" />
        </pattern>
        <linearGradient id="bp-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101a2b" />
          <stop offset="1" stopColor="#080d17" />
        </linearGradient>
        <linearGradient id="bp-fuel" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="rgba(255,181,71,0.75)" />
          <stop offset="1" stopColor="rgba(255,181,71,0.25)" />
        </linearGradient>
        <clipPath id="bp-tank-clip">
          <rect x={g.tank.x} y={g.tank.y} width={g.tank.w} height={g.tank.h} rx="4" />
        </clipPath>
      </defs>

      <rect width="900" height="460" fill="url(#bp-grid-s)" />
      <rect width="900" height="460" fill="url(#bp-grid-l)" />
      {/* centre line */}
      <path d="M40,230 L860,230" stroke="rgba(127,212,232,0.18)" strokeDasharray="14 6 2 6" fill="none" />

      {/* the hull, redrawn each time it changes */}
      <g key={loadout.hull} className={`bp-hull${hot("hull")}`}>
        <path d={g.body} pathLength="1" className="bp-draw" fill="url(#bp-hull)" />
        {g.extra.map((d, i) => (
          <path key={i} d={d} className="bp-line" fill="none" />
        ))}
        {g.dividers.map((x) => (
          <path key={x} d={`M${x},${g.top} L${x},${g.bottom}`} className="bp-line" opacity="0.5" />
        ))}
        {g.ports.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" className="bp-port" />
        ))}
        {g.seams.map((x) => (
          <path key={x} d={`M${x},${g.top + 3} L${x},${g.bottom - 3}`} className="bp-seam" />
        ))}
      </g>

      {/* fuel tank and its level */}
      <g className={`bp-tank${hot("fuel")}`}>
        <rect x={g.tank.x} y={g.tank.y} width={g.tank.w} height={g.tank.h} rx="4" className="bp-dash" fill="none" />
        <g clipPath="url(#bp-tank-clip)">
          <rect
            x={g.tank.x}
            y={g.tank.y + g.tank.h - fuelH}
            width={g.tank.w}
            height={fuelH}
            fill="url(#bp-fuel)"
            className="bp-fuel"
          />
          {[0.25, 0.5, 0.75].map((t) => (
            <path key={t} d={`M${g.tank.x},${g.tank.y + g.tank.h * t} l8,0`} stroke="rgba(220,230,240,0.35)" />
          ))}
        </g>
        <text x={g.tank.x + 8} y={g.tank.y + 14} className="bp-text">
          FUEL {fmt(stats.fuelKg)} KG
        </text>
      </g>

      {/* the service bay and what is packed in it */}
      <g className={`bp-bay${hot("kit")}${overBay ? " over" : ""}`}>
        <rect x={g.bay.x} y={g.bay.y} width={g.bay.w} height={g.bay.h} rx="4" className="bp-dash" fill="none" />
        {KIT.map((k, i) => {
          const col = i % bayCols;
          const row = Math.floor(i / bayCols);
          const x = g.bay.x + col * cellW + cellW / 2;
          const y = g.bay.y + row * cellH + cellH / 2;
          return (
            <g key={k} transform={`translate(${x},${y})`}>
              <g className={`bp-mod${loadout.kit.includes(k) ? " on" : ""}`} style={{ ["--dy" as string]: "-26px" }}>
                <g transform={`scale(${kitScale})`} className="bp-line-g">
                  <KitIcon id={k} />
                </g>
              </g>
            </g>
          );
        })}
        <text x={g.bay.x} y={g.bottom + 42} className="bp-text">
          BAY {fmt(stats.bayUsedKg)} / {fmt(stats.bayLimitKg)} KG
        </text>
        <path d={`M${g.bay.x + 14},${g.bay.y + g.bay.h} L${g.bay.x + 14},${g.bottom} L${g.bay.x + 14},${g.bottom + 30}`} className="bp-lead" />
      </g>

      {/* engine */}
      <g transform={`translate(${g.engine[0]},${g.engine[1]}) scale(${g.engineScale})`} className={`bp-engine${hot("engine")}`}>
        <g key={loadout.engine} className="bp-mod on bp-pop">
          <g className="bp-line-g">
            <EngineArt id={loadout.engine} />
          </g>
        </g>
      </g>

      {/* power: slung under the hull */}
      <g transform={`translate(${g.belly[0]},${g.belly[1]})`} className={`bp-power${hot("power")}`}>
        <path d="M20,0 L20,14 M110,0 L110,14" className="bp-line" />
        <g key={powerOn} className="bp-mod on bp-pop-up">
          <g className="bp-line-g">
            {powerOn === "fuelcells" && (
              <g>
                <rect x="0" y="14" width="62" height="24" rx="12" />
                <rect x="68" y="14" width="62" height="24" rx="12" />
                <path d="M31,14 L31,38 M99,14 L99,38" opacity="0.5" />
              </g>
            )}
            {powerOn === "battery" && (
              <g>
                <rect x="0" y="14" width="130" height="24" rx="3" />
                <path d="M26,14 L26,38 M52,14 L52,38 M78,14 L78,38 M104,14 L104,38" opacity="0.6" />
                <rect x="130" y="21" width="5" height="10" />
              </g>
            )}
            {powerOn === "reactor" && (
              <g>
                <rect x="14" y="14" width="102" height="26" rx="5" />
                <path d="M0,18 L14,18 M0,26 L14,26 M0,34 L14,34 M116,18 L130,18 M116,26 L130,26 M116,34 L130,34" />
                <circle cx="65" cy="27" r="8" />
              </g>
            )}
          </g>
        </g>
      </g>

      {/* power add-ons: the RTG heat brick on a boom, the Lantern tap under the nose */}
      <g className={`bp-addons${hot("addons")}`}>
        <g className={`bp-mod${loadout.addons.includes("rtg") ? " on" : ""}`} style={{ ["--dy" as string]: "-24px" }}>
          <path d={`M${g.rtg.base[0]},${g.rtg.base[1]} L${g.rtg.tip[0]},${g.rtg.tip[1]}`} className="bp-line" fill="none" />
          <g transform={`translate(${g.rtg.tip[0]},${g.rtg.tip[1] - 8})`} className="bp-line-g">
            <rect x="-20" y="-8" width="40" height="16" rx="3" />
            <path d="M-12,-8 L-12,-14 M-4,-8 L-4,-14 M4,-8 L4,-14 M12,-8 L12,-14 M-12,8 L-12,14 M-4,8 L-4,14 M4,8 L4,14 M12,8 L12,14" />
          </g>
        </g>
        <g className={`bp-mod${loadout.addons.includes("tap") ? " on" : ""}`} style={{ ["--dy" as string]: "24px" }}>
          <g transform={`translate(${g.tap[0]},${g.tap[1]})`} className="bp-line-g">
            <path d="M0,0 L0,10 M-14,12 Q0,26 14,12 Z" fill="none" />
            <path d="M-14,12 Q0,26 14,12" />
          </g>
        </g>
      </g>

      {/* shield: layers at the nose */}
      <g className={`bp-shield${hot("shield")}`}>
        {[0, 1, 2].map((i) => {
          const on = i < shieldLayers;
          const x = g.nose[0] + 12 + i * 13;
          const half = 40 + i * 4;
          return (
            <g key={i} className={`bp-mod${on ? " on" : ""}`} style={{ ["--dx" as string]: "26px", transitionDelay: `${i * 70}ms` }}>
              <path
                d={`M${x},${cy - half} A${half * 1.5},${half * 1.5} 0 0 1 ${x},${cy + half}`}
                className="bp-plate"
                strokeWidth={loadout.shield === "heavy" ? 4 : 2.5}
                fill="none"
              />
            </g>
          );
        })}
      </g>

      {/* sensors on the boom */}
      <g className={`bp-sensors${hot("sensors")}`}>
        <path d={`M${g.boom.base[0]},${g.boom.base[1]} L${g.boom.tip[0]},${g.boom.tip[1]}`} className="bp-line" fill="none" />
        {SENSOR_ORDER.map((id) => {
          const [x, y] = boomPoint(sensorFrac[id]);
          const on = loadout.sensors.includes(id);
          return (
            <g key={id} transform={`translate(${x},${y})`}>
              <g className={`bp-mod${on ? " on" : ""}`} style={{ ["--dy" as string]: "-22px" }}>
                <g className="bp-line-g" transform="translate(14,-4)">
                  <SensorIcon id={id} />
                </g>
              </g>
            </g>
          );
        })}
      </g>

      {/* comms on the mast */}
      <g className={`bp-comms${hot("comms")}`}>
        <path d={`M${g.mast.base[0]},${g.mast.base[1]} L${g.mast.tip[0]},${g.mast.tip[1]}`} className="bp-line" fill="none" />
        <g transform={`translate(${g.mast.tip[0]},${g.mast.tip[1]})`}>
          <g key={loadout.comms} className="bp-mod on bp-pop-up">
            <g className="bp-line-g">
              <CommsArt id={loadout.comms} />
            </g>
          </g>
        </g>
      </g>

      {/* callouts */}
      <g className="bp-notes">
        <text x={40} y={g.engine[1] + 92 * g.engineScale + 14} className="bp-text">
          {engine.name.toUpperCase()} · ISP {engine.isp} S
        </text>
        <text x={g.belly[0]} y={g.belly[1] + 64} className="bp-text">
          {POWER[powerOn].name.toUpperCase()}
        </text>
        <text x={Math.min(g.mast.tip[0] - 30, 700)} y={g.mast.tip[1] - 54} className="bp-text">
          {COMMS[loadout.comms].name.toUpperCase()}
        </text>
        {shieldLayers > 0 && (
          <text x={880} y={cy + 82} className="bp-text" textAnchor="end">
            {SHIELDS[loadout.shield].name.toUpperCase()}
          </text>
        )}
      </g>

      {/* title block, like a drawing sheet */}
      <g transform="translate(500,398)" className="bp-title">
        <rect width="376" height="48" fill="none" className="bp-line" />
        <path d="M150,0 L150,48 M0,24 L376,24" className="bp-line" opacity="0.6" />
        <text x="8" y="16" className="bp-text">THE WICK · 300 KM</text>
        <text x="8" y="40" className="bp-text">SHEET 1 / 1</text>
        <text x="158" y="16" className="bp-text bp-strong">
          {loadout.hull.toUpperCase()} · {fmt(stats.dryKg)} KG DRY
        </text>
        <text x="158" y="40" className="bp-text">
          Δv {fmt(stats.dv)} M/S · {stats.credits} / 100 CR
        </text>
      </g>
      <text x="24" y="438" className="bp-text">
        PROJECT ECLIPSE · SHIP DESIGN
      </text>
      <text x="24" y="452" className="bp-text">
        NOT TO SCALE
      </text>
    </svg>
  );
}
