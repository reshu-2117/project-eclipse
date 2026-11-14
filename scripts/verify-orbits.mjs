// Verifies the Lantern-17 orbital field without a browser.
//
//   npm run verify:orbits
//
// Checks, in order:
//   1. determinism: the same seed gives the same orbits, a different seed gives different ones
//   2. bounds: no orbit dips into the planet's atmosphere or past the outer limit
//   3. irregularity: radii, periods and inclinations are spread out, not on a grid
//   4. geometry: an independent brute-force + zoom search of orbit-to-orbit distance (it does NOT call
//      the generator's own refinement) shows every pair clears keepOutA + keepOutB + margin
//   5. time: every pair is swept through 24 simulated hours with continuous collision tests
//
// Node strips the TypeScript types on import (Node 22.18+).

import {
  generateField,
  orbitPoint,
  positionAt,
  sweptMinDistance,
  createSafetyMonitor,
  SAFETY_MARGIN_KM,
  MIN_PERIGEE_KM,
  MAX_APOGEE_KM,
  TAU,
} from "../app/components/orbit/sim.ts";

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const t0 = performance.now();
const field = generateField();
const buildMs = performance.now() - t0;
const { bodies, stats } = field;
console.log(`\nField "${field.seed}": ${bodies.length} bodies, ${stats.pairs} pairs, built in ${buildMs.toFixed(0)} ms`);
console.log(
  `  shell-pruned ${stats.prunedByShell}, searched ${stats.sampled} (${stats.cells} cells), ` +
    `adjustments ${stats.adjustments}, rejected proposals ${stats.rejected}\n`,
);

// 1. determinism --------------------------------------------------------------------------------
const again = generateField();
const sig = (f) => JSON.stringify(f.bodies.map((b) => [b.id, b.el, b.keepOutKm, b.adjusted]));
check(sig(field) === sig(again), "same seed reproduces identical orbits");
check(sig(field) !== sig(generateField("another-seed")), "different seed gives a different sky");

// 2. bounds -------------------------------------------------------------------------------------
check(bodies.every((b) => b.rp >= MIN_PERIGEE_KM), "every perigee clears the planet and its atmosphere", `min ${Math.min(...bodies.map((b) => b.rp)).toFixed(0)} km`);
check(bodies.every((b) => b.ra <= MAX_APOGEE_KM), "every apogee is inside the outer limit", `max ${Math.max(...bodies.map((b) => b.ra)).toFixed(0)} km`);
check(bodies.every((b) => b.visualKm <= b.keepOutKm), "drawn size never exceeds keep-out size");

// 3. irregularity -------------------------------------------------------------------------------
const radii = bodies.map((b) => b.el.a).sort((x, y) => x - y);
const gaps = radii.slice(1).map((r, k) => r - radii[k]);
const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
const cv = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length) / mean;
check(cv > 0.6, "radial spacing is irregular, not a grid", `gap coefficient of variation ${cv.toFixed(2)}`);
const periodsH = bodies.map((b) => b.period / 3600);
console.log(`      periods ${Math.min(...periodsH).toFixed(1)} h to ${Math.max(...periodsH).toFixed(1)} h; semi-major axes ${radii[0].toFixed(0)} to ${radii.at(-1).toFixed(0)} km`);
const inc = bodies.map((b) => (b.el.i * 180) / Math.PI);
check(Math.max(...inc) - Math.min(...inc) > 120, "inclinations span a wide range", `${Math.min(...inc).toFixed(0)} to ${Math.max(...inc).toFixed(0)} deg`);
check(inc.some((i) => i > 90), "some orbits are retrograde");
const hero = bodies[0];
check(hero.id === "L-17" && Math.abs(hero.el.e) < 0.1, "Lantern 17 is on a slightly elliptical orbit", `e = ${hero.el.e}, i = ${((hero.el.i * 180) / Math.PI).toFixed(0)} deg`);

// 4. geometry: independent brute-force orbit distance --------------------------------------------
const BRUTE = 720;
const pa = new Float64Array(3);
const pb = new Float64Array(3);
const curve = (b) => {
  const out = new Float64Array(BRUTE * 3);
  for (let k = 0; k < BRUTE; k++) orbitPoint(b, (k * TAU) / BRUTE, out, 3 * k);
  return out;
};
const curves = bodies.map(curve);
const dist = (A, B, u, v) => {
  orbitPoint(A, u, pa);
  orbitPoint(B, v, pb);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
};
// Zoom search: evaluate a 9x9 grid around the seed, recentre on the best, shrink the window.
const zoom = (A, B, u, v) => {
  let span = (2 * TAU) / BRUTE;
  let best = dist(A, B, u, v);
  for (let round = 0; round < 40; round++) {
    let bu = u;
    let bv = v;
    for (let a = -4; a <= 4; a++) {
      for (let b = -4; b <= 4; b++) {
        const d = dist(A, B, u + (a * span) / 4, v + (b * span) / 4);
        if (d < best) {
          best = d;
          bu = u + (a * span) / 4;
          bv = v + (b * span) / 4;
        }
      }
    }
    u = bu;
    v = bv;
    span *= 0.6;
  }
  return best;
};

