import Link from "next/link";
import { TEST_COUNT } from "../lab/facts";

const STATS = [
  { big: "10 of 10", small: "handbook numbers re-derived from real physics" },
  { big: String(TEST_COUNT), small: "automatic tests, all passing" },
  { big: "8", small: "endings, every one reachable" },
];

export default function LabTeaser() {
  return (
    <section className="section" id="lab" aria-labelledby="lab-title">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            Game engine <b>{"//"}</b> Running live
          </p>
          <h2 className="display" id="lab-title">
            The brain of the game, <em>running live.</em>
          </h2>
          <p className="lede">
            Before the screens come the rules. The Mission Lab runs the real engine in your browser: the rocket
            equation, five routes, eight event cards, Lantern 17&apos;s six zones and every ending. Check every ship
            against every route, or watch nine crews fly whole missions.
          </p>
        </div>
        <div className="lt-stats reveal">
          {STATS.map((s) => (
            <div key={s.big}>
              <b>{s.big}</b>
              <span>{s.small}</span>
            </div>
          ))}
        </div>
        <div className="reveal" style={{ marginTop: 32 }}>
          <Link className="btn btn-lantern" href="/lab">
            Open the Mission Lab <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
