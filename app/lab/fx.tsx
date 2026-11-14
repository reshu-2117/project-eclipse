"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "../mission/Opening";

/** things that rise into view as the page scrolls; the lab wraps these once, so every section gets the same motion */
const REVEAL = [
  ".lb-sec-head",
  ".lb-pb",
  ".lb-ship",
  ".lb-matrix-wrap",
  ".lb-cta-line",
  ".cm, .lb-crew-layout",
  ".lb-spectrum, .lb-ed",
  ".lb-tabs, .lb-panel",
  ".lb-foot p",
].join(",");

/**
 * Page-level motion for the Lab: a scroll-progress line under the nav, a warm light that follows the pointer,
 * and a staggered rise for cards and headings as they come into view. All of it is off for reduced motion.
 */
export function useLabFx(root: RefObject<HTMLDivElement | null>) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = root.current;
    if (!el || reduce) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        el.style.setProperty("--p", max > 0 ? String(Math.min(1, window.scrollY / max)) : "0");
      });
    };
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    onScroll();

    // Reveal: only things still below the fold are hidden, so nothing flashes on load.
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const scan = () => {
      const fold = window.innerHeight;
      el.querySelectorAll<HTMLElement>(REVEAL).forEach((n) => {
        if (seen.has(n)) return;
        seen.add(n);
        if (n.getBoundingClientRect().top < fold) return;
        const sibs = n.parentElement ? Array.from(n.parentElement.children) : [];
        n.style.setProperty("--d", `${Math.min(sibs.indexOf(n), 8) * 70}ms`);
        n.classList.add("rv");
        io.observe(n);
      });
    };
    scan();
    // crews and endings fill in a moment after the first paint
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
    };
  }, [root, reduce]);
}

/** A whole number that counts up the first time it is seen. */
export function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms, reduce]);
  return <span ref={ref}>{reduce ? to : v}</span>;
}
