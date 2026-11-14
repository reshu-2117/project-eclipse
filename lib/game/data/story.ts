/**
 * Every spoken and written line of the opening and the briefing, in one file.
 *
 * Story lead: edit the text here. To hear a changed line, run `npm run voice` (needs an ElevenLabs key),
 * which re-records only the lines whose text changed. Keep this file plain data: no imports, no enums,
 * because the voice script reads it directly with Node.
 *
 * Source: Dossier v3 Acts I–II (the narration) and Game Systems Handbook p.4 (the briefing). Lines are
 * shortened from the dossier so the whole opening runs about a minute.
 */

export type VoiceRole = "narrator" | "director" | "crew";

export interface VoiceSpec {
  /** ElevenLabs voice id (a standard, premade voice: works on the free plan through the API). */
  id: string;
  name: string;
  why: string;
  settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number };
}

/**
 * Casting.
 *
 * The narrator is an elder telling the tale: "Let me tell you about a world…". George is warm, a little raspy
 * and British, a storyteller rather than a newsreader, and we slow him to 80% (about 2.7 words a second) so each line has room to land.
 * Stability is kept low-middle so he breathes and leans on words instead of reading flat.
 *
 * The Director is the opposite: Network Ops at the end of a bad night. Sarah is mature, confident and
 * reassuring, and a different accent and register from the narrator, so the two voices never blur. Higher
 * stability and no extra style keep her clipped and calm, like someone who has said this many times tonight.
 */
export const VOICES: Record<VoiceRole, VoiceSpec> = {
  narrator: {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    why: "Warm, raspy British storyteller. Sounds like someone telling a tale, not reading news.",
    settings: { stability: 0.48, similarity_boost: 0.78, style: 0.32, use_speaker_boost: true, speed: 0.8 },
  },
  director: {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    why: "Mature, confident, reassuring. Calm authority, and a clear contrast with the narrator.",
    settings: { stability: 0.62, similarity_boost: 0.8, style: 0.12, use_speaker_boost: true, speed: 0.95 },
  },
  // The distress call is a third voice: Liam, a young American man (articulate, clear), pushed to low stability
  // and high style so he sounds strained and a little too fast, like someone talking over a failing radio.
  crew: {
    id: "TX3LPaxmHKxFdv7VOQHJ",
    name: "Liam",
    why: "Young, clear American voice. Pushed to sound strained, for the crew in trouble.",
    settings: { stability: 0.28, similarity_boost: 0.72, style: 0.55, use_speaker_boost: true, speed: 1.1 },
  },
};

export const VOICE_MODEL = "eleven_multilingual_v2";

