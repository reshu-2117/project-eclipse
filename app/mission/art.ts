/**
 * The opening's painted panels, drawn in code. Panel 1 is the live planet shader (see Opening.tsx); panels
 * 2 to 5 are the scenes below. Each scene is a pure function of time `t` (seconds on screen) and `p` (how
 * far through its narration line we are, 0 to 1), so the picture follows the voice and the same frame can
 * be drawn for a still image when motion is reduced.
 *
 * Nothing here is a stock image. Everything is original and drawn at run time.
 */

export interface ArtFrame {
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
  t: number;
  p: number;
  imgs: Record<string, HTMLImageElement | undefined>;
}
export type Scene = (f: ArtFrame) => void;

const AMBER = "255,181,71";
const ICE = "127,212,232";
const EMBER = "255,106,43";

const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const ridge = (x: number, seed: number) =>
  Math.sin(x * 1.3 + seed) * 0.5 + Math.sin(x * 2.9 + seed * 2.1) * 0.3 + Math.sin(x * 6.7 + seed * 3.3) * 0.2;

/** A Lantern in the sky: a hot core, a halo and a four-point glint. */
function lantern(g: CanvasRenderingContext2D, x: number, y: number, r: number, power: number) {
  if (power <= 0.001) return;
  g.save();
  g.globalCompositeOperation = "lighter";
  const halo = g.createRadialGradient(x, y, 0, x, y, r * 9);
  halo.addColorStop(0, `rgba(${AMBER},${0.55 * power})`);
  halo.addColorStop(0.25, `rgba(${AMBER},${0.16 * power})`);
  halo.addColorStop(1, `rgba(${AMBER},0)`);
  g.fillStyle = halo;
  g.fillRect(x - r * 9, y - r * 9, r * 18, r * 18);
  g.strokeStyle = `rgba(255,236,200,${0.5 * power})`;
  g.lineWidth = Math.max(1, r * 0.18);
  g.beginPath();
  g.moveTo(x - r * 3.2, y);
  g.lineTo(x + r * 3.2, y);
  g.moveTo(x, y - r * 3.2);
  g.lineTo(x, y + r * 3.2);
  g.stroke();
  g.fillStyle = `rgba(255,246,226,${power})`;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ───────────────────────────── panels 2 and 3: the city ─────────────────────────────

interface Building {
  x: number;
  w: number;
  h: number;
  dome: boolean;
  cols: number;
  rows: number;
}

function buildings(w: number): Building[] {
  const out: Building[] = [];
  let x = w * 0.16;
  let i = 0;
  while (x < w * 0.84) {
    const bw = w * (0.018 + rnd(i * 3.1) * 0.026);
    const tall = rnd(i * 5.7);
    out.push({
      x,
      w: bw,
      h: 0.05 + tall * tall * 0.2,
      dome: rnd(i * 9.3) > 0.78,
      cols: Math.max(2, Math.round(bw / (w * 0.0075))),
      rows: 3 + Math.floor(tall * 9),
    });
    x += bw + w * (0.004 + rnd(i * 2.3) * 0.01);
    i++;
  }
  return out;
}

interface CityOpts {
  /** where the Lantern is, 0 to 1 across the sky */
  lx: number;
  ly: number;
  /** its brightness, 0 to 1 */
  power: number;
  /** where its beam lands, fraction of width */
  foot: number;
  /** how many city windows are lit by the network, 0 to 1 */
  citypower: number;
  /** how far the shutters have closed, 0 to 1 */
  shutters: number;
  /** collectors charge once the beam has passed them */
  charge: (cx: number) => number;
  beamGlow: (x: number) => number;
}

function drawCity(f: ArtFrame, o: CityOpts) {
  const { g, w, h, t } = f;
  const horizon = h * 0.7;
  const groundY = h * 0.8;

  // sky: transparent at the top so the stars show, deep blue at the horizon
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "rgba(5,7,11,0)");
  sky.addColorStop(0.7, "rgba(11,18,32,0.55)");
  sky.addColorStop(1, "rgba(18,34,56,0.9)");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon + 2);

  const lx = o.lx * w;
  const ly = o.ly * h;
  const footX = o.foot * w;

  // the beam, drawn behind the buildings
  if (o.power > 0.02) {
    g.save();
    g.globalCompositeOperation = "lighter";
    const bw = w * 0.09;
    const grad = g.createLinearGradient(lx, ly, footX, groundY);
    grad.addColorStop(0, `rgba(${AMBER},${0.5 * o.power})`);
    grad.addColorStop(1, `rgba(${AMBER},${0.08 * o.power})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(lx - 2, ly);
    g.lineTo(lx + 2, ly);
    g.lineTo(footX + bw, groundY);
    g.lineTo(footX - bw, groundY);
    g.closePath();
    g.fill();
    g.restore();
  }

  // far ice ridge, cold blue, catching a little of the light
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, horizon + ridge(x / w * 9, 2) * h * 0.035 - h * 0.01);
  g.lineTo(w, h);
  g.closePath();
  const far = g.createLinearGradient(0, horizon - h * 0.05, 0, groundY);
  far.addColorStop(0, "#142238");
  far.addColorStop(1, "#0a1220");
  g.fillStyle = far;
  g.fill();

  // the city: dark towers, cut into the ice
  const city = buildings(w);
  const baseY = groundY;
  let topY = baseY;
  for (const b of city) topY = Math.min(topY, baseY - b.h * h);

  city.forEach((b, i) => {
    const bh = b.h * h;
    const y = baseY - bh;
    const prox = o.beamGlow(b.x + b.w / 2);
    g.fillStyle = "#070c15";
    g.fillRect(b.x, y, b.w, bh + 2);
    if (b.dome) {
      g.beginPath();
      g.ellipse(b.x + b.w / 2, y, b.w / 2, b.w * 0.42, 0, Math.PI, 0);
      g.fill();
    }
    // roof catches the beam
    if (prox > 0.02) {
      g.fillStyle = `rgba(${AMBER},${0.85 * prox * o.power})`;
      g.fillRect(b.x, y - 1, b.w, Math.max(1.5, h * 0.003));
      if (b.dome) {
        g.strokeStyle = `rgba(${AMBER},${0.7 * prox * o.power})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(b.x + b.w / 2, y, b.w / 2, b.w * 0.42, 0, Math.PI, 0);
        g.stroke();
      }
    }
    // windows
    const cw = b.w / b.cols;
    const rh = bh / (b.rows + 1);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const on = rnd(i * 13.1 + r * 7.7 + c * 3.3);
        if (on < 0.28) continue;
        const flick = 0.8 + 0.2 * Math.sin(t * (0.6 + on) + r + c);
        const a = (0.22 + 0.5 * on) * flick * (0.35 + 0.65 * o.citypower) + 0.5 * prox * o.power;
        g.fillStyle = `rgba(${AMBER},${clamp01(a) * (0.35 + 0.65 * o.citypower + prox)})`;
        g.fillRect(b.x + c * cw + cw * 0.22, y + (r + 0.6) * rh, cw * 0.5, rh * 0.45);
      }
    }
  });

  // collector towers: thin masts that turn light into power
  const masts = [0.08, 0.12, 0.88, 0.92];
  masts.forEach((m, i) => {
    const mx = m * w;
    const mh = h * (0.1 + 0.03 * rnd(i + 4));
    const glow = o.charge(mx);
    g.strokeStyle = "#0b121d";
    g.lineWidth = Math.max(2, w * 0.002);
    g.beginPath();
    g.moveTo(mx, baseY);
    g.lineTo(mx, baseY - mh);
    g.stroke();
    g.strokeStyle = `rgba(${AMBER},${0.25 + 0.7 * glow})`;
    g.lineWidth = Math.max(1.5, w * 0.0016);
    g.beginPath();
    g.ellipse(mx, baseY - mh, w * 0.011, w * 0.0036, 0, 0, Math.PI * 2);
    g.stroke();
    if (glow > 0.05) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const hg = g.createRadialGradient(mx, baseY - mh, 0, mx, baseY - mh, w * 0.05);
      hg.addColorStop(0, `rgba(${AMBER},${0.45 * glow})`);
      hg.addColorStop(1, `rgba(${AMBER},0)`);
      g.fillStyle = hg;
      g.fillRect(mx - w * 0.05, baseY - mh - w * 0.05, w * 0.1, w * 0.1);
      g.restore();
    }
  });

  // shutters: slats close over the city from the top down
  if (o.shutters > 0) {
    const n = 22;
    const x0 = w * 0.14;
    const x1 = w * 0.86;
    const y0 = topY - h * 0.02;
    const slat = (baseY - y0) / n;
    const closed = o.shutters * n;
    for (let i = 0; i < n; i++) {
      const k = clamp01(closed - i);
      if (k <= 0) continue;
      const y = y0 + i * slat;
      g.fillStyle = "#080d16";
      g.fillRect(x0, y, x1 - x0, slat * k + 0.5);
      g.fillStyle = `rgba(${ICE},${0.2 * k})`;
      g.fillRect(x0, y + slat * k - 1, x1 - x0, 1);
    }
  }

  // foreground ice, near black
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, groundY + h * 0.02 + ridge(x / w * 6, 7) * h * 0.02);
  g.lineTo(w, h);
  g.closePath();
  const near = g.createLinearGradient(0, groundY, 0, h);
  near.addColorStop(0, "#0a121f");
  near.addColorStop(1, "#04070c");
  g.fillStyle = near;
  g.fill();

  lantern(g, lx, ly, Math.max(3, w * 0.0036), o.power);
}

