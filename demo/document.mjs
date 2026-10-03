// Builds one synthetic consent form the way the ConsensMed platform would issue it for a clinic:
// header, consent sections, a mock signature and a QR code that opens the verification page.
// Everything in it is fictional; the notice below is printed on the page and stored in the metadata.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { LineCapStyle, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export const SYNTHETIC_NOTICE = "DATE SINTETICE — fără date de pacient";

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");
const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];

const NAVY = rgb(0.075, 0.102, 0.294);
const INDIGO = rgb(0.165, 0.216, 0.525);
const TEAL = rgb(0, 0.51, 0.455);
const WHITE = rgb(1, 1, 1);
const INK = rgb(0.09, 0.13, 0.17);
const MUTED = rgb(0.36, 0.41, 0.46);
const RULE = rgb(0.82, 0.85, 0.88);
const WARN = rgb(0.7, 0.15, 0.12);

const LEFT = 56;
const WIDTH = 483;
const RIGHT = LEFT + WIDTH;

const SECTIONS = [
  ["1. Scopul prelucrării",
    "Clinica Demo prelucrează datele persoanei vizate pentru programarea, acordarea și documentarea serviciilor medicale solicitate."],
  ["2. Categoriile de date",
    "Date de identificare și de contact și date privind starea de sănătate, strict în măsura necesară scopului de mai sus."],
  ["3. Durata păstrării",
    "Datele se păstrează pe durata prevăzută de lege pentru documentele medicale, apoi se șterg sau se anonimizează."],
  ["4. Drepturile persoanei vizate",
    "Acces, rectificare, ștergere, restricționare, portabilitate și opoziție. Consimțământul poate fi retras oricând, fără a afecta legalitatea prelucrării făcute înainte de retragere."],
];

