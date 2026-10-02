# Buildathon submission texts

Texts for the HackQuest submission form of the Arbitrum Open House buildathon, one section per field. Every text is at most 300 characters, so it fits the fields that limit length. Field labels may differ slightly on the live form; the content maps one to one.

## Project name

ConsensMed Verify

## Tagline

Publicly verifiable authenticity for medical documents, with no medical data on-chain.

## Problem

A PDF proves nothing about itself. A medical letter can be edited, or withdrawn and corrected after it was issued. The only way to know is to ask the issuer, which is slow, depends on the issuer being reachable, and usually means sharing the document yet again.

## Solution

Each document carries a random ID as a QR code. The issuer registers the ID and the file's SHA-256 on Arbitrum. Anyone holding the file can check in seconds that it is authentic and whether it is still valid, revoked or replaced, without an account and without contacting the issuer.

## How it works

The ID is generated first and printed in the document; the finished file is then hashed and the pair is registered. verify(docId, hash) answers VALID, MISMATCH, REVOKED, SUPERSEDED or NOT_FOUND. The verification page hashes the file in the browser; the file is never uploaded.

## Why Arbitrum

A document's state changes over time: it can be revoked or replaced. That state must be readable by anyone, without trusting the issuer's servers. In our testnet runs a transaction cost about 0.000003 ETH, which makes per-document registration realistic for a clinic.

## What was built during the Buildathon

Everything in the repository: the ConsensMedVerify contract with full test coverage, its deployment on Arbitrum Sepolia with verified source, the public verification page, a demo that generates synthetic PDFs with QR codes and runs the full lifecycle, and a threat model.

## Contract address

0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285 (Arbitrum Sepolia, chain id 421614)

## Explorer link

https://sepolia.arbiscan.io/address/0x6F0aDfD3ef7befac17A6165A9Db07BFd54C2d285

## Frontend link

https://minije.github.io/consensmed-anchor/verify/

## Repository

https://github.com/MiniJe/consensmed-anchor

## How a judge can verify it

Open the frontend link and choose any file: it reports "Not registered". The demo video shows the full cycle. The Issued, Revoked and Superseded events of our demo run are on the explorer. To reproduce it end to end, deploy your own instance as the README describes.

## Privacy

No personal or medical data is on-chain. The contract stores only fixed-size values: a random ID, a SHA-256 fingerprint, a timestamp, a status and the issuer address. It has no text fields, so identifying data cannot be written to it even by mistake.

## Known limits

Testnet only and not audited. One key is both owner and submitter in the demo. The registry proves a file is the one an address registered, not that its content is true or who is behind the address. One transaction per document, no batching. The platform integration is private.

## Next steps

Separate the owner (multisig) from submitters, publish issuer addresses through a trusted channel, batch registrations, self-host the page's library with integrity hashes, and connect the registry to the document flows of the ConsensMed platform.
