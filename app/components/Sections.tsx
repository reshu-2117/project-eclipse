import { Antenna, Chip, Craft, Instrument, Mass, Power } from "./Icons";

export function World() {
  const cells = [
    { k: "World", big: <>Eclipse-01</>, p: "A rogue planet. No star, no orbit around a sun. Just drift." },
    { k: "Light source", big: <>24 <em>Lanterns</em></>, p: "Orbital stations that hold back the dark for the surface below." },
    { k: "Threat", big: <>Ice debris</>, p: "Frozen fragments crossing the Lantern ring. One hit is enough." },
    { k: "At stake", big: <>Life, <em>below</em></>, p: "Traces of life under the ice, and they depend on the light." },
  ];
  return (
    <section className="world" id="world" aria-label="The world of Eclipse-01">
      <div className="wrap world-grid">
        {cells.map((c) => (
          <div className="world-cell reveal" key={c.k}>
            <span className="eyebrow">{c.k}</span>
            <span className="big">{c.big}</span>
            <p>{c.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const SYSTEMS = [
  { n: "01", Icon: Craft, t: "Spacecraft", p: "The platform everything rides on. Orbiter or flyby decides how long you can stay." },
  { n: "02", Icon: Instrument, t: "Instruments", p: "What you carry decides what you learn: heat, structure, or chemistry." },
  { n: "03", Icon: Power, t: "Power", p: "No sun means no solar panels. Every watt has to be brought along." },
  { n: "04", Icon: Mass, t: "Mass & budget", p: "Each instrument adds weight, and every kilogram costs fuel and money." },
  { n: "05", Icon: Antenna, t: "Communication", p: "Data has to make it home across the dark. Bigger antenna, heavier craft." },
  { n: "06", Icon: Chip, t: "Mission simulation", p: "Fly your design before you commit to it. The simulator is calibrating.", sim: true },
];

export function Systems() {
  return (
    <section className="section" id="systems" aria-labelledby="systems-title">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            Mission architecture <b>{"//"}</b> Six systems
          </p>
          <h2 className="display" id="systems-title">
            One mission. <em>Every system connected.</em>
          </h2>
          <p className="lede">
            Change one system and the others move with it. That&apos;s the real puzzle of mission design, and the
            heart of the game.
          </p>
        </div>
        <div className="systems reveal">
          {SYSTEMS.map(({ n, Icon, t, p, sim }) => (
            <article className="sys" key={n}>
              <span className="node" aria-hidden="true" />
              <div className="sys-top">
                <Icon size={26} />
                <span>{n}</span>
              </div>
              <h4>{t}</h4>
              <p>{p}</p>
              {sim && (
                <div className="calibrating" aria-hidden="true">
                  <i />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const CREW = [
  {
    i: "R",
    name: "Reshma",
    role: "Mission lead · Engineering",
    p: "Leads the team and builds the game, turning the world and its systems into something you can play.",
  },
  {
    i: "N",
    name: "Nitish",
    role: "Story · World-building",
    p: "Wrote the world of Eclipse-01: the Lanterns, the dark, and the engineer sent to bring the light back.",
  },
  {
    i: "S",
    name: "Shunmukh",
    role: "Research · Science",
    p: "Grounds the fiction in real science, from rogue planets to what a spacecraft actually needs out there.",
  },
];

export function Crew() {
  return (
    <section className="section" id="crew" aria-labelledby="crew-title" style={{ paddingTop: 40 }}>
      <div className="wrap">
        <div className="section-head reveal">
          <p className="eyebrow">
            Team Project Eclipse <b>{"//"}</b> NASA Space Apps
          </p>
          <h2 className="display" id="crew-title">
            The crew.
          </h2>
        </div>
        <div className="crew">
          {CREW.map((m) => (
            <article className="member reveal" key={m.name}>
              <span className="avatar" aria-hidden="true">
                {m.i}
              </span>
              <span className="role">{m.role}</span>
              <h4>{m.name}</h4>
              <p>{m.p}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <p className="display reveal">
          Humanity, <em>continued.</em>
        </p>
        <div className="foot-meta">
          <p>
            PROJECT ECLIPSE · Built for the NASA Space Apps Challenge: Space Mission Design Game. Eclipse-01, its
            Lanterns and all mission data are fictional.
          </p>
          <p>
            Not affiliated with or endorsed by NASA or JPL. Planet, starfield and debris textures are procedurally
            generated. Fonts: Inter, JetBrains Mono, Cormorant Garamond (SIL Open Font License).
          </p>
        </div>
      </div>
    </footer>
  );
}
