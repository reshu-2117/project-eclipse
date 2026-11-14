import type { EventId } from "@/lib/game";

/**
 * A small animated scene for each event card, drawn in code (320 x 150). Cold blue for the world, amber for light
 * and choices, ember for danger. The motion is CSS only, so reduced-motion settings switch it off.
 */

const STARS: [number, number, number][] = [
  [18, 20, 1], [52, 112, 1.2], [88, 36, 0.9], [130, 128, 1], [168, 18, 1.3], [204, 100, 0.9], [246, 26, 1.1],
  [286, 120, 1], [304, 52, 1.2], [36, 70, 0.8], [112, 82, 0.8], [226, 138, 0.9], [270, 84, 0.8], [150, 60, 0.7],
];

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
};

function rock(cx: number, cy: number, r: number, seed: number): string {
  const n = 9;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = r * (0.72 + 0.4 * rnd(seed + i * 3.1));
    return `${(cx + Math.cos(a) * k).toFixed(1)},${(cy + Math.sin(a) * k * 0.86).toFixed(1)}`;
  }).join(" ");
}

function Ship({ x, y, shield }: { x: number; y: number; shield?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`} className="ca-ship">
      <path d="M-26,-9 L8,-9 L26,0 L8,9 L-26,9 Z" />
      <path d="M-26,-4 L-34,-8 L-34,8 L-26,4" />
      {shield && <path d="M34,-24 A34,34 0 0 1 34,24" className="ca-shield" />}
    </g>
  );
}

function Scene({ id }: { id: EventId }) {
  switch (id) {
    case "E1":
      return (
        <g>
          <Ship x={52} y={78} shield />
          {Array.from({ length: 16 }, (_, i) => {
            const y = 14 + rnd(i * 1.7) * 122;
            const s = 3 + rnd(i * 4.3) * 6;
            return (
              <g key={i} transform={`translate(${130 + rnd(i * 2.9) * 190},${y})`}>
                <polygon
                  points={rock(0, 0, s, i * 7)}
                  className="ca-pebble"
                  style={{ animationDuration: `${2.6 + rnd(i * 5.1) * 3}s`, animationDelay: `${-rnd(i * 8.3) * 4}s` }}
                />
              </g>
            );
          })}
        </g>
      );
    case "E2":
      return (
        <g>
          <Ship x={52} y={78} />
          <path d="M84,78 L196,70" className="ca-dots" />
          <polygon points={rock(240, 70, 26, 11)} className="ca-rock" />
          <g className="ca-brackets">
            <path d="M200,32 L200,24 L208,24 M272,24 L280,24 L280,32 M200,108 L200,116 L208,116 M272,116 L280,116 L280,108" />
          </g>
          <text x="296" y="18" className="ca-label ember" textAnchor="end">TRACKED · FIST-SIZED</text>
        </g>
      );
    case "E3":
      return (
        <g>
          <rect x="28" y="58" width="264" height="34" rx="6" className="ca-pipe" />
          <path d="M28,66 L292,66 M28,84 L292,84" className="ca-pipe-line" />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d="M0,-7 L0,7 M-6,-3.5 L6,3.5 M-6,3.5 L6,-3.5"
              className="ca-frost"
              transform={`translate(${46 + i * 21},${i % 2 ? 54 : 96})`}
              style={{ animationDelay: `${-i * 0.35}s` }}
            />
          ))}
          <text x="28" y="30" className="ca-label ice">FUEL LINE · +1.5 °C FREEZE POINT</text>
          <rect x="250" y="106" width="42" height="12" rx="3" className="ca-gauge" />
          <rect x="252" y="108" width="14" height="8" rx="2" className="ca-gauge-fill" />
        </g>
      );
    case "E4":
      return (
        <g>
          <g transform="translate(210,76)">
            <g className="ca-tumble">
              <rect x="-34" y="-13" width="68" height="26" rx="4" className="ca-hull" />
              <path d="M-34,-13 L-52,-30 L-34,-4" className="ca-broken" />
              <path d="M34,-4 L58,-12 M34,4 L58,12" />
              <path d="M-8,-13 L-4,-26 M-4,-26 l6,-4" />
            </g>
          </g>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${112 + i * 14},${54 - i * 5} A${18 + i * 12},${18 + i * 12} 0 0 1 ${112 + i * 14},${100 + i * 5}`} className="ca-wave" style={{ animationDelay: `${i * 0.25}s` }} />
          ))}
          <text x="24" y="26" className="ca-label ember ca-blink">MAYDAY · CREW TERN-9</text>
        </g>
      );
    case "E5":
      return (
        <g>
          <polygon points="320,0 320,40 130,150 60,150" className="ca-beam" />
          <polygon points="320,8 320,26 150,140 100,140" className="ca-beam-core" />
          <Ship x={150} y={74} />
          <text x="24" y="26" className="ca-label amber">ANOTHER LANTERN&apos;S BEAM FIELD</text>
        </g>
      );
    case "E6":
      return (
        <g>
          <g transform="translate(170,76)">
            <g className="ca-tumble slow">
            <path d="M-92,0 L50,0" className="ca-truss" />
            {Array.from({ length: 8 }, (_, i) => (
              <path key={i} d={`M${-84 + i * 17},-6 L${-76 + i * 17},6`} className="ca-truss" />
            ))}
            <circle cx="-96" cy="0" r="12" className="ca-hull" />
            {[[62, 0], [78, 0], [54, -14], [70, -14], [62, 14], [78, 14]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="7" className="ca-hex" />
            ))}
            </g>
          </g>
          <text x="24" y="26" className="ca-label ice">LANTERN 9 · ABANDONED · TUMBLING</text>
        </g>
      );
    case "E7":
      return (
        <g>
          <g transform="translate(160,76)">
            <circle r="44" className="ca-hull" />
            <g className="ca-spin">
              <path d="M0,-40 L0,40 M-40,0 L40,0 M-28,-28 L28,28 M-28,28 L28,-28" className="ca-spoke" />
              <circle r="9" className="ca-hull" />
            </g>
          </g>
          <text x="24" y="26" className="ca-label ember ca-blink">REACTION WHEEL FAULT</text>
        </g>
      );
    default:
      return (
        <g>
          {[88, 188].map((x, i) => (
            <g key={x} transform={`translate(${x},46)`}>
              <rect width="52" height="64" rx="12" className="ca-hull" />
              <rect x="6" y="6" width="40" height="52" rx="8" className={i ? "ca-cell drain" : "ca-cell"} />
            </g>
          ))}
          <path d="M142,78 L186,78" className="ca-dots" />
          <text x="24" y="26" className="ca-label amber">FUEL CELL OUTPUT FALLING</text>
        </g>
      );
  }
}

export default function CardArt({ id }: { id: EventId }) {
  return (
    <svg className="ca" viewBox="0 0 320 150" aria-hidden="true">
      <rect width="320" height="150" className="ca-bg" />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} className="ca-star" />
      ))}
      <Scene id={id} />
    </svg>
  );
}