/** Other voices we auditioned, kept so the team can hear them on /lab and swap with one edit above. */
export const AUDITION: { role: VoiceRole; id: string; name: string; note: string }[] = [
  { role: "narrator", id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "Warm, raspy British storyteller (chosen)" },
  { role: "narrator", id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", note: "Raspy, characterful British woman" },
  { role: "narrator", id: "nPczCjzI2devNBz1zQrb", name: "Brian", note: "Deep, resonant, comforting American" },
  { role: "director", id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "Mature, confident, reassuring (chosen)" },
  { role: "director", id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", note: "Steady British broadcaster" },
  { role: "director", id: "pNInz6obpgDQGcFmaJgB", name: "Adam", note: "Deep, dominant, firm" },
];

export interface VoiceLine {
  /** also the audio file name: /audio/<id>.mp3 */
  id: string;
  role: VoiceRole;
  text: string;
}

export interface OpeningPanel {
  n: number;
  /** the line the narrator speaks and the screen types */
  line: VoiceLine;
  /** small caption, bottom left */
  caption: string;
  /** small tag, top right, in the ship's mono type */
  tag: string;
  /** honesty label: real physics or story */
  truth?: { kind: "real" | "fiction"; text: string };
}

export const OPENING: OpeningPanel[] = [
  {
    n: 1,
    line: {
      id: "op-1",
      role: "narrator",
      text: "Let me tell you about a world that never sees a sunrise.",
    },
    caption: "ECLIPSE-01 · A ROGUE PLANET · NO HOST STAR",
    tag: "FIL-DAY 26,298",
    truth: { kind: "real", text: "Rogue planets exist: worlds thrown out of their systems." },
  },
  {
    n: 2,
    line: {
      id: "op-2",
      role: "narrator",
      text: "People live beneath the ice, because of one thing they built. Stations in orbit, called Lanterns, turn fusion into light. For these people, that is what morning means.",
    },
    caption: "THE LANTERN NETWORK · 24 STATIONS",
    tag: "FIL-DAY 26,298",
    truth: { kind: "fiction", text: "Fusion-powered light stations are the story's invention." },
  },
  {
    n: 3,
    line: {
      id: "op-3",
      role: "narrator",
      text: "Each day, the network gives eighteen hours of light. Then the great lamps dim. For six hours, the whole world waits in the Eclipse. People scheduled it.",
    },
    caption: "THE ECLIPSE · 6 HOURS OF EVERY 24",
    tag: "ECLIPSE",
    truth: { kind: "fiction", text: "The six-hour Eclipse is invented for the game." },
  },
  {
    n: 4,
    line: {
      id: "op-4",
      role: "narrator",
      text: "Seventy-two years ago, the planet drifted into a stream of ice. The hits started coming. Then they started coming more often.",
    },
    caption: "THE FILAMENT · 72 YEARS",
    tag: "72 YEARS",
    truth: { kind: "fiction", text: "A normal cloud in interstellar space does not behave like this. We made it up." },
  },
  {
    n: 5,
    line: {
      id: "op-5",
      role: "narrator",
      text: "One of the stations in danger is Lantern 17. And something very large is coming for it.",
    },
    caption: "LANTERN 17 · OPTICS DAMAGED",
    tag: "TRACKED ICE BODY",
  },
];

/** The title card between the opening and the briefing. */
export const TITLE_CARD = {
  kicker: "NASA SPACE APPS 2026 · SPACE MISSION DESIGN GAME",
  title: "Project Eclipse",
  line1: "There is no sunrise on this world.",
  line2: "So they built one.",
};

/** What the briefing terminal prints. Values marked {…} are filled from the engine's constants. */
export const BRIEFING_HEADER = "NETWORK OPS · CH 01";

export const DIRECTOR_BRIEF: VoiceLine = {
  id: "dir-brief",
  role: "director",
  text: "Find out what's wrong. Fix what you can. Bring the data home. You're one of three hundred crews out tonight.",
};

export const DIRECTOR_ACCEPT: VoiceLine = {
  id: "dir-accept",
  role: "director",
  text: "Then go. The Wick is waiting, and the clock is already running.",
};

/** The Director in the hangar. */
export const HANGAR_ENTER: VoiceLine = {
  id: "dir-hangar",
  role: "director",
  text: "Welcome to the Wick. Four bays, a readiness review, then the gantry. Every part you pick has a price.",
};

export const HANGAR_REVIEW: VoiceLine = {
  id: "dir-review",
  role: "director",
  text: "Readiness review. Read every red flag. If you launch with them, you own the risk.",
};

export const HANGAR_LAUNCH: VoiceLine = {
  id: "dir-launch",
  role: "director",
  text: "Gantry is clear. Launch.",
};

/** The route screen and the arrival. */
export const ROUTE_ENTER: VoiceLine = {
  id: "dir-route",
  role: "director",
  text: "Pick your route. Fast costs fuel. Slow costs time. Either way, you pay.",
};

export const ARRIVE: VoiceLine = {
  id: "dir-arrive",
  role: "director",
  text: "Docking complete. You are on Lantern 17. The clock is yours.",
};

/** The flight deck: the Director talks the pilot through the moments that matter. */
export const FLY_START: VoiceLine = {
  id: "dir-fly",
  role: "director",
  text: "This one's yours. The computer plots the burns, but you fly them. Hold the burn when it tells you. And remember: in orbit, nothing works the way your gut says.",
};

export const FLY_BRAKE: VoiceLine = {
  id: "dir-brake",
  role: "director",
  text: "Lantern 17 is ahead of you. To catch it, you brake. A lower orbit is a faster one. Trust the maths.",
};

export const FLY_ALERT: VoiceLine = {
  id: "dir-ice",
  role: "director",
  text: "Collision warning. A fragment of ice is crossing your path, and tracking can't promise a miss. A small burn now costs almost nothing. Later, it costs everything.",
};

export const FLY_APPROACH: VoiceLine = {
  id: "dir-approach",
  role: "director",
  text: "There she is. Thrusters only from here. Slow is smooth, and smooth is fast. Touch the ring at less than a third of a metre per second.",
};

/** The Director at the station: a handful of lines at the moments that matter. No spoilers. */
export const STATION_ENTER: VoiceLine = {
  id: "dir-station",
  role: "director",
  text: "Lantern 17. Fly a survey first. You can't fix what you can't see.",
};

export const STATION_CLUE: VoiceLine = {
  id: "dir-clue",
  role: "director",
  text: "That's a clue. Pin it. Keep looking.",
};

export const STATION_LEAK: VoiceLine = {
  id: "dir-leak",
  role: "director",
  text: "Ammonia. The coolant is leaking, and the reactor will shut itself down if it isn't patched. Watch that clock.",
};

export const STATION_TEST: VoiceLine = {
  id: "dir-test",
  role: "director",
  text: "Test complete. Whatever you measured, that number is yours now.",
};

export const CHOICE_ENTER: VoiceLine = {
  id: "dir-choice",
  role: "director",
  text: "This is the part you can't take back. Think about the cities, and about the clock.",
};

export const DEPART: VoiceLine = {
  id: "dir-depart",
  role: "director",
  text: "Undocking. Bring the data home.",
};

/** The other crew's mayday, the distress call card (E4). Their log holds clue C5 if you help. */
export const DISTRESS: VoiceLine = {
  id: "crew-distress",
  role: "crew",
  text: "Mayday, mayday. This is crew Tern Nine. Our drive is dead and we are tumbling. We cannot hold attitude. Anyone in range, please.",
};

/** What the officials know, and what they don't. The player discovers the real causes; the briefing doesn't spoil them. */
export const UNKNOWNS = [
  {
    key: "size",
    title: "How big is the ice?",
    text: "Tracking was done with poor data. It could be a small chunk, or something much worse.",
  },
  {
    key: "silent",
    title: "Why is Lantern 17 silent?",
    text: "Three telemetry channels have gone quiet. The Network Ops crew can't say why.",
  },
  {
    key: "falling",
    title: "Why is the light falling?",
    text: "Output is down to 61% and still dropping. Nobody has a cause. Somebody has to go and look.",
  },
];

/** The five meters the whole game is played on, introduced in the briefing. Handbook p.10. */
export const METERS = [
  { key: "dv", name: "Δv", full: "Speed budget", text: "How much you can change your speed. Every move spends some. Less fuel or more mass means less." },
  { key: "energy", name: "Energy", full: "Stored kWh", text: "Life support, heaters, sensors and radios all drain it. At zero, the mission ends." },
  { key: "time", name: "Time", full: "Two clocks", text: "The ice is coming. Something else may be running out too. Every action spends hours." },
  { key: "evidence", name: "Evidence", full: "0 to 100", text: "Points from clues and from your own test. It decides whether the world believes you." },
  { key: "light", name: "City light", full: "4 reserve bars", text: "The four settlements' reserves. They drop while Lantern 17 is dark or pointed away." },
] as const;

export const ONE_RULE = "Every choice must gain something and cost something.";

export const DISCLAIMER =
  "Project Eclipse uses a fictional planetary system and future technology. Its mission choices are inspired by real orbital mechanics, spacecraft engineering, energy limits and proposed remote-deflection physics. Values are simplified for learning.";

export const CREDITS_VOICE = "Narration and Director voices generated with ElevenLabs (AI).";

/** Every line that gets recorded. */
export const ALL_LINES: VoiceLine[] = [
  ...OPENING.map((p) => p.line),
  DIRECTOR_BRIEF,
  DIRECTOR_ACCEPT,
  HANGAR_ENTER,
  HANGAR_REVIEW,
  HANGAR_LAUNCH,
  ROUTE_ENTER,
  FLY_START,
  FLY_BRAKE,
  FLY_ALERT,
  FLY_APPROACH,
  ARRIVE,
  STATION_ENTER,
  STATION_CLUE,
  STATION_LEAK,
  STATION_TEST,
  CHOICE_ENTER,
  DEPART,
  DISTRESS,
];
