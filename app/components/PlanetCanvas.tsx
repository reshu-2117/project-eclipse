"use client";

import { useEffect, useRef } from "react";
import { createPlanetRenderer, type PlanetLight, type PlanetRenderer } from "./heroPlanet";

/**
 * Eclipse-01, the same lit-by-its-Lanterns shader as the home page, as a square canvas that fills its box.
 * If WebGL isn't available the canvas stays empty and whatever the parent drew behind it shows.
 */
export default function PlanetCanvas({
  lights,
  spinRate = 0.04,
  elevation = 0.28,
  reduce = false,
  className,
}: {
  lights: PlanetLight[];
  /** radians per second */
  spinRate?: number;
  elevation?: number;
  reduce?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lightsRef = useRef(lights);
  useEffect(() => {
    lightsRef.current = lights;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const EXTENT = 1.25;
    let renderer: PlanetRenderer | null = null;
    let raf = 0;
    let disposed = false;
    const t0 = performance.now();

    const size = () => {
      const w = canvas.getBoundingClientRect().width;
      if (w > 0) renderer?.resize(w, Math.min(window.devicePixelRatio || 1, 1.5));
    };
    const draw = () => renderer?.render(lightsRef.current, reduce ? 1.1 : ((performance.now() - t0) / 1000) * spinRate);
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
        renderer = createPlanetRenderer(canvas, { elevation, roll: 0, extent: EXTENT }, img, () => {
          renderer = null;
          cancelAnimationFrame(raf);
        });
        if (!renderer) return;
        size();
        if (reduce) draw();
        else raf = requestAnimationFrame(loop);
      })
      .catch(() => {});

    const ro = new ResizeObserver(() => {
      size();
      if (reduce) draw();
    });
    ro.observe(canvas);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer?.dispose();
    };
  }, [elevation, reduce, spinRate]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
