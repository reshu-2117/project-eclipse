const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  Header, ImageRun, ExternalHyperlink, LevelFormat, AlignmentType, ShadingType,
} = require("docx");

const SCRATCH = "/tmp/claude-0/-home-user-project-eclipse/c8e57803-a42d-5859-ac82-97e17e75cb4b/scratchpad";
const FONT = "Arial";
const SZ = 21;

// ---------- run helpers ----------
const t = (text, o = {}) => new TextRun({ text, font: FONT, size: SZ, ...o });
const b = (text, o = {}) => t(text, { bold: true, ...o });
const it = (text, o = {}) => t(text, { italics: true, ...o });
const hi = (text) => t(text, { shading: { type: ShadingType.CLEAR, fill: "FFFF00", color: "auto" }, bold: true });
const link = (url, label) =>
  new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text: label || url, font: FONT, size: SZ, color: "0563C1", underline: {} })],
  });

// ---------- paragraph helpers ----------
const para = (children, o = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 80, line: 264 }, ...o });
const gap = () => new Paragraph({ children: [t("")], spacing: { after: 40 } });
const label = (text) => para([b(text)], { spacing: { before: 120, after: 60 }, keepNext: true });
const bullet = (children, level = 0) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [children],
    numbering: { reference: "bul", level },
    spacing: { after: 60, line: 264 },
  });
const step = (children) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [children],
    numbering: { reference: "steps", level: 0 },
    spacing: { before: 40, after: 60, line: 264 },
  });

// a bullet heading, like the template's "● High Level Summary"
const heading = (text) =>
  new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 20 })],
    numbering: { reference: "dot", level: 0 },
    spacing: { before: 280, after: 120 },
    keepNext: true,
  });

// a bordered answer box, like the template's text boxes
const BOX_W = 9360;
const line = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
const box = (children) =>
  new Table({
    width: { size: BOX_W, type: WidthType.DXA },
    columnWidths: [BOX_W],
    indent: { size: 360, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: BOX_W, type: WidthType.DXA },
            borders: { top: line, bottom: line, left: line, right: line },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children,
          }),
        ],
      }),
    ],
  });

// ---------- content ----------
const HLS = [
  para([b("Project Name :")], { spacing: { after: 40 } }),
  para([b("Project Eclipse:"), t(" A Space Mission Design Game Where Every Choice Costs Something")]),
  gap(),
  para([b("High-Level Summary")], { spacing: { after: 60 } }),
  para([
    t(
      "NASA’s Space Mission Design Game challenge asks for a game where players design, manage and simulate a complete space mission. Project Eclipse answers it with a single-player, story-led mission on Eclipse-01, a fictional sunless rogue planet kept alive by 24 orbital fusion-light stations called Lanterns. Lantern 17 is failing (61% output and falling) and a huge ice fragment is on its way. The player is one engineer among 300 crews. They build a spacecraft inside a 100-credit budget, choose a route, survive random events, inspect the station, earn proof of what is really wrong, make one hard decision, and send what they found to the whole network.",
    ),
  ]),
  para([
    t(
      "Every choice must gain something and cost something, and the costs come from real physics rather than lookup tables: the ideal rocket equation (a heavier shield means less Δv), Hohmann and fast transfers (speed is bought with fuel), plane-change costs, communication time (file size ÷ link speed), and the push from laser ablation that lets focused light nudge ice. The world is fictional, so every number in the game is tagged ",
    ),
    b("REAL"),
    t(", "),
    b("GAME VALUE"),
    t(" or "),
    b("FICTION"),
    t(", and players can see where the science ends and the story begins."),
  ]),
  para([
    b("What we built: "),
    t(
      "a complete, tested mission engine (hulls and parts, five routes, eight event cards, Lantern 17’s six zones, clues and competing explanations, the test beam, the big choice, the broadcast and eight endings); the Mission Lab, a live proof page that runs that engine in the browser (ten handbook numbers re-derived, three ships against five routes, nine scripted crews with interactive charts, all eight endings, and the game’s data laid open); the playable mission: a narrated opening and a briefing, then the Wick, where the player builds a ship from three hulls and 24 parts on a live blueprint and passes a readiness review, then a route screen and a 3D flight to Lantern 17 that the player pilots themselves under real two-body gravity (the flight computer plots every burn from the physics, eight animated event cards interrupt the journey, a tracked ice fragment must be dodged, and the last kilometre is flown on thrusters to a soft capture), and work at the station itself, outside in first person with a thermal visor (a survey, five ways to inspect each of six zones, repairs, an evidence board with six clues, a controlled test shown in 3D, the network broadcast, the big choice, the ending, and a debrief in plain words with Replay with one change); a guided Station Mission page for new players, with a coach that suggests the next move; and the front end, with a WebGL planet lit only by its 24 Lanterns, the same planet and Lantern network shown on the flight map and the Lab in the phase the mission is in (failing, in the Eclipse, dark or restored), a 3D orbit simulation of Lantern 17 and a Lantern network board.",
    ),
  ]),
  para([
    b("Why it matters: "),
    t(
      "students memorise trade-offs from a textbook, and almost nobody gets to feel one. After a single mission, a player can explain why every kilogram, hour and watt costs something, and why speed, evidence and time pull against each other.",
    ),
  ]),
];

