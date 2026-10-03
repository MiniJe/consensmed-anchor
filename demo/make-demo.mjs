// Builds synthetic consent forms with a QR code and walks them through the registry:
// issue, verify, alter, revoke, supersede. Outputs go to demo/out/ (never tracked).
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPdf } from "./document.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const SHORT_FLAG = process.argv.includes("--short");
const chainArg = process.argv.indexOf("--chain");
const CHAIN_NAME = chainArg === -1 ? "arbitrum-sepolia" : process.argv[chainArg + 1];

// Testnets only. Each chain names the variable that must declare its id, and the id itself is fixed
// here, so a wrong value in the environment stops the demo instead of redirecting it.
const CHAINS = {
  "arbitrum-sepolia": {
    label: "Arbitrum Sepolia", chainId: "421614", declaredIn: "ARB_CHAIN_ID",
    contract: process.env.ARB_ANCHOR_CONTRACT ?? "0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285",
    rpcUrl: process.env.ARB_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
    prefix: "", query: "", shortOnly: false,
  },
  robinhood: {
    label: "Robinhood Chain Testnet", chainId: "46630", declaredIn: "RH_CHAIN_ID",
    contract: process.env.RH_ANCHOR_CONTRACT,
    rpcUrl: process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com",
    prefix: "rh-", query: "&chain=robinhood", shortOnly: true,
  },
};
const CHAIN = CHAINS[CHAIN_NAME] ?? {};
const CONTRACT = CHAIN.contract;
const RPC_URL = CHAIN.rpcUrl;
// The short walk issues the original only and adds its altered copy.
const SHORT = SHORT_FLAG || CHAIN.shortOnly === true;
const VERIFY_URL = process.env.VERIFY_URL ?? "https://verify.consensmed.ro/";
const CAST = process.env.CAST_BIN ?? "cast";
const SIGNER = process.env.ARB_SUBMITTER_KEY;

const STATUS = ["NOT_FOUND", "VALID", "MISMATCH", "REVOKED", "SUPERSEDED"];
// Every real run gets its own folder: documents that are already registered are never overwritten.
const RUNS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const RUN_NAME = `run-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`;
const OUT_DIR = path.join(RUNS_DIR, DRY_RUN ? "preview" : RUN_NAME);
const STATE_NAME = "demo-state.json";
const STATE_FILE = path.join(OUT_DIR, STATE_NAME);

const sha256Hex = (bytes) => "0x" + createHash("sha256").update(bytes).digest("hex");
const verifyUrl = (docId) => `${VERIFY_URL}?id=${docId}${CHAIN.query}`;

// The ID is printed in the document. An ID with a long run of decimal digits is drawn again, so
// that nothing on the page can be mistaken for a personal identification number.
function newDocId() {
  for (;;) {
    const hex = randomBytes(32).toString("hex");
    if (!/\d{13}/.test(hex)) return "0x" + hex;
  }
}

function cast(args) {
  const run = spawnSync(CAST, args, { encoding: "utf8" });
  if (run.error) throw new Error(`cannot run ${CAST}: ${run.error.message}`);
  return { ok: run.status === 0, stdout: run.stdout.trim(), stderr: run.stderr.trim() };
}

// The key reaches cast as a plain argument, which is acceptable for a testnet key only. The demo
// therefore refuses to start unless the environment and the RPC both say the chosen testnet.
function assertTestnet() {
  if (!CHAINS[CHAIN_NAME]) {
    throw new Error(`unknown chain "${CHAIN_NAME}"; use one of: ${Object.keys(CHAINS).join(", ")}`);
  }
  const declared = process.env[CHAIN.declaredIn];
  if (declared !== CHAIN.chainId) {
    throw new Error(`${CHAIN.declaredIn} must be ${CHAIN.chainId} (${CHAIN.label}); it is ${declared ?? "not set"}`);
  }
  if (DRY_RUN) return;
  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT ?? "")) {
    throw new Error(`no registry address for ${CHAIN.label}; set it in the environment`);
  }
  const run = cast(["chain-id", "--rpc-url", RPC_URL]);
  if (!run.ok || run.stdout !== CHAIN.chainId) {
    throw new Error(`the RPC does not report chain ${CHAIN.chainId}: ${run.ok ? run.stdout : run.stderr}`);
  }
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
  if (DRY_RUN) return null;
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

// One byte changes inside the binary comment of the PDF header, so the copy still opens normally.
function alterOneByte(bytes) {
  const altered = Buffer.from(bytes);
  const secondLine = altered.indexOf(0x0a) + 1;
  const index = altered[secondLine] === 0x25 ? secondLine + 1 : altered.length - 1;
  altered[index] ^= 0x01;
  return altered;
}