/** Panel 2: a Lantern crosses the sky and the roofs light up one by one. */
export const cityMorning: Scene = (f) => {
  const u = clamp01(f.t / 15);
  const lx = lerp(-0.04, 1.04, u);
  const ly = 0.3 - 0.12 * Math.sin(Math.PI * u);
  const foot = lx + 0.05;
  drawCity(f, {
    lx,
    ly,
    power: smooth(0, 0.06, u) * (1 - smooth(0.94, 1, u)),
    foot,
    citypower: 0.25 + 0.6 * smooth(0.1, 0.9, u),
    shutters: 0,
    beamGlow: (x) => Math.exp(-(((x / f.w - foot) / 0.1) ** 2)),
    charge: (cx) => {
      const passed = smooth(cx / f.w - 0.1, cx / f.w + 0.02, foot);
      return clamp01(0.55 * passed + 0.6 * Math.exp(-(((cx / f.w - foot) / 0.1) ** 2)));
    },
  });
};

/** Panel 3: the Eclipse. The lamps dim, the shutters close, and a 24-hour dial turns into the dark. */
export const cityEclipse: Scene = (f) => {
  const { g, w, h, p } = f;
  const dim = smooth(0.12, 0.8, p);
  drawCity(f, {
    lx: 0.7,
    ly: 0.2,
    power: 1 - 0.94 * dim,
    foot: 0.62,
    citypower: 1 - 0.85 * dim,
    shutters: smooth(0.2, 0.9, p),
    beamGlow: (x) => Math.exp(-(((x / w - 0.62) / 0.1) ** 2)) * (1 - dim),
    charge: () => 0.55 * (1 - dim),
  });

  // the 24-hour dial
  const R = Math.min(w, h) * 0.085;
  const cx = w - R * 1.9 - w * 0.05;
  const cy = h * 0.2;
  g.save();
  g.lineWidth = Math.max(3, R * 0.14);
  g.lineCap = "butt";
  const a0 = -Math.PI / 2;
  g.strokeStyle = `rgba(${AMBER},0.75)`;
  g.beginPath();
  g.arc(cx, cy, R, a0, a0 + Math.PI * 1.5);
  g.stroke();
  g.strokeStyle = `rgba(${ICE},0.5)`;
  g.beginPath();
  g.arc(cx, cy, R, a0 + Math.PI * 1.5, a0 + Math.PI * 2);
  g.stroke();
  const hour = lerp(16.5, 20.5, p);
  const ang = a0 + (hour / 24) * Math.PI * 2;
  g.strokeStyle = "rgba(255,236,200,0.95)";
  g.lineWidth = Math.max(2, R * 0.06);
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(ang) * R * 0.9, cy + Math.sin(ang) * R * 0.9);
  g.stroke();
  g.fillStyle = "rgba(255,236,200,0.95)";
  g.beginPath();
  g.arc(cx, cy, R * 0.07, 0, Math.PI * 2);
  g.fill();
  g.font = `${Math.max(10, R * 0.2)}px "JetBrains Mono Variable","JetBrains Mono",monospace`;
  g.textAlign = "center";
  g.fillStyle = "rgba(169,182,199,0.85)";
  g.fillText("24 H", cx, cy - R * 1.4);
  g.fillStyle = hour >= 18 ? `rgba(${ICE},0.95)` : `rgba(${AMBER},0.95)`;
  g.fillText(hour >= 18 ? "ECLIPSE · 6 H" : "DAYLIGHT · 18 H", cx, cy + R * 1.65);
  g.restore();
};

