import "./review.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Review the game — Project Eclipse",
  description: "Every part of Project Eclipse in one list. Open any part directly, without playing through the rest.",
};

const PARTS: {
  n: string;
  name: string;
  what: string;
  look: string[];
  href: string;
  cta: string;
}[] = [
  {
    n: "1",
    name: "Opening and briefing",
    what: "A narrated five-scene opening about a world with no sunrise, then the Director's briefing: what we do not know, and the five meters the game is played on.",
    look: ["Do the scenes and the voice set the mood?", "Are the five meters clear?", "Is the briefing too long?"],
    href: "/mission?start=opening",
    cta: "Open the opening",
  },
  {
    n: "2",
    name: "The Wick: build your ship",
    what: "Pick a hull, an engine, power, a shield, sensors and a kit. Every part has a price in mass, power or credits, and the numbers move live.",
    look: ["Can you see what each part costs?", "Is the readiness review clear?", "Do the five starter packages help a first-timer?"],
    href: "/mission?start=hangar",
    cta: "Open the hangar",
  },
  {
    n: "3",
    name: "Route and flight",
    what: "Choose a route, then fly to Lantern 17 yourself in 3D. Light your burns, dodge the ice, and dock.",
    look: ["Are the controls easy to learn?", "Is the ice dodge fair?", "Does the route choice feel like a real trade-off?", "Does the Time control (1×, 5×, 10×, Max) make docking quick enough?"],
    href: "/mission?start=flight",
    cta: "Open the flight",
  },
  {
    n: "4",
    name: "The Station Mission",
    what: "You are docked at Lantern 17. Walk the station in 3D, then follow the guided steps: look around, investigate, fix problems, prove it, tell the world, and make the big decision.",
    look: ["Does the coach tell you what to do next?", "Are the words easy for a teenager?", "Is the big decision clear?"],
    href: "/station?demo=1",
    cta: "Open the station",
  },
  {
    n: "5",
    name: "The debrief (the ending)",
    what: "How the mission went, in plain words: five check cards, the moments that mattered, what you could have done better, the real hardware behind each part, and a button to replay with one change.",
    look: ["Do you understand why you got that ending?", "Is the advice useful?", "Would you replay it?"],
    href: "/station?demo=debrief",
    cta: "Open the debrief",
  },
  {
    n: "0",
    name: "The Mission Lab",
    what: "The proof page: every number in the game re-derived from real physics, the three ships against the five routes, nine crews that fly whole missions, and all eight endings.",
    look: ["Do the proofs make the science feel real?", "Are the charts easy to read?"],
    href: "/lab",
    cta: "Open the Lab",
  },
];

export default function ReviewPage() {
  return (
    <div className="rvw">
      <header className="rvw-top">
        <Link href="/" className="rvw-brand">
          <span aria-hidden="true" /> PROJECT ECLIPSE
        </Link>
        <Link href="/mission" className="rvw-play">
          Play the whole game <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main id="main" className="rvw-main">
        <p className="rvw-eyebrow">Review the game</p>
        <h1>
          Every part, <em>one click away.</em>
        </h1>
        <p className="rvw-lede">
          Project Eclipse has several parts. Each button below opens that exact part, so you do not have to play through the rest to see it. Turn your sound and voice on: the Director speaks in most parts.
        </p>

        <ol className="rvw-list">
          {PARTS.map((p) => (
            <li key={p.n}>
              <span className="rvw-n" aria-hidden="true">
                {p.n}
              </span>
              <div className="rvw-body">
                <h2>{p.name}</h2>
                <p>{p.what}</p>
                <p className="rvw-look">
                  <b>Look for:</b> {p.look.join(" · ")}
                </p>
              </div>
              <Link href={p.href} className="rvw-open">
                {p.cta} <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ol>

        <section className="rvw-fb">
          <h2>How to tell us what you think</h2>
          <p>
            Say the part number and what you felt. For example: <b>&ldquo;Part 4: I did not understand step 3,&rdquo;</b> or <b>&ldquo;Part 3: the ice dodge was too hard.&rdquo;</b> Short and specific is best.
          </p>
        </section>
      </main>
    </div>
  );
}
