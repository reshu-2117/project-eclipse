/**
 * What the flight deck needs to know about the ship the player built in the hangar.
 * Mass and Isp come from the game engine; thrust is new here and tagged like the rest of the game.
 */
import type { EngineId, GameState, ShieldId } from "../game/types";
import { ENGINES, routeTotals } from "../game";
import { dvLeft, isp, shipDryKg } from "../game/engine";
import { G0 } from "./kepler";

export interface Thrust {
  newtons: number;
  source: "real" | "game";
  note: string;
}

/** Main-engine thrust. Real where a flown engine matches the hangar card; a game value where real would take hours. */
export const THRUST: Record<EngineId, Thrust> = {
  biprop: { newtons: 26_700, source: "real", note: "AJ10: 26.7 kN" },
  cluster: { newtons: 1_960, source: "real", note: "4 × R-4D: 490 N each" },
  green: { newtons: 880, source: "game", note: "Real ASCENT thrusters give 1 to 22 N; 880 N keeps a burn to minutes, not days" },
  cryo: { newtons: 99_200, source: "real", note: "RL10: 99 kN" },
  ion: { newtons: 0.24, source: "real", note: "Gridded ion: 0.24 N" },
};

/** Reaction-control thrusters used for docking: two per direction. Real: Draco, 400 N. */
export const RCS = { newtons: 2 * 400, source: "real" as const, note: "2 × Draco-class 400 N per direction" };

/**
 * The biggest ice particle each wall stops at about 7 km/s, cm.
 * NASA rates the ISS Whipple shield at about 1 cm of aluminium (a stuffed Whipple about 1.4 cm, a
 * single wall about 0.3 cm). Ice is a third as dense, and in the ballistic limit equations the critical
 * size goes as density^(−1/3), so ice sizes are ×1.43.
 */
export const BALLISTIC_LIMIT_CM: Record<ShieldId, number> = { none: 0.43, light: 1.43, heavy: 2.0 };

/**
 * The fragment: tracking in low orbit sees objects from about 10 cm, so the one you're warned about is
 * about that size. NASA's collision maths uses a "hard-body radius": your size plus its size.
 * Around it travels a cloud of smaller pieces it has shed.
 */
export const FRAGMENT = { diameterCm: 12, hardBodyM: 5, cloudM: 30 } as const;

function seeded(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * What the pass does. Inside the hard-body radius the fragment itself hits: 12 cm of ice at 7 km/s
 * carries about 20 MJ, more than any shield stops. Inside the cloud, a spray of small pieces hits, sized
 * by a debris power law (more small than large); only those bigger than your shield's limit get through.
 */
export function fragmentDamage(missM: number, shield: ShieldId, seed: number): { hull: number; strikes: number; through: number; direct: boolean } {
  if (missM < FRAGMENT.hardBodyM) {
    const hull = shield === "heavy" ? 40 : shield === "light" ? 50 : 60;
    return { hull, strikes: 1, through: 1, direct: true };
  }
  if (missM > FRAGMENT.cloudM) return { hull: 0, strikes: 0, through: 0, direct: false };
  const rnd = seeded(seed);
  const strikes = Math.round(120 * Math.exp(-(missM - FRAGMENT.hardBodyM) / 7));
  const limit = BALLISTIC_LIMIT_CM[shield];
  let through = 0;
  let hull = 0;
  for (let i = 0; i < strikes; i++) {
    // cumulative size distribution N(>d) ∝ d^-2.5, from 1 mm up
    const d = 0.1 * Math.pow(1 - rnd(), -1 / 2.5);
    if (d > limit) {
      through++;
      hull += Math.min(12, Math.round(3 + 4 * (d / limit - 1)));
    }
  }
  return { hull: Math.min(45, hull), strikes, through, direct: false };
}

/** A slow bump with drifting ice is about momentum, not penetration: damage grows with the energy (½mv²). */
export function bumpDamage(massKg: number, speed: number): number {
  const joules = 0.5 * massKg * speed * speed;
  return Math.max(1, Math.min(35, Math.round(joules / 1500)));
}

export interface ShipSpec {
  engine: EngineId;
  thrustN: number;
  /** effective exhaust velocity, m/s */
  ve: number;
  dryKg: number;
  /** mass at the start of the flight, with the fuel the engine already set aside for this route, kg */
  startKg: number;
  /** Δv in the tank at the start of the flight, m/s */
  dvStart: number;
  /** what the route card set aside for the flight out, m/s (the plan the computer flies) */
  routeDv: number;
  shield: ShieldId;
  lidar: boolean;
  radar: boolean;
  thermal: boolean;
}

/**
 * The ship as it leaves the Wick. The engine has already charged the route's Δv; the flight puts that
 * fuel back in the tank so the pilot spends it burn by burn, then reports only the difference.
 */
export function shipSpec(game: GameState): ShipSpec {
  const ve = isp(game) * G0;
  const dry = shipDryKg(game);
  const routeDv = game.route ? routeTotals(game.route).outDv : 0;
  const nowKg = dry + game.fuelKg;
  const startKg = nowKg * Math.exp(routeDv / ve);
  const sensorLive = (id: string) => game.loadout.sensors.some((s) => s === id) && !game.lostSensors.some((s) => s === id);
  return {
    engine: game.loadout.engine,
    thrustN: THRUST[game.loadout.engine].newtons,
    ve,
    dryKg: dry,
    startKg,
    dvStart: dvLeft(game) + routeDv,
    routeDv,
    shield: game.loadout.shield,
    lidar: sensorLive("lidar"),
    radar: sensorLive("radar"),
    thermal: sensorLive("thermal"),
  };
}

export { ENGINES };
