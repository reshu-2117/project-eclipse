/**
 * Seeded random numbers (mulberry32). The state is a single integer kept inside the game state,
 * so the same seed and the same choices always replay to the same mission.
 */
export function nextRandom(state: number): [value: number, next: number] {
  let a = (state + 0x6d2b79f5) | 0;
  const next = a;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  const value = ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export function seedFrom(seed: number): number {
  return (Math.floor(seed) ^ 0x9e3779b9) | 0;
}
