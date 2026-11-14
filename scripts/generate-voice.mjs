#!/usr/bin/env node
/**
 * Records every spoken line in lib/game/data/story.ts with ElevenLabs and saves it to public/audio/.
 *
 *   ELEVENLABS_API_KEY=... npm run voice            record new or changed lines only
 *   ELEVENLABS_API_KEY=... npm run voice -- --force  record everything again
 *   ELEVENLABS_API_KEY=... npm run voice -- --audition  record the voice audition clips
 *   npm run voice -- --retag                          (re)write the "AI-generated" file metadata, no key needed
 *
 * Every file is tagged in its metadata as AI-generated (NASA Space Apps asks for that on AI audio). Tagging
 * uses ffmpeg; if it isn't installed the files are still saved and a warning tells you to run --retag later.
 *
 * A line is re-recorded only when its text, voice, settings or model changed (see public/audio/manifest.json),
 * so re-running is free. The key needs only the "Text to Speech" permission.
 *
 * The game plays these files. If one is missing, it falls back to the browser's own voice.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_LINES, AUDITION, VOICES, VOICE_MODEL } from "../lib/game/data/story.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "audio");
const manifestPath = join(outDir, "manifest.json");
const args = new Set(process.argv.slice(2));
const force = args.has("--force");

const key = process.env.ELEVENLABS_API_KEY;
if (!key && !args.has("--retag")) {
  console.error("Set ELEVENLABS_API_KEY first (a key with the Text to Speech permission).");
  process.exit(1);
}

const AI_NOTE = "AI-generated voice (ElevenLabs text-to-speech) for Project Eclipse, NASA Space Apps 2026. Not a human recording.";

/** Write the AI-generation declaration into the file's metadata. Returns false if ffmpeg is missing. */
async function tag(file, title) {
  const tmp = `${file}.tagged.mp3`;
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", file, "-c", "copy", "-map_metadata", "-1",
      "-metadata", `title=${title}`, "-metadata", "artist=ElevenLabs (AI-generated voice)",
      "-metadata", "album=Project Eclipse", "-metadata", `comment=${AI_NOTE}`, tmp],
    { stdio: "ignore" },
  );
  if (r.status !== 0) return false;
  await rename(tmp, file);
  return true;
}

let untagged = 0;
async function save(file, audio, title) {
  await writeFile(file, audio);
  if (!(await tag(file, title))) untagged++;
}

const hash = (parts) => createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 12);

async function speak({ voiceId, text, settings, previousText, nextText }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const body = { text, model_id: VOICE_MODEL, voice_settings: settings };
  if (previousText) body.previous_text = previousText;
  if (nextText) body.next_text = nextText;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const msg = await res.text();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${msg.slice(0, 300)}`);
  }
  throw new Error("ElevenLabs kept failing. Try again in a minute.");
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return { model: VOICE_MODEL, lines: {} };
  }
}

async function recordLines() {
  await mkdir(outDir, { recursive: true });
  const manifest = await loadManifest();
  manifest.model = VOICE_MODEL;
  let made = 0;
  let credits = 0;
  for (let i = 0; i < ALL_LINES.length; i++) {
    const line = ALL_LINES[i];
    const v = VOICES[line.role];
    // neighbours in the same voice give the model context, so a line sounds like part of one telling
    const prev = ALL_LINES[i - 1]?.role === line.role ? ALL_LINES[i - 1].text : undefined;
    const next = ALL_LINES[i + 1]?.role === line.role ? ALL_LINES[i + 1].text : undefined;
    const h = hash([line.text, v.id, v.settings, VOICE_MODEL]);
    if (!force && manifest.lines[line.id]?.hash === h) {
      console.log(`  ok       ${line.id} (unchanged)`);
      continue;
    }
    const audio = await speak({ voiceId: v.id, text: line.text, settings: v.settings, previousText: prev, nextText: next });
    await save(join(outDir, `${line.id}.mp3`), audio, `${line.id} (${v.name})`);
    manifest.lines[line.id] = { hash: h, voice: v.name, bytes: audio.length, chars: line.text.length };
    made++;
    credits += line.text.length;
    console.log(`  recorded ${line.id}: ${v.name}, ${(audio.length / 1024).toFixed(0)} KB, about ${(audio.length / 16000).toFixed(1)} s`);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Done. ${made} recorded, about ${credits} credits used.`);
}

async function recordAudition() {
  const dir = join(outDir, "audition");
  await mkdir(dir, { recursive: true });
  const samples = {
    narrator: "Let me tell you about a world that never sees a sunrise. For these people, that is what morning means.",
    director: "Find out what's wrong. Fix what you can. Bring the data home. You're one of three hundred crews out tonight.",
  };
  for (const a of AUDITION) {
    const settings = VOICES[a.role].settings;
    const audio = await speak({ voiceId: a.id, text: samples[a.role], settings });
    await save(join(dir, `${a.role}-${a.name.toLowerCase()}.mp3`), audio, `Audition: ${a.name}`);
    console.log(`  audition ${a.role}-${a.name.toLowerCase()}: ${(audio.length / 1024).toFixed(0)} KB, about ${(audio.length / 16000).toFixed(1)} s`);
  }
}

async function retag() {
  let n = 0;
  for (const dir of [outDir, join(outDir, "audition")]) {
    for (const f of (await readdir(dir).catch(() => [])).filter((x) => x.endsWith(".mp3"))) {
      if (await tag(join(dir, f), f.replace(/\.mp3$/, ""))) n++;
      else untagged++;
    }
  }
  console.log(`Tagged ${n} files.`);
}

try {
  if (args.has("--retag")) await retag();
  else if (args.has("--audition")) await recordAudition();
  else await recordLines();
  if (untagged) console.warn(`Warning: ${untagged} file(s) not tagged as AI-generated (ffmpeg not found). Install ffmpeg and run: npm run voice -- --retag`);
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}
