/**
 * Every part in plain words: what it's great for and what it's bad at, the way you'd explain it to a
 * friend. Shown on the hangar cards; the exact numbers stay on the card for anyone who wants them.
 */
export interface Plain {
  best: string;
  worst: string;
}

export const PLAIN: Record<string, Plain> = {
  // hulls
  courier: { best: "Small and light, so it's fast and cheap to fly.", worst: "Not much room. You can't bring everything." },
  tender: { best: "The all-rounder. Room for most things, easy on fuel.", worst: "Too heavy for the fastest route." },
  hauler: { best: "Huge. Carries armour, the robot arm and spare mirrors together.", worst: "Slow, thirsty, and eats most of your money." },

  // engines
  biprop: { best: "Strong and reliable. Starts every time.", worst: "Needs a little power to keep its fuel warm." },
  cluster: { best: "Four small engines: if one breaks, you still get home.", worst: "A bit weaker than one big engine." },
  green: { best: "The safest, simplest fuel.", worst: "Burns through fuel fast, so you need a lot more of it." },
  cryo: { best: "Gets the most out of every drop. The best engine for going fast.", worst: "Its super-cold fuel slowly boils away." },
  ion: { best: "Uses almost no fuel.", worst: "So gentle it would take months. Useless in an emergency." },

  // power
  fuelcells: { best: "Lots of power stored, and it makes drinking water.", worst: "An old cell can lose some of its charge." },
  battery: { best: "Simple and silent.", worst: "Small. It can run flat before the mission ends." },
  reactor: { best: "Power that never runs out.", worst: "Heavy and expensive, and slow to give big bursts." },

  // shields
  none: { best: "No extra weight, so more fuel for flying.", worst: "Every bit of ice hits the hull." },
  light: { best: "Stops the small stuff, like gravel.", worst: "Extra weight you have to push around." },
  heavy: { best: "Shrugs off most of an ice cloud.", worst: "Very heavy. And nothing stops a big chunk: you must dodge it." },

  // sensors
  camera: { best: "Sees cracks up close.", worst: "Can't see heat, and its measurements are rough." },
  thermal: { best: "Sees heat: finds the hidden burn scar and the leak.", worst: "Can't measure how fast things move." },
  lidar: { best: "A 3D map, safe docking, and good measurements.", worst: "Uses some power while it scans." },
  radar: { best: "The most accurate measurements, and early ice warnings.", worst: "The heaviest sensor, and power-hungry." },

  // comms
  radio: { best: "Light and cheap.", worst: "Slow. Big proof files take hours to send." },
  dish: { best: "Fast enough for everything.", worst: "Has to be pointed home to work." },
  laser: { best: "The fastest by far.", worst: "Expensive, and an ice cloud can block it." },
  relay: { best: "Fast and almost weightless.", worst: "Only works at a working Lantern, using the cities' power." },

  // kit
  eva: { best: "Lets you go outside and fix things by hand. Reaches everywhere.", worst: "Slow, risky, and the air runs out." },
  drones: { best: "Quick looks without risking anyone.", worst: "Surface only, and bright light can blind them." },
  arm: { best: "Fixes things without anyone going outside.", worst: "Heavy and slow to reach the far end." },
  optics: { best: "Spare mirror parts: lets you actually fix the mirror.", worst: "Dead weight if you never get to use them." },

  // add-ons
  rtg: { best: "A warm brick that keeps your fuel from freezing.", worst: "Pricey for how little it does." },
  tap: { best: "Free power from the station.", worst: "Every bit you take is light the cities don't get." },

  // suits and mobility
  soft: { best: "Light and easy to move in.", worst: "Less protection near the hot reactor." },
  hard: { best: "Better protection from heat and radiation.", worst: "Heavy and slower to work in." },
  tether: { best: "A safety line: you can't float away.", worst: "Slow, and it can't reach every corner." },
  jetpack: { best: "Fly anywhere around the station, fast.", worst: "Its little fuel tank limits how much you can use it." },
};

export function plainFor(id: string): Plain | undefined {
  return PLAIN[id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id];
}

/** The five routes in plain words. The technical summary stays underneath for anyone who wants it. */
export const PLAIN_ROUTE: Record<string, string> = {
  safe: "The slow, cheap way. Climb up gently, then take five laps to catch Lantern 17. Plenty of fuel left, but you arrive late.",
  quick: "The same climb, but you catch up in one lap. A little more fuel, and you arrive seven hours sooner.",
  fastOut: "Fly almost straight at the station, then come home the gentle way. Arrives early, costs a lot of fuel.",
  fastBoth: "Fast out and fast home. Arrives early, needs a big tank, and rushing home buys you nothing.",
  skipWindow: "Leave right now instead of waiting for the right moment. You must tilt your whole path, which costs a fortune in fuel.",
};
