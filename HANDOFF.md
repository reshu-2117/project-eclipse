# Project Eclipse: handoff

Read this first, then continue. It covers what exists, what is decided, what is next, and how the user likes to work.
Written Saturday 14 Nov 2026 (NASA Space Apps hackathon day 1). Submission closes **Sun 15 Nov, 11:59 pm local time**.

## 1. The project in 5 lines

- **Project Eclipse**: a single-player space mission design game for NASA Space Apps 2026, challenge "Space Mission Design Game". Team `NASA-2026-VSK-059`, three students.
- **Story**: Eclipse-01, a sunless rogue planet kept alive by 24 orbital fusion-light "Lanterns". Lantern 17 is failing (61% output) and a huge ice fragment is inbound. The player is one engineer among 300 crews.
- **One rule**: every choice must gain something and cost something. Costs come from real physics (rocket equation, Hohmann transfers, comms time, ablation push).
- **Team**: Reshma (build lead), Shunmukh (science lead), Nitish (story lead). Do not guess which one the user is.
- **Source documents** (the user uploaded them; not in the repo): Game Systems Handbook v2 (the spec, 24 pages), Actual Build Guide, Worldbuilding Dossier v3, Round 1 and Round 2 pitch decks. The Handbook is the source of truth for numbers and stages.

## 2. Repo, branches, deploy

- Repo: https://github.com/reshu-2117/project-eclipse (public, **no LICENSE file**; the Round 2 deck says "open-source", so add one or drop the claim).
- Live site: **https://project-eclipse-new.vercel.app** (deploys from `main`; the Vercel status shows on commits via `gh api repos/reshu-2117/project-eclipse/commits/<sha>/status`).
- **`main`** = engine + `/lab` + bug fix + README AI note. This is what is live.
- **`claude/stoic-brahmagupta-f3uprq`** (dev branch, one commit ahead of main) = the unfinished Chunk 1 work plus this file. **Nothing here is reachable from the site** because there is no `/mission` page yet.
- Rule used so far: push finished, tested work to `main` (the user asked to deploy); keep unfinished work on the dev branch only.
- `AGENTS.md` says this is a newer Next.js than training data: **read `node_modules/next/dist/docs/` before writing Next code**. Stack: Next 16.4.6, React 19.3, Tailwind 4 (loaded through a Turbopack rule in `next.config.ts`), `cacheComponents: true`, Three.js 0.187, Vitest 3.
- CSS: this repo's CSS goes through a custom loader, so new styles were added to `app/globals.css` under a prefix (`lab-`, planned `ms-`) instead of CSS modules.

## 3. What is built and live (main)

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

**Tests**: `npm test` runs 53 tests in `lib/game/__tests__/`. They re-derive every handbook physics number, check rules and play the 9 crews to prove all 8 endings reachable. Also `npm run build`, `npx eslint lib app`, `npx tsc --noEmit` (one expected error: `LayoutProps` in `app/layout.tsx`, which goes away after `next build` generates types).

**`/lab`** (`app/lab/`): a live demo page. Handbook-vs-engine number checks (10/10), a working hangar calculator that runs through the engine, and the 9 crews playing full missions with ending, chart, ledger and real-life cards. Styles in `app/globals.css` (`.lab-*`).

**Earlier work** (before this session, all in `app/components/`): the landing page, a WebGL planet lit by 24 Lanterns (`heroPlanet.ts`), a 3D orbit view (`orbit/`), the Lantern network board, a terminal briefing, and a placeholder `MissionDesigner`. `README.md` documents these and the engine.

### Design decisions made in Chunk 0 (the Handbook left gaps; all documented in README)