const roundedRect = (side, r) =>
  `M ${r} 0 H ${side - r} A ${r} ${r} 0 0 1 ${side} ${r} V ${side - r} A ${r} ${r} 0 0 1 ${side - r} ${side} ` +
  `H ${r} A ${r} ${r} 0 0 1 0 ${side - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;

// The ConsensMed mark, drawn in a 512-unit square: an open "C" with a capsule entering its gap.
function drawLogo(page, { x, top, size }) {
  const at = { x, y: top, scale: size / 512 };
  const round = { borderLineCap: LineCapStyle.Round };
  page.drawSvgPath(roundedRect(512, 112), { ...at, color: NAVY });
  page.drawSvgPath("M 361 155 A 145 145 0 1 0 361 357", { ...at, ...round, borderColor: WHITE, borderWidth: 58 });
  page.drawSvgPath("M 280.6 282.3 L 379.4 229.7", { ...at, ...round, borderColor: TEAL, borderWidth: 68 });
  page.drawSvgPath("M 280.6 282.3 L 300 272", { ...at, ...round, borderColor: WHITE, borderWidth: 68, borderOpacity: 0.25 });
  page.drawSvgPath("M 314 226 L 346 286", { ...at, borderColor: WHITE, borderWidth: 4, borderOpacity: 0.5 });
}

// Finder (7 cells) and alignment (5 cells) patterns stay solid and single-coloured: readers locate
// the code by them, and a lighter centre next to navy is binarised as "light" by some decoders.
function drawTarget(page, { x, top, cell, cells }) {
  const layer = (inset, color, radius) =>
    page.drawSvgPath(roundedRect((cells - 2 * inset) * cell, radius * cell), {
      x: x + inset * cell,
      y: top - inset * cell,
      color,
    });
  layer(0, NAVY, cells === 7 ? 2 : 1.2);
  layer(1, WHITE, cells === 7 ? 1.2 : 0.6);
  layer(2, NAVY, cells === 7 ? 0.9 : 0.5);
}

function alignmentCentres(version, n) {
  if (version < 2) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const axis = [6];
  for (let pos = n - 7; axis.length < count; pos -= step) axis.splice(1, 0, pos);
  const last = n - 7;
  return axis
    .flatMap((r) => axis.map((c) => [r, c]))
    .filter(([r, c]) => !((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)));
}

// Dots instead of squares, rounded finder patterns and the logo in the centre. The logo hides
// modules, so the code uses the highest error-correction level to stay readable.
function drawQr(page, text, { x, top, size }) {
  const { modules, version } = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = modules.size;
  const quiet = 2;
  const cell = size / (n + 2 * quiet);
  const left = x + quiet * cell;
  const upper = top - quiet * cell;
  const logoCells = 2 * Math.floor(n * 0.115) + 1;
  const logoStart = (n - logoCells) / 2;

  const within = (r, c, r0, c0, side) => r >= r0 && r < r0 + side && c >= c0 && c < c0 + side;
  const inLogo = (r, c) => within(r, c, logoStart, logoStart, logoCells);
  const finders = [[0, 0], [0, n - 7], [n - 7, 0]];
  const alignments = alignmentCentres(version, n).filter(
    ([r, c]) => !inLogo(r - 2, c - 2) && !inLogo(r - 2, c + 2) && !inLogo(r + 2, c - 2) && !inLogo(r + 2, c + 2),
  );
  const reserved = (r, c) =>
    inLogo(r, c) ||
    finders.some(([r0, c0]) => within(r, c, r0, c0, 7)) ||
    alignments.some(([r0, c0]) => within(r, c, r0 - 2, c0 - 2, 5));

  page.drawRectangle({ x, y: top - size, width: size, height: size, color: WHITE });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules.get(r, c) || reserved(r, c)) continue;
      page.drawCircle({
        x: left + (c + 0.5) * cell,
        y: upper - (r + 0.5) * cell,
        size: cell * 0.45,
        color: (r * 7 + c * 13) % 5 < 2 ? INDIGO : NAVY,
      });
    }
  }
  for (const [r, c] of finders) drawTarget(page, { x: left + c * cell, top: upper - r * cell, cell, cells: 7 });
  for (const [r, c] of alignments) {
    drawTarget(page, { x: left + (c - 2) * cell, top: upper - (r - 2) * cell, cell, cells: 5 });
  }
  drawLogo(page, {
    x: left + (logoStart + 0.5) * cell,
    top: upper - (logoStart + 0.5) * cell,
    size: (logoCells - 1) * cell,
  });
}

function wrap(text, font, size, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}

// Draws wrapped text and returns the baseline of the line that would follow it.
function paragraph(page, text, { x, y, width, font, size, color }) {
  let cursor = y;
  for (const line of wrap(text, font, size, width)) {
    page.drawText(line, { x, y: cursor, size, font, color });
    cursor -= size * 1.38;
  }
  return cursor;
}

function checkbox(page, label, checked, { y, font }) {
  page.drawRectangle({ x: LEFT, y: y - 1.5, width: 9, height: 9, borderColor: INK, borderWidth: 0.8 });
  if (checked) {
    page.drawSvgPath("M 1.6 4.6 L 4 7 L 7.8 1.8", { x: LEFT, y: y + 7.5, borderColor: TEAL, borderWidth: 1.5 });
  }
  page.drawText(label, { x: LEFT + 16, y, size: 10, font, color: INK });
}

function signature(page, { x, y, caption, signed, fonts }) {
  if (signed) {
    page.drawSvgPath("M 0 0 C 9 -24 16 14 26 -5 S 41 -22 50 -1 S 66 13 77 -9 S 95 -15 112 3", {
      x: x + 8, y: y + 12, borderColor: INDIGO, borderWidth: 1.1, borderLineCap: LineCapStyle.Round,
    });
  }
  page.drawLine({ start: { x, y }, end: { x: x + 190, y }, thickness: 0.6, color: MUTED });
  page.drawText(caption, { x, y: y - 12, size: 9, font: fonts.regular, color: MUTED });
}

function drawHeader(page, consent, fonts) {
  const { regular, bold } = fonts;
  drawLogo(page, { x: LEFT, top: 802, size: 34 });
  page.drawText("ConsensMed", { x: LEFT + 44, y: 782, size: 18, font: bold, color: NAVY });
  page.drawText("Document emis prin platforma ConsensMed", { x: LEFT + 44, y: 770, size: 9, font: regular, color: MUTED });
  const rightAligned = (text, y, size, font, color) =>
    page.drawText(text, { x: RIGHT - font.widthOfTextAtSize(text, size), y, size, font, color });
  rightAligned("Clinica Demo", 784, 12, bold, INK);
  rightAligned("clinică fictivă, pentru demonstrație", 771, 9, regular, MUTED);
  page.drawLine({ start: { x: LEFT, y: 756 }, end: { x: RIGHT, y: 756 }, thickness: 0.8, color: RULE });

  page.drawText("Consimțământ pentru prelucrarea datelor cu caracter personal", { x: LEFT, y: 728, size: 15, font: bold, color: INK });
  page.drawText(`Regulamentul (UE) 2016/679 (GDPR)  ·  Nr. ${consent.number}, versiunea ${consent.version}`, {
    x: LEFT, y: 712, size: 10, font: regular, color: MUTED,
  });

  page.drawRectangle({ x: LEFT, y: 676, width: WIDTH, height: 24, borderColor: WARN, borderWidth: 1.2 });
  page.drawText(SYNTHETIC_NOTICE, { x: LEFT + 10, y: 683.5, size: 12, font: bold, color: WARN });
  page.drawText("Synthetic data: no patient data. Generated for a public demo of ConsensMed Verify.", {
    x: LEFT, y: 663, size: 9, font: regular, color: MUTED,
  });

  const issued = new Date(consent.issuedAt);
  const fields = [
    ["OPERATOR", "Clinica Demo", LEFT],
    ["PERSOANA VIZATĂ", "Pacient Demo", LEFT + 170],
    ["DATA EMITERII", `${issued.getUTCDate()} ${MONTHS[issued.getUTCMonth()]} ${issued.getUTCFullYear()}`, LEFT + 340],
  ];
  for (const [label, value, x] of fields) {
    page.drawText(label, { x, y: 640, size: 8, font: bold, color: MUTED });
    page.drawText(value, { x, y: 626, size: 11, font: regular, color: INK });
  }
  page.drawText(`Scenariu demo: ${consent.scenario}`, { x: LEFT, y: 606, size: 9, font: regular, color: MUTED });
}

function drawVerification(page, { docId, url, verifyUrl, network }, fonts) {
  const { regular, bold, mono } = fonts;
  const x = LEFT + 220;
  const width = RIGHT - x;
  // 200 pt keeps each module above 3 pt, the size at which the dotted code decoded reliably.
  drawQr(page, url, { x: LEFT, top: 248, size: 200 });
  page.drawText("Verifică autenticitatea documentului", { x, y: 226, size: 12, font: bold, color: INK });
  let y = paragraph(page,
    `Scanează codul sau deschide ${new URL(verifyUrl).host} și alege fișierul. Pagina compară fișierul cu registrul public de pe ${network}; fișierul nu părăsește browserul.`,
    { x, y: 210, width, font: regular, size: 9.5, color: INK });
  y = paragraph(page, "Scan the code, or open the page and choose this file. The file never leaves your browser.",
    { x, y: y - 4, width, font: regular, size: 9, color: MUTED });
  page.drawText("ID DOCUMENT", { x, y: 104, size: 8, font: bold, color: MUTED });
  page.drawText(docId, { x, y: 92, size: 6.6, font: mono, color: INK });
  page.drawText(verifyUrl, { x, y: 78, size: 8, font: mono, color: MUTED });
}

export async function buildPdf({ docId, url, verifyUrl, consent, network = "Arbitrum Sepolia" }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Consimțământ GDPR ${consent.number}, versiunea ${consent.version} (demo)`);
  pdf.setSubject(SYNTHETIC_NOTICE);
  pdf.setKeywords([SYNTHETIC_NOTICE, "ConsensMed Verify demo"]);
  pdf.setAuthor("Clinica Demo (fictivă)");
  pdf.setProducer("consensmed-anchor demo");

  const embed = (file) => pdf.embedFont(readFileSync(path.join(FONT_DIR, file)), { subset: true });
  const fonts = {
    regular: await embed("SourceSans3-Regular.ttf"),
    bold: await embed("SourceSans3-Bold.ttf"),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  const { regular, bold } = fonts;
  const page = pdf.addPage([595, 842]);

  drawHeader(page, consent, fonts);

  let y = 580;
  for (const [heading, text] of SECTIONS) {
    page.drawText(heading, { x: LEFT, y, size: 10.5, font: bold, color: INK });
    y = paragraph(page, text, { x: LEFT, y: y - 14, width: WIDTH, font: regular, size: 10, color: INK }) - 7;
  }
  page.drawText("5. Opțiuni exprimate", { x: LEFT, y, size: 10.5, font: bold, color: INK });
  checkbox(page, "Sunt de acord cu prelucrarea datelor mele în scopul descris la punctul 1.", true, { y: y - 16, font: regular });
  checkbox(page, "Sunt de acord să primesc notificări despre programări prin canalele platformei.", consent.notifications, {
    y: y - 32, font: regular,
  });

  signature(page, { x: LEFT, y: 296, caption: "Pacient Demo — semnătură fictivă", signed: true, fonts });
  signature(page, { x: LEFT + 293, y: 296, caption: "Clinica Demo — reprezentant fictiv", signed: false, fonts });

  drawVerification(page, { docId, url, verifyUrl, network }, fonts);

  const footer = `${SYNTHETIC_NOTICE}  ·  ConsensMed Verify, testnet preview pe ${network}`;
  page.drawText(footer, { x: (595 - regular.widthOfTextAtSize(footer, 8)) / 2, y: 30, size: 8, font: regular, color: MUTED });

  return Buffer.from(await pdf.save());
}
