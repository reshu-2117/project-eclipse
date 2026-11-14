"use client";

import "./mission.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  SETTLEMENTS,
  SETTLEMENT_IDS,
  createGame,
  dvLeft,
  evidence,
  iceClock,
  loadoutStats,
  replay,
  step,
} from "@/lib/game";
import type { Action, GameState } from "@/lib/game";
import { CREDITS_VOICE, DISCLAIMER, ONE_RULE, type VoiceLine } from "@/lib/game/data/story";
import { Sound, playLine, saveSettings, type LineHandle, type Settings } from "./audio";
import Result from "../lab/Result";
import Briefing from "./Briefing";
import Hangar from "./Hangar";
import Opening from "./Opening";
import Journey from "./Journey";
import Route from "./Route";

// ───────────────────────────── saved runs ─────────────────────────────

const RUN_KEY = "eclipse-run";

interface Run {
  v: 1;
  seed: number;
  actions: Action[];
}

const fresh = (seed: number): Run => ({ v: 1, seed, actions: [] });

function coalesce(actions: Action[], a: Action): Action[] {
  // dragging the fuel slider is one decision, not forty
  const last = actions[actions.length - 1];
  if (a.type === "fuel" && last?.type === "fuel") return [...actions.slice(0, -1), a];
  return [...actions, a];
}

function readSaved(): Run | null {
  try {
    const raw = window.sessionStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as Run;
    if (run.v !== 1 || !Array.isArray(run.actions) || run.actions.length === 0) return null;
    const { rejected } = replay(run.seed, run.actions);
    return rejected.length ? null : run;
  } catch {
    return null;
  }
}

/** Storage that React can read without a hydration mismatch: empty on the server, real in the browser. */
function useStorageString(read: () => string): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("eclipse-store", cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener("eclipse-store", cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => "",
  );
}

const readSettingsRaw = () => {
  try {
    return window.localStorage.getItem("eclipse-settings") ?? "";
  } catch {
    return "";
  }
};
const readRunRaw = () => {
  try {
    return window.sessionStorage.getItem(RUN_KEY) ?? "";
  } catch {
    return "";
  }
};

// ───────────────────────────── the top bar ─────────────────────────────

