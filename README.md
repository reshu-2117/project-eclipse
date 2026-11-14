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

