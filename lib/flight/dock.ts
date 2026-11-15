/**
 * Time-warp for the last kilometre, and the thruster throttle that keeps it safe.
 *
 * Docking is slow by design: a soft capture needs under 0.3 m/s at the ring, and the approach starts about
 * 1 km out, so a careful dock is roughly 15 minutes of mission time. This module lets the player run that
 * time faster without losing control of the ship.
 *
 * Measured with the headless sim on 96 real hand-overs (some 100 m off the ring's axis) and pilots from a
 * per-frame robot to one that leaves a finger on a button for a full second, at 20 to 60 fps: the old
 * automatic rule took about 5 minutes of real time. With these rules "Max" takes about 105 s, 10× about
 * 2 minutes and 5× about 3½. Every capture was soft (0 hard docks in 288 strict-pilot runs), the dock cost the
 * same mission time as a 1× dock (within 2%), hull damage was no higher, and thruster fuel matched a
 * hand-flown 1× dock (5 to 9 m/s). Four rules do the work:
 *
 *  1. The warp is capped by distance. A slip costs little far away, so it can be fast; near the ring one
 *     tap must stay gentle, so it must be slow. The last 15 m always run in real time: at 2× a slow pilot
 *     gets hard docks (9 in 96), at 1× none.
 *  2. Above 2× the thrusters are throttled, so a tap moves the ship the same amount per real second at 20×
 *     as at 2×. Without this, one frame of thrust overshoots the speed you wanted and the pilot (or the
 *     lining-up assist) burns fuel chasing it back: 26 to 73 m/s instead of 5 to 9.
 *  3. The far cap is 20×, not 50×. Throttled thrusters take longer, in mission time, to change speed the
 *     faster time runs: at 50× the dock cost 20 to 40% more mission hours, at 20× it costs the same.
 *  4. Time only runs fast while you are moving or being lined up, so waiting never burns mission hours.
 */

/** What the player picks. "max" means as fast as the distance allows. */
export type DockLevel = 1 | 5 | 10 | "max";

export const DOCK_LEVELS: readonly DockLevel[] = [1, 5, 10, "max"];

/** The default is fast: the dock is the longest quiet stretch of the mission, and the demo is short. */
export const DOCK_DEFAULT: DockLevel = "max";

/** Above this warp the thrusters are throttled by `FULL_THRUST_WARP / warp`. */
export const FULL_THRUST_WARP = 2;

/** The fastest warp the distance to the ring allows: 20× out to 60 m, 10× to 15 m, then real time. */
export function approachCap(range: number): number {
  return range > 60 ? 20 : range > 15 ? 10 : 1;
}

/** Fraction of full thruster force at this warp. 1 up to 2×, then it falls so force × warp stays level. */
export function rcsThrottle(warp: number): number {
  return warp > FULL_THRUST_WARP ? FULL_THRUST_WARP / warp : 1;
}

export interface DockWarp {
  warp: number;
  /** True while time is allowed to run fast. Kept by the caller between frames, to avoid flicker. */
  active: boolean;
}

/**
 * The warp for this frame. Time only runs fast while you are closing in or the ship is still being lined
 * up with the ring (more than 2 m off its axis; the assist walks it across at 0.25 m/s, which can take
 * minutes). A ship sitting still and lined up runs at 1×, so waiting never burns mission hours.
 * `wasActive` gives hysteresis: it takes 0.1 m/s to start and falls back below 0.05 m/s.
 */
export function approachWarp(level: DockLevel, d: { range: number; closing: number; lateral: number }, wasActive: boolean): DockWarp {
  const lining = d.lateral > 2;
  const active = wasActive ? d.closing > 0.05 || lining : d.closing > 0.1 || lining;
  if (!active) return { warp: 1, active };
  const want = level === "max" ? Infinity : level;
  return { warp: Math.min(want, approachCap(d.range)), active };
}

/**
 * Thruster command (-1 to 1) for one axis that moves `have` to `want` in a single frame without
 * overshooting. `accel` is the thruster acceleration at full force, `warp` this frame's time-warp and `dt`
 * the frame's real seconds. This replaces on/off pulses, which chatter once a frame lasts seconds of mission time.
 */
export function assistAxis(want: number, have: number, accel: number, warp: number, dt: number): number {
  const e = want - have;
  if (Math.abs(e) < 0.004) return 0;
  const c = e / (accel * rcsThrottle(warp) * dt * warp);
  return Math.max(-1, Math.min(1, c));
}

/** The next level when stepping with the keyboard. Stops at both ends. */
export function stepLevel(level: DockLevel, dir: 1 | -1): DockLevel {
  const i = DOCK_LEVELS.indexOf(level);
  return DOCK_LEVELS[Math.max(0, Math.min(DOCK_LEVELS.length - 1, i + dir))];
}
