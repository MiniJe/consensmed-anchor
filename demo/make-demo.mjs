// Builds synthetic PDF documents with a QR code and walks them through the registry:
// issue, verify, alter, revoke, supersede. Outputs go to demo/out/ (never tracked).
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

const CONTRACT = process.env.ARB_ANCHOR_CONTRACT ?? "0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285";
const RPC_URL = process.env.ARB_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const VERIFY_URL = process.env.VERIFY_URL ?? "https://minije.github.io/consensmed-anchor/verify/";
const CAST = process.env.CAST_BIN ?? "cast";
const SIGNER = process.env.ARB_SUBMITTER_KEY;

const SYNTHETIC_NOTICE = "DATE SINTETICE — fără date de pacient";
const STATUS = ["NOT_FOUND", "VALID", "MISMATCH", "REVOKED", "SUPERSEDED"];
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const STATE_FILE = path.join(OUT_DIR, "demo-state.json");

const newDocId = () => "0x" + randomBytes(32).toString("hex");
const sha256Hex = (bytes) => "0x" + createHash("sha256").update(bytes).digest("hex");
const verifyUrl = (docId) => `${VERIFY_URL}?id=${docId}`;

function cast(args) {
  const run = spawnSync(CAST, args, { encoding: "utf8" });
  if (run.error) throw new Error(`cannot run ${CAST}: ${run.error.message}`);
  return { ok: run.status === 0, stdout: run.stdout.trim(), stderr: run.stderr.trim() };
}

function failureText(run) {
  const raw = run.stderr || run.stdout;
  try {
    return JSON.parse(raw).errors.map((e) => e.message).join("; ");
  } catch {
    return raw;
  }
}

function send(signature, ...params) {
  if (!SIGNER) throw new Error("ARB_SUBMITTER_KEY is not set in the environment of this process");
  // cast has no environment variable for a raw key, so it is passed as an argument to the local
  // child process only; it is never printed, and it is scrubbed from any error text.
  const run = cast(["send", CONTRACT, signature, ...params, "--rpc-url", RPC_URL, "--private-key", SIGNER, "--json"]);
  if (!run.ok) throw new Error(`${signature} was refused: ${failureText(run).replaceAll(SIGNER, "<redacted>")}`);
  const receipt = JSON.parse(run.stdout);
  if (receipt.status !== "0x1") throw new Error(`${signature} reverted in transaction ${receipt.transactionHash}`);
  console.log(`  tx ${signature.split("(")[0]}: ${receipt.transactionHash}`);
  return receipt.transactionHash;
}

function verifyOnChain(docId, contentHash) {
  const run = cast(["call", CONTRACT, "verify(bytes32,bytes32)(uint8)", docId, contentHash, "--rpc-url", RPC_URL]);
  if (!run.ok) throw new Error(`verify call failed: ${run.stderr}`);
  return STATUS[Number(run.stdout)];
}

// The standard PDF fonts have no "ă": the base letter is drawn and the breve is added as a path.
function drawRomanian(page, text, { x, y, size, font, color }) {
  let cursor = x;
  for (const ch of text) {
    const base = ch === "ă" ? "a" : ch;
    page.drawText(base, { x: cursor, y, size, font, color });
    const width = font.widthOfTextAtSize(base, size);
    if (base !== ch) {
      const r = size * 0.16;
      page.drawSvgPath(`M ${-r} 0 Q 0 ${size * 0.22} ${r} 0`, {
        x: cursor + width / 2,
        y: y + size * 0.74,
        borderColor: color,
        borderWidth: size * 0.07,
      });
    }
    cursor += width;
  }
}

async function buildPdf({ docId, title, lines }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setSubject(SYNTHETIC_NOTICE);
  pdf.setKeywords([SYNTHETIC_NOTICE, "ConsensMed Verify demo"]);
  pdf.setProducer("consensmed-anchor demo");

  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ink = rgb(0.09, 0.13, 0.17);
  const muted = rgb(0.36, 0.41, 0.46);
  const warn = rgb(0.7, 0.15, 0.12);

  page.drawText("ConsensMed Verify", { x: 56, y: 770, size: 22, font: bold, color: ink });
  page.drawText(title, { x: 56, y: 742, size: 14, font: regular, color: ink });
  page.drawRectangle({ x: 56, y: 696, width: 483, height: 28, borderColor: warn, borderWidth: 1.2 });
  drawRomanian(page, SYNTHETIC_NOTICE, { x: 66, y: 705, size: 12, font: bold, color: warn });
  page.drawText("SYNTHETIC DATA: no patient data. Generated for a public demo.", {
    x: 56, y: 676, size: 10, font: regular, color: muted,
  });

  let y = 636;
  for (const line of lines) {
    page.drawText(line, { x: 56, y, size: 12, font: regular, color: ink });
    y -= 20;
  }

  const qr = await pdf.embedPng(
    await QRCode.toBuffer(verifyUrl(docId), { errorCorrectionLevel: "M", margin: 2, width: 600 }),
  );
  page.drawImage(qr, { x: 56, y: 150, width: 180, height: 180 });
  page.drawText("Scan to verify this document", { x: 252, y: 300, size: 13, font: bold, color: ink });
  page.drawText("The page compares this file with the public registry", { x: 252, y: 280, size: 10, font: regular, color: muted });
  page.drawText("on Arbitrum. The file never leaves your browser.", { x: 252, y: 266, size: 10, font: regular, color: muted });
  page.drawText("Document ID", { x: 56, y: 122, size: 9, font: bold, color: muted });
  page.drawText(docId, { x: 56, y: 108, size: 8, font: mono, color: ink });
  page.drawText(VERIFY_URL, { x: 56, y: 92, size: 8, font: mono, color: muted });

  return Buffer.from(await pdf.save());
}

