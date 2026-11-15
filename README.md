# Project Eclipse

**There was no sunrise on this world. So they built one.**

A NASA Space Apps entry (Space Mission Design Game). Eclipse-01 is a sunless rogue planet kept alive by 24 orbital Lanterns. Lantern 17 has gone dark, and the player is the engineer sent to relight it.

## Design: "Cold world, warm light"

- Everything frozen (planet, ice, data) is blue-grey and cyan. Everything human (Lanterns, buttons, choices) is amber.
- Palette: Void `#05070B`, Deep orbit `#0B1220`, Hull steel `#1A2433`, Ice signal `#7FD4E8`, Frost `#DCE6F0`, Telemetry `#7A8BA3`, Lantern amber `#FFB547`, Ember alert `#FF6A2B`.
- Type: Cormorant Garamond (story voice), Inter (UI), JetBrains Mono (machine/telemetry). Self-hosted with Fontsource.
- Textures in `public/textures/` are procedurally generated (planet surface, starfield, frost, hull metal, ice debris, film grain).

## Run locally

```bash
npm install
npm run dev
```

Code lives in `app/components/`: `Hud`, `Hero` (orbit + flashlight), `Network`, `Transmission`, `MissionDesigner`, `Sections` (world, systems, crew, footer).

## Hero constellation

The 24 Lanterns in the hero fly a Walker Delta 56°:24/3/1 constellation, the pattern used by the Galileo navigation satellites: 3 circular orbital planes inclined 56°, ascending nodes 120° apart, 8 Lanterns per plane, with neighbouring planes phased 15° apart so no two Lanterns ever meet where the planes cross. All Lanterns share one altitude and one period, so the network turns as a rigid lattice. Rings, light trails and Lanterns are drawn on two canvases (behind and in front of the planet) from one projection function, so every Lantern stays exactly on its ring. Lanterns move prograde, with the planet's surface, and disappear only when they pass behind the planet's disc.

The planet itself is a WebGL shader (`app/components/heroPlanet.ts`) lit only by the 24 Lanterns, since Eclipse-01 has no sun. Each Lantern is a light with inverse-square falloff and a reflector aimed at the planet's centre, so it throws a pool of warm light onto the ice beneath it. The ice adds a specular glint and a blue subsurface glow at the pool's edge, and a thin haze at the limb scatters light from Lanterns near or just behind it. Damaged Lanterns run at the output shown on the Network board; Lantern 17 is a flickering ember until the repair relights it, and its pool comes back. Without WebGL the CSS planet is shown instead.

## Orbital view

`OrbitalSection` (the `#orbit` section) is a 3D simulation of Lantern 17 and its surroundings, built with Three.js. It loads only when the section nears the viewport.

- **Scale:** 1 scene unit = 1,000 km. Planet radius 6,371 km, mu = 398,600 km³/s². Everything flies close to the planet: Lanterns between about 1,100 and 4,900 km altitude (Lantern 17: 1,441 to 4,417 km), the whole field within about 9,000 km of the surface. Objects are drawn far larger than real hardware (a Lantern is drawn 80 km in radius), and each keeps a safety zone of the same size.
- **Time:** ×900 by default (×300 and ×2,700 in the controls). One Lantern 17 orbit takes about 10 seconds at ×900.
- **Light:** no sun. Every Lantern is a point light with inverse-square falloff, so each throws a pool of light onto the ice below it, and the glazed ice reflects it. A faint cold starlight rim is the only other light. Desktop adds an HDR bloom pass; phones share five Lantern lights among the Lanterns facing the camera.
- **Physics:** simplified two-body Kepler orbits, solved analytically, so position is an exact function of time.
- **Sky:** `app/components/orbit/sim.ts` generates 63 objects from a fixed seed (`FIELD_SEED`). The same seed always gives the same sky. Every pair of paths is checked so they never come closer than their safety zones plus 70 km, at any time. Paths that fail are nudged apart and re-tested.
- **Verify:** `npm run verify:orbits` re-checks the generated sky with an independent search and a 24-hour swept collision test.
- **Controls:** drag to rotate. Click the view (or use "Control camera" on touch devices) to unlock wheel and pinch zoom. "Follow L-17" rides along with the Lantern.

