// Renders the 7 slides to one public PDF (Project_Eclipse_Demo_Deck.pdf), so the demo link works for judges with no login.
// Run from this folder:  node build_pdf.js   (needs playwright and poppler's pdfunite)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = __dirname;
const NM = path.join(ROOT, "../../../node_modules");
const order = JSON.parse(fs.readFileSync(path.join(ROOT, "deck.json"), "utf8")).order;
// the slides point at uploaded copies (/_blob/...); the same pictures live in img/
const blob = {
  f1365d0ffea98c7330d68173ec081654: "planet.jpg",
  "726b8ff72566b495589b69ccbc8ef919": "hangar.jpg",
  "35d953184467115cb0428c2d8f5e1587": "flight.jpg",
  "9c44807238fcbf51d5f681a551265e78": "alert.jpg",
  bab6ef6cae259ce81483da20a306e3fb: "dock.jpg",
  "6dba652eeff3793e5028bca499aa14a1": "walk.jpg",
  "8676e187700f6b9b1f3f505d4ee22bac": "thermal.jpg",
  "133eb44d2e3806e139b6f6a6c728e590": "test.jpg",
  "6e300f9959241b63de5e7022e49137dc": "debrief.jpg",
};
const font = (family, file, weight, style = "normal") =>
  `@font-face{font-family:'${family}';src:url('file://${path.resolve(NM, file)}') format('woff2');font-weight:${weight};font-style:${style};}`;
const fonts = [
  font("Cormorant Garamond", "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2", 500),
  font("Cormorant Garamond", "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2", 500, "italic"),
  font("Cormorant Garamond", "@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2", 600),
  font("Inter", "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", "100 900"),
  font("JetBrains Mono", "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "100 800"),
].join("\n");
const css = fs.readFileSync(path.join(ROOT, "deck.css"), "utf8");
// the slide viewer supplies a reset and stacks the cover text above its gradient; a standalone page needs both
const print = `*{box-sizing:border-box;margin:0;padding:0}html,body{background:#070a10}
section{width:1920px;height:1080px;overflow:hidden;position:relative}
.cover>:not(.shot):not(.veil){position:relative;z-index:2}
.rise{animation:none!important;opacity:1!important;transform:none!important}aside{display:none}`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "deck-"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pdfs = [];
  for (const id of order) {
    let html = fs.readFileSync(path.join(ROOT, "slides", id + ".html"), "utf8");
    html = html.replace(/\/_blob\/([0-9a-f]+)/g, (_, h) => {
      if (!blob[h]) throw new Error("unmapped image " + h + " in " + id);
      return "file://" + path.join(ROOT, "img", blob[h]);
    });
    const file = path.join(tmp, id + ".html");
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${fonts}\n${css}\n${print}</style>${html}`);
    await page.goto("file://" + file);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const out = path.join(tmp, id + ".pdf");
    await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: "1" });
    pdfs.push(out);
    if (process.argv[2] === "png") await page.screenshot({ path: path.join(ROOT, "..", "..", "..", "..", "tmp-" + id + ".png") }).catch(() => {});
  }
  await browser.close();
  const dest = path.join(ROOT, "Project_Eclipse_Demo_Deck.pdf");
  execFileSync("pdfunite", [...pdfs, dest]);
  console.log("wrote", dest, order.length, "slides");
})();