const LINKS = [
  para([
    b("Demo Link: "),
    link("https://project-eclipse-new.vercel.app/lab"),
    t(" (live and interactive: every handbook number re-derived in your browser, three ships tested against five routes, and nine scripted crews flying whole missions to every ending, with a scrubbable chart of each)."),
  ]),
  para([b("Project Link: "), link("https://project-eclipse-new.vercel.app")]),
  para([b("Play the whole mission (hangar, piloted flight, docking, station walk, debrief): "), link("https://project-eclipse-new.vercel.app/mission")]),
  para([b("The Station Mission (at Lantern 17, a guided page for new players): "), link("https://project-eclipse-new.vercel.app/station?demo=1")]),
  para([
    b("Source code: "),
    link("https://github.com/reshu-2117/project-eclipse"),
    t(" (public repository; the README explains the design)."),
  ]),
];

const DETAILS = [
  label("What exactly does it do?"),
  para([
    t(
      "Project Eclipse puts the player in the role of a mission engineer on a repair-and-reconnaissance mission to Lantern 17. The designed mission has eleven stages and takes about 25 minutes: an opening and briefing; building a ship at the Wick orbital dock; choosing a launch window and route; flying the journey with random event cards; surveying Lantern 17’s six zones; pinning clues on an evidence board; running a controlled test beam; making the big choice; broadcasting the findings; and a debrief with the full decision ledger and a “Replay with one change” button.",
    ),
  ]),
  bullet([b("What the player decides: "), t("one of three hulls (Courier, Tender, Hauler); an engine, power source, shield, sensors, communications and a service kit (suits, drones, robotic arm, spare optics); a route; how to answer each event; how to inspect each zone; which repairs to make; and whether to fix the mirror, use it as a weapon, or find the clever middle.")]),
  bullet([b("Five meters run the whole game: "), t("Δv (speed budget), Energy, Time (two clocks), Evidence (0 to 100) and City light (four settlements’ reserves). Every action moves at least one of them.")]),
  bullet([b("The twist is earned, not given: "), t("the player gathers six clues, rules out two wrong explanations (“sensor error”, “something else hit it”), and only then unlocks the test that proves the real cause: Lantern 17’s cracked mirror focuses light well enough to push ice.")]),
  bullet([b("Eight endings: "), t("decided by what the player proved, what they packed and whether it arrived in time. Station, cities and crew are scored separately, because scientific success and operational success are not always the same thing.")]),
  para([b("Current status: "), t("the game engine, the Mission Lab (our live demo), the front end and the whole playable mission at /mission are built and deployed. The game opens with a narrated five-scene opening and a briefing. In the hangar a player picks a hull and parts, watches Δv, mass, energy and budget change, passes a readiness review and launches with a spoken briefing from the Director. They choose a route (time against fuel), then fly it themselves on a 3D flight deck under real two-body gravity: they light every burn, the flight computer plots each one from the physics (the burns come out at the Handbook's 376, 27, 136, 1,282 and 1,252 m/s) and re-plans if they fly it badly, and an orbit view shows their path against the plan. On the way, three random event cards appear (eight exist) and a tracked ice fragment crosses their path with a collision warning modelled on NASA's ISS practice (time of closest approach, chance of a hit against the 1-in-10,000 line, a small dodge burn); damage follows real shield ballistic limits. The last kilometre is flown on thrusters through drifting ice to a soft capture at Lantern 17's docking port, as crews approach the ISS. At the station they go outside in first person, glide along the handrails to each of the six zones, look with their own eyes or a thermal visor (the burn scar on the cracked mirror segment shows only in thermal), inspect and repair there, and fire the controlled test, which plays out in 3D with the block pushed by light. A guided Station Mission page (/station), written in plain words with a coach that suggests the next move, covers the evidence board, the explanations, the report to the network and the big choice. The debrief explains the ending in plain words, shows the moments that mattered, what they could have done better and the real-world equivalents, and offers Replay with one change against a ghost of the last run. A seven-slide demo deck summarises the project.")], { spacing: { before: 80, after: 80 } }),

  label("How does it work?"),
  step([b("Story and rules as data. "), t("Hulls, parts, routes, event cards, zones, clues and endings are plain data tables. Each row says what it gives you and what it costs you, and is tagged real, game value or fiction.")]),
  step([b("One engine, one rule for every click. "), t("step(state, action) checks the phase and the resources, updates one state object and writes a plain-English ledger line, or rejects the action with a reason and changes nothing. A run is a seed plus a list of actions, so any mission replays exactly. That powers the decision ledger, “Replay with one change” and a ghost run.")]),
  step([b("Real physics under every cost:")]),
  bullet([b("Rocket equation: "), t("Δv = Isp · g0 · ln((dry mass + fuel) ÷ dry mass), with a 10% design margin. Fuel burned for any manoeuvre comes from the same equation, so a heavier ship pays more automatically.")], 1),
  bullet([b("Orbits: "), t("a Hohmann transfer from the Wick (300 km) to Lantern 17 (1,000 km) costs 376 m/s and 49 minutes; a fast direct intercept costs 1,252 m/s and 22 minutes; a plane change costs about 128 m/s per degree (1,282 m/s for 10°); one orbit takes 105 minutes.")], 1),
  bullet([b("Power and time: "), t("life support and computers draw 3 kW; engine heaters, sensors and radios draw more; cryogenic fuel boils away about 2% every 6 hours; two clocks run (the ice arrives at hour 30, and the reactor shuts down at hour 20 if a hidden ammonia leak is not patched); and a six-hour Eclipse every 24 hours slows communications to a quarter.")], 1),
  bullet([b("Evidence and the test: "), t("a 10 kW beam for 60 seconds pushes a 482 kg ice block about 6 cm/s. How sure the player can be depends on their best sensor (camera ±60%, lidar ±15%, radar ±3%). Deflecting the 100 m station-killer grows with beam time squared, so one Lantern needs about 21 hours to move it 1.5 km. Arriving late costs the chance to save the station.")], 1),
  bullet([b("Communications: "), t("transfer time = packet size ÷ link speed. A 200 MB proof takes 1 h 44 min on a small radio and 2.7 minutes on a 10 Mbps dish.")], 1),
  step([b("Verification. "), t("59 automated tests re-derive every physics number in our Game Systems Handbook from first principles, check the rules, and play nine scripted crews through full missions to prove that all eight endings can be reached. The live Mission Lab shows ten of ten handbook numbers matching the engine.")]),
  step([b("Front end. "), t("The planet is a WebGL shader lit only by its 24 Lanterns (inverse-square falloff, a specular glint on the ice, blue subsurface scatter). The Lanterns fly a Walker-delta constellation, the pattern Galileo navigation satellites use. The 3D orbital view of Lantern 17 follows 63 objects on analytic Kepler orbits and is checked so that no two paths ever come within their safety zones.")]),

  label("What benefits does it have?"),
  bullet([b("Learning by consequence: "), t("a player feels mass against fuel, speed against safety, and power against science, instead of memorising them.")]),
  bullet([b("Honest about science: "), t("each value is tagged real, game value or fiction, and the game carries a disclaimer saying values are simplified for learning.")]),
  bullet([b("Transparent and replayable: "), t("every run is a seed plus a list of choices, and the debrief explains what each choice cost and what a better one would have cost.")]),
  bullet([b("Accessible: "), t("it runs in any modern browser with no install, the Mission Lab and the playable stages were checked at desktop and phone widths and with the keyboard alone, and the animation switches off for people who ask their device for reduced motion.")]),
  bullet([b("Extensible: "), t("balance numbers live in one file, and a new hull, part, card or ending is a new row of data.")]),

  label("What do you hope to achieve?"),
  para([
    b("Short-term: "),
    t("show judges a mission game where every cost can be traced to a real equation, with a verified engine behind it. "),
    b("Long-term: "),
    t("finish and polish every player-facing stage, then add a team mode (four roles, as the NASA brief suggests), a harder “super-Earth” difficulty, more Lanterns and more missions."),
  ]),

  label("What tools, coding languages, hardware, or software did you use to develop your project?"),
  bullet([b("Languages: "), t("TypeScript, GLSL (the planet shader), CSS.")]),
  bullet([b("Framework: "), t("Next.js 16 and React 19, styled with Tailwind CSS 4.")]),
  bullet([b("Graphics: "), t("WebGL (custom planet shader), Three.js 0.187 (orbital view), HTML canvas and SVG.")]),
  bullet([b("Testing: "), t("Vitest, plus an independent orbit-collision check (npm run verify:orbits).")]),
  bullet([b("Fonts: "), t("Cormorant Garamond, Inter and JetBrains Mono, self-hosted with Fontsource.")]),
  bullet([b("Hosting and code: "), t("GitHub and Vercel (every push to the main branch deploys). No special hardware is needed to play.")]),
  bullet([b("AI assistants: "), t("Claude (brainstorming and coding, through Claude Code), ChatGPT (research) and ElevenLabs (the Director’s, the narrator’s and the other crew’s voices). See Use of AI.")]),
];