Code: `app/components/OrbitalSection.tsx` (UI), `app/components/orbit/` (`sim.ts` model, `scene.ts` Three.js scene, `field.worker.ts` and `loadField.ts` for off-thread generation).


## Game engine (Chunk 0)

The whole mission runs on a pure TypeScript engine in `lib/game/`, separate from any screen. It follows the Game Systems Handbook v2.

- **One rule for every click:** `step(state, action)` checks the phase and the resources, returns a new state plus a readable ledger line, or rejects with a reason and changes nothing.
- **Replayable:** a run is a seed plus a list of actions (`replay(seed, actions)`). The same inputs always give the same mission. The ledger, "Replay with one change" and the ghost run all come from this.
- **Data as tables:** hulls and parts (`data/ship.ts`), routes (`data/routes.ts`), event cards E1–E8 (`data/events.ts`), Lantern 17's zones, clues, explanations and settlements (`data/station.ts`), endings (`data/endings.ts`) and "In real life" cards (`data/realLife.ts`). Every row is tagged `real`, `game` or `fiction`.
- **Real physics** (`physics.ts`): the ideal rocket equation, Hohmann transfers, plane changes, comms time, the ablation test push, and the ice deflection integrated minute by minute.
- **Balance numbers** live in `constants.ts`. Change one there and the whole game follows.

Design decisions made in Chunk 0 (where the handbook left a gap):

1. **Fast transfers are direct intercepts.** In the handbook, the fast route still waited for catch-up orbits, so it cost more *and* arrived later than the quick catch-up. Now every route buys time with fuel: safe 12.6 h, quick 5.6 h, fast out 3.4 h, skip the window 2.6 h.
2. **The network can deflect the ice.** A believed Core or Full packet brings 3 or 5 more Lanterns onto the ice an hour after it arrives. Alone, one Lantern needs about 21 h of beaming, so only a fast, lean crew can save the station by itself. A crew that proves it and sends it early can save it with help. A crew on the safe route arrives too late either way.
3. **Discovery and survival are scored separately.** The headline ending is about the proof: was it sent, in time, and believed? Station, cities and crew are shown alongside it. "Saved, but stranded" from the Round 2 deck is back as the eighth ending.
4. **You send one packet, whenever you choose.** You can transmit as soon as you're at the station. Sending early helps the network turn sooner, but the network judges the evidence you had at that moment.
5. **City reserves drain by the light they're missing,** not only when Lantern 17 is fully dark. Fixing the drift slows the drain. Beaming during the Eclipse costs the cities nothing.

Tests: `npm test` (137 tests). They re-derive every handbook number, check the rules, play scripted crews to prove that all 8 endings can be reached, fly every route through the real flight physics with a robot pilot, and check the piloted engine actions.

**The mission:** `/mission` is playable end to end: build a ship at the Wick, choose a route, **fly it yourself** on the flight deck (real burns, an ice fragment, three event cards, docking on thrusters), then continue on the Station Mission page (`/station`): look around, investigate, fix problems, prove it, tell the world, make the big decision, hold or leave, and read the debrief. The Station Mission is written in plain words for teenagers, with a coach that tells you the next move.

**Mission Lab:** `/lab` is the proof page. It re-derives ten handbook numbers with the engine, checks every ship against every route, and lets you watch nine scripted crews fly whole missions to all eight endings. The Lab hero and the game's flight map use the same Lantern network and planet as the home page, and show it in the phase the mission is in: failing, in the Eclipse, dark, or restored.

## AI use

Project Eclipse was built with AI assistance, and we declare it here as the NASA Space Apps rules ask. After the team's initial project scaffold, the code in this repository (the front end, the game engine and its tests) was written and reviewed by Claude Code (Anthropic's Claude) working from the team's design documents. Each of those commits carries a `Co-Authored-By` trailer naming it. No generative AI was used for images or video: every visual is drawn in code, and the textures are procedural. The Director's spoken lines and the other crew's radio call are AI-generated with ElevenLabs text-to-speech. Each audio file says so in its metadata, the start screen says so, and `npm run voice` (see `scripts/generate-voice.mjs`) regenerates them. The world, story and game design come from the team's own documents (World-Building Dossier v3 and Game Systems Handbook v2). Nothing here uses NASA logos, flags or mission identifiers.

