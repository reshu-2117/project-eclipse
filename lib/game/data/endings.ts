/**
 * Every ending and what triggers it. Handbook page 19, plus "Saved, but stranded" from the Round 2 deck,
 * so all four endings promised in Round 2 are still in the game.
 *
 * The headline ending is about the discovery: did proof reach the network in time, and was it believed?
 * Station, cities and crew are scored separately in the debrief, because (as the dossier says)
 * scientific success and operational success are not always the same thing.
 */
import type { EndingId } from "../types";

export type Tier = "best" | "win" | "price" | "partial" | "notWin" | "loss";

export interface Ending {
  id: EndingId;
  name: string;
  tier: Tier;
  tierLabel: string;
  trigger: string;
  line: string;
}

export const ENDINGS: Record<EndingId, Ending> = {
  somethingInTheDark: {
    id: "somethingInTheDark",
    name: "Something in the dark",
    tier: "best",
    tierLabel: "Best",
    trigger: "First Light, and you helped the distress crew, and you found all 6 clues.",
    line: "Two crews saw it. You proved it. Now every Lantern knows how to turn.",
  },
  firstLight: {
    id: "firstLight",
    name: "First Light",
    tier: "win",
    tierLabel: "Full win",
    trigger: "Core or Full packet arrives before impact, evidence ≥ 80, test band ±15% or better, crew home.",
    line: "The light humanity built to survive the darkness may be the light that defends it from the dark.",
  },
  firstLightStranded: {
    id: "firstLightStranded",
    name: "First Light, stranded",
    tier: "price",
    tierLabel: "Win, at a price",
    trigger: "As First Light, but not enough Δv or power to get home.",
    line: "The network believed you. Now somebody has to come and get you.",
  },
  dismissed: {
    id: "dismissed",
    name: "Dismissed",
    tier: "partial",
    tierLabel: "Partial",
    trigger: "Sent in time, but evidence below 80, no tight measurement, or the Summary only.",
    line: "Stations reply: “Probably a sensor error.”",
  },
  filedUnread: {
    id: "filedUnread",
    name: "Filed. Unread.",
    tier: "notWin",
    tierLabel: "Not a win",
    trigger: "You had the proof, never sent it in time, and Lantern 17 was lost.",
    line: "Your report sits in an archive queue as the ice arrives.",
  },
  homeSafe: {
    id: "homeSafe",
    name: "Home safe",
    tier: "partial",
    tierLabel: "Partial",
    trigger: "Lantern 17 survived and the crew came home, but the discovery was never shared.",
    line: "The station stands. Nobody else knows how.",
  },
  savedButStranded: {
    id: "savedButStranded",
    name: "Saved, but stranded",
    tier: "price",
    tierLabel: "At a price",
    trigger: "Lantern 17 survived, the discovery was never shared, and the crew can't get home.",
    line: "You held the station. Now you wait in the dark for a ride.",
  },
  lantern17Lost: {
    id: "lantern17Lost",
    name: "Lantern 17 lost",
    tier: "loss",
    tierLabel: "Loss",
    trigger: "The reactor shut down, or the ice hit, and no proof reached the network.",
    line: "One more light goes out over Ember Hollow.",
  },
};

export const ENDING_ORDER: EndingId[] = [
  "somethingInTheDark",
  "firstLight",
  "firstLightStranded",
  "savedButStranded",
  "homeSafe",
  "dismissed",
  "filedUnread",
  "lantern17Lost",
];