const AI = [
  para([t("AI was used in this project and is declared here. Nothing AI-generated uses or modifies NASA logos, flags, patches or mission identifiers.")]),
  bullet([
    b("Claude (Anthropic): "),
    t(
      "used for our brainstorming sessions and for the actual web coding, through Claude Code, an AI coding assistant. After the team’s initial project scaffold, the code in the GitHub repository (the front end, the game engine and its automated tests) was written and reviewed by Claude Code, working from the team’s design documents. Each of those commits carries a Co-Authored-By trailer naming it, and the repository README declares it. Claude Code also cross-checked our physics by re-deriving the orbital and propulsion numbers independently (the tests in lib/game/__tests__) and drafted this report from our documents.",
    ),
  ]),
  bullet([b("ChatGPT (OpenAI): "), t("used for research into the real spacecraft, orbital and hazard figures behind the game’s numbers. We then checked the numbers that matter in code: our tests re-derive them from first principles.")]),
  bullet([b("Images and video: "), t("no generative AI images or video. Every visual is drawn in code (a WebGL shader, canvas and SVG) or is a procedural texture made by a script.")]),
  bullet([b("Audio: "), t("the Director’s voice lines and the other crew’s radio call are AI-generated with ElevenLabs text-to-speech, using three different voices. Each audio file says so in its metadata, the game’s start screen says so, and the README explains how they are made. All other sound (the ambient hum and the click and launch cues) is synthesised in the browser by our own code.")]),
  bullet([b("Team documents: "), t("AI assisted the brainstorming (Claude) and the research (ChatGPT) behind our World-Building Dossier, Game Systems Handbook and pitch decks.")]),
];

