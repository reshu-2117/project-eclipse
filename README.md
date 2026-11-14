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
