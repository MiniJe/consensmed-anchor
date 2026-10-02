// Checks that every published sample declares itself synthetic in its PDF metadata.
// Usage: node check-samples.mjs <folder with the five sample PDFs>
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { SYNTHETIC_NOTICE } from "./document.mjs";

const SAMPLES = ["01-original.pdf", "02-original-ALTERED.pdf", "03-revoked.pdf", "04-superseded.pdf", "05-replacement.pdf"];

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node check-samples.mjs <folder>");
  process.exit(2);
}

let failures = 0;
for (const name of SAMPLES) {
  let subject;
  try {
    subject = (await PDFDocument.load(readFileSync(path.join(dir, name)))).getSubject();
  } catch (err) {
    subject = `unreadable: ${err.message}`;
  }
  const ok = subject === SYNTHETIC_NOTICE;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(24)} Subject: ${subject}`);
}
process.exit(failures === 0 ? 0 : 1);
