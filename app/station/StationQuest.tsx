"use client";

import dynamic from "next/dynamic";
import "./quest.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { dvLeft, evidence, iceClock, options, replay, replayPoint, step } from "@/lib/game";
import type { Action, GameState } from "@/lib/game";
import { CHOICE_ENTER, STATION_CLUE, STATION_ENTER, STATION_LEAK, STATION_TEST, type VoiceLine } from "@/lib/game/data/story";
import Result from "../lab/Result";
import { GhostCompare, ReplayButtons } from "../mission/Replay";
import { Sound, playLine, saveSettings, type LineHandle, type Settings } from "../mission/audio";
import { actionsTo } from "../mission/shortcut";
import { Decision, FinalHours } from "./Decide";
import { Fix, Investigate, Look, Prove, Report } from "./Steps";
import { STEPS, coach, clueCount, stepDone, r0, r1, type QuestCtx, type StepId } from "./shared";

const RUN_KEY = "eclipse-run";
interface Run {
  v: 1;
  seed: number;
  actions: Action[];
}

/** Storage React can read without a hydration mismatch: empty on the server, real in the browser. */
function useStore(key: "run" | "settings"): string {
  const read = () => {
    try {
      return (key === "run" ? window.sessionStorage.getItem(RUN_KEY) : window.localStorage.getItem("eclipse-settings")) ?? "";
    } catch {
      return "";
    }
  };
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

function saveRun(run: Run | null) {
  try {
    if (run) window.sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
    else window.sessionStorage.removeItem(RUN_KEY);
  } catch {
    /* private window: carry on without saving */
  }
  window.dispatchEvent(new Event("eclipse-store"));
}

// the spacewalk is WebGL: browser only, loaded when you go outside
const StationWalk = dynamic(() => import("./walk/StationWalk"), { ssr: false });

export default function StationQuest() {
  const router = useRouter();
  const [sound] = useState(() => new Sound());
  const runRaw = useStore("run");
  const settingsRaw = useStore("settings");
  const settings = useMemo<Settings>(() => {
    try {
      const p = JSON.parse(settingsRaw || "{}") as Partial<Settings>;
      return { sound: p.sound !== false, voice: p.voice !== false };
    } catch {
      return { sound: true, voice: true };
    }
  }, [settingsRaw]);
  const run = useMemo<Run | null>(() => {
    if (!runRaw) return null;
    try {
      const r = JSON.parse(runRaw) as Run;
      if (r.v !== 1 || !Array.isArray(r.actions) || !r.actions.length) return null;
      return replay(r.seed, r.actions).rejected.length ? null : r;
    } catch {
      return null;
    }
  }, [runRaw]);
  const game: GameState | null = useMemo(() => (run ? replay(run.seed, run.actions).state : null), [run]);

  const [intro, setIntro] = useState(true);
  // outside, in 3D (the default), or the station guide with its steps
  const [walk, setWalk] = useState(true);
  const [pick, setPick] = useState<StepId | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);

  useEffect(() => {
    sound.setEnabled(settings.sound);
  }, [sound, settings.sound]);
  const setSettings = (s: Settings) => {
    saveSettings(s);
    window.dispatchEvent(new Event("eclipse-store"));
  };

  // ── the Director ──
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
      setCaption(line.text);
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

  // ── doing things ──
  const act = (a: Action): string | null => {
    if (!run || !game) return "No mission is running.";
    const r = step(game, a);
    if (!r.ok) return r.reason;
    saveRun({ ...run, actions: [...run.actions, a] });
    return null;
  };
  const doRun: QuestCtx["run"] = (a, kind = "lock") => {
    if (!game) return;
    sound.unlock();
    const before = game.log.length;
    const reason = act(a);
    if (reason) {
      sound.reject();
      setFlash(reason);
      return;
    }
    setFlash(null);
    setFrom(before);
    if (kind === "radio") sound.radio();
    else if (kind === "thump") sound.thump(0.7);
    else sound.lock();
  };

  const startDemo = () => {
    sound.unlock();
    const q = Number(new URLSearchParams(window.location.search).get("seed"));
    const seed = Number.isFinite(q) && q > 0 ? Math.floor(q) : (Date.now() % 900000) + 1;
    const { actions } = actionsTo(seed, "station");
    saveRun({ v: 1, seed, actions });
    said.current.clear();
  };
  const playAgain = () => {
    saveRun(null);
    router.push("/mission");
  };

  // /station?demo=1 builds a docked ship when there is no mission at the station yet
  const demoTried = useRef(false);
  useEffect(() => {
    if (demoTried.current) return;
    demoTried.current = true;
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    // look at the saved mission itself (the first render only has the empty server snapshot)
    let ok = false;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(RUN_KEY) ?? "null") as Run | null;
      if (saved && saved.actions?.length) {
        const phase = replay(saved.seed, saved.actions).state.phase;
        ok = phase === "station" || phase === "choice" || phase === "endgame" || phase === "debrief";
      }
    } catch {
      ok = false;
    }
    if (!ok) startDemo();
    // runs once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sounds and voice at the moments that matter
  const found = game?.found.length ?? 0;
  const prev = useRef(found);
  useEffect(() => {
    if (!game) return;
    if (found > prev.current) {
      const hazard = game.found.some((f) => f === "leak" || f === "drift");
      if (hazard && !said.current.has(STATION_LEAK.id) && game.found.includes("leak")) {
        sound.alarm();
        window.setTimeout(() => say(STATION_LEAK), 700);
      } else {
        sound.ping();
        window.setTimeout(() => say(STATION_CLUE), 500);
      }
    }
    prev.current = found;
  }, [found, game, sound, say]);
  const tested = !!game?.test;
  useEffect(() => {
    if (tested) say(STATION_TEST);
  }, [tested, say]);
  const phase = game?.phase;
  useEffect(() => {
    if (phase !== "choice") return;
    const id = window.setTimeout(() => say(CHOICE_ENTER), 800);
    return () => window.clearTimeout(id);
  }, [phase, say]);

  // ── no mission yet ──
  if (!game || !run) {
    return (
      <div className="sq">
        <TopBar settings={settings} set={setSettings} game={null} />
        <main className="sq-main center" id="main">
          <div className="sq-welcome">
            <p className="sq-eyebrow">The Station Mission</p>
            <h1>You have not reached Lantern 17 yet.</h1>
            <p>This part of the game happens after you build a ship and fly to the station. You can play the whole mission from the start, or jump straight in with a ship that is already docked.</p>
            <div className="sq-actions row">
              <Link href="/mission" className="sq-btn big">
                Play the whole mission <span aria-hidden="true">↗</span>
              </Link>
              <button type="button" className="sq-btn ghost big" onClick={startDemo}>
                Try the station now
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const g = game;
  if (g.phase !== "station" && g.phase !== "choice" && g.phase !== "endgame" && g.phase !== "debrief") {
    return (
      <div className="sq">
        <TopBar settings={settings} set={setSettings} game={g} />
        <main className="sq-main center" id="main">
          <div className="sq-welcome">
            <p className="sq-eyebrow">The Station Mission</p>
            <h1>Your ship has not docked yet.</h1>
            <p>Finish building your ship and flying to Lantern 17 first. Or try the station right now with a ship that is already docked.</p>
            <div className="sq-actions row">
              <Link href="/mission" className="sq-btn big">
                Back to the mission <span aria-hidden="true">←</span>
              </Link>
              <button type="button" className="sq-btn ghost big" onClick={startDemo}>
                Try the station now
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const ctx: QuestCtx = { game: g, opts: g.phase === "debrief" ? [] : options(g), run: doRun, say, from, flash };
  const co = coach(g);
  const active: StepId = pick ?? co.step;

  return (
    <div className="sq">
      <TopBar settings={settings} set={setSettings} game={g} />
      <main className="sq-main" id="main">
        {g.phase === "debrief" ? (
          <div className="sq-end">
            <p className="sq-eyebrow">Mission over · hour {r1(g.t)}</p>
            <GhostCompare game={g} />
            <Result s={g} />
            <ReplayButtons
              game={g}
              onReplay={(at) => {
                try {
                  window.sessionStorage.removeItem("eclipse-flight");
                } catch {
                  /* ignore */
                }
                saveRun({ ...run, actions: replayPoint(run.actions, at) });
                router.push("/mission");
              }}
            />
            <div className="sq-actions row">
              <button type="button" className="sq-btn big" onClick={playAgain}>
                Play again with a new ship <span aria-hidden="true">↗</span>
              </button>
              <Link href="/lab" className="sq-btn ghost big">
                See how every crew did in the Mission Lab
              </Link>
            </div>
          </div>
        ) : g.phase === "choice" ? (
          <Decision c={ctx} />
        ) : g.phase === "endgame" ? (
          <FinalHours c={ctx} />
        ) : intro && !g.surveyed ? (
          <Welcome onBegin={() => { setIntro(false); say(STATION_ENTER); }} />
        ) : walk ? (
          <StationWalk c={ctx} coach={co} sound={sound} onGuide={() => setWalk(false)} />
        ) : (
          <>
            <section className="sq-coach" aria-label="Your next move">
              <p className="sq-eyebrow">Your next move</p>
              <h2>{co.title}</h2>
              <p>{co.text}</p>
              {pick && pick !== co.step && (
                <button type="button" className="sq-link" onClick={() => setPick(null)}>
                  Take me to the suggested step
                </button>
              )}
              <button type="button" className="sq-btn" onClick={() => setWalk(true)}>
                Go outside: walk the station in 3D <span aria-hidden="true">↗</span>
              </button>
            </section>

            <div className="sq-layout">
              <nav className="sq-steps" aria-label="Station steps">
                {STEPS.map((s, i) => {
                  const done = stepDone(g, s.id);
                  return (
                    <button key={s.id} type="button" className={`sq-step${active === s.id ? " on" : ""}${done ? " done" : ""}`} aria-current={active === s.id ? "step" : undefined} onClick={() => setPick(s.id)}>
                      <span className="n">{done ? "✓" : i + 1}</span>
                      <span>
                        <b>{s.title}</b>
                        <small>{s.id === "investigate" ? `${clueCount(g)} of 6 clues found` : s.sub}</small>
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="sq-stage">
                {active === "look" && <Look c={ctx} />}
                {active === "investigate" && <Investigate c={ctx} />}
                {active === "fix" && <Fix c={ctx} />}
                {active === "prove" && <Prove c={ctx} />}
                {active === "report" && <Report c={ctx} />}
              </div>
            </div>

            <section className="sq-next" aria-label="Ready to decide">
              <div>
                <p className="sq-eyebrow">When you have done what you can</p>
                <h2>Make the big decision</h2>
                <p>Fix the mirror, use it as a weapon, find a middle way, let the network decide, or leave. You cannot come back after this.</p>
                <ul className="sq-ready">
                  <li className={evidence(g) >= 80 ? "ok" : "warn"}>Proof: {evidence(g)} of 100</li>
                  <li className={g.test ? "ok" : "warn"}>{g.test ? "Test done" : "No test yet"}</li>
                  <li className={g.broadcast ? "ok" : ""}>{g.broadcast ? "Report sent" : "Report not sent"}</li>
                </ul>
              </div>
              <button
                type="button"
                className="sq-btn big"
                onClick={() => {
                  sound.unlock();
                  const before = g.log.length;
                  const reason = act({ type: "toChoice" });
                  if (reason) {
                    sound.reject();
                    setFlash(reason);
                  } else {
                    sound.thump(0.6);
                    setFrom(before);
                    setPick(null);
                  }
                }}
              >
                Go to the big decision <span aria-hidden="true">→</span>
              </button>
            </section>
          </>
        )}
      </main>
      <div className={`sq-caption${caption ? " on" : ""}`} aria-live="polite">
        {caption && (
          <p>
            <b>DIRECTOR</b> {caption}
          </p>
        )}
      </div>
    </div>
  );
}

function TopBar({ settings, set, game }: { settings: Settings; set: (s: Settings) => void; game: GameState | null }) {
  return (
    <header className="sq-top">
      <Link href="/mission" className="sq-brand" aria-label="Back to the mission">
        <span aria-hidden="true" /> PROJECT ECLIPSE
      </Link>
      <p className="sq-where">STATION MISSION</p>
      {game && (
        <ul className="sq-meters" aria-label="Your numbers">
          <li title="Hours until the ice hits Lantern 17">
            <small>Time to impact</small>
            <b className="ice">{r1(Math.max(0, iceClock(game)))} h</b>
          </li>
          <li title="How much your ship can still change its speed (the Δv). Flying home needs some of it.">
            <small>Fuel power</small>
            <b>{r0(dvLeft(game))}</b>
          </li>
          <li title="Stored energy. Sensors, heaters and radios use it.">
            <small>Battery</small>
            <b>{r0(game.energyKwh)} kWh</b>
          </li>
          <li title="Proof points from clues and your test. The network needs 80.">
            <small>Proof</small>
            <b>{evidence(game)} / 100</b>
          </li>
        </ul>
      )}
      <div className="sq-toggles">
        <button type="button" aria-pressed={settings.sound} onClick={() => set({ ...settings, sound: !settings.sound })}>
          Sound {settings.sound ? "on" : "off"}
        </button>
        <button type="button" aria-pressed={settings.voice} onClick={() => set({ ...settings, voice: !settings.voice })}>
          Voice {settings.voice ? "on" : "off"}
        </button>
      </div>
    </header>
  );
}

function Welcome({ onBegin }: { onBegin: () => void }) {
  const goes = [
    ["Look around", "Fly a lap to see the station."],
    ["Investigate", "Search six zones for clues."],
    ["Fix problems", "Patch what is broken."],
    ["Prove it", "Cross off wrong ideas and run a test."],
    ["Tell the world", "Send your report to the other Lanterns."],
  ];
  return (
    <div className="sq-intro">
      <p className="sq-eyebrow">You have docked at Lantern 17</p>
      <h1>
        Find out why it is dying. <em>Then prove it.</em>
      </h1>
      <p className="sq-lede big">
        Lantern 17 is a station that makes light for a whole world. Its light is falling, and a huge piece of ice is on the way. You have a few hours. Here is what you do:
      </p>
      <ol className="sq-goes">
        {goes.map(([t, d], i) => (
          <li key={t}>
            <span>{i + 1}</span>
            <b>{t}</b>
            <p>{d}</p>
          </li>
        ))}
      </ol>
      <div className="sq-rules">
        <p>
          <b>Everything takes time.</b> The ice clock at the top never stops.
        </p>
        <p>
          <b>You pick the order.</b> A coach tells you what to do next, and you can ignore it.
        </p>
        <p>
          <b>Then you make one big decision.</b> It cannot be undone.
        </p>
      </div>
      <button type="button" className="sq-btn big" onClick={onBegin}>
        Start the mission <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
