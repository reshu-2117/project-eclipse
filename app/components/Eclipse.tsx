"use client";

import { useEffect, type CSSProperties } from "react";
import Hud from "./Hud";
import Hero from "./Hero";
import Network from "./Network";
import OrbitalSection from "./OrbitalSection";
import Transmission from "./Transmission";
import BeginMission from "./BeginMission";
import LabTeaser from "./LabTeaser";
import { Crew, Footer, Systems, World } from "./Sections";

export default function Eclipse() {
  // Lantern 17 stays failing until the player brings it back; the repair itself is the game's later chapters
  const lit17 = false;

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

  const warmth = 0.06;
  const rootStyle = { "--warmth": warmth } as CSSProperties;

  return (
    <div style={rootStyle}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Hud lit17={lit17} ready={false} />
      <main id="main">
        <Hero lit17={lit17} />
        <World />
        <Network lit17={lit17} />
        <OrbitalSection lit17={lit17} />
        <Transmission />
        <BeginMission />
        <LabTeaser />
        <Systems />
        <Crew />
      </main>
      <Footer />
      <div className="grain" aria-hidden="true" />
    </div>
  );
}