1. **Fast transfers are direct intercepts.** In the Handbook the fast route also waited for catch-up orbits, so it cost more AND arrived later than "quick catch-up" and nobody would pick it. Now: safe 12.6 h, quick 5.6 h, fast-out 3.4 h, skip-window 2.6 h.
2. **A believed packet brings more Lanterns onto the ice** (3 for Core, 5 for Full, 1 h after arrival). One Lantern alone needs ~21 h to move the ice 1.5 km, so only a fast lean crew can save the station alone.
3. **Discovery and survival are scored separately.** The headline ending is about the proof; station, cities and crew are shown alongside. "Saved, but stranded" (Round 2 deck) is the 8th ending.
4. **One broadcast per mission, sendable any time at the station.** The network judges the evidence you had at that moment (needs evidence >= 80, a test band of +/-15% or better, arrival before impact).
5. **City reserves drain by the light they are missing**, not only when Lantern 17 is fully dark. Beaming during the 6-hour Eclipse costs the cities nothing.

A bug was fixed this session: the impact hour was logged twice (`impactLogged` flag). Check the Lab ledger shows it once.

## 4. Chunk 1 (Opening + Briefing): in progress, on the dev branch only

**Plan the user approved** (they said sound is on by default with separate Voice and Sound mute buttons; art made in code; build chunk by chunk, plan first):

