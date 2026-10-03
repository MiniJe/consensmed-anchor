// Checks that every published sample declares itself synthetic in its PDF metadata.
// Usage: node check-samples.mjs <folder with the sample PDFs>
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { SYNTHETIC_NOTICE } from "./document.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node check-samples.mjs <folder>");
  process.exit(2);
}

const samples = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
if (samples.length === 0) {
  console.error(`no PDF files in ${dir}`);
  process.exit(2);
}

let failures = 0;
for (const name of samples) {
  let subject;
  try {
    subject = (await PDFDocument.load(readFileSync(path.join(dir, name)))).getSubject();
  } catch (err) {
    subject = `unreadable: ${err.message}`;
  }
  const ok = subject === SYNTHETIC_NOTICE;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(28)} Subject: ${subject}`);
}
process.exit(failures === 0 ? 0 : 1);