## The Wick (hangar) at /mission

The first player-facing stage. Players build a ship in four bays (hull, parts, suits, readiness review), watch a blueprint assemble as they pick, and launch.

- **Every click goes through the engine** (`app/mission/Mission.tsx` calls `step()`), so a refusal shows the engine's own reason, and the numbers on screen (Δv, mass, energy, bay, budget, route fit) are the engine's.
- **Blueprint** (`app/mission/Blueprint.tsx`): one SVG sheet; each hull has its own outline and anchor points, and every part has a drawing that slides in and locks.
- **Starter packages** (`lib/game/presets.ts`): five one-click ships for a first-timer, shown at the top of the hangar with a plain "pick this if" line and facts read off the loadout. Each has no red flags, a thermal camera, a measuring sensor and suits, and the tests prove each launches and wins for a careful scripted crew. Take one and go straight to the launch check.
- **Docking time-warp** (`lib/flight/dock.ts`): 1×, 5×, 10× and Max while docking. The distance caps it (the last 15 m are always real time) and the thrusters are throttled above 2×, so a tap stays gentle. Max docks in about 105 s instead of about 5 minutes, always softly.
- **Runs are saved** in `sessionStorage` as a seed plus the list of actions, so a refresh offers "Continue your mission".
- **Sound and voice** have separate switches (`app/mission/audio.ts`); both remembered. Sound is made in the browser; the voice lines are recorded files in `public/audio`.
- Respects reduced motion; works with the keyboard alone and at phone width.

## The flight deck (also at /mission)

You fly from the Wick (300 km) to Lantern 17 (1,000 km) yourself, under real gravity. Start it from the route screen, or with "Jump to the flight" on the `/mission` start screen.

- **Physics** (`lib/flight/`, pure TypeScript, tested): coasting is exact (universal-variable Kepler propagation), burns are integrated with RK4 under gravity, mass falls with the rocket equation, and the ship's attitude slews at a real thruster rate, so burning before you're pointed right wastes fuel. Earth-size planet, as the engine uses.
- **The flight computer** (`lib/flight/plan.ts`) builds each route card as real burns. They come out at the handbook's numbers, and tests check it: Hohmann 376 m/s in 49 min, catch-up 27 or about 136 m/s, a 10° plane change 1,282 m/s, and the fast intercept angle solved so it costs exactly 1,252 m/s in 22 minutes. It locks each burn as a fixed vector, cuts the engine on target (Guide on), corrects a sloppy burn with the next one (a 1-D phasing solve for multi-orbit legs, Levenberg–Marquardt shooting otherwise), and flies a terminal transfer if you arrive off the mark. Miss a burn badly and it re-plans a direct intercept (Lambert).
- **You fly it** (`app/mission/flight/FlightDeck.tsx`): hold BURN (Space) when the countdown reaches zero; aim by Computer, prograde, retrograde, radial and normal; time-warp up to 1000×, which stops itself before burns, cards and the ice. An orbit scope shows your orbit (amber) and the planned one (cyan) from above, with heights exaggerated; the Map view shows the real orbits.
- **Ice**: a fragment crosses your path with a collision warning modelled on NASA's ISS practice (time of closest approach, predicted miss, chance of a hit against NASA's 1-in-10,000 line using a 5 m hard-body radius, a ~0.6 m/s dodge). The tracking error shrinks as it gets closer; ignore it and it can hit. Damage is physics-based (`lib/flight/ship.ts`): the fragment is ~12 cm (about what tracking can see), so a direct hit beats any shield; its cloud of smaller pieces (a d^-2.5 size law) only gets through above your shield's ballistic limit (NASA rates the ISS Whipple shield at ~1 cm of aluminium; scaled ×1.43 for ice). Near the station, slow ice haze drifts through the docking corridor; a bump does damage by its kinetic energy, so the shield doesn't matter there.
- **Docking**: the last kilometre on 6-direction thrusters (Draco-class, 400 N), along the velocity vector as crews approach the ISS. Contact under 0.3 m/s and 0.5 m off centre is a soft capture; faster is a hard dock or a bounce. No lidar means the numbers are estimates "by eye".
- **Engine link**: `route { piloted: true }`, then `flight` reports (time flown, hull damage) before each card and `dock` at contact with the Δv spent beyond the route card (or saved, which goes back in the tank). The engine checks and clamps everything, so a replay of the saved actions gives the same mission. A refresh mid-flight resumes from a snapshot.
- **Look**: Lantern 17 and the ship are built in code (`app/three/`): dock hub with a soft-capture ring, approach lights and an alignment cross; the spine truss with two gyro wheels; radiator fins with coolant loops and the ammonia leak venting like snow; the sensor mast; the Kiln; 18 gold hexagonal mirror segments (JWST has 18), segment 7 cracked. A cinematic pipeline (`app/three/cinema.ts`): ACES tone mapping, bloom, film grain, vignette, lens fringing, letterbox shots, and a governor that lowers resolution if the frame rate drops. The planet has no sun: it is lit only by the Lanterns' pools of light.
- `/mission?fly=approach` (with "Jump to the flight") starts at the approach point, for reviewers.