- `/mission` page. A **Begin gate** first (browsers need a click before audio), with a "Continue" if a run was saved in `sessionStorage`. Settings (sound, voice) in `localStorage`.
- **Opening**: 5 panels, ~1 minute, voiced, text revealed word by word in sync with the voice, slow zoom, Skip button, Space/Enter/click to advance, Esc to skip, reduced-motion respected. Then a title card.
- **Briefing**: terminal on the left (status lines, then the Director's lines typed in sync with her voice), settlements' reserve bars (Ember Hollow 16 h, Greywell 28 h, Marrow Deep 36 h, Lowlight 48 h, from the engine), a schematic orbit map, three "unknowns" cards (do NOT spoil the leak, drift or cracked mirror), the five meters (Δv, Energy, Time, Evidence, City light) lighting up one by one, the disclaimer, and an **Accept mission** button that ends at the hangar (Chunk 2).
- **Homepage fix, approved by default, NOT done yet**: `Transmission.tsx` and `Network.tsx` say Lantern 17 is "gone dark / 0%" and the player is "the only engineer". Canon: 61% and falling, one of 300 crews. Also `Hero.tsx` ("L-17 OFFLINE", "ring"), `Hud.tsx`, and replace the placeholder `MissionDesigner` with a "Begin mission" link to `/mission`.

**Built so far** (committed on the dev branch, compiles, lint clean):

- `lib/game/data/story.ts`: all opening and briefing text, voice casting, audition list.
- `app/mission/audio.ts`: synthesized ambient bed and cues (no licensing), `playLine()` that plays `/audio/<id>.mp3` and falls back to the browser voice, then to timed text. Has `setMuted` and a loading wait.
- `app/mission/art.ts`: canvas scenes for panels 2-5 (lit city, Eclipse with closing shutters and a 24-hour dial, ice stream, Lantern 17 with the tracked ice body). Panel 1 uses the real planet shader (`heroPlanet.ts`) with no lights.
- `app/mission/Opening.tsx`: the opening component (panels, title card, skip, keyboard).
- `scripts/generate-voice.mjs` + `npm run voice`: records only lines whose text/voice/settings changed (hash in `public/audio/manifest.json`), tags every mp3 as AI-generated in its metadata via ffmpeg.
- `public/audio/`: 7 recorded lines (op-1..op-5 narrator, dir-brief, dir-accept) and 6 audition clips.

**Still to write**: `app/mission/Briefing.tsx`, `app/mission/Mission.tsx` (shell: stage state, persistence, HUD, sound/voice toggles, Begin gate, Wick placeholder), `app/mission/page.tsx`, `app/mission/mission.css` (or `ms-*` rules in globals), the homepage fixes, then screenshot checks at desktop and phone widths, keyboard-only and reduced-motion passes. **Not yet visually tested at all**; expect to tune the art.

**Voice casting** (chosen from ElevenLabs' standard voices by their descriptions; **nobody has listened to them**, I cannot hear audio):
- Narrator = **George** (`JBFqnCBsd6RMkjVDRZzb`), warm raspy British storyteller, speed 0.8, stability 0.48. Alternates Lily, Brian.
- Director = **Sarah** (`EXAVITQu4vr4xnSDxMaL`), mature confident reassuring, speed 0.95, stability 0.62. Alternates Daniel, Adam.
- Swap by editing `VOICES` in `story.ts`, then `npm run voice`. A human should audition the 6 clips in `public/audio/audition/`. Consider adding an audition panel to `/lab`.
- Model `eleven_multilingual_v2`. About 2,000 of the free 10,000 credits are used.

**ElevenLabs key**: the user created a key restricted to Text to Speech and it was saved on the cloud environment as a network secret for host `api.elevenlabs.io` (`request_credential`). **It may not exist in a new session**; if a call returns 401, ask for it again with `request_credential` (never ask the user to paste a key in chat). In the cloud sandbox, Node needs `NODE_USE_ENV_PROXY=1` and `ELEVENLABS_API_KEY=proxy-injected` to reach the API: `ELEVENLABS_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 node --no-warnings scripts/generate-voice.mjs`. The key has no `voices_read` permission, so voices cannot be listed.

## 5. Remaining chunks (each: detailed plan, user approves, then build)

2. **Hangar** (the Wick): biggest visual chunk. Blueprint ship that assembles as parts are picked, live panel (Δv, mass, energy, bay, budget), readiness review stamped checklist, launch gantry. Runs on `loadout.ts` and `options()`.
3. **Route + Journey**: 2D orbit diagram, route cards with Δv and hours ("Need 1,887 m/s, you have 1,700" in red), event cards flipping, meters animating.
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
- "Use of AI": Claude (brainstorming, and coding through Claude Code; every commit after the first scaffold is Claude-authored with a Co-Authored-By trailer), ChatGPT (research; the user said "start GPT-M", which I **assumed means ChatGPT, unconfirmed**). Images/video: none AI. **Audio: "none is included at this time." If the ElevenLabs narration ships, change this line** to declare ElevenLabs and keep the mp3 metadata tags.
- NASA Data section is honest that no NASA dataset file was used, only published NASA figures; the numbers' sources come from the Handbook (p.22-24) and were not individually re-verified. Only the orbital maths was re-derived.
- The report's year was changed from the template's 2025 to 2026.

## 7. Open items and risks

- **Demo is mandatory** (NASA 2026 Project Submission Guide): one public link to either a video of 30 s or less, or a slide deck of at most 7 slides including title. Over the limit means no Global Judging. A slide demo should show team name, member names, the challenge, an image of the project, the user experience and how NASA data was used. **No demo exists yet**; the recommendation was a 7-slide deck (also avoids the rule that the demo may not show anyone under 18). The user has asked me not to repeat this in messages to their lead; just track it.
- **AI rules**: SI should not be used to come up with the idea for solving the challenge. The report says Claude helped with brainstorming; **the user must confirm what that covered and that the wording is accurate.** Do not soften it on their behalf.
- **NASA data**: Global Award needs at least one NASA data or resource. Published NASA figures probably count but are unconfirmed.
- Homepage text contradicts the canon until the fix in section 4 is done.
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

1. `git fetch && git checkout claude/stoic-brahmagupta-f3uprq`, `npm install`, `npm test` (expect 53 passing), `npm run build`.
2. Ask the user one question only if needed: finish Chunk 1 now, or build the 7-slide demo first (the deadline is tonight/tomorrow).
3. If finishing Chunk 1: write `Briefing.tsx`, `Mission.tsx`, `page.tsx`, the CSS; run it with Playwright (Chromium is preinstalled: `require('playwright')`), screenshot every panel at 1400x900 and 390x844, test keyboard-only and reduced motion; fix the homepage text; update the report's status line; merge to `main` only when it is complete and the build passes.
4. Keep `npm test` green, and update `README.md` and the report when a chunk ships.