const NASA = [
  para([
    t("We did not ingest a downloadable NASA data file. We used NASA’s published mission data, engineering references and research as the source of every “real” number in the game, and the code tags each one (lib/game/data). The planet uses Earth’s radius (6,371 km) and gravitational parameter (398,600 km³/s²), so every orbital number is a real one."),
  ]),
  para([b("How we used it:")], { spacing: { before: 80, after: 40 }, keepNext: true }),
  bullet([b("NASA Glenn Research Center, Ideal Rocket Equation: "), t("the exact Δv and fuel-burn maths for every manoeuvre. NASA’s worked example, that a rocket going to orbit is about 90% propellant, is why “every kilogram costs fuel” is the heart of the game.")]),
  bullet([b("NASA Science, Basics of Space Flight (Ch. 4, Trajectories): "), t("the Hohmann transfer: the cheapest route is the slow one. This shapes all five route plans.")]),
  bullet([b("NASA JSC Hypervelocity Impact Technology: "), t("Whipple shield design to a strict mass budget, behind the shield trade-off (a heavier shield stops bigger debris but costs fuel).")]),
  bullet([b("NASA EMU spacesuit: "), t("about 8.5 hours of air including a 30-minute reserve, and 118 to 127 kg charged. This sets the EVA suit kit.")]),
  bullet([b("NASA SAFER jetpack: "), t("about 38 kg and about 3 m/s in total, so the jetpack option is an emergency tool, not a scooter.")]),
  bullet([b("NASA AERCam Sprint (STS-87) and Mini AERCam: "), t("the inspection drones: free-flying, surface-only scans on a small battery.")]),
  bullet([b("TriDAR (flew on three Shuttle missions): "), t("the lidar, which works from 0.5 m to over 2 km for docking.")]),
  bullet([b("NASA DSOC on Psyche: "), t("267 Mbps from about 30 million km, behind the laser communications terminal.")]),
  bullet([b("NASA DART and DRACO; OSIRIS-REx cameras (0.6 kg, 5.3 W each): "), t("the inspection camera, and the idea that an asteroid’s path can be changed. Lantern 17 asks what would happen if light, not impact, did it.")]),
  bullet([b("JWST segmented mirror: "), t("18 hexagonal segments, each aimed and reshaped by its own actuators. This is the model for the cracked mirror, “the Petals”, and the “clever middle” option.")]),
  bullet([b("Curiosity RAD and NASA’s career dose limit: "), t("about 1.8 mSv per day in deep space and a 600 mSv career limit, used for crew radiation.")]),
  bullet([b("ISS ammonia coolant-loop leaks, and reaction-wheel failures on Kepler and Dawn: "), t("the hidden coolant leak and the attitude drift at Lantern 17.")]),
  bullet([b("NASA Kilopower and MMRTG: "), t("the small-reactor and RTG power options.")]),
  bullet([b("Roman Space Telescope rogue-planet science, ISS Advanced Plant Habitat and NASA controlled-environment agriculture: "), t("the world itself: rogue planets exist, and crops grow under artificial light.")]),
  para([b("How it inspired us: "), t("the challenge asks players to design, manage and simulate a mission, and NASA’s own material shows that mission design is a chain of trade-offs. We built the game so that each trade-off is a real equation the player can feel, and the debrief links each part they flew to the real hardware it came from.")], { spacing: { before: 80, after: 80 } }),
  para([b("What we did not do: "), t("we did not process a raw NASA dataset. The “real” numbers are published figures encoded as game parameters, and anything we chose for balance is tagged as a game value in the code.")]),
];

