"use client";

import { BELIEF, CLOCKS, CLUES, evidence, hasSensor, reactorClock, testUnlocked } from "@/lib/game";
import type { Action, GameState, Option } from "@/lib/game";
import type { VoiceLine } from "@/lib/game/data/story";

export const r0 = (n: number) => Math.round(n).toLocaleString("en-US");
export const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

/** Everything a step needs: the game, what the engine would allow, and one way to do something. */
export interface QuestCtx {
  game: GameState;
  opts: Option[];
  run: (a: Action, kind?: "lock" | "radio" | "thump") => void;
  say: (line: VoiceLine) => void;
  from: number | null;
  flash: string | null;
}

export type StepId = "look" | "investigate" | "fix" | "prove" | "report";

export const STEPS: { id: StepId; title: string; sub: string }[] = [
  { id: "look", title: "Look around", sub: "Fly a lap of the station" },
  { id: "investigate", title: "Investigate", sub: "Search the six zones for clues" },
  { id: "fix", title: "Fix problems", sub: "Patch what is broken" },
  { id: "prove", title: "Prove it", sub: "Rule out wrong ideas, run the test" },
  { id: "report", title: "Tell the world", sub: "Send your report" },
];

/** How many of the four "scene" clues (C1 to C4) have been pinned. */
export const sceneClues = (g: GameState) => (["C1", "C2", "C3", "C4"] as const).filter((c) => g.found.includes(c)).length;
export const clueCount = (g: GameState) => g.found.filter((f) => f in CLUES).length;
export const hazardsFound = (g: GameState) => (["leak", "drift"] as const).filter((h) => g.found.includes(h));
export const hazardOpen = (g: GameState): ("leak" | "drift")[] => {
  const out: ("leak" | "drift")[] = [];
  if (g.found.includes("leak") && !g.leakPatched) out.push("leak");
  if (g.found.includes("drift") && !g.driftFixed) out.push("drift");
  return out;
};

export function stepDone(g: GameState, s: StepId): boolean {
  switch (s) {
    case "look":
      return g.surveyed;
    case "investigate":
      return sceneClues(g) >= 2;
    case "fix":
      return hazardsFound(g).length > 0 && hazardOpen(g).length === 0;
    case "prove":
      return !!g.test;
    case "report":
      return !!g.broadcast;
  }
}

/** The one thing to do next, in plain words. */
export function coach(g: GameState): { step: StepId; title: string; text: string } {
  const reactor = reactorClock(g);
  if (!g.surveyed)
    return { step: "look", title: "Fly a lap of the station", text: "You cannot fix what you cannot see. A quick survey shows you where the six zones are." };
  if (reactor !== null && reactor < 8)
    return { step: "fix", title: "Patch the leak, quickly", text: `The reactor will shut itself down in ${r1(Math.max(0, reactor))} hours unless you patch the coolant leak.` };
  if (sceneClues(g) < 2)
    return {
      step: "investigate",
      title: "Search the zones for clues",
      text: hasSensor(g, "lidar") || g.zonesKnown.length > 3 ? "Zones marked in orange are damaged. Try The Petals (the mirror) and the Sensor mast (the logbook)." : "Pick a zone on the map and choose how to look at it. The far zones take longer.",
    };
  if (hazardOpen(g).length)
    return { step: "fix", title: "Something is broken", text: "You found a problem. Fixing it now is cheaper than fixing it later." };
  if (!g.test && testUnlocked(g))
    return { step: "prove", title: "Run the test", text: "You have enough clues. Aim the cracked mirror at a block of ice and measure how much it moves. That is real proof." };
  if (!g.test)
    return { step: "prove", title: "Rule out a wrong idea", text: "Two of the three explanations are wrong. Cross one off when your clues allow it, and the test unlocks." };
  if (!g.broadcast)
    return { step: "report", title: "Tell the world", text: "Send your report to the network. Nothing you found helps anyone until it arrives." };
  return { step: "report", title: "You are ready to decide", text: "When you have done everything you can, press the big decision button at the bottom. You cannot come back." };
}

/** A short list of what the network wants before it will believe a report. */
export function beliefChecks(g: GameState, arriveT: number) {
  const ev = evidence(g);
  return [
    { ok: ev >= BELIEF.minEvidence, text: `${BELIEF.minEvidence} or more proof points (you have ${ev})` },
    { ok: !!g.test, text: "A measured test result" },
    { ok: !!g.test && g.test.bandPct <= BELIEF.maxBandPct, text: `A measurement accurate to ±${BELIEF.maxBandPct}% or better${g.test ? ` (yours: ±${g.test.bandPct}%)` : ""}` },
    { ok: arriveT <= CLOCKS.iceTrueH, text: `A report that arrives before the ice hits (hour ${CLOCKS.iceTrueH})` },
  ];
}

export function Latest({ game, from }: { game: GameState; from: number | null }) {
  const entries = from === null ? [] : game.log.slice(from).filter((e) => e.title !== "Docked at Lantern 17");
  if (!entries.length) return null;
  return (
    <section className="sq-latest" aria-live="polite" aria-label="What just happened">
      <p className="sq-eyebrow">What just happened</p>
      {entries.map((e) => (
        <p key={e.n} className={e.kind}>
          <b>{e.title}.</b> {e.text}
        </p>
      ))}
    </section>
  );
}

