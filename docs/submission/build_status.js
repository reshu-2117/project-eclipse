const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, LevelFormat, AlignmentType, ExternalHyperlink,
} = require("docx");

const OUT = "/tmp/claude-0/-home-user-project-eclipse/c8e57803-a42d-5859-ac82-97e17e75cb4b/scratchpad/Project_Eclipse_6PM_Status_Report.docx";
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

const W = [1500, 2500, 5360];
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
  title: "Project Eclipse: 6 PM Status Report",
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
        p([new TextRun({ text: "6 PM Status Report", font: "Georgia", size: 48, bold: true, color: INK })], { spacing: { after: 60 } }),
        p([t("NASA Space Apps Challenge 2026 · Space Mission Design Game · Team NASA-2026-VSK-059", { color: "5C6B80", size: 19 })], { spacing: { after: 40 } }),
        p([t("Saturday, 14 November 2026 · Checkpoint: Sat 6 PM", { color: "5C6B80", size: 19 })], { spacing: { after: 160 } }),

        h("In one line"),
        p([
          b("The game engine is finished and live, and the player-facing screens are behind. "),
          t("All 11 stages run end to end through the engine, but a person cannot click through them yet."),
        ]),

        h("Against the 48-hour plan"),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: W,
          rows: [
            head("Checkpoint", "Plan", "Status"),
            row("Sat 10 AM", "Kickoff", "DONE.", GREEN, "Dossier, Handbook, Build Guide and both pitch decks written. Repo and live deployment set up."),
            row("Sat 2 PM", "Formulas locked", "DONE.", GREEN, "Every handbook number is re-derived from real physics and matches the engine."),
            row("Sat 6 PM", "Loop playable", "PARTLY.", AMB, "The full loop plays through the engine (nine scripted crews, all 8 endings reachable). Human-clickable screens are not built yet."),
            row("Sat 10 PM", "All 3 budgets live", "ON TRACK.", GREEN, "Mass and fuel, time and route, and power and evidence are all live in the engine and visible in the Mission Lab."),
            row("Sun 2 AM", "Endings wired", "DONE in the engine.", GREEN, "All 8 endings are tested. Screens for them are still to build."),
          ],
        }),

        h("Done"),
        bullet([b("Game engine: "), t("hulls and parts, 5 routes, 8 event cards, Lantern 17's six zones, clues and explanations, the test beam, the big choice, the broadcast, 8 endings and the debrief.")]),
        bullet([b("Verification: "), t("53 automated tests pass. All 10 handbook numbers are re-derived live on the Mission Lab page.")]),
        bullet([b("Live demo: "), link("https://project-eclipse-new.vercel.app/lab"), t(". Deployed and confirmed loading.")]),
        bullet([b("Fixes to the plan: "), t("fast routes now trade fuel for time, the network can help deflect the ice, and discovery and survival are scored separately.")]),
        bullet([b("Bug fixed today: "), t("the debrief printed the impact hour twice. Fixed, tested and pushed.")]),
        bullet([b("NASA report draft: "), t("written in the official template, 6 pages, with the AI-use declaration. A matching AI note is in the README.")]),

        h("In progress"),
        bullet([b("Opening and briefing: "), t("scenes drawn, sound system built, narration recorded (7 lines, with a narrator voice and a Director voice, all tagged as AI-generated in their file metadata). The page is not wired up yet. The work is saved on the dev branch and is not on the live site.")]),

        h("Behind"),
        bullet([t("The hangar and every later screen are not started.")]),
        bullet([t("The homepage text still says Lantern 17 is “gone dark” and the player is “the only engineer”. The story says 61% output and one of 300 crews. The fix is queued.")]),

        h("Next, until 10 PM"),
        bullet([t("Wire the opening and briefing into a playable page.")]),
        bullet([t("Build the hangar on top of the engine, so a player can pick parts and watch Δv, mass and budget move.")]),
        bullet([t("Fix the homepage text and add a Begin mission button.")]),

        h("Risks and decisions needed"),
        bullet([b("Demo is required. "), t("NASA needs a separate 7-slide deck or a 30-second video, hosted publicly. We do not have one yet. Recommendation: a 7-slide deck.")]),
        bullet([b("AI wording. "), t("NASA's rules say AI should not be used to come up with the idea for solving the challenge. Our report says Claude helped with brainstorming. The lead should confirm what that covered and that the wording is accurate.")]),
        bullet([b("NASA data. "), t("We use published NASA figures and documents, not a downloadable dataset. NASA requires at least one NASA data or resource for a Global Award, so we should confirm this counts.")]),
        bullet([b("Time. "), t("Submission closes Sunday 15 November at 11:59 pm local time. Cutting art, not the loop, remains the plan.")]),

        h("Links"),
        bullet([b("Live site: "), link("https://project-eclipse-new.vercel.app")]),
        bullet([b("Mission Lab: "), link("https://project-eclipse-new.vercel.app/lab")]),
        bullet([b("Code: "), link("https://github.com/reshu-2117/project-eclipse")]),
        p([t("Blockers: none.", { bold: true })], { spacing: { before: 140 } }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("wrote", buf.length);
});