function Icon({ name }: { name: "sound" | "voice" }) {
  return name === "sound" ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function Toggles({ settings, set }: { settings: Settings; set: (s: Settings) => void }) {
  return (
    <div className="ms-toggles">
      <button type="button" className="ms-toggle" aria-pressed={settings.sound} onClick={() => set({ ...settings, sound: !settings.sound })}>
        <Icon name="sound" />
        <span>Sound {settings.sound ? "on" : "off"}</span>
      </button>
      <button type="button" className="ms-toggle" aria-pressed={settings.voice} onClick={() => set({ ...settings, voice: !settings.voice })}>
        <Icon name="voice" />
        <span>Voice {settings.voice ? "on" : "off"}</span>
      </button>
    </div>
  );
}

function Hud({ game, settings, set, label }: { game: GameState; settings: Settings; set: (s: Settings) => void; label: string }) {
  const inHangar = game.phase === "hangar";
  const st = loadoutStats(game.loadout);
  const dv = inHangar ? st.dv : dvLeft(game);
  const energy = inHangar ? st.energyKwh : game.energyKwh;
  const clock = iceClock(game);
  const reserve = SETTLEMENT_IDS.map((id) => game.settlements[id] / SETTLEMENTS[id].reserveH);
  return (
    <header className="ms-hud">
      <Link href="/" className="ms-brand" aria-label="Project Eclipse, back to the home page">
        <span aria-hidden="true" />
        PROJECT ECLIPSE
      </Link>
      <p className="ms-where">{label}</p>
      <ul className="ms-meters" aria-label="Mission meters">
        <li>
          <small>Δv</small>
          <b>{Math.round(dv).toLocaleString("en-US")}</b>
          <u>m/s</u>
        </li>
        <li>
          <small>Energy</small>
          <b>{Math.round(energy).toLocaleString("en-US")}</b>
          <u>kWh</u>
        </li>
        <li className="ice">
          <small>Ice clock</small>
          <b>T−{Math.max(0, Math.round(clock * 10) / 10)}</b>
          <u>h</u>
        </li>
        <li>
          <small>Evidence</small>
          <b>{evidence(game)}</b>
          <u>/ 100</u>
        </li>
        {!inHangar && (
          <>
            <li>
              <small>Hull</small>
              <b>{game.hull}</b>
              <u>/ 100</u>
            </li>
            <li>
              <small>Mission time</small>
              <b>T+{Math.round(game.t * 10) / 10}</b>
              <u>h</u>
            </li>
          </>
        )}
        <li>
          <small>City light</small>
          <span className="ms-bars" aria-label="Four settlements, all with power">
            {reserve.map((r, i) => (
              <i key={i} style={{ ["--r" as string]: Math.max(0.15, r) }} />
            ))}
          </span>
        </li>
      </ul>
      <Toggles settings={settings} set={set} />
    </header>
  );
}

// ───────────────────────────── the gate ─────────────────────────────

function Gate({
  settings,
  set,
  canContinue,
  onBegin,
  onContinue,
}: {
  settings: Settings;
  set: (s: Settings) => void;
  canContinue: boolean;
  onBegin: () => void;
  onContinue: () => void;
}) {
  return (
    <main className="ms-gate" id="main">
      <div className="ms-gate-inner">
        <p className="eyebrow">
          NASA Space Apps 2026 <b>{"//"}</b> Space Mission Design Game
        </p>
        <h1 className="display">
          Project <em>Eclipse</em>
        </h1>
        <p className="ms-gate-line">
          Lantern 17 is failing. You are one of 300 crews out tonight. Build a ship, fly it, work out what is really wrong, and bring the data home.
        </p>
        <p className="ms-rule">{ONE_RULE}</p>
        <div className="ms-gate-actions">
          <button type="button" className="btn btn-lantern" onClick={onBegin} autoFocus>
            Enter the Wick <span aria-hidden="true">↗</span>
          </button>
          {canContinue && (
            <button type="button" className="btn btn-ghost" onClick={onContinue}>
              Continue your mission
            </button>
          )}
        </div>
        <Toggles settings={settings} set={set} />
        <p className="ms-gate-skip">
          Reviewing? <Link href="/station?demo=1">Jump to the Station Mission</Link>, a short guided part of the game that happens after you reach Lantern 17. A ship is built and flown for you.
        </p>
        <p className="ms-gate-small">Best with sound. Both switches can be changed at any time.</p>
        <p className="ms-gate-fine">
          {DISCLAIMER} {CREDITS_VOICE}
        </p>
        <Link href="/" className="ms-gate-back">
          ← Back to the home page
        </Link>
      </div>
    </main>
  );
}

// ───────────────────────────── after launch ─────────────────────────────

function Ending({ game, onRebuild }: { game: GameState; onRebuild: () => void }) {
  return (
    <main className="ms-ending" id="main">
      <div className="ms-ending-inner">
        <p className="eyebrow">
          Mission over <b>{"//"}</b> Hour {Math.round(game.t * 10) / 10}
        </p>
        <Result s={game} />
        <div className="ms-gate-actions">
          <button type="button" className="btn btn-lantern" onClick={onRebuild}>
            Build a different ship <span aria-hidden="true">↗</span>
          </button>
          <Link href="/lab" className="btn btn-ghost">
            Watch a mission in the Mission Lab
          </Link>
        </div>
      </div>
    </main>
  );
}

// ───────────────────────────── the page ─────────────────────────────

export default function Mission() {
  const [sound] = useState(() => new Sound());
  const settingsRaw = useStorageString(readSettingsRaw);
  const settings = useMemo<Settings>(() => {
    if (!settingsRaw) return { sound: true, voice: true };
    try {
      const p = JSON.parse(settingsRaw) as Partial<Settings>;
      return { sound: p.sound !== false, voice: p.voice !== false };
    } catch {
      return { sound: true, voice: true };
    }
  }, [settingsRaw]);
  const runRaw = useStorageString(readRunRaw);
  const saved = useMemo(() => (runRaw ? readSaved() : null), [runRaw]);

  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState<Run>(() => fresh(1));
  const runRef = useRef(run);
  const gameRef = useRef<GameState>(createGame(1));
  const game = useMemo(() => replay(run.seed, run.actions).state, [run]);
  const [caption, setCaption] = useState<{ text: string; who: string } | null>(null);
  // the opening and the briefing come before the hangar, on a fresh start only
  const [intro, setIntro] = useState<"opening" | "briefing" | null>(null);

  // sound follows the switch
  useEffect(() => {
    sound.setEnabled(settings.sound);
  }, [sound, settings.sound]);

  const setSettings = useCallback((s: Settings) => {
    saveSettings(s);
    window.dispatchEvent(new Event("eclipse-store"));
  }, []);

  // save the run so a refresh can pick it up
  useEffect(() => {
    if (!playing) return;
    try {
      window.sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
    } catch {
      /* private window: carry on without saving */
    }
  }, [run, playing]);

  const commit = useCallback((next: Run, g: GameState) => {
    runRef.current = next;
    gameRef.current = g;
    setRun(next);
  }, []);

  /** Run a click through the engine. Returns the reason if the engine refused it. */
  const act = useCallback(
    (a: Action): string | null => {
      const r = step(gameRef.current, a);
      if (!r.ok) return r.reason;
      const cur = runRef.current;
      const actions = coalesce(cur.actions, a);
      // a coalesced fuel change replaces the last one, so rebuild the state from the shorter list
      const g = actions.length === cur.actions.length + 1 ? r.state : replay(cur.seed, actions).state;
      commit({ ...cur, actions }, g);
      return null;
    },
    [commit],
  );

  // ── the Director: a caption, and her voice if it is on ──
  const lineRef = useRef<LineHandle | null>(null);
  const said = useRef(new Set<string>());
  const voiceRef = useRef(settings.voice);
  useEffect(() => {
    voiceRef.current = settings.voice;
    lineRef.current?.setMuted(!settings.voice);
  }, [settings.voice]);

  const say = useCallback(
    (line: VoiceLine) => {
      if (said.current.has(line.id)) return;
      said.current.add(line.id);
      lineRef.current?.cancel();
      setCaption({ text: line.text, who: line.role === "crew" ? "CREW TERN-9 · RADIO" : line.role === "director" ? "DIRECTOR" : "NARRATOR" });
      const h = playLine(line, { voice: voiceRef.current, onSpeaking: (s) => sound.duck(s && voiceRef.current) });
      lineRef.current = h;
      h.done.then(() =>
        window.setTimeout(() => {
          if (lineRef.current === h) setCaption(null);
        }, 1400),
      );
    },
    [sound],
  );

  useEffect(() => {
    const line = lineRef;
    return () => {
      line.current?.cancel();
      sound.duck(false);
    };
  }, [sound]);

  /** A fresh seed for the event deck. Add ?seed=NN to the address to replay a particular deck. */
  const newSeed = () => {
    const q = Number(new URLSearchParams(window.location.search).get("seed"));
    return Number.isFinite(q) && q > 0 ? Math.floor(q) : (Date.now() % 900000) + 1;
  };

  const begin = () => {
    sound.unlock();
    sound.setEnabled(settings.sound);
    sound.swell(110);
    sound.thump(0.5);
    said.current.clear();
    const seed = newSeed();
    const start = replay(seed, [{ type: "begin" }]);
    commit({ v: 1, seed, actions: [{ type: "begin" }] }, start.state);
    setIntro("opening");
    setPlaying(true);
  };

  const resume = () => {
    if (!saved) return begin();
    sound.unlock();
    sound.setEnabled(settings.sound);
    sound.swell(110);
    commit(saved, replay(saved.seed, saved.actions).state);
    setIntro(null);
    setPlaying(true);
  };

  const rebuild = () => {
    said.current.clear();
    const seed = newSeed();
    commit({ v: 1, seed, actions: [{ type: "begin" }] }, replay(seed, [{ type: "begin" }]).state);
  };

  const label =
    game.phase === "hangar"
      ? "THE WICK · ORBITAL DOCK · 300 KM"
      : game.phase === "route"
        ? "LAUNCH GANTRY · CHOOSE A ROUTE"
        : game.phase === "journey"
          ? "EN ROUTE TO LANTERN 17"
          : game.phase === "station" || game.phase === "choice" || game.phase === "endgame"
            ? "LANTERN 17 · DOCKED"
            : "MISSION OVER";

  if (!playing) {
    return (
      <div className="ms">
        <Gate settings={settings} set={setSettings} canContinue={!!saved} onBegin={begin} onContinue={resume} />
      </div>
    );
  }

  if (intro === "opening") {
    return (
      <div className="ms">
        <Opening sound={sound} settings={settings} onDone={() => setIntro("briefing")} onSkip={() => setIntro("briefing")} />
      </div>
    );
  }

  if (intro === "briefing") {
    return (
      <div className="ms">
        <Briefing sound={sound} say={say} onAccept={() => setIntro(null)} />
        <div className={`ms-caption${caption ? " on" : ""}`} aria-live="polite">
          {caption && (
            <p>
              <b>{caption.who}</b> {caption.text}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ms">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Hud game={game} settings={settings} set={setSettings} label={label} />
      {game.phase === "debrief" ? (
        <Ending game={game} onRebuild={rebuild} />
      ) : (
        <main id="main" className="ms-main">
          {game.phase === "hangar" ? (
            <Hangar game={game} act={act} sound={sound} say={say} />
          ) : game.phase === "route" ? (
            <Route game={game} act={act} sound={sound} say={say} />
          ) : (
            <Journey game={game} act={act} sound={sound} say={say} onRebuild={rebuild} />
          )}
        </main>
      )}
      <div className={`ms-caption${caption ? " on" : ""}`} aria-live="polite">
        {caption && (
          <p>
            <b>{caption.who}</b> {caption.text}
          </p>
        )}
      </div>
    </div>
  );
}
