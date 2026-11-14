import { STRATEGIES, runPolicy } from "@/lib/game";
import type { EndingId } from "@/lib/game";

export type Tally = Record<string, Partial<Record<EndingId, number>>>;

export const TALLY_SEEDS = 8;

/** Every crew flies the mission on several event decks. Good crews should land on the same ending whatever the deck. */
export function computeTally(): Tally {
  const out: Tally = {};
  for (const st of STRATEGIES) {
    const t: Partial<Record<EndingId, number>> = {};
    for (let seed = 1; seed <= TALLY_SEEDS; seed++) {
      const e = runPolicy(seed, st.policy).state.outcome?.ending;
      if (e) t[e] = (t[e] ?? 0) + 1;
    }
    out[st.id] = t;
  }
  return out;
}