// ───────────────────────────── panel 4: the ice stream ─────────────────────────────

const DEBRIS = 70;

export const iceStream: Scene = (f) => {
  const { g, w, h, t, p, imgs } = f;
  const base = Math.min(w, h);

  // debris in three depths: far ones small and slow, near ones large and fast. More arrive as the years pass.
  const count = Math.floor(18 + (DEBRIS - 18) * smooth(0, 0.9, p));
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(rnd(i * 4.3) * 3);
      if (layer !== pass) continue;
      const z = 0.35 + layer * 0.3 + rnd(i * 8.1) * 0.12;
      const size = base * (0.035 + 0.1 * z * rnd(i * 2.9 + 1)) * (1 + 0.5 * layer);
      const speed = (0.03 + 0.09 * z) * w;
      const span = w + size * 4;
      const x = ((rnd(i * 6.1) * span - t * speed) % span + span) % span - size * 2;
      const y = rnd(i * 1.7) * h * 0.9 + (x / w) * h * 0.06 + h * 0.02;
      const img = imgs[`debris_${i % 3}`];
      const rot = rnd(i * 3.7) * 6.28 + t * (rnd(i * 5.5) - 0.5) * 0.7;
      const fade = 0.35 + 0.65 * z;
      // motion streak behind it
      const streak = size * (1.6 + 2.4 * z);
      const sg = g.createLinearGradient(x, y, x + streak, y - streak * 0.06);
      sg.addColorStop(0, `rgba(${ICE},${0.16 * fade})`);
      sg.addColorStop(1, `rgba(${ICE},0)`);
      g.strokeStyle = sg;
      g.lineWidth = Math.max(1, size * 0.18);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + streak, y - streak * 0.06);
      g.stroke();
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.globalAlpha = fade;
      if (img && img.complete && img.naturalWidth) g.drawImage(img, -size / 2, -size / 2, size, size);
      else {
        g.fillStyle = `rgba(${ICE},0.5)`;
        g.beginPath();
        g.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  // a Lantern's hull at the bottom of the frame: dents and scratches add up with the years
  const hy = h * 1.18;
  const hr = w * 0.75;
  g.save();
  g.beginPath();
  g.ellipse(w * 0.5, hy, hr, h * 0.5, 0, 0, Math.PI * 2);
  g.clip();
  const hull = imgs.hull;
  if (hull && hull.complete && hull.naturalWidth) {
    g.globalAlpha = 0.55;
    g.drawImage(hull, 0, h * 0.66, w, h * 0.5);
    g.globalAlpha = 1;
  }
  g.fillStyle = "rgba(5,8,13,0.62)";
  g.fillRect(0, h * 0.6, w, h * 0.5);
  const scars = Math.floor(6 + 70 * p);
  for (let i = 0; i < scars; i++) {
    const sx = rnd(i * 3.3) * w;
    const sy = h * (0.72 + rnd(i * 7.1) * 0.26);
    const len = w * (0.01 + rnd(i * 5.1) * 0.03);
    const a = rnd(i * 9.9) * 3.14;
    g.strokeStyle = `rgba(${ICE},${0.12 + 0.18 * rnd(i)})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = `rgba(${ICE},0.3)`;
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(w * 0.5, hy, hr, h * 0.5, 0, Math.PI * 1.08, Math.PI * 1.92);
  g.stroke();

  // impacts: sparks on the hull, more often as the years go on
  const rate = 0.7 + 3.2 * p;
  for (let k = 0; k < 6; k++) {
    const cycle = 1 / rate + k * 0.4;
    const tt = (t + k * 1.7) % (cycle * 3);
    if (tt > 0.25) continue;
    const ix = w * (0.18 + 0.64 * rnd(Math.floor((t + k * 1.7) / (cycle * 3)) * 11 + k));
    const iy = h * (0.74 + 0.05 * rnd(k * 3 + 1));
    const a = 1 - tt / 0.25;
    g.save();
    g.globalCompositeOperation = "lighter";
    const rg = g.createRadialGradient(ix, iy, 0, ix, iy, base * 0.05);
    rg.addColorStop(0, `rgba(255,236,200,${0.9 * a})`);
    rg.addColorStop(0.3, `rgba(${AMBER},${0.5 * a})`);
    rg.addColorStop(1, `rgba(${AMBER},0)`);
    g.fillStyle = rg;
    g.fillRect(ix - base * 0.05, iy - base * 0.05, base * 0.1, base * 0.1);
    g.restore();
  }

  // the years counting up, and hits per decade climbing
  const years = Math.round(72 * smooth(0, 0.95, p));
  g.save();
  g.textAlign = "left";
  g.fillStyle = `rgba(${ICE},0.95)`;
  g.font = `${Math.max(12, base * 0.034)}px "JetBrains Mono Variable","JetBrains Mono",monospace`;
  const px = w * 0.06;
  const py = h * 0.17;
  g.fillText(`YEAR +${String(years).padStart(2, "0")}`, px, py);
  g.fillStyle = "rgba(169,182,199,0.7)";
  g.font = `${Math.max(9, base * 0.02)}px "JetBrains Mono Variable","JetBrains Mono",monospace`;
  g.fillText("HITS PER DECADE · ILLUSTRATIVE", px, py + base * 0.035);
  const bars = 8;
  const bw = base * 0.026;
  for (let i = 0; i < bars; i++) {
    const filled = smooth(i / bars, (i + 1) / bars, p);
    const bh = base * (0.012 + 0.07 * (0.15 + 0.85 * (i / (bars - 1)) ** 1.8)) * filled;
    g.fillStyle = i > 5 ? `rgba(${EMBER},0.85)` : `rgba(${ICE},0.7)`;
    g.fillRect(px + i * (bw + base * 0.008), py + base * 0.12 - bh, bw, bh);
  }
  g.restore();
};

// ───────────────────────────── panel 5: Lantern 17 ─────────────────────────────

function emberFlicker(t: number) {
  const f = (t % 2.6) / 2.6;
  return (f > 0.46 && f < 0.5) || (f > 0.53 && f < 0.57) ? 0.18 : 1;
}

function hexagon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

export const lantern17: Scene = (f) => {
  const { g, w, h, t, p } = f;
  const base = Math.min(w, h * 1.4);
  const lx = w * 0.3;
  const ly = h * 0.5;
  const flick = emberFlicker(t) * (0.9 + 0.1 * Math.sin(t * 9));
  const power = 0.34 * flick;

  // Lantern 17: a long truss, a cold reactor at one end, a ring of mirror hexagons at the other
  const L = base * 0.36;
  g.save();
  g.translate(lx, ly);
  g.rotate(-0.1);
  g.strokeStyle = "rgba(122,139,163,0.55)";
  g.lineWidth = Math.max(1.5, base * 0.003);
  g.beginPath();
  g.moveTo(-L * 0.5, 0);
  g.lineTo(L * 0.5, 0);
  g.stroke();
  for (let i = -5; i <= 5; i++) {
    g.beginPath();
    g.moveTo(i * L * 0.09, -base * 0.012);
    g.lineTo(i * L * 0.09 + L * 0.045, base * 0.012);
    g.stroke();
  }
  g.fillStyle = "#0b1220";
  g.strokeStyle = "rgba(122,139,163,0.55)";
  g.beginPath();
  g.arc(-L * 0.5, 0, base * 0.026, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // mirror head: seven hexagons, dim
  const hr = base * 0.02;
  const hx = L * 0.5 + hr * 1.6;
  const cells: [number, number][] = [
    [0, 0],
    [1.75, 0],
    [-1.75, 0],
    [0.87, 1.5],
    [-0.87, 1.5],
    [0.87, -1.5],
    [-0.87, -1.5],
  ];
  cells.forEach(([cx, cy], i) => {
    hexagon(g, hx + cx * hr * 0.92, cy * hr * 0.92, hr * 0.9);
    g.fillStyle = `rgba(${AMBER},${(0.05 + 0.1 * power) * (0.6 + 0.4 * rnd(i + 3))})`;
    g.fill();
    g.strokeStyle = `rgba(${AMBER},${0.22 + 0.4 * power})`;
    g.lineWidth = 1;
    g.stroke();
  });
  g.restore();

  // the failing glow
  g.save();
  g.globalCompositeOperation = "lighter";
  const gx = lx + L * 0.5 + hr * 1.6;
  const gr = base * 0.22;
  const glow = g.createRadialGradient(gx, ly - L * 0.05, 0, gx, ly - L * 0.05, gr);
  glow.addColorStop(0, `rgba(${EMBER},${0.55 * power * 2})`);
  glow.addColorStop(0.35, `rgba(${EMBER},${0.14 * power * 2})`);
  glow.addColorStop(1, `rgba(${EMBER},0)`);
  g.fillStyle = glow;
  g.fillRect(gx - gr, ly - L * 0.05 - gr, gr * 2, gr * 2);
  g.restore();

  // the ice body: huge, dark, and nearer every second
  const grow = smooth(0, 1, p);
  const R = base * lerp(0.07, 0.27, grow);
  const cx = lerp(w * 1.02, w * 0.74, grow);
  const cy = lerp(h * 0.34, h * 0.48, grow);
  const N = 30;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = R * (0.82 + 0.3 * rnd(i * 1.9 + 4) + 0.1 * Math.sin(a * 3 + 1));
    pts.push([cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 0.9]);
  }
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  const body = g.createLinearGradient(cx - R, cy, cx + R, cy);
  body.addColorStop(0, "#101a2a");
  body.addColorStop(0.45, "#05080e");
  body.addColorStop(1, "#02040a");
  g.fillStyle = body;
  g.fill();
  const rim = g.createLinearGradient(cx - R * 1.2, cy, cx + R * 0.2, cy);
  rim.addColorStop(0, `rgba(${EMBER},${0.5 * (power + 0.1)})`);
  rim.addColorStop(0.5, `rgba(${ICE},0.28)`);
  rim.addColorStop(1, `rgba(${ICE},0)`);
  g.strokeStyle = rim;
  g.lineWidth = Math.max(1.5, base * 0.003);
  g.stroke();
  // surface cracks
  g.save();
  g.clip();
  g.strokeStyle = `rgba(${ICE},0.07)`;
  g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    const sx = cx + (rnd(i * 2.2) - 0.5) * R * 1.8;
    const sy = cy + (rnd(i * 3.1) - 0.5) * R * 1.4;
    g.moveTo(sx, sy);
    g.lineTo(sx + (rnd(i * 5.5) - 0.5) * R * 0.9, sy + (rnd(i * 7.7) - 0.5) * R * 0.7);
    g.stroke();
  }
  g.restore();

  // its path to the Lantern, a dotted line that crawls toward it
  g.save();
  g.setLineDash([base * 0.008, base * 0.014]);
  g.lineDashOffset = -t * base * 0.03;
  g.strokeStyle = `rgba(${EMBER},${0.35 + 0.25 * grow})`;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(cx - R * 1.2, cy);
  g.lineTo(gx + hr * 3, ly - L * 0.04);
  g.stroke();
  g.restore();

  // the tracking box: red, and honest about what it doesn't know
  const pad = R * 0.28;
  const bx0 = cx - R * 1.25 - pad;
  const bx1 = cx + R * 1.25 + pad;
  const by0 = cy - R * 1.05 - pad;
  const by1 = cy + R * 1.05 + pad;
  const arm = base * 0.026;
  g.save();
  g.strokeStyle = `rgba(${EMBER},0.95)`;
  g.lineWidth = Math.max(1.5, base * 0.003);
  for (const [x, y, dx, dy] of [
    [bx0, by0, 1, 1],
    [bx1, by0, -1, 1],
    [bx0, by1, 1, -1],
    [bx1, by1, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(x, y + dy * arm);
    g.lineTo(x, y);
    g.lineTo(x + dx * arm, y);
    g.stroke();
  }
  const fs = Math.max(10, base * 0.02);
  g.font = `${fs}px "JetBrains Mono Variable","JetBrains Mono",monospace`;
  g.fillStyle = `rgba(${EMBER},0.95)`;
  g.textAlign = "left";
  const tx = Math.min(bx0, w - base * 0.5);
  g.fillText("TRACKED ICE BODY", tx, by0 - fs * 0.6);
  g.fillStyle = "rgba(169,182,199,0.85)";
  const size = 40 + Math.floor(rnd(Math.floor(t * 8) + 3) * 860);
  g.fillText(`SIZE UNCERTAIN · Ø ${size} m ?`, tx, by1 + fs * 1.5);
  g.restore();
};

export const SCENES: Record<number, Scene> = {
  2: cityMorning,
  3: cityEclipse,
  4: iceStream,
  5: lantern17,
};
