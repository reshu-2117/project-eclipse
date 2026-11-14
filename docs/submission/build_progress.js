const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, LevelFormat, AlignmentType, ExternalHyperlink,
} = require("docx");

const OUT = process.argv[2];
const FONT = "Arial";
const AMBER = "B8741F";
const INK = "1A2433";

const t = (text, o = {}) => new TextRun({ text, font: FONT, size: 21, color: INK, ...o });
const b = (text, o = {}) => t(text, { bold: true, ...o });
const link = (url) =>
  new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, font: FONT, size: 21, color: "0563C1", underline: {} })] });
const p = (children, o = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [children], spacing: { after: 90, line: 270 }, ...o });
const h = (text) =>
  new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: 18, bold: true, color: AMBER, characterSpacing: 40 })],
    spacing: { before: 260, after: 100 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D9C9A8", space: 3 } },
  });
const bullet = (children) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [children],
    numbering: { reference: "bul", level: 0 },
    spacing: { after: 60, line: 270 },
  });

const cell = (children, w, fill) =>
  new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D6DCE5" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D6DCE5" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D6DCE5" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D6DCE5" },
    },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children,
  });

const W = [2300, 2300, 4760];
const GREEN = "E3F4E8";
const AMB = "FFF1D6";
const row = (a, bb, status, tone, c) =>
  new TableRow({
    children: [
      cell([p([b(a, { size: 20 })], { spacing: { after: 0 } })], W[0]),
      cell([p([t(bb, { size: 20 })], { spacing: { after: 0 } })], W[1]),
      cell([p([b(status + " ", { size: 20 }), t(c, { size: 20 })], { spacing: { after: 0 } })], W[2], tone),
    ],
  });
const head = (a, bb, c) =>
  new TableRow({
    tableHeader: true,
    children: [a, bb, c].map((x, i) =>
      cell([p([b(x, { size: 18, color: "FFFFFF" })], { spacing: { after: 0 } })], W[i], INK),
    ),
  });

