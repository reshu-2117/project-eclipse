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

## Orbital view

`OrbitalSection` (the `#orbit` section) is a 3D simulation of Lantern 17 and its surroundings, built with Three.js. It loads only when the section nears the viewport.

- **Scale:** 1 scene unit = 1,000 km. Planet radius 6,371 km, mu = 398,600 km³/s². Objects are drawn far larger than real hardware, and each keeps a safety zone of the same size.
- **Time:** ×900 by default (×300 and ×2,700 in the controls). One Lantern 17 orbit takes about 18 seconds at ×900.
- **Physics:** simplified two-body Kepler orbits, solved analytically, so position is an exact function of time.
- **Sky:** `app/components/orbit/sim.ts` generates 63 objects from a fixed seed (`FIELD_SEED`). The same seed always gives the same sky. Every pair of paths is checked so they never come closer than their safety zones plus 70 km, at any time. Paths that fail are nudged apart and re-tested.
- **Verify:** `npm run verify:orbits` re-checks the generated sky with an independent search and a 24-hour swept collision test.
- **Controls:** drag to rotate. Click the view (or use "Control camera" on touch devices) to unlock wheel and pinch zoom. "Follow L-17" rides along with the Lantern.

Code: `app/components/OrbitalSection.tsx` (UI), `app/components/orbit/` (`sim.ts` model, `scene.ts` Three.js scene, `field.worker.ts` and `loadField.ts` for off-thread generation).