// One byte changes inside the binary comment of the PDF header, so the copy still opens normally.
function alterOneByte(bytes) {
  const altered = Buffer.from(bytes);
  const secondLine = altered.indexOf(0x0a) + 1;
  const index = altered[secondLine] === 0x25 ? secondLine + 1 : altered.length - 1;
  altered[index] ^= 0x01;
  return altered;
}

async function makeDocument(file, title, lines) {
  const docId = newDocId();
  const bytes = await buildPdf({ docId, title, lines });
  writeFileSync(path.join(OUT_DIR, file), bytes);
  return { file, docId, contentHash: sha256Hex(bytes), url: verifyUrl(docId), bytes };
}

async function runDemo() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  const body = (kind) => [
    `Document type: ${kind}`,
    `Generated: ${stamp}`,
    "Issuer: ConsensMed demo (Arbitrum Sepolia testnet)",
    "Subject: none. This document describes no real person.",
  ];

  console.log("1. Original document: issue");
  const original = await makeDocument("01-original.pdf", "Demo medical letter", body("demo medical letter"));
  send("issue(bytes32,bytes32)", original.docId, original.contentHash);

  console.log("2. Altered copy of the original: one byte changed, nothing sent on-chain");
  const alteredBytes = alterOneByte(original.bytes);
  writeFileSync(path.join(OUT_DIR, "02-original-ALTERED.pdf"), alteredBytes);
  const altered = { file: "02-original-ALTERED.pdf", docId: original.docId, contentHash: sha256Hex(alteredBytes), url: original.url };

  console.log("3. Document issued by mistake: issue, then revoke");
  const revoked = await makeDocument("03-revoked.pdf", "Demo letter issued by mistake", body("demo letter, later revoked"));
  send("issue(bytes32,bytes32)", revoked.docId, revoked.contentHash);
  send("revoke(bytes32,uint8)", revoked.docId, "1");

  console.log("4. Document with a newer version: issue both, then supersede");
  const oldVersion = await makeDocument("04-superseded-v1.pdf", "Demo treatment summary, version 1", body("demo summary, version 1"));
  const newVersion = await makeDocument("05-replacement-v2.pdf", "Demo treatment summary, version 2", body("demo summary, version 2"));
  send("issue(bytes32,bytes32)", oldVersion.docId, oldVersion.contentHash);
  send("issue(bytes32,bytes32)", newVersion.docId, newVersion.contentHash);
  send("supersede(bytes32,bytes32)", oldVersion.docId, newVersion.docId);

  const expected = [
    [original, "VALID"],
    [altered, "MISMATCH"],
    [revoked, "REVOKED"],
    [oldVersion, "SUPERSEDED"],
    [newVersion, "VALID"],
  ];
  console.log("\nVerification read back from the contract:");
  let failures = 0;
  const documents = expected.map(([doc, want]) => {
    const got = verifyOnChain(doc.docId, doc.contentHash);
    if (got !== want) failures += 1;
    console.log(`  ${got === want ? "ok  " : "FAIL"} ${doc.file.padEnd(24)} ${got.padEnd(10)} (expected ${want})`);
    return { file: doc.file, docId: doc.docId, contentHash: doc.contentHash, url: doc.url, expected: want, onChain: got };
  });

  writeFileSync(STATE_FILE, JSON.stringify({ contract: CONTRACT, rpcUrl: RPC_URL, generatedAt: stamp, documents }, null, 2));
  console.log(`\nFiles and ${path.basename(STATE_FILE)} are in ${OUT_DIR}`);
  console.log(`Open the QR link of the original: ${original.url}`);
  if (failures > 0) throw new Error(`${failures} document(s) did not reach the expected state`);
}

// Sends the original a second time: the registry must refuse it.
function reissue() {
  const first = JSON.parse(readFileSync(STATE_FILE, "utf8")).documents[0];
  try {
    send("issue(bytes32,bytes32)", first.docId, first.contentHash);
  } catch (err) {
    if (!err.message.includes("was refused")) throw err;
    console.log(`Duplicate refused, as expected.\n${err.message}`);
    return;
  }
  throw new Error("the duplicate was accepted: the registry did not refuse it");
}

try {
  if (process.argv.includes("--reissue")) reissue();
  else await runDemo();
} catch (err) {
  console.error(`\nDemo failed: ${err.message}`);
  process.exit(1);
}