const doc = new Document({
  creator: "Project Eclipse team",
  title: "Project Eclipse: Progress Report",
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  numbering: {
    config: [
      {
        reference: "bul",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }],
      },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1440, bottom: 1000, left: 1440 } } },
      children: [
        p([new TextRun({ text: "PROJECT ECLIPSE", font: FONT, size: 18, bold: true, color: AMBER, characterSpacing: 80 })], { spacing: { after: 40 } }),
        p([new TextRun({ text: "Progress Report", font: "Georgia", size: 48, bold: true, color: INK })], { spacing: { after: 60 } }),
        p([t("NASA Space Apps Challenge 2026 · Space Mission Design Game · Team NASA-2026-VSK-059", { color: "5C6B80", size: 19 })], { spacing: { after: 40 } }),
        p([t("Saturday, 14 November 2026 · Submission closes Sunday 15 November, 11:59 pm local time", { color: "5C6B80", size: 19 })], { spacing: { after: 160 } }),

        h("In one line"),
        p([
          b("A player can now build a ship, choose a route and fly to Lantern 17, and every number behind it is checked in public. "),
          t("The part at the station (survey, clues, the big choice and the ending) is not playable yet."),
        ]),

        h("What a player can do today"),
        bullet([t("Open the live site, read the story, and press Begin mission.")]),
        bullet([b("The Wick (hangar): "), t("pick one of 3 hulls and fit parts across 7 slots, or load a ready-made ship. The game says why when a choice is refused. A Director voice talks you through it and the ship launches.")]),
        bullet([b("Route: "), t("compare 5 routes by speed cost, time and light at arrival, on a flight map that shows the real planet and its Lantern network. Picking a route that cannot finish asks you to confirm.")]),
        bullet([b("Flight: "), t("three event cards are dealt (8 exist). Each choice shows what it cost, and another crew's distress call comes over the radio. Then you dock at Lantern 17.")]),
        bullet([b("Early endings: "), t("running out of fuel on the way ends the mission on a full result screen.")]),

        h("What we built, in order"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: W,
          rows: [
            head("Piece", "What it is", "Status"),
            row("Game engine", "The rules, in code, with a replayable run", "DONE.", GREEN, "Hulls and parts, 5 routes, 8 cards, 6 zones, clues, the test beam, the broadcast, 8 endings, the debrief. 59 automatic tests pass."),
            row("Hangar", "Build your ship (Chunk 2)", "DONE. Live.", GREEN, "Drawn blueprints, three presets, live speed, mass and budget, keyboard and phone friendly."),
            row("Route and flight", "Fly to Lantern 17 (Chunk 3)", "DONE. Live.", GREEN, "Route cards, animated flight map, 8 animated event cards, ledger, Eclipse strip, arrival."),
            row("Mission Lab", "The engine in the open, at /lab", "DONE. Live.", GREEN, "Rebuilt from scratch and polished: 10 proofs, ships against routes, 9 crews with charts, 8 endings, a data room."),
            row("Voices", "AI narration with ElevenLabs", "PARTLY.", AMB, "13 lines generated and tagged as AI in their files; 6 play in the game. The rest belong to the opening, which is not wired in."),
            row("Home page", "The first page", "DONE. Live.", GREEN, "Story fixed to match the Handbook, links into the game and the Lab, crew name spelled Shanmukh."),
            row("Paperwork", "Report and notes", "DONE.", GREEN, "NASA report draft in the official template, README with the AI declaration, handoff file, status reports."),
          ],
        }),

        h("The Mission Lab, in detail"),
        bullet([b("Proofs: "), t("10 of 10 handbook numbers re-derived by the engine, with source filters and a verdict ring.")]),
        bullet([b("Ships: "), t("three starter ships against all five routes, with a bar showing fuel against need.")]),
        bullet([b("Crews: "), t("nine scripted players fly whole missions. Results show a scrubbable mission chart, city light gauges, an ice-miss diagram and a crew-by-ending map.")]),
        bullet([b("Endings: "), t("a bar of how often each of the 8 endings happens, with the Lantern network shown in that ending's state.")]),
        bullet([b("Rules: "), t("hulls, event cards, a clickable map of Lantern 17's six zones with clue pins, and settlement reserves.")]),
        bullet([b("The planet: "), t("the same planet and Lantern network as the home page appears on the Lab and on the flight map, and changes with the mission phase (failing, Eclipse, dark, restored).")]),

        h("Not built yet"),
        bullet([b("The station: "), t("surveying, inspecting zones, repairs and finding clues. After docking, the game shows a short note and a link to the Lab.")]),
        bullet([b("Evidence board and test beam, the big choice and the broadcast, "), t("as screens. They work in the engine.")]),
        bullet([b("The ending and debrief screen "), t("inside the game. The Lab shows them, the game does not yet.")]),
        bullet([b("Opening and briefing: "), t("scenes, sound and narration exist but are not connected to a page.")]),
        bullet([b("The demo: "), t("a 7-slide deck or a 30-second video. Not made.")]),

        h("Risks and things to confirm"),
        bullet([b("Demo is required. "), t("NASA needs a separate 7-slide deck or a 30-second video, hosted publicly. This is the biggest gap. Recommendation: a 7-slide deck.")]),
        bullet([b("AI wording. "), t("NASA's rules say AI should not be used to come up with the idea. The report says Claude helped with brainstorming. The lead should confirm what that covered. The research tool is recorded as ChatGPT; please confirm that name is right.")]),
        bullet([b("NASA data. "), t("We use published NASA figures, not a downloadable dataset. Confirm that counts for the Global Award.")]),
        bullet([b("Voices. "), t("Chosen from ElevenLabs' standard voices by their descriptions. Nobody on the team has listened to them yet.")]),
        bullet([b("Licence. "), t("The repository has no LICENSE file.")]),
        bullet([b("Time. "), t("Less than a day remains. The plan is to finish the playable loop first and cut art before cutting the loop.")]),

        h("Links"),
        bullet([b("Game: "), link("https://project-eclipse-new.vercel.app/mission")]),
        bullet([b("Mission Lab: "), link("https://project-eclipse-new.vercel.app/lab")]),
        bullet([b("Home: "), link("https://project-eclipse-new.vercel.app")]),
        bullet([b("Code: "), link("https://github.com/reshu-2117/project-eclipse")]),
        p([t("Blockers: none. The one decision needed is the demo format.", { bold: true })], { spacing: { before: 140 } }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("wrote", buf.length);
});
