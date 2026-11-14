"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPlanetRenderer, type PlanetRenderer } from "@/app/components/heroPlanet";
import { OPENING, TITLE_CARD, type OpeningPanel } from "@/lib/game/data/story";
import { SCENES, type ArtFrame, type Scene } from "./art";
import { estimateSeconds, playLine, type LineHandle, type Settings, type Sound } from "./audio";

// ───────────────────────────── helpers ─────────────────────────────

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(REDUCE_QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}

type Imgs = Record<string, HTMLImageElement | undefined>;
let imageCache: Imgs | null = null;

/** The textures the scenes borrow from the site: ice debris and hull metal. Loaded once, used as they arrive. */
function loadImages(): Imgs {
  if (imageCache) return imageCache;
  const imgs: Imgs = {};
  for (const [key, src] of [
    ["debris_0", "/textures/debris_0.png"],
    ["debris_1", "/textures/debris_1.png"],
    ["debris_2", "/textures/debris_2.png"],
    ["hull", "/textures/hull.jpg"],
  ] as const) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    imgs[key] = img;
  }
  imageCache = imgs;
  return imgs;
}

/** One canvas, one loop. The scene reads the narration's progress, so the picture follows the voice. */
function ArtCanvas({ scene, progress, reduce }: { scene: Scene; progress: () => number; reduce: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const progressRef = useRef(progress);
  useEffect(() => {
    sceneRef.current = scene;
    progressRef.current = progress;
  });

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const imgs = loadImages();
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    const t0 = performance.now();

    const frame = (still: boolean) => {
      const f: ArtFrame = {
        g,
        w,
        h,
        t: still ? 9 : (performance.now() - t0) / 1000,
        p: still ? 1 : progressRef.current(),
        imgs,
      };
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      sceneRef.current(f);
    };
    const resize = () => {
      w = parent.clientWidth;
      h = parent.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (reduce) frame(true);
    };
    const loop = () => {
      frame(false);
      raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();
    if (reduce) {
      // a still image: redraw once the textures have arrived
      const redraw = () => frame(true);
      Object.values(imgs).forEach((i) => i?.addEventListener("load", redraw));
      return () => {
        ro.disconnect();
        Object.values(imgs).forEach((i) => i?.removeEventListener("load", redraw));
      };
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce]);

  return <canvas ref={ref} className="ms-art-canvas" aria-hidden="true" />;
}

/** Panel 1: the real planet shader from the home page, with every Lantern switched off. Cold starlight only. */
function PlanetArt({ reduce }: { reduce: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const box = wrap.current;
    const cv = canvas.current;
    if (!box || !cv) return;
    let renderer: PlanetRenderer | null = null;
    let disposed = false;
    let raf = 0;
    const t0 = performance.now();
    const EXTENT = 1.25;
    let size = 0;

    const layout = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      const R = Math.min(w * 0.4, h * 1.05);
      size = R * 2 * EXTENT;
      cv.style.width = `${size}px`;
      cv.style.height = `${size}px`;
      cv.style.left = `${w / 2 - size / 2}px`;
      cv.style.top = `${h * 0.6 + R - size / 2}px`;
      renderer?.resize(size, Math.min(window.devicePixelRatio || 1, 1.5));
    };
    const draw = () => renderer?.render([], reduce ? 1.2 : ((performance.now() - t0) / 1000) * 0.045);
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };

    const img = new Image();
    img.decoding = "async";
    img.src = "/textures/planet_map.jpg";
    img
      .decode()
      .then(() => {
        if (disposed) return;
        renderer = createPlanetRenderer(cv, { elevation: 0.32, roll: 0, extent: EXTENT }, img, () => setFailed(true));
        if (!renderer) return setFailed(true);
        layout();
        if (reduce) draw();
        else raf = requestAnimationFrame(loop);
      })
      .catch(() => !disposed && setFailed(true));

    const ro = new ResizeObserver(() => {
      layout();
      if (reduce) draw();
    });
    ro.observe(box);
    layout();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer?.dispose();
    };
  }, [reduce]);

  return (
    <div ref={wrap} className="ms-art-planet" aria-hidden="true">
      {failed ? <div className="ms-planet-fallback" /> : <canvas ref={canvas} />}
    </div>
  );
}

// ───────────────────────────── one panel ─────────────────────────────

