# Project Eclipse: handoff

Read this first, then continue. It covers what exists, what is decided, what is next, and how the user likes to work.
Written Saturday 14 Nov 2026 (NASA Space Apps hackathon day 1). Submission closes **Sun 15 Nov, 11:59 pm local time**.

## 1. The project in 5 lines

- **Project Eclipse**: a single-player space mission design game for NASA Space Apps 2026, challenge "Space Mission Design Game". Team `NASA-2026-VSK-059`, three students.
- **Story**: Eclipse-01, a sunless rogue planet kept alive by 24 orbital fusion-light "Lanterns". Lantern 17 is failing (61% output) and a huge ice fragment is inbound. The player is one engineer among 300 crews.
- **One rule**: every choice must gain something and cost something. Costs come from real physics (rocket equation, Hohmann transfers, comms time, ablation push).
- **Team**: Reshma (build lead), Shanmukh (science lead), Nitish (story lead). Do not guess which one the user is.
- **Source documents** (the user uploaded them; not in the repo): Game Systems Handbook v2 (the spec, 24 pages), Actual Build Guide, Worldbuilding Dossier v3, Round 1 and Round 2 pitch decks. The Handbook is the source of truth for numbers and stages.

## 2. Repo, branches, deploy

- Repo: https://github.com/reshu-2117/project-eclipse (public, **no LICENSE file**; the Round 2 deck says "open-source", so add one or drop the claim).
- Live site: **https://project-eclipse-new.vercel.app** (deploys from `main`; the Vercel status shows on commits via `gh api repos/reshu-2117/project-eclipse/commits/<sha>/status`).
- **`main`** = everything below, including the playable hangar at `/mission`. This is what is live. The dev branch `claude/stoic-brahmagupta-f3uprq` was merged into it and is identical.
- Rule used so far: push finished, tested work to `main` (the user asked to deploy); keep unfinished work on the dev branch only.
- `AGENTS.md` says this is a newer Next.js than training data: **read `node_modules/next/dist/docs/` before writing Next code**. Stack: Next 16.4.6, React 19.3, Tailwind 4 (loaded through a Turbopack rule in `next.config.ts`), `cacheComponents: true`, Three.js 0.187, Vitest 3.
- CSS: this repo's CSS goes through a custom loader, so new styles were added to `app/globals.css` under a prefix (`lab-`, planned `ms-`) instead of CSS modules.

## 3. What is built and live (main)

**Home page changes (done, live)**: the menu has a Lab link; a new "The brain of the game, running live" section (`app/components/LabTeaser.tsx`) links to `/lab`; the simulation card links to it; the story text now matches the Handbook (Lantern 17 failing at 61%, one of 300 crews) in the hero, menu bar, network board, briefing terminal and world cards. The crew name is spelled **Shanmukh** (the user corrected this; keep that spelling everywhere). Still outdated on the home page: the placeholder `MissionDesigner` section ("Give your mission a purpose"), whose options (subsurface radar, life traces) are not canon.


**Chunk 0, the game engine** in `lib/game/` (pure TypeScript, no UI, ~5,300 lines with tests):

| File | What it holds |
|---|---|
| `constants.ts` | Every balance number, each tagged real / game / fiction. Change a number here and the whole game follows. |
| `physics.ts` | Rocket equation, fuel burn, Hohmann, plane change, comms time, ablation push, ice deflection. |
| `data/ship.ts` | 3 hulls, engines, power, shields, sensors, comms, kit, add-ons, suits. |
| `data/routes.ts` | 5 route plans (see decision 1 below). |
| `data/events.ts` | Event cards E1-E8. |
| `data/station.ts` | Lantern 17's 6 zones, 2 hazards, 6 clues, 3 explanations, 4 settlements, packets, big choice A-E. |
| `data/endings.ts` | 8 endings. `data/realLife.ts`: "In real life" cards. |
| `engine.ts` | `createGame`, `step(state, action)` (pure; rejects with a reason and changes nothing), `replay(seed, actions)`, selectors, the minute-by-minute `advance()`. |
| `loadout.ts` | Hangar maths: mass, Δv, budget, readiness-review red flags, which routes fit. |
| `actions.ts` | `options(state)`: which actions are legal now, with the "why not" text, by trying each against the real engine. |
| `debrief.ts` | Ledger, "what you could have done better", "In real life" cards. |
| `strategies.ts` | 9 scripted crews that play whole missions (used by tests and the Lab). |
| `data/story.ts` | **Chunk 1 text**: opening panels, briefing, Director lines, voice casting (see section 4). |