const REFS = [
  para([b("Space agency partner data: "), t("Canadian Space Agency, Canadarm2 and Canadarm3 data sheets (Canadarm2: 17 m, about 1,497 kg; Canadarm3: 8.5 m, about 715 kg, an estimate), used for the robotic arm option (a game value of 8 m reach and 450 kg). "), link("https://www.asc-csa.gc.ca/eng/iss/canadarm2/data-sheet.asp"), t(". No ESA data was used.")]),
  para([b("Other references. "), t("The full list behind every number is in our Game Systems Handbook v2 (pages 22 to 24).")], { spacing: { before: 80, after: 40 }, keepNext: true }),
  bullet([b("Research and background:")]),
  bullet([t("Gibbings et al., Acta Astronautica (2013), laser-ablation plumes: "), link("https://www.sciencedirect.com/science/article/pii/S0094576512002718")], 1),
  bullet([t("Zhang et al., PASP (2016), remote directed-energy deflection: "), link("https://digitalcommons.calpoly.edu/stat_fac/61/")], 1),
  bullet([t("NASA Orbital Debris Program Office, protection and shielding: "), link("https://orbitaldebris.jsc.nasa.gov/protection/")], 1),
  bullet([t("NASA, growing plants in space (Advanced Plant Habitat): "), link("https://science.nasa.gov/mission/advanced-plant-habitat/")], 1),
  bullet([t("NASA, what is a planet (rogue planets): "), link("https://science.nasa.gov/exoplanets/what-is-a-planet/")], 1),
  bullet([t("NASA NTRS: AERCam Sprint "), link("https://ntrs.nasa.gov/api/citations/20150017436"), t("; ISS ammonia leak "), link("https://ntrs.nasa.gov/citations/20220010221"), t("; controlled-environment agriculture "), link("https://ntrs.nasa.gov/citations/20170011105")], 1),
  bullet([t("Johns Hopkins APL, DART impactor spacecraft: "), link("https://dart.jhuapl.edu/Mission/Impactor-Spacecraft.php")], 1),
  bullet([t("JWST User Documentation, Space Telescope Science Institute: "), link("https://jwst-docs.stsci.edu")], 1),
  bullet([t("Idaho National Laboratory, MMRTG cost report INL/EXT-16-40218: "), link("https://inldigitallibrary.inl.gov")], 1),
  bullet([t("Background on EMU, SAFER, AERCam Sprint and TriDAR: "), link("https://en.wikipedia.org/wiki/Extravehicular_Mobility_Unit"), t(", "), link("https://en.wikipedia.org/wiki/Simplified_Aid_For_EVA_Rescue"), t(", "), link("https://en.wikipedia.org/wiki/AERCam_Sprint"), t(", "), link("https://en.wikipedia.org/wiki/TriDAR")], 1),
  bullet([b("Code and tools:")]),
  bullet([t("Next.js "), link("https://nextjs.org"), t(", React "), link("https://react.dev"), t(", Tailwind CSS "), link("https://tailwindcss.com"), t(", Three.js "), link("https://threejs.org"), t(", Vitest "), link("https://vitest.dev"), t(", Fontsource "), link("https://fontsource.org"), t(", ElevenLabs "), link("https://elevenlabs.io"), t(", GitHub "), link("https://github.com"), t(", Vercel "), link("https://vercel.com")], 1),
  bullet([b("Images and text:")]),
  bullet([t("No stock photography. Textures are procedurally generated, and the story text is the team’s own (World-Building Dossier v3).")], 1),
  bullet([t("Challenge: NASA Space Apps 2026, Space Mission Design Game: "), link("https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game")], 1),
];