let worstMargin = Infinity;
let worstPair = "";
let tightest = Infinity;
let geometryOk = true;
let bruteChecked = 0;
for (let i = 0; i < bodies.length; i++) {
  for (let j = i + 1; j < bodies.length; j++) {
    const A = bodies[i];
    const B = bodies[j];
    const required = A.keepOutKm + B.keepOutKm + SAFETY_MARGIN_KM;
    const shellGap = Math.max(A.rp - B.ra, B.rp - A.ra);
    let min;
    if (shellGap >= required) {
      min = shellGap; // |rA - rB| is a hard lower bound on distance
    } else {
      bruteChecked++;
      // brute force over every sampled pair, keep the 4 best distinct seeds, zoom on each
      const sa = curves[i];
      const sb = curves[j];
      const seeds = [];
      for (let u = 0; u < BRUTE; u++) {
        let best = Infinity;
        let bv = 0;
        for (let v = 0; v < BRUTE; v++) {
          const dx = sa[3 * u] - sb[3 * v];
          const dy = sa[3 * u + 1] - sb[3 * v + 1];
          const dz = sa[3 * u + 2] - sb[3 * v + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < best) {
            best = d2;
            bv = v;
          }
        }
        seeds.push({ u, v: bv, d: best });
      }
      seeds.sort((p, q) => p.d - q.d);
      const used = [];
      min = Infinity;
      for (const s of seeds) {
        if (used.length >= 5) break;
        if (used.some((o) => Math.min(Math.abs(o.u - s.u), BRUTE - Math.abs(o.u - s.u)) < 6)) continue;
        used.push(s);
        min = Math.min(min, zoom(A, B, (s.u * TAU) / BRUTE, (s.v * TAU) / BRUTE));
      }
    }
    const margin = min - required;
    tightest = Math.min(tightest, min - A.keepOutKm - B.keepOutKm);
    if (margin < worstMargin) {
      worstMargin = margin;
      worstPair = `${A.id}/${B.id}`;
    }
    if (margin < -0.5) geometryOk = false;
  }
}
check(geometryOk, "independent search: every orbit pair clears keep-out + margin", `${bruteChecked} close pairs searched, tightest pair ${worstPair} at ${worstMargin >= 0 ? "+" : ""}${worstMargin.toFixed(1)} km over the limit`);
check(tightest >= SAFETY_MARGIN_KM - 0.5, "minimum gap between keep-out spheres is at least the safety margin", `${tightest.toFixed(0)} km vs ${SAFETY_MARGIN_KM} km`);
check(Math.abs(stats.minClearanceKm - tightest) < 50 || stats.minClearanceKm <= tightest, "generator's reported clearance agrees", `generator ${stats.minClearanceKm.toFixed(0)} km, independent ${tightest.toFixed(0)} km`);

// 5. time-domain swept collision test ------------------------------------------------------------
const HOURS = 24;
const DT = 20;
const steps = (HOURS * 3600) / DT;
const n = bodies.length;
let prev = new Float64Array(n * 3);
let cur = new Float64Array(n * 3);
bodies.forEach((b, k) => positionAt(b, 0, prev, 3 * k));
let sweptMin = Infinity;
let sweptPair = "";
let hardHits = 0;
let marginHits = 0;
for (let s = 1; s <= steps; s++) {
  const t = s * DT;
  bodies.forEach((b, k) => positionAt(b, t, cur, 3 * k));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = sweptMinDistance(prev, 3 * i, cur, prev, 3 * j, cur);
      const edge = d - bodies[i].keepOutKm - bodies[j].keepOutKm;
      if (edge < sweptMin) {
        sweptMin = edge;
        sweptPair = `${bodies[i].id}/${bodies[j].id}`;
      }
      if (edge < 0) hardHits++;
      else if (edge < SAFETY_MARGIN_KM - 15) marginHits++; // 15 km tolerance for straight-line steps along a curve
    }
  }
  const swap = prev;
  prev = cur;
  cur = swap;
}
check(hardHits === 0, `no keep-out sphere overlaps during ${HOURS} simulated hours`, `${steps} steps x ${stats.pairs} pairs, closest ${sweptPair} with ${sweptMin.toFixed(0)} km to spare`);
check(marginHits === 0, "no pair ever dips inside the safety margin");

// the runtime monitor agrees with the offline sweep
const monitor = createSafetyMonitor(bodies);
for (let t = 0; t <= 6 * 3600; t += 450) monitor.step(t);
check(monitor.stats.violations === 0, "runtime safety monitor reports zero violations", `${monitor.stats.pairsWatched} pairs watched, ${monitor.stats.intervalsChecked} intervals`);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