**Tests**: `npm test` runs 59 tests in `lib/game/__tests__/`. They re-derive every handbook physics number, check rules and play the 9 crews to prove all 8 endings reachable. Also `npm run build`, `npx eslint lib app`, `npx tsc --noEmit` (one expected error: `LayoutProps` in `app/layout.tsx`, which goes away after `next build` generates types).

**`/lab`** (`app/lab/`, rebuilt from scratch): a polished proof page with the real homepage planet in its hero. Sections: Proofs (10 handbook numbers re-derived by the engine, `Proofs.tsx`: a proof board with a 10-segment verdict ring, source filter and cards that cross-highlight), Ships (`Ships.tsx`: 3 presets x 5 routes fit matrix), Crews (`Crews.tsx`: 9 scripted crews, seed, result view), Endings (`Endings.tsx`: a spectrum bar of how often each ending happens, a detail view with a live `LanternNetwork` in that ending's state, and a keyboard-navigable list), Rules (`Rules.tsx`: a tabbed data room: hulls with `HullThumb` and stat bars, the 8 event cards drawn with `CardArt`, an interactive Lantern 17 zone map with clue pins and the three hypotheses, settlement reserve bars). Styles in `app/lab/lab.css` (`lb-` prefix); `Result.tsx` is still styled by the old `.lab-*` rules in `app/globals.css`. `fx.tsx` holds the page motion (scroll-progress line, pointer-following light, staggered reveal via `.rv`/`.in`, `CountUp`), all off for reduced motion; a fixed starfield sits behind the page and sections get ghost numbers by CSS counter (so keep the eyebrow numbers 01..05 in order). `facts.ts` holds `TEST_COUNT` (59): update it when tests change. The rocket-equation playground was removed on the user's request (they kept sections 1,3,4,5,6). `app/components/LanternNetwork.tsx` is the home page's Walker Delta network (24 Lanterns, 3 tilted rings, trails, planet lit by the Lanterns) as a reusable stage with phase props: `l17` (`failing` | `dark` | `lit`) and `eclipse` (dims everything). The Lab hero has four phase buttons (Failing, Eclipse, Dark, Restored). The flight map sits it under the SVG: the Route screen shows the network as it will be at arrival (Eclipse dims it), the Journey screen follows the mission clock (`isEclipse(game.t)`). Use it for the station and ending screens too (`l17="lit"` for a win). `PlanetCanvas.tsx` (planet only) is now unused; delete it if nothing needs it.

**Earlier work** (before this session, all in `app/components/`): the landing page, a WebGL planet lit by 24 Lanterns (`heroPlanet.ts`), a 3D orbit view (`orbit/`), the Lantern network board, a terminal briefing, and a placeholder `MissionDesigner`. `README.md` documents these and the engine.

### Design decisions made in Chunk 0 (the Handbook left gaps; all documented in README)

1. **Fast transfers are direct intercepts.** In the Handbook the fast route also waited for catch-up orbits, so it cost more AND arrived later than "quick catch-up" and nobody would pick it. Now: safe 12.6 h, quick 5.6 h, fast-out 3.4 h, skip-window 2.6 h.
2. **A believed packet brings more Lanterns onto the ice** (3 for Core, 5 for Full, 1 h after arrival). One Lantern alone needs ~21 h to move the ice 1.5 km, so only a fast lean crew can save the station alone.
3. **Discovery and survival are scored separately.** The headline ending is about the proof; station, cities and crew are shown alongside. "Saved, but stranded" (Round 2 deck) is the 8th ending.
4. **One broadcast per mission, sendable any time at the station.** The network judges the evidence you had at that moment (needs evidence >= 80, a test band of +/-15% or better, arrival before impact).
5. **City reserves drain by the light they are missing**, not only when Lantern 17 is fully dark. Beaming during the 6-hour Eclipse costs the cities nothing.

A bug was fixed this session: the impact hour was logged twice (`impactLogged` flag). Check the Lab ledger shows it once.

**Chunk 2, the Wick hangar (done, live at `/mission`)**: gate ("Enter the Wick", with Sound and Voice switches) -> hangar -> "Your ship is away" screen. Files in `app/mission/`:

| File | What it holds |
|---|---|
| `Mission.tsx` | The shell: run state (seed + action list, saved in sessionStorage, "Continue your mission" after a refresh), top bar with the five meters, the Director's caption and voice, the gate, the post-launch screen. `act(action)` runs every click through the engine and returns the refusal reason. |
| `Hangar.tsx` | Four bays (hull, parts, suits, readiness review), option cards with live cost previews (Δv and credits before you click), fuel slider, three starter ships, review checklist with stamp, launch gantry with a "launch anyway" step when there are warnings, launch countdown. |
| `Blueprint.tsx` | The SVG ship sheet: three hull outlines, parts that slide in and lock, fuel level, bay overflow turns red. `HullThumb` for the hull cards. |
| `audio.ts` | Browser-made sound (bed, click, lock, reject, launch cues) and the voice player. |
| `mission.css` | All styles (`ms-` shell, `hg-` hangar, `bp-` blueprint). |
| `lib/game/presets.ts` | The three starter ships and `actionsToReach` (the clicks that turn one ship into another). |

Verified in a browser: all three hulls, a rejection ("The Courier has 1 sensor slot"), presets, suits, the review, the launch, refresh-and-continue, keyboard-only, reduced motion, phone width with no sideways scroll. The post-launch screen is an honest stub: the route, journey and station are not built, and it links to `/lab`.

The home page now leads here: hero, menu, briefing terminal and a new "Your ship. Your trade-offs." section (`BeginMission.tsx`) all link to `/mission`. The old `MissionDesigner` placeholder was deleted.

**Chunk 3, route + journey (done, live at `/mission`)**: after launch, `Route.tsx` -> `Journey.tsx` -> an arrival panel. New files in `app/mission/`: `Route.tsx` (five route cards, Δv out/home/+10%, arrival hour, Eclipse or daylight, confirm step when a route is short, "Go anyway"), `FlightMap.tsx` (SVG map; a real Hohmann ellipse; Lantern 17 is drawn where the chosen route ends; the ship eases along the path), `Journey.tsx` (cards, result panel, eclipse strip, flight log, arrival), `CardArt.tsx` (an animated scene for each of the 8 cards). `app/lab/Result.tsx` is the result view extracted from the Lab, now also the early-ending screen in `Mission.tsx` (running dry on the way out ends the mission). Engine change: the flight is split into legs (`flightSegH`/`flightLeftH` in `engine.ts`) so time passes between cards. New voice: `crew` role (Liam, `crew-distress` line), plus Director lines `dir-route` and `dir-arrive`. `?seed=NN` replays an event deck: seeds 1, 2, 3 and 10 together deal all eight cards with the default ship. The three open questions were answered by my recommendations: soft wording on the route screen (the 21-hour beam time stays hidden), a third voice, and the animated ship. After arrival, "Start work at the station" opens Chunk 4.

**Chunk 4, the station (done, live at `/mission`)**: the game is now playable from the hangar to the debrief. New files in `app/mission/`: `Station.tsx` (phase `station`: survey, a zone map with unmapped/damaged/inspected/fixed states and find pins, five inspection methods per zone with the engine's own hours and refusal reasons, repairs for the leak and the drift, the evidence board with six clue slots and an evidence meter that marks the 80 point belief line, the three explanations with Rule it out, the controlled test, and `Transmit`), `Decision.tsx` (phase `choice`: the five big choices A to E, select then Lock it in, with a how-to-swap toggle for A and C; phase `endgame`: Stay 1 or 4 hours, Undock, an ice-push meter against 1.5 km, the cities' reserves, and Transmit), `stationMap.ts` (zone layout shared with the Lab's data room), `station.css` (`st-` prefix). `Mission.tsx` routes by phase and has a `working` flag so the arrival panel (in `Journey.tsx`) is the doorway ("Start work at the station"). The debrief is the existing `Ending` with `Result`. Every enabled state and "why not" comes from `options(game)`, the same rule that runs the click, so the UI cannot disagree with the engine. Verified in a browser on desktop and a 390 px phone: a full run (Investigator ship, safe route, all 6 clues, test, Core packet, clever middle, hold, auto-depart at the deadline) ends on the debrief with no console errors and no sideways scroll. **Not done:** no new voice lines (the station is silent apart from the arrival line and sound effects), no cutscene or art for the station, and the opening and briefing are still unwired.

## 4. Chunk 1 (Opening + Briefing): partly built, NOT wired into `/mission`

**Plan the user approved** (they said sound is on by default with separate Voice and Sound mute buttons; art made in code; build chunk by chunk, plan first):

- `/mission` page. A **Begin gate** first (browsers need a click before audio), with a "Continue" if a run was saved in `sessionStorage`. Settings (sound, voice) in `localStorage`.
- **Opening**: 5 panels, ~1 minute, voiced, text revealed word by word in sync with the voice, slow zoom, Skip button, Space/Enter/click to advance, Esc to skip, reduced-motion respected. Then a title card.
- **Briefing**: terminal on the left (status lines, then the Director's lines typed in sync with her voice), settlements' reserve bars (Ember Hollow 16 h, Greywell 28 h, Marrow Deep 36 h, Lowlight 48 h, from the engine), a schematic orbit map, three "unknowns" cards (do NOT spoil the leak, drift or cracked mirror), the five meters (Δv, Energy, Time, Evidence, City light) lighting up one by one, the disclaimer, and an **Accept mission** button that ends at the hangar (Chunk 2).
- **Home page**: the story-text fix is done (section 3). Still to do: replace the placeholder `MissionDesigner` with a "Begin mission" link to `/mission`.

**Built so far** (committed on the dev branch, compiles, lint clean):

- `lib/game/data/story.ts`: all opening and briefing text, voice casting, audition list.
- `app/mission/audio.ts`: synthesized ambient bed and cues (no licensing), `playLine()` that plays `/audio/<id>.mp3` and falls back to the browser voice, then to timed text. Has `setMuted` and a loading wait.
- `app/mission/art.ts`: canvas scenes for panels 2-5 (lit city, Eclipse with closing shutters and a 24-hour dial, ice stream, Lantern 17 with the tracked ice body). Panel 1 uses the real planet shader (`heroPlanet.ts`) with no lights.
- `app/mission/Opening.tsx`: the opening component (panels, title card, skip, keyboard).
- `scripts/generate-voice.mjs` + `npm run voice`: records only lines whose text/voice/settings changed (hash in `public/audio/manifest.json`), tags every mp3 as AI-generated in its metadata via ffmpeg.
- `public/audio/`: 7 recorded lines (op-1..op-5 narrator, dir-brief, dir-accept) and 6 audition clips.

**Still to write**: `app/mission/Briefing.tsx`, and wiring `Opening` and the briefing into `Mission.tsx` before the hangar (the gate currently goes straight to the hangar; `Opening.tsx` and `art.ts` exist but are unused), then screenshot checks at desktop and phone widths, keyboard-only and reduced-motion passes. **Not yet visually tested at all**; expect to tune the art.

**Voice casting** (chosen from ElevenLabs' standard voices by their descriptions; **nobody has listened to them**, I cannot hear audio):
- Narrator = **George** (`JBFqnCBsd6RMkjVDRZzb`), warm raspy British storyteller, speed 0.8, stability 0.48. Alternates Lily, Brian.
- Director = **Sarah** (`EXAVITQu4vr4xnSDxMaL`), mature confident reassuring, speed 0.95, stability 0.62. Alternates Daniel, Adam.
- Swap by editing `VOICES` in `story.ts`, then `npm run voice`. A human should audition the 6 clips in `public/audio/audition/`. Consider adding an audition panel to `/lab`.
- Model `eleven_multilingual_v2`. About 2,000 of the free 10,000 credits are used.

**ElevenLabs key**: the user created a key restricted to Text to Speech and it was saved on the cloud environment as a network secret for host `api.elevenlabs.io` (`request_credential`). **It may not exist in a new session**; if a call returns 401, ask for it again with `request_credential` (never ask the user to paste a key in chat). In the cloud sandbox, Node needs `NODE_USE_ENV_PROXY=1` and `ELEVENLABS_API_KEY=proxy-injected` to reach the API: `ELEVENLABS_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 node --no-warnings scripts/generate-voice.mjs`. The key has no `voices_read` permission, so voices cannot be listed.

## 5. Remaining chunks (each: detailed plan, user approves, then build)

2. **Hangar** (the Wick): **DONE and live** (see section 3).
3. **Route + Journey** (**DONE and live**, see section 3; original plan kept for reference: plan already given to the user in chat, they said "start the build" for chunk 2 only): 2D orbit diagram with an arc per route; five route cards with Δv, margin and arrival time, red when over budget ("Need 1,887 m/s, you have 1,700") but still pickable after an "Are you sure?" because running dry is a real ending (the engine already ends the mission and goes to the debrief phase); the ship animates along its arc; three event cards flip from the deck (E4 always present), each choice shows cost chips and locked choices show the engine's reason; arrival and docking (lidar = clean dock, no lidar = costs fuel and time). Decisions the user has NOT answered yet, my recommendations: (a) on the route screen use a soft line ("Arrive early and you'll have time to work. Arrive late and you won't") instead of the Handbook's "deflecting needs about 21 hours of beam time", because the Dossier says the deflection idea must be discovered, not told; (b) add a third voice for the distress call; (c) animate the ship on its arc. The engine's `options(state)` and `ROUTES`/`routeFit` already supply what the cards need. The existing `Launched` stub in `Mission.tsx` is where the route screen goes. An early ending (drift past, or reactor loss) needs a result screen: extract the Lab's result view into a shared component.
4. **The station**: interactive Lighthouse Spine drawing, survey, inspect zones by method, repairs, two clocks.
5. **Evidence board + Test beam**: pinned clues with strings, struck-out explanations, beam and plume scene, error-bar chart.
6. **Big choice + Broadcast**: the ice clock jump (36 h to 30 h) with alarm, A-E choice, packet and upload, network terminal ending reusing the hero constellation.
7. **Debrief**: ledger, "what you could have done better", In real life cards, ghost run, "Replay with one change".
8. **Polish**: sound everywhere, homepage text, links, deploy. Also add a real NASA dataset or resource if time allows (see section 7).

## 6. Submission work already done

In `docs/submission/` (copies; the originals were in a temporary folder):

- `Project_Eclipse_Components_of_Project_2026.docx`: the NASA "Components of Project" report, 6 pages, validated. **Rebuilt from the user's template** (same 6 sections, logo header, bordered boxes) with docx-js, because the template is a PDF conversion with fixed text boxes that clip text. Builder: `build_report.js` (reads the logo from the template's `word/media/image1.png`; set its `SCRATCH` paths first).
- `Project_Eclipse_6PM_Status_Report.docx` + `build_status.js`: the 6 PM checkpoint report.
- The short message the user sent to their local lead: engine done and live, opening/briefing and hangar next, player screens not clickable yet, report attached, blockers none.

**Report facts to keep true**:
- Demo Link in the report is `https://project-eclipse-new.vercel.app/lab` (no video exists). Project Link is the site. Source is the GitHub repo.
- "Current status" says the opening/briefing is partly built and not playable. **Update it as chunks ship.**
- "Use of AI": Claude (brainstorming, and coding through Claude Code; every commit after the first scaffold is Claude-authored with a Co-Authored-By trailer), ChatGPT (research; the user said "start GPT-M", which I **assumed means ChatGPT, unconfirmed**). Images/video: none AI. **Audio: the Director's hangar lines are ElevenLabs AI voice, and the report and README now say so** (the gate screen also credits it, and every mp3 carries an AI-generated tag in its metadata via `npm run voice`). Keep that true as voices are added.
- NASA Data section is honest that no NASA dataset file was used, only published NASA figures; the numbers' sources come from the Handbook (p.22-24) and were not individually re-verified. Only the orbital maths was re-derived.
- The report's year was changed from the template's 2025 to 2026.

## 7. Open items and risks

- **Demo is mandatory** (NASA 2026 Project Submission Guide): one public link to either a video of 30 s or less, or a slide deck of at most 7 slides including title. Over the limit means no Global Judging. A slide demo should show team name, member names, the challenge, an image of the project, the user experience and how NASA data was used. **No demo exists yet**; the recommendation was a 7-slide deck (also avoids the rule that the demo may not show anyone under 18). The user has asked me not to repeat this in messages to their lead; just track it.
- **AI rules**: SI should not be used to come up with the idea for solving the challenge. The report says Claude helped with brainstorming; **the user must confirm what that covered and that the wording is accurate.** Do not soften it on their behalf.
- **NASA data**: Global Award needs at least one NASA data or resource. Published NASA figures probably count but are unconfirmed.
- The placeholder `MissionDesigner` section on the home page is not canon (see section 3); replace it with a "Begin mission" entry once `/mission` exists.
- No LICENSE in the repo.
- Submit steps: complete every form field, public links, tick "Terms" and "Confirm All Work is Original", then "Submit for Judging" before Sun 11:59 pm local.

## 8. How the user likes to work (important)

- **Simple, short explanations.** They told me twice I was explaining too complexly. Plain words, short sections, no jargon dumps.
- **Brainstorm and plan before building.** They want each chunk planned in detail, explained simply, then built when they say "build it" (or approve the plan). They said not to make documents for plans; explain in chat.
- **Quality bar is high**: "elite, big, aesthetically good, artistically well done". Judges said only ~10% of the game existed after Round 2.
- **Outgoing messages must be short and precise**, in a single code block, with the file named for attaching. They got angry when I padded a message to their lead with caveats (demo, AI risks). Put such caveats in the chat reply to the user, not in the message they forward.
- When they ask for "the report" they mean the NASA-template docx. When they ask for a checkpoint message ("2 PM", "6 PM", "10 PM") they mean a short status message plus a file, in the style above.
- They get frustrated by confusion and extra steps. Do the thing, then say plainly what changed. Be honest about what is and is not built; never claim a playable game that is not.
- They use voice-to-text, so words arrive garbled ("start GPT-M"). Check unclear names instead of guessing in anything that is declared publicly.
- Never put the user's personal details in requests to outside services.

## 9. First steps for the next session

1. `git fetch && git checkout claude/stoic-brahmagupta-f3uprq`, `npm install`, `npm test` (expect 59 passing), `npm run build`.
2. Ask the user one question only if needed: finish Chunk 1 now, or build the 7-slide demo first (the deadline is tonight/tomorrow).
3. If finishing Chunk 1: write `Briefing.tsx`, `Mission.tsx`, `page.tsx`, the CSS; run it with Playwright (Chromium is preinstalled: `require('playwright')`), screenshot every panel at 1400x900 and 390x844, test keyboard-only and reduced motion; update the report's status line; merge to `main` only when it is complete and the build passes.
4. Keep `npm test` green, and update `README.md` and the report when a chunk ships.

**Note**: the card-scene CSS now lives in `app/mission/cardart.css` (imported by `CardArt.tsx`) so the Lab can reuse `CardArt`. `.hg-tag` styles are duplicated under `.lb` in `lab.css` because `/lab` doesn't load `mission.css`.

**Crew charts** (`app/lab/charts.tsx` + `charts.css`, prefix `cx-`/`cm-`): `Result.tsx` now shows `MissDiagram` (ice path vs Lantern 17's 1.5 km clearance), `CityLamps` (four ring gauges of stored light) and `MissionTrace` (smooth monotone-cubic curves for speed left, energy and evidence, Eclipse bands, impact marker, decision ticks, a hover/arrow-key scrubber with a live readout, toggle chips). `Crews.tsx` has `CrewMap`, a crew x ending dot matrix sized by how often each crew lands there. `Result` is also the early-ending screen in the game, so these load there too.

**Reviewer shortcut**: the `/mission` start screen has "Skip ahead to the station" (`app/mission/shortcut.ts`): it builds the Investigator ship, launches, flies the safe route and takes the first allowed choice on each event card, all through the engine, then opens the station. Use it to review Chunk 4 in seconds.

**Chunk 5 (done): opening, briefing, station slide, station voices.** The game now starts with `Opening.tsx` (5 narrated scenes and a title card, styles in the new `app/mission/opening.css`; its caption class was renamed `ms-op-caption` to avoid the in-game `ms-caption`), then `Briefing.tsx` (the Director's terminal: what we don't know, the five meters, Accept the mission), then the hangar. `Mission.tsx` has `intro` (`opening` | `briefing` | null) and `stationBrief` flags. `StationBrief.tsx` is a slide before the station (six numbered steps, with costs from the engine's constants, and what you are spending); Station has a "How this stage works" button to reopen it. The numbered steps are there so a reviewer can say "step 3 confused me". Six new Director lines (`dir-station`, `dir-clue`, `dir-leak`, `dir-test`, `dir-choice`, `dir-depart`) were generated with ElevenLabs and tagged as AI in their metadata (19 lines in total); each plays once per run via `say()`. The Skip ahead link on the start screen now explains what it contains. Nobody on the team has listened to the voices yet. Not done: the debrief is still the Lab's result view with no in-game polish, and there is no demo deck.

**Chunk 4 rebuilt as its own page (done, live at `/station`)**: at the user's request the in-game station (`Station.tsx`, `Decision.tsx`, `StationBrief.tsx`, `station.css`) was **deleted** and replaced by a new page written for teenagers: plain words, one step at a time, and a coach. The old code is in git history (commit `f00e6c1`: `git show f00e6c1:app/mission/Station.tsx`). New files in `app/station/`: `page.tsx`, `StationQuest.tsx` (shell: reads and writes the same saved run `eclipse-run` in sessionStorage, sound and voice, intro, coach, five-step stepper, "Make the big decision" bar, debrief with `Result`), `Steps.tsx` (Look around, Investigate with the zone map, Fix problems, Prove it, Tell the world, each in plain language with the engine's own hours and refusal reasons from `options(game)`), `Decide.tsx` (the big decision A to E in plain words, then the final hours), `shared.tsx` (`coach()` picks the next move from the game state, `beliefChecks()` shows what the network wants before it believes a report), `quest.css` (`sq-` prefix). The game page links to it: the arrival panel in `Journey.tsx` has "Start the Station Mission" (or "Continue" in the choice and endgame phases), and the start screen has "Jump to the Station Mission" (`/station?demo=1` builds a docked ship via `app/mission/shortcut.ts` when there is no run at the station). The engine, the six station voice lines and the opening and briefing are unchanged. Verified in a browser on desktop and a 390 px phone: the start-screen link, a full run to the debrief, the link from a real flight, a reload mid-mission, and Continue on `/mission`, with no console errors and no sideways scroll.

**Debrief rebuilt (done, live on `/station` when the mission ends)**: `app/station/Debrief.tsx` replaces the Lab's result view as the in-game ending. It shows the ending reveal (tier chip, name, quote, why), five plain-language verdict cards (your proof, the network, Lantern 17, your crew, the cities, with the network's reason revealed), the key moments of the run, "what you could have done better" (from `betterChoices`), the real hardware behind each part, and Try again: **Replay this exact mission** (same seed, so the same ice and event cards; it writes `[begin]` to the saved run and goes to `/mission`, where you press Continue), start fresh, **Copy my result to share**, and a link to the Lab. New Director line `dir-debrief` (20 lines in total, AI-tagged). On `/mission`, an early ending still uses the Lab's result view plus an "Open the full debrief" link to `/station`. Verified in a browser, desktop and 390 px phone, with no console errors.

## Session 3 (Sat 14 Nov, evening): the flight deck and the station walk

**Branch:** `ccr-942ca06d-argdyh` (pushed). **Not merged to `main`, so not live yet.** The user asked for a realistic, cinematic flight they actually pilot, ice to dodge, a simple interface, and a 3D Lantern 17 they can go round and inspect. New chunk numbers: **3b** flight, **3c** docking, **4b** station walk.

- **Home menu**: a Station link (`app/components/Hud.tsx`) to `/station?demo=1`.
- **3b/3c flight deck** (`lib/flight/`, `app/mission/flight/`, `app/three/`): see the README section "The flight deck". Engine changes in `lib/game/engine.ts`: `route { piloted }`, `flight`, `dock` actions (`pilotApply`, clamps every number; negative Δv refunds fuel). The route screen now always launches a piloted flight; old saved runs without `piloted` still use `Journey.tsx`. `Mission.tsx` keeps the deck on screen after docking (`deckHold`) until "Board Lantern 17" or "Flight report". Start screen: "Jump to the flight" (`actionsToFlight` in `shortcut.ts`). `?fly=approach` starts at the approach point. In dev, `window.__fd = { sim, scene }` and `window.__walk` are exposed for checks.
- **4b station walk** (`app/station/walk/`): opens by default after the station Welcome; "Station guide" switches to the old step UI, which has "Go outside" to come back.
- **Voices**: 4 new Director lines (`dir-fly`, `dir-brake`, `dir-ice`, `dir-approach`), generated with ElevenLabs and tagged AI like the rest (23 lines in all). Nobody has listened to them.
- **Tests**: 91 (`lib/flight/__tests__/orbit.test.ts`, `sim.test.ts` with a robot pilot that flies every route to a soft capture, `lib/game/__tests__/piloted.test.ts`). `TEST_COUNT` in `app/lab/facts.ts` updated.
- **Verified**: build passes; Playwright screenshots on desktop 1400×900 and phone 390×844 (intro, burns, orbit scope, map, approach, docking overlay, walk zones, thermal); an end-to-end run (cards in flight, soft capture, dock recorded in the saved run, `/station` opens on it) with no console errors. Headless Chromium renders at ~4 fps, so motion and feel are **not** play-tested by a human.
- **Known limits / next**: fragment hit chance and haze damage are game values; the thermal visor is a palette over the whole view, not per-object temperatures; the test beam has no 3D cinematic yet (it's in the station guide); the debrief is unchanged; the demo deck still doesn't exist; the NASA report's "current status" needs the flight and walk added.

## Session 4 (Sun 15 Nov, early): the "not dones", and live

Everything below is merged to `main` and live (the user said "do the not dones also and push it live"). `main` had one new commit from another session (a Station link on the home page: menu, hero button, a Mission 002 section); it merged cleanly with the same menu link.

- **Thermal visor** with per-part temperatures (`app/three/thermal.ts`; tags in `lantern17.ts`, `walkScene.ts`). C2's burn scar only in thermal. Zone hints in the walk say what the visor shows.
- **The test in 3D** (`walkScene.ts` `playTest`, `StationWalk.tsx` `TestCard` at the Petals and the Kiln). The engine's `test` action is unchanged.
- **Ice damage from physics** (`lib/flight/ship.ts`: `BALLISTIC_LIMIT_CM`, `FRAGMENT`, `fragmentDamage`, `bumpDamage`). Pc now uses a 5 m hard-body radius. A fragment hit is reported to the engine at once (ledger title "Ice fragment: …").
- **Debrief**: `flightReport`, flight lessons, three real-life cards, `replayPoint`; `Replay.tsx` (ghost in sessionStorage `eclipse-ghost`).
- **Report**: `docs/submission/Project_Eclipse_Components_of_Project_2026.docx` status paragraph rewritten in place (same 8 pages in LibreOffice). Its Demo Link field still says `/lab`; switch it to the deck's public link once the deck is shared.
- **Demo deck**: 7 slides, published as a claude.ai Slides artifact (https://claude.ai/artifact/PHwNVuoedmNLfbTQ5CrSGv). **Private until the user shares it** from its Share menu; NASA needs a public link. Source copy in `docs/submission/demo-deck/`.
- 94 tests. Build passes. Floodlights dim at close range (a white hub at a few metres burned out).

**Debrief shortcut**: `/station?demo=debrief` plays the best scripted crew to the end and opens the debrief straight away (linked from the home page's Mission 002 section). `/station?demo=1` still opens the station with a docked ship.

**Review page (`/review`)**: one list of every part of the game, each with a button that opens that exact part: `/mission?start=opening` (opening then briefing), `?start=briefing`, `?start=hangar`, `?start=flight` (ready ship, straight to the flight deck), `/station?demo=1`, `/station?demo=debrief`, `/lab`. Linked from the home page menu and hero, and from the `/mission` start screen. The `start` links are handled in `Mission.tsx` (a requestAnimationFrame effect on arrival). Each card says what to look for and tells reviewers to quote the part number.
