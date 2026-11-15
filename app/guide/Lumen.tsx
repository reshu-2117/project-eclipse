"use client";

/**
 * Lumen: a spark of Lantern light that flies with you and explains, one line at a time.
 *
 * Built on what works in teaching games (BBC Games GEL, Nielsen Norman Group on contextual help):
 * only the essentials, at the moment you need them, by pointing at the one thing to do next, never a
 * wall of text; easy to hide and easy to call back. "What's this?" lets you tap any panel marked with
 * `data-explain` for a plain-words explanation, so help comes when you ask for it.
 */
import "./guide.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface Tip {
  /** a new id re-opens the bubble */
  id: string;
  text: string;
  title?: string;
  /** CSS selector of the thing to point at */
  target?: string;
  tone?: "info" | "warn" | "good";
}

const KEY = "eclipse-lumen";
const read = () => {
  try {
    return window.localStorage.getItem(KEY) ?? "on";
  } catch {
    return "on";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener("eclipse-lumen", cb);
  return () => window.removeEventListener("eclipse-lumen", cb);
};
function setMode(v: "on" | "quiet") {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    /* private window */
  }
  window.dispatchEvent(new Event("eclipse-lumen"));
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function Lumen({
  tip,
  place = "bottom-left",
  avoid = true,
}: {
  tip: Tip | null;
  place?: "bottom-left" | "bottom-right" | "top-left" | "top-center";
  /** move to the other side of the screen if the bubble would cover the thing it points at */
  avoid?: boolean;
}) {
  const mode = useSyncExternalStore(subscribe, read, () => "on");
  const quiet = mode === "quiet";
  const [open, setOpen] = useState(true);
  const [explain, setExplain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [ring, setRing] = useState<Rect | null>(null);
  const lastId = useRef<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [flip, setFlip] = useState(false);

  // a new tip opens the bubble (unless Lumen has been told to stay quiet)
  const tipId = tip?.id ?? null;
  useEffect(() => {
    if (tipId && tipId !== lastId.current) {
      lastId.current = tipId;
      queueMicrotask(() => {
        setExplain(null);
        if (!quiet) setOpen(true);
      });
    }
  }, [tipId, quiet]);

  // follow the thing we're pointing at
  const target = open && !explain && tip?.target ? tip.target : null;
  useEffect(() => {
    if (!target) {
      queueMicrotask(() => setRing(null));
      return;
    }
    let raf = 0;
    let last = "";
    let tried = false;
    const canFlip = avoid && (place === "bottom-left" || place === "bottom-right");
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = document.querySelector(target) as HTMLElement | null;
      if (!el) {
        if (last !== "none") {
          last = "none";
          setRing(null);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (key !== last && r.width > 0) {
        last = key;
        setRing({ x: r.x, y: r.y, w: r.width, h: r.height });
      }
      // never cover the thing we're pointing at: try the other side of the screen once
      const me = asideRef.current?.querySelector(".lumen-bubble")?.getBoundingClientRect();
      if (canFlip && !tried && me && r.width > 0) {
        const hit = me.left < r.right && me.right > r.left && me.top < r.bottom && me.bottom > r.top;
        if (hit) {
          tried = true;
          setFlip((f) => !f);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, avoid, place]);

  // "What's this?": tap any marked panel to hear what it is
  useEffect(() => {
    if (!explaining) return;
    document.body.classList.add("lumen-explaining");
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("[data-explain]") as HTMLElement | null;
      if (!el || (e.target as HTMLElement).closest(".lumen")) return;
      e.preventDefault();
      e.stopPropagation();
      setExplain(el.dataset.explain ?? null);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExplaining(false);
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("lumen-explaining");
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [explaining]);

  const toggle = useCallback(() => {
    if (open) {
      setOpen(false);
      setExplaining(false);
      setExplain(null);
    } else {
      setOpen(true);
      if (quiet) setMode("on");
    }
  }, [open, quiet]);

  const text = explain ?? tip?.text ?? "Tap “What’s this?” and then any panel, and I’ll tell you what it is.";
  const tone = explain ? "info" : (tip?.tone ?? "info");

  return (
    <>
      {ring && (
        <div
          className="lumen-ring"
          aria-hidden="true"
          style={{ left: ring.x - 8, top: ring.y - 8, width: ring.w + 16, height: ring.h + 16 }}
        />
      )}
      <aside ref={asideRef} className={`lumen ${place}${flip ? " flip" : ""}${open ? " open" : ""} ${tone}`} aria-live="polite" aria-label="Lumen, your guide">
        <button type="button" className="lumen-orb" onClick={toggle} aria-expanded={open} aria-label={open ? "Hide Lumen" : "Show Lumen, your guide"}>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <radialGradient id="lumen-core" cx="45%" cy="40%" r="60%">
                <stop offset="0" stopColor="#fff7e6" />
                <stop offset="0.35" stopColor="#ffd08a" />
                <stop offset="0.75" stopColor="#ff9a3c" />
                <stop offset="1" stopColor="#ff6a2b" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle className="halo" cx="32" cy="32" r="30" fill="url(#lumen-core)" opacity="0.35" />
            <circle cx="32" cy="32" r="18" fill="url(#lumen-core)" />
            <g className="eyes">
              <ellipse cx="26" cy="31" rx="2.4" ry="3.4" fill="#3a1a05" />
              <ellipse cx="38" cy="31" rx="2.4" ry="3.4" fill="#3a1a05" />
            </g>
            <path d="M27 38 q5 4 10 0" stroke="#3a1a05" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <div className="lumen-bubble" role="status">
            <p className="lumen-name">
              Lumen <span>{explain ? "what this is" : (tip?.title ?? "your guide")}</span>
            </p>
            <p className="lumen-text">{text}</p>
            <div className="lumen-actions">
              <button type="button" onClick={() => (explaining ? (setExplaining(false), setExplain(null)) : setExplaining(true))} aria-pressed={explaining}>
                {explaining ? "Done" : "What’s this?"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setExplaining(false);
                  setMode("quiet");
                }}
              >
                Hide
              </button>
            </div>
            {explaining && !explain && <p className="lumen-hint">Tap any glowing panel.</p>}
          </div>
        )}
      </aside>
    </>
  );
}