async function makeDocument(name, consent) {
  const file = CHAIN.prefix + name;
  const docId = newDocId();
  const url = verifyUrl(docId);
  const bytes = await buildPdf({ docId, url, verifyUrl: VERIFY_URL, consent, network: CHAIN.label });
  writeFileSync(path.join(OUT_DIR, file), bytes);
  return { file, docId, contentHash: sha256Hex(bytes), url, bytes };
}

async function runDemo() {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  const consent = (number, version, scenario, notifications = true) => ({
    number, version, scenario, notifications, issuedAt: stamp,
  });

  console.log("1. Original document: issue");
  const original = await makeDocument("01-original.pdf", consent("DEMO-0001", 1, "document valabil."));
  send("issue(bytes32,bytes32)", original.docId, original.contentHash);

  console.log("2. Altered copy of the original: one byte changed, nothing sent on-chain");
  const alteredBytes = alterOneByte(original.bytes);
  const alteredFile = `${CHAIN.prefix}02-original-ALTERED.pdf`;
  writeFileSync(path.join(OUT_DIR, alteredFile), alteredBytes);
  const altered = { file: alteredFile, docId: original.docId, contentHash: sha256Hex(alteredBytes), url: original.url };
  if (SHORT) return finish(stamp, [[original, "VALID"], [altered, "MISMATCH"]]);

  console.log("3. Document issued by mistake: issue, then revoke");
  const revoked = await makeDocument("03-revoked.pdf", consent("DEMO-0002", 1, "document emis din eroare, apoi revocat de emitent."));
  send("issue(bytes32,bytes32)", revoked.docId, revoked.contentHash);
  send("revoke(bytes32,uint8)", revoked.docId, "1");

  console.log("4. Document with a newer version: issue both, then supersede");
  const oldVersion = await makeDocument("04-superseded.pdf", consent("DEMO-0003", 1, "versiunea 1, înlocuită ulterior de versiunea 2."));
  const newVersion = await makeDocument("05-replacement.pdf",
    consent("DEMO-0003", 2, "versiunea 2, înlocuiește versiunea 1 (acordul pentru notificări a fost retras).", false));
  send("issue(bytes32,bytes32)", oldVersion.docId, oldVersion.contentHash);
  send("issue(bytes32,bytes32)", newVersion.docId, newVersion.contentHash);
  send("supersede(bytes32,bytes32)", oldVersion.docId, newVersion.docId);

  finish(stamp, [
    [original, "VALID"],
    [altered, "MISMATCH"],
    [revoked, "REVOKED"],
    [oldVersion, "SUPERSEDED"],
    [newVersion, "VALID"],
  ]);
}

function finish(stamp, expected) {
  if (DRY_RUN) {
    console.log(`\nDry run: nothing was sent on-chain. Preview files are in ${OUT_DIR}`);
    return;
  }
  console.log(`\nVerification read back from the contract on ${CHAIN.label}:`);
  let failures = 0;
  const documents = expected.map(([doc, want]) => {
    const got = verifyOnChain(doc.docId, doc.contentHash);
    if (got !== want) failures += 1;
    console.log(`  ${got === want ? "ok  " : "FAIL"} ${doc.file.padEnd(24)} ${got.padEnd(10)} (expected ${want})`);
    return { file: doc.file, docId: doc.docId, contentHash: doc.contentHash, url: doc.url, expected: want, onChain: got };
  });

  writeFileSync(STATE_FILE, JSON.stringify({ chain: CHAIN_NAME, contract: CONTRACT, rpcUrl: RPC_URL, generatedAt: stamp, documents }, null, 2));
  console.log(`\nFiles and ${path.basename(STATE_FILE)} are in ${OUT_DIR}`);
  console.log(`Open the QR link of the original: ${expected[0][0].url}`);
  if (failures > 0) throw new Error(`${failures} document(s) did not reach the expected state`);
}

// Sends the original a second time: the registry must refuse it.
function reissue() {
  const latest = readdirSync(RUNS_DIR).filter((name) => name.startsWith("run-")).sort().at(-1);
  if (!latest) throw new Error("no earlier run found in demo/out; run the demo first");
  const first = JSON.parse(readFileSync(path.join(RUNS_DIR, latest, STATE_NAME), "utf8")).documents[0];
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
  assertTestnet();
  if (process.argv.includes("--reissue")) reissue();
  else await runDemo();
} catch (err) {
  console.error(`\nDemo failed: ${err.message}`);
  process.exit(1);
}