// ---------- document ----------
const logo = fs.readFileSync(SCRATCH + "/tpl/un2/word/media/image1.png");

const doc = new Document({
  creator: "Project Eclipse team",
  title: "Project Eclipse: Components of Project",
  description: "NASA Space Apps Challenge 2026 project components",
  styles: { default: { document: { run: { font: FONT, size: SZ } } } },
  numbering: {
    config: [
      {
        reference: "dot",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "●", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      },
      {
        reference: "bul",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "o", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } }, run: { font: "Courier New" } } },
        ],
      },
      {
        reference: "steps",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 320 } }, run: { bold: true } } }],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 2860, right: 1080, bottom: 760, left: 1440, header: 750 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: "png", data: logo, transformation: { width: 377, height: 141 }, altText: { title: "NASA International Space Apps Challenge", description: "NASA International Space Apps Challenge logo", name: "logo" } })],
            }),
          ],
        }),
      },
      children: [
        para([t("Components of Project")], { spacing: { after: 0 } }),
        para([t("2026 NASA Space Apps Challenge")], { spacing: { after: 120 } }),

        heading("High Level Summary"),
        box(HLS),
        heading("Link to Project Demo and Link to Project"),
        box(LINKS),
        heading("Project Details"),
        box(DETAILS),
        heading("Use of AI"),
        box(AI),
        heading("NASA Data"),
        box(NASA),
        heading("Space Agency Partner Data and Other Resources"),
        box(REFS),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2] || SCRATCH + "/Project_Eclipse_Components_of_Project_2026.docx";
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length);
});
