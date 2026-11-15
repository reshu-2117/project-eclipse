import Link from "next/link";

const FACTS = [
  { big: "3", small: "hulls: the fast Courier, the balanced Tender, the heavy Hauler" },
  { big: "24", small: "parts, and every one has a price in mass, power or credits" },
  { big: "100", small: "credits to spend, and a hard limit when you run out" },
];

export default function BeginMission() {
  return (
    <section className="section" id="mission" aria-labelledby="begin-title">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            Mission 001 <b>{"//"}</b> The Wick
          </p>
          <h2 className="display" id="begin-title">
            Your ship. <em>Your trade-offs.</em>
          </h2>
          <p className="lede">
            The mission starts at the Wick, the orbital dock at 300 km. Pick a hull, an engine, power, a shield,
            sensors and a service kit, and watch each kilogram cost you speed. Then pass the readiness review and
            launch.
          </p>
        </div>
        <div className="lt-stats reveal">
          {FACTS.map((f) => (
            <div key={f.big}>
              <b>{f.big}</b>
              <span>{f.small}</span>
            </div>
          ))}
        </div>
        <div className="reveal" style={{ marginTop: 32 }}>
          <Link className="btn btn-lantern" href="/mission">
            Enter the Wick <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className="section-head reveal" style={{ marginTop: 72 }}>
          <p className="eyebrow">
            Mission 002 <b>{"//"}</b> Lantern 17
          </p>
          <h2 className="display">
            Find out what <em>really</em> happened.
          </h2>
          <p className="lede">
            After the flight, you dock at Lantern 17. In the Station Mission you look around, search six zones for clues, fix what is broken, prove the real cause, warn the other Lanterns, and make one big decision. It is written in plain words, a coach tells you what to do next, and it takes about five minutes.
          </p>
          <div style={{ marginTop: 8 }}>
            <Link className="btn btn-lantern" href="/station?demo=1">
              Try the Station Mission <span aria-hidden="true">↗</span>
            </Link>{" "}
            <Link className="btn btn-ghost" href="/station?demo=debrief">
              See the ending (the debrief) <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