function PanelView({
  panel,
  settings,
  sound,
  reduce,
  onFinished,
}: {
  panel: OpeningPanel;
  settings: Settings;
  sound: Sound;
  reduce: boolean;
  onFinished: () => void;
}) {
  const words = panel.line.text.split(" ");
  const [shown, setShown] = useState(0);
  const [finished, setFinished] = useState(false);
  const handle = useRef<LineHandle | null>(null);
  const voiceOn = useRef(settings.voice);
  const finishedRef = useRef(onFinished);
  const progress = useCallback(() => handle.current?.progress() ?? 0, []);

  useEffect(() => {
    finishedRef.current = onFinished;
    voiceOn.current = settings.voice;
    handle.current?.setMuted(!settings.voice);
  });

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let hold = 0;
    // let the picture arrive before anyone speaks
    const begin = window.setTimeout(() => {
      const h = playLine(panel.line, {
        voice: voiceOn.current,
        onSpeaking: (s) => sound.duck(s && voiceOn.current),
      });
      handle.current = h;
      h.setMuted(!voiceOn.current);
      const tick = () => {
        if (cancelled) return;
        setShown(Math.min(words.length, Math.ceil(words.length * Math.min(1, h.progress() * 1.03))));
        raf = requestAnimationFrame(tick);
      };
      tick();
      h.done.then(() => {
        if (cancelled) return;
        cancelAnimationFrame(raf);
        setShown(words.length);
        setFinished(true);
        hold = window.setTimeout(() => finishedRef.current(), reduce ? 1500 : 2600);
      });
    }, 1100);
    return () => {
      cancelled = true;
      window.clearTimeout(begin);
      window.clearTimeout(hold);
      cancelAnimationFrame(raf);
      handle.current?.cancel();
      sound.duck(false);
    };
    // the line, the sound bed and the motion setting are fixed for the life of one panel (it is keyed by index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoom = `${Math.round(estimateSeconds(panel.line) + 6)}s`;
  const scene = SCENES[panel.n];

  return (
    <div className="ms-panel" style={{ ["--zoom" as string]: zoom }}>
      <div className="ms-art">
        {panel.n === 1 ? <PlanetArt reduce={reduce} /> : scene && <ArtCanvas scene={scene} progress={progress} reduce={reduce} />}
      </div>
      <div className="ms-vignette" aria-hidden="true" />

      <p className="ms-tag" aria-hidden="true">
        {panel.tag}
      </p>
      <div className="ms-caption">
        <p className="eyebrow">
          <b>{String(panel.n).padStart(2, "0")}</b> {"//"} {panel.caption}
        </p>
        {panel.truth && (
          <p className={`ms-truth ${panel.truth.kind}${finished ? " in" : ""}`}>
            <span>{panel.truth.kind === "real" ? "REAL" : "FICTION"}</span> {panel.truth.text}
          </p>
        )}
      </div>

      <p className="ms-line">
        <span className="sr-only">{panel.line.text}</span>
        <span aria-hidden="true">
          {words.map((w, i) => (
            <span key={i} className={i < shown ? "w in" : "w"}>
              {w}{" "}
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}

// ───────────────────────────── the title card ─────────────────────────────

function TitleCard() {
  return (
    <div className="ms-panel ms-title">
      <div className="ms-title-inner">
        <p className="eyebrow">{TITLE_CARD.kicker}</p>
        <h1 className="display ms-title-name">{TITLE_CARD.title}</h1>
        <p className="ms-title-line1">{TITLE_CARD.line1}</p>
        <p className="ms-title-line2">{TITLE_CARD.line2}</p>
      </div>
    </div>
  );
}

// ───────────────────────────── the opening ─────────────────────────────

export default function Opening({
  sound,
  settings,
  onDone,
  onSkip,
}: {
  sound: Sound;
  settings: Settings;
  onDone: () => void;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const total = OPENING.length;

  const next = useCallback(() => {
    if (idx >= total) onDone();
    else setIdx(idx + 1);
  }, [idx, total, onDone]);

  // each scene arrives with a low swell and a boom; the title card gets a bigger one
  useEffect(() => {
    sound.swell(idx % 2 ? 98 : 110);
    sound.thump(idx === total ? 0.75 : 0.4);
  }, [idx, sound, total]);

  // the title card holds for a few seconds, then the briefing begins
  useEffect(() => {
    if (idx !== total) return;
    const id = window.setTimeout(onDone, reduce ? 3500 : 6500);
    return () => window.clearTimeout(id);
  }, [idx, total, onDone, reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("button, a, input")) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, onSkip]);

  return (
    <div className="ms-opening" onClick={(e) => !(e.target as HTMLElement).closest("button") && next()} role="region" aria-label="Opening">
      {idx < total ? (
        <PanelView key={idx} panel={OPENING[idx]} settings={settings} sound={sound} reduce={reduce} onFinished={next} />
      ) : (
        <TitleCard />
      )}

      <div className="ms-op-foot">
        <ol className="ms-dots" aria-label={`Panel ${Math.min(idx + 1, total)} of ${total}`}>
          {OPENING.map((p, i) => (
            <li key={p.n} className={i < idx ? "done" : i === idx ? "on" : ""} />
          ))}
        </ol>
        <p className="ms-hint">Click or press Space to continue</p>
        <button type="button" className="btn btn-ghost ms-skip" onClick={onSkip}>
          Skip opening <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
