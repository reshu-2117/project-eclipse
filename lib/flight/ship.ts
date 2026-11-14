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

/** Hull damage from one ice hit, by shield (game values, matching the event cards' scale). */
export const ICE_HIT: Record<ShieldId, { fast: number; perMps: number }> = {
  none: { fast: 30, perMps: 9 },
  light: { fast: 16, perMps: 5 },
  heavy: { fast: 7, perMps: 2 },
};

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
