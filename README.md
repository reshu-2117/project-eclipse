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

Tests: `npm test` (52 tests). They re-derive every handbook number, check the rules, and play scripted crews to prove that all 8 endings can be reached.

**Mission Lab:** `/lab` runs the engine live, with handbook-vs-engine checks, a working hangar calculator, and nine scripted crews you can watch play full missions.

## AI use

Project Eclipse was built with AI assistance, and we declare it here as the NASA Space Apps rules ask. After the team's initial project scaffold, the code in this repository (the front end, the game engine and its tests) was written and reviewed by Claude Code (Anthropic's Claude) working from the team's design documents. Each of those commits carries a `Co-Authored-By` trailer naming it. No generative AI was used for images or video: every visual is drawn in code, and the textures are procedural. The Director's spoken lines in the hangar are AI-generated with ElevenLabs text-to-speech. Each audio file says so in its metadata, the start screen says so, and `npm run voice` (see `scripts/generate-voice.mjs`) regenerates them. The world, story and game design come from the team's own documents (World-Building Dossier v3 and Game Systems Handbook v2). Nothing here uses NASA logos, flags or mission identifiers.

## The Wick (hangar) at /mission

The first player-facing stage. Players build a ship in four bays (hull, parts, suits, readiness review), watch a blueprint assemble as they pick, and launch.

- **Every click goes through the engine** (`app/mission/Mission.tsx` calls `step()`), so a refusal shows the engine's own reason, and the numbers on screen (Δv, mass, energy, bay, budget, route fit) are the engine's.
- **Blueprint** (`app/mission/Blueprint.tsx`): one SVG sheet; each hull has its own outline and anchor points, and every part has a drawing that slides in and locks.
- **Starter ships** (`lib/game/presets.ts`): three one-click builds, each proven launchable by tests.
- **Runs are saved** in `sessionStorage` as a seed plus the list of actions, so a refresh offers "Continue your mission".
- **Sound and voice** have separate switches (`app/mission/audio.ts`); both remembered. Sound is made in the browser; the voice lines are recorded files in `public/audio`.
- Respects reduced motion; works with the keyboard alone and at phone width.