## Walking Lantern 17 (/station)

After docking, the Station Mission opens outside, in first person (`app/station/walk/`): glide along the handrails to each zone, look with your own eyes or the thermal visor (if your ship carries the thermal camera), and inspect or repair right there. Every button is the engine's own action with its real hours and refusal reasons, finds are pinned in 3D, the dosimeter clicks faster near the Kiln, and the suit shows air, dose and the clocks. The step-by-step station guide is one tap away for the proof, the report and the big decision.

- **Thermal visor** (`app/three/thermal.ts`): every part has a temperature (pressurised modules warm, radiators warmer, bare structure cold, shiny mirrors cold, the Kiln white-hot with heat falling off with distance), drawn in an ironbow palette. The burn scar on segment 7 (clue C2) shows only in thermal; the ammonia leak shows as a cold plume.
- **The controlled test in 3D**: from the Petals, fire the cracked segment at a 1 m ice block 60 m below. Vapour boils off the lit face and the block moves 1.9 m (½·(0.5 N / 482 kg)·60²), then the engine's measured speed (6.2 cm/s with the true numbers) appears.

## The debrief

`app/lab/Result.tsx` plus `lib/game/debrief.ts`: the ending, the score, the miss diagram, the cities' light, the mission trace, **Your flight** (docking, contact speed, Δv against the route card, the ice), flight lessons and "what you could have done better", **In real life** cards (now also the Hohmann transfer, ISS debris avoidance and Dragon's V-bar approach), and the decision ledger. **Replay with one change** (`app/mission/Replay.tsx`): the same seed, so the same events and ice, restarted from the hangar or from the launch, with **last time against this time** on the next debrief.

## Route and journey (also at /mission)

After the hangar, the player picks a route and flies it.

- **Route screen** (`app/mission/Route.tsx`): five route cards with Δv out, Δv home, the 10% margin and arrival hour; a flight map (`FlightMap.tsx`) with a path for each route (the Hohmann arcs are real ellipses between the Wick's and Lantern 17's orbits); a bar showing what you have against what each route needs; the hour you would arrive and whether it is Eclipse or daylight. A route that can't be flown asks "Go anyway?" first, because running dry is a real ending.
- **Journey** (`app/mission/Journey.tsx`): the ship flies the route in legs, and three event cards (the distress call is always one) appear between them. Each card has its own animated scene (`CardArt.tsx`), choices with their costs, locked choices that say why (the engine's reason), and a result panel after you choose (what it cost, what else happened, what it teaches). Then the arrival and docking.
- **Engine**: the flight is split into equal legs (`flightSegH`), so time passes between cards and the dock comes last. Running dry on the way out ends the mission straight away with a result screen (`app/lab/Result.tsx`, shared with the Mission Lab).
- **Voices**: a third voice (a strained young crew member) speaks the distress call; the Director speaks on the route screen and at the dock.
- Add `?seed=NN` to `/mission` to replay a particular event deck (useful for testing every card).
