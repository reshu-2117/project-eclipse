"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Hud from "./Hud";
import Hero from "./Hero";
import Network from "./Network";
import OrbitalSection from "./OrbitalSection";
import Transmission from "./Transmission";
import MissionDesigner, { type CraftId, type ObjectiveId } from "./MissionDesigner";
import LabTeaser from "./LabTeaser";
import { Crew, Footer, Systems, World } from "./Sections";

export default function Eclipse() {
  const [obj, setObj] = useState<ObjectiveId | null>(null);
  const [craft, setCraft] = useState<CraftId | null>(null);
  const [lit17, setLit17] = useState(false);

  // Scroll reveal
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // The page warms up as the player makes choices and relights the Lantern.
  const warmth = 0.06 + (obj ? 0.05 : 0) + (craft ? 0.05 : 0) + (lit17 ? 0.12 : 0);
  const rootStyle = { "--warmth": warmth } as CSSProperties;

  return (
    <div style={rootStyle}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Hud lit17={lit17} ready={!!obj && !!craft} />
      <main id="main">
        <Hero lit17={lit17} />
        <World />
        <Network lit17={lit17} />
        <OrbitalSection lit17={lit17} />
        <Transmission />
        <MissionDesigner
          obj={obj}
          craft={craft}
          lit17={lit17}
          onObj={setObj}
          onCraft={setCraft}
          onAuthorise={() => setLit17(true)}
        />
        <LabTeaser />
        <Systems />
        <Crew />
      </main>
      <Footer />
      <div className="grain" aria-hidden="true" />
    </div>
  );
}
