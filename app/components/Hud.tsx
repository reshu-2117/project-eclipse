"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EclipseMark } from "./Icons";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function Hud({ lit17, ready }: { lit17: boolean; ready: boolean }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = `T+ ${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  const status = lit17 ? "RELIT" : ready ? "REPAIR READY" : "DEGRADED";
  const dotCls = lit17 ? "dot dot-amber" : ready ? "dot dot-ice" : "dot dot-ember";

  return (
    <header className="hud">
      <div className="wrap hud-inner">
        <a className="brand" href="#top" aria-label="Project Eclipse, back to top">
          <EclipseMark />
          <span>PROJECT ECLIPSE</span>
        </a>

        <div className="telemetry" aria-label="Mission telemetry">
          <span className="t-hide-sm">
            <strong suppressHydrationWarning>{clock}</strong>
          </span>
          <span className="t-status" aria-live="polite">
            <i className={dotCls} aria-hidden="true" />
            LANTERN 17 · <strong>{status}</strong>
          </span>
          <span className="t-hide-md">
            L-17 OUTPUT <strong>{lit17 ? "100" : "61"}%</strong>
          </span>
          <span className="t-hide-md">
            ICE IMPACT <strong>{lit17 ? "AVERTED" : "T−36 H"}</strong>
          </span>
        </div>

        <nav className="nav" aria-label="Sections">
          <a href="#world">World</a>
          <a href="#network">Lanterns</a>
          <a href="#orbit">Orbit</a>
          <a href="#briefing">Briefing</a>
          <Link href="/mission">Mission</Link>
          <Link href="/lab">Lab</Link>
          <a href="#crew">Crew</a>
        </nav>
      </div>
    </header>
  );
}
