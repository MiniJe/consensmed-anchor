# Threat model

This document states what ConsensMed Verify guarantees, what it does not, and where it can fail. It describes the proof of concept deployed on Arbitrum Sepolia; it is not an audit.

## What the chain guarantees

**Integrity.** `verify(docId, contentHash)` returns `VALID` only if the file in hand hashes to exactly the value registered for that ID. Changing a single byte gives `MISMATCH`. This rests on SHA-256 collision resistance and on the contract refusing to change a registered hash: there is no function that edits one.

**Anteriority.** `issuedAt` is the timestamp of the block that included the registration. The file existed, in that exact form, no later than that moment. The timestamp comes from the Arbitrum sequencer, so it is accurate to within the sequencer's tolerance, not to the second.

**State.** Whether a document is in force, revoked or replaced is public and current. A revoked document cannot be made valid again, and a replaced document points to its replacement. Each ID and each fingerprint can be registered once.

**Independence.** Checking a document needs only the file and a connection to any Arbitrum node. It does not depend on the issuer's systems being online, or on the verification page in this repository.

## What it does not guarantee

**That the content is true.** The registry records that an address registered a fingerprint. A wrong or fraudulent document registered by an authorised submitter verifies as `VALID`.

**Who the issuer is.** The chain shows an address. Tying that address to a real clinic is done off-chain: the issuer has to publish its address through a channel the verifier already trusts. This proof of concept does not solve that.

**That an unregistered document is fake.** `NOT_FOUND` means only that this registry has no record.

**Permanence on a testnet.** A testnet can be reset or retired. The guarantees above hold for as long as the network keeps its history.

## Why there is no personal data on-chain

Data written to a public chain cannot be corrected or erased, so nothing that identifies a person may go there. The design enforces this in three ways.

1. **The contract cannot hold it.** State and events use only fixed-size values: 32-byte IDs and fingerprints, a timestamp, a status, a one-byte reason code and an address. There are no text or variable-length fields, so a name or an identifier cannot be stored even by mistake. The CI workflow fails if such a field is ever added.
2. **The ID is random.** `docId` is 32 bytes from a cryptographic random source. It is not derived from the patient, the clinic or the document.
3. **The fingerprint is effectively salted.** The random ID is printed inside the document before the file is hashed. Someone who knows a patient's details cannot rebuild the file and test guesses against the chain, because they would also have to guess the 256-bit ID.

What remains public is metadata: how many documents an address registers, when, and how many it revokes or replaces. A deployment that finds this sensitive should spread issuance over time or register in batches.

The one-byte reason code on revocation is an issuer-defined category (for example "issued in error"). It must never encode anything about a person.

## Risks

### The submitter key

An authorised submitter can register, revoke and replace documents. If its key is stolen, the attacker can:

- register fraudulent documents that verify as `VALID`;
- revoke or replace genuine documents, which cannot be undone on-chain.

The attacker cannot alter the fingerprint of an existing document or make a revoked one valid.

Mitigations available in the contract: the owner removes the compromised submitter with `setSubmitter(address, false)`, and every action emits an event naming the submitter, so abuse is visible and attributable. Mitigations that belong to a real deployment and are not in this proof of concept: the owner should be a multisig, separate from any submitter; submitter keys should live in an HSM or a managed signer; documents registered during a compromise window need an off-chain process to identify and reissue.

In the demo deployment a single testnet key is both owner and submitter. That is acceptable for a demo and not for production.

### The verification page

- **Lookalike pages.** A forged document can carry a QR code pointing to a page that always answers "valid". The check is only as good as the address in the browser bar. Verifiers who need certainty call the contract directly.
- **Script supply chain.** The page loads one library from a CDN, pinned to an exact version. A compromised CDN could serve altered code. A production page would self-host the library with integrity hashes.
- **RPC trust.** The page believes the public RPC endpoint. A hostile endpoint could lie about the state. Anyone can repeat the call against their own node.
- **The file stays local.** The page hashes the file in the browser and sends only the ID and the fingerprint to the RPC. The RPC operator sees those two values and the caller's IP address.

### The document itself

- The fingerprint covers the file's bytes. Re-saving, printing to PDF or scanning produces a different file, which reports `MISMATCH` even though it looks the same. Verification works on the original file, not on a copy of its appearance.
- A printed copy can be checked only for state, through its QR code: the page shows whether the ID is registered, revoked or replaced, but cannot confirm the paper matches the file.

### The contract

- No upgrade path, no proxy, no funds held, no external calls. The attack surface is the access control on four functions.
- Not audited. Test coverage is complete for lines, branches and functions, which is not the same as correctness.

## Out of scope for this proof of concept

Issuer identity and key ceremony, batching of registrations, mainnet deployment, and the integration with the ConsensMed platform.
